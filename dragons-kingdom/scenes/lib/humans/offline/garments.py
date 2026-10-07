"""Garments: pattern-like construction around the body in a neutral DRESS pose, then Blender
cloth simulation while the body moves from the dress pose to the character's pose (pins follow
the skeleton, everything else falls, folds and collides), layer by layer (inner layers are
colliders for outer ones). Result: garment meshes in the drape pose (= render bind pose), with
UVs in metres of fabric, skin weights transferred from the body, wear/dust masks and baked AO.

Garment kinds (spec 'type'):
  shirt / tunic / coat / gown / gambeson  - shell over torso (+ sleeves) with an optional skirt
      extruded from the hip line (closed, or split at the front for riding coats; vents)
  hose / trousers                          - leg shells (tight hose static, trousers simulated)
  boots / shoes                            - leather foot shells with a flat sole (static)
  coif / cap / kerchief / hood             - head shells (hood: + shoulder cape, simulated)
  veil / cloak / apron / skirt / sling      - panels (simulated, pinned at their attachment line)
  belt                                     - leather band at the waist on top of the layers
"""
import math

import numpy as np

import mhcore as mc
import meshutil as mu

# bone -> body part category
def bone_category(name):
    n = name
    if n.startswith(('head', 'jaw', 'eye', 'oculi', 'orbicularis', 'levator', 'oris', 'risorius', 'temporalis', 'special', 'tongue')):
        return 'head'
    if n.startswith('neck'):
        return 'neck'
    if n.startswith(('spine', 'breast', 'clavicle', 'shoulder')):
        return 'torso'
    if n.startswith(('root', 'pelvis')):
        return 'pelvis'
    side = n[-1] if n.endswith(('.L', '.R')) else ''
    if n.startswith('upperarm'):
        return 'uarm' + side
    if n.startswith('lowerarm'):
        return 'farm' + side
    if n.startswith(('wrist', 'metacarpal', 'finger')):
        return 'hand' + side
    if n.startswith('upperleg'):
        return 'thigh' + side
    if n.startswith('lowerleg'):
        return 'shin' + side
    if n.startswith(('foot', 'toe')):
        return 'foot' + side
    return 'torso'


FABRIC_SIM = {
    'linen': dict(mass=0.12, tension=12, compression=12, shear=4, bending=0.15, air=1.0),
    'fine': dict(mass=0.08, tension=10, compression=10, shear=3, bending=0.05, air=1.2),
    'wool': dict(mass=0.25, tension=16, compression=14, shear=5, bending=0.35, air=1.0),
    'heavywool': dict(mass=0.35, tension=22, compression=22, shear=8, bending=2.5, air=0.8),
    'felt': dict(mass=0.35, tension=30, compression=30, shear=12, bending=6.0, air=0.8),
    'leather': dict(mass=0.4, tension=40, compression=40, shear=15, bending=12.0, air=0.6),
    'padded': dict(mass=0.4, tension=35, compression=35, shear=15, bending=10.0, air=0.6),
}


class Garment:
    def __init__(self, name, P, faces, uv, pin=None, spec=None, sim=True, layer=1):
        self.name = name
        self.P = np.asarray(P, float)          # dress pose
        self.faces = [tuple(f) for f in faces]
        self.uv = np.asarray(uv, float)
        self.pin = np.zeros(len(P)) if pin is None else np.asarray(pin, float)
        self.spec = spec or {}
        self.sim = sim
        self.layer = layer
        self.result = None                     # drape pose positions
        self.I = self.W = None
        self.frames = None


class Dresser:
    """Body + skeleton in the dress pose and the target pose; builds and simulates garments."""

    def __init__(self, kit, V, skel, dress_pose, target_pose, dress_off, target_off, log=print):
        self.kit, self.V, self.skel = kit, V, skel
        self.dress_pose, self.target_pose = dress_pose, target_pose
        self.dress_off, self.target_off = np.asarray(dress_off, float), np.asarray(target_off, float)
        self.log = log
        bf = [f[0] for f in kit.body_faces]
        used = sorted({v for f in bf for v in f})
        m = {v: i for i, v in enumerate(used)}
        self.bidx = np.asarray(used)
        self.faces = [tuple(m[v] for v in f) for f in bf]
        self.Wd = kit.Wd[self.bidx]
        self.I, self.W = mc.topk(self.Wd, 4)
        self.rest = V[self.bidx]
        self.M_dress = self._mats(dress_pose, self.dress_off)
        self.M_target = self._mats(target_pose, self.target_off)
        self.dress = mc.lbs(self.rest, self.I, self.W, self.M_dress)
        self.target = mc.lbs(self.rest, self.I, self.W, self.M_target)
        self.n_dress = mu.vnormals(self.dress, self.faces)
        self.nb = mu.neighbours(len(self.rest), self.faces)
        names = skel.names
        dom = np.argmax(self.Wd, axis=1)
        self.cat = np.array([bone_category(names[b]) for b in dom])
        Q, Pj = skel.world(dress_pose)
        self.J = {n: Pj[i] + self.dress_off for i, n in enumerate(names)}
        self.JQ = {n: Q[i] for i, n in enumerate(names)}
        Qt, Pt = skel.world(target_pose)
        self.Jt = {n: Pt[i] + self.target_off for i, n in enumerate(names)}
        self.layers = []                       # simulated / static garments, in order
        self.hidden = np.zeros(len(self.rest), bool)   # body vertices covered by garments
        self.nosim = False

    def _mats(self, pose, off):
        M = self.skel.skin_mats(pose)
        M[:, :, 3] += off
        return M

    def smooth_rest(self):
        """The body (rest pose) as clothes see it: small anatomy smoothed away (nipples, navel,
        ribs, knuckles) - the underlayers bridge these. Used for shell offsets AND as the cloth
        collider, so garments never tent on a nipple."""
        if not hasattr(self, '_srest'):
            R = self.rest
            nR = mu.vnormals(R, self.faces)
            S = mu.laplacian_smooth_fast(R, self.nb, iters=30, lam=0.5)
            # nipples/areolae: smoothed away locally; the cloth may press them very slightly
            mask = np.zeros(len(S))
            core = np.zeros(len(S))
            for s_ in ('L', 'R'):
                tip = self.skel.T[self.skel.names.index(f'breast.{s_}')]
                j = int(np.argmin(np.linalg.norm(R - tip, axis=1)))
                d = np.linalg.norm(R - R[j], axis=1)
                mask = np.maximum(mask, np.clip(1 - (d - 0.03) / 0.035, 0, 1))
                core = np.maximum(core, np.clip(1 - (d - 0.022) / 0.012, 0, 1))
            S = mu.laplacian_smooth_fast(S, self.nb, iters=160, lam=0.5, mask=mask)
            d = np.einsum('ij,ij->i', S - R, nR)
            S = S + nR * (np.maximum(0, -d) * (1 - core))[:, None]
            self._srest = S
        return self._srest

    def dress_smooth(self):
        if not hasattr(self, '_dsm'):
            self._dsm = mc.lbs(self.smooth_rest(), self.I, self.W, self.M_dress)
            self.n_dress_smooth = mu.vnormals(self._dsm, self.faces)
        return self._dsm

    def radius_profile(self, nth=96, dy=0.01):
        """Max horizontal distance of the body (no arms) from the body axis per (angle, height) bin."""
        if hasattr(self, '_rprof'):
            return self._rprof
        c = getattr(self, '_axis_override', None)
        c = self.axis_y() if c is None else c
        keep = ~np.array([x.startswith(('uarm', 'farm', 'hand')) for x in self.cat])
        P = self.dress[keep]
        th = np.arctan2(P[:, 0] - c[0], P[:, 2] - c[2])
        r = np.hypot(P[:, 0] - c[0], P[:, 2] - c[2])
        y0 = P[:, 1].min()
        ny = int((P[:, 1].max() - y0) / dy) + 2
        R = np.zeros((nth, ny))
        ti = ((th + math.pi) / (2 * math.pi) * nth).astype(int) % nth
        yi = ((P[:, 1] - y0) / dy).astype(int)
        np.maximum.at(R, (ti, yi), r)
        # dilate: +-2 angle bins, +-3 height bins
        R2 = R.copy()
        for a in range(-2, 3):
            for b in range(-3, 4):
                R2 = np.maximum(R2, np.roll(np.roll(R, a, 0), b, 1))
        self._rprof = (R2, nth, y0, dy, c)
        return self._rprof

    def body_radius_c(self, th, y, c):
        """Body radius seen from an arbitrary vertical axis c (bins rebuilt per axis)."""
        key = (round(float(c[0]), 4), round(float(c[2]), 4))
        if getattr(self, '_rp_key', None) != key:
            if hasattr(self, '_rprof'):
                del self._rprof
            self._axis_override = np.array([c[0], 0, c[2]])
            self._rp_key = key
        return self.body_radius(th, y)

    def body_radius(self, th, y):
        R, nth, y0, dy, c = self.radius_profile()
        ti = ((np.asarray(th) + math.pi) / (2 * math.pi) * nth).astype(int) % nth
        yi = np.clip(((np.asarray(y) - y0) / dy).astype(int), 0, R.shape[1] - 1)
        return R[ti, yi]

    def hide_under(self, old, faces, rings=2):
        """Mark body vertices covered by a shell (old: body ids of the shell's vertices) as hidden,
        except within `rings` edge rings of the shell's openings (no gaps at necklines and cuffs)."""
        bnd = {old[v] for l in mu.boundary_loops(faces) for v in l}
        inside = set(int(x) for x in old)
        near = set(bnd)
        front = set(bnd)
        for _ in range(rings):
            nxt = set()
            for v in front:
                for u in self.nb[v]:
                    u = int(u)
                    if u in inside and u not in near:
                        nxt.add(u)
            near |= nxt
            front = nxt
        for v in inside - near:
            self.hidden[v] = True

    # --------------------------------------------------------- landmarks --
    def lm(self, name):
        return self.J[name]

    def axis_y(self):
        """Vertical body axis: centroid of the body cross-section (no arms) around the hips."""
        if not hasattr(self, '_axis'):
            hy = (self.lm('upperleg01.L')[1] + self.lm('upperleg01.R')[1]) / 2 + 0.06
            keep = ~np.array([x.startswith(('uarm', 'farm', 'hand')) for x in self.cat]) & (np.abs(self.dress[:, 1] - hy) < 0.03)
            P = self.dress[keep]
            mid = (P.min(0) + P.max(0)) / 2
            self._axis = np.array([mid[0], 0.0, mid[2]])
        return self._axis

    # ------------------------------------------------------ weight xfer --
    def transfer(self, P, k=6, space='dress'):
        """Skin weights for arbitrary points from the k nearest body vertices (dress pose)."""
        from mathutils.kdtree import KDTree
        B = self.dress if space == 'dress' else self.target
        if not hasattr(self, '_kd') or self._kd[0] != space:
            kd = KDTree(len(B))
            for i, p in enumerate(B):
                kd.insert(p, i)
            kd.balance()
            self._kd = (space, kd)
        kd = self._kd[1]
        Wd = np.zeros((len(P), self.Wd.shape[1]))
        for i, p in enumerate(P):
            res = kd.find_n(p, k)
            ws = 0.0
            for co, idx, d in res:
                w = 1.0 / (d + 0.004) ** 2
                Wd[i] += self.Wd[idx] * w
                ws += w
            Wd[i] /= max(ws, 1e-9)
        return mc.topk(Wd, 4)

    def skin_dress_to(self, P, I, W, M):
        """Move dress-pose points to another pose: v' = M * M_dress^-1 * v (blended)."""
        out = np.zeros_like(P)
        Md = self.M_dress
        for j in range(I.shape[1]):
            b = I[:, j]
            Rd, td = Md[b, :, :3], Md[b, :, 3]
            Rm, tm = M[b, :, :3], M[b, :, 3]
            # dress -> rest: Rd^T (v - td);  rest -> pose: Rm u + tm
            u = np.einsum('nji,nj->ni', Rd, P - td)
            v = np.einsum('nij,nj->ni', Rm, u) + tm
            out += v * W[:, j:j + 1]
        return out

    # -------------------------------------------------------- selection --
    def region(self, cats):
        return np.isin(self.cat, list(cats))

    def faces_in(self, vmask):
        return [f for f in self.faces if all(vmask[v] for v in f)]

    # ----------------------------------------------------------- shells --
    def shell(self, vmask, ease, smooth=20, ease_min=None, extra_ease=None, name='shell'):
        """Offset surface over the body region vmask (dress pose). Returns (P, faces, src ids)."""
        F = self.faces_in(vmask)
        P0, F2, old = mu.compact(self.dress_smooth(), F)
        n0 = self.n_dress_smooth[old]
        e = np.full(len(P0), float(ease)) if extra_ease is None else ease + extra_ease(P0, old)
        S = P0 + n0 * e[:, None]
        nb = mu.neighbours(len(P0), F2)
        emin = e * 0.75 if ease_min is None else np.full(len(P0), ease_min)
        # openings (neck, cuffs, waist) must not creep: boundary vertices only slide along their loop
        bnd = np.zeros(len(P0), bool)
        loops = mu.boundary_loops(F2)
        for l in loops:
            bnd[l] = True
        for _ in range(max(1, smooth // 5)):
            S = mu.laplacian_smooth_fast(S, nb, iters=5, lam=0.6, fixed=bnd)
            for l in loops:
                Q = S[l]
                S[l] = Q * 0.6 + (np.roll(Q, 1, 0) + np.roll(Q, -1, 0)) * 0.2
            d = np.einsum('ij,ij->i', S - P0, n0)
            S = S + n0 * np.maximum(0, emin - d)[:, None]
        return S, F2, old

    # ------------------------------------------------------------- loops --
    def loops_sorted(self, P, faces):
        loops = mu.boundary_loops(faces)
        return sorted(loops, key=lambda l: -len(l))


# ====================================================================== UVs ==
def uv_cylinder(P, centre, axis, ref):
    """UVs in metres around an axis: u = arc length at the point's radius, v = height along axis."""
    axis = mu.norm(axis)
    ref = mu.norm(ref - axis * np.dot(ref, axis))
    side = np.cross(axis, ref)
    d = P - centre
    h = d @ axis
    rad = d - np.outer(h, axis)
    ang = np.arctan2(rad @ side, rad @ ref)
    r = np.linalg.norm(rad, axis=1)
    rm = np.median(r) if len(r) else 0.1
    return np.stack([ang * rm, -h], 1)


# ================================================================ builders ==
def neckline_mask(D, P, depth_front=0.03, back=0.0, wide=0.0):
    """True for points BELOW the neckline (kept)."""
    nb = D.lm('neck01')
    fwd = np.array([0, 0, 1.0])
    d = P - nb
    ang = np.arctan2(d[:, 0], d[:, 2])        # 0 = front
    cut = nb[1] + 0.012 + back - depth_front * np.cos(ang / 2) ** 4 - wide * np.cos(ang) ** 2 * 0
    return P[:, 1] < cut


def upper_garment(D, g):
    """Shirt / tunic / coat / gown bodice / gambeson. Spec keys:
    ease (m), sleeves: 'long'|'elbow'|'short'|'none'|'rolled', hem: height above ground (m) or None
    (ends at the hip line), flare (hem circumference factor), split: 'front'|'none', vent: bool,
    neck: front depth (m), smooth, fabric, belt (bool -> pins at the waist), name."""
    ease = g.get('ease', 0.012)
    sl = g.get('sleeves', 'long')
    cats = {'torso', 'pelvis', 'neck'}
    if sl != 'none':
        cats |= {'uarmL', 'uarmR'}
        if sl in ('long', 'rolled', 'elbow'):
            cats |= {'farmL', 'farmR', 'handL', 'handR'}
    vm = D.region(cats)
    P = D.dress
    # neckline
    vm &= neckline_mask(D, P, depth_front=g.get('neck', 0.03), back=g.get('neck_back', 0.0))
    # skirted garments are cut at the natural waist (convex cross-section; the skirt is a
    # separate panel sewn on there); short ones end on the hip line above the crotch
    hipj = (D.lm('upperleg01.L') + D.lm('upperleg01.R')) / 2
    if g.get('hem') is not None:
        ycut = D.lm('spine04')[1] + g.get('waist_dy', -0.01)
    else:
        ycut = hipj[1] + g.get('hip_cut', 0.035)
    trunk = np.isin(D.cat, ['torso', 'pelvis', 'neck'])
    vm &= ~(trunk & (P[:, 1] <= ycut))
    vm &= ~(np.isin(D.cat, ['thighL', 'thighR', 'shinL', 'shinR', 'footL', 'footR']))
    # sleeves: cut along the forearm / upper arm
    for s in ('L', 'R'):
        if sl == 'none':
            continue
        if sl == 'short':
            a, b = D.lm(f'upperarm01.{s}'), D.lm(f'lowerarm01.{s}')
            frac = g.get('sleeve_frac', 0.55)
        elif sl == 'elbow':
            a, b = D.lm(f'upperarm01.{s}'), D.lm(f'lowerarm01.{s}')
            frac = 1.08
        elif sl == 'rolled':
            a, b = D.lm(f'lowerarm01.{s}'), D.lm(f'wrist.{s}')
            frac = g.get('sleeve_frac', 0.45)
        else:
            a, b = D.lm(f'lowerarm01.{s}'), D.lm(f'wrist.{s}')
            frac = g.get('sleeve_frac', 0.93)
        ax = b - a
        L = np.linalg.norm(ax)
        ax /= L
        t = (P - a) @ ax / L
        arm = np.isin(D.cat, [f'uarm{s}', f'farm{s}', f'hand{s}'])
        vm &= ~(arm & (t > frac))
        if sl in ('short', 'elbow'):
            vm &= ~(np.isin(D.cat, [f'farm{s}', f'hand{s}']))
    # keep the largest connected piece only
    S, F, old = D.shell(vm, ease, smooth=g.get('smooth', 160), extra_ease=_loose_ease(D, g))
    if g.get('hides', True):
        D.hide_under(old, F, rings=g.get('hide_rings', 3))
    loops = mu.boundary_loops(F)
    # identify loops: hip loop = lowest mean y with largest extent
    info = []
    for l in loops:
        c = S[l].mean(0)
        info.append((l, c))
    chest = D.lm('spine03')[1]
    cand = [x for x in info if x[1][1] < chest] or info
    hip = min(cand, key=lambda x: abs(x[1][0] - D.axis_y()[0]) + 0.3 * max(0.0, x[1][1] - chest))[0]
    pin = np.zeros(len(S))
    # pins: shoulders/neckline band, cuffs, waist (belt)
    nk = D.lm('neck01')
    dn = np.linalg.norm((S - nk) * [1, 0.6, 1], axis=1)
    pin = np.maximum(pin, np.clip(1 - (dn - 0.07) / 0.06, 0, 1) * g.get('pin_shoulders', 1.0))
    for l in loops:
        if l is hip:
            continue
        c = S[l].mean(0)
        if c[1] < nk[1] - 0.12:     # cuffs
            for v in l:
                pin[v] = 1.0
            # second ring a little softer
            ring = set(l)
            nb = mu.neighbours(len(S), F)
            for v in l:
                for u in nb[v]:
                    if u not in ring:
                        pin[u] = max(pin[u], 0.6)
    belt_idx = None
    armv = np.array([x.startswith(('uarm', 'farm', 'hand')) for x in D.cat[old]])
    # sleeves follow the arm (soft goal) - the sim adds folds but cannot lose them in bent poses
    pin = np.maximum(pin, armv * g.get('pin_sleeves', 0.55))
    if g.get('belt'):
        wy = D.lm('spine04')[1] + g.get('belt_dy', 0.0)
        bw = np.clip(1 - np.abs(S[:, 1] - wy) / 0.03, 0, 1) * (~armv)
        pin = np.maximum(pin, bw)
        belt_idx = np.where((bw > 0.7))[0]
    if not g.get('sim', True):
        pin[:] = 1
    # skirt extrusion from the hip loop
    hem = g.get('hem')
    uvP = S
    if hem is not None:
        S, F, pin, info2 = extrude_skirt(D, S, F, hip, pin, g)
    uv = uv_body(D, S)
    G = Garment(g.get('name', g['type']), S, F, uv, pin, g, sim=g.get('sim', True), layer=g.get('layer', 2))
    G.region = np.concatenate([armv.astype(int), np.zeros(len(S) - len(armv), int)])
    G.belt_idx = belt_idx
    return G


def _loose_ease(D, g):
    """Extra ease by height: looser at the waist/belly for tunics, so the cloth blouses and folds."""
    loose = g.get('loose', 0.0)
    if not loose:
        return None
    wy = D.lm('spine04')[1]
    ch = D.lm('spine02')[1]

    def f(P, old):
        y = P[:, 1]
        k = np.clip(1 - np.abs(y - wy) / max(0.05, (ch - wy) * 1.6), 0, 1)
        return loose * k
    return f


def uv_body(D, P):
    """UVs (metres) for garment vertices: torso cylinder, arm cylinders by nearest bone axis."""
    uv = uv_cylinder(P, D.axis_y(), np.array([0, 1.0, 0]), np.array([0, 0, 1.0]))
    for s in ('L', 'R'):
        sh = D.lm(f'upperarm01.{s}')
        el = D.lm(f'lowerarm01.{s}')
        wr = D.lm(f'wrist.{s}')
        # points beyond the shoulder along the arm direction
        ax = el - sh
        t = (P - sh) @ mu.norm(ax)
        lateral = (P[:, 0] - sh[0]) * (1 if s == 'L' else -1)
        sel = (lateral > 0.02) & (t > 0.0)
        if np.any(sel):
            u2 = uv_cylinder(P[sel], sh, ax, np.array([0, 0, 1.0]))
            uv[sel] = u2 + np.array([3.0 if s == 'L' else 5.0, 0])
    return uv


def extrude_skirt(D, S, F, hip, pin, g):
    """Rings down from the waist seam to the hem height, clear of the body (hips, buttocks, legs),
    flaring out; m-times the seam's column count; optional front split (riding coats)."""
    loop = list(hip)
    P0 = S[loop]
    c = np.array([P0[:, 0].mean(), 0.0, (P0[:, 2].min() + P0[:, 2].max()) / 2])
    ang = np.arctan2(P0[:, 0] - c[0], P0[:, 2] - c[2])
    if np.mean(np.diff(np.unwrap(ang))) < 0:
        loop = loop[::-1]
    P0 = S[loop]
    ang = np.arctan2(P0[:, 0] - c[0], P0[:, 2] - c[2])
    i0 = int(np.argmin(np.abs(ang)))
    loop = loop[i0:] + loop[:i0]
    for _ in range(30):
        Q = S[loop]
        S[loop] = Q * 0.5 + (np.roll(Q, 1, 0) + np.roll(Q, -1, 0)) * 0.25
    P0 = S[loop]
    n = len(loop)
    m = g.get('col_mult', 2)
    N = n * m
    # seam points densified by linear interpolation along the loop
    Pd = np.array([P0[i // m] * (1 - (i % m) / m) + P0[(i // m + 1) % n] * ((i % m) / m) for i in range(N)])
    y0 = P0[:, 1].mean()
    L = max(0.05, y0 - g['hem'])
    rows = max(4, int(L / g.get('row', 0.022)))
    flare = g.get('flare', 1.25)
    split = g.get('split', 'none') == 'front'
    train = g.get('train', 0.0)
    pre = g.get('prefold', 0.0)
    nfold = g.get('folds', 9)
    r0v = Pd - np.array([c[0], 0, c[2]])
    r0v[:, 1] = 0
    r0 = np.linalg.norm(r0v, axis=1)
    dirs = r0v / np.maximum(r0[:, None], 1e-6)
    ang = np.arctan2(dirs[:, 0], dirs[:, 2])
    cols = N + 1 if split else N
    rings = []
    prev_rr = None
    for j in range(1, rows + 1):
        s = j / rows
        y = y0 - L * s
        rr = r0 * (1 + (flare - 1) * s ** 1.3) + 0.01 * s
        rr = np.maximum(rr, D.body_radius_c(ang, y, c) + g.get('clear', 0.018))
        if prev_rr is not None:
            rr = np.maximum(rr, prev_rr * 0.998)
        prev_rr = rr
        if pre:
            rr = rr * (1 + pre * s * np.cos(ang * nfold))
        ring = np.stack([c[0] + dirs[:, 0] * rr, np.full(N, y), c[2] + dirs[:, 2] * rr], 1)
        k = min(1.0, s * 4.0)
        ring[:, 1] = y + (Pd[:, 1] - y0) * (1 - k)
        if train:
            back = np.clip(-np.cos(ang), 0, 1) ** 2
            ring[:, 1] -= train * back * s ** 2
            ring[:, 2] -= train * 0.6 * back * s ** 2
        if split:
            ring = np.vstack([ring, ring[:1]])
        rings.append(ring)
    newP = np.vstack(rings)
    base = len(S)
    P2 = np.vstack([S, newP])

    def nid(j, i):            # ring j >= 1, column i
        return base + (j - 1) * cols + i
    sk = []
    # first band: seam (n) -> ring 1 (N = n*m): a fan of triangles per seam edge
    for i in range(n):
        a, b = loop[i], loop[(i + 1) % n]
        cs = [nid(1, i * m + k) for k in range(m + 1)]
        if i == n - 1:
            cs[-1] = nid(1, N) if split else nid(1, 0)
        for k in range(m):
            sk.append((a, cs[k], cs[k + 1]))
        sk.append((a, cs[m], b))
    for j in range(1, rows):
        for i in range(N):
            i1 = i + 1 if (split or i + 1 < N) else 0
            sk.append((nid(j, i), nid(j + 1, i), nid(j + 1, i1), nid(j, i1)))
    # one orientation for the whole skirt (outward), decided on a band face at the back
    f = sk[n + m + N // 2]
    q = P2[list(f)]
    nrm = np.cross(q[1] - q[0], q[2] - q[0])
    out = q.mean(0) - np.array([c[0], q.mean(0)[1], c[2]])
    flip = np.dot(nrm, out) < 0
    F2 = list(F) + [tuple(reversed(f)) if flip else f for f in sk]
    pin2 = np.concatenate([pin, np.zeros(len(newP))])
    for j in range(1, min(3, rows) + 1):
        sl_ = slice(base + (j - 1) * cols, base + j * cols)
        pin2[sl_] = np.maximum(pin2[sl_], 0.5 * (1 - (j - 1) / 3) * g.get('pin_hips', 1.0))
    return P2, F2, pin2, None


def leg_garment(D, g):
    """Hose / trousers: legs + pelvis below the hip cut, down to the ankle or boot top."""
    vm = D.region({'pelvis', 'thighL', 'thighR', 'shinL', 'shinR', 'torso'})
    P = D.dress
    hipj = (D.lm('upperleg01.L') + D.lm('upperleg01.R')) / 2
    top = hipj[1] + g.get('top', 0.08)
    vm &= P[:, 1] < top
    bottom = g.get('bottom', None)
    for s in ('L', 'R'):
        an = D.lm(f'foot.{s}')
        yb = an[1] + (bottom if bottom is not None else 0.02)
        vm &= ~(np.isin(D.cat, [f'shin{s}', f'thigh{s}', 'pelvis']) & (P[:, 1] < yb) & ((P[:, 0] > 0) == (s == 'L')))
    S, F, old = D.shell(vm, g.get('ease', 0.004), smooth=g.get('smooth', 40))
    D.hide_under(old, F, rings=2)
    pin = np.ones(len(S)) if not g.get('sim') else np.zeros(len(S))
    if g.get('sim'):
        pin = np.maximum(pin, np.clip((S[:, 1] - (top - 0.06)) / 0.05, 0, 1))
    uv = uv_cylinder(S, D.axis_y(), np.array([0, 1.0, 0]), np.array([0, 0, 1.0]))
    return Garment(g.get('name', g['type']), S, F, uv, pin, g, sim=g.get('sim', False), layer=g.get('layer', 1))


def boots(D, g):
    """Leather boots / shoes: foot (+ shin up to the boot top) shell with a flat sole at y = 0."""
    vm = D.region({'footL', 'footR', 'shinL', 'shinR'})
    P = D.dress
    for s in ('L', 'R'):
        kn = D.lm(f'lowerleg01.{s}')
        an = D.lm(f'foot.{s}')
        top = an[1] + (kn[1] - an[1]) * g.get('height', 0.75)
        vm &= ~((P[:, 1] > top) & ((P[:, 0] > 0) == (s == 'L')))
    S, F, old = D.shell(vm, g.get('ease', 0.006), smooth=g.get('smooth', 30))
    D.hide_under(old, F, rings=2)
    sole = D.sole
    # flatten the underside to the ground plane (the body was lifted by the sole thickness)
    n = mu.vnormals(S, F)
    low = (n[:, 1] < -0.45) & (S[:, 1] < sole + 0.03)
    S[low, 1] = 0.0
    S[:, 1] = np.maximum(S[:, 1], 0.0)
    # a little toe spring and a wider sole edge
    uv = uv_cylinder(S, D.axis_y(), np.array([0, 1.0, 0]), np.array([0, 0, 1.0]))
    return Garment(g.get('name', 'boots'), S, F, uv, np.ones(len(S)), g, sim=False, layer=0)


def head_shell(D, g):
    """coif / cap / kerchief (static) and hood (head part; the cape is a separate panel)."""
    P = D.dress
    vm = D.region({'head', 'neck'})
    eyeL, eyeR = D.lm('eye.L'), D.lm('eye.R')
    ey = (eyeL[1] + eyeR[1]) / 2
    hc = (eyeL + eyeR) / 2
    hc = np.array([0, ey, hc[2] - 0.075])     # skull centre (approx)
    d = P - hc
    ang = np.arctan2(d[:, 0], d[:, 2])
    kind = g['type']
    front = g.get('front', 0.045)               # how far down the forehead (above the eye line)
    if kind in ('coif', 'kerchief', 'cap'):
        # covers the skull above a hairline-like curve; coif also covers the ears and ties under the chin
        line = ey + front * np.cos(ang / 2) ** 2 - (0.09 if kind == 'coif' else 0.05) * np.sin(ang / 2) ** 2
        keep = P[:, 1] > line
        if kind == 'coif':
            # cheek straps down to the jaw, in front of the ears
            side = np.abs(d[:, 0]) > 0.055
            keep |= side & (P[:, 1] > ey - 0.075) & (d[:, 2] < 0.06) & (d[:, 2] > -0.02)
        vm &= keep
    elif kind == 'hood':
        face = (d[:, 2] > 0.02) & (np.abs(d[:, 0]) < 0.075) & (P[:, 1] < ey + 0.06) & (P[:, 1] > ey - 0.1)
        vm &= ~face
        vm |= D.region({'neck'}) & ~face
    xe = None
    if kind == 'hood':
        def xe(Pp, old_, hc=hc, ey=ey):
            dd = Pp - hc
            back = np.clip(-dd[:, 2] / 0.09, 0, 1)
            top = np.clip((Pp[:, 1] - ey) / 0.1, 0, 1)
            return 0.025 * np.maximum(back, top) * (0.5 + 0.5 * top)
    S, F, old = D.shell(vm, g.get('ease', 0.006 if kind != 'hood' else 0.022), smooth=g.get('smooth', 30), extra_ease=xe)
    uv = uv_cylinder(S, hc, np.array([0, 1.0, 0]), np.array([0, 0, 1.0]))
    if kind == 'hood':
        # point (liripipe stub) at the back of the hood
        back = np.clip((-(S[:, 2] - hc[2]) - 0.06) / 0.05, 0, 1) * np.clip((S[:, 1] - ey) / 0.08, 0, 1)
        S = S + np.array([0, 0.01, -0.035]) * back[:, None]
    return Garment(g.get('name', kind), S, F, uv, np.ones(len(S)), g, sim=False, layer=g.get('layer', 3))


def cape_panel(D, g):
    """Cloak / shoulder cape / hood cape: rings from a neckline arc over the shoulders down to the
    hem, open at the front (cloak) or closed (hood cape, 'closed': True)."""
    nk = D.lm('neck01')
    shL, shR = D.lm('shoulder01.L'), D.lm('shoulder01.R')
    closed = g.get('closed', False)
    length = g.get('length', 0.9)               # down from the shoulders (m)
    gap = 0 if closed else g.get('gap', 0.5)   # radians open at the front
    n = g.get('cols', 72)
    rows = max(6, int(length / g.get('row', 0.025)))
    c = np.array([nk[0], nk[1] - 0.02, nk[2] - 0.015])
    a0, a1 = -math.pi + gap / 2, math.pi - gap / 2
    angs = np.linspace(a0, a1, n) if not closed else np.linspace(-math.pi, math.pi, n, endpoint=False)
    # start ellipse around the neck base, then out over the shoulders and down
    sw = abs(shL[0] - shR[0]) / 2 + 0.06
    depth = g.get('depth', 0.13)
    P = []
    for j in range(rows + 1):
        s = j / rows
        # radius grows fast over the shoulder (first 18 cm), then slowly; height drops
        over = min(1.0, s * length / 0.18)
        rx = 0.075 + (sw - 0.075) * (1 - (1 - over) ** 2) + g.get('flare', 0.18) * max(0, s * length - 0.18)
        rz = 0.07 + (depth - 0.07) * (1 - (1 - over) ** 2) + g.get('flare', 0.18) * 0.8 * max(0, s * length - 0.18)
        y = c[1] + 0.035 * (1 - over) - 0.05 * over - max(0, s * length - 0.18) * 1.0
        ring = np.stack([c[0] + np.sin(angs) * rx, np.full(n, y), c[2] - 0.02 - np.cos(angs) * rz * np.where(np.cos(angs) > 0, 1.15, 0.85)], 1)
        P.append(ring)
    P = np.vstack(P)
    F = orient_out(P, mu.grid_faces(n, rows + 1, wrap_u=closed), np.array([c[0], 0, c[2]]), vertical=True)
    pin = np.zeros(len(P))
    pin[:n] = 1.0
    pin[n:2 * n] = 0.8
    pin[2 * n:3 * n] = 0.35
    u = np.tile(np.arange(n) / n * 2.0, rows + 1)
    v = np.repeat(np.arange(rows + 1) / rows * length, n)
    return Garment(g.get('name', 'cloak'), P, F, np.stack([u, v], 1), pin, g, sim=True, layer=g.get('layer', 4))


def apron_panel(D, g):
    """Apron: a slightly curved rectangle from the waist down in front, pinned at the waistband."""
    wy = D.lm('spine04')[1] + g.get('dy', -0.01)
    c = D.axis_y()
    hipr = 0.17
    width = g.get('width', 0.5)
    length = g.get('length', 0.55)
    n = g.get('cols', 28)
    rows = max(8, int(length / 0.025))
    # waist radius at front
    sel = np.abs(D.dress[:, 1] - wy) < 0.015
    fr = D.dress[sel & (D.dress[:, 2] > c[2])]
    rz = (fr[:, 2].max() - c[2]) + g.get('ease', 0.025) if len(fr) else 0.14
    R = max(0.12, rz)
    th = np.linspace(-width / (2 * R), width / (2 * R), n)
    P = []
    for j in range(rows + 1):
        s = j / rows
        rr = R + 0.03 * s
        P.append(np.stack([c[0] + np.sin(th) * rr, np.full(n, wy - length * s), c[2] + np.cos(th) * rr * 0.98], 1))
    P = np.vstack(P)
    F = orient_out(P, mu.grid_faces(n, rows + 1), np.array([c[0], 0, c[2]]), vertical=True)
    pin = np.zeros(len(P))
    pin[:n] = 1
    pin[n:2 * n] = 0.4
    u = np.tile(np.linspace(0, width, n), rows + 1)
    v = np.repeat(np.linspace(0, length, rows + 1), n)
    return Garment(g.get('name', 'apron'), P, F, np.stack([u, v], 1), pin, g, sim=True, layer=g.get('layer', 4))


def veil_panel(D, g):
    """Veil: a half-ellipse of fine linen laid over the crown, falling over the back of the head
    and shoulders; pinned along a band over the crown (where a fillet/circlet would hold it)."""
    eyeL, eyeR = D.lm('eye.L'), D.lm('eye.R')
    ey = (eyeL[1] + eyeR[1]) / 2
    top = D.lm('head') + np.array([0, 0.155, 0])
    hc = np.array([0, ey + 0.01, (eyeL[2] + eyeR[2]) / 2 - 0.075])
    n = g.get('cols', 54)
    length = g.get('length', 0.55)
    rows = max(10, int(length / 0.02))
    angs = np.linspace(-math.pi * 0.5, math.pi * 0.5, n)
    P = []
    for j in range(rows + 1):
        s = j / rows
        phi = s * (math.pi * 0.62)          # from the crown down the back of the head
        rad = 0.112 + g.get('ease', 0.012) + 0.05 * max(0, s - 0.4)
        y = hc[1] + 0.105 * math.cos(min(phi, math.pi / 2)) - max(0, (s * length) - 0.17) * 1.0
        hr = rad * math.sin(min(phi + 0.35, math.pi / 2))
        ring = np.stack([np.sin(angs) * (hr + 0.02 * s), np.full(n, y), hc[2] - np.cos(angs) * hr * 0.9 + 0.035 * (1 - s)], 1)
        P.append(ring)
    P = np.vstack(P)
    F = orient_out(P, mu.grid_faces(n, rows + 1), hc, vertical=False)
    pin = np.zeros(len(P))
    pin[:n * 3] = 1.0
    pin[3 * n:4 * n] = 0.6
    u = np.tile(np.linspace(0, 0.8, n), rows + 1)
    v = np.repeat(np.linspace(0, length, rows + 1), n)
    return Garment(g.get('name', 'veil'), P, F, np.stack([u, v], 1), pin, g, sim=True, layer=g.get('layer', 5))


def orient_out(P, faces, centre, vertical=True):
    """Flip the whole panel (consistently) so that its normals point away from centre."""
    tri = mu.tris_of(faces)
    a, b, c = P[tri[:, 0]], P[tri[:, 1]], P[tri[:, 2]]
    n = np.cross(b - a, c - a)
    m = (a + b + c) / 3 - centre
    if vertical:
        m[:, 1] = 0
    score = np.sum(np.einsum('ij,ij->i', n, m))
    return [tuple(reversed(f)) for f in faces] if score < 0 else faces


def hood_cape(D, g):
    """The shoulder cape of a hood (closed ring), simulated over the shoulders."""
    g2 = dict(g)
    g2.update({'closed': True, 'length': g.get('cape_length', 0.3), 'flare': 0.25, 'depth': 0.12, 'cols': 64, 'name': 'hoodcape', 'layer': g.get('layer', 3) + 0.5})
    G = cape_panel(D, g2)
    return G


BUILDERS = {
    'shirt': upper_garment, 'tunic': upper_garment, 'coat': upper_garment, 'gown': upper_garment,
    'gambeson': upper_garment, 'kirtle': upper_garment, 'doublet': upper_garment,
    'hose': leg_garment, 'trousers': leg_garment,
    'boots': boots, 'shoes': boots,
    'coif': head_shell, 'cap': head_shell, 'kerchief': head_shell, 'hood': head_shell,
    'cloak': cape_panel, 'cape': cape_panel, 'apron': apron_panel, 'veil': veil_panel,
}


# ================================================================ Blender ==
def _to_b(P):
    P = np.asarray(P, float)
    return np.stack([P[:, 0], -P[:, 2], P[:, 1]], 1)


def _from_b(B):
    B = np.asarray(B, float)
    return np.stack([B[:, 0], B[:, 2], -B[:, 1]], 1)


def _make_obj(bpy, name, P, faces):
    me = bpy.data.meshes.new(name)
    me.from_pydata(_to_b(P).tolist(), [], [list(f) for f in faces])
    me.update()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def _add_shape_anim(ob, frames_pos, frame_of_key):
    """frames_pos: list of (K) position arrays; key k fully on at frame_of_key[k], linear between."""
    ob.shape_key_add(name='basis', from_mix=False)
    keys = []
    for k, Pk in enumerate(frames_pos):
        kb = ob.shape_key_add(name=f'k{k}', from_mix=False)
        kb.data.foreach_set('co', _to_b(Pk).astype(np.float32).ravel())
        keys.append(kb)
    for k, kb in enumerate(keys):
        for k2, f in enumerate(frame_of_key):
            kb.value = 1.0 if k2 == k else 0.0
            kb.keyframe_insert('value', frame=f)
    return keys


def _set_linear(ob):
    ad = ob.data.shape_keys.animation_data
    if ad and ad.action:
        for fc in ad.action.fcurves:
            for kp in fc.keyframe_points:
                kp.interpolation = 'LINEAR'


def simulate(D, garments, steps=6, settle0=8, trans=None, settle1=22, quality=5, log=print):
    """Simulate the garments (in list order = inner to outer) while the body moves dress -> target."""
    import bpy
    import time
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.fps = 24
    # pose distance -> transition length
    if trans is None:
        dq = 0.0
        for name in D.skel.names:
            a = D.dress_pose.get(name, np.array([1.0, 0, 0, 0]))
            b = D.target_pose.get(name, np.array([1.0, 0, 0, 0]))
            dq = max(dq, 2 * math.acos(min(1.0, abs(float(np.dot(a, b))))))
        trans = int(10 + 16 * min(2.0, dq))
    # key poses
    keys = []
    for k in range(steps + 1):
        s = k / steps
        s = s * s * (3 - 2 * s)
        pose = {n: mc.slerp(D.dress_pose.get(n, np.array([1.0, 0, 0, 0])), D.target_pose.get(n, np.array([1.0, 0, 0, 0])), s) for n in D.skel.names}
        off = D.dress_off * (1 - s) + D.target_off * s
        M = D.skel.skin_mats(pose)
        M[:, :, 3] += off
        keys.append(M)
    f0 = 1
    fk = [f0 + settle0 + int(round(trans * k / steps)) for k in range(steps + 1)]
    f_end = fk[-1] + settle1
    sc.frame_start, sc.frame_end = 1, f_end
    # body collider (animated)
    body_frames = [mc.lbs(D.smooth_rest(), D.I, D.W, M) for M in keys]
    body = _make_obj(bpy, 'body', body_frames[0], D.faces)
    _add_shape_anim(body, body_frames, fk)
    _set_linear(body)
    cm = body.modifiers.new('col', 'COLLISION')
    body.collision.thickness_outer = 0.003
    body.collision.cloth_friction = 6.0
    # ground
    gp = _make_obj(bpy, 'ground', np.array([[-5, 0, -5], [5, 0, -5], [5, 0, 5], [-5, 0, 5]]), [(0, 3, 2, 1)])
    gp.modifiers.new('col', 'COLLISION')
    gp.collision.cloth_friction = 10.0
    prev = []                                   # simulated garments: (object for collision)
    for g in garments:
        t0 = time.time()
        g.I, g.W = D.transfer(g.P)
        frames = [D.skin_dress_to(g.P, g.I, g.W, M) for M in keys]
        if not g.sim or D.nosim:
            g.result = frames[-1]
            g.frames = None
            # static layer: collider following the skeleton
            ob = _make_obj(bpy, g.name, frames[0], g.faces)
            _add_shape_anim(ob, frames, fk)
            _set_linear(ob)
            ob.modifiers.new('col', 'COLLISION')
            ob.collision.thickness_outer = 0.002
            ob.collision.cloth_friction = 5.0
            prev.append(ob)
            continue
        ob = _make_obj(bpy, g.name, frames[0], g.faces)
        _add_shape_anim(ob, frames, fk)
        _set_linear(ob)
        vg = ob.vertex_groups.new(name='pin')
        for i, w in enumerate(g.pin):
            if w > 0:
                vg.add([i], float(min(1.0, w)), 'REPLACE')
        cl = ob.modifiers.new('cloth', 'CLOTH')
        st = cl.settings
        fp = FABRIC_SIM.get(g.spec.get('sim_fabric', g.spec.get('fabric', 'wool')), FABRIC_SIM['wool'])
        st.quality = quality
        st.mass = fp['mass']
        st.tension_stiffness = fp['tension']
        st.compression_stiffness = fp['compression']
        st.shear_stiffness = fp['shear']
        st.bending_stiffness = fp['bending']
        st.air_damping = fp['air']
        st.vertex_group_mass = 'pin'
        st.pin_stiffness = 1.0
        st.shrink_min = g.spec.get('shrink', 0.0)
        cs = cl.collision_settings
        cs.distance_min = g.spec.get('col_dist', 0.004)
        cs.use_self_collision = bool(g.spec.get('self_collision', False))
        cs.self_distance_min = 0.003
        cs.collision_quality = 3
        cl.point_cache.frame_start = 1
        cl.point_cache.frame_end = f_end
        rec = []
        dg = bpy.context.evaluated_depsgraph_get()
        nv = len(g.P)
        buf = np.empty(nv * 3, dtype=np.float32)
        for f in range(1, f_end + 1):
            sc.frame_set(f)
            if g.spec.get('_record', True):
                ev = ob.evaluated_get(bpy.context.evaluated_depsgraph_get())
                ev.data.vertices.foreach_get('co', buf)
                rec.append(_from_b(buf.reshape(-1, 3)).copy())
        g.result = rec[-1]
        g.frames = rec
        log(f'    cloth {g.name}: {nv} verts, {f_end} frames, {time.time() - t0:.1f} s')
        # becomes a collider for the next layers: bake its frames as shape keys
        ob.modifiers.remove(cl)
        if ob.data.shape_keys:
            ob.shape_key_clear()
        _add_shape_anim(ob, rec, list(range(1, f_end + 1)))
        _set_linear(ob)
        ob.modifiers.new('col', 'COLLISION')
        ob.collision.thickness_outer = 0.002
        ob.collision.cloth_friction = 5.0
        prev.append(ob)
    return garments
