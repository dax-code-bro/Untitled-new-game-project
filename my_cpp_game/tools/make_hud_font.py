#!/usr/bin/env python3
"""THE HUD FONT, AS A DISTANCE FIELD.

    python3 tools/make_hud_font.py [font.ttf] > src/game/HudFont.inc

Renders printable ASCII from a TrueType face at high resolution, turns each
glyph into a signed distance field (exact Euclidean, Felzenszwalb's
separable transform, no numpy needed), downsamples it into a single-channel
atlas and writes it as C++ the HUD includes -- so the game carries its own
font and needs no file at run time.

A distance field rather than a coverage bitmap because the HUD draws the
same face from a 12 px weapon list to an 80 px round number, and a field
stays sharp and smooth at every size from one small atlas; it also makes
an outline free, which is what keeps white numbers legible against a
bright sky.

Default face: Barlow Condensed Medium (assets/fonts, SIL Open Font
Licence) -- a plain, DIN-like condensed sans of the kind a modern military
HUD is set in. DejaVu Sans Bold came first and read as cartoonish: round,
heavy and outlined.
"""
import sys
from PIL import Image, ImageDraw, ImageFont

import os
HERE = os.path.dirname(os.path.abspath(__file__))
FONT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, '..', 'assets', 'fonts', 'BarlowCondensed-Medium.ttf')
CREDIT = ('Face: Barlow Condensed Medium, copyright 2017 The Barlow Project Authors',
          '(https://github.com/jpt/barlow), SIL Open Font Licence 1.1 -- see',
          'assets/fonts/OFL.txt.')
OVER = 4            # supersampling of the high-res render
EM = 48             # atlas pixels per em
SPREAD = 6          # atlas pixels of distance encoded either side of the edge
CONDENSE = 1.0
ATLAS_W = 512
INF = 1e20


def edt_1d(f, n):
    """Squared distance transform of a sampled function (Felzenszwalb & Huttenlocher)."""
    d = [0.0] * n
    v = [0] * n
    z = [0.0] * (n + 1)
    k = 0
    v[0] = 0
    z[0] = -INF
    z[1] = INF
    for q in range(1, n):
        s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k])
        while s <= z[k]:
            k -= 1
            s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k])
        k += 1
        v[k] = q
        z[k] = s
        z[k + 1] = INF
    k = 0
    for q in range(n):
        while z[k + 1] < q:
            k += 1
        d[q] = (q - v[k]) * (q - v[k]) + f[v[k]]
    return d


def edt_2d(grid, w, h):
    """grid: list of 0/INF. Returns squared distances to the nearest 0."""
    out = list(grid)
    col = [0.0] * h
    for x in range(w):
        for y in range(h):
            col[y] = out[y * w + x]
        dc = edt_1d(col, h)
        for y in range(h):
            out[y * w + x] = dc[y]
    for y in range(h):
        row = out[y * w:(y + 1) * w]
        out[y * w:(y + 1) * w] = edt_1d(row, w)
    return out


def main():
    size = EM * OVER
    font = ImageFont.truetype(FONT, size)
    ascent, descent = font.getmetrics()
    pad = SPREAD * OVER
    chars = [chr(c) for c in range(32, 127)]
    glyphs = []
    # Each glyph is drawn with its pen at (P, P) on the baseline ('ls' anchor),
    # and its INK box measured off the image -- getbbox() reports the advance
    # box on this Pillow, not the ink, so every left bearing came out zero.
    P = size
    for ch in chars:
        adv = font.getlength(ch) * CONDENSE
        img = Image.new('L', (size * 3, size * 3), 0)
        ImageDraw.Draw(img).text((P, P), ch, font=font, fill=255, anchor='ls')
        ink = img.getbbox()
        if ch == ' ' or not ink:
            glyphs.append(dict(ch=ch, adv=adv / OVER, w=0, h=0, ox=0, oy=0, px=None))
            continue
        ix0, iy0, ix1, iy1 = ink
        padx = int(pad / CONDENSE) + OVER
        cl, ct, cr, cb = ix0 - padx, iy0 - pad - OVER, ix1 + padx, iy1 + pad + OVER
        crop = img.crop((cl, ct, cr, cb))
        gw = int(round((cr - cl) * CONDENSE))
        gh = cb - ct
        gw += (-gw) % OVER
        gh += (-gh) % OVER
        crop = crop.resize((gw, gh), Image.LANCZOS)
        px = crop.load()
        inside = [0.0 if px[x, y] >= 128 else INF for y in range(gh) for x in range(gw)]
        outside = [INF if px[x, y] >= 128 else 0.0 for y in range(gh) for x in range(gw)]
        din = edt_2d(inside, gw, gh)     # distance to ink, for pixels outside it
        dout = edt_2d(outside, gw, gh)   # distance to background, for pixels inside
        cw, chh = gw // OVER, gh // OVER
        cell = bytearray(cw * chh)
        for cy in range(chh):
            for cx in range(cw):
                sx, sy = cx * OVER + OVER // 2, cy * OVER + OVER // 2
                i = sy * gw + sx
                sd = (dout[i] ** 0.5 - 0.5) if din[i] == 0 else -(din[i] ** 0.5 - 0.5)
                sd /= OVER                                  # in atlas pixels
                v = 128 + sd * (127.0 / SPREAD)
                cell[cy * cw + cx] = max(0, min(255, int(round(v))))
        glyphs.append(dict(ch=ch, adv=adv / OVER, w=cw, h=chh,
                           # the cell's top-left relative to the pen on the baseline, atlas px
                           ox=((cl - P) * CONDENSE) / OVER, oy=(ct - P) / OVER, px=cell))
    # Shelf-pack.
    x = y = row_h = 0
    for g in glyphs:
        if not g['px']:
            g['ax'] = g['ay'] = 0
            continue
        if x + g['w'] > ATLAS_W:
            x, y, row_h = 0, y + row_h + 1, 0
        g['ax'], g['ay'] = x, y
        x += g['w'] + 1
        row_h = max(row_h, g['h'])
    atlas_h = y + row_h + 1
    atlas_h += (-atlas_h) % 4
    atlas = bytearray(ATLAS_W * atlas_h)
    for g in glyphs:
        if not g['px']:
            continue
        for r in range(g['h']):
            atlas[(g['ay'] + r) * ATLAS_W + g['ax']:(g['ay'] + r) * ATLAS_W + g['ax'] + g['w']] = \
                g['px'][r * g['w']:(r + 1) * g['w']]
    himg = Image.new('L', (size * 3, size * 3), 0)
    ImageDraw.Draw(himg).text((P, P), 'H', font=font, fill=255, anchor='ls')
    hb = himg.getbbox()
    cap = (0, hb[1] - P, 0, 0)          # cap[3] - cap[1] = height of H above the baseline
    out = sys.stdout
    out.write('// GENERATED by tools/make_hud_font.py -- do not edit.\n')
    for line in CREDIT:
        out.write('// ' + line + '\n')
    out.write('namespace hudfont {\n')
    out.write('constexpr int kAtlasW = %d, kAtlasH = %d;\n' % (ATLAS_W, atlas_h))
    out.write('constexpr float kEm = %d.0f, kSpread = %d.0f;\n' % (EM, SPREAD))
    out.write('constexpr float kCapHeight = %.3ff;   // atlas px, top of H to baseline\n' % ((cap[3] - cap[1]) / OVER))
    out.write('constexpr float kAscent = %.3ff;\n' % (ascent / OVER))
    out.write('struct Glyph { float adv, ox, oy; int ax, ay, w, h; };\n')
    out.write('constexpr Glyph kGlyphs[95] = {\n')
    for g in glyphs:
        out.write('    {%.3ff, %.3ff, %.3ff, %d, %d, %d, %d},  // %r\n' % (g['adv'], g['ox'], g['oy'], g['ax'], g['ay'], g['w'], g['h'], g['ch']))
    out.write('};\n')
    out.write('constexpr unsigned char kAtlas[%d] = {\n' % len(atlas))
    for i in range(0, len(atlas), 32):
        out.write('    ' + ','.join(str(b) for b in atlas[i:i + 32]) + ',\n')
    out.write('};\n} // namespace hudfont\n')


if __name__ == '__main__':
    main()
