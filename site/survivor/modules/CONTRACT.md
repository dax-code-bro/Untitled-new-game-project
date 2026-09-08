# Survivor module contract

Every feature beyond the core loop is a module: one file in
`site/survivor/modules/`, loaded as a plain `<script>` tag (there are no ES
modules here — sources are concatenated into one file for the single-file
build, so `import`/`export` will break the bundle).

## Registration

```js
/* One-paragraph comment saying what this module is and why it works the way
   it does. Comments explain reasoning, not mechanics. */
SurvivorGame.module({
  id: 'buildings',
  order: 10,                    // lower runs first; core sorts by this
  init(ctx) { /* build meshes, register keys, panels, listeners */ },
  update(dt, ctx) { /* optional per-frame; also available via ctx.onUpdate */ },
});
```

`init` is called once, after the world is generated and the scene exists.
A module that throws in `init` is logged and skipped — it must not take the
game down.

## `ctx` — everything a module is given

```js
ctx.LE            // Legend engine namespace
ctx.SV            // Survivor simulation namespace
ctx.game          // the live LE engine instance
ctx.world         // SV.World — terrain, clock, ecology, fishery, pois, players
ctx.player        // SV.Player — body, disease, injury, inventory, skills
ctx.avatar        // the engine character actor the camera is attached to
ctx.map           // world.map, the Heightmap

ctx.groundY(x, z)          // -> terrain height, metres
ctx.slopeAt(x, z)          // -> degrees
ctx.biomeAt(x, z)          // -> BIOME entry { id, name, cover, terrainFactor, ... }
ctx.aim()                  // -> { origin: Vec3, direction: Vec3 } down the camera
ctx.lookedAt(maxDist)      // -> engine raycast hit or null: { body, actor, point, normal, distance }

ctx.log(text, hot)         // a line in the log panel; hot = brighter
ctx.toast(text)            // transient message in the centre of the screen
ctx.hud.panel(id, opts)    // -> a DOM element you own; opts { className, style }
ctx.hud.setPrompt(text)    // centre interaction prompt; falsy hides it

ctx.key('e', (ctx, ev) => {}, 'Interact')   // register a key; lowercase single chars
ctx.onUpdate((dt, ctx) => {})               // per-frame hook
ctx.on('event', data => {})                 // subscribe
ctx.emit('event', data)                     // publish

ctx.state        // shared mutable bag; see "state channel" below
ctx.paused       // read-only
ctx.setPaused(v)
```

### State channel

The core reads these off `ctx.state` every frame. Set them, and the core
feeds them into the simulation:

| key | effect |
|---|---|
| `movementLocked` | truthy stops WASD and jump (menus, fishing, aiming a scope) |
| `stance` | overrides `'standing'`/`'crouched'`; use `'prone'`, `'swimming'` |
| `noiseOverride` | 0..1, overrides how loud the player is for animal detection |
| `concealment` | 0..1, overrides how hidden the player is |
| `statusLines` | array of strings appended to the status panel |

### Events the core emits

`death` → `{ cause }`

Modules should emit their own and document them at the top of the file.

## The engine (`ctx.LE` / `ctx.game`)

Creating things — every factory takes `at` and returns an `Actor`:

```js
game.box({ at, size, material, static, physics, breakable, mass, name })
game.sphere({ at, radius, material })
game.cylinder({ at, radius, height, material })
game.cone({ at, radius, height, material })
game.capsule({ at, radius, height, material })
game.rock({ at, radius, seed, material })
game.mesh({ geometry, at, material, key, collider, static, physics, name })
```

`game.mesh` is how a module draws geometry it built itself.
**`key` matters**: two calls with the same `key` share one GPU upload and
join one instanced draw, so two thousand trees cost one draw call. Always
pass a stable key for anything you spawn more than once.
`collider` is `'box' | 'convex' | 'sphere' | a LE.Shape | omitted` (visual
only). The collider is separate from the visual mesh on purpose.

Building geometry:

```js
const g = new LE.Geometry();
const i = g.vert(px, py, pz, nx, ny, nz, u, v);   // returns the vertex index
g.vertColor(r, g, b);                              // 0..1, optional, right after vert()
g.tri(a, b, c);  g.quad(a, b, c, d);               // quad = (a,b,c) + (a,c,d)
g.finalize();                                      // typed arrays, tangents, bounds
```

If you use `vertColor`, the material needs `{ vertexColor: true, color: 0xffffff }`.

`LE.Shapes` has ready-made generators: `box, sphere, cylinder, cone, capsule,
plane, terrain(size, segments, heightFn, uvScale, colorFn), rock, grassBlade`.

Materials — a preset name, a colour, or an options object:

```js
material: 'wood'
material: 0x8b5a2b
material: { preset: 'metal', color: 0x88ff88, roughness: 0.15, normalStrength: 0.4 }
```

Presets: `concrete brick wood metal steel gold copper rust rock stone grass
dirt terrain savanna mud sand marble ice glass fabric skin plastic tile
rubber neon lava`. Fields: `color roughness metalness emissive
emissiveStrength opacity texture uvScale normalStrength subsurface
doubleSided vertexColor`.

Actors:

```js
actor.position          // live Vec3
actor.setPosition([x,y,z]);  actor.setRotation([pitchDeg, yawDeg, rollDeg]);
actor.setScale(s);  actor.setTint(c);  actor.visible = false;  actor.destroy();
actor.push(dir, speed);  actor.setVelocity(v);
actor.userData          // yours
```

Queries, effects, destruction:

```js
game.raycast(origin, dir, maxDist)     // -> { body, actor, point, normal, distance } | null
game.raycastScreen(x, y, maxDist)
game.explode(at, { radius, strength })
game.shatter(actor, { point, force })  // actor must have been made breakable
game.particles.sparks(at, { count, speed, size })
game.particles.dust(at, { count, size })
game.particles.smoke(at);  game.particles.fire(at);  game.particles.explosion(at, { scale })
game.audio.impact(v);  game.audio.shatter(v);  game.audio.splash(v);  game.audio.tone(hz, seconds)
game.light({ at, color, intensity, radius })   // max 8 point lights, no shadows
game.input.down('e');  game.input.justPressed(' ');  game.input.axes.x
game.camera.position;  game.camera.target;  game._camYaw;  game._camPitch
```

Maths: `LE.Vec3, LE.Quat, LE.Mat4, LE.Aabb, LE.Rng, LE.Noise, LE.clamp,
LE.lerp, LE.smoothstep`.

`LE.Vec3` methods: `set add sub addScaled scale normalize length lengthSq dot
cross clone copy distanceTo distanceToSq applyQuat applyMat4 negate`.
Statics: `LE.Vec3.from([x,y,z])`.

`new LE.Noise(seed)` → `.fbm(x, y, z, octaves)`, `.noise3(x,y,z)`.
`new LE.Rng(seed)` → `.next()` 0..1, `.range(lo, hi)`, `.int(lo, hi)`, `.pick(arr)`.

## The simulation (`ctx.SV`)

```js
SV.World         world.map world.clock world.ecology world.fishery world.pois
                 world.classified world.rivers world.electrical world.corpses
                 world.step(realSeconds)  world.serialize()  world.describe()
                 world.chooseSpawn(side)  world.killPlayer(id, cause)
                 world.knockOut(id, energyJ)

SV.Player        player.body (Physiology)  player.disease  player.injury
                 player.inventory  player.skills  player.knowledge
                 player.capacity()  player.practise(skill, amount)

Physiology       .drink(litres, {salinityGL})  .eat({kcal, waterL, dryMassKg})
                 .status(hourOfDay) -> { thirst hunger energy coreTempC
                     sleepPressure alertness bladder bowel needsToilet
                     urgentToilet shivering sweatRateLh sweatWastedLh
                     bloodLoss hemorrhageClass capacity bmi }
                 .urinate() .defecate() .asleep .wet .clothingClo
                 .bodyWaterL .glycogenKcal .coreTempC .alive .causeOfDeath

DiseaseSystem    .expose(SV.VECTOR.untreatedWater, { hygiene, load })
                 .observedSymptoms() -> [{ id, text, severity }]
                 .differential() -> [{ id, name, note, confidence, treatments }]
                 .treat(drugId) -> [{ infection, effect, efficacy }]
                 .capacityMultiplier()  .infections  .immunity  .vaccinated

InjurySystem     .wound({ type, region, severity, soil, clean }) -> Wound
                 .tryFracture(regionId, energyJ)  .splint(boneId)
                 .headImpact(energyJ, dayLengthSeconds, now)
                 .fall(velocityMs, massKg, surface, dayLengthSeconds, now)
                 .summary()  .capacityMultiplier()  .painLevel
                 wound.apply('tourniquet'|'pressureDressing'|'sutures'|...)

Ecology          .animals  .carcasses  .zones  .groups  .census()
                 .near(x, z, radiusM, filter)  .carcassesNear(x, z, r)
                 .kill(animal, cause) -> Carcass
                 .wound(animal, severity, { fromX, fromZ }) -> Carcass|null
                 .bloodTrail(animal, spacingM) -> [{ x, z, amount, kind }]
                 animal: { x y z heading speedMs alive massKg shoulderHeightM
                     male species speciesId behaviour woundSeverity
                     detectionChance(dx, dz, opts) }

Fishery          .bodies  .fish  .cast(x, z, opts) -> { ok, fish, hold, reason }
                 .land(fish)  .release(fish)  fish.fight(dt, opts)  fish.fillet(opts)
                 body.holds  body.holdNear(x, z, tol)  body.tempAtDepth(d)

WorldClock       .hourOfDay .totalDays .season .period .lightLevel()
                 .sun() -> { altitudeDeg, azimuthDeg, direction }
                 .environment() -> { airTempC windMs windDirX windDirZ humidity
                     precipitation precipitationType cloudCover fog light ... }
                 .weather.describe() -> { sky, wind, trend, thunder }

Ballistics       new SV.Projectile(cartridgeId, { barrelIn })
                 SV.integrateTrajectory(proj, { launchAngleDeg, windMs, maxRange, env })
                 SV.zeroAngleDeg(proj, rangeM)   SV.freeRecoil(proj, gunMassKg, opts)
                 SV.CARTRIDGES  SV.msToFps  SV.joulesToFtLb

Penetration      SV.penetrate(proj, layers, { impactVelocityMs }) ->
                     { perforated, exitVelocityMs, exitEnergyJ, yaw, layers[],
                       residualPenetrationClass }
                 SV.layer(materialId, thicknessM, { obliquityDeg })
                 SV.ASSEMBLY.interiorPartition() / .exteriorFrameWall() / .torso()
                     / .deerChest() / .grizzlyShoulder() / .window() / .carDoor() ...
                 SV.woundSeverity(proj, penResult, regionId)
                 SV.PEN_MATERIAL   SV.BODY_REGION

Firearms         new SV.Firearm(weaponId, { condition, oilLevel })
                 .fire({ rng, prone, skill, fatigue }) ->
                     { fired, projectile, recoil, muzzleRise, accuracyMoa,
                       noiseDb, audibleM } | { fired:false, reason, jam }
                 .load(rounds)  .chamber()  .clearJam(dt)  .attach(id)  .inspect()
                 .disassemble()  .cleanPart(p,{solvent})  .oil(a,{oil})  .reassemble()
                 SV.WEAPONS  SV.ATTACHMENT  SV.handload(spec)

Species          SV.SPECIES  SV.rollIndividual(id, rng)  SV.butcherYield(ind, opts)
                 SV.FISH_SPECIES

Structures       SV.generateHouse(opts)  building.rooms  building.walls
                 building.circuits  building.panel  building.roomAt(x,z,storey)
                 building.wallsAlong(x1,z1,x2,z2,storey)
                 wall.layersAt(u)  wall.punch(u,y,r,opts)  wall.repair(stage)
                 wall.hasStudAt(u)  wall.openings  wall.holes  wall.integrity
                 room.type room.x room.z room.w room.d room.storey room.contents
                 SV.ROOM  SV.ROOM_LOOT

Electrical       SV.ElectricalSystem  SV.Circuit  SV.Conductor  SV.Load
                 SV.PowerSource  SV.checkWiring(spec)  SV.AWG

Terrain          SV.BIOME  SV.classifyBiome  SV.generateIsland
```

## Rules

1. **Never compute simulation in a module.** Read it from SV. If a number
   the player sees isn't in SV yet, it belongs in `survivor/src/`, not here.
2. **Instance everything you spawn in bulk.** Pass a stable `key` to
   `game.mesh`. A tree spawned two thousand times with two thousand keys is
   two thousand draw calls.
3. **Budget by distance.** Nothing far from the player should have geometry.
   Use `ctx.player.x/z` and build/destroy as they move.
4. **No `Math.random()` for anything the world should remember.** Use
   `new LE.Rng(seedFromPosition)` so the same place looks the same twice.
5. **Comments explain why, not what.** Match the density and voice of
   `survivor/src/` — no headers restating the file name, no narrating the
   obvious. Write in British-ish plain English; no em-dashes as separators is
   not a rule, but keep prose tight.
6. **No external assets, no network.** Everything is generated at runtime.
   The finished game is one HTML file.
7. **Guard everything.** A module that throws every frame is worse than a
   module that does nothing. Wrap risky work and fail quietly with a log.
8. **Plain scripts only.** No `import`, no `export`, no top-level `await`.
