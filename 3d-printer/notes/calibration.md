# Calibration — K2 Combo

The K2 handles the hard parts itself: **full auto-leveling**, vibration
compensation, and flow calibration are built in. So this is much shorter than
it would be on an older printer.

Let the machine run its own routines first. Only reach for the items below
when something specific looks wrong.

## Before every print

- [ ] Build plate is **clean** — wash with dish soap and warm water when parts
      stop sticking. Skin oils are the usual culprit, and alcohol alone
      doesn't remove them.
- [ ] Plate is seated flat and fully back against its stops
- [ ] Right filament loaded and **dry**
- [ ] Door shut for ABS/ASA · ajar for long PLA prints

## When to run the machine's routines

| Run auto-leveling again when | |
| --- | --- |
| You've moved the printer | |
| First layer looks uneven across the bed | |
| You changed or swapped the build plate | |
| After a nozzle change | |

## Reading a first layer

| What you see | Fix |
| --- | --- |
| Lines are round, separated, peeling up | Nozzle too high → lower Z-offset slightly |
| Surface is rough, ridged, translucent | Nozzle too low → raise Z-offset slightly |
| Flat, faintly glossy, lines just touching | ✅ Correct |
| Good on one side, bad on the other | Re-run auto-leveling; check plate is seated |

Adjust Z-offset in small steps — **0.02 mm at a time.**

## Fine-tuning (only if needed)

1. **Flow rate** — if walls bulge or gaps appear between lines. The K2 can
   calibrate this itself; do it per filament brand.
2. **Pressure advance** — if corners bulge or dip. Also auto-calibrated.
3. **Retraction** — the fix for stringing. Direct drive needs *less* retraction
   than a Bowden setup; try small distances first (~0.5–1 mm).
4. **Temperature tower** — worth doing once per new filament brand.

## My numbers

Record what works so you can get back to it.

- Z-offset: 
- PLA flow: 
- PETG flow / retraction: 
- Chamber notes: 

## Common problems

**Parts warping / lifting at corners** — bed too cool, or a draft. For ABS/ASA
keep the door shut and the bed at 90–100 °C. Add a brim.

**Stringing** — usually wet filament first, retraction second, temp third. Dry
the filament before you spend an evening tuning retraction.

**Layer shifts** — something's obstructing motion, or acceleration is too
aggressive for the part. Check for a knocked-over print or a loose belt.

**Clogs** — heat creep (long PLA prints in a hot closed chamber) or abrasive
filament through a brass nozzle. Crack the door for PLA; use hardened for CF.

**Nothing sticks anymore** — wash the plate with soap and water. This fixes it
far more often than any setting change.
