#!/usr/bin/env python3
"""Build the shot list of the LOCKED SHOOTING SCRIPT (final/screenplay-final.md): final/shotlist.json + final/shotlist.md.

Every shot of the whole episode, in order: the handoff's shots (shots_data.py, with the changes the final script
makes to them) plus the shots of every proposed addition and rating-pass block (final_shots_data.py). Dialogue ids
and timings come from final/dialogue.json (tools/extract_final_dialogue.py), so run that first.

It reuses build.py's vocabulary (sets, flags, tags, the inframe parser) by executing only build.py's definitions,
so the handoff shot list (WRITE=1 python3 build.py) is unchanged and both lists use the same words.

Checks (exit 1 on any failure): every spoken line of the final script is covered exactly once, in order; the order of
additions and rating-pass blocks matches the script; every block in the script has shots and no shot belongs to a
block the script does not have; each addition's and rating-pass block's picture time equals what
check_extended.ADDITION_SHOTS / check_final.RATING_SHOTS / check_final.CHANGE_SHOTS give, so this list and
check_final.py estimate the same runtime; no drink, smoke, drug or suggestive shot frames a child, Abby or Remi;
Starlight never has fire; the expected runtime is 50-60 min.

Usage: python3 tools/shotlist/final_build.py [--check]
"""
import json
import math
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
TOOLS = os.path.normpath(os.path.join(HERE, '..'))
EP = os.path.normpath(os.path.join(TOOLS, '..'))
sys.path.insert(0, HERE)
sys.path.insert(0, TOOLS)
import check_extended as ce    # noqa: E402
import check_final as cf       # noqa: E402
import final_shots_data as F   # noqa: E402

OUT_JSON = os.path.join(EP, 'final', 'shotlist.json')
OUT_MD = os.path.join(EP, 'final', 'shotlist.md')
DIALOGUE = os.path.join(EP, 'final', 'dialogue.json')

# ---- build.py's definitions only (its expansion and file writes are not run) -------------------------------------
_src = open(os.path.join(HERE, 'build.py'), encoding='utf-8').read()
_head = _src.split('# ------------------------------------------------------------ expand')[0]
B = {'__file__': os.path.join(HERE, 'build.py'), '__name__': 'shotlist_build_defs'}
_stdout = sys.stdout
sys.stdout = open(os.devnull, 'w')
try:
    exec(compile(_head, os.path.join(HERE, 'build.py'), 'exec'), B)
finally:
    sys.stdout.close()
    sys.stdout = _stdout
SHOTS = B['SHOTS']
FPS = B['FPS']
TURN_GAP = B['TURN_GAP']
SIZE = B['SIZE']
parse_inframe = B['parse_inframe']
speaker_in_frame = B['speaker_in_frame']
rhalf = B['rhalf']

SETS = dict(B['SETS'])
SETS.update({
    'ALEXANDRIA_ROOM': "Interior, Verdor palace: the queen's own room at first light; a window over the sea, an unslept bed, a sill with a wine jug and one cup (X1, R1).",
    'PALACE_CORRIDOR': 'Interior, Verdor palace: stone corridors with tall windows at intervals and daylight at the far end; a turn where no one can see (X1, X2, X13).',
    'VERDOR_AERIAL': "Air over Verdor's harbor and town: curved harbor wall, quay, slipway, nets on frames, market street, terraced hillside, the riding-school field, the palace on its high ground with the birthing chamber's high opening (X4, X9).",
    'OUTER_ROCKS': 'Sea stacks off the end of Verdor\'s coast: two leaning stacks with a narrow gap opening seaward, seabird ledges, white water, a low bank of sea mist on the seaward side. Must match in X6, X8 and 1F.',
    'SANTA_MARIA_DECK': "The Santa Maria's deck, rail and masthead at the quay: furled sails, coiled rope, the ship's boat, the off-watch crew's corner (X9, R4, R5, R9, X16).",
    'RIDING_SCHOOL_FIELD': 'The grassy field above Verdor\'s harbor at ground level: young riders, small dragons, the instructor (X16).',
    'CLING_ROAD': 'The broad road outside Cling and the gate from outside: country people, carts, farmland, dust (X14).',
})
FLAG_TEXT = dict(B['FLAG_TEXT'])
FLAG_TEXT.pop('SCOUT_SPECIES_SLITHERWING', None)
FLAG_TEXT.update({
    'SCOUT_OWN_DESIGN': 'The scout is a small, very fast dragon of its own design (no species, DRAGONS.md 2026-10-09): two legs, wings as forelimbs, horns.',
    'CHARCOAL_NOT_FASTER': 'Charcoal is never faster than the scout in a straight line. He closes through height, angles and the scout\'s turns.',
    'SIZE_DISPARITY': "Leaf's body is about a quarter of Charcoal's length (DRAGONS.md 2026-10-09; Charcoal ~36 m). Use long lenses so a foreground Leaf does not cheat the scale.",
    'LOW_STANCE': 'Dragon on the ground: low and level, belly near the ground, two legs folded or standing under the MIDDLE of the body, folded wings\' wrists touching down in front. No dog-sit on the haunches, no upright or rearing pose (DRAGONS.md 2026-10-16).',
    'REMI_BLOOD_1': "The scout's blood on Remi from the bite (1F): spattered and streaked on face, neck, hands and sleeves; none of it his. Same pattern in every shot until R8.",
    'REMI_BLOOD_2': 'After R8 (keeper\'s cloth): face mostly scrubbed, streaks left at the hairline and down the neck; hands and sleeves still dark.',
    'REMI_BLOOD_3': 'After X11 (his mother wipes hairline, neck and hands) and R9b (hands scrubbed at the healer\'s bowl): hands clean, red from scrubbing; sleeves stained for the rest of the day.',
    'CHARCOAL_JAW_BLOOD': "The scout's blood on Charcoal's lower jaw and throat from the bite until Remi washes it off in X15: wet at first, drying dark. Charcoal has no wound of his own.",
    'VILLAGER_INJURIES': 'Adult villager: split scalp (blood down one side of the face into the collar) and an open fracture of the RIGHT leg below the knee, from the second pass to the end; leg splinted with a banner pole in X27. He lives.',
    'NO_CHILD_IN_FRAME': 'Drink, smoke, drug or suggestive beat: no child (and not Abby or Remi) anywhere in frame (SERIES.md section 8).',
    'DEAD_ARE_ADULTS': 'Every dead body is an adult; partly covered or turned away, no faces, no lingering close-up.',
    'PENDING_WORDING': 'A line here keeps a scrapped dragon name until Daxtyn chooses new wording (DRAGONS.md): record it as written; plan a pickup for the alternative.',
})
TAG_TEXT = dict(B['TAG_TEXT'])
TAG_TEXT.update({
    'BLOOD': 'Blood on skin, scales, cloth, stone or water: wet and fresh, or drying.',
    'GORE': 'Open wound, burn damage, exposed bone, torn wing root or membrane.',
    'BODY_DEAD': 'Dead bodies, covered or partly seen.',
    'PROP_DRINK_SMOKE': 'Cups, jugs, flasks, pipes and smoke handled on camera.',
    'BIRDS': 'Flocks of seabirds lifting and wheeling.',
})
HARD_TAGS = set(B['HARD_TAGS']) | {'GORE', 'BIRDS'}
TAG_WEIGHT = dict(B['TAG_WEIGHT'])
TAG_WEIGHT.update({'BLOOD': 3, 'GORE': 4, 'BODY_DEAD': 3, 'PROP_DRINK_SMOKE': 2, 'BIRDS': 4})

GROUND_SETS = {'VERDOR_GROUNDS', 'VERDOR_HARBOR', 'RIDING_SCHOOL_FIELD', 'BIRTHING_CHAMBER'}
DRAGON_RE = re.compile(r"\b(charcoal|leaf|starlight|scout(?! rider)|hatchling|working dragon|small dragon|young dragon|dragons)\b")
HUMAN_RE = re.compile(r"\b(alexandria|abby|remi|attendant|keeper|healer|messenger|vendor|musician|king|captain|guard|watchman|child|parent|villager|partner|old woman|neighbor|master|sailor|lookout|crew|instructor|riders?|servants?|man|woman|people|crowd|townspeople|farmer|adults|queen fall|rider)\b")
CHILDISH_RE = re.compile(r"\b(child|children|abby|remi|young riders?|young attendant|kids?)\b")
LENS = {'EWS': '24 mm', 'WS': '35 mm', 'MS': '50 mm', 'CU': '85 mm', 'INS': '100 mm macro', 'POV': '35 mm (eyeline)', 'CARD': 'n/a'}

# Native-4K seconds per frame by set (velocity motion blur, --preset final, every frame drawn at 3840x2160).
# MEASURED anchors (this 4-vCPU machine, SwiftShader): style frames F1-F5, round 4, 8-sub-frame finish
# (episodes/s01e01/style-frames/README.md; scenes/lib/sets/PROGRESS.md): F1 47.8 s (shared machine), F2 434.7 s,
# F3 131.0 s, F4 428.7 s, F5 821.5 s. Going from 8 sub-frames to velocity motion blur measured 0.20x on F2
# (253 -> 50.7 s) and 0.33x on F1 (39 -> 12.7 s) (preview/render-plan.md). Expected = 0.25x for F3-F5, the
# measured 0.20x for F2 and the measured 12.7 s for F1; low/high = the 0.20x/0.33x ratios.
SPF = {
    'CARD_BLACK': (0, 0, 0, 'no 3D render (black or text)'),
    'SEA_COAST_DAWN': (14, 12.7, 16, 'MEASURED: F1 velocity 12.7 s (README "13 s (F1)"); round-4 F1 47.8 s x 0.33 = 15.8 s'),
    'PROLOGUE_VISTAS': (15, 12.7, 20, 'ESTIMATE: F1-class vistas (sea, haze, terrain at distance)'),
    'BIRTHING_CHAMBER': (107, 86, 141, 'ESTIMATE from MEASURED F4 428.7 s (8 sub-frames) x 0.20-0.33'),
    'ALEXANDRIA_ROOM': (64, 50, 90, 'ESTIMATE: 0.6 x F4 (one person, window light, no hatchling or cloth drape)'),
    'PALACE_CORRIDOR': (64, 50, 90, 'ESTIMATE: 0.6 x F4 (architecture interior, 1-4 people)'),
    'TREATMENT_ROOM': (86, 65, 115, 'ESTIMATE: 0.8 x F4 (interior, 3-4 hero people, coast through the opening)'),
    'VERDOR_GROUNDS': (87, 51, 143, 'ESTIMATE from MEASURED F2 434.7 s x 0.20 (the ratio measured on F2); low = older F2 velocity 50.7 s MEASURED'),
    'RIDING_SCHOOL_FIELD': (87, 51, 143, 'ESTIMATE: F2-class (grass, dragons, riders)'),
    'SKY_OFF_VERDOR': (33, 26, 43, 'ESTIMATE from MEASURED F3 131.0 s x 0.20-0.33'),
    'COASTAL_SKY_WATER': (33, 26, 43, 'ESTIMATE: F3-class (two creatures, riders, ocean)'),
    'OUTER_ROCKS': (46, 35, 65, 'ESTIMATE: 1.4 x F3 (sea stacks, birds, mist volumes)'),
    'VERDOR_AERIAL': (103, 70, 150, 'ESTIMATE: 0.5 x F5 (a whole town and harbor at a distance)'),
    'VERDOR_HARBOR': (154, 110, 210, 'ESTIMATE: 0.75 x F5 (quay, Santa Maria, people, ocean)'),
    'SANTA_MARIA_DECK': (87, 60, 130, 'ESTIMATE: F2-class (ship close, a few people, sea behind)'),
    'CLING_SQUARE': (205, 164, 271, 'ESTIMATE from MEASURED F5 821.5 s (8 sub-frames) x 0.20-0.33'),
    'CLING_ROAD': (164, 120, 220, 'ESTIMATE: 0.8 x F5 (road, gate, carts, crowd, farmland)'),
    'CLING_SKY': (144, 100, 200, 'ESTIMATE: 0.7 x F5 (Starlight hero over the village)'),
}
PASS_8SUB = {'1E-03': (131.0, 103.0, 146.0, 'MEASURED F3 with 8 accumulated sub-frames (velocity blur is wrong for this curved, very fast pass)')}

FACE_TXT = ("Faces: the same approved build from scenes/lib/humans in every shot (never a regenerated face); 50-85 mm at eye level, "
            "three-quarter to the lens, focus on the near eye, shallow depth of field; key from the set's real sun or practical, soft bounce fill; "
            "living micro-motion (breath, blinks every 3-6 s, small eye saccades and head drift) so no frame freezes; cut when the performance ends.")
LIPSYNC_TXT = ("Lip-sync: mouth shapes from the recorded take's word timings (forced alignment, as preview/vo/words.json), visemes kept subtle; "
               "over-the-shoulder or profile framing when the take is temporary TTS.")
CROWD_TXT = ("Crowd: named people are hero builds; the next ring are crowd-kit builds (16+ variants, costume colours varied, never two identical "
             "variants side by side) with offset idle/walk cycles and purposeful actions (carrying, eating, pointing); far people are cheaper builds "
             "softened by haze and depth of field; camera at human height so heads overlap; foreground cloth, poles or dust break up the frame; "
             "nothing loops visibly inside the shot.")
CROWD_SMALL_TXT = ("Background people: crowd-kit builds with distinct costumes and offset idle cycles, each doing one specific job; keep them in "
                   "soft focus behind the action.")
BLOOD_TXT = ("Blood as a make-up job: fresh blood dark red, wet and specular; drying blood browner and matte at the edges; decals with thickness on skin "
             "and cloth, drips following gravity and the weave; spray and splash as short-lived particles with motion blur; continuity of every "
             "stain is tracked shot to shot.")
GORE_TXT = ("Gore: one brief, readable close shot, in motion, cut on action, part of it in shadow or soft focus; the reaction carries the rest, "
            "as real productions do; never lingered on.")
DEAD_TXT = ("The dead: adults only; bodies partly covered (timber, cloth, banners) or turned away, no faces; stillness and settled dust are the read; "
            "staged behind the living; no lingering close-ups.")


def fail(msg):
    sys.stderr.write('final_build: ERROR: ' + msg + '\n')
    sys.exit(1)


def lens_for(s, flags):
    if s.get('lens'):
        return s['lens']
    cam = s['cam'].lower()
    if s['size'] == 'CARD':
        return 'n/a'
    if 'long lens' in cam or 'SIZE_DISPARITY' in flags:
        return '135-200 mm long lens (keeps the dragons\' size difference honest)'
    if 'air-to-air' in cam and s['size'] in ('WS', 'EWS'):
        return '100-135 mm from a camera ship'
    if 'aerial' in cam and s['size'] == 'EWS':
        return '35 mm aerial'
    return LENS[s['size']]


def main(argv):
    if not os.path.exists(DIALOGUE):
        fail('final/dialogue.json is missing: run tools/extract_final_dialogue.py first')
    DL = json.load(open(DIALOGUE, encoding='utf-8'))
    final_raw = open(cf.FINAL, encoding='utf-8').read()
    import hashlib
    if hashlib.sha256(final_raw.encode('utf-8')).hexdigest() != DL['source_sha256']:
        fail('final/dialogue.json is stale (the script changed): run tools/extract_final_dialogue.py first')
    LINES = {x['id']: x for x in DL['lines']}
    order_ids = [x['id'] for x in DL['lines']]

    L = final_raw.split('\n')
    top, nodes, errors = cf.parse(L)
    if errors:
        fail('marker errors in the final script: %s' % errors[:2])
    present = {n['id'] for n in nodes if n['kind'] in ('add', 'rp')}
    script_units = [n['id'] for n in sorted((n for n in nodes if n['kind'] in ('add', 'rp')), key=lambda n: n['start'])]
    changes = {n['id']: n for n in nodes if n['kind'] == 'ch'}

    # ---- sequence ---------------------------------------------------------------------------------------------------
    by_anchor = {}
    for blk in F.INSERTS:
        by_anchor.setdefault(blk['after'], []).append(blk)
    data_units = set()
    for blk in F.INSERTS:
        for s in blk['shots']:
            data_units.add(s['unit'])
    missing = [u for u in present if u not in data_units]
    extra = [u for u in data_units if u not in present]
    if missing:
        fail('blocks in the script with no shots: %s' % ', '.join(sorted(missing)))
    seq, dropped, drop_time = [], [], {}

    def emit_after(anchor, code):
        for blk in by_anchor.get(anchor, []):
            if blk['unit'] not in present:
                continue
            for s in blk['shots']:
                if s['unit'] not in present:
                    continue
                if s.get('drop'):
                    drop_time.setdefault(s['unit'], [0.0, 0.0])
                    drop_time[s['unit']][0] += s['a']
                    drop_time[s['unit']][1] += s['b']
                    dropped.append({'id': s['sid'], 'unit': s['unit'], 'played_by': s['drop'], 'what': s['action']})
                    continue
                d = dict(s)
                d['code'] = code
                seq.append(d)
            emit_after(blk['unit'], code)

    for s in SHOTS:
        s = dict(s)
        if s['sid'] in F.DROPS and F.DROPS[s['sid']][0] in present:
            dropped.append({'id': s['sid'], 'unit': 'handoff', 'played_by': F.DROPS[s['sid']][0], 'what': F.DROPS[s['sid']][1]})
            emit_after(s['sid'], s['code'])
            continue
        s.update(F.OVERRIDES.get(s['sid'], {}))
        s['unit'] = None
        seq.append(s)
        for x in F.EXTRA.get(s['sid'], []):
            d = {k: v for k, v in s.items() if k in ('set', 'tod', 'light', 'code')}
            d.update(x)
            d['unit'] = None
            seq.append(d)
        emit_after(s['sid'], s['code'])

    # unit order must follow the script
    parent = {n['id']: n['parent']['id'] for n in nodes if n['kind'] == 'rp' and n['parent']}
    seen_units = []
    for s in seq:
        u = s['unit']
        if u and u in parent and parent[u] not in seen_units:
            seen_units.append(parent[u])      # a rating-pass block opens its addition's first picture
        if u and u not in seen_units:
            seen_units.append(u)
    if seen_units != script_units:
        fail('shot order of blocks differs from the script:\n  shots : %s\n  script: %s' % (seen_units, script_units))

    # ---- timing parity with check_final.py ------------------------------------------------------------------------
    unit_sum = {}
    for s in seq:
        if s['unit']:
            t = unit_sum.setdefault(s['unit'], [0.0, 0.0])
            t[0] += s['a']
            t[1] += s['b']
    for u, (dt_a, dt_b) in drop_time.items():
        unit_sum.setdefault(u, [0.0, 0.0])
        unit_sum[u][0] += dt_a
        unit_sum[u][1] += dt_b
    parity = []
    for n in nodes:
        if n['kind'] == 'add':
            t = ce.ADDITION_SHOTS[n['id']]['shots']
            want_a = sum(x[1] for x in t) + sum(cf.CHANGE_SHOTS[c['id']][1] for c in n['children'] if c['kind'] == 'ch')
            want_b = sum(x[2] for x in t)
        elif n['kind'] == 'rp':
            t = cf.RATING_SHOTS[n['id']]['shots']
            want_a, want_b = sum(x[1] for x in t), sum(x[2] for x in t)
        else:
            continue
        got = unit_sum.get(n['id'], [0, 0])
        if abs(got[0] - want_a) > 1e-6 or abs(got[1] - want_b) > 1e-6:
            parity.append('%s: shots give action %.1f / breath %.1f s, check_final.py tables give %.1f / %.1f s' % (n['id'], got[0], got[1], want_a, want_b))
    # top-level changes add picture time to handoff shots
    top_ch = [n for n in top if n['kind'] == 'ch']
    base = {s['sid']: s for s in SHOTS}
    delta_want = sum(cf.CHANGE_SHOTS[n['id']][1] for n in top_ch)
    delta_got = 0.0
    for s in seq:
        if s['unit'] is None:
            if s['sid'] in base:
                delta_got += (s['a'] - base[s['sid']]['a']) + (s['b'] - base[s['sid']]['b'])
            else:
                delta_got += s['a'] + s['b']
    if abs(delta_got - delta_want) > 1e-6:
        parity.append('handoff shots: CHANGED picture time %.1f s, CHANGE_SHOTS says %.1f s' % (delta_got, delta_want))
    if parity:
        fail('timing differs from check_final.py:\n  ' + '\n  '.join(parity))

    # ---- expand -----------------------------------------------------------------------------------------------------
    idx = {s['sid']: i for i, s in enumerate(seq)}

    def at(*ids):
        for k in ids:
            if k in idx:
                return idx[k]
        return None
    i_injury, i_sling, i_cling = idx['1E-04'], idx['2C-12'], idx['3A-01']
    i_burn, i_wing, i_bite = idx['1F-14'], idx['1F-20'], idx['1F-17']
    i_scrub = at('R8-02', '2A-15')
    i_wipe = at('X11-05b', 'R9b-01', '2C-12')
    i_wash = at('X15-05', '3A-01')
    i_vill = at('R16-01', '3C-29')
    coverage, shots = {}, []
    for k, s in enumerate(seq):
        inframe = parse_inframe(s['inframe'])
        names = ' '.join(f['name'].lower() for f in inframe)
        dlg, dlg_s = [], 0.0
        for tok in s['lines'].split():
            lid, portion = (tok.split(':')[0], float(tok.split(':')[1])) if ':' in tok else (tok, 1.0)
            if lid not in LINES:
                fail('%s: unknown line %s' % (s['sid'], lid))
            x = LINES[lid]
            coverage[lid] = coverage.get(lid, 0) + portion
            on = x['speaker'] != 'NARRATOR' and x['speaker'] not in s.get('off', []) and speaker_in_frame(x['speaker'], inframe)
            e = {'id': lid, 'speaker': x['speaker'], 'first_words': ' '.join(x['text'].split()[:6]), 'origin': x['origin'],
                 'spoken_s': x['est_seconds'], 'line_seconds': round(x['est_seconds'] + TURN_GAP, 2), 'speaker_on_screen': on}
            if portion != 1.0:
                e['portion'] = portion
            if x['performance_note']:
                e['delivery'] = x['performance_note']
            if x['pending']:
                e['pending'] = x['pending']
            dlg.append(e)
            dlg_s += (x['est_seconds'] + TURN_GAP) * portion
        a, b = float(s['a']), float(s['b'])
        tags = list(dict.fromkeys(s.get('tags', [])))
        if any(d['speaker_on_screen'] for d in dlg) and s['size'] in ('MS', 'CU') and 'LIPSYNC' not in tags:
            tags.append('LIPSYNC')
        for t in tags:
            if t not in TAG_TEXT:
                fail('%s: unknown tag %s' % (s['sid'], t))
        flags = [('SCOUT_OWN_DESIGN' if f == 'SCOUT_SPECIES_SLITHERWING' else f) for f in s.get('flags', [])]

        def addf(f):
            if f not in flags:
                flags.append(f)
        if i_injury < k < i_cling and 'abby' in names:
            addf('ABBY_LEFT_ARM_INJURED')
        if i_sling <= k < i_cling and 'abby' in names:
            addf('ABBY_SLING_LEFT')
        if 'starlight' in names:
            addf('STARLIGHT_NO_WOUNDS')
            addf('STARLIGHT_NO_FIRE')
        if 'hatchling' in names:
            addf('HATCHLING_NO_GLOW')
        if 'charcoal' in names and re.search(r'\bleaf\b', names):
            addf('SIZE_DISPARITY')
        if k >= i_wing and re.search(r'\bscout\b(?! rider)', names):
            addf('SCOUT_LEFT_WING_LOST')
        if k >= i_burn and 'scout rider' in names:
            addf('BURNED_RIDER_ALIVE')
        if re.search(r'\bscout\b(?! rider)', names):
            addf('SCOUT_OWN_DESIGN')
        if s['code'] == '1F' and 'charcoal' in names and 'scout' in names:
            addf('CHARCOAL_NOT_FASTER')
        if re.search(r'\bremi\b', names) and k < i_cling:
            if i_bite < k < i_scrub:
                addf('REMI_BLOOD_1')
            elif i_scrub <= k < i_wipe:
                addf('REMI_BLOOD_2')
            elif i_wipe <= k:
                addf('REMI_BLOOD_3')
        if re.search(r'\bcharcoal\b', names) and i_bite <= k < i_wash and "shadow" not in names:
            addf('CHARCOAL_JAW_BLOOD')
        if 'villager' in names and k >= i_vill:
            addf('VILLAGER_INJURIES')
        if s['set'] in GROUND_SETS and DRAGON_RE.search(names) and not re.search(r'take[s]? off|takeoff|launch|descen|lands|landing|rises out|in flight|flying', s['action'], re.I):
            addf('LOW_STANCE')
        if any(LINES[d['id']]['original'] for d in dlg):
            addf('ORIGINAL_LINE_EXACT')
        if any(LINES[d['id']]['pending'] for d in dlg):
            addf('PENDING_WORDING')
        if 'PROP_DRINK_SMOKE' in tags:
            addf('NO_CHILD_IN_FRAME')
        if 'BODY_DEAD' in tags:
            addf('DEAD_ARE_ADULTS')
        for f in flags:
            if f not in FLAG_TEXT:
                fail('%s: unknown flag %s' % (s['sid'], f))
        if 'NO_CHILD_IN_FRAME' in flags and CHILDISH_RE.search(names):
            fail('%s: a drink/smoke/drug/suggestive shot frames %r (SERIES.md section 8)' % (s['sid'], CHILDISH_RE.search(names).group(0)))
        if 'starlight' in names and 'FIRE' in tags:
            fail('%s: Starlight with fire' % s['sid'])

        auto = max([2 if inframe else 1] + [TAG_WEIGHT.get(t, 2) for t in tags])
        diff = max(s.get('diff') or auto, 2 if inframe else 1)
        render = s.get('render', '3d')
        est = rhalf(dlg_s + a + b)
        low = rhalf(0.9 * dlg_s + 0.8 * a + 0.5 * b)
        high = rhalf(1.15 * dlg_s + 1.3 * a + 1.5 * b)
        if s['sid'] == 'E-01':
            low, est, high = 30.0, 40.0, 60.0
        # realism strategy for faces, crowds, gore
        notes = []
        human = bool(HUMAN_RE.search(names))
        if 'FACE_CLOSEUP' in tags or (human and s['size'] in ('CU', 'MS') and render == '3d'):
            notes.append(FACE_TXT)
        if 'LIPSYNC' in tags:
            notes.append(LIPSYNC_TXT)
        if 'CROWD' in tags:
            notes.append(CROWD_TXT)
        elif 'CROWD_SMALL' in tags:
            notes.append(CROWD_SMALL_TXT)
        if 'BLOOD' in tags or 'GORE' in tags:
            notes.append(BLOOD_TXT)
        if 'GORE' in tags:
            notes.append(GORE_TXT)
        if 'BODY_DEAD' in tags:
            notes.append(DEAD_TXT)
        if s.get('realism'):
            notes.insert(0, 'This shot: ' + s['realism'])
        realism = ' '.join(notes) if notes else None
        # native-4K seconds per frame
        if render != '3d':
            spf = (0, 0, 0, 'no 3D render')
        elif s['sid'] in PASS_8SUB:
            spf = PASS_8SUB[s['sid']]
        else:
            e, lo_, hi_, basis = SPF[s['set']]
            m = 1.0
            if 'DUST' in tags or 'DESTRUCTION' in tags:
                m *= 1.25
            if 'CROWD' in tags and not s['set'].startswith('CLING') and s['set'] not in ('VERDOR_HARBOR',):
                m *= 1.15
            if 'FOG' in tags and s['set'] not in ('OUTER_ROCKS',):
                m *= 1.1
            spf = (round(e * m, 1), round(lo_ * m, 1), round(hi_ * m, 1), basis + ('' if m == 1.0 else ' (x%.2f for dust/crowd/fog in this shot)' % m))
        unit = s['unit']
        shot = {
            'seq': len(shots) + 1, 'id': s['sid'], 'scene': s['code'],
            'part': unit, 'origin': 'handoff' if unit is None else ('rating_pass' if unit.startswith('R') else 'addition'),
            'set': s['set'], 'time_of_day': s['tod'], 'lighting': s['light'],
            'shot_size': SIZE[s['size']], 'lens': lens_for(s, flags), 'camera_move': s['cam'],
            'in_frame': [dict(f, kind=('dragon' if DRAGON_RE.search(f['name'].lower()) else 'person' if HUMAN_RE.search(f['name'].lower()) else 'element')) for f in inframe],
            'action': s['action'], 'dialogue': dlg, 'sound': s['sound'],
            'continuity_flags': flags,
            'timing': {'dialogue_s': round(dlg_s, 2), 'action_s': a, 'breath_s': b},
            'est_seconds': est, 'est_low_s': low, 'est_high_s': high, 'frames_at_24fps': int(round(est * FPS)),
            'render': render, 'difficulty': diff, 'difficulty_tags': tags, 'hard': diff >= 4,
            'native_4k_s_per_frame': {'expected': spf[0], 'low': spf[1], 'high': spf[2], 'basis': spf[3]},
            'realism_strategy': realism,
        }
        if s.get('note'):
            shot['note'] = s['note']
        shots.append(shot)

    # ---- coverage -------------------------------------------------------------------------------------------------------
    bad = [l for l in order_ids if abs(coverage.get(l, 0) - 1.0) > 1e-6]
    if bad:
        fail('line coverage problem: %s' % bad[:10])
    seen = []
    for s in shots:
        for d in s['dialogue']:
            if not seen or seen[-1] != d['id']:
                seen.append(d['id'])
    if seen != order_ids:
        k = next(i for i, (p, q) in enumerate(zip(seen, order_ids)) if p != q)
        fail('dialogue out of order at %s (expected %s)' % (seen[k], order_ids[k]))
    ids = [s['id'] for s in shots]
    if len(ids) != len(set(ids)):
        fail('duplicate shot ids')

    # ---- totals -----------------------------------------------------------------------------------------------------------
    def group(code):
        return 'PROLOGUE+TITLE' if code in ('PROLOGUE', 'TITLE') else code
    titles = dict((c, t) for c, t, *_ in B['EDIT_PLAN'])
    rows, t0 = [], 0.0
    for code in [r[0] for r in B['EDIT_PLAN']]:
        ss = [s for s in shots if group(s['scene']) == code]
        exp, lo, hi = (sum(s[k] for s in ss) for k in ('est_seconds', 'est_low_s', 'est_high_s'))
        rows.append({'scene': code, 'title': titles[code], 'start_s': t0, 'shots': len(ss),
                     'spoken_lines': len({d['id'] for s in ss for d in s['dialogue']}),
                     'parts': list(dict.fromkeys(s['part'] for s in ss if s['part'])),
                     'low_s': lo, 'expected_s': exp, 'high_s': hi, 'frames_expected': int(round(exp * FPS)),
                     'hard_shots': sum(1 for s in ss if s['hard']), 'sets': list(dict.fromkeys(s['set'] for s in ss))})
        t0 += exp
    T = {k: sum(r[k] for r in rows) for k in ('low_s', 'expected_s', 'high_s')}
    if not 3000 <= T['expected_s'] <= 3600:
        fail('expected runtime %.0f s is outside 50-60 min' % T['expected_s'])
    units = {}
    for s in shots:
        if s['part']:
            u = units.setdefault(s['part'], {'shots': 0, 'expected_s': 0.0})
            u['shots'] += 1
            u['expected_s'] += s['est_seconds']
    data = {
        'meta': {
            'title': "Dragon's Kingdom - S01E01 - shot list of the locked shooting script",
            'status': 'PLAN ONLY. Nothing has been rendered for the final script. Durations are animatic estimates, not measured footage. Every addition and rating-pass shot is proposed (SERIES.md section 5): in the script by default, not canon until Daxtyn accepts it.',
            'source': 'episodes/s01e01/final/screenplay-final.md', 'source_sha256': DL['source_sha256'],
            'dialogue': 'episodes/s01e01/final/dialogue.json',
            'generated_by': 'episodes/s01e01/tools/shotlist/final_build.py (handoff shots: tools/shotlist/shots_data.py; new shots: tools/shotlist/final_shots_data.py)',
            'fps': FPS, 'delivery': 'native 3840x2160, 24 fps, --preset final on every frame (SERIES.md section 2)',
            'ids': 'Handoff shots keep their ../shotlist.json ids (P-01 ... 3D-16, E-01); X#-NN are shots of proposed addition X#; R#-NN of rating-pass block R#; a letter suffix (1F-14b, X11-05b) is a picture added by a CHANGED block.',
            'estimate_model': 'Same as ../shotlist.json: expected = dialogue + action + breath (rounded to 0.5 s); low = 0.9/0.8/0.5 x; high = 1.15/1.3/1.5 x; dialogue = final/dialogue.json est_seconds + %.2f s cue gap per line. End titles 30/40/60 s by hand. The action and breath seconds of every addition and rating-pass block equal check_final.py\'s tables, so both tools give the same runtime.' % TURN_GAP,
            'lens': 'Full-frame-equivalent focal length suggested per shot: default by shot size (EWS 24, WS 35, MS 50, CU 85, INS 100 macro), long lenses where two dragons share the frame.',
            'native_4k_s_per_frame': 'Seconds of rendering per 4K frame on this 4-vCPU CPU-only machine, one browser, velocity motion blur: MEASURED style-frame figures and estimates derived from them (see render-schedule.md).',
            'dropped_shots': dropped,
        },
        'sets': [{'id': k, 'description': v, 'shots': sum(1 for s in shots if s['set'] == k),
                  'expected_s': sum(s['est_seconds'] for s in shots if s['set'] == k),
                  'new_in_final': k not in B['SETS']} for k, v in SETS.items() if any(s['set'] == k for s in shots)],
        'conventions': dict(B['data']['conventions']) if 'data' in B else {},
        'continuity_flag_definitions': FLAG_TEXT,
        'difficulty_tag_definitions': TAG_TEXT,
        'shots': shots,
        'scene_totals': rows,
        'unit_totals': units,
        'totals': {'shots': len(shots), 'spoken_lines': len(order_ids), 'low_s': T['low_s'], 'expected_s': T['expected_s'], 'high_s': T['high_s'],
                   'low_min': round(T['low_s'] / 60, 2), 'expected_min': round(T['expected_s'] / 60, 2), 'high_min': round(T['high_s'] / 60, 2),
                   'frames_expected': int(round(T['expected_s'] * FPS)), 'hard_shots': sum(1 for s in shots if s['hard']),
                   'shots_by_origin': {o: sum(1 for s in shots if s['origin'] == o) for o in ('handoff', 'addition', 'rating_pass')},
                   'shots_with_realism_strategy': sum(1 for s in shots if s['realism_strategy']),
                   'shots_per_tag': {t: sum(1 for s in shots if t in s['difficulty_tags']) for t in TAG_TEXT},
                   'shots_per_flag': {f: sum(1 for s in shots if f in s['continuity_flags']) for f in FLAG_TEXT}},
    }
    data['conventions'] = conventions(B)
    content = json.dumps(data, indent=1, ensure_ascii=False) + '\n'
    md = build_md(data)
    if '--check' in argv:
        ok = all(os.path.exists(p) and open(p, encoding='utf-8').read() == c for p, c in ((OUT_JSON, content), (OUT_MD, md)))
        print('up to date' if ok else 'STALE: final/shotlist.json or final/shotlist.md')
        return 0 if ok else 1
    with open(OUT_JSON, 'w', encoding='utf-8') as f:
        f.write(content)
    with open(OUT_MD, 'w', encoding='utf-8') as f:
        f.write(md)
    mm = lambda x: '%d:%02d' % (int(round(x)) // 60, int(round(x)) % 60)
    print('final shot list: %d shots (%s), %d lines; tight %s expected %s loose %s; %d frames' % (
        len(shots), data['totals']['shots_by_origin'], len(order_ids), mm(T['low_s']), mm(T['expected_s']), mm(T['high_s']), data['totals']['frames_expected']))
    return 0


def conventions(B):
    """The handoff shot list's conventions, with the final script's decisions applied."""
    src = open(os.path.join(EP, 'shotlist.json'), encoding='utf-8')
    conv = dict(json.load(src)['conventions'])
    conv['scale'] = ("Leaf's body is about a quarter of Charcoal's length (DRAGONS.md 2026-10-09; Charcoal about 36 m long), not one-twentieth. "
                     "Starlight is roughly twice Charcoal's size. Keep the difference readable with long lenses in every shot that shows two of them.")
    conv['dragons_on_the_ground'] = FLAG_TEXT['LOW_STANCE']
    conv['the_pass_1E'] = conv['the_pass_1E'].replace('Slitherwing', 'scout')
    conv['outer_rocks'] = ('The outer rocks off the end of Verdor\'s coast: two leaning stacks with a gap that opens seaward, mist on the seaward side. '
                           'X6 (race) and X8 (pursuit) use the same layout; the scout falls close to the coast just seaward of the rocks (1F, 2B, 2C).')
    conv['time_of_day'] = ('Verdor: X1 first light; 1A-1C, X2-X6 morning; 1D-1F, X7-X9, 2A late morning; 2B-2C and X11-X13 day; X14 Cling midday; '
                           'X15-X16 afternoon; X17-X19 later that day into golden late afternoon. Cling: X5 early morning (same hour as the flight), '
                           'X14 midday, 3A-3D afternoon.')
    conv['blood_continuity'] = ' '.join(FLAG_TEXT[k] for k in ('REMI_BLOOD_1', 'REMI_BLOOD_2', 'REMI_BLOOD_3', 'CHARCOAL_JAW_BLOOD', 'VILLAGER_INJURIES'))
    return conv


def build_md(d):
    T, W = d['totals'], []
    w = W.append
    mm = lambda x: '%d:%02d' % (int(round(x)) // 60, int(round(x)) % 60)
    w("# Dragon's Kingdom, Episode 1: shot list of the locked shooting script")
    w('')
    w('Every shot of the whole episode in order, made from `screenplay-final.md` by `tools/shotlist/final_build.py`. **Plan only: nothing has been rendered for this script.** The times are estimates for an animatic; the real length is known only once an animatic is timed (`SERIES.md` section 1).')
    w('')
    w('- **%d shots**: %d from the handoff shot list (`../shotlist.json`, with the final script\'s changes), %d in the proposed additions, %d in the proposed rating pass. Everything proposed is in the script by default and is not canon until Daxtyn accepts it.' % (
        T['shots'], T['shots_by_origin']['handoff'], T['shots_by_origin']['addition'], T['shots_by_origin']['rating_pass']))
    w('- **Estimated length: %s expected** (tight cut %s, loose cut %s), %d frames at 24 fps. `tools/check_final.py` gives the same estimate, because the shots use its timing tables.' % (
        mm(T['expected_s']), mm(T['low_s']), mm(T['high_s']), T['frames_expected']))
    w('- **%d spoken lines**, each placed in exactly one shot (ids from `dialogue.json`).' % T['spoken_lines'])
    w('- **%d hard shots** (difficulty 4-5). **%d shots carry a realism strategy** (faces, crowds, blood, gore, the dead).' % (T['hard_shots'], T['shots_with_realism_strategy']))
    w('- Dropped as duplicates: %s.' % '; '.join('%s (played by %s)' % (x['id'], x['played_by']) for x in d['meta']['dropped_shots']))
    w('- Full detail for every shot (lighting, lens, positions, continuity flags, realism strategy, render cost) is in `shotlist.json`. The render plan is `render-schedule.md`.')
    w('')
    w('## Scenes')
    w('')
    w('| Start | Scene | What | Shots | Lines | Tight | Expected | Loose | With |')
    w('|---:|---|---|---:|---:|---:|---:|---:|---|')
    for r in d['scene_totals']:
        w('| %s | %s | %s | %d | %d | %s | %s | %s | %s |' % (mm(r['start_s']), r['scene'], r['title'], r['shots'], r['spoken_lines'],
                                                            mm(r['low_s']), mm(r['expected_s']), mm(r['high_s']), ', '.join(r['parts'])))
    w('| | **Total** | | **%d** | **%d** | **%s** | **%s** | **%s** | |' % (T['shots'], T['spoken_lines'], mm(T['low_s']), mm(T['expected_s']), mm(T['high_s'])))
    w('')
    w('## Sets')
    w('')
    w('| Set | Shots | Expected | New in the final script | What |')
    w('|---|---:|---:|---|---|')
    for s in d['sets']:
        w('| %s | %d | %s | %s | %s |' % (s['id'], s['shots'], mm(s['expected_s']), 'yes' if s['new_in_final'] else '', s['description'].replace('|', '/')))
    w('')
    w('## Continuity flags used')
    w('')
    for f, n in d['totals']['shots_per_flag'].items():
        if n:
            w('- **%s** (%d shots): %s' % (f, n, d['continuity_flag_definitions'][f]))
    w('')
    w('## Every shot')
    w('')
    w('Size: EWS extreme wide, WS wide, MS medium, CU close, INS insert, POV point of view. *Lines* are dialogue ids. **D** = difficulty (1-5). *s* = expected seconds. Part: X# addition, R# rating pass (both proposed).')
    cur = None
    for s in d['shots']:
        scene = 'PROLOGUE+TITLE' if s['scene'] in ('PROLOGUE', 'TITLE') else s['scene']
        if scene != cur:
            cur = scene
            r = next(x for x in d['scene_totals'] if x['scene'] == scene)
            w('')
            w('### %s: %s (%s, %d shots)' % (scene, r['title'], mm(r['expected_s']), r['shots']))
            w('')
            w('| # | Shot | Part | Set | Size / lens / move | In frame | Action | Lines | D | s |')
            w('|---:|---|---|---|---|---|---|---|---:|---:|')
        inf = ', '.join('%s@%s' % (f['name'], f['screen_pos']) if f['screen_pos'] else f['name'] for f in s['in_frame'])
        size = {v: k for k, v in SIZE.items()}.get(s['shot_size'], s['shot_size'])
        act = s['action'] if len(s['action']) <= 220 else s['action'][:217].rsplit(' ', 1)[0] + '...'
        lines = ' '.join(x['id'] for x in s['dialogue'])
        w('| %d | %s | %s | %s | %s / %s / %s | %s | %s | %s | %d | %s |' % (
            s['seq'], s['id'], s['part'] or '', s['set'], size, s['lens'], s['camera_move'], inf.replace('|', '/'), act.replace('|', '/'),
            lines, s['difficulty'], ('%g' % s['est_seconds'])))
    w('')
    w('---')
    w('')
    w('Generated from `screenplay-final.md` (sha256 `%s`). Rebuild: `python3 tools/extract_final_dialogue.py && python3 tools/shotlist/final_build.py` (from `episodes/s01e01/`).' % d['meta']['source_sha256'][:16])
    w('')
    return '\n'.join(W)


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
