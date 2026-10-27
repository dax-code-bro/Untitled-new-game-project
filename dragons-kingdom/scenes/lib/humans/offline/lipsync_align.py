"""Phone timing for lip-sync: every Episode 1 voice take -> scenes/lib/humans/data/lipsync-s01e01.json.

    <python with pocketsphinx 5.1.1 + numpy + scipy + soundfile> -I scenes/lib/humans/offline/lipsync_align.py
        [--vo episodes/s01e01/final/vo] [--dialogue episodes/s01e01/final/dialogue.json] [--only L011,L014]

Per take (vo/takes.json, WAVs in vo/, word times in vo/words.json):
  1. phone-level FORCED ALIGNMENT with pocketsphinx (BSD, bundled US-English acoustic model + CMU
     dictionary): the take's own aligned words (words.json) are aligned again, then a second pass
     (`set_alignment`) gives every phone (ARPAbet, no stress) its start and duration at 10 ms. A fresh
     decoder per take (pocketsphinx adapts its cepstral mean from one utterance to the next - a shared
     decoder would make a take's result depend on the takes before it). Same 16 kHz conversion and the same
     breath skip (`breath_s`) as the take's word alignment (make_final_vo.py).
  2. FALLBACK when the phone pass fails for a take: each word's dictionary phones spread over the word's
     words.json window (vowels weighted x2.2, stops x0.7).
  3. a LOUDNESS envelope: RMS over 20 ms windows every 10 ms, in dB, mapped -45..-10 dBFS -> 0..63
     (one base64url character per 10 ms; the takes are level-matched to -20 dBFS voiced RMS).
  4. the line's DELIVERY note (dialogue.json `delivery` -> `dl`), its scene and addressee. The emotion mix
     is computed at runtime from `dl` + the performance preset (scenes/lib/humans/expressions.js
     emotionFromDelivery: whole-word rules, negations dropped), so there is one rule set, testable in
     Node; perform.js adds hand-set overrides for key lines and a per-scene mood.

    --meta-only   refresh only the delivery / note source / text / scene / addressee fields and the
                  shot -> scene map of an existing file (no re-alignment, seconds; run it after
                  dialogue.json or shotlist.json changes).

Deterministic (no random numbers; fresh decoders). Non-verbal placeholders (vo/nonverbal/NV-*.wav) get an
envelope only (no phones: an open, shaped mouth from the loudness).
"""
import argparse
import base64
import json
import os
import re
import sys

import numpy as np
import soundfile as sf
from scipy import signal

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..'))
OUT = os.path.join(HERE, '..', 'data', 'lipsync-s01e01.json')
SR = 48000
B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

# pronunciations for names / words missing from the CMU dictionary (the VO tools' own list + ours)
EXTRA_WORDS = {
    "bashion": "B AE SH AH N", "bashions": "B AE SH AH N Z", "verdor": "V ER D AO R",
    "nightwings": "N AY T W IH NG Z", "scrapper": "S K R AE P ER", "tara": "T AA R AH",
    "gawping": "G AO P IH NG", "hatchling": "HH AE CH L IH NG", "slitherwing": "S L IH DH ER W IH NG",
}
VOWELS = {'AA', 'AE', 'AH', 'AO', 'AW', 'AY', 'EH', 'ER', 'EY', 'IH', 'IY', 'OW', 'OY', 'UH', 'UW'}
STOPS = {'P', 'B', 'T', 'D', 'K', 'G'}

def envelope(x):
    hop, win = SR // 100, SR // 50
    n = max(1, int(np.ceil(len(x) / hop)))
    pad = np.concatenate([np.zeros(win // 2), x, np.zeros(win)])
    out = []
    for i in range(n):
        s = pad[i * hop:i * hop + win]
        r = np.sqrt(np.mean(s * s) + 1e-12)
        db = 20 * np.log10(r + 1e-12)
        out.append(int(round(np.clip((db + 45.0) / 35.0, 0, 1) * 63)))
    return ''.join(B64[v] for v in out)


def pcm16(x):
    y = signal.resample_poly(x, 1, 3)
    return (np.clip(y, -1, 1) * 32767).astype('<i2').tobytes()


def new_decoder():
    from pocketsphinx import Decoder
    d = Decoder(samprate=16000, bestpath=False, loglevel='FATAL')
    for w, pr in EXTRA_WORDS.items():
        if d.lookup_word(w) is None:
            d.add_word(w, pr, True)
    return d


def pron(d, w):
    p = d.lookup_word(w)
    if p is None and w.endswith("'s") and d.lookup_word(w[:-2]):
        p = d.lookup_word(w[:-2]) + ' Z'
        d.add_word(w, p, True)
    return p


def align_phones(x, words, offset):
    """[[phone, start_cs, end_cs]] over the file (times from file start) or None."""
    d = new_decoder()
    ws = [w['w'] for w in words]
    for w in ws:
        if pron(d, w) is None:
            return None, f'no pronunciation for "{w}"'
    pcm = pcm16(x)
    d.set_align_text(' '.join(ws))
    d.start_utt(); d.process_raw(pcm, full_utt=True); d.end_utt()
    if d.hyp() is None:
        return None, 'word pass failed'
    d.set_alignment()
    d.start_utt(); d.process_raw(pcm, full_utt=True); d.end_utt()
    out = []
    o = int(round(offset * 100))
    for w in d.get_alignment():
        for p in w:
            name = re.sub(r'\d', '', p.name)
            if name in ('SIL', '+NSN+', '+SPN+', '+BREATH+', '+COUGH+', '+UM+', '+UH+', '+NOISE+'):
                continue
            out.append([name, o + p.start, o + p.start + p.duration])
    if not out:
        return None, 'phone pass empty'
    return out, None


def spread_phones(words):
    """Fallback: dictionary phones spread over each word's window (times from file start)."""
    d = new_decoder()
    out = []
    for w in words:
        p = pron(d, w['w'])
        if not p:
            continue
        ph = re.sub(r'\(\d+\)', '', p).split()
        wt = np.array([2.2 if q in VOWELS else (0.7 if q in STOPS else 1.0) for q in ph])
        a, b = w['start_s'] * 100, w['end_s'] * 100
        edges = a + (b - a) * np.concatenate([[0], np.cumsum(wt) / wt.sum()])
        for q, s, e in zip(ph, edges[:-1], edges[1:]):
            out.append([q, int(round(s)), int(round(e))])
    return out


def meta(rec, dl, tk):
    """Delivery note, scene, addressee, text and where the note came from (dialogue.json / takes.json).

    dlsrc: 'hand' - a delivery note a person wrote or checked; 'auto' - dialogue.json filled `delivery`
    with the stage direction just before the line (context_source 'auto: ...'): it describes the scene,
    not how the line is said, so the runtime reads no emotion from its words (expressions.js) - only
    from a performance note in front of it ('quietly — ...' -> pn) and the take's preset.
    """
    rec.pop('emo', None)
    rec['dl'] = dl.get('delivery') or tk.get('performance', {}).get('delivery') or ''
    rec['dlsrc'] = 'auto' if str(dl.get('context_source') or '').startswith('auto') else 'hand'
    pn = dl.get('performance_note') or tk.get('performance', {}).get('performance_note')
    if pn:
        rec['pn'] = pn
    else:
        rec.pop('pn', None)
    if dl.get('text'):
        rec['tx'] = dl['text']
    rec['scene'] = tk.get('scene') or dl.get('scene')
    if dl.get('addressee'):
        rec['to'] = dl['addressee']
    else:
        rec.pop('to', None)


def shot_scenes(shotlist):
    """{shot id: scene} for the shots whose id prefix is not their scene (X7-01 is in 1E, R15-02 in 3C):
    the director's face hook reads the scene mood from it (a shot id alone does not say)."""
    if not os.path.exists(shotlist):
        return {}
    out = {}
    for sh in json.load(open(shotlist)).get('shots', []):
        sid, sc = sh.get('id'), sh.get('scene')
        if sid and sc and sid.split('-')[0] != sc:
            out[sid] = sc
    return dict(sorted(out.items()))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--vo', default=os.path.join(ROOT, 'episodes', 's01e01', 'final', 'vo'))
    ap.add_argument('--dialogue', default=os.path.join(ROOT, 'episodes', 's01e01', 'final', 'dialogue.json'))
    ap.add_argument('--only', default='')
    ap.add_argument('--out', default=OUT)
    ap.add_argument('--meta-only', action='store_true')
    ap.add_argument('--shotlist', default=os.path.join(ROOT, 'episodes', 's01e01', 'final', 'shotlist.json'))
    a = ap.parse_args()
    if a.meta_only:
        doc = json.load(open(a.out))
        takes = {t['id']: t for t in json.load(open(os.path.join(a.vo, 'takes.json')))['takes']}
        dlg = {l['id']: l for l in json.load(open(a.dialogue))['lines']}
        for lid, rec in doc['lines'].items():
            if lid in takes:
                meta(rec, dlg.get(lid, {}), takes[lid])
            else:
                rec.pop('emo', None)
                rec.setdefault('dl', rec.get('kind', ''))
                rec['dlsrc'] = 'kind'
        doc['shots'] = shot_scenes(a.shotlist)
        doc['emotions'] = 'computed at runtime from dl + preset (scenes/lib/humans/expressions.js)'
        with open(a.out, 'w') as fo:
            json.dump(doc, fo, separators=(',', ':'))
        print('meta refreshed', len(doc['lines']), os.path.getsize(a.out), 'bytes')
        return
    takes = json.load(open(os.path.join(a.vo, 'takes.json')))
    words = json.load(open(os.path.join(a.vo, 'words.json')))['lines']
    dlg = {l['id']: l for l in json.load(open(a.dialogue))['lines']}
    only = set(x for x in a.only.split(',') if x)
    prev = {}
    if only and os.path.exists(a.out):
        prev = json.load(open(a.out)).get('lines', {})
    lines = dict(prev)
    stats = {'aligned': 0, 'fallback': 0, 'envelope_only': 0}
    for tk in takes['takes']:
        lid = tk['id']
        if only and lid not in only:
            continue
        path = os.path.join(a.vo, os.path.basename(tk['file']))
        x, sr = sf.read(path, dtype='float64')
        assert sr == SR, (lid, sr)
        if x.ndim > 1:
            x = x.mean(axis=1)
        ws = words.get(lid, {}).get('words', [])
        breath = float(tk.get('breath_s') or 0)
        rec = {'role': tk['role'], 'dur': round(tk['duration_s'], 3), 'preset': tk['performance']['preset']}
        ph, why = (None, 'no words')
        if ws and not tk.get('placeholder'):
            ph, why = align_phones(x[int(round(breath * SR)):], ws, breath)
        if ph is None and ws:
            ph = spread_phones(ws)
            rec['phones_from'] = f'dictionary spread over words.json windows ({why})'
            stats['fallback'] += 1
        elif ph is not None:
            rec['phones_from'] = 'pocketsphinx phone alignment'
            stats['aligned'] += 1
        else:
            stats['envelope_only'] += 1
        rec['ph'] = ph or []
        rec['words'] = [[w['w'], int(round(w['start_s'] * 100)), int(round(w['end_s'] * 100))] for w in ws]
        if tk.get('cut_at_s'):
            rec['cut'] = tk['cut_at_s']
        rec['env'] = envelope(x)
        meta(rec, dlg.get(lid, {}), tk)
        lines[lid] = rec
        print(lid, rec['phones_from'] if ph else 'envelope only', len(rec['ph']), rec['dlsrc'], flush=True)
    for nv in takes.get('nonverbal_placeholders', []):
        if only and nv['id'] not in only:
            continue
        path = os.path.join(a.vo, 'nonverbal', os.path.basename(nv['file']))
        if not os.path.exists(path):
            continue
        x, sr = sf.read(path, dtype='float64')
        if x.ndim > 1:
            x = x.mean(axis=1)
        kind = nv.get('kind', '')
        lines[nv['id']] = {'role': nv.get('who', ''), 'dur': round(nv['duration_s'], 3), 'preset': 'nonverbal',
                           'kind': kind, 'ph': [], 'words': [], 'env': envelope(x), 'dl': kind, 'dlsrc': 'kind',
                           'scene': nv.get('scene')}
        stats['envelope_only'] += 1
    doc = {
        'schema': 'dragons-kingdom/lipsync v1',
        'episode': 's01e01',
        'generated_by': 'scenes/lib/humans/offline/lipsync_align.py',
        'source': 'episodes/s01e01/final/vo (takes.json, words.json, WAVs) + final/dialogue.json delivery notes',
        'units': 'times in centiseconds from the start of the WAV; env = 1 base64url char per 10 ms, 0..63 = -45..-10 dBFS RMS (20 ms window)',
        'phoneset': 'ARPAbet (CMU, no stress) from pocketsphinx 5.1.1 en-us',
        'emotions': 'computed at runtime from dl + preset (scenes/lib/humans/expressions.js)',
        'shots': shot_scenes(a.shotlist),
        'lines': dict(sorted(lines.items())),
    }
    os.makedirs(os.path.dirname(a.out), exist_ok=True)
    with open(a.out, 'w') as fo:
        json.dump(doc, fo, separators=(',', ':'))
    print(stats, os.path.getsize(a.out), 'bytes ->', os.path.relpath(a.out))


if __name__ == '__main__':
    main()
