# Development Guide

## Prerequisites

- **Node.js ≥ 20** (CI uses 20; local dev tested on 23.11)
- **npm ≥ 10**
- A Gemini API key from https://aistudio.google.com/apikey
- *(Optional)* An Anthropic API key from https://console.anthropic.com

## Setup

```powershell
git clone <repo-url>
cd Aftertale
npm install
Copy-Item .env.example .env.local
# Edit .env.local and paste your API keys
npm run dev
```

Open <http://localhost:5180>.

## Scripts

| Script             | What it does                                              |
| ------------------ | --------------------------------------------------------- |
| `npm run dev`      | Start Vite dev server on **port 5180** (strict)           |
| `npm run build`    | Type-check + production bundle to `dist/`                 |
| `npm run preview`  | Serve the prod bundle locally                             |
| `npm run lint`     | Run `tsc --noEmit` (type check only — no ESLint yet)      |

## Port assignments

Jeff's local environment runs several dev servers in parallel. To avoid
collisions, ports are pinned:

| Project              | Port  | Notes                                |
| -------------------- | ----- | ------------------------------------ |
| sand-miner           | 5173  | Default Vite port, can't move        |
| Aftertale| 5180  | `strictPort: true` in vite.config.ts |
| Cozy Catch           | 8000  | Custom Node server                   |

If 5180 ever conflicts, change it in `vite.config.ts` and update this table.

## Environment variables

All env vars are prefixed `VITE_` so they're exposed to the browser. For local
dev, `.env.local` is convenient; for the public Cloudflare Pages build, no keys are
baked in and users paste runtime keys into the in-app settings panel. Phase 1
moves keys to the Electron main process and uses `keytar` for OS keychain
storage.

| Variable                  | Required | Default       | Used by               |
| ------------------------- | -------- | ------------- | --------------------- |
| `VITE_GEMINI_API_KEY`     | No       | —             | `GeminiProvider`      |
| `VITE_ANTHROPIC_API_KEY`  | No       | (empty)       | `AnthropicProvider`   |

`.env.local` is gitignored. `.env.example` is the template — keep it in sync
when adding new vars.

> ⚠️ **Never commit real API keys.** If a key ever lands in git history,
> rotate it immediately in the provider's console.

## Project layout

```
Aftertale/
├── .github/workflows/        deploy.yml → Pages on push to main
├── docs/                     ← you are here
├── public/
│   └── npcs/                 NPC portrait PNGs (wrap paths in assetUrl())
├── src/
│   ├── App.tsx               Tab shell: Character / Chronicle / NPC / Addon
│   ├── main.tsx              React entry
│   ├── index.css             Leather-bound spellbook design system
│   ├── types.ts              Shared types (carry forward to Phase 1+)
│   ├── pricing.ts            Single source of truth for model prices
│   ├── vite-env.d.ts         `vite/client` types so `tsc -b` is happy
│   ├── components/
│   │   ├── SpendBar.tsx          Always-visible cost header + ⚙ Keys
│   │   ├── SettingsPanel.tsx     In-app API key entry modal
│   │   ├── ModelPicker.tsx       Shared model dropdown
│   │   ├── CharacterSelector.tsx Active-hero dropdown in the header
│   │   ├── CharacterCreation.tsx Welcome → identity → interview → review → sheet
│   │   ├── NpcChat.tsx           NPC tavern + per-(hero × NPC) transcripts
│   │   ├── ChronicleReader.tsx   Story-reader + recap surface
│   │   └── AddonSimulator.tsx    WoW-addon event harness
│   ├── lib/
│   │   ├── apiKeys.ts            localStorage-first key lookup
│   │   ├── assetUrl.ts           Resolves /public/* against BASE_URL
│   │   ├── bibleStore.ts         Multi-character roster + envelopes
│   │   ├── presetCharacters.ts   Built-in bibles (Magnus)
│   │   ├── wowData.ts            Race/class/faction cascade
│   │   ├── modelChoices.ts       Shared model registry
│   │   ├── npcCatalog.ts         Curated dwarven NPCs
│   │   ├── npcChatStore.ts       Per-(hero × NPC) transcript persistence
│   │   ├── addonEvents.ts        Normalized event contract
│   │   ├── addonEventStore.ts    Raw event log
│   │   ├── addonIngest.ts        event → bible / chronicle mutator
│   │   ├── classicQuestFixtures.ts Quest-chain fixtures (~650 lines)
│   │   ├── sessionHistory.ts     Groups events into play sessions
│   │   └── spendTracker.ts       Usage log + averages + CSV export
│   └── providers/
│       ├── GeminiProvider.ts
│       └── AnthropicProvider.ts
├── .env.example
├── .env.local                gitignored, holds real keys (optional)
├── .gitignore
├── index.html
├── package.json
├── tsconfig.json             references both app + node configs
├── tsconfig.app.json         strict TS for src/
├── tsconfig.node.json        for vite.config.ts
└── vite.config.ts            port pinned to 5180; base from AT_BASE (default /)
```

## Common dev workflows

### Comparing two models

1. Pick a model from the Character, Chronicle, or Tavern dropdown.
2. Run the same character prompt, chronicle recap, or NPC exchange with model A and model B.
3. Expand spend bar → averages table groups by `task::model`, so you can
   compare cost / token usage / latency side by side.
4. Export CSV for offline analysis if needed.

### Reading the story after a play session

1. Open the **Chronicle** tab.
2. Use **Latest session** for the most recent play window or **Full saga** for the whole hero timeline.
3. Scan the "so what" cards for zones, level movement, character pressure, and the next NPC memory hook.
4. Click **Write recap** to turn the selected entries into a polished campfire chapter using the selected model.

### Resetting cost tracking

```js
// In browser console:
Object.keys(localStorage)
  .filter(k => k.startsWith('at.spend.'))
  .forEach(k => localStorage.removeItem(k));
location.reload();
```

### Verifying available Gemini models

The pricing page on ai.google.dev does NOT match the actual API model IDs.
Always verify with a REST call:

```powershell
$key = (Get-Content .env.local | Select-String 'VITE_GEMINI_API_KEY=').Line.Split('=')[1]
curl "https://generativelanguage.googleapis.com/v1beta/models?key=$key" `
  | ConvertFrom-Json `
  | Select-Object -ExpandProperty models `
  | Select-Object name, supportedGenerationMethods
```

## Known issues / gotchas

- **`npm create vite@latest` hangs** in some PowerShell environments on TTY
  prompts. Workaround: scaffold manually (this repo already is).
- **HMR can cache stale module exports.** If you see "does not provide an
  export named X" after renaming an export, hard refresh (Ctrl+Shift+R) and
  restart the dev server.
- **Gemini thinking tokens.** See [PROVIDERS.md](./PROVIDERS.md#gemini-thinking-mode-trap).
  Pinned to `gemini-2.5-flash`/`gemini-2.5-pro` to avoid mandatory thinking.

## Deployment (Cloudflare Pages)

Aftertale is hosted on **Cloudflare Pages**. Production lives at
<https://aftertale.gg/>. The Pages project is connected directly to the
GitHub repo (`Aftertale-App/Aftertale`) — every push to `main` triggers an
auto-deploy. Every other branch / PR gets a preview URL at
`<branch>.aftertale.pages.dev`.

**No CI workflow lives in this repo.** Cloudflare's build runner reads
`package.json`, runs `npm run build`, and ships `dist/`.

**Build config in the Cloudflare Pages dashboard:**

- Framework preset: Vite
- Build command: `npm run build`
- Build output directory: `dist`
- Root directory: blank
- Environment variables: none — base path defaults to `/` for the apex
  domain. Override with `AT_BASE` only if rehosting at a subpath.

**Asset URLs in code:**

Anything you write as a hardcoded path like `/npcs/foo.png` will bypass
`base` and could 404 if we ever rehost at a subpath. Wrap public-folder
paths in `assetUrl()` from `src/lib/assetUrl.ts`, which prepends
`import.meta.env.BASE_URL`.

**API keys on the public bundle:**

The deployed build ships with no API keys. Users paste their own OpenRouter
key into the ⚙ Keys panel in the spend bar; values are kept in
`localStorage` only. The `apiKeys.ts` helper falls back to
`import.meta.env.VITE_*` for local dev so a `.env.local` keeps working.

**Build it like Cloudflare does (for testing):**

```powershell
npm run build
npm run preview -- --port 4173
# Preview at http://localhost:4173/
```

**Live URL:** <https://aftertale.gg/>

