"""
Turn a raw photogrammetry scan into a game-ready asset (glTF .glb with LODs).

Steps:
  1. import the raw scan (.obj / .ply / .glb / .gltf / .fbx)
  2. clean it: weld vertices, drop floating debris, remove loose geometry
  3. put it on the ground at the origin and scale it to a real-world height
  4. LOD0: decimate, re-UV, bake base color + normal map from the full-res scan
  5. LOD1..n: decimate LOD0 further (they share LOD0's textures)
  6. export <name>.glb with nodes <name>_LOD0, <name>_LOD1, ... and write <name>.json
  7. optionally register the asset in the game's asset manifest

Run with the Blender binary:
  blender -b -P process_scan.py -- --input scan.obj --name rock_01 --out ../assets/scans/rock_01 --height 1.4 --slot rock
or with the `bpy` Python module (pip install bpy):
  python process_scan.py --input scan.obj --name rock_01 --out ../assets/scans/rock_01 --height 1.4 --slot rock
"""
import argparse
import json
import math
import os
import sys
import time

import bpy
import bmesh  # must come after bpy when using the pip bpy module


def parse_args():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
    p = argparse.ArgumentParser(description='Photogrammetry scan -> game-ready glTF with LODs')
    p.add_argument('--input', required=True, help='raw scan file (.obj .ply .glb .gltf .fbx)')
    p.add_argument('--name', required=True, help='asset id, e.g. rock_01 (letters, digits, underscore)')
    p.add_argument('--out', required=True, help='output directory')
    p.add_argument('--height', type=float, default=0.0, help='real-world height in meters (0 = keep scan scale)')
    p.add_argument('--lods', default='20000,5000,1200', help='triangle budget per LOD, highest first')
    p.add_argument('--lod-distances', default='0,25,70', help='camera distance (m) at which each LOD kicks in')
    p.add_argument('--tex', type=int, default=2048, help='baked texture resolution')
    p.add_argument('--samples', type=int, default=4, help='Cycles samples for baking')
    p.add_argument('--keep-fraction', type=float, default=0.05,
                   help='drop disconnected pieces with fewer verts than this fraction of the largest piece')
    p.add_argument('--up', default='Y', choices=['Y', 'Z'], help='up axis of the raw scan (OBJ/PLY only)')
    p.add_argument('--slot', default='', help='what the game uses it for: rock, tree, car, crate, barrier, prop ...')
    p.add_argument('--manifest', default='', help='path to the game asset manifest (assets.json) to register into')
    p.add_argument('--license', default='own-scan', help='license of the source data (own-scan, CC0, CC-BY-4.0 ...)')
    p.add_argument('--author', default='', help='author / attribution')
    return p.parse_args(argv)


def log(msg):
    print(f'[process_scan] {msg}', flush=True)


def tri_count(obj):
    return sum(len(p.vertices) - 2 for p in obj.data.polygons)


def select_only(*objs):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[-1]


def import_scan(path, up):
    ext = os.path.splitext(path)[1].lower()
    if ext == '.obj':
        bpy.ops.wm.obj_import(filepath=path, up_axis=up, forward_axis='NEGATIVE_Z' if up == 'Y' else 'Y')
    elif ext == '.ply':
        bpy.ops.wm.ply_import(filepath=path, up_axis=up, forward_axis='NEGATIVE_Z' if up == 'Y' else 'Y')
    elif ext in ('.glb', '.gltf'):
        bpy.ops.import_scene.gltf(filepath=path)
    elif ext == '.fbx':
        bpy.ops.import_scene.fbx(filepath=path)
    else:
        raise SystemExit(f'unsupported input format: {ext}')
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    if not meshes:
        raise SystemExit('no mesh found in input')
    select_only(*meshes)
    if len(meshes) > 1:
        bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active
    obj.parent = None
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    obj.name = 'HIGH'
    return obj


def clean(obj, keep_fraction):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    # connected components; photogrammetry leaves floating debris around the subject
    bm.verts.ensure_lookup_table()
    comp = [-1] * len(bm.verts)
    sizes = []
    for v in bm.verts:
        if comp[v.index] != -1:
            continue
        cid = len(sizes)
        stack = [v]
        comp[v.index] = cid
        n = 0
        while stack:
            cur = stack.pop()
            n += 1
            for e in cur.link_edges:
                o = e.other_vert(cur)
                if comp[o.index] == -1:
                    comp[o.index] = cid
                    stack.append(o)
        sizes.append(n)
    biggest = max(sizes) if sizes else 0
    drop = [v for v in bm.verts if sizes[comp[v.index]] < biggest * keep_fraction]
    loose = [v for v in bm.verts if not v.link_faces]
    kill = list({*drop, *loose})
    if kill:
        bmesh.ops.delete(bm, geom=kill, context='VERTS')
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()
    log(f'cleanup: {len(sizes)} pieces, removed {len(drop)} debris verts, {len(loose)} loose verts')


def normalize(obj, height):
    xs = [v.co.x for v in obj.data.vertices]
    ys = [v.co.y for v in obj.data.vertices]
    zs = [v.co.z for v in obj.data.vertices]
    cx, cy, minz = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2, min(zs)
    h = max(zs) - minz
    s = height / h if height > 0 and h > 0 else 1.0
    for v in obj.data.vertices:
        v.co.x = (v.co.x - cx) * s
        v.co.y = (v.co.y - cy) * s
        v.co.z = (v.co.z - minz) * s
    obj.data.update()
    size = ((max(xs) - min(xs)) * s, (max(ys) - min(ys)) * s, h * s)
    log(f'normalized: scale x{s:.4f}, size {size[0]:.2f} x {size[1]:.2f} x {size[2]:.2f} m (Blender X,Y,Z)')
    return size


def ensure_vertex_color_material(obj):
    """Scans that only carry vertex colors (common for PLY) need a material that reads them for baking."""
    has_image = any(
        n.type == 'TEX_IMAGE' and n.image
        for m in obj.data.materials if m and m.node_tree for n in m.node_tree.nodes
    )
    if has_image or not obj.data.color_attributes:
        return
    mat = bpy.data.materials.new('HIGH_vcol')
    if bpy.app.version < (5, 0, 0):
        mat.use_nodes = True  # always on (and deprecated) from Blender 5
    nt = mat.node_tree
    bsdf = nt.nodes.get('Principled BSDF')
    attr = nt.nodes.new('ShaderNodeVertexColor')
    attr.layer_name = obj.data.color_attributes[0].name
    nt.links.new(attr.outputs['Color'], bsdf.inputs['Base Color'])
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    log('using vertex colors as the base color source')


def duplicate(obj, name):
    dup = obj.copy()
    dup.data = obj.data.copy()
    dup.name = name
    dup.data.name = name
    bpy.context.scene.collection.objects.link(dup)
    return dup


def decimate(obj, target):
    cur = tri_count(obj)
    if cur <= target:
        return
    select_only(obj)
    mod = obj.modifiers.new('decimate', 'DECIMATE')
    mod.decimate_type = 'COLLAPSE'
    mod.ratio = target / cur
    mod.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier=mod.name)


def unwrap(obj):
    select_only(obj)
    while obj.data.uv_layers:
        obj.data.uv_layers.remove(obj.data.uv_layers[0])
    obj.data.uv_layers.new(name='UVMap')
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.004)
    bpy.ops.object.mode_set(mode='OBJECT')


def make_target_material(obj, name, tex):
    col = bpy.data.images.new(f'{name}_basecolor', tex, tex, alpha=False)
    nrm = bpy.data.images.new(f'{name}_normal', tex, tex, alpha=False)
    nrm.colorspace_settings.name = 'Non-Color'
    mat = bpy.data.materials.new(f'{name}_mat')
    if bpy.app.version < (5, 0, 0):
        mat.use_nodes = True  # always on (and deprecated) from Blender 5
    nt = mat.node_tree
    bsdf = nt.nodes.get('Principled BSDF')
    bsdf.inputs['Roughness'].default_value = 0.85
    t_col = nt.nodes.new('ShaderNodeTexImage')
    t_col.image = col
    t_nrm = nt.nodes.new('ShaderNodeTexImage')
    t_nrm.image = nrm
    nmap = nt.nodes.new('ShaderNodeNormalMap')
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    return mat, t_col, t_nrm, nmap, bsdf


def bake(high, low, node, kind, extrusion, samples):
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = samples
    low.active_material.node_tree.nodes.active = node
    select_only(high, low)
    t = time.time()
    if kind == 'NORMAL':
        bpy.ops.object.bake(type='NORMAL', normal_space='TANGENT', use_selected_to_active=True,
                            cage_extrusion=extrusion, max_ray_distance=extrusion * 4, margin=16)
    else:
        bpy.ops.object.bake(type='DIFFUSE', pass_filter={'COLOR'}, use_selected_to_active=True,
                            cage_extrusion=extrusion, max_ray_distance=extrusion * 4, margin=16)
    log(f'baked {kind.lower()} in {time.time() - t:.1f}s')


def register(manifest_path, entry):
    data = {'assets': []}
    if os.path.exists(manifest_path):
        with open(manifest_path) as f:
            data = json.load(f)
    data['assets'] = [a for a in data.get('assets', []) if a['id'] != entry['id']] + [entry]
    data['assets'].sort(key=lambda a: a['id'])
    with open(manifest_path, 'w') as f:
        json.dump(data, f, indent=2)
        f.write('\n')
    log(f'registered {entry["id"]} in {manifest_path}')


def main():
    a = parse_args()
    if not a.name.replace('_', '').isalnum():
        raise SystemExit('--name must be letters, digits and underscores')
    lods = [int(x) for x in a.lods.split(',')]
    dists = [float(x) for x in a.lod_distances.split(',')]
    if len(dists) != len(lods):
        raise SystemExit('--lods and --lod-distances must have the same number of entries')
    os.makedirs(a.out, exist_ok=True)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    t0 = time.time()
    high = import_scan(os.path.abspath(a.input), a.up)
    log(f'imported {a.input}: {tri_count(high):,} triangles')
    clean(high, a.keep_fraction)
    size = normalize(high, a.height)
    ensure_vertex_color_material(high)

    # LOD0 with freshly baked textures
    lod0 = duplicate(high, f'{a.name}_LOD0')
    decimate(lod0, lods[0])
    unwrap(lod0)
    mat, t_col, t_nrm, nmap, bsdf = make_target_material(lod0, a.name, a.tex)
    extrusion = max(size) * 0.015
    bake(high, lod0, t_col, 'DIFFUSE', extrusion, a.samples)
    bake(high, lod0, t_nrm, 'NORMAL', extrusion, a.samples)
    nt = mat.node_tree
    nt.links.new(t_col.outputs['Color'], bsdf.inputs['Base Color'])
    nt.links.new(t_nrm.outputs['Color'], nmap.inputs['Color'])
    nt.links.new(nmap.outputs['Normal'], bsdf.inputs['Normal'])
    for img in (t_col.image, t_nrm.image):
        img.filepath_raw = os.path.join(os.path.abspath(a.out), f'{img.name}.png')
        img.file_format = 'PNG'
        img.save()

    # lower LODs share LOD0's UVs and textures
    objs = [lod0]
    for i, target in enumerate(lods[1:], start=1):
        o = duplicate(lod0, f'{a.name}_LOD{i}')
        decimate(o, target)
        objs.append(o)

    bpy.data.objects.remove(high, do_unlink=True)
    for o in objs:
        bpy.ops.object.select_all(action='DESELECT')
        o.select_set(True)
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.shade_smooth()
    select_only(*objs)
    glb = os.path.join(a.out, f'{a.name}.glb')
    bpy.ops.export_scene.gltf(filepath=glb, export_format='GLB', use_selection=True, export_apply=True,
                              export_yup=True, export_materials='EXPORT', export_image_format='AUTO')

    entry = {
        'id': a.name,
        'slot': a.slot or 'prop',
        'file': os.path.basename(glb),
        # glTF is Y-up: width (x), height (y), depth (z) in meters
        'size': [round(size[0], 3), round(size[2], 3), round(size[1], 3)],
        'lods': [{'node': o.name, 'tris': tri_count(o), 'distance': d} for o, d in zip(objs, dists)],
        'texture': a.tex,
        'license': a.license,
        'author': a.author,
        'source': os.path.basename(a.input),
    }
    with open(os.path.join(a.out, f'{a.name}.json'), 'w') as f:
        json.dump(entry, f, indent=2)
        f.write('\n')
    if a.manifest:
        man_dir = os.path.dirname(os.path.abspath(a.manifest))
        reg = dict(entry)
        reg['file'] = os.path.relpath(os.path.abspath(glb), man_dir).replace(os.sep, '/')
        register(a.manifest, reg)
    log(f'done in {time.time() - t0:.1f}s -> {glb} ({os.path.getsize(glb) / 1e6:.1f} MB)')
    for l in entry['lods']:
        log(f'  {l["node"]}: {l["tris"]:,} tris (from {l["distance"]} m)')


if __name__ == '__main__':
    main()
