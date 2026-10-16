# Dragon's Kingdom S01E01: what the final script needs that does not exist yet

For the production team. Written 16 October 2026 from `screenplay-final.md`, `shotlist.json` (726 shots) and a survey of `scenes/lib/` (creatures, humans, architecture, nature, props, sets) as it stands today. **Plan only:** nothing on this list has been built for the final script yet. Every design stays PROVISIONAL until Daxtyn approves it, and everything here is made with free tools and free (CC0, or CC BY with the credit recorded) assets only (`SERIES.md` sections 3 and 4).

The ids (S1, H1, D1, P1, F1, A1) are the ones `render-schedule.md` uses to say what each delivery needs first. Size: **S** a day or less, **M** a few days, **L** a week or more of build and look-development, before render time.

## What already exists and is reused

So this list stays short, here is what the final script reuses as it is (still being improved by the model-quality workflows):

- **Dragons** (`scenes/lib/creatures`): Charcoal, Leaf, Starlight, the scout and the gold hatchling as their own designs (two legs, wings as forelimbs, horns); the low stance work (hips under the middle of the body; `poses.js`: stand, walk, crouch, lie, sit, pushUp, struggle, fire, flight, glide, dive, strike, sprint, mouthHold, launch, land); fire (`fire.js`, orange-red for Charcoal); launch dust (`dust.js`); the scout's torn wing root as a wound in the skin shader (`materials.js`: `uWound`); riding rigs and saddles (`tack.js`), riders (`rider.js`).
- **People** (`scenes/lib/humans`): abby (standing, injured, sling, riding, riding injured), remi, remi_ride, alexandria, fall, fall_ride, king, attendant, healer, messenger, keeper1, keeper2, vendor, parent, child, musician, musician2, guard_captain, guard1-3, watchman, villager_hurt, scout_ride, sailor1, sailor2, and the 18-person festival crowd kit (crowd01-18); idle motion, dust on people (`setDust`), joined hands.
- **Places** (`scenes/lib/architecture`, `nature`, `sets`): the birthing chamber and its nest, the treatment room, the stable, the keeper's house, Charcoal's access rig, Leaf's platform, the palace, the harbor, the whole Cling square (arch, gate, fountain with its pillar, the king's steps, the stone pier, alley, lanes, paving, puddles); Verdor's coast, the island, Cling's land and farmland, trees, rocks; terrain, grass, town, the prologue knarr.
- **Props** (`scenes/lib/props`): the Santa Maria (CC0 Poly Haven ship, furled sails, lettering, mooring lines, gangplank), the prologue boat, barrels, buckets, crates (also broken), baskets, trestle tables, benches, stools, handcarts, bread and produce, pottery (jugs, cups, bowls), cloth bolts, festival stalls, bunting and banners (baked cloth), sacks, rope coils, lanterns, instruments (tabor, pipe, lute, frame drum, fiddle), breakables (splintered beam and board, roof tiles), the egg, straw bedding, bowls with water, folded cloths, oil lamps, the healer's box (splint, folded sling), mounting steps, a ladder, a saddle stand.
- **Look** (`runtime/cinematic`, `dk/ocean.js`): physical sky, haze and volumetric fog banks, depth of field, velocity motion blur, film finish; the FFT ocean with foam and spray.

## Sets and places (S)

| Id | What | Where (shots) | Reuse | Build | Size |
|---|---|---|---|---|---|
| S1 | **The queen's own room** at first light: a window over the sea, an unslept bed, a stone sill with the wine jug and cup. | X1 (4 shots: X1-02..X1-04, R1-01) | `architecture/interiors.js` walls, `flagFloor`, `beamCeiling`, windows from `openings.js`; bed linen from the props cloth bakes | New interior in the chamber's style; dawn sea light through the window (HDRI + sun below the horizon) | M |
| S2 | **Palace corridors:** tall windows at intervals, a turn where no one sees, daylight at the far end. | X1, X2, X13 (10 shots) | Masonry, openings and materials of the palace | New interior, one modular corridor dressed three ways (early light, morning, day) | M |
| S3 | **Verdor from the air:** curved harbor wall, quay, slipway with boats, nets on frames, the market street, terraced hillside, the riding-school field, the palace with the chamber's high opening. | X4, X9, X10 (18 shots + the harbor shots) | `verdor.harbor`, `verdor.palace`, `nature/verdor-world.js`, `sets/town.js` | Lay the town and harbor out as one map seen from 50-200 m; the market street at ground level for X4-07 and X16-10 | L |
| S4 | **The outer rocks:** two leaning sea stacks with a gap that opens seaward (Leaf fits through it, Charcoal does not), seabird ledges with whitewash, white water, the mist bank on the seaward side. One layout for X6, X8 and 1F. | X6, X8 (23 shots) | `nature/rocks.js` rock kit and the outer-rocks skerries in progress, seabird whitewash in `nature/materials.js`, volumetric fog banks | Model the two stacks at flight scale; a dense mist cell for the white-out (see F7) | M |
| S5 | **The Santa Maria's deck and masthead:** deck planking at close range, coiled rope seats, the off-watch corner in the shade of a furled sail, the ship's boat lashed ready, the rail, the masthead lookout position. | X9, R4, R5, R9, X16 (11 shots) | The Santa Maria model (its deck is not built for close-ups) | Close-up deck dressing on the existing hull; the ship's boat from the prologue boat | M |
| S6 | **The riding-school field** above the harbor at ground level. | X16 (2 shots), seen from the air in X4 | Riding-grounds terrain and grass | Dress a corner of the grounds | S |
| S7 | **The broad road outside Cling** and the gate from outside: country people, carts, dust, fields. | X14 (4 shots) | `nature/cling-world.js`, farmland, `cling.gateway` | Road surface, verges, cart traffic | M |
| S8 | **Riding-grounds additions:** the line of stakes at the edge of the launch space, the stair's runners (drawn back), the launch scar half-mended with lifted and relaid turf, a feed cart, the wheeled saddle stand. | X3, X15, X19 (and 2A, 2C) | `verdor.accessRig`, `groundGear`, grass | Turf states (torn, lifted, relaid) as swappable patches | M |
| S9 | **Cling in three new states:** (a) X5 early morning, nearly empty, stall half built; (b) X14 midday, the table set but empty, the king's plain seat on the steps; (c) after the attack (3D, X27, X28): the collapsed roofline section, the broken music stage, the wrecked stall, banners down, blood on the paving, the dead laid out below the steps. | X5, X14, 3C-3D, X25-X28 | `cling.clingSquare` (the festival state is F5) | (a)-(b) are dressing switches; (c) is a damaged copy of the square with debris placed by hand and kept consistent shot to shot | L |

## People (H)

Every speaking role is a hero build (face, hands, cloth simulation); the rest can come from the crowd kit with new outfits and poses. Remi, Abby, Alexandria, the king and the other existing cast need only new poses and continuity states (below and A1-A7).

| Id | Who | Where | Reuse | Build | Size |
|---|---|---|---|---|---|
| H1 | **Young attendant** (a young woman, palace clothes). Speaks. | X1, X2, X12, X13, X18 (13 shots) | `attendant` as the base | New hero build | M |
| H2 | **Two servants** carrying linen. | X2 (1 shot) | crowd kit | Palace outfits, linen props | S |
| H3 | **Lookout** at the masthead. Speaks. | X4, X9 (3 shots) | `sailor1` | Hero build of a sailor, climbing/waving poses | S |
| H4 | **Ship's master** with a pipe. Speaks. | X9, R4, R5, R9, X16 (7 shots) | `sailor2` | New hero build (weathered, older), pipe in hand and teeth | M |
| H5 | **Sailor** (speaks, R9) and the **off-watch crew** (four, seated on rope, dice), the harbor crew. | R4, R5, R9, X16 | `sailor1`, `sailor2`, crowd kit | Speaking sailor hero build; seated crew variants | M |
| H6 | **Second keeper** (KEEPER, speaks in R6 and R10) with a flask. | 2A, X15 (8 shots) | `keeper2` | Upgrade keeper2 to a speaking hero; flask pose | S |
| H7 | **Riding instructor.** Speaks. | X4, X16 (2 shots) | crowd kit | New build | S |
| H8 | **Young riders** on small dragons (several, no names, no ages). | X4, X16 (3 shots) | riders (`abby_ride` style) | Young rider builds, seated and walking | M |
| H9 | **The farm family:** the adult villager uninjured (cart, table, gate), the partner (speaks), two small children. | X14, X20, X22, X24, X25, X27 (about 30 shots) | `villager_hurt` (injured only), `child` (the Cling child; the farm children must look different) | Villager uninjured + injured + splinted states; partner hero build; two small children | L |
| H10 | **Old woman** who teaches the dance. Speaks. | X14, X22, X24, X26, X27 (10 shots) | crowd kit | New hero build | M |
| H11 | **Guard of the escort with no lines** (dies in R16b): helmet and colours visibly different from the speaking guards. Plus the man with a child on his shoulders, two old neighbours, an old man, the two strangers in the alley, the two villagers with the ladder, the farmer on the terrace, Verdor townspeople and fishing crews. | 3C, X5, X20, X24, X26, X27, X4, X16 | crowd kit, guard1-3 | New outfits and actions on crowd-kit bodies | M |
| H12 | **The dead of Cling**, every one an adult: a man under the roof timbers (only his arm shows), a woman face down by the steps, a grown woman across a man's lap (head wound mostly hidden), a man-sized shape under a banner, the escort guard, a man under an awning in the alley, the covered row below the steps with a pair of men's boots and a festival ribbon. | R15, R16b, R18, R20, R21 (9 shots) | crowd-kit bodies | Lying and slumped poses (a ragdoll settle baked in Blender, or hand-posed), covered shapes made by baking banner cloth over them (the props cloth pipeline) | M |

Continuity states on existing people: Remi's blood (three states, F1), Remi with sleeves pushed up and dirt to the wrists (X19), Abby walking with the sling (`abby_sling`), Alexandria kneeling, feeding the hatchling and at the window, the king dusty and drinking from the jug, the watchman's cup and bread, dust on everyone in 3C-3D.

## Dragons (D)

| Id | What | Where | Reuse | Build | Size |
|---|---|---|---|---|---|
| D1 | **Small working dragons** about Leaf's size: the quay dragon crouched low and level by the catch, the one walking the net line up the slipway, the one by its fishing crew in X16. Each is its own design (DRAGONS.md: no species), two legs, wings as forelimbs, horns, low stance. | X4, X16 (3 shots) | Leaf's anatomy as a starting point (not a copy) | Two or three new designs with their own colours, shown to Daxtyn as pictures first | M |
| D2 | **The young riders' dragons** (several small dragons, one lying flat and refusing to move). | X4, X16 | as D1 | Two or three more small designs, or D1 variants with different colours and horns | M |
| D3 | **The hatchling, later in the day:** dry gold (not wet), shallow breathing, licking water from a cloth, pushing up on its wing wrists and two legs, standing three breaths, sitting down hard. | X13, X18 (16 shots) | the hatchling design, `pushUp` | Dry material state; drinking and stand/sit animation | M |
| D4 | **Leaf on the ground, low and level** in every resting and waiting shot: the low crouch, the low walk with wing wrists swinging forward, lowering his head to Abby, turning so she can reach his far side, crouching on the stack top. No dog-sit. | 1B, X2, X3, X6, 2A, X17, X19 (101 shots carry the low-stance flag across all dragons) | `crouch`, `walk`, `lie` (the low-stance work in progress) | Blend and contact clean-up per shot | M |
| D5 | **Charcoal's bloody jaw and throat:** wet in 2A, dried dark in 2C, washed in X15 (red, pink, clear runoff). | 1F, 2A, 2C, X15 (15 shots) | skin shader wet/dirt channels | A blood layer on the skin material (see F1) with wet and dry states | S |
| D6 | **Charcoal's working moments:** lowering for mounting (X3), lying while the saddle comes off, lowering his head to be washed, eating from the feed cart, breathing out over the grass, the climb, dive and mist flying of X6-X8. | X3, X6-X8, X15, X18, X19 | `lie`, `launch`, `dive`, `glide` | Animation per shot | M |
| D7 | **Seabirds and gulls:** flocks lifting off the stacks (X6, X8), one gull swooping over the market (X16), birds in the Cling sky (X5). | 4 shots + background | none (whitewash only) | Instanced flapping birds with flocking, procedural; or a CC0 bird model if one is found and recorded in the manifest | M |

## Props (P)

| Id | What | Where | Reuse | Build | Size |
|---|---|---|---|---|---|
| P1 | Wine jug, nearly empty, and one cup with a dried dark ring inside. | R1 | `goods` pottery jug and cup | Dried-wine film material | S |
| P2 | Short clay pipes (keeper, master, musician), burning embers in the bowl, the ember ground into the turf. | R2, R3, R4, R9 | none | Small turned clay pipes; ember glow; see F4 for smoke | S |
| P3 | Ale jugs and cups (crew, festival table, the king's toast, the watchman's full cup, the vendor's surviving jug), a cork, a dice cup and dice, a leather flask. | R4, R5, R9, R10, R11, R12, R13, X23, X28 | `goods` jugs, cups | Dice and dice cup, flask, cork; liquid inside cups (meniscus), pouring and spilling (F9) | S |
| P4 | Feed cart with fodder for Charcoal. | X15 | `handcart` | Dress and scale up | S |
| P5 | Buckets, wet cloths, the healer's bowl with water turning pink, the torn strip of the scout's wing membrane. | X11, R9b, X15 | `bucket`, `bowl`, folded cloth | Wet cloth state; tinted water states; the membrane strip (from the scout's membrane material) | S |
| P6 | Spades and turf for mending the launch scar. | X19 | none | Wooden spades, turf slabs | S |
| P7 | Ship's gear: folded canvas, the ship's boat lashed ready, long poles for pushing off, bollards and lines thrown off; the first sail set and filling. | X16 | Santa Maria, mooring lines, prologue boat | Set one sail on the Santa Maria (a cloth bake like the prologue sail) | M |
| P8 | Harbor working gear: nets drying on frames, fish baskets and the catch, two fishing boats, the slipway. | X4 | `goods` fish, baskets; prologue boat as a base | Nets (cloth/rope bake), slipway | M |
| P9 | Festival table: loaves, fruit, small honey cakes on a tray, coins, the shared table along the square, the king's plain seat, the upturned crate, borrowed tools for the gate hinge, the ladder for the banners. | X5, X14, X20-X22, 3A | festival kit, goods, crates, ladder | Honey cakes and coins; seat; tools | S |
| P10 | The musician's instrument with the loose fastening, later with a string hanging free. | X5, 3A, X27 | `lute` | Broken-string state | S |
| P11 | The banner-pole splint on the villager's leg; the fallen awning over the dead man; banners and festival cloth laid over the dead. | X27, R20, R21 | banners | Cloth bakes over bodies (H12) | S |
| P12 | The scout rider's burned costume (sleeve burned away, scorched leather) and the escort guard's distinct helmet and spear. | 1F, R16b | `scout_ride`, guard spears | Costume damage states | S |

## Effects (F)

| Id | What | Where | Reuse | Build | Size |
|---|---|---|---|---|---|
| F1 | **Blood**, treated like make-up and practical effects on a real set: the spray from the bite carried back along Charcoal's neck to Remi (particles with motion blur); decals with thickness on skin, scales, cloth and stone, wet and drying; blood running along the paving joints (R15); the long smear on a house front (R16b); a banner soaked through (R18); the red stain in the sea around the scout's torn shoulder (C17); pink water in the bowl and the bucket; red, then pink, then clear runoff in the grass. | 19 shots tagged BLOOD | the wound term in the creature skin shader; wet/dirt channels | A shared decal + wetness layer for the human, creature and stone materials; spray and drip particles; tinted-water states for the sea, bowls and runoff | L |
| F2 | **The burn on the scout rider:** flame wrapping the rider (from Charcoal's `fire.js` jet), cloth and leather catching, smoke streaming in the slipstream, then the damage in one close shot: blistered, raw skin with blackened edges on the forearm and neck. The face stays covered. | 1F-14, 1F-14b, 1F-15 | `fire.js` | Burning-cloth sprites, a burn layer on the skin material, smoke trail | M |
| F3 | **Wounds:** the scout's wing tearing free (membrane split, bones snapping, a burst of blood, the wing falling away on its own) and its torn, bleeding shoulder; the villager's split scalp (bleeding sheets down his face) and the open fracture of his RIGHT leg below the knee; the dead woman's head wound (mostly hidden). Never lingered on. | 1F-20, 1F-20b, R17, R18 (6 shots tagged GORE) | the scout's wound shader term, the wing-loss staging | A separate falling-wing mesh; an open-fracture appliance on the villager's leg; scalp wound decal | M |
| F4 | **Pipe smoke:** thin tobacco smoke and the musician's thicker, sweeter smoke catching the low morning light; nothing shows how anything is prepared. | R2, R3, R4, R9 | volumetric fog (too heavy for wisps) | Sprite or particle wisps with the film finish's light | S |
| F5 | **Dust in the attack and after:** the volumetric dust of the first pass, the second pass's blast of air, settling dust on people and the dead, dust trickling. | 3C, 3D, X25-X28 (53 shots tagged DUST) | volumetric banks (render plan: "dust" estimate), `setDust` | Animated dust volumes that keep the fountain's pillar readable | M |
| F6 | **Destruction:** the roofline collapsing at the edge of the festival, flying timber and tiles, the music stage coming apart and its boards scything across the paving, the stall swept into the square. | 3C, R15, R16 (11 shots) | festival breakables (beam, board, tiles) | Rigid-body simulation baked offline (Blender, free) or keyed by hand, debris kept consistent into 3D | L |
| F7 | **Mist white-out:** Charcoal and the scout inside the mist bank (no horizon, only vapour and the dark edge of a wing), and breaking out of it into glare. | X8 (8 shots) | volumetric fog banks | A dense mist cell with motion through it | M |
| F8 | **Water at the rocks:** Charcoal's downwash flattening the water into a pale ring, spray climbing the stone, surf in the gap. | X6, X8 | FFT ocean, foam, `setWake` | A radial downwash disturbance on the ocean | M |
| F9 | **Smaller physical effects:** the Santa Maria's sail dropping and filling (cloth), ale poured over the side, the watchman's cup going over, a gull's swoop, banners pulled loose by Starlight's wake. | X16, R9, X23, 3C | cloth bakes, banner bakes | Short cloth and liquid bakes | M |
| F10 | **Sun glare:** the scout climbing into the sun and vanishing in the glare (bloom, veiling glare and halation from the film finish, the sun disc in frame). | X8-01, X8-02 | film finish (bloom, halation) | Exposure and glare tuning per shot | S |

## Animation and behaviour (A)

The humans library has baked poses and idle motion, not full-body animation; the preview plan already lists walking, sitting, climbing and bowing as missing. The final script needs much more of it. Free sources: hand keyframing and pose blends in the library, physics-based settling baked in Blender, and free motion-capture data only if its licence allows commercial use and is recorded in the manifest (for example the CMU Graphics Lab motion capture database, whose terms must be checked and recorded before use; nothing non-commercial).

| Id | What | Where | Size |
|---|---|---|---|
| A1 | Everyday actions: walking (fast, careful, with a sling), turning, kneeling and sitting, standing up, carrying, waving, wiping, scrubbing, pouring, drinking, smoking, clapping, pointing, crouching at a shelter opening. | everywhere | L |
| A2 | Climbing: Charcoal's access stair, the watchman's ladder (steady, and later with unsteady hands), mounting and dismounting. | X3, X5, X28, 2A | M |
| A3 | Working groups: the fishing crew sorting the catch and hauling the net with a dragon, the riding lesson (wobbly takeoff, a rider clinging on), keepers lowering the saddle on ropes and mending turf, the crew pushing off with poles. | X4, X15, X16, X19 | M |
| A4 | The children's stepping dance: the lesson at midday (rushing, stepping it through), the full ring dance with a ragged final stamp, two smaller children copying, the king's four bad steps. | X14, X22 | M |
| A5 | The festival table: sitting, eating, arguing over bread, the toast, the old song (one voice, then many, most humming), laughter at the alley end of the table, the musicians playing (instrument animation). | X20-X22, 3A | M |
| A6 | The attack: evacuation along two routes (arch and gate) without circling, people pushed and separated, falls and stumbles, the guard thrown against a wall (R16b), the villager's legs taken out, the king and captain moving to cover. | 3C, X25, X26, R15, R16 | L |
| A7 | After the attack: people coming out of shelter looking up first, lifting timber, carrying the injured under the arch, the guard's search, the man rocking, the family reaching the villager, the king lifting a beam. | 3D, X27, X28 | M |

## Not in this list

- **Voices and sound:** see `voices.json` (8 new roles, 4 of them blended voices that need auditions; the sung verse R13-01, Abby's cry in X12 and the rider's scream need people, not TTS) and `../audio-plan.md`.
- **Lip-sync:** 185 shots show a speaking face (`LIPSYNC` in `shotlist.json`); mouths are driven from the recorded takes' word timings, as in the preview's `words.json`.
- **Decisions for Daxtyn** that could change this list: the dog-sit (question 2 in `CHANGES.md`), the deaths in Cling (question 4: cutting them removes H12 and most of F3, F5's bodies and A7's rocking), and every proposed addition (cutting one removes its sets and people).
