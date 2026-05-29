#!/usr/bin/env python3
# tools/measure-frame-slice.py
#
# Auto-tunes the 9-slice values for the brand frame asset.
#
# How it works: scans inward from each corner of the PNG looking for the first
# "gold" pixel (high R, high G, low B). That pixel's distance from the corner
# is roughly where the star sigil's outer edge begins. We add a small margin
# and round up to a multiple of 8 so the slice fully contains the corner
# ornament with a little breathing room — that becomes the slice value.
#
# Reports the value to use in:
#   - addon/Aftertale/UI/Style.lua (normalized SC / LC constants)
#   - src/index.css (`border-image-slice` pixel value)
#
# Usage:
#   python3 tools/measure-frame-slice.py [path/to/frame.png]
#
# Defaults to public/frame/aftertale-9slice-frame.png when no path is given.

from __future__ import annotations
import sys
from pathlib import Path
from PIL import Image

DEFAULT_PATH = Path("public/frame/aftertale-9slice-frame.png")

# A pixel is "gold" if it's bright and warm (high red+green, lower blue).
def is_gold(rgb: tuple[int, int, int]) -> bool:
    r, g, b = rgb[0], rgb[1], rgb[2]
    if r < 140 or g < 100:
        return False
    if b > r - 30:  # too blue, probably a violet-tinted pixel
        return False
    return True

def scan_from_corner(img: Image.Image, corner: str) -> tuple[int, int]:
    """Walk diagonally from a corner toward center; return (dx, dy) where the
    first gold pixel lives. corner ∈ {tl, tr, bl, br}."""
    w, h = img.size
    px = img.load()
    # Walk along the diagonal a step at a time.
    max_steps = min(w, h) // 2
    for step in range(1, max_steps):
        if corner == "tl":
            x, y = step, step
        elif corner == "tr":
            x, y = w - 1 - step, step
        elif corner == "bl":
            x, y = step, h - 1 - step
        elif corner == "br":
            x, y = w - 1 - step, h - 1 - step
        else:
            raise ValueError(corner)
        pixel = px[x, y]
        if isinstance(pixel, int):  # palette mode
            pixel = img.convert("RGB").load()[x, y]
        if is_gold(pixel[:3]):
            # dx, dy = distance from the corner
            if corner == "tl":
                return step, step
            if corner == "tr":
                return w - 1 - x, y
            if corner == "bl":
                return x, h - 1 - y
            if corner == "br":
                return w - 1 - x, h - 1 - y
    return -1, -1

def main() -> int:
    path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_PATH
    if not path.is_file():
        print(f"× {path} not found")
        return 1

    img = Image.open(path).convert("RGB")
    w, h = img.size
    print(f"\n  source : {path}")
    print(f"  size   : {w} × {h} px")

    # Scan all four corners.
    hits = {c: scan_from_corner(img, c) for c in ("tl", "tr", "bl", "br")}
    for c, (dx, dy) in hits.items():
        print(f"  {c}     : gold first seen at +{dx},+{dy} from the corner")

    # The slice has to contain the *whole* star, not just the outer pixel.
    # Walk past the star ornament from the diagonal outward to find the far
    # edge — i.e. where gold pixels stop appearing for a while as we cross
    # into the long edge band.
    px = img.load()
    def find_star_outer(corner: str) -> int:
        """Returns the slice value that fully contains the corner star."""
        dx, dy = hits[corner]
        if dx < 0:
            return 64  # fallback if scan failed
        # March diagonally inward from the first gold pixel, looking for the
        # last gold pixel we cross before re-entering violet.
        last_gold = max(dx, dy)
        gap = 0
        max_steps = min(w, h) // 2
        for step in range(last_gold + 1, max_steps):
            if corner == "tl":   x, y = step, step
            elif corner == "tr": x, y = w - 1 - step, step
            elif corner == "bl": x, y = step, h - 1 - step
            else:                x, y = w - 1 - step, h - 1 - step
            if is_gold(px[x, y][:3]):
                last_gold = step
                gap = 0
            else:
                gap += 1
                if gap > 20:  # confidently out of the star
                    break
        return last_gold

    outers = {c: find_star_outer(c) for c in hits}
    for c, v in outers.items():
        print(f"  {c}-out : star ends ~{v}px from corner")

    # Use the largest of the four (frames may not be perfectly symmetric) and
    # add a small margin, then round up to a multiple of 8.
    raw = max(outers.values())
    margin = 8
    slice_px = ((raw + margin + 7) // 8) * 8
    print(f"\n  raw max: {raw}px  (+{margin}px margin)  ->  slice = {slice_px}px")

    # Lua normalized coords.
    sc = slice_px / w
    lc = (w - slice_px) / w
    print(f"\n  ---- Lua (UI/Style.lua) ----")
    print(f"  local SC = {sc:.4f}   -- {slice_px}/{w}")
    print(f"  local LC = {lc:.4f}   -- {w - slice_px}/{w}")

    # CSS pixel value (border-image-slice operates on source pixels).
    print(f"\n  ---- CSS (src/index.css) ----")
    print(f"  border-image-slice: {slice_px} fill;")
    print(f"  border-image-width: 32px;  /* displayed thickness; keep at 32 */")

    print()
    return 0

if __name__ == "__main__":
    sys.exit(main())
