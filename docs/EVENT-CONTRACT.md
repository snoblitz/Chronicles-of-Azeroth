# Event contract -- reality vs. simulator

Status: **living doc**. Captures from real WoW sessions inform what the
Addon Simulator (`src/components/AddonSimulator.tsx`) emits and what
Phase 1's chat-log tailing has to parse.

Each finding is tagged with the capture session it came from. The raw
SavedVariables blobs live (locally) in the session-state `files/`
directory so we can re-diff them later.

---

## Captures so far

| #  | When                | Flavor           | Build         | Character      | Where         | Duration | File                                    |
| -- | ------------------- | ---------------- | ------------- | -------------- | ------------- | -------- | --------------------------------------- |
| 01 | 2026-05-25 08:49-08:57 | Retail (Midnight) | 12.0.5.67602  | NONKEYPICK     | Coldridge Valley (lvl 1→2 dwarf starter) | ~8 min   | `capture-01-retail.lua` (session-state) |
| 02 | 2026-05-25 10:14-10:43 | Retail (Midnight) | 12.0.5.67602  | Garygidney (Earthen Ring) | Coldridge → New Tinkertown → death + res + gossip | ~29 min | `capture-02-retail.lua` + `capture-02-chatlog.txt` (session-state) |

---

## Per-event findings

Legend:
- ✅ matches simulator assumption
- ⚠️ payload shape differs
- ❓ never observed yet in any capture
- 🚫 blocked / cannot register on this flavor

### Quest flow

| Event                  | Capture | Observed payload          | Notes |
| ---------------------- | ------- | ------------------------- | ----- |
| `QUEST_DETAIL`         | ✅ (01) | `(questStartItemID)` — `"0"` when not from an item | One arg, not a questID. **Lookup-required**: questID has to be fetched via `GetQuestID()` while the detail panel is open. |
| `QUEST_ACCEPTED`       | ✅ (01) | `(questID)` — e.g. `"24469"` | One arg. Quest name + objectives require `C_QuestLog.GetTitleForQuestID(id)` + `C_QuestLog.GetQuestObjectives(id)`. |
| `QUEST_PROGRESS`       | ✅ (02) | `()` — no args | Fires when opening the turn-in panel while objectives are still incomplete. State query required. Capture 02 caught it 3 times. |
| `QUEST_COMPLETE`       | ⚠️ (01) | `()` — **no args** | Simulator currently doesn't model this distinctly. Fires when the turn-in panel opens and is ready to hand in. State has to be queried (`GetRewardXP`, `GetNumQuestRewards`, etc.). |
| `QUEST_TURNED_IN`      | ⚠️ (01) | `(questID, xpReward, moneyCopper)` — `("24469", "230", "55")` | **3 args**, not 1. Simulator assumes only `questID`. XP and money reward are right there in the payload — no lookup needed. |
| `QUEST_REMOVED`        | ⚠️ (01) | `(questID, wasReplay)` — `("24469", "false")` | **2 args**. `wasReplay` is a Retail addition; older patches were 1 arg. |
| `UNIT_QUEST_LOG_CHANGED` | ✅ (01) | `(unitTarget)` — always `"player"` for the local player | Fires *often* — 9 times in 8 minutes. Treat as a "something changed, re-poll quest log" signal, not as authoritative data. |

### Combat

| Event                          | Capture | Observed payload | Notes |
| ------------------------------ | ------- | ---------------- | ----- |
| `PLAYER_REGEN_DISABLED`        | ✅ (01) | `()` | Entered combat. 7 fires in 8 min of trogg-bashing. |
| `PLAYER_REGEN_ENABLED`         | ✅ (01) | `()` | Left combat. Pairs cleanly with REGEN_DISABLED. |
| `COMBAT_LOG_EVENT_UNFILTERED`  | 🚫 (01) | _refused_ | **Protected on Retail Midnight for unsigned addons.** Client fires `ADDON_ACTION_FORBIDDEN` synchronously during `RegisterEvent`. See "Combat log strategy" below. |

### Character state

| Event              | Capture | Observed payload | Notes |
| ------------------ | ------- | ---------------- | ----- |
| `PLAYER_LEVEL_UP`  | ⚠️ (01) | 9 args — `(level, hpΔ, manaΔ, numTalents, numPvpTalentSlots, strΔ, agiΔ, staΔ, intΔ)` — `("2","29","0","0","0","1","1","29","1")` | Simulator assumes 1 arg (`level`). Reality is *rich* — stat deltas land directly in the event, no follow-up calls needed. Worth grafting into chronicle entries ("you grew stronger -- +29 stamina"). |
| `PLAYER_DEAD`      | ✅ (02) | `()` | Fires when the player hits 0 HP. Use `UnitIsDead("player")` for state. |
| `PLAYER_ALIVE`     | ✅ (02) | `()` | Fires on release-to-corpse AND on resurrection — capture 02 saw 2 fires for 1 death. **Important:** can't distinguish "ghost" from "alive" via the event payload; query `UnitIsGhost("player")`. |

### World state

| Event                       | Capture | Observed payload | Notes |
| --------------------------- | ------- | ---------------- | ----- |
| `ZONE_CHANGED`              | ✅ (02) | `()` | Fires *frequently* — 17 times in 29 min. Often fires for sub-zone transitions inside the same parent zone. State via `GetZoneText()` / `GetSubZoneText()`. |
| `ZONE_CHANGED_NEW_AREA`     | ✅ (02) | `()` | Fires only on parent-zone changes — 6 times in capture 02 (Coldridge → Tinkertown etc.). The right event for chronicle "you entered Foo" entries. |
| `ZONE_CHANGED_INDOORS`      | ❓      | _0 fires in capture 02 despite indoor visits_ | Possible Retail behavior shift -- the inn/building Jeff entered may not have registered as "indoor" terrain at the engine level. Worth re-testing in a dungeon entrance or a known-indoor structure. |

### Dialogue

| Event           | Capture | Observed payload | Notes |
| --------------- | ------- | ---------------- | ----- |
| `GOSSIP_SHOW`   | ✅ (02) | `("<nil>")` — one nil arg, effectively payload-less | Fires for multi-option NPCs (innkeepers, flight masters, vendors with quests). 24 fires in capture 02. The event itself carries no NPC info — use `C_GossipInfo.GetOptions()` / `C_GossipInfo.GetAvailableQuests()` while the panel is open. |
| `GOSSIP_CLOSED` | ✅ (02) | `("false")` — single bool | The bool appears to be a "was-forced-close" flag. 21 fires (3 fewer than SHOW, consistent with the player closing some panels by walking away vs. by ESC). |

### Session lifecycle

| Event                    | Capture | Observed payload | Notes |
| ------------------------ | ------- | ---------------- | ----- |
| `PLAYER_LOGIN`           | ✅ (02) | `()` | Fires once per game-client session — does NOT fire on `/reload`. Use this for "first time this session" setup. |
| `PLAYER_ENTERING_WORLD`  | ✅ (02) | `(isInitialLogin, isReloadingUi)` — `(true, false)` for a fresh login | **2 bool args**, very useful: `isInitialLogin=true` only on cold login; `isReloadingUi=true` on `/reload`. Both false on zone-line crossings into instances. The right event to attach "session start" logic to. |
| `PLAYER_LOGOUT`          | ✅ (01) | `()`             | Fires on `/logout`. **This is the last write before SavedVariables flushes** -- so any state we want in the dump must be set before logout completes. |

### Transport

| Event             | Capture | Observed payload | Notes |
| ----------------- | ------- | ---------------- | ----- |
| `CHAT_MSG_ADDON`  | 🚫 (02) | _did not fire; addon messages NOT in chat log_ | See "Chat-log transport reality" below — **`SendAddonMessageLogged("COA", ..., "WHISPER", self)` does NOT land in `WoWChatLog.txt` and does NOT fire `CHAT_MSG_ADDON` locally**. Self-whispers are silently dropped before reaching either pipeline. This is the single biggest architectural finding of capture 02. |

---

## Major architectural findings

### 1. Chat-log transport partially works -- but not via addon messages (captures 01 & 02)

Capture 01 found that `WoWChatLog.txt` doesn't exist by default; capture 02
proved the addon's auto-toggle (`LoggingChat(true)` in `ADDON_LOADED`)
fixes that — the file appeared at 11.5 KB / 181 lines.

**BUT capture 02 also surfaced the real problem:** the addon called
`C_ChatInfo.SendAddonMessageLogged("COA", payload, "WHISPER", self)` for
every captured event, and **zero of those messages landed in
`WoWChatLog.txt`**. `CHAT_MSG_ADDON` also never fired locally. Self-whisper
addon messages are silently dropped — either by the client never actually
transmitting them, or by the chat-log writer filtering them out.

**Verified content of `WoWChatLog.txt` includes:** NPC chat,
player chat, system messages, loot drops, quest accepts, /cheer emotes,
discovery XP. Everything that hits a real chat frame.

**Does NOT include:** addon messages (logged or otherwise), even when
addressed to other players (untested but consistent with API docs);
SavedVariables data; combat log lines.

**Conclusion:** `WoWChatLog.txt` is a viable Phase 1 transport for
*chat-frame-visible* signal — `CHAT_MSG_LOOT`, `CHAT_MSG_SYSTEM`,
`CHAT_MSG_QUEST`, monster speech, player chat. It is NOT a viable
transport for our own structured addon events.

**Three real transport options for addon-driven events:**

1. **SavedVariables only (current spike).** Reliable, structured,
   end-of-session ingest only (flushes on `/reload` and `/logout`).
   For chronicle generation that happens after a play session, this is
   probably fine. Phase 1 can read SVs directly.
2. **Print to a custom hidden chat frame.** `DEFAULT_CHAT_FRAME:AddMessage`
   writes to the chat frame, which IS logged by `/chatlog`. We can create
   a hidden chat frame that doesn't display but still hits the writer.
   Real-time, but needs verification that hidden frames still log.
3. **Live SavedVariables polling.** `C_AddOns.SaveAddOnsButton()` doesn't
   exist as a flush API, so this requires periodic `/reload` (disruptive)
   or accepting the end-of-session model. Not really viable for live.

**Recommendation:** Phase 1 designs around SavedVariables ingest at session
boundaries (`/reload` is cheap and survivable; `/logout` is natural).
Real-time can be added later via option 2 if needed.

### 2. Combat-log file IS available even without RegisterEvent (capture 02)

This is the biggest *good* surprise. `COMBAT_LOG_EVENT_UNFILTERED` is
protected from unsigned-addon `RegisterEvent`, but **Blizzard's internal
combat-log file writer doesn't care about that.** `LoggingCombat(true)`
produced `WoWCombatLog-052526_101443.txt` at **1.3 MB** from 29 minutes of
play.

**The file is date-stamped per session** (`WoWCombatLog-<DDMMYY>_<HHMMSS>.txt`),
not a single append-only file. Phase 1's tailer needs to discover the
newest file in `Logs/`, not hardcode a name.

**Implication:** Phase 1 gets the full combat log via file tail with
zero addon-side protection issues. Every damage event, every spell cast,
every heal — all in `Logs/WoWCombatLog-*.txt`. The protected event was
never the right path; the file always was.

### 3. `QUEST_TURNED_IN` carries rewards (capture 01)

Better than expected: `QUEST_TURNED_IN(questID, xpReward, moneyCopper)`
gives us reward XP and money *directly in the event payload*. No
follow-up API call needed to enrich chronicle entries with "you earned
230 XP and 55 copper." Simulator should be updated to surface this.

### 4. `PLAYER_LEVEL_UP` is a goldmine (capture 01)

9 args, all stat deltas + new talent count. Chronicles can write
"Magnus reached level 2 and gained 29 stamina, 1 strength, 1 agility"
purely from this event. No `GetPlayerStat` follow-up calls.

### 5. `PLAYER_ENTERING_WORLD` distinguishes login from reload (capture 02)

`(isInitialLogin, isReloadingUi)` — two bools tell the addon exactly how
it was loaded. Cold login = `(true, false)`. `/reload` = `(false, true)`.
Zone-line into instance = `(false, false)`. The right hook for "first
time this session" setup, "addon was just reloaded" diagnostics, and
"player just zoned" UX.

### 6. `ZONE_CHANGED` is too noisy; `ZONE_CHANGED_NEW_AREA` is the chronicle event (capture 02)

17 `ZONE_CHANGED` fires in 29 min vs. 6 `ZONE_CHANGED_NEW_AREA` fires.
`ZONE_CHANGED` includes sub-zone transitions (walking from "Coldridge
Pass" sub-zone to a different patch of the same parent zone). For
chronicle entries that say "you entered Dun Morogh", filter on
`ZONE_CHANGED_NEW_AREA` only.

---

## Open questions for capture 03

- [ ] Why doesn't `ZONE_CHANGED_INDOORS` fire when entering an inn? Try a
  dungeon or known-indoor structure to differentiate "engine-indoor" vs
  "narrative-indoor".
- [ ] Does `DEFAULT_CHAT_FRAME:AddMessage` from a *hidden* chat frame
  still get logged by `/chatlog`? If yes, we have a real-time addon
  event transport without UI noise.
- [ ] On Classic Era (1.15.x), is `COMBAT_LOG_EVENT_UNFILTERED` still
  restricted, or is the lockdown Retail-specific?
- [ ] What does `ENCOUNTER_START` / `ENCOUNTER_END` look like (not in our
  EVENTS list yet; only meaningful in dungeons/raids).
- [ ] What does `LOOT_OPENED` / `LOOT_READY` carry? (also not registered)

---

## Bugs the captures surfaced in our own addon

- ✅ ~~`/coa clear` wipes `meta`~~ — fixed in capture 02 prep. Capture 02's
  `meta` table is fully populated (`characterName`, `realm`, build,
  `chatLogEnabled`, `combatLogEnabled`, etc.).
- ✅ ~~No `LoggingChat`/`LoggingCombat` toggling~~ — fixed in capture 02
  prep. Both files now appear automatically on addon load.
- [ ] `SendAddonMessageLogged` self-whisper round-trip does not work.
  Either remove the mirror entirely (it's dead code) or replace it with a
  hidden-chat-frame `AddMessage` once that approach is validated.