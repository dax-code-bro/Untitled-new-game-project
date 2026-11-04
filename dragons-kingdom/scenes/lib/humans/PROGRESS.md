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
  performance, the open "gold" reads dark-warm inside. alex-draft.mp4 likewise (14.9 min): at 1.67 s
  the lower teeth are (121,103,94) (were 120,114,104) and the band under them (72,62,51) (was an olive
  59,58,45); lip-sync timing unchanged (opens 1.17 s, closes 2.5 s).
Next (for a successor): a crowd member in the south of the square still
stands at t 5.2 (late reactor - give the reaction wave a cap); the cradle framing cuts the top of
Remi's head; the Cling crowd page needs ~5 GB free (the set, not the people) - render it alone.

## PERFORMANCE fix round (critic r1, 14 defects; 2026-10-29, three short sessions, low-usage budget)
Code for most defects landed in af75a6e + ab44473 (snapshot commits after usage stops); this
session verified them (selftest-perf: all passed, 40 s) and re-rendered the proofs.
Done (verified by selftest-perf unless noted):
- D0 cross-character targets pure in t: perform.js snapshot(t) (pass-1 pose per t, memoised) +
  updateAll(); lookdev dialogue/cradle/crowd and crowd.js use it; selftest "two-person look +
  support: a chunk's first frame == the sequential frame, either update order (max diff 0)".
- D1 mouth sidecars: offline/build.py now runs tools/mouthmorphs.py after every build (+ index);
  tools/check-mouth.mjs validates sidecars. NOT done (not our paths): pack-caches.mjs must ship
  cache/*.mouth.json, *.mouth.bin, mouth-index.json; render/gate.mjs must fail on a speaking
  character without a valid sidecar (call tools/check-mouth.mjs). -> REQUEST pc-kit/render owners.
- D2 lips: LIP_ZONE UV lip mask (redder, darker vermilion, wet lower lip), tooth crowns separated,
  darker gums, L011 focus between eyes and mouth at f/4.5. 4K recheck this session (alex t 1.95,
  final, 3 min; scratch eng1/perf-fix/alex2.png + alex2_mouth.png): the lips now READ as lips
  (vermilion (175,121,102) vs skin (167,106,90) below, a clear lip line, wet lower lip), the mouth is
  as sharp as the brows. The lower teeth still read grey-teal at 2x zoom though every pixel is warm
  (no pixel with G or B >= R): it is simultaneous contrast with the saturated lips at low luminance.
  This session: materials.js teeth occlusion starts deeper (vMouth 0.010-0.040 instead of
  0.006-0.034): teeth (96,82,73) -> (116,102,93); better, not solved. NEXT: push the shaded enamel's
  R/G toward ~1.25 (teeth indirect tint vec3(1.18,0.98,0.9) -> ~(1.3,0.98,0.85)) and lift the lower
  row to ~0.8x skin luminance; re-check the same crop (render ~3 min at final).
- D3 cradle: palm on the sleeve (0.7 cm), limp hurt hand fingers together, elbow in, Remi's
  support grip on the OUTSIDE of her sleeve (limbRadius), reframed (fov 24). Preview still
  t 6.62 checked this session (scratch eng1/perf-fix/cradle.png): Remi's head in frame, his
  fingers wrap the outside of her upper sleeve, hurt hand droops with fingers together, good hand
  palm-up under the hurt wrist, no forearm poke-through visible. The good hand's fingers still
  curl up a little "claw"-like at the wrist - a softer curl / more wrap over the top would help.
- D4 emotion: auto stage-direction notes skipped (dlsrc) + hand-set mixes; D5 nonverbal takes
  open the mouth from the envelope; D6 overlapping takes keep the first syllable; D7 director
  scene from shotlist.json; D8 director arm acts posed by the performance gestures (OVERLAYS in
  director.js); D11 face-reading saccades at full scale + microsaccades; D12 falls with prop
  drop / braced landing; D13 crowd verbs (crawl, push, drop flat, thrown, hand in hand, run during
  the lift) + reaction-delay cap (latest 0.49 s).
Open (next steps, in order):
1. D9: add `node scenes/lib/humans/selftest-perf.mjs` as its own test in test/run.mjs and to
   render/gate.mjs (not our paths -> REQUEST; it skips nothing yet when caches are missing: add a
   cache check that skips the body/mouth checks and keeps lip-sync/emotion/director ones).
2. D10 skirts (not started): ring of 6-8 secondary chains from the pelvis, damped spring baked in
   setup from pelvis + thigh trajectories (deterministic), re-weight long-skirt verts from thighs
   to chains (offline/build.py weight transfer or a runtime re-skin), clamp stride for long
   skirts, seated drape for a carried child. Check in humans-anim-verbs.js (run, kneel, fall).
3. Teeth colour (see D2 above). Re-render draft clips (alex, dialogue, cradle) to look at the new lips/cradle in motion;
   crowd draft needs the machine alone (~5 GB).
4. Cradle: soften the good hand's finger curl (motion.js GESTURES.cradle shape curl) so it wraps.
- npm test at the end of this session: 48 pass, 1 skipped, 0 fail (4.8 min).

## LOOK round 2 (2026-10-30, short session, low-usage budget) - faces: waxy skin, plastic eyes

Biggest 'video game' tell picked: the face skin was one even peach (no blood / pigment variation,
no redness at nose / cheeks / ears, no darkening under the eyes) and the eyeballs were lit evenly up
to the lid edge with a glossy iris (a glass ball pressed into the face). Fixed for the main cast in
the RUNTIME shaders only (no rebuild; face rig, mouth morphs, lip mask untouched; selftest-perf and
npm test green: 48 pass / 0 fail / 1 skipped).

What changed:
- `materials.js` skin: two-chromophore variation (haemoglobin at 1-5 cm, melanin at ~2 cm; uniform
  `uChrom`); stronger flush at cheeks / nose / chin / ears (aux2.r); clustered freckles on the flush
  zone, faded below pixel size (`uFreckle`); periorbital darkening, cooler / violet (`uUnderEye`, aux2.b);
  dual-lobe specular (0.55 x roughness*0.7 + 0.45 x roughness*1.3) instead of one mid-rough lobe;
  a small red 'blood line' just inside the terminator. (First try at 0.32 x diffuse painted an
  orange band down the side of the nose - now 0.05 / 0.008 / 0.002.)
- `materials.js` eye: lid + lash occlusion on the eyeball from the BIND normal's elevation
  (upper band e 0.1-0.4, lower lid, corners), applied to diffuse, specular and the cornea clearcoat;
  matte iris under the cornea (base roughness 0.7 on the iris, 0.32 sclera); fine red sclera vessels
  toward the corners + faint sclera mottling.
- `look.js` (new): per-character skin look table merged under the cache material in
  `loader.js materialFor` (abby: freckles 0.55, underEye 0.3 - a CHILD: clear fine skin; remi: freckles
  0.2, underEye 0.55, chromo 1.2; alexandria: underEye 0.8, chromo 1.1; others default).
- `scenes/lookdev/humans-dev.js`: `"light": "lamp"` mode (dark room, one ~1900 K point lamp with
  shadows keyed `lampAz` 50 deg off the lens, `lampI`, faint cool fill) = birthing-chamber lamplight test.

Renders looked at (preview 1920x1080, face 3/4 view t=1.5, scratch, not committed):
/tmp/claude-0/-home-user-Untitled-new-game-project/c24e42f5-3f85-5974-a286-53c4d569fb35/scratchpad/eng1/look/
c_b0_abby.png (before), c_b2_abby.png (after), c_b2_remi_alex.jpg (after; Remi out of focus - the
dev camera's focus sits at head+0.08 m and he is taller: set CFG.cam or a fstop for him). Result: a
visible step (mottled, redder nose/cheeks, darker sockets, lid shadow on the eyes) but NOT yet live
action - see next steps. Director still base_a15.png (1A-15, birthing chamber) shows the shot is a
medium-wide, faces are ~40 px there; the face close-ups matter most for 1A-14/15/22.

Exact next steps (in order):
1. Render the same view at 4K (`--preset final`, one still ~3-5 min on CPU) for abby / remi /
   alexandria with `"light":"lamp"` and crop 1:1: check pores + freckles resolve, no sparkle from the
   sharp lobe (mA roughness floor 0.1), the vessel pattern is not a regular grid (hN3 at 520/m).
2. Lips: still nearly skin-coloured under the lamp (lip tint 1.03/0.63/0.68 x0.85 reads pale in warm
   light) - raise saturation + darker vermilion border; check the performance track's lip mask (aux.r)
   is unchanged (selftest-perf 'lip colour zone').
3. Eyes: wet tear line (a thin bright meniscus along the lower lid - a separate strip mesh in
   offline/humanbuild or a lid-margin clearcoat band in skin aux2.g), caruncle pink in the inner corner
   (skin side, aux2.g x inner), iris parallax (offset vMapUv along the view vector projected on the
   gaze plane x depth ~0.5 mm) - needs the UV tangent frame of the eye texture.
4. Stubble for Remi / men with beardFull 0: the aux.b dots exist; check density at 4K.
5. Hair (helmet look): root-to-tip colour + flyaways in offline/hair.py (needs a Blender rebuild:
   `$PY -I scenes/lib/humans/offline/build.py --only remi`), anisotropic second highlight.
6. Clothing weave / wear / hem dirt, hands (nail plate spec, knuckle creases at 4K).
7. Abby's face reads too adult in 3/4 (cheek fat / nose / brow targets) - a MODEL change in
   offline/characters.py (age macro), needs a rebuild; coordinate with the performance track (morph
   targets are rebuilt with the body).

## LOOK round 2b (2026-10-31, short session) - lips, tear line, 4K check

FOUND + FIXED (the main reason lips read skin-coloured): `loader.js loadCharacterData` did not load the
lip mask (`data/lipmask-uv.json`); only `index.js loadCharacter` did. So `loadHuman` (riders),
`loadCrowd` (person()), `humans-dev.js` and `creatures-shots.js` built every face with NO lip colour zone
(aux.r = 0 on the lips). `loadCharacterData` now awaits `loadLipMask()` (cached, failures ignored).
This changes the lips in every director shot that uses riders / crowd - re-render faces in close-ups.
- `materials.js` skin: lips darker + more saturated under warm light (uniform `uLipSat`, default 0.6,
  per character via look.js `lipSat`), vermilion border 0.13; tear meniscus: `tearLine()` (lid-margin
  aux2.g x 1.2-9.5 mm below the eye centre x within 13.3-14.6 mm of it = the rim touching the globe;
  eye centres from loader `eyeC` -> `uEyeL/uEyeR`) adds a thin specular line in RE_Direct_Skin toward
  lights in front of the face (x10 x Fresnel).
- `humans-dev.js`: `"focusEye": true` (focus on the nearer eye; the head target is ~9 cm behind the
  eyes so at f/2.8 the eyes and lips were soft in every earlier close-up check), `"fstop"` override.
- selftest-perf 'lip colour zone' unchanged and green; npm test 48 pass / 0 fail / 1 skipped.

Renders looked at (scratch, not committed; Abby, `"light":"lamp"`, t=1.5):
/tmp/claude-0/-home-user-Untitled-new-game-project/c24e42f5-3f85-5974-a286-53c4d569fb35/scratchpad/eng1/look3/
k0_eyes.png / k0_lips.png (4K, old focus: everything soft), p2_lips.png (preview, no lip mask: skin-coloured
lips even at uLipSat 3), p3_lips.png (mask loaded, lipSat 1.0: coral / lipstick - too much),
k2_abby_4k.png + k2_eyes.png + k2_lips.png (4K final, focusEye, lipSat 0.6: rosy lips, pores resolve,
no sparkle seen on cheek / nose / forehead).

Seen, NOT yet fixed (exact next steps, in order):
1. Tear line barely visible in k2_eyes.png (one bright dot at the outer corner of the far eye): check
   the mask by painting it (temporary `diffuseColor.rgb = vec3(tl)` in map_fragment) on a preview with
   focusEye; if it is right, the lamp is simply not mirrored - widen the lobe (the meniscus is concave:
   use 0.3 x irradiance x smooth front term instead of a Fresnel mirror).
2. Lips at lipSat 0.6 are still a little coral + glossy for a CHILD (Abby): try look.js abby lipSat 0.4;
   the lower-lip wet clearcoat (0.16, performance track's) reads as lip balm now that the mask applies -
   REQUEST performance: re-check the lower-lip wet band with the mask loaded (it was tuned without? check).
3. A yellow-green line of teeth shows between the closed lips (k2_lips.png): teeth should be in deep
   shadow when the mouth is closed (materials.js teeth occlusion, uMouthOpen ~0).
4. Cheek pores read as uniform 'orange peel' at 4K under the lamp (k2_eyes.png right side): fade pore
   depth (0.00023) by 40% on the cheeks (aux2.r) and break it with a 1 cm fbm; check the forehead hotspot.
5. Lower lashes: a dotted row (alphaHash at sub-pixel, accumulate:false) - lashes `lower` 0.4 -> 0.25.
6. Caruncle (cache colour 0.72/0.42/0.40, teeth-kind material): reads brown-red in the far eye's corner;
   override to a wet pink (0.78, 0.45, 0.45) + clearcoat 1.0 in loader materialFor for m.name 'caruncle'.
7. Then the older list from round 2: stubble density (Remi), hair root-to-tip + flyaways (Blender
   rebuild), cloth weave / hem dirt, hands at 4K, Abby's child face (model change, rebuild).
Render recipe: humans-dev.json `{ "id": "abby", "accumulate": false, "still": true, "light": "lamp",
"focusEye": true }`, `node render/render.mjs --still scenes/lookdev/humans-dev.js --time 1.5 --preset
final --png <scratch>/x.png` (~60 s on this CPU box); crops with ffmpeg `-vf crop=1100:330:1300:1300`
(eyes) and `crop=900:360:1300:1780` (lips). Restore humans-dev.json afterwards.

## LOOK round 2c (2026-11-01, short session) - tear line found, child lips, teeth, pores, lashes, caruncle

DIAGNOSED (debug paint after `#include <dithering_fragment>` in skinMaterial, draft renders):
- The tear line's mask was the problem, not the lobe. The offline lid-margin mask `aux2.g`
  (humanbuild.py face_masks: 0.8-3.6 mm off the eyeball surface) lies on the rim's INNER face, against the
  globe: painted red it covered no visible pixel (eye macro at 8 px/mm). The eye-centre uniforms are right
  (bone p, drape pose). Painting distance in 1 mm rings showed the lower lid is nearly concentric with the
  eyeball; the visible lower rim is the 13.0-13.6 mm band from the eye centre on abby.
FIXED (materials.js / look.js / loader.js, runtime only, no rebuild):
1. `tearLine()`: mask = max(aux2.g, distance band 12.7-13.9 mm) x in front (z > centre + 6 mm) x the old
   dy window; highlight = colour x (0.1 + 0.45 (L.V)^2) x front (broad lobe, no Fresnel mirror). Now a faint
   pale line along the lower rim (k3_eyeR_x3.png), not one dot. Abby-measured band: CHECK on remi /
   alexandria (adult eyes / lids may sit at another radius - paint the rings, see recipe below).
2. look.js abby `lipSat: 0.4` (child: peach-pink, no coral / lipstick read; k3_lips.png).
3. Teeth: jaw closed the teeth take x0.35 light, back to full by uMouthOpen 0.06 (any speech opening).
   The yellow-green sliver between the closed lips is now a dark line (faint teal tint remains at its middle).
   RISK: uMouthOpen is jaw-only (face.js line ~100) - a smile that parts the lips with the jaw closed shows
   dim teeth. REQUEST performance: add a lip-part term to mouthU, or a separate uniform, if smiles need it.
4. Pores: depth x mix(0.35, 1.2) over a ~1 cm two-octave noise field, x0.6 on the cheeks (aux2.r).
   At 4K under the lamp the right cheek still reads pebbly - next: also reduce `poreScale` contrast in
   colour (the 'pores read in the colour' block) and the roughness stipple on the cheeks.
5. cardMaterial lower-lash opacity default 0.4 -> 0.25. Far eye's lower lashes still a dotted row at 4K
   (k3_eyes.png left eye): next try 0.15 and/or a wider alpha cut for lw = 1.
6. caruncle: loader materialFor overrides colour (0.78, 0.45, 0.45), clearcoat 1.0, rough <= 0.35.
   NOT yet verified on a crop (the inner corner still looks dark red-brown at 4K wide close-up: the baked
   AO floor 0.65 + mouth-less simple material) - check with the eye-macro camera below.
selftest-perf all passed (lip colour zone unchanged); npm test 48 pass / 0 fail / 1 skipped.

Renders looked at (scratch, not committed):
/tmp/claude-0/-home-user-Untitled-new-game-project/c24e42f5-3f85-5974-a286-53c4d569fb35/scratchpad/eng1/look4/
d2.png (lid mask painted: none visible), d3_crop.png (distance rings), d4.png (aux2.g / aux2.b / aux.r masks),
k3.png (4K final, focusEye, lamp) + k3_eyes.png, k3_lips.png, k3_eyeR_x3.png.
Eye-macro camera for lid / caruncle / lash checks (humans-dev.json, preview ~80 s, draft ~25 s):
`{ "id": "abby", "accumulate": false, "still": true, "light": "lamp", "cam": { "tgt": "eye.L", "off": [0,0,0],
"az": 20, "el": 0, "dist": 0.16, "fov": 22, "fstop": 8 } }` (note: focus stays on the head target, set
"focusEye": true too).

NEXT (in order):
1. Iris reads as vertical stripes / a slit at 4K (k3_eyeR_x3.png): check eyeMaterial iris texture mapping /
   the refraction offset; the sclera is flat grey - add a little vein tint + wet spec variation.
2. Caruncle crop check (eye macro) + the bright dot at the OUTER corner (not the tear line: present before).
3. Lower lashes 0.15 or thinner alpha; cheek pore colour / roughness stipple at 4K.
4. Tear line band on remi / alexandria (paint rings: temporary
   `gl_FragColor.rgb = vec3(clamp((d-0.011)/0.008,0.,1.), step(0.5, fract(d*1000.0)), dy<0.?0.6:0.)`).
5. The older list: stubble (Remi), hair root-to-tip + flyaways, cloth weave / hem dirt, hands at 4K,
   Abby's child face (model change, rebuild).

## LOOK round 2d (2026-11-01, short session) - iris / cornea / sclera / lower lashes

DIAGNOSED (eye macro, draft, debug paint of eyeI rings + texture channel):
- The "vertical stripes / slit" iris had three causes, none in the UVs (the eye UVs are round and centred
  on the texture iris, 0.1387 UV per unit vIris on every cache):
  a. The MakeHuman eye texture's iris ends at UV radius ~0.12 = vIris 0.87, but the shader's limbus
     (irisW, limbal ring, cornea zone) sat at vIris 1.0: a pale ring of texture sclera was tinted as iris
     between the texture's dark iris edge and the shader's limbal ring = two dark arcs either side.
  b. The iris was ~13 mm across (real 11-12 mm, also for a child): with the narrow lid aperture only a
     horizontal band of it shows, so pupil and rings read as vertical bars.
  c. The cornea clearcoat normal was n + 0.55 gaze: that FLATTENS the cornea into a mirror facing the
     gaze, so one big sky reflection washed the whole iris blue-grey (pupil and colour lost).
  There was no refraction offset at all in eyeMaterial.
FIXED (materials.js eyeMaterial only, runtime, no rebuild; API unchanged, two new optional options):
1. `eyeI = vIris / uLimbus` (o.limbus, default 0.77) drives irisW, the limbal ring, the cornea clearcoat
   zone and the cornea normal. Geometry-based zones (corner warmth, vessels, lid shadow, the far-atlas
   black fix) stay on vIris.
2. Iris zoom: the texture is read at ic + (uv - ic) * zs, zs = o.irisScale (1.13) easing to 1 between vIris
   0.9 and 1.3; ic = the nearer of the two mh_eyes atlas iris centres (0.2935, 0.300) / (0.705, 0.7025)
   (measured on the textures; all six mh_eyes maps share the layout). Iris now ~11.5 mm.
3. Refraction parallax: iris texels shift by -V_tangential * depth / 1.336, depth 2.6 mm x (1 - eyeI^2),
   mapped to UV with a screen-derivative cotangent frame (no tangents needed), clamped to 0.02 UV.
4. Cornea normal = normalize(n - 0.35 gaze) inside the limbus (r 7.8 mm cornea on a 12 mm globe): a
   small sharp catch-light in the pupil now (lamp: l2_x4.png).
5. Corneal sky occlusion: clearcoat indirect x mix(1, 0.22, smoothstep(-0.05, 0.45, R_world.y)) - the brow
   and lids hide the zenith; the iris keeps its colour in daylight.
6. Sclera: cool blue-grey band next to the limbus (thin sclera), broad warm/cool fbm patches, and an
   uneven wet film (clearcoat 0.55-0.8, roughness 0.04-0.1 by a 1 cm fbm) instead of a flat 0.4 / 0.12.
7. cardMaterial lower-lash opacity default 0.25 -> 0.15.
selftest-perf all passed; npm test 48 pass / 0 fail / 1 skipped.

Renders looked at (scratch, not committed):
/tmp/claude-0/-home-user-Untitled-new-game-project/c24e42f5-3f85-5974-a286-53c4d569fb35/scratchpad/eng1/look5/
e0_x4.png (before, daylight), dbg_x4.png (eyeI rings), e2_x4.png (sky occlusion), e3_x4.png (final,
daylight), l2_x4.png (final, lamp: round brown iris, round pupil, catch-light). Recipe: humans-dev.json
`{ "id": "abby", "accumulate": false, "still": true, "focusEye": true, "cam": { "tgt": "eye.L", "off": [0,0,0],
"az": 20, "el": 0, "dist": 0.16, "fov": 22, "fstop": 8 } }` (+ `"light": "lamp"`, az 30, fstop 11), draft
~20 s; crop `crop=260:100:340:240,scale=1040:400:flags=neighbor`. humans-dev.json restored afterwards.

NOT YET VERIFIED / NEXT (in order):
1. 4K check of the eye (preview/final preset, focusEye, both lights) - the fixes were judged at draft
   960x540 x4 crops only. Watch the derivative-based parallax for 2x2-quad blockiness at the limbus.
2. Sclera still reads grey (daylight ~ (135,132,125) sRGB next to a much warmer skin; lamp: grey-green):
   eyeLidO (up to 0.88 on direct diffuse) is probably too strong now that the cornea no longer mirrors
   the sky - try 0.6 max and a warmer indirect on the sclera; compare to a photo reference.
3. Iris still a little hazy at draft (desaturation 0.7 x irisTint): try 0.8 and a slightly lighter abby
   irisTint; check fibres at 4K.
4. Caruncle: at the eye macro the inner corner still reads as dark red-brown skin, no wet pink mound -
   the caruncle mesh may be hidden behind the lid skin; paint it (debug colour) to see where it is.
5. Bright tear-line dot under the iris in lamp light (l2_x4.png bottom centre): fine as a meniscus glint,
   but check at 4K that it is not one hot pixel cluster.
6. A few crowd/guard caches have the gaze axis 0.02-0.03 UV off the texture iris centre (eyes posed in
   the build): their limbal ring (gaze-based) and texture iris (texture-based) can be ~1.5 mm apart -
   check on guard3 / musician / crowd02 at a close-up; fix by centring eyeI on the texture iris if visible.
7. Older list from 2c: cheek pore colour / roughness stipple at 4K, tear line on remi / alexandria,
   stubble, hair root-to-tip, cloth weave, hands at 4K, Abby's child face (rebuild).

## LOOK round 2e (2026-11-02, short session) - 4K eye check, caruncle, iris, sclera

4K CHECK (final preset 3840x2160, humans-dev.json `{ "id": "<abby|remi>", "accumulate": false, "still": true,
"light": "lamp", "focusEye": true }`, abby ~50-85 s, remi ~32 s; eye crops `crop=800:260:1300:1260` (abby),
`crop=820:260:1260:1220` (remi)): round iris + pupil + catch-light hold at native 4K on both; no 2x2 blockiness
visible at the limbus from the derivative-based parallax.
DIAGNOSED:
- Caruncle: the cache mesh (build.py caruncles(), kind 'teeth') is BURIED. X-ray debug (MeshBasicMaterial
  green, depthTest false) showed it under the upper lid at eye-centre height; moved down 3 mm / medial 3 mm /
  forward 2-3.6 mm it was still hidden, because the SKIN mesh itself closes the inner canthus (the dark
  'wedge' is lid skin). Geometry shift reverted (loader.js unchanged in the end).
- The visible inner-corner wedge is 15-18 mm from the eye-centre uniform (debug rings), not 11-14 mm.
- Sclera grey-olive in lamp light: the eyeLidO cap change did NOT move the sampled sclera pixels at all
  (abby 150/112/71 before and after; cheek 192/126/81) - the lid term is ~0 on the middle / lower white.
  So the remaining darkness is albedo x AO, not lid occlusion.
FIXED (materials.js only, runtime, no rebuild, API unchanged):
1. skinMaterial: `caruncleM(p)` - the canthus skin wedge is painted as caruncle: distance band 13.5-18 mm
   from the nearer eye centre x medial (mx > ~10 mm) x eye height window (-5.5 .. +2 mm) x in front of the
   globe centre; albedo -> (0.62, 0.30, 0.29) and a wet glint (0.7 x mask added to the tear-line specular).
   Verified at 4K: pink wet inner corners on abby and remi.
2. eyeMaterial: iris desaturation mix 0.7 -> 0.8 (slightly richer iris; verified, small change).
3. eyeMaterial: eyeLidO upper 0.8 -> 0.6, lower / corner 0.35 -> 0.25, cap 0.88 -> 0.6 (no visible effect in
   the lamp test - kept as harmless; it only lightens the band under the upper lid).
selftest-perf all passed; npm test 48 pass / 0 fail / 1 skipped.
Renders (scratch, not committed): /tmp/claude-0/-home-user-Untitled-new-game-project/c24e42f5-3f85-5974-a286-53c4d569fb35/scratchpad/eng1/look6/
abby_eyes_before_after.png, remi_eyes_before_after.png (top before, bottom after, native 4K crops),
dbg_car2.png / m2_pair.png (caruncle x-ray), m4d_c.png (distance rings), m5_pair.png (mask debug | result).

NEXT (in order):
1. Abby's NEAR eye caruncle glint is a little too bright / pale at 4K (reads as a white blob at the corner):
   lower the specular share 0.7 -> 0.35 and check again at 4K (same recipe). Check remi's near corner too.
2. Sclera albedo / AO: sample the eye mesh's baked `ao` on the visible white (eye macro debug paint of vAO);
   if it is ~0.5-0.7, lift `directDiffuse *= mix(1, aoV, 0.6)` to 0.3 and the indirect floor; else raise
   uScleraTint (0.93, 0.87, 0.8) toward (0.97, 0.93, 0.88). Target: white ~ cheek luminance in the lamp.
3. Lower lashes still read as a dotted stipple under the near eye at 4K (abby + remi): alphaHash at sub-pixel
   width - try thicker, lighter lower lash cards or a cut [0.1, 0.5] for lw = 1, or drop opacity to 0.08.
4. Delete or rebuild-out the buried caruncle mesh (build.py caruncles) on the next rebuild - it costs nothing
   visible now; or move the build's placement to the 15-18 mm canthus if a rebuild ever opens the corner.
5. Older list (2d items 5-7, 2c): tear-line band on remi / alexandria, crowd gaze-axis offsets, cheek pore
   stipple, stubble, hair root-to-tip + flyaways, cloth weave / hem dirt, hands at 4K, Abby's child face.

## LOOK round 2f (2026-11-02, short session) - sclera, caruncle glint, lower-lash stipple

Recipe as 2e (final preset 3840x2160, humans-dev.json abby/remi, `"light": "lamp"`, `"focusEye": true`; abby
crop `crop=800:260:1300:1260`, remi `crop=820:260:1260:1220`; sample pixels with ffmpeg crop + scale=1:1:flags=area).
DIAGNOSED:
- Eye baked AO (debug paint of vAO in eyeMaterial, colour bands): the visible white is 0.85-1.0 almost
  everywhere; only the corners / lid-adjacent rim fall to 0.5-0.85. So AO was NOT what made the white grey.
  The white's effective albedo was too low: in lamp light sclera 147/109/69 vs cheek 188/113/71 (G and B
  below the skin's) - read as olive-grey.
- Lower lashes: the stipple was uLower (0.15) opacity going through alphaHash at sub-pixel width. Drawing the
  lower row opaque showed the MakeHuman card prints a dense, long mascara row (UV debug: u runs along the lid).
FIXED (materials.js only, runtime, no rebuild, API unchanged):
1. eyeMaterial: default uScleraTint (0.93, 0.87, 0.8) -> (1.0, 0.93, 0.87), and the sclera term is x1.3
   (clamped to 1) - `min(diffuse * mix(uScleraTint * 1.3, uIrisTint, irisW), 1)`. directDiffuse AO share
   0.6 -> 0.35. Lamp sclera now 167/129/88 (cream, a touch below the cheek in R, above in G/B); daylight
   (default HDRI) clean warm white, not paper.
2. skinMaterial: caruncle glint share 0.7 -> 0.35 (no more white blob at Abby's near inner corner).
3. cardMaterial (lower lashes, lw = 1): binary alpha (step(0.7, a) - only strand cores, tips drop off),
   a 35% strand keep by a hash of 0.25 mm bins along the bind-pose x (new varying vLashX; 0.6 mm bins kept
   clumps), colour mixed 60% toward (0.24, 0.17, 0.12). No hash dithering on that row any more: sparse fine
   lashes at 4K instead of dots. uLower is now unused for the lower row (kept for API).
Checked: native 4K crops abby lamp, remi lamp, abby daylight; humans-anim-dialogue draft still (face rig /
mouth fine); selftest-perf all passed; npm test 48 pass / 0 fail / 1 skipped.
Crops (scratch): /tmp/claude-0/-home-user-Untitled-new-game-project/c24e42f5-3f85-5974-a286-53c4d569fb35/scratchpad/eng1/look7/
abby_lamp_eyes_before_after.png (top before, bottom after), abby_neareye_before_after.png (2x),
remi_lamp_abby_day_after.png, a_aodbg_eyes.png (vAO bands: red <0.5, yellow <0.7, green <0.85, blue <0.95, white).

NEXT (in order):
1. Lamp sclera still a little olive next to the skin: try a slightly pinker tint (1.0, 0.92, 0.88) or lift
   the warm indirect bounce on the white; check alexandria (pale) and a dark-skinned crowd id too, so the
   x1.3 does not clip to paper white in daylight on any texture.
2. Upper lashes: tips still show a little alphaHash dither at 4K (2x crop) - same binary-core idea with a
   lower cut (0.4) or thicker cards; Abby's lower row still has 2-3 small clumps under the near eye.
3. Delete or move the buried caruncle mesh (build.py caruncles) on the next rebuild (2e item 4).
4. Older list (2e item 5): tear-line band on remi / alexandria, crowd gaze offsets, cheek pore stipple,
   stubble, hair root-to-tip + flyaways, cloth weave / hem dirt, hands at 4K, Abby's child face.

## PERF rider grip (2026-11-03, short session) - hands closed round the saddle's grab bar

Problem (director 1C-16 hands insert, SKY_OFF_VERDOR): the seated builds' drape hands rest open, palms up;
creatures/rider.js addGrip builds the leather grab bar at those palms, so the bar ran through open fingers.
FIXED (new ridergrip.js; index.js createRider wires it; API unchanged, opt-out added):
- riderGrip(rider, opts) runs at the end of every createRider update(t, o) (after applyIdle + lean), finds the
  'grip' group mountRider() added under rider.root (CylinderGeometry, axis = mesh +x toward the RIGHT hand,
  hands at +-(length - 0.14) / 2) and per hand: two-pass arm IK (wrist = bar point - palm * (r + 4 mm +
  0.14 palm length) - fingers * 0.8 palm length; fingers = the forearm's line square to the bar, tipped down
  0.25), forearm pronation (twistForearm), BAR_GRIP finger shape (curl [0.62, 1.0, 1.08, 1.12, 1.16],
  thumbIn 0.65), orientHand. No bar -> no-op (addGrip's own rider.update(0) still measures the drape palms).
- Seated riders on BOTH dragons go through createRider -> both grip. abby_ride_injured never grips with the
  LEFT (injured) arm (INJURED_LEFT set in ridergrip.js).
- Opt-out: createRider(human, { grip: false }) or rider.update(t, { grip: false }); { grip: { hands: ['R'],
  amount, shape } } per call. Director arm overlays (reach / point / ...) still pose on top.
- selftest-perf: new "rider grip" check (bar built like addGrip; palm.y < -0.3, knuckle row < 5 cm and middle
  fingertip < 3.5 cm from the bar axis, tip not above it; injured left hand must not move). Abby: palm.y
  -0.78, knuckle 3.8 cm, tip 0.9 cm; Remi: -0.91, 4.3, 2.1. npm test 48 pass / 0 fail / 1 skipped.
Renders (draft, scratch): /tmp/claude-0/-home-user-Untitled-new-game-project/c24e42f5-3f85-5974-a286-53c4d569fb35/scratchpad/eng1/perf/
perf-grip-before/1C-16_029.png (before), perf-grip/1C-16_029.png + 1C-16_050.png (after, @0.4 / @0.7),
grip_before_after.png (crops side by side). The grip reads: knuckles over the bar, fingers wrapped under.
SIDE EFFECT: 1C-16 frames its two subjects on wrist.L / wrist.R; the wrists now sit ~6 cm behind / above
where they were, and the re-solved camera now looks past Leaf's neck crest - a big out-of-focus green
scaled plane covers the upper-left 40% of the frame at both @0.4 and @0.7 (director's spec: REQUESTed).

NEXT (in order):
1. abby_ride_injured: addGrip spans the bar from her held-in LEFT hand, so it slants across her lap and the
   right hand only half reaches its end (knuckle 5.8 cm, tip 2.5 cm above the axis; selftest uses looser
   limits for it). Ask creatures for a one-hand bar for injured riders, or move the right hand's target to a
   fixed spot on the bar (C = mid + axis * half only when the bar is level / the left end is not the sling).
2. Close the fingers ONTO the bar (per-joint curl solved from the bar radius and phalanx lengths) instead
   of the fixed BAR_GRIP preset - Remi's bigger hand leaves 2 cm between tip and axis.
3. Check the grip at 4K in humans-riders.js (Remi on Charcoal, Abby on Leaf) and in 1C-14 (Remi wide).

## LOOK round 2g (2026-11-03, short session) - jointed fingers (knuckle creases), hand tone, nails, sclera tint

Trigger: director rev17 1C-16 (rider-grip insert, sun) - hands read as pale cones (no knuckle / joint read).
FIXED (runtime only, no rebuild, API unchanged):
1. loader.js `handCreases()`: new skin attribute `hcr` (vec2) per bind-pose vertex = signed distance along the
   finger from the nearest finger joint (m, + = distal) and the joint kind (1 MCP, 2 PIP, 3 DIP / thumb IP),
   from the header's bone heads (fingerK-1/-2/-3 heads; tip = -3 head + 0.75 x middle segment); back-of-hand
   vertices keep their true (negative) distance from the MCP so the band stays on the knuckles.
   Debug-painted and verified (|s| / kind / dorsal mask) on abby at preview.
2. materials.js skinMaterial `knuckleCrease()`: dorsal knuckle wrinkles as bands ACROSS the finger (~1.3 mm
   apart, wavy, broken; PIP 1.0, DIP 0.7, MCP 0.4; dorsal via aux3.b) in colour (x0.52/0.45/0.45 in the
   lines) and as bump grooves (0.18 mm); when the lines get below ~3 px they average into a darker, redder
   knuckle patch, so at draft a finger still reads as jointed segments.
3. Hand tone: hands (aux3.g) x(0.93, 0.83, 0.79) at 0.85 - redder / a touch darker than the face (the face
   tone on the hands read bloodless in sun). Nails: glossy plate (roughness -> 0.3), plate a little pinker,
   free edge paler (nail mask x fingertip mask > 0.82).
4. Eye: default uScleraTint (1.0, 0.93, 0.87) -> (1.0, 0.92, 0.88). Daylight eye macros (humans-dev t 5.5,
   focusEye) alexandria sclera 168/160/152 (cheek 189/154/141), crowd05 (brown skin) sclera mean 150/146/140,
   brightest sclera pixel 168 - no clipping with the x1.3 gain.
Checked: selftest-perf all passed; npm test 48 pass / 0 fail / 1 skipped.
Images (scratch): /tmp/claude-0/-home-user-Untitled-new-game-project/c24e42f5-3f85-5974-a286-53c4d569fb35/scratchpad/eng1/look8/
ba_crop.png (abby hands view preview, fingers 2x: top before, bottom after), ba_small.png (whole view),
before/1C-16_036.png + after/1C-16_036.png (director still 1C-16@0.5 draft), 1C-16_hands_before_after.png
(2x crop), hands_dbg_crop.png (attribute debug paint), eyes_alex_crowd05.png.
RESULT at 1C-16 draft: modest - hands a little warmer, faint joint bands; the cone read there is mostly the
POSE + LIGHT: fingertips taper to points hanging below the bar, no thumb visible, top-down sun blows the
back of the hand out (REQUEST performance / director, below).

NEXT (in order):
1. 1C-16: REQUEST performance (ridergrip.js): thumb wrapped round the bar's near side (visible from above),
   fingers less splayed / tips tucked under the bar (they hang below it as points). REQUEST director: a
   lower 3/4 angle instead of straight top-down; check the hand exposure in sun (backs at ~240).
2. Fingertip shape: MakeHuman fingertips taper to a point at draft - a pad bulge (slight normal / shading
   roundness at the tip mask) or a build-time tip fattening in postfix.py on the next rebuild.
3. Back-of-hand veins + extensor tendons for adults (needs a dorsal-hand mask: add to skin_zones on rebuild
   or derive in loader from bone frames like handCreases); palm flexion creases (same hcr, palm side).
4. crowd05 (brown skin, darkskinned texture) has a bright blue iris - pick a brown iris in characters.py on
   the next rebuild (check other darkskinned ids too).
5. Older list from 2f: upper-lash tip dither, buried caruncle mesh, tear line on remi/alexandria, stubble,
   hair root-to-tip + flyaways, cloth weave / hem dirt, Abby's child face.

## perf s9 (rider grip, 1C-16) - short session
Owner notes (perf-next.md): (1) thumb round the bar's near side, fingertips tucked under with less splay;
(2) selftest rider-grip test: level bar for '_injured' builds (creatures 71c2b43), tighter limits.
Done (ridergrip.js):
- WRAP FIT: after the first pose, the middle finger's knuckle / PIP / DIP are fitted with a circle in the
  bar's cross-section; the wrist target slides until that circle is centred on the bar axis, and each finger's
  curl is scaled (0.35..1.45) until its PIP/DIP sit at bar radius + 0.1 x palm length (4 iterations, pure in t).
  Result (Node): middle DIP 2.4 cm below the bar centre (was -0.9, tips hung in front), knuckle 2.7 cm from the
  axis (was 3.9, knuckle row in front of the bar); little finger no longer passes through the bar (PIP r 1.5 cm
  vs 0.6).
- BAR_GRIP: `together: 0.9` (fingers side by side, converging) instead of `spread: -0.08`; new keys `tilt`
  (hand tipped over the bar, 0.25 = old value) and `thumbWrap`.
- wrapThumb(): thumb phalanges aimed round the bar's near side (rider's side) and under, toward the other hand.
  SHIPPED OFF (`thumbWrap: 0`): the built coats weight cuff vertices to finger1-1/1-2/1-3 (abby_ride coat:
  ~170 vertices with weight > 0.2), so wrapping the thumb dragged the sleeve cuffs up to 19 cm down over the
  hands (render showed the sleeve panels crossing the hands). Enable with `rider.grip = { shape: {...BAR_GRIP,
  thumbWrap: 1} }` once the cuffs are fixed (REQUEST look/build below). Metacarpal finger1-1 is never aimed.
- selftest-perf rider-grip test: bar for `_injured` builds now LEVEL exactly like creatures addGrip (right
  palm mirrored across the root bone's x in the rider root frame); one set of limits for every build:
  palm.y < -0.3, knuckle < 4 cm, DIP < 3.5 cm from the axis AND tucked (tipY < -1 cm), thumb on the near side
  (fwd < -1 cm, within 6 cm; 4 cm when thumbWrap is on). Values now: abby 2.7/2.6/-2.5, remi 2.9/2.9/-2.7,
  abby_ride_injured.R 2.7/2.5/-2.2, injured LEFT arm unmoved (0.2 cm).
Checked: selftest-perf all passed (51 ok); npm test 48 pass / 0 fail / 1 skipped.
Images (scratch eng1/perf9/): before/1C-16_036.png, after/1C-16_036.png (director still 1C-16@0.5 draft),
1C-16_hands_before_after.png (2x crop, top before / bottom after), full_ba.png.
RESULT at 1C-16 draft: knuckles now ride on top of the bar, fingers closer together and wrapped over the
front; the tips still show as small rounded points under the bar's lower edge (shorter than before). Thumb
still not visible from this camera (it is behind the bar, the camera is in FRONT of Abby looking back).

NEXT (perf, in order):
1. REQUEST look/build: strip garment (coat) cuff weights from finger1-* / metacarpal* bones (reassign to
   wrist / lowerarm02) in the build post-step or loader; then set BAR_GRIP.thumbWrap 1, re-render 1C-16 and
   check the sleeves stay put (Node check: skin the coat on CPU, max vertex move thumb1 vs thumb0 should be
   < 1 cm; the probe script is at scratch eng1/perf9/_probe_grip.mjs - copy into humans/cache/ to run).
2. Tips still peek under the bar: try Rt = bar radius + 0.08 x palm length (tighter wrap) and/or extra DIP
   curl (handShape uses c x 0.75 at the DIP - a separate `dip` scale in the shape would let the last
   joint close more than the PIP); check the pinky (it is the shortest, knuckle lowest).
3. Note for the director: 1C-16's camera is in FRONT of Abby looking back, so the "near side" thumb is
   behind the bar from the lens; a thumb that reads in this shot needs the thumbWrap path plus a camera a
   little higher, or a second insert from over her shoulder.

## LOOK round 2h (2026-11-04, short session) - coat cuff weights, rider sleeves ("boards"), crowd irises

FIXED (runtime, loader.js rebindWorn -> garments; no rebuild, API unchanged, nothing moves at rest):
1. Garment hand weights: every finger* / metacarpal* weight of a `cloth` mesh (not gloves/gauntlets/mitts)
   goes to lowerarm02 of the same side (twist bone: 0.6 of the pronation, not the wrist bend).
   Probe (CPU-skinned coat, rider grip @0.7, BAR_GRIP.thumbWrap 1 vs 0): abby_ride coat max move 19.4 cm
   -> 0.00 cm; abby_ride_injured 10.0 -> 0.00; remi_ride 0.00 (unchanged); shirts / trousers 0.00.
2. Cause of the "stiff flat boards" in 1C-16 (abby_ride): NOT the cloth bake or normals - garments.py
   `transfer` skins garments from the k nearest body vertices in the DRAPE pose, and the seated builds'
   hands rest on the lap, so the coat SKIRT round the hands took forearm / wrist / hand weights (~90
   triangles per side joined forearm-weighted skirt vertices to thigh-weighted ones, 13-39 cm from the
   forearm; every *_ride build has them: abby_ride, abby_ride_injured, remi_ride, fall_ride doublet,
   scout_ride; standing builds have none). The grip lifted the hands to the bar and those skirt patches
   went with them: big flat stretched panels with smeared weave from the lap to the cuffs.
   loader.js `lapOffSleeve()`: garment vertices OUTSIDE the forearm sleeve tube (elbow -> wrist line,
   radius 1.4 x p75 of the sleeve's forearm-weighted vertices, max 8 cm; upper-arm-weighted elbow vertices
   kept) lose their forearm / wrist / hand weights (renormalised, or - mostly-forearm vertices - the mean
   of their clean mesh neighbours, ring by ring). abby_ride coat: 578 vertices fixed; edges stretched
   > 1.5x under the grip 558 -> 42 vertices, max stretch 48.9x -> 2.5x; abby_ride_injured 267 -> 25
   (max 25.6x -> 7.7x); remi_ride 216 -> 137 (max 5.8x unchanged, see NEXT 1); abby (standing) 7 vertices.
3. characters.py crowd(): brown / deep skin tones get brown irises (brownlight + brown tint, or brown +
   darkbrown tint; there is no darkbrown_eye.png). Takes effect on the next crowd rebuild (crowd05 was
   blue, crowd14 green): `node pc/build-caches.mjs --only humans --humans crowd05,crowd14 --force`.
Checked: selftest-perf all passed (rider grip unchanged); npm test 48 pass / 0 fail / 1 skipped.
Images (scratch eng1/look9/): before/1C-16_036.png, after/1C-16_036.png (director still 1C-16@0.5 draft),
1C-16_sleeves_before_after.png (left before, right after). Probe scripts: probe.mjs (thumbWrap move,
stretch), bridge.mjs (forearm<->body bridge triangles in the cache), wts.mjs (cuff weights).
RESULT at 1C-16 draft: the flat boards are gone - the sleeves read as soft wool tubes with folds and a
cuff, the skirt lies on the lap, the weave is no longer smeared.

FOR PERFORMANCE: the cuffs no longer follow the thumb - BAR_GRIP.thumbWrap can be set to 1 (probe: coat
max move thumbWrap 1 vs 0 = 0.00 cm on abby_ride, abby_ride_injured, remi_ride).

NEXT (look, in order):
1. remi_ride: the opposite case remains - the LEFT forearm sleeve's UNDERSIDE took thigh / pelvis weights
   (83 of 313 cuff-region vertices > 10 % non-arm weight); give tube vertices facing away from the forearm
   axis (normal . radial > 0) their non-arm weight as lowerarm01/02 by t (or fix garments.py transfer for
   seated poses: restrict sleeve vertices to arm bones, skirt vertices to non-arm bones, then rebuild riders).
2. The sleeves end ~5 cm above the wrist in 1C-16 (the grip IK moved the wrists 4.9 cm from the drape): a
   longer sleeve_frac for the ride builds, or a cuff that slides (lowerarm02 -> wrist blend at the hem).
3. Right cuff shows a small light-green ragged fringe (inner side / backface of the hem) and the coat's split
   hem at lower right reads jagged at draft; check cloth.js back-face colour and the hem's solidify.
4. Older list (2g NEXT 2-5).
