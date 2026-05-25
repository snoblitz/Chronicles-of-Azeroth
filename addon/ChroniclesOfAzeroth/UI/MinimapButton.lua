-- MinimapButton.lua -- always-visible "what is this addon?" entry point.
--
-- A draggable, dismissable gold sigil on the minimap. Click prints the
-- web app URL and current status to chat. Tooltip shows character info.
--
-- No LibDBIcon dependency -- pure CreateFrame. Position is saved in
-- config.minimapAngle (degrees, 0 = right, 90 = top, etc).

local ADDON_NAME, NS = ...

local BUTTON_SIZE = 32
local MINIMAP_RADIUS = 80

local function positionOnMinimap(btn, angle)
  local rad = math.rad(angle)
  local x = math.cos(rad) * MINIMAP_RADIUS
  local y = math.sin(rad) * MINIMAP_RADIUS
  btn:ClearAllPoints()
  btn:SetPoint("CENTER", Minimap, "CENTER", x, y)
end

local function buildButton()
  local btn = CreateFrame("Button", "ChroniclesMinimapButton", Minimap)
  btn:SetSize(BUTTON_SIZE, BUTTON_SIZE)
  btn:SetFrameStrata("MEDIUM")
  btn:SetFrameLevel(8)
  btn:RegisterForClicks("LeftButtonUp", "RightButtonUp")
  btn:RegisterForDrag("LeftButton")
  btn:SetMovable(true)

  -- Outer ring (Blizzard's minimap button overlay)
  local overlay = btn:CreateTexture(nil, "OVERLAY")
  overlay:SetTexture("Interface\\Minimap\\MiniMap-TrackingBorder")
  overlay:SetSize(54, 54)
  overlay:SetPoint("TOPLEFT", btn, "TOPLEFT", 0, 0)

  -- Icon (Blizzard built-in book icon, no copyright concern)
  local icon = btn:CreateTexture(nil, "ARTWORK")
  icon:SetTexture("Interface\\Icons\\INV_Misc_Book_07")
  icon:SetSize(20, 20)
  icon:SetPoint("CENTER", btn, "CENTER", 0, 1)
  icon:SetTexCoord(0.08, 0.92, 0.08, 0.92)
  btn.icon = icon

  -- Subtle gold tint on hover so it doesn't read as a quest book
  btn:SetScript("OnEnter", function(self)
    icon:SetVertexColor(1.15, 1.0, 0.8, 1)
    GameTooltip:SetOwner(self, "ANCHOR_LEFT")
    GameTooltip:SetText("|cFFFFD700Chronicles of Azeroth|r", 1, 1, 1)
    local rec, _guid = NS.GetCurrentCharacter()
    if rec and rec.identity then
      GameTooltip:AddLine(rec.identity.name .. " of " .. (rec.identity.realm or "?"), 0.9, 0.9, 0.9)
      GameTooltip:AddLine("Class: " .. (rec.identity.class or "?") .. "  Race: " .. (rec.identity.race or "?"), 0.7, 0.7, 0.7)
      if rec.classification then
        local color = "FFC9A969"
        GameTooltip:AddLine("Lane: |c" .. color .. rec.classification .. "|r", 0.7, 0.7, 0.7)
      end
    end
    local db = NS.GetDB()
    local events = (db and db.events) and #db.events or 0
    GameTooltip:AddLine(" ")
    GameTooltip:AddLine("Captured this install: " .. events .. " events", 0.6, 0.8, 0.6)
    GameTooltip:AddLine("This session: " .. NS.session.events .. " events, "
      .. NS.session.quests .. " quests, " .. NS.session.levelsGained .. " level-ups",
      0.6, 0.8, 0.6)
    GameTooltip:AddLine(" ")
    GameTooltip:AddLine("|cFFFFD700Left-click|r  Open the Chronicle", 0.9, 0.9, 0.9)
    GameTooltip:AddLine("|cFFFFD700Right-click|r  Settings", 0.9, 0.9, 0.9)
    GameTooltip:AddLine("|cFFFFD700Shift + Right-click|r  Web companion URL", 0.7, 0.7, 0.7)
    GameTooltip:AddLine("|cFFFFD700Ctrl + Right-click|r  Import enrichment (/coa sync)", 0.7, 0.7, 0.7)
    GameTooltip:AddLine("|cFFFFD700Drag|r  Reposition on minimap", 0.6, 0.6, 0.6)
    GameTooltip:Show()
  end)

  btn:SetScript("OnLeave", function()
    icon:SetVertexColor(1, 1, 1, 1)
    GameTooltip:Hide()
  end)

-- StaticPopup for the URL-copy dialog. Registered ONCE at module load so
-- a /reload always picks up the latest definition (avoiding the
-- "cached broken handler keeps eating Escape" footgun).
if StaticPopupDialogs then
  StaticPopupDialogs["COA_URL_POPUP"] = {
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
    EditBoxOnEnterPressed = function(self) self:GetParent():Hide() end,
    timeout = 0,
    whileDead = true,
    hideOnEscape = true,
    preferredIndex = 3,
  }
end

  btn:SetScript("OnClick", function(self, button)
    if button == "LeftButton" then
      -- The hero feature: open the Chronicle book in-game.
      if NS.OpenBook then
        NS.OpenBook()
      else
        local url = NS.GetConfig().webAppUrl
        print(NS.CHAT_TAG .. " Chronicle book not loaded -- opening web instead: " .. url)
        if StaticPopup_Show then
          StaticPopup_Show("COA_URL_POPUP", nil, nil, { url = url })
        end
      end
    elseif button == "RightButton" then
      -- Right-click cycles through the secondary surfaces. Hold SHIFT for
      -- the web URL popup, hold CTRL for /coa sync, plain right-click for
      -- the Settings panel.
      if IsShiftKeyDown and IsShiftKeyDown() then
        local url = NS.GetConfig().webAppUrl
        if StaticPopup_Show then
          StaticPopup_Show("COA_URL_POPUP", nil, nil, { url = url })
        end
      elseif IsControlKeyDown and IsControlKeyDown() then
        if NS.OpenSync then NS.OpenSync() end
      else
        if NS.OpenSettings then NS.OpenSettings() end
      end
    end
  end)

  -- Drag to reposition (angular tracking around minimap center)
  btn:SetScript("OnDragStart", function(self)
    self:SetScript("OnUpdate", function(self)
      local mx, my = Minimap:GetCenter()
      local px, py = GetCursorPosition()
      local scale = Minimap:GetEffectiveScale()
      px, py = px / scale, py / scale
      local angle = math.deg(math.atan2(py - my, px - mx))
      NS.GetConfig().minimapAngle = angle
      positionOnMinimap(self, angle)
    end)
  end)
  btn:SetScript("OnDragStop", function(self)
    self:SetScript("OnUpdate", nil)
  end)

  positionOnMinimap(btn, NS.GetConfig().minimapAngle or 215)
  return btn
end

------------------------------------------------------------------------
-- Lazy build on first player frame, respect config toggle
------------------------------------------------------------------------

local boot = CreateFrame("Frame")
boot:RegisterEvent("PLAYER_ENTERING_WORLD")
boot:SetScript("OnEvent", function(self)
  self:UnregisterAllEvents()
  if NS.GetConfig().showMinimapButton and Minimap then
    NS.minimapButton = buildButton()
  end
end)

NS.SetMinimapButtonVisible = function(visible)
  NS.GetConfig().showMinimapButton = visible and true or false
  if visible then
    if not NS.minimapButton then
      NS.minimapButton = buildButton()
    end
    NS.minimapButton:Show()
  else
    if NS.minimapButton then NS.minimapButton:Hide() end
  end
end
