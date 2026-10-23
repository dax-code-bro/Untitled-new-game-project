# FX library - progress log (for a successor)

Owner track: fx. Owned paths: `scenes/lib/fx/`, `scenes/lookdev/fx-*.js`. Scratch renders live
outside git (`/tmp/claude-0/.../scratchpad/eng1/fx/`); nothing under `output/` is committed.
API and usage: `README.md` in this folder. Self-test: `node scenes/lib/fx/tools/selftest.mjs`.

## State

| module | status | lookdev |
|---|---|---|
| `core/` manager, particles (puff / drop / glow / chip / flame / shimmer capsules with shutter streaks, energy-normalised), depth twins, light rig, noise volume, deep-shadow grid, tiers, late pass | done | all |
| `core/decal.js` projected film decals (static, skinned, ground, plane) - coat / splat / spatter / stamps / run / smear / soak / pool / burn / scorch / char / wet / gash; screen-space reflections of the surroundings in wet ground / wall films (late pass) | done; smear still a little uniform; coat `params.w` streams, sheet never cut by its box, spatter thins out at the box edge | `fx-blood.js`, `fx-cling.js`, `fx-scales.js` |
| `blood.js` spray (drops stamped where they land), drip, pool, film decals, blood in water, tint | done | `fx-blood.js`, `fx-water.js` |
| `dust.js` downwash (wall jet + ring vortex; wall thickened so its tangent edge is not a straight cut), cloud, haze; multiple scattering | done | `fx-dust.js`, `fx-director.js` |
| `debris.js` collapse / burst / boards / turf: closed-form flight, bounces off ground AND wall faces, slide, settle on a stable face, tilt onto what is under it; piles (later pieces lie on earlier ones); tiles / plaster shatter on hard impacts; roof-slope slide pre-segment; toppling over an edge; held pieces; props breakables; torn sod; rafters, battens, wattle-and-daub | done | `fx-destruction.js`, `fx-cling.js`, `fx-director.js` |
| `destruction.js` Cling: `damageCapture` + `roofline` (the set's own removed tiles held, then blown / sliding off in sheets; clay + stone slate in the set's batch and height), `object` (thrown / toppling prop), `split` + `sweep` (a prop coming apart into its loose parts), after-state = same cues with t0 = -100 | done | `fx-cling.js` |
| `smoke.js` plume / trail / wisp (wood, chimney, smoulder, soot, cloth, steam, pipe, herb) | done | `fx-smoke.js` |
| `fire.js` jet (flames, 3 lights, embers, soot, shimmer, scorch), burn, embers, shimmer | working; flame noise stretched along the flow (no more cracked-mud cells), clean vs sooty burn from the palette, mouth rod, soot plume reworked; still pastel peach in the grade, rider burner blobby | `fx-fire.js` |
| `water.js` splash, spray, foam, trail, churn, downwash ring on the FFT ocean | done | `fx-water.js` |
| `gore.js` wing root, open fracture, scalp, burned rider, garment holes | working; fracture bed wrapped round the shin (fills the hole), bone under a blood film, scalp blood in streams, forearm burn through every garment layer, close-up; neck burn opt-in (`neck: true`: does not read under the scout rider's hood) | `fx-gore.js` |
| `cloth.js` banner (release, gust, real split tear), drape over a body, fabric material | done | `fx-cloth.js`, `fx-director.js` |
| `sparks.js` sparks, ash | done | `fx-cloth.js`, `fx-director.js` |
| `director.js` 37 director cue kinds via `registerDirectorFx` (+ debris-roofline / debris-object / debris-sweep; thrown props go home when their cue is off) | done (gore / body decals wait on `api.actor`) | `fx-director.js` |
| `core/tier.js` tiers + aliases (low / medium / high / hero), `ctx.quality.fxParticles` scale, self-tested CPU vs RTX selection | done | selftest |

## Notes / decisions

* Gore skin albedo is matched by pixel to the humans library's skin in the same light
  (`SKIN = [0.27, 0.13, 0.075]`): the old 0.36 / 0.24 / 0.18 rendered pale pink-white beside it.
  Thin blood over skin multiplies it (a linear mix with dark blood read mauve).
* Cloth holes are cut in bind space: `ClothHole` now measures bind units per world metre round
  its centre, so `radius` is metres on any garment (it was 1.0 on every build checked so far).
* Wound beds on limbs wrap round a cylinder of the limb's own half-width, measured by two rays
  across it started 10 cm out (inside the gap to the other leg): the bone line runs near the
  front of the shin, so its distance is no measure of the leg's roundness.
* Blood on black scales reads bright red where it is thick (lips, chin) - the film's own albedo;
  drops of the spray read as white glints at hero distance (their sun highlight).

* **The violet pools were a bug, not physics**: the decal shine material replaced three's
  `material.defines` (STANDARD / PHYSICAL) with its own, so the physical chunk lost IOR and
  USE_SPECULAR and the base layer became a 4 % mirror with F90 = 1 under the clearcoat - a
  second sky reflection on every film. Fixed (defines merged); liquids now have `spec: 0` (one
  interface: the clearcoat). Pools are dark maroon and mirror what is around them (SSR).
* Multiple-scattering octaves in the puff shader are energy-normalised (`1 / (1 + 0.75 (ms + ms^2))`):
  dust / smoke / steam were up to 2.3x brighter than a matte surface of their albedo (cotton-wool
  white dust next to lime-washed walls). All particle FX got a little darker and more textured.
* Roofline tiles are plain meshes (not instanced): the architecture's tile shader computes its
  world normal from modelMatrix only. A few hundred draw calls per roof hole.
* Debris impact dust is normalised by the number of impacts (sqrt(30 / n)): a roof's worth of
  slates makes one cloud, not 400 opaque puffs.
* Thrown objects standing on the ground used to "land" at t0 (the spin pushed their box corner
  into the ground at once): they now pivot over their far bottom edge first (`solvePiece` pivot).

* Liquids are shaded as films: pass 1 multiplies the surface underneath by the film's
  transmittance (thin blood tints skin / plaster red, thick blood hides it), pass 2 is a
  MeshPhysicalMaterial (clearcoat for wet, procedural height -> bump for the meniscus) drawn
  additively. Both passes evaluate the same GLSL thickness field (`fxdEval`).
* A decal is projected at PLACEMENT time: pose the character / creature first. Skinned decals are
  SkinnedMeshes on the same skeleton (bind-space positions + skin weights copied).
* Pools reflect the sky: under a blue sky a dark-red pool looks purple-maroon at grazing angles.
  That is what the physics gives; judge it in the real set's light before "fixing" it.
* `fx.update(t)` skips particle effects on the cinematic stack's shutter-open pose; effects with
  `velocityPose = true` (debris, cloth, gore appliances) still pose there for motion vectors.
* Motion streaks are energy-normalised (a fast drop does not brighten); flames, the water sheet
  and sparks opt out (`conserve: false`) - they are emitters / sheets, not small blobs.
* Depth twins: a depth-only copy of each particle layer writes an alpha-weighted depth so the
  runtime's haze / AP / DOF see smoke at its own distance (before: fire washed out by the far
  background's aerial perspective).
* Cloth tear: vertices along a ragged chain are doubled; each side's triangles and springs use
  their own copy; a zero-length glue spring parts progressively (no hole of missing triangles).
  Normals of the two copies are averaged until they part (no seam line before the tear).
* Director: actor points are followed through `env.approxPoint` (pure); `env.point` reads the
  cast posed for the current frame whatever time is asked, which would collapse a trail onto
  its source. One FX manager serves all cues (`ctx.__dkFxDirector`).
* A syntax error anywhere in the library makes the director's `loadFxLibrary()` quietly fail
  (it catches): `fx-director.js` throws instead, so render it after edits.

## Renders looked at (scratch, `.../scratchpad/eng1/fx/`)

* round 3: fire `fire2/sheet-a.png` (before) -> `sheet-c.png` / `sheet-d.png` (flow-stretched
  structure, soot plume); gore `gore2/sheet-a.png` (before) -> `gore3/sheet-k.png` (after: wing
  root, scalp streams, fracture filled, forearm burn close-up); the grey-through-the-hole bug in
  `gore3/c-13.5.png` / `dbg3-13.5.png` (bed hidden with the hose off: a narrow strip - wrap radius
  was the distance to the bone line); neck burn attempts `gore3/h-25.5.png`, `j-25.5.png` (hood
  and shirt collar between, the kept skin cut in jagged triangles - left opt-in); blood on
  Charcoal `scales/sheet-a.png` (spatter too uniform, cut at the box edge) -> `scales/sheet-c.png`
  (falloff along the neck, wet at 1 s, dried dark and matte at 10 min).

* cling v1-v13 (`cling/sheet-v*.png`): held slates indistinguishable from the roof before the
  strike (v2-24.3), sheets sliding off the eaves (v8-10.6), piles at the wall foot, shards on
  the paving, stall toppling then tumbling into the square with its goods flying (v7), roof
  holes after (v8-33: bare deck boards - see REQUEST architecture), pool along the joints
  dark red after the define fix (v12, v13), smear under the sill.
* pool tests (`pool/sheet-a..f.png`, `pool/crop-j.png`): reflections of the wall / post / a beam
  lying in the pool; `blood2/sheet-d.png`: the blood lookdev after the fix.
* `ms/sheet-ms.png`: dust / smoke / fire after the energy normalisation (downwash dust brown and
  textured instead of creamy).

* blood v1-v4 (`sheet-blood-v4.png`): spray stamps on the wall read as spatter; face spatter
  reads; smear still too uniform; soak edge fixed; pool colour purple under blue sky (see above).
* destruction v2 (`sheet-destr-v2.png`): collapse reads, pieces rest flat, bright dust.
* dust v3 (`sheet-dust-v3.png`): rolling wall; director v3 (`sheet-dir-v3.png`): wall edge fixed.
* fire v5 / v6 (`sheet-fire-v5.png`): stake fire + smoke good; jet soft / pale near the mouth.
* smoke v3 (`sheet-smoke-v3.png`): pipe ribbon, smoulder wisps, trail.
* water v6 (`sheet-water-v6.png`): crown splash, lacy foam, churn + blood, thin downwash.
* gore v8 (`gore-v8-*.png`, preview): wound reads; bone too clean; scalp blood weak.
* cloth v3-v5 (`sheet-cloth-v3.png`, `sheet-cloth-v5.png`): release / throw / landing, split tear,
  drape over a body (head / feet readable); sparks visible after `conserve: false`.
* director v1-v6 (`sheet-dir-v*.png`, `crop-turf6.png`): cues match direct calls exactly; turf.

## Next (round 4)

1. Fire: the jet still grades pastel peach (AgX + print desaturation of a 1500 K body): try a
   hotter, more saturated core and darker soot edges in the real F1 / 3C light; rider burner.
2. Gore: neck burn under a hood (needs REQUEST humans: costume-damage state or kept skin there);
   bone shard geometry still a little paper-like up close.
3. Blood on scales: thinner, darker films on black hide (less paint-like on the lips); spray
   drops carried along a FLYING Charcoal (the slipstream) in the real F1 shot.
4. Cling: crumbling plaster panels out of the timber-framed storey under the strike (use
   `burst` with `daub` + `plaster` from the struck panel today); a falling beam that hinges at
   one end (3C-13 / R15-02) - the pivot segment can do it.
5. SSR: rough films could blur the trace; rays leaving the frame fall back to the sky map.

## Next (round 2 / 3, kept for reference)

1. Fire jet: denser, hotter core near the mouth; Leaf palette less violet-blob.
2. Gore: scalp blood sheets heavier; fracture bone with marrow / blood film; frame the burns.
3. Blood carried along Charcoal's neck (F1 bite): a lookdev on the creature's scales.
4. REQUESTS outstanding: director `api.actor(name)` + live `point` for FX factories; runtime
   aerial perspective for late transparent objects; humans costume-damage states (torn hose,
   burned sleeve as garment variants instead of holes in the shader); architecture: a damage
   region that also breaks the deck boards / battens (a dark hole into the roof space, broken
   rafter ends) instead of bare boards; props: `stall(F, kind, { ground: false })` or the ground
   goods as separate groups (the sweep splits them today by connectivity).
