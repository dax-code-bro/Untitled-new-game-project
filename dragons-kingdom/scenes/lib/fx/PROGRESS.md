# FX library - progress log (for a successor)

Owner track: fx. Owned paths: `scenes/lib/fx/`, `scenes/lookdev/fx-*.js`. Scratch renders live
outside git (`/tmp/claude-0/.../scratchpad/eng1/fx/`); nothing under `output/` is committed.

## State

| module | status | lookdev |
|---|---|---|
| `core/` manager, particles (puff/drop/glow/chip capsules with shutter streaks), light rig, noise volume, deep-shadow grid, tiers, late pass | done (first builder), shutter-open pass skipped for particles | - |
| `core/decal.js` projected decals (static, skinned, ground patch, flat plane), two-pass film shading (absorb multiply + lit shine), kinds coat/splat/spatter/stamps/run/smear/soak/pool/burn/scorch/char/wet | working, iterating on looks | `fx-blood.js` |
| `blood.js` spray (ballistic + drag, hits stamped onto ground / walls at landing time), drip, pool, coat/splat/spatter/runs/smear/soak, blood in water, tint | working, iterating | `fx-blood.js` |
| `dust.js` downwash, impact cloud, settling haze | first builder's version; to improve | `fx-dust.js` |
| debris / destruction, smoke, fire v2, water, gore, cloth, sparks, ash | not yet | - |

## Notes / decisions

* Liquids are shaded as films: pass 1 multiplies the surface underneath by the film's
  transmittance (thin blood tints skin/plaster red, thick blood hides it), pass 2 is a
  MeshPhysicalMaterial (clearcoat for wet, procedural height -> bump for the meniscus) drawn
  additively. Both passes evaluate the same GLSL thickness field (`fxdEval`).
* A decal is projected at PLACEMENT time: pose the character / creature first. Skinned decals are
  SkinnedMeshes on the same skeleton (bind-space positions + skin weights copied).
* Big static triangles are clipped to the projector box (a 2-triangle ground plane would
  otherwise run the decal shader over the whole screen).
* Pools reflect the sky: under a blue sky a dark-red pool looks purple-maroon at grazing angles.
  That is what the physics gives; judge it in the real set's light before "fixing" it.
* `fx.update(t)` skips particle effects on the cinematic stack's shutter-open pose (they draw
  their own shutter streaks and are excluded from velocity); effects with `velocityPose = true`
  (rigid debris, cloth) still update there so they get motion vectors.

## Renders looked at

* `fx-blood.js` draft views 0-7 (v1..v4): spray stamps on the wall read as spatter; face spatter
  reads; smear still too uniform/bright (v4 bands); soak edge fixed (fibre-scale noise); pool
  outline OK, colour purple under the blue sky (see above).
