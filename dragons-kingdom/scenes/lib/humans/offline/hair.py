"""Hair as strand ribbons (scalp hair, braids, buns, beards, eyebrows).

Strands are grown on the REST head (upright, facing +z) where combing rules are simple, then
moved rigidly with the head into the drape pose; parts that hang (braids, long hair, tails)
are built in the drape pose under gravity, kept off the body. Every strand is a polyline of
points turned into a ribbon that lies along the surface it grows over (side vector
perpendicular to the strand and the surface normal), tapering to the tip.

Per-vertex attributes for cloth.js hairStrandMaterial: tangent3 (strand direction), aux =
(random per strand, 0 root .. 1 tip, depth in the groom 0 outer .. 1 at the scalp, 0).
"""
import math

import numpy as np

import mhcore as mc
import meshutil as mu


class Groom:
    def __init__(self, kit, V, skel, pose, off, body_faces, body_rest, body_drape, bidx, Wd, seed=1, log=print):
        import bpy  # noqa: F401
        from mathutils.bvhtree import BVHTree
        self.kit, self.V, self.skel, self.pose, self.off = kit, V, skel, pose, np.asarray(off, float)
        self.rng = np.random.default_rng(seed)
        self.faces = body_faces
        self.rest = body_rest
        self.drape = body_drape
        self.bidx = bidx
        self.Wd = Wd
        self.tris = mu.tris_of(body_faces)
        self.rest_tree = BVHTree.FromPolygons(body_rest.tolist(), self.tris.tolist(), all_triangles=True)
        self.drape_tree = BVHTree.FromPolygons(body_drape.tolist(), self.tris.tolist(), all_triangles=True)
        self.nrm_rest = mu.vnormals(body_rest, body_faces)
        names = skel.names
        self.idx = {n: i for i, n in enumerate(names)}
        Q, P = skel.world(pose)
        self.Q, self.P = Q, P
        hi = self.idx['head']
        self.head_R = mc.quat_to_mat(Q[hi])
        self.head_t = P[hi] + self.off - self.head_R @ skel.H[hi]
        eL, eR = skel.H[self.idx['eye.L']], skel.H[self.idx['eye.R']]
        self.eye_y = (eL[1] + eR[1]) / 2
        self.eye_z = (eL[2] + eR[2]) / 2
        self.skull = np.array([0.0, self.eye_y + 0.012, self.eye_z - 0.078])
        self.strands = []           # list of dicts: pts (K,3) drape, nrm (K,3) drape, width (K,), bone weights spec
        self.log = log

    # ---------------------------------------------------------- helpers --
    def to_drape(self, p):
        return (self.head_R @ np.asarray(p).T).T + self.head_t

    def dir_to_drape(self, d):
        return (self.head_R @ np.asarray(d).T).T

    def surf(self, p):
        """Nearest point + normal on the rest body."""
        from mathutils import Vector
        loc, n, i, d = self.rest_tree.find_nearest(Vector(p))
        return np.array(loc), np.array(n)

    def hairline(self, P, front=0.062, temple=0.047, ear=0.012, nape=-0.07, hl=None):
        """Height of the hairline above which the scalp grows hair (rest, per point azimuth),
        with a little irregularity (no ruler-straight edge)."""
        d = P - self.skull
        a = np.arctan2(d[:, 0], d[:, 2])
        ang = np.abs(a)                                   # 0 front, pi back
        # azimuth from the skull centre (7.8 cm behind the eyes): ~0.78 temple, ~1.2 front of the
        # sideburn, ~1.45 tragus, ~1.57 ear canal. The hairline comes down in front of the ear to
        # about the top of the ear (no bare temples), then drops behind the ear to the nape.
        xs = np.array([0.0, 0.45, 0.78, 1.02, 1.22, 1.45, 1.8, math.pi])
        ys = np.array([front, front - 0.002, temple, temple - 0.016, ear, ear - 0.012, ear - 0.04, nape])
        wob = 0.0035 * np.sin(a * 23.0 + 1.3) + 0.0025 * np.sin(a * 41.0 + 0.4)
        return self.eye_y + np.interp(ang, xs, ys) + wob

    def sample_scalp(self, n, hl_kw=None, region=None):
        """Area-uniform roots on the scalp above the hairline (rest)."""
        P, T = self.rest, self.tris
        cats = self.kit.base_cat[self.bidx]
        headish = np.isin(cats, ['head', 'neck'])
        c = P[T].mean(1)
        hl = self.hairline(c, **(hl_kw or {}))
        ok = headish[T].all(1) & (c[:, 1] > hl) & (c[:, 2] < self.eye_z + 0.03)
        # exclude the ears (outer side, small radius from the ear joint region)
        d = c - self.skull
        rxy = np.sqrt(d[:, 0] ** 2 + (d[:, 2] * 0.85) ** 2)
        ok &= ~((np.abs(d[:, 0]) > 0.062) & (c[:, 1] < self.eye_y + 0.024) & (d[:, 2] > -0.05) & (d[:, 2] < 0.014))
        if region is None:
            region = getattr(self, 'region', None)
        if region is not None:
            ok &= region(c)
        tri = T[ok]
        a, b, cc = P[tri[:, 0]], P[tri[:, 1]], P[tri[:, 2]]
        area = np.linalg.norm(np.cross(b - a, cc - a), axis=1) / 2
        cent = (a + b + cc) / 3
        band = np.clip(1 - (cent[:, 1] - self.hairline(cent, **(hl_kw or {}))) / 0.03, 0, 1)
        area = area * (1 + 2.5 * band)            # denser near the hairline (it shows the most)
        pr = area / area.sum()
        pick = self.rng.choice(len(tri), size=n, p=pr)
        u, v = self.rng.random(n), self.rng.random(n)
        flip = u + v > 1
        u[flip], v[flip] = 1 - u[flip], 1 - v[flip]
        roots = a[pick] + (b[pick] - a[pick]) * u[:, None] + (cc[pick] - a[pick]) * v[:, None]
        nr = mu.norm(np.cross(b[pick] - a[pick], cc[pick] - a[pick]))
        # make normals point away from the skull centre
        sgn = np.sign(np.einsum('ij,ij->i', nr, roots - self.skull))
        self.edge = np.clip((roots[:, 1] - self.hairline(roots, **(hl_kw or {}))) / 0.012, 0, 1)
        return roots, nr * sgn[:, None]

    def add(self, pts, nrm, width, w_head=1.0, depth=0.0, rnd=None, space='rest', drape_weights=None):
        """Register a strand (points in rest head space or drape space)."""
        if space == 'rest':
            pts = self.to_drape(pts)
            nrm = self.dir_to_drape(nrm)
        self.strands.append({'p': pts, 'n': nrm, 'w': width, 'depth': depth, 'rnd': self.rng.random() if rnd is None else rnd,
                             'wh': w_head, 'dw': drape_weights})

    # ------------------------------------------------------------ grow --
    def grow_on_scalp(self, root, n0, direction_fn, length, steps=8, lift=0.0018, layer=0.0, curl=0.0, gravity=0.0):
        """March from a root along direction_fn(p) (rest), hugging the scalp at an offset that grows
        with the layer; returns (K,3) points and normals."""
        pts = [root + n0 * (0.0004)]
        nrms = [n0]
        p = root.copy()
        step = length / steps
        d = direction_fn(p, n0)
        d = mu.norm(d - n0 * np.dot(d, n0) + n0 * 0.12)
        ph = self.rng.random() * 6.28
        for k in range(1, steps + 1):
            q = p + d * step
            s_, n_ = self.surf(q)
            off = lift + layer * min(1.0, k / steps * 2.0)
            # stay at `off` above the surface (outward only)
            dist = np.dot(q - s_, n_)
            if dist < off or (dist > off + 0.0015 and not gravity):
                q = q + n_ * (off - dist)
            if gravity:
                q = q + np.array([0, -gravity * step, 0])
            if curl:
                side = mu.norm(np.cross(d, n_))
                q = q + side * math.sin(ph + k * 1.7) * curl * step
            d2 = direction_fn(q, n_)
            d2 = mu.norm(d2 - n_ * np.dot(d2, n_))
            d = mu.norm(d * 0.45 + d2 * 0.55)
            p = q
            pts.append(q)
            nrms.append(n_)
        return np.array(pts), np.array(nrms)

    # ------------------------------------------------------------ styles --
    def style_pulled_back(self, n, gather, color_layers=0.006, length_scale=1.0, hl_kw=None, region=None, width=0.0011):
        """All hair combed back over the scalp toward a gather point (rest head space): braids, buns,
        tied-back hair. Strands stop at the gather point."""
        roots, nr = self.sample_scalp(n, hl_kw, region)
        edge = self.edge
        G = np.asarray(gather, float)
        sk = self.skull

        def fn(p, nn):
            # hair from the front and the crown goes UP and back over the top first (a waypoint
            # above the back of the crown), then down to the gather; temples and sides go back
            w = np.clip((p[2] - sk[2] + 0.02) / 0.08, 0, 1) * np.clip((p[1] - (self.eye_y + 0.035)) / 0.04, 0, 1)
            w = w * np.clip(1 - (abs(p[0]) - 0.035) / 0.035, 0, 1)
            W1 = np.array([p[0] * 0.75, sk[1] + 0.1, sk[2] - 0.05])
            return (G + (W1 - G) * w) - p
        for ri, (r, n0) in enumerate(zip(roots, nr)):
            dist = np.linalg.norm(G - r) * 1.15
            steps = max(5, int(dist / 0.011))
            layer = self.rng.random() * color_layers
            pts, nrms = self.grow_on_scalp(r, n0, fn, dist * 1.02 * length_scale, steps=steps, layer=layer, lift=0.0015)
            # pull the last points into the gather point (tied)
            k = len(pts)
            for i in range(k):
                t = max(0.0, (i / (k - 1) - 0.75) / 0.25)
                pts[i] = pts[i] * (1 - t * 0.7) + (G + nrms[i] * 0.004) * t * 0.7
            wmul = 0.3 + 0.7 * edge[ri] ** 1.5
            if self.rng.random() < 0.012 and edge[ri] > 0.8:   # a stray hair lifting off the groom
                lift = np.linspace(0, 1, k) ** 2 * (0.003 + 0.006 * self.rng.random())
                pts = pts + nrms * lift[:, None] + mu.norm(np.cross(nrms[0], pts[-1] - pts[0])) * lift[:, None] * (self.rng.random() - 0.5)
                wmul *= 0.35
            self.add(pts, nrms, np.full(len(pts), width * wmul), depth=1 - layer / max(color_layers, 1e-6))

    def baby_hairs(self, n, width=0.00035, length=(0.004, 0.014), towards=None, hl_kw=None):
        """Fine short hairs straddling the hairline (a real hairline is a density gradient, not
        an edge): rooted from 6 mm below to 4 mm above the hairline, lying close to the skin,
        pointing roughly with the groom."""
        P, T = self.rest, self.tris
        cats = self.kit.base_cat[self.bidx]
        headish = np.isin(cats, ['head'])
        c = P[T].mean(1)
        hl = self.hairline(c, **(hl_kw or {}))
        dy = c[:, 1] - hl
        ok = headish[T].all(1) & (dy > -0.006) & (dy < 0.004) & (c[:, 2] < self.eye_z + 0.03)
        d = c - self.skull
        ok &= ~((np.abs(d[:, 0]) > 0.062) & (c[:, 1] < self.eye_y + 0.024) & (d[:, 2] > -0.05) & (d[:, 2] < 0.014))
        if getattr(self, 'region', None) is not None:
            ok &= self.region(c)
        tri = T[ok]
        if not len(tri):
            return
        a, b, cc = P[tri[:, 0]], P[tri[:, 1]], P[tri[:, 2]]
        area = np.linalg.norm(np.cross(b - a, cc - a), axis=1) / 2
        pick = self.rng.choice(len(tri), size=n, p=area / area.sum())
        u, v = self.rng.random(n), self.rng.random(n)
        flip = u + v > 1
        u[flip], v[flip] = 1 - u[flip], 1 - v[flip]
        roots = a[pick] + (b[pick] - a[pick]) * u[:, None] + (cc[pick] - a[pick]) * v[:, None]
        nr = mu.norm(np.cross(b[pick] - a[pick], cc[pick] - a[pick]))
        nr *= np.sign(np.einsum('ij,ij->i', nr, roots - self.skull))[:, None]
        for r, n0 in zip(roots, nr):
            below = np.clip((self.hairline(r[None], **(hl_kw or {}))[0] - r[1]) / 0.006, 0, 1)
            L = (length[0] + (length[1] - length[0]) * self.rng.random()) * (1 - 0.6 * below)
            tgt = towards(r) if towards is not None else np.array([0, 1.0, -0.6])
            jit = (self.rng.random(3) - 0.5) * 0.8
            dirv = mu.norm(tgt + jit)
            pts, nrms = self.grow_on_scalp(r, n0, lambda p, nn, d=dirv: d, L, steps=3, lift=0.0004, layer=0.0005 * self.rng.random(), curl=0.3)
            self.add(pts, nrms, np.linspace(width, width * 0.3, len(pts)) * (1 - 0.5 * below), depth=0.1)

    def style_crop(self, n, length=(0.02, 0.05), flow='back', whorl=(0.0, 0.16, -0.06), fringe=0.3, width=0.0009, hl_kw=None, curl=0.0, loft=0.006):
        """Short cropped hair, combed from a crown whorl (rest head space)."""
        roots, nr = self.sample_scalp(n, hl_kw)
        W = self.skull + np.asarray(whorl)
        for r, n0 in zip(roots, nr):
            d = r - self.skull
            top = np.clip((r[1] - self.eye_y - 0.05) / 0.08, 0, 1)
            L = length[0] + (length[1] - length[0]) * top * (0.7 + 0.6 * self.rng.random())
            front = d[2] > 0.0

            def fn(p, nn, r=r):
                away = p - W
                away[1] *= 0.3
                down = np.array([0, -1.0, 0])
                rel = p - self.skull
                if flow == 'forward':
                    if p[2] > self.skull[2]:
                        return mu.norm(away) * 0.6 + np.array([0, -0.2, 0.8])
                    return mu.norm(away) * 0.7 + down * 0.5
                # swept back: up and back over the top, back and down on the sides
                side = np.array([np.sign(rel[0]) * 0.35, 0, 0])
                topk = np.clip((rel[1] - 0.02) / 0.06, 0, 1)
                return np.array([0, 0.25 * (1 - topk), -1.0]) * (0.4 + 0.6 * topk) + side * topk + down * (1 - topk) * 0.9
            layer = self.rng.random() * loft
            pts, nrms = self.grow_on_scalp(r, n0, fn, L, steps=6, layer=layer, lift=0.001, curl=curl)
            self.add(pts, nrms, np.linspace(width, width * 0.3, len(pts)), depth=1 - layer / max(loft, 1e-6))

    def beard_mask(self, P, moustache=True, coverage='full'):
        """Soft 0..1 beard-growth mask for rest-pose body points (stubble shading in the skin)."""
        mouth = self.V[self.kit.base.group_verts('joint-mouth')].mean(0)
        d = P - self.skull
        sm = lambda x, a, b: np.clip((x - a) / (b - a), 0, 1)
        front = sm(P[:, 2], self.skull[2] + 0.005, self.skull[2] + 0.03)
        below_cheek = sm(-(P[:, 1] - (self.eye_y - 0.045)), 0.0, 0.012)
        jaw = sm(P[:, 1], mouth[1] - 0.085, mouth[1] - 0.07)
        side = sm(-np.abs(d[:, 0]), -0.078, -0.07)
        lips = np.linalg.norm((P - mouth) * [1.0, 2.2, 1.0], axis=1)
        notlips = sm(lips, 0.02, 0.028)
        m = front * below_cheek * jaw * side * notlips
        if not moustache:
            m *= 1 - (sm(P[:, 1], mouth[1] - 0.002, mouth[1] + 0.004) * sm(-np.abs(d[:, 0]), -0.035, -0.025))
        if coverage == 'chin':
            m *= sm(-np.abs(d[:, 0]), -0.04, -0.03)
        return m

    def style_beard(self, n, length=(0.006, 0.02), width=0.0007, moustache=True, coverage='full', curl=0.4):
        """Beard roots on the jaw, chin, cheeks (below the cheekbones) and upper lip (rest)."""
        P, T = self.rest, self.tris
        c = P[T].mean(1)
        cats = self.kit.base_cat[self.bidx]
        headish = np.isin(cats, ['head', 'neck'])[T].all(1)
        mouth = self.V[self.kit.base.group_verts('joint-mouth')].mean(0)
        d = c - self.skull
        front = c[:, 2] > self.skull[2] + 0.02
        below_cheek = c[:, 1] < self.eye_y - 0.045
        jaw = c[:, 1] > mouth[1] - 0.075
        sideok = np.abs(d[:, 0]) < 0.075
        neck_front = (c[:, 1] > mouth[1] - 0.085) & (c[:, 2] > self.skull[2] - 0.01)
        lips = np.linalg.norm((c - mouth) * [1.0, 2.2, 1.0], axis=1) < 0.026
        ok = headish & below_cheek & (jaw | neck_front) & sideok & front & ~lips
        if not moustache:
            ok &= ~((c[:, 1] > mouth[1]) & (np.abs(d[:, 0]) < 0.03))
        if coverage == 'chin':
            ok &= np.abs(d[:, 0]) < 0.035
        tri = T[ok]
        a, b, cc = P[tri[:, 0]], P[tri[:, 1]], P[tri[:, 2]]
        area = np.linalg.norm(np.cross(b - a, cc - a), axis=1) / 2
        pick = self.rng.choice(len(tri), size=n, p=area / area.sum())
        u, v = self.rng.random(n), self.rng.random(n)
        flip = u + v > 1
        u[flip], v[flip] = 1 - u[flip], 1 - v[flip]
        roots = a[pick] + (b[pick] - a[pick]) * u[:, None] + (cc[pick] - a[pick]) * v[:, None]
        nr = mu.norm(np.cross(b[pick] - a[pick], cc[pick] - a[pick]))
        sgn = np.sign(np.einsum('ij,ij->i', nr, roots - self.skull))
        nr *= sgn[:, None]
        for r, n0 in zip(roots, nr):
            mo = r[1] > mouth[1] - 0.004
            L = (length[0] + (length[1] - length[0]) * self.rng.random()) * (0.6 if mo else 1.0)
            side = 1.0 if r[0] > 0 else -1.0

            def fn(p, nn, mo=mo, side=side):
                if mo:
                    return np.array([side * 0.8, -0.6, 0.1])
                return np.array([0.0, -1.0, 0.25])
            layer = self.rng.random() * 0.004
            pts, nrms = self.grow_on_scalp(r, n0, fn, L, steps=5, layer=layer, lift=0.0008, curl=curl)
            self.add(pts, nrms, np.linspace(width, width * 0.35, len(pts)), depth=0.5 * (1 - layer / 0.004))

    def braid(self, start_rest, length=0.42, width=0.034, thick=0.024, strands_per=70, period=0.055, end_tuft=0.06, hang='back'):
        """A three-strand plait from a gather point (rest head space) hanging in the drape pose,
        down the back (hang='back') or over a shoulder ('L'/'R'), resting on the body."""
        from mathutils import Vector
        G = self.to_drape(np.asarray(start_rest))
        # centreline: start going down/back, then follow the back under gravity at an offset
        pts = [G]
        d = np.array([0, -1.0, -0.25])
        if hang in ('L', 'R'):
            d = np.array([0.35 if hang == 'L' else -0.35, -0.5, 0.45])
        d = mu.norm(d)
        step = 0.01
        nsteps = int(length / step)
        for k in range(nsteps):
            q = pts[-1] + d * step
            loc, n, i, dist = self.drape_tree.find_nearest(Vector(q))
            loc, n = np.array(loc), np.array(n)
            off = thick * 0.6 + 0.004
            if np.dot(q - loc, n) < off:
                q = loc + n * off
            pts.append(q)
            d = mu.norm(d * 0.6 + np.array([0, -1.0, 0]) * 0.4)
        C = mu.resample_open(np.array(pts), nsteps + 1)
        # frame along the centreline: outward normal from the body
        T = mu.norm(np.gradient(C, axis=0))
        N = []
        for p in C:
            loc, n, i, dist = self.drape_tree.find_nearest(Vector(p))
            N.append(mu.norm(p - np.array(loc)) if dist > 1e-5 else np.array(n))
        N = np.array(N)
        N = mu.norm(N - T * np.einsum('ij,ij->i', N, T)[:, None])
        S = np.cross(T, N)
        s_arr = np.linspace(0, 1, len(C))
        taper = np.clip(1 - s_arr * 0.35, 0.5, 1)
        tie = len(C) - max(2, int(end_tuft / step))
        for b in range(3):
            ph = 2 * math.pi * b / 3
            for k in range(strands_per):
                ang = self.rng.random() * 2 * math.pi
                rr = math.sqrt(self.rng.random())
                ox, oy = math.cos(ang) * rr, math.sin(ang) * rr
                P = []
                for i, s in enumerate(s_arr):
                    L = s * length
                    tt = 2 * math.pi * L / period
                    w = width * 0.5 * taper[i]
                    lat = math.sin(tt + ph) * w * 0.62
                    dep = math.sin(2 * tt + 2 * ph + 0.6) * thick * 0.22 * taper[i]
                    if i > tie:            # loose tuft below the tie
                        f = (i - tie) / max(1, len(C) - 1 - tie)
                        lat = lat * (1 - f) + ox * w * 0.9 * f * 1.6
                        dep = dep * (1 - f) + oy * thick * 0.4 * f
                    rad = width * 0.16 * taper[i] * (0.4 if abs(i - tie) <= 1 else 1.0)
                    p = C[i] + S[i] * (lat + ox * rad) + N[i] * (dep + oy * rad * 0.7)
                    P.append(p)
                P = np.array(P)
                self.add(P, np.repeat(N[:1], len(P), 0) * 0 + N, np.full(len(P), 0.0013), depth=0.6 * (1 - rr), space='drape', w_head=0.0)
        return C

    def bun(self, centre_rest, radius=0.035, turns=4, strands=500):
        """A coiled bun (rest head space), e.g. under a veil."""
        c = np.asarray(centre_rest, float)
        s0, n0 = self.surf(c)
        nrm = mu.norm(c - self.skull)
        a = mu.norm(np.cross(nrm, [0, 1.0, 0]))
        b = np.cross(nrm, a)
        for k in range(strands):
            ph = self.rng.random() * 2 * math.pi
            rr = radius * (0.35 + 0.65 * self.rng.random())
            P = []
            for i in range(40):
                t = i / 39
                ang = ph + t * turns * 2 * math.pi / 3
                r = rr * (0.4 + 0.6 * math.sin(math.pi * t) ** 0.5)
                h = math.sin(math.pi * t) * radius * 0.6
                P.append(c + a * math.cos(ang) * r + b * math.sin(ang) * r + nrm * h)
            P = np.array(P)
            self.add(P, np.repeat(nrm[None], 40, 0), np.full(40, 0.0012), depth=0.5)

    def brows_from_card(self, card_rest_P, card_tris, card_uv, alpha_img, n=380, length=(0.006, 0.011), width=0.00026):
        """Eyebrow hairs rooted on the MakeHuman eyebrow card where its alpha is dense (rest)."""
        from humanbuild import sample_image
        A = card_rest_P
        a, b, c = A[card_tris[:, 0]], A[card_tris[:, 1]], A[card_tris[:, 2]]
        area = np.linalg.norm(np.cross(b - a, c - a), axis=1) / 2
        pick = self.rng.choice(len(card_tris), size=n * 3, p=area / area.sum())
        u, v = self.rng.random(n * 3), self.rng.random(n * 3)
        flip = u + v > 1
        u[flip], v[flip] = 1 - u[flip], 1 - v[flip]
        t = card_tris[pick]
        P = a[pick] + (b[pick] - a[pick]) * u[:, None] + (c[pick] - a[pick]) * v[:, None]
        UV = card_uv[t[:, 0]] + (card_uv[t[:, 1]] - card_uv[t[:, 0]]) * u[:, None] + (card_uv[t[:, 2]] - card_uv[t[:, 0]]) * v[:, None]
        al = sample_image(alpha_img, UV)[:, 3]
        keep = self.rng.random(len(al)) < np.clip(al * 1.6, 0, 1)
        P = P[keep][:n]
        for r in P:
            s_, n_ = self.surf(r)
            side = 1.0 if r[0] > 0 else -1.0
            med = np.clip((abs(r[0]) - 0.012) / 0.035, 0, 1)        # 0 at the inner end, 1 at the tail
            dirv = mu.norm(np.array([side * (0.35 + 0.65 * med), 0.85 * (1 - med) + 0.15 - 0.25 * med, 0.05]))
            L = length[0] + (length[1] - length[0]) * self.rng.random()
            pts, nrms = self.grow_on_scalp(s_, n_, lambda p, nn, d=dirv: d, L, steps=4, lift=0.0004, layer=0.0006 * self.rng.random())
            self.add(pts, nrms, np.linspace(width, width * 0.4, len(pts)), depth=0.2)

    # ------------------------------------------------------------ build --
    def to_part(self, name, material):
        """Ribbon mesh with attributes + skin weights."""
        from humanbuild import Part
        Ps, Ts, Ns, Aux, Tris = [], [], [], [], []
        heads = []
        base = 0
        for s in self.strands:
            p, n, w = s['p'], s['n'], s['w']
            K = len(p)
            if K < 2:
                continue
            t = mu.norm(np.gradient(p, axis=0))
            side = mu.norm(np.cross(t, n))
            bad = np.linalg.norm(np.cross(t, n), axis=1) < 1e-6
            if np.any(bad):
                side[bad] = mu.norm(np.cross(t[bad], [0, 1.0, 0]))
            along = np.linspace(0, 1, K)
            ww = w * (1 - along ** 3 * 0.85)
            a = p - side * ww[:, None] / 2
            b = p + side * ww[:, None] / 2
            V = np.empty((K * 2, 3))
            V[0::2], V[1::2] = a, b
            Ps.append(V)
            Ts.append(np.repeat(t, 2, 0))
            Ns.append(np.repeat(mu.norm(n), 2, 0))
            aux = np.zeros((K * 2, 4))
            aux[:, 0] = s['rnd']
            aux[:, 1] = np.repeat(along, 2)
            aux[:, 2] = s['depth']
            Aux.append(aux)
            for k in range(K - 1):
                i0 = base + 2 * k
                Tris.append((i0, i0 + 1, i0 + 3))
                Tris.append((i0, i0 + 3, i0 + 2))
            heads.append((base, K * 2, s['wh']))
            base += K * 2
        if not Ps:
            return None
        P = np.vstack(Ps)
        UVs = []
        for s in self.strands:
            K = len(s['p'])
            if K < 2:
                continue
            uv = np.zeros((K * 2, 2))
            uv[0::2, 0], uv[1::2, 0] = 0.0, 1.0
            uv[:, 1] = np.repeat(np.linspace(0, 1, K), 2)
            UVs.append(uv)
        part = Part(name, 'hair', P, np.array(Tris), uv=np.vstack(UVs))
        part.posed = P
        part.normals = np.vstack(Ns)
        part.attrs['tangent3'] = np.vstack(Ts)
        part.attrs['aux'] = np.vstack(Aux)
        part.material = material
        # weights: head bone for scalp hair; hanging hair from the nearest body vertex (drape)
        B = len(self.skel.names)
        hi = self.idx['head']
        I = np.zeros((len(P), 4), np.int64)
        W = np.zeros((len(P), 4))
        I[:, 0] = hi
        W[:, 0] = 1.0
        from mathutils.kdtree import KDTree
        from mathutils import Vector
        kd = None
        for (b0, cnt, wh) in heads:
            if wh >= 0.999:
                continue
            if kd is None:
                kd = KDTree(len(self.drape))
                for i, q in enumerate(self.drape):
                    kd.insert(q, i)
                kd.balance()
            for v in range(b0, b0 + cnt):
                co, j, d = kd.find(Vector(P[v]))
                wd = self.Wd[j]
                ii = np.argsort(-wd)[:4]
                ww = wd[ii] / max(1e-9, wd[ii].sum())
                I[v], W[v] = ii, ww
        part.I, part.W = I, W
        return part
