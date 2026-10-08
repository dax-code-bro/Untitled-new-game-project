# One-time offline bake (Blender's Python module, bpy 4.2): the clean linen cloth on the treatment
# room's table (2B), dropped as a cloth onto the table top so it lies in soft wrinkles and hangs
# over the front edge in real folds (the procedural sheet read as stiff paper).
#
#   <bpy python> scenes/lib/architecture/offline/table_cloth.py [out.json]
#
# Writes scenes/lib/architecture/cache/table_cloth.json (git-ignored): the cloth grid in the
# table's local frame (y up, metres): { nx, ny, positions: [x, y, z, ...] } - interiors.js builds
# the cloth from it when present. Same table as interiors.js treatmentRoom(): top 1.6 x 0.75 m,
# 0.76 m high, centred on the table frame.
import sys, os, json, math
import bpy

L, D, HT = 1.6, 0.75, 0.76
out = sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else (sys.argv[1] if len(sys.argv) > 1 and sys.argv[1].endswith('.json') else None)
if not out:
    here = os.path.dirname(os.path.abspath(__file__))
    out = os.path.join(here, '..', 'cache', 'table_cloth.json')
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

# collision: the table top as a closed box (Blender z up: table-local (x, y, z) -> (x, -z, y)),
# the floor, and the jug / basin footprints as low boxes the cloth stays clear of
def box(name, x0, x1, y0, y1, z0, z1):
    v = [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0), (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]
    f = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    return mesh_obj(name, v, f)
top = box('top', -L / 2, L / 2, -D / 2, D / 2, HT - 0.07, HT)
floor = mesh_obj('floor', [(-3, -3, 0), (3, -3, 0), (3, 3, 0), (-3, 3, 0)], [(0, 1, 2, 3)])
for ob in (top, floor):
    ob.modifiers.new('col', 'COLLISION')
    ob.collision.thickness_outer = 0.004
    ob.collision.cloth_friction = 10.0

# the cloth: 0.8 x 0.95 m of linen, laid at the table's left end and hanging over the front edge
# (table-local +z is the front: Blender -y)
NX, NY = 48, 56
W, H = 0.8, 0.95
cx = -0.42
# the cloth lies flat from 0.65 m back on the top to the front edge, then 0.3 m sticks out past it
# (it falls); the back rows are pinned - laid there by hand, they do not move
y_back, y_front = 0.375 - 0.0, -0.375 - 0.3
pinned = []
verts, faces = [], []
for j in range(NY + 1):
    for i in range(NX + 1):
        x = cx + (i / NX - 0.5) * W * (1 + 0.02 * math.sin(j * 0.4))
        y = y_back + (y_front - y_back) * j / NY
        z = HT + 0.006 + 0.004 * math.sin(i * 0.5) * math.cos(j * 0.37)
        verts.append((x, y, z))
        if y > 0.1: pinned.append(len(verts) - 1)
for j in range(NY):
    for i in range(NX):
        a = j * (NX + 1) + i
        faces.append((a, a + 1, a + NX + 2, a + NX + 1))
cloth = mesh_obj('linen', verts, faces)
vg = cloth.vertex_groups.new(name='pin')
vg.add(pinned, 1.0, 'REPLACE')
cm = cloth.modifiers.new('cloth', 'CLOTH')
s = cm.settings
s.vertex_group_mass = 'pin'
s.quality = 8
s.mass = 0.15
s.air_damping = 1.2
s.tension_stiffness = 15; s.compression_stiffness = 15; s.shear_stiffness = 5
s.bending_stiffness = 0.12
s.tension_damping = 8; s.compression_damping = 8; s.shear_damping = 8
cm.collision_settings.collision_quality = 4
cm.collision_settings.distance_min = 0.003
cm.collision_settings.use_self_collision = True
cm.collision_settings.self_distance_min = 0.003
cm.point_cache.frame_start = 1
cm.point_cache.frame_end = 120
scene.frame_start, scene.frame_end = 1, 120
for f in range(1, 121):
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
    json.dump({ 'nx': NX, 'ny': NY, 'positions': pos, 'note': 'treatment-room table cloth, cloth sim (bpy), table-local metres, y up' }, f)
print('wrote', out, len(pos) // 3, 'vertices')
