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
    # (wool hose read as pale leggings: they get knee / ankle shading folds at runtime and the
    # crowd's are dyed darker and warmer)
    return dict({'type': 'hose', 'fabric': 'wool', 'color': _c(c), 'ease': 0.004, 'layer': 0, 'wear': 0.5, 'wrinkle': 0.7}, **kw)


def G_trousers(c, tuck=None, bottom=None, **kw):
    """Loose wool riding trousers / braies (simulated, a gusset bridges the fork) - tucked into
    the boots at `tuck` (boot height as a shin fraction) or ending at `bottom` (m above the
    ankle: rolled-up sailors' trousers)."""
    d = {'type': 'trousers', 'fabric': 'wool', 'color': _c(c), 'ease': 0.017, 'sim': True, 'sim_fabric': 'wool', 'layer': 0.5,
         'wear': 0.55, 'dust': 0.5, 'thickness': 0.002, 'tuck': tuck}
    if bottom is not None:
        d['bottom'] = bottom
    return dict(d, **kw)


def G_boots(c, height=0.8, **kw):
    return dict({'type': 'boots', 'fabric': 'leather', 'color': _c(c), 'height': height, 'ease': 0.007, 'layer': 0, 'wear': 0.6, 'dust': 0.6}, **kw)


def G_shoes(c, **kw):
    return dict({'type': 'shoes', 'fabric': 'leather', 'color': _c(c), 'height': 0.33, 'ease': 0.006, 'layer': 0, 'wear': 0.7, 'dust': 0.7}, **kw)


def G_shirt(c='linen', collar=0.012, **kw):
    # (sleeves end inside the outer sleeve: a shirt cuff showing at the wrist read as a wristwatch)
    return dict({'type': 'shirt', 'fabric': 'linen', 'color': _c(c), 'ease': 0.005, 'sleeves': 'long', 'sleeve_frac': 0.84, 'sim': False, 'layer': 1, 'neck': 0.0,
                 'collar': collar, 'drape': False, 'thickness': 0.0015}, **kw)


def G_tunic(c, hem=0.5, belt=True, sleeves='long', **kw):
    return dict({'type': 'tunic', 'fabric': 'wool', 'color': _c(c), 'ease': 0.02, 'loose': 0.025, 'hang': 0.22, 'sleeves': sleeves, 'stack': 0.03,
                 'hem': hem, 'flare': 1.45, 'prefold': 0.035, 'folds': 9, 'belt': belt, 'layer': 2, 'thickness': 0.0025, 'neck': 0.03,
                 'wear': 0.7, 'dust': 0.6}, **kw)


def G_coat(c, hem=0.5, split=True, **kw):
    # sleeves cut with ease (1.5-2 cm more than the arm): tight sleeves printed the deltoids and
    # upper arms through the coat like a wetsuit
    return dict({'type': 'coat', 'fabric': 'wool', 'color': _c(c), 'ease': 0.016, 'loose': 0.02, 'hang': 0.25, 'sleeves': 'long', 'sleeve_frac': 0.97, 'arm_ease': 0.003, 'cap_bridge': 0.92,
                 'stack': 0.035, 'hem': hem, 'flare': 1.5, 'prefold': 0.035, 'folds': 9, 'pin_hips': 0.5, 'split': 'both' if split else 'none',
                 'belt': True, 'neck_shape': 'v', 'neck': 0.15, 'neck_width': 0.075, 'layer': 2, 'thickness': 0.003, 'wear': 0.55, 'dust': 0.45}, **kw)


def G_doublet(c, hem=0.68, **kw):
    """A fitted riding doublet / arming coat: cut close (no blousing), standing collar, closed
    front, short split skirts to the upper thigh."""
    # (cut close but not a second skin: at 8 mm ease, pinned to the body, it read as a wetsuit with
    # the navel showing; buttons down the front give it construction)
    return dict({'type': 'doublet', 'fabric': 'wool', 'sim_fabric': 'heavywool', 'color': _c(c), 'ease': 0.014, 'loose': 0.004, 'hang': 0.6,
                 'torso_smooth': 90, 'bodice_pin': 0.45, 'sleeves': 'long', 'sleeve_frac': 0.97, 'arm_ease': 0.002, 'stack': 0.025, 'hem': hem,
                 'flare': 1.3, 'prefold': 0.025, 'folds': 8, 'pin_hips': 0.6, 'split': 'both', 'overlap': 0.09, 'belt': True, 'buttons': 14,
                 'neck_shape': 'round', 'neck': 0.015, 'collar': 0.03, 'layer': 2, 'thickness': 0.0035, 'wear': 0.4, 'dust': 0.35}, **kw)


def G_kirtle(c, hem=0.03, sleeves='long', belt=False, **kw):
    """Women's fitted dress (laced bodice, full skirt to the ankles)."""
    return dict({'type': 'kirtle', 'fabric': 'wool', 'color': _c(c), 'ease': 0.014, 'loose': 0.012, 'hang': 0.3, 'cinch': True, 'cinch_ease': 0.016,
                 'torso_smooth': 40, 'sleeves': sleeves, 'stack': 0.025,
                 'sleeve_frac': 0.35 if sleeves == 'rolled' else 0.95, 'hem': hem, 'flare': 1.9, 'prefold': 0.05, 'folds': 11, 'neck': 0.05,
                 'layer': 2, 'pin_hips': 0.7, 'belt': belt, 'thickness': 0.0025, 'wear': 0.6, 'dust': 0.6}, **kw)


def G_gambeson(c, hem=0.6, **kw):
    return dict({'type': 'gambeson', 'fabric': 'twill', 'sim_fabric': 'padded', 'color': _c(c), 'ease': 0.028, 'hang': 0.4, 'sleeves': 'long', 'hem': hem,
                 'flare': 1.12, 'belt': True, 'pattern': 3, 'layer': 2, 'thickness': 0.006, 'cuff': False, 'wear': 0.6, 'dust': 0.45}, **kw)


def G_apron(c='linen', width=0.5, length=0.6, **kw):
    return dict({'type': 'apron', 'fabric': 'linen', 'color': _c(c), 'width': width, 'length': length, 'layer': 4, 'wear': 0.7, 'dust': 0.5}, **kw)


def G_coif(c=(0.5, 0.48, 0.42), **kw):
    return dict({'type': 'coif', 'fabric': 'linen', 'color': _c(c), 'front': 0.058, 'ease': 0.008, 'layer': 3}, **kw)


def G_kerchief(c, **kw):
    return dict({'type': 'kerchief', 'fabric': 'linen', 'color': _c(c), 'front': 0.062, 'ease': 0.009, 'layer': 3}, **kw)


def G_cap(c, **kw):
    return dict({'type': 'cap', 'fabric': 'felt', 'color': _c(c), 'front': 0.052, 'ease': 0.009, 'layer': 3}, **kw)


def G_hood(c, cape=0.3, **kw):
    return dict({'type': 'hood', 'fabric': 'wool', 'color': _c(c), 'ease': 0.022, 'layer': 3, 'cape_length': cape}, **kw)


def G_wrap(c, **kw):
    """A scarf wound round the lower face and the neck (the scout: identity hidden)."""
    return dict({'type': 'wrap', 'fabric': 'wool', 'color': _c(c), 'ease': 0.006, 'layer': 2.9, 'top': 0.016}, **kw)


def G_gloves(c, cuff=0.32, **kw):
    return dict({'type': 'gloves', 'fabric': 'leather', 'color': _c(c), 'cuff': cuff, 'layer': 1.5, 'wear': 0.5, 'thickness': 0.0015, 'turn': 0.006}, **kw)


def G_veil(c=(0.48, 0.46, 0.4), length=0.5, **kw):
    # thin, with a narrow turned hem (a 1.2 cm turn-up with copied UVs read as a striated band)
    return dict({'type': 'veil', 'fabric': 'linen', 'sim_fabric': 'fine', 'color': _c(c), 'length': length, 'layer': 5,
                 'thickness': 0.0009, 'turn': 0.004}, **kw)


def G_cloak(c, length=1.0, **kw):
    return dict({'type': 'cloak', 'fabric': 'wool', 'sim_fabric': 'heavywool', 'color': _c(c), 'length': length, 'flare': 0.3, 'gap': 0.9, 'layer': 4}, **kw)


def G_capelet(c, length=0.27, fabric='wool', **kw):
    """A short closed shoulder cape (a hood's cape without the hood; fur: the King's tippet)."""
    return dict({'type': 'cape', 'fabric': fabric, 'sim_fabric': 'heavywool' if fabric != 'fur' else 'felt', 'color': _c(c), 'closed': True,
                 'length': length, 'flare': 0.22, 'depth': 0.12, 'cols': 64, 'layer': 4, 'name': 'capelet', 'thickness': 0.004 if fabric == 'fur' else 0.003}, **kw)


def G_shawl(c, length=0.36, **kw):
    """A wool shawl over the shoulders, open at the front."""
    # (closed: an open shawl's front corners stood off the shoulders like flaps)
    return dict({'type': 'cape', 'fabric': 'wool', 'sim_fabric': 'wool', 'color': _c(c), 'closed': True, 'gap': 0.0, 'length': length,
                 'flare': 0.2, 'depth': 0.12, 'layer': 4, 'name': 'capeshawl'}, **kw)


def riding_clothes(outer, shirt='linen', trousers='walnut', boots='walnut', belt=True, split=True, hem=0.5, boot_h=0.82, **coat_kw):
    return [G_trousers(trousers, tuck=boot_h - 0.06), G_boots(boots, height=boot_h), G_shirt(shirt, collar=0.014),
            G_coat(outer, hem=hem, split=split, belt=belt, overlap=0.07, **coat_kw)]


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


# warm, ordinary Cling cloth: dyes faded and dulled by sun and washing (the bright woad blue, weld
# chartreuse, madder salmon, teal and plum read as modern costume colours at distance)
CLING = {
    'brick': [0.2, 0.075, 0.045], 'rust': [0.2, 0.085, 0.045], 'russet': [0.17, 0.08, 0.05], 'fadedwoad': [0.075, 0.088, 0.11],
    'straw': [0.33, 0.27, 0.15], 'ochre': [0.27, 0.17, 0.085], 'sage': [0.12, 0.14, 0.1], 'moss': [0.085, 0.095, 0.055],
    'oatmeal': [0.34, 0.3, 0.23], 'undyed': [0.4, 0.36, 0.29], 'walnut': [0.1, 0.066, 0.045], 'greybrown': [0.13, 0.115, 0.095],
    'plumbrown': [0.11, 0.065, 0.06], 'madderpink': [0.26, 0.12, 0.09], 'linen': [0.46, 0.43, 0.37], 'darkgrey': [0.06, 0.058, 0.056],
}
LEATHER_C = {'tan': [0.2, 0.11, 0.05], 'brown': [0.11, 0.06, 0.03], 'dark': [0.05, 0.032, 0.02], 'black': [0.025, 0.02, 0.018]}
IRIS_TINT = {'grey': [0.42, 0.44, 0.45], 'blue': [0.42, 0.47, 0.52], 'bluegreen': [0.44, 0.5, 0.48], 'green': [0.5, 0.55, 0.45],
             'brown': [0.55, 0.45, 0.36], 'brownlight': [0.55, 0.47, 0.38], 'darkbrown': [0.5, 0.4, 0.32]}


def cast():
    C = []
    # ================================================================ Abby
    # coat dye with real chroma (linear 0.065/0.082/0.055 took on the light: teal-grey in daylight,
    # near-black in the flight frames); sRGB about (63, 81, 56), hue ~105 deg
    ABBY_GREEN = [0.05, 0.085, 0.04]
    abby = {
        'id': 'abby', 'name': 'Abby', 'lod': 'hero',
        'macro': {'gender': 0.0, 'age': 0.43, 'muscle': 0.58, 'weight': 0.42, 'height': 0.55, 'proportions': 0.75, 'race': VERDOR_RACE},
        'details': _merge(VERDOR_FACE, {'mouth/mouth-lowerlip-volume': 0.2, 'chin/chin-height': -0.1, 'nose/nose-hump': 0.1}),
        'skin': {'texture': 'young_lightskinned_female_diffuse3', 'tone': [0.98, 0.95, 0.92], 'saturation': 0.86, 'redness': 0.15, 'flush': 0.55, 'age': 0.15, 'rough': 0.46},
        'eyes': {'iris': 'brownlight', 'tint': IRIS_TINT['brownlight']},
        'brows': 'eyebrow006', 'lashes': 'eyelashes02',
        # braid brought forward over the RIGHT shoulder (her LEFT arm is the injured one): it reads
        # from the front, and the hair is parted (not slicked back like a cap)
        'hair': {'color': HAIR['brown'], 'style': 'braid', 'hang': 'R', 'part': 0.0045, 'loft': 0.011, 'length': 0.4, 'loose': 0.03, 'count': 18000},
        # a daylight squint and a slight asymmetric set of the mouth (a blank stare reads as a doll)
        'expression': {'eye-left-slit': 0.22, 'eye-right-slit': 0.18, 'mouth-corner-puller': (0.18, 'R'), 'eyebrows-left-inner-up': 0.12},
        'outfit': riding_clothes(ABBY_GREEN, shirt=[0.31, 0.275, 0.21], trousers=[0.085, 0.06, 0.042], boots=LEATHER_C['brown'], hem=0.6,
                                 belt_style='leather', belt_color=[0.13, 0.072, 0.036], buckle='brass'),
        'pose': 'stand', 'pose_params': {'weight': 'R', 'contrapposto': 0.9, 'head_yaw': 0.12, 'head_roll': -0.03, 'belt_hand': 'R'},
        'notes': 'canon: riding clothes with a muted green outer layer; LEFT arm is the injured one',
    }
    C.append(abby)

    # the LEFT arm crosses the body in these two: its sleeve follows the arm firmly and the coat
    # does not self-collide (sleeve and front panel caught between arm and chest shredded)
    def _arm_across(outfit):
        out_ = [dict(g) for g in outfit]
        for g in out_:
            if g['type'] == 'coat':
                g.update(pin_sleeves=0.8, self_collision=False, arm_ease=-0.008, overlap=0.0)
        return out_
    pain = {'eyebrows-left-down': 0.35, 'eyebrows-right-down': 0.3, 'eyebrows-left-inner-up': 0.35, 'eyebrows-right-inner-up': 0.3,
            'mouth-compression': 0.45, 'eye-left-slit': 0.35, 'eye-right-slit': 0.3, 'mouth-depression': (0.2, 'L')}
    C.append(variant(abby, 'abby_injured', pose='injured_arm', pose_params={'weight': 'R', 'contrapposto': 0.6}, outfit=_arm_across(abby['outfit']), expression=pain))
    C.append(variant(abby, 'abby_sling', pose='sling', pose_params={'weight': 'L', 'contrapposto': 0.6, 'head_yaw': 0.08},
                     outfit=_arm_across(abby['outfit']), expression=dict(pain, **{'mouth-compression': 0.2, 'eye-left-slit': 0.22, 'eye-right-slit': 0.2})))
    ride_outfit = [dict(g, overlap=0.0) if g['type'] == 'coat' else g for g in abby['outfit']]
    C.append(variant(abby, 'abby_ride', pose='ride', pose_params={'lean': 0.14, 'reach': 0.3}, cloth_subdiv=0, outfit=ride_outfit))
    C.append(variant(abby, 'abby_ride_injured', pose='ride_injured', pose_params={}, lod='mid', outfit=ride_outfit, expression=pain))
    # ================================================================ Remi
    remi = {
        'id': 'remi', 'name': 'Remi (Prince Remi IV)', 'lod': 'hero',
        'macro': {'gender': 1.0, 'age': 0.52, 'muscle': 0.62, 'weight': 0.48, 'height': 0.56, 'proportions': 0.75, 'race': VERDOR_RACE},
        # clearly male: wider, squarer jaw and chin, a brow ridge, a stronger nose bridge, a
        # thicker neck (the shared Verdor oval read feminine and he and Abby looked alike)
        'details': _merge(VERDOR_FACE, {'head/head-oval': 0.0, 'head/head-square': 0.55, 'chin/chin-width': 0.45, 'chin/chin-bones': 0.5,
                                        'chin/chin-prominent': 0.35, 'chin/chin-height': 0.15, 'forehead/forehead-nubian': 0.35,
                                        'eyebrows/eyebrows-trans-forward': 0.35, 'nose/nose-scale-vert': 0.2, 'nose/nose-width1': 0.25,
                                        'nose/nose-hump': 0.35, 'neck/neck-scale-horiz': 0.35, 'neck/measure-neck-circ': 0.45,
                                        'mouth/mouth-upperlip-volume': -0.15, 'mouth/mouth-lowerlip-volume': -0.05, 'cheek/l-cheek-volume': -0.2,
                                        'cheek/r-cheek-volume': -0.2, 'asym/asym-brown-2': 0.3, 'asym/asym-nose-2': 0.25}),
        'skin': {'texture': 'young_lightskinned_male_diffuse2', 'tone': [0.95, 0.89, 0.83], 'saturation': 0.9, 'redness': 0.25, 'flush': 0.45, 'age': 0.25, 'rough': 0.5},
        'eyes': {'iris': 'brownlight', 'tint': IRIS_TINT['brown']},
        'brows': 'eyebrow002', 'lashes': 'eyelashes01',
        # a short, textured crop with a side part - his own, not Abby's slicked-back look
        'hair': {'color': HAIR['darkbrown'], 'style': 'crop', 'length': (0.03, 0.075), 'flow': 'side', 'part_x': 0.028, 'curl': 0.12, 'loft': 0.008,
                 'clump': 0.3, 'beard': {'count': 0, 'moustache': True, 'shadow': 0.9}},
        'expression': {'eye-left-slit': 0.15, 'eye-right-slit': 0.12, 'mouth-corner-puller': (0.1, 'L')},
        # a short (upper-thigh) riding coat in muted blue over dark trousers and knee boots: the
        # dark riding clothes show (a knee-length coat read as a blue robe)
        'outfit': riding_clothes([0.046, 0.058, 0.082], shirt=[0.05, 0.05, 0.052], trousers='charcoal', boots=LEATHER_C['dark'], hem=0.74,
                                 boot_h=0.86, belt_style='leather', belt_color=[0.15, 0.085, 0.045], pouch=True, flare=1.35, tongue=0.065),
        # (his left hand on the belt, Abby's right: the two-shot is not one pose mirrored twice)
        'pose': 'stand', 'pose_params': {'weight': 'L', 'contrapposto': 1.0, 'head_yaw': 0.2, 'belt_hand': 'L', 'free_fwd': 0.09, 'elbow': 0.3},
        'notes': 'canon: dark riding clothes with a muted blue outer layer',
    }
    C.append(remi)
    C.append(variant(remi, 'remi_ride', pose='ride', pose_params={'lean': 0.12, 'reach': 0.32}, cloth_subdiv=0,
                     outfit=[dict(g, overlap=0.0) if g['type'] == 'coat' else g for g in remi['outfit']]))
    # ========================================================== Alexandria
    alex = person('alexandria', 'Queen Alexandria', 0.0, 0.62, 'fair', lod='hero', muscle=0.4, weight=0.45, height=0.55,
                  details=_merge(VERDOR_FACE, {'nose/nose-scale-vert': 0.1, 'chin/chin-height': 0.1, 'cheek/l-cheek-bones': 0.35, 'cheek/r-cheek-bones': 0.32,
                                               'eyes/l-eye-bag': 0.2, 'eyes/r-eye-bag': 0.2, 'mouth/mouth-scale-horiz': -0.05}),
                  hair={'color': HAIR['chestnut'], 'style': 'pulled', 'count': 9000, 'loft': 0.005},
                  eyes=('brownlight', IRIS_TINT['brownlight']), brows='eyebrow007',
                  expression={'mouth-corner-puller': (0.08, 'L'), 'eye-left-slit': 0.08, 'eye-right-slit': 0.08},
                  outfit=[G_shoes(LEATHER_C['dark']),
                          # restrained but costly: deep wine fine wool, a fitted laced bodice (bodice_pin),
                          # a full gored skirt pooling on the floor with a short train, a low girdle with
                          # gilt mounts and a long pendant end (a slate tube read as a nun or a maid)
                          G_kirtle([0.075, 0.016, 0.03], hem=-0.05, fabric='wool', sim_fabric='heavywool', sheen=0.6, neck=0.07, flare=2.7, train=0.16, folds=15,
                                   prefold=0.06, wear=0.08, dust=0.05, hang=1.0, torso_smooth=80, cinch_ease=0.012, bodice_pin=0.75, name='gown',
                                   belt=True, belt_style='girdle', belt_dy=-0.075, belt_color=[0.05, 0.03, 0.02], buckle='gold', tongue=0.4, pin_sleeves=0.6),
                          # the veil is pinned over a fine linen kerchief that covers the crown and the
                          # hair (a veil hanging off the back of a bare head read as a sheet)
                          G_kerchief([0.56, 0.54, 0.5], front=0.07, tail=False, ease=0.007, fabric='linen'),
                          G_veil([0.54, 0.52, 0.47], length=0.55)],
                  accessories=[{'prop': 'circlet', 'dy': 0.05, 'tilt': -0.12, 'fit': 0.012, 'kw': {'h': 0.01}}],
                  # hands folded at the waist: the right hand laid over the left (true contact)
                  pose='clasp', pose_params={'weight': 'L', 'contrapposto': 0.5, 'reach': 0.2, 'dy': -0.02, 'head_yaw': -0.08}, cloth_subdiv=1,
                  notes='canon: a restrained formal gown; the veil and the slim gold fillet holding it are proposals (no crown in the screenplay)')
    alex['skin'].update({'texture': 'middleage_lightskinned_female_diffuse2', 'age': 0.35})
    C.append(alex)
    # ========================================================== Queen Fall
    # fitted command riding clothes, cut and coloured nothing like the Verdor siblings' coats:
    # a close near-black wool doublet with a standing collar and short split skirts, leather
    # gauntlets, fitted trousers, tall boots; braided coronet. No heraldry.
    fall_out = [G_trousers([0.026, 0.025, 0.028], tuck=0.92, ease=0.011), G_boots(LEATHER_C['black'], height=0.98),
                G_doublet([0.03, 0.03, 0.035], hem=0.66, belt_style='leather', belt_color=[0.05, 0.035, 0.026], buckle='iron', tongue=0.07, belt_width=0.028),
                G_gloves([0.03, 0.022, 0.018], cuff=0.4)]
    fall = person('fall', 'Queen Fall', 0.0, 0.55, 'light', lod='hero', muscle=0.6, weight=0.4, height=0.6,
                  details={'nose/nose-hump': 0.3, 'nose/nose-scale-horiz': -0.1, 'chin/chin-prominent': 0.3, 'cheek/l-cheek-bones': 0.4, 'cheek/r-cheek-bones': 0.4,
                           'eyebrows/eyebrows-angle': 0.3, 'head/head-oval': 0.3, 'asym/asym-mouth-2': 0.2, 'asym/asym-eye-1': 0.2},
                  hair={'color': HAIR['black'], 'style': 'coronet', 'length': 0.5, 'loft': 0.006},
                  eyes=('grey', IRIS_TINT['grey']), brows='eyebrow005', outfit=fall_out,
                  expression={'eyebrows-left-down': 0.15, 'eyebrows-right-down': 0.12, 'eye-left-slit': 0.15, 'eye-right-slit': 0.15, 'mouth-compression': 0.15},
                  # (hands clasped behind the back read as a figure without arms from the front: a gloved
                  # hand set on the belt, the other arm easy, chin a little up)
                  pose='stand', pose_params={'weight': 'L', 'contrapposto': 0.8, 'head_pitch': 0.06, 'head_yaw': -0.15, 'belt_hand': 'L', 'elbow': 0.3, 'arm_out': 0.16},
                  notes='canon: fitted riding clothes suitable for command')
    C.append(fall)
    C.append(variant(fall, 'fall_ride', pose='ride', pose_params={'lean': 0.18, 'reach': 0.3}, lod='mid',
                     outfit=[dict(g, overlap=0.0) if g['type'] == 'doublet' else g for g in fall_out]))
    # ======================================================= King of Cling
    # status without a prop gag: a deep madder wool gown to below the knee, a fur tippet over the
    # shoulders, a gold chain of office, a belt with a gilt buckle and purse, and a slim gold
    # circlet (canon: a crown is optional and never a gag)
    king = person('king', 'King of Cling', 1.0, 0.68, 'olive', lod='hero', muscle=0.45, weight=0.6, height=0.5,
                  details={'nose/nose-scale-horiz': 0.2, 'nose/nose-point-width': 0.3, 'mouth/mouth-scale-horiz': 0.1, 'cheek/l-cheek-volume': 0.3,
                           'cheek/r-cheek-volume': 0.3, 'eyes/l-eye-bag': 0.4, 'eyes/r-eye-bag': 0.4, 'head/head-round': 0.3, 'asym/asym-nose-1': 0.2},
                  # grey hair and beard of ONE colour family (salt-and-pepper per strand); a full beard
                  # in clumps with a moustache over the lip, thinning on the cheeks
                  hair={'color': [0.11, 0.1, 0.09], 'style': 'crop', 'length': (0.02, 0.05), 'flow': 'back', 'curl': 0.15, 'loft': 0.009, 'clump': 0.3,
                        'salt': 0.3,
                        'beard': {'count': 14000, 'length': (0.01, 0.026), 'curl': 0.22, 'shadow': 0.8, 'color': [0.11, 0.1, 0.09], 'clump': 0.4,
                                  'moustache_len': 0.017, 'salt': 0.32}},
                  eyes=('brown', IRIS_TINT['brown']), brows='eyebrow004',
                  expression={'mouth-corner-puller': 0.35, 'eye-left-slit': 0.2, 'eye-right-slit': 0.2, 'eyebrows-left-inner-up': 0.1},
                  outfit=[G_hose([0.09, 0.05, 0.035]), G_shoes(LEATHER_C['dark']), G_shirt('undyed', collar=0.0),
                          G_tunic([0.12, 0.042, 0.022], hem=0.28, flare=1.75, ease=0.024, neck=0.035, wear=0.15, dust=0.1, sheen=0.5, name='gown',
                                  belt_style='leather', belt_color=[0.14, 0.08, 0.04], buckle='gold', pouch=True),
                          G_capelet([0.11, 0.075, 0.045], length=0.25, fabric='fur')],
                  accessories=[{'prop': 'chain'}, {'prop': 'circlet', 'dy': 0.05, 'tilt': -0.1, 'fit': 0.01, 'kw': {'h': 0.012}}],
                  pose='gesture', pose_params={'weight': 'R', 'contrapposto': 0.7, 'head_yaw': 0.1, 'head_roll': 0.04},
                  notes='screenplay: approachable; crown optional and never a prop gag (a slim circlet is a proposal). Warm festival clothes are a proposal')
    king['skin'].update({'texture': 'middleage_lightskinned_male_diffuse', 'redness': 0.35})
    C.append(king)
    # =========================================================== household
    C.append(person('attendant', 'Attendant', 0.0, 0.47, 'light', muscle=0.45, weight=0.5, height=0.45,
                    details={'nose/nose-scale-vert': -0.1, 'head/head-round': 0.3, 'asym/asym-eye-2': 0.3},
                    hair={'color': HAIR['brown'], 'style': 'pulled', 'count': 5000, 'loft': 0.003},
                    outfit=[G_shoes(LEATHER_C['brown']), G_kirtle(CLING['greybrown'], hem=0.04, sleeves='long'), G_apron(CLING['linen'], width=0.48, length=0.62), G_coif()],
                    expression={'mouth-corner-puller': 0.12},
                    pose='cloth', pose_params={'weight': 'L', 'contrapposto': 0.6, 'head_yaw': 0.1}, notes='suggested: plain household clothes'))
    healer = person('healer', 'Healer', 0.0, 0.74, 'light', muscle=0.45, weight=0.6, height=0.42,
                    details={'nose/nose-scale-vert': 0.2, 'nose/nose-hump': 0.3, 'mouth/mouth-scale-horiz': -0.1, 'chin/chin-prominent': -0.1, 'head/head-round': 0.3,
                             'asym/asym-eye-1': 0.4, 'asym/asym-mouth-2': 0.3, 'asym/asym-nose-1': -0.3},
                    hair={'color': HAIR['salt'], 'style': 'pulled', 'count': 5000, 'loft': 0.003},
                    eyes=('grey', IRIS_TINT['grey']), brows='eyebrow007',
                    outfit=[G_shoes(LEATHER_C['brown']), G_kirtle(CLING['russet'], hem=0.03, sleeves='rolled'), G_apron(CLING['linen'], width=0.52, length=0.62),
                            G_kerchief([0.5, 0.48, 0.42], front=0.064, tail=True)],
                    pose='bowl', pose_params={'weight': 'L', 'contrapposto': 0.6, 'head_pitch': 0.1, 'flex': 0.06}, notes='suggested: clean work clothes, apron')
    healer['skin'].update({'texture': 'old_lightskinned_female_diffuse2'})
    C.append(healer)
    C.append(person('messenger', 'Royal Messenger', 1.0, 0.45, 'olive', muscle=0.55, weight=0.35, height=0.55,
                    details={'nose/nose-scale-horiz': -0.1, 'chin/chin-width': -0.1, 'head/head-oval': 0.4, 'asym/asym-nose-2': 0.3},
                    hair={'color': HAIR['black'], 'style': 'crop', 'length': (0.02, 0.05), 'curl': 0.5, 'clump': 0.5},
                    outfit=[G_hose(CLING['walnut']), G_boots(LEATHER_C['tan'], height=0.45), G_shirt('linen'),
                            G_tunic(CLING['straw'], hem=0.62, flare=1.3, ease=0.016, belt_style='leather', belt_color=LEATHER_C['brown'], pouch=True)],
                    pose='scroll', pose_params={'weight': 'R', 'contrapposto': 0.8, 'head_yaw': -0.1}, notes='suggested: light clothes for running'))
    # ========================================================= grounds crew
    keeper = person('keeper1', 'Ground keeper', 1.0, 0.6, 'tan', lod='hero', muscle=0.62, weight=0.6, height=0.5,
                    details={'nose/nose-scale-horiz': 0.25, 'nose/nose-flaring': 0.2, 'chin/chin-width': 0.2, 'head/head-square': 0.3, 'eyes/l-eye-bag': 0.3,
                             'eyes/r-eye-bag': 0.3, 'asym/asym-jaw-1': 0.3},
                    hair={'color': HAIR['brown'], 'style': 'crop', 'length': (0.01, 0.03), 'beard': {'count': 7000, 'length': (0.005, 0.014), 'curl': 0.5, 'shadow': 0.8, 'clump': 0.5}},
                    outfit=[G_trousers(CLING['walnut'], tuck=0.49), G_boots(LEATHER_C['brown'], height=0.55), G_shirt('undyed'),
                            G_tunic(CLING['russet'], hem=0.48, sleeves='rolled', sleeve_frac=0.4, belt_style='leather', belt_color=LEATHER_C['dark']),
                            G_hood(CLING['oatmeal'], cape=0.32)],
                    expression={'eye-left-slit': 0.25, 'eye-right-slit': 0.25, 'mouth-open': 0.15},
                    pose='call', pose_params={'weight': 'L', 'contrapposto': 0.7}, cloth_subdiv=0, notes='suggested: sturdy work clothes')
    C.append(keeper)
    C.append(person('keeper2', 'Ground keeper (2)', 0.0, 0.52, 'light', muscle=0.62, weight=0.55, height=0.52,
                    details={'nose/nose-hump': 0.2, 'chin/chin-prominent': 0.2, 'asym/asym-eye-3': 0.3},
                    hair={'color': HAIR['auburn'], 'style': 'braid', 'length': 0.3, 'count': 9000, 'hang': 'L', 'part': 0.004},
                    outfit=[G_trousers(CLING['greybrown'], tuck=0.54), G_boots(LEATHER_C['brown'], height=0.6), G_shirt('linen'),
                            G_tunic(CLING['sage'], hem=0.5, belt_style='cord', belt_color=[0.3, 0.25, 0.17])],
                    pose='rope_front', pose_params={'weight': 'R', 'contrapposto': 0.7, 'head_yaw': 0.12}, notes='suggested: sturdy work clothes'))
    # =================================================================== Cling
    C.append(person('vendor', 'Vendor', 1.0, 0.64, 'olive', muscle=0.5, weight=0.8, height=0.45,
                    details={'nose/nose-scale-horiz': 0.3, 'cheek/l-cheek-volume': 0.4, 'cheek/r-cheek-volume': 0.4, 'head/head-round': 0.4},
                    hair={'color': HAIR['darkbrown'], 'style': 'none', 'beard': {'count': 6000, 'length': (0.004, 0.012), 'curl': 0.5, 'shadow': 0.8, 'clump': 0.5}},
                    outfit=[G_hose(CLING['walnut']), G_shoes(LEATHER_C['tan']), G_shirt('undyed'), G_tunic(CLING['ochre'], hem=0.45, belt_style='leather', pouch=True),
                            G_apron(CLING['oatmeal'], width=0.45, length=0.5), G_cap(CLING['fadedwoad'])],
                    expression={'mouth-corner-puller': 0.3},
                    pose='crate', pose_params={'weight': 'L', 'contrapposto': 0.6}, notes='suggested: ordinary festival clothes'))
    parent = person('parent', 'Parent', 0.0, 0.5, 'olive', muscle=0.45, weight=0.55, height=0.48,
                    details={'nose/nose-scale-vert': 0.1, 'mouth/mouth-scale-horiz': 0.1, 'head/head-oval': 0.3, 'asym/asym-eye-2': 0.3},
                    hair={'color': HAIR['darkbrown'], 'style': 'pulled', 'count': 5000, 'loft': 0.003},
                    outfit=[G_shoes(LEATHER_C['brown']), G_kirtle(CLING['brick'], hem=0.05), G_apron(CLING['undyed'], width=0.46, length=0.55),
                            G_kerchief([0.5, 0.46, 0.37], tail=True)],
                    expression={'mouth-corner-puller': 0.2},
                    pose='hold_child', pose_params={'weight': 'R', 'contrapposto': 0.6, 'hand_out': 0.2, 'head_pitch': 0.14, 'head_yaw': 0.15}, notes='drops the parcel later in 3C')
    C.append(parent)
    C.append(person('child', 'Child', 0.0, 0.12, 'olive', lod='hero', muscle=0.5, weight=0.45, height=0.5,
                    details={'head/head-round': 0.3, 'nose/nose-scale-vert': -0.1},
                    hair={'color': HAIR['brown'], 'style': 'braid', 'length': 0.2, 'count': 8000, 'part': 0.004},
                    expression={'mouth-corner-puller': 0.3, 'eyebrows-left-inner-up': 0.15, 'eyebrows-right-inner-up': 0.15},
                    outfit=[G_hose(CLING['greybrown']), G_shoes(LEATHER_C['tan']), G_tunic(CLING['sage'], hem=0.25, flare=1.5, ease=0.014, belt_style='cord')],
                    pose='child_hand', pose_params={'weight': 'L', 'contrapposto': 0.5, 'hand_target': [-0.2, 0.8, 0.08]},
                    cloth_subdiv=0, notes='no age stated in the screenplay'))
    C.append(person('musician', 'Musician (lute)', 1.0, 0.58, 'light', muscle=0.45, weight=0.42, height=0.48,
                    details={'nose/nose-scale-vert': 0.25, 'nose/nose-point-width': -0.2, 'mouth/mouth-scale-horiz': 0.15, 'head/head-oval': 0.4, 'asym/asym-eye-4': 0.4},
                    hair={'color': HAIR['auburn'], 'style': 'crop', 'length': (0.02, 0.06), 'flow': 'forward', 'curl': 0.5, 'clump': 0.6,
                          'beard': {'count': 5000, 'length': (0.004, 0.012), 'curl': 0.5, 'shadow': 0.6, 'coverage': 'chin', 'clump': 0.5}},
                    eyes=('green', IRIS_TINT['green']),
                    expression={'mouth-corner-puller': 0.35, 'eye-left-slit': 0.2, 'eye-right-slit': 0.2},
                    outfit=[G_hose(CLING['brick']), G_shoes(LEATHER_C['brown']), G_shirt('linen'), G_tunic(CLING['straw'], hem=0.55, belt_style='sash', belt_color=CLING['fadedwoad'])],
                    pose='lute', pose_params={'weight': 'R', 'contrapposto': 0.7}, notes='instrument is a proposal'))
    C.append(person('musician2', 'Musician (recorder)', 0.0, 0.48, 'brown', muscle=0.45, weight=0.5, height=0.5,
                    details={'nose/nose-flaring': 0.2, 'mouth/mouth-lowerlip-volume': 0.3, 'head/head-oval': 0.3},
                    hair={'color': HAIR['black'], 'style': 'pulled', 'count': 5000, 'loft': 0.003},
                    outfit=[G_shoes(LEATHER_C['brown']), G_kirtle(CLING['moss'], hem=0.05), G_shawl(CLING['ochre'], length=0.34), G_kerchief(CLING['straw'], tail=True)],
                    pose='recorder', pose_params={'weight': 'L', 'contrapposto': 0.6}, notes='instrument is a proposal'))
    # ================================================================== guards
    def guard(cid, name, tone, age, details, hair, pose, accessories, gambeson=(0.38, 0.33, 0.24), hose='walnut', hat=True, lod='mid', pp=None, **kw):
        acc = list(accessories) + ([{'prop': 'kettle_hat'}] if hat else [])
        return person(cid, name, 1.0, age, tone, lod=lod, muscle=0.66, weight=0.55, height=0.52, details=details, hair=hair,
                      outfit=[G_hose(hose), G_boots(LEATHER_C['brown'], height=0.7), G_gambeson(gambeson, belt_style='leather', belt_color=LEATHER_C['dark'])],
                      accessories=acc, pose=pose, pose_params=dict({'weight': 'L', 'contrapposto': 0.6}, **(pp or {})),
                      notes='plain guard gear, no badges or insignia', **kw)
    # gambesons in undyed linen, ochre, brown - vertical quilted channels (period), worn unevenly
    C.append(guard('guard_captain', 'Guard Captain', 'light', 0.66, {'nose/nose-hump': 0.4, 'chin/chin-prominent': 0.3, 'head/head-square': 0.4, 'eyes/l-eye-bag': 0.3, 'eyes/r-eye-bag': 0.3},
                   {'color': HAIR['salt'], 'style': 'crop', 'length': (0.008, 0.02), 'beard': {'count': 6000, 'length': (0.004, 0.01), 'curl': 0.4, 'shadow': 0.8, 'clump': 0.5}},
                   'hand_on_belt', [], gambeson=(0.17, 0.12, 0.08), hose='charcoal', hat=False,
                   expression={'eyebrows-left-down': 0.2, 'eyebrows-right-down': 0.2, 'mouth-compression': 0.2}))
    C.append(guard('guard1', 'Guard', 'olive', 0.55, {'nose/nose-scale-horiz': 0.25, 'nose/nose-flaring': 0.2, 'chin/chin-width': 0.25, 'head/head-square': 0.4, 'asym/asym-nose-3': 0.4},
                   {'color': HAIR['black'], 'style': 'crop', 'length': (0.008, 0.02), 'flow': 'forward', 'beard': {'count': 6000, 'length': (0.006, 0.016), 'curl': 0.5, 'shadow': 0.8, 'clump': 0.5}},
                   'spear', [{'prop': 'sword'}], gambeson=(0.27, 0.19, 0.1), pp={'spear_h': 0.0, 'lean': 0.04}))
    C.append(guard('guard2', 'Guard (2)', 'light', 0.48, {'nose/nose-scale-vert': 0.2, 'chin/chin-height': 0.2, 'head/head-oval': 0.3},
                   {'color': HAIR['dirtyblond'], 'style': 'crop', 'length': (0.01, 0.03), 'beard': {'count': 0, 'shadow': 0.6}},
                   'spear_shoulder', [{'prop': 'sword'}], gambeson=(0.36, 0.32, 0.25), pp={'weight': 'R'}))
    C.append(guard('guard3', 'Guard (3)', 'brown', 0.52, {'nose/nose-flaring': 0.3, 'mouth/mouth-scale-horiz': 0.1, 'head/head-square': 0.2},
                   {'color': HAIR['black'], 'style': 'crop', 'length': (0.004, 0.01), 'curl': 0.6, 'beard': {'count': 5000, 'length': (0.003, 0.008), 'curl': 0.7, 'shadow': 0.8}},
                   'spear_lean', [{'prop': 'sword'}], gambeson=(0.15, 0.11, 0.075), pp={'spear_h': 0.05}))
    C.append(person('watchman', 'Watchman', 1.0, 0.62, 'light', lod='hero', muscle=0.55, weight=0.5, height=0.5,
                    details={'nose/nose-scale-horiz': 0.2, 'nose/nose-point-width': 0.3, 'chin/chin-width': 0.2, 'head/head-rectangular': 0.3, 'asym/asym-jaw-2': 0.3, 'asym/asym-eye-3': 0.3},
                    hair={'color': HAIR['brown'], 'style': 'none', 'beard': {'count': 9000, 'length': (0.006, 0.016), 'curl': 0.4, 'shadow': 0.8, 'clump': 0.6, 'salt': 0.2}},
                    eyes=('bluegreen', IRIS_TINT['bluegreen']), brows='eyebrow004',
                    expression={'eye-left-opened-up': 0.3, 'eye-right-opened-up': 0.3, 'eyebrows-left-up': 0.3, 'eyebrows-right-up': 0.3, 'mouth-open': 0.2},
                    outfit=[G_hose(CLING['greybrown']), G_boots(LEATHER_C['brown'], height=0.6), G_shirt('undyed'), G_tunic(CLING['oatmeal'], hem=0.5, belt_style='leather'),
                            G_hood(CLING['russet'], cape=0.34),
                            G_cloak([0.09, 0.08, 0.065], length=1.05, gap=1.3)],
                    pose='point_up', pose_params={'weight': 'R', 'contrapposto': 0.7}, cloth_subdiv=0, notes='sees Starlight first (3A-3B)'))
    C.append(person('villager_hurt', 'Injured villager', 1.0, 0.56, 'olive', muscle=0.5, weight=0.5, height=0.5,
                    details={'nose/nose-hump': 0.2, 'head/head-oval': 0.2, 'asym/asym-mouth-1': 0.3},
                    hair={'color': HAIR['darkbrown'], 'style': 'crop', 'length': (0.015, 0.04), 'curl': 0.3, 'clump': 0.5, 'beard': {'count': 3000, 'length': (0.002, 0.005), 'shadow': 0.7}},
                    expression=pain,
                    outfit=[G_hose(CLING['walnut']), G_shoes(LEATHER_C['brown']), G_shirt('undyed'), G_tunic(CLING['undyed'], hem=0.5, wear=0.9, dust=0.9, belt_style='cord')],
                    pose='hurt', pose_params={'weight': 'R', 'contrapposto': 0.5}, notes='3C: injured but alive, dusty'))
    # ========================================================= scout + sailors
    # identity hidden: a deep hood over a scarf wound up to the bridge of the nose, head down
    C.append(person('scout_ride', 'Scout rider', 1.0, 0.5, 'light', muscle=0.6, weight=0.4, height=0.5,
                    hair={'color': HAIR['brown'], 'style': 'none'},
                    outfit=[G_trousers([0.06, 0.055, 0.045], tuck=0.79), G_boots(LEATHER_C['dark'], height=0.85), G_shirt('undyed'),
                            G_coat([0.1, 0.09, 0.07], hem=0.5, neck=0.05, neck_shape='round', belt_style='leather', belt_color=LEATHER_C['dark']),
                            G_wrap([0.07, 0.065, 0.055], top=0.006),
                            G_hood([0.08, 0.075, 0.06], cape=0.3, ease=0.03, deep=0.075), G_gloves([0.05, 0.035, 0.022], cuff=0.3)],
                    pose='ride', pose_params={'lean': 0.3, 'reach': 0.34, 'head_pitch': 0.45}, notes='face never shown: deep hood, face wrap, head down; no markings'))
    C.append(person('sailor1', 'Sailor', 1.0, 0.5, 'tan', muscle=0.7, weight=0.45, height=0.5,
                    details={'nose/nose-hump': 0.3, 'chin/chin-prominent': 0.2, 'asym/asym-nose-1': 0.3},
                    hair={'color': HAIR['dirtyblond'], 'style': 'crop', 'length': (0.02, 0.06), 'curl': 0.5, 'clump': 0.6,
                          'beard': {'count': 5000, 'length': (0.004, 0.01), 'curl': 0.5, 'clump': 0.5}},
                    expression={'eye-left-slit': 0.3, 'eye-right-slit': 0.3, 'mouth-compression': 0.3, 'eyebrows-left-down': 0.2, 'eyebrows-right-down': 0.2},
                    # rolled-up trousers, barefoot on deck; tar and salt (wear / dust)
                    outfit=[G_trousers(CLING['greybrown'], bottom=0.16, wear=0.9, dust=0.8, dustColor=[0.25, 0.24, 0.22]), G_shirt('linen'),
                            G_tunic(CLING['darkgrey'], hem=0.62, sleeves='rolled', sleeve_frac=0.45, belt=True, belt_style='cord', wear=0.9, dust=0.7), G_cap(CLING['russet'])],
                    pose='rope', pose_params={'weight': 'L', 'contrapposto': 0.3}, notes='suggested: simple sailor clothes (barefoot on deck)'))
    C.append(person('sailor2', 'Harbor crew', 1.0, 0.6, 'brown', muscle=0.66, weight=0.6, height=0.48,
                    details={'nose/nose-scale-horiz': 0.2, 'head/head-square': 0.2},
                    hair={'color': HAIR['black'], 'style': 'crop', 'length': (0.004, 0.012), 'curl': 0.7, 'beard': {'count': 4000, 'length': (0.003, 0.008), 'curl': 0.7}},
                    outfit=[G_trousers(CLING['walnut'], bottom=0.2, wear=0.9, dust=0.8), G_shoes(LEATHER_C['dark']), G_shirt('undyed'),
                            G_tunic(CLING['russet'], hem=0.6, sleeves='rolled', sleeve_frac=0.4, belt_style='leather', wear=0.9, dust=0.7),
                            G_apron([0.2, 0.17, 0.13], width=0.44, length=0.5, fabric='leather')],
                    pose='crate', pose_params={'weight': 'R', 'contrapposto': 0.5}, notes='suggested: sailor clothes'))
    # ============================================== festival crowd kit (Cling)
    C.extend(crowd())
    return C


# (id, gender, age, tone, build (muscle, weight, height), hair, top (kind, dye), head cover, pose,
#  extra: layer (apron|shawl|capelet|hood|rolled), belt style, footwear, expression, pose params)
def crowd():
    out = []
    K = CLING
    rows = [
        ('crowd01', 0.0, 0.42, 'fair', (0.45, 0.45, 0.5), {'style': 'braid', 'color': HAIR['blond'], 'length': 0.34, 'hang': 'L', 'part': 0.004},
         ('kirtle', 'fadedwoad'), None, 'cheer', dict(layer='apron', foot='shoes', ex='laugh', pp={'head_yaw': 0.25})),
        ('crowd02', 1.0, 0.5, 'light', (0.55, 0.55, 0.52), {'style': 'crop', 'color': HAIR['brown'], 'length': (0.015, 0.04), 'clump': 0.5},
         ('tunic', 'brick'), ('cap', 'moss'), 'drink', dict(belt='leather', pouch=True, foot='ankle', ex='smile', pp={'head_yaw': -0.35})),
        ('crowd03', 0.0, 0.7, 'light', (0.35, 0.85, 0.4), {'style': 'pulled', 'color': HAIR['grey'], 'count': 4000, 'loft': 0.003},
         ('kirtle', 'plumbrown'), ('coif+veil', None), 'basket_hip', dict(layer='shawl', shawl='greybrown', foot='shoes', ex='smile', pp={'flex': 0.1, 'head_pitch': 0.05})),
        ('crowd04', 1.0, 0.36, 'olive', (0.5, 0.4, 0.62), {'style': 'crop', 'color': HAIR['black'], 'length': (0.02, 0.06), 'curl': 0.6, 'clump': 0.6},
         ('tunic', 'straw'), None, 'cheer2', dict(belt='cord', foot='shoes', ex='laugh', layer='rolled')),
        ('crowd05', 0.0, 0.55, 'brown', (0.45, 0.6, 0.48), {'style': 'pulled', 'color': HAIR['black'], 'count': 4000, 'loft': 0.003},
         ('kirtle', 'ochre'), ('kerchief', 'brick'), 'basket_front', dict(layer='apron', foot='shoes', ex='smile', pp={'head_yaw': 0.3})),
        ('crowd06', 1.0, 0.78, 'light', (0.35, 0.45, 0.42), {'style': 'none', 'color': HAIR['white'], 'beard': {'count': 7000, 'length': (0.012, 0.035), 'curl': 0.4, 'color': HAIR['white'], 'clump': 0.7}},
         ('tunic', 'greybrown'), ('hood', 'russet'), 'stand', dict(belt='cord', foot='shoes', ex='smile', hem=0.32, pp={'flex': 0.22, 'head_pitch': -0.12, 'elbow': 0.4})),
        ('crowd07', 0.0, 0.3, 'olive', (0.45, 0.4, 0.45), {'style': 'braid', 'color': HAIR['darkbrown'], 'length': 0.4, 'hang': 'R', 'part': 0.004},
         ('kirtle', 'sage'), None, 'eat', dict(layer='shawl', shawl='madderpink', foot='shoes', ex='smile', pp={'at': 'chest', 'head_pitch': 0.12})),
        ('crowd08', 1.0, 0.46, 'tan', (0.65, 0.65, 0.5), {'style': 'crop', 'color': HAIR['brown'], 'length': (0.008, 0.02), 'beard': {'count': 6000, 'length': (0.006, 0.016), 'curl': 0.5, 'clump': 0.6}},
         ('tunic', 'brick'), None, 'parcel_front', dict(layer='apron', apron=[0.2, 0.15, 0.1], belt='leather', foot='ankle', ex='smile')),
        ('crowd09', 0.0, 0.62, 'light', (0.4, 0.7, 0.42), {'style': 'pulled', 'color': HAIR['chestnut'], 'count': 4000, 'loft': 0.003},
         ('kirtle', 'russet'), ('kerchief', 'undyed'), 'hands_front', dict(layer='apron', foot='shoes', ex='smile', pp={'head_yaw': -0.25})),
        ('crowd10', 1.0, 0.25, 'fair', (0.45, 0.3, 0.85), {'style': 'crop', 'color': HAIR['auburn'], 'length': (0.03, 0.07), 'curl': 0.4, 'clump': 0.6},
         ('tunic', 'fadedwoad'), None, 'cheer', dict(belt='leather', foot='knee', ex='laugh', layer='capelet', capelet='walnut')),
        ('crowd11', 0.0, 0.48, 'deep', (0.5, 0.55, 0.52), {'style': 'pulled', 'color': HAIR['black'], 'count': 4000, 'loft': 0.003},
         ('kirtle', 'straw'), ('kerchief', 'rust'), 'gesture', dict(foot='shoes', ex='smile', belt='sash', sash='brick', pp={'head_yaw': 0.2})),
        ('crowd12', 1.0, 0.58, 'olive', (0.45, 0.95, 0.42), {'style': 'none', 'color': HAIR['darkbrown'], 'beard': {'count': 6000, 'length': (0.005, 0.012), 'curl': 0.5, 'clump': 0.5}},
         ('tunic', 'oatmeal'), ('cap', 'brick'), 'eat', dict(belt='leather', pouch=True, foot='ankle', ex=None, layer='apron', apron=[0.42, 0.39, 0.33])),
        ('crowd13', 0.0, 0.2, 'light', (0.45, 0.4, 0.45), {'style': 'braid', 'color': HAIR['auburn'], 'length': 0.36, 'part': 0.004},
         ('kirtle', 'madderpink'), None, 'stand', dict(foot='shoes', ex='smile', belt='cord', pp={'head_yaw': 0.4, 'head_pitch': -0.1})),
        ('crowd14', 1.0, 0.4, 'brown', (0.78, 0.72, 0.18), {'style': 'crop', 'color': HAIR['black'], 'length': (0.004, 0.01), 'curl': 0.7},
         ('tunic', 'ochre'), None, 'drink', dict(belt='leather', foot='ankle', ex='laugh', layer='rolled')),
        ('crowd15', 0.0, 0.82, 'light', (0.3, 0.45, 0.3), {'style': 'pulled', 'color': HAIR['white'], 'count': 4000, 'loft': 0.003},
         ('kirtle', 'greybrown'), ('coif+veil', None), 'stand', dict(layer='shawl', shawl='walnut', foot='shoes', ex='smile', pp={'flex': 0.28, 'head_pitch': -0.18, 'elbow': 0.5})),
        ('crowd16', 1.0, 0.33, 'light', (0.55, 0.45, 0.5), {'style': 'crop', 'color': HAIR['dirtyblond'], 'length': (0.02, 0.05), 'beard': {'count': 0, 'shadow': 0.5}},
         ('tunic', 'moss'), ('hood', 'fadedwoad'), 'call', dict(belt='leather', foot='knee', ex='laugh')),
        ('crowd17', 0.0, 0.38, 'tan', (0.45, 0.5, 0.5), {'style': 'bun', 'color': HAIR['darkbrown'], 'count': 7000, 'loft': 0.004},
         ('kirtle', 'brick'), None, 'bowl', dict(layer='apron', foot='shoes', ex='smile', pp={'head_yaw': -0.2})),
        ('crowd18', 1.0, 0.15, 'light', (0.5, 0.45, 0.5), {'style': 'crop', 'color': HAIR['blond'], 'length': (0.02, 0.05), 'clump': 0.6},
         ('tunic', 'fadedwoad'), None, 'cheer', dict(belt='cord', foot='shoes', ex='laugh')),
    ]
    EX = {'smile': {'mouth-corner-puller': 0.35, 'eye-left-slit': 0.18, 'eye-right-slit': 0.18},
          'laugh': {'mouth-corner-puller': 0.55, 'mouth-open': 0.3, 'eye-left-slit': 0.35, 'eye-right-slit': 0.35, 'eyebrows-left-up': 0.15, 'eyebrows-right-up': 0.15}}
    for i, (cid, g, age, tone, (mu_, we, he), hair, top, head, pose, x) in enumerate(rows):
        out_ = []
        lc = [LEATHER_C['tan'], LEATHER_C['brown'], LEATHER_C['dark'], [0.15, 0.085, 0.04]][i % 4]
        foot = x.get('foot', 'shoes')
        if foot == 'shoes':
            out_.append(G_shoes(lc, height=0.3 + 0.04 * (i % 2)))
        elif foot == 'ankle':
            out_.append(G_boots(lc, height=0.4))
        else:
            out_.append(G_boots(lc, height=0.78))
        belt = x.get('belt', 'none')
        bkw = {} if belt == 'none' else {'belt_style': belt, 'belt_color': {'cord': [0.32, 0.27, 0.19], 'sash': K.get(x.get('sash', 'brick'))}.get(belt, lc),
                                          'pouch': x.get('pouch', False)}
        if top[0] == 'kirtle':
            out_.append(G_kirtle(K[top[1]], hem=0.05 if age > 0.2 else 0.12, sleeves='rolled' if i % 3 == 0 else 'long', seed=i,
                                 belt=belt != 'none', **bkw))
        else:
            hose = ['walnut', 'greybrown', 'russet', 'darkgrey', 'walnut', 'moss'][i % 6]
            out_ += [G_hose(K[hose]), G_shirt(['linen', 'undyed', 'oatmeal'][i % 3]),
                     G_tunic(K[top[1]], hem=x.get('hem', 0.42 + 0.06 * (i % 3)), seed=i, sleeves='rolled' if x.get('layer') == 'rolled' else 'long',
                             belt=belt != 'none', **bkw)]
        lay = x.get('layer')
        if lay == 'apron':
            out_.append(G_apron(x.get('apron', ['linen', 'oatmeal', 'undyed'][i % 3]), width=0.46, length=0.55 if top[0] == 'kirtle' else 0.48))
        elif lay == 'shawl':
            out_.append(G_shawl(K[x.get('shawl', 'greybrown')], length=0.34 + 0.03 * (i % 2)))
        elif lay == 'capelet':
            out_.append(G_capelet(K[x.get('capelet', 'walnut')], length=0.26))
        if head:
            k, c = head
            if k == 'coif+veil':
                out_ += [G_coif(), G_veil(length=0.45)]
            elif k == 'kerchief':
                out_.append(G_kerchief(K[c], tail=True))
            elif k == 'cap':
                out_.append(G_cap(K[c]))
            elif k == 'hood':
                out_.append(G_hood(K[c], cape=0.28))
        h = dict(hair)
        h.setdefault('color', HAIR['brown'])
        pp = {'weight': 'L' if i % 2 else 'R', 'contrapposto': 0.5 + 0.12 * (i % 4), 'head_yaw': ((i * 7) % 5 - 2) * 0.1, 'head_pitch': -0.05 * (i % 3)}
        pp.update(x.get('pp', {}))
        eye = ['brown', 'brownlight', 'grey', 'green', 'blue'][i % 5]
        out.append(person(cid, f'Festival villager {i + 1}', g, age, tone, muscle=mu_, weight=we, height=he,
                          details={'asym/asym-eye-%d' % (1 + i % 4): 0.3, 'asym/asym-nose-%d' % (1 + i % 3): 0.3,
                                   'nose/nose-scale-horiz': ((i * 37) % 7 - 3) * 0.08, 'head/head-oval': ((i * 13) % 5) * 0.08},
                          hair=h, outfit=out_, pose=pose, pose_params=pp, expression=EX.get(x.get('ex')),
                          eyes=(eye, IRIS_TINT.get(eye, [0.55, 0.47, 0.4])),
                          brows=['eyebrow001', 'eyebrow003', 'eyebrow005', 'eyebrow008', 'eyebrow010'][i % 5],
                          notes='festival crowd kit (Cling palette: warm cloth, ordinary clothing)'))
    return out
