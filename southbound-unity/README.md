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
4. The **Southbound** window opens by itself (or **Southbound > Setup**). Go top to bottom:
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

1. **Car interiors and glass**: the cabins (seats, dashboard, steering wheel and
   dials from cabin.js) behind see-through glass; today the glass is the web game's
   tinted shell and John is hidden in the seat. Doors that open, Rico riding along,
   damage, fuel, traffic.
2. **People**: pedestrians, police and the gang on a NavMesh (AI Navigation is installed),
   with the wound model and armour.
3. **Interiors**: shops, houses and the hideout, with HDRP decals for the holes.
4. **Missions, jobs, shops and the phone** on top of the save, which already carries over.
5. **HUD** in UI Toolkit.
6. **The rest of the web game's shaders** in HDRP: panel gaps, dirt and rain beads on
   the cars; wet roads and puddles; the far crowd.
7. **Street props as real models**: the street pieces are the web game's own simple
   shapes; photo-scanned or modelled hydrants, mailboxes, benches and poles would be next.

## Troubleshooting

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
