# PIP001 tower case (v4: the 4 Dells are the brains)

A modular case for PIP001. The four Dell Precision 3420 towers stack inside the bottom half and are
the brains: **Dells #1–#3 are MISR001**, and **Dell #4 (~200 GB) is PIP001**. There's no Raspberry Pi. It's about **84 cm (2.75 ft) tall** and 32.6 × 32.6 cm wide, and every part fits on
a **Creality K2 Plus** (350 mm bed). Ready-to-print files are in `stl/`. Sizes can be changed in
`pip001_tower.scad` (open it in OpenSCAD).

```
        ┌──────┐     HEAD: AI camera eye, speaker grille, cable hole out the back
   ┌────┴──────┴────┐ ROOF: chimney vents behind the head
   │ PIP face [7" ] │ display window (screen plugs into Dell #4)
   ├────────────────┤ FLOOR (vented, 2 cord holes)
   │ MIDDLE         │ network switch, power strip, extra stuff
   ├────────────────┤ FLOOR (vented, 2 cord holes)
   │ MISR-B  ▒▒▒▒▒▒ │ Dell #3 (MISR) + Dell #4 (PIP001's brain)
   ├─ ring plate ───┤ (open middle: the Dells stack straight through)
   │ MISR-A  ▒▒▒▒▒▒ │ Dell #1 + #2 (MISR)
   └────────────────┘ BASE: 3 guide rails for the Dells, 4 caster-wheel pads
   Back: ONE magnetic door (3 printed panels glued together). Big grille behind the Dells
   for their hot air, cord notches on both edges, wide notch at the bottom for the power strip.
```

No extra fans: each Dell has its own. **Airways:**
1. **Front:** diamond grille in front of each Dell, so cool air goes straight into their fronts.
2. **Air seals:** fins in the front corners close the gaps beside the Dells, so hot air can't
   loop around the sides and get sucked back in.
3. **Back:** big grille in the door, plus side vents near the back, let hot air out.
4. **Chimney:** vented floors and roof vents let leftover warm air rise out the top.

The Dells lie flat and slide in and out through the back door.

## Parts to print
| File | How many | Notes |
|---|---|---|
| `misr.stl` | **2** | MISR-A and MISR-B (identical) |
| `middle.stl` | 1 | |
| `pip.stl` | 1 | Display window |
| `plate_base.stl` | 1 | Prints pads-up. **Use 40% infill**, since it carries ~20 kg of Dells |
| `plate_ring.stl` | 1 | Between MISR-A and MISR-B |
| `plate_floor.stl` | **2** | Between MISR-B and middle, and between middle and PIP |
| `plate_roof.stl` | 1 | |
| `head.stl` | 1 | Prints top-down |
| `door_1.stl`, `door_2.stl`, `door_3.stl` | 1 each | Print as they come; glue the overlapping edges into one door |
| `dell_guide.stl` | 3 | Screw onto the base: front, left, right |
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
- M3 screws (Dell guides, display clips)
- **A USB webcam** for the head's eye. The Raspberry Pi AI Camera only works with a Pi.
- **A DisplayPort-to-HDMI adapter.** The Dells have DisplayPort, and most cheap 7" screens use HDMI.
- A USB speaker (or one with a 3.5 mm plug) behind the head's grille

## Before printing everything
1. Print `head.stl` first and check your webcam fits the 16 mm eye hole.
2. **Measure one Dell lying flat** and set `DELL = [width, depth, height]` if it's different from
   290 x 293 x 93 mm.
3. **Measure your screen** and set `DISP_MOD` / `DISP_VIEW` before printing `pip.stl`.

## Tip: power buttons
The Dell power buttons end up behind the grille. In each Dell's BIOS (press F2 at startup), set
**Power Management → AC Recovery → Power On**. Then one switch on the power strip turns all four on.
