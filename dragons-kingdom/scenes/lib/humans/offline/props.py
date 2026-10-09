"""Accessories and hand props, built in the drape pose (belts, buckles, pouches, slings, spears,
baskets, parcels, bread, instruments, helmets, crowns...). Each returns a humanbuild.Part."""
import math

import numpy as np

import meshutil as mu


def tube(path, radius, sides=10, close=False):
    """Swept circle along a polyline: (P, faces)."""
    path = np.asarray(path, float)
    T = mu.norm(np.gradient(path, axis=0))
    ref = np.array([0, 1.0, 0]) if abs(T[0][1]) < 0.9 else np.array([1.0, 0, 0])
    N0 = mu.norm(np.cross(T[0], ref))
    P = []
    N = N0
    for i, p in enumerate(path):
        t = T[i]
        N = mu.norm(N - t * np.dot(N, t))
        B = np.cross(t, N)
        r = radius[i] if hasattr(radius, '__len__') else radius
        for k in range(sides):
            a = 2 * math.pi * k / sides
            P.append(p + (N * math.cos(a) + B * math.sin(a)) * r)
    F = mu.grid_faces(sides, len(path), wrap_u=True)
    return np.array(P), F


def box(c, size, R=None):
    """Axis box (or rotated by R): (P, faces)."""
    sx, sy, sz = np.asarray(size) / 2
    P = np.array([[x, y, z] for x in (-sx, sx) for y in (-sy, sy) for z in (-sz, sz)])
    if R is not None:
        P = P @ np.asarray(R).T
    P = P + c
    F = [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)]
    return P, F


def merge(parts):
    P, F, off = [], [], 0
    for p, f in parts:
        P.append(p)
        F += [tuple(v + off for v in fc) for fc in f]
        off += len(p)
    return np.vstack(P), F


def belt_ring(surfP, y, centre, width=0.035, thick=0.004, nth=96, clearance=0.003):
    """Leather belt following the outermost surface (surfP: candidate surface points) at height y."""
    sel = np.abs(surfP[:, 1] - y) < width * 0.3
    if sel.sum() < 30:
        sel = np.abs(surfP[:, 1] - y) < 0.02
    Q = surfP[sel]
    th = np.arctan2(Q[:, 0] - centre[0], Q[:, 2] - centre[2])
    r = np.hypot(Q[:, 0] - centre[0], Q[:, 2] - centre[2])
    bins = ((th + math.pi) / (2 * math.pi) * nth).astype(int) % nth
    R = np.zeros(nth)
    np.maximum.at(R, bins, r)
    # fill empty bins, smooth
    for _ in range(nth):
        z = R == 0
        if not z.any():
            break
        R[z] = np.maximum(np.roll(R, 1)[z], np.roll(R, -1)[z])
    for _ in range(6):
        R = np.maximum(R, (np.roll(R, 1) + np.roll(R, -1) + 2 * R) / 4)
    angs = -math.pi + (np.arange(nth) + 0.5) / nth * 2 * math.pi
    rings = []
    for dy, dr in ((-width / 2, 0), (width / 2, 0), (width / 2, thick), (-width / 2, thick)):
        rr = R + clearance + dr
        rings.append(np.stack([centre[0] + np.sin(angs) * rr, np.full(nth, y + dy), centre[2] + np.cos(angs) * rr], 1))
    P = np.vstack(rings)
    F = []
    for k in range(4):
        a, b = k, (k + 1) % 4
        for i in range(nth):
            j = (i + 1) % nth
            F.append((a * nth + i, a * nth + j, b * nth + j, b * nth + i))
    # faces were built inner->outer: make them face outward
    return P, F, angs, R


# ================================================================ lathe ==
def lathe(profile, segs=24, close_top=False, close_bottom=False, angle=2 * math.pi):
    """Revolve a profile [(r, y), ...] (bottom to top) about +y. Returns (P, faces, uv)."""
    prof = np.asarray(profile, float)
    n = len(prof)
    full = abs(angle - 2 * math.pi) < 1e-6
    cols = segs if full else segs + 1
    P, UV = [], []
    seg = np.concatenate([[0], np.cumsum(np.hypot(np.diff(prof[:, 0]), np.diff(prof[:, 1])))])
    for j in range(n):
        r, y = prof[j]
        for i in range(cols):
            a = angle * i / segs
            P.append((math.cos(a) * r, y, math.sin(a) * r))
            UV.append((a * max(r, 1e-3), seg[j]))
    F = mu.grid_faces(cols, n, wrap_u=full)
    F = [tuple(reversed(f)) for f in F]
    P = np.array(P)
    UV = np.array(UV)
    if close_bottom:
        c = len(P)
        P = np.vstack([P, [[0, prof[0, 1], 0]]]); UV = np.vstack([UV, [[0, 0]]])
        F += [(c, i, (i + 1) % cols) for i in range(cols - (0 if full else 1))]
    if close_top:
        c = len(P)
        P = np.vstack([P, [[0, prof[-1, 1], 0]]]); UV = np.vstack([UV, [[0, seg[-1]]]])
        o = (n - 1) * cols
        F += [(c, o + (i + 1) % cols, o + i) for i in range(cols - (0 if full else 1))]
    return P, F, UV


def xform(P, M):
    P = np.asarray(P, float)
    return P @ M[:3, :3].T + M[:3, 3]


def mat(R=None, t=(0, 0, 0)):
    M = np.eye(4)
    if R is not None:
        M[:3, :3] = R
    M[:3, 3] = t
    return M


def rot_x(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[1, 0, 0], [0, c, -s], [0, s, c]])


def rot_y(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])


def rot_z(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])


def frame_from(y_axis, z_hint):
    """Rotation whose +y is y_axis and +z is as close as possible to z_hint."""
    y = mu.norm(y_axis)
    z = np.asarray(z_hint, float) - y * np.dot(z_hint, y)
    z = mu.norm(z)
    x = np.cross(y, z)
    return np.stack([x, y, z], 1)


def piece(P, F, uv, material, name):
    return {'P': np.asarray(P, float), 'F': list(F), 'uv': np.asarray(uv, float), 'material': material, 'name': name}


def boxuv(P):
    return np.stack([P[:, 0] + P[:, 2] * 0.7, P[:, 1] + P[:, 2] * 0.3], 1)


# ================================================================ props ==
# Every builder returns a list of pieces in PROP space (metres), documented per prop.
WOOD = {'kind': 'wood', 'color': [0.5, 0.4, 0.3], 'rough': 0.7}
IRON = {'kind': 'iron', 'color': [0.36, 0.35, 0.34], 'rough': 0.66}       # hand-forged, dulled
STEEL = {'kind': 'steel', 'color': [0.46, 0.46, 0.47], 'rough': 0.45}
LEATHER = {'kind': 'leather', 'color': [0.08, 0.05, 0.03], 'rough': 0.6}


def spear(length=2.15):
    """Shaft along +y from the butt (y=0) to the tip; iron leaf head and butt ferrule."""
    out = []
    P, F, uv = lathe([(0.012, 0.0), (0.0145, 0.04), (0.0145, length - 0.32), (0.0135, length - 0.24)], segs=12)
    out.append(piece(P, F, uv, dict(WOOD, color=[0.42, 0.32, 0.22]), 'shaft'))
    # socket + leaf blade (flattened lathe)
    prof = [(0.016, length - 0.26), (0.017, length - 0.2), (0.012, length - 0.17), (0.035, length - 0.12), (0.03, length - 0.06), (0.0, length)]
    P, F, uv = lathe(prof, segs=16, close_top=False)
    P[:, 2] *= 0.22 + 0.78 * np.clip((length - 0.17 - P[:, 1]) / 0.05, 0, 1)   # blade flattened, socket round
    out.append(piece(P, F, uv, STEEL, 'head'))
    P, F, uv = lathe([(0.0, -0.005), (0.013, 0.0), (0.0155, 0.05)], segs=10)
    out.append(piece(P, F, uv, IRON, 'ferrule'))
    return out


def loaf(r=0.075, h=0.06):
    """Round bread on its base at y=0."""
    prof = [(0.0, 0.0), (r * 0.85, 0.0), (r, h * 0.25), (r * 0.95, h * 0.6), (r * 0.7, h * 0.92), (0.0, h)]
    P, F, uv = lathe(prof, segs=24)
    # scored cross on top
    d = np.hypot(P[:, 0], P[:, 2])
    cut = (np.abs(P[:, 0]) < 0.006) | (np.abs(P[:, 2]) < 0.006)
    P[cut & (P[:, 1] > h * 0.7), 1] -= 0.006
    return [piece(P, F, uv, {'kind': 'bread', 'color': [0.42, 0.22, 0.09], 'rough': 0.8}, 'loaf')]


def cup(r=0.04, h=0.09):
    prof = [(0.0, 0.0), (r * 0.8, 0.0), (r * 0.85, 0.005), (r, h), (r * 0.92, h), (r * 0.78, 0.012), (0.0, 0.012)]
    P, F, uv = lathe(prof, segs=20)
    return [piece(P, F, uv, dict(WOOD, color=[0.45, 0.3, 0.18], rough=0.55), 'cup')]


def bowl(r=0.085, h=0.05):
    prof = [(0.0, 0.0), (r * 0.55, 0.0), (r, h), (r * 0.92, h), (r * 0.5, 0.008), (0.0, 0.008)]
    P, F, uv = lathe(prof, segs=24)
    return [piece(P, F, uv, dict(WOOD, color=[0.4, 0.27, 0.16], rough=0.55), 'bowl')]


def basket(r=0.17, h=0.17, handle=True):
    """Wicker basket, base at y=0, handle arching over (x axis)."""
    prof = [(0.0, 0.0), (r * 0.8, 0.0), (r * 0.85, 0.01), (r, h), (r * 0.97, h + 0.012), (r * 0.9, h + 0.008), (r * 0.78, 0.015), (0.0, 0.015)]
    P, F, uv = lathe(prof, segs=32)
    out = [piece(P, F, uv, {'kind': 'wicker', 'color': [0.75, 0.62, 0.45], 'rough': 0.8, 'tile': 0.18}, 'basket')]
    if handle:
        a = np.linspace(0, math.pi, 20)
        path = np.stack([np.cos(a) * r * 0.95, h + np.sin(a) * r * 0.85, np.zeros_like(a)], 1)
        P, F = tube(path, 0.009, sides=8)
        out.append(piece(P, F, np.stack([np.repeat(np.arange(len(path)), 8) * 0.02, np.tile(np.arange(8), len(path)) * 0.01], 1), {'kind': 'wicker', 'color': [0.7, 0.58, 0.42], 'tile': 0.1}, 'handle'))
    return out


def crate(w=0.5, h=0.32, d=0.36, seed=5):
    """Rough split-board box, base at y=0, open top: boards of uneven width with gaps and a slight
    skew, corner posts, nail heads (a machine-cut slatted crate read as a modern produce crate)."""
    rng = np.random.default_rng(seed)
    parts, nails = [], []
    t = 0.016
    for (cx, cz, sx, sz, ax) in ((0, d / 2 - t / 2, w, t, 0), (0, -d / 2 + t / 2, w, t, 0), (w / 2 - t / 2, 0, t, d - 2 * t, 2), (-w / 2 + t / 2, 0, t, d - 2 * t, 2)):
        y = 0.012
        k = 0
        while y < h - 0.03:
            hh = min(h - y, 0.075 + 0.05 * rng.random())
            R = rot_x(0.012 * (rng.random() - 0.5)) @ rot_z(0.015 * (rng.random() - 0.5))
            sx_ = sx * (1 - 0.01 * rng.random())
            parts.append(box(np.array([cx, y + hh / 2, cz]) + (rng.random(3) - 0.5) * 0.003, (sx_, hh - 0.004, sz * (0.85 + 0.3 * rng.random())), R))
            for e in (-1, 1):
                along = np.array([e * (sx / 2 - 0.022), y + hh / 2, 0]) if ax == 0 else np.array([0, y + hh / 2, e * (sz / 2 - 0.022)])
                out = np.array([0, 0, np.sign(cz) * (t / 2 + 0.001)]) if ax == 0 else np.array([np.sign(cx) * (t / 2 + 0.001), 0, 0])
                nails.append(np.array([cx, 0, cz]) * np.array([1, 0, 1]) + along + out)
            y += hh + 0.004 + 0.012 * rng.random()
            k += 1
    parts.append(box(np.array([0, 0.007, 0]), (w * 0.98, 0.014, d * 0.98)))
    for sx in (-1, 1):
        for sz in (-1, 1):
            parts.append(box(np.array([sx * (w / 2 - 0.028), h / 2 - 0.01, sz * (d / 2 + 0.006)]), (0.04, h - 0.02, 0.014), rot_y(0.02 * (rng.random() - 0.5))))
    P, F = merge(parts)
    nb = []
    for q in nails:
        Pn, Fn, _ = lathe([(0.0, -0.001), (0.0035, 0.0), (0.003, 0.0015), (0.0, 0.002)], segs=6)
        n_ = mu.norm(q * np.array([1, 0, 1]))
        nb.append((Pn @ frame_from(n_, np.array([0, 1.0, 0])).T + q, Fn))
    Pn, Fn = merge(nb)
    return [piece(P, F, boxuv(P), {'kind': 'pine', 'color': [0.3, 0.24, 0.17], 'tile': 0.8}, 'crate'),
            piece(Pn, Fn, boxuv(Pn), {'kind': 'iron', 'color': [0.2, 0.18, 0.16], 'rough': 0.8}, 'nails')]


def parcel(w=0.28, h=0.14, d=0.2, seed=7):
    """Cloth bundle: linen wrapped round a box, the corners gathered up into a knot on top, soft
    creases, tied with cord (a smooth flattened ellipsoid read as a white plastic tub)."""
    rng = np.random.default_rng(seed)
    u = np.linspace(-1, 1, 25)
    P, F = [], []
    # a rounded box (superellipsoid) mesh
    th = np.linspace(0, math.pi, 13)
    ph = np.linspace(0, 2 * math.pi, 25)
    for a in th:
        for b in ph:
            ca, sa, cb, sb = math.cos(a), math.sin(a), math.cos(b), math.sin(b)
            e = 0.35
            x = math.copysign(abs(sa) ** e, sa) * math.copysign(abs(cb) ** e, cb)
            y = math.copysign(abs(ca) ** e, ca)
            z = math.copysign(abs(sa) ** e, sa) * math.copysign(abs(sb) ** e, sb)
            P.append((x * w / 2, y * h / 2, z * d / 2))
    P = np.array(P)
    F = [tuple(reversed(f)) for f in mu.grid_faces(25, 13)]
    # creases: low-frequency folds radiating from the top knot, slack at the sides
    top = P[:, 1] > 0
    ang = np.arctan2(P[:, 2], P[:, 0])
    fold = (np.sin(ang * 7 + rng.random() * 6) * 0.6 + np.sin(ang * 11 + rng.random() * 6) * 0.4) * np.clip(P[:, 1] / (h / 2), 0, 1) ** 0.5
    r = np.hypot(P[:, 0], P[:, 2])[:, None]
    P = P + np.concatenate([P[:, :1], np.zeros((len(P), 1)), P[:, 2:]], 1) / np.maximum(r, 1e-6) * (0.006 * fold)[:, None]
    P += (rng.random(P.shape) - 0.5) * 0.002
    # gathered corners: the top centre pulled up into a knot
    k = np.clip(1 - np.hypot(P[:, 0] / (w * 0.5), P[:, 2] / (d * 0.5)) / 0.45, 0, 1) * top
    P[:, 1] += 0.035 * k ** 1.5
    P[:, 0] *= 1 - 0.55 * k
    P[:, 2] *= 1 - 0.55 * k
    uv = np.stack([np.repeat(np.arange(13), 25) * 0.03, np.tile(np.arange(25), 13) * 0.03], 1)
    out = [piece(P, F, uv * 4, {'kind': 'linen', 'color': [0.3, 0.26, 0.19], 'rough': 0.88, 'tile': 0.15}, 'cloth')]
    a = np.linspace(0, 2 * math.pi, 40)
    for ex, ez in ((w * 0.5, 0.0), (0.0, d * 0.5)):
        path = np.stack([np.cos(a) * (ex + 0.004) if ex else np.zeros_like(a), np.sin(a) * h * 0.52, np.cos(a) * (ez + 0.004) if ez else np.zeros_like(a)], 1)
        path[:, 1] = np.where(path[:, 1] > 0, path[:, 1] * 1.08, path[:, 1])
        Pc, Fc = tube(path, 0.0028, sides=6)
        out.append(piece(Pc, Fc, boxuv(Pc), {'kind': 'rope', 'color': [0.32, 0.27, 0.18], 'rough': 0.9}, 'cord'))
    return out


def folded_cloth(w=0.3, h=0.05, d=0.22, color=(0.6, 0.57, 0.5)):
    P, F, uv = lathe([(0.0, 0.0), (0.46, 0.0), (0.5, 0.2), (0.5, 0.8), (0.46, 1.0), (0.0, 1.0)], segs=4)
    R = rot_y(math.pi / 4)
    P = (P @ R.T) * np.array([w * 1.41, h, d * 1.41])
    return [piece(P, F, uv, {'kind': 'linen', 'color': list(color), 'tile': 0.12}, 'cloth')]


def lute(body_l=0.46, body_w=0.32):
    """Lute: pear-shaped bowl back (-z), soundboard facing +z at z=0, neck toward +y, pegbox bent
    back; a darkened spruce board with a carved rose, a bridge, 7 courses of gut strings and tied
    frets (a pale disc with no strings read as a banjo or a frying pan)."""
    out = []

    def half_w(y):
        # widest at the lower third, tapering to the neck (pear)
        t = (y + body_l / 2) / body_l            # 0 bottom .. 1 top
        return body_w / 2 * np.clip(np.sin(math.pi * np.clip(t, 0, 1) ** 0.8) * (1 - 0.25 * np.clip(t, 0, 1)), 0.0, 1.0)
    u = np.linspace(0, 1, 22)
    v = np.linspace(0, math.pi, 14)
    P = []
    for t in u:
        y = -body_l / 2 + t * body_l
        hw = float(half_w(y))
        for b in v:
            P.append((math.cos(b) * hw, y, -math.sin(b) * hw * 0.95))
    P = np.array(P)
    F = [tuple(reversed(f)) for f in mu.grid_faces(len(v), len(u))]
    # staves: alternating ribs in the bowl (dark seams between them)
    out.append(piece(P, F, np.stack([np.repeat(u, len(v)) * body_l, np.tile(v, len(u)) * 0.1], 1), dict(WOOD, color=[0.2, 0.1, 0.05], rough=0.4), 'bowl'))
    a = np.linspace(0, 2 * math.pi, 48, endpoint=False)
    ys = np.linspace(-body_l / 2, body_l / 2, 48)
    rim = []
    for t in np.linspace(0, 1, 25):
        y = -body_l / 2 + t * body_l
        rim.append((float(half_w(y)), y))
    rim = np.array(rim)
    ring = np.vstack([np.stack([rim[:, 0], rim[:, 1]], 1), np.stack([-rim[::-1, 0], rim[::-1, 1]], 1)[1:-1]])
    Pc = np.vstack([[[0, -0.02, 0.0]], np.stack([ring[:, 0], ring[:, 1], np.zeros(len(ring))], 1)])
    nr = len(ring)
    Fc = [(0, i + 1, (i + 1) % nr + 1) for i in range(nr)]
    out.append(piece(Pc, Fc, boxuv(Pc), dict(WOOD, color=[0.42, 0.3, 0.17], rough=0.5), 'board'))
    # rose: dark ring of carved openings (a lattice ring, not a flat black disc)
    ry = 0.06
    rr_ = []
    for k in range(20):
        ang = 2 * math.pi * k / 20
        rr_.append(box(np.array([math.cos(ang) * 0.03, ry + math.sin(ang) * 0.03, 0.0008]), (0.006, 0.006, 0.0015), rot_z(ang)))
    Pr, Fr = merge(rr_)
    out.append(piece(Pr, Fr, boxuv(Pr), {'kind': 'flat', 'color': [0.02, 0.014, 0.01], 'rough': 0.9}, 'rose'))
    # bridge
    Pb, Fb = box(np.array([0, -body_l * 0.3, 0.004]), (0.11, 0.009, 0.008))
    out.append(piece(Pb, Fb, boxuv(Pb), dict(WOOD, color=[0.08, 0.05, 0.03], rough=0.5), 'bridge'))
    # neck + pegbox
    nl = 0.3
    y0 = body_l / 2 - 0.01
    nb = box(np.array([0, y0 + nl / 2, 0.006]), (0.05, nl, 0.024))
    R = rot_x(-1.3)
    pg = box(np.array([0, 0, 0]), (0.045, 0.16, 0.02), R)
    pg = (pg[0] + np.array([0, y0 + nl + 0.03, -0.06]), pg[1])
    P2, F2 = merge([nb, pg])
    out.append(piece(P2, F2, boxuv(P2), dict(WOOD, color=[0.12, 0.07, 0.04], rough=0.45), 'neck'))
    # tied gut frets
    fr = []
    for k in range(8):
        y = y0 + 0.02 + nl * (1 - 0.88 ** (k + 1)) * 1.35
        if y > y0 + nl - 0.01:
            break
        fr.append(box(np.array([0, y, 0.0185]), (0.052, 0.0016, 0.0016)))
    Pf, Ff = merge(fr)
    out.append(piece(Pf, Ff, boxuv(Pf), {'kind': 'flat', 'color': [0.45, 0.38, 0.28], 'rough': 0.6}, 'frets'))
    # strings: bridge -> nut
    st = []
    for k in range(7):
        x = (k - 3) * 0.0062
        path = np.array([[x * 1.6, -body_l * 0.3, 0.009], [x, y0 + nl, 0.0195]])
        path = np.vstack([path[0] + (path[1] - path[0]) * s for s in np.linspace(0, 1, 6)])
        Ps, Fs = tube(path, 0.00045, sides=4)
        st.append((Ps, Fs))
    Ps, Fs = merge(st)
    out.append(piece(Ps, Fs, boxuv(Ps), {'kind': 'flat', 'color': [0.55, 0.5, 0.4], 'rough': 0.4}, 'strings'))
    return out


def recorder(l=0.32):
    P, F, uv = lathe([(0.0, 0.0), (0.012, 0.0), (0.011, 0.04), (0.0105, l - 0.06), (0.014, l - 0.02), (0.016, l), (0.0, l)], segs=12)
    return [piece(P, F, uv, dict(WOOD, color=[0.55, 0.38, 0.2], rough=0.4), 'recorder')]


def kettle_hat(r=0.112, seed=3):
    """Iron kettle hat, its inner rim centred at the origin (head top above): a raised skull with a
    riveted brow band, a sloping brim ending in a rolled bead, low hammer dents (not crumples)."""
    rng = np.random.default_rng(seed)
    prof = [(r * 1.58, -0.034), (r * 1.6, -0.03), (r * 1.62, -0.026), (r * 1.6, -0.023), (r * 1.56, -0.022),   # rolled bead
            (r * 1.05, 0.0), (r * 1.03, 0.006), (r * 1.025, 0.024), (r * 1.03, 0.03), (r * 1.0, 0.034),     # brow band
            (r * 0.98, 0.06), (r * 0.86, 0.11), (r * 0.45, 0.15), (0.0, 0.158)]
    P, F, uv = lathe(prof, segs=48)
    ang = np.arctan2(P[:, 2], P[:, 0])
    dent = np.zeros(len(P))
    for k in range(5):
        a0, f = rng.random() * 6.28, 2 + rng.random() * 3
        dent += np.cos(ang * f + a0) * 0.0009
    top = np.clip(P[:, 1] / 0.15, 0, 1)
    rad = np.hypot(P[:, 0], P[:, 2])[:, None]
    P = P + np.concatenate([P[:, :1], np.zeros((len(P), 1)), P[:, 2:]], 1) / np.maximum(rad, 1e-6) * (dent * (0.3 + top))[:, None]
    out = [piece(P, F, uv, dict(IRON, color=[0.27, 0.26, 0.25], rough=0.66), 'hat')]
    rv = []
    for k in range(16):
        a = 2 * math.pi * k / 16
        c = np.array([math.cos(a) * r * 1.035, 0.017, math.sin(a) * r * 1.035])
        Pr, Fr, _ = lathe([(0.0, 0.0), (0.0042, 0.0005), (0.0035, 0.0022), (0.0, 0.003)], segs=8)
        Pr = Pr @ frame_from(mu.norm(c * np.array([1, 0, 1])), np.array([0, 1.0, 0])).T + c
        rv.append((Pr, Fr))
    Pr, Fr = merge(rv)
    out.append(piece(Pr, Fr, boxuv(Pr), dict(IRON, color=[0.22, 0.2, 0.19], rough=0.7), 'rivets'))
    return out


def circlet(r=0.085, h=0.018, points=0, aspect=1.15, profile=None):
    """Slim gold band (fillet / circlet); `profile` (64 radii) fits it to the head it sits on."""
    a = np.linspace(0, 2 * math.pi, 64, endpoint=False)
    P = []
    for y in (0, h):
        for k, ang in enumerate(a):
            bump = h * 0.8 * max(0, math.cos(ang * points)) ** 6 if points and y > 0 else 0
            if profile is not None:
                rr = profile[k] + 0.0008 * (y > 0)
                P.append((math.cos(ang) * rr, y + bump, math.sin(ang) * rr))
            else:
                P.append((math.cos(ang) * r, y + bump, math.sin(ang) * r * aspect))
    P = np.array(P)
    F = mu.grid_faces(64, 2, wrap_u=True)
    return [piece(P, F, boxuv(P), {'kind': 'gold', 'rough': 0.32, 'doubleSide': True}, 'circlet')]


def sword_sheathed(l=0.95):
    """Scabbard + hilt along -y from the guard at the origin (blade down)."""
    out = []
    prof = [(0.0, -l), (0.014, -l + 0.03), (0.022, -0.1), (0.024, 0.0)]
    P, F, uv = lathe(prof, segs=10)
    P[:, 2] *= 0.35
    out.append(piece(P, F, uv, dict(LEATHER, color=[0.05, 0.03, 0.02]), 'scabbard'))
    gP, gF = box(np.array([0, 0.008, 0]), (0.2, 0.016, 0.022))
    hP, hF, huv = lathe([(0.0, 0.016), (0.014, 0.016), (0.015, 0.12), (0.0, 0.12)], segs=10)
    pP, pF, puv = lathe([(0.0, 0.118), (0.02, 0.125), (0.021, 0.15), (0.0, 0.16)], segs=12)
    P2, F2 = merge([(gP, gF), (pP, pF)])
    out.append(piece(P2, F2, boxuv(P2), IRON, 'guard'))
    out.append(piece(hP, hF, huv, dict(LEATHER, color=[0.06, 0.04, 0.025]), 'grip'))
    return out


def rope_coil(r=0.13, turns=6, thick=0.012, seed=4):
    """A coil of rope held at its top (the origin): loose loops hanging below the hand, each a
    little different, with UVs along the rope for the twisted-strand shading (a flat helix read
    as a tray with a black line drawn round it)."""
    rng = np.random.default_rng(seed)
    pts = []
    for k in range(turns):
        rk = r * (0.85 + 0.25 * rng.random())
        ph = (rng.random() - 0.5) * 0.25
        zk = (k - turns / 2) * thick * 0.95
        for i in range(48):
            a = 2 * math.pi * i / 48
            pts.append((math.sin(a + ph) * rk * 0.55, -rk * (1 - math.cos(a)) * 0.95, zk + 0.004 * math.sin(a * 3 + k)))
    path = np.array(pts)
    P, F = tube(path, thick / 2, sides=7)
    L = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(path, axis=0), axis=1))])
    uv = np.stack([np.tile(np.arange(7) / 7 * math.pi * thick, len(path)), np.repeat(L, 7)], 1)
    return [piece(P, F, uv, {'kind': 'rope', 'color': [0.36, 0.3, 0.2], 'rough': 0.9}, 'rope')]

def scroll(l=0.24, r=0.016):
    P, F, uv = lathe([(0.0, -l / 2), (r, -l / 2), (r, l / 2), (0.0, l / 2)], segs=14)
    P = P @ rot_z(math.pi / 2).T
    a = np.linspace(0, 2 * math.pi, 24)
    path = np.stack([np.zeros_like(a) + 0.02, np.sin(a) * r * 1.05, np.cos(a) * r * 1.05], 1)
    Pc, Fc = tube(path, 0.003, sides=5)
    return [piece(P, F, uv, {'kind': 'flat', 'color': [0.62, 0.55, 0.42], 'rough': 0.8}, 'parchment'),
            piece(Pc, Fc, boxuv(Pc), {'kind': 'flat', 'color': [0.35, 0.05, 0.03], 'rough': 0.7}, 'ribbon')]


def reins(length=0.75, w=0.018, drop=0.28, sag=0.07):
    """A leather rein from the fist (origin) forward (+z) and down to the bit side, hanging in a
    shallow catenary (it is never a rigid bar), with thickness."""
    s = np.linspace(0, 1, 24)
    path = np.stack([np.zeros_like(s), -drop * s - sag * np.sin(math.pi * s), s * length], 1)
    return [piece(*_strap(path, w, 0.0035), dict(LEATHER, color=[0.08, 0.05, 0.03], doubleSide=True), 'reins')]


def _strap(path, w, th, up=np.array([0, 1.0, 0])):
    T = mu.norm(np.gradient(path, axis=0))
    N = mu.norm(up - T * (T @ up)[:, None])
    S = np.cross(T, N) * (w / 2)
    rows = [path + S, path - S, path - S - N * th, path + S - N * th]
    P = np.vstack(rows)
    n = len(path)
    F = []
    for a in range(4):
        b = (a + 1) % 4
        F += [(a * n + k, b * n + k, b * n + k + 1, a * n + k + 1) for k in range(n - 1)]
    L = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(path, axis=0), axis=1))])
    uv = np.stack([np.tile(L, 4), np.repeat(np.arange(4), n) * w / 2], 1)
    return P, F, uv


def ropeline(length=2.0, r=0.009, path=None):
    """Hemp rope along +y (or along `path`, prop space), with UVs along it for the twisted-strand
    shading (rope kind)."""
    if path is None:
        P, F, uv = lathe([(r, 0.0), (r, length)], segs=8)
        return [piece(P, F, uv * np.array([1, 4]), {'kind': 'rope', 'color': [0.36, 0.3, 0.2], 'rough': 0.9}, 'rope')]
    path = np.asarray(path, float)
    P, F = tube(path, r, sides=8)
    L = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(path, axis=0), axis=1))])
    uv = np.stack([np.tile(np.arange(8) / 8 * 2 * math.pi * r, len(path)), np.repeat(L, 8)], 1)
    return [piece(P, F, uv, {'kind': 'rope', 'color': [0.36, 0.3, 0.2], 'rough': 0.9}, 'rope')]


def roll(l=0.12, r=0.032):
    """A bread roll along +y (centre at the origin): crusty, a little flattened, a split along
    the top."""
    prof = [(0.0, -l / 2), (r * 0.55, -l / 2 + 0.006), (r * 0.9, -l / 2 + 0.025), (r, 0.0), (r * 0.9, l / 2 - 0.025), (r * 0.55, l / 2 - 0.006), (0.0, l / 2)]
    P, F, uv = lathe(prof, segs=20)
    P[:, 0] *= 1.0
    P[:, 2] *= 0.82
    split = np.exp(-(P[:, 0] / 0.006) ** 2) * (P[:, 2] > 0) * np.clip(1 - np.abs(P[:, 1]) / (l * 0.42), 0, 1)
    P[:, 2] -= 0.004 * split
    return [piece(P, F, uv, {'kind': 'bread', 'color': [0.42, 0.22, 0.09], 'rough': 0.8}, 'roll')]


PROPS = {'spear': spear, 'loaf': loaf, 'cup': cup, 'bowl': bowl, 'basket': basket, 'crate': crate, 'parcel': parcel,
         'cloth': folded_cloth, 'lute': lute, 'recorder': recorder, 'kettle_hat': kettle_hat, 'circlet': circlet,
         'sword': sword_sheathed, 'rope': rope_coil, 'scroll': scroll, 'reins': reins, 'ropeline': ropeline, 'roll': roll}
