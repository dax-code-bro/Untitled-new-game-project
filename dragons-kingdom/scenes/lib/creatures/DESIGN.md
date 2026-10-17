# Dragon's Kingdom: creature design (build-ready)

Five dragons for Episode 1: **Charcoal**, **Leaf**, **Starlight**, the **gold hatchling** and the
**scout**. This file is the body design that `scenes/lib/creatures/` is built from: skeletons,
proportions, heads and horns, muscles, skin, colours, movement, riding rigs, real-animal
references, sketches, the code changes the new layout needs and a step-by-step build plan.

## 0. Status and authority

* **Canon (Daxtyn's decisions, `DRAGONS.md`)** wins over everything here: the colours, eyes,
  membranes and fire of Charcoal and Leaf, Leaf's size (about 25% of Charcoal), Charcoal's ~36 m,
  the black stripes along the finger bones of Charcoal's wings, "no species", and the decision of
  2026-10-14 that **every dragon has two legs and horns, with the wings as the front limbs**.
* Daxtyn's request of 2026-10-14, quoted: *"Make the dragons look a lot more realistic, and I want
  you to grab their bodies and just follow my description but make what you how you would make
  their body. I only said the colors and stuff, but I'm relying on you to make what the actual
  body looks like they should also have horns and only have two legs instead of four."*
* **Everything else in this file is proposed** (by Claude, as designer): body shapes, bone
  lengths, horn sets, skin, the scout's and Starlight's colours where the screenplay is silent,
  the sizes not fixed by `DRAGONS.md`, the motion. It becomes canon only when Daxtyn approves the
  pictures (`SERIES.md` section 5). Open questions are collected in section 9.
* **Revision 1 (2026-10-15, after the first renders of the built models):** Charcoal's skull is
  deeper and broader and his neck narrower behind the jaws (the skull read as the tapering end of
  the neck, an anteater); his main horns are thicker at the base; Charcoal's and Starlight's legs
  are thicker (bone and muscle sized for 40 t and 170 t per leg; the first legs read as a
  stork's); the newborn's snout is shorter and blunter; every adult's tail hangs in an arc with
  its end on the ground when standing (2.4); the feet stand a little wider than the hips so the
  inner toes never meet. Marked "rev. 1" where the numbers changed.
* **Revision 2 (2026-10-15, after the two critics' reviews of the rev. 1 renders):** marked
  "rev. 2".
  * **The resting stance is on the TWO legs** (section 1.5b). On the wrists the folded wing-arm
    read as a front leg in every ground frame - a four-legged animal, against Daxtyn's own words.
    Now every dragon stands like a big ground bird or a theropod: the trunk raised 30-34 degrees,
    the feet well ahead of the hips under the centre of mass, the tail carried level from the
    hips and laid on the ground from its middle as a counterweight and prop. The wings fold off the
    ground (a resting bat's fold). They still walk and crouch on the wrists (the wing-walk is kept
    for walking, the take-off crouch and the landing run-out).
  * **Leaf's dog-like sit keeps the wings folded** against his body (wrists off the ground): he sits
    back on his haunches on his two legs. Planted wrists read as a dog's front legs.
  * **Arm bones rebalanced** (the span is unchanged): humerus longer, forearm shorter - ratio about
    1.3, a bat's - so the folded wing is compact. Charcoal 5.4 / 7.2 m (was 4.2 / 8.4), Leaf 1.35 /
    1.85, Starlight 10.2 / 14.8, scout 0.72 / 1.18, hatchling 0.085 / 0.105. A forearm twice the
    humerus put the folded wrist far above the shoulders or far in front of the chest. The forearm
    tapers more to the wrist (Charcoal 1.0 m at the elbow, 0.62 m at the wrist).
  * Starlight heavier (neck, tail base, legs and arms: elephantine shanks for ~170 t per leg),
    crown horns 0.28-0.4 m across at the base; the scout's shanks thicker; the scout's horns laid
    back below the skull line; Leaf's horns dark olive-brown, back along the neck, tips dipping;
    Charcoal's main horns swing OUT before they curl down and forward (the first hoop rested on the
    neck); no burr collar on any horn; the broken left horn tip ends in a low, rough fracture face.
  * Belly: transverse ventral scutes (one wide scute per row with narrowing side scutes), not
    a grid. Teeth bigger (Charcoal toothMax 0.4 m), thin dark gum margins. Nostrils are slits.
  * The newborn: snout 20% of the skull, eye 0.042 m (22%), an overbite (the lower jaw inside the
    upper), no labial ridge or puffy cheeks, no throat groove (it read as a helmet seam).
* **Revision 3 (2026-10-16, Daxtyn's feedback on the rev. 2 renders, quoted: *"Make them look
  more normal like put their legs, so make them low to the ground with their legs more towards
  the center of their body"*; recorded in `DRAGONS.md`):** marked "rev. 3". This replaces the
  rev. 2 resting stance (the trunk raised 30-34 degrees on two legs at the rear read as a rearing
  horse or a kangaroo).
  * **The hip joint is under the middle of the body** (section 1.5c): the acetabulum moved from
    the tail base (trunk station 1.0) forward to station 0.68 of the shoulder-to-tail-base
    trunk, as in a bird, whose hip sits about two thirds of the way along the synsacrum. The trunk
    behind it (pelvis, ischium, the caudofemoralis) flows into the heavy tail base, so seen from
    the side the two legs come out of the middle of the animal.
  * **The ground stance is LOW and level** (1.5c): the chest carried with its underside about a
    third of the chest depth above the ground, the knees bent in a deep crouch, the feet under the
    centre of mass, the folded wings' wrist pads and thumb claws down under the shoulders as front
    supports, the neck forward and low, the tail low behind with its outer half on the ground.
    Never an upright biped; the rev. 2 `upright` stance is retired.
  * **Arm bones rebalanced again** (the span is unchanged): humerus about 0.55 of the forearm
    (Charcoal 4.5 / 8.1 m, Leaf 1.12 / 2.08, Starlight 8.6 / 16.4, scout 0.62 / 1.28, hatchling
    0.072 / 0.118). With the shoulder only ~5 m up, the rev. 2 humerus (5.4 m) could only reach the
    ground with the elbow swung out sideways or back over the hips; a short humerus puts the
    elbow up beside the withers and the forearm down to a wrist under the shoulder - the
    pterosaur / bat carriage of section 1.1.
  * Starlight's legs ~30% shorter (femur 4.0, tibia 4.8, metatarsus 2.8 m: femur + tibia 1.44x her
    chest depth, as Charcoal's) and Leaf's 8% shorter (0.78 / 0.9 / 0.48 m): folded into the low
    crouch the longer legs put the knee above the hip, like a grasshopper's.
  * Leaf's dog-sit is lower (chest ~30 degrees up): the rump behind the hips rests on the ground,
    the wrists are planted in front.
  * The landing is a low approach (a ~25 degree flare, the feet touch down under the middle of the
    body, then the wrists), no rearing; the walk keeps its planted feet still on the ground.
  * Skin: Starlight's plates smaller (scale size x0.56) and flatter with hairline joints (they read
    as white cobbles); the newborn slimmer (trunk, limbs, yolk belly) with a flatter skull (it read
    as a toy).
* **Revision 3b (2026-10-17, fix round 1 of rev. 3 after the critics; same Daxtyn direction):**
  * **The wing-arm folds BACK, not up** (1.5, 1.5c): in rev. 3 the upper arm pointed straight up
    from the shoulder and the elbow stood ~1.8 m above Charcoal's back - two posts or "rabbit ears"
    from the front and rear 3/4. Now the upper arm runs back (a little out) along the side of the
    chest, the **elbow sits on the upper flank below the back line**, and the forearm slopes
    forward and down from it to the wrist pad on the ground ahead of the shoulder, as in a
    quadrupedal pterosaur or a vampire bat. The hand folds back up along the forearm with every
    knuckle at the same height, the fingers **stacked side by side** (a closed fan seen edge-on)
    and laid back along the upper flank; the membrane gathers in soft pleats between them. Lying
    and Leaf's sit use the same fold. Measured in 1.5c.
  * **Charcoal's membrane (canon "gray with black stripes throughout"; DRAGONS.md: "the black
    stripes run along the wing's finger bones"):** a lighter neutral grey (sRGB ~#86858a), broad
    black bands ALONG every finger bone and the forearm (~0.75 m wide at the wrist to ~1.9 m at the
    tips), no bands between the bones; the grey reads when the wing is folded too.
  * Membranes: no crease-network maze on Starlight's white skin, less mottle; Leaf's light green
    one value with less light through it (it glowed lime against the sky).
  * Starlight's plates: overlapping plates with hairline joints, smoother and tilted further apart,
    a clear coat and a faint nacre film (thin-film iridescence) - "reflective crystal-like" in any
    light, never a glow; no dark outline round each plate.
  * Charcoal: horns a broad crescent with a heavy tapering base, deeper uneven growth rings and a
    worn point (the even hoop read as a hose); a broad tongue; a fleshier mouth.
  * The scout's tail is shorter (2.7 m, L 5.9 m) and thicker, its tip vane small with thickness;
    the belly scutes smaller and less regular. Leaf: a paler yellow-green belly (countershading).
  * The newborn: its wings folded back along the body like the adults' (no splayed rake), wetter
    skin, longer horn buds.
  * Tack: the giants' rig loses its backrest board and grab-bar posts (a chair): a leather skirt,
    a low cantle roll and a pommel roll with a hand loop.
* The screenplay (`episodes/s01e01/screenplay.md`) stays binding for events: section 1.13 lists
  every story beat the bodies have to make possible and how each design does it.
* Every number below comes from a small calculator (lofted elliptical cross-sections, an assumed
  whole-body density, the spread-wing planform polygon). It is not physics proof that a 36 m
  animal can fly (nothing that big flies); it keeps every dragon **internally consistent with real
  flyers scaled up**, so wing area, mass, wingbeat tempo, speed and turning read right on screen.

## 0.1 The five at a glance

| | Charcoal | Leaf | Starlight | gold hatchling | scout |
|---|---|---|---|---|---|
| role | Remi's dragon | Abby's dragon | Queen Fall's dragon | newborn | Episode 1 scout |
| reads as | massive heavy brute | compact young, agile | immense, long, regal | newborn: big head, weak | small, sleek, fast |
| length, snout to tail tip | **36.0 m** (canon ~36) | **9.0 m** (25%, canon) | **72 m** (proposed: 2x Charcoal, see 9) | **1.0 m** (proposed) | **6.8 m** (proposed) |
| wingspan | 63.6 m | 16.3 m | 131.6 m | 0.9 m (cannot fly) | 11.0 m |
| standing: hip / shoulder joint / head carried | 7.0 / 7.5 / ~12 m | 2.05 / 1.9 / ~3.4 m | 14.4 / 14.8 / ~26 m | 0.18 / 0.14 / ~0.3 m | 1.1 / 1.25 / ~1.8 m |
| mass (estimate) | ~81 t | ~1.1 t | ~340 t | ~11 kg | ~270 kg (+ rider and tack ~105 kg) |
| wing area / aspect ratio | 678 m2 / 6.0 | 41 m2 / 6.5 | 2517 m2 / 6.9 | - | 13 m2 / 9.3 |
| wing loading | 1180 N/m2 | 270 N/m2 | 1330 N/m2 | - | 285 N/m2 (with rider) |
| stall / easy cruise | ~33 / ~42 m/s | ~16 / 20-40 m/s | ~35 / ~45 m/s | - | ~18 / 35-45 m/s, sprint 60-70 |
| wingbeat (cruise) | **0.42 Hz** (one beat every 2.4 s) | **0.80 Hz** (up to 1.1 when working) | **0.24 Hz** (one beat every 4 s) | - | **1.1 Hz** (sprint 1.4-1.6) |
| wing fingers | 3 (III, IV, V) + thumb | 3 + thumb | 4 (II-V) + thumb | 3 + thumb (crumpled) | 2 (III, IV) + thumb |
| membrane reaches back to | the ankle | the upper shank | the ankle | the knee | the hip (narrow wing) |
| horns | 10: heavy back-swept main pair, brow pair, 3 jaw knobs a side | 4: short smooth pair + brow nubs | 8: long S-curved pair + a 3-pair crown | 2 soft buds (+ egg tooth) | 2: long thin, laid flat back |
| scales | completely black | dark green | albino white, reflective, never glowing | looks 24-karat gold, wet | (proposed) slate above, pale below |
| eyes | blue | yellow | (proposed) pale rose-violet, albino | (proposed) dark bronze, gold flecks | (proposed) pale yellow |
| membrane | gray, black stripes throughout | light green | (proposed) ivory, faint rose | (proposed) pale gold, wet | (proposed) dark grey-brown |
| fire | standard orange-red | purplish-blue, a little hotter (not on screen in Ep. 1) | none in Episode 1 | none | none shown |

Lineup to one scale: the sketch generator draws it (section 10); every side silhouette below
carries its own scale.

---

## 1. The shared body plan: a wyvern built like a bat and a pterosaur

### 1.1 Limb layout

* **Two legs** (the hind legs) and **two wings that ARE the front limbs** - nothing else. No
  extra limbs, ever (screenplay dragon policy).
* (rev. 3) On the ground every dragon carries its body **low and level** on its two feet, which
  stand under the middle of the body, and on the **wrists of its folded wings** planted under its
  shoulders (1.5c). It **walks the same way**, the way vampire bats and pterosaurs do (the rev. 2
  upright stance of 1.5b is retired). The folded wing becomes a front leg: the
  forearm is the "shin", a thick callused **wrist pad** and the **thumb claw** are the "foot".
  Pterosaur trackways show exactly this: hand prints (three short fingers and the wrist) set
  a little outside and ahead of the foot prints.
* **Elbows-high stance** (bat and pterosaur posture): from the shoulder the upper arm runs
  BACK and a little UP to the elbow, which sits beside the top of the shoulders; the forearm
  drops almost vertically to the wrist pad. This keeps the back level (shoulders only a little
  higher than the hips) and gives every dragon the cloaked wyvern silhouette: the folded wings
  stand up beside the withers like the shoulders of a cape.
* (rev. 3) **At rest they stand low** on the two legs and the two wrists (section 1.5c). They
  **rear up** (trunk 45-70 deg) only for a moment: the landing flare, to look over something, to
  threaten.

### 1.2 Skeleton (every dragon; the numbers per dragon are in its section)

| region | bones | notes / real reference |
|---|---|---|
| skull | cranium, snout (premaxilla, maxilla, nasal), mandible, quadrate hinge behind the eye | crocodilian / monitor: the gape runs back to below the eye |
| neck | 9-14 cervicals (Charcoal 11, Leaf 10, Starlight 14, scout 9, hatchling 10) | long, S-curved at rest, like a heron or swan |
| trunk | **notarium** (4 fused dorsals that brace the shoulder blades), 8 free dorsals, **synsacrum** (6 fused sacrals) | birds and large pterosaurs have both: a stiff trunk for flight, the rider sits on the notarium |
| chest | deep **keeled sternum** with the coracoids, scapulae along the back | bird / pterosaur keel: the downstroke muscle (pectoralis) is anchored on it |
| tail | 34-42 caudals; the outer half stiffened by bundles of **ossified tendons** | dromaeosaurs, *Rhamphorhynchus*: a stiff rudder that still bends near the base |
| wing (front limb) | humerus with a big deltopectoral crest; radius + ulna; carpus (wrist); **digit I = free thumb** with a big blunt claw; **digits II-V** (II bound to the leading edge or free, see each dragon): metacarpal + 2-3 phalanges, the last ones flexible | bat hand (several fingers carry the membrane) with a pterosaur forearm and very long metacarpals |
| hind limb | femur, tibia + fibula, **mesotarsal ankle**, 4 metatarsals, 4 toes: I = hallux (back, gripping), II-IV forward; V a small spur | bird / theropod leg, erect under the body (never sprawled like a lizard) |

**Wing proportions (the rule for every dragon):** metacarpals almost as long as the forearm (they
fold along it), the phalanges of the long finger 1.2-1.6x the trunk length (they fold back along
the flank and, on Starlight and the scout, over the tail base). That is what lets a wing of 1.6-1.8x the body length fold into a neat bundle.

### 1.3 Joint limits (degrees; 0 = rest pose; per joint unless stated)

| joint | range | notes |
|---|---|---|
| neck, each joint | pitch +12 up / -10 down, yaw +-12, roll +-4 | the 3 joints at the base: pitch +-15. Whole neck: Charcoal can turn his head ~120 deg sideways (he needs ~100 for the head-in-mouth beat) |
| head on neck | pitch +-35, yaw +-30, roll +-20 | |
| jaw | 0-50 open (Charcoal 50, Leaf 55, Starlight 45, scout 60, hatchling 30) | |
| trunk | notarium and synsacrum rigid; each free dorsal pitch +-3, yaw +-2 | |
| tail base (first 8) | pitch +-12, yaw +-15 | |
| tail middle (next 12) | pitch +-8, yaw +-10 | |
| tail outer half | pitch +-3, yaw +-4 (Leaf, young: +-6 - his tail can curl round in the sit) | ossified tendons |
| hip | flex (femur forward) 100, extend (back) 100, abduct 45, adduct 10, twist +-20 | extension 90-100 trails the legs back in flight; abduction spreads the membrane (bats do this) |
| knee | 10-150 flexion | |
| ankle (intertarsal) | 20-160 | |
| toes | flex 0-90 (grip), extend -30 | |
| shoulder (wing) | elevate +100 / depress -40, protract/retract +-60, twist (pronation) +-40 | |
| elbow | 25 (fully folded) - 175 (spread) | |
| wrist | 0-170 flexion | folds the hand back along the forearm |
| knuckle of each long finger (MCP) | 0-150 flexion | |
| finger joints (IP) | 0-100 | |
| thumb | flex/extend 0-90, abduct 0-45 | |

### 1.4 The wing membrane

* **Panels** (bat names): *propatagium* in front of the arm, from the neck base to the wrist (a
  taut leading edge, tensioned by the thumb and a muscle along its edge); *chiropatagium* between
  the long fingers; *plagiopatagium* from the last finger back along the flank and down the leg to
  the attachment point given per dragon. **No membrane between the legs and the tail**: the tail is
  free (it is the rudder).
* **Attachment line on the body:** from a point a hand's width **behind** the armpit, along the
  side of the chest and flank (at about the lower third of the flank depth), to the hip, then down
  the outside of the leg. The strip of ordinary skin between the armpit and the membrane root is
  the **girth groove** where the saddle's rear girth runs (1.11).
* **Structure, as in bats:** the membrane is living skin, 2 layers around a net of **elastin
  fibres and thin muscle bands** (*plagiopatagiales*) running chordwise, with blood vessels and
  nerves. Consequences that must show on screen:
  * when folded, the elastin **contracts the membrane into fine crinkles and pleats** - it never
    hangs like loose cloth or a tarp;
  * spread, it is taut between the bones with a **camber** (billow) between them that changes
    with the wingbeat, and soft creases radiating from the knuckles;
  * against the light it is **translucent** (veins and the thicker skin along the bones show as
    soft darker tracery) but **never glows**;
  * along every bone the skin thickens into a narrow band, and the trailing edge is a thicker
    hem (bats and pterosaurs).
* **Thickness:** ~1.2e-4 x the span (bat membranes scaled up): Charcoal ~7 mm, Starlight ~14 mm,
  Leaf ~2 mm, scout ~1 mm.
* **Camber control:** the legs set the tension of the plagiopatagium (moving the feet changes
  the inner wing, exactly as in bats), the thumb sets the leading edge, the fingers spread or
  close the chiropatagium.

### 1.5 The wing-walk fold (walking, the crouch, lying; rev. 3: also the resting stance - see 1.5c)

(rev. 3b: the elbow folds BACK along the flank - in rev. 3 it stood up beside the withers.)

1. **Elbow**: the upper arm runs **back** (and a little out) along the side of the chest, so the
   elbow sits on the upper flank behind the shoulder, **below the back line** (a quadrupedal
   pterosaur's or a vampire bat's carriage). The forearm slopes forward and down from the elbow
   to the wrist pad on the ground ahead of the shoulder (Charcoal: ~37 degrees, the wrist ~2.2 m
   ahead of the shoulder joint - an 8.1 m forearm cannot reach the ground under the shoulder
   without lifting the elbow above the back).
2. **Wrist** flexes: the metacarpals run back up along the trailing edge of the forearm; each is
   aimed so its knuckle ends at the height of the leading finger's, near the elbow.
3. **Fingers**: the fingers lie **side by side** (stacked outward, a closed fan seen edge-on - not
   one above the other like the slats of a deck chair) and run back along the upper flank, the
   outer phalanges curling a little down. Where they end is part of each silhouette: Charcoal and
   Leaf - past the hip, beside the tail base; Starlight - well back along the tail base (her
   long crossed wingtips, like an albatross); scout - just past the hip.
4. **Plagiopatagium** gathers in soft pleats between the finger bundle and the flank/leg (the
   draped membrane plus pleat shading in the membrane shader when folded).

Seen from the side the folded wing reads as: the forearm as a sloping front leg, the elbow a low
bony point on the upper flank, and a closed fan with the membrane pleated along the flank. Nothing
stands above the back; no bare finger ends hang free. Code: `plantBack` in poses.js.

### 1.5b The standing fold (rev. 2: the resting stance on two legs - RETIRED in rev. 3, see 1.5c; the fold itself is still used for Leaf's sit with `plantWrists: false`)

A resting bat's or a vulture's fold, sized for the rebalanced arm (humerus about 0.75 of the
forearm):

1. **Upper arm** back and down along the side of the chest, the elbow low behind the shoulder
   (elbow angle ~30 deg).
2. **Forearm** up and forward from the elbow, rising ~25 deg (level ground, whatever the trunk's
   pitch), so the **wrist sits beside the base of the neck**, a little outside the chest; the
   **thumb folded back** against the wrist (raised forward it read as a fist).
3. **Hand**: the metacarpals fold back down along the forearm, the knuckles end by the elbow; the
   **fingers lie pressed together in one bundle** back along the flank toward the thigh and the tail
   base (Starlight's longer, crossing over the tail base - her albatross wing).
4. The membrane gathers between the bundle, the arm and the flank (the elastin pulls it into
   crinkles); the plagiopatagium hangs from the bundle to the thigh and shank.

The trunk is raised 30 deg (giants) to 34 deg, the hip joint at ~0.9 of the standing hip height,
the balls of the feet ~0.36 of the trunk length ahead of the hip joint (under the centre of mass),
the neck rising ~48 deg at its base to ~14 deg at the head, the head pitched down ~16 deg; the tail
carried level from the hips for its first fifth, bending down over its middle third and lying on
the ground for the rest, sweeping a little to one side. Code: `poses.upright` (`foldUp`).

### 1.5c The low stance (rev. 3: the resting and walking carriage)

Daxtyn, 2026-10-16: *"make them low to the ground with their legs more towards the center of
their body"*. Every dragon (the newborn apart: it cannot stand yet) carries itself like a big,
heavy, ordinary animal - a crouching big cat, a crocodile in the high walk, a Komodo dragon:

1. **Hips under the middle of the body.** The hip joint sits at trunk station 0.68 (shoulder 0,
   tail base 1), ~0.42 of the trunk depth below the back. The femur runs forward and down from it,
   so the knee sits under the belly and the hock behind it; the thigh muscles fill the lower
   flank (a bird's "drumstick" inside the body contour) and the visible leg comes out of the
   middle of the animal.
2. **Low and level.** The chest's underside stands ~0.34 of the chest depth above the ground
   (Starlight and Leaf ~0.4, the scout ~0.36); the trunk is pitched up only ~4 degrees; the knees
   are bent in a deep crouch (Charcoal: hip joint 4.2 m up for a 7.6 m leg), the balls of the feet
   ~0.16 trunk lengths ahead of the hip joint, under the centre of mass, a little wider than the
   hips.
3. **Wings as front supports.** (rev. 3b) The upper arm runs back along the side of the chest
   from the shoulder joint, so the elbow sits on the upper flank **below the back line**; the
   forearm slopes forward and down to the wrist pad on the ground ahead of the shoulder, the thumb
   laid forward along the ground with its claw in the turf. The hand folds back up along the
   forearm, the knuckles level by the elbow, the fingers stacked side by side back along the
   upper flank (1.5); the membrane gathers in pleats between them. (rev. 3 had the elbow standing
   ~1.8 m above Charcoal's back - from the front it read as two raised arms.)
4. **Neck forward and low.** The neck leaves the withers rising ~14 degrees (Leaf 20, the scout
   18) and levels out; the head is carried about at the height of the back, pitched ~8 degrees
   down - never the rev. 2 giraffe neck.
5. **Tail low.** The base continues the trunk line, sags over its first half and lies on the
   ground from about its middle, sweeping a little to one side: a counterweight, not a prop.
6. **Alive.** A slow side-to-side weight shift, one foot and the opposite wrist a little ahead,
   breathing, small head movements and blinks (all pure functions of time).

Measured in the posed models (`poses.stand`, metres above the ground; chest = the trunk's
underside at station 0.25, back = its top there):

| | hip joint | knee | chest underside (x chest depth) | back | elbow (rev. 3 in brackets) | wrist pad ahead of the shoulder joint | head joint |
|---|---|---|---|---|---|---|---|
| Charcoal (36 m) | 4.12 | 3.55 | 1.56 (0.35) | 6.05 | **5.30** (7.85) | 2.2 | 6.76 |
| Leaf (9 m) | 1.04 | 1.04 | 0.39 (0.41) | 1.35 | **1.17** (2.17) | 0.72 | 1.60 |
| Starlight (72 m) | 6.56 | 6.86 | 3.08 (0.50) | 9.16 | **8.51** (14.90) | 6.2 | 11.14 |
| scout (5.9 m) | 0.58 | 0.70 | 0.24 (0.36) | 0.91 | **0.77** (1.31) | 0.49 | 1.12 |

(rev. 3b) The elbow is now below the back line beside it (Charcoal 0.5 m below the back where the
elbow sits, 4.5 m behind the shoulder joint; rev. 3 had it 1.8 m above the back). In the walk the
humerus swings fore and aft with the wrist's step and the wrists step in a range shifted a little
forward (a shorter wrist stance, duty ~0.55), so the elbow never rises above the back (Charcoal
2.6-6.0 m over the cycle).

(rev. 2 for comparison: Charcoal's hip joint 7.0 m with the trunk raised 30 degrees, his chest
underside ~4.3 m up.) The newborn does not stand: it lies sprawled or pushes up weakly (5.5).

Flight balance: the legs hang from the middle of the trunk and trail back under the tail base in
flight (as a bird's or a bat's), the plagiopatagium still runs from the flank over the thigh to
the ankle; the hip moving forward and the shorter inner wing chord both move the centre of mass
and the wing's aerodynamic centre forward together, so the balance of 1.8 holds.

Code: `poses.stand` (the low stance; design overrides in `stand.low`), `walk`, `crouch`, `lie`,
`sit`, `fire`, `launch`, `land` are built on it; `upright` is kept only as an alias of `stand`.

### 1.6 Moving on the ground

* **Stance (rev. 3):** weight about 60% on the feet, 40% on the wrist pads (giants), wrists a
  little outside and just ahead of the shoulder joint, feet under the middle of the body (1.5c).
* **Walk:** a lateral-sequence quadrupedal walk (left foot, left wrist, right foot, right
  wrist), duty factor 0.65-0.75, the wrist pads land outside the line of the feet (pterosaur
  trackways). The neck counter-swings, the tail swings opposite to the hips.
  Stride frequency from dynamic similarity with elephants: Charcoal ~0.32 strides/s (each limb
  steps every ~3 s, 1.5-2.5 m/s), Leaf ~0.6 strides/s, Starlight ~0.23 strides/s, scout ~0.8.
* **Run / bound (Leaf and the scout):** the vampire bat's bounding gait - the forelimbs (wrists)
  drive, the body vaults between them and the feet. Leaf reaches ~5 m/s.
* **Rear up:** pitch the trunk up 45-70 deg on the hind legs, the tail on the ground behind as a
  prop, the wings half open for balance.

### 1.7 Flight

* **Launch (the quadrupedal vault of pterosaurs and bats):** crouch (the chest comes down
  between the wrists), a short push with the hind legs, then the **wings' forearms vault** the
  body up and forward (the strongest push - the flight muscles are the biggest muscles), the wings
  unfold at the top of the vault and the first downstroke comes before the feet touch again. The
  big ones need several heavy beats close to the ground (ground effect) before they climb.
* **Flapping:** downstroke 55-60% of the cycle, the wing pronated (leading edge down) on the
  downstroke; on the upstroke the elbow and wrist flex and the hand sweeps up and back (less
  drag) - the bat and big-bird stroke. Stroke amplitude (peak to peak): Charcoal ~85 deg,
  Starlight ~75 deg, Leaf ~105 deg, scout ~95 deg. Each downstroke lifts the body a little; the
  neck keeps the head steady (all flying animals do). Legs trail back under the tail, toes curled;
  the feet steer the membrane.
* **Tempo** (Pennycuick 1990: f = 1.08 m^1/3 g^1/2 b^-1 S^-1/4 rho^-1/3, fitted on birds of 20 g to
  5 kg - extrapolated here, so read it as the right order of magnitude): Charcoal 0.42 Hz,
  Leaf 0.80 Hz, Starlight 0.24 Hz, scout 1.1 Hz. At these tempos the wingtips move at about the
  flight speed (advance ratio ~1), as in cruising birds - the beats read heavy and slow for the
  giants and quick for Leaf, as the screenplay's sound notes ask.
* **Glide / soar:** wings spread, a slight dihedral at the arm and a slight droop at the hand,
  fingers spread, the membrane cambered; small corrections at the wrists and the tail. Starlight
  glides and soars most of the time.
* **Banking:** the body rolls, the inner wing flexes a little (elbow and wrist), the outer one
  stays extended, the tail swings into the turn, the head stays level (it counter-rolls). Turn
  radius at 60 deg bank and a safe speed: Charcoal ~200 m, Starlight ~220 m, Leaf ~45 m, scout
  ~57 m (so the scout out-turns Charcoal by about 3.5x - the pursuit is won by position, as the
  screenplay requires).
* **Landing:** flare (body pitched up 40-60 deg, wings cupped forward, the tail down as an
  air brake), the feet reach forward and touch first, then the wrist pads come down (pterosaur
  landing trackways), a few steps of run-out. The giants land heavily: dust, flattened grass,
  skid marks.
* **Formation (realism bonus):** when not talking, Leaf flies just outboard of Charcoal's
  wingtip and a little behind it, in the upwash, as geese do - it saves him work. For the
  conversation and the nip he moves in beside Charcoal's head, ahead of Charcoal's wing (1.13).

### 1.8 Muscles, fat and where the mass sits

* **Flight muscles: 20-28% of body mass** (birds 15-25%, sprinters 30%; Charcoal ~17 t of it).
  The downstroke muscle (pectoralis) fills the deep keel of the chest and inserts on the
  deltopectoral crest of the humerus; the upstroke muscles (deltoid, trapezius, spinodeltoid
  as in bats) form a **muscular hump over the shoulder blades** - the "bison hump" of the giants.
* **Forearm muscles** are big (the wing is also a front leg): the forearm is thick at the elbow
  and tapers to tendons at the wrist.
* **Hind legs:** thigh muscles (iliotibialis, femorotibialis), the reptile's **caudofemoralis**
  from the tail base to the femur (the reason the tail base is thick), calf and Achilles tendon.
* **Centre of mass:** in the front half of the trunk, ~20% of the mean wing chord ahead of the
  centre of wing area for every design (i.e. at the wing's aerodynamic centre) - the dragons
  balance in flight; the long neck and the long tail balance each other.
* **Pneumatisation:** air sacs in the neck, trunk and the base of the tail and hollow
  thin-walled bones, as in birds and pterosaurs: whole-body density 0.58-0.62 for the adults
  (birds ~0.6-0.75). The bodies look heavy; they are lighter than they look.
* **Fat and skin folds:** loose skin under the throat (transverse gular folds), at the neck base,
  in the armpit and the groin, over the inside of the knee; fat along the belly and the tail base
  (giants: more; the scout: none).

### 1.9 Skin: the shared vocabulary (sizes per dragon in its section)

| zone | scale type | real reference |
|---|---|---|
| back, neck top, tail top | rows of **keeled osteoderm scutes** (bone plates in the skin) in longitudinal rows; a low double crest at the tail base that merges into a single crest along the tail | crocodile back and tail |
| flanks, upper limbs | flat, slightly overlapping scales with scattered enlarged tubercles; each scale surrounded by small granules | monitor lizard, Gila monster |
| belly | rectangular **transverse scutes** in rows from the keel to the vent | crocodile belly, snake ventrals |
| chest keel | smaller scales over the keel (the keel flexes with every downstroke) | |
| armpit, groin, inside of joints, around the eyes, along the membrane root | small **granular** scales and skin folds | monitor and crocodile joints |
| head | large flat plates on top of the skull and the snout, labial scales along the lips, granules round the eyes and nostrils | crocodile / monitor head |
| hind limbs | **scutellae** (wide transverse plates) down the front of the shank and metatarsus, **reticula** (small polygonal scales) behind, scutes on the tops of the toes, thick tuberculate **pads** under the toes and the heel | bird feet (any big bird: ostrich, cassowary, eagle) |
| wing arm | small overlapping scales on the leading edge and the outside of the forearm, smooth skin behind; **wrist pad**: a thick, cracked, dusty callus | camel knee callus, vampire bat thumb pad |
| wing fingers | thin smooth skin with fine transverse creases, no scales | bat fingers |
| membrane | no scales: leathery skin, fine wrinkles, elastin striations, vessels | bat wing |

Wear: rubbed and bleached scale crowns where the body touches the ground or tack (knees, wrist
pads, belly, sides of the toes), dust in the grooves, dried mud on the lower legs, healed scars
(raised, smoother skin, scale rows interrupted). Per dragon below.

### 1.10 Fire (Charcoal; Leaf's exists but is not shown in Episode 1; Starlight none in Episode 1)

* **Anatomy:** paired glands in the throat; ducts open on the palate behind the front teeth. Two
  secretions mix there and ignite on contact, as the bombardier beetle's chemistry does - so the
  flame **starts at the front teeth** and nothing inside the body burns or glows.
* **Tells (the audience reads the "Fire" command through them):** a deep inhale (the chest
  rises, the throat skin swells), the nostrils close (valves, like a crocodile's when it dives),
  the lips draw back from the front teeth, the jaw opens 25-30 deg, the tongue pulls back.
* **The jet** leaves from between the front teeth along the line of the snout, aimed by the head;
  brief and directed (screenplay 1F). Afterwards smoke curls from the mouth corners; soot dulls
  the front teeth and the lips. **No glow anywhere on the body**, before, during or after.
* Colours stay canon: Charcoal standard orange-red; Leaf purplish-blue, a little hotter.

### 1.11 Riding rigs and riders

* **Where the rider sits:** on the **withers, over the notarium** - the fused, stiffest part of
  the spine between the shoulder blades, just behind the neck base and between the wing roots.
  In flight it moves least (birds and pterosaurs brace the wing on it), and the neck base in
  front is a windbreak: the rider leans forward into its lee.
* **What holds the saddle - never a strap across a membrane:**
  1. a **breast collar** round the base of the neck and under the chest keel, in front of the
     wing roots;
  2. a **rear girth** through the **girth groove**: behind the upper arms, in front of the
     membrane's body root (the strip of plain skin left for it, 1.4), under the keel - where a
     horse's girth sits behind the elbows;
  3. the two joined under the keel by a short strap; on the giants a third band round the base
     of the neck.
* **Saddle types:** Leaf and the scout - a real straddle saddle (their backs are narrow enough);
  Charcoal and Starlight - a **riding rig**: a padded seat on a timber frame strapped to the
  withers, backrest, grab bar, foot boards, lap strap (nobody straddles a 3-5 m wide back).
* **Mounting:** the giants by the ground keepers' access rig / platform (screenplay 1B, 2A);
  Leaf lowers his chest to the ground (the sphinx crouch) and the rider steps on his forearm.

### 1.12 How plausible is the flying?

The calculator (section 10) gives for each dragon: mass from the body volume at the stated
density, wing area from the spread planform, wing loading, stall speed (lift coefficient 1.8 for a
cambered membrane wing; 1.5 for the scout's thin fast wing), wingbeat frequency (Pennycuick
1990), take-off downwash (actuator disc) and the turn radius.

* For comparison, real flyers scaled up in proportion would carry **60-100 x mass^(1/3) N/m2**
  of wing loading (albatross ~140 N/m2, swan ~200; the biggest pterosaurs, at 200-250 kg,
  probably a few hundred). Every dragon here sits **well under** that line (Charcoal 1180 against 2600-4300 for a
  scaled-up bird of his mass; Starlight 1330 against 4200-7000): they have bigger wings and
  lighter bodies than a scaled-up bird would.
* That is still far beyond any living animal; the design does not claim real physics, only that
  nothing on screen contradicts what audiences know from birds and bats: a big wing area, slow
  heavy beats for big animals, quick beats for small ones, giants that need room and effort to
  take off and turn, and riders on the stiffest part of the back.

### 1.13 Story beats the bodies must make possible (screenplay)

| beat | how the design does it |
|---|---|
| 1A the hatchling emerges wet and weak, slips against the shell, Alexandria supports it with a cloth; its head turns to Abby's voice; its side rises | newborn proportions (big head, weak arms, big feet), sprawl and push-up poses on the wing-wrists, breathing on the flanks (5) |
| 1B Charcoal rests, breathing moves the air; Remi reaches a riding strap | sphinx lie with the wings folded as a tent; the rig's straps hang within Remi's reach from the girth groove (2) |
| 1B Leaf sits upright like a dog; pulls the equipment away; "Leaf rises" | the haunch sit with the wrists planted in front (3); Abby mounts when he crouches; he stands up from the crouch |
| 1C Leaf's first beat shakes loose grass; Charcoal's takeoff devastates the ground, his wings open until the frame can't hold them | downwash: Leaf ~5 m/s mean (gusts ~10), Charcoal ~10 m/s mean, gusts ~20+ m/s under each beat; Charcoal's vault leaves two wrist-pad craters and four claw furrows a foot (2) |
| 1C/1D Charcoal draws level with Leaf; Leaf adjusts with quicker wingbeats; riders close enough to talk | shared cruise ~40 m/s: Charcoal near his most efficient speed (0.42 Hz), Leaf near his fast end (0.8-1.1 Hz); Leaf flies beside Charcoal's head, ahead of his wing, ~10-12 m from Remi |
| 1D Charcoal takes Leaf's whole head in his mouth and releases it unharmed; Abby stays outside | Charcoal's mouth 3.3 m deep, holds Leaf's 1.0 m head at a 25 deg gape with the teeth clear; Abby 1.4 m clear of Charcoal's snout (2.10) |
| 1E the scout passes Leaf at terrifying speed; the wake rolls Leaf | the scout cruises 35-45 m/s and sprints 60-70; its wingtip vortex hits Leaf's 16 m wing (6) |
| 1F Charcoal is not faster; he wins by position; the turns are expensive; jaws miss; brief fire; catches the scout; tears off its LEFT wing | turn radius 200 m vs 57 m; the scout fits his jaws; the wing separates at the shoulder (6.9) |
| 1F/2A the scout falls; Leaf lands carefully; Charcoal lands heavily away from Abby | one-winged fall; landing flare and wrist-pad touch-down (1.7) |
| 3B/3C Starlight approaches, dives with the wings partly folded, opens them with crushing force, sweeps low, physical impact on the roofline, climbs with visible effort, second pass, no fire | the half-folded stoop, the talon strike with raptor feet, 0.24 Hz beats, a 130 m wingspan over the square (4) |

---

## 2. Charcoal (Remi's dragon)

**Canon (`DRAGONS.md`):** completely black scales, blue eyes, gray wing membrane with black
stripes throughout (the stripes run along the wing's finger bones), standard orange-red fire,
about 36 m long; immense, generally calm, slow to anger; his takeoff devastates the ground.

**Silhouette:** a massive, heavy brute - a deep keel chest and a muscular hump over the
shoulders, a thick neck carried low and forward, a big blunt head with heavy back-swept horns,
thick forearms like columns, a thick tail base. At a distance: a black mass with high
"shoulders" (the folded wings), a low head and heavy horns.

### 2.1 Numbers

| | value |
|---|---|
| length (snout to tail tip) | 36.0 m = skull 3.6 + neck 6.9 + trunk 9.3 + tail 16.2 |
| chest | 2.9 m wide x 4.5 m deep (keel to spine); hips 2.35 x 2.6 m |
| standing | hip joint 7.0 m, shoulder joint 7.5 m, elbows 8.4 m, top of the hump ~9.1 m, head carried at ~12 m (raised: ~14 m) |
| lying (sphinx) | back ~4.5 m, head on the ground or held at ~3 m |
| mass | ~81 t (density 0.60): trunk 41 t, wings 15 t, neck 9.6 t, tail 7.9 t, legs 5.8 t, head 1.6 t; flight muscles ~17 t |
| wingspan / area / aspect | 63.6 m (1.77 x length) / 678 m2 (membrane 660 m2) / 6.0 |
| wing loading / stall / cruise | 1180 N/m2 / ~33 m/s / ~42 m/s (150 km/h); top ~55-60 m/s |
| wingbeat | 0.42 Hz cruise (2.4 s a beat), take-off and climb 0.45-0.5 Hz with bigger amplitude |
| take-off downwash | ~10 m/s mean, ~20-25 m/s gusts under each downstroke |
| turn | radius ~200 m at 60 deg bank |

### 2.2 Skeleton

* **Neck:** 11 cervicals (~0.63 m each). **Tail:** 38 caudals, the outer 18 stiffened.
* **Wing:** humerus 5.4 m; radius/ulna 7.2 m (rev. 2; was 4.2 / 8.4); three long fingers - **III** (wing tip):
  metacarpal 7.4 + phalanges 5.2 / 3.9 / 2.3 = 18.8 m; **IV**: 6.8 + 5.0 / 3.4 / 1.6 = 16.8 m;
  **V**: 6.2 + 4.6 / 2.9 / 1.2 = 14.9 m. Digit II is short and bound into the leading edge
  beside III (as in bats). **Thumb:** metacarpal 0.7, phalanx 0.55, claw 0.6 m (thick, blunt,
  worn - it carries weight). Spread angles from the wrist (glide): III -6 deg (swept back from
  lateral), IV -32, V -64.
* **Leg:** femur 3.1, tibia 3.4, metatarsus 1.5 m, toe III 1.3 m + claw 0.42 m; semi-digitigrade
  with a big fibro-fatty **heel pad** (elephant) under the ankle; 3 forward toes + a hallux that
  grips (cliff perching). Claws thick, blunt, chipped.
* **Membrane** reaches the **ankle**.

### 2.3 Head and horns

* **Skull 3.6 m:** deep and broad - 1.7 m across the jaw muscles, 1.55 m deep at the back; the
  snout (in front of the eye) is 58% of the skull, broad and blunt (0.68 m wide at the tip), a
  raised nasal ridge (saltwater crocodile breadth with a Komodo's height); a heavy bony **brow
  shelf** over the eye.
* **Jaws:** the gape runs back to below the back corner of the eye; huge jaw-closing muscles
  bulge behind the eye; the lower jaw is massive with a knobby chin. Mouth interior 3.3 m from
  the front teeth to the gape corner, ~1.0-1.2 m wide inside the tooth rows, opens to 50 deg.
* **Teeth:** 15 a side above (4 premaxillary + 11 maxillary), 14 below; conical, recurved; the
  4th upper and 4th lower are the biggest (~0.30 m showing), rear teeth ~0.08 m; the 4th lower
  tooth sits in a notch of the upper jaw (crocodile); thick scaly lips cover the small teeth and
  leave the big ones showing; stained ivory, a few broken or missing, spacing uneven.
* **Nostrils:** paired slits on a raised boss near the snout tip, on top, with valves.
* **Eyes:** 0.29 m (8% of the skull), set lateral and a little forward (~35 deg binocular
  overlap), deep under the brow; **BLUE** iris (deep blue with lighter flecks), vertical slit
  pupil (round-ish oval when dilated), a nictitating membrane that sweeps across in flight.
* **Ear:** a tympanum behind the jaw hinge under a scaly flap. Throat: loose gular folds.
* **Horns - 10, fixed in every shot:**
  1. **Main pair** from the rear corners of the skull roof: base oval 0.48 x 0.36 m (rev. 1), 2.6 m along
     the curve; they sweep **back along the neck line**, then curve **out and down**, the tips
     turning slightly forward (water buffalo / mouflon sweep). Annual growth ridges, rough dull
     keratin, worn tips; the **LEFT horn's tip is broken off** (~12 cm, an old break, rounded by
     wear) - proposed, a continuity lock once approved.
  2. **Brow pair:** behind and above the eyes, conical, 0.7 m long, base 0.22 m, pointing up and
     back at 35 deg to the skull line.
  3. **Jaw knobs:** 3 blunt osteoderm horns along each jaw angle, 0.18 / 0.26 / 0.34 m, pointing
     back.

### 2.4 Head, neck, trunk and tail shape

| part | full width x depth at each station (m) |
|---|---|
| head, back of skull -> snout tip (s = 0, 0.25, 0.5, 0.75, 1) | 1.8 x 1.85 / 1.8 x 1.8 / 1.45 x 1.36 / 1.16 x 1.02 / 0.86 x 0.68 (rev. 1: deeper and broader, so the skull stands clear of the neck) |
| neck, head end -> base (s = 0, 0.5, 1) | 0.95 x 1.22 / 1.3 x 1.9 / 1.85 x 2.9 (rev. 1: the neck narrows behind the jaws) |
| trunk, shoulder -> hip (s = 0, 0.25, 0.6, 0.85, 1) | 2.7 x 4.2 / 2.9 x 4.5 / 2.4 x 3.4 / 2.2 x 2.8 / 2.35 x 2.6 |
| tail, base -> tip (s = 0, 0.15, 0.35, 0.6, 0.85, 1) | 1.95 x 2.15 / 1.5 x 1.7 / 0.95 x 1.1 / 0.48 x 0.56 / 0.19 x 0.23 / 0.04 x 0.04 |

The neck is deep and laterally flattened (a horse's or a crocodile's neck), carried low and
forward in an S; the tail is taller than wide, thick for its first fifth (caudofemoralis and fat),
then tapering fast; its last third rests on the ground at rest.

### 2.5 Muscles and fat

The heaviest build: the **shoulder hump** (upstroke muscles) rises ~0.5 m above the spine over
the shoulder blades; the keel chest is deep and rounded; the forearms are thick (1.15 m at the
elbow, 0.8 m above the wrist); the thighs are massive (1.5 m). Fat on the belly and the tail base,
heavy loose skin under the throat and at the neck base (deep transverse folds), a dewlap.

### 2.6 Skin

* **Colour (canon): completely black** - sRGB ~#141416 (linear albedo ~0.012-0.018) everywhere,
  belly included; no pattern. What keeps him readable in daylight is surface, not pigment: glossy
  rubbed scale crowns against matte dusty grooves, sky reflections in broad bands across flat
  scales, warm grey dust in the crevices, dried mud on the feet and wrist pads.
* **Sizes:** back - 6 rows of keeled osteoderm scutes 25-40 cm, the paravertebral rows the
  largest; flanks - flat scales 6-12 cm with tubercles of 15-20 cm scattered on the upper flank
  (Komodo-dragon "chain mail" of osteoderms under all of it: an old animal); belly - transverse
  scutes ~40 x 15 cm; neck 4-8 cm; head plates 10-20 cm, eye granules 1-2 cm; joint granules
  1-3 cm; shank scutellae 15-25 cm; wrist pad ~1.2 x 0.8 m callus.
* **Wear and scars:** an old animal: worn, bleached-dark-grey scale crowns on the knees, wrist
  pads, elbows and belly; several healed scars (raised, smooth, scale rows interrupted) on the
  neck and the left flank; the chipped left horn; chipped claws. No fresh wounds (screenplay).
* **Teeth** stained ivory (darker toward the gums), a few old dark ones; gums and tongue dark
  grey (melanistic, like a chow chow's tongue).

### 2.7 Wings (canon colours)

* Membrane **GRAY** (sRGB ~#7d8086, linear albedo ~0.2: it must read clearly gray next to the
  black body in daylight) with **BLACK stripes throughout**: a black band follows **every finger
  bone** (III, IV, V and the forearm), and further black bands run between them, parallel to the
  fingers, fanning out from the wrist - 2 between neighbouring fingers, 2-3 across the
  plagiopatagium. Bands are 0.15 m wide at the wrist, widening to ~6% of their length at the
  trailing edge, with soft wavy edges that swell, taper and occasionally break (an animal's
  pattern, never a painted stripe). The pigment also blocks the light through the membrane.
* Bones and their skin bands black; leading edge (propatagium) black.

### 2.8 Movement and behaviour

* **Stands** quadrupedally, still, the head carried low; breathes slowly (~5 breaths a minute).
  Calm: slow deliberate head turns, the eyes move before the head.
* **Walks** slowly (1.5-2.5 m/s, each limb stepping every ~3 s), the ground takes his weight: the wrist pads
  and the feet sink into turf.
* **Rests** (1B, 2C) in the **sphinx lie**: belly down, hind legs folded under, wrists forward
  under the chest, the folded wings like a tent along the flanks, the neck curved round, the chin
  on the ground or lifted; the breathing visibly lifts the ribs and the folded wing.
* **Take-off (1C) - "devastates the ground":** (1) he rises and crouches, the chest drops between
  the wrists, the hind legs gather (1.5 s); (2) the hind legs kick (the claws rip four 3 m furrows
  of turf each) and the forearms **vault** him up ~6 m (0.6 s) - each wrist pad leaves a crater
  ~2 m across; (3) the wings unfold at the top of the vault (1.2 s) to the full 64 m; (4) the first
  downstroke blasts ~20-25 m/s of air down: grass flattened in a ring ~60 m wide, dust, loose
  turf and small stones thrown; (5) 4-6 heavy beats in ground effect, climbing slowly. The
  ground keepers stand well outside his launch space.
* **Flaps** at 0.42 Hz, amplitude ~85 deg; **glides** a lot; turns are wide and costly (the air
  shakes under each correction).
* **Lands** (2A) heavily: flare, feet first, wrist pads slam down, a short skid, dust; he lands
  away from Abby and Leaf.
* **Head-in-mouth (1D):** see 2.10.
* **Bite on the scout (1F):** the scout's body (0.67 m deep) fits easily; he bites across its
  back at the left wing root; on "Hold" his jaws open.
* **Fire (1F):** as in 1.10: brief and directed, orange-red, from between the front teeth.

### 2.9 Riding rig (Remi)

Riding rig on the withers over the notarium, the seat ~1.2 m behind the neck base, seat height
~9.5 m when he stands (an access rig or platform for mounting; ~5 m when he lies). Breast collar
and axillary girth as 1.11, plus a neck band; a grab bar and foot boards; Remi sits upright in a
padded seat with a backrest and a lap strap and leans forward into the lee of the neck in fast
flight. Straps that Remi reaches for from the ground (1B) hang from the girth groove.

### 2.10 The head-in-mouth check (1D)

Leaf's head (1.0 m long, 0.54 m wide, 0.54 m deep; horns lying back along his neck) goes into
Charcoal's mouth **snout first**: Charcoal curls his neck round so that his head faces Leaf's,
opens to ~45 deg, closes to a **25 deg holding gape**. At that gape the tooth tips clear Leaf's
skin by ~0.1-0.2 m; lips, tongue and palate hold him (a crocodile carrying its young). Leaf's
horn tips stay just outside the lips. **Abby, on the saddle at the base of Leaf's neck, is ~1.4 m
clear of Charcoal's snout tip.** Side view, one scale (`#` Charcoal, `+` Leaf, `%` Abby, `:`
teeth; one column ~0.073 m):

```
                                                                      .################
                                                               .#######################.
                                                      ..################################
                                             .##########################################.
                                     .###################################################
                  .%%                ####################################################
                  %%%%               #####################################################
                 .%%%                      . :: :. :: .  :. :  : .: .. .: .. ::.::########
                 %%%%                    .++++  +  .                     :  :.############
                 %%%%                        ++++++++++++++.        .  :.:################
                .%%%%          ..++++++++++++++++++++++++++.     .: :#####################
               .%%%%%+.+++++++++++++++++++++++++++++++++.   .: ::#####################.
 .++++++++++++++++++++++++++++++++++++++++++++++++++.  :: .:.####################.
 ++++++++++++++++++++++++++++++++++++++..     ..  .. ::.:##################.
.++++++++++++++++++++++++++++++++                . :#################.
++++++++++++++++++++++++++++.                  .###############.
+++++++++++++++++++++++++++                  .###########.
+++++++++++++++++.....                        ######.
```

### 2.11 Real-animal references

Saltwater crocodile and Komodo dragon (head, teeth, lips, osteoderm armour, gular folds); American
bison and gorilla (shoulder hump, columnar forearms); elephant (heel pad, slow heavy walk); water
buffalo and mouflon (horn sweep and growth rings); vulture and condor (broad heavy wings, few
beats, long glides); azhdarchid pterosaurs (quadrupedal launch, wing-walking); vampire bat (wrist
and thumb walking); crocodile mothers (carrying young in the jaws).

### 2.12 Sketches (exact proportions from the calculator)

Side, standing on the feet and the folded wings' wrists (one column = 0.37 m, one
row = 2 columns; `#` body, `%` far-side limbs, `:` folded membrane, `+` horns):

```
                                                                                .+++++
                                                                                    .++.+
                                                                            .#########. +
                                                                       .#################
                                                                  ..#######################.
                                                        ..####################.        .#####
                                         ###..#############################
                                      .##################################.
                                #########:::::::::#########:::::#########
                             ###::::::::###################:::##########.
                           ##:::::#####::::###########################.
                       .#######:##:::::::::.####.      ..#########..
                    ########.   .::::##::::  ###.        .###
                #######            .::::::: ###.          ###
            .####.                    .::::###            ###.
        .####.                           ::##              ###
    ...#.                                 .##              ###
   ..                                      .#####.         .###.#.
```

Top, gliding (one column = 0.89 m; `:` membrane, `#` body and bones):

```
                                   ##
                                  .##.
                                  +##+
                                  +##+
                                   ##
            .....:::#####...    ..####..    ...#####:::.....
.:::::::::::::::::::::::::#######:####:#######:::::::::::::::::::::::::.
 :::::::::::::::::::::::::::::::::####:::::::::::::::::::::::::::::::::
   :::::::::::::::::::::::::::::::####:::::::::::::::::::::::::::::::
    ::::::::::::::::::::::::::::::####::::::::::::::::::::::::::::::
     .::::::::::::::::::::::::::::####::::::::::::::::::::::::::::.
         .:::::::::::::::::::::::######:::::::::::::::::::::::.
            :::::::::::::::::::::#.##.#:::::::::::::::::::::
                          .:::::#. ## .#:::::.
                               #.  ##  .#
                              ..   ##   ..
                                   ##
                                   ..
                                   ..
                                    .
```

Front, gliding (one column = 0.71 m):

```
 . ......::::::::::::::::::::::.....      .+##+.      .....::::::::::::::::::::::......
                 ..........::::::::::::::::####::::::::::::::::.........
                                     ...:::####:::...
                                           ####
```

---

## 3. Leaf (Abby's dragon)

**Canon (`DRAGONS.md`):** about 25% of Charcoal's size (working reading: length 9.0 m), dark green
scales, yellow eyes, light green membrane, a purplish-blue fire a little hotter than normal
dragon fire; not fully grown; no fire on screen in Episode 1. The dog-like sit was an open
question; **this design keeps it** (proposed, 3.7).

**Silhouette:** compact and young - a big round head with big eyes on a slim neck, a lean body,
long legs and forearms for his size (young animals are leggy), short smooth horns, a lively tail.
Next to Charcoal: about a quarter of his length and 1/73 of his mass.

### 3.1 Numbers

| | value |
|---|---|
| length | 9.0 m = skull 1.0 + neck 1.6 + trunk 2.3 + tail 4.1 |
| chest | 0.70 m wide x 0.96 m deep |
| standing | hip 2.05 m, shoulder joint 1.9 m, elbows 2.16 m, back ~2.2 m, head ~3.4 m |
| sitting (dog-like) | head ~3.9 m, shoulder joint 2.3 m, wrists 1.8 m in front of the toes |
| mass | ~1.1 t (density 0.62); flight muscles ~0.22 t |
| wingspan / area / aspect | 16.3 m (1.81 x length) / 41 m2 / 6.5 |
| wing loading / stall / cruise | 270 N/m2 / ~16 m/s / 20-25 m/s easy, ~40 m/s flat out (keeping up with Charcoal) |
| wingbeat | 0.80 Hz, up to ~1.1 Hz when working; uneven corrective beats after the scout's pass |
| downwash at take-off | ~5 m/s mean, ~10 m/s gusts (shakes loose grass) |
| turn | radius ~45 m at 60 deg bank |

### 3.2 Skeleton

* **Neck:** 10 cervicals. **Tail:** 36 caudals, the outer half only partly stiffened (young) - it
  can curl round in the sit.
* **Wing:** humerus 1.35 m; forearm 1.85 m (rev. 2); **III** 1.9 + 1.35 / 1.0 / 0.6 = 4.85 m; **IV** 1.75 +
  1.25 / 0.85 / 0.4 = 4.25 m; **V** 1.6 + 1.1 / 0.72 / 0.3 = 3.72 m; thumb 0.18 + 0.13, claw 0.14 m
  (sharp, little worn). Spread angles III -6, IV -33, V -65 deg.
* **Leg:** femur 0.85, tibia 0.98, metatarsus 0.52, toe III 0.36 m + claw 0.10 m; digitigrade
  (a longer, springier metatarsus than Charcoal's); 3 forward toes + hallux; claws sharp.
* **Membrane** reaches the **upper shank** (just below the knee).

### 3.3 Head and horns

* **Skull 1.0 m**, young proportions: a big rounded braincase, a short snout (48% of the skull),
  0.54 m wide and 0.54 m deep at the back; a softer brow, smooth cheeks, slimmer jaw muscles.
  Narrow enough to go into Charcoal's mouth whole (2.10).
* **Teeth:** 16 above / 15 below a side, small and sharp (largest ~5 cm), mostly hidden by the
  lips (a young animal's clean white teeth).
* **Eyes:** big - 0.11 m (11% of the skull); **YELLOW** iris (golden yellow, darker ring at the
  edge), black vertical slit pupil; very mobile, he watches everything (1B, 1D, 2A).
* **Nostrils** small, on top near the tip.
* **Horns - 4, fixed:**
  1. one pair of **short, smooth, pointed horns** from the back corners of the skull, 0.42 m along
     the curve, base 0.07 m, curving back along the line of the neck and slightly up, the tips
     dipping down - no growth ridges yet, the tips slightly translucent;
  2. a pair of small **brow nubs** (0.06 m) over the eyes.

### 3.4 Shape (full width x depth, metres)

| part | full width x depth at each station (m) |
|---|---|
| head, back of skull -> snout tip (s = 0, 0.3, 0.55, 0.8, 1) | 0.54 x 0.54 / 0.52 x 0.52 / 0.38 x 0.34 / 0.28 x 0.24 / 0.19 x 0.16 |
| neck, head end -> base (s = 0, 0.5, 1) | 0.3 x 0.37 / 0.35 x 0.43 / 0.48 x 0.62 |
| trunk, shoulder -> hip (s = 0, 0.25, 0.6, 0.85, 1) | 0.66 x 0.92 / 0.7 x 0.96 / 0.56 x 0.74 / 0.5 x 0.6 / 0.52 x 0.56 |
| tail, base -> tip (s = 0, 0.15, 0.35, 0.6, 0.85, 1) | 0.44 x 0.48 / 0.33 x 0.37 / 0.21 x 0.24 / 0.11 x 0.13 / 0.045 x 0.05 / 0.01 x 0.01 |

### 3.5 Muscles and fat

Lean: visible muscle definition on the thighs and forearms, a modest keel, no hump yet (it
develops with age), little fat, thin loose skin at the throat and in the armpits.

### 3.6 Skin

* **Colour (canon): dark green** scales - sRGB ~#1f3a22 (deep forest green), each scale its own
  shade from olive-dark to blue-green-dark; the belly a little lighter but still dark green. Horns
  and claws dark olive-brown keratin. No other colour.
* **Sizes (finer than Charcoal's - he is young):** few, small osteoderms (juvenile Komodo dragons
  have none - they come with age): back scutes 6-9 cm in 2 rows; flanks 1.5-3 cm; belly scutes
  9 x 3.5 cm; neck and limbs 1-2 cm; head plates 2-4 cm, eye granules 3-5 mm; wrist pad callus
  thin (0.25 x 0.15 m).
* **Wear:** fresh glossy scales, small scuffs on the knees, wrist pads and claws, dust on the feet.
  No scars.
* **Membrane (canon): LIGHT GREEN** - sRGB ~#a6d17c, translucent: against the sun it glows with
  transmitted light like a leaf (lit from behind - never emissive), darker green bands along the
  bones, a fine vessel tracery.

### 3.7 Movement and behaviour

* **The dog-like sit (1B):** haunches down - the thighs folded forward along the flanks, the
  shanks back, the metatarsi flat on the ground; the trunk pitched up ~55 deg; (rev. 2) the
  **wings stay folded against the body, the wrists off the ground** (planted wrists read as a
  dog's front legs - four legs); neck up in an S, head
  level; the tail along the ground curling round the side. Proportions:

```
                                           .%%. .
                                             ....
                                          ##########.
                                       .###############
                                      ###############..
                                     ######
                                     #####
                                    #######
                                   #########.
                                  .###############.
                                 ######++##########.
                                #####+++++++:::++###
                               #####+++++++::::+%###
                              #####++++++:::::.%%###         %%
                             ####++++++:::::.  %%###        .%%.
                           .####++++++::::.    .%%##         %%.
                          .###++++++:::..       %%##         %%
                        .#####++++:..           %%##         %%
                 .###############%..            %%##.        %%.
        ..#################.+######%%           %%##.        %%.
.##################################..............%###. ......%%.......
```

  (one column ~0.10 m; `#` Leaf, `+` folded membrane, `%` Abby ~1.6 m)
* **Mounting:** from the sit he lowers into the sphinx crouch (chest on the ground), Abby steps
  on his left forearm and swings into the saddle; then **"Leaf rises"** to the standing stance.
* **Walks** briskly, quick head turns; **bounds** like a vampire bat when excited (wrists drive).
* **Take-off (1C):** a quick crouch-and-vault (0.3 s), wings open, the first beat shakes the grass
  (downwash ~10 m/s gusts).
* **Flight:** 0.8 Hz normally; beside Charcoal at ~40 m/s he works at ~1.0-1.1 Hz (screenplay:
  quicker wingbeats); after the scout's pass, rapid uneven corrective beats (left and right wings
  out of step, amplitude changing), the tail and feet correcting.
* **The nip (1D):** a quick snap at Charcoal's neck/cheek from beside his head, jaws 30 deg; then,
  held, his eyes go wide; released, he jerks his head back and veers off.
* **Lands (2A)** carefully: a longer flare, soft touch, the body kept level for his rider, then he
  turns his head to look at Abby; takes a step after her (wrist forward first).

### 3.8 Saddle (Abby)

A straddle saddle on the withers over the notarium, 0.3-0.4 m behind the neck base, seat ~2.3 m
up when he stands (~1.2 m in the crouch). The back between the scapular humps is ~0.55 m wide -
like a draught horse. Breast collar + axillary girth (1.11), short stirrups, Abby's knees in front
of the wing roots, a grab bar or pommel strap in front.

### 3.9 Real-animal references

Juvenile Komodo dragon (no osteoderms yet, fine scales, long limbs), young eagles and young ibex
(smooth young horns), vampire bat (bounding run), dog (the sit), swallow / kite (agile flight),
green iguana and emerald tree boa (dark green scale shading), a backlit leaf (the membrane).

### 3.10 Sketches

Side (one column = 0.093 m):

```
                                                                                 .++
                                                                                   ++ +
                                                                              ..######
                                                                         .##############
                                                                      #####################
                                                                    ##########.   .#########
                                         ##################################
                                      .##################################
                                  .######################################
                               #######::::::###############:::::#########
                           .###::::::::#################################
                        .#####::::###:::::::::###.....   ###########.
                     #######.   #.  ..::::::::###        ###
                 .#####.            .#.      ###          ##.
              .####.                        ###           ###
           ####.                           ###            ###
       .###.                               ##              ##.
    ....                                    ##             ###
   ..                                        #####.        .##.#.
```

Top, gliding (one column = 0.23 m):

```
                                   ##
                                  .##.
                                  +##+
                                   ##
                                   ##
          ......::::######..    ..####..    ..######::::.....
.::::::::::::::::::::::::::######:####:######::::::::::::::::::::::::::.
 .::::::::::::::::::::::::::::::::####::::::::::::::::::::::::::::::::.
   :::::::::::::::::::::::::::::::####:::::::::::::::::::::::::::::::
    :::::::::::::::::::::::::::::::##:::::::::::::::::::::::::::::::
     .::::::::::::::::::::::::::::###:::::::::::::::::::::::::::::.
         .::::::::::::::::::::::::####::::::::::::::::::::::::.
            .:::::..     ..::::::#.##.#::::::..     ..:::::.
                                #. ## .#
                               #.  ##  .#
                              ..   ##   ..
                              .    .#    .
                                   ..
                                   ..
```

Front, gliding (one column = 0.18 m):

```
   ........::::::::::::::::::::...        ..%%..        ...::::::::::::::::::::........
                           ..::::::::::::::#%%#::::::::::::::..
                                      ..:::####:::..
                                           ####
```

---

## 4. Starlight (Queen Fall's dragon, "Queen of Dragons")

**From the screenplay:** albino; reflective, crystal-like white scales - reflective, never
glowing, not literal crystal; about twice Charcoal's size; no wounds and no fire in Episode 1;
she attacks Cling by dive-bombing it.

**Size (proposed; open question 9.1):** **72 m** - twice Charcoal's length, the same "size =
length" reading `DRAGONS.md` uses for Leaf. She is built long and slender rather than as a
scaled-up Charcoal, so at twice his length she weighs ~4.2x his mass (not 8x). If Daxtyn means
"looks twice as big" (silhouette area), the alternative is ~51 m; every number in this section
scales with the one length parameter.

**Silhouette:** immense, long and elegant - a long swan-like neck, a narrow elegant head under a
crown of horns, a long tail, long legs with raptor feet, and very long wings whose folded tips
cross back over the tail base like an albatross's. Pale against any sky.

### 4.1 Numbers

| | value |
|---|---|
| length | 72 m = skull 5.6 + neck 16.0 + trunk 16.0 + tail 34.4 |
| chest | 4.5 m wide x 6.1 m deep |
| standing | hip 14.4 m, shoulder joint 14.8 m, elbows 17 m, head ~26 m |
| mass | ~340 t (density 0.58); flight muscles ~75 t |
| wingspan / area / aspect | 131.6 m (1.83 x length) / 2517 m2 / 6.9 |
| wing loading / stall / cruise | 1330 N/m2 / ~35 m/s / ~45 m/s; in the stoop 70-90 m/s |
| wingbeat | 0.24 Hz (a beat every ~4 s); she glides and soars most of the time |
| downwash | ~10 m/s mean at take-off; in the low pass over Cling each beat sends ~20 m/s gusts down |
| turn | radius ~220 m at 60 deg bank - redirecting takes time and visible effort (screenplay 3C) |

### 4.2 Skeleton

* **Neck:** 14 cervicals (~1.15 m each). **Tail:** 42 caudals, the outer half stiffened.
* **Wing - four long fingers** (the broadest wing): humerus 10.2 m; forearm 14.8 m (rev. 2); **II** (free,
  along the leading edge) 14.5 + 5.0 / 2.5 = 22 m; **III** (tip) 15.5 + 11.5 / 8.5 / 5.0 = 40.5 m;
  **IV** 14.0 + 10.5 / 7.2 / 3.4 = 35.1 m; **V** 12.8 + 9.0 / 6.0 / 2.6 = 30.4 m; thumb 1.3 + 0.9,
  claw 1.0 m. Spread angles: II +2, III -5, IV -28, V -52 deg. Membrane to the **ankle**.
* **Leg (raptor):** femur 5.8, tibia 7.0, metatarsus 3.8 m (long), toes long (III 3.6 m) with big
  curved **talons** (1.3 m); the hallux is large and opposable with the biggest talon (the eagle's
  killing claw) - her weapon in the strike.

### 4.3 Head and horns

* **Skull 5.6 m:** long, narrow and elegant (length 2.3x its width; Charcoal's is 2.1x), a
  straight dorsal profile without a nasal bump, a long tapering snout (60% of the skull), high
  brow ridges sweeping back into the crown.
* **Teeth:** 18 above / 17 below a side, long and slender (~0.36 m the largest), mostly hidden by
  the lips - a refined mouth.
* **Eyes:** 0.39 m; albino (proposed colour): **pale rose-violet iris with a red reflex** in the
  pupil when light shines in; she narrows the slit pupils hard in bright light (albino animals are
  light-sensitive) - a character detail.
* **Horns - 8, the "crown", fixed:**
  1. **main pair:** from the rear skull corners, long slender gently S-curved horns, 6.4 m along
     the curve (1.15x the skull), base 0.36 m: back and UP above the neck line, then back and down
     at the tips (sable antelope's scimitar, longer);
  2. **the crown:** 3 pairs along the back edge of the skull, fanning out and back like a frill,
     2.4 / 1.7 / 1.1 m, bases 0.20 / 0.17 / 0.14 m (the horned lizard's crown of temporal horns).
  Pale ivory keratin, polished, fine growth lines; translucent at the very tips against the light
  (keratin is), never glowing.

### 4.4 Shape (full width x depth, metres)

| part | full width x depth at each station (m) |
|---|---|
| head, back of skull -> snout tip (s = 0, 0.25, 0.5, 0.75, 1) | 2.4 x 2.1 / 2.4 x 2.05 / 1.8 x 1.4 / 1.4 x 1 / 0.95 x 0.66 |
| neck, head end -> base (s = 0, 0.5, 1) | 1.5 x 1.75 / 1.95 x 2.3 / 2.9 x 3.6 |
| trunk, shoulder -> hip (s = 0, 0.25, 0.6, 0.85, 1) | 4.2 x 5.8 / 4.5 x 6.1 / 3.7 x 4.7 / 3.3 x 3.8 / 3.5 x 3.6 |
| tail, base -> tip (s = 0, 0.15, 0.35, 0.6, 0.85, 1) | 2.9 x 3.2 / 2.2 x 2.45 / 1.4 x 1.6 / 0.72 x 0.82 / 0.27 x 0.3 / 0.05 x 0.05 |

### 4.5 Muscles

Sleek: a deep keel and strong but smooth shoulders (a soarer: less hump than Charcoal), long
smooth thigh muscles, tendinous lower legs, no visible fat, little loose skin.

### 4.6 Skin and colour

* **Albino white** scales: linear albedo ~0.65-0.72 (never 0.9+: it would clip in daylight), the
  faintest warm/cool variation scale to scale; where the skin is thin (round the eyes, the lips,
  the inside of the joints, the membrane) blood shows through as an ivory-pink flush (albinism
  has no melanin).
* **"Crystal-like" = reflective surface, not crystal and not light:** each body scale is a flat,
  hard, polished plate tilted its own way (facets), so the sun breaks into many small glints and
  the sky into a mosaic of reflections that move as she moves (the satin-and-glint of a white
  albino python's scales, polished); crevices only a little darker than the scales. **No
  emission, no sparkle shader, no transparency.**
* **Sizes:** back scutes 30-45 cm (low, smooth keels); flanks 8-14 cm very flat; belly scutes
  ~50 x 18 cm; head plates 20-30 cm.
* **No wounds and no scars** (Episode 1 and the later wing injuries belong to later episodes);
  clean, cared-for, polished.
* **Membrane (proposed):** ivory white with a faint rose flush in the thinnest panels, a soft
  vessel tracery against the light, a satin sheen; thicker ivory bands along the bones.
* **Horns, claws, talons, teeth:** ivory.

### 4.7 Movement and behaviour (Episode 1 shows her only in flight)

* **Approach (3B):** a soaring glide at ~45 m/s with occasional 0.24 Hz beats; "a white wing
  separates from the cloud".
* **The dive-bomb (3C):** wings half folded into an "M" (elbows in, hands swept back, like a
  peregrine's stoop or a gannet before the plunge), 70-90 m/s; then over the square **the wings
  open with crushing force** - the membranes snap taut, a huge downwash slams the square; the low
  sweep: legs swing forward, **the talons strike the edge of the festival structures and the
  roofline** (an osprey's or eagle's strike), the tail low; then the climb: 3-5 heavy beats with
  the whole body working; she never hovers.
* **Bank (3C)** wide and slow, the whiteness catching the light; the **second pass** the same
  way. **No fire.**
* **On the ground (later episodes):** (rev. 3) low like the others (1.5c), her long neck carried
  forward and a little higher than Charcoal's; a slow regal walk on her feet and wrists. Her folded
  wings stand ~5 m above her back (the 16 m forearms), a white cloak.

### 4.8 Riding rig (Queen Fall)

A riding rig on her withers (over the notarium), ~2 m behind the neck base; her back there is
~3.5-4 m wide. Breast collar, axillary girth, neck band (1.11); a padded seat with a high front
grab rail. Dark leather, plain fittings - no decorative armour on the dragon.

### 4.9 Real-animal references

Leucistic (white) ball python and albino reticulated python scales (polished pale plates), albino alligator and
albino animals generally (pink-red eyes, pink where the skin is thin), mute swan and heron (neck,
posture), wandering albatross (long folded wings, soaring), harpy eagle and osprey (feet, strike),
peregrine and gannet (stoop), sable antelope and horned lizard (horns).

### 4.10 Sketches

Side (one column = 0.74 m):

```
                                                                               ..+.
                                                                                  ++.
                                                                                   .++
                                                                                   .++
                                                                             .##########.
                                                                         ###################
                                                                      ########.
                                                                    #######
                                                        .#.      .#######
                                            ..   ...###################
                                        .##############################
                                  ..::::::::::#:::::::::###::::########
                             .:::::::::::::::########################.
                           ::::::::::::::::::.####....  ##########.
                       .##::::::::::::::::::::. ##.      ##.
                   .######..:::::::::::::::::. ###       ###
               .#####.          ..:::::::::::.###        .##
            ####.                     .::::::##.          ##.
        ..##.                              .:#.           ###
     ...                                     .#.           ##
   ..                                         .#####..     ###..
```

Top, gliding (one column = 1.83 m):

```
                                   ##
                                   ##
                                   ##
                                   ##
                                   ##
          ..........#####..       .##.       ..#####..........
.:::::::::::::::::::::::::####################:::::::::::::::::::::::::.
 .:::::::::::::::::::::::::::::::::##:::::::::::::::::::::::::::::::::.
   ::::::::::::::::::::::::::::::::##::::::::::::::::::::::::::::::::
    :::::::::::::::::::::::::::::::##:::::::::::::::::::::::::::::::
     .::::::::::::::::::::::::::::####::::::::::::::::::::::::::::.
         .:::::::::::::::::::::::######:::::::::::::::::::::::.
                         .::::::## ## ##::::::.
                              .#.  ##  .#.
                              .    ##    .
                                   ##
                                   ..
                                   ..
                                   ..
```

Front, gliding (one column = 1.47 m):

```
    .........:::::::::::::::::::::......  .+##+.  ......:::::::::::::::::::::.........
                            ....:::::::::::####:::::::::::....
                                           ####
```

---

## 5. The gold hatchling

**From the screenplay:** looks like 24-karat gold; newborn, wet, weak; no glow; no name yet. It
emerges awkwardly, tries to lift itself and slips against the broken shell; Alexandria supports
it with a folded cloth; its head shifts toward Abby's voice; its side rises with a breath.

**Silhouette:** a newborn - a big domed head with huge eyes and a short snout, a plump soft body,
thin weak wing-arms with crumpled wet membranes, oversized feet and thumb claws, a short neck, a
tail that cannot hold itself up.

### 5.1 Numbers

| | value |
|---|---|
| length | **1.0 m** (proposed) = skull 0.19 + neck 0.13 + trunk 0.27 + tail 0.41 |
| fits its egg | the egg prop is 0.42 m: the hatchling lay coiled in it, the tail wrapped round the body (real reptile hatchlings are 3-4x the length of their egg, so 2.4x fits easily) |
| mass | ~11 kg - about half the egg's ~21 kg (reptile hatchlings 50-70%) |
| wings | span 0.9 m pulled fully open (0.9x its length); it could not fly for months |
| when it manages to stand | hip 0.18 m, shoulders 0.14 m; head ~0.3 m |

### 5.2 Skeleton and proportions

* Same plan as the adults (two legs, wing-arms, 3 long fingers + thumb), newborn proportions:
  head 19% of the length (adults 8-11%), eye 19% of the skull, snout 27% of the skull (rev. 1; 38% read as a lizard's), short neck,
  short trunk, the tail 41%.
* **Wing:** humerus 0.072, forearm 0.118 m (rev. 3; rev. 2: 0.085 / 0.105), fingers III 0.18 / IV 0.14 / V 0.11 m (metacarpal +
  phalanges), soft, the membrane wet, wrinkled and stuck to itself; **thumbs big** with curved
  soft amber claws (newborn bats are born with near-adult thumbs and feet - to cling).
* **Leg:** femur 0.075, tibia 0.08, metatarsus 0.045, toes 0.065 m - big feet; soft claws.
* Membrane to the knee.

Shape (rev. 3: a slim hatchling-lizard trunk with a modest yolk belly - the rev. 2 trunk, as wide
and deep as it was long, read as a gold ball or a squeeze toy; slimmer limbs; the hip joint under
the middle of the trunk as on the adults):

| part | full width x depth at each station (m) |
|---|---|
| head, back of skull -> snout tip (s = 0, 0.3, 0.55, 0.8, 1) | 0.15 x 0.14 / 0.165 x 0.145 / 0.14 x 0.112 / 0.108 x 0.08 / 0.078 x 0.055 (rev. 3: flatter - the tall dome read as a toy's; rev. 1: a blunter newborn snout) |
| neck, head end -> base (s = 0, 0.5, 1) | 0.078 x 0.088 / 0.086 x 0.095 / 0.112 x 0.128 (rev. 3) |
| trunk, shoulder -> tail base (s = 0, 0.3, 0.6, 0.85, 1) | 0.13 x 0.15 / 0.155 x 0.165 / 0.16 x 0.155 / 0.13 x 0.125 / 0.11 x 0.105 (rev. 3; rev. 2: up to 0.2 x 0.2) |
| tail, base -> tip (s = 0, 0.15, 0.35, 0.6, 0.85, 1) | 0.1 x 0.1 / 0.075 x 0.078 / 0.05 x 0.052 / 0.028 x 0.03 / 0.012 x 0.013 / 0.004 x 0.004 |

### 5.3 Head and horns

* Domed braincase, short soft snout with an overbite (the chin set back under the snout), puffy
  cheeks, thin lips; **egg tooth** (caruncle) on the snout tip, 4 mm, pale - it falls off within
  days (not a horn).
* Tiny teeth just erupting (2-3 mm), hardly visible.
* **Eyes (proposed colour):** 0.036 m, dark bronze-brown with gold flecks, slit pupils, half
  closed and wet; the lids heavy (exhaustion).
* **Horns - 2, fixed:** soft **horn buds** at the back corners of the skull, 2.5 cm cones of pale
  gold keratin pointing back and up - already visible, so it has horns like every dragon.

### 5.4 Body, skin and colour

* Plump: a round belly with the healed yolk scar (umbilicus) in the middle, loose soft skin with
  creases at every joint, no muscle definition, no osteoderms.
* **"Looks 24-karat gold":** the scales have a metallic yellow-gold reflection - real animals do
  this with layered (structural) reflectors, e.g. the jewel scarab *Chrysina resplendens* and the
  gold spots of a monarch's chrysalis, which look like polished metal. In shading terms: gold's
  own metallic reflectance (F0 ~ linear 1.0 / 0.77 / 0.34), slightly rough (broad sheen), under a
  thin **wet film** (amniotic fluid) with soft broad highlights, drying in patches; translucent
  slime in the creases; **no glow**. Soft grooves between scales, pale gold, not dark.
* **Scale sizes:** very fine and soft - flanks 3-4 mm, belly scutes 10 x 4 mm, head granules 1-2
  mm.
* Membrane (proposed): pale translucent gold, wet, crumpled.

### 5.5 Movement (1A)

* **Lies** sprawled: too weak to tuck the legs under - legs splayed out to the sides, the wing-arms
  folded loosely at its sides, wrists on the bedding.
* **Tries to lift itself:** pushes up on its **wrists and thumbs** (the wing-walk start position),
  the arms tremble, the head is too heavy - it lifts the chest 5-8 cm and **slips** against the
  shell (a wrist slides, it rolls a little onto its side); then rests.
* **Breathes** fast and shallow, the flanks rising visibly (~40 breaths a minute, slowing as it
  rests); one long still moment, then the side rises (screenplay).
* **Head turn** toward Abby's voice: slow, the neck too weak to hold it long, the eyes half open.

### 5.6 Real-animal references

Newborn crocodiles and Komodo hatchlings (head and eye proportions, egg tooth, yolk scar), newborn
bats (big feet and thumbs, small wings), chicks just out of the egg (wet, exhausted, sprawled),
*Chrysina* jewel scarabs and gold chrysalises (metallic gold that is not metal).

### 5.7 Sketches

Side (one column = 0.010 m; drawn standing - in Episode 1 it mostly lies):

```
                                                                                  .+
                                  .#######################.                     .##+
                                 #####################################################.
                                #######################################################.
                             .###########################################################
                          .###############################################################.
                       .####################################################################
                    ###############. ########:::#########################.###################
                ############.         .#########::::####################    ##################
           .##########.               .###############################.          ..##########
       .#######..                     .###   .##################...                       ..
   .####..                             ####.         ..##....###
                                        .########.           ###...
```

Top, wings pulled open (one column = 0.013 m):

```
                                 ######
                                ########
                               .########.
                               ##########
                              ############
                             .############.
                             .############.
                          .+++############.++.
                                ########
                                ########
                                ########
                               ##########
         ..########.... ...##################... ....########..
#########:::###::#####################################:::###:::#########
 .::::::::##:#:::::::::::::::##############:::::::::::::::#:##::::::::.
     :::##:::#::::::::::::::################::::::::::::::#:::##:::
       #:::::#::::::::::::::################::::::::::::::#::::.#
              ::::::::::::::################::::::::::::::
                ::::::::::::################::::::::::::
                  .:::::::::################:::::::::.
                    .::::::::###############::::::::
                      :::::::##############:::::::
                       :::::::############:::::::
                        .:::::############:::::
                          :::##############:::
                           .####.######.####.
                           .###  ######  ###.
                           ###   ######   ###
                          ###    #####.    ###
                         .##.     ####      ##.
                         ##.      ####       ##
                        ##.       ####       .##
                       .#.        ####        .#.
                       .          .##.          .
                                   ##
                                   ##
                                   ##
                                   ##
                                   ##
                                   ..
```

Front (one column = 0.010 m):

```
                              +++++                    +++++
                                  .++++. %%%%%%%% .++++.
                                      .%%%%%%%%%%%%.
 ..............                      .%%%%%%%%%%%%%%.                      ..............
     ...:::::::::::::::::::::...    .#%%%%%%%%%%%%%%#.    ...:::::::::::::::::::::...
                  .:::::::::::::::::##%%%%%%%%%%%%%%##:::::::::::::::::.
                       .:::::::::::###%%%%%%%%%%%%%%###::::::::::..
                            ..:::::#####%%%%%%%%%%#####:::::..
                                 ..:########%%########:..
                                    #################.
                                     ################
                                     .#.##########.#.
```

---

## 6. The scout (Episode 1)

**From the screenplay:** small, extremely fast; passes Leaf at terrifying speed; loses its LEFT
wing to Charcoal; its rider is an unidentified strapped silhouette (suspected traitor, identity
unresolved).

**Silhouette:** small, sleek, streamlined: a narrow wedge head on a slim neck it pulls back into
an S at speed, a torpedo body with a deep keel, very long narrow swept wings (a swift's, not a
bat's), tiny feet, a long thin whip tail with a diamond-shaped vane at the tip.

### 6.1 Numbers

| | value |
|---|---|
| length | **6.8 m** (proposed) = skull 0.5 + neck 1.1 + trunk 1.6 + tail 3.6 (vane 0.42 x 0.28 m) |
| chest | 0.47 m wide x 0.67 m deep |
| standing | hip 1.1 m, shoulder 1.25 m, head ~1.8 m |
| mass | ~270 kg (density 0.62); with rider and tack ~375 kg (the rider ~25% - heavy, so it cannot carry anyone bigger) |
| flight muscles | ~28% of body mass (a sprinter) |
| wingspan / area / aspect | 11.0 m / 13 m2 / **9.3** (long and narrow) |
| wing loading / stall | 285 N/m2 (with rider) / ~18 m/s |
| speeds | cruise 35-45 m/s, sprint 60-70 m/s (faster than Charcoal in a straight line), shallow dive 90+ m/s |
| wingbeat | 1.1 Hz cruising, 1.4-1.6 Hz sprinting with a short stroke |
| turn | radius ~57 m at 60 deg bank (Charcoal ~200 m) |

### 6.2 Skeleton

* **Neck:** 9 cervicals; **tail:** 40 caudals, stiff for its outer 70% (ossified tendons), ending in
  a keratin-stiffened skin vane (*Rhamphorhynchus*) - a rudder.
* **Wing - two long fingers** (a high-aspect wing): humerus 0.72 m; forearm 1.18 m (rev. 2); **III** 1.3 +
  1.05 / 0.8 / 0.45 = 3.6 m; **IV** 1.15 + 0.9 / 0.5 = 2.55 m; thumb 0.08 + 0.06, claw 0.06 m.
  Spread angles III -12, IV -46 deg (swept). The membrane carries fine chordwise stiffening fibres
  (the *actinofibrils* of pterosaur wings) so the narrow outer wing does not flutter at speed.
  Membrane root only to the **hip** (narrow inner wing).
* **Leg:** femur 0.45, tibia 0.54, metatarsus 0.26, toes 0.17 m - small, light, tucked flat
  under the tail base in flight (swifts barely have feet).

### 6.3 Head and horns

* **Skull 0.5 m:** a narrow streamlined wedge, snout 55% of the skull, smooth.
* **Eyes:** 0.055 m, set forward (binocular overlap ~50 deg, a pursuit animal like a falcon);
  (proposed) pale yellow iris; a nictitating membrane closed over the eyes at speed.
* **Nostrils** with small bony baffles inside (as in falcons) for high-speed air.
* **Teeth:** 20 above / 19 below a side, small and needle-like (1.5 cm).
* **Horns - 2, fixed:** one pair of **long, thin, straight horns laid back flat along the top of
  the neck** (0.48 m, base 3.5 cm), ~10 deg above the neck line, like an oryx's horns laid back -
  streamlined.

### 6.4 Shape (full width x depth, metres)

| part | full width x depth at each station (m) |
|---|---|
| head, back of skull -> snout tip (s = 0, 0.3, 0.55, 0.8, 1) | 0.25 x 0.25 / 0.24 x 0.23 / 0.17 x 0.15 / 0.11 x 0.1 / 0.06 x 0.05 |
| neck, head end -> base (s = 0, 0.5, 1) | 0.15 x 0.17 / 0.19 x 0.22 / 0.29 x 0.37 |
| trunk, shoulder -> hip (s = 0, 0.25, 0.6, 0.85, 1) | 0.42 x 0.62 / 0.47 x 0.67 / 0.36 x 0.48 / 0.3 x 0.34 / 0.3 x 0.3 |
| tail, base -> tip (s = 0, 0.15, 0.35, 0.6, 0.85, 1) | 0.25 x 0.27 / 0.15 x 0.17 / 0.085 x 0.095 / 0.05 x 0.055 / 0.03 x 0.03 / 0.01 x 0.01 |

### 6.5 Skin and colour (all proposed - the screenplay gives none)

* Countershaded like an aerial hunter (peregrine, swift): **slate grey** above with faint darker
  mottling (sRGB ~#4f565e), **pale grey** below; membrane **dark grey-brown** (~#4a3f3a); horns
  and claws dark. Nothing recognisable or heraldic (the rider is unidentified).
* **Fine, smooth, snake-like scales** for low drag: flanks 1-1.5 cm, back 2 cm with low keels, belly
  4 x 1.5 cm; no osteoderms; leading edges of the arm polished by the wind; a few scuffs.

### 6.6 Rider and tack

A **racing saddle** (jockey style): short stirrups, the rider crouched forward and almost prone
along the neck base, a hood and wrapped face (identity unresolved), strapped in by a harness to
the saddle tree. Breast collar + axillary girth; plain dark leather, no marks.

### 6.7 Movement

* **The pass (1E):** a sprint at 60-70 m/s, neck pulled back into an S, legs and tail streamlined,
  short fast beats; it cuts past Leaf a few metres away - its wingtip vortex and the wake roll Leaf
  (this, not a weapon, breaks Abby's arm).
* **Evasion (1F):** tight turns (57 m radius), sudden drops; it slips under the first bite and
  tries to slip beneath the flame.
* **The catch:** Charcoal's jaws close across its back at the LEFT wing root.

### 6.8 The LEFT wing loss (1F)

The wing separates **at the shoulder**: the humeral head is torn out of its socket and the
membrane's body root tears along the flank down to the hip, so the wing comes away whole (arm,
fingers and membrane, a ragged edge of flank skin along its root) and tumbles; the body keeps the
flight muscles; on the left side remain a dark, wet, ragged wound at the shoulder and a torn
membrane edge along the flank - kept small and dark, read in silhouette against bright water
(screenplay). It falls rolling LEFT, the right wing flailing, and hits the sea; in the water it
keeps itself afloat with the right wing and the legs. **The LEFT wing is lost in every shot.**

### 6.9 Real-animal references

White-throated needletail and common swift (wing shape, tiny feet), peregrine falcon (stoop,
nostril baffles, forward eyes, countershading), *Rhamphorhynchus* (tail vane, actinofibrils),
oryx (horns), racing greyhound and whippet (lean sprinter build), sea snakes (fine smooth scales).

### 6.10 Sketches

Side (one column = 0.070 m):

```
                                                                                   ....+.
                                                                                 ...######
                                                                           .#################
                                                                 .#################.   .######.
                                                 ...... .#####################.
                                      .....::::::::::::::####################.
                                   .##::::::######:####:::::::::###:#########
                                 .#.:######################################
                              .#########..         .##        ...####..
                        .#######.                   ##            ###
                 .#######.                         ##              ##.
           .######.                               ##               ###
     .......                                     .#.                ##.
   ..                                             .###.             ###.
```

Top, gliding (one column = 0.15 m):

```
                                   ##
                                   ##
                                  .##.
                                   ##
                                   ##
                ...:::############################:::...
       ...::::::::::::::::::::::::####::::::::::::::::::::::::...
.:::::::::::::::::::::::::::::::::####:::::::::::::::::::::::::::::::::.
  .::::::::::::::::::::::::::::::::##::::::::::::::::::::::::::::::::.
       ::::::::::::::::::::::::::::##::::::::::::::::::::::::::::.
         ::::::::.            ..::####::..            .::::::::
                                  ####
                                  ####
                                 .###..
                                 . ## .
                                   #.
                                   ..
                                   ..
                                   ..
                                   ..
                                   ..
                                   ::
```

Front, gliding (one column = 0.12 m):

```
              .........:::::::::::........ #### ........:::::::::::.........
   ...........................:::::::::::::####:::::::::::::...........................
                                           ####
```

---

## 7. What has to change in the code (two legs, wings as front limbs)

The library today builds **four legs + a separate wing girdle on the back** (`anatomy.js`
`buildLeg('fl', ...)` + `buildLeg('hl', ...)` + the wing root at `withersY`), with four fingers
fanning from one point. File by file:

**`anatomy.js`**
* Remove the front legs: `spec.front`, `buildLeg('fl', ...)`, the `fl_*` bones and chains, and the
  armpit fold that uses them (the axilla fold moves to the wing arm, `w_#_0/1`).
* Move the wing root to the old shoulder: a lateral shoulder joint on the front of the chest,
  ~0.42 x the chest half-width out and ~30% of the chest depth below the dorsal line, at torso
  s ~0.05; parent `thorax`. Delete the "flight muscle mass on the back" ellipsoid of the third
  girdle; sculpt instead the **keel + pectoralis** (sternum to the humerus crest), the **upstroke
  hump** over the shoulder blades, the scapula along the back, the big humerus muscles and the
  **forearm as a weight-bearing limb** (thick at the elbow, tendons at the wrist), the **wrist pad**
  (callus) and a robust **thumb** with its claw.
* New wing preset schema replacing `digits` (tips) - bone lengths and spread angles as in this file:
  `wing: { hum, fore, fingers: [{ name: 'III', mc, ph: [p1, p2, p3], spread }...], thumb: { mc, ph,
  claw }, attach: 'hip'|'knee'|'shank'|'ankle', axillaGap }`, a **variable finger count** (2-4), and
  per-finger joint positions from the bone lengths (not the fixed `[0, 0.56, 0.84, 1]` fractions).
  Bones: `w_#_0` humerus, `w_#_1` forearm, `w_#_2` carpus, `w_#_f<d>_0..2` (metacarpal, P1,
  P2+P3), `w_#_th` thumb, and a new **`w_#_pad`** (wrist pad contact) under `w_#_2`.
* Hind legs from this file's tables; feet with 4 toes (hallux back), heel pad; Starlight's raptor
  feet; the scout's small feet.
* Head: new `headShape` per dragon (skull lengths/widths, snout fraction, eye sizes, teeth counts,
  lips), the **horn sets rewritten** to sections 2.3 / 3.3 / 4.3 / 5.3 / 6.3 (exact counts, lengths,
  curves); the scout's tail vane.
* Profiles: this file's width x depth tables convert to the code's `[s, halfWidth, halfHeight,
  drop]` as `halfWidth = width / 2L`, `halfHeight = depth / 2L` (appendix A has every value).
* The rest pose stays "wings spread" (the glide planform of section 10), legs down.

**`mesher.js`** - the grid now spans the spread wing-arms at the shoulder; keep the head refinement region and add regions for the **feet, wrist pads and thumbs** (they touch the ground in close-ups) and the horn bases; at 72 m Starlight's body cell (L / res = 0.13 m at `hero`) is too coarse for close-ups - raise `res` for her or add regions, keeping cells near Charcoal's.

**`creature.js`** - `CREATURES`: lengths (Charcoal 36.0, Leaf 9.0, Starlight 72, hatchling 1.0,
scout 6.8), `flapHz` (0.42 / 0.80 / 0.24 / 0 / 1.1) and `flapAmp`, `scaleMul`, per-dragon `fold`
targets; membranes built for 2-4 fingers; detachable LEFT wing for the scout as now.

**`wing.js`** - holders from a variable finger list; the body attachment polyline = axilla gap ->
flank -> hip -> down the leg to `attach`, skinned to `rib_*`/`pelvis`/`hl_#_0`/`hl_#_1`/`hl_#_2`;
per-panel scallop depth; Charcoal's stripe coordinate for 3 fingers + forearm (bands along every
bone and 2 between); the scout's actinofibril option.

**`pose.js`** - `groundRig` must use the hind toe pads **and the wrist pads** (`w_#_pad`) as
contacts (today it reads `c.spec.front.toeR`).

**`poses.js`** - rewrite with the new limb roles (all pure in `t`):
`stand` (wing-walk stance, elbows high), `walk` (lateral-sequence gait), `rear` (bipedal),
`sit` (Leaf: haunches + wrists in front, trunk 55 deg), `crouch` (sphinx, mounting), `lie`
(sphinx rest) and `sprawl` / `pushUp` / `slip` (hatchling), `launch` (crouch-kick-vault-unfold-
first beat, scaled by size), `land` (flare, feet, wrists), `flight` (stroke from section 1.7, legs
set membrane tension), `glide`, `bank`, `dive` (half-folded M) and `strike` (Starlight's talons),
`mouthHold` (neck curl + gape schedule for 1D), `fire` (posture + tells). `tuckLegs` loses the
forelegs. The wing fold targets follow section 1.5 (fingers back along the flank, not doubled
rods).

**`drape.js`** - re-bake the folded membranes for the new folds (stand/walk, sit, crouch/lie):
contraction into fine pleats (elastin) instead of a slack curtain; collision with the flank and
the leg.

**`skin.js`** - drop the `fl_*` chains; the wing arm becomes a weight-bearing limb chain (scutes on
the leading/outer side, reticula behind, a callus mask on the wrist pad, the thumb); a granular
strip along the membrane root; belly plates end at the keel.

**`materials.js`** - colours and zones from sections 2.6 / 3.6 / 4.6 / 5.4 / 6.5: dust and mud on
the wrist pads, the lower forearms and the feet; Charcoal's membrane must read **gray** (check the
current near-black membrane albedo) with black stripes along every finger bone and between;
Starlight's ivory-rose membrane; the scout's colours.

**`tack.js` / `rider.js`** - seat over the notarium (positions in 2.9 / 3.8 / 4.8 / 6.6), girths =
breast collar + axillary girth in the girth groove (never across a membrane), the scout's racing
saddle, `createSaddle` offsets per dragon; the `fl_` filter in `noWing` becomes dead code.

**`fire.js`** - unchanged (the mouth socket); the `fire` pose supplies the tells.

**Scenes using the library** (owned by other domains - they need re-staging, not just a rebuild):
`scenes/lookdev/creatures-*.js` (lineup and hero cameras for the new sizes: Starlight 72 m, the
hatchling 1.0 m), `style-f2-riding-grounds.js` (Charcoal and Leaf poses, the rig),
`style-f3-flight.js`, `style-f4-birthing-chamber.js` (poses `fl_L_0` / `fl_L_1` directly; the
hatchling is now 1.0 m - re-stage the nest), `style-f5-cling-square.js` (Starlight at 72 m),
`humans-riders.js`, `architecture-probe.js`.

**Tests** - `npm test` does not cover creatures. Add a smoke test: build every dragon at `draft`,
assert no `fl_*` bones, exactly 2 legs + 2 wings, the finger count and horn count per dragon, the
lowest points in `stand` are the 4 toe/wrist pads, the span within 5% of this file, and the 1D
clearance (Leaf's head inside Charcoal's mouth at a 25 deg gape with the teeth clear).

---

## 8. Build plan (in order; render and look at every step)

1. **Presets + skeleton:** port appendix A into `anatomy.js` (new schema), remove the front legs,
   new shoulder and wing arm, variable fingers, `w_#_pad`. Build all five at `draft`; print the
   bone lengths, span and wing area and compare with this file (within 5%).
2. **Body sculpt:** keel, pectoral/hump, forearm, wrist pad, hind legs and feet, profiles. Rest-pose
   turntable at `preview`; compare the side/top silhouettes with sections 2.12 / 3.10 / 4.10 /
   5.7 / 6.10.
3. **Wings:** membrane panels, attachment line with the girth groove, scallops, Charcoal's stripes;
   glide views from above and in front (`creatures-contact.js` frames 21-23).
4. **Fold + ground poses:** `stand`, `walk`, `sit`, `crouch`, `lie`, hatchling `sprawl`/`pushUp`;
   re-bake the drapes; `groundRig` with wrist pads; side views at `preview`, then 4K crops of the
   folded wing (no rods, no slack tarp, pleats).
5. **Heads and horns:** skulls, teeth, eyes, horn sets; 4K head close-ups of all five; the 1D
   staging test (Charcoal + Leaf + Abby) at `preview`, then 4K.
6. **Flight motion:** flap cycles at the new tempos, glide, bank, `launch`, `land`, `dive`,
   `strike`; short `--fps 24` previews of each to judge weight and rhythm.
7. **Skin and colour** per sections 2.6-6.5; 4K checks in daylight: Charcoal black but readable,
   the membrane gray with black stripes, Leaf dark green with the light green membrane against the
   sun, Starlight reflective and never glowing, the hatchling gold and wet, the scout plain.
8. **Tack and riders:** girths in the girth groove, seats on the notarium, rider poses; Remi/Abby/
   Queen Fall/scout rider at 4K.
9. **Lookdev pass:** hero shots, contact sheet and lineup at native 4K with 1:1 crops; fix what the
   crops show; README/PROGRESS; `npm test`; checkpoint commits.
10. **Pictures for Daxtyn:** a sheet per dragon (side/top/front, head close-up, the horns, a scale
    lineup with a person) for his approval; nothing here is canon before that.

---

## 9. Open questions for Daxtyn

1. **Starlight's size:** "about twice Charcoal's size" - this design uses **twice his length
   (72 m)**, the same reading as Leaf's 25%. If you mean "looks twice as big", she would be ~51 m.
2. **The hatchling's size:** proposed **1.0 m** (it fits curled in its 0.42 m egg, as real
   reptile hatchlings do; the current model is 0.42 m, as long as the egg).
3. **Colours the screenplay does not give:** Starlight's eyes (pale rose-violet), the hatchling's
   eyes (dark bronze, gold flecks), the scout (slate grey above, pale below, dark membrane, pale
   yellow eyes), Starlight's membrane (ivory with a faint rose flush).
4. **Horns:** are the five horn sets right (Charcoal's heavy back-swept pair + brow pair + jaw
   knobs and the chipped left tip; Leaf's short pair; Starlight's crown; the scout's laid-back
   pair; the hatchling's buds)?
5. **Leaf's sit:** kept as a dog-like sit on the haunches with the folded wings' wrists in front -
   OK?
6. **The scout's size:** proposed 6.8 m (smaller than Leaf, big enough to carry a rider).
7. (Already open in `DRAGONS.md`) the dialogue lines that still name the old species.

---

## 10. The calculator and the sketches

The numbers and silhouettes were produced by a small Python calculator and sketch generator
(scratch tools, not part of the repository: lofted elliptical cross-sections for the volume,
densities as stated, the spread planform polygon for the wing area, Pennycuick 1990 for the
wingbeat, an actuator disc for the downwash; the side views use the elbows-high stance of 1.1).
Appendix A holds every input, so the build does not depend on those tools.

## Appendix A - design numbers (metres; port into `anatomy.js` / `creature.js`)

```js
// Every length in metres, angles in degrees. Profiles: [s, full width, full depth];
// neck s 0 = head end .. 1 = base; trunk s 0 = shoulder .. 1 = hip; tail s 0 = base .. 1 = tip;
// head s 0 = back of the skull .. 1 = snout tip. Code profiles: halfWidth = width / (2 L),
// halfHeight = depth / (2 L). Fingers: [name, metacarpal, [phalanges], spread from lateral
// in the glide (negative = swept back)]. stand: forearm lean from vertical, humerus rise above
// horizontal running back from the shoulder (elbows high), neck rise, head pitch, tail droop.
// (rev. 3) Every design also has hipStation 0.68 (trunk s of the hip joint; code: stand.hipS) and
// a LOW stance (1.5c; code: stand.low): chest underside at `belly` x the chest depth (0.34 by
// default; Starlight, Leaf 0.4; scout 0.36). The `derived` heights below are the SCULPT (bind)
// pose's; the low-stance heights are in section 1.5c's table.
export const DESIGN = {
  charcoal: {
    L: 36,
    skull: 3.6,
    neck: 6.9,
    trunk: 9.3,
    tail: 16.2,
    cervicals: 11,
    caudals: 38,
    head: [[0, 1.8, 1.85], [0.25, 1.8, 1.8], [0.5, 1.45, 1.36], [0.75, 1.16, 1.02], [1, 0.86, 0.68]],
    neckProfile: [[0, 0.95, 1.22], [0.5, 1.3, 1.9], [1, 1.85, 2.9]],
    trunkProfile: [[0, 2.7, 4.2], [0.25, 2.9, 4.5], [0.6, 2.4, 3.4], [0.85, 2.2, 2.8], [1, 2.35, 2.6]],
    tailProfile: [[0, 1.95, 2.15], [0.15, 1.5, 1.7], [0.35, 0.95, 1.1], [0.6, 0.48, 0.56], [0.85, 0.19, 0.23], [1, 0.04, 0.04]],
    leg: {
      femur: 3.1,
      tibia: 3.4,
      metatarsus: 1.5,
      toeIII: 1.3,
      claw: 0.42,
      diameters_thigh_knee_shank_ankle_foot: [1.7, 1.05, 1.0, 0.62, 0.52],   // rev. 1: load-bearing columns
      toes: "3 forward + hallux"
    },
    wing: {
      humerus: 4.5,   // rev. 3 (rev. 2: 5.4, rev. 1: 4.2)
      forearm: 8.1,   // rev. 3 (rev. 2: 7.2, rev. 1: 8.4)
      diameters_shoulder_elbow_wrist_hand: [1.6, 1.15, 0.8, 0.45],
      fingers: [["III", 7.4, [5.2, 3.9, 2.3], -6], ["IV", 6.8, [5, 3.4, 1.6], -32], ["V", 6.2, [4.6, 2.9, 1.2], -64]],
      thumb: { mc: 0.7, ph: 0.55, claw: 0.6 },
      membraneTo: "ankle",
      membraneThickness: 0.007,
      glideArmAngles: { humerus: -16, forearm: 12 },
      legSplayInGlide: 24
    },
    stand: { forearmLean: 12, humerusRise: 12, neckRise: 36, headPitch: -28, tailDroop: 22 },
    eyeDiameter: 0.29,
    teethPerSide_upper_lower: [15, 14],
    jawMaxDeg: 50,
    horns: [
      {
        name: "main",
        pair: true,
        from: "rear corners of the skull roof",
        length: 2.6,
        base: [0.42, 0.32],
        shape: "back along the neck line, then out and down, tips turned slightly forward",
        note: "LEFT tip broken off ~0.12 m (proposed continuity lock)"
      },
      {
        name: "brow",
        pair: true,
        from: "behind and above the eyes",
        length: 0.7,
        base: 0.22,
        shape: "straight cone, up and back at 35 deg to the skull line"
      },
      {
        name: "jaw knobs",
        pair: true,
        count: 3,
        from: "jaw angle (jugal / quadratojugal)",
        length: [0.18, 0.26, 0.34],
        shape: "blunt osteoderm horns pointing back"
      }
    ],
    colours: {
      scales: "#141416 (linear albedo 0.012-0.018), completely black",
      eyes: "blue",
      membrane: "gray #7d8086 (linear ~0.2) with black stripes along every finger bone and between",
      fire: "standard orange-red"
    },
    flapHz: 0.42,
    flapAmplitudeDeg: 85,
    density: 0.6,
    derived: {
      mass_t: 81.46,
      flyingMass_t: 81.463,
      span: 63.6,
      wingArea: 678,
      aspect: 6,
      wingLoading: 1178,
      stall: 32.7,
      hipHeight: 7.01,
      shoulderHeight: 7.54,
      elbowHeight: 8.42
    }
  },
  leaf: {
    L: 9,
    skull: 1,
    neck: 1.6,
    trunk: 2.3,
    tail: 4.1,
    cervicals: 10,
    caudals: 36,
    head: [[0, 0.54, 0.54], [0.3, 0.52, 0.52], [0.55, 0.38, 0.34], [0.8, 0.28, 0.24], [1, 0.19, 0.16]],
    neckProfile: [[0, 0.3, 0.37], [0.5, 0.35, 0.43], [1, 0.48, 0.62]],
    trunkProfile: [[0, 0.66, 0.92], [0.25, 0.7, 0.96], [0.6, 0.56, 0.74], [0.85, 0.5, 0.6], [1, 0.52, 0.56]],
    tailProfile: [[0, 0.44, 0.48], [0.15, 0.33, 0.37], [0.35, 0.21, 0.24], [0.6, 0.11, 0.13], [0.85, 0.045, 0.05], [1, 0.01, 0.01]],
    leg: {
      femur: 0.78,    // rev. 3 (was 0.85)
      tibia: 0.9,     // rev. 3 (was 0.98)
      metatarsus: 0.48, // rev. 3 (was 0.52)
      toeIII: 0.36,
      claw: 0.1,
      diameters_thigh_knee_shank_ankle_foot: [0.34, 0.19, 0.17, 0.1, 0.085],
      toes: "3 forward + hallux"
    },
    wing: {
      humerus: 1.12,  // rev. 3 (rev. 2: 1.35, rev. 1: 1.05)
      forearm: 2.08,  // rev. 3 (rev. 2: 1.85, rev. 1: 2.15)
      diameters_shoulder_elbow_wrist_hand: [0.36, 0.25, 0.17, 0.1],
      fingers: [
        ["III", 1.9, [1.35, 1, 0.6], -6],
        ["IV", 1.75, [1.25, 0.85, 0.4], -33],
        ["V", 1.6, [1.1, 0.72, 0.3], -65]
      ],
      thumb: { mc: 0.18, ph: 0.13, claw: 0.14 },
      membraneTo: "shank",
      membraneThickness: 0.0018,
      glideArmAngles: { humerus: -16, forearm: 12 },
      legSplayInGlide: 24
    },
    stand: { forearmLean: 10, humerusRise: 14, neckRise: 48, headPitch: -22, tailDroop: 24 },
    eyeDiameter: 0.11,
    teethPerSide_upper_lower: [16, 15],
    jawMaxDeg: 55,
    horns: [
      {
        name: "main",
        pair: true,
        from: "back corners of the skull",
        length: 0.42,
        base: 0.07,
        shape: "smooth, curving back along the neck line, slightly up, tips dipping"
      },
      { name: "brow nubs", pair: true, from: "over the eyes", length: 0.06, base: 0.05, shape: "small cones" }
    ],
    colours: {
      scales: "dark green #1f3a22",
      eyes: "yellow",
      membrane: "light green #a6d17c, translucent",
      fire: "purplish-blue, a little hotter (not on screen in Ep. 1)"
    },
    flapHz: 0.8,
    flapAmplitudeDeg: 105,
    density: 0.62,
    derived: {
      mass_t: 1.12,
      flyingMass_t: 1.117,
      span: 16.3,
      wingArea: 41,
      aspect: 6.5,
      wingLoading: 268,
      stall: 15.6,
      hipHeight: 2.05,
      shoulderHeight: 1.91,
      elbowHeight: 2.16
    }
  },
  starlight: {
    L: 72,
    skull: 5.6,
    neck: 16,
    trunk: 16,
    tail: 34.4,
    cervicals: 14,
    caudals: 42,
    head: [[0, 2.4, 2.1], [0.25, 2.4, 2.05], [0.5, 1.8, 1.4], [0.75, 1.4, 1], [1, 0.95, 0.66]],
    neckProfile: [[0, 1.5, 1.75], [0.5, 1.95, 2.3], [1, 2.9, 3.6]],
    trunkProfile: [[0, 4.2, 5.8], [0.25, 4.5, 6.1], [0.6, 3.7, 4.7], [0.85, 3.3, 3.8], [1, 3.5, 3.6]],
    tailProfile: [[0, 2.9, 3.2], [0.15, 2.2, 2.45], [0.35, 1.4, 1.6], [0.6, 0.72, 0.82], [0.85, 0.27, 0.3], [1, 0.05, 0.05]],
    leg: {
      femur: 4.0,     // rev. 3 (was 5.8)
      tibia: 4.8,     // rev. 3 (was 7)
      metatarsus: 2.8, // rev. 3 (was 3.8)
      toeIII: 3.6,
      claw: 1.3,
      diameters_thigh_knee_shank_ankle_foot: [3.0, 1.75, 1.55, 0.92, 0.76],  // rev. 1: 170 t per leg
      toes: "3 forward + opposable hallux (raptor)"
    },
    wing: {
      humerus: 8.6,   // rev. 3 (rev. 2: 10.2, rev. 1: 8)
      forearm: 16.4,  // rev. 3 (rev. 2: 14.8, rev. 1: 17)
      diameters_shoulder_elbow_wrist_hand: [2.6, 1.9, 1.3, 0.75],
      fingers: [
        ["II", 14.5, [5, 2.5], 2],
        ["III", 15.5, [11.5, 8.5, 5], -5],
        ["IV", 14, [10.5, 7.2, 3.4], -28],
        ["V", 12.8, [9, 6, 2.6], -52]
      ],
      thumb: { mc: 1.3, ph: 0.9, claw: 1 },
      membraneTo: "ankle",
      membraneThickness: 0.014,
      glideArmAngles: { humerus: -15, forearm: 12 },
      legSplayInGlide: 30
    },
    stand: { forearmLean: 10, humerusRise: 16, neckRise: 46, headPitch: -20, tailDroop: 18 },
    eyeDiameter: 0.39,
    teethPerSide_upper_lower: [18, 17],
    jawMaxDeg: 45,
    horns: [
      {
        name: "main",
        pair: true,
        from: "rear skull corners",
        length: 6.4,
        base: 0.36,
        shape: "slender, gently S-curved: back and up above the neck line, tips back and down"
      },
      {
        name: "crown",
        pair: true,
        count: 3,
        from: "back edge of the skull, fanning out",
        length: [2.4, 1.7, 1.1],
        base: [0.2, 0.17, 0.14],
        shape: "curving back like a frill"
      }
    ],
    colours: {
      scales: "albino white, linear albedo 0.65-0.72, polished faceted plates, never emissive",
      eyes: "(proposed) pale rose-violet, red reflex",
      membrane: "(proposed) ivory with a faint rose flush",
      fire: "none in Episode 1"
    },
    flapHz: 0.24,
    flapAmplitudeDeg: 75,
    density: 0.58,
    derived: {
      mass_t: 341.55,
      flyingMass_t: 341.552,
      span: 131.6,
      wingArea: 2517,
      aspect: 6.9,
      wingLoading: 1331,
      stall: 34.8,
      hipHeight: 14.41,   // rev. 2 sculpt; rev. 3 sculpt (bind) hip 10.6 with the shorter legs
      shoulderHeight: 14.8,
      elbowHeight: 17
    }
  },
  scout: {
    L: 6.8,
    skull: 0.5,
    neck: 1.1,
    trunk: 1.6,
    tail: 3.6,
    cervicals: 9,
    caudals: 40,
    head: [[0, 0.25, 0.25], [0.3, 0.24, 0.23], [0.55, 0.17, 0.15], [0.8, 0.11, 0.1], [1, 0.06, 0.05]],
    neckProfile: [[0, 0.15, 0.17], [0.5, 0.19, 0.22], [1, 0.29, 0.37]],
    trunkProfile: [[0, 0.42, 0.62], [0.25, 0.47, 0.67], [0.6, 0.36, 0.48], [0.85, 0.3, 0.34], [1, 0.3, 0.3]],
    tailProfile: [[0, 0.25, 0.27], [0.15, 0.15, 0.17], [0.35, 0.085, 0.095], [0.6, 0.05, 0.055], [0.85, 0.03, 0.03], [1, 0.01, 0.01]],
    leg: {
      femur: 0.45,
      tibia: 0.54,
      metatarsus: 0.26,
      toeIII: 0.17,
      claw: 0.05,
      diameters_thigh_knee_shank_ankle_foot: [0.17, 0.09, 0.08, 0.05, 0.045],
      toes: "3 forward + hallux, small (swift-like)"
    },
    wing: {
      humerus: 0.62,  // rev. 3 (rev. 2: 0.72, rev. 1: 0.55)
      forearm: 1.28,  // rev. 3 (rev. 2: 1.18, rev. 1: 1.35)
      diameters_shoulder_elbow_wrist_hand: [0.27, 0.18, 0.11, 0.065],
      fingers: [["III", 1.3, [1.05, 0.8, 0.45], -12], ["IV", 1.15, [0.9, 0.5], -46]],
      thumb: { mc: 0.08, ph: 0.06, claw: 0.06 },
      membraneTo: "hip",
      membraneThickness: 0.0011,
      glideArmAngles: { humerus: -20, forearm: 6 },
      legSplayInGlide: 10
    },
    stand: { forearmLean: 14, humerusRise: 10, neckRise: 30, headPitch: -18, tailDroop: 16 },
    eyeDiameter: 0.055,
    teethPerSide_upper_lower: [20, 19],
    jawMaxDeg: 60,
    horns: [
      {
        name: "main",
        pair: true,
        from: "back of the skull",
        length: 0.48,
        base: 0.035,
        shape: "long, thin, straight, laid back flat along the neck (~10 deg above it)"
      }
    ],
    colours: {
      scales: "(proposed) slate grey #4f565e above, pale grey below",
      eyes: "(proposed) pale yellow",
      membrane: "(proposed) dark grey-brown #4a3f3a",
      fire: "none shown"
    },
    flapHz: 1.09,
    flapAmplitudeDeg: 95,
    density: 0.62,
    derived: {
      mass_t: 0.27,
      flyingMass_t: 0.377,
      span: 11,
      wingArea: 13,
      aspect: 9.3,
      wingLoading: 284,
      stall: 17.6,
      hipHeight: 1.09,
      shoulderHeight: 1.24,
      elbowHeight: 1.33
    },
    tailVane: { length: 0.42, width: 0.28 },
    rider_kg: 95
  },
  hatchling: {
    L: 1,
    skull: 0.19,
    neck: 0.13,
    trunk: 0.27,
    tail: 0.41,
    cervicals: 10,
    caudals: 34,
    head: [[0, 0.15, 0.15], [0.3, 0.165, 0.17], [0.55, 0.14, 0.13], [0.8, 0.11, 0.095], [1, 0.08, 0.065]],
    neckProfile: [[0, 0.085, 0.095], [0.5, 0.095, 0.105], [1, 0.13, 0.15]],
    trunkProfile: [[0, 0.15, 0.17], [0.3, 0.19, 0.2], [0.6, 0.2, 0.2], [0.85, 0.16, 0.16], [1, 0.13, 0.13]],
    tailProfile: [[0, 0.1, 0.1], [0.15, 0.075, 0.078], [0.35, 0.05, 0.052], [0.6, 0.028, 0.03], [0.85, 0.012, 0.013], [1, 0.004, 0.004]],
    leg: {
      femur: 0.075,
      tibia: 0.08,
      metatarsus: 0.045,
      toeIII: 0.065,
      claw: 0.018,
      diameters_thigh_knee_shank_ankle_foot: [0.05, 0.035, 0.03, 0.022, 0.02],
      toes: "3 forward + hallux, oversized"
    },
    wing: {
      humerus: 0.072, // rev. 3 (rev. 2: 0.085, rev. 1: 0.07)
      forearm: 0.118, // rev. 3 (rev. 2: 0.105, rev. 1: 0.12)
      diameters_shoulder_elbow_wrist_hand: [0.038, 0.026, 0.02, 0.016],
      fingers: [
        ["III", 0.08, [0.05, 0.035, 0.02], -10],
        ["IV", 0.07, [0.035, 0.02, 0.01], -48],
        ["V", 0.06, [0.025, 0.015, 0.008], -80]
      ],
      thumb: { mc: 0.016, ph: 0.014, claw: 0.02 },
      membraneTo: "knee",
      membraneThickness: 0.0006,
      glideArmAngles: { humerus: -16, forearm: 12 },
      legSplayInGlide: 22
    },
    stand: { forearmLean: 22, humerusRise: -12, neckRise: 20, headPitch: -32, tailDroop: 30 },
    eyeDiameter: 0.036,
    teethPerSide_upper_lower: "erupting, 2-3 mm",
    jawMaxDeg: 30,
    horns: [
      {
        name: "buds",
        pair: true,
        from: "back corners of the skull",
        length: 0.025,
        base: 0.012,
        shape: "soft pale-gold cones, back and up"
      },
      { name: "egg tooth (not a horn)", pair: false, from: "snout tip", length: 0.004 }
    ],
    colours: {
      scales: "24-karat gold look: metallic F0 ~ (1.0, 0.77, 0.34) linear, wet film",
      eyes: "(proposed) dark bronze, gold flecks",
      membrane: "(proposed) pale translucent gold, wet",
      fire: "none"
    },
    flapHz: 0,
    flapAmplitudeDeg: 0,
    density: 0.98,
    derived: { mass_t: 0.011, span: 0.9, hipHeight: 0.18, shoulderHeight: 0.14, note: "cannot fly" }
  },
};
```

## Appendix B - sources

* Witton, M. P. & Habib, M. B. (2010). On the size and flight diversity of giant pterosaurs, the
  use of birds as pterosaur analogues and comments on pterosaur flightlessness. *PLoS ONE* 5(11):
  e13982 - giant azhdarchids ~200-250 kg, quadrupedal launch. Summary:
  [Quetzalcoatlus (Wikipedia)](https://en.wikipedia.org/wiki/Quetzalcoatlus); mass estimates
  reviewed in [Andres & Langston 2021, *JVP* 41 sup1](https://bioone.org/journals/journal-of-vertebrate-paleontology/volume-41/issue-sp1/02724634.2021.1907587/Morphology-and-Taxonomy-of-Quetzalcoatlus-Lawson-1975-Pterodactyloidea-Azhdarchoidea/10.1080/02724634.2021.1907587.full).
* Pennycuick, C. J. (1990). Predicting wingbeat frequency and wavelength of birds. *J. Exp. Biol.*
  150: 171-185 - [article](https://cob.silverchair.com/jeb/article/150/1/171/5695/Predicting-Wingbeat-Frequency-and-Wavelength-of).
* Pennycuick, C. J. (2001). Speeds and wingbeat frequencies of migrating birds compared with
  calculated benchmarks. *J. Exp. Biol.* 204: 3283-3294 - [record](https://research-information.bris.ac.uk/en/publications/speeds-and-wingbeat-frequencies-of-migrating-birds-compared-with-/).
* General anatomy used without a specific citation here (standard zoology): bat wing structure
  (digits II-V, propatagium / chiropatagium / plagiopatagium, elastin and plagiopatagiales
  muscles, thumb walking in vampire bats and their bounding gait), pterosaur hand and foot
  trackways, bird and theropod hind limbs (mesotarsal ankle, scutellae and reticula), crocodilian
  osteoderms, belly scutes and jaw-carrying of young, Komodo dragon osteoderms (absent in
  juveniles), pupil shape and ecology, falcon nostril baffles, structural metallic colour in
  *Chrysina* scarabs.
