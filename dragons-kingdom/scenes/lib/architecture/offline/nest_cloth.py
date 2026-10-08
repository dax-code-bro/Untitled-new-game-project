# One-time offline bake (Blender's Python module, bpy 4.2): the linen laid over the birthing
# chamber's nest, dropped as a cloth onto the straw mound and the stone curb so its folds and
# the corner hanging over the curb come from a real cloth simulation.
#
#   <bpy python> scenes/lib/architecture/offline/nest_cloth.py [out.json]
#
# Writes scenes/lib/architecture/cache/nest_cloth.json (git-ignored): the cloth grid in the nest's
# local frame (y up, metres): { nx, ny, positions: [x, y, z, ...] } - interiors.js builds the
# linen from it when present (procedural sheet otherwise). Same shapes as interiors.js nest():
# curb radius 1.25, height 0.34, mound top 0.85 * 0.34 + 0.12.
import sys, os, json, math
import bpy

R, CH = 1.25, 0.34
out = sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else (sys.argv[1] if len(sys.argv) > 1 and sys.argv[1].endswith('.json') else None)
if not out:
    here = os.path.dirname(os.path.abspath(__file__))
    out = os.path.join(here, '..', 'cache', 'nest_cloth.json')
os.makedirs(os.path.dirname(out), exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

def mesh_obj(name, verts, faces):
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.update()
    ob = bpy.data.objects.new(name, me)
    scene.collection.objects.link(ob)
    return ob

# collision: the straw mound (Blender z up) + the curb ring + the floor
N = 48
verts, faces = [], []
for j in range(N + 1):
    r = (R - 0.08) * j / N
    for i in range(N):
        a = 2 * math.pi * i / N
        dome = CH * 0.85 + 0.12 * (1 - (r / R) ** 2) + 0.025 * math.sin(a * 5 + r * 9) * (r / R)
        verts.append((math.cos(a) * r, math.sin(a) * r, dome))
for j in range(N):
    for i in range(N):
        a, b = j * N + i, j * N + (i + 1) % N
        c, d = (j + 1) * N + (i + 1) % N, (j + 1) * N + i
        faces.append((a, b, c, d))
mound = mesh_obj('mound', verts, faces)
verts, faces = [], []
for k, (rr, zz) in enumerate([(R - 0.13, CH * 0.85), (R - 0.13, CH + 0.02), (R + 0.13, CH + 0.02), (R + 0.13, 0.0)]):
    for i in range(N):
        a = 2 * math.pi * i / N
        verts.append((math.cos(a) * rr, math.sin(a) * rr, zz))
for k in range(3):
    for i in range(N):
        a, b = k * N + i, k * N + (i + 1) % N
        faces.append((a, b, (k + 1) * N + (i + 1) % N, (k + 1) * N + i))
curb = mesh_obj('curb', verts, faces)
floor = mesh_obj('floor', [(-4, -4, 0), (4, -4, 0), (4, 4, 0), (-4, 4, 0)], [(0, 1, 2, 3)])
for ob in (mound, curb, floor):
    m = ob.modifiers.new('col', 'COLLISION')
    ob.collision.thickness_outer = 0.006
    ob.collision.cloth_friction = 8.0

# the cloth: linen 2.0 x 1.6 m, offset toward the stool side, dropped from above
NX, NY = 64, 52
W, D = 2.0, 1.6
verts, faces = [], []
for j in range(NY + 1):
    for i in range(NX + 1):
        x = (i / NX - 0.5) * W + 0.25
        y = (j / NY - 0.5) * D - 0.1
        # a loose, slightly rucked sheet (laid by hand, not stretched)
        z = 0.75 + 0.03 * math.sin(i * 0.37) * math.cos(j * 0.29) + 0.02 * math.sin((i + j) * 0.21)
        verts.append((x, y, z))
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
s.bending_stiffness = 0.25
s.tension_damping = 8; s.compression_damping = 8; s.shear_damping = 8
cm.collision_settings.collision_quality = 4
cm.collision_settings.distance_min = 0.004
cm.collision_settings.use_self_collision = True
cm.collision_settings.self_distance_min = 0.004
cm.point_cache.frame_start = 1
cm.point_cache.frame_end = 140
scene.frame_start, scene.frame_end = 1, 140
for f in range(1, 141):
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
    json.dump({ 'nx': NX, 'ny': NY, 'positions': pos, 'note': 'nest linen, cloth sim (bpy), nest-local metres, y up' }, f)
print('wrote', out, len(pos) // 3, 'vertices')
