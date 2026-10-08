"""Post-fixes applied in place to already built characters (cache/<id>.json + .bin), so a fix
that only needs the finished meshes does not cost a full rebuild.

    <bpy python> -I scenes/lib/humans/offline/postfix.py shoes|puckers|props|normals|pushout|cull|renormal|holefill|reao|all id [id ...]   ('all' = every cache)

Each pass records itself in the mesh's 'postfix' list and is not applied twice.

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


def _maxf(a, r, axis):
    """1D max filter (window 2r+1) along axis, edges clamped."""
    out = a.copy()
    for k in range(1, r + 1):
        out = np.maximum(out, np.roll(a, k, axis=axis))
        out = np.maximum(out, np.roll(a, -k, axis=axis))
    return out


def _minf(a, r, axis):
    out = a.copy()
    for k in range(1, r + 1):
        out = np.minimum(out, np.roll(a, k, axis=axis))
        out = np.minimum(out, np.roll(a, -k, axis=axis))
    return out


def _blur(a, it=2):
    for _ in range(it):
        a = 0.25 * np.roll(a, 1, 0) + 0.5 * a + 0.25 * np.roll(a, -1, 0)
        a = 0.25 * np.roll(a, 1, 1) + 0.5 * a + 0.25 * np.roll(a, -1, 1)
    return a


def _bilinear(G, fi, fj):
    i0 = np.clip(np.floor(fi).astype(int), 0, G.shape[0] - 2)
    j0 = np.clip(np.floor(fj).astype(int), 0, G.shape[1] - 2)
    a, b = np.clip(fi - i0, 0, 1), np.clip(fj - j0, 0, 1)
    return (G[i0, j0] * (1 - a) * (1 - b) + G[i0 + 1, j0] * a * (1 - b)
            + G[i0, j0 + 1] * (1 - a) * b + G[i0 + 1, j0 + 1] * a * b)


def close_toes(P, tris, foot_h=0.085, ease=0.004, toe_room=0.012, spring=0.006, seated=False):
    """A shoe is made on a last, not on a foot: the toes' relief (gaps between the toes on top
    and between the toe tips in front) is closed and the toe box gets room.

    Per foot, the forefoot is star-shaped seen from a point over the ball of the foot: its surface
    is a radius map r(azimuth, elevation). That map is grey-closed (max filter then min filter,
    ~20 degrees: fills every dip narrower than a toe gap but keeps the foot's outline), blurred,
    and given room (ease all round, more toward the toe tip); the forefoot vertices move along
    their rays onto it, then are relaxed and re-projected (no clustering where the gaps were).
    The sole stays flat on the ground (with a little toe spring) unless seated.
    Returns (positions, normals) per input vertex."""
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
    # the two feet: split at the widest gap in x
    xs = np.sort(Q[:, 0])
    gi = np.argmax(np.diff(xs))
    xsplit = 0.5 * (xs[gi] + xs[gi + 1]) if len(xs) > 1 else 0.0
    DA = np.radians(3.0)
    for side in (Q[:, 0] >= xsplit, Q[:, 0] < xsplit):
        if side.sum() < 30:
            continue
        y0 = Q[side, 1].min()
        foot = side & (Q[:, 1] < y0 + foot_h)
        low = side & (Q[:, 1] < y0 + 0.035)
        if low.sum() < 20:
            continue
        cxz = Q[low][:, [0, 2]].mean(0)
        X = Q[low][:, [0, 2]] - cxz
        ev, evec = np.linalg.eigh(X.T @ X)
        f2 = evec[:, -1]
        u = X @ f2
        lo, hi = np.quantile(u, 0.01), u.max()
        # the toe end is the end far from the leg (the ankle stands over the heel end)
        leg = side & (Q[:, 1] > y0 + foot_h - 0.01) & (Q[:, 1] < y0 + foot_h + 0.03)
        ua = ((Q[leg][:, [0, 2]] - cxz) @ f2).mean() if leg.sum() > 5 else 0.0
        if ua > 0.5 * (lo + hi):
            f2 = -f2
            u = -u
            lo, hi = np.quantile(u, 0.01), u.max()
        l2 = np.array([-f2[1], f2[0]])
        L = hi - lo
        uu = (Q[:, [0, 2]] - cxz) @ f2
        vv = (Q[:, [0, 2]] - cxz) @ l2
        ub = lo + 0.6 * L                                   # over the ball of the foot
        sl = foot & (np.abs(uu - ub) < 0.015)
        vc = 0.5 * (vv[sl].min() + vv[sl].max()) if sl.sum() > 3 else 0.0
        C = np.array([cxz[0], y0 + 0.032, cxz[1]]) + np.array([f2[0], 0, f2[1]]) * ub + np.array([l2[0], 0, l2[1]]) * vc
        reg = foot & (uu > lo + 0.42 * L)
        idx = np.where(reg)[0]
        if len(idx) < 20:
            continue

        def sph(Xp):
            d = Xp - C
            du = d[:, 0] * f2[0] + d[:, 2] * f2[1]
            dv = d[:, 0] * l2[0] + d[:, 2] * l2[1]
            r = np.linalg.norm(d, axis=1)
            az = np.arctan2(dv, du)
            el = np.arcsin(np.clip(d[:, 1] / np.maximum(r, 1e-9), -1, 1))
            return az, el, r, du, dv
        az, el, r, du, dv = sph(Q[idx])
        na, ne = int(np.ceil(2 * np.pi / DA)), int(np.ceil(np.pi / DA)) + 1
        ia = np.clip(((az + np.pi) / DA).astype(int), 0, na - 1)
        ie = np.clip(((el + np.pi / 2) / DA).astype(int), 0, ne - 1)
        G = np.full((na, ne), -1.0)
        np.maximum.at(G, (ia, ie), r)
        # fill empty cells from their neighbours (azimuth wraps)
        for _ in range(60):
            emp = G < 0
            if not emp.any():
                break
            acc = np.zeros_like(G); n_ = np.zeros_like(G)
            for sh, ax in ((1, 0), (-1, 0), (1, 1), (-1, 1)):
                Gs = np.roll(G, sh, axis=ax)
                ok = Gs >= 0
                acc += np.where(ok, Gs, 0); n_ += ok
            fill = emp & (n_ > 0)
            G[fill] = acc[fill] / n_[fill]
        G[G < 0] = np.median(r)
        # grey closing: fills dips narrower than ~13 cells (39 deg) - the gaps between the toes
        Gc = _minf(_minf(_maxf(_maxf(G, 6, 0), 6, 1), 6, 0), 6, 1)
        Gc = _blur(Gc, 8)
        # room: ease all round, more toward the toe tip (forward, low)
        A = (np.arange(na) + 0.5) * DA - np.pi
        E = (np.arange(ne) + 0.5) * DA - np.pi / 2
        fwd = np.clip(np.cos(A), 0, 1)[:, None] ** 2 * np.clip(np.cos(E), 0, 1)[None, :] ** 2
        Gc = Gc + ease + toe_room * fwd

        def project(Xp):
            az_, el_, r_, _, _ = sph(Xp)
            fi = (az_ + np.pi) / DA - 0.5
            fj = (el_ + np.pi / 2) / DA - 0.5
            rn = _bilinear(Gc, fi % na, np.clip(fj, 0, ne - 1))
            d = (Xp - C) / np.maximum(r_, 1e-9)[:, None]
            return C + d * rn[:, None]
        # blend in from the arch to the ball, and fade out toward the instep top
        bl = np.clip((uu[idx] - (lo + 0.42 * L)) / (0.12 * L), 0, 1)
        bl *= np.clip((y0 + foot_h - Q[idx, 1]) / 0.03, 0, 1)
        bl = bl * bl * (3 - 2 * bl)
        tgt = project(Q[idx])
        cur = Q.copy()
        cur[idx] = Q[idx] + (tgt - Q[idx]) * bl[:, None]
        # relax tangentially + re-project (vertices bunched where the gaps were spread out)
        wt = np.zeros(nW); wt[idx] = bl
        for _ in range(30):
            avg = np.stack([np.bincount(a, weights=cur[b, k], minlength=nW) for k in range(3)], 1) / deg[:, None]
            nxt = cur + (0.6 * wt)[:, None] * (avg - cur)
            pr = project(nxt[idx])
            nxt[idx] = nxt[idx] + (pr - nxt[idx]) * bl[:, None]
            cur = nxt
        if not seated:
            # flat sole with a little toe spring toward the tip
            ut = (uu[idx] - (lo + 0.78 * L)) / (0.22 * L)
            sp = spring * np.clip(ut, 0, 1) ** 2
            h_ = np.clip(1 - (cur[idx, 1] - y0) / 0.03, 0, 1)
            cur[idx, 1] = np.maximum(cur[idx, 1], y0) + sp * h_
        out[idx] = cur[idx]
    return out[w], normals(out)[w]


def breast_weight(h, bin_, m):
    """Per-vertex skin weight of the breast bones (0 when the rig has none)."""
    names = [b_['name'] for b_ in h['bones']]
    SI = view(bin_, m['attrs']['skinIndex']).astype(int)
    SW = view(bin_, m['attrs']['skinWeight']).astype(float)
    out = np.zeros(len(SI))
    for bn in ('breast.L', 'breast.R'):
        if bn in names:
            out += (SW * (SI == names.index(bn))).sum(1)
    return out


def layer_skip(h, bin_, m, T):
    """Faces of a garment layer over the bust (skinned to the breast bones): the layer above it
    is not pushed out of them (it bridges the bust in the simulation)."""
    if 'skinIndex' not in m['attrs']:
        return None
    bw = breast_weight(h, bin_, m)
    return (bw[T] > 0.2).any(1)


def body_collider(P, T, bw=None):
    """The body as the cloth passes see it: welded, all its triangles (hidden ones too when the
    cache carries colliderIndex), Taubin-smoothed over ~2 cm - small relief (nipples, navel,
    knuckles) goes, the volume of the limbs stays (plain Laplacian smoothing shrinks an arm and
    the cloth sank into it). Returns (positions, triangles) welded."""
    key = np.round(P / 1e-5).astype(np.int64)
    _, w = np.unique(key, axis=0, return_inverse=True)
    w = w.reshape(-1)
    nW = int(w.max()) + 1
    Q = np.zeros((nW, 3))
    Q[w] = P
    t = w[T]
    t = t[(t[:, 0] != t[:, 1]) & (t[:, 1] != t[:, 2]) & (t[:, 0] != t[:, 2])]
    e = np.unique(np.sort(np.concatenate([t[:, [0, 1]], t[:, [1, 2]], t[:, [2, 0]]]), axis=1), axis=0)
    a, b = np.concatenate([e[:, 0], e[:, 1]]), np.concatenate([e[:, 1], e[:, 0]])
    deg = np.bincount(a, minlength=nW).astype(float)
    has = deg > 0
    deg = np.maximum(deg, 1)
    el = np.linalg.norm(Q[e[:, 0]] - Q[e[:, 1]], axis=1).mean()

    def U(X):
        return (np.stack([np.bincount(a, weights=X[b, k], minlength=nW) for k in range(3)], 1) / deg[:, None] - X) * has[:, None]
    S = Q.copy()
    for _ in range(int(np.clip(20 * (0.0055 / max(el, 1e-4)) ** 2, 20, 200))):
        S = S + 0.5 * U(S)
        S = S - 0.53 * U(S)
    # the bust is not a collider surface: cloth over it hangs from the apex (the simulation's
    # undergarment collider bridged it); pushing cloth out to a few mm over it shrink-wraps it
    skip = None
    if bw is not None:
        bww = np.zeros(nW)
        np.maximum.at(bww, w, bw)
        skip = (bww[t] > 0.2).any(1)
    return S, t, skip


# garments whose gathers are made on purpose (cap / coif rims, kerchief knots) are left alone
NO_PUCKER = ('boots', 'shoes', 'cap', 'coif', 'hood', 'kerchief', 'kerchieftail', 'veil', 'sling')


def smooth_puckers(P, tris, thresh=0.08, iters=80, push=None, spots=None, normals=None, max_in=0.002, protect_y=None):
    """Simulated cloth inherits the body mesh's poles (nipples, navel) and crumples where the
    simulation pinched it (armpits, crossed arms): small radial puckers that read as points
    pushing through the cloth. A fold bends the surface in ONE direction, a pucker in all of
    them: the second eigenvalue of the normals' scatter over two rings finds puckers and not
    folds. Those spots (plus two rings) are Laplacian-smoothed with the open edges fixed.
    Returns (positions, normals, changed-mask) per input vertex."""
    key = np.round(P / 1e-5).astype(np.int64)
    _, w = np.unique(key, axis=0, return_inverse=True)
    w = w.reshape(-1)
    nW = int(w.max()) + 1
    cnt = np.bincount(w, minlength=nW).astype(float)
    Q = np.stack([np.bincount(w, weights=P[:, k], minlength=nW) for k in range(3)], 1) / cnt[:, None]
    tw = w[tris]
    tw = tw[(tw[:, 0] != tw[:, 1]) & (tw[:, 1] != tw[:, 2]) & (tw[:, 0] != tw[:, 2])]
    e = np.sort(np.concatenate([tw[:, [0, 1]], tw[:, [1, 2]], tw[:, [2, 0]]]), axis=1)
    eu, ec = np.unique(e, axis=0, return_counts=True)
    bnd = np.zeros(nW, bool)
    bnd[eu[ec == 1].ravel()] = True
    a = np.concatenate([eu[:, 0], eu[:, 1]])
    b = np.concatenate([eu[:, 1], eu[:, 0]])
    deg = np.maximum(np.bincount(a, minlength=nW), 1).astype(float)

    def ring(X):
        return (np.stack([np.bincount(a, weights=X[b, k], minlength=nW) for k in range(X.shape[1])], 1) + X) / (deg[:, None] + 1)

    def vnorm(X):
        fn = np.cross(X[tw[:, 1]] - X[tw[:, 0]], X[tw[:, 2]] - X[tw[:, 0]])
        Nn = np.zeros_like(X)
        for k in range(3):
            np.add.at(Nn, tw[:, k], fn)
        return Nn / np.maximum(np.linalg.norm(Nn, axis=1, keepdims=True), 1e-12)
    N = vnorm(Q)
    M = ring(ring(np.einsum('ij,ik->ijk', N, N).reshape(nW, 9)))
    m1 = ring(ring(N))
    lam2 = np.linalg.eigvalsh(M.reshape(nW, 3, 3) - np.einsum('ij,ik->ijk', m1, m1))[:, 1]
    # not at the open edges (hems, cuffs, necklines bend sharply on purpose)
    nearb = bnd.astype(float)
    for _ in range(2):
        nearb = np.maximum(nearb, np.bincount(a, weights=nearb[b], minlength=nW) > 0)
    s = np.clip((lam2 - thresh) / thresh, 0, 1)
    if protect_y is not None:
        # band collars and neckline gathers fold sharply on purpose (a membrane over them pulled
        # the band into the neckline: slits along every collar)
        s = s * np.clip((protect_y - Q[:, 1]) / 0.02, 0, 1)
    Nm0 = vnorm(Q)
    for _ in range(3):
        Nm0 = ring(Nm0)
    Nm0 = Nm0 / np.maximum(np.linalg.norm(Nm0, axis=1, keepdims=True), 1e-12)
    if normals is not None:                             # outward as built
        Nw = np.zeros((nW, 3))
        np.add.at(Nw, w, normals)
        Nm0 = Nm0 * (1.0 if np.einsum('ij,ij->', Nm0, Nw) >= 0 else -1.0)
    # a pucker is a twisted star of long triangles round a knot of vertices: the whole star is
    # re-made as a smooth membrane spanning it (many Laplacian steps converge to the harmonic
    # fill of its rim), kept outside the body / the layers under it by `push`
    for k_ in range(3):                                 # dilate three rings, then soften
        mx = np.zeros(nW)
        np.maximum.at(mx, a, s[b])
        s = np.maximum(s, mx * (0.95 if k_ < 2 else 0.6))
    s = ring(s[:, None])[:, 0] * (1 - nearb)
    X = Q.copy()
    ch = np.where(s > 0.01)[0]
    def U(Y):
        return np.stack([np.bincount(a, weights=Y[b, k], minlength=nW) for k in range(3)], 1) / deg[:, None] - Y
    # the pucker cores: a membrane (Laplacian steps converge to the harmonic fill of the rim -
    # it untwists the star; the regions are small, so it hardly flattens the body's curvature)
    for it in range(iters):
        X = X + (0.7 * s)[:, None] * U(X)
        # never more than max_in inward of where the cloth was: a membrane over a sleeve-sized
        # region collapses the tube toward its axis (a guard's sleeves became strings)
        if normals is not None:
            dn = np.einsum('ij,ij->i', X - Q, Nm0)
            X = X + Nm0 * np.maximum(0.0, -max_in - dn)[:, None]
        if push is not None and it % 20 == 19 and len(ch):
            X[ch] = push(X[ch])
    # spots where the body itself printed through (nipples): the cloth there is re-made as the
    # quadric that fits the cloth AROUND the spot (keeps the dome, loses the point), with the
    # vertices re-spread over it (a 2D harmonic relaxation inside the fitted rim)
    s_sp = np.zeros(nW)
    for c in (spots or []):
        d = np.linalg.norm(X - c, axis=1)
        near = np.where(d < 0.09)[0]
        if len(near) < 12:
            continue
        n = Nm0[near[d[near] < 0.03]].mean(0) if (d[near] < 0.03).any() else None
        if n is None or np.linalg.norm(n) < 1e-6:
            continue
        n = n / np.linalg.norm(n)
        t1 = np.cross(n, [0.0, 1.0, 0.0])
        t1 = t1 / max(np.linalg.norm(t1), 1e-9)
        t2 = np.cross(n, t1)
        R = X - c
        uu, vv, hh = R @ t1, R @ t2, R @ n
        facing = Nm0 @ n > 0.5
        r = np.sqrt(uu ** 2 + vv ** 2)
        Rin = 0.042
        ann = facing & (r > Rin) & (r < Rin + 0.035) & (np.abs(hh) < 0.05)
        if ann.sum() < 8:
            continue
        A_ = np.stack([np.ones(ann.sum()), uu[ann], vv[ann], uu[ann] ** 2, uu[ann] * vv[ann], vv[ann] ** 2], 1)
        coef = np.linalg.lstsq(A_, hh[ann], rcond=None)[0]
        inner = facing & (r < Rin + 0.012) & (np.abs(hh) < 0.05) & ~bnd
        wgt = np.clip((Rin + 0.012 - r) / 0.024, 0, 1)
        wgt = wgt * wgt * (3 - 2 * wgt)
        # re-spread inside (2D harmonic, the outer vertices fixed)
        U2 = np.stack([uu, vv], 1)
        free = inner & (r < Rin)
        for _ in range(600):
            avg2 = np.stack([np.bincount(a, weights=U2[b, k], minlength=nW) for k in range(2)], 1) / deg[:, None]
            U2[free] = avg2[free]
        u2, v2 = U2[:, 0], U2[:, 1]
        hfit = coef[0] + coef[1] * u2 + coef[2] * v2 + coef[3] * u2 ** 2 + coef[4] * u2 * v2 + coef[5] * v2 ** 2
        tgt = c + np.outer(u2, t1) + np.outer(v2, t2) + np.outer(hfit, n)
        sel = inner
        X[sel] = X[sel] + (tgt[sel] - X[sel]) * wgt[sel, None]
        s_sp[sel] = np.maximum(s_sp[sel], wgt[sel])
    s = np.maximum(s, s_sp)
    ch = np.where(s > 0.01)[0]
    if push is not None and len(ch):
        X[ch] = push(X[ch])
    changed = s > 1e-3
    N2 = vnorm(X)
    return X[w], N2[w], changed[w]


def fix_shoes(cid):
    jp, bp = os.path.join(CACHE, cid + '.json'), os.path.join(CACHE, cid + '.bin')
    h = json.load(open(jp))
    bin_ = bytearray(open(bp, 'rb').read())
    done = []
    seated = h['meta'].get('pose', '').startswith('ride')
    for m in h['meshes']:
        if m['kind'] != 'cloth' or m['name'] not in ('boots', 'shoes'):
            continue
        if 'lasts2' in m.get('postfix', []):          # already made on a last (not twice: room adds up)
            continue
        A = m['attrs']
        P = view(bin_, A['position']).astype(float)
        tris = np.frombuffer(bin_, dtype=TYPES[m['index']['type']], count=m['index']['count'], offset=m['index']['offset']).reshape(-1, 3).astype(np.int64)
        P2, N2 = close_toes(P, tris, seated=seated)
        m['postfix'] = m.get('postfix', []) + ['lasts2', 'normals2']
        # keep the original orientation (outward as built) - decided for the whole mesh: a
        # vertex that sat in a toe gap had a sideways normal, a per-vertex vote turns it inward
        N0 = view(bin_, A['normal']).astype(float)
        N2 = N2 * (1.0 if np.einsum('ij,ij->', N0, N2) >= 0 else -1.0)
        put(bin_, A['position'], P2)
        put(bin_, A['normal'], N2)
        done.append(m['name'])
    if not done:
        print(f'{cid}: no shoes')
        return
    tmp = bp + '.tmp'
    open(tmp, 'wb').write(bin_)
    os.replace(tmp, bp)
    json.dump(h, open(jp + '.tmp', 'w'), separators=(',', ':'))
    os.replace(jp + '.tmp', jp)
    print(f'{cid}: {", ".join(done)} made on a last (toes closed, toe room)', flush=True)


def fix_puckers(cid):
    jp, bp = os.path.join(CACHE, cid + '.json'), os.path.join(CACHE, cid + '.bin')
    h = json.load(open(jp))
    bin_ = bytearray(open(bp, 'rb').read())
    done = []
    # colliders: the body, then each garment as it is done (layers are exported inside-out)
    import bpy  # noqa: F401  (mathutils comes with Blender's module)
    from mathutils import Vector
    from mathutils.bvhtree import BVHTree

    def mesh_arrays(m, full=False):
        P = view(bin_, m['attrs']['position']).astype(float)
        ix = m['colliderIndex'] if full and 'colliderIndex' in m else m['index']
        T = np.frombuffer(bin_, dtype=TYPES[ix['type']], count=ix['count'], offset=ix['offset']).reshape(-1, 3).astype(np.int64)
        return P, T
    # the body as the cloth sees it: smoothed (a nipple or the navel should not print through
    # cloth - a garment bridges them); the cloth over the nipples is re-made (smooth_puckers)
    body = [m for m in h['meshes'] if m['kind'] == 'skin']
    trees, pts = [], []
    bones = {b_['name']: b_ for b_ in h['bones']}
    neck_y = (bones['neck01']['p'][1] - 0.05) if 'neck01' in bones else None
    if body:
        Pb, Tb = mesh_arrays(body[0], full=True)
        key = np.round(Pb / 1e-5).astype(np.int64)
        _, wb = np.unique(key, axis=0, return_inverse=True)
        wb = wb.reshape(-1)
        nB = int(wb.max()) + 1
        Qb = np.zeros((nB, 3))
        Qb[wb] = Pb
        # collider: the Taubin-smoothed body (no nipples to print through, limbs keep volume)
        Sc, Tc, skip = body_collider(Pb, Tb, breast_weight(h, bin_, body[0]))
        trees.append((BVHTree.FromPolygons(Sc.tolist(), Tc.tolist(), all_triangles=True), 0.004, skip))
        # the nipples: the breast-weighted point furthest forward, one each side
        # candidates: skin weighted to the breast bones (not the hands, which may be in front)
        names = [b_['name'] for b_ in h['bones']]
        SI = view(bin_, body[0]['attrs']['skinIndex']).astype(int)
        SW = view(bin_, body[0]['attrs']['skinWeight']).astype(float)
        for bn in ('breast.L', 'breast.R'):
            if bn not in names:
                continue
            bi = names.index(bn)
            wv = np.zeros(nB)
            np.maximum.at(wv, wb, (SW * (SI == bi)).sum(1))
            c_ = np.where(wv > 0.4)[0]
            if len(c_):
                pts.append(Qb[c_[np.argmax(Qb[c_, 2])]])
        if os.environ.get('POSTFIX_DEBUG'):
            print('  nipple points', [p_.round(3).tolist() for p_ in pts])


    def push(X):
        X = X.copy()
        for tree, ease, skip_ in trees:
            for i in range(len(X)):
                loc, n, fi, d = tree.find_nearest(Vector(X[i]), 0.03)
                if loc is None or (skip_ is not None and skip_[fi]):
                    continue
                q = np.array(loc)
                nn = np.array(n)
                dd = np.dot(X[i] - q, nn)
                if dd < ease:
                    X[i] = X[i] + nn * (ease - dd)
        return X
    for m in h['meshes']:
        if m['kind'] != 'cloth' or m['name'] in NO_PUCKER or 'puckers' in m.get('postfix', []):
            if m['kind'] == 'cloth' and m['name'] not in ('boots', 'shoes'):
                P_, T_ = mesh_arrays(m)
                trees.append((BVHTree.FromPolygons([tuple(v) for v in P_], [tuple(t) for t in T_], epsilon=0.0), 0.002, layer_skip(h, bin_, m, T_)))
            continue
        A = m['attrs']
        P, tris = mesh_arrays(m)
        N0_ = view(bin_, A['normal']).astype(float)
        P2, N2, ch = smooth_puckers(P, tris, push=push, spots=pts, normals=N0_, protect_y=neck_y)
        N0 = view(bin_, A['normal']).astype(float)
        N2 = N2 * (1.0 if np.einsum('ij,ij->', N0, N2) >= 0 else -1.0)
        N2[~ch] = N0[~ch]
        put(bin_, A['position'], P2)
        put(bin_, A['normal'], N2)
        m['postfix'] = m.get('postfix', []) + ['puckers', 'normals2']
        done.append(f"{m['name']} ({int(ch.sum())} v)")
        trees.append((BVHTree.FromPolygons([tuple(v) for v in P2], [tuple(t) for t in tris], epsilon=0.0), 0.002, layer_skip(h, bin_, m, tris)))
    if not done:
        return
    tmp = bp + '.tmp'
    open(tmp, 'wb').write(bin_)
    os.replace(tmp, bp)
    json.dump(h, open(jp + '.tmp', 'w'), separators=(',', ':'))
    os.replace(jp + '.tmp', jp)
    print(f'{cid}: puckers smoothed in {", ".join(done)}', flush=True)


# prop colours corrected after the caches were built (json only): name -> material overrides
PROP_FIX = {
    'crate_crate_0': {'color': [0.33, 0.26, 0.18]},           # was near-white (0.62 linear) pine
    'parcel_cloth_0': {'color': [0.36, 0.3, 0.22]},
    'kettle_hat_hat_0': {'color': [0.3, 0.29, 0.28], 'rough': 0.62},   # read as chrome
    'spear_head_1': {'color': [0.46, 0.46, 0.47], 'rough': 0.45},
    'spear_ferrule_2': {'color': [0.36, 0.35, 0.34], 'rough': 0.66},
    'sword_guard_1': {'color': [0.36, 0.35, 0.34], 'rough': 0.66},
    'buckle': {'color': [0.36, 0.35, 0.34], 'rough': 0.6},
}


def fix_props(cid):
    jp = os.path.join(CACHE, cid + '.json')
    h = json.load(open(jp))
    done = []
    for m in h['meshes']:
        fx = PROP_FIX.get(m['name'])
        if m['kind'] == 'prop' and fx and any(m['material'].get(k) != v for k, v in fx.items()):
            m['material'].update(fx)
            done.append(m['name'])
    if done:
        json.dump(h, open(jp + '.tmp', 'w'), separators=(',', ':'))
        os.replace(jp + '.tmp', jp)
        print(f'{cid}: prop colours {", ".join(done)}', flush=True)


def fresh_normals(P, tris):
    key = np.round(P / 1e-5).astype(np.int64)
    _, w = np.unique(key, axis=0, return_inverse=True)
    w = w.reshape(-1)
    nW = int(w.max()) + 1
    Q = np.zeros((nW, 3))
    Q[w] = P
    tw = w[tris]
    fn = np.cross(Q[tw[:, 1]] - Q[tw[:, 0]], Q[tw[:, 2]] - Q[tw[:, 0]])
    N = np.zeros_like(Q)
    for k in range(3):
        np.add.at(N, tw[:, k], fn)
    N /= np.maximum(np.linalg.norm(N, axis=1, keepdims=True), 1e-12)
    return N[w]


def fix_normals(cid):
    """Caches post-fixed before 'normals2': the shoe / pucker passes voted the normal
    orientation per vertex (toe-gap and pucker vertices came out inward - dark slits). The mesh
    orientation is voted once for the whole mesh; vertices that disagree with it are turned."""
    jp, bp = os.path.join(CACHE, cid + '.json'), os.path.join(CACHE, cid + '.bin')
    h = json.load(open(jp))
    bin_ = bytearray(open(bp, 'rb').read())
    done = []
    for m in h['meshes']:
        pf_ = m.get('postfix', [])
        if 'normals2' in pf_ or not ({'lasts2', 'puckers'} & set(pf_)):
            continue
        A = m['attrs']
        P = view(bin_, A['position']).astype(float)
        tris = np.frombuffer(bin_, dtype=TYPES[m['index']['type']], count=m['index']['count'], offset=m['index']['offset']).reshape(-1, 3).astype(np.int64)
        N0 = view(bin_, A['normal']).astype(float)
        Nf = fresh_normals(P, tris)
        Nf *= 1.0 if np.einsum('ij,ij->', N0, Nf) >= 0 else -1.0
        if 'lasts2' in pf_:
            N2 = Nf
        else:
            N2 = N0.copy()
            bad = np.einsum('ij,ij->i', N0, Nf) < 0
            N2[bad] = Nf[bad]
        put(bin_, A['normal'], N2)
        m['postfix'] = pf_ + ['normals2']
        done.append(m['name'])
    if not done:
        return
    tmp = bp + '.tmp'
    open(tmp, 'wb').write(bin_)
    os.replace(tmp, bp)
    json.dump(h, open(jp + '.tmp', 'w'), separators=(',', ':'))
    os.replace(jp + '.tmp', jp)
    print(f'{cid}: normals re-oriented in {", ".join(done)}', flush=True)


def fix_pushout(cid, body_ease=0.004, layer_ease=0.0025):
    """Cloth that lies inside the skin or inside the garment under it is pushed out (the skin
    or a shirt showed through in patches - shoulders, elbows - after the pucker pass of the first
    session-4 caches, whose collider was an over-smoothed, shrunken body). Layers are done
    inside-out (export order); each push is spread over three rings so the cloth bulges over
    what is under it instead of spiking."""
    import bpy  # noqa: F401
    from mathutils import Vector
    from mathutils.bvhtree import BVHTree
    jp, bp = os.path.join(CACHE, cid + '.json'), os.path.join(CACHE, cid + '.bin')
    h = json.load(open(jp))
    bin_ = bytearray(open(bp, 'rb').read())

    def arrays(m, full=False):
        P = view(bin_, m['attrs']['position']).astype(float)
        ix = m['colliderIndex'] if full and 'colliderIndex' in m else m['index']
        T = np.frombuffer(bin_, dtype=TYPES[ix['type']], count=ix['count'], offset=ix['offset']).reshape(-1, 3).astype(np.int64)
        return P, T
    trees = []
    for m in h['meshes']:
        if m['kind'] == 'skin':
            # the whole body (hidden faces too) when the cache carries it, Taubin-smoothed
            P, T = arrays(m, full=True)
            Sc, Tc, skip = body_collider(P, T, breast_weight(h, bin_, m))
            trees.append((BVHTree.FromPolygons(Sc.tolist(), Tc.tolist(), all_triangles=True), body_ease, skip))
    done = []
    for m in h['meshes']:
        if m['kind'] != 'cloth' or m['name'] in ('boots', 'shoes'):
            continue
        P, T = arrays(m)
        if 'pushout' not in m.get('postfix', []) and m['name'] not in NO_PUCKER:
            key = np.round(P / 1e-5).astype(np.int64)
            _, w = np.unique(key, axis=0, return_inverse=True)
            w = w.reshape(-1)
            nW = int(w.max()) + 1
            Q = np.zeros((nW, 3))
            Q[w] = P
            tw = w[T]
            e = np.unique(np.sort(np.concatenate([tw[:, [0, 1]], tw[:, [1, 2]], tw[:, [2, 0]]]), axis=1), axis=0)
            ea, eb = np.concatenate([e[:, 0], e[:, 1]]), np.concatenate([e[:, 1], e[:, 0]])
            deg = np.maximum(np.bincount(ea, minlength=nW), 1).astype(float)
            moved = np.zeros(nW, bool)
            for _round in range(3):
                D = np.zeros((nW, 3))
                for tree, ease, skip_ in trees:
                    for i in range(nW):
                        loc, n, fi, d = tree.find_nearest(Vector(Q[i] + D[i]), 0.03)
                        if loc is None or (skip_ is not None and skip_[fi]):
                            continue
                        q, nn = np.array(loc), np.array(n)
                        dd = np.dot(Q[i] + D[i] - q, nn)
                        if dd < ease and dd > -0.025:
                            D[i] += nn * (ease - dd)
                hit = np.linalg.norm(D, axis=1) > 1e-6
                if not hit.any():
                    break
                moved |= hit
                # spread: the neighbours follow (max-type spread keeps the full push at the hit)
                for _ in range(3):
                    avg = np.stack([np.bincount(ea, weights=D[eb, k], minlength=nW) for k in range(3)], 1) / deg[:, None]
                    big = np.linalg.norm(avg, axis=1) > np.linalg.norm(D, axis=1)
                    D[big] = 0.5 * (D[big] + avg[big])
                Q = Q + D
                moved |= np.linalg.norm(D, axis=1) > 1e-6
            if moved.any():
                P2 = Q[w]
                N0 = view(bin_, m['attrs']['normal']).astype(float)
                Nf = fresh_normals(P2, T)
                Nf *= 1.0 if np.einsum('ij,ij->', N0, Nf) >= 0 else -1.0
                ch = moved[w]
                N2 = N0.copy()
                N2[ch] = Nf[ch]
                put(bin_, m['attrs']['position'], P2)
                put(bin_, m['attrs']['normal'], N2)
                P = P2
                done.append(f"{m['name']} ({int(moved.sum())} v)")
            m['postfix'] = m.get('postfix', []) + ['pushout']
        trees.append((BVHTree.FromPolygons(P.tolist(), T.tolist(), all_triangles=True), layer_ease, layer_skip(h, bin_, m, T)))
    tmp = bp + '.tmp'
    open(tmp, 'wb').write(bin_)
    os.replace(tmp, bp)
    json.dump(h, open(jp + '.tmp', 'w'), separators=(',', ':'))
    os.replace(jp + '.tmp', jp)
    if done:
        print(f'{cid}: pushed out {", ".join(done)}', flush=True)


OPAQUE_OVER = ('coat', 'tunic', 'gown', 'kirtle', 'cloak', 'apron', 'gambeson', 'surcoat', 'hoodcape', 'hood', 'veil', 'sling')


def fix_cull(cid):
    """Cloth under another garment is not drawn where that garment covers it (as the skin under
    the clothes is not): a shirt cannot poke through a tunic at the nipples or the elbows. A
    vertex is covered when a ray along its normal (started 1 cm inside) meets an outer layer
    within 5 cm; triangles whose vertices are all covered, one ring in from any uncovered
    vertex, become degenerate (the buffer keeps its size)."""
    import bpy  # noqa: F401
    from mathutils import Vector
    from mathutils.bvhtree import BVHTree
    jp, bp = os.path.join(CACHE, cid + '.json'), os.path.join(CACHE, cid + '.bin')
    h = json.load(open(jp))
    bin_ = bytearray(open(bp, 'rb').read())
    cloth = [m for m in h['meshes'] if m['kind'] == 'cloth' and m['name'] not in ('boots', 'shoes')]

    def arrays(m):
        P = view(bin_, m['attrs']['position']).astype(float)
        T = np.frombuffer(bin_, dtype=TYPES[m['index']['type']], count=m['index']['count'], offset=m['index']['offset']).reshape(-1, 3).astype(np.int64)
        return P, T
    done = []
    for k, m in enumerate(cloth):
        if 'cull' in m.get('postfix', []):
            continue
        outer = [o for o in cloth[k + 1:] if o['name'] in OPAQUE_OVER or o['name'].startswith(OPAQUE_OVER)]
        if not outer:
            m['postfix'] = m.get('postfix', []) + ['cull']
            continue
        Ps, Ts, off = [], [], 0
        for o in outer:
            P_, T_ = arrays(o)
            Ps.append(P_)
            Ts.append(T_ + off)
            off += len(P_)
        tree = BVHTree.FromPolygons(np.vstack(Ps).tolist(), np.vstack(Ts).tolist(), all_triangles=True)
        P, T = arrays(m)
        N = view(bin_, m['attrs']['normal']).astype(float)
        cov = np.zeros(len(P), bool)
        for i in range(len(P)):
            n = N[i] / max(np.linalg.norm(N[i]), 1e-9)
            hit = tree.ray_cast(Vector(P[i] - n * 0.01), Vector(n), 0.06)
            cov[i] = hit[0] is not None
        # erode two rings (welded): keep a margin round every edge of the outer garment; never
        # within three rings of this garment's own openings (collar tops, cuffs, hems)
        key = np.round(P / 1e-5).astype(np.int64)
        _, w = np.unique(key, axis=0, return_inverse=True)
        w = w.reshape(-1)
        nW = int(w.max()) + 1
        cw = np.ones(nW, bool)
        np.logical_and.at(cw, w, cov)
        tw = w[T]
        e = np.concatenate([tw[:, [0, 1]], tw[:, [1, 2]], tw[:, [2, 0]]])
        und = np.sort(e, axis=1)
        _, inv, cnt = np.unique(und, axis=0, return_inverse=True, return_counts=True)
        near = np.zeros(nW, bool)
        near[e[cnt[inv.reshape(-1)] == 1].reshape(-1)] = True
        for _ in range(3):
            nb_ = near.copy()
            np.logical_or.at(nb_, e[:, 0], near[e[:, 1]])
            np.logical_or.at(nb_, e[:, 1], near[e[:, 0]])
            near = nb_
        ok = cw & ~near
        for _ in range(2):
            o2 = ok.copy()
            np.logical_and.at(o2, e[:, 0], ok[e[:, 1]])
            np.logical_and.at(o2, e[:, 1], ok[e[:, 0]])
            ok = o2
        drop = ok[tw].all(1)
        if drop.any():
            T2 = T.copy()
            T2[drop] = T2[drop][:, :1]
            put(bin_, m['index'], T2)
            done.append(f"{m['name']} ({int(drop.sum())}/{len(T)} tris)")
        m['postfix'] = m.get('postfix', []) + ['cull']
    tmp = bp + '.tmp'
    open(tmp, 'wb').write(bin_)
    os.replace(tmp, bp)
    json.dump(h, open(jp + '.tmp', 'w'), separators=(',', ':'))
    os.replace(jp + '.tmp', jp)
    if done:
        print(f'{cid}: culled under outer layers: {", ".join(done)}', flush=True)


def orient_faces(T, w):
    """Consistent winding: faces are flipped so that every manifold edge is traversed in opposite
    directions by its two faces (breadth-first over each connected patch). Garment parts made
    separately (a band collar on a neckline) came out wound the other way: with double-sided
    cloth, a back-facing triangle gets its normal flipped - dark slits along the seam."""
    tw = w[T]
    nF = len(T)
    edges = {}
    for f in range(nF):
        a, b, c = tw[f]
        for u, v in ((a, b), (b, c), (c, a)):
            edges.setdefault((min(u, v), max(u, v)), []).append((f, u, v))
    nbr = [[] for _ in range(nF)]
    for lst in edges.values():
        if len(lst) == 2:
            (f1, u1, v1), (f2, u2, v2) = lst
            same = (u1 == u2)                  # same direction -> windings disagree
            nbr[f1].append((f2, same))
            nbr[f2].append((f1, same))
    flip = np.zeros(nF, bool)
    seen = np.zeros(nF, bool)
    from collections import deque
    for s0 in range(nF):
        if seen[s0]:
            continue
        seen[s0] = True
        dq = deque([s0])
        while dq:
            f = dq.popleft()
            for g, same in nbr[f]:
                if not seen[g]:
                    seen[g] = True
                    flip[g] = flip[f] ^ same
                    dq.append(g)
    T2 = T.copy()
    T2[flip] = T2[flip][:, [0, 2, 1]]
    return T2, int(flip.sum())


def fix_renormal(cid):
    """Every cloth mesh gets a consistent winding (orient_faces) and welded, area-weighted vertex
    normals from its final positions (the passes above recomputed only the vertices they moved:
    the seam between new and stored normals shaded as dark marks). Orientation: outward, voted
    against the normals as built, per connected patch."""
    jp, bp = os.path.join(CACHE, cid + '.json'), os.path.join(CACHE, cid + '.bin')
    h = json.load(open(jp))
    bin_ = bytearray(open(bp, 'rb').read())
    done = []
    for m in h['meshes']:
        if m['kind'] != 'cloth' or 'normals4' in m.get('postfix', []):
            continue
        P = view(bin_, m['attrs']['position']).astype(float)
        Tall = np.frombuffer(bin_, dtype=TYPES[m['index']['type']], count=m['index']['count'], offset=m['index']['offset']).reshape(-1, 3).astype(np.int64)
        live = (Tall[:, 0] != Tall[:, 1]) | (Tall[:, 1] != Tall[:, 2])
        key = np.round(P / 1e-5).astype(np.int64)
        _, w = np.unique(key, axis=0, return_inverse=True)
        w = w.reshape(-1)
        T, nflip = orient_faces(Tall[live], w)
        N0 = view(bin_, m['attrs']['normal']).astype(float)
        Nf = fresh_normals(P, T)
        # the vote per connected patch (a garment may be several pieces)
        nW = int(w.max()) + 1
        par = np.arange(nW)

        def find(x):
            while par[x] != x:
                par[x] = par[par[x]]
                x = par[x]
            return x
        for a, b, c in w[T]:
            ra, rb, rc = find(a), find(b), find(c)
            par[rb] = ra
            par[find(rc)] = ra
        compw = np.array([find(x) for x in range(nW)])
        comp = compw[w]
        dots = np.einsum('ij,ij->i', N0, Nf)
        # a patch wound inward is re-wound (not just its normals turned): double-sided shading
        # flips the normal of every back-facing triangle
        fcomp = compw[w[T[:, 0]]]
        for cpt in np.unique(comp):
            if dots[comp == cpt].sum() < 0:
                sel = fcomp == cpt
                T[sel] = T[sel][:, [0, 2, 1]]
                nflip += int(sel.sum())
        Nf = fresh_normals(P, T)
        bad = np.linalg.norm(Nf, axis=1) < 0.5
        Nf[bad] = N0[bad]
        put(bin_, m['attrs']['normal'], Nf)
        if nflip:
            Tout = Tall.copy()
            Tout[live] = T
            put(bin_, m['index'], Tout)
        m['postfix'] = m.get('postfix', []) + ['normals4']
        done.append(f"{m['name']}" + (f" ({nflip} tris rewound)" if nflip else ''))
    if not done:
        return
    tmp = bp + '.tmp'
    open(tmp, 'wb').write(bin_)
    os.replace(tmp, bp)
    json.dump(h, open(jp + '.tmp', 'w'), separators=(',', ':'))
    os.replace(jp + '.tmp', jp)
    print(f'{cid}: winding + normals ({", ".join(done)})', flush=True)


def fix_reao(cid, rays=16, max_dist=0.12):
    """Cloth ambient occlusion re-baked on the final geometry (the build bakes it before these
    passes: a smoothed pucker kept the dark AO of its old crease - dots on a gown's bust).
    Same estimator as humanbuild.bake_ao_thickness, against every occluder mesh as cached."""
    import bpy  # noqa: F401
    from mathutils import Vector
    from mathutils.bvhtree import BVHTree
    jp, bp = os.path.join(CACHE, cid + '.json'), os.path.join(CACHE, cid + '.bin')
    h = json.load(open(jp))
    bin_ = bytearray(open(bp, 'rb').read())

    def arrays(m):
        P = view(bin_, m['attrs']['position']).astype(float)
        T = np.frombuffer(bin_, dtype=TYPES[m['index']['type']], count=m['index']['count'], offset=m['index']['offset']).reshape(-1, 3).astype(np.int64)
        return P, T[(T[:, 0] != T[:, 1]) | (T[:, 1] != T[:, 2])]
    todo = [m for m in h['meshes'] if m['kind'] == 'cloth' and 'ao' in m['attrs'] and 'ao2' not in m.get('postfix', [])]
    if not todo:
        return
    allP, allT, off = [], [], 0
    for m in h['meshes']:
        if m['kind'] in ('eye', 'lash', 'brow') or not m['material'].get('occluder', True):
            continue
        P, T = arrays(m)
        allP.append(P)
        allT.append(T + off)
        off += len(P)
    tree = BVHTree.FromPolygons(np.concatenate(allP).tolist(), np.concatenate(allT).tolist(), all_triangles=True, epsilon=0.0)
    rng = np.random.default_rng(7)
    u1, u2 = rng.random(rays), rng.random(rays)
    r = np.sqrt(u1)
    th = 2 * np.pi * u2
    local = np.stack([r * np.cos(th), r * np.sin(th), np.sqrt(1 - u1)], 1)
    done = []
    for m in todo:
        P, _ = arrays(m)
        N = view(bin_, m['attrs']['normal']).astype(float)
        ao = view(bin_, m['attrs']['ao']).astype(float).copy()
        key = np.round(P / 1e-5).astype(np.int64)
        _, first, w = np.unique(key, axis=0, return_index=True, return_inverse=True)
        w = w.reshape(-1)
        aw = np.ones(len(first))
        for j, i in enumerate(first):
            nn = N[i] / max(np.linalg.norm(N[i]), 1e-9)
            t1 = np.cross(nn, [0, 1, 0] if abs(nn[1]) < 0.9 else [1, 0, 0])
            t1 /= np.linalg.norm(t1) + 1e-12
            t2 = np.cross(nn, t1)
            ov = Vector(P[i] + nn * 0.0015)
            occ = 0.0
            for d in local[:, :1] * t1 + local[:, 1:2] * t2 + local[:, 2:3] * nn:
                hit = tree.ray_cast(ov, Vector(d), max_dist)
                if hit[0] is not None:
                    occ += 1.0 - (hit[3] / max_dist) ** 0.5 * 0.6
            aw[j] = 1.0 - occ / rays
        put(bin_, m['attrs']['ao'], aw[w])
        m['postfix'] = m.get('postfix', []) + ['ao2']
        done.append(m['name'])
    tmp = bp + '.tmp'
    open(tmp, 'wb').write(bin_)
    os.replace(tmp, bp)
    json.dump(h, open(jp + '.tmp', 'w'), separators=(',', ':'))
    os.replace(jp + '.tmp', jp)
    print(f'{cid}: cloth AO re-baked ({", ".join(done)})', flush=True)


def fix_holefill(cid, max_loop=10):
    """Small holes in cloth (slits in band collars where the extruded rows met the neckline,
    pin-holes left by the cull) are closed: every boundary loop of at most `max_loop` vertices is
    fan-triangulated with the winding of its neighbours. The garments' real openings (neck,
    cuffs, hems, fronts) and the large culled areas under outer layers stay open. The new index
    buffer is appended to the .bin (the runtime reads buffers by offset)."""
    jp, bp = os.path.join(CACHE, cid + '.json'), os.path.join(CACHE, cid + '.bin')
    h = json.load(open(jp))
    bin_ = bytearray(open(bp, 'rb').read())
    done = []
    for m in h['meshes']:
        if m['kind'] != 'cloth' or 'holefill' in m.get('postfix', []):
            continue
        P = view(bin_, m['attrs']['position']).astype(float)
        T = np.frombuffer(bin_, dtype=TYPES[m['index']['type']], count=m['index']['count'], offset=m['index']['offset']).reshape(-1, 3).astype(np.int64)
        keep = (T[:, 0] != T[:, 1]) | (T[:, 1] != T[:, 2])
        key = np.round(P / 1e-5).astype(np.int64)
        _, first, w = np.unique(key, axis=0, return_index=True, return_inverse=True)
        w = w.reshape(-1)
        tw = w[T[keep]]
        tw = tw[(tw[:, 0] != tw[:, 1]) & (tw[:, 1] != tw[:, 2]) & (tw[:, 0] != tw[:, 2])]
        d = np.concatenate([tw[:, [0, 1]], tw[:, [1, 2]], tw[:, [2, 0]]])
        und = np.sort(d, axis=1)
        _, inv, cnt = np.unique(und, axis=0, return_inverse=True, return_counts=True)
        bd = d[cnt[inv.reshape(-1)] == 1]                    # directed boundary edges a->b
        nxt = {}
        bad = set()
        for a, b in bd:
            if b in nxt:
                bad.add(b)
            nxt[int(b)] = int(a)                             # fill runs b->a
        seen = set()
        fills = []
        for s0 in list(nxt):
            if s0 in seen or s0 in bad:
                continue
            loop, v = [], s0
            while v not in seen and v in nxt and len(loop) <= max_loop + 1:
                seen.add(v)
                loop.append(v)
                v = nxt[v]
            if v != s0 or len(loop) < 3 or len(loop) > max_loop or any(x in bad for x in loop):
                continue
            for k in range(1, len(loop) - 1):
                fills.append((first[loop[0]], first[loop[k]], first[loop[k + 1]]))
        # zip seams: open edges that run within 2.5 mm of another open edge (a band collar's
        # rows against the neckline) are a slit, not an opening - their vertices are joined
        bv = np.unique(bd.reshape(-1))
        zipped = 0
        if len(bv) > 1:
            Q = np.zeros((int(w.max()) + 1, 3))
            Q[w] = P
            B = Q[bv]
            for i0 in range(0, len(bv), 512):
                dd = np.linalg.norm(B[i0:i0 + 512, None, :] - B[None, :, :], axis=2)
                for ii, row in enumerate(dd):
                    i = i0 + ii
                    near = np.where((row < 0.0025) & (row > 1e-7))[0]
                    if len(near):
                        tgt = (B[i] + B[near].sum(0)) / (1 + len(near))
                        sel = np.isin(w, [bv[i]])
                        P[sel] = P[sel] * 0.5 + tgt * 0.5
                        zipped += 1
            if zipped:
                put(bin_, m['attrs']['position'], P)
        if fills:
            T2 = np.concatenate([T[keep], np.array(fills, dtype=np.int64)])
            dt = np.uint32 if T2.max() > 65535 else np.uint16
            a = np.ascontiguousarray(T2.reshape(-1), dtype=dt).tobytes()
            bin_ += b'\0' * ((-len(bin_)) % 4)
            m['index'] = {'offset': len(bin_), 'count': int(T2.size), 'type': 'u32' if dt == np.uint32 else 'u16'}
            bin_ += a
            done.append(f"{m['name']} ({len(fills)} tris)")
        if zipped:
            done.append(f"{m['name']} seam ({zipped} v zipped)")
        m['postfix'] = m.get('postfix', []) + ['holefill']
    h['binBytes'] = len(bin_)
    tmp = bp + '.tmp'
    open(tmp, 'wb').write(bin_)
    os.replace(tmp, bp)
    json.dump(h, open(jp + '.tmp', 'w'), separators=(',', ':'))
    os.replace(jp + '.tmp', jp)
    if done:
        print(f'{cid}: holes closed in {", ".join(done)}', flush=True)


def main():
    what, ids = sys.argv[1], sys.argv[2:]
    if ids == ['all']:
        ids = sorted(os.path.basename(p)[:-5] for p in glob.glob(os.path.join(CACHE, '*.json')))
    for cid in ids:
        if what in ('shoes', 'all'):
            fix_shoes(cid)
        if what in ('puckers', 'all'):
            fix_puckers(cid)
        if what in ('props', 'all'):
            fix_props(cid)
        if what in ('normals', 'all'):
            fix_normals(cid)
        if what in ('pushout', 'all'):
            fix_pushout(cid)
        if what in ('cull', 'all'):
            fix_cull(cid)
        if what in ('renormal', 'all'):
            fix_renormal(cid)
        if what in ('holefill', 'all'):
            fix_holefill(cid)
        if what in ('reao', 'all'):
            fix_reao(cid)


if __name__ == '__main__':
    main()
