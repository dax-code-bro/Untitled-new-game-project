# SOUTHBOUND — Roadmap / Master To-Do

Original open-world action game set in **Calvera**, a fictional state on the
southern edge of North America (Gulf Coast). Inspired by the open-world crime
genre, but every name, place, character and story beat is our own.

Status key: `[x]` done · `[~]` started / partial · `[ ]` not started

---

## Phase 1 — Graphics, world, core slice (current)

- [x] Three.js vendored locally (no CDN needed at runtime)
- [x] Start screen: **Phone** vs **PC** selection before loading
- [x] Auto GPU detection (reads GPU name, picks a preset)
- [x] Quality presets: Phone / Low / Medium / High / Ultra
- [x] Dynamic resolution: holds the target FPS (60 phone, 60–120 PC)
- [x] Render resolution up to 4K (3840×2160) on PC
- [x] Settings menu (graphics, controls, audio, content filters) saved locally
- [x] Physical sky + day/night cycle, sun and moon light
- [x] Image-based lighting from the sky (reflections on cars, water)
- [x] Cascaded-style sun shadows that follow the player
- [x] Procedural terrain shader (grass / dirt / rock / sand / snow by slope + height)
- [x] Water shader (Fresnel, animated waves, sun glints, shoreline foam)
- [x] Post-processing: bloom, SMAA, ambient occlusion (Ultra), ACES tone mapping, vignette, color grade
- [x] Instanced forests with wind animation, grass fields (PC)
- [x] Procedural textures (asphalt + lane lines, building facades, lit windows at night)
- [x] Regions: big city, small town, dense forest, open hunting plains, big lake, rivers/creeks, coast
- [x] Road network connecting regions
- [x] On-foot player, third-person camera, keyboard/mouse + touch controls
- [x] Drivable car (arcade physics, terrain following, collisions)
- [x] AI traffic that follows roads and keeps distance
- [x] HUD: minimap, speedometer, clock, region banner, FPS
- [x] Automated playtest: screenshots + video (tools/playtest.js)

## Phase 1.5 — Open-source asset pass (GTA-style) (done)

- [x] Animated people from Quaternius CC0 packs (12 outfits), 24 retargeted animations
- [x] Kenney CC0 Car Kit: 13 vehicles incl. police, taxi, ambulance, fire truck, garbage truck
- [x] Pedestrians on city/town sidewalks: cross streets, chat, flee gunfire, get hit, die, drop cash
- [x] Combat: fists + pistol, aiming camera, crosshair, hit detection, muzzle flash, tracers, blood (Content filter aware)
- [x] Wanted level (1–5 stars), police cruisers with sirens that chase you, officers who get out and shoot
- [x] Arrest and death with respawn at precinct / hospital, money, health and armor
- [x] Carjacking: the driver gets thrown out and runs off
- [x] HUD: health/armor under the radar, money, wanted stars, weapon + ammo, police on the radar
- [x] Game ships as one bundled script so it runs on older phones (tools/southbound/build.mjs)

## Phase 1.6 — Cinematic graphics pass (done)

- [x] Photo-scanned CC0 surfaces (ambientCG) in GPU-compressed KTX2 for terrain, roads, sidewalks, brick and concrete walls
- [x] Terrain: height-blended layers, anti-tiling, triplanar cliffs, normal maps
- [x] Height fog with sun glow (golden-hour haze), cloud layer
- [x] Post chain (pmndrs postprocessing + N8AO): AO, sun shafts, DOF (Ultra), bloom, AgX tone mapping, colour grade, grain
- [x] Realistic trees and bushes (ez-tree, baked): 3D near the camera, impostor sprites far away
- [x] Grass clumps and scanned rocks as ground cover
- [x] Hydraulic erosion on the terrain (gullies, ridges, valley floors)
- [x] Realistic player, pedestrians and police built from CC0 MakeHuman assets
- [x] Volumetric ray-marched clouds (cached in a sky cube, so 4K costs the same as 720p); clouds show in reflections
- [x] Weather: clear / cloudy / overcast / rain / storm with lightning and thunder; rain streaks; wet roads with puddles and street-light reflections
- [x] Planar reflections on the lake and the Gulf (High/Ultra)
- [x] Procedural realistic vehicles: smooth bodies, clear-coat paint, glass, LED lights, grilles, plates, panel gaps, real rims and tyres, LODs; random real-world paint colours for traffic

## Phase 1.7 — Arsenal + store readiness (done)

- [x] 221 weapons in 7 categories from 22 base platforms by 12 invented gunmakers (stats, prices, procedural 3D models)
- [x] 195 attachments in 6 slots (optics, muzzle, barrel, underbarrel, magazine, stock) that change weapon stats
- [x] Arsenal store screen (B key / HUD button): browse, buy, equip, fit attachments
- [x] Shotgun pellets, explosive rockets/grenades with blast damage, silent bows with arrows in flight
- [x] Installable web app (manifest + icons); Capacitor setup guide for the App Store / Google Play (`mobile/`)

## Phase 1.8 — The whole list (first playable versions)

- [x] Career save on the device (money, garage, weapons, properties, home, tools, jobs, story) + autosave
- [x] Interaction markers (light columns), minimap blips, GPS waypoints, phone menu (I / 📱)
- [x] 93 land vehicles in 15 classes (procedural, built on first use), dealerships, 63 parts per car + 20 paints, nitrous
- [x] 16 boats + 98 boat upgrades, 3 marinas with piers, buoyant boat physics
- [x] 11 aircraft (6 planes, 5 helicopters) + 17 upgrades, Redgrass Airfield (runway, hangar), arcade flight
- [x] Every building enterable: generated homes, apartments, offices, stores, bars, warehouses
- [x] 198 properties for sale (homes = save/sleep point, businesses pay daily), realtor listings
- [x] 243 tools in 8 trades (heal, armor, repair, flashlight, metal detector, calls, rods, bait, trade tools for jobs)
- [x] Hunting: 8 species with behaviour (graze/flee/charge), skinning, 3 trading posts
- [x] Fishing: cast/bite/reel-tension minigame, 4 water types, 23 species, fish market + log
- [x] 27 jobs with work vehicles, timers, pay per stop and levels
- [x] 63 story missions in 3 acts (original story: Eli Navarro vs. the Delacroix family, the Ríos crew and Capt. Voss)

## Phase 1.9 — Open-source 3D models instead of generated ones

- [x] Animals: Quaternius CC0 animated deer, stag, coyote, wild horse, longhorn cattle + Khronos fox (replaces generated animals)
- [x] Interiors furnished with Quaternius house-interior models + photoreal Khronos furniture (sofas, chairs, store fridges, lamps, plants)
- [x] Photoreal Khronos concept car (drivable, PC starter car), open-source fish and bow models
- [ ] Realistic open-source cars, boats, aircraft and modern guns: on Sketchfab / Poly Pizza / Poly Haven / itch.io,
      which this cloud environment's network policy blocks. Allow `polyhaven.com`, `api.polyhaven.com`,
      `dl.polyhaven.org`, `poly.pizza`, `static.poly.pizza`, `3dassets.dev`, `kenney.nl`, `quaternius.com`, `itch.io`
      (environment settings → Network access) and the generated vehicles/guns can be swapped the same way.

## Phase 1.10 — HUD, exact hitboxes, QA

- [x] HUD: vehicle damage silhouette + speed (bottom right), chase-only wanted stars, 10 s area card (name, time, wanted),
      minimap icons (homes, jobs, shops, animals as road signs, cops blue, attackers red, your car as a silhouette), free camera (C)
- [x] Exact hitboxes: shots test real triangles (skinned people/animals in pose, vehicles, trunks, rocks, poles, furniture) via BVH;
      vehicles collide with their exact oriented footprint (buildings, trees, poles, cars, player)
- [x] QA harness (`node tools/southbound/qa.mjs <preset> [--all-doors]`): 499 checks (925 with every door) pass on Phone and High
- [x] Polish: blurred reflection sky (no grain), photo-scanned interior walls/floors, rain ripples, streaky wet reflections

## Phase 2 — World depth

- [ ] Expand map to more of the continent's southern side (multiple states/regions)
- [ ] Streaming world chunks (needed before the map gets much bigger)
- [~] Every building gets an enterable interior (procedural generator done; hand-made key interiors to do)
- [ ] Pedestrians with daily routines
- [ ] Traffic lights, lane changes, police response
- [ ] Weather: rain, storms, fog, hurricanes
- [ ] Real asset pass (needs network allow-list: polyhaven.com, ambientcg.com, kenney.nl, quaternius.com, freesound.org)

## Phase 3 — Content catalogs (targets)

| Item | Target | Done |
|---|---|---|
| Assault rifles | 56 | 56 (variants of 4 platforms) |
| Shotguns | 13 | 13 (3 platforms) |
| Rocket launchers | 12 | 12 (2 platforms) |
| Bows | 19 | 19 (3 platforms) |
| Sniper rifles | 13 | 13 (2 platforms) |
| Marksman rifles | 45 | 45 (3 platforms) |
| Pistols | 63 | 63 (5 platforms) |
| Weapon attachments | 193+ | 195 (39 parts × 5 tiers) |
| Land vehicles | 93 | 93 (15 classes, derived from 15 body types) |
| Water vehicles | 16 | 16 |
| Air vehicles | 11 | 11 |
| Car upgrades (per car) | 63 | 63 (48 performance + 15 looks) |
| Boat upgrades | 98 | 98 (14 systems × 7 levels) |
| Plane upgrades | 17 | 17 |
| Buyable houses | 198 | 198 |
| Tools | 240 | 243 |
| Jobs | 27 | 27 |
| Story missions | 63 | 63 (first pass: objectives + short dialogue) |

## Phase 4 — Systems

- [~] Combat: shooting, aiming, 7 weapon classes done; cover and a vehicle damage model to do
- [~] Hunting: animals with AI and skinning done; tracking and trophies to do
- [x] Fishing: casting, fish species by water type, reel mini-game
- [x] Economy: money, shops, property ownership
- [x] Jobs system framework (27 jobs)
- [~] Mission scripting system + story (63 missions done; cutscenes, voice and hostile AI to do)
- [x] Garage / tuning UI
- [x] Save system

## Phase 5 — Ship

- [ ] Content rating: what's planned (blood/gore, strong language, drugs, tobacco)
      is a **17+ (App Store) / M (ESRB)** game, not "kid friendly". The content
      filters in Settings let players turn gore and language off.
- [ ] Wrap the web build for iOS/Android (Capacitor) and submit to the stores
- [ ] Apple developer account ($99/yr), store listing, privacy policy

---

## Known issues / next fixes

- Frame rates have only been measured in a software renderer (the cloud box has
  no GPU). Real phone and PC frame rates still need testing on actual devices.
- Cars can't be damaged yet. Collisions push and slow you down.
- Traffic has no traffic lights, so cars cross intersections without stopping
  for each other.
- Buildings are solid for now. The interior system is Phase 2.

## Session log

- **Graphics push (clouds, weather, cars, arsenal):** volumetric clouds, weather
  with wet roads, water reflections, procedural realistic cars replacing the
  Kenney kit, 221 weapons + 195 attachments with a store, installable web app.
  Not yet done: WebGPU renderer, interiors, missions, boats/planes, vehicle
  upgrades, real-device frame-rate measurements.

- **Session 1:** Phase 1 built. External asset sites are blocked by the cloud
  environment's network policy, so every texture, model and sound is made in code.
  Playtested in headless Chromium (software rendering): 12 location screenshots,
  a midway video and a final video. Fixes made during the playtest: overexposed
  sky lighting, window shimmer at a distance, the menu FPS dropdown clashing
  with the HUD, bayou ground colour, night sky colour, night lighting, and
  terrain poking through highways on climbs.
