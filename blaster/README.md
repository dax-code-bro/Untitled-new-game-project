# Foam Dart Blaster — 3D Printable, Parametric

A spring-plunger blaster that fires **standard foam darts** (Nerf Elite type).
Every part is parametric OpenSCAD code, so you can tune a dimension and
re-export instead of re-modeling.

## How to use these files
1. Install [OpenSCAD](https://openscad.org) (free).
2. Open a part in `parts/`, press **F5** to preview, **F6** to render.
3. **File → Export → Export as STL**, then slice for your printer.
4. All parts read shared dimensions from `params.scad` — edit that one file
   to change dart size, tolerances, or hardware sizes globally.

## Part list
| # | File | Prints? | Material (planned) |
|---|------|---------|--------------------|
| 1 | `parts/01_barrel.scad` | ✅ | CF-PLA / PETG |
| 2 | plunger tube | ⏳ | CF-Nylon / PETG |
| 3 | plunger head + rod | ⏳ | PLA + rubber seal |
| 4 | trigger + catch | ⏳ | CF-Nylon |
| 5 | priming handle | ⏳ | CF-PLA |
| 6 | breech / dart post | ⏳ | CF-PLA |
| 7 | magazine well | ⏳ | PETG |
| 8 | magazine + follower | ⏳ | PETG |
| 9 | shell halves (L/R) | ⏳ | PLA / PETG |
| 10 | grip | ⏳ | TPU / PLA |

## Buy list (not printable)
- Main plunger spring — ~18mm OD, ~90mm free length, 1.4mm wire
- Trigger return spring — ~6mm OD
- Magazine follower spring — ~10mm OD
- M3 screws (assorted 8–20mm) + a few M3 heat-set inserts
- 3mm steel rod for pivot pins
- A rubber/silicone O-ring or foam disc for the plunger seal

## Carbon-fiber printing notes
CF filaments are abrasive — **use a hardened steel nozzle** (0.4mm+), dry the
filament, and expect a matte finish. CF-Nylon is the toughest for the
trigger/catch and plunger tube; CF-PLA is stiffer and easier for the barrel
and priming handle.

> ⚠️ This is a **toy** that launches lightweight foam darts. Keep it looking
> like a toy (bright colors / orange tip), never point it at faces, and
> follow your local rules for toy blasters.
