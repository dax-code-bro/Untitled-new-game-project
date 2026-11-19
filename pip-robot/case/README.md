# PIP001 tower case (v3: the 4 Dells inside)

A modular case for PIP001. The four Dell Precision 3420 towers stack inside the bottom half as
**MISR001**. It's about **84 cm (2.75 ft) tall** and 32.6 × 32.6 cm wide, and every part fits on
a **Creality K2 Plus** (350 mm bed). Ready-to-print files are in `stl/`. Sizes can be changed in
`pip001_tower.scad` (open it in OpenSCAD).

```
        ┌──────┐     HEAD: AI camera eye, speaker grille, cable hole out the back
   ┌────┴──────┴────┐ ROOF: vents behind the head
   │ PIP001  [7" ]  │ display window, Raspberry Pi crib (back-left)
   ├────────────────┤ FLOOR (vented, 2 cord holes)
   │ MIDDLE         │ network switch, power strip, extra stuff
   ├────────────────┤ FLOOR (vented, 2 cord holes)
   │ MISR-B  ▒▒▒▒▒▒ │ Dell #3 + #4 (diamond grille front = air in)
   ├─ ring plate ───┤ (open middle: the Dells stack straight through)
   │ MISR-A  ▒▒▒▒▒▒ │ Dell #1 + #2
   └────────────────┘ BASE: 3 guide rails for the Dells, 4 caster-wheel pads
   Back: ONE magnetic door (3 printed panels glued together). Big grille behind the Dells
   for their hot air, cord notches on both edges, wide notch at the bottom for the power strip.
```

No extra fans: each Dell has its own, pulling air in through the front and out the back.
The Dells lie flat and slide in and out through the back door.

## Parts to print
| File | How many | Notes |
|---|---|---|
| `misr.stl` | **2** | MISR-A and MISR-B (identical) |
| `middle.stl` | 1 | |
| `pip.stl` | 1 | Display window |
| `plate_base.stl` | 1 | Prints pads-up. **Use 40% infill**, since it carries ~20 kg of Dells |
| `plate_ring.stl` | 1 | Between MISR-A and MISR-B |
| `plate_floor.stl` | 1 | Between MISR-B and middle |
| `plate_floor_pi.stl` | 1 | Between middle and PIP (crib screw holes) |
| `plate_roof.stl` | 1 | |
| `head.stl` | 1 | Prints top-down |
| `door_1.stl`, `door_2.stl`, `door_3.stl` | 1 each | Print as they come; glue the overlapping edges into one door |
| `dell_guide.stl` | 3 | Screw onto the base: front, left, right |
| `pi_crib.stl` | 1 | Holds the Pi 5 |
| `display_clip.stl` | 4 | Holds the screen |
| `pin.stl` | 12 | Long pins through the ring and floor plates |
| `pin_short.stl` | 12 | Short pins: base, roof, head |

**Slicer:** PETG (stronger, handles heat better) or PLA, 0.2 mm layers, 3 walls, 15% infill
(40% for the base). Parts are 326 mm wide, so there's no room for a brim on the 350 mm bed.
Roughly 3 kg of filament in total. Check the real numbers in the slicer.

## Also needed
- 24 × round magnets, 10 mm × 3 mm: 4 in each section's back columns, 12 in the door
  (4 per section). Glue them in, and check each pair attracts before the glue sets.
- 4 **locking** caster wheels rated for 10+ kg each, square mounting plates (hole spacing ~24–45 mm)
- 7" HDMI LCD (1024x600), a small network switch (5+ ports), a power strip with a switch
- M2.5 screws (Pi), M3 screws (crib, Dell guides), 16 mm push button (optional)

## Before printing everything
1. Print `pi_crib.stl` and `head.stl` first and check the Pi and AI Camera fit (camera hole
   pattern is a best guess: 21 x 12.5 mm).
2. **Measure one Dell lying flat** and set `DELL = [width, depth, height]` if it's different from
   290 x 293 x 93 mm.
3. **Measure your screen** and set `DISP_MOD` / `DISP_VIEW` before printing `pip.stl`.

## Tip: power buttons
The Dell power buttons end up behind the grille. In each Dell's BIOS (press F2 at startup), set
**Power Management → AC Recovery → Power On**. Then one switch on the power strip turns all four on.
