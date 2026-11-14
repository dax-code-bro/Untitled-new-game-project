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

## Phase 1.11 — RDR-style play, living world

- [x] Daytime: stronger sun, less milky haze, bluer sky, punchier grade (phones too, via the tone-mapping curve)
- [x] Ground cover: continuous grass carpet on every preset (terrain-coloured blades, tall golden grass on the plains,
      lawns in town), wildflower patches, scattered stones, bush clusters and lone trees on the plains
- [x] Feet on the drawn ground: road surface, sidewalks and curbs, terrain triangles; smooth curb steps
- [x] Auto vault / mantle / climb up to 2.5 m (6'3" + arms) when there's a ledge and a clear top
- [x] Hands follow the animation's finger poses (no curled rest pose)
- [x] Weapon wheel (holster, sidearm, dual sidearms, rifle, shotgun, long range, bow, heavy), slow-mo while open
- [x] Holsters: sidearm on the hip, long gun slung on the back; aiming draws, H holsters
- [x] Real-world firearm models only, no sci-fi: Quaternius Survival pack (pistols, revolvers, shotguns) and
      Toon Shooter Game Kit (AK rifle, SMG, bolt-action snipers, pump shotgun, revolver grenade launcher), all CC0
- [x] Arm IK holds per weapon type (two-handed pistol, shouldered rifles/shotguns, low ready, port arms, dual wield);
      reloads per action (box mag, pump, bolt, revolver); idle inspects
- [x] Gun HUD: only minimap + health + grey weapon silhouette and ammo while a gun is out on foot
- [x] First person with sharper shadows and higher resolution
- [x] Hold-to-interact: greet / antagonize (4x: fight or call the cops; 2x on a cop: arrest)
- [x] Police heat: holstered arrest teams for minor crimes, guns drawn for felonies, shoot on sight for killings
      or if your gun is out, SWAT with rifles, tanks (Quaternius Tank pack) at the top
- [x] Surrender + arrest scene (cuffed, into the cruiser, days pass, fine from your bounty)
- [x] Bounty after escaping outside the city; hunters every 3 game days, bigger and better armed as you kill them;
      top tier brings a minigun gunship and the police; pay it off at the Central Precinct
- [x] Roadside walkers on country roads; stop and offer a ride for a tip
- [x] More pedestrians and traffic on every preset
- [x] No glowing ground markers; custom shops are drive-in workshops; car doors swing open when you get in
- [x] Loading screen with in-game art, tips and progress
- [x] Fewer touch buttons: ◎ interact replaces the car button; map, phone, arsenal, free cam moved to pause

## Phase 1.69 — G14 (part 1): the owner's picture, fields, city pavements

The owner: "why does our game not look like GTA six? ... do everything you can to make our game look like
GTA six". Watching them play showed what they actually see: the Low preset on built-in Intel graphics,
the game's own work ~25 ms a frame (CPU-bound), yet drawn at 60% resolution (1024x559 on a 1707x932
window). A screenshot survey at their settings and on High (street, downtown) picked the first fixes.
- [x] Sharper picture on CPU-bound machines: when the game's own work is what's slow, fewer pixels
      don't help, but the resolution controller still cut the picture to its minimum (and never raised
      it again while the frame rate stayed under the target). Now, CPU-bound, it draws less detail first
      and then tries the pixels back 10% at a time, keeping each step only if the frame rate holds
- [x] Fields and lawns aren't one even green near the camera: patches a few metres across, lusher or
      drier, with darker clover/weed clumps and slow drifts over tens of metres (terrain shader, free)
- [x] City pavements are furnished: benches, planters with clipped shrubs, rows of newspaper boxes and
      bike hoops in the strip inside the kerb, on both sides in turn, closer together downtown
      (instanced, near only: four draw calls; you walk round them)
- [x] Part 2: night streets read as night: the moon and the sky light a little dimmer, the street lamps'
      pools on the road half as strong again, so the asphalt between lamps goes dark and the lamps
      matter (it was an even grey, like dusk). The car customs garages were flat-painted boxes: their
      walls are now painted concrete block and the floor real concrete (the photo-scanned library,
      tiled at its real size)
- [x] Part 3: downtown has people and shop names. The survey shot of downtown on Low had empty pavements
      and blank grey sign bands. Now a crowd walks the city's pavements from about 15 m out to where the
      haze takes over (`world/crowd.js`): each walker is worked out on the graphics card (their block, a
      lane, a direction and pace; walking round the block, turning at the corners, legs and arms
      swinging, their own clothes, skin and hair; about half women, some in skirts, most with long hair;
      a few carrying a bag; a soft shadow), so the processor does nothing per walker per frame: two draw
      calls, a few numbers. Every few seconds only the walkers on the blocks round the camera who are out
      at that hour are handed to the card, so its work follows what can be seen. A walker every few
      metres downtown, a few a block at the city's edge; thinning out at night (nearly nobody at 3 am)
      and in the rain; they fade in and out with a dither; not drawn on Phone, indoors or away from the
      city. The real people (who you can talk to, rob, run over) stay the ones nearest you. And every shop bay's sign
      band carries its shop's name (32 made-up local businesses, each its own colours and lettering;
      an empty unit now and then), lit at night; one draw call for the whole city
- [x] Part 4: a lighter Low. The owner's recorded play (3,000 samples) showed ~43 FPS in the city with the
      game's own code only ~13 ms of each ~23 ms frame, 3 million triangles a frame, and a 60% resolution
      that hadn't helped: the built-in graphics were choking on geometry, not pixels. A triangle profile
      by object found three things drawn for nothing, all removed without changing the picture:
      the 3D grass rings were drawn (and masked away) all through the city, where none can grow (~640k
      triangles: now off when the camera is well inside it); the thousands of small facade pieces (sills,
      cornices, piers, trim) were drawn a second time for shadows all over the map on Low/Phone, where the
      coarse shadow map can't show them (~570k: now only the big ones, porch roofs, awnings, parapets,
      cast, through copies that write nothing to the picture); and the crowd now hands the card only the
      walkers in view (~330k → ~120k). Downtown 4.6M → 3.35M triangles a frame (-28%), the river and the
      fields 2.6M → 2.1M (-18%), the same draw calls. Headroom the resolution controller can spend on a
      sharper picture

## Phase 1.68 — A2 (parts 2 and 3): the rest of the instant things, acted out

The second and third groups from the survey of things that used to be instant (a toast, money, a teleport).
All of them go through `systems/acts.js`; each falls back to the old instant version if a scene can't
start (in a car, already in a scene, dead).

- [x] Job vehicles: the work van/truck is parked at the curb and you walk round to its door and get in
      (it used to teleport you into the seat). At a delivery door F is for the delivery (the house's own
      door and "say hello" to a passer-by step aside)
- [x] Hitchhikers walk round to the passenger door, it opens, they get in and you can see them in the seat;
      at the drop-off the door opens and they step out
- [x] Mission givers have a body: they wait at the start, turn to you, brief you face to face, then walk
      off; a mission's pay is handed to you (cash from their hand)
- [x] Sleeping: you sit on the edge of the bed, lie back, the screen goes dark through the hours. The fuel
      can: you tip it over the filler and pour. The doctor: you sit on the exam table, the screen goes
      dark while you're patched up
- [x] Bandaging someone else: down on one knee, wrapping their wound. A takedown: you step in behind
      them, an arm round them, and down they go
- [x] The hideout: a bowl from the kitchen eaten bite by bite, the ammo rack (a hand to each shelf),
      chores with the tool in your hands (the axe at the woodpile, the bucket, the hammer), Marisol
      patching you up while you sit
- [x] Buying a property: the papers signed against your hand, then the keys. The fire alarm: your hand
      up on the handle and down it comes. A demolition charge: both hands press it to the wall, then you
      step back
- [x] The ATM: your card in the slot, a few keys, then the screen. The Runr courier puts the parcel into
      your hands. The laundromat: the clothes into the machine, the lid down, half an hour in the dark.
      The basin: bent over it, scrubbing. Antagonizing someone: your finger in their face; they flinch
      or square up
- [x] The precinct: the desk sergeant takes the bounty money from your hand; your confiscated things come
      back across the desk in a box
- [x] Spare change: you crouch and put the bills in their hand. A car broken down by the road: round to
      the front, both hands in the engine bay, then the driver pays you from their hand. The robbery you
      broke up: the victim presses the cash into your hand
- [x] Boats and planes: you walk to the plane's side and climb up into it; you step down into a boat
- [x] A hold-up: the clerk fills a bag at the register and holds it out over the counter while you keep
      the gun on them. The street cart: the vendor hands it over the cart like a shop counter
- [x] Paying anyone in the hideout crew for a service: the cash goes from your hand to theirs
- [x] The phone: when you close it you're holding it, you glance at it and put it back in your pocket (the
      game is paused and not drawn while its screen is open, so that's the part you can see)
- [x] A fade to black for the phone's ride to the hideout (it used to cut)
- [x] Fixed on the way: holding up a store threw an error the moment the clerk complied (the panic call
      used a position clerks don't have); a scene that couldn't start ran its ending as well as the
      instant version (two nights' sleep, a bounty paid twice); the crew's bunkhouse hook dropped the
      sleep's "now" flag, so a night acted out started itself again for ever; F at a door could still go
      to a point the game had hidden a moment earlier (the list is rebuilt 4x a second; it's re-checked
      now); quitting a shift while walking to the work van left you walking to it

## Phase 1.67 — A2 (part 1): things are acted out, not toasted

The owner: "add animations for every little thing ... the cops never even touch you ... depending on what
crime you did they'll do it more aggressively ... you can't just go to an objective marker and be done ...
you knock on the door, give them the newspaper ... do that for every little thing in the game".
A survey listed ~80 interactions that were instant (a marker, money, a toast or a teleport); this batch
does the engine and the first big group. `systems/acts.js` (game.acts): little scenes that lock your
controls and play beats (walk, face, clip, IK arms, props in your hands, the other person in step).

- [x] Arrests in three kinds, by the worst crime this chase (police.heat) and how wanted you are:
      *cuff* (hands up, the officer comes round behind you, hands on your wrists, cuffs on, a hand on your
      arm to the cruiser, the door, a hand on your head, into the back); *hood* (marched to the cruiser,
      hands on the hood, patted down, cuffed against the car); *ground* (on your knees, hands on your head,
      a second officer covering you, shoved flat, a knee in your back, cuffed on the ground, hauled up by
      the arms, pushed into the car). The cruiser pulls up on the road beside you; the camera finds a side
      a wall or a parked car isn't in the way of; the arresting officer is no longer animated twice a frame
- [x] Deliveries at the door: parcels, pizza, envelopes and the new **Paper Route** (The Calvera Courier,
      7 houses around Mill Creek): stops are real front doors; you park, walk it up, knock (three knocks
      you hear), the door opens and the resident steps out, takes it from your hands, says something
      (pizza: pays you on the step), steps back in, the door shuts; nobody home: it goes on the mat.
      Walking into a delivery door no longer lets you in
- [x] Trades do the work at each stop on foot with their tool in their hands: road crew (shovel), mechanic
      and plumber (a wrench, kneeling), electrician (a screwdriver at the panel), construction and ranch
      (a hammer), landscaper (a trimmer), lumberjack (a chainsaw), garbage (the bin lifted and tipped),
      security (a flashlight, the other hand trying the door)
- [x] Riders: a taxi fare waits at the curb, walks to the passenger door, opens it and gets in, and at the
      drop-off gets out and walks off; bus riders get off and on at every shelter; a hurt patient gets up
      off the curb and climbs into the ambulance, and out at the hospital
- [x] Carjacking: the car stops, you yank the driver's door open and drag the driver out by the collar;
      they stumble and run. Getting out of a car: you step out of the door's swing, turn and push it shut
- [x] Pulled over for speeding: the officer walks up to your window, has a word, hands the ticket in
      through it and you take it; they walk back to the cruiser. Hot-wiring: your hands under the dash
- [x] Money changes hands: bribing an officer (they take it, or look at it and then at you), paying a
      witness to keep quiet, getting mugged (hands up, the wallet held out, snatched), and at every
      shop counter (you pay, the clerk hands you a bag; eat-in food comes over the counter and you eat it)
- [x] Eating bite by bite (the food gets smaller), patching yourself up (a knee for a leg, round the arm,
      against your side), skinning a kill on your knees with a knife, crouching to pick up a dropped gun,
      a wave when you say hello, a fishing rod held in both hands with a real cast (back over the shoulder,
      the bobber flies out) and the reel turned as you reel in, knocking on a locked door, kicking one in
      (three kicks, the third bursts it), the hideout crew talking with their hands when you talk to them

## Phase 1.66 — From watching the owner play: smooth roads, suspension, the big map

- [x] Fixed (owner: "road is very bumpy"): a road is a chain of 8 m pieces, each a slab round its centre
      line, and the ground under a car took the HIGHEST piece in reach; near every joint that was the
      neighbouring piece's end height, so every sloping road was a staircase (a flat step, then a drop).
      The surface is now the nearest piece's. Driving the highway the owner came down: hard jolts
      413 → 0 in 40 s, lane points on the asphalt 66% → 99%
- [x] Fixed: where a road is cut into a slope, the coarse terrain mesh (a vertex every 10.7 m on Low)
      reached across the road from the bank and rose through the asphalt (up to 0.67 m on that highway);
      past a road's edge the ground now climbs only as a gentle 8% bank for 22 m
- [x] Suspension: the car body rides on springs (about 1.5 Hz, 12 cm each way); the wheels stay on the
      ground and the camera rides with the body, so a kink in the ground is a soft dip, not a jolt
- [x] Fixed (owner: "map does not work"): the full map and the big banner shared one name in the HUD, so
      M (and the pause menu's and phone's map buttons) toggled the banner; the map opens again

## Phase 1.65 — From watching the owner play: door hands, ammo by caliber, a shader fix

- [x] Doors (owner: "add animation for opening doors"): walk into a building's door and you line up,
      reach for the handle as it swings in, and step through; on the way out you reach for the handle
      inside, step out, and it swings shut behind you; running into one is a shoulder into it (car
      doors already had the walk-round, reach and open)
- [x] Ammunition by caliber (owner: "every weapon shows what ammo it takes; different calibers you can
      buy; max 500 of each, rockets 50, arrows 20"): 13 calibers (9mm, .357 Magnum, .38 Special,
      4.6×30mm, 5.56 NATO, 7.62 NATO, 12 gauge, .308, .338 Lapua, .30-30, 84mm rockets, 40mm grenades,
      arrows); every gun keeps its own magazine and shares its caliber's spares with the other guns that
      take it; carry at most 500 of a caliber, 50 rockets or grenades, 20 arrows; boxes by caliber at the
      gun store counter ("I need ammunition") and on each gun's page; old saves' per-gun spares join
      their caliber
- [x] What it takes, everywhere: the gun store (list and page: "Takes 5.56 NATO · you carry 120/500"),
      the weapon wheel, the phone's Weapons tab, and U any time: a card with the gun, what it takes,
      what's loaded, what you carry (with a bar), damage, range, where to buy more
- [x] Fixed (seen live): every sprite with fog (gun smoke, cigarette smoke, muzzle flashes) failed to
      compile its shader and logged an error each time: the fog's world position now comes from the
      view-space position every shader has
- [x] Fixed (found by QA): people caught under a collapsing building got NaN positions (the blast had no
      origin)

## Phase 1.64 — F16: destruction and rebuilding

The owner: "everything has realistic destruction physics, and people come out to repair it; blow up a
skyscraper and over seven game days the city realistically rebuilds it." (systems/destruction.js;
houses and small shops keep demolition.js: they burn and go back up in a day and a half)
- [x] Every bigger building (offices, towers, apartment blocks, warehouses) has a structure that can
      take so much, by its size (a 90 m tower ~3,000): explosions hurt it, most at the base (a rocket
      up near the top does a third as much); a blast scorches that wall, leaves a fire in that floor
      and throws glass into the street; a weakened building groans and drops dust
- [x] Demolition charges (hardware store, $650): plant one on any wall with F, it blinks, ten
      seconds later it goes off (a real explosion: people, cars, props) and takes a big bite out of the
      structure; on a house it starts the fire
- [x] The collapse: the storeys give way from the bottom one after another and the rest drops onto
      them, leaning as it falls (8-9 s for a 90 m tower); chunks of concrete and glass fly out and
      bounce (600 pieces, one draw call); a dust cloud rolls out down the streets and settles; the
      ground shakes and rumbles; anyone and any car underneath is crushed, the player hurt; people
      for blocks run; the buildings next to it take damage (a house next door can catch fire); the
      police come for whoever did it (3-4 stars); it makes the news
- [x] What's left: a smoking pile of broken concrete with beams sticking out, behind concrete
      barriers and police tape; you can climb on it
- [x] The rebuild, by size (a tower the full 7 game days, a warehouse ~2): the rubble cleared, the pit
      dug and the slab poured behind a site fence, a tower crane assembled at the corner, the concrete
      frame rising floor by floor (slab, core and columns) under a mesh safety sleeve, the walls going
      on a few floors behind, the crane turning with a load on the hook and climbing ahead of the
      frame, then taken down; the building is back. Crews in hard hats work days. It's saved with
      the game and carries on while you sleep
- [x] QA: blast damage at the base vs the top, a planted charge, the collapse, the phases, the
      rebuild finishing

## Phase 1.63 — F15: real workplaces and careers

The owner: "for the barbershop there's no building; you should go in, talk to the manager, buy something
or work as a trainee and work your way up, and manage going to work so you don't get fired. Same for
the bike messenger and every job." (systems/workplaces.js)
- [x] An employer for every one of the 27 jobs and both barbershops: a company with a named manager
      (dispatcher, foreman, captain, watch sergeant...). 15 work out of a real building you walk into
      (a sign over the door; estate.js `claim` gives a building its own kind, hours, room size,
      furniture and people); country employers have a site office (a trailer with a sign, placed off
      the road); the hospital, fire station and precinct managers wait outside
- [x] Offices inside: the manager's desk with the company sign behind it, a punch clock and card rack,
      a roster board that shows your shifts this week, lockers, a bench, a water cooler, and the
      company's own things (tyres, parcels, pizza boxes, a stretcher, coats and helmets, hard hats
      and cones)
- [x] The job board is the manager: ask for a job (you start at the bottom of that trade's ladder:
      Trainee, Probie, Cadet, EMT trainee, Apprentice, Deckhand, Hand, Trainee pilot...), clock in, pick
      up an extra shift, check your schedule, hand in your notice; a trial shift right after hiring
- [x] Schedules: three shifts a week at set times, texted when you're hired, on the roster and the
      phone; a text two hours before, the GPS set half an hour before
- [x] Clock in up to 15 minutes late; later is a warning. A no-show is a warning (two in a row and
      you're out). Walking off a shift or wrecking the company vehicle is a warning. Three warnings:
      fired, and they won't talk to you for a week. Four good shifts in a row take a warning off.
      Call in sick from the phone before a shift: once a week is fine, more is a warning (unless
      you're really hurt)
- [x] Promotions: enough good shifts at a rank with a clean record and you move up (pay up to
      1.9x); the top rank adds a daily salary. Pilots need a licence to get past trainee
- [x] The manager notices how you turn up: covered in blood ("go clean up"), wanted by the police
      ("not today"; a police officer is suspended), a gun out, filthy, dead on your feet
- [x] The barbershops are real shops: three red barber chairs facing mirrors, a counter of tonics,
      combs in blue disinfectant and clippers, a shampoo sink, towels, a waiting bench with magazines,
      a price list, a checkered floor, the till; the manager at the till, a barber cutting a seated
      customer, people waiting; the pole moved out front, the name over the door. Mill Creek's barber
      works out of a house
- [x] Buy a cut or a shave, or products: pomade and aftershave (a sharp look tips better for days),
      beard oil, a grooming kit (trim yourself at home or the hideout)
- [x] Work there: a trainee sweeps up hair, shampoos at the sink, folds towels and makes change at the
      till (get it wrong and it comes out of your pay); a barber cuts what the customer asks for (pick
      the right cut from four; the wrong one is an angry customer and on the house), tips by rating;
      walking out mid-shift is a warning. At the top, buy the shop: daily takings, work the chair
      and keep it all
- [x] The courier depot: pigeonholes of envelopes, bikes, bags on hooks, the day's runs on a
      whiteboard; punch in, grab a bag, run envelopes between real office doors downtown (pick up at
      one address, deliver to the next)
- [x] The phone: a Work tab (each job, rank, next shift, warnings, progress to the next rank, call in
      sick, GPS); the Jobs tab names the company and your rank
- [x] QA: hiring, schedule, on time, walking off, late, fired on the third warning, two no-shows,
      promotion and pay, blood at the door, calling in sick, a full barbershop trainee shift, the
      wrong cut, walking out (747 → ~790 checks)

## Phase 1.62 — G13: blood and injuries

The owner: "there's no actual blood in the game; people should get realistic bruises, injuries".
- [x] Wounds on bodies where they're actually hit (entities/woundfx.js): a bullet hole with the stain
      spreading (4 to ~13 cm over 40 s) and blood running down the body while they bleed; a cut; a
      bruise (skin only, purple going green-yellow as it heals); a scrape (cars, falls); a burn
      (blasts); a bullet a vest stops leaves a bruise. Blood in cloth is a dark wet stain, on skin red
- [x] No extra draw calls: a person's skin/clothes/shoes materials are copied the first time they're
      hurt, with up to 8 wounds as uniforms in the bind pose (they stay on the same patch of skin as
      the body moves); the copies are freed with the person
- [x] Blood in the world (world/blood.js, 4 draw calls): spatter thrown behind someone shot (on the
      ground, and on a wall right behind), pools spreading under the dead and the badly hurt, drip
      trails behind the bleeding (people and you), smears where a car hit someone; fresh blood wet and
      dark red, drying darker over minutes, thinned by rain
- [x] The player: wounds on the side a shot came from (fists bruise, knives cut), a drip trail while
      bleeding, healing over game days (bullet 6, cut 3, bruise 4, scrape 3, burn 8)
- [x] Settings > Content > "Blood & gore" off: none of it
- [x] Found while testing it: a body shot against a building fell into the wall (ragdolls only knew
      the ground). Ragdolls now stop at walls (entities/ragdoll.js RAGDOLL_WALLS, collision.resolve);
      pools sit under the hips, darker and with firm edges
- [x] QA: wound where hit, spatter, own materials, bruise, spreading stain, a killing shot's wound and
      pool, the player's wound and healing, gore off, materials freed

## Phase 1.61 — Live feed: Claude watches along, and chat (Y)

The owner: a live feed "no matter what it takes", so Claude can watch them play, spot errors and
physical glitches, keep them company, and take their comments and ideas as they play.
- [x] The game (watching on) posts an update every 2 s: position, height above the ground, which way
      the player and the camera face, on foot or in what and how fast, the car's tilt, health, police,
      money, weapon, who's near, frame rate, the game's messages; and a 480 px picture every 5 s
- [x] api/sb-live.js: no storage needed (the warm function's memory; every request reached the same
      instance in a 20-update test on the live site); a copy goes to the function log
- [x] Y (or /) opens a box to message Claude; Claude's replies show at the top of the screen and are
      sent again until the game has shown them
- [x] tools/southbound/live.mjs: waits in a lobby (a secret only Claude has; its hash in the API) until
      the owner starts, follows the feed, saves pictures, and prints a line for each thing worth a look
      (messages, errors, deaths, police, vehicles, places, below/above the ground, a car on its roof or
      side, crashes, sudden jumps, frame-rate drops, a summary every 90 s), for Monitor to wake Claude
- [x] live-test.mjs: all local, end to end (updates, pictures, a note shown, a Y message received, the
      lobby, a body under the ground caught)

## Phase 1.60 — R1: reactions that fit the situation, and people take cover

From watching the owner play: a mugger robbed them while they were speeding away in a car (he walked
to where they'd got in, "reached" them and took the wallet six seconds later); and nobody took cover
in a robbery. The owner wants a reaction ready for every combination of what the player is doing.
- [x] `game.situation()` (systems/situation.js): one answer to "what is the player doing": where (the
      car if in one), on foot or driving and how fast, indoors, cutscene/arrest, down, armed, wanted,
      mission; `reachable` (someone on foot can walk up: on foot and not running, or a stopped car) and
      `muggable` (outdoors, on foot, unarmed, not wanted, standing or walking)
- [x] Muggers: only pick someone `muggable`; walk to where you really are; follow if you step back
      (the clock waits); give up if you drive off, go inside, a scene starts or you're 40 m away
      ("Damn it!"), now and then with a parting shot at the car; the wallet goes only if you're still
      within reach (on foot, or at the window of a stopped car: "Window down. Wallet. Now.")
- [x] Bystanders take cover: the far side of a parked car, a wall's corner or a tree (the police cover
      finder), run there bent low, crouch and peek until it's over, then walk away from it; about 30% of
      a crowd at gunfire, 60% when a gun is pointed (muggings, robberies, store hold-ups, shoot-outs)
- [x] A robbery in the street brings the nearest officer on foot (95 m): runs to cover with the robber
      in sight, "Police! Drop the weapon!"; the robber gives up (cuffed and taken away), runs, or shoots
      it out (both from cover; people around get down)
- [x] Store hold-ups: customers and passers-by get down; a victim only tips you if you were there
- [x] Reports to Claude: the server log puts the timeline first and the samples on their own line
- [x] QA: the owner's exact case (demand, get in, floor it: money kept), the situation flags, cover,
      the officer answering a robbery

## Phase 1.59 — "Let Claude watch me play" (errors, play reports, notes from Claude)

The owner: "I want you to be able to see the latest error I hit, and also watch me play", so Claude can
comment now and then, have a reference for what went wrong, and spot and fix things that look off.
- [x] Settings > Display > "Let Claude watch me play" (or `?watch=1` once); off by default, so other
      players send nothing; test browsers never send
- [x] Errors sent straight away (uncaught errors, failed promises, console errors such as a person's AI
      failing) with the stack, what you were doing, the last 30 game messages and a picture of the moment
- [x] Every ~3 minutes of play: samples every 10 s (place, on foot/which car and speed, wanted level,
      health, armour, money, weapon, mission, hour, weather, frame rate, CPU ms, draw calls), the
      timeline (messages, getting in/out, places, police, deaths, frame-rate drops) and a 640 px screenshot;
      sooner (45 s) after a death or a police chase
- [x] The error box: "Claude has been sent this error" when watching, else a "Send to Claude" button
- [x] Notes from Claude show up in the game as a card at the top ("Claude: ...")
- [x] Server: `api/sb-watch.js` (private Vercel Blob store when connected; the function log, ~1 hour,
      until then). Reader: `tools/southbound/watch.mjs` (list / new / show / say)
- [x] The screenshot is copied right after the frame is drawn and encoded off the main thread
      (createImageBitmap + convertToBlob), so it never holds up a frame; tested by
      `tools/southbound/watch-test.mjs`
- [x] Fix (the owner couldn't click it on the PC): menus always get the mouse back (a capture that
      lands after the pause is released at once; no capture while a menu is up); the whole row of an
      on/off setting flips it
- [ ] Needs the owner: a private Blob store connected to the project (Claude's Vercel access can't
      create one: 403)

## Phase 1.58a — Crash fix: hitchhikers dropped off in town

The owner hit "Something went wrong" (TypeError reading '0' in the pedestrian AI). A roadside walker
given a ride and dropped off (or left when you got out) went back to ordinary street life with no
block or street corner to walk to, so the pedestrian AI read the target of nothing every frame.
- [x] `peds.home(p)`: anyone handed back to street life without a block/corner gets the nearest one
      (the drop-off does it, and the pedestrian AI checks before walking or fleeing)
- [x] Each person's AI is isolated: one that throws is logged once, put back on the street, and let go
      after three failures, instead of stopping the frame and setting off the error dialog
- [x] QA test reproduces the dropped-off passenger, a person fleeing with no home block, and a
      person whose AI throws

## Phase 1.58 — Every car and every gun its own design (the owner's option B, built in code)

The owner: most items were "slightly different versions of other models"; asked for more free models
(option B). Sketchfab, where realistic CC0/CC-BY cars and guns live, was blocked by the environment's
network policy; a personal environment allowing it was set up, but the API token entered three times
was rejected ("Invalid API token"), so downloads never worked. The owner then said "do whatever gets
me there": the variety is built in code instead.
- [x] Cars: 93 catalogue vehicles were ~13 base bodies scaled; traffic and parked cars only ever used
      those 13 (the catalogue models had traffic weight 0). Every catalogue model now has its own
      design (catalog.js DESIGNS): city hatch, hot hatch, 3-door, microcar, mini crossover, retro bubble,
      kammback, compact sedan; family, long luxury, 4-door coupe, boxy 80s, rounded 90s, budget, limousine,
      sports sedan, aero hybrid, 60s land yacht, notchback, 70s fastback; estate, shooting brake, lifted
      wagon, hearse; grand tourer, vinyl-roof coupe, soft top, personal luxury, hatch coupe, targa;
      seven muscle cars; mid-engine, roadster, 80s wedge, 60s curvy, rally hatch, GT, track car; six
      supercars; ten SUVs (body-on-frame, crossover, full-size, compact, coupe-SUV, luxury, classic
      off-roader, 3-row, mini, utility); regular/extended/crew/compact/heavy-duty/lifted/classic two-tone/
      flatbed pickups; minivan, panel van, high-roof, passenger van, camper; box truck, step van, flatbed
      truck, food truck; city bus and a school bus with a bonnet; three off-roaders
- [x] New body features (carbuilder.js): boxy vs rounded edges, bonnet power dome and scoop, pinched
      waist, wheel-arch flares with black cladding, roof rails and crossbars, tailgate spare wheel, bull
      bar, running boards, vinyl and fabric roofs, chrome bumpers, two-tone paint, grille height, factory
      spoilers, flatbeds, extended cabs, upright truck fronts; lamp styles (rect, slim LED, round, tall,
      wide; light bars at the back)
- [x] All of them in traffic and parked on the streets (weights by class: supercars rare)
- [x] Built in the background a few ms a frame (a car takes 100-350 ms to mesh), so a new design never
      stalls a frame; traffic picks only designs already built (vehicle.js warmCars)
- [x] Guns (entities/gunkit.js): 233 catalogue guns were drawn with 23 models. Now the first one or two
      guns of the platforms with a photo-scanned model keep it, and every other gun is built as its own
      firearm from side-profile parts: polymer striker pistols, 1911-pattern pistols, revolvers (barrel
      lengths, underlugs, fluting, grips), AR-pattern and AK-pattern rifles, battle rifles (carry handle or
      cocking tube), bullpups, submachine guns (tube, boxy polymer, mag-in-grip), pump/semi-auto/double
      (side-by-side, over-under, sawed-off) shotguns, bolt rifles (wood, synthetic, chassis, .50 heavy),
      lever-actions, full-stocked semi-auto rifles, disposable and reloadable launcher tubes, break-open
      and six-shot grenade launchers; each gun's own lengths, stocks, grips, handguards, magazines,
      sights and finish. They use the same hold points, so holding, aiming, reloads and fittings work
- [ ] Not done: downloaded photo-real cars/guns (needs a valid Sketchfab API token in the
      "Untitled-new-game-project" environment's network secrets); procedural guns are simpler than the
      photo-scanned ones up close

## Phase 1.57 — Performance: distance detail, fewer draw calls, connection-aware loading (O1-O5)

The owner (on a 5090): lag and freezes; asked for quality that drops with distance, a lower render
when needed, and loading that suits the Wi-Fi. A profile on High found the game's own code cheap
(~3 ms a frame) and the drawing heavy: 2,000-3,650 draw calls a frame (in a browser every draw call
costs CPU time, however fast the card), plus whole-scene walks that caused regular stalls.
- [x] `core/detail.js`, distance detail: far cars lose pedals, brake parts and other small pieces,
      then wipers, discs and badges, then anything under a metre (tyres stay); their insides go once
      the glass hides them; small parts stop casting shadows at ~55 m and the body at ~120 m (the
      contact patch underneath stays). People cast shadows within ~45 m. Camps and settlements built
      of many pieces lose small pieces at ~120 m, shadows at ~90 m, everything at ~650 m. Lights and
      glows are never thinned. Distances scale with the preset. Done with camera layer 0, so it never
      fights the game's own showing and hiding; hits don't use layers
- [x] Adaptive quality knows where the time goes: GPU-bound, it lowers the render resolution as
      before; CPU-bound, it shortens the detail distances instead (down to 45%), since a blurrier
      picture wouldn't help; both come back when there's headroom
- [x] The AO pass no longer walks the whole scene every frame looking for see-through materials
      and draws them twice more (~570 draw calls and five 28k-object walks a frame)
- [x] Whole-scene walks spread over frames: the model LOD sweep (5-13 ms every 1.5 s), the wear
      scanner (5-20 ms every 2.5 s); the water mirror's hide-list is found every 2 s, not every frame;
      the light capture tags its layer every 4th capture and no closer than 1.5 s apart while driving
- [x] Townsfolk step out one per frame (three at once was a 10-15 ms stall)
- [x] Result on High: Mill Creek 3,650 -> ~1,000 draw calls, downtown 1,780 -> ~730; worst stall in
      the profile 43 ms -> 27 ms (and the one-off 5.4 s stall in the first capture gone from the
      sample); the QA suite runs ~20% faster
- [x] `core/net.js`, connection-aware loading: the game's own download time (and the browser's
      hints) picks a tier. Slow (< ~6 Mbit/s, data saver, 2G/3G): starts without the subtlest texture
      maps (AO, height, metal) and with fewer townsfolk models, then downloads them in the background
      for next time. Fast: once you've played 20 s, the 208 models fetched on first use (shops' guns,
      animals, furniture) are downloaded ahead, two at a time, low priority. `?net=slow|medium|fast`
      forces a tier. (Once loaded the game uses no network: the connection can't cause in-game lag)
- [x] FPS readout (Settings > Show FPS): resolution %, detail %, far parts and shadows thinned out,
      connection tier
- [ ] Not done: merging each far car into one mesh (would cut cars to ~5 draw calls each), GPU
      instancing of people, a true occlusion pass (buildings hiding what's behind them)

## Phase 1.56 — Lived-in streets, grounded buildings, contact shadows, mist (graphics milestone G12)

The owner: layered PBR and lighting, environmental clutter ("remove the empty, clean look"), foliage
and ground blending where roads and buildings meet the ground, and post-processing (grading,
volumetric fog, contact shadows under cars and buildings).
- [x] Contact shadows on every preset: a soft dark patch under every car (hidden when it's in the
      air), a dark band on the ground along the foot of every building (`world/contact.js`), and the
      bottom of every wall darkened where it meets the ground (facade shader)
- [x] Ambient occlusion on Medium too (half resolution), a little stronger on High and up
- [x] Street clutter (`world/streetclutter.js`): stop signs on every approach to every junction in
      the city, Mill Creek and the outer neighbourhoods, green street-name blades on one corner
      (Main St, Pecan St, Magnolia St..., the city's numbered streets and avenues), manhole covers,
      storm-drain grates with kerb inlets, litter (paper, newspaper, cans, cups, cigarette butts,
      leaves, wrappers, bags: thick downtown, light in town, often in little piles against the kerb),
      oil drips and old spills on the lanes and pavements, weeds in the kerb cracks and at the foot
      of walls and fence posts, hydrants and corner bins in Mill Creek
- [x] Parked cars along Mill Creek's streets too, never across a driveway
- [x] Ground blending (`world/shoulders.js`): gravel-and-dirt shoulders along the highways and outer
      lanes using the photo-scanned Gravel004 and Dirt01 sets (colour, normal, roughness, AO) in
      layers, with a ragged cut-out edge into the grass; a band of bare soil and gravel round the
      foot of houses, sheds and barns standing on open ground
- [x] Mown lawns get short 3D grass blades (they were a flat texture) where the 3D grass is on
- [x] Saw palmetto clumps (the low fan palms of Gulf pinewoods, dunes and ditches), three shapes,
      built from the cabbage palm's frond code
- [x] Ground mist: a second, shallow fog layer lying in the low places (coast, bayou, river, lake),
      thickest round sunrise, lighter at dusk and through the night, heavier in damp weather

## Phase 1.55 — Every tool its own model

The owner: "most of the items were just different colors or slightly different versions of other
models, and the tools don't look unique at all". An audit found 244 tools drawn with only 124
different shapes (twelve products, from bandages to a caulk gun, were the same bottle; the jigsaw
was drawn as a fishing lure; the branding iron as a shovel).
- [x] `entities/toolunique.js`: 120 tools get a model of their own, so all 244 are now different
      shapes (checked by an automated geometry audit)
- [x] Rods: spinning (open-face reel under the rod, bail, big first guide), baitcast (low-profile
      reel on top, trigger grip), fly (large-arbor reel at the butt, snake guides), surf (3.4 m,
      long two-hand grip, big reel), deep-sea (short and heavy, roller guides, trolling reel,
      gimbal butt); Basic / Pro / Elite each their own blank, grip, reel seat and fittings
- [x] The rest: scent dropper and spray, filler tin with spreader, aerosol, sunscreen tube, caulk
      gun, bandage roll, pill bottle, gel tube, drink can, gauze pouch, auto-injector, tackle box
      with trays, gun cleaning case, rolling repair case, belt and tensioner, nested mess kit,
      cantilever toolbox, lures by type, multimeter with probes, oscilloscope, scanner, CB radio
      with mic, crank weather radio, knives by blade shape, IFAK, SAM splint, tourniquet, tile
      cutter, rebar bender, lockpick wallet, bait cup / aerated bucket / minnow bucket / cricket
      tube, grease gun, brake bleeder, timing light, paint gun, nail gun, ghillie strands, plate
      carriers by level, dome tent, hub blind, welder, two different phones...
- [ ] Cars (93 from ~11 base bodies) and guns (233 on 20 base models) are still variants of a
      smaller set of shapes: needs new models (see FEATURES backlog)

## Phase 1.54 — The crew defends the hill; police fight from cover

- [x] Lead armed enemies (raiders, a mission's gunmen, a rival crew, armed civilians, or the police
      once they're shooting) up to the hideout and the Gulf Line fights them off
      (`systems/defense.js`): up to eight of the crew pull their own guns (Rico's revolver, Big O's
      and Wrench's shotguns, Tina's and Smoke's rifles, Jayden's marksman rifle...), turn on the
      nearest threat and fire, with hit chances from distance and each member's shooting skill;
      the cook, medic, hacker and pilot get down
- [x] Gunmen shoot at whoever's closer, you or a crew member in the open; a crew member hit badly
      goes down wounded (never dies) and Marisol patches them up after; guns away when it's quiet
- [x] Raids no longer send the crew to hide in the bunkhouse: everyone stands and fights
- [x] Police in a gunfight get behind something solid (`entities/police.js`): their stopped cruiser
      or another car (using its real length and width), a tree trunk, a building's corner. They
      duck down or stay hidden, peek out (stand up over a car, step out round a corner), fire a
      shot or two, and duck back. They keep a spot until the fight moves, give up on one they can't
      reach, don't crowd a colleague's, and with nothing near they kneel and pop up to fire

## Phase 1.53 — Saves that make sense, $50,000 to start, your car back from the dealer

- [x] Save only when you're safe (`systems/saves.js`): F5 or the pause menu's "Save game". Not while
      wanted, with enemies within 120 m, within 20 s of being hurt or 15 s of a gunfight, indoors,
      swimming or in a moving car; it says exactly why not
- [x] The autosave still keeps money, guns and progress, but the place you come back to only moves
      while you're safe, so a save never drops you back into a fight
- [x] Loading puts you within 20 m of where you saved (open ground: no building, road or water),
      already doing something: smoking a cigarette (smoke on the exhale), drinking a coffee, or
      cleaning your gun with a rag. A close camera looks on; moving hands control back
- [x] New games start with $50,000 (enough for a car and a gun); older saves topped up once
- [x] Dealerships have a "Your cars" tab: any car you own, wherever it is (or lost, towed, sunk), is
      brought round to the lot with its parts and paint, free

## Phase 1.52 — Holding guns, first and third person, and a looser run

The owner: first person is the main fix; holding guns and the run looked wrong ("too robotic, the
shoulders come back way too far").
- [x] First person, not aiming: rifles and shotguns carried at the hip in the lower right of the
      view, pistols at a low ready in the bottom of the view (before, nothing was in sight)
- [x] Optics you can see through: open tubes with clear glass and proper eye relief (a red dot
      is a slim ring with the dot in it; it was a solid black disc filling the screen)
- [x] First-person pistol aim out at arm's length, as far as both hands can reach the grip
- [x] Reloads and weapon checks stay in view in first person
- [x] Third person: drawn pistols held at a two-handed low ready in front of the belly, muzzle down
      (the idle clip held the gun up beside the face); NPCs with pistols too
- [x] The run: the shoulders and upper arms are drawn toward their average pose every frame, so the
      swing is smaller and the shoulders no longer yank back on each stride (jog and sprint, everyone)

## Phase 1.51 — Is the game on the graphics card?

The owner has an RTX 5090, but the game crawled: the readout said "Intel(R) Graphics". Windows and
the browser had put the game on the processor's built-in graphics and left the card idle.
- [x] The start screen says so the moment a gaming card is picked from the list (or WebGPU can see
      one) while the browser is on built-in graphics, with the steps to fix it: Windows graphics
      settings, Chrome / Edge's "Force High-Performance GPU", NVIDIA Control Panel, a laptop's GPU
      mode and charger, the monitor cable on a desktop, how to check (chrome://gpu)
- [x] In the game, the same as a panel that stays until it's read (it used to be a 12-second toast)
- [x] The FPS readout says "(built-in graphics)" after the name when that's what it's drawing on
- The Windows desktop app already forces the graphics card (`force_high_performance_gpu`)

## Phase 1.50 — Lived-in streets and the coast (graphics milestone G11)

The owner: "it still does not look like GTA 6". A survey of street, downtown, beach and night
shots found the biggest gaps that can be closed in a browser: empty yards and streets, a grey,
low-contrast picture, and a coast with brown sand and pines on the beach.
- [x] Front yards for every house that faces a street (`world/yards.js`, 104 houses): a concrete
      walk from the porch steps, a driveway down one side (62 with a real, stealable car parked in
      it: `systems/kerbside.js`), an oil stain where the car stands, a mailbox at the kerb, wheelie
      bins against the side wall, a white picket fence or a clipped hedge along the front (or an
      open lawn), shrubs along the foundation and in front of the porch, an AC unit on a pad,
      a lantern by the door that lights at dusk, rocking chairs on some porches, basketball hoops,
      hose reels, a kid's bike left on the lawn. Driveways and walks follow the slope of the lot
- [x] Utility poles down Mill Creek's streets, with a service wire from a pole to each house
- [x] Cabbage palms (`world/palms.js`, built from scratch): the native palm of the Gulf Coast, in
      clumps on the dunes, along the Coast Highway, in the city parks and on the waterfront. Leaning
      trunks with the criss-cross of old leaf bases, fan-shaped fronds that sway in the breeze,
      a skirt of dead fronds; light comes through the leaves
- [x] Gulf beaches are pale quartz sand, and no trees stand out on the beach itself
- [x] A photograph's contrast in clear daylight: deeper, cleaner shadows and richer colour instead
      of a grey wash (on every preset; softer under cloud and at night)

## Phase 1.49 — The warm, golden look (graphics milestone G10, part two)

The owner found what was missing: "that slightly orange, yellow, nostalgic, sunset, warm and cozy
lighting". The look was too neutral, and the golden hour lasted minutes.
- [x] A warm film colour all day: lifted, warm blacks; amber highlights over faintly cool shadows
- [x] A real golden hour: the sun stays gold for about two hours after sunrise and before sunset,
      and even at noon it's a warm white (`world/sky.js`)
- [x] Round sunrise and sunset an amber glow lands on whatever the sun lights, while the shadows
      stay cooler. It's warm light, not a sepia filter
- [x] Warm light bouncing up off sunlit earth and dry grass; the haze turns amber toward a low sun
- [x] The same look on every preset: the post-processing grade (Medium and up) and the tone curve
      inside every material (Low and Phone, which have no post-processing)
- [x] Settings > Graphics > "Warm golden look" (on by default; off for neutral colour)

## Phase 1.48 — The Gulf Coast as it really looks (graphics milestone G10)

Aimed at a photo the owner took: a gravel county road on a humid, cloudy evening, live oaks,
mown lawns, houses on big lots, a dusty car on the verge.
- [x] Soft cloudy light: a sun behind thin cloud spreads instead of just dimming. Shadows fade
      and soften, the sky lights everything evenly (`world/sky.js`)
- [x] Humid Gulf haze: things a few hundred metres off pale and blue, more early and late in the
      day and under cloud (aerial perspective)
- [x] A photograph's colour, not a game's: the grade is close to neutral in sun and soft and muted
      under cloud, on every preset (the Low/Phone tone curve too)
- [x] Live oaks: the Gulf Coast's tree, wide and low on a short, thick trunk under a dense, dark
      crown. A share of the broadleaf trees outside the woods became live oaks, and Mill Creek's
      front yards got big shade oaks (`world/vegetation.js`)
- [x] Gravel county roads: the lanes round the far edge of the outskirts are crushed white
      limestone. Every stone its own size and shade close up, two packed tyre tracks, loose rock on
      the crown, dirt and grass creeping in from the verges, darker when wet (`world/roads.js`)
- [x] The terrain round those lanes is dirt and dry grass, not pavement (`world/heightmap.js`)
- [x] Dust comes up off the gravel (G9's dust knows the county roads)
- [x] Fixed: a whole frame could go black on Medium and up. One bad pixel value (a NaN) anywhere
      on screen was blurred by the post-processing into every pixel. Every material now hands the
      post chain a clean value (`main.js`)

## Phase 1.47 — Armour and medical, batch one (feature batch F14)

Staying alive (`src/systems/medical.js`, with hooks in `armory.js` and `main.js`):
- [x] Wounds left undressed for half a day get infected: a fever that tires you, shakes your aim
      and slowly drains your health; dressings, gauze, an IFAK or a trauma bag keep a wound clean
- [x] Antibiotics from the hospital pharmacy, taken from the phone; a course clears the infection
- [x] Painkillers warn you as they wear off; three in a few hours and you're woozy (a shaky aim,
      the colours swim), a fourth makes you sick
- [x] A plate that stops a round still knocks the wind out of you: no sprinting, a shaky aim
- [x] Helmets wear out and crack (and get replaced at the armour stores); a round your helmet
      stops still rings your head
- [x] The weight of a plate carrier slows your sprint, and it's hot work at midday
- [x] Hard crashes hurt, and can concuss you: blurred, swimming vision and an unsteady aim
- [x] Losing blood greys and darkens the world as your health runs low
- [x] Falls hurt; a long one can break a leg (a splint, an IFAK or a doctor fixes it)
- [x] Cottonmouths in Bayou Verde, mostly at dusk and after dark: a bite that needs antivenom
      at the hospital (an IFAK or trauma bag slows the venom)
- [x] Animal bites can get infected, and want rabies shots within three days
- [x] Healing on your own: fed and rested you slowly come back to three-quarters; a night's
      sleep or a long rest heals more
- [x] Doctors at the Port Calvera Medical Center and the Mill Creek Clinic: treatment billed by
      what's wrong (stitches, a broken leg, antivenom, rabies shots...), and a pharmacy
- [x] A first-aid cabinet at the hideout: two fresh bandages a day
- [x] Healed wounds leave scars
- [x] The phone's Health tab: wounds, infection, venom, concussion, antibiotics, armour and
      helmet condition, and your medical record (times shot, plates that saved you, scars,
      hospital visits, snakebites, falls)
- [x] Dust devils made thicker and taller (G9 follow-up)

## Phase 1.46 — Dust (graphics milestone G9)

What dry ground gives up when something moves over it (`src/systems/dust.js`):
- [x] Cars and trucks off the pavement (dirt, sand, the forest floor, dry grass) throw a rolling
      cloud off the back wheels that hangs, spreads and drifts off with the wind; more at speed,
      a lot more when you slide it
- [x] Traffic and police cars do it too, so a car on a dirt track shows from a long way off
- [x] Running feet kick up small puffs on dry soil and sand; so do galloping mustangs and deer
- [x] A plane's prop blast on a dry strip; a helicopter's downwash blows a ring of dust out
      from under it
- [x] Dust devils: on hot, clear afternoons a whirl of dust wanders across open dry ground
- [x] Rain lays the dust: none off wet ground, and it comes back as things dry out
- [x] Coloured by the ground it came off (pale sand, tan soil, grey-brown forest floor); lit by
      the sun and sky (dark at night), glowing when you look through it towards a low sun
- [x] Drawn as one instanced pool of soft puffs that face whatever camera draws them (in the
      shader), sized by the quality preset

## Phase 1.45 — Clothes and the barber, batch one (feature batch F13)

Clothes that get lived in (`src/systems/grooming.js`, the mud and blood drawn in
`src/entities/clothing.js`):
- [x] Mud: walking and running on dirt, sand, grass and through the woods dirties your shoes and
      trouser legs first, then works up; drawn on the clothes from the ground up
- [x] Rain on soft ground makes it worse; a good rain on pavement rinses a little off
- [x] Going down (ragdolling) in the dirt is worse than walking in it
- [x] Blood: getting hurt bloodies your shirt, in patches
- [x] Suds Laundromats in Port Calvera and Mill Creek: $8 and half an hour, like new
- [x] The basin at the hideout: wash up for free
- [x] Anything you change into is clean
- [x] A change of clothes as a disguise: change while the police can't see you and they lose a
      star (once every five minutes, up to three stars)
- [x] Saved outfits: five slots in the phone (Outfits tab), worn at the hideout, indoors or in a
      clothing store
- [x] The phone tells you what state your clothes are in (clean, muddy, filthy, bloodstained)
- [x] People notice: strangers comment on the mud, the blood or a wild beard
- [x] An officer who sees you covered in blood stops you to ask whose it is
- [x] A jacket in the midday heat tires you out faster
- [x] Saturday sale: 20% off at every clothing store

At the barber (`src/systems/details.js`):
- [x] Beard styles: full, goatee, moustache, stubble, clean
- [x] Hair styles: short, buzz (stubble on the scalp), slicked back (darker, glossy), shaved
- [x] Hair dye: black, brown, grey, blond, red (or back to natural)
- [x] Each change is a new option in the barber's chair, with its price
- [x] Washes and haircuts counted in your stats
- [x] Facial hair painted on the face instead of the old see-through shells: stubble that fills
      in to a beard over a week, in the shape you chose; dye recolours your own hair and brows

## Phase 1.44 — Flying, batch one (feature batch F12)

In the aircraft (`src/entities/craft.js`):
- [x] Fuel: it burns with the power you use; run dry and the engine stops (glide a plane in,
      autorotate a helicopter down)
- [x] Stalls: too slow in the air and the wing quits; the nose drops
- [x] Landing gear (G) and flaps (J): the gear up is faster but a belly landing wrecks the plane;
      flaps let you fly slower and land shorter
- [x] The wind carries you (the real wind, the one the windsock and the hunters' arrow show) and
      storms throw you about
- [x] Touchdowns measured: how hard you hit and what on

At the controls and at the field (`src/systems/aviation.js`):
- [x] A flight panel: airspeed in knots, height in feet, heading, climb rate, fuel, gear, flaps
- [x] Warnings: STALL, PULL UP, LOW FUEL, ENGINE OUT
- [x] Damage you can see: a smoking engine when it's hurt, an engine that can quit when it's bad
- [x] Landings rated: butter, smooth, firm, hard, belly
- [x] The radio at Redgrass: cleared for departure (with the wind), in the pattern, welcome back
- [x] Runway edge and threshold lights after dark; a windsock that shows the real wind
- [x] Nav lights (red, green) and a white strobe on every aircraft near you at night
- [x] Refuelling: stop on the fuel pad at Redgrass, or by a marina pier in a seaplane
- [x] Flight school at Redgrass: take-off, the circuit and landing, with medals, and a pilot's
      licence at the end (the flying jobs pay 15% more)
- [x] Low flying over Port Calvera is against the law: under about 250 ft for long and the
      police have your tail number
- [x] Flight time, highest altitude and landings in your stats

## Phase 1.43 — Story missions, batch one (feature batch F11)

- [x] Medals (`src/systems/missionsplus.js`): gold, silver or bronze for every mission, from three
      things: inside the par time (worked out from the mission's own steps), little damage taken,
      and no police on you that the mission didn't ask for. Each is +10% pay; your best is kept
- [x] Checkpoints: fail partway and press F within 15 seconds to retry from the step you were on
      (from the theft, if it was the delivery that went wrong), not from the top
- [x] Hints: fail the same mission twice and you get a tip for the step that's beating you
- [x] Failing for a reason: you died, you were arrested, the mission vehicle was wrecked
- [x] Contacts text you when their next mission is ready, trust you more with every job (more
      for gold), and have their own words when you finish
- [x] Act title cards when a new act starts, the papers notice, and an ending card
- [x] The phone's Story tab: medals and trust on every mission, GPS to the next one, replay any
      finished mission for a better medal (a quarter of the pay), abandon the job you're on
- [x] Gold medal milestones: 5, 15 and 30 golds pay out
- [x] Twelve side jobs from people around Calvera (a yellow ? on the map), opening up as the story
      goes on: a lost retriever in Pinewood Hollow, a drifting skiff, a wedding run, a crawfish
      boil, a gator in the motel pool, a repo job, a storm chaser, night fishing, a record
      collector, moving day, air mail and closing time at the Rusty Anchor

## Phase 1.42 — The Gulf Line crew, batch one (feature batch F10)

Crew (`src/systems/crew.js`, on the crew's own menu at the hideout):
- [x] Loyalty for each of the fourteen, and moods (happy, content, grumbling, angry, nervous,
      hurting, out on a job, locked up) that come from how you treat them and what's going on
- [x] Four skills each (driving, shooting, stealth, smarts), different for every member, that
      grow with the work they do
- [x] A Crew tab: everyone's mood, loyalty, skills and jobs done
- [x] Payday every three days (their cut, by head); skip it and they grumble, then loyalty drops
- [x] Gifts (once a day each), and a favour each per week from what you carry (fish, scrap metal,
      game meat, a pelt, a loan they pay back with interest)
- [x] Birthdays: Rico texts you the morning of, and a present means more that day
- [x] The gang's respect: Unknown, Known, Respected, Feared, Legend, from jobs, raids and
      running rivals off their turf; it unlocks the bigger upgrades and makes the paper
- [x] Crew who stay unhappy too long take off for a couple of days

Crew jobs (a Jobs tab):
- [x] Five jobs to send people on: a smuggling run, the chop shop, a card game, collecting
      debts, a fishing charter. The best free person for it goes; they're gone for hours of game
      time and their skills, loyalty and the heat decide how it goes
- [x] Their cut goes into the hideout stash and they text you how it went (cards can lose)
- [x] Injuries (hurt crew rest, sitting, for a day) and arrests: bail them out from the crew menu,
      or they sit three days and come home sour
- [x] Gang heat: every job raises it, it cools a little each day, and high heat means more arrests

The hideout:
- [x] Rico's morning briefing: a tip a day (where the white buck was seen, which turf is soft,
      where the police are doubling up)
- [x] Talk round the fire at night: the crew rib each other
- [x] They greet you when you get back, notice when you're hurt (Marisol) or have the police on
      you (Jayden)
- [x] A day and a night: some are out on errands in the afternoon; at night most sleep, while
      Big O and Jayden keep watch and Marisol stays on call
- [x] Three chores a day (chop firewood, haul water, mend the fence): a few dollars and the crew
      notices
- [x] Eight upgrades you can see: bunkhouse beds (wake fully rested and healed), an outdoor
      kitchen (a free meal a day), a police radio, floodlights, a gate and fence, an armory rack
      (restock every gun once a day), a watchtower and a garage bay (half-price repairs)
- [x] A cash stash: money there is safe from muggers, arrests and hospital bills

Rivals:
- [x] Gangs you've run off their turf come for the hideout at night while you're there: four of
      them up the road, the crew takes cover, and beating them off earns respect
- [x] While you're away they can hit the stash (unless the gate's built; floodlights halve it)
- [x] A Turf tab (the three gangs, how often you've hit them) and truces: a week's peace for
      $1,500, and their turf warns you instead of shooting

## Phase 1.41 — Real grass blades (no more crossed cards)

- [x] The meadow and plains grass round you is now real strands (`src/world/grasscards.js`), not
      painted cards stood up in crosses (from above those read as flat stars). Every tuft is a
      bunch of individual blades rooted over a small patch, each tapering to a point and leaning
      and curling its own way, with a darker root, a pale midrib, darker edges, bleached tips on
      some, a few dead straw blades and the odd seed stalk
- [x] Three rings round the camera, all blades: thin and packed tight close up (5-13 mm), then
      wider blades further apart, out to the edge of the grass, so the ground stays covered at
      every distance. More blades per tuft on the higher presets
- [x] Everything the cards did still works: the wind, parting round you and your vehicle, the
      ground's own grass colour, straw on the dry plains, the lawn and path masks, light through
      the blades from behind

## Phase 1.40 — People and cars in the rain (graphics milestone G8)

- [x] Soaked through (`src/entities/bodyshade.js`): out in the rain everyone gets wetter over a
      minute or so: clothes go darker and lose their sheen, hair darker and glossy, skin glistens.
      They dry over a few minutes when it stops (faster indoors)
- [x] Tyre spray: cars on wet roads throw spray up behind their back wheels, more the faster they go
- [x] Footsteps splash on wet ground

## Phase 1.39 — Food and the Gulf Marts, batch one (feature batch F9)

- [x] Fresh food goes off (`src/systems/foodplus.js`): a po'boy, étouffée, gumbo, catfish or boudin
      carried for more than a day is "going off", and eating it can make you sick: you lose health,
      can't heal for a while and feel it
- [x] Coffee and energy drinks wake you up a bit (they help with tiredness, not only your aim)
- [x] A loyalty card: every tenth Gulf Mart purchase is on the house
- [x] Today's special: one thing on the menu each day at 40% off

## Phase 1.38 — Property, batch one (feature batch F8)

- [x] Rent (`src/systems/propertyplus.js`): houses, apartments and penthouses you own but don't live
      in are let out, and the rent comes in every day
- [x] Tax and upkeep every day, paid from the bank if there's money in it (else from your pocket);
      the county texts you the day's account
- [x] The market moves: each kind of property drifts up and down a little every day (pulled back
      towards normal); the realtor shows what yours are worth today
- [x] Sell anything you own (not your home) at today's value, less the agent's 6%
- [x] Burglaries: now and then someone breaks into one of your places while you're away, and you
      lose something; it makes the paper
- [x] Upgrades for each place you own: a security alarm (the police come, nothing's taken), solar
      panels (two thirds off the upkeep), a renovation (+15% value and rent)

## Phase 1.37 — Light in the air at night (graphics milestone G7)

- [x] Lamp light (`src/world/beams.js`): after dark a soft cone of lit air hangs under each street
      lamp near you; thick where you look across it, fading at its edges and towards the ground
- [x] Headlight beams: two beams ahead of every car near you (yours, the traffic's), a touch
      down; police cars with their lights on throw red and blue
- [x] Haze: the cones are faint on a clear night and stand out in fog, mist and rain
- [x] Cheap enough to leave on: only the nearest lamps (re-picked twice a second) and cars near you,
      nothing indoors or in daylight, off on the Phone preset

## Phase 1.36 — Jobs, batch one (feature batch F7)

- [x] Every shift is rated (`src/systems/jobs.js`): knocks and crashes in the work vehicle cost
      stars, and riders (taxi, bus, ambulance, charter, air tours, medevac) complain out loud
- [x] Tips: riders tip for a smooth ride, by the stars; pizza tips for pizza that's still hot (and
      none when it's gone cold)
- [x] The night shift (10 pm to 6 am) pays a quarter more
- [x] Ranks in every job: Trainee, Regular, Senior, Lead, Veteran (on the job board and the phone)
- [x] Wreck the work vehicle and you're fired, for the rest of the day
- [x] Dispatch texts you the shift's rating; five great shifts in one job and you're employee of the
      month (+$500, and it makes the paper)
- [x] Work vehicles come with a full tank; the phone's Jobs tab shows rank, shifts, total earned
      and the last rating

## Phase 1.35 — Tracks in the ground (graphics milestone G6)

- [x] Prints (`src/world/tracks.js`, `src/systems/prints.js`): boot prints behind you and the people
      walking near you, cloven hooves behind deer, cattle and horses, paw prints behind coyotes and
      foxes, and tyre tracks from every wheel of your car or truck off the road
- [x] Only in soft ground (sand, dirt, grass, forest litter), deepest in sand and wet ground; each is
      pressed in along the slope, with a normal map so its rim catches the light
- [x] They fade over a few minutes, faster in the rain, so a fresh trail is a fresh trail: follow a
      deer's prints to where it went, or your own back

## Phase 1.34 — The phone, batch two (feature batch F6)

- [x] Battery (`src/systems/phoneplus.js`): it runs down, faster with the screen or the light on,
      and charges in any vehicle or indoors. Flat, the phone won't open. Shown under the phone button
- [x] The phone's own light: no flashlight? L turns on the phone's (dimmer, and it eats the battery)
- [x] Bank: cash on you is what a mugger, an arrest or the hospital takes a cut of. An ATM stands
      outside every Gulf Mart: deposit and withdraw there, check the balance anywhere. A little
      interest every day (the bank texts you)
- [x] News: the Calvera Courier writes up robberies, killings, gunfire and poaching (some of it
      yours) and the local goings-on, a new paper every day
- [x] Messages: texts from people you've met, the bank, and anyone else with something to say;
      unread ones show by the battery
- [x] Contacts: talk to someone (F) and they give you their number. Call them and they tell you
      where they are and what they're doing (by their day), or don't pick up if they're asleep
- [x] Weather: what it's doing now and what's coming, and when. The weather itself now builds and
      clears a step at a time (clear, cloudy, overcast, rain, storm): no storm out of a blue sky
- [x] Camera: take a photo of what you see, without the HUD, saved as a PNG
- [x] Cab: a ride to any place in the Places list ($4 + $2.60 a mile). Wait for it, fade out,
      get dropped off; the clock moves on by the length of the ride. Not with the police after you

## Phase 1.33 — Hunting and fishing, batch one (feature batch F5)

- [x] The wind and your scent (`src/systems/hunting.js`): animals downwind of you smell you from much
      further off; upwind you can get close. A small wind readout (and arrow) shows near game
- [x] Walking softly: slow on foot and they hear you at half the distance; running, from further
- [x] When they're about: deer and bucks at dawn and dusk, coyotes and foxes at night
- [x] Wounded animals: hit but not killed, they run, slow as they weaken, and bleed out within a
      minute or so, leaving a blood trail on the ground you can follow (`src/systems/wilds.js`)
- [x] Pelt quality: one clean shot from the right calibre is perfect (★★★); more holes, or far too
      big a gun, and the buyer pays less. Shown when you skin it and in the price
- [x] Meat: a deer or buck gives you meat. Sell it at a trading post or have a plate cooked there
      (it fills you up)
- [x] Legendary animals: the Pale Buck in Pinewood Hollow, Old Scar in the Sierra Norte and Ember in
      Bayou Verde. One of each, rarely about (likelier at their hour), bigger, warier and worth
      hundreds. The trading posts' Rumours tab says where to look
- [x] A hunting licence ($40 at any trading post). Without one, or killing a horse or a cow, is
      poaching: a crime if anybody sees it
- [x] Crows find a carcass left lying and circle over it, lifting off when you come close
- [x] Ducks: rafts of them paddling on the lake, the rivers and the bayou; they burst off the water at
      a shot, when you walk up, or when a boat comes through
- [x] Fishing: bites come quicker at first and last light and in the rain, slower in the midday heat
      or a storm, and quicker the more you've caught
- [x] Size limits: anything under the limit goes back (it's still in your log)
- [x] Records: beat your best for a species and it says so
- [x] Legendary fish: Old Mossback (lake), the Ferryman (river), Gator Jaw (bayou), the Silver King
      (sea). Rare, on a good rod, and they fight
- [x] The line sags between rod and water and comes tight as you reel; the rod bows under the strain;
      a hooked fish runs left and right and comes in as you win
- [x] Fresh fish: a catch more than two days old fetches half at the market

## Phase 1.32 — Water up close (graphics milestone G5)

- [x] Wakes (`src/world/wakes.js`, `src/systems/splashes.js`): your boat drops a disturbance every
      tenth of a second; the water shader turns each into a spreading ring and churned white water,
      and together they draw the V of a real wake with a foaming trail behind the stern
- [x] Bow spray off the hull at speed; a big splash when a car drives into the water and a bow wave
      as it ploughs on; a helicopter low over water flattens a ring and blows spray
- [x] Wading: you, people and animals walking through water leave rings
- [x] Bullets stop at the water's surface and splash there (not on the bottom), with a ring
- [x] Rain falling on lakes, rivers and the sea: rings everywhere
- [x] Fish rising: a quiet ring now and then on calm water near you (more at dawn and dusk); the
      bobber plops in, twitches on a bite and stirs the water while a fish fights
- [x] Sunlight through the thin top of a wave (and a wake's crests) when you look toward the sun
- [x] Caustics: a bright web of focused sunlight drifting over the bed of shallow water
- [x] The wet line: the bank just above the water is dark and shiny, and on the coast it creeps up
      and back with the swash

## Phase 1.31 — Police, batch two (feature batch F4)

- [x] The police helicopter (`src/systems/policeplus.js`): from three stars a Calvera PD Air Unit
      comes up and hangs over where they think you are; it can see you from the air out in the open
      (helping the cars find you), and after dark it lights you up with a searchlight that sweeps
      round where you were when it loses you. It goes home when the stars drop
- [x] Roadblocks: at three stars and up, driving, a roadblock goes up on the road ahead of you — two
      cruisers across it, officers behind them, and a stinger. Drive over the stinger and the tyres
      are shredded: slow, the car pulls and shimmies, until a garage repair
- [x] Bribes: at one star, with an officer about to cuff you, offer him money (F). Some take it and
      look the other way; some don't, and that's another star
- [x] The radio: you only hear the police radio when they're close, or anywhere if you've bought a
      police scanner

## Phase 1.30 — Street life, batch one (feature batch F3)

- [x] Pigeons (`src/systems/ambient.js`): little flocks pecking about on the downtown pavements; they
      burst up and away when you run at them, a car goes by close or a shot's fired, and settle again
      somewhere else half a minute later
- [x] Umbrellas: when it rains most people out walking put one up (and drop it when they run)
- [x] Joggers in the early morning and the evening
- [x] People stood about on their phones
- [x] Food carts on four downtown corners: a vendor, a cart with its awning, the Gulf Mart menu a
      little cheaper

## Phase 1.29 — Weapons, batch one (feature batch F2)

- [x] Guns wear (`src/systems/gunwork.js`): a little with every shot, cheap guns faster, more in the
      wet. A worn gun can jam — a dead click and "Jammed"; reload (R) clears it. Your guns' wear is saved
- [x] A gun-cleaning kit (hardware store, Hunting): stand still with a worn gun and press F; a few
      seconds crouched over it and it's like new
- [x] Takedowns: fists up or a blade out, come up behind someone who hasn't seen you and press F.
      Fists knock them out cold (they drop, lie there half a minute, come round and run); a blade is
      silent and final. Anyone who sees it calls it in
- [x] A suppressed shot is only heard close by: it scares and alerts people within ~10 m, not 45
- [x] Police cruisers drive the roads to you (shortest route over the street grid and highways)
      instead of steering straight at you through buildings, and a cruiser that isn't getting any
      closer backs up and tries again

## Phase 1.28 — Driving, batch one (feature batch F1)

- [x] Fuel (`src/systems/driving.js`): every car has a tank that drains with the throttle and speed
      (a full tank is ~25 minutes of hard driving); a gauge under the speedometer; run dry and the
      engine coughs and dies. Fill up at any Gulf Mart (pull in, F), or pour in the fuel can
- [x] Skid marks: brake hard, drift or pull the handbrake and the tyres leave black marks on the road
      that stay (the last 700 strips)
- [x] The horn: people in front of the car jump out of the way, and some tell you what they think
- [x] Stealing a parked car: you hot-wire it before it starts (quicker with a lockpick set); one in
      three has an alarm that whoops and flashes the lights, and someone calls it in
- [x] Speeding: a patrol car that clocks you well over the limit (35 in town, 55 on country roads,
      70 on the highway) lights up and pulls you over. Stop and you get a ticket ($50 + $5 a mph
      over); keep going and you're wanted

## Phase 1.27 — Paint, dirt and rain on the cars (graphics milestone G4)

- [x] Metallic paint has flake under the clear coat: tiny mirrors at random angles that sparkle in the
      sun up close, while the clear coat over them stays glass-smooth
- [x] Cars get dirty: road film and dust from the sills up and mud thrown up behind the wheels, the
      bonnet and roof only once it's really filthy; dust when it's dry, dark mud when it's wet. It
      builds as you drive (fast off-road, slowly on asphalt), rain rinses the road film off, and
      cars out in the world start with some of their own
- [x] Dusty glass, except the two arcs the wipers sweep on the windscreen
- [x] Rain stands in beads on the glass and the paint
- [x] A car wash at Calvera Customs ($15)

## Phase 1.26 — Loose ends from the list (side batch S4)

- [x] Police cruisers no longer drive through traffic, parked cars, each other or yours; a traffic car
      a cruiser hits stops where it is
- [x] Doors you can see: walk in and a real door swings open on its hinge into a dark doorway before
      you step through; run in and it bangs back off its stop; it swings shut behind you when you
      come out
- [x] Showrooms at the hunting post (every animal in the wildlife guide, and whose pelts you're
      selling) and the fish market (your catch on the counter)
- [x] Shops and bars with a clerk behind the counter inside (one of the residents who works there,
      by name, when their shift's on) — and they can be held up like any store; bartenders keep
      something under the bar more often. The police are told even if you've already left
- [x] People react in their own ways: most run, some drop and cover their heads, some freeze for a
      moment, some get their phone out and call it in (and the police hear about it), then run
- [x] Point a gun at someone and their hands go up, and stay up while the gun's on them; lower it and
      they bolt. Armed ones may draw on you instead

## Phase 1.25 — The people of Calvera, and police who have to find you (side batch S3)

- [x] About 3,000 residents (`src/systems/residents.js`), each with a name, an age, a home (houses
      hold a family, apartment blocks dozens), a job and its hours (office, store, warehouse, bar,
      or out on the road; some retired, some out of work), 3-8 friends (neighbours and workmates
      mostly) and a favourite bar
- [x] Everyone has a day: asleep, up, the commute, work, lunch out some days, home; evenings out at
      the bar or round at a friend's, a walk after dinner; weekends their own. Where each of them is
      at any moment follows from that, across the whole map, for almost nothing (~1 ms for all 3,000)
- [x] Near you, the ones whose day has them outdoors are real people on the street
      (`src/systems/population.js`): walking where they're actually going, block by block along the
      sidewalks, and in through their own front door; a crowd smoking outside a bar at night
- [x] Friends who run into each other stop and talk; walk up to anyone and say hello (F): a name, a
      job and a line about their day
- [x] Kill a resident and they're gone for good (saved). Twenty minutes later someone new moves into
      their home
- [x] Police have to find you: they track you only while they can see you (line of sight) or hear
      you (gunfire), otherwise they drive to where you were last seen and search round it, widening
      the search the longer you're gone; the stars cool off while they can't see you
- [x] A gun out in front of them gets an order first ("Drop the weapon!") and a few seconds to obey
- [x] In a gunfight one officer of each car takes cover behind it while the other works round your
      side; a beat before they fire when they find you again
- [x] Radio chatter: shots fired, officer hit, officer down, robbery in progress, lost visual, eyes on
      the suspect

## Phase 1.24 — Light through the leaves (graphics milestone G3)

- [x] With the sun behind a tree its leaves glow: the light comes through them, yellowed, brightest
      looking towards the sun; outer leaves glow and inner ones stay in their shade (the sun's shadow
      map decides which)
- [x] Canopies are darker inside: every leaf knows how deep in the crown and how low it sits
      (baked per vertex when the trees load), and gets that much less sky and bounce light
- [x] No two trees quite the same green, and clumps of leaves vary within a tree (greener,
      yellower, lighter, darker)
- [x] Far trees (impostors) glow against a low sun too
- [x] Off on Phone; the lighter mid-distance trees get all of it

## Phase 1.23 — Doors, hold-ups and showrooms (side batch S2)

- [x] No more "press F to open the door": walk into a door and you open it and go in
- [x] Run into a door and you shoulder it open; whoever's working inside tells you to chill out
      ("Whoa, whoa! Chill out, man!", "You break it, you buy it, buddy."), a homeowner less politely
- [x] A locked door rattles when you walk into it, and gives way after two to four running hits
      (homes, shops, warehouses get sturdier) — a break-in, same as kicking it; F still knocks
- [x] Rob a store (`src/systems/robbery.js`): hold a gun on the clerk at a Gulf Mart, a clothing store
      or a gun shop. Most put their hands up and empty the register into your hands; let the gun drop
      first and they hit the panic button. Some come up from under the counter with a shotgun and
      fight (a gun-shop owner nearly always; more often out in the country and late at night). Either
      way the police are told (two stars); the till is empty until tomorrow, and a dead clerk is
      replaced the next day
- [x] Every store is a showroom like the gun store: the list on the left, the thing itself turning
      on a stand on the right (drag to turn it), its details and the buy button under it
      (`src/ui/shop.js`, `src/ui/viewer.js`): cars at the dealers, your own car wearing the paint or
      part you're looking at in the custom shop, boats and aircraft, the real building as an
      architect's model at the realtor, and food at the Gulf Mart
- [x] 3D models for all 240 tools and the crafting supplies (`src/entities/toolmodels.js`): rods,
      lures, knives, pliers, power tools, ladders, kits, gadgets, garden tools, mowers...

## Phase 1.22 — People up close (graphics milestone G2)

- [x] Skin (`src/entities/bodyshade.js`): light goes into it and comes out a little way off, red
      furthest, so the line between light and shadow on a face is soft and warm, not a hard grey edge
- [x] With the sun behind someone, the outline of the face and the ear rims glow red
- [x] Skin's shine is two layers (a tight oily one over a broad soft one) instead of plastic
- [x] Pores and the skin's fine grain within arm's length, fading out once a pixel is too big to
      show them (no shimmer or sandpaper further off)
- [x] Hair: a strand highlight across it (two lobes, the second coloured by the hair), and light
      through its edges against the sun
- [x] Eyes: wet, and set back in the head instead of glowing with skylight
- [x] Clothes: cotton and wool catch the light at grazing angles (a soft sheen on folds and edges)
- [x] Works for every person, recoloured gang members and SWAT, and the player's outfits; off on Phone,
      pores off on Low
- [x] Fix: the hit info never reached the ragdoll (the wound system dropped it), so every death got the
      same small shove; now a car throws the body, a head shot snaps it back. Guns were also dropped
      twice on death

## Phase 1.21 — Bodies fall for real (side batch S1)

- [x] Ragdolls (`src/entities/ragdoll.js`): when someone dies, physics takes over from the animation.
      Fifteen joints with stiff bones and a braced torso fall under gravity onto the real ground,
      slide and settle; the skeleton follows, so the character's own body crumples. No two deaths
      look the same
- [x] The push goes in where they were struck: a head shot snaps the head back, a leg shot takes the
      legs out, a blast throws everyone outward, a car scoops the legs and throws the body
- [x] Hits someone survives: the part that was hit jerks away (head, shoulder, knee), and a body shot
      can double them over
- [x] Run people over: a car above ~30 km/h throws and kills; slower knocks them down and back; at a
      crawl it only pushes them aside. Parked and moving cars all count
- [x] Your car no longer drives through police cars; a hard hit shoves a parked car and slews it round
- [x] No more cash floating over the dead (`src/systems/loot.js`). Walk up and search the body: you
      crouch over it and take what's there. Officers drop their sidearm (SWAT their rifle) and may
      have a little cash; a civilian with a gun out drops it, and a hidden gun or knife is found on
      him; anyone else may have some cash, and very rarely a pistol. A dropped gun lies on the ground
      to be picked up
- [x] You go limp too when you're killed on foot, and get up again at the hospital

## Phase 1.20 — Cloud shadows (graphics milestone G1)

- [x] The clouds' shadows slide over the land, streets, roofs, trees, cars and people with the wind
      (`src/core/cloudshadow.js`): every lit surface follows the sun ray up through the cloud layer
      and reads the same cloud field the sky draws; sunlight dims, skylight stays
- [x] The sky's clouds are anchored to the world (they pass overhead as you travel), so the shadows
      are cast by the clouds you see; the cloud cube takes the viewer's position once per round of
      faces (no seams) and redraws at once after a teleport
- [x] Grass translucency and far tree impostors darken under a cloud too; weaker with a low sun or
      overcast; off on Phone

## Phase 1.19 — Lighter frames: KTX2 textures and levels of detail

- [x] Wheels in three levels (they were ~20k triangles each, most of a street's triangles); a fourth,
      coarsest car-body shell past 95 m
- [x] Terrain tiles in three levels (index buffers over the same vertices; the skirts hide the seams)
- [x] Near 3D trees in two levels (meshoptimizer trunk/branches, thinned and grown leaf cards)
- [x] People, the concept car, guns and heavy open-library models: simplified versions made at load
      (`src/core/lod.js`), swapped by size on screen
- [x] Parking meters, hydrants and street junk: only the nearby ones are drawn (`src/core/nearinst.js`)
- [x] KTX2 for the people, the concept car, the guns and the trees (`tools/southbound/pack-ktx2.mjs`):
      ~260 MB of texture memory down to ~65 MB; the Unity exporter decodes KTX2
- [x] Triangles a frame on High: forest 17.9M -> 8.6M, meadow 7.9M -> 4.2M, street 8.8M -> 5.5M,
      downtown 4.1M -> 3.2M

## Phase 1.18 — Light, wear and footing (all-out attention to detail)

- [x] Dynamic lighting (`src/core/gi.js`, Medium and up): the surroundings (ground, buildings,
      roads, water, sky, trees) are captured round the camera into a small cube, one face a frame,
      and filtered into the reflections and ambient light, so paint, glass and metal reflect the
      real street and the ambient takes the colour of where you are; recaptured on a timer and
      straight away when you've moved; the ground's colour bounces up; after dark the nearest
      street lamps are real lights, your car has a pair of headlights, gunfire lights the street
- [x] Micro-surface imperfection on every stock PBR material (`src/core/imperfect.js`): patchy
      roughness, hairline scratches in the highlights, dust on top faces, a faint orange-peel up
      close; far pixels cost one noise lookup
- [x] Substrate scanner (`src/core/substrate.js`): one table, one `scan()` for any hit, object,
      material or patch of ground (tags, then names, then the surface's own physics, then the
      terrain's layers); drives bullet penetration and holes, impact debris (sparks, splinters,
      shards, grit, dirt, splashes, chips in the thing's own paint), footsteps, grip and wear.
      Press N to see what it reads under the crosshair and underfoot
- [x] Material-agnostic abrasion (`src/core/abrasion.js`): each mesh's real edges found once (in a
      Web Worker), convex and concave, as exact distances; one shader wears each substrate its own
      way (painted metal chips to steel with rust in the joints, wood pales, paint rubs through to
      timber, plastic whitens, stone chips, glass frosts, fabric fades, leather polishes, rubber greys)
- [x] Footsteps synthesized from each substrate's sound (strike, ring, knock, crunch, softness, wet)
- [x] Contextual locomotion safety (`src/systems/footing.js`): stop at ledges and cliff edges
      unless sprinting or jumping (slide along them instead); slopes limited by grip (dry rock vs
      wet grass), slipping back off what's too steep, a careful pace down steep ground; slick
      surfaces take acceleration and sprint away; wading slows with depth; narrow footing up high
      is walked
- [x] Hardware check: `probeGPU()` asks WebGPU for the high-performance adapter and warns when the
      browser is on built-in graphics while a faster card idles; shown on the menu and in the FPS
      readout
- [x] `ARCHITECTURE.md`: WebGPU, GI, abrasion, KTX2/LOD streaming, workers + SharedArrayBuffer,
      with what's done, what's next, and code

## Phase 1.17 — Grass

- [x] The thin-blade carpet (flat green ribbons, ground showing between them) is gone
- [x] New grass (`src/world/grasscards.js`): blades painted at load time (~240 per card: thin,
      tapered, curving, varied muted greens, lighter midribs, darker edges, bleached tips, dry
      blades, the odd seed head) on clumps of three crossed, splayed cards; a tight near ring and
      a wider far ring; crisp edges at any distance; wind and parting round the player
- [x] Only in the wild parts: meadows (in big soft fields) and all over the dry plains; never on
      mown lawns, the city, pavement, sand, forest floor or steep rock
- [x] No ground between blades: the terrain under the grass is darkened to its shaded depths,
      and towards the edge the grass takes the scanned ground's colour, so there's no line
- [x] Straw-gold on the plains; Settings › "3D grass" turns it off (photo-scanned ground only)

## Phase 1.16 — Frame rate

- [x] Rocks: every boulder on the map (~2,800 scans at ~1,500 triangles) was drawn every frame and
      again into the shadow map; now only the ones near the camera are drawn, and the pebbles
      round the player are low-poly (22M -> 8.8M triangles a frame downtown on High)
- [x] The water mirror (a second render of the whole scene) ran almost everywhere: its "near
      water" test was true anywhere under 60 m altitude; now only within sight of the lake/Gulf
- [x] Cars past a few hundred metres aren't drawn; cabins (seats, dash) only up close
- [x] Performance guard (with adaptive resolution on): if the frame rate stays under 24, turn
      off reflections, then post effects, then shadows, then grass/resolution; next launch starts
      one preset lower
- [x] Software rendering (hardware acceleration off) is detected and explained on the menu and
      in game, with the steps to turn it on
- [x] Menu title no longer cut off on short or narrow windows

## Phase 1.15 — Visual error sweep (62 problems, ~1,000 broken spots, all fixed)

A placement audit (every building, tree, fence, prop, facade piece and shop measured against
the terrain, roads, water and each other) plus 60+ screenshots across the map, day and night,
rain and storm, interiors, first person and in cars. Highlights:
- [x] Buildings: no gap under the low corner (walls run into a concrete foundation), none on a
      road, inside another or buried to the eaves; shopfronts only on walls that face a street
- [x] ~700 rooftop units and water tanks were inside the upper blocks of set-back towers;
      awnings, porches and steps no longer poke into the next building
- [x] Trees: none on highways, in shops, through porches or on the walking line; street trees
      back in kerb-edge pits
- [x] Fences step down slopes in panels and never cross roads or buildings
- [x] Streets: double yellow, parking lanes with stalls, parked cars, meters and hydrants;
      parking-lot blocks with painted stalls; parks with lawns, paths and benches; mown yards
      round every building; Mill Creek gets sidewalks and lawns instead of solid paving
- [x] Port yard paved; asphalt runway with edge stripes; a real hangar (with collision)
- [x] Glass: shop windows no longer pale panels (interior light levels, canyon reflections,
      a distance fallback using the wall colour), no lit-looking blinds by day, warm/cool lit
      offices at night; intersections no longer blurry (instance transform missing)
- [x] Rain ripples only in puddles; wet reflections not broken up into blobs
- [x] Night: parked cars' lights off; decals, blood and runway paint no longer glow
- [x] Interiors: painted drywall, lights off by day, windows dark at night
- [x] Warehouses get loading doors, skylights and vents; shops get forecourts
- [x] Gang turf no longer "cleared" just by walking away

## Phase 1.14 — Port Calvera fades out on every side

- [x] Residential streets run out of the north and east edges of the city (between the
      shops on the edge strip) to an outer street; before, the poor edge of town only
      existed along the two west highways
- [x] Along them, walk-ups and corner stores first (terraced into the hill), then houses
      with porches and yards, then the poor end: tired houses, garages, sheds, trailers,
      junk and chain-link
- [x] Every older building, road and shop stays exactly where it was (checked), so saved
      homes don't move; up to 48 new homes are for sale as "Calvera outskirts"

## Phase 1.13 — Buildings in real 3D (`src/world/facades.js`)

- [x] Cornices, parapet walls with copings, plinths, string courses, stone quoins, metal
      corner trims and caps on towers
- [x] Shopfronts: piers between the bays, sign bands, granite stall risers, glazing bars,
      canvas awnings; shop interiors no longer blank white, glass reflects the street
- [x] Every window gets a sill and a head (stone on brick, painted casings and shutters on
      houses), placed on the shader's window grid, streamed in around the camera
- [x] Houses: front doors facing the street, porches with posts, rails, steps and a roof,
      corner boards, fascia, chimneys; gable roofs get ridge caps, eave and rake boards
- [x] Rooftops: AC units with fans and louvres, round wooden water tanks on legs
- [x] Fixed: a NaN in the shingle-roof shader on gable ends blacked out the whole screen
      (through bloom) when looking at houses in Mill Creek
- [x] The same pieces export to the Unity scene (`calvera-facades.json`)

## Phase 1.12 — Carryover to Unity 6 + HDRP (`southbound-unity/`)

- [x] Unity 6 HDRP project with a setup window (packages, HDRP wizard, materials, world, save)
- [x] Game rules ported to engine-free C#: arsenal (234 weapons, 195 attachments, matched
      number for number by a test), ballistics and penetration, armour and hit zones, needs,
      rebuild stages, the web save (read and written back)
- [x] Calvera exported from the web game: terrain, ground cover, water, roads, buildings,
      roofs, 47 345 trees and bushes; built into a scene in one click
- [x] 29 CC0 surfaces as HDRP Lit materials and terrain layers, plus a downloader for the
      2K/4K/8K originals (ambientCG, Poly Haven, cgbookcase)
- [x] John: controller, third-person camera, animation retargeting, gunplay with wall
      penetration and bullet holes; a penetration range by the spawn
- [x] Web game: Pause > Export save (imports into Unity)
- [x] U1 cars and driving (the owner: "do the Unity cars and driving next, actually do everything in
      Unity, even the shaders"):
  - [x] `export-unity.mjs cars parked`: all 101 bodies (spec, handling, paint, driver's seat), the web
        game's wheels (5 rim styles x 3 levels), a parity fixture from the browser, the parked cars
  - [x] The body builder ported to C# (CarShape + SurfaceNets): the same field and the same mesh as
        the browser, vertex for vertex (tested); four levels, the near one ~3 cm (browser: ~4.5)
  - [x] The body shader's zones per triangle into a palette on HDRP Lit (CarZones/CarPalette):
        glass, headlight reflector/LED/projector, grille, plates, tail lights, siren, taxi sign,
        chrome, black trim, two-tone, vinyl/fabric roofs, rust and faded paint; lights by emission
  - [x] Driving: the web game's equations (tested step for step) on a Rigidbody with four raycast
        springs; get in/out (F), chase camera, headlights at night (L), brake lights, siren (B),
        horn (H), an engine note made in code, push an overturned car back over
  - [x] Car prefabs (Southbound > Cars), a car browser, 23 parked cars in the Calvera scene with
        John's rusty pickup by the spawn; roads have collision now
  - [ ] Not yet: car interiors behind see-through glass (John is hidden in the seat), doors that
        open, damage, fuel, traffic AI. Panel gaps, paint flakes, dirt and rain beads wait for the
        HDRP car shader (U4). Not run inside the Unity editor here (no licence in this container):
        checked by the C# tests and the compile check against Unity's assemblies
- [x] N1-N4, overnight (the owner: "import everything into Unity to make everything look as photoreal as
      possible"; original shaders and CC0 textures, nothing copied):
  - [x] N1 the look: HDRP features, one Volume (physically based sky for humid Gulf air, volumetric
        clouds with shadows, volumetric haze, auto exposure, SSR + SSGI + AO, contact/micro shadows, ACES
        grade), sun and moon on the game clock at latitude 29.7, stars and Milky Way, F10 path-traced
        photo mode
  - [x] N2 water: HDRP WaterSurface ocean, every lake at its own level, sloped rivers
  - [x] N3 surfaces and wear: 21 more photo-scanned CC0 sets (50), every building its own painted wall
        and roof, new asphalt per road kind, height-blended terrain, 3 300 decals (oil, cracks, skids,
        manholes, wall grime)
  - [x] N4 road paint as geometry (crosswalks, stop bars, parking ticks); real windows on every
        building (15 600 panes on the web game's grid, checked sill for sill) with 96 ray-traced rooms
        and shops lit at night; metallic flake in the car paint; real 3D grass tufts on the terrain
  - [x] The world re-exported with each wall's street-facing bit (and the web game's terrain fixes)
  - Nothing here has been run inside the Unity editor (none in this container): the C# tests (90)
        and the compile check against Unity's assemblies verify it; HDRP is reached by reflection and
        anything an HDRP version lacks is skipped with a note in the console
- [x] N5 the rest of the street: `export-unity.mjs street` runs the web game from an instrumented copy of the
      bundle (every world mesh tagged by module and variable; the shipped game.js untouched), sweeps the camera
      over every road so near-camera instancing hands over all its instances, and carries 26 400 pieces:
      sidewalks, kerbs, intersections, bridges, street lights and porch lanterns (real lights at dusk), utility
      poles and wires, palms, yards, chain-link, gutters, rooftop units, storefronts, shop and street signs,
      billboards, benches, hydrants, drains, litter. Baked per 256 m square (heavy repeated pieces as shared
      meshes with an LOD cull), colliders on the solid ones
- [x] N6 weather: the web game's model ported (Core/Weather: states, a step at a time, soak/dry/puddle timing,
      lightning), clouds/fog/sun by weather, wet streets (darker, glossier materials), 1 400 puddle decals that fill,
      rain streaks, lightning with thunder made in code; F8 cycles it
- [x] N7 150 box-projected reflection probes down the town's street canyons (Southbound > Look > Bake reflections)
- [x] N8 ambient townspeople: 40 MakeHuman people walking 30 km of town pavements round the player (no AI yet)
- [x] N9 ambient traffic: 26 catalogue cars on 316 linked right-hand lanes, following, braking for you and for pedestrians, lights
- [x] N10 see-through car glass with the web game's cabins behind it (exported per body) and the shell lined inside; shop signs and billboards lit at night
- [ ] People and police AI, interiors, missions and jobs, HUD, the rest of the web game's shaders

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

- **Desktop app and a new look:**
  - **Southbound for Windows** (`southbound-desktop/`). The game is now its own program instead of a browser tab:
    - An installer and a portable .exe, built on GitHub's Windows machines (Actions > southbound-desktop > Southbound-Windows).
    - Every build is started on Windows and has to load the whole world before it is uploaded.
    - It always uses the fast graphics card and never slows down in the background. F11 switches fullscreen.
  - **Cinematic preset** for RTX 4090/4080/5090/5080-class cards: supersampled, 8K shadow map, full-resolution ambient occlusion, 4.8 km draw distance, denser forests and traffic.
  - **Rooms behind every window.** Each window is drawn as a real room box behind the glass:
    - Walls, floor and ceiling in that room's colours, a doorway into the hall, a sofa or bed, a picture on the wall, ceiling lights at night.
    - Blinds pulled down to different heights, or curtains.
    - Shop windows look into stores with shelves of stock.
    - The glass reflects the sky, more strongly edge-on.
  - **New materials** (16 CC0 sets, most with height maps):
    - Two kinds of real brick with depth in the mortar, stucco shops, painted lap siding on houses.
    - Corrugated steel and rusting sheds, shingle roofs laid along the ridge.
    - Square concrete pavers for sidewalks, with stains and gum spots, and concrete curbs.
    - Roads: repair patches with sealed seams, polished tyre paths, oil down the middle of every lane.
    - A photographed cliff face for rock, leaf litter on forest floors, wood floors and tiled bathrooms inside homes.
  - Buildings are drawn in three shader groups (towers and offices, brick and shops, houses and warehouses), so each stays within the 16 textures a GPU allows per shader.

- **Inside cars, through walls, houses that burn:**
  - **Car interiors.**
    - Up close, every procedural car has see-through glass with privacy glass in the back, and the glass turns to a reflection when seen edge-on.
    - Inside is a cabin sized from the car's own measurements:
      - Dash with a binnacle and lit speedometer and tachometer whose needles move, centre stack with a radio, knobs and four slatted vents, and a glovebox.
      - Column and stalks, and a steering wheel that turns with the front wheels.
      - Console with the gear lever and cup holders, pedals.
      - Seats with bolsters and headrests, a rear bench where there's room, seatbelts.
      - Sun visors, dome light, rear-view mirror, door pulls, and a parcel shelf or cargo floor.
    - The inside of the shell is trimmed as headliner, door cards and carpet.
    - Sunlight falls through the windows.
    - Front doors are split out of the body and swing on their hinges.
    - You sit in the driver's seat, reclined to fit that car's roof and floor, with your hands IK'd to the rim as it turns.
    - Traffic shows clear glass when someone is at the wheel, tinted when nobody is.
    - The fourth camera (V) in a car is the driver's-eye cockpit view.
  - **Rico rides along.** He walks round to the passenger door, opens it and climbs in, and the truck waits for him. He rides with you, turning to you when he talks. At the drop-off he gets out, shuts the door and walks off down the sidewalk. The truck is left at the curb, and Wrench collects it.
  - **Rico's truck.** The '89 pickup is a full procedural truck with faded paint and rust climbing from the sills and arches.
  - **Walls.**
    - Rounds go through what they can: glass, drywall (studs are harder), hollow doors, framed outside walls, sheet metal.
    - With a rifle or armour-piercing ammo they also go through stucco, wood, brick veneer and block.
    - Masonry, stone, steel poles and trees stop everything.
    - Each wall costs the round energy and penetration, so whoever is behind it takes less.
    - Bullet holes are drawn per pixel for each material: drywall, wood, brick, concrete, metal and glass.
      - A drywall hole shows the torn paper, the gypsum core and the cavity behind it: the wood stud where one is (16 in on centre), or the back of the far panel, or pink insulation in outside walls.
      - Exit holes blow out wider, and a group of shots tears into one big hole you can see the framing through.
  - **Houses burn and come back.**
    - A rocket or a car going up next to a house sets it on fire. It chars to a shell and the flames come out of it.
    - The family gets out and watches from across the street, and someone calls it in.
    - An engine drives down the road with its siren, the crew runs hoses and knocks the fire down, then they pack up and leave.
    - The survivors load a van and move out.
    - A builder then puts the house back over about a game day and a half:
      - The site is fenced, with a dumpster, a portable toilet, a lumber stack and a permit sign.
      - Debris is cleared and the slab is poured.
      - Studs, plates and headers go up wall by wall, then the roof trusses.
      - OSB sheathing goes on, then decking and shingle courses from the eaves up, then siding from the bottom up.
    - Workers in hard hats and hi-vis hammer away in the daytime only.
    - Ruins and rebuilds are saved.
  - **Startup flicker fixed.** The black blinks at the start came from dynamic resolution resizing the canvas after each frame was drawn. It now resizes before drawing. The loading screen also stays up until the world has rendered once, then fades out.
  - **Mice** join the rats: smaller, quicker, and they freeze before they bolt.
  - **Guns look like their own guns.** Every catalogue gun leaves the factory with its own fittings, so guns that share a base model still look different:
    - Optics: red dot tube, holographic window, variable scope on rings, or a micro dot on a pistol slide. Iron sights when there's no glass.
    - Muzzle devices: birdcage hider, compensator, brake, suppressor can.
    - Under the handguard: vertical or angled grip, weapon light, folded bipod, hand stop.
    - Slings on long guns and shell carriers on shotguns.
    - Gunsmith attachments now show on the gun, replacing the factory part in that slot.
    - In first person you sight through the optic.
    - The muzzle flash comes from the end of the muzzle device. The bore line is found from each model's geometry.
  - **Chain-link fences** around lots are see-through galvanised wire mesh with a top rail and posts, not grey slabs.

- **Start with nothing:** a new game gives you $150, the clothes you're
  wearing and your fists. Rico no longer hands out a gun or a truck: he pays
  you $200 for the ride downtown, tells you to buy a 9mm (Walt sells the
  Standard 9mm, about $450 in the city, less in Mill Creek and the bayou) and
  will sell you his rusty pickup for $400 at the yard. Bandages, holsters and
  everything else are bought. The car parked by the spawn belongs to someone
  else: taking a parked car that isn't yours is theft if anyone sees it. The
  start menu has a New game button (Play becomes Continue when you have a
  save).

- **Armour, wounds and the street (after the detail pass):**
  - Armour stores (Gulf Coast Tactical downtown, Sabine Army Surplus in Mill
    Creek): NIJ-rated vests and plate carriers (IIIA soft armour to Level IV
    ceramic, with plate wear), helmets, bags that hide long guns (daypack to
    guitar case), holsters, and medical supplies, all shown on John in 3D.
  - Police stop you for a gun they can see in town; bystanders call 911.
    Sidearms hide under an untucked shirt or jacket with the right holster,
    long guns in a big enough bag. On arrest your weapons go to the evidence
    room at the Central Precinct (pay a release fee to get them back).
  - Damage depends on the round's penetration, the armour, and where it hit:
    plates and helmets stop what they're rated for, leg hits make people
    limp, arm hits make them drop their gun, the badly hurt go down; a downed
    officer's partner drags them out of the fire and an ambulance comes. You
    can bandage a downed stranger. Player wounds (leg, arm, bleeding) are
    treated with bandages, tourniquets, splints, IFAKs and trauma bags (H).
  - Eleven knives and hand weapons. Some pedestrians carry pistols or knives
    and fight back; muggers may carry knives; armed people drop their weapon
    when they fall.
  - Witnesses: unless a cop saw it, someone has to call 911. Reach them first
    and you can try to pay them off. Some refuse; some take it and call.
  - Every shop has its own building style, a door that opens as you walk up,
    an OPEN sign and real opening hours. Blue road signs point the way to
    every shop, and the phone's Places tab lists them all with GPS.
  - The Calvera Property Auction sells foreclosed houses and seized cars
    every day with live bidding.
  - Colour: AgX tone mapping and neutral grading (removed a yellow cast).

- **Real-world detail pass (John Cortes and the Gulf Line crew):**
  - Story opening: you play John Cortes. A cutscene introduces Rico's crew of
    14 (each with their own look, name, job and lines); Rico hands you a
    standard 9mm and a rusty pickup you can sell. The crew live at a scrapyard
    hideout and sell services: repairs, towing, hauling cars out of the water,
    patching you up, wiping bounties, and building scopes and suppressors from
    supplies you bring.
  - Guns: real CC-BY firearm models (Glock 17/19, Colt Python, 1851 Navy,
    M4A1, M24, Remington 870) with per-gun holds. Three gunsmiths with a
    shopkeeper dialog, a catalog (silhouettes, fire mode, calibre,
    descriptions), story unlocks, a three-of-a-kind limit, a spinning 3D
    preview, and customisation (attachments, skins, paint, your own colour,
    ammo type).
  - Combat: no fixed damage, only fixed penetration. Ammo types; scopes that
    actually zoom, with breathing sway and hold-breath; you can shoot drivers
    through the glass; cars burn and explode.
  - World: the city thins out into run-down lots and grass at its edges; two
    new hamlets; cluttered alleys; muggings, robberies, fights and
    breakdowns; three rival gangs with turf. Gunfire in town brings the
    police, but gunfire out in the country doesn't.
  - Small details: gun safety on/off (K), brass casings and muzzle smoke,
    hair and stubble that grow day by day, barbershops, cracked windows that
    a repairman fixes within a day, fire crews at wrecks, and fire alarms in
    every building (pull station, horn, strobe, smoke detector, a fire truck
    that responds, police if someone saw you).
  - Shops: clothing (three stores, 13,500 pieces across tops, jackets, pants,
    shoes, hats, eyewear, neckwear and gloves, worn on John via a shader, with
    a live 3D fitting room and a wardrobe), Gulf Mart corner stores (food to eat
    or carry; coffee steadies your aim), and crafting supplies at the hardware
    store.
  - Phone: the Runr app delivers guns (with their attachments), food and
    supplies by courier, tows your car back to the road (by boat if it's in
    the sea), and gives you a ride to the hideout. Everything costs money.
  - Billboards with local ads along the highways (lit at night). Map badges:
    J for jobs, S for shops. Cleaner interaction prompts.
  - Strictly real-world: no sci-fi weapons or props anywhere.

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
