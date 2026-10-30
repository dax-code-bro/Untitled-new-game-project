#!/usr/bin/env python3
# Episode 1 draft cut - VOICE SYNC CHECK: for every subtitle cue of an assembled cut (make-cut.mjs writes
# the .en.srt from the same cue times it lays the takes in at), the sound level just before the cue
# (-350..-50 ms) against the first 400 ms after it: speech must begin there. A line laid in late or
# early, a take missing from the mix or cut off at the shot's cut shows up as "BAD".
#
#   python3 episodes/s01e01/final/cut/check-sync.py <cut.mp4> [<cut.en.srt>]
#
# Needs ffmpeg on the PATH (the render kit's pinned one: render/lib/tools.mjs finds it for Node).
import sys, subprocess, wave, struct, re, math, os, tempfile
mp4 = sys.argv[1]; srt = sys.argv[2] if len(sys.argv) > 2 else mp4[:-4] + ".en.srt"
tmp = tempfile.mktemp(suffix='.wav')
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', mp4, '-ac', '1', '-ar', '8000', '-c:a', 'pcm_s16le', tmp], check=True)
w = wave.open(tmp); n = w.getnframes(); data = struct.unpack('<%dh' % n, w.readframes(n)); w.close(); os.remove(tmp)
SR = 8000
def rms(a, b):
    a, b = max(0, int(a * SR)), min(n, int(b * SR))
    if b <= a: return 0
    s = sum(x * x for x in data[a:b]); return math.sqrt(s / (b - a))
def db(x): return 20 * math.log10(max(x, 1e-6) / 32768)
cues = re.findall(r'(\d+:\d+:\d+,\d+) --> (\d+:\d+:\d+,\d+)\n(.+?)\n\n', open(srt).read() + '\n\n', re.S)
ts = lambda s: (lambda h, m, x: int(h) * 3600 + int(m) * 60 + float(x.replace(',', '.')))(*s.split(':'))
bad = 0
for a, b, text in cues:
    t0, t1 = ts(a), ts(b)
    pre, post, body = db(rms(t0 - 0.35, t0 - 0.05)), db(rms(t0, t0 + 0.4)), db(rms(t0, t1))
    ok = post - pre > 6 or pre < -50 and post > -45
    bad += not ok
    print(f"{'ok ' if ok else 'BAD'} {a}  pre {pre:6.1f} dB  post {post:6.1f} dB  line {body:6.1f} dB  {text[:50]!r}")
print(f"duration {n / SR:.2f} s, {len(cues)} cues, {bad} suspicious")
# subtitles vs voice takes: make-cut writes one subtitle per sentence of a take (vo/takes.json segments), so a
# take of two sentences gives two cues; say so, so a different count is not read as a missing take
import json, glob
here = os.path.dirname(os.path.abspath(__file__))
tag = os.path.basename(mp4)[:-4].split('draft-cut_')[-1]
rep = None
for f in sorted(glob.glob(os.path.join(here, 'cut-report*.json'))):
    try:
        r = json.load(open(f))
    except Exception:
        continue
    if r.get('audio') and f.endswith('cut-report-%s.json' % tag) or (rep is None and f.endswith('cut-report.json') and 'PROLOGUE' in tag):
        rep = r
if rep:
    takes = {t['id']: t for t in json.load(open(os.path.join(here, '..', 'vo', 'takes.json'))).get('takes', [])}
    split = [a['ref'] for a in rep['audio'] if len(takes.get(a['ref'], {}).get('segments', [])) > 1]
    print(f"{len(rep['audio'])} voice takes laid in -> {len(cues)} subtitle cues"
          + (f" ({len(split)} takes have more than one sentence, one cue each: {' '.join(split)})" if split else "")
          + ("" if len(cues) >= len(rep['audio']) else "  ** fewer cues than takes: a take without segments in vo/takes.json? **"))
