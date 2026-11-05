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
- [ ] Vehicles, people and police AI, interiors, missions and jobs, HUD, HDRP water

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
