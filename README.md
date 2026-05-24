# Chronicles of Azeroth

> AI-powered narrative engine that turns World of Warcraft into a personalized
> RPG novel where **you** are the protagonist.

Roll a character, live the adventure in-game, and watch the app build a
chapter-by-chapter chronicle of your hero's story in real time. Quests have
permanent consequences. NPCs remember you. Your character is *yours* — voice,
backstory, beliefs, scars and all.

**Status:** Phase 0 (Browser POC) — see [docs/ROADMAP.md](./docs/ROADMAP.md)

## 🌐 Live demo

**👉 [snoblitz.github.io/Chronicles-of-Azeroth](https://snoblitz.github.io/Chronicles-of-Azeroth/)**

The Pages build ships **with no API keys baked in** — when you open it for
the first time you'll be prompted to paste your own Gemini key (free tier
fine). The key is stored in your browser's localStorage only; nothing is
sent to any server but the model provider itself.

Grab a free Gemini key here: <https://aistudio.google.com/apikey>

## What it does (eventually)

- **Character creation interview** generates a deep character bible (race,
  class, faction, backstory, beliefs, motivations, fears, flaws, voice, core
  quote).
- **Full character sheet** with portrait, faction-tinted glow, level + zone
  pills, and an in-character chronicle log of recent deeds.
- **Talk to famous NPCs** — Magni Bronzebeard and Muradin are first up;
  Tirion, Sylvanas, Jaina, Bolvar coming. Grounded in WoW lore + your
  character bible + recent chronicle entries. They remember you.
- **Quests have permanent narrative impact.** Killing Hogger isn't just XP;
  it's a moment in your story.
- **Per-zone / per-arc summaries** that build into a readable novel of your
  playthrough.
- **In-game integration** (Phase 2) via a Lua addon extending YUI-Dialogue.

## Quick start (local dev)

```powershell
git clone https://github.com/snoblitz/Chronicles-of-Azeroth.git
cd Chronicles-of-Azeroth
npm install
Copy-Item .env.example .env.local
# Edit .env.local, paste your Gemini API key — or skip this and use the
# in-app Settings panel to paste it at runtime instead.
npm run dev
```

Open <http://localhost:5180>.

## Stack

- **Phase 0** (current): Vite 6 + React 19 + TypeScript, browser-only,
  deployed to GitHub Pages
- **Phase 1** (planned): Electron 28 + better-sqlite3 + sqlite-vec
- **Phase 2** (planned): Lua addon (extends Peterodox's YUI-Dialogue)
- **LLM**: Gemini 2.5 Flash on the free tier (default), Claude as A/B

## Docs

| Doc | What's in it |
| --- | --- |
| [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) | Three-phase architecture, data flow, provider contract |
| [docs/COST-STRATEGY.md](./docs/COST-STRATEGY.md) | Pricing table, rate limits, spend tracker, forecasting |
| [docs/PROVIDERS.md](./docs/PROVIDERS.md) | LLM provider interface, adding providers, **Gemini thinking trap** |
| [docs/DEVELOPMENT.md](./docs/DEVELOPMENT.md) | Local setup, scripts, ports, env vars, deployment |
| [docs/ROADMAP.md](./docs/ROADMAP.md) | Phase status, exit criteria, what's next |
| [CHANGELOG.md](./CHANGELOG.md) | Notable changes + lessons learned |

## Cost / privacy

The app is built around **always-on cost tracking**. Every LLM call is logged
to localStorage with per-call cost, plus averages by task × model. If the
spend bar in the header ever shows > $0, you're using a paid model.

Default config uses **Gemini's free tier** which is plenty for normal dev
and casual play (~15 RPM, ~1,500 RPD). Free tier means your prompts are used
for Google's model training — fine for fictional roleplay, not okay for
sensitive content. See [docs/COST-STRATEGY.md](./docs/COST-STRATEGY.md) for
the full breakdown.

Everything — your character bibles, chronicle entries, NPC chat history,
spend log, and API keys — lives only in your browser's localStorage. There
is no backend, no telemetry, no account.

## License

TBD (currently unlicensed — internal personal project).

---

*Not affiliated with Blizzard Entertainment. World of Warcraft and all related
characters and lore are property of Blizzard Entertainment, Inc.*
