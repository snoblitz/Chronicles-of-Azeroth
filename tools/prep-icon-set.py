#!/usr/bin/env python3
# tools/prep-icon-set.py
#
# Two pipelines, picked by what's actually present in addon/Aftertale/Art/:
#
# A) Iconsheet pipeline (preferred). Looks for iconsheet.png — a single
#    4-column x 3-row grid of pre-illustrated icons on a transparent
#    background. Splits the grid, crops each cell to the icon's actual
#    bounding box, centers it on a 1024^2 transparent canvas, renames to
#    descriptive paths under icons/.
#
# B) Numbered-files pipeline (legacy). Looks for 1.png..13.png — individual
#    AI generations on a chroma-key background. Removes the magenta with
#    spill suppression, resizes to power-of-two, renames + relocates.
#
# Mirrors the frame/book/sigil into public/ for the web side either way.
#
# Run once after you push a new icon source.

from __future__ import annotations
import shutil
from pathlib import Path
from PIL import Image

ROOT     = Path(__file__).resolve().parent.parent
ART_DIR  = ROOT / "addon" / "Aftertale" / "Art"
ICON_DIR = ART_DIR / "icons"
PUBLIC   = ROOT / "public"
ICON_DIR.mkdir(parents=True, exist_ok=True)

# Iconsheet grid layout: 4 columns x 3 rows, position -> (filename, row, col).
SHEET = ART_DIR / "iconsheet.png"
SHEET_GRID = (4, 3)   # cols, rows
SHEET_TARGET_SIZE = 1024   # output canvas (POT for Classic compatibility)
SHEET_SUBJECT_FRAC = 0.80  # icon takes up this fraction of the output canvas

SHEET_MAP = [
    # (col, row, dest_rel_path)
    (0, 0, "icons/quests.png"),
    (1, 0, "icons/level.png"),
    (2, 0, "icons/discoveries.png"),
    (3, 0, "icons/feats.png"),
    (0, 1, "icons/moments.png"),
    (1, 1, "icons/time.png"),
    (2, 1, "icons/zones.png"),
    (3, 1, "icons/dungeons.png"),
    (0, 2, "icons/death.png"),
    (1, 2, "icons/items.png"),
    (2, 2, "icons/chronicle.png"),
    (3, 2, "icons/settings.png"),
]

# Numbered-files pipeline (kept for when we go back to individual AI gens).
NUMBERED_JOBS = [
    ("1.png",  "frame/aftertale-9slice-frame.png", (255, 0, 255), 36, 1024),
    ("2.png",  "sigil-header.png",                  (255, 0, 255), 36, 1024),
    ("3.png",  "icons/moments.png",                 (255, 255, 255), 24, 1024),
    ("4.png",  "icons/time.png",                    (255, 0, 255), 36, 1024),
    ("5.png",  "icons/zones.png",                   (255, 0, 255), 36, 1024),
    ("6.png",  "icons/quests.png",                  (255, 0, 255), 36, 1024),
    ("7.png",  "icons/feats.png",                   (255, 0, 255), 36, 1024),
    ("8.png",  "icons/dungeons.png",                (255, 0, 255), 36, 1024),
    ("9.png",  "icons/character.png",               (255, 0, 255), 36, 1024),
    ("10.png", "icons/level.png",                   (255, 0, 255), 36, 1024),
    ("11.png", "icons/death.png",                   (255, 0, 255), 36, 1024),
    ("12.png", "icons/items.png",                   (255, 0, 255), 36, 1024),
    ("13.png", "book.png",                          None,            0, 1024),
]


def chroma_key(img: Image.Image, target: tuple[int, int, int], tol: int) -> Image.Image:
    """Hue-aware magenta key with spill suppression (or per-channel for white).

    For magenta (the AI chroma): pixels with strong red+blue and low green are
    scored by "deficit" = min(R,B) - G. Strong deficit -> fully transparent;
    moderate deficit (soft pink halo at edges) -> partial alpha + green lifted
    to neutralize the pink tint.

    For other key colours: plain per-channel tolerance."""
    img = img.convert("RGBA")
    px = img.load()
    w, h = img.size

    if target == (255, 0, 255):
        SOFT, HARD = 30, 150
        for y in range(h):
            for x in range(w):
                r, g, b, a = px[x, y]
                if r < 100 or b < 100:
                    continue
                mn = min(r, b)
                if g >= mn:
                    continue
                deficit = mn - g
                if deficit <= SOFT:
                    continue
                if deficit >= HARD:
                    px[x, y] = (r, g, b, 0)
                else:
                    t = (deficit - SOFT) / (HARD - SOFT)
                    alpha = int(255 * (1 - t))
                    px[x, y] = (r, mn, b, alpha)
        return img

    tr, tg, tb = target
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if (abs(r - tr) <= tol and
                abs(g - tg) <= tol and
                abs(b - tb) <= tol):
                px[x, y] = (r, g, b, 0)
    return img


def fit_square_pot(img: Image.Image, size: int) -> Image.Image:
    """Resize into a `size x size` square centered on a transparent canvas."""
    iw, ih = img.size
    scale = size / max(iw, ih)
    nw, nh = int(round(iw * scale)), int(round(ih * scale))
    resized = img.resize((nw, nh), Image.LANCZOS)
    if (nw, nh) == (size, size):
        return resized
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    canvas.paste(resized, ((size - nw) // 2, (size - nh) // 2), resized)
    return canvas


def main_subject_bbox(img: Image.Image, proximity: int = 40, alpha_thresh: int = 32):
    """Bbox of the largest connected mass of opaque pixels, plus any smaller
    blobs whose bbox is within `proximity` pixels of the LARGEST blob's bbox.

    Two rules keep accent details (Moments' corner diamonds) while discarding
    bleed from neighboring grid cells:

    1. Proximity is measured against the ORIGINAL largest blob's bbox, not the
       expanding merged bbox. This prevents the merged bbox from snowballing
       outward to swallow distant orphan content.
    2. Any blob other than the largest that TOUCHES a cell edge is treated as
       bleed-over from the neighboring cell and discarded. The main subject is
       allowed to touch edges (some intentionally do); accent details don't.

    Returns (left, top, right, bottom) or None if the image is empty."""
    alpha = img.convert("RGBA").getchannel("A")
    w, h = alpha.size
    px = alpha.load()
    visited = bytearray(w * h)

    blobs = []  # (size, min_x, max_x, min_y, max_y)
    for sy in range(h):
        row = sy * w
        for sx in range(w):
            if visited[row + sx] or px[sx, sy] < alpha_thresh:
                continue
            stack = [(sx, sy)]
            min_x = max_x = sx
            min_y = max_y = sy
            size = 0
            while stack:
                x, y = stack.pop()
                if x < 0 or x >= w or y < 0 or y >= h:
                    continue
                idx = y * w + x
                if visited[idx] or px[x, y] < alpha_thresh:
                    continue
                visited[idx] = 1
                size += 1
                if x < min_x: min_x = x
                if x > max_x: max_x = x
                if y < min_y: min_y = y
                if y > max_y: max_y = y
                stack.append((x + 1, y))
                stack.append((x - 1, y))
                stack.append((x, y + 1))
                stack.append((x, y - 1))
            blobs.append((size, min_x, max_x, min_y, max_y))

    if not blobs:
        return None

    blobs.sort(key=lambda b: -b[0])
    main_size, main_min_x, main_max_x, main_min_y, main_max_y = blobs[0]

    # Initial merged bbox is the main blob; expand only with qualifying blobs.
    merged_min_x, merged_max_x = main_min_x, main_max_x
    merged_min_y, merged_max_y = main_min_y, main_max_y

    for size, bx0, bx1, by0, by1 in blobs[1:]:
        # Rule 2: drop any non-main blob touching a cell edge (bleed signature).
        if bx0 == 0 or by0 == 0 or bx1 == w - 1 or by1 == h - 1:
            continue
        # Rule 1: proximity against the ORIGINAL main bbox.
        dx = max(0, max(bx0 - main_max_x, main_min_x - bx1))
        dy = max(0, max(by0 - main_max_y, main_min_y - by1))
        if dx <= proximity and dy <= proximity:
            merged_min_x = min(merged_min_x, bx0)
            merged_max_x = max(merged_max_x, bx1)
            merged_min_y = min(merged_min_y, by0)
            merged_max_y = max(merged_max_y, by1)

    return (merged_min_x, merged_min_y, merged_max_x + 1, merged_max_y + 1)


def process_iconsheet() -> list[Path]:
    """Split the 4x3 iconsheet into 12 isolated icons, each centered on a
    1024^2 transparent canvas at SHEET_SUBJECT_FRAC of the canvas size."""
    sheet = Image.open(SHEET).convert("RGBA")
    sw, sh = sheet.size
    cols, rows = SHEET_GRID
    cw, ch = sw // cols, sh // rows

    print(f"  sheet : {sw}x{sh} ({cols}x{rows} grid, {cw}x{ch} per cell)")

    produced = []
    target_subject = int(SHEET_TARGET_SIZE * SHEET_SUBJECT_FRAC)

    for col, row, dest_rel in SHEET_MAP:
        cell = sheet.crop((col * cw, row * ch, (col + 1) * cw, (row + 1) * ch))
        bbox = main_subject_bbox(cell)
        if not bbox:
            print(f"  WARN ({col},{row}) -> {dest_rel}: cell is fully transparent, skipping")
            continue
        # Pad bbox slightly so the violet glow (when applied) has room to fade.
        # 4% of cell width on each side is enough breathing room without
        # leaving too much dead space when the icon is centered.
        pad = max(cw, ch) // 25
        left, top, right, bottom = bbox
        left   = max(0,  left   - pad)
        top    = max(0,  top    - pad)
        right  = min(cw, right  + pad)
        bottom = min(ch, bottom + pad)
        icon = cell.crop((left, top, right, bottom))

        # Scale so the longer side fits `target_subject`, then center on the
        # full 1024^2 transparent canvas.
        iw, ih = icon.size
        scale = target_subject / max(iw, ih)
        nw, nh = int(round(iw * scale)), int(round(ih * scale))
        scaled = icon.resize((nw, nh), Image.LANCZOS)

        canvas = Image.new("RGBA", (SHEET_TARGET_SIZE, SHEET_TARGET_SIZE), (0, 0, 0, 0))
        canvas.paste(scaled,
                     ((SHEET_TARGET_SIZE - nw) // 2,
                      (SHEET_TARGET_SIZE - nh) // 2),
                     scaled)

        dst = ART_DIR / dest_rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        canvas.save(dst, "PNG", optimize=True)
        print(f"  ({col},{row}) -> {dest_rel}")
        produced.append(dst)

    return produced


def process_numbered() -> list[Path]:
    """Legacy individual-generation pipeline (kept for future use)."""
    produced = []
    for src_name, dst_rel, key, tol, target_size in NUMBERED_JOBS:
        src = ART_DIR / src_name
        if not src.exists():
            continue
        dst = ART_DIR / dst_rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        print(f"  {src_name:7s} -> {dst_rel}")
        img = Image.open(src)
        if key is not None:
            img = chroma_key(img, key, tol)
        else:
            img = img.convert("RGBA")
        img = fit_square_pot(img, target_size)
        img.save(dst, "PNG", optimize=True)
        produced.append(dst)
    return produced


def main() -> int:
    print(f"\n  source : {ART_DIR}")
    print(f"  output : {ART_DIR}\n")

    produced = []
    if SHEET.exists():
        print("  pipeline: iconsheet\n")
        produced.extend(process_iconsheet())
    if any((ART_DIR / f"{n}.png").exists() for n in range(1, 14)):
        print("\n  pipeline: numbered\n")
        produced.extend(process_numbered())

    # Mirror web-facing assets into public/ if they exist.
    print()
    pairs = [
        (ART_DIR / "frame" / "aftertale-9slice-frame.png",
         PUBLIC  / "frame" / "aftertale-9slice-frame.png"),
        (ART_DIR / "book.png",         PUBLIC / "book.png"),
        (ART_DIR / "sigil-header.png", PUBLIC / "sigil-header.png"),
    ]
    for src, dst in pairs:
        if src.exists():
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(src, dst)
            print(f"  mirrored -> {dst.relative_to(ROOT)}")

    # Clean up numbered originals if the iconsheet pipeline was used (or
    # numbered pipeline produced them). The iconsheet itself is kept since
    # we may want to regenerate from it.
    print()
    for n in range(1, 14):
        f = ART_DIR / f"{n}.png"
        if f.exists():
            f.unlink()
            print(f"  removed   {f.relative_to(ROOT)}")

    print(f"\n  done. {len(produced)} assets produced.\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

