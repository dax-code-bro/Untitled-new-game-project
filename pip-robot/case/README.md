# PIP001 tower case

A modular case for PIP001. It's about **75 cm (2.5 ft) tall** and 30 × 30 cm wide. Every part
fits on a **Creality K2 Plus** (350 mm bed). Ready-to-print files are in `stl/`, and you can
change sizes in `pip001_tower.scad` (open it in OpenSCAD).

```
        ┌──────┐     HEAD: AI camera eye, speaker grille underneath
   ┌────┴──────┴────┐ ROOF: 120 mm exhaust fan on top (behind the head)
   │ PIP001         │ Raspberry Pi in its "crib" (back-left corner), status-light slots
   ├────────────────┤ FLOOR (vented)
   │ MIDDLE         │ extra stuff
   ├────────────────┤ FLOOR (vented, cable hole)
   │ MISR001        │ 3 × 80 mm fans on each side, front intake vents
   └────────────────┘ BASE (vented, feet)
   Back: one removable magnetic door per section (bottom door has the power button + cable hole)
```

## Parts to print
| File | How many | Notes |
|---|---|---|
| `misr.stl` | 1 | Bottom section |
| `middle.stl` | 1 | Middle section |
| `pip.stl` | 1 | Top section |
| `plate_base.stl` | 1 | Prints feet-up |
| `plate_floor.stl` | 1 | Between MISR and middle |
| `plate_floor_pi.stl` | 1 | Between middle and PIP (has screw holes for the crib) |
| `plate_roof.stl` | 1 | 120 mm fan hole |
| `head.stl` | 1 | Prints top-down |
| `door_misr.stl`, `door_middle.stl`, `door_pip.stl` | 1 each | Print flat |
| `pi_crib.stl` | 1 | Holds the Pi 5 with M2.5 screws |
| `pin.stl` | 8 | Long pins: join two sections through each floor plate |
| `pin_short.stl` | 12 | Short pins: base, roof and head |

**Suggested slicer settings:** PLA or PETG, 0.2 mm layers, 3 walls, 15% infill. The big parts
are slow (roughly a day each), and the whole tower takes roughly 2.5–3 kg of filament. Check
the real numbers in the slicer.

## Also needed
- 6 × 80 mm fans (sides), 1 × 120 mm fan (top), fan screws
- 24 × round magnets, 10 mm × 3 mm: 4 in each section's back columns and 4 in each door. Glue them
  into their pockets, and check that each pair attracts before the glue sets.
- M2.5 screws for the Pi, M3 screws for the crib, 16 mm push button (optional)

## Before printing everything
Print `pi_crib.stl` and `head.stl` first. Check that the Pi and the AI Camera fit (the camera's
screw-hole pattern is a best guess: 21 × 12.5 mm). Then do the big sections.
