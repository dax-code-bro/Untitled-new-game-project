"""The Episode 1 cast (PROVISIONAL looks - no design is approved by Daxtyn yet).

Canon used here (screenplay CANON LOCK + production continuity): Remi wears practical dark riding
clothes with a muted blue outer layer; Abby practical riding clothes with a muted green outer
layer; Alexandria a restrained formal gown; Queen Fall fitted riding clothing suitable for
command; the King of Cling is approachable, a crown is optional and never a prop gag. No exact
ages, no permanent facial features, no heraldry or insignia. Abby's injury is her LEFT arm.
Everything else (faces, hair, colours, cuts) is a proposal of this build.

Colours are linear RGB of natural dyes (woad, madder, weld, walnut, undyed linen and wool...).
"""

# ---------------------------------------------------------------- palette --
DYE = {
    'undyed': [0.42, 0.37, 0.29], 'linen': [0.5, 0.47, 0.4], 'oatmeal': [0.36, 0.31, 0.23], 'walnut': [0.11, 0.07, 0.045],
    'russet': [0.2, 0.07, 0.035], 'madder': [0.32, 0.07, 0.045], 'woad': [0.07, 0.11, 0.2], 'darkwoad': [0.035, 0.05, 0.1],
    'weld': [0.42, 0.33, 0.08], 'sage': [0.12, 0.15, 0.1], 'moss': [0.08, 0.1, 0.045], 'grey': [0.15, 0.145, 0.14],
    'black': [0.02, 0.018, 0.018], 'ochre': [0.34, 0.2, 0.07], 'plum': [0.12, 0.05, 0.07], 'teal': [0.04, 0.09, 0.09],
    'slate': [0.06, 0.07, 0.08], 'charcoal': [0.03, 0.03, 0.032], 'rust': [0.24, 0.09, 0.04],
}
HAIR = {
    'black': [0.012, 0.009, 0.008], 'darkbrown': [0.03, 0.017, 0.01], 'brown': [0.055, 0.032, 0.018], 'chestnut': [0.075, 0.035, 0.017],
    'auburn': [0.16, 0.06, 0.025], 'dirtyblond': [0.28, 0.19, 0.1], 'blond': [0.42, 0.3, 0.16], 'grey': [0.28, 0.27, 0.26],
    'salt': [0.16, 0.15, 0.14], 'white': [0.55, 0.53, 0.5],
}

# the royal family of Verdor share a face (detail targets) and complexion
VERDOR_FACE = {
    'nose/nose-scale-horiz': -0.15, 'nose/nose-hump': 0.25, 'nose/nose-point-width': -0.2, 'nose/nose-scale-vert': 0.1,
    'mouth/mouth-scale-horiz': 0.1, 'mouth/mouth-upperlip-volume': 0.15, 'chin/chin-prominent': 0.2, 'chin/chin-width': -0.1,
    'cheek/l-cheek-bones': 0.25, 'cheek/r-cheek-bones': 0.22, 'eyebrows/eyebrows-angle': 0.15, 'head/head-oval': 0.4,
    'eyes/l-eye-height2': 0.1, 'eyes/r-eye-height2': 0.1, 'forehead/forehead-scale-vert': 0.1,
    'asym/asym-nose-1': 0.3, 'asym/asym-mouth-1': 0.25, 'asym/asym-eye-2': -0.3, 'asym/asym-brown-1': 0.4, 'asym/asym-jaw-1': 0.2,
}
VERDOR_RACE = (0.1, 0.12, 0.78)


def _merge(*ds):
    out = {}
    for d in ds:
        out.update(d)
    return out


def _c(x):
    return DYE[x] if isinstance(x, str) else list(x)


# ------------------------------------------------------------ garment kit --
def G_hose(c, **kw):
    return dict({'type': 'hose', 'fabric': 'wool', 'color': _c(c), 'ease': 0.004, 'layer': 0, 'wear': 0.5}, **kw)


def G_boots(c, height=0.8, **kw):
    return dict({'type': 'boots', 'fabric': 'leather', 'color': _c(c), 'height': height, 'ease': 0.007, 'layer': 0, 'wear': 0.6, 'dust': 0.6}, **kw)


def G_shoes(c, **kw):
    return dict({'type': 'shoes', 'fabric': 'leather', 'color': _c(c), 'height': 0.33, 'ease': 0.006, 'layer': 0, 'wear': 0.7, 'dust': 0.7}, **kw)


def G_shirt(c='linen', collar=0.012, **kw):
    return dict({'type': 'shirt', 'fabric': 'linen', 'color': _c(c), 'ease': 0.005, 'sleeves': 'long', 'sim': False, 'layer': 1, 'neck': 0.0,
                 'collar': collar, 'drape': False, 'thickness': 0.0015}, **kw)


def G_tunic(c, hem=0.5, belt=True, sleeves='long', **kw):
    return dict({'type': 'tunic', 'fabric': 'wool', 'color': _c(c), 'ease': 0.02, 'loose': 0.025, 'hang': 0.22, 'sleeves': sleeves, 'stack': 0.03,
                 'hem': hem, 'flare': 1.45, 'prefold': 0.035, 'folds': 9, 'belt': belt, 'layer': 2, 'thickness': 0.0025, 'neck': 0.03,
                 'wear': 0.5, 'dust': 0.4}, **kw)


def G_coat(c, hem=0.5, split=True, **kw):
    return dict({'type': 'coat', 'fabric': 'wool', 'color': _c(c), 'ease': 0.016, 'loose': 0.02, 'hang': 0.25, 'sleeves': 'long', 'sleeve_frac': 0.97,
                 'stack': 0.035, 'hem': hem, 'flare': 1.5, 'prefold': 0.035, 'folds': 9, 'pin_hips': 0.5, 'split': 'both' if split else 'none',
                 'belt': True, 'neck_shape': 'v', 'neck': 0.15, 'neck_width': 0.075, 'layer': 2, 'thickness': 0.003, 'wear': 0.45, 'dust': 0.3}, **kw)


def G_kirtle(c, hem=0.03, sleeves='long', belt=False, **kw):
    """Women's fitted dress (laced bodice, full skirt to the ankles)."""
    return dict({'type': 'kirtle', 'fabric': 'wool', 'color': _c(c), 'ease': 0.014, 'loose': 0.012, 'hang': 0.3, 'cinch': True, 'cinch_ease': 0.016,
                 'torso_smooth': 40, 'sleeves': sleeves, 'stack': 0.025,
                 'sleeve_frac': 0.35 if sleeves == 'rolled' else 0.95, 'hem': hem, 'flare': 1.9, 'prefold': 0.05, 'folds': 11, 'neck': 0.05,
                 'layer': 2, 'pin_hips': 0.7, 'belt': belt, 'thickness': 0.0025, 'wear': 0.4, 'dust': 0.45}, **kw)


def G_gambeson(c, hem=0.6, **kw):
    return dict({'type': 'gambeson', 'fabric': 'twill', 'sim_fabric': 'padded', 'color': _c(c), 'ease': 0.028, 'hang': 0.4, 'sleeves': 'long', 'hem': hem,
                 'flare': 1.12, 'belt': True, 'pattern': 1, 'layer': 2, 'thickness': 0.006, 'cuff': False, 'wear': 0.5, 'dust': 0.4}, **kw)


def G_apron(c='linen', width=0.5, length=0.6, **kw):
    return dict({'type': 'apron', 'fabric': 'linen', 'color': _c(c), 'width': width, 'length': length, 'layer': 4, 'wear': 0.6}, **kw)


def G_coif(c=(0.5, 0.48, 0.42), **kw):
    return dict({'type': 'coif', 'fabric': 'linen', 'color': _c(c), 'front': 0.058, 'ease': 0.008, 'layer': 3}, **kw)


def G_kerchief(c, **kw):
    return dict({'type': 'kerchief', 'fabric': 'linen', 'color': _c(c), 'front': 0.062, 'ease': 0.009, 'layer': 3}, **kw)


def G_cap(c, **kw):
    return dict({'type': 'cap', 'fabric': 'felt', 'color': _c(c), 'front': 0.052, 'ease': 0.009, 'layer': 3}, **kw)


def G_hood(c, cape=0.3, **kw):
    return dict({'type': 'hood', 'fabric': 'wool', 'color': _c(c), 'ease': 0.016, 'layer': 3, 'cape_length': cape}, **kw)


def G_veil(c=(0.48, 0.46, 0.4), length=0.5, **kw):
    return dict({'type': 'veil', 'fabric': 'linen', 'sim_fabric': 'fine', 'color': _c(c), 'length': length, 'layer': 5}, **kw)


def G_cloak(c, length=1.0, **kw):
    return dict({'type': 'cloak', 'fabric': 'wool', 'sim_fabric': 'heavywool', 'color': _c(c), 'length': length, 'flare': 0.3, 'gap': 0.9, 'layer': 4}, **kw)


def riding_clothes(outer, shirt='linen', trousers='walnut', boots='walnut', belt=True, split=True, hem=0.5):
    return [G_hose(trousers), G_boots(boots, height=0.82), G_shirt(shirt, collar=0.014), G_coat(outer, hem=hem, split=split, belt=belt)]


# -------------------------------------------------------------- body kit --
SKIN = {
    # (texture stem, tone multiplier, saturation, MakeHuman race (african, asian, caucasian))
    'fair': ('lightskinned', [1.0, 0.96, 0.93], 0.85, (0.08, 0.1, 0.82)),
    'light': ('lightskinned', [0.95, 0.88, 0.82], 0.9, (0.12, 0.12, 0.76)),
    'olive': ('lightskinned', [0.82, 0.72, 0.6], 0.92, (0.25, 0.2, 0.55)),
    'tan': ('lightskinned', [0.7, 0.58, 0.46], 0.95, (0.45, 0.15, 0.4)),
    'brown': ('darkskinned', [1.0, 0.95, 0.9], 0.95, (0.75, 0.05, 0.2)),
    'deep': ('darkskinned', [0.8, 0.74, 0.7], 0.95, (0.9, 0.02, 0.08)),
}


def skin_for(tone, age, gender, var=''):
    stem, mul, sat, race = SKIN[tone]
    a = 'young' if age < 0.55 else ('middleage' if age < 0.75 else 'old')
    g = 'male' if gender > 0.5 else 'female'
    tex = f'{a}_{stem}_{g}_diffuse{var}'
    return {'texture': tex, 'tone': mul, 'saturation': sat, 'redness': 0.2, 'flush': 0.45, 'age': max(0.1, (age - 0.4) * 1.5), 'rough': 0.48}, race


def person(cid, name, gender, age, tone='light', lod='mid', muscle=0.5, weight=0.5, height=0.5, details=None, hair=None, outfit=None,
           pose='stand', pose_params=None, eyes=('brown', [0.55, 0.45, 0.36]), brows='eyebrow003', lashes=None, skin_var='',
           accessories=None, notes='', **kw):
    sk, race = skin_for(tone, age, gender, skin_var)
    d = {
        'id': cid, 'name': name, 'lod': lod,
        'macro': {'gender': gender, 'age': age, 'muscle': muscle, 'weight': weight, 'height': height, 'proportions': 0.6, 'race': race},
        'details': details or {}, 'skin': sk, 'eyes': {'iris': eyes[0], 'tint': eyes[1]}, 'brows': brows,
        'lashes': lashes or ('eyelashes02' if gender < 0.5 else 'eyelashes01'),
        'hair': hair, 'outfit': outfit or [], 'pose': pose, 'pose_params': pose_params or {}, 'notes': notes,
    }
    if accessories:
        d['accessories'] = accessories
    d.update(kw)
    return d


def variant(base, cid, **kw):
    v = dict(base)
    v['id'] = cid
    for k, x in kw.items():
        v[k] = x
    return v


def cast():
    C = []
    # ================================================================ Abby
    abby = {
        'id': 'abby', 'name': 'Abby', 'lod': 'hero',
        'macro': {'gender': 0.0, 'age': 0.43, 'muscle': 0.58, 'weight': 0.42, 'height': 0.55, 'proportions': 0.75, 'race': VERDOR_RACE},
        'details': _merge(VERDOR_FACE, {'mouth/mouth-lowerlip-volume': 0.2, 'chin/chin-height': -0.1, 'nose/nose-hump': 0.1}),
        'skin': {'texture': 'young_lightskinned_female_diffuse3', 'tone': [0.98, 0.95, 0.92], 'saturation': 0.86, 'redness': 0.15, 'flush': 0.55, 'age': 0.15, 'rough': 0.46},
        'eyes': {'iris': 'brownlight', 'tint': [0.6, 0.55, 0.5]},
        'brows': 'eyebrow006', 'lashes': 'eyelashes02',
        'hair': {'color': HAIR['brown'], 'style': 'braid'},
        # unbleached linen shirt, darker than 'undyed' wool: at 0.42 it glared beside her face in close-ups
        'outfit': riding_clothes([0.065, 0.082, 0.055], shirt=[0.31, 0.275, 0.21], trousers='walnut', boots=[0.045, 0.028, 0.017]),
        'pose': 'stand', 'pose_params': {'weight': 'R', 'head_yaw': 0.05},
        'notes': 'canon: riding clothes with a muted green outer layer; LEFT arm is the injured one',
    }
    C.append(abby)
    # the LEFT arm crosses the body in these two: its sleeve follows the arm more firmly and the
    # coat does not self-collide (sleeve and front panel caught between arm and chest shredded)
    def _arm_across(outfit):
        out_ = [dict(g) for g in outfit]
        for g in out_:
            if g['type'] == 'coat':
                g.update(pin_sleeves=0.55, self_collision=False)
        return out_
    C.append(variant(abby, 'abby_injured', pose='injured_arm', pose_params={'weight': 'R', 'contrapposto': 0.4}, outfit=_arm_across(abby['outfit'])))
    C.append(variant(abby, 'abby_sling', pose='sling', pose_params={'weight': 'L', 'contrapposto': 0.5}, outfit=_arm_across(abby['outfit'])))
    C.append(variant(abby, 'abby_ride', pose='ride', pose_params={'lean': 0.14, 'reach': 0.3}, cloth_subdiv=0))
    C.append(variant(abby, 'abby_ride_injured', pose='ride_injured', pose_params={}, lod='mid'))
    # ================================================================ Remi
    remi = {
        'id': 'remi', 'name': 'Remi (Prince Remi IV)', 'lod': 'hero',
        'macro': {'gender': 1.0, 'age': 0.5, 'muscle': 0.56, 'weight': 0.45, 'height': 0.535, 'proportions': 0.75, 'race': VERDOR_RACE},
        'details': _merge(VERDOR_FACE, {'chin/chin-width': 0.15, 'chin/chin-prominent': 0.3, 'head/head-square': 0.25, 'neck/neck-scale-horiz': 0.15,
                                        'eyebrows/eyebrows-trans-down': 0.15, 'asym/asym-brown-2': 0.3, 'asym/asym-nose-2': 0.25}),
        'skin': {'texture': 'young_lightskinned_male_diffuse2', 'tone': [0.97, 0.92, 0.87], 'saturation': 0.88, 'redness': 0.22, 'flush': 0.5, 'age': 0.2, 'rough': 0.48},
        'eyes': {'iris': 'brownlight', 'tint': [0.5, 0.42, 0.34]},
        'brows': 'eyebrow002', 'lashes': 'eyelashes01',
        'hair': {'color': HAIR['darkbrown'], 'style': 'crop', 'length': (0.015, 0.065), 'flow': 'back', 'curl': 0.25,
                 # stubble as skin shading only: a few thousand strand stubs read as specks, not a shadow
                 'beard': {'count': 0, 'moustache': True, 'shadow': 0.7}},
        'outfit': riding_clothes([0.042, 0.058, 0.09], shirt=DYE['slate'], trousers='charcoal', boots=[0.03, 0.02, 0.014]),
        'pose': 'stand', 'pose_params': {'weight': 'L', 'contrapposto': 0.7, 'head_yaw': -0.05},
        'notes': 'canon: dark riding clothes with a muted blue outer layer',
    }
    C.append(remi)
    C.append(variant(remi, 'remi_ride', pose='ride', pose_params={'lean': 0.12, 'reach': 0.32}, cloth_subdiv=0))
    # ========================================================== Alexandria
    alex = person('alexandria', 'Queen Alexandria', 0.0, 0.62, 'fair', lod='hero', muscle=0.4, weight=0.45, height=0.55,
                  details=_merge(VERDOR_FACE, {'nose/nose-scale-vert': 0.1, 'chin/chin-height': 0.1, 'cheek/l-cheek-bones': 0.35, 'cheek/r-cheek-bones': 0.32,
                                               'eyes/l-eye-bag': 0.2, 'eyes/r-eye-bag': 0.2, 'mouth/mouth-scale-horiz': -0.05}),
                  hair={'color': HAIR['chestnut'], 'style': 'bun', 'count': 9000, 'loft': 0.005, 'bun_radius': 0.04},
                  eyes=('brownlight', [0.5, 0.42, 0.34]), brows='eyebrow007',
                  outfit=[G_shoes([0.03, 0.022, 0.018]),
                          G_kirtle([0.045, 0.06, 0.075], hem=0.0, fabric='wool', sim_fabric='heavywool', sheen=0.55, neck=0.07, flare=2.1, train=0.12, folds=13, wear=0.1, dust=0.05,
                                   name='gown'),
                          G_veil([0.52, 0.5, 0.45], length=0.45)],
                  pose='hands_front', pose_params={'weight': 'L', 'contrapposto': 0.4, 'reach': 0.16, 'dy': -0.1}, cloth_subdiv=1,
                  notes='canon: a restrained formal gown; the veil is a proposal (no crown shown: not in the screenplay)')
    alex['skin'].update({'texture': 'middleage_lightskinned_female_diffuse2', 'age': 0.35})
    C.append(alex)
    # ========================================================== Queen Fall
    fall_out = [G_hose([0.03, 0.028, 0.03]), G_boots([0.02, 0.016, 0.013], height=0.9), G_shirt([0.4, 0.38, 0.34]),
                G_coat([0.07, 0.05, 0.055], hem=0.55, hang=0.5, ease=0.012, loose=0.0, neck=0.1, neck_width=0.06, thickness=0.0035)]
    fall = person('fall', 'Queen Fall', 0.0, 0.55, 'light', lod='hero', muscle=0.6, weight=0.4, height=0.6,
                  details={'nose/nose-hump': 0.3, 'nose/nose-scale-horiz': -0.1, 'chin/chin-prominent': 0.3, 'cheek/l-cheek-bones': 0.4, 'cheek/r-cheek-bones': 0.4,
                           'eyebrows/eyebrows-angle': 0.3, 'head/head-oval': 0.3, 'asym/asym-mouth-2': 0.2, 'asym/asym-eye-1': 0.2},
                  hair={'color': HAIR['black'], 'style': 'braid', 'length': 0.36},
                  eyes=('grey', [0.7, 0.72, 0.72]), brows='eyebrow005', outfit=fall_out,
                  pose='stand', pose_params={'weight': 'L', 'contrapposto': 0.3, 'head_pitch': -0.04},
                  notes='canon: fitted riding clothes suitable for command')
    C.append(fall)
    C.append(variant(fall, 'fall_ride', pose='ride', pose_params={'lean': 0.18, 'reach': 0.3}, lod='mid'))
    # ======================================================= King of Cling
    king = person('king', 'King of Cling', 1.0, 0.68, 'olive', lod='hero', muscle=0.5, weight=0.62, height=0.5,
                  details={'nose/nose-scale-horiz': 0.2, 'nose/nose-point-width': 0.3, 'mouth/mouth-scale-horiz': 0.1, 'cheek/l-cheek-volume': 0.3,
                           'cheek/r-cheek-volume': 0.3, 'eyes/l-eye-bag': 0.4, 'eyes/r-eye-bag': 0.4, 'head/head-round': 0.3, 'asym/asym-nose-1': 0.2},
                  hair={'color': HAIR['salt'], 'style': 'crop', 'length': (0.012, 0.035), 'flow': 'back', 'curl': 0.35,
                        'beard': {'count': 9000, 'length': (0.008, 0.02), 'curl': 0.45, 'shadow': 0.8, 'color': HAIR['grey']}},
                  eyes=('brown', [0.55, 0.45, 0.36]), brows='eyebrow004',
                  outfit=[G_hose('russet'), G_shoes([0.05, 0.032, 0.02]), G_shirt('linen'),
                          G_tunic([0.24, 0.08, 0.04], hem=0.32, flare=1.6, ease=0.024, neck=0.04, wear=0.25),
                          # a mantle to the calf (at 0.75 m it hung to the hip like a stiff back panel)
                          G_cloak([0.12, 0.09, 0.05], length=1.12, gap=1.1, flare=0.34)],
                  pose='gesture', pose_params={'weight': 'R', 'contrapposto': 0.5, 'head_yaw': 0.1},
                  notes='screenplay: approachable; crown optional (none shown) and never a prop gag. Warm festival clothes are a proposal')
    king['skin'].update({'texture': 'middleage_lightskinned_male_diffuse', 'redness': 0.35})
    C.append(king)
    # =========================================================== household
    C.append(person('attendant', 'Attendant', 0.0, 0.47, 'light', muscle=0.45, weight=0.45, height=0.45,
                    details={'nose/nose-scale-vert': -0.1, 'head/head-round': 0.3, 'asym/asym-eye-2': 0.3},
                    hair={'color': HAIR['brown'], 'style': 'pulled', 'count': 5000, 'loft': 0.003},
                    outfit=[G_shoes([0.04, 0.027, 0.017]), G_kirtle('oatmeal', hem=0.04, sleeves='long'), G_apron('linen', width=0.48, length=0.62), G_coif()],
                    pose='cloth', pose_params={'weight': 'L', 'contrapposto': 0.4}, notes='suggested: plain household clothes'))
    healer = person('healer', 'Healer', 0.0, 0.74, 'light', muscle=0.45, weight=0.55, height=0.45,
                    details={'nose/nose-scale-vert': 0.2, 'nose/nose-hump': 0.3, 'mouth/mouth-scale-horiz': -0.1, 'chin/chin-prominent': -0.1, 'head/head-round': 0.3,
                             'asym/asym-eye-1': 0.4, 'asym/asym-mouth-2': 0.3, 'asym/asym-nose-1': -0.3},
                    hair={'color': HAIR['salt'], 'style': 'pulled', 'count': 5000, 'loft': 0.003},
                    eyes=('grey', [0.8, 0.8, 0.8]), brows='eyebrow007',
                    outfit=[G_shoes([0.04, 0.026, 0.016]), G_kirtle('russet', hem=0.03, sleeves='rolled'), G_apron('linen', width=0.52, length=0.62),
                            G_coif([0.52, 0.5, 0.44]), G_veil([0.48, 0.46, 0.4], length=0.5)],
                    pose='bowl', pose_params={'weight': 'L', 'contrapposto': 0.5, 'head_pitch': 0.08}, notes='suggested: clean work clothes, apron')
    healer['skin'].update({'texture': 'old_lightskinned_female_diffuse2'})
    C.append(healer)
    C.append(person('messenger', 'Royal Messenger', 1.0, 0.45, 'olive', muscle=0.55, weight=0.35, height=0.55,
                    details={'nose/nose-scale-horiz': -0.1, 'chin/chin-width': -0.1, 'head/head-oval': 0.4, 'asym/asym-nose-2': 0.3},
                    hair={'color': HAIR['black'], 'style': 'crop', 'length': (0.02, 0.05), 'curl': 0.5},
                    outfit=[G_hose('darkwoad'), G_shoes([0.05, 0.032, 0.02]), G_shirt('linen'), G_tunic('weld', hem=0.62, flare=1.3, ease=0.016)],
                    pose='scroll', pose_params={'weight': 'R', 'contrapposto': 0.6}, notes='suggested: light clothes for running'))
    # ========================================================= grounds crew
    keeper = person('keeper1', 'Ground keeper', 1.0, 0.6, 'tan', lod='hero', muscle=0.62, weight=0.55, height=0.5,
                    details={'nose/nose-scale-horiz': 0.25, 'nose/nose-flaring': 0.2, 'chin/chin-width': 0.2, 'head/head-square': 0.3, 'eyes/l-eye-bag': 0.3,
                             'eyes/r-eye-bag': 0.3, 'asym/asym-jaw-1': 0.3},
                    hair={'color': HAIR['brown'], 'style': 'crop', 'length': (0.01, 0.03), 'beard': {'count': 7000, 'length': (0.005, 0.014), 'curl': 0.5, 'shadow': 0.8}},
                    outfit=[G_hose('walnut'), G_boots([0.04, 0.026, 0.016], height=0.55), G_shirt('undyed'), G_tunic('russet', hem=0.48, sleeves='rolled', sleeve_frac=0.4),
                            G_hood('oatmeal', cape=0.28)],
                    pose='call', pose_params={'weight': 'L', 'contrapposto': 0.5}, cloth_subdiv=0, notes='suggested: sturdy work clothes')
    C.append(keeper)
    C.append(person('keeper2', 'Ground keeper (2)', 0.0, 0.52, 'light', muscle=0.6, weight=0.5, height=0.52,
                    details={'nose/nose-hump': 0.2, 'chin/chin-prominent': 0.2, 'asym/asym-eye-3': 0.3},
                    hair={'color': HAIR['auburn'], 'style': 'braid', 'length': 0.3, 'count': 9000},
                    outfit=[G_hose('grey'), G_boots([0.04, 0.026, 0.016], height=0.6), G_shirt('linen'), G_tunic('sage', hem=0.5)],
                    pose='rope_front', pose_params={'weight': 'R', 'contrapposto': 0.5}, notes='suggested: sturdy work clothes'))
    # =================================================================== Cling
    C.append(person('vendor', 'Vendor', 1.0, 0.64, 'olive', muscle=0.5, weight=0.7, height=0.45,
                    details={'nose/nose-scale-horiz': 0.3, 'cheek/l-cheek-volume': 0.4, 'cheek/r-cheek-volume': 0.4, 'head/head-round': 0.4},
                    hair={'color': HAIR['darkbrown'], 'style': 'none', 'beard': {'count': 6000, 'length': (0.004, 0.012), 'curl': 0.5, 'shadow': 0.8}},
                    outfit=[G_hose('brown' if 'brown' in DYE else 'walnut'), G_shoes([0.05, 0.03, 0.02]), G_shirt('undyed'), G_tunic('ochre', hem=0.45),
                            G_apron('oatmeal', width=0.45, length=0.5), G_cap('darkwoad')],
                    pose='crate', pose_params={'weight': 'L', 'contrapposto': 0.4}, notes='suggested: ordinary festival clothes'))
    parent = person('parent', 'Parent', 0.0, 0.5, 'olive', muscle=0.45, weight=0.5, height=0.48,
                    details={'nose/nose-scale-vert': 0.1, 'mouth/mouth-scale-horiz': 0.1, 'head/head-oval': 0.3, 'asym/asym-eye-2': 0.3},
                    hair={'color': HAIR['darkbrown'], 'style': 'pulled', 'count': 5000, 'loft': 0.003},
                    outfit=[G_shoes([0.045, 0.03, 0.02]), G_kirtle('madder', hem=0.05), G_kerchief([0.6, 0.55, 0.42])],
                    pose='hold_child', pose_params={'weight': 'R', 'contrapposto': 0.4, 'hand_out': 0.2, 'head_pitch': 0.12}, notes='drops the parcel later in 3C')
    C.append(parent)
    C.append(person('child', 'Child', 0.0, 0.12, 'olive', lod='hero', muscle=0.5, weight=0.45, height=0.5,
                    details={'head/head-round': 0.3, 'nose/nose-scale-vert': -0.1},
                    hair={'color': HAIR['brown'], 'style': 'braid', 'length': 0.2, 'count': 8000},
                    outfit=[G_hose('grey'), G_shoes([0.05, 0.035, 0.022]), G_tunic('sage', hem=0.25, flare=1.5, ease=0.014)],
                    pose='child_hand', pose_params={'weight': 'L', 'contrapposto': 0.3, 'hand_target': [-0.2, 0.8, 0.08]},
                    cloth_subdiv=0, notes='no age stated in the screenplay'))
    C.append(person('musician', 'Musician (lute)', 1.0, 0.58, 'light', muscle=0.45, weight=0.42, height=0.48,
                    details={'nose/nose-scale-vert': 0.25, 'nose/nose-point-width': -0.2, 'mouth/mouth-scale-horiz': 0.15, 'head/head-oval': 0.4, 'asym/asym-eye-4': 0.4},
                    hair={'color': HAIR['auburn'], 'style': 'crop', 'length': (0.02, 0.06), 'flow': 'forward', 'curl': 0.5,
                          'beard': {'count': 5000, 'length': (0.004, 0.012), 'curl': 0.5, 'shadow': 0.6, 'coverage': 'chin'}},
                    eyes=('green', [0.6, 0.65, 0.55]),
                    outfit=[G_hose('madder'), G_shoes([0.05, 0.032, 0.02]), G_shirt('linen'), G_tunic('weld', hem=0.55)],
                    pose='lute', pose_params={'weight': 'R', 'contrapposto': 0.5}, notes='instrument is a proposal'))
    C.append(person('musician2', 'Musician (recorder)', 0.0, 0.48, 'brown', muscle=0.45, weight=0.45, height=0.5,
                    details={'nose/nose-flaring': 0.2, 'mouth/mouth-lowerlip-volume': 0.3, 'head/head-oval': 0.3},
                    hair={'color': HAIR['black'], 'style': 'pulled', 'count': 5000, 'loft': 0.003},
                    outfit=[G_shoes([0.05, 0.032, 0.02]), G_kirtle('teal', hem=0.05), G_kerchief('weld')],
                    pose='recorder', pose_params={'weight': 'L', 'contrapposto': 0.4}, notes='instrument is a proposal'))
    # ================================================================== guards
    def guard(cid, name, tone, age, details, hair, pose, accessories, gambeson=(0.38, 0.33, 0.24), hose='walnut', hat=True, lod='mid', **kw):
        acc = list(accessories) + ([{'prop': 'kettle_hat'}] if hat else [])
        return person(cid, name, 1.0, age, tone, lod=lod, muscle=0.66, weight=0.55, height=0.52, details=details, hair=hair,
                      outfit=[G_hose(hose), G_boots([0.035, 0.024, 0.016], height=0.7), G_gambeson(gambeson)],
                      accessories=acc, pose=pose, pose_params={'weight': 'L', 'contrapposto': 0.5}, notes='plain guard gear, no badges or insignia', **kw)
    C.append(guard('guard_captain', 'Guard Captain', 'light', 0.66, {'nose/nose-hump': 0.4, 'chin/chin-prominent': 0.3, 'head/head-square': 0.4, 'eyes/l-eye-bag': 0.3, 'eyes/r-eye-bag': 0.3},
                   {'color': HAIR['salt'], 'style': 'crop', 'length': (0.008, 0.02), 'beard': {'count': 6000, 'length': (0.004, 0.01), 'curl': 0.4, 'shadow': 0.8}},
                   'hand_on_belt', [], gambeson=(0.2, 0.17, 0.13), hose='charcoal', hat=False))
    C.append(guard('guard1', 'Guard', 'olive', 0.55, {'nose/nose-scale-horiz': 0.25, 'nose/nose-flaring': 0.2, 'chin/chin-width': 0.25, 'head/head-square': 0.4, 'asym/asym-nose-3': 0.4},
                   {'color': HAIR['black'], 'style': 'crop', 'length': (0.008, 0.02), 'flow': 'forward', 'beard': {'count': 6000, 'length': (0.006, 0.016), 'curl': 0.5, 'shadow': 0.8}},
                   'spear', [{'prop': 'sword'}]))
    C.append(guard('guard2', 'Guard (2)', 'light', 0.48, {'nose/nose-scale-vert': 0.2, 'chin/chin-height': 0.2, 'head/head-oval': 0.3},
                   {'color': HAIR['dirtyblond'], 'style': 'crop', 'length': (0.01, 0.03), 'beard': {'count': 0, 'shadow': 0.6}},
                   'spear', [{'prop': 'sword'}], gambeson=(0.3, 0.27, 0.2)))
    C.append(guard('guard3', 'Guard (3)', 'brown', 0.52, {'nose/nose-flaring': 0.3, 'mouth/mouth-scale-horiz': 0.1, 'head/head-square': 0.2},
                   {'color': HAIR['black'], 'style': 'crop', 'length': (0.004, 0.01), 'curl': 0.6, 'beard': {'count': 5000, 'length': (0.003, 0.008), 'curl': 0.7, 'shadow': 0.8}},
                   'spear', [{'prop': 'sword'}], gambeson=(0.42, 0.37, 0.28)))
    C.append(person('watchman', 'Watchman', 1.0, 0.62, 'light', lod='hero', muscle=0.55, weight=0.5, height=0.5,
                    details={'nose/nose-scale-horiz': 0.2, 'nose/nose-point-width': 0.3, 'chin/chin-width': 0.2, 'head/head-rectangular': 0.3, 'asym/asym-jaw-2': 0.3, 'asym/asym-eye-3': 0.3},
                    hair={'color': HAIR['brown'], 'style': 'none', 'beard': {'count': 7000, 'length': (0.004, 0.012), 'curl': 0.4, 'shadow': 0.8}},
                    eyes=('bluegreen', [0.7, 0.75, 0.75]), brows='eyebrow004',
                    outfit=[G_hose('grey'), G_boots([0.04, 0.026, 0.016], height=0.6), G_shirt('undyed'), G_tunic('oatmeal', hem=0.5), G_hood('russet', cape=0.32),
                            G_cloak([0.09, 0.08, 0.065], length=1.05)],
                    pose='point_up', pose_params={'weight': 'R', 'contrapposto': 0.6}, cloth_subdiv=0, notes='sees Starlight first (3A-3B)'))
    C.append(person('villager_hurt', 'Injured villager', 1.0, 0.56, 'olive', muscle=0.5, weight=0.5, height=0.5,
                    details={'nose/nose-hump': 0.2, 'head/head-oval': 0.2, 'asym/asym-mouth-1': 0.3},
                    hair={'color': HAIR['darkbrown'], 'style': 'crop', 'length': (0.015, 0.04), 'curl': 0.3, 'beard': {'count': 3000, 'length': (0.002, 0.005), 'shadow': 0.7}},
                    outfit=[G_hose('walnut'), G_shoes([0.05, 0.032, 0.02]), G_shirt('undyed'), G_tunic('undyed', hem=0.5, wear=0.9, dust=0.9)],
                    pose='hurt', pose_params={'weight': 'R', 'contrapposto': 0.3}, notes='3C: injured but alive, dusty'))
    # ========================================================= scout + sailors
    C.append(person('scout_ride', 'Scout rider', 1.0, 0.5, 'light', muscle=0.6, weight=0.4, height=0.5,
                    hair={'color': HAIR['brown'], 'style': 'none'},
                    outfit=[G_hose('grey'), G_boots([0.03, 0.022, 0.016], height=0.85), G_shirt('undyed'), G_coat([0.1, 0.09, 0.07], hem=0.5, neck=0.05, neck_shape='round'),
                            G_hood([0.08, 0.075, 0.06], cape=0.3, ease=0.04)],
                    pose='ride', pose_params={'lean': 0.3, 'reach': 0.34, 'head_pitch': 0.25}, notes='face never shown: hood and distance; no markings'))
    C.append(person('sailor1', 'Sailor', 1.0, 0.5, 'tan', muscle=0.68, weight=0.45, height=0.5,
                    details={'nose/nose-hump': 0.3, 'chin/chin-prominent': 0.2, 'asym/asym-nose-1': 0.3},
                    hair={'color': HAIR['dirtyblond'], 'style': 'crop', 'length': (0.02, 0.06), 'curl': 0.5, 'beard': {'count': 5000, 'length': (0.004, 0.01), 'curl': 0.5}},
                    outfit=[G_hose('oatmeal'), G_shirt('linen'), G_tunic('slate', hem=0.62, sleeves='rolled', sleeve_frac=0.45, belt=True), G_cap('russet')],
                    pose='rope', pose_params={'weight': 'L', 'contrapposto': 0.3}, notes='suggested: simple sailor clothes (barefoot on deck)'))
    C.append(person('sailor2', 'Harbor crew', 1.0, 0.6, 'brown', muscle=0.62, weight=0.55, height=0.48,
                    details={'nose/nose-scale-horiz': 0.2, 'head/head-square': 0.2},
                    hair={'color': HAIR['black'], 'style': 'crop', 'length': (0.004, 0.012), 'curl': 0.7, 'beard': {'count': 4000, 'length': (0.003, 0.008), 'curl': 0.7}},
                    outfit=[G_hose('grey'), G_shoes([0.04, 0.028, 0.018]), G_shirt('undyed'), G_tunic('russet', hem=0.6, sleeves='rolled', sleeve_frac=0.4)],
                    pose='crate', pose_params={'weight': 'R', 'contrapposto': 0.3}, notes='suggested: sailor clothes'))
    # ============================================== festival crowd kit (Cling)
    C.extend(crowd())
    return C


# (id, gender, age, tone, build (muscle, weight, height), hair, top garment(s), head cover, pose, extra details)
def crowd():
    out = []
    W = (0.42, 0.37, 0.29)
    rows = [
        ('crowd01', 0.0, 0.42, 'fair', (0.45, 0.45, 0.5), {'style': 'braid', 'color': HAIR['blond'], 'length': 0.34}, ('kirtle', 'woad'), None, 'cheer', {}),
        ('crowd02', 1.0, 0.5, 'light', (0.55, 0.5, 0.52), {'style': 'crop', 'color': HAIR['brown'], 'length': (0.015, 0.04)}, ('tunic', 'russet'), ('cap', 'moss'), 'drink', {}),
        ('crowd03', 0.0, 0.7, 'light', (0.4, 0.6, 0.42), {'style': 'pulled', 'color': HAIR['grey'], 'count': 4000, 'loft': 0.003}, ('kirtle', 'plum'), ('coif+veil', None), 'basket_hip', {}),
        ('crowd04', 1.0, 0.36, 'olive', (0.5, 0.4, 0.55), {'style': 'crop', 'color': HAIR['black'], 'length': (0.02, 0.06), 'curl': 0.6}, ('tunic', 'weld'), None, 'cheer2', {}),
        ('crowd05', 0.0, 0.55, 'brown', (0.45, 0.55, 0.48), {'style': 'pulled', 'color': HAIR['black'], 'count': 4000, 'loft': 0.003}, ('kirtle', 'ochre'), ('kerchief', 'madder'), 'basket_front', {}),
        ('crowd06', 1.0, 0.72, 'light', (0.4, 0.55, 0.45), {'style': 'none', 'color': HAIR['white'], 'beard': {'count': 7000, 'length': (0.01, 0.03), 'curl': 0.4, 'color': HAIR['white']}}, ('tunic', 'grey'), ('hood', 'russet'), 'stand', {}),
        ('crowd07', 0.0, 0.3, 'olive', (0.45, 0.4, 0.45), {'style': 'braid', 'color': HAIR['darkbrown'], 'length': 0.4}, ('kirtle', 'sage'), None, 'eat', {}),
        ('crowd08', 1.0, 0.46, 'tan', (0.62, 0.62, 0.5), {'style': 'crop', 'color': HAIR['brown'], 'length': (0.008, 0.02), 'beard': {'count': 6000, 'length': (0.006, 0.016), 'curl': 0.5}}, ('tunic', 'madder'), None, 'parcel_front', {}),
        ('crowd09', 0.0, 0.62, 'light', (0.4, 0.62, 0.45), {'style': 'pulled', 'color': HAIR['chestnut'], 'count': 4000, 'loft': 0.003}, ('kirtle', 'russet'), ('kerchief', 'undyed'), 'hands_front', {}),
        ('crowd10', 1.0, 0.25, 'fair', (0.45, 0.35, 0.55), {'style': 'crop', 'color': HAIR['auburn'], 'length': (0.03, 0.07), 'curl': 0.4}, ('tunic', 'darkwoad'), None, 'cheer', {}),
        ('crowd11', 0.0, 0.48, 'deep', (0.5, 0.5, 0.52), {'style': 'pulled', 'color': HAIR['black'], 'count': 4000, 'loft': 0.003}, ('kirtle', 'weld'), ('kerchief', 'teal'), 'gesture', {}),
        ('crowd12', 1.0, 0.58, 'olive', (0.5, 0.75, 0.45), {'style': 'none', 'color': HAIR['darkbrown'], 'beard': {'count': 6000, 'length': (0.005, 0.012), 'curl': 0.5}}, ('tunic', 'oatmeal'), ('cap', 'madder'), 'eat', {}),
        ('crowd13', 0.0, 0.2, 'light', (0.45, 0.4, 0.45), {'style': 'braid', 'color': HAIR['auburn'], 'length': 0.36}, ('kirtle', 'teal'), None, 'stand', {}),
        ('crowd14', 1.0, 0.4, 'brown', (0.6, 0.45, 0.55), {'style': 'crop', 'color': HAIR['black'], 'length': (0.004, 0.01), 'curl': 0.7}, ('tunic', 'ochre'), None, 'drink', {}),
        ('crowd15', 0.0, 0.8, 'light', (0.35, 0.5, 0.4), {'style': 'pulled', 'color': HAIR['white'], 'count': 4000, 'loft': 0.003}, ('kirtle', 'grey'), ('coif+veil', None), 'stand', {}),
        ('crowd16', 1.0, 0.33, 'light', (0.55, 0.45, 0.5), {'style': 'crop', 'color': HAIR['dirtyblond'], 'length': (0.02, 0.05), 'beard': {'count': 0, 'shadow': 0.5}}, ('tunic', 'moss'), ('hood', 'woad'), 'call', {}),
        ('crowd17', 0.0, 0.38, 'tan', (0.45, 0.45, 0.5), {'style': 'bun', 'color': HAIR['darkbrown'], 'count': 7000, 'loft': 0.004}, ('kirtle', 'madder'), None, 'bowl', {}),
        ('crowd18', 1.0, 0.15, 'light', (0.5, 0.45, 0.5), {'style': 'crop', 'color': HAIR['blond'], 'length': (0.02, 0.05)}, ('tunic', 'woad'), None, 'cheer', {}),
    ]
    for i, (cid, g, age, tone, (mu_, we, he), hair, top, head, pose, det) in enumerate(rows):
        female = g < 0.5
        out_ = []
        shoes = [0.035 + 0.01 * (i % 3), 0.024 + 0.006 * (i % 2), 0.016]
        if top[0] == 'kirtle':
            out_ += [G_shoes(shoes), G_kirtle(top[1], hem=0.05 if age > 0.2 else 0.12, sleeves='rolled' if i % 3 == 0 else 'long', seed=i)]
            if i % 2 == 1:
                out_.append(G_apron(['linen', 'oatmeal', 'undyed'][i % 3], width=0.46, length=0.55))
        else:
            out_ += [G_hose(['walnut', 'grey', 'russet', 'oatmeal', 'darkwoad', 'moss'][i % 6]), G_shoes(shoes) if i % 3 else G_boots(shoes, height=0.55),
                     G_shirt(['linen', 'undyed', 'oatmeal'][i % 3]), G_tunic(top[1], hem=0.42 + 0.06 * (i % 3), seed=i, sleeves='rolled' if i % 4 == 1 else 'long')]
        if head:
            k, c = head
            if k == 'coif+veil':
                out_ += [G_coif(), G_veil(length=0.45)]
            elif k == 'kerchief':
                out_.append(G_kerchief(c))
            elif k == 'cap':
                out_.append(G_cap(c))
            elif k == 'hood':
                out_.append(G_hood(c, cape=0.26))
        h = dict(hair)
        h.setdefault('color', HAIR['brown'])
        out.append(person(cid, f'Festival villager {i + 1}', g, age, tone, muscle=mu_, weight=we, height=he,
                          details=dict({'asym/asym-eye-%d' % (1 + i % 4): 0.3, 'asym/asym-nose-%d' % (1 + i % 3): 0.3,
                                        'nose/nose-scale-horiz': ((i * 37) % 7 - 3) * 0.08, 'head/head-oval': ((i * 13) % 5) * 0.08}, **det),
                          hair=h, outfit=out_, pose=pose, pose_params={'weight': 'L' if i % 2 else 'R', 'contrapposto': 0.3 + 0.1 * (i % 4),
                                                                       'head_yaw': ((i * 7) % 5 - 2) * 0.08, 'head_pitch': -0.05 * (i % 3)},
                          eyes=(['brown', 'brownlight', 'grey', 'green', 'blue'][i % 5], [0.6, 0.55, 0.5]),
                          brows=['eyebrow001', 'eyebrow003', 'eyebrow005', 'eyebrow008', 'eyebrow010'][i % 5],
                          notes='festival crowd kit (Cling palette: warm cloth, ordinary clothing)'))
    return out
