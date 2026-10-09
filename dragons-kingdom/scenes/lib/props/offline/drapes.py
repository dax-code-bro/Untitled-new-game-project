# One-time offline bakes (Blender's Python module, bpy 4.2): festival and household cloth.
#
#   <bpy python> scenes/lib/props/offline/drapes.py [--only NAME]
#
# Blender cloth simulations of the cloth that a procedural sheet never gets right:
#   awning_<w>    a stall awning stretched over its frame: tied to the back rail and the side
#                 rails, laid over the front rail, sagging between the ties, the front valance
#                 hanging over the rail in folds (two stall sizes)
#   counter       a cloth laid over a stall counter and hanging down its front
#   banner_<k>    a long festival banner hung from a pole by its sleeve: still air, a light
#                 breeze, a gust (the lower half lifts and folds)
#   pennant_<k>   one bunting pennant hung over its cord in different breaths of wind (the
#                 runtime strings many of them along a catenary - cloth.js bunting())
#   sack_<k>      a hessian sack filled with grain (closed bag + pressure), tied at the neck,
#                 dropped on the ground: full and upright, slumped, lying on its side
#
# Grids are written as { nx, ny, positions } (row-major, x fastest), sacks as { positions,
# index, uv }, in metres in the prop's local frame (y up). Output: scenes/lib/props/cache/
# (git-ignored); the runtime falls back to analytic shapes when a file is missing.
import sys, os, json, math
import bpy
import bmesh

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, '..', 'cache')
os.makedirs(CACHE, exist_ok=True)
only = sys.argv[sys.argv.index('--only') + 1] if '--only' in sys.argv else None


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.gravity = (0, 0, -9.81)
    return sc


def mesh_obj(name, verts, faces):
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.update()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def collider(ob, thick=0.006, friction=5.0):
    ob.modifiers.new('col', 'COLLISION')
    ob.collision.thickness_outer = thick
    ob.collision.cloth_friction = friction
    return ob


def rod(name, a, b, r=0.035, seg=10):
    """A cylinder between a and b (Blender coordinates) as a collider."""
    import mathutils
    A, B = mathutils.Vector(a), mathutils.Vector(b)
    d = B - A
    L = d.length
    verts, faces = [], []
    q = d.to_track_quat('Z', 'Y')
    for k in range(2):
        for i in range(seg):
            ang = 2 * math.pi * i / seg
            p = mathutils.Vector((math.cos(ang) * r, math.sin(ang) * r, L * k))
            verts.append(tuple(A + q @ p))
    for i in range(seg):
        faces.append((i, (i + 1) % seg, seg + (i + 1) % seg, seg + i))
    faces.append(tuple(range(seg - 1, -1, -1)))
    faces.append(tuple(seg + i for i in range(seg)))
    return collider(mesh_obj(name, verts, faces))


def cloth_settings(ob, pins, mass=0.15, tension=15, bending=0.1, quality=7, air=1.0, self_col=False, frames=100, rest_key=None, pressure=None):
    vg = ob.vertex_groups.new(name='pin')
    if pins:
        vg.add(pins, 1.0, 'REPLACE')
    cm = ob.modifiers.new('cloth', 'CLOTH')
    s = cm.settings
    s.vertex_group_mass = 'pin'
    s.quality = quality
    s.mass = mass
    s.air_damping = air
    s.tension_stiffness = tension; s.compression_stiffness = tension; s.shear_stiffness = tension * 0.5
    s.bending_stiffness = bending
    s.tension_damping = 5; s.compression_damping = 5; s.shear_damping = 5
    if rest_key is not None:
        s.rest_shape_key = rest_key
    if pressure is not None:
        s.use_pressure = True
        s.uniform_pressure_force = pressure
    c = cm.collision_settings
    c.use_collision = True
    c.collision_quality = 3
    c.distance_min = 0.004
    c.use_self_collision = self_col
    c.self_distance_min = 0.004
    cm.point_cache.frame_start = 1
    cm.point_cache.frame_end = frames
    bpy.context.scene.frame_start, bpy.context.scene.frame_end = 1, frames
    return cm


def wind(strength, direction=(0, 1, 0), at=(0, -5, 1), noise=0.0, flow=0.0):
    import mathutils
    bpy.ops.object.effector_add(type='WIND', location=at)
    w = bpy.context.active_object
    w.rotation_euler = mathutils.Vector(direction).to_track_quat('Z', 'Y').to_euler()
    w.field.strength = strength
    w.field.noise = noise
    w.field.flow = flow
    w.field.shape = 'PLANE'
    return w


def run(ob, frames):
    sc = bpy.context.scene
    for f in range(1, frames + 1):
        sc.frame_set(f)
    dg = bpy.context.evaluated_depsgraph_get()
    ev = ob.evaluated_get(dg)
    me = ev.to_mesh()
    pts = [tuple(v.co) for v in me.vertices]
    ev.to_mesh_clear()
    return pts


def to_yup(pts):
    # Blender (x, y, z) z-up -> three (x, z, -y) y-up (a proper rotation)
    out = []
    for x, y, z in pts:
        out += [round(x, 4), round(z, 4), round(-y, 4)]
    return out


def write(name, data):
    path = os.path.join(CACHE, name + '.json')
    with open(path, 'w') as f:
        json.dump(data, f)
    print('wrote', path, len(data['positions']) // 3, 'vertices')


def grid(nx, ny, fn):
    verts, faces = [], []
    for j in range(ny + 1):
        for i in range(nx + 1):
            verts.append(fn(i / nx, j / ny))
    for j in range(ny):
        for i in range(nx):
            a = j * (nx + 1) + i
            faces.append((a, a + 1, a + nx + 2, a + nx + 1))
    return verts, faces


# ------------------------------------------------------------------ awnings --
# stall frame (three: x across, y up, z forward = front; Blender: x, -z -> y, y -> z):
# back rail at (z = -D/2, y = Hb), front rail at (z = +D/2, y = Hf), side rails between them
AWNINGS = {
    'awning_3': dict(W=3.0, D=1.7, Hb=2.75, Hf=2.3, over=0.55, back=0.12),
    'awning_24': dict(W=2.4, D=1.4, Hb=2.6, Hf=2.2, over=0.45, back=0.1),
}


def bake_awning(name, p):
    reset()
    W, D, Hb, Hf = p['W'], p['D'], p['Hb'], p['Hf']
    B = lambda x, y, z: (x, -z, y)            # three -> Blender
    rod('back', B(-W / 2 - 0.1, Hb, -D / 2), B(W / 2 + 0.1, Hb, -D / 2))
    rod('front', B(-W / 2 - 0.1, Hf, D / 2), B(W / 2 + 0.1, Hf, D / 2))
    for s in (-1, 1):
        rod('side%d' % s, B(s * W / 2, Hb, -D / 2), B(s * W / 2, Hf, D / 2), r=0.03)
        for zz, hh in ((-D / 2, Hb), (D / 2, Hf)):
            rod('post%d%d' % (s, zz > 0), B(s * W / 2, 0, zz), B(s * W / 2, hh, zz), r=0.045)
    slope = math.hypot(D, Hb - Hf)
    L = p['back'] + slope + p['over']
    CW = W + 0.3
    NX, NY = 46, 40
    dy, dz = (Hf - Hb) / slope, D / slope
    pins = []

    def at(u, v):
        s_ = -p['back'] + v * L                 # distance along the slope from the back rail
        x = (u - 0.5) * CW
        if s_ <= slope:
            y, z = Hb + dy * s_ + 0.05, -D / 2 + dz * s_
        else:
            # past the front rail the cloth starts hanging (initially straight on along the slope)
            y, z = Hf + 0.05 + dy * (s_ - slope), D / 2 + dz * (s_ - slope)
        return B(x, y, z)
    verts, faces = grid(NX, NY, at)
    # ties: along the back rail every ~0.5 m (the back hem row), the corners and every ~0.6 m on
    # the front rail (the row lying on it)
    jb = 0
    jf = round((p['back'] + slope) / L * NY)
    for i in range(NX + 1):
        x = (i / NX - 0.5) * CW
        if abs(x / 0.75 - round(x / 0.75)) < (CW / NX) / 0.75 * 0.51 or i in (0, NX):
            pins.append(jb * (NX + 1) + i)
        if i in (0, 1, NX - 1, NX) or abs(x - round(x)) < (CW / NX) * 0.51:
            pins.append(jf * (NX + 1) + i)
    ob = mesh_obj(name, verts, faces)
    cloth_settings(ob, pins, mass=0.004, tension=12, bending=0.05, frames=110, air=1.0)
    wind(1.2, direction=(0.25, 0.6, 0.15), at=(0, -4, 2.5), noise=1.0)
    pts = run(ob, 90)
    write(name, {'nx': NX, 'ny': NY, 'w': CW, 'l': L, 'frame': p, 'positions': to_yup(pts),
                 'note': 'stall awning over its frame (three: x across, y up, z toward the front); bpy cloth'})


# ------------------------------------------------------------------ counter --
def bake_counter(name='counter'):
    reset()
    W, Dc, Hc = 2.6, 0.62, 0.88
    B = lambda x, y, z: (x, -z, y)
    top = mesh_obj('top', [B(-W / 2, Hc - 0.035, -Dc / 2), B(W / 2, Hc - 0.035, -Dc / 2), B(W / 2, Hc - 0.035, Dc / 2), B(-W / 2, Hc - 0.035, Dc / 2),
                           B(-W / 2, Hc, -Dc / 2), B(W / 2, Hc, -Dc / 2), B(W / 2, Hc, Dc / 2), B(-W / 2, Hc, Dc / 2)],
                   [(0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)])
    collider(top, 0.004, 10)
    collider(mesh_obj('floor', [B(-4, 0, -4), B(4, 0, -4), B(4, 0, 4), B(-4, 0, 4)], [(0, 1, 2, 3)]))
    CW, CL = W + 0.1, Dc + 0.55
    NX, NY = 60, 30
    verts, faces = grid(NX, NY, lambda u, v: B((u - 0.5) * CW, Hc + 0.01 + 0.004 * math.sin(u * 37 + v * 11), -Dc / 2 + v * CL))
    pins = [i for i in range(NX + 1)]               # tucked under the goods at the back
    ob = mesh_obj(name, verts, faces)
    cloth_settings(ob, pins, mass=0.003, tension=10, bending=0.03, frames=110, self_col=False)
    pts = run(ob, 100)
    write(name, {'nx': NX, 'ny': NY, 'w': CW, 'l': CL, 'positions': to_yup(pts), 'note': 'cloth over a stall counter (top 2.6 x 0.62 at 0.88 m), hanging at the front (+z)'})


# ------------------------------------------------------------------ banners --
BANNERS = {'banner_still': 0.0, 'banner_breeze': 6.0, 'banner_gust': 15.0}


def bake_banner(name, strength):
    reset()
    Wb, Hb = 0.72, 3.0
    B = lambda x, y, z: (x, -z, y)
    rod('pole', B(-0.6, Hb + 0.03, 0), B(0.6, Hb + 0.03, 0), r=0.025)
    NX, NY = 18, 64
    # gathered a little on the pole: the cloth starts with soft vertical pleats
    # heavy wool, hung flat from its sleeve (a few broad folds come from the sag between the ends)
    verts, faces = grid(NX, NY, lambda u, v: B((u - 0.5) * Wb * 0.97, Hb - v * Hb, 0.006 * math.sin(u * math.pi * 3 + v * 2) + 0.002 * math.sin(v * 40)))
    pins = [i for i in range(NX + 1)]
    ob = mesh_obj(name, verts, faces)
    cloth_settings(ob, pins, mass=0.008, tension=20, bending=0.6, frames=140, air=1.0)
    if strength > 0:
        wind(strength, direction=(0.55, 0.0, 0.25), at=(-3, 0, 1.5), noise=1.0, flow=0.0)
    pts = run(ob, 120)
    write(name, {'nx': NX, 'ny': NY, 'w': Wb, 'h': Hb, 'positions': to_yup(pts), 'note': f'banner {Wb} x {Hb} m from a pole at y = {Hb}, wind {strength}'})


# ----------------------------------------------------------------- pennants --
PENNANTS = {'pennant_0': (0.0, 0.0), 'pennant_1': (4.0, 0.3), 'pennant_2': (8.0, -0.4), 'pennant_3': (14.0, 0.6), 'pennant_4': (6.0, -0.8), 'pennant_5': (20.0, 0.1)}


def bake_pennant(name, strength, yaw):
    reset()
    Wp, Hp = 0.28, 0.36
    B = lambda x, y, z: (x, -z, y)
    rod('cord', B(-0.4, 0.0, 0), B(0.4, 0.0, 0), r=0.004)
    # a triangular mesh (rows of decreasing length down to a single tip vertex), so the cells
    # stay roughly square: a grid squeezed to a point crumples its tip like wet tissue
    NX, NY = 14, 20
    verts, uv, rows = [], [], []
    for j in range(NY + 1):
        v = j / NY
        n = max(0, round(NX * (1 - v)))
        half = 0.5 * Wp * (1 - v)
        row = []
        for i in range(n + 1):
            u = 0.5 if n == 0 else i / n
            x = (u - 0.5) * 2 * half
            row.append(len(verts))
            verts.append(B(x, -0.012 - v * Hp, 0.001 * math.sin(x * 60 + v * 7)))
            uv += [round(x, 4), round(v * Hp, 4)]
        rows.append(row)
    faces = []
    for j in range(NY):
        A, C = rows[j], rows[j + 1]
        ia = ic = 0
        while ia < len(A) - 1 or ic < len(C) - 1:
            ua = (ia + 1) / (len(A) - 1) if ia < len(A) - 1 else 9
            uc = (ic + 1) / (len(C) - 1) if ic < len(C) - 1 else 9
            if ua <= uc:
                faces.append((A[ia], A[ia + 1], C[ic])); ia += 1
            else:
                faces.append((A[ia], C[ic + 1], C[ic])); ic += 1
    ob = mesh_obj(name, verts, faces)
    cloth_settings(ob, rows[0], mass=0.0004, tension=10, bending=0.03, frames=90, air=1.0)
    if strength > 0:
        wind(strength, direction=(math.sin(yaw) * 0.6, math.cos(yaw), 0.15), at=(0, -2, 0), noise=0.8)
    pts = run(ob, 80)
    index = [i for f in faces for i in f]
    write(name, {'tri': True, 'w': Wp, 'h': Hp, 'positions': to_yup(pts), 'index': index, 'uv': uv, 'note': f'triangular pennant hung from a cord at y = 0, wind {strength}; uv = (x across, v down) in metres at rest'})


# -------------------------------------------------------------------- sacks --
SACKS = {'sack_full': dict(p=1.6, lie=False, frames=110, stand=True), 'sack_slump': dict(p=0.55, lie=False, frames=120), 'sack_lying': dict(p=1.0, lie=True, frames=120)}


def bake_sack(name, p):
    reset()
    collider(mesh_obj('floor', [(-3, -3, 0), (3, -3, 0), (3, 3, 0), (-3, 3, 0)], [(0, 1, 2, 3)]), 0.005, 8)
    # a closed bag: a cylinder with a flat sewn bottom, gathered into a neck at the top
    R, H = 0.21, 0.62
    NA, NH = 28, 22
    verts, faces = [], []
    for j in range(NH + 1):
        t = j / NH
        z = 0.03 + t * H
        neck = max(0.0, (t - 0.8) / 0.2)
        r = R * (1 - 0.88 * neck ** 1.5)
        for i in range(NA):
            a = 2 * math.pi * i / NA
            verts.append((math.cos(a) * r, math.sin(a) * r, z))
    for j in range(NH):
        for i in range(NA):
            a = j * NA + i
            b = j * NA + (i + 1) % NA
            faces.append((a, b, b + NA, a + NA))
    cb = len(verts); verts.append((0, 0, 0.03))
    ct = len(verts); verts.append((0, 0, 0.03 + H))
    for i in range(NA):
        faces.append((cb, (i + 1) % NA, i))
        faces.append((ct, NH * NA + i, NH * NA + (i + 1) % NA))
    if p['lie']:
        verts = [(x, z - 0.03 - H / 2, y + R + 0.04) for x, y, z in verts]
    ob = mesh_obj(name, verts, faces)
    # the tied neck holds its shape (the cord): pin the top two rings
    # a full sack stands: its tied neck is held (pinned) while the filled body settles onto the
    # ground and bulges; the half-empty one and the lying one are free
    pins = [NH * NA + i for i in range(NA)] + [ct] if p.get('stand', False) else []
    cloth_settings(ob, pins, mass=0.3, tension=40, bending=0.5, frames=p['frames'], pressure=p['p'], self_col=True, air=1.0)
    pts = run(ob, p['frames'])
    # uv: u around (metres of circumference), v along the bag (metres)
    uv = []
    for j in range(NH + 1):
        for i in range(NA):
            uv += [round(i / NA * 2 * math.pi * R, 4), round(j / NH * H, 4)]
    uv += [0, 0, 0, round(H, 4)]
    index = []
    for f in faces:
        if len(f) == 4:
            index += [f[0], f[1], f[2], f[0], f[2], f[3]]
        else:
            index += list(f)
    write(name, {'positions': to_yup(pts), 'index': index, 'uv': uv, 'na': NA, 'nh': NH, 'note': f'grain sack, pressure {p["p"]}, bpy cloth'})


JOBS = []
for k, v in AWNINGS.items():
    JOBS.append((k, lambda k=k, v=v: bake_awning(k, v)))
JOBS.append(('counter', bake_counter))
for k, v in BANNERS.items():
    JOBS.append((k, lambda k=k, v=v: bake_banner(k, v)))
for k, v in PENNANTS.items():
    JOBS.append((k, lambda k=k, v=v: bake_pennant(k, *v)))
for name, fn in JOBS:
    if only and not name.startswith(only):
        continue
    fn()
