# FX library - progress log (for a successor)

Owner track: fx. Owned paths: `scenes/lib/fx/`, `scenes/lookdev/fx-*.js`. Scratch renders live
outside git (`/tmp/claude-0/.../scratchpad/eng1/fx/`); nothing under `output/` is committed.
API and usage: `README.md` in this folder. Self-test: `node scenes/lib/fx/tools/selftest.mjs`.

## State

| module | status | lookdev |
|---|---|---|
| `core/` manager, particles (puff / drop / glow / chip / flame / shimmer capsules with shutter streaks, energy-normalised), depth twins, light rig, noise volume, deep-shadow grid, tiers, late pass | done | all |
| `core/decal.js` projected film decals (static, skinned, ground, plane) - coat / splat / spatter / stamps / run / smear / soak / pool / burn / scorch / char / wet / gash | done; smear still a little uniform | `fx-blood.js` |
| `blood.js` spray (drops stamped where they land), drip, pool, film decals, blood in water, tint | done | `fx-blood.js`, `fx-water.js` |
| `dust.js` downwash (wall jet + ring vortex; wall thickened so its tangent edge is not a straight cut), cloud, haze; multiple scattering | done | `fx-dust.js`, `fx-director.js` |
| `debris.js` collapse / burst / boards / turf: closed-form flight, bounces, slide, settle on a stable face; props breakables; torn sod with grass and roots | done | `fx-destruction.js`, `fx-director.js` |
| `smoke.js` plume / trail / wisp (wood, chimney, smoulder, soot, cloth, steam, pipe, herb) | done | `fx-smoke.js` |
| `fire.js` jet (flames, 3 lights, embers, soot, shimmer, scorch), burn, embers, shimmer | working; jet core still soft near the mouth, Leaf's blue jet reads as a violet blob | `fx-fire.js` |
| `water.js` splash, spray, foam, trail, churn, downwash ring on the FFT ocean | done | `fx-water.js` |
| `gore.js` wing root, open fracture, scalp, burned rider, garment holes | working; reads as gore but still a little CG (bone too clean, scalp blood thin, rider burn small in frame) | `fx-gore.js` |
| `cloth.js` banner (release, gust, real split tear), drape over a body, fabric material | done | `fx-cloth.js`, `fx-director.js` |
| `sparks.js` sparks, ash | done | `fx-cloth.js`, `fx-director.js` |
| `director.js` 34 director cue kinds via `registerDirectorFx` | done (gore / body decals wait on `api.actor`) | `fx-director.js` |

## Notes / decisions

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

## Next

1. Fire jet: denser, hotter core near the mouth; Leaf palette less violet-blob.
2. Gore: scalp blood sheets heavier; fracture bone with marrow / blood film; frame the burns.
3. Blood carried along Charcoal's neck (F1 bite): a lookdev on the creature's scales.
4. REQUESTS outstanding: director `api.actor(name)` + live `point` for FX factories; runtime
   aerial perspective for late transparent objects; humans costume-damage states (torn hose,
   burned sleeve as garment variants instead of holes in the shader).
