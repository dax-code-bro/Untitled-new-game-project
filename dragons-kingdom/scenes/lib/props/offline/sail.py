# One-time offline bake (Blender's Python module, bpy 4.2): square wool sails filled by the wind.
#
#   <bpy python> scenes/lib/props/offline/sail.py [--only NAME]
#
# A cloth simulation of a sewn square sail: the head laced to the yard at its robands (pinned
# points with slack between them, so the head puckers), the two clews held by the sheets
# (pinned a little inboard and downwind of the yard's plane, so the cloth has the slack to
# belly), the leeches (side edges) free; a steady wind pushes the cloth into its belly. The
# result is the shape a real square sail takes - deepest in the lower middle, flatter at the
# head, tension lines from each clew toward the yard arms, a slack foot - which an analytic
# surface never gets right.
#
# Writes scenes/lib/props/cache/sail_<name>.json (git-ignored): { nx, ny, w, h, positions }
# in the sail's local frame (metres): x across (port -> starboard as seen from astern), y up
# (0 = the yard), z downwind (the belly bulges toward +z). boat.js builds the sail from it.
import sys, os, json, math
import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, '..', 'cache')
os.makedirs(CACHE, exist_ok=True)

# name: head width, foot width, depth (head to foot), clew inset, clew lift, clew downwind,
#       wind strength, frames, roband spacing (m)
VARIANTS = {
    # the prologue boat, running free on a broad reach: a full, deep sail
    'prologue_full': dict(wh=6.2, wf=6.8, h=5.0, inset=1.0, lift=0.6, down=0.9, wind=80.0, frames=110, roband=0.42, sheetAsym=0.25),
    # the same sail with the wind lighter / just spilling: shallower, the leeches shake
    'prologue_eased': dict(wh=6.2, wf=6.8, h=5.0, inset=0.35, lift=0.2, down=0.3, wind=22.0, frames=110, roband=0.42, sheetAsym=0.4),
}

only = None
if '--only' in sys.argv:
    only = sys.argv[sys.argv.index('--only') + 1]


def bake(name, p):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.gravity = (0, 0, -9.81)
    NX, NY = 62, 52
    W0, W1, H = p['wh'], p['wf'], p['h']
    verts, flat, faces, pins = [], [], [], []
    # Blender frame: x across, y downwind, z up (the yard at z = 0, the foot at z = -H).
    # The rest shape (spring lengths) is the flat sail ('flat' shape key); the start shape has the
    # two clews already at their sheeted positions - inboard, lifted and downwind - blended
    # smoothly into the cloth, so the pinned clews hold there and the cloth has slack to belly.
    for j in range(NY + 1):
        v = j / NY                       # 0 head .. 1 foot
        w = W0 + (W1 - W0) * v
        for i in range(NX + 1):
            u = i / NX
            x = (u - 0.5) * w
            z = -v * H
            flat.append((x, 0.0, z))
            wv = v * v
            dx = dy = dz = 0.0
            for side, wu in ((-1, (1 - u) ** 2), (1, u ** 2)):
                asym = p['sheetAsym'] * side
                k = wv * wu
                dx += -side * p['inset'] * k
                dy += p['down'] * (1 + asym) * k
                dz += p['lift'] * (1 - 0.5 * asym) * k
            verts.append((x + dx, dy + 0.002 * math.sin(i * 1.7 + j), z + dz))
            idx = len(verts) - 1
            if j == 0:
                # robands: lashed to the yard every ~0.42 m; the cloth between them is free
                k2 = round(x / p['roband'])
                if abs(x - k2 * p['roband']) < (w / NX) * 0.51 or i in (0, NX):
                    pins.append(idx)
    c0 = NY * (NX + 1)
    c1 = c0 + NX
    pins += [c0, c1, c0 + 1, c1 - 1, c0 - (NX + 1), c1 - (NX + 1)]      # the clews (cringles + a little of the leech)
    for j in range(NY):
        for i in range(NX):
            a = j * (NX + 1) + i
            faces.append((a, a + 1, a + NX + 2, a + NX + 1))
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.update()
    ob = bpy.data.objects.new(name, me)
    scene.collection.objects.link(ob)
    ob.shape_key_add(name='Basis')
    sk = ob.shape_key_add(name='flat')
    for k, co in enumerate(flat):
        sk.data[k].co = co
    sk.value = 0.0
    vg = ob.vertex_groups.new(name='pin')
    vg.add(pins, 1.0, 'REPLACE')
    cm = ob.modifiers.new('cloth', 'CLOTH')
    s = cm.settings
    s.vertex_group_mass = 'pin'
    s.rest_shape_key = sk
    s.quality = 7
    s.mass = 0.012                         # heavy wool canvas, ~0.55 kg/m2 over this grid
    s.air_damping = 2.0
    s.tension_stiffness = 60; s.compression_stiffness = 60; s.shear_stiffness = 30
    s.bending_stiffness = 0.6
    s.tension_damping = 10; s.compression_damping = 10; s.shear_damping = 10
    cm.collision_settings.use_collision = False
    cm.point_cache.frame_start = 1
    cm.point_cache.frame_end = p['frames']
    scene.frame_start, scene.frame_end = 1, p['frames']
    # the wind: blows along +y (downwind), steady, with a little turbulence
    bpy.ops.object.effector_add(type='WIND', location=(0, -6, -H / 2))
    wind = bpy.context.active_object
    wind.rotation_euler = (math.radians(-90), 0, 0)      # field axis (local +z) -> world +y
    wind.field.strength = p['wind']
    wind.field.flow = 0.0
    wind.field.noise = 0.0
    wind.field.shape = 'PLANE'
    for f in range(1, p['frames'] + 1):
        scene.frame_set(f)
    dg = bpy.context.evaluated_depsgraph_get()
    ev = ob.evaluated_get(dg)
    m2 = ev.to_mesh()
    pos = []
    for vtx in m2.vertices:
        x, y, z = vtx.co
        pos += [round(x, 4), round(z, 4), round(y, 4)]        # -> x across, y up, z downwind
    ev.to_mesh_clear()
    out = os.path.join(CACHE, f'sail_{name}.json')
    with open(out, 'w') as f:
        json.dump({'nx': NX, 'ny': NY, 'wHead': W0, 'wFoot': W1, 'h': H, 'positions': pos,
                   'note': f'square wool sail, bpy cloth sim ({name}); x across, y up (0 = yard), z downwind'}, f)
    zs = pos[2::3]
    print('wrote', out, len(pos) // 3, 'vertices; belly depth', round(max(zs) - min(zs), 3), 'm')


for name, p in VARIANTS.items():
    if only and name != only:
        continue
    bake(name, p)
