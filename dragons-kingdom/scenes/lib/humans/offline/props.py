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
IRON = {'kind': 'iron', 'color': [0.55, 0.52, 0.5], 'rough': 0.58}
STEEL = {'kind': 'steel', 'color': [0.5, 0.5, 0.52], 'rough': 0.35}
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


def crate(w=0.5, h=0.32, d=0.36):
    """Board crate, base at y=0, open top."""
    parts = []
    t = 0.014
    nb = 3
    for k in range(nb):
        y0 = 0.01 + k * (h - 0.01) / nb
        hh = (h - 0.01) / nb - 0.008
        for (cx, cz, sx, sz) in ((0, d / 2 - t / 2, w, t), (0, -d / 2 + t / 2, w, t), (w / 2 - t / 2, 0, t, d - 2 * t), (-w / 2 + t / 2, 0, t, d - 2 * t)):
            parts.append(box(np.array([cx, y0 + hh / 2, cz]), (sx, hh, sz)))
    parts.append(box(np.array([0, 0.006, 0]), (w, 0.012, d)))
    for sx in (-1, 1):
        for sz in (-1, 1):
            parts.append(box(np.array([sx * (w / 2 - 0.03), h / 2, sz * (d / 2 + 0.004)]), (0.045, h, 0.012)))
    P, F = merge(parts)
    return [piece(P, F, boxuv(P), {'kind': 'pine', 'color': [0.62, 0.52, 0.4], 'tile': 0.8}, 'crate')]


def parcel(w=0.28, h=0.14, d=0.2):
    """Cloth-wrapped bundle tied with cord, centred at the origin."""
    P, F, uv = lathe([(0.0, -0.5), (0.45, -0.48), (0.5, -0.3), (0.5, 0.3), (0.45, 0.48), (0.0, 0.5)], segs=16, close_top=False)
    P = P * np.array([w, h, d])
    rng = np.random.default_rng(3)
    P += (rng.random(P.shape) - 0.5) * 0.004
    out = [piece(P, F, uv * 2, {'kind': 'linen', 'color': [0.48, 0.42, 0.33], 'rough': 0.85, 'tile': 0.15}, 'cloth')]
    for ang in (0, math.pi / 2):
        a = np.linspace(0, 2 * math.pi, 40)
        ex, ez = (w * 0.51, d * 0.51) if ang == 0 else (w * 0.51, d * 0.51)
        if ang == 0:
            path = np.stack([np.cos(a) * ex, np.sin(a) * h * 0.52, np.zeros_like(a)], 1)
        else:
            path = np.stack([np.zeros_like(a), np.sin(a) * h * 0.52, np.cos(a) * ez], 1)
        Pc, Fc = tube(path, 0.003, sides=6)
        out.append(piece(Pc, Fc, boxuv(Pc), {'kind': 'flat', 'color': [0.35, 0.3, 0.22], 'rough': 0.9}, 'cord'))
    return out


def folded_cloth(w=0.3, h=0.05, d=0.22, color=(0.6, 0.57, 0.5)):
    P, F, uv = lathe([(0.0, 0.0), (0.46, 0.0), (0.5, 0.2), (0.5, 0.8), (0.46, 1.0), (0.0, 1.0)], segs=4)
    R = rot_y(math.pi / 4)
    P = (P @ R.T) * np.array([w * 1.41, h, d * 1.41])
    return [piece(P, F, uv, {'kind': 'linen', 'color': list(color), 'tile': 0.12}, 'cloth')]


def lute(body_l=0.42, body_w=0.32):
    """Lute: bowl back (-z), soundboard facing +z at z=0, neck toward +y, pegbox bent back."""
    out = []
    # bowl: half-ellipsoid
    u = np.linspace(0, math.pi, 16)        # along the length
    v = np.linspace(0, math.pi, 12)        # around the back
    P = []
    for a in u:
        for b in v:
            rr = math.sin(a)
            P.append((math.cos(b) * rr * body_w / 2, -math.cos(a) * body_l / 2, -math.sin(b) * rr * body_w * 0.42))
    P = np.array(P)
    P[:, 1] *= np.where(P[:, 1] > 0, 0.85, 1.0)
    F = [tuple(reversed(f)) for f in mu.grid_faces(len(v), len(u))]
    out.append(piece(P, F, boxuv(P), dict(WOOD, color=[0.32, 0.18, 0.09], rough=0.35), 'bowl'))
    # soundboard
    a = np.linspace(0, 2 * math.pi, 40)
    rim = np.stack([np.sin(a) * body_w / 2, -np.cos(a) * body_l / 2, np.zeros_like(a)], 1)
    rim[:, 1] *= np.where(rim[:, 1] > 0, 0.85, 1.0)
    Pc = np.vstack([[[0, 0, 0.0]], rim])
    Fc = [(0, i + 1, (i + 1) % 40 + 1) for i in range(40)]
    out.append(piece(Pc, Fc, boxuv(Pc), dict(WOOD, color=[0.62, 0.48, 0.3], rough=0.45), 'board'))
    # rose (dark disc)
    Pr = np.vstack([[[0, 0.03, 0.001]], np.stack([np.sin(a) * 0.035, 0.03 + np.cos(a) * 0.035, np.full_like(a, 0.001)], 1)])
    out.append(piece(Pr, [(0, (i + 1) % 40 + 1, i + 1) for i in range(40)], boxuv(Pr), {'kind': 'flat', 'color': [0.02, 0.015, 0.01], 'rough': 0.9}, 'rose'))
    # neck + pegbox
    nb = box(np.array([0, body_l * 0.425 + 0.13, 0.005]), (0.05, 0.27, 0.025))
    R = rot_x(-1.3)
    pg = box(np.array([0, 0, 0]), (0.045, 0.16, 0.02), R)
    pg = (pg[0] + np.array([0, body_l * 0.425 + 0.27 + 0.03, -0.06]), pg[1])
    P2, F2 = merge([nb, pg])
    out.append(piece(P2, F2, boxuv(P2), dict(WOOD, color=[0.2, 0.12, 0.07], rough=0.4), 'neck'))
    return out


def recorder(l=0.32):
    P, F, uv = lathe([(0.0, 0.0), (0.012, 0.0), (0.011, 0.04), (0.0105, l - 0.06), (0.014, l - 0.02), (0.016, l), (0.0, l)], segs=12)
    return [piece(P, F, uv, dict(WOOD, color=[0.55, 0.38, 0.2], rough=0.4), 'recorder')]


def kettle_hat(r=0.112):
    """Iron kettle hat, its inner rim centred at the origin (head top above)."""
    prof = [(r * 1.62, -0.03), (r * 1.6, -0.022), (r * 1.03, 0.0), (r * 1.0, 0.05), (r * 0.86, 0.11), (r * 0.45, 0.15), (0.0, 0.158)]
    P, F, uv = lathe(prof, segs=36)
    return [piece(P, F, uv, dict(IRON, color=[0.45, 0.43, 0.41], rough=0.55), 'hat')]


def circlet(r=0.085, h=0.018, points=0):
    a = np.linspace(0, 2 * math.pi, 64, endpoint=False)
    P = []
    for y in (0, h):
        for ang in a:
            bump = h * 0.8 * max(0, math.cos(ang * points)) ** 6 if points and y > 0 else 0
            P.append((math.cos(ang) * r, y + bump, math.sin(ang) * r * 1.15))
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


def rope_coil(r=0.13, turns=6, thick=0.012):
    pts = []
    for k in range(turns * 40):
        a = k / 40 * 2 * math.pi
        rr = r + 0.004 * math.sin(a * 3) + (k / (turns * 40)) * 0.01
        pts.append((math.cos(a) * rr, (k % 40) / 40 * 0.0 + (k // 40) * thick * 0.9 * 0.3, math.sin(a) * rr))
    P, F = tube(np.array(pts), thick / 2, sides=6)
    return [piece(P, F, boxuv(P) * 4, {'kind': 'flat', 'color': [0.38, 0.32, 0.22], 'rough': 0.9}, 'rope')]


def scroll(l=0.24, r=0.016):
    P, F, uv = lathe([(0.0, -l / 2), (r, -l / 2), (r, l / 2), (0.0, l / 2)], segs=14)
    P = P @ rot_z(math.pi / 2).T
    a = np.linspace(0, 2 * math.pi, 24)
    path = np.stack([np.zeros_like(a) + 0.02, np.sin(a) * r * 1.05, np.cos(a) * r * 1.05], 1)
    Pc, Fc = tube(path, 0.003, sides=5)
    return [piece(P, F, uv, {'kind': 'flat', 'color': [0.62, 0.55, 0.42], 'rough': 0.8}, 'parchment'),
            piece(Pc, Fc, boxuv(Pc), {'kind': 'flat', 'color': [0.35, 0.05, 0.03], 'rough': 0.7}, 'ribbon')]


def reins(length=0.7, w=0.018):
    """A flat leather strap from the origin forward (+z) and down."""
    s = np.linspace(0, 1, 16)
    path = np.stack([np.zeros_like(s), -0.15 * s ** 2, s * length], 1)
    P = np.vstack([np.stack([path[:, 0] - w / 2, path[:, 1], path[:, 2]], 1), np.stack([path[:, 0] + w / 2, path[:, 1], path[:, 2]], 1)])
    n = len(s)
    F = [(i, i + 1, n + i + 1, n + i) for i in range(n - 1)]
    return [piece(P, F, boxuv(P), dict(LEATHER, color=[0.07, 0.045, 0.028], doubleSide=True), 'reins')]


PROPS = {'spear': spear, 'loaf': loaf, 'cup': cup, 'bowl': bowl, 'basket': basket, 'crate': crate, 'parcel': parcel,
         'cloth': folded_cloth, 'lute': lute, 'recorder': recorder, 'kettle_hat': kettle_hat, 'circlet': circlet,
         'sword': sword_sheathed, 'rope': rope_coil, 'scroll': scroll, 'reins': reins}


def ropeline(length=2.0, r=0.009):
    P, F, uv = lathe([(r, 0.0), (r, length)], segs=8)
    return [piece(P, F, uv * np.array([1, 4]), {'kind': 'flat', 'color': [0.4, 0.34, 0.24], 'rough': 0.9}, 'rope')]


PROPS['ropeline'] = ropeline
