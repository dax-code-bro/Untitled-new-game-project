# Creality K2 Combo

A home for everything about the printer — models to print, slicer settings
that work, and notes so nothing gets forgotten between prints.

## The printer

| | |
| --- | --- |
| **Model** | Creality K2 Combo (with CFS) |
| **Build volume** | 260 × 260 × 260 mm |
| **Max speed** | 600 mm/s |
| **Max acceleration** | 20,000 mm/s² |
| **Nozzle** | 0.4 mm standard · max **300 °C** |
| **Bed** | max **100 °C** |
| **Enclosure** | Fully enclosed CoreXY |
| **Multicolor** | CFS — 4 spools per unit, up to 4 units = 16 colors |
| **Extruder** | Direct drive |
| **Leveling** | Fully automatic |
| **Slicer** | Creality Print (OrcaSlicer also works) |

> The 300 °C nozzle cap is the main thing to keep in mind — it covers PLA,
> PETG, TPU, ABS and ASA comfortably, but rules out high-temp engineering
> filaments like PPS or PEEK.

## What's in here

| Folder | What goes in it |
| --- | --- |
| [`models/`](models/) | Your 3D model and print files — `.stl`, `.3mf`, `.gcode` |
| [`profiles/`](profiles/) | Slicer profiles and known-good settings per material |
| [`logs/`](logs/) | A running log of prints and printer maintenance |
| [`notes/`](notes/) | Calibration, CFS multicolor, and first-print guides |

## Start here

1. **[First prints](notes/first-prints.md)** — what to print first, in order
2. **[Calibration](notes/calibration.md)** — dialing it in (the K2 auto-levels,
   so there's less to do than on older printers)
3. **[CFS multicolor](notes/cfs-multicolor.md)** — getting the most out of the
   filament system, and what not to feed it
4. **[Settings](profiles/README.md)** — starting temps for each material

When a print comes out well, add a line to
[`logs/print-log.md`](logs/print-log.md) and save the settings — future you
will be grateful.
