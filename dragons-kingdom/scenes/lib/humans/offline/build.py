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


def _run_pose(sk, recipe, params, pre=None):
    pb = PoseBuilder(sk)
    for name, axis, ang in (pre or ()):
        pb.rotate(name, axis, ang)
    if recipe in recipes.RECIPES and recipe not in recipes.ACTIONS:
        recipes.RECIPES[recipe](pb, params or {})
        pb.placements = []
    else:
        pb.placements = recipes.ACTIONS[recipe](pb, params or {}) or []
    return pb


def shoulder_settle(pb, down=0.16, up=0.16):
    """Clavicle rotations that go with the arm (scapulohumeral rhythm): a hanging arm lets the
    shoulder girdle drop (the rig's rest shoulders are level with the arms out - lowering only the
    upper arm left a flat trapezius and a square deltoid corner: 'padded' coat shoulders), a raised
    arm lifts it. Returns [(bone, world axis, angle)] for the clavicles."""
    out = []
    fwd = pb.fwd_axis()
    for s, sg in (('L', 1.0), ('R', -1.0)):
        d = pb.direction(f'upperarm01.{s}', f'lowerarm01.{s}')
        e = math.asin(max(-1.0, min(1.0, float(d[1]))))      # arm elevation (rad), -pi/2 = hanging
        amt = down * float(np.clip((-e - 0.3) / 0.9, 0, 1)) - up * float(np.clip((e - 0.15) / 1.0, 0, 1))
        if abs(amt) > 1e-4:
            # +amt drops the outer end of the clavicle (about the forward axis)
            out.append((f'clavicle.{s}', fwd, -sg * amt))
    return out


def make_pose(sk, recipe, params):
    """Pose from a recipe, run twice: the first run tells where the arms end up, the second starts
    from the shoulder girdle that goes with them (so IK targets and grips stay exact)."""
    pb = _run_pose(sk, recipe, params)
    pre = shoulder_settle(pb)
    return _run_pose(sk, recipe, params, pre) if pre else pb


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
    seated = spec.get('pose', 'stand').startswith('ride')
    pd = make_pose(sk, 'dress_ride' if seated else 'dress', spec.get('pose_params', {}) if seated else {})
    pt = make_pose(sk, spec.get('pose', 'stand'), spec.get('pose_params', {})) if not opts.get('dresspose') else make_pose(sk, 'dress', {})
    off_d = ride_offset(sk, pd.local) if seated else ground_offset(sk, pd.local, V, kit, sole)
    off_t = ground_offset(sk, pt.local, V, kit, sole) if not spec.get('pose', 'stand').startswith('ride') else ride_offset(sk, pt.local)
    # ---- garments (Blender cloth) -------------------------------------------------
    D = gm.Dresser(kit, V, sk, pd.local, pt.local, off_d, off_t, log=log)
    D.sole = sole
    D.seated = seated
    if seated:
        # hems are given as heights above the ground when standing: shift them into the seated frame
        ps_ = make_pose(sk, 'dress', {})
        off_s = ground_offset(sk, ps_.local, V, kit, sole)
        i4 = sk.names.index('spine04')
        D.hem_shift = (sk.world(pd.local)[1][i4] + off_d)[1] - (sk.world(ps_.local)[1][i4] + off_s)[1]
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
        if g['type'] == 'kerchief' and g.get('tail', True):
            # the loose back of a kerchief tied at the nape: a short linen panel from the crown
            garments.append(gm.veil_panel(D, dict(g, type='veil', length=g.get('tail_length', 0.24), name='kerchieftail',
                                                   layer=g.get('layer', 3) + 0.5, sim_fabric='linen', ease=0.016)))
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
    body.tris_all = body.tris.copy()
    body.tris = body.tris[keep_tri]
    parts = [body]
    eyes_tex = 'human/mh_eyes/materials/' + spec.get('eyes', {}).get('iris', 'brown') + '_eye.png'
    eye_rel = 'human/mh_eyes/high-poly/high-poly.mhclo'
    ex = kit.proxy(eye_rel).obj.vt
    eyes = proxy_part(kit, eye_rel, V, 'eyes', 'eye', {'map': eyes_tex, 'irisTint': spec.get('eyes', {}).get('tint', [1, 1, 1])},
                      # drop the outer (cornea) shells: they sit in the atlas corner u > 0.85,
                      # v < 0.15. (u > 0.85 alone also cut a wedge out of the RIGHT eyeball,
                      # whose UVs run to 0.98: a hole in the inner eye corner when it rolls.)
                      keep=lambda f, P: not (ex[list(f[1])][:, 0].min() > 0.85 and ex[list(f[1])][:, 1].max() < 0.15))
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
    card_qa(body, parts, sk)
    parts.append(caruncles(kit, body, sk))
    from humanbuild import pose_parts
    pose_parts(sk, pt.local, parts, off_t)
    # ---- garments as parts (already in the drape pose)
    for g in garments:
        P = g.result
        F = g.faces
        if g.sim and not opts.get('nosim'):
            P = relax_poles(P, F)
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
            turn = g.spec.get('turn', 0.012)
            P2, F2, nn = mu.hem_rim(P, F, thick, turn, nrm)
            src = np.concatenate([np.arange(len(P)), np.zeros(nn, int)])
            # rim vertices copy the attributes of their boundary vertex; their UVs continue past
            # the edge (metres of fabric: the fold and the turn-up). A copied UV stretched the
            # weave across the rim into a striated band (veil and coat edges).
            uv_off = np.zeros((len(P) + nn, 2))
            bset_ = {v for l in mu.boundary_loops(F) for v in l}
            k = 0
            for l in mu.boundary_loops(F):
                for v in l:
                    inn = [u for u in nb[v] if u not in bset_]
                    du = (uv[inn].mean(0) - uv[v]) if inn else np.zeros(2)
                    dn = np.linalg.norm(du)
                    du = du / dn if dn > 1e-9 else np.zeros(2)
                    src[len(P) + k] = v; src[len(P) + k + 1] = v
                    uv_off[len(P) + k] = -du * thick
                    uv_off[len(P) + k + 1] = -du * (thick + turn)
                    k += 2
            uv = uv[src] + uv_off; I, W = I[src], W[src]; hem = hem[src]
            P, F = P2, F2
        tris = mu.tris_of(F)
        part = Part(g.name, 'cloth', P, tris, uv=uv, I=I, W=W)
        part.posed = P
        part.normals = mu.vnormals(P, F)
        mat = {k: v for k, v in g.spec.items() if k in ('fabric', 'color', 'wear', 'dust', 'fade', 'pattern', 'patternColor', 'weave', 'tile', 'sheen', 'rough', 'albedoMix', 'wrinkle', 'dustColor')}
        part.material = mat
        dust = np.clip((0.3 - P[:, 1]) / 0.3, 0, 1) ** 1.5
        sole = np.zeros(len(P))
        crease = np.zeros(len(P))
        if g.spec['type'] in ('boots', 'shoes') and not seated:
            # sole edge (stacked leather + welt) and the flex creases over the instep / ankle
            sole = np.clip(1 - (P[:, 1] - 0.002) / 0.016, 0, 1)
            for s_ in ('L', 'R'):
                an = D.Jt[f'foot.{s_}']
                side_ = (P[:, 0] > 0) == (s_ == 'L')
                crease = np.maximum(crease, side_ * np.clip(1 - np.abs(P[:, 1] - (an[1] - 0.005)) / 0.045, 0, 1))
        part.attrs['aux'] = np.stack([dust, hem, sole, crease], 1)
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
        covers = [g for g in spec.get('outfit', []) if g['type'] in ('coif', 'kerchief', 'cap', 'hood')]
        if covers:
            # hair only where it shows: outside the covering, plus a band reaching 1.2 cm under its
            # edge; kept close to the scalp so it never pokes through the cloth
            gr.region = lambda Q, cv=covers: np.all([gm.head_cover_depth(D, c, Q) < 0.012 for c in cv], axis=0)
            hs = dict(hs, loft=min(hs.get('loft', 0.008), 0.003))
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
    # the in-place post passes, so a fresh build needs nothing else: the face albedo de-lighting
    # at the current scales (regain.py), shoes made on a last, cloth puckers smoothed and prop
    # colours (postfix.py)
    if os.path.samefile(out_dir, os.path.join(HERE, '..', 'cache')) and not opts.get('nopost'):
        import regain
        import postfix
        regain.regain(cid + opts.get('suffix', ''), 0.006, 0.06)
        postfix.fix_shoes(cid + opts.get('suffix', ''))
        postfix.fix_puckers(cid + opts.get('suffix', ''))
        postfix.fix_pushout(cid + opts.get('suffix', ''))
        postfix.fix_cull(cid + opts.get('suffix', ''))
        postfix.fix_renormal(cid + opts.get('suffix', ''))
        postfix.fix_holefill(cid + opts.get('suffix', ''))
        postfix.fix_beltband(cid + opts.get('suffix', ''))
        postfix.fix_beltseat(cid + opts.get('suffix', ''))
        # (the cloak passes before the AO bake: baked while the belt still poked through the
        # mantle, its AO printed a dark band across the King's back)
        postfix.fix_overbelt(cid + opts.get('suffix', ''))
        postfix.fix_cloakin(cid + opts.get('suffix', ''))
        postfix.fix_reao(cid + opts.get('suffix', ''))
        postfix.fix_props(cid + opts.get('suffix', ''))
        postfix.fix_hairline(cid + opts.get('suffix', ''))
        postfix.fix_cullboots(cid + opts.get('suffix', ''))
    log(f'   {cid}: {sum(len(p.posed) for p in parts)} verts, {size / 1e6:.1f} MB, {time.time() - t0:.0f} s')


def card_qa(body, parts, sk):
    """Brow and lash cards: no fragment may float off the face. The fitted MakeHuman cards run
    past the outer brow / eye corner and stand off the temple once the face is shaped: at 4K, in
    a 3/4 view, their alpha-hashed ends printed as black specks (and a translucent streak) outside
    the head's silhouette. Brow triangles more than 2.5 mm off the skin and lash triangles beyond
    the eye opening (lid margin extent + 2 mm) are removed."""
    import bpy  # noqa: F401
    from mathutils.bvhtree import BVHTree
    from mathutils import Vector
    tree = BVHTree.FromPolygons(body.P.tolist(), body.tris_all.tolist(), all_triangles=True)
    lm = body.attrs['aux2'][:, 1]
    for p in parts:
        if p.name not in ('brows', 'lashes'):
            continue
        P = p.P
        d = np.array([tree.find_nearest(Vector(q))[3] for q in P])
        keep = np.ones(len(p.tris), bool)
        if p.name == 'brows':
            keep &= d[p.tris].min(1) < 0.0025
        else:
            c = P[p.tris].mean(1)
            for sg in (1.0, -1.0):
                sel = (lm > 0.5) & (body.P[:, 0] * sg > 0.005)
                if not sel.any():
                    continue
                xs = body.P[sel, 0] * sg
                lo, hi = xs.min() - 0.002, xs.max() + 0.002
                side = c[:, 0] * sg > 0.005
                keep &= ~(side & ((c[:, 0] * sg > hi) | (c[:, 0] * sg < lo)))
        n0 = len(p.tris)
        p.tris = p.tris[keep]
        log(f'    card QA {p.name}: {n0 - len(p.tris)} of {n0} triangles off the face removed')


def relax_poles(P, F, iters=8):
    """Soften the star-shaped puckers the cloth simulation leaves around high-valence vertices
    (the body mesh's poles at the nipples and navel are inherited by the garment shells)."""
    nv = len(P)
    val = np.zeros(nv, int)
    for f in F:
        for v in f:
            val[v] += 1
    nb = mu.neighbours(nv, F)
    bnd = np.zeros(nv, bool)
    for l in mu.boundary_loops(F):
        bnd[l] = True
    m = ((val >= 6) & ~bnd).astype(float)
    for _ in range(2):
        m = np.maximum(m, np.array([m[n].max() * 0.7 if len(n) else 0 for n in nb]))
    if not m.any():
        return P
    return mu.laplacian_smooth_fast(P, nb, iters=iters, lam=0.5, fixed=bnd, mask=m)


def caruncles(kit, body, sk):
    """The pink, wet tissue in the inner corner of each eye (caruncle + plica): without it the
    corner between eyeball and lids is a dark hole. A small ellipsoid tucked into the inner
    canthus (the most medial point of the lid-margin rim), skinned to the head (rest space)."""
    import props as pr
    P = body.P
    lm = body.attrs['aux2'][:, 1]
    pieces = []
    for sg, nm in ((1.0, 'eye.L'), (-1.0, 'eye.R')):
        c = sk.H[sk.names.index(nm)]
        sel = np.where((lm > 0.5) & ((P[:, 0] * sg) > 0) & (np.abs(P[:, 1] - c[1]) < 0.008))[0]
        if not len(sel):
            continue
        q = P[sel[np.argmin(np.abs(P[sel, 0]))]]
        p = q + (c - q) * np.array([0.12, 0.0, 0.25])
        u, v = np.meshgrid(np.linspace(0, math.pi, 7), np.linspace(0, 2 * math.pi, 12, endpoint=False))
        E = np.stack([np.sin(u) * np.cos(v) * 0.0024, np.cos(u) * 0.002, np.sin(u) * np.sin(v) * 0.0022], -1).reshape(-1, 3) + p
        F = [(j * 7 + i, j * 7 + i + 1, ((j + 1) % 12) * 7 + i + 1, ((j + 1) % 12) * 7 + i) for j in range(12) for i in range(6)]
        pieces.append((E, F))
    Pm, Fm = pr.merge(pieces)
    tris = mu.tris_of(Fm)
    # skin weights from the nearest eyelash/eye vertices' source: use the head bone fully
    part = Part('caruncle', 'teeth', Pm, tris, uv=np.zeros((len(Pm), 2)))
    hi = kit.rig.names.index('head')
    part.I = np.zeros((len(Pm), 4), np.int64)
    part.I[:, 0] = hi
    part.W = np.zeros((len(Pm), 4))
    part.W[:, 0] = 1.0
    part.material = {'color': [0.72, 0.42, 0.4], 'rough': 0.25, 'clearcoat': 0.8, 'castShadow': False, 'occluder': False}
    return part


def accessories(D, garments, spec, parts):
    """Belt kit on top of the simulated layers. The belted garment's spec picks the style:
    belt_style 'leather' (strap, D-buckle with a prong, keeper, the tongue passed through it and
    hanging in a curve), 'girdle' (narrow strap with metal mounts and a long pendant end), 'cord'
    (rope knotted at the side, two hanging ends), 'sash' (cloth band knotted, two tails);
    belt_color, belt_width, buckle ('iron'|'brass'), pouch (True: a leather purse at the right
    hip). Every hanging piece is pushed outside the clothes (the old plank tongue stood off the
    coat like a black slab)."""
    import props as pr
    belt_g = [g for g in garments if g.spec.get('belt')]
    if not belt_g:
        return
    g = belt_g[-1]
    st = g.spec.get('belt_style', 'leather')
    allP = np.vstack([x.result[getattr(x, 'region', np.zeros(len(x.result), int)) == 0] for x in garments if x.layer >= 1])
    y = g.result[g.belt_idx][:, 1].mean() if g.belt_idx is not None and len(g.belt_idx) else D.Jt['spine04'][1]
    near = allP[np.abs(allP[:, 1] - y) < 0.03]
    c = np.array([(near[:, 0].min() + near[:, 0].max()) / 2, 0, (near[:, 2].min() + near[:, 2].max()) / 2])
    defaults = {'leather': ([0.11, 0.06, 0.03], 0.032), 'girdle': ([0.07, 0.04, 0.025], 0.022), 'cord': ([0.3, 0.25, 0.17], 0.011), 'sash': ([0.3, 0.26, 0.2], 0.05)}
    bc0, bw0 = defaults.get(st, defaults['leather'])
    bc = g.spec.get('belt_color', bc0)
    width = g.spec.get('belt_width', bw0)
    tree = garment_surface(D)
    axis = D.axis_y()
    seed = zlib.crc32(spec['id'].encode()) & 0xffff
    rng = np.random.default_rng(seed)
    thick = 0.004 if st in ('leather', 'girdle') else (0.01 if st == 'cord' else 0.006)
    P, F, angs, R = pr.belt_ring(allP, y, c, width=width, thick=thick, clearance=0.0015)
    pieces_belt, pieces_metal, pieces_cloth, pieces_pouch = [], [], [], []
    if st == 'cord':
        # a round cord instead of the flat band: rebuild the ring as a tube
        ring = np.stack([c[0] + np.sin(angs) * (R + 0.006), np.full(len(angs), y), c[2] + np.cos(angs) * (R + 0.006)], 1)
        ring = np.vstack([ring, ring[:1]])
        P, F = pr.tube(ring, 0.0055, sides=8)
    if st == 'sash':
        pieces_cloth.append((P, F))
    else:
        pieces_belt.append((P, F))
    a0 = g.spec.get('buckle_angle', 0.32 if st != 'cord' else 0.55)
    rr = np.interp(a0, angs, R) + 0.0015 + thick
    bpos = np.array([c[0] + math.sin(a0) * rr, y, c[2] + math.cos(a0) * rr])
    t = np.array([math.cos(a0), 0, -math.sin(a0)])          # along the belt (toward the wearer's right)
    nrm = np.array([math.sin(a0), 0, math.cos(a0)])
    up = np.array([0, 1.0, 0])

    def hanging(start, length, sway, w, out=0.004, curl=0.0, n=14):
        """A strap / cord end hanging from `start`: leaves along the belt, turns down under its
        own weight (a curve, not a plank), pushed outside the clothes."""
        pts = []
        for k in range(n):
            s_ = k / (n - 1)
            turn = min(1.0, s_ * 2.2)
            d = t * (1 - turn) * 0.6 + (-up) * turn + nrm * (0.08 * math.sin(s_ * math.pi)) + t * sway * s_
            pts.append(d)
        pts = np.array(pts)
        seg = length / (n - 1)
        path = [start]
        for k in range(1, n):
            path.append(path[-1] + mu.norm(pts[k]) * seg)
        path = np.array(path)
        if curl:
            path[-4:] += nrm * np.linspace(0, curl, 4)[:, None]
        path[1:] = push_outside(path[1:], tree, out + thick, axis=axis)
        for _ in range(3):
            path[1:-1] = 0.5 * path[1:-1] + 0.25 * (path[:-2] + path[2:])
        path[1:] = push_outside(path[1:], tree, out + thick, axis=axis)
        return path

    def strap(path, w, th):
        tg = mu.norm(np.gradient(path, axis=0))
        rad = (path - axis) * np.array([1, 0, 1])
        nn = mu.norm(rad - tg * np.einsum('ij,ij->i', rad, tg)[:, None])
        sv = mu.norm(np.cross(tg, nn)) * (w / 2)
        rows = [path + sv, path - sv, path - sv - nn * th, path + sv - nn * th]
        Ps = np.vstack(rows)
        n_ = len(path)
        Fs = []
        for a in range(4):
            b = (a + 1) % 4
            Fs += [(a * n_ + k, b * n_ + k, b * n_ + k + 1, a * n_ + k + 1) for k in range(n_ - 1)]
        Fs += [(0, n_, 2 * n_, 3 * n_)[::-1], (n_ - 1, 2 * n_ - 1, 3 * n_ - 1, 4 * n_ - 1)]
        return Ps, Fs

    Rm = np.stack([t, up, nrm], 1)
    if st in ('leather', 'girdle'):
        # D-shaped buckle frame (straight bar on the strap side) + prong across it
        bw = width + 0.008
        hx = 0.012 if st == 'leather' else 0.009
        dpath = [np.array([-hx, -bw / 2, 0.0]) + np.array([0, bw * k / 8, 0]) for k in range(9)]
        for k in range(1, 12):
            a = math.pi * k / 12
            dpath.append(np.array([-hx + math.sin(a) * hx * 2.3, math.cos(a) * bw / 2, 0.0]))
        dpath.append(dpath[0])
        dp = np.array([bpos + Rm @ q + nrm * 0.0025 for q in dpath])
        pieces_metal.append(pr.tube(dp, 0.0022 if st == 'leather' else 0.0017, sides=7))
        prong = np.array([bpos + Rm @ np.array([-hx + s_ * hx * 2.0, 0, 0.0045 + 0.0015 * math.sin(s_ * math.pi)]) for s_ in np.linspace(0, 1, 6)])
        pieces_metal.append(pr.tube(prong, 0.0014, sides=6))
        # keeper: a narrow leather loop just past the buckle
        kp = bpos + t * 0.03 + nrm * 0.0012
        pieces_belt.append(pr.box(kp, (0.009, width + 0.005, 0.0075), Rm))
        # tongue: through the keeper, then hanging (short for a belt, long for a girdle)
        L = g.spec.get('tongue', 0.09 if st == 'leather' else 0.32)
        start = bpos + t * 0.045 + nrm * 0.003
        path = hanging(start, L, sway=0.15 * (rng.random() - 0.5), w=width * 0.85, out=0.003, curl=0.004)
        pieces_belt.append(strap(path, width * 0.85, 0.0035))
        if st == 'girdle':
            # metal mounts every ~4 cm round the strap, and a strap end on the pendant
            for a in np.arange(-math.pi + 0.05, math.pi, 0.11):
                if abs(a - a0) < 0.12:
                    continue
                r_ = np.interp(a, angs, R) + 0.0015 + thick + 0.0008
                q = np.array([c[0] + math.sin(a) * r_, y, c[2] + math.cos(a) * r_])
                tt = np.array([math.cos(a), 0, -math.sin(a)])
                nn = np.array([math.sin(a), 0, math.cos(a)])
                pieces_metal.append(pr.box(q, (0.008, width * 0.7, 0.0024), np.stack([tt, up, nn], 1)))
            te = path[-1]
            tg = mu.norm(path[-1] - path[-3])
            pieces_metal.append(pr.box(te + tg * 0.012, (width * 0.8, 0.026, 0.004), pr.frame_from(tg, nrm)))
    elif st in ('cord', 'sash'):
        # knot + two hanging ends
        kn_r = 0.012 if st == 'cord' else 0.018
        u_, v_ = np.meshgrid(np.linspace(0, math.pi, 7), np.linspace(0, 2 * math.pi, 10, endpoint=False))
        K = np.stack([np.sin(u_) * np.cos(v_) * kn_r * 1.2, np.cos(u_) * kn_r, np.sin(u_) * np.sin(v_) * kn_r * 0.8], -1).reshape(-1, 3)
        K = (Rm @ K.T).T + bpos + nrm * kn_r * 0.6
        KF = [(j * 7 + i, j * 7 + i + 1, ((j + 1) % 10) * 7 + i + 1, ((j + 1) % 10) * 7 + i) for j in range(10) for i in range(6)]
        (pieces_cloth if st == 'sash' else pieces_belt).append((K, KF))
        for k_, (L, sw) in enumerate(((0.26 if st == 'sash' else 0.3, 0.25), (0.2 if st == 'sash' else 0.24, -0.15))):
            path = hanging(bpos + nrm * kn_r + t * (0.008 * (k_ * 2 - 1)), L, sway=sw, w=width, out=0.004)
            if st == 'cord':
                pieces_belt.append(pr.tube(path, np.linspace(0.005, 0.0045, len(path)), sides=7))
                # frayed tuft at the end
                pieces_belt.append(pr.tube(np.array([path[-1], path[-1] + (path[-1] - path[-2]) * 1.5]), [0.0055, 0.001], sides=7))
            else:
                pieces_cloth.append(strap(path, width * 0.75, 0.004))
    if g.spec.get('pouch'):
        # leather purse hanging from the belt at the right hip
        a_p = g.spec.get('pouch_angle', -1.05)
        r_ = np.interp(a_p, angs, R) + 0.0015 + thick
        top = np.array([c[0] + math.sin(a_p) * r_, y - 0.012, c[2] + math.cos(a_p) * r_])
        tt = np.array([math.cos(a_p), 0, -math.sin(a_p)])
        nn = np.array([math.sin(a_p), 0, math.cos(a_p)])
        prof = [(0.0, -0.125), (0.03, -0.12), (0.05, -0.1), (0.055, -0.06), (0.048, -0.025), (0.036, -0.005), (0.032, 0.0)]
        Pp, Fp, _ = pr.lathe(prof, segs=16, close_bottom=False)
        Pp[:, 2] *= 0.45
        Pp += (rng.random(Pp.shape) - 0.5) * 0.0015
        Pp = (np.stack([tt, up, nn], 1) @ Pp.T).T + top + nn * 0.026
        Pp = push_outside(Pp, tree, 0.003, axis=axis)
        pieces_pouch.append((Pp, Fp))
        # its drawstring gathers at the neck
        a = np.linspace(0, 2 * math.pi, 17)
        ring = np.stack([np.cos(a) * 0.034, np.full_like(a, -0.012), np.sin(a) * 0.034 * 0.45], 1)
        ring = (np.stack([tt, up, nn], 1) @ ring.T).T + top + nn * 0.026
        pieces_pouch.append(pr.tube(ring, 0.003, sides=5))
    buckle_kind = g.spec.get('buckle', 'brass' if st == 'girdle' else 'iron')
    metal_mat = {'kind': 'brass', 'color': [0.62, 0.45, 0.22], 'rough': 0.42} if buckle_kind == 'brass' else \
        ({'kind': 'gold', 'rough': 0.35} if buckle_kind == 'gold' else {'kind': 'iron', 'color': [0.34, 0.33, 0.32], 'rough': 0.62, 'tile': 0.15})
    out_ = []
    if pieces_belt:
        out_.append(('belt', pr.merge(pieces_belt), {'kind': 'leather', 'color': bc, 'rough': 0.66 if st != 'cord' else 0.95, 'tile': 0.25, 'doubleSide': True} if st != 'cord'
                     else {'kind': 'rope', 'color': bc, 'rough': 0.95, 'doubleSide': True}))
    if pieces_metal:
        out_.append(('buckle', pr.merge(pieces_metal), metal_mat))
    if pieces_pouch:
        out_.append(('pouch', pr.merge(pieces_pouch), {'kind': 'leather', 'color': [c_ * 0.85 for c_ in bc] if st != 'cord' else [0.09, 0.055, 0.03], 'rough': 0.7, 'tile': 0.25, 'doubleSide': True}))
    if pieces_cloth:
        out_.append(('beltsash', pr.merge(pieces_cloth), {'fabric': 'linen', 'color': bc, 'wear': 0.4, 'dust': 0.3}))
    for name, (Pp, Fp), mat in out_:
        kind = 'cloth' if name == 'beltsash' else 'prop'
        part = Part(name, kind, Pp, mu.tris_of(Fp), uv=_uv_box(Pp))
        part.posed = Pp
        part.normals = mu.vnormals(Pp, Fp)
        part.I, part.W = D.transfer(Pp, space='target')
        part.material = mat
        if kind == 'cloth':
            part.attrs['aux'] = np.zeros((len(Pp), 4))
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
    if any(a['prop'] == 'chain' for a in spec.get('accessories', [])):
        parts.extend(build_chain(sk, pt, off, D))
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
        # the apex of the triangle closes round the elbow (a pocket, not an open trough)
        if t < 0:
            r *= math.sqrt(max(0.05, 1.0 - (t / -0.15) ** 2))
        for j in range(n_v):
            a = math.pi * (-0.15 + 1.25 * j / (n_v - 1))     # from the body side, under, up the front
            # the cloth is gathered, not a smooth trough: soft lengthwise folds that die out
            # toward the hand, and gathers round the elbow
            fold = 0.003 * math.sin(a * 5.0 + t * 2.3) * (1.0 - 0.6 * min(1.0, max(0.0, t)))
            fold += 0.003 * max(0.0, -t) / 0.15 * math.sin(a * 9.0)
            P.append(c + (-up * math.sin(a) - side * math.cos(a)) * (r + fold) - up * 0.008)
    P = np.array(P)
    F = mu.grid_faces(n_v, n_u)
    cradle_top_front = P[[i * n_v + (n_v - 1) for i in range(n_u)]]
    # bands: from the front edge of the cradle (hand end, elbow end) over the chest to the shoulders
    nk = Pj[idx['neck01']] + off + np.array([0, 0.03, -0.07])
    # the bands run over the sides of the neck (between neck and shoulder) and round its back -
    # out at the shoulder joints they hung in front of the coat like loose straps
    n0 = Pj[idx['neck01']] + off
    shR = n0 + (Pj[idx['shoulder01.R']] + off - n0) * np.array([0.55, 0.0, 0.55]) + np.array([0, 0.045, 0.0])
    shL = n0 + (Pj[idx['shoulder01.L']] + off - n0) * np.array([0.55, 0.0, 0.55]) + np.array([0, 0.045, 0.0])
    bands = []
    for a_end, mid in ((cradle_top_front[-3], shR), (cradle_top_front[2], shL)):
        path = []
        for k in range(22):
            s = k / 21
            q = (1 - s) ** 2 * a_end + 2 * (1 - s) * s * (mid + np.array([0, 0, 0.06])) + s * s * nk
            path.append(q)
        path = np.array(path)
        # snap onto the clothed body (+6 mm): the band is under tension, so it lies on the
        # clothes; only the first points, where it leaves the cradle, may stand off
        from mathutils import Vector
        for k in range(1, len(path)):
            loc, n, _, _ = tree.find_nearest(Vector(path[k]))
            loc, n = np.array(loc), np.array(n)
            rad = (loc - axis) * np.array([1, 0, 1])
            if np.dot(n, rad) < 0 and loc[1] < nk[1] - 0.02:
                n = -n
            if k >= 4 or np.dot(path[k] - loc, n) < 0.03:
                path[k] = loc + n * 0.006
        # nearest-point snapping jumps between layers (coat / shirt in the V): smooth the path,
        # then push it back outside the clothes
        for _ in range(4):
            path[1:-1] = 0.5 * path[1:-1] + 0.25 * (path[:-2] + path[2:])
        path[1:] = push_outside(path[1:], tree, 0.006, axis=axis)
        t = mu.norm(np.gradient(path, axis=0))
        # the band lies flat on the body: its face normal is the body's outward direction
        # (radial from the body axis on the chest, turning upward over the shoulder)
        shy = max(shR[1], shL[1]) - 0.07
        rad = (path - axis) * np.array([1, 0, 1])
        rad = rad / np.maximum(np.linalg.norm(rad, axis=1, keepdims=True), 1e-6)
        upw = np.clip((path[:, 1] - (shy - 0.04)) / 0.06, 0, 1)[:, None] * 1.5
        nrm = mu.norm(rad + upw * np.array([0, 1.0, 0]))
        nrm = mu.norm(nrm - t * np.einsum('ij,ij->i', nrm, t)[:, None])
        w = np.linspace(0.034, 0.02, len(path))        # half-widths: a folded bandage, ~7 cm to 4 cm
        sv = mu.norm(np.cross(t, nrm))
        # a folded bandage, not a paper strip: 9 vertices across, the edges rolled under toward
        # the body, two shallow lengthwise creases that wander, a little twist toward the neck
        nx = 9
        nn = len(path)
        ss = np.linspace(-1.0, 1.0, nx)
        kk = np.arange(nn) / max(1, nn - 1)
        rows = []
        for v in ss:
            h = -0.0045 * np.clip(np.abs(v) - 0.55, 0, 1) ** 2 / 0.2
            for cv, ph in ((-0.35, 0.7), (0.3, 2.1)):
                h = h - 0.0016 * np.exp(-((v - (cv + 0.12 * np.sin(kk * 6.0 + ph))) / 0.12) ** 2) * (0.6 + 0.4 * np.sin(kk * 9.0 + ph))
            tw = 0.25 * kk ** 2 * v                     # twist: the side toward the neck lifts
            rows.append(path + sv * (w * v)[:, None] + nrm * (h + tw * w)[:, None])
        Ps = np.vstack(rows)
        for r_ in range(nx):
            Ps[r_ * nn + 1:(r_ + 1) * nn] = push_outside(Ps[r_ * nn + 1:(r_ + 1) * nn], tree, 0.003, axis=axis)
        # the pushes are per row and nearest-point: smooth each row along the band and across it
        # (jagged, paper-like edges otherwise), then make sure it is still outside
        G = Ps.reshape(nx, nn, 3)
        for _ in range(6):
            G[:, 1:-1] = 0.5 * G[:, 1:-1] + 0.25 * (G[:, :-2] + G[:, 2:])
            G[1:-1, 1:] = 0.6 * G[1:-1, 1:] + 0.2 * (G[:-2, 1:] + G[2:, 1:])
        Ps = G.reshape(-1, 3)
        for r_ in range(nx):
            Ps[r_ * nn + 1:(r_ + 1) * nn] = push_outside(Ps[r_ * nn + 1:(r_ + 1) * nn], tree, 0.002, axis=axis)
        Fs = [(r_ * nn + k, r_ * nn + k + 1, (r_ + 1) * nn + k + 1, (r_ + 1) * nn + k) for r_ in range(nx - 1) for k in range(nn - 1)]
        bands.append((Ps, Fs))
    P = push_outside(P, tree, 0.006, axis=axis)
    P2, F2 = pr.merge([(P, F)] + bands)
    # folded linen has thickness: a closed shell 2.5 mm thick with rounded edges (a single-sided
    # surface read as paper strips, and its open ends showed black and white shards)
    nrm2 = mu.vnormals(P2, F2)
    P2, F2, _inner = mu.solidify(P2 + nrm2 * 0.0012, F2, 0.0025, nrm=nrm2)
    uv = np.stack([P2[:, 0] + P2[:, 2], P2[:, 1]], 1)
    part = Part('sling', 'cloth', P2, mu.tris_of(F2), uv=uv)
    part.posed = P2
    part.normals = mu.vnormals(P2, F2)
    part.I, part.W = D.transfer(P2, space='target')
    part.material = {'fabric': 'linen', 'color': [0.4, 0.37, 0.3], 'wear': 0.45, 'dust': 0.4}
    part.attrs['aux'] = np.zeros((len(P2), 4))
    return [part]


def build_chain(sk, pt, off, D, links=64):
    """A gold chain of office: oval links lying over the shoulders and dipping in a U on the
    chest, pushed out over the clothes (status without a crown)."""
    import props as pr
    idx = {n: i for i, n in enumerate(sk.names)}
    Q, Pj = sk.world(pt.local)
    nk = Pj[idx['neck01']] + off
    fwd = mc.quat_to_mat(Q[idx['spine01']]) @ np.array([0, 0, 1.0])
    lat = mc.quat_to_mat(Q[idx['spine01']]) @ np.array([1.0, 0, 0])
    up = np.array([0, 1.0, 0])
    tree = garment_surface(D)
    axis = D.axis_y()
    path = []
    for k in range(160):
        a = 2 * math.pi * k / 160
        ca, sa = math.cos(a), math.sin(a)          # a = 0: front
        front = max(0.0, ca) ** 2
        q = nk + fwd * (ca * 0.12 + 0.02) + lat * sa * 0.15 - up * (0.035 + 0.13 * front + 0.03 * max(0.0, -ca))
        path.append(q)
    path = np.array(path)
    for _ in range(3):
        path = push_outside(path, tree, 0.007, axis=axis)
        path = 0.5 * path + 0.25 * (np.roll(path, 1, 0) + np.roll(path, -1, 0))
    path = push_outside(path, tree, 0.007, axis=axis)
    L = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(np.vstack([path, path[:1]]), axis=0), axis=1))])
    pieces = []
    for i in range(links):
        s = L[-1] * i / links
        j = int(np.searchsorted(L, s)) - 1
        j = max(0, min(len(path) - 1, j))
        t = (s - L[j]) / max(1e-9, L[j + 1] - L[j])
        c = path[j] * (1 - t) + path[(j + 1) % len(path)] * t
        tg = mu.norm(path[(j + 1) % len(path)] - path[j])
        rad = mu.norm((c - axis) * np.array([1, 0, 1]) + up * 0.6)
        side = mu.norm(np.cross(tg, rad))
        nrm = rad if i % 2 == 0 else side
        bn = mu.norm(np.cross(tg, nrm))
        a = np.linspace(0, 2 * math.pi, 13)
        ring = np.array([c + tg * math.cos(x) * 0.0085 + bn * math.sin(x) * 0.0055 for x in a])
        pieces.append(pr.tube(ring, 0.0017, sides=5))
    P, F = pr.merge(pieces)
    part = Part('chain', 'prop', P, mu.tris_of(F), uv=_uv_box(P))
    part.posed = P
    part.normals = mu.vnormals(P, F)
    part.I, part.W = D.transfer(P, space='target')
    part.material = {'kind': 'gold', 'color': [0.85, 0.62, 0.28], 'rough': 0.32}
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
    gr.salt = hs.get('salt', 0.0)
    gr.part_width = hs.get('part', 0.0)
    gr.part_x = hs.get('part_x', 0.0)
    gr.loose = hs.get('loose', 0.012)
    if st in ('braid', 'pulled', 'bun', 'coronet'):
        gat = list(hs.get('gather', [0.0, -0.035, -0.09]))
        if st == 'braid' and hs.get('hang') in ('L', 'R'):
            # a braid brought forward over a shoulder starts behind that ear, low
            gat = [0.045 if hs['hang'] == 'L' else -0.045, -0.06, -0.07]
        g = sk + np.array(gat)
        s_, n_ = gr.surf(g)
        g = s_ + n_ * 0.008
        i0 = len(gr.strands)
        gr.style_pulled_back(int(hs.get('count', 15000) * dens), g, color_layers=hs.get('loft', 0.008), width=hs.get('width', 0.0009 if hero else 0.0015))
        gr.clump(i0, len(gr.strands), amount=hs.get('clump', 0.18), per=40, power=1.5)
    elif st == 'crop':
        i0 = len(gr.strands)
        gr.style_crop(int(hs.get('count', 16000) * dens), length=tuple(hs.get('length', (0.012, 0.045))), flow=hs.get('flow', 'back'), width=hs.get('width', 0.0008 if hero else 0.0013), curl=hs.get('curl', 0.0), loft=hs.get('loft', 0.009))
        gr.clump(i0, len(gr.strands), amount=hs.get('clump', 0.35), per=18)
    # vellus / baby hairs at the hairline: fewer, finer and flagged (shaded dark, no highlight) -
    # a band of bright short hairs read as frost along the forehead
    if st in ('braid', 'pulled', 'bun', 'coronet') and hero:
        G_ = g

        def tw(r, G_=G_):
            w = np.clip((r[2] - sk[2] + 0.02) / 0.08, 0, 1)
            W1 = np.array([r[0] * 0.75, sk[1] + 0.1, sk[2] - 0.05])
            return mu.norm((G_ + (W1 - G_) * w) - r)
        gr.baby_hairs(int(hs.get('baby', 900)), towards=tw, length=(0.003, 0.009), width=0.00022)
    elif st == 'crop' and hero:
        gr.baby_hairs(int(hs.get('baby', 600)), towards=lambda r: np.array([0, 0.6, -1.0]), length=(0.003, 0.008), width=0.00022)
    n_scalp = len(gr.strands)
    if st in ('braid', 'pulled', 'bun', 'coronet'):
        if st == 'braid':
            gr.braid(g + np.array([0, -0.005, -0.012]), length=hs.get('length', 0.42), strands_per=int(90 * max(0.5, dens)), hang=hs.get('hang', 'back'))
        if st == 'bun':
            gr.bun(g + np.array([0, 0.0, -0.02]), radius=hs.get('bun_radius', 0.035), strands=int(700 * max(0.5, dens)))
        if st == 'coronet':
            gr.coronet(strands_per=int(90 * max(0.5, dens)))
    if hs.get('beard'):
        bd = hs['beard']
        m = gr.beard_mask(body.P, moustache=bd.get('moustache', True), coverage=bd.get('coverage', 'full'))
        body.attrs['aux'][:, 2] = np.maximum(body.attrs['aux'][:, 2], m * bd.get('shadow', 1.0))
        body.material['beardColor'] = list(bd.get('color', hs.get('color', [0.05, 0.03, 0.02])))
        if bd.get('count', 0) > 0:
            gr.salt = bd.get('salt', hs.get('salt', 0.0))
            i0 = len(gr.strands)
            gr.style_beard(int(bd.get('count', 6000) * (1.0 if hero else 0.5)), length=tuple(bd.get('length', (0.006, 0.02))), moustache=bd.get('moustache', True),
                           coverage=bd.get('coverage', 'full'), curl=bd.get('curl', 0.4), width=bd.get('width', 0.0007), moustache_len=bd.get('moustache_len'))
            gr.clump(i0, len(gr.strands), amount=bd.get('clump', 0.45), per=16)
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
    ap.add_argument('--nopost', action='store_true', help='skip the in-place post passes (debugging)')
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
    opts = {'quality': a.quality, 'nosim': a.nosim, 'nohair': a.nohair, 'suffix': a.suffix, 'dresspose': a.dresspose, 'lod': a.lod, 'nopost': a.nopost}
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
