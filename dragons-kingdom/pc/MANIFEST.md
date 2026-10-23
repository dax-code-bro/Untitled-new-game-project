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
| Git | the PC's own Git, else portable MinGit 2.55.0(5) in `%LOCALAPPDATA%\DragonsKingdom\mingit` (pinned, SHA-256 checked; no installer and no administrator password) | about 50 MB | setup script, step 1 | 1 min | clone + `git pull` of new scene files |
| Node.js **always the pinned 22.22.0 LTS** (`render/lib/pins.mjs`), never the PC's own: the landscape bakes and the renders run on exactly the Node.js the cloud uses | `pc/tools/node` (official nodejs.org archive, pinned SHA-256 below), first on PATH in the setup and the launchers | about 90 MB | setup script, step 2 | 1 min | everything; `pc/build-caches.mjs` refuses to bake the landscape on another Node.js (`--any-node` overrides) and `render/episode.mjs` prints a note when it runs on another one |
| ffmpeg + ffprobe with libx264 | `pc/tools/ffmpeg`: Windows and Linux always the **pinned** ffmpeg 8.1.3 build below (SHA-256 checked; `pc/tools/ffmpeg/.dk-pin` names it; `render/lib/tools.mjs` uses it before any other ffmpeg). macOS: Homebrew's or evermeet.cx's, **not pinned** | 193 MB download, about 450 MB unpacked (Windows); 150 MB (Linux) | setup script, step 3 | 1-3 min | encoding chunks, scene files, the episode |
| npm packages (three 0.180.0, Playwright 1.56.1) | `node_modules/` | 46 MB | `npm ci` | 30 s | everything |
| Playwright Chromium (build 1194) + headless shell | `%LOCALAPPDATA%\ms-playwright` (Windows), `~/Library/Caches/ms-playwright`, `~/.cache/ms-playwright` | 597 MB + 323 MB | `npx playwright install chromium` | 1-2 min | drawing the frames (WebGL2 on the GPU) |
| Python 3.11 (64-bit) | system (`py -3.11`, `python3.11`), else private via uv 0.5.11 (pinned SHA-256 below; `%LOCALAPPDATA%\DragonsKingdom\python`, `pc/tools/python`) | about 100 MB | setup script, step 5 | 1 min | Blender cloth / character builds |
| Blender's Python module bpy 4.2.0 + numpy 2.4.6 (`pc/requirements-bpy.txt`) | `pc/.venv-bpy` (Windows: `%LOCALAPPDATA%\DragonsKingdom\venv-bpy` when the project path is long; recorded in `pc/.bpy-python`) | 1.6 GB (wheel download: 315 MB Windows, 208-221 MB macOS, 519 MB Linux) | setup script, step 5 | 3-5 min | the four bpy cache families below |
| **Asset library** | | | | | |
| HDRIs, photo-scanned PBR materials, scanned models, MakeHuman base data (115 entries in `assets-lib/manifest.json`; 52 "available", every file SHA-256 checked) | `assets-lib/hdri`, `pbr`, `model`, `human`, `texture` | 872 MB (hdri 261, pbr 406, human 171, model 35 MB) | `node assets-lib/fetch.mjs` | 1-5 min | every set |
| 63 more Poly Haven / ambientCG assets (status "blocked": that cloud machine's network refuses those hosts; a home connection does not) | same folders | about 1.5-2 GB (ambientCG zips: 142 MB) | `node assets-lib/fetch.mjs` (the same command - it resolves them through the Poly Haven API; failures there are reported, not fatal) | 5-15 min | nothing yet (no scene uses them); downloaded so later scenes can |
| **Caches baked from the code** | | | | | |
| Human characters: 48 ids (Remi, Abby, Alexandria, Fall, the king, riders, crowd, children...) - MakeHuman body + Blender cloth garments + hair + props + baked AO | `scenes/lib/humans/cache/<id>.json + .bin` | 1.1 GB | `node pc/build-caches.mjs --only humans` (runs `scenes/lib/humans/offline/build.py --only <id>` with bpy, several at once, resumable per character) | 1.5-2 h on 4 cores; close-up characters 4-14 min each (guard1 measured: 80 s) | every shot with people |
| Landscape: Verdor coast land + cliff tiles (LOD 0-3), prologue island, the land around Cling (Node, seeded erosion) | `scenes/lib/nature/cache/verdor` (404 MB: tiles 397 MB), `island` (7.4 MB), `cling` (7.5 MB) | 419 MB | `node pc/build-caches.mjs --only nature` (the four commands in `scenes/lib/nature/README.md`, in that order) | 14.6 min measured in a clean clone (land 1m22, cliffs 10m04, island 1m19, Cling 1m52) | coast, flight, Cling sets |
| Architecture cloth bakes: the nest linen, the treatment-room table cloth (bpy) | `scenes/lib/architecture/cache/*.json` | 160 KB | `node pc/build-caches.mjs --only architecture` (`offline/nest_cloth.py`, `table_cloth.py`) | 1m25 measured | birthing chamber, treatment room |
| Prop cloth bakes: prologue sail (full / eased), market awnings, counter cloth, banners (still / breeze / gust), 6 pennants (bpy) | `scenes/lib/props/cache/*.json` | 484 KB | `node pc/build-caches.mjs --only props` (`offline/sail.py`, `drapes.py`) | 2m28 measured | prologue boat, Cling festival |
| Credits typeface EB Garamond Regular + Medium (SIL Open Font License 1.1), from the npm package `@expo-google-fonts/eb-garamond` 0.4.2 (tarball SHA-256 `93abd91dcb1c60d2bfceb8992567f00054372b90638163de6fdf33f2d73c2b4a`, 3,568,844 bytes; each .ttf SHA-256 checked, `render/lib/fonts.mjs`) | `pc/tools/fonts/` | 1.1 MB (3.6 MB download) | `node pc/build-caches.mjs --only fonts` (also on first use by the credits card) | 5 s | the end credits: the same letters on every computer |
| Dragons / creatures (Charcoal, Leaf, Starlight, the hatchling, the scout) | - | 0 | nothing: built procedurally from `scenes/lib/creatures` in each scene's `setup()` (the "setup" seconds per shot) | - | - |
| **Optional** | | | | | |
| Kokoro-82M voice models `kokoro-v1.0.int8.onnx` + `voices-v1.0.bin` (Apache-2.0, SHA-256 checked) | `episodes/s01e01/preview/.cache/kokoro/` | about 115 MB | `node pc/build-caches.mjs --only voice` (or setup with `-WithVoice` / `--with-voice`) | 1 min | only for making computer voice takes (`preview/tools/make_vo.py`, its own Python venv: `preview/tools/requirements-vo.txt`, plus espeak-ng and SoX); **not** needed to render pictures |
| Preview voice takes, preview mix and stems (`preview/vo/*.wav`, `preview/mix/`) | `episodes/s01e01/preview/` | about 190 MB | `preview/tools/make_vo.py`, `build_soundtrack.py` | - | the work-in-progress preview only, not the final episode |
| **Sound (never in git; see "Sound" below)** | | | | | |
| Final voice takes of the shooting script: 384 takes + 5 placeholders, 48 kHz 24-bit mono WAV (`final/vo/takes.json` lists each with its SHA-256) | `episodes/s01e01/final/vo/` | 90 MB (389 files) | made on the cloud by `final/tools/make_final_vo.py`; reaches the PC as package `final-vo` (`node pc/build-caches.mjs --only sound`) | 1 min download | mixing the sound (wherever the mix is made); **not** needed to render pictures |
| The episode's sound mix `S01E01_mix.wav` (or `scenes/<scene>.wav`) + `S01E01.en.srt` | `episodes/s01e01/final/audio/` (git-ignored for sound files) | about 1 GB (55 min, 48 kHz 24-bit stereo) | **not made yet**; reaches the PC as package `mix` | a few minutes | the sound of the scene files and the episode |
| **Per machine** | | | | | |
| GPU launch profile found by gpu-check | `pc/.dk-gpu.json` | 1 KB | `pc\GPU-Check.cmd` (Windows), `bash pc/render-episode.sh --gpu-check` (macOS / Linux), or `node render/gpu-check.mjs` | 1-5 min | `--gpu`, `npm run episode` |
| Benchmark result (`--workers auto`) | `.dk-tuning.json` | 1 KB | `npm run bench` | 5-10 min | optional |
| Logs | `pc/logs/` | small | every setup / gpu-check / cache / episode run | - | sending back to the Claude session: `pc\Send-Logs.cmd` (or `node pc/collect-logs.mjs`) puts the newest of each, the PC's details and the render status into one file, `pc/logs/send-to-claude-<date>.txt`, with the user folder's name replaced by `~` |
| Windows graphics preference "High performance" for Node.js, Playwright's `chrome.exe` and `headless_shell.exe` | registry, per user: `HKCU\Software\Microsoft\DirectX\UserGpuPreferences` (what Settings > System > Display > Graphics writes; no administrator) | - | setup script (before the GPU check) and every start of `pc\Render-Episode.cmd` / `GPU-Check.cmd` (a new Chromium build lands in a new folder) | - | laptops with two graphics chips; no effect with one card |
| Sound downloads in progress | `pc/downloads/` | up to the archive size | `pc/build-caches.mjs` (removed after unpacking) | - | - |
| **Render output** | | | | | |
| Shots (10-bit CRF 12 intermediates) | `output/episode1/shots/<scene>/<shot>/` | about 0.3-0.6 MB per frame: 21-42 GB for the episode (`episodes/s01e01/final/render-schedule.md`) | `npm run episode` | the render | scene files |
| Scene files (10-bit CRF 16 + sound) + `.en.srt` | `output/episode1/scenes/<scene>.mp4` | about 0.15-0.3 MB per frame: 11-23 GB | `npm run episode` | 5-60 min encoding each | the episode |
| The episode: `DragonsKingdom_S01E01_4K.mp4` (10-bit, subtitles), `..._1080p.mp4` (8-bit, phones and TVs), `.en.srt` | `output/episode1/` | about 11-23 GB + 2-4 GB | `npm run episode` (when every scene is done) | 1-3 h | watching |

## Pinned downloads (the setup checks each SHA-256 before using the file)

| What | Exact file | SHA-256 |
|---|---|---|
| MinGit (Windows, only if the PC has no Git) | `https://github.com/git-for-windows/git/releases/download/v2.55.0.windows.5/MinGit-2.55.0.5-64-bit.zip` (2026-08-20) | `56d7b226b7693196cfc71fef26568f536c4a021ab6c37ff2db4287bed908e96e` |
| ffmpeg 8.1.3, Windows x64 | `https://github.com/BtbN/FFmpeg-Builds/releases/download/autobuild-2026-09-30-13-08/ffmpeg-n8.1.3-9-g29e619e767-win64-gpl-8.1.zip` | `7b801cdd3a1a0bb54ae6f572187e68b4ed54f52086cfee133fab2180bfb429fa` |
| ffmpeg 8.1.3, Linux x64 | same release, `ffmpeg-n8.1.3-9-g29e619e767-linux64-gpl-8.1.tar.xz` | `97ce978979194b5cf7e06a5e68020dbdaa7a4f3294c5452b6a1bc347100dbb79` |
| ffmpeg 8.1.3, Linux arm64 | same release, `ffmpeg-n8.1.3-9-g29e619e767-linuxarm64-gpl-8.1.tar.xz` | `10523d1e0be6b3ce62a9708cc50815c4b5eb5f36ae147fbe2afeecda6f2d6845` |
| Node.js 22.22.0, Windows x64 (always) | `https://nodejs.org/dist/v22.22.0/node-v22.22.0-win-x64.zip` (2026-01-12) | `c97fa376d2becdc8863fcd3ca2dd9a83a9f3468ee7ccf7a6d076ec66a645c77a` |
| Node.js 22.22.0, Linux x64 / arm64 | same folder, `node-v22.22.0-linux-x64.tar.xz` / `-linux-arm64.tar.xz` | `9aa8e9d2298ab68c600bd6fb86a6c13bce11a4eca1ba9b39d79fa021755d7c37` / `1bf1eb9ee63ffc4e5d324c0b9b62cf4a289f44332dfef9607cea1a0d9596ba6f` |
| Node.js 22.22.0, macOS arm64 / x64 | same folder, `node-v22.22.0-darwin-arm64.tar.xz` / `-darwin-x64.tar.xz` | `2bd596bbfc4a275ceb8721a5954ee97daea5ebe673e96a185ebd732f6fb023ac` / `48bc437e00e0c1483da34c21dca196efcb8d22e5dcb0bc7c65386afb00fabb85` |
| uv 0.5.11, Windows x64 (only if there is no Python 3.11) | `https://github.com/astral-sh/uv/releases/download/0.5.11/uv-x86_64-pc-windows-msvc.zip` | `3e8203e6434b45427f20824419f8d8d53f970a76d94ccdcad07f8498fa01a9d0` |
| uv 0.5.11, Linux x64 / arm64 | same release, `uv-x86_64-unknown-linux-gnu.tar.gz` / `uv-aarch64-unknown-linux-gnu.tar.gz` | `14411de26cdea5f5139fafaf2b675b1c633e744dd49c6d6a9fc8817ec065158b` / `055c329c38a93c01d378349d51cb4d521d1998c8a79355ddc00f863ce451942f` |
| uv 0.5.11, macOS arm64 / x64 | same release, `uv-aarch64-apple-darwin.tar.gz` / `uv-x86_64-apple-darwin.tar.gz` | `695f3640d5b1a4e28de7e36e3a2e14072852dcc6c70bf9e4deec6ada00d516b4` / `7e23d1d892c23f9e74245c4fd3d3e246438ce9b34460f85eee61f784de137b0b` |

The Node.js and uv values are the publishers' own (`SHASUMS256.txt` on nodejs.org, the `.sha256` file next to each uv
asset); on 2026-10-23 the Windows Node zip, the Windows uv zip and the Linux x64 uv archive were downloaded on the cloud
machine and matched, and `pc/setup.sh` installed the pinned Linux Node from scratch. Node 20 reached its end of life in
April 2026, so a PC without Node gets 22 LTS (the version the cloud machine runs `npm test` with); a Node 20+ already on
the PC is still used.

The ffmpeg builds are BtbN's month-end build of 2026-09-30 from the 8.1 release branch. BtbN keeps
month-end builds for two years, and its `checksums.sha256` for that release lists the values above.
The Windows zip and the Linux x64 archive were downloaded on the cloud machine on 2026-10-18 and
matched; the Linux build was also tested there (libx264 present, 10-bit encode works). To move to a
newer ffmpeg, change the name and SHA-256 in both setup scripts and here in one commit; the next
setup run replaces `pc/tools/ffmpeg`. A Mac has no pinned build (BtbN makes none, and the Mac
download hosts cannot be reached from the cloud machine to fingerprint them), so a Mac's ffmpeg
version can differ: the setup log and every GPU-check log print it.

## Sound (how audio that is not in git reaches the PC)

`SERIES.md` section 2: audio masters are never committed. The route:

1. **Pack** on the computer that has the files: `node pc/pack-sound.mjs final-vo` (the takes in
   `episodes/s01e01/final/vo/`, checked against `takes.json` first) or `node pc/pack-sound.mjs mix`
   (every sound file in `episodes/s01e01/final/audio/` and `scenes/`, plus `S01E01.en.srt`). It
   writes one plain `.tar` to `output/delivery/`. The archive is deterministic: the same files give
   the same bytes and the same SHA-256.
2. **Publish**: upload the `.tar` to any free place with a direct download link (for example a
   GitHub release of this repository), then run `node pc/pack-sound.mjs <id> --record --url <link>`.
   That writes the archive's size and SHA-256, the link and, for the mix, every file's SHA-256 into
   `episodes/s01e01/final/audio/delivery.json`. Commit and push only that small JSON file.
3. **On the PC**, nothing extra to do: the desktop shortcut runs `git pull` and then
   `pc/build-caches.mjs`, whose `sound` step downloads the `.tar` into `pc/downloads/`, checks its
   SHA-256, checks every file in it against the list, puts only listed files in place (never outside
   their folder), and deletes the download. `render/episode.mjs` then adds the mix to finished
   scene files without rendering the pictures again.

Without an upload, copy the `.tar` or the folder (a USB stick, a cloud drive) and run
`node pc/build-caches.mjs --only sound --from <file.tar or folder>` on the PC. The same checks apply.
Nothing published yet is not an error: `build-caches` shows "not published yet" and the render
goes on with silent scene files. State on 2026-10-18: `final-vo` is packed and checked on the cloud
(`dk-s01e01-final-vo-60d54fe148a1.tar`, 94,586,368 bytes, SHA-256
`6c770b177f30df29c4652c958708bc5ae5a35ee5bec470cde45c227935890346`) but **not uploaded**; the mix
does not exist. The whole route (pack, download from a web server, unpack, a damaged archive, a
damaged file, paths that try to leave the folder) is checked by `npm run selftest:sound`
(`pc/selftest-sound.mjs`, a made-up package; 11 checks, all passing on 2026-10-23). Packing `final-vo` again on
2026-10-23 gave the same archive name, size and SHA-256 as on 2026-10-18.

## Disk space to plan for

| | |
|---|---:|
| tools (Node, ffmpeg, Chromium, bpy, Python) | about 3.5 GB |
| assets (all, including the Poly Haven / ambientCG set) + caches | about 4.5 GB |
| **tools, assets and caches** (the one figure the setup, the guide and `render-schedule.md` use) | **about 8 GB** |
| shots + scene files + the episode while rendering (`render-schedule.md`: 21-42 + 11-23 + 11-23 + 2-4 GB) | about 45-92 GB |
| **total** | **about 54-100 GB: plan for 100 GB** |

Measured on the cloud machine (2026-10-23): asset library 0.87 GB (the 63 blocked assets add about
1.5-2 GB at home), Chromium 0.92 GB, npm packages 0.05 GB, bpy 1.6 GB, human characters 1.1 GB,
landscape bakes 0.42 GB, props + architecture caches under 1 MB. While a cache package installs
(see "Cache packages"), its tar sits in `pc/downloads/` until it is unpacked: up to 1.1 GB more for a
few minutes (the human characters).

Shot files can be deleted once their scene file exists (`npm run episode` already deletes the
chunk folders); keep the scene files until the episode is assembled.

## Cache packages (the cloud's own caches, checked file by file)

The render PC should draw every shot with **exactly** the characters, landscape and cloth the shot was
reviewed with on the cloud, not with a rebuild that may differ (see "Reproducibility" below: the
awnings are not reproducible, and the cloud's character caches may be one code revision older). So
the cloud's caches travel the same way as the sound: a deterministic tar per family, with the SHA-256
of the archive and of every file in it recorded in git, in `pc/cache-delivery.json`.

- Cloud: `node pc/pack-caches.mjs humans|nature|architecture|props|all --record` packs and records;
  `--keep` keeps the tar for uploading, `--url FAMILY=URL` records where it is published.
- PC: `node pc/build-caches.mjs` installs a recorded package **before** it would rebuild that family:
  downloaded from its `url`, or from a copied tar with `--only humans --from <dk-cache-humans-....tar>`.
  Each file is checked against its SHA-256 before it is put in place; `<cache>/.dk-package.json`
  marks an installed package. `--rebuild` rebuilds from the code instead (the old way).
- Recorded on 2026-10-23 (packing the same files again gives the same bytes):

| Family | Files | Archive | Archive SHA-256 starts | Published |
|---|---:|---:|---|---|
| architecture | 2 | 158,720 bytes | `a2448e36` | not yet |
| humans | 96 | 1,113,728,512 bytes | `7bd9d82c` | not yet |
| nature | 2728 | 434,935,296 bytes | `4c22bbf5` | not yet |
| props | 14 | 476,672 bytes | `da3e009a` | not yet |

**Not published yet:** every `url` is `null`, so until the tars are uploaded somewhere the PC can
download from (a GitHub release of this repository is the obvious place, about 1.5 GB in all), the PC
still rebuilds and the differences listed under "Reproducibility" remain. Uploading needs Daxtyn's
go-ahead. The caches carry no build stamp (`provenance.build_stamp` says so): which code revision
made them is not recorded; their file dates are.

The render gate (below) locks each approved shot to the recorded packages
(`render/lib/gate.mjs`, `caches`): when a package is packed again with different files, the shots
approved with the old one wait for a new approval.

## The render gate (only approved shots become masters)

`episodes/s01e01/final/render-ready.json` (in git, written by `node render/gate.mjs approve ...` on
the cloud) lists the shots the director has approved, each with a lock: the SHA-256 of the scene
file, of the shot's entry, of every file the scene loads (its static import closure, the page and
runtime, the presets, data files; CRLF counts as LF), of the cache packages and, for the credits, of
`credits.txt`. `render/episode.mjs` renders a 4K master only for an approved shot whose files match
its lock; a shot changed after its approval waits for a new one; a re-approved shot is rendered
again and its scene joined again by itself; a withdrawn approval removes the shot from its scene
until it is approved again. Black cards need no approval. `node render/gate.mjs status` shows the
state, `check` exits 1 when an approved shot has changed since. `--ignore-gate` exists only for test
sizes (`--size`).

## Where each cache's "is it up to date?" comes from

`pc/build-caches.mjs` writes `<cache folder>/.dk-build.json` with a hash of the code that made each
piece (human characters: one entry per id; nature: per bake script, including the modules it
imports; architecture / props: per `offline/*.py` script). After a `git pull` that changes, for
example, `scenes/lib/humans/offline/garments.py`, the next run rebuilds the characters; a pull
that only changes scenes rebuilds nothing. Caches made by hand without a stamp (the cloud machine)
are accepted when their files exist.

Reproducibility (measured 2026-10-18 in a clean clone on the cloud machine, against the cloud's
own caches):

| Cache | Result |
|---|---|
| nature: land, island, Cling | byte-identical to the cloud's |
| nature: Verdor cliffs | all 2716 tiles byte-identical; `cliffs.json` differs only in its `bakedAt` time. The cloud's folder also holds 8 orphan tiles from an older bake that no scene lists |
| architecture: nest linen, table cloth; props: both sails, the pennants | byte-identical |
| props: market awnings (`drapes.py`) | **not reproducible**: two runs of the same code on the same machine differ by up to 75 mm per cloth vertex |
| humans (tested: guard1) | two builds on the same machine are byte-identical. They differ from the cloud's guard1, which was built at 01:28 on 2026-10-12, before the last change to `scenes/lib/humans/offline` (02:18 the same day). So the cloud's character caches may be one code revision behind the PC's |

Within one computer the awning difference does not matter, because every shot reads the same
cache. But the awnings, and any characters the cloud has not rebuilt, can differ in detail from
the cloud's previews. If a cache is rebuilt in the middle of the episode, finished shots keep
the old version: `npm run episode -- --status` lists them as stale, and `--rerender-stale`
renders them again.
