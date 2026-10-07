"""Build the Dragon's Kingdom human cast into scenes/lib/humans/cache/ (git-ignored).

Run with Blender's Python module (bpy 4.2 + numpy), isolated mode:
    <bpy python> -I scenes/lib/humans/offline/build.py [--only id,id] [--list] [--lib DIR] [--out DIR] [--jobs N]

Per character: MakeHuman macro + detail targets -> joints -> pose (recipes.py) -> skin, eyes,
brows, lashes, teeth, tongue -> garments (Blender cloth, layer by layer, while the body moves from
the dress pose to the character's pose) -> hair strands -> props -> baked per-vertex AO and
thickness -> <id>.json + <id>.bin. Everything is deterministic (seeded).
"""
import argparse
import json
import math
import zlib
import os
import sys
import time
import traceback

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import numpy as np  # noqa: E402

import mhcore as mc  # noqa: E402
import meshutil as mu  # noqa: E402
from humanbuild import Kit, Part, shape, body_part, proxy_part, welded_normals, bake_ao_thickness, to_mesh_dict, eye_attrs, skin_aux  # noqa: E402
from posing import PoseBuilder  # noqa: E402
import recipes  # noqa: E402
import garments as gm  # noqa: E402
from export import write_character  # noqa: E402

ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..'))   # dragons-kingdom/
DEFAULT_LIB = os.path.join(ROOT, 'assets-lib')
DEFAULT_OUT = os.path.join(HERE, '..', 'cache')
BUILD_VERSION = 1


def log(*a):
    print(*a, flush=True)


def blink_morphs(kit, race):
    out = {}
    for name, unit in (('blinkL', 'eye-left-closure'), ('blinkR', 'eye-right-closure')):
        idx, d = mc.expression_target(kit.tl, unit, race)
        m = np.zeros((kit.N, 3))
        if len(idx):
            m[idx] = d
        out[name] = m
    return out


def make_pose(sk, recipe, params):
    pb = PoseBuilder(sk)
    if recipe in recipes.RECIPES and recipe not in recipes.ACTIONS:
        recipes.RECIPES[recipe](pb, params or {})
        pb.placements = []
    else:
        pb.placements = recipes.ACTIONS[recipe](pb, params or {}) or []
    return pb


def ground_offset(sk, pose, V, kit, sole):
    """Root offset so that the lowest sole point is at y = sole and the pelvis is over x = z = 0."""
    M = sk.skin_mats(pose)
    feet = np.where(np.isin(kit.base_cat, ['footL', 'footR', 'shinL', 'shinR']))[0]
    I, W = kit.I_all[feet], kit.W_all[feet]
    Pf = mc.lbs(V[feet], I, W, M)
    Q, P = sk.world(pose)
    r = P[sk.names.index('root')]
    return np.array([-r[0], sole - Pf[:, 1].min(), -r[2]])


def assemble(kit, spec, out_dir, opts):
    t0 = time.time()
    cid = spec['id']
    log(f'== {cid}')
    hero = (opts.get('lod') or spec.get('lod', 'mid')) == 'hero'
    race = tuple(spec.get('macro', {}).get('race', (1 / 3, 1 / 3, 1 / 3)))
    V = shape(kit, spec)
    H, T = kit.rig.joints(V)
    sk = mc.Skeleton(kit.rig, H, T)
    sole = spec.get('sole', 0.012)
    # poses
    pd = make_pose(sk, 'dress', {})
    pt = make_pose(sk, spec.get('pose', 'stand'), spec.get('pose_params', {})) if not opts.get('dresspose') else make_pose(sk, 'dress', {})
    off_d = ground_offset(sk, pd.local, V, kit, sole)
    off_t = ground_offset(sk, pt.local, V, kit, sole) if not spec.get('pose', 'stand').startswith('ride') else ride_offset(sk, pt.local)
    # ---- garments (Blender cloth) -------------------------------------------------
    D = gm.Dresser(kit, V, sk, pd.local, pt.local, off_d, off_t, log=log)
    D.sole = sole
    D.subdiv = spec.get('cloth_subdiv', 1 if hero else 0)
    D.nosim = opts.get('nosim', False)
    if spec.get('pose', 'stand').startswith('ride'):
        # seat 0.1 m below the pelvis (root bone head = origin for riders), back along +-z
        D.saddle = {'centre': np.array([0.0, -0.1 - 0.17, 0.0]), 'rx': 0.15, 'ry': 0.17, 'length': 1.2}
    garments = []
    for g in spec.get('outfit', []):
        b = gm.BUILDERS[g['type']]
        garments.append(b(D, g))
        if g['type'] == 'hood' and g.get('cape', True):
            garments.append(gm.hood_cape(D, g))
    garments.sort(key=lambda x: x.layer)
    if garments:
        gm.simulate(D, garments, quality=opts.get('quality', 5), log=log)
    D.garments = garments
    # ---- body + face parts in the target pose --------------------------------------
    morph = blink_morphs(kit, race)
    body = body_part(kit, V, subdiv=1 if hero else 0, morph_rest=morph)
    sm = spec.get('skin', {})
    body.material = dict(sm)
    body.material['map'] = 'human/mh_skins/textures/' + sm.get('texture', 'young_lightskinned_female_diffuse') + '.png'
    # hide skin under garments: body faces whose source base vertices are all hidden
    hid_base = np.zeros(kit.N, bool)
    hid_base[D.bidx[D.hidden]] = True
    if hero:
        # subdivided vertex -> covered if its nearest original vertex is (via src ids < N)
        src = body.src
        hv = np.zeros(len(src), bool)
        orig = src < kit.N
        hv[orig] = hid_base[src[orig]]
        # new (edge/face) points: hidden if all triangle neighbours of an original are hidden -> use tri test below
        keep_tri = ~(hv[body.tris[:, 0]] & hv[body.tris[:, 1]] & hv[body.tris[:, 2]])
        # edge/face points have no source flag: decide per triangle by its original corners
        corner_orig = orig[body.tris]
        corner_hid = hv[body.tris]
        keep_tri = ~np.all(np.where(corner_orig, corner_hid, True), axis=1) | ~np.any(corner_orig, axis=1)
    else:
        hv = hid_base[body.src]
        keep_tri = ~(hv[body.tris[:, 0]] & hv[body.tris[:, 1]] & hv[body.tris[:, 2]])
    body.tris = body.tris[keep_tri]
    parts = [body]
    eyes_tex = 'human/mh_eyes/materials/' + spec.get('eyes', {}).get('iris', 'brown') + '_eye.png'
    eye_rel = 'human/mh_eyes/high-poly/high-poly.mhclo'
    ex = kit.proxy(eye_rel).obj.vt
    eyes = proxy_part(kit, eye_rel, V, 'eyes', 'eye', {'map': eyes_tex, 'irisTint': spec.get('eyes', {}).get('tint', [1, 1, 1])},
                      keep=lambda f, P: not (ex[list(f[1])][:, 0].min() > 0.85))
    parts.append(eyes)
    if spec.get('brows'):
        b = spec['brows']
        parts.append(proxy_part(kit, f'human/mh_face_parts/eyebrows/{b}/{b}.mhclo', V, 'brows', 'brow',
                                {'map': f'human/mh_face_parts/eyebrows/{b}/{b}.png', 'color': spec.get('hair', {}).get('brow_color', spec.get('hair', {}).get('color', [0.05, 0.035, 0.025])), 'alphaGain': 1.4, 'occluder': False}))
    if spec.get('lashes', 'eyelashes01'):
        l = spec.get('lashes', 'eyelashes01')
        parts.append(proxy_part(kit, f'human/mh_face_parts/eyelashes/{l}/{l}.mhclo', V, 'lashes', 'lash',
                                {'map': f'human/mh_face_parts/eyelashes/{l}/{l}.png', 'color': [0.025, 0.018, 0.014], 'alphaGain': 1.6, 'occluder': False},
                                morph_rest=morph))
    parts.append(proxy_part(kit, 'human/mh_face_parts/teeth/teeth_base/teeth_base.mhclo', V, 'teeth', 'teeth',
                            {'map': 'human/mh_face_parts/teeth/materials/teeth.png', 'rough': 0.3, 'clearcoat': 0.5, 'castShadow': False}))
    parts.append(proxy_part(kit, 'human/mh_face_parts/tongue/tongue01/tongue01.mhclo', V, 'tongue', 'tongue',
                            {'map': 'human/mh_face_parts/tongue/tongue01/tongue01_diffuse.png', 'rough': 0.35, 'castShadow': False}))
    skin_aux(kit, body, V, sk, os.path.join(kit.lib, body.material['map']))
    from humanbuild import pose_parts
    pose_parts(sk, pt.local, parts, off_t)
    # ---- garments as parts (already in the drape pose)
    for g in garments:
        P = g.result
        F = g.faces
        nrm = mu.vnormals(P, F)
        thick = g.spec.get('thickness', 0.0025)
        uv = g.uv
        I, W = g.I, g.W
        hem = np.zeros(len(P))
        for l in mu.boundary_loops(F):
            hem[l] = 1
        nb = mu.neighbours(len(P), F)
        for _ in range(2):
            hem = np.maximum(hem, np.array([hem[n].max() * 0.6 if len(n) else 0 for n in nb]))
        if thick > 0:
            P2, F2, nn = mu.hem_rim(P, F, thick, g.spec.get('turn', 0.012), nrm)
            src = np.concatenate([np.arange(len(P)), np.zeros(nn, int)])
            # rim vertices copy the attributes of their boundary vertex
            k = 0
            for l in mu.boundary_loops(F):
                for v in l:
                    src[len(P) + k] = v; src[len(P) + k + 1] = v
                    k += 2
            uv = uv[src]; I, W = I[src], W[src]; hem = hem[src]
            P, F = P2, F2
        tris = mu.tris_of(F)
        part = Part(g.name, 'cloth', P, tris, uv=uv, I=I, W=W)
        part.posed = P
        part.normals = mu.vnormals(P, F)
        mat = {k: v for k, v in g.spec.items() if k in ('fabric', 'color', 'wear', 'dust', 'fade', 'pattern', 'patternColor', 'weave', 'tile', 'sheen', 'rough', 'albedoMix')}
        part.material = mat
        dust = np.clip((0.3 - P[:, 1]) / 0.3, 0, 1) ** 1.5
        part.attrs['aux'] = np.stack([dust, hem, np.zeros(len(P)), np.zeros(len(P))], 1)
        parts.append(part)
    # ---- belts, buckles, pouches (on top of the simulated layers)
    accessories(D, garments, spec, parts)
    # ---- hand props and worn accessories
    add_props(kit, V, sk, pt, off_t, spec, D, parts)
    # ---- hair (strands)
    hs = (spec.get('hair') or {}) if not opts.get('nohair') else {}
    if hs:
        import hair as hr
        gr = hr.Groom(kit, V, sk, pt.local, off_t, D.faces, D.rest, D.target, D.bidx, D.Wd, seed=zlib.crc32(cid.encode()) & 0xffff, log=log)
        build_hair(gr, hs, hero, kit, V, body)
        hp = gr.to_part('hair', {'color': hs.get('color', [0.05, 0.03, 0.02]), 'spec': hs.get('spec', 0.14), 'shift': 0.1, 'variation': hs.get('variation', 0.35), 'occluder': True, 'ao_rays': 10, 'ao_stride': 2})
        if hp is not None:
            parts.append(hp)
            log(f'    hair: {len(gr.strands)} strands, {len(hp.posed)} verts')
        if hs.get('strand_brows', True) and spec.get('brows'):
            gb = hr.Groom(kit, V, sk, pt.local, off_t, D.faces, D.rest, D.target, D.bidx, D.Wd, seed=(zlib.crc32(cid.encode()) + 7) & 0xffff)
            from humanbuild import image_array
            b = spec['brows']
            card = next(p for p in parts if p.name == 'brows')
            img = image_array(os.path.join(kit.lib, f'human/mh_face_parts/eyebrows/{b}/{b}.png'))
            gb.brows_from_card(card.P, card.tris, card.uv, img, n=hs.get('brow_count', 340))
            bp = gb.to_part('browhair', {'color': hs.get('brow_color', [c * 1.25 for c in hs.get('color', [0.05, 0.03, 0.02])]), 'spec': 0.04, 'shift': 0.1, 'variation': 0.2, 'occluder': False, 'ao_rays': 8, 'ao_stride': 2})
            parts.append(bp)
            card.material['alphaGain'] = 0.35         # keep a faint card under the hairs (skin density)
    # ---- AO / thickness / eyes
    rays = opts.get('rays', 24 if hero else 12)
    bake_ao_thickness(parts, rays=rays)
    eye_attrs(eyes, sk, pt.local, off_t)
    # ---- export
    Q, Pw = sk.world(pt.local)
    bones = [{'name': n, 'parent': int(sk.parent[i]), 'q': [float(x) for x in Q[i]], 'p': [float(x) for x in Pw[i] + off_t],
              'rest': [float(x) for x in H[i]]} for i, n in enumerate(sk.names)]
    header = {'id': cid, 'version': BUILD_VERSION, 'name': spec.get('name', cid), 'bones': bones,
              'meta': {'pose': spec.get('pose', 'stand'), 'lod': spec.get('lod', 'mid'), 'height': float(max(p.posed[:, 1].max() for p in parts)),
                       'sole': sole, 'provisional': True, 'notes': spec.get('notes', '')}}
    size = write_character(os.path.join(out_dir, cid + opts.get('suffix', '')), header, [to_mesh_dict(p) for p in parts])
    log(f'   {cid}: {sum(len(p.posed) for p in parts)} verts, {size / 1e6:.1f} MB, {time.time() - t0:.0f} s')


def accessories(D, garments, spec, parts):
    import props as pr
    belt_g = [g for g in garments if g.spec.get('belt')]
    if not belt_g:
        return
    g = belt_g[-1]
    allP = np.vstack([x.result[getattr(x, 'region', np.zeros(len(x.result), int)) == 0] for x in garments if x.layer >= 1])
    y = g.result[g.belt_idx][:, 1].mean() if g.belt_idx is not None and len(g.belt_idx) else D.Jt['spine04'][1]
    near = allP[np.abs(allP[:, 1] - y) < 0.03]
    c = np.array([(near[:, 0].min() + near[:, 0].max()) / 2, 0, (near[:, 2].min() + near[:, 2].max()) / 2])
    bc = g.spec.get('belt_color', [0.085, 0.05, 0.028])
    P, F, angs, R = pr.belt_ring(allP, y, c, width=g.spec.get('belt_width', 0.032), clearance=0.0015)
    pieces = [(P, F)]
    # buckle: a small iron frame at the front, a little to the wearer's left
    a0 = 0.32
    rr = np.interp(a0, angs, R) + 0.009
    bpos = np.array([c[0] + math.sin(a0) * rr, y, c[2] + math.cos(a0) * rr])
    t = np.array([math.cos(a0), 0, -math.sin(a0)])
    nrm = np.array([math.sin(a0), 0, math.cos(a0)])
    Rm = np.stack([t, [0, 1.0, 0], nrm], 1)
    frame = []
    for (cx, cy, sx, sy) in ((0, 0.021, 0.042, 0.005), (0, -0.021, 0.042, 0.005), (-0.019, 0, 0.005, 0.046), (0.019, 0, 0.005, 0.046)):
        frame.append(pr.box(bpos + Rm @ np.array([cx, cy, 0]), (sx, sy, 0.004), Rm))
    buckle = pr.merge(frame)
    # strap end hanging from the buckle
    tail = []
    for k in range(10):
        s_ = k / 9
        tail.append(bpos + t * (0.03 + 0.015 * s_) + np.array([0, -0.075 * s_ ** 1.2, 0]) + nrm * (0.003 + 0.003 * s_))
    sv = np.cross(nrm, [0, 1.0, 0]) * 0.015
    tP = np.array([v for q in tail for v in (q + sv, q - sv)])
    tF = [(2 * k, 2 * k + 1, 2 * k + 3, 2 * k + 2) for k in range(len(tail) - 1)]
    for name, (Pp, Fp), mat in (('belt', pr.merge(pieces + [(tP, tF)]), {'kind': 'leather', 'color': bc, 'rough': 0.6, 'tile': 0.25, 'doubleSide': True}),
                                ('buckle', buckle, {'kind': 'iron', 'color': [0.5, 0.48, 0.45], 'rough': 0.45})):
        part = Part(name, 'prop', Pp, mu.tris_of(Fp), uv=_uv_box(Pp))
        part.posed = Pp
        part.normals = mu.vnormals(Pp, Fp)
        part.I, part.W = D.transfer(Pp, space='target')
        part.material = mat
        parts.append(part)


def _rigid_part(name, P, F, uv, material, bone_idx):
    part = Part(name, 'prop', P, mu.tris_of(F), uv=uv)
    part.posed = P
    part.normals = mu.vnormals(P, F)
    part.I = np.zeros((len(P), 4), np.int64)
    part.I[:, 0] = bone_idx
    part.W = np.zeros((len(P), 4))
    part.W[:, 0] = 1.0
    part.material = dict(material)
    return part


def add_props(kit, V, sk, pt, off, spec, D, parts):
    import props as pr
    idx = {n: i for i, n in enumerate(sk.names)}
    places = list(getattr(pt, 'placements', []))
    Q, Pj = sk.world(pt.local)
    # worn accessories (spec['accessories'])
    eL, eR = sk.H[idx['eye.L']], sk.H[idx['eye.R']]
    eye_y = (eL[1] + eR[1]) / 2
    skull_c = np.array([0.0, eye_y + 0.012, (eL[2] + eR[2]) / 2 - 0.078])
    hi = idx['head']
    hR = mc.quat_to_mat(Q[hi])
    ht = Pj[hi] - hR @ sk.H[hi]
    for acc in spec.get('accessories', []):
        kind = acc['prop']
        if kind in ('kettle_hat', 'circlet'):
            y = eye_y + acc.get('dy', 0.05 if kind == 'circlet' else 0.035)
            tilt = pr.rot_x(acc.get('tilt', -0.08))
            c = skull_c * np.array([0, 1, 1]) + np.array([0, y - skull_c[1], 0.006])
            M = np.eye(4)
            M[:3, :3] = hR @ tilt
            M[:3, 3] = hR @ c + ht
            places.append({'prop': kind, 'M': M, 'bone': 'head', 'kw': acc.get('kw', {})})
        elif kind == 'sword':
            lat = np.array([1.0, 0, 0])
            hipL = Pj[idx['upperleg01.L']]
            ro = mc.quat_to_mat(Q[idx['root']])
            hilt = hipL + ro @ np.array([0.11, 0.17, 0.02])
            ydir = ro @ mu.norm(np.array([0.12, 1.0, 0.45]))
            R = pr.frame_from(ydir, ro @ np.array([0, 0, 1.0]))
            M = np.eye(4); M[:3, :3] = R; M[:3, 3] = hilt
            places.append({'prop': 'sword', 'M': M, 'bone': 'pelvis.L', 'kw': {}})
    for pl in places:
        if pl['prop'] == 'sling':
            parts.extend(build_sling(sk, pt, off, D))
            continue
        fn = pr.PROPS[pl['prop']]
        pieces = fn(**pl.get('kw', {}))
        M = pl['M']
        bi = idx.get(pl['bone'], idx['root'])
        for k, pc in enumerate(pieces):
            P = pr.xform(pc['P'], M) + off
            parts.append(_rigid_part(f"{pl['prop']}_{pc['name']}_{k}", P, pc['F'], pc['uv'], pc['material'], bi))


def build_sling(sk, pt, off, D):
    """Linen arm sling for the LEFT forearm: a deep cradle from the elbow to the knuckles and two
    broad bands laid over the clothed chest to the shoulders and round the back of the neck.
    Static geometry snapped onto the clothed body; skinned like the nearest body vertex."""
    import props as pr
    idx = {n: i for i, n in enumerate(sk.names)}
    Q, Pj = sk.world(pt.local)
    el = Pj[idx['lowerarm01.L']] + off
    wr = Pj[idx['wrist.L']] + off
    kn = (Pj[idx['finger2-1.L']] + Pj[idx['finger5-1.L']]) / 2 + off
    ax = mu.norm(kn - el)
    up = np.array([0, 1.0, 0])
    side = mu.norm(np.cross(ax, up))
    if side[2] < 0:
        side = -side                            # side = away from the body (forward)
    tree = garment_surface(D)
    axis = D.axis_y()
    n_u, n_v = 26, 14
    L = np.linalg.norm(kn - el)
    P = []
    for i in range(n_u):
        t = -0.14 + 1.2 * i / (n_u - 1)
        c = el + ax * L * t
        r = 0.068 + 0.008 * math.sin(t * 7)
        for j in range(n_v):
            a = math.pi * (-0.15 + 1.25 * j / (n_v - 1))     # from the body side, under, up the front
            P.append(c + (-up * math.sin(a) - side * math.cos(a)) * r - up * 0.008)
    P = np.array(P)
    F = mu.grid_faces(n_v, n_u)
    cradle_top_front = P[[i * n_v + (n_v - 1) for i in range(n_u)]]
    # bands: from the front edge of the cradle (hand end, elbow end) over the chest to the shoulders
    nk = Pj[idx['neck01']] + off + np.array([0, 0.03, -0.07])
    shR = Pj[idx['shoulder01.R']] + off + np.array([0, 0.07, 0.0])
    shL = Pj[idx['shoulder01.L']] + off + np.array([0, 0.07, 0.0])
    bands = []
    for a_end, mid in ((cradle_top_front[-3], shR), (cradle_top_front[2], shL)):
        path = []
        for k in range(22):
            s = k / 21
            q = (1 - s) ** 2 * a_end + 2 * (1 - s) * s * (mid + np.array([0, 0, 0.06])) + s * s * nk
            path.append(q)
        path = np.array(path)
        # snap onto the clothed body (+6 mm)
        from mathutils import Vector
        for k in range(1, len(path)):
            loc, n, _, _ = tree.find_nearest(Vector(path[k]))
            loc, n = np.array(loc), np.array(n)
            rad = (loc - axis) * np.array([1, 0, 1])
            if np.dot(n, rad) < 0 and loc[1] < nk[1] - 0.02:
                n = -n
            path[k] = loc + n * 0.006 if np.dot(path[k] - loc, n) < 0.03 else path[k]
        t = mu.norm(np.gradient(path, axis=0))
        nrm = []
        for q in path:
            loc, n, _, _ = tree.find_nearest(Vector(q))
            nrm.append(mu.norm(q - np.array(loc)) if np.linalg.norm(q - np.array(loc)) > 1e-5 else np.array(n))
        nrm = np.array(nrm)
        w = np.linspace(0.05, 0.028, len(path))
        sv = mu.norm(np.cross(t, nrm))
        Ps = np.vstack([path - sv * w[:, None], path + sv * w[:, None]])
        nn = len(path)
        Fs = [(k, k + 1, nn + k + 1, nn + k) for k in range(nn - 1)]
        bands.append((Ps, Fs))
    P = push_outside(P, tree, 0.006, axis=axis)
    P2, F2 = pr.merge([(P, F)] + bands)
    uv = np.stack([P2[:, 0] + P2[:, 2], P2[:, 1]], 1)
    part = Part('sling', 'cloth', P2, mu.tris_of(F2), uv=uv)
    part.posed = P2
    part.normals = mu.vnormals(P2, F2)
    part.I, part.W = D.transfer(P2, space='target')
    part.material = {'fabric': 'linen', 'color': [0.6, 0.57, 0.5], 'wear': 0.3}
    part.attrs['aux'] = np.zeros((len(P2), 4))
    return [part]


def garment_surface(D):
    """BVH over every simulated/static garment in the drape pose (cached on the Dresser)."""
    if getattr(D, '_gtree', None) is None:
        import bpy  # noqa: F401
        from mathutils.bvhtree import BVHTree
        Ps, Ts, off = [], [], 0
        for g in getattr(D, 'garments', []):
            if g.result is None:
                continue
            Ps.append(g.result)
            Ts.append(mu.tris_of(g.faces) + off)
            off += len(g.result)
        Ps.append(D.target)
        Ts.append(mu.tris_of(D.faces) + off)
        P = np.vstack(Ps)
        T = np.vstack(Ts)
        D._gtree = BVHTree.FromPolygons(P.tolist(), T.tolist(), all_triangles=True)
    return D._gtree


def push_outside(P, tree, offset, axis=None):
    """Move points that are inside or too close to the clothed body out along the surface normal
    (normals are made to point away from the vertical body axis)."""
    from mathutils import Vector
    out = P.copy()
    for i, p in enumerate(P):
        loc, n, idx, d = tree.find_nearest(Vector(p))
        if loc is None:
            continue
        loc, n = np.array(loc), np.array(n)
        if axis is not None:
            rad = (loc - axis) * np.array([1, 0, 1])
            if np.dot(n, rad) < 0:
                n = -n
        s = np.dot(p - loc, n)
        if s < offset:
            out[i] = p + n * (offset - s)
    return out


def _uv_box(P):
    return np.stack([P[:, 0] + P[:, 2], P[:, 1]], 1)


def build_hair(gr, hs, hero, kit, V, body):
    st = hs.get('style', 'crop')
    dens = hs.get('density', 1.0) * (1.0 if hero else 0.45)
    sk = gr.skull
    if st in ('braid', 'pulled', 'bun'):
        g = sk + np.array(hs.get('gather', [0.0, -0.035, -0.09]))
        s_, n_ = gr.surf(g)
        g = s_ + n_ * 0.008
        gr.style_pulled_back(int(hs.get('count', 15000) * dens), g, color_layers=hs.get('loft', 0.008), width=hs.get('width', 0.0009 if hero else 0.0015))
    elif st == 'crop':
        gr.style_crop(int(hs.get('count', 16000) * dens), length=tuple(hs.get('length', (0.012, 0.045))), flow=hs.get('flow', 'back'), width=hs.get('width', 0.0008 if hero else 0.0013), curl=hs.get('curl', 0.0))
    if st in ('braid', 'pulled', 'bun') and hero:
        G_ = g

        def tw(r, G_=G_):
            w = np.clip((r[2] - sk[2] + 0.02) / 0.08, 0, 1)
            W1 = np.array([r[0] * 0.75, sk[1] + 0.1, sk[2] - 0.05])
            return mu.norm((G_ + (W1 - G_) * w) - r)
        gr.baby_hairs(int(hs.get('baby', 2500)), towards=tw)
    elif st == 'crop' and hero:
        gr.baby_hairs(int(hs.get('baby', 1500)), towards=lambda r: np.array([0, 0.6, -1.0]))
    n_scalp = len(gr.strands)
    if st in ('braid', 'pulled', 'bun'):
        if st == 'braid':
            gr.braid(g + np.array([0, -0.005, -0.012]), length=hs.get('length', 0.42), strands_per=int(90 * max(0.5, dens)), hang=hs.get('hang', 'back'))
        if st == 'bun':
            gr.bun(g + np.array([0, 0.0, -0.02]), radius=hs.get('bun_radius', 0.035), strands=int(700 * max(0.5, dens)))
    if hs.get('beard'):
        bd = hs['beard']
        m = gr.beard_mask(body.P, moustache=bd.get('moustache', True), coverage=bd.get('coverage', 'full'))
        body.attrs['aux'][:, 2] = np.maximum(body.attrs['aux'][:, 2], m * bd.get('shadow', 1.0))
        body.material['beardColor'] = list(bd.get('color', hs.get('color', [0.05, 0.03, 0.02])))
        if bd.get('count', 0) > 0:
            gr.style_beard(int(bd.get('count', 6000) * (1.0 if hero else 0.5)), length=tuple(bd.get('length', (0.006, 0.02))), moustache=bd.get('moustache', True), coverage=bd.get('coverage', 'full'), curl=bd.get('curl', 0.4), width=bd.get('width', 0.0007))
    # the scalp under the hair takes the hair colour (aux.a): exactly where strands cover it, so no
    # bare skin shows between strands; it fades out at the hairline over a few millimetres
    if st != 'none' and n_scalp:
        scalp_coverage(gr, body, n_scalp)
        body.material['scalpColor'] = list(hs.get('root_color', [c * 0.8 for c in hs.get('color', [0.05, 0.03, 0.02])]))


def scalp_coverage(gr, body, n_scalp):
    from mathutils.kdtree import KDTree
    from mathutils import Vector
    pts = np.vstack([s['p'][:max(2, len(s['p']) * 2 // 3)] for s in gr.strands[:n_scalp]])
    if len(pts) > 400000:
        pts = pts[::len(pts) // 400000 + 1]
    kd = KDTree(len(pts))
    for i, q in enumerate(pts):
        kd.insert(q, i)
    kd.balance()
    P = body.P
    head = np.linalg.norm(P - gr.skull, axis=1) < 0.17
    ids = np.where(head)[0]
    Pd = gr.to_drape(P[ids])
    cov = np.zeros(len(P))
    for k, (i, q) in enumerate(zip(ids, Pd)):
        co, j, d = kd.find(Vector(q))
        cov[i] = np.clip(1 - (d - 0.004) / 0.005, 0, 1)
    # never past the hairline: the edge is drawn by the fine edge strands themselves
    hl = gr.hairline(P[ids])
    cov[ids] *= np.clip((P[ids, 1] - hl + 0.001) / 0.007, 0, 1) ** 1.5
    body.attrs['aux'][:, 3] = np.maximum(body.attrs['aux'][:, 3], cov)


def ride_offset(sk, pose):
    """Riders: pelvis (root bone head) at the origin."""
    Q, P = sk.world(pose)
    r = P[sk.names.index('root')]
    return -r


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--only', default='')
    ap.add_argument('--lib', default=DEFAULT_LIB)
    ap.add_argument('--out', default=DEFAULT_OUT)
    ap.add_argument('--list', action='store_true')
    ap.add_argument('--quality', type=int, default=5)
    ap.add_argument('--rays', type=int, default=0)
    ap.add_argument('--nosim', action='store_true')
    ap.add_argument('--dresspose', action='store_true')
    ap.add_argument('--nohair', action='store_true')
    ap.add_argument('--suffix', default='')
    ap.add_argument('--lod', default='', help='override every character\'s lod (hero|mid) for quick tests')
    a = ap.parse_args()
    import characters
    cast = characters.cast()
    if a.list:
        for c in cast:
            print(c['id'], '-', c.get('name', ''))
        return
    sel = [c for c in cast if not a.only or c['id'] in a.only.split(',') or any(c['id'].startswith(p.rstrip('*')) for p in a.only.split(',') if p.endswith('*'))]
    kit = Kit(a.lib)
    kit.I_all, kit.W_all = mc.topk(kit.Wd, 4)
    names = kit.rig.names
    kit.base_cat = np.array([gm.bone_category(names[b]) for b in np.argmax(kit.Wd, axis=1)])
    os.makedirs(a.out, exist_ok=True)
    opts = {'quality': a.quality, 'nosim': a.nosim, 'nohair': a.nohair, 'suffix': a.suffix, 'dresspose': a.dresspose, 'lod': a.lod}
    if a.rays:
        opts['rays'] = a.rays
    fails = []
    for c in sel:
        try:
            assemble(kit, c, a.out, opts)
        except Exception:
            traceback.print_exc()
            fails.append(c['id'])
    if fails:
        log('FAILED: ' + ', '.join(fails))
        sys.exit(1)


if __name__ == '__main__':
    main()
