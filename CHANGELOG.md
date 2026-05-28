# Changelog

All notable changes to Aftertale. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Pre-1.0, every
change is technically breaking — we'll start being strict about SemVer when
Phase 1 ships.

## [Unreleased] — Phase 0 shipped 🎉

### Changed — Launch strategy: phased ladder, not coordinated launch *(2026-05-28)*

- **New doc: [`docs/LAUNCH-PLAN.md`](docs/LAUNCH-PLAN.md).** Replaces the
  original *"nothing ships until all five tiers are coordinated"* framing
  with a sequenced ladder (Friends & Strangers → Public free → Quill & Coin
  → Companion → Chronicler/Loremaster). Each phase has a load-bearing
  question, entry/exit gates, and an explicit kill criterion. The
  architecture in `companion-architecture.md` is unchanged — only the
  delivery sequencing is. `ROADMAP.md`'s strategic-constraint banner now
  points at the launch plan as the source of truth for *when* things ship.

### Added — Inkwell + Chronicle pipeline *(2026-05-27 evening)*

- **The Inkwell — authoring hub rebuild.** Renamed and relocated the
  Session Trail surface to **The Inkwell**, an authoring hub that pairs
  story-beat curation with chronicle publishing. New
  `storyBeats`/`storyBeatSettings`/`sessionHistory` data layer powers
  per-session arcs. Dead onboarding steps 2/3/4 ripped; loot floor is
  surfaced inline on the active session card.
- **Arc Map.** Per-session timeline scrubber with level-up markers,
  sticky-bottom dock, and ghost pills for upcoming/skipped beats.
- **Chronicle session-recap pipeline (Lane A canon).** End-of-session
  recap generation flows directly into Chronicle; manual-entry dialog
  picks up Loremaster polish (rich form, validation, scribe voice
  preview). Chronicle purge surfaces are wired across the app.
- **Multi-toon attribution.** Every captured event now carries the
  player GUID (`event.char`) and character name. The web importer
  splits incoming events into per-character buckets, prompts the user
  to confirm which character to import, and writes only the accepted
  GUIDs to the active bible. Fixes the "Garygidney's playtime is
  Futony's playtime" merge bug from shared SavedVariables.
- **Bound-character pill on the Inkwell header.** Shows the active
  bible's class / race / faction / level / zone; a Settings "rebind"
  affordance lets the player switch characters without nuking state.

### Fixed — Level / zone tracking on bulk import *(2026-05-27 night)*

> Symptom: Futony dings to 5, re-imports cleanly, and every level-aware
> surface still reads **Lvl 1**. Root cause was the same underlying bug
> wearing five hats — `UnitLevel("player")` returns stale (or
> teardown-state) values at the moments we were snapshotting it.

- **PLAYER\_LEVEL\_UP captured the OLD level.** The addon snap function
  reads `UnitLevel("player")` at handler-fire time, which returns the
  pre-ding level. Addon now overwrites `enrichment.level = args[1]`
  (the new level from the event payload) inside the PLAYER\_LEVEL\_UP
  branch. The web ingest applies the same correction defensively
  (`rawArgs[0]` wins over `enrichment.level` for this event type).
  See `addon/Aftertale/Aftertale.lua` and
  `src/lib/savedVariablesIngest.ts`.
- **Re-import was a no-op.** `commitImport` deduped against the global
  event-id store, so re-importing the same SV file after fixing the
  addon skipped every event and the corrected `playerLevel` never
  reached storage. Added `upsertAddonEventRecord` and rewrote
  `commitImport` to track `imported` vs `refreshed` counts; the import
  toast now surfaces both.
- **`commitImport` never patched the bible.** The live ingest path
  updated `bible.level` / `bible.currentZone`; bulk import didn't.
  `commitImport` now patches both from the freshest accepted event.
- **Session "Levels earned" card collapsed to `Lvl 1 → 1`.**
  `PLAYER_LOGOUT` can carry a stale `UnitLevel = 1` from logout
  teardown, and `sessionHistory.buildSession` was trusting that snapshot
  as `endLevel`. Now derives start/end from the chronological min/max of
  observed `playerLevel` across the bucket — level only goes up in WoW,
  so max is correct. Same logic applied to `commitImport`'s bible
  patch.
- **Character picker showed "level 1" forever.** The "Pick a character
  to onboard" card was reading `firstSeen.level`, which is locked at
  the moment Aftertale first loaded for that toon. `characterIngest`
  now synthesizes a `lastSeen` snapshot per character by scanning the
  events log (max observed level, latest non-empty zone). Buckets by
  both GUID and charName so manual SV edits / multi-account merges /
  upstream GUID drift can't silently collapse the picker back to the
  stale snapshot. When the addon eventually does start writing
  `lastSeen` natively, we merge field-by-field so a written stale
  value never overrides a derived max.

### Added — Security *(2026-05-27 evening)*

- **CSP headers, vulnerability disclosure, gitleaks pre-commit hook**
  (commit `2c73840`). See `SECURITY.md`.



> **Note (2026-05-26):** Per current strategic direction, nothing under this
> heading ships to users until the full multi-tier launch is coordinated
> (Free/BYOK + Companion + Chronicler + Loremaster). Entries below represent
> work landed in `main` and ready to be part of that launch — not features
> currently delivered to anyone.
>
> **Exception:** The marketing landing page at [aftertale.gg](https://aftertale.gg/)
> is publicly deployed (auto-built by Cloudflare Pages on push to `main`).
> The in-app POC was already public via the prior GitHub Pages deploy, so
> shipping a polished front door alongside it does not change which features
> are reachable to users — only how the surface is described.

Phase 0 (Browser POC) exit criteria all met as of May 25, 2026: character
interview produces distinct bibles, 5-turn NPC conversations stay in-voice
(Magni is the bar), and the spend bar is backed by ~80 real Flash calls
(~$0.10) from the May 24 sim session.

**Architecture locked (2026-05-26):** the canonical reference for the
multi-tier system (Free → Companion → Chronicler → Loremaster), Companion
daemon, pairing flow, OpenRouter LLM layer, and Supabase backend is
[`docs/companion-architecture.md`](docs/companion-architecture.md). The
prior "Phase 1 = standalone Electron app, Phase 2 = WoW addon" framing in
older docs is superseded by that document.

### Added

- **Auth — anonymous-by-default + "Save your chronicle"** *(2026-05-27)*.
  Wires Supabase Auth into the app shell (no cloud data sync yet — that's the
  next task). Every visitor is signed in anonymously on first app load
  (`signInAnonymously()`), giving the device a stable `auth.users.id` cached at
  `at.user_id`. A new top-right **account menu** (`AccountMenu`) shows the
  state: anonymous → "Save your chronicle" CTA + a "Sign in" link; email-backed
  → address + Sign out; loading → skeleton; unconfigured (no Supabase env, e.g.
  the current public build) → renders nothing. "Save your chronicle"
  (`SaveChronicleModal`) calls `updateUser({ email })` — a magic link that
  converts the *same* anonymous user into an email-backed account with no data
  migration (the id is unchanged). Returning users sign in via email magic link
  only (no passwords/OAuth in V1). New `/auth/callback` route
  (`AuthCallback` + `public/_redirects` SPA fallback) exchanges the PKCE code
  for a session and forwards to the roster. Client switched to `flowType:
  'pkce'` + manual code exchange. A client-side profile `upsert` backstops the
  `handle_new_user` trigger for anonymous sessions. Copy follows the
  preservation-not-gate framing and the "Hero's Truth" naming. See
  `docs/companion-architecture.md` §3.2 for the auth model + edge cases.
- **Supabase backend scaffold** *(2026-05-27)*. Initial schema migration
  (`supabase/migrations/20260527120000_initial_schema.sql`) for the multi-tier
  backend (companion-architecture.md §9): `profiles` (keyed on `auth.users.id`),
  `characters`, `bible`, `events`, `chapters`, `subscriptions`, `unlocks`,
  `companion_devices`, `pair_codes`. Hybrid modeling — locked identity fields
  are real columns, evolving shapes (bible/event/chapter bodies) are JSONB. RLS
  enabled on every table: ownership flows from `auth.uid()` (directly or via the
  `characters` FK chain); `subscriptions`/`unlocks` are client-read-only
  (service-role writes); `pair_codes` allows anon read of unconsumed codes with
  auth'd claim. Adds a profile-on-signup trigger and `updated_at` triggers.
  Local dev seed (`supabase/seed.sql`) with one dev user + character + bible for
  RLS smoke-testing. Browser client stub `src/lib/supabase.ts`
  (`getSupabase()` returns `null` when env is unset — current public build
  unaffected) behind `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`; placeholder
  `src/types/supabase.ts` to be regenerated via `supabase gen types`. Setup docs
  in `docs/supabase.md`. No app wiring yet — pure foundation.
- **Marketing landing page** at `aftertale.gg/` *(2026-05-27)*. Full
  `src/components/LandingPage.tsx` (~2200 lines incl. styles) ships at the
  root of the public site. Hero section ("Every hero deserves an
  Aftertale."), five-page Magnus Brunn exhibit (Hero / Truth / Voice /
  Backstory / Chapter) with horizontal scroll-snap + dot nav + keyboard
  control, "From signup to first chapter" onboarding section with
  five activation cards + anxiety-killer reassurance line, supported-games
  compact pill strip (Retail / Classic / Hardcore / SoD / Cataclysm /
  Mists, each color-coded), magic-moment phone mockup section, how-it-works
  steady-state loop, features grid, pricing tiers (reused from in-app
  ScribesDesk), expandable FAQ, footer with Blizzard trademark disclaimer.
  Reveal-on-scroll animations honoring `prefers-reduced-motion`.
- **Aftertale wordmark logo** *(2026-05-27)*. AI-generated gold wordmark
  with the book + compass + stars sigil. Processed (alpha-keyed off
  light background, auto-cropped to content bbox) and saved as
  `public/aftertale-logo.png`. Used in landing-page header (44px) and
  footer (36px, slightly dimmed).
- **Magnus Brunn portrait** *(2026-05-27)*. AI-rendered full hero card with
  embedded purple frame, "HERO · SAGA IN PROGRESS" eyebrow, Magnus holding
  Calder's hammer (sun-sigil engraved), Forgelight halo behind him, and
  "FORGESWORN · IRON-BOUND · MID-SAGA" footer stamp. Saved as
  `public/magnus-card.jpg` (900×1200, q86 progressive, ~205 KB). Replaces
  the procedural `<HeroSigil>` SVG on the IdentityPanel.
- **Favicon set** *(2026-05-27)*. Sigil extracted from the high-res
  wordmark, generated at 16 / 32 / 48 / 180 / 192 / 512 px plus
  multi-resolution `favicon.ico`. Wired into `index.html` with
  `theme-color: #1a0e2e` and a `description` meta tag.
- **"The Hero's Truth" surface naming** *(2026-05-27)*. The `coreQuote`
  bible field is now labeled "The Hero's Truth" across the marketing page,
  in-app character sheet (new section header), editor field, AI bible
  preview, and LLM prompt context ("Hero's truth: …"). Underlying
  `coreQuote` data field unchanged to avoid storage migration risk.

### Changed

- **Renamed Chronicles of Azeroth → Aftertale** *(2026-05-26 → 2026-05-27)*.
  Full rebrand in four phases:
  - **Phase 1 — marketing copy:** README, all docs, in-app `<h1>`s, page
    titles, pitch decks, prologue copy.
  - **Phase 2 — code identifiers:** `coa.*` localStorage keys → `at.*`
    with a one-time migration helper that runs from `main.tsx` on app
    boot (preserves user data). `coa:` custom events → `at:`. CSS classes
    `.coa-*` → `.at-*` (323+ instances across `index.css`).
  - **Phase 3 — WoW addon:** folder `addon/ChroniclesOfAzeroth/` →
    `addon/Aftertale/`, six `.toc` files renamed, Lua globals
    (`AftertaleDB` / `AftertaleCompanion` / `AftertaleRestore`), slash
    command `/aftertale` (alias `/at`), chat-frame tag `[Chronicles]` →
    `[Aftertale]`, addon-message wire prefix `"COA"` → `"AT"`.
  - **Phase 4 — package metadata:** `package.json` name → `aftertale`,
    lockfile regenerated.
- **GitHub org transfer** *(2026-05-26)*. Repo moved from
  `snoblitz/Aftertale` to `Aftertale-App/Aftertale` (dedicated org for
  the product). Updated remote URL + all in-code references.
- **Cloudflare Pages migration** *(2026-05-26)*. Replaced GitHub Pages with
  Cloudflare Pages. Domain `aftertale.gg` purchased at GoDaddy and DNS
  migrated to Cloudflare (`hope.ns` + `jaxson.ns` nameservers). Pages
  project connected to GitHub repo — push to `main` auto-deploys; branches
  get `<branch>.aftertale.pages.dev` preview URLs. Custom domains
  `aftertale.gg` + `www.aftertale.gg` both attached. Deleted
  `.github/workflows/deploy.yml`. Env var `COA_BASE` → `AT_BASE`, defaults
  to `/` for apex hosting. Updated OpenRouter `HTTP-Referer` header,
  addon `webAppUrl`, all doc links.
- **Hero copy refinement** *(2026-05-27)*. Landing-page H1 "Become the
  legend you played." → **"Every hero deserves an Aftertale."** Subhead
  updated to lean fully into the personalized-novel framing.
- **Magnus's identity polished** *(2026-05-27)*. Page-1 "From" / "Carries"
  / "Vow" / "Chapter" stats rewritten with more evocative prose. Page-2
  "The Hero's Truth" panel gains a gold-bordered gloss block with an
  italic coda. Page-3 voice transcript replaced the stoic "Stone's not
  afraid. Stone holds." with a more revealing "Course I was. / That's
  the part people keep giving prettier names." exchange. Page-4 backstory
  beats rewritten with sharper specifics ("clean boots", "stands in the
  gap"). Page-5 chapter expanded ~140 words; new structure paces the
  battle, the Forgelight rising, and the closing "No, not alone." exchange
  with the reeve.
- **Scribe's Desk page** *(2026-05-26)*. Split `ChronicleReader.tsx` into
  pure-reader + new `/Scribe's Desk` tab. The desk owns the manual workflow:
  Import SV → Filter events → Enrich → Download `.lua` restore snippet — laid
  out as a 4-step linear stepper. Reader is now purely about reading
  (chapters, recaps, insights, session trail) — no import or export controls.
  Extracted `EventFilterPanel` into its own component file. Added a
  `featureFlags.ts` module with `getShowScribesDesk()` / `setShowScribesDesk()`
  for power-user toggling (default visible pre-launch; post-launch it flips
  to default-hidden for paid tiers where the daemon does this automatically).
  Settings panel gained an "Advanced" section with the toggle. New tab
  request `at:request-tab` accepts `'desk'`. Reader's empty state now
  routes the user to the desk. `ChronicleReader.tsx` shrank from 1327 to
  759 lines.
- **LLM layer is now OpenRouter-only** *(2026-05-26)*. Removed the direct
  `GeminiProvider` and `AnthropicProvider` and their SDK dependencies
  (`@google/genai`, `@anthropic-ai/sdk`). Removed all `gemini-*` and
  `claude-*` pricing entries from `src/pricing.ts`. `ProviderId` narrowed
  to `'openrouter'`, `Provider` (apiKeys.ts) narrowed to `'openrouter'`,
  SettingsPanel simplified to a single key field. Default model is now
  `openrouter/anthropic/claude-sonnet-4.5` (best-in-class for long-form
  narrative). Bundle dropped from 128 to 92 modules, shipped JS down
  ~355 KB raw / ~75 KB gzipped (no more SDK weight — OpenRouter is fetch
  only). One key, every model. See `docs/companion-architecture.md` §8a.

### Added

- **OpenRouter provider** *(2026-05-26)*. New `src/providers/OpenRouterProvider.ts`
  using OpenRouter's OpenAI-compatible API (plain fetch, no SDK — 2.6 KB
  shipped). Five curated models wired into the picker:
  Claude Sonnet 4.5, Claude Opus 4.5, GPT-5, Gemini 2.5 Pro, Gemini 2.5 Flash.
  Settings panel now lists OpenRouter first as the recommended path —
  one key, every model. Pricing rows mirror the underlying provider's
  per-token rate (OpenRouter passes through). Carries the strategic-default
  decision from `docs/companion-architecture.md` §8a into actual code,
  unblocking BYOK simplification and per-tier managed-key paths without
  committing to user-facing UX yet. Direct Gemini + Anthropic providers
  remain wired and functional for A/B comparison.
- **`.lua` restore snippet — kills the lossy blob format** *(2026-05-26)*.
  CompanionExport gains a "⬇ Download .lua restore" button that produces a
  self-contained `AftertaleRestore.lua` file. User drops it into
  `WTF\Account\<ACCT>\SavedVariables\`, relaunches WoW, and the new
  `addon/Aftertale/Companion/Restore.lua` module merges full
  events + enrichments + bible into `AftertaleDB` on `PLAYER_LOGIN`.
  Carries the entire `enrichment` subtable per event (`zoneText`, `questTitle`,
  `npc.name`, `encounterName`, `loot[]`) so chapter grouping and entry titles
  render correctly — the at-CHRONICLE-V1 blob was dropping all of that and
  leaving the book stuck on "Unknown Lands" / "Accepted: a quest". Also
  bypasses the 471 KB EditBox bottleneck. Snippet uses auto-leveled Lua
  long brackets so any LLM-generated content (including `]==]` tokens or
  trailing `]`) round-trips byte-for-byte; smoke-tested against a real Lua
  interpreter. Old `/aftertale sync` blob path retained as fallback.
- **LOOT_OPENED enrichment with quality gating** *(2026-05-26)*. LOOT events
  are now narrative when at least one item meets the quality floor (default
  Uncommon+). New `T.LOOT_OPENED` template pool + `ResolveLoot` /
  `IsNarrativeEntry` helpers in `Lore/Templates.lua`. Web companion extracts
  `enrichment.loot[]` into the `AddonEvent`, passes named items + quality
  labels into the enrichment prompt, and exposes a quality `<select>` in the
  filter panel (persisted alongside the event toggles).
- **Per-event-type filter in CompanionExport** *(2026-05-26)*. Category-grouped
  checkbox panel above the enrich controls, defaulting to the 8 narrative
  events the parchment book actually renders. Persists globally to
  `localStorage` (`at.enrichFilter.v1`). Per-import counts shown beside each
  event name so cost is visible before kicking off a run. Closes the
  ~95%-waste finding from the May 25 stress test.
- **`ENCOUNTER_END` + `BOSS_KILL` are now narrative events.** Added template
  pools, `Preview` cases, and `ResolveEncounter` helper in
  `addon/.../Lore/Templates.lua`. The parchment book now renders boss kills
  instead of dropping them.

### Changed

- **Roadmap trim.** Dropped the A/B comparison view + its exit criterion,
  dropped the "more NPCs (Brann/Falstad/Moira)" backlog, and folded the
  manual-event-entry item into the Addon Simulator (which already provides
  that ingest path). Lowered the 100-call spend-bar threshold to "real
  sustained usage" — the May 24 session covers it.

### Added

- **Character creation interview** — multi-step (Identity → Interview →
  Review → Save) with a `loremaster` LLM persona that probes for voice,
  beliefs, motivations, fears, and flaws. Generates a complete
  `CharacterBible` JSON.
- **Multi-character storage.** Roster index at `at.bible.roster.v1` plus
  one envelope per hero at `at.bible.entry.<characterKey>`. Old
  `at.bible.current` is migrated on load (idempotent).
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
  persistence (`at.npcChat.thread.<characterKey>.<npcId>`).
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
- **Cross-tab navigation** via `at:request-tab` custom event — sheet's
  "Talk to NPCs" button hops to the Tavern tab without prop drilling.
- **`appendHistoryEntry`, `deleteHistoryEntry`, `updateActiveBible`**
  helper APIs in `bibleStore`, all firing `at:bible-updated` so the UI
  auto-refreshes.
- **In-app API key entry** (`SettingsPanel` + `apiKeyStore`). Keys live
  in localStorage and override anything baked in at build time. Opens
  automatically on first run when no keys are present.
- **GitHub Pages deployment** via `.github/workflows/deploy.yml`. Vite
  `base` is read from `COA_BASE` env so local dev stays at `/` and CI
  builds to `/Aftertale/`. Workflow copies `dist/index.html`
  to `dist/404.html` so deep-links survive Pages' SPA-less routing.
- **`assetUrl()` helper** so portrait paths in `public/` resolve correctly
  under both local dev (`/`) and project Pages (`/Aftertale/`).
- **`src/vite-env.d.ts`** with `/// <reference types="vite/client" />`
  so `import.meta.env` and CSS imports type-check under `tsc -b`.
- **Magnus seed backfill.** One-time migration patches the hand-written
  Magnus bible with the fears/flaws/coreQuote Jeff dictated, gated on
  `at.migrations.fears-flaws-quote.v1`.
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
- **Addon Simulator tab** (`src/components/AddonSimulator.tsx`,
  `src/lib/addonEvents.ts`, `addonEventStore.ts`, `addonIngest.ts`,
  `classicQuestFixtures.ts`) — Phase 0.75 bridge between the browser POC
  and the future WoW addon. Emits normalized events shaped around real
  addon hooks (`QUEST_DETAIL`, `QUEST_ACCEPTED`, `QUEST_TURNED_IN`,
  `GOSSIP_SHOW`, `ZONE_CHANGED_NEW_AREA`, `COMBAT_LOG_EVENT_UNFILTERED`),
  records raw events in localStorage, and ingests them into the active
  bible's level / zone / chronicle history. Ships with ~650 lines of
  Classic quest-chain fixtures (IDs, NPCs, Wowhead links, authored story
  cards — no copied quest prose).
- **Chronicle Reader tab** (`src/components/ChronicleReader.tsx`) — first-class
  story-reader view. Latest-session vs full-saga modes, "so what" insight
  cards, chapter timeline, model-generated campfire recaps using the
  selected provider.
- **WoW session trail** (`src/lib/sessionHistory.ts`) — groups addon events
  into discrete play sessions with per-session stats (XP, kills, quests,
  zones, deaths), expandable event history, and elevated recap UI in
  Chronicle Reader.
- **Mobile-responsive top tabs** — top-bar collapses gracefully on narrow
  viewports so the live Pages site is usable from a phone.

### Removed

- **Smoke Test tab** retired (`src/components/SmokeTest.tsx`,
  Smoke Test pricing strategy text). The Addon Simulator is now the
  primary dev harness for poking at providers without disturbing real
  character data.

### Fixed

- **`@google/genai 0.3.1` silently dropped `thinkingConfig`.** Upgraded
  to 2.6.0 — thinking is now actually disabled, costs are accurate.
- **NPC reply truncation.** `maxOutputTokens` raised to 2048 on the NPC
  assist call. Error messages now surface billed tokens vs visible word
  count when truncation does happen.
- **`storage` event scope.** Native `storage` only fires on OTHER tabs.
  Added `at:usage-updated`, `at:bible-updated`, and `at:apikey-updated`
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

- Renamed from "Azeroth Chronicle" to **Aftertale**.
- Repo: <https://github.com/Aftertale-App/Aftertale>.
- Live demo: <https://aftertale.gg/>.

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
    `base` must match, or the bundle 404s. Set `COA_BASE=/Aftertale/`
    only in CI so local dev stays at `/`.
14. **`public/` assets ignore `base` at write time.** Anything stored as
    a hardcoded `/path` string in JS/JSON (like NPC portrait URLs) must
    be wrapped in `assetUrl()` to survive Pages deployment.
