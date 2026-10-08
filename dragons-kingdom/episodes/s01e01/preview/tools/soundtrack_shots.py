"""soundtrack_shots.py - authored sound decisions for the S01E01 preview, shot by shot.

build_soundtrack.py reads timing from edl.json (frames, lines, cue frames, music cues) and
these tables for everything the EDL leaves to the mixer: how loud each ambience layer is in
each shot, where each creature is (gain, pan, distance) and how its wings beat, how the
altitude wind changes with height, speed and perspective, and how each EDL sound cue is
realized (generator, level, pan, space).

Units
  * Bed and wind levels: dB relative to the dialogue level (-20 dBFS RMS). -16 = a bed whose
    RMS sits 16 dB under speech.
  * Cue gains: dB relative to dialogue's loudest 100 ms (sfx_lib.CUE_REF_DB), i.e. 0 dB means
    as loud as a line at its loudest. Big events go above 0 and meet the master limiter.
  * Pan: -1 = hard left (screen left), +1 = hard right. Equal-power.
  * Distance: 0 = at the ear .. 3 = far (air absorption in sfx_lib.distance).
Screen-direction conventions are the shot list's: in 1C-1E Leaf (Abby) is screen-left/near,
Charcoal (Remi) screen-right/far; the scout passes right -> left on Leaf's far side.
"""

OFF = -120.0

# ------------------------------------------------------------------ dialogue placement
DX_SPACE_SEND_DB = {"chamber": -13.0, "grounds": -20.0, "sky": -30.0, "sea": None, "far": None, None: None}
SET_SPACE = {"CARD_BLACK": "sea", "SEA_COAST_DAWN": "sea", "PROLOGUE_VISTAS": "far", "VERDOR_GROUNDS": "grounds",
             "BIRTHING_CHAMBER": "chamber", "SKY_OFF_VERDOR": "sky"}
# speaker name as it appears in edl in_frame[].who
WHO = {"ABBY": "Abby", "REMI": "Remi", "ALEXANDRIA": "Alexandria", "ATTENDANT": "Attendant",
       "GROUND KEEPER": "Ground keeper"}
# off-screen speakers in flight keep their side of the formation (Abby/Leaf left, Remi/Charcoal right)
OFFSCREEN_PAN = {"SKY_OFF_VERDOR": {"ABBY": -0.2, "REMI": 0.2}}
DX_PAN_OVERRIDE = {
    # L061 "Leaf." is heard off-screen at the end of a shot on Remi (1D-18): from Leaf's side
    "L061": -0.25,
}


def screen_pan(pos, scale=1.0):
    """edl in_frame screen_pos -> pan. Subtle for dialogue (scale ~0.25-0.4), wider for effects."""
    p = (pos or "").strip()
    if p.startswith("far-L"):
        v = -1.6
    elif p.startswith("far-R"):
        v = 1.6
    elif p.startswith("L"):
        v = -1.0
    elif p.startswith("R to L") or p.startswith("L to R"):
        v = 0.0
    elif p.startswith("R"):
        v = 1.0
    else:
        v = 0.0
    if "-fg" in p:
        v *= 0.8
    return max(-1.0, min(1.0, v * scale))


DX_PAN_SCALE = 0.25          # dialogue offsets stay subtle (audio-plan.md: near the centre)

# ------------------------------------------------------------------ ambience beds (dB re dialogue)
# Layers: sea_rock (waves on rock), sea_wash, sea_calm, sea_heavy, sea_distant, wind_low,
# wind_trees, wind_distant, wind_high, meadow, room, opening, lamp, birds, field_wind, sea_far.
# A shot lists the layers it hears; any layer not listed is off in that shot. Changes ramp over
# the shot's EDL transition (dissolve length) or 2 frames on a cut, centred on the cut.
CHAMBER = {"room": -25.0, "opening": -29.0, "lamp": -31.0}
FIELD = {"birds": -22.0, "field_wind": -23.0}
BEDS = {
    "P-01": {"sea_rock": -11.0},
    "P-02": {"sea_rock": -13.0, "sea_wash": -17.0},
    "P-03": {"sea_rock": -17.0, "sea_wash": -16.0},
    "P-04": {"sea_rock": -19.0, "sea_wash": -14.0},
    "P-05": {"sea_rock": -19.0, "sea_wash": -16.0},
    "P-06": {"sea_rock": -19.0, "sea_wash": -17.0},
    "P-07": {"sea_rock": -25.0, "sea_wash": -23.0},          # sea drops 6 dB: silence around him
    "P-08": {"wind_low": -19.0, "sea_distant": -27.0},
    "P-09": {"sea_wash": -16.0},
    "P-10": {"wind_trees": -18.0},
    "P-11": {"wind_distant": -19.0},
    "P-12": {"sea_wash": -20.0},
    "P-13": {"sea_calm": -19.0},
    "P-14": {"sea_heavy": -17.0},
    "P-15": {"sea_distant": -23.0},
    "P-16": {"wind_high": -26.0},
    "P-17": {"meadow": -20.0},
    "T-01": {"room": -29.0, "opening": -35.0, "lamp": -37.0},  # very low under the title
    "1A-01": {**CHAMBER, "lamp": -28.0},                     # close on the egg, lamp hiss bed
    "1A-02": {**CHAMBER, "opening": -25.0},                  # faint wind beyond the high opening
    "1A-15": {"room": -29.0, "opening": -33.0, "lamp": -35.0},  # dips 4 dB: the whisper, nothing else
    "1A-25": {"room": -27.0, "opening": -40.0, "lamp": -42.0},  # all sound pulls back to room tone
    "1B-01": {**FIELD},
    "1C-03": {"birds": -26.0, "field_wind": -25.0},          # the sound drops into a lower register
    "1C-04": {"birds": -26.0, "field_wind": -25.0},          # birds cut at 8268 (EXTRA_KEYS)
    "1C-05": {"field_wind": -22.0},
    "1C-06": {"field_wind": -22.0},
    "1C-10": {"sea_far": -22.0},
    "1C-12": {"sea_far": -20.0},
    "1C-15": {"sea_far": -28.0},
    "1C-19": {"sea_far": -28.0},
    "1D-06": {"sea_far": -27.0},
}
# default layers by scene for shots not listed above
SCENE_BEDS = {"TITLE": {"room": -29.0, "opening": -35.0, "lamp": -37.0}, "1A": CHAMBER, "1B": FIELD,
              "1C": FIELD}
# shots in 1C that are already in the air use only the altitude wind (plus any sea_far above)
AIR_SHOTS_1C_FROM = "1C-07"
BED_KIND = {   # layer -> (generator, kind)
    "sea_rock": ("waves_rock", None), "sea_wash": ("sea", "wash"), "sea_calm": ("sea", "calm"),
    "sea_heavy": ("sea", "heavy"), "sea_distant": ("sea", "distant"), "sea_far": ("sea", "far"),
    "wind_low": ("wind", "low"), "wind_trees": ("wind", "trees"), "wind_distant": ("wind", "distant"),
    "wind_high": ("wind", "high"), "meadow": ("wind", "low"), "field_wind": ("wind", "low"),
    "birds": ("birds", None), "room": ("chamber", "room"), "opening": ("chamber", "opening"),
    "lamp": ("chamber", "lamp"),
}
BED_SPACE = {"sea_rock": "sea", "sea_wash": None, "sea_calm": None, "sea_heavy": None, "sea_distant": None,
             "sea_far": None, "wind_low": None, "wind_trees": None, "wind_distant": None, "wind_high": None,
             "meadow": None, "field_wind": None, "birds": "grounds", "room": None, "opening": None, "lamp": None}
# keyframes inside shots: (frame, dB) per layer
EXTRA_KEYS = {
    "sea_rock": [(72, OFF), (84, -11.0)],                  # P-01: fade up from silence over 12 frames
    "birds": [(8268, -26.0), (8274, OFF)],                 # 1C-04 +2.0 s: the birds stop
}
# BEDS ducking under dialogue (dB)
BED_DUCK_DB = -4.0

# ------------------------------------------------------------------ altitude wind (BG-ALTITUDE)
# (level dB re dialogue, buffet 0..1 = low flutter at the rider's ear (speed, dragonback POV),
#  bright 0..1 = high hiss (speed, open air)). Ducked 3 dB under lines, never removed.
ALT_DUCK_DB = -3.0
ALT = {
    "1C-02": (-17.0, 0.4, 0.4),      # keyed: rises from nothing at 7992 (EXTRA_ALT_KEYS)
    "1C-07": (-14.0, 0.6, 0.5), "1C-08": (-15.0, 0.2, 0.4), "1C-09": (-15.0, 0.5, 0.5),
    "1C-10": (-15.0, 0.1, 0.6), "1C-11": (-16.0, 0.1, 0.5), "1C-12": (-17.0, 0.0, 0.5),
    "1C-13": (-15.0, 0.2, 0.5), "1C-14": (-15.0, 0.4, 0.5), "1C-15": (-18.0, 0.1, 0.5),
    "1C-16": (-15.0, 0.5, 0.5), "1C-17": (-17.0, 0.3, 0.5), "1C-18": (-17.0, 0.3, 0.5),
    "1C-19": (-19.0, 0.0, 0.5),
    "1D-01": (-17.0, 0.3, 0.5), "1D-02": (-17.0, 0.1, 0.5), "1D-03": (-15.0, 0.3, 0.5),
    "1D-04": (-13.0, 0.4, 0.5),      # only wind and wingbeats
    "1D-05": (-15.0, 0.3, 0.5), "1D-06": (-16.0, 0.1, 0.5), "1D-07": (-16.0, 0.4, 0.5),
    "1D-08": (-16.0, 0.3, 0.5), "1D-09": (-15.0, 0.4, 0.5), "1D-10": (-15.0, 0.2, 0.5),
    "1D-11": (-15.0, 0.4, 0.5), "1D-12": (-15.0, 0.3, 0.5), "1D-13": (-15.0, 0.4, 0.5),
    "1D-14": (-16.0, 0.2, 0.5), "1D-15": (-15.0, 0.4, 0.5), "1D-16": (-15.0, 0.3, 0.5),
    "1D-17": (-15.0, 0.3, 0.5), "1D-18": (-15.0, 0.3, 0.5),
    "1D-19": (-11.0, 0.3, 0.6),      # music stops: only wingbeats and rushing air
    "1D-20": (-12.0, 0.5, 0.6),
    "1D-21": (-17.0, 0.3, 0.5),      # Remi's quiet "That's enough." must read
    "1D-22": (-15.0, 0.3, 0.5), "1D-23": (-15.0, 0.4, 0.5), "1D-24": (-15.0, 0.4, 0.5),
    "1D-25": (-16.0, 0.3, 0.5), "1D-26": (-16.0, 0.4, 0.5),
    "1E-01": (-16.0, 0.2, 0.5), "1E-02": (-16.0, 0.2, 0.5),
    "1E-03": (-15.0, 0.4, 0.6),      # +8 dB swell for 1 s at the pass (EXTRA_ALT_KEYS)
    "1E-04": (-13.0, 0.9, 0.6), "1E-05": (-13.0, 0.8, 0.6), "1E-06": (-14.0, 0.4, 0.5),
    "1E-07": (-13.0, 0.7, 0.6), "1E-08": (-14.0, 0.4, 0.5), "1E-09": (-16.0, 0.5, 0.5),
    "1E-10": (-15.0, 0.4, 0.5), "1E-11": (-16.0, 0.2, 0.5), "1E-12": (-16.0, 0.3, 0.5),
    "1E-13": (-15.0, 0.3, 0.5), "1E-14": (-15.0, 0.4, 0.5), "1E-15": (-15.0, 0.5, 0.5),
    "1E-16": (-16.0, 0.3, 0.5), "1E-17": (-16.0, 0.3, 0.5), "1E-18": (-14.0, 0.4, 0.6),
}
ALT_CARDS = {"WIP-END": "1E-18"}   # the wind carries into the end card and fades to silence there
EXTRA_ALT_KEYS = [   # (frame, dB offset added to the shot level)
    (7980, -60.0), (7992, -40.0), (8052, 0.0),             # 1C-02: the wind rises as Leaf climbs
    (13120, 0.0), (13126, 8.0), (13150, 8.0), (13170, 2.0),  # the pass: the wind overwhelms everything
    (14217, 0.0), (14290, 3.0), (14301, 2.0), (14325, -6.0), (14385, -60.0),   # bank, then fade to silence
]

# ------------------------------------------------------------------ creatures in flight
# per shot: creature -> (gain dB re cue ref, pan, distance) or None (not heard).
# Gains are the beat's loudness at the downstroke; flight beats duck 10 dB under lines.
BEAT_DUCK_DB = -10.0     # wingbeats sit in the speech band: pulled well down under lines, back up between them
FLIGHT = {
    "1C-01": {"leaf": (-3.0, -0.4, 0.8)},
    "1C-02": {"leaf": (-4.0, 0.0, 0.2)},
    "1C-03": {"leaf": (-24.0, -0.5, 3.0)},
    "1C-07": {"leaf": (-5.0, 0.0, 0.2), "charcoal": (-14.0, 0.2, 2.5)},
    "1C-08": {"leaf": (-14.0, -0.5, 1.5), "charcoal": (-3.0, 0.0, 1.2)},
    "1C-09": {"leaf": (-6.0, 0.0, 0.2), "charcoal": (-16.0, 0.6, 2.8)},
    "1C-10": {"leaf": (-14.0, -0.55, 2.5), "charcoal": (-8.0, 0.55, 2.0)},
    "1C-11": {"leaf": (-7.0, -0.5, 1.0), "charcoal": (-6.0, 0.5, 1.6)},
    "1C-12": {"leaf": (-15.0, -0.3, 2.6), "charcoal": (-11.0, 0.3, 2.4)},
    "1C-13": {"leaf": (-7.0, -0.5, 1.0), "charcoal": (-6.0, 0.5, 1.4)},     # charcoal ramps in (FLIGHT_RAMPS)
    "1C-14": {"leaf": (-13.0, -0.5, 1.8), "charcoal": (-5.0, 0.35, 0.8)},
    "1C-15": {"leaf": (-15.0, -0.5, 2.6), "charcoal": (-11.0, 0.5, 2.4)},
    "1C-16": {"leaf": (-5.0, 0.0, 0.2), "charcoal": (-17.0, 0.6, 2.8)},
    "1C-17": {"leaf": (-6.0, -0.3, 0.6), "charcoal": (-12.0, 0.6, 2.0)},
    "1C-18": {"leaf": (-16.0, -0.6, 2.6), "charcoal": (-6.0, 0.4, 0.9)},
    "1C-19": {"leaf": (-15.0, -0.5, 2.6), "charcoal": (-12.0, 0.5, 2.4)},
    "1D-01": {"leaf": (-16.0, -0.6, 2.6), "charcoal": (-7.0, 0.4, 0.9)},
    "1D-02": {"leaf": (-12.0, -0.3, 1.6), "charcoal": (-12.0, 0.4, 1.8)},
    "1D-03": {"leaf": (-16.0, -0.6, 2.6), "charcoal": (-7.0, 0.4, 0.9)},
    "1D-04": {"leaf": (-5.0, -0.2, 0.3), "charcoal": (-14.0, 0.6, 2.6)},
    "1D-05": {"leaf": (-16.0, -0.6, 2.6), "charcoal": (-7.0, 0.4, 0.9)},
    "1D-06": {"leaf": (-13.0, -0.5, 2.4), "charcoal": (-8.0, 0.5, 1.8)},
    "1D-07": {"leaf": (-6.0, -0.2, 0.3), "charcoal": (-14.0, 0.6, 2.6)},
    "1D-08": {"leaf": (-10.0, -0.2, 0.4), "charcoal": (-1.0, 0.5, 0.9)},   # one immense slow beat
    "1D-09": {"leaf": (-7.0, -0.3, 0.4), "charcoal": (-10.0, 0.5, 1.8)},
    "1D-10": {"leaf": (-10.0, -0.5, 1.6), "charcoal": (-10.0, 0.5, 1.8)},
    "1D-11": {"leaf": (-6.0, 0.1, 0.3), "charcoal": (-16.0, 0.5, 2.6)},
    "1D-12": {"leaf": (-14.0, -0.5, 1.8), "charcoal": (-7.0, 0.4, 0.9)},
    "1D-13": {"leaf": (-7.0, -0.3, 0.4), "charcoal": (-11.0, 0.5, 1.8)},
    "1D-14": {"leaf": (-7.0, -0.35, 0.8), "charcoal": (-8.0, 0.45, 1.4)},
    "1D-15": {"leaf": (-6.0, -0.2, 0.3), "charcoal": (-10.0, 0.5, 1.6)},
    "1D-16": {"leaf": (-6.0, -0.25, 0.8), "charcoal": (-7.0, 0.4, 1.0)},
    "1D-17": {"leaf": (-9.0, -0.3, 1.0), "charcoal": (-6.0, 0.4, 0.8)},
    "1D-18": {"leaf": (-13.0, -0.5, 1.8), "charcoal": (-7.0, 0.4, 0.9)},
    "1D-19": {"leaf": (-7.0, -0.4, 1.0), "charcoal": (-5.0, 0.4, 1.0)},
    "1D-20": {"leaf": (-5.0, -0.2, 0.3), "charcoal": (-9.0, 0.4, 1.2)},
    "1D-21": {"leaf": (-14.0, -0.5, 1.8), "charcoal": (-9.0, 0.4, 0.9)},
    "1D-22": {"leaf": (-5.0, -0.4, 0.8), "charcoal": (-8.0, 0.4, 1.0)},
    "1D-23": {"leaf": (-7.0, -0.3, 0.4), "charcoal": (-12.0, 0.5, 1.8)},
    "1D-24": {"leaf": (-6.0, 0.1, 0.3), "charcoal": (-16.0, 0.5, 2.6)},
    "1D-25": {"leaf": (-15.0, -0.6, 2.6), "charcoal": (-7.0, 0.4, 0.9)},
    "1D-26": {"leaf": (-7.0, -0.3, 0.4), "charcoal": (-12.0, 0.5, 1.8)},
    "1E-01": {"leaf": (-8.0, -0.45, 0.8), "charcoal": (-10.0, 0.5, 1.8)},
    "1E-02": {"leaf": (-9.0, -0.4, 0.8), "charcoal": (-11.0, 0.5, 1.8)},
    "1E-03": {"leaf": (-7.0, -0.4, 0.8), "charcoal": (-12.0, 0.5, 1.8)},
    "1E-04": {"leaf": (-5.0, 0.0, 0.2), "charcoal": (-17.0, 0.5, 2.8)},
    "1E-05": {"leaf": (-5.0, 0.0, 0.2), "charcoal": (-17.0, 0.5, 2.8)},
    "1E-06": {"leaf": (-12.0, -0.5, 1.8), "charcoal": (-8.0, 0.4, 0.9)},
    "1E-07": {"leaf": (-4.0, -0.2, 0.3), "charcoal": (-15.0, 0.5, 2.6)},
    "1E-08": {"leaf": (-12.0, -0.5, 1.8), "charcoal": (-8.0, 0.4, 0.9)},
    "1E-09": {"leaf": (-8.0, -0.2, 0.3), "charcoal": (-16.0, 0.5, 2.6)},
    "1E-10": {"leaf": (-13.0, -0.5, 1.8), "charcoal": (-8.0, 0.4, 0.9)},
    "1E-11": {"leaf": (-12.0, -0.4, 1.6), "charcoal": (-12.0, 0.3, 1.6)},
    "1E-12": {"leaf": (-15.0, -0.6, 2.6), "charcoal": (-7.0, 0.4, 0.9)},
    "1E-13": {"leaf": (-7.0, -0.45, 1.0), "charcoal": (-6.0, 0.5, 1.2)},    # charcoal closes in (FLIGHT_RAMPS)
    "1E-14": {"leaf": (-7.0, -0.3, 0.4), "charcoal": (-8.0, 0.5, 1.0)},
    "1E-15": {"leaf": (-4.0, 0.0, 0.2), "charcoal": (-13.0, 0.5, 2.0)},
    "1E-16": {"leaf": (-11.0, -0.6, 1.8), "charcoal": (-7.0, 0.4, 0.9)},    # leaf recedes (FLIGHT_RAMPS)
    "1E-17": {"charcoal": (-7.0, 0.3, 0.9)},                                # Leaf has gone home
    "1E-18": {"charcoal": (-6.0, 0.0, 0.9)},                                # glides until the bank beat
}
# gain ramps across a shot (creature, from dB, to dB, from pan, to pan)
FLIGHT_RAMPS = {
    "1C-01": ("leaf", -3.0, -16.0, -0.4, -0.2),      # first downbeat near the ground, then he climbs out of frame
    "1C-13": ("charcoal", -14.0, -5.0, 0.6, 0.45),   # heavy beats approach as he draws level
    "1E-13": ("charcoal", -11.0, -4.0, 0.55, 0.45),  # heavy beats close
    "1E-16": ("leaf", -11.0, -26.0, -0.6, -0.85),    # Leaf's beats receding toward Verdor
}
# Wing tempo. creature.js flapHz: Leaf 1.6, Charcoal 0.76, scout 2.6 (assets.json scale
# 'recommended' reading). Steady flight follows poses.js flight(): downstroke onsets where
# fract(t * hz + phase) == 0, t = the set scene's time (render-jobs.json set_time_start_s).
# The phase of each shot is chosen so a downstroke lands on the EDL's cue frame for that
# creature in that shot (when there is one); otherwise phase 0.
HZ = {"leaf": 1.6, "charcoal": 0.76, "scout": 2.6}
CORR = {"leaf": 1.0, "charcoal": 0.0}      # poses.js flight(..., corr): Leaf's corrective unevenness
# tempo segments that differ from steady flight (EDL frames, inclusive start, exclusive end)
TEMPO = {
    "leaf": [
        {"from": 7884, "to": 7913, "mode": "glide", "why": "1C-01: Leaf crouches; wings still before the first downbeat"},
        {"from": 9288, "to": 9294, "mode": "double", "why": "1C-13: corrective double beat (two downstrokes 0.25 s apart)"},
        {"from": 11727, "to": 11859, "mode": "steady", "hz": 2.0, "why": "1D-14: Leaf's beats quicken as he edges toward Charcoal"},
        {"from": 12399, "to": 12471, "mode": "steady", "hz": 2.3, "why": "1D-22: rapid beats, pulling away after the release"},
        {"from": 13144, "to": 13773, "mode": "uneven", "lo": 0.26, "hi": 0.5, "why": "1E-04..1E-12: rapid and uneven as he tries to stabilize for her"},
    ],
    "charcoal": [
        {"from": 14217, "to": 14301, "mode": "glide", "why": "1E-18: Charcoal glides; his one deep banking downstroke "
                                                            "(14263) is the EDL's banking_wingbeat cue"},
    ],
}
# explicit beats outside the sky set (riding grounds): EDL cue frames
GROUND_BEATS = {
    "charcoal": [(8340, "launch_downbeat"), (8522, "charcoal_beats")],   # launch, then a second beat higher up
}
SKY_FROM_SHOT = "1C-07"     # first shot of the SKY_OFF_VERDOR set

# ------------------------------------------------------------------ EDL sound cues -> sounds
# cue name -> how it is realized. 'bed': realized by the ambience layers above; 'beats': by the
# wingbeat engine (the cue frame becomes a downstroke). Otherwise: gen (sfx_lib function or a
# builder-local name), args, gain (dB re cue ref), pan, space send (dB), stem.
BED_CUES = {"waves_rock", "sea_wash", "wind_low", "room_tone_chamber", "lamp_hiss", "birds_morning",
            "wind_altitude", "sea_far"}
BEAT_CUES = {"leaf_beats", "leaf_beats_uneven", "charcoal_beats"}
CUES = {
    "seabird": dict(gen="seabird", gain=-15.0, pan=-0.8, send=("sea", -12.0)),
    "rigging_creak": dict(gen="rigging_creak", args=dict(dur=2.8, n_creaks=3), gain=-17.0, pan=(-0.6, 0.0), send=("sea", -14.0)),
    "hull_slap": dict(gen="hull_slap", gain=-16.0, pan=-0.3, send=("sea", -16.0)),
    "rope_creak": dict(gen="rope_creak", args=dict(pulls=(0.0, 0.5)), gain=-12.0, pan=0.05, send=("sea", -18.0)),
    "low_sound_fog": dict(gen="low_sound_fog", gain=-8.0, pan=0.5, send=("far", -8.0)),
    "pressure_swell": dict(gen="pressure_swell", gain=-11.0, pan=0.3, sync="start"),
    "distant_wingbeat": dict(gen="distant_wingbeat", gain=-12.0, pan=(0.5, -0.5), send=("far", -6.0)),
    "grass_rush": dict(gen="grass_rush", gain=-13.0, pan=None),
    "heavy_wingbeat": dict(gen="heavy_wingbeat", args=dict(dist=1.5), gain=-9.0, pan=0.0),
    "egg_scratch": dict(gen="egg_scratch", args=dict(dur=0.6), gain=-15.0, pan=0.0, send=("chamber", -10.0)),
    "shell_tick": dict(gen="shell_crack", args=dict(count=9, span=0.9, accel=0.8), gain=-15.0, pan=0.0, send=("chamber", -10.0)),
    "shell_fragment": dict(gen="shell_fragment", args=dict(kind="shift"), gain=-17.0, pan=0.0, send=("chamber", -10.0)),
    "hatchling_effort": dict(gen="hatchling_effort", gain=-19.0, pan=0.0, send=("chamber", -10.0)),
    "shell_creak": dict(gen="shell_creak", args=dict(kind="pressure"), gain=-15.0, pan=0.0, send=("chamber", -10.0)),
    "hatchling_breath": dict(gen="hatchling_breath", args=dict(kind="small"), gain=-21.0, pan=0.0, send=("chamber", -10.0)),
    "shell_break": dict(gen="shell_break", gain=-11.0, pan=0.0, send=("chamber", -10.0)),
    "bedding_rustle": dict(gen="bedding_rustle", gain=-19.0, pan=0.0, send=("chamber", -10.0)),
    "door_latch": dict(gen="door", args=dict(kind="open"), gain=-14.0, pan=-0.6, send=("chamber", -7.0)),
    "door_close": dict(gen="door", args=dict(kind="close"), gain=-14.0, pan=-0.6, send=("chamber", -7.0)),
    "footsteps_stone": dict(gen="footsteps", gain=-17.0, pan=-0.4, send=("chamber", -8.0)),
    "cloth": dict(gen="cloth", args=dict(dur=0.9, kind="gown"), gain=-20.0, pan=0.3, send=("chamber", -12.0)),
    "knee_stone": dict(gen="knee_stone", gain=-17.0, pan=-0.4, send=("chamber", -9.0)),
    "charcoal_exhale": dict(gen="charcoal_exhale", gain=-9.0, pan=0.35, send=("grounds", -18.0)),
    "strap_leather": dict(gen="strap_leather", gain=-18.0, pan=0.4, send=("grounds", -18.0)),
    "leaf_breath": dict(gen="leaf_breath", args=dict(kind="quick"), gain=-16.0, pan=-0.35, send=("grounds", -18.0)),
    "gate_noise": dict(gen="gate_noise", gain=-17.0, pan=-0.85, send=("grounds", -10.0)),
    "saddle_creak": dict(gen="saddle_creak", gain=-16.0, pan=-0.3, send=("grounds", -18.0)),
    "rig_creak": dict(gen="rig_climb", args=dict(steps=4, span=4.4), gain=-17.0, pan=0.4, send=("grounds", -16.0)),
    "leaf_claws_turf": dict(gen="claws_turf", gain=-13.0, pan=-0.4, send=("grounds", -18.0)),
    "wing_unfold_leaf": dict(gen="wing_unfold", args=dict(size="leaf"), gain=-11.0, pan=-0.4, send=("grounds", -18.0)),
    "grass_hiss": dict(gen="grass_hiss", gain=-9.0, pan=None),
    "sub_shift": dict(gen="sub_layer", args=dict(dur=11.6, rise=2.5), gain=-9.0, pan=None),
    "wing_unfold_charcoal": dict(gen="wing_unfold", args=dict(size="charcoal"), gain=-5.0, pan=None),
    "launch_downbeat": dict(gen="launch_downbeat", gain=2.0, pan=None),
    "turf_tear": dict(gen="turf_tear", gain=-4.0, pan=None),
    "stones_clatter": dict(gen="stones_clatter", gain=-6.0, pan=None),
    "rolling_wind_dust": dict(gen="rolling_dust", gain=-3.0, pan=None, sync="start"),
    "debris_settle": dict(gen="debris_settle", gain=-11.0, pan=None),
    "leather_creak_wind": dict(gen="leather_creak", args=dict(dur=0.6, size=1.2), gain=-16.0, pan=0.0),
    "jaws_snap": dict(gen="jaws_snap", gain=-10.0, pan=0.1),
    "charcoal_low_breath": dict(gen="charcoal_low_breath", gain=-10.0, pan=0.4),
    "leaf_squeak_muffled": dict(gen="leaf_squeak_muffled", gain=-11.0, pan=0.1),
    "wet_release": dict(gen="wet_release", gain=-17.0, pan=0.0),
    "scout_pass": dict(gen="scout_pass", gain=3.0, pan=None),
    "equipment_jolt": dict(gen="equipment_jolt", gain=-6.0, pan=0.2),
    "scout_wing_distant": dict(gen="scout_flutter", args=dict(dur=2.6), gain=-15.0, pan=(0.85, 0.6)),
    "banking_wingbeat": dict(gen="banking_wingbeat", gain=-2.0, pan=None),
    # non-verbal voice (DX stem): stand-ins for a recording by Daxtyn (sfx_library 'source')
    "abby_breath_hold": dict(gen="abby_breath_hold", gain=-14.0, pan=-0.25, stem="DX", send=("chamber", -14.0)),
    "abby_cry": dict(gen="abby_cry", gain=-3.0, pan=0.0, stem="DX"),
    "abby_ragged_breath": dict(gen="abby_ragged_breath", gain=-9.0, pan=-0.2, stem="DX"),
}
# per-instance overrides: (shot, cue) -> dict merged over CUES[cue]
CUE_OVERRIDES = {
    ("P-03", "hull_slap"): dict(gain=-20.0, pan=-0.35),        # bow wave, vessel mid-frame at distance
    ("P-04", "hull_slap"): dict(gain=-14.0, pan=0.15),         # close on the hand, water against the hull
    ("P-06", "pressure_swell"): dict(gain=-12.0, pan=0.4),
    ("1C-04", "pressure_swell"): dict(gain=-6.0, pan=0.0, args=dict(dur=3.2, peak=0.95)),
    ("1A-01", "egg_scratch"): dict(args=dict(dur=0.4, size=0.6), gain=-20.0),        # smaller than the title's
    ("1A-04", "shell_tick"): dict(args=dict(count=1, span=0.0, knock=False), gain=-21.0),  # under the dialogue
    ("1A-08", "shell_fragment"): dict(args=dict(kind="drop"), gain=-15.0, sync="gen"),
    ("1A-17", "shell_fragment"): dict(args=dict(kind="scrape"), gain=-16.0),
    ("1A-09", "shell_creak"): dict(args=dict(kind="wet"), gain=-17.0),
    ("1A-09", "hatchling_breath"): dict(args=dict(kind="effort"), gain=-20.0),
    ("1A-10", "hatchling_breath"): dict(args=dict(kind="tiny"), gain=-24.0),
    ("1A-12", "hatchling_breath"): dict(args=dict(kind="laboured", count=7, interval=0.65), gain=-20.0),
    ("1A-22", "hatchling_breath"): dict(args=dict(kind="small"), gain=-22.0),
    ("1A-26", "hatchling_breath"): dict(args=dict(kind="small"), gain=-19.0),          # its side rises: relief
    ("1A-33", "hatchling_breath"): dict(args=dict(kind="calm", count=4, interval=1.05), gain=-23.0),
    ("1A-34", "hatchling_breath"): dict(args=dict(kind="tiny"), gain=-20.0),           # carries over the match cut
    ("1A-03", "footsteps_stone"): dict(args=dict(times=[0.0, 0.62, 1.24], weights=[0.7, 0.7, 0.65], soft=0.6), pan=(-0.6, -0.35)),
    ("1A-20", "footsteps_stone"): dict(args=dict(times=[0.0, 0.3, 0.95, 1.65, 2.35], weights=[1.0, 1.0, 0.55, 0.5, 0.45], soft=0.2), pan=(-0.5, -0.2)),
    ("1A-31", "footsteps_stone"): dict(args=dict(times=[0.2, 0.75, 1.3, 1.9, 2.5, 3.1, 3.7, 4.3, 4.9, 5.5, 6.1, 6.7],
                                                 weights=[0.8, 1.0] * 6, soft=0.3), gain=-23.0, pan=(-0.2, -0.55)),
    ("1A-32", "footsteps_stone"): dict(args=dict(times=[0.0, 0.6, 1.2, 1.75], weights=[0.8, 0.7, 0.55, 0.45], soft=0.3), gain=-22.0, pan=(-0.55, -0.7),
                                       send=("chamber", -4.0)),
    ("1A-03", "cloth"): dict(pan=-0.45),                                               # the attendant begins to bow
    ("1A-05", "cloth"): dict(args=dict(dur=1.1, kind="gown"), pan=0.4),               # fabric settling (Alexandria sits)
    ("1A-14", "cloth"): dict(pan=0.4),
    ("1A-17", "cloth"): dict(args=dict(dur=0.9, kind="linen"), pan=0.25),
    ("1A-30", "cloth"): dict(pan=-0.3),
    ("1B-02", "charcoal_exhale"): dict(args=dict(dur=3.2, swell_in=0.9), gain=-12.0, pan=0.45),
    ("1B-03", "charcoal_exhale"): dict(args=dict(dur=2.8, strength=1.6, swell_in=0.4), gain=-8.0, pan=0.4),
    ("1B-03", "strap_leather"): dict(args=dict(kind="buckle"), pan=-0.3),
    ("1B-05", "strap_leather"): dict(args=dict(kind="buckle"), pan=-0.3),
    ("1B-06", "strap_leather"): dict(gain=-23.0, pan=0.35),                            # Remi's buckle under the lines
    ("1B-07", "strap_leather"): dict(gain=-15.0, pan=0.0),
    ("1B-10", "leaf_breath"): dict(gain=-18.0, pan=-0.35),
    ("1B-13", "leaf_breath"): dict(gain=-15.0, pan=-0.35),
    ("1E-12", "charcoal_low_breath"): dict(gain=-9.0, pan=0.4),
    ("1E-17", "charcoal_low_breath"): dict(gain=-15.0, pan=0.3),                       # very low
}
# The first rig_creak cue (1B-11 @ 7320) is the climb; the second (@ 7423) is the clips.
RIG_CLIMB_FRAME = 7320
# special (cue frame -> name) for cues whose frame matters for the pairing above
CUE_BY_FRAME = {
    ("1A-05", 3156): dict(args=dict(dur=1.4, kind="breath"), gain=-25.0, pan=0.4),   # 'breathing' (Alexandria)
    ("1A-14", 4034): dict(args=dict(dur=1.6, kind="breath"), gain=-23.0, pan=0.4),   # her slow breath out
    ("1B-13", 7644): dict(args=dict(kind="chirr"), gain=-13.0, pan=-0.35),           # the small chirr
}
# sounds the EDL implies (beats, actions) but does not list as cues; each names its source
EXTRA_CUES = [
    dict(frame=512, shot="P-03", gen="sail_fill", gain=-16.0, pan=-0.25, send=("sea", -14.0),
         why="beat 512 'The square sail fills' (P-03 sound: rigging creak as the vessel crosses)"),
    dict(frame=4550, shot="1A-20", gen="footsteps", args=dict(times=[0.0, 0.62, 1.24], weights=[1.15, 1.1, 1.0], soft=0.1),
         gain=-19.0, pan=-0.45, send=("chamber", -8.0), why="beat 4550 'Remi follows' (two quick footsteps, then careful ones)"),
    dict(frame=7928, shot="1C-01", gen="grass_hiss", args=dict(dur=0.8, strength=0.8), gain=-14.0, pan=None,
         why="Leaf's second downbeat still shakes the grass as he climbs (beats 7913-7944)"),
    dict(frame=7943, shot="1C-01", gen="grass_hiss", args=dict(dur=0.7, strength=0.6), gain=-19.0, pan=None,
         why="third downbeat, higher: the grass settles"),
    dict(frame=7800, shot="1B-15", gen="grass_hiss", args=dict(dur=1.4, strength=0.5), gain=-22.0, pan=-0.3,
         why="beat 7800 'Wings unfold': the unfolding wings stir the grass"),
    dict(frame=12149, shot="1D-19", gen="jaw_open", gain=-12.0, pan=0.3,
         why="beat 12149 'Charcoal opens his jaws' (careful, non-gory: hinge creak and drawn air, no teeth)"),
    dict(frame=12169, shot="1D-19", gen="mouth_close_soft", gain=-17.0, pan=0.2,
         why="beat 12169 'Leaf's whole head is inside': a soft closed-cavity thump only"),
    dict(frame=13126, shot="1E-03", gen="scout_whistle", gain=-20.0, pan=0.8, sync="gen",
         why="1E-02 'maybe a faint rising whistle' from 13079 (shape at the far right edge) up to the pass"),
    dict(frame=12399, shot="1D-22", gen="leaf_breath", args=dict(kind="quick"), gain=-15.0, pan=-0.4,
         why="beat 12399 'Leaf jerks his head back': a startled chuff (uninjured)"),
]
# Sync: a sound lands its own sync point (sfx_lib generators return it: a crack, a footfall, a
# landing, a peak) on the cue frame, unless the spec says sync="start".
