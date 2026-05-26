# Aftertale -- addon

This is the in-game companion. Today it is a **pure event-capture spike**:
it listens for every WoW event the [Addon Simulator][sim] promises and
records the real payloads to `SavedVariables` so we can diff fiction against
reality.

No AI calls, no UI, no game-state mutation. Just listen and dump.

[sim]: ../src/components/AddonSimulator.tsx

## Install

From the repo root, in an **elevated PowerShell**:

```powershell
pwsh scripts/install-addon.ps1
```

This creates directory junctions from each detected WoW client's
`Interface\AddOns\ChroniclesOfAzeroth` back to this folder, so editing
`ChroniclesOfAzeroth.lua` here and `/reload`-ing in-game picks up the
change. Detected clients: `_retail_`, `_classic_`, `_classic_era_`,
`_anniversary_`, `_beta_`.

To remove the junctions:

```powershell
pwsh scripts/install-addon.ps1 -Unlink
```

## TOC files

| File                              | Flavor                | Interface |
| --------------------------------- | --------------------- | --------- |
| `ChroniclesOfAzeroth.toc`         | Retail (Midnight)     | 120005    |
| `ChroniclesOfAzeroth_Mists.toc`   | MoP Classic           | 50503     |
| `ChroniclesOfAzeroth_Cata.toc`    | Cataclysm Classic     | 40402     |
| `ChroniclesOfAzeroth_Wrath.toc`   | Wrath Classic         | 30405     |
| `ChroniclesOfAzeroth_TBC.toc`     | Anniversary (TBC)     | 20505     |
| `ChroniclesOfAzeroth_Vanilla.toc` | Classic Era           | 11508     |

Bump these as Blizzard ships new builds. Use `/coa version` in-game to
confirm the live build number.

## In-game commands

| Command           | What it does                                             |
| ----------------- | -------------------------------------------------------- |
| `/coa`                          | Show help                                                |
| `/coa count`                    | Total + per-event capture counts                         |
| `/coa tail [N]`                 | Print the last N events to chat (default 10)             |
| `/coa clear`                    | Wipe the capture log (preserves meta + characters)       |
| `/coa sample N`                 | Set combat-log sample rate (1-in-N, default 50)          |
| `/coa missing`                  | List events `RegisterEvent` refused on this game flavor  |
| `/coa version`                  | Addon + client version info                              |
| `/coa characters`               | List characters Chronicles has detected (Phase 0.75-C)   |
| `/coa character reset <guid>`   | Force re-onboarding for a character (dev tool)           |

## Capture workflow

1. `/coa clear` at the start of a session so the log is fresh.
2. Play normally for ~30-60 minutes. Run quests, change zones, fight stuff,
   talk to NPCs, level up, die, whatever.
3. `/coa count` to spot-check what landed.
4. **Log out** (or `/reload`) -- WoW only flushes `SavedVariables` to disk
   on logout or reload. Just closing the client will lose the capture.
5. Grab the file from
   `<WoWRoot>\<flavor>\WTF\Account\<ACCOUNT>\SavedVariables\ChroniclesOfAzeroth.lua`
6. Diff against the simulator's `WowEventName` union in
   `src/lib/addonEvents.ts` and note any mismatches in
   `docs/EVENT-CONTRACT.md`.

## What we are validating

The simulator currently claims these events fire:

```
PLAYER_ENTERING_WORLD   QUEST_PROGRESS          ZONE_CHANGED_NEW_AREA
PLAYER_LOGOUT           QUEST_TURNED_IN         PLAYER_LEVEL_UP
PLAYER_DEAD             GOSSIP_SHOW             COMBAT_LOG_EVENT_UNFILTERED
QUEST_DETAIL            ZONE_CHANGED            UNIT_QUEST_LOG_CHANGED
QUEST_ACCEPTED
```

The addon registers all of those plus a few extras
(`QUEST_COMPLETE`, `QUEST_REMOVED`, `GOSSIP_CLOSED`, `ZONE_CHANGED_INDOORS`,
`PLAYER_LOGIN`, `PLAYER_ALIVE`, `PLAYER_REGEN_DISABLED/ENABLED`,
`CHAT_MSG_ADDON`) so we learn about adjacent events worth grafting in.

It also mirrors every (non-combat-log) capture through
`C_ChatInfo.SendAddonMessageLogged("COA", ...)` so we can validate that the
chat-log transport actually carries our payloads -- the same transport
Phase 1's chat-log tailing and Phase 2's addon bridge will rely on.

## Combat log sampling

`COMBAT_LOG_EVENT_UNFILTERED` fires *hundreds of times per second* during
real combat. The addon counts every fire but only captures 1-in-50 to
`SavedVariables` by default. Bump or lower with `/coa sample N`.

## Character detection (Phase 0.75-C, v0.2.0+)

On every `PLAYER_ENTERING_WORLD`, the addon checks `UnitGUID("player")`
against a registry of known characters in
`ChroniclesOfAzerothDB.characters`. If the GUID is new, it snapshots:

- **Identity** -- name, realm, class, race, sex, faction, GUID
- **First seen** -- timestamp, level, map ID, zone, subzone, coords, build
- **Classification** -- `brand-new` / `boosted` / `pre-existing` based on
  `GetTimePlayed()`:
  - `< 60s` and level 1 -> brand-new (birth narrative)
  - `< 60s` and level > 1 -> boosted (arrival-without-memory narrative)
  - `>= 60s` -> pre-existing (met-mid-journey narrative)

When a new character is detected, the addon prints a one-time chat-frame
ping:

```
[Chronicles] New character detected: Garygidney (Dwarf Rogue, lvl 1,
Coldridge Valley) -- brand-new. Open the Chronicles app to begin her story.
```

The structured record is what the Chronicles app reads on next launch to
pre-fill the onboarding wizard. Use `/coa characters` to inspect the
registry, `/coa character reset <guid>` to force re-onboarding for a
character (dev tool).

**GUID stability note:** `UnitGUID` survives name change, race change, and
appearance change, but is regenerated by realm transfer and faction
change. v1 treats post-transfer characters as new; merge UX is deferred
to the app side.
