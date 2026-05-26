# Cost Strategy

> **2026-05-26:** All enrichment routes through OpenRouter. The pricing
> table below is the curated set we ship in the model picker. Verify
> against <https://openrouter.ai/models> when updating.

Aftertale makes many LLM calls per play session. To keep this
sustainable (and avoid surprise bills), the app ships with always-on cost
tracking from day one.

## TL;DR

- **Default to Claude Sonnet 4.5** (via OpenRouter) — best-in-class for
  long-form narrative, sensible price.
- **All calls cost-accounted** at OpenRouter's published rates (pass-through
  from the underlying provider).
- **Spend tracker is always-on** and records every call.

## Pricing table (verified against OpenRouter 2026-05-26)

| Pricing key                                  | Model slug                       | Input $/1M | Cached $/1M | Output $/1M |
| -------------------------------------------- | -------------------------------- | ---------- | ----------- | ----------- |
| `openrouter/anthropic/claude-sonnet-4.5`     | `anthropic/claude-sonnet-4.5`    | 3.00       | 0.30        | 15.00       |
| `openrouter/anthropic/claude-opus-4.5`       | `anthropic/claude-opus-4.5`      | 15.00      | 1.50        | 75.00       |
| `openrouter/openai/gpt-5`                    | `openai/gpt-5`                   | 1.25       | 0.125       | 10.00       |
| `openrouter/google/gemini-2.5-pro`           | `google/gemini-2.5-pro`          | 1.25       | 0.31        | 10.00       |
| `openrouter/google/gemini-2.5-flash`         | `google/gemini-2.5-flash`        | 0.30       | 0.075       | 2.50        |

The pricing table in `src/pricing.ts` is the **single source of truth**.
Update it when OpenRouter publishes new rates or you add a model.

### Cost calculation

```
cost = (inputTokens − cachedInputTokens) / 1M × inputPer1M
     + cachedInputTokens                    / 1M × cachedInputPer1M
     + outputTokens                         / 1M × outputPer1M
```

`cachedInputTokens` comes from `prompt_tokens_details.cached_tokens` in the
OpenRouter response — only populated for providers/models that support
prompt caching (currently Anthropic models, etc.).

## Workload sizing (rough envelope)

Per hour of typical play, using **Claude Sonnet 4.5** as the default:

| Task        | Calls/hr | Avg input tok | Avg output tok | Cost/hr   |
| ----------- | -------: | ------------: | -------------: | --------: |
| NPC chat    |     ~120 |          ~800 |           ~150 |    ~$0.56 |
| Bible gen   |       ~2 |        ~3,000 |           ~600 |    ~$0.04 |
| Summary     |      ~10 |        ~2,500 |           ~400 |    ~$0.14 |
| **Total**   |     ~132 |             — |              — | **~$0.74** |

A four-hour play session: **~$2.96**. Higher than the old Gemini-Flash
default (~$0.28) but the narrative quality jump is the trade we made when
locking the architecture (see `companion-architecture.md` §8a). Cost-sensitive
users can swap the default to `openrouter/google/gemini-2.5-flash` in the
picker — same workload runs ~$0.13/hr.

This is also why **Companion+ tiers will route higher-tier models** (Opus,
GPT-5) and Free/BYOK users pick their own cost ceiling.

## Rate limit strategy

OpenRouter is a gateway, not a model — rate limits depend on the underlying
provider and your OpenRouter account tier. For Phase 0 BYOK we rely on
OpenRouter's defaults:

1. **Exponential backoff** on 429s.
2. **Spend bar in the tray** shows live cost so you know when you're burning.
3. **Soft cap → hard stop** at user-configurable daily $ budget (future).
4. **Tier-specific defaults** at managed Companion+ launch (cheaper models
   for higher-volume workloads).

## Spend tracker

Lives in `src/lib/spendTracker.ts`. Backed by `localStorage`, keyed per day
(`at.spend.YYYY-MM-DD`). Records are kept until the user manually exports,
resets, or purges old history from the spend bar.

### Public API

```ts
recordUsage(record: Omit<UsageRecord, 'id'>): UsageRecord
loadRecentRecords(days?: number): UsageRecord[]
loadTodayRecords(): UsageRecord[]
purgeOldRecords(): number
computeAverages(records: UsageRecord[]): TaskAverages[]
sumCost(records: UsageRecord[]): number
exportCsv(records: UsageRecord[]): string
```

`recordUsage()` dispatches a `at:usage-updated` CustomEvent on `window` so
in-tab listeners refresh immediately. (The browser's native `storage` event
only fires on OTHER tabs — this was a real bug we hit.)

### Averages by task × model

`computeAverages()` groups records by `${task}::${model}` and returns:

```ts
interface TaskAverages {
  task: TaskType;
  model: string;
  calls: number;
  avgInput: number;
  avgCached: number;
  avgOutput: number;
  avgCostUsd: number;
  totalCostUsd: number;
}
```

Once we have a few hours of real play data, we can predict "1 hour of
leveling = $X" with confidence per model.

### Spend bar UI

`SpendBar.tsx` is mounted in `App.tsx` and always visible:

- **Top strip** (collapsed): Today total / Session total / Last call cost
- **Expanded panel**: averages table grouped by task::model, CSV export button
- **Updates live** via the `at:usage-updated` CustomEvent

## Privacy / training data

- **OpenRouter** itself does not train on your data. They proxy to the
  underlying provider.
- **Each underlying provider** has its own data-use policy. Anthropic does
  not train on API data by default. OpenAI does not train on API data by
  default. Google's data-use depends on which key/tier the upstream is
  configured for.
- For Companion+ managed tiers we'll publish an explicit privacy page
  naming the current provider chain (see `companion-architecture.md` §8a).
