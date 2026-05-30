-- UI/Style.lua -- the addon's design system. The in-client equivalent of the
-- web app's index.css: one place that owns the palette, fonts, and the panel /
-- text helpers every UI surface is built from.
--
-- Direction (matches aftertale.gg): flat, modern, dark-violet ground with gold
-- display type and a violet accent. No skeuomorphic leather/parchment, no
-- faux-3D Blizzard chrome. Flat color-block panels with a thin gold border and
-- the occasional violet glow-line read as modern AND on-brand, and they render
-- identically on every flavor (Vanilla -> Midnight) since they avoid the
-- retail-only rounded-corner / backdrop APIs.

local ADDON_NAME, NS = ...
NS.Style = NS.Style or {}
local S = NS.Style

------------------------------------------------------------------------
-- Palette  (mirrors src/index.css :root tokens; RGBA in 0..1)
------------------------------------------------------------------------

S.color = {
  bg         = { 0.102, 0.055, 0.180 }, -- #1a0e2e  app ground (deep violet)
  panel      = { 0.140, 0.090, 0.230 }, -- lifted panel surface
  inset      = { 0.071, 0.039, 0.125 }, -- recessed well
  gold       = { 0.831, 0.639, 0.451 }, -- #d4a373  primary display
  goldBright = { 0.941, 0.784, 0.588 }, -- #f0c896  emphasis
  goldDeep   = { 0.545, 0.384, 0.251 }, -- #8b6240  kicker / dim gold
  accent     = { 0.722, 0.620, 1.000 }, -- #b89eff  violet accent
  fg         = { 0.929, 0.906, 0.847 }, -- #ede7d8  body text
  fgMuted    = { 0.659, 0.612, 0.502 }, -- #a89c80  secondary text
  fgFaint    = { 0.416, 0.373, 0.290 }, -- footnotes
  border     = { 0.545, 0.384, 0.251 }, -- gold-deep, used for 1px borders
  line       = { 1.000, 0.941, 0.784 }, -- hairline highlight (use low alpha)
}

-- Unpack a palette colour with an optional alpha override.
function S.rgba(name, a)
  local c = S.color[name] or { 1, 1, 1 }
  return c[1], c[2], c[3], a == nil and (c[4] or 1) or a
end

------------------------------------------------------------------------
-- Fonts
--
-- Cinzel (our web display face) ships under Fonts/. Body text keeps WoW's
-- default for readability at small sizes (Cinzel is a display serif and gets
-- hard to read below ~14px) -- same split the web app uses (Cinzel display +
-- system body).
--
-- SetFont returns false if the .ttf is missing, so every helper falls back to
-- a GameFont object's font. That means the addon looks fine BEFORE the Cinzel
-- file is added and upgrades automatically once it lands -- no errors either
-- way.
------------------------------------------------------------------------

local FONT_DIR = (NS.ADDON_PATH or ("Interface\\AddOns\\" .. ADDON_NAME)) .. "\\Fonts\\"

S.font = {
  display = FONT_DIR .. "Cinzel-Bold.ttf", -- headings, titles, kickers
}

-- Apply our display font to a FontString, falling back to GameFont if the
-- TTF isn't present. flags: "" | "OUTLINE" | "THINOUTLINE".
function S.UseDisplayFont(fontString, size, flags)
  flags = flags or ""
  local ok = fontString:SetFont(S.font.display, size, flags)
  if not ok then
    local fallback = (GameFontNormalLarge or GameFontNormal):GetFont()
    fontString:SetFont(fallback, size, flags)
  end
end

------------------------------------------------------------------------
-- Letter-spaced small-caps (the "kicker" treatment used across the web app).
-- Reuses NS.Scribe.Kicker when present so we don't duplicate the logic.
------------------------------------------------------------------------

function S.Kicker(text)
  if NS.Scribe and NS.Scribe.Kicker then return NS.Scribe.Kicker(text) end
  if not text or text == "" then return "" end
  return (text:upper():gsub("(.)", "%1 "):gsub("%s+$", ""))
end

------------------------------------------------------------------------
-- Panel: a flat brand surface -- solid fill + 1px border drawn as four edge
-- textures (no backdrop API, so it works on every flavor). Returns the frame
-- with `.bg` and `.borders` attached for later recolour.
--
-- opts = { fill = "panel"|"inset"|"bg" (default "panel"),
--          border = "border"|"accent"|nil (nil = no border),
--          borderAlpha = number (default 0.5) }
------------------------------------------------------------------------

function S.CreatePanel(parent, opts)
  opts = opts or {}
  local f = CreateFrame("Frame", nil, parent)

  local bg = f:CreateTexture(nil, "BACKGROUND")
  bg:SetAllPoints(f)
  bg:SetColorTexture(S.rgba(opts.fill or "panel"))
  f.bg = bg

  if opts.border then
    local a = opts.borderAlpha or 0.5
    local edges = {}
    local function edge()
      local t = f:CreateTexture(nil, "BORDER")
      t:SetColorTexture(S.rgba(opts.border, a))
      return t
    end
    local top, bottom, left, right = edge(), edge(), edge()
    right = edge()
    top:SetPoint("TOPLEFT", f, "TOPLEFT", 0, 0)
    top:SetPoint("TOPRIGHT", f, "TOPRIGHT", 0, 0)
    top:SetHeight(1)
    bottom:SetPoint("BOTTOMLEFT", f, "BOTTOMLEFT", 0, 0)
    bottom:SetPoint("BOTTOMRIGHT", f, "BOTTOMRIGHT", 0, 0)
    bottom:SetHeight(1)
    left:SetPoint("TOPLEFT", f, "TOPLEFT", 0, 0)
    left:SetPoint("BOTTOMLEFT", f, "BOTTOMLEFT", 0, 0)
    left:SetWidth(1)
    right:SetPoint("TOPRIGHT", f, "TOPRIGHT", 0, 0)
    right:SetPoint("BOTTOMRIGHT", f, "BOTTOMRIGHT", 0, 0)
    right:SetWidth(1)
    edges.top, edges.bottom, edges.left, edges.right = top, bottom, left, right
    f.borders = edges
  end

  return f
end

-- A thin horizontal accent line (the violet "ornament" rule). Parent-anchored
-- by the caller.
function S.CreateRule(parent, colorName, alpha)
  local t = parent:CreateTexture(nil, "ARTWORK")
  t:SetColorTexture(S.rgba(colorName or "accent", alpha or 0.5))
  t:SetHeight(1)
  return t
end

------------------------------------------------------------------------
-- The Aftertale frame: a 9-slice gold-on-violet ornament that wraps any
-- panel where we want the brand frame instead of the plain border. The
-- source asset is a 1024x1024 PNG with 64px corners; coords are normalized
-- below. If the PNG is missing (FRAME_PNG_READY = false), CreateFramedPanel
-- falls back to the plain CreatePanel so the addon never errors on art
-- not yet being in place.
--
-- Returns the outer frame; attach children to frame.content (a child
-- frame already inset by the frame thickness + padding so text never
-- crowds the gold filigree).
------------------------------------------------------------------------

-- IMPORTANT: include the explicit ".png" extension. WoW's Texture:SetTexture
-- only auto-resolves missing extensions to .blp and .tga -- it does NOT try
-- .png. Without the suffix the texture fails to load silently and you get
-- a flat panel with no error.
local FRAME_ART = "Art\\frame\\aftertale-9slice-frame.png"
-- Flip to true once addon/Aftertale/Art/frame/aftertale-9slice-frame.png
-- (or .tga) is in the repo. Until then the framed panel falls back to flat.
S.FRAME_PNG_READY = true

-- Normalized texcoords: slice is 80/1024 = 0.0781, inner band is 944/1024 = 0.9219.
-- 80px (not the old 64) because the corner star sigils run out to ~71px from the
-- corner on the clean asset; a 64px slice clipped them. Measured via
-- tools/measure-frame-slice.py against the shipped 1024x1024 PNG.
local SC = 0.0781
local LC = 0.9219
local SLICE = {
  tl     = { 0,  SC, 0,  SC },
  top    = { SC, LC, 0,  SC },
  tr     = { LC, 1,  0,  SC },
  left   = { 0,  SC, SC, LC },
  center = { SC, LC, SC, LC },
  right  = { LC, 1,  SC, LC },
  bl     = { 0,  SC, LC, 1  },
  bottom = { SC, LC, LC, 1  },
  br     = { LC, 1,  LC, 1  },
}

function S.CreateFramedPanel(parent, opts)
  opts = opts or {}
  local cornerSize = opts.cornerSize or 28
  local padding    = opts.padding    or 16

  if not S.FRAME_PNG_READY then
    -- Asset not in repo yet -- fall back to the existing flat panel so the
    -- addon stays renderable. Same .content child shape so callers don't
    -- have to branch.
    local f = S.CreatePanel(parent, { fill = "panel", border = "border", borderAlpha = 0.5 })
    local content = CreateFrame("Frame", nil, f)
    content:SetPoint("TOPLEFT", f, "TOPLEFT", padding, -padding)
    content:SetPoint("BOTTOMRIGHT", f, "BOTTOMRIGHT", -padding, padding)
    f.content = content
    return f
  end

  local tex = (NS.ADDON_PATH or ("Interface\\AddOns\\" .. ADDON_NAME)) .. "\\" .. FRAME_ART

  local f = CreateFrame("Frame", nil, parent)

  -- Build the 9 textures. Corners are fixed pixel size; edges stretch
  -- between corners; center fills what's left. Anchoring guarantees the
  -- frame redraws cleanly on resize -- no manual recalc needed.
  local function makeTex(layer, coords)
    local t = f:CreateTexture(nil, layer)
    t:SetTexture(tex)
    t:SetTexCoord(coords[1], coords[2], coords[3], coords[4])
    return t
  end

  local tl = makeTex("BORDER", SLICE.tl)
  tl:SetSize(cornerSize, cornerSize)
  tl:SetPoint("TOPLEFT", f, "TOPLEFT")

  local tr = makeTex("BORDER", SLICE.tr)
  tr:SetSize(cornerSize, cornerSize)
  tr:SetPoint("TOPRIGHT", f, "TOPRIGHT")

  local bl = makeTex("BORDER", SLICE.bl)
  bl:SetSize(cornerSize, cornerSize)
  bl:SetPoint("BOTTOMLEFT", f, "BOTTOMLEFT")

  local br = makeTex("BORDER", SLICE.br)
  br:SetSize(cornerSize, cornerSize)
  br:SetPoint("BOTTOMRIGHT", f, "BOTTOMRIGHT")

  local top = makeTex("BORDER", SLICE.top)
  top:SetHeight(cornerSize)
  top:SetPoint("TOPLEFT", tl, "TOPRIGHT")
  top:SetPoint("TOPRIGHT", tr, "TOPLEFT")

  local bottom = makeTex("BORDER", SLICE.bottom)
  bottom:SetHeight(cornerSize)
  bottom:SetPoint("BOTTOMLEFT", bl, "BOTTOMRIGHT")
  bottom:SetPoint("BOTTOMRIGHT", br, "BOTTOMLEFT")

  local left = makeTex("BORDER", SLICE.left)
  left:SetWidth(cornerSize)
  left:SetPoint("TOPLEFT", tl, "BOTTOMLEFT")
  left:SetPoint("BOTTOMLEFT", bl, "TOPLEFT")

  local right = makeTex("BORDER", SLICE.right)
  right:SetWidth(cornerSize)
  right:SetPoint("TOPRIGHT", tr, "BOTTOMRIGHT")
  right:SetPoint("BOTTOMRIGHT", br, "TOPRIGHT")

  local center = makeTex("BACKGROUND", SLICE.center)
  center:SetPoint("TOPLEFT", tl, "BOTTOMRIGHT")
  center:SetPoint("BOTTOMRIGHT", br, "TOPLEFT")

  -- Content child: pre-inset so callers anchor their children here and
  -- never crowd the gold line.
  local content = CreateFrame("Frame", nil, f)
  content:SetPoint("TOPLEFT", f, "TOPLEFT", cornerSize + padding, -(cornerSize + padding))
  content:SetPoint("BOTTOMRIGHT", f, "BOTTOMRIGHT", -(cornerSize + padding), cornerSize + padding)
  f.content = content

  return f
end

------------------------------------------------------------------------
-- Text helpers -- consistent type scale + colour, all in one place.
------------------------------------------------------------------------

-- Kicker: small letter-spaced violet caps above a heading.
function S.AddKicker(parent, text)
  local fs = parent:CreateFontString(nil, "OVERLAY")
  S.UseDisplayFont(fs, 11, "")
  fs:SetText(S.Kicker(text))
  fs:SetTextColor(S.rgba("accent"))
  fs:SetSpacing(2)
  return fs
end

-- Heading: gold Cinzel display title.
function S.AddHeading(parent, text, size)
  local fs = parent:CreateFontString(nil, "OVERLAY")
  S.UseDisplayFont(fs, size or 20, "")
  fs:SetText(text or "")
  fs:SetTextColor(S.rgba("goldBright"))
  fs:SetShadowColor(0, 0, 0, 0.6)
  fs:SetShadowOffset(1, -1)
  return fs
end

-- Body: readable default-font text in the warm body colour.
function S.AddBody(parent, text, size)
  local fs = parent:CreateFontString(nil, "OVERLAY")
  local f = (GameFontHighlight or GameFontNormal):GetFont()
  fs:SetFont(f, size or 13, "")
  fs:SetText(text or "")
  fs:SetTextColor(S.rgba("fg"))
  fs:SetSpacing(3)
  fs:SetJustifyH("LEFT")
  fs:SetJustifyV("TOP")
  fs:SetWordWrap(true)
  return fs
end

-- Muted: secondary / footnote text.
function S.AddMuted(parent, text, size)
  local fs = parent:CreateFontString(nil, "OVERLAY")
  local f = (GameFontDisable or GameFontNormalSmall):GetFont()
  fs:SetFont(f, size or 11, "")
  fs:SetText(text or "")
  fs:SetTextColor(S.rgba("fgMuted"))
  fs:SetSpacing(2)
  return fs
end
