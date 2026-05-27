# Gemini billing discrepancy — investigation log

> **Status (2026-05-26): RESOLVED via rearchitecture.** Direct
> `GeminiProvider` / `AnthropicProvider` SDKs were removed and the LLM
> layer collapsed to **OpenRouter-only**. The discrepancy investigated below
> was specific to the now-removed `@google/genai` SDK and is no longer
> reachable through any code path Aftertale runs. The notes are preserved as
> institutional knowledge — if a future provider integration exhibits a
> similar counter ↔ bill gap, the experimental method below (controlled
> cost-probe + per-call usage diff) is the playbook.
>
> See [`PROVIDERS.md`](./PROVIDERS.md) for the current LLM layer and
> [`companion-architecture.md`](./companion-architecture.md) §8a for the
> strategic rationale.

---

> **Context:** this log feeds the round-trip rework tracking in [`ROADMAP.md`](./ROADMAP.md#known-issues--round-trip-rework-2026-05-25-stress-test). Cost numbers come from the same 567-call enrichment run that surfaced the lossy-blob issues there.

## The gap

- **Big enrichment run (2026-05-25):** spend tracker said **$0.19**, Google billed **$0.27** (~41% delta).
- 567 enrichment calls against `gemini-2.5-flash`.
- Dashboard confirmed model is 2.5 Flash, not 3.x; pricing in `src/pricing.ts` ($0.25 in / $1.50 out per 1M) matches Google's current published rates exactly.
- AI Studio dashboard for that window also showed ~10× `503 ServiceUnavailable` errors.

## What's NOT the cause (ruled out)

1. **Thinking tokens.** `GeminiProvider.ts:43` *(file removed 2026-05-26 — see "Resolution" below)* set `thinkingConfig.thinkingBudget = 0`. Lines 61-65 also counted `thoughtsTokenCount` toward output (with explicit comment about Google billing it). The probe confirms `thoughtsTokenCount` is literally absent from `usageMetadata` when the budget is 0.
2. **Wrong pricing constants.** Re-verified against https://ai.google.dev/gemini-api/docs/pricing.
3. **Cached-input drift.** `cachedContentTokenCount` is 0 in the probe response.
4. **Hidden SKU tier.** Probe shows `serviceTier: "standard"` — not enterprise, not preview.
5. **Counter math error.** Local sum ($0.1913) reproduces exactly: 282K × 0.25/1M + 80K × 1.50/1M = $0.1912.

## Controlled experiment — cost-probe.mjs (2026-05-26T03:52Z)

- 25 deterministic identical calls, prompt = `"Reply with exactly the four words: \"the quick brown fox\". No punctuation, no other text."`
- `maxOutputTokens: 20`, `temperature: 0`, `thinkingBudget: 0`
- Result: 25/25 succeeded, every call exactly `in=21, visOut=4, thoughts=0, total=25`.
- Local-computed cost: **$0.000281** (525 input tokens + 100 output tokens).
- Report file: `cost-probe-2026-05-26T03-52-33-630Z.json`

## AI Studio Logs export — limitation discovered

- File: `Token Test_datasets_QRkVaor1Kf2ymtkPu7DgkAk_2026-05-26T03_53_44.432Z.jsonl`
- 24 of 25 calls captured (#25 likely still propagating at export time).
- ⚠️ **The dataset JSONL export strips `usageMetadata` entirely.** Only carries `request`, `response`, `turnId`, `datasetIds`, `createTime`, `responseStatus`, `apiSource`.
- The Logs **UI** still shows per-call token counts when you click a turn — but there's no bulk export of server-side token counts.
- Means we can't diff client-vs-server tokens at scale from this export; would have to click through each `responseId` manually.

## Remaining hypotheses

1. **Failed-request billing.** The 10× 503s on the big run may have been billed but not counted client-side. (Big-run only — probe had 0 failures, so this won't show up in the $0.000281 reconciliation.)
2. **SDK under-reports tokens.** The probe's $0.000281 should match Cloud Billing exactly. If it doesn't, the gap is structural in `@google/genai` v2.6.0.
3. **SKU drift between AI Studio dashboard and Cloud Billing.** Possible but unlikely given probe's `serviceTier: "standard"`.

## Next step — billing reconciliation (check ~2026-05-26 evening)

When the Cloud Billing dashboard updates the 2026-05-26 line for the SKU **Generative Language API – Gemini 2.5 Flash**:

| Billed amount | Conclusion |
| --- | --- |
| **= $0.000281** | Counter is honest. The $0.27 vs $0.19 gap on the big run came from elsewhere — most likely 503 retries getting billed. Next mitigation: count failed requests' tokens too. |
| **> $0.000281** | SDK is under-reporting `usageMetadata`. Gap is structural and applies to every call. Next: open a bug against `@google/genai` and add a fudge factor or server-side reconciliation. |
| **= 0** | Probe spend was below billing rounding threshold ($0.01). Re-run with `--calls 500` to force a measurable amount. |

## How to re-run

```powershell
cd C:\Users\snobl\Source\Aftertale
npm run cost:probe                      # 25 calls, $0.0003-ish
npm run cost:probe -- --calls 500       # ~$0.006, measurable on billing dashboard
```

Reports land in `tools/cost-probe-reports/` (gitignored).
