"""Post-fixes applied in place to already built characters (cache/<id>.json + .bin), so a fix
that only needs the finished meshes does not cost a full rebuild.

    <bpy python> -I scenes/lib/humans/offline/postfix.py shoes id [id ...]   ('all' = every cache)

shoes: shoes and boots were shells of the foot with the toes' relief kept (they read as toe
socks). The foot part of every shoe/boot mesh (from the sole up to the ankle) is smoothed into
a last - a rounded toe box with no toes - the sole stays flat on the ground, and the normals are
recomputed. garments.boots() does the same for new builds.
"""
import glob
import json
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, '..', 'cache')
TYPES = {'f32': np.float32, 'u16': np.uint16, 'u32': np.uint32, 'u8': np.uint8, 'i16': np.int16}


def view(bin_, d):
    a = np.frombuffer(bin_, dtype=TYPES[d['type']], count=d['count'], offset=d['offset'])
    return a.reshape(-1, d['itemSize']) if d.get('itemSize', 1) > 1 else a


def put(bin_, d, a):
    a = np.ascontiguousarray(a, dtype=TYPES[d['type']]).reshape(-1)
    assert a.size == d['count']
    bin_[d['offset']:d['offset'] + a.nbytes] = a.tobytes()


def smooth_lasts(P, tris, foot_h=0.08):
    """The foot part of a shoe becomes a last: in each foot's own frame (forward = long axis,
    toward the toes) the front of the foot is re-made slice by slice as a rounded box (a
    superellipse cross-section spanning that slice's width and height, flat sole) - no toes.
    Returns (positions, normals)."""
    key = np.round(P / 1e-5).astype(np.int64)
    _, w = np.unique(key, axis=0, return_inverse=True)
    w = w.reshape(-1)
    nW = int(w.max()) + 1
    cnt = np.bincount(w, minlength=nW).astype(float)
    Q = np.stack([np.bincount(w, weights=P[:, k], minlength=nW) for k in range(3)], 1) / cnt[:, None]
    tw = w[tris]
    a = np.concatenate([tw[:, 0], tw[:, 1], tw[:, 2], tw[:, 1], tw[:, 2], tw[:, 0]])
    b = np.concatenate([tw[:, 1], tw[:, 2], tw[:, 0], tw[:, 0], tw[:, 1], tw[:, 2]])
    deg = np.maximum(np.bincount(a, minlength=nW), 1).astype(float)

    def normals(X):
        fn = np.cross(X[tw[:, 1]] - X[tw[:, 0]], X[tw[:, 2]] - X[tw[:, 0]])
        Nn = np.zeros_like(X)
        for k in range(3):
            np.add.at(Nn, tw[:, k], fn)
        return Nn / np.maximum(np.linalg.norm(Nn, axis=1, keepdims=True), 1e-12)
    out = Q.copy()
    wt = np.zeros(nW)
    med = np.median(Q[:, 0])
    for side in (Q[:, 0] >= med, Q[:, 0] < med):
        if side.sum() < 20:
            continue
        y0 = Q[side, 1].min()
        foot = side & (Q[:, 1] < y0 + foot_h)
        F = Q[foot]
        if len(F) < 20:
            continue
        cxz = F[:, [0, 2]].mean(0)
        X = F[:, [0, 2]] - cxz
        ev, evec = np.linalg.eigh(X.T @ X)
        f2 = evec[:, -1]                                   # long axis (xz)
        u = X @ f2
        lo, hi = np.quantile(u, 0.03), np.quantile(u, 0.97)
        # the toe end is the low end (the ankle rises at the heel end)
        if F[u > hi - 0.03, 1].max() > F[u < lo + 0.03, 1].max():
            f2 = -f2
            u = -u
            lo, hi = -hi, -lo
        l2 = np.array([-f2[1], f2[0]])
        L = hi - lo
        t0 = lo + 0.5 * L                                  # toe box: front half of the foot
        # slice profiles over the front, smoothed along the foot
        nb = 24
        edges = np.linspace(t0 - 0.02, hi + 0.01, nb + 1)
        uu = (Q[:, [0, 2]] - cxz) @ f2
        vv = (Q[:, [0, 2]] - cxz) @ l2
        sel_all = foot & (uu > t0 - 0.02)
        prof = np.zeros((nb, 3))
        for k in range(nb):
            s_ = sel_all & (uu >= edges[k]) & (uu < edges[k + 1])
            if s_.sum() < 3:
                prof[k] = prof[k - 1] if k else [0, 0, y0 + 0.02]
                continue
            prof[k] = [vv[s_].min(), vv[s_].max(), Q[s_, 1].max()]
        for _ in range(3):
            prof[1:-1] = 0.25 * prof[:-2] + 0.5 * prof[1:-1] + 0.25 * prof[2:]
        cen = (edges[:-1] + edges[1:]) / 2
        region = foot & (uu > t0)
        idx = np.where(region)[0]
        vmin = np.interp(uu[idx], cen, prof[:, 0])
        vmax = np.interp(uu[idx], cen, prof[:, 1])
        ymax = np.interp(uu[idx], cen, prof[:, 2])
        vc, aa = (vmin + vmax) / 2, np.maximum((vmax - vmin) / 2, 0.01)
        yc, bb = (ymax + y0) / 2, np.maximum((ymax - y0) / 2, 0.01)
        th = np.arctan2((Q[idx, 1] - yc) / bb, (vv[idx] - vc) / aa)
        n_ = 3.0
        cs, sn = np.cos(th), np.sin(th)
        v2 = vc + aa * np.sign(cs) * np.abs(cs) ** (2 / n_)
        y2 = np.maximum(yc + bb * np.sign(sn) * np.abs(sn) ** (2 / n_), y0)
        # blend in over the first 2 cm of the toe box
        bl = np.clip((uu[idx] - t0) / 0.02, 0, 1)
        xz = cxz + np.outer(uu[idx], f2) + np.outer(vv[idx] + (v2 - vv[idx]) * bl, l2)
        out[idx, 0] = xz[:, 0]
        out[idx, 2] = xz[:, 1]
        out[idx, 1] = Q[idx, 1] + (y2 - Q[idx, 1]) * bl
        wt[idx] = np.maximum(bl, 0.3)
    y0all = Q[:, 1].min()
    sole = Q[:, 1] < y0all + 0.003
    for _ in range(4):
        avg = np.stack([np.bincount(a, weights=out[b, k], minlength=nW) for k in range(3)], 1) / deg[:, None]
        out = out + (0.35 * wt)[:, None] * (avg - out)
        out[sole, 1] = Q[sole, 1]
    return out[w], normals(out)[w]


def fix_shoes(cid):
    jp, bp = os.path.join(CACHE, cid + '.json'), os.path.join(CACHE, cid + '.bin')
    h = json.load(open(jp))
    bin_ = bytearray(open(bp, 'rb').read())
    done = []
    for m in h['meshes']:
        if m['kind'] != 'cloth' or m['name'] not in ('boots', 'shoes'):
            continue
        A = m['attrs']
        P = view(bin_, A['position']).astype(float)
        tris = np.frombuffer(bin_, dtype=TYPES[m['index']['type']], count=m['index']['count'], offset=m['index']['offset']).reshape(-1, 3).astype(np.int64)
        P2, N2 = smooth_lasts(P, tris)
        # keep the original normal orientation (outward as built)
        N0 = view(bin_, A['normal']).astype(float)
        flip = np.sign(np.einsum('ij,ij->i', N0, N2))
        N2 = N2 * np.where(flip == 0, 1, flip)[:, None]
        put(bin_, A['position'], P2)
        put(bin_, A['normal'], N2)
        done.append(m['name'])
    if not done:
        print(f'{cid}: no shoes')
        return
    tmp = bp + '.tmp'
    open(tmp, 'wb').write(bin_)
    os.replace(tmp, bp)
    os.utime(jp)
    print(f'{cid}: {", ".join(done)} smoothed into lasts', flush=True)


def main():
    what, ids = sys.argv[1], sys.argv[2:]
    if ids == ['all']:
        ids = sorted(os.path.basename(p)[:-5] for p in glob.glob(os.path.join(CACHE, '*.json')))
    for cid in ids:
        if what == 'shoes':
            fix_shoes(cid)


if __name__ == '__main__':
    main()
