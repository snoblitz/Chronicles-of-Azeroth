-- Chronicles of Azeroth -- event spike addon
--
-- Purpose: validate the event contract that AddonSimulator.tsx promises.
-- Registers every WoW event the simulator emits, captures real payloads to
-- SavedVariables (ChroniclesOfAzerothDB), and mirrors a compact form via
-- SendAddonMessageLogged so we can also validate that transport for the
-- chat-log-based bridge that Phase 1 / Phase 2 depend on.
--
-- No AI. No UI. No magic. Just listen, capture, dump.

local ADDON_NAME, NS = ...

local PREFIX = "COA"
local CHAT_TAG = "|cFFFFD700[CoA]|r"

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
-- ChroniclesOfAzerothDB = {
--   meta = { version, project, build, characterName, realm, startedAt },
--   events = { { t, event, args = {...} }, ... },
--   counts = { [eventName] = number },
--   combatLogSampleRate = 50,
--   missingEvents = { [eventName] = true } -- events RegisterEvent rejected
-- }
------------------------------------------------------------------------

local function ensureDB()
  ChroniclesOfAzerothDB = ChroniclesOfAzerothDB or {}
  local db = ChroniclesOfAzerothDB
  db.meta = db.meta or {}
  db.events = db.events or {}
  db.counts = db.counts or {}
  db.missingEvents = db.missingEvents or {}
  db.combatLogSampleRate = db.combatLogSampleRate or 50
  return db
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
  -- Combat (entry/exit bookends only -- COMBAT_LOG_EVENT_UNFILTERED is
  -- restricted in modern Retail / requires a different registration path
  -- than what unsigned addons get, so we skip it here. The simulator's
  -- combat coverage will come from PLAYER_REGEN_* + UNIT_HEALTH or via
  -- an explicit opt-in path later in Phase 1.)
  "PLAYER_REGEN_DISABLED",   -- entered combat
  "PLAYER_REGEN_ENABLED",    -- left combat

  -- Inbound addon transport (to test SendAddonMessageLogged round-trip)
  "CHAT_MSG_ADDON",
}

-- Events known to be refused by RegisterEvent on certain flavors.
-- Tracked here so /coa missing reflects intent, not just runtime failures.
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
    t = GetTime(),
    ts = date("%Y-%m-%dT%H:%M:%S"),
    event = event,
    args = args,
  }
  table.insert(db.events, rec)

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
-- Frame + registration
------------------------------------------------------------------------

local frame = CreateFrame("Frame", "ChroniclesOfAzerothFrame")

local function registerEvents(db)
  for _, ev in ipairs(EVENTS) do
    local ok = pcall(function() frame:RegisterEvent(ev) end)
    if not ok then
      db.missingEvents[ev] = "RegisterEvent threw"
    end
  end
  -- Mark statically-known-forbidden events too so /coa missing tells the
  -- full story even when we deliberately skipped them.
  for ev, reason in pairs(KNOWN_FORBIDDEN) do
    db.missingEvents[ev] = reason
  end
end

frame:RegisterEvent("ADDON_LOADED")
frame:SetScript("OnEvent", function(self, event, ...)
  if event == "ADDON_LOADED" then
    local loaded = ...
    if loaded ~= ADDON_NAME then return end

    local db = ensureDB()
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
      "%s loaded v%s on %s (build %s). %d events armed. Type /coa for help.",
      CHAT_TAG, db.meta.version, db.meta.project, db.meta.build, #EVENTS
    ))
    return
  end

  local db = ensureDB()
  recordEvent(db, event, ...)
end)

------------------------------------------------------------------------
-- Slash commands
------------------------------------------------------------------------

SLASH_CHRONICLESOFAZEROTH1 = "/coa"

local function cmdHelp()
  print(CHAT_TAG .. " commands:")
  print("  /coa count        -- show captured event totals")
  print("  /coa tail [N]     -- print the last N events (default 10)")
  print("  /coa clear        -- wipe the capture log")
  print("  /coa sample N     -- set combat-log sample rate (default 50)")
  print("  /coa missing      -- list events RegisterEvent refused on this flavor")
  print("  /coa version      -- show addon + client version info")
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
  -- Preserve meta (populated once at ADDON_LOADED) and missingEvents
  -- (forbidden-event annotations) across clears. Only the rolling
  -- capture data resets.
  combatLogCounter = 0
  print(CHAT_TAG .. " capture log cleared (meta preserved).")
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

local function cmdVersion()
  local db = ensureDB()
  print(string.format(
    "%s v%s | %s | build %s | %s-%s",
    CHAT_TAG, db.meta.version or "?", db.meta.project or "?",
    db.meta.build or "?", db.meta.characterName or "?", db.meta.realm or "?"
  ))
end

SlashCmdList.CHRONICLESOFAZEROTH = function(msg)
  msg = msg or ""
  local cmd, arg = msg:match("^(%S*)%s*(.-)$")
  cmd = (cmd or ""):lower()
  if cmd == "" or cmd == "help" then cmdHelp()
  elseif cmd == "count" then cmdCount()
  elseif cmd == "tail" then cmdTail(arg)
  elseif cmd == "clear" then cmdClear()
  elseif cmd == "sample" then cmdSample(arg)
  elseif cmd == "missing" then cmdMissing()
  elseif cmd == "version" then cmdVersion()
  else
    print(CHAT_TAG .. " unknown command '" .. cmd .. "'. try /coa help.")
  end
end
