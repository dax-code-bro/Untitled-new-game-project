#!/usr/bin/env python3
"""Emit episodes/s01e01/assets.json (asset bible) from hand-authored data.

Scratch helper for the asset-bible planning pass. Line counts are taken from
dialogue.json (not typed by hand) and the scale table is computed, so those
numbers cannot drift from their sources.
"""
import collections
import os
import hashlib
import json
import math

EP = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SCREENPLAY = EP + '/screenplay.md'
OUT = EP + '/assets.json'

sha = hashlib.sha256(open(SCREENPLAY, 'rb').read()).hexdigest()
dlg = json.load(open(EP + '/dialogue.json'))
assert dlg['source_sha256'] == sha, 'dialogue.json is out of date with the screenplay'

LINES = collections.defaultdict(collections.Counter)
ORIG = collections.Counter()
for ln in dlg['lines']:
    LINES[ln['speaker']][ln['scene']] += 1
    if ln['original']:
        ORIG[ln['speaker']] += 1

SCENE_ORDER = [s['id'] for s in dlg['scenes']]
# Editorial-plan windows from the screenplay (minutes). A plan, not measured footage.
PLAN_MIN = {'PROLOGUE': 3.0, '1A': 4.5, '1B': 3.0, '1C': 3.5, '1D': 4.0, '1E': 2.5, '1F': 4.5,
            '2A': 3.0, '2B': 5.0, '2C': 2.5, '3A': 4.0, '3B': 2.5, '3C': 5.0, '3D': 2.0}


def spoken(cue):
    if cue is None:
        return {'cue': None, 'total_lines': 0, 'by_scene': {}, 'original_lines': 0}
    c = LINES.get(cue, collections.Counter())
    return {'cue': cue, 'total_lines': sum(c.values()),
            'by_scene': {k: c[k] for k in SCENE_ORDER if c[k]}, 'original_lines': ORIG.get(cue, 0)}


def window(scenes):
    return round(sum(PLAN_MIN[s] for s in set(scenes) if s in PLAN_MIN), 1)


def feas(rating, render_cost, why, cheapest):
    assert rating in ('green', 'yellow', 'orange', 'red')
    assert render_cost in ('low', 'medium', 'high')
    return {'rating': rating, 'render_cost': render_cost, 'why': why, 'cheapest_convincing_approach': cheapest}


def appear(*pairs):
    return [{'scene': s, 'on_screen': a} for s, a in pairs]


def scenes_of(app):
    seen = []
    for a in app:
        if a['scene'] not in seen:
            seen.append(a['scene'])
    return seen


# --------------------------------------------------------------------------- characters
HERO_FACE = 'hero'
CHARACTERS = []


def character(**kw):
    kw.setdefault('provisional_design', True)
    app = kw['appears_in']
    kw['scenes'] = scenes_of(app)
    kw['editorial_window_minutes'] = window(kw['scenes'])
    kw['speaking'] = spoken(kw.pop('cue', None))
    order = ['id', 'name', 'group', 'canon_status', 'identity_rules', 'scenes', 'editorial_window_minutes',
             'appears_in', 'speaking', 'face', 'body', 'costume', 'states', 'props', 'animations', 'rig_needs',
             'build', 'provisional_design', 'notes', 'shotlist_cross_reference']
    CHARACTERS.append({k: kw[k] for k in order if k in kw})


character(
    id='char.remi', name='Remi (Prince Remi IV)', cue='REMI',
    canon_status='Canon: Prince Remi IV of Verdor, Abby\'s older brother, Queen Alexandria\'s son, rides Charcoal.',
    identity_rules=['Do not invent an exact age or permanent facial features (CANON LOCK 2).',
                    'One consistent face and voice for the whole episode (render-handoff checklist).',
                    'No unexplained major wounds (injury continuity).'],
    appears_in=appear(
        ('1A', 'Stands just behind Abby at the doorway; follows her in; looks at the shell, then the hatchling; sideways look at Abby; turns toward the door.'),
        ('1B', 'Beside resting Charcoal, reaching for a riding strap (scale-establishing action); checks equipment; raised-hand acknowledgement; checks Abby is mounted; mounts by platform or access rig.'),
        ('1C', 'On Charcoal at launch: "a small fixed point on his back"; relaxed in flight, looks at the island rather than scanning the sky.'),
        ('1D', 'Looks toward the palace, then at Abby; says the two ORIGINAL lines; small smile; looks resigned rather than frightened during the head-in-mouth beat; quiet "That\'s enough." to Charcoal.'),
        ('1E', 'Shouts to Abby; brings Charcoal close to check she is secured; easy expression disappears; commands "Attack."'),
        ('1F', 'Stays low on Charcoal; commands Again / Fire / Hold; jolted during the bite and catches himself against the riding rig; watches the fall; looks inland; "Back."'),
        ('2A', 'Dismounts by the established rig; hurries to Abby.'),
        ('2B', 'Stands too close; steps back when told; reports to Alexandria.'),
        ('2C', 'Points out the outer rocks and fall position on the coastline seen through an opening (or an unlabelled sketch); later sits near Abby; stands out of habit when Alexandria returns.')),
    face={'tier': HERO_FACE, 'close_up': True,
          'close_up_evidence': ['1D: "Cut to Remi, who looks more resigned than frightened."',
                                '1E: "His easy expression has disappeared."'],
          'lip_sync': True,
          'expressions': ['dry/casual', 'small smile', 'resigned', 'alarm (clipped, afraid)', 'hard focus in pursuit',
                          'uneasy while reporting', 'small breath that nearly becomes a laugh (2C)']},
    body={'height_m': None, 'notes': 'Proportions and height not established. Placeholder values in the provisional build are not canon.'},
    costume={'source': 'screenplay suggested clothing',
             'screenplay_text': 'practical dark riding clothes with a muted blue outer layer',
             'proposal': 'Dark fitted tunic and trousers, riding boots, optional riding gloves; muted blue riding coat or jerkin as the outer layer. No crest or emblem.',
             'readability_note': 'Remi rides a black dragon in dark clothes. The muted blue outer layer is what keeps him visible as "a small fixed point": keep it light enough in value to separate from Charcoal, and give him rim light.',
             'must_not': ['heraldry or insignia with lore meaning', 'armor that changes between shots']},
    states=[{'id': 'remi.default', 'scenes': ['1A', '1B', '1C', '1D', '1E'], 'description': 'Clean riding clothes, outer layer closed.'},
            {'id': 'remi.after_flight', 'scenes': ['1F', '2A', '2B', '2C'], 'description': 'Same clothes, wind-mussed, possibly a little sea spray or dust. No wounds.'}],
    props=['prop.charcoal_riding_rig', 'prop.charcoal_access_platform', 'prop.coastal_sketch (optional, 2C)'],
    animations=['walk / hurry / stop', 'look and head turns with eye-lines', 'reach for strap', 'raised-hand acknowledgement',
                'check equipment', 'climb access platform and mount', 'seated riding posture with wind on clothes',
                'stay low in pursuit', 'jolt and catch himself against the rig (1F)', 'dismount by rig', 'point (2C)',
                'sit / stand / step back'],
    rig_needs=['hero body and face rig', 'finger bones (hands on straps, pointing)', 'saddle attachment socket that follows Charcoal\'s spine',
               'secondary motion on the outer layer in flight'],
    build={'approach': 'Port the old engine human body loft and sculpted head (see legacy_engine_port), add rotating eyes, mouth interior, brows, hair cards and costume shells.',
           'feasibility': feas('orange', 'medium',
                               'A realistic human face that holds up in 4K close-ups is the single biggest quality risk of the project; it is affordable to render on CPU but hard to make convincing procedurally.',
                               'Ported sculpted head plus phoneme-timed visemes; strong soft key light and rim light; keep close-ups slightly soft-focused by lens choice; gloves reduce finger detail needed while riding.')})

character(
    id='char.abby', name='Abby', cue='ABBY',
    canon_status='Canon: Remi\'s younger sister, Queen Alexandria\'s daughter, rides Leaf. LEFT arm injury side is a production choice of this draft, not earlier canon.',
    identity_rules=['Do not invent an exact age or permanent facial features.',
                    'From the pass in 1E onward she never uses her LEFT arm normally; the sling is on the LEFT arm.',
                    'LEFT means Abby\'s own left. Never mirror these shots.'],
    appears_in=appear(
        ('1A', 'Leans in at the doorway; two quick steps, then slows; crouches to the hatchling\'s level; almost reaches out; looks to Alexandria; fears it stopped breathing; looks back once on leaving.'),
        ('1B', 'Stands in front of seated Leaf straightening riding equipment; Leaf pulls it out of reach; she finishes fastening; mounts; rests a hand on Leaf.'),
        ('1C', 'Leans into the takeoff; looks back through the dust; uses both hands comfortably (a detail that will change).'),
        ('1D', 'Silent after the succession question (no nod, no answer); a shallow smile flickers; looks across Charcoal; touches Leaf; corrective gesture; astonished stillness during the head-in-mouth beat; checks and rubs Leaf.'),
        ('1E', 'Thrown against her restraint; LEFT arm wrenched; cries out; pulls the LEFT arm inward; RIGHT hand grips; first breath fails; leans over Leaf to say "Home. Come on."'),
        ('1F', 'Intercut approaching Verdor: tries to shift the LEFT arm and stops with a gasp; insert of her RIGHT hand holding fast.'),
        ('2A', 'Hunched over the saddle; flinches at the landing; helped down from a stable platform without anyone moving the LEFT arm; knees soften; looks back at Leaf; raises her RIGHT hand to stop him.'),
        ('2B', 'Seated, LEFT arm supported, riding outer layer loosened; takes Alexandria\'s hand with her RIGHT hand; looks down.'),
        ('2C', 'LEFT arm in a sling; pale and tired; near-laugh exchange with Remi.')),
    face={'tier': HERO_FACE, 'close_up': True,
          'close_up_evidence': ['1D: "A shallow smile flickers across Abby\'s face"', '1D: "Cut to Abby\'s astonished stillness."'],
          'lip_sync': True,
          'expressions': ['curious', 'eager', 'teasing satisfaction', 'unreadable silence looking ahead (succession)', 'shallow smile flicker',
                          'astonishment', 'affection', 'startled breath', 'pain that narrows but does not erase her', 'pale fatigue', 'near-smile']},
    body={'height_m': None, 'notes': 'Proportions and height not established; do not encode an age.'},
    costume={'source': 'screenplay suggested clothing',
             'screenplay_text': 'practical riding clothes with a muted green outer layer',
             'proposal': 'Practical riding tunic, trousers, boots; muted green outer riding layer that can be opened and slipped off the LEFT shoulder (needed for 2B). No crest.',
             'readability_note': 'Leaf is green too. Make Abby\'s muted green clearly different in value and saturation (for example a grey-sage) so she does not vanish against her dragon.',
             'must_not': ['heraldry or insignia with lore meaning', 'graphic exposed injury']},
    states=[
        {'id': 'abby.normal', 'scenes': ['1A', '1B', '1C', '1D', '1E (until the pass)'],
         'description': 'Both arms normal; both hands used comfortably; outer layer closed.'},
        {'id': 'abby.injured_left_arm_held', 'scenes': ['1E (from the pass)', '1F', '2A'],
         'description': 'LEFT arm pulled inward against the torso, elbow bent, LEFT hand not gripping; RIGHT hand does all gripping and gestures; hunched, protective posture; pained face.'},
        {'id': 'abby.treatment_supported', 'scenes': ['2B'],
         'description': 'Seated; LEFT arm resting on a support (cushion, folded cloth or the healer\'s hands); outer layer loosened; skin slightly paler.'},
        {'id': 'abby.sling_left', 'scenes': ['2C'],
         'description': 'LEFT arm in a sling (forearm across the body); outer layer loosened or draped; pale and tired.'}],
    props=['prop.leaf_saddle_and_restraint', 'prop.leaf_equipment_strap (the piece Leaf pulls out of reach)', 'prop.leaf_dismount_platform', 'prop.sling'],
    animations=['walk / quick steps that slow', 'crouch, reach-and-stop', 'mount', 'seated riding lean', 'look back over shoulder',
                'touch / rub Leaf', 'corrective gesture', 'thrown against restraint with LEFT-arm wrench (one bespoke keyframed beat, no slow motion)',
                'pull LEFT arm in', 'ride hunched', 'flinch', 'assisted dismount with soft knees', 'raise RIGHT hand', 'sit', 'hold hands (RIGHT)', 'look down'],
    rig_needs=['hero body and face rig', 'finger bones (hand-holding, gripping)', 'locked LEFT-arm pose presets per state',
               'restraint/harness geometry that tightens against her in 1E', 'outer-layer costume variants (closed / loosened)', 'hair that reacts to wind'],
    build={'approach': 'Same as Remi. Add an automated check that every shot after the 1E pass uses an injured-arm state on her LEFT (+x) side.',
           'feasibility': feas('orange', 'medium',
                               'Hero face plus the most demanding acting in the episode (pain while riding, assisted dismount).',
                               'Keyframe the injury beat as one clear cause-and-effect action in a medium shot; store arm states as named poses so they cannot be mirrored by accident.')})

character(
    id='char.alexandria', name='Queen Alexandria', cue='ALEXANDRIA',
    canon_status='Canon: Queen of Verdor, mother of Remi and Abby. She is never Starlight\'s rider.',
    identity_rules=['Her whispered ORIGINAL line "My pretty little weapon" stays exact.', 'Must not resemble Queen Fall.'],
    appears_in=appear(
        ('1A', 'Enters without announcement; small raised hand stops the attendant\'s bow; takes a place beside the nest; lowers herself closer; expression softens; whispers the ORIGINAL line; held close-up; supports the hatchling with a folded cloth; leaves her hand resting near it.'),
        ('2B', 'Enters; looks at Abby\'s face, then the arm, then Remi; kneels or sits level with Abby; holds Abby\'s RIGHT hand and squeezes it; releases after a glance; steps to the doorway and calls the messenger.'),
        ('2C', 'Gives the Santa Maria order at the doorway; looks at Remi; returns; gestures Remi to stay seated; looks to the healer, then Abby.')),
    face={'tier': HERO_FACE, 'close_up': True,
          'close_up_evidence': ['1A: "Hold on her face for a beat after the line."', '1A: "Her expression softens before the words..."'],
          'lip_sync': True,
          'expressions': ['controlled neutral', 'softening tenderness', 'whisper', 'level authority', 'maternal intimacy',
                          'watching Remi without approval or condemnation']},
    body={'height_m': None, 'notes': 'Not established.'},
    costume={'source': 'screenplay suggested clothing', 'screenplay_text': 'a restrained formal gown',
             'proposal': 'Long-sleeved floor-length gown in a muted Verdor colour (deep sea blue or grey-green), minimal ornament. Crown or circlet optional and simple (not in the screenplay).',
             'production_tip': 'The screenplay allows "kneels or sits" in 2B. Choose SITS (stool or bench): a kneeling gown is the hardest cloth-collision case in the episode.',
             'must_not': ['heraldry with lore meaning', 'riding clothes like Queen Fall']},
    states=[{'id': 'alexandria.default', 'scenes': ['1A', '2B', '2C'], 'description': 'No change during the episode.'}],
    props=['prop.folded_cloths', 'prop.stool'],
    animations=['walk in', 'small raised-hand stop gesture', 'lower/sit beside nest', 'lean closer', 'support hatchling with cloth (hand-cloth-hatchling contact)',
                'rest hand', 'hold and squeeze hand', 'step to doorway and call', 'gesture "stay seated"'],
    rig_needs=['hero body and face rig incl. whisper visemes', 'gown skirt proxy bones or a cone skirt weighted to hips', 'fingers'],
    build={'approach': 'Hero human; gown as lofted costume shell with a few skirt bones driven procedurally.',
           'feasibility': feas('orange', 'medium', 'Hero face close-up plus gown cloth.',
                               'Mostly static, seated staging; gown motion from a few pendulum skirt bones instead of cloth simulation.')})

character(
    id='char.queen_fall', name='Queen Fall (of Tara)', cue='QUEEN FALL',
    canon_status='Canon: Queen of Tara, Starlight\'s rider. A different person from Queen Alexandria and from King Fallen of Scrapper.',
    identity_rules=['Never label or design her to look like Alexandria.', 'No invented Tara heraldry or army.'],
    appears_in=appear(
        ('3B', 'High above the village on Starlight: controlled close shot of her face, then re-established small against her dragon; surveys the gathering, intent and unreadable; says "Attack."'),
        ('3C', 'Moves with Starlight\'s climb; looks down at the square; no smile, no speech.'),
        ('3D', 'Does not speak; small on Starlight in the high aerial shot.')),
    face={'tier': HERO_FACE, 'close_up': True, 'close_up_evidence': ['3B: "Introduce her face in a controlled close shot"'],
          'lip_sync': True, 'expressions': ['intent, unreadable', 'controlled', 'no smile']},
    body={'height_m': None, 'notes': 'Not established.'},
    costume={'source': 'screenplay suggested clothing', 'screenplay_text': 'fitted riding clothing suitable for command',
             'proposal': 'Fitted dark riding coat with high collar, gloves, boots; hair secured against wind. Fitted clothing is also the cheapest to animate in wind.',
             'readability_note': 'She rides a white dragon: dark, contrasting clothes keep her readable when small in frame.',
             'must_not': ['Tara insignia or heraldry', 'a gown or Verdor colours']},
    states=[{'id': 'queen_fall.default', 'scenes': ['3B', '3C', '3D'], 'description': 'No change.'}],
    props=['prop.starlight_riding_rig'],
    animations=['seated riding posture that moves with dive, flare and climb', 'look down / survey', 'one spoken word'],
    rig_needs=['hero face rig', 'body mostly seated; saddle attachment to Starlight\'s spine frame'],
    build={'approach': 'Hero human, seated; one close shot.',
           'feasibility': feas('yellow', 'low', 'Only one close shot and one word; otherwise small in frame.',
                               'Hero head on a mostly static seated body; hair tied back to avoid hair simulation.')})

character(
    id='char.king_of_cling', name='King of Cling', cue='KING OF CLING',
    canon_status='Canon: king of Cling (a smaller kingdom within Scrapper). Personal name not supplied; do not invent one. His accessible characterization is a proposal of this draft.',
    identity_rules=['No invented name or heraldry.', 'Crown or formal headwear, if used, must not become a prop gag.'],
    appears_in=appear(
        ('3A', 'Enters the square with a small escort; gestures for music to continue; steps aside so a child can see; answers the child; speaks from the steps; the crowd laughs.'),
        ('3B', 'Follows the watchman\'s pointing hand; quiet "Starlight."; orders the square cleared; his expression silences the captain.'),
        ('3C', 'Pulls toward the people instead of the private exit; shouts directions; moves behind a stone support; "Down!"; emerges; refuses to go first; looks up; helps the captain pull an injured villager into shelter; under stone cover, looks out at the square.'),
        ('3D', 'Walks into the edge of the square with dust-marked clothing; gives orders; stays a moment looking at the damage.')),
    face={'tier': HERO_FACE, 'close_up': True,
          'close_up_evidence': ['3B: "The captain sees the king\'s expression"', '3C: "The king looks through the opening at the square he addressed only minutes before."'],
          'lip_sync': True, 'expressions': ['warm, approachable', 'gentle humour', 'sudden recognition', 'urgent command', 'grim practicality']},
    body={'height_m': None, 'notes': 'Not established.'},
    costume={'source': 'proposed (the screenplay gives no clothing for him)',
             'screenplay_text': None,
             'proposal': 'Good-quality but practical festival clothes in warm Cling tones; optional simple circlet that stays put. No crest.',
             'must_not': ['heraldry', 'crown gags']},
    states=[{'id': 'king.clean', 'scenes': ['3A', '3B', '3C (before the first impact)'], 'description': 'Clean festival clothes.'},
            {'id': 'king.dust_marked', 'scenes': ['3C (from the first impact)', '3D'], 'description': 'Dust layer on clothing and hair (material dust mask). No injury is written for him.'}],
    props=['prop.circlet (optional)'],
    animations=['walk with escort', 'gesture to continue', 'step aside', 'address the crowd with speech gestures', 'follow a pointing line',
                'urgent guiding of people', 'duck behind stone support', 'drag an injured adult with the captain (two-person assist)', 'stand and look'],
    rig_needs=['hero body and face rig', 'dust-mask material blend'],
    build={'approach': 'Hero human with a dust overlay driven by a 0..1 uniform.',
           'feasibility': feas('orange', 'medium', 'Hero face with the longest speech in the episode, plus action in dust.',
                               'Deliver the speech in medium shots with a few close-ups; the dust state is a single material blend, not new geometry.')})

character(
    id='char.attendant', name='Attendant (plus at least one non-speaking attendant)', cue='ATTENDANT', group=True,
    canon_status='Proposed supporting role (unnamed). The screenplay also says "The attendants are careful", so at least two attendants are present.',
    identity_rules=['Unnamed; no backstory.'],
    appears_in=appear(('1A', 'Looks toward the opening door; starts to bow and is stopped; reports the hatching; hears the whisper but does not respond; careful, not celebratory.')),
    face={'tier': 'speaking', 'close_up': 'not specified (medium shots likely)', 'close_up_evidence': [], 'lip_sync': True,
          'expressions': ['attentive', 'careful', 'quiet concern']},
    body={'height_m': None, 'notes': 'Adult; not specified.'},
    costume={'source': 'proposed', 'screenplay_text': None,
             'proposal': 'Plain practical household/caretaker clothing in warm neutral tones; sleeves rolled or an apron.', 'must_not': ['insignia']},
    states=[{'id': 'attendant.default', 'scenes': ['1A'], 'description': 'No change.'}],
    props=['prop.water_bowls', 'prop.folded_cloths'],
    animations=['look toward door', 'interrupted bow', 'stand attentive', 'tend near nest'],
    rig_needs=['speaking-tier face'],
    build={'approach': 'Shared human generator with a speaking-tier head.',
           'feasibility': feas('yellow', 'low', 'Medium shots in a small interior.', 'Reuse the hero rig at lower mesh density.')})

character(
    id='char.ground_keepers', name='Ground keepers (one speaking keeper plus an assistance group)', cue='GROUND KEEPER', group=True,
    canon_status='Proposed supporting roles (unnamed).',
    identity_rules=['Use the same speaking keeper in 1B and 2A (recommended for continuity).'],
    appears_in=appear(
        ('1B', 'One keeper stands well outside Charcoal\'s launch space and calls "The field\'s clear."'),
        ('2A', 'Keepers see Leaf returning; one raises a hand; another notices Abby; the speaking keeper calls to clear the approach; a stable platform is brought alongside; they help Abby down without moving her LEFT arm; one keeper pauses rather than forcing past Leaf\'s head; everyone else clears back for Charcoal\'s landing.')),
    face={'tier': 'speaking (one keeper); background (others)', 'close_up': 'not specified', 'close_up_evidence': [], 'lip_sync': True,
          'expressions': ['watchful', 'urgent', 'gentle reassurance']},
    body={'height_m': None, 'notes': 'Adults; 3-4 people in 2A.'},
    costume={'source': 'proposed', 'screenplay_text': None,
             'proposal': 'Sturdy outdoor work clothes in Verdor earth and grey-green tones, gloves. No insignia.', 'must_not': ['insignia']},
    states=[{'id': 'keepers.default', 'scenes': ['1B', '2A'], 'description': 'No change.'}],
    props=['prop.leaf_dismount_platform'],
    animations=['stand watch', 'raised hand', 'call out', 'hurry', 'push/carry platform (two people)', 'support Abby\'s balance', 'pause near Leaf', 'clear back'],
    rig_needs=['speaking-tier face for one keeper', 'two-person contact poses for the assisted dismount'],
    build={'approach': 'Shared human generator; contact poses keyframed with two-bone IK for hands.',
           'feasibility': feas('yellow', 'low', 'Multi-person contact choreography around a dragon.', 'Keep the dismount in one or two medium shots; IK hands to fixed contact points.')})

character(
    id='char.healer', name='Healer', cue='HEALER',
    canon_status='Proposed supporting role (unnamed).',
    identity_rules=['No real-world instructional medical demonstration.'],
    appears_in=appear(('2B', 'Attends Abby; asks where it hurts; tells Remi to give her room; supports the arm; pauses when the room changes, then continues.'),
                      ('2C', 'Present in the treatment room; Alexandria looks to the healer before answering Abby.')),
    face={'tier': 'speaking', 'close_up': 'not specified', 'close_up_evidence': [], 'lip_sync': True, 'expressions': ['calm focus', 'firm', 'brief pause']},
    body={'height_m': None, 'notes': 'Adult; not specified.'},
    costume={'source': 'proposed', 'screenplay_text': None, 'proposal': 'Clean practical working clothes, sleeves secured, apron.', 'must_not': ['symbols']},
    states=[{'id': 'healer.default', 'scenes': ['2B', '2C'], 'description': 'No change.'}],
    props=['prop.clean_cloths', 'prop.water_basin', 'prop.sling'],
    animations=['examine (hands near, not manipulating graphically)', 'support arm', 'look up', 'pause', 'continue tending'],
    rig_needs=['speaking-tier face', 'fingers'],
    build={'approach': 'Shared human generator.', 'feasibility': feas('yellow', 'low', 'Interior medium shots.', 'Speaking-tier rig.')})

character(
    id='char.royal_messenger', name='Royal Messenger', cue='ROYAL MESSENGER',
    canon_status='Proposed supporting role (unnamed).', identity_rules=[],
    appears_in=appear(('2B', 'Called to the open doorway at the end of the scene.'),
                      ('2C', 'Receives the order; watches Remi point; leaves at once; runs down weathered harbor steps; delivers the order to the waiting crew.')),
    face={'tier': 'speaking', 'close_up': 'not specified', 'close_up_evidence': [], 'lip_sync': True, 'expressions': ['attentive', 'urgent']},
    body={'height_m': None, 'notes': 'Adult; not specified.'},
    costume={'source': 'proposed', 'screenplay_text': None, 'proposal': 'Light practical clothing suited to running, Verdor palette. No insignia.', 'must_not': ['heraldic sash or badge']},
    states=[{'id': 'messenger.default', 'scenes': ['2B', '2C'], 'description': 'No change.'}],
    props=[], animations=['arrive', 'listen and nod', 'run (including down steps)', 'deliver with gesture'],
    rig_needs=['speaking-tier face', 'stair-run locomotion (feet planted with IK)'],
    build={'approach': 'Shared human generator.', 'feasibility': feas('yellow', 'low', 'Short appearances.', 'Run cycle plus IK foot placement on the steps.')})

character(
    id='char.scout_rider', name='Scout rider (unidentified)', cue=None,
    canon_status='Canon: the rider of the Slitherwing scout; suspected traitor (suspicion only, not confirmed). Identity, motive and fate stay unresolved.',
    identity_rules=['No recognizable face, named insignia or villain speech.', 'Burned but alive when last seen; never declared dead.',
                    'Saddle shows no legible mark (Remi "couldn\'t make one out").'],
    appears_in=appear(('1E', 'Only a strapped silhouette during the pass.'),
                      ('1F', 'Looks back (face hidden by helmet/clothing and distance); directs the dragon away from Charcoal\'s first reach; scorched by the flame (short flash of burning outer cloth, flinch, cry lost in wind); stays strapped on and moving; falls with the dragon; still secured to it in the water.')),
    face={'tier': 'hidden', 'close_up': False, 'close_up_evidence': ['1F: "Use distance and helmet/clothing obstruction to leave identity unresolved."'],
          'lip_sync': False, 'expressions': []},
    body={'height_m': None, 'notes': 'Adult silhouette.'},
    costume={'source': 'proposed', 'screenplay_text': 'helmet/clothing obstruction (staging note)',
             'proposal': 'Close leather hood or helmet with a face wrap; dark neutral riding clothes with an outer layer that can scorch. No markings anywhere.',
             'must_not': ['insignia', 'a visible face']},
    states=[{'id': 'scout_rider.intact', 'scenes': ['1E', '1F (before Fire)'], 'description': 'Clean, strapped in.'},
            {'id': 'scout_rider.scorched', 'scenes': ['1F (after Fire)'], 'description': 'Half-second flash of burning outer cloth, then charred, smoking patches on the outer layer only. Still moving.'},
            {'id': 'scout_rider.in_water', 'scenes': ['1F (after impact)'], 'description': 'Partly submerged, still secured to the dragon, moving.'}],
    props=['prop.scout_saddle (no marks)'],
    animations=['crouched riding', 'look back', 'steer by leaning', 'flinch', 'slumped but moving', 'small movements in the water'],
    rig_needs=['background body', 'no face rig needed (head never revealed)', 'char-mask material on the outer layer'],
    build={'approach': 'Low-detail human with a hooded head; burn handled by FX and a material mask.',
           'feasibility': feas('green', 'low', 'Always small, fast or obscured.', 'Silhouette-level model; no face.')})

character(
    id='char.vendor', name='Vendor', cue='VENDOR',
    canon_status='Proposed supporting role (unnamed). The screenplay refers to him as "he".', identity_rules=['No invented backstory.'],
    appears_in=appear(('3A', 'Keeps his stall steady on uneven stones; banter with the musician; jokes with the king; calls "You are!"; stores an empty crate in the alley (establishes the alley route).'),
                      ('3B', 'Looks up, puts down what he is holding.'),
                      ('3C', 'His stall cloth tears free and wraps across his view; he fights it aside; crawls clear of the wrecked stall; "Leave it! Come on!"'),
                      ('3D', 'Finds the musician and takes his arm to check he is standing; silent.')),
    face={'tier': 'speaking', 'close_up': 'possible (banter, aftermath)', 'close_up_evidence': [], 'lip_sync': True,
          'expressions': ['wry humour', 'alarm', 'fear', 'quiet shock']},
    body={'height_m': None, 'notes': 'Adult.'},
    costume={'source': 'proposed', 'screenplay_text': None, 'proposal': 'Ordinary working clothes, apron, rolled sleeves; warm Cling palette.', 'must_not': ['insignia']},
    states=[{'id': 'vendor.clean', 'scenes': ['3A', '3B'], 'description': 'Clean.'},
            {'id': 'vendor.dusty', 'scenes': ['3C', '3D'], 'description': 'Dust-marked; minor scuffs from crawling (keep minor).'}],
    props=['prop.vendor_stall', 'prop.empty_crate'],
    animations=['steady stall', 'banter gestures', 'carry crate into alley', 'look up', 'put item down', 'fight cloth off face', 'crawl', 'shout and wave', 'take someone\'s arm'],
    rig_needs=['speaking-tier face', 'cloth-contact poses (cloth over face)'],
    build={'approach': 'Shared human generator; dust state as material blend.',
           'feasibility': feas('yellow', 'low', 'The cloth-over-face beat is the hard part (see fx.cloth_tear_and_fly).', 'Keyframed cloth shape plus flutter, in a quick medium shot.')})

character(
    id='char.musician', name='Musician (plus at least one more musician)', cue='MUSICIAN', group=True,
    canon_status='Proposed supporting role (unnamed); "A musician starts a phrase and another joins." The screenplay refers to him as "he".',
    identity_rules=['No invented backstory.'],
    appears_in=appear(('3A', 'Repairs a loose fastening; "Move the stall."; smiles and helps straighten the cloth; musicians lift their hands in exaggerated gratitude, then play.'),
                      ('3B', 'Music falters one instrument at a time.'),
                      ('3C', 'Helps a fallen person rise; pushes the fallen beam at the arch with two guards; abandons the last festival equipment and follows the vendor.'),
                      ('3D', 'Standing, silent, checked by the vendor; the music space is empty.')),
    face={'tier': 'speaking', 'close_up': 'not specified', 'close_up_evidence': [], 'lip_sync': True, 'expressions': ['easy smile', 'concentration', 'strain', 'shock']},
    body={'height_m': None, 'notes': 'Adults.'},
    costume={'source': 'proposed', 'screenplay_text': None, 'proposal': 'Ordinary festive clothes in warm Cling tones.', 'must_not': ['insignia']},
    states=[{'id': 'musician.clean', 'scenes': ['3A', '3B'], 'description': 'Clean.'}, {'id': 'musician.dusty', 'scenes': ['3C', '3D'], 'description': 'Dust-marked.'}],
    props=['prop.instruments (provisional: hand drum, plucked or bowed string instrument, pipe)', 'prop.loose_fastening'],
    animations=['playing loops (approximate fingering)', 'stop playing', 'lift hands', 'help someone up', 'push beam (shared contact with guards)', 'run', 'stand dazed'],
    rig_needs=['speaking-tier face', 'fingers for instruments'],
    build={'approach': 'Shared human generator; instruments as simple lathe/loft props.',
           'feasibility': feas('yellow', 'low', 'Instrument-playing hands are fiddly.', 'Frame playing from mid distance; approximate hand motion.')})

character(
    id='char.parent', name='Parent', cue='PARENT',
    canon_status='Proposed supporting role (unnamed). Gender not specified by the screenplay (production choice).', identity_rules=['No invented backstory.'],
    appears_in=appear(('3A', 'Carries a parcel while keeping the child close; "Let the king pass."; walks from the square toward the stone arch (establishes that route).'),
                      ('3B', 'Pulls the child closer.'),
                      ('3C', 'Loses the parcel and lets it go rather than letting go of the child; reaches the arch; "Stay with me. Don\'t stop." / "Hold my hand."'),
                      ('3D', 'Sits with the child under shelter; turns the child\'s attention away from falling dust.')),
    face={'tier': 'speaking', 'close_up': 'not specified', 'close_up_evidence': [], 'lip_sync': True, 'expressions': ['mild embarrassment', 'protective fear', 'steadiness for the child']},
    body={'height_m': None, 'notes': 'Adult.'},
    costume={'source': 'proposed', 'screenplay_text': None, 'proposal': 'Ordinary clothes, warm Cling palette.', 'must_not': ['insignia']},
    states=[{'id': 'parent.clean', 'scenes': ['3A', '3B'], 'description': 'Clean, carrying parcel.'},
            {'id': 'parent.dusty_no_parcel', 'scenes': ['3C (after dropping it)', '3D'], 'description': 'Dust-marked; parcel left behind.'}],
    props=['prop.parcel'],
    animations=['walk holding a child\'s hand', 'carry parcel', 'pull child close', 'drop parcel', 'run holding hand', 'crouch/sit sheltering the child'],
    rig_needs=['speaking-tier face', 'hand-in-hand constraint with the child (IK)'],
    build={'approach': 'Shared human generator.', 'feasibility': feas('yellow', 'low', 'Hand-holding contact while running.', 'Two-bone IK to a shared hand target.')})

character(
    id='char.child', name='Child', cue='CHILD',
    canon_status='Proposed supporting role (unnamed). Exact age not specified; do not invent one.', identity_rules=[],
    appears_in=appear(('3A', 'Tries to see around the adults; asks the king "Are there going to be dragons?"; disappointed by the answer.'),
                      ('3B', 'Pulled close by the parent.'),
                      ('3C', 'Runs with the parent; "I can\'t see."'),
                      ('3D', 'Under shelter with the parent; looks toward the opening.')),
    face={'tier': 'speaking', 'close_up': 'possible (the question to the king)', 'close_up_evidence': [], 'lip_sync': True, 'expressions': ['curiosity', 'disappointment', 'fear', 'quiet']},
    body={'height_m': None, 'notes': 'Child proportions (larger head-to-body ratio), not a scaled-down adult. The same child body type serves the background children who chase each other in 3A.'},
    costume={'source': 'proposed', 'screenplay_text': None, 'proposal': 'Simple festival clothes.', 'must_not': ['insignia']},
    states=[{'id': 'child.clean', 'scenes': ['3A', '3B'], 'description': 'Clean.'}, {'id': 'child.dusty', 'scenes': ['3C', '3D'], 'description': 'Dust-marked; unhurt.'}],
    props=[], animations=['peer around adults', 'look up', 'hold hand', 'run', 'sit sheltered'],
    rig_needs=['child body proportions (new landmark table)', 'speaking-tier face'],
    build={'approach': 'New child landmark/ring table for the ported body loft (the old engine only has one adult body).',
           'feasibility': feas('yellow', 'low', 'Needs a new body table; otherwise standard.', 'Parameterize HUMAN landmarks and ring widths by a proportion preset.')})

character(
    id='char.guard_captain', name='Guard Captain', cue='GUARD CAPTAIN',
    canon_status='Proposed supporting role (unnamed).', identity_rules=['No insignia.'],
    appears_in=appear(('3A', 'Half a step behind the king, scanning; "The steps are ready for you."; moves a banner aside so it cannot block the watchman\'s sight.'),
                      ('3B', 'Turns; "Where?"; orders the square cleared through the arch.'),
                      ('3C', '"Off the steps!"; reaches for the king; redirects guards to widen the flow; behind the stone support; pulls the injured villager into shelter with the king; gets the king under substantial stone cover.'),
                      ('3D', 'Walks in with the king, dust-marked; receives orders; looks toward the receding white shape; leaves to act.')),
    face={'tier': 'speaking', 'close_up': 'not specified', 'close_up_evidence': [], 'lip_sync': True, 'expressions': ['vigilant', 'commanding', 'strain', 'grim']},
    body={'height_m': None, 'notes': 'Adult.'},
    costume={'source': 'proposed', 'screenplay_text': None,
             'proposal': 'Practical guard gear: padded jacket, belt, optional open-faced helmet (face stays visible); a sheathed sword is costume only. No insignia.', 'must_not': ['heraldry']},
    states=[{'id': 'captain.clean', 'scenes': ['3A', '3B'], 'description': 'Clean.'}, {'id': 'captain.dust_marked', 'scenes': ['3C', '3D'], 'description': 'Dust-marked.'}],
    props=[], animations=['escort walk', 'scan', 'move banner aside', 'point and shout', 'reach for and guide the king', 'drag injured villager (with king)', 'exit at a run'],
    rig_needs=['speaking-tier face'],
    build={'approach': 'Shared human generator; guard costume kit.', 'feasibility': feas('yellow', 'low', 'Standard.', 'Speaking-tier rig.')})

character(
    id='char.guards', name='Guards (one speaking guard, the king\'s escort, the gate guard, beam pushers)', cue='GUARD', group=True,
    canon_status='Proposed supporting roles (unnamed).', identity_rules=['No insignia.'],
    appears_in=appear(('3A', 'Small escort with the king; a guard tries to see over decorations; a guard checks the gate onto the broader road (establishes that route).'),
                      ('3B', 'React to the captain\'s orders.'),
                      ('3C', 'Widen the evacuation flow; two guards and the musician push the fallen beam at the arch; the speaking guard reaches the king ("This way, Your Majesty." / "She\'s turning." / "I\'ll look.").'),
                      ('3D', 'Implied: finding the injured.')),
    face={'tier': 'speaking (one guard); background (others)', 'close_up': 'not specified', 'close_up_evidence': [], 'lip_sync': True, 'expressions': ['urgent', 'determined']},
    body={'height_m': None, 'notes': 'Adults; build about four distinct guard variants.'},
    costume={'source': 'proposed', 'screenplay_text': None, 'proposal': 'Same family as the captain, plainer.', 'must_not': ['heraldry']},
    states=[{'id': 'guards.clean', 'scenes': ['3A', '3B'], 'description': 'Clean.'}, {'id': 'guards.dusty', 'scenes': ['3C', '3D'], 'description': 'Dust-marked.'}],
    props=[], animations=['escort walk', 'stand on tiptoe looking over decorations', 'check gate', 'herd people', 'push beam', 'run'],
    rig_needs=['speaking-tier face for one guard'],
    build={'approach': 'Shared human generator with costume variants.', 'feasibility': feas('green', 'low', 'Standard.', 'Background tier except the speaking guard.')})

character(
    id='char.watchman', name='Watchman', cue='WATCHMAN',
    canon_status='Proposed supporting role (unnamed).', identity_rules=[],
    appears_in=appear(('3A', 'His sight line to the far sky is protected when the captain moves a banner aside.'),
                      ('3B', 'Looks up from the edge of the square; "Dragon."; then "Dragon approaching!"; points.')),
    face={'tier': 'speaking', 'close_up': 'possible', 'close_up_evidence': [], 'lip_sync': True, 'expressions': ['squinting attention', 'alarm']},
    body={'height_m': None, 'notes': 'Adult.'},
    costume={'source': 'proposed', 'screenplay_text': None, 'proposal': 'Plain watch clothing and cloak, Cling palette.', 'must_not': ['insignia']},
    states=[{'id': 'watchman.default', 'scenes': ['3A', '3B'], 'description': 'No change.'}],
    props=[], animations=['look up', 'call out', 'point'],
    rig_needs=['speaking-tier face'],
    build={'approach': 'Shared human generator.', 'feasibility': feas('green', 'low', 'Short appearance.', 'Speaking-tier rig.')})

character(
    id='char.adult_villager', name='Adult Villager (injured)', cue='ADULT VILLAGER',
    canon_status='Proposed supporting role; no permanent named casualty is invented.', identity_rules=['Conscious and frightened; survives.'],
    appears_in=appear(('3C', 'Injured; pulled into shelter by the king and the captain; "My family—".')),
    face={'tier': 'speaking', 'close_up': 'not specified', 'close_up_evidence': [], 'lip_sync': True, 'expressions': ['pain', 'fear']},
    body={'height_m': None, 'notes': 'Adult.'},
    costume={'source': 'proposed', 'screenplay_text': None, 'proposal': 'Ordinary festival clothes, torn and dusty.', 'must_not': ['graphic wounds']},
    states=[{'id': 'villager.injured', 'scenes': ['3C'], 'description': 'Dusty, torn clothing, brief small blood allowed; conscious.'}],
    props=[], animations=['dragged by two people (contact poses)', 'clutch', 'speak'],
    rig_needs=['speaking-tier face'],
    build={'approach': 'Shared human generator; injury as material decals.', 'feasibility': feas('green', 'low', 'One beat.', 'Contact poses keyframed with IK.')})

character(
    id='char.sailor', name='Sailor (prologue, plus optional crew silhouettes)', cue=None, group=True,
    canon_status='Proposed anonymous vignette; not an identifiable historical discoverer; no canon date.',
    identity_rules=['No identifiable historical person.', 'Not a named or dated event.'],
    appears_in=appear(('PROLOGUE', 'A working hand secures a rope aboard the small vessel (hand insert); a sailor turns toward an unfamiliar sound above the fog and becomes still.')),
    face={'tier': 'background', 'close_up': 'hand insert only; face may be seen but keep it generic or partly shadowed',
          'close_up_evidence': ['PROLOGUE: "A working hand secures a rope aboard the vessel."'], 'lip_sync': False, 'expressions': ['stillness, wary attention']},
    body={'height_m': None, 'notes': 'Adult.'},
    costume={'source': 'proposed', 'screenplay_text': None, 'proposal': 'Simple, nation-neutral sailor clothing (linen shirt, vest, cap or hood).', 'must_not': ['a recognizable historical uniform or person']},
    states=[{'id': 'sailor.default', 'scenes': ['PROLOGUE'], 'description': 'No change.'}],
    props=['prop.prologue_vessel', 'prop.rope_and_cleat'],
    animations=['hands securing a rope (close insert)', 'turn toward sound', 'freeze'],
    rig_needs=['a close-up-quality hand with fingers (the old engine hand is a mitten)', 'rope that follows the hand (curve or tube)'],
    build={'approach': 'Background human; one hero-quality hand for the insert.',
           'feasibility': feas('yellow', 'low', 'The hand-and-rope insert needs real fingers and a believable rope.', 'One-off finger rig and a tube rope along a spline; dawn backlight hides detail.')})

character(
    id='char.harbor_crew', name='Harbor crew of the Santa Maria (incl. a lookout)', cue=None, group=True,
    canon_status='Proposed; the story\'s vessel and crew, not historical Earth figures.', identity_rules=['No historical figures.'],
    appears_in=appear(('2C', 'A waiting crew receives the order; ropes are handled; supplies are brought aboard; a lookout turns seaward. The rescue itself is not shown.')),
    face={'tier': 'background', 'close_up': False, 'close_up_evidence': [], 'lip_sync': False, 'expressions': []},
    body={'height_m': None, 'notes': '4-8 adults.'},
    costume={'source': 'proposed', 'screenplay_text': None, 'proposal': 'Simple sailor clothes with colour and hat variety.', 'must_not': ['insignia']},
    states=[{'id': 'crew.default', 'scenes': ['2C'], 'description': 'No change.'}],
    props=['prop.santa_maria', 'prop.harbor_supplies', 'prop.ropes'],
    animations=['haul rope', 'carry crate/sack up gangplank', 'turn and look seaward'],
    rig_needs=['background body'],
    build={'approach': 'Crowd system subset.', 'feasibility': feas('green', 'low', 'Brief intercut.', 'Background tier, a few loops.')})

character(
    id='char.festival_crowd', name='Festival crowd of Cling (adults and children)', cue=None, group=True,
    canon_status='Proposed extras; "distinct through behavior rather than invented backstories".',
    identity_rules=['No named casualties.', 'Crowd motion stays coherent: toward the arch or the broad road, not in circles.'],
    appears_in=appear(('3A', 'Hands exchange food; children chase one another; adults work and celebrate; the crowd laughs and responds to the speech.'),
                      ('3B', 'A few follow the captain\'s gaze; others keep eating and talking.'),
                      ('3C', 'Evacuation in two coherent flows (stone arch, broad road); a fallen person is helped up; dust, cloth and moving feet.'),
                      ('3D', 'Mostly heard: coughing, distant cries; injured brought under stone cover.')),
    face={'tier': 'background', 'close_up': False, 'close_up_evidence': [], 'lip_sync': False,
          'expressions': ['generic talk/laugh mouth loop for the nearest extras', 'fear', 'blink']},
    body={'height_m': None, 'notes': 'Suggested 40-80 visible at peak; 25-40 near the camera at full detail, the rest at low detail.'},
    costume={'source': 'screenplay palette', 'screenplay_text': 'ordinary clothing; warm cloth', 'proposal': 'Garment kit (tunics, skirts, aprons, hoods, hats) randomized from the Cling palette.', 'must_not': ['heraldry']},
    states=[{'id': 'crowd.festival', 'scenes': ['3A', '3B'], 'description': 'Clean.'}, {'id': 'crowd.evacuating', 'scenes': ['3C'], 'description': 'Running, dusty.'},
            {'id': 'crowd.aftermath', 'scenes': ['3D'], 'description': 'Sheltering, dusty.'}],
    props=['prop.food_items', 'prop.cups_and_bowls'],
    animations=['idle', 'walk', 'carry', 'eat/exchange food', 'clap/cheer/laugh', 'look up', 'point', 'run (two route directions)', 'stumble, fall, rise', 'crouch/cower', 'cough'],
    rig_needs=['shared crowd skeleton (old engine 19-bone humanoid is enough)', '6-10 body and costume variants', 'low-poly heads with blink'],
    build={'approach': 'Individual SkinnedMesh per extra up to ~60; above that, baked vertex-animation textures on InstancedMesh. Paths authored as splines per route.',
           'feasibility': feas('yellow', 'medium', 'Many skinned meshes plus shadows on CPU; choreography must stay coherent with the fixed escape routes.',
                               'Hero-proximate extras fully animated; distant ones low-poly, possibly on twos; dust hides the rest during 3C.')})

NOT_BUILT = [{'role': 'NARRATOR', 'why': 'Voice only (prologue). No picture asset.', 'lines': spoken('NARRATOR')['total_lines']},
             {'role': 'King Fallen of Scrapper', 'why': 'Mentioned only ("send word to King Fallen"). Never on screen in Episode 1.'},
             {'role': 'Terrence / Reginald, Water Gliders, Stroke, Tail, a Slitherwing fleet', 'why': 'Belong to later episodes; must not appear here (CANON LOCK 16).'}]

# --------------------------------------------------------------------------- dragons
DRAGONS = []


def dragon(**kw):
    kw.setdefault('provisional_design', True)
    kw['editorial_window_minutes'] = window(kw['scenes'])
    order = ['id', 'name', 'species', 'colour', 'rider', 'canon_traits', 'scenes', 'editorial_window_minutes', 'appears_in', 'size',
             'animations', 'rig', 'materials', 'states', 'forbidden', 'build', 'provisional_design', 'design_questions']
    DRAGONS.append({k: kw[k] for k in order if k in kw})


COMMON_FORBIDDEN = ['glow or emissive light of any kind (eyes, membranes, scales)', 'extra limbs', 'horn arrangements that change between shots',
                    'decorative armor', 'human dialogue (dragons communicate by posture, breath, growls, calls and eye movement)']

dragon(
    id='dragon.charcoal', name='Charcoal', species='Bashion (melanistic)', colour='black', rider='char.remi',
    canon_traits=['black', 'immense', 'generally calm and slow to anger', 'takeoff devastates the ground',
                  'not faster than a Slitherwing in a straight race: he closes by position and turns',
                  'the only dragon that breathes fire in this episode, and only on the command "Fire"', 'exact anatomy not approved: design provisional'],
    scenes=['1B', '1C', '1D', '1E', '1F', '2A', '2C'],
    appears_in=appear(('1B', 'Resting; close enough to mistake his hide for dark terrain; breathing moves the air around Remi.'),
                      ('1C', 'Begins to move; wings open until the frame cannot contain them; launches; turf and dust; climbs over the coast; draws level with Leaf; shadow crosses the water.'),
                      ('1D', 'Effortless flight; slow head turn after Leaf\'s nip; takes Leaf\'s whole head into his mouth and releases it unharmed; returns his head to the flight path.'),
                      ('1E', 'Tracks the scout with his head; brought close to Leaf; banks on "Attack."'),
                      ('1F', 'Takes the inside angle in a deliberate, expensive turn; jaws close on empty air; turns across; shadow swallows the scout; brief directed flame; catches the scout in his jaws; the struggle tears the scout\'s LEFT wing loose; releases on "Hold!"; circles once; banks home.'),
                      ('2A', 'Shadow crosses the field; heavy landing away from Abby and Leaf; watches quietly behind Remi.'),
                      ('2C', 'Lies still in the grounds, breathing slowly.')),
    size={'relation': 'Leaf is dramatically smaller; Starlight is about twice his size. "Size" is not a fixed measurement: see scale.',
          'config_key': 'scale.charcoal_over_leaf'},
    animations=[
        {'id': 'idle_rest_breathing', 'scenes': ['1B', '2C'], 'description': 'Lying/resting; slow ribcage rise and fall, nostril flare, occasional eye movement.'},
        {'id': 'head_look', 'scenes': ['1B', '1D', '1E', '2A'], 'description': 'Slow, deliberate head and eye turns (no angry roar).'},
        {'id': 'rise_and_wing_unfurl', 'scenes': ['1C'], 'description': 'Stands, opens wings to full span with a heavy low-register feel.'},
        {'id': 'takeoff_heavy', 'scenes': ['1C'], 'description': 'Crouch, push off, first heavy downstrokes; drives fx.dust_takeoff_landing, fx.turf_dirt_stone_debris, fx.ground_scar, fx.grass_downwash.'},
        {'id': 'climb_flap_heavy', 'scenes': ['1C'], 'description': 'Infrequent heavy beats while climbing; camera shake on downstrokes.'},
        {'id': 'cruise_flap_slow', 'scenes': ['1C', '1D', '1E'], 'description': 'Slow cruise; tempo from scale.wingbeat_hz.'},
        {'id': 'glide', 'scenes': ['1C', '1D', '1F'], 'description': 'Wings held, small corrections.'},
        {'id': 'bank_large', 'scenes': ['1E', '1F'], 'description': 'Deliberate, expensive turns; "the air shakes under each correction"; circle once; bank home.'},
        {'id': 'head_in_mouth_hold', 'scenes': ['1D'], 'description': 'Wide gape, takes Leaf\'s whole head, brief controlled hold while both keep flying, teeth never close through skin, release. Abby stays outside the mouth.'},
        {'id': 'jaw_snap_miss', 'scenes': ['1F'], 'description': 'Jaws close on empty air.'},
        {'id': 'fire_breath_brief', 'scenes': ['1F'], 'description': 'One brief directed breath of flame on "Fire". Not sustained, not explosive.'},
        {'id': 'bite_catch_struggle', 'scenes': ['1F'], 'description': 'Catches the scout in his jaws; head/neck shake; jolts Remi.'},
        {'id': 'release_on_hold', 'scenes': ['1F'], 'description': 'Releases and checks his next movement; violence stops with the command.'},
        {'id': 'landing_heavy', 'scenes': ['2A'], 'description': 'Heavy disturbance, away from Abby and Leaf; dust must not bury them.'},
        {'id': 'settle_and_watch', 'scenes': ['2A', '2C'], 'description': 'Quiet manner restored.'}],
    rig={'body_plan': 'UNKNOWN: limb count (four legs plus two wings, or wings as forelimbs) is not approved. Build the generator so either plan is a parameter; pick one per species and never change it between shots.',
         'spine': 'Procedural spline spine (as in scenes/lib/dragon.js): >=10 neck segments, torso, >=14 tail segments.',
         'head': 'Jaw hinge with a wide gape (enough to admit Leaf\'s head at the chosen scale), lip/cheek skin that stretches, optional tongue, nostrils that flare.',
         'eyes': 'Separate eyeball meshes that rotate (eye movement is acting), with lids for blink and narrowing.',
         'breathing': 'Ribcage ring radii scaled by a slow breathing curve.',
         'legs': 'Two-bone IK feet for standing, lying, takeoff push and landing.',
         'wings': 'Shoulder, elbow, wrist and 3-4 finger spars with a dynamic membrane; folded, half and full-span states.',
         'sockets': ['saddle socket at the withers for Remi', 'mouth socket that holds Leaf\'s head during head_in_mouth_hold', 'jaw grab point for the scout']},
    materials={'scales': 'Melanistic black: albedo about 0.03-0.05 linear (never 0), procedural overlapping-scale normal map at a constant world size (a bigger body shows more scales), roughness 0.35-0.55 varying per scale with edge wear, so highlights carry the form. "Do not flatten him into an unreadable silhouette."',
               'belly': 'Larger plates, same near-black family.',
               'membrane': 'Very dark, slightly translucent toward thin edges through a back-light term (not emissive).',
               'eyes': 'Colour provisional; glossy, non-emissive.',
               'horns_claws': 'Provisional dark horn; fixed arrangement.'},
    states=[{'id': 'charcoal.default', 'scenes': ['1B', '1C', '1D', '1E', '1F', '2A', '2C'], 'description': 'No wounds at any point (no unexplained major wounds).'}],
    forbidden=COMMON_FORBIDDEN,
    build={'approach': 'Shared dragon generator (body loft and auto-skin ported from the old engine animal code, spline spine and membrane from scenes/lib/dragon.js), Bashion proportions preset.',
           'feasibility': feas('orange', 'medium', 'Largest screen time of any creature, contact beats with other creatures, and black surfaces that must still read.',
                               'Parametric generator plus per-shot keyframed curves; stage contact beats wide and brief; key light raking across the scales; Charcoal framed as environment in close shots.')},
    design_questions=['Four legs plus wings, or wings as front legs?', 'Horns: how many and where?', 'Eye colour?'])

dragon(
    id='dragon.leaf', name='Leaf', species='Nightwing (subadult; common species)', colour='green', rider='char.abby',
    canon_traits=['green', 'subadult', 'can sit upright like a dog', 'dramatically smaller than Charcoal yet huge beside Abby',
                  'quicker corrective wingbeats', 'initiates the nip; is released unharmed; concerned and uninjured afterward'],
    scenes=['1B', '1C', '1D', '1E', '1F', '2A', '2C'],
    appears_in=appear(('1B', 'Sits upright; turns toward a noise and pulls the equipment out of Abby\'s reach; turns back; watches Charcoal; rises.'),
                      ('1C', 'Takes off first; the first beat shakes loose grass; quicker beats to keep pace.'),
                      ('1D', 'Edges closer to Charcoal; looks back at him; one quick nip; head taken into Charcoal\'s mouth; jerks back, puts distance between them, eyes forward; turns one eye toward Abby\'s voice.'),
                      ('1E', 'Rolls under the scout\'s wake; catches himself; rapid, uneven stabilizing beats; turns for home.'),
                      ('1F', 'Intercuts: corrects beneath Abby; a diminishing shape approaching home.'),
                      ('2A', 'Cautious landing; turns at once to look at Abby; watchful head near the keepers; takes a step after her and stops.'),
                      ('2C', 'Watches the doorway from the grounds.')),
    size={'relation': 'Dramatically smaller than Charcoal (creator: "about one-twentieth ... or smaller"); exact ratio not canon.', 'config_key': 'scale.leaf_length_m (working value only)'},
    animations=[
        {'id': 'sit_upright_dog', 'scenes': ['1B'], 'description': 'On haunches, forelegs straight, chest up.'},
        {'id': 'turn_and_pull_equipment', 'scenes': ['1B'], 'description': 'Turns toward a noise, briefly pulling the attached strap out of reach (strap has secondary motion).'},
        {'id': 'alert_watch', 'scenes': ['1B', '2A', '2C'], 'description': 'Head and eyes track Charcoal, Abby, the doorway.'},
        {'id': 'rise', 'scenes': ['1B'], 'description': 'From sitting to standing.'},
        {'id': 'takeoff_light', 'scenes': ['1C'], 'description': 'Quick launch; grass blowdown only.'},
        {'id': 'flap_quick_corrective', 'scenes': ['1C', '1D', '1F'], 'description': 'Faster, smaller beats; frequent corrections.'},
        {'id': 'glide_and_bank', 'scenes': ['1C', '1D', '1E'], 'description': 'Standard flight set.'},
        {'id': 'nip_quick', 'scenes': ['1D'], 'description': 'One clear quick snap, irritating not damaging.'},
        {'id': 'head_held_passive', 'scenes': ['1D'], 'description': 'Head inside Charcoal\'s mouth; body keeps flying; slight distress.'},
        {'id': 'recoil_and_distance', 'scenes': ['1D'], 'description': 'Jerks head back, increases distance, eyes forward.'},
        {'id': 'roll_and_recover', 'scenes': ['1E'], 'description': 'Rolls under the disturbance, catches himself.'},
        {'id': 'flap_rapid_uneven', 'scenes': ['1E'], 'description': 'Rapid, uneven stabilizing beats while Abby is hurt.'},
        {'id': 'landing_cautious', 'scenes': ['2A'], 'description': 'Gentler than his takeoff; keeps his rider steady.'},
        {'id': 'step_after_and_stop', 'scenes': ['2A'], 'description': 'One step after Abby, stops at her raised right hand.'}],
    rig={'body_plan': 'Nightwing base shared with Starlight (same species). Limb count not approved (see Charcoal).',
         'spine': 'Spline spine; neck and tail flexible enough for the dog-like sit and the recoil.',
         'legs': 'Hind legs with hock fold for the upright sit; IK feet.',
         'eyes': 'Rotating eyes with lids ("turns one eye toward her voice"). Must hold up in close shots: the shot list plans several close shots of Leaf\'s head and eye.',
         'wings': 'Same wing system as Charcoal at Nightwing proportions.',
         'sockets': ['saddle with restraint for Abby', 'equipment strap attach point', 'head collision volume for the head-in-mouth beat']},
    materials={'scales': 'Green (provisional shade), lighter underbelly, procedural scale normal map, roughness 0.4-0.6.', 'membrane': 'Darker green, back-light term, no emission.',
               'eyes': 'Provisional colour, glossy, non-emissive.'},
    states=[{'id': 'leaf.default', 'scenes': ['1B', '1C', '1D', '1E', '1F', '2A', '2C'], 'description': 'Uninjured throughout.'}],
    forbidden=COMMON_FORBIDDEN,
    build={'approach': 'Shared dragon generator with the Nightwing preset at subadult proportions.',
           'feasibility': feas('yellow', 'medium', 'Many acting beats but a smaller, simpler silhouette than Charcoal.', 'Same generator; keyframed per shot.')},
    design_questions=['Subadult proportions: any difference from an adult Nightwing (head size, wing length)?', 'Exact green?'])

dragon(
    id='dragon.starlight', name='Starlight ("Queen of Dragons")', species='Nightwing (albino)', colour='white', rider='char.queen_fall',
    canon_traits=['albino Nightwing', 'reflective white, crystal-like scales; NOT a crystal body, NOT transparent, NOT glowing', 'roughly twice Charcoal\'s size',
                  'attacks by dive-bombing; no breath weapon is shown', 'begins and ends Episode 1 without her later wing injuries'],
    scenes=['3B', '3C', '3D'],
    appears_in=appear(('3B', 'A white shape against cloud that seems still because she flies nearly toward the watchman; a wing separates from the cloud; she resolves; posture changes on "Attack." and her line steepens.'),
                      ('3C', 'Dive with wings partly folded; wings open with crushing force; low destructive sweep; first impact on the festival structures and roofline; visible-effort climb (no hovering); wide bank beyond the village; second low pass; her wake pulls the last banner up past her underside.'),
                      ('3D', 'Climbs away; breathing and wings fill the high aerial shot; a distant white moving shape; final heavy wingbeat.')),
    size={'relation': 'About twice Charcoal\'s size; Starlight and Charcoal never share a frame in Episode 1, so this ratio is felt only through her size against the village.', 'config_key': 'scale.starlight_over_charcoal'},
    animations=[
        {'id': 'distant_head_on_approach', 'scenes': ['3B'], 'description': 'Nearly head-on glide; growth in frame reveals approach.'},
        {'id': 'posture_change_attack', 'scenes': ['3B'], 'description': 'Wings adjust; line steepens.'},
        {'id': 'dive_partial_fold', 'scenes': ['3C'], 'description': 'Wings partly folded for the descent.'},
        {'id': 'flare_open', 'scenes': ['3C'], 'description': 'Wings open with crushing force to change angle over the village.'},
        {'id': 'low_sweep_contact', 'scenes': ['3C'], 'description': 'Contact with structures using the approved anatomy (which body part strikes is a provisional choice). Legs, claws and wings never change shape for a shot.'},
        {'id': 'pull_up_climb_heavy', 'scenes': ['3C', '3D'], 'description': 'Slow, effortful climb; never hovers.'},
        {'id': 'bank_wide', 'scenes': ['3C'], 'description': 'Serene bank beyond the village.'},
        {'id': 'second_low_pass', 'scenes': ['3C'], 'description': 'Proposed addition: mostly seen from the ground (shadow, white expanse between roofs).'},
        {'id': 'distant_cruise', 'scenes': ['3D'], 'description': 'Slow heavy beats; final wingbeat into black.'}],
    rig={'body_plan': 'Nightwing base (same species as Leaf), adult and immense.', 'spine': 'Spline spine.', 'wings': 'Partial-fold and flare states are essential.',
         'sockets': ['saddle for Queen Fall'], 'notes': 'No jaw-fire rig needed.'},
    materials={'scales': 'White, albedo about 0.7-0.8 (not 1.0, so highlights do not clip); per-facet normal variation (Voronoi facets in the normal map) for the crystal-like suggestion; roughness 0.2-0.45 varying per facet; reflections from the sky environment map give the silver highlights; soft grey underside from sky occlusion.',
               'membrane': 'White-grey, back-light term.', 'eyes': 'Provisional (albino pink/red would be a guess, not canon).',
               'never': ['transmission/transparency', 'emissive', 'bloom (the runtime has none, which helps)']},
    states=[{'id': 'starlight.default', 'scenes': ['3B', '3C', '3D'], 'description': 'Uninjured; at most light dust after contact.'}],
    forbidden=COMMON_FORBIDDEN + ['breath weapon or fire', 'hovering over the square', 'wing piercing or fleet damage from later episodes'],
    build={'approach': 'Nightwing preset at the Starlight scale; reflective white material tuned under the Cling daylight.',
           'feasibility': feas('yellow', 'medium', 'Mostly distant or partial views; the material is the main risk (white that is not flat and not glowing).',
                               'Faceted normal map plus sky environment reflections; partial framing (underside, wing between roofs) in ground shots.')},
    design_questions=['Eye colour?', 'Which part of her strikes the roofline (claws, belly, tail, wingtip)?'])

dragon(
    id='dragon.gold_hatchling', name='Gold Bashion hatchling (unnamed)', species='Bashion (same species as Charcoal)', colour='24-karat gold look', rider=None,
    canon_traits=['24-karat-gold Bashion', 'newborn: wet, unsteady, exhausted, physically weak', 'its body does not emit light', 'no name and no rider in this episode'],
    scenes=['PROLOGUE', '1A'],
    appears_in=appear(('PROLOGUE', 'Title card: the dark surface of the closed egg; a quiet scratch from within.'),
                      ('1A', 'Pressure beneath the shell; a fine crack extends and stops; a fragment lifts; a small gold shape presses into the opening; a pause to breathe; emerges awkwardly; head shifts toward Abby\'s voice; tries to lift itself and slips against the shell; supported with a folded cloth; goes still; then its side rises.')),
    size={'relation': 'Newborn; small enough for Alexandria to support with a folded cloth.', 'config_key': None},
    animations=[
        {'id': 'in_shell_pressure', 'scenes': ['1A'], 'description': 'Shell bulges and cracks (shell displacement + crack mask).'},
        {'id': 'break_through', 'scenes': ['1A'], 'description': 'Fragment lifts; gold shape presses into the opening.'},
        {'id': 'pause_breathe', 'scenes': ['1A'], 'description': 'Visible effortful breathing.'},
        {'id': 'emerge_awkward', 'scenes': ['1A'], 'description': 'Wet, unsteady limbs; folded wet wings (if Bashions have wings in the approved design).'},
        {'id': 'head_turn_to_voice', 'scenes': ['1A'], 'description': 'Turns toward Abby.'},
        {'id': 'slip_against_shell', 'scenes': ['1A'], 'description': 'Tries to lift itself and slips (keyframed contact).'},
        {'id': 'supported_by_cloth', 'scenes': ['1A'], 'description': 'Body rests against the cloth in Alexandria\'s hand.'},
        {'id': 'stillness_then_breath', 'scenes': ['1A'], 'description': 'A held stillness that makes Abby fear it stopped breathing, then one visible rise of its side.'},
        {'id': 'faint_effortful_sound', 'scenes': ['1A'], 'description': 'Small jaw opening synced to the sound.'}],
    rig={'body_plan': 'Bashion hatchling proportions (large head, short limbs); must agree with Charcoal\'s body plan.', 'spine': 'Short spline spine.',
         'eyes': 'Wet eyes with lids.', 'legs': 'IK for contact with shell and bedding.', 'sockets': ['cloth contact surface']},
    materials={'scales': 'Gold: base colour near linear (1.0, 0.78, 0.34), metalness 0.7-1.0, roughness 0.15-0.3, tiny scale normal map.',
               'wet': 'Clearcoat 1.0 with low clearcoat roughness, drip/droplet normals, a few instanced droplets.',
               'egg': 'Dark matte shell outside (title card), lighter inner membrane.',
               'never': ['emissive']},
    states=[{'id': 'hatchling.in_egg', 'scenes': ['PROLOGUE', '1A'], 'description': 'Closed egg with an existing fracture.'},
            {'id': 'hatchling.emerging', 'scenes': ['1A'], 'description': 'Wet, partly out of the shell.'},
            {'id': 'hatchling.resting', 'scenes': ['1A'], 'description': 'Out, wet, still, breathing.'}],
    forbidden=COMMON_FORBIDDEN + ['magical apparatus or glow around the egg'],
    build={'approach': 'Bashion preset at hatchling proportions; MeshPhysicalMaterial with clearcoat (the one place clearcoat is clearly worth its cost).',
           'feasibility': feas('yellow', 'medium', 'Close-ups of a wet, small creature with contact acting; gold must not read as glow.',
                               'Warm lamp key plus cool high daylight; clearcoat for wetness; keyframed contact with IK; shell pieces from pre-fracture.')},
    design_questions=['Does a Bashion hatch with visible wings?'])

dragon(
    id='dragon.slitherwing_scout', name='Slitherwing scout (unnamed)', species='Slitherwing (NOT a Nightwing)', colour='provisional', rider='char.scout_rider',
    canon_traits=['small and extremely fast', 'loses its LEFT wing to Charcoal', 'falls into the sea; makes a weak effort to stay above water; not declared dead',
                  'coloring and detailed silhouette are provisional'],
    scenes=['1E', '1F'],
    appears_in=appear(('1E', 'A narrow shape at the frame edge, gone before it resolves; cuts past Leaf at terrifying speed; reappears at a distance crossing toward open water.'),
                      ('1F', 'Banks around the coastal outcrop or mist; evades Charcoal\'s first reach; drops; tries to slip beneath the flame; loses coordination; caught in Charcoal\'s jaws; struggles; its LEFT wing tears loose (seen in silhouette against bright water); falls; hits the water seen from above and far away; a broken trail; weak effort to keep itself above water.')),
    size={'relation': 'Small, rider-carrying, much smaller than Charcoal and small enough to be caught in his jaws. Size relative to Leaf is not stated.', 'config_key': 'scale.scout_over_leaf'},
    animations=[
        {'id': 'high_speed_pass', 'scenes': ['1E'], 'description': 'Wings tucked, extreme speed, sharp close passage; see fx.scout_pass_motion and fx.wake_and_wind.'},
        {'id': 'sharp_bank', 'scenes': ['1F'], 'description': 'Around the outcrop or mist bank.'},
        {'id': 'evasive_jink_and_drop', 'scenes': ['1F'], 'description': 'Rider-directed changes of direction.'},
        {'id': 'slip_under_flame', 'scenes': ['1F'], 'description': 'Dives under the breath; rider is hit.'},
        {'id': 'loss_of_coordination', 'scenes': ['1F'], 'description': 'Turn breaks down after the rider is burned.'},
        {'id': 'struggle_in_jaws', 'scenes': ['1F'], 'description': 'Thrash and desperate twist.'},
        {'id': 'left_wing_detach', 'scenes': ['1F'], 'description': 'The LEFT wing subtree detaches; tumbles away in silhouette (fx.wing_separation).'},
        {'id': 'fall_one_wing', 'scenes': ['1F'], 'description': 'Spinning fall; the remaining RIGHT wing cannot restore controlled flight.'},
        {'id': 'water_impact', 'scenes': ['1F'], 'description': 'Seen from above and far (fx.water_impact_and_trail).'},
        {'id': 'weak_struggle_afloat', 'scenes': ['1F'], 'description': 'Partly submerged, small movements, rider still attached.'}],
    rig={'body_plan': 'Must read as a different species from Nightwings. Proposal: long narrow body, long thin tail, small head, narrow swept high-aspect wings set far forward, legs tucked.',
         'spine': 'Long spline spine (more segments: a slithering look).',
         'wings': 'LEFT wing (the creature\'s own left, +x when facing +z) built as a separate detachable subtree with its own membrane; a torn-shoulder variant on the body, framed so the wound is never seen up close.',
         'sockets': ['saddle for the scout rider (no marks)', 'grab point for Charcoal\'s jaws']},
    materials={'scales': 'Provisional proposal: muted slate or grey-brown with a paler underside (distinct from black, green, white and gold); satin finish.',
               'membrane': 'Thin, back-lit.', 'damage': 'Tiny, brief dark blood traces only.'},
    states=[{'id': 'scout.intact', 'scenes': ['1E', '1F'], 'description': 'Both wings.'},
            {'id': 'scout.left_wing_lost', 'scenes': ['1F'], 'description': 'From the tear onward, LEFT wing missing in every shot.'},
            {'id': 'scout.in_water', 'scenes': ['1F'], 'description': 'Afloat, weak, alive.'}],
    forbidden=COMMON_FORBIDDEN + ['Nightwing body plan', 'insignia or legible marks on the saddle', 'close-up of the wound'],
    build={'approach': 'Shared dragon generator with a Slitherwing preset; detachable wing handled by reparenting the wing group to the world at the tear time.',
           'feasibility': feas('yellow', 'low', 'Small and fast on screen; the tear and the fall are short beats.', 'Silhouette staging against bright water; quick cuts; keyframed fall.')},
    design_questions=['Colours?', 'Size compared with Leaf?', 'Does a Slitherwing look snake-like, as the name suggests?'])

dragon(
    id='dragon.prologue_mist_shape', name='Unnamed shape in the prologue mist', species='not identified (must not be a new named dragon)', colour='silhouette only', rider=None,
    canon_traits=['an illustrative impression of discovery, not a canon incident', 'large enough that the eye first mistakes its shadow for cloud'],
    scenes=['PROLOGUE'],
    appears_in=appear(('PROLOGUE', 'Passes beyond the fog; only a soft shadow and a change in the mist. Later the wing-shaped cloud matches to a present-day dragon shadow over grass; cut before identifying the dragon.')),
    size={'relation': 'Immense impression only.', 'config_key': None},
    animations=[{'id': 'pass_behind_fog', 'scenes': ['PROLOGUE'], 'description': 'A blurred dark shape drifting across fog cards.'},
                {'id': 'shadow_over_grass', 'scenes': ['PROLOGUE'], 'description': 'A moving wing-shaped shadow (a projected silhouette).'}],
    rig={'notes': 'No rig: a blurred silhouette texture. Optionally rendered from the Charcoal model\'s silhouette for the present-day shadow, but never revealed (production choice).'},
    materials={'notes': 'Shadow/silhouette only.'},
    states=[], forbidden=['showing anatomy', 'identifying a named dragon'],
    build={'approach': 'Silhouette texture moving behind fog cards; projected shadow over the grass.',
           'feasibility': feas('green', 'low', 'Deliberately unresolved.', 'Blurred silhouette card plus a projected shadow.')})

# --------------------------------------------------------------------------- scale
LEAF_LEN = 8.0
LEAF_HZ = 1.6
SKULL_FRACTION = 1 / 9.0
SPAN_FACTOR = 1.4
SQUARE_M = 45.0
readings = []
for key, label, r_cl, r_sc, evidence in [
    ('volume', 'Size means bulk or weight (volume)', 20 ** (1 / 3), 2 ** (1 / 3),
     'Keeps every rider clearly visible, but Charcoal is less than three times Leaf\'s length, which may not feel like "dramatically smaller".'),
    ('silhouette_area', 'Size means how big each looks on screen (silhouette area)', 20 ** 0.5, 2 ** 0.5,
     'Recommended working default: Leaf\'s whole body is roughly as long as Charcoal\'s neck (with ordinary long-necked dragon proportions), Leaf\'s head fits Charcoal\'s mouth with Abby just outside it, Remi is still "a small fixed point", and Starlight fits "between roofs".'),
    ('length', 'Size means length or height (linear)', 20.0, 2.0,
     'Literal but hard to stage: Remi is about 1% of Charcoal\'s length, Leaf\'s whole body fits in Charcoal\'s mouth, and a Starlight hundreds of metres long would flatten all of Cling rather than "the edge of the festival structures and adjoining roofline".')]:
    c_len = LEAF_LEN * r_cl
    s_len = c_len * r_sc
    readings.append({
        'reading': key, 'meaning': label,
        'charcoal_over_leaf_length': round(r_cl, 2), 'starlight_over_charcoal_length': round(r_sc, 2),
        'leaf_length_m': LEAF_LEN, 'charcoal_length_m': round(c_len, 1), 'starlight_length_m': round(s_len, 1),
        'charcoal_wingspan_m_if_1.4x_length': round(c_len * SPAN_FACTOR, 1), 'starlight_wingspan_m_if_1.4x_length': round(s_len * SPAN_FACTOR, 1),
        'starlight_wingspan_over_cling_square': round(s_len * SPAN_FACTOR / SQUARE_M, 1),
        'remi_1.7m_as_percent_of_charcoal_length': round(100 * 1.7 / c_len, 1),
        'remi_pixels_if_charcoal_fills_4k_width': round(3840 * 1.7 / c_len),
        'charcoal_skull_m_if_1/9_length': round(c_len * SKULL_FRACTION, 1),
        'leaf_head_m_if_1/9_length': round(LEAF_LEN * SKULL_FRACTION, 1),
        'wingbeat_hz_leaf': LEAF_HZ, 'wingbeat_hz_charcoal': round(LEAF_HZ / math.sqrt(r_cl), 2),
        'wingbeat_hz_starlight': round(LEAF_HZ / math.sqrt(r_cl * r_sc), 2),
        'staging_verdict': evidence})

SCALE = {
    'canon': 'CANON LOCK 7: Leaf is "about one-twentieth Charcoal\'s size or smaller" in the creator\'s words; "size" is not an established linear measurement; do not turn it into an exact height or volume ratio; preserve the unmistakable disparity. CANON LOCK 14: Starlight is roughly twice Charcoal\'s size.',
    'the_problem': 'Taken literally as length (20x, then 2x again), Starlight would be 40 times Leaf\'s length. A dragon that big cannot share a readable frame with a human rider, and the screenplay\'s own staging assumes smaller ratios. Read as bulk or as on-screen area, the ratios become stageable.',
    'working_assumptions_not_canon': {'leaf_length_m': LEAF_LEN, 'leaf_cruise_wingbeat_hz': LEAF_HZ, 'skull_length_fraction': round(SKULL_FRACTION, 3),
                                      'wingspan_over_length': SPAN_FACTOR, 'cling_square_width_m': SQUARE_M,
                                      'wingbeat_rule': 'frequency roughly proportional to 1/sqrt(length) for same-shaped flyers (Pennycuick-style scaling); a rule of thumb for believable weight, not physics canon.'},
    'readings': readings,
    'screenplay_evidence': ['1C: "Charcoal rises out of it with Remi a small fixed point on his back" (Remi must stay visible).',
                            '1D: "Abby\'s body remains safely outside Charcoal\'s mouth" (the mouth is big enough to make this a concern, but not big enough to swallow Leaf whole).',
                            '1D: the riders talk in flight; they must be "close enough to hear one another".',
                            '3C: damage hits "the edge of the festival structures and adjoining roofline"; later "a white expanse between roofs"; "the stone arch still standing".'],
    'recommendation': 'Build every size from one config (scale.charcoal_over_leaf, scale.starlight_over_charcoal, scale.leaf_length_m, scale.scout_over_leaf). Start from the silhouette-area reading. Render one still "lineup" picture of all three readings (with a human for scale) at preview resolution and let Daxtyn choose. Use the same reading for every "size" statement in the series. Never write the chosen numbers into canon documents.',
    'on_screen_pairs_in_episode_1': {'charcoal_with_leaf': ['1B', '1C', '1D', '1E', '2A', '2C'], 'charcoal_with_scout': ['1F'], 'leaf_with_scout': ['1E'],
                                     'starlight_with_any_other_dragon': [], 'note': 'Starlight never shares a frame with another dragon in Episode 1.'},
    'audio_sync': 'Wingbeat sound effects use these same wingbeat_hz values (voices.json creature_vocals.*.wingbeat lists the period for each reading). Never type a separate tempo into the sound or the animation: change the reading here and both follow.',
    'staging_rules': [
        'Depth staging: put Leaf in front, Charcoal behind ("Hold an angle that includes Charcoal behind him").',
        'A human in every scale-defining shot: Remi reaching for a strap beside Charcoal; Abby in front of Leaf; villagers and roofs under Starlight.',
        'Frame giants as environment: hide edges ("mistake Charcoal\'s black hide for dark terrain"; "wings open until the frame cannot contain them").',
        'Keep scale texture at a constant world size, so the bigger dragon shows many more, relatively smaller scales.',
        'Big things move slowly: long ease-in/out, infrequent heavy wingbeats, camera shake on downstrokes; small things move fast with quick corrections.',
        'Atmospheric perspective: the existing atmosphere fog makes distant parts of a huge body hazier.',
        'Shadows sell scale: Charcoal\'s shadow crossing water or swallowing the scout; Starlight\'s shadow reaching the first roofs.',
        'Lens: wide lens close to a giant for looming; long lens for lineups and two-dragon wides.',
        'For the head-in-mouth beat use the screenplay\'s wide angle with both dragons and both riders; choose the scale so Leaf\'s head fills part, not all, of Charcoal\'s gape.',
        'Per-shot camera near/far planes: the runtime default is near 0.5 m / far 20 km; face close-ups need near about 0.05-0.1 m, so scenes should set camera.near/far per shot (ctx.camera is exposed) instead of using a logarithmic depth buffer, which is slower on a CPU renderer.']}

# --------------------------------------------------------------------------- sets
SETS = []


def set_(**kw):
    kw['editorial_window_minutes'] = window(kw['scenes'])
    order = ['id', 'name', 'sluglines', 'scenes', 'editorial_window_minutes', 'palette', 'lighting', 'layout_landmarks', 'props',
             'destructible_parts', 'states', 'extras', 'build', 'notes']
    SETS.append({k: kw[k] for k in order if k in kw})


def prop(pid, name, destructible=False, states=None, notes=None, feasibility=None):
    d = {'id': pid, 'name': name, 'destructible': destructible}
    if states:
        d['states'] = states
    if notes:
        d['notes'] = notes
    if feasibility:
        d['feasibility'] = feasibility
    return d


set_(id='set.prologue', name='Prologue: sea, coast and landscape dissolves; present-day grass; title egg',
     sluglines=['EXT. SEA AND COAST — DAWN'], scenes=['PROLOGUE'],
     palette='Dawn: pale sky reflected in deep-blue sea bands; morning cloud on the island\'s high ground.',
     lighting='Low dawn sun, soft; fog.',
     layout_landmarks=['Low camera just above moving water', 'An island whose high ground disappears into morning cloud', 'Rocky shore (waves are mostly sound)',
                       'A small wooden vessel crossing the foreground (not the Santa Maria)', 'A fog bank where the mist changes shape',
                       'Dissolves: a coastal settlement, open sea, a forest reaching a cliff, distant fortified walls (no map, no borders)',
                       'Present-day grass field for the wing-shaped shadow', 'Title: dark surface of the closed egg (shared with set.verdor_birthing_chamber)'],
     props=[prop('prop.prologue_vessel', 'Small, unremarkable wooden sailing vessel with sails', notes='Reuse the ship generator with smaller, single-mast parameters so it does not read as the Santa Maria.'),
            prop('prop.rope_and_cleat', 'Rope, cleat or belaying pin for the hand insert'),
            prop('prop.castle_walls_distant', 'Distant fortified walls', notes='scenes/lib/castle.js already builds a procedural castle; its banner must stay plain (no heraldry).')],
     destructible_parts=[], states=[{'id': 'prologue.default', 'description': 'Dawn, mist.'}],
     extras=['char.sailor'],
     build={'approach': 'Runtime atmosphere (sky, fog, clouds), heightfield terrain like scenes/test-kingdom.js, new ocean, fog cards, instanced trees and simple houses, castle.js for walls.',
            'feasibility': feas('yellow', 'medium', 'Several distinct landscapes, each seen only briefly but in 4K wides.', 'Low-detail wides softened by fog and dissolves; captions come from onscreen-text.json.')},
     notes=['Captions (T01-T05) and the title (T06) are defined in onscreen-text.json.'])

set_(id='set.verdor_birthing_chamber', name='Verdor birthing chamber', sluglines=['INT. BIRTHING CHAMBER — MORNING'], scenes=['PROLOGUE', '1A'],
     palette='Warm interior, weathered pale stone.', lighting='Subdued lamps plus daylight entering high above.',
     layout_landmarks=['Door that opens (Alexandria enters; Abby and Remi appear at the doorway)', 'Prepared nest with soft bedding around the egg', 'High window or opening for daylight',
                       'Bowls of water and folded cloth (attendants have waited a long time)', 'Generic incubation; no magical apparatus'],
     props=[prop('prop.egg', 'The egg', destructible=True,
                 states=['closed with an existing fracture (title)', 'fine crack extending', 'fragment lifting', 'opening with gold shape', 'broken shell'],
                 notes='Pre-fractured shell pieces plus an animated crack mask (fx.egg_crack_and_shell).'),
            prop('prop.nest_bedding', 'Soft prepared bedding (provisional material: cloth and straw)'),
            prop('prop.water_bowls', 'Bowls of water'), prop('prop.folded_cloths', 'Folded cloths (one supports the hatchling)'),
            prop('prop.lamps', 'Oil lamps (period-neutral)'), prop('prop.stool', 'Low stool or bench so Alexandria can lower herself beside the nest')],
     destructible_parts=['egg shell'], states=[{'id': 'chamber.default', 'description': 'Unchanged except the egg.'}],
     extras=['char.attendant'],
     build={'approach': 'Simple box room with stone and plaster materials, one shadowed light (the daylight), unshadowed lamp point lights, an additive light-shaft card.',
            'feasibility': feas('green', 'low', 'Small interior.', 'Two-light setup; point-light shadows avoided (each costs six extra renders).')})

set_(id='set.verdor_riding_grounds', name='Verdor riding grounds', sluglines=['EXT. VERDOR RIDING GROUNDS — MORNING', 'EXT. VERDOR RIDING GROUNDS / SKY — CONTINUOUS', 'EXT. VERDOR RIDING GROUNDS — DAY'],
     scenes=['1B', '1C', '2A', '2C'], palette='Green vegetation, weathered pale stone, sea blue beyond; morning mist (1B) giving way to clear daylight.',
     lighting='Morning sun with low mist in 1B; clear day in 2A and 2C. Sun direction fixed across cuts.',
     layout_landmarks=['Large open grass field near the coast', 'Cleared launch area for Charcoal', 'Leaf\'s place "farther across the field"',
                       'Ground keepers\' station well outside the launch space', 'Charcoal\'s mounting platform or access rig', 'A building with a doorway at the field edge (Abby is helped inside; Leaf watches it in 2C)',
                       'Separate resting areas for Leaf and Charcoal (2C)', 'View toward the coast and sea'],
     props=[prop('prop.charcoal_access_platform', 'Grounded platform or access rig for mounting Charcoal (no jumping onto a giant dragon)'),
            prop('prop.leaf_dismount_platform', 'Movable stable platform brought alongside Leaf (2A)'),
            prop('prop.loose_stones', 'Loose stones that jump at takeoff'), prop('prop.doorway_building', 'Building edge with a doorway')],
     destructible_parts=['Turf in the launch area: dirt lifts, turf breaks, loose stones jump, rolling dust (1C)', 'Landing disturbance away from Abby and Leaf (2A)'],
     states=[{'id': 'grounds.pristine', 'scenes': ['1B'], 'description': 'Unbroken grass, mist.'},
             {'id': 'grounds.launch_scar', 'scenes': ['1C', '2A', '2C'], 'description': 'Torn turf, exposed dirt, scattered stones, flattened grass. Proposed continuity: still visible in 2A and 2C ("Someone has to mend it afterward"); confirm with Daxtyn.'}],
     extras=['char.ground_keepers'],
     build={'approach': 'Heightfield terrain, ported grass with downwash and scar mask, ground scar decal, simple building module.',
            'feasibility': feas('yellow', 'medium', 'Dense foreground grass at ground-level camera in 4K is costly; the field must survive the takeoff.', 'Grass blades only within about 40 m of the camera; textured ground beyond; scar as a terrain mask.')})

set_(id='set.verdor_coast_sky', name='Sky and sea off Verdor (coast, outer rocks, mist, palace silhouette)',
     sluglines=['EXT. SKY OFF VERDOR — DAY', 'EXT. SKY OFF VERDOR — CONTINUOUS', 'EXT. COASTAL SKY AND WATER — CONTINUOUS'],
     scenes=['1C', '1D', '1E', '1F'], palette='Sea blue, green island, pale stone; clear daylight.', lighting='Daylight; sun direction fixed; bright water for silhouettes.',
     layout_landmarks=['Verdor shoreline with an inland side and an open-water side (keep fixed through the attack)', 'Palace at a distant position, visible from the sky (1D)',
                       'Coastal outcrop / "outer rocks" / "point"', 'Low bank of sea mist near the outcrop', 'Fall point on the seaward side beyond the outer rocks, near the coast',
                       'Leaf\'s route inland to the riding grounds', 'Harbor location (for set.verdor_harbor) on the same coastline'],
     props=[prop('prop.palace_silhouette', 'Distant palace silhouette (provisional; could reuse castle.js with different parameters; no heraldic banners)'),
            prop('prop.outer_rocks', 'Rock outcrop meshes (heightfields smear cliffs, so use rock meshes)')],
     destructible_parts=[], states=[{'id': 'coast.default', 'description': 'Unchanged; water impact FX only.'}],
     extras=[],
     build={'approach': 'One geography data file (positions only, not a political map) shared by all Verdor sets, the window view in 2C and Remi\'s pointing. Terrain, ocean, rock meshes, mist cards.',
            'feasibility': feas('yellow', 'medium', 'Large open ocean to the horizon plus coastline at many angles.', 'Closed-form ocean with sky reflections; mist cards; keep the coastline layout fixed so cuts match.')})

set_(id='set.verdor_treatment_room', name='Verdor treatment room', sluglines=['INT. VERDOR TREATMENT ROOM — DAY', 'INT. TREATMENT ROOM DOORWAY'], scenes=['2B', '2C'],
     palette='Warm interior, daylight.', lighting='Window daylight plus warm fill.',
     layout_landmarks=['Seat for Abby', 'Space for the healer', 'Clean cloth and water', 'Open door / doorway (Remi stays within Abby\'s view at the threshold)',
                       'A nearby opening with the coastline visible (or an unlabelled coastal sketch)', 'Seat for Remi (2C)', 'Stool for Alexandria'],
     props=[prop('prop.seats', 'Seats/bench x2-3'), prop('prop.water_basin', 'Basin of water'), prop('prop.clean_cloths', 'Clean cloths'),
            prop('prop.sling', 'Sling for Abby\'s LEFT arm', states=['not yet (2B)', 'worn (2C)']),
            prop('prop.coastal_sketch', 'Simple unlabelled coastal sketch (optional; no definitive world map)')],
     destructible_parts=[], states=[{'id': 'room.default', 'description': 'Unchanged.'}], extras=['char.healer', 'char.royal_messenger'],
     build={'approach': 'Simple interior; the window view reuses the coast geography.', 'feasibility': feas('green', 'low', 'Small interior; the cost is in the faces.', 'Two-light setup.')})

set_(id='set.verdor_harbor', name='Verdor harbor with the Santa Maria', sluglines=['EXT. VERDOR HARBOR — DAY'], scenes=['2C'],
     palette='Weathered pale stone, sea blue, timber.', lighting='Daylight.',
     layout_landmarks=['Weathered stone steps down to the quay', 'Quay where the Santa Maria is moored', 'Crew working area with supplies', 'Lookout position facing seaward', 'Harbor bell (heard; optional visible)'],
     props=[prop('prop.santa_maria', 'The Santa Maria (the story\'s vessel)', notes='Generic period-plausible wooden sailing ship, provisional design; hull built with the same lofted-ring technique as the human body; sails furled; detail only on the harbor-facing side. Name on the hull only if the lettering is legible (optional, onscreen-text T07); use an open-licensed font (Liberation Serif, SIL OFL 1.1, installed on this machine).',
                 feasibility=feas('orange', 'medium', 'Masts, yards and rigging lines are fiddly, and thin lines alias at 4K.', 'Brief intercut: furled sails, a limited set of rigging lines as thin tubes, the rest implied.')),
            prop('prop.harbor_supplies', 'Crates, barrels, sacks'), prop('prop.ropes', 'Mooring and working ropes (tubes along catenary curves)'), prop('prop.harbor_bell', 'Harbor bell (optional visible)')],
     destructible_parts=[], states=[{'id': 'harbor.preparing', 'description': 'Preparations beginning; the rescue itself is never shown.'}], extras=['char.harbor_crew', 'char.royal_messenger'],
     build={'approach': 'Ship generator plus quay kit.', 'feasibility': feas('yellow', 'medium', 'The ship is the largest single prop to model.', 'Partial set built only for the intercut angles.')})

set_(id='set.cling_village_square', name='Cling village and square (within Scrapper)', sluglines=['EXT. CLING VILLAGE, WITHIN SCRAPPER — DAY', 'EXT. CLING SQUARE / SKY — CONTINUOUS', 'EXT. CLING VILLAGE — CONTINUOUS', 'EXT. CLING VILLAGE — MOMENTS LATER'],
     scenes=['3A', '3B', '3C', '3D'], palette='Warm cloth banners, food stalls, timber, grey stone, ordinary clothing.', lighting='Daylight; sun direction fixed for all four sub-scenes.',
     layout_landmarks=['Square with uneven paving stones', 'Steps at the edge of the square (the king\'s address)', 'Stone arch: escape route 1 (parent and child); still standing at the end',
                       'Alley: where the vendor stores the crate', 'Gate opening onto a broader road: escape route 2 (guard checks it)',
                       'Continuous reference point (chosen, proposed design): a fountain at the CENTER of the square with a raised rim and a central stone pillar, readable at foot level and above the dust. Same layout as shotlist.json conventions.cling_map.',
                       'Watchman\'s post at the edge of the square with a sight line to the far sky past the banners', 'A separate substantial stone support by the king\'s steps (screen RIGHT on the standard map): the cover for the king and captain; it is not the fountain pillar',
                       'Shelter where the parent and child sit (3D)', 'Festival structures (timber), stalls, music space, decorations, banners across the square',
                       'Houses with tiled roofs; the roofline adjoining the festival structures is the impact zone', 'Surrounding landscape for the final wide; Starlight approaches out of cloud from one fixed side',
                       'The street route of the opening travelling shot (blocked in 3D)'],
     props=[prop('prop.vendor_stall', 'Vendor\'s food stall on uneven stones, with a cloth corner people catch', destructible=True,
                 states=['standing (3A-3B)', 'cloth torn free (3C)', 'swept into the square, wrecked (3C)', 'torn stall (3D)']),
            prop('prop.festival_structures', 'Timber festival frames and decorations', destructible=True, states=['intact', 'broken, vanished in dust']),
            prop('prop.banners', 'Cloth banners (plain festival patterns; no heraldry)', destructible=True,
                 states=['fluttering', 'one moved aside by the captain (3A)', 'snapping (3C)', 'last banner pulled loose and carried up past Starlight\'s underside (3C)', 'one surviving strip moving in a gust (3D)']),
            prop('prop.roof_tiles', 'Roof tiles of the adjoining roofline', destructible=True, states=['intact', 'scattered']),
            prop('prop.fallen_beam', 'Beam that falls across part of the arch route and is pushed aside enough to pass', destructible=True, notes='Its fall and rest pose must be keyframed, not simulated.'),
            prop('prop.empty_crate', 'Empty crate (stored in the alley)'), prop('prop.parcel', 'Parent\'s parcel (dropped in 3C; can stay in the debris)'),
            prop('prop.instruments', 'Musicians\' instruments (provisional), abandoned in 3C'), prop('prop.food_items', 'Food, cups, bowls'),
            prop('prop.loose_metal_fitting', 'A loose metal fitting that strikes stone in the wind (3D)'), prop('prop.circlet', 'King\'s optional circlet')],
     destructible_parts=['Adjoining roofline: timber breaks, tiles scatter (first pass)', 'Festival structures and decorations', 'Abandoned stall swept into the square',
                         'Stall cloth tearing free', 'Fallen beam at the arch', 'Banners (snap, torn loose, carried upward)', 'Second pass: debris strikes empty ground where people stood',
                         'NOT destructible: the stone arch, the steps, the reference pillar/fountain, the stone cover'],
     states=[{'id': 'cling.festival', 'scenes': ['3A', '3B'], 'description': 'Inhabited, intact.'},
             {'id': 'cling.attack', 'scenes': ['3C'], 'description': 'Two passes; destruction happens in steps tied to the passes.'},
             {'id': 'cling.aftermath', 'scenes': ['3D'], 'description': 'Torn stall, silent music space, empty steps, arch standing, opening route blocked, dust settling.'}],
     extras=['char.king_of_cling', 'char.guard_captain', 'char.guards', 'char.vendor', 'char.musician', 'char.parent', 'char.child', 'char.watchman', 'char.adult_villager', 'char.festival_crowd'],
     build={'approach': 'Modular village kit (house generator with stone ground floor, timber/plaster upper floor, tiled roof; stall generator; arch; gate; fountain/pillar; banners). Instanced individual tiles only in the impact zone; tile texture elsewhere. One layout file with fixed coordinates shared by every shot.',
            'feasibility': feas('orange', 'high', 'The biggest set: many buildings, crowd, cloth, dust and staged destruction in one place, in 4K.',
                                'Build only what the shot list sees; pre-fracture only the impact zone; keyframe hero debris; let dust and fog hide the rest during 3C.')},
     notes=['Cooking smoke (if any) only before the attack and no open flames in stalls: after the attack it could read as fire, which the screenplay rules out ("There is no fire-breath shot in this staging").'])

# --------------------------------------------------------------------------- props shared across sets (rider equipment)
SHARED_PROPS = [
    prop('prop.charcoal_riding_rig', 'Charcoal\'s saddle and riding rig (Remi catches himself against it in 1F)', notes='Same equipment before and after close-ups (render-handoff checklist).'),
    prop('prop.leaf_saddle_and_restraint', 'Leaf\'s saddle with a restraint that holds Abby during the pass', notes='Restraint tightens against her in 1E.'),
    prop('prop.leaf_equipment_strap', 'The piece of riding equipment Leaf pulls out of reach in 1B'),
    prop('prop.starlight_riding_rig', 'Starlight\'s saddle for Queen Fall', notes='No Tara insignia.'),
    prop('prop.scout_saddle', 'Scout saddle', notes='No legible mark anywhere.')]

# --------------------------------------------------------------------------- FX
FX = []


def fx(**kw):
    order = ['id', 'name', 'scenes', 'beats', 'constraints', 'approach', 'determinism', 'build', 'reuse']
    FX.append({k: kw[k] for k in order if k in kw})


PURE = 'Closed-form: every particle or piece is a pure function of (seed, t).'
WARM = "Stateful simulation run in the runtime's meta.mode 'chunk-warmup' (reset per chunk, warm-up frames)."

fx(id='fx.ocean_surface', name='Open sea', scenes=['PROLOGUE', '1C', '1D', '1E', '1F', '2C'],
   beats=['"a low view just above the water. The pale sky is reflected between moving bands of deep blue"', '"His larger shadow crosses the water"', '"silhouette against bright water"'],
   constraints=['Sun direction and coastline consistent across cuts.'],
   approach='Displaced grid (radial LOD around the camera) with a sum of Gerstner waves as a function of t, procedural detail normals, sky environment reflection (the runtime sky rendered once into a cube map per shot), Fresnel, deep-water tint, crest and shoreline foam from wave height and terrain depth. No planar reflection pass by default (it re-renders the scene).',
   determinism=PURE, build=feas('yellow', 'medium', 'Needed in many shots, horizon to foreground.', 'Gerstner sum plus env reflection; a reduced-resolution planar reflection only for a shot that truly needs a dragon reflected.'),
   reuse='Foam rule (crest height and velocity with decay) from engine/src/87-water.js; three.js Water.js addon is NOT recommended (its reflection pass doubles cost and its normal map is an example texture, not shipped in the npm package).')

fx(id='fx.water_impact_and_trail', name='Scout water impact, broken trail, weak struggle', scenes=['1F'],
   beats=['"a burst of water, a broken trail across the surface, then movement"', '"The sea closes over the last drifting trace of smoke"'],
   constraints=['Seen from above and far away; no graphic detail.'],
   approach='Splash crown (expanding ring mesh with noise alpha), droplet sprites on ballistic paths, ring waves and the skid trail from a local heightfield patch (about 60 x 60 m) layered over the open ocean, foam decal along the trail, small periodic disturbances while the dragon struggles.',
   determinism=WARM + ' Droplets closed-form.', build=feas('yellow', 'low', 'Distant view hides most detail.', 'Analytic ring-wave function if the patch sim is not ported.'),
   reuse='Port the wave-equation core, disturb() and foam rule from engine/src/87-water.js (WaterVolume) as the local patch.')

fx(id='fx.sea_mist_and_fog', name='Sea mist bank and prologue fog with a passing shape', scenes=['PROLOGUE', '1F'],
   beats=['"The mist changes shape. Something passes beyond it"', '"The scout banks around a coastal outcrop or low bank of sea mist."'],
   constraints=['No identifiable dragon in the prologue mist.'],
   approach='Layered fog cards (large quads with animated 3D-noise alpha) plus the runtime height fog; a blurred dark silhouette card moving behind the cards for the prologue shape.',
   determinism=PURE, build=feas('yellow', 'medium', 'Transparent overdraw is the main CPU cost at 4K.', 'Few large cards, not many small ones; tune card count per shot.'))

fx(id='fx.morning_mist', name='Morning mist over Verdor', scenes=['1B', '1C'], beats=['Verdor palette: "Morning mist gives way to clear daylight."'], constraints=[],
   approach='Animate the runtime atmosphere fog density/base per shot; a few low ground cards in foreground.', determinism=PURE, build=feas('green', 'low', 'Uniform changes.', 'Fog uniforms only.'))

fx(id='fx.clouds_near', name='Clouds Starlight emerges from', scenes=['3B', 'PROLOGUE'],
   beats=['"Something white lies against the cloud"', '"A white wing briefly separates from the cloud behind it."', 'island high ground "disappears into morning cloud"'],
   constraints=[], approach='Runtime sky clouds for the far layer; a few billboard cloud volumes (noise-textured, soft-lit) placed so Starlight can pass in front of and behind them.',
   determinism=PURE, build=feas('yellow', 'medium', 'Ray-marched volumetric clouds would be too slow on CPU at 4K (red); billboards are fine.', 'Billboard cloud clusters.'))

fx(id='fx.dust_takeoff_landing', name='Rolling dust cloud (Charcoal takeoff and landing)', scenes=['1C', '2A'],
   beats=['"a rolling cloud of dust crosses the empty launch area"', '"Cut to Abby looking back through the departing dust."', '2A: "Do not bury the injured child in his landing dust."'],
   constraints=['Field cleared; no bystanders in danger; landing dust stays away from Abby and Leaf.'],
   approach='A few dozen large soft billow sprites (procedural noise flipbook generated at setup) driven by a radial outflow function, plus a low expanding ground-hugging dust disc mesh, lit with a simple wrap term toward the sun.',
   determinism=PURE, build=feas('yellow', 'medium', 'Screen-covering transparency multiplies 4K CPU cost.', 'Large textured sprites; budget the layer count per shot.'))

fx(id='fx.turf_dirt_stone_debris', name='Turf, dirt clods and jumping stones', scenes=['1C'],
   beats=['"dirt lifts, turf breaks, loose stones jump"'], constraints=[],
   approach='Instanced turf chunks (pre-fractured grass-topped soil slabs), dirt clumps and low-poly stones on ballistic arcs with tumbling, clamped to the ground on landing.',
   determinism=PURE, build=feas('green', 'low', 'Rigid instanced pieces.', 'Hash-seeded ballistic arcs.'),
   reuse='Voronoi pre-fracture from engine/src/80-fracture.js for the turf slabs.')

fx(id='fx.ground_scar', name='Persistent launch scar', scenes=['1C', '2A', '2C'], beats=['"The ground is visibly devastated beneath and behind him."'],
   constraints=['Continuity: proposed to stay visible in 2A and 2C.'], approach='Terrain material mask (exposed dirt, torn edges) plus grass instances removed or flattened inside the mask; settled debris instances.',
   determinism=PURE, build=feas('green', 'low', 'A texture mask.', 'Mask texture painted procedurally at setup.'))

fx(id='fx.grass_downwash', name='Grass blowdown from wingbeats and breath', scenes=['1B', '1C', '2A'],
   beats=['"The first beat shakes loose grass."', '"His breathing moves the air around Remi."'], constraints=[],
   approach='Extra uniforms in the grass vertex shader: wing-beat source positions, strength and radius, bending blades radially outward; a few loose grass blade particles.',
   determinism=PURE, build=feas('green', 'low', 'Shader math.', 'Add to the ported grass shader.'), reuse='engine/src/92-grass.js + GRASS block in 50-shaders.js.')

fx(id='fx.fire_breath', name='Charcoal\'s brief directed fire breath', scenes=['1F'],
   beats=['"Charcoal releases a brief directed breath of flame."', '"The scout tries to slip beneath it. Flame reaches the rider and scorches the riding position."'],
   constraints=['Only on the command "Fire" (never on "Attack").', 'Brief; not endlessly sustained; not an unexplained explosive power.', 'Charcoal only: no fire anywhere in Cling.'],
   approach='A tapered flame cone mesh with scrolling noise in its shader plus a short burst of additive flame sprites along the breath line, colour ramp from white-yellow to deep orange to smoke, a short orange point-light flash on Charcoal\'s head and the scout; roughly 1-1.5 s.',
   determinism=PURE, build=feas('yellow', 'medium', 'Additive overdraw in part of the frame; must look like breath, not an explosion.', 'Cone mesh does most of the work; sprites at the edges.'))

fx(id='fx.scorched_cloth', name='Burning flash and scorched cloth on the scout rider', scenes=['1F'],
   beats=['"One short flash of burning outer cloth, a flinch, a cry lost in the wind. Cut away before lingering on the rider\'s skin."'],
   constraints=['Rider alive and moving; no burning flesh shown.'],
   approach='About half a second of small flame sprites on the outer layer, then a char mask blended into the cloth material and a smoke trail.',
   determinism=PURE, build=feas('green', 'low', 'Small, brief, distant.', 'Material mask plus sprites.'))

fx(id='fx.smoke_trace', name='Smoke trace from the scorched riding position', scenes=['1F'], beats=['"The sea closes over the last drifting trace of smoke."'], constraints=[],
   approach='Ribbon mesh along the recent path with noise alpha, widening and fading; a few soft sprites at the source.', determinism=PURE,
   build=feas('green', 'low', 'Thin ribbon.', 'Ribbon trail.'))

fx(id='fx.wake_and_wind', name='Violent wake of the scout pass; Starlight\'s wake; flight wind', scenes=['1C', '1D', '1E', '3C'],
   beats=['"Show the close passage, the violent wake, and her involuntary movement in a clear cause-and-effect sequence."', '"Her wake pulls the remaining banner loose from the square."', '"Put wind between airborne speakers"'],
   constraints=['The scout never strikes Abby with anything; the wake causes the fracture.'],
   approach='Mostly animation: Leaf\'s roll, Abby thrown against the restraint, clothes and hair whip, equipment jolts; optionally a faint condensation streak along the scout\'s path. In Cling: banners snap and lift, dust shoves outward.',
   determinism=PURE, build=feas('green', 'low', 'Secondary motion.', 'A shared wind field function (position, t) that cloth, hair and grass all read.'))

fx(id='fx.scout_pass_motion', name='Motion blur / smear for the scout\'s pass', scenes=['1E'],
   beats=['"A narrow shape appears at the far edge of the frame. It is gone before its identity resolves."'], constraints=[],
   approach='The runtime post chain has no motion blur. Cheapest: an animation smear (the scout stretched along its velocity for 1-2 frames). Better, if the render-pipeline owner adds it: sub-frame accumulation for this one shot only (N times the cost for a second or two).',
   determinism=PURE, build=feas('yellow', 'low', 'Needs either an animation trick or a runtime feature.', 'Smear geometry.'))

fx(id='fx.wing_separation', name='Scout\'s LEFT wing tearing loose', scenes=['1F'],
   beats=['"Show the wing separating in silhouette against bright water"', '"The loss of the scout\'s wing must be unambiguous without a close-up of the wound."'],
   constraints=['Always the LEFT wing (the creature\'s own left; +x when it faces +z).', 'No wound close-up; brief blood at most.'],
   approach='At the tear time the LEFT wing group is reparented to world space and follows a keyframed or ballistic tumble with membrane flutter; a few small dark droplets; the body switches to the torn-shoulder variant.',
   determinism=PURE, build=feas('yellow', 'low', 'Rigid detachment is simple; the readable silhouette is staging.', 'Backlit silhouette against sun glint on the water.'))

fx(id='fx.brief_blood', name='Brief blood', scenes=['1F', '3C'], beats=['Violence: "brief blood"'], constraints=['Never lingering; no exposed anatomy.'],
   approach='A handful of tiny dark droplets or a small decal.', determinism=PURE, build=feas('green', 'low', 'Tiny.', 'Decal or droplets.'))

fx(id='fx.timber_tile_debris', name='Timber and tile debris from Starlight\'s impact', scenes=['3C'],
   beats=['"Timber breaks; tiles scatter; decorations vanish in dust."', '"The force sweeps the abandoned stall into the square."', '"debris striking empty ground where people stood moments earlier"'],
   constraints=['The fallen beam ends across part of the arch route at a fixed pose; the arch stays standing.'],
   approach='Instanced roof tiles peeling off along the sweep path; timber pre-split into long splinters; ballistic arcs with tumble; hero pieces (fallen beam, swept stall) keyframed to exact rest poses.',
   determinism=PURE, build=feas('yellow', 'medium', 'Many pieces and art-directed landings.', 'Simulate nothing that must land in a specific place; keyframe those.'),
   reuse='engine/src/80-fracture.js Fracture.shatterBox with the "splinter" pattern for timber and "slab" for masonry chips.')

fx(id='fx.impact_dust_village', name='Village impact dust', scenes=['3C'],
   beats=['"For several seconds the image is dust, cloth, and moving feet."'], constraints=['Keep one continuous reference point (pillar or fountain edge) readable.'],
   approach='A short spike in the runtime fog density and tint around the square plus a few huge dust sprites; reference pillar placed so it stays readable.',
   determinism=PURE, build=feas('yellow', 'high', 'Screen-filling dust is the most expensive transparency in the episode at 4K on CPU.', 'Let the fog uniforms do most of the work; few sprites.'))

fx(id='fx.aftermath_dust_motes', name='Falling dust and settling debris', scenes=['3D'],
   beats=['"broken wood settling"', '"the parent gently turns their attention away from falling dust"'], constraints=['The festival tune does not resume (sound).'],
   approach='Sparse drifting motes and a few slow falling particles in light shafts.', determinism=PURE, build=feas('green', 'low', 'Sparse.', 'Small sprite count.'))

fx(id='fx.cloth_banners', name='Banner and awning flutter', scenes=['3A', '3B', '3C', '3D'],
   beats=['"Fabric banners shift above the street."', '"A banner snaps sharply."', '"A faint gust moves one surviving strip of festival cloth."'], constraints=['No heraldry on banners.'],
   approach='Closed-form flutter in the vertex shader: travelling waves along the banner from the pinned edge, amplitude from the shared wind field, sharp snap when the wind field spikes.',
   determinism=PURE, build=feas('green', 'low', 'Shader math, no simulation.', 'Vertex-shader flutter.'))

fx(id='fx.cloth_tear_and_fly', name='Cloth tearing free (stall cloth over the vendor\'s face; last banner carried upward)', scenes=['3C'],
   beats=['"The vendor\'s stall cloth tears free and wraps across his view. He fights it aside."', '"It travels upward, briefly visible against her vast underside, then disappears into dust."'],
   constraints=[],
   approach='Hero cloth beats: keyframed cloth shapes (blend between flat, billowing and wrapped poses) plus flutter noise. A real Verlet cloth simulation is possible only in chunk-warmup mode and only for these one or two cloths.',
   determinism=PURE + ' (keyframed). Simulation variant: ' + WARM,
   build=feas('orange', 'low', 'Cloth wrapping a moving person is the hardest cloth case.', 'Keyframed shapes in a quick medium shot; the banner is small against Starlight, so a scripted path plus flutter is enough.'))

fx(id='fx.loose_metal_fitting', name='Loose metal fitting striking stone', scenes=['3D'], beats=['"one loose metal fitting striking stone in the wind"'], constraints=[],
   approach='A small hanging fitting on a closed-form pendulum with contact taps (sound sync).', determinism=PURE, build=feas('green', 'low', 'One prop.', 'Pendulum.'))

fx(id='fx.egg_crack_and_shell', name='Egg crack propagation and shell fragments', scenes=['PROLOGUE', '1A'],
   beats=['"A fine crack extends from an existing fracture. It stops."', '"pressure beneath the shell; a fragment lifting; a small gold shape pressing into the opening; a pause to breathe"', '"Do not repeat the same cracking shot."'],
   constraints=['No glow; no magical apparatus.'],
   approach='A crack mask texture grown along a procedural path (canvas drawing per t), slight shell displacement for pressure, pre-fractured shell pieces (Voronoi cells on the egg surface given thickness) that lift and fall on keyframes; inner membrane and a little fluid.',
   determinism=PURE, build=feas('yellow', 'low', 'Close-up hero prop.', 'Shell pieces from a surface Voronoi; keyframed lifts.'),
   reuse='Idea from engine/src/80-fracture.js; needs a curved-shell variant.')

fx(id='fx.wet_hatchling', name='Wet hatchling sheen', scenes=['1A'], beats=['"It is wet, unsteady, and exhausted. Gold catches the warm light along its scales."'],
   constraints=['Body does not emit light.'], approach='Clearcoat with low roughness, drip normal detail, a few instanced droplets, slightly darker damp bedding where it lies.',
   determinism=PURE, build=feas('green', 'low', 'Material work.', 'MeshPhysicalMaterial clearcoat.'))

fx(id='fx.lamp_flicker_and_daylight_shaft', name='Lamp flicker and high daylight shaft', scenes=['1A'], beats=['"Lamps provide subdued light; daylight enters high above."'], constraints=[],
   approach='Hash-based flicker on unshadowed point lights with small flame sprites; an additive noise-textured light-shaft card from the high opening.',
   determinism=PURE, build=feas('green', 'low', 'Cheap.', 'One shadowed light only.'))

fx(id='fx.dragon_shadows', name='Huge dragon shadows crossing field, water and roofs', scenes=['PROLOGUE', '1C', '1F', '2A', '3B', '3C'],
   beats=['"a dragon\'s immense shadow traveling across grass"', '"The larger dragon\'s shadow briefly swallows the smaller one."', '"Charcoal\'s shadow crosses the field."', '"The shadow reaches the first roofs."'],
   constraints=[], approach='Directional-light shadow map with the shadow camera fitted per shot; for very large or soft shadows, a projected silhouette texture (cheaper and controllable).',
   determinism=PURE, build=feas('green', 'medium', 'Shadow map coverage vs. resolution.', 'Fit the shadow frustum per shot; projected silhouette for the widest ones.'))

fx(id='fx.dust_marked_clothing', name='Dust-marked clothing state', scenes=['3C', '3D'], beats=['"Dust marks his clothing."'], constraints=['No gag props.'],
   approach='A 0..1 dust uniform blending a procedural dust mask into costume and hair materials; set per character state.', determinism=PURE,
   build=feas('green', 'low', 'Material blend.', 'One shared shader chunk.'))

# --------------------------------------------------------------------------- shared systems
SYSTEMS = [
    {'id': 'sys.legacy_shim', 'purpose': 'ES-module copies of the old engine math and Geometry classes plus a toBufferGeometry() adapter, so old builders port almost verbatim.', 'source': 'port (engine/src/10-math.js, 30-geometry.js, closestPointOnSegment from 71-physics-collide.js)', 'used_by': ['sys.human_body', 'sys.face_rig', 'sys.dragon_generator', 'sys.grass', 'sys.fracture'], 'effort_days': '1', 'feasibility': 'green'},
    {'id': 'sys.human_body', 'purpose': 'Lofted anatomical body, skeleton, auto skin weights; body presets (adult variants, child).', 'source': 'port (94-human.js, 93-character.js, 90-animation.js HUMANOID_BONES) + new finger bones, body presets', 'used_by': ['all characters'], 'effort_days': '3-5', 'feasibility': 'yellow'},
    {'id': 'sys.face_rig', 'purpose': 'Sculpted head with morph-target expressions and visemes; rotating eyes; mouth interior; brows; identity sliders; deterministic blink and viseme timeline.', 'source': 'port (91-face.js) + new', 'used_by': ['hero and speaking characters'], 'effort_days': '10-15', 'feasibility': 'orange'},
    {'id': 'sys.lip_sync_timing', 'purpose': 'Mouth-shape timings from the recorded or synthesized dialogue audio.', 'source': 'Rhubarb Lip Sync (MIT, offline command-line tool) or a text-timed fallback using dialogue.json est_seconds', 'used_by': ['sys.face_rig'], 'effort_days': '1-2', 'feasibility': 'green'},
    {'id': 'sys.costume_shells', 'purpose': 'Clothing as lofted shells over the body (tunics, coats, gown, sling, hoods), skinned by copying nearest-body-vertex weights; flutter from the wind field.', 'source': 'new, using loftRings from 94-human.js', 'used_by': ['all characters'], 'effort_days': '5-8', 'feasibility': 'yellow'},
    {'id': 'sys.hair_cards', 'purpose': 'Alpha-tested hair cards with strand normal detail and wind response.', 'source': 'new', 'used_by': ['hero and speaking characters'], 'effort_days': '3-5', 'feasibility': 'orange'},
    {'id': 'sys.crowd', 'purpose': 'Variants, route splines and loops for extras; LOD.', 'source': 'new (clips from 90-animation.js makeHumanoidClips as a start)', 'used_by': ['char.festival_crowd', 'char.harbor_crew'], 'effort_days': '4-6', 'feasibility': 'yellow'},
    {'id': 'sys.ik', 'purpose': 'Two-bone analytic IK for feet, hands, contact poses.', 'source': 'port (90-animation.js Skeleton.solveIK, aimBoneAt)', 'used_by': ['humans', 'dragon legs'], 'effort_days': '0.5', 'feasibility': 'green'},
    {'id': 'sys.timeline', 'purpose': 'Per-shot keyframe curves evaluated as pure functions of t (bones, cameras, FX triggers, character states).', 'source': 'new (three.js AnimationClip + AnimationMixer.setTime(t) or own sampler)', 'used_by': ['everything animated'], 'effort_days': '2-3', 'feasibility': 'green'},
    {'id': 'sys.dragon_generator', 'purpose': 'One parametric generator with Bashion, Nightwing, Slitherwing and hatchling presets: lofted body, spline spine, head/jaw, eyes, legs, wings with membranes, detachable wing, sockets.', 'source': 'new, using bodyLoft/angBump/auto-skin from 96-animals.js and the spline spine and membrane approach in scenes/lib/dragon.js', 'used_by': ['all dragons'], 'effort_days': '10-15', 'feasibility': 'orange'},
    {'id': 'sys.scale_materials', 'purpose': 'Procedural scale, facet and membrane textures (albedo, normal, roughness) generated at setup.', 'source': 'new, in the style of runtime/lib/textures.js', 'used_by': ['all dragons'], 'effort_days': '3-4', 'feasibility': 'yellow'},
    {'id': 'sys.terrain', 'purpose': 'Heightfield terrain for Verdor, prologue landscapes and Cling surroundings; rock meshes for cliffs and outcrops.', 'source': 'existing approach in scenes/test-kingdom.js + runtime/lib/noise.js', 'used_by': ['exterior sets'], 'effort_days': '2-3', 'feasibility': 'green'},
    {'id': 'sys.grass', 'purpose': 'Instanced clumped grass with wind, downwash and scar mask.', 'source': 'port (92-grass.js + GRASS shader block)', 'used_by': ['set.verdor_riding_grounds', 'set.prologue'], 'effort_days': '1.5-2', 'feasibility': 'green'},
    {'id': 'sys.trees', 'purpose': 'Procedural conifer and broadleaf trees with far impostors.', 'source': 'new', 'used_by': ['set.prologue', 'Cling surroundings', 'Verdor island'], 'effort_days': '3-4', 'feasibility': 'yellow'},
    {'id': 'sys.ocean', 'purpose': 'Closed-form ocean surface and local impact patch.', 'source': 'new + port of the 87-water.js wave core', 'used_by': ['fx.ocean_surface', 'fx.water_impact_and_trail'], 'effort_days': '3-5', 'feasibility': 'yellow'},
    {'id': 'sys.village_kit', 'purpose': 'Houses, roofs, stalls, arch, gate, fountain/pillar, paving, banners; Verdor interiors.', 'source': 'new (castle.js and textures.js as references)', 'used_by': ['set.cling_village_square', 'Verdor interiors', 'set.prologue'], 'effort_days': '6-10', 'feasibility': 'yellow'},
    {'id': 'sys.ship_generator', 'purpose': 'Lofted hull, masts, yards, furled sails, rigging lines.', 'source': 'new (loftRings idea from 94-human.js)', 'used_by': ['prop.santa_maria', 'prop.prologue_vessel'], 'effort_days': '3-5', 'feasibility': 'yellow'},
    {'id': 'sys.fracture', 'purpose': 'Pre-fractured pieces for tiles, timber, stall, turf and egg shell.', 'source': 'port (80-fracture.js) or three.js ConvexObjectBreaker/ConvexGeometry addons (MIT)', 'used_by': ['fx.timber_tile_debris', 'fx.turf_dirt_stone_debris', 'fx.egg_crack_and_shell'], 'effort_days': '1-1.5', 'feasibility': 'green'},
    {'id': 'sys.soft_particles', 'purpose': 'Closed-form sprite systems (dust, smoke, fire, droplets) with procedural flipbooks.', 'source': 'new', 'used_by': ['most fx'], 'effort_days': '3-4', 'feasibility': 'yellow'},
    {'id': 'sys.wind_field', 'purpose': 'One wind(position, t) function shared by grass, cloth, hair, banners and dust.', 'source': 'new', 'used_by': ['fx.wake_and_wind', 'fx.cloth_banners', 'sys.grass', 'sys.hair_cards'], 'effort_days': '1', 'feasibility': 'green'},
    {'id': 'sys.fog_cards', 'purpose': 'Mist and cloud billboards with animated noise.', 'source': 'new (uses runtime/lib/atmosphere.js uniforms)', 'used_by': ['fx.sea_mist_and_fog', 'fx.clouds_near'], 'effort_days': '1-2', 'feasibility': 'green'},
    {'id': 'sys.geography', 'purpose': 'One data file of fixed positions per location (Verdor coast, harbor, grounds, palace, outer rocks, fall point; Cling square, arch, alley, gate, steps, pillar/fountain, approach side). Not a political map.', 'source': 'new data', 'used_by': ['all exterior sets', 'camera layout'], 'effort_days': '1', 'feasibility': 'green'},
]




# --------------------------------------------------------------------------- cross-reference with shotlist.json (snapshot)
import os as _os
SHOTLIST = EP + '/shotlist.json'
XREF_NOTE = None
if _os.path.exists(SHOTLIST):
    _raw = open(SHOTLIST, 'rb').read()
    _sl = json.loads(_raw)
    _sl_sha = hashlib.sha256(_raw).hexdigest()
    ALIASES = {
        'char.remi': ['remi'], 'char.abby': ['abby'], 'char.alexandria': ['alexandria'], 'char.queen_fall': ['queen fall'],
        'char.king_of_cling': ['king of cling'], 'char.attendant': ['attendant', 'attendant 2'],
        'char.ground_keepers': ['ground keeper', 'ground keepers', 'ground keeper 2', 'keeper', 'keepers'], 'char.healer': ['healer'],
        'char.royal_messenger': ['royal messenger'], 'char.scout_rider': ['scout rider'], 'char.vendor': ['vendor'],
        'char.musician': ['musician', 'musicians', 'second musician'], 'char.parent': ['parent'], 'char.child': ['child'],
        'char.guard_captain': ['guard captain'], 'char.guards': ['guard', 'guards'], 'char.watchman': ['watchman'],
        'char.adult_villager': ['adult villager'], 'char.sailor': ['sailor'], 'char.harbor_crew': ['harbor crew', 'lookout'],
        'char.festival_crowd': ['crowd', 'children', 'adults working', 'people', 'fallen person', 'hands exchanging food'],
        'dragon.charcoal': ['charcoal', 'charcoal shadow'], 'dragon.leaf': ['leaf'], 'dragon.starlight': ['starlight', 'starlight underside', 'white shape'],
        'dragon.gold_hatchling': ['hatchling', 'egg', 'nest+egg'], 'dragon.slitherwing_scout': ['scout', 'narrow shape'],
        'dragon.prologue_mist_shape': ['shadow (unidentified)', 'dragon shadow (unidentified)', 'wing-shaped cloud']}
    _lookup = {}
    for _id, _names in ALIASES.items():
        for _n in _names:
            _lookup[_n] = _id
    def _ids_for(name):
        n = name.strip().lower()
        if n in _lookup:
            return {_lookup[n]}
        out = set()
        for part in n.split('+'):
            base = part.split(' (')[0].strip()
            if base in _lookup:
                out.add(_lookup[base])
        return out
    _stats = collections.defaultdict(lambda: {'shots': 0, 'face_closeup_shots': 0, 'lipsync_shots': 0, 'scenes': set()})
    for _sh in _sl['shots']:
        _ids = set()
        for _x in _sh['in_frame']:
            _ids |= _ids_for(_x['name'])
        for _id in _ids:
            st = _stats[_id]
            st['shots'] += 1
            st['scenes'].add(_sh['scene'])
            if 'FACE_CLOSEUP' in _sh['difficulty_tags']:
                st['face_closeup_shots'] += 1
            if 'LIPSYNC' in _sh['difficulty_tags']:
                st['lipsync_shots'] += 1
    for _x in CHARACTERS + DRAGONS:
        st = _stats.get(_x['id'])
        if st:
            _x['shotlist_cross_reference'] = {'shots_in_frame': st['shots'], 'face_closeup_shots': st['face_closeup_shots'],
                                              'lipsync_tagged_shots': st['lipsync_shots'], 'scenes': [x for x in SCENE_ORDER + ['TITLE', 'END'] if x in st['scenes']]}
    SET_MAP = {'set.prologue': ['SEA_COAST_DAWN', 'PROLOGUE_VISTAS'], 'set.verdor_birthing_chamber': ['BIRTHING_CHAMBER'],
               'set.verdor_riding_grounds': ['VERDOR_GROUNDS'], 'set.verdor_coast_sky': ['SKY_OFF_VERDOR', 'COASTAL_SKY_WATER'],
               'set.verdor_treatment_room': ['TREATMENT_ROOM'], 'set.verdor_harbor': ['VERDOR_HARBOR'],
               'set.cling_village_square': ['CLING_SQUARE', 'CLING_SKY']}
    _slsets = {x['id']: x for x in _sl['sets']}
    for _x in SETS:
        ids = [i for i in SET_MAP[_x['id']] if i in _slsets]
        _x['shotlist_cross_reference'] = {'shotlist_set_ids': ids, 'shots': sum(_slsets[i]['shots'] for i in ids),
                                          'expected_seconds': round(sum(_slsets[i]['expected_s'] for i in ids), 1)}
    _sets_x = next(x for x in SETS if x['id'] == 'set.prologue')
    _sets_x['shotlist_cross_reference']['note'] = 'The shot list stages the present-day shadow-over-grass shot on VERDOR_GROUNDS and the title egg on BIRTHING_CHAMBER.'
    XREF_NOTE = {'file': 'episodes/s01e01/shotlist.json', 'sha256': _sl_sha,
                 'what': 'Snapshot counts from the sibling shot list (shots where the asset is named in frame, shots tagged FACE_CLOSEUP or LIPSYNC, per-set shot count and expected seconds). Names were matched by base name; if the shot list changes, these numbers may drift (compare the sha256).',
                 'shotlist_expected_minutes': _sl['totals']['expected_min'],
                 'note': 'The shot list estimates about %s minutes of story at natural pace, versus the 50-minute editorial plan; prefer its per-set seconds when prioritising.' % _sl['totals']['expected_min']}

# --------------------------------------------------------------------------- normalize state scene refs
import re as _re
def _split_states(states):
    for st in states:
        if 'scenes' not in st:
            continue
        ids, notes = [], {}
        for ref in st['scenes']:
            m = _re.match(r'^(PROLOGUE|[123][A-F])(?: \((.+)\))?$', ref)
            assert m, ref
            ids.append(m.group(1))
            if m.group(2):
                notes[m.group(1)] = m.group(2)
        st['scenes'] = ids
        if notes:
            st['scene_notes'] = notes

for coll in (CHARACTERS, DRAGONS, SETS):
    for x in coll:
        _split_states(x.get('states', []))

def _check_scene_ids():
    def chk(lst, where):
        for sid in lst:
            assert sid in SCENE_ORDER, (where, sid)
    for x in CHARACTERS + DRAGONS + SETS:
        chk(x['scenes'], x['id'])
        for a in x.get('appears_in', []):
            chk([a['scene']], x['id'])
        for st in x.get('states', []):
            chk(st.get('scenes', []), x['id'])
        for an in x.get('animations', []):
            if isinstance(an, dict):
                chk(an['scenes'], x['id'])
    for f in FX:
        chk(f['scenes'], f['id'])
_check_scene_ids()

# --------------------------------------------------------------------------- normalize face fields
for c in CHARACTERS:
    f = c['face']
    cu = f['close_up']
    if isinstance(cu, str):
        f['close_up_note'] = cu
        f['close_up'] = ('possible' if cu.startswith('possible') else 'unspecified' if cu.startswith('not specified')
                         else 'hand_insert_only' if cu.startswith('hand insert') else cu)
    if ';' in f['tier']:
        f['tier_note'] = f['tier']
        f['tier'] = f['tier'].split(' ')[0]
    assert f['tier'] in ('hero', 'speaking', 'background', 'hidden'), f['tier']
    assert f['close_up'] in (True, False, 'possible', 'unspecified', 'hand_insert_only'), f['close_up']

def _flag(items, kind):
    out = []
    for x in items:
        r = x['build']['rating'] if 'rating' in x.get('build', {}) else x['build']['feasibility']['rating']
        if r in ('orange', 'red'):
            out.append({'id': x['id'], 'kind': kind, 'rating': r})
    return out

SUMMARY = {
    'counts': {'characters_and_groups': len(CHARACTERS), 'dragons': len(DRAGONS), 'sets': len(SETS), 'fx': len(FX), 'shared_systems': len(SYSTEMS)},
    'hero_faces': [c['id'] for c in CHARACTERS if c['face']['tier'] == 'hero'],
    'speaking_faces': [c['id'] for c in CHARACTERS if c['face']['tier'] == 'speaking'],
    'lip_sync_roles': [c['id'] for c in CHARACTERS if c['face']['lip_sync']],
    'no_lip_sync_roles': [c['id'] for c in CHARACTERS if not c['face']['lip_sync']],
    'hardest_items': _flag(CHARACTERS, 'character') + _flag(DRAGONS, 'dragon') + _flag(SETS, 'set') + _flag(FX, 'fx')
                     + [{'id': s['id'], 'kind': 'system', 'rating': s['feasibility']} for s in SYSTEMS if s['feasibility'] in ('orange', 'red')]
                     + [{'id': 'prop.santa_maria', 'kind': 'prop', 'rating': 'orange'}],
    'supporting_roles_with_planned_closeups_in_shotlist': [c['id'] for c in CHARACTERS if c['face']['tier'] != 'hero' and c.get('shotlist_cross_reference', {}).get('face_closeup_shots', 0) > 0],
    'red_items': 'None planned: everything red-rated (ray-marched clouds, real-time reflections everywhere, full cloth simulation on every garment) is replaced by a cheaper approach in this plan.'}

# --------------------------------------------------------------------------- legacy engine port
PROBE = {'head_verts': 6493, 'head_tris': 11892, 'body_verts': 1528, 'body_tris': 2656, 'blendshapes': 13,
         'blendshape_build_ms': 149, 'humanoid_bones': 19, 'quad_bones': 23, 'deer_verts': 1765, 'deer_tris': 3258}

LEGACY = {
    'summary': 'Yes, a good part is worth porting. The old engine\'s geometry builders (sculpted head with 13 expression and mouth shapes, lofted body, auto-skinning, clumped grass, animal body lofts, Voronoi fracture) are pure CPU code that can be moved to three.js for roughly 10-15 developer-days, saving an estimated 3-6 weeks compared with writing them again. Its runtime parts (game physics, dt-based animators, the water tank simulation) do not fit the new offline, pure-function-of-time renderer and should be rewritten or skipped. Rough planning estimates, not measured.',
    'engine_facts': {
        'location': 'engine/src (bundled to site/engine/legend-engine.js by engine/build.js)',
        'architecture': 'Its own raw WebGL2 engine ("Legend Engine"), not three.js. Sources are plain scripts with no import/export, concatenated into one IIFE that shares a lexical scope, so every file silently depends on globals defined in other files.',
        'shared_dependencies': ['10-math.js: Vec3, Quat, Mat4, Rng (seeded xorshift32), Noise (seeded), clamp/lerp/smoothstep, PI/TAU/DEG',
                                '30-geometry.js: Geometry (vert/tri/quad/finalize/computeWeldGroups), weldNormals, Shapes (sphere, grassBlade, ...)',
                                '71-physics-collide.js: closestPointOnSegment (a hidden dependency of the auto-skinning in 93-character.js and 96-animals.js)',
                                '40-material.js: TextureLib procedural textures (fur etc.)', '50-shaders.js: GRASS and FUR_SHELL vertex-shader blocks'],
        'ownership_license': 'Daxtyn\'s own code in this repository (no LICENSE file). Reusing it in his own project needs no third-party permission.',
        'determinism': 'Geometry builders are deterministic (seeded Rng and Noise). Face.update, Animator.update, WaterVolume.update and Animal.update integrate dt and keep state, and 96-animals.js uses Math.random for a default sex, so those parts do not meet the new runtime\'s pure-function-of-t rule as written.',
        'measured_in_scratch': dict(PROBE, note='Measured by running copies of the builders under Node in the scratchpad (no changes to engine/src).')},
    'files': [
        {'file': 'engine/src/90-animation.js', 'verdict': 'port partially',
         'key_functions': ['Bone', 'Skeleton (computeBindPose, update, solveIK)', 'aimBoneAt', 'AnimationClip.sample', 'Animator (play/update cross-fade)', 'HUMANOID_BONES (19 bones)', 'makeHumanoidSkeleton', 'buildClip', 'makeHumanoidClips (idle, walk, run, jump, wave)'],
         'what_it_gives': 'A working humanoid skeleton definition, readable keyframe specs and a correct two-bone analytic IK.',
         'how_to_port': 'HUMANOID_BONES to a THREE.Bone hierarchy and THREE.Skeleton; solveIK/aimBoneAt rewritten with THREE.Vector3/Quaternion (about 150 lines); buildClip specs to THREE.AnimationClip with QuaternionKeyframeTracks evaluated through AnimationMixer.setTime(t). Skip Skeleton.uploadTexture (three.js skins on its own) and Animator (dt-stateful).',
         'port_cost_days': '1-1.5',
         'gaps_for_film': ['no finger, toe, jaw, eye or twist bones; only three spine bones', 'stock clips are game locomotion: fine for the background crowd, not for acting'],
         'used_for': ['sys.human_body', 'sys.ik', 'sys.crowd']},
        {'file': 'engine/src/91-face.js', 'verdict': 'port (highest value)',
         'key_functions': ['makeHeadGeometry (skull loft with about 25 named anatomical features, eyeball and cornea spheres, ears via buildEars, nose/lips/lids via buildNose/buildLips/buildEyelids, HEAD_SQUEEZE_X)', 'FaceRegions', 'buildBlendshape',
                           'EXPRESSION_BUILDERS: smile, frown, angry, surprised, sad, blink, jawOpen, visemes vAA vEE vOH vFV vMB vL', 'LETTER_VISEME', 'Face (setEmotion, say, lookAt, update, _applyShapes, _recomputeNormals)'],
         'what_it_gives': 'A carefully sculpted, anatomically proportioned head and a full procedural expression and viseme set, the hardest part of a procedural human to get right.',
         'how_to_port': 'Geometry to BufferGeometry; the 13 delta arrays to geometry.morphAttributes.position (plus normal deltas) driven by mesh.morphTargetInfluences; replace Face.update with pure functions of t: blink times from a hash of the shot seed, viseme weights from a per-line timeline with attack/release curves.',
         'port_cost_days': '2-3 (port) + 8-12 (film additions)',
         'gaps_for_film': ['Gaze is stored and smoothed but never applied: the eyeballs are merged into the head mesh, so the eyes cannot look anywhere. Film needs separate rotating eyes (the iris + pupil recipe in 96-animals.js is a start).',
                           'No mouth interior (no teeth, tongue or mouth bag): opening the jaw shows skin, not a dark mouth.',
                           'No eyebrows, lashes or hair.',
                           'One generic face: the seed only changes a 0.0035-unit surface noise. Identity sliders are needed for 5 hero and about 12 speaking faces.',
                           'Lip-sync from letters at 13 letters per second ignores real audio timing; drive visemes from phoneme timing instead (e.g. Rhubarb Lip Sync, MIT).'],
         'used_for': ['sys.face_rig']},
        {'file': 'engine/src/92-grass.js', 'verdict': 'port',
         'key_functions': ['GRASS_PRESETS (standard, dead, mud)', 'GRASS_VARIANTS', 'resolveGrassSpec', 'clumpHash', 'Grass.scatter (clump-centre rejection sampling, bald patches, trampled blades, per-blade tint and wind phase)', 'GRASS block in 50-shaders.js (height-squared stiffness, two travelling waves plus gust, tip pulled down)', 'Shapes.grassBlade in 30-geometry.js'],
         'what_it_gives': 'A natural-looking clumped meadow with wind in one instanced draw.',
         'how_to_port': 'scatter() into InstancedMesh matrices + instanceColor + a per-instance phase attribute, split into tiles with runtime/lib/instancing.js createTiledInstances; the wind bend through material.onBeforeCompile with uTime = t (closed form, deterministic); add downwash uniforms and a scar mask.',
         'port_cost_days': '1.5-2',
         'gaps_for_film': ['no dragon downwash or destroyed-turf mask (new)', 'blade budget must be limited by distance for 4K on CPU'],
         'used_for': ['sys.grass'],
         'note': 'The same file also contains Input (not needed) and Audio (procedural Web Audio thuds, shatters, splashes): possibly useful for temporary animatic sounds, not for picture.'},
        {'file': 'engine/src/93-character.js', 'verdict': 'port makeHumanoidMesh and appendLimb; skip CharacterController',
         'key_functions': ['LIMB_SEGMENTS', 'appendLimb', 'makeHumanoidMesh (skin weights by inverse-quartic distance to bone segments, top four influences)', 'CharacterController (game physics capsule)'],
         'what_it_gives': 'Automatic skin weights for lofted meshes without an authoring tool.',
         'how_to_port': 'Emit skinIndex/skinWeight attributes and bind to THREE.SkinnedMesh; copy closestPointOnSegment from 71-physics-collide.js.',
         'port_cost_days': '0.5-1',
         'gaps_for_film': ['Engine.character passes { thickness: opts.build } but makeHumanBodyGeometry ignores it, so only one body size exists.'],
         'used_for': ['sys.human_body', 'sys.costume_shells', 'sys.dragon_generator']},
        {'file': 'engine/src/94-human.js', 'verdict': 'port',
         'key_functions': ['HUMAN landmarks (1.75 m adult, about 7.5 heads)', 'ringVertex (superellipse)', 'loftRings', 'limbRings', 'buildTorso', 'buildNeck', 'buildArm', 'buildHand (palm + thumb)', 'buildLeg', 'buildShoe', 'makeHumanBodyGeometry', 'smoothNormals', 'buildEars', 'loftLoop', 'mergeShape', 'buildNose', 'buildLips', 'buildEyelids', 'EYE metrics'],
         'what_it_gives': 'An anatomically proportioned body and the loftRings tool, which is also the right tool for costumes, the sling, ship hulls and dragon limbs.',
         'how_to_port': 'Pure geometry; needs only the Vec3/Geometry shim.',
         'port_cost_days': '1-2',
         'gaps_for_film': ['one adult body only: no child proportions or body variants (parameterize the landmark and ring tables)',
                           'mitten hands (palm + thumb, no fingers) while the screenplay has hand close-ups (prologue rope, Abby\'s right hand holding fast, hand-holding in 2B)',
                           'no clothing (build costume shells with loftRings)', 'low density (1,528 vertices): raise segments for close shots'],
         'used_for': ['sys.human_body', 'sys.costume_shells', 'sys.ship_generator']},
        {'file': 'engine/src/96-animals.js', 'verdict': 'port the techniques, not the species',
         'key_functions': ['ANIMAL_SPECIES (deer, rabbit, bear, lion: none appear in this episode)', 'makeQuadSkeleton (23 bones)', 'bodyLoft (one continuous rump-to-nose loft)', 'angBump (muscle shaping on the ring angle)', 'makeQuadGeometry (legs, ears and tail rooted inside the body, auto-skin)', 'antlerMesh', 'Animal (graze/wander/alert/flee brain)', 'Animal._drive (procedural gait from phase)', 'iris + pupil eye actors on the head bone', 'fur shells (95-engine.js, FUR_SHELL shader, TextureLib.fur)'],
         'what_it_gives': 'The best starting technique for dragon bodies: one seamless sculpted loft with muscle shaping and auto-skinning, plus a wet-looking eye recipe.',
         'how_to_port': 'bodyLoft + angBump + auto-skin into sys.dragon_generator (about 1 day); gait driver idea for Leaf\'s steps (pure function of phase); eye recipe for dragons and humans. Skip the AI brain and fur.',
         'port_cost_days': '1-1.5',
         'gaps_for_film': ['no wings', 'two-bone neck and two-bone tail (dragons need about 10 neck and 15 tail segments)', 'fur shells not needed for scaled dragons'],
         'used_for': ['sys.dragon_generator']},
        {'file': 'engine/src/87-water.js', 'verdict': 'reuse the idea; port only a small core',
         'key_functions': ['WATER_PRESETS', 'WaterVolume (heightfield wave equation on a grid of at most 120 x 120 cells)', 'disturb', 'splashAt', 'foam from crest height and velocity', 'buoyancy through the old physics engine', 'Torricelli draining', 'fish', 'scum'],
         'what_it_gives': 'A good local ripple and foam model.',
         'why_not_whole': 'Built for pools and tanks (a bounded rectangle), stateful dt integration with random gusts, coupled to the old physics and particle systems: not an open ocean and not deterministic as written.',
         'how_to_port': 'The wave-equation core (about 40 lines), disturb() and the foam rule as a local impact patch around the scout\'s fall, run in meta.mode chunk-warmup, layered over a new closed-form ocean.',
         'port_cost_days': '1-2 (patch); the open ocean itself is new work (2-4)',
         'gaps_for_film': ['no open-sea waves to the horizon', 'no sky reflection model of its own in this file'],
         'used_for': ['fx.water_impact_and_trail']}],
    'not_requested_but_relevant': [
        {'file': 'engine/src/80-fracture.js', 'verdict': 'port', 'note': 'Fracture.shatterBox (3D Voronoi by half-space clipping; uniform, radial, slab and splinter patterns) for tiles, timber, the stall, turf and (with a curved variant) the egg shell. Depends on Shape.box from 70-physics-shapes.js. About 1 day.'},
        {'file': 'engine/src/85-particles.js', 'verdict': 'reuse colour/size ramps only', 'note': 'CPU-integrated, dt-stateful particles; the new runtime needs closed-form particles.'},
        {'file': 'engine/src/86-fluid.js', 'verdict': 'skip', 'note': 'Position-based fluid with screen-space rendering: too heavy for CPU 4K and stateful.'}],
    'recommended_strategy': [
        'Do not edit engine/src. Copy the needed files into a new ES-module folder owned by the asset build (for example dragons-kingdom/lib/legacy/; coordinate with the render-pipeline workflow, this pass did not create it).',
        'Add export statements to copies of 10-math.js (Vec3, Quat, Mat4, Rng, Noise) and 30-geometry.js (Geometry, weldNormals) plus closestPointOnSegment, and write a ~20-line toBufferGeometry(g) adapter, so the sculpt code ports almost line for line.',
        'Port pure builders first (94-human, 91-face geometry, 93 makeHumanoidMesh, 96 bodyLoft, 92 scatter, 80 fracture).',
        'Rewrite everything time-dependent as pure functions of t (face timeline, blinks, wind, gait, IK targets).',
        'First proof: a preview-resolution still of one ported head with three expressions and one viseme, before committing to the face plan.'],
    'totals': {'port_days': '10-15 (sum of the per-file estimates above, including the shim and 80-fracture.js)', 'estimated_saving': 'about 3-6 weeks versus rewriting the head sculpt, body loft and skinning from scratch',
               'new_work_still_needed_for_humans': 'about 3-5 weeks: fingers, rotating eyes, mouth interior, brows and lashes, hair, costumes, identity variation, child body, deterministic performance timelines',
               'confidence': 'rough planning estimates by reading the code; nothing was ported or rendered in this pass'}}

# --------------------------------------------------------------------------- budgets, tools, questions
RENDER_BUDGET = [
    'One shadow-casting directional light per shot (4096 map) with its frustum fitted to the shot; other lights unshadowed. Avoid point-light shadows (six extra renders each).',
    'At most about four dynamic lights affecting any material.',
    'Transparent overdraw (dust, mist, smoke, fire, fog cards) is the main CPU cost at 4K: prefer a few large textured sprites over many small ones; use alpha-test cutouts (not blending) for grass, hair and leaves.',
    'No planar reflection or refraction passes by default (each is another full scene render); use the sky environment map.',
    'MeshStandardMaterial by default; MeshPhysicalMaterial (clearcoat) only where it clearly pays: the wet hatchling, eyes, maybe Starlight.',
    'LOD: hero face rig only within about 5 m of the camera; low-poly heads beyond about 10 m; grass blades only within about 40 m.',
    'Procedural textures are generated in setup, which runs in every browser worker: keep total setup time reasonable (aim under about 20 s).',
    'Animate everything as a pure function of t; simulations only in chunk-warmup mode; never call Math.random in update().',
    'Fast action (scout pass, fire, impacts) should render on ones; slow dialogue shots are the candidates for the --twos or final-fast presets.',
    'Remember the measured budget: native 4K renders at 0.37-0.42 frames per second here (render/bench.mjs, pipeline README), i.e. roughly 57-65 minutes of render time per finished minute, so every asset\'s per-frame cost is multiplied across the shot list\'s expected runtime (about 25 minutes, about 35,000 3D-rendered frames; see shotlist.json totals). One native 4K pass of the episode is about a day of continuous rendering.']

TOOLS = [
    {'tool': 'three.js 0.180.0 (installed) and its addons in examples/jsm', 'license': 'MIT', 'use': 'Rendering, SkinnedMesh, morph targets, AnimationMixer, InstancedMesh, ConvexGeometry, CSM, SimplexNoise.'},
    {'tool': 'Headless Chromium via Playwright 1.56.1 (optional dependency)', 'license': 'Chromium: BSD-3-Clause; Playwright: Apache-2.0', 'use': 'Offline rendering (already chosen).'},
    {'tool': 'SwiftShader (Chromium\'s CPU WebGL)', 'license': 'Apache-2.0', 'use': 'CPU rasterization.'},
    {'tool': 'FFmpeg 6.1.1 with libx264 (system)', 'license': 'FFmpeg LGPL-2.1+/GPL-2.0+; x264 GPL-2.0+', 'use': 'Encoding (already chosen).'},
    {'tool': 'Node.js', 'license': 'MIT', 'use': 'Build scripts.'},
    {'tool': 'Rhubarb Lip Sync (optional, offline CLI; NOT installed on this machine, would be downloaded from its GitHub release)', 'license': 'MIT', 'use': 'Mouth-shape timing from dialogue audio.'},
    {'tool': 'Liberation Serif (installed: fonts-liberation 2.1.5; Noto Serif is NOT installed here)', 'license': 'SIL Open Font License 1.1', 'use': 'Optional Santa Maria hull lettering.'},
    {'tool': 'Daxtyn\'s old engine (engine/src)', 'license': 'His own code', 'use': 'Port source (see legacy_engine_port).'}]

QUESTIONS = [
    'Do you have pictures (drawings or references) for Remi, Abby, Alexandria, Queen Fall and the King of Cling? Without them every face is a provisional design.',
    'Bashion, Nightwing and Slitherwing bodies: four legs plus two wings, or wings that are also the front legs? Horns: how many and where?',
    'When you said Leaf is about one-twentieth of Charcoal, did you mean length, bulk, or how big he looks overall? We will show you one lineup picture of three options. Same question for Starlight being twice Charcoal.',
    'How big is the Slitherwing scout compared with Leaf, what colours is it, and is it snake-like?',
    'Eye colours for Charcoal, Leaf, Starlight and the hatchling?',
    'Can Alexandria sit (rather than kneel) next to Abby in the treatment room? It is much easier to animate with a gown.',
    'Should Charcoal\'s torn-up launch ground still be visible when Leaf lands in scene 2A?',
    'Does the King of Cling wear a crown? What instruments do the musicians play?',
    'Should "Santa Maria" be painted on the ship\'s hull?']

KNOWN_ISSUES = [
    {'where': 'scenes/lib/dragon.js (owned by the render-pipeline workflow; not modified)', 'issue': 'The placeholder dragon has emissive eyes (emissiveIntensity 4) and an emissive membrane, and a red colour scheme. Fine for render tests, but it must not be reused for canon dragons: the screenplay forbids glow.'},
    {'where': 'scenes/lib/castle.js (not modified)', 'issue': 'Has a banner on the donjon: keep it plain (no heraldry) if the castle is reused for the prologue walls or the palace.'},
    {'where': 'runtime/dk-runtime.js (not modified)', 'issue': 'Default camera near plane is 0.5 m: too far for face close-ups. Scenes can change ctx.camera.near/far per shot.'},
    {'where': 'runtime/post.js (not modified)', 'issue': 'Post chain is grade + FXAA + upscale only: no motion blur or depth of field. The scout pass and close-ups may want them; a request for the render-pipeline owner.'}]

BUILD_ORDER = [
    {'step': 1, 'what': 'Decide scale: lineup still of the three readings; write sys.geography data (Verdor coast, Cling layout).', 'why': 'Every shot and asset size depends on it.'},
    {'step': 2, 'what': 'Legacy shim and port of body, head and skinning; one preview-resolution head test with expressions.', 'why': 'Faces are the biggest quality risk; prove them early.'},
    {'step': 3, 'what': 'Dragon generator with Bashion and Nightwing presets; Charcoal and Leaf first.', 'why': f"Largest creature presence (scenes covering about {window(['1B', '1C', '1D', '1E', '1F', '2A', '2C']):g} minutes of the editorial plan)."},
    {'step': 4, 'what': 'Ocean, terrain, grass, mist for the Verdor exteriors.', 'why': 'Prologue and scenes 1B-2A, 2C.'},
    {'step': 5, 'what': 'Interiors (birthing chamber, treatment room) and costumes.', 'why': 'Cheap sets with dialogue-heavy, face-heavy scenes.'},
    {'step': 6, 'what': 'Cling village kit, crowd, destruction, dust and cloth.', 'why': f"Most complex set; scenes covering about {window(['3A', '3B', '3C', '3D']):g} minutes of the plan."},
    {'step': 7, 'what': 'Hatchling and egg; scout and wing tear; Starlight.', 'why': 'Shorter but specialized beats.'},
    {'step': 8, 'what': 'Remaining FX passes.', 'why': 'Layer on top of finished animation.'}]

DOC = {
    'episode': 'S01E01', 'series': "Dragon's Kingdom",
    'status': 'Planning data only. Nothing for this episode has been modelled, built, animated or rendered yet. Every character, dragon and set design here is PROVISIONAL until Daxtyn supplies approved references.',
    'source': 'episodes/s01e01/screenplay.md', 'source_sha256': sha,
    'companion_files': ['episodes/s01e01/assets.md (plain-language summary)', 'episodes/s01e01/dialogue.json (line counts used here)', 'episodes/s01e01/onscreen-text.json (captions, title, hull lettering)'],
    'prepared': '2026-10-05',
    'authoring': 'Hand-authored asset bible from a full read of the screenplay, the new render pipeline (read-only) and the old engine (read-only). Spoken-line counts come from dialogue.json; the scale table is computed.',
    'conventions': {
        'units': 'metres; +y up; creatures and characters face +z (matches scenes/lib/dragon.js)',
        'left_right': 'LEFT and RIGHT always mean the character\'s or creature\'s own side. Facing +z with +y up, its LEFT is +x. Abby\'s injured arm and the scout\'s lost wing are both on the LEFT (+x) side; never mirror these shots.',
        'scene_ids': SCENE_ORDER,
        'editorial_window_minutes': 'Sum of the screenplay\'s editorial-plan windows for the scenes an asset appears in. A planning figure, not measured on-screen time.',
        'determinism': 'The runtime requires every frame to be a pure function of t (runtime/dk-runtime.js). Stateful simulation only through meta.mode chunk-warmup.',
        'feasibility_scale': {'green': 'Standard procedural technique in three.js; low risk; cheap on CPU.',
                              'yellow': 'Feasible, but needs custom code and per-shot tuning; moderate cost.',
                              'orange': 'Hard: large build effort, a real quality risk or a high render cost. Simplify, cheat per shot, or keep it brief.',
                              'red': 'Not realistic on this CPU-only 4K setup. Stage around it.'},
        'render_cost_scale': {'low': 'adds little to a frame', 'medium': 'noticeable share of a frame', 'high': 'can dominate or multiply frame time',
                              'note': 'Estimates from technique, not measurements.'},
        'face_tiers': {'hero': 'Full face rig, rotating eyes, mouth interior, brows, hair; phoneme lip-sync; ready for 4K close-ups.',
                       'speaking': 'Same rig at lower density; lip-sync; medium shots.',
                       'background': 'Low-poly head; blink and a few expressions; no lip-sync.',
                       'hidden': 'Face never shown.'}},
    'binding_rules_for_builders': [
        'No invented ages, permanent facial features, personal names (King of Cling) or heraldry with lore meaning.',
        'Dragons: no glow, extra limbs, changing horns or decorative armor; no human dialogue.',
        'Charcoal is black, Leaf green, Starlight white (reflective, not crystal, not glowing), the hatchling gold (no glow). The scout is a Slitherwing, never a Nightwing.',
        'Fire only from Charcoal and only on "Fire"; "Attack" is physical. Starlight has no breath weapon and never hovers.',
        'Abby: LEFT arm injured from the 1E pass onward; sling on the LEFT arm. Scout: LEFT wing lost. Never mirror.',
        'The scout rider stays unidentifiable and alive; no insignia or legible saddle marks.',
        'Remi, Charcoal and Leaf get no unexplained major wounds; Starlight has none of her later injuries.',
        'Same riding equipment, weather, sun direction and coastline positions across cuts; the same face model for each recurring character in every shot.',
        'Cling escape routes (arch, broad road) and the reference pillar/fountain keep fixed positions; the arch is still standing at the end.',
        'Free tools and open licenses only; no downloaded copyrighted assets: everything is procedural.'],
    'summary': SUMMARY,
    'shotlist_cross_reference': XREF_NOTE,
    'scale': SCALE,
    'characters': CHARACTERS,
    'not_built': NOT_BUILT,
    'dragons': DRAGONS,
    'sets': SETS,
    'shared_props': SHARED_PROPS,
    'fx': FX,
    'shared_systems': SYSTEMS,
    'legacy_engine_port': LEGACY,
    'render_budget_guidelines': RENDER_BUDGET,
    'build_order': BUILD_ORDER,
    'free_tools_and_licenses': TOOLS,
    'known_issues_in_existing_code': KNOWN_ISSUES,
    'open_questions_for_daxtyn': QUESTIONS}

# --------------------------------------------------------------------------- checks
spk_in_doc = {c['speaking']['cue'] for c in CHARACTERS if c['speaking']['cue']}
missing = set(LINES) - spk_in_doc - {'NARRATOR'}
assert not missing, missing
for c in CHARACTERS:
    for s in c['speaking']['by_scene']:
        assert s in c['scenes'], (c['id'], s)
ids = [x['id'] for x in CHARACTERS + DRAGONS + SETS + FX + SYSTEMS]
assert len(ids) == len(set(ids)), 'duplicate ids'
total = sum(c['speaking']['total_lines'] for c in CHARACTERS) + NOT_BUILT[0]['lines']
assert total == len(dlg['lines']), (total, len(dlg['lines']))

with open(OUT, 'w') as f:
    json.dump(DOC, f, indent=2, ensure_ascii=False)
    f.write('\n')
print('wrote', OUT, 'characters', len(CHARACTERS), 'dragons', len(DRAGONS), 'sets', len(SETS), 'fx', len(FX), 'systems', len(SYSTEMS))
for r in readings:
    print(r['reading'], r['charcoal_length_m'], r['starlight_length_m'], r['remi_1.7m_as_percent_of_charcoal_length'], r['remi_pixels_if_charcoal_fills_4k_width'],
          r['wingbeat_hz_charcoal'], r['wingbeat_hz_starlight'], r['starlight_wingspan_over_cling_square'])
