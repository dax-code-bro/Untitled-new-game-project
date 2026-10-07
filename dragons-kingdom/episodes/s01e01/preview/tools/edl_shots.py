"""edl_shots.py - the authored editorial decisions for the S01E01 work-in-progress preview.

Read by build_edl.py (never run on its own). Everything that is a creative or
staging decision lives here; everything that is arithmetic (frames, in-points,
caption sync, totals) is computed by build_edl.py from shotlist.json and the
real voice takes (vo/takes.json, vo/words.json).

Per shot:
  cam     lens (mm, Super 35 like the style frames), move, framing, stop, height, focus
  trans   transition INTO the shot: ('cut',) | ('dissolve', frames) | ('fade_in', frames) | ('match_cut',)
          (a dissolve is centred on the cut; each side renders frames/2 extra as handles)
  who     [(name, screen position, how they are seen)] - what is in frame in THIS preview staging
  lines   [(line_id, seconds)]: the first number is the lead (shot start -> first audible sound of
          the take), every later number is the cue gap (previous line's speech end -> this line's
          first audible sound). ('L061', 'end', 0.25) = speech ends 0.25 s before the cut.
  dur     seconds, only where the shot is NOT held at shotlist.json est_seconds (see build_edl.py)
  min_tail seconds of hold required after the last line (default 0.3)
  beats   [(time, text)] time = seconds from shot start, or an anchor: 'end-0.5', 'L018' (speech in),
          'L018.end+0.3' (speech out + 0.3)
  sfx     [(time, sfx id from SFX in build_edl.py, note)]
  real    (codes, text): how people are staged while faces / lip-sync are unfinished
          codes: BACK (from behind / lost profile), WIDE (people small in frame), SIL (silhouette /
          contre-jour), HANDS (hands and props carry the action), DOF (shallow focus, faces soft),
          OTS (over the shoulder), OFF (speaker off screen), NONE (no people in frame)
  needs   [(item, status, closest honest substitute)]  status: exists | exists-wip | small-build |
          missing.  'exists-wip' = exists and is being improved by the model-quality workflow.
  cost    render cost class (see render_plan.py COST), default = the set's class
  mode    'velocity' (default: velocity motion blur, measured style-frame finish) | 'accumulate8'
  note    anything else the editor must know
"""

S = []


def shot(id, **kw):
    kw['id'] = id
    S.append(kw)


def cam(lens, move, framing, **kw):
    d = {'lens_mm': lens, 'sensor': 'Super 35', 'move': move, 'framing': framing}
    d.update(kw)
    return d


# ---------------------------------------------------------------- shared wording
CONTRE = ('sun over the sea behind the riders as seen from the inland camera; exposure set for the '
          'bright sea, no face fill, so faces sit 2-3 stops under in soft sky shade')
NO_LIPSYNC = 'mouth not readable (lip-sync not built yet)'

# ======================================================================= PROLOGUE
shot('P-01', cam=None, trans=('cut',),
     who=[],
     beats=[(0, 'Black. The work-in-progress card has just faded out.'),
            (0, 'Waves fold against a rocky shore, unseen.'),
            (2.0, 'A single seabird calls.')],
     sfx=[(0, 'waves_rock', 'fade up from silence over 12 frames'),
          (2.0, 'seabird', 'one call, far left; no music yet')],
     real=('NONE', 'Black frame.'),
     needs=[])

shot('P-02', cam=cam(24, 'slow forward travel at 2 m/s, riding the swell (boat-mounted, light vehicle shake)',
                     'extreme wide; horizon on the upper third; pale sky reflected between moving bands of deep blue',
                     height='1.2 m above the sea', stop='T5.6', focus='infinity'),
     trans=('fade_in', 36),
     who=[('Open sea and dawn sky', 'C', 'horizon on the upper third; no people, no ship yet')],
     beats=[(0, 'Picture fades up from black over 1.5 s.'),
            (1.5, 'Low over the water; long swell rolls toward camera.'),
            (4.0, 'A cat\'s-paw of wind darkens the water ahead.')],
     sfx=[(0, 'sea_wash', 'open-water wash rises under the waves on rock')],
     real=('NONE', 'No people: sea and sky only.'),
     needs=[('Dawn sea, sky and fog (style frame F1)', 'exists', '')])

shot('P-03', cam=cam(35, 'slow forward travel toward the island (F1 camera: 2.6 m above the sea)',
                     'extreme wide; island C-bg with its high ground lost in a cloud cap; the knarr crosses the foreground L to C',
                     height='2.6 m', stop='T5.6', focus='hyperfocal'),
     who=[('Island', 'C-bg', 'high ground in cloud'),
          ('Wooden vessel (knarr)', 'L-fg to C', 'small and unremarkable, heeling to the wind'),
          ('Crew (2)', 'on the knarr, L-fg', 'specks at this distance, backs to camera')],
     lines=[('L001', 2.5)],
     beats=[(0, 'Island ahead in cloud; the sea glitters toward the low sun.'),
            (1.0, 'The knarr\'s bow enters frame left.'),
            ('L001', 'Narrator begins.'),
            ('L001.end+1.0', 'The square sail fills; the vessel crosses mid-frame.'),
            ('end-1.0', 'Stern passes centre; its wake trails left.')],
     sfx=[(3.5, 'rigging_creak', 'as the vessel crosses, panned L to C'),
          (6.0, 'hull_slap', 'bow wave slap')],
     real=('WIDE', 'Crew are a few pixels high on a distant deck; no faces.'),
     needs=[('Knarr (sets/ship.js) with optional crew', 'exists', ''),
            ('Island in cloud (F1 terrain + volumetric banks)', 'exists', '')])

shot('P-04', cam=cam(65, 'static, slight boat sway', 'insert: a weathered hand pulls a rope tight around a wooden belaying pin; sea soft behind',
                     stop='T2.8', focus='0.6 m on the knuckles'),
     who=[('Sailor (right hand only)', 'C', 'hand and forearm; sleeve edge')],
     beats=[(0.2, 'The hand grips the rope.'),
            (1.2, 'Two hard pulls; the rope creaks.'),
            (2.4, 'He makes the turn fast around the pin.')],
     sfx=[(1.2, 'rope_creak', 'two pulls'), (2.0, 'hull_slap', 'water slap on the hull')],
     real=('HANDS', 'Only a hand and rope: the human action carries scale without a face.'),
     needs=[('Sailor hand gripping a rope (humans: sailor1, real cylinder grips)', 'exists-wip', ''),
            ('Hero rope + belaying pin for a close insert', 'small-build',
             'A twisted three-strand tube along a curve plus a turned wooden pin (PBR wood scan); ship.js rigging is built for distance only.')])

shot('P-05', cam=cam(40, 'static, slight boat sway (vehicle shake)',
                     'medium-wide from behind and a little above at the stern: the sailor\'s back and shoulders, the sail and the fog beyond',
                     stop='T4', focus='3 m on his shoulders'),
     who=[('Sailor', 'C', 'from behind / back three-quarter; head turns up and right, face never toward camera')],
     beats=[(0.4, 'He coils a line.'),
            (1.2, 'A low sound above the fog.'),
            (1.6, 'He stops; his head turns up and to the right toward it.'),
            (2.8, 'He holds, listening.')],
     sfx=[(1.2, 'low_sound_fog', 'not a roar: a deep moving pressure, above and right')],
     real=('BACK', 'Seen from behind; his face stays away from camera (the shot list already keeps him anonymous).'),
     needs=[('Sailor (humans: sailor1)', 'exists-wip', ''),
            ('Knarr deck detail at medium distance', 'exists', 'ship.js was designed for wides: check the deck at this distance; hide the rail with the sailor\'s body if it is too simple.'),
            ('Body motion: coiling, then turning the head', 'small-build',
             'Humans have baked poses + idle; drive head yaw/pitch and a small arm IK cycle (people.js armIK) on the baked pose.')])

shot('P-06', cam=cam(28, 'static, low angle up into the fog from deck height',
                     'wide; bright fog fills the frame; the masthead just enters at frame left',
                     stop='T5.6', focus='infinity'),
     who=[('Fog bank', 'C', ''), ('Unidentified shadow', 'R-bg to L', 'only a shadow through the sunlit fog; never a dragon')],
     beats=[(0, 'Bright fog, light shafts from the low sun.'),
            (1.5, 'The mist darkens at frame right.'),
            (2.0, 'A vast wedge of shadow sweeps right to left through the shafts.'),
            (4.5, 'It is gone; the fog closes.')],
     sfx=[(1.8, 'pressure_swell', ''), (2.6, 'distant_wingbeat', 'felt more than heard; low-passed, no identity')],
     real=('NONE', 'No people in frame.'),
     needs=[('Shadow-only body in the sun\'s shadow map + soft silhouette card in the fog (F1 technique)', 'exists', '')])

shot('P-07', cam=cam(50, 'static', 'medium from behind at deck height: the sailor a dark shape against the bright fog',
                     stop='T4', focus='4 m'),
     who=[('Sailor', 'C', 'from behind, silhouette against the fog')],
     beats=[(0, 'He is completely still.'),
            (2.0, 'A thread of fog drifts across him.')],
     sfx=[(0, 'sea_wash', 'sea sound drops 6 dB over 12 frames: silence around him')],
     real=('SIL', 'Back to camera, silhouetted against the fog (shot list P-07).'),
     needs=[('Sailor (humans: sailor1)', 'exists-wip', '')])

# P-08 .. P-15: durations are computed from the narrator's words in build_edl.py (the "prologue words-driven block"; place-name timing constants and CITADEL_SPLICE at the top of that file)
shot('P-08', cam=cam(50, 'slow lateral drift (aerial, 30 m up, offshore)',
                     'extreme wide: a coastal settlement of timber and stone houses under a pale sky; no map, no borders',
                     stop='T5.6', focus='infinity'),
     trans=('dissolve', 12),
     who=[('Coastal settlement', 'C', 'roofs and a quay at ~1 km; no readable people')],
     lines=[('L002', 2.0)],
     beats=[(0, 'Dissolve in from the sailor.'), ('L002', 'Narrator: "The seas had names. The kingdoms had borders."')],
     sfx=[(0, 'wind_low', 'low wind; no music yet')],
     real=('NONE', 'People would be specks; none are placed.'),
     needs=[('Settlement: town.js houses + buildings.js + terrain + ocean', 'exists',
             'Library pieces exist; the vista needs to be assembled as a set.')])

shot('P-09', cam=cam(35, 'slow drift, 15 m above the water', 'extreme wide: open sea to the horizon, horizon on the lower third',
                     stop='T5.6', focus='infinity'),
     trans=('dissolve', 12),
     who=[('Open sea', 'C', '')],
     beats=[(0, 'Dissolve in during the narrator\'s pause.'), ('L002.end', 'Narration ends; the sea holds.')],
     sfx=[(0, 'sea_wash', 'wide sea wash')],
     real=('NONE', 'No people.'),
     needs=[('FFT ocean + HDRI sky', 'exists', '')])

shot('P-10', cam=cam(85, 'slow drift (long lens from the sea, ~2 km out)', 'extreme wide: a forest reaching a cliff edge; one landscape, no other place in view',
                     stop='T8', focus='infinity'),
     trans=('dissolve', 12),
     who=[('Forest and cliff', 'C', '')],
     beats=[(0, 'Dissolve in.'), ('L003', 'Narrator: "Tara." Caption TARA appears with the word.')],
     sfx=[(0, 'wind_low', 'wind in trees')],
     real=('NONE', 'No people.'),
     needs=[('Forest on a sea cliff', 'exists-wip',
             'Kitbash cliff + instanced conifers (ph_fir_sapling scaled to tree size) + ph_island_tree_02; at 2 km in haze they read as forest. The nature library being built may replace them.')],
     note='Caption TARA synced to the spoken word (onscreen-text.json T01).')

shot('P-11', cam=cam(100, 'slow drift', 'extreme wide: distant fortified walls and towers on a ridge',
                     stop='T8', focus='infinity'),
     trans=('dissolve', 8),
     who=[('Distant fortified walls', 'C', '')],
     beats=[(0, 'Dissolve in.'), ('L003', 'Narrator: "Scrapper." Caption SCRAPPER with the word.')],
     sfx=[(0, 'wind_low', 'distant wind')],
     real=('NONE', 'No people.'),
     needs=[('Fortified walls and towers (sets/buildings.js walls, towers, field walls)', 'exists', '')],
     note='Caption SCRAPPER (T02).')

shot('P-12', cam=cam(50, 'slow drift', 'extreme wide: a misted island alone in frame, seen from open water',
                     stop='T5.6', focus='infinity'),
     trans=('dissolve', 8),
     who=[('Misted island', 'C', 'alone in frame')],
     beats=[(0, 'A separate dissolve: nothing implies Verdor is near Scrapper.'), ('L003', 'Narrator: "Verdor." Caption VERDOR.')],
     sfx=[(0, 'sea_wash', 'soft sea wash')],
     real=('NONE', 'No people.'),
     needs=[('Island in mist (F1 island from a new angle)', 'exists', '')],
     note='Caption VERDOR (T03).')

shot('P-13', cam=cam(35, 'slow drift, 6 m above flat calm water', 'extreme wide: calm open water under a high bright sky; no coastline',
                     stop='T8', focus='infinity'),
     trans=('dissolve', 8),
     who=[('Open water (calm)', 'C', '')],
     beats=[(0, 'Dissolve in.'), ('L003', 'Narrator: "The Citadel Sea." Caption CITADEL SEA.'),
            ('end-0.5', 'A breath (opened in the edit): the caption fades and the calm sea holds.')],
     sfx=[(0, 'sea_wash', 'calm open-water wash')],
     real=('NONE', 'No people.'),
     needs=[('Calm sea + clear-day HDRI (cloud_layers)', 'exists', '')],
     note='Caption CITADEL SEA (T04). The TTS narrator says both seas in one breath, so the take is cut once at the '
          'silent word boundary after "The Citadel Sea" and a short breath is opened there (build_edl.py CITADEL_SPLICE); '
          'this caption gets its own hold. A human narrator would pause here naturally.')

shot('P-14', cam=cam(35, 'slow drift, 10 m up, riding a long swell', 'extreme wide: a different stretch of water, long swell under low cloud, different light; no coastline',
                     stop='T5.6', focus='infinity'),
     trans=('dissolve', 6),
     who=[('Open water (long swell, low cloud)', 'C', '')],
     beats=[(0, 'Its own short dissolve, inside the narrator\'s breath: the two seas never share one view.'),
            ('L003', 'Narrator: "and the Proxy Sea." Caption PROXY SEA appears on "Proxy".')],
     sfx=[(0, 'sea_wash', 'heavier swell')],
     real=('NONE', 'No people.'),
     needs=[('Swell sea + overcast misty HDRI (kloppenheim_01)', 'exists', '')],
     note='Caption PROXY SEA (T05).')

shot('P-15', cam=cam(75, 'very slow push', 'extreme wide: unreached islands low on the far horizon in haze; no caption',
                     stop='T5.6', focus='infinity'),
     trans=('dissolve', 12),
     who=[('Unreached islands', 'far-C', 'silhouettes 20-30 km out')],
     beats=[(0, 'Dissolve in.'),
            ('L003', '"Seven kingdoms, and undiscovered islands beyond the familiar shores."'),
            ('L003.end+0.6', 'Narration ends. Music M1 enters: one low sustained string tone.'),
            ('L003.end+4.5', 'The restrained rising theme begins. The landscape breathes.')],
     sfx=[(0, 'sea_wash', 'distant, quiet')],
     real=('NONE', 'No people.'),
     needs=[('Distant islands (terrain silhouettes in aerial perspective)', 'exists', '')])

shot('P-16', cam=cam(32, 'slow tilt up across the sky', 'wide: a wing-shaped cloud drifts across a brightening sky; first clear sunlight',
                     stop='T8', focus='infinity'),
     trans=('dissolve', 24),
     who=[('Wing-shaped cloud', 'C', 'reads as cloud first')],
     lines=[('L004', 2.5)],
     beats=[(0, 'Dissolve in; the tilt begins.'), ('L004', 'Narrator over the theme.'),
            ('end-2.0', 'The cloud\'s trailing edge thins like a wingtip.')],
     sfx=[(0, 'wind_low', 'high wind, very quiet under the music')],
     real=('NONE', 'No people.'),
     needs=[('Wing-shaped cloud', 'missing',
             'Closest honest: six to eight volumetric mist banks (the fog system takes up to 8) arranged as a spread wing, lit by the morning sun, drifting; '
             'or fx.js silhouetteCard of a wing blurred into cloud. It must read as cloud before it reads as a wing.')])

shot('P-17', cam=cam(35, 'high angle (25 m crane/aerial), static, then a slight follow left to right',
                     'wide: the meadow edge in clear morning sun; an immense shadow travels across the grass; no buildings, no dragon',
                     stop='T5.6', focus='infinity'),
     trans=('match_cut',),
     who=[('Dragon shadow (unidentified)', 'L to R', 'shadow only')],
     lines=[('L005', 1.2)],
     beats=[(0, 'Match cut from the cloud: empty grass in sun.'),
            (0.8, 'The shadow\'s edge enters frame left.'),
            ('L005', '"This is where our story begins."'),
            (3.8, 'The shadow covers the frame; the grass rushes.'),
            (5.6, 'The shadow leaves frame right.'),
            ('end-0.4', 'Cut before the dragon is identified.')],
     sfx=[(3.6, 'grass_rush', ''), (3.9, 'heavy_wingbeat', 'one, under the music')],
     real=('NONE', 'No people.'),
     needs=[('Riding-grounds terrain and grass (style frame F2)', 'exists', ''),
            ('Shadow-only dragon body', 'exists', 'Same technique as F1: a shadow-casting body with no colour pass.')],
     cost='meadow')

shot('T-01', cam=cam(75, 'very slow push', 'close: the dark surface of a closed egg, one warm lamp rim; title over the dark shell',
                     stop='T2', focus='0.9 m on the shell'),
     trans=('cut',),
     who=[('Egg (closed)', 'C', '')],
     beats=[(0, 'Near-dark; a warm rim of lamplight on the shell.'),
            (1.0, 'Title DRAGON\'S KINGDOM fades in over the dark shell.'),
            (5.0, 'Music resolves and falls away.'),
            (6.3, 'A quiet scratch from inside the egg; the music is gone.')],
     sfx=[(0, 'room_tone_chamber', 'very low'), (6.3, 'egg_scratch', 'one small scratch from within')],
     real=('NONE', 'No people.'),
     needs=[('Egg shell material and lamp (style frame F4)', 'exists', ''),
            ('Closed (unbroken) egg state', 'small-build', 'F4 cuts the broken end in the shell shader; the closed egg is the same mesh with the cut disabled.')],
     cost='chamber')

# ======================================================================= 1A
shot('1A-01', cam=cam(100, 'static (macro)', 'close: the egg on the bedding; a fine crack runs from an existing fracture, then stops',
                      stop='T2.8', focus='0.35 m on the fracture'),
     trans=('cut',),
     who=[('Egg', 'C', '')],
     beats=[(0.5, 'Lamplight on the dark shell; an old fracture.'),
            (1.5, 'A fine crack extends from it...'),
            (2.4, '...and stops.'),
            (3.5, 'Something scrapes inside, smaller than the prologue sound.')],
     sfx=[(1.5, 'shell_tick', ''), (3.5, 'egg_scratch', 'inner scrape, smaller'), (0, 'lamp_hiss', 'bed')],
     real=('NONE', 'No people.'),
     needs=[('Animated crack growth on the shell', 'small-build',
             'A dark crack line in the F4 shell shader whose length is a function of t (noise path from the old fracture).')])

shot('1A-02', cam=cam(24, 'slow tilt down from the high opening to the nest', 'wide: the chamber - prepared bedding, bowls of water, folded cloth; no magical apparatus',
                      stop='T2.8', focus='4 m'),
     who=[('Attendant', 'L', 'small, side-back view, folding a cloth'), ('Nest + egg', 'C', ''), ('Door', 'L-bg', 'closed')],
     beats=[(0, 'The cool shaft from the high opening, dust in the light.'),
            (2.5, 'The tilt reveals the bowls, the folded cloth, the bedding.'),
            (4.5, 'The attendant at left smooths a cloth, back half to camera.')],
     sfx=[(0, 'room_tone_chamber', 'faint wind beyond the high opening')],
     real=('WIDE', 'Wide; the attendant is small and turned toward the nest.'),
     needs=[('Full chamber for wide shots (walls, high opening, door, plinth)', 'small-build',
             'F4 is a tight close set (walls are environment cards). Extend with sets/buildings.js stone walls with real openings (a high arched window, a door) and the F4 materials; the architecture library being built may supply this.'),
            ('Attendant (humans: attendant)', 'exists-wip', '')])

shot('1A-03', cam=cam(40, 'static', 'medium from behind the attendant\'s right shoulder toward the door: Alexandria enters as a dark shape against the corridor light',
                      stop='T2.8', focus='2.5 m on the doorway'),
     who=[('Attendant', 'L-fg', 'from behind, soft'), ('Alexandria', 'L-bg (door)', 'silhouette in the bright doorway')],
     beats=[(0.3, 'The attendant\'s head turns to the door.'),
            (1.0, 'The door opens; no announcement.'),
            (1.6, 'Alexandria steps in, backlit.'),
            (2.8, 'The attendant starts to bow.'),
            (3.3, 'Alexandria stops it with a small raised hand: the egg has moved.'),
            (4.1, 'Both look to the egg.')],
     sfx=[(1.0, 'door_latch', ''), (1.6, 'footsteps_stone', 'three steps'), (2.9, 'cloth', 'the bow begins')],
     real=('BACK SIL', 'Attendant from behind; Alexandria a silhouette in the doorway; the raised hand reads as a shape.'),
     needs=[('Alexandria (humans: alexandria)', 'exists-wip', 'In CAST; its cache is being rebuilt by the model workflow - check before rendering.'),
            ('Door + bright corridor', 'small-build', 'Part of the chamber extension (1A-02).'),
            ('Body motion: two steps in, start of a bow, raised hand', 'missing',
             'Humans have baked poses + idle only. Closest honest: people.js walk action on the person adapter for the two steps, the bow as a spine/head lean on the baked pose, the hand by two-bone arm IK (people.js armIK). Kept small and backlit.')])

shot('1A-04', cam=cam(50, 'static two-shot, slight push (5 %)', 'medium across the nest: the egg sharp in the foreground, the two women soft behind it at either side',
                      stop='T2', focus='0.8 m on the egg'),
     who=[('Egg', 'C-fg', 'sharp'), ('Attendant', 'L', 'soft, in lamplight shadow'), ('Alexandria', 'R', 'soft, rim from the window shaft')],
     lines=[('L006', 0.6), ('L007', 0.4), ('L008', 0.35), ('L009', 0.4)],
     beats=[('L006', 'Attendant, low.'), ('L007', 'Alexandria.'), ('L008.end+0.1', 'A shell tick under the dialogue.'),
            ('L009.end+0.4', 'Alexandria moves toward the nest.')],
     sfx=[('L008.end', 'shell_tick', 'under the dialogue')],
     real=('DOF', 'Focus stays on the egg; both women are soft shapes behind it. ' + NO_LIPSYNC),
     needs=[('Alexandria, attendant', 'exists-wip', '')])

shot('1A-05', cam=cam(50, 'static', 'medium from behind Alexandria: her gown and veil, the nest beyond',
                      stop='T2.8', focus='1.2 m on the nest'),
     who=[('Alexandria', 'R', 'back three-quarter'), ('Nest', 'C', '')],
     beats=[(0.3, 'She takes the stool beside the nest.'), (2.0, 'Her hands fold; she does not reach in.')],
     sfx=[(0.5, 'cloth', 'fabric settling'), (2.2, 'cloth', 'breathing')],
     real=('BACK', 'From behind.'),
     needs=[('Stool (assets-lib ph_wooden_stool_02)', 'exists', ''),
            ('Sitting down', 'missing', 'Closest honest: she is lowering onto the stool at the start; the camera holds on her back so the baked seated pose with a small root move reads as settling.')])

shot('1A-06', cam=cam(100, 'static (macro)', 'insert: shell surface; another piece shifts', stop='T2.8', focus='0.35 m'),
     who=[('Egg', 'C', '')],
     beats=[(0.8, 'A piece of shell shifts.'), (1.5, 'A faint, effortful sound from inside.')],
     sfx=[(0.8, 'shell_fragment', 'small shift'), (1.5, 'hatchling_effort', 'not cute, not monstrous')],
     real=('NONE', 'No people.'),
     needs=[('Loose shell piece animation', 'small-build', 'One rigid fragment rotates a few degrees (pure function of t).')])

shot('1A-07', cam=cam(100, 'static (macro)', 'insert: the shell surface flexes outward under pressure (birth stage 1)', stop='T2.8', focus='0.3 m'),
     who=[('Egg', 'C', '')],
     beats=[(0.5, 'Pressure beneath the shell.'), (1.8, 'The surface bulges outward a few millimetres, then relaxes.')],
     sfx=[(1.6, 'shell_creak', 'shell under pressure')],
     real=('NONE', 'No people.'),
     needs=[('Soft-body shell flex', 'missing', 'Closest honest: a small vertex bulge (2-3 mm) in the shell shader driven by t, with the crack mask opening slightly.')])

shot('1A-08', cam=cam(100, 'static (macro), different angle', 'insert: a fragment lifts away (birth stage 2)', stop='T2.8', focus='0.3 m'),
     who=[('Egg', 'C', '')],
     beats=[(0.6, 'A fragment lifts.'), (1.9, 'It drops onto the bedding.')],
     sfx=[(2.0, 'shell_fragment', 'clicks onto the bedding')],
     real=('NONE', 'No people.'),
     needs=[('Shell fragments (F4)', 'exists', 'Animate one rigid fragment.')])

shot('1A-09', cam=cam(100, 'slow push', 'close: a small gold snout presses into the opening (birth stage 3); gold catches the lamplight, it does not emit light',
                      stop='T2.8', focus='0.4 m on the snout'),
     who=[('Hatchling (gold snout)', 'C', 'wet gold, no glow')],
     beats=[(0.8, 'The gold shape presses into the opening.'), (2.6, 'The snout pushes through the membrane edge.')],
     sfx=[(0.8, 'shell_creak', 'wet scrape'), (2.4, 'hatchling_breath', 'small effortful breath')],
     real=('NONE', 'No people.'),
     needs=[('Hatchling (creatures: hatchling, wet dielectric gold, no glow)', 'exists-wip', ''),
            ('Pose: snout pressing out of the shell', 'small-build', 'Author with the creature head/neck pose controls (pure function of t).')])

shot('1A-10', cam=cam(100, 'static', 'close: the shape stills (birth stage 4); a faint breath moves the shell edge', stop='T2.8', focus='0.4 m'),
     who=[('Hatchling', 'C', '')],
     beats=[(1.0, 'Stillness.'), (2.0, 'One tiny breath; the shell edge moves.')],
     sfx=[(2.0, 'hatchling_breath', 'one tiny breath')],
     real=('NONE', 'No people.'),
     needs=[('Hatchling breathing', 'exists', 'creatures: breathe parameter.')])

shot('1A-11', cam=cam(50, 'static', 'medium: the two attendants as dark shapes against the cool shaft, hands clasped (hands in focus)',
                      stop='T2', focus='1.8 m on the hands'),
     who=[('Attendant', 'L', 'silhouette, side-back'), ('Attendant 2', 'L-bg', 'silhouette')],
     beats=[(0.5, 'They watch carefully, not celebrating.')],
     sfx=[(0, 'room_tone_chamber', '')],
     real=('SIL HANDS', 'Silhouettes against the window shaft; the clasped hands carry the tension.'),
     needs=[('Attendant 2', 'missing', 'Not in the humans CAST. Closest honest: a woman from the 18-villager crowd kit in a plain linen dress and coif (not the healer, who has her own role in 2B).')])

shot('1A-12', cam=cam(50, 'slow push from close to medium (F4 camera)', 'close to medium: the hatchling emerges awkwardly - wet, unsteady, exhausted; gold along its scales, no glow',
                      stop='T2', focus='0.6 m on the hatchling\'s eye'),
     who=[('Hatchling', 'C', '')],
     beats=[(0.5, 'The shell breaks away along the crack.'),
            (2.5, 'Head and forelegs out; a foreleg slips on the shell.'),
            (5.0, 'The body slides free onto the linen.'),
            (7.0, 'It lies exhausted, flanks heaving.')],
     sfx=[(0.5, 'shell_break', ''), (2.6, 'bedding_rustle', ''), (5.0, 'hatchling_breath', 'laboured breathing, continues')],
     real=('NONE', 'No people.'),
     needs=[('Emergence animation', 'missing',
             'Closest honest: a keyed blend of creature poses (head-down lie, legs pushing) with the shell as a rigid body that rocks and slides; no soft-body shell (shot list HATCHLING_SOFTBODY).')])

shot('1A-13', cam=cam(50, 'static', 'medium over the attendant\'s left shoulder down onto the nest',
                      stop='T2', focus='1.0 m on the hatchling'),
     who=[('Attendant', 'L-fg', 'from behind, shoulder and coif soft'), ('Hatchling', 'C-bg', 'sharp')],
     lines=[('L010', 0.6)],
     beats=[('L010', 'The attendant, quietly.')],
     sfx=[],
     real=('OTS BACK', 'Over her shoulder; she speaks turned away from camera. ' + NO_LIPSYNC),
     needs=[('Attendant', 'exists-wip', '')])

shot('1A-14', cam=cam(65, 'static; the frame drifts down with her shoulder', 'close over Alexandria\'s right shoulder: veil edge and cheek soft in the foreground, the hatchling sharp below',
                      stop='T2', focus='0.7 m on the hatchling'),
     who=[('Alexandria', 'R-fg', 'shoulder and veil edge, soft; face out of frame'), ('Hatchling', 'C-bg', 'sharp')],
     beats=[(0.3, 'She lowers herself closer.'), (1.8, 'Her shoulders ease; a slow breath out.')],
     sfx=[(0.3, 'cloth', 'gown fabric'), (1.8, 'cloth', 'her breath')],
     real=('OTS DOF', 'The softening is carried by posture and breath. Story beat kept; the face close-up waits for approved faces.'),
     needs=[('Alexandria', 'exists-wip', '')],
     note='Screenplay: "Her expression softens." Shown through the body here; return to the face when faces are approved.')

shot('1A-15', cam=cam(65, 'static (hold)', 'close: Alexandria\'s lost profile from behind-right, rim-lit by the cool shaft; cheek line hides the lips',
                      stop='T2', focus='0.9 m on her ear and cheek'),
     who=[('Alexandria', 'R', 'lost profile, backlit')],
     lines=[('L011', 0.9)],
     min_tail=3.0,
     beats=[('L011', 'She whispers the ORIGINAL line, for the hatchling, not the room.'),
            ('L011.end', 'HOLD on her for a beat; she does not move.')],
     sfx=[(0, 'room_tone_chamber', 'room tone dips 4 dB: whisper close on mic, nothing else')],
     real=('BACK SIL', 'Lost profile against the window light; the hold is on her stillness. ' + NO_LIPSYNC),
     needs=[('Alexandria', 'exists-wip', '')],
     note='ORIGINAL line, exact text. Screenplay: "Hold on her face for a beat after the line" - held on her lost profile in this preview.')

shot('1A-16', cam=cam(50, 'static', 'medium: the attendant soft behind a lamp\'s bokeh, eyes down', stop='T2', focus='0.5 m on the lamp'),
     who=[('Attendant', 'L', 'soft behind the lamp bokeh')],
     beats=[(0.3, 'She heard; she does not respond.')],
     sfx=[(0, 'room_tone_chamber', '')],
     real=('DOF', 'Focus on the lamp in the foreground; she is a soft shape.'),
     needs=[('Attendant', 'exists-wip', '')])

shot('1A-17', cam=cam(50, 'static (style frame F4 setup)', 'insert at nest height: the hatchling slips against the broken shell; Alexandria\'s hands support it with a folded cloth from screen right',
                      stop='T2', focus='0.6 m on the hatchling\'s eye'),
     who=[('Hatchling', 'C', ''), ('Alexandria (hands)', 'R', 'hands under folded linen; face out of frame')],
     beats=[(0.5, 'It tries to lift itself.'), (1.6, 'It slips against the broken shell.'),
            (2.4, 'Her hands come in with a folded cloth and hold it.'), (5.0, 'It rests against the cloth.')],
     sfx=[(1.6, 'shell_fragment', 'shell scrape'), (2.4, 'cloth', 'soft cloth')],
     real=('HANDS', 'Hands only - this is style frame F4\'s own framing.'),
     needs=[('Birthing chamber close set, hatchling, Alexandria\'s hands (F4)', 'exists', '')])

shot('1A-18', cam=cam(35, 'static (from the nest toward the door)', 'medium-wide: Abby leans in at the bright doorway, Remi just behind her - two backlit shapes',
                      stop='T2.8', focus='3 m on the doorway'),
     who=[('Abby', 'L-bg (doorway)', 'silhouette'), ('Remi', 'L-bg (behind her)', 'silhouette')],
     lines=[('L012', 1.2)],
     beats=[(0.3, 'The door opens.'), (0.7, 'Abby leans in.'), ('L012', 'A little too loud for the room.')],
     sfx=[(0.3, 'door_latch', '')],
     real=('SIL WIDE', 'Backlit in the doorway; faces unreadable. ' + NO_LIPSYNC),
     needs=[('Abby, Remi (humans: abby, remi)', 'exists-wip', ''), ('Door + corridor (chamber extension)', 'small-build', '')])

shot('1A-19', cam=cam(50, 'static', 'medium from behind Alexandria: her veil soft in the foreground; she keeps facing the nest',
                      stop='T2', focus='1.0 m on the hatchling'),
     who=[('Alexandria', 'R-fg', 'from behind')],
     lines=[('L013', 0.3)],
     beats=[('L013', 'Without looking away from the hatchling.')],
     sfx=[],
     real=('BACK', 'Her back to camera shows she does not look away. ' + NO_LIPSYNC),
     needs=[('Alexandria', 'exists-wip', '')])

shot('1A-20', cam=cam(24, 'static, high in the corner', 'wide: Abby takes two quick steps, remembers, slows; Remi follows, looking at the shell, then the hatchling',
                      stop='T2.8', focus='3.5 m'),
     who=[('Abby', 'L', 'small, three-quarter back'), ('Remi', 'L-bg', 'small'), ('Alexandria', 'R', 'small, back'), ('Nest', 'C', '')],
     beats=[(0.2, 'Two quick steps.'), (1.0, 'She slows.'), (1.8, 'Remi follows; his head turns to the shell, then to the hatchling.')],
     sfx=[(0.2, 'footsteps_stone', 'two quick, then careful ones')],
     real=('WIDE', 'High wide; everyone small.'),
     needs=[('Walking (Abby, Remi)', 'missing', 'Closest honest: people.js walk action on the humans person adapter at this small size; verify foot contact.')])

shot('1A-21', cam=cam(40, 'static', 'medium two-shot from behind the siblings: two backs over the nest, Alexandria soft beyond',
                      stop='T2', focus='1.5 m on the hatchling'),
     who=[('Abby', 'L', 'from behind'), ('Remi', 'R', 'from behind'), ('Alexandria', 'C-bg', 'soft')],
     lines=[('L014', 0.8), ('L015', 0.3), ('L016', 0.3)],
     beats=[('L014', 'Abby.'), ('L015', 'Remi, dry.'), ('L016', 'Abby.')],
     sfx=[],
     real=('BACK', 'Backs to camera over the nest. ' + NO_LIPSYNC),
     needs=[('Abby, Remi', 'exists-wip', '')])

shot('1A-22', cam=cam(75, 'static, low at the hatchling\'s eye level', 'close past the hatchling\'s head (sharp, R) to Abby crouching (soft, L); her hand enters the focal plane',
                      stop='T2', focus='0.45 m on the hatchling\'s eye'),
     who=[('Hatchling', 'R', 'sharp'), ('Abby', 'L', 'very soft, crouched; hand sharp when it reaches')],
     beats=[(0.3, 'Abby crouches to its level (a soft shape dropping into frame).'),
            (1.3, 'Its head shifts toward her voice.'),
            (2.4, 'Her hand reaches into focus... and stops.'),
            (3.6, 'Her soft head turns toward Alexandria.')],
     sfx=[(0.4, 'knee_stone', ''), (1.3, 'hatchling_breath', 'small breath')],
     real=('DOF HANDS', 'Her face is far out of focus behind the sharp hatchling; the almost-touch is her hand.'),
     needs=[('Hatchling head turn', 'exists', 'creatures: look controls.'),
            ('Abby crouching (baked pose)', 'missing', 'Closest honest: the abby build with a crouch pose recipe (offline build) - or keep her so soft that a kneeling root drop reads.')])

shot('1A-23', cam=cam(50, 'static', 'medium over Abby\'s crouched shoulder (soft, L-fg) across the nest to Alexandria, backlit by the shaft',
                      stop='T2', focus='0.8 m on the hatchling'),
     who=[('Abby', 'L-fg', 'shoulder, soft'), ('Alexandria', 'R', 'soft, backlit'), ('Hatchling', 'C', 'sharp')],
     lines=[('L017', 0.4)],
     beats=[('L017', 'Alexandria, gently.')],
     sfx=[],
     real=('OTS DOF SIL', 'Focus on the hatchling between them; Alexandria soft and backlit. ' + NO_LIPSYNC),
     needs=[('Abby, Alexandria', 'exists-wip', '')])

shot('1A-24', cam=cam(50, 'static', 'medium: Remi from behind (L-fg, soft), the attendant across the nest (R-bg) half hidden by a lamp\'s bokeh',
                      stop='T2', focus='1.2 m on the nest'),
     who=[('Remi', 'L-fg', 'from behind'), ('Attendant', 'R-bg', 'soft, partly hidden')],
     lines=[('L018', 0.6), ('L019', 0.45)],
     beats=[('L018', 'Remi asks.'), ('L019', 'The attendant answers.')],
     sfx=[],
     real=('BACK DOF', 'Speaker from behind, the answer from a soft figure. ' + NO_LIPSYNC),
     needs=[('Remi, attendant', 'exists-wip', '')])

shot('1A-25', cam=cam(65, 'static (hold)', 'close over Abby\'s shoulder and ear (soft, L-fg) onto the hatchling, which goes still',
                      stop='T2', focus='0.7 m on the hatchling'),
     who=[('Abby', 'L-fg', 'ear, hair and shoulder, soft'), ('Hatchling', 'C', 'still')],
     beats=[(0.3, 'The hatchling goes still.'), (1.2, 'Abby holds her breath; her shoulder stops moving.'), ('end-0.5', 'Nothing yet.')],
     sfx=[(0.3, 'room_tone_chamber', 'all sound pulls back to room tone'), (1.2, 'abby_breath_hold', 'a small caught breath, then nothing')],
     real=('OTS', 'Her fear is her stillness and the held breath; the face stays out of frame.'),
     needs=[('Abby non-verbal breath', 'small-build', 'Synthetic breath from make_vo\'s breath generator, or Daxtyn records it.')])

shot('1A-26', cam=cam(100, 'static', 'insert: the hatchling\'s side', stop='T2.8', focus='0.4 m'),
     who=[('Hatchling', 'C', '')],
     beats=[(0.8, 'Its side rises.')],
     sfx=[(0.8, 'hatchling_breath', 'one small breath')],
     real=('NONE', 'No people.'),
     needs=[])

shot('1A-27', cam=cam(50, 'static two-shot', 'medium from behind Abby (L-fg, soft) to Alexandria (R, soft), the hatchling sharp between',
                      stop='T2', focus='0.9 m on the hatchling'),
     who=[('Abby', 'L-fg', 'from behind'), ('Alexandria', 'R', 'soft')],
     lines=[('L020', 0.6), ('L021', 0.5)],
     min_tail=1.0,
     beats=[('L020', 'Abby, quietly.'), ('L021', 'Alexandria.'), ('L021.end+0.3', 'Relief, shared in silence.')],
     sfx=[],
     real=('BACK DOF', NO_LIPSYNC),
     needs=[('Abby, Alexandria', 'exists-wip', '')])

shot('1A-28', cam=cam(28, 'static, high three-shot', 'wide: Abby L, Remi L-bg, Alexandria R, the hatchling C; everyone small',
                      stop='T2.8', focus='2.5 m'),
     who=[('Abby', 'L', 'small, eyes on the hatchling'), ('Remi', 'L-bg', 'small'), ('Alexandria', 'R', 'small'), ('Hatchling', 'C', '')],
     lines=[('L022', 0.5), ('L023', 0.35), ('L024', 0.3)],
     beats=[('L022', 'Remi asks about a name.'), ('L024', 'Abby does not move her eyes from the hatchling.')],
     sfx=[],
     real=('WIDE', 'Faces are a few pixels across at this size. ' + NO_LIPSYNC),
     needs=[('Abby, Remi, Alexandria', 'exists-wip', '')])

shot('1A-29', cam=cam(40, 'static two-shot', 'medium from behind the siblings: Remi\'s head turns to Abby, hers does not',
                      stop='T2', focus='1.5 m'),
     who=[('Abby', 'L', 'from behind'), ('Remi', 'R', 'from behind; head turns toward her')],
     lines=[('L025', 1.4)],
     beats=[(0.2, 'Remi gives her a sideways look.'), (0.9, 'She keeps watching the hatchling, satisfied she has annoyed him.'), ('L025', 'Remi.')],
     sfx=[],
     real=('BACK', 'The sideways look reads as a head turn from behind. ' + NO_LIPSYNC),
     needs=[('Abby, Remi', 'exists-wip', '')])

shot('1A-30', cam=cam(50, 'static', 'medium from behind Alexandria (R-fg, soft) across the nest to the children, small against the doorway light',
                      stop='T2', focus='2.5 m on the children'),
     who=[('Alexandria', 'R-fg', 'from behind'), ('Abby', 'L', 'small, rising behind the nest'), ('Remi', 'L-bg', 'small, turning to the door')],
     lines=[('L026', 0.6)],
     beats=[('L026', 'Warm but final.'), ('L026.end+0.4', 'Abby rises reluctantly behind the nest.'), ('L026.end+1.4', 'Remi turns toward the door.')],
     sfx=[('L026.end+0.4', 'cloth', 'Abby stands')],
     real=('BACK WIDE', NO_LIPSYNC),
     needs=[('Abby standing up from a crouch', 'missing', 'Closest honest: she is below the nest line at frame bottom; we see her head and shoulders rise into view, soft (root rise on the standing build).')])

shot('1A-31', cam=cam(28, 'static', 'wide from beside Alexandria (R, small): the children walk to the door, backs to camera; the lines carry across the room',
                      stop='T2.8', focus='3 m'),
     who=[('Abby', 'L', 'from behind, walking'), ('Remi', 'L-bg (door)', 'from behind'), ('Alexandria', 'R', 'small, back three-quarter')],
     lines=[('L027', 0.5), ('L028', 0.35), ('L029', 0.3), ('L030', 0.35), ('L031', 0.35)],
     beats=[(0, 'They head for the door.'), ('L030', 'Alexandria, after them.'), ('L031.end+0.3', 'They reach the doorway.')],
     sfx=[(0, 'footsteps_stone', 'toward the door, under the lines')],
     real=('BACK WIDE', 'Walking away; lines carry. ' + NO_LIPSYNC),
     needs=[('Walking', 'missing', 'As 1A-20 (people.js walk on the person adapter); or start them nearer the door so they only take a few steps.')])

shot('1A-32', cam=cam(35, 'static (from the nest toward the door)', 'medium-wide: two silhouettes in the bright doorway; Abby looks back once',
                      stop='T2.8', focus='3 m'),
     who=[('Abby', 'L-bg', 'silhouette; head turns back'), ('Remi', 'L-bg', 'silhouette')],
     beats=[(0.5, 'Abby looks back once at the gold hatchling (profile in silhouette).'), (2.0, 'They leave.'), (3.4, 'The door closes.')],
     sfx=[(1.8, 'footsteps_stone', 'receding'), (3.4, 'door_close', '')],
     real=('SIL', 'Silhouettes in the doorway.'),
     needs=[('Door', 'small-build', 'Chamber extension.')])

shot('1A-33', cam=cam(65, 'static', 'medium from behind Alexandria: her hand (sharp) resting on the linen near the newborn',
                      stop='T2', focus='0.8 m on her hand'),
     who=[('Alexandria', 'R', 'from behind; hand sharp'), ('Hatchling', 'C', '')],
     beats=[(0.5, 'Alexandria stays.'), (2.0, 'Her hand rests near the newborn without restraining it.')],
     sfx=[(0, 'room_tone_chamber', ''), (1.0, 'hatchling_breath', 'breathing')],
     real=('BACK HANDS', 'Hand and back.'),
     needs=[('Alexandria hand pose resting on linen', 'exists-wip', 'Baked hand pose; place by arm IK.')])

shot('1A-34', cam=cam(100, 'static', 'insert: the tiny rise of the hatchling\'s side (match-cut source)', stop='T2.8', focus='0.4 m'),
     who=[('Hatchling (side)', 'C', '')],
     beats=[(1.2, 'Its side rises - cut on the rise.')],
     sfx=[(1.2, 'hatchling_breath', 'tiny breath that carries over the cut into Charcoal\'s exhale')],
     real=('NONE', 'No people.'),
     needs=[])

# ======================================================================= 1B
shot('1B-01', cam=cam(100, 'static', 'insert: the immense rise of Charcoal\'s side, close enough to read as dark terrain; scale texture and natural highlights',
                      stop='T4', focus='3 m on the scales'),
     trans=('match_cut',),
     who=[('Charcoal (flank)', 'C', 'fills the frame')],
     beats=[(0, 'Match cut on the breath: the flank rises like a hill.'), (2.5, 'It falls with a huge slow exhale.')],
     sfx=[(0, 'charcoal_exhale', 'continues the hatchling\'s breath, huge and slow'), (0, 'birds_morning', 'bed')],
     real=('NONE', 'No people.'),
     needs=[('Charcoal lying, breathing (F2)', 'exists-wip', '')])

shot('1B-02', cam=cam(50, 'continuous pull-back (drone/crane) from 3 m to 70 m, eye height at the end (F2 framing)',
                      'from insert to wide: Charcoal\'s hide across the right two-thirds; Remi a small figure at his shoulder reaching up for the riding strap',
                      stop='T4', focus='racks from 3 m to 70 m'),
     who=[('Charcoal', 'R', ''), ('Remi', 'R-fg', 'small, side-back, reaching up')],
     beats=[(0, 'Close on the hide.'), (3.0, 'The pull-back reveals the shoulder line.'), (5.0, 'Remi comes into view, reaching for the strap.'), (7.0, 'Scale established.')],
     sfx=[(0, 'charcoal_exhale', 'breathing'), (5.2, 'strap_leather', ''), (0, 'birds_morning', '')],
     real=('WIDE BACK', 'Remi is small, side-back, reaching up: the ordinary action gives the scale.'),
     needs=[('Riding grounds, Charcoal, Remi, mounting strap (style frame F2)', 'exists-wip', '')])

shot('1B-03', cam=cam(50, 'static', 'medium over Remi\'s left shoulder onto Charcoal\'s flank: his hair and coat stir with each exhale',
                      stop='T2.8', focus='1.5 m on Remi\'s shoulder'),
     who=[('Remi', 'L', 'from behind'), ('Charcoal (flank)', 'R-bg', '')],
     beats=[(0.5, 'An exhale; Remi\'s hair and coat stir.'), (2.5, 'Calm dragon, unthreatened.')],
     sfx=[(0.5, 'charcoal_exhale', 'breath rush'), (2.0, 'strap_leather', 'buckle')],
     real=('BACK OTS', 'From behind.'),
     needs=[('Hair/coat stirring in the breath', 'missing', 'Closest honest: strand sway by vertex noise and a coat-hem flutter (the cloth flutter used for banners in town.js); garments are baked by the offline cloth sim.')])

shot('1B-04', cam=cam(35, 'static', 'wide from behind Abby (L-fg): Leaf sits upright like a dog facing her; Charcoal\'s bulk at far right',
                      stop='T4', focus='6 m on Leaf'),
     who=[('Leaf', 'L', 'sitting upright'), ('Abby', 'L-fg', 'from behind'), ('Charcoal', 'far-R (part)', '')],
     beats=[(0.5, 'Abby straightens the riding equipment.'), (2.5, 'Leaf\'s quick breaths.')],
     sfx=[(0, 'leaf_breath', 'quick breaths'), (0, 'birds_morning', '')],
     real=('BACK WIDE', 'From behind.'),
     needs=[('Leaf sitting (creatures: sit, foldVariant sitFlank) + Abby (F2)', 'exists-wip', '')])

shot('1B-05', cam=cam(50, 'static', 'medium over Abby\'s right shoulder to Leaf\'s chest and head: her hands and the breast strap in focus',
                      stop='T2.8', focus='1.2 m on the strap'),
     who=[('Abby', 'L', 'from behind; hands sharp'), ('Leaf', 'R', '')],
     lines=[('L032', 1.6)],
     beats=[(0.4, 'A noise off to the left.'), (0.7, 'Leaf\'s head turns to it; the strap slides out of her hands.'),
            ('L032', 'She calls him.'), ('L032.end+0.6', 'Leaf turns back.'), ('end-1.0', 'She finishes fastening.')],
     sfx=[(0.4, 'gate_noise', 'off-screen left'), ('end-1.0', 'strap_leather', 'buckle')],
     real=('OTS HANDS', NO_LIPSYNC),
     needs=[('Breast strap (F2) following Leaf\'s neck', 'exists', ''),
            ('Hands releasing the strap', 'missing', 'Closest honest: the strap slides through her fixed grip; no finger animation.')])

shot('1B-06', cam=cam(40, 'static', 'wide from behind Remi (R-fg, back to camera, at Charcoal\'s rig); Abby and Leaf small across the field (L-bg)',
                      stop='T4', focus='12 m on Abby'),
     who=[('Remi', 'R-fg', 'from behind, working a buckle'), ('Abby', 'L-bg', 'small'), ('Leaf', 'L-bg', 'small')],
     lines=[('L033', 0.8), ('L034', 0.35), ('L035', 0.3), ('L036', 0.4)],
     beats=[('L033', 'Across a short distance; voices carry, no shouting.'), ('L036', 'They do not need to look at each other.')],
     sfx=[(0, 'strap_leather', 'Remi\'s buckle under the lines')],
     real=('BACK WIDE', 'Remi from behind, Abby small. ' + NO_LIPSYNC),
     needs=[('Remi, Abby, Leaf, Charcoal (F2 set)', 'exists-wip', '')])

shot('1B-07', cam=cam(65, 'static', 'insert: Remi\'s hands check a buckle and a girth strap', stop='T2.8', focus='0.6 m'),
     who=[('Remi (hands)', 'C', 'hands only')],
     beats=[(0.3, 'He checks his own equipment instead of answering.'), (1.8, 'Tugs the strap; satisfied.')],
     sfx=[(0.3, 'strap_leather', 'leather, buckle')],
     real=('HANDS', 'Hands only.'),
     needs=[('Close-up tack detail (creatures: createSaddle)', 'exists-wip', 'Check the saddle and strap detail at insert distance.')])

shot('1B-08', cam=cam(35, 'static', 'wide: the ground keeper tiny at the far-left field edge, well outside Charcoal\'s launch space (R)',
                      stop='T5.6', focus='hyperfocal'),
     who=[('Ground keeper', 'far-L (field edge)', 'tiny'), ('Charcoal', 'R', '')],
     lines=[('L037', 0.8)],
     beats=[('L037', 'Called across the field.')],
     sfx=[],
     real=('WIDE', 'The keeper is tiny in frame. ' + NO_LIPSYNC),
     needs=[('Ground keeper (humans: keeper1 / keeper2)', 'exists-wip', '')])

shot('1B-09', cam=cam(50, 'static', 'medium from behind Remi: his raised right hand silhouetted against the bright sea sky',
                      stop='T4', focus='2 m'),
     who=[('Remi', 'R', 'from behind; raised hand in silhouette')],
     beats=[(0.4, 'Remi raises a hand: acknowledged.'), (1.4, 'Lowers it.')],
     sfx=[],
     real=('BACK SIL', 'From behind, against the bright sky.'),
     needs=[('Arm raise on the baked pose', 'small-build', 'Two-bone arm IK (as people.js armIK) on the humans rig.')])

shot('1B-10', cam=cam(40, 'static, then a short tilt up behind Leaf\'s neck', 'medium from behind Abby: boot on the low step, hands on the saddle; Leaf\'s neck passes in the foreground; she ends seated. Remi small in the background, glancing over',
                      stop='T2.8', focus='2 m'),
     who=[('Abby', 'L', 'from behind'), ('Leaf', 'L', 'low step at his side'), ('Remi', 'R-bg', 'small, glances over')],
     beats=[(0.3, 'Her boot on the low timber step.'), (1.5, 'Hands on the saddle.'),
            (2.4, 'Leaf\'s neck sweeps through the foreground (the move up is hidden behind it).'),
            (3.6, 'She is mounted.'), (4.5, 'In the background Remi glances over to check, then turns back to his rig.')],
     sfx=[(1.5, 'saddle_creak', ''), (3.0, 'leaf_breath', 'Leaf shifts his weight')],
     real=('BACK', 'Mounting seen from behind; the standing-to-seated change is hidden by Leaf\'s neck in the foreground.'),
     needs=[('Low step / platform for Leaf', 'small-build', 'A timber step block (wood PBR scan).'),
            ('Mounting motion', 'missing', 'Closest honest: two baked builds (abby standing, abby_ride seated) with the switch hidden behind Leaf\'s neck as it passes the lens.')])

shot('1B-11', cam=cam(35, 'static', 'wide from behind: Remi small, climbing to the saddle beside Charcoal\'s shoulder',
                      stop='T5.6', focus='25 m'),
     who=[('Remi', 'R', 'small, from behind, climbing'), ('Charcoal', 'R', ''), ('Access rig', 'R', '')],
     beats=[(0.5, 'Remi starts up.'), (3.0, 'Halfway.'), (5.0, 'He reaches the saddle.')],
     sfx=[(0.5, 'rig_creak', 'wooden creak'), (4.8, 'rig_creak', 'harness clips')],
     real=('WIDE BACK', 'Small and from behind.'),
     needs=[('Charcoal\'s grounded access rig', 'missing',
             'No set has one (F2 has only the saddle and a hanging strap). Closest honest: a simple timber mounting tower (four posts, rungs, a top platform at the saddle) built from boxes with the wood scan; '
             'if not built, a rope-and-plank ladder hanging from the saddle (an extension of F2\'s strap).'),
            ('Climbing motion', 'missing', 'Closest honest: at this size, rung-by-rung root steps with alternating arm IK on the people.js placeholder or the humans person adapter.')])

shot('1B-12', cam=cam(35, 'static', 'wide from behind Leaf and Abby (L-fg): Remi high on Charcoal (R, small); very different heights',
                      stop='T4', focus='20 m'),
     who=[('Abby', 'L', 'mounted, from behind'), ('Leaf', 'L', ''), ('Remi', 'R', 'high, small'), ('Charcoal', 'R', '')],
     lines=[('L038', 0.6), ('L039', 0.4), ('L040', 0.3)],
     beats=[('L038', 'Remi, from high up.'), ('L040', 'A small jab.')],
     sfx=[],
     real=('BACK WIDE', NO_LIPSYNC),
     needs=[('Riders mounted (humans-riders: abby_ride, remi_ride)', 'exists-wip', 'Ride builds are being rebuilt; check caches before rendering.')])

shot('1B-13', cam=cam(85, 'static', 'close: Leaf\'s head and eye (L) watching Charcoal', stop='T2.8', focus='2 m on the eye'),
     who=[('Leaf (head, eye)', 'L', '')],
     beats=[(0.5, 'Leaf\'s eye tracks the larger dragon.'), (2.0, 'A small chirr.')],
     sfx=[(0.3, 'leaf_breath', 'quick breath'), (2.0, 'leaf_breath', 'small chirr')],
     real=('NONE', 'No people.'),
     needs=[('Leaf head/eye (creatures)', 'exists-wip', '')])

shot('1B-14', cam=cam(65, 'static', 'close: Abby\'s right hand on Leaf\'s neck scales (sharp); her shoulder and hair soft at frame left',
                      stop='T2.8', focus='0.6 m on her hand'),
     who=[('Abby', 'L', 'shoulder and hair, soft; hand sharp'), ('Leaf (neck)', 'R', '')],
     lines=[('L041', 1.2)],
     beats=[(0.3, 'Her hand comes to rest on his neck, turning his attention forward.'), ('L041', 'Close, quiet.')],
     sfx=[],
     real=('HANDS DOF', NO_LIPSYNC),
     needs=[('Abby rider + Leaf neck', 'exists-wip', '')])

shot('1B-15', cam=cam(28, 'slow tilt up', 'wide: Leaf rises and opens his wings; Charcoal stays in frame behind him (R-bg)',
                      stop='T5.6', focus='15 m'),
     who=[('Leaf', 'L', 'rising'), ('Abby', 'L', 'small, mounted'), ('Charcoal', 'R-bg', '')],
     beats=[(0.5, 'Leaf rises from the sit.'), (2.5, 'Wings unfold.'), (4.5, 'Small next to Charcoal, huge next to Abby.')],
     sfx=[(0.6, 'leaf_claws_turf', ''), (2.5, 'wing_unfold_leaf', '')],
     real=('WIDE', 'Abby small on Leaf.'),
     needs=[('Sit-to-stand and wing unfold', 'small-build', 'Blend the creature sit and glide poses as a function of t.')])

# ======================================================================= 1C
shot('1C-01', cam=cam(24, 'static, low in the grass', 'wide: Leaf takes off ahead of Charcoal; the first downbeat shakes loose grass',
                      stop='T5.6', focus='10 m'),
     who=[('Leaf', 'L', 'taking off'), ('Abby', 'L', 'small, mounted')],
     beats=[(0.5, 'Leaf crouches.'), (1.2, 'First downbeat; loose grass flies.'), (2.5, 'He climbs out of frame.')],
     sfx=[(1.2, 'leaf_beats', 'quick, light'), (1.2, 'grass_hiss', '')],
     real=('WIDE', 'Abby small.'),
     needs=[('Take-off motion', 'small-build', 'Pose blend crouch -> flight with a root trajectory.'),
            ('Loose grass blown by the downbeat', 'missing', 'Closest honest: a few hundred instanced loose blades on ballistic paths (pure function of t) plus a radial bend of the grass tufts near Leaf.')])

shot('1C-02', cam=cam(40, 'tracking up behind her', 'medium from behind Abby: she leans into the climb', stop='T4', focus='3 m'),
     who=[('Abby', 'C', 'from behind'), ('Leaf', 'C', '')],
     beats=[(0.3, 'Abby leans into the familiar motion.'), (1.8, 'Wind rises.')],
     sfx=[(0, 'leaf_beats', ''), (0.5, 'wind_altitude', 'starts low')],
     real=('BACK', 'Experienced rider, from behind.'),
     needs=[('Abby rider in flight (humans-riders)', 'exists-wip', '')])

shot('1C-03', cam=cam(24, 'ground level, slow tilt up', 'wide: Charcoal begins to move; his wings open until the frame cannot contain them; Remi tiny',
                      stop='T5.6', focus='30 m'),
     who=[('Charcoal', 'C', 'wings opening'), ('Remi', 'C', 'tiny')],
     beats=[(0.5, 'Charcoal shifts his weight.'), (2.0, 'The wings start to open.'), (5.0, 'They overfill the frame.')],
     sfx=[(0.5, 'sub_shift', 'sound drops to a lower register'), (2.0, 'wing_unfold_charcoal', 'leather membrane unfolding')],
     real=('WIDE', 'Remi tiny.'),
     needs=[('Wing fold-to-spread', 'small-build', 'Blend the folded and glide poses.')])

shot('1C-04', cam=cam(20, 'static, ground level', 'wide: the wings overhead; the camera stays long enough to understand what is above it',
                      stop='T5.6', focus='hyperfocal'),
     who=[('Charcoal (wings overhead)', 'C', '')],
     beats=[(0.5, 'Air pressure builds.'), (2.0, 'The birds stop.')],
     sfx=[(0.5, 'pressure_swell', ''), (2.0, 'birds_morning', 'birds stop: cut the bird bed here')],
     real=('NONE', 'No people visible.'),
     needs=[])

shot('1C-05', cam=cam(24, 'locked ground camera with shake (dk/camera.js wind/handheld shake, peak at the downbeat)',
                      'wide: he launches; dirt lifts, turf breaks, stones jump, a rolling dust cloud crosses the empty launch area',
                      stop='T5.6', focus='25 m'),
     who=[('Charcoal', 'C', 'launching')],
     beats=[(0.3, 'Crouch.'), (1.0, 'Massive downbeat; turf tears.'), (1.6, 'Stones jump; dust rolls.'), (4.0, 'He is up; the dust keeps coming.')],
     sfx=[(1.0, 'launch_downbeat', ''), (1.1, 'turf_tear', ''), (1.6, 'stones_clatter', ''), (2.0, 'rolling_wind_dust', '')],
     real=('NONE', 'The field was cleared: no people.'),
     needs=[('Dust cloud, turf break, flying stones', 'missing',
             'Closest honest: dust as volumetric banks that grow and drift with t (dust-coloured, sun-lit), instanced stones (ph_rock_moss_set) and sod chunks on ballistic paths, darkened torn-turf patches on the terrain. No fluid sim.'),
            ('Launch motion', 'small-build', 'Crouch -> leap -> first downstroke as a pose sequence.')],
     cost='dust')

shot('1C-06', cam=cam(24, 'static, behind the launch', 'wide: the ground devastated beneath and behind him; dust rolls toward and past camera',
                      stop='T5.6', focus='20 m'),
     who=[('Dust cloud', 'C', ''), ('Charcoal', 'C-top', 'leaving frame')],
     beats=[(0.5, 'Torn ground.'), (1.5, 'Dust rolls past the lens.'), (2.6, 'A second downbeat, higher up.')],
     sfx=[(0.5, 'debris_settle', ''), (2.6, 'charcoal_beats', 'one beat, higher up')],
     real=('NONE', 'No people.'),
     needs=[('As 1C-05', 'missing', 'As 1C-05.')],
     cost='dust')

shot('1C-07', cam=cam(65, 'air-to-air follow from the inland side', 'medium: Abby looks back over her LEFT (seaward) shoulder, away from camera, through the departing dust',
                      stop='T4', focus='8 m'),
     who=[('Abby', 'C', 'back of the head as she looks back'), ('Leaf', 'C', '')],
     beats=[(0.3, 'She twists to look back.')],
     sfx=[(0, 'wind_altitude', ''), (0, 'leaf_beats', '')],
     real=('BACK', 'She looks back over the far shoulder, so the camera sees the back of her head.'),
     needs=[('Abby rider + Leaf in flight', 'exists-wip', '')])

shot('1C-08', cam=cam(50, 'Abby\'s POV, flying (dragonback shake)', 'POV: Charcoal rises out of the dust; Remi a small fixed point on his back',
                      stop='T5.6', focus='hyperfocal'),
     who=[('Charcoal', 'C', 'rising out of dust'), ('Remi', 'C', 'small fixed point')],
     beats=[(0.5, 'Dust below.'), (2.0, 'Charcoal breaks out of it.')],
     sfx=[(1.0, 'charcoal_beats', 'deep, slow, under wind')],
     real=('WIDE', 'Remi is a dot.'),
     needs=[('Dust (as 1C-05)', 'missing', 'As 1C-05, seen from above.')],
     cost='dust')

shot('1C-09', cam=cam(65, 'air-to-air, close from behind her right shoulder', 'close: her hair and collar in the foreground as she turns forward again; Charcoal rising in the soft background',
                      stop='T2.8', focus='1 m on her shoulder'),
     who=[('Abby', 'C', 'from behind, turning forward')],
     lines=[('L042', 0.8)],
     min_tail=1.0,
     beats=[(0.2, 'She turns forward again.'), ('L042', 'An aside for herself and the viewer.'), ('L042.end+0.3', 'No reply: Remi is too far away.')],
     sfx=[(0, 'wind_altitude', 'normal flight-dialogue level, ducked 3 dB under the line')],
     real=('BACK OTS', 'Said as she settles forward, from behind. ' + NO_LIPSYNC),
     needs=[('Abby rider', 'exists-wip', '')])

shot('1C-10', cam=cam(35, 'aerial travel, slow', 'extreme wide: the dragons climb over the coast - the shoreline first',
                      stop='T5.6', focus='infinity'),
     who=[('Leaf', 'L', 'small'), ('Charcoal', 'R', ''), ('Coastline', 'L-bottom', '')],
     beats=[(0, 'Shoreline, surf.'), (3.0, 'The two climb over it.')],
     sfx=[(0, 'wind_altitude', ''), (0, 'sea_far', '')],
     real=('WIDE', 'Riders are dots.'),
     needs=[('Coast, cliffs, surf, ocean, creatures (style frame F3)', 'exists-wip', '')])

shot('1C-11', cam=cam(75, 'air-to-air, long lens from the inland side (F3 camera ship ~350 m back)', 'wide: Leaf L-fg and slightly behind, Charcoal R-bg and ahead - the flight line used through 1E',
                      stop='T4', focus='350 m'),
     who=[('Leaf', 'L-fg', ''), ('Charcoal', 'R-bg', ''), ('Abby, Remi', 'on their backs', 'small')],
     beats=[(0, 'Two wingbeat rhythms: heavy and infrequent, quick and corrective.')],
     sfx=[(0, 'charcoal_beats', ''), (0, 'leaf_beats', '')],
     real=('WIDE', 'Riders small.'),
     needs=[('F3 set', 'exists-wip', '')])

shot('1C-12', cam=cam(24, 'top-down aerial travel', 'extreme wide: the sea below; their two shadows on the water',
                      stop='T5.6', focus='infinity'),
     who=[('Sea', 'C', ''), ('Two shadows', 'C', '')],
     beats=[(0.5, 'Two shadows slide over the water, one much larger.')],
     sfx=[(0, 'sea_far', ''), (0, 'wind_altitude', '')],
     real=('NONE', 'No people visible.'),
     needs=[('Ocean receiving creature shadows', 'exists', '')])

shot('1C-13', cam=cam(75, 'air-to-air', 'wide: Charcoal draws level; his larger shadow crosses the water; Leaf corrects with quicker beats',
                      stop='T4', focus='300 m'),
     who=[('Leaf', 'L', ''), ('Charcoal', 'R', 'drawing level')],
     beats=[(0.5, 'Heavy beats approach.'), (2.5, 'Charcoal\'s shadow crosses the water below.'), (4.0, 'Leaf\'s quick corrective beats.')],
     sfx=[(0.5, 'charcoal_beats', ''), (4.0, 'leaf_beats', 'corrective double beat')],
     real=('WIDE', 'Riders small.'),
     needs=[('F3 set', 'exists-wip', '')])

shot('1C-14', cam=cam(85, 'air-to-air from the inland side, behind Remi\'s right shoulder', 'medium: Remi soft in the foreground right, in shade; Abby and Leaf small across the gap (L-bg), in focus',
                      stop='T4', focus='40 m on Abby'),
     who=[('Remi', 'R-fg', 'from behind, soft, ' + 'in shade'), ('Abby', 'L-bg', 'small, sharp'), ('Leaf', 'L-bg', '')],
     lines=[('L043', 0.6), ('L044', 0.5), ('L045', 0.5)],
     beats=[('L043', 'Speaking-range check-in.'), ('L045.end+0.3', 'Wind.')],
     sfx=[(0, 'wind_altitude', 'between the lines')],
     real=('OTS SIL', CONTRE + '. ' + NO_LIPSYNC),
     needs=[('Riders on both dragons', 'exists-wip', '')])

shot('1C-15', cam=cam(40, 'tracking with them along the coast (no orbiting)', 'extreme wide: their path curves along the coast; for a stretch nobody speaks',
                      stop='T5.6', focus='infinity'),
     who=[('Leaf', 'L', ''), ('Charcoal', 'R', ''), ('Coast', 'L', '')],
     beats=[(0, 'The path curves along the coast.'), (1.0, 'M2: the lighter flight theme begins under the wind.')],
     sfx=[(0, 'wind_altitude', '')],
     real=('WIDE', 'Riders are dots.'),
     needs=[('F3 set', 'exists-wip', '')])

shot('1C-16', cam=cam(65, 'air-to-air', 'insert: Abby\'s two hands on the grips, relaxed', stop='T2.8', focus='0.7 m'),
     who=[('Abby (both hands)', 'C', 'hands only')],
     beats=[(0.3, 'Both hands used comfortably (detail 1: this will change).')],
     sfx=[(0.3, 'leather_creak_wind', 'leather creak under the wind')],
     real=('HANDS', 'Hands only.'),
     needs=[('Rider hands on grips (humans: real cylinder grips)', 'exists-wip', '')])

shot('1C-17', cam=cam(85, 'air-to-air', 'close: Leaf\'s head (L) glances at Charcoal without fear', stop='T2.8', focus='3 m on the eye'),
     who=[('Leaf (head)', 'L', '')],
     beats=[(0.8, 'He glances at Charcoal (detail 2).')],
     sfx=[(0, 'wind_altitude', '')],
     real=('NONE', 'No people.'),
     needs=[('Leaf head and eye look', 'exists-wip', '')])

shot('1C-18', cam=cam(85, 'air-to-air from the inland side', 'medium: Remi in contre-jour, relaxed, his head turned toward the island instead of scanning the sky',
                      stop='T4', focus='30 m on Remi'),
     who=[('Remi', 'R', 'contre-jour, face in shade, ~20 % of frame height')],
     beats=[(0.5, 'Remi looks at the island (detail 3).')],
     sfx=[(0, 'wind_altitude', '')],
     real=('SIL WIDE', CONTRE + '.'),
     needs=[('Remi rider', 'exists-wip', '')])

shot('1C-19', cam=cam(35, 'slow aerial travel', 'extreme wide: Leaf and Charcoal small over the sea, the island on the inland side; private freedom, not a procession',
                      stop='T5.6', focus='infinity'),
     who=[('Leaf', 'L', ''), ('Charcoal', 'R', ''), ('Island', 'L-bg', '')],
     beats=[(0, 'The sky can be watched without being attacked.')],
     sfx=[(0, 'wind_altitude', '')],
     real=('WIDE', 'Riders are dots.'),
     needs=[('F3 set', 'exists-wip', '')])

# ======================================================================= 1D
shot('1D-01', cam=cam(85, 'air-to-air from the inland side', 'medium: Remi in contre-jour looks toward the palace\'s distant position (screen left)',
                      stop='T4', focus='30 m'),
     trans=('cut',),
     who=[('Remi', 'R', 'contre-jour; looks screen-left')],
     beats=[(0.5, 'He looks toward the palace.')],
     sfx=[(0, 'wind_altitude', '')],
     real=('SIL', CONTRE + '.'),
     needs=[('Remi rider', 'exists-wip', '')])

shot('1D-02', cam=cam(100, 'Remi\'s POV (dragonback shake)', 'POV: the palace, distant on the island, in haze',
                      stop='T5.6', focus='infinity'),
     who=[('Palace (distant)', 'L', ''), ('Island', 'L', '')],
     beats=[(0.5, 'The palace on the island\'s high ground.')],
     sfx=[(0, 'wind_altitude', '')],
     real=('NONE', 'No people.'),
     needs=[('Palace', 'missing', 'Closest honest: a cluster of sets/buildings.js halls and towers on the island\'s high ground at 4-6 km in haze (castle.js is a primitive placeholder: avoid).')])

shot('1D-03', cam=cam(85, 'air-to-air from the inland side, slightly ahead of Remi (front quarter)', 'medium: Remi in contre-jour; when he turns back toward Abby his face turns away from this camera',
                      stop='T4', focus='30 m on Remi'),
     who=[('Remi', 'R', 'contre-jour; eyeline screen-left toward Abby')],
     lines=[('L046', 2.0)],
     beats=[(0.2, 'He is still looking toward the palace.'), (1.0, 'He turns to Abby.'), ('L046', 'Casually, as if continuing a conversation that has occupied him more than he admits (ORIGINAL line, verbatim).'),
            ('L046.end', 'He waits.')],
     sfx=[(0, 'wind_altitude', 'wind under his voice; no music')],
     real=('SIL', CONTRE + '. ' + NO_LIPSYNC),
     needs=[('Remi rider', 'exists-wip', '')],
     note='ORIGINAL line. No music from here until 1D-06.')

shot('1D-04', cam=cam(85, 'air-to-air from the inland side', 'close: Abby from behind-right (lost profile), looking ahead; wind in her hair; she does not answer',
                      stop='T2.8', focus='6 m on her ear'),
     who=[('Abby', 'L', 'lost profile, eyes forward')],
     dur=4.0,
     beats=[(0, 'Abby says nothing. She looks ahead.'), (2.0, 'No answer, no nod, no narration.'), ('end-0.5', 'The silence has become uncomfortable.')],
     sfx=[(0, 'wind_altitude', 'only wind and wingbeats'), (1.0, 'leaf_beats', '')],
     real=('BACK', 'Her stillness from behind carries the silence; her mouth never moves.'),
     needs=[('Abby rider', 'exists-wip', '')],
     note='CANON: Abby is silent after the succession question. No line, no nod, no narration.')

shot('1D-05', cam=cam(85, 'air-to-air from the inland side', 'medium: Remi in contre-jour', stop='T4', focus='30 m'),
     who=[('Remi', 'R', 'contre-jour')],
     lines=[('L047', 0.3)],
     min_tail=1.0,
     beats=[('L047', 'He answers himself (ORIGINAL line, verbatim).')],
     sfx=[(0, 'wind_altitude', '')],
     real=('SIL', CONTRE + '. ' + NO_LIPSYNC),
     needs=[('Remi rider', 'exists-wip', '')])

shot('1D-06', cam=cam(75, 'air-to-air', 'wide: the dragons continue across open water', stop='T4', focus='300 m'),
     who=[('Leaf', 'L', ''), ('Charcoal', 'R', '')],
     beats=[(0, 'Open water.'), (0.5, 'M2 returns, softly.')],
     sfx=[(0, 'wind_altitude', ''), (1.0, 'charcoal_beats', '')],
     real=('WIDE', 'Riders small.'),
     needs=[('F3 set', 'exists-wip', '')])

shot('1D-07', cam=cam(85, 'air-to-air', 'close: Abby\'s lost profile from behind-right; a shallow smile lifts her cheek; she still does not answer',
                      stop='T2.8', focus='6 m on her cheek'),
     who=[('Abby', 'L', 'lost profile')],
     beats=[(0.8, 'A shallow smile flickers (cheek lift).'), (2.2, 'It fades. She still does not answer.')],
     sfx=[(0, 'wind_altitude', '')],
     real=('BACK', 'The smile reads as a cheek lift in lost profile; the mouth is out of view.'),
     needs=[('Smile expression on the rider build', 'exists-wip',
             'The humans library has MPFB2 expression targets; if the ride build lacks a smile shape, hold the lost profile - the story beat (she does not answer) still plays.')],
     note='CANON: still no answer to the succession question.')

shot('1D-08', cam=cam(50, 'Abby\'s POV', 'POV across Charcoal\'s enormous body: the effortless way he holds the air',
                      stop='T5.6', focus='60 m'),
     who=[('Charcoal (body, wing)', 'R', '')],
     beats=[(1.0, 'One immense, slow wingbeat.')],
     sfx=[(1.0, 'charcoal_beats', 'one immense slow beat')],
     real=('NONE', 'Remi is not in this POV framing.'),
     needs=[('Charcoal in flight, hero distance', 'exists-wip', '')])

shot('1D-09', cam=cam(65, 'air-to-air, over her right shoulder', 'close over Abby\'s shoulder toward Charcoal (R): her face turned away, toward him',
                      stop='T2.8', focus='60 m on Charcoal'),
     who=[('Abby', 'L-fg', 'from behind, soft; eyeline screen-right'), ('Charcoal', 'R-bg', '')],
     lines=[('L048', 0.6)],
     beats=[('L048', 'ORIGINAL line, verbatim.')],
     sfx=[(0, 'wind_altitude', '')],
     real=('OTS BACK', 'She asks it looking at Charcoal, away from camera. ' + NO_LIPSYNC),
     needs=[('Abby rider', 'exists-wip', '')])

shot('1D-10', cam=cam(135, 'air-to-air two-shot, long lens from the inland side', 'medium-wide: Abby and Leaf L, Remi and Charcoal R-bg across the gap; riders small',
                      stop='T4', focus='250 m'),
     who=[('Abby', 'L', 'small'), ('Leaf', 'L', ''), ('Remi', 'R-bg', 'small, contre-jour'), ('Charcoal', 'R-bg', '')],
     lines=[('L049', 0.7), ('L050', 0.45), ('L051', 0.45)],
     beats=[('L049', 'Across the gap, wind between the lines.')],
     sfx=[(0, 'wind_altitude', 'between lines')],
     real=('WIDE SIL', NO_LIPSYNC),
     needs=[('F3 set with riders', 'exists-wip', '')])

shot('1D-11', cam=cam(85, 'air-to-air', 'close: Abby\'s hand on Leaf\'s neck (sharp) and Leaf\'s eye turning toward her voice (R); her shoulder soft at left',
                      stop='T2.8', focus='1.5 m on the eye'),
     who=[('Abby', 'C', 'shoulder and hand'), ('Leaf (head, one eye)', 'R', '')],
     lines=[('L052', 1.8)],
     beats=[(0.5, 'Her hand touches him affectionately.'), (1.2, 'Leaf turns one eye toward her.'), ('L052', 'To Leaf.')],
     sfx=[],
     real=('HANDS DOF', NO_LIPSYNC),
     needs=[('Leaf eye look', 'exists-wip', '')])

shot('1D-12', cam=cam(85, 'air-to-air from the inland side', 'medium: Remi in contre-jour (R), Abby small in the soft background (L-bg)',
                      stop='T4', focus='30 m on Remi'),
     who=[('Remi', 'R', 'contre-jour'), ('Abby', 'L-bg', 'small, soft')],
     lines=[('L053', 0.6), ('L054', 0.45), ('L055', 0.4)],
     min_tail=2.5,
     beats=[('L053', 'A plain answer; he is not advertising a war.'), ('L055.end', 'A little quiet: wind fills it.')],
     sfx=[('L055.end', 'wind_altitude', 'wind fills the quiet')],
     real=('SIL', CONTRE + '. ' + NO_LIPSYNC),
     needs=[('Riders', 'exists-wip', '')])

shot('1D-13', cam=cam(100, 'air-to-air two-shot from the inland side', 'medium-wide: Abby (L) from behind-right, Remi small across the gap (R-bg)',
                      stop='T4', focus='10 m on Abby'),
     who=[('Abby', 'L', 'back three-quarter'), ('Remi', 'R-bg', 'small, contre-jour')],
     lines=[('L056', 1.2), ('L057', 0.5), ('L058', 0.3), ('L059', 0.35)],
     beats=[('L056', 'Light teasing.'), ('L059.end+0.5', 'Wind.')],
     sfx=[(0, 'wind_altitude', '')],
     real=('BACK WIDE', NO_LIPSYNC),
     needs=[('Riders', 'exists-wip', '')])

shot('1D-14', cam=cam(75, 'air-to-air', 'wide: Leaf edges toward Charcoal; Abby\'s small corrective gesture; Leaf follows, then looks back at the larger dragon',
                      stop='T4', focus='250 m'),
     who=[('Leaf', 'L', 'edging right'), ('Charcoal', 'R', ''), ('Abby', 'L', 'small')],
     beats=[(0.5, 'Leaf edges closer.'), (2.0, 'Abby\'s corrective tug.'), (3.0, 'Leaf follows for a moment...'), (4.5, '...then looks back at Charcoal.')],
     sfx=[(0.5, 'leaf_beats', 'beats quicken')],
     real=('WIDE', 'Riders small.'),
     needs=[('F3 set', 'exists-wip', '')])

shot('1D-15', cam=cam(65, 'air-to-air', 'medium from behind Abby leaning toward Leaf\'s neck', stop='T2.8', focus='3 m'),
     who=[('Abby', 'L', 'from behind')],
     lines=[('L060', 0.3)],
     beats=[('L060', 'Warning Leaf.')],
     sfx=[],
     real=('BACK', NO_LIPSYNC),
     needs=[('Abby rider', 'exists-wip', '')])

shot('1D-16', cam=cam(75, 'air-to-air', 'wide: Leaf makes one quick nip toward Charcoal - irritating, not damaging; shown clearly once',
                      stop='T4', focus='200 m'),
     who=[('Leaf', 'L', 'nips'), ('Charcoal', 'R', '')],
     beats=[(0.6, 'Leaf darts his head toward Charcoal\'s neck.'), (1.1, 'The nip: jaws snap at the hide.'), (1.6, 'He pulls back.')],
     sfx=[(1.1, 'jaws_snap', 'small')],
     real=('WIDE', 'Riders small.'),
     needs=[('Leaf head dart + jaw', 'exists-wip', 'Creature look/jaw controls.')],
     note='CANON: Leaf initiates the nip.')

shot('1D-17', cam=cam(85, 'air-to-air', 'close: Charcoal\'s head and eye (R) turn slowly; no roar', stop='T4', focus='10 m on the eye'),
     who=[('Charcoal (head, eye)', 'R', '')],
     beats=[(0.5, 'His head begins to turn, slowly.'), (3.0, 'His eye on Leaf.')],
     sfx=[(0.5, 'charcoal_low_breath', 'low breath; no roar')],
     real=('NONE', 'No people.'),
     needs=[('Charcoal head/eye (creatures)', 'exists-wip', '')])

shot('1D-18', cam=cam(85, 'air-to-air from the inland side', 'medium: Remi in contre-jour notices the turn and watches, attentive, not panicked',
                      stop='T4', focus='30 m'),
     who=[('Remi', 'R', 'contre-jour')],
     lines=[('L061', 'end', 0.25)],
     beats=[(0.5, 'Remi notices.'), ('L061', 'Abby\'s sharper warning, off-screen.')],
     sfx=[],
     real=('SIL OFF', 'Abby is off-screen for her line (as in the shot list). ' + NO_LIPSYNC),
     needs=[('Remi rider', 'exists-wip', '')])

shot('1D-19', cam=cam(28, 'air-to-air, wide lens, stable', 'wide: both dragons and both riders; Charcoal takes Leaf\'s whole head into his mouth; Abby\'s body stays safely outside',
                      stop='T5.6', focus='60 m'),
     who=[('Leaf', 'L', ''), ('Abby', 'L', 'small, safely outside'), ('Charcoal', 'R', ''), ('Remi', 'R', 'small')],
     beats=[(0, 'Music stops: only wingbeats and rushing air.'), (0.6, 'Charcoal opens his jaws.'),
            (1.4, 'Leaf\'s whole head is inside; controlled head movement; both keep flying.'),
            (2.2, 'A muffled squeak from Leaf.'), (3.5, 'Teeth do not close through skin. Brief.')],
     sfx=[(0, 'wind_altitude', 'up: only wingbeats and rushing air'), (2.2, 'leaf_squeak_muffled', '')],
     real=('WIDE', 'Wide angle per the screenplay; riders small.'),
     needs=[('Head-in-mouth choreography', 'small-build',
             'Charcoal jaw 0-0.9 and head/neck posing exist; place Leaf\'s head inside the open mouth and keep the lips clear of teeth contact. Check from this camera only.')],
     note='CANON: Charcoal does not harm Leaf.')

shot('1D-20', cam=cam(85, 'air-to-air', 'close: Abby from behind-right, frozen; her hands stop on the grips', stop='T2.8', focus='6 m'),
     who=[('Abby', 'L', 'lost profile, frozen')],
     beats=[(0.2, 'Astonished stillness.')],
     sfx=[(0, 'wind_altitude', 'rushing air')],
     real=('BACK', 'Stillness from behind.'),
     needs=[('Abby rider', 'exists-wip', '')])

shot('1D-21', cam=cam(85, 'air-to-air from the inland side', 'medium: Remi in contre-jour, more resigned than frightened', stop='T4', focus='30 m'),
     who=[('Remi', 'R', 'contre-jour')],
     lines=[('L062', 0.4)],
     beats=[('L062', 'Quietly, to Charcoal.')],
     sfx=[],
     real=('SIL', CONTRE + '. ' + NO_LIPSYNC),
     needs=[('Remi rider', 'exists-wip', '')])

shot('1D-22', cam=cam(75, 'air-to-air', 'wide: Charcoal releases Leaf; Leaf jerks his head back, puts distance between them, eyes forward; uninjured',
                      stop='T4', focus='200 m'),
     who=[('Leaf', 'L', 'pulls away'), ('Charcoal', 'R', '')],
     beats=[(0.5, 'Release.'), (1.0, 'Leaf jerks his head back.'), (2.0, 'Rapid beats; distance; eyes forward.')],
     sfx=[(0.5, 'wet_release', ''), (1.0, 'leaf_beats', 'rapid, pulling away')],
     real=('WIDE', 'Riders small.'),
     needs=[('As 1D-19', 'small-build', '')],
     note='CANON: Leaf is released unharmed.')

shot('1D-23', cam=cam(100, 'air-to-air two-shot from the inland side', 'medium-wide: Abby (L) from behind-right, Remi small across the gap (R-bg)',
                      stop='T4', focus='10 m on Abby'),
     who=[('Abby', 'L', 'back three-quarter'), ('Remi', 'R-bg', 'small, contre-jour')],
     lines=[('L063', 0.6), ('L064', 0.45), ('L065', 0.35), ('L066', 0.4)],
     beats=[('L063', 'Abby processing.'), ('L064', 'Remi, dry.')],
     sfx=[(0, 'wind_altitude', 'between lines')],
     real=('BACK WIDE', NO_LIPSYNC),
     needs=[('Riders', 'exists-wip', '')])

shot('1D-24', cam=cam(85, 'air-to-air', 'close: Abby\'s hand rubbing Leaf\'s neck (sharp), Leaf\'s eye; her shoulder soft', stop='T2.8', focus='1.5 m'),
     who=[('Abby', 'C', 'hand and shoulder'), ('Leaf (neck)', 'R', '')],
     lines=[('L067', 1.6)],
     beats=[(0.3, 'She checks him visually: uninjured.'), (1.0, 'She rubs a hand against him.'), ('L067', 'To Leaf.')],
     sfx=[],
     real=('HANDS DOF', NO_LIPSYNC),
     needs=[('Leaf neck, Abby hand', 'exists-wip', '')],
     note='CANON: Leaf is uninjured.')

shot('1D-25', cam=cam(85, 'air-to-air from the inland side', 'medium: Remi in contre-jour (small smile carried by a relaxed exhale and his shoulders); Charcoal\'s head returns to the flight path behind him',
                      stop='T4', focus='30 m'),
     who=[('Remi', 'R', 'contre-jour'), ('Charcoal (head)', 'R-bg', '')],
     beats=[(0.3, 'Remi allows a small smile (an exhale, shoulders easing).'), (1.2, 'Charcoal returns his head to the flight path.'), (1.5, 'M2 returns softly.')],
     sfx=[],
     real=('SIL', 'The smile is body language in contre-jour; the face close-up waits for approved faces.'),
     needs=[('Remi rider', 'exists-wip', '')])

shot('1D-26', cam=cam(100, 'air-to-air two-shot from the inland side', 'medium-wide: Abby (L) from behind-right, Remi small across the gap',
                      stop='T4', focus='10 m on Abby'),
     who=[('Abby', 'L', 'back three-quarter'), ('Remi', 'R-bg', 'small')],
     lines=[('L068', 0.3), ('L069', 0.35)],
     min_tail=0.25,
     dur='tight',
     beats=[('L068', 'Lightness returns briefly.'), ('L069', 'Abby.')],
     sfx=[],
     real=('BACK WIDE', NO_LIPSYNC),
     needs=[('Riders', 'exists-wip', '')],
     note='Kept brief, no added hold, so the interruption feels sudden.')

# ======================================================================= 1E
shot('1E-01', cam=cam(75, 'air-to-air, long lens from the inland side', 'wide: an ordinary flight shot; Leaf slightly behind on the inland side of Charcoal',
                      stop='T4', focus='300 m'),
     who=[('Leaf', 'L-fg', 'slightly behind'), ('Charcoal', 'R-bg', '')],
     beats=[(0, 'Ordinary flight; the light theme fades out. No musical warning.')],
     sfx=[(0, 'wind_altitude', '')],
     real=('WIDE', 'Riders small.'),
     needs=[('F3 set', 'exists-wip', '')])

shot('1E-02', cam=cam(75, 'air-to-air from the inland side', 'wide: a narrow shape appears at the far right edge, ahead of them, gone before it resolves',
                      stop='T4', focus='300 m'),
     who=[('Leaf', 'L', ''), ('Abby', 'L', 'small'), ('Charcoal', 'R-bg', ''), ('Narrow shape', 'far-R edge', 'a streak')],
     beats=[(0.8, 'A narrow shape at the far right edge.'), (1.3, 'Gone.')],
     sfx=[],
     real=('WIDE', 'Riders small.'),
     needs=[('Scout (creatures: scout, Slitherwing)', 'exists-wip', '')])

shot('1E-03', cam=cam(40, 'air-to-air from the inland side, slightly high, locked to Leaf', 'wide: the Slitherwing comes head-on from frame right and cuts through the gap between Leaf and Charcoal, along Leaf\'s LEFT (seaward, far) side; violent wake',
                      stop='T4', focus='25 m on Abby'),
     who=[('Leaf', 'L-fg', ''), ('Abby', 'L-fg', 'small'), ('Scout (Slitherwing)', 'R to L, mid-ground', 'through the gap, far side of Leaf'),
          ('Scout rider', 'on the scout', 'strapped silhouette'), ('Charcoal', 'R-bg', '')],
     beats=[(0.2, 'The scout enters frame right, head-on.'), (0.75, 'It passes through the gap, close along Leaf\'s far side. No weapon, no contact.'),
            (1.0, 'The wake hits Leaf.')],
     sfx=[(0.75, 'scout_pass', 'crack at closest approach (file crack at 1.20 s; the pre-roll starts in 1E-02)')],
     real=('WIDE', 'Abby small; the scout rider only a silhouette.'),
     needs=[('Scout + scout rider (creatures: scout; humans: scout_ride)', 'exists-wip', ''),
            ('Accurate blur on a curved, very fast pass', 'exists', 'Render this shot with accumulated sub-frames (8) - velocity blur assumes straight motion.')],
     mode='accumulate8', cost='sky_acc8',
     note='CANON: the pass itself causes the injury: no weapon, no contact. Do not mirror.')

shot('1E-04', cam=cam(40, 'neutral-axis front shot: directly ahead of Leaf looking back along the flight line; handheld-feel shake',
                      'medium-wide: Abby ~30 % of frame height behind Leaf\'s head and neck; her LEFT arm on screen RIGHT is wrenched as Leaf rolls to his RIGHT (right wing dips screen LEFT)',
                      stop='T4', focus='8 m on Abby\'s left arm'),
     who=[('Abby', 'C', 'facing camera but small, head ducking, hair across the face, motion-blurred'), ('Leaf', 'C', 'rolling to his right; right wing dips screen-left')],
     beats=[(0.0, 'The wake: Leaf rolls to his RIGHT.'), (0.4, 'Abby is thrown against her restraint.'),
            (0.6, 'Her LEFT arm (screen right) is wrenched violently.'), (1.0, 'She cries out and pulls that arm in.'),
            (2.0, 'No slow motion, no bone image.')],
     sfx=[(0.3, 'equipment_jolt', 'equipment jolting under load'), (0.5, 'abby_cry', 'startled breath and cry'), (0, 'leaf_beats_uneven', '')],
     real=('WIDE', 'Not a face shot: she is small in frame, ducking toward the hurt arm with her hair across her face, under handheld shake and motion blur; Leaf\'s head partly covers her.'),
     needs=[('Abby injury reaction (arm wrench, pull-in)', 'missing',
             'Closest honest: arm IK keyed on the abby_ride build (left arm thrown out then pulled in), torso jolt via the rider root; the abby_ride_injured build for the held-in arm afterwards.'),
            ('Abby cry (non-verbal)', 'small-build', 'TTS cannot scream: make_vo\'s pain-gasp generator as a stand-in, or Daxtyn records it.')],
     note='Declared neutral-axis shot. LEFT arm = screen RIGHT. Do not mirror.')

shot('1E-05', cam=cam(65, 'air-to-air from the inland side', 'medium: Abby\'s RIGHT hand gripping (toward camera, sharp); her LEFT arm held in on the far side',
                      stop='T2.8', focus='4 m on her right hand'),
     who=[('Abby', 'C', 'side-back; right hand sharp'), ('Leaf', 'C', 'catching himself')],
     beats=[(0.3, 'Leaf catches himself.'), (1.0, 'She stays in the saddle: right hand grips what it can.'), (2.0, 'The left arm stays held in.')],
     sfx=[(0, 'leaf_beats_uneven', 'uneven')],
     real=('HANDS BACK', 'The gripping right hand carries it.'),
     needs=[('abby_ride_injured build (left arm held in)', 'exists-wip', '')])

shot('1E-06', cam=cam(85, 'air-to-air from the inland side', 'medium: Remi in contre-jour, turning sharply toward Abby', stop='T4', focus='30 m'),
     who=[('Remi', 'R', 'contre-jour')],
     lines=[('L070', 0.25)],
     beats=[('L070', 'Clipped, afraid.')],
     sfx=[],
     real=('SIL', CONTRE + '. ' + NO_LIPSYNC),
     needs=[('Remi rider', 'exists-wip', '')])

shot('1E-07', cam=cam(85, 'air-to-air', 'close: Abby from behind-right, shoulders heaving, right hand gripping, left arm held in',
                      stop='T2.8', focus='6 m'),
     who=[('Abby', 'L', 'back three-quarter')],
     beats=[(0.3, 'She tries to reply; her first breath will not form a word.'), (1.5, 'Leaf\'s beats are rapid and uneven.')],
     sfx=[(0.3, 'abby_ragged_breath', ''), (0, 'leaf_beats_uneven', '')],
     real=('BACK', 'From behind; the breath tells it.'),
     needs=[('Abby ragged breath (non-verbal)', 'small-build', 'As 1E-04.')])

shot('1E-08', cam=cam(85, 'air-to-air from the inland side', 'medium: Remi in contre-jour', stop='T4', focus='30 m'),
     who=[('Remi', 'R', 'contre-jour')],
     lines=[('L071', 0.25)],
     beats=[('L071', 'Louder.')],
     sfx=[],
     real=('SIL', CONTRE + '. ' + NO_LIPSYNC),
     needs=[('Remi rider', 'exists-wip', '')])

shot('1E-09', cam=cam(85, 'air-to-air', 'close: Abby from behind-right, head bowed toward the left arm held in on the far side',
                      stop='T2.8', focus='6 m'),
     who=[('Abby', 'L', 'back three-quarter, head bowed')],
     lines=[('L072', 0.2)],
     dur='tight', min_tail=0.1,
     beats=[('L072', 'Pain narrows her voice; cut off - Remi cuts in on it (no hold).')],
     sfx=[],
     real=('BACK', NO_LIPSYNC),
     needs=[('abby_ride_injured', 'exists-wip', '')])

shot('1E-10', cam=cam(85, 'air-to-air from the inland side', 'medium: Remi in contre-jour', stop='T4', focus='30 m'),
     who=[('Remi', 'R', 'contre-jour')],
     lines=[('L073', 0.15)],
     beats=[('L073', 'He cuts in on "My arm-".')],
     sfx=[],
     real=('SIL', CONTRE + '. ' + NO_LIPSYNC),
     needs=[('Remi rider', 'exists-wip', '')])

shot('1E-11', cam=cam(100, 'Remi\'s POV (dragonback shake)', 'POV: the scout\'s silhouette far right, crossing toward open water', stop='T5.6', focus='infinity'),
     who=[('Scout (silhouette)', 'far-R', 'crossing toward open water')],
     beats=[(0.5, 'The scout reappears at a distance.')],
     sfx=[(0.5, 'scout_wing_distant', 'distant sharp wing noise')],
     real=('NONE', 'The scout rider is a dot.'),
     needs=[('Scout in flight', 'exists-wip', '')])

shot('1E-12', cam=cam(85, 'air-to-air from the inland side', 'medium: Remi in contre-jour looks between the scout and Abby; Charcoal\'s head has already tracked the movement',
                      stop='T4', focus='30 m'),
     who=[('Remi', 'R', 'contre-jour'), ('Charcoal (head tracking)', 'R', '')],
     beats=[(0.3, 'Charcoal\'s head is already on the scout.'), (1.0, 'Remi looks to the scout...'), (2.0, '...then back to Abby.')],
     sfx=[(0.3, 'charcoal_low_breath', 'low breath')],
     real=('SIL', CONTRE + '.'),
     needs=[('Remi rider, Charcoal head look', 'exists-wip', '')])

shot('1E-13', cam=cam(75, 'air-to-air', 'wide: Remi brings Charcoal near Leaf long enough to see that Abby is secured and Leaf is stable again',
                      stop='T4', focus='150 m'),
     who=[('Leaf', 'L', 'stable again'), ('Abby', 'L', 'small, secured'), ('Charcoal', 'R', 'closing in'), ('Remi', 'R', 'small')],
     beats=[(0.5, 'Charcoal closes in.'), (2.5, 'Remi checks her before he leaves.'), (4.0, 'Leaf steadier.')],
     sfx=[(0.5, 'charcoal_beats', 'heavy beats close'), (2.5, 'leaf_beats', 'steadier')],
     real=('WIDE', 'Riders small.'),
     needs=[('F3 set', 'exists-wip', '')],
     note='Remi checks on Abby before he leaves (shot list REMI_CHECKS_ABBY_FIRST).')

shot('1E-14', cam=cam(100, 'air-to-air two-shot from the inland side', 'medium-wide: Abby (L) from behind-right, left arm held in; Remi close across the gap (R-bg)',
                      stop='T4', focus='10 m on Abby'),
     who=[('Abby', 'L', 'back three-quarter, left arm held in'), ('Remi', 'R-bg', 'small, contre-jour')],
     lines=[('L074', 0.6), ('L075', 0.4), ('L076', 0.3)],
     beats=[('L074', 'Short, clipped.'), ('L075', 'Through pain.'), ('L076', 'Firm.')],
     sfx=[(0, 'wind_altitude', 'between lines')],
     real=('BACK WIDE', NO_LIPSYNC),
     needs=[('abby_ride_injured', 'exists-wip', '')])

shot('1E-15', cam=cam(65, 'air-to-air', 'close from behind Abby as she leans over Leaf\'s neck, right hand on his neck, left arm held in',
                      stop='T2.8', focus='2 m'),
     who=[('Abby', 'C', 'from behind, leaning forward'), ('Leaf (neck)', 'C', 'turning toward Verdor')],
     lines=[('L077', 1.0)],
     beats=[(0.2, 'Leaf turns toward Verdor.'), ('L077', 'She leans over him, speaking close.')],
     sfx=[],
     real=('BACK', NO_LIPSYNC),
     needs=[('abby_ride_injured leaning pose', 'exists-wip', 'Spine lean on the baked ride pose.')])

shot('1E-16', cam=cam(85, 'air-to-air from the inland side', 'medium: Remi in contre-jour watches them commit to the route home', stop='T4', focus='30 m'),
     who=[('Remi', 'R', 'contre-jour, looking screen-left after them')],
     beats=[(0.5, 'He watches them go.')],
     sfx=[(0.5, 'leaf_beats', 'receding')],
     real=('SIL', CONTRE + '.'),
     needs=[('Remi rider', 'exists-wip', '')])

shot('1E-17', cam=cam(100, 'air-to-air from the inland side', 'close: Remi turns his head seaward toward the scout - away from camera; shoulders square, he gathers the reins',
                      stop='T2.8', focus='30 m on his shoulder'),
     who=[('Remi', 'R', 'back of the head as he looks seaward; contre-jour')],
     beats=[(0.2, 'He looks at the scout.'), (1.0, 'The ease is gone: shoulders square, reins gathered.')],
     sfx=[(0, 'wind_altitude', ''), (0, 'charcoal_low_breath', 'very low')],
     real=('BACK SIL', 'He looks away from camera toward the scout; the change is in his body. Face close-up waits for approved faces.'),
     needs=[('Remi rider; rein-gather hand pose', 'exists-wip', '')],
     note='M3 low drone enters here.')

shot('1E-18', cam=cam(40, 'air-to-air from the inland side', 'wide: Remi gives the command; Charcoal banks away toward the sea. NO flame',
                      stop='T4', focus='60 m'),
     who=[('Charcoal', 'C', 'banking toward the sea'), ('Remi', 'C', 'small')],
     lines=[('L078', 0.6)],
     beats=[('L078', 'The command: a physical attack. No flame.'), ('L078.end+0.4', 'Charcoal banks.'), ('end-0.5', 'Cut to the end card.')],
     sfx=[('L078.end+0.6', 'banking_wingbeat', 'one deep banking wingbeat, rings into the end card')],
     real=('WIDE', 'Remi small. ' + NO_LIPSYNC),
     needs=[('Charcoal bank (creatures: glide/bank)', 'exists-wip', '')],
     note='CANON: Attack is a physical-attack command; no flame, no glow.')
