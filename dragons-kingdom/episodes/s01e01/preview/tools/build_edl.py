#!/usr/bin/env python3
"""build_edl.py - edit decision list for the S01E01 work-in-progress preview (24 fps, 3840x2160).

Coverage: the ORIGINAL screenplay from the PROLOGUE through scene 1E (shotlist.json scenes
PROLOGUE, TITLE, 1A, 1B, 1C, 1D, 1E; dialogue L001..L078, ending on Remi's "Attack." and
"Charcoal banks."), with a 3 s WORK IN PROGRESS card before it and a 4 s end card after it.
Nothing from screenplay-extended.md is used.

Reads (never modifies):
  ../../shotlist.json  ../../dialogue.json  ../../onscreen-text.json  ../../screenplay.md
  ../vo/takes.json  ../vo/words.json      (real durations of the temporary voice takes)
  edl_shots.py                              (the authored staging / camera / sound decisions)
Writes:
  ../edl.json   machine-readable EDL (every frame number, line in-point, cue, caption)
  ../edl.md     the same for people
Then run check_edl.py (validation) and render_plan.py (render-plan.md).

Frame convention: global frame 0 = first frame of the WORK IN PROGRESS card. start_frame is
inclusive, end_frame exclusive (end_frame of a shot = start_frame of the next one).
Audio: 48 kHz, one frame = 2000 samples; every take's sample 0 sits exactly on a frame boundary.

Timing rules (why each shot is as long as it is):
  * A shot is held at shotlist.json est_seconds (the animatic estimate) unless the real takes,
    the cue gaps and the required holds need more, or edl_shots.py says otherwise. The real takes
    are ~16 % shorter than the dialogue.json estimates; shots are held, never squeezed, and the
    spare time goes to the action and reaction after the lines, not into longer pauses between them.
  * Cue gaps are authored per line in edl_shots.py: ~0.3 s quick exchanges, ~0.35-0.4 s normal,
    ~0.45-0.5 s between airborne speakers (wind between the lines), 0.15-0.25 s where a line cuts in.
  * The prologue's place-name shots (P-10..P-15) are cut to the narrator's words (captions appear
    as each name is spoken). The narrator take L003 is split in its existing sentence pauses to
    give each landscape ~2 s, plus ONE word-boundary splice inside "The Citadel Sea | and the Proxy
    Sea." (CITADEL_SPLICE, measured silent by tools/splice.py): the temporary narrator says both seas
    in one breath, so a short breath is opened there and the dissolve to the Proxy Sea sits in it.
    That breath is paid for by trimming the stretched pauses between Tara, Scrapper and Verdor, so
    the place-name block keeps its length and nothing after P-14 moves.

Deterministic: same inputs -> byte-identical outputs (no clocks, no randomness).
"""
import hashlib
import importlib.util
import json
import math
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
PREVIEW = HERE.parent
EP = PREVIEW.parent
REPO = EP.parents[2]
FPS = 24
SR = 48000
SPF = SR // FPS          # 2000 samples per frame
SCENES = ['PROLOGUE', 'TITLE', '1A', '1B', '1C', '1D', '1E']

WIP_TEXT = 'WORK IN PROGRESS - Episode 1 preview - provisional designs, temporary voices'

# The one in-sentence cut. The temporary narrator says "The Citadel Sea and the Proxy Sea." in one
# breath, which left the CITADEL SEA caption (T04) only 1.0 s. The take is near-silent for ~15 ms
# between "Sea" and "and"; it is cut there and a short breath is opened. Measured with
#   python3 -I tools/splice.py vo/L003.wav 5.37 5.59
# (search range: from 0.1 s before the aligned end of "sea" to 0.15 s before "proxy"). Pinned to the
# take's sha256: if make_vo.py ever produces a different L003, the build stops and asks for a re-measure.
CITADEL_SPLICE = {
    'take': 'L003', 'take_sha256': '2c701d54c490b81132d33ff13731c5ccaea1c55c99c67f984ca02aaa5ff28109',
    'sample': 265560, 'level_dbfs_5ms_rms': -64.62, 'peak_dbfs_5ms': -56.08,
    'prev_speech_end_s': 5.519, 'next_speech_on_s': 5.537, 'search_s': [5.37, 5.59],
    'text_before': 'The Citadel Sea', 'text_after': 'and the Proxy Sea.',
    'measured_by': 'tools/splice.py (min 5 ms RMS at 1 ms hops; speech edges at -40 dBFS)',
}
# Place-name timing (seconds unless _F = frames). The breath after "The Citadel Sea" is paid for by
# trimming the stretched pauses next to it, so the place-name block (P-10..P-14) keeps its length and
# nothing from P-15 on moves: NAME_SPACING 2.25 s (54 f) -> 49 f, i.e. 5 frames from each pause between
# Tara, Scrapper and Verdor, and SEVEN_AFTER_PROXY 2.2 -> 2.05 s ("Proxy Sea." to "Seven kingdoms").
# Result: every place caption holds 37-38 frames (1.54-1.58 s; it was 1.0 s for CITADEL SEA).
NAME_LEAD, NAME_SPACING, CUT_BEFORE_NAME = 0.5, 49 / FPS, 0.4
CITADEL_PAUSE_F = 18        # silence opened at the splice (at least this; the frame grid adds < 1 frame)
AND_CUT_LEAD = 0.15         # cut to the Proxy Sea this long before "and": its 6-frame dissolve ends before the word
SEVEN_AFTER_PROXY, CUT_BEFORE_SEVEN = 2.05, 0.35
WIP_FRAMES = 3 * FPS
END_FRAMES = 4 * FPS
END_LINES = [
    'WORK IN PROGRESS - not the finished episode',
    'Temporary in this preview:',
    '- computer voices (not the real cast)',
    '- provisional dragon and character designs (not approved yet)',
    '- unfinished faces: no lip-sync yet, so people are filmed from behind, wide or in silhouette',
    '- sketch music and synthesized sound effects',
    '- stand-in props and effects',
    'Episode 1 continues after this scene.',
]

# ------------------------------------------------------------------ sound library
# id: (what it is, how it is made, stem)
SFX = {
    'waves_rock': ('waves folding against a rocky shore', 'procedural (noise with wave-cycle envelopes, foam hiss) - to build', 'BG'),
    'seabird': ('a single seabird call', 'foley or a checked CC0 file - to source (audio-plan.md: a synthetic gull is risky)', 'FX'),
    'sea_wash': ('open-water wash / swell', 'procedural - to build', 'BG'),
    'rigging_creak': ('rigging and hull creak', 'procedural creak + foley (rope, wood) - to build', 'FOLEY'),
    'rope_creak': ('rope creak under a hand', 'foley - to record', 'FOLEY'),
    'hull_slap': ('water slap on a hull', 'procedural - to build', 'FX'),
    'low_sound_fog': ('a low, unidentifiable sound above the fog (not a roar)', 'procedural (sub swell + filtered air) - to build', 'FX'),
    'pressure_swell': ('air pressure swell', 'procedural - to build', 'FX'),
    'distant_wingbeat': ('a distant deep wingbeat, felt more than heard', 'prototype charcoal_wingbeats_immense.wav, one beat, low-passed, -18 dB', 'FX'),
    'wind_low': ('low wind / wind in trees / distant wind', 'procedural - to build', 'BG'),
    'grass_rush': ('grass rush as the shadow passes', 'procedural - to build', 'FX'),
    'heavy_wingbeat': ('one heavy wingbeat under the music', 'prototype charcoal_wingbeats_immense.wav, one beat', 'FX'),
    'room_tone_chamber': ('small warm stone room, faint wind beyond the high opening', 'procedural - to build', 'BG'),
    'lamp_hiss': ('oil-lamp flame hiss', 'procedural - to build', 'BG'),
    'egg_scratch': ('scratch from inside the egg', 'prototype egg_scratch_then_crack.wav, scratch section (0.3-1.9 s)', 'FX'),
    'shell_tick': ('tiny shell tick / fine crack', 'prototype egg_scratch_then_crack.wav, first crack (2.45 s)', 'FX'),
    'shell_creak': ('shell under pressure, wet scrape', 'procedural (shell resonances, as the egg prototype) - to build', 'FX'),
    'shell_fragment': ('shell fragment shifts / clicks onto bedding', 'prototype egg_scratch_then_crack.wav, fragments', 'FX'),
    'shell_break': ('shell breaking away', 'prototype egg_scratch_then_crack.wav, break (3.65-4.3 s)', 'FX'),
    'hatchling_effort': ('faint effortful hatchling sound (not cute, not monstrous)', 'procedural creature vocal (voices.json creature_vocals) - to build', 'FX'),
    'hatchling_breath': ('small hatchling breath', 'prototype egg_scratch_then_crack.wav breath (~4.8 s) or procedural', 'FX'),
    'door_latch': ('door latch / door opening', 'foley - to record', 'FOLEY'),
    'door_close': ('door closing', 'foley - to record', 'FOLEY'),
    'footsteps_stone': ('footsteps on stone', 'foley - to record', 'FOLEY'),
    'cloth': ('gown / cloth / breath movement', 'foley - to record', 'FOLEY'),
    'knee_stone': ('knee on stone', 'foley - to record', 'FOLEY'),
    'bedding_rustle': ('linen and straw bedding rustle', 'foley - to record', 'FOLEY'),
    'abby_breath_hold': ('Abby catches and holds her breath', 'non-verbal voice: synthetic breath from make_vo.py\'s breath generator, or Daxtyn records it', 'DX'),
    'charcoal_exhale': ('Charcoal\'s huge slow exhale', 'prototype charcoal_breath_low_growl.wav, breath only (no growl)', 'FX'),
    'strap_leather': ('strap leather, buckle', 'foley - to record', 'FOLEY'),
    'birds_morning': ('morning birds over the field', 'foley or a checked CC0 file - to source', 'BG'),
    'leaf_breath': ('Leaf\'s quick breaths / small chirr', 'creature vocal: mouth sounds pitched -3..-5 st, or synthesis 120-300 Hz - to build', 'FX'),
    'gate_noise': ('an off-screen gate or bird noise', 'foley - to record', 'FX'),
    'saddle_creak': ('saddle creak', 'foley - to record', 'FOLEY'),
    'rig_creak': ('wooden rig creak, harness clips', 'foley - to record', 'FOLEY'),
    'leaf_claws_turf': ('claws on turf', 'foley + procedural - to build', 'FOLEY'),
    'wing_unfold_leaf': ('Leaf\'s wings unfolding (leathery)', 'foley (sheet, leather) + procedural - to build', 'FX'),
    'leaf_beats': ('Leaf\'s quick, corrective wingbeats', 'prototype leaf_wingbeats_quick_corrective.wav, re-timed to the animation (1.6 Hz)', 'FX'),
    'leaf_beats_uneven': ('Leaf\'s rapid, uneven wingbeats after the pass', 'variant of the Leaf prototype - to build', 'FX'),
    'grass_hiss': ('grass hiss under a downbeat', 'procedural - to build', 'FX'),
    'sub_shift': ('the sound drops into a lower register', 'procedural sub layer - to build', 'FX'),
    'wing_unfold_charcoal': ('Charcoal\'s wing membrane unfolding (huge)', 'procedural + foley - to build', 'FX'),
    'charcoal_beats': ('Charcoal\'s immense, infrequent wingbeats', 'prototype charcoal_wingbeats_immense.wav, re-timed to the animation (0.76 Hz)', 'FX'),
    'launch_downbeat': ('massive launch downbeat', 'prototype charcoal_wingbeats_immense.wav, one beat + sub', 'FX'),
    'turf_tear': ('turf tearing', 'procedural tearing grains + foley (ripped grass) - to build', 'FX'),
    'stones_clatter': ('stones clattering', 'procedural granular impacts + foley (gravel) - to build', 'FX'),
    'rolling_wind_dust': ('rolling wind and dust swell', 'procedural - to build', 'FX'),
    'debris_settle': ('debris settling', 'procedural + foley - to build', 'FX'),
    'wind_altitude': ('high-altitude wind bed', 'prototype wind_bed_high_altitude_loop.wav (loopable)', 'BG'),
    'sea_far': ('the sea far below', 'procedural - to build', 'BG'),
    'leather_creak_wind': ('leather creak under the wind', 'foley - to record', 'FOLEY'),
    'jaws_snap': ('small snap of jaws', 'foley + procedural - to build', 'FX'),
    'charcoal_low_breath': ('Charcoal\'s low breath, no roar', 'prototype charcoal_breath_low_growl.wav, breath only', 'FX'),
    'leaf_squeak_muffled': ('a muffled squeak from Leaf', 'creature vocal - to build', 'FX'),
    'wet_release': ('wet release', 'foley - to record', 'FOLEY'),
    'scout_pass': ('the scout\'s sharp rushing crack and violent wake (enters right, passes on the far side)', 'prototype scout_pass_sharp_crack.wav', 'FX'),
    'abby_cry': ('Abby\'s startled breath and cry', 'non-verbal voice: make_vo.py pain gasp as a stand-in (TTS cannot cry out), or Daxtyn records it', 'DX'),
    'abby_ragged_breath': ('Abby\'s ragged breath', 'non-verbal voice: make_vo.py breath generator, or Daxtyn records it', 'DX'),
    'equipment_jolt': ('equipment jolting under load', 'foley - to record', 'FOLEY'),
    'scout_wing_distant': ('the scout\'s distant sharp wing noise', 'procedural (scout flutter, 2.6 Hz) - to build', 'FX'),
    'banking_wingbeat': ('one deep banking wingbeat', 'prototype charcoal_wingbeats_immense.wav, one beat', 'FX'),
}

# ------------------------------------------------------------------ helpers


def sha256(p):
    return hashlib.sha256(Path(p).read_bytes()).hexdigest()


def rel(p):
    return str(Path(p).resolve().relative_to(REPO))


def tc(frame):
    s, f = divmod(frame, FPS)
    m, s = divmod(s, 60)
    h, m = divmod(m, 60)
    return f'{h:02d}:{m:02d}:{s:02d}:{f:02d}'


def ceil_f(t):
    """seconds -> the first frame at or after t (robust to float noise)."""
    return int(math.ceil(t * FPS - 1e-6))


def floor_f(t):
    return int(math.floor(t * FPS + 1e-6))


def round_f(t):
    return int(math.floor(t * FPS + 0.5))


def load_shots_module():
    spec = importlib.util.spec_from_file_location('edl_shots', HERE / 'edl_shots.py')
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


class Take:
    def __init__(self, rec, words):
        self.id = rec['id']
        self.rec = rec
        self.samples = rec['samples']
        self.dur = rec['samples'] / SR
        self.segs = rec['segments']
        self.breath = rec.get('breath_s') or 0.0
        self.audible_off = max(0.0, self.segs[0]['start_s'] - self.breath)
        self.speech_in_off = self.segs[0]['start_s']
        self.speech_out_off = self.segs[-1]['end_s']
        self.words = words


# ------------------------------------------------------------------ build


def main():
    shotlist = json.loads((EP / 'shotlist.json').read_text())
    dialogue = json.loads((EP / 'dialogue.json').read_text())
    onscreen = json.loads((EP / 'onscreen-text.json').read_text())
    takes_doc = json.loads((PREVIEW / 'vo' / 'takes.json').read_text())
    words_doc = json.loads((PREVIEW / 'vo' / 'words.json').read_text())
    mod = load_shots_module()

    dl = {l['id']: l for l in dialogue['lines']}
    takes = {r['id']: Take(r, words_doc['lines'].get(r['id'], {}).get('words', [])) for r in takes_doc['takes']}
    sl_shots = [s for s in shotlist['shots'] if s['scene'] in SCENES]
    authored = {s['id']: s for s in mod.S}
    problems = []
    if [s['id'] for s in sl_shots] != [s['id'] for s in mod.S]:
        sys.exit('edl_shots.py must list exactly the shotlist.json shots PROLOGUE..1E in order')

    # ---------------------------------------------------------- per-shot timing (shot-relative)
    # placements[shot_id] = list of dicts (line placements, times in seconds relative to shot start)
    dur_f = {}
    placements = {}
    parts_plan = {}       # L003 split
    caption_words = {}    # caption id -> (shot id, onset seconds rel to shot)

    def place_lines(sh, a):
        """Place this shot's lines; returns (list, needed seconds)."""
        out = []
        t_prev_out = None
        for spec in a.get('lines', []):
            lid = spec[0]
            tk = takes[lid]
            if len(spec) == 3 and spec[1] == 'end':
                continue                 # placed after the duration is known
            gap = spec[1]
            A = gap if t_prev_out is None else t_prev_out + gap
            ts = ceil_f(A - tk.audible_off)          # take start, frames rel to shot
            p = {'id': lid, 'take_start_rel_f': ts, 'rule': 'lead' if t_prev_out is None else 'cue gap',
                 'authored_s': gap}
            t_prev_out = ts / FPS + tk.speech_out_off
            out.append(p)
        return out, t_prev_out

    # ----- prologue words-driven block (P-08 .. P-15)
    L2, L3 = takes['L002'], takes['L003']
    w3 = L3.words

    def word_on(take, idx, words):
        w = words[idx]
        return max(w['start_s'], take.segs[0]['start_s']) if idx == 0 else w['start_s']

    def find_word(words, text, nth=1):
        k = 0
        for i, w in enumerate(words):
            if w['w'] == text:
                k += 1
                if k == nth:
                    return i
        raise KeyError(text)

    # L003 parts: split in the middle of the existing pauses between its sentences, plus the one
    # measured word-boundary splice inside "The Citadel Sea | and the Proxy Sea." (CITADEL_SPLICE)
    segs3 = L3.segs
    sp = CITADEL_SPLICE
    if L3.rec['sha256'] != sp['take_sha256']:
        sys.exit('vo/L003.wav is not the take CITADEL_SPLICE was measured on: re-run '
                 'python3 -I tools/splice.py vo/L003.wav <from> <to> and update CITADEL_SPLICE in build_edl.py')
    sp_s = sp['sample'] / SR
    if len(segs3) != 5 or not (segs3[3]['start_s'] < sp['prev_speech_end_s'] < sp_s < sp['next_speech_on_s'] < segs3[3]['end_s']) \
            or f"{sp['text_before']} {sp['text_after']}" != segs3[3]['text']:
        sys.exit('CITADEL_SPLICE does not fit the L003 sentence segments in takes.json')
    cuts3 = [0.0] + [(segs3[i]['end_s'] + segs3[i + 1]['start_s']) / 2 for i in range(len(segs3) - 1)] + [L3.dur]
    cuts3.insert(4, sp_s)
    part_win = [(cuts3[i], cuts3[i + 1]) for i in range(6)]                       # take-time windows
    part_text = [segs3[0]['text'], segs3[1]['text'], segs3[2]['text'], sp['text_before'], sp['text_after'], segs3[4]['text']]
    part_onset_off = [segs3[0]['start_s'], segs3[1]['start_s'], segs3[2]['start_s'], segs3[3]['start_s'],
                      sp['next_speech_on_s'], segs3[4]['start_s']]                 # speech onset in take time
    part_cut = ['take start', 'sentence pause', 'sentence pause', 'sentence pause', 'word-boundary splice', 'sentence pause']
    # onsets of the parts relative to the start of P-10 (seconds), snapped through frame placement
    part_start_f = []
    for i in range(4):
        part_start_f.append(ceil_f(NAME_LEAD + i * NAME_SPACING - (part_onset_off[i] - part_win[i][0])))
    onset = [part_start_f[i] / FPS + (part_onset_off[i] - part_win[i][0]) for i in range(4)]
    # "and the Proxy Sea." follows the opened breath
    end_4a = part_start_f[3] / FPS + (part_win[3][1] - part_win[3][0])
    part_start_f.append(ceil_f(end_4a + CITADEL_PAUSE_F / FPS))
    inserted_silence = part_start_f[4] / FPS - end_4a
    onset.append(part_start_f[4] / FPS + (part_onset_off[4] - part_win[4][0]))      # "and"
    proxy_idx = find_word(w3, 'proxy')
    citadel_idx = find_word(w3, 'citadel')
    if not (w3[citadel_idx]['start_s'] < sp_s < w3[proxy_idx]['start_s']):
        sys.exit('CITADEL_SPLICE must lie between "Citadel" and "Proxy" in words.json')
    proxy_on = part_start_f[4] / FPS + (w3[proxy_idx]['start_s'] - part_win[4][0])
    citadel_on = part_start_f[3] / FPS + (w3[citadel_idx]['start_s'] - part_win[3][0])
    part_start_f.append(ceil_f(proxy_on + SEVEN_AFTER_PROXY - (part_onset_off[5] - part_win[5][0])))
    onset.append(part_start_f[5] / FPS + (part_onset_off[5] - part_win[5][0]))
    cut10 = [round_f(onset[1] - CUT_BEFORE_NAME), round_f(onset[2] - CUT_BEFORE_NAME), round_f(onset[3] - CUT_BEFORE_NAME),
             round_f(onset[4] - AND_CUT_LEAD), round_f(onset[5] - CUT_BEFORE_SEVEN)]
    # the breath at the splice (timeline seconds rel. to P-10): from the end of "Sea" to "and"
    citadel_breath = (part_start_f[3] / FPS + (sp['prev_speech_end_s'] - part_win[3][0]), onset[4])
    # P-10..P-14 durations, P-15 held at its estimate
    p10_order = ['P-10', 'P-11', 'P-12', 'P-13', 'P-14', 'P-15']
    bounds = [0] + cut10
    for i, sid in enumerate(p10_order[:5]):
        dur_f[sid] = bounds[i + 1] - bounds[i]
    est = {s['id']: s['est_seconds'] for s in sl_shots}
    dur_f['P-15'] = round_f(est['P-15'])
    shot_rel_start = {sid: bounds[i] for i, sid in enumerate(p10_order[:5])}
    shot_rel_start['P-15'] = bounds[5]
    parts_plan = {'take': 'L003', 'parts': []}
    for i in range(6):
        # which shot contains this part's start
        sf = part_start_f[i]
        host = max((sid for sid in p10_order if shot_rel_start[sid] <= sf), key=lambda s: shot_rel_start[s])
        parts_plan['parts'].append({'part': i + 1, 'text': part_text[i], 'take_in_s': round(part_win[i][0], 6),
                                    'take_out_s': round(part_win[i][1], 6), 'rel_p10_f': sf, 'host': host,
                                    'cut': part_cut[i]})
    # the dissolve into P-14 must sit inside the opened breath (no picture change on a word)
    p14_half = authored['P-14'].get('trans', ('cut', 0))[1] // 2
    p14_cut = shot_rel_start['P-14'] / FPS
    if not (citadel_breath[0] <= p14_cut - p14_half / FPS and p14_cut + p14_half / FPS <= citadel_breath[1]):
        problems.append('P-14: the dissolve is not inside the breath after "The Citadel Sea"')
    caption_words = {
        'T01': ('P-10', onset[0]), 'T02': ('P-11', onset[1] - shot_rel_start['P-11'] / FPS),
        'T03': ('P-12', onset[2] - shot_rel_start['P-12'] / FPS),
        'T04': ('P-13', citadel_on - shot_rel_start['P-13'] / FPS),
        'T05': ('P-14', proxy_on - shot_rel_start['P-14'] / FPS),
    }
    # the caption for the Citadel Sea starts with "The" (one breath before "Citadel")
    caption_lead_word = {'T04': ('the', onset[3] - shot_rel_start['P-13'] / FPS)}

    # L002 over P-08/P-09: the dissolve sits in the pause after "The kingdoms had borders."
    a08 = authored['P-08']
    lead2 = a08['lines'][0][1]
    ts2 = ceil_f(lead2 - L2.audible_off)
    mid2 = (L2.segs[1]['end_s'] + L2.segs[2]['start_s']) / 2
    dur_f['P-08'] = round_f(ts2 / FPS + mid2)
    placements['P-08'] = [{'id': 'L002', 'take_start_rel_f': ts2, 'rule': 'lead', 'authored_s': lead2,
                           'continues_into': ['P-09']}]

    # ----- every other shot
    for s in sl_shots:
        sid = s['id']
        a = authored[sid]
        if sid in dur_f:
            continue
        pl, last_out = place_lines(s, a)
        need_f = 0
        if last_out is not None:
            need_f = ceil_f(last_out + a.get('min_tail', 0.3))
        d = a.get('dur')
        if d == 'tight':
            df = need_f
        elif d is not None:
            df = round_f(d)
            if df < need_f:
                problems.append(f'{sid}: authored dur {d} s is shorter than its lines need ({need_f / FPS:.2f} s)')
        else:
            df = max(round_f(s['est_seconds']), need_f)
        dur_f[sid] = df
        # lines anchored to the end of the shot
        for spec in a.get('lines', []):
            if len(spec) == 3 and spec[1] == 'end':
                tk = takes[spec[0]]
                ts = floor_f(df / FPS - spec[2] - tk.speech_out_off)
                pl.append({'id': spec[0], 'take_start_rel_f': ts, 'rule': 'end-anchored', 'authored_s': spec[2]})
        placements[sid] = pl
    placements['P-10'] = []

    # ---------------------------------------------------------- global timeline
    events = []
    gstart = {}
    cur = 0
    events.append({'id': 'WIP-OPEN', 'kind': 'card', 'scene': 'CARD', 'start_frame': 0, 'end_frame': WIP_FRAMES})
    cur = WIP_FRAMES
    for s in sl_shots:
        gstart[s['id']] = cur
        cur += dur_f[s['id']]
    events_end_of_shots = cur
    total = cur + END_FRAMES

    def g(sid, rel_f):
        return gstart[sid] + rel_f

    # ---------------------------------------------------------- lines (global)
    lines = {}
    line_host = {}
    for s in sl_shots:
        for p in placements.get(s['id'], []):
            line_host[p['id']] = s['id']
    # L003 hosted in P-10
    line_host['L003'] = 'P-10'

    def line_record(lid, host, take_start_g, rule, authored_s, parts=None, continues=None):
        tk = takes[lid]
        d = dl[lid]
        tr = tk.rec
        rec = {
            'id': lid, 'speaker': d['speaker'], 'text': d['text'], 'original': d['original'],
            'shot': host, 'take': 'vo/' + lid + '.wav', 'take_sha256': tr['sha256'], 'take_samples': tk.samples,
            'take_duration_s': round(tk.dur, 6), 'take_frames': round(tk.samples / SPF, 3),
            'voice': tr['voice']['voice'], 'voice_license': 'Apache-2.0',
        }
        if parts is None:
            rec.update({
                'take_start_frame': take_start_g, 'take_start_tc': tc(take_start_g),
                'take_start_shot_frame': take_start_g - gstart[host],
                'take_end_sample': take_start_g * SPF + tk.samples,
                'audible_in_s': round(take_start_g / FPS + tk.audible_off, 4),
                'speech_in_s': round(take_start_g / FPS + tk.speech_in_off, 4),
                'speech_out_s': round(take_start_g / FPS + tk.speech_out_off, 4),
            })
        else:
            first = parts[0]
            rec.update({
                'take_start_frame': first['timeline_frame'], 'take_start_tc': tc(first['timeline_frame']),
                'take_start_shot_frame': first['timeline_frame'] - gstart[host],
                'take_end_sample': parts[-1]['timeline_frame'] * SPF + round((parts[-1]['take_out_s'] - parts[-1]['take_in_s']) * SR),
                'audible_in_s': round(first['timeline_frame'] / FPS + tk.audible_off - first['take_in_s'], 4),
                'speech_in_s': round(first['timeline_frame'] / FPS + tk.speech_in_off - first['take_in_s'], 4),
                'speech_out_s': round(parts[-1]['timeline_frame'] / FPS + tk.speech_out_off - parts[-1]['take_in_s'], 4),
                'parts': parts,
            })
        rec['speech_in_frame'] = floor_f(rec['speech_in_s'])
        rec['speech_out_frame'] = ceil_f(rec['speech_out_s'])
        rec['placement_rule'] = rule
        rec['authored_s'] = authored_s
        rec['performance'] = tr['performance']['preset']
        rec['mix'] = {'gain_db': tr['mix']['gain_db'], 'space': tr['mix']['space'], 'wind_bed': tr['mix']['wind_bed'],
                      'airborne': tr['airborne']}
        if continues:
            rec['continues_into'] = continues
        sl_entry = next((x for sh in sl_shots for x in sh['dialogue'] if x['id'] == lid), None)
        rec['shotlist_speaker_on_screen'] = bool(sl_entry and sl_entry.get('speaker_on_screen'))
        rec['mouth_visible'] = False
        return rec

    for s in sl_shots:
        sid = s['id']
        for p in placements.get(sid, []):
            lines[p['id']] = line_record(p['id'], sid, g(sid, p['take_start_rel_f']), p['rule'], p['authored_s'],
                                         continues=p.get('continues_into'))
    # L003 parts
    p10g = gstart['P-10']
    l3parts = []
    edit_text = {
        'take start': 'start of the take',
        'sentence pause': 'cut inside the silent pause between sentences (5 ms fades in the mix)',
        'word-boundary splice': (f'cut at the silent word boundary between "Sea" and "and" (sample {sp["sample"]}, '
                                 f'{sp["level_dbfs_5ms_rms"]:.1f} dBFS 5 ms RMS, measured by tools/splice.py); '
                                 f'{inserted_silence:.3f} s of silence opened before it (5 ms fades in the mix)'),
    }
    for pp in parts_plan['parts']:
        l3parts.append({'part': pp['part'], 'text': pp['text'], 'take_in_s': pp['take_in_s'], 'take_out_s': pp['take_out_s'],
                        'take_in_sample': round(pp['take_in_s'] * SR), 'take_out_sample': round(pp['take_out_s'] * SR),
                        'timeline_frame': p10g + pp['rel_p10_f'], 'timeline_tc': tc(p10g + pp['rel_p10_f']), 'shot': pp['host'],
                        'cut': pp['cut'], 'edit': edit_text[pp['cut']]})
    lines['L003'] = line_record('L003', 'P-10', l3parts[0]['timeline_frame'], 'words-driven (prologue captions)',
                                NAME_LEAD, parts=l3parts, continues=['P-11', 'P-12', 'P-13', 'P-14', 'P-15'])
    lines['L003']['note'] = ('Split in its existing sentence pauses so each place name gets its own ~2 s landscape, and once '
                             'at the silent word boundary in "The Citadel Sea | and the Proxy Sea." so the two seas never share '
                             'a view; the words themselves are untouched.')
    breath_g = (p10g / FPS + citadel_breath[0], p10g / FPS + citadel_breath[1])
    lines['L003']['splice'] = {k: sp[k] for k in ('take_sha256', 'sample', 'level_dbfs_5ms_rms', 'peak_dbfs_5ms',
                                                   'prev_speech_end_s', 'next_speech_on_s', 'search_s', 'measured_by')} | {
        'between_parts': [4, 5], 'time_s': round(sp_s, 6),
        'inserted_silence_s': round(inserted_silence, 4), 'inserted_silence_frames': round(inserted_silence * FPS, 3),
        'breath_on_timeline_s': [round(breath_g[0], 4), round(breath_g[1], 4)],
        'breath_s': round(breath_g[1] - breath_g[0], 4),
        'why': ('The temporary narrator says "The Citadel Sea and the Proxy Sea." in one breath, which left the CITADEL SEA '
                'caption 1.0 s. The breath opened here gives it its own hold; the dissolve to the Proxy Sea sits inside it. '
                'It is paid for by trimming the stretched pauses next to it (5 frames from each pause between Tara, Scrapper '
                'and Verdor, 0.15 s before "Seven kingdoms"), so nothing from P-15 on moves. A human narrator would make '
                'this pause naturally.')}

    order = sorted(lines.values(), key=lambda r: r['speech_in_s'])
    prev = None
    for r in order:
        r['gap_from_previous_line_s'] = None if prev is None else round(r['audible_in_s'] - prev['speech_out_s'], 3)
        prev = r

    # anchors for beats/sfx: (shot, token) -> seconds rel to shot start
    def anchor_time(sid, token):
        m = re.match(r'^(end|L\d{3}(?:\.end)?)([+-]\d+(?:\.\d+)?)?$', token)
        if not m:
            raise ValueError(f'{sid}: bad time anchor {token!r}')
        base, off = m.group(1), float(m.group(2) or 0)
        if base == 'end':
            t = dur_f[sid] / FPS
        else:
            lid = base[:4]
            r = lines[lid]
            if lid == 'L003' and not base.endswith('.end'):
                # in the place-name shots 'L003' means the part spoken over that shot
                local = {'P-10': onset[0], 'P-11': onset[1], 'P-12': onset[2], 'P-13': onset[3], 'P-14': onset[4],
                         'P-15': onset[5]}
                t = local[sid] - shot_rel_start[sid] / FPS
            else:
                t = (r['speech_out_s'] if base.endswith('.end') else r['speech_in_s']) - gstart[sid] / FPS
        return t + off

    def to_frame(sid, t, what):
        if isinstance(t, str):
            t = anchor_time(sid, t)
        f = round_f(t)
        if f < -1 or f > dur_f[sid] + 1:
            problems.append(f'{sid}: {what} at {t:.2f} s is outside the shot (0..{dur_f[sid] / FPS:.2f} s)')
        return max(0, min(dur_f[sid] - 1, f))

    # ---------------------------------------------------------- transitions / handles
    trans = {}
    for s in sl_shots:
        t = authored[s['id']].get('trans', ('cut',))
        trans[s['id']] = {'type': t[0], 'frames': t[1] if len(t) > 1 else 0}
    handles = {s['id']: [0, 0] for s in sl_shots}
    for i, s in enumerate(sl_shots):
        tr = trans[s['id']]
        if tr['type'] == 'dissolve':
            if tr['frames'] % 2:
                problems.append(f"{s['id']}: dissolve length must be even")
            handles[s['id']][0] = tr['frames'] // 2
            if i > 0:
                handles[sl_shots[i - 1]['id']][1] = tr['frames'] // 2

    # ---------------------------------------------------------- music + beds
    def gt(sid, token):  # global frame of an anchor
        return gstart[sid] + to_frame(sid, token, 'music anchor')

    M = []
    m1s = gstart['P-15'] + round_f(anchor_time('P-15', 'L003.end+0.6'))
    M.append({'id': 'M1', 'name': 'Main theme, prologue',
              'what': 'One low sustained string tone, then the restrained rising theme (D2+A2 drone; A3-D4-E4-F4 line that stops on F). '
                      'Narrator L004 over it. Resolves and falls away into the egg\'s scratch at the title.',
              'start_frame': m1s, 'end_frame': gstart['T-01'] + round_f(6.3),
              'fade_in_frames': 48, 'fade_out_frames': round_f(1.3),
              'marks': [{'frame': gstart['P-15'] + round_f(anchor_time('P-15', 'L003.end+4.5')), 'what': 'rising theme begins'}],
              'source': 'audio-plan.md music sketch (synthesized strings or MIDI + FluidSynth + FluidR3_GM, MIT) - provisional'})
    M.append({'id': 'M2a', 'name': 'Light flight theme',
              'what': 'Lighter variant of the main theme: private freedom, not a procession.',
              'start_frame': gstart['1C-15'] + FPS, 'end_frame': gstart['1D-03'],
              'fade_in_frames': 48, 'fade_out_frames': round_f(2.5), 'source': 'as M1 (higher, lighter register)'})
    M.append({'id': 'M2b', 'name': 'Light flight theme (returns)',
              'what': 'Returns softly after the silence; stops dead on the head-in-mouth beat (only wingbeats and air).',
              'start_frame': gstart['1D-06'] + round_f(0.5), 'end_frame': gstart['1D-19'],
              'fade_in_frames': 72, 'fade_out_frames': 2, 'source': 'as M2a'})
    M.append({'id': 'M2c', 'name': 'Light flight theme (returns softly)',
              'what': 'Returns softly after the release; fades out across 1E-01 so there is no musical warning before the pass.',
              'start_frame': gstart['1D-25'] + round_f(1.5), 'end_frame': gstart['1E-02'],
              'fade_in_frames': 48, 'fade_out_frames': dur_f['1E-01'], 'source': 'as M2a'})
    M.append({'id': 'M3', 'name': 'Low drone',
              'what': 'A low drone as Remi turns to the scout; under "Attack." and the bank; fades out under the end card. Not a triumphant cue.',
              'start_frame': gstart['1E-17'], 'end_frame': events_end_of_shots + 2 * FPS,
              'fade_in_frames': FPS, 'fade_out_frames': 2 * FPS, 'source': 'synthesized drone (low D) - provisional'})
    no_music = [{'from_frame': gstart['1D-03'], 'to_frame': M[2]['start_frame'],
                 'why': 'No music under the succession question and Abby\'s silence (1D-03..1D-05).'},
                {'from_frame': gstart['1D-19'], 'to_frame': M[3]['start_frame'],
                 'why': 'Music stops for the head-in-mouth beat: only wingbeats and rushing air.'},
                {'from_frame': gstart['1E-02'], 'to_frame': gstart['1E-17'],
                 'why': 'No musical warning before or during the pass.'}]

    beds = [
        {'id': 'BG-SEA', 'what': 'waves on rock, open-water wash (dawn)', 'sfx': ['waves_rock', 'sea_wash'],
         'start_frame': gstart['P-01'], 'end_frame': gstart['P-08'] + 12, 'note': 'ducked 6 dB at P-07 (silence around the sailor)'},
        {'id': 'BG-VISTAS', 'what': 'per-landscape ambience under the dissolves (wind, trees, sea wash)', 'sfx': ['wind_low', 'sea_wash'],
         'start_frame': gstart['P-08'] - 6, 'end_frame': gstart['P-17'], 'note': 'crossfades follow the picture dissolves'},
        {'id': 'BG-MEADOW', 'what': 'meadow wind', 'sfx': ['wind_low'], 'start_frame': gstart['P-17'], 'end_frame': gstart['T-01']},
        {'id': 'BG-CHAMBER', 'what': 'small warm stone room tone, faint wind beyond the high opening, lamp hiss',
         'sfx': ['room_tone_chamber', 'lamp_hiss'], 'start_frame': gstart['T-01'], 'end_frame': gstart['1B-01'],
         'note': 'pulls back to near-silence for the whisper (1A-15) and the held breath (1A-25)'},
        {'id': 'BG-FIELD', 'what': 'riding-grounds morning: light wind, birds', 'sfx': ['birds_morning', 'wind_low'],
         'start_frame': gstart['1B-01'], 'end_frame': gstart['1C-07'], 'note': 'birds stop at 1C-04 +2.0 s'},
        {'id': 'BG-ALTITUDE', 'what': 'high-altitude wind bed; ducked 3 dB under lines, never removed between airborne speakers',
         'sfx': ['wind_altitude'], 'start_frame': gstart['1C-02'] + 12, 'end_frame': events_end_of_shots + FPS,
         'note': 'swells +8 dB for 1 s at the pass (1E-03): the wind overwhelms everything'},
        {'id': 'WB-LEAF', 'what': 'Leaf\'s wingbeats, synced to the animation (1.6 Hz + corrective unevenness; uneven after the pass)',
         'sfx': ['leaf_beats', 'leaf_beats_uneven'], 'start_frame': gstart['1C-01'], 'end_frame': events_end_of_shots,
         'note': 'the flight pose is a pure function of t, so the mix tool computes each downstroke from the same phase formula'},
        {'id': 'WB-CHARCOAL', 'what': 'Charcoal\'s wingbeats, synced to the animation (0.76 Hz: immense, infrequent)',
         'sfx': ['charcoal_beats'], 'start_frame': gstart['1C-05'], 'end_frame': events_end_of_shots,
         'note': 'as WB-LEAF'},
    ]

    # ---------------------------------------------------------- on-screen text
    cards_by_id = {c['id']: c for c in onscreen['cards']}
    texts = []
    texts.append({'id': 'WIP-OPEN', 'kind': 'work_in_progress_card', 'text': WIP_TEXT,
                  'layout_lines': ['WORK IN PROGRESS', 'Episode 1 preview', 'provisional designs, temporary voices'],
                  'start_frame': 0, 'end_frame': WIP_FRAMES, 'fade_in_frames': 6, 'fade_out_frames': 12,
                  'style': 'white on black, centred; Liberation Serif (SIL OFL 1.1) or DejaVu Serif; first row larger',
                  'required': True})
    for cid in ['T01', 'T02', 'T03', 'T04', 'T05']:
        c = cards_by_id[cid]
        sid, on = caption_words[cid]
        if cid in caption_lead_word:
            on_used = caption_lead_word[cid][1]
            sync_word = 'The (Citadel Sea)'
        else:
            on_used = on
            sync_word = c['synced_to_spoken_words']
        i_shot = [x['id'] for x in sl_shots].index(sid)
        nxt = sl_shots[i_shot + 1]['id']
        half_in = trans[sid]['frames'] // 2 if trans[sid]['type'] == 'dissolve' else 0
        half_out = trans[nxt]['frames'] // 2 if trans[nxt]['type'] == 'dissolve' else 0
        word_f = gstart[sid] + floor_f(on)
        fin = max(word_f - 2, gstart[sid] + half_in)
        fout = gstart[nxt] - half_out - 1
        texts.append({'id': cid, 'kind': 'location_caption', 'text': c['text'], 'shot': sid,
                      'synced_to_word': sync_word, 'word_onset_frame': gstart[sid] + floor_f(on),
                      'start_frame': fin, 'end_frame': fout, 'fade_in_frames': 6, 'fade_out_frames': 6,
                      'hold_s': round((fout - fin) / FPS, 3),
                      'style': 'simple small caps, white ~85 %, upper-left third (kept out of the subtitle area); no map, no borders, no arrows',
                      'source': 'onscreen-text.json ' + cid})
    t06 = cards_by_id['T06']
    texts.append({'id': 'T06', 'kind': 'title_card', 'text': t06['text'], 'shot': 'T-01',
                  'start_frame': gstart['T-01'] + FPS, 'end_frame': gstart['T-01'] + FPS + round_f(t06['suggested_hold_seconds']),
                  'fade_in_frames': 24, 'fade_out_frames': 24,
                  'style': 'centred over the dark shell; restrained serif; no glow', 'source': 'onscreen-text.json T06'})
    texts.append({'id': 'WIP-END', 'kind': 'work_in_progress_card', 'text': '\n'.join(END_LINES), 'layout_lines': END_LINES,
                  'start_frame': events_end_of_shots, 'end_frame': total, 'fade_in_frames': 6, 'fade_out_frames': 12,
                  'style': 'white on black, left-aligned list, first row larger', 'required': True})
    texts.append({'id': 'WIP-TAG', 'kind': 'corner_tag', 'text': 'WORK IN PROGRESS',
                  'start_frame': WIP_FRAMES, 'end_frame': events_end_of_shots, 'fade_in_frames': 0, 'fade_out_frames': 0,
                  'style': 'small (~1.2 % of frame height), white at 45 %, top-right title-safe corner; never over a caption',
                  'required': False,
                  'note': 'Recommended so a clip cut out of the middle still says it is not the finished episode. Can be switched off in the conform.'})

    # ---------------------------------------------------------- assemble shot events
    def cam_or_black(a):
        if a.get('cam') is None:
            return {'lens_mm': None, 'move': 'none (black frame, no render)', 'framing': 'black'}
        return a['cam']

    shot_events = []
    for i, s in enumerate(sl_shots):
        sid = s['id']
        a = authored[sid]
        st = gstart[sid]
        df = dur_f[sid]
        ev = {
            'id': sid, 'kind': 'shot', 'scene': s['scene'], 'set': s['set'],
            'start_frame': st, 'end_frame': st + df, 'duration_frames': df, 'duration_s': round(df / FPS, 4),
            'tc_in': tc(st), 'tc_out': tc(st + df),
            'shotlist_est_s': s['est_seconds'], 'shotlist_range_s': [s['est_low_s'], s['est_high_s']],
            'timing': None,
            'transition_in': trans[sid],
            'camera': cam_or_black(a),
            'time_of_day': s['time_of_day'], 'lighting': s['lighting'],
            'in_frame': [{'who': w[0], 'screen_pos': w[1], 'seen_as': w[2]} for w in a.get('who', [])],
            'action': s['action'],
            'beats': [], 'dialogue': [], 'dialogue_continues': [],
            'sfx': [], 'music': [], 'onscreen_text': [],
            'shotlist_sound': s['sound'],
            'realism_strategy': {'codes': a['real'][0].split(), 'staging': a['real'][1]},
            'needs': [{'item': n[0], 'status': n[1], 'substitute': n[2]} for n in a.get('needs', [])],
            'continuity_flags': s['continuity_flags'],
            'difficulty': s['difficulty'], 'difficulty_tags': s['difficulty_tags'],
            'render': {'mode': 'black' if s['set'] == 'CARD_BLACK' else a.get('mode', 'velocity'),
                       'cost_class': a.get('cost'),
                       'handles_frames': handles[sid],
                       'frames_to_render': 0 if s['set'] == 'CARD_BLACK' else df + sum(handles[sid])},
        }
        if a.get('note'):
            ev['note'] = a['note']
        # timing explanation
        estf = round_f(s['est_seconds'])
        if sid in ('P-08', 'P-10', 'P-11', 'P-12', 'P-13', 'P-14'):
            ev['timing'] = 'cut to the narrator\'s words (prologue captions)'
        elif a.get('dur') == 'tight':
            ev['timing'] = 'as short as the lines allow (no added hold)'
        elif a.get('dur') is not None:
            ev['timing'] = f'authored {a["dur"]} s'
        elif df > estf:
            ev['timing'] = f'longer than the estimate: lines + gaps + {a.get("min_tail", 0.3)} s hold need {df / FPS:.2f} s'
        else:
            ev['timing'] = 'held at the shot-list estimate' + (' (real takes are shorter; spare time goes to the action/reaction after the lines)'
                                                               if placements.get(sid) else '')
        for t, what in a.get('beats', []):
            f = to_frame(sid, t, 'beat')
            ev['beats'].append({'shot_frame': f, 'frame': st + f, 'tc': tc(st + f), 'what': what})
        for t, cue, note in a.get('sfx', []):
            if cue not in SFX:
                problems.append(f'{sid}: unknown sfx id {cue}')
                continue
            f = to_frame(sid, t, 'sfx')
            ev['sfx'].append({'cue': cue, 'shot_frame': f, 'frame': st + f, 'tc': tc(st + f), 'what': SFX[cue][0],
                              'note': note, 'source': SFX[cue][1], 'stem': SFX[cue][2]})
        for p in placements.get(sid, []):
            r = lines[p['id']]
            ev['dialogue'].append({k: r[k] for k in ('id', 'speaker', 'text', 'take', 'take_start_frame', 'take_start_shot_frame',
                                                      'speech_in_frame', 'speech_out_frame', 'speech_in_s', 'speech_out_s',
                                                      'gap_from_previous_line_s', 'placement_rule', 'mouth_visible')}
                                   | {'gain_db': r['mix']['gain_db']})
        if sid == 'P-10':
            r = lines['L003']
            ev['dialogue'].append({k: r[k] for k in ('id', 'speaker', 'text', 'take', 'take_start_frame', 'take_start_shot_frame',
                                                      'speech_in_frame', 'speech_out_frame', 'speech_in_s', 'speech_out_s',
                                                      'gap_from_previous_line_s', 'placement_rule', 'mouth_visible')}
                                   | {'gain_db': r['mix']['gain_db'], 'parts': r['parts']})
        for lid, r in lines.items():
            if sid in r.get('continues_into', []):
                cont = {'id': lid, 'from_shot': r['shot']}
                if 'parts' in r:
                    cont['parts_starting_here'] = [p['part'] for p in r['parts'] if p['shot'] == sid]
                ev['dialogue_continues'].append(cont)
        for m in M:
            if m['start_frame'] < st + df and m['end_frame'] > st:
                ev['music'].append({'cue': m['id'], 'state': ('starts' if st <= m['start_frame'] < st + df else
                                                             'ends' if st < m['end_frame'] <= st + df else 'continues')})
        for t in texts:
            if t['kind'] in ('location_caption', 'title_card') and t.get('shot') == sid:
                ev['onscreen_text'].append({'id': t['id'], 'text': t['text'], 'start_frame': t['start_frame'], 'end_frame': t['end_frame']})
        shot_events.append(ev)

    events.extend(shot_events)
    events.append({'id': 'WIP-END', 'kind': 'card', 'scene': 'CARD', 'start_frame': events_end_of_shots, 'end_frame': total})
    for e in events:
        if e['kind'] == 'card':
            e.update({'duration_frames': e['end_frame'] - e['start_frame'], 'duration_s': (e['end_frame'] - e['start_frame']) / FPS,
                      'tc_in': tc(e['start_frame']), 'tc_out': tc(e['end_frame']),
                      'render': {'mode': 'card', 'frames_to_render': 0},
                      'text_id': e['id'],
                      'audio': 'silence' if e['id'] == 'WIP-OPEN' else 'the banking wingbeat rings out, M3 and the wind fade to silence'})

    # ---------------------------------------------------------- totals + checks summary
    scene_tot = {}
    for e in shot_events:
        sc = scene_tot.setdefault(e['scene'], {'shots': 0, 'frames': 0, 'est_s': 0.0})
        sc['shots'] += 1
        sc['frames'] += e['duration_frames']
        sc['est_s'] += e['shotlist_est_s']
    for sc in scene_tot.values():
        sc['seconds'] = round(sc['frames'] / FPS, 3)
        sc['est_s'] = round(sc['est_s'], 2)
    l46, l47 = lines['L046'], lines['L047']
    doc = {
        'schema': 'dragons-kingdom/preview-edl v1',
        'episode': 'S01E01',
        'title': "Dragon's Kingdom S01E01 - work-in-progress preview (PROLOGUE through 1E)",
        'status': ('PLAN. Nothing is rendered yet. Provisional designs, temporary computer voices (vo/takes.json), '
                   'no lip-sync. Not approved by Daxtyn. The WORK IN PROGRESS cards at both ends are required.'),
        'generated_by': rel(HERE / 'build_edl.py'),
        'authored_decisions': rel(HERE / 'edl_shots.py'),
        'sources': {name: {'path': rel(p), 'sha256': sha256(p)} for name, p in [
            ('shotlist.json', EP / 'shotlist.json'), ('dialogue.json', EP / 'dialogue.json'),
            ('onscreen-text.json', EP / 'onscreen-text.json'), ('screenplay.md', EP / 'screenplay.md'),
            ('takes.json', PREVIEW / 'vo' / 'takes.json'), ('words.json', PREVIEW / 'vo' / 'words.json'),
            ('edl_shots.py', HERE / 'edl_shots.py')]},
        'scope': {'scenes': SCENES, 'first_line': 'L001', 'last_line': 'L078',
                  'ends_on': 'L078 REMI "Attack." then "Charcoal banks." (shot 1E-18)',
                  'excluded': 'screenplay-extended.md PROPOSED additions (not approved)'},
        'format': {'fps': FPS, 'resolution': [3840, 2160], 'sensor': 'Super 35 (as the style frames)',
                   'audio_rate': SR, 'samples_per_frame': SPF,
                   'frame_convention': 'global frame 0 = first frame of the WORK IN PROGRESS card; start_frame inclusive, end_frame exclusive',
                   'take_placement': 'take_start_frame = the frame on which the WAV\'s sample 0 is placed (sample-exact: frame x 2000)'},
        'totals': {'frames': total, 'seconds': total / FPS, 'tc': tc(total),
                   'shots': len(shot_events), 'cards': 2,
                   'picture_frames_excluding_cards': events_end_of_shots - WIP_FRAMES,
                   'shotlist_estimate_s': round(sum(s['est_seconds'] for s in sl_shots), 2),
                   'lines': len(lines), 'speech_s_takes': round(sum(t.dur for k, t in takes.items()), 3),
                   'scenes': scene_tot},
        'canon': {
            'original_lines_exact': {k: lines[k]['text'] for k in ('L011', 'L046', 'L047', 'L048')},
            'silence_after_succession_question_s': round(lines['L047']['audible_in_s'] - l46['speech_out_s'], 3),
            'notes': ['Abby is silent after the succession question (no line, nod or narration between L046 and L047).',
                      'Leaf initiates the nip (1D-16); Charcoal releases Leaf unharmed (1D-22).',
                      'Abby\'s LEFT arm is hurt by the pass itself: no weapon, no contact (1E-03/1E-04); never mirrored.',
                      '"Attack." is a physical-attack command: no flame (1E-18). No glow anywhere.',
                      'No narration of thoughts; the narrator speaks only L001-L005.']},
        'staging_policy': {
            'why': 'Faces and lip-sync are not finished, so every line is staged with the speaker\'s mouth unreadable, without changing what happens.',
            'codes': {'BACK': 'from behind / lost profile', 'WIDE': 'people small in frame (long lens or wide)',
                      'SIL': 'silhouette or contre-jour (sun or window behind them; no face fill)',
                      'HANDS': 'hands and props carry the action', 'DOF': 'shallow focus; faces soft',
                      'OTS': 'over the shoulder', 'OFF': 'speaker off screen', 'NONE': 'no people in frame'},
            'face_beats_deferred': ['1A-14', '1A-15', '1D-07', '1D-25', '1E-17'],
            'deferred_note': 'Beats the screenplay plays on a face (softening, the hold after the whisper, Abby\'s shallow smile, '
                             'Remi\'s smile, his expression change) are carried by posture, breath and light here. '
                             'Return to faces when approved faces and lip-sync exist.'},
        'events': events,
        'lines': [lines[k] for k in sorted(lines)],
        'onscreen_text': texts,
        'music': M,
        'no_music_windows': no_music,
        'beds': beds,
        'sfx_library': {k: {'what': v[0], 'source': v[1], 'stem': v[2]} for k, v in sorted(SFX.items())},
        'build_problems': problems,
    }
    (PREVIEW / 'edl.json').write_text(json.dumps(doc, indent=1, ensure_ascii=False) + '\n')
    (PREVIEW / 'edl.md').write_text(render_md(doc))
    print(f'edl.json: {len(events)} events, {total} frames = {tc(total)} ({total / FPS:.2f} s); '
          f'{len(lines)} lines; silence after L046 = {doc["canon"]["silence_after_succession_question_s"]} s')
    if problems:
        print('PROBLEMS:')
        for p in problems:
            print('  ' + p)
        sys.exit(1)


# ------------------------------------------------------------------ markdown


def md_esc(s):
    return str(s).replace('|', '/').replace('\n', ' ')


def render_md(doc):
    ev = doc['events']
    shots = [e for e in ev if e['kind'] == 'shot']
    T = doc['totals']
    o = []
    w = o.append
    w("# Dragon's Kingdom S01E01: work-in-progress preview, edit decision list")
    w('')
    w('> **Plan only, nothing is rendered yet.** This preview uses provisional designs and temporary computer voices, and it has no lip-sync. '
      'Daxtyn has not approved it. The WORK IN PROGRESS cards at the start and the end are required.')
    w('')
    w(f'Generated by `tools/build_edl.py` from `shotlist.json`, the real voice takes (`vo/takes.json`, `vo/words.json`) and '
      f'the staging decisions in `tools/edl_shots.py`. Check it with `tools/check_edl.py`. The machine-readable version is `edl.json`.')
    w('')
    w('## Summary')
    w('')
    w(f'- **Length: {T["tc"]} ({T["seconds"]:.2f} s, {T["frames"]} frames at 24 fps)**, 3840x2160.')
    w(f'- {T["shots"]} shots plus 2 cards. The picture without the cards runs {T["picture_frames_excluding_cards"] / 24:.2f} s; '
      f'the shot list estimated {T["shotlist_estimate_s"]} s for the same shots.')
    w(f'- {T["lines"]} lines (L001 to L078), placed with their real take lengths. The takes add up to {T["speech_s_takes"]:.1f} s.')
    w('- It covers the original screenplay from the PROLOGUE to "Attack." / "Charcoal banks." in 1E. '
      'Nothing comes from `screenplay-extended.md`.')
    w(f'- After the succession question there are {doc["canon"]["silence_after_succession_question_s"]:.2f} s of silence: '
      'no line, no nod and no narration before "Yeah, you\'re good."')
    w('')
    w('| Part | Shots | Length | Shot-list estimate |')
    w('|---|---:|---:|---:|')
    w('| WORK IN PROGRESS card | - | 3.00 s | - |')
    for sc, v in T['scenes'].items():
        w(f'| {sc} | {v["shots"]} | {v["seconds"]:.2f} s | {v["est_s"]:.1f} s |')
    w('| End card | - | 4.00 s | - |')
    w('')
    w('## Conventions')
    w('')
    w('- **Frames.** Global frame 0 is the first frame of the WORK IN PROGRESS card. `start` is inclusive and `end` is exclusive, '
      'so each shot\'s end is the next shot\'s start. Timecode is HH:MM:SS:FF at 24 fps.')
    w('- **Line in-points.** "take @ frame" is the frame where the WAV\'s first sample goes; at 48 kHz one frame is 2000 samples. '
      '"speech" gives the frames where the words start and end, taken from the sentence segments in `takes.json`.')
    w('- **Cue gaps.** The gap runs from the end of one line\'s speech to the first sound of the next take. '
      'Quick exchanges use about 0.3 s, normal ones 0.35 to 0.4 s, and airborne speakers 0.45 to 0.5 s, so there is wind between the lines.')
    w('- **Shot length.** A shot is held at the shot-list estimate. The real takes are about 16 % shorter than estimated, '
      'so the spare time goes to the action and reactions after the lines. Pauses between lines are not stretched, and shots are not squeezed.')
    w('- **Dissolves.** Each dissolve is centred on the cut. Both shots render half the dissolve as a handle.')
    w('- **Camera.** Lenses are in mm on a Super 35 sensor, the same as the style frames.')
    w('- **Staging.** Faces and lip-sync are unfinished, so every line is staged with the speaker\'s mouth unreadable. '
      'The tools are: from behind (BACK), wide (WIDE), silhouette or contre-jour (SIL), hands (HANDS), shallow focus (DOF), '
      'over the shoulder (OTS) and off screen (OFF). What happens in the story does not change.')
    w('- **Faces deferred.** Some beats are played on a face in the screenplay: ' + ', '.join(doc['staging_policy']['face_beats_deferred'])
      + '. Here posture, breath and light carry them. They go back to faces once faces are approved.')
    w('')
    w('## Cards and on-screen text')
    w('')
    w('| ID | Text | Frames | Hold | Synced to |')
    w('|---|---|---|---:|---|')
    for t in doc['onscreen_text']:
        txt = t['text'] if t['kind'] != 'work_in_progress_card' or t['id'] == 'WIP-OPEN' else ' / '.join(t['layout_lines'])
        w(f'| {t["id"]} | {md_esc(txt)} | {t["start_frame"]}-{t["end_frame"]} | {(t["end_frame"] - t["start_frame"]) / 24:.2f} s | '
          f'{md_esc(t.get("synced_to_word", t.get("shot", "")))} |')
    w('')
    w('The opening card text is exact: **"' + doc['onscreen_text'][0]['text'] + '"**.')
    w('')
    l3 = next(r for r in doc['lines'] if r['id'] == 'L003')
    sp = l3['splice']
    caps = [t for t in doc['onscreen_text'] if t['kind'] == 'location_caption']
    w('**The two seas.** The temporary narrator says "The Citadel Sea and the Proxy Sea." in one breath, so the CITADEL SEA '
      'caption had only 1.0 s. The take is now cut once inside that sentence, at the silent word boundary between "Sea" '
      f'and "and" (sample {sp["sample"]}, {sp["level_dbfs_5ms_rms"]:.1f} dBFS, measured by `tools/splice.py`). '
      f'A {sp["breath_s"]:.2f} s breath opens there, and the dissolve to the Proxy Sea sits inside it, so the two seas '
      'never share a view and neither picture changes on a word. '
      'The time comes from the stretched pauses next to it (5 frames from each pause between Tara, Scrapper and Verdor, '
      'and 0.15 s before "Seven kingdoms"), so the place-name block keeps its length and nothing from P-15 on moves. '
      f'The five captions now hold {min(t["hold_s"] for t in caps):.2f} to {max(t["hold_s"] for t in caps):.2f} s. '
      'The words are untouched. A human narrator would make this pause naturally.')
    w('')
    w('## Music')
    w('')
    w('| Cue | From | To | What |')
    w('|---|---|---|---|')
    for m in doc['music']:
        w(f'| {m["id"]} | {m["start_frame"]} ({tc(m["start_frame"])}) | {m["end_frame"]} ({tc(m["end_frame"])}) | {md_esc(m["what"])} |')
    for n in doc['no_music_windows']:
        w(f'| (none) | {n["from_frame"]} ({tc(n["from_frame"])}) | {n["to_frame"]} ({tc(n["to_frame"])}) | {md_esc(n["why"])} |')
    w('')
    w('## Ambience beds and wingbeat tracks')
    w('')
    w('| Bed | From | To | What |')
    w('|---|---|---|---|')
    for b in doc['beds']:
        w(f'| {b["id"]} | {b["start_frame"]} | {b["end_frame"]} | {md_esc(b["what"])}{"; " + md_esc(b["note"]) if b.get("note") else ""} |')
    w('')
    w('## Shots')
    cur_scene = None
    for e in ev:
        if e['kind'] == 'card':
            w('')
            w(f'### Card {e["id"]}: frames {e["start_frame"]}-{e["end_frame"]} ({e["duration_s"]:.0f} s, {e["tc_in"]})')
            w('')
            t = next(x for x in doc['onscreen_text'] if x['id'] == e['id'])
            for ln in t['layout_lines']:
                w(f'    {ln}')
            w('')
            w(f'Audio: {e["audio"]}.')
            continue
        if e['scene'] != cur_scene:
            cur_scene = e['scene']
            w('')
            w(f'### Scene {cur_scene}')
        w('')
        cm = e['camera']
        lens = f'{cm["lens_mm"]} mm' if cm.get('lens_mm') else 'no camera'
        w(f'#### {e["id"]}: {e["set"]}, frames {e["start_frame"]}-{e["end_frame"]} '
          f'({e["duration_frames"]} f = {e["duration_s"]:.2f} s), {e["tc_in"]}')
        w('')
        tr = e['transition_in']
        trs = tr['type'] + (f' {tr["frames"]} f' if tr.get('frames') else '')
        w(f'- **Camera:** {lens}{", " + cm["stop"] if cm.get("stop") else ""}. {cm["move"]}. {cm["framing"]}.'
          + (f' Focus: {cm["focus"]}.' if cm.get('focus') else '') + f' In: {trs}.')
        w(f'- **Timing:** {e["timing"]} (estimate {e["shotlist_est_s"]} s).')
        if e['in_frame']:
            w('- **In frame:** ' + '; '.join(f'{x["who"]} @ {x["screen_pos"]}' + (f' ({x["seen_as"]})' if x['seen_as'] else '') for x in e['in_frame']) + '.')
        for d in e['dialogue']:
            extra = ''
            if d.get('parts'):
                extra = (' Split at its sentence pauses and at one silent word-boundary splice (marked): ' + '; '.join(
                    f'part {p["part"]} "{p["text"]}" @ {p["timeline_frame"]} ({p["shot"]})'
                    + (' [after the splice]' if p.get('cut') == 'word-boundary splice' else '') for p in d['parts']) + '.')
            gap = '' if d['gap_from_previous_line_s'] is None else f', gap {d["gap_from_previous_line_s"]:.2f} s'
            w(f'- **{d["id"]} {d["speaker"]}:** "{d["text"]}". Take @ {d["take_start_frame"]} (shot frame {d["take_start_shot_frame"]}); '
              f'speech {d["speech_in_frame"]}-{d["speech_out_frame"]}{gap}; {d["gain_db"]:+.1f} dB.{extra}')
        for c in e['dialogue_continues']:
            w(f'- **{c["id"]}** continues from {c["from_shot"]}' + (f' (part {", ".join(map(str, c["parts_starting_here"]))} starts here)' if c.get('parts_starting_here') else '') + '.')
        if e['beats']:
            w('- **Beats:** ' + ' '.join(f'[{b["shot_frame"]}] {b["what"]}' for b in e['beats']))
        if e['sfx']:
            w('- **Sound:** ' + '; '.join(f'[{s["shot_frame"]}] {s["cue"]}' + (f' ({s["note"]})' if s['note'] else '') for s in e['sfx']) + '.')
        if e['music']:
            w('- **Music:** ' + ', '.join(f'{m["cue"]} {m["state"]}' for m in e['music']) + '.')
        for t in e['onscreen_text']:
            w(f'- **On screen:** {t["text"]} (frames {t["start_frame"]}-{t["end_frame"]}).')
        rs = e['realism_strategy']
        w(f'- **Realism ({" + ".join(rs["codes"])}):** {rs["staging"]}')
        for n in e['needs']:
            if n['status'] == 'exists':
                continue
            w(f'- **Needs ({n["status"]}):** {n["item"]}.' + (f' Substitute: {n["substitute"]}' if n['substitute'] else ''))
        if e['continuity_flags']:
            w('- **Continuity:** ' + ', '.join(e['continuity_flags']) + '.')
        if e.get('note'):
            w(f'- **Note:** {e["note"]}')
    w('')
    w('## Lines index')
    w('')
    w('| Line | Speaker | Shot | Take @ frame | Speech (s) | Gap before |')
    w('|---|---|---|---:|---|---:|')
    for r in doc['lines']:
        gap = '' if r['gap_from_previous_line_s'] is None else f'{r["gap_from_previous_line_s"]:.2f}'
        w(f'| {r["id"]} | {r["speaker"]} | {r["shot"]} | {r["take_start_frame"]} | {r["speech_in_s"]:.2f}-{r["speech_out_s"]:.2f} | {gap} |')
    w('')
    w('## What has to be built (and the substitute until it exists)')
    w('')
    w('| Shot | Status | Item | Closest honest substitute |')
    w('|---|---|---|---|')
    for e in shots:
        for n in e['needs']:
            if n['status'] in ('missing', 'small-build'):
                w(f'| {e["id"]} | {n["status"]} | {md_esc(n["item"])} | {md_esc(n["substitute"])} |')
    w('')
    w('## Canon checklist')
    w('')
    for k, v in doc['canon']['original_lines_exact'].items():
        w(f'- {k} [ORIGINAL], exact: "{v}"')
    for n in doc['canon']['notes']:
        w(f'- {n}')
    w('')
    return '\n'.join(o)


if __name__ == '__main__':
    main()
