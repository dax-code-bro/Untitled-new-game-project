"""Same 10 s phrase as the procedural sketch, as General MIDI, for FluidSynth + FluidR3_GM (MIT)."""
import struct
TPQ = 480                      # 60 bpm -> 480 ticks per second
def vlq(n):
    b = [n & 0x7F]; n >>= 7
    while n: b.append((n & 0x7F) | 0x80); n >>= 7
    return bytes(reversed(b))
ev = []                        # (tick, bytes)
def at(sec, data): ev.append((int(round(sec * TPQ)), bytes(data)))
def prog(ch, p): at(0, [0xC0 | ch, p])
def cc(sec, ch, c, v): at(sec, [0xB0 | ch, c, max(0, min(127, int(v)))])
def note(ch, k, v, t0, t1): at(t0, [0x90 | ch, k, v]); at(t1, [0x80 | ch, k, 0])
def ramp(ch, t0, t1, v0, v1, step=0.1):
    n = max(1, int((t1 - t0) / step))
    for i in range(n + 1): cc(t0 + i * (t1 - t0) / n, ch, 11, v0 + (v1 - v0) * i / n)
for ch, p in ((0, 43), (1, 42), (2, 48), (3, 49)):     # contrabass, cello, strings 1, slow strings 2
    prog(ch, p); cc(0, ch, 7, 100); cc(0, ch, 91, 90); cc(0, ch, 93, 30)
ramp(0, 0, 2.2, 20, 110); ramp(1, 0, 2.2, 20, 100)
note(0, 38, 80, 0.0, 10.0)                              # D2
note(1, 45, 70, 0.0, 10.0)                              # A2
ramp(2, 3.4, 5.5, 10, 70)
note(2, 50, 60, 3.5, 10.0); note(2, 53, 55, 3.5, 10.0)   # D3 + F3
ramp(3, 4.9, 5.5, 30, 95)
for k, t0, t1 in ((57, 5.0, 6.55), (62, 6.5, 7.65), (64, 7.6, 8.65), (65, 8.6, 10.0)):   # A3 D4 E4 F4
    note(3, k, 72, t0, t1)
for ch in range(4): ramp(ch, 8.4, 10.0, 100, 0)
ev.sort(key=lambda e: (e[0], e[1][0] & 0xF0 == 0x90))
trk, last = b"", 0
trk += vlq(0) + b"\xFF\x51\x03" + struct.pack(">I", 1_000_000)[1:]       # tempo 60 bpm
for t, d in ev: trk += vlq(t - last) + d; last = t
trk += vlq(int(1.5 * TPQ)) + b"\xFF\x2F\x00"
open("music_sketch_gm.mid", "wb").write(b"MThd" + struct.pack(">IHHH", 6, 0, 1, TPQ) + b"MTrk" + struct.pack(">I", len(trk)) + trk)
print("events", len(ev))
