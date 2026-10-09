"""Pose builder for the MakeHuman default rig (identity rest orientation, world-aligned rest frames).

A pose is built root to leaves with semantic operations (aim a bone along a direction, two-bone
IK to a target with a pole, rotate about a world axis, curl fingers into a grip). The result is
a dict bone -> LOCAL quaternion (w, x, y, z) in the parent's frame, usable by mhcore.Skeleton.
"""
import math

import numpy as np

from mhcore import quat_mul, quat_axis, quat_to_mat, rot_between

I4 = np.array([1.0, 0, 0, 0])


def qinv(q):
    return np.array([q[0], -q[1], -q[2], -q[3]])


def qrot(q, v):
    return quat_to_mat(q) @ np.asarray(v, float)


def norm(v):
    v = np.asarray(v, float)
    n = np.linalg.norm(v)
    return v / n if n > 1e-12 else v


class PoseBuilder:
    def __init__(self, skel):
        self.sk = skel
        self.idx = {n: i for i, n in enumerate(skel.names)}
        self.local = {}
        self.root_offset = np.zeros(3)

    # ---------------------------------------------------------- state --
    def world(self):
        return self.sk.world(self.local)

    def wq(self, name):
        Q, _ = self.world()
        return Q[self.idx[name]]

    def head(self, name):
        Q, P = self.world()
        return P[self.idx[name]]

    def tail(self, name):
        Q, P = self.world()
        i = self.idx[name]
        return P[i] + quat_to_mat(Q[i]) @ (self.sk.T[i] - self.sk.H[i])

    def parent_wq(self, name):
        p = self.sk.parent[self.idx[name]]
        if p < 0:
            return I4.copy()
        Q, _ = self.world()
        return Q[p]

    def get(self, name):
        return self.local.get(name, I4.copy())

    # ------------------------------------------------------ operations --
    def rotate(self, name, axis, angle):
        """Rotate bone about a WORLD axis (through its head) by angle (radians)."""
        if abs(angle) < 1e-9:
            return self
        Qp = self.parent_wq(name)
        qw = quat_axis(axis, angle)
        # new_world = qw * old_world  ->  new_local = Qp^-1 * qw * Qp * old_local
        self.local[name] = quat_mul(quat_mul(quat_mul(qinv(Qp), qw), Qp), self.get(name))
        return self

    def rotate_q(self, name, qw):
        Qp = self.parent_wq(name)
        self.local[name] = quat_mul(quat_mul(quat_mul(qinv(Qp), qw), Qp), self.get(name))
        return self

    def direction(self, name, to=None):
        """Current world direction of a bone (head -> tail, or head -> head of `to`)."""
        h = self.head(name)
        t = self.head(to) if to else self.tail(name)
        return norm(t - h)

    def aim(self, name, target_dir, to=None, twist=0.0):
        """Swing the bone so that it points along target_dir (world), then twist about it."""
        d = self.direction(name, to)
        self.rotate_q(name, rot_between(d, target_dir))
        if twist:
            self.rotate(name, norm(target_dir), twist)
        return self

    def aim_point(self, name, point, to=None, twist=0.0):
        return self.aim(name, np.asarray(point) - self.head(name), to, twist)

    def ik2(self, upper, lower, end, target, pole, upper2=None, lower2=None, max_reach=0.999):
        """Two-bone IK: put the head of `end` at `target`, the middle joint bending toward `pole`."""
        S = self.head(upper)
        Ep = self.head(lower)
        Wp = self.head(end)
        l1 = np.linalg.norm(Ep - S)
        l2 = np.linalg.norm(Wp - Ep)
        T = np.asarray(target, float)
        dvec = T - S
        dist = np.linalg.norm(dvec)
        if dist > (l1 + l2) * max_reach:
            T = S + dvec / dist * (l1 + l2) * max_reach
            dist = (l1 + l2) * max_reach
        dist = max(dist, abs(l1 - l2) * 1.001 + 1e-4)
        dirv = norm(T - S)
        pl = np.asarray(pole, float) - S
        pl = norm(pl - dirv * np.dot(pl, dirv))
        x = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist)
        h = math.sqrt(max(0.0, l1 * l1 - x * x))
        E = S + dirv * x + pl * h
        self.aim_point(upper, E, to=lower)
        self.aim_point(lower, T, to=end)
        return self

    def twist(self, name, angle, to=None):
        return self.rotate(name, self.direction(name, to), angle)

    # ------------------------------------------------------------ hands --
    def hand_frame(self, side):
        """(forward along fingers, lateral index->little, palm normal) in world, current pose."""
        s = side
        w = self.head(f'wrist.{s}')
        f2 = self.head(f'finger2-1.{s}')
        f5 = self.head(f'finger5-1.{s}')
        fwd = norm((f2 + f5) / 2 - w)
        lat = norm(f5 - f2)
        lat = norm(lat - fwd * np.dot(lat, fwd))
        sg = 1.0 if s == 'L' else -1.0
        n = norm(sg * np.cross(lat, fwd))
        return fwd, lat, n

    def curl_finger(self, side, k, a1, a2, a3, spread=0.0):
        """Curl finger k (2..5) by joint angles (radians, + toward the palm)."""
        fwd, lat, n = self.hand_frame(side)
        axis = norm(np.cross(fwd, n))
        names = [f'finger{k}-1.{side}', f'finger{k}-2.{side}', f'finger{k}-3.{side}']
        if spread:
            self.rotate(names[0], n, spread * (1 if side == 'L' else -1))
        for nm, a in zip(names, (a1, a2, a3)):
            # bend about the (current) lateral axis of the finger segment
            d = self.direction(nm)
            ax = norm(np.cross(d, n))
            self.rotate(nm, ax, a)
        return self

    def curl_thumb(self, side, a0, a1, a2, a3, opp=0.0):
        """Thumb: a0 = abduction toward the palm (CMC), a1..a3 flexion; opp = opposition roll."""
        fwd, lat, n = self.hand_frame(side)
        sg = 1.0 if side == 'L' else -1.0
        t1, t2, t3 = f'finger1-1.{side}', f'finger1-2.{side}', f'finger1-3.{side}'
        # CMC: swing the thumb under the palm (toward the palm normal)
        d = self.direction(t1)
        self.rotate(t1, norm(np.cross(d, n)), a0)
        if opp:
            self.rotate(t1, self.direction(t1), opp * sg)
        for nm, a in ((t1, a1), (t2, a2), (t3, a3)):
            d = self.direction(nm)
            ax = norm(np.cross(d, lat * -1.0))
            self.rotate(nm, ax, a * 1.0)
        return self

    def grip(self, side, kind='relaxed', amount=1.0):
        """Hand shapes: relaxed, loose, fist, cylinder (spear/rein/handle), hook (basket handle),
        pinch, flat, cup (holding a bowl / small object), point."""
        A = amount
        if kind == 'relaxed':
            for k, s in ((2, 0.9), (3, 1.0), (4, 1.1), (5, 1.25)):
                self.curl_finger(side, k, 0.22 * s * A, 0.35 * s * A, 0.22 * s * A)
            self.curl_thumb(side, 0.15 * A, 0.1 * A, 0.15 * A, 0.15 * A)
        elif kind == 'loose':
            for k, s in ((2, 0.9), (3, 1.0), (4, 1.1), (5, 1.2)):
                self.curl_finger(side, k, 0.4 * s * A, 0.6 * s * A, 0.35 * s * A)
            self.curl_thumb(side, 0.3 * A, 0.15 * A, 0.25 * A, 0.25 * A)
        elif kind in ('fist', 'cylinder'):
            c = 1.0 if kind == 'fist' else 0.8
            for k, s in ((2, 0.95), (3, 1.0), (4, 1.03), (5, 1.06)):
                self.curl_finger(side, k, 1.15 * c * s * A, 1.45 * c * s * A, 0.75 * c * A)
            self.curl_thumb(side, 0.75 * A, 0.25 * A, 0.45 * A, 0.5 * A, opp=0.5 * A)
        elif kind == 'hook':
            for k, s in ((2, 1.0), (3, 1.0), (4, 1.0), (5, 1.0)):
                self.curl_finger(side, k, 0.25 * A, 1.35 * A, 0.95 * A)
            self.curl_thumb(side, 0.25 * A, 0.1 * A, 0.2 * A, 0.2 * A)
        elif kind == 'pinch':
            self.curl_finger(side, 2, 0.6 * A, 0.9 * A, 0.5 * A)
            for k, s in ((3, 1.0), (4, 1.15), (5, 1.3)):
                self.curl_finger(side, k, 0.75 * s * A, 1.1 * s * A, 0.6 * A)
            self.curl_thumb(side, 0.65 * A, 0.3 * A, 0.3 * A, 0.3 * A, opp=0.4 * A)
        elif kind == 'flat':
            for k in (2, 3, 4, 5):
                self.curl_finger(side, k, 0.05 * A, 0.08 * A, 0.05 * A)
            self.curl_thumb(side, 0.05 * A, 0.0, 0.05 * A, 0.05 * A)
        elif kind == 'cup':
            for k, s in ((2, 0.9), (3, 1.0), (4, 1.05), (5, 1.1)):
                self.curl_finger(side, k, 0.5 * s * A, 0.55 * s * A, 0.3 * A)
            self.curl_thumb(side, 0.5 * A, 0.2 * A, 0.2 * A, 0.2 * A, opp=0.2 * A)
        elif kind == 'point':
            self.curl_finger(side, 2, 0.02, 0.06, 0.03)
            for k, s in ((3, 1.0), (4, 1.05), (5, 1.1)):
                self.curl_finger(side, k, 1.25 * s, 1.55 * s, 0.85)
            # thumb tucked against the curled middle finger (it stood up: a finger-gun)
            self.curl_thumb(side, 0.95, 0.45, 0.65, 0.5, opp=0.75)
        return self

    # ------------------------------------------------------------- body --
    def bend_spine(self, flex=0.0, side=0.0, turn=0.0, weights=(0.15, 0.2, 0.25, 0.25, 0.15)):
        """Distribute a flexion (+ forward), lateral bend (+ to the character's left) and turn
        (+ toward the character's left) over spine05..spine01."""
        for nm, w in zip(('spine05', 'spine04', 'spine03', 'spine02', 'spine01'), weights):
            if flex:
                self.rotate(nm, [1, 0, 0], flex * w)
            if side:
                self.rotate(nm, [0, 0, 1], -side * w)
            if turn:
                self.rotate(nm, [0, 1, 0], turn * w)
        return self

    def neck_head(self, pitch=0.0, yaw=0.0, roll=0.0, neck_share=0.4):
        """Pitch + = look down, yaw + = toward the character's left, roll + = tilt toward left shoulder."""
        for nm, w in (('neck01', neck_share * 0.4), ('neck02', neck_share * 0.35), ('neck03', neck_share * 0.25), ('head', 1 - neck_share)):
            if yaw:
                self.rotate(nm, [0, 1, 0], yaw * w)
            if pitch:
                self.rotate(nm, self.side_axis(), pitch * w)
            if roll:
                self.rotate(nm, self.fwd_axis(), -roll * w)
        return self

    def side_axis(self):
        """Character's left in world (current pelvis/chest frame)."""
        q = self.wq('spine01')
        return norm(qrot(q, [1, 0, 0]))

    def fwd_axis(self):
        q = self.wq('spine01')
        return norm(qrot(q, [0, 0, 1]))

    def arm_down(self, side, out=0.12, fwd=0.05, elbow=0.25, twist=0.0, wrist=0.0):
        """Let the arm hang: upper arm down with a little abduction (out) and flexion (fwd),
        soft elbow bend (radians), forearm twist (+ = palm toward the thigh)."""
        sg = 1.0 if side == 'L' else -1.0
        up = f'upperarm01.{side}'
        lo = f'lowerarm01.{side}'
        fa = self.fwd_axis()
        la = self.side_axis()
        down = norm(np.array([0, -1.0, 0]) + la * sg * out + fa * fwd)
        self.aim(up, down, to=lo)
        # forearm: same direction, then bend forward at the elbow
        self.aim(lo, down, to=f'wrist.{side}')
        if elbow:
            ax = norm(np.cross(down, fa))  # bend so the hand comes forward
            self.rotate(lo, ax, -elbow * 1.0 if side == 'L' else -elbow)
        if twist:
            self.twist(f'lowerarm02.{side}', twist * sg * 0.6)
            self.twist(lo, twist * sg * 0.4, to=f'wrist.{side}')
        if wrist:
            self.rotate(f'wrist.{side}', la * sg, wrist)
        return self

    def leg_to(self, side, ankle_target, knee_pole=None):
        if knee_pole is None:
            knee_pole = self.head(f'lowerleg01.{side}') + self.fwd_axis() * 0.6
        return self.ik2(f'upperleg01.{side}', f'lowerleg01.{side}', f'foot.{side}', ankle_target, knee_pole)

    def foot_flat(self, side, yaw=0.0):
        """Point the foot forward-level (toes ahead), with a small outward yaw (toe-out)."""
        sg = 1.0 if side == 'L' else -1.0
        fwd = np.array([math.sin(yaw * sg), 0.0, math.cos(yaw * sg)])
        h = self.head(f'foot.{side}')
        toe = self.head(f'toe3-1.{side}')
        d = norm(toe - h)
        flat = norm(fwd + np.array([0, d[1] * 0.0 - 0.32, 0]))
        self.rotate_q(f'foot.{side}', rot_between(d, flat))
        return self
