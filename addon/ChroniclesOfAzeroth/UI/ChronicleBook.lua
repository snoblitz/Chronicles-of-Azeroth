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

local function collectNarrativeEvents()
  local db = NS.GetDB and NS.GetDB() or ChroniclesOfAzerothDB
  if not db or not db.events then return {} end
  local out = {}
  for i, ev in ipairs(db.events) do
    if NS.Templates.IsNarrativeEvent(ev.event) then
      table.insert(out, { idx = i, entry = ev })
    end
  end
  -- Newest first feels right in an album.
  table.sort(out, function(a, b) return (a.entry.t or 0) > (b.entry.t or 0) end)
  return out
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

local function renderEntry(page, entry)
  if not entry then
    page.chapter:SetText("")
    page.title:SetText("")
    page.body:SetText("")
    page.footer:SetText("")
    page.pin:SetTexture(nil)
    page.empty:Show()
    return
  end
  page.empty:Hide()

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
  else
    title = entry.event
  end
  page.title:SetText(title)
  page.chapter:SetText("|cFF6B3410-- a chapter --|r")

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

local ROW_HEIGHT = 28

local function buildEntryRow(parent, idx)
  local row = CreateFrame("Button", nil, parent)
  row:SetSize(360, ROW_HEIGHT)

  local hl = row:CreateTexture(nil, "BACKGROUND")
  hl:SetAllPoints(row)
  hl:SetColorTexture(1, 0.85, 0.4, 0)  -- transparent unless selected
  row.hl = hl

  local label = row:CreateFontString(nil, "OVERLAY", "GameFontNormalSmall")
  label:SetPoint("LEFT", row, "LEFT", 12, 0)
  label:SetPoint("RIGHT", row, "RIGHT", -60, 0)
  label:SetJustifyH("LEFT")
  label:SetWordWrap(false)
  label:SetTextColor(0.9, 0.85, 0.7, 1)
  row.label = label

  local meta = row:CreateFontString(nil, "OVERLAY", "GameFontNormalSmall")
  meta:SetPoint("RIGHT", row, "RIGHT", -8, 0)
  meta:SetTextColor(0.7, 0.55, 0.32, 1)
  row.meta = meta

  row:SetScript("OnEnter", function()
    if row._selected then return end
    hl:SetColorTexture(1, 0.85, 0.4, 0.12)
  end)
  row:SetScript("OnLeave", function()
    if row._selected then return end
    hl:SetColorTexture(1, 0.85, 0.4, 0)
  end)

  return row
end

local function refreshList()
  if not book then return end
  currentList = collectNarrativeEvents()

  entryButtons = entryButtons or {}
  local scrollChild = book.scrollChild

  local y = -2
  for i, item in ipairs(currentList) do
    local row = entryButtons[i]
    if not row then
      row = buildEntryRow(scrollChild, i)
      entryButtons[i] = row
    end
    row:Show()
    row:ClearAllPoints()
    row:SetPoint("TOPLEFT", scrollChild, "TOPLEFT", 6, y)
    row:SetPoint("TOPRIGHT", scrollChild, "TOPRIGHT", -6, y)

    local char = NS.GetCurrentCharacter and select(1, NS.GetCurrentCharacter()) or nil
    local name = (char and char.identity and char.identity.name) or "Traveler"
    row.label:SetText(NS.Templates.Preview(item.entry, name))
    local lvl = item.entry.enrichment and item.entry.enrichment.level
    row.meta:SetText(lvl and ("lvl " .. lvl) or "")

    row._selected = (i == selectedIdx)
    row.hl:SetColorTexture(1, 0.85, 0.4, row._selected and 0.22 or 0)

    row:SetScript("OnClick", function()
      selectedIdx = i
      renderEntry(book.rightPage, item.entry)
      if PlaySound and SOUNDKIT then
        pcall(PlaySound, SOUNDKIT.IG_QUEST_LIST_SELECT)
      end
      refreshList()
    end)

    y = y - ROW_HEIGHT - 2
  end

  -- Hide unused rows from a previous render
  for i = #currentList + 1, #entryButtons do
    entryButtons[i]:Hide()
  end

  scrollChild:SetHeight(math.max(1, -y + 4))

  -- Auto-select the most recent entry on first open
  if not selectedIdx and #currentList > 0 then
    selectedIdx = 1
    renderEntry(book.rightPage, currentList[1].entry)
  elseif #currentList == 0 then
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
  for _, evt in ipairs({ "QUEST_ACCEPTED", "QUEST_TURNED_IN", "PLAYER_LEVEL_UP", "ZONE_CHANGED_NEW_AREA" }) do
    NS.On(evt, function() if book and book:IsShown() then refreshList() end end)
  end
end
