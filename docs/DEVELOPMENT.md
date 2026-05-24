# Development Guide

## Prerequisites

- **Node.js ≥ 22** (tested on 23.11)
- **npm ≥ 10**
- A Gemini API key from https://aistudio.google.com/apikey
- *(Optional)* An Anthropic API key from https://console.anthropic.com

## Setup

```powershell
git clone <repo-url>
cd chronicles-of-azeroth
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
| Chronicles of Azeroth| 5180  | `strictPort: true` in vite.config.ts |
| Cozy Catch           | 8000  | Custom Node server                   |

If 5180 ever conflicts, change it in `vite.config.ts` and update this table.

## Environment variables

All env vars are prefixed `VITE_` so they're exposed to the browser. This is
fine for Phase 0 (local dev only — we don't ship a bundle). Phase 1 moves
these to the Electron main process and uses `keytar` for OS keychain storage.

| Variable                  | Required | Default       | Used by               |
| ------------------------- | -------- | ------------- | --------------------- |
| `VITE_GEMINI_API_KEY`     | Yes      | —             | `GeminiProvider`      |
| `VITE_ANTHROPIC_API_KEY`  | No       | (empty)       | `AnthropicProvider`   |

`.env.local` is gitignored. `.env.example` is the template — keep it in sync
when adding new vars.

> ⚠️ **Never commit real API keys.** If a key ever lands in git history,
> rotate it immediately in the provider's console.

## Project layout

```
chronicles-of-azeroth/
├── docs/                     ← you are here
├── public/                   Vite static assets
├── src/
│   ├── App.tsx               Top-level shell
│   ├── main.tsx              React entry
│   ├── index.css             Minimal styling
│   ├── types.ts              Shared types (carry forward to Phase 1+)
│   ├── pricing.ts            Single source of truth for model prices
│   ├── components/
│   │   ├── SpendBar.tsx      Always-visible cost header
│   │   └── SmokeTest.tsx     Phase 0 dev tool
│   ├── lib/
│   │   └── spendTracker.ts   localStorage usage log + averages
│   └── providers/
│       ├── GeminiProvider.ts
│       └── AnthropicProvider.ts
├── .env.example
├── .env.local                gitignored, holds real keys
├── .gitignore
├── index.html
├── package.json
├── tsconfig.json             references both app + node configs
├── tsconfig.app.json         strict TS for src/
├── tsconfig.node.json        for vite.config.ts
└── vite.config.ts            port pinned to 5180
```

## Common dev workflows

### Trying a new prompt

1. Open the app, expand the smoke test panel.
2. Pick a model from the dropdown (default: free Flash).
3. Paste your prompt, hit **Run smoke test**.
4. Check the response, latency, and cost in the spend bar.
5. Console logs show finish reason + full token breakdown — useful for
   diagnosing weirdness like the Gemini thinking trap.

### Comparing two models on the same prompt

1. Run with model A.
2. Switch model in dropdown, run again with same prompt.
3. Expand spend bar → averages table groups by `task::model`, so you can
   compare cost / token usage / latency side by side.
4. Export CSV for offline analysis if needed.

### Resetting cost tracking

```js
// In browser console:
Object.keys(localStorage)
  .filter(k => k.startsWith('coa.spend.'))
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

## Deployment

The app deploys to GitHub Pages via `.github/workflows/deploy.yml` on every
push to `main`.

**Setup checklist (first time):**

1. Repository visibility must be **public** (Pages on a private repo
   requires a paid plan).
2. In repo Settings → Pages, set **Source = GitHub Actions**.
3. Push to `main`. The workflow runs `build`, uploads `dist/` as a Pages
   artifact, and deploys.

**How the build differs from local dev:**

- Vite's `base` is read from `COA_BASE`. Local dev leaves it at `/`. CI sets
  `COA_BASE=/Chronicles-of-Azeroth/` so all asset URLs in `index.html`
  are correctly prefixed for the project-page subpath.
- `dist/index.html` is copied to `dist/404.html` so Pages serves the SPA
  shell for unknown paths (deep-link friendly).

**Asset URLs in code:**

Anything you write as a hardcoded path like `/npcs/foo.png` will bypass
`base` and 404 in production. Wrap public-folder paths in
`assetUrl()` from `src/lib/assetUrl.ts`, which prepends
`import.meta.env.BASE_URL`.

**API keys on the public bundle:**

The deployed build ships with no API keys. Users paste their own Gemini
or Anthropic key into the ⚙ Keys panel in the spend bar; values are kept
in `localStorage` only. The `apiKeys.ts` helper falls back to
`import.meta.env.VITE_*` for local dev so a `.env.local` keeps working.

**Build it like CI does (for testing):**

```powershell
$env:COA_BASE = '/Chronicles-of-Azeroth/'
npm run build
# Preview at http://localhost:4173/Chronicles-of-Azeroth/
npm run preview -- --port 4173
```

**Live URL:** <https://snoblitz.github.io/Chronicles-of-Azeroth/>

