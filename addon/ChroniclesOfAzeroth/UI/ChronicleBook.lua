-- UI/ChronicleBook.lua -- the Phase 1.7 hero feature.
--
-- A leather adventure-album frame that opens when the player clicks
-- the minimap button. Left page = scrollable list of narrative events
-- (quest accepts/turn-ins, level-ups, zone changes). Right page = the
-- selected entry rendered as a polaroid pinned to paper, with the
-- narrator paragraph as caption.
--
-- Narration source priority:
--   1. db.enriched[EntryID] -- paragraphs from the web companion,
--      imported via /coa sync.
--   2. NS.Templates.Narrate(entry) -- the always-works fallback.
--
-- Visual aesthetic: black leather album, polaroid cards w/ pushpins.
-- Adapted from Peterodox's retired Azeroth Adventure Album with
-- permission. See ATTRIBUTION.md.

local ADDON_NAME, NS = ...

local FRAME_W = 798
local FRAME_H = 505

-- Atlas regions inside JournalElements.png (the original AAA atlas).
local BG_TEXCOORD = { 0, 0.51953125, 0, 0.6572265625 }

local LEFT_PAGE_INSET = { left = 40,  top = 60, right = 410, bottom = 60 }
local RIGHT_PAGE_RECT = { x = 420, y = -60, w = 340, h = 380 }

local book          -- cached top-level frame
local entryButtons  -- table of left-page row buttons (pooled)
local currentList   -- table of {entry, idx} currently shown
local selectedIdx

local function art(rel)
  return NS.ADDON_PATH .. "\\Art\\Album\\" .. rel
end

------------------------------------------------------------------------
-- Helpers: collect narrative events from db.events, newest-first.
------------------------------------------------------------------------

local function zoneOf(ev)
  return (ev.enrichment and ev.enrichment.zoneText) or "Unknown Lands"
end

-- Returns a flat row list newest-first, composed of three row kinds:
--   { kind = "bible" }                          (only when db.bible set)
--   { kind = "chapter", index, zone, count }    (header row above a run)
--   { kind = "event",   entry, idx }
--
-- Chapter numbers are assigned oldest -> newest, so the most recent visit
-- has the highest Roman numeral. Re-entries to a zone get their own
-- chapter ("Return to Westfall" idea, even if we don't render that yet).
local function collectRows()
  local db = NS.GetDB and NS.GetDB() or ChroniclesOfAzerothDB
  if not db or not db.events then return {} end

  local oldestFirst = {}
  for i, ev in ipairs(db.events) do
    if NS.Templates.IsNarrativeEvent(ev.event) then
      table.insert(oldestFirst, { entry = ev, idx = i })
    end
  end
  table.sort(oldestFirst, function(a, b) return (a.entry.t or 0) < (b.entry.t or 0) end)

  -- Walk oldest -> newest, group consecutive same-zone runs into chapters.
  -- Each "chapter" carries its own ordered event list.
  local chapters = {}
  local curZone, curChap = nil, nil
  for _, item in ipairs(oldestFirst) do
    local z = zoneOf(item.entry)
    if z ~= curZone then
      curChap = { zone = z, events = {}, index = #chapters + 1 }
      table.insert(chapters, curChap)
      curZone = z
    end
    table.insert(curChap.events, item)
  end

  -- Render newest-first: iterate chapters in reverse, events within each
  -- chapter also newest-first.
  local rows = {}
  if db.bible and db.bible ~= "" then
    table.insert(rows, { kind = "bible" })
  end
  for c = #chapters, 1, -1 do
    local ch = chapters[c]
    table.insert(rows, {
      kind  = "chapter",
      index = ch.index,
      zone  = ch.zone,
      count = #ch.events,
    })
    for e = #ch.events, 1, -1 do
      local item = ch.events[e]
      table.insert(rows, {
        kind  = "event",
        entry = item.entry,
        idx   = item.idx,
        chapterIndex = ch.index,
        chapterZone  = ch.zone,
      })
    end
  end
  return rows
end

local function getNarrationFor(entry)
  local db = NS.GetDB and NS.GetDB() or ChroniclesOfAzerothDB
  local enriched = db and db.enriched
  local id = NS.Templates.EntryID(entry)
  if enriched and enriched[id] then return enriched[id], true end
  local char = NS.GetCurrentCharacter and select(1, NS.GetCurrentCharacter()) or nil
  local name = (char and char.identity and char.identity.name) or "the traveler"
  return NS.Templates.Narrate(entry, name), false
end

------------------------------------------------------------------------
-- Right page: polaroid card showing the selected entry's narration.
------------------------------------------------------------------------

local function buildRightPage(parent)
  local page = CreateFrame("Frame", nil, parent)
  page:SetSize(RIGHT_PAGE_RECT.w, RIGHT_PAGE_RECT.h)
  page:SetPoint("TOPLEFT", parent, "TOPLEFT", RIGHT_PAGE_RECT.x, RIGHT_PAGE_RECT.y)

  -- Polaroid paper background (the photo-album "card" insert).
  local paper = page:CreateTexture(nil, "BACKGROUND")
  paper:SetTexture(art("CardPaper.tga"))
  paper:SetAllPoints(page)
  page.paper = paper

  -- A pushpin at the top of the card. Random style per render.
  local pin = page:CreateTexture(nil, "OVERLAY")
  pin:SetSize(42, 42)
  pin:SetPoint("TOP", page, "TOP", 0, 22)
  page.pin = pin

  -- Chapter label (top of card)
  local chapter = page:CreateFontString(nil, "OVERLAY", "GameFontNormal")
  chapter:SetPoint("TOP", page, "TOP", 0, -28)
  chapter:SetTextColor(0.30, 0.18, 0.08, 1)
  page.chapter = chapter

  -- Quest/event title under chapter
  local title = page:CreateFontString(nil, "OVERLAY", "GameFontNormalLarge")
  title:SetPoint("TOP", chapter, "BOTTOM", 0, -6)
  title:SetWidth(RIGHT_PAGE_RECT.w - 60)
  title:SetJustifyH("CENTER")
  title:SetTextColor(0.18, 0.12, 0.06, 1)
  page.title = title

  -- Narration body
  local body = page:CreateFontString(nil, "OVERLAY")
  local bf = GameFontNormalLarge:GetFont()
  body:SetFont(bf, 14, "")
  body:SetPoint("TOPLEFT",     page, "TOPLEFT",      30, -110)
  body:SetPoint("BOTTOMRIGHT", page, "BOTTOMRIGHT", -30,  50)
  body:SetJustifyH("LEFT")
  body:SetJustifyV("TOP")
  body:SetSpacing(4)
  body:SetTextColor(0.20, 0.13, 0.07, 1)
  body:SetWordWrap(true)
  page.body = body

  -- Footer: zone / timestamp / source badge
  local footer = page:CreateFontString(nil, "OVERLAY", "GameFontNormalSmall")
  footer:SetPoint("BOTTOM", page, "BOTTOM", 0, 22)
  footer:SetWidth(RIGHT_PAGE_RECT.w - 60)
  footer:SetJustifyH("CENTER")
  footer:SetTextColor(0.45, 0.30, 0.16, 1)
  page.footer = footer

  -- Empty state
  local empty = page:CreateFontString(nil, "OVERLAY", "GameFontNormalSmall")
  empty:SetPoint("CENTER", page, "CENTER", 0, 0)
  empty:SetWidth(RIGHT_PAGE_RECT.w - 60)
  empty:SetJustifyH("CENTER")
  empty:SetTextColor(0.45, 0.30, 0.16, 1)
  empty:SetText("|cFF5A3A1ASelect a chapter from the list.|r")
  page.empty = empty

  return page
end

local function renderEntry(page, row)
  if not row or not row.kind then
    page.chapter:SetText("")
    page.title:SetText("")
    page.body:SetText("")
    page.footer:SetText("")
    if page.pin then page.pin:SetTexture(nil) end
    page.empty:Show()
    return
  end
  page.empty:Hide()

  if row.kind == "bible" then
    -- Title-page rendering. Bigger title, no timestamp, special pin.
    local db = NS.GetDB and NS.GetDB() or ChroniclesOfAzerothDB
    local char = NS.GetCurrentCharacter and select(1, NS.GetCurrentCharacter()) or nil
    local name = (char and char.identity and char.identity.name) or "the traveler"
    local raceCls
    if char and char.identity then
      local r = char.identity.race or ""
      local c = char.identity.class or ""
      raceCls = (r .. " " .. c):gsub("^%s+", ""):gsub("%s+$", "")
    end
    page.pin:SetTexture(art("Pin1.tga"))
    page.chapter:SetText("|cFF6B3410-- title page --|r")
    page.title:SetText("The Chronicle of " .. name)
    local body = db.bible or ""
    if body == "" then
      body = "|cFF8B7355(No bible yet. Roll your hero in the web companion and /coa sync to enrich this page.)|r"
    end
    page.body:SetText(body)
    page.footer:SetText(raceCls and raceCls ~= "" and raceCls or "")
    return
  end

  if row.kind == "chapter" then
    page.pin:SetTexture(art("Pin2.tga"))
    page.chapter:SetText("|cFF6B3410-- a chapter --|r")
    page.title:SetText(NS.Templates.ChapterLabel(row.index, row.zone))
    page.body:SetText(string.format(
      "|cFF8B7355This chapter holds %d entr%s from %s.\n\nSelect a chapter entry from the list to read it.|r",
      row.count, row.count == 1 and "y" or "ies", row.zone))
    page.footer:SetText("")
    return
  end

  -- Default: event row.
  local entry = row.entry
  local pinStyle = ((NS.Templates.EntryID(entry):byte(1) or 0) % 3) + 1
  page.pin:SetTexture(art("Pin" .. pinStyle .. ".tga"))

  local enr = entry.enrichment or {}
  local title
  if entry.event == "QUEST_ACCEPTED" or entry.event == "QUEST_TURNED_IN" then
    title = enr.questTitle or "An unnamed quest"
  elseif entry.event == "PLAYER_LEVEL_UP" then
    title = "Level " .. tostring(enr.level or "?")
  elseif entry.event == "ZONE_CHANGED_NEW_AREA" then
    title = enr.zoneText or "A new place"
  elseif entry.event == "PLAYER_DEAD" then
    title = "A death in " .. (enr.zoneText or "the field")
  elseif entry.event == "ACHIEVEMENT_EARNED" then
    title = enr.achievementName or "An achievement"
  else
    title = entry.event
  end
  page.title:SetText(title)
  local chapterText = row.chapterIndex
    and NS.Templates.ChapterLabel(row.chapterIndex, row.chapterZone)
    or "|cFF6B3410-- a chapter --|r"
  page.chapter:SetText("|cFF6B3410" .. chapterText .. "|r")

  local narration, isEnriched = getNarrationFor(entry)
  page.body:SetText(narration)

  local zone = enr.zoneText or "the road"
  local ts   = entry.ts or ""
  local lvl  = enr.level and ("level " .. enr.level) or ""
  local badge = isEnriched and "  |cFFB8860B(enriched)|r" or ""
  local parts = { zone }
  if lvl ~= "" then table.insert(parts, lvl) end
  if ts  ~= "" then table.insert(parts, ts) end
  page.footer:SetText(table.concat(parts, "  -  ") .. badge)
end

------------------------------------------------------------------------
-- Left page: scrollable entry list. Each row is a simple button with
-- the preview line + relative date.
------------------------------------------------------------------------

local ROW_HEIGHT_EVENT   = 28
local ROW_HEIGHT_HEADER  = 22
local ROW_HEIGHT_BIBLE   = 36

local function styleRowAsBible(row)
  row.icon:SetText("✦")
  row.icon:SetTextColor(1.0, 0.85, 0.30, 1)
  row.label:SetText("|cFFFFE08AThe Hero's Bible|r")
  row.label:SetFont(GameFontNormalLarge:GetFont(), 13, "")
  row.meta:SetText("title page")
  row.meta:SetTextColor(0.85, 0.65, 0.30, 0.9)
  row.divider:Hide()
end

local function styleRowAsChapter(row, chapter)
  row.icon:SetText("")
  row.label:SetText("|cFFD9B47A" .. NS.Templates.ChapterLabel(chapter.index, chapter.zone) .. "|r")
  row.label:SetFont(GameFontNormalSmall:GetFont(), 11, "")
  row.meta:SetText(tostring(chapter.count))
  row.meta:SetTextColor(0.65, 0.50, 0.28, 0.9)
  row.divider:Show()
end

local function styleRowAsEvent(row, entry, isSelected)
  row.icon:SetText("")
  local char = NS.GetCurrentCharacter and select(1, NS.GetCurrentCharacter()) or nil
  local name = (char and char.identity and char.identity.name) or "Traveler"
  row.label:SetFont(GameFontNormalSmall:GetFont(), 12, "")
  row.label:SetText(NS.Templates.Preview(entry, name))
  local lvl = entry.enrichment and entry.enrichment.level
  row.meta:SetText(lvl and ("lvl " .. lvl) or "")
  row.meta:SetTextColor(0.7, 0.55, 0.32, 1)
  row.divider:Hide()
end

local function buildEntryRow(parent)
  local row = CreateFrame("Button", nil, parent)
  row:SetSize(360, ROW_HEIGHT_EVENT)

  local hl = row:CreateTexture(nil, "BACKGROUND")
  hl:SetAllPoints(row)
  hl:SetColorTexture(1, 0.85, 0.4, 0)
  row.hl = hl

  local icon = row:CreateFontString(nil, "OVERLAY", "GameFontNormalLarge")
  icon:SetPoint("LEFT", row, "LEFT", 6, 0)
  icon:SetWidth(18)
  icon:SetJustifyH("CENTER")
  row.icon = icon

  local label = row:CreateFontString(nil, "OVERLAY")
  label:SetFont(GameFontNormalSmall:GetFont(), 12, "")
  label:SetPoint("LEFT", icon, "RIGHT", 4, 0)
  label:SetPoint("RIGHT", row, "RIGHT", -56, 0)
  label:SetJustifyH("LEFT")
  label:SetWordWrap(false)
  label:SetTextColor(0.9, 0.85, 0.7, 1)
  row.label = label

  local meta = row:CreateFontString(nil, "OVERLAY", "GameFontNormalSmall")
  meta:SetPoint("RIGHT", row, "RIGHT", -8, 0)
  meta:SetTextColor(0.7, 0.55, 0.32, 1)
  row.meta = meta

  local divider = row:CreateTexture(nil, "ARTWORK")
  divider:SetColorTexture(0.55, 0.42, 0.22, 0.45)
  divider:SetPoint("BOTTOMLEFT",  row, "BOTTOMLEFT",   16, 1)
  divider:SetPoint("BOTTOMRIGHT", row, "BOTTOMRIGHT", -16, 1)
  divider:SetHeight(1)
  divider:Hide()
  row.divider = divider

  row:SetScript("OnEnter", function()
    if row._selected then return end
    if row._clickable then hl:SetColorTexture(1, 0.85, 0.4, 0.12) end
  end)
  row:SetScript("OnLeave", function()
    if row._selected then return end
    hl:SetColorTexture(1, 0.85, 0.4, 0)
  end)

  return row
end

local function refreshList()
  if not book then return end
  currentList = collectRows()

  entryButtons = entryButtons or {}
  local scrollChild = book.scrollChild

  local y = -2
  for i, row in ipairs(currentList) do
    local rowFrame = entryButtons[i]
    if not rowFrame then
      rowFrame = buildEntryRow(scrollChild)
      entryButtons[i] = rowFrame
    end
    rowFrame:Show()
    rowFrame:ClearAllPoints()
    rowFrame:SetPoint("TOPLEFT", scrollChild, "TOPLEFT", 6, y)
    rowFrame:SetPoint("TOPRIGHT", scrollChild, "TOPRIGHT", -6, y)

    local h = ROW_HEIGHT_EVENT
    if row.kind == "bible" then
      h = ROW_HEIGHT_BIBLE
      rowFrame:SetHeight(h)
      styleRowAsBible(rowFrame)
      rowFrame._clickable = true
    elseif row.kind == "chapter" then
      h = ROW_HEIGHT_HEADER
      rowFrame:SetHeight(h)
      styleRowAsChapter(rowFrame, row)
      rowFrame._clickable = true   -- clicking a chapter header shows its summary
    else
      h = ROW_HEIGHT_EVENT
      rowFrame:SetHeight(h)
      styleRowAsEvent(rowFrame, row.entry, i == selectedIdx)
      rowFrame._clickable = true
    end

    rowFrame._selected = (i == selectedIdx)
    rowFrame.hl:SetColorTexture(1, 0.85, 0.4, rowFrame._selected and 0.22 or 0)

    local rowIndex = i
    rowFrame:SetScript("OnClick", function()
      selectedIdx = rowIndex
      renderEntry(book.rightPage, currentList[rowIndex])
      if PlaySound and SOUNDKIT then
        pcall(PlaySound, SOUNDKIT.IG_QUEST_LIST_SELECT)
      end
      refreshList()
    end)

    y = y - h - 2
  end

  for i = #currentList + 1, #entryButtons do
    entryButtons[i]:Hide()
  end

  scrollChild:SetHeight(math.max(1, -y + 4))

  -- Default selection. If no selection yet, prefer the first event row
  -- (the most recent entry); fall back to bible if no events exist.
  if not selectedIdx then
    local fallback
    for i, row in ipairs(currentList) do
      if row.kind == "event" then fallback = i; break end
    end
    if not fallback then
      for i, row in ipairs(currentList) do
        if row.kind == "bible" then fallback = i; break end
      end
    end
    selectedIdx = fallback
    if selectedIdx then
      renderEntry(book.rightPage, currentList[selectedIdx])
    end
  end

  -- Empty hint when there's literally nothing to show (no bible, no events).
  if #currentList == 0 then
    renderEntry(book.rightPage, nil)
    book.emptyHint:Show()
  else
    book.emptyHint:Hide()
  end
end

------------------------------------------------------------------------
-- Build the book frame (once, cached).
------------------------------------------------------------------------

local function buildBook()
  if book then return book end

  book = CreateFrame("Frame", "ChroniclesBookFrame", UIParent)
  book:SetSize(FRAME_W, FRAME_H)
  book:SetPoint("CENTER", UIParent, "CENTER", 0, 0)
  book:SetFrameStrata("DIALOG")
  book:SetMovable(true)
  book:EnableMouse(true)
  book:RegisterForDrag("LeftButton")
  book:SetScript("OnDragStart", book.StartMoving)
  book:SetScript("OnDragStop", book.StopMovingOrSizing)
  book:Hide()

  -- Leather book background from AAA's JournalElements atlas.
  local bg = book:CreateTexture(nil, "BACKGROUND")
  bg:SetAllPoints(book)
  bg:SetTexture(art("JournalElements.png"))
  bg:SetTexCoord(unpack(BG_TEXCOORD))

  -- Title across the top spine.
  local title = book:CreateFontString(nil, "OVERLAY", "GameFontNormalLarge")
  title:SetPoint("TOP", book, "TOP", 0, -22)
  title:SetTextColor(1, 0.88, 0.55, 1)
  title:SetText("The Chronicle")
  book.title = title

  -- Close button (top-right of frame).
  local close = CreateFrame("Button", nil, book)
  close:SetSize(20, 20)
  close:SetPoint("TOPRIGHT", book, "TOPRIGHT", -22, -22)
  local closeNormal = close:CreateTexture(nil, "ARTWORK")
  closeNormal:SetAllPoints(close)
  closeNormal:SetTexture(art("CloseButton.tga"))
  close:SetNormalTexture(closeNormal)
  local closeHL = close:CreateTexture(nil, "HIGHLIGHT")
  closeHL:SetAllPoints(close)
  closeHL:SetTexture(art("CloseButton-Highlight.tga"))
  closeHL:SetBlendMode("ADD")
  close:SetHighlightTexture(closeHL)
  close:SetScript("OnClick", function()
    book:Hide()
    if PlaySound and SOUNDKIT then
      pcall(PlaySound, SOUNDKIT.IG_QUEST_LIST_CLOSE)
    end
  end)

  -- Left page: scroll frame holding the entry list.
  local scroll = CreateFrame("ScrollFrame", "ChroniclesBookScroll", book, "UIPanelScrollFrameTemplate")
  scroll:SetPoint("TOPLEFT", book, "TOPLEFT",
    LEFT_PAGE_INSET.left, -LEFT_PAGE_INSET.top)
  scroll:SetPoint("BOTTOMRIGHT", book, "TOPLEFT",
    LEFT_PAGE_INSET.right, -(FRAME_H - LEFT_PAGE_INSET.bottom))
  book.scroll = scroll

  local scrollChild = CreateFrame("Frame", nil, scroll)
  scrollChild:SetSize(360, 10)
  scroll:SetScrollChild(scrollChild)
  book.scrollChild = scrollChild

  -- Right page: the polaroid card with selected entry.
  book.rightPage = buildRightPage(book)

  -- Empty hint when no narrative events captured yet.
  local hint = book:CreateFontString(nil, "OVERLAY", "GameFontNormalSmall")
  hint:SetPoint("CENTER", book, "CENTER", 0, 0)
  hint:SetWidth(FRAME_W - 200)
  hint:SetJustifyH("CENTER")
  hint:SetTextColor(0.9, 0.82, 0.6, 1)
  hint:SetText("|cFFFFD700No chapters yet.|r\nGo play. Accept a quest, level up, see a new place.\nThe Chronicle writes itself.")
  hint:Hide()
  book.emptyHint = hint

  -- Footer / attribution
  local attr = book:CreateFontString(nil, "OVERLAY", "GameFontNormalSmall")
  attr:SetFont(GameFontNormalSmall:GetFont(), 9, "")
  attr:SetPoint("BOTTOM", book, "BOTTOM", 0, 12)
  attr:SetTextColor(0.55, 0.45, 0.28, 1)
  attr:SetText("Album chrome adapted from Azeroth Adventure Album by Peterodox.")

  return book
end

------------------------------------------------------------------------
-- Public API
------------------------------------------------------------------------

NS.OpenBook = function()
  local b = buildBook()
  if b:IsShown() then
    b:Hide()
    return
  end
  refreshList()
  b:Show()
  if PlaySound and SOUNDKIT then
    pcall(PlaySound, SOUNDKIT.IG_QUEST_LIST_OPEN)
  end
  NS.PlaySound("page-turn.mp3")
end

NS.RefreshBook = function()
  if book and book:IsShown() then refreshList() end
end

-- Live updates: when a new narrative event lands, refresh the list if
-- the book happens to be open. (Doesn't auto-open; that would be rude.)
if NS.On then
  for _, evt in ipairs({
    "QUEST_ACCEPTED",
    "QUEST_TURNED_IN",
    "PLAYER_LEVEL_UP",
    "ZONE_CHANGED_NEW_AREA",
    "PLAYER_DEAD",
    "ACHIEVEMENT_EARNED",
  }) do
    NS.On(evt, function() if book and book:IsShown() then refreshList() end end)
  end
end
