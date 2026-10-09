"""Pose recipes (built with posing.PoseBuilder). Every recipe takes (pb, p) where p is a dict of
parameters from the character spec, and leaves the pose in pb.local. Feet are placed relative to
the rest hips; the build then lifts the whole body so the lowest sole touches the ground."""
import math

import numpy as np

from posing import PoseBuilder, norm
from mhcore import quat_axis


def _leg_len(pb, s):
    a, b, c = pb.head(f'upperleg01.{s}'), pb.head(f'lowerleg01.{s}'), pb.head(f'foot.{s}')
    return np.linalg.norm(b - a) + np.linalg.norm(c - b)


def _ground(pb):
    """Ankle-joint height for straight legs below the hips (rest)."""
    s = 'L'
    hip = pb.head(f'upperleg01.{s}')
    return hip[1] - _leg_len(pb, s) * 0.995


def dress(pb, p=None):
    """Neutral pose the garments are built in: legs straight under the hips, arms ~30 deg from the body."""
    gy = _ground(pb)
    for s, sg in (('L', 1), ('R', -1)):
        hip = pb.head(f'upperleg01.{s}')
        pb.leg_to(s, np.array([hip[0] + sg * 0.025, gy, hip[2] + 0.005]))
        pb.foot_flat(s, yaw=0.1)
    for s in ('L', 'R'):
        pb.arm_down(s, out=0.62, fwd=0.12, elbow=0.18, twist=0.0)
        pb.grip(s, 'relaxed', 0.6)
    return pb


def stand(pb, p):
    """Relaxed standing: weight on one leg (p['weight'] 'L'|'R'), counter-tilts, soft arms."""
    w = p.get('weight', 'R')
    free = 'L' if w == 'R' else 'R'
    amt = p.get('contrapposto', 1.0)
    gy = _ground(pb)
    sgw = 1 if w == 'L' else -1
    # pelvis drops on the free side, chest counter-tilts, head re-levels
    pb.rotate('root', [0, 0, 1], 0.07 * amt * sgw)
    pb.rotate('root', [0, 1, 0], p.get('hip_turn', 0.0))
    pb.bend_spine(flex=p.get('flex', 0.02), side=-0.07 * amt * sgw * -1, turn=p.get('turn', 0.0))
    hipw = pb.head(f'upperleg01.{w}')
    hipf = pb.head(f'upperleg01.{free}')
    shift = 0.035 * amt * sgw
    pb.leg_to(w, np.array([hipw[0] + sgw * 0.005 - shift * 0.0, gy, hipw[2] - 0.005]) + np.array([-shift, 0, 0]))
    sgf = -sgw
    pb.leg_to(free, np.array([hipf[0] + sgf * p.get('stance', 0.06), gy + 0.0, hipf[2] + p.get('free_fwd', 0.07)]) + np.array([-shift, 0, 0]),
              knee_pole=pb.head(f'lowerleg01.{free}') + np.array([sgf * 0.15, 0, 0.6]))
    pb.foot_flat(w, yaw=0.14)
    pb.foot_flat(free, yaw=0.3)
    for s in ('L', 'R'):
        if s in p.get('skip_arms', ()):
            continue
        if p.get('belt_hand') == s:
            belt_hand(pb, s)
            continue
        # not symmetric: the arm on the free-leg side hangs a little forward and more bent,
        # the other one closer to the body (two identical straight arms read as a mannequin)
        fr = 1.0 if s == free else 0.0
        pb.arm_down(s, out=p.get('arm_out', 0.14) - 0.03 * (1 - fr), fwd=p.get('arm_fwd', 0.06) + 0.05 * fr,
                    elbow=p.get('elbow', 0.22) + 0.1 * fr - 0.03 * (1 - fr), twist=p.get('arm_twist', 0.0) + 0.15 * fr)
        # each hand its own curl (one softly open, one more closed)
        pb.grip(s, p.get('hand', 'relaxed'), p.get('hand_amount', 1.0) * (1.25 if fr else 0.75))
    pb.neck_head(pitch=p.get('head_pitch', 0.02), yaw=p.get('head_yaw', 0.0), roll=p.get('head_roll', 0.03 * amt * sgw))
    return pb


def belt_hand(pb, s):
    """A hand resting on the belt at the front of the hip, thumb hooked behind it, fingers hanging
    over the belt (riders, workers: a natural 'at rest' hand that is not a hanging mannequin arm)."""
    sg = 1.0 if s == 'L' else -1.0
    lat = pb.side_axis()
    fwd = pb.fwd_axis()
    hip = pb.head(f'upperleg01.{s}')
    tgt = hip + lat * sg * 0.075 + fwd * 0.1 + np.array([0, 0.13, 0])
    place_hand(pb, s, tgt, pole=pb.head(f'upperarm01.{s}') + lat * sg * 0.45 + np.array([0, -0.25, -0.35]),
               palm=(np.array([0, -1.0, 0]) + fwd * 0.35 - lat * sg * 0.35, -fwd * 0.8 - lat * sg * 0.2), grip=None)
    for k, (a1, a2, a3) in ((2, (0.25, 0.35, 0.2)), (3, (0.3, 0.45, 0.25)), (4, (0.35, 0.5, 0.3)), (5, (0.45, 0.55, 0.3))):
        pb.curl_finger(s, k, a1, a2, a3)
    pb.curl_thumb(s, -0.15, 0.1, 0.3, 0.3)
    return pb


def place_hand(pb, side, target, pole=None, palm=None, grip='cylinder', amount=1.0, wrist_twist=0.0):
    """IK the arm so the wrist is at target, elbow toward pole (default: down/back/out)."""
    sg = 1 if side == 'L' else -1
    sh = pb.head(f'upperarm01.{side}')
    if pole is None:
        pole = sh + np.array([sg * 0.3, -0.5, -0.35])
    pb.ik2(f'upperarm01.{side}', f'lowerarm01.{side}', f'wrist.{side}', target, pole)
    if wrist_twist:
        pb.twist(f'lowerarm02.{side}', wrist_twist * 0.6)
        pb.twist(f'lowerarm01.{side}', wrist_twist * 0.4, to=f'wrist.{side}')
    if palm is not None:
        # orient the hand: fingers along `palm[0]`, palm facing `palm[1]`
        fwd_t, n_t = norm(palm[0]), norm(palm[1])
        fwd, lat, n = pb.hand_frame(side)
        from mhcore import rot_between
        pb.rotate_q(f'wrist.{side}', rot_between(fwd, fwd_t))
        fwd, lat, n = pb.hand_frame(side)
        # roll about the finger axis so the palm normal matches
        a = n - fwd * np.dot(n, fwd)
        b = n_t - fwd * np.dot(n_t, fwd)
        if np.linalg.norm(a) > 1e-6 and np.linalg.norm(b) > 1e-6:
            a, b = norm(a), norm(b)
            ang = math.atan2(np.dot(np.cross(a, b), fwd), np.dot(a, b))
            pb.rotate(f'wrist.{side}', fwd, ang)
    if grip:
        pb.grip(side, grip, amount)
    return pb


def ride(pb, p):
    """Astride a saddle: thighs forward and spread, knees bent, heels down, hands forward at the reins."""
    spread = p.get('spread', 0.55)
    lean = p.get('lean', 0.12)
    for s, sg in (('L', 1), ('R', -1)):
        hip = pb.head(f'upperleg01.{s}')
        # thigh: forward-down and out
        pb.aim(f'upperleg01.{s}', norm(np.array([sg * spread, -0.75, 0.55])), to=f'lowerleg01.{s}')
        kn = pb.head(f'lowerleg01.{s}')
        pb.aim(f'lowerleg01.{s}', norm(np.array([sg * 0.18, -1.0, -0.08])), to=f'foot.{s}')
        pb.foot_flat(s, yaw=0.25)
        pb.rotate(f'foot.{s}', [1, 0, 0], -0.15)
    pb.bend_spine(flex=lean, side=0.0, turn=p.get('turn', 0.0))
    pb.neck_head(pitch=-lean * 0.8 + p.get('head_pitch', 0.0), yaw=p.get('head_yaw', 0.0))
    # hands: reins in front of the belly
    c = pb.head('spine03')
    fwd = pb.fwd_axis()
    for s, sg in (('L', 1), ('R', -1)):
        if s in p.get('skip_arms', ()):
            continue
        tgt = c + fwd * p.get('reach', 0.3) + np.array([sg * 0.09, -0.04 + p.get('hands_dy', 0.0), 0])
        # closed fists round the reins, thumbs on top
        place_hand(pb, s, tgt, pole=pb.head(f'upperarm01.{s}') + np.array([sg * 0.35, -0.4, -0.2]),
                   palm=(fwd + np.array([0, -0.3, 0]), np.array([-sg, -0.3, 0])), grip='fist', amount=1.0)
    return pb


def dress_ride(pb, p=None):
    """Riders' dress pose: already astride (legs as in ride()), trunk upright, arms out ~35 deg -
    the garments are built and simulated seated, so coat skirts drape over the thighs and the
    saddle instead of being swept up by the legs."""
    q = dict(p or {})
    q.update({'lean': 0.0, 'head_pitch': 0.0, 'skip_arms': ('L', 'R')})
    ride(pb, q)
    for s in ('L', 'R'):
        pb.arm_down(s, out=0.62, fwd=0.12, elbow=0.18, twist=0.0)
        pb.grip(s, 'relaxed', 0.6)
    return pb


RECIPES = {'dress': dress, 'dress_ride': dress_ride, 'stand': stand, 'ride': ride}


# ====================================================== actions with props ==
from mhcore import rot_between  # noqa: E402


def hand_len(pb, side):
    w = pb.sk.H[pb.idx[f'wrist.{side}']]
    m = (pb.sk.H[pb.idx[f'finger2-1.{side}']] + pb.sk.H[pb.idx[f'finger5-1.{side}']]) / 2
    return float(np.linalg.norm(m - w))


def _dist_line(p, c, ax):
    v = p - c
    return np.linalg.norm(v - ax * np.dot(v, ax))


def wrap_hand(pb, side, C, ax, R, thick=0.0085, fingers=(2, 3, 4, 5), thumb=True):
    """Close the fingers (and thumb) round a cylinder (axis point C, direction ax, radius R):
    every segment turns toward the axis until its far end touches the surface (R + finger
    half-thickness) - a real grip that neither floats nor cuts into the object."""
    ax = norm(np.asarray(ax, float))
    C = np.asarray(C, float)
    want = R + thick
    fwd, lat, n = pb.hand_frame(side)
    angs = np.linspace(-0.25, 1.75, 81)
    chains = [[f'finger{k}-1.{side}', f'finger{k}-2.{side}', f'finger{k}-3.{side}'] for k in fingers]
    if thumb:
        chains.append([f'finger1-2.{side}', f'finger1-3.{side}'])
    for chain in chains:
        for j, nm in enumerate(chain):
            h = pb.head(nm)
            t0 = pb.tail(nm)
            d = norm(t0 - h)
            v = C - h
            toward = norm(v - ax * np.dot(v, ax))
            rax = np.cross(d, toward)
            if np.linalg.norm(rax) < 1e-6:
                continue
            rax = norm(rax)
            best, best_a = 1e9, 0.0
            L = np.linalg.norm(t0 - h)
            for a in angs:
                c, s_ = math.cos(a), math.sin(a)
                dd = d * c + np.cross(rax, d) * s_ + rax * np.dot(rax, d) * (1 - c)
                tip = h + dd * L
                e = _dist_line(tip, C, ax) - want
                cost = abs(e) + (4 * -e if e < 0 else 0) + 0.002 * abs(a)
                if cost < best:
                    best, best_a = cost, a
            pb.rotate(nm, rax, best_a)
    return pb


def grip_at(pb, side, G, lat_dir, n_dir, grip='cylinder', amount=1.0, pole=None, depth=None, along=0.012, radius=None):
    """Close the hand around a point G: the index->little axis along lat_dir, the palm facing
    n_dir (toward the object's axis). Two IK passes correct the hand's own geometry."""
    sg = 1.0 if side == 'L' else -1.0
    if depth is None:
        depth = (radius + 0.013) if radius else 0.028
    lat = norm(lat_dir)
    n = norm(np.asarray(n_dir) - lat * np.dot(n_dir, lat))
    fwd = sg * np.cross(n, lat)
    a = hand_len(pb, side)
    target = np.asarray(G) - fwd * (a + along) - n * depth
    place_hand(pb, side, target, pole=pole, palm=(fwd, n), grip=None)
    # correction pass: measure where the grip centre landed
    for _ in range(2):
        f2, f5 = pb.head(f'finger2-1.{side}'), pb.head(f'finger5-1.{side}')
        fw, lt, nn = pb.hand_frame(side)
        gc = (f2 + f5) / 2 + fw * along + nn * depth
        target = target + (np.asarray(G) - gc)
        place_hand(pb, side, target, pole=pole, palm=(fwd, n), grip=None)
    if radius and grip in ('cylinder', 'fist', 'loose', 'hook'):
        # thumb half-opposed first, then every segment closes onto the surface
        pb.curl_thumb(side, 0.55, 0.0, 0.0, 0.0, opp=0.45)
        wrap_hand(pb, side, G, lat, radius, thumb=grip != 'hook')
    elif grip:
        pb.grip(side, grip, amount)
    return pb


def place(prop, R, t, bone, **kw):
    M = np.eye(4)
    M[:3, :3] = R
    M[:3, 3] = t
    return {'prop': prop, 'M': M, 'bone': bone, 'kw': kw}


def _std_legs(pb, p):
    """Weight-shifted legs + spine/head like stand(), without touching the arms."""
    q = dict(p)
    q['skip_arms'] = ('L', 'R')
    stand(pb, q)


def act_point_up(pb, p):
    """Watchman: right arm raised pointing up and ahead; the index finger runs on along the
    forearm (no finger-gun), thumb tucked against the middle finger; the head looks along it."""
    d = norm(np.array([-0.25, 0.75, 0.6]))
    _std_legs(pb, dict(p, head_pitch=-0.5, head_yaw=-0.25))
    pb.aim('upperarm01.R', d, to='lowerarm01.R')
    d2 = norm(d + np.array([0, 0.1, 0.1]))
    pb.aim('lowerarm01.R', d2, to='wrist.R')
    pb.grip('R', 'point')
    # align the index finger with the forearm
    pb.aim('wrist.R', d2, to='finger2-2.R')
    pb.arm_down('L', out=0.14, fwd=0.08, elbow=0.45)
    pb.grip('L', 'loose', 0.8)
    return []

def act_hands_front(pb, p, prop=None, size=None):
    """Both hands in front of the waist (clasped, or holding a folded cloth / bowl / parcel)."""
    _std_legs(pb, p)
    c = (pb.head('spine04') + pb.head('spine03')) / 2
    fwd = pb.fwd_axis()
    lat = pb.side_axis()
    G = c + fwd * p.get('reach', 0.22) + np.array([0, p.get('dy', -0.06), 0])
    out = []
    if prop in ('cloth', 'bowl', 'parcel', 'loaf', 'crate', 'basket2', 'rope'):
        w = {'cloth': 0.13, 'bowl': 0.1, 'parcel': 0.15, 'loaf': 0.08, 'crate': 0.27, 'basket2': 0.19, 'rope': 0.12}[prop]
        for s, sg in (('L', 1), ('R', -1)):
            grip_at(pb, s, G + lat * sg * w + np.array([0, -0.01, 0]), lat_dir=fwd * 0.3 + np.array([0, 0, 0]) + lat * 0.0 + fwd,
                    n_dir=-lat * sg + np.array([0, 0.6, 0]), grip='cup', amount=0.7,
                    pole=pb.head(f'upperarm01.{s}') + lat * sg * 0.3 + np.array([0, -0.4, -0.3]))
        R = frame_y(np.array([0, 1.0, 0]), fwd)
        yoff = {'cloth': -0.04, 'bowl': -0.03, 'parcel': -0.0, 'loaf': -0.03, 'crate': -0.17, 'basket2': -0.12, 'rope': -0.02}[prop]
        name = 'basket' if prop == 'basket2' else prop
        out.append(place(name, R, G + np.array([0, yoff, 0]), 'wrist.R'))
    else:
        for s, sg in (('L', 1), ('R', -1)):
            grip_at(pb, s, G + lat * sg * 0.025, lat_dir=np.array([0, -1.0, 0]) + fwd * 0.3, n_dir=-lat * sg, grip='loose', amount=0.9,
                    pole=pb.head(f'upperarm01.{s}') + lat * sg * 0.3 + np.array([0, -0.4, -0.2]))
    return out


def frame_y(y, z):
    y = norm(y)
    z = norm(np.asarray(z) - y * np.dot(z, y))
    return np.stack([np.cross(y, z), y, z], 1)


def act_basket_hip(pb, p):
    """Basket hooked on the forearm at the hip (left), right arm relaxed or holding food."""
    _std_legs(pb, p)
    lat = pb.side_axis()
    fwd = pb.fwd_axis()
    hip = pb.head('upperleg01.L')
    G = hip + lat * 0.17 + fwd * 0.05 + np.array([0, 0.12, 0])
    grip_at(pb, 'L', G, lat_dir=fwd, n_dir=np.array([0, -1.0, 0]) - lat * 0.3, grip='hook', amount=1.0,
            pole=pb.head('upperarm01.L') + lat * 0.4 + np.array([0, -0.3, -0.3]))
    pb.arm_down('R', out=0.12, fwd=0.06, elbow=0.3)
    pb.grip('R', 'relaxed')
    r = 0.15
    R = frame_y(np.array([0, 1.0, 0]), fwd)
    centre = G + np.array([0, -0.15 - 0.17 * 0.85 - 0.012, 0]) + lat * 0.0
    return [place('basket', R @ rot_y_np(math.pi / 2), centre, 'wrist.L', r=r, h=0.15)]


def rot_y_np(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])


def act_lute(pb, p):
    """Musician playing a lute: the bowl against the belly, the neck rising ~25 deg to the wearer's
    left; right hand plucking over the rose, left fingertips on the fingerboard, thumb behind."""
    _std_legs(pb, dict(p, head_pitch=0.2, head_yaw=0.3, head_roll=0.06))
    c = pb.head('spine03')
    fwd = pb.fwd_axis()
    lat = pb.side_axis()
    up = np.array([0, 1.0, 0])
    neck_dir = norm(lat * 0.88 + up * 0.42 + fwd * 0.12)
    board_n = norm(fwd * 0.92 + up * 0.15 - neck_dir * np.dot(fwd, neck_dir))
    board_n = norm(board_n - neck_dir * np.dot(board_n, neck_dir))
    # bowl depth ~ 0.13: the board's centre stands that far in front of the belly
    centre = c + fwd * 0.2 + np.array([0, -0.08, 0]) - lat * 0.02
    R = np.stack([np.cross(neck_dir, board_n), neck_dir, board_n], 1)
    neck_pt = centre + neck_dir * 0.37 - board_n * 0.004
    grip_at(pb, 'L', neck_pt, lat_dir=-neck_dir, n_dir=board_n * 0.7 - np.cross(neck_dir, board_n) * 0.3 + up * -0.2, grip='loose', amount=1.0, radius=0.019,
            pole=pb.head('upperarm01.L') + lat * 0.3 + np.array([0, -0.45, 0.1]))
    rose = centre + neck_dir * 0.03 + board_n * 0.045 - lat * 0.01
    grip_at(pb, 'R', rose, lat_dir=-neck_dir, n_dir=-board_n, grip='relaxed', amount=0.7,
            pole=pb.head('upperarm01.R') - lat * 0.4 + np.array([0, -0.4, -0.3]), depth=0.03)
    return [place('lute', R, centre, 'spine03')]

def act_recorder(pb, p):
    """Recorder: the tube points down and forward from the lips, left hand above right; each hand
    comes from its own side, palm toward the tube, fingers over the front holes, thumb behind."""
    _std_legs(pb, dict(p, head_pitch=0.12))
    fwd, lat = pb.fwd_axis(), pb.side_axis()
    lips = (pb.head('oris05') + pb.head('oris01')) / 2
    d = norm(np.array([0, -0.82, 0]) + fwd * 0.55)
    top = lips + fwd * 0.004
    for s, k in (('L', 0.1), ('R', 0.2)):
        sg = 1 if s == 'L' else -1
        grip_at(pb, s, top + d * k, lat_dir=d, n_dir=-lat * sg - fwd * 0.35, grip='loose', amount=0.8, radius=0.011, depth=0.022,
                pole=pb.head(f'upperarm01.{s}') + lat * sg * 0.35 + np.array([0, -0.35, -0.1]))
    R = frame_y(-d, fwd)
    return [place('recorder', R, top + d * 0.32, 'wrist.R')]

def act_cheer(pb, p):
    """Festival cheer: one or both arms raised, hand open."""
    _std_legs(pb, dict(p, head_pitch=-0.15))
    both = p.get('both', False)
    for s, sg in (('L', 1), ('R', -1)):
        if s == 'R' or both:
            pb.aim(f'upperarm01.{s}', norm(np.array([sg * 0.35, 0.85, 0.2])), to=f'lowerarm01.{s}')
            pb.aim(f'lowerarm01.{s}', norm(np.array([sg * 0.15, 0.9, 0.25])), to=f'wrist.{s}')
            pb.grip(s, 'flat')
        else:
            pb.arm_down(s, out=0.12, fwd=0.05, elbow=0.3)
            pb.grip(s, 'relaxed')
    return []


def act_eat(pb, p):
    """Eating a bread roll: the roll held in the right hand, its end just in front of the lips (the
    loaf sat at the nose with the index finger in a nostril); p['at'] = 'chest' holds it lower,
    about to take a bite."""
    _std_legs(pb, dict(p, head_pitch=p.get('head_pitch', 0.06)))
    fwd, lat = pb.fwd_axis(), pb.side_axis()
    up = np.array([0, 1.0, 0])
    lips = (pb.head('oris05') + pb.head('oris01')) / 2
    if p.get('at') == 'chest':
        C = pb.head('spine01') + fwd * 0.24 - lat * 0.06 + up * 0.02
        ax = norm(fwd * 0.4 + lat * 0.6 + up * 0.2)
    else:
        # roll axis pointing at the mouth from below-right; its near end 1.5 cm from the lips
        ax = norm(-fwd * 0.8 + lat * 0.35 + up * 0.35)
        C = lips - ax * 0.07 + fwd * 0.0
    pole = pb.head('upperarm01.R') - lat * 0.3 + np.array([0, -0.45, -0.1])
    # fingers round the far half of the roll, palm facing up and in
    G = C - ax * 0.015
    grip_at(pb, 'R', G, lat_dir=-ax, n_dir=up * 0.7 + lat * 0.5, grip='cylinder', amount=0.9, radius=0.026, pole=pole)
    pb.arm_down('L', out=0.12, fwd=0.05, elbow=0.4)
    pb.grip('L', 'relaxed')
    return [place('roll', frame_y(ax, up), C, 'wrist.R')]

def act_drink(pb, p):
    _std_legs(pb, p)
    c = pb.head('spine02')
    fwd = pb.fwd_axis()
    lat = pb.side_axis()
    G = c + fwd * 0.22 - lat * 0.08 + np.array([0, -0.02, 0])
    grip_at(pb, 'R', G, lat_dir=np.array([0, -1.0, 0]), n_dir=lat * 0.6 - fwd * 0.4, grip='cylinder', amount=0.85, radius=0.04,
            pole=pb.head('upperarm01.R') - lat * 0.3 + np.array([0, -0.45, -0.1]))
    pb.arm_down('L', out=0.12, fwd=0.05, elbow=0.3)
    pb.grip('L', 'relaxed')
    return [place('cup', np.eye(3), G + np.array([0, -0.045, 0]), 'wrist.R')]


def act_gesture(pb, p):
    """Open-handed gesture (the king inviting the music to continue)."""
    _std_legs(pb, p)
    c = pb.head('spine02')
    fwd = pb.fwd_axis()
    lat = pb.side_axis()
    sh = pb.head('upperarm01.R')
    place_hand(pb, 'R', c + fwd * 0.33 - lat * 0.28 + np.array([0, -0.08, 0]), pole=sh - lat * 0.4 + np.array([0, -0.5, -0.2]),
               palm=(fwd * 0.6 - lat * 0.6, np.array([0, 1.0, 0]) + fwd * 0.3), grip='flat')
    pb.arm_down('L', out=0.12, fwd=0.05, elbow=0.4)
    pb.grip('L', 'relaxed')
    return []


def act_hand_on_belt(pb, p):
    """Guard captain: left hand resting on the sword hilt, right hand on the belt."""
    _std_legs(pb, p)
    lat = pb.side_axis()
    fwd = pb.fwd_axis()
    hipL = pb.head('upperleg01.L')
    hilt = hipL + lat * 0.06 + fwd * 0.12 + np.array([0, 0.1, 0])
    grip_at(pb, 'L', hilt, lat_dir=np.array([0, -1.0, 0]) + fwd * 0.4, n_dir=-lat, grip='cylinder', amount=0.9, radius=0.016,
            pole=pb.head('upperarm01.L') + lat * 0.4 + np.array([0, -0.35, -0.3]))
    hipR = pb.head('upperleg01.R')
    place_hand(pb, 'R', hipR - lat * 0.14 + fwd * 0.04 + np.array([0, 0.17, 0]), pole=pb.head('upperarm01.R') - lat * 0.4 + np.array([0, -0.2, -0.4]),
               palm=(np.array([0, -1.0, 0]) + fwd * 0.4, lat * 0.7 + fwd * 0.3), grip='relaxed')
    R = frame_y(norm(np.array([0, 1.0, 0]) + fwd * 0.45 - lat * 0.15), fwd)
    return [place('sword', R, hilt + np.array([0, -0.025, 0]) - R[:, 1] * 0.03, 'spine05')]


def act_crate(pb, p):
    """Vendor holding an empty crate in front with both hands."""
    return act_hands_front(pb, dict(p, reach=0.3, dy=-0.05), prop='crate')


def act_scroll(pb, p):
    _std_legs(pb, p)
    c = pb.head('spine03')
    fwd = pb.fwd_axis()
    lat = pb.side_axis()
    G = c + fwd * 0.2 - lat * 0.1
    grip_at(pb, 'R', G, lat_dir=lat, n_dir=np.array([0, -1.0, 0]) + fwd * 0.2, grip='cylinder', amount=0.9, radius=0.016,
            pole=pb.head('upperarm01.R') - lat * 0.3 + np.array([0, -0.45, -0.2]))
    pb.arm_down('L', out=0.12, fwd=0.05, elbow=0.3)
    pb.grip('L', 'relaxed')
    return [place('scroll', frame_y(np.array([0, 1.0, 0]), fwd), G, 'wrist.R')]


def act_rope(pb, p):
    """Sailor hauling a rope: leaning back, knees bent; both hands on a rope running forward and up
    to a block (taut, a slight sag), the slack tail hanging from behind the right hand to the deck."""
    _std_legs(pb, dict(p, flex=-0.05, head_pitch=-0.1))
    pb.bend_spine(flex=-0.1)
    c = pb.head('spine03')
    fwd = pb.fwd_axis()
    lat = pb.side_axis()
    up = np.array([0, 1.0, 0])
    d = norm(fwd + np.array([0, 0.5, 0]))
    p0 = c + fwd * 0.3 + np.array([0, -0.12, 0])
    for s, k in (('L', 0.18), ('R', 0.0)):
        sg = 1 if s == 'L' else -1
        grip_at(pb, s, p0 + d * k, lat_dir=d * sg * -1, n_dir=np.array([0, -1.0, 0]), grip='cylinder', amount=1.0, radius=0.01,
                pole=pb.head(f'upperarm01.{s}') + lat * sg * 0.35 + np.array([0, -0.45, -0.1]))
    ground = pb.head('foot.R')[1] - 0.085
    path = []
    A = p0 + d * 1.9
    for t in np.linspace(1, 0, 14):                      # block -> right hand (taut, slight sag)
        path.append(p0 + (A - p0) * t - up * 0.03 * math.sin(math.pi * t))
    for t in np.linspace(0, 1, 16)[1:]:                  # slack tail: back, then down to the deck
        q = p0 - d * 0.18 * t - fwd * 0.05 * t + lat * 0.04 * t
        q = q + (np.array([0, ground + 0.006, 0]) * np.array([0, 1, 0]) - q * np.array([0, 1, 0])) * t ** 1.6
        path.append(q)
    for t in np.linspace(0, 1, 8)[1:]:                   # lying on the deck
        q = path[-1] + (-fwd * 0.05 + lat * 0.03) * 1.0
        q[1] = ground + 0.006
        path.append(q)
    path = np.array(path) - p0
    return [place('ropeline', np.eye(3), p0, 'wrist.R', path=path, r=0.01)]

def act_injured_arm(pb, p):
    """Abby after the pass: the LEFT forearm held in against the belly, the elbow tucked to the
    ribs; the RIGHT hand wraps round the left forearm and cradles it; shoulders drawn up and
    rounded, head tilted toward the hurt side, weight on the right foot."""
    _std_legs(pb, dict(p, head_pitch=0.2, flex=0.12, head_roll=0.1, head_yaw=0.12))
    c = pb.head('spine04')
    fwd = pb.fwd_axis()
    lat = pb.side_axis()
    up = np.array([0, 1.0, 0])
    for s, sg in (('L', 1.0), ('R', -1.0)):
        pb.rotate(f'clavicle.{s}', fwd, -sg * 0.07)                 # shoulders up
        pb.rotate(f'clavicle.{s}', up, sg * 0.1)                    # and forward (rounded)
    # left wrist in front of the belly, right of centre; elbow tucked against the ribs
    wl = c + fwd * 0.17 - lat * 0.06 + np.array([0, 0.05, 0])
    place_hand(pb, 'L', wl, pole=pb.head('upperarm01.L') + lat * 0.08 + np.array([0, -0.6, 0.0]),
               palm=(-lat + fwd * 0.2, -fwd * 0.5 + up * 0.5), grip='loose', amount=0.7)
    el = pb.head('lowerarm01.L')
    wr = pb.head('wrist.L')
    fa = norm(wr - el)
    G = el * 0.4 + wr * 0.6
    grip_at(pb, 'R', G, lat_dir=fa, n_dir=up * 0.55 + fwd * 0.45, grip='cylinder', amount=0.9, radius=0.03,
            pole=pb.head('upperarm01.R') - lat * 0.3 + np.array([0, -0.5, -0.15]))
    return []

def act_sling(pb, p):
    """LEFT forearm supported in a sling: elbow bent ~90 deg, forearm across the body, hand relaxed."""
    _std_legs(pb, dict(p, head_pitch=0.05))
    c = pb.head('spine03')
    fwd = pb.fwd_axis()
    lat = pb.side_axis()
    wl = c + fwd * 0.2 - lat * 0.06 + np.array([0, 0.02, 0])
    place_hand(pb, 'L', wl, pole=pb.head('upperarm01.L') + lat * 0.2 + np.array([0, -0.6, 0.0]),
               palm=(-lat + fwd * 0.25 + np.array([0, 0.05, 0]), -fwd * 0.3 + np.array([0, -0.2, 0]) - lat * 0.0 + np.array([0, 0, 0]) + np.array([0, 0, -1.0])), grip='relaxed', amount=0.8)
    pb.arm_down('R', out=0.12, fwd=0.05, elbow=0.3)
    pb.grip('R', 'relaxed')
    return [{'prop': 'sling', 'M': np.eye(4), 'bone': 'lowerarm01.L', 'kw': {}}]


def act_hold_child(pb, p):
    """Parent: parcel under the right arm, left hand lowered to hold the child's hand."""
    _std_legs(pb, p)
    lat = pb.side_axis()
    fwd = pb.fwd_axis()
    hand = pb.head('upperleg01.L') + lat * p.get('hand_out', 0.2) + fwd * 0.08 + np.array([0, -0.08, 0])
    grip_at(pb, 'L', hand, lat_dir=fwd * -1 + np.array([0, -0.3, 0]), n_dir=lat * 0.6 + np.array([0, -0.8, 0]), grip='loose', amount=0.8,
            pole=pb.head('upperarm01.L') + lat * 0.4 + np.array([0, -0.4, -0.3]))
    # parcel held against the right hip/forearm
    c = pb.head('spine04')
    G = c - lat * 0.16 + fwd * 0.12 + np.array([0, 0.02, 0])
    grip_at(pb, 'R', G + np.array([0, -0.06, 0]), lat_dir=fwd, n_dir=np.array([0, 1.0, 0]) + lat * 0.4, grip='cup', amount=0.7,
            pole=pb.head('upperarm01.R') - lat * 0.3 + np.array([0, -0.5, -0.2]))
    R = frame_y(np.array([0, 1.0, 0]), fwd)
    return [place('parcel', R, G + np.array([0, 0.015, 0]), 'wrist.R', w=0.24, h=0.12, d=0.18)]


def act_child_hand(pb, p):
    """Child: right hand raised to hold the parent's hand (target in the child's frame)."""
    _std_legs(pb, dict(p, head_pitch=-0.12, head_yaw=-0.25))
    tgt = np.asarray(p['hand_target'])
    lat = pb.side_axis()
    fwd = pb.fwd_axis()
    grip_at(pb, 'R', tgt, lat_dir=fwd + np.array([0, -0.3, 0]), n_dir=-lat * 0.6 + np.array([0, 0.8, 0]), grip='loose', amount=0.85,
            pole=pb.head('upperarm01.R') - lat * 0.4 + np.array([0, -0.4, -0.2]))
    pb.arm_down('L', out=0.12, fwd=0.05, elbow=0.3)
    pb.grip('L', 'relaxed')
    return []


def act_call(pb, p):
    """Ground keeper calling / signalling: left arm raised, palm forward."""
    _std_legs(pb, dict(p, head_pitch=-0.1))
    pb.aim('upperarm01.L', norm(np.array([0.55, 0.7, 0.35])), to='lowerarm01.L')
    pb.aim('lowerarm01.L', norm(np.array([0.1, 0.95, 0.25])), to='wrist.L')
    pb.grip('L', 'flat')
    pb.arm_down('R', out=0.12, fwd=0.05, elbow=0.3)
    pb.grip('R', 'relaxed')
    return []


def act_hurt(pb, p):
    """Adult villager hurt and frightened: hunched, right hand pressed to the left upper arm."""
    _std_legs(pb, dict(p, flex=0.15, head_pitch=0.2))
    lat = pb.side_axis()
    fwd = pb.fwd_axis()
    ua = (pb.head('upperarm01.L') * 0.4 + pb.head('lowerarm01.L') * 0.6)
    pb.arm_down('L', out=0.08, fwd=0.12, elbow=0.9)
    pb.grip('L', 'loose')
    ua = (pb.head('upperarm01.L') * 0.45 + pb.head('lowerarm01.L') * 0.55) + lat * 0.02 + fwd * 0.04
    grip_at(pb, 'R', ua, lat_dir=np.array([0, -1.0, 0]), n_dir=-lat * 0.7 - fwd * 0.3, grip='cup', amount=0.6,
            pole=pb.head('upperarm01.R') - lat * 0.3 + np.array([0, -0.5, -0.2]))
    return []


def act_ride(pb, p):
    ride(pb, p)
    out = []
    if p.get('reins', True):
        fw, lt, nn = pb.hand_frame('R')
        for s in ('L', 'R'):
            if s in p.get('skip_arms', ()):
                continue
            f2, f5 = pb.head(f'finger2-1.{s}'), pb.head(f'finger5-1.{s}')
            fw, lt, nn = pb.hand_frame(s)
            gc = (f2 + f5) / 2 + fw * 0.02 + nn * 0.025
            out.append(place('reins', frame_y(np.array([0, 1.0, 0]), pb.fwd_axis()), gc, f'wrist.{s}', length=p.get('rein_len', 0.6)))
    return out


def act_ride_injured(pb, p):
    """Abby returning: hunched over the saddle, LEFT arm held in to the body, right hand on the reins."""
    q = dict(p, lean=0.42, skip_arms=('L',), head_pitch=0.15, reach=0.28)
    out = act_ride(pb, q)
    c = pb.head('spine04')
    fwd = pb.fwd_axis()
    lat = pb.side_axis()
    place_hand(pb, 'L', c + fwd * 0.17 - lat * 0.03 + np.array([0, 0.05, 0]), pole=pb.head('upperarm01.L') + lat * 0.25 + np.array([0, -0.5, 0.1]),
               palm=(-lat + fwd * 0.2, -fwd * 0.6 + np.array([0, 0.4, 0])), grip='loose', amount=0.6)
    return out


def act_stand(pb, p):
    stand(pb, p)
    return []


def palm_centre(pb, side, along=0.03):
    fw, lt, nn = pb.hand_frame(side)
    f2, f5 = pb.head(f'finger2-1.{side}'), pb.head(f'finger5-1.{side}')
    return (f2 + f5) / 2 - fw * along, fw, lt, nn


def act_clasp(pb, p):
    """Hands folded at the waist: the left hand relaxed, palm up and in; the right hand laid over
    it palm down, its fingers over the left fingers. Contact is solved: the right palm sits a hand's
    thickness above the left (they interpenetrated, or one hand floated)."""
    _std_legs(pb, p)
    c = (pb.head('spine04') + pb.head('spine03')) / 2
    fwd, lat = pb.fwd_axis(), pb.side_axis()
    up = np.array([0, 1.0, 0])
    G = c + fwd * p.get('reach', 0.2) + up * p.get('dy', -0.03)
    poleL = pb.head('upperarm01.L') + lat * 0.35 + np.array([0, -0.45, -0.25])
    poleR = pb.head('upperarm01.R') - lat * 0.35 + np.array([0, -0.45, -0.25])
    palmL = (-lat + fwd * 0.25 - up * 0.1, up * 0.75 - fwd * 0.55)
    tL = G + lat * 0.055
    for _ in range(3):
        place_hand(pb, 'L', tL, pole=poleL, palm=palmL, grip=None)
        pc, fw, lt, nn = palm_centre(pb, 'L')
        tL = tL + (G - pc)
    pb.grip('L', 'relaxed', 0.9)
    pcL, fwL, ltL, nL = palm_centre(pb, 'L')
    # right hand: palm down over the left hand, fingers pointing to the left, wrist a little
    # forward of the left one
    want = pcL + nL * 0.024 + lat * 0.012 + fwd * 0.01
    palmR = (lat + fwd * 0.2 - up * 0.15, -nL)
    tR = want - lat * 0.06
    for _ in range(3):
        place_hand(pb, 'R', tR, pole=poleR, palm=palmR, grip=None)
        pc, fw, lt, nn = palm_centre(pb, 'R')
        tR = tR + (want - pc)
    pb.grip('R', 'relaxed', 0.7)
    return []


def act_hands_behind(pb, p):
    """Hands clasped behind the back (the right wrist held in the left hand): low-key authority."""
    _std_legs(pb, p)
    fwd, lat = pb.fwd_axis(), pb.side_axis()
    sacrum = pb.head('spine05') - fwd * 0.16 + np.array([0, 0.02, 0])
    place_hand(pb, 'R', sacrum + lat * 0.035 + np.array([0, -0.02, 0]), pole=pb.head('upperarm01.R') - lat * 0.4 - fwd * 0.35 + np.array([0, -0.3, 0]),
               palm=(lat + np.array([0, -0.4, 0]), -fwd), grip='relaxed', amount=0.9)
    wr = pb.head('wrist.R') + (pb.head('lowerarm01.R') - pb.head('wrist.R')) * 0.12
    ax = norm(pb.head('wrist.R') - pb.head('lowerarm01.R'))
    grip_at(pb, 'L', wr, lat_dir=ax, n_dir=fwd * 0.6 + np.array([0, -0.4, 0]), grip='cylinder', amount=0.9, radius=0.026,
            pole=pb.head('upperarm01.L') + lat * 0.4 - fwd * 0.35 + np.array([0, -0.3, 0]))
    return []


def _spear_contact(pb, side, base, ax, radius=0.0145):
    """Move the spear so its shaft runs through the closed hand (the IK lands the hand within a
    few cm of the target; the fingers then closed on nothing): returns the corrected base."""
    pc, fw, lt, nn = palm_centre(pb, side, along=-0.012)
    gc = pc + nn * (radius + 0.013)
    v = gc - base
    off = v - ax * np.dot(v, ax)
    base = base + off
    wrap_hand(pb, side, gc, ax, radius)
    return base


def act_spear(pb, p):
    """Guard: spear grounded beside the right foot, right hand round the shaft at shoulder height;
    the shaft leans a few degrees (no two guards alike)."""
    _std_legs(pb, dict(p, weight=p.get('weight', 'L')))
    sh = pb.head('upperarm01.R')
    fwd = pb.fwd_axis()
    side = -pb.side_axis()                    # toward the right
    lean = p.get('lean', 0.03)
    ax = norm(np.array([0, 1.0, 0]) + side * lean + fwd * lean * 0.5)
    base = sh * np.array([1, 0, 1]) + side * 0.12 + fwd * 0.26
    base[1] = pb.head('foot.R')[1] - 0.09
    G = base + ax * ((sh[1] - 0.15 + p.get('spear_h', 0.0)) - base[1])
    grip_at(pb, 'R', G, lat_dir=-ax, n_dir=(G - sh) * np.array([1, 0, 1]),
            pole=sh + side * 0.35 + np.array([0, -0.4, -0.2]), grip='cylinder', amount=0.95, radius=0.0145)
    base = _spear_contact(pb, 'R', base, ax)
    pb.arm_down('L', out=0.12, fwd=0.05, elbow=0.3)
    pb.grip('L', 'loose', 0.8)
    R = frame_y(ax, fwd)
    return [place('spear', R, base, 'wrist.R')]


def act_spear_lean(pb, p):
    """Guard leaning on his spear: shaft planted ahead and to the right, both hands stacked on it
    at chest height (right above left)."""
    _std_legs(pb, dict(p, flex=0.06))
    fwd, lat = pb.fwd_axis(), pb.side_axis()
    sh = pb.head('upperarm01.R')
    base = pb.head('foot.R') * np.array([1, 0, 1]) - lat * 0.05 + fwd * 0.38
    base[1] = pb.head('foot.R')[1] - 0.09
    top = pb.head('spine01') + fwd * 0.3 - lat * 0.1 + np.array([0, 0.05 + p.get('spear_h', 0.0), 0])
    ax = norm(top - base)
    for s, h, pole in (('R', 0.0, sh - lat * 0.35 + np.array([0, -0.4, -0.2])), ('L', -0.11, pb.head('upperarm01.L') + lat * 0.3 + np.array([0, -0.4, -0.2]))):
        G = top + ax * h
        grip_at(pb, s, G, lat_dir=-ax, n_dir=-fwd * 0.6 + (lat if s == 'R' else -lat) * 0.4, pole=pole, grip='cylinder', radius=0.0145)
    base = _spear_contact(pb, 'R', base, ax)
    wrap_hand(pb, 'L', base + ax * np.dot(pb.head('wrist.L') - base, ax), ax, 0.0145)
    return [place('spear', frame_y(ax, fwd), base, 'wrist.R')]


def act_spear_shoulder(pb, p):
    """Guard with the spear on his right shoulder, point up and back, right hand on the shaft in
    front of the chest."""
    _std_legs(pb, p)
    fwd, lat = pb.fwd_axis(), pb.side_axis()
    shR = pb.head('upperarm01.R')
    rest = shR + np.array([0, 0.05, 0]) + lat * 0.03            # the shaft lies on the trapezius
    G = pb.head('spine02') + fwd * 0.2 - lat * 0.1 + np.array([0, -0.02, 0])
    ax = norm(rest - G)
    grip_at(pb, 'R', G, lat_dir=-ax, n_dir=-fwd * 0.3 + np.array([0, 1.0, 0]) * 0.4 + lat * 0.4, pole=shR - lat * 0.3 + np.array([0, -0.45, 0.05]),
            grip='cylinder', radius=0.0145)
    base = G - ax * 0.45
    base = _spear_contact(pb, 'R', base, ax)
    pb.arm_down('L', out=0.12, fwd=0.04, elbow=0.25)
    pb.grip('L', 'relaxed', 1.1)
    return [place('spear', frame_y(ax, fwd), base, 'wrist.R')]


ACTIONS = {
    'stand': act_stand, 'spear': act_spear, 'point_up': act_point_up, 'hands_front': act_hands_front,
    'cloth': lambda pb, p: act_hands_front(pb, p, prop='cloth'), 'rope_front': lambda pb, p: act_hands_front(pb, p, prop='rope'), 'bowl': lambda pb, p: act_hands_front(pb, p, prop='bowl'),
    'parcel_front': lambda pb, p: act_hands_front(pb, p, prop='parcel'), 'basket_front': lambda pb, p: act_hands_front(pb, dict(p, reach=0.24, dy=-0.12), prop='basket2'),
    'basket_hip': act_basket_hip, 'lute': act_lute, 'recorder': act_recorder, 'cheer': act_cheer,
    'cheer2': lambda pb, p: act_cheer(pb, dict(p, both=True)), 'eat': act_eat, 'drink': act_drink, 'gesture': act_gesture,
    'hand_on_belt': act_hand_on_belt, 'crate': act_crate, 'scroll': act_scroll, 'rope': act_rope,
    'injured_arm': act_injured_arm, 'sling': act_sling, 'hold_child': act_hold_child, 'child_hand': act_child_hand,
    'call': act_call, 'hurt': act_hurt, 'ride': act_ride, 'ride_injured': act_ride_injured,
    'clasp': act_clasp, 'hands_behind': act_hands_behind, 'spear_lean': act_spear_lean, 'spear_shoulder': act_spear_shoulder,
}
