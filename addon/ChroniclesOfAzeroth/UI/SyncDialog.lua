-- UI/SyncDialog.lua -- the Tier-C enrichment paste pipeline.
--
-- Triggered by /coa sync. Opens a parchment dialog with a multi-line
-- edit box. The web companion produces a chronicle blob in plain-text
-- format that the player pastes in here; on import, enriched paragraphs
-- land in db.enriched (keyed by EntryID) and replace template fallbacks
-- in the Chronicle book on next render.
--
-- Blob format (line-oriented, easy to round-trip through clipboard):
--
--   COA-CHRONICLE-V1
--   BIBLE|<json-ish prose summary>
--   <EVENT:ISO_TS:argKey>|<paragraph text, \n for newlines>
--   <EVENT:ISO_TS:argKey>|<paragraph text>
--   ...
--   END
--
-- Lines starting with '#' are comments. Whitespace-only lines ignored.

local ADDON_NAME, NS = ...

local DIALOG_W = 560
local DIALOG_H = 460

local dialog

local function applyParchmentBackground(parent, slice, shadow)
  slice  = slice  or 80
  shadow = shadow or 16
  local bg = parent:CreateTexture(nil, "BACKGROUND")
  bg:SetTexture(NS.ADDON_PATH .. "\\Art\\GenericFrame.png")
  bg:SetPoint("TOPLEFT",     parent, "TOPLEFT",     -shadow,  shadow)
  bg:SetPoint("BOTTOMRIGHT", parent, "BOTTOMRIGHT",  shadow, -shadow)
  pcall(bg.SetTextureSliceMargins, bg, slice, slice, slice, slice)
  if bg.SetTextureSliceMode and Enum and Enum.UITextureSliceMode then
    pcall(bg.SetTextureSliceMode, bg, Enum.UITextureSliceMode.Tiled)
  end
  return bg
end

local function makeParchmentButton(parent, label, w, h)
  local btn = CreateFrame("Button", nil, parent)
  btn:SetSize(w or 120, h or 28)
  local bg = btn:CreateTexture(nil, "BACKGROUND")
  bg:SetAllPoints(btn)
  bg:SetColorTexture(0.18, 0.11, 0.06, 0.85)
  local function edge(p1, p2)
    local t = btn:CreateTexture(nil, "BORDER")
    t:SetColorTexture(0.78, 0.62, 0.32, 0.9)
    t:SetPoint(p1, btn, p1); t:SetPoint(p2, btn, p2)
    return t
  end
  edge("TOPLEFT","TOPRIGHT"):SetHeight(1)
  edge("BOTTOMLEFT","BOTTOMRIGHT"):SetHeight(1)
  edge("TOPLEFT","BOTTOMLEFT"):SetWidth(1)
  edge("TOPRIGHT","BOTTOMRIGHT"):SetWidth(1)
  local text = btn:CreateFontString(nil, "OVERLAY")
  local f = GameFontNormalLarge:GetFont()
  text:SetFont(f, 13, "")
  text:SetPoint("CENTER", btn, "CENTER", 0, 0)
  text:SetText(label)
  text:SetTextColor(0.90, 0.78, 0.48, 1)
  btn.text = text
  btn:SetScript("OnEnter", function() bg:SetColorTexture(0.28, 0.19, 0.10, 0.92); text:SetTextColor(1, 0.92, 0.65, 1) end)
  btn:SetScript("OnLeave", function() bg:SetColorTexture(0.18, 0.11, 0.06, 0.85); text:SetTextColor(0.90, 0.78, 0.48, 1) end)
  return btn
end

------------------------------------------------------------------------
-- Blob parser. Returns counts so we can toast a success line.
------------------------------------------------------------------------

local function unescape(s)
  -- Web companion encodes paragraph newlines as literal "\n".
  return (s:gsub("\\n", "\n"):gsub("\\t", "\t"))
end

local function parseBlob(blob)
  local lines = {}
  for line in blob:gmatch("([^\r\n]*)\r?\n?") do
    table.insert(lines, line)
  end

  if #lines == 0 then
    return nil, "Empty paste."
  end

  -- Strip leading blanks/comments to find the header.
  local i = 1
  while i <= #lines and (lines[i]:match("^%s*$") or lines[i]:match("^%s*#")) do
    i = i + 1
  end

  local header = (lines[i] or ""):match("^%s*(COA%-CHRONICLE%-[Vv]%d+)%s*$")
  if not header then
    return nil, "Missing header. Expected 'COA-CHRONICLE-V1' on the first non-empty line."
  end
  i = i + 1

  local db = NS.GetDB and NS.GetDB() or ChroniclesOfAzerothDB
  db.enriched = db.enriched or {}

  local enrichedCount, hadBible = 0, false
  while i <= #lines do
    local line = lines[i]
    i = i + 1
    if line:match("^%s*$") or line:match("^%s*#") then
      -- skip
    elseif line:match("^%s*END%s*$") then
      break
    else
      local key, val = line:match("^([^|]+)|(.*)$")
      if key and val then
        key = key:match("^%s*(.-)%s*$")
        val = unescape(val)
        if key == "BIBLE" then
          db.bible = val
          hadBible = true
        else
          db.enriched[key] = val
          enrichedCount = enrichedCount + 1
        end
      end
    end
  end

  return {
    enriched = enrichedCount,
    bible = hadBible,
  }
end

------------------------------------------------------------------------
-- Build dialog (cached)
------------------------------------------------------------------------

local function build()
  if dialog then return dialog end

  dialog = CreateFrame("Frame", "ChroniclesSyncDialog", UIParent)
  dialog:SetSize(DIALOG_W, DIALOG_H)
  dialog:SetPoint("CENTER", UIParent, "CENTER", 0, 0)
  dialog:SetFrameStrata("DIALOG")
  dialog:SetMovable(true)
  dialog:EnableMouse(true)
  dialog:RegisterForDrag("LeftButton")
  dialog:SetScript("OnDragStart", dialog.StartMoving)
  dialog:SetScript("OnDragStop", dialog.StopMovingOrSizing)
  dialog:Hide()

  applyParchmentBackground(dialog)

  local INSET_X = 60
  local INSET_TOP = 56
  local INSET_BOTTOM = 56

  -- Title
  local title = dialog:CreateFontString(nil, "OVERLAY")
  title:SetFont(GameFontNormalLarge:GetFont(), 18, "")
  title:SetPoint("TOP", dialog, "TOP", 0, -INSET_TOP)
  title:SetText("Import Chronicle Enrichment")
  title:SetTextColor(0.22, 0.13, 0.06, 1)

  -- Subtitle / instructions
  local sub = dialog:CreateFontString(nil, "OVERLAY")
  sub:SetFont(GameFontNormalSmall:GetFont(), 11, "")
  sub:SetPoint("TOP", title, "BOTTOM", 0, -6)
  sub:SetWidth(DIALOG_W - 2 * INSET_X)
  sub:SetJustifyH("CENTER")
  sub:SetSpacing(2)
  sub:SetTextColor(0.45, 0.30, 0.16, 1)
  sub:SetText("Paste the chronicle blob from the web companion. The header line\nmust read |cFF6B3410COA-CHRONICLE-V1|r.")

  -- Close X (parchment-style)
  local close = makeParchmentButton(dialog, "X", 26, 26)
  close:SetPoint("TOPRIGHT", dialog, "TOPRIGHT", -INSET_X, -INSET_TOP + 2)
  close:SetScript("OnClick", function() dialog:Hide() end)

  -- Multiline edit box inside a scroll frame.
  local scroll = CreateFrame("ScrollFrame", "ChroniclesSyncScroll", dialog, "UIPanelScrollFrameTemplate")
  scroll:SetPoint("TOPLEFT",     dialog, "TOPLEFT",      INSET_X,        -(INSET_TOP + 50))
  scroll:SetPoint("BOTTOMRIGHT", dialog, "BOTTOMRIGHT", -(INSET_X + 22), INSET_BOTTOM + 60)

  -- A thin dark backdrop behind the edit box, so the user can see the
  -- paste area against the parchment.
  local well = dialog:CreateTexture(nil, "ARTWORK")
  well:SetPoint("TOPLEFT",     scroll, "TOPLEFT",     -4, 4)
  well:SetPoint("BOTTOMRIGHT", scroll, "BOTTOMRIGHT",  4, -4)
  well:SetColorTexture(0.08, 0.05, 0.02, 0.55)

  local edit = CreateFrame("EditBox", "ChroniclesSyncEdit", scroll)
  edit:SetMultiLine(true)
  edit:SetMaxLetters(0)
  edit:SetFontObject(ChatFontNormal)
  edit:SetWidth(DIALOG_W - 2 * INSET_X - 30)
  edit:SetAutoFocus(false)
  edit:SetTextColor(0.95, 0.88, 0.72, 1)
  edit:SetScript("OnEscapePressed", function(self) self:ClearFocus() end)
  scroll:SetScrollChild(edit)

  -- Buttons: Import + Cancel
  local importBtn = makeParchmentButton(dialog, "Import", 130, 30)
  importBtn:SetPoint("BOTTOM", dialog, "BOTTOM", -75, INSET_BOTTOM - 30)

  local cancelBtn = makeParchmentButton(dialog, "Cancel", 130, 30)
  cancelBtn:SetPoint("BOTTOM", dialog, "BOTTOM",  75, INSET_BOTTOM - 30)
  cancelBtn:SetScript("OnClick", function() dialog:Hide() end)

  -- Status line above the buttons (for "Imported N chapters" toast).
  local status = dialog:CreateFontString(nil, "OVERLAY")
  status:SetFont(GameFontNormalSmall:GetFont(), 11, "")
  status:SetPoint("BOTTOM", dialog, "BOTTOM", 0, INSET_BOTTOM)
  status:SetWidth(DIALOG_W - 2 * INSET_X)
  status:SetJustifyH("CENTER")
  status:SetTextColor(0.18, 0.40, 0.18, 1)
  dialog.status = status

  importBtn:SetScript("OnClick", function()
    local blob = edit:GetText() or ""
    if blob:match("^%s*$") then
      status:SetTextColor(0.55, 0.20, 0.12, 1)
      status:SetText("Nothing to import. Paste the chronicle blob first.")
      return
    end
    local res, err = parseBlob(blob)
    if not res then
      status:SetTextColor(0.55, 0.20, 0.12, 1)
      status:SetText("Import failed: " .. (err or "unknown error"))
      return
    end
    status:SetTextColor(0.18, 0.40, 0.18, 1)
    local parts = {}
    table.insert(parts, string.format("Imported %d enriched chapter%s.",
      res.enriched, res.enriched == 1 and "" or "s"))
    if res.bible then table.insert(parts, "Bible refreshed.") end
    status:SetText(table.concat(parts, "  "))
    edit:SetText("")
    NS.PlaySound("paper-collect.mp3")
    if NS.RefreshBook then NS.RefreshBook() end
  end)

  dialog.edit   = edit
  dialog.status = status

  return dialog
end

NS.OpenSync = function()
  local d = build()
  if d:IsShown() then
    d:Hide()
    return
  end
  d.status:SetText("")
  d.edit:SetText("")
  d:Show()
  NS.PlaySound("page-turn.mp3")
end
