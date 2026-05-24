# Changelog

All notable changes to Chronicles of Azeroth. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Pre-1.0, every
change is technically breaking — we'll start being strict about SemVer when
Phase 1 ships.

## [Unreleased] — Phase 0 in progress

### Added

- **Character creation interview** — multi-step (Identity → Interview →
  Review → Save) with a `loremaster` LLM persona that probes for voice,
  beliefs, motivations, fears, and flaws. Generates a complete
  `CharacterBible` JSON.
- **Multi-character storage.** Roster index at `coa.bible.roster.v1` plus
  one envelope per hero at `coa.bible.entry.<characterKey>`. Old
  `coa.bible.current` is migrated on load (idempotent).
- **CharacterSelector** dropdown in the header — switch active hero,
  shows race/class/faction at a glance, save indicator.
- **Full character sheet view** replacing the old minimal banner:
  portrait monogram with faction-tinted glow, name in Cinzel display
  font, race/class/faction/homeland/age line, voice block, paragraph-split
  backstory, beliefs + motivations columns, fears + flaws columns with
  distinct accents, raw JSON details, action footer (Talk to NPCs, Edit,
  Roll another).
- **Core quote** field (gold-framed banner under the sheet header).
- **Fears + flaws** fields (validated, edit-form, NPC prompt injection).
- **Level + currentZone + chronicle history** — dynamic in-world state.
  Header pills, ReviewView edit fields, quick-add chronicle textarea
  with `Cmd/Ctrl+Enter` shortcut, entries list with relative timestamps
  and per-entry level/zone chips, hover-to-delete. Each entry snapshots
  the hero's current level + zone at write time.
- **NPC chat screen** with portrait header card grid, hero-assist drafts
  ("draft a reply in my voice"), and per-character × per-NPC transcript
  persistence (`coa.npcChat.thread.<characterKey>.<npcId>`).
- **Magni Bronzebeard** as the first art-assetted NPC (portrait shipped at
  `public/npcs/magni-bronzebeard.png`).
- **NPC system prompt** injects voice, beliefs, motivations, fears, flaws,
  core quote, current level, current zone, and the last 5 chronicled deeds.
  Hero-assist prompt gets the last 3.
- **Reusable `ModelPicker` component** extracted from `SmokeTest`.
- **Inline bible editor.** "Edit bible" on the sheet flips ReviewView into
  editing mode (Save changes / Cancel buttons), exposing Name + Homeland +
  Level + Current zone alongside the existing backstory/beliefs/motivations
  fields, plus textareas for fears + flaws and an input for core quote.
- **Cross-tab navigation** via `coa:request-tab` custom event — sheet's
  "Talk to NPCs" button hops to the Tavern tab without prop drilling.
- **`appendHistoryEntry`, `deleteHistoryEntry`, `updateActiveBible`**
  helper APIs in `bibleStore`, all firing `coa:bible-updated` so the UI
  auto-refreshes.
- **In-app API key entry** (`SettingsPanel` + `apiKeyStore`). Keys live
  in localStorage and override anything baked in at build time. Opens
  automatically on first run when no keys are present.
- **GitHub Pages deployment** via `.github/workflows/deploy.yml`. Vite
  `base` is read from `COA_BASE` env so local dev stays at `/` and CI
  builds to `/Chronicles-of-Azeroth/`. Workflow copies `dist/index.html`
  to `dist/404.html` so deep-links survive Pages' SPA-less routing.
- **`assetUrl()` helper** so portrait paths in `public/` resolve correctly
  under both local dev (`/`) and project Pages (`/Chronicles-of-Azeroth/`).
- **`src/vite-env.d.ts`** with `/// <reference types="vite/client" />`
  so `import.meta.env` and CSS imports type-check under `tsc -b`.
- **Magnus seed backfill.** One-time migration patches the hand-written
  Magnus bible with the fears/flaws/coreQuote Jeff dictated, gated on
  `coa.migrations.fears-flaws-quote.v1`.
- **Preset characters registry** (`src/lib/presetCharacters.ts`) — ships
  fully-formed bibles inside the bundle so a brand-new visitor can pick a
  ready-made hero (currently: Magnus Brunn) instead of being forced through
  the interview.
- **Welcome screen** — new `'welcome'` step in `CharacterCreation` that
  shows preset cards + a "Roll a new hero" button. Auto-shown when the
  roster is empty; also reachable from the existing-bible banner via "Roll
  another hero" (with a back button to your active hero). Preset loads are
  non-destructive: if you already have that hero's `createdAt` key in your
  roster, we just re-activate it instead of overwriting edits.

### Fixed

- **`@google/genai 0.3.1` silently dropped `thinkingConfig`.** Upgraded
  to 2.6.0 — thinking is now actually disabled, costs are accurate.
- **NPC reply truncation.** `maxOutputTokens` raised to 2048 on the NPC
  assist call. Error messages now surface billed tokens vs visible word
  count when truncation does happen.
- **`storage` event scope.** Native `storage` only fires on OTHER tabs.
  Added `coa:usage-updated`, `coa:bible-updated`, and `coa:apikey-updated`
  custom events for same-tab refresh.
- **Underreported Gemini cost.** `outputTokens` now includes
  `thoughtsTokenCount` (Google bills thinking at the output rate).
- **Cache-aware Anthropic costing** uses `cache_read_input_tokens` (typed
  via a local interface since older SDK typings lack it).
- **Vite HMR cache wedge.** Documented in `docs/DEVELOPMENT.md`: deleting
  `node_modules/.vite` fixes empty served CSS after many rapid edits.

### Changed

- **Gemini models pinned** from `gemini-flash-latest` /
  `gemini-pro-latest` to `gemini-2.5-flash` / `gemini-2.5-pro`. The
  `*-latest` aliases point to Gemini 3.x models which have **mandatory
  thinking** that silently ignores `thinkingBudget: 0` and burns 1000+
  extra output tokens per call.
- **Default `maxOutputTokens`** raised from 200 → 2048.
- **Dev server port** pinned to **5180** (`strictPort: true`) to avoid
  colliding with sand-miner on 5173.
- **Vite `base`** now derived from `COA_BASE` env (default `/`).
- **Provider error messages** now point at the in-app Keys panel as
  well as `.env.local`.

### Project meta

- Renamed from "Azeroth Chronicle" to **Chronicles of Azeroth**.
- Repo: <https://github.com/snoblitz/Chronicles-of-Azeroth>.
- Live demo: <https://snoblitz.github.io/Chronicles-of-Azeroth/>.

---

## Lessons learned (running log)

These are sharp edges discovered during Phase 0 that future-us shouldn't
have to rediscover.

1. **Gemini's pricing page and API model IDs don't match.** Always verify
   model availability with a REST `models?key=...` call.
2. **Newer Gemini Flash models have mandatory thinking.** Even with
   `thinkingConfig: { thinkingBudget: 0 }`, `gemini-flash-latest` (→ 3.5
   Flash) burns ~1234 tokens of silent thinking. Pin to `gemini-2.5-flash`.
3. **Google bills thinking tokens at the output rate.** Cost tracking must
   include `usageMetadata.thoughtsTokenCount` or you'll under-report.
4. **`window.storage` only fires on OTHER tabs.** For same-tab refresh of
   localStorage-backed UI, dispatch a CustomEvent.
5. **`npm create vite@latest` hangs in some PowerShell environments** on
   interactive TTY prompts. Workaround: scaffold by hand.
6. **Anthropic SDK in the browser** needs `dangerouslyAllowBrowser: true`.
   Acceptable for local-only Phase 0; Phase 1 must proxy via Electron main.
7. **`@google/genai` < 2.x silently drops `thinkingConfig`.** Upgrade
   pins to 2.6.0 or you'll think thinking is disabled when it isn't.
8. **Vite HMR cache can wedge** after many rapid edits — symptom is a
   served CSS file containing literally `const __vite__css = ""`.
   Fix: stop Vite, `Remove-Item -Recurse -Force node_modules/.vite`,
   restart. Verify with `(Invoke-WebRequest http://localhost:5180/src/index.css?direct).Content.Length`.
9. **`tsc -b` is stricter than `tsc --noEmit`.** The build mode picks up
   `tsconfig.app.json` with `noUnusedLocals` etc.; the bare noEmit ran
   the root tsconfig. Always run `npm run build` before pushing.
10. **`import.meta.env` and CSS imports** need `src/vite-env.d.ts` with
    `/// <reference types="vite/client" />` or `tsc -b` will fail.
11. **JSX literal `\u2022`** renders as the literal escape string, not a
    bullet. Use the actual unicode character directly.
12. **PowerShell commit messages eat backticks.** Always write the commit
    message to a file in `.git/COMMIT_MSG_*.txt` then
    `git commit -F <file>`.
13. **GitHub Pages on project sites serve from `/<repo-name>/`.** Vite's
    `base` must match, or the bundle 404s. Set `COA_BASE=/Chronicles-of-Azeroth/`
    only in CI so local dev stays at `/`.
14. **`public/` assets ignore `base` at write time.** Anything stored as
    a hardcoded `/path` string in JS/JSON (like NPC portrait URLs) must
    be wrapped in `assetUrl()` to survive Pages deployment.
