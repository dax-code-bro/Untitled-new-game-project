# Humans - progress log (for a successor)

## State (2026-10-07, session 2, ~02:30 UTC)

Done (code committed; caches are git-ignored and rebuilt with offline/build.py)
- Offline library committed (was git-ignored as `build/` by the repo-root .gitignore; now `offline/`).
- Garments: drape envelope + bridged/smoothed hull (no anatomy under cloth), undergarment
  collider, sleeves as tapering tubes, cuffs gathered (sleeve stacking), belts / laced waists
  cinch wider cloth (gathers), V-necklines, band collars, clean openings, irregular skirt flutes,
  riding coats with front opening + back vent, hero cloth subdivision, self-collision on upper
  garments, pole relaxing (no puckers at the mesh poles), coif/cap gathers, kerchief tails.
- Riders: built in a seated dress pose (legs astride), skirts start flat and fall onto the thighs
  and a rising saddle collider; no ground plane at pelvis height (that bug held skirts up).
- Hands: real cylinder grips (every finger segment closes onto the object surface).
- Face: lid-margin / flush / under-eye / upper-lid masks (aux2), caruncles, eyelashes follow the
  blink morphs, cornea-only strong clearcoat, warm eye fill, iris desaturation, skin speckle.
- Hair: pulled-back flow over the crown, baby hairs at the hairline, scalp coverage from the
  strands (limited to above the hairline), hair kept under caps/coifs/hoods, soft alpha edges,
  tinted Kajiya-Kay highlights.
- Props: leather/wood/iron use only the scan's luminance variation when a colour is given.
- Cast: 48 ids (offline/characters.py), incl. 18-villager crowd kit, riders, Abby states.
- Runtime API: index.js (loadCharacter, placeCharacter, joinHands, setDust, rider + person adapters).
- Look-dev: humans-contact.js (7 sheets, turntable by frac(t)), humans-hero.js (8 hero shots),
  humans-riders.js (riders mounted on Leaf / Charcoal with the creature library), humans-dev.js.

## Session 3 (2026-10-07, from ~21:30 UTC)

Fixed after rendering the state left by session 2:
- Shirt band collars stood off the neck like a plate (pushed OUT to a hull radius whose height
  max-filter reaches the shoulders): now fitted to the neck's own cross-section, leaning in,
  smoothed round the loop. Non-simulated shirts get deterministic neckline gathers.
- Hairline: no bare temples (hairline comes down in front of the ear), ear exclusion only
  covers the ear, temple strands of pulled-back styles go back instead of up over the crown;
  hairline scalp tint is a darkened skin, not a grey mix.
- Face albedo de-lighting (`albg`, offline/humanbuild.albedo_gain): the MakeHuman photo
  textures carry the shoot's light and make-up at 1-5 cm (pale under the eyes, red lid crease):
  per-vertex RGB gain = 4.5 cm blur / 8 mm blur, lips + lash line excluded.
- mhclo parser: metadata lines ('tag') no longer end the vertex section (eyebrow010 failed).
- Lashes/brows cast no shadow-map shadows (they printed long streaks across the cheek).
- Sparse strand stubble (specks) replaced by stubble shading for Remi and a guard.
- Look-dev scenes: ground scans were stretched over the whole plane (loadPBR worldSize is
  the size UV 0..1 covers) - fixed; contact sheets quantise t to the frame (ghosting at k.0).

In flight / next
- Full rebuild of all 48 ids with this code started 22:12 UTC (3 processes, logs in the
  scratchpad humans/logs/full{1,2,3}.log). If interrupted: rerun build.py for ids whose
  cache json is older than offline/*.py.
- Then contact sheets + hero angles at preview, fix, final 4K + crops, npm test, README.
