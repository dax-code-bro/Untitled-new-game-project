"""
Generates a fake "raw photogrammetry scan" for testing the pipeline without a camera:
a dense, lumpy, textured rock (~80k tris) in arbitrary units, plus floating debris
like a real reconstruction leaves behind. Writes an OBJ + MTL + texture.

  python make_test_scan.py --out /tmp/raw_rock
  blender -b -P make_test_scan.py -- --out /tmp/raw_rock
"""
import argparse
import math
import os
import random
import sys

import bpy
from mathutils import Vector, noise


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
    p = argparse.ArgumentParser()
    p.add_argument('--out', required=True)
    p.add_argument('--seed', type=int, default=4)
    a = p.parse_args(argv)
    os.makedirs(a.out, exist_ok=True)
    random.seed(a.seed)
    bpy.ops.wm.read_factory_settings(use_empty=True)

    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=7, radius=10)  # "scan units", not meters
    rock = bpy.context.active_object
    off = Vector((a.seed * 3.1, 1.7, 0.3))
    for v in rock.data.vertices:
        d = v.co.normalized()
        n = noise.fractal(d * 1.3 + off, 0.6, 2.1, 5) * 3.2 + noise.noise(d * 9 + off) * 0.35
        v.co = d * (10 + n)
        v.co.z *= 0.62
        v.co.x *= 1.25
    # flat-ish bottom, as if resting on the ground
    for v in rock.data.vertices:
        if v.co.z < -3.5:
            v.co.z = -3.5 + (v.co.z + 3.5) * 0.08

    # spherical UVs for the "photo" texture
    uv = rock.data.uv_layers.new(name='UVMap')
    for loop in rock.data.loops:
        co = rock.data.vertices[loop.vertex_index].co
        uv.data[loop.index].uv = (math.atan2(co.y, co.x) / (2 * math.pi) + 0.5, co.z / 14 + 0.5)

    # a "photo" texture: grey-brown stone with darker cracks and lichen patches
    S = 512
    img = bpy.data.images.new('raw_rock_tex', S, S, alpha=False)
    px = [0.0] * (S * S * 4)
    for j in range(S):
        for i in range(S):
            q = Vector((i / S * 8, j / S * 8, 0.5))
            base = 0.42 + noise.fractal(q, 0.5, 2.0, 4) * 0.12
            crack = max(0.0, 1 - abs(noise.noise(q * 2.3)) * 9) * 0.25
            lichen = max(0.0, noise.noise(q * 0.9 + Vector((5, 5, 5))) - 0.25) * 1.4
            r = base - crack + lichen * 0.18
            g = base * 0.95 - crack + lichen * 0.24
            b = base * 0.86 - crack + lichen * 0.05
            k = (j * S + i) * 4
            px[k:k + 4] = (max(r, 0), max(g, 0), max(b, 0), 1.0)
    img.pixels.foreach_set(px)
    img.filepath_raw = os.path.join(a.out, 'raw_rock_tex.png')
    img.file_format = 'PNG'
    img.save()

    mat = bpy.data.materials.new('raw_rock_mat')
    if bpy.app.version < (5, 0, 0):
        mat.use_nodes = True  # always on (and deprecated) from Blender 5
    tex = mat.node_tree.nodes.new('ShaderNodeTexImage')
    tex.image = img
    mat.node_tree.links.new(tex.outputs['Color'], mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'])
    rock.data.materials.append(mat)

    # floating debris (what the cleanup step must remove)
    for _ in range(25):
        loc = Vector((random.uniform(-25, 25), random.uniform(-25, 25), random.uniform(-4, 12)))
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=random.uniform(0.1, 0.6), location=loc)
        bpy.context.active_object.data.materials.append(mat)

    for o in bpy.context.scene.objects:
        o.select_set(True)
    path = os.path.join(a.out, 'raw_rock.obj')
    bpy.ops.wm.obj_export(filepath=path, export_materials=True, path_mode='RELATIVE')
    tris = sum(len(p.vertices) - 2 for p in rock.data.polygons)
    print(f'[make_test_scan] wrote {path} ({tris:,} tris + debris)')


if __name__ == '__main__':
    main()
