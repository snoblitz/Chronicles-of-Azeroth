#!/usr/bin/env python3
"""
prep-frames.py -- key the magenta chroma background out of the brand frame art
and export clean RGBA PNGs ready for the addon.

The frame source art arrives as flat 24-bit PNGs painted on a pure-magenta
(~#F404F9) background. Magenta is the chroma key: it marks "this is
transparent." We:

  1. Detect magenta-ness per pixel (high R, high B, low G, R~=B).
  2. Build a feathered alpha (0 = pure key, 1 = clearly foreground, linear
     ramp through a narrow band so edges anti-alias instead of jaggies).
  3. De-spill: un-mix the key colour out of partially-transparent edge pixels
     (observed = a*fg + (1-a)*key  ->  fg = (observed - (1-a)*key) / a) so the
     gold/violet border doesn't carry a magenta fringe.
  4. Trim to the alpha bounding box so the frame fills the canvas.
  5. Optionally split a stacked sheet into multiple sub-images (buttons).
  6. Optionally resize to a target size (power-of-two where it's free).

Usage:
  python tools/prep-frames.py            # process the default manifest
  python tools/prep-frames.py --src DIR  # override source dir (default: Downloads)
"""

import argparse
import os
import sys

try:
    from PIL import Image
    import numpy as np
except ImportError:
    sys.exit("Requires Pillow + numpy: pip install Pillow numpy")

# Reference magenta key colour (sampled from the source corners).
KEY = np.array([245.0, 4.0, 248.0])

# Feather band on distance-from-key (RGB euclidean). Below LO -> fully keyed
# (alpha 0); above HI -> fully opaque (alpha 1); between -> linear ramp.
LO = 45.0
HI = 130.0


def bleed_edges(rgb: np.ndarray, alpha: np.ndarray, iters: int = 6) -> np.ndarray:
    """Extrude opaque colour outward into transparent pixels.

    WoW samples textures bilinearly; a fully-transparent pixel that still
    holds magenta RGB will bleed magenta into the visible edge as a halo.
    We iteratively fill each transparent pixel from the average colour of
    its opaque (or already-filled) 4-neighbours so the hidden RGB under the
    transparent margin matches the border, not the key.
    """
    rgb = rgb.copy()
    filled = alpha > 0.0
    for _ in range(iters):
        if filled.all():
            break
        todo = ~filled
        # Sum of neighbour colours + count of filled neighbours (4-connected).
        acc = np.zeros_like(rgb)
        cnt = np.zeros(rgb.shape[:2], dtype=np.float32)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            sh_rgb = np.roll(rgb, (dy, dx), axis=(0, 1))
            sh_f = np.roll(filled, (dy, dx), axis=(0, 1))
            acc += sh_rgb * sh_f[..., None]
            cnt += sh_f
        newly = todo & (cnt > 0)
        safe = np.where(cnt > 0, cnt, 1.0)[..., None]
        avg = acc / safe
        rgb[newly] = avg[newly]
        filled = filled | newly
    return rgb


def key_magenta(img: Image.Image) -> Image.Image:
    """Return an RGBA copy with the magenta key removed + de-spilled."""
    rgb = np.asarray(img.convert("RGB"), dtype=np.float32)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]

    # Distance from the key colour.
    dist = np.sqrt((r - KEY[0]) ** 2 + (g - KEY[1]) ** 2 + (b - KEY[2]) ** 2)

    # Magenta gate: must actually look magenta (R & B high, G low, R~=B).
    # This protects bright but non-magenta pixels (e.g. gold border, where
    # B is low) from being read as key just because of distance maths.
    is_magentaish = (r > 120) & (b > 120) & (g < 120) & (np.abs(r - b) < 90)

    alpha = np.clip((dist - LO) / (HI - LO), 0.0, 1.0)
    # Pixels that aren't magenta-ish at all stay fully opaque regardless of
    # distance -- keeps thin gold/violet lines intact next to the key.
    alpha = np.where(is_magentaish, alpha, 1.0)
    # Snap key-side feather tails to fully transparent so the bleed pass
    # below repaints their (still-magenta) RGB instead of leaving a faint
    # magenta ghost that filtering can sample. Magenta-ish pixels below 50%
    # alpha are key edge, not art -- drop them (sub-pixel tightening).
    alpha = np.where(is_magentaish & (alpha < 0.5), 0.0, alpha)
    alpha = np.where(alpha < 0.06, 0.0, alpha)

    a = alpha[..., None]
    # De-spill: recover the true foreground colour for edge pixels. Where
    # alpha is ~0 the pixel is discarded anyway, so guard the divide.
    safe_a = np.clip(a, 1e-3, 1.0)
    fg = (rgb - (1.0 - a) * KEY[None, None, :]) / safe_a
    fg = np.clip(fg, 0.0, 255.0)
    # Only de-spill where we actually feathered (alpha in the open interval);
    # fully-opaque interior keeps its exact original colour.
    feathered = (alpha > 0.0) & (alpha < 1.0)
    out_rgb = np.where(feathered[..., None], fg, rgb)

    # Kill hidden magenta under the transparent margin so bilinear filtering
    # can't sample it as a halo. First bleed real border colour a few px deep
    # (handles the sampled edge band), then neutralise any magenta still left
    # deep inside large transparent regions to interior plum as a catch-all.
    out_rgb = bleed_edges(out_rgb, alpha)
    rr, gg, bb = out_rgb[..., 0], out_rgb[..., 1], out_rgb[..., 2]
    still_mag = (rr > 140) & (bb > 140) & (gg < 110) & (np.abs(rr - bb) < 90) & (alpha < 1.0)
    PLUM = np.array([30.0, 8.0, 52.0])
    out_rgb[still_mag] = PLUM

    out = np.dstack([out_rgb, alpha * 255.0]).astype(np.uint8)
    return Image.fromarray(out, "RGBA")


def kill_pink(img: Image.Image) -> Image.Image:
    """Strip residual magenta/pink from thin gold features (separators only).

    The chroma key leaves de-spilled pink along the antialiased boundary and the
    faded tips of very thin gold separators. A gold ramp ALWAYS has green above
    blue (r >= g > b); magenta/pink residue has blue at or above green. Since
    these assets are pure gold, force every non-gold pixel fully transparent.
    """
    a = np.asarray(img).astype(np.float32) / 255.0
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    non_gold = b > (g * 0.70)
    a[..., 3][non_gold] = 0.0
    return Image.fromarray((a * 255.0).astype(np.uint8), "RGBA")


def trim_to_alpha(img: Image.Image, pad: int = 0) -> Image.Image:
    """Crop to the bounding box of non-transparent pixels."""
    a = np.asarray(img)[..., 3]
    ys, xs = np.where(a > 8)
    if len(xs) == 0:
        return img
    x0, x1 = xs.min(), xs.max() + 1
    y0, y1 = ys.min(), ys.max() + 1
    x0 = max(0, x0 - pad)
    y0 = max(0, y0 - pad)
    x1 = min(img.width, x1 + pad)
    y1 = min(img.height, y1 + pad)
    return img.crop((x0, y0, x1, y1))


def split_rows(img: Image.Image, n: int):
    """Split a vertically-stacked sheet into n sub-images by alpha gaps.

    Finds the n largest contiguous runs of rows that contain opaque pixels.
    """
    a = np.asarray(img)[..., 3]
    row_has = (a > 8).any(axis=1)
    runs = []
    start = None
    for y, present in enumerate(row_has):
        if present and start is None:
            start = y
        elif not present and start is not None:
            runs.append((start, y))
            start = None
    if start is not None:
        runs.append((start, len(row_has)))
    runs.sort(key=lambda r: r[1] - r[0], reverse=True)
    runs = sorted(runs[:n], key=lambda r: r[0])  # top-to-bottom order
    return [img.crop((0, y0, img.width, y1)) for y0, y1 in runs]


def split_cols(img: Image.Image, n: int):
    """Split a horizontally-stacked sheet into n sub-images by alpha gaps.

    Finds the n largest contiguous runs of columns that contain opaque pixels.
    """
    a = np.asarray(img)[..., 3]
    col_has = (a > 8).any(axis=0)
    runs = []
    start = None
    for x, present in enumerate(col_has):
        if present and start is None:
            start = x
        elif not present and start is not None:
            runs.append((start, x))
            start = None
    if start is not None:
        runs.append((start, len(col_has)))
    runs.sort(key=lambda r: r[1] - r[0], reverse=True)
    runs = sorted(runs[:n], key=lambda r: r[0])  # left-to-right order
    return [img.crop((x0, 0, x1, img.height)) for x0, x1 in runs]


def save(img: Image.Image, path: str, size=None):
    if size is not None:
        img = img.resize(size, Image.LANCZOS)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path, "PNG")
    print(f"  -> {path}  ({img.width}x{img.height})")


def main():
    repo = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    default_src = os.path.join(os.path.expanduser("~"), "Downloads")
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default=default_src)
    args = ap.parse_args()

    art = os.path.join(repo, "addon", "Aftertale", "Art", "frame")
    icons = os.path.join(repo, "addon", "Aftertale", "Art", "icons")

    # Single-frame assets: (source, output-name, target-size-or-None, kill_pink?)
    single = [
        ("frame_square.png",    "frame-square.png",    (1024, 1024), False),
        ("frame_rectangle.png", "frame-rectangle.png", None,         False),
        ("flyout_left.png",     "flyout-left.png",     None,         False),
        ("flyout_right.png",    "flyout-right.png",    None,         False),
        ("inner_frame.png",     "inner-frame.png",     None,         False),
        ("hub_inner_cells.png", "inner-cell.png",      None,         False),
        ("horiz_sep.png",       "sep-horizontal.png",  None,         True),
        ("vert_sep.png",        "sep-vertical.png",    None,         True),
    ]
    for src_name, out_name, size, pink in single:
        src = os.path.join(args.src, src_name)
        if not os.path.exists(src):
            print(f"SKIP (missing): {src}")
            continue
        print(f"{src_name}:")
        keyed = key_magenta(Image.open(src))
        if pink:
            keyed = kill_pink(keyed)
        keyed = trim_to_alpha(keyed)
        save(keyed, os.path.join(art, out_name), size)

    # buttons.png -> button-idle (purple, bottom) + button-hover (gold, top)
    bsrc = os.path.join(args.src, "buttons.png")
    if os.path.exists(bsrc):
        print("buttons.png:")
        keyed = key_magenta(Image.open(bsrc))
        rows = split_rows(keyed, 2)
        if len(rows) == 2:
            top, bottom = rows  # top = gold = hover, bottom = purple = idle
            save(trim_to_alpha(top),    os.path.join(art, "button-hover.png"))
            save(trim_to_alpha(bottom), os.path.join(art, "button-idle.png"))
        else:
            print(f"  !! expected 2 rows, found {len(rows)}")
    else:
        print(f"SKIP (missing): {bsrc}")

    # cta_buttons.png -> cta-chronicle-idle (violet, left) + -hover (gold, right)
    csrc = os.path.join(args.src, "cta_buttons.png")
    if os.path.exists(csrc):
        print("cta_buttons.png:")
        keyed = key_magenta(Image.open(csrc))
        cols = split_cols(keyed, 2)
        if len(cols) == 2:
            left, right = cols  # left = violet = idle, right = gold = hover
            save(trim_to_alpha(left),  os.path.join(art, "cta-chronicle-idle.png"))
            save(trim_to_alpha(right), os.path.join(art, "cta-chronicle-hover.png"))
        else:
            print(f"  !! expected 2 cols, found {len(cols)}")
    else:
        print(f"SKIP (missing): {csrc}")

    # Standalone icons -> Art/icons/
    icon_set = [
        ("question.png", "question.png"),
        ("close.png",    "close.png"),
    ]
    for src_name, out_name in icon_set:
        src = os.path.join(args.src, src_name)
        if not os.path.exists(src):
            print(f"SKIP (missing): {src}")
            continue
        print(f"{src_name}:")
        keyed = trim_to_alpha(key_magenta(Image.open(src)))
        save(keyed, os.path.join(icons, out_name))


if __name__ == "__main__":
    main()
