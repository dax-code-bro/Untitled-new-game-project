# Humans - progress log (for a successor)

## State (2026-10-07, session 2)

Done
- Offline library committed (was git-ignored as `build/` by the repo-root .gitignore; now `offline/`).
- Garments: drape envelope (loose garments hang from bust / shoulder blades, convex hull per
  slice), sleeves as tapering tubes, cuffs gathered to the wrist during the sim (sleeve stacking),
  belts cinch wider cloth in (gathers), V-necklines, band collars on shirts, boundary loops snapped
  to clean curves, irregular skirt flutes, cloth subdivision (hero), stable crc32 seeds.
- Cloth shading: sheen tinted by the dye (no grey cast on dark wool).
- Face: lid-margin / flush / under-eye masks (aux2), eyelashes follow the blink morphs, cornea-only
  strong clearcoat, warmer sclera; scalp coverage under hair computed from the strands.
- Full cast spec (48 ids) in offline/characters.py incl. 18-villager crowd kit, riders, Abby states.
- Runtime API: index.js (loadCharacter, placeCharacter, joinHands, setDust, rider + person adapters).

Next
- Build all characters (see README.md for the command), lookdev contact sheet + hero scenes,
  4K renders and crops, iterate faces/hair/gowns, npm test, report.
