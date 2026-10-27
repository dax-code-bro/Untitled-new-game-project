"""Sculpted mouth shapes for the lip-sync: the CC0 MakeHuman expression unit TARGETS for the mouth
(assets-lib/human/mpfb_targets_expression: mouth-compression, mouth-pursing, ...) as morph targets on
an already built character's skin - written to a SIDECAR next to its cache (cache/<id>.mouth.json +
.bin), so the cache itself stays byte for byte as built (no rebuild, no cloth simulation).

The face pose units (face.js) turn bones; these targets carry what bones cannot: lips that press and
roll in for p / b / m, a real funnel for oo / w, the vermilion turning out. The runtime (loader.js)
adds them to the skin mesh when the sidecar exists; face.js drives them by name ('mouth-pursing', ...)
and visemes.js mixes them in. A character without a sidecar simply has none.

How: the build's own body construction is repeated (shape -> joints -> the character's pose ->
body_part with the targets as morph_rest -> pose_parts: the same subdivision, vertex order and drape
skinning as the cache), the posed body is checked against the cache's body positions (max error must
stay under 0.1 mm, else the sidecar is refused), and the posed morph deltas are stored sparsely
(vertices any unit moves by more than 1 micron).

    <bpy python> -I scenes/lib/humans/tools/mouthmorphs.py alexandria abby remi   [--units a,b] [--force]
    <bpy python> -I scenes/lib/humans/tools/mouthmorphs.py --all
"""
import argparse
import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
# (kept out of offline/: the PC kit hashes offline/*.py as the code that makes the character caches,
# and this script leaves those caches untouched - it must not mark every built character as stale)
OFFLINE = os.path.join(HERE, '..', 'offline')
sys.path.insert(0, OFFLINE)

import numpy as np  # noqa: E402

import mhcore as mc  # noqa: E402
from humanbuild import Kit, shape, body_part, pose_parts  # noqa: E402

UNITS = ['mouth-compression', 'mouth-pursing', 'mouth-protusion', 'mouth-eversion', 'mouth-retraction',
         'mouth-corner-puller', 'mouth-depression', 'mouth-elevation', 'mouth-parling']
CACHE = os.path.join(HERE, '..', 'cache')
LIB = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..', 'assets-lib'))


def log(*a):
    print(*a, flush=True)


def load_cache_body(cid):
    with open(os.path.join(CACHE, cid + '.json')) as f:
        h = json.load(f)
    body = next(m for m in h['meshes'] if m['kind'] == 'skin')
    d = body['attrs']['position']
    with open(os.path.join(CACHE, cid + '.bin'), 'rb') as f:
        f.seek(d['offset'])
        buf = f.read(d['count'] * 4)
    P = np.frombuffer(buf, dtype=np.float32).reshape(-1, 3)
    return h, body, P


def build_one(kit, spec, units, force=False):
    import build as B                              # the build's own pose helpers (make_pose, ground_offset)
    cid = spec['id']
    out_json = os.path.join(CACHE, cid + '.mouth.json')
    if os.path.exists(out_json) and not force:
        src = os.path.join(CACHE, cid + '.json')
        if os.path.getmtime(out_json) >= os.path.getmtime(src):
            log(f'{cid}: up to date')
            return True
    t0 = time.time()
    h, cbody, Pc = load_cache_body(cid)
    hero = spec.get('lod', 'mid') == 'hero'
    race = tuple(spec.get('macro', {}).get('race', (1 / 3, 1 / 3, 1 / 3)))
    V = shape(kit, spec)
    H, T = kit.rig.joints(V)
    sk = mc.Skeleton(kit.rig, H, T)
    sole = spec.get('sole', 0.012)
    pose = spec.get('pose', 'stand')
    pt = B.make_pose(sk, pose, spec.get('pose_params', {}))
    off_t = B.ride_offset(sk, pt.local) if pose.startswith('ride') else B.ground_offset(sk, pt.local, V, kit, sole)
    morph = {}
    for u in units:
        idx, d = mc.expression_target(kit.tl, u, race)
        m = np.zeros((kit.N, 3))
        if len(idx):
            m[idx] = d
        morph[u] = m
    body = body_part(kit, V, subdiv=1 if hero else 0, morph_rest=morph)
    pose_parts(sk, pt.local, [body], off_t)
    if body.posed.shape != Pc.shape:
        log(f'{cid}: REFUSED - rebuilt body has {len(body.posed)} vertices, the cache {len(Pc)}')
        return False
    err = float(np.abs(body.posed - Pc).max())
    if err > 1e-4:
        log(f'{cid}: REFUSED - rebuilt body differs from the cache by {err * 1000:.2f} mm (rebuild the character first)')
        return False
    D = np.stack([body.posed_morphs[u] for u in units], 0).astype(np.float32)     # (U, N, 3)
    mag = np.abs(D).max(axis=(0, 2))
    idx = np.where(mag > 1e-6)[0].astype(np.uint32)
    deltas = D[:, idx, :]                                                           # (U, K, 3)
    with open(os.path.join(CACHE, cid + '.mouth.bin'), 'wb') as f:
        f.write(idx.tobytes())
        f.write(np.ascontiguousarray(deltas).tobytes())
    meta = {
        'id': cid, 'mesh': cbody['name'], 'vertexCount': int(len(Pc)), 'units': units, 'count': int(len(idx)),
        'index': {'offset': 0, 'type': 'u32', 'count': int(len(idx))},
        'deltas': {'offset': int(idx.nbytes), 'type': 'f32', 'count': int(deltas.size), 'layout': 'unit, vertex, xyz'},
        'maxDelta': {u: float(np.linalg.norm(D[k], axis=1).max()) for k, u in enumerate(units)},
        # positionSum: the runtime refuses the sidecar when the cache's skin no longer matches it
        'check': {'maxPositionError_m': err, 'positionSum': float(np.abs(Pc.astype(np.float64)).sum())},
        'source': 'CC0 MakeHuman / MPFB2 expression unit targets (assets-lib/human/mpfb_targets_expression), race-blended like the build',
        'license': 'CC0',
    }
    with open(out_json, 'w') as f:
        json.dump(meta, f, indent=1)
    log(f'{cid}: {len(idx)} vertices x {len(units)} units, check {err * 1000:.3f} mm, '
        + ', '.join(f'{u} {meta["maxDelta"][u] * 1000:.1f} mm' for u in units) + f'  ({time.time() - t0:.0f} s)')
    return True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('ids', nargs='*')
    ap.add_argument('--all', action='store_true')
    ap.add_argument('--units', default=','.join(UNITS))
    ap.add_argument('--force', action='store_true')
    a = ap.parse_args()
    import characters
    cast = {c['id']: c for c in characters.cast()}
    ids = [i for i in cast if os.path.exists(os.path.join(CACHE, i + '.json'))] if a.all else a.ids
    kit = Kit(LIB)
    kit.I_all, kit.W_all = mc.topk(kit.Wd, 4)
    import garments as gm                          # (bone categories for the build's ground offset)
    kit.base_cat = np.array([gm.bone_category(kit.rig.names[b]) for b in np.argmax(kit.Wd, axis=1)])
    units = [u for u in a.units.split(',') if u]
    fails = []
    for cid in ids:
        if cid not in cast:
            log(f'{cid}: not in the cast')
            fails.append(cid)
            continue
        if not build_one(kit, cast[cid], units, a.force):
            fails.append(cid)
    write_index()
    if fails:
        log('FAILED: ' + ', '.join(fails))
        sys.exit(1)


def write_index():
    """cache/mouth-index.json: the ids that have a sidecar (the runtime asks for no other id's sidecar,
    so characters without one do not log a 404 per load in the browser)."""
    ids = sorted(f[:-len('.mouth.json')] for f in os.listdir(CACHE) if f.endswith('.mouth.json'))
    with open(os.path.join(CACHE, 'mouth-index.json'), 'w') as f:
        json.dump({'ids': ids, 'note': 'written by scenes/lib/humans/tools/mouthmorphs.py'}, f, indent=1)
    log(f'mouth-index.json: {len(ids)} characters with mouth shapes')


if __name__ == '__main__':
    main()
