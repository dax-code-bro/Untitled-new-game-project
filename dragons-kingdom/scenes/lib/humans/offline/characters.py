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
    'undyed': [0.42, 0.37, 0.29], 'linen': [0.62, 0.58, 0.5], 'oatmeal': [0.36, 0.31, 0.23], 'walnut': [0.11, 0.07, 0.045],
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


def riding_clothes(outer, shirt='linen', trousers='walnut', boots='walnut', belt=True, split=False, hem=0.6):
    return [
        {'type': 'hose', 'fabric': 'wool', 'color': DYE[trousers] if isinstance(trousers, str) else trousers, 'ease': 0.004, 'layer': 0, 'wear': 0.5},
        {'type': 'boots', 'fabric': 'leather', 'color': DYE[boots] if isinstance(boots, str) else boots, 'height': 0.82, 'ease': 0.007, 'layer': 0, 'wear': 0.6, 'dust': 0.6},
        {'type': 'shirt', 'fabric': 'linen', 'color': DYE[shirt] if isinstance(shirt, str) else shirt, 'ease': 0.005, 'sleeves': 'long', 'sim': False, 'layer': 1, 'neck': 0.012, 'thickness': 0.0015},
        {'type': 'coat', 'fabric': 'wool', 'color': outer, 'ease': 0.018, 'loose': 0.022, 'sleeves': 'long', 'sleeve_frac': 0.96, 'hem': hem, 'flare': 1.42, 'prefold': 0.05, 'folds': 11, 'pin_hips': 0.6,
         'split': 'front' if split else 'none', 'belt': belt, 'neck': 0.028, 'layer': 2, 'thickness': 0.003, 'wear': 0.45, 'dust': 0.3},
    ]


def variant(base, cid, **kw):
    v = dict(base)
    v['id'] = cid
    for k, x in kw.items():
        v[k] = x
    return v


def cast():
    C = []
    # ------------------------------------------------------------------ Abby
    abby = {
        'id': 'abby', 'name': 'Abby', 'lod': 'hero',
        'macro': {'gender': 0.0, 'age': 0.43, 'muscle': 0.58, 'weight': 0.42, 'height': 0.55, 'proportions': 0.75, 'race': VERDOR_RACE},
        'details': _merge(VERDOR_FACE, {'mouth/mouth-lowerlip-volume': 0.2, 'chin/chin-height': -0.1, 'nose/nose-hump': 0.1}),
        'skin': {'texture': 'young_lightskinned_female_diffuse3', 'tone': [1.0, 0.97, 0.94], 'saturation': 1.0, 'redness': 0.25, 'age': 0.15, 'rough': 0.5},
        'eyes': {'iris': 'brownlight', 'tint': [0.75, 0.62, 0.5]},
        'brows': 'eyebrow006', 'lashes': 'eyelashes02',
        'hair': {'color': HAIR['brown'], 'style': 'braid'},
        'outfit': riding_clothes([0.065, 0.082, 0.055], shirt='linen', trousers='walnut', boots=[0.045, 0.028, 0.017]),
        'pose': 'stand', 'pose_params': {'weight': 'R', 'head_yaw': 0.05},
    }
    C.append(abby)
    C.append(variant(abby, 'abby_injured', pose='injured_arm', pose_params={'weight': 'R', 'contrapposto': 0.4}))
    C.append(variant(abby, 'abby_sling', pose='sling', pose_params={'weight': 'L', 'contrapposto': 0.5},
                     outfit=riding_clothes([0.065, 0.082, 0.055], shirt='linen', trousers='walnut', boots=[0.045, 0.028, 0.017])))
    # ------------------------------------------------------------------ Remi
    remi = {
        'id': 'remi', 'name': 'Remi (Prince Remi IV)', 'lod': 'hero',
        'macro': {'gender': 1.0, 'age': 0.5, 'muscle': 0.64, 'weight': 0.47, 'height': 0.535, 'proportions': 0.75, 'race': VERDOR_RACE},
        'details': _merge(VERDOR_FACE, {'chin/chin-width': 0.15, 'chin/chin-prominent': 0.3, 'head/head-square': 0.25, 'neck/neck-scale-horiz': 0.15,
                                        'eyebrows/eyebrows-trans-down': 0.15, 'asym/asym-brown-2': 0.3, 'asym/asym-nose-2': 0.25}),
        'skin': {'texture': 'young_lightskinned_male_diffuse2', 'tone': [1.0, 0.95, 0.9], 'saturation': 0.95, 'redness': 0.3, 'age': 0.2, 'rough': 0.52},
        'eyes': {'iris': 'brownlight', 'tint': [0.6, 0.5, 0.4]},
        'brows': 'eyebrow002', 'lashes': 'eyelashes01',
        'hair': {'color': HAIR['darkbrown'], 'style': 'crop', 'length': (0.015, 0.065), 'flow': 'back', 'curl': 0.25,
                 'beard': {'count': 2500, 'length': (0.0012, 0.003), 'width': 0.0003, 'moustache': True, 'curl': 0.2, 'shadow': 0.7}},
        'outfit': riding_clothes([0.042, 0.058, 0.09], shirt=DYE['slate'], trousers='charcoal', boots=[0.03, 0.02, 0.014]),
        'pose': 'stand', 'pose_params': {'weight': 'L', 'contrapposto': 0.7, 'head_yaw': -0.05},
    }
    C.append(remi)
    # ---------------------------------------------------------------- healer
    C.append({
        'id': 'healer', 'name': 'Healer', 'lod': 'mid',
        'macro': {'gender': 0.0, 'age': 0.74, 'muscle': 0.45, 'weight': 0.55, 'height': 0.45, 'proportions': 0.55, 'race': (0.25, 0.1, 0.65)},
        'details': {'nose/nose-scale-vert': 0.2, 'nose/nose-hump': 0.3, 'mouth/mouth-scale-horiz': -0.1, 'chin/chin-prominent': -0.1, 'head/head-round': 0.3,
                    'asym/asym-eye-1': 0.4, 'asym/asym-mouth-2': 0.3, 'asym/asym-nose-1': -0.3},
        'skin': {'texture': 'old_lightskinned_female_diffuse2', 'tone': [0.92, 0.86, 0.8], 'saturation': 0.95, 'redness': 0.2, 'age': 0.8, 'rough': 0.55},
        'eyes': {'iris': 'grey', 'tint': [0.85, 0.85, 0.85]},
        'brows': 'eyebrow007', 'lashes': 'eyelashes03',
        'hair': {'color': HAIR['salt'], 'style': 'bun', 'density': 0.6},
        'outfit': [
            {'type': 'shoes', 'fabric': 'leather', 'color': [0.04, 0.026, 0.016], 'height': 0.35, 'layer': 0},
            {'type': 'kirtle', 'fabric': 'wool', 'color': DYE['russet'], 'ease': 0.016, 'loose': 0.015, 'sleeves': 'rolled', 'sleeve_frac': 0.35, 'hem': 0.03, 'flare': 1.9, 'prefold': 0.06, 'folds': 12, 'neck': 0.03, 'layer': 2, 'pin_hips': 0.7},
            {'type': 'apron', 'fabric': 'linen', 'color': DYE['linen'], 'width': 0.52, 'length': 0.62, 'layer': 4, 'wear': 0.6},
            {'type': 'coif', 'fabric': 'linen', 'color': [0.66, 0.63, 0.56], 'front': 0.058, 'layer': 3},
            {'type': 'veil', 'fabric': 'linen', 'sim_fabric': 'fine', 'color': [0.6, 0.58, 0.52], 'length': 0.5, 'layer': 5},
        ],
        'pose': 'stand', 'pose_params': {'weight': 'L', 'contrapposto': 0.5, 'elbow': 0.6, 'head_pitch': 0.08},
    })
    # -------------------------------------------------------------- watchman
    C.append({
        'id': 'watchman', 'name': 'Watchman', 'lod': 'mid',
        'macro': {'gender': 1.0, 'age': 0.62, 'muscle': 0.55, 'weight': 0.5, 'height': 0.5, 'proportions': 0.5, 'race': (0.15, 0.15, 0.7)},
        'details': {'nose/nose-scale-horiz': 0.2, 'nose/nose-point-width': 0.3, 'chin/chin-width': 0.2, 'head/head-rectangular': 0.3, 'asym/asym-jaw-2': 0.3, 'asym/asym-eye-3': 0.3},
        'skin': {'texture': 'middleage_lightskinned_male_diffuse', 'tone': [0.95, 0.87, 0.78], 'saturation': 1.0, 'redness': 0.4, 'age': 0.6, 'rough': 0.55},
        'eyes': {'iris': 'bluegreen', 'tint': [0.8, 0.85, 0.85]},
        'brows': 'eyebrow004', 'lashes': 'eyelashes01',
        'hair': {'color': HAIR['brown'], 'style': 'none', 'beard': {'count': 7000, 'length': (0.004, 0.012), 'curl': 0.4, 'shadow': 0.8}},
        'outfit': [
            {'type': 'hose', 'fabric': 'wool', 'color': DYE['grey'], 'layer': 0},
            {'type': 'boots', 'fabric': 'leather', 'color': [0.04, 0.026, 0.016], 'height': 0.6, 'layer': 0},
            {'type': 'tunic', 'fabric': 'wool', 'color': DYE['oatmeal'], 'ease': 0.02, 'loose': 0.025, 'sleeves': 'long', 'hem': 0.5, 'flare': 1.45, 'prefold': 0.05, 'folds': 10, 'belt': True, 'layer': 2},
            {'type': 'hood', 'fabric': 'wool', 'color': DYE['russet'], 'ease': 0.032, 'layer': 3, 'cape_length': 0.32},
            {'type': 'cloak', 'fabric': 'wool', 'sim_fabric': 'heavywool', 'color': [0.09, 0.08, 0.065], 'length': 1.05, 'flare': 0.32, 'gap': 0.9, 'layer': 4},
        ],
        'pose': 'point_up', 'pose_params': {'weight': 'R', 'contrapposto': 0.6},
    })
    # ------------------------------------------------------------------ guard
    C.append({
        'id': 'guard1', 'name': 'Guard', 'lod': 'mid',
        'macro': {'gender': 1.0, 'age': 0.55, 'muscle': 0.66, 'weight': 0.55, 'height': 0.52, 'proportions': 0.5, 'race': (0.35, 0.1, 0.55)},
        'details': {'nose/nose-scale-horiz': 0.25, 'nose/nose-flaring': 0.2, 'mouth/mouth-scale-horiz': 0.1, 'chin/chin-width': 0.25, 'head/head-square': 0.4, 'asym/asym-nose-3': 0.4},
        'skin': {'texture': 'middleage_lightskinned_male_diffuse2', 'tone': [0.82, 0.7, 0.6], 'saturation': 1.0, 'redness': 0.2, 'age': 0.5, 'rough': 0.55},
        'eyes': {'iris': 'brown', 'tint': [0.6, 0.5, 0.4]},
        'brows': 'eyebrow003', 'lashes': 'eyelashes01',
        'hair': {'color': HAIR['black'], 'style': 'crop', 'length': (0.008, 0.02), 'flow': 'forward', 'beard': {'count': 6000, 'length': (0.006, 0.016), 'curl': 0.5, 'shadow': 0.8}},
        'outfit': [
            {'type': 'hose', 'fabric': 'wool', 'color': DYE['walnut'], 'layer': 0},
            {'type': 'boots', 'fabric': 'leather', 'color': [0.035, 0.024, 0.016], 'height': 0.7, 'layer': 0},
            {'type': 'gambeson', 'fabric': 'twill', 'sim_fabric': 'padded', 'color': [0.38, 0.33, 0.24], 'ease': 0.028, 'sleeves': 'long', 'hem': 0.6, 'flare': 1.12,
             'belt': True, 'pattern': 1, 'layer': 2, 'thickness': 0.006},
        ],
        'accessories': [{'prop': 'kettle_hat'}, {'prop': 'sword'}],
        'pose': 'spear', 'pose_params': {'weight': 'L', 'contrapposto': 0.5},
    })
    # --------------------------------------------------------------- musician
    C.append({
        'id': 'musician', 'name': 'Musician', 'lod': 'mid',
        'macro': {'gender': 1.0, 'age': 0.58, 'muscle': 0.45, 'weight': 0.42, 'height': 0.48, 'proportions': 0.55, 'race': (0.1, 0.25, 0.65)},
        'details': {'nose/nose-scale-vert': 0.25, 'nose/nose-point-width': -0.2, 'mouth/mouth-scale-horiz': 0.15, 'head/head-oval': 0.4, 'eyes/l-eye-scale': 0.1, 'eyes/r-eye-scale': 0.1, 'asym/asym-eye-4': 0.4},
        'skin': {'texture': 'middleage_lightskinned_male_diffuse', 'tone': [0.95, 0.88, 0.8], 'saturation': 1.0, 'redness': 0.35, 'age': 0.5, 'rough': 0.55},
        'eyes': {'iris': 'green', 'tint': [0.75, 0.8, 0.7]},
        'brows': 'eyebrow005', 'lashes': 'eyelashes01',
        'hair': {'color': HAIR['auburn'], 'style': 'crop', 'length': (0.02, 0.06), 'flow': 'forward', 'curl': 0.5,
                 'beard': {'count': 5000, 'length': (0.004, 0.012), 'curl': 0.5, 'shadow': 0.6, 'coverage': 'chin'}},
        'outfit': [
            {'type': 'hose', 'fabric': 'wool', 'color': DYE['madder'], 'layer': 0},
            {'type': 'shoes', 'fabric': 'leather', 'color': [0.05, 0.032, 0.02], 'height': 0.3, 'layer': 0},
            {'type': 'tunic', 'fabric': 'wool', 'color': DYE['weld'], 'ease': 0.02, 'loose': 0.025, 'sleeves': 'long', 'hem': 0.55, 'flare': 1.45, 'prefold': 0.05, 'belt': True, 'layer': 2},
        ],
        'pose': 'lute', 'pose_params': {'weight': 'R', 'contrapposto': 0.5},
    })
    return C
