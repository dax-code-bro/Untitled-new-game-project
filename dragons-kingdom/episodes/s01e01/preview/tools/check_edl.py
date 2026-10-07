#!/usr/bin/env python3
"""check_edl.py - validate the S01E01 work-in-progress preview EDL (../edl.json).

Usage:
  python3 -I check_edl.py            check; exit 1 if any ERROR
  python3 -I check_edl.py --strict   warnings count as errors too
  python3 -I check_edl.py --json     print the result as JSON
  python3 -I check_edl.py --edl F    check another file (e.g. a hand-edited copy)

What it checks (stdlib only; reads edl.json, shotlist.json, dialogue.json, onscreen-text.json,
screenplay.md, vo/takes.json, vo/words.json - nothing is modified):
  frames      contiguous events from frame 0, no gaps or overlaps, durations add up to the total;
              24 fps, 3840x2160; total length near 10 minutes
  cards       the WORK IN PROGRESS card opens (3 s, exact text) and the end card closes (4 s)
  shots       exactly the shotlist.json shots PROLOGUE..1E, in order, once each, same set and
              continuity flags; dissolves even and shorter than both shots; handles consistent;
              frames to render = duration + handles
  lines       every line L001..L078 exactly once (and nothing outside that range); text byte-exact
              to dialogue.json; take sha256 / sample count equal to takes.json; speech times
              recomputed from the takes' sentence segments; lines in script order, never
              overlapping; speech inside its shot (or the shots it is declared to continue into);
              split takes cover the whole take once, in order, cut only in silent pauses
  canon       [ORIGINAL] lines exact and present in screenplay.md; Abby silent after the
              succession question (L047 follows L046 directly, >= 3 s of silence, no speech in it);
              last line L078 in the last shot, which carries ATTACK_NO_FLAME
  captions    TARA / SCRAPPER / VERDOR / CITADEL SEA / PROXY SEA in the narrator's order, each
              appearing with its word (+-3 frames), inside its own shot and outside dissolves;
              the title inside T-01
  staging     every shot has a realism strategy; no line shows a speaking mouth; face/lip-sync
              shots are never staged as plain face shots
  cues        beats / sfx inside their shots; music cues inside the timeline, not overlapping each
              other, silent in the declared no-music windows
  freshness   source sha256 values recorded in edl.json still match the files (else the EDL is stale)
"""
import hashlib
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
PREVIEW = HERE.parent
EP = PREVIEW.parent
REPO = EP.parents[2]
FPS, SR = 24, 48000
SPF = SR // FPS
SCENES = ['PROLOGUE', 'TITLE', '1A', '1B', '1C', '1D', '1E']
WIP_TEXT = 'WORK IN PROGRESS - Episode 1 preview - provisional designs, temporary voices'
ALLOWED_CODES = {'BACK', 'WIDE', 'SIL', 'HANDS', 'DOF', 'OTS', 'OFF', 'NONE'}
TARGET_S, WARN_TOL_S, ERR_TOL_S = 600.0, 30.0, 60.0


class Report:
    def __init__(self):
        self.errors, self.warnings, self.ok = [], [], []

    def err(self, m):
        self.errors.append(m)

    def warn(self, m):
        self.warnings.append(m)

    def check(self, cond, m, warn=False):
        if not cond:
            (self.warn if warn else self.err)(m)
        return cond


def main():
    strict = '--strict' in sys.argv
    as_json = '--json' in sys.argv
    R = Report()
    edl_path = Path(sys.argv[sys.argv.index('--edl') + 1]) if '--edl' in sys.argv else PREVIEW / 'edl.json'
    edl = json.loads(edl_path.read_text())
    shotlist = json.loads((EP / 'shotlist.json').read_text())
    dialogue = json.loads((EP / 'dialogue.json').read_text())
    onscreen = json.loads((EP / 'onscreen-text.json').read_text())
    screenplay = (EP / 'screenplay.md').read_text()
    takes = {t['id']: t for t in json.loads((PREVIEW / 'vo' / 'takes.json').read_text())['takes']}
    words = json.loads((PREVIEW / 'vo' / 'words.json').read_text())['lines']
    dl = {l['id']: l for l in dialogue['lines']}

    # ------------------------------------------------------------ freshness
    for name, src in edl['sources'].items():
        p = REPO / src['path']
        if not p.exists():
            R.err(f'source missing: {src["path"]}')
            continue
        R.check(hashlib.sha256(p.read_bytes()).hexdigest() == src['sha256'],
                f'{name} changed since edl.json was built: re-run tools/build_edl.py', warn=True)
    R.check(not edl.get('build_problems'), f'build_problems recorded: {edl.get("build_problems")}')

    # ------------------------------------------------------------ format + frames
    fmt = edl['format']
    R.check(fmt['fps'] == FPS and fmt['resolution'] == [3840, 2160], 'format must be 24 fps, 3840x2160')
    R.check(fmt['samples_per_frame'] == SPF, 'samples_per_frame must be 2000')
    ev = edl['events']
    R.check(ev and ev[0]['start_frame'] == 0, 'first event must start at frame 0')
    for a, b in zip(ev, ev[1:]):
        R.check(b['start_frame'] == a['end_frame'], f'gap/overlap between {a["id"]} (end {a["end_frame"]}) and {b["id"]} (start {b["start_frame"]})')
    for e in ev:
        R.check(e['end_frame'] > e['start_frame'], f'{e["id"]}: empty or negative duration')
        R.check(e['duration_frames'] == e['end_frame'] - e['start_frame'], f'{e["id"]}: duration_frames does not match start/end')
        R.check(abs(e['duration_s'] - e['duration_frames'] / FPS) < 1e-3, f'{e["id"]}: duration_s does not match frames')
    total = ev[-1]['end_frame']
    R.check(edl['totals']['frames'] == total, 'totals.frames differs from the last event end')
    secs = total / FPS
    R.check(abs(secs - TARGET_S) <= ERR_TOL_S, f'total {secs:.1f} s is far from ~10 minutes')
    R.check(abs(secs - TARGET_S) <= WARN_TOL_S, f'total {secs:.1f} s is more than {WARN_TOL_S:.0f} s from 10:00', warn=True)

    # ------------------------------------------------------------ cards
    texts = {t['id']: t for t in edl['onscreen_text']}
    first, last = ev[0], ev[-1]
    R.check(first['id'] == 'WIP-OPEN' and first['kind'] == 'card' and first['duration_frames'] == 3 * FPS,
            'the first event must be the 3 s WORK IN PROGRESS card')
    R.check(last['id'] == 'WIP-END' and last['kind'] == 'card' and last['duration_frames'] == 4 * FPS,
            'the last event must be the 4 s end card')
    wt = texts.get('WIP-OPEN')
    R.check(wt is not None and wt['text'] == WIP_TEXT, 'WIP-OPEN text must be exactly: ' + WIP_TEXT)
    if wt:
        R.check((wt['start_frame'], wt['end_frame']) == (first['start_frame'], first['end_frame']), 'WIP-OPEN text must span the card')
    et = texts.get('WIP-END')
    R.check(et is not None and 'WORK IN PROGRESS' in et['text'] and 'Temporary' in et['text'], 'end card must say WORK IN PROGRESS and list what is temporary')
    if et:
        R.check((et['start_frame'], et['end_frame']) == (last['start_frame'], last['end_frame']), 'WIP-END text must span the end card')
        for need in ('voices', 'designs', 'lip-sync', 'music', 'props'):
            R.check(need in et['text'], f'end card should mention temporary {need}', warn=True)

    # ------------------------------------------------------------ shots
    sl = [s for s in shotlist['shots'] if s['scene'] in SCENES]
    shots = [e for e in ev if e['kind'] == 'shot']
    R.check([s['id'] for s in shots] == [s['id'] for s in sl], 'shots must be exactly shotlist.json PROLOGUE..1E, in order, once each')
    sl_by = {s['id']: s for s in sl}
    by = {s['id']: s for s in shots}
    for i, e in enumerate(shots):
        s = sl_by.get(e['id'])
        if not s:
            continue
        R.check(e['set'] == s['set'] and e['scene'] == s['scene'], f'{e["id"]}: set/scene differ from shotlist.json')
        R.check(e['continuity_flags'] == s['continuity_flags'], f'{e["id"]}: continuity flags differ from shotlist.json')
        tr = e['transition_in']
        if tr['type'] == 'dissolve':
            R.check(tr['frames'] % 2 == 0 and tr['frames'] > 0, f'{e["id"]}: dissolve length must be even and > 0')
            if i > 0:
                prev = shots[i - 1]
                R.check(tr['frames'] <= min(e['duration_frames'], prev['duration_frames']), f'{e["id"]}: dissolve longer than a shot')
                R.check(e['render']['handles_frames'][0] == tr['frames'] // 2 and prev['render']['handles_frames'][1] == tr['frames'] // 2,
                        f'{e["id"]}: dissolve handles do not match')
        if e['set'] == 'CARD_BLACK':
            R.check(e['render']['frames_to_render'] == 0, f'{e["id"]}: a black shot renders no frames')
        else:
            R.check(e['render']['frames_to_render'] == e['duration_frames'] + sum(e['render']['handles_frames']),
                    f'{e["id"]}: frames_to_render must be duration + handles')
        # beats / sfx inside the shot
        for b in e['beats'] + e['sfx']:
            R.check(0 <= b['shot_frame'] < e['duration_frames'] and b['frame'] == e['start_frame'] + b['shot_frame'],
                    f'{e["id"]}: cue at shot frame {b["shot_frame"]} outside the shot')
        # staging
        rs = e['realism_strategy']
        R.check(rs['codes'] and set(rs['codes']) <= ALLOWED_CODES and rs['staging'].strip(), f'{e["id"]}: missing or unknown realism strategy')
        tags = set(e['difficulty_tags'])
        if tags & {'LIPSYNC', 'FACE_CLOSEUP'}:
            R.check(rs['codes'] != ['NONE'], f'{e["id"]}: a face / lip-sync shot needs a staging strategy')
        cam = e['camera']
        if e['set'] != 'CARD_BLACK':
            R.check(isinstance(cam.get('lens_mm'), (int, float)) and cam.get('move') and cam.get('framing'), f'{e["id"]}: camera lens/move/framing missing')
        for n in e['needs']:
            R.check(n['status'] in ('exists', 'exists-wip', 'small-build', 'missing'), f'{e["id"]}: bad need status {n["status"]}')
            if n['status'] == 'missing':
                R.check(bool(n['substitute'].strip()), f'{e["id"]}: missing item "{n["item"]}" has no substitute')

    # ------------------------------------------------------------ lines
    want_ids = [f'L{i:03d}' for i in range(1, 79)]
    lines = {l['id']: l for l in edl['lines']}
    R.check(sorted(lines) == want_ids and len(edl['lines']) == 78, 'edl.lines must be exactly L001..L078, once each')
    placed = [d['id'] for e in shots for d in e['dialogue']]
    R.check(sorted(placed) == want_ids and len(placed) == 78, 'every line must be placed in exactly one shot (dialogue lists)')
    for lid in want_ids:
        if lid not in lines:
            continue
        r, tk = lines[lid], takes[lid]
        R.check(r['text'] == dl[lid]['text'], f'{lid}: text differs from dialogue.json')
        R.check(r['take_sha256'] == tk['sha256'] and r['take_samples'] == tk['samples'], f'{lid}: take differs from takes.json')
        R.check(r['mouth_visible'] is False, f'{lid}: a speaking mouth is visible but lip-sync does not exist')
        host = by.get(r['shot'])
        if not host:
            R.err(f'{lid}: host shot {r["shot"]} not in EDL')
            continue
        segs = tk['segments']
        breath = tk.get('breath_s') or 0.0
        if 'parts' in r:
            parts = r['parts']
            R.check(abs(parts[0]['take_in_s']) < 1e-9 and abs(parts[-1]['take_out_s'] - tk['samples'] / SR) < 1e-6,
                    f'{lid}: split take must cover the whole file')
            for a, b in zip(parts, parts[1:]):
                R.check(abs(a['take_out_s'] - b['take_in_s']) < 1e-9, f'{lid}: parts {a["part"]}/{b["part"]} are not contiguous in the take')
                R.check(b['timeline_frame'] * FPS >= 0 and b['timeline_frame'] / FPS >= a['timeline_frame'] / FPS + (a['take_out_s'] - a['take_in_s']) - 1e-6,
                        f'{lid}: parts {a["part"]}/{b["part"]} overlap on the timeline')
            # every cut point must lie in silence: between one sentence segment's end and the next's start
            for p in parts[1:]:
                R.check(any(segs[i]['end_s'] <= p['take_in_s'] <= segs[i + 1]['start_s'] for i in range(len(segs) - 1)),
                        f'{lid}: split at {p["take_in_s"]} s is not inside a pause between sentences')
            sp_in = parts[0]['timeline_frame'] / FPS + segs[0]['start_s'] - parts[0]['take_in_s']
            sp_out = parts[-1]['timeline_frame'] / FPS + segs[-1]['end_s'] - parts[-1]['take_in_s']
            aud_in = parts[0]['timeline_frame'] / FPS + max(0.0, segs[0]['start_s'] - breath) - parts[0]['take_in_s']
            take_end = parts[-1]['timeline_frame'] / FPS + parts[-1]['take_out_s'] - parts[-1]['take_in_s']
        else:
            t0 = r['take_start_frame'] / FPS
            sp_in, sp_out = t0 + segs[0]['start_s'], t0 + segs[-1]['end_s']
            aud_in = t0 + max(0.0, segs[0]['start_s'] - breath)
            take_end = t0 + tk['samples'] / SR
            R.check(r['take_end_sample'] == r['take_start_frame'] * SPF + tk['samples'], f'{lid}: take_end_sample wrong')
        R.check(abs(sp_in - r['speech_in_s']) < 2e-3 and abs(sp_out - r['speech_out_s']) < 2e-3 and abs(aud_in - r['audible_in_s']) < 2e-3,
                f'{lid}: speech times do not match the take segments')
        R.check(r['take_start_shot_frame'] == r['take_start_frame'] - host['start_frame'], f'{lid}: take_start_shot_frame wrong')
        span_end = host['end_frame']
        for c in r.get('continues_into', []):
            if c in by:
                span_end = max(span_end, by[c]['end_frame'])
        R.check(sp_in >= host['start_frame'] / FPS - 1e-6, f'{lid}: speech starts before its shot {host["id"]}')
        R.check(sp_out <= span_end / FPS + 1e-6, f'{lid}: speech runs past its shot(s)')
        R.check(take_end <= span_end / FPS + 1e-6, f'{lid}: the take file runs past its shot(s) (cut the tail or extend the shot)', warn=True)
        R.check(r['speech_in_frame'] == int(r['speech_in_s'] * FPS + 1e-6) and r['speech_out_frame'] >= r['speech_out_s'] * FPS - 1e-6,
                f'{lid}: speech frames inconsistent')
    # order + overlap
    seq = [lines[i] for i in want_ids if i in lines]
    for a, b in zip(seq, seq[1:]):
        R.check(b['speech_in_s'] > a['speech_in_s'], f'{b["id"]} starts before {a["id"]}: lines out of script order')
        gap = b['audible_in_s'] - a['speech_out_s']
        R.check(gap >= 0.1, f'{a["id"]} -> {b["id"]}: only {gap:.2f} s between lines (overlap or no breath)')
        R.check(abs((b.get('gap_from_previous_line_s') or 0) - gap) < 2e-3, f'{b["id"]}: recorded gap differs ({gap:.3f} s)')
    # each line in exactly one shot list, and that shot is its host
    for e in shots:
        for d in e['dialogue']:
            R.check(lines.get(d['id'], {}).get('shot') == e['id'], f'{d["id"]}: listed in {e["id"]} but hosted elsewhere')

    # ------------------------------------------------------------ canon
    for lid in ('L011', 'L046', 'L047', 'L048'):
        if lid in lines:
            R.check(lines[lid]['original'] is True and f'"{lines[lid]["text"]}"' in screenplay, f'{lid}: [ORIGINAL] line not exact in screenplay.md')
    if all(k in lines for k in ('L046', 'L047', 'L048')):
        a, b = lines['L046'], lines['L047']
        sil = b['audible_in_s'] - a['speech_out_s']
        R.check(sil >= 3.0, f'silence after the succession question is only {sil:.2f} s (needs >= 3 s)')
        R.check(sil <= 8.0, f'silence after the succession question is {sil:.2f} s (very long)', warn=True)
        R.check(b['speaker'] == 'REMI' and lines['L048']['speaker'] == 'ABBY', 'L047 must be Remi; Abby first speaks again at L048')
        between = [l['id'] for l in edl['lines'] if a['speech_out_s'] < l['speech_in_s'] < b['speech_in_s']]
        R.check(not between, f'lines inside the succession silence: {between}')
        R.check(abs(edl['canon']['silence_after_succession_question_s'] - sil) < 2e-3, 'canon.silence value is stale')
    if shots:
        R.check(shots[-1]['id'] == '1E-18' and 'ATTACK_NO_FLAME' in shots[-1]['continuity_flags'], 'the last shot must be 1E-18 with ATTACK_NO_FLAME')
        R.check(lines.get('L078', {}).get('shot') == '1E-18', 'L078 "Attack." must be in 1E-18')
    for sid, flag in (('1D-16', 'LEAF_INITIATES_NIP'), ('1D-22', 'LEAF_UNHARMED'), ('1E-04', 'ABBY_LEFT_ARM_INJURY_EVENT'), ('1D-04', 'ABBY_SILENCE')):
        R.check(sid in by and flag in by[sid]['continuity_flags'], f'{sid} must carry {flag}')

    # ------------------------------------------------------------ captions + title
    cards = {c['id']: c for c in onscreen['cards']}
    order = ['T01', 'T02', 'T03', 'T04', 'T05']
    prev_start = -1
    for cid in order:
        t = texts.get(cid)
        if not R.check(t is not None, f'caption {cid} missing'):
            continue
        R.check(t['text'] == cards[cid]['text'], f'{cid}: text differs from onscreen-text.json')
        R.check(t['shot'] == cards[cid]['shotlist_shot'], f'{cid}: must sit on shot {cards[cid]["shotlist_shot"]}')
        R.check(t['start_frame'] > prev_start, f'{cid}: captions out of the narrator\'s order')
        prev_start = t['start_frame']
        R.check(t['start_frame'] - 3 <= t['word_onset_frame'] <= t['start_frame'] + 3 + 6,
                f'{cid}: caption is not synced to its word (caption {t["start_frame"]}, word {t["word_onset_frame"]})')
        e = by.get(t['shot'])
        if e:
            i = shots.index(e)
            half_in = e['transition_in']['frames'] // 2 if e['transition_in']['type'] == 'dissolve' else 0
            nxt = shots[i + 1]
            half_out = nxt['transition_in']['frames'] // 2 if nxt['transition_in']['type'] == 'dissolve' else 0
            R.check(t['start_frame'] >= e['start_frame'] + half_in and t['end_frame'] <= e['end_frame'] - half_out,
                    f'{cid}: caption overlaps a dissolve (it would share a view with another place)')
        hold = (t['end_frame'] - t['start_frame']) / FPS
        R.check(hold >= 0.9, f'{cid}: caption holds only {hold:.2f} s')
        R.check(hold >= 1.5, f'{cid}: caption holds {hold:.2f} s (< 1.5 s suggested)', warn=True)
    # the caption word must actually be in the narrator line
    if 'L003' in words:
        spoken = ' '.join(w['w'] for w in words['L003']['words'])
        for cid in order:
            R.check(cards[cid]['text'].lower() in spoken, f'{cid}: "{cards[cid]["text"]}" not found in L003 alignment')
    t6 = texts.get('T06')
    if R.check(t6 is not None and t6['text'] == cards['T06']['text'], 'title card T06 missing or wrong text') and 'T-01' in by:
        R.check(by['T-01']['start_frame'] <= t6['start_frame'] < t6['end_frame'] <= by['T-01']['end_frame'], 'title must sit inside T-01')

    # ------------------------------------------------------------ music
    ms = sorted(edl['music'], key=lambda m: m['start_frame'])
    for m in ms:
        R.check(0 <= m['start_frame'] < m['end_frame'] <= total, f'music {m["id"]} outside the timeline')
    for a, b in zip(ms, ms[1:]):
        R.check(b['start_frame'] >= a['end_frame'], f'music {a["id"]} and {b["id"]} overlap')
    for w in edl['no_music_windows']:
        for m in ms:
            R.check(not (m['start_frame'] < w['to_frame'] and m['end_frame'] > w['from_frame']),
                    f'music {m["id"]} plays inside a no-music window ({w["why"]})')

    # ------------------------------------------------------------ report
    ok = not R.errors and not (strict and R.warnings)
    res = {'ok': ok, 'frames': total, 'seconds': round(secs, 3), 'tc': edl['totals']['tc'], 'shots': len(shots),
           'lines': len(lines), 'errors': R.errors, 'warnings': R.warnings}
    if as_json:
        print(json.dumps(res, indent=1))
    else:
        print(f'edl.json: {total} frames = {edl["totals"]["tc"]} ({secs:.2f} s), {len(shots)} shots + 2 cards, {len(lines)} lines')
        for w in R.warnings:
            print('WARNING: ' + w)
        for e in R.errors:
            print('ERROR:   ' + e)
        print('OK' if ok else f'FAILED ({len(R.errors)} errors, {len(R.warnings)} warnings)')
    sys.exit(0 if ok else 1)


if __name__ == '__main__':
    main()
