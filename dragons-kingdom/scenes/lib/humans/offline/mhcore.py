"""MakeHuman core for the Dragon's Kingdom human build (numpy only).

Everything here works on the CC0 MakeHuman hm08 base mesh and its CC0 data
(assets-lib/human/...): parsing, macro + detail targets, MHCLO proxy fitting
(eyes, brows, lashes, teeth, tongue, hair), joint positions from the joint
cubes, the default skin weights, linear-blend skinning and Catmull-Clark
subdivision as a sparse matrix (so positions, morph targets and weights are
subdivided by the same linear operator).

Coordinates: the MakeHuman OBJ is y-up, decimetres, the character faces +z
and its left is +x. Everything returned here is in three.js coordinates and
METRES (OBJ * 0.1), same axes.
"""
import gzip
import json
import math
import os
import re
from functools import lru_cache

import numpy as np

DM = 0.1  # decimetres -> metres


# ------------------------------------------------------------------ OBJ --
class Obj:
    """Minimal OBJ: v (N,3) metres, vt (M,2), faces: list of (vidx tuple, vtidx tuple, group)."""

    def __init__(self, path, scale=DM):
        V, VT, faces = [], [], []
        g = None
        with open(path, 'r', encoding='utf-8', errors='replace') as f:
            for line in f:
                if line.startswith('v '):
                    p = line.split()
                    V.append((float(p[1]), float(p[2]), float(p[3])))
                elif line.startswith('vt '):
                    p = line.split()
                    VT.append((float(p[1]), float(p[2])))
                elif line.startswith('g '):
                    g = line[2:].strip()
                elif line.startswith('f '):
                    vi, ti = [], []
                    for tok in line.split()[1:]:
                        a = tok.split('/')
                        vi.append(int(a[0]) - 1)
                        ti.append(int(a[1]) - 1 if len(a) > 1 and a[1] else -1)
                    faces.append((tuple(vi), tuple(ti), g))
        self.v = np.asarray(V, dtype=np.float64) * scale
        self.vt = np.asarray(VT, dtype=np.float64) if VT else np.zeros((0, 2))
        self.faces = faces

    def group_faces(self, pred):
        return [f for f in self.faces if pred(f[2])]

    def group_verts(self, name):
        s = set()
        for vi, _, g in self.faces:
            if g == name:
                s.update(vi)
        return np.array(sorted(s), dtype=np.int64)


# -------------------------------------------------------------- targets --
@lru_cache(maxsize=4096)
def load_target(path):
    """(idx int32 (K,), delta float32 (K,3) metres) or None if the file does not exist."""
    if not os.path.exists(path):
        return None
    op = gzip.open if path.endswith('.gz') else open
    idx, d = [], []
    with op(path, 'rt') as f:
        for line in f:
            line = line.strip()
            if not line or line[0] == '#':
                continue
            p = line.split()
            idx.append(int(p[0]))
            d.append((float(p[1]), float(p[2]), float(p[3])))
    return np.asarray(idx, dtype=np.int64), np.asarray(d, dtype=np.float64).reshape(-1, 3) * DM


class TargetLib:
    def __init__(self, lib_root):
        self.root = lib_root
        self.macro = os.path.join(lib_root, 'human/mpfb_targets_macro/targets/macrodetails')
        self.detail = os.path.join(lib_root, 'human/mpfb_targets_detail/targets')
        self.asym = os.path.join(lib_root, 'human/mpfb_targets_asym/targets/asym')
        self.expr = os.path.join(lib_root, 'human/mpfb_targets_expression/targets/expression/units')

    def detail_path(self, name):
        """'nose/nose-scale-horiz-incr' -> path (or asym/...)."""
        if name.startswith('asym/'):
            return os.path.join(self.asym, name[5:] + '.target.gz')
        return os.path.join(self.detail, name + '.target.gz')


def _lerp_parts(value, parts):
    """MakeHuman macro interpolation: list of (name, weight) for a value in [0,1]."""
    out = []
    for lo, hi, low, high in parts:
        if lo <= value <= hi or (value < 0.5 and lo < value <= hi):
            pass
    return out


def macro_weights(age=0.5, gender=0.5, muscle=0.5, weight=0.5, height=0.5, proportions=0.5, race=(1 / 3, 1 / 3, 1 / 3)):
    """Weights of the MakeHuman macro targets (same rules as MakeHuman 1.x / MPFB macro.json).

    age: 0 = 1 year, 0.1875 = 11 years, 0.5 = 25 years, 1 = 90 years.
    race: (african, asian, caucasian), normalised.
    Returns list of (relative target path, weight).
    """
    def two(v, a, b):
        return [(a, 1 - v), (b, v)]
    g = [('female', 1 - gender), ('male', gender)]
    if age < 0.1875:
        x = age / 0.1875
        a = [('baby', 1 - x), ('child', x)]
    elif age < 0.5:
        x = (age - 0.1875) / (0.5 - 0.1875)
        a = [('child', 1 - x), ('young', x)]
    else:
        x = (age - 0.5) / 0.5
        a = [('young', 1 - x), ('old', x)]
    m = two(muscle * 2, 'minmuscle', 'averagemuscle') if muscle < 0.5 else two((muscle - 0.5) * 2, 'averagemuscle', 'maxmuscle')
    w = two(weight * 2, 'minweight', 'averageweight') if weight < 0.5 else two((weight - 0.5) * 2, 'averageweight', 'maxweight')
    h = [('minheight', (0.5 - height) * 2)] if height < 0.5 else [('maxheight', (height - 0.5) * 2)]
    p = [('uncommonproportions', (0.5 - proportions) * 2)] if proportions < 0.5 else [('idealproportions', (proportions - 0.5) * 2)]
    rs = sum(race)
    r = [('african', race[0] / rs), ('asian', race[1] / rs), ('caucasian', race[2] / rs)]
    out = []
    for gn, gw in g:
        for an, aw in a:
            if gw * aw <= 0:
                continue
            for rn, rw in r:
                if rw > 0:
                    out.append((f'{rn}-{gn}-{an}', gw * aw * rw))
            for mn, mw in m:
                for wn, ww in w:
                    base = gw * aw * mw * ww
                    if base <= 0:
                        continue
                    out.append((f'universal-{gn}-{an}-{mn}-{wn}', base))
                    for hn, hw in h:
                        if hw > 0:
                            out.append((f'height/{gn}-{an}-{mn}-{wn}-{hn}', base * hw))
                    for pn, pw in p:
                        # MakeHuman has no proportions targets for babies (children under ~3 are
                        # partly 'baby' in the age blend: the child build failed on this)
                        if pw > 0 and an != 'baby':
                            out.append((f'proportions/{gn}-{an}-{mn}-{wn}-{pn}', base * pw))
    return [(n, x) for n, x in out if x > 1e-6]


def apply_targets(V, items):
    """V (N,3) metres; items: list of (path, weight). Returns a new array."""
    V = V.copy()
    for path, wt in items:
        t = load_target(path)
        if t is None:
            raise FileNotFoundError(path)
        idx, d = t
        ok = idx < len(V)
        np.add.at(V, idx[ok], d[ok] * wt)
    return V


def detail_items(tl, details):
    """details: {'nose/nose-scale-horiz': 0.3, 'asym/asym-brown-1': 0.5, ...} (value -1..1 -> decr/incr target).
    A key may also name a single target exactly (value = weight)."""
    out = []
    for k, v in details.items():
        if abs(v) < 1e-6:
            continue
        exact = tl.detail_path(k)
        if os.path.exists(exact):
            out.append((exact, v))
            continue
        pairs = [('-decr', '-incr'), ('-down', '-up'), ('-in', '-out'), ('-backward', '-forward'), ('-l', '-r'), ('-concave', '-convex'), ('-less', '-more'), ('-compress', '-uncompress')]
        done = False
        for neg, pos in pairs:
            pn = tl.detail_path(k + (pos if v > 0 else neg))
            if os.path.exists(pn):
                out.append((pn, abs(v)))
                done = True
                break
        if not done:
            raise FileNotFoundError(f'no target for {k} ({v})')
    return out


def expression_target(tl, unit, race=(1 / 3, 1 / 3, 1 / 3)):
    """Blend of the african/asian/caucasian variants of an expression unit: (idx, delta) on all verts."""
    rs = sum(race)
    acc = {}
    for rn, rw in zip(('african', 'asian', 'caucasian'), race):
        if rw <= 0:
            continue
        t = load_target(os.path.join(tl.expr, rn, unit + '.target.gz'))
        if t is None:
            continue
        for i, d in zip(*t):
            acc.setdefault(int(i), np.zeros(3))
            acc[int(i)] += d * (rw / rs)
    idx = np.array(sorted(acc), dtype=np.int64)
    return idx, np.array([acc[i] for i in idx]) if len(idx) else np.zeros((0, 3))


# ---------------------------------------------------------------- MHCLO --
class Mhclo:
    """MakeHuman proxy-fitting file (clothes, hair, eyebrows, eyelashes, eyes, teeth, tongue, proxies)."""

    def __init__(self, path):
        self.path = path
        self.dir = os.path.dirname(path)
        self.obj_file = None
        self.scale = {}
        self.refs, self.w, self.off = [], [], []
        self.delete_verts = []
        self.material = None
        mode = None
        with open(path, 'r', encoding='utf-8', errors='replace') as f:
            for line in f:
                s = line.strip()
                if not s or s.startswith('#'):
                    continue
                p = s.split()
                key = p[0]
                if key in ('x_scale', 'y_scale', 'z_scale'):
                    self.scale[key[0]] = (int(p[1]), int(p[2]), float(p[3]))
                    continue
                if key == 'obj_file':
                    self.obj_file = os.path.join(self.dir, p[1]); continue
                if key == 'material':
                    self.material = p[1]; continue
                if key in ('verts', 'weights'):
                    mode = 'verts'; continue
                if key == 'delete_verts':
                    mode = 'delete'; continue
                if key in ('uuid', 'basemesh', 'name', 'tag', 'z_depth', 'offset', 'max_pole', 'special_pose', 'vertexboneweights_file', 'license', 'author', 'homepage', 'description'):
                    # metadata lines do not end a data section ('verts 0' may be followed by
                    # 'tag ...' before the vertex lines, e.g. eyebrow010)
                    continue
                if mode == 'verts' and re.match(r'^-?\d', key):
                    if len(p) == 1:
                        self.refs.append((int(p[0]),) * 3); self.w.append((1.0, 0.0, 0.0)); self.off.append((0.0, 0.0, 0.0))
                    elif len(p) >= 9:
                        self.refs.append((int(p[0]), int(p[1]), int(p[2])))
                        self.w.append((float(p[3]), float(p[4]), float(p[5])))
                        self.off.append((float(p[6]), float(p[7]), float(p[8])))
                elif mode == 'delete':
                    for tok in p:
                        if '-' in tok[1:]:
                            a, b = tok.split('-')
                            self.delete_verts.extend(range(int(a), int(b) + 1))
                        elif re.match(r'^\d+$', tok):
                            self.delete_verts.append(int(tok))
        self.refs = np.asarray(self.refs, dtype=np.int64)
        self.w = np.asarray(self.w, dtype=np.float64)
        self.off = np.asarray(self.off, dtype=np.float64) * DM
        self.obj = Obj(self.obj_file) if self.obj_file and os.path.exists(self.obj_file) else None

    def fit(self, V):
        """Proxy vertex positions for base-mesh positions V (metres)."""
        P = (V[self.refs[:, 0]] * self.w[:, :1] + V[self.refs[:, 1]] * self.w[:, 1:2] + V[self.refs[:, 2]] * self.w[:, 2:3])
        sc = np.ones(3)
        for k, ax in (('x', 0), ('y', 1), ('z', 2)):
            if k in self.scale:
                a, b, dist = self.scale[k]
                sc[ax] = abs(V[a, ax] - V[b, ax]) / (dist * DM)
        return P + self.off * sc

    def transfer(self, per_vertex):
        """Interpolate a per-base-vertex quantity (N, ...) to the proxy vertices."""
        a = per_vertex[self.refs[:, 0]]
        sh = (-1,) + (1,) * (a.ndim - 1)
        return a * self.w[:, 0].reshape(sh) + per_vertex[self.refs[:, 1]] * self.w[:, 1].reshape(sh) + per_vertex[self.refs[:, 2]] * self.w[:, 2].reshape(sh)


# ------------------------------------------------------------------ rig --
class Rig:
    """MPFB default rig (rig.default.json): bone list, parents, head/tail from the (targeted) mesh."""

    def __init__(self, rig_json, weights_json, base_obj):
        with open(rig_json) as f:
            self.spec = json.load(f)
        with open(weights_json) as f:
            self.wspec = json.load(f)['weights']
        self.names = list(self.spec.keys())
        # parents before children
        order, seen = [], set()

        def visit(n):
            if n in seen:
                return
            p = self.spec[n].get('parent') or None
            if p and p in self.spec:
                visit(p)
            seen.add(n)
            order.append(n)
        for n in self.names:
            visit(n)
        self.names = order
        self.index = {n: i for i, n in enumerate(self.names)}
        self.parent = np.array([self.index.get(self.spec[n].get('parent') or '', -1) for n in self.names], dtype=np.int64)
        self.cubes = {}
        for g in {f[2] for f in base_obj.faces if f[2] and f[2].startswith('joint-')}:
            self.cubes[g] = base_obj.group_verts(g)

    def _point(self, spec, V):
        s = spec['strategy']
        if s == 'CUBE':
            return V[self.cubes[spec['cube_name']]].mean(0)
        if s == 'VERTEX':
            return V[spec['vertex_index']]
        if s == 'MEAN':
            return V[np.asarray(spec['vertex_indices'])].mean(0)
        raise ValueError(s)

    def joints(self, V):
        """(heads (B,3), tails (B,3)) in metres for mesh positions V."""
        H = np.array([self._point(self.spec[n]['head'], V) for n in self.names])
        T = np.array([self._point(self.spec[n]['tail'], V) for n in self.names])
        return H, T

    def skin_weights(self, nverts, k=4):
        """Top-k (indices (N,k), weights (N,k)) per base vertex, normalised."""
        lists = [[] for _ in range(nverts)]
        for bn, arr in self.wspec.items():
            bi = self.index.get(bn)
            if bi is None:
                continue
            for vi, w in arr:
                if vi < nverts:
                    lists[vi].append((w, bi))
        I = np.zeros((nverts, k), dtype=np.int64)
        W = np.zeros((nverts, k), dtype=np.float64)
        for v, l in enumerate(lists):
            l.sort(reverse=True)
            l = l[:k]
            s = sum(w for w, _ in l) or 1.0
            for j, (w, b) in enumerate(l):
                I[v, j] = b
                W[v, j] = w / s
            if not l:
                I[v, :] = 0
                W[v, 0] = 1.0
        return I, W

    def dense_weights(self, nverts):
        """(N, B) dense weight matrix (all influences), normalised per vertex."""
        Wd = np.zeros((nverts, len(self.names)), dtype=np.float64)
        for bn, arr in self.wspec.items():
            bi = self.index.get(bn)
            if bi is None:
                continue
            if not len(arr):
                continue
            a = np.asarray(arr, dtype=np.float64).reshape(-1, 2)
            vi = a[:, 0].astype(np.int64)
            ok = vi < nverts
            Wd[vi[ok], bi] = a[ok, 1]
        s = Wd.sum(1, keepdims=True)
        s[s == 0] = 1
        return Wd / s


def topk(Wd, k=4):
    idx = np.argsort(-Wd, axis=1)[:, :k]
    w = np.take_along_axis(Wd, idx, 1)
    s = w.sum(1, keepdims=True)
    s[s == 0] = 1
    return idx, w / s


# ------------------------------------------------------------ rotations --
def quat_mul(a, b):
    w1, x1, y1, z1 = a
    w2, x2, y2, z2 = b
    return np.array([w1 * w2 - x1 * x2 - y1 * y2 - z1 * z2, w1 * x2 + x1 * w2 + y1 * z2 - z1 * y2,
                     w1 * y2 - x1 * z2 + y1 * w2 + z1 * x2, w1 * z2 + x1 * y2 - y1 * x2 + z1 * w2])


def quat_axis(axis, ang):
    axis = np.asarray(axis, dtype=np.float64)
    n = np.linalg.norm(axis)
    if n < 1e-12 or abs(ang) < 1e-12:
        return np.array([1.0, 0, 0, 0])
    axis = axis / n
    s = math.sin(ang / 2)
    return np.array([math.cos(ang / 2), axis[0] * s, axis[1] * s, axis[2] * s])


def quat_to_mat(q):
    w, x, y, z = q / np.linalg.norm(q)
    return np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                     [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                     [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])


def mat_to_quat(m):
    t = m[0, 0] + m[1, 1] + m[2, 2]
    if t > 0:
        s = math.sqrt(t + 1.0) * 2
        q = [0.25 * s, (m[2, 1] - m[1, 2]) / s, (m[0, 2] - m[2, 0]) / s, (m[1, 0] - m[0, 1]) / s]
    elif m[0, 0] > m[1, 1] and m[0, 0] > m[2, 2]:
        s = math.sqrt(1.0 + m[0, 0] - m[1, 1] - m[2, 2]) * 2
        q = [(m[2, 1] - m[1, 2]) / s, 0.25 * s, (m[0, 1] + m[1, 0]) / s, (m[0, 2] + m[2, 0]) / s]
    elif m[1, 1] > m[2, 2]:
        s = math.sqrt(1.0 + m[1, 1] - m[0, 0] - m[2, 2]) * 2
        q = [(m[0, 2] - m[2, 0]) / s, (m[0, 1] + m[1, 0]) / s, 0.25 * s, (m[1, 2] + m[2, 1]) / s]
    else:
        s = math.sqrt(1.0 + m[2, 2] - m[0, 0] - m[1, 1]) * 2
        q = [(m[1, 0] - m[0, 1]) / s, (m[0, 2] + m[2, 0]) / s, (m[1, 2] + m[2, 1]) / s, 0.25 * s]
    q = np.array(q)
    return q / np.linalg.norm(q)


def rot_between(a, b):
    a = np.asarray(a, float) / np.linalg.norm(a)
    b = np.asarray(b, float) / np.linalg.norm(b)
    c = np.cross(a, b)
    d = float(np.dot(a, b))
    if d < -0.999999:
        ax = np.cross(a, [1, 0, 0])
        if np.linalg.norm(ax) < 1e-6:
            ax = np.cross(a, [0, 1, 0])
        return quat_axis(ax, math.pi)
    q = np.array([1 + d, c[0], c[1], c[2]])
    return q / np.linalg.norm(q)


def slerp(q0, q1, t):
    d = float(np.dot(q0, q1))
    if d < 0:
        q1 = -q1
        d = -d
    if d > 0.9995:
        q = q0 + t * (q1 - q0)
        return q / np.linalg.norm(q)
    th = math.acos(d)
    return (math.sin((1 - t) * th) * q0 + math.sin(t * th) * q1) / math.sin(th)


# ---------------------------------------------------------------- pose --
class Skeleton:
    """Bones with identity rest orientation (world-aligned), heads from the targeted mesh.

    A pose is a dict bone -> unit quaternion LOCAL rotation (w, x, y, z) about the bone head, in the
    parent's frame (all rest frames are world aligned, so at rest local = world axes).
    """

    def __init__(self, rig, heads, tails):
        self.rig = rig
        self.names = rig.names
        self.parent = rig.parent
        self.H = heads
        self.T = tails
        self.n = len(self.names)

    def world(self, pose):
        """World rotations (B,4) and world head positions (B,3) for a pose."""
        Q = np.zeros((self.n, 4))
        P = np.zeros((self.n, 3))
        for i, name in enumerate(self.names):
            q = pose.get(name)
            q = np.array([1.0, 0, 0, 0]) if q is None else np.asarray(q, float)
            p = self.parent[i]
            if p < 0:
                Q[i] = q
                P[i] = self.H[i]
            else:
                Q[i] = quat_mul(Q[p], q)
                P[i] = P[p] + quat_to_mat(Q[p]) @ (self.H[i] - self.H[p])
        return Q, P

    def skin_mats(self, pose, root_offset=None):
        """(B,3,4) affine skinning matrices: v' = R v + t (rest -> posed)."""
        Q, P = self.world(pose)
        M = np.zeros((self.n, 3, 4))
        for i in range(self.n):
            R = quat_to_mat(Q[i])
            t = P[i] - R @ self.H[i]
            if root_offset is not None:
                t = t + root_offset
            M[i, :, :3] = R
            M[i, :, 3] = t
        return M

    def tail_world(self, pose, i):
        Q, P = self.world(pose)
        return P[i] + quat_to_mat(Q[i]) @ (self.T[i] - self.H[i])


def lbs(V, I, W, M):
    """Linear blend skinning: V (N,3), I/W (N,k), M (B,3,4)."""
    out = np.zeros_like(V)
    for j in range(I.shape[1]):
        Mj = M[I[:, j]]                              # (N,3,4)
        pv = np.einsum('nij,nj->ni', Mj[:, :, :3], V) + Mj[:, :, 3]
        out += pv * W[:, j:j + 1]
    return out


def lbs_dir(D, I, W, M):
    """Skin direction vectors (normals, morph deltas): rotation parts only."""
    out = np.zeros_like(D)
    for j in range(I.shape[1]):
        Mj = M[I[:, j]]
        out += np.einsum('nij,nj->ni', Mj[:, :, :3], D) * W[:, j:j + 1]
    return out


# ------------------------------------------------------- mesh utilities --
def triangulate(faces):
    """faces: list of (vidx, vtidx) -> (tri v (T,3), tri vt (T,3))."""
    tv, tt = [], []
    for vi, ti in faces:
        for k in range(1, len(vi) - 1):
            tv.append((vi[0], vi[k], vi[k + 1]))
            tt.append((ti[0], ti[k], ti[k + 1]))
    return np.asarray(tv, dtype=np.int64), np.asarray(tt, dtype=np.int64)


def vertex_normals(P, tris):
    n = np.zeros_like(P)
    a, b, c = P[tris[:, 0]], P[tris[:, 1]], P[tris[:, 2]]
    fn = np.cross(b - a, c - a)
    for k in range(3):
        np.add.at(n, tris[:, k], fn)
    l = np.linalg.norm(n, axis=1, keepdims=True)
    l[l == 0] = 1
    return n / l


def catmull_clark(nverts, faces):
    """One Catmull-Clark step on polygon faces (vertex index tuples, quads/tris, may have boundaries).

    Returns (S, new_faces, edge_index) where S is a scipy-free sparse operator as (rows, cols, vals)
    mapping old vertex data (nverts, ...) to new (nverts + nedges + nfaces, ...), and new_faces are quads
    (indices into the new vertex array). Order of new vertices: [original verts | edge points | face points].
    """
    edges = {}
    efaces = []
    for fi, f in enumerate(faces):
        n = len(f)
        for k in range(n):
            a, b = f[k], f[(k + 1) % n]
            key = (a, b) if a < b else (b, a)
            if key not in edges:
                edges[key] = len(edges)
                efaces.append([])
            efaces[edges[key]].append(fi)
    ne, nf = len(edges), len(faces)
    rows, cols, vals = [], [], []
    fp0 = nverts + ne

    def add(r, c, v):
        rows.append(r); cols.append(c); vals.append(v)
    # face points
    for fi, f in enumerate(faces):
        for v in f:
            add(fp0 + fi, v, 1.0 / len(f))
    # edge points
    elist = [None] * ne
    for key, ei in edges.items():
        elist[ei] = key
        a, b = key
        fs = efaces[ei]
        if len(fs) == 2:
            add(nverts + ei, a, 0.25); add(nverts + ei, b, 0.25)
            for fi in fs:
                for v in faces[fi]:
                    add(nverts + ei, v, 0.25 / len(faces[fi]))
        else:
            add(nverts + ei, a, 0.5); add(nverts + ei, b, 0.5)
    # vertex points
    vfaces = [[] for _ in range(nverts)]
    for fi, f in enumerate(faces):
        for v in f:
            vfaces[v].append(fi)
    vedges = [[] for _ in range(nverts)]
    for ei, (a, b) in enumerate(elist):
        vedges[a].append(ei); vedges[b].append(ei)
    for v in range(nverts):
        if not vfaces[v]:
            add(v, v, 1.0)
            continue
        bnd = [ei for ei in vedges[v] if len(efaces[ei]) == 1]
        if bnd:
            # boundary rule: 3/4 v + 1/8 each boundary neighbour
            add(v, v, 0.75)
            for ei in bnd[:2]:
                a, b = elist[ei]
                add(v, b if a == v else a, 0.125)
            continue
        n = len(vfaces[v])
        # (F + 2R + (n-3) P) / n ; F = avg face points, R = avg edge midpoints
        add(v, v, (n - 3) / n)
        for fi in vfaces[v]:
            for u in faces[fi]:
                add(v, u, 1.0 / (n * n * len(faces[fi])))
        for ei in vedges[v]:
            a, b = elist[ei]
            add(v, a, 1.0 / (n * len(vedges[v])))
            add(v, b, 1.0 / (n * len(vedges[v])))
    new_faces = []
    for fi, f in enumerate(faces):
        n = len(f)
        for k in range(n):
            a, b, c = f[(k - 1) % n], f[k], f[(k + 1) % n]
            e1 = edges[(a, b) if a < b else (b, a)]
            e2 = edges[(b, c) if b < c else (c, b)]
            new_faces.append((b, nverts + e2, fp0 + fi, nverts + e1))
    return (np.asarray(rows), np.asarray(cols), np.asarray(vals), nverts + ne + nf), new_faces, edges


def sparse_apply(S, X):
    rows, cols, vals, n = S
    out = np.zeros((n,) + X.shape[1:], dtype=np.float64)
    contrib = X[cols] * vals.reshape((-1,) + (1,) * (X.ndim - 1))
    np.add.at(out, rows, contrib)
    return out


def subdivide_linear_uv(faces_vt, nvt):
    """Face-varying UVs for one subdivision step: bilinear (edge midpoints, face centres)."""
    edges = {}
    rows, cols, vals = [], [], []
    for f in faces_vt:
        for k in range(len(f)):
            a, b = f[k], f[(k + 1) % len(f)]
            key = (a, b) if a < b else (b, a)
            if key not in edges:
                edges[key] = len(edges)
    ne = len(edges)
    for v in range(nvt):
        rows.append(v); cols.append(v); vals.append(1.0)
    for (a, b), ei in edges.items():
        rows += [nvt + ei, nvt + ei]; cols += [a, b]; vals += [0.5, 0.5]
    new_faces = []
    for fi, f in enumerate(faces_vt):
        c = nvt + ne + fi
        for v in f:
            rows.append(c); cols.append(v); vals.append(1.0 / len(f))
        n = len(f)
        for k in range(n):
            a, b, cc = f[(k - 1) % n], f[k], f[(k + 1) % n]
            e1 = edges[(a, b) if a < b else (b, a)]
            e2 = edges[(b, cc) if b < cc else (cc, b)]
            new_faces.append((b, nvt + e2, c, nvt + e1))
    return (np.asarray(rows), np.asarray(cols), np.asarray(vals), nvt + ne + len(faces_vt)), new_faces
