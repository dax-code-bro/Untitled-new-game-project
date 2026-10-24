"""MakeHuman face pose units (CC0) -> scenes/lib/humans/data/face-units.json.

    python3 scenes/lib/humans/offline/poseunits.py <face-poseunits.bvh> <face-poseunits.json>

The MakeHuman 1.1 'Standard face pose units' (face-poseunits.bvh + .json, CC0, (c) 2020 Data Collection
AB, Joel Palmius, Jonas Hauquier) hold 60 expression units as frames of a BVH on the default skeleton
(163 bones, the same hierarchy as our builds). BVH joints have no rest orientation: a joint's channels
are its rotation relative to its parent in world-aligned axes, Z up, -Y forward (MakeHuman's Blender
export). Our builds store bones with identity rest frames in MakeHuman's own frame (Y up, +Z forward),
so a unit is just a local quaternion per bone after the change of axes v_mh = (x, z, -y).
Channels 'Xrotation Yrotation Zrotation' = R = Rx(a) Ry(b) Rz(c) (degrees). Frame 0 ('Rest') is
subtracted. Only bones a unit actually moves (> 0.01 deg) are written. Pure python, no numpy.
"""
import hashlib
import json
import math
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'data', 'face-units.json')
SRC = ('https://raw.githubusercontent.com/makehumancommunity/makehuman/a8bc2d54ff0ac92e78ff71431b1023eda42bf482/'
       'makehuman/data/poseunits/')


def qmul(a, b):
    ax, ay, az, aw = a
    bx, by, bz, bw = b
    return (aw * bx + ax * bw + ay * bz - az * by,
            aw * by - ax * bz + ay * bw + az * bx,
            aw * bz + ax * by - ay * bx + az * bw,
            aw * bw - ax * bx - ay * by - az * bz)


def qaxis(ax, deg):
    h = math.radians(deg) / 2
    s = math.sin(h)
    return (ax[0] * s, ax[1] * s, ax[2] * s, math.cos(h))


def qinv(q):
    return (-q[0], -q[1], -q[2], q[3])


def parse(path):
    L = open(path).read().split('\n')
    joints, chans = [], []
    i = 0
    while not L[i].startswith('MOTION'):
        s = L[i].strip()
        m = re.match(r'(ROOT|JOINT) (\S+)', s)
        if m:
            joints.append(m.group(2))
        if s.startswith('CHANNELS'):
            chans.append((joints[-1], s.split()[2:]))
        i += 1
    frames = [list(map(float, l.split())) for l in L[i + 3:] if l.strip()]
    return chans, frames


def main():
    bvh, js = sys.argv[1], sys.argv[2]
    names = json.load(open(js))['framemapping']
    chans, frames = parse(bvh)
    C = qaxis((1, 0, 0), -90.0)            # BVH (Z up, -Y fwd) -> MakeHuman (Y up, +Z fwd)
    Ci = qinv(C)

    def frame_quats(f):
        out, off = {}, 0
        for j, c in chans:
            q = (0.0, 0.0, 0.0, 1.0)
            for k, ch in enumerate(c):
                v = f[off + k]
                if ch.endswith('rotation'):
                    ax = {'X': (1, 0, 0), 'Y': (0, 1, 0), 'Z': (0, 0, 1)}[ch[0]]
                    q = qmul(q, qaxis(ax, v))      # intrinsic, in channel order
            off += len(c)
            out[j] = qmul(qmul(C, q), Ci)
        return out
    rest = frame_quats(frames[0])
    units = {}
    for n, f in zip(names, frames):
        if n == 'Rest':
            continue
        fq = frame_quats(f)
        u = {}
        for j, q in fq.items():
            d = qmul(qinv(rest[j]), q)
            ang = 2 * math.degrees(math.acos(max(-1.0, min(1.0, abs(d[3])))))
            if ang > 0.01:
                if d[3] < 0:
                    d = tuple(-x for x in d)
                u[j] = [round(x, 6) for x in d]
        units[n] = u
    sha = {os.path.basename(p): hashlib.sha256(open(p, 'rb').read()).hexdigest() for p in (bvh, js)}
    doc = {
        'schema': 'dragons-kingdom/face-units v1',
        'name': 'MakeHuman standard face pose units (60), converted for the humans library',
        'license': 'CC0 (MakeHuman 1.1 system assets: "(c) 2020 Data Collection AB, Joel Palmius, Jonas Hauquier", license CC0)',
        'source': {k: SRC + k for k in sha},
        'sha256': sha,
        'frame': 'local bone quaternions [x, y, z, w] relative to the parent, MakeHuman axes (Y up, +Z forward), '
                 'applied on top of the bone\'s own pose (post-multiplied); full unit = weight 1',
        'units': units,
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w') as fo:
        json.dump(doc, fo, separators=(',', ':'))
    print(f'{len(units)} units -> {os.path.relpath(OUT)} ({os.path.getsize(OUT)} bytes)')
    for n in ('JawDrop', 'LipsKiss', 'LeftUpperLidClosed'):
        print(n, units[n].get('jaw') or units[n])


if __name__ == '__main__':
    main()
