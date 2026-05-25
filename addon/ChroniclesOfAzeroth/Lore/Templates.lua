-- Lore/Templates.lua -- the narrator template engine.
--
-- Maps raw events (QUEST_ACCEPTED, QUEST_TURNED_IN, PLAYER_LEVEL_UP,
-- ZONE_CHANGED_NEW_AREA) into a paragraph of flavor text. Supports
-- {name}, {npc}, {quest}, {zone}, {level} substitution.
--
-- TIER A fallback. When the player has run the web companion and
-- pasted enriched paragraphs via /coa sync, those override these
-- templates per-entry (matched by stable EntryID).

local ADDON_NAME, NS = ...
NS.Templates = NS.Templates or {}
local T = NS.Templates

T.QUEST_ACCEPTED = {
  "The parchment from {npc} weighs heavy in {name}'s satchel.",
  "{name} accepts the work {npc} has asked of them. {zone} grows longer with every errand.",
  "{npc} asked. {name} did not say no.",
  "'{quest}' -- the words press in like a promise.",
  "{name} folds the request away and turns toward the road.",
  "{npc} watches {name} go, then returns to their own quiet trouble.",
  "There is always more to be done. {npc} has just proven it again.",
  "Steel sharpens on errands like this. {name} accepts and moves on.",
  "Another thread to pull at, given freely by {npc}.",
  "{name} marks the work in their book of debts owed and owing.",
  "{npc} called {name} by name. Few enough do, in {zone}.",
  "The way {npc} said it left no room for refusal -- not really.",
  "{name} listens twice, asks once, and takes the task.",
  "It is not the size of the work that decides. {name} agrees.",
  "{npc} extends a worn hand. {name} clasps it. The agreement is plain.",
}

T.QUEST_TURNED_IN = {
  "{name} sets the burden down. {npc} nods, content.",
  "Done. {npc} reaches into a worn pouch.",
  "'{quest}' is finished. {npc} owes {name} a debt they may never speak of.",
  "{npc} looks {name} over once. The work shows.",
  "{name} returns. {npc} is glad of it -- gladder than they say.",
  "Another knot loosened. {npc} thanks {name} in their own way.",
  "{name} carries the news back. {npc} hears it without surprise.",
  "The reward changes hands. So does something quieter.",
  "{npc} did not expect to see {name} again. It pleases them to be wrong.",
  "{name} sets down the proof. {npc} examines it, then nods.",
  "Done is done. {npc} says little; the silence says enough.",
  "{name} stands a little taller, walking out of {zone}'s shadow.",
  "{npc} clears a place at their table that wasn't there before.",
  "It was {name}'s to finish, and {name} finished it.",
}

T.PLAYER_LEVEL_UP = {
  "Chapter {level}. {zone} witnessed the change.",
  "{name} crosses into level {level} beneath {zone}'s sky.",
  "Something old wakes in {name}. Level {level} now -- the weight of it is real.",
  "{name} feels every battle settle into bone. Level {level}.",
  "Level {level}. {zone} is smaller now than it was an hour ago.",
  "The road has taught {name} something it could not say aloud. Level {level}.",
  "Level {level}. A line crossed that {name} cannot recross.",
  "{name} reaches level {level}. The world tilts a degree in their favor.",
  "Level {level}. {name} feels the boundary of their old self give way.",
  "What {name} could not do yesterday, {name} will do tomorrow. Level {level}.",
  "The moon over {zone} sees a different {name} than it did at dawn. Level {level}.",
}

T.ZONE_CHANGED_NEW_AREA = {
  "{name} crosses into {zone}. The air tastes different here.",
  "{zone} opens before {name} -- new ground, new weather, new names to learn.",
  "The road delivers {name} to {zone} without ceremony.",
  "{name} steps over the boundary into {zone}. The map redraws itself.",
  "{zone}. {name} has been told of it; now {name} sees it.",
  "{name} sets foot in {zone} for what may be the first time, or the hundredth.",
  "There is a way {zone} smells that {name} will remember.",
  "{zone} welcomes {name} the way places do -- without comment.",
}

T.PLAYER_DEAD = {
  "{name} falls in {zone}. The wind does not stop for them.",
  "Death finds {name} in {zone}. Death will be patient enough to be answered.",
  "{name} learns the shape of {zone} the hard way.",
  "It was not the day {name} thought it would be. {zone} closes over them.",
  "{name}'s knees go. {zone} watches without comment.",
  "Down. {name} is down, and {zone} is colder than it was a moment ago.",
  "{name} pays a tax to {zone} they did not know was owed.",
  "There are places one does not stand for long. {name} found one in {zone}.",
  "{name} dies. The story is not finished; it merely turns a page.",
  "Something hit harder than {name} expected. {zone} keeps the lesson.",
}

T.ACHIEVEMENT_EARNED = {
  "{name} has done it -- '{achievement}' is theirs by right.",
  "'{achievement}'. A small word on a long road. {name} carries it now.",
  "Few enough will ever say they earned '{achievement}'. {name} is one.",
  "{name} unlocks '{achievement}'. Some doors only open after you've walked far enough.",
  "'{achievement}' -- spoken plainly by {name}, who has the right to say it.",
  "It is not nothing, '{achievement}'. {name} feels the weight of it settle.",
  "{name} stands a little taller. '{achievement}' will live on the back of every story they tell tonight.",
  "A line drawn under {name}'s name: '{achievement}'.",
}

------------------------------------------------------------------------
-- Helpers
------------------------------------------------------------------------

local function pick(pool, seed)
  if not pool or #pool == 0 then return "" end
  local idx = (math.abs(seed or 0) % #pool) + 1
  return pool[idx]
end

local function sub(s, vars)
  return (s:gsub("{(%w+)}", function(k) return vars[k] or ("{" .. k .. "}") end))
end

local function hashEntry(entry)
  local s = (entry.event or "") .. "|" .. (entry.ts or "") .. "|" .. tostring(entry.t or 0)
  local h = 0
  for i = 1, #s do h = (h * 31 + s:byte(i)) % 2147483647 end
  return h
end

-- Stable identifier so enriched paragraphs from the web companion can
-- round-trip cleanly. Format: EVENT:ISO_TS:keyArg
function T.EntryID(entry)
  local kind = entry.event or "EVENT"
  local ts   = entry.ts or "0"
  local key  = ""
  if entry.args and entry.args[1] ~= nil then key = tostring(entry.args[1]) end
  return kind .. ":" .. ts .. ":" .. key
end

function T.Narrate(entry, charName)
  local pool = T[entry.event]
  local enr  = entry.enrichment or {}
  local vars = {
    name        = charName or "the traveler",
    npc         = (enr.npc and enr.npc.name) or "an old face",
    quest       = enr.questTitle or "the matter at hand",
    zone        = enr.zoneText or "the road",
    level       = tostring(enr.level or "?"),
    achievement = enr.achievementName or "a quiet honor",
  }
  if not pool then
    return string.format("%s in %s. (%s)", vars.name, vars.zone, entry.event)
  end
  return sub(pick(pool, hashEntry(entry)), vars)
end

-- Brief one-line preview for the left-page entry list. Keeps the list
-- scannable without overwhelming each row.
function T.Preview(entry, charName)
  local enr = entry.enrichment or {}
  local e = entry.event or ""
  if e == "QUEST_ACCEPTED" then
    return "Accepted: " .. (enr.questTitle or "a quest")
  elseif e == "QUEST_TURNED_IN" then
    return "Finished: " .. (enr.questTitle or "a quest")
  elseif e == "PLAYER_LEVEL_UP" then
    return "Reached level " .. tostring(enr.level or "?")
  elseif e == "ZONE_CHANGED_NEW_AREA" then
    return "Entered " .. (enr.zoneText or "new ground")
  elseif e == "PLAYER_DEAD" then
    return "Fell in " .. (enr.zoneText or "battle")
  elseif e == "ACHIEVEMENT_EARNED" then
    return "Earned: " .. (enr.achievementName or "an achievement")
  end
  return e
end

function T.IsNarrativeEvent(eventName)
  return eventName == "QUEST_ACCEPTED"
      or eventName == "QUEST_TURNED_IN"
      or eventName == "PLAYER_LEVEL_UP"
      or eventName == "ZONE_CHANGED_NEW_AREA"
      or eventName == "PLAYER_DEAD"
      or eventName == "ACHIEVEMENT_EARNED"
end

-- Chapter label: "Chapter III -- Westfall" derived from grouping by
-- zone or by level-5 bands. Caller decides the grouping strategy.
function T.ChapterLabel(index, zoneText)
  local roman = { "I","II","III","IV","V","VI","VII","VIII","IX","X",
                  "XI","XII","XIII","XIV","XV","XVI","XVII","XVIII","XIX","XX",
                  "XXI","XXII","XXIII","XXIV","XXV","XXVI","XXVII","XXVIII","XXIX","XXX" }
  local r = roman[index] or tostring(index)
  if zoneText and zoneText ~= "" then
    return "Chapter " .. r .. " -- " .. zoneText
  end
  return "Chapter " .. r
end
