-- Aftertale -- event spike addon
--
-- Purpose: validate the event contract that AddonSimulator.tsx promises.
-- Registers every WoW event the simulator emits, captures real payloads to
-- SavedVariables (AftertaleDB), and mirrors a compact form via
-- SendAddonMessageLogged so we can also validate that transport for the
-- chat-log-based bridge that Phase 1 / Phase 2 depend on.
--
-- No AI. No UI. No magic. Just listen, capture, dump.

local ADDON_NAME, NS = ...

local PREFIX = "COA"
local CHAT_TAG = "|cFFFFD700[Aftertale]|r"

-- Schema version for AftertaleDB. Bump when shape changes in a
-- way old saves can't be loaded by new code. migrate() runs once per load
-- and walks db.schemaVersion forward to CURRENT_SCHEMA.
local CURRENT_SCHEMA = 1

------------------------------------------------------------------------
-- Compat shims
------------------------------------------------------------------------

local function getMeta(field)
  if C_AddOns and C_AddOns.GetAddOnMetadata then
    return C_AddOns.GetAddOnMetadata(ADDON_NAME, field)
  elseif GetAddOnMetadata then
    return GetAddOnMetadata(ADDON_NAME, field)
  end
  return nil
end

local function projectName()
  local id = WOW_PROJECT_ID
  if id == WOW_PROJECT_MAINLINE then return "Retail" end
  if id == WOW_PROJECT_CLASSIC then return "Era" end
  if WOW_PROJECT_BURNING_CRUSADE_CLASSIC and id == WOW_PROJECT_BURNING_CRUSADE_CLASSIC then return "TBC" end
  if WOW_PROJECT_WRATH_CLASSIC and id == WOW_PROJECT_WRATH_CLASSIC then return "Wrath" end
  if WOW_PROJECT_CATACLYSM_CLASSIC and id == WOW_PROJECT_CATACLYSM_CLASSIC then return "Cata" end
  if WOW_PROJECT_MISTS_CLASSIC and id == WOW_PROJECT_MISTS_CLASSIC then return "Mists" end
  return "Unknown(" .. tostring(id) .. ")"
end

local function sendAddonMessageLogged(prefix, msg, channel, target)
  if C_ChatInfo and C_ChatInfo.SendAddonMessageLogged then
    return C_ChatInfo.SendAddonMessageLogged(prefix, msg, channel, target)
  end
  -- Fallback to non-logged variant if Logged isn't available on this flavor.
  if C_ChatInfo and C_ChatInfo.SendAddonMessage then
    return C_ChatInfo.SendAddonMessage(prefix, msg, channel, target)
  end
  return nil
end

------------------------------------------------------------------------
-- Saved data
--
-- AftertaleDB = {
--   meta = { version, project, build, characterName, realm, startedAt,
--            chatLogEnabled, combatLogEnabled },
--   events = { { t, ts, event, args = {...} }, ... },
--   counts = { [eventName] = number },
--   combatLogSampleRate = 50,
--   missingEvents = { [eventName] = reasonString },
--   characters = {                              -- Phase 0.75-C
--     [guid] = {
--       identity = { guid, name, realm, class, classFile, race, raceFile,
--                    sex, faction },
--       firstSeen = { timestamp, iso, level, mapID, zoneText, subzoneText,
--                     coords = { x, y }, addonBuild, project,
--                     timePlayedSec, levelTimeSec },
--       lastSeen = { timestamp, iso, level, zoneText, subzoneText },
--       classification = "brand-new" | "boosted" | "pre-existing" | "pending",
--       classificationReason = string,
--       onboardingState = "pending" | "seeded" | "complete" | "skipped",
--       onboardingPayloadVersion = number,
--       announced = boolean,                    -- chat-frame ping fired?
--       sightings = number,                     -- count of PEWs we have seen
--     },
--   },
-- }
------------------------------------------------------------------------

local function ensureDB()
  AftertaleDB = AftertaleDB or {}
  local db = AftertaleDB
  db.schemaVersion = db.schemaVersion or CURRENT_SCHEMA
  db.meta = db.meta or {}
  db.events = db.events or {}
  db.counts = db.counts or {}
  db.missingEvents = db.missingEvents or {}
  db.combatLogSampleRate = db.combatLogSampleRate or 50
  -- Phase 0.75-B: per-event enrichment toggle (zone snapshot, quest titles,
  -- NPC names, loot items, etc.). Default ON; flip off via /aftertale enrichment.
  if db.enrichmentEnabled == nil then db.enrichmentEnabled = true end
  -- Phase 0.75-C: character registry keyed by UnitGUID("player").
  db.characters = db.characters or {}
  -- Phase 1.6: user-facing UX toggles. Each defaults ON; users can opt out
  -- via /aftertale config. Session counters live alongside so the recap pulls
  -- from persisted state.
  db.config = db.config or {}
  local c = db.config
  if c.showStoryCards     == nil then c.showStoryCards     = true end
  if c.showLevelCards     == nil then c.showLevelCards     = true end
  if c.showSessionRecap   == nil then c.showSessionRecap   = true end
  if c.showMinimapButton  == nil then c.showMinimapButton  = true end
  if c.playSounds         == nil then c.playSounds         = true end
  if c.storyCardDuration  == nil then c.storyCardDuration  = 5.0 end
  if c.minimapAngle       == nil then c.minimapAngle       = 215  end
  c.webAppUrl = c.webAppUrl or "https://aftertale-app.github.io/Aftertale/"
  -- Phase 2: ring buffer cap. FIFO trim oldest events when the buffer
  -- overflows. Bounds SavedVariables file size on long sessions. Tune
  -- with /aftertale max <N>; minimum 100, no hard upper limit.
  if c.maxEvents == nil then c.maxEvents = 5000 end
  -- Phase 1.7: Tier-C enrichment. Paragraphs imported via /aftertale sync land
  -- here keyed by Templates.EntryID; ChronicleBook reads this first,
  -- falls back to procedural templates per entry.
  db.enriched = db.enriched or {}
  return db
end

-- Companion writeback channel. The Electron companion writes generated
-- chapters into AftertaleCompanion; the addon only reads from
-- it. Defensive load: if the SV is absent (companion never ran) or
-- malformed, return an empty stub so /aftertale chapters and stats work.
local function ensureCompanionDB()
  AftertaleCompanion = AftertaleCompanion or {}
  local cdb = AftertaleCompanion
  cdb.schemaVersion = cdb.schemaVersion or 1
  -- generatedChapters: list of { id, forCharacter, basedOnEventIds,
  --                              title, text, generatedAt, readByPlayer }
  if type(cdb.generatedChapters) ~= "table" then
    if cdb.generatedChapters ~= nil and NS and NS.Logger then
      NS.Logger:warn("companion.generatedChapters was " .. type(cdb.generatedChapters)
        .. "; reset to {}", NS.Logger.Categories.companion)
    end
    cdb.generatedChapters = {}
  end
  -- ingestedEventIds: set keyed by event.id -> true
  if type(cdb.ingestedEventIds) ~= "table" then
    if cdb.ingestedEventIds ~= nil and NS and NS.Logger then
      NS.Logger:warn("companion.ingestedEventIds was " .. type(cdb.ingestedEventIds)
        .. "; reset to {}", NS.Logger.Categories.companion)
    end
    cdb.ingestedEventIds = {}
  end
  return cdb
end

-- Schema migration. Stub for now; called once on ADDON_LOADED. When the
-- next schema lands, replace the no-op with `while db.schemaVersion <
-- CURRENT_SCHEMA do ... end` and add a per-version migrator branch.
local function migrate(db)
  if db.schemaVersion == CURRENT_SCHEMA then return end
  local from = db.schemaVersion
  -- No migrations yet. Future migrators land here, one branch per bump.
  db.schemaVersion = CURRENT_SCHEMA
  if NS and NS.Logger then
    NS.Logger:info(string.format("schema migrated %s -> %s",
      tostring(from), tostring(CURRENT_SCHEMA)), NS.Logger.Categories.capture)
  end
end

------------------------------------------------------------------------
-- Event registry -- the contract from src/lib/addonEvents.ts
------------------------------------------------------------------------

local EVENTS = {
  -- Session lifecycle
  "PLAYER_LOGIN",
  "PLAYER_ENTERING_WORLD",
  "PLAYER_LOGOUT",

  -- Quest flow (the heart of the chronicle)
  "QUEST_DETAIL",
  "QUEST_ACCEPTED",
  "QUEST_PROGRESS",
  "QUEST_COMPLETE",
  "QUEST_TURNED_IN",
  "QUEST_REMOVED",
  "UNIT_QUEST_LOG_CHANGED",

  -- Dialogue
  "GOSSIP_SHOW",
  "GOSSIP_CLOSED",

  -- World state
  "ZONE_CHANGED",
  "ZONE_CHANGED_NEW_AREA",
  "ZONE_CHANGED_INDOORS",

  -- Character state
  "PLAYER_LEVEL_UP",
  "PLAYER_DEAD",
  "PLAYER_ALIVE",
  "ACHIEVEMENT_EARNED",
  -- Combat (entry/exit bookends only -- COMBAT_LOG_EVENT_UNFILTERED is
  -- restricted in modern Retail / requires a different registration path
  -- than what unsigned addons get, so we skip it here. The simulator's
  -- combat coverage will come from PLAYER_REGEN_* + UNIT_HEALTH or via
  -- an explicit opt-in path later in Phase 1.)
  "PLAYER_REGEN_DISABLED",   -- entered combat
  "PLAYER_REGEN_ENABLED",    -- left combat

  -- Inbound addon transport (to test SendAddonMessageLogged round-trip)
  "CHAT_MSG_ADDON",

  -- Phase 0.75-B enrichment: loot details + currency drops
  "LOOT_OPENED",
  "CHAT_MSG_LOOT",
  "CHAT_MSG_MONEY",

  -- Phase 0.75-C: character detection async return channel.
  -- RequestTimePlayed() schedules TIME_PLAYED_MSG(totalSec, levelSec).
  "TIME_PLAYED_MSG",

  -- Phase 2: instance bookends. Both fire on raid/dungeon boss defeats;
  -- ENCOUNTER_END is the modern (5.4+) cross-flavor canonical, BOSS_KILL
  -- is Retail-only and slightly more reliable for world bosses. We
  -- register both; missing-on-this-flavor handled by registerEvents.
  "ENCOUNTER_END",
  "BOSS_KILL",
}

-- Events known to be refused by RegisterEvent on certain flavors.
-- Tracked here so /aftertale missing reflects intent, not just runtime failures.
local KNOWN_FORBIDDEN = {
  COMBAT_LOG_EVENT_UNFILTERED = "Retail Midnight refuses RegisterEvent for unsigned addons; see Phase 1 plan.",
}

------------------------------------------------------------------------
-- Capture helpers
------------------------------------------------------------------------

local function packArgs(...)
  local n = select("#", ...)
  local t = {}
  for i = 1, n do
    local v = select(i, ...)
    -- Stringify non-primitive args so SavedVariables stays serializable.
    if type(v) == "table" then
      t[i] = "<table>"
    elseif v == nil then
      t[i] = "<nil>"
    else
      t[i] = tostring(v)
    end
  end
  return t
end

local function bumpCount(db, event)
  db.counts[event] = (db.counts[event] or 0) + 1
end

local combatLogCounter = 0

-- UUID v4 generator. Non-cryptographic; collision-safe at our scale (single
-- client, ~5k-event ring buffer). Seeded once on ADDON_LOADED below.
local function uuid()
  local template = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx"
  return (template:gsub("[xy]", function(c)
    local v = (c == "x") and math.random(0, 15) or math.random(8, 11)
    return string.format("%x", v)
  end))
end

------------------------------------------------------------------------
-- Phase 0.75-B -- per-event enrichment
--
-- Goal: turn a bare "QUEST_ACCEPTED with arg '24469'" into a record the
-- chronicle generator can actually narrate. We attach:
--   * universal snapshot on every event (zone, subzone, level, hpPct,
--     gameHourMin, mapID, coords)
--   * per-event extras for the high-signal events (quest titles, NPC
--     identity, loot items, money totals)
--
-- All Blizzard API calls are pcall-wrapped because surfaces drift
-- between flavors and we never want enrichment to crash the addon.
------------------------------------------------------------------------

local function safeCall(fn, ...)
  local ok, a, b, c, d, e, f, g, h = pcall(fn, ...)
  if ok then return a, b, c, d, e, f, g, h end
  return nil
end

local function snapshot()
  local snap = {}
  snap.zoneText    = safeCall(GetZoneText) or nil
  snap.subzoneText = safeCall(GetSubZoneText) or nil
  snap.minimapZone = safeCall(GetMinimapZoneText) or nil
  if snap.zoneText == "" then snap.zoneText = nil end
  if snap.subzoneText == "" then snap.subzoneText = nil end
  if snap.minimapZone == "" then snap.minimapZone = nil end

  local lvl = safeCall(UnitLevel, "player")
  if lvl and lvl > 0 then snap.level = lvl end

  -- Retail Midnight returns UnitHealth("player") as a "secret number" for
  -- unsigned addons; any arithmetic on it taints execution. Skip HP%
  -- entirely until we can register as a signed addon or use a different
  -- surface. The other snapshot fields are not tainted.

  if C_Map and C_Map.GetBestMapForUnit then
    local mapID = safeCall(C_Map.GetBestMapForUnit, "player")
    if mapID then
      snap.mapID = mapID
      if C_Map.GetPlayerMapPosition then
        local pos = safeCall(C_Map.GetPlayerMapPosition, mapID, "player")
        if pos and pos.GetXY then
          local okXY, x, y = pcall(pos.GetXY, pos)
          if okXY and x and y and (x > 0 or y > 0) then
            local okMath, cx, cy = pcall(function()
              return math.floor(x * 10000) / 10000, math.floor(y * 10000) / 10000
            end)
            if okMath then snap.coords = { x = cx, y = cy } end
          end
        end
      end
    end
  end

  local h, m = safeCall(GetGameTime)
  if h and m then snap.gameTime = string.format("%02d:%02d", h, m) end

  return snap
end

local function questTitleFor(questID)
  local id = tonumber(questID)
  if not id then return nil end
  if C_QuestLog and C_QuestLog.GetTitleForQuestID then
    return safeCall(C_QuestLog.GetTitleForQuestID, id)
  end
  if QuestUtils_GetQuestName then
    return safeCall(QuestUtils_GetQuestName, id)
  end
  return nil
end

local function captureNpc()
  local name = safeCall(UnitName, "npc")
  if not name then return nil end
  local out = { name = name }
  local guid = safeCall(UnitGUID, "npc")
  if guid then out.guid = guid end
  local lvl = safeCall(UnitLevel, "npc")
  if lvl and lvl > 0 then out.level = lvl end
  local reaction = safeCall(UnitReaction, "npc", "player")
  if reaction then out.reaction = reaction end
  return out
end

local function captureLoot()
  if not GetNumLootItems then return nil end
  local n = safeCall(GetNumLootItems) or 0
  if n == 0 then return nil end
  local items = {}
  for i = 1, n do
    local link = safeCall(GetLootSlotLink, i)
    local _, name, qty, _, quality = safeCall(GetLootSlotInfo, i)
    if link or name then
      table.insert(items, {
        slot = i,
        link = link,
        name = name,
        qty = qty,
        quality = quality,
      })
    end
  end
  if #items == 0 then return nil end
  return items
end

local function buildEnrichment(event, args)
  local enr = snapshot()

  if event == "QUEST_ACCEPTED" or event == "QUEST_REMOVED"
      or event == "QUEST_TURNED_IN" or event == "QUEST_COMPLETE"
      or event == "QUEST_PROGRESS" then
    local questID = args and args[1]
    local title = questTitleFor(questID)
    if title then enr.questTitle = title end

  elseif event == "QUEST_DETAIL" then
    if GetTitleText then
      local t = safeCall(GetTitleText)
      if t and t ~= "" then enr.questTitle = t end
    end
    local npc = captureNpc()
    if npc then enr.npc = npc end

  elseif event == "GOSSIP_SHOW" then
    local npc = captureNpc()
    if npc then enr.npc = npc end

  elseif event == "LOOT_OPENED" then
    local loot = captureLoot()
    if loot then enr.loot = loot end

  elseif event == "PLAYER_DEAD" then
    -- Coords + zone already in snapshot; combat log unavailable to
    -- unsigned addons on Retail, so we cannot yet name the killer.
    enr.deathContext = "killer-unknown (no combat log access)"

  elseif event == "ACHIEVEMENT_EARNED" then
    -- args[1] is achievementID. Resolve to name/description if the API
    -- is available on this flavor.
    local id = args and args[1]
    if id and GetAchievementInfo then
      local ok, _, name, _, _, _, _, desc = pcall(GetAchievementInfo, id)
      if ok then
        enr.achievementID   = id
        enr.achievementName = name
        enr.achievementDesc = desc
      end
    end

  elseif event == "PLAYER_LEVEL_UP" then
    -- args[1] is new level per Blizzard docs; snapshot already has it
    -- as the new level since UnitLevel fires after the event.
    if GetXPExhaustion then
      local rest = safeCall(GetXPExhaustion)
      if rest then enr.restedXP = rest end
    end

  elseif event == "ENCOUNTER_END" then
    -- args: encounterID, encounterName, difficultyID, groupSize, success
    local encounterID = args and tonumber(args[1])
    local encounterName = args and args[2]
    local difficultyID = args and tonumber(args[3])
    local groupSize = args and tonumber(args[4])
    local success = args and (args[5] == "1" or args[5] == "true")
    if encounterID then enr.encounterID = encounterID end
    if encounterName and encounterName ~= "" then enr.encounterName = encounterName end
    if difficultyID then
      enr.difficulty = difficultyID
      if GetDifficultyInfo then
        local diffName = safeCall(GetDifficultyInfo, difficultyID)
        if diffName and diffName ~= "" then enr.difficultyName = diffName end
      end
    end
    if groupSize then enr.groupSize = groupSize end
    enr.success = success and true or false

  elseif event == "BOSS_KILL" then
    -- args: encounterID, encounterName (Retail). On Classic flavors that
    -- still ship BOSS_KILL the payload shape is the same.
    local encounterID = args and tonumber(args[1])
    local encounterName = args and args[2]
    if encounterID then enr.encounterID = encounterID end
    if encounterName and encounterName ~= "" then enr.encounterName = encounterName end
  end

  return enr
end

local function recordEvent(db, event, ...)
  local args
  if event == "COMBAT_LOG_EVENT_UNFILTERED" then
    combatLogCounter = combatLogCounter + 1
    bumpCount(db, event)
    if combatLogCounter % db.combatLogSampleRate ~= 0 then
      return -- sampled out
    end
    -- The real payload comes from CombatLogGetCurrentEventInfo, not the
    -- vararg, since 7.0. Use that.
    if CombatLogGetCurrentEventInfo then
      args = packArgs(CombatLogGetCurrentEventInfo())
    else
      args = packArgs(...)
    end
  else
    args = packArgs(...)
    bumpCount(db, event)
  end

  local rec = {
    id = uuid(),
    t = GetTime(),
    ts = date("%Y-%m-%dT%H:%M:%S"),
    event = event,
    args = args,
  }
  if db.enrichmentEnabled and event ~= "COMBAT_LOG_EVENT_UNFILTERED" then
    -- COMBAT_LOG is sampled and high-volume; skip enrichment for it.
    rec.enrichment = buildEnrichment(event, args)
  end
  table.insert(db.events, rec)

  -- Ring buffer: FIFO trim oldest entries once we exceed the configured
  -- cap. Loop in case a future bulk-import path pushes multiple at once.
  local cap = (db.config and db.config.maxEvents) or 5000
  while #db.events > cap do
    table.remove(db.events, 1)
  end

  -- Mirror compact form via SendAddonMessageLogged so we can also verify
  -- that the chat-log transport carries our events end-to-end.
  -- Skip CHAT_MSG_ADDON to avoid a feedback loop with ourselves.
  if event ~= "CHAT_MSG_ADDON" then
    local payload = event .. "|" .. table.concat(args, "|")
    if #payload > 240 then payload = payload:sub(1, 240) .. "..." end
    sendAddonMessageLogged(PREFIX, payload, "WHISPER", UnitName("player"))
  end
end

------------------------------------------------------------------------
-- Character detection -- Phase 0.75-C
--
-- Identity = UnitGUID("player"). Stable within a character's lifetime
-- except for paid realm transfer / faction change (both regenerate the
-- GUID). For v1 those will look like a new character; merge UX is
-- deferred to the app side.
--
-- Classification fires once per character per Chronicles-installation,
-- the first time we see a GUID. Three lanes:
--   * brand-new      timePlayed <  60s, level == 1   -> birth voice
--   * boosted        timePlayed <  60s, level  > 1   -> arrival-w/o-memory voice
--   * pre-existing   timePlayed >= 60s               -> met-mid-journey voice
--
-- GetTimePlayed is asynchronous: RequestTimePlayed() schedules
-- TIME_PLAYED_MSG, which arrives moments later with (total, level).
-- We snapshot identity + location synchronously on PLAYER_ENTERING_WORLD,
-- park a pending record, and finalize when TIME_PLAYED_MSG fires.
--
-- "firstSeen" means first-seen-by-Chronicles, not character birth. A
-- level-60 main installed-into-mid-life will have firstSeen pointing at
-- whatever zone they happened to be standing in when the addon loaded.
------------------------------------------------------------------------

local CHRONICLES_TAG = "|cff00ff00[Chronicles]|r"

local pendingCharacterGuid = nil

local function snapshotIdentity()
  local guid = UnitGUID("player")
  if not guid then return nil end
  local localizedClass, classFile = UnitClass("player")
  local localizedRace, raceFile = UnitRace("player")
  local faction = UnitFactionGroup("player")
  return {
    guid = guid,
    name = UnitName("player") or "?",
    realm = GetRealmName() or "?",
    class = localizedClass,
    classFile = classFile,
    race = localizedRace,
    raceFile = raceFile,
    sex = UnitSex("player"), -- 1=neutral, 2=male, 3=female per Blizzard API
    faction = faction,        -- "Alliance" | "Horde" | "Neutral"
  }
end

local function snapshotLocation()
  local mapID = (C_Map and C_Map.GetBestMapForUnit) and C_Map.GetBestMapForUnit("player") or nil
  local coords
  if mapID and C_Map and C_Map.GetPlayerMapPosition then
    local pos = C_Map.GetPlayerMapPosition(mapID, "player")
    if pos then
      local x, y = pos:GetXY()
      coords = { x = x, y = y }
    end
  end
  return {
    mapID = mapID,
    zoneText = GetZoneText() or "",
    subzoneText = GetSubZoneText() or "",
    coords = coords,
  }
end

local function classify(timePlayedSec, level)
  if (timePlayedSec or 0) < 60 and (level or 0) == 1 then
    return "brand-new", string.format("timePlayedSec=%s, level=1", tostring(timePlayedSec))
  end
  if (timePlayedSec or 0) < 60 and (level or 0) > 1 then
    return "boosted", string.format("timePlayedSec=%s, level=%d", tostring(timePlayedSec), level)
  end
  return "pre-existing", string.format("timePlayedSec=%s, level=%d", tostring(timePlayedSec), level or 0)
end

local function announceNewCharacter(record)
  local lvl = record.firstSeen.level or 0
  local zone = record.firstSeen.zoneText
  if not zone or zone == "" then zone = "the world" end
  local pronoun
  if record.identity.sex == 3 then pronoun = "her"
  elseif record.identity.sex == 2 then pronoun = "his"
  else pronoun = "their" end
  print(string.format(
    "%s New character detected: %s (%s %s, lvl %d, %s) -- %s. Open the Chronicles app to begin %s story.",
    CHRONICLES_TAG,
    record.identity.name,
    record.identity.race or "?",
    record.identity.class or "?",
    lvl,
    zone,
    record.classification,
    pronoun
  ))
end

local function bumpLastSeen(record, identity)
  record.lastSeen = {
    timestamp = time(),
    iso = date("%Y-%m-%dT%H:%M:%S"),
    level = UnitLevel("player") or 0,
    zoneText = GetZoneText() or "",
    subzoneText = GetSubZoneText() or "",
  }
  -- Refresh identity in case of name change (race change, appearance change
  -- preserve GUID but mutate fingerprint fields).
  record.identity = identity
  record.sightings = (record.sightings or 0) + 1
end

local function beginCharacterDetection(db)
  local identity = snapshotIdentity()
  if not identity or not identity.guid then return end

  local existing = db.characters[identity.guid]
  if existing then
    bumpLastSeen(existing, identity)
    return
  end

  local location = snapshotLocation()
  local record = {
    identity = identity,
    firstSeen = {
      timestamp = time(),
      iso = date("%Y-%m-%dT%H:%M:%S"),
      level = UnitLevel("player") or 0,
      mapID = location.mapID,
      zoneText = location.zoneText,
      subzoneText = location.subzoneText,
      coords = location.coords,
      addonBuild = select(4, GetBuildInfo()) or "?",
      project = projectName(),
    },
    classification = "pending",
    classificationReason = "awaiting TIME_PLAYED_MSG",
    onboardingState = "pending",
    onboardingPayloadVersion = 1,
    announced = false,
    sightings = 1,
  }
  db.characters[identity.guid] = record
  pendingCharacterGuid = identity.guid

  if RequestTimePlayed then
    RequestTimePlayed()
  else
    -- No async return channel available; classify with what we have.
    record.firstSeen.timePlayedSec = -1
    record.classification, record.classificationReason = classify(9999, record.firstSeen.level)
    record.classificationReason = record.classificationReason .. " (RequestTimePlayed unavailable)"
    if not record.announced then
      announceNewCharacter(record)
      record.announced = true
    end
    pendingCharacterGuid = nil
  end
end

local function finalizeCharacterDetection(db, totalTimeSec, levelTimeSec)
  local guid = pendingCharacterGuid
  if not guid then return end
  local record = db.characters[guid]
  if not record then
    pendingCharacterGuid = nil
    return
  end
  record.firstSeen.timePlayedSec = totalTimeSec
  record.firstSeen.levelTimeSec = levelTimeSec
  record.classification, record.classificationReason = classify(totalTimeSec, record.firstSeen.level)
  if NS and NS.Logger then
    NS.Logger:info(string.format("character %s-%s classified as '%s' (%s)",
      tostring(record.identity.name), tostring(record.identity.realm),
      tostring(record.classification), tostring(record.classificationReason)),
      NS.Logger.Categories.character)
  end
  if not record.announced then
    announceNewCharacter(record)
    record.announced = true
  end
  pendingCharacterGuid = nil
end

------------------------------------------------------------------------
-- Frame + registration
------------------------------------------------------------------------

local frame = CreateFrame("Frame", "AftertaleFrame")

local function registerEvents(db)
  local refused = 0
  for _, ev in ipairs(EVENTS) do
    local ok, err = pcall(function() frame:RegisterEvent(ev) end)
    if not ok then
      db.missingEvents[ev] = "RegisterEvent threw"
      refused = refused + 1
      if NS and NS.Logger then
        NS.Logger:warn(string.format("RegisterEvent refused '%s': %s",
          ev, tostring(err)), NS.Logger.Categories.events)
      end
    end
  end
  -- Mark statically-known-forbidden events too so /aftertale missing tells the
  -- full story even when we deliberately skipped them.
  for ev, reason in pairs(KNOWN_FORBIDDEN) do
    db.missingEvents[ev] = reason
  end
  if NS and NS.Logger then
    NS.Logger:info(string.format("registered %d events (%d refused, %d known-forbidden)",
      #EVENTS - refused, refused, (function()
        local n = 0; for _ in pairs(KNOWN_FORBIDDEN) do n = n + 1 end; return n
      end)()), NS.Logger.Categories.events)
  end
end

frame:RegisterEvent("ADDON_LOADED")
frame:SetScript("OnEvent", function(self, event, ...)
  if event == "ADDON_LOADED" then
    local loaded = ...
    if loaded ~= ADDON_NAME then return end

    local db = ensureDB()
    migrate(db)
    ensureCompanionDB()
    -- Seed RNG once for uuid(). time() + GetTime() gives sub-second jitter
    -- so two near-simultaneous /reload cycles don't collide. math.randomseed
    -- is nil in Retail Midnight's restricted Lua sandbox -- guard it. When
    -- absent, math.random uses Lua's default seed, which is fine for our
    -- non-crypto local-only identifier use case.
    if math.randomseed then
      pcall(math.randomseed, time() + math.floor((GetTime() or 0) * 1000))
    end
    db.meta.version = getMeta("Version") or "?"
    db.meta.project = projectName()
    db.meta.build = select(4, GetBuildInfo()) or "?"
    db.meta.startedAt = db.meta.startedAt or date("%Y-%m-%dT%H:%M:%S")
    db.meta.characterName = UnitName("player")
    db.meta.realm = GetRealmName()

    if C_ChatInfo and C_ChatInfo.RegisterAddonMessagePrefix then
      C_ChatInfo.RegisterAddonMessagePrefix(PREFIX)
    end

    -- Enable disk-based logging so the chat-log + combat-log transports
    -- Phase 1 wants to tail actually have something to read. These are
    -- non-protected on Retail Midnight and have no observable cost when
    -- toggled idempotently.
    if LoggingChat then
      pcall(LoggingChat, true)
      db.meta.chatLogEnabled = true
    end
    if LoggingCombat then
      pcall(LoggingCombat, true)
      db.meta.combatLogEnabled = true
    end

    registerEvents(db)

    print(string.format(
      "%s loaded v%s on %s (build %s). %d events armed. Type /aftertale for help.",
      CHAT_TAG, db.meta.version, db.meta.project, db.meta.build, #EVENTS
    ))
    return
  end

  local db = ensureDB()
  recordEvent(db, event, ...)

  -- Phase 1.6: session counters + UI signal bus. UI/*.lua files subscribe
  -- to the events they care about via NS.On(...). Wrapped so any UI
  -- errors stay scoped and never poison the capture pipeline.
  if NS then
    NS.session.events = NS.session.events + 1
    if event == "QUEST_ACCEPTED" then
      NS.session.quests = NS.session.quests + 1
      NS.Emit("QUEST_ACCEPTED", ...)
    elseif event == "QUEST_TURNED_IN" then
      NS.Emit("QUEST_TURNED_IN", ...)
    elseif event == "PLAYER_LEVEL_UP" then
      NS.session.levelsGained = NS.session.levelsGained + 1
      NS.Emit("PLAYER_LEVEL_UP", ...)
    elseif event == "GOSSIP_SHOW" then
      NS.session.npcs = NS.session.npcs + 1
    elseif event == "ZONE_CHANGED_NEW_AREA" then
      NS.session.lastZone = GetZoneText and GetZoneText() or NS.session.lastZone
      NS.Emit("ZONE_CHANGED_NEW_AREA", ...)
    elseif event == "PLAYER_DEAD" then
      NS.Emit("PLAYER_DEAD", ...)
    elseif event == "ACHIEVEMENT_EARNED" then
      NS.Emit("ACHIEVEMENT_EARNED", ...)
    elseif event == "PLAYER_LOGOUT" then
      NS.Emit("PLAYER_LOGOUT")
    end
  end

  -- Phase 0.75-C dispatch hooks (after recordEvent so the raw event is
  -- preserved in db.events for analysis).
  if event == "PLAYER_ENTERING_WORLD" then
    beginCharacterDetection(db)
  elseif event == "TIME_PLAYED_MSG" then
    local totalTimeSec, levelTimeSec = ...
    finalizeCharacterDetection(db, totalTimeSec, levelTimeSec)
  end
end)

------------------------------------------------------------------------
-- Public namespace (consumed by UI/*.lua via the addon's shared table)
--
-- Each sibling file does `local ADDON_NAME, NS = ...` to receive this.
-- We expose the minimum surface UI needs; everything else is private.
------------------------------------------------------------------------

NS = NS or {}
NS.CHAT_TAG = CHAT_TAG
NS.ADDON_PATH = "Interface\\AddOns\\" .. ADDON_NAME

-- Session-only counters; reset on /reload and PLAYER_LOGOUT. Used by the
-- session-recap banner so we can give the player closure.
NS.session = {
  startedAt = time(),
  events = 0,
  quests = 0,
  npcs = 0,
  levelsGained = 0,
  lastZone = nil,
}

function NS.GetDB()
  return ensureDB()
end

function NS.GetConfig()
  return ensureDB().config
end

function NS.GetCurrentCharacter()
  local db = ensureDB()
  local guid = UnitGUID and UnitGUID("player")
  if not guid then return nil end
  return db.characters[guid], guid
end

function NS.PlaySound(file)
  local cfg = NS.GetConfig()
  if not cfg.playSounds then return end
  if PlaySoundFile then
    pcall(PlaySoundFile, NS.ADDON_PATH .. "\\Sound\\" .. file, "Master")
  end
end

-- Lightweight signal bus -- UI files subscribe; core dispatches after
-- recordEvent. Keeps UI cleanly decoupled from the capture pipeline.
NS._subs = NS._subs or {}
function NS.On(event, handler)
  NS._subs[event] = NS._subs[event] or {}
  table.insert(NS._subs[event], handler)
end
function NS.Emit(event, ...)
  local list = NS._subs[event]
  if not list then return end
  for _, h in ipairs(list) do
    local ok, err = pcall(h, ...)
    if not ok then
      -- Swallow UI errors so cosmetic UX never breaks the capture pipeline.
      -- Route through the logger; ERROR level always mirrors to chat so we
      -- still see it even when the user hasn't enabled debug output.
      if NS.Logger then
        NS.Logger:error("UI handler error in '" .. tostring(event) .. "': " .. tostring(err),
          NS.Logger.Categories.ui)
      elseif DEFAULT_CHAT_FRAME then
        DEFAULT_CHAT_FRAME:AddMessage(CHAT_TAG .. " UI handler error: " .. tostring(err))
      end
    end
  end
end

------------------------------------------------------------------------
-- Slash commands
------------------------------------------------------------------------

SLASH_Aftertale1 = "/aftertale"
SLASH_Aftertale2 = "/at"

local function cmdHelp()
  print(CHAT_TAG .. " commands:")
  print("  /aftertale book              -- open the Chronicle (your in-game adventure album)")
  print("  /aftertale sync              -- import enriched paragraphs from the web companion")
  print("  /aftertale config            -- open the settings panel (UX toggles)")
  print("  /aftertale preview           -- preview the story card")
  print("  /aftertale count             -- show captured event totals")
  print("  /aftertale tail [N]          -- print the last N events (default 10)")
  print("  /aftertale clear             -- wipe the capture log")
  print("  /aftertale sample N          -- set combat-log sample rate (default 50)")
  print("  /aftertale max [N]           -- show/set ring buffer cap (default 5000, min 100)")
  print("  /aftertale missing           -- list events RegisterEvent refused on this flavor")
  print("  /aftertale version           -- show addon + client version info")
  print("  /aftertale chapters          -- list companion-generated chapters for this character")
  print("  /aftertale stats             -- captured/chronicled/pending counts for this character")
  print("  /aftertale characters        -- list characters Chronicles has seen")
  print("  /aftertale character reset <guid>  -- force re-onboarding for a character")
  print("  /aftertale enrichment [on|off]  -- toggle per-event enrichment (zone/quest title/NPC/loot)")
  print("  /aftertale log               -- diagnostics logger (see /aftertale log for sub-commands)")
end

-- Diagnostics logger control. Routes to NS.Logger. Sub-commands:
--   /aftertale log                          -- show current state
--   /aftertale log show [N]                 -- print last N entries (default 20)
--   /aftertale log clear                    -- wipe the in-memory ring buffer
--   /aftertale log chat on|off              -- mirror accepted log lines to chat
--   /aftertale log level <debug|info|warn|error>
--   /aftertale log <category> on|off        -- enable/silence a category
local function cmdLog(arg)
  if not (NS and NS.Logger) then
    print(CHAT_TAG .. " logger not loaded (Utils/Logger.lua missing from .toc?).")
    return
  end
  arg = arg or ""
  local sub, rest = arg:match("^(%S*)%s*(.-)$")
  sub = (sub or ""):lower()
  rest = rest or ""

  if sub == "" then
    NS.Logger:DescribeState()
    return
  end

  if sub == "show" then
    local n = tonumber(rest) or 20
    NS.Logger:Show(n)
    return
  end

  if sub == "clear" then
    NS.Logger:Clear()
    print(CHAT_TAG .. " logger ring buffer cleared.")
    return
  end

  if sub == "chat" then
    local v = rest:lower()
    if v == "on" or v == "true" or v == "1" then
      NS.Logger:SetMirrorToChat(true)
    elseif v == "off" or v == "false" or v == "0" then
      NS.Logger:SetMirrorToChat(false)
    end
    print(string.format("%s log chat mirroring is %s.",
      CHAT_TAG, NS.Logger:IsMirroringToChat() and "ON" or "OFF"))
    return
  end

  if sub == "level" then
    if rest == "" then
      local lvl = NS.Logger:GetLevel()
      local names = { [1] = "debug", [2] = "info", [3] = "warn", [4] = "error" }
      print(string.format("%s log level is %s.", CHAT_TAG, names[lvl] or "?"))
      return
    end
    local resolved = NS.Logger:SetLevel(rest)
    if not resolved then
      print(CHAT_TAG .. " unknown level '" .. rest .. "'. use debug|info|warn|error.")
    else
      local names = { [1] = "DEBUG", [2] = "INFO", [3] = "WARN", [4] = "ERROR" }
      print(string.format("%s log level set to %s.", CHAT_TAG, names[resolved]))
    end
    return
  end

  -- Otherwise treat sub as a category name and rest as on|off.
  if not NS.Logger.Categories[sub] then
    print(string.format("%s unknown log category '%s'. known: %s",
      CHAT_TAG, sub, (function()
        local ks = {}
        for k in pairs(NS.Logger.Categories) do ks[#ks + 1] = k end
        table.sort(ks)
        return table.concat(ks, ", ")
      end)()))
    return
  end
  local v = rest:lower()
  if v == "on" or v == "true" or v == "1" then
    NS.Logger:SetCategory(sub, true)
  elseif v == "off" or v == "false" or v == "0" then
    NS.Logger:SetCategory(sub, false)
  elseif v ~= "" then
    print(CHAT_TAG .. " usage: /aftertale log " .. sub .. " on|off")
    return
  end
  print(string.format("%s log category '%s' is %s.",
    CHAT_TAG, sub, NS.Logger:IsCategoryEnabled(sub) and "ON" or "OFF"))
end

local function cmdEnrichment(arg)
  local db = ensureDB()
  if arg == "on" or arg == "true" or arg == "1" then
    db.enrichmentEnabled = true
  elseif arg == "off" or arg == "false" or arg == "0" then
    db.enrichmentEnabled = false
  end
  print(string.format("%s enrichment is %s.", CHAT_TAG, db.enrichmentEnabled and "ON" or "OFF"))
end

local function cmdCount()
  local db = ensureDB()
  local total = #db.events
  print(string.format("%s %d events captured. by type:", CHAT_TAG, total))
  -- sort for stable output
  local names = {}
  for k in pairs(db.counts) do table.insert(names, k) end
  table.sort(names)
  for _, name in ipairs(names) do
    print(string.format("  %-32s %d", name, db.counts[name]))
  end
end

local function cmdTail(nStr)
  local db = ensureDB()
  local n = tonumber(nStr) or 10
  local total = #db.events
  local start = math.max(1, total - n + 1)
  print(string.format("%s last %d of %d:", CHAT_TAG, math.min(n, total), total))
  for i = start, total do
    local e = db.events[i]
    print(string.format("  [%s] %s  %s", e.ts, e.event, table.concat(e.args, " | ")))
  end
end

local function cmdClear()
  local db = ensureDB()
  db.events = {}
  db.counts = {}
  -- Preserve meta (populated once at ADDON_LOADED), missingEvents
  -- (forbidden-event annotations), and characters (Phase 0.75-C
  -- character registry) across clears. Only the rolling capture data
  -- resets.
  combatLogCounter = 0
  print(CHAT_TAG .. " capture log cleared (meta + characters preserved).")
end

local function cmdSample(nStr)
  local db = ensureDB()
  local n = tonumber(nStr)
  if not n or n < 1 then
    print(CHAT_TAG .. " sample rate must be a positive integer.")
    return
  end
  db.combatLogSampleRate = n
  print(string.format("%s combat-log sample rate set to %d (1-in-N).", CHAT_TAG, n))
end

local function cmdMax(nStr)
  local db = ensureDB()
  if nStr == nil or nStr == "" then
    print(string.format("%s ring buffer cap is %d events (%d currently held).",
      CHAT_TAG, db.config.maxEvents or 5000, #db.events))
    return
  end
  local n = tonumber(nStr)
  if not n or n < 100 then
    print(CHAT_TAG .. " max must be an integer >= 100.")
    return
  end
  db.config.maxEvents = n
  -- Apply immediately in case the new cap is below current size.
  while #db.events > n do
    table.remove(db.events, 1)
  end
  print(string.format("%s ring buffer cap set to %d (%d currently held).",
    CHAT_TAG, n, #db.events))
end

local function cmdMissing()
  local db = ensureDB()
  local names = {}
  for k in pairs(db.missingEvents) do table.insert(names, k) end
  if #names == 0 then
    print(CHAT_TAG .. " no missing events on " .. projectName() .. ".")
    return
  end
  table.sort(names)
  print(string.format("%s %d events not captured on %s:", CHAT_TAG, #names, projectName()))
  for _, n in ipairs(names) do
    local reason = db.missingEvents[n]
    if type(reason) == "string" then
      print(string.format("  %s  -- %s", n, reason))
    else
      print("  " .. n)
    end
  end
end

local function cmdCharacters()
  local db = ensureDB()
  local guids = {}
  for k in pairs(db.characters) do table.insert(guids, k) end
  if #guids == 0 then
    print(CHAT_TAG .. " no characters detected yet (login once to seed).")
    return
  end
  table.sort(guids, function(a, b)
    local ra, rb = db.characters[a], db.characters[b]
    return (ra.firstSeen.timestamp or 0) < (rb.firstSeen.timestamp or 0)
  end)
  print(string.format("%s %d character(s) on record:", CHAT_TAG, #guids))
  for _, guid in ipairs(guids) do
    local r = db.characters[guid]
    print(string.format(
      "  %s-%s  (%s %s, lvl %d)  [%s -> %s]  seen %dx",
      r.identity.name, r.identity.realm,
      r.identity.race or "?", r.identity.class or "?",
      (r.lastSeen and r.lastSeen.level) or r.firstSeen.level or 0,
      r.classification, r.onboardingState,
      r.sightings or 1
    ))
    print(string.format("    guid: %s", guid))
    print(string.format("    firstSeen: %s in %s (timePlayed=%s)",
      r.firstSeen.iso or "?", r.firstSeen.zoneText or "?",
      tostring(r.firstSeen.timePlayedSec)))
  end
end

local function cmdCharacterReset(arg)
  local db = ensureDB()
  local guid = arg and arg:match("^reset%s+(.+)$") or nil
  if not guid or guid == "" then
    print(CHAT_TAG .. " usage: /aftertale character reset <guid>")
    return
  end
  local r = db.characters[guid]
  if not r then
    print(CHAT_TAG .. " no character with guid '" .. guid .. "'.")
    return
  end
  r.classification = "pending"
  r.classificationReason = "manually reset"
  r.onboardingState = "pending"
  r.announced = false
  print(string.format("%s reset onboarding for %s-%s. Will re-announce on next PEW.",
    CHAT_TAG, r.identity.name, r.identity.realm))
end

local function cmdVersion()
  local db = ensureDB()
  print(string.format(
    "%s v%s | %s | build %s | %s-%s",
    CHAT_TAG, db.meta.version or "?", db.meta.project or "?",
    db.meta.build or "?", db.meta.characterName or "?", db.meta.realm or "?"
  ))
end

local function cmdStats()
  local db = ensureDB()
  local cdb = ensureCompanionDB()
  local me = (UnitName("player") or "?") .. "-" .. (GetRealmName() or "?")

  -- Compute pending on the fly: total events minus those whose id is
  -- present in companion.ingestedEventIds. Source of truth stays with
  -- the companion -- the addon never mutates ingestion state.
  local total = #db.events
  local ingested = 0
  local ingestedSet = cdb.ingestedEventIds or {}
  for _, ev in ipairs(db.events) do
    if ev.id and ingestedSet[ev.id] then
      ingested = ingested + 1
    end
  end
  local pending = total - ingested

  -- Count chapters for this character.
  local chapterCount = 0
  for _, ch in ipairs(cdb.generatedChapters) do
    if ch and ch.forCharacter == me then
      chapterCount = chapterCount + 1
    end
  end

  print(string.format("%s stats for %s:", CHAT_TAG, me))
  print(string.format("  %d events captured (%d chronicled, %d pending)",
    total, ingested, pending))
  print(string.format("  %d chapter(s) generated by companion",
    chapterCount))
  print(string.format("  ring buffer cap: %d", db.config.maxEvents or 5000))
  if total == 0 then
    print("  (no events yet -- play a bit, then /reload to flush SV.)")
  elseif ingested == 0 then
    print("  (no chapters ack'd yet -- the companion app marks ingestion.)")
  end
end

local function cmdChapters()
  local cdb = ensureCompanionDB()
  local me = (UnitName("player") or "?") .. "-" .. (GetRealmName() or "?")
  local mine = {}
  for _, ch in ipairs(cdb.generatedChapters) do
    if ch and ch.forCharacter == me then
      table.insert(mine, ch)
    end
  end

  if #mine == 0 then
    print(string.format("%s no chapters yet for %s.", CHAT_TAG, me))
    print("  Generated chapters land in AftertaleCompanion.lua")
    print("  once the Electron companion app processes captured events.")
    return
  end

  print(string.format("%s %d chapter(s) for %s:", CHAT_TAG, #mine, me))
  table.sort(mine, function(a, b)
    return (a.generatedAt or 0) < (b.generatedAt or 0)
  end)
  for i, ch in ipairs(mine) do
    local marker = ch.readByPlayer and " " or "*"
    print(string.format("  %s[%d] %s", marker, i, ch.title or "(untitled)"))
  end
  print("  (* = unread)  Full chapter text lives in the companion SV;")
  print("  the in-game reader will be wired into /aftertale book in a follow-up.")
end

SlashCmdList.Aftertale = function(msg)
  msg = msg or ""
  local cmd, arg = msg:match("^(%S*)%s*(.-)$")
  cmd = (cmd or ""):lower()
  if cmd == "" or cmd == "help" then cmdHelp()
  elseif cmd == "count" then cmdCount()
  elseif cmd == "tail" then cmdTail(arg)
  elseif cmd == "clear" then cmdClear()
  elseif cmd == "sample" then cmdSample(arg)
  elseif cmd == "max" then cmdMax(arg)
  elseif cmd == "missing" then cmdMissing()
  elseif cmd == "version" then cmdVersion()
  elseif cmd == "chapters" then cmdChapters()
  elseif cmd == "stats" then cmdStats()
  elseif cmd == "characters" then cmdCharacters()
  elseif cmd == "character" then cmdCharacterReset(arg)
  elseif cmd == "enrichment" then cmdEnrichment(arg)
  elseif cmd == "log" or cmd == "logs" then cmdLog(arg)
  elseif cmd == "config" or cmd == "settings" or cmd == "options" then
    if NS and NS.OpenSettings then NS.OpenSettings()
    else print(CHAT_TAG .. " settings UI not loaded yet -- /reload and retry.") end
  elseif cmd == "preview" then
    if NS and NS.PreviewStoryCard then NS.PreviewStoryCard()
    else print(CHAT_TAG .. " preview not available yet -- /reload and retry.") end
  elseif cmd == "book" or cmd == "chronicle" or cmd == "journal" then
    if NS and NS.OpenBook then NS.OpenBook()
    else print(CHAT_TAG .. " Chronicle book not loaded yet -- /reload and retry.") end
  elseif cmd == "sync" or cmd == "import" then
    if NS and NS.OpenSync then NS.OpenSync()
    else print(CHAT_TAG .. " sync dialog not loaded yet -- /reload and retry.") end
  else
    print(CHAT_TAG .. " unknown command '" .. cmd .. "'. try /aftertale help.")
  end
end
