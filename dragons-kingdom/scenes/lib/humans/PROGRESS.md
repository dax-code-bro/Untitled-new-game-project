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

## Session 5 (2026-10-09, from ~08:00 UTC; resumed after the second usage-limit stop)

State found: all 48 caches built by the session-4 final queues + the beltband/beltseat/hairline
passes (07:18-07:27 on 10-08). Rendered hero + contact at preview (output/humans/s5/). Seen and
being fixed:
- Square "padded" shoulders on everyone: the rig lowers only the upper arm, the shoulder girdle
  stayed level (flat trapezius, a deltoid corner the coats followed). build.make_pose now runs a
  recipe twice: the 1st run gives the arm elevation, the 2nd starts from clavicles dropped (arm
  hanging, 0.16 rad) or lifted (arm raised) - IK targets and grips stay exact.
- Hairline: a 23/41-cycle wave cut a notch into the forehead (saw-tooth edge) and the roots were
  3.5x DENSER at the line (hard edge). Now small aperiodic wobble, density ramp 0.35 -> 1 over
  7 mm then a dense band, fewer/finer stray hairs (they read as black hooks at 4K).
- Band collars: first row leans in less (the crease printed a black slit under the collar).
- Hose poked through boot shafts (pale streaks): new pass `cullboots` (hose pulled 3 mm inside
  the shaft + culled under it). King's mantle printed the belt through it: new pass `overbelt`.
  Both run after every build (build.py) and were applied in place to the existing caches.
- Iron props read as chrome / crumpled foil (runtime: normal 0.35, oxide darkening), spear heads
  darker, crate weathered (props pass), sling linen darker. Abby's shirt darker linen.
- King's mantle 1.12 m (was 0.75: a stiff back panel); Alexandria's gown simulated at
  cloth_subdiv 1 (faceted bodice, under-bust ledge); Alexandria hero framed closer.
- Tested on single builds (suffix _sh/_ht/_sd, deleted after): shoulders 0.11 -> 0.16 rad
  (rounder deltoid, sloping trapezius); hairline reads as fine hairs over skin (no notch);
  Alexandria's gown: subdiv 1 alone crumpled the bodice into horizontal ripples, fixed by a
  fitted cut (hang 1.0) + `bodice_pin` 0.75 (new opt-in garment key: the torso above the waist
  follows the skinned shell); her clasped hands moved up/forward (forearms sank behind the skirt).
  Crop hair loft 0.009 (Remi 0.014: plastered down like a cap before). Nails less chalky (runtime).
- FULL REBUILD started 08:22 UTC: queues A/B over all ids (scratchpad humans/logs5/q_A|B.log,
  orders in order.txt / order_rev.txt), alexandria separately (q_C.log); stamp humans/stamp_s5.
  After a restart: rmdir cache/*.lock and re-run the same queue commands (finished ids skip).
- Rebuild done 09:15 UTC (48 ids, 53 min, 3 queues). Previews (output/humans/s5/c2_*.png
  contact, h2_*.png hero) showed: King's mantle edges caught by the gesturing arm (ragged dark
  patches on the sleeves) -> mantle thrown back (gap 2.0) + `cloakin` pass + no 'cull' under
  cloaks; a dark band across the mantle's back = AO baked while the belt poked through -> cloak
  passes now run BEFORE reao (build.py) and overbelt re-bakes the cloak AO; crate read as a pale
  grey box (Planks21 roughness map mean 0.68 not divided out -> rmean), kettle hats / spear heads
  still chrome-like -> darker oxidised iron/steel (runtime); shirt V reads as a flat bib ->
  shading-only folds (runtime `wrinkle` for 'shirt'); cloth AO floor 0.3 (black slits).
- Final 4K DONE (output/humans/final5/, git-ignored): hero-<shot>-4k.png + _1920.png + 1:1
  _crop-*.png for remi-abby, abby-cu, alexandria, king, crowd, abby-sling, abby-injured, fall
  (95-215 s per still); contact-1..7-4k.png (7 sheets, 11 min); riders-1..3-4k.png (7.5 min).
  npm test 33/33 (341 s) after the last code change.

Known (not fixed, for a successor): Abby's sling bands are smooth flat strips (no fabric
weight); Alexandria's gown has a small hole at the left hip (holefill misses it) and her right
sleeve bunches behind the arm; band collars still show a thin dark crease line at 4K; long
pulled-back hairlines are a bit even; riders' boots dangle (no stirrups in the creature saddle).

## Fix round 1 (2026-10-09, from ~15:05 UTC) - critic r1

Code changes (in progress; test builds use --suffix _t1, cache/<id>_t1.*):
- characters.py: costume + palette pass (canon first): Remi short muted-blue riding coat over dark
  trousers + knee boots, male face targets, side-parted crop; Abby coat dye with chroma
  (lin 0.05/0.085/0.04, hue ~105 deg), trousers, braid over the RIGHT shoulder, parting;
  Fall fitted near-black doublet (standing collar, short split skirts), gauntlets, tall boots,
  braided coronet, hands behind back; Alexandria wine gown pooling, girdle with gilt mounts,
  kerchief + veil over the head, slim fillet, hands folded (true clasp); King madder gown, fur
  tippet, gold chain of office, slim circlet, clumped salt beard; scout deep hood + face wrap;
  Cling palette (faded, warm) + second layers (aprons, shawls, capelets), belts and footwear
  varied, expressions (MakeHuman expression units), stooped/heavy/tall/short villagers.
- garments.py: trousers (gusset bridge, tuck into boots), skirt front overlap, gloves, face wrap,
  deep hood, deltoid-bridging sleeves, hands shrunk in the cloth collider (ghost-hand prints),
  navel bridged in the collider.
- build.py: belt kit (D-buckle + prong, keeper, curved tongue, girdle mounts, cord/sash knots,
  purse), chain of office, card QA (brow/lash fragments off the face), hem-rim UVs (striated
  veil edge), boot sole/crease masks, sling thickness + closed elbow pocket + bands over the neck.
- hair.py: parting, loose strands, clumping, salt-and-pepper, fine (vellus) flag, side-part crop,
  beard density falloff + moustache, coronet.
- recipes.py: belt hand, clasp, hands behind, spear contact + lean/shoulder variants, eat at the
  lips (bread roll), recorder/lute holds, pointing index along the forearm, injured cradle.
- props.py: rough board crate with nails, cloth parcel, pear lute with strings/frets/bridge/rose,
  kettle hat with rolled bead + riveted band, sagging reins / haul rope, bread roll.
- runtime: cloth.js fur, vertical quilting, boot sole/creases, hair salt/fine flags;
  materials.js T-zone oil only, wet lid margin, hand zones (aux3), deeper pores, warmer sclera,
  stronger limbal ring, card alpha cut. humans-review.js (quick side-by-side review scene).
Next: test builds -> review renders -> fix -> full rebuild (suffix _r1, swap) -> 4K finals in
output/humans/r1/.
- 16:20 UTC: test builds reviewed (output/humans/r1/rev_*: remi/abby/fall/king/alexandria/guards/
  recorder/sling/vendor/scout/parent/crowd), fixes applied (leg tubes, boot-rim cull, fitted circlet,
  girdle rosettes, doublet ease + buttons, sling offsets + darker linen, sword low + angled back,
  softer quilting, closed shawls, injured forearm above the belt band, scout deeper hood/wrap).
- FULL REBUILD started 16:20 UTC into suffixed caches (cache/<id>_r1.*, live caches untouched):
  three queues (scratchpad humans/r1logs/full_q1..3.log, stamp humans/stamp_r1):
    PY=<bpy> SUFFIX=_r1 sh scenes/lib/humans/offline/queue.sh <stamp> <ids...>
  After a restart: rmdir scenes/lib/humans/cache/*_r1.lock, re-run the same commands (done ids
  skip). When all 48 are built and reviewed: scenes/lib/humans/offline/swap.sh _r1 (old caches kept
  as *.prev.* until swap.sh _r1 --clean), then the 4K finals (scratchpad humans/finals.sh hero |
  contact | riders) into output/humans/r1/ (*-r1.png, *_1920.png, crops).
- 16:40 UTC: first _r1 outputs reviewed (rev_r1a): tucked trousers ballooned at the knee (leg tube
  now capped at the leg's own girth + 1.4 cm, taper 0.45), a pale scalloped hem band at the boot
  tops (no hem wear on the tucked rim), boots with ring wrinkles and dark blotches at the toe
  (cloth.js: creases only over the instep, broken; scuff broad and soft; no wear darkening round
  the sole), Fall's hands-behind read armless from the front (now a gloved hand on the belt),
  Remi's belt hand moved to his left (the two-shot is not one pose mirrored). abby, remi, fall,
  abby_ride_injured _r1 caches deleted so the queues rebuild them; abby_sling (started before the
  fix) to be rebuilt after (stamp humans/stamp_r1b).

## Fix round 1, resumed (2026-10-12, from 00:01 UTC, after a container restart)

State found: 21 of 48 `_r1` caches built (16:37-17:02 on 10-09); the other 27 and the post passes
added after them (circlet, hairunder, valleys) never ran. Stale locks removed, `_t*` test caches
deleted. Rebuild queues (scratchpad humans/r1c/q_A..G.log, stamps humans/stamp_r1c..f):
`PY=<bpy> SUFFIX=_r1 sh scenes/lib/humans/offline/queue.sh <stamp> <ids>` (NOTE: an in-place
post pass bumps a cache's mtime, so the queue then treats it as up to date - touch a new stamp
before queueing a rebuild of a post-fixed id).

New this session (each seen in a preview render, output/humans/r1c/):
- `beardFull` (materials.js + build.py + matpatch): the skin under a grown beard takes the beard
  colour (the watchman's beard read as orange skin speckled with short strands).
- Linen at linear luminance ~0.31 (aprons, coifs, kerchiefs, veils, folded cloth): `matpatch`
  pass patches existing caches (they clipped to flat paper white).
- Leather (cloth.js): warm brown under the grime, dust only low on the foot, finer flatter grain
  (boots read as grey rubber wellingtons / lumpy molten rubber).
- `boottop` pass: the boot shaft's top 5 cm seated over the leg cloth + slight flare (a pale
  scalloped band of trouser hem showed above every boot top). Boots only (not shoes).
- `legdrape` pass: trouser legs carried down from the thigh (taper 6 cm/m, at most 2.2 cm out,
  clear of coat skirts), runtime `wrinkle` folds: riding trousers instead of tights. Opt-out per
  garment `legdrape: False` (Queen Fall's fitted breeches). Runs before `boottop`.
- Head cloths (garments.head_shell): every opening's boundary relaxed along its loop (the hood's
  face opening was a 1 cm staircase cut from body-mesh vertices).
- Alexandria: `clasp` re-done as the right hand holding the left wrist (two splayed palms read as
  an odd gesture); fillet raised onto the hair (dy 0.064, tilt -0.16). King: deeper madder gown,
  shorter flatter crop (spiky grey hedgehog), circlet raised onto the hair.
Next: finish queues -> preview review of every id (review.sh in scratchpad humans/r1c) -> fixes
-> swap.sh _r1 -> 4K finals with r1 names in output/humans/r1/ -> npm test -> report.
- 01:15 UTC: more fixes (each seen in a preview): skin under the eyes takes the surrounding skin's
  chroma + luminance (mip-blurred photo; the fixed 'plain' tint made a pale concealer band), skin
  specular 0.62 / sheen 0.05; vellus hairline hairs not drawn (frosty fuzz band); gambeson quilting
  anti-aliased (staircase lines on the shoulders); spearmen without swords (hilt read as a peg);
  `injured_arm`: right hand wraps the left forearm from above, the hurt hand hangs limp; new passes
  `toebox` (riders' boots followed the toes: read as bare feet) and `hidefeet` (skin feet never
  drawn inside footwear); caruncles no longer crash on a laughing squint (crowd10 failed).
- 02:15 UTC: all 48 caches rebuilt with the fix-round code and swapped in (old ones kept as
  cache/*.prev.* - delete with `rm scenes/lib/humans/cache/*.prev*` once the round is accepted;
  ~1 GB). Further passes applied in place to every cache: `eyesplit` (white iris-less eyes on
  turned heads), `shirtarms` (shirt sleeves poked through coat elbows as grey patches),
  `braidfill` (braids read as a sparse black zig-zag), dye remap in `matpatch` (faded woad read
  cobalt, straw read chartreuse; Abby's coat measured at hue 133 deg in daylight -> dye
  [0.06, 0.085, 0.03], measured 102 deg in the hero render). Sling cradle ends at the hand's heel
  (its open end showed faceted black/white shards); hand in the sling curled. Crowd hero restaged
  (two heads lined up read as a kiss). Hair AO floor 0.35, wool wear toned down.
- Final 4K renders of this round: output/humans/r1/ (*-r1.png, *_1920.png, *_crop-*.png).
Next (for a successor): reins / stirrups belong to the creatures saddle (riders' hands open on a
bar); braids in shade still read near-black (hair albedo + no multiple scattering); King's beard
still pad-like at 4K; faces are still MakeHuman faces (expression units help, no sculpted detail).
- 03:15 UTC: DONE for this round. Final 4K in output/humans/r1/ (hero-*-r1, contact-1..7-r1,
  riders-1..3-r1 + _1920 + _crop-*); npm test 33/33 (234 s). Old caches (*.prev) deleted; the
  review renders (output/humans/r1c) deleted. Timings in README.

## PERFORMANCE track (2026-10-24, from ~15:00 UTC) - lip-sync, face, body motion, crowd

Built on the previous builder's snapshot (face.js units rig, rig.js IK toolkit, offline/lipsync_align.py,
data/face-units.json). New modules (all pure functions of t over a schedule set up in setup()):
- `visemes.js`: phones -> 9 articulators (jaw, close, round, spread, fv, th, tip, upper, press) with
  Cohen-Massaro dominance coarticulation, rest segments in pauses, a contact floor for p/b/m and f/v,
  loudness-scaled jaw, 40 ms visual lead; `visemeUnits()` maps onto MakeHuman units (tuned on renders:
  LipsKiss + UpperLipForward for rounding - lowerLipForward parts the lips; JawOpen 0.72 + JawDrop 0.2).
- `expressions.js`: 11 emotion unit sets (calm worry pain fear anger grief amusement surprise tender
  contempt determined) + `emotionFromDelivery()` (whole-word rules; the old python rules read
  "reaching" as pain, "saddle" as grief, "scold" as anger). lipsync JSON now stores `dl` (delivery
  note) + `scene`; refresh with `lipsync_align.py --meta-only` (seconds, no re-alignment).
- `faceperf.js`: face performer (say/mood/look/react/apply): lip-sync, emotion envelopes per line,
  brow raises + head nods on stressed syllables (envelope accents), blinks (spontaneous / phrase /
  gaze-shift, fear blinks more), gaze with fixation pattern on faces, aversion at line starts,
  lids follow the eyes (derived units <Side>LidsDown/Up/TurnLeft/Right in face.js).
- `motion.js`: body (place/walk/follow/trajectory/gesture/posture/stagger/fall/look/apply):
  gait phase table with planted feet (plant = trajectory at 41% of stance, 32% running), heel/toe
  roll, Hermite swing, pelvis lowered by the planted legs' reach (makes the walk's bob), spine
  counter-rotation, arm swing, gestures (point wave reach support cradle handsToFace protectHead
  flail carry explain), postures (crouch kneel cower hunch), falls, carryChild().
- `perform.js`: public API createPerformer() (performLine, walkPath, runPath, gesture, posture,
  lookAt, glance, mood, react, stagger, fall, carry, update) + directorFace() hook.
Node test harness (no browser): scratchpad eng1/perf/nodechar.mjs + walkstat.mjs / walkerr.mjs
(characters build in Node with a DOM stub; gait numbers: stance slip 0, IK error < 5 mm walking).

## PERFORMANCE track, session 2 (2026-10-27, from ~02:20 UTC) - director registration, proofs

State found: commits d277505 / 367a183 / 4c1328a (visemes, emotions, face performer, gait, crowd,
proof scenes, selftest-perf) - selftest green. Done this session (each checked by selftest-perf or a
render in scratchpad eng1/perf/):
- DIRECTOR REGISTRATION (director.js, new): loadCharacter() (index.js) registers the performance
  'face' action with scenes/lib/director/actions.js the first time a character loads, so every human
  in every director shot lip-syncs its placed takes (whole takes and parts of split takes: say()
  takes a `window` [a, b] of take seconds), carries the scene mood (SCENE_MOOD at 60 %), blinks, and
  looks along the blocking's eye-line. No director file changes. Verified: selftest (poseHuman jaw
  2.5 deg on a placed L015) and a director still (X2-02, birthing chamber) renders with the hooks.
  Also registered: the 'cradle' overlay (the director's blocking act 'cradle' now uses motion.js's
  cradle, sized from the build). Opt-in (needs a director change, REQUEST in the report):
  registerDirectorHooks({ legs: true }) registers planted-foot 'legs' (directorLegs: a body per actor
  and shot follows info.stateAt(tt) = the blocking as a function of time) - selftest: ankle travel
  on the ground 0.66 mm/frame vs 6.98 for the built-in offset gait on a curved walk.
- WORN PROPS OFF THE HANDS (loader.js rebindWorn): belts / buckles / purses / scabbards / chains /
  circlets / hats had hand and forearm weights wherever the drape pose rested a hand on them (the belt
  tongue stretched to Abby's moving hand as a long black strap); hair had upper-arm weights (Abby's
  braid over the shoulder swung with the arm). Moved at load time (bind pose unchanged): worn props to
  their other bones / the nearest torso bone, hair to the clavicle. Selftest checks no arm weights.
- CRADLE rebuilt (motion.js GESTURES.cradle): bodyRig now measures the torso's front surface (clothes
  included) and half width at spine02; the hurt forearm lies level across the lower ribs 4.5 cm clear
  of the clothes, the hurt hand hangs limp at the far edge, the good hand holds the forearm from below
  like a tray (palm up, fingers away from the body so their curl wraps the forearm). The old one put
  the forearm on the belt line with the hurt hand round the far hip and the good hand clawing the air.
  Pose dev scene humans-anim-pose.js (+ .json: id, acts, views) for this kind of iteration.
- gestureNow(ch, name, o, w, t, dt) and legsNow(body, t, post): motion.js entry points for posers
  that place the root / spine themselves (the director). reachDrop / solveLegs split out of applyBody.
- CROWD conversation groups (crowd.js `groups`): members stand on a ring (~1.1 m apart) round the
  group centre, face it, heads turn to the talker (the talk passes round every 2-4.5 s), the talker
  makes a point with a hand and looks round, smiles; broken up by the alarm. Crowd proof restaged
  with four groups, a cheerer, a waver, two wanderers (raised-arm drapes hang for wanderers).
- Alexandria L011 camera lowered (el -0.24: from beside the nest looking up into her bowed face), key
  light moved to the nest's side (the face models), exposure 0.15, L011 articulation amp 0.95 (0.85
  read mumbled in the draft strip).
- COARTICULATION (visemes.js): anticipation is now per articulator (ANTICIPATE: rounding 0.42 - it
  starts ~200 ms early, through the consonants; bilabial closure / press 1.5 and f-v 1.3 - they form
  in the last ~50 ms). With one factor, "weapon"'s EH was 43 % closed by the coming p (seen in the
  draft face strip, eng1/perf/clips2/alexA_sheet.png); now 18 %. Selftest: 340/340 closures, 333/333
  roundings still pass.
- Worn props also lose LEG weights (a purse at the hip followed the thigh); the purse sticking out
  sideways on Remi is its build shape (the hero render has it too), not motion.
- Cradle proof: Remi's support moved from "under her elbow" (the cradled elbow sits against her side,
  so the hand landed on her belly) to holding her left upper arm from outside.
- Dialogue proof: Abby's open left hand toward the hatchling on "ALL of it", Remi's one-brow /
  lip-corner reaction on his dry reply.
- SCULPTED MOUTH SHAPES (mouthshapes.js + tools/mouthmorphs.py): the 9 CC0 MakeHuman / MPFB2 mouth
  expression unit TARGETS (assets-lib/human/mpfb_targets_expression) as morphs on the skin, from a
  sidecar next to the cache (cache/<id>.mouth.json + .bin, ~0.5 MB; the cache stays byte for byte as
  built). mouthmorphs.py repeats the build's body construction (shape, joints, the character's pose,
  body_part with the targets as morph_rest, pose_parts) and refuses unless the rebuilt body matches the
  cache within 0.1 mm (all speaking characters: 0.000 mm); the runtime refuses another character's
  sidecar or one older than a rebuild (vertex count + position checksum). Seen one by one at unit
  weight (eng1/perf/pose/mshapes_sheet.png): compression = lips pressed thin, pursing = gathered
  pucker, protusion = flared trumpet lips (strong), eversion = lips rolled out, retraction = thin
  stretched closed lips, corner-puller = smile, depression = corners down, elevation = upper lip off
  the teeth, parling = lips parted over the teeth. Mapping (visemes.js `shapes`): compression
  0.3 close + 0.55 press, pursing 0.7 round (+ LipsKiss halved), protusion 0.35 min(round, 2 upper)
  (sh ch r), retraction 0.45 spread, elevation 0.3 upper, parling 0.3 on small jaw openings;
  emotions (expressions.js EMOTION_SHAPES): amusement corner-puller 0.45, grief depression 0.55,
  worry depression 0.18, pain elevation + retraction, anger / determined compression, fear
  retraction (bone corner pulls give 30 % back). L011 trace: "my" compression 0.52, "pretty" 0.67,
  "weapon" w pursing 0.50 then p 0.66.
- Alexandria close-up: f/2.2 -> f/3.2 and focus 8 mm nearer (the 4K still had the eyes sharp and the
  mouth soft: ~28 mm depth of field at 0.95 m with the 65 mm-equivalent lens).
- Cradle: the hurt hand's fingers fall together and flex like a hand at rest (curl 0.55-0.9, spread
  -0.05); with MakeHuman's splayed rest fingers the lighter curl read as a claw in cradle-4k.png.
- 4K stills reviewed (output/humans/perf/*-4k*.png, 1:1 crops): dlg (Remi mid-word turned to Abby,
  Abby's lips parted, eyes on the nest), cradle (forearm across the ribs, tray hand, Remi's hand on
  her upper arm), crowd (fleeing with hands to heads, motion blur), alex (re-rendered with the shapes).
- Inner-lip line: parted lips show a thin pale blue line along the inside of the lower lip under the
  chamber's cool top light (also faintly in the pre-shape 4K). Not the skin's specular, clearcoat or
  direct light (three shader trials at the lip line changed nothing visible; reverted). Not traced
  yet - next suspect the teeth / gum mesh's wet coat. Left for the look side.
Findings not fixed (look, not performance): the pulled-back hairlines show a band of scalp between
the hairline roots (6 cm above the eyes, normal) and where the strands get dense, most visible under
a low key light (Alexandria L011, Abby) - the hero renders show it too; hair build, not the rig
(forehead skin moves < 2.4 mm relative to the head under the face units).
Scratch: eng1/perf/dbg/*.mjs (Node harness perfload.mjs: load(id), perf, data; cradle.mjs,
legs.mjs, crowdgrp.mjs, hairline.mjs), eng1/perf/bin/mixvo.sh (VO beds for the clips:
mixvo.sh out.wav dur L011@1.0 ...).
Since then the director wired the planted feet in itself (a4edee2: `legs: 'planted'` per shot / actor,
info.plantedFeet + stateAt + seconds; the selftest passes plantedFeet too).
Outputs (output/humans/perf/, git-ignored): alex-4k / dlg-4k / cradle-4k / crowd-4k (.png 3840x2160,
_1920 downscales, _crop-* 1:1 crops), alex- / dialogue- / cradle- / crowd- / walk-draft.mp4 (960x540
draft clips, cinematic preview finish, voice takes muxed in). Mouth-shape sidecars are generated
caches (cache/<id>.mouth.*, git-ignored): re-run tools/mouthmorphs.py after any character rebuild
(the runtime refuses a stale one with a warning and falls back to bone-only mouths).
Next (for a successor): per-character mouth correctives (a wide AA still stretches the lip corners);
asymmetric shape variants (one-sided smiles); trace the inner-lip blue line; the director's speaking
shots still mostly frame faces from behind / in DOF (lip-sync exists now - their call); crowd faces
have no sidecars (no speech) - emotion shapes for crowd fear would need them (~50 s each).

## PERFORMANCE track, session 3 (2026-10-27, from ~09:30 UTC) - gait, mouth light, hands, crowd

State found: commits up to 8d1cdac (session 2), selftest green. Proof outputs in output/humans/perf/ were
from before the session-2 fixes (cradle-4k before the limp hand), the crowd draft never finished (its
job was left locked) and there was no walk clip. Done (each checked by a render or a selftest number):
- GAIT on normative curves (motion.js `GAIT` constants; scratch tools eng1/perf/s3/dbg/gait2.mjs +
  gaitsearch.mjs grid-search them against Winter's knee-flexion curve). Measured before: knee 18 deg at
  heel strike, 17 deg at toe-off, swing peak 66 deg at 80 % of the cycle, still 48 deg at 90 % -> the
  swing leg high-stepped (seen in walkA_sheet.png). Now: heel off at 70 % of stance, toe-off pitch ~62
  deg, the swing lift peaks early (q 0.2, beta-shaped decay) and the toe-off height falls to the strike
  height by q 0.8, the foot level by q 0.45; pelvis drop halved. Knee rms vs normative 18.2 -> 6.9 deg
  (remi 1.35 m/s), abby 21.5 -> 9.2, crowd03 23.6 -> 11.4, child 21.7 -> 11.1; slip still < 1 mm. The
  run is unchanged in shape (run = 1 keeps the old swing). Selftest checks rms < 10 and the swing peak
  at 65-80 %. Render: walkB_big.png (heel-rise push-off, early knee fold, straight leg into the strike).
- MOUTH: the blue line along the inner lower lip (session 2's open item) is the L011 rig's cool BACK
  light (a still with each light off: only shaft-off removes it, mc_lights2.png). The shadow maps cannot
  resolve the head over the mouth, so lips / mouth skin / teeth / tongue now take no direct light from
  behind the face (head-forward uniform per character in view space, lip-zone marker in mdepth). Gone
  in mc_fix3.png; enamel neutral (olive before). New lookdev scenes/lookdev/humans-anim-mouth.js (+json).
- HANDS: handShape's spread sign was inverted (positive closed) and 0 left MakeHuman's 31 deg rest
  splay, so every curled hand fanned; now 0 = relaxed (22 deg), -0.12 = together (11 deg, measured
  in dbg/spread.mjs). Cradle: hurt hand fingers together, gentle cascade curl; tray hand together.
  Seen in handC_sheet.png / hAC.png (pose dev scene, 4 views).
- CROWD: parent + child in the Cling proof (index 18 carries 19): they stand hand in hand (clasp
  between them, pure function of both baked roots), the parent stoops for the child at the alarm and
  runs for the arch with it on the hip; stumbles from hard shoves (stumble 0.35 of the shoved:
  flail + quick steps + gasp); crowd10 falls mid-flight and stays down. perform.carry is now order
  independent and a carried body has no gait of its own (its trajectory's stepping had lowered its
  pelvis 13 cm by the reach drop). Node check dbg/crowd3.mjs; selftest: wrists 14 cm, child 12 cm above
  the parent's pelvis, either update order, faller's head 0.19 m.
- Mouth-shape sidecar index (cache/mouth-index.json from tools/mouthmorphs.py): no 404 per crowd member.
- The crowd scene builds a lighter set below 2560 px wide (no hero-LOD focus, 2K shadow map): the
  draft page OOM-crashed twice while three director renders ran (the memory cgroup is shared: 15 GB).
Render queue (memory-gated, sequential): scratchpad eng1/perf/bin/q3.sh, logs eng1/perf/s3/q/*.log.

### Session 3, continued (11:30-) - proof renders, mouth interior colour
- Eye sockets: no back light on eyeballs / lashes / lid skin within 2.2 cm of the eyes (sparkling blue
  lower-lid lines in the 4K L011), direct specular occluded by baked AO in cavities, pore-slope
  (Toksvig-style) roughness - the glitter in and in front of the ear under the back light is gone.
- Mouth interior: the L011 draft read a teal mouth. Pixel values said the lower teeth were a
  warm-neutral grey (125,117,107) - teal only beside the saturated lips. The light inside the mouth is
  now tinted like the lips and tongue it bounces off (pink-warm, not ivory - a yellow tooth went olive
  before): teeth (130,111,100), the dark behind them reddish-black (ax_a/ax_b, scratch s3/rev).
- Draft clips with the takes muxed (aac): alex-draft.mp4 (108 frames, 23.5 min, 2 workers),
  dialogue-draft.mp4 (134 frames, 24.9 min), cradle-draft.mp4 (204 frames, 27.1 min). Checked frame
  by frame at the line times: L011 opens on "My" at 1.17 s and closes at 2.5 s (take 1.0-2.47 s);
  Abby's "It's gold." rounds on "gold" at 1.125 s and closes by 1.5 s; Remi's L015 2.0-2.75 s with his
  head turning to her; Abby turns up to him for L016 at 3.5 s; cradle: right hand under the hurt left
  forearm, left hand palm up with a soft curl, Remi's hand at her upper arm, "I'm standing" 6.3-7.3 s,
  then she turns to him.
- npm test: 43 pass, 1 skipped, 1 fail on the loaded machine; the failing one, (c3) stall watchdog with the long warm-up
  fixture, saw a 3 s gap in the warm-up heartbeat while three renders ran; alone it passes (runtime's).
- Crowd draft: OOM-killed three times in a row (the kernel's memory-cgroup killer, dmesg) while my
  dialogue draft and two director renders ran; the crowd now runs only after my other renders.
- Crowd draft (crowd-draft.mp4, 10 s on twos, 120 frames in 1 h 48 min with 1 worker, takes muxed):
  groups talk and wave 0-3 s, heads snap up at the alarm, the wave of flight runs west to the arch
  and east to the gate; the parent stoops for the child at 4.2 s, lifts it at 4.6 s and runs with it
  on the hip; a villager falls mid-flight and stays down (arms beside the head), one cowers; the
  square is nearly empty at 9 s. crowd-4k.png (final, t 5.2, 29 min): runners with arms over their
  heads, motion blur, the parent with the child on the hip (crop-carry), crop-flee.
- 4K stills re-rendered with the session-3 shading: dlg-4k.png (t 2.35, Remi mid-line, Abby looking
  down with a half smile, 10.5 min), alex-4k.png (t 1.95, "little weapon", 9.6 min): no lid sparkle,
  no ear glitter; the mouth interior has no pixel with blue >= red (it only read cool next to the lips).
- Walk proof: Remi's wave started at 7.44 s, after the cut to Abby at 7.0 (his walk ended at 6.54 s,
  measured in Node: scratch dbg/walkt.mjs). Shorter path from 0.3 s (ends 5.26 s), wave at +0.45 s,
  act cuts at 7.2 / 13.5 s (Abby's point was cut at 13 too). walk-draft.mp4 (30 s on twos, 360
  frames in 14 min, 2 workers): walk with heel strike / push-off, stop, turn, wave 6-7 s; run, slow,
  stop, point 8-13 s; kneel + reach 14-18 s; stagger 20 s, fall 22 s (prone, head lifted); the
  parent lifts the child onto her hip at 25-26 s and walks off.
- cradle-4k.png re-rendered with the session-3 shading (t 6.62, "I'm standing", 7.7 min): right hand
  under the hurt left forearm, left hand palm up with a soft curl, Remi's hand on her upper arm; mouth
  interior mean (37,15,11), no pixel bluer than red.
Outputs (output/humans/perf/, not in git): alex-draft.mp4, dialogue-draft.mp4, cradle-draft.mp4,
crowd-draft.mp4 (all with their takes), walk-draft.mp4 (no audio); alex-4k / dlg-4k / cradle-4k /
crowd-4k .png + _1920 + 1:1 crops (alex: face, mouth; dlg: remi, abby; cradle: arms, abby; crowd:
flee, carry).
- npm test at the end (machine quieter): 44 pass, 1 skipped (no pwsh), 0 fail; selftest-perf all passed.
- dialogue-draft.mp4 re-rendered after the mouth-interior tint (17 min on the quieter machine), same
  performance, the open "gold" reads dark-warm inside.
Next (for a successor): a crowd member in the south of the square still
stands at t 5.2 (late reactor - give the reaction wave a cap); the cradle framing cuts the top of
Remi's head; the Cling crowd page needs ~5 GB free (the set, not the people) - render it alone.
