# Humans - progress log (for a successor)

## State (2026-10-08, session 4 - see the newest section at the end first)

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

Later in session 3:
- Bust rounded in the cloth collider (coats tented into two points); asymmetric relaxed arms in
  the standing recipe; crop hair without the centre parting / forehead tuft.
- Skin: narrower wrap + translucency only where thin and back-lit (it painted red lids and a pink
  forehead), less sheen/oil, stronger pores + pore colour, lip grooves, neutral lid margin,
  lower lashes thinned (loader attribute lw), caruncle AO lifted.
- Sling: coat sleeve firmer + no self-collision for arm-across poses (shredded coat), band path
  smoothed / pushed out / lies flat. Alexandria's gown simulated as heavy wool.
- Child + crowd18 never built (no MakeHuman 'baby' proportions targets): skipped in macro_items.
- offline/queue.sh (restartable ordered builds), offline/regain.py (recompute the face albedo
  gain of built caches in place, 6 mm / 6 cm, seconds per character), stage.js (ground scan at
  real scale without visible repeats).

In flight / next
- Rebuild queue (scratchpad humans/logs/q*.log) finishing: abby_injured, fall, abby_ride,
  keeper1, watchman, guard1-3, sailor1-2, crowd18, child. Then run
  `regain.py <those ids>` (all others already regained) - regain must also follow any rebuild.
- Final 4K renders: humans-hero t = 0.5 .. 7.5, humans-contact t = 0..6, humans-riders t = 0.5,
  1.5, 2.5 -> output/humans/ (1920 downscales + 1:1 crops), npm test, README numbers.

## Session 4 (2026-10-08, from ~03:05 UTC; resumed after a usage-limit stop)

Caches on disk were complete (48 ids, built with the session-3 code; crowd05/crowd14 rebuild
was interrupted but their older caches are valid). Rendered the state, then fixed in place:
- offline/postfix.py (in-place passes, each recorded in the mesh's 'postfix' list, never twice;
  build.py now runs regain + every pass after each build, so a rebuild needs nothing else):
  - shoes: boots were foot shells with toes (toe socks / claws). Forefoot radius map seen from
    over the ball of the foot, grey-closed (fills the toe gaps), blurred, toe room added,
    vertices re-projected + relaxed, flat sole with toe spring -> a last-shaped toe box.
  - puckers: cloth inherited the body mesh's poles (nipple / navel stars) and sim crumples
    (armpits, crossed arms, sleeves). Found by the 2nd eigenvalue of the normals' scatter (a
    fold bends one way, a pucker all ways), filled by a membrane; nipple spots (breast-bone
    weighted apex) re-made as the quadric fitted round them; push-out from the layers under.
  - props: crate (was near-white), parcel, kettle hats / spear heads (read as chrome).
  - normals: orientation voted per mesh, not per vertex (toe-gap vertices came out inward).
- Hair (cloth.js): narrower Kajiya-Kay lobes, primary tinted by the fibre colour, less shine
  on the first part of each strand, roots fade in (the grey band + blunt ends at the hairline).
- Look-dev scenes choose the shot from the FRAME time (stage.js reviewTime): all shots of a
  scene render in one run with --fps 1 (frame k = shot k), no double exposure at cuts.
  humans-dev.js has feet (t 6) and hairline (t 7) views.

Later in session 4:
- LESSON: an in-place pass cannot be undone - the first pucker pass (plain membrane over big
  regions, body collider over-smoothed) collapsed whole sleeves into strings (guard captain) and
  let skin / shirts show through. Fixed algorithm: membrane never moves cloth more than 2 mm
  inward of where it was, collider = Taubin-smoothed body (limbs keep volume) using ALL body
  triangles (new cache field colliderIndex: the triangles hidden under clothes; runtime ignores
  it), push-out of every moved vertex, then fix_pushout (cloth outside the body and the layer
  under it). Because of the in-place damage EVERY character is rebuilt (queue started 04:10 UTC,
  order in scratchpad humans/logs/s4_full_order.txt, log s4_full.log, stamp stamp_s4full).
- Hoods rest on the crown (ease 1.4 cm, smoothed more, ear bulges flattened, drape folds,
  turned-back face edge); hoods and coifs hide the head under them (ears printed through).
- Sling: bands with 9 vertices across (rolled edges, wandering creases, twist), cradle folds and
  an elbow pocket, darker linen. Iron props keep their roughness (no chrome kettle hats).

- More post passes: `cull` (cloth under an opaque outer layer is not drawn - shirts poked
  through tunics at the nipples/elbows), `renormal` (welded normals over every cloth mesh - the
  seam between moved and stored normals shaded as dots). The bust is left out of the push
  colliders (body AND under-layers): pushing cloth out over it shrink-wrapped the breasts.
- Eyes: build.py dropped every eye face with u > 0.85 to remove the cornea shells - that also cut
  a wedge out of the RIGHT eyeball (hole in the inner corner when the eye rolls). Fixed (cornea =
  u > 0.85 AND v < 0.15); characters built before 04:55 UTC are rebuilt by queue C (stamp_eyes).
- Skin is double-sided (looking into the socket / a cuff showed the hair or sky through the head).
- Leather: roughness divided by the scan's mean roughness (boots/belts read as wet rubber).
- Hair: roots fade over the first 3% only (10% bared the temples of long pulled-back hair).

- Found: the pucker membrane also caught band collars (sharp on purpose) and pulled them into the
  neckline -> slits along every collar. Pucker smoothing now stops 5 cm below neck01. Also: cloth
  AO is re-baked after the passes (reao; the old crease AO printed dots), small holes / near
  seams are closed (holefill), patches wound inward are re-wound (renormal), cull keeps 3 rings
  round a garment's own openings and erodes 2 rings, sling bands narrower and smoothed.
- FINAL full rebuild started 05:58 UTC: three lock-aware queues (queue.sh now takes a per-id
  lock dir, cache/<id>.lock) over all 48 ids, stamp scratchpad humans/stamp_s4final, logs
  humans/logs/fin_A|B|C.log. After a crash: rmdir cache/*.lock, re-run the same queue command.
  build.py --nopost skips the post passes (debugging).

Next: when the queues are through: hero + contact + riders at preview, then final 4K + crops,
npm test, README numbers. Known look issues: Remi's square shoulders (drape envelope); hoods are
snug coif-like hoods; long pulled-back hairlines are a bit even.
