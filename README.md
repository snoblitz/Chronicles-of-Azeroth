# Aftertale

> AI-powered narrative engine that turns World of Warcraft into a personalized
> RPG novel where **you** are the protagonist.

Roll a character, live the adventure in-game, and watch the app build a
chapter-by-chapter chronicle of your hero's story in real time. Quests have
permanent consequences. NPCs remember you. Your character is *yours* — voice,
backstory, beliefs, scars and all.

**Status:** Phase 0 (Browser POC) — **complete ✅**. Multi-tier launch architecture **locked 2026-05-26** — see [docs/companion-architecture.md](./docs/companion-architecture.md) for the canonical reference, [docs/ROADMAP.md](./docs/ROADMAP.md) for build order.

## 🌐 Live demo

**👉 [aftertale-app.github.io/Aftertale](https://aftertale-app.github.io/Aftertale/)**

The Pages build ships **with no API keys baked in** — when you open it for
the first time you'll be prompted to paste your own OpenRouter key. The key
is stored in your browser's localStorage only; nothing is sent to any server
but OpenRouter itself.

Grab one here: <https://openrouter.ai/keys>

## What it does

- **Welcome screen** lets you start with a built-in hero (Magnus Brunn is
  shipped) or roll your own.
- **Character creation interview** generates a deep character bible (race,
  class, faction, backstory, beliefs, motivations, fears, flaws, voice, core
  quote).
- **Full character sheet** with portrait, faction-tinted glow, level + zone
  pills, and an in-character chronicle log of recent deeds.
- **Multi-character roster** — switch active hero from the header, edit any
  bible in place, keep separate NPC transcripts per hero.
- **Talk to famous NPCs** — Magni Bronzebeard and Muradin first up, more
  dwarves coming. Grounded in WoW lore + your character bible + recent
  chronicle entries. They remember you.
- **Chronicle reader** — first-class story tab. Latest-session and full-saga
  views, "so what" insight cards, chapter timeline, model-generated campfire
  recaps.
- **Addon Simulator** (dev harness) — emits WoW API-shaped events from
  Classic quest-chain fixtures (`QUEST_DETAIL`, `QUEST_TURNED_IN`,
  `ZONE_CHANGED_NEW_AREA`, `COMBAT_LOG_EVENT_UNFILTERED`, etc.) and ingests
  them into the active bible. This is the bridge contract that the Phase 2
  Lua addon will speak.
- **In-game integration** (Phase 2) via a Lua addon extending YUI-Dialogue.

## Quick start (local dev)

```powershell
git clone https://github.com/Aftertale-App/Aftertale.git
cd Aftertale
npm install
Copy-Item .env.example .env.local
# Edit .env.local, paste your OpenRouter API key — or skip this and use the
# in-app Settings panel to paste it at runtime instead.
npm run dev
```

Open <http://localhost:5180>.

## Stack

- **Phase 0** (complete): Vite 6 + React 19 + TypeScript, browser-only,
  deployed to GitHub Pages
- **Multi-tier launch** (in design → build): Free/BYOK (Scribe's Desk) +
  Companion (Electron daemon) + Chronicler + Loremaster, all backed by
  Supabase and OpenRouter. See [docs/companion-architecture.md](./docs/companion-architecture.md).
- **WoW addon**: capture-only Lua addon (zero network), MIT-licensed,
  shipped via CurseForge/Wago. Hands off SavedVariables to the companion
  daemon (paid tiers) or to Scribe's Desk (free tier).
- **LLM**: OpenRouter for both Companion (managed) and BYOK (user's key).

## Docs

| Doc | What's in it |
| --- | --- |
| [docs/companion-architecture.md](./docs/companion-architecture.md) | **Canonical** multi-tier architecture: Free → Companion → Chronicler → Loremaster, pairing flow, OpenRouter, Supabase, privacy |
| [docs/unlock-economy.md](./docs/unlock-economy.md) | The Quill & Coin store: full unlock catalog, contextual surfacing matrix, build order, subscription-only guardrails |
| [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) | Phase 0 internals (provider contract, custom events, simulator flow). Phase 1/2 sections superseded by companion-architecture.md |
| [docs/COST-STRATEGY.md](./docs/COST-STRATEGY.md) | Pricing table, rate limits, spend tracker, forecasting |
| [docs/PROVIDERS.md](./docs/PROVIDERS.md) | LLM provider interface, OpenRouter direction, **Gemini thinking trap** |
| [docs/DEVELOPMENT.md](./docs/DEVELOPMENT.md) | Local setup, scripts, ports, env vars, deployment |
| [docs/ROADMAP.md](./docs/ROADMAP.md) | Phase status, exit criteria, what's next |
| [CHANGELOG.md](./CHANGELOG.md) | Notable changes + lessons learned |

## Cost / privacy

The app is built around **always-on cost tracking**. Every LLM call is logged
to localStorage with per-call cost, plus averages by task × model. The spend
bar shows live exposure based on OpenRouter's per-model pricing.

All enrichment routes through **OpenRouter** — one key, every model
(Anthropic, OpenAI, Google, etc.). Default model is Claude Sonnet 4.5; you
can pick any model in the catalog from the in-app picker. See
[docs/companion-architecture.md](./docs/companion-architecture.md) §8a for
the rationale.

Everything — your character bibles, chronicle entries, NPC chat history,
spend log, and API key — lives only in your browser's localStorage. There
is no backend, no telemetry, no account.

## License

MIT — see [`LICENSE`](./LICENSE).

The Lua addon under `addon/Aftertale/` is also MIT, and ships with
its own `LICENSE` file inside the bundle so it rides along when zipped for
CurseForge / Wago. Keeping the addon free + open is a hard constraint of
the project (see [`docs/plan.md`](./docs/plan.md) §1).

---

*Not affiliated with Blizzard Entertainment. World of Warcraft and all related
characters and lore are property of Blizzard Entertainment, Inc.*
