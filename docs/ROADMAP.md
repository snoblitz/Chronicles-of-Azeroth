# Roadmap

> **Launch sequencing (2026-05-28):** Launch order is now governed by
> [`docs/LAUNCH-PLAN.md`](./LAUNCH-PLAN.md), which sequences each tier into
> a phased ladder (Friends & Strangers → Public free → Quill & Coin →
> Companion → Chronicler/Loremaster). This **supersedes** the original
> *"nothing ships until all five tiers are coordinated"* framing — the
> architecture is unchanged, but each phase now stands on its own
> load-bearing question, gates, and kill criteria.
>
> **Canonical architecture:** [`docs/companion-architecture.md`](./companion-architecture.md).
> The Phase 1 (standalone Electron) and Phase 2 (WoW addon) framing in this
> doc's history is superseded by the multi-tier picture in that file.
> Items below labeled *"✅ Built (pre-launch)"* exist in `main` but are
> not yet deployed to users; the launch plan determines when they go live.

## Phase 0 — Browser POC  *(complete)*

Goal: validate that **LLM + character bible + memory** feels real before
investing in Electron and addon work.

- [x] Vite + React 19 + TypeScript scaffold
- [x] Provider abstraction (`LLMProvider` interface) — collapsed to OpenRouter-only 2026-05-26
- [x] `OpenRouterProvider` — OpenAI-compatible fetch path, no SDK (~2.6 KB shipped)
- [x] Pricing table + cost calculator (OpenRouter per-model rates)
- [x] Spend tracker (localStorage, day-keyed, 90-day retention)
- [x] Always-visible spend bar with averages-by-task table
- [x] CSV export of usage records
- [x] Smoke test UI (retired after Addon Simulator became the primary dev harness)
- [x] Reusable `ModelPicker` component shared by character creation and NPC chat
- [x] **Character creation interview** → `CharacterBible` in localStorage
- [x] **Multi-character storage** (`at.bible.roster.v1` + per-character entries) with a CharacterSelector dropdown in the header
- [x] **Full character sheet** with portrait, faction-tinted glow, voice, backstory, beliefs, motivations, fears, flaws, Hero's Truth banner, level + zone pills, chronicle log
- [x] **Inline bible editor** (Edit on the sheet → ReviewView with edit fields for name, homeland, level, zone, fears, flaws, Hero's Truth)
- [x] **NPC chat screen** with portrait header, Magni Bronzebeard portrait shipped, hero-assist drafts, transcript persistence per `(character × NPC)`
- [x] **Chronicle log** — quick-add entries, snapshot level + zone at write time, NPC prompt injects the last 5 deeds so NPCs can react to recent history
- [x] **Chronicle reader** — first-class story tab with latest-session/full-saga views, "so what" insight cards, chapter timeline, and model-generated campfire recaps
- [x] **API key entry UI** (Settings panel) so the deployed Pages bundle works without baked-in secrets
- [x] **Cloudflare Pages deploy** at [aftertale.gg](https://aftertale.gg/) — auto-builds on push to `main`; preview URLs per branch
- [x] **Addon Simulator** tab with Classic quest-chain fixtures, WoW API-shaped events, local event log, and ingest-to-chronicle memory
- [x] **Manual event entry** — effectively shipped via the Addon Simulator's ingest path (manual "I just killed Hogger"-style entries flow through the same WoW-shaped event bus into chronicle/NPC memory)

### Phase 0 exit criteria

Phase 0 is done when:

1. We can roll a character via interview and the bible feels distinct. ✅
2. We can have a 5-turn conversation with one famous NPC and it stays
   coherent + in-voice. ✅ (Magni Bronzebeard is the current bar)
3. The spend bar shows real per-task cost averages from sustained play
   (~80 Flash calls / ~$0.10 burned during the May 24 sim session — the
   averages-by-task table is populated with real data, not synthetic). ✅

### Phase 0.5 — Public POC on Cloudflare Pages  *(shipped)*

The Phase 0 bundle is deployed to Cloudflare Pages at
[aftertale.gg](https://aftertale.gg/) so Jeff can poke at the UI from mobile
during the day. The build has no secrets baked in — users paste their own
OpenRouter key into the in-app ⚙ Keys panel and it stays in their browser's
localStorage only. See [docs/DEVELOPMENT.md](./DEVELOPMENT.md#deployment-cloudflare-pages)
for the deploy flow.

The marketing landing page (also at `aftertale.gg`) ships from
`src/components/LandingPage.tsx` — five-page Magnus hero exhibit, onboarding
walkthrough ("From signup to first chapter"), supported-games pill row,
pricing tiers, and FAQ.

## Phase 0.75 — Event spike  *(in progress)*

Goal: validate that the **WoW API actually fires the events the Addon
Simulator promises**, with the payload shapes the simulator assumes,
across both Retail and Classic. De-risks Phase 1 (chat-log tailing) and
Phase 2 (Lua addon) before either commits to an architecture.

- [x] Pure event-capture addon at `addon/Aftertale/` (no AI, no
  UI) — listens for every event in `WowEventName`, plus adjacent events
  worth grafting in, and dumps payloads to `SavedVariables`
- [x] Multi-flavor TOC (Retail 120005, MoP Classic 50503, Cata Classic 40402, Wrath Classic 30405, TBC/Anniversary 20505, Vanilla 11508) — **six clients supported**
- [x] `scripts/install-addon.ps1` — junctions the addon source into every
  detected WoW client so edits are one-and-done
- [x] `SendAddonMessageLogged` mirror so we also validate the chat-log
  transport that Phase 1 and Phase 2 rely on
- [x] Combat-log sampling (`/aftertale sample N`) so `COMBAT_LOG_EVENT_UNFILTERED`
  doesn't drown the capture
- [x] **Capture 01** (Coldridge Valley, ~8 min) — proved chat log file
  doesn't exist by default and `/aftertale clear` bug wiped meta. Both fixed.
- [x] **Capture 02** (~29 min, Garygidney, Coldridge -> New Tinkertown
  with death + res + multi-option NPCs) — 240 events, closed most ❓ rows
- [x] `docs/EVENT-CONTRACT.md` — living spec with three major findings:
  (1) `SendAddonMessageLogged` self-whisper is broken, (2) combat-log
  file writes even without `RegisterEvent` access, (3) GUID changes on
  realm transfer + faction change but is stable otherwise
- [ ] **Phase 0.75-B**: addon enrichment pass (NPC names, quest titles,
  per-event location + player snapshot, loot drops). See session plan.
- [x] **Phase 0.75-C**: character detection (v0.2.0) — every new
  `UnitGUID` triggers a classification (`brand-new` / `boosted` /
  `pre-existing`) + chat-frame ping, with full identity + location +
  time-played snapshot in `AftertaleDB.characters` for the
  app's onboarding wizard to read
- [ ] Diff actual events against the simulator's `WowEventName` and
  payload assumptions; update `src/lib/addonEvents.ts` + simulator
  fixtures to match reality
- [ ] Classic Era capture (test `COMBAT_LOG_EVENT_UNFILTERED` restriction
  across flavors)

### Phase 0.75 exit criteria

Phase 0.75 is done when:

1. We have a `SavedVariables` capture from at least one Retail and one
   Classic session.
2. `docs/EVENT-CONTRACT.md` documents which events fire, with what
   payload, on which flavors — including any deltas from the simulator.
3. The simulator's fixtures have been updated (or explicitly kept) based
   on what reality showed.
4. We know whether `C_ChatInfo.SendAddonMessageLogged` reliably lands in
   `WoWChatLog.txt` for Phase 1's tailing to consume.

## Phase 1 — Multi-tier launch  *(in design)*

**Superseded framing:** Phase 1 used to mean "standalone Electron POC,"
Phase 2 used to mean "WoW addon." Both of those are now sub-components of
a single coordinated launch governed by
[`docs/companion-architecture.md`](./companion-architecture.md).

The WoW addon is largely shipped already (capture, restore, narrative
templates). The Electron Companion is one of several pieces of the broader
launch — it doesn't ship until the full stack is ready.

### Build order (from `companion-architecture.md` §12)

Tier-agnostic infrastructure first, user-facing UX last:

- [ ] Supabase project + schema migration (`users`, `characters`, `events`,
  `chapters`, `bible`, `companion_devices`, `pair_codes`, `subscriptions`)
- [ ] Auth UI (sign in / sign up / "keep your stuff" anonymous→account migration)
- [ ] Cloud sync layer (mirror localStorage → cloud for Free+account)
- [ ] OpenRouter integration (BYOK + managed key paths)
- [ ] Enrichment edge function (managed LLM via OpenRouter)
- [ ] Scribe's Desk page (`/desk` route, linear stepper) — refactor of
  current `ChronicleReader` import/export surface
- [ ] Pairing endpoint + UI (`/pair`, 6-digit TV-login pattern)
- [ ] Companion Electron app (separate repo, watches SV folder, writes
  the same `AftertaleRestore.lua` format)
- [ ] Web push service worker + VAPID setup (PWA notifications)
- [ ] Subscription / billing (Stripe Checkout → Supabase webhooks)
- [ ] Privacy page (what the LLM provider chain is, what we send)
- [ ] Resolve multi-WoW-account question (architecture doc §10 TODO)

### Phase 1 exit criteria

A new player can:
1. Sign up, paste an OpenRouter key, manually walk through Scribe's Desk
   end-to-end on the free tier.
2. OR upgrade to Companion, install the desktop app, pair it, and have a
   chapter land on their phone within a couple minutes of WoW logout —
   without doing any work between those two events.
3. Cancel Companion and walk back to the free tier with their chronicle
   intact and readable.

## Phase 2 — Polish and expand  *(post-launch)*

Reserved for genuinely-after-launch work. Anything that would compromise
the tier coordination goes here, not into Phase 1.

Candidate items (none committed):
- Per-task `enableThinking` flag on `LLMRequest` (deferred from Phase 1
  planning when LLM layer moved to OpenRouter)
- Daily budget cap with soft + hard limits (currently spend-bar-only)
- Optional TTS pipeline (ElevenLabs? local?)
- Chapter rollups using cheaper batch model paths
- Native mobile apps (currently PWA-only by design — see architecture
  doc §14)
- Multi-WoW-account households if §10 TODO resolves toward "support it"
- Community lore graph (shared NPC knowledge, opt-in)
- Discord posting of chapter summaries

## Known issues — round-trip rework (2026-05-25 stress test)

> **Related investigation:** Gemini billing discrepancy (counter says $0.19, Google billed $0.27 on the same 567-call run) — see [`docs/gemini-billing-investigation.md`](./gemini-billing-investigation.md). Controlled probe captured 2026-05-26T03:52Z; awaiting Cloud Billing update (~24h) to resolve.


End-to-end test with 580 captured events surfaced fundamental gaps in the
companion → addon round-trip. Bible renders, chapters group, but the
narrative read is broken. Needs rework before this pipeline is shippable.

### 1. Blob format is too lossy — ✅ Built (pre-launch) 2026-05-26
**Problem:** `at-CHRONICLE-V1` only carries `EntryID + paragraph`. The book's
resolvers and chapter grouping need event metadata that's getting dropped at
export time:
- `enrichment.zoneText` → chapters all collapse to "Unknown Lands"
- `enrichment.questTitle` → entries render as "Accepted: a quest" instead of "Accepted: The Defias Brotherhood"
- `enrichment.npcName`, `enrichment.levelText`, etc. → likewise templated
- `ZONE_CHANGED` args are empty in the blob (WoW event has no payload; addon queries `GetMinimapZoneText()` separately and stores on the event, not in args)

**Shipped:** Took option (b). `src/lib/chronicleSnippet.ts` produces a
`AftertaleRestore.lua` file carrying full event rows (incl. the
verbatim `enrichment` subtable, preserved through ingest via new
`AddonEvent.rawEnrichment`) plus enriched paragraphs + bible. Addon's new
`Companion/Restore.lua` registers a dedicated SV channel, merges on
`PLAYER_LOGIN`, and clears the global so the file wipes on next save.
Auto-leveled long-bracket escaping handles every Lua edge case (content
with `]==]`, trailing `]`, multi-line, etc.) — smoke-tested with a real
Lua interpreter. Old `/aftertale sync` blob path retained as fallback.

### 2. `/aftertale sync` EditBox is unusably slow — ✅ Built (pre-launch) 2026-05-26 (by #1)
**Problem:** 471 KB blob freezes WoW for 30-90s on paste; may never settle.
WoW's EditBox widget has O(n²) repaint cost at this size.

**Shipped:** The .lua snippet path (#1 above) bypasses the EditBox entirely.
User downloads the file, drops it into `WTF\Account\<ACCT>\SavedVariables\`,
launches WoW — done. `inject-chronicle.ps1` is no longer needed.

### 3. `/aftertale clear` orphans enriched paragraphs
**Problem:** Clearing wipes `db.events` but preserves `db.enriched`. Without
events to iterate, the book is empty even though paragraphs are loaded.

**Path forward:** Document the order-of-ops (clear *before* import, not after).
Optional: make `/aftertale sync` synthesize events when import keys don't have
matching `db.events` entries (companion-led restore vs. addon-led capture).

### 4. Companion enriches noise events (~95% waste)
**Problem:** Web companion currently enriches every imported event. Only
6 event types are narrative (`IsNarrativeEvent`): QUEST_ACCEPTED,
QUEST_TURNED_IN, PLAYER_LEVEL_UP, ZONE_CHANGED_NEW_AREA, PLAYER_DEAD,
ACHIEVEMENT_EARNED. On the 580-event test: 522 of 567 enriched paragraphs
were never displayed.

**Path forward:** See "Per-event-type filter" below — default the narrative
6 on, rest off. Drops cost ~95%.

### 5. Web enrichment state is volatile
**Problem:** `CompanionExport` stores enrichments in `useState`. A tab refresh
mid-run loses everything; a 580-event run takes ~10 minutes.

**Path forward:** Persist to `localStorage` keyed by `(charName, enrichmentId)`.
Resume-on-refresh + re-export without re-running LLM.

### 6. Lua bracket ambiguity in injected long-strings (resolved)
**Problem:** `enriched[[==[KEY]==]] = ...` parsed as `enriched[ [[==[KEY]==] ] ]`
— Lua tokenizes `[[` as a level-0 long-bracket opener. Caused
`unexpected symbol near '='` LUA_WARNING.

**Resolved in:** `inject-chronicle.ps1 v2` writes `enriched[ [==[KEY]==] ] = ...`
with spaces. Locking this in any future Lua-snippet generator (web side too).

## Backlog — small follow-ups

- [x] **Per-event-type filter in CompanionExport.** *(2026-05-26)* Added `src/lib/eventFilter.ts` + a category-grouped checkbox panel in `ChronicleReader`'s `CompanionExport`. Defaults to the 8 narrative events (matches addon `Templates.IsNarrativeEvent`, which was simultaneously expanded to add `ENCOUNTER_END` + `BOSS_KILL`). Per-event counts from the current SV import are shown next to each checkbox so the user sees where the cost lives. Persists to `localStorage` under `at.enrichFilter.v1` (global, not per-character). Unknown event types from future addon versions surface in their own "Unknown" group and persist if toggled on. New ENCOUNTER_END / BOSS_KILL template pools + `Preview` cases added to `Lore/Templates.lua`.
