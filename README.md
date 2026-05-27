# Aftertale

> AI-powered narrative engine that turns your gameplay into a personalized
> novel where **you** are the protagonist.

Roll a character, play normally, and watch Aftertale build a chapter-by-chapter
chronicle of your hero's story. Quests have permanent consequences. NPCs
remember you. Your character is *yours* — voice, backstory, beliefs, scars
and all.

**Status:** Phase 0 (Browser POC) shipped. Multi-tier launch architecture
locked 2026-05-26 — see [docs/companion-architecture.md](./docs/companion-architecture.md)
for the canonical reference, [docs/ROADMAP.md](./docs/ROADMAP.md) for build
order.

## 🌐 Live

**👉 [aftertale.gg](https://aftertale.gg/)**

The Cloudflare Pages build ships **with no API keys baked in** — on first
load you're prompted to paste your own OpenRouter key. The key is stored
in your browser's localStorage only; nothing is sent to any server but
OpenRouter itself.

Grab a key at <https://openrouter.ai/keys>.

## Supported games

**Live today for World of Warcraft.** Full capture support across:

- **Retail** (Midnight era)
- **Classic Era** (incl. Hardcore and Season of Discovery)
- **Cataclysm Classic**
- **Mists of Pandaria Classic**

Aftertale is built as a game-agnostic storytelling layer, so additional
games are on the roadmap. We avoid promising support for specific future
titles until the capture, privacy, and writing experience meet the
standard.

## What it does

- **Welcome screen** lets you start with a built-in hero (Magnus Brunn is
  shipped) or roll your own.
- **Character creation interview** generates a deep character bible (race,
  class, faction, backstory, beliefs, motivations, fears, flaws, voice,
  hero's truth).
- **Full character sheet** with portrait, faction-tinted glow, level + zone
  pills, the Hero's Truth banner, and an in-character chronicle log of
  recent deeds.
- **Multi-character roster** — switch active hero from the header, edit any
  bible in place, keep separate NPC transcripts per hero.
- **Talk to famous NPCs** — Magni Bronzebeard and Muradin first up, more
  to come. Grounded in lore + your character bible + recent chronicle
  entries. They remember you.
- **Chronicle reader** — first-class story tab. Latest-session and full-saga
  views, "so what" insight cards, chapter timeline, model-generated
  campfire recaps.
- **Scribe's Desk** — manual import/enrich/export workflow for the free
  tier. Drop in a SavedVariables file, filter events, generate the chapter,
  download the restore snippet.
- **Addon Simulator** (dev harness) — emits WoW API-shaped events from
  Classic quest-chain fixtures (`QUEST_DETAIL`, `QUEST_TURNED_IN`,
  `ZONE_CHANGED_NEW_AREA`, `COMBAT_LOG_EVENT_UNFILTERED`, etc.) and ingests
  them into the active bible. This is the bridge contract that the WoW
  addon speaks today.
- **In-game capture** via the Aftertale Lua addon at [`addon/Aftertale/`](./addon/Aftertale/).

## Quick start (local dev)

```powershell
git clone https://github.com/Aftertale-App/Aftertale.git
cd Aftertale
npm install
Copy-Item .env.example .env.local
# Optional: edit .env.local and paste your OpenRouter key. Or skip and use
# the in-app Settings panel to paste it at runtime instead.
npm run dev
```

Open <http://localhost:5180>.

## Stack

- **Phase 0** (current): Vite 6 + React 19 + TypeScript, browser-only,
  deployed to Cloudflare Pages at [aftertale.gg](https://aftertale.gg/).
- **Multi-tier launch** (in design → build): Free/BYOK (Scribe's Desk) +
  Companion (Electron daemon) + Chronicler + Loremaster, all backed by
  Supabase and OpenRouter. See [docs/companion-architecture.md](./docs/companion-architecture.md).
- **WoW addon**: capture-only Lua addon (zero network), MIT-licensed,
  shipped via CurseForge / Wago. Hands off SavedVariables to the companion
  daemon (paid tiers) or to Scribe's Desk (free tier). Supports six WoW
  clients via per-flavor TOC files.
- **LLM**: OpenRouter for both Companion (managed) and BYOK (user's key).
  One key, every model — Claude Sonnet 4.5 is the default.

## Docs

| Doc | What's in it |
| --- | --- |
| [docs/companion-architecture.md](./docs/companion-architecture.md) | **Canonical** multi-tier architecture: Free → Companion → Chronicler → Loremaster, pairing flow, OpenRouter, Supabase, privacy |
| [docs/unlock-economy.md](./docs/unlock-economy.md) | The Quill & Coin store: full unlock catalog, contextual surfacing matrix, build order, subscription-only guardrails |
| [docs/ROADMAP.md](./docs/ROADMAP.md) | Phase status, exit criteria, what's next |
| [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) | Phase 0 internals (provider contract, custom events, simulator flow). Forward-looking sections superseded by companion-architecture.md |
| [docs/COST-STRATEGY.md](./docs/COST-STRATEGY.md) | Pricing table, rate limits, spend tracker, forecasting |
| [docs/PROVIDERS.md](./docs/PROVIDERS.md) | OpenRouter direction, **Gemini thinking trap** |
| [docs/EVENT-CONTRACT.md](./docs/EVENT-CONTRACT.md) | Addon → web event schema and capture validation findings |
| [docs/DEVELOPMENT.md](./docs/DEVELOPMENT.md) | Local setup, scripts, ports, env vars, deployment |
| [docs/plan.md](./docs/plan.md) | Session-level strategy notes and locked decisions |
| [CHANGELOG.md](./CHANGELOG.md) | Notable changes + lessons learned |

## Cost / privacy

The app is built around **always-on cost tracking**. Every LLM call is logged
to localStorage with per-call cost, plus averages by task × model. The spend
bar shows live exposure based on OpenRouter's per-model pricing.

All enrichment routes through **OpenRouter** — one key, every model
(Anthropic, OpenAI, Google, etc.). Default model is Claude Sonnet 4.5; pick
any model in the catalog from the in-app picker. See
[docs/companion-architecture.md](./docs/companion-architecture.md) §8a for
the rationale.

In Phase 0, everything — your character bibles, chronicle entries, NPC chat
history, spend log, and API key — lives only in your browser's
localStorage. There is no backend, no telemetry, no account. Paid tiers
(Companion and above) introduce Supabase-backed cloud sync as an explicit
opt-in tied to subscription.

## License

MIT — see [`LICENSE`](./LICENSE).

The Lua addon under `addon/Aftertale/` is also MIT, and ships with its own
`LICENSE` file inside the bundle so it rides along when zipped for
CurseForge / Wago. Keeping the addon free + open is a hard constraint of
the project (see [`docs/plan.md`](./docs/plan.md) §1).

---

*World of Warcraft is a trademark of Blizzard Entertainment, Inc. Aftertale
is not affiliated with, endorsed, sponsored, or specifically approved by
Blizzard Entertainment.*
