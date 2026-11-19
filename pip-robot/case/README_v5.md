# PIP001 tower v5: 5 drawers, cable column, two doors, anti-tip feet

Design file: `pip001_v5.scad`. Print files: `stl5/`. Every part fits the Creality K2 Plus (350 mm bed).
Interactive viewer: https://claude.ai/artifact/XErTgp5ppaZv5aGz2LVJsW

## What's new in v5
- **Fits 2016–2019 slim Dells:** Precision 3420 / 3430 and OptiPlex 3060 / 5060 / 7060 SFF
  (290 × 292.8 × 92.6 mm).
- **About 3.5 inches wider (41.4 cm).** The extra width is a separate **cable column** next to the Dells.
- **Zones:** each Dell has its own sealed bay. Air goes front → back only inside that bay. Cables go
  sideways through a port into the cable column, then out its back through **3-inch (76 mm)
  holes**, big enough for bulky USB-C and power plugs.
- **Up to 5 Dells**, each on its own **pull-out tray**. Open the back door and slide any Dell out
  on its own, like a staircase.
- **Two doors:** the **front door** (main) has every intake grille and the 7" LCD window. The **back
  door** (service) has the exhaust grilles and gives access to the drawers. Both are held on with magnets.
- **Anti-tip base:** 4 outrigger feet stick 4.5 cm past the tower, with rubber pads. A **ballast box**
  in the base takes sand bags or steel weights to keep the weight low.

## Tip-over numbers (5 Dells, ~5.3 kg each)
| | Without ballast | With 5 kg ballast |
|---|---|---|
| Total weight | 34 kg | 39 kg |
| Tilt angle before it falls (front/back) | 31° | 34° |
| Push at the top needed to tip it (front/back) | ~8 kg of force | ~9 kg |
| Push at the top needed to tip it (side) | ~10 kg | ~11 kg |

Below those numbers, gravity pulls it back down onto its feet. For real safety, also use a
**furniture anti-tip strap** to the wall (a few dollars), like you would for a dresser.

## Parts to print (full 5-bay build)
| File | How many | Notes |
|---|---|---|
| `bay_a.stl` | 1 per Dell (up to 5) | Dell bay: floor, side wall, divider |
| `bay_b.stl` | 1 per Dell (up to 5) | Cable column piece, bolts to `bay_a` (2 × M4) |
| `tray.stl` | 1 per Dell | Pull-out drawer. Handle faces the back |
| `ctrl_a.stl`, `ctrl_b.stl` | 1 each | Top level: network switch, USB hub |
| `base_a.stl`, `base_b.stl` | 1 each | Ballast box |
| `roof_a.stl`, `roof_b.stl` | 1 each | |
| `foot.stl` | 4 | Rubber pad under each (25 mm, stick-on) |
| `front_1/2/3.stl` | 1 each | Front door, glued at the overlaps |
| `back_1/2/3.stl` | 1 each | Back door, glued at the overlaps |
| `head.stl` | 1 | |
| `display_clip.stl` | 4 | |
| `pin.stl` | 30 (4 Dells) | 6 per joint between levels: 4 in the bay side, 2 in the cable side |
| `pin_short.stl` | 10 | Roof (6) and head (4) |

**Filament:** about **7.6 kg** for all 5 bays, or **6.7 kg** for 4 bays. Print only as many bays as you
have Dells, and add more later. Hidden parts (trays, base) can use white or gray to save black.

## Also needed
- 4 × M4 bolts + nuts per level (join `a` to `b`), 4 × M4 for the feet (nuts sit in the ballast box)
- 8 × 3 mm round magnets (4 per level on each door side)
- 8 × 25 mm stick-on rubber pads, sand bags or weights for the ballast box
- 7" HDMI LCD + DisplayPort-to-HDMI adapter, USB webcam, small network switch
- Leave **about 30 cm of slack** on each Dell's cables, so its drawer can slide out the back.
