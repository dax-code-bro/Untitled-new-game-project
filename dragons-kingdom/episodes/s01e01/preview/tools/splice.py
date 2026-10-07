#!/usr/bin/env python3
"""splice.py - find and verify a silent word-boundary splice point inside a voice take.

Used for the one in-sentence cut in the preview: the narrator take L003 says
"The Citadel Sea and the Proxy Sea." in one breath, so build_edl.py opens a short pause
between "The Citadel Sea" and "and the Proxy Sea." to give the CITADEL SEA caption its own hold.
The cut must sit where the take is already (nearly) silent, so nothing is clipped.

  python3 -I tools/splice.py vo/L003.wav 5.37 5.59      measure: prints the pin for build_edl.py
  python3 -I tools/splice.py vo/L003.wav --at 254544    verify one cut sample

Method (stdlib only, deterministic): RMS in 5 ms windows at 1 ms hops over the search range;
the cut goes at the centre of the quietest window. Speech edges on either side are the last /
first window louder than -40 dBFS (the takes are normalised to -20 dBFS voiced RMS, so that is
20 dB under speech). Takes are 48 kHz mono 24-bit PCM (make_vo.py).
"""
import hashlib
import json
import math
import sys
import wave

WIN_S = 0.005
HOP_S = 0.001
SPEECH_DBFS = -40.0
MAX_CUT_DBFS = -50.0          # a cut louder than this (5 ms RMS) is not accepted as silent


def read_window(path, t0, t1):
    """samples (floats, full scale 1.0) of [t0, t1) seconds and the sample rate."""
    with wave.open(str(path), 'rb') as w:
        if w.getnchannels() != 1 or w.getsampwidth() != 3:
            raise ValueError(f'{path}: expected mono 24-bit PCM')
        sr = w.getframerate()
        n = w.getnframes()
        a = max(0, int(round(t0 * sr)))
        b = min(n, int(round(t1 * sr)))
        w.setpos(a)
        raw = w.readframes(b - a)
    out = []
    for i in range(0, len(raw), 3):
        v = raw[i] | (raw[i + 1] << 8) | (raw[i + 2] << 16)
        if v >= 1 << 23:
            v -= 1 << 24
        out.append(v / float(1 << 23))
    return out, sr, a


def rms_dbfs(xs):
    if not xs:
        return -math.inf
    e = sum(v * v for v in xs) / len(xs)
    return 10 * math.log10(e) if e > 0 else -math.inf


def level_at(path, sample, win_s=WIN_S):
    """5 ms RMS (dBFS) and peak (dBFS) centred on a sample."""
    with wave.open(str(path), 'rb') as w:
        sr = w.getframerate()
    h = win_s / 2
    xs, _, _ = read_window(path, sample / sr - h, sample / sr + h)
    pk = max((abs(v) for v in xs), default=0.0)
    return rms_dbfs(xs), (20 * math.log10(pk) if pk > 0 else -math.inf)


def measure(path, t0, t1):
    """Quietest 5 ms window in [t0, t1]: the cut sample, its level, and the speech edges around it."""
    pad = 0.05
    xs, sr, a = read_window(path, t0 - pad, t1 + pad)
    win, hop = int(round(WIN_S * sr)), int(round(HOP_S * sr))
    rows = []                          # (start sample (absolute), rms dBFS)
    i = int(round(t0 * sr)) - a
    stop = int(round(t1 * sr)) - a - win
    while i <= stop:
        rows.append((a + i, rms_dbfs(xs[i:i + win])))
        i += hop
    k = min(range(len(rows)), key=lambda j: (rows[j][1], j))
    cut = rows[k][0] + win // 2
    prev_end = next((rows[j][0] + win for j in range(k, -1, -1) if rows[j][1] > SPEECH_DBFS), None)
    next_on = next((rows[j][0] for j in range(k, len(rows)) if rows[j][1] > SPEECH_DBFS), None)
    rms, pk = level_at(path, cut)
    return {
        'sample': cut, 'time_s': round(cut / sr, 6),
        'level_dbfs_5ms_rms': round(rms, 2), 'peak_dbfs_5ms': round(pk, 2),
        'prev_speech_end_s': None if prev_end is None else round(prev_end / sr, 6),
        'next_speech_on_s': None if next_on is None else round(next_on / sr, 6),
        'search_s': [t0, t1], 'method': f'min 5 ms RMS at 1 ms hops; speech edges at {SPEECH_DBFS:g} dBFS',
    }


def sha256(path):
    with open(path, 'rb') as f:
        return hashlib.sha256(f.read()).hexdigest()


def main():
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    path = sys.argv[1]
    if sys.argv[2] == '--at':
        s = int(sys.argv[3])
        rms, pk = level_at(path, s)
        ok = rms <= MAX_CUT_DBFS
        print(json.dumps({'sample': s, 'level_dbfs_5ms_rms': round(rms, 2), 'peak_dbfs_5ms': round(pk, 2),
                          'silent_enough': ok, 'limit_dbfs': MAX_CUT_DBFS}, indent=1))
        sys.exit(0 if ok else 1)
    t0, t1 = float(sys.argv[2]), float(sys.argv[3])
    r = measure(path, t0, t1)
    r['take_sha256'] = sha256(path)
    print(json.dumps(r, indent=1))
    sys.exit(0 if r['level_dbfs_5ms_rms'] <= MAX_CUT_DBFS else 1)


if __name__ == '__main__':
    main()
