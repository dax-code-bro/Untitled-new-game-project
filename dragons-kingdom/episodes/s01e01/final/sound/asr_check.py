#!/usr/bin/env python3
"""Intelligibility listen-check by machine: decode every voice cue of a cut with pocketsphinx (BSD, CMU en-us model)
from (a) the dialogue stem alone and (b) the finished mix, and compare word recall against the script text.
The absolute recall of a small default model on synthetic voices is low; what matters is (b) against (a): the mix
must not lose words the dialogue alone gives.

  python3 -I episodes/s01e01/final/sound/asr_check.py --cut 1C
  (needs `pip install pocketsphinx` and a mix run with --keep-work so audio/.work/<cut>/dialogue.wav exists)

Writes sound/reports/<cut>-asr.json.
"""
import json, os, re, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
FINAL = os.path.dirname(HERE)
args = sys.argv[1:]
CUT = args[args.index('--cut') + 1] if '--cut' in args else 'PROLOGUE-TITLE-1A'
SUF = '' if CUT == 'PROLOGUE-TITLE-1A' else '-' + CUT
from pocketsphinx import Decoder  # noqa: E402

cues = [c for v in json.load(open(os.path.join(FINAL, 'cut', f'audio-cues{SUF}.json')))['scenes'].values() for c in v]
lines = {l['id']: l['text'] for l in json.load(open(os.path.join(FINAL, 'dialogue.json')))['lines']}
srcs = {'dialogue': os.path.join(FINAL, 'audio', '.work', CUT, 'dialogue.wav'), 'mix': os.path.join(FINAL, 'audio', 'cuts', CUT, 'mix.wav')}
for k, f in srcs.items():
    if not os.path.exists(f):
        sys.exit(f'missing {f} (run mix.mjs --cut {CUT} --keep-work first)')
words = lambda s: re.findall(r"[a-z']+", s.lower())


def decode(f, a, b):
    pcm = subprocess.run(['ffmpeg', '-v', 'error', '-ss', f'{a:.3f}', '-t', f'{b - a:.3f}', '-i', f, '-ac', '1', '-ar', '16000',
                          '-f', 's16le', '-'], capture_output=True, check=True).stdout
    d = Decoder(samprate=16000)
    d.start_utt(); d.process_raw(pcm, full_utt=True); d.end_utt()
    return d.hyp().hypstr if d.hyp() else ''


def recall(ref, hyp):
    h = list(words(hyp)); n = 0
    for w in words(ref):
        if w in h: h.remove(w); n += 1
    return n / max(1, len(words(ref)))


out, tot = [], {'dialogue': 0.0, 'mix': 0.0}
for c in cues:
    ref = lines.get(c['ref'] if c['ref'] in lines else c['id'], '')
    a, b = max(0.0, c['speech_rec_in_s'] - 0.3), c['speech_rec_out_s'] + 0.3
    row = {'id': c['id'], 'role': c['role'], 'from_s': round(a, 2), 'to_s': round(b, 2), 'text': ref}
    for k, f in srcs.items():
        hyp = decode(f, a, b)
        row[k] = {'hyp': hyp, 'recall': round(recall(ref, hyp), 3)}
        tot[k] += row[k]['recall']
    out.append(row)
    print(f"{c['id']} {ref!r}: dialogue {row['dialogue']['hyp']!r} ({row['dialogue']['recall']}) | mix {row['mix']['hyp']!r} ({row['mix']['recall']})")
n = max(1, len(out))
rep = {'cut': CUT, 'engine': 'pocketsphinx (BSD-2), default en-us model', 'lines': len(out),
       'mean_recall': {k: round(v / n, 3) for k, v in tot.items()},
       'lost_in_mix': [r['id'] for r in out if r['mix']['recall'] < r['dialogue']['recall']], 'rows': out}
os.makedirs(os.path.join(HERE, 'reports'), exist_ok=True)
json.dump(rep, open(os.path.join(HERE, 'reports', f'{CUT}-asr.json'), 'w'), indent=1)
print(f"mean recall: dialogue {rep['mean_recall']['dialogue']}, mix {rep['mean_recall']['mix']}; lost in mix: {rep['lost_in_mix'] or 'none'}")
