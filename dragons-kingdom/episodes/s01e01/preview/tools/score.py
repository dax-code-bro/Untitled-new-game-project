#!/usr/bin/env python3
"""score.py - the preview's original score, written as code (S01E01, PROLOGUE through 1E).

Restrained and provisional. One motif carries everything (audio-plan.md section 6): a low D
drone, then a quiet rising line A - D - E - F that stops on F (minor colour, unresolved).
  M1   prologue end -> title: one low sustained string tone, then the restrained rising theme;
       resolves and falls away into the egg's scratch.
  M2a  1C: the lighter flight variant, higher register (harp, flute, high strings): private
       freedom, not a procession.
  M2b  1D: returns softly after Abby's silence; sparse under the dialogue; STOPS DEAD on the
       head-in-mouth beat (the screenplay's music pause).
  M2c  1D-25 -> 1E-01: returns softly, then fades out with no musical warning before the pass.
  M3   1E-17 -> end card: a low drone, not a triumphant cue.
Cue frames, fades and no-music windows come from edl.json (music, no_music_windows); this file
only decides the notes.

Rendering: the notes are written as a Standard MIDI File (60 bpm, 480 ticks per quarter, so
one tick = 1/480 s exactly) and played by FluidSynth 2.3.4 (LGPL-2.1+) with the FluidR3_GM
SoundFont (MIT, Frank Wen; Debian package fluid-soundfont-gm 3.1), its own reverb and chorus
off, then a synthetic hall (sfx_lib.reverb_ir, fixed seed). FluidSynth's fast render is
deterministic (same MIDI -> byte-identical WAV, checked).
"""
import hashlib
import struct
import subprocess
import tempfile
from pathlib import Path

import sys

import numpy as np
import soundfile as sf

sys.path.insert(0, str(Path(__file__).resolve().parent))   # python -I leaves the script dir out
import sfx_lib as fx  # noqa: E402

SR = fx.SR
SOUNDFONT = Path("/usr/share/sounds/sf2/FluidR3_GM.sf2")
SOUNDFONT_SHA256 = "74594e8f4250680adf590507a306655a299935343583256f3b722c48a1bc1cb0"
TPQ = 480                      # 60 bpm: 480 ticks per second
PROGRAMS = {"contrabass": 43, "cello": 42, "viola": 41, "strings": 48, "slow_strings": 49,
            "tremolo": 44, "harp": 46, "flute": 73}
NOTE = {n: i for i, n in enumerate(["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"])}
NOTE.update({"Db": 1, "Eb": 3, "Gb": 6, "Ab": 8, "Bb": 10})


def m(name):
    """'D2' -> 38 (C4 = 60)."""
    p, o = (name[:2], name[2:]) if len(name) > 2 and name[1] in "#b" else (name[0], name[1:])
    return 12 * (int(o) + 1) + NOTE[p]


class Score:
    def __init__(self, length_s, channels):
        """channels: {name: (channel, program, pan 0..127, volume 0..127)}"""
        self.length = length_s
        self.ch = channels
        self.ev = []           # (tick, order, bytes)
        for name, (c, prog, pan, vol) in channels.items():
            self._at(0, 0, [0xC0 | c, prog])
            self.cc(0, name, 7, vol)
            self.cc(0, name, 10, pan)
            self.cc(0, name, 11, 100)
            self.cc(0, name, 91, 0)     # no SoundFont reverb / chorus: the hall is ours
            self.cc(0, name, 93, 0)
        self.notes = []

    def _at(self, sec, order, data):
        self.ev.append((int(round(sec * TPQ)), order, bytes(data)))

    def cc(self, sec, name, num, val):
        self._at(sec, 1, [0xB0 | self.ch[name][0], num, max(0, min(127, int(round(val))))])

    def ramp(self, name, t0, t1, v0, v1, num=11, step=0.05):
        k = max(1, int((t1 - t0) / step))
        for i in range(k + 1):
            self.cc(t0 + (t1 - t0) * i / k, name, num, v0 + (v1 - v0) * i / k)

    def note(self, name, pitch, t0, t1, vel=64):
        p = m(pitch) if isinstance(pitch, str) else pitch
        c = self.ch[name][0]
        self._at(t0, 2, [0x90 | c, p, vel])
        self._at(t1, 0, [0x80 | c, p, 0])     # note-offs sort before note-ons at the same tick
        self.notes.append({"part": name, "pitch": p, "t0": round(t0, 4), "t1": round(t1, 4), "vel": vel})

    def chord(self, name, pitches, t0, t1, vel=50):
        for p in pitches:
            self.note(name, p, t0, t1, vel)

    def midi(self):
        ev = sorted(self.ev, key=lambda e: (e[0], e[1]))
        trk = b"\x00\xFF\x51\x03" + struct.pack(">I", 1_000_000)[1:]      # tempo: 60 bpm
        last = 0
        for t, _, d in ev:
            trk += _vlq(t - last) + d
            last = t
        trk += _vlq(int(self.length * TPQ) - last if int(self.length * TPQ) > last else 0) + b"\xFF\x2F\x00"
        return b"MThd" + struct.pack(">IHHH", 6, 0, 1, TPQ) + b"MTrk" + struct.pack(">I", len(trk)) + trk


def _vlq(n):
    b = [n & 0x7F]
    n >>= 7
    while n:
        b.append((n & 0x7F) | 0x80)
        n >>= 7
    return bytes(reversed(b))


# ======================================================================= the cues
def m1(dur):
    """Prologue end -> title. 0.0: one low sustained string tone (D2, basses and cellos).
    3.92 (EDL mark 'rising theme begins', frame 1805): A3 D4 E4 F4, stopping on F. The
    narrator's L004 sits on held notes (9.0-15.0 s); the theme restates an octave higher across
    the match cut to the grass (17.5 s), climbs to F5 under the title, then cadences
    Bb - A - Dm and resolves on D at 29.2 s, just before the EDL's fade-out (30.0-31.3 s)."""
    s = Score(dur + 4.0, {"contrabass": (0, PROGRAMS["contrabass"], 84, 110), "cello": (1, PROGRAMS["cello"], 78, 105),
                          "strings": (2, PROGRAMS["strings"], 70, 92), "slow_strings": (3, PROGRAMS["slow_strings"], 52, 100)})
    s.ramp("contrabass", 0.0, 3.5, 18, 96)
    s.ramp("cello", 0.0, 3.5, 18, 92)
    # the low sustained tone, then harmony under the theme
    for name, plan in (("contrabass", [("D2", 0.0, 11.55), ("Bb1", 11.5, 17.55), ("D2", 17.5, 24.05),
                                       ("Bb1", 24.0, 26.55), ("A1", 26.5, 29.25), ("D2", 29.2, dur + 1.5)]),
                       ("cello", [("D2", 0.0, 11.55), ("Bb2", 11.5, 17.55), ("D2", 17.5, 24.05),
                                  ("Bb2", 24.0, 26.55), ("A2", 26.5, 29.25), ("D2", 29.2, dur + 1.5)])):
        for p, a, b in plan:
            s.note(name, p, a, b, 72)
    s.note("cello", "A2", 3.92, 11.55, 56)          # the open fifth arrives with the theme
    s.note("cello", "F2", 11.5, 17.55, 48)
    s.note("cello", "A2", 17.5, 24.05, 52)
    s.note("cello", "F2", 24.0, 26.55, 50)
    s.note("cello", "E2", 26.5, 29.25, 50)
    s.note("cello", "A2", 29.2, dur + 1.5, 50)
    s.ramp("strings", 5.4, 7.5, 20, 80)
    for ch, a, b, v in ((["D3", "F3"], 5.5, 11.55, 44), (["D3", "F3"], 11.5, 17.55, 46),
                        (["D3", "F3", "A3"], 17.5, 24.05, 50), (["D4", "F4"], 24.0, 26.55, 52),
                        (["C#4", "E4"], 26.5, 29.25, 52), (["D3", "F3", "A3"], 29.2, dur + 1.5, 48)):
        s.chord("strings", ch, a, b, v)
    # the restrained rising theme (violins, slow strings)
    s.ramp("slow_strings", 3.8, 5.2, 30, 92)
    for p, a, b, v in (("A3", 3.92, 5.6, 62), ("D4", 5.5, 6.9, 64), ("E4", 6.8, 8.0, 64), ("F4", 7.9, 11.6, 66),
                       ("G4", 11.5, 13.6, 60), ("A4", 13.5, 17.6, 60),
                       ("A4", 17.55, 19.1, 64), ("D5", 19.0, 20.3, 66), ("E5", 20.2, 21.3, 68), ("F5", 21.2, 26.6, 70),
                       ("E5", 26.5, 29.3, 66), ("D5", 29.2, dur + 1.5, 62)):
        s.note("slow_strings", p, a, b, v)
    s.ramp("slow_strings", 21.0, 25.5, 92, 108)     # the high point lands under the title
    s.ramp("slow_strings", 29.4, dur + 1.0, 108, 50)
    for name in ("contrabass", "cello", "strings"):
        s.ramp(name, 29.4, dur + 1.0, 92, 45)
    return s


LIGHT_CHORDS = {   # D Dorian: the B natural (G major) is the 'light' colour of the flight variant
    "Dm": ("D2", ["D4", "F4", "A4"], ["D3", "A3", "D4", "F4", "A4", "F4", "D4", "A3"]),
    "Bb": ("Bb1", ["D4", "F4", "Bb4"], ["Bb2", "F3", "Bb3", "D4", "F4", "D4", "Bb3", "F3"]),
    "C": ("C2", ["E4", "G4", "C5"], ["C3", "G3", "C4", "E4", "G4", "E4", "C4", "G3"]),
    "G": ("G1", ["D4", "G4", "B4"], ["G2", "D3", "G3", "B3", "D4", "B3", "G3", "D3"]),
}
BPM = 76.0
BEAT = 60.0 / BPM


def light_bed(s, bars, t_start, dense_windows=(), sparse=False, harp_vel=52, pad_vel=40):
    """Harp arpeggios + high string pad + a soft cello root, one chord per bar."""
    for i, ch in enumerate(bars):
        root, pad, arp = LIGHT_CHORDS[ch]
        t0 = t_start + i * 4 * BEAT
        t1 = t0 + 4 * BEAT
        s.chord("slow_strings", pad, t0, t1 + 0.05, pad_vel)
        if i % 2 == 0:
            s.note("cello", root.replace("1", "2") if root.endswith("1") else root, t0, t0 + 8 * BEAT + 0.05, 40)
        for k in range(8):
            tk = t0 + k * BEAT / 2
            dense = any(a <= tk < b for a, b in dense_windows)
            if sparse and not dense and k % 2 == 1:
                continue
            s.note("harp", arp[k], tk, tk + 1.6, harp_vel - (6 if k % 2 else 0))


def light_channels(dur):
    return Score(dur + 4.0, {"cello": (0, PROGRAMS["cello"], 80, 80), "slow_strings": (1, PROGRAMS["slow_strings"], 60, 78),
                             "harp": (2, PROGRAMS["harp"], 42, 96), "flute": (3, PROGRAMS["flute"], 64, 88)})


def melody(s, t_start, phrase, vel=62):
    """phrase: [(beat, pitch, beats)] from t_start."""
    for b, p, d in phrase:
        s.note("flute", p, t_start + b * BEAT, t_start + (b + d) * BEAT - 0.02, vel)


def m2a(dur):
    """1C-15 -> 1D-02, no dialogue: the light theme carries the shots. The motif rises past F to
    G, A and (Dorian) B, the brightest the episode gets, and ends open on A."""
    s = light_channels(dur)
    bars = ["Dm", "Dm", "Bb", "C", "Dm", "G", "Bb", "C", "Dm", "Dm"]
    light_bed(s, bars, 0.0)
    s.ramp("flute", 0, 1, 88, 88)
    melody(s, 0.0, [(4, "A4", 2), (6, "D5", 1), (7, "E5", 1), (8, "F5", 3.5), (11.5, "E5", 0.5),
                    (12, "G5", 2), (14, "E5", 2), (16, "F5", 1.5), (17.5, "E5", 0.5), (18, "D5", 2),
                    (20, "B4", 1), (21, "D5", 1), (22, "G5", 2), (24, "F5", 2), (26, "D5", 2),
                    (28, "E5", 2), (30, "G5", 2), (32, "A5", 8)])
    return s


# dialogue windows inside M2b, seconds from its start (edl.json frames 10850..12129, measured
# when the cue was written; build_soundtrack.py re-checks that the flute never plays under a line)
def m2b(dur, quiet_windows):
    """1D-06 -> 1D-18. Opens on the same light bed, very soft; the flute speaks only in the
    gaps between lines (1D-06..1D-08 and 1D-14), the harp thins to quarter notes under speech.
    It does not end: the EDL cuts it dead at the head-in-mouth beat."""
    s = light_channels(dur)
    nbars = int(np.ceil(dur / (4 * BEAT))) + 1
    prog = (["Dm", "Dm", "Bb", "C", "Dm", "G", "Bb", "C"] * 4)[:nbars]
    light_bed(s, prog, 0.0, dense_windows=quiet_windows, sparse=True, harp_vel=46, pad_vel=36)
    # flute phrase 1 (open water, Abby's smile, Charcoal's immense beat): beats 4..13
    melody(s, 0.0, [(4, "A4", 2), (6, "D5", 1), (7, "E5", 1), (8, "F5", 4)], vel=54)
    # flute phrase 2 (1D-14: Leaf edges toward Charcoal), a playful turn, starting at ~47.6 s
    b0 = int(np.ceil(47.6 / BEAT))
    melody(s, 0.0, [(b0, "D5", 0.5), (b0 + 0.5, "E5", 0.5), (b0 + 1, "F5", 1), (b0 + 2, "E5", 0.5),
                    (b0 + 2.5, "D5", 0.5), (b0 + 3, "A4", 2)], vel=54)      # ends before Abby's "Don't start."
    return s


def m2c(dur):
    """1D-25 -> 1E-01: returns softly (harp + pad), the motif once on the flute, fading out."""
    s = light_channels(dur)
    light_bed(s, ["Dm", "Bb", "Dm"], 0.0, harp_vel=46, pad_vel=36)
    melody(s, 0.0, [(5.5, "A4", 1.5), (7, "D5", 1.5), (8.5, "E5", 1), (9.5, "F5", 4)], vel=50)   # after "Yes."
    return s


def m3(dur):
    """1E-17 -> end card: a low drone (D), tremolo strings at the edge of hearing; a low Bb
    enters under the bank and is left unresolved. Not triumphant: no theme, no rise."""
    s = Score(dur + 4.0, {"contrabass": (0, PROGRAMS["contrabass"], 84, 105), "cello": (1, PROGRAMS["cello"], 78, 100),
                          "tremolo": (2, PROGRAMS["tremolo"], 64, 80)})
    s.note("contrabass", "D2", 0.0, dur + 1.0, 70)
    s.note("cello", "D2", 0.0, dur + 1.0, 64)
    s.ramp("tremolo", 0.0, 2.5, 20, 70)
    s.chord("tremolo", ["A2", "D3"], 0.0, dur + 1.0, 46)
    s.note("cello", "Bb1", 3.6, dur + 1.0, 52)
    return s


# ======================================================================= render
def fluidsynth_version():
    out = subprocess.run(["fluidsynth", "--version"], capture_output=True, text=True).stdout
    return out.splitlines()[0].strip() if out else None


def check_soundfont():
    h = hashlib.sha256()
    with open(SOUNDFONT, "rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""):
            h.update(b)
    got = h.hexdigest()
    assert got == SOUNDFONT_SHA256, f"FluidR3_GM.sf2 sha256 {got} != pinned {SOUNDFONT_SHA256}"
    return got


def render(score, workdir, name, hall=True):
    """MIDI -> FluidSynth (48 kHz, 24-bit, reverb/chorus off) -> float stereo + our hall."""
    workdir = Path(workdir)
    workdir.mkdir(parents=True, exist_ok=True)
    mid = workdir / f"{name}.mid"
    mid.write_bytes(score.midi())
    wav = workdir / f"{name}_fluidsynth.wav"
    subprocess.run(["fluidsynth", "-ni", "-q", "-R", "0", "-C", "0", "-r", str(SR), "-O", "s24", "-T", "wav",
                    "-g", "0.5", "-F", str(wav), str(SOUNDFONT), str(mid)], check=True, capture_output=True)
    x, sr = sf.read(str(wav), dtype="float64", always_2d=True)
    assert sr == SR and x.shape[1] == 2
    if hall:
        ir = fx.reverb_ir(2.6, 3.2, fx.rng_for("ir", "hall"), 6000, 1100, predelay=0.025, early=(10, 0.06))
        wet = fx.convolve_st(x, ir)[: len(x)]
        x = 0.82 * x + 0.42 * wet * (np.sqrt(np.mean(x ** 2)) / (np.sqrt(np.mean(wet ** 2)) + 1e-12))
    return x, {"midi": mid.name, "midi_sha256": hashlib.sha256(mid.read_bytes()).hexdigest(),
               "fluidsynth_wav_sha256": hashlib.sha256(wav.read_bytes()).hexdigest(), "notes": len(score.notes)}


def build_cue(cue_id, dur, quiet_windows=()):
    if cue_id == "M1":
        return m1(dur)
    if cue_id == "M2a":
        return m2a(dur)
    if cue_id == "M2b":
        return m2b(dur, quiet_windows)
    if cue_id == "M2c":
        return m2c(dur)
    if cue_id == "M3":
        return m3(dur)
    raise KeyError(cue_id)


if __name__ == "__main__":
    out = Path(sys.argv[1] if len(sys.argv) > 1 else tempfile.mkdtemp())
    check_soundfont()
    for cid, d in (("M1", 31.29), ("M2a", 30.5), ("M2b", 64.63), ("M2c", 8.54), ("M3", 7.5)):
        sc = build_cue(cid, d)
        x, info = render(sc, out, cid)
        sf.write(str(out / f"{cid}.wav"), x.astype(np.float32), SR, subtype="PCM_24")
        print(cid, round(len(x) / SR, 2), info)
