# Southbound for Unity

Southbound carried over from the browser into Unity 6 with HDRP, the High
Definition Render Pipeline. HDRP is the pipeline built for photoreal open
worlds: physically based sky and sun, volumetric fog, screen-space and
ray-traced reflections, GI and shadows (DirectX 12 on an RTX card), parallax
occlusion mapping, and a 4K/8K texture budget that a browser can't touch.
Unity Personal is free, and there are no royalties.

## What's already here

| | Carried over | How |
|---|---|---|
| **Calvera** | The whole 4 km map: terrain (1025² heights, within a few millimetres of the web game's), ground cover, the Gulf, lakes and rivers, 158 roads, 507 buildings, 156 gable roofs, 47 837 trees and bushes where the web game puts them | `Data/World/`, built into a scene by **Southbound > Build Calvera scene** |
| **Architecture** | Every cornice, parapet, shopfront pier, awning, porch, front door, roof trim, rooftop unit and window sill from the web game, merged into static meshes | `Data/World/calvera-facades.json`, built with the scene |
| **Surfaces** | 50 photo-scanned CC0 sets as HDRP Lit materials with mask maps and parallax, plus terrain layers: the web game's 29 and 21 more for Calvera's buildings and streets (painted lap siding and stucco, four bricks, stone, concrete, shingle / clay / terracotta roofs, patched asphalt, manhole covers). Every building gets its own wall, painted in the web game's colour. Bundled at 512 px; the setup downloads the **2K / 4K / 8K originals** (45 sets automatically, 5 by hand) | `Assets/Southbound/Art/Surfaces/`, `Southbound > Materials` |
| **Models** | John and the townspeople (MakeHuman), the 24-clip animation library, every gun, vehicles, animals, props and trees | `Assets/Southbound/Art/Models/` (glTFast imports them) |
| **Arsenal** | All 234 weapons and 195 attachments, generated the same way as the web game. A test checks every name, stat and price matches | `Assets/Southbound/Core/Weapons.cs` |
| **Ballistics** | Penetration by material (drywall, studs every 16", doors, sheet metal, stucco, wood, brick, block, glass), energy lost through walls, entry and exit holes, hit zones, NIJ-style armour, ammo types, falloff | `Core/Ballistics.cs`, `Runtime/Gunplay.cs` |
| **John** | Walk / jog / sprint / crouch / jump / aim-walk, the web game's animation retargeting (UAL → MakeHuman), third-person camera with shoulder aim, recoil, reloads | `Runtime/` |
| **Needs** | Energy, food, body weight and stamina, same rates as the web game | `Core/Needs.cs` |
| **Your save** | Money, guns, fitted attachments, ammo, properties, garage, missions, needs, position. In the web game: **Pause > Export save**. Here: **Southbound > Import web save** | `Core/WebSave.cs` |
| **Rebuilds** | The burnt-house rebuild schedule (clear, slab, frame, sheath, roof, siding) | `Core/Rebuild.cs` |
| **Cars** | All 101 bodies (the 93 catalogue models, the service vehicles, the traffic bodies), rebuilt from the web game's own body specs by the same method (distance field + surface nets, ported line for line: a test checks the mesh matches the browser's vertex for vertex), at four levels of detail with a near level finer than the browser's. Glass, lamps, grille, plates, chrome, sirens, taxi signs, two-tones, vinyl and fabric roofs and rust as in the web game's body shader. The web game's wheels (5 rim styles). 23 cars parked where the web game parks them, John's rusty pickup by the spawn | `Data/Vehicles/`, `Core/CarShape.cs`, `CarZones.cs`, `CarMeshBuilder.cs`, **Southbound > Cars** |
| **Driving** | The web game's driving equations (acceleration, top speed, braking and reverse, steering that tightens at speed, grip, handbrake drifts, nitrous; a test checks them step for step against the browser) on a Rigidbody riding on four raycast springs. Get in and out at the driver's door, chase camera, headlights at night, brake lights, siren, horn and an engine note made in code | `Core/DriveModel.cs`, `Runtime/CarController.cs`, `Driving.cs`, `CarBody.cs` |
| **The photoreal look** | HDRP switched on for it (volumetric clouds and fog, screen-space reflections and GI, decals, water, lens flares) and one Volume: a physically based sky tuned for humid Gulf air, real volumetric cumulus with their shadows, kilometres of haze with light shafts, eye-like auto exposure, contact and micro shadows, ACES with a light filmic grade. The sun and moon move with the game clock for Calvera's latitude, a starfield and Milky Way at night, moon phases. **F10** is photo mode: time stops and HDRP's path tracer takes over (DirectX 12 and an RTX card) | `Editor/PhotoLook.cs` (**Southbound > Look > Make it photoreal**), `Runtime/DayNight.cs`, `PhotoMode.cs`, `Core/NightSky.cs` |
| **Water** | HDRP's water system: the Gulf as an endless ocean surface, Lake Arden, the pond and every lake at its own level with their shores, rivers as sloped meshes | `Core/WaterBodies.cs`, `Editor/WaterLook.cs` |
| **Wear and tear** | 3 300 HDRP decals: oil in the lanes, crack networks, skid marks at the junctions, manhole covers (photo-scanned), grime creeping up the foot of every wall | `Core/Decals.cs`, `Editor/DecalBuilder.cs` |
| **Road paint** | The web game's markings as real geometry 1.5 cm above the asphalt: double and dashed yellow centre lines, white edge and parking lines with stall ticks, a zebra crosswalk and a stop bar on every approach to a junction. Worn paint (the asphalt shows through, oil and skids land on top) | `Core/RoadMarkings.cs`, `Editor/RoadMarkingBuilder.cs` |
| **Windows** | 13 500 windows and 2 100 shopfront bays exactly where the web game draws them (a test checks every one against the web game's sills): smooth dark glass that takes HDRP's reflections, a frame and glazing bars, and behind each one of 64 rooms or 32 shops ray-traced into an atlas (living rooms, bedrooms, kitchens, studies; grocery, clothing, café, pharmacy, salon, office). By day the rooms are dark behind the reflections; at night some of them are lit, and the evening ones go dark late at night | `Core/BuildingWindows.cs`, `Editor/WindowBuilder.cs`, `Runtime/NightWindows.cs` |
| **Car paint** | Clear coat over metallic flake: a detail map of tiny tilted mirrors the same half-millimetre size on every panel, strong in metallic paint, a hint of orange peel in solid colours, gone where the paint has oxidised | `Core/CarZones.cs` (FlakeDetail), `Editor/CarFactory.cs` |
| **The street** | Everything else on Calvera's streets, carried over from the running web game: sidewalks (concrete pavers), kerbs, intersections, bridges, 505 street lights and 203 porch lanterns (real HDRP lights that come on at dusk), 199 utility poles with their wires and service drops, 196 palms and 981 palmetto clumps, front yards (walks, driveways, picket fences, mailboxes, bins, AC units, porch chairs, hoops), chain-link fences, gutters, rooftop units, storefronts, 1 600 shop signs, billboards, wayfinding and street-name signs, benches, hydrants, drains and litter: 26 400 pieces | `Data/World/calvera-street.json`, `Core/StreetData.cs`, `Editor/StreetBuilder.cs`, `Runtime/StreetLights.cs` |
| **Weather** | The web game's weather (clear, cloudy, overcast, rain, storm; a step at a time every few game hours): the cloud preset by cover, thicker fog and a dimmer sun in rain, streets, sidewalks and walls that darken and turn glossy as they soak (and dry over minutes), 1 400 puddles in the roads' dips and gutters that fill once it's soaked and mirror the street, rain streaks round the camera, lightning and thunder made in code. **F8** cycles it | `Core/Weather.cs`, `Runtime/WeatherController.cs`, `Editor/WeatherBuilder.cs` |
| **Street reflections** | 150 box-projected reflection probes filling the street canyons in town (one over every junction, one every 50 m between), so glass, wet asphalt and puddles reflect the street rather than the open sky. Bake them once with **Southbound > Look > Bake reflections** | `Core/ReflectionSpots.cs`, `Editor/ReflectionProbeBuilder.cs` |
| **Townspeople** | 40 of the web game's MakeHuman townspeople (retargeted from John's animation library) walking the town's pavements around you (307 paths, 30 km, crossing at the junctions), a few stopped in pairs to talk, fewer at night. They can be shot (a body capsule and the wound model), they run from gunfire or crouch where they are, a car driven into them at speed kills them, and the dead lie where they fell until you're well away | `Core/Sidewalks.cs`, `Runtime/Pedestrians.cs`, `Editor/PedestrianBuilder.cs` |
| **Police** | The web game's wanted rules (tested): shots that someone hears, people hurt or killed in front of witnesses, a gun pointed at an officer, an officer shot raise the stars; more cruisers per star, routed over the lane graph (shortest way, tested) to you, or to where you were last seen once they've lost you, lights and a wailing siren made in code. Officers (the web game's cop) get out and either come to arrest you (low heat, on foot, gun away: stand still and you're **Busted**, a fine) or, after a killing or with your gun out, stand and fire. Out of their sight the stars cool one at a time. **Wasted** when your health runs out: a hospital bill and you wake at the spawn. Shooting at the penetration range is allowed | `Core/Wanted.cs`, `Runtime/Police.cs`, `Editor/PoliceBuilder.cs` |
| **Car glass and cabins** | Up close, every car's windows are real see-through glass with the web game's cabin behind them (cabin.js, exported per body: dashboard and dials, centre stack, console, steering wheel, seats with headrests, rear bench, belts, visors, mirror) and the inside of the shell lined like the web game shades it (headliner, door cards, carpet). Far off, the glass stays the tinted shell | `Data/Vehicles/cabins.json`, `Core/CarMeshBuilder.cs` (CabinSet), `Editor/CarFactory.cs` |
| **Traffic** | 26 cars from a dozen everyday catalogue models driving 316 right-hand lanes (49 km) linked through the junctions, at each road's speed, keeping their distance, braking for you, for parked cars and for townspeople crossing, wheels turning, brake lights, headlights after dark. Kinematic, so your car bumps off them | `Core/Lanes.cs`, `Runtime/Traffic.cs`, `Editor/TrafficBuilder.cs` |
| **Runs on Intel graphics** | Four graphics tiers picked from the card at start (Integrated, Medium, High, Ultra). On a laptop's built-in Intel or AMD graphics the heaviest HDRP passes are off per camera (volumetric clouds and fog, screen-space reflections and GI, contact shadows), it draws at 50-80% resolution upscaled with STP, and it thins the world (fewer people and cars, close grass, trees, shadows, lights and decals); resolution then moves to hold 30 fps, and a tier that still can't keep up drops to the one below. **F7** picks a tier by hand. Photo mode's path tracer only on ray-tracing cards | `Core/GpuTier.cs`, `Runtime/PerformanceTier.cs` |
| **Car damage, doors, fuel** | The web game's numbers (tested): a crash dents the body where it hit (the mesh is pushed in and its shading bent to match), cracks or knocks out the windows on that side and hurts you in a bad one; bullets wear the car down and break the glass they hit; crashed to nothing the engine dies, shot or blown up to nothing it burns and explodes (fireball, flash, the blast hurts people and cars nearby, the wreck is thrown and charred). Smoke from the bonnet as it gets worse, less power when it's hurt. The front doors are cut out of the body (the web game's rule, tested) and swing open when you get in and out; a battered side leaves its door hanging. Fuel drains as you drive and fills at a pump for what's missing (pumps come with the shops). Fuel and engine gauges on the HUD. Car prefabs from older builds are rebuilt automatically | `Core/CarDamage.cs`, `Runtime/CarHealth.cs`, `CarDoorSwing.cs`, `Editor/CarFactory.cs` |
| **Shops and walk-in buildings** | Every walk-in building the web game builds comes over whole, inside and out, doors propped open: the three gun stores (the guns on the wall too), three clothing stores, the Gulf Marts, two armour shops, the property auction, the police precinct and the sheriff's office, the hospital and the clinic, the firehouse. A keeper behind each counter while it's open (the web game's hours); at the counter **F** opens the store screen (time stops; arrows or W/S, Enter, Tab, Esc, or the mouse): every gun at that shop's prices (city dearer, the bayou cheaper) and boxes of ammunition up to the legal limit at the gun stores, the menu at the Gulf Marts (health back, hunger fed). A fuel pump in front of every Gulf Mart. BUSTED puts you outside the nearest station, WASTED outside the nearest hospital or clinic. Clothing stores are browse-only until the wardrobe comes over | `Core/ShopCatalog.cs`, `Runtime/Shops.cs`, `StoreScreen.cs`, `Editor/ShopBuilder.cs`, `Data/World/calvera-shops.json` |
| **Missions and jobs** | The web game's 63 story missions in three acts, 12 side jobs (open after enough story) and its jobs, with the places it sends you (tested). The next contact waits near where their mission starts: walk up, **F**. Go here, drive there, take the marked car (parked at the kerb) and deliver it, take out the targets (they close in and shoot), lose the police, hold on, pay up; MISSION PASSED pays the reward and saves. Job boards on the map: **F** starts a shift (the work vehicle appears, sirens on for the emergency ones), stops drawn the web game's way and snapped to the roads, pay per stop rising 15% a level, a bonus for time left, a level every three shifts; wreck the vehicle and you're sent home. Boat and flying steps need a boat or an aircraft; the boat and flying jobs (fishing charter, crop duster, air tours, medevac) put you aboard one. Fishing steps and the Commercial Fisherman count your catch, hunting steps and the Hunting Guide what you skin: every story mission, side job and job now runs | `Core/Missions.cs`, `Runtime/Missions.cs`, `Editor/MissionBuilder.cs`, `Data/World/calvera-missions.json` |
| **Boats and aircraft** | The web game's 16 boats and 11 aircraft, shaped from the browser's own parts and meshed the same way (a test checks every one vertex for vertex), with its physics line for line (tested step by step against the browser): boats plane, lean into turns, rock on the waves and run aground at the shore; planes need flying speed, stall when too slow, have flaps (**J**) and landing gear (**G**), burn fuel, drift with the wind and buck in storms; helicopters hover on the collective and autorotate with the engine dead. Three marinas (Lake Arden, Port Calvera Harbor, Bayou Verde Landing; piers found by the web game's shoreline search) sell boats and 98 upgrades and launch the ones you own; Redgrass Airfield (runway, hangar, helipad, fuel pad, windsock) sells aircraft and 17 upgrades. A speedboat and a Skylark wait from the start. The flight panel (knots, feet, heading, climb, fuel, gear, flaps), warnings (STALL, PULL UP, LOW FUEL, ENGINE OUT), landings rated, the tower on the radio, refuelling on the pad, low flying over the city is a crime, the flight school (three lessons, medals, a pilot's licence: +15% on flying jobs). Bullets and crashes wear them down; wrecked, they blow up | `Core/Craft.cs`, `Core/Wind.cs`, `Runtime/CraftBody.cs`, `Piloting.cs`, `Fleet.cs`, `Editor/CraftBuilder.cs` |
| **Fishing and the tool stores** | The web game's 245 tools in 8 trades (its ids, so a web save's tools carry over) at Calvera Hardware, Mill Creek Feed & Hardware, Bayou Outfitters and a bait & tackle counter at every marina. With a rod and bait or a lure, face the water and press **F** to cast (**H** on a stopped boat); strike when the bobber dips, then hold **F** (or Shift) to reel and ease off before the line snaps. What bites depends on the water (21 species across the lake, the rivers, the bayou and the Gulf, with their weights and prices), the hour and the weather; one legendary fish in each kind of water. Fish under the size limit go back; the rest go on ice for the fish market at the marinas (half price once they're two days old), with a fishing log of your records. The "catch fish" mission steps and the Commercial Fisherman job count your catch | `Core/Tools.cs`, `Core/Fishing.cs`, `Runtime/Angling.cs`, `Outfitters.cs`, `Editor/OutdoorsBuilder.cs` |
| **Hunting and wildlife** | The web game's animals (the open animals pack: deer, bucks, coyotes, foxes, wild mustangs, longhorn herds) come and go around you by region and hour, with three legends in their own country (the Pale Buck, Old Scar, Ember). They graze and wander, hear you (a shot carries; walk softly to get close), smell you downwind (the wind readout shows near game), flee, and coyotes and bulls charge and bite. A wounded animal bleeds, slows and leaves a trail, then lies down. **F** beside it skins it with a knife: the pelt graded by how clean the kill was, and the meat. **K** blows your hunting call. Crows circle a carcass left lying; ducks paddle on the lakes and burst off at a shot. Three trading posts buy pelts and meat, cook you a plate, tell the rumours and sell the licence; hunting without one, or killing a protected animal, is poaching if anyone sees. The hunting mission steps and the Hunting Guide job count what you skin | `Core/Hunting.cs`, `Runtime/Wildlife.cs`, `Editor/OutdoorsBuilder.cs` |
| **The phone** | **I** opens it: your inventory (use a first-aid kit, a repair kit on the car beside you, the flashlight, a hunting call), the garage (your boats to the nearest marina, your aircraft to the airfield), your weapons (take one out), the jobs and the story so far, every place in Calvera nearest first with GPS (a marker and a dot on the minimap's rim), Runr (food, a gun or your car towed, by courier), a cab to anywhere (by the mile; the clock moves on), the bank (deposits and withdrawals at a Gulf Mart, interest every day), texts, the Calvera Courier's news (the police log makes the paper), the weather and what's coming, your stats and Save. **L** on foot lights your flashlight (or the phone's own) | `Core/Phone.cs`, `Runtime/Phone.cs` |
| **Houses and property** | Every building has a door (on the side facing its road): **F** goes in when it's open (yours, a viewing between 9 and 5, a shop, bar or office in its hours, a home left unlocked), into a room built inside the building the web game's way: homes with a living room, a walled bedroom, a kitchen and dining table (a house a fireplace and a tiled bathroom too), offices with desks, stores with stocked shelves and fridges, bars with a counter and stools, warehouses with racks and crates, furnished from the open house-interior pack. Locked: **F** knocks, **G** kicks it in (a crime if anyone sees); someone home calls the police. 246 properties with the web game's addresses and prices: buy one inside (**F** by the bed), sleep there to save (your home: you wake up outside it), change clothes at your wardrobe. Gulf Coast Realty lists them all (GPS to any), sells yours at today's market value, fits an alarm, solar panels or a renovation. Every day: business income, rent from homes you don't live in, tax and upkeep, now and then a break-in | `Core/Estate.cs`, `Runtime/Homes.cs`, `Interior.cs`, `Editor/EstateBuilder.cs` |
| **HUD** | UI Toolkit, built in code: a round minimap of Calvera baked from the world data (hill-shaded land, sea, lakes and rivers, every road, the buildings; tested) that turns with the camera and zooms out as you drive faster, with your arrow, north, and police cruisers flashing red and blue (kept on the rim when they're off the map); health and stamina under it; the clock, money (with what just changed it), wanted stars, the weapon and its ammunition top right; the speedometer in a car; prompts, messages, a crosshair while aiming, BUSTED / WASTED. Hidden in photo mode | `Core/MapRaster.cs`, `Runtime/Hud.cs`, `Editor/HudBuilder.cs` |
| **Grass** | Real 3D tufts of thin, leaning strands (the web game's shape) as instanced terrain detail: meadow green, tall dry straw and short verges along the roads, planted from the web game's ground cover, never on roads, buildings, water or rock | `Core/GroundCover.cs`, `Editor/GrassBuilder.cs` |

There is also a **penetration range** next to the spawn: walls of every material
with targets behind them (the one behind the drywall wears a level III plate).

## Setting it up (Windows PC)

1. **Unity Hub**: download from <https://unity.com/download>, install, sign in
   and take the free **Personal** licence.
2. **Unity 6**: in Hub go to **Installs > Install Editor** and pick the newest
   **Unity 6 LTS** (6000.0 or newer). The defaults are fine; add *Windows Build
   Support (IL2CPP)* if you want to build an .exe later.
3. **The project**: clone this repository (GitHub Desktop: *Clone repository*,
   branch `claude/ultimate-ai-legend-KhpoT`). In Hub: **Projects > Add > Add
   project from disk** and pick the `southbound-unity` folder. Open it. If Hub
   says the project was made with a different 6000.x version, open it with yours.
4. The **Southbound** window opens by itself (or **Southbound > Setup**). Press **Set up everything** at the top
   and walk away: it runs steps 1 to 6 below one after another (packages, HDRP, materials, the 4K textures,
   animations, the Calvera scene), carrying on by itself when Unity reloads or restarts on the way (say **Yes** if
   it asks to enable the new input backends). Or go top to bottom by hand:
   1. **Install packages**: glTFast, Input System, AI Navigation. If Unity asks
      to enable the new input backends and restart, say **Yes**.
   2. **Open HDRP Wizard** and press **Fix All**. For ray tracing on an RTX
      card, switch the wizard to **DX12** and fix that tab too.
   3. **Build materials**.
   4. **Download...**: pick **4K** (about 2 GB). The editor stays usable while it
      downloads. 24 of the 29 sets come down by themselves (ambientCG, Poly Haven).
      The other 5 are from cgbookcase, which only allows downloads in a browser:
      the window lists their pages. On each one press **Download** (2K, free), then
      use **Southbound > Materials > Import downloaded zip**.
   5. **Fix animation import**.
   6. **Build Calvera scene**: takes a few minutes (the first time it also builds the
      cars it parks; **Southbound > Cars > Build every car** builds all 101).
   7. **Import web save** (optional).
5. Press **Play**.

**Controls:** WASD move · Shift sprint · Space jump · C crouch · right mouse aim ·
left mouse shoot · R reload · 1-9 or mouse wheel switch weapon · H holster ·
Esc pause / save. A gamepad works once the Input System is installed.

**Phone**: I · **flashlight**: L on foot · **doors**: F to go in (or knock), G to kick a locked one in.
**Hunting**: F beside a carcass to skin it (with a knife) · K to blow your hunting call.
**Fishing**: F to cast facing the water (H on a stopped boat) · F (or H) to strike on the bite · hold F, H or Shift to reel.
**A boat** (F beside it to go aboard or step off): W throttle · S astern · A/D steer.
**A plane**: W/S throttle lever · A/D bank and turn · Space nose up · Shift nose down · G gear · J flaps · F on the ground to get out (high up: bail out).
**A helicopter**: Space climb · Shift descend · W/S tilt forward/back · A/D turn.

**In a car** (F at the driver's door to get in or out): W throttle · S brake, then
reverse · A/D steer · Space handbrake · Shift nitrous · H horn · L headlights ·
B siren (police cars). F beside a car on its roof pushes it back on its wheels.

## How it's organised

```
Assets/Southbound/
  Core/      game rules in plain C#, no Unity dependency (also built and tested by dotnet)
  Runtime/   MonoBehaviours: SouthboundGame, PlayerController, ThirdPersonCamera,
             Retargeter, Gunplay, BulletHoles, SurfaceTag, Health, SbInput,
             CarController, CarBody, Driving
  Editor/    setup window, HDRP materials, texture downloader, Calvera builder, trees,
             CarFactory (car prefabs, the car browser)
  Tests/     NUnit tests (Window > General > Test Runner > EditMode)
  Art/       Surfaces (29 CC0 sets), Models (glTF), Generated (decals, packed masks)
Data/World/  Calvera exported from the web game (and where its cars are parked)
Data/Vehicles/ every car body's spec, handling and paint; the web game's wheels
Tools/       CoreTests (dotnet test), UnityCheck (compile check against Unity's DLLs)
```

Coordinates: the web game is right-handed and Unity is left-handed, so the
world is mirrored on X (`CalveraWorld.ToUnity`), which is the same flip glTFast
applies to models. Everything lines up.

## Keeping it in sync with the web game

The data comes from the web game's own code, so the web game stays the source of truth:

```
node tools/southbound/export-unity.mjs            # everything
node tools/southbound/export-unity.mjs world      # Calvera only (runs the game headless)
node tools/southbound/export-unity.mjs textures mirror models catalog
node tools/southbound/export-unity.mjs cars parked   # car specs, wheels, parity fixture; parked cars
node tools/southbound/export-unity.mjs street   # sidewalks, lights, poles, palms, yards, signs, clutter
dotnet test southbound-unity/Tools/CoreTests --filter "Category!=Online"
```

The `southbound-unity` GitHub workflow runs the rules tests, compiles every
Unity script against Unity's reference assemblies, and downloads every
ambientCG and Poly Haven set to prove the downloader still works.

## Next to carry over

1. **Clothes and the barber**: the wardrobe, buying outfits at the clothing stores.
2. **People**: the web game's AI for the townspeople, police and the gang on a NavMesh, the
   gang and the hideout.
3. **The rest of the web game's shaders** in HDRP: panel gaps, dirt and rain beads on the cars;
   the far crowd. **Street props as real models.**

## Troubleshooting

- **No boats, planes or tackle shops** (a scene built before they came): **Southbound > Add the new features to this
  scene**, or build the scene again.
- **Pink materials**: HDRP wasn't set up when they were built. Run the HDRP
  Wizard (Fix All), then **Southbound > Materials > Build all materials**.
- **John in a T-pose**: do step 5 (*Fix animation import*), then build the scene again.
- **Package version errors on first open**: open **Window > Package Manager**,
  select *High Definition RP*, and update it to the version your editor offers.
- **A white or black screen**: the scene's *Sky and Fog Volume* uses automatic
  exposure. If it was deleted, add a Volume with an Exposure override (Automatic Histogram).

Credits and licences for every asset: `Assets/Southbound/Art/Models/CREDITS.md`
and each surface's `surface.json`. All textures are CC0; the models are CC0,
CC-BY 4.0 (credited) or MIT.
