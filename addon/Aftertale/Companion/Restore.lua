-- Aftertale -- restore-snippet ingester
--
-- The web companion produces a `.lua` file that the user drops into:
--   WTF\Account\<ACCOUNT>\SavedVariables\AftertaleRestore.lua
-- That file sets `_G.AftertaleRestore` to a payload of
--   { schemaVersion, forCharacter?, generatedAt, bible?, events?, enriched? }
-- This module detects that global on load, merges it into
-- AftertaleDB, and clears it so the next SV save wipes the file
-- (preventing accidental re-application on subsequent /reloads).
--
-- This replaces the lossy COA-CHRONICLE-V1 blob pasted via /aftertale sync. The
-- old EditBox path still works as a fallback, but the snippet carries the
-- full enrichment subtable per event (zoneText, questTitle, npc.name,
-- encounterName, loot[]) so the parchment book renders chapters and entry
-- titles correctly after a /aftertale clear + reimport.
--
-- Design notes:
--   * Self-contained: we register our own ADDON_LOADED handler rather than
--     hooking into Aftertale.lua's main loader. Keeps merge logic
--     isolated and lets us defer to PLAYER_LOGIN if the main DB isn't
--     ready yet (in practice it always is, but cheap insurance).
--   * Idempotent: events dedupe by `id` (we never overwrite existing rows);
--     enriched paragraphs DO overwrite by EntryID (companion is source of
--     truth for enrichment); bible is only set if currently empty.
--   * Honest reporting: we surface counts via print() (user-facing) and via
--     NS.Logger:info(... , "companion") (diagnostic) so /aftertale log replay
--     can reconstruct what happened.

local ADDON_NAME, NS = ...

NS = NS or {}
local Restore = {}
NS.Restore = Restore

local function logInfo(msg)
  if NS.Logger and NS.Logger.info then
    NS.Logger:info(msg, "companion")
  end
end

local function logWarn(msg)
  if NS.Logger and NS.Logger.warn then
    NS.Logger:warn(msg, "companion")
  end
end

local AFTERTALE_TAG = "|cffd4a373[Aftertale]|r"

local SUPPORTED_SCHEMA = 1

-- Merge `src` events into `db.events`, skipping any whose id already
-- exists. Returns count of newly inserted rows.
local function mergeEvents(db, srcEvents)
  if type(srcEvents) ~= "table" then return 0 end
  db.events = db.events or {}
  local existing = {}
  for _, ev in ipairs(db.events) do
    if type(ev) == "table" and ev.id then
      existing[ev.id] = true
    end
  end
  local added = 0
  for _, ev in ipairs(srcEvents) do
    if type(ev) == "table" and ev.id and not existing[ev.id] then
      table.insert(db.events, ev)
      existing[ev.id] = true
      added = added + 1
    end
  end
  -- Respect the ring buffer cap so a huge restore doesn't blow past
  -- the user's configured limit.
  local cap = (db.config and db.config.maxEvents) or 5000
  while #db.events > cap do
    table.remove(db.events, 1)
  end
  return added
end

-- Merge enriched paragraphs. Companion-provided values overwrite by key
-- because the companion is the source of truth for enrichment text.
-- Returns count of keys written (including overwrites).
local function mergeEnriched(db, srcEnriched)
  if type(srcEnriched) ~= "table" then return 0 end
  db.enriched = db.enriched or {}
  local written = 0
  for k, v in pairs(srcEnriched) do
    if type(k) == "string" and type(v) == "string" and v ~= "" then
      db.enriched[k] = v
      written = written + 1
    end
  end
  return written
end

-- Only set bible if current is empty. Refuses to clobber existing prose,
-- because a player who's already written their own backstory shouldn't
-- lose it because the companion shipped a placeholder.
local function maybeSetBible(db, srcBible)
  if type(srcBible) ~= "string" or srcBible == "" then return false end
  if type(db.bible) == "string" and db.bible ~= "" then return false end
  db.bible = srcBible
  return true
end

-- The actual ingest. Safe to call multiple times; clears the global at
-- the end so subsequent calls are no-ops.
function Restore:Apply()
  local payload = _G.AftertaleRestore
  if type(payload) ~= "table" then return end

  local schema = tonumber(payload.schemaVersion) or 0
  if schema ~= SUPPORTED_SCHEMA then
    logWarn(("Skipped restore payload: unsupported schemaVersion %s (expected %d)."):format(
      tostring(payload.schemaVersion), SUPPORTED_SCHEMA))
    print(AFTERTALE_TAG .. " Restore skipped -- unsupported schema version.")
    _G.AftertaleRestore = nil
    return
  end

  local db = _G.AftertaleDB
  if type(db) ~= "table" then
    logWarn("Skipped restore payload: AftertaleDB not initialized.")
    return  -- leave payload in place; try again later
  end

  -- Optional character safety check. If forCharacter is set and we can
  -- determine the current player, warn but proceed -- a careful user
  -- copying their companion file to the wrong WTF folder will see this.
  local target = payload.forCharacter
  if type(target) == "string" and target ~= "" then
    local name = UnitName("player")
    local realm = GetRealmName()
    if name and realm then
      local current = name .. "-" .. realm
      if current ~= target then
        logWarn(("Restore payload was generated for %s but current character is %s. Applying anyway."):format(target, current))
        print(AFTERTALE_TAG .. " Warning: restore payload was generated for " ..
          target .. " (you are " .. current .. "). Applying anyway -- /aftertale stats to verify.")
      end
    end
  end

  local addedEvents = mergeEvents(db, payload.events)
  local writtenEnriched = mergeEnriched(db, payload.enriched)
  local setBible = maybeSetBible(db, payload.bible)

  local stamp = payload.generatedAt or "(unknown)"
  print(("%s Restore applied (snippet generated %s): +%d events, %d paragraphs%s.")
    :format(AFTERTALE_TAG, stamp, addedEvents, writtenEnriched,
            setBible and ", bible set" or ""))
  logInfo(("Restore applied: +%d events, %d enriched, bible=%s, generatedAt=%s")
    :format(addedEvents, writtenEnriched, tostring(setBible), stamp))

  -- Clear the global so the next SavedVariables save zeroes out the file.
  -- If we left the payload in place, every /reload would re-apply it
  -- (idempotent but noisy) and the file would persist forever.
  _G.AftertaleRestore = nil
end

-- Hook ADDON_LOADED for ourselves; defer the actual merge to PLAYER_LOGIN
-- so ensureDB() in the main file has definitely run by then.
local f = CreateFrame("Frame")
f:RegisterEvent("ADDON_LOADED")
f:RegisterEvent("PLAYER_LOGIN")
f:SetScript("OnEvent", function(_, event, arg1)
  if event == "ADDON_LOADED" and arg1 == ADDON_NAME then
    -- Nothing to do here yet; PLAYER_LOGIN does the work.
  elseif event == "PLAYER_LOGIN" then
    Restore:Apply()
  end
end)
