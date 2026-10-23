# Episode 1 end credits: where each line comes from

`credits.txt` (next to this file) is the text of the end credits. `render/episode.mjs` draws it as the 40-second roll
of shot E-01 (scene END), rolling up from below the bottom edge until the last line has left the top. Every line of
the file appears on screen, so the file holds no comments; the notes are here. `video-description.txt` holds the same
credits for the video's description, with the full CC BY attribution (source address, licence link, changes).

How the file is read (`render/lib/credits.mjs`): blocks are separated by blank lines. The first block is the title
(first line large, the rest smaller). In every other block the first line is the role heading (drawn small, in
letter-spaced capitals, warm grey) and the lines after it are names (larger, warm white); a block of one line is a
name line. Two or more blank lines make a larger gap (a new section).

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
| Coastal cliff composition: Babylon.js (CC BY 4.0), from Poly Haven assets (CC0); creativecommons.org/licenses/by/4.0; modified: pieces rearranged and rescaled | `assets-lib/CREDITS.md`, CC-BY-4.0 section: **required** credit, in its exact wording. CC BY 4.0 also asks for the licence link and a note that the work was changed: `scenes/lib/sets/kitbash.js` takes the composition apart and rearranges and rescales its pieces into new cliffs and shores. The source address is in `video-description.txt` |
| Credits typeface: EB Garamond (SIL Open Font License 1.1) | `render/lib/fonts.mjs`: the font the card is drawn with (crediting it is courtesy; the OFL does not require it on screen) |
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
4. **Length.** 40 s for the 50 lines rolls at 8 whole pixels per frame at 4K (192 pixels a second), so each line is on
   screen for about 11 s. If the text grows past about 90 lines, lengthen E-01 in the shot list rather than rolling
   faster.

## How the card is made

- `render/lib/credits.mjs` draws the whole roll ONCE as a still image, every line at a whole-pixel position, with
  FFmpeg's `drawtext` in one font, EB Garamond (SIL Open Font License 1.1). The font is the same file on every
  computer: `render/lib/fonts.mjs` downloads the pinned npm package `@expo-google-fonts/eb-garamond` 0.4.2 (tarball
  and both TTF files checked by sha256) into `pc/tools/fonts/` (git-ignored; the setup fetches it, `node
  pc/build-caches.mjs --only fonts`). Without it the card stops with a message; it never falls back to a system font.
- Sizes at 2160 lines: title 128 px, its second line 56 px, headings 38 px (capitals, letter-spaced), names 62 px.
- The roll moves up by the same whole number of pixels on every frame (FFmpeg `overlay`, y = y0 - n x S, worked out in
  4:4:4 so no row is rounded away). S is the smallest whole number that gets the roll through the 40 s; the time left
  over is black, split before the first and after the last line. With this text: 8 px per frame at 4K (192 px/s, each
  line about 11 s on screen), about 2 s of black at each end. At the 960x540 test size the rounding is coarser (3 px per
  frame, about 6 s of black at each end).
- The card belongs to the render gate like every shot (`render-ready.json`): when `credits.txt` changes, the card is
  made again only after the new text is approved (`node render/gate.mjs approve E-01 --by ...`).
- Checked on 2026-10-23: the card at 960x540 through `render/episode.mjs --only END --size 960x540 --ignore-gate`
  (contact sheet of six frames; every one of the 636 frames with text moved exactly 3 px), and two native 4K frames
  of the same roll (whole frame and 1:1 crops): legible, centred, nothing clipped, no missing glyphs.
