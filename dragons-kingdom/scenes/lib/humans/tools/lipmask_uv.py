"""The lips' own colour zone in UV space, for every MakeHuman skin texture: data/lipmask-uv.json.

Why: the build's lip mask (aux.r, humanbuild.skin_aux) is centred on MakeHuman's 'joint-mouth' helper,
which sits ~7 cm behind the lips at the jaw joint, so almost no skin vertex got it (alexandria: 3 of
55784, abby 18, remi 1) - and the face de-lighting (albg) then treated the lips as skin and evened
their colour out. In the 4K close-ups the lips read as a crack in a smooth face, not as lips.

The fix lives at RUNTIME (loader.js applyLipMask), so it holds for every cache - built here, rebuilt on
the render PC, or installed from a package - without rebuilding anything: every character shares
MakeHuman's UV layout, so the vermilion of each photo texture is a fixed region in UV space. This
tool finds it once per texture (the redness of the photo against the skin round the mouth, inside the
UV box of the skin within ~3 cm of a built character's real mouth - between the oris05 / oris01 lip
bones) and stores it as a small 8-bit grid per texture. The loader samples the grid at each skin
vertex's UV (only near the mouth), writes aux.r and lifts the de-lighting gain back to 1 there.

    <bpy python> -I scenes/lib/humans/tools/lipmask_uv.py [--ref alexandria] [--debug DIR]

(kept out of offline/: the PC kit hashes offline/*.py as the code that makes the character caches,
and this leaves the caches untouched)
"""
import argparse
import base64
import glob
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'offline'))
import numpy as np  # noqa: E402

CACHE = os.path.join(HERE, '..', 'cache')
LIB = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..', 'assets-lib'))
OUT = os.path.join(HERE, '..', 'data', 'lipmask-uv.json')
TYPES = {'f32': np.float32, 'u16': np.uint16, 'u32': np.uint32, 'u8': np.uint8, 'i16': np.int16}


def arr(bin_, d):
    a = np.frombuffer(bin_, dtype=TYPES[d['type']], count=d['count'], offset=d['offset'])
    return a.reshape(-1, d['itemSize']) if d.get('itemSize', 1) > 1 else a


def quat_rot(q, v):
    """q = [w, x, y, z] (cache order) applied to v."""
    w, x, y, z = q
    u = np.array([x, y, z])
    return v + 2.0 * np.cross(u, np.cross(u, v) + w * v)


def mouth_frame(h):
    B = {b['name']: b for b in h['bones']}
    up_b, lo_b = np.array(B['oris05']['p']), np.array(B['oris01']['p'])
    M = (up_b + lo_b) / 2
    f = quat_rot(B['head']['q'], np.array([0.0, 0.0, 1.0]))
    f /= np.linalg.norm(f)
    up = up_b - lo_b
    up -= f * (up @ f)
    up /= np.linalg.norm(up)
    side = np.cross(up, f)
    return M, f, up, side


def near_mouth(P, M, f, up, side):
    d = P - M
    x, y, z = d @ side, d @ up, d @ f
    return x, y, z


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--ref', default='alexandria')
    ap.add_argument('--debug', default=None)
    ap.add_argument('--scale', type=int, default=2, help='texels per grid cell')
    o = ap.parse_args()
    from humanbuild import image_array
    h = json.load(open(os.path.join(CACHE, o.ref + '.json')))
    bin_ = open(os.path.join(CACHE, o.ref + '.bin'), 'rb').read()
    m = next(m for m in h['meshes'] if m['kind'] == 'skin')
    P = arr(bin_, m['attrs']['position']).astype(float)
    uv = arr(bin_, m['attrs']['uv']).astype(float)
    M, f, up, side = mouth_frame(h)
    x, y, z = near_mouth(P, M, f, up, side)
    # the skin round the mouth (the lips, their inner surface and ~1 cm of skin beyond)
    sel = (np.abs(x) < 0.034) & (y > -0.024) & (y < 0.02) & (z > -0.03)
    # the outer face island only (the inside of the mouth is a separate UV island far away): round the
    # median UV of the frontmost skin
    front = sel & (z > -0.004)
    c = np.median(uv[front], 0)
    sel &= np.abs(uv - c).max(1) < 0.08
    u0, v0 = uv[sel].min(0) - 0.002
    u1, v1 = uv[sel].max(0) + 0.002
    print(f'{o.ref}: {sel.sum()} skin vertices round the mouth, UV box u {u0:.4f}-{u1:.4f} v {v0:.4f}-{v1:.4f}', flush=True)
    textures = sorted(glob.glob(os.path.join(LIB, 'human', 'mh_skins', 'textures', '*diffuse*.png')))
    doc = {'about': 'Lip (vermilion) zone of each MakeHuman skin texture in UV space (tools/lipmask_uv.py): '
                    'mask[j][i] (8-bit, row 0 = v0) over the box u0..u1, v0..v1; loader.js applyLipMask.',
           'ref': o.ref, 'box': [float(u0), float(v0), float(u1), float(v1)], 'textures': {}}
    for tp in textures:
        img = image_array(tp)
        H_, W_ = img.shape[:2]
        i0, i1 = int(np.floor(u0 * (W_ - 1))), int(np.ceil(u1 * (W_ - 1)))
        j0, j1 = int(np.floor(v0 * (H_ - 1))), int(np.ceil(v1 * (H_ - 1)))
        crop = img[j0:j1 + 1, i0:i1 + 1, :3].astype(float)
        # redness in the photo (sRGB values, as stored): r / g; the lips are clearly redder than the
        # skin round them in every MakeHuman texture
        red = crop[..., 0] / np.maximum(crop[..., 1], 1e-3)
        lum = crop @ np.array([0.2126, 0.7152, 0.0722])
        ref = float(np.median(red))
        hi = float(np.percentile(red, 97))
        k = np.clip((red - (ref + 0.25 * (hi - ref))) / max(1e-3, 0.45 * (hi - ref)), 0, 1)
        # soften by a texel and shrink to the grid
        s = o.scale
        hh, ww = (k.shape[0] // s) * s, (k.shape[1] // s) * s
        g = k[:hh, :ww].reshape(hh // s, s, ww // s, s).mean((1, 3))
        g8 = np.clip(np.round(g * 255), 0, 255).astype(np.uint8)
        name = os.path.splitext(os.path.basename(tp))[0]
        doc['textures'][name] = {'w': int(g8.shape[1]), 'h': int(g8.shape[0]),
                                 'box': [i0 / (W_ - 1), j0 / (H_ - 1), (i0 + ww) / (W_ - 1), (j0 + hh) / (H_ - 1)],
                                 'redRef': round(ref, 4), 'redHi': round(hi, 4),
                                 'mask': base64.b64encode(g8.tobytes()).decode('ascii')}
        print(f'  {name}: {W_}x{H_}, crop {crop.shape[1]}x{crop.shape[0]}, grid {g8.shape[1]}x{g8.shape[0]}, '
              f'redness skin {ref:.3f} lips(p97) {hi:.3f}, lip cells {(g8 > 128).mean() * 100:.1f} %', flush=True)
        if o.debug:
            os.makedirs(o.debug, exist_ok=True)
            # a PPM (no image library): the crop beside its mask, row 0 at the top
            a = np.clip(crop[::-1] ** (1 / 1.0), 0, 1)
            mk = np.repeat(np.repeat(g[::-1], s, 0), s, 1)
            mk = np.pad(mk, ((0, a.shape[0] - mk.shape[0]), (0, a.shape[1] - mk.shape[1])))
            both = np.concatenate([a, np.stack([mk] * 3, -1), a * (0.35 + 0.65 * mk[..., None])], 1)
            pp = os.path.join(o.debug, name + '.ppm')
            with open(pp, 'wb') as fh:
                fh.write(f'P6 {both.shape[1]} {both.shape[0]} 255\n'.encode())
                fh.write((both * 255).astype(np.uint8).tobytes())
        del img, lum
    with open(OUT + '.tmp', 'w') as fh:
        json.dump(doc, fh, separators=(',', ':'))
    os.replace(OUT + '.tmp', OUT)
    print(f'wrote {OUT} ({os.path.getsize(OUT) / 1024:.0f} kB, {len(doc["textures"])} textures)')


if __name__ == '__main__':
    main()
