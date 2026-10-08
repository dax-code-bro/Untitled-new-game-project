# One-time offline bake (Blender's Python module, bpy 4.2): the linen laid over the birthing
# chamber's nest, dropped as a cloth onto the straw bed inside its plank bedding frame, so its folds
# and the corner hanging over the frame's board come from a real cloth simulation.
#
#   <bpy python> scenes/lib/architecture/offline/nest_cloth.py [out.json]
#
# Writes scenes/lib/architecture/cache/nest_cloth.json (git-ignored): the cloth grid in the nest's
# local frame (y up, metres): { nx, ny, positions: [x, y, z, ...], bed: 2 } - interiors.js builds
# the linen from it when present (a procedural sheet otherwise). Round 2: the same bed as
# interiors.js nestBedY() - a plank frame (inner half sizes A 1.25 x B 1.0, boards' top 0.34) with
# a straw bed domed inside it, lumped (the straw under the sheet), the floor round it.
import sys, os, json, math
import bpy

A, B, TOP, BT = 1.25, 1.0, 0.34, 0.06


def bed(x, z):
    """Height of the straw bed (nest-local x, z; y up) - keep in step with interiors.js nestBedY."""
    sx, sz = x / A, z / B
    dome = 0.17 * max(0.0, 1 - sx * sx) * max(0.0, 1 - sz * sz)
    return 0.3 + dome + 0.018 * math.sin(x * 7.3 + 1.0) * math.sin(z * 6.1 + 0.5) + 0.01 * math.sin(x * 13.1 - z * 11.3 + 2.0)


out = sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else (sys.argv[1] if len(sys.argv) > 1 and sys.argv[1].endswith('.json') else None)
if not out:
    here = os.path.dirname(os.path.abspath(__file__))
    out = os.path.join(here, '..', 'cache', 'nest_cloth.json')
os.makedirs(os.path.dirname(out), exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene


def mesh_obj(name, verts, faces, up=True):
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.update()
    # collision faces must face the cloth (up / outward): fix the winding
    import bmesh
    bm = bmesh.new()
    bm.from_mesh(me)
    if up:
        for f in bm.faces:
            f.normal_update()
            if f.normal.z < -0.1:
                f.normal_flip()
    else:
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    me.update()
    ob = bpy.data.objects.new(name, me)
    scene.collection.objects.link(ob)
    return ob


# collision: the straw bed (a height field inside the frame; Blender z up, y = -z_nest), the four
# boards of the frame as boxes, the floor
N = 60
verts, faces = [], []
for j in range(N + 1):
    for i in range(N + 1):
        x = -A + 2 * A * i / N
        z = -B + 2 * B * j / N
        verts.append((x, -z, bed(x, z)))
for j in range(N):
    for i in range(N):
        a = j * (N + 1) + i
        faces.append((a, a + 1, a + N + 2, a + N + 1))
mound = mesh_obj('bed', verts, faces)


def box(name, cx, cz, sx, sz, h):
    x0, x1, z0, z1 = cx - sx / 2, cx + sx / 2, cz - sz / 2, cz + sz / 2
    v = [(x0, -z0, 0), (x1, -z0, 0), (x1, -z1, 0), (x0, -z1, 0), (x0, -z0, h), (x1, -z0, h), (x1, -z1, h), (x0, -z1, h)]
    f = [(0, 1, 2, 3), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    return mesh_obj(name, v, f, up=False)


boards = [box('bx0', -A - BT / 2, 0, BT, 2 * B + 2 * BT, TOP), box('bx1', A + BT / 2, 0, BT, 2 * B + 2 * BT, TOP),
          box('bz0', 0, -B - BT / 2, 2 * A, BT, TOP), box('bz1', 0, B + BT / 2, 2 * A, BT, TOP)]
floor = mesh_obj('floor', [(-5, -5, 0), (5, -5, 0), (5, 5, 0), (-5, 5, 0)], [(0, 1, 2, 3)])
for ob in (mound, floor, *boards):
    ob.modifiers.new('col', 'COLLISION')
    ob.collision.thickness_outer = 0.006
    ob.collision.cloth_friction = 8.0

# the cloth: a linen sheet 1.5 x 1.15 m laid over part of the bed (the straw shows round it),
# offset toward the stool side (+x) so one edge hangs over the frame's board, dropped from above
NX, NY = 60, 46
W, D = 1.5, 1.15
OX, OZ = 0.62, -0.12
verts, faces = [], []
for j in range(NY + 1):
    for i in range(NX + 1):
        x = (i / NX - 0.5) * W + OX
        z = (j / NY - 0.5) * D + OZ
        # a loose, slightly rucked sheet (laid by hand, not stretched)
        h = 0.78 + 0.03 * math.sin(i * 0.37) * math.cos(j * 0.29) + 0.02 * math.sin((i + j) * 0.21)
        verts.append((x, -z, h))
for j in range(NY):
    for i in range(NX):
        a = j * (NX + 1) + i
        faces.append((a, a + 1, a + NX + 2, a + NX + 1))
cloth = mesh_obj('linen', verts, faces)
cm = cloth.modifiers.new('cloth', 'CLOTH')
s = cm.settings
s.quality = 8
s.mass = 0.18
s.air_damping = 1.5
s.tension_stiffness = 18
s.compression_stiffness = 18
s.shear_stiffness = 6
s.bending_stiffness = 0.2
s.tension_damping = 8
s.compression_damping = 8
s.shear_damping = 8
cm.collision_settings.collision_quality = 4
cm.collision_settings.distance_min = 0.004
cm.collision_settings.use_self_collision = True
cm.collision_settings.self_distance_min = 0.004
cm.point_cache.frame_start = 1
cm.point_cache.frame_end = 160
scene.frame_start, scene.frame_end = 1, 160
for f in range(1, 161):
    scene.frame_set(f)
dg = bpy.context.evaluated_depsgraph_get()
ev = cloth.evaluated_get(dg)
me = ev.to_mesh()
pos = []
for v in me.vertices:
    x, y, z = v.co
    pos += [round(x, 5), round(z, 5), round(-y, 5)]       # Blender z-up -> y-up (x, z, -y)
ev.to_mesh_clear()
with open(out, 'w') as f:
    json.dump({'nx': NX, 'ny': NY, 'bed': 2, 'positions': pos, 'note': 'nest linen v2 (plank bedding frame), cloth sim (bpy), nest-local metres, y up'}, f)
print('wrote', out, len(pos) // 3, 'vertices')
