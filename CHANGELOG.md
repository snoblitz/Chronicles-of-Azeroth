# Changelog

All notable changes to Aftertale. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Pre-1.0, every
change is technically breaking — we'll start being strict about SemVer when
Phase 1 ships.

## [Unreleased] — Phase 0 shipped 🎉

### Changed — Hub Overview re-skinned with new chrome assets *(2026-05-31)*

Phase 1 of the mockup-parity pass. The Hub Overview tab now uses the
new asset family directly instead of programmatically-drawn rectangles
and lines, and the layout was rebuilt to match the high-res mockup.

Layout changes:
- Title + sigil moved to top-LEFT (was top-center), sitting on the
  upper-left of the panel like the mockup.
- Tab strip left-aligned starting under the title (was evenly spread
  across the panel width).
- Stat tiles now sit inside two `inner-frame` (9-sliced) columns —
  "Story at a Glance" on the left, "Recent Moments" on the right —
  with no vertical separator between them.
- "Recording since…" is now its own `inner-cell` pill at the bottom
  of the left column, with a pulsing violet recording dot prefix.
- Buttons at the bottom of the right column: "View All Moments" uses
  the muted `button-idle/hover` pair; "Open Chronicle" uses the baked-
  text `cta-chronicle-idle/hover` CTA pair.

Component changes:
- Stat tile backgrounds: `inner-cell.png` instead of a programmatic
  flat panel + border.
- Stat tile dimensions tightened to 120×120, icons to 44px, value to
  20pt Cinzel, labels rendered title-case (not letter-spaced caps).
- Recent Moments rows now support an optional metadata tag (e.g.
  `+1.2k XP` on quest-turnin rows), surfaced from the captured
  `xpReward` arg when present.
- Close X swapped from a Cinzel × FontString to the `icons/close.png`
  asset via `S.AddCloseButton`.
- Tab separator now uses `sep-horizontal.png` (was a 1px CreateRule).

New helpers in `Style.lua`: `CreateInnerFrame` (9-sliced),
`CreateInnerCell`, `CreateImageButton`, `CreateCTAButton`,
`AddSeparator`, `AddCloseButton`, `AddHelpIcon`, `AddRecordingDot`.
All shared so Phases 2-6 can compose them without re-deriving the
texture/anchoring math.

### Added — Lua 5.1 compat hook + `/ship` slash command *(2026-05-31)*

Two quick-win additions from the `/insights` audit, both targeting bugs
and friction we kept paying for.

- **`tools/check-lua-compat.sh`** runs as a `PostToolUse` hook on every
  Edit/Write/MultiEdit. Greps the addon tree for `\xNN` hex escapes (Lua
  5.2 syntax; WoW eats the backslash and ships them as literal text like
  `"xE2x9CxA6"` — the most repeated bug in our sessions) and exits 2
  with a clear conversion guide if any are found.
- **`.claude/commands/ship.md`** codifies the end-of-edit ritual into one
  command: build → review diff → CHANGELOG → stage by path → commit via
  HEREDOC → push with rebase-on-conflict and exponential-backoff retry.
  Refuses force pushes, branch pushes, hook bypasses, and commits
  containing secrets.
- `CLAUDE.md` now documents the Lua 5.1 constraint and points future
  agents at `/ship` instead of letting them reconstruct the workflow.

### Added — chrome art batch: CTA, inner cell, separators, icons *(2026-05-31)*

Second art drop keyed through the same magenta pipeline:

- **`cta-chronicle-idle/hover`** — split from the side-by-side `cta_buttons`
  sheet (left/violet = idle, right/gold = hover), each with baked
  "OPEN CHRONICLE" text. Drove a new `split_cols` helper (mirror of
  `split_rows`).
- **`inner-cell`** — deep-plum rounded panel with a faint violet edge, for the
  Hub stat tiles.
- **`sep-horizontal` / `sep-vertical`** — thin gold separator lines. These
  needed a dedicated `kill_pink` pass: the gold line is only a few px thick, so
  the antialiased gold↔magenta boundary and the faded tips left salmon residue.
  Gate on the blue/green ratio (gold ≈0.45, magenta-despill ≈0.9) and drop any
  non-gold pixel.
- **`question` / `close`** icons keyed into `Art/icons/`.

### Added — brand frame art set + whole-texture Hub frame *(2026-05-31)*

The artist delivered a restrained gold-on-deep-plum frame family (magenta
chroma-keyed). Two-part landing:

- **`tools/prep-frames.py`** keys the magenta background to alpha — feathered
  key + colour de-spill + edge-bleed + a plum catch-all so WoW's bilinear
  filtering can never sample a hidden-magenta halo. Outputs 7 clean RGBA
  frames: `frame-square`, `frame-rectangle`, `flyout-left/right`,
  `inner-frame`, and `button-idle` (violet) / `button-hover` (gold) split
  from the stacked button sheet.
- **`S.CreateArtFramedPanel`** (new, separate from `CreateFramedPanel`) draws
  a whole pre-rendered frame texture instead of a stretched 9-slice, so the
  baked corner + centered-edge ornaments never smear. The **Hub** now uses it
  (`frame-rectangle`), with the window re-proportioned to the art's 1.419
  aspect (960×677) so the border stays uniform and undistorted. This swaps
  the old bright-purple heavy-gold frame for the moody, restrained look from
  the mockup — directly addressing the "too bright / too heavy frame" misses.

### Changed — illustrated icon set re-cut from the iconsheet *(2026-05-30)*

You pushed `iconsheet.png` — one 1536×1024 RGBA sheet, 4×3 grid, transparent
background, hand-illustrated antique-gold style. Updated `tools/prep-icon-set.py`
with a second pipeline that splits the sheet into 12 isolated icons, each
centered on a 1024² transparent canvas.

The hard part was bleed between cells (the small accent diamonds from one
icon's design crossing into the neighbor's cell, and the top of the Death
helm bleeding up into the Moments cell). Solved with two rules in the
bounding-box logic:

1. **Proximity from main, not merged.** Accent dots get merged with the main
   subject only if they're close to the *original largest blob*, not the
   growing merged bbox. Prevents the bbox from snowballing outward to swallow
   bleed.
2. **Edge-touching small blobs are bleed.** Any blob other than the largest
   that touches a cell boundary is treated as content from the neighboring
   cell and dropped. The main subject is allowed to touch edges; accents
   aren't.

Result: Moments keeps its 4 corner diamonds, Settings keeps its left+right
diamonds, Chronicle keeps its companion swoosh, and no neighboring-cell
bleed survives.

Three new icons land in this pass — `discoveries.png`, `chronicle.png`,
`settings.png` — added to the Hub's `ICON` table for future wiring (Hub
tab icons, First Launch tile icons, Chronicle Preview screen). The stale
`character.png` from the previous set was deleted.

### Fixed — icon art re-rendered at 1024px (anti-pixelation) *(2026-05-30)*

First in-game screenshot of the wired icons showed them as soft / pixelated.
Root cause: I'd downsampled the 1254px AI sources to 512px to keep file size
down, which lost detail. The GPU then chose a small mip level for the ~56px
on-screen display, compounding the softness.

Re-ran `tools/prep-icon-set.py` with icons + sigil bumped from 512 → 1024px
(power-of-two preserved). 1024 source → 56px display picks a much higher mip
level so the displayed icon stays crisp. File-size cost is modest (~15MB total
for the icon set vs ~3MB before; still trivial for a one-time addon download).

No Lua / display-size changes in this pass — just the asset re-render. If the
icons still feel small after this lands, next step is bumping the in-tile
display size from 56 → 64 (which the bigger source easily supports).

### Added — illustrated icon set wired in (1-13) *(2026-05-30)*

The AI-generated heraldic icon set landed (commit `bc72e46`) as `1.png`..`13.png`
in `addon/Aftertale/Art/`. This pass processes and wires them:

- **`tools/prep-icon-set.py`** — one-shot processor that chroma-keys the magenta
  AI background to transparent (with spill-suppression to kill the pink halo),
  resizes everything to power-of-two (1024² or 512²) for Classic compatibility,
  and renames/relocates to descriptive paths:
  - `frame/aftertale-9slice-frame.png` (rounded-corner replacement)
  - `sigil-header.png` (floating top-center ornament)
  - `icons/{moments,time,zones,quests,feats,dungeons,character,level,death,items}.png`
  - `book.png` (large illustration for the future Chronicle Preview screen)
- **Frame asset replaced** with the rounded-corner version. Slice re-measured at
  the same 80px so no Lua / CSS slice changes needed.
- **Hub stat tiles** now show the 6 illustrated icons (Moments / Time / Zones /
  Quests / Achievements / Dungeons). Tile dimensions bumped to 140×140 to give
  the 56px icons proper breathing room.
- **Hub Recent Moments rows** now show a per-event icon on the left (scroll for
  quests, helm for level-up, compass rose for zones, etc.).
- **Floating sigil ornament** straddles the top gold border on both the Hub
  (72px) and the Minimap Popover (56px), matching the mockup.
- Numbered originals (`1.png`..`13.png`) cleaned up. Frame + book + sigil
  mirrored into `public/` for the web side.

### Fixed / Changed — Hub: glyph escapes, tile labels, drop shadow + bloom + scrim *(2026-05-30)*

First in-game screenshot of the Hub surfaced four issues — all fixed in this pass.

- **Glyph literals** rendered as `xE2x9CxA6` instead of ✦ because WoW's Lua 5.1
  doesn't support `\xNN` hex escapes. Dropped the placeholder Unicode icons from
  stat tiles and Recent Moments rows (Cinzel's restricted glyph set made them
  unreliable anyway) and switched the close × to the decimal escape `"\195\151"`
  that the popover already uses.
- **Tile labels** ("ACHIEVEMENTS EARNED", "DUNGEONS COMPLETED") overflowed the
  130px tiles when letter-spaced. Replaced kicker treatment with plain wrap-
  enabled caps so wide labels lay out as two clean lines.
- **Recent Moments rows** had timestamps bleeding into long quest titles. Re-
  anchored the label's right edge to the timestamp's left so they never collide.
- **Softening pass.** `Style.lua` gained three helpers — `AddDropShadow`,
  `AddInnerBloom`, and `AddModalScrim` — and `CreateFramedPanel` now takes
  `shadow` / `bloom` opts. The Hub gets all three: a 32px drop shadow, a violet
  inner bloom inside the gold edge, and a 40% modal scrim that dims the world
  behind it (click-outside-to-close). The Minimap Popover gets the lighter
  shadow + bloom but no scrim — it's a hover surface, not a modal. Falls back
  cleanly on older flavors where `SetGradient` isn't present.

### Added — Hub window: the addon's main surface *(2026-05-30)*

A new full-window UI behind `/at hub` (and `/at open`). One 9-slice gold-on-violet
framed dialog with a five-tab strip: **Overview · Moments · Milestones · Watch ·
Settings**. The Overview tab is fully wired in this pass; the rest render a
placeholder until their modules land.

The **Overview** tab is the dashboard the mockup calls for:

- **Story at a Glance** — a 3×2 grid of stat tiles reading live from `db.events`:
  Moments Captured, Time Recorded, Zones Visited, Quests Completed, Achievements
  Earned, Dungeons Completed.
- **Recent Moments** — the latest five narrative events (quest accept/turn-in,
  zone entered, level-up, achievement, encounter end) with `Today, 7:42 PM` /
  `Yesterday, …` / `May 27, 6:33 PM` timestamps.
- **Footer** — "Recording since *March 12, 2026*" on the left; **View All Moments**
  (jumps to the Moments tab) and **Open Chronicle** (copy-paste popup with the
  aftertale.gg URL) on the right.

Icons are Unicode glyphs (✦ ○ ✧ ❖ ⚜ ♜) in v1 — same vibe as the bullets already on
the popover. Real illustrated icons land in a follow-up asset pass.

Plumbing: the Hub registers itself in `UISpecialFrames` so ESC closes it, listens
to the same narrative-event signal bus the popover uses for live refresh, and is
movable by drag. The minimap-button behavior is **unchanged** in this pass — left
click still opens the popover; the Hub is reachable via slash command. Wiring the
popover to open the Hub on body-click + gear-click happens in the next commit.

### Changed — settings panel adopts the brand 9-slice *(2026-05-29)*

The config panel wore Peterodox's YUI parchment (GenericFrame.png + Divider.png
+ parchment buttons + attribution footer). Replaced it wholesale with Aftertale's
own visual ID — the same `S.CreateFramedPanel` 9-slice the popover uses, Cinzel
headings, violet kicker, accent rule, and the popover's primary/secondary brand
buttons. Settings now looks like it belongs to the addon, not borrowed.

- Dropped `applyParchmentBackground`, `makeParchmentButton`, the Divider texture,
  the YUI attribution footer, and the `page-turn` open sound.
- Removed the **"Story card hold" duration slider** — defunct now that notes are
  instant chat lines, not timed parchment cards (`storyCardDuration` is dead).
- Reworded toggles to match the new behavior ("Whisper a chat note when…") and
  added a plain footer naming aftertale.gg as where the chronicle is read.

### Changed — narrator moved from parchment popups to chat *(2026-05-29)*

The quest/level "story cards" were intrusive parchment toasts fading in at
top-center — off-brand (old YUI parchment) and easy to read as spam. Replaced
the whole card machinery with a **single on-brand violet chat line** (`#b89eff`)
behind the gold `[Aftertale]` tag. Same narrator copy, far quieter footprint:
the watch whispers "I noticed" and the real prose stays on aftertale.gg.

- Dropped the `ChroniclesStoryCard` frame, 9-slice parchment bg, divider, fade
  state machine, and the `paper-collect` sound on emit.
- `QUEST_ACCEPTED` / `QUEST_TURNED_IN` / `PLAYER_LEVEL_UP` and the
  `/aftertale preview` entry now print instead of presenting a card. Config
  gating (`showStoryCards`, `showLevelCards`) unchanged.

### Changed — popover stat digest + clearer value prop *(2026-05-29)*

The right column was opaque: "Beats remembered / Held in memory / The watch
began" told a new installer nothing about *why* the addon is running. Replaced
the cryptic counters with a plain-language **stat sheet** — only the categories
that have happened, in story order (Quests taken, Levels earned, Places
discovered, Deaths braved, Moments held, Feats earned), capped at 5 so it stays
a digest, not a log. Each row is a left label + right-aligned gold count.

- New session counters in `Aftertale.lua`: `deaths`, `zones`, `feats` (wired to
  `PLAYER_DEAD`, `ZONE_CHANGED_NEW_AREA`, `ACHIEVEMENT_EARNED`).
- **Empty state**: before anything's captured, one sentence explains what the
  watch is doing instead of showing `0 / 0`.
- **Payoff line** names `aftertale.gg` as a feature — the watch records here, the
  chronicle is *read* there. Sets the expectation that keeps the addon installed.
- Section retitled "Tonight's Vigil" → **"Tonight's Watch"**, and killed the last
  "vigil" in the copy (the resume pulse). Less mystique-for-its-own-sake.

### Fixed — minimap popover tofu boxes + UI polish pass *(2026-05-29)*

The hero-meta line rendered `ORC □□□ ROGUE □□□ HORDE` — not a missing font
glyph, but a **byte-splitting bug** in the kicker letter-spacer. `Scribe.Kicker`
(and the `Style.Kicker` fallback) walked each *byte* with `gmatch(".")`, which
shredded the multibyte em-dash separator (`—`, 3 UTF-8 bytes) into three raw
bytes that rendered as tofu. Both now split per UTF-8 codepoint, so any
multibyte char survives the letter-spacing treatment.

Same pass, polishing the popover the frame fix exposed:

- **Typography:** the right-column place line (zone + time) is now a gold Cinzel
  heading instead of default-font body, so it stops clashing with the rest of
  the branded type and anchors the column the way the hero name anchors the left.
- **Buttons:** primary/secondary split — `Hold this moment` is the default verb
  (lifted fill + faint gold wash + brighter border, `goldBright` label),
  `Pause the watch` stays a quiet recessed well. Dropped two leftover zero-size
  border textures from the old button builder.
- **Portrait:** softened the violet halo (spread 8→5px, alpha 0.18→0.12) and the
  container border (0.55→0.28) so it stops reading as a second frame competing
  with the gold 9-slice.
- **Spacing:** nudged the right block down so it reads vertically centred between
  the frame top and the buttons, trimming the mid-column void.

### Fixed — real frame asset replaces the spec-sheet mockup *(2026-05-29)*

The PNG at both frame paths was the **annotation/spec-sheet** export
(1122×1402, with title text, an "IMAGE FILE" caption, a slice diagram, and a
coordinate-labeled breakdown) — not a clean asset. Because the 9-slice math
sampled texcoords across the *whole* image, the addon and the web were
literally rendering chunks of label text and the diagram as the "frame."

- Replaced both `public/frame/aftertale-9slice-frame.png` and
  `addon/Aftertale/Art/frame/aftertale-9slice-frame.png` with the clean
  1024×1024 square frame (gold star sigils, violet rails, dark center for the
  panel fill). File weight dropped 1.03 MB → 499 KB in the process.
- Re-measured the corner slice with `tools/measure-frame-slice.py`: the star
  sigils run out to ~71px, so the old `64`-slice **clipped them**. Bumped the
  slice to `80`:
  - `src/index.css` → `border-image-slice: 80 fill;`
  - `addon/Aftertale/UI/Style.lua` → `SC = 0.0781`, `LC = 0.9219` (80/1024).

### Changed — AftertaleFrame goes live on web + in-game *(2026-05-29)*

With the PNG in the repo, both surfaces pick up the brand frame:

- **Web Chronicle Reader**: every chapter card is now wrapped in
  `<AftertaleFrame>` — the brand 9-slice gold-on-violet ornament. The
  `.at-chronicle-chapter` article keeps its layout role but drops its own
  border / radius / radial-gradient background (the frame owns visual framing
  now). Same frame signature appears around every chapter you read.
- **Addon minimap popover (hero card)**: the portrait panel swapped from
  `S.CreatePanel` to `S.CreateFramedPanel` — the brand frame wraps your
  live PlayerModel. The violet halo behind it stays as the
  paused-state dimming surface. `S.FRAME_PNG_READY` flipped to `true`;
  asset path corrected to `addon/Aftertale/Art/frame/` (lowercase
  matching how the file landed).

Same frame on both surfaces is the moment the brand becomes recognizable
across the product — chapter on the web, hero in-game, identical signature.

### Added — AftertaleFrame: the brand's 9-slice ornament *(2026-05-29)*

A gold-on-violet 9-slice frame becomes the brand's signature framing device
across both surfaces. Source: a 1024×1024 PNG with 64px slice on every side,
star-sigil corners + diamond edge midpoints. Asset itself ships separately;
the helpers are wired with safe fallbacks until the file lands at
`public/frame/aftertale-9slice-frame.png` (web) and
`addon/Aftertale/Art/Frame/aftertale-9slice-frame.png` (addon).

- **Web: `<AftertaleFrame>`** component (`src/components/AftertaleFrame.tsx`)
  + `.at-aftertale-frame` CSS class using `border-image: url(...) 64 fill /
  32px stretch`. Fallback violet background renders if the PNG is missing,
  so layout doesn't break before the asset is in place. Configurable
  thickness via prop.
- **Addon: `Style.CreateFramedPanel(parent, opts)`** in `UI/Style.lua`.
  Builds the 9 anchored textures from the source PNG using normalized
  texcoords (0.0625 / 0.9375). Returns a frame with a `.content` child
  pre-inset by `cornerSize + padding` so callers anchor their children
  there and never crowd the gold filigree. `S.FRAME_PNG_READY = false`
  switches to the existing flat-panel fallback until the texture is
  dropped in; same `.content` API both ways.

No placements yet — the helpers are ready, the surfaces (Chronicle Reader,
hero card, Magnus exhibit) get wrapped in follow-up commits once the PNG is
in the repo.

### Changed — Addon reframe: "Presence, not prose" *(2026-05-29)*

The addon stops trying to be a reader. The web is where you read; the addon
is the quiet artifact that watches your session. This commit is the persona
shift — the rest (mark-the-moment context window, ambient lines, idle
suppression, capture log) follows in narrower commits.

- **New: `UI/MinimapPopover.lua` — the front door.** Clicking the minimap
  button now opens a two-column panel: left = live `PlayerModel` of your
  character with a violet halo, gold Cinzel name, race · class · faction in
  letter-spaced caps; right = the live session ("Tonight's Vigil" kicker,
  place · hh:mm, *Beats remembered: N*, *Held in memory: N*, *The watch began
  Nm ago*). Two real buttons: **Hold this moment** (the marked-moment verb)
  and **Pause the watch** (private mode). State feedback per option B —
  pressing a button brief-pulses a one-line confirmation in the artifact's
  voice (*"Held."*, *"Sealed for now."*, *"The vigil resumes."*). Paused
  state dims the portrait and the halo. ESC closes. No web CTAs, no chapter
  prose, no settings — those have their own surfaces.
- **Minimap button click → popover, not the book.** Tooltip de-advertises
  the website and the `/at sync` shortcut; right-click stays Settings. The
  shift+right-click "open the web URL" popup is gone — Blizzard addon
  policy makes in-client CTAs to the paid service a no-go.
- **Chronicle book → hidden behind `db.config.enableInGameBook` (default
  off).** The code stays for Companion-tier where the in-game reader might
  earn its place; in Phase A the book is dead code. `/at book` falls back
  to opening the popover when the flag is off.
- **`NS.MarkHeldMoment()` / `NS.IsPaused()` / `NS.SetPaused()`.** First
  pass — the held moment lands a small `db.marked` stamp (time, zone,
  subzone) so the popover counter means something today. Full context-window
  capture (t-2min / t+60s / location / nearby / recent quest activity) is
  the next commit; this lands the verb so the button isn't a lie.
- **Dev-only config flag `captureBlizzardText` (default off).** Reserved
  for the next commit — when on, the addon captures verbatim Blizzard quest
  text / gossip alongside the metadata so we can A/B prose quality with vs.
  without. Never advertised in the user surface, never shipped on; the web
  side will strip the field before sending to OpenRouter on any paid tier.
  IP-risky for any commercial pipeline.
- **`db.config.paused` (default off).** Per-session toggle; cleared on
  logout. Captures keep flowing structurally so the popover counters
  update, but events get tagged `paused = true` and the web filters them
  out of the chapter pipeline. The wiring of the tag onto captured events
  is in the next commit.

### Changed — Chronicle book reskinned flat + on-brand *(2026-05-29)*

- **The in-game book now matches the website.** Rebuilt `UI/ChronicleBook.lua`
  on `UI/Style.lua`: deep-violet ground, inset panels with thin gold borders, a
  header band (violet `✦ AFTERTALE` kicker + gold Cinzel "The Chronicle" + a
  violet rule), gold Cinzel headings, light readable body text, a styled `✕`
  close. Retired the leather/parchment/polaroid/pushpin art (Peterodox album) —
  every beat now renders flat on the detail panel: enriched beats show the
  chronicler's prose, un-enriched beats show a clean Scribe's Note (violet
  kicker, place·time, one-line deed, "the chronicler awaits at aftertale.gg").
  All data/grouping/refresh logic unchanged; only the visual layer was
  rewritten. (The old Art/Album/* files are now unused but left in place until
  the other surfaces are reskinned.)

### Added — Addon design system (`UI/Style.lua`) *(2026-05-29)*

- **The in-client equivalent of `index.css`.** One module owning the addon's
  palette (web brand tokens — deep-violet ground, gold display, violet accent),
  font wiring, and flat-panel / heading / kicker / body / muted helpers.
  Direction is flat + modern (no skeuomorphic leather/parchment/Blizzard
  chrome), built to render identically on every flavor (avoids retail-only
  backdrop APIs). Wired into all six TOCs ahead of the UI files.
- **Cinzel-ready.** `Fonts/` is staged with a README; `Style.UseDisplayFont`
  points headings at `Fonts/Cinzel-Bold.ttf` and **falls back to WoW's default
  font when the file is absent**, so the addon never errors on a missing font
  and auto-upgrades to Cinzel the moment the `.ttf` is dropped in. Body text
  stays on the default font for small-size readability (same display/body split
  as the web app).

### Added — Opt-in OpenRouter key sync *(2026-05-29)*

- **"Sync this key to my devices"** checkbox in Settings → API Keys (off by
  default). When on, the OpenRouter key mirrors to `profiles.openrouter_key`
  (RLS owner-scoped) so signing in on a new box doesn't force a re-paste; when
  off, the key stays browser-local exactly as before. On sign-in, a synced key
  is pulled down to a device that has none. Stored plaintext (BYOK is used
  client-side; no usable server-side encryption under OTP auth) — the opt-in
  copy tells the user the risk is financial-only and revocable at
  openrouter.ai. New migration `20260529060000_add_profiles_openrouter_key.sql`,
  `getStoredApiKey` / `getKeySyncEnabled` / `setKeySyncEnabled` in `apiKeys.ts`,
  `syncOpenRouterKey()` + hydrate-time `reconcileKey()` in `cloudSync.ts`.
  Inert while anonymous or when Supabase is unconfigured. Amends
  `companion-architecture.md` §6.

### Fixed — Cross-device sync: hero not appearing after sign-in *(2026-05-29)*

Signing in on a second device showed the "✓ Backed up" pill but the
account's hero didn't appear. Two bugs, both in the cloud-pull path:

- **Active pointer stuck on an abandoned scratch hero.** A fresh sign-in
  often happens while a throwaway anonymous hero is the active one. Sync
  correctly tombstones that hero (it's un-owned scratch, not the account's
  work) and pulls the cloud hero down — but never moved the *active*
  pointer, so the app kept showing the abandoned hero. `hydrate()` now
  re-points the active hero to the most-recently-modified cloud hero
  whenever the active one is tombstoned/missing — in **both** the
  fresh-sign-in and continuity/upgrade paths. (`src/lib/cloudSync.ts`)
- **Stale character dropdown.** `CharacterSelector` listened to
  `at:bible-updated` + `storage` but **not** `at:bible-roster-updated` —
  the event fired when a non-active hero arrives from cloud sync. So a
  pulled hero didn't show in the dropdown until an unrelated re-render.
  Added the listener. (`src/components/CharacterSelector.tsx`)


### Changed — Auth modal redesign *(2026-05-29)*

- **The auth modal got a proper face.** It was borrowing the utilitarian
  settings-row (cramped input-beside-button) and dumping raw Supabase
  errors as a bare red line — read like a generic web form. Now it has its
  own centered, vertical treatment: a `✦ AFTERTALE` kicker + Cinzel title +
  ornament rhythm (matching the app hero), a full-width field with a
  full-width button beneath it, and a warm parchment **notice chip**
  (left-accent bar, ⚠ glyph) in place of the red slab. New `.at-auth-*`
  classes in `index.css`.
- **Humanized auth errors.** Raw strings like *"For security purposes, you
  can only request this after 38 seconds."* are translated in `auth.ts`
  (`humanizeAuthError`) to the app's plainer voice — *"Easy — you can
  request another code in 38s."* Covers rate-limit, expiry, and
  no-such-account cases.

### Changed — OTP length 6 *(2026-05-29)*

- **6-digit email code** (down from an interim 8). Shorter to type; the
  flow now works end to end. `OTP_LENGTH = 6` in `auth.ts` drives
  validation, the segmented input, and the copy. *(Tried 6-char
  alphanumeric for more entropy, but Supabase's email OTP is numeric-only
  — no charset option in the dashboard or Management API — so digits it
  is.)*

### Changed — Auth modal redesign *(2026-05-29)*

- **Auth could never verify.** The project emits **8-digit** email codes but
  the app validated for 6 (`/^\d{6}$/` in `auth.ts`, `maxLength={6}` in the
  modal), so every verification was rejected before reaching Supabase. Length
  is now a single shared constant `OTP_LENGTH` (`src/lib/auth.ts`) that drives
  validation, the input, and the copy — one-line change if the Supabase OTP
  setting ever moves.
- **Segmented code input** (`src/components/OtpInput.tsx`). The verify step is
  now N single-character boxes that auto-advance on type, backspace to the
  previous box, accept a pasted code, support arrow-key nav, and auto-submit
  when the last digit lands. Digits only; gold-on-dark with a focus glow that
  matches the app's palette. Replaces the single free-text field.

### Added — Addon: the Scribe persona *(2026-05-28)*

- **The in-game journal now speaks in the Scribe's voice.** The addon
  has a second narrative voice (the Chronicler being the first — the LLM
  in the web companion that turns notes into prose). The Scribe is the
  in-character watcher who takes notes during play; never claims
  authorship; always points the player at the Chronicler when a deed
  deserves more than a note.
- **New `addon/Aftertale/Lore/Scribe.lua`** — single home for the
  persona's voice copy + brand colour escapes (gold + violet, mirrored
  from the web app's `--gold` / `--magic` palette). Wired into all six
  flavour TOCs.
- **Chronicle book: two clearly-different states.**
  - *Chronicler's chapter* (event has been enriched via the round-trip
    through aftertale.gg) → unchanged. Polaroid card with prose, as
    before.
  - *Scribe's note* (event not yet enriched) → polaroid hidden,
    rendered on flat parchment with a violet `SCRIBE'S NOTE` kicker, a
    place/time header, a single sentence describing the deed, and a
    footer pointing at the Chronicler. **Clearly placeholder** — no
    longer shows the templated fallback prose that blurred the line
    between "I have notes" and "I have a chapter."
- **Better left-page previews when enrichment is missing.** Old fallback
  `"Accepted: a quest"` → new fallback `"Took on a task from a local
  hand"` (and similar per event type). The Scribe notes what happened
  without claiming to know its name.
- **Empty-state copy throughout the book** now reads in the Scribe's
  voice — *"I have nothing to note yet. Go play, hero..."* instead of
  the old utilitarian *"No chapters yet. Go play."*
- **Bible page** stops referring to the deprecated `/aftertale sync`
  EditBox flow; points at the `AftertaleRestore.lua` SavedVariables drop
  instead.

Deferred to follow-on PRs: first-run welcome + logout nudge + in-play
toasts (signals), slash-command consolidation, README + addon header
truth-up, Cinzel font shipping, broader violet accent rollout.

### Changed — Launch strategy: phased ladder, not coordinated launch *(2026-05-28)*

- **New doc: [`docs/LAUNCH-PLAN.md`](docs/LAUNCH-PLAN.md).** Replaces the
  original *"nothing ships until all five tiers are coordinated"* framing
  with a sequenced ladder (Friends & Strangers → Public free → Quill & Coin
  → Companion → Chronicler/Loremaster). Each phase has a load-bearing
  question, entry/exit gates, and an explicit kill criterion. The
  architecture in `companion-architecture.md` is unchanged — only the
  delivery sequencing is. `ROADMAP.md`'s strategic-constraint banner now
  points at the launch plan as the source of truth for *when* things ship.

### Added — Inkwell + Chronicle pipeline *(2026-05-27 evening)*

- **The Inkwell — authoring hub rebuild.** Renamed and relocated the
  Session Trail surface to **The Inkwell**, an authoring hub that pairs
  story-beat curation with chronicle publishing. New
  `storyBeats`/`storyBeatSettings`/`sessionHistory` data layer powers
  per-session arcs. Dead onboarding steps 2/3/4 ripped; loot floor is
  surfaced inline on the active session card.
- **Arc Map.** Per-session timeline scrubber with level-up markers,
  sticky-bottom dock, and ghost pills for upcoming/skipped beats.
- **Chronicle session-recap pipeline (Lane A canon).** End-of-session
  recap generation flows directly into Chronicle; manual-entry dialog
  picks up Loremaster polish (rich form, validation, scribe voice
  preview). Chronicle purge surfaces are wired across the app.
- **Multi-toon attribution.** Every captured event now carries the
  player GUID (`event.char`) and character name. The web importer
  splits incoming events into per-character buckets, prompts the user
  to confirm which character to import, and writes only the accepted
  GUIDs to the active bible. Fixes the "Garygidney's playtime is
  Futony's playtime" merge bug from shared SavedVariables.
- **Bound-character pill on the Inkwell header.** Shows the active
  bible's class / race / faction / level / zone; a Settings "rebind"
  affordance lets the player switch characters without nuking state.

### Fixed — Level / zone tracking on bulk import *(2026-05-27 night)*

> Symptom: Futony dings to 5, re-imports cleanly, and every level-aware
> surface still reads **Lvl 1**. Root cause was the same underlying bug
> wearing five hats — `UnitLevel("player")` returns stale (or
> teardown-state) values at the moments we were snapshotting it.

- **PLAYER\_LEVEL\_UP captured the OLD level.** The addon snap function
  reads `UnitLevel("player")` at handler-fire time, which returns the
  pre-ding level. Addon now overwrites `enrichment.level = args[1]`
  (the new level from the event payload) inside the PLAYER\_LEVEL\_UP
  branch. The web ingest applies the same correction defensively
  (`rawArgs[0]` wins over `enrichment.level` for this event type).
  See `addon/Aftertale/Aftertale.lua` and
  `src/lib/savedVariablesIngest.ts`.
- **Re-import was a no-op.** `commitImport` deduped against the global
  event-id store, so re-importing the same SV file after fixing the
  addon skipped every event and the corrected `playerLevel` never
  reached storage. Added `upsertAddonEventRecord` and rewrote
  `commitImport` to track `imported` vs `refreshed` counts; the import
  toast now surfaces both.
- **`commitImport` never patched the bible.** The live ingest path
  updated `bible.level` / `bible.currentZone`; bulk import didn't.
  `commitImport` now patches both from the freshest accepted event.
- **Session "Levels earned" card collapsed to `Lvl 1 → 1`.**
  `PLAYER_LOGOUT` can carry a stale `UnitLevel = 1` from logout
  teardown, and `sessionHistory.buildSession` was trusting that snapshot
  as `endLevel`. Now derives start/end from the chronological min/max of
  observed `playerLevel` across the bucket — level only goes up in WoW,
  so max is correct. Same logic applied to `commitImport`'s bible
  patch.
- **Character picker showed "level 1" forever.** The "Pick a character
  to onboard" card was reading `firstSeen.level`, which is locked at
  the moment Aftertale first loaded for that toon. `characterIngest`
  now synthesizes a `lastSeen` snapshot per character by scanning the
  events log (max observed level, latest non-empty zone). Buckets by
  both GUID and charName so manual SV edits / multi-account merges /
  upstream GUID drift can't silently collapse the picker back to the
  stale snapshot. When the addon eventually does start writing
  `lastSeen` natively, we merge field-by-field so a written stale
  value never overrides a derived max.

### Added — Security *(2026-05-27 evening)*

- **CSP headers, vulnerability disclosure, gitleaks pre-commit hook**
  (commit `2c73840`). See `SECURITY.md`.



> **Note (2026-05-26):** Per current strategic direction, nothing under this
> heading ships to users until the full multi-tier launch is coordinated
> (Free/BYOK + Companion + Chronicler + Loremaster). Entries below represent
> work landed in `main` and ready to be part of that launch — not features
> currently delivered to anyone.
>
> **Exception:** The marketing landing page at [aftertale.gg](https://aftertale.gg/)
> is publicly deployed (auto-built by Cloudflare Pages on push to `main`).
> The in-app POC was already public via the prior GitHub Pages deploy, so
> shipping a polished front door alongside it does not change which features
> are reachable to users — only how the surface is described.

Phase 0 (Browser POC) exit criteria all met as of May 25, 2026: character
interview produces distinct bibles, 5-turn NPC conversations stay in-voice
(Magni is the bar), and the spend bar is backed by ~80 real Flash calls
(~$0.10) from the May 24 sim session.

**Architecture locked (2026-05-26):** the canonical reference for the
multi-tier system (Free → Companion → Chronicler → Loremaster), Companion
daemon, pairing flow, OpenRouter LLM layer, and Supabase backend is
[`docs/companion-architecture.md`](docs/companion-architecture.md). The
prior "Phase 1 = standalone Electron app, Phase 2 = WoW addon" framing in
older docs is superseded by that document.

### Added

- **Auth — anonymous-by-default + "Save your chronicle"** *(2026-05-27)*.
  Wires Supabase Auth into the app shell (no cloud data sync yet — that's the
  next task). Every visitor is signed in anonymously on first app load
  (`signInAnonymously()`), giving the device a stable `auth.users.id` cached at
  `at.user_id`. A new top-right **account menu** (`AccountMenu`) shows the
  state: anonymous → "Save your chronicle" CTA + a "Sign in" link; email-backed
  → address + Sign out; loading → skeleton; unconfigured (no Supabase env, e.g.
  the current public build) → renders nothing. "Save your chronicle"
  (`SaveChronicleModal`) calls `updateUser({ email })` — a magic link that
  converts the *same* anonymous user into an email-backed account with no data
  migration (the id is unchanged). Returning users sign in via email magic link
  only (no passwords/OAuth in V1). New `/auth/callback` route
  (`AuthCallback` + `public/_redirects` SPA fallback) exchanges the PKCE code
  for a session and forwards to the roster. Client switched to `flowType:
  'pkce'` + manual code exchange. A client-side profile `upsert` backstops the
  `handle_new_user` trigger for anonymous sessions. Copy follows the
  preservation-not-gate framing and the "Hero's Truth" naming. See
  `docs/companion-architecture.md` §3.2 for the auth model + edge cases.
- **Supabase backend scaffold** *(2026-05-27)*. Initial schema migration
  (`supabase/migrations/20260527120000_initial_schema.sql`) for the multi-tier
  backend (companion-architecture.md §9): `profiles` (keyed on `auth.users.id`),
  `characters`, `bible`, `events`, `chapters`, `subscriptions`, `unlocks`,
  `companion_devices`, `pair_codes`. Hybrid modeling — locked identity fields
  are real columns, evolving shapes (bible/event/chapter bodies) are JSONB. RLS
  enabled on every table: ownership flows from `auth.uid()` (directly or via the
  `characters` FK chain); `subscriptions`/`unlocks` are client-read-only
  (service-role writes); `pair_codes` allows anon read of unconsumed codes with
  auth'd claim. Adds a profile-on-signup trigger and `updated_at` triggers.
  Local dev seed (`supabase/seed.sql`) with one dev user + character + bible for
  RLS smoke-testing. Browser client stub `src/lib/supabase.ts`
  (`getSupabase()` returns `null` when env is unset — current public build
  unaffected) behind `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`; placeholder
  `src/types/supabase.ts` to be regenerated via `supabase gen types`. Setup docs
  in `docs/supabase.md`. No app wiring yet — pure foundation.
- **Marketing landing page** at `aftertale.gg/` *(2026-05-27)*. Full
  `src/components/LandingPage.tsx` (~2200 lines incl. styles) ships at the
  root of the public site. Hero section ("Every hero deserves an
  Aftertale."), five-page Magnus Brunn exhibit (Hero / Truth / Voice /
  Backstory / Chapter) with horizontal scroll-snap + dot nav + keyboard
  control, "From signup to first chapter" onboarding section with
  five activation cards + anxiety-killer reassurance line, supported-games
  compact pill strip (Retail / Classic / Hardcore / SoD / Cataclysm /
  Mists, each color-coded), magic-moment phone mockup section, how-it-works
  steady-state loop, features grid, pricing tiers (reused from in-app
  ScribesDesk), expandable FAQ, footer with Blizzard trademark disclaimer.
  Reveal-on-scroll animations honoring `prefers-reduced-motion`.
- **Aftertale wordmark logo** *(2026-05-27)*. AI-generated gold wordmark
  with the book + compass + stars sigil. Processed (alpha-keyed off
  light background, auto-cropped to content bbox) and saved as
  `public/aftertale-logo.png`. Used in landing-page header (44px) and
  footer (36px, slightly dimmed).
- **Magnus Brunn portrait** *(2026-05-27)*. AI-rendered full hero card with
  embedded purple frame, "HERO · SAGA IN PROGRESS" eyebrow, Magnus holding
  Calder's hammer (sun-sigil engraved), Forgelight halo behind him, and
  "FORGESWORN · IRON-BOUND · MID-SAGA" footer stamp. Saved as
  `public/magnus-card.jpg` (900×1200, q86 progressive, ~205 KB). Replaces
  the procedural `<HeroSigil>` SVG on the IdentityPanel.
- **Favicon set** *(2026-05-27)*. Sigil extracted from the high-res
  wordmark, generated at 16 / 32 / 48 / 180 / 192 / 512 px plus
  multi-resolution `favicon.ico`. Wired into `index.html` with
  `theme-color: #1a0e2e` and a `description` meta tag.
- **"The Hero's Truth" surface naming** *(2026-05-27)*. The `coreQuote`
  bible field is now labeled "The Hero's Truth" across the marketing page,
  in-app character sheet (new section header), editor field, AI bible
  preview, and LLM prompt context ("Hero's truth: …"). Underlying
  `coreQuote` data field unchanged to avoid storage migration risk.

### Changed

- **Renamed Chronicles of Azeroth → Aftertale** *(2026-05-26 → 2026-05-27)*.
  Full rebrand in four phases:
  - **Phase 1 — marketing copy:** README, all docs, in-app `<h1>`s, page
    titles, pitch decks, prologue copy.
  - **Phase 2 — code identifiers:** `coa.*` localStorage keys → `at.*`
    with a one-time migration helper that runs from `main.tsx` on app
    boot (preserves user data). `coa:` custom events → `at:`. CSS classes
    `.coa-*` → `.at-*` (323+ instances across `index.css`).
  - **Phase 3 — WoW addon:** folder `addon/ChroniclesOfAzeroth/` →
    `addon/Aftertale/`, six `.toc` files renamed, Lua globals
    (`AftertaleDB` / `AftertaleCompanion` / `AftertaleRestore`), slash
    command `/aftertale` (alias `/at`), chat-frame tag `[Chronicles]` →
    `[Aftertale]`, addon-message wire prefix `"COA"` → `"AT"`.
  - **Phase 4 — package metadata:** `package.json` name → `aftertale`,
    lockfile regenerated.
- **GitHub org transfer** *(2026-05-26)*. Repo moved from
  `snoblitz/Aftertale` to `Aftertale-App/Aftertale` (dedicated org for
  the product). Updated remote URL + all in-code references.
- **Cloudflare Pages migration** *(2026-05-26)*. Replaced GitHub Pages with
  Cloudflare Pages. Domain `aftertale.gg` purchased at GoDaddy and DNS
  migrated to Cloudflare (`hope.ns` + `jaxson.ns` nameservers). Pages
  project connected to GitHub repo — push to `main` auto-deploys; branches
  get `<branch>.aftertale.pages.dev` preview URLs. Custom domains
  `aftertale.gg` + `www.aftertale.gg` both attached. Deleted
  `.github/workflows/deploy.yml`. Env var `COA_BASE` → `AT_BASE`, defaults
  to `/` for apex hosting. Updated OpenRouter `HTTP-Referer` header,
  addon `webAppUrl`, all doc links.
- **Hero copy refinement** *(2026-05-27)*. Landing-page H1 "Become the
  legend you played." → **"Every hero deserves an Aftertale."** Subhead
  updated to lean fully into the personalized-novel framing.
- **Magnus's identity polished** *(2026-05-27)*. Page-1 "From" / "Carries"
  / "Vow" / "Chapter" stats rewritten with more evocative prose. Page-2
  "The Hero's Truth" panel gains a gold-bordered gloss block with an
  italic coda. Page-3 voice transcript replaced the stoic "Stone's not
  afraid. Stone holds." with a more revealing "Course I was. / That's
  the part people keep giving prettier names." exchange. Page-4 backstory
  beats rewritten with sharper specifics ("clean boots", "stands in the
  gap"). Page-5 chapter expanded ~140 words; new structure paces the
  battle, the Forgelight rising, and the closing "No, not alone." exchange
  with the reeve.
- **Scribe's Desk page** *(2026-05-26)*. Split `ChronicleReader.tsx` into
  pure-reader + new `/Scribe's Desk` tab. The desk owns the manual workflow:
  Import SV → Filter events → Enrich → Download `.lua` restore snippet — laid
  out as a 4-step linear stepper. Reader is now purely about reading
  (chapters, recaps, insights, session trail) — no import or export controls.
  Extracted `EventFilterPanel` into its own component file. Added a
  `featureFlags.ts` module with `getShowScribesDesk()` / `setShowScribesDesk()`
  for power-user toggling (default visible pre-launch; post-launch it flips
  to default-hidden for paid tiers where the daemon does this automatically).
  Settings panel gained an "Advanced" section with the toggle. New tab
  request `at:request-tab` accepts `'desk'`. Reader's empty state now
  routes the user to the desk. `ChronicleReader.tsx` shrank from 1327 to
  759 lines.
- **LLM layer is now OpenRouter-only** *(2026-05-26)*. Removed the direct
  `GeminiProvider` and `AnthropicProvider` and their SDK dependencies
  (`@google/genai`, `@anthropic-ai/sdk`). Removed all `gemini-*` and
  `claude-*` pricing entries from `src/pricing.ts`. `ProviderId` narrowed
  to `'openrouter'`, `Provider` (apiKeys.ts) narrowed to `'openrouter'`,
  SettingsPanel simplified to a single key field. Default model is now
  `openrouter/anthropic/claude-sonnet-4.5` (best-in-class for long-form
  narrative). Bundle dropped from 128 to 92 modules, shipped JS down
  ~355 KB raw / ~75 KB gzipped (no more SDK weight — OpenRouter is fetch
  only). One key, every model. See `docs/companion-architecture.md` §8a.

### Added

- **OpenRouter provider** *(2026-05-26)*. New `src/providers/OpenRouterProvider.ts`
  using OpenRouter's OpenAI-compatible API (plain fetch, no SDK — 2.6 KB
  shipped). Five curated models wired into the picker:
  Claude Sonnet 4.5, Claude Opus 4.5, GPT-5, Gemini 2.5 Pro, Gemini 2.5 Flash.
  Settings panel now lists OpenRouter first as the recommended path —
  one key, every model. Pricing rows mirror the underlying provider's
  per-token rate (OpenRouter passes through). Carries the strategic-default
  decision from `docs/companion-architecture.md` §8a into actual code,
  unblocking BYOK simplification and per-tier managed-key paths without
  committing to user-facing UX yet. Direct Gemini + Anthropic providers
  remain wired and functional for A/B comparison.
- **`.lua` restore snippet — kills the lossy blob format** *(2026-05-26)*.
  CompanionExport gains a "⬇ Download .lua restore" button that produces a
  self-contained `AftertaleRestore.lua` file. User drops it into
  `WTF\Account\<ACCT>\SavedVariables\`, relaunches WoW, and the new
  `addon/Aftertale/Companion/Restore.lua` module merges full
  events + enrichments + bible into `AftertaleDB` on `PLAYER_LOGIN`.
  Carries the entire `enrichment` subtable per event (`zoneText`, `questTitle`,
  `npc.name`, `encounterName`, `loot[]`) so chapter grouping and entry titles
  render correctly — the at-CHRONICLE-V1 blob was dropping all of that and
  leaving the book stuck on "Unknown Lands" / "Accepted: a quest". Also
  bypasses the 471 KB EditBox bottleneck. Snippet uses auto-leveled Lua
  long brackets so any LLM-generated content (including `]==]` tokens or
  trailing `]`) round-trips byte-for-byte; smoke-tested against a real Lua
  interpreter. Old `/aftertale sync` blob path retained as fallback.
- **LOOT_OPENED enrichment with quality gating** *(2026-05-26)*. LOOT events
  are now narrative when at least one item meets the quality floor (default
  Uncommon+). New `T.LOOT_OPENED` template pool + `ResolveLoot` /
  `IsNarrativeEntry` helpers in `Lore/Templates.lua`. Web companion extracts
  `enrichment.loot[]` into the `AddonEvent`, passes named items + quality
  labels into the enrichment prompt, and exposes a quality `<select>` in the
  filter panel (persisted alongside the event toggles).
- **Per-event-type filter in CompanionExport** *(2026-05-26)*. Category-grouped
  checkbox panel above the enrich controls, defaulting to the 8 narrative
  events the parchment book actually renders. Persists globally to
  `localStorage` (`at.enrichFilter.v1`). Per-import counts shown beside each
  event name so cost is visible before kicking off a run. Closes the
  ~95%-waste finding from the May 25 stress test.
- **`ENCOUNTER_END` + `BOSS_KILL` are now narrative events.** Added template
  pools, `Preview` cases, and `ResolveEncounter` helper in
  `addon/.../Lore/Templates.lua`. The parchment book now renders boss kills
  instead of dropping them.

### Changed

- **Roadmap trim.** Dropped the A/B comparison view + its exit criterion,
  dropped the "more NPCs (Brann/Falstad/Moira)" backlog, and folded the
  manual-event-entry item into the Addon Simulator (which already provides
  that ingest path). Lowered the 100-call spend-bar threshold to "real
  sustained usage" — the May 24 session covers it.

### Added

- **Character creation interview** — multi-step (Identity → Interview →
  Review → Save) with a `loremaster` LLM persona that probes for voice,
  beliefs, motivations, fears, and flaws. Generates a complete
  `CharacterBible` JSON.
- **Multi-character storage.** Roster index at `at.bible.roster.v1` plus
  one envelope per hero at `at.bible.entry.<characterKey>`. Old
  `at.bible.current` is migrated on load (idempotent).
- **CharacterSelector** dropdown in the header — switch active hero,
  shows race/class/faction at a glance, save indicator.
- **Full character sheet view** replacing the old minimal banner:
  portrait monogram with faction-tinted glow, name in Cinzel display
  font, race/class/faction/homeland/age line, voice block, paragraph-split
  backstory, beliefs + motivations columns, fears + flaws columns with
  distinct accents, raw JSON details, action footer (Talk to NPCs, Edit,
  Roll another).
- **Core quote** field (gold-framed banner under the sheet header).
- **Fears + flaws** fields (validated, edit-form, NPC prompt injection).
- **Level + currentZone + chronicle history** — dynamic in-world state.
  Header pills, ReviewView edit fields, quick-add chronicle textarea
  with `Cmd/Ctrl+Enter` shortcut, entries list with relative timestamps
  and per-entry level/zone chips, hover-to-delete. Each entry snapshots
  the hero's current level + zone at write time.
- **NPC chat screen** with portrait header card grid, hero-assist drafts
  ("draft a reply in my voice"), and per-character × per-NPC transcript
  persistence (`at.npcChat.thread.<characterKey>.<npcId>`).
- **Magni Bronzebeard** as the first art-assetted NPC (portrait shipped at
  `public/npcs/magni-bronzebeard.png`).
- **NPC system prompt** injects voice, beliefs, motivations, fears, flaws,
  core quote, current level, current zone, and the last 5 chronicled deeds.
  Hero-assist prompt gets the last 3.
- **Reusable `ModelPicker` component** extracted from `SmokeTest`.
- **Inline bible editor.** "Edit bible" on the sheet flips ReviewView into
  editing mode (Save changes / Cancel buttons), exposing Name + Homeland +
  Level + Current zone alongside the existing backstory/beliefs/motivations
  fields, plus textareas for fears + flaws and an input for core quote.
- **Cross-tab navigation** via `at:request-tab` custom event — sheet's
  "Talk to NPCs" button hops to the Tavern tab without prop drilling.
- **`appendHistoryEntry`, `deleteHistoryEntry`, `updateActiveBible`**
  helper APIs in `bibleStore`, all firing `at:bible-updated` so the UI
  auto-refreshes.
- **In-app API key entry** (`SettingsPanel` + `apiKeyStore`). Keys live
  in localStorage and override anything baked in at build time. Opens
  automatically on first run when no keys are present.
- **GitHub Pages deployment** via `.github/workflows/deploy.yml`. Vite
  `base` is read from `COA_BASE` env so local dev stays at `/` and CI
  builds to `/Aftertale/`. Workflow copies `dist/index.html`
  to `dist/404.html` so deep-links survive Pages' SPA-less routing.
- **`assetUrl()` helper** so portrait paths in `public/` resolve correctly
  under both local dev (`/`) and project Pages (`/Aftertale/`).
- **`src/vite-env.d.ts`** with `/// <reference types="vite/client" />`
  so `import.meta.env` and CSS imports type-check under `tsc -b`.
- **Magnus seed backfill.** One-time migration patches the hand-written
  Magnus bible with the fears/flaws/coreQuote Jeff dictated, gated on
  `at.migrations.fears-flaws-quote.v1`.
- **Preset characters registry** (`src/lib/presetCharacters.ts`) — ships
  fully-formed bibles inside the bundle so a brand-new visitor can pick a
  ready-made hero (currently: Magnus Brunn) instead of being forced through
  the interview.
- **Welcome screen** — new `'welcome'` step in `CharacterCreation` that
  shows preset cards + a "Roll a new hero" button. Auto-shown when the
  roster is empty; also reachable from the existing-bible banner via "Roll
  another hero" (with a back button to your active hero). Preset loads are
  non-destructive: if you already have that hero's `createdAt` key in your
  roster, we just re-activate it instead of overwriting edits.
- **Addon Simulator tab** (`src/components/AddonSimulator.tsx`,
  `src/lib/addonEvents.ts`, `addonEventStore.ts`, `addonIngest.ts`,
  `classicQuestFixtures.ts`) — Phase 0.75 bridge between the browser POC
  and the future WoW addon. Emits normalized events shaped around real
  addon hooks (`QUEST_DETAIL`, `QUEST_ACCEPTED`, `QUEST_TURNED_IN`,
  `GOSSIP_SHOW`, `ZONE_CHANGED_NEW_AREA`, `COMBAT_LOG_EVENT_UNFILTERED`),
  records raw events in localStorage, and ingests them into the active
  bible's level / zone / chronicle history. Ships with ~650 lines of
  Classic quest-chain fixtures (IDs, NPCs, Wowhead links, authored story
  cards — no copied quest prose).
- **Chronicle Reader tab** (`src/components/ChronicleReader.tsx`) — first-class
  story-reader view. Latest-session vs full-saga modes, "so what" insight
  cards, chapter timeline, model-generated campfire recaps using the
  selected provider.
- **WoW session trail** (`src/lib/sessionHistory.ts`) — groups addon events
  into discrete play sessions with per-session stats (XP, kills, quests,
  zones, deaths), expandable event history, and elevated recap UI in
  Chronicle Reader.
- **Mobile-responsive top tabs** — top-bar collapses gracefully on narrow
  viewports so the live Pages site is usable from a phone.

### Removed

- **Smoke Test tab** retired (`src/components/SmokeTest.tsx`,
  Smoke Test pricing strategy text). The Addon Simulator is now the
  primary dev harness for poking at providers without disturbing real
  character data.

### Fixed

- **`@google/genai 0.3.1` silently dropped `thinkingConfig`.** Upgraded
  to 2.6.0 — thinking is now actually disabled, costs are accurate.
- **NPC reply truncation.** `maxOutputTokens` raised to 2048 on the NPC
  assist call. Error messages now surface billed tokens vs visible word
  count when truncation does happen.
- **`storage` event scope.** Native `storage` only fires on OTHER tabs.
  Added `at:usage-updated`, `at:bible-updated`, and `at:apikey-updated`
  custom events for same-tab refresh.
- **Underreported Gemini cost.** `outputTokens` now includes
  `thoughtsTokenCount` (Google bills thinking at the output rate).
- **Cache-aware Anthropic costing** uses `cache_read_input_tokens` (typed
  via a local interface since older SDK typings lack it).
- **Vite HMR cache wedge.** Documented in `docs/DEVELOPMENT.md`: deleting
  `node_modules/.vite` fixes empty served CSS after many rapid edits.

### Changed

- **Gemini models pinned** from `gemini-flash-latest` /
  `gemini-pro-latest` to `gemini-2.5-flash` / `gemini-2.5-pro`. The
  `*-latest` aliases point to Gemini 3.x models which have **mandatory
  thinking** that silently ignores `thinkingBudget: 0` and burns 1000+
  extra output tokens per call.
- **Default `maxOutputTokens`** raised from 200 → 2048.
- **Dev server port** pinned to **5180** (`strictPort: true`) to avoid
  colliding with sand-miner on 5173.
- **Vite `base`** now derived from `COA_BASE` env (default `/`).
- **Provider error messages** now point at the in-app Keys panel as
  well as `.env.local`.

### Project meta

- Renamed from "Azeroth Chronicle" to **Aftertale**.
- Repo: <https://github.com/Aftertale-App/Aftertale>.
- Live demo: <https://aftertale.gg/>.

---

## Lessons learned (running log)

These are sharp edges discovered during Phase 0 that future-us shouldn't
have to rediscover.

1. **Gemini's pricing page and API model IDs don't match.** Always verify
   model availability with a REST `models?key=...` call.
2. **Newer Gemini Flash models have mandatory thinking.** Even with
   `thinkingConfig: { thinkingBudget: 0 }`, `gemini-flash-latest` (→ 3.5
   Flash) burns ~1234 tokens of silent thinking. Pin to `gemini-2.5-flash`.
3. **Google bills thinking tokens at the output rate.** Cost tracking must
   include `usageMetadata.thoughtsTokenCount` or you'll under-report.
4. **`window.storage` only fires on OTHER tabs.** For same-tab refresh of
   localStorage-backed UI, dispatch a CustomEvent.
5. **`npm create vite@latest` hangs in some PowerShell environments** on
   interactive TTY prompts. Workaround: scaffold by hand.
6. **Anthropic SDK in the browser** needs `dangerouslyAllowBrowser: true`.
   Acceptable for local-only Phase 0; Phase 1 must proxy via Electron main.
7. **`@google/genai` < 2.x silently drops `thinkingConfig`.** Upgrade
   pins to 2.6.0 or you'll think thinking is disabled when it isn't.
8. **Vite HMR cache can wedge** after many rapid edits — symptom is a
   served CSS file containing literally `const __vite__css = ""`.
   Fix: stop Vite, `Remove-Item -Recurse -Force node_modules/.vite`,
   restart. Verify with `(Invoke-WebRequest http://localhost:5180/src/index.css?direct).Content.Length`.
9. **`tsc -b` is stricter than `tsc --noEmit`.** The build mode picks up
   `tsconfig.app.json` with `noUnusedLocals` etc.; the bare noEmit ran
   the root tsconfig. Always run `npm run build` before pushing.
10. **`import.meta.env` and CSS imports** need `src/vite-env.d.ts` with
    `/// <reference types="vite/client" />` or `tsc -b` will fail.
11. **JSX literal `\u2022`** renders as the literal escape string, not a
    bullet. Use the actual unicode character directly.
12. **PowerShell commit messages eat backticks.** Always write the commit
    message to a file in `.git/COMMIT_MSG_*.txt` then
    `git commit -F <file>`.
13. **GitHub Pages on project sites serve from `/<repo-name>/`.** Vite's
    `base` must match, or the bundle 404s. Set `COA_BASE=/Aftertale/`
    only in CI so local dev stays at `/`.
14. **`public/` assets ignore `base` at write time.** Anything stored as
    a hardcoded `/path` string in JS/JSON (like NPC portrait URLs) must
    be wrapped in `assetUrl()` to survive Pages deployment.
