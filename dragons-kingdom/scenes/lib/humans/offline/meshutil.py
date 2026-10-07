"""Small mesh utilities for garments, hair and props (numpy, polygon soup of quads/tris)."""
import math
from collections import defaultdict

import numpy as np


def norm(v):
    v = np.asarray(v, float)
    n = np.linalg.norm(v, axis=-1, keepdims=True)
    return v / np.maximum(n, 1e-12)


def tris_of(faces):
    out = []
    for f in faces:
        for k in range(1, len(f) - 1):
            out.append((f[0], f[k], f[k + 1]))
    return np.asarray(out, dtype=np.int64).reshape(-1, 3)


def vnormals(P, faces):
    T = tris_of(faces)
    n = np.zeros_like(P)
    a, b, c = P[T[:, 0]], P[T[:, 1]], P[T[:, 2]]
    fn = np.cross(b - a, c - a)
    for k in range(3):
        np.add.at(n, T[:, k], fn)
    return norm(n)


def neighbours(nv, faces):
    nb = [set() for _ in range(nv)]
    for f in faces:
        n = len(f)
        for k in range(n):
            a, b = f[k], f[(k + 1) % n]
            nb[a].add(b)
            nb[b].add(a)
    return [np.fromiter(s, dtype=np.int64) if s else np.zeros(0, np.int64) for s in nb]


def boundary_edges(faces):
    cnt = defaultdict(int)
    ordered = {}
    for f in faces:
        n = len(f)
        for k in range(n):
            a, b = f[k], f[(k + 1) % n]
            key = (min(a, b), max(a, b))
            cnt[key] += 1
            ordered[key] = (a, b)
    return [ordered[k] for k, c in cnt.items() if c == 1]


def boundary_loops(faces):
    """Ordered boundary loops (lists of vertex ids); robust to inconsistent face winding."""
    edges = boundary_edges(faces)
    adj = defaultdict(list)
    for a, b in edges:
        adj[a].append(b)
        adj[b].append(a)
    seen = set()
    loops = []
    for a, b in edges:
        if a in seen:
            continue
        loop = [a]
        seen.add(a)
        prev, cur = a, b
        guard = 0
        while cur != a and guard < 200000:
            loop.append(cur)
            seen.add(cur)
            nx = [c for c in adj[cur] if c != prev and (c not in seen or c == a)]
            if not nx:
                break
            prev, cur = cur, nx[0]
            guard += 1
        loops.append(loop)
    return loops


def compact(P, faces, keep_faces=None, extra=None):
    """Keep only used vertices. Returns (P2, faces2, old_index (K,), extra2...)."""
    if keep_faces is not None:
        faces = [f for f, k in zip(faces, keep_faces) if k]
    used = sorted({v for f in faces for v in f})
    m = {v: i for i, v in enumerate(used)}
    f2 = [tuple(m[v] for v in f) for f in faces]
    old = np.asarray(used, dtype=np.int64)
    return P[old], f2, old


def laplacian_smooth(P, nb, iters=10, lam=0.5, fixed=None, mask=None):
    P = P.copy()
    for _ in range(iters):
        Q = P.copy()
        for i, n in enumerate(nb):
            if not len(n) or (fixed is not None and fixed[i]):
                continue
            w = lam if mask is None else lam * mask[i]
            Q[i] = P[i] + w * (P[n].mean(0) - P[i])
        P = Q
    return P


def laplacian_smooth_fast(P, nb, iters=10, lam=0.5, fixed=None, mask=None):
    """Vectorised uniform Laplacian (CSR adjacency)."""
    nv = len(P)
    rows = np.concatenate([np.full(len(n), i) for i, n in enumerate(nb)]) if nv else np.zeros(0, np.int64)
    cols = np.concatenate([n for n in nb]) if nv else np.zeros(0, np.int64)
    deg = np.array([max(1, len(n)) for n in nb], float)
    has = np.array([len(n) > 0 for n in nb])
    w = np.full(nv, lam, float)
    if mask is not None:
        w = w * mask
    if fixed is not None:
        w = np.where(fixed, 0.0, w)
    w = np.where(has, w, 0.0)
    P = P.copy()
    for _ in range(iters):
        S = np.zeros_like(P)
        np.add.at(S, rows, P[cols])
        avg = S / deg[:, None]
        P = P + w[:, None] * (avg - P)
    return P


def grid_faces(nu, nv, wrap_u=False, offset=0):
    """Quads for a (nv rows) x (nu cols) vertex grid, row-major; wrap_u closes each row."""
    F = []
    cols = nu if wrap_u else nu - 1
    for j in range(nv - 1):
        for i in range(cols):
            a = offset + j * nu + i
            b = offset + j * nu + (i + 1) % nu
            c = offset + (j + 1) * nu + (i + 1) % nu
            d = offset + (j + 1) * nu + i
            F.append((a, b, c, d))
    return F


def resample_closed(loopP, n):
    """Resample a closed polyline to n points evenly by arc length."""
    pts = np.vstack([loopP, loopP[:1]])
    seg = np.linalg.norm(np.diff(pts, axis=0), axis=1)
    s = np.concatenate([[0], np.cumsum(seg)])
    L = s[-1]
    t = np.linspace(0, L, n, endpoint=False)
    out = np.zeros((n, 3))
    for k in range(3):
        out[:, k] = np.interp(t, s, pts[:, k])
    return out


def resample_open(P, n):
    seg = np.linalg.norm(np.diff(P, axis=0), axis=1)
    s = np.concatenate([[0], np.cumsum(seg)])
    t = np.linspace(0, s[-1], n)
    out = np.zeros((n, 3))
    for k in range(3):
        out[:, k] = np.interp(t, s, P[:, k])
    return out


def solidify(P, faces, thickness, nrm=None):
    """Add an inner shell (offset -n * thickness, flipped) and rims along the boundary.
    Returns (P2, faces2, is_inner (K,) bool)."""
    if nrm is None:
        nrm = vnormals(P, faces)
    n = len(P)
    Pi = P - nrm * thickness
    F = list(faces) + [tuple(v + n for v in reversed(f)) for f in faces]
    for a, b in boundary_edges(faces):
        F.append((b, a, a + n, b + n))
    return np.vstack([P, Pi]), F, np.concatenate([np.zeros(n, bool), np.ones(n, bool)])


def subdivide_quads_linear(P, faces, extra=None):
    """Split every quad into 4 (and tri into 3 quads) by edge midpoints and centres. extra: list of (K,...) arrays
    interpolated the same way. Returns (P2, faces2, extra2)."""
    edges = {}
    newP = [p for p in P]
    ex = [list(e) for e in (extra or [])]

    def mid(a, b):
        k = (min(a, b), max(a, b))
        if k not in edges:
            edges[k] = len(newP)
            newP.append((P[a] + P[b]) / 2)
            for e, src in zip(ex, extra):
                e.append((src[a] + src[b]) / 2)
        return edges[k]
    F = []
    for f in faces:
        c = len(newP)
        newP.append(P[list(f)].mean(0))
        for e, src in zip(ex, extra or []):
            e.append(src[list(f)].mean(0))
        n = len(f)
        ms = [mid(f[k], f[(k + 1) % n]) for k in range(n)]
        for k in range(n):
            F.append((f[k], ms[k], c, ms[(k - 1) % n]))
    return np.asarray(newP), F, [np.asarray(e) for e in ex]


def hem_rim(P, faces, thickness=0.003, turn=0.012, nrm=None):
    """Turned hem along every boundary: a strip folded to the inside (thickness at the edge, a
    little fabric visible inside openings). Returns (P2, faces2, n_new)."""
    if nrm is None:
        nrm = vnormals(P, faces)
    nb = neighbours(len(P), faces)
    loops = boundary_loops(faces)
    bset = {v for l in loops for v in l}
    newP = []
    F = list(faces)
    base = len(P)
    for l in loops:
        n = len(l)
        r1, r2 = [], []
        for v in l:
            inn = [u for u in nb[v] if u not in bset]
            d = (P[inn].mean(0) - P[v]) if inn else -nrm[v] * 0.0
            d = d - nrm[v] * np.dot(d, nrm[v])
            dn = np.linalg.norm(d)
            d = d / dn if dn > 1e-9 else np.zeros(3)
            a = P[v] - nrm[v] * thickness
            r1.append(len(newP) + base); newP.append(a)
            r2.append(len(newP) + base); newP.append(a + d * turn)
        for i in range(n):
            j = (i + 1) % n
            a, b = l[i], l[j]
            F.append((b, a, r1[i], r1[j]))
            F.append((r1[j], r1[i], r2[i], r2[j]))
    P2 = np.vstack([P, np.asarray(newP)]) if newP else P
    return P2, F, len(newP)
