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
  -- Letter-space per UTF-8 codepoint (not per byte) so multibyte separators
  -- like "—" survive instead of shredding into tofu boxes.
  return (text:upper():gsub("[%z\1-\127\194-\244][\128-\191]*", "%0 "):gsub("%s+$", ""))
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
-- Gradient helper -- modern WoW uses Texture:SetGradient(orientation,
-- ColorMixin, ColorMixin); older flavors use SetGradientAlpha(orientation,
-- r1,g1,b1,a1, r2,g2,b2,a2). We try the new API first and silently fall
-- back. If neither exists the texture stays a solid color, which is the
-- acceptable degraded mode (still reads as a shadow / bloom).
------------------------------------------------------------------------

local function setLinearGradient(tex, direction, c1, c2)
  if tex.SetGradient and CreateColor then
    local ok = pcall(tex.SetGradient, tex, direction,
      CreateColor(c1[1], c1[2], c1[3], c1[4]),
      CreateColor(c2[1], c2[2], c2[3], c2[4]))
    if ok then return end
  end
  if tex.SetGradientAlpha then
    pcall(tex.SetGradientAlpha, tex, direction,
      c1[1], c1[2], c1[3], c1[4],
      c2[1], c2[2], c2[3], c2[4])
  end
end

------------------------------------------------------------------------
-- Drop shadow -- 4 black strips around the frame, each fading from
-- partially-opaque at the frame edge to transparent at the outer extent.
-- Corners overlap (which reads as slightly darker corner shadow -- correct
-- for a real drop shadow).
------------------------------------------------------------------------

function S.AddDropShadow(frame, depth, alpha)
  depth = depth or 24
  alpha = alpha or 0.5
  local solid = { 0, 0, 0, alpha }
  local clear = { 0, 0, 0, 0 }

  -- Top: vertical gradient, transparent at top -> dark at bottom (frame edge)
  local top = frame:CreateTexture(nil, "BACKGROUND", nil, -2)
  top:SetPoint("BOTTOMLEFT", frame, "TOPLEFT", -depth, 0)
  top:SetPoint("BOTTOMRIGHT", frame, "TOPRIGHT", depth, 0)
  top:SetHeight(depth)
  setLinearGradient(top, "VERTICAL", solid, clear)

  -- Bottom: vertical gradient, dark at top (frame edge) -> transparent at bottom
  local bot = frame:CreateTexture(nil, "BACKGROUND", nil, -2)
  bot:SetPoint("TOPLEFT", frame, "BOTTOMLEFT", -depth, 0)
  bot:SetPoint("TOPRIGHT", frame, "BOTTOMRIGHT", depth, 0)
  bot:SetHeight(depth)
  setLinearGradient(bot, "VERTICAL", clear, solid)

  -- Left: horizontal gradient, transparent at left -> dark at right (frame edge)
  local left = frame:CreateTexture(nil, "BACKGROUND", nil, -2)
  left:SetPoint("TOPRIGHT", frame, "TOPLEFT", 0, depth)
  left:SetPoint("BOTTOMRIGHT", frame, "BOTTOMLEFT", 0, -depth)
  left:SetWidth(depth)
  setLinearGradient(left, "HORIZONTAL", clear, solid)

  -- Right: horizontal gradient, dark at left (frame edge) -> transparent at right
  local right = frame:CreateTexture(nil, "BACKGROUND", nil, -2)
  right:SetPoint("TOPLEFT", frame, "TOPRIGHT", 0, depth)
  right:SetPoint("BOTTOMLEFT", frame, "BOTTOMRIGHT", 0, -depth)
  right:SetWidth(depth)
  setLinearGradient(right, "HORIZONTAL", solid, clear)
end

------------------------------------------------------------------------
-- Inner bloom -- 4 violet-accent strips just inside the gold border,
-- fading from accent at the border toward transparent at the panel
-- interior. The visual goal: the gold reads as emerging from the violet
-- body rather than being stamped on top.
--
-- `cornerInset` keeps the bloom strips clear of the gold corner sigils
-- so they fade into the edge bands, not under the corner art.
------------------------------------------------------------------------

function S.AddInnerBloom(frame, cornerInset, depth, alpha)
  cornerInset = cornerInset or 28
  depth = depth or 14
  alpha = alpha or 0.22
  local r, g, b = S.rgba("accent")
  local solid = { r, g, b, alpha }
  local clear = { r, g, b, 0     }

  -- Top edge: anchor along the top, extend `depth` downward, fade down.
  local top = frame:CreateTexture(nil, "ARTWORK", nil, -1)
  top:SetPoint("TOPLEFT", frame, "TOPLEFT", cornerInset, -2)
  top:SetPoint("TOPRIGHT", frame, "TOPRIGHT", -cornerInset, -2)
  top:SetHeight(depth)
  setLinearGradient(top, "VERTICAL", clear, solid) -- bottom solid -> top clear

  local bot = frame:CreateTexture(nil, "ARTWORK", nil, -1)
  bot:SetPoint("BOTTOMLEFT", frame, "BOTTOMLEFT", cornerInset, 2)
  bot:SetPoint("BOTTOMRIGHT", frame, "BOTTOMRIGHT", -cornerInset, 2)
  bot:SetHeight(depth)
  setLinearGradient(bot, "VERTICAL", solid, clear) -- bottom clear -> top solid

  local left = frame:CreateTexture(nil, "ARTWORK", nil, -1)
  left:SetPoint("TOPLEFT", frame, "TOPLEFT", 2, -cornerInset)
  left:SetPoint("BOTTOMLEFT", frame, "BOTTOMLEFT", 2, cornerInset)
  left:SetWidth(depth)
  setLinearGradient(left, "HORIZONTAL", solid, clear)

  local right = frame:CreateTexture(nil, "ARTWORK", nil, -1)
  right:SetPoint("TOPRIGHT", frame, "TOPRIGHT", -2, -cornerInset)
  right:SetPoint("BOTTOMRIGHT", frame, "BOTTOMRIGHT", -2, cornerInset)
  right:SetWidth(depth)
  setLinearGradient(right, "HORIZONTAL", clear, solid)
end

------------------------------------------------------------------------
-- Modal scrim -- a low-alpha black full-screen Frame that dims the game
-- behind a dialog. Standard modal pattern: caller passes the dialog frame,
-- the scrim attaches itself just below it on the same strata, and binds
-- to the dialog's Show / Hide so it tracks state without further glue.
-- Returns the scrim frame so callers can tune alpha or wire click-outside
-- behavior.
------------------------------------------------------------------------

function S.AddModalScrim(dialog, opts)
  opts = opts or {}
  local alpha = opts.alpha or 0.45
  local closeOnClick = opts.closeOnClick ~= false  -- default true

  local scrim = CreateFrame("Frame", nil, UIParent)
  scrim:SetAllPoints(UIParent)
  scrim:SetFrameStrata(dialog:GetFrameStrata())
  scrim:SetFrameLevel(math.max(1, (dialog:GetFrameLevel() or 1) - 1))
  scrim:EnableMouse(true) -- swallow clicks so game UI behind isn't reachable
  scrim:Hide()

  local tex = scrim:CreateTexture(nil, "BACKGROUND")
  tex:SetAllPoints(scrim)
  tex:SetColorTexture(0, 0, 0, alpha)

  if closeOnClick then
    scrim:SetScript("OnMouseDown", function() dialog:Hide() end)
  end

  dialog:HookScript("OnShow", function()
    scrim:SetFrameLevel(math.max(1, (dialog:GetFrameLevel() or 1) - 1))
    scrim:Show()
  end)
  dialog:HookScript("OnHide", function() scrim:Hide() end)

  dialog._scrim = scrim
  return scrim
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
--
-- opts.shadow / opts.bloom: pass `false` to disable, `true` (or omit) for
-- defaults, or a table { depth = N, alpha = N } to tune.
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

  -- Drop shadow goes UNDER the 9-slice. Build it before the slice textures so
  -- it lands on a lower sublayer.
  if opts.shadow ~= false then
    local depth = (type(opts.shadow) == "table" and opts.shadow.depth) or 28
    local alpha = (type(opts.shadow) == "table" and opts.shadow.alpha) or 0.55
    S.AddDropShadow(f, depth, alpha)
  end

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

  -- Inner violet bloom: a soft accent halo just inside the gold border so
  -- the gold reads as emerging from the violet body, not stamped onto it.
  -- Drawn on ARTWORK so it sits on top of the center fill but under text.
  if opts.bloom ~= false then
    local depth = (type(opts.bloom) == "table" and opts.bloom.depth) or 14
    local alpha = (type(opts.bloom) == "table" and opts.bloom.alpha) or 0.22
    S.AddInnerBloom(f, cornerSize, depth, alpha)
  end

  -- Content child: pre-inset so callers anchor their children here and
  -- never crowd the gold line.
  local content = CreateFrame("Frame", nil, f)
  content:SetPoint("TOPLEFT", f, "TOPLEFT", cornerSize + padding, -(cornerSize + padding))
  content:SetPoint("BOTTOMRIGHT", f, "BOTTOMRIGHT", -(cornerSize + padding), cornerSize + padding)
  f.content = content

  return f
end

------------------------------------------------------------------------
-- Art-framed panel -- like CreateFramedPanel but backed by a SINGLE
-- pre-rendered frame texture (its own corner + centered-edge ornaments and
-- interior fill baked in) instead of a stretched 9-slice. The 9-slice path
-- smears the artist's centered edge flourishes when the edge band stretches;
-- for a fixed-aspect surface (the Hub) drawing the whole texture preserves
-- every ornament. Kept as a SEPARATE constructor so it never disturbs the
-- CreateFramedPanel contract.
--
-- The frame art lives in Art\frame\<name>.png and already carries its own
-- magenta-keyed transparency, so the texture is drawn whole with the world
-- showing through outside the rounded corners.
--
-- opts = {
--   art    = "frame-rectangle" (default) | "frame-square" | "inner-frame"
--            | "flyout-left" | "flyout-right",
--   insetX = px content inset L/R   (default 48),
--   insetY = px content inset T/B   (default 48),
--   shadow = false | true | { depth, alpha }  (default on),
--   bloom  = false | true | { depth, alpha }  (default OFF -- the art already
--            carries its own border glow),
-- }
-- Returns the outer frame with a pre-inset `.content` child, matching the
-- CreateFramedPanel contract so call sites are interchangeable.
------------------------------------------------------------------------

function S.CreateArtFramedPanel(parent, opts)
  opts = opts or {}
  local art    = opts.art    or "frame-rectangle"
  local insetX = opts.insetX or 48
  local insetY = opts.insetY or 48

  local base = (NS.ADDON_PATH or ("Interface\\AddOns\\" .. ADDON_NAME))
  local tex  = base .. "\\Art\\frame\\" .. art .. ".png"

  local f = CreateFrame("Frame", nil, parent)

  -- Drop shadow under the frame so the panel reads as lifted off the world.
  if opts.shadow ~= false then
    local depth = (type(opts.shadow) == "table" and opts.shadow.depth) or 28
    local alpha = (type(opts.shadow) == "table" and opts.shadow.alpha) or 0.55
    S.AddDropShadow(f, depth, alpha)
  end

  -- The whole frame: interior fill + border ornament in one texture.
  local frameTex = f:CreateTexture(nil, "BORDER")
  frameTex:SetAllPoints(f)
  frameTex:SetTexture(tex)
  f.frameTexture = frameTex

  -- Optional inner bloom (off by default -- the baked border already glows).
  if opts.bloom and opts.bloom ~= false then
    local depth = (type(opts.bloom) == "table" and opts.bloom.depth) or 14
    local alpha = (type(opts.bloom) == "table" and opts.bloom.alpha) or 0.18
    S.AddInnerBloom(f, math.max(insetX, insetY), depth, alpha)
  end

  local content = CreateFrame("Frame", nil, f)
  content:SetPoint("TOPLEFT", f, "TOPLEFT", insetX, -insetY)
  content:SetPoint("BOTTOMRIGHT", f, "BOTTOMRIGHT", -insetX, insetY)
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

------------------------------------------------------------------------
-- Asset chrome helpers (Phase 0 of the mockup-parity build).
--
-- Several of the new whole-texture art assets sit on top of a stretched
-- background; others need 9-slicing so corner ornaments stay sharp at any
-- aspect. Helpers below cover the patterns the Hub + Popover + other
-- screens repeat: column wrappers, stat-tile backgrounds, button pairs,
-- separators, close + help icons, and a pulsing recording indicator.
------------------------------------------------------------------------

local function artPath(rel)
  return (NS.ADDON_PATH or ("Interface\\AddOns\\" .. ADDON_NAME)) .. "\\Art\\" .. rel
end

------------------------------------------------------------------------
-- S.CreateInnerFrame: 9-sliced wrapper around inner-frame.png.
--
-- Source asset is 1433x920 with gold corner stars + mid-edge diamond
-- ornaments. 9-slicing keeps the corner stars proportional and crisp at
-- any displayed size while the mid-edge diamonds stay centered along
-- each edge (they live in the texture-center of each edge slice, so as
-- the edge strip stretches, the diamond stays centered).
--
-- Slice values are pre-baked for inner-frame.png: 100px corner in source
-- gives normalized slice coords (0.0698, 0.9302) horizontally and
-- (0.1087, 0.8913) vertically. opts.corner controls the on-screen corner
-- cell size; opts.padding controls the interior content inset.
--
-- Returns the outer frame + .content child (pre-inset for the caller).
------------------------------------------------------------------------

function S.CreateInnerFrame(parent, w, h, opts)
  opts = opts or {}
  local CORNER = opts.corner  or 32
  local PAD    = opts.padding or 18
  local SC_X, LC_X = 0.0698, 0.9302
  local SC_Y, LC_Y = 0.1087, 0.8913
  local tex = artPath("frame\\inner-frame.png")

  local f = CreateFrame("Frame", nil, parent)
  f:SetSize(w, h)

  local function mkTex(coords, layer)
    local t = f:CreateTexture(nil, layer or "BORDER")
    t:SetTexture(tex)
    t:SetTexCoord(coords[1], coords[2], coords[3], coords[4])
    return t
  end

  local tl = mkTex({ 0,    SC_X, 0,    SC_Y }); tl:SetSize(CORNER, CORNER); tl:SetPoint("TOPLEFT",     f, "TOPLEFT")
  local tr = mkTex({ LC_X, 1,    0,    SC_Y }); tr:SetSize(CORNER, CORNER); tr:SetPoint("TOPRIGHT",    f, "TOPRIGHT")
  local bl = mkTex({ 0,    SC_X, LC_Y, 1    }); bl:SetSize(CORNER, CORNER); bl:SetPoint("BOTTOMLEFT",  f, "BOTTOMLEFT")
  local br = mkTex({ LC_X, 1,    LC_Y, 1    }); br:SetSize(CORNER, CORNER); br:SetPoint("BOTTOMRIGHT", f, "BOTTOMRIGHT")

  local top = mkTex({ SC_X, LC_X, 0,    SC_Y })
  top:SetHeight(CORNER)
  top:SetPoint("TOPLEFT",  tl, "TOPRIGHT")
  top:SetPoint("TOPRIGHT", tr, "TOPLEFT")

  local bot = mkTex({ SC_X, LC_X, LC_Y, 1 })
  bot:SetHeight(CORNER)
  bot:SetPoint("BOTTOMLEFT",  bl, "BOTTOMRIGHT")
  bot:SetPoint("BOTTOMRIGHT", br, "BOTTOMLEFT")

  local left = mkTex({ 0, SC_X, SC_Y, LC_Y })
  left:SetWidth(CORNER)
  left:SetPoint("TOPLEFT",    tl, "BOTTOMLEFT")
  left:SetPoint("BOTTOMLEFT", bl, "TOPLEFT")

  local right = mkTex({ LC_X, 1, SC_Y, LC_Y })
  right:SetWidth(CORNER)
  right:SetPoint("TOPRIGHT",    tr, "BOTTOMRIGHT")
  right:SetPoint("BOTTOMRIGHT", br, "TOPRIGHT")

  local center = mkTex({ SC_X, LC_X, SC_Y, LC_Y }, "BACKGROUND")
  center:SetPoint("TOPLEFT",     tl, "BOTTOMRIGHT")
  center:SetPoint("BOTTOMRIGHT", br, "TOPLEFT")

  local content = CreateFrame("Frame", nil, f)
  content:SetPoint("TOPLEFT",     f, "TOPLEFT",      PAD, -PAD)
  content:SetPoint("BOTTOMRIGHT", f, "BOTTOMRIGHT", -PAD,  PAD)
  f.content = content
  return f
end

------------------------------------------------------------------------
-- S.CreateInnerCell: whole-texture inner-cell.png stretch.
--
-- The asset is just a rounded plum panel with no border ornaments, so a
-- plain stretch works at any aspect. Used for stat tiles, callout pills
-- (Recording since, Latest Moment), URL display boxes.
------------------------------------------------------------------------

function S.CreateInnerCell(parent, w, h, opts)
  opts = opts or {}
  local PAD = opts.padding or 8
  local f = CreateFrame("Frame", nil, parent)
  f:SetSize(w, h)
  local tex = f:CreateTexture(nil, "BACKGROUND")
  tex:SetTexture(artPath("frame\\inner-cell.png"))
  tex:SetAllPoints(f)
  local content = CreateFrame("Frame", nil, f)
  content:SetPoint("TOPLEFT",     f, "TOPLEFT",      PAD, -PAD)
  content:SetPoint("BOTTOMRIGHT", f, "BOTTOMRIGHT", -PAD,  PAD)
  f.content = content
  return f
end

------------------------------------------------------------------------
-- S.CreateImageButton: generic button-idle/hover texture pair.
--
-- Pass the relative paths under Art/ (typically "frame\\button-idle.png"
-- + "frame\\button-hover.png"). Optional labelText is drawn over the
-- texture in letter-spaced gold caps. Caller hooks `:SetScript("OnClick",
-- ...)` as usual.
------------------------------------------------------------------------

function S.CreateImageButton(parent, idleRel, hoverRel, w, h, labelText)
  local b = CreateFrame("Button", nil, parent)
  b:SetSize(w, h)

  local idle = b:CreateTexture(nil, "BACKGROUND")
  idle:SetTexture(artPath(idleRel))
  idle:SetAllPoints(b)

  local hover = b:CreateTexture(nil, "BACKGROUND")
  hover:SetTexture(artPath(hoverRel))
  hover:SetAllPoints(b)
  hover:Hide()

  if labelText and labelText ~= "" then
    local lbl = b:CreateFontString(nil, "OVERLAY")
    S.UseDisplayFont(lbl, 11, "")
    lbl:SetText(S.Kicker(labelText))
    lbl:SetPoint("CENTER", 0, 0)
    lbl:SetTextColor(S.rgba("goldBright"))
    b.label = lbl
  end

  b:SetScript("OnEnter", function() hover:Show() end)
  b:SetScript("OnLeave", function() hover:Hide() end)
  return b
end

------------------------------------------------------------------------
-- S.CreateCTAButton: the canonical "Open Chronicle" CTA button.
--
-- Uses cta-chronicle-idle/hover.png which have "OPEN CHRONICLE" + the
-- external-link arrow baked into the texture, so no label is drawn over.
-- Used wherever the user is invited to go to aftertale.gg.
------------------------------------------------------------------------

function S.CreateCTAButton(parent, w, h)
  local b = CreateFrame("Button", nil, parent)
  b:SetSize(w, h)
  local idle = b:CreateTexture(nil, "BACKGROUND")
  idle:SetTexture(artPath("frame\\cta-chronicle-idle.png"))
  idle:SetAllPoints(b)
  local hover = b:CreateTexture(nil, "BACKGROUND")
  hover:SetTexture(artPath("frame\\cta-chronicle-hover.png"))
  hover:SetAllPoints(b)
  hover:Hide()
  b:SetScript("OnEnter", function() hover:Show() end)
  b:SetScript("OnLeave", function() hover:Hide() end)
  return b
end

------------------------------------------------------------------------
-- S.AddSeparator: thin gold horizontal or vertical rule using sep-*.png.
------------------------------------------------------------------------

function S.AddSeparator(parent, orientation, length)
  local t = parent:CreateTexture(nil, "ARTWORK")
  if orientation == "vertical" then
    t:SetTexture(artPath("frame\\sep-vertical.png"))
    t:SetWidth(8)
    if length then t:SetHeight(length) end
  else
    t:SetTexture(artPath("frame\\sep-horizontal.png"))
    t:SetHeight(8)
    if length then t:SetWidth(length) end
  end
  return t
end

------------------------------------------------------------------------
-- S.AddCloseButton: icons/close.png as a clickable button with hover
-- tint. Default size 22. Caller hooks OnClick.
------------------------------------------------------------------------

function S.AddCloseButton(parent, size)
  size = size or 22
  local b = CreateFrame("Button", nil, parent)
  b:SetSize(size, size)
  local icon = b:CreateTexture(nil, "ARTWORK")
  icon:SetTexture(artPath("icons\\close.png"))
  icon:SetAllPoints(b)
  icon:SetVertexColor(S.rgba("fgMuted"))
  b:SetScript("OnEnter", function() icon:SetVertexColor(S.rgba("goldBright")) end)
  b:SetScript("OnLeave", function() icon:SetVertexColor(S.rgba("fgMuted")) end)
  return b
end

------------------------------------------------------------------------
-- S.AddHelpIcon: icons/question.png with a hover-driven GameTooltip.
-- Used next to settings rows + Memorable Moments label.
------------------------------------------------------------------------

function S.AddHelpIcon(parent, size, tooltipText)
  size = size or 14
  local b = CreateFrame("Button", nil, parent)
  b:SetSize(size, size)
  local icon = b:CreateTexture(nil, "ARTWORK")
  icon:SetTexture(artPath("icons\\question.png"))
  icon:SetAllPoints(b)
  icon:SetVertexColor(S.rgba("fgMuted"))
  b:SetScript("OnEnter", function(self)
    icon:SetVertexColor(S.rgba("gold"))
    if tooltipText and GameTooltip then
      GameTooltip:SetOwner(self, "ANCHOR_RIGHT")
      GameTooltip:SetText(tooltipText, 1, 1, 1, 1, true)
      GameTooltip:Show()
    end
  end)
  b:SetScript("OnLeave", function()
    icon:SetVertexColor(S.rgba("fgMuted"))
    if GameTooltip then GameTooltip:Hide() end
  end)
  return b
end

------------------------------------------------------------------------
-- S.AddRecordingDot: pulsing violet dot indicating "watch is active".
-- Same treatment on every screen (Hub footer pill, Popover header, Story
-- Captured footer). Pure code, no asset needed -- just a small accent-
-- coloured frame with an OnUpdate sine-wave alpha pulse.
------------------------------------------------------------------------

function S.AddRecordingDot(parent, size)
  size = size or 8
  local dot = CreateFrame("Frame", nil, parent)
  dot:SetSize(size, size)
  local tex = dot:CreateTexture(nil, "OVERLAY")
  tex:SetAllPoints(dot)
  tex:SetColorTexture(S.rgba("accent"))
  local t = 0
  dot:SetScript("OnUpdate", function(self, dt)
    t = t + dt
    local phase = (math.sin(t * 4.5) + 1) * 0.5  -- 0..1
    self:SetAlpha(0.4 + phase * 0.6)
  end)
  return dot
end
