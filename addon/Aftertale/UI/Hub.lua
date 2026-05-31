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

local HUB_W, HUB_H = 960, 677
local CORNER       = 36
local PADDING      = 14

-- Art paths. NS.ADDON_PATH is "Interface\\AddOns\\Aftertale" at runtime.
local function artPath(rel)
  return (NS.ADDON_PATH or "Interface\\AddOns\\Aftertale") .. "\\Art\\" .. rel
end

local ICON = {
  moments     = artPath("icons\\moments.png"),
  time        = artPath("icons\\time.png"),
  zones       = artPath("icons\\zones.png"),
  quests      = artPath("icons\\quests.png"),
  feats       = artPath("icons\\feats.png"),
  dungeons    = artPath("icons\\dungeons.png"),
  level       = artPath("icons\\level.png"),
  death       = artPath("icons\\death.png"),
  items       = artPath("icons\\items.png"),
  discoveries = artPath("icons\\discoveries.png"),
  chronicle   = artPath("icons\\chronicle.png"),
  settings    = artPath("icons\\settings.png"),
}
local SIGIL_HEADER = artPath("sigil-header.png")

-- Per-event icon for the Recent Moments rows.
local EVENT_ICON = {
  QUEST_ACCEPTED        = ICON.quests,
  QUEST_TURNED_IN       = ICON.quests,
  PLAYER_LEVEL_UP       = ICON.level,
  ZONE_CHANGED_NEW_AREA = ICON.zones,
  ACHIEVEMENT_EARNED    = ICON.feats,
  ENCOUNTER_END         = ICON.dungeons,
  PLAYER_DEAD           = ICON.death,
}

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

-- A single stat tile: rounded plum inner-cell background, illustrated icon
-- on top, gold number beneath, title-case 2-line label at the bottom.
-- Sized for 6 tiles in a 3x2 grid inside the left column inner-frame.
local function makeStatTile(parent, w, h, iconPath, label)
  local tile = S.CreateInnerCell(parent, w, h, { padding = 6 })

  if iconPath then
    local icon = tile:CreateTexture(nil, "ARTWORK")
    icon:SetTexture(iconPath)
    icon:SetSize(44, 44)
    icon:SetPoint("TOP", tile, "TOP", 0, -10)
    tile.icon = icon
  end

  local value = tile:CreateFontString(nil, "OVERLAY")
  S.UseDisplayFont(value, 20, "")
  value:SetText("0")
  value:SetPoint("TOP", tile, "TOP", 0, -56)
  value:SetTextColor(S.rgba("goldBright"))
  tile.value = value

  -- Plain title case, no letter-spacing, two lines allowed. Matches the
  -- mockup's "Moments Captured" / "Achievements Earned" treatment.
  local lbl = tile:CreateFontString(nil, "OVERLAY")
  S.UseDisplayFont(lbl, 10, "")
  lbl:SetText(label or "")
  lbl:SetPoint("BOTTOMLEFT",  tile, "BOTTOMLEFT",   4, 6)
  lbl:SetPoint("BOTTOMRIGHT", tile, "BOTTOMRIGHT", -4, 6)
  lbl:SetJustifyH("CENTER")
  lbl:SetJustifyV("BOTTOM")
  lbl:SetWordWrap(true)
  lbl:SetSpacing(1)
  lbl:SetTextColor(S.rgba("fgMuted"))

  return tile
end

-- A single row in the Recent Moments list. Layout: per-event illustrated
-- icon on the left, label in the middle, optional gold metadata tag (e.g.
-- "+1.2k XP" for quest-turnin), timestamp right-aligned.
--
-- The label's RIGHT anchor is updated in Refresh() based on whether the
-- tag is shown, so a hidden tag doesn't leave dead space between the
-- label and the timestamp.
local function makeMomentRow(parent, w)
  local row = CreateFrame("Frame", nil, parent)
  row:SetSize(w, 32)

  local icon = row:CreateTexture(nil, "ARTWORK")
  icon:SetSize(22, 22)
  icon:SetPoint("LEFT", row, "LEFT", 2, 0)
  row.icon = icon

  local when = row:CreateFontString(nil, "OVERLAY")
  local f = (GameFontDisable or GameFontNormalSmall):GetFont()
  when:SetFont(f, 11, "")
  when:SetPoint("RIGHT", row, "RIGHT", -4, 0)
  when:SetJustifyH("RIGHT")
  when:SetTextColor(S.rgba("fgFaint"))
  row.when = when

  local tag = row:CreateFontString(nil, "OVERLAY")
  S.UseDisplayFont(tag, 11, "")
  tag:SetPoint("RIGHT", when, "LEFT", -10, 0)
  tag:SetJustifyH("RIGHT")
  tag:SetTextColor(S.rgba("gold"))
  tag:Hide()
  row.tag = tag

  local label = S.AddBody(row, "", 13)
  label:SetPoint("LEFT", icon, "RIGHT", 10, 0)
  -- Label RIGHT anchor is set dynamically in Refresh -- either to tag.LEFT
  -- (when a tag is present) or directly to when.LEFT.
  label:SetJustifyH("LEFT")
  label:SetWordWrap(false)
  label:SetNonSpaceWrap(false)
  row.label = label

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
  -- "+1234" -> "+1.2k XP", "+250" -> "+250 XP". Returns nil for <= 0 or nil.
  local function formatXpTag(xp)
    if not xp or xp <= 0 then return nil end
    if xp >= 1000 then return string.format("+%.1fk XP", xp / 1000) end
    return string.format("+%d XP", xp)
  end

  local picked = {}
  for i = #db.events, 1, -1 do
    if #picked >= 5 then break end
    local e = db.events[i]
    if NARRATIVE[e.event] then
      local enr = e.enrichment or {}
      local label = NARRATIVE[e.event]
      local tag = nil
      if e.event == "ZONE_CHANGED_NEW_AREA" and enr.zoneText then
        label = "Entered " .. enr.zoneText
      elseif e.event == "QUEST_TURNED_IN" and enr.questTitle then
        label = "Completed: " .. enr.questTitle
        -- QUEST_TURNED_IN args: (questID, xpReward, moneyReward). args are
        -- packed as strings; tonumber handles the conversion safely.
        if e.args and e.args[2] then tag = formatXpTag(tonumber(e.args[2])) end
      elseif e.event == "QUEST_ACCEPTED" and enr.questTitle then
        label = "Took up: " .. enr.questTitle
      elseif e.event == "PLAYER_LEVEL_UP" and enr.level then
        label = "Reached Level " .. enr.level
      elseif e.event == "ACHIEVEMENT_EARNED" and enr.achievementName then
        label = "Earned: " .. enr.achievementName
      elseif e.event == "ENCOUNTER_END" and enr.encounterName then
        label = (enr.success and "Defeated: " or "Fell to: ") .. enr.encounterName
      end
      table.insert(picked, { label = label, when = e.ts or "", event = e.event, tag = tag })
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
  { key = "moments",     icon = ICON.moments,  label = "Moments Captured"    },
  { key = "recordedSec", icon = ICON.time,     label = "Time Recorded"       },
  { key = "zones",       icon = ICON.zones,    label = "Zones Visited"       },
  { key = "quests",      icon = ICON.quests,   label = "Quests Completed"    },
  { key = "feats",       icon = ICON.feats,    label = "Achievements Earned" },
  { key = "dungeons",    icon = ICON.dungeons, label = "Dungeons Completed"  },
}

local function buildOverviewTab(parent)
  local tab = CreateFrame("Frame", nil, parent)
  tab:SetAllPoints(parent)

  -- TWO COLUMNS, each wrapped in inner-frame (9-sliced so the gold corner
  -- stars stay sharp at the ~0.89:1 column aspect). No vertical separator
  -- between them -- mockup just uses a visual gap.
  local COL_W   = math.floor((parent:GetWidth() or 860) / 2) - 8
  local COL_H   = parent:GetHeight() > 0 and parent:GetHeight() or 479
  local COL_GAP = 16

  local leftCol  = S.CreateInnerFrame(tab, COL_W, COL_H, { padding = 18 })
  leftCol:SetPoint("TOPLEFT", tab, "TOPLEFT", 0, 0)

  local rightCol = S.CreateInnerFrame(tab, COL_W, COL_H, { padding = 18 })
  rightCol:SetPoint("TOPLEFT", leftCol, "TOPRIGHT", COL_GAP, 0)

  local LC = leftCol.content
  local RC = rightCol.content

  --------------------------------------------------------------------
  -- LEFT COLUMN: Story at a Glance kicker + 3x2 stat grid + recording pill
  --------------------------------------------------------------------

  local leftKicker = S.AddKicker(LC, "Story at a Glance")
  leftKicker:SetPoint("TOPLEFT", LC, "TOPLEFT", 0, 0)

  local TILE_W, TILE_H, TILE_GAP = 120, 120, 6
  tab.tiles = {}
  for i, def in ipairs(STATS_LAYOUT) do
    local col = (i - 1) % 3
    local row = math.floor((i - 1) / 3)
    local tile = makeStatTile(LC, TILE_W, TILE_H, def.icon, def.label)
    tile:SetPoint("TOPLEFT", LC, "TOPLEFT",
      col * (TILE_W + TILE_GAP),
      -28 - row * (TILE_H + TILE_GAP))
    tab.tiles[def.key] = tile
  end

  -- "Recording since ..." pill at the bottom of the left column, with the
  -- pulsing violet dot indicating the watch is active.
  tab.recordingPill = S.CreateInnerCell(LC, 280, 32, { padding = 10 })
  tab.recordingPill:SetPoint("BOTTOMLEFT", LC, "BOTTOMLEFT", 0, 0)

  local pillContent = tab.recordingPill.content
  local pillDot = S.AddRecordingDot(pillContent, 8)
  pillDot:SetPoint("LEFT", pillContent, "LEFT", 0, 0)

  tab.recordingSince = S.AddMuted(pillContent, "", 11)
  tab.recordingSince:SetPoint("LEFT",  pillDot,      "RIGHT", 8, 0)
  tab.recordingSince:SetPoint("RIGHT", pillContent,  "RIGHT", 0, 0)
  tab.recordingSince:SetJustifyH("LEFT")

  --------------------------------------------------------------------
  -- RIGHT COLUMN: Recent Moments kicker + separator + 5 rows + buttons
  --------------------------------------------------------------------

  local rightKicker = S.AddKicker(RC, "Recent Moments")
  rightKicker:SetPoint("TOPLEFT", RC, "TOPLEFT", 0, 0)

  local rightRule = S.AddSeparator(RC, "horizontal")
  rightRule:SetPoint("TOPLEFT",  rightKicker, "BOTTOMLEFT", 0, -8)
  rightRule:SetPoint("TOPRIGHT", RC,          "TOPRIGHT",   0, -28)

  tab.rows = {}
  for i = 1, 5 do
    local r = makeMomentRow(RC, RC:GetWidth())
    if i == 1 then
      r:SetPoint("TOPLEFT",  rightRule, "BOTTOMLEFT", 0, -8)
      r:SetPoint("TOPRIGHT", rightRule, "BOTTOMRIGHT", 0, -8)
    else
      r:SetPoint("TOPLEFT",  tab.rows[i - 1], "BOTTOMLEFT",  0, -4)
      r:SetPoint("TOPRIGHT", tab.rows[i - 1], "BOTTOMRIGHT", 0, -4)
    end
    tab.rows[i] = r
  end

  -- Two buttons at the bottom of the right column. "View All Moments" is
  -- the muted action; "Open Chronicle" uses the gold CTA with baked text.
  local BTN_W, BTN_H = 175, 42

  tab.viewMomentsBtn = S.CreateImageButton(RC,
    "frame\\button-idle.png", "frame\\button-hover.png",
    BTN_W, BTN_H, "View All Moments")
  tab.viewMomentsBtn:SetPoint("BOTTOMLEFT", RC, "BOTTOMLEFT", 0, 0)
  tab.viewMomentsBtn:SetScript("OnClick", function()
    if NS.OpenHubTab then NS.OpenHubTab("moments") end
  end)

  tab.openChronicleBtn = S.CreateCTAButton(RC, BTN_W, BTN_H)
  tab.openChronicleBtn:SetPoint("BOTTOMRIGHT", RC, "BOTTOMRIGHT", 0, 0)
  tab.openChronicleBtn:SetScript("OnClick", function()
    if NS.ShowChronicleURL then
      NS.ShowChronicleURL()
    else
      print(NS.CHAT_TAG .. " " .. (NS.GetConfig().webAppUrl or "https://aftertale.gg/"))
    end
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
        local icon = EVENT_ICON[e.event] or ICON.moments
        row.icon:SetTexture(icon)
        row.label:SetText(e.label)
        row.when:SetText(formatWhen(e.when))

        -- Optional metadata tag ("+1.2k XP", "+150 XP", etc.). Anchor the
        -- label's RIGHT to either the tag's LEFT (if present) or the
        -- timestamp's LEFT (if not), so we don't leave dead space.
        if e.tag and e.tag ~= "" then
          row.tag:SetText(e.tag)
          row.tag:Show()
          row.label:SetPoint("RIGHT", row.tag, "LEFT", -10, 0)
        else
          row.tag:Hide()
          row.label:SetPoint("RIGHT", row.when, "LEFT", -10, 0)
        end

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

  -- Whole-texture art frame (preserves the baked corner + centered-edge
  -- ornaments that a stretched 9-slice would smear). Hub size is matched to
  -- the art's 1.419 aspect so the border stays uniform and undistorted.
  -- Content inset kept at CORNER+PADDING so the existing layout math holds.
  -- Children anchor to hub.content; never to hub.
  hub = S.CreateArtFramedPanel(UIParent, {
    art    = "frame-rectangle",
    insetX = CORNER + PADDING,
    insetY = CORNER + PADDING,
    shadow = { depth = 32, alpha = 0.6 },
  })
  hub:SetSize(HUB_W, HUB_H)
  hub:SetPoint("CENTER", UIParent, "CENTER", 0, 0)
  hub:SetFrameStrata("DIALOG")
  hub:EnableMouse(true)
  hub:SetMovable(true)
  hub:RegisterForDrag("LeftButton")
  hub:SetScript("OnDragStart", hub.StartMoving)
  hub:SetScript("OnDragStop",  hub.StopMovingOrSizing)
  hub:Hide()

  -- Modal scrim: dims the game world behind the Hub so the panel's gold
  -- corners stop fighting the busy in-world background. Click-outside-to-
  -- close + tracks Show/Hide automatically.
  S.AddModalScrim(hub, { alpha = 0.40 })

  _G["AftertaleHub"] = hub
  table.insert(UISpecialFrames, "AftertaleHub") -- ESC closes

  local C_AREA = hub.content

  -- HEADER (top-left): sigil + "Aftertale" title sit side-by-side at the
  -- top-left of the panel, matching the mockup. Sigil overhangs the gold
  -- top border so its center sits on the edge; title anchors next to it.
  local sigil = hub:CreateTexture(nil, "OVERLAY")
  sigil:SetTexture(SIGIL_HEADER)
  sigil:SetSize(64, 64)
  -- Anchor sigil center to top-left of the CONTENT area (not the outer
  -- frame) so it lands inside the panel rather than overhanging the corner.
  sigil:SetPoint("CENTER", C_AREA, "TOPLEFT", 24, 0)

  local title = S.AddHeading(C_AREA, "Aftertale", 26)
  title:SetPoint("LEFT", C_AREA, "TOPLEFT", 64, -10)

  -- Close X (top-right) using the close icon asset.
  local close = S.AddCloseButton(C_AREA, 22)
  close:SetPoint("TOPRIGHT", C_AREA, "TOPRIGHT", -2, -4)
  close:SetScript("OnClick", function() hub:Hide() end)

  -- TABS: left-aligned strip under the title. Mockup puts them flush left
  -- starting at the same x as the title.
  local TAB_W   = 130
  local TAB_X0  = 0  -- start at the content-area's left edge
  local TAB_Y   = -50 -- below the title row
  local tabStrip = CreateFrame("Frame", nil, C_AREA)
  tabStrip:SetHeight(32)
  tabStrip:SetPoint("TOPLEFT",  C_AREA, "TOPLEFT",  TAB_X0,  TAB_Y)
  tabStrip:SetPoint("TOPRIGHT", C_AREA, "TOPRIGHT", 0,       TAB_Y)

  hub.tabButtons = {}
  hub.tabFrames  = {}

  -- Gold separator under the tab strip (replaces the old CreateRule line).
  local tabsRule = S.AddSeparator(C_AREA, "horizontal")
  tabsRule:SetPoint("TOPLEFT",  tabStrip, "BOTTOMLEFT",  0, -4)
  tabsRule:SetPoint("TOPRIGHT", tabStrip, "BOTTOMRIGHT", 0, -4)

  -- CONTENT BODY: child frame each tab attaches into.
  local body = CreateFrame("Frame", nil, C_AREA)
  body:SetPoint("TOPLEFT",     tabsRule, "BOTTOMLEFT",  0, -14)
  body:SetPoint("BOTTOMRIGHT", C_AREA,   "BOTTOMRIGHT", 0, 0)
  hub.body = body

  hub.tabFrames.overview   = buildOverviewTab(body)
  hub.tabFrames.moments    = buildPlaceholderTab(body, "Moments")
  hub.tabFrames.milestones = buildPlaceholderTab(body, "Milestones")
  hub.tabFrames.watch      = buildPlaceholderTab(body, "Watch")
  hub.tabFrames.settings   = buildPlaceholderTab(body, "Settings")
  for _, f in pairs(hub.tabFrames) do f:Hide() end

  -- Tabs left-aligned starting at the strip's left edge.
  for i, tab in ipairs(TABS) do
    local btn = makeTab(tabStrip, tab.label, function()
      NS.OpenHubTab(tab.id)
    end)
    btn:SetPoint("LEFT", tabStrip, "LEFT", (i - 1) * TAB_W, 0)
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
