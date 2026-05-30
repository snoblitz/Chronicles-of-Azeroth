-- UI/Hub.lua -- the main Aftertale window.
--
-- A single dialog-strata 9-slice framed panel with a top tab strip
-- (OVERVIEW | MOMENTS | MILESTONES | WATCH | SETTINGS). Each tab swaps
-- in a content child; the chassis owns header, tabs, footer, and shared
-- helpers. This file currently ships the chassis + the Overview tab; the
-- other four tabs render a placeholder until their modules land.
--
-- Voice follows docs/value-prop.md: plain-language stats, aftertale.gg
-- named as a feature, no Scribe jargon. The Hub is the addon's primary
-- "I am working" surface for the cohort.

local ADDON_NAME, NS = ...
local S = NS.Style

local HUB_W, HUB_H = 960, 620
local CORNER       = 36
local PADDING      = 14

------------------------------------------------------------------------
-- Tabs
------------------------------------------------------------------------

local TABS = {
  { id = "overview",   label = "Overview"   },
  { id = "moments",    label = "Moments"    },
  { id = "milestones", label = "Milestones" },
  { id = "watch",      label = "Watch"      },
  { id = "settings",   label = "Settings"   },
}

local DEFAULT_TAB = "overview"

------------------------------------------------------------------------
-- Shared helpers (used by every tab the Hub will eventually own)
------------------------------------------------------------------------

-- Flat brand button. `primary` toggles the gold wash + bolder border.
local function makeButton(parent, w, h, text, primary)
  local b = CreateFrame("Button", nil, parent)
  b:SetSize(w, h)

  local fill = primary and "panel" or "inset"
  local bg = b:CreateTexture(nil, "BACKGROUND")
  bg:SetAllPoints(b)
  bg:SetColorTexture(S.rgba(fill))
  b.bg = bg

  if primary then
    local wash = b:CreateTexture(nil, "BACKGROUND", nil, 1)
    wash:SetAllPoints(b)
    wash:SetColorTexture(S.rgba("gold", 0.10))
  end

  local borderAlpha = primary and 0.9 or 0.45
  local function edge(p1, p2, vertical)
    local t = b:CreateTexture(nil, "BORDER")
    t:SetColorTexture(S.rgba("border", borderAlpha))
    t:SetPoint(p1); t:SetPoint(p2)
    if vertical then t:SetWidth(1) else t:SetHeight(1) end
  end
  edge("TOPLEFT", "TOPRIGHT", false)
  edge("BOTTOMLEFT", "BOTTOMRIGHT", false)
  edge("TOPLEFT", "BOTTOMLEFT", true)
  edge("TOPRIGHT", "BOTTOMRIGHT", true)

  local label = b:CreateFontString(nil, "OVERLAY")
  S.UseDisplayFont(label, 12, "")
  label:SetPoint("CENTER", 0, 0)
  label:SetText(S.Kicker(text or ""))
  label:SetTextColor(S.rgba(primary and "goldBright" or "gold"))
  b.label = label

  local hr, hg, hb, ha = S.rgba(primary and "gold" or "accent", primary and 0.18 or 0.10)
  b:SetScript("OnEnter", function() bg:SetColorTexture(hr, hg, hb, ha) end)
  b:SetScript("OnLeave", function() bg:SetColorTexture(S.rgba(fill)) end)
  return b
end

-- A clickable tab in the top strip. selected = true draws the gold rule.
local function makeTab(parent, label, onClick)
  local t = CreateFrame("Button", nil, parent)
  t:SetSize(140, 32)

  local fs = t:CreateFontString(nil, "OVERLAY")
  S.UseDisplayFont(fs, 12, "")
  fs:SetText(S.Kicker(label))
  fs:SetPoint("CENTER", 0, 2)
  fs:SetTextColor(S.rgba("fgMuted"))
  t.label = fs

  -- Gold underline (the "selected" indicator). Hidden until SetSelected(true).
  local rule = t:CreateTexture(nil, "ARTWORK")
  rule:SetColorTexture(S.rgba("gold", 0.9))
  rule:SetHeight(2)
  rule:SetPoint("BOTTOMLEFT", t, "BOTTOMLEFT", 16, 4)
  rule:SetPoint("BOTTOMRIGHT", t, "BOTTOMRIGHT", -16, 4)
  rule:Hide()
  t.rule = rule

  function t:SetSelected(on)
    if on then
      fs:SetTextColor(S.rgba("goldBright"))
      rule:Show()
    else
      fs:SetTextColor(S.rgba("fgMuted"))
      rule:Hide()
    end
  end

  t:SetScript("OnEnter", function(self)
    if not self._selected then fs:SetTextColor(S.rgba("gold")) end
  end)
  t:SetScript("OnLeave", function(self)
    if not self._selected then fs:SetTextColor(S.rgba("fgMuted")) end
  end)
  t:SetScript("OnClick", onClick)
  return t
end

-- A single stat tile: icon glyph + big gold number + small label.
local function makeStatTile(parent, w, h, iconGlyph, label)
  local tile = S.CreatePanel(parent, { fill = "inset", border = "border", borderAlpha = 0.35 })
  tile:SetSize(w, h)

  local icon = tile:CreateFontString(nil, "OVERLAY")
  S.UseDisplayFont(icon, 22, "")
  icon:SetText(iconGlyph or "")
  icon:SetPoint("TOP", tile, "TOP", 0, -12)
  icon:SetTextColor(S.rgba("accent"))

  local value = tile:CreateFontString(nil, "OVERLAY")
  S.UseDisplayFont(value, 26, "")
  value:SetText("0")
  value:SetPoint("CENTER", tile, "CENTER", 0, 2)
  value:SetTextColor(S.rgba("goldBright"))
  tile.value = value

  local lbl = tile:CreateFontString(nil, "OVERLAY")
  S.UseDisplayFont(lbl, 9, "")
  lbl:SetText(S.Kicker(label or ""))
  lbl:SetPoint("BOTTOM", tile, "BOTTOM", 0, 10)
  lbl:SetTextColor(S.rgba("fgMuted"))

  return tile
end

-- A single row in the Recent Moments list: glyph + label + right-aligned time.
local function makeMomentRow(parent, w)
  local row = CreateFrame("Frame", nil, parent)
  row:SetSize(w, 28)

  local icon = row:CreateFontString(nil, "OVERLAY")
  S.UseDisplayFont(icon, 13, "")
  icon:SetPoint("LEFT", row, "LEFT", 4, 0)
  icon:SetTextColor(S.rgba("accent"))
  row.icon = icon

  local label = S.AddBody(row, "", 13)
  label:SetPoint("LEFT", icon, "RIGHT", 10, 0)
  label:SetPoint("RIGHT", row, "RIGHT", -90, 0)
  label:SetJustifyH("LEFT")
  label:SetWordWrap(false)
  row.label = label

  local when = row:CreateFontString(nil, "OVERLAY")
  local f = (GameFontDisable or GameFontNormalSmall):GetFont()
  when:SetFont(f, 11, "")
  when:SetPoint("RIGHT", row, "RIGHT", -4, 0)
  when:SetJustifyH("RIGHT")
  when:SetTextColor(S.rgba("fgFaint"))
  row.when = when

  row:Hide()
  return row
end

------------------------------------------------------------------------
-- Data shaping for the Overview tab
------------------------------------------------------------------------

-- "27h", "23h 14m", "12m". The Time Recorded tile reads the earliest
-- event timestamp on record and reports elapsed wall-clock since.
local function formatHours(secs)
  secs = math.max(0, math.floor(secs or 0))
  if secs < 60          then return "0m" end
  if secs < 60 * 60     then return math.floor(secs / 60) .. "m" end
  local hrs = math.floor(secs / 3600)
  local mins = math.floor((secs % 3600) / 60)
  if hrs < 24 and mins > 0 then
    return hrs .. "h " .. mins .. "m"
  end
  return hrs .. "h"
end

-- One pass over db.events to compute the dashboard's six stats. Cheap
-- even for the full 5000-event ring buffer (single arithmetic loop).
local function computeStats(db)
  local s = {
    moments    = 0,
    quests     = 0,
    zones      = 0,  -- unique
    feats      = 0,
    dungeons   = 0,
    earliestT  = nil,
    recentEvents = {},
  }
  local seenZones = {}

  for _, e in ipairs(db.events or {}) do
    if e.ts and (not s.earliestT or e.ts < s.earliestT) then
      s.earliestT = e.ts
    end
    if e.event == "QUEST_TURNED_IN" then
      s.quests = s.quests + 1
    elseif e.event == "ACHIEVEMENT_EARNED" then
      s.feats = s.feats + 1
    elseif e.event == "ENCOUNTER_END" then
      local enr = e.enrichment
      if enr and enr.success then s.dungeons = s.dungeons + 1 end
    elseif e.event == "ZONE_CHANGED_NEW_AREA" then
      local enr = e.enrichment
      local zone = enr and enr.zoneText
      if zone and zone ~= "" and not seenZones[zone] then
        seenZones[zone] = true
        s.zones = s.zones + 1
      end
    end
  end

  -- Marked moments (the popover "Hold this moment" button writes to db.marked)
  if db.marked then s.moments = #db.marked end

  -- Time Recorded: parse the earliest "%Y-%m-%dT%H:%M:%S" stamp, compare to now.
  if s.earliestT then
    local y, mo, d, h, mi, se = s.earliestT:match(
      "(%d+)-(%d+)-(%d+)T(%d+):(%d+):(%d+)")
    if y then
      local t = time({
        year = tonumber(y), month = tonumber(mo), day = tonumber(d),
        hour = tonumber(h), min  = tonumber(mi), sec  = tonumber(se),
      })
      if t then s.recordedSec = math.max(0, (time() - t)) end
    end
  end

  -- Recent moments: last 5 narrative events, newest first.
  local NARRATIVE = {
    QUEST_TURNED_IN = "Quest completed",
    QUEST_ACCEPTED  = "Quest accepted",
    PLAYER_LEVEL_UP = "Reached new level",
    ZONE_CHANGED_NEW_AREA = "Entered",
    ACHIEVEMENT_EARNED = "Achievement earned",
    ENCOUNTER_END = "Encounter ended",
    PLAYER_DEAD = "Fell",
  }
  local picked = {}
  for i = #db.events, 1, -1 do
    if #picked >= 5 then break end
    local e = db.events[i]
    if NARRATIVE[e.event] then
      local enr = e.enrichment or {}
      local label = NARRATIVE[e.event]
      if e.event == "ZONE_CHANGED_NEW_AREA" and enr.zoneText then
        label = "Entered " .. enr.zoneText
      elseif e.event == "QUEST_TURNED_IN" and enr.questTitle then
        label = "Completed: " .. enr.questTitle
      elseif e.event == "QUEST_ACCEPTED" and enr.questTitle then
        label = "Took up: " .. enr.questTitle
      elseif e.event == "PLAYER_LEVEL_UP" and enr.level then
        label = "Reached Level " .. enr.level
      elseif e.event == "ACHIEVEMENT_EARNED" and enr.achievementName then
        label = "Earned: " .. enr.achievementName
      elseif e.event == "ENCOUNTER_END" and enr.encounterName then
        label = (enr.success and "Defeated: " or "Fell to: ") .. enr.encounterName
      end
      table.insert(picked, { label = label, when = e.ts or "", event = e.event })
    end
  end
  s.recentEvents = picked

  return s
end

-- "Today, 7:42 PM" / "Yesterday, 9:14 AM" / "May 27, 6:33 PM". Reads
-- an ISO "%Y-%m-%dT%H:%M:%S" stamp and renders a human-friendly tail.
local function formatWhen(iso)
  if not iso or iso == "" then return "" end
  local y, mo, d, h, mi = iso:match("(%d+)-(%d+)-(%d+)T(%d+):(%d+)")
  if not y then return iso end
  local then_t = time({
    year = tonumber(y), month = tonumber(mo), day = tonumber(d),
    hour = tonumber(h), min  = tonumber(mi), sec  = 0,
  })
  if not then_t then return iso end
  local hour = tonumber(h) or 0
  local mins = tonumber(mi) or 0
  local ampm = hour >= 12 and "PM" or "AM"
  local h12  = hour % 12
  if h12 == 0 then h12 = 12 end
  local clock = string.format("%d:%02d %s", h12, mins, ampm)
  local today = date("*t")
  local that  = date("*t", then_t)
  if today.year == that.year and today.month == that.month and today.day == that.day then
    return "Today, " .. clock
  end
  -- Yesterday window: 24h before today midnight.
  local yest = date("*t", time() - 24 * 3600)
  if yest.year == that.year and yest.month == that.month and yest.day == that.day then
    return "Yesterday, " .. clock
  end
  local months = { "Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec" }
  return string.format("%s %d, %s", months[that.month] or "?", that.day, clock)
end

-- "Recording since March 12, 2026" footer.
local function formatRecordingSince(iso)
  if not iso then return "" end
  local y, mo, d = iso:match("(%d+)-(%d+)-(%d+)")
  if not y then return "" end
  local months = { "January","February","March","April","May","June",
                   "July","August","September","October","November","December" }
  return string.format("Recording since %s %d, %s",
    months[tonumber(mo)] or "?", tonumber(d), y)
end

------------------------------------------------------------------------
-- Overview tab content
--
-- Layout: left column has a 3x2 grid of stat tiles (Moments / Time /
-- Zones / Quests / Feats / Dungeons). Right column lists the most recent
-- narrative events with timestamps. Footer holds "View All Moments"
-- (switches to the Moments tab) and "Open Chronicle" (web URL).
------------------------------------------------------------------------

local STATS_LAYOUT = {
  { key = "moments",  glyph = "\xE2\x9C\xA6", label = "Moments Captured"   }, -- ✦
  { key = "recordedSec", glyph = "\xE2\x97\x8B", label = "Time Recorded"   }, -- ○
  { key = "zones",    glyph = "\xE2\x9C\xA7", label = "Zones Visited"      }, -- ✧
  { key = "quests",   glyph = "\xE2\x9D\x96", label = "Quests Completed"   }, -- ❖
  { key = "feats",    glyph = "\xE2\x9A\x9C", label = "Achievements Earned"}, -- ⚜
  { key = "dungeons", glyph = "\xE2\x99\x9C", label = "Dungeons Completed" }, -- ♜
}

local function buildOverviewTab(parent)
  local tab = CreateFrame("Frame", nil, parent)
  tab:SetAllPoints(parent)

  -- LEFT: kicker + 3x2 stat grid
  local kicker = S.AddKicker(tab, "Story at a Glance")
  kicker:SetPoint("TOPLEFT", tab, "TOPLEFT", 4, -4)

  local TILE_W, TILE_H, GAP = 130, 110, 10
  local gridX, gridY = 0, -28
  tab.tiles = {}
  for i, def in ipairs(STATS_LAYOUT) do
    local col = (i - 1) % 3
    local row = math.floor((i - 1) / 3)
    local tile = makeStatTile(tab, TILE_W, TILE_H, def.glyph, def.label)
    tile:SetPoint("TOPLEFT", tab, "TOPLEFT",
      gridX + col * (TILE_W + GAP),
      gridY - row * (TILE_H + GAP))
    tab.tiles[def.key] = tile
  end
  local gridW = 3 * TILE_W + 2 * GAP
  local gridH = 2 * TILE_H + GAP

  -- RIGHT: kicker + Recent Moments list
  local rightX = gridW + 24
  local rightKicker = S.AddKicker(tab, "Recent Moments")
  rightKicker:SetPoint("TOPLEFT", tab, "TOPLEFT", rightX, -4)

  local rule = S.CreateRule(tab, "accent", 0.35)
  rule:SetPoint("TOPLEFT", rightKicker, "BOTTOMLEFT", 0, -8)
  rule:SetPoint("RIGHT", tab, "RIGHT", -4, 0)

  tab.rows = {}
  local rowW = HUB_W - 2 * (CORNER + PADDING) - rightX - 4
  for i = 1, 5 do
    local r = makeMomentRow(tab, rowW)
    if i == 1 then
      r:SetPoint("TOPLEFT", rule, "BOTTOMLEFT", 0, -8)
    else
      r:SetPoint("TOPLEFT", tab.rows[i - 1], "BOTTOMLEFT", 0, -4)
    end
    tab.rows[i] = r
  end

  -- FOOTER: recording-since on the left, two buttons on the right.
  tab.recordingSince = S.AddMuted(tab, "", 11)
  tab.recordingSince:SetPoint("BOTTOMLEFT", tab, "BOTTOMLEFT", 4, 14)

  tab.openChronicleBtn = makeButton(tab, 200, 36, "Open Chronicle", true)
  tab.openChronicleBtn:SetPoint("BOTTOMRIGHT", tab, "BOTTOMRIGHT", -4, 6)
  tab.openChronicleBtn:SetScript("OnClick", function()
    if NS.ShowChronicleURL then
      NS.ShowChronicleURL()
    else
      print(NS.CHAT_TAG .. " " .. (NS.GetConfig().webAppUrl or "https://aftertale.gg/"))
    end
  end)

  tab.viewMomentsBtn = makeButton(tab, 200, 36, "View All Moments", false)
  tab.viewMomentsBtn:SetPoint("BOTTOMRIGHT", tab.openChronicleBtn, "BOTTOMLEFT", -10, 0)
  tab.viewMomentsBtn:SetScript("OnClick", function()
    if NS.OpenHubTab then NS.OpenHubTab("moments") end
  end)

  function tab:Refresh()
    local db = NS.GetDB()
    local stats = computeStats(db)

    for _, def in ipairs(STATS_LAYOUT) do
      local tile = self.tiles[def.key]
      if tile then
        if def.key == "recordedSec" then
          tile.value:SetText(formatHours(stats.recordedSec))
        else
          tile.value:SetText(tostring(stats[def.key] or 0))
        end
      end
    end

    for i, row in ipairs(self.rows) do
      local e = stats.recentEvents[i]
      if e then
        row.icon:SetText("\xE2\x9C\xA6") -- ✦ -- per-event glyphs land in v2
        row.label:SetText(e.label)
        row.when:SetText(formatWhen(e.when))
        row:Show()
      else
        row:Hide()
      end
    end

    if stats.earliestT then
      self.recordingSince:SetText(formatRecordingSince(stats.earliestT))
    else
      self.recordingSince:SetText("Watch has just begun -- play on, and your moments will land here.")
    end
  end

  return tab
end

------------------------------------------------------------------------
-- Placeholder for tabs we haven't built yet.
------------------------------------------------------------------------

local function buildPlaceholderTab(parent, name)
  local tab = CreateFrame("Frame", nil, parent)
  tab:SetAllPoints(parent)

  local body = S.AddBody(tab, "", 14)
  body:SetPoint("CENTER", 0, 0)
  body:SetJustifyH("CENTER")
  body:SetText("The " .. name .. " tab arrives in a follow-up.")
  body:SetTextColor(S.rgba("fgMuted"))

  function tab:Refresh() end
  return tab
end

------------------------------------------------------------------------
-- The Hub frame, built lazily on first open.
------------------------------------------------------------------------

local hub

local function build()
  if hub then return hub end

  -- 9-slice framed panel. Children anchor to hub.content; never to hub.
  hub = S.CreateFramedPanel(UIParent, { cornerSize = CORNER, padding = PADDING })
  hub:SetSize(HUB_W, HUB_H)
  hub:SetPoint("CENTER", UIParent, "CENTER", 0, 0)
  hub:SetFrameStrata("DIALOG")
  hub:EnableMouse(true)
  hub:SetMovable(true)
  hub:RegisterForDrag("LeftButton")
  hub:SetScript("OnDragStart", hub.StartMoving)
  hub:SetScript("OnDragStop",  hub.StopMovingOrSizing)
  hub:Hide()

  _G["AftertaleHub"] = hub
  table.insert(UISpecialFrames, "AftertaleHub") -- ESC closes

  local C_AREA = hub.content

  -- HEADER: gold Cinzel title + close X.
  local title = S.AddHeading(C_AREA, "Aftertale", 26)
  title:SetPoint("TOP", C_AREA, "TOP", 0, -2)

  local close = CreateFrame("Button", nil, C_AREA)
  close:SetSize(24, 24)
  close:SetPoint("TOPRIGHT", C_AREA, "TOPRIGHT", -2, -2)
  local x = close:CreateFontString(nil, "OVERLAY")
  x:SetFont((GameFontNormalLarge or GameFontNormal):GetFont(), 18, "")
  x:SetPoint("CENTER", 0, 0)
  x:SetText("\xC3\x97") -- ×
  x:SetTextColor(S.rgba("fgMuted"))
  close:SetScript("OnEnter", function() x:SetTextColor(S.rgba("goldBright")) end)
  close:SetScript("OnLeave", function() x:SetTextColor(S.rgba("fgMuted")) end)
  close:SetScript("OnClick", function() hub:Hide() end)

  -- TABS: row of buttons under the title.
  local tabStrip = CreateFrame("Frame", nil, C_AREA)
  tabStrip:SetSize(C_AREA:GetWidth() or (HUB_W - 100), 36)
  tabStrip:SetPoint("TOP", title, "BOTTOM", 0, -8)
  tabStrip:SetPoint("LEFT", C_AREA, "LEFT", 0, 0)
  tabStrip:SetPoint("RIGHT", C_AREA, "RIGHT", 0, 0)

  hub.tabButtons = {}
  hub.tabFrames  = {}

  -- A divider rule under the tabs.
  local tabsRule = S.CreateRule(C_AREA, "border", 0.35)
  tabsRule:SetPoint("TOPLEFT", tabStrip, "BOTTOMLEFT", 0, -2)
  tabsRule:SetPoint("TOPRIGHT", tabStrip, "BOTTOMRIGHT", 0, -2)

  -- CONTENT BODY: child frame each tab attaches into.
  local body = CreateFrame("Frame", nil, C_AREA)
  body:SetPoint("TOPLEFT",     tabsRule, "BOTTOMLEFT",     0, -14)
  body:SetPoint("BOTTOMRIGHT", C_AREA,   "BOTTOMRIGHT",    0, 0)
  hub.body = body

  -- Build each tab's content frame (hidden until selected). Overview is
  -- the only fleshed-out one for now; the others render a placeholder.
  hub.tabFrames.overview   = buildOverviewTab(body)
  hub.tabFrames.moments    = buildPlaceholderTab(body, "Moments")
  hub.tabFrames.milestones = buildPlaceholderTab(body, "Milestones")
  hub.tabFrames.watch      = buildPlaceholderTab(body, "Watch")
  hub.tabFrames.settings   = buildPlaceholderTab(body, "Settings")
  for _, f in pairs(hub.tabFrames) do f:Hide() end

  -- Build tab buttons and lay them out evenly across the strip.
  local TAB_W = 140
  local total = TAB_W * #TABS
  local startX = math.floor(((tabStrip:GetWidth() or (HUB_W - 100)) - total) / 2)
  for i, tab in ipairs(TABS) do
    local btn = makeTab(tabStrip, tab.label, function()
      NS.OpenHubTab(tab.id)
    end)
    btn:SetPoint("LEFT", tabStrip, "LEFT", startX + (i - 1) * TAB_W, 0)
    hub.tabButtons[tab.id] = btn
  end

  return hub
end

------------------------------------------------------------------------
-- Public API
------------------------------------------------------------------------

NS.OpenHubTab = function(id)
  local h = build()
  for tabId, btn in pairs(h.tabButtons) do
    local selected = tabId == id
    btn:SetSelected(selected)
    btn._selected = selected
  end
  for tabId, frame in pairs(h.tabFrames) do
    if tabId == id then
      frame:Show()
      if frame.Refresh then frame:Refresh() end
    else
      frame:Hide()
    end
  end
  h._currentTab = id
end

NS.OpenHub = function()
  local h = build()
  if h:IsShown() then h:Hide(); return end
  NS.OpenHubTab(h._currentTab or DEFAULT_TAB)
  h:Show()
end

NS.RefreshHub = function()
  if not hub or not hub:IsShown() then return end
  local frame = hub.tabFrames[hub._currentTab or DEFAULT_TAB]
  if frame and frame.Refresh then frame:Refresh() end
end

-- Surface the chronicle URL via a copy-paste popup. Reused from the
-- minimap-button era so it's a known-good flow; only declared once.
if StaticPopupDialogs and not StaticPopupDialogs["AFTERTALE_CHRONICLE_URL"] then
  StaticPopupDialogs["AFTERTALE_CHRONICLE_URL"] = {
    text = "Your chronicle lives at this URL.\nCopy it, then paste into a browser:",
    button1 = OKAY or "OK",
    hasEditBox = true,
    editBoxWidth = 350,
    OnShow = function(self, data)
      local eb = self.EditBox or self.editBox
      if not eb then return end
      eb:SetText((data and data.url) or "")
      eb:HighlightText()
      eb:SetFocus()
    end,
    OnHide = function(self)
      local eb = self.EditBox or self.editBox
      if eb then eb:SetText("") end
    end,
    EditBoxOnEscapePressed = function(self) self:GetParent():Hide() end,
    EditBoxOnEnterPressed  = function(self) self:GetParent():Hide() end,
    timeout = 0,
    whileDead = true,
    hideOnEscape = true,
    preferredIndex = 3,
  }
end

NS.ShowChronicleURL = function()
  local url = (NS.GetConfig() and NS.GetConfig().webAppUrl) or "https://aftertale.gg/"
  if StaticPopup_Show then
    StaticPopup_Show("AFTERTALE_CHRONICLE_URL", nil, nil, { url = url })
  else
    print(NS.CHAT_TAG .. " " .. url)
  end
end

-- Live refresh while the Hub is open.
if NS.On then
  for _, evt in ipairs({
    "QUEST_ACCEPTED", "QUEST_TURNED_IN", "PLAYER_LEVEL_UP",
    "ZONE_CHANGED_NEW_AREA", "PLAYER_DEAD", "ACHIEVEMENT_EARNED",
  }) do
    NS.On(evt, function() NS.RefreshHub() end)
  end
end
