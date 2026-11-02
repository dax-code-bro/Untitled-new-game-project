#!/usr/bin/env python3
"""Build a realistic, rigged, clothed human (glTF) from CC0 MakeHuman assets.

MakeHuman's assets (base mesh, targets, rig, weights, skins, clothes, hair,
eyebrows, eyelashes, eyes) are released under CC0 1.0 -- see LICENSE.md and
LICENSE.ASSETS.md in github.com/makehumancommunity/makehuman ("These assets
have been released under CC0 1.0 Universal").

Inputs (paths are arguments so the script stays reproducible):
  --core    clone of makehumancommunity/makehuman      (base.obj, rig, weights, eyes)
  --assets  clone of dmaugis/makehuman-py3-assets      (.mhclo/.obj fitting data)
  --data    unpacked npm makehuman-data package        (targets.bin, textures)
  --out     output .glb

Coordinates: MakeHuman works in decimetres; the output is in metres, feet at y=0, facing +Z.
"""
import argparse, json, os, struct, io
import numpy as np
from PIL import Image

ap = argparse.ArgumentParser()
ap.add_argument('--core', required=True)
ap.add_argument('--assets', required=True)
ap.add_argument('--data', required=True)
ap.add_argument('--out', required=True)
ap.add_argument('--suit', default='male_casualsuit02')
ap.add_argument('--shoes', default='shoes02')
ap.add_argument('--hair', default='short02')
ap.add_argument('--skin', default='young_lightskinned_male_diffuse.png')
ap.add_argument('--texsize', type=int, default=1024)
ap.add_argument('--gender', choices=['male', 'female'], default='male')
ap.add_argument('--age', choices=['young', 'old'], default='young')
A = ap.parse_args()
CORE = os.path.join(A.core, 'makehuman/data')
AST = os.path.join(A.assets, 'base')
DATA = os.path.join(A.data, 'public/data')

# ---------------------------------------------------------------- base mesh
def read_obj(path):
    v, vt, faces, group = [], [], [], 'default'
    for line in open(path, encoding='utf-8', errors='ignore'):
        if line.startswith('v '):
            v.append([float(x) for x in line.split()[1:4]])
        elif line.startswith('vt '):
            vt.append([float(x) for x in line.split()[1:3]])
        elif line.startswith('g '):
            group = line.split(None, 1)[1].strip()
        elif line.startswith('f '):
            idx = []
            for tok in line.split()[1:]:
                p = tok.split('/')
                idx.append((int(p[0]) - 1, int(p[1]) - 1 if len(p) > 1 and p[1] else -1))
            faces.append((group, idx))
    return np.array(v, np.float64), np.array(vt, np.float64), faces

base_v, base_vt, base_f = read_obj(os.path.join(CORE, '3dobjs/base.obj'))
NV = len(base_v)
print('base mesh', NV, 'verts', len(base_f), 'faces')

# ---------------------------------------------------------------- targets (young adult male)
tl = sorted(json.load(open(os.path.join(A.data, 'src/json/targets/target-list.json')))['targets'].keys())
TB = np.memmap(os.path.join(DATA, 'targets/targets.bin'), dtype=np.int16, mode='r', shape=(len(tl), NV * 3))
G, AGE = A.gender, A.age
weights = {
    f'data/targets/macrodetails/universal-{G}-{AGE}-averagemuscle-averageweight.target': 1.0,
    f'data/targets/macrodetails/caucasian-{G}-{AGE}.target': 1 / 3,
    f'data/targets/macrodetails/african-{G}-{AGE}.target': 1 / 3,
    f'data/targets/macrodetails/asian-{G}-{AGE}.target': 1 / 3,
    f'data/targets/macrodetails/proportions/{G}-{AGE}-averagemuscle-averageweight-idealproportions.target': 0.6,
    f'data/targets/macrodetails/height/{G}-{AGE}-averagemuscle-averageweight-maxheight.target': 0.05,
}
coords = base_v.copy()
for name, w in weights.items():
    if name not in tl:
        print('  (missing target, skipped)', name); continue
    coords += TB[tl.index(name)].astype(np.float64).reshape(-1, 3) * 1e-3 * w

# ---------------------------------------------------------------- skeleton + weights
skel = json.load(open(os.path.join(CORE, 'rigs/default.mhskel')))
joint_pos = {j: coords[np.array(vs)].mean(0) for j, vs in skel['joints'].items()}
bones = skel['bones']
order = []
def visit(b):
    order.append(b)
    for c in sorted(k for k, v in bones.items() if v['parent'] == b): visit(c)
for r in sorted(k for k, v in bones.items() if not v['parent']): visit(r)
bidx = {b: i for i, b in enumerate(order)}
head = np.array([joint_pos[bones[b]['head']] for b in order])
tail = np.array([joint_pos[bones[b]['tail']] for b in order])
wdata = json.load(open(os.path.join(CORE, 'rigs/default_weights.mhw')))['weights']
inf = [[] for _ in range(NV)]
for b, lst in wdata.items():
    if b not in bidx: continue
    for vi, w in lst: inf[vi].append((w, bidx[b]))
J = np.zeros((NV, 4), np.uint16); W = np.zeros((NV, 4), np.float32)
for i, l in enumerate(inf):
    l.sort(reverse=True); l = l[:4]
    s = sum(w for w, _ in l) or 1
    for k, (w, b) in enumerate(l): J[i, k] = b; W[i, k] = w / s
    if not l: J[i, 0] = bidx.get('root', 0); W[i, 0] = 1

# ---------------------------------------------------------------- proxies (.mhclo fitting)
def read_mhclo(path):
    d = {'verts': [], 'delete': set(), 'scale': {}}
    mode = None
    for line in open(path, encoding='utf-8', errors='ignore'):
        s = line.strip()
        if not s or s.startswith('#'): continue
        tok = s.split()
        # keyword lines never end a data section; only 'verts'/'delete_verts' switch sections
        if tok[0] in ('x_scale', 'y_scale', 'z_scale'):
            d['scale'][tok[0][0]] = (int(tok[1]), int(tok[2]), float(tok[3])); continue
        if tok[0] == 'verts': mode = 'v'; continue
        if tok[0] == 'delete_verts': mode = 'd'; continue
        if tok[0] in ('obj_file', 'material', 'name'): d[tok[0]] = tok[1]; continue
        if tok[0][0].isalpha(): continue
        if mode == 'v':
            if len(tok) == 1: d['verts'].append(((int(tok[0]), 0, 0), (1.0, 0.0, 0.0), (0.0, 0.0, 0.0)))
            else:
                d['verts'].append(((int(tok[0]), int(tok[1]), int(tok[2])), tuple(map(float, tok[3:6])), tuple(map(float, tok[6:9]))))
        elif mode == 'd':
            i = 0
            while i < len(tok):
                if i + 2 < len(tok) and tok[i + 1] == '-':
                    d['delete'].update(range(int(tok[i]), int(tok[i + 2]) + 1)); i += 3
                else:
                    d['delete'].add(int(tok[i])); i += 1
    return d

def scale_of(sc, axis):
    a, b, dist = sc[axis]
    return abs(coords[a][ 'xyz'.index(axis)] - coords[b]['xyz'.index(axis)]) / dist

def fit(mhclo_path):
    d = read_mhclo(mhclo_path)
    obj_v, obj_vt, obj_f = read_obj(os.path.join(os.path.dirname(mhclo_path), d['obj_file']))
    sx, sy, sz = (scale_of(d['scale'], a) for a in 'xyz')
    P = np.zeros((len(d['verts']), 3)); PJ = np.zeros((len(d['verts']), 4), np.uint16); PW = np.zeros((len(d['verts']), 4), np.float32)
    for i, (ref, w, off) in enumerate(d['verts']):
        P[i] = w[0] * coords[ref[0]] + w[1] * coords[ref[1]] + w[2] * coords[ref[2]] + np.array(off) * (sx, sy, sz)
        acc = {}
        for r, wr in zip(ref, w):
            if wr == 0: continue
            for k in range(4):
                if W[r, k] > 0: acc[int(J[r, k])] = acc.get(int(J[r, k]), 0) + W[r, k] * wr
        top = sorted(acc.items(), key=lambda x: -x[1])[:4]
        s = sum(x[1] for x in top) or 1
        for k, (b, ww) in enumerate(top): PJ[i, k] = b; PW[i, k] = ww / s
    return d, P, obj_vt, obj_f, PJ, PW

# ---------------------------------------------------------------- mesh assembly helpers
def tex_png(path, size, keep_alpha):
    im = Image.open(path)
    im = im.convert('RGBA' if keep_alpha else 'RGB')
    if max(im.size) > size: im.thumbnail((size, size), Image.LANCZOS)
    buf = io.BytesIO()
    if keep_alpha: im.save(buf, 'PNG', optimize=True)
    else: im.save(buf, 'JPEG', quality=88)
    return buf.getvalue(), ('image/png' if keep_alpha else 'image/jpeg')

def build_prim(name, pos, vt, faces, joints, wts, keep=None):
    """split (pos,uv) pairs into glTF vertices; triangulate quads; smooth normals"""
    key, out_p, out_uv, out_j, out_w, src, tris = {}, [], [], [], [], [], []
    for g, f in faces:
        if keep is not None and not keep(g, f): continue
        ids = []
        for vi, ti in f:
            k = (vi, ti)
            if k not in key:
                key[k] = len(out_p); out_p.append(pos[vi]); out_uv.append(vt[ti] if ti >= 0 else (0, 0))
                out_j.append(joints[vi]); out_w.append(wts[vi]); src.append(vi)
            ids.append(key[k])
        for t in range(1, len(ids) - 1): tris.append((ids[0], ids[t], ids[t + 1]))
    P = np.array(out_p, np.float32); T = np.array(tris, np.uint32)
    # repair any invalid vertex from its mesh neighbours (bad source data would explode skinning bounds)
    bad = np.where(~np.isfinite(P).all(1))[0]
    for b in bad:
        nb = np.unique(T[(T == b).any(1)].ravel())
        nb = nb[np.isfinite(P[nb]).all(1)]
        P[b] = P[nb].mean(0) if len(nb) else 0
    if len(bad): print('   repaired', len(bad), 'invalid vertices in', name)
    # normals accumulated per source vertex so UV seams stay smooth
    n = np.zeros((len(pos), 3))
    srcA = np.array(src)
    fn = np.cross(P[T[:, 1]] - P[T[:, 0]], P[T[:, 2]] - P[T[:, 0]])
    for c in range(3): np.add.at(n, srcA[T[:, c]], fn)
    N = n[srcA]; N /= np.linalg.norm(N, axis=1, keepdims=True) + 1e-12
    UV = np.array(out_uv, np.float32); UV[:, 1] = 1 - UV[:, 1]
    return dict(name=name, P=P, N=N.astype(np.float32), UV=UV, J=np.array(out_j, np.uint16), W=np.array(out_w, np.float32), T=T)

parts = []  # (prim, material)
deleted = set()
proxies = [
    ('suit', os.path.join(AST, f'clothes/{A.suit}/{A.suit}.mhclo'), os.path.join(DATA, f'proxies/clothes/{A.suit}/textures/{A.suit}_diffuse.png'), os.path.join(DATA, f'proxies/clothes/{A.suit}/textures/{A.suit}_normal.png'), False),
    ('shoes', os.path.join(AST, f'clothes/{A.shoes}/{A.shoes}.mhclo'), os.path.join(DATA, f'proxies/clothes/{A.shoes}/textures/{A.shoes}_diffuse.png'), None, False),
    ('hair', os.path.join(AST, f'hair/{A.hair}/{A.hair}.mhclo'), os.path.join(DATA, f'proxies/hair/{A.hair}/textures/{A.hair}_diffuse.png'), None, True),
    ('eyebrows', os.path.join(AST, 'eyebrows/eyebrow001/eyebrow001.mhclo'), os.path.join(DATA, 'proxies/eyebrows/eyebrow001/textures/eyebrow001.png'), None, True),
    ('eyelashes', os.path.join(AST, 'eyelashes/eyelashes01/eyelashes01.mhclo'), os.path.join(DATA, 'proxies/eyelashes/Eyelashes01/textures/eyelashes01.png'), None, True),
    ('eyes', os.path.join(CORE, 'eyes/high-poly/high-poly.mhclo'), os.path.join(CORE, 'eyes/materials/brown_eye.png'), None, False),
]
for name, mh, diff, nrm, alpha in proxies:
    if not os.path.exists(mh): print('  missing', mh); continue
    d, P, vt, f, PJ, PW = fit(mh)
    deleted |= d['delete']
    parts.append((build_prim(name, P, vt, f, PJ, PW), dict(name=name, diff=diff, nrm=nrm, alpha=alpha)))
    print(' fitted', name, len(P), 'verts', len(d['delete']), 'body verts hidden')

# body: only the real skin (no helper/joint geometry), minus verts hidden under clothes
skin_png = None
for root, _, files in os.walk(os.path.join(DATA, 'skins')):
    if A.skin in files: skin_png = os.path.join(root, A.skin); break
body = build_prim('body', coords, base_vt, base_f, J, W, keep=lambda g, f: g == 'body' and not any(vi in deleted for vi, _ in f))
parts.insert(0, (body, dict(name='skin', diff=skin_png, nrm=None, alpha=False)))

# ---------------------------------------------------------------- units, grounding
S = 0.1  # dm -> m
miny = min(p['P'][:, 1].min() for p, _ in parts)
for p, _ in parts:
    p['P'] = ((p['P'] - [0, miny, 0]) * S).astype(np.float32)  # keep float32: the accessor declares FLOAT
head_m = (head - [0, miny, 0]) * S
tail_m = (tail - [0, miny, 0]) * S

# ---------------------------------------------------------------- glTF writer
bin_chunks, bviews, accs = [], [], []
def add_buf(arr, target=None):
    data = arr.tobytes(); off = sum(len(c) for c in bin_chunks)
    pad = (-len(data)) % 4
    bin_chunks.append(data + b'\0' * pad)
    bv = {'buffer': 0, 'byteOffset': off, 'byteLength': len(data)}
    if target: bv['target'] = target
    bviews.append(bv); return len(bviews) - 1
def add_acc(arr, ctype, typ, minmax=False, target=None):
    arr = np.ascontiguousarray(arr, {5126: np.float32, 5123: np.uint16, 5125: np.uint32}[ctype])  # bytes must match componentType
    a = {'bufferView': add_buf(arr, target), 'componentType': ctype, 'count': len(arr), 'type': typ}
    if minmax: a['min'] = arr.min(0).tolist(); a['max'] = arr.max(0).tolist()
    accs.append(a); return len(accs) - 1

nodes = []
for i, b in enumerate(order):
    par = bones[b]['parent']
    t = head_m[i] - (head_m[bidx[par]] if par else 0)
    nodes.append({'name': b.replace('.', ''), 'translation': [float(x) for x in t], 'children': []})
for i, b in enumerate(order):
    par = bones[b]['parent']
    if par: nodes[bidx[par]]['children'].append(i)
for n in nodes:
    if not n['children']: del n['children']
ibm = np.zeros((len(order), 16), np.float32)
for i in range(len(order)):
    m = np.eye(4, dtype=np.float32); m[:3, 3] = -head_m[i]
    ibm[i] = m.T.reshape(-1)
skin = {'joints': list(range(len(order))), 'inverseBindMatrices': add_acc(ibm, 5126, 'MAT4'), 'skeleton': 0}

images, textures, materials, meshes = [], [], [], []
def add_tex(path, alpha):
    if not path or not os.path.exists(path): return None
    data, mime = tex_png(path, A.texsize, alpha)
    images.append({'bufferView': add_buf(np.frombuffer(data, np.uint8)), 'mimeType': mime})
    textures.append({'source': len(images) - 1, 'sampler': 0}); return len(textures) - 1
prims = []
for p, m in parts:
    mat = {'name': m['name'], 'pbrMetallicRoughness': {'metallicFactor': 0.0, 'roughnessFactor': 0.62 if m['name'] == 'skin' else 0.85}, 'doubleSided': m['alpha']}
    ti = add_tex(m['diff'], m['alpha'])
    if ti is not None: mat['pbrMetallicRoughness']['baseColorTexture'] = {'index': ti}
    ni = add_tex(m['nrm'], False)
    if ni is not None: mat['normalTexture'] = {'index': ni}
    if m['alpha']: mat['alphaMode'] = 'MASK'; mat['alphaCutoff'] = 0.35
    if m['name'] == 'eyes': mat['pbrMetallicRoughness']['roughnessFactor'] = 0.08
    materials.append(mat)
    prims.append({'attributes': {
        'POSITION': add_acc(p['P'], 5126, 'VEC3', True, 34962), 'NORMAL': add_acc(p['N'], 5126, 'VEC3', target=34962),
        'TEXCOORD_0': add_acc(p['UV'], 5126, 'VEC2', target=34962), 'JOINTS_0': add_acc(p['J'], 5123, 'VEC4', target=34962),
        'WEIGHTS_0': add_acc(p['W'], 5126, 'VEC4', target=34962)},
        'indices': add_acc(p['T'].reshape(-1), 5125, 'SCALAR', target=34963), 'material': len(materials) - 1})
meshes.append({'name': 'human', 'primitives': prims})
nodes.append({'name': 'Human', 'mesh': 0, 'skin': 0})
mesh_node = len(nodes) - 1
gltf = {'asset': {'version': '2.0', 'generator': 'southbound build-human.py (MakeHuman CC0 assets)', 'copyright': 'MakeHuman assets CC0 1.0'},
        'scene': 0, 'scenes': [{'nodes': [0, mesh_node]}], 'nodes': nodes, 'meshes': meshes, 'skins': [skin],
        'accessors': accs, 'bufferViews': bviews, 'materials': materials, 'textures': textures, 'images': images,
        'samplers': [{'magFilter': 9729, 'minFilter': 9987, 'wrapS': 10497, 'wrapT': 10497}]}
binblob = b''.join(bin_chunks)
gltf['buffers'] = [{'byteLength': len(binblob)}]
js = json.dumps(gltf, separators=(',', ':')).encode(); js += b' ' * ((-len(js)) % 4)
with open(A.out, 'wb') as fo:
    fo.write(struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(binblob)))
    fo.write(struct.pack('<II', len(js), 0x4E4F534A)); fo.write(js)
    fo.write(struct.pack('<II', len(binblob), 0x004E4942)); fo.write(binblob)
height = max(p['P'][:, 1].max() for p, _ in parts)
print('wrote', A.out, f'{os.path.getsize(A.out) / 1e6:.1f} MB', 'height', round(float(height), 2), 'm', len(order), 'bones', sum(len(p['T']) for p, _ in parts), 'tris')
