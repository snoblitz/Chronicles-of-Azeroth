# Phase 2 Gap Audit — Existing addon vs. Companion-Bridge Spec

> Audit of `addon/ChroniclesOfAzeroth/` (v0.5.2) against the Phase 2 SavedVariables
> capture spec. Existing folder name, SavedVariable name (`ChroniclesOfAzerothDB`),
> event schema (`{ t, ts, event, args, enrichment }`), and TOC layout are treated
> as **canonical** — gaps below are additive, not refactors.
>
> Spec ↔ schema translation (per Jeff):
>
> | Spec field   | Existing field |
> | ------------ | -------------- |
> | `event.data` | `event.args` (+ `event.enrichment`) |
> | `event.at`   | `event.ts` (ISO string) + `event.t` (GetTime) |
> | `event.type` | `event.event`  |
> | `event.id`   | *(missing — must add, client-generated)* |

---

## Gap 1 — Companion writeback channel ❌ missing

**State today:** Addon owns one SV (`ChroniclesOfAzerothDB`). There is no
channel for the Electron companion to write generated chapters back into.

**Action:**

- Add a second SavedVariable: `ChroniclesOfAzerothCompanion`.
- Declare it in every TOC: `## SavedVariables: ChroniclesOfAzerothDB, ChroniclesOfAzerothCompanion`.
- Addon treats it as **read-only** (writes nothing except `ingestedEventIds` ack flips on the addon's side, optional — TBD).
- Shape (companion-owned):

  ```lua
  ChroniclesOfAzerothCompanion = {
    schemaVersion = 1,
    generatedChapters = {
      { id, forCharacter, basedOnEventIds = {...}, title, text,
        generatedAt, readByPlayer = false },
      ...
    },
    ingestedEventIds = { ["<event-id>"] = true, ... },
  }
  ```

- Defensive load: if SV absent or malformed, initialize empty in-memory shape;
  never crash capture.

---

## Gap 2 — Ring buffer trim ❌ missing

**State today:** `table.insert(db.events, rec)` is unbounded. A long session
will balloon SavedVariables and `/coa tail` becomes useless.

**Action:**

- Add `db.settings.maxEvents = 5000` default (under existing `db.config` block
  is fine; `db.settings` is a cleaner home — match what `db.config` already
  uses; I'll fold it into `db.config.maxEvents` to avoid a third namespace).
- On every append, if `#db.events > maxEvents`, `table.remove(db.events, 1)`
  in a loop until at threshold. FIFO. Oldest evicted first.
- Expose `/coa max <N>` slash subcommand to tune at runtime.

---

## Gap 3 — Missing event coverage

| Event                  | Captured today? | Action |
| ---------------------- | --------------- | ------ |
| `QUEST_TURNED_IN`      | ✅ yes (line 128) | none |
| `PLAYER_LEVEL_UP`      | ✅ yes (line 142) | none |
| `ACHIEVEMENT_EARNED`   | ✅ yes (line 145) | none |
| `PLAYER_DEAD`          | ✅ yes (line 143) | none |
| `ZONE_CHANGED_NEW_AREA`| ✅ yes (line 138) | none |
| `ENCOUNTER_END`        | ❌ **missing**    | add to `EVENTS` table |
| `BOSS_KILL`            | ❌ **missing**    | add (Retail-only — wrap in pcall so Classic flavors that lack it fail silently into `db.missingEvents`) |

**Action:**

- Add `"ENCOUNTER_END"` and `"BOSS_KILL"` to `EVENTS`.
- Add enrichment branches in `buildEnrichment()` for both:
  - `ENCOUNTER_END(encounterID, name, difficulty, groupSize, success)` →
    `enr.encounterID`, `enr.encounterName`, `enr.difficulty`, `enr.groupSize`,
    `enr.success`.
  - `BOSS_KILL(encounterID, name)` → `enr.encounterID`, `enr.encounterName`.
  - Map difficulty ID → name with `GetDifficultyInfo` if available.
- No new schema. Both ride the existing `{ t, ts, event, args, enrichment }` shape.

---

## Gap 4 — `/coa chapters` subcommand ❌ missing

**State today:** Slash router covers `book / sync / config / preview / count /
tail / clear / sample / missing / version / characters / character /
enrichment / help`. No `chapters`.

**Action:**

- Add `cmdChapters()` that:
  - Loads `ChroniclesOfAzerothCompanion.generatedChapters` (defensive).
  - Filters by current character's `name-realm`.
  - Opens an existing UI frame if one is loaded, else prints chapter titles +
    a hint that the full reader is in `/coa book`.
- Existing `UI/ChronicleBook.lua` already opens a chronicle frame — wire
  `cmdChapters()` to call into it with a "companion-generated only" filter
  rather than building a parallel viewer. Confirm filter hook exists during
  implementation; if not, add one alongside.

---

## Gap 5 — Ingestion bookkeeping ❌ missing

**State today:** No per-event `id`; companion has nothing stable to ack against.

**Action:**

- Add `rec.id = uuid()` in `recordEvent()` before insert. Use a v4-shaped
  generator built on `math.random` + `time()` seed (acceptable — addon-only,
  not cryptographically used).
- **Addon never mutates events with `ingested = true`.** Companion owns
  ingestion state; addon owns capture state. Pending counts are computed
  on the fly by intersecting `db.events[i].id` against
  `ChroniclesOfAzerothCompanion.ingestedEventIds` at stats-print time.
  Lets us nuke the companion SV to reset ingestion without touching events.
- Stats: add `/coa stats` that prints
  `<name-realm>: <total> captured, <ingested> chronicled, <pending> pending`.
- UUID generator (v4 shape, non-crypto, collision-safe for our scale):

  ```lua
  local function uuid()
    local template = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx"
    return (template:gsub("[xy]", function(c)
      local v = (c == "x") and math.random(0, 15) or math.random(8, 11)
      return string.format("%x", v)
    end))
  end
  ```

  Seed once in ADDON_LOADED: `math.randomseed(time())`.

---

## Gap 6 — Classic flavor TOC coverage

**State today:** Retail (`120005`), Mists (`50503`), TBC (`20505`), Vanilla
(`11508`). No Wrath, no Cata.

**Action:**

- Add `ChroniclesOfAzeroth_Wrath.toc` (Interface `30405` — WotLK Classic
  patch 3.4.5, current latest phase).
- Add `ChroniclesOfAzeroth_Cata.toc` (Interface `40402` — Cata Classic
  launch baseline; may need bump if Blizzard has shipped Cata Phase 5+
  by ship date).
- File list identical to other TOCs; only `## Interface:` line changes.
- Update `addon/README.md` TOC table.

> Interface version numbers above are best-known-as-of-writing. Verified
> against current live builds before committing TOCs (checked against
> popular per-flavor addons — Questie / WeakAuras publish current numbers).
> README already tells users to run `/coa version` in-game and bump these
> as Blizzard ships patches — that workflow stays intact. Wrong interface
> number is a UI "out of date" warning, not a crash.

---

## Gap 7 — MIT LICENSE file ❌ missing

**State today:** No `LICENSE` file anywhere in the repo. README says
"License: TBD (currently unlicensed)."

**Action:**

- Add `LICENSE` at repo root with **standard MIT text**, `Copyright (c) 2025
  Jeff Knecht`.
- Update top-level `README.md` "License" section: "MIT — see `LICENSE`."
- Add `addon/ChroniclesOfAzeroth/LICENSE` (copy or a short pointer) so when
  the addon is zipped for CurseForge/Wago the license rides along inside
  the bundle.
- Note in TOC `## X-License: MIT` for parity with community convention
  (CurseForge metadata respects it).

This one is load-bearing for the monetization strategy (plan.md §1 rule 3
and the "free + open" precondition). Highest priority of the file-creation
gaps.

---

## Gap 8 — Schema version + migrate stub ❌ missing

**State today:** No `schemaVersion` on `ChroniclesOfAzerothDB`. Migrations
will be ugly the moment the first one is needed.

**Action:**

- In `ensureDB()`, add `db.schemaVersion = db.schemaVersion or 1`.
- Add `local CURRENT_SCHEMA = 1` constant.
- Add `local function migrate(db)` stub:

  ```lua
  local function migrate(db)
    if db.schemaVersion == CURRENT_SCHEMA then return end
    -- future: while db.schemaVersion < CURRENT_SCHEMA do … end
    db.schemaVersion = CURRENT_SCHEMA
  end
  ```

- Call `migrate(db)` immediately after `ensureDB()` in the ADDON_LOADED
  branch.
- Same treatment for `ChroniclesOfAzerothCompanion` (companion-owned, but
  the addon reads it — must be defensive if companion writes a newer
  schema; either skip with a warning or drop into a "read-only legacy"
  mode).

---

## Out of scope for this audit (deliberately not gaps)

- ❌ Rename `ChroniclesOfAzerothDB` → `ChroniclesDB` *(no — Jeff said don't
  rename working code).*
- ❌ Rebuild on Ace3 *(no — current code uses raw frame + slash handlers;
  switching frameworks would be a full rewrite for no functional gain).*
- ❌ Split into `core/`, `ui/`, `libs/` per the spec layout *(no — existing
  layout is `ChroniclesOfAzeroth.lua` + `UI/` + `Lore/` + `Data/` and it
  works).*
- ❌ Introduce a separate `ChroniclesCharDB` per-character SV *(no — the
  existing `db.characters[guid]` map already serves the "remember per
  character" use case account-wide).*

---

## Suggested commit sequence

One gap per commit, smallest-blast-radius first:

1. `chore: add MIT LICENSE` *(gap 7 — no code change, unblocks distribution)*
2. `feat(addon): schemaVersion + migrate() stub` *(gap 8 — pure additive)*
3. `feat(addon): ring buffer trim with configurable max` *(gap 2)*
4. `feat(addon): per-event UUID for companion ack` *(gap 5 part 1)*
5. `feat(addon): capture ENCOUNTER_END and BOSS_KILL` *(gap 3)*
6. `feat(addon): companion writeback SV + /coa chapters` *(gaps 1 + 4)*
7. `feat(addon): ingestion bookkeeping + /coa stats` *(gap 5 part 2)*
8. `chore(addon): add Wrath + Cata TOC files` *(gap 6)*

Each commit lands a working addon. Order chosen so that gap 1 (companion
channel) lands after gap 5 part 1 (event IDs) — IDs must exist before
the ack table is meaningful.
