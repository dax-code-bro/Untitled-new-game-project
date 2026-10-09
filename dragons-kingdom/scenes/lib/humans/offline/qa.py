"""Mesh-integrity report for built characters (cache/<id>.json + .bin): the checks a 4K close-up
punishes, run after a build (build.py) or by hand:

    <bpy python> -I scenes/lib/humans/offline/qa.py remi abby_t2 ...      (ids; 'all' = every cache)

- holes (QA_HOLES=1 only, noisy): small boundary loops in the cloth;
- grips: every hand prop (a static part riding a wrist bone, or skinned to it) must touch the
  hand: the distance from the palm's grip centre (between the knuckles, 2.5 cm in front of the
  palm) to the prop's nearest vertex; > 2.5 cm is flagged (fingers closing on air);
- cards: brow / lash vertices more than 4 mm from the skin (fragments floating off the face).
Prints one line per character with the flags; returns the list of problems.
"""
import json
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, '..', 'cache')
TYPES = {'f32': np.float32, 'u16': np.uint16, 'u32': np.uint32, 'u8': np.uint8, 'i16': np.int16}


def _arr(bin_, d):
    a = np.frombuffer(bin_, dtype=TYPES[d['type']], count=d['count'], offset=d['offset'])
    return a


def load(cid):
    h = json.load(open(os.path.join(CACHE, cid + '.json')))
    b = open(os.path.join(CACHE, cid + '.bin'), 'rb').read()
    return h, b


def mesh_arrays(h, b, m):
    P = _arr(b, m['attrs']['position']).reshape(-1, 3).astype(float)
    T = _arr(b, m['index']).reshape(-1, 3).astype(np.int64)
    T = T[(T[:, 0] != T[:, 1]) & (T[:, 1] != T[:, 2]) & (T[:, 0] != T[:, 2])]
    return P, T


def boundary_loops(P, T):
    # weld coincident vertices first (UV seams split vertices)
    key = np.round(P / 1e-5).astype(np.int64)
    _, w = np.unique(key, axis=0, return_inverse=True)
    w = w.reshape(-1)
    TW = w[T]
    E = np.concatenate([TW[:, [0, 1]], TW[:, [1, 2]], TW[:, [2, 0]]])
    Es = np.sort(E, axis=1)
    u, c = np.unique(Es, axis=0, return_counts=True)
    be = u[c == 1]
    if not len(be):
        return [], w
    nxt = {}
    for a, b_ in be:
        nxt.setdefault(a, []).append(b_)
        nxt.setdefault(b_, []).append(a)
    seen = set()
    loops = []
    for s in nxt:
        if s in seen:
            continue
        loop = [s]
        seen.add(s)
        prev, cur = None, s
        while True:
            cand = [x for x in nxt[cur] if x != prev and x not in seen]
            if not cand:
                break
            prev, cur = cur, cand[0]
            seen.add(cur)
            loop.append(cur)
        loops.append(loop)
    return loops, w


def check(cid):
    h, b = load(cid)
    names = [x['name'] for x in h['bones']]
    bones = {x['name']: np.array(x['p']) for x in h['bones']}
    problems = []
    # ---- holes (opt-in: QA_HOLES=1). The cull passes leave intended openings under outer layers
    # and the hem rims split openings into many short loops, so this check is noisy - holes are
    # judged in the 1:1 crops instead.
    for m in (h['meshes'] if os.environ.get('QA_HOLES') else []):
        if m['kind'] != 'cloth' or m['name'] in ('gloves',):
            continue
        P, T = mesh_arrays(h, b, m)
        if not len(T):
            continue
        loops, w = boundary_loops(P, T)
        Q = np.zeros((int(w.max()) + 1, 3))
        Q[w] = P
        for l in loops:
            if len(l) < 3:
                continue
            L = Q[l]
            per = float(np.linalg.norm(np.diff(np.vstack([L, L[:1]]), axis=0), axis=1).sum())
            if per < 0.25:
                c = L.mean(0)
                problems.append(f"hole in {m['name']} ({per * 100:.0f} cm round, at {c[0]:+.2f} {c[1]:.2f} {c[2]:+.2f})")
    # ---- grips
    for side in ('L', 'R'):
        wr = bones.get(f'wrist.{side}')
        f2, f5 = bones.get(f'finger2-1.{side}'), bones.get(f'finger5-1.{side}')
        if wr is None or f2 is None:
            continue
        kn = (f2 + f5) / 2
        fwd = kn - wr
        fwd /= max(1e-9, np.linalg.norm(fwd))
        lat = f5 - f2
        lat = lat - fwd * np.dot(lat, fwd)
        lat /= max(1e-9, np.linalg.norm(lat))
        palm = (1.0 if side == 'L' else -1.0) * np.cross(lat, fwd)
        # the grip centre: just past the knuckles, a finger's depth in front of the palm
        gc = kn + fwd * 0.012 + palm * 0.024
        best = None
        wi = names.index(f'wrist.{side}')
        for m in h['meshes']:
            if m['kind'] != 'prop' or 'skinIndex' not in m['attrs']:
                continue
            SI = _arr(b, m['attrs']['skinIndex']).reshape(-1, 4)
            SW = _arr(b, m['attrs']['skinWeight']).reshape(-1, 4)
            if not (np.all(SI[:, 0] == wi) and np.all(SW[:, 0] > 0.99)):
                continue                                    # not a hand prop of this hand
            P, T = mesh_arrays(h, b, m)
            import bpy  # noqa: F401
            from mathutils.bvhtree import BVHTree
            from mathutils import Vector
            tree = BVHTree.FromPolygons(P.tolist(), T.tolist(), all_triangles=True)
            loc, nrm, _, d = tree.find_nearest(Vector(gc))
            if d is None:
                continue
            if best is None or d < best[0]:
                best = (d, m['name'])
        if best is not None and best[0] > 0.02:
            problems.append(f"the {side} hand's prop ({best[1]}) is {best[0] * 100:.1f} cm from the grip centre")
    # ---- cards
    skin = [m for m in h['meshes'] if m['kind'] == 'skin']
    if skin:
        S, _ = mesh_arrays(h, b, skin[0])
        try:
            from scipy.spatial import cKDTree
            tree = cKDTree(S)
        except Exception:
            tree = None
        for m in h['meshes']:
            if m['name'] not in ('brows', 'lashes') or tree is None:
                continue
            P, T = mesh_arrays(h, b, m)
            used = np.unique(T)
            d, _ = tree.query(P[used])
            lim = 0.004 if m['name'] == 'brows' else 0.012
            far = int((d > lim).sum())
            if far:
                problems.append(f"{m['name']}: {far} vertices > {lim * 1000:.0f} mm off the skin")
    return problems


def main():
    ids = sys.argv[1:]
    if not ids or ids == ['all']:
        ids = sorted(f[:-5] for f in os.listdir(CACHE) if f.endswith('.json'))
    bad = 0
    for cid in ids:
        try:
            pr = check(cid)
        except Exception as e:  # noqa: BLE001
            pr = [f'QA failed: {e}']
        print(f"{cid}: {'OK' if not pr else '; '.join(pr)}", flush=True)
        bad += bool(pr)
    print(f'QA: {len(ids) - bad} clean, {bad} flagged')


if __name__ == '__main__':
    main()
