# Shot definitions for Dragon's Kingdom S01E01 (animatic plan).
# Compact form, expanded by build.py.
#
# S(id, size, cam, inframe, action, lines, sound, a, b, **kw)
#   size: EWS=extreme wide, WS=wide, MS=medium, CU=close, INS=insert, POV=POV, CARD=text/black card
#   inframe: "Name@pos, Name@pos" (pos optional: L, R, C, L-fg, R-bg, far-R ...)
#   lines: "L006 L007" or "L002:0.5" (portion of a line spanning shots)
#   a = action seconds (picture beats with no dialogue over them)
#   b = breathing room seconds (deliberate holds/pauses the screenplay asks for)
#   kw: flags=[...], tags=[...], twos='ok'|'no'|'none', set=..., light=..., diff=int, off=[speakers offscreen], note=str

SHOTS = []
SCENE = {}


def scene(code, **defaults):
    SCENE.clear()
    SCENE.update(defaults)
    SCENE['code'] = code


def S(sid, size, cam, inframe, action, lines, sound, a, b=0.0, **kw):
    d = dict(SCENE)
    d.update(dict(sid=sid, size=size, cam=cam, inframe=inframe, action=action,
                  lines=lines, sound=sound, a=a, b=b))
    d.update(kw)
    SHOTS.append(d)


# ---------------------------------------------------------------- PROLOGUE
scene('PROLOGUE', set='SEA_COAST_DAWN', tod='DAWN',
      light='Cold pale dawn, sun hidden behind sea cloud low on the horizon; soft fog; no hard shadows.')

S('P-01', 'CARD', 'none (black)', '', 'Black screen. Before any image: waves folding against a rocky shore; a single seabird calls.',
  '', 'Waves on rock, one seabird call. No music yet.', 4, 0, set='CARD_BLACK', render='black')
S('P-02', 'EWS', 'slow forward travel just above the water', '',
  'Fade in: low view just above the water. Pale sky reflected between moving bands of deep blue.',
  '', 'Waves continue, open-water wash.', 5, 1, tags=['OCEAN'])
S('P-03', 'EWS', 'slow forward travel toward the island', 'Island@C-bg, Wooden vessel@L-fg',
  'Camera travels toward an island whose high ground disappears into morning cloud. A small, unremarkable wooden vessel crosses the foreground; its sails make the world feel human in scale. No dragon riders.',
  'L001', 'Narrator over sea ambience; creak of rigging as the vessel crosses.', 4, 1.5, tags=['OCEAN', 'FOG'])
S('P-04', 'INS', 'static', 'Sailor (hands only)',
  'A working hand secures a rope aboard the vessel.',
  '', 'Rope creak, water slap on hull.', 3.5, 0, tags=['HANDS_CONTACT'])
S('P-05', 'MS', 'static, slight boat sway', 'Sailor@C',
  'An anonymous sailor turns toward an unfamiliar sound above the fog. Face kept small/three-quarter; not a historical discoverer, no date.',
  '', 'A low, unidentifiable sound above the fog (not a roar).', 3.5, 0)
S('P-06', 'WS', 'static, low angle up into the fog', 'Fog bank@C, Shadow (unidentified)@R-bg',
  'The mist changes shape. Something passes beyond it, so large the eye first mistakes its shadow for cloud. Never resolve a dragon; no named dragon.',
  '', 'Air pressure swell, distant deep wingbeat felt more than heard.', 6, 0, tags=['FOG', 'SCALE'], diff=4,
  twos='no', twos_why='Something flying passes beyond the mist: all flying stays on ones.')
S('P-07', 'MS', 'static', 'Sailor@C (from behind / three-quarter back, silhouette against the bright fog)',
  'The sailor becomes still, seen from behind as a dark shape against the bright fog. His face is not shown: he stays an anonymous figure, not an identifiable discoverer (background-tier head; no face close-up).',
  '', 'Sea sound drops slightly; silence around him.', 2.5, 1, tags=['FOG'])
S('P-08', 'EWS', 'slow drift (dissolve in/out)', 'Coastal settlement@C',
  'Landscape 1 (dissolve): a coastal settlement under a pale sky.',
  'L002:0.5', 'Narrator; low wind; no music yet.', 1, 0.5, set='PROLOGUE_VISTAS')
S('P-09', 'EWS', 'slow drift (dissolve)', 'Open sea@C',
  'Landscape 2 (dissolve): open sea to the horizon.',
  'L002:0.5', 'Narrator; wide sea wash.', 1, 1, set='PROLOGUE_VISTAS', tags=['OCEAN'])
# One place name per landscape: each caption gets its own separate, unlocated dissolve, and no two
# named places or seas ever share one continuous view (CANON LOCK 4: no implied boundaries or
# adjacency). Captions follow the narrator's order in L003 and are synced to each spoken name
# (proposed choice; the screenplay's own list order is TARA; CITADEL SEA; SCRAPPER; PROXY SEA; VERDOR).
S('P-10', 'EWS', 'slow drift (dissolve)', 'Forest and cliff@C',
  'Landscape 3: a forest reaching a cliff edge. Simple caption TARA over this unlocated land only, synced to the spoken word. No borders, no map, no other named place in view.',
  'L003:0.1', 'Narrator; wind in trees.', 1, 0, set='PROLOGUE_VISTAS')
S('P-11', 'EWS', 'slow drift (dissolve)', 'Distant fortified walls@C',
  'Landscape 4: distant fortified walls. Caption SCRAPPER over this view only, synced to the spoken word. No other named place in view.',
  'L003:0.1', 'Narrator; distant wind.', 1, 0, set='PROLOGUE_VISTAS')
S('P-12', 'EWS', 'slow drift (dissolve)', 'Misted island@C (alone in frame)',
  'Landscape 5: a misted island seen from open water, alone in frame. Caption VERDOR over this view only, synced to the spoken word. A separate dissolve from the walls, so nothing implies Verdor is near or visible from Scrapper.',
  'L003:0.1', 'Narrator; soft sea wash.', 1, 0, set='PROLOGUE_VISTAS', tags=['OCEAN', 'FOG'])
S('P-13', 'EWS', 'slow drift (dissolve)', 'Open water@C (calm, high bright sky)',
  'Landscape 6: calm open water under a high bright sky, no coastline. Caption CITADEL SEA over this water only, synced to the spoken words.',
  'L003:0.15', 'Narrator; calm open-water wash.', 1, 0, set='PROLOGUE_VISTAS', tags=['OCEAN'])
S('P-14', 'EWS', 'slow drift (dissolve)', 'Open water@C (long swell, low cloud; visibly a different sea and light)',
  'Landscape 7: a different stretch of water (long swell under low cloud, different light), no coastline. Caption PROXY SEA over this water only, synced to the spoken words. Separate dissolve from P-13, so the two seas never share one view and no boundary is implied.',
  'L003:0.15', 'Narrator; heavier swell.', 0.5, 0, set='PROLOGUE_VISTAS', tags=['OCEAN'])
S('P-15', 'EWS', 'very slow push', 'Unreached islands@far-C',
  'The last landscape breathes: unreached islands on the horizon, no caption. The narration ends ("Seven kingdoms, and undiscovered islands..."), then the music enters with a low sustained string tone and a restrained rising theme (no battle montage).',
  'L003:0.4', 'Narrator ends; then music enters: one low sustained string tone, then the restrained rising theme.', 4, 3, set='PROLOGUE_VISTAS', tags=['OCEAN'])
S('P-16', 'WS', 'slow tilt across sky', 'Wing-shaped cloud@C',
  'A wing-shaped cloud drifts across a brightening sky.',
  'L004', 'Narrator over theme.', 1.5, 0.5, set='PROLOGUE_VISTAS', light='Morning; first clear sunlight; present day begins here.')
S('P-17', 'WS', 'high angle, static then slight follow', 'Dragon shadow (unidentified)@L-to-R',
  'Match cut: the cloud shape becomes a dragon\'s immense shadow traveling across grass in the present day. Cut before the dragon is identified.',
  'L005', 'Narrator; one heavy wingbeat under the music; grass rush as the shadow passes.', 3, 1,
  set='VERDOR_GROUNDS', light='Clear morning sun; long shadow across the meadow edge (no buildings visible).',
  tags=['SCALE'], note='Reuses the VERDOR_GROUNDS terrain; only a shadow plane is needed, no dragon model.')

# ---------------------------------------------------------------- TITLE
scene('TITLE', set='BIRTHING_CHAMBER', tod='MORNING (interior, dark)',
      light='Near-dark; one warm lamp rim on the egg surface.')
S('T-01', 'CU', 'very slow push', 'Egg@C',
  'Main title DRAGON\'S KINGDOM appears against the dark surface of a closed egg. A quiet scratch from within. Music gives way to the scratch.',
  '', 'Music resolves and falls away; one small scratch from inside the egg.', 6, 2, twos='ok')

# ---------------------------------------------------------------- 1A
scene('1A', set='BIRTHING_CHAMBER', tod='MORNING',
      light='Warm low lamps (practical) plus a cool daylight shaft from a high opening. Subdued, careful.')
S('1A-01', 'CU', 'static', 'Egg@C',
  'Close on the egg. A fine crack extends from an existing fracture, then stops. Something inside scrapes again, smaller than the prologue sound.',
  '', 'Tiny shell tick; inner scrape; lamp flame hiss.', 4.5, 1, twos='ok', tags=['HATCHLING_SOFTBODY'])
S('1A-02', 'WS', 'slow tilt down from the high opening', 'Attendant@L, Nest+egg@C, Door@L-bg',
  'The chamber: warm, practical, maintained. Prepared bedding, bowls of water, folded cloth. No magical apparatus. Incubation method kept generic.',
  '', 'Room tone; faint wind beyond the high opening.', 5, 1, twos='ok')
S('1A-03', 'MS', 'static', 'Attendant@L, Alexandria@L-bg (door)',
  'The attendant looks to the opening door. Queen Alexandria enters without announcement. The attendant starts to bow; Alexandria stops it with a small raised hand because the egg has moved.',
  '', 'Door latch, footsteps on stone, cloth.', 5, 0, twos='ok')
S('1A-04', 'MS', 'static two-shot, slight push', 'Attendant@L, Alexandria@R',
  'Quiet exchange across the nest.',
  'L006 L007 L008 L009', 'Low voices; shell tick under the dialogue.', 0.5, 0.5, twos='ok')
S('1A-05', 'MS', 'static', 'Alexandria@R, Nest@C',
  'Alexandria takes a place beside the prepared nest. She does not reach in.',
  '', 'Fabric settling; breathing.', 3.5, 0, twos='ok')
S('1A-06', 'INS', 'static', 'Egg@C',
  'Another piece of shell shifts. The hatchling makes a faint effortful sound.',
  '', 'Faint effortful hatchling sound (not cute, not monstrous).', 3, 0, twos='ok', tags=['HATCHLING_SOFTBODY'])
S('1A-07', 'INS', 'static macro', 'Egg@C',
  'Birth stage 1: pressure beneath the shell; the surface flexes outward.',
  '', 'Creak of shell under pressure.', 4, 0, twos='ok', tags=['HATCHLING_SOFTBODY'])
S('1A-08', 'INS', 'static macro, different angle', 'Egg@C',
  'Birth stage 2: a fragment lifts away.',
  '', 'Shell fragment clicks onto bedding.', 3.5, 0, twos='ok', tags=['HATCHLING_SOFTBODY'])
S('1A-09', 'CU', 'slow push', 'Hatchling (gold snout)@C',
  'Birth stage 3: a small gold shape presses into the opening. Gold catches lamplight; it does not emit light.',
  '', 'Wet scrape; small effortful breath.', 4.5, 0, twos='ok', tags=['HATCHLING_SOFTBODY', 'GOLD_MATERIAL'])
S('1A-10', 'CU', 'static', 'Hatchling@C',
  'Birth stage 4: a pause to breathe. The shape stills; a faint breath moves the shell edge.',
  '', 'Near silence; one tiny breath.', 3, 1.5, twos='ok', tags=['HATCHLING_SOFTBODY'])
S('1A-11', 'MS', 'static', 'Attendant@L, Attendant 2@L-bg',
  'The attendants watch carefully, not celebrating.',
  '', 'Room tone.', 2.5, 0, twos='ok')
S('1A-12', 'CU', 'slow push to medium', 'Hatchling@C',
  'The hatchling emerges awkwardly: wet, unsteady, exhausted. Gold along its scales; fragile movement. No glow.',
  '', 'Shell breaking away; bedding rustle; laboured breathing.', 8, 1, twos='ok', tags=['HATCHLING_SOFTBODY', 'GOLD_MATERIAL'], diff=5)
S('1A-13', 'MS', 'static', 'Attendant@L',
  'The attendant, quietly.',
  'L010', 'Hushed.', 1, 0, twos='ok')
S('1A-14', 'CU', 'static', 'Alexandria@R',
  'Alexandria lowers herself closer. Her expression softens.',
  '', 'Gown fabric; her breath.', 3, 0, twos='ok', tags=['FACE_CLOSEUP'])
S('1A-15', 'CU', 'static (hold)', 'Alexandria@R',
  'She whispers the ORIGINAL line, for the hatchling not the room. HOLD on her face for a beat after the line.',
  'L011', 'Whisper close on mic; nothing else.', 0, 3, twos='ok', tags=['FACE_CLOSEUP'], diff=4)
S('1A-16', 'MS', 'static', 'Attendant@L',
  'The attendant hears but does not respond.',
  '', 'Room tone.', 2, 0, twos='ok')
S('1A-17', 'INS', 'static', 'Hatchling@C, Alexandria (hands)@R',
  'The hatchling tries to lift itself and slips against the broken shell. Alexandria supports it with a folded cloth. Practical tenderness.',
  '', 'Shell scrape; soft cloth.', 5.5, 1, twos='ok', tags=['HATCHLING_SOFTBODY', 'HANDS_CONTACT'], diff=4)
S('1A-18', 'MS', 'static (from nest toward door)', 'Abby@L-bg (doorway), Remi@L-bg (behind her)',
  'At the doorway Abby leans in; Remi stands just behind her. The stillness is interrupted, not made comic.',
  'L012', 'Door; Abby slightly too loud for the room.', 1.5, 0, twos='ok')
S('1A-19', 'MS', 'static', 'Alexandria@R',
  'Alexandria, without looking away from the hatchling.',
  'L013', '', 0.5, 0, twos='ok')
S('1A-20', 'WS', 'static', 'Abby@L, Remi@L-bg, Alexandria@R, Nest@C',
  'Abby takes two quick steps, remembers the instruction, and slows. Remi follows, looking first at the shell, then at the gold hatchling.',
  '', 'Two quick footsteps, then careful ones.', 4, 0, twos='ok')
S('1A-21', 'MS', 'static two-shot', 'Abby@L, Remi@R',
  'Siblings over the nest.',
  'L014 L015 L016', '', 0.5, 0.5, twos='ok')
S('1A-22', 'CU', 'static, low (hatchling eye level)', 'Abby@L, Hatchling@R',
  'Abby crouches to its level. Its head shifts toward her voice. She almost reaches out, then looks to Alexandria.',
  '', 'Hatchling\'s small breath; Abby\'s knee on stone.', 5, 0, twos='ok', tags=['HATCHLING_SOFTBODY', 'FACE_CLOSEUP'])
S('1A-23', 'MS', 'static', 'Alexandria@R',
  'Alexandria, gently.',
  'L017', '', 0.5, 0, twos='ok')
S('1A-24', 'MS', 'static', 'Remi@L, Attendant@R-bg',
  'Remi asks; the attendant answers.',
  'L018 L019', '', 0.5, 0, twos='ok')
S('1A-25', 'CU', 'static (hold)', 'Abby@L',
  'The hatchling goes still. For one unsettling instant Abby is afraid it has stopped breathing.',
  '', 'All sound pulls back to room tone.', 2.5, 1.5, twos='ok', tags=['FACE_CLOSEUP'])
S('1A-26', 'INS', 'static', 'Hatchling@C',
  'Then its side rises.',
  '', 'One small breath.', 2.5, 0, twos='ok', tags=['HATCHLING_SOFTBODY'])
S('1A-27', 'MS', 'static two-shot', 'Abby@L-fg, Alexandria@R',
  'Relief, quietly shared.',
  'L020 L021', '', 0, 1, twos='ok')
S('1A-28', 'WS', 'static three-shot', 'Abby@L, Remi@L-bg, Alexandria@R, Hatchling@C',
  'Remi asks about a name. Abby does not move her eyes from the hatchling.',
  'L022 L023 L024', '', 0.5, 0, twos='ok')
S('1A-29', 'MS', 'static two-shot', 'Abby@L, Remi@R',
  'Remi gives her a sideways look; she keeps watching the hatchling, satisfied she has annoyed him.',
  'L025', '', 2, 0, twos='ok')
S('1A-30', 'MS', 'static', 'Alexandria@R',
  'Warm but final. Abby stands reluctantly; Remi turns toward the door.',
  'L026', '', 2.5, 0, twos='ok')
S('1A-31', 'WS', 'static three-shot', 'Abby@L, Remi@L-bg (door), Alexandria@R',
  'Exchange on the way out.',
  'L027 L028 L029 L030 L031', 'Footsteps toward door.', 1, 0, twos='ok')
S('1A-32', 'MS', 'static (from nest toward door)', 'Abby@L-bg, Remi@L-bg',
  'Abby looks back once at the gold hatchling. Then the children leave.',
  '', 'Footsteps receding; door.', 4, 0, twos='ok')
S('1A-33', 'MS', 'static', 'Alexandria@R, Hatchling@C',
  'Alexandria stays. Her hand rests near the newborn without restraining it.',
  '', 'Room tone; hatchling breathing.', 4, 2, twos='ok', tags=['HANDS_CONTACT'])
S('1A-34', 'INS', 'static', 'Hatchling (side)@C',
  'The tiny rise of its breathing (match-cut source).',
  '', 'Tiny breath, carried into the next shot as Charcoal\'s huge exhale.', 2.5, 0, twos='ok', tags=['HATCHLING_SOFTBODY'])

# ---------------------------------------------------------------- 1B
scene('1B', set='VERDOR_GROUNDS', tod='MORNING',
      light='Exterior morning; mist thinning to clear daylight; sun over the sea side (screen R/back), soft sky fill.')
S('1B-01', 'INS', 'static', 'Charcoal (flank)@C',
  'Match cut: the immense rise of Charcoal\'s side, close enough to read as dark terrain. Black scales show texture and natural highlights.',
  '', 'Huge slow exhale (continuing the hatchling\'s breath).', 4, 0, tags=['SCALE', 'BLACK_HIDE'], twos='no')
S('1B-02', 'WS', 'continuous pull-back (insert to wide)', 'Charcoal@R, Remi@R-fg',
  'Move back until Remi comes into view beside him, reaching for a riding strap: scale established by an ordinary human action.',
  '', 'Breathing; strap leather; morning birds.', 8, 0, tags=['SCALE', 'BLACK_HIDE'], diff=4)
S('1B-03', 'MS', 'static', 'Remi@L, Charcoal (flank)@R-bg',
  'Charcoal\'s breathing moves the air around Remi (hair and cloth stir). Calm, unthreatened dragon.',
  '', 'Breath rush; strap buckle.', 3.5, 0, twos='ok', tags=['CLOTH'])
S('1B-04', 'WS', 'static', 'Leaf@L (sitting upright), Abby@L-fg, Charcoal@far-R (part)',
  'Farther across the field: Leaf sits upright like a dog; Abby in front of him straightens riding equipment.',
  '', 'Field ambience; Leaf\'s quick breaths.', 4, 0, twos='ok')
S('1B-05', 'MS', 'static', 'Abby@L, Leaf@R',
  'Leaf turns toward a noise and pulls the equipment out of reach. She calls him; Leaf turns back; she finishes fastening.',
  'L032', 'Offscreen bird or gate noise that distracts Leaf; buckle.', 4, 0, twos='ok')
S('1B-06', 'WS', 'static', 'Remi@R-fg (at Charcoal\'s rig), Abby@L-bg, Leaf@L-bg',
  'Across a short distance (speaking range). They do not need to look at each other for every line.',
  'L033 L034 L035 L036', 'Voices carry across a quiet field; no shouting.', 0.5, 0.5, twos='ok', flags=['SPEAKING_DISTANCE'])
S('1B-07', 'INS', 'static', 'Remi (hands)@C',
  'Remi checks his own equipment instead of answering.',
  '', 'Leather, buckle.', 3, 0, twos='ok', tags=['HANDS_CONTACT'])
S('1B-08', 'WS', 'static', 'Ground Keeper@far-L (field edge), Charcoal@R',
  'An unnamed ground keeper stands well outside Charcoal\'s launch space.',
  'L037', 'Called across the field.', 1.5, 0, twos='ok', flags=['FIELD_CLEAR'])
S('1B-09', 'MS', 'static', 'Remi@R',
  'Remi acknowledges with a raised hand.',
  '', '', 2, 0, twos='ok')
S('1B-10', 'MS', 'static', 'Abby@L, Leaf@L (low step/platform)',
  'Abby mounts Leaf by a low step or platform suited to his height. Remi glances over to check she is mounted before finishing his own preparations.',
  '', 'Saddle creak; Leaf shifts weight.', 6, 0, tags=['MOUNTING_RIG'], diff=4)
S('1B-11', 'WS', 'static', 'Remi@R, Charcoal@R, access rig@R',
  'Remi climbs Charcoal\'s grounded access rig. No implausible jumps onto a gigantic dragon.',
  '', 'Wooden rig creak; harness clips.', 6, 0, tags=['MOUNTING_RIG', 'SCALE'], diff=4)
S('1B-12', 'WS', 'static', 'Remi@R (high, mounted), Abby@L (mounted), Leaf@L, Charcoal@R',
  'Both mounted at very different heights.',
  'L038 L039 L040', '', 0.5, 0, twos='ok', flags=['SPEAKING_DISTANCE'])
S('1B-13', 'CU', 'static', 'Leaf (head, eye)@L',
  'Leaf watches Charcoal, alert to the larger dragon\'s movement.',
  '', 'Leaf\'s quick breath; small chirr.', 3, 0, twos='ok')
S('1B-14', 'CU', 'static', 'Abby@L, Leaf (neck)@R',
  'Abby rests a hand against Leaf, directing his attention forward.',
  'L041', 'Close, quiet.', 1.5, 0, twos='ok', tags=['FACE_CLOSEUP'])
S('1B-15', 'WS', 'slow tilt up', 'Leaf@L (rising), Abby@L, Charcoal@R-bg',
  'Leaf rises. Charcoal stays in frame behind him: Leaf is small next to Charcoal yet huge next to Abby.',
  '', 'Leaf\'s claws on turf; wing unfolding.', 5, 1, twos='no')

# ---------------------------------------------------------------- 1C
scene('1C', set='VERDOR_GROUNDS', tod='MORNING',
      light='Clearing morning; mist burning off; sun over the sea side.')
S('1C-01', 'WS', 'static, low', 'Leaf@L (taking off), Abby@L',
  'Leaf takes off ahead of Charcoal. The first wingbeat shakes loose grass.',
  '', 'Quick, light wingbeats; grass hiss.', 4, 0, tags=['GRASS'], twos='no')
S('1C-02', 'MS', 'tracking up with her', 'Abby@C, Leaf@C',
  'Abby leans into the familiar motion: experienced, comfortable, not a first ride.',
  '', 'Wind rising; Leaf\'s beats.', 3, 0, twos='no')
S('1C-03', 'WS', 'ground level, slow tilt up', 'Charcoal@C (wings opening), Remi@C (tiny)',
  'Charcoal begins to move. The sound drops into a lower register. His wings open until the frame cannot contain them.',
  '', 'Sub-bass shift; leather wing membrane unfolding.', 7, 0, tags=['SCALE', 'BLACK_HIDE'], twos='no', diff=4)
S('1C-04', 'WS', 'static, ground level', 'Charcoal (wings overhead)@C',
  'The camera stays at ground level long enough for the audience to understand what is above it.',
  '', 'Air pressure building; silence from birds.', 3.5, 0.5, tags=['SCALE'], twos='no')
S('1C-05', 'WS', 'locked ground camera with shake', 'Charcoal@C (launching)',
  'He launches. Dirt lifts, turf breaks, loose stones jump, a rolling dust cloud crosses the empty launch area. Field was cleared: no bystanders.',
  '', 'Massive downbeat; turf tearing; stones clattering; rolling wind.', 6, 0, tags=['DUST', 'DESTRUCTION', 'SCALE'], twos='no', diff=5,
  flags=['FIELD_CLEAR'])
S('1C-06', 'WS', 'static, behind the launch', 'Dust cloud@C, Charcoal@C-top (leaving frame)',
  'The ground visibly devastated beneath and behind him; dust rolls toward and past camera.',
  '', 'Debris settling; second downbeat higher up.', 4, 0, tags=['DUST', 'DESTRUCTION'], twos='no', diff=5)
S('1C-07', 'MS', 'air-to-air follow', 'Abby@C, Leaf@C',
  'Abby looks back through the departing dust.',
  '', 'Wind; Leaf\'s beats.', 2.5, 0, set='SKY_OFF_VERDOR', twos='no')
S('1C-08', 'POV', 'Abby\'s POV, flying', 'Charcoal@C (rising from dust), Remi@C (small fixed point)',
  'Charcoal rises out of the dust with Remi a small fixed point on his back.',
  '', 'Deep slow wingbeats under wind.', 5, 0, set='SKY_OFF_VERDOR', tags=['DUST', 'SCALE'], twos='no', diff=4)
S('1C-09', 'CU', 'air-to-air follow', 'Abby@C',
  'The joke is for Abby and the viewer; Remi is too far away to hear it, so there is no reply. His not hearing is shown by the distance and the missing answer, not by hiding the line.',
  'L042', 'Close, intelligible aside on Abby (POV intimacy); wind under it at normal flight-dialogue level. The audience hears the joke clearly; Remi does not.', 0.5, 1, set='SKY_OFF_VERDOR', twos='no', tags=['FACE_CLOSEUP'])
scene('1C', set='SKY_OFF_VERDOR', tod='MORNING (clearing)',
      light='Clear morning over the sea; sun high-ish on the sea side (rim/back light on the two-shots); bounce fill on faces.')
S('1C-10', 'EWS', 'aerial travel, slow', 'Leaf@L, Charcoal@R, Coastline@L-bottom',
  'The dragons climb over the coast: the shoreline first.',
  '', 'Wind bed; light theme.', 6, 0, tags=['OCEAN', 'SCALE'], twos='no', flags=['SCREEN_DIRECTION'])
S('1C-11', 'WS', 'air-to-air, long lens from the inland side', 'Leaf@L-fg (behind), Charcoal@R-bg (ahead)',
  'Their relation to one another (establishes the flight line used through 1E).',
  '', 'Two wingbeat rhythms: heavy/infrequent vs quick/corrective.', 5, 0, twos='no', flags=['SCREEN_DIRECTION', 'SIZE_DISPARITY'])
S('1C-12', 'EWS', 'top-down aerial travel', 'Sea@C, two shadows@C',
  'The sea below; their shadows on the water.',
  '', 'Wind; sea far below.', 4, 0, tags=['OCEAN'], twos='no')
S('1C-13', 'WS', 'air-to-air', 'Leaf@L, Charcoal@R',
  'Charcoal draws level. His larger shadow crosses the water. Leaf adjusts with quicker wingbeats. Remi waits until they are near enough to speak.',
  '', 'Heavy beats approach; Leaf\'s quick corrective beats.', 6, 0, tags=['OCEAN', 'SCALE'], twos='no', flags=['SIZE_DISPARITY', 'SCREEN_DIRECTION'])
S('1C-14', 'MS', 'air-to-air', 'Remi@R, Abby@L-bg',
  'Speaking range check-in.',
  'L043 L044 L045', 'Wind between lines; voices close enough to hear.', 0.5, 1, twos='no', flags=['SPEAKING_DISTANCE'])
S('1C-15', 'EWS', 'tracking with them (no orbiting)', 'Leaf@L, Charcoal@R, Coast@L',
  'Their path curves along the coast. For a stretch nobody speaks. The camera travels with them rather than spinning around them.',
  '', 'Wind; lighter version of the main theme begins.', 7, 2, tags=['OCEAN'], twos='no', flags=['SCREEN_DIRECTION'])
S('1C-16', 'INS', 'air-to-air', 'Abby (both hands)@C',
  'Detail 1 (will change later): Abby using both hands comfortably on the grips/reins.',
  '', 'Leather creak under wind.', 3, 0, twos='no', tags=['HANDS_CONTACT'], flags=['ABBY_BOTH_HANDS_BEFORE_PASS'])
S('1C-17', 'CU', 'air-to-air', 'Leaf (head)@L',
  'Detail 2: Leaf glances at Charcoal without fear.',
  '', 'Wind.', 3, 0, twos='no')
S('1C-18', 'MS', 'air-to-air', 'Remi@R',
  'Detail 3: Remi relaxed enough to look at the island instead of scanning the sky.',
  '', 'Wind; theme.', 3, 0, twos='no')
S('1C-19', 'EWS', 'slow aerial travel', 'Leaf@L, Charcoal@R, Island@L-bg',
  'The sky is beautiful because it can be watched without being attacked. Private freedom, not a military procession.',
  '', 'Lighter theme carries the shot.', 6, 2, tags=['OCEAN'], twos='no')

# ---------------------------------------------------------------- 1D
scene('1D', set='SKY_OFF_VERDOR', tod='DAY (late morning)',
      light='Clear day over open water; sun on the sea side; consistent with 1C.')
S('1D-01', 'MS', 'air-to-air', 'Remi@R (looking screen-L toward island)',
  'Remi looks toward the palace\'s distant position.',
  '', 'Wind.', 2.5, 0, twos='no')
S('1D-02', 'POV', 'Remi\'s POV', 'Palace (distant)@L, Island@L',
  'The palace, distant on the island.',
  '', 'Wind.', 3, 0, twos='no')
S('1D-03', 'MS', 'air-to-air', 'Remi@R (eyeline screen-L to Abby)',
  'He turns to Abby and begins casually, as if continuing a conversation that has occupied him more than he admits. ORIGINAL line, verbatim.',
  'L046', 'Wind under his voice; no music.', 0.5, 0, twos='no')
S('1D-04', 'CU', 'air-to-air', 'Abby@L (eyeline forward)',
  'Abby says nothing. She looks ahead. No answer, no nod, no narration. The silence lasts long enough to become uncomfortable.',
  '', 'Only wind and wingbeats.', 0, 4, twos='no', tags=['FACE_CLOSEUP'], flags=['ABBY_SILENCE'], diff=4)
S('1D-05', 'MS', 'air-to-air', 'Remi@R',
  'Remi gives himself an answer. ORIGINAL line, verbatim.',
  'L047', '', 0, 1, twos='no')
S('1D-06', 'WS', 'air-to-air', 'Leaf@L, Charcoal@R',
  'The dragons continue across open water.',
  '', 'Wind; wingbeats.', 4, 0, tags=['OCEAN'], twos='no', flags=['SIZE_DISPARITY'])
S('1D-07', 'CU', 'air-to-air', 'Abby@L',
  'A shallow smile flickers across Abby\'s face. She still does not answer.',
  '', 'Wind.', 3, 0, twos='no', tags=['FACE_CLOSEUP'], flags=['ABBY_SILENCE'], diff=4)
S('1D-08', 'POV', 'Abby\'s POV', 'Charcoal (body, wing)@R',
  'She looks across Charcoal\'s enormous body, the effortless way he holds the air.',
  '', 'One immense slow wingbeat.', 4, 0, tags=['SCALE', 'BLACK_HIDE'], twos='no')
S('1D-09', 'CU', 'air-to-air', 'Abby@L (eyeline screen-R)',
  'ORIGINAL line, verbatim.',
  'L048', '', 0.5, 0, twos='no', tags=['FACE_CLOSEUP'])
S('1D-10', 'MS', 'air-to-air two-shot (long lens)', 'Abby@L, Leaf@L, Remi@R-bg, Charcoal@R-bg',
  'Sibling exchange across the gap.',
  'L049 L050 L051', 'Wind between lines.', 0.5, 0, twos='no', flags=['SPEAKING_DISTANCE'])
S('1D-11', 'CU', 'air-to-air', 'Abby@C, Leaf (head, one eye)@R',
  'Abby touches Leaf affectionately. Leaf turns one eye toward her voice.',
  'L052', '', 2.5, 0, twos='no', tags=['FACE_CLOSEUP', 'HANDS_CONTACT'])
S('1D-12', 'MS', 'air-to-air', 'Remi@R, Abby@L-bg',
  'Plain answer; he is not advertising a war. A little quiet afterward.',
  'L053 L054 L055', 'Wind fills the quiet after "Better for war."', 0, 2.5, twos='no', flags=['SPEAKING_DISTANCE'])
S('1D-13', 'MS', 'air-to-air two-shot', 'Abby@L, Remi@R-bg',
  'Light teasing.',
  'L056 L057 L058 L059', '', 0.5, 1, twos='no', flags=['SPEAKING_DISTANCE'])
S('1D-14', 'WS', 'air-to-air', 'Leaf@L (edging right), Charcoal@R',
  'Leaf edges closer to Charcoal. Abby gives a small corrective gesture. Leaf follows for a moment, then looks back at the larger dragon.',
  '', 'Leaf\'s beats quicken.', 6, 0, twos='no', flags=['SIZE_DISPARITY'])
S('1D-15', 'MS', 'air-to-air', 'Abby@L',
  'Warning Leaf.',
  'L060', '', 0.5, 0, twos='no')
S('1D-16', 'WS', 'air-to-air', 'Leaf@L, Charcoal@R',
  'Leaf makes a quick nip toward Charcoal: irritating, not damaging. Shown clearly once.',
  '', 'Small snap of jaws.', 2.5, 0, twos='no', diff=3, flags=['LEAF_INITIATES_NIP', 'SIZE_DISPARITY'])
S('1D-17', 'CU', 'air-to-air', 'Charcoal (head, eye)@R',
  'Charcoal turns his head slowly. No roar; his calm is the point.',
  '', 'Low breath; no roar.', 4, 0, twos='no', tags=['BLACK_HIDE'])
S('1D-18', 'MS', 'air-to-air', 'Remi@R',
  'Remi notices the turn and watches: attentive, not panicked. At the end of the shot Abby\'s sharper warning is heard off-screen, just before Charcoal opens his jaws (screenplay order: nip, slow head turn, Remi notices, "Leaf.", head in mouth).',
  'L061', 'Abby\'s "Leaf." off-screen at the end of the shot.', 2.5, 0, twos='no', off=['ABBY'])
S('1D-19', 'WS', 'air-to-air, wide lens, stable', 'Leaf@L, Abby@L, Charcoal@R, Remi@R',
  'THE HEAD-IN-MOUTH BEAT. Wide angle establishing both dragons and both riders. Charcoal opens his jaws and takes Leaf\'s whole head into his mouth. Abby\'s body remains safely outside. Controlled head movement; both keep flying; teeth do not close through skin. Brief.',
  '', 'Music stops; only wingbeats and rushing air; a muffled squeak from Leaf.', 5, 0, twos='no',
  tags=['HEAD_IN_MOUTH', 'SCALE'], diff=5, flags=['LEAF_UNHARMED', 'SIZE_DISPARITY'])
S('1D-20', 'CU', 'air-to-air', 'Abby@L',
  'Abby\'s astonished stillness.',
  '', 'Wingbeats, rushing air.', 2.5, 0, twos='no', tags=['FACE_CLOSEUP'])
S('1D-21', 'MS', 'air-to-air', 'Remi@R',
  'Remi, more resigned than frightened, quietly to Charcoal.',
  'L062', '', 1, 0, twos='no')
S('1D-22', 'WS', 'air-to-air', 'Leaf@L, Charcoal@R',
  'Charcoal releases Leaf. Leaf jerks his head back, puts immediate distance between them, eyes forward. Leaf is uninjured.',
  '', 'Wet release; Leaf\'s rapid beats pulling away.', 4, 0, twos='no', tags=['HEAD_IN_MOUTH'], diff=5, flags=['LEAF_UNHARMED'])
S('1D-23', 'MS', 'air-to-air two-shot', 'Abby@L, Remi@R-bg',
  'Abby processing; Remi dry.',
  'L063 L064 L065 L066', 'Wind between lines.', 0.5, 0.5, twos='no', flags=['SPEAKING_DISTANCE'])
S('1D-24', 'CU', 'air-to-air', 'Abby@C, Leaf (neck)@R',
  'Abby checks Leaf visually: uninjured. She rubs a hand against him, answering her earlier question better than her dialogue did.',
  'L067', '', 3, 0, twos='no', tags=['FACE_CLOSEUP', 'HANDS_CONTACT'], flags=['LEAF_UNHARMED'])
S('1D-25', 'MS', 'air-to-air', 'Remi@R, Charcoal (head)@R-bg',
  'Remi allows a small smile. Charcoal returns his head to the flight path as though the matter never deserved attention.',
  '', 'Music returns softly.', 3, 0, twos='no')
S('1D-26', 'MS', 'air-to-air two-shot', 'Abby@L, Remi@R-bg',
  'Lightness returns briefly. Keep it brief so the interruption feels sudden (no added hold).',
  'L068 L069', '', 0, 0, twos='no', flags=['SPEAKING_DISTANCE'])

# ---------------------------------------------------------------- 1E
scene('1E', set='SKY_OFF_VERDOR', tod='DAY',
      light='Same sun as 1D. Bright sea in background (camera on the inland side looking seaward).')
S('1E-01', 'WS', 'air-to-air, long lens, inland side', 'Leaf@L-fg (slightly behind), Charcoal@R-bg',
  'An ordinary flight shot. Leaf slightly behind and on the inland side of Charcoal. Island off their inland side; open water the other way.',
  '', 'Wind; light theme fades out. No musical warning.', 4.5, 0, twos='no', flags=['SCREEN_DIRECTION', 'SIZE_DISPARITY'])
S('1E-02', 'WS', 'air-to-air, inland side', 'Leaf@L, Abby@L, Charcoal@R-bg, Narrow shape@far-R edge (ahead, beyond Leaf)',
  'A narrow shape appears at the far right edge of frame (ahead of them, beyond Leaf, toward the gap between Leaf and Charcoal), gone before its identity resolves.',
  '', 'Nothing yet; maybe a faint rising whistle.', 2, 0, twos='no')
S('1E-03', 'WS', 'air-to-air, inland side, slightly high, locked to Leaf', 'Leaf@L-fg, Abby@L-fg, Scout (Slitherwing)@R-to-L (mid-ground: through the gap between Leaf and Charcoal, along Leaf\'s LEFT/seaward side = the far side from camera), Scout Rider (silhouette), Charcoal@R-bg',
  'THE PASS. Coming head-on from ahead, the Slitherwing cuts through the gap between Leaf and Charcoal, passing close along Leaf\'s LEFT (seaward) side, the far side from this inland camera, at terrifying speed. The camera is slightly high so the gap and the near miss read. Rider is only a strapped silhouette. No weapon, no contact. Violent wake.',
  '', 'Sharp rushing crack; wind overwhelms everything.', 1.5, 0, twos='no', tags=['FAST_PASS', 'SCALE'], diff=5,
  flags=['SCOUT_SPECIES_SLITHERWING', 'SCOUT_RIDER_UNIDENTIFIED', 'NO_WEAPON_STRIKE', 'SCREEN_DIRECTION'])
S('1E-04', 'MS', 'neutral-axis front shot: camera directly ahead of Leaf looking back along the flight line (deliberate neutral axis, not a line-cross), handheld-feel shake', 'Abby@C (facing camera: her LEFT arm = screen RIGHT, the side the scout passed), Leaf@C (rolling: his right wing dips screen LEFT)',
  'Leaf rolls to his RIGHT; Abby is thrown against her restraint and her LEFT arm (screen RIGHT here) is wrenched violently. The scout passed on her left side; Leaf rolls away from the wake. She cries out and pulls that arm inward. No slow motion, no bone image.',
  '', 'Abby\'s startled breath and cry; equipment jolting under load.', 3, 0, twos='no', tags=['FACE_CLOSEUP', 'BODY_MECHANICS'], diff=5,
  flags=['ABBY_LEFT_ARM_INJURY_EVENT'],
  note='Geometry check: travel is screen LEFT to RIGHT with the camera inland, so the inland camera sees the dragons\' RIGHT flanks. The scout passes on Leaf\'s LEFT = seaward = far side. This front shot is on the axis of travel, so Abby faces camera and her LEFT arm is on screen RIGHT. Do not mirror it.')
S('1E-05', 'MS', 'air-to-air, inland side', 'Abby@C (RIGHT hand gripping, toward camera; LEFT arm held in on the far side), Leaf@C',
  'Back on the inland side. Leaf catches himself. Abby stays in the saddle: her right hand (nearest camera) grips what she can; her left, held in on the far side, no longer works normally.',
  '', 'Leaf\'s uneven beats.', 3, 0, twos='no', tags=['HANDS_CONTACT'])
S('1E-06', 'MS', 'air-to-air', 'Remi@R',
  'Remi.',
  'L070', 'Clipped, afraid.', 0.5, 0, twos='no')
S('1E-07', 'CU', 'air-to-air', 'Abby@L',
  'Abby tries to reply; her first breath will not form a word. Leaf\'s wingbeats rapid and uneven.',
  '', 'Ragged breath; rapid uneven wingbeats.', 3, 0, twos='no', tags=['FACE_CLOSEUP'])
S('1E-08', 'MS', 'air-to-air', 'Remi@R',
  'Remi.',
  'L071', '', 0.5, 0, twos='no')
S('1E-09', 'CU', 'air-to-air', 'Abby@L',
  'Pain narrows her voice.',
  'L072', '', 0.5, 0, twos='no', tags=['FACE_CLOSEUP'])
S('1E-10', 'MS', 'air-to-air', 'Remi@R',
  'Remi.',
  'L073', '', 0.5, 0, twos='no')
S('1E-11', 'POV', 'Remi\'s POV', 'Scout (silhouette)@far-R (crossing toward open water)',
  'The scout\'s silhouette reappears at a distance, crossing toward open water.',
  '', 'Distant sharp wing noise.', 3, 0, twos='no', tags=['OCEAN'])
S('1E-12', 'MS', 'air-to-air', 'Remi@R, Charcoal (head tracking)@R',
  'Remi looks between the scout and Abby. Charcoal has already tracked the movement with his head.',
  '', 'Charcoal\'s low breath.', 3, 0, twos='no')
S('1E-13', 'WS', 'air-to-air', 'Leaf@L, Abby@L, Charcoal@R (closing in), Remi@R',
  'Remi brings Charcoal near Leaf long enough to see that Abby is secured and Leaf has regained stable flight. Remi checks before he leaves.',
  '', 'Heavy beats close; Leaf steadier.', 5, 0, twos='no', flags=['REMI_CHECKS_ABBY_FIRST', 'SIZE_DISPARITY'])
S('1E-14', 'MS', 'air-to-air two-shot', 'Abby@L, Remi@R-bg',
  'Short, clipped exchange.',
  'L074 L075 L076', 'Wind between lines.', 0.5, 0, twos='no', flags=['SPEAKING_DISTANCE'])
S('1E-15', 'CU', 'air-to-air', 'Abby@C, Leaf (neck)@C',
  'Leaf turns toward Verdor. Abby leans over him, speaking close.',
  'L077', '', 2, 0, twos='no', tags=['FACE_CLOSEUP'])
S('1E-16', 'MS', 'air-to-air', 'Remi@R',
  'Remi watches them commit to the route home.',
  '', 'Leaf\'s beats receding.', 3, 0, twos='no')
S('1E-17', 'CU', 'air-to-air', 'Remi@R (eyeline screen-R toward scout)',
  'He looks at the scout. His easy expression has disappeared.',
  '', 'Wind; low drone enters.', 2, 0, diff=4, twos='no', tags=['FACE_CLOSEUP'])
S('1E-18', 'WS', 'air-to-air', 'Charcoal@C (banking toward sea), Remi@C',
  'Remi gives the command. Charcoal banks. NO FLAME: Attack is a physical-attack command.',
  'L078', 'One deep banking wingbeat.', 2.5, 0, twos='no', flags=['ATTACK_NO_FLAME'])

# ---------------------------------------------------------------- 1F
scene('1F', set='COASTAL_SKY_WATER', tod='DAY',
      light='Bright day; sun over the sea (water bright behind the action so the wing separation reads in silhouette).')
S('1F-01', 'EWS', 'high aerial, slow', 'Leaf@L (heading inland), Scout@far-R (along outer coast), Charcoal@C (turning to intercept)',
  'Establish all three paths once. Charcoal turns to intercept; he is not the faster species and closes through position, not speed.',
  '', 'Wind; drone; distant beats of both dragons.', 6, 0, twos='no', tags=['OCEAN', 'SCALE'], flags=['CHARCOAL_NOT_FASTER', 'SCREEN_DIRECTION'], diff=4)
S('1F-02', 'WS', 'follow', 'Scout@C (banking around outcrop/mist)',
  'The scout banks around a coastal outcrop or low bank of sea mist.',
  '', 'Sharp wing snaps; surf on the outcrop.', 4, 0, twos='no', tags=['FOG', 'OCEAN'])
S('1F-03', 'WS', 'follow', 'Charcoal@C (inside angle), Remi@C',
  'Charcoal takes the inside angle: a deliberate, expensive turn. The air shakes under each correction.',
  '', 'Huge corrective beats; air thump.', 5, 0, twos='no', flags=['CHARCOAL_NOT_FASTER'], tags=['SCALE'])
S('1F-04', 'MS', 'air-to-air', 'Remi@C (low in the saddle)',
  'Remi stays low.',
  '', 'Wind roar.', 2.5, 0, twos='no')
S('1F-05', 'WS', 'from Charcoal\'s side', 'Scout Rider@C (looking back, helmet/cloth obscured), Scout@C',
  'The scout rider looks back. Distance and helmet/clothing keep identity unresolved: no face, no insignia, no speech.',
  '', 'Wind.', 3, 0, twos='no', flags=['SCOUT_RIDER_UNIDENTIFIED'])
S('1F-06', 'WS', 'follow', 'Scout@L (veering away), Charcoal@R (jaws snapping)',
  'The rider directs the smaller dragon away from Charcoal\'s first reach. Charcoal\'s jaws close on empty air. He missed.',
  '', 'Huge jaw snap on air.', 4, 0, twos='no', flags=['CHARCOAL_NOT_FASTER'])
S('1F-07', 'CU', 'air-to-air', 'Remi@C',
  'Remi.',
  'L079', '', 0.5, 0, twos='no', tags=['FACE_CLOSEUP'])
S('1F-08', 'WS', 'follow, water filling background', 'Scout@C-low, Charcoal@C-high (shadow swallowing scout)',
  'The scout drops; Charcoal turns across rather than copying the whole maneuver. Water fills the background. The larger shadow briefly swallows the smaller dragon.',
  '', 'Dive whistle; heavy turn.', 6, 0, twos='no', tags=['OCEAN', 'SCALE'], flags=['CHARCOAL_NOT_FASTER'], diff=4)
S('1F-09', 'MS', 'air-to-air', 'Abby@C (heading screen LEFT, so her injured LEFT arm faces camera), Leaf@C, Island@L-bg',
  'INTERCUT: Abby approaching Verdor. She tries to shift her left arm and stops with a gasp.',
  '', 'Gasp; Leaf\'s steady beats; calmer wind.', 4, 0, set='SKY_OFF_VERDOR', twos='no', tags=['FACE_CLOSEUP'])
S('1F-10', 'WS', 'air-to-air', 'Leaf@C, Abby@C',
  'Leaf corrects beneath her.',
  '', 'Leaf\'s corrective beats.', 3, 0, set='SKY_OFF_VERDOR', twos='no')
S('1F-11', 'WS', 'over Charcoal\'s head', 'Scout@C (rider exposed), Charcoal (head)@fg',
  'Back to Remi: the scout passes through an angle where its rider is exposed to Charcoal\'s line of fire.',
  '', 'Wind; drone.', 3, 0, twos='no')
S('1F-12', 'CU', 'air-to-air', 'Remi@C',
  'Remi gives the breath-weapon command.',
  'L080', '', 0.5, 0, twos='no', tags=['FACE_CLOSEUP'], flags=['FIRE_ONLY_ON_FIRE_COMMAND'])
S('1F-13', 'WS', 'follow', 'Charcoal@R (flame), Scout@L (slipping under), Scout Rider@L',
  'Charcoal releases a brief directed breath of flame, not sustained, not explosive. The scout tries to slip beneath it. Flame reaches the rider and scorches the riding position.',
  '', 'Short roaring whoosh of flame (1.5 s), then wind.', 3, 0, twos='no', tags=['FIRE'], diff=5)
S('1F-14', 'MS', 'brief, follow', 'Scout Rider@C (obscured), Scout@C',
  'One short flash of burning outer cloth, a flinch, a cry lost in the wind. Cut away before any skin.',
  '', 'Cry swallowed by wind.', 1.5, 0, twos='no', tags=['FIRE', 'CLOTH'], diff=5, flags=['BURNED_RIDER_ALIVE'])
S('1F-15', 'WS', 'follow', 'Scout@C, Scout Rider@C (strapped on, moving)',
  'The rider remains strapped on and moving. The smaller dragon\'s turn loses coordination. Thin smoke trails.',
  '', 'Scout\'s distressed call; flapping cloth.', 3.5, 0, twos='no', tags=['SMOKE'], flags=['BURNED_RIDER_ALIVE'])
S('1F-16', 'WS', 'wide, stable', 'Charcoal@R-high, Scout@L-low',
  'The camera returns wide before contact so the viewer understands which dragon is on which side.',
  '', 'Heavy beats closing.', 3, 0, twos='no', flags=['CHARCOAL_NOT_FASTER'])
S('1F-17', 'MS', 'follow, shake', 'Charcoal@R (jaws on scout), Scout@L, Scout Rider@L',
  'Charcoal catches the scout in his jaws. The scout struggles. No prolonged gore.',
  '', 'Hide, equipment, a dreadful stressed creak; scout\'s cry.', 3.5, 0, twos='no', tags=['CREATURE_CONTACT'], diff=5)
S('1F-18', 'MS', 'shake', 'Remi@C',
  'Remi is jolted and catches himself against the riding rig.',
  '', 'Rig strain.', 2, 0, twos='no')
S('1F-19', 'CU', 'shake', 'Remi@C',
  'The command begins amid the struggle.',
  'L081', 'Cut off by the struggle.', 0.5, 0, twos='no', tags=['FACE_CLOSEUP'])
S('1F-20', 'WS', 'follow from above-behind the scout, looking down at bright water', 'Scout@C (its LEFT wing = screen LEFT), Charcoal@R',
  'WING SEPARATION. Charcoal\'s movement and the scout\'s desperate twist tear the scout\'s LEFT wing loose, shown in silhouette against bright water. No close-up of the wound.',
  '', 'A hard tearing crack; wind.', 3, 0, twos='no', tags=['WING_SEPARATION'], diff=5, flags=['SCOUT_LEFT_WING_LOST'])
S('1F-21', 'CU', 'air-to-air', 'Remi@C',
  'Remi\'s reaction.',
  '', '', 1.5, 0, twos='no', tags=['FACE_CLOSEUP'])
S('1F-22', 'MS', 'air-to-air', 'Remi@C, Charcoal (head)@fg',
  'The complete command. Charcoal releases and checks his next movement. His violence stops with the command.',
  'L082', 'Firm voice; Charcoal\'s grunt as he checks.', 2, 0, twos='no')
S('1F-23', 'WS', 'follow down', 'Scout@C (falling, LEFT wing missing), Scout Rider@C',
  'The sudden imbalance of the falling dragon. Its remaining right wing cannot restore controlled flight.',
  '', 'Spinning flap; wind.', 4, 0, twos='no', tags=['OCEAN'], flags=['SCOUT_LEFT_WING_LOST', 'BURNED_RIDER_ALIVE'])
S('1F-24', 'MS', 'air-to-air', 'Remi@C (looking down)',
  'Remi watches for where it will come down.',
  '', 'Wind.', 2.5, 0, twos='no')
S('1F-25', 'EWS', 'slow aerial', 'Charcoal@C (circling once), Outcrop@L, Outer rocks@R',
  'Charcoal circles once at a distance, giving a clear position relative to the outcrop (no precise map).',
  '', 'Heavy slow beats.', 6, 0, twos='no', tags=['OCEAN'])
S('1F-26', 'EWS', 'high, looking down, static', 'Scout@C (impact), Sea@C',
  'The impact seen from above and far away: a burst of water, a broken trail across the surface.',
  '', 'Distant heavy splash, muffled by height.', 4, 0, twos='no', tags=['WATER_IMPACT', 'OCEAN'], diff=5)
S('1F-27', 'EWS', 'high, slow push', 'Scout@C (in water), Scout Rider@C (secured to it)',
  'Then movement: the rider\'s secured form remains with the dragon. The dragon makes a weak effort to keep itself above water. Their future is not decided.',
  '', 'Faint water churn.', 5, 0, twos='no', tags=['WATER_IMPACT', 'OCEAN'], diff=5, flags=['BURNED_RIDER_ALIVE', 'NO_DEATH_DECLARED', 'SCOUT_LEFT_WING_LOST'])
S('1F-28', 'MS', 'air-to-air', 'Remi@C (looking inland, screen L)',
  'Remi looks inland.',
  '', 'Wind.', 2, 0, twos='no')
S('1F-29', 'POV', 'Remi\'s POV', 'Leaf (diminishing shape)@L, Island@L',
  'Leaf is a diminishing shape approaching home.',
  '', 'Wind.', 2.5, 0, twos='no')
S('1F-30', 'CU', 'air-to-air', 'Remi@C',
  'He looks back down and fixes the location in his mind.',
  '', '', 3, 0, twos='no', tags=['FACE_CLOSEUP'])
S('1F-31', 'WS', 'follow', 'Charcoal@C (banking toward Verdor), Remi@C',
  'Ordinary directional speech (not a new formal command). Charcoal banks toward home.',
  'L083', 'Low voice; deep bank.', 2.5, 0, twos='no')
S('1F-32', 'WS', 'static, low over water', 'Sea surface@C, smoke trace@C',
  'The sea closes over the last drifting trace of smoke.',
  '', 'Low water lap; wind.', 4, 0, twos='no', tags=['OCEAN', 'SMOKE'])
S('1F-33', 'INS', 'air-to-air', 'Abby (right hand)@C',
  'Abby\'s right hand holding fast. Two injured parties, not a victory.',
  '', 'Leaf\'s beats; Abby\'s breath.', 2.5, 0.5, set='SKY_OFF_VERDOR', twos='no', tags=['HANDS_CONTACT'])

# ---------------------------------------------------------------- 2A
scene('2A', set='VERDOR_GROUNDS', tod='DAY',
      light='Clear day, same sun side as 1B (sea side, screen R/back).')
S('2A-01', 'WS', 'static, looking up past keepers', 'Ground Keepers@L-fg, Leaf@R-sky (alone, urgent)',
  'Ground keepers see Leaf returning alone and too urgently.',
  '', 'Field quiet; Leaf\'s uneven beats approaching.', 4, 0, twos='no',
  twos_why='Leaf is flying in with urgent, uneven wingbeats: all flying stays on ones.')
S('2A-02', 'MS', 'static', 'Ground Keeper@L, Ground Keeper 2@R',
  'One raises a hand; another notices Abby hunched over the saddle. The mood changes before anyone hears her.',
  '', '', 3, 0, twos='ok')
S('2A-03', 'MS', 'static', 'Ground Keeper@C',
  'The keeper calls out.',
  'L084', 'Shout across field.', 1, 0, twos='ok')
S('2A-04', 'WS', 'static, slight follow', 'Leaf@C (landing), Abby@C',
  'Leaf lands with more caution than before, keeping his rider steady. Abby flinches despite the care.',
  '', 'Careful landing beats; light dust.', 6, 0, twos='no', tags=['DUST'])
S('2A-05', 'MS', 'static', 'Leaf (head turning back)@L, Abby@C',
  'The green dragon turns immediately to look at her.',
  '', 'Leaf\'s worried chirr.', 2.5, 0, twos='ok')
S('2A-06', 'MS', 'static (keeper below, Abby in saddle)', 'Ground Keeper@L-low, Abby@R-high',
  'Abby stays in the saddle, arm held in.',
  'L085 L086 L087', '', 0.5, 0, twos='ok', tags=['FACE_CLOSEUP'])
S('2A-07', 'WS', 'static', 'Ground Keepers@L (bringing platform), Leaf@C, Abby@C',
  'The keeper calls for assistance; a stable platform is brought alongside. No leaping, no two-armed sliding.',
  '', 'Wooden platform dragged on grass.', 5, 0, twos='ok', tags=['MOUNTING_RIG'])
S('2A-08', 'CU', 'static', 'Abby@L, Leaf (head)@R',
  'The reassurance is for Leaf even though she is hurt.',
  'L088', '', 1, 0, twos='ok', tags=['FACE_CLOSEUP'])
S('2A-09', 'MS', 'static', 'Ground Keeper@L, Leaf (watchful head)@R, Abby@R-high',
  'Leaf remains close. A keeper pauses rather than forcing past his watchful head.',
  'L089 L090', '', 2, 0, twos='ok')
S('2A-10', 'WS', 'static', 'Ground Keepers@L, Abby@C, Leaf@R',
  'With Abby\'s permission and Leaf watching, keepers help her down. One supports her balance; nobody moves the injured arm. Her feet touch the ground; her knees briefly soften.',
  '', 'Careful steps; Abby\'s held breath.', 7, 0, twos='ok', tags=['HANDS_CONTACT', 'MOUNTING_RIG', 'BODY_MECHANICS'], diff=4)
S('2A-11', 'MS', 'static', 'Abby@C, Ground Keeper@R',
  'Standing.',
  'L091 L092', '', 0.5, 0, twos='ok')
S('2A-12', 'WS', 'static', 'Charcoal shadow@R-to-L, Ground Keepers@L (clearing back)',
  'Charcoal\'s shadow crosses the field. Everyone outside the assistance group clears back.',
  '', 'Deep wingbeats overhead.', 3, 0, twos='no', tags=['SCALE'])
S('2A-13', 'EWS', 'static', 'Charcoal@R (landing, far from Abby), Abby+Leaf@L',
  'A heavy landing disturbance, but away from Abby and Leaf. Do not bury the injured child in dust.',
  '', 'Ground thump; dust rolling the other way.', 6, 0, twos='no', tags=['DUST', 'SCALE'], diff=4)
S('2A-14', 'WS', 'static', 'Remi@R (dismounting rig, hurrying L), Charcoal@R-bg, Abby@L',
  'Remi dismounts by the established rig and hurries to Abby. Charcoal watches from behind him, quiet manner restored.',
  '', 'Rig; running steps.', 6, 0, twos='ok', tags=['MOUNTING_RIG'])
S('2A-15', 'MS', 'static two-shot', 'Abby@L, Remi@R',
  'Brother and sister.',
  'L093 L094 L095', '', 0.5, 0, twos='ok')
S('2A-16', 'CU', 'static', 'Abby@L',
  'Her look says the answer is inadequate; then the pain takes her attention again.',
  '', '', 3, 0, diff=4, twos='ok', tags=['FACE_CLOSEUP'])
S('2A-17', 'MS', 'static', 'Remi@R, Ground Keeper@L',
  'Remi to the keeper.',
  'L096 L097', '', 1, 0, twos='ok')
S('2A-18', 'WS', 'static', 'Abby@L (helped toward building), Keepers@L, Leaf@R',
  'Abby is helped inside. She looks back toward Leaf.',
  '', 'Footsteps on grass.', 4, 0, twos='ok')
S('2A-19', 'MS', 'static', 'Leaf@R (one step forward), Keeper@C, Abby@L-bg (raised RIGHT hand)',
  'Leaf takes a step after her, then stops at the keeper\'s quiet presence and Abby\'s raised right hand.',
  'L098', '', 3, 0, twos='ok')
S('2A-20', 'CU', 'static (hold)', 'Leaf@R',
  'Hold on Leaf watching her go. Cut before it becomes a sentimental montage.',
  '', 'Leaf\'s quiet breath; door closing offscreen.', 2.5, 1, twos='ok')

# ---------------------------------------------------------------- 2B
scene('2B', set='TREATMENT_ROOM', tod='DAY (interior)',
      light='Working room with daylight from an opening on screen L (coast visible through it); clean, plain.')
S('2B-01', 'WS', 'static', 'Abby@C (seated, left arm supported = screen R), Healer@R, Remi@L-bg, Door@L-bg',
  'Abby seated; left arm supported; riding outer layer loosened carefully. No graphic injury.',
  '', 'Room tone; water poured into a bowl.', 4, 0, twos='ok')
S('2B-02', 'MS', 'static two-shot', 'Abby@L, Healer@R',
  'The healer begins.',
  'L099 L100 L101', '', 0.5, 0, twos='ok')
S('2B-03', 'MS', 'static', 'Remi@L (too close), Healer@R',
  'Remi stands too close because he does not know where else to be. The healer looks up. He steps back.',
  'L102', '', 3, 0, twos='ok')
S('2B-04', 'MS', 'static', 'Alexandria@L-bg (door)',
  'The door opens; Alexandria enters. Her first look is at Abby\'s face, her second at the arm, her third at Remi.',
  '', 'Door; quick steps that slow.', 5, 0, twos='ok', tags=['FACE_CLOSEUP'])
S('2B-05', 'MS', 'static two-shot', 'Alexandria@L, Abby@R',
  'Mother and daughter.',
  'L103 L104 L105', '', 0, 1, twos='ok')
S('2B-06', 'MS', 'static', 'Alexandria@L (kneeling, level), Abby@C',
  'Alexandria kneels/sits level with her daughter and lets Abby take her hand with the uninjured RIGHT hand.',
  '', 'Fabric; quiet.', 4, 0, twos='ok', tags=['HANDS_CONTACT'])
S('2B-07', 'MS', 'static', 'Alexandria@L, Healer@R',
  'Alexandria to the healer.',
  'L106 L107', '', 0.5, 0, twos='ok')
S('2B-08', 'MS', 'static', 'Healer@R, Abby@C',
  'The healer continues in broad, credible action (no instructional demonstration). Time for Abby\'s breathing to settle.',
  '', 'Cloth; Abby\'s breath slowing.', 5, 1, twos='ok', tags=['HANDS_CONTACT'])
S('2B-09', 'MS', 'static', 'Remi@L',
  'Alexandria asks; Remi reports.',
  'L108 L109', '', 0.5, 0, twos='ok', off=['ALEXANDRIA'])
S('2B-10', 'MS', 'static, over Remi\'s shoulder', 'Alexandria@R, Remi@L-fg (back)',
  'Alexandria\'s questions; his short answer.',
  'L110 L111 L112', '', 0, 0, twos='ok')
S('2B-11', 'MS', 'static', 'Remi@L',
  'Remi.',
  'L113', '', 0, 0, twos='ok')
S('2B-12', 'CU', 'static', 'Abby@C',
  'Abby.',
  'L114', '', 1, 0, twos='ok', tags=['FACE_CLOSEUP'])
S('2B-13', 'INS', 'static', 'Alexandria hand@L, Abby right hand@C',
  'Alexandria briefly squeezes Abby\'s hand. Her voice remains level.',
  '', '', 2.5, 0, twos='ok', tags=['HANDS_CONTACT'])
S('2B-14', 'MS', 'static, over Remi\'s shoulder', 'Alexandria@R, Remi@L-fg',
  'Questions about the rider. The limitation registers: he reports what he saw.',
  'L115 L116 L117 L118', '', 0, 1, twos='ok', flags=['SCOUT_RIDER_UNIDENTIFIED'])
S('2B-15', 'MS', 'static', 'Alexandria@R',
  'Remi does not answer immediately.',
  'L119', '', 0, 1.5, twos='ok')
S('2B-16', 'CU', 'static', 'Abby@C (looking screen L toward Remi)',
  'Abby looks toward him. She has not heard what happened after she turned home.',
  '', '', 2, 0, twos='ok', tags=['FACE_CLOSEUP'])
S('2B-17', 'MS', 'static', 'Remi@L',
  'Remi answers; Alexandria asks; he qualifies.',
  'L120 L121 L122', '', 0, 0.5, twos='ok', off=['ALEXANDRIA'], flags=['NO_DEATH_DECLARED'])
S('2B-18', 'MS', 'static', 'Healer@R, Abby@C',
  'The healer pauses only long enough to notice the room change, then continues.',
  '', '', 2.5, 0, twos='ok')
S('2B-19', 'CU', 'static', 'Alexandria@R',
  'Alexandria.',
  'L123', '', 0, 0, twos='ok', tags=['FACE_CLOSEUP'])
S('2B-20', 'CU', 'static', 'Remi@L',
  'He makes himself finish.',
  'L124 L125', '', 0, 1.5, diff=4, twos='ok', tags=['FACE_CLOSEUP'], flags=['SCOUT_LEFT_WING_LOST', 'BURNED_RIDER_ALIVE'])
S('2B-21', 'CU', 'static', 'Abby@C',
  'Abby looks down.',
  '', '', 2.5, 0, twos='ok', tags=['FACE_CLOSEUP'])
S('2B-22', 'CU', 'static', 'Alexandria@R',
  'Alexandria watches Remi without approval or condemnation.',
  '', '', 3, 1, diff=4, twos='ok', tags=['FACE_CLOSEUP'])
S('2B-23', 'MS', 'static two-shot', 'Abby@C, Remi@L',
  'Nobody supplies an easy answer.',
  'L126 L127 L128', '', 0, 2, twos='ok')
S('2B-24', 'MS', 'static, over Remi\'s shoulder', 'Alexandria@R, Remi@L-fg',
  'Suspicion separated from knowledge.',
  'L129 L130 L131', '', 0, 0.5, twos='ok')
S('2B-25', 'MS', 'static', 'Remi@L, Alexandria@R',
  'Suspicion, not confirmation.',
  'L132 L133', '', 0, 0.5, twos='ok', flags=['TRAITOR_IS_SUSPICION_ONLY'])
S('2B-26', 'MS', 'static', 'Alexandria@L, Abby@C, Healer@R',
  'She releases Abby\'s hand only after a warning glance and checking the healer is ready.',
  '', '', 3, 0, twos='ok', tags=['HANDS_CONTACT'])
S('2B-27', 'MS', 'static two-shot', 'Alexandria@L, Abby@C',
  'Quiet promise.',
  'L134 L135 L136', '', 0, 0.5, twos='ok')
S('2B-28', 'WS', 'static', 'Alexandria@L-bg (to doorway), Remi@L (to threshold), Abby@C',
  'Alexandria steps to the open doorway and calls an unnamed royal messenger. Remi follows only as far as the threshold, staying in Abby\'s view.',
  '', 'Footsteps; distant call (unvoiced).', 4, 0, twos='ok')

# ---------------------------------------------------------------- 2C
scene('2C', set='TREATMENT_ROOM', tod='DAY',
      light='Doorway: interior warm, exterior daylight beyond; coast visible through the nearby opening.')
S('2C-01', 'MS', 'static', 'Alexandria@L, Royal Messenger@R',
  'Alexandria gives the order.',
  'L137 L138', '', 0, 0, twos='ok')
S('2C-02', 'CU', 'static', 'Alexandria@L',
  'Detail of the order: prepare for injured survivors.',
  'L139', '', 0, 0, twos='ok', tags=['FACE_CLOSEUP'], flags=['SCOUT_LEFT_WING_LOST', 'BURNED_RIDER_ALIVE', 'NO_DEATH_DECLARED'])
S('2C-03', 'MS', 'static', 'Alexandria@L, Remi@R',
  'She looks at Remi.',
  'L140', '', 1, 0, twos='ok')
S('2C-04', 'MS', 'static', 'Remi@L (pointing out the opening), Royal Messenger@R, Coastline@bg',
  'Remi points through the opening at the visible coastline: the outer rocks, his approach, where he saw the fall. No map.',
  'L141', '', 3, 0, twos='ok')
S('2C-05', 'POV', 'static', 'Coastline, outer rocks@far-R',
  'Through the opening: the point and the outer rocks.',
  '', 'Distant surf.', 2.5, 0, twos='ok', tags=['OCEAN'])
S('2C-06', 'MS', 'static', 'Royal Messenger@R',
  'The messenger leaves immediately.',
  'L142', 'Running steps away.', 2, 0, twos='ok')
scene('2C', set='VERDOR_HARBOR', tod='DAY',
      light='Clear day at the harbor; weathered pale stone; sea blue.')
S('2C-07', 'WS', 'static, slight pan', 'Royal Messenger@C (running down steps)',
  'HARBOR: the messenger runs down weathered steps.',
  '', 'Harbor bustle; gulls; running feet.', 4, 0, twos='no')
S('2C-08', 'WS', 'static', 'Royal Messenger@L, Harbor crew@R',
  'He reaches the waiting crew and delivers the order (mimed under ambience; no repeated dialogue).',
  '', 'Murmur; a shouted order (unintelligible walla).', 4, 0, twos='ok', tags=['CROWD_SMALL'])
S('2C-09', 'INS', 'static', 'Santa Maria hull (name, only if legible), ropes',
  'Ropes handled. The name appears on the hull only if the lettering can be made legible.',
  '', 'Rope through block; hull creak.', 3, 0, twos='ok', tags=['HANDS_CONTACT'])
S('2C-10', 'WS', 'static', 'Harbor crew@C, Santa Maria@R',
  'Supplies brought aboard.',
  '', 'Crates; footsteps on gangway.', 3, 0, twos='ok', tags=['CROWD_SMALL'])
S('2C-11', 'MS', 'static', 'Lookout@C (turning seaward)',
  'A lookout turns seaward. Preparations are beginning; the rescue is not shown or resolved.',
  '', 'Harbor bell begins (first strike).', 3, 0, twos='ok', flags=['NO_DEATH_DECLARED'])
scene('2C', set='TREATMENT_ROOM', tod='DAY',
      light='Same as 2B; slightly later.')
S('2C-12', 'WS', 'static', 'Abby@C (LEFT arm in sling), Remi@L (seated nearby), Healer@R-bg (quietly tidying, the injured-arm side)',
  'BACK IN THE TREATMENT ROOM: Abby now has her left arm in a sling. Remi sits nearby, with no task left to hide inside. The healer is still in the room, in the background on screen R (she is there for Alexandria to look to in 2C-19).',
  '', 'Room tone.', 3, 0, twos='ok', flags=['ABBY_SLING_LEFT'])
S('2C-13', 'MS', 'static two-shot', 'Remi@L, Abby@C',
  'Apology.',
  'L143 L144 L145 L146', '', 0, 0.5, twos='ok')
S('2C-14', 'MS', 'static', 'Remi@L (looking toward open door)',
  'He looks toward the open door, thinking of the sky outside it.',
  '', 'Faint wind through the door.', 2.5, 0, twos='ok')
S('2C-15', 'MS', 'static two-shot', 'Remi@L, Abby@C',
  'No laugh at first; then Remi lets out a small breath that nearly becomes one. Abby still pale and tired, still herself.',
  'L147 L148', 'Small breath.', 1.5, 1, twos='ok')
S('2C-16', 'MS', 'static two-shot', 'Remi@L, Abby@C',
  'About Leaf.',
  'L149 L150 L151 L152', '', 0, 1, twos='ok')
S('2C-17', 'WS', 'static', 'Alexandria@L-bg (entering), Remi@L (stands), Abby@C, Healer@R',
  'Alexandria returns. Remi stands out of habit; she gestures for him to stay seated. For a moment she sees them as her children.',
  '', '', 4, 1, twos='ok')
S('2C-18', 'MS', 'static', 'Alexandria@L, Abby@C',
  'Staying put.',
  'L153 L154', '', 0, 0, twos='ok')
S('2C-19', 'CU', 'static', 'Alexandria@L (eyeline screen R to the Healer, then to Abby)',
  'Alexandria looks to the healer (off-screen R, established in 2C-17), then back to Abby.',
  'L155', '', 2, 0, twos='ok', tags=['FACE_CLOSEUP'])
S('2C-20', 'WS', 'static', 'Leaf@L (near doorway, watching it), Charcoal@far-R (lying still)',
  'Outside: Leaf and Charcoal occupy separate parts of the grounds. Leaf watches the doorway.',
  '', 'Harbor bell carries over the image.', 4, 0, set='VERDOR_GROUNDS', twos='ok', light='Day, slightly later; same sun side.',
  flags=['SIZE_DISPARITY'])
S('2C-21', 'MS', 'static', 'Charcoal@C (lying, breathing slowly)',
  'Charcoal lies still, breathing slowly. The calm that was amusing in the sky is more complicated now.',
  '', 'Harbor bell; match its ring to a brighter festival bell for the cut to Cling.', 4, 1, set='VERDOR_GROUNDS', twos='ok',
  tags=['BLACK_HIDE'], light='Same as 2C-20 / 2A: clear day, sun on the sea side (screen R/back), slightly later.')

# ---------------------------------------------------------------- 3A
scene('3A', set='CLING_SQUARE', tod='DAY',
      light='Warm daylight; sun behind the king\'s steps (south), so the far sky the watchman faces is front-lit. Warm cloth, timber, gray stone.')
S('3A-01', 'WS', 'human-height travel through the street toward the square', 'Crowd@all, banners@top',
  'Festival bell. ON-SCREEN LOCATION: CLING — SCRAPPER. A festival already in motion; begin at human height, traveling through the village (this exact route returns blocked in 3D).',
  '', 'Festival bell (matched from the harbor bell); many small sounds: chatter, pans, footsteps, a dog.', 6, 0, twos='no', tags=['CROWD', 'CLOTH'], diff=5,
  flags=['CLING_ROUTES'])
S('3A-02', 'INS', 'static', 'Hands exchanging food@C',
  'Hands exchange food.',
  '', 'Coins; paper/cloth wrap.', 3, 0, twos='ok', tags=['HANDS_CONTACT'])
S('3A-03', 'WS', 'slow tilt up', 'Banners@C',
  'Fabric banners shift above the street.',
  '', 'Cloth flutter.', 3, 0, twos='no', tags=['CLOTH'])
S('3A-04', 'MS', 'static', 'Musician@C, second musician@R',
  'A musician starts a phrase; another joins. (The musician is also repairing a loose fastening between phrases.)',
  '', 'Festival tune begins (original or open-licensed music only).', 4, 0, twos='ok', tags=['INSTRUMENT_ANIM'])
S('3A-05', 'WS', 'tracking', 'Children@C (chasing), adults working@L/R',
  'Children chase one another between adults who are working as much as celebrating.',
  '', 'Children\'s laughter; footsteps.', 4, 0, twos='no', tags=['CROWD'], diff=4)
S('3A-06', 'MS', 'static', 'Vendor@L (stall, left-center of square), stall cloth@L',
  'The vendor keeps his stall steady on uneven stones; someone catches the corner again.',
  'L156', 'Stall rattle.', 2, 0, twos='ok', tags=['CLOTH'])
S('3A-07', 'MS', 'static two-shot', 'Vendor@L, Musician@R',
  'Familiar banter. The musician smiles and helps straighten the cloth.',
  'L157 L158', '', 3, 0, twos='ok', tags=['CLOTH'])
S('3A-08', 'WS', 'static', 'Parent@L (parcel + child close), Child@L, Guard@R (peering over decorations)',
  'A parent carries a parcel while keeping a child close; a guard tries to see over decorations.',
  '', 'Crowd bed.', 4, 0, twos='ok', tags=['CROWD'])
S('3A-09', 'WS', 'static, slight pan', 'King of Cling@C (entering with small escort), Guard Captain@C-bg, Crowd@L/R',
  'The King of Cling enters the square with a small escort. Respectful movement, not universal kneeling.',
  '', 'Crowd murmur shifts; music continues.', 5, 0, twos='ok', tags=['CROWD'], diff=4)
S('3A-10', 'MS', 'static two-shot', 'King of Cling@R, Vendor@L',
  'Accessible king.',
  'L159 L160 L161', 'Small laugh from nearby people.', 0.5, 0, twos='ok')
S('3A-11', 'MS', 'static', 'King of Cling@C, Guard Captain@C-bg (half a step behind, scanning)',
  'He lets the people laugh and gestures for the music to continue. The guard captain scans the square.',
  '', 'Music swells back.', 4, 0, twos='ok', tags=['CROWD'])
S('3A-12', 'MS', 'static', 'Guard Captain@L, King of Cling@R',
  'Steps can wait.',
  'L162 L163', '', 0, 0, twos='ok')
S('3A-13', 'MS', 'static', 'King of Cling@R, Child@L (trying to see)',
  'The king notices a child trying to see around the adults and shifts aside, giving the child a view of the musicians. No speech about kindness.',
  '', '', 4, 0, twos='ok')
S('3A-14', 'MS', 'static three-shot', 'Child@L, Parent@L-bg, King of Cling@R',
  'The innocent question.',
  'L164 L165 L166 L167 L168', '', 0.5, 0, twos='ok')
S('3A-15', 'CU', 'static', 'Child@C',
  'The child considers the disappointing answer. The king gives a brief apologetic look and continues. Nobody remarks on the irony.',
  '', '', 3, 0, twos='ok', tags=['FACE_CLOSEUP'])
S('3A-16', 'WS', 'static, from the steps (over the king\'s shoulder)', 'King of Cling@R-fg, Square@C, Arch@L, Broad road@R, Banners@top, far sky@top',
  'From the steps at the edge of the square, the king takes in the gathering. A line of banners partly obscures the far sky.',
  '', 'Crowd bed.', 4, 0, twos='ok', tags=['CROWD'], flags=['CLING_ROUTES'])
S('3A-17', 'MS', 'static', 'Guard Captain@C, banner@C, Watchman@far-R',
  'The guard captain moves one banner aside so it cannot block the watchman\'s sight.',
  '', 'Cloth rustle.', 3, 0, twos='ok', tags=['CLOTH'])
S('3A-18', 'MS', 'static', 'King of Cling@C (on steps), Crowd@fg',
  'The king begins; the vendor heckles from the crowd.',
  'L169 L170', 'Laughter.', 1, 0, twos='ok', off=['VENDOR'], tags=['CROWD'])
S('3A-19', 'MS', 'slow push', 'King of Cling@C',
  'His short thank-you.',
  'L171', '', 0, 0, twos='ok')
S('3A-20', 'WS', 'static', 'Crowd@C, King of Cling@R-bg',
  'The crowd responds. He allows it to settle.',
  '', 'Cheer and applause, settling.', 4, 0, twos='ok', tags=['CROWD'], diff=4)
S('3A-21', 'MS', 'static', 'King of Cling@C',
  'The closing lines.',
  'L172', '', 0.5, 0, twos='ok')
S('3A-22', 'MS', 'static', 'Musicians@C',
  'Musicians lift their hands in exaggerated gratitude, then return to the tune. The last untroubled stretch begins.',
  '', 'Laughter; tune resumes.', 4, 1, twos='ok', tags=['INSTRUMENT_ANIM'])
S('3A-23', 'WS', 'static', 'Parent@C (moving L), Child@C, Stone arch@L',
  'Escape geography 1: the parent and child move from the square toward the stone arch (screen LEFT).',
  '', 'Music; footsteps.', 4, 0, twos='ok', tags=['CROWD'], flags=['CLING_ROUTES'])
S('3A-24', 'MS', 'static', 'Vendor@C (in alley behind stall)',
  'Escape geography 2: the vendor stores an empty crate in the alley behind his stall.',
  '', 'Crate set down.', 3, 0, twos='ok', flags=['CLING_ROUTES'])
S('3A-25', 'WS', 'static', 'Guard@C, Gate onto broad road@R',
  'Escape geography 3: a guard checks the gate opening onto the broader road (screen RIGHT).',
  '', 'Gate latch.', 3, 0, twos='ok', flags=['CLING_ROUTES'])
S('3A-26', 'WS', 'slow drift', 'Whole square@C, Crowd@all, Fountain with central stone pillar@C (the reference landmark), Stone support by the steps@R',
  'The last entirely untroubled wide of the square, with the reference landmark (the fountain\'s raised edge and its central stone pillar) and the separate stone support by the steps clearly placed.',
  '', 'Full festival bed.', 4, 1, twos='ok', tags=['CROWD'], diff=4, flags=['CLING_ROUTES'])

# ---------------------------------------------------------------- 3B
scene('3B', set='CLING_SQUARE', tod='DAY', light='Same as 3A.')
S('3B-01', 'MS', 'static', 'Watchman@C (edge of square)',
  'A watchman looks up from the edge of the square.',
  '', 'Festival continues.', 3, 0, twos='ok')
S('3B-02', 'POV', 'static (long lens)', 'White shape@C (against cloud, nearly head-on)',
  'Something white lies against the cloud. It seems still because it is coming nearly toward him.',
  '', 'Festival continues; no warning music.', 4, 0, set='CLING_SKY', twos='no', tags=['WHITE_SCALES'],
  twos_why='Starlight is flying toward camera (slow growth in size): all flying stays on ones.')
S('3B-03', 'WS', 'static (long lens)', 'Starlight (partial)@C',
  'Its changing size exposes its approach. A white wing briefly separates from the cloud behind it. Not yet a full reveal.',
  '', 'Festival continues.', 4, 0, set='CLING_SKY', twos='no', tags=['WHITE_SCALES', 'SCALE'], flags=['STARLIGHT_NO_WOUNDS'])
S('3B-04', 'CU', 'static', 'Watchman@C',
  'The word is swallowed by the music.',
  'L173', 'Music over his voice.', 0.5, 0, twos='ok', tags=['FACE_CLOSEUP'])
S('3B-05', 'MS', 'static', 'Watchman@C',
  'He raises his voice.',
  'L174', '', 0.5, 0, twos='ok')
S('3B-06', 'WS', 'static', 'Guard Captain@R (turning), Crowd@all',
  'The guard captain turns. A few people follow his gaze; others keep eating and talking because a dragon in the world is not automatically an attack.',
  '', 'Music continues; some chatter drops.', 4, 0, twos='ok', tags=['CROWD'], diff=4)
S('3B-07', 'MS', 'static', 'Guard Captain@L, Watchman@C (pointing), King of Cling@R (following the line of his hand)',
  'The watchman points; the king follows the line of his hand.',
  'L175', '', 2.5, 0, twos='ok')
S('3B-08', 'EWS', 'static, landscape-scale', 'Starlight@C (resolving), landscape@all, shadow@C-low',
  'Starlight resolves: white scales take color from daylight, silver highlights, soft gray beneath, a suggestion of crystal-like facets (not transparent crystal, no glow). Immense; scale set by the landscape; her shadow begins to travel toward the village.',
  '', 'Music falters slightly; deep distant wingbeat.', 7, 0, set='CLING_SKY', twos='no', tags=['WHITE_SCALES', 'SCALE'], diff=5,
  flags=['STARLIGHT_NO_WOUNDS', 'STARLIGHT_SIZE'])
S('3B-09', 'CU', 'static', 'King of Cling@C',
  'The king, quietly.',
  'L176', '', 1, 0, twos='ok', tags=['FACE_CLOSEUP'])
S('3B-10', 'MS', 'static two-shot', 'Guard Captain@L, King of Cling@R',
  'The captain sees the king\'s expression and does not ask again.',
  'L177 L178', '', 0, 1, twos='ok')
S('3B-11', 'MS', 'static', 'Guard Captain@C, Arch@L-bg',
  'The captain starts the evacuation.',
  'L179', 'Shout over the music.', 1, 0, twos='ok')
S('3B-12', 'MS', 'static', 'Musicians@C',
  'The music falters one instrument at a time.',
  '', 'Instruments drop out one by one.', 4, 0, twos='ok', tags=['INSTRUMENT_ANIM'])
S('3B-13', 'MS', 'static', 'Vendor@C',
  'The vendor looks up, then puts down what he is holding.',
  '', '', 3, 0, twos='ok')
S('3B-14', 'MS', 'static', 'Parent@C, Child@C',
  'The parent pulls the child closer.',
  '', '', 2.5, 0, twos='ok')
scene('3B', set='CLING_SKY', tod='DAY',
      light='High above the village; bright sky; Starlight front-lit from the south.')
S('3B-15', 'CU', 'air-to-air', 'Queen Fall@C',
  'High above the village: Queen Fall riding Starlight, introduced in a controlled close shot. Not labelled Alexandria. Expression intent, unreadable.',
  '', 'High wind; Starlight\'s slow breath.', 3, 0, twos='no', tags=['FACE_CLOSEUP'], diff=4)
S('3B-16', 'WS', 'air-to-air', 'Queen Fall@C (small), Starlight@C (vast)',
  'Re-establish her smallness against her dragon.',
  '', 'Immense slow wingbeat.', 4, 0, twos='no', tags=['WHITE_SCALES', 'SCALE'], diff=4, flags=['STARLIGHT_NO_WOUNDS'])
S('3B-17', 'POV', 'Queen Fall\'s POV, looking down', 'Cling square (tiny)@C, Crowd (specks)@C',
  'Queen Fall surveys the gathering. No speech about Tara\'s war policy.',
  '', 'Faint festival sound from far below.', 3, 0, twos='no', tags=['CROWD'])
S('3B-18', 'CU', 'air-to-air', 'Queen Fall@C',
  'Low-key authority; no shouting.',
  'L180', '', 0.5, 0, twos='no', tags=['FACE_CLOSEUP'], flags=['ATTACK_NO_FLAME'])
S('3B-19', 'WS', 'air-to-air', 'Starlight@C (wings adjusting, line steepening), Queen Fall@C',
  'Starlight changes posture; her wings adjust; her line steepens into a physical dive. No breath weapon.',
  '', 'Wind pitch rises.', 4, 0, twos='no', tags=['WHITE_SCALES'], flags=['ATTACK_NO_FLAME', 'STARLIGHT_NO_FIRE', 'STARLIGHT_NO_WOUNDS'])
S('3B-20', 'WS', 'static, ground level looking up', 'Starlight@C (growing, lowering), Roofs@bottom, Shadow@L',
  'Ground level: the white shape that seemed beautiful becomes terrifying as it grows and lowers. Her shadow reaches the first roofs.',
  '', 'Deep broad wing noise building.', 5, 0, set='CLING_SQUARE', twos='no', tags=['WHITE_SCALES', 'SCALE', 'CROWD'], diff=4,
  light='Same as 3A; shadow sweeping across.')

# ---------------------------------------------------------------- 3C
scene('3C', set='CLING_SQUARE', tod='DAY',
      light='Daylight progressively veiled by dust; the fountain edge and its central stone pillar stay readable.')
S('3C-01', 'INS', 'static', 'Banner@C',
  'The music has stopped. A banner snaps sharply.',
  '', 'Banner snap in sudden silence.', 2, 0, twos='no', tags=['CLOTH'])
S('3C-02', 'WS', 'static', 'Crowd@all (looking up, starting to move), Arch@L, Broad road@R',
  'The deep, broad wing noise seems to come from the buildings around the crowd. People start to move.',
  '', 'Wing noise from all directions (surround the stereo field).', 3, 0, twos='no', tags=['CROWD'], diff=5, flags=['CLING_ROUTES'])
S('3C-03', 'MS', 'static', 'Guard Captain@L, King of Cling@C (on steps)',
  'The captain reaches for the king. The king pulls toward the nearest people instead of the private exit.',
  'L181', '', 2, 0, twos='no')
S('3C-04', 'MS', 'static', 'King of Cling@C',
  'The king directs the evacuation.',
  'L182', 'Shouted over the noise.', 1, 0, twos='no')
S('3C-05', 'WS', 'high, static', 'Guards@C (widening the flow), Crowd@L (to arch), Crowd@R (to broad road)',
  'The captain redirects guards to widen the flow. Coherent crowd motion: some to the arch (LEFT), others to the broad road (RIGHT). Nobody runs in circles.',
  '', 'Crowd movement; shouted directions.', 5, 0, twos='no', tags=['CROWD'], diff=5, flags=['CLING_ROUTES'])
S('3C-06', 'MS', 'handheld-feel', 'Vendor@C, stall cloth@C',
  'The vendor\'s stall cloth tears free and wraps across his view; he fights it aside.',
  '', 'Cloth tearing and snapping.', 4, 0, twos='no', tags=['CLOTH'], diff=4)
S('3C-07', 'MS', 'handheld-feel', 'Musician@C, fallen person@C',
  'The musician helps a fallen person rise.',
  '', 'Crowd.', 3, 0, twos='no', tags=['CROWD'])
S('3C-08', 'MS', 'static', 'Parent@C, Child@C, parcel@C (falling)',
  'The parent loses hold of the parcel and lets it go rather than letting go of the child.',
  '', 'Parcel hits stone.', 3, 0, twos='no')
S('3C-09', 'WS', 'static, looking up from the square', 'Starlight@C (wings partly folded, descending)',
  'Continuous flight path, part 1-2: high approach, descent toward the square, wings partly folded.',
  '', 'Air roar building.', 3.5, 0, twos='no', tags=['WHITE_SCALES', 'SCALE'], diff=4, flags=['STARLIGHT_NO_WOUNDS'])
S('3C-10', 'EWS', 'static exterior', 'Starlight@C (wings opening), Village@bottom',
  'Her wings open with crushing force as she changes angle over the village.',
  '', 'Huge wing crack; air shock.', 3, 0, set='CLING_SKY', twos='no', tags=['WHITE_SCALES', 'SCALE'], diff=4, flags=['STARLIGHT_NO_WOUNDS'])
S('3C-11', 'WS', 'static (one readable wide)', 'Starlight@C (low destructive sweep), festival structures@L, roofline@L',
  'FIRST IMPACT, one readable wide: her body strikes the edge of the festival structures and adjoining roofline. Timber breaks, tiles scatter, decorations vanish in dust. Contact staged with the approved model\'s anatomy (no changed legs/claws/wings).',
  '', 'Timber splintering; tiles cascading; crowd screams under it.', 5, 0, twos='no', tags=['DESTRUCTION', 'DUST', 'WHITE_SCALES', 'CROWD'], diff=5,
  flags=['STARLIGHT_NO_FIRE', 'STARLIGHT_NO_WOUNDS'])
S('3C-12', 'WS', 'static', 'Abandoned stall@L (swept into square), Fountain edge@C',
  'Back to the people: the force sweeps the abandoned stall into the square.',
  '', 'Wooden stall tumbling over stone.', 3, 0, twos='no', tags=['DESTRUCTION', 'DUST'], diff=5)
S('3C-13', 'MS', 'static', 'King of Cling@R, Guard Captain@R (behind stone support), fragments@L',
  'The king and the captain move behind a stone support as fragments pass.',
  'L183', 'Debris whistling past stone.', 3, 0, twos='no', tags=['DESTRUCTION', 'DUST'], diff=4)
S('3C-14', 'MS', 'low, static', 'Feet@all, cloth@C, Fountain edge with central stone pillar@C (reference)',
  'Several seconds of dust, cloth and moving feet, with the fountain edge and its central stone pillar as the continuous point of reference.',
  '', 'Muffled chaos; coughing.', 5, 0, twos='no', tags=['DUST', 'CROWD', 'CLOTH'], diff=5, flags=['CLING_ROUTES'])
S('3C-15', 'WS', 'static', 'Parent@L, Child@L, Arch@L, fallen beam@L',
  'The parent reaches the arch with the child. A fallen beam blocks part of the route.',
  '', 'Crowd pressure at the arch.', 3, 0, twos='no', tags=['CROWD', 'DUST'], flags=['CLING_ROUTES'])
S('3C-16', 'MS', 'static', 'Guards@C (x2), Musician@C, beam@C',
  'Two guards and the musician push the beam enough for people to pass. Brief effort under danger.',
  '', 'Strain; wood scraping.', 5, 0, twos='no', tags=['BODY_MECHANICS', 'DUST'], diff=4)
S('3C-17', 'MS', 'static', 'Parent@L, Child@L',
  'Through the arch.',
  'L184 L185 L186', 'Dust-muffled voices.', 1, 0, twos='no')
S('3C-18', 'WS', 'follow up into sky', 'Starlight@C (climbing with effort), Queen Fall@C, dust@bottom',
  'Above the dust, Starlight rises. It takes visible effort to redirect such an immense body. Queen Fall moves with the climb. No hovering.',
  '', 'Labored huge wingbeats.', 6, 0, set='CLING_SKY', twos='no', tags=['WHITE_SCALES', 'DUST', 'SCALE'], diff=4, flags=['STARLIGHT_NO_WOUNDS'])
S('3C-19', 'MS', 'static', 'King of Cling@C (emerging), Guard@L',
  'On the ground the king emerges from partial cover. A guard reaches him.',
  'L187 L188 L189', '', 2, 0, twos='no', tags=['DUST'])
S('3C-20', 'CU', 'static', 'King of Cling@C (looking up)',
  'The king looks up. The warning is true.',
  '', '', 2, 0, twos='no', tags=['FACE_CLOSEUP', 'DUST'])
S('3C-21', 'EWS', 'slow pan', 'Starlight@C (banking beyond the village), Village@bottom (damaged)',
  'Broad view: Starlight\'s bank beyond the village, her whiteness catching the light, momentarily serene against the destruction. Score: rising flight shape with unresolved low tones.',
  '', 'Score enters; distant crowd.', 6, 0, set='CLING_SKY', twos='no', tags=['WHITE_SCALES', 'SCALE', 'DUST'], diff=4, flags=['STARLIGHT_NO_WOUNDS'])
S('3C-22', 'CU', 'air-to-air', 'Queen Fall@C (looking down)',
  'Queen Fall looks down at the square. No smile, no battle speech.',
  '', 'High wind.', 3, 0, set='CLING_SKY', twos='no', tags=['FACE_CLOSEUP'], diff=4)
S('3C-23', 'MS', 'static (standard Cling orientation, seen from the steps side)', 'Vendor@R (crawling clear, looking screen L), Musician@L-bg (at the arch)',
  'At ground level the vendor crawls clear of the wrecked stall and looks screen LEFT toward the musician, still helping at the arch. The arch stays screen LEFT of the stall, as on the fixed Cling map.',
  '', 'Settling debris.', 4, 0, twos='no', tags=['DUST'], flags=['CLING_ROUTES'])
S('3C-24', 'MS', 'static (standard Cling orientation)', 'Vendor@R, Musician@L (leaving the arch, moving R toward him)',
  'The musician abandons the last festival equipment at the arch and follows. Nobody repeats their earlier joke.',
  'L190', '', 2.5, 0, twos='no', tags=['DUST'], flags=['CLING_ROUTES'])
S('3C-25', 'MS', 'static', 'People@C (hiding), shadow@all',
  'SECOND LOW PASS (proposed addition). Camera stays with the people: the shadow sweeps over them.',
  '', 'Wing noise rising again.', 3, 0, twos='no', tags=['CROWD', 'DUST'], diff=4)
S('3C-26', 'WS', 'low, looking up between roofs', 'Starlight (white underside)@top, roofs@L/R',
  'A white expanse fills the gap between roofs.',
  '', 'Roaring air.', 2.5, 0, twos='no', tags=['WHITE_SCALES'], flags=['STARLIGHT_NO_WOUNDS'])
S('3C-27', 'WS', 'static', 'Empty ground@C, debris@C',
  'The shock of air; debris strikes empty ground where people stood moments earlier.',
  '', 'Debris impacts; tiles shattering.', 3.5, 0, twos='no', tags=['DESTRUCTION', 'DUST'], diff=5)
S('3C-28', 'EWS', 'static exterior (the single damage wide)', 'Village@C (damaged), Starlight@R (pulling up beyond roofs)',
  'The single exterior wide shot establishing the actual physical damage. She pulls up beyond the roofs. No defending fleet, no new wounds.',
  '', 'Distant destruction; wingbeats receding.', 5, 0, set='CLING_SKY', twos='no', tags=['DESTRUCTION', 'DUST', 'WHITE_SCALES'], diff=5,
  flags=['STARLIGHT_NO_WOUNDS', 'STARLIGHT_NO_FIRE'])
S('3C-29', 'MS', 'static', 'King of Cling@L, Guard Captain@R, Adult Villager@C (conscious, frightened)',
  'The king helps the guard captain pull an injured adult villager into shelter. No named casualty.',
  '', 'Strain; villager\'s breath.', 4, 0, twos='no', tags=['BODY_MECHANICS', 'DUST'], diff=4)
S('3C-30', 'MS', 'static', 'Adult Villager@C, King of Cling@L, Guard@R',
  'He turns to the guard and waits for an acknowledgement rather than promising everyone is safe.',
  'L191 L192 L193', '', 1.5, 0, twos='no')
S('3C-31', 'WS', 'static, low', 'Starlight@top (clearing roofline), last banner@C',
  'Starlight\'s body clears the roofline; her wake pulls the remaining banner loose from the square.',
  '', 'Banner ripping free.', 3, 0, twos='no', tags=['CLOTH', 'WHITE_SCALES'], diff=4)
S('3C-32', 'WS', 'tilt up following the banner', 'Banner@C (rising), Starlight underside@top',
  'The banner travels upward, briefly visible against her vast underside, then disappears into dust.',
  '', 'Wind howl fading.', 4, 0, twos='no', tags=['CLOTH', 'DUST', 'WHITE_SCALES'], diff=5)
S('3C-33', 'MS', 'static', 'Guard Captain@L, King of Cling@C (under stone cover)',
  'The captain finally gets the king under substantial stone cover. The king looks out through the opening.',
  '', 'Settling dust; distant cries.', 4, 0, twos='no', tags=['DUST'])
S('3C-34', 'POV', 'static', 'Square@C (through the opening), Fountain edge@C',
  'The square he addressed only minutes before.',
  '', 'Almost silent; dust falling.', 3, 1, twos='ok', tags=['DUST'])

# ---------------------------------------------------------------- 3D
scene('3D', set='CLING_SKY', tod='DAY (moments later)',
      light='Dust haze over the village; clearer air above.')
S('3D-01', 'EWS', 'static', 'Starlight@C (climbing away beyond the village)',
  'Starlight climbs beyond the village, visible long enough to show the passes have ended, though nobody below can know if she will return.',
  '', 'Receding wingbeats; wind.', 6, 0, twos='no', tags=['WHITE_SCALES'], flags=['STARLIGHT_NO_WOUNDS'])
S('3D-02', 'WS', 'air-to-air', 'Queen Fall@C, Starlight@C',
  'High aerial: Queen Fall does not speak. Starlight\'s breathing and wings fill the shot.',
  '', 'Starlight\'s breathing; wings.', 5, 0, twos='no', tags=['WHITE_SCALES', 'SCALE'], flags=['STARLIGHT_NO_WOUNDS'])
scene('3D', set='CLING_SQUARE', tod='DAY (moments later)',
      light='Dusty, dimmed daylight; fine dust still falling.')
S('3D-03', 'INS', 'static', 'Loose metal fitting@C (striking stone)',
  'Cut down to the smallness of the square\'s sounds.',
  '', 'Ringing ears giving way to coughing, wood settling, distant cries, one loose metal fitting striking stone in the wind. The festival tune does not resume.', 4, 0, twos='ok', tags=['DUST'])
S('3D-04', 'WS', 'the 3A-01 route, stopping where it is blocked', 'Debris@C, Street@C',
  'The same route as the opening festival shot, now blocked. The camera moves only as far as it can.',
  '', 'Sparse sounds.', 6, 0, twos='no', tags=['DUST', 'DESTRUCTION'], diff=4, flags=['CLING_ROUTES'])
S('3D-05', 'MS', 'static', 'Torn stall@C',
  'Familiar places changed: the torn stall.',
  '', '', 2.5, 0, twos='ok', tags=['DUST', 'CLOTH'])
S('3D-06', 'MS', 'static', 'Silent music space@C',
  'The silent music space.',
  '', '', 2.5, 0, twos='ok', tags=['DUST'])
S('3D-07', 'WS', 'static', 'Empty steps@R, Stone arch (still standing)@L',
  'The empty steps; the stone arch still standing.',
  '', '', 3, 0.5, twos='ok', tags=['DUST'], flags=['CLING_ROUTES'])
S('3D-08', 'MS', 'static', 'Parent@C, Child@C (under shelter)',
  'The parent sits with the child under shelter. Both alive. The child looks toward the opening; the parent gently turns their attention away from the falling dust.',
  '', 'Quiet breathing; dust trickle.', 5, 0, twos='ok', tags=['DUST'])
S('3D-09', 'MS', 'static', 'Vendor@L, Musician@R',
  'The vendor finds the musician and takes his arm to check that he is standing. They say nothing.',
  '', '', 5, 1, twos='ok', tags=['DUST', 'HANDS_CONTACT'])
S('3D-10', 'WS', 'static', 'King of Cling@C (dust on clothing), Guard Captain@C',
  'The king walks into the edge of the square with the guard captain. Dust marks his clothing. No crown gag. He has work to do.',
  '', 'Footsteps on rubble.', 4, 0, twos='ok', tags=['DUST'])
S('3D-11', 'MS', 'static two-shot', 'King of Cling@L, Guard Captain@R',
  'Practical orders under pressure.',
  'L194 L195 L196', '', 0, 0, twos='ok')
S('3D-12', 'MS', 'static', 'Guard Captain@R (looking toward the receding white shape)',
  'The captain looks toward the receding white shape.',
  'L197', '', 1.5, 0, twos='ok')
S('3D-13', 'CU', 'static', 'King of Cling@L',
  'Ending bridge (proposed): a messenger order, not the next episode\'s investigation.',
  'L198', '', 0, 1, twos='ok', tags=['FACE_CLOSEUP'])
S('3D-14', 'WS', 'static', 'King of Cling@C, surviving cloth strip@R',
  'The captain leaves to act. The king remains a moment, looking at the damaged square. A faint gust moves one surviving strip of festival cloth.',
  '', 'Faint gust.', 5, 1, twos='ok', tags=['CLOTH', 'DUST'])
S('3D-15', 'EWS', 'static (very slow push)', 'Village@C (small in landscape), Starlight@far-R (white moving shape)',
  'FINAL PICTURE: wide from above the roofs. The village is small in its landscape. Far beyond, Starlight is a white moving shape, beautiful again at a distance. Cut to black before she disappears entirely.',
  '', 'Wind.', 6, 1, set='CLING_SKY', twos='no', tags=['WHITE_SCALES'], flags=['STARLIGHT_NO_WOUNDS'])
S('3D-16', 'CARD', 'none (black)', '',
  'Black.',
  '', 'One final heavy wingbeat carries into darkness. Silence follows.', 3, 1, set='CARD_BLACK', render='black')

# ---------------------------------------------------------------- END
scene('END', set='CARD_BLACK', tod='n/a', light='Text on black.')
S('E-01', 'CARD', 'static text (or slow roll)', '',
  'End titles. Restrained main theme, no cheerful resolution. Credit ONLY real contributors and real tools/assets with their licenses. No invented cast, studio, or licensed music.',
  '', 'Restrained main theme.', 40, 0, render='text',
  note='Length depends on real credits; 30-60 s is plenty for a small credit list.')
