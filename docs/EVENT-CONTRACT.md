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
| `QUEST_PROGRESS`       | ❓      | _not observed in capture 01_ | May only fire when the player opens the turn-in panel while objectives are *incomplete*. Capture 01 quest auto-completed. |
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
| `PLAYER_DEAD`      | ❓      | _not observed_   | Need a death capture. |
| `PLAYER_ALIVE`     | ❓      | _not observed_   | Need a death + res capture. |

### World state

| Event                       | Capture | Observed payload | Notes |
| --------------------------- | ------- | ---------------- | ----- |
| `ZONE_CHANGED`              | ❓      | _not observed_   | Capture 01 stayed in Coldridge Valley. Need a zone-line capture. |
| `ZONE_CHANGED_NEW_AREA`     | ❓      | _not observed_   | Same. |
| `ZONE_CHANGED_INDOORS`      | ❓      | _not observed_   | Same. |

### Dialogue

| Event           | Capture | Observed payload | Notes |
| --------------- | ------- | ---------------- | ----- |
| `GOSSIP_SHOW`   | ❓      | _not observed_   | Quest turn-ins in capture 01 did NOT trigger gossip — Retail's quest panel apparently bypasses gossip when only one quest option exists. Need a multi-quest NPC capture, or a vendor/innkeeper. |
| `GOSSIP_CLOSED` | ❓      | _not observed_   | Same. |

### Session lifecycle

| Event                    | Capture | Observed payload | Notes |
| ------------------------ | ------- | ---------------- | ----- |
| `PLAYER_LOGIN`           | ❓      | _not observed_   | Fires before `ADDON_LOADED` for fresh sessions. Captured on `/reload`, but `/coa clear` wiped it before play started. **Fixable**: see `/coa clear` bug below. |
| `PLAYER_ENTERING_WORLD`  | ❓      | _not observed_   | Same as above. |
| `PLAYER_LOGOUT`          | ✅ (01) | `()`             | Fires on `/logout`. **This is the last write before SavedVariables flushes** -- so any state we want in the dump must be set before logout completes. |

### Transport

| Event             | Capture | Observed payload | Notes |
| ----------------- | ------- | ---------------- | ----- |
| `CHAT_MSG_ADDON`  | ❓      | _did not fire_   | The addon called `SendAddonMessageLogged("COA", ..., "WHISPER", UnitName("player"))` for every captured event, but `CHAT_MSG_ADDON` never fired and no chat-log file was created. See "Chat-log transport reality" below — this is the most important finding from capture 01. |

---

## Major architectural findings

### 1. Chat-log transport reality (capture 01)

**Phase 1's plan was to tail `WoW\Logs\WoWChatLog.txt`** using chokidar.
**That file did not exist after capture 01.** Reason: WoW only writes a
chat log to disk if the player has run `/chatlog` to enable it. The
SavedVariables capture has 30 events in it. The disk has zero.

**Two implications:**

1. The addon must call `LoggingChat(true)` on load (and ideally
   `LoggingCombat(true)` too, for the combat-log fallback below). This
   is non-protected and works for unsigned addons.
2. We should verify the file actually appears + is appended in real time
   in capture 02 before treating chat-log tailing as a viable transport.

**Backup plan if chat-log tailing proves unreliable:** Phase 1 can read
SavedVariables directly. WoW flushes SavedVariables on `/logout` and
`/reload` — meaning end-of-session ingest works, but live-during-play
ingest doesn't. That's a real tradeoff to weigh in the Phase 1 design.

### 2. Combat-log strategy (capture 01)

`COMBAT_LOG_EVENT_UNFILTERED` is blocked from unsigned addons on Retail
Midnight. Three workable substitutes:

- **`/combatlog` → file tailing** — `LoggingCombat(true)` toggles it
  programmatically. Same chokidar approach as chat log, just a different
  file (`WoWCombatLog.txt`). Works for ALL combat events at the cost of
  parsing the log format.
- **`PLAYER_REGEN_DISABLED/ENABLED` bookends** — what we already have.
  Tells us "combat happened from T1 to T2" without per-hit detail. Often
  enough for chronicle purposes ("Magnus fought a band of troggs in the
  cave for 40 seconds and emerged victorious").
- **`UNIT_HEALTH` + selective `UNIT_*` events** — gives partial signal
  without the protected event, but is noisy.

Recommendation: combine bookends with combat-log file tailing (toggled
by our addon) for narrative needs. Defer the decision to Phase 1.

### 3. `QUEST_TURNED_IN` carries rewards (capture 01)

Better than expected: `QUEST_TURNED_IN(questID, xpReward, moneyCopper)`
gives us reward XP and money *directly in the event payload*. No
follow-up API call needed to enrich chronicle entries with "you earned
230 XP and 55 copper." Simulator should be updated to surface this.

### 4. `PLAYER_LEVEL_UP` is a goldmine (capture 01)

9 args, all stat deltas + new talent count. Chronicles can write
"Magnus reached level 2 and gained 29 stamina, 1 strength, 1 agility"
purely from this event. No `GetPlayerStat` follow-up calls.

---

## Open questions for capture 02

- [ ] Does `LoggingChat(true)` actually create `WoWChatLog.txt` and does
  `SendAddonMessageLogged` then land in it?
- [ ] Does `GOSSIP_SHOW` fire when right-clicking a multi-option NPC
  (innkeeper, flight master, vendor)?
- [ ] What payload does `ZONE_CHANGED_NEW_AREA` carry on Retail Midnight?
- [ ] `PLAYER_DEAD` / `PLAYER_ALIVE` payloads.
- [ ] Does `PLAYER_LOGIN` fire on `/reload`, or only on cold login?
- [ ] On Classic Era (1.15.x), is `COMBAT_LOG_EVENT_UNFILTERED` still
  restricted, or is the lockdown Retail-specific?

---

## Bugs the captures surfaced in our own addon

- **`/coa clear` wipes `meta`.** It currently sets
  `ChroniclesOfAzerothDB = nil` then re-ensures, which destroys the
  meta block populated by `ADDON_LOADED`. Capture 01's `meta` table is
  empty for this reason. Fix: clear `events` + `counts` only.
- **No `LoggingChat`/`LoggingCombat` toggling.** Addon should enable
  both on load to make the file-tailing transport actually viable.