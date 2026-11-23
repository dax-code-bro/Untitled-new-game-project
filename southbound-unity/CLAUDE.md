# Southbound for Unity: notes for Claude (read this first)

Southbound is the owner's original open-world game ("my own version of Red Dead Redemption 2"), set on a
fictional Gulf Coast (Calvera, Port Calvera, Mill Creek, Bayou Verde). It began as a Three.js web game
(live: https://untitled-new-game-project.vercel.app/southbound/) and this folder is its Unity 6 HDRP version.
Repository: https://github.com/dax-code-bro/Untitled-new-game-project, branch `claude/ultimate-ai-legend-KhpoT`.
The full project notes are in that repository: `CLAUDE.md`, `site/southbound/CLAUDE.md` (rules, workflow,
everything learned), `site/southbound/FEATURES.md` and `site/southbound/ROADMAP.md`. Read them on GitHub if this
folder is on its own.

## Where things stand (2026-11-23)

- The owner's machine: a Windows 11 gaming laptop with an **NVIDIA RTX 5070** and built-in Intel graphics.
  Browsers and apps kept landing on the Intel chip; Windows Settings > System > Display > Graphics > "High
  performance" fixes that per program. Unity's editor runs on the RTX (its title bar shows DX12).
- **Unity 6.6 (6000.6.10f1)** is installed. The project was set up for 6000.0.23f1; the owner opened it with 6.6
  and accepted the upgrade. The first open compiled with no errors and the **Southbound setup window** came up.
- This copy came from GitHub's **Download ZIP**, so it is **not a git clone**: changes made here are not on
  GitHub, and fixes pushed to GitHub don't arrive by themselves (download the changed files, or clone the repo
  with GitHub Desktop into a short path like `C:\Games` and open that copy instead).
- It may sit in `Documents`, which OneDrive syncs. Unity and OneDrive fight over the Library folder: pause
  OneDrive while Unity works, or better, move the project to `C:\Games\southbound-unity`.
- **Nothing in this project had ever run inside Unity before this.** It was written and checked in a cloud
  container (compiled against Unity's reference assemblies, Core tested with NUnit), so expect the first runs to
  turn up problems. Find them in the Console, or in the log: `%LOCALAPPDATA%\Unity\Editor\Editor.log`.

- 2026-11-23 (the owner: "make it fully playable"): the parts the Unity version was missing are being carried over
  one batch at a time. B1 boats and aircraft (marinas, Redgrass Airfield, flight school, the boat/flying mission
  steps and jobs). A scene built before a batch gets it from the Southbound menu (**Add boats and aircraft to this
  scene**) or by building the scene again.

## Next steps (the Southbound window, Southbound > Setup)

Press **Set up everything** at the top (Editor/AutoSetup.cs; if this copy predates it, the window has no such
button: get `Editor/AutoSetup.cs`, `Editor/SetupWindow.cs` and `Editor/MaterialDownloader.cs` from GitHub), or the
steps by hand, in order:

1. Install packages (glTFast, Input System, AI Navigation). Say Yes if Unity asks to enable the new input backends.
2. HDRP Wizard > Fix All, and the DirectX 12 / DXR tab too (ray tracing on the RTX card).
3. Build materials.
4. Download... 4K (about 2 GB). The 5 cgbookcase sets are optional browser downloads.
5. Fix animation import.
6. Build Calvera scene (minutes; builds the 4 km map, cars, people, police, shops, missions, HUD).
7. Import web save (optional), then Play.

## How it's built

- `Assets/Southbound/Core`: engine-free C# (game rules, world data, car bodies, damage, police, missions...),
  tested in the full repository with `dotnet test southbound-unity/Tools/CoreTests --filter "Category!=Online"`.
- `Assets/Southbound/Runtime`: MonoBehaviours (driving, people, police, HUD in UI Toolkit, shops, missions).
- `Assets/Southbound/Editor`: builders run from CalveraBuilder.Build, the setup window, the auto setup.
- `Data/`: the world, cars, streets, shops and missions exported from the web game
  (`node tools/southbound/export-unity.mjs ...` in the full repository).
- HDRP types are reached by reflection (`Editor/Hdrp.cs`, `Runtime/PerformanceTier.cs`) so the code compiles
  without HDRP's assemblies; Unity 2022.2+/6-only APIs sit behind `#if UNITY_2022_2_OR_NEWER` / `UNITY_6000_0_OR_NEWER`.
- Unity space mirrors the web game's x (`CalveraWorld.ToUnity`); web heading h is Unity yaw -h.

## Rules from the owner

- Original work only: no copying any existing game's names, characters, art, music or look. Only CC0 / CC-BY /
  MIT assets, credited in `site/southbound/CREDITS.md`. Real-world simulation: no sci-fi, no magic.
- The owner isn't a programmer: plain language, one step at a time, say exactly which button to press. They
  often send phone photos of the screen.
- Be honest about what works and what hasn't been tried. Don't touch `dragons-kingdom/` in the full repository
  (another project).
- Commits (in a clone of the repository): branch `claude/ultimate-ai-legend-KhpoT`; no model names in commit
  messages; no pull requests unless asked.
