# Event Candidates — Chronicle Expansion Backlog

> **Living doc.** Jeff is brainstorming additional events the addon could log
> to make the chronicle richer. We capture every idea here, grade it for
> narrative value + cross-flavor safety, then promote the keepers into
> `Aftertale.lua`'s `EVENTS` table and the `Lore/Templates.lua` narrator copy.

## Guiding principle

Only log events that produce a **meaningful story beat** — a moment a player
would actually want to read about later. Telemetry noise (auction house, bank,
UI open/close) stays out. When in doubt: "would this be a sentence in the
chronicle?"

## Cross-flavor reality

The addon ships 6 .toc flavors (Vanilla → Retail). Many modern collection /
PvP events don't exist on Classic. Two safe patterns:

1. **`CHAT_MSG_*` system-string parsing** — works on every flavor (we already
   use it for loot/money). Downside: locale-dependent string matching.
2. **Register both modern + legacy paths** — `registerEvents()` already
   swallows per-flavor `RegisterEvent` refusals, so dual-registration is safe.

---

## Already logged (baseline — 24 events)

Lifecycle (`PLAYER_LOGIN/ENTERING_WORLD/LOGOUT`), full quest flow, gossip,
zone changes, `PLAYER_LEVEL_UP/DEAD/ALIVE`, `ACHIEVEMENT_EARNED`, combat
bookends (`PLAYER_REGEN_*`), loot/money (`LOOT_OPENED`, `CHAT_MSG_LOOT/MONEY`),
`TIME_PLAYED_MSG`, instance bookends (`ENCOUNTER_END`, `BOSS_KILL`).

Combat log (`COMBAT_LOG_EVENT_UNFILTERED`) intentionally **off** — Retail
Midnight refuses it for unsigned addons.

---

## Tier 1 — add now (cross-flavor, high story value)

| Event | Payload | Beat |
| --- | --- | --- |
| `CHAT_MSG_COMBAT_FACTION_CHANGE` | message | reputation arcs ("became Honored with…") |
| `CHAT_MSG_SKILL` | message | profession skill-ups |
| `CHAT_MSG_SYSTEM` | message | catch-all: flight path discovered, title earned, hearth set |
| `LEARNED_SPELL_IN_TAB` / `LEARNED_SPELL_IN_SKILL_LINE` | spellID… | new ability / learned to ride |
| `PLAYER_GUILD_UPDATE` | unit | joined a guild |
| `CONFIRM_BINDER` + `PLAYER_UPDATE_RESTING` | — | made a town their home (hearth bind) |

## Tier 2 — modern flavors only (gate per-flavor)

| Event | Payload | Beat |
| --- | --- | --- |
| `NEW_MOUNT_ADDED` | mountID | notable mount |
| `NEW_RECIPE_LEARNED` | recipeID | recipe mastered |
| `NEW_TOY_ADDED` / `NEW_PET_ADDED` | id | collection milestones |
| `KNOWN_TITLES_UPDATE` | — | title earned (diff the set) |
| `MAJOR_FACTION_RENOWN_LEVEL_CHANGED` | factionID, newLevel | Renown progression (DF+) |
| `CHALLENGE_MODE_COMPLETED` / `SCENARIO_COMPLETED` | — | M+ / scenario clears |
| `PLAYER_EQUIPMENT_CHANGED` | slot, hasCurrent | gear-up beats (filter to epics) |

## Tier 3 — texture / optional

`DUEL_FINISHED`, `PVP_KILL` / honor, `GROUP_ROSTER_UPDATE` (companions met),
`PET_BATTLE_OVER`, `TAXIMAP_OPENED`. Special case: **Hardcore death** (Classic)
off `PLAYER_DEAD` — the heaviest beat in the game.

## Skip (pure noise)

Auction house, bank, barber, calendar, catalog/store, azerite/artifact internals.

---

## Feature: Battlegrounds (self-contained PvP story)

A BG is a complete narrative unit: an open, a close, a win/loss, and personal
heroics. High value, ship as its own group.

### Start / finish

| Beat | Modern (BfA 8.2+) | Classic flavors |
| --- | --- | --- |
| Match starts | `PVP_MATCH_ACTIVE` *(no args)* | `UPDATE_BATTLEFIELD_STATUS` status `"active"` |
| Match ends | `PVP_MATCH_COMPLETE` → **`winner, duration`** | final `UPDATE_BATTLEFIELD_SCORE` once `GetBattlefieldWinner()` is non-nil |
| Queue/enter/leave | `UPDATE_BATTLEFIELD_STATUS` | same |

- `winner`: 0 = Alliance, 1 = Horde. Compare vs player faction → win/loss line.
- `duration`: seconds. → "won the Warsong, 12 minutes hard-fought."
- ⚠️ `PVP_MATCH_*` added in 8.2 — **absent on Classic .tocs**; use the legacy
  scoreboard-winner detection there.

### Performance stats (cross-flavor)

On match end: `RequestBattlefieldScoreData()`, then walk
`GetNumBattlefieldScores()` and match the player's own row via
`GetBattlefieldScore(i)`:

```
name, killingBlows, honorableKills, deaths, honorGained,
faction, race, class, classToken, damageDone, healingDone, ...
```

Log: killing blows, HKs, deaths, honor, damage, healing — an after-action stat
line, same shape as the popover stat sheet.

### Objectives (flags/bases) — modern only

`C_PvP.GetScoreInfoByPlayerGuid(guid).stats` carries per-BG objectives (flags
captured, bases assaulted) on Retail. Classic: parse `CHAT_MSG_BG_SYSTEM_*`
("X captured the flag") if we want them.

### Design note

A BG fires a **burst** of status/score events. Emit **one** consolidated
"battleground" beat on completion (win/loss + duration + personal stats),
not a stream — mirror the combat-log sampling guard.

---

## Implementation order (proposed)

1. **Battlegrounds beat** — self-contained, high value, ship first.
2. **Tier 1** — cross-flavor `CHAT_MSG_*` + spell/guild/hearth beats.
3. **Tier 2** — modern collection/renown/M+ beats, per-flavor gated.
4. **Tier 3** — texture beats, as desired.

## Feature: Identity / cosmetic

| Event | Payload | Beat |
| --- | --- | --- |
| `BARBER_SHOP_APPEARANCE_APPLIED` | none | "reforged their appearance" — a character redefining themselves |

Reliable, fires on apply. Modern barber only. Low effort, nice flavor.

## Feature: Delves (TWW 11.0+, gate per-flavor)

A delve is a self-contained dungeon run — clean enter/exit/complete beats.

| Beat | Signal |
| --- | --- |
| Enter | `WALK_IN_DATA_UPDATE` (no payload) **+** confirm `C_DelvesUI.IsInDelve()` |
| Tier / id | `C_DelvesUI.GetCurrentDelveTier()`, `C_DelvesUI.GetActiveDelveID()` |
| Complete | `SCENARIO_COMPLETED` (delves are scenarios; gate on `IsInDelve()`) |

- `WALK_IN_DATA_UPDATE` confirmed (added 11.0): "player or private party member
  joins a new walk-in instance, or the instance is shut down." It's **generic**
  to all walk-in instances — must qualify with `C_DelvesUI.IsInDelve()`.
- Beat: "delved into [name] at tier 8, and made it out."

## Feature: Housing (Midnight 12.0+) — EXPERIMENTAL, ship last

Event names confirmed from Blizzard's own Midnight housing UI source, but
payloads are **not** in the generated API docs yet and most events are
UI-plumbing that fire in bursts. **Needs live `/etrace` validation before we
trust it.** Retail-Midnight-only.

| Event | Signal | Use? |
| --- | --- | --- |
| `TRACKED_HOUSE_CHANGED` | active house context changed | ✅ best "visited / working on a house" signal |
| `HOUSING_DECOR_PREVIEW_LIST_UPDATED` | placed / moved decor | ✅ "spent time decorating" |
| `CREATE_NEIGHBORHOOD_RESULT` | founded a neighborhood | ✅ milestone |
| `SECURE_TRANSFER_CONFIRM_HOUSING_PURCHASE` | bought a house | ✅ milestone |
| `NEIGHBORHOOD_MAP_DATA_UPDATED`, `HOUSING_STORAGE_ENTRY_UPDATED` | plumbing | ⛔ skip |

- House / neighborhood **names**: query `C_Housing` / `C_HousingNeighborhood`
  at emit time (tracked house info + neighborhood info).
- Housing events burst — emit ONE consolidated "worked on the house" beat per
  session/visit, not per decor move (same guard pattern as Battlegrounds).

## More ideas (Jeff's running list)

_(capturing as we brainstorm — nothing graded yet)_

- _…_
