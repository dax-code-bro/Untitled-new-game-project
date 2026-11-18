# PIP001 tower case

A modular case for PIP001. It's about **75 cm (2.5 ft) tall** and 30 × 30 cm wide. Every part
fits on a **Creality K2 Plus** (350 mm bed). Ready-to-print files are in `stl/`, and you can
change sizes in `pip001_tower.scad` (open it in OpenSCAD).

```
        ┌──────┐     HEAD: AI camera eye, speaker grille, cable hole out the back
   ┌────┴──────┴────┐ ROOF: 120 mm exhaust fan (behind the head)
   │ PIP001  [7" ]  │ display window on the front, Raspberry Pi crib (back-left)
   ├────────────────┤ FLOOR (vented, 2 cord holes)
   │ MIDDLE         │ extra stuff
   ├────────────────┤ FLOOR (vented, 2 cord holes)
   │ MISR001        │ 3 x 80 mm fans on each side
   └────────────────┘ BASE: 4 caster-wheel pads + wire hole
   Back: ONE magnetic door (3 printed panels glued together) with cord notches,
   a power-button hole and a big notch for the power strip
```

The front is plain on purpose. All cords leave through the back door: 8 notches on each edge
(10, 16 and 24 mm wide) that a cord can slide into sideways, plus a wide notch at the bottom.

## Parts to print
| File | How many | Notes |
|---|---|---|
| `misr.stl` | 1 | Bottom section |
| `middle.stl` | 1 | Middle section |
| `pip.stl` | 1 | Top section, with the display window |
| `plate_base.stl` | 1 | Prints pads-up. Wheels screw to its 4 pads |
| `plate_floor.stl` | 1 | Between MISR and middle |
| `plate_floor_pi.stl` | 1 | Between middle and PIP (screw holes for the crib) |
| `plate_roof.stl` | 1 | 120 mm fan hole |
| `head.stl` | 1 | Prints top-down |
| `door_1.stl`, `door_2.stl`, `door_3.stl` | 1 each | Print flat as they come. Glue the overlapping edges into one door |
| `pi_crib.stl` | 1 | Holds the Pi 5 with M2.5 screws |
| `display_clip.stl` | 4 | Holds the screen against the window |
| `pin.stl` | 8 | Long pins through each floor plate |
| `pin_short.stl` | 12 | Short pins for the base, roof and head |

**Suggested slicer settings:** PLA or PETG, 0.2 mm layers, 3 walls, 15% infill, brim on the big
flat plates. Everything together is roughly 2.8 kg of filament. Check the real number in the slicer.

## Also needed
- 6 x 80 mm fans (sides), 1 x 120 mm fan (top). **Most PC fans are 12 V and can't run off the
  Pi.** Buy 5 V (USB) fans, or add a 12 V power adapter.
- 24 x round magnets, 10 mm x 3 mm: 4 in each section's back columns and 4 in each door panel
  (12 on the door). Glue them in, and check that each pair attracts before the glue sets.
- 4 caster wheels with square mounting plates (hole spacing about 24–45 mm), preferably locking
- 7" HDMI LCD (1024x600), M2.5 screws for the Pi, M3 screws for the crib, 16 mm push button

## Before printing everything
Print `pi_crib.stl` and `head.stl` first, and check that the Pi and the AI Camera fit (the camera's
screw-hole pattern is a best guess: 21 x 12.5 mm). **Measure your screen** and set `DISP_MOD` /
`DISP_VIEW` at the top of `pip001_tower.scad` before printing `pip.stl`. Then do the big sections.
