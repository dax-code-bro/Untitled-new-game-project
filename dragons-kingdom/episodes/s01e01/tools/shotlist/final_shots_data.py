# Shot definitions for the LOCKED SHOOTING SCRIPT of Dragon's Kingdom S01E01 (final/screenplay-final.md).
# Read by final_build.py, which merges them with the handoff's shots in shots_data.py.
#
# Same compact form as shots_data.py:
#   S(id, size, cam, inframe, action, lines, sound, a, b, **kw)
#   size: EWS, WS, MS, CU, INS, POV, CARD; inframe "Name@pos, Name@pos"; lines "X4-03 X4-04" or "X3-06:0.5"
#   a = action seconds, b = breathing room seconds (same scale as shotlist.json)
#   kw: tags=[...], flags=[...], set=..., light=..., tod=..., diff=int, off=[speakers off screen], note=str,
#       lens=str (overrides the default lens for the shot size), realism=str (shot-specific realism strategy),
#       unit=R# (a rating-pass shot inside an addition), drop=str (a proposal shot that is played by another shot;
#       kept only so the timing check still matches check_extended.ADDITION_SHOTS)
#
# Timing: for every addition the action/breath seconds below add up to check_extended.ADDITION_SHOTS for that
# addition (minus declared drops) plus the CHANGE_SHOTS picture deltas of the CHANGED blocks inside it; every
# rating-pass block adds up to check_final.RATING_SHOTS. final_build.py fails if they drift, so the shot list
# and check_final.py always give the same runtime.

INSERTS = []        # [{'unit': 'X1', 'after': '1A-02', 'shots': [...]}, ...] in script order
OVERRIDES = {}      # handoff shot id -> {field: new value} (CHANGED blocks and DRAGONS.md decisions)
EXTRA = {}          # handoff shot id -> [extra shots inserted right after it] (picture time added by CHANGED blocks)
DROPS = {}          # handoff shot id -> (addition id, reason): dropped while that addition plays the same beat
_cur = None
_defaults = {}


def block(unit, after, **defaults):
    global _cur
    _cur = {'unit': unit, 'after': after, 'shots': []}
    INSERTS.append(_cur)
    _defaults.clear()
    _defaults.update(defaults)


def scene(**defaults):
    _defaults.update(defaults)


def S(sid, size, cam, inframe, action, lines, sound, a, b=0.0, **kw):
    d = dict(_defaults)
    d.update(dict(sid=sid, size=size, cam=cam, inframe=inframe, action=action, lines=lines, sound=sound, a=a, b=b))
    d.update(kw)
    d.setdefault('unit', _cur['unit'])
    _cur['shots'].append(d)


def X(sid, size, cam, inframe, action, lines, sound, a, b=0.0, **kw):
    """An extra shot inserted right after a handoff shot (sid like '1F-20b'); its scene defaults come from that shot."""
    base = sid[:-1]
    d = dict(sid=sid, size=size, cam=cam, inframe=inframe, action=action, lines=lines, sound=sound, a=a, b=b)
    d.update(kw)
    EXTRA.setdefault(base, []).append(d)


# Lighting / time-of-day presets (the handoff's sun conventions: Verdor sun over the sea side; Cling sun behind the
# king's steps to the south, far sky front-lit).
L_EARLY = 'Grey first light from the sea window, cool and soft; no lamp lit; the room still half in night.'
L_CORRIDOR = 'Palace corridor: daylight from tall windows at intervals, warm stone, pools of light and shade; cooler toward the far end.'
L_CHAMBER = 'Warm low lamps (practical) plus a cool daylight shaft from the high opening. Subdued, careful (same as 1A).'
L_CHAMBER_DAY = 'Later in the day: the high daylight now falls across the floor instead of the nest; lamps low.'
L_CHAMBER_LATE = 'Late afternoon: the shaft is low and warm across the far wall; lamps lit.'
L_GROUNDS_AM = 'Exterior morning; mist thinning to clear daylight; sun over the sea side (screen R/back), soft sky fill (same as 1B).'
L_AERIAL_AM = 'Clear morning over Verdor; mist still in the inland hollows; sun on the sea side (back/rim on the riders), bounce fill.'
L_CLING_AM = 'Early morning: sun low in the east, long shadows across the paving, cool air, warm light on the upper walls.'
L_ROCKS = 'Bright late morning; sun on the sea side; white water and spray backlit; a low bank of sea mist on the seaward side of the stacks.'
L_PURSUIT = 'Bright late morning over the sea; sun high on the sea side (glare for the sun beat); white-out inside the mist.'
L_HARBOR = 'Late morning at the harbor; weathered pale stone, sea blue, crisp shadows under the furled sails.'
L_GROUNDS_DAY = 'Clear day, same sun side as 1B (sea side, screen R/back).'
L_ROOM = 'Working room with daylight from an opening on screen L (coast visible); clean, plain (same as 2B).'
L_CLING_NOON = 'Midday: high sun, short shadows, warm cloth and dust in the air; the far sky bright.'
L_GROUNDS_PM = 'Afternoon; sun lower over the sea side, warmer; longer shadows on the turf.'
L_HARBOR_PM = 'Afternoon at the harbor; sun lower and warmer over the sea; sails backlit as they fill.'
L_GROUNDS_LATE = 'Later that day: long shadows across the field, warm low sun over the sea side; faces need warm bounce.'
L_GROUNDS_GOLD = 'Late afternoon toward evening: low golden sun over the sea, long shadows, the far sail catching the light.'
L_CLING_DAY = "Warm daylight; sun behind the king's steps (south), far sky front-lit. Warm cloth, timber, gray stone (same as 3A)."
L_CLING_DUST = 'Daylight progressively veiled by dust; the fountain edge and its central stone pillar stay readable (same as 3C).'
L_CLING_AFTER = 'Dusty, dimmed daylight; fine dust still falling (same as 3D).'
L_CLING_SKY = 'High above the village; bright sky; Starlight front-lit from the south.'

# ===================================================================================================== 1A
block('X1', after='1A-02', set='PALACE_CORRIDOR', tod='EARLY MORNING', light=L_CORRIDOR)
S('X1-01', 'WS', 'eye-level follow, slow and steadied', 'Young Attendant@C (hurrying away, then turning toward camera)',
  'A YOUNG ATTENDANT, sent by the attendant at the nest, hurries out of the birthing chamber and along a palace corridor in the early light, trying not to run and failing.',
  '', 'Quick footsteps on stone; a door behind her; the sea far off through the windows.', 4.5, 0, tags=['BODY_MECHANICS'])
S('R1-01', 'INS', 'static', 'Wine jug and cup@C (window sill)',
  "Close on Alexandria's window sill in the grey first light: a jug of wine, nearly empty, and one cup with a dark ring dried inside it. Nobody else is in the room.",
  '', 'Room tone; a gull far off; the sea below.', 3.5, 0.5, unit='R1', set='ALEXANDRIA_ROOM', light=L_EARLY,
  tags=['PROP_DRINK_SMOKE'], flags=['NO_CHILD_IN_FRAME'],
  realism='Real pottery and a wine film: a matte glazed jug, the dried ring inside the cup with a darker meniscus line; window light grazing across the sill so the grain and dust read.')
S('X1-02', 'WS', 'static, very slow push', 'Alexandria@R (at the window, back to camera, dressed), Bed@L (not slept in)',
  'Alexandria stands at a window, already dressed in her restrained formal gown. Behind her, the bed has not been slept in. Through the window, the first light lies on the sea.',
  '', 'Sea wash far below; a single gull.', 5, 1, set='ALEXANDRIA_ROOM', light=L_EARLY, tags=['CLOTH'])
S('X1-03', 'MS', 'static', 'Alexandria@C (turning), Door@L-bg',
  'She turns before the young attendant has finished knocking.', '', 'Two quick knocks, the second cut short.', 2, 0,
  set='ALEXANDRIA_ROOM', light=L_EARLY, tags=['FACE_CLOSEUP'])
S('X1-04', 'MS', "static, over Alexandria's shoulder to the door", 'Young Attendant@L (in the doorway), Alexandria@R-fg',
  'The message at the door.', 'X1-01 X1-02', 'Low voices.', 0.5, 0, set='ALEXANDRIA_ROOM', light=L_EARLY)
S('X1-05', 'WS', 'tracking alongside, eye level', 'Alexandria@C (walking fast), Young Attendant@R-bg (falling behind)',
  'She walks the corridor quickly, the young attendant falling behind.', '', 'Her steps, quick and even; the gown.', 4, 0,
  tags=['CLOTH', 'BODY_MECHANICS'])
S('X1-06', 'MS', 'static', 'Alexandria@C (at the chamber door)',
  'At the chamber door she stops for a moment, lets her face settle into composure, and goes in.', '', 'One breath; the latch.', 3, 0.5,
  tags=['FACE_CLOSEUP'], realism='The composure beat is the whole shot: a slow exhale, eyelids, jaw; no large expression change.')

block('X2', after='1A-33', set='BIRTHING_CHAMBER', tod='MORNING', light=L_CHAMBER)
S('X2-01', 'MS', 'static', 'Remi@L (last through the door), Alexandria@R (at the nest, not looking up), Hatchling@R',
  'Remi is the last one through the chamber door. Alexandria speaks without looking up from the hatchling.', '', 'Shell crumbs; the lamp.', 3, 0)
S('X2-02', 'MS', 'static two-shot across the room', 'Remi@L (stopped in the doorway), Alexandria@R',
  'He stops in the doorway.', 'X2-01 X2-02', 'Quiet room.', 1, 0)
S('X2-03', 'MS', 'static', 'Remi@C (doorway)', 'He answers and goes.', 'X2-03', 'Door.', 2, 0.5)
S('X2-04', 'WS', 'backward tracking ahead of them, eye level', 'Abby@L, Remi@R (walking fast toward camera), daylight@bg',
  'Abby and Remi walk fast down a corridor toward the daylight at its end.', '', 'Two sets of fast footsteps; stone.', 4, 0,
  set='PALACE_CORRIDOR', light=L_CORRIDOR, tags=['BODY_MECHANICS'])
S('X2-05', 'MS', 'tracking', 'Servants (two, with linen)@R-fg (flattening against the wall), Abby@C, Remi@C',
  'Two SERVANTS carrying linen flatten themselves against the wall to let them pass.', '', 'Linen rustle; a murmured "Your Highness".', 2.5, 0,
  set='PALACE_CORRIDOR', light=L_CORRIDOR, tags=['CLOTH'])
S('X2-06', 'MS', 'tracking two-shot', 'Abby@L, Remi@R', 'Teasing on the move.', 'X2-04 X2-05 X2-06 X2-07', 'Footsteps under the lines.', 1, 0,
  set='PALACE_CORRIDOR', light=L_CORRIDOR, flags=['ABBY_BOTH_HANDS_BEFORE_PASS'])
S('X2-07', 'WS', 'static at the corridor end, into the light', 'Abby@C, Remi@C (going out into daylight)',
  'She shoves his arm without breaking stride. He lets her. They go out into the morning light.', '', 'Outside air; birds; distant field.', 3, 0,
  set='PALACE_CORRIDOR', light=L_CORRIDOR)
S('X2-08', 'WS', 'static, low, long lens', 'Leaf@C (coming low and quick, then crouching), Abby@L-fg (approaching), Remi@R (walking on past)',
  "Leaf is waiting where he always waits. He sees Abby coming and starts toward her too fast, low and quick on his two legs with his folded wings swinging forward to take his weight, then remembers himself and crouches low, belly near the grass, his two legs folded under the middle of his body, the wrists of his folded wings on the ground in front of him, quivering with the effort of keeping still. Remi walks on past them toward the far end of the field, where something very large breathes out of frame (Charcoal stays out of frame until 1B).",
  '', "Leaf's quick breaths; grass; a very large slow breath off screen R.", 5, 0, set='VERDOR_GROUNDS', light=L_GROUNDS_AM,
  tags=['GRASS', 'BODY_MECHANICS'], lens='85 mm, low, so Leaf\'s low crouch reads against the grass')
S('X2-09', 'MS', 'handheld-feel, close beside them', 'Abby@L (checking a wing joint), Leaf@C',
  "Abby goes over Leaf the way she does every morning: each wing joint in turn, practised and unhurried.", '', 'Her hands on his hide; his breath.', 4, 0,
  set='VERDOR_GROUNDS', light=L_GROUNDS_AM, tags=['HANDS_CONTACT'], flags=['ABBY_BOTH_HANDS_BEFORE_PASS'])
S('X2-10', 'CU', 'static', "Leaf's foot@C, Abby's hands@C, Leaf's eye@R (rack focus)",
  'Each foot; the soft skin under his jaw where the straps sit. She finds an old scrape on one foot pad, presses beside it and watches his eye. He does not flinch.',
  '', 'Quiet; a soft exhale.', 5, 0, set='VERDOR_GROUNDS', light=L_GROUNDS_AM, tags=['HANDS_CONTACT'])
S('X2-11', 'MS', 'static', 'Abby@L, Leaf@R', 'She is satisfied.', 'X2-08', '', 0.5, 0, set='VERDOR_GROUNDS', light=L_GROUNDS_AM)
S('X2-12', 'MS', 'static', 'Leaf@C (nosing the riding equipment), Abby@L',
  'Leaf noses at the riding equipment over her shoulder, wanting to go. She pushes his head away. It comes straight back.', '', 'Leather creak; a snort.', 3.5, 0,
  set='VERDOR_GROUNDS', light=L_GROUNDS_AM)
S('X2-13', 'CU', 'static', 'Abby@L (forehead to his), Leaf@R',
  'She leans her forehead against his for a moment, and he breathes out, warm, through his nose.', '', 'His long warm breath; her breath.', 3, 1,
  set='VERDOR_GROUNDS', light=L_GROUNDS_AM, tags=['FACE_CLOSEUP', 'CREATURE_CONTACT'],
  realism="Her face in profile against his scales, eyes closed; his breath stirs her loose hair (the hair sim must move); keep his eye in focus behind her.")
S('X2-14', 'MS', 'static', 'Alexandria@R (beside the nest), Attendant@L', 'The chamber is quiet again. Alexandria looks up at the attendant, who has been awake as long as she has.',
  '', 'Lamp hiss; the hatchling breathing.', 3.5, 0)
S('X2-15', 'MS', 'static two-shot', 'Attendant@L, Alexandria@R', 'She sends the attendant to sleep.', 'X2-09 X2-10 X2-11', 'Low voices.', 0.5, 0)
S('X2-16', 'WS', 'static', 'Attendant@L-bg (leaving), Young Attendant@L-bg (coming in with water), Alexandria@R',
  'The attendant goes. In the doorway she passes the YOUNG ATTENDANT, coming in with fresh water to take the next watch, who settles quietly by the door.', '', 'Door; water in a jug.', 3.5, 0)
S('X2-17', 'MS', 'static', 'Alexandria@R, Hatchling@C (breathing)', 'Alexandria does not speak to the hatchling. She watches it breathe.', '', 'Breathing; lamp.', 3, 1.5,
  tags=['GOLD_MATERIAL'])

# ===================================================================================================== 1B
block('X3', after='1B-10', set='VERDOR_GROUNDS', tod='MORNING', light=L_GROUNDS_AM)
S('X3-01', 'WS', 'static, long lens', "Remi@C (walking), access rig@R, Keepers (two, on guide ropes)@R, Charcoal@R (part)",
  "Remi walks to Charcoal's access rig: a timber stair and platform at the edge of the launch space, built for this one animal. Two keepers hold its guide ropes.",
  '', 'Footsteps on turf; rope creak.', 4, 0, tags=['MOUNTING_RIG', 'SCALE'])
S('X3-02', 'WS', 'static, low', 'Charcoal@C (lowering himself, low and level), access rig@L',
  'Charcoal does not need to be told. He lowers himself by a measured amount, belly toward the turf, the wrists of his folded wings braced in front, and holds still.',
  '', 'A huge slow exhale; the ground creaks under his weight.', 4, 0, tags=['SCALE', 'BLACK_HIDE'], diff=4)
S('X3-03', 'MS', 'following Remi up the stair', 'Remi@C (climbing), Charcoal (flank)@R', 'The climb: the first turn of the stair.', '', 'Boots on timber; harness clips.', 4, 0,
  tags=['MOUNTING_RIG', 'BODY_MECHANICS'])
S('X3-04', 'WS', 'static from the landing', 'Remi@L (on the landing), Charcoal (back and folded wing)@C',
  "The landing: each turn shows more of Charcoal's body.", '', 'Wind; his breathing moves the air.', 3, 0, tags=['SCALE', 'BLACK_HIDE'])
S('X3-05', 'WS', 'high, looking down past Remi', 'Remi@C-fg (at the top), Keepers@C-bg (small below)', 'At the top the keepers below are small. Brisk and practised.', '', 'Height; wind.', 3, 0,
  tags=['SCALE'])
S('X3-06', 'WS', 'static, long lens across the field', 'Leaf@L (past the stakes, neck stretched), Abby@L (on his back), Ground Keeper@R-fg (on the platform behind Remi)',
  "Across the field, Leaf has edged forward with Abby on his back, neck stretched toward Charcoal, past the line of stakes. The speaking GROUND KEEPER, now on the platform behind Remi, sees it.",
  '', 'Field ambience.', 5, 0, flags=['SIZE_DISPARITY'])
S('X3-07', 'MS', 'static', 'Ground Keeper@R (calling), Abby@L-bg (on Leaf)', 'The line.', 'X3-01 X3-02 X3-03', 'Called across a short distance.', 0.5, 0)
S('X3-08', 'WS', 'static', 'Leaf@L (turning back behind the stakes), Abby@L, Charcoal@R (ignoring him)',
  'Abby turns Leaf back behind the stakes. Leaf goes, looking over his shoulder at Charcoal the whole way. Charcoal does not look at him at all.', '', 'Grass; one indignant snort.', 4, 0.5,
  flags=['SIZE_DISPARITY'])
S('X3-09', 'MS', 'static', 'Remi@C (in the riding rig), Ground Keeper@R-bg',
  'At the saddle, Remi settles into the riding rig: leather straps, buckles, a broad seat. No decorative armor, no crest. He pulls each strap hard against its buckle.', '', 'Leather; buckles.', 4, 0,
  tags=['HANDS_CONTACT'])
S('X3-10', 'MS', 'static', 'Ground Keeper@R, Remi@L', 'A ritual both of them respect.', 'X3-04 X3-05', 'Leather.', 0.5, 0)
S('X3-11', 'INS', 'static', "Ground Keeper's hands@C (on the straps)", 'The keeper checks them once more anyway, quickly and thoroughly, and Remi lets him.', '', 'Buckle tongues.', 3, 0,
  tags=['HANDS_CONTACT'])
S('X3-12', 'MS', 'static', 'Abby@C (on Leaf, adjusting a strap with both hands), Leaf@C',
  'Abby, waiting on Leaf, adjusts a strap with both hands and watches the inspection with open impatience.', 'X3-06', '', 3, 0, flags=['ABBY_BOTH_HANDS_BEFORE_PASS'])
S('X3-13', 'MS', 'static', 'Leaf@C (shifting his weight), Abby@C', 'Leaf shifts his weight, agreeing with the tone if not the words.', '', 'Claws on turf.', 2, 0)
S('X3-14', 'CU', 'static', "Remi's palm@C (on Charcoal's neck), Remi@L (part)", "Remi lays his palm flat against Charcoal's neck.", 'X3-07', 'Hand on scales.', 2, 0,
  tags=['HANDS_CONTACT', 'BLACK_HIDE'])
S('X3-15', 'CU', 'static', "Charcoal's eye@C (blue)", "Charcoal's eye half closes and opens again.", '', 'A low breath.', 2.5, 1, tags=['BLACK_HIDE'],
  realism='Eye: wet cornea highlight, a slow nictitating blink, the blue iris with depth; keep the lids and scales around it moving with the breath.')
S('R2-01', 'MS', 'static', 'Ground Keeper@C (at the edge of the launch space), Keeper@R',
  'The speaking GROUND KEEPER takes a short clay pipe from his teeth, knocks it out against his heel and grinds the ember into the turf. He looks down at the turf under his boot with something close to grief.',
  'R2-01', 'Pipe tapped on a heel; boot on turf.', 4, 0, unit='R2', tags=['PROP_DRINK_SMOKE', 'SMOKE'], flags=['NO_CHILD_IN_FRAME'])
S('R2-02', 'MS', 'static', 'Keeper@C (not answering)', 'The other keeper does not answer. He hears it every morning.', '', '', 1.5, 0, unit='R2')
S('X3-16', 'WS', 'static', 'access rig@C (drawn back on its runners), Keepers@C, Charcoal@R',
  'The keeper climbs down. The keepers draw the stair back on its runners, well clear of the launch space, and step away.', '', 'Runners grinding; the field goes quiet.', 5, 0,
  tags=['MOUNTING_RIG', 'BODY_MECHANICS'], flags=['FIELD_CLEAR'])
DROPS['1B-11'] = ('X3', "Remi's climb up the access rig is shown in full in X3 (X3-01..X3-05).")

# ===================================================================================================== after 1C
block('X4', after='1C-19', set='VERDOR_AERIAL', tod='MORNING', light=L_AERIAL_AM)
S('X4-01', 'EWS', 'aerial travel, slow', "Harbor@C (wall, quay, slipway, nets), Leaf@L (small), Charcoal@R (high)",
  'The coast bends and the harbor opens below them: a curved stone wall, a quay of weathered pale stone, boats on a slipway, nets drying on frames. Mist still in the inland hollows; island inland, open sea on the other side. A working harbor, not a postcard.',
  '', 'Wind; gulls far below; a bell on a boat.', 7, 0, tags=['OCEAN', 'SCALE', 'CROWD_SMALL'], diff=4)
S('X4-02', 'WS', 'air-to-air, long lens', 'Leaf@C (low along the harbor wall), Abby@C, harbor wall@bg', 'Leaf drops lower and flies along the harbor wall.', '',
  "Leaf's quick beats echo off the stone.", 4, 0, tags=['OCEAN'])
S('X4-03', 'WS', 'high, static', "Charcoal's shadow@C (crossing the town roofs)", 'Charcoal stays high; his shadow reaches the town before he does.', '', 'Deep slow beats overhead.', 4, 0,
  tags=['SCALE'])
S('X4-04', 'MS', 'static, from the quay', 'Working dragon@C (crouched low and level by the catch), Fishing crew@L, Fish baskets@R',
  "On the quay, a working dragon about Leaf's size crouches low and level beside a fishing crew, folded wings' wrists on the stones, watching the catch being sorted and waiting for its share.",
  '', 'Fish slapping into baskets; crew chatter.', 4, 0, set='VERDOR_HARBOR', light=L_HARBOR, tags=['CROWD_SMALL'], flags=['LOW_STANCE'])
S('X4-05', 'WS', 'static, from the slipway', 'Second small dragon@C (walking the net line up the slipway), Boats (two)@bg, Fishing crew@R',
  "Two boats bring in a heavy net between them; a second small dragon takes the slack line in its jaws and walks it up the slipway, low on its two legs and the wrists of its folded wings, in time with the crew's pull.",
  '', "Rope strain; the crew's rhythm call (wordless); water off the net.", 6, 0, set='VERDOR_HARBOR', light=L_HARBOR,
  tags=['CROWD_SMALL', 'BODY_MECHANICS', 'OCEAN'], flags=['LOW_STANCE'], diff=4)
S('X4-06', 'MS', 'static', 'Farmer@C (on a terrace, leaning on a tool)', 'On a terraced hillside, a farmer leans on a tool and watches the royal riders pass, not especially impressed.', '',
  'Wind in grass; distant beats.', 3, 0, set='VERDOR_AERIAL')
S('X4-07', 'WS', 'static, street level', "Market street crowd@all, Charcoal's shadow@C",
  "In the market street, Charcoal's shadow crosses the stalls. People glance up, recognize him and go back to their business. One or two lift a hand. Nobody runs.",
  '', 'Market chatter that barely pauses; one heavy wingbeat.', 5, 0, set='VERDOR_HARBOR', light=L_HARBOR, tags=['CROWD'], diff=5)
S('X4-08', 'WS', 'air-to-air', 'Leaf@C (calling), Working dragon@bottom (answering from the quay)', 'Leaf gives a quick, bright call. The quay dragon answers from below. Charcoal does not call.', '',
  "Leaf's call; the quay dragon's answer.", 3.5, 0)
S('X4-09', 'WS', 'aerial, slow pass', "Santa Maria@C (moored, furled sails, crew at work)",
  "Moored at the quay is the largest ship in the harbor: the Santa Maria. Her name may be glimpsed on the hull (on-screen text T12, optional); do not hold on it.",
  '', 'Rigging; crew voices.', 5, 0, set='VERDOR_HARBOR', light=L_HARBOR, tags=['OCEAN', 'CROWD_SMALL'])
S('X4-10', 'MS', 'air-to-air past the mast', 'Lookout@R (masthead, ducking, then waving), Abby@L (on Leaf, waving back with her LEFT hand), Leaf@L',
  'Leaf passes close beside her mast. A LOOKOUT at the masthead ducks, then laughs and waves. Abby waves back with her LEFT hand (no attention drawn to which hand).', 'X4-01',
  "Leaf's beats; the lookout's laugh.", 5, 0, flags=['ABBY_BOTH_HANDS_BEFORE_PASS'], tags=['FACE_CLOSEUP'])
S('X4-11', 'WS', 'air-to-air, long lens', 'Leaf@L (climbing back), Charcoal@R', "Leaf climbs back up to Charcoal's level, on his usual side, near enough for talk over the wind.", '',
  'Wind.', 3.5, 0, flags=['SCREEN_DIRECTION', 'SIZE_DISPARITY'])
S('X4-12', 'MS', 'air-to-air', 'Remi@R, Abby@L', 'Abby pretends not to hear and pats Leaf\'s neck.', 'X4-02', 'Wind between the lines.', 2, 0, flags=['SPEAKING_DISTANCE'])
S('X4-13', 'WS', 'aerial, looking down', 'Young riders@C (on small dragons), Instructor@L, one young dragon@R (lying flat, refusing to move)',
  'On a grassy field above the harbor, young riders learn on small dragons under an INSTRUCTOR: a wobbling takeoff, a rider clinging on with both arms, one young dragon lying down flat in the middle of the lesson and refusing to move. Abby laughs. No rider is named or given an age.',
  '', "Abby's laugh; the instructor's distant call.", 8, 0, tags=['CROWD_SMALL', 'BODY_MECHANICS'], flags=['LOW_STANCE'], diff=4)
S('X4-14', 'EWS', 'aerial', "Palace@C (on the high ground; the birthing chamber's high opening)", "Beyond the town, on its high ground, the palace: weathered pale stone, practical, the birthing chamber's high opening a dark shape near the top. No emblems.",
  '', 'Wind.', 5, 0)
S('X4-15', 'MS', 'long lens from Remi\'s eyeline', "Alexandria@C (small, in the chamber's opening), Remi@L-fg (lifting a hand)",
  'Remi looks up at the opening and sees Alexandria standing in it, watching them pass. He lifts a hand. She does not wave back. She watches until they are past.', '', 'Wind.', 4, 0.5,
  lens='300 mm equivalent POV compression, then reverse on Remi')
S('X4-16', 'MS', 'air-to-air', 'Remi@R (looking down over the town)', 'Remi looks down over the town for longer than he needs to: the roofs, the harbor, the people working.', '', 'Wind.', 5, 1)
S('X4-17', 'CU', 'air-to-air', 'Abby@L (watching him)', 'Abby watches him doing it.', '', '', 2, 0)
S('X4-18', 'MS', 'air-to-air two-shot, long lens', 'Abby@L, Remi@R', 'Counting roofs.', 'X4-03 X4-04 X4-05 X4-06 X4-07', 'Wind between the lines.', 0.5, 0, flags=['SPEAKING_DISTANCE'])
S('X4-19', 'CU', 'air-to-air', 'Remi@R (looking away to the sea)', 'He does not answer. He looks away from the town toward the sea, like someone caught.', '', '', 2.5, 1)
S('X4-20', 'EWS', 'aerial travel', 'Leaf@L, Charcoal@R, coast@L, outer rocks@far-R', 'The dragons leave the harbor behind and follow the coast toward its far end, where the outer rocks stand in the sea.', '',
  'Wind; the light theme.', 5, 0, tags=['OCEAN'])

block('X5', after='1C-19', set='CLING_SQUARE', tod='MORNING', light=L_CLING_AM)
S('X5-01', 'INS', 'static, low', 'Cart wheel@C (on paving)', 'ON-SCREEN LOCATION: CLING — SCRAPPER (T11). A cart wheel jolts over uneven paving stones.', '', 'Wheel on stone; cart creak.', 3, 0)
S('X5-02', 'WS', 'static', 'Fountain and central pillar@C, empty square@all', 'The square is nearly empty; long morning shadows; the fountain runs quietly around its stone pillar. The festival has not begun.',
  '', 'The fountain; a bird on a roof.', 5, 0, flags=['CLING_ROUTES'])
S('X5-03', 'WS', 'slow traveling pan around the square', 'Steps@S, stone arch@L, gate@R, alley@L-C, music space@R-C',
  'The camera passes each fixed landmark naturally, unlabelled: the steps, the stone arch, the gate onto the broad road, the alley, the music space. This is the map the attack depends on.',
  '', 'A shutter thrown back; a door.', 8, 0, flags=['CLING_ROUTES'])
S('X5-04', 'MS', 'static', 'Vendor@C (building the stall)', 'The VENDOR pushes his cart into place and builds his stall: poles, a crossbar, a cloth roof.', '', 'Wood knocks; cloth.', 6, 0, tags=['CLOTH'])
S('X5-05', 'INS', 'static', 'Stall leg@C, Vendor\'s hands@C', 'One leg rocks on the uneven stones. He wedges a flat stone under it, tests it, and wedges a second.', '', 'Stone scraping.', 5, 0, tags=['HANDS_CONTACT'])
S('X5-06', 'MS', 'static', 'Stall cloth corner@C (hanging low)', 'He ties the cloth. One corner hangs lower than the rest, at the height of a passing shoulder.', '', '', 3, 0, tags=['CLOTH'])
S('X5-07', 'WS', 'static', 'Villagers (two, with a ladder)@L-to-R, stall@C', 'Two VILLAGERS carry a long ladder across the square to hang banners. The end of the ladder catches the low corner and drags the cloth half off its frame. They do not notice.',
  '', 'Ladder knock; cloth tear-free.', 4.5, 0, tags=['CLOTH', 'BODY_MECHANICS'])
S('X5-08', 'MS', 'static', 'Vendor@C (retying the corner)', 'The vendor watches them go, then reties the corner without a word. That is the first time.', '', '', 3.5, 0)
S('X5-09', 'WS', 'static', 'Square@all (doors opening, a bird)', 'Early sounds, few and distinct: the fountain, the cart, a door opening, a bird on a roof, a shutter thrown back.', '',
  'The fountain, the cart, a door, a bird, a shutter.', 4, 0)
S('X5-10', 'MS', 'static, through the open door', 'Parent@C (wrapping a parcel at a table), Child@R', 'Through the open door of a house near the stone arch, the PARENT wraps a parcel in cloth: something baked, still warm enough to fog the cloth.',
  '', 'Cloth; a knot.', 5, 0)
S('X5-11', 'MS', 'static', 'Child@R (reaching), Parent@C (moving the parcel out of reach)', 'The CHILD reaches for the parcel. The parent moves it gently out of reach: not yet.', '', '', 3, 0)
S('X5-12', 'WS', 'static', 'Child@C (going to the doorway to watch)', 'The child accepts this and goes to the doorway to watch the banners go up.', '', '', 3, 0)
S('X5-13', 'MS', 'static', 'Musician@C (on the fountain rim, testing his instrument)', 'The MUSICIAN sits on the fountain rim to test his instrument. One fastening is loose. He presses it with his thumb.', '',
  'Tuning notes.', 5, 0, tags=['INSTRUMENT_ANIM'])
S('X5-14', 'MS', 'static two-shot', 'Musician@L, Vendor@R', 'An old conversation between friends.', 'X5-01 X5-02 X5-03', '', 0.5, 0.5)
S('R3-01', 'WS', 'static, across the square', 'House door@L (swinging shut), Parent@L (calling the child in)',
  'At the house near the arch, the parent calls the child in from the doorway, and the door swings shut.', '', 'A call; the door.', 2.5, 0, unit='R3')
S('R3-02', 'MS', 'static', 'Musician@C (lighting a small pipe), Vendor@R-bg',
  'The musician takes a small pipe from his coat and lights it. The smoke that drifts across the fountain is thicker and sweeter than tobacco, and the vendor knows exactly what it is. No child is in the shot or in sight of it.',
  '', 'A spark; a long draw.', 4.5, 0, unit='R3', tags=['PROP_DRINK_SMOKE', 'SMOKE'], flags=['NO_CHILD_IN_FRAME'],
  realism='Smoke: thin, slow, catching the low morning backlight; no detail of what is in the pipe or how it is filled.')
S('R3-03', 'MS', 'static two-shot', 'Musician@L, Vendor@R', 'Deadpan.', 'R3-01 R3-02 R3-03 R3-04', '', 0.5, 0, unit='R3', flags=['NO_CHILD_IN_FRAME'])
S('R3-04', 'MS', 'static', 'Musician@C (smoking, eyes closed, instrument across his knees), Vendor@R-bg (going back to his stall)',
  'The vendor shakes his head and goes back to his stall. The musician smokes with his eyes closed and the instrument across his knees.', '', 'The fountain.', 3, 0.5,
  unit='R3', tags=['PROP_DRINK_SMOKE', 'SMOKE'], flags=['NO_CHILD_IN_FRAME'])
S('X5-15', 'WS', 'static', "Watchman@C (climbing to his post), Guard@L-bg", "The WATCHMAN climbs to his post: a raised platform on the wall with a clear line of sight over the roofs. He wraps his cloak against the chill.",
  '', 'Ladder rungs; cloak.', 5, 0, tags=['CLOTH'])
S('X5-16', 'MS', 'static', 'Guard@L (below), Watchman@R (above)', 'A guard calls up without much interest.', 'X5-04 X5-05 X5-06 X5-07', '', 0.5, 0)
S('X5-17', 'POV', 'static', "Roofs@bottom, fields@C, road@C, sky@top (a few high clouds, birds)", "The watchman's view: roofs, fields, a road and a wide, quiet sky. Nothing moves in it but birds. No foreshadowing.",
  '', 'Birds; distant wind.', 5, 1)
S('X5-18', 'WS', 'static', 'First banner@C (unrolling across the square)', 'The first banner unrolls across the square and lifts in the breeze.', '', 'Cloth snap.', 4, 0, tags=['CLOTH'])

block('X6', after='1C-19', set='OUTER_ROCKS', tod='MORNING', light=L_ROCKS)
S('X6-01', 'EWS', 'aerial, slow', "Outer rocks@C (sea stacks, seabird ledges), gap@C, mist bank@far-R (seaward), Leaf@L, Charcoal@L",
  'Off the end of the coast stand the outer rocks: tall sea stacks, white water at their feet, seabirds on every ledge. Two stacks lean close together, leaving a narrow gap that opens seaward; on the seaward side a low bank of sea mist lies against the rocks. One clear wide; it must match 1F.',
  '', 'Surf; a thousand seabirds.', 6, 0, tags=['OCEAN', 'FOG', 'BIRDS'], diff=4)
S('X6-02', 'WS', 'aerial', 'Gap@C (between two leaning stacks)', 'The gap.', '', 'Surf in the gap.', 3, 0, tags=['OCEAN'])
S('X6-03', 'WS', 'aerial', 'Mist bank@C (against the seaward side)', 'The mist lying against the seaward side.', '', 'Muffled surf.', 3, 0, tags=['FOG', 'OCEAN'])
S('X6-04', 'MS', 'air-to-air', 'Abby@L (looking at the gap, then at Remi)', 'Abby looks at the gap, then at Remi. He already knows what she is going to say.', '', '', 2, 0, set='SKY_OFF_VERDOR')
S('X6-05', 'MS', 'air-to-air two-shot', 'Abby@L, Remi@R', 'The challenge.', 'X6-01 X6-02 X6-03 X6-04 X6-05', 'Wind.', 0.5, 0, set='SKY_OFF_VERDOR', flags=['SPEAKING_DISTANCE'])
S('X6-06', 'WS', 'air-to-air', 'Leaf@C (dropping away toward the rocks), Abby@C', 'She does not wait. She leans, and Leaf drops away toward the rocks with quick, eager wingbeats.', '', 'Quick beats.', 3, 0, set='SKY_OFF_VERDOR')
S('X6-07', 'MS', 'air-to-air', 'Remi@C (leaning forward), Charcoal@C', 'Remi, resigned, leans forward, and Charcoal goes after them.', 'X6-06', 'A deep beat.', 2, 0, set='SKY_OFF_VERDOR')
S('X6-08', 'WS', 'low over the water, tracking', 'Leaf@C (skimming the water), Abby@C', 'Leaf goes low and fast, skimming the water, making small quick corrections.', '', 'Spray; quick beats.', 4, 0, tags=['OCEAN'])
S('X6-09', 'WS', 'static inside the gap, looking out', 'Leaf@C (tilted almost onto his side), Abby@C (tucked down)', 'He tilts almost onto his side and threads the gap, wingtips passing close to the rock.', '',
  'Rush of air between stone walls.', 4, 0, tags=['OCEAN', 'FAST_PASS'], diff=5)
S('X6-10', 'CU', 'air-to-air', 'Abby@C (tucked down, laughing)', 'Abby is tucked down against him, both hands on the straps, laughing into the wind.', '', 'Her laugh; wind.', 2, 0,
  flags=['ABBY_BOTH_HANDS_BEFORE_PASS'], tags=['FACE_CLOSEUP'])
S('X6-11', 'WS', 'aerial, low angle up', 'Charcoal@C (climbing over the stacks)', 'Charcoal cannot follow. He climbs and goes over the top of the stacks, slow and enormous.', '', 'Heavy slow beats.', 5, 0, tags=['SCALE', 'BLACK_HIDE'])
S('X6-12', 'WS', 'static at the foot of the stacks', 'Water ring@C, Seabirds@all (lifting off)', "His downwash flattens the water around the rocks into a pale ring and lifts every seabird off its ledge at once.",
  '', 'Downwash roar; birds.', 4, 0, tags=['OCEAN', 'BIRDS', 'WATER_IMPACT'], diff=5)
S('X6-13', 'MS', 'air-to-air', 'Remi@C (low in the saddle), spray@bg', 'Spray climbs the stone. Remi stays low in the saddle.', '', 'Spray.', 3, 0, tags=['OCEAN'])
S('X6-14', 'WS', 'aerial', 'Charcoal@C (wings folding, diving down the far side)', 'On the far side Charcoal folds his wings and comes down the slope of the air; for a moment it looks as if he might get there first.', '',
  'Wind roar.', 4, 0, tags=['SCALE'])
S('X6-15', 'WS', 'static on a lower stack', 'Leaf@C (bursting out, landing on the stack top, settling low and level), Abby@C',
  "Leaf bursts out of the gap on the seaward side, swings up in a tight turn and lands on the flat top of a lower stack. He settles there low and level, the wrists of his folded wings braced on the rock, Abby on his back, the whole of him fitting with room to spare.",
  '', 'Claws on rock; quick breaths.', 6, 0, flags=['LOW_STANCE'], tags=['BODY_MECHANICS'], diff=4)
S('X6-16', 'WS', 'static, low', 'Charcoal@top (checking above the stack), Leaf@C (crouched), shadow@all',
  'Charcoal arrives a moment later, out of his dive, and checks above the stack with one huge beat that sends the last birds wheeling. His shadow covers the whole stack and the dragon crouched on it.',
  '', 'One huge beat; birds wheeling.', 4, 0, flags=['SIZE_DISPARITY'], tags=['SCALE', 'BIRDS'], diff=4)
S('X6-17', 'MS', 'static two-shot, Remi above', 'Abby@L (on Leaf), Remi@R-top (on Charcoal)', 'Say it so he can hear.', 'X6-07 X6-08 X6-09 X6-10', 'Wind; surf below.', 0.5, 0.5)
S('X6-18', 'CU', 'static', 'Leaf@C (one eye toward Charcoal)', 'Leaf turns one eye toward Charcoal without any fear at all and flies a little higher than he needs to.', '', '', 3, 0)
S('X6-19', 'WS', 'air-to-air, long lens', 'Leaf@L (behind, near side), Charcoal@R, mist@bg', 'They turn back along the coast side by side, Leaf a little behind on the near side, as for 1D. Behind them the mist still lies against the rocks.',
  '', 'Wind.', 5, 0, set='SKY_OFF_VERDOR', flags=['SCREEN_DIRECTION'])
S('X6-20', 'EWS', 'air-to-air travel', 'Leaf@L, Charcoal@R, island@bg (harbor, town, palace)', 'Ahead, the whole island in the morning light. For a while nobody speaks. The camera travels with them, not around them.',
  '', 'Wind; the light theme.', 7, 1, set='SKY_OFF_VERDOR', tags=['OCEAN'])

# ===================================================================================================== 1F
block('X7', after='1F-04', set='COASTAL_SKY_WATER', tod='LATE MORNING', light=L_PURSUIT)
S('X7-01', 'WS', 'air-to-air, long lens, behind Charcoal', 'Scout@C (drawing away, low), Charcoal@fg', 'In a straight line the scout draws away; the gap opens with every one of its quick wingbeats.', '',
  "The scout's sharp quick beats receding.", 4, 0, flags=['CHARCOAL_NOT_FASTER', 'SCOUT_OWN_DESIGN'])
S('X7-02', 'CU', 'air-to-air', 'Remi@C', 'Remi sees that Charcoal cannot catch it like this.', 'X7-01', 'Wind.', 1.5, 0)
S('X7-03', 'WS', 'air-to-air', 'Remi@C (sitting back in the rig), Charcoal@C (climbing)', 'He sits back and shifts his weight in the rig. Charcoal climbs instead of chasing: slow, heavy, expensive wingbeats; the coast drops away.',
  '', 'Heavy beats; strain.', 5, 0, tags=['SCALE'])
S('X7-04', 'POV', 'high, looking down', 'Scout@C (small, low along the shore), coast@L, open water@R', "From up here Remi can see the whole chase laid out like a map, and where the scout must turn to reach open water.", '',
  'Wind.', 4, 0, tags=['OCEAN'])
S('X7-05', 'MS', 'air-to-air', 'Remi@C (leaning forward, flat to the rig)', 'The scout turns. Remi leans forward, flat to the rig.', '', '', 2, 0)
S('X7-06', 'WS', 'diving with Charcoal', 'Charcoal@C (wings partly folded, diving), Scout@bottom (closing)', 'Charcoal folds his wings partway and comes down the long slope of the air. The height he paid for becomes speed. The gap closes from above.',
  '', 'The wind roars.', 5, 0, tags=['SCALE'], diff=4)
S('X7-drop', 'WS', '-', '-', "(proposal shot 'The rider looks back' is played by the handoff's 1F-05)", '', '', 2.5, 0, drop='1F-05')

block('X8', after='1F-07', set='COASTAL_SKY_WATER', tod='LATE MORNING', light=L_PURSUIT)
S('X8-01', 'WS', 'air-to-air, tilting up into the sun', 'Scout@C (climbing into the sun)', 'The scout climbs hard toward the sun.', '', 'Quick beats fading into glare.', 3, 0)
S('X8-02', 'CU', 'air-to-air', 'Remi@C (squinting, shading his eyes)', 'Remi looks up after it and the glare takes it away completely. He squints and loses it.', '', '', 2.5, 0)
S('X8-03', 'WS', 'looking straight down', "Scout's shadow@C (racing across the bright water)", "On the bright water far below, a small dark shape races across the waves: the scout's shadow.", 'X8-01',
  'Wind; Remi off screen, to himself.', 3.5, 0, tags=['OCEAN'], off=['REMI'])
S('X8-04', 'WS', 'air-to-air', 'Charcoal@C (turning with the shadow), Remi@C', 'Remi leans, and Charcoal turns with the shadow, not with the glare.', '', 'A deep correcting beat.', 3, 0)
S('X8-05', 'WS', 'aerial', 'Scout@C (dropping out of the sun, running low for the outer rocks)', 'The scout, finding Charcoal still on its line, drops out of the sun and runs low for the outer rocks.', '', '', 3, 0,
  set='OUTER_ROCKS', light=L_ROCKS, tags=['OCEAN'])
S('X8-06', 'POV', 'from Charcoal\'s back', 'Gap@C (between the stacks)', 'From Charcoal\'s back, Remi sees what it is aiming for: the gap. The same gap Leaf threaded that morning.', '', '', 2.5, 0,
  set='OUTER_ROCKS', light=L_ROCKS)
S('X8-07', 'WS', 'static inside the gap', 'Scout@C (tilting through the gap)', 'The scout tilts and goes through. Charcoal cannot.', '', 'A whip of air.', 2.5, 0, set='OUTER_ROCKS', light=L_ROCKS,
  tags=['FAST_PASS'], diff=5)
S('X8-08', 'WS', 'aerial, tracking low', 'Charcoal@C (wide and low around the seaward side), stacks@L', 'Remi pulls Charcoal wide and low around the seaward side of the stacks, toward where the gap comes out. The turn is long and expensive.',
  '', 'Strain; surf.', 5, 0, set='OUTER_ROCKS', light=L_ROCKS, tags=['OCEAN', 'SCALE'])
S('X8-09', 'WS', 'static at water level', 'Water@C (flattened and torn), Seabirds@all', 'The water flattened and torn by his wingbeats; the seabirds burst off the rocks for the second time today.', '',
  'Downwash; birds.', 3, 0, set='OUTER_ROCKS', light=L_ROCKS, tags=['OCEAN', 'BIRDS', 'WATER_IMPACT'], diff=5)
S('X8-10', 'WS', 'aerial', "Scout@C (coming out of the gap), Charcoal's shadow@C (already on the water ahead)", "The scout comes out of the gap on the seaward side, exactly where Leaf came out, and Charcoal's shadow is already on the water ahead of it. The rider sees it.",
  '', '', 3.5, 0, set='OUTER_ROCKS', light=L_ROCKS, tags=['OCEAN'])
S('X8-11', 'WS', 'aerial', 'Scout@C (breaking into the mist), stacks@L, Charcoal@R', 'The scout breaks away hard into the mist. Layout readable: stacks to one side, mist ahead, Charcoal closing from the other side.', '', '', 2.5, 0,
  set='OUTER_ROCKS', light=L_ROCKS, tags=['FOG'])
S('X8-12', 'WS', 'static', 'Mist@C (the scout vanishing into it)', 'The scout enters the mist and vanishes.', '', '', 2.5, 0, set='OUTER_ROCKS', light=L_ROCKS, tags=['FOG'])
S('X8-13', 'WS', 'with Charcoal into the white', "Charcoal's wing edge@L, white@all", "Charcoal follows it in. The world turns white: no horizon, no water, no sky, only moving vapor and the dark edge of Charcoal's own wing.", '',
  'Muffled heavy beats.', 3, 0, tags=['FOG'], diff=4)
S('X8-14', 'CU', 'dragonback', 'Remi@C, Charcoal\'s head@fg (fading into white)', "Remi cannot see past Charcoal's head.", '', "Remi's breathing.", 2.5, 0, tags=['FOG'])
S('X8-15', 'MS', 'dragonback, very slow drift', 'Remi@C, white@all', "Charcoal's heavy, infrequent wingbeats, muffled. Remi's breathing. Then, somewhere off to one side, a sharper, quicker rhythm: the scout's wings. The audience cannot tell from which direction.",
  '', "Muffled beats; breathing; the scout's quicker rhythm somewhere, direction unclear.", 3.5, 1, tags=['FOG'])
S('X8-16', 'CU', 'dragonback', "Charcoal's head@C (turning), Charcoal's eye@C", "Charcoal's head turns before Remi's does. His eye moves. He has heard it.", '', '', 2.5, 0, tags=['FOG', 'BLACK_HIDE'])
S('X8-17', 'MS', 'dragonback', 'Remi@C (leaning with him)', 'Remi feels the change in the body under him and trusts it: he gives Charcoal his head and leans with him.', '', '', 1.5, 0)
S('X8-18', 'WS', 'with Charcoal', 'Charcoal@C (banking into the white)', 'Charcoal banks into the white. For a moment, nothing.', '', '', 2.5, 0, tags=['FOG'])
S('X8-19', 'WS', 'air-to-air, bursting out of the mist', 'Charcoal@top (above and behind), Scout@bottom (ahead and below), stacks@bg', "Both dragons break out of the mist into bright air just seaward of the outer rocks, Charcoal above and behind the scout, closer than at any point so far. The water under them is blinding.",
  '', 'Sudden open wind; glare.', 4, 0, set='OUTER_ROCKS', light=L_ROCKS, tags=['FOG', 'OCEAN', 'SCALE'], flags=['CHARCOAL_NOT_FASTER'], diff=5)

# 1F changed shots (C14-C17)
OVERRIDES['1F-14'] = dict(size='CU', cam='brief, follow, close',
    inframe='Scout Rider@C (helmet and face covering keep identity hidden), Scout@C (part)',
    action="The orange-red flame wraps the rider for a heartbeat. Outer cloth and leather catch; the rider screams, a raw, wordless sound loud enough to carry over the wind (the voice stays unidentifiable).",
    sound='Flame roar; the scream, wordless and unidentifiable, over the wind.', a=2.0,
    tags=['FIRE', 'CLOTH', 'SMOKE'], flags=['BURNED_RIDER_ALIVE', 'SCOUT_RIDER_UNIDENTIFIED'])
X('1F-14b', 'CU', 'brief, close, follow', 'Scout Rider@C (burned sleeve, forearm and neck; face covered)',
  "One close, brief shot shows the damage plainly: a sleeve burned away, the skin of the forearm and the side of the neck blistered raw and blackened at the edges, smoke streaming off the rider in the slipstream. Helmet and face covering still hide who it is. The rider beats out the flames with a gloved hand: conscious, moving, still strapped on.",
  '', 'Wind; hands slapping at the flames; ragged breathing.', 3.0, tags=['GORE', 'SMOKE', 'CLOTH'], flags=['BURNED_RIDER_ALIVE', 'SCOUT_RIDER_UNIDENTIFIED'], diff=5,
  realism="Burn make-up as a film would do it: glossy raw patches with blackened, crisp edges and cloth fused at the borders; smoke in the slipstream; one brief close shot in motion, then cut. The face stays covered.")
OVERRIDES['1F-15'] = dict(action='The rider remains strapped on, moving and conscious. The smaller dragon\'s turn loses coordination. Thin smoke trails.')
OVERRIDES['1F-17'] = dict(action="Charcoal catches the scout in his jaws, across the root of its LEFT wing. Teeth go through hide; something in the wing gives with a crack the audience feels. Blood sprays over Charcoal's black jaw. Fast and violent, not lingering. The scout struggles.",
    sound="Hide, equipment, bone; the scout's scream.", tags=['CREATURE_CONTACT', 'BLOOD'])
X('1F-17b', 'CU', 'dragonback, shake', 'Remi@C (face and hands spattered)', "The slipstream carries a fine spray of the scout's blood back along Charcoal's neck to Remi's face and hands.",
  '', 'Wind.', 1.5, tags=['BLOOD', 'FACE_CLOSEUP'], diff=4,
  realism='Spray as fine droplets with motion blur along the slipstream line, landing as specks and short streaks on skin and cloth; it must stay consistent (same pattern) into X10, R8 and 2B.')
OVERRIDES['1F-20'] = dict(action="WING SEPARATION. Charcoal's movement and the scout's desperate twist tear the scout's LEFT wing loose: the membrane splits, the bones snap at the shoulder, and the wing tears free in a burst of blood that the slipstream throws across the water. The wing separates against bright water and falls away on its own, turning over.",
    a=4.0, tags=['WING_SEPARATION', 'BLOOD', 'GORE'])
X('1F-20b', 'MS', 'follow from above-behind', 'Scout@C (tipping; its LEFT side toward camera)', "The torn, bleeding shoulder where the wing was, as the scout tips. A wound, not a death: it is still fighting.",
  '', 'The scout\'s cry; wind.', 1.5, tags=['GORE', 'BLOOD'], flags=['SCOUT_LEFT_WING_LOST', 'NO_DEATH_DECLARED'], diff=5,
  realism="Show the torn shoulder in motion for a second, partly in silhouette against the bright water; torn membrane edges and blood, no dwelling. Do not suggest arterial pumping: the scout's fate is not decided here.")
OVERRIDES['1F-21'] = dict(action="Remi's reaction, the scout's blood running on his face.")
OVERRIDES['1F-27'] = dict(action="Then movement: the rider's secured form remains with the dragon and is still moving. The dragon makes a weak effort to keep itself above water. A red stain in the water around the scout's torn shoulder. Their future is not decided.",
    a=6.0, tags=['WATER_IMPACT', 'OCEAN', 'BLOOD'])
OVERRIDES['1E-03'] = dict(inframe="Leaf@L-fg, Abby@L-fg, Scout (small, fast; its own design)@R-to-L (mid-ground: through the gap between Leaf and Charcoal, along Leaf's LEFT/seaward side = the far side from camera), Scout Rider (silhouette), Charcoal@R-bg",
    action="THE PASS. Coming head-on from ahead, the scout, a small dragon, cuts through the gap between Leaf and Charcoal, passing close along Leaf's LEFT (seaward) side, the far side from this inland camera, at terrifying speed. The camera is slightly high so the gap and the near miss read. The rider is only a strapped silhouette. No weapon, no contact. Violent wake.")
OVERRIDES['1F-01'] = dict(action='Establish all three paths once. Charcoal turns to intercept; he is not the faster dragon and closes through position, not speed.')
OVERRIDES['1B-04'] = dict(inframe='Leaf@L (crouched low and level), Abby@L-fg, Charcoal@far-R (part)',
    action='Farther across the field, Leaf crouches low, belly near the grass, his two legs folded under the middle of his body, the wrists of his folded wings on the ground in front of him; Abby in front of him straightens riding equipment.')
OVERRIDES['2C-20'] = dict(sound='Field ambience; Leaf\'s breathing.')
OVERRIDES['2C-21'] = dict(action="Charcoal lies still, breathing slowly, the scout's blood dried dark on his lower jaw and throat. The calm that was amusing in the sky is more complicated now.",
    sound='Slow breathing; a fly.')

block('X9', after='1F-33', set='VERDOR_AERIAL', tod='LATE MORNING', light=L_HARBOR)
S('X9-01', 'MS', 'air-to-air', "Abby@C (right hand on the strap, LEFT arm pulled in), Leaf@C (low and careful)", "Abby's right hand holding the strap, knuckles pale; her left arm pulled in tight. Leaf flies low and carefully, keeping his back as level as he can under her.",
  '', "Leaf's careful beats; her breath.", 4, 0, tags=['HANDS_CONTACT'])
S('X9-02', 'CU', 'air-to-air', 'Abby@C (head sinking, then lifting)', 'Her head sinks toward his neck; her eyes start to close. She makes herself lift her head.', 'X9-01', 'Wind.', 3, 0, tags=['FACE_CLOSEUP'])
S('R4-01', 'WS', 'static on deck', "Crew (off-watch, four)@C (on coiled rope, ale jug and dice), Ship's Master@R (at the rail, pipe going)",
  "On the Santa Maria's deck, in the shade of a furled sail, the off-watch crew sit on coiled rope around a jug of ale and a cup of dice. The SHIP'S MASTER leans on the rail with his pipe going and watches them lose their wages to each other.",
  '', 'Dice in a cup; laughter; rigging creak.', 5, 0, unit='R4', set='SANTA_MARIA_DECK', tags=['PROP_DRINK_SMOKE', 'CROWD_SMALL', 'SMOKE'], flags=['NO_CHILD_IN_FRAME'])
S('X9-03', 'MS', 'static at the masthead', 'Lookout@C (turning at the sound)', "The LOOKOUT at the masthead turns at the sound of Leaf's wingbeats, which are wrong, too quick and too uneven, and sees the green dragon low over the harbor, alone, his rider bent over the saddle.",
  'X9-02', 'Wrong, uneven wingbeats.', 3.5, 0, set='SANTA_MARIA_DECK')
S('X9-04', 'WS', 'static on deck', "Ship's Master@C (looking up), quay@bg (work stopping)", "On deck, the SHIP'S MASTER looks up. Along the quay, work stops.", 'X9-03', 'Work sounds stopping.', 3, 0,
  set='SANTA_MARIA_DECK', tags=['CROWD_SMALL'])
S('X9-05', 'MS', 'static', "Ship's Master@C (looking out to sea, then at his crew)", 'Nobody on the quay can answer. The master looks out to sea, toward the outer rocks, then at his crew.', 'X9-04', '', 2.5, 0.5,
  set='SANTA_MARIA_DECK')
S('R5-01', 'INS', 'static', 'Ale jug@C (at the crew\'s feet)', "The master's eye falls on the jug at the crew's feet.", 'R5-01', '', 1.5, 0, unit='R5', set='SANTA_MARIA_DECK',
  tags=['PROP_DRINK_SMOKE'], flags=['NO_CHILD_IN_FRAME'], off=["SHIP'S MASTER"])
S('R5-02', 'MS', 'static', 'Crew@C (corking the jug, pocketing the dice)', 'The jug is corked. The dice go into a pocket. Nobody argues.', '', 'Cork; dice.', 2.5, 0, unit='R5', set='SANTA_MARIA_DECK',
  tags=['PROP_DRINK_SMOKE', 'CROWD_SMALL'], flags=['NO_CHILD_IN_FRAME'])
S('X9-06', 'WS', 'static, from the street', 'Leaf@C (low over the roofs), Abby@C, townspeople@bottom (not waving)', 'Leaf passes low over the roofs toward the riding grounds. Nobody waves.', '', "Leaf's uneven beats over the roofs.", 4, 0,
  set='VERDOR_HARBOR', tags=['CROWD_SMALL'])

# ===================================================================================================== 2A
block('R6', after='2A-02', set='VERDOR_GROUNDS', tod='DAY', light=L_GROUNDS_DAY)
S('R6-01', 'MS', 'static', 'Keeper@C (seeing Abby hunched over the saddle)', 'A keeper sees Abby hunched over the saddle.', 'R6-01', 'Under his breath.', 0.5, 0)

block('X10', after='2A-11', set='SKY_OFF_VERDOR', tod='DAY', light=L_PURSUIT)
S('X10-01', 'WS', 'air-to-air, long lens', 'Charcoal@C (alone, slow even beats), Remi@C, coast@bg', 'Above the coast, Remi on Charcoal, alone, coming home. The speed has gone out of everything.', '', 'Slow, even beats; wind.', 4, 0)
S('X10-02', 'CU', 'dragonback', "Remi's hands@C (on the riding rig, shaking)", "Close on Remi's hands on the riding rig. They are shaking. He looks at them as if they belonged to someone else.", '', '', 3, 0, tags=['HANDS_CONTACT'])
S('X10-03', 'CU', 'dragonback', "Remi's hands@C (gripping harder)", 'He grips harder to make them stop. They do not.', '', '', 2.5, 0, tags=['HANDS_CONTACT'])
S('R7-01', 'CU', 'dragonback, slow push', "Remi@C (knuckles, sleeves, neck, face)", "The scout's blood is drying dark and tacky in the creases of his knuckles and under his nails; more on his sleeves, spattered up his neck and across his face. He wipes his face with the back of his wrist and only spreads it.",
  '', 'Wind.', 4, 0.5, unit='R7', tags=['BLOOD', 'FACE_CLOSEUP', 'HANDS_CONTACT'], diff=4,
  realism='Drying blood is darker and browner than fresh, matte at the edges and still glossy in the creases; the wrist-wipe leaves a smear that must match R8 and 2B.')
S('X10-04', 'MS', 'dragonback', 'Remi@C (looking back), outer rocks@bg (small, dark)', 'He looks back once toward the outer rocks: only a dark cluster on the bright water. He cannot see where the pair came down.', '', '', 3, 0.5)
S('X10-05', 'WS', 'static from the quay', "Townspeople@bottom (stopping, looking up), Santa Maria@C (deck crew looking up), Charcoal@top", "As he passes over the harbor, people on the quay and on the Santa Maria's deck stop and look up at him. Remi sees the ship and keeps it in mind.",
  '', 'Harbor sounds dropping away.', 3.5, 0, set='VERDOR_HARBOR', light=L_HARBOR, tags=['CROWD_SMALL'])
S('X10-06', 'POV', 'descending', 'Launch scar@C, Leaf@C, Keepers@C, Abby@C (standing)', "His view as they descend: the torn launch scar, Leaf, a small knot of keepers, and in the middle of them a figure in a muted green outer layer, upright. Standing.",
  '', 'Wind easing.', 5, 0, set='VERDOR_GROUNDS', light=L_GROUNDS_DAY)
S('X10-07', 'CU', 'dragonback', 'Remi@C (letting out a breath)', 'Remi lets out a breath he has been holding since the pass.', 'X10-01', '', 1.5, 1, tags=['FACE_CLOSEUP'])
S('X10-08', 'MS', 'dragonback', "Remi@C (hand flat on Charcoal's neck)", "He leans forward and puts his hand flat on Charcoal's neck, then shifts his weight and turns him, gently, toward the far side of the field.", '', '', 3, 0,
  tags=['HANDS_CONTACT'])
S('X10-09', 'WS', 'static from the field', 'Charcoal@C (wide, careful descent, well away from Abby and Leaf)', 'Charcoal adjusts his wings and begins a wide, careful descent, well away from Abby and Leaf.', '', 'Heavy beats, slowing.', 4, 0,
  set='VERDOR_GROUNDS', light=L_GROUNDS_DAY, tags=['SCALE'])

block('R8', after='2A-14', set='VERDOR_GROUNDS', tod='DAY', light=L_GROUNDS_DAY)
S('R8-01', 'MS', 'static, low', "Charcoal (jaw and throat)@C, Keepers@L (stopping where they are)", "Charcoal's lower jaw and the scales of his throat are dark and wet with the scout's blood. The keepers nearest him stop where they are.",
  '', 'The field goes quiet.', 4, 0, tags=['BLOOD', 'BLACK_HIDE'], diff=4,
  realism='Blood on black scales reads by its sheen, not its colour: let a raking sky light catch the wet patches; drips gather on the lower lip scales.')
S('R8-02', 'MS', 'tracking with Remi', 'Remi@C (taking a keeper\'s cloth, scrubbing his face as he crosses), Keeper@L (holding out the cloth)',
  "Remi's face and hands are streaked with it. A keeper holds out a cloth as he passes; Remi takes it without looking and scrubs at his face as he crosses to Abby. It gets most of it. Streaks stay at his hairline and down his neck; his hands and sleeves are still dark with it.",
  '', 'Fast footsteps; cloth on skin.', 3.5, 0, tags=['BLOOD', 'FACE_CLOSEUP'])
S('R8-03', 'CU', 'static', 'Abby@C (eyes going to his hands)', "Abby's eyes go to his hands and stay there. She does not ask. He does not explain.", '', '', 2, 0.5, tags=['FACE_CLOSEUP'])

# ===================================================================================================== 2B
block('R8b', after='2B-04', set='TREATMENT_ROOM', tod='DAY (interior)', light=L_ROOM)
S('R8b-01', 'CU', 'static', 'Alexandria@C (her look on Remi), Remi@R-bg (soft)', 'Her look finds the blood on him, sees that he is standing and steady, and goes back to her daughter.', '', '', 2.5, 0,
  tags=['FACE_CLOSEUP'])

# ===================================================================================================== 2C
block('X11', after='2C-06', set='TREATMENT_ROOM', tod='DAY', light='Doorway: interior warm, exterior daylight beyond; coast visible through the nearby opening (same as 2C).')
S('X11-01', 'MS', 'static', 'Remi@C (a step after the messenger, turning back), Alexandria@L', 'As the messenger goes, Remi takes a step after him, then turns back to his mother.', '', 'The messenger\'s fading steps.', 2.5, 0)
S('X11-02', 'MS', 'static two-shot', 'Remi@R, Alexandria@L', 'He wants to guide the ship himself; she refuses.', 'X11-01 X11-02 X11-03 X11-04', '', 0.5, 0)
S('X11-03', 'CU', 'static', 'Remi@C', 'He cannot tell how she means it.', '', '', 1.5, 1, tags=['FACE_CLOSEUP'])
S('X11-04', 'MS', 'static', 'Alexandria@L (looking him over), Remi@R', 'In the doorway, Alexandria looks him over the way she looked at Abby: face first, then hands, then the rest of him.', '', '', 3, 0)
S('X11-05', 'MS', 'static two-shot', 'Alexandria@L, Remi@R', 'Are you hurt?', 'X11-05 X11-06 X11-07', '', 0.5, 0.5)
S('X11-05b', 'MS', 'static, closer', "Alexandria@L (wiping his hairline, neck and hands with a cloth), Remi@R, bowl@C (water turning pink)",
  "None of the blood on him is his. She takes a cloth from the healer's bowl and wipes what is left of it from his hairline and neck herself, then his hands, without a word, the way she has not done since he was small. The water in the bowl turns pink.",
  '', 'Water; cloth.', 5.0, 0, tags=['BLOOD', 'HANDS_CONTACT', 'FACE_CLOSEUP'], note='C20.')
S('X11-06', 'CU', 'static', 'Alexandria@L (touching his face), Remi@R', 'Then she touches his face once, briefly, and lets him go back to his sister.', '', '', 4, 0.5, tags=['FACE_CLOSEUP', 'HANDS_CONTACT'])

block('R9', after='2C-11', set='SANTA_MARIA_DECK', tod='DAY', light=L_HARBOR)
S('R9-01', 'MS', 'static on deck', "Ship's Master@C (pipe in his teeth, pouring the ale over the side), Sailor@R, Crew@bg",
  "The SHIP'S MASTER hears the order out with his pipe in his teeth. When the messenger has gone, he picks up the crew's ale jug, pulls the cork and pours the ale over the side.",
  '', 'Ale splashing into the harbor; gulls.', 5, 0, tags=['PROP_DRINK_SMOKE', 'SMOKE'], flags=['NO_CHILD_IN_FRAME'])
S('R9-02', 'MS', 'static two-shot', "Sailor@L, Ship's Master@R", 'A dark joke; it decides nothing about the retrieval.', 'R9-01 R9-02', 'Rope; gulls.', 0.5, 0.5, flags=['NO_CHILD_IN_FRAME'])

block('X12', after='R9', set='TREATMENT_ROOM', tod='DAY', light=L_ROOM)
S('X12-01', 'WS', 'static', "Abby@C (seated), Alexandria@L (at Abby's RIGHT side, holding her right hand), Healer@R (cloth and support ready), Remi@L-bg (against the wall by the door)",
  "The healer has cloth and a support ready. Alexandria has come back in and sits at Abby's RIGHT side, holding her right hand. Remi stands against the wall near the door, where the healer put him.",
  '', 'Room tone.', 4, 0)
S('X12-02', 'MS', 'static', 'Abby@C, Healer@R', 'Bravery, without technique.', 'X12-01 X12-02 X12-03 X12-04', '', 0.5, 0)
S('X12-03', 'MS', 'static', 'Healer@R (glancing), Alexandria@L (one small nod)', 'The healer glances at Alexandria. Alexandria gives one small nod.', '', '', 2, 0)
S('X12-04', 'CU', 'static', "Abby@C (face), joined hands@bottom; Healer's movement@R (out of focus)",
  "Stay on Abby's face and the two joined hands. The healer's movement happens at the edge of frame, out of focus. No procedure, no bone, no close-up of the arm. Abby's cry is short and sharp and cut off by her own breath.",
  '', "Abby's short cry (non-verbal, recorded); the room.", 3.5, 1, tags=['FACE_CLOSEUP'], diff=4,
  realism="The pain is acted, not shown: eyes squeeze, breath catches, jaw locks; shallow depth of field so the healer's action stays a blur. Human recording for the cry.")
S('X12-05', 'INS', 'static', "Abby's and Alexandria's hands@C", "Her grip on her mother's hand goes white.", '', '', 1.5, 0, tags=['HANDS_CONTACT'])
S('X12-06', 'MS', 'static', 'Remi@C (against the wall)', 'Remi flinches as if he were the one hurt and turns his face to the wall. Then he makes himself turn back and look.', '', '', 3.5, 0)
S('X12-07', 'MS', 'static two-shot', 'Abby@C, Healer@R', 'You didn\'t count.', 'X12-05 X12-06 X12-07 X12-08', '', 0.5, 0)
S('X12-08', 'CU', 'static', "Abby@C (almost laughing), Alexandria's hand@top (on her hair)", "Abby almost laughs and thinks better of it. Alexandria's free hand rests for a moment on her daughter's hair.", '', '', 2.5, 0.5,
  tags=['FACE_CLOSEUP', 'HANDS_CONTACT'])
S('X12-09', 'MS', 'static', 'Healer@R (binding the arm, broad action)', 'The healer begins to bind and support the arm.', '', 'Cloth.', 2.5, 0)
S('X12-10', 'MS', 'static', 'Young Attendant@L-bg (in the doorway, stopping), Alexandria@L', 'The YOUNG ATTENDANT appears in the doorway and stops, seeing what kind of room this is. Alexandria reads her face.', 'X12-09 X12-10', '', 3, 0)
S('X12-11', 'CU', 'static', 'Abby@C (turning toward the door)', 'Abby turns her head toward the doorway. She remembers the gold shape in the shell.', '', '', 2, 0.5)
S('X12-12', 'MS', 'static', 'Abby@C, Alexandria@L, Healer@R, Remi@L-bg', 'Abby sends her mother.', 'X12-11 X12-12 X12-13 X12-14 X12-15 X12-16', '', 1, 0)
S('X12-13', 'WS', 'static', 'Alexandria@L (rising, leaving with the young attendant)', 'Alexandria releases Abby\'s hand and rises. She leaves with the young attendant. She does not hurry until she is past the door.', '', 'Door.', 3, 0)
S('X12-14', 'MS', 'static', 'Healer@R, Remi@L (sitting)', 'Remi sits.', 'X12-17', '', 2, 0)

block('X13', after='R9', set='PALACE_CORRIDOR', tod='DAY', light=L_CORRIDOR)
S('X13-01', 'WS', 'tracking', 'Alexandria@C (walking quickly), Young Attendant@R (a step behind)', 'A palace corridor. Alexandria walks quickly toward the birthing chamber.', '', 'Steps.', 4, 0)
S('X13-02', 'MS', 'static', "Alexandria@C (a hand flat on the wall), Young Attendant@R-bg", 'At a turn where no one else can see, she stops for one breath with a hand flat against the cool stone. Her face does not break. It simply stops performing for a moment.',
  '', 'One breath.', 3.5, 1.5, tags=['FACE_CLOSEUP', 'HANDS_CONTACT'], realism='The beat is stillness: no tears, no tremble; the face relaxes from its composure for one breath and is put back.')
S('X13-03', 'WS', 'static', 'Alexandria@C (walking on)', 'Then she walks on. The young attendant has seen it and will never mention it.', '', '', 2.5, 0)
S('X13-04', 'WS', 'static', 'Hatchling@C (curled in the bedding), nest@C', 'The birthing chamber. The light has moved since the morning. The hatchling lies curled, dry now, its gold softer than when it was wet. It does not glow.', '',
  'Shallow quick breathing.', 4, 0, set='BIRTHING_CHAMBER', light=L_CHAMBER_DAY, tags=['GOLD_MATERIAL'])
S('X13-05', 'CU', 'static', 'Hatchling@C (breathing)', 'Its breathing is shallow and quick. It looks smaller than it did this morning, the way exhausted young animals do.', '', '', 4, 0,
  set='BIRTHING_CHAMBER', light=L_CHAMBER_DAY, tags=['GOLD_MATERIAL'], diff=4)
S('X13-06', 'INS', 'static', 'Bowls@C (water and soft food, barely touched)', 'A shallow bowl of water and a bowl of soft prepared food sit beside the nest, barely touched (food kept generic).', 'X13-01', '', 2, 0,
  set='BIRTHING_CHAMBER', light=L_CHAMBER_DAY, off=['YOUNG ATTENDANT'])
S('X13-07', 'MS', 'static', 'Alexandria@R (lowering herself beside the nest), Young Attendant@L', 'Alexandria lowers herself beside the nest, as she did that morning.', 'X13-02', '', 2.5, 0,
  set='BIRTHING_CHAMBER', light=L_CHAMBER_DAY)
S('X13-08', 'INS', 'static', 'Cloth@C (dipped in water)', 'She dips one corner of a folded cloth in the water.', '', 'Water.', 3, 0, set='BIRTHING_CHAMBER', light=L_CHAMBER_DAY, tags=['HANDS_CONTACT'])
S('X13-09', 'CU', 'static', "Cloth@C (held near the hatchling's mouth), Hatchling@C", 'She holds it near its mouth. Nothing. She does not push it closer. She waits.', '', '', 3, 1.5,
  set='BIRTHING_CHAMBER', light=L_CHAMBER_DAY, tags=['GOLD_MATERIAL'])
S('X13-10', 'INS', 'static macro', 'Cloth corner@C (a drop gathering)', 'A single drop gathers at the corner of the cloth.', '', '', 2.5, 0, set='BIRTHING_CHAMBER', light=L_CHAMBER_DAY)
S('X13-11', 'INS', 'static macro', 'Drop@C, Hatchling mouth@C', "The drop falls against the hatchling's closed mouth.", '', '', 2, 0, set='BIRTHING_CHAMBER', light=L_CHAMBER_DAY, tags=['GOLD_MATERIAL'])
S('X13-12', 'CU', 'static', 'Hatchling@C (still)', 'A pause long enough to make the audience hold its breath.', '', '', 0, 2, set='BIRTHING_CHAMBER', light=L_CHAMBER_DAY)
S('X13-13', 'CU', 'static', 'Hatchling@C (licking at the wet)', 'A tiny movement: the hatchling licks at the wet.', 'X13-03 X13-04', '', 2.5, 0, set='BIRTHING_CHAMBER', light=L_CHAMBER_DAY,
  tags=['HATCHLING_SOFTBODY', 'GOLD_MATERIAL'], off=['YOUNG ATTENDANT', 'ALEXANDRIA'])
S('X13-14', 'MS', 'static', 'Alexandria@R, Hatchling@C (head shifting toward the cloth)', 'She wets the cloth again. This time the hatchling\'s head shifts toward it before it arrives.', 'X13-05', '', 3, 0,
  set='BIRTHING_CHAMBER', light=L_CHAMBER_DAY)
S('X13-15', 'MS', 'static', 'Alexandria@R (feeding it), Young Attendant@L (watching the queen\'s hands)', 'She keeps feeding it in small, patient amounts. The young attendant watches the queen\'s hands, not her face.', 'X13-06', '', 4, 0,
  set='BIRTHING_CHAMBER', light=L_CHAMBER_DAY, tags=['HANDS_CONTACT'])
S('X13-16', 'CU', 'static', 'Alexandria@C', 'Alexandria looks at the small gold body against the bedding. Hold on her face for a beat, as the 1A line was held; no music telling the audience what to feel.', 'X13-07', '', 2, 1.5,
  set='BIRTHING_CHAMBER', light=L_CHAMBER_DAY, tags=['FACE_CLOSEUP'])
S('X13-17', 'CU', 'static', 'Hatchling@C (pushing up, legs folding, slumping)', 'The hatchling tries to push itself up toward the cloth. Its legs fold under it and it slumps back into the bedding.', '', '', 3, 0,
  set='BIRTHING_CHAMBER', light=L_CHAMBER_DAY, tags=['HATCHLING_SOFTBODY', 'GOLD_MATERIAL'], diff=5)
S('X13-18', 'MS', 'static', 'Young Attendant@L (reaching in), Alexandria@R (a small raised hand)', 'The young attendant reaches in to help. Alexandria stops the gesture with a small raised hand, as she stopped the older attendant\'s bow that morning.', 'X13-08', '', 2, 0,
  set='BIRTHING_CHAMBER', light=L_CHAMBER_DAY)
S('X13-19', 'CU', 'static', 'Hatchling@C (head up, trembling)', 'It tries again. This time it gets its head up and holds it there, trembling, for three breaths, before it settles. It is not much. It is more than before.', '', '', 4, 1,
  set='BIRTHING_CHAMBER', light=L_CHAMBER_DAY, tags=['HATCHLING_SOFTBODY', 'GOLD_MATERIAL'], diff=5)
S('X13-20', 'MS', 'static', 'Alexandria@R (handing the cloth back), Young Attendant@L', 'She hands the cloth back.', 'X13-09 X13-10 X13-11', '', 1.5, 0, set='BIRTHING_CHAMBER', light=L_CHAMBER_DAY)
S('X13-21', 'WS', 'static', 'Alexandria@L-bg (at the door, looking back), Hatchling@C', 'She rises. At the door she looks back once, the way Abby looked back that morning. The hatchling\'s side rises and falls.', '', 'Breathing.', 4.5, 1,
  set='BIRTHING_CHAMBER', light=L_CHAMBER_DAY)

block('X14', after='R9', set='CLING_ROAD', tod='MIDDAY', light=L_CLING_NOON)
S('X14-01', 'EWS', 'static, high', 'Road@C, Country people@all (walking and riding toward the village, carts, baskets, children)', 'The broad road outside Cling. Country people walk and ride toward the village with baskets, goods and children. Dust lifts gently behind the carts.',
  '', 'Cart wheels; voices; a dog.', 5, 0, tags=['CROWD', 'DUST'], diff=5)
S('X14-02', 'WS', 'static', 'Gate@C (half open, wedged against a wheel), Farm cart@C (Adult Villager driving, Partner, two small children among the baskets)',
  'The gate onto the broad road stands half open. A farm cart driven by an ADULT VILLAGER comes through, a PARTNER and two small children among the baskets. The gate swings back and wedges against the wheel. The children lean out to look.',
  '', 'Wheel thud; the gate.', 4.5, 0, tags=['BODY_MECHANICS'])
S('X14-03', 'MS', 'static', 'Guard@C (shoulder to the gate)', 'A GUARD puts his shoulder to the gate. It scrapes and drags on its hinge.', '', 'Iron scraping.', 2.5, 0, tags=['BODY_MECHANICS'])
S('X14-04', 'MS', 'static two-shot', 'Adult Villager@L (on the cart), Guard@R', 'Banter at the gate.', 'X14-01 X14-02', '', 0.5, 0)
S('X14-05', 'WS', 'static', 'Guard@R, Adult Villager@L, Farm children (two)@C (watching the guard over the back of the cart)', 'They heave together. The gate gives and the cart rolls through. The villager raises a hand in thanks. The two children watch the guard over the back of the cart until the crowd closes behind them.',
  '', 'Gate; cart; crowd.', 5, 0, set='CLING_SQUARE', tags=['CROWD_SMALL', 'BODY_MECHANICS'])
S('X14-06', 'WS', 'static', 'Parent@C (carrying the parcel), Child@C, stone arch@bg', 'The stone arch. The PARENT and the CHILD come through it from the houses beyond, the parent carrying the parcel. A few steps from the square, the child looks up.', '', '', 3.5, 0,
  set='CLING_SQUARE')
S('X14-07', 'MS', 'static two-shot', 'Child@L, Parent@R', 'Now?', 'X14-03 X14-04', '', 0.5, 0, set='CLING_SQUARE')
S('X14-08', 'MS', 'tracking with the child', 'Child@C (carrying the parcel with both arms), Parent@R-bg', 'The child carries the parcel the last stretch into the square with enormous care, both arms around it, then hands it back at the edge of the crowd, satisfied.', '', '', 5, 0.5,
  set='CLING_SQUARE', tags=['BODY_MECHANICS'])
S('X14-09', 'WS', 'static', "Square@all (busier, banners, empty shared table, stalls open), Guards (two)@C (setting a plain seat at the top of the steps)", 'The square at midday, fuller and busier: more banners, the shared table set out but empty, stalls open. Two guards carry a plain seat up the steps and set it at the top for the king.',
  '', 'Busier square.', 5.5, 0, set='CLING_SQUARE', tags=['CROWD', 'CLOTH'], flags=['CLING_ROUTES'], diff=5)
S('X14-10', 'WS', 'tracking with him', 'Guard Captain@C (checking the steps, the arch, the gate)', 'The GUARD CAPTAIN walks the square checking things: the steps, the arch, the gate, the room the crowd will have to move.', '', '', 4.5, 0,
  set='CLING_SQUARE', tags=['CROWD_SMALL'], flags=['CLING_ROUTES'])
S('X14-11', 'MS', 'static', "Guard Captain@C (looking up past the banners), Watchman@top", "He stops below the watchman's post and looks up past the banners strung across the square.", '', '', 2, 0, set='CLING_SQUARE')
S('X14-12', 'MS', 'static two-shot, low', 'Guard Captain@L, Watchman@R-top', 'Mostly isn\'t seeing.', 'X14-05 X14-06 X14-07', '', 0.5, 0, set='CLING_SQUARE')
S('X14-13', 'MS', 'static', 'Watchman@top (shrugging), Guard Captain@C (filing it away)', 'The watchman shrugs. The captain looks at the line of banners for a moment, filing it away, and walks on.', '', '', 3.5, 0, set='CLING_SQUARE')
S('X14-14', 'WS', 'static', 'Old Woman@C, ring of children@C (practising the stepping dance), fountain@bg', 'Near the fountain, an OLD WOMAN teaches a ring of children the stepping dance, clapping the rhythm and stopping them when they rush it.', '', 'Clapping; children\'s feet.', 4.5, 0,
  set='CLING_SQUARE', tags=['CROWD_SMALL', 'BODY_MECHANICS'])
S('X14-15', 'MS', 'static', 'Child@C (rushing, treading on heels), Old Woman@R (stepping it through with the child)', 'The child from the arch runs to join them, keeps rushing, and treads on the next child\'s heels. The old woman takes the child\'s hands and steps the pattern through once, slowly: step, step, turn.',
  '', '', 5, 0, set='CLING_SQUARE', tags=['BODY_MECHANICS', 'HANDS_CONTACT'])
S('X14-16', 'MS', 'static', 'Old Woman@R, children@C', 'They try again, together this time, more or less. The child concentrates hard.', 'X14-08', '', 3.5, 0, set='CLING_SQUARE', tags=['CROWD_SMALL'])
S('X14-17', 'MS', 'static', 'Musician@C (on the fountain rim, playing)', 'From the fountain\'s rim, the musician plays them a few bars to dance to.', '', 'A few bars of the dance tune.', 2.5, 0, set='CLING_SQUARE', tags=['INSTRUMENT_ANIM'])

block('R9b', after='2C-12', set='TREATMENT_ROOM', tod='DAY', light='Same as 2B; slightly later.')
S('R9b-01', 'INS', 'static', "Remi's hands@C (clean, red from scrubbing), healer's bowl@R (pink water, wrung-out cloth)", "Remi's hands are clean now and red from scrubbing. The healer's bowl beside him holds pink water and a wrung-out cloth. He turns his hands over once, checking under the nails, then lets them rest.",
  '', 'Quiet room.', 3, 0, tags=['HANDS_CONTACT', 'BLOOD'])

block('X15', after='2C-21', set='VERDOR_GROUNDS', tod='AFTERNOON', light=L_GROUNDS_PM)
S('X15-01', 'WS', 'static', "Charcoal@C (lying low and level), Keepers@C (on ladders, lowering the saddle on ropes), wheeled stand@L", "Keepers on ladders lower Charcoal's heavy saddle on ropes to a wheeled stand. Charcoal shifts his weight to let the last straps come free without being asked.",
  '', 'Ropes; buckles; a huge exhale.', 5, 0, tags=['SCALE', 'BODY_MECHANICS', 'BLACK_HIDE'], diff=4)
S('X15-02', 'WS', 'static', 'Remi@C (crossing the field, taking a rope), Keepers@R', 'Remi comes out of the building, crosses the field and takes a rope with them. Nobody tells him he does not need to.', '', '', 4, 0, tags=['BODY_MECHANICS'])
S('X15-03', 'INS', 'static', 'Front straps@C (soot, and over it a crust of blood), Keeper\'s thumb@C', "As the rig comes down, the front straps show a dark smear of soot from Charcoal's own fire, and over it a crust of blood that is not his. A keeper rubs at it with his thumb, looks at his thumb, and stops.",
  '', 'Leather.', 4.0, 0.5, tags=['BLOOD', 'HANDS_CONTACT'], note='C24 adds 1 s to the proposal shot.')
S('X15-04', 'MS', 'static', "Keepers@L (with buckets and cloths, slowing down at Charcoal's head), Charcoal (head)@R", 'Keepers with buckets and cloths come to Charcoal\'s head and slow down. Nobody moves first. They have heard what his jaws did this morning.', '', '', 3.5, 0.5,
  tags=['BLACK_HIDE'])
S('X15-05', 'MS', 'static', "Remi@L (washing Charcoal's jaws), Charcoal (head, lowered)@R", "Remi takes a bucket and a cloth and washes Charcoal's jaws himself, carefully, along the outside of the lips only, never into the mouth. Charcoal lowers his head to make it easier.",
  '', 'Water; cloth on scales.', 5, 0, tags=['HANDS_CONTACT', 'BLOOD', 'BLACK_HIDE'])
S('X15-06', 'INS', 'static', 'Grass@C (water running off red, then pink, then clear)', 'The water runs off into the grass red, then pink, then clear.', '', 'Trickle.', 2.5, 0, tags=['BLOOD', 'GRASS'])
S('X15-06b', 'CU', 'static', "Charcoal's lip and two great teeth@C, Remi's fingers@C (working a torn strip of membrane free)", "Caught between two of the great teeth at the lip is a torn strip of the scout's wing membrane. Remi works it free with his fingers, looks at it, and drops it into the bucket.",
  '', 'A wet tug; the strip dropping into water.', 4.0, 0, tags=['GORE', 'HANDS_CONTACT', 'BLACK_HIDE'], diff=4, note='C25 picture added to the proposal.',
  realism='A practical-looking prop: thin, translucent grey-green membrane with a torn edge and a little blood; short, matter-of-fact handling, then away.')
S('X15-07', 'MS', 'static two-shot', 'Ground Keeper@L, Remi@R', 'He let you.', 'X15-01 X15-02', '', 0.5, 0)
S('X15-08', 'MS', 'static', "Remi@C (holding the empty bucket, looking at the great jaw)", 'He stands holding the empty bucket, looking at the great jaw, for longer than he needs to.', '', '', 2.5, 1)
S('R10-01', 'WS', 'static', 'Ground Keeper@C (walking back to another keeper), Keeper@R (taking a flask from his coat)', 'The GROUND KEEPER leaves the prince to it and walks back to where another keeper stands watching. That keeper takes a flask from inside his coat, drinks and passes it over. Remi is out of this shot.',
  '', '', 4, 0, unit='R10', tags=['PROP_DRINK_SMOKE'], flags=['NO_CHILD_IN_FRAME'])
S('R10-02', 'MS', 'static two-shot', 'Ground Keeper@L, Keeper@R', 'Dark humor, voices kept down.', 'R10-01 R10-02', '', 0.5, 0, unit='R10', flags=['NO_CHILD_IN_FRAME'])
S('R10-03', 'MS', 'static', 'Ground Keeper@C (drinking, longer than he meant to)', 'The ground keeper drinks, longer than he meant to, and hands the flask back.', '', '', 1.5, 0.5, unit='R10', tags=['PROP_DRINK_SMOKE'], flags=['NO_CHILD_IN_FRAME'])
S('X15-09', 'WS', 'static', 'Charcoal@C (eating slowly from the feed cart), Keepers@L (watching)', 'Keepers wheel the feed cart over. Charcoal eats slowly and calmly, exactly as he would on any other day. The keepers watch him eat. Nobody says anything.', '', 'Chewing; cart.', 4.5, 0.5,
  tags=['BLACK_HIDE'])

block('X16', after='2C-21', set='SANTA_MARIA_DECK', tod='AFTERNOON', light=L_HARBOR_PM)
S('X16-01', 'MS', 'tracking along the deck', "Ship's Master@C (touching coiled rope, canvas, the ship's boat)", "The preparations are nearly finished. The SHIP'S MASTER walks the deck checking each thing with a touch rather than a speech: coiled rope, folded canvas, the ship's boat lashed ready to lower.",
  '', 'Deck creak; rope.', 4, 0, tags=['HANDS_CONTACT'])
S('X16-02', 'MS', 'static', "Ship's Master@C", 'Cast off.', 'X16-01', 'Shouted.', 0.5, 0)
S('X16-03', 'MS', 'static on the quay', 'Lines@C (thrown off the bollards), Crew@C', 'Lines thrown off the bollards.', '', 'Rope thump.', 3, 0, set='VERDOR_HARBOR', tags=['CROWD_SMALL'])
S('X16-04', 'WS', 'static', 'Crew@C (pushing the hull away with long poles), Santa Maria@C', 'Crew push the hull away from the quay with long poles.', '', 'Poles on stone; water.', 3.5, 0, set='VERDOR_HARBOR', tags=['BODY_MECHANICS', 'OCEAN'])
S('X16-05', 'WS', 'static, low', 'First sail@C (dropping and filling)', 'The first sail drops and fills.', '', 'Canvas cracks full.', 3.5, 0, tags=['CLOTH'], diff=4)
S('X16-06', 'EWS', 'static from the quay end', 'Santa Maria@C (sliding past the end of the harbor wall)', 'The ship slides past the end of the harbor wall. Cut away as she clears the wall; do not follow her out to sea.', '', 'Water along the hull; a bell.', 4.5, 0,
  set='VERDOR_HARBOR', tags=['OCEAN', 'CLOTH'])
S('X16-07', 'WS', 'static', 'Townspeople@L (stopping work to watch), Working dragon@C (crouched beside its fishing crew, turning its head)', 'People on the quay stop work to watch. The working dragon crouched beside its fishing crew turns its head to follow the ship.', '', 'Quiet quay.', 3.5, 0,
  set='VERDOR_HARBOR', tags=['CROWD_SMALL'], flags=['LOW_STANCE'])
S('X16-08', 'MS', 'static', 'Instructor@C (watching the ship go, then clapping once), Young riders@bg', 'On the field above the harbor, an INSTRUCTOR watches the ship go, then claps his hands once.', 'X16-02', 'One clap.', 2.5, 0,
  set='RIDING_SCHOOL_FIELD')
S('X16-09', 'WS', 'static', 'Young riders@C (leading their dragons off the field on foot, looking up)', 'The young riders lead their dragons off the field on foot, looking up at the sky as they go.', '', 'Footsteps; dragons\' low calls.', 4, 0,
  set='RIDING_SCHOOL_FIELD', tags=['CROWD_SMALL'], flags=['LOW_STANCE'])
S('X16-10', 'WS', 'static', 'Market@all (a gull swooping low, every head jerking up)', 'In the market, a gull swoops low over the stalls and every head jerks up. Somebody laughs at himself. Nobody else does.', '', 'A gull; one laugh.', 4, 0.5,
  set='VERDOR_HARBOR', tags=['CROWD'], diff=5)

block('X17', after='2C-21', set='VERDOR_GROUNDS', tod='LATER THAT DAY', light=L_GROUNDS_LATE)
S('X17-01', 'WS', 'static', 'Leaf@C (crouched low where he can see the doorway), doorway@L, long shadows@all', 'Leaf has not moved from where he can see the doorway. The shadows are longer than at the landing.', '', 'Evening birds.', 4, 0, flags=['LOW_STANCE'])
S('X17-02', 'MS', 'static', 'Ground Keeper@L (setting down a bucket), Leaf@R (not drinking)', 'A keeper sets a bucket of water near him and steps back. Leaf does not drink.', '', 'Bucket on turf.', 3, 0)
S('X17-03', 'MS', 'static', 'Ground Keeper@L, Leaf@R', 'He speaks to Leaf.', 'X17-01', '', 0.5, 0)
S('X17-04', 'MS', 'static', 'Abby@C (on her feet at the doorway, LEFT arm in the sling, right hand on her mother\'s arm), Alexandria@R, Healer@L-bg', 'Inside, Abby is on her feet, her left arm in the sling, her right hand on her mother\'s arm. At the doorway she stops, in the shade, before stepping out.',
  '', '', 3, 0, set='TREATMENT_ROOM', light='Doorway: interior shade, warm low daylight beyond.')
S('X17-05', 'MS', 'static two-shot', 'Alexandria@R, Abby@L', 'Mother and daughter.', 'X17-02 X17-03 X17-04', '', 1, 1, set='TREATMENT_ROOM', light='Doorway: interior shade, warm low daylight beyond.')
S('X17-06', 'CU', 'static', 'Alexandria@C (looking at the sling), Abby@L (part)', 'Abby accepts that. Alexandria looks at her daughter\'s face, then at the sling.', 'X17-05 X17-06 X17-07', '', 2, 0,
  set='TREATMENT_ROOM', light='Doorway: interior shade, warm low daylight beyond.', tags=['FACE_CLOSEUP'])
S('X17-07', 'WS', 'static', 'Leaf@C (up at once, low on his two legs, folded wings braced in front, pointed at the doorway), doorway@L', 'The door opens. Leaf is up at once, low on his two legs with his folded wings braced in front of him, every part of him pointed at the doorway.', '', '', 3, 0,
  flags=['LOW_STANCE'])
S('X17-08', 'WS', 'static', 'Abby@L (stepping out on her mother\'s arm), Alexandria@L, Leaf@R', 'Abby steps out on her mother\'s arm. She is pale and walks carefully, but she is walking.', '', '', 3, 0)
S('X17-09', 'MS', 'static', 'Abby@L (lifting her right hand), Leaf@R (starting forward, stopping)', 'Leaf starts forward. Abby lifts her right hand, as she did when she was helped inside, and Leaf stops.', '', '', 2, 0)
S('X17-10', 'WS', 'static', 'Leaf@R (coming slowly, lowering his head to her level), Abby@C, Alexandria@L (stepping back), Healer@L-bg', 'He comes the rest of the way slowly and lowers his head until it is level with her, careful of the sling. Alexandria lets go and steps back. The healer stays close enough to help.',
  '', 'His slow steps.', 5, 0, flags=['LOW_STANCE'])
S('X17-11', 'CU', 'static', "Abby@L (right hand flat on Leaf's face), Leaf@R", "Abby puts her right hand flat against the side of Leaf's face. His breath stirs the loose hair at her temple.", 'X17-08', 'His breath.', 3, 1.5,
  tags=['FACE_CLOSEUP', 'HANDS_CONTACT', 'CREATURE_CONTACT'], realism="Her hair must react to his breath (hair sim); his scales give slightly under her palm; light from the low sun rims both.")
S('X17-12', 'CU', 'static', "Leaf's eye@C (turning to her)", "Leaf's eye turns to her.", 'X17-09', '', 1.5, 0, off=['ABBY'])
S('X17-13', 'CU', 'static', 'Leaf@R (pressing his head gently against her hand), Abby@L', 'Leaf presses his head very gently against her hand.', 'X17-10', '', 2.5, 0, tags=['CREATURE_CONTACT'])
S('X17-14', 'CU', 'static', 'Abby@C', 'She stays there. Then, sounding more like herself.', 'X17-11', '', 0, 1, tags=['FACE_CLOSEUP'])
S('X17-15', 'CU', 'static', 'Leaf@C (blinking slowly)', 'Leaf blinks, slowly.', 'X17-12', '', 1.5, 0, off=['ABBY'])
S('X17-16', 'CU', 'static', "Leaf (nose)@R, Abby's hand@L", 'Leaf breathes out through his nose against her hand: a long, warm, audible breath. That is his whole answer; no nod, no smile.', '', 'One long warm breath.', 3, 1)
S('X17-17', 'MS', 'static', 'Abby@C (one-handed: the near wing joint, the near foot), Leaf@C', 'Abby starts on him the way she does every morning, one-handed now: the near wing joint, the near foot. She cannot reach the far side.', '', '', 4, 0,
  tags=['HANDS_CONTACT'])
S('X17-18', 'WS', 'static', 'Leaf@C (lowering himself and turning so she can reach), Abby@C', 'Leaf lowers himself and turns, slowly, until she can.', '', 'Claws on turf; a low rumble.', 4, 0, flags=['LOW_STANCE'], tags=['BODY_MECHANICS'])
S('X17-19', 'WS', 'static', "Alexandria@C (hand on Leaf's neck in passing, then crossing the field), Leaf@R, Abby@R, Charcoal@far-L", "Alexandria watches a moment longer. As she passes Leaf, she lays her hand briefly on his neck, the way she would thank a person, without a word. Then she crosses the field toward her son.",
  '', 'Her steps on turf.', 5, 0)

block('X18', after='2C-21', set='VERDOR_GROUNDS', tod='LATE AFTERNOON', light=L_GROUNDS_LATE)
S('X18-01', 'WS', 'static', "Remi@C (beside Charcoal's head, straightening), Keepers@R (finding work elsewhere), Alexandria@L (approaching)", 'Remi is beside Charcoal\'s head when he sees his mother coming. He straightens. The keepers near them find work somewhere else.', '', '', 3.5, 0)
S('X18-02', 'WS', 'static, low', "Alexandria@L (small beside Charcoal's head), Charcoal (head)@R, Remi@C", 'Alexandria stops beside Charcoal. Up close he is immense, and she is small beside his head. He regards her calmly. She does not step back.', '', 'His slow breath.', 4, 0.5,
  tags=['SCALE', 'BLACK_HIDE'], diff=4)
S('X18-03', 'MS', 'static two-shot', 'Alexandria@L, Remi@R', 'Did he stop?', 'X18-01 X18-02 X18-03 X18-04', '', 0.5, 0.5)
S('X18-04', 'CU', 'static', 'Alexandria@C', 'She hears what that means. So does he.', 'X18-05', '', 0, 1, tags=['FACE_CLOSEUP'])
S('X18-05', 'MS', 'static', 'Remi@C (looking at the great jaw), Charcoal (jaw)@R', 'Remi looks at the great jaw.', 'X18-06', '', 1.5, 0)
S('X18-06', 'MS', 'static two-shot', 'Alexandria@L, Remi@R', 'He cannot finish it.', 'X18-07 X18-08 X18-09', '', 0, 1)
S('X18-07', 'CU', 'static', 'Alexandria@C, Remi@R (part)', 'She lets that stand. Then, more quietly.', 'X18-10 X18-11 X18-12', '', 0, 1, tags=['FACE_CLOSEUP'])
S('X18-08', 'MS', 'static', 'Alexandria@L (touching his arm, walking back), Remi@R', 'She touches his arm briefly, which is as much as she will do with the keepers in sight, and walks back toward the building.', '', '', 3, 0)
S('X18-09', 'MS', 'static', 'Remi@C (watching her go)', 'Remi watches her go.', '', '', 2, 0)
S('X18-10', 'WS', 'static', 'Alexandria@L (stopping in the chamber doorway)', 'Alexandria stops in the doorway of the birthing chamber.', '', '', 2.5, 0, set='BIRTHING_CHAMBER', light=L_CHAMBER_LATE)
S('X18-11', 'MS', 'static', 'Young Attendant@L (holding the wet cloth above the nest), Hatchling@C (pushing up: wing wrists first, then its two legs)', 'Inside, the young attendant holds the wet cloth a little above the nest. The hatchling pushes itself up toward it: the wrists of its folded wings first, then, trembling, its two legs.',
  '', '', 4, 0, set='BIRTHING_CHAMBER', light=L_CHAMBER_LATE, tags=['HATCHLING_SOFTBODY', 'GOLD_MATERIAL'], flags=['LOW_STANCE'], diff=5)
S('X18-12', 'CU', 'static', 'Hatchling@C (standing three breaths, sitting down hard, drinking)', 'For three breaths it stands. Then it sits down hard in the bedding and drinks from the cloth.', '', 'Lapping.', 4, 1,
  set='BIRTHING_CHAMBER', light=L_CHAMBER_LATE, tags=['HATCHLING_SOFTBODY', 'GOLD_MATERIAL'], diff=5)
S('X18-13', 'MS', 'static', 'Young Attendant@L (starting to rise), Alexandria@R-bg (a slight shake of the head; leaving)', 'The young attendant sees the queen and starts to rise. Alexandria shakes her head slightly: go on. She does not go in. She watches a moment longer, then leaves.', '', '', 3.5, 0.5,
  set='BIRTHING_CHAMBER', light=L_CHAMBER_LATE)

block('X19', after='2C-21', set='VERDOR_GROUNDS', tod='LATE AFTERNOON', light=L_GROUNDS_GOLD)
S('X19-01', 'WS', 'static', 'Launch scar@C (torn turf), Keepers@C (mending it)', 'The launch scar from the morning: torn turf, dirt, scattered stones. Keepers are mending it, lifting the broken turf, filling the holes, laying it back and treading it down.', '', 'Spades; turf thumped down.', 5, 0,
  tags=['BODY_MECHANICS', 'GRASS'])
S('X19-02', 'MS', 'static', 'Remi@C (sleeves pushed up, dirt to the wrists, mending badly), Keeper@R (showing him once)', 'Remi works among them, sleeves pushed up (still stained), dirt to the wrists, like someone who needs a task. He does it badly. A keeper shows him once, without comment.',
  '', 'Spade.', 4.5, 0, tags=['BODY_MECHANICS'])
S('X19-03', 'WS', 'static', 'Abby@C (walking slowly), Healer@L, Leaf@R (at her shoulder)', 'Abby walks slowly across the field toward him, the healer beside her, Leaf following at her shoulder.', '', '', 4, 0)
S('X19-04', 'MS', 'tracking with them', 'Abby@L, Healer@R', 'Will it heal straight?', 'X19-01 X19-02 X19-03 X19-04', '', 0.5, 0)
S('X19-05', 'MS', 'static two-shot', 'Abby@L, Remi@R', 'Abby reaches the scar.', 'X19-05 X19-06', '', 1.5, 0)
S('X19-06', 'MS', 'static', 'Remi@C (setting the tool down, wiping his hands)', 'He does not smile, but something in his face eases. He sets the tool down and wipes his hands.', '', '', 2.5, 0)
S('X19-07', 'WS', 'static, long lens', 'Charcoal@R (eyes opening), Leaf@C (half a step between Abby and Charcoal), Abby@L', 'Charcoal opens his eyes and looks at them. Leaf moves half a step so that he stands between Abby and the larger dragon, watching Charcoal. Not hostile. Careful.',
  '', '', 4, 0, flags=['SIZE_DISPARITY', 'LOW_STANCE'])
S('X19-08', 'CU', 'static', 'Abby@C (looking at the jaws)', 'Abby looks at Charcoal too: at the jaws that held Leaf\'s head this morning and later caught the scout.', 'X19-07', '', 2, 0, tags=['FACE_CLOSEUP'])
S('X19-09', 'MS', 'static', 'Remi@C', 'Remi takes a moment.', 'X19-08', '', 0, 1)
S('X19-10', 'MS', 'static', "Remi@L (hand against the great jaw), Charcoal@R (breathing out; grass flattening)", 'He walks to Charcoal and rests his hand against the great jaw. Charcoal lets him, and breathes out slowly. The grass in front of him flattens and rises again.', '', 'One long breath.', 4.5, 0,
  tags=['GRASS', 'HANDS_CONTACT', 'BLACK_HIDE'])
S('X19-11', 'POV', 'static, long lens', 'Sail@C (far out beyond the outer rocks)', 'Abby looks out to sea. Far off, beyond the outer rocks, a single sail on the bright water. She watches it for a long moment.', 'X19-09', 'Distant surf.', 4, 1,
  tags=['OCEAN'], off=['ABBY'])
S('X19-12', 'MS', 'static', 'Remi@C (not answering)', 'Remi does not answer, and does not answer it for himself.', '', '', 0, 1.5)
S('X19-13', 'MS', 'static', 'Abby@L (leaning her right shoulder against Leaf), Leaf@R (taking her weight)', 'Abby leans her right shoulder against Leaf, and he takes her weight.', '', '', 2.5, 0, tags=['CREATURE_CONTACT'])
S('X19-14', 'MS', 'slow pan with his eyes', 'Remi@C (between the two dragons, searching the sky)', 'Remi stands between the two dragons, raises his eyes and searches the sky slowly, from one horizon toward the other. This morning he looked at the island. Now he watches the sky.', '', '', 5, 1)
S('X19-15', 'EWS', 'static, wide', 'Abby@L, Leaf@L, Remi@C, Charcoal@R, sail@far-C (on the water), half-mended turf@bottom', 'Hold the siblings and both dragons in one wide frame, with the sail far out on the water and the half-mended turf at their feet.', '',
  'A harbor bell carries over the image; match its ring to the brighter festival bell for the cut to Cling.', 5, 1.5, flags=['SIZE_DISPARITY', 'LOW_STANCE'], tags=['OCEAN', 'GRASS'])

# ===================================================================================================== 3A
block('X20', after='3A-08', set='CLING_SQUARE', tod='DAY', light=L_CLING_DAY)
S('X20-01', 'WS', 'static', 'Shared table@C (filling: loaves, fruit, small cakes, jugs), Crowd@all', 'A long shared table along one side of the square fills as people arrive. Everyone puts something down; everyone takes something.', '', 'Crowd; plates; laughter.', 5, 0,
  tags=['CROWD'], diff=5)
S('X20-02', 'MS', 'static', 'Old neighbors (two)@C (arguing about bread)', 'Two old neighbors argue amiably about whose bread is better without either of them tasting the other\'s.', '', 'Two old voices (walla).', 3.5, 0)
S('X20-03', 'MS', 'static', 'Adult Villager@L, Partner@C, Farm children (two)@R (vanishing into the crowd)', 'A farm family in from the country adds their basket: the ADULT VILLAGER, a PARTNER and two small children, who vanish into the crowd at once.', '', '', 3, 0, tags=['CROWD_SMALL'])
S('X20-04', 'MS', 'static two-shot', 'Adult Villager@L (reaching for bread), Partner@R (moving the basket)', 'The villager reaches for a piece of bread; the partner moves the basket out of reach.', 'X20-01 X20-02', '', 2.5, 0)
S('R11-01', 'MS', 'static, close two-shot', 'Partner@R, Adult Villager@L (no child in the shot)', 'Close on the couple at the table. Their two children are long gone into the crowd; no child is in this shot.', 'R11-01', '', 1.5, 0, unit='R11',
  flags=['NO_CHILD_IN_FRAME'])
S('R11-02', 'MS', 'static', 'Adult Villager@C (laughing into his cup), Partner@R', 'He laughs into his cup.', '', 'His laugh.', 2, 0, unit='R11', tags=['PROP_DRINK_SMOKE'], flags=['NO_CHILD_IN_FRAME'])
S('X20-05', 'MS', 'static', 'Musician@L, Second Musician@R (playing), Child@C (slipping the parent\'s hand)', 'The music space. The musician and a SECOND MUSICIAN play a quick tune. The CHILD slips the PARENT\'s hand to get closer to them.', '', 'A quick tune.', 4.5, 0,
  tags=['INSTRUMENT_ANIM', 'CROWD_SMALL'])
S('X20-06', 'MS', 'static', 'Parent@C (catching up, parcel in one arm), Child@L', 'The parent follows through the crowd and catches up.', 'X20-03', '', 1.5, 0)
S('X20-07', 'MS', 'static', 'Vendor@R (holding out a honey cake), Child@L, Parent@C (nodding)', 'The vendor sees the child staring at his tray of small honey cakes and holds one out. The child looks up at the parent. The parent nods.', 'X20-04 X20-05 X20-06', '', 4, 0)
S('X20-08', 'WS', 'static', "Child@C (eating, wandering to the watchman's post), Watchman@top", "Eating, the child wanders toward the watchman's post at the square's edge and looks up.", '', '', 3, 0)
S('X20-09', 'MS', 'static two-shot, low', 'Child@L, Watchman@R-top (eating, eyes on the sky)', 'The WATCHMAN is eating too; the vendor has sent food up to him. His eyes stay on the sky beyond the banners.', 'X20-07 X20-08 X20-09', '', 2.5, 0)
S('X20-10', 'CU', 'static', 'Watchman@C', 'So nobody else has to.', 'X20-10', '', 0, 0.5, tags=['FACE_CLOSEUP'])
S('X20-11', 'WS', 'static', 'Child@C (looking at the sky, then back to the cake), Parent@L (steering the child back toward the music)', 'The child looks up at the sky too, finds nothing in it, and goes back to the cake. The parent arrives and steers the child back toward the music.', '', '', 4, 0)

block('R12', after='3A-22', set='CLING_SQUARE', tod='DAY', light=L_CLING_DAY)
S('R12-01', 'MS', 'static, on the steps', 'King of Cling@C (a cup of ale put into his hand), adults@C (around the steps)', 'Someone puts a cup of ale into the king\'s hand. He looks at it, then lifts it. No child is in the shot.', 'R12-01', '', 3, 0,
  tags=['PROP_DRINK_SMOKE'], flags=['NO_CHILD_IN_FRAME'])
S('R12-02', 'WS', 'static, framed on the steps', 'Adults@all (around the steps, drinking), King of Cling@C', 'The grown-ups around the steps drink. So does the king. No child is in either shot: the toast is framed on the adults around the steps.', '', 'Cheer; cups.', 2.5, 0,
  tags=['PROP_DRINK_SMOKE', 'CROWD'], flags=['NO_CHILD_IN_FRAME'], diff=4)

block('X21', after='R12', set='CLING_SQUARE', tod='DAY', light=L_CLING_DAY)
S('X21-01', 'WS', 'static', 'King of Cling@C (coming down off the steps), Guard Captain@R (following, resigned)', 'The king comes down off the steps instead of taking the seat prepared for him. The guard captain follows, resigned.', '', '', 3.5, 0, tags=['CROWD_SMALL'])
S('X21-02', 'MS', 'static', 'King of Cling@C (taking bread at the shared table), Crowd@all', 'People make room for him at the shared table without ceremony, and he takes a piece of bread like anyone else.', '', 'Table chatter.', 3.5, 0, tags=['CROWD'], diff=4)
S('X21-03', 'INS', 'static', "King's hand@C (a coin on the stall), honey cakes@C", "At the vendor's stall he reaches for a honey cake and puts down a coin.", '', 'A coin on wood.', 2.5, 0, tags=['HANDS_CONTACT'])
S('X21-04', 'MS', 'static two-shot', 'Vendor@L, King of Cling@R', 'Paying.', 'X21-01 X21-02 X21-03 X21-04', '', 0.5, 0)
S('X21-05', 'MS', 'static', 'Vendor@C (taking the coin), Musician@R-bg (nodding along, playing)', 'The vendor takes the coin. The musician, overhearing, nods along without missing a beat.', '', 'The tune.', 2.5, 0, tags=['INSTRUMENT_ANIM'])
S('X21-06', 'WS', 'tracking alongside', 'King of Cling@C (walking the edge, eating), Guard Captain@R', 'The king walks the edge of the square with the guard captain, eating as he goes.', '', '', 4.5, 0, tags=['CROWD'])
S('X21-07', 'POV', 'slow pan', 'Roofs@top, people@C, work behind the celebration@all', 'He looks at his village the way Remi looked down at Verdor from the air: the roofs, the people, the work behind the celebration.', '', '', 3.5, 0, tags=['CROWD'])
S('X21-08', 'MS', 'static', 'King of Cling@C (pushing the gate; it sticks halfway)', 'At the gate onto the broad road he stops and pushes it. It drags on its hinge and sticks halfway.', 'X21-05', 'Iron scraping.', 3.5, 0, flags=['CLING_ROUTES'])
S('X21-09', 'MS', 'static two-shot', 'King of Cling@L, Guard Captain@R', 'He means the end of the festival; nobody hears anything else in it. No music underline.', 'X21-06 X21-07 X21-08 X21-09', '', 0.5, 0)
S('X21-10', 'MS', 'static', 'Guard Captain@C (to a guard), Guard@R (going for tools)', 'The guard goes for tools.', 'X21-10', '', 2, 0)
S('X21-11', 'MS', 'static two-shot, walking', 'Guard Captain@L, King of Cling@R (turning back to the crowd)', 'The king turns back toward the crowd.', 'X21-11 X21-12', '', 1, 0)

block('X22', after='R12', set='CLING_SQUARE', tod='DAY', light=L_CLING_DAY)
S('R13-01', 'WS', 'static', 'Vendor@C (on his feet at the end of the bench, cup raised), Musician@L (eating beside him), adults@all (the alley end of the table)',
  "The alley end of the shared table, where the jugs have been going round longest, the opposite end from the king. Across the square, every child is on the steps around the old woman, eating; none of them is in this shot. The musician sits beside the vendor with a plate, eating at last. The vendor leans in, cup raised.",
  '', 'Table noise at this end only.', 3.5, 0, unit='R13', tags=['PROP_DRINK_SMOKE', 'CROWD_SMALL'], flags=['NO_CHILD_IN_FRAME'])
S('R13-02', 'MS', 'static', 'Vendor@C (singing low), adults@all (leaning in)', 'He sings low, for this end of the table only.', 'R13-01', 'Sung low; the rest of the square does not hear it.', 4, 0, unit='R13',
  flags=['NO_CHILD_IN_FRAME'], realism='Human recording for the sung verse (TTS cannot sing); mouth shapes from that take.')
S('R13-03', 'MS', 'static', 'Adults@all (laughing helplessly), Partner@R (hiding her face in her hands, laughing), Musician@L (bread down, staring)', 'The adults around him laugh helplessly. The PARTNER hides her face in her hands, laughing. The musician puts down his bread and stares at the vendor.', '', 'Laughter.', 3, 0,
  unit='R13', tags=['CROWD_SMALL'], flags=['NO_CHILD_IN_FRAME'])
S('R13-04', 'CU', 'static', 'Musician@C', 'Not that one.', 'R13-02', '', 0.5, 0, unit='R13', flags=['NO_CHILD_IN_FRAME'])
S('R13-05', 'WS', 'static', 'Musician@C (getting up, going back to the music space)', 'The musician gets up and goes back across the square to the music space.', '', '', 2.5, 0, unit='R13', tags=['CROWD'])
S('X22-01', 'WS', 'static', 'Shared table@all, Vendor@C (on an upturned crate)', 'The shared meal. People sit and stand along the table. The vendor, off his feet for the first time all day, sits on an upturned crate and calls across to the musician.', '', 'Meal sounds.', 4, 0, tags=['CROWD'], diff=5)
S('X22-02', 'MS', 'static, across the square', 'Vendor@L, Musician@R (at the music space)', 'Play the old one.', 'X22-01 X22-02 X22-03', '', 0.5, 0)
S('X22-03', 'MS', 'static', 'Musician@C (playing a slow old tune alone)', 'The musician plays a slow, old tune. For a few bars he plays alone.', '', 'The old tune, alone (newly written music).', 6, 0, tags=['INSTRUMENT_ANIM'])
S('X22-04', 'WS', 'slow push', 'Crowd@all (one old voice joining, then several, then most of the table)', 'Then one voice joins, an old one, then several, then most of the table, some singing, most humming.', '', 'Voices joining; humming (wordless or new words).', 8, 0, tags=['CROWD', 'LIPSYNC'], diff=5)
S('X22-05', 'MS', 'static', 'Vendor@C (singing badly and loudly)', 'The vendor sings badly and loudly.', '', '', 3, 0)
S('X22-06', 'MS', 'static', 'King of Cling@C (at the far end of the table, listening)', 'The king, at the far end of the table, listens without singing.', '', '', 3, 0, tags=['FACE_CLOSEUP'])
S('X22-07', 'MS', 'static, low', 'Watchman@C (humming, eyes on the sky)', 'On his platform, the watchman hums along without taking his eyes off the sky.', '', '', 3, 0)
S('X22-08', 'MS', 'static', 'Guard@L, Adult Villager@R (working on the hinge with borrowed tools, stopping to listen)', 'At the gate, the guard and the ADULT VILLAGER, working on the hinge together with borrowed tools, stop to listen, then go back to work.', '', '', 4, 0, flags=['CLING_ROUTES'])
S('X22-09', 'MS', 'static two-shot', 'Adult Villager@L, Guard@R', 'Hinge banter.', 'X22-04 X22-05 X22-06', '', 0.5, 0)
S('X22-10', 'MS', 'static', 'Gate@C (swinging, and swinging), Guard@R (almost offended)', 'The hinge gives. The gate swings, and keeps swinging. The guard looks almost offended by how easy it was.', '', 'A free swing.', 3, 0)
S('X22-11', 'WS', 'static', 'Old Woman@C (clapping), children@all (running to the fountain, forming their ring)', 'The song ends, and the OLD WOMAN claps a quicker rhythm. The children run to the fountain and form their ring. The musicians pick up the dance tune.', '', 'Clapping; the dance tune.', 4, 0,
  tags=['CROWD', 'BODY_MECHANICS'])
S('X22-12', 'WS', 'high, static', "Children's ring@C (dancing the stepping dance), crowd@all, fountain@C", 'The children dance the stepping dance for the whole square.', '', 'The dance tune; stamping.', 7, 0, tags=['CROWD', 'BODY_MECHANICS'], diff=5)
S('X22-13', 'MS', 'static', 'Child@C (rushing a step, nearly colliding)', 'The child from the arch is among them, concentrating hard. Halfway through, the child rushes a step and nearly collides with the next dancer.', '', '', 3, 0, tags=['BODY_MECHANICS'])
S('X22-14', 'MS', 'static', 'Old Woman@L (calling), children@C (back in step), Child@C (laughing)', 'The ring falls back into step. The child laughs and finds the beat again.', 'X22-07', '', 3, 0, tags=['CROWD_SMALL'])
S('X22-15', 'MS', 'static', 'Parent@C (clapping against the parcel)', 'The parent, with the parcel in one arm, claps with the other hand against it.', '', '', 2.5, 0)
S('X22-16', 'MS', 'static', 'King of Cling@L (clapping), Guard Captain@R (very nearly smiling)', 'The king claps. The guard captain, at the edge of the crowd, very nearly smiles.', '', '', 3, 0, tags=['FACE_CLOSEUP'])
S('X22-17', 'MS', 'static', 'Two smaller children@C (beyond the table, copying the steps)', 'Beyond the table, two smaller children try to copy the steps.', '', '', 2.5, 0)
S('X22-18', 'WS', 'static', "Children's ring@C (final stamp), crowd@all (cheering)", 'The dance ends in a ragged, triumphant stamp. The square cheers.', '', 'Stamp; cheer.', 3.5, 0.5, tags=['CROWD'], diff=5)
S('X22-19', 'WS', 'static', 'Old Woman@L, King of Cling@C (dancing four steps badly), crowd@all (applauding)', 'On her way back to her seat, the old woman pulls the king into the dance circle for four steps. He dances them badly, to applause, and escapes.', '', 'Applause; laughter.', 5, 0,
  tags=['CROWD', 'BODY_MECHANICS'], diff=5)
S('X22-20', 'MS', 'static', 'Child@C (running back, out of breath and shining), Parent@R', 'The child runs back to the parent, out of breath and shining.', 'X22-08 X22-09', '', 2.5, 0)
S('X22-21', 'MS', 'static', 'Parent@C (taking the child\'s hand), Child@C, stone arch@bg', 'The parent takes the child\'s hand: the walk toward the stone arch that the next picture follows.', '', '', 2, 0)

# ===================================================================================================== 3B
block('X23', after='3B-02', set='CLING_SQUARE', tod='DAY', light=L_CLING_DAY)
S('X23-01', 'MS', 'static, low', 'Watchman@C (taking it for cloud, looking down at the square)', 'He takes it for cloud. He looks down at the square for a moment.', '', 'The music, the crowd.', 3, 0)
S('X23-02', 'POV', 'static', 'Vendor@C (counting coins into a cloth)', 'What he sees, a little longer than he does: the vendor counting coins into a cloth.', '', '', 2, 0)
S('X23-03', 'POV', 'static', 'King of Cling@C (laughing at something the old woman said), Old Woman@L', 'The king laughing at something the old woman has said.', '', '', 2.5, 0)
S('X23-04', 'POV', 'static', 'Child@C (out of breath, leaning against the parent), Parent@C', 'The child, still out of breath from the dance, leaning against the parent.', '', '', 2, 0)
S('X23-05', 'POV', 'static, long lens', 'White shape@C (larger, still almost motionless)', 'Then he looks back up. The white is larger. It is still almost motionless, but larger.', '', 'The music, unaware.', 2.5, 0.5, tags=['WHITE_SCALES'])
S('X23-06', 'MS', 'static, low', 'Watchman@C (getting to his feet), bread@C (dropping onto the platform)', 'He gets to his feet. The bread in his hand drops onto the platform.', '', 'Bread on boards.', 2.5, 0)
S('X23-06b', 'INS', 'static', 'Platform boards@C (cup of ale going over, still full, beside the bread)', 'Close on the platform boards: his cup of ale goes over beside the bread, still full. He has not touched it since the vendor sent it up. Nobody else is in this shot.', '', 'A cup on boards; ale spreading.', 0.5, 0,
  tags=['PROP_DRINK_SMOKE'], flags=['NO_CHILD_IN_FRAME'], note='C34.')

block('X24', after='3B-14', set='CLING_SQUARE', tod='DAY', light=L_CLING_DAY)
S('X24-01', 'WS', 'static', "Children's ring@C (breaking apart), Old Woman@C (gathering the nearest children against her skirts, eyes on the sky)", "The children's ring by the fountain breaks apart; the old woman gathers the nearest children against her skirts without taking her eyes off the sky.", '', 'The music faltering.', 3, 0,
  tags=['CROWD_SMALL'])
S('X24-02', 'MS', 'static', 'Partner@C (snatching up the two small children), fountain@bg', 'Near the fountain, the farm-cart partner snatches up the two small children.', '', '', 2.5, 0, tags=['BODY_MECHANICS'])
S('X24-03', 'MS', 'static', 'Adult Villager@C (by the gate, looking for his family over the crowd)', 'Across the square, by the gate, the adult villager looks for his family over the heads of the crowd.', '', '', 2.5, 0, tags=['CROWD'])
S('X24-04', 'MS', 'static', 'Man@C (a small child on his shoulders, waving at the white shape)', 'At the edge of the crowd, a small child riding on a man\'s shoulders waves at the white shape, the way people wave at a dragon going over. The man pulls the child down.', '', '', 3, 0)
S('X24-05', 'CU', 'static', 'Child@C (open wonder, then seeing the parent\'s face), Parent@R (part)', 'Pulled close against the parent, the child stares up at the white shape with open wonder. Then the child sees the parent\'s face, and the wonder goes. Nobody says anything.', '', '', 3, 0.5,
  tags=['FACE_CLOSEUP'])
S('X24-06', 'EWS', 'straight down from very high', 'Square@C (small; a ring of tiny figures breaking apart; banners like threads), white wing edge@bottom', 'From very high above: the square straight below, small; a ring of tiny figures breaking apart by the fountain; banners like threads. The edge of a white wing crosses the bottom of the frame.',
  '', 'Wind at height; a vast slow wing sound.', 4, 0, set='CLING_SKY', light=L_CLING_SKY, tags=['WHITE_SCALES', 'SCALE', 'CROWD'], diff=4)

# ===================================================================================================== 3C
block('R14', after='3C-05', set='CLING_SQUARE', tod='DAY', light=L_CLING_DUST)
S('R14-01', 'MS', 'handheld-feel', 'Guard Captain@C (to his guards), Guards@R (jolted into action)', 'Strong language under stress; the guards are jolted into action.', 'R14-01', 'Crowd panic around him.', 1.5, 0, tags=['CROWD'])

block('R15', after='3C-14', set='CLING_SQUARE', tod='DAY', light=L_CLING_DUST)
S('R15-01', 'MS', 'low to the ground, out of the dust', "Collapsed roofline@C, a man's arm@C (beneath timbers and tiles, not moving), blood@bottom (running along the paving joints toward the fountain), fountain pillar@bg",
  'Out of the dust, low to the ground: a man who was standing under the adjoining roofline when it came down is under it now. Only his arm shows beneath the timbers and broken tiles, and it does not move. Blood runs out from under the wreckage along the joints between the paving stones toward the fountain.',
  '', 'Dust settling; distant screams.', 5, 0.5, tags=['BLOOD', 'BODY_DEAD', 'DUST', 'DESTRUCTION'], flags=['DEAD_ARE_ADULTS'], diff=5)
S('R15-02', 'WS', 'handheld-feel, in the dust', 'Woman@C (near the steps, turning to run), flying roof timber@R, runner@L (stumbling over her)', 'A woman near the steps turns to run, and a flying length of roof timber takes her across the back of the head. She drops face down and stays down. Someone stumbles over her in the dust and keeps going.',
  '', 'A crack of timber; feet.', 4, 0, tags=['BODY_DEAD', 'DUST', 'DESTRUCTION', 'CROWD', 'BODY_MECHANICS'], flags=['DEAD_ARE_ADULTS'], diff=5)

block('X25', after='R15', set='CLING_SQUARE', tod='DAY', light=L_CLING_DUST)
S('X25-01', 'WS', 'handheld-feel', 'Partner@C (a child on each hand, carried toward the arch by the crowd), fountain pillar@bg', 'In the dust the crowd keeps the farm-cart family apart. The partner, a child on each hand, is carried toward the stone arch.', '', 'Crowd; coughing.', 4, 0, tags=['CROWD', 'DUST'], diff=5)
S('X25-02', 'MS', 'handheld-feel', 'Adult Villager@C (fighting across from the gate, pushed back toward the steps)', 'The villager, fighting across the square toward them from the gate, is pushed back toward the steps.', '', '', 3, 0, tags=['CROWD', 'DUST'], diff=5)
S('X25-03', 'WS', 'static, across the fountain', 'Adult Villager@L, Partner@R, fountain pillar@C, dust@all', 'For a moment they can see each other across the fountain. Then the dust closes between them.', '', '', 3, 0.5, tags=['DUST'], flags=['CLING_ROUTES'])

block('X26', after='3C-24', set='CLING_SQUARE', tod='DAY', light=L_CLING_DUST)
S('X26-01', 'MS', 'static, low', 'Watchman@C (on his post, exposed, gripping the rail, tracking the bank)', 'The watchman is still on his post, exposed, gripping the rail. He tracks Starlight\'s bank with his whole body and shouts down into the square.', 'X26-01', 'Wind; the vast wing sound turning.', 3, 0)
S('X26-02', 'WS', 'static', 'Guard@C (hauling the gate open; it swings freely), Crowd@all (streaming through onto the road)', 'At the broad-road gate a guard hauls it open. It swings freely on its mended hinge. People stream through onto the road instead of crushing toward the arch.', '', 'Running feet; the gate.', 3.5, 0,
  tags=['CROWD', 'DUST'], flags=['CLING_ROUTES'], diff=5)
S('X26-03', 'CU', 'static', 'Guard Captain@C (a half-second glance toward the king)', 'The guard captain sees it and, for half a second, looks toward the king.', '', '', 1, 0)
S('X26-04', 'MS', 'static', 'Vendor@L, Musician@L (pulling two strangers behind the crate), Old Woman@R-bg (pushing children into a doorway)', 'In the alley behind the wrecked stall, the vendor and the musician pull two strangers in behind the stored crate and crouch with them against the stone wall. The old woman pushes children into a doorway ahead of her.',
  '', '', 4, 0, tags=['CROWD_SMALL', 'DUST'], flags=['CLING_ROUTES'])
S('X26-05', 'WS', 'static', 'Adult Villager@C (breaking from the steps, running across the open square, calling), Guard@L (shouting after him)', 'The ADULT VILLAGER breaks from the shelter of the steps and starts across the open square toward the arch, calling for his family. A guard shouts after him. He does not stop.',
  '', 'His call; a shout.', 3.5, 0, tags=['DUST', 'BODY_MECHANICS'])
S('X26-06', 'MS', 'tracking', 'Child@C (running at the parent\'s side, looking back), Parent@L', 'Beyond the arch, running at the parent\'s side, the child looks back at the white shape turning above the roofs. The parent keeps moving.', '', '', 2.5, 0)
S('X26-07', 'MS', 'static, low', 'Watchman@C (dropping flat on his platform), shadow@all', 'The watchman drops flat on his platform as the shadow comes.', '', 'The wing sound arriving.', 2, 0)

block('R16', after='3C-28', set='CLING_SQUARE', tod='DAY', light=L_CLING_DUST)
S('R16-01', 'WS', 'static, low', "Music space stage@R (coming apart), broken boards@C (scything across the paving), Adult Villager@C (legs taken out, going down hard)",
  "Most of it finds empty ground. Not all of it. The timber stage of the music space comes apart, and its broken boards scythe across the open paving. One of them takes the ADULT VILLAGER's legs out from under him in the middle of the square, and he goes down hard on the stone and does not get up.",
  '', 'Timber tearing; a body hitting stone.', 4.5, 0, tags=['DESTRUCTION', 'DUST', 'BODY_MECHANICS'], diff=5)
S('R16b-01', 'WS', 'static, far side of the square', "Guard of the escort@C (no lines; visibly not the guard who reached the king, the gate guard or the captain), house front@C, smear@C, spear@bottom",
  'As the white body passes over, a guard of the escort who has had no lines, posted alone at the far side of the square, is lifted off his feet by the blast of air and thrown against the stone front of a house. He slides down it, leaves a long dark smear on the stone and does not move again. His spear skids away across the paving.',
  '', 'Blast of air; impact; a spear on stone.', 4, 0, unit='R16b', tags=['BODY_DEAD', 'BLOOD', 'DUST', 'BODY_MECHANICS'], flags=['DEAD_ARE_ADULTS'], diff=5,
  realism="Wide enough that the stunt reads as one continuous motion (a body-mechanics sim or a careful keyed animation with weight); the smear is the only gore; costume and helmet clearly different from the speaking guards.")

block('R17', after='3C-29', set='CLING_SQUARE', tod='DAY', light=L_CLING_DUST)
S('R17-01', 'MS', 'static, close', "Adult Villager@C (split scalp, blood down one side of his face into his collar; RIGHT leg broken below the knee, bone showing through the torn trouser), King of Cling@R (looking at his face)",
  "His scalp is split, and blood sheets down one side of his face into his collar. Below the knee his RIGHT leg is broken so badly that the bone shows white through the torn trouser. He has not looked at it yet. The king has, and keeps his eyes on the man's face instead.",
  '', 'His breathing; dust.', 4.5, 0.5, tags=['GORE', 'BLOOD', 'FACE_CLOSEUP'], flags=['VILLAGER_INJURIES'], diff=5,
  realism="Open fracture as a make-up appliance would be shot: the leg seen once, mid-frame, partly shadowed by the king's body; the camera and the king's eyes move to the villager's face. Scalp wounds bleed heavily: sheeting, not spurting.")

# ===================================================================================================== 3D
block('R18', after='3D-07', set='CLING_SQUARE', tod='DAY (moments later)', light=L_CLING_AFTER)
S('R18-01', 'WS', 'static', "Arm under the roof timbers@L, Woman@R (by the steps, face down, dust on her darkening)", 'And the people who did not get out of the open. The arm under the roof timbers. The woman by the steps, face down where she fell, the dust on her already darkening.',
  '', 'Ringing; a cough far off.', 4, 0, tags=['BODY_DEAD', 'BLOOD', 'DUST'], flags=['DEAD_ARE_ADULTS'], diff=4)
S('R18-02', 'MS', 'static', 'Man@C (sitting on the paving near the fountain, rocking), grown woman@C (across his lap; her head a ruin of blood)', 'Near the fountain a man sits on the paving with a grown woman across his lap whose head is a ruin of blood, rocking, saying nothing.', '', 'No sound from him.', 4, 1,
  tags=['BODY_DEAD', 'GORE', 'BLOOD', 'FACE_CLOSEUP'], flags=['DEAD_ARE_ADULTS'], diff=5,
  realism="Grief carries the shot, not the wound: frame on his face and back, her head partly hidden by his arm and in shadow; one slow rock, no close-up of the injury.")
S('R18-03', 'WS', 'static', 'Banner@C (torn down, lying over a man-sized shape, soaked dark through at its center)', 'A banner torn down in the first pass lies over a man-sized shape in the middle of the square, soaked dark through at its center.', '', 'Wind in the cloth.', 3.5, 1,
  tags=['BODY_DEAD', 'BLOOD', 'CLOTH'], flags=['DEAD_ARE_ADULTS'])

block('R19', after='3D-08', set='CLING_SQUARE', tod='DAY (moments later)', light=L_CLING_AFTER)
S('R19-01', 'MS', "over the parent's shoulder", "Parent@L-fg (keeping the child's face turned away), Child@L-fg (face turned away), banner-covered shape@C-bg (through the opening)", "Over the parent's shoulder, through the opening, the banner-covered shape lies in the square. The parent keeps the child's face turned the other way. The child sees none of it; the audience does.",
  '', 'Quiet breathing.', 3.5, 0.5, tags=['BODY_DEAD'], flags=['DEAD_ARE_ADULTS'])

block('X27', after='3D-09', set='CLING_SQUARE', tod='DAY (moments later)', light=L_CLING_AFTER)
S('X27-01', 'WS', 'static', 'People@all (coming out of shelter one or two at a time, looking up first)', 'People come out of shelter one or two at a time, carefully, looking up before they look anywhere else.', '', 'Footsteps; dust trickling.', 4, 0, tags=['CROWD', 'DUST'], diff=5)
S('X27-02', 'MS', 'static', 'Someone@L (helping an old man over a broken bench), Old man@C', 'Someone helps an old man over a broken bench.', '', '', 2.5, 0, tags=['BODY_MECHANICS'])
S('X27-03', 'MS', 'static', 'Old neighbors (two)@C (lifting a section of fallen timber together)', 'Two old neighbors lift a section of fallen timber together.', '', 'Timber scraping.', 3, 0, tags=['BODY_MECHANICS', 'DUST'])
S('X27-04', 'MS', 'static', 'Old Woman@C (in a doorway, children pressed around her, dust in everyone\'s hair; eyes on the sky)', 'In a doorway off the square, the old woman sits with a cluster of children pressed around her. She holds the nearest two against her and keeps her eyes on the sky.', 'X27-01', 'A whisper.', 4, 1,
  tags=['DUST', 'FACE_CLOSEUP'])
S('X27-05', 'WS', 'tracking', 'Guard@C (searching along the edge of the square and the mouth of the alley, lifting fallen cloth)', 'The GUARD who told the injured villager "I\'ll look" is looking: methodically, along the edge of the square and the mouth of the alley, lifting fallen cloth, checking doorways.', 'X27-02', 'His call.', 4, 0,
  tags=['DUST'])
S('R20-01', 'MS', 'static', 'Guard@L (lifting a fallen awning, stopping), Dead man@C (under it, chest crushed under a fallen beam; covered again)', 'In the mouth of the alley he lifts a fallen awning and stops, the way a man stops for someone he knows. Under it a man lies dead, his chest crushed in under a fallen beam. The guard looks at him for one breath, lays the awning back over his face, and stands up.',
  '', 'Cloth; one breath.', 5, 1, unit='R20', tags=['BODY_DEAD', 'DUST'], flags=['DEAD_ARE_ADULTS'], diff=4,
  realism='Play it on the guard: the dead man seen from the chest down for a second, the face covered again almost at once.')
S('X27-06', 'WS', 'static', 'Guard@L (moving on to the next doorway), Adult Villager@R-bg (under stone cover, splinted, watching him)', 'No answer yet. He moves on to the next doorway. Under stone cover across the square, the injured villager watches him go from doorway to doorway.', '', '', 5, 0,
  flags=['VILLAGER_INJURIES'])
S('X27-07', 'INS', 'static', "Musician's instrument@C (string hanging free), Musician's hands@C", 'The musician picks his instrument out of the wreck of the music space. The loose fastening has finally given way; a string hangs free. He holds it without trying to play it.', '', '', 4, 1,
  tags=['HANDS_CONTACT'])
S('X27-08', 'INS', 'static', "Festival food@C (in the dust beside the parent's dropped parcel)", "Festival food lies in the dust beside the parent's dropped parcel. Nobody picks it up. One beat only.", '', '', 2.5, 1, tags=['DUST'])
S('X27-09', 'WS', 'static', 'Guard@C (coming back through the stone arch), Partner@C (grey with dust), Farm children (two)@C', 'The guard comes back through the stone arch. Behind him, grey with dust, come a PARTNER and two small children.', '', '', 4, 0, tags=['DUST'])
S('X27-10', 'MS', 'static', "Adult Villager@C (trying to sit up; broken leg splinted with a banner pole), Partner@L (reaching him first), Farm children@R (pressing in)", 'Under the stone cover, the injured villager sees them and tries to sit up, his broken leg splinted with a length of banner pole. The partner reaches him first; the children press in against him. Nobody speaks.',
  '', 'No music. Breathing.', 4.5, 1, tags=['FACE_CLOSEUP'], flags=['VILLAGER_INJURIES'], note='C36 adds 0.5 s.')
S('X27-11', 'MS', 'static', 'Guard@C (stepping back, going to look for the next person)', 'The guard steps back and goes to look for the next person.', '', '', 2.5, 0)

block('X28', after='3D-14', set='CLING_SQUARE', tod='DAY (moments later)', light=L_CLING_AFTER)
S('X28-01', 'WS', 'static', 'Guard Captain@C (directing), injured@C (carried in under the stone of the arch)', 'Under the captain\'s direction, the injured are carried in under the stone of the arch, as the king ordered.', '', 'Effort; low voices.', 4, 0, tags=['CROWD_SMALL', 'BODY_MECHANICS'])
S('R21-01', 'WS', 'slow pan along the row', "Covered dead@C (in a row along the wall below the steps, every one an adult; across the square from the arch), men's boots@R (a festival ribbon through one lace)",
  'Along the wall below the steps, across the square from the arch and out of sight of the shelter beneath it, the dead are laid in a row, every one of them a grown man or woman, covered with whatever festival cloth is left. The banners are not long enough. From under one of them a pair of men\'s boots shows, a festival ribbon still tied through one lace.',
  '', 'Wind in the cloth.', 5, 1, unit='R21', tags=['BODY_DEAD', 'CLOTH'], flags=['DEAD_ARE_ADULTS'],
  realism='Only shapes under cloth; the ribbon detail does the emotional work; no faces, no gore.')
S('X28-02', 'WS', 'static', 'Watchman@C (climbing back up, hands not steady on the ladder)', 'The watchman climbs back up to his post. His hands are not steady on the ladder.', '', 'Rungs.', 4, 0)
S('X28-03', 'WS', 'static, low behind him', 'Watchman@C (at the top, looking out), white shape@far (smaller), Guard Captain@bottom (looking up; the nod)', 'At the top he stands where he stood all morning and looks out at the same sky. Far off, the white shape is still there, smaller. He does not take his eyes off it. Below, the captain looks up; the watchman gives one small nod without looking down, and the captain nods back.',
  '', 'Wind.', 6, 1, tags=['WHITE_SCALES'])
S('X28-04', 'MS', 'static', 'Guard Captain@L (coming back to the king\'s side), King of Cling@R', 'The guard captain comes back to the king\'s side.', '', '', 2, 0)
S('X28-05', 'MS', 'static two-shot', 'Guard Captain@L, King of Cling@R', 'The banner, and what it did.', 'X28-01 X28-02 X28-03 X28-04', '', 0.5, 0.5)
S('X28-06', 'MS', 'static', 'King of Cling@C (shoulder to a fallen beam with two villagers, lifting)', 'The king crouches beside two villagers at a fallen beam, sets his shoulder against it with them, and lifts.', '', 'Effort; timber.', 4, 0, tags=['BODY_MECHANICS', 'DUST'])
S('X28-07', 'WS', 'static', 'Vendor@C (sitting on the empty crate at the mouth of the alley, looking at his stall), King of Cling@R (passing)', 'Further on, he passes the wreck of the vendor\'s stall. The vendor is sitting at the mouth of the alley on the empty crate he stored there before the attack, looking at what is left of his stall.', '', '', 5, 1)
S('X28-07b', 'MS', 'static', 'Vendor@L (holding up a jug that came through the wreck unbroken), King of Cling@R (drinking, handing it back, a hand on his shoulder)', 'With a jug that came through the wreck unbroken in his hands, the vendor holds it up to the king without a word. The king takes it, drinks, hands it back, and puts a hand on his shoulder as he passes. Neither of them speaks. No child is in the shot.',
  '', 'Silence; a gust.', 4.0, 0, tags=['PROP_DRINK_SMOKE', 'HANDS_CONTACT'], flags=['NO_CHILD_IN_FRAME'], note='C37.')
S('X28-08', 'MS', 'static', 'King of Cling@R (crouching at the shelter opening), Child@L (looking at him), Parent@L', 'Afterward he passes the shelter where the parent and child sit. He stops and crouches at the opening. The child looks at him: the same child who asked whether there would be dragons.', 'X28-05', '', 3.5, 0)
S('X28-09', 'CU', 'static', 'King of Cling@C', 'He does not make a promise he cannot keep.', 'X28-06', '', 0, 1, tags=['FACE_CLOSEUP'])
S('X28-10', 'MS', 'static', 'Parent@L (nodding), King of Cling@R (rising, looking up past the roofs)', 'The parent nods. The king rises and looks up, past the roofs, toward the white shape in the distance.', '', '', 3, 0.5)
S('X28-11', 'CU', 'air-to-air', "Queen Fall's hand@C (laid flat on Starlight's neck), Starlight (neck)@C", "Far above, close on Queen Fall's hand as she lays it flat on Starlight's neck, once, the way Remi lays his on Charcoal's. Starlight's breathing fills the shot. Not explained. No words.",
  '', "Starlight's breathing; wind at height.", 3.5, 0.5, set='CLING_SKY', light=L_CLING_SKY, tags=['WHITE_SCALES', 'HANDS_CONTACT'], diff=4)
