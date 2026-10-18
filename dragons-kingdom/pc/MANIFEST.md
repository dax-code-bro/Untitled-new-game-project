# What a render needs that is NOT in git

Git holds only code, plans and small JSON. Everything below is made or downloaded on each
computer. **One command re-creates all of it:** `pc/setup-windows.ps1` (Windows) or `pc/setup.sh`
(macOS / Linux). After a `git pull`, `node pc/build-caches.mjs` rebuilds only what the pulled code
changed (the desktop shortcut / `pc/Render-Episode.cmd` does this before every render).
`node pc/build-caches.mjs --check` lists what is missing or out of date without changing anything.

Sizes were measured on the cloud machine (2026-10-18) unless marked "about". Times are for the
cloud machine (4 vCPU, no GPU); a gaming PC with 8-16 cores is usually 2-4 times faster on the
CPU-bound steps.

| What | Where | Size on disk | Rebuilt by | Time (first run) | Needed for |
|---|---|---:|---|---|---|
| **Tools** | | | | | |
| Git | system (winget `Git.Git`), or portable MinGit in `%LOCALAPPDATA%\DragonsKingdom\mingit` | about 300 MB / 50 MB | setup script, step 1 | 1-2 min | clone + `git pull` of new scene files |
| Node.js 20 LTS (any 20+ works) | system, or `pc/tools/node` (official nodejs.org zip, SHA-256 checked) | about 90 MB | setup script, step 2 | 1 min | everything |
| ffmpeg + ffprobe with libx264 | system, or `pc/tools/ffmpeg` (BtbN GPL build: Windows / Linux; Homebrew or evermeet.cx on macOS) | 200 MB download, about 450 MB unpacked (Windows) | setup script, step 3 | 1-3 min | encoding chunks, scene files, the episode |
| npm packages (three 0.180.0, Playwright 1.56.1) | `node_modules/` | 46 MB | `npm ci` | 30 s | everything |
| Playwright Chromium (build 1194) + headless shell | `%LOCALAPPDATA%\ms-playwright` (Windows), `~/Library/Caches/ms-playwright`, `~/.cache/ms-playwright` | 597 MB + 323 MB | `npx playwright install chromium` | 1-2 min | drawing the frames (WebGL2 on the GPU) |
| Python 3.11 (64-bit) | system (`py -3.11`, `python3.11`), else private via uv 0.5.11 (`%LOCALAPPDATA%\DragonsKingdom\python`, `pc/tools/python`) | about 100 MB | setup script, step 5 | 1 min | Blender cloth / character builds |
| Blender's Python module bpy 4.2.0 + numpy 2.4.6 (`pc/requirements-bpy.txt`) | `pc/.venv-bpy` (Windows: `%LOCALAPPDATA%\DragonsKingdom\venv-bpy` when the project path is long; recorded in `pc/.bpy-python`) | 1.6 GB (wheel download: 315 MB Windows, 208-221 MB macOS, 519 MB Linux) | setup script, step 5 | 3-5 min | the four bpy cache families below |
| **Asset library** | | | | | |
| HDRIs, photo-scanned PBR materials, scanned models, MakeHuman base data (115 entries in `assets-lib/manifest.json`; 52 "available", every file SHA-256 checked) | `assets-lib/hdri`, `pbr`, `model`, `human`, `texture` | 872 MB (hdri 261, pbr 406, human 171, model 35 MB) | `node assets-lib/fetch.mjs` | 1-5 min | every set |
| 63 more Poly Haven / ambientCG assets (status "blocked": that cloud machine's network refuses those hosts; a home connection does not) | same folders | about 1.5-2 GB (ambientCG zips: 142 MB) | `node assets-lib/fetch.mjs` (the same command - it resolves them through the Poly Haven API; failures there are reported, not fatal) | 5-15 min | nothing yet (no scene uses them); downloaded so later scenes can |
| **Caches baked from the code** | | | | | |
| Human characters: 48 ids (Remi, Abby, Alexandria, Fall, the king, riders, crowd, children...) - MakeHuman body + Blender cloth garments + hair + props + baked AO | `scenes/lib/humans/cache/<id>.json + .bin` | 1.1 GB | `node pc/build-caches.mjs --only humans` (runs `scenes/lib/humans/offline/build.py --only <id>` with bpy, several at once, resumable per character) | 1.5-2 h on 4 cores; close-up characters 4-14 min each | every shot with people |
| Landscape: Verdor coast land + cliff tiles (LOD 0-3), prologue island, the land around Cling (Node, seeded erosion) | `scenes/lib/nature/cache/verdor` (404 MB: tiles 397 MB), `island` (7.4 MB), `cling` (7.5 MB) | 419 MB | `node pc/build-caches.mjs --only nature` (the four commands in `scenes/lib/nature/README.md`, in that order) | 6-9 min | coast, flight, Cling sets |
| Architecture cloth bakes: the nest linen, the treatment-room table cloth (bpy) | `scenes/lib/architecture/cache/*.json` | 160 KB | `node pc/build-caches.mjs --only architecture` (`offline/nest_cloth.py`, `table_cloth.py`) | under 1 min | birthing chamber, treatment room |
| Prop cloth bakes: prologue sail (full / eased), market awnings, counter cloth, banners (still / breeze / gust), 6 pennants (bpy) | `scenes/lib/props/cache/*.json` | 484 KB | `node pc/build-caches.mjs --only props` (`offline/sail.py`, `drapes.py`) | 1-2 min | prologue boat, Cling festival |
| Dragons / creatures (Charcoal, Leaf, Starlight, the hatchling, the scout) | - | 0 | nothing: built procedurally from `scenes/lib/creatures` in each scene's `setup()` (the "setup" seconds per shot) | - | - |
| **Optional** | | | | | |
| Kokoro-82M voice models `kokoro-v1.0.int8.onnx` + `voices-v1.0.bin` (Apache-2.0, SHA-256 checked) | `episodes/s01e01/preview/.cache/kokoro/` | about 115 MB | `node pc/build-caches.mjs --only voice` (or setup with `-WithVoice` / `--with-voice`) | 1 min | only for making computer voice takes (`preview/tools/make_vo.py`, its own Python venv: `preview/tools/requirements-vo.txt`, plus espeak-ng and SoX); **not** needed to render pictures |
| Preview voice takes, preview mix and stems (`preview/vo/*.wav`, `preview/mix/`) | `episodes/s01e01/preview/` | about 190 MB | `preview/tools/make_vo.py`, `build_soundtrack.py` | - | the work-in-progress preview only, not the final episode |
| **Per machine** | | | | | |
| GPU launch profile found by gpu-check | `pc/.dk-gpu.json` | 1 KB | `npm run gpu-check` | 1-5 min | `--gpu`, `npm run episode` |
| Benchmark result (`--workers auto`) | `.dk-tuning.json` | 1 KB | `npm run bench` | 5-10 min | optional |
| Logs | `pc/logs/` | small | every setup / gpu-check / cache / episode run | - | sending back to the Claude session |
| **Render output** | | | | | |
| Shots (10-bit CRF 12 intermediates) | `output/episode1/shots/<scene>/<shot>/` | about 0.3-0.6 MB per frame: 25-45 GB for the episode | `npm run episode` | the render | scene files |
| Scene files (10-bit CRF 16 + sound) + `.en.srt` | `output/episode1/scenes/<scene>.mp4` | about 0.15-0.3 MB per frame: 12-23 GB | `npm run episode` | 5-60 min encoding each | the episode |
| The episode: `DragonsKingdom_S01E01_4K.mp4` (10-bit, subtitles), `..._1080p.mp4` (8-bit, phones and TVs), `.en.srt` | `output/episode1/` | about 12-23 GB + 2-4 GB | `npm run episode` (when every scene is done) | 1-3 h | watching |

## Disk space to plan for

| | |
|---|---:|
| tools (Node, ffmpeg, Chromium, bpy, Python) | about 3.5 GB |
| assets (all, including the Poly Haven / ambientCG set) + caches | about 4.5 GB |
| shots + scene files + the episode while rendering | about 60-90 GB |
| **total** | **about 70-100 GB** |

Shot files can be deleted once their scene file exists (`npm run episode` already deletes the
chunk folders); keep the scene files until the episode is assembled.

## Where each cache's "is it up to date?" comes from

`pc/build-caches.mjs` writes `<cache folder>/.dk-build.json` with a hash of the code that made each
piece (human characters: one entry per id; nature: per bake script, including the modules it
imports; architecture / props: per `offline/*.py` script). After a `git pull` that changes, for
example, `scenes/lib/humans/offline/garments.py`, the next run rebuilds the characters; a pull
that only changes scenes rebuilds nothing. Caches made by hand without a stamp (the cloud machine)
are accepted when their files exist.

Determinism (measured 2026-10-18 in a clean clone on the cloud machine): the architecture bakes
(nest linen, table cloth), the prologue sails and the pennants came out **byte-identical** to the
cloud's caches. The market-awning bake (`scenes/lib/props/offline/drapes.py`) is **not
reproducible**: two runs of the same code on the same machine differ by up to 75 mm per cloth
vertex (Blender's cloth solver with collisions is not deterministic). The human characters also
use Blender cloth, so expect small fold differences there too. Inside one computer this does not
matter, because every shot reads the same cache. But the awnings and clothes on the PC can differ in
fold detail from the cloud's previews. If a cache is rebuilt in the middle of the episode, finished
shots keep the old folds: `npm run episode -- --status` lists them as stale, and
`--rerender-stale` renders them again. The nature bakes are seeded JavaScript and should give the
same bytes everywhere (see the clean-clone check in the report).
