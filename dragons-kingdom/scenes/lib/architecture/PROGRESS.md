# Architecture kit - progress log (for a successor)

## Fix round 2 (in progress, 2026-10-08) - critic round 2
Done so far (code, previewed at 1920 in scenes/lookdev/architecture-dev.js and the contact scene):
- Masonry: stones SET IN the mortar (face flat 0-12 mm proud, rounded arrises dive under the bed:
  irregular outlines, no rim highlight / drop shadow); per-stone arris radius; block() clamps every
  displacement near an arris to half the rounding radius (the 'stacked paper' slivers were the
  noise/chip folding the rounding rows); lime mortar with a scanned sand grain (acg_ground05),
  sparse grit, lime bloom (no pepper pits); stone mottling instead of a camouflage scan; dressed
  stone more varied; blocked-up openings (masonryFace op.blocked); drip stains under sills.
- Weathering decals (weathering.js stain/grimeBand, materials stain): dirt, rust, lime, algae.
- Glass: quarry tilt ~1 deg (no sky/ground checker), per-quarry tint, grime at the leads; oiled
  linen glazing ('cloth'); houses glazed by wealth (o.rich), most unglazed with shutters or cloth;
  shop fronts with a let-down counter and a propped hood.
- Roofs: the gable principals sat 8-17 cm above the rafter line (the grey 'strip' on the tiles) -
  now 7 cm under it; verges with a bargeboard under the oversailing tiles and a mortar bead; sag
  carried by the gable walls, eaves-line sag, wandering courses, per-roof tile batch and age; lead
  flashings round stacks, soot streaks, clay pots.
- Timber: structural members proud of studs/braces, studs run 3.5 cm behind rails (no gaps),
  150-260 mm studs at 0.6-0.9 m, bows 20-45 mm, jetty bressumer sag, flush faceted pale pegs
  (oakPeg), end checks on joist ends, meandering jagged hairline cracks (no Voronoi), worn limewash.
- Canon: stone support = broad pier 2.6 x 1.5 x 3.4 m on a two-step plinth with a mounting block
  (centre moved 0.4 m east to x 13.3 to clear the steps' cheek wall); town gate 4.4 m between 4.6 m
  piers, beam + tiled roof, heavy braced leaves on pintles, rutted threshold, stop stone; access
  rig: jib/mast/ropes removed - a drawbridge gangway (6 m) on two chains over sheaves on the front
  posts to a deck windlass, scarfed posts, silver oak, sunk stone pads, lashings; harbour handrail
  removed (mooring rings), tide zones stronger, waterline foam, goods on the quay, a town behind.
- Leaf platform: axle trees, turned naves, 12 dished spokes, felloes, iron tyres, mud.
- Fountain: flush leaded cramps with rust, breaking glassy jets with drops and splash crowns,
  turbulent ripples, limescale/algae streaks. Cobbles: tight, half buried, walking lines, LOD.
- Stable: two-stage bonded buttresses; lodge: 15-18 cm copings, bark logs with sawn ends, a hood on
  wall posts and brackets.
Next: foam patches too opaque; palace + round tower massing; interiors (chamber door/nest box/
walls/straw/linen, treatment seat/coast/cloths/basin/spalls); lookdev scenes (map overlay, arch
exposure, verdor ground, interior shots); 4K finals *_r2.

## State (2026-10-08, fix round 1 done; 4K finals rendered to the session scratchpad)

Session 1 built the kit (README.md has the API). Fix round 1 answered the critic report:

Root-cause fixes
- **Triangle-shaped tone patches / fine cross-hatch** everywhere at 1:1: the per-piece seed
  (aInfo.x) is an interpolated varying and `akH1` was fract(sin(x) * 43758) (~1e5 gain) - the
  interpolation round-off became per-triangle noise. core.js writes seeds at 1/8192 bucket
  centres, every fragment body reads the snapped `akI` (materials.js), akH1 is a low-gain hash.
  Verified with the debug modes (`archMaterials(ctx, { debug: 4 })` = albedo unlit) on 4K-footprint
  close-ups in architecture-dev.js. Planar projections take their axes from the piece (akPlanarE).
- **King's steps inside out / floating**: cheek walls had stone on one face only. Now a solid flight
  between stepped cheek walls (masonryBox sections), retaining walls and a parapet round the terrace.

Canon items
- Gate to the broad road: a road runs east from the gate (scene ground), houses line its first stretch.
- Alley (vendor's crate): a lane north that bends east, houses close every view up it.
- Stone arch: a gate passage through a house of the west row (through arches, passage walls, a
  joisted ceiling, a jettied timber room over it); its bressumer over the arch is its own mesh
  (`clingSquare(...).beam` = { group, a, b }) - the 3C beam that falls across the arch path. The
  arch itself stays standing (stone).
- Access rig: 15th-century carpentry, deck 10.6 m: Charcoal's lying seat height is ~9.5-9.9 m
  (measured with scenes/lookdev/architecture-probe.js on the creature domain's model and F2 pose),
  the gangway falls 0.9 m to land at the saddle (no jump). Re-check if the creature domain changes
  Charcoal's size or the lying pose.
- Leaf's platform: handrails on BOTH sides of its stair (Abby's free right hand finds one whether
  she walks down facing out or backs down), padded leather roll on the side that meets Leaf (+x).
- Treatment room: an arm support at the patient's LEFT (anchors.seat / anchors.armSupport), the
  doorway shown (shot 'treatment-door'), a real view (lower town roofs, the harbour, the sea).
- Birthing chamber: warm 1900-2200 K lamps, soot plumes, a smaller cloth-simulated linen sheet over
  a straw bed (2000 clumps), straw spilling over a kerb of straight chamfered stones.
- Harbour steps: a solid stair built against the quay face, running into the water, tide zones.
- Stable: kept as a dragon stable for Leaf-sized dragons (door 5.6 x 6.6 m); Charcoal is mounted
  outside from the rig in the open yard.

Other realism work: octagonal conduit fountain (running jets, rippled pool, cramps), cobbles of mixed
size bedded in earth with a kennel and puddles, second rows of houses behind every gap, all-stone and
lime-washed house variants, setbacks and height variety, boarded eaves soffits (no rafter teeth),
tile tilt and roof sag/undulation, chimney flaunching and height, tighter rubble, gable studs on the
plate and into the principal rafters, varied timber sections, irregular jetty joists carrying the
bressumer, flush plaster with a quirk, plaster runoff under every member (timber.js -> aInfo.z),
lichen rosettes (sparse, low contrast), tile lichen in tile coordinates, dark lead and domed crown
glass, silvered oak in patches, gate leaves with ironwork and a droop, palace with crenellations,
a gatehouse, dressed slit surrounds and a corbelled band, Leaf platform wheels, rig lifting gear.

Late fixes found on the 4K finals (re-rendered as *_r1b):
- Far LOD (palace): the flat stones stood 0.5-3 mm proud of the mortar core and z-fought with it
  at 400 m (triangle patches) - the core goes back 3 cm under `LOD.far` (faces and gables); far
  stone uses the sandstone scan (the veined rock read as camouflage); turf on the palace rise.
- Doors into a room portal had no floor in the reveal (sky showed under the door): a threshold slab.
- Nest linen: the bake's collision dome sits under the JS dome in places, so half the sheet was
  hidden in the straw bed (read as a bare tan disc): the sheet is kept above the bed, with soft
  lumps, hand-laid creases and a few stray stems; straw is excluded under its real footprint.
- Treatment room graded at 5600 K (daylight; the chamber stays at 4600 K, lamps), the floor-bounce
  light moved off the arm support.
- Keeper's lodge: flush-pointed squared stone (STYLE.pointed) instead of deep joints.
- Mortar: grit, mottling, little pits and runs (it read as flat grey paint at 1:1).
- Open shutters hang on pintles 45 mm off the face (they cut into the proudest rubble stones).

Offline bakes (Blender bpy 4.2, `cache/` is git-ignored; scripts committed):
  <bpy python> scenes/lib/architecture/offline/nest_cloth.py     (~1 min)
  <bpy python> scenes/lib/architecture/offline/table_cloth.py    (~10 s)

## Round-1 finals (native 3840x2160, session scratchpad arch/final_r1/, not committed)
Hero stills (film finish): chamber_r1b, chamber_nest_r1b, treatment_r1b, treatment_window_r1b,
treatment_door_r1b (scenes/lookdev/architecture-interiors.js t 0-4); verdor_stable_rig_r1,
verdor_rig_r1, verdor_keeper_platform_r1b, verdor_palace_r1b, verdor_harbor_r1 (architecture-verdor.js
t 0-4); cling_row_r1b, cling_arch_r1, cling_square_r1, cling_gate_r1, cling_detail_r1b,
cling_steps_r1, cling_fountain_r1, cling_alley_r1 (architecture-cling.js t 0-7). Contact sheet:
contact_r1_00..15 (architecture-contact.js t 0-15, `--cinematic velocity`) tiled 4x4 into
contact_sheet_r1_4k.png. The *_r1 versions of the re-rendered stills are the "before" of the late fixes.
4K times on this box (SwiftShader, shared CPU): hero stills 130-380 s (Cling 280-380 s, Verdor
100-190 s, interiors 140-340 s), contact tiles 31-58 s. `npm test`: 33/33 pass.

## Open issues / next
- Stones and plaster still read a little clean at hero distance; the rock scan (acg_rock26) shows
  veins (marble-like) on dressed stone - a better CC0 sandstone / limestone scan would help (Poly
  Haven and ambientCG were still blocked on 2026-10-08).
- Jetty joist ends are irregular now but still a strong rhythm; oak at mid distance is plain.
- No planar reflections: the harbour water reflects the sky only (runtime request).
- Interiors: IBL is not occluded by walls (runtime request; point lights fake the bounce).
- Damage: roof tiles (`damage`) and the 3C beam mesh; no broken walls.
- Nest linen: its edge steps where it runs over the kerb (the bake does not cover the kerb); a
  re-bake on the current dome (offline/nest_cloth.py) would let the creases and lumps go.
- Mortar pits read as an even pepper of dots at 1:1 (cluster them, fewer); split rubble stones show
  thin stacked edges where the two halves overlap.
- The arch shot is in deep shade; the fountain ripples are too regular; puddles are flat decals;
  the broad road is a plain earth plane (scene ground); stone still reads a little clean at 1:1.
- Props (stalls, barrels, carts, banners), people and terrain outside the sets are other domains'.
- The contact sheet tiles are native 4K stills rendered with `--cinematic velocity` (one sample,
  no film finish) to keep the time down; the hero stills use the film finish (5-8 sub-frames).
