"""Recompute the face albedo de-lighting gain (`albg`) of already built characters in place,
without rebuilding them (seconds per character instead of minutes).

    <bpy python> -I scenes/lib/humans/offline/regain.py [--keep 0.006] [--ref 0.06] id [id ...]
    (ids: cache/<id>.json + .bin; 'all' = every character in the cache)

Same method as humanbuild.albedo_gain (gain = colour blurred over `ref` / colour blurred over
`keep`, lips, lash line, scalp and ears left out), run on the cached skin mesh in its drape pose;
the face region is a sphere round the eyes (no rest-pose frame is needed). The MakeHuman photo
textures carry pale under-eye patches of ~3 cm, which a 4.5 cm reference only partly removes.
"""
import argparse
import glob
import json
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..'))
CACHE = os.path.join(HERE, '..', 'cache')
LIB = os.path.join(ROOT, 'assets-lib')
TYPES = {'f32': np.float32, 'u16': np.uint16, 'u32': np.uint32, 'u8': np.uint8, 'i16': np.int16}


def arr(bin_, d, n=None):
    a = np.frombuffer(bin_, dtype=TYPES[d['type']], count=d['count'], offset=d['offset'])
    return a.reshape(-1, d['itemSize']) if d.get('itemSize', 1) > 1 else a


def regain(cid, keep, ref):
    from humanbuild import image_array, sample_image
    jp, bp = os.path.join(CACHE, cid + '.json'), os.path.join(CACHE, cid + '.bin')
    h = json.load(open(jp))
    bin_ = bytearray(open(bp, 'rb').read())
    m = next((m for m in h['meshes'] if m['kind'] == 'skin'), None)
    if m is None or 'albg' not in m['attrs'] or not m['material'].get('map'):
        print(f'{cid}: no skin albg - skipped')
        return
    A = m['attrs']
    P = arr(bin_, A['position']).astype(float)
    uv = arr(bin_, A['uv']).astype(float)
    aux = arr(bin_, A['aux']).astype(float)
    aux2 = arr(bin_, A['aux2']).astype(float)
    tris = np.frombuffer(bin_, dtype=TYPES[m['index']['type']], count=m['index']['count'], offset=m['index']['offset']).reshape(-1, 3).astype(np.int64)
    N = len(P)
    # weld UV-seam duplicates by position
    key = np.round(P / 1e-5).astype(np.int64)
    _, w = np.unique(key, axis=0, return_inverse=True)
    w = w.reshape(-1)
    nW = int(w.max()) + 1
    cnt = np.bincount(w, minlength=nW).astype(float)
    col = sample_image(image_array(os.path.join(LIB, m['material']['map'])), uv)[:, :3]
    lin = np.clip(col, 0, 1) ** 2.2
    C = np.stack([np.bincount(w, weights=lin[:, k], minlength=nW) for k in range(3)], 1) / cnt[:, None]
    Pw = np.stack([np.bincount(w, weights=P[:, k], minlength=nW) for k in range(3)], 1) / cnt[:, None]
    kv = 1.0 - np.clip(np.max(np.stack([aux[:, 0] * 1.5, aux2[:, 1] * 1.5, aux[:, 3] * 2.0, aux2[:, 3] * 1.5], 1), axis=1), 0, 1)
    K = np.bincount(w, weights=kv, minlength=nW) / cnt
    tw = w[tris]
    a = np.concatenate([tw[:, 0], tw[:, 1], tw[:, 2], tw[:, 1], tw[:, 2], tw[:, 0]])
    b = np.concatenate([tw[:, 1], tw[:, 2], tw[:, 0], tw[:, 0], tw[:, 1], tw[:, 2]])
    deg = np.maximum(np.bincount(a, minlength=nW), 1).astype(float)
    el = float(np.median(np.linalg.norm(Pw[tw[:, 0]] - Pw[tw[:, 1]], axis=1)))

    def blur(X, radius):
        it = int(np.clip(2.0 * (radius / max(el, 1e-4)) ** 2, 2, 3000))
        X = X.copy()
        for _ in range(it):
            avg = np.stack([np.bincount(a, weights=X[b, k], minlength=nW) for k in range(X.shape[1])], 1) / deg[:, None]
            X = X + 0.5 * (avg - X)
        return X
    W4 = np.concatenate([C * K[:, None], K[:, None]], 1)
    mk = blur(W4, keep)
    rf = blur(W4, ref)
    g = np.clip((rf[:, :3] / np.maximum(rf[:, 3:], 1e-4)) / np.maximum(mk[:, :3] / np.maximum(mk[:, 3:], 1e-4), 1e-4), 0.65, 1.4)
    bones = {bb['name']: np.array(bb['p']) for bb in h['bones']}
    ec = (bones['eye.L'] + bones['eye.R']) / 2
    d = np.linalg.norm(Pw - ec, axis=1)
    face = np.clip(1 - (d - 0.085) / 0.035, 0, 1)
    g = 1.0 + (g - 1.0) * (face * K)[:, None]
    out = g[w].astype(np.float32)
    d_ = A['albg']
    assert d_['type'] == 'f32' and d_['count'] == out.size
    bin_[d_['offset']:d_['offset'] + out.nbytes] = out.tobytes()
    tmp = bp + '.tmp'
    open(tmp, 'wb').write(bin_)
    os.replace(tmp, bp)
    os.utime(jp)      # the pair stays "newer than the code" for queue.sh
    print(f'{cid}: albg recomputed (keep {keep * 1000:.0f} mm, ref {ref * 100:.0f} cm, {nW} welded verts, {el * 1000:.1f} mm edges)')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('ids', nargs='+')
    ap.add_argument('--keep', type=float, default=0.006)
    ap.add_argument('--ref', type=float, default=0.06)
    o = ap.parse_args()
    ids = o.ids
    if ids == ['all']:
        ids = sorted(os.path.basename(p)[:-5] for p in glob.glob(os.path.join(CACHE, '*.json')))
    for cid in ids:
        regain(cid, o.keep, o.ref)


if __name__ == '__main__':
    main()
