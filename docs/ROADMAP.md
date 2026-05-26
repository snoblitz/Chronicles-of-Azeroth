# Roadmap

The full multi-phase plan lives in
`~/.copilot/session-state/<session-id>/plan.md`. This file is the public-facing
summary kept in the repo.

## Phase 0 — Browser POC  *(complete)*

Goal: validate that **LLM + character bible + memory** feels real before
investing in Electron and addon work.

- [x] Vite + React 19 + TypeScript scaffold
- [x] Provider abstraction (`LLMProvider` interface)
- [x] `GeminiProvider` using `@google/genai` 2.6.0 (thinking actually disabled)
- [x] `AnthropicProvider` using `@anthropic-ai/sdk`
- [x] Pricing table + cost calculator
- [x] Spend tracker (localStorage, day-keyed, 90-day retention)
- [x] Always-visible spend bar with averages-by-task table
- [x] CSV export of usage records
- [x] Smoke test UI (retired after Addon Simulator became the primary dev harness)
- [x] Real Gemini model IDs discovered + wired (`gemini-2.5-flash` etc.)
- [x] Gemini thinking-tokens accounted for in cost
- [x] Reusable `ModelPicker` component shared by character creation and NPC chat
- [x] **Character creation interview** → `CharacterBible` in localStorage
- [x] **Multi-character storage** (`coa.bible.roster.v1` + per-character entries) with a CharacterSelector dropdown in the header
- [x] **Full character sheet** with portrait, faction-tinted glow, voice, backstory, beliefs, motivations, fears, flaws, core quote, level + zone pills, chronicle log
- [x] **Inline bible editor** (Edit on the sheet → ReviewView with edit fields for name, homeland, level, zone, fears, flaws, quote)
- [x] **NPC chat screen** with portrait header, Magni Bronzebeard portrait shipped, hero-assist drafts, transcript persistence per `(character × NPC)`
- [x] **Chronicle log** — quick-add entries, snapshot level + zone at write time, NPC prompt injects the last 5 deeds so NPCs can react to recent history
- [x] **Chronicle reader** — first-class story tab with latest-session/full-saga views, "so what" insight cards, chapter timeline, and model-generated campfire recaps
- [x] **API key entry UI** (Settings panel) so the deployed Pages bundle works without baked-in secrets
- [x] **GitHub Pages deploy workflow** (`.github/workflows/deploy.yml`)
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

### Phase 0.5 — Public POC on GitHub Pages  *(shipped)*

The Phase 0 bundle is deployed to GitHub Pages so Jeff can poke at the UI
from mobile during the day. The build has no secrets baked in — users
paste their own Gemini / Anthropic key into the in-app Settings panel and
it stays in their browser's localStorage only. See
[docs/DEVELOPMENT.md](./DEVELOPMENT.md#deployment) for the deploy flow.

## Phase 0.75 — Event spike  *(in progress)*

Goal: validate that the **WoW API actually fires the events the Addon
Simulator promises**, with the payload shapes the simulator assumes,
across both Retail and Classic. De-risks Phase 1 (chat-log tailing) and
Phase 2 (Lua addon) before either commits to an architecture.

- [x] Pure event-capture addon at `addon/ChroniclesOfAzeroth/` (no AI, no
  UI) — listens for every event in `WowEventName`, plus adjacent events
  worth grafting in, and dumps payloads to `SavedVariables`
- [x] Multi-flavor TOC (Retail 120005, Mists 50503, TBC 20505, Vanilla 11508)
- [x] `scripts/install-addon.ps1` — junctions the addon source into every
  detected WoW client so edits are one-and-done
- [x] `SendAddonMessageLogged` mirror so we also validate the chat-log
  transport that Phase 1 and Phase 2 rely on
- [x] Combat-log sampling (`/coa sample N`) so `COMBAT_LOG_EVENT_UNFILTERED`
  doesn't drown the capture
- [x] **Capture 01** (Coldridge Valley, ~8 min) — proved chat log file
  doesn't exist by default and `/coa clear` bug wiped meta. Both fixed.
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
  time-played snapshot in `ChroniclesOfAzerothDB.characters` for the
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

## Phase 1 — Electron companion app  *(planned)*

Goal: long-running desktop app with durable storage and the start of real
quest-log integration via chat log tailing.

- [ ] Electron 28 main / preload / renderer split
- [ ] better-sqlite3 + sqlite-vec for RAG memory
- [ ] keytar for OS keychain API key storage
- [ ] chokidar tailing `WoW\Logs\WoWChatLog.txt` (or Combat Log)
- [ ] Migrate localStorage → SQLite (same schema, just different backend)
- [ ] Provider calls move from renderer → main process IPC
- [ ] Daily budget cap with soft + hard limits
- [ ] Optional TTS pipeline (ElevenLabs? local?)
- [ ] Chapter rollups using the Gemini Batch API (50% cheaper)
- [ ] Per-task `enableThinking` flag on `LLMRequest`

### Phase 1 exit criteria

We can play WoW for 4 hours and the app builds a coherent, in-character
narrative of what happened — purely from chat log tailing + manual NPC
interactions, without any addon yet.

## Phase 2 — WoW addon  *(planned, Path B)*

Goal: deep, real-time integration so NPC chat and quest events feel native
to the game.

- [ ] Fork / extend YUI-Dialogue addon (Peterodox)
- [ ] Hook `QUEST_DETAIL`, `GOSSIP_SHOW`, `QUEST_TURNED_IN`, `UNIT_SPELLCAST`
- [ ] Render AI-generated NPC responses in YUI-Dialogue's chrome
- [ ] Emit structured events via `C_ChatInfo.SendAddonMessageLogged()` so the
      Electron app can ingest via chat log
- [ ] Bidirectional: app pushes NPC dialogue back to addon for display
- [ ] In-game "ask the historian" macro
- [ ] Combat log significant-event detection (boss kills, deaths, etc.)

### Phase 2 exit criteria

A real WoW session where the addon-driven NPC chat is indistinguishable in
feel from Blizzard's own dialogue, and the chronicle of the session reads
like a chapter of a novel afterwards.

## Beyond Phase 2

- Multi-character chronicles (alts)
- "Read my story" mode — browse past sessions chapter-by-chapter, zone-by-zone
- Voice acting via TTS with consistent per-NPC voices
- Optional Discord posting of chapter summaries
- Community lore graph (shared NPC knowledge, opt-in)

## Known issues — round-trip rework (2026-05-25 stress test)

> **Related investigation:** Gemini billing discrepancy (counter says $0.19, Google billed $0.27 on the same 567-call run) — see [`docs/gemini-billing-investigation.md`](./gemini-billing-investigation.md). Controlled probe captured 2026-05-26T03:52Z; awaiting Cloud Billing update (~24h) to resolve.


End-to-end test with 580 captured events surfaced fundamental gaps in the
companion → addon round-trip. Bible renders, chapters group, but the
narrative read is broken. Needs rework before this pipeline is shippable.

### 1. Blob format is too lossy
**Problem:** `COA-CHRONICLE-V1` only carries `EntryID + paragraph`. The book's
resolvers and chapter grouping need event metadata that's getting dropped at
export time:
- `enrichment.zoneText` → chapters all collapse to "Unknown Lands"
- `enrichment.questTitle` → entries render as "Accepted: a quest" instead of "Accepted: The Defias Brotherhood"
- `enrichment.npcName`, `enrichment.levelText`, etc. → likewise templated
- `ZONE_CHANGED` args are empty in the blob (WoW event has no payload; addon queries `GetMinimapZoneText()` separately and stores on the event, not in args)

**Path forward:** Either (a) extend the blob grammar with per-entry metadata
columns, or (b) drop the blob format entirely for the bypass path and ship
a structured `.lua` snippet from the web companion that contains full
`db.events` + `db.enriched` + `db.bible`. Option (b) is cleaner and is what
`inject-chronicle.ps1` had to reverse-engineer this round.

### 2. `/coa sync` EditBox is unusably slow
**Problem:** 471 KB blob freezes WoW for 30-90s on paste; may never settle.
WoW's EditBox widget has O(n²) repaint cost at this size.

**Workaround in place:** `inject-chronicle.ps1` writes directly to the SV
file. Works but requires WoW closed + a manual PowerShell step.

**Path forward:** Add a "Download .lua snippet" button to `CompanionExport`
that produces the complete restoration file. User saves into `WTF\Account\
<ACCOUNT>\SavedVariables\`, launches WoW, done. Skip the EditBox entirely
as the supported path.

### 3. `/coa clear` orphans enriched paragraphs
**Problem:** Clearing wipes `db.events` but preserves `db.enriched`. Without
events to iterate, the book is empty even though paragraphs are loaded.

**Path forward:** Document the order-of-ops (clear *before* import, not after).
Optional: make `/coa sync` synthesize events when import keys don't have
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

- [ ] **Per-event-type filter in CompanionExport.** ChronicleReader's enrich panel currently runs across every imported addon event. Real SV files contain a long tail of low-signal events (UNIT_QUEST_LOG_CHANGED, PLAYER_REGEN_*, CHAT_MSG_LOOT/MONEY, TIME_PLAYED_MSG) that aren't story-worthy and burn LLM tokens. Add a small checkbox grid keyed by `wowEvent` — sensible defaults checked (QUEST_TURNED_IN, QUEST_ACCEPTED, PLAYER_LEVEL_UP, PLAYER_DEAD, ENCOUNTER_END, BOSS_KILL, ZONE_CHANGED_NEW_AREA), noisy ones unchecked. Persist selection in localStorage so it sticks across sessions. Estimated cost saving on a 580-event file: ~95% (drops to ~30 enriched events). Cheap to build, big lever.
