# Episode 1 end credits: where each line comes from

`credits.txt` (next to this file) is the text of the end credits. `render/episode.mjs` draws it, unchanged, as the
40-second roll of shot E-01 (scene END): white text on black, every line centred, rolling up from the bottom edge
until the last line has left the top. Every line of the file appears on screen, so the file holds no comments; the
notes are here.

The credits are a **proposal** like everything else that is not Daxtyn's own (`SERIES.md` section 5). Daxtyn decides
the wording. The rules the draft follows:

- the screenplay handoff: "Credit only actual contributors and assets. Do not invent a cast, production company,
  completed animation work, or licensed music." (`../screenplay.md`, end titles);
- `SERIES.md` section 4: CC BY assets must be credited in the end titles as `assets-lib/CREDITS.md` says;
- `SERIES.md` section 5: never blur who wrote what;
- `final/vo/README.md`: no computer voice is ever credited as a person.

## Sources, line by line

| Lines | Source |
|---|---|
| DRAGON'S KINGDOM, Season 1, Episode 1 | `../screenplay.md`, first two lines |
| Created by / Story by Daxtyn Sanches | `SERIES.md` sections 5 and 7; `../screenplay.md` ("Prepared for Daxtyn Sanches") |
| Additional scenes and dialogue drafted with Claude (Anthropic) | the 28 proposed additions and the rating pass in `screenplay-final.md` were written by Claude (`CHANGES.md`). If Daxtyn cuts every addition, this line goes too |
| Made with Claude (Anthropic) in Claude Code: ... | the scene code, the creature, human, architecture, nature and prop libraries, the voice processing (`tools/make_final_vo.py`) and the render pipeline (`render/`, `pc/`) were written by Claude in Claude Code sessions (see the git history) |
| Voices: Kokoro-82M by hexgrad (Apache License 2.0) | `vo/README.md`, Licences; `voices.json` |
| Skies and light: Greg Zaal, Alexander Scholten, Sergej Majboroda, Andreas Mischok (Poly Haven, CC0) | `assets-lib/manifest.json`, the 11 HDRIs with status "available" |
| Photo-scanned ground ... metal: Lennart Demes, ambientCG (CC0) | manifest: every `pbr/acg_*` entry |
| Stone and pebble materials: Rob Tuytel and the Poly Haven team (CC0) | manifest: `pbr/ph_white_sandstone_bricks_03`, `pbr/ph_sandstone_blocks_04`, `pbr/ph_floor_pebbles_01` |
| Coastal cliff composition: Babylon.js team (CC BY 4.0), from Poly Haven scans (CC0) | `assets-lib/CREDITS.md`, CC-BY-4.0 section: **required** credit |
| Leaf textures: Daniel Greenheck, EZ-Tree (MIT License) | `assets-lib/CREDITS.md`, MIT section |
| Human bodies ... skin: MakeHuman team / Data Collection AB (CC0) | manifest: every `human/*` entry |
| Dutch ship model: Poly Haven (CC0) | manifest: `model/ph_dutch_ship_medium` |
| Street lantern, fish, wicker: Khronos glTF Sample Assets (CC0) | manifest: `model/khr_lantern`, `model/khr_barramundifish`, `pbr/khr_wicker` |
| Free and open-source software | `package.json` (three.js 0.180.0, Playwright 1.56.1 with its Chromium), `pc/MANIFEST.md` (Node.js, FFmpeg 8.1.3 GPL build with x264, Blender's bpy 4.2, Python, NumPy), `vo/README.md` (kokoro-onnx, ONNX Runtime, eSpeak NG, phonemizer, SoX, SciPy) |

Assets in the manifest with status "blocked" (not downloaded yet) are not credited. Tools used only to check work
(pocketsphinx, the test runner) are not credited.

## Before the final render of the END card

1. **Remove what no finished shot uses.** The asset lines list the whole library that the sets draw from. When the
   episode is cut, drop any asset that no shot shows, and add any asset fetched later (with its licence from
   `assets-lib/manifest.json`; a CC BY asset must be credited exactly as `assets-lib/CREDITS.md` says).
2. **Sound.** The mix does not exist yet. If it uses music or sound effects from free libraries, add them with their
   licences. If people record lines (`voices.json` human_recordings), credit those who agree, by the name they choose
   (for anyone under 18, with a parent's OK).
3. **Questions for Daxtyn.**
   - `SERIES.md` section 7 says he writes the main story with ChatGPT. Whether the credits say so is his choice; the
     draft does not mention it.
   - Whether he wants a different credit for himself ("Written by", "Directed by"), or other names (people who helped).
4. **Length.** 40 s for about 70 lines rolls at about 211 pixels a second at 4K, so each line is on screen for about
   10 s. If the text grows past about 120 lines, lengthen E-01 in the shot list rather than rolling faster.

## How the card is made

- `render/episode.mjs` finds `credits.txt`, draws it with FFmpeg's `drawtext` (font size 56 px at 2160 lines, line
  spacing 34 px, every line centred with `text_align`, which needs FFmpeg 6.1 or newer; the pinned FFmpeg 8.1.3 has it),
  and records the file's hash. When `credits.txt` changes, the next run makes the card again and rejoins the END scene
  and the episode on its own; nothing else is rendered again.
- Font: the operating system's serif font (Windows and macOS: Georgia; Linux: DejaVu Serif). It is not shipped with the
  project, so the card can look slightly different on another computer. An open-licence font in the asset library would
  make it identical everywhere (not done yet).
- Keep the text plain ASCII (straight quotes, `-` instead of dashes): every font has those characters.
- Checked on 2026-10-23: the card rendered at 960x540 through `npm run episode -- --only END --size 960x540`, and one
  frame of the same filter at 3840x2160 (whole frame and 1:1 crop) - legible, centred, no clipped lines.
