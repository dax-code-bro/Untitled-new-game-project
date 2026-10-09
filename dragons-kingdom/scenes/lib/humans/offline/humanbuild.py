"""Character assembly: shape (targets) -> joints -> pose -> skinned meshes (body, eyes, brows,
lashes, teeth, tongue, hair, garments, props) -> baked per-vertex AO / thickness -> export.

All geometry is exported in the DRAPE pose (the pose the garments were simulated in), which is
also the skin bind pose at render time, so the runtime only adds small deltas (breathing, sway,
blinks, saccades) as pure functions of t.
"""
import math
import os

import numpy as np

import mhcore as mc
from posing import PoseBuilder, norm

HERE = os.path.dirname(os.path.abspath(__file__))


def lib_path(lib, *p):
    return os.path.join(lib, *p)


class Kit:
    """Shared, loaded once: base mesh, rig, dense weights, proxy files."""

    def __init__(self, lib):
        self.lib = lib
        self.base = mc.Obj(lib_path(lib, 'human/makehuman_base/base.obj'))
        self.rig = mc.Rig(lib_path(lib, 'human/makehuman_base/rig.default.json'), lib_path(lib, 'human/makehuman_base/weights.default.json'), self.base)
        self.tl = mc.TargetLib(lib)
        self.N = len(self.base.v)
        self.Wd = self.rig.dense_weights(self.N)
        self.body_faces = [(vi, ti) for vi, ti, g in self.base.faces if g == 'body']
        self._proxy = {}

    def proxy(self, rel):
        if rel not in self._proxy:
            self._proxy[rel] = mc.Mhclo(lib_path(self.lib, rel))
        return self._proxy[rel]


# --------------------------------------------------------------- shape --
def shape(kit, spec):
    """Targeted base-mesh vertex positions (all 19158 verts incl. helpers), metres."""
    m = spec.get('macro', {})
    items = [(os.path.join(kit.tl.macro, n + '.target.gz'), w) for n, w in mc.macro_weights(
        age=m.get('age', 0.5), gender=m.get('gender', 0.5), muscle=m.get('muscle', 0.5), weight=m.get('weight', 0.5),
        height=m.get('height', 0.5), proportions=m.get('proportions', 0.5), race=tuple(m.get('race', (1 / 3, 1 / 3, 1 / 3))))]
    items += mc.detail_items(kit.tl, spec.get('details', {}))
    V = mc.apply_targets(kit.base.v, items)
    # facial expression units (CC0 MakeHuman / MPFB2): {unit: weight} or {unit: (weight, 'L'|'R')}
    # - a side limits a symmetric unit to one half of the face (an asymmetric smile)
    ex = spec.get('expression') or {}
    race = tuple(m.get('race', (1 / 3, 1 / 3, 1 / 3)))
    for unit, w in ex.items():
        side = None
        if isinstance(w, (tuple, list)):
            w, side = w
        idx, d = mc.expression_target(kit.tl, unit, race)
        if not len(idx):
            continue
        k = np.full(len(idx), float(w))
        if side:
            x = kit.base.v[idx, 0]
            k *= np.clip(0.5 + (x if side == 'L' else -x) / 0.02, 0, 1)
        V[idx] += d * k[:, None]
    return V


# ----------------------------------------------------------- geometry --
def split_by_uv(faces, nv):
    """faces: list of (vidx, vtidx). Returns (vert_of (K,), vt_of (K,), tris (T,3) into K)."""
    key = {}
    vo, to = [], []
    tris = []
    for vi, ti in faces:
        ids = []
        for v, t in zip(vi, ti):
            k = (v, t)
            if k not in key:
                key[k] = len(vo)
                vo.append(v)
                to.append(t)
            ids.append(key[k])
        for j in range(1, len(ids) - 1):
            tris.append((ids[0], ids[j], ids[j + 1]))
    return np.asarray(vo), np.asarray(to), np.asarray(tris, dtype=np.int64)


class Part:
    """A skinned mesh in rest space (before posing)."""

    def __init__(self, name, kind, P, tris, uv=None, Wd=None, I=None, W=None, weld=None, material=None, attrs=None, morphs=None):
        self.name, self.kind = name, kind
        self.P = np.asarray(P, float)
        self.tris = np.asarray(tris, dtype=np.int64)
        self.uv = uv
        self.weld = weld                      # (K,) topological vertex id (for smooth normals across UV seams)
        if Wd is not None:
            I, W = mc.topk(Wd, 4)
        self.I, self.W = I, W
        self.material = material or {}
        self.attrs = attrs or {}
        self.morphs = morphs or {}
        self.posed = None
        self.normals = None


def welded_normals(P, tris, weld):
    if weld is None:
        return mc.vertex_normals(P, tris)
    nw = weld.max() + 1
    acc = np.zeros((nw, 3))
    a, b, c = P[tris[:, 0]], P[tris[:, 1]], P[tris[:, 2]]
    fn = np.cross(b - a, c - a)
    for k in range(3):
        np.add.at(acc, weld[tris[:, k]], fn)
    l = np.linalg.norm(acc, axis=1, keepdims=True)
    l[l == 0] = 1
    return (acc / l)[weld]


def body_part(kit, V, subdiv=0, morph_rest=None):
    """The skin surface ('body' group) with UVs; optional Catmull-Clark level 1.
    morph_rest: {name: (N,3) delta on base verts}. Returns Part."""
    faces_v = [f[0] for f in kit.body_faces]
    faces_t = [f[1] for f in kit.body_faces]
    Vx, Wx = V, kit.Wd
    morphs = dict(morph_rest or {})
    nv, nvt = len(V), len(kit.base.vt)
    UV = kit.base.vt
    if subdiv:
        S, faces_v, _ = mc.catmull_clark(nv, faces_v)
        Su, faces_t = mc.subdivide_linear_uv(faces_t, nvt)
        Vx = mc.sparse_apply(S, V)
        Wx = mc.sparse_apply(S, kit.Wd)
        morphs = {k: mc.sparse_apply(S, d) for k, d in morphs.items()}
        UV = mc.sparse_apply(Su, UV)
        nv = len(Vx)
    vo, to, tris = split_by_uv(list(zip(faces_v, faces_t)), nv)
    # compact the welded ids to the used vertices
    used, weld = np.unique(vo, return_inverse=True)
    p = Part('body', 'skin', Vx[vo], tris, uv=UV[to], Wd=Wx[vo], weld=weld)
    p.morphs = {k: d[vo] for k, d in morphs.items()}
    p.src = vo   # source (subdivided) vertex ids
    return p


def proxy_part(kit, rel, V, name, kind, material=None, keep=None, morph_rest=None):
    px = kit.proxy(rel)
    P = px.fit(V)
    Wd = px.transfer(kit.Wd)
    o = px.obj
    faces = [(vi, ti) for vi, ti, g in o.faces]
    if keep is not None:
        faces = [f for f in faces if keep(f, P)]
    vo, to, tris = split_by_uv(faces, len(P))
    uv = o.vt[to] if len(o.vt) else np.zeros((len(vo), 2))
    used, weld = np.unique(vo, return_inverse=True)
    part = Part(name, kind, P[vo], tris, uv=uv, Wd=Wd[vo], weld=weld, material=material)
    part.src = vo
    part.px = px
    if morph_rest:
        # the proxy follows the body's morphs (eyelashes ride on the blinking lids)
        part.morphs = {k: (px.fit(V + d) - P)[vo] for k, d in morph_rest.items()}
    return part


# ---------------------------------------------------------------- pose --
def pose_parts(skel, pose, parts, root_offset):
    M = skel.skin_mats(pose)
    M[:, :, 3] += root_offset
    for p in parts:
        if p.I is None:            # static (already in drape space)
            p.posed = p.P.copy()
            p.normals = welded_normals(p.posed, p.tris, p.weld)
            continue
        p.posed = mc.lbs(p.P, p.I, p.W, M)
        p.normals = welded_normals(p.posed, p.tris, p.weld)
        p.posed_morphs = {k: mc.lbs_dir(d, p.I, p.W, M) for k, d in p.morphs.items()}
    return M


# ------------------------------------------------------------- baking --
def bake_ao_thickness(parts, rays=48, max_dist=0.12, thick_parts=('body',), seed=7):
    """Per-vertex ambient occlusion (distance-limited, cosine-weighted) over ALL parts, and a
    thickness estimate (distance along -normal to the opposite surface) for the skin."""
    import bpy  # noqa: F401  (registers mathutils)
    from mathutils.bvhtree import BVHTree
    allP, allT, off = [], [], 0
    for p in parts:
        if not p.material.get('occluder', True):
            continue
        allP.append(p.posed)
        allT.append(p.tris + off)
        off += len(p.posed)
    P = np.concatenate(allP)
    T = np.concatenate(allT)
    tree = BVHTree.FromPolygons(P.tolist(), T.tolist(), all_triangles=True, epsilon=0.0)
    rng = np.random.default_rng(seed)
    # cosine-weighted hemisphere directions (fixed set, rotated per vertex frame)
    u1, u2 = rng.random(rays), rng.random(rays)
    r = np.sqrt(u1)
    th = 2 * np.pi * u2
    local = np.stack([r * np.cos(th), r * np.sin(th), np.sqrt(1 - u1)], 1)
    from mathutils import Vector
    for p in parts:
        if not p.material.get('bake_ao', True):
            continue
        n = p.normals
        ao = np.ones(len(p.posed))
        nr = p.material.get('ao_rays', rays)
        stride = p.material.get('ao_stride', 1)      # bake every k-th vertex (ribbons: both edges alike)
        for i in range(0, len(p.posed), stride):
            nn = n[i]
            t1 = np.cross(nn, [0, 1, 0] if abs(nn[1]) < 0.9 else [1, 0, 0])
            t1 /= np.linalg.norm(t1) + 1e-12
            t2 = np.cross(nn, t1)
            dirs = (local[:, :1] * t1 + local[:, 1:2] * t2 + local[:, 2:3] * nn)[:nr]
            o = p.posed[i] + nn * 0.0015
            occ = 0.0
            ov = Vector(o)
            for d in dirs:
                hit = tree.ray_cast(ov, Vector(d), max_dist)
                if hit[0] is not None:
                    occ += 1.0 - (hit[3] / max_dist) ** 0.5 * 0.6
            ao[i] = 1.0 - occ / nr
            if stride > 1:
                ao[i:i + stride] = ao[i]
        p.attrs['ao'] = ao
        if p.name in thick_parts or p.material.get('thickness'):
            th_ = np.full(len(p.posed), 0.3)
            for i in range(len(p.posed)):
                o = p.posed[i] - n[i] * 0.0015
                hit = tree.ray_cast(Vector(o), Vector(-n[i]), 0.3)
                if hit[0] is not None:
                    th_[i] = hit[3]
            p.attrs['thick'] = th_
    return parts


# ------------------------------------------------------------- export --
def to_mesh_dict(p):
    attrs = {
        'position': (p.posed.astype(np.float32), 3, np.float32),
        'normal': (p.normals.astype(np.float32), 3, np.float32),
    }
    if p.uv is not None:
        attrs['uv'] = (np.asarray(p.uv, np.float32), 2, np.float32)
    if p.I is not None:
        attrs['skinIndex'] = (p.I.astype(np.uint16), 4, np.uint16)
        attrs['skinWeight'] = (p.W.astype(np.float32), 4, np.float32)
    for k, v in p.attrs.items():
        v = np.asarray(v, np.float32)
        attrs[k] = (v, 1 if v.ndim == 1 else v.shape[1], np.float32)
    d = {'name': p.name, 'kind': p.kind, 'material': p.material, 'attrs': attrs, 'index': p.tris.reshape(-1)}
    if getattr(p, 'tris_all', None) is not None:
        # every body triangle incl. those hidden under the clothes: a collider for the in-place
        # cloth passes (offline/postfix.py); the runtime does not read it
        d['collider_index'] = p.tris_all.reshape(-1)
    if getattr(p, 'posed_morphs', None):
        d['morphs'] = {k: v.astype(np.float32) for k, v in p.posed_morphs.items()}
    return d


# ------------------------------------------------------ derived attributes --
def image_array(path):
    """RGBA float array (H, W, 4), row 0 = bottom (Blender convention, matches OBJ v up)."""
    import bpy
    img = bpy.data.images.load(path, check_existing=True)
    w, h = img.size
    a = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(a)
    return a.reshape(h, w, 4)


def sample_image(img, uv):
    h, w = img.shape[:2]
    x = np.clip((uv[:, 0] % 1.0) * (w - 1), 0, w - 1).astype(np.int64)
    y = np.clip((uv[:, 1] % 1.0) * (h - 1), 0, h - 1).astype(np.int64)
    return img[y, x]


def eye_attrs(part, skel, pose, off):
    from mhcore import quat_to_mat
    Q, P = skel.world(pose)
    idx = {n: i for i, n in enumerate(skel.names)}
    g = np.zeros((len(part.posed), 3))
    iris = np.full(len(part.posed), 2.0)
    for side in ('L', 'R'):
        i = idx[f'eye.{side}']
        c = P[i] + off
        d = quat_to_mat(Q[i]) @ (skel.T[i] - skel.H[i])
        d /= np.linalg.norm(d)
        sel = part.posed[:, 0] > 0 if side == 'L' else part.posed[:, 0] <= 0
        v = part.posed[sel] - c
        v /= np.linalg.norm(v, axis=1, keepdims=True) + 1e-12
        ang = np.arccos(np.clip(v @ d, -1, 1))
        g[sel] = d
        iris[sel] = ang / math.radians(29.0)
    part.attrs['gaze'] = g
    part.attrs['iris'] = iris


def skin_aux(kit, body, V, skel, skin_map_path):
    """Per-vertex (lips, nails, lid margin, 0) on the body part (rest positions body.P)."""
    P = body.P
    aux = np.zeros((len(P), 4))
    # lips: redder than the surrounding skin in the photographic texture, near the mouth
    mouth = V[kit.base.group_verts('joint-mouth')].mean(0)
    img = image_array(skin_map_path)
    col = sample_image(img, body.uv)[:, :3]
    red = col[:, 0] / np.maximum(1e-3, col[:, 1]) 
    dm = np.linalg.norm((P - mouth) * [1.0, 1.3, 1.0], axis=1)
    near = np.clip(1 - (dm - 0.022) / 0.012, 0, 1)
    ref = np.median(red[(dm > 0.035) & (dm < 0.06)]) if np.any((dm > 0.035) & (dm < 0.06)) else red.mean()
    aux[:, 0] = np.clip((red - ref) / 0.25, 0, 1) * near
    # nails: distal finger segments, dorsal side, outer 60 %
    idx = {n: i for i, n in enumerate(skel.names)}
    nrm = mc.vertex_normals(P, body.tris) if body.weld is None else welded_normals(P, body.tris, body.weld)
    for side in ('L', 'R'):
        w = skel.H[idx[f'wrist.{side}']]
        f2, f5 = skel.H[idx[f'finger2-1.{side}']], skel.H[idx[f'finger5-1.{side}']]
        fwd = norm((f2 + f5) / 2 - w)
        lat = norm(f5 - f2)
        sg = 1.0 if side == 'L' else -1.0
        palm = norm(sg * np.cross(lat, fwd))
        for k in (1, 2, 3, 4, 5):
            bi = idx[f'finger{k}-3.{side}']
            h, t = skel.H[bi], skel.T[bi]
            ax = t - h
            L = np.linalg.norm(ax)
            ax = ax / L
            rel = P - h
            along = rel @ ax / L
            radial = rel - np.outer(rel @ ax, ax)
            rd = np.linalg.norm(radial, axis=1)
            back = -palm if k > 1 else norm(np.cross(ax, palm) * sg * -1.0)
            sel = (along > 0.25) & (along < 1.25) & (rd < 0.012)
            dors = (nrm @ back)
            m = np.clip((dors - 0.25) / 0.35, 0, 1) * np.clip((along - 0.3) / 0.2, 0, 1)
            aux[sel, 1] = np.maximum(aux[sel, 1], m[sel])
    body.attrs['aux'] = aux
    body.attrs['aux2'] = face_masks(kit, body, V)
    body.attrs['aux3'] = skin_zones(kit, body, V, skel, nrm)
    body.attrs['albg'] = albedo_gain(kit, body, V, col, aux, body.attrs['aux2'])
    return aux


def skin_zones(kit, body, V, skel, nrm):
    """(T-zone, hand, knuckles, fingertips) per body vertex (rest):
    T-zone = forehead centre, nose and chin - the oily skin (the oil film elsewhere put a waxy
    hotspot on cheekbones and an oily sheen on the neck); hand = beyond the wrist; knuckles =
    the dorsal skin over the finger joints (redder, creased); fingertips = the pads and tips
    (redder; the baked cavity AO turned curled fingertips purple)."""
    P = body.P
    out = np.zeros((len(P), 4))
    g = lambda name: V[kit.base.group_verts(name)].mean(0)
    eL, eR = g('joint-l-eye'), g('joint-r-eye')
    mouth = g('joint-mouth')
    ey, ez = (eL[1] + eR[1]) / 2, (eL[2] + eR[2]) / 2
    gauss = lambda c, s: np.exp(-np.sum(((P - c) / s) ** 2, axis=1))
    front = np.clip((P[:, 2] - (ez - 0.02)) / 0.02, 0, 1)
    tz = gauss(np.array([0, ey + 0.045, ez + 0.01]), np.array([0.03, 0.028, 0.06]))
    tz = np.maximum(tz, gauss(np.array([0, (ey + mouth[1]) / 2 + 0.005, ez + 0.03]), np.array([0.011, 0.03, 0.04])))
    tz = np.maximum(tz, 0.6 * gauss(np.array([0, mouth[1] - 0.04, mouth[2]]), np.array([0.014, 0.012, 0.04])))
    out[:, 0] = np.clip(tz * front * 1.3, 0, 1)
    idx = {n: i for i, n in enumerate(skel.names)}
    H, T = skel.H, skel.T
    for s in ('L', 'R'):
        el, wr = H[idx[f'lowerarm01.{s}']], H[idx[f'wrist.{s}']]
        ax = mc_norm(wr - el)
        t = (P - wr) @ ax
        near = np.linalg.norm(P - wr, axis=1) < 0.22
        hand = np.clip((t + 0.01) / 0.015, 0, 1) * near
        out[:, 1] = np.maximum(out[:, 1], hand)
        f2, f5 = H[idx[f'finger2-1.{s}']], H[idx[f'finger5-1.{s}']]
        fwd = mc_norm((f2 + f5) / 2 - wr)
        lat = mc_norm(f5 - f2)
        sg = 1.0 if s == 'L' else -1.0
        palm = mc_norm(sg * np.cross(lat, fwd))
        for k in (1, 2, 3, 4, 5):
            for j in ((2, 3) if k == 1 else (1, 2, 3)):
                bn = f'finger{k}-{j}.{s}'
                if bn not in idx:
                    continue
                c = H[idx[bn]]
                d = np.linalg.norm(P - c, axis=1)
                dors = np.clip(((nrm @ -palm) - 0.1) / 0.4, 0, 1) if k > 1 else 1.0
                out[:, 2] = np.maximum(out[:, 2], np.clip(1 - (d - 0.004) / 0.008, 0, 1) * dors * hand)
            tip = T[idx[f'finger{k}-3.{s}']]
            d = np.linalg.norm(P - tip, axis=1)
            out[:, 3] = np.maximum(out[:, 3], np.clip(1 - (d - 0.004) / 0.012, 0, 1) * hand)
    return out


def mc_norm(v):
    v = np.asarray(v, float)
    return v / max(1e-12, np.linalg.norm(v))


def albedo_gain(kit, body, V, col, aux, aux2, r_keep=0.008, r_ref=0.045):
    """Per-vertex RGB gain that takes the photo shoot's lighting out of the face texture: the
    MakeHuman photo albedo carries 1-5 cm blotches of baked light and make-up (pale under the
    eyes, a reddish lid crease, shading beside the nose). gain = (colour blurred over ~4.5 cm) /
    (colour blurred over ~8 mm), so detail finer than 8 mm (pores, freckles, lip edges) stays and
    the face reads as one even skin under the renderer's own light. Lips and the lash line are
    real colour: they are left out of both averages and keep gain 1."""
    P = body.P
    N = len(P)
    w = body.weld if body.weld is not None else np.arange(N)
    nW = int(w.max()) + 1
    cnt = np.bincount(w, minlength=nW).astype(float)
    lin = np.clip(col, 0, 1) ** 2.2
    C = np.stack([np.bincount(w, weights=lin[:, k], minlength=nW) for k in range(3)], 1) / np.maximum(cnt, 1)[:, None]
    Pw = np.stack([np.bincount(w, weights=P[:, k], minlength=nW) for k in range(3)], 1) / np.maximum(cnt, 1)[:, None]
    keep = 1.0 - np.clip(np.maximum(aux[:, 0] * 1.5, aux2[:, 1] * 1.5), 0, 1)
    K = np.bincount(w, weights=keep, minlength=nW) / np.maximum(cnt, 1)
    tw = w[body.tris]
    a = np.concatenate([tw[:, 0], tw[:, 1], tw[:, 2], tw[:, 1], tw[:, 2], tw[:, 0]])
    b = np.concatenate([tw[:, 1], tw[:, 2], tw[:, 0], tw[:, 0], tw[:, 1], tw[:, 2]])
    deg = np.maximum(np.bincount(a, minlength=nW), 1).astype(float)
    el = float(np.median(np.linalg.norm(Pw[tw[:, 0]] - Pw[tw[:, 1]], axis=1)))

    def blur(X, radius):
        it = int(np.clip(2.0 * (radius / max(el, 1e-4)) ** 2, 2, 2000))
        X = X.copy()
        for _ in range(it):
            avg = np.stack([np.bincount(a, weights=X[b, k], minlength=nW) for k in range(X.shape[1])], 1) / deg[:, None]
            X = X + 0.5 * (avg - X)
        return X
    # masked averages (lips and lash line count as missing data)
    W4 = np.concatenate([C * K[:, None], K[:, None]], 1)
    m = blur(W4, r_keep)
    r = blur(W4, r_ref)
    Cm = m[:, :3] / np.maximum(m[:, 3:], 1e-4)
    Cr = r[:, :3] / np.maximum(r[:, 3:], 1e-4)
    g = np.clip(Cr / np.maximum(Cm, 1e-4), 0.72, 1.3)
    # the face only (not the scalp, ears, neck): in front of the ears, brow line to the chin
    g_ = lambda name: V[kit.base.group_verts(name)].mean(0)
    eL, eR, mouth = g_('joint-l-eye'), g_('joint-r-eye'), g_('joint-mouth')
    ey, ez = (eL[1] + eR[1]) / 2, (eL[2] + eR[2]) / 2
    face = (np.clip((Pw[:, 2] - (ez - 0.05)) / 0.02, 0, 1) * np.clip(((ey + 0.045) - Pw[:, 1]) / 0.015, 0, 1)
            * np.clip((Pw[:, 1] - (mouth[1] - 0.07)) / 0.015, 0, 1))
    g = 1.0 + (g - 1.0) * (face * K)[:, None]
    return g[w]


def face_masks(kit, body, V):
    """Per-vertex (flush, lid margin, under-eye, ear) masks on the body (rest positions):
    flush = where blood shows (cheeks, nose tip, chin, ears); lid margin = the rim of the eye
    opening (lash line / wet waterline); under-eye = thin periorbital skin (cooler, darker)."""
    P = body.P
    out = np.zeros((len(P), 4))
    g = lambda name: V[kit.base.group_verts(name)].mean(0)
    eL, eR = g('joint-l-eye'), g('joint-r-eye')
    mouth = g('joint-mouth')
    ey = (eL[1] + eR[1]) / 2
    ez = (eL[2] + eR[2]) / 2
    face = (P[:, 2] > ez - 0.03) & (P[:, 1] > mouth[1] - 0.07) & (P[:, 1] < ey + 0.06) & (np.abs(P[:, 0]) < 0.085)
    gauss = lambda c, s: np.exp(-np.sum(((P - c) / s) ** 2, axis=1))
    # nose tip: the most forward face point between the eyes and the mouth on the midline
    mid = face & (np.abs(P[:, 0]) < 0.01) & (P[:, 1] < ey - 0.015) & (P[:, 1] > mouth[1] + 0.012)
    nose = P[mid][np.argmax(P[mid][:, 2])] if mid.any() else (eL + eR) / 2 + np.array([0, -0.04, 0.04])
    fl = np.zeros(len(P))
    for e in (eL, eR):
        sg = np.sign(e[0])
        cheek = np.array([e[0] + sg * 0.008, ey - 0.035, ez + 0.012])
        fl = np.maximum(fl, gauss(cheek, np.array([0.022, 0.018, 0.03])) * face)
    fl = np.maximum(fl, gauss(nose, np.array([0.012, 0.012, 0.012])) * 0.9)
    chin = np.array([0, mouth[1] - 0.045, mouth[2] - 0.005])
    fl = np.maximum(fl, gauss(chin, np.array([0.018, 0.014, 0.03])) * 0.5 * face)
    # ears: lateral, around eye height, behind the eyes
    ear = (np.abs(P[:, 0]) > 0.062) & (np.abs(P[:, 1] - (ey - 0.02)) < 0.04) & (P[:, 2] < ez - 0.05) & (P[:, 2] > ez - 0.12)
    out[:, 3] = ear
    fl = np.maximum(fl, ear * 0.7)
    out[:, 0] = np.clip(fl, 0, 1)
    # lid margin: skin within a few mm of the eyeball surface, in front of its centre
    lm = np.zeros(len(P))
    ue = np.zeros(len(P))
    for e in (eL, eR):
        d = np.linalg.norm(P - e, axis=1)
        r_eye = 0.0122
        front = np.clip((P[:, 2] - e[2] + 0.002) / 0.006, 0, 1)
        lm = np.maximum(lm, np.clip(1 - (d - r_eye - 0.0008) / 0.0028, 0, 1) * front)
        below = np.array([e[0] + np.sign(e[0]) * 0.002, e[1] - 0.016, e[2] + 0.004])
        ue = np.maximum(ue, gauss(below, np.array([0.016, 0.007, 0.02])))
        # upper lid and the crease (the photo albedo has a reddish make-up tone there)
        upper = np.array([e[0], e[1] + 0.011, e[2] + 0.005])
        ue = np.maximum(ue, gauss(upper, np.array([0.021, 0.011, 0.022])) * 0.95)
    out[:, 1] = lm
    out[:, 2] = ue * face
    return out
