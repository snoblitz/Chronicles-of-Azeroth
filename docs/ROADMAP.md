# Roadmap

The full multi-phase plan lives in
`~/.copilot/session-state/<session-id>/plan.md`. This file is the public-facing
summary kept in the repo.

## Phase 0 — Browser POC  *(in progress)*

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
- [ ] Manual event entry (combat log style: "I just killed Hogger") feeds NPC memory automatically
- [ ] Side-by-side A/B comparison view (same prompt, two models, diff)
- [ ] More NPCs beyond Magni / Muradin (Brann, Falstad, Moira)

### Phase 0 exit criteria

Phase 0 is done when:

1. We can roll a character via interview and the bible feels distinct. ✅
2. We can have a 5-turn conversation with one famous NPC and it stays
   coherent + in-voice. ✅ (Magni Bronzebeard is the current bar)
3. The spend bar shows real per-task cost averages from at least 100 calls.
4. We've A/B'd Flash vs Pro vs Sonnet on the same prompts and have an
   opinion on which model wins per task.

### Phase 0.5 — Public POC on GitHub Pages  *(shipped)*

The Phase 0 bundle is deployed to GitHub Pages so Jeff can poke at the UI
from mobile during the day. The build has no secrets baked in — users
paste their own Gemini / Anthropic key into the in-app Settings panel and
it stays in their browser's localStorage only. See
[docs/DEVELOPMENT.md](./DEVELOPMENT.md#deployment) for the deploy flow.

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
