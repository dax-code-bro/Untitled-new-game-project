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
| **Calvera** | The whole 4 km map: terrain (1025² heights, within a few millimetres of the web game's), ground cover, the Gulf, lakes and rivers, 146 roads, 407 buildings, 74 gable roofs, 47 345 trees and bushes where the web game puts them | `Data/World/`, built into a scene by **Southbound > Build Calvera scene** |
| **Architecture** | Every cornice, parapet, shopfront pier, awning, porch, front door, roof trim, rooftop unit and window sill from the web game, merged into static meshes | `Data/World/calvera-facades.json`, built with the scene |
| **Surfaces** | All 29 photo-scanned CC0 sets as HDRP Lit materials with mask maps and parallax, plus terrain layers. Bundled at 512 px; the setup downloads the **2K / 4K / 8K originals** (24 sets automatically, 5 by hand) | `Assets/Southbound/Art/Surfaces/`, `Southbound > Materials` |
| **Models** | John and the townspeople (MakeHuman), the 24-clip animation library, every gun, vehicles, animals, props and trees | `Assets/Southbound/Art/Models/` (glTFast imports them) |
| **Arsenal** | All 234 weapons and 195 attachments, generated the same way as the web game. A test checks every name, stat and price matches | `Assets/Southbound/Core/Weapons.cs` |
| **Ballistics** | Penetration by material (drywall, studs every 16", doors, sheet metal, stucco, wood, brick, block, glass), energy lost through walls, entry and exit holes, hit zones, NIJ-style armour, ammo types, falloff | `Core/Ballistics.cs`, `Runtime/Gunplay.cs` |
| **John** | Walk / jog / sprint / crouch / jump / aim-walk, the web game's animation retargeting (UAL → MakeHuman), third-person camera with shoulder aim, recoil, reloads | `Runtime/` |
| **Needs** | Energy, food, body weight and stamina, same rates as the web game | `Core/Needs.cs` |
| **Your save** | Money, guns, fitted attachments, ammo, properties, garage, missions, needs, position. In the web game: **Pause > Export save**. Here: **Southbound > Import web save** | `Core/WebSave.cs` |
| **Rebuilds** | The burnt-house rebuild schedule (clear, slab, frame, sheath, roof, siding) | `Core/Rebuild.cs` |

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
   6. **Build Calvera scene**: takes a minute or two.
   7. **Import web save** (optional).
5. Press **Play**.

**Controls:** WASD move · Shift sprint · Space jump · C crouch · right mouse aim ·
left mouse shoot · R reload · 1-9 or mouse wheel switch weapon · H holster ·
Esc pause / save. A gamepad works once the Input System is installed.

## How it's organised

```
Assets/Southbound/
  Core/      game rules in plain C#, no Unity dependency (also built and tested by dotnet)
  Runtime/   MonoBehaviours: SouthboundGame, PlayerController, ThirdPersonCamera,
             Retargeter, Gunplay, BulletHoles, SurfaceTag, Health, SbInput
  Editor/    setup window, HDRP materials, texture downloader, Calvera builder, trees
  Tests/     NUnit tests (Window > General > Test Runner > EditMode)
  Art/       Surfaces (29 CC0 sets), Models (glTF), Generated (decals, packed masks)
Data/World/  Calvera exported from the web game
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
node tools/southbound/export-unity.mjs textures models catalog
dotnet test southbound-unity/Tools/CoreTests --filter "Category!=Online"
```

The `southbound-unity` GitHub workflow runs the rules tests, compiles every
Unity script against Unity's reference assemblies, and downloads every
ambientCG and Poly Haven set to prove the downloader still works.

## Next to carry over

1. **Vehicles**: the procedural car builder (93 cars, cabins, doors) into Unity
   meshes, driving with WheelColliders, and Rico riding along.
2. **People**: pedestrians, police and the gang on a NavMesh (AI Navigation is installed),
   with the wound model and armour.
3. **Interiors**: shops, houses and the hideout, with HDRP decals for the holes.
4. **Missions, jobs, shops and the phone** on top of the save, which already carries over.
5. **HUD** in UI Toolkit, and HDRP's water system for the Gulf and Lake Arden.

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
