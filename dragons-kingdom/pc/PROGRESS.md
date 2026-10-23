# PC render kit: progress (for whoever picks this up next)

Owner: the pc-render track. Also owns `render/episode.mjs` (with additive care: other tracks own
`render/lib/presets.mjs`), the docs in `episodes/s01e01/final/`, `episodes/s01e01/tools/check_final.py`,
`SERIES.md` sections 5, 6 and 9, and `CHARACTERS.md`.

Daxtyn's render PC: `pc/TARGET.md` (Windows, RTX 4090, about 2 TB free). Nothing has run on it yet. The kit has run on
a real Windows machine without a GPU: GitHub's `windows-latest` (workflow `pc-kit-windows`, see below).

## Files

| File | What it is |
|---|---|
| `RENDER_ON_YOUR_PC.md` | The guide for Daxtyn (written for a young non-programmer). |
| `MANIFEST.md` | Everything a render needs that is not in git, how it is rebuilt, the pinned downloads with SHA-256, the sound route, disk. |
| `setup-windows.ps1` (+ `Setup-Windows.cmd`) | One-command Windows setup (`irm ... \| iex` or double-click). `SETUP RESULT` / exit code: 0 ok, 1 stopped, 2 no GPU, 3 picture DIFFERENT or heavy frame failed, 4 GPU check crashed, 5 test render failed. The `.cmd` launchers pass the code on. |
| `setup.sh` | The same for macOS / Linux. |
| `render-episode.ps1` (+ `Render-Episode.cmd`, `GPU-Check.cmd`, `Send-Logs.cmd`), `render-episode.sh` | git pull + caches + `render/episode.mjs`; `--gpu-check`; `--send-logs`; `--status`. |
| `build-caches.mjs` | Builds / checks every non-git cache (stamps with code hashes); installs a recorded cache package before rebuilding (`--from <tar>`, `--rebuild`); family `sound` installs published sound packages; family `fonts` the pinned credits font. |
| `pack-caches.mjs`, `cache-delivery.json` | The cloud's caches as SHA-256-pinned packages (every file listed). Recorded 2026-10-23, **not published** (url null). |
| `reference-image.json` | The GPU check's picture references (thumbnail + two 1:1 crops + the reference frame's own NaN counts) for f2-velocity, f5-cling, lookdev-coast, test-kingdom, rendered on the cloud machine. |
| `../render/gate.mjs`, `../render/lib/gate.mjs`, `../episodes/s01e01/final/render-ready.json` | The render gate: only approved shots whose files match their lock become masters. |
| `../render/lib/picture.mjs` | The picture comparison (PSNR / SSIM / crops / black-white / NaN). |
| `../render/lib/credits.mjs`, `../render/lib/fonts.mjs` | The credits roll (one still, whole-pixel scroll) and the pinned EB Garamond font. |
| `../test/pc-kit.test.mjs` | Kit tests inside `npm test` (launchers, Windows messages, gate, privacy, Node pin, picture). |
| `../../.github/workflows/pc-kit-windows.yml` | The kit on GitHub's `windows-latest` (setup, GPU check, picture check, kit tests, self-test, Send-Logs privacy). |
| `sound-delivery.mjs`, `pack-sound.mjs` | Sound that never goes through git: deterministic tar + SHA-256 per file, `episodes/s01e01/final/audio/delivery.json`. |
| `collect-logs.mjs` | One text file for the Claude session (`pc/logs/send-to-claude-<date>.txt`), user folder replaced by `~`. |
| `selftest-episode.mjs`, `selftest-sound.mjs` | `npm run selftest:episode` (episode runner, runs 0-8: gate, render, stop, resume, assemble, credits change, drift after approval, re-approval, revoke), `npm run selftest:sound` (11 checks). |
| `reference-cpu.json` | The cloud CPU's speed on the GPU-check frames (the GPU check divides by it). |

## The 2026-10-18 review: 18 issues, state on 2026-10-23

| # | Issue | State | Where / how verified |
|---|---|---|---|
| 1 | setup hid native tool output / wrong exit code | fixed | `Invoke-Tool` (Out-Host + transcript). pwsh 7.4 run in a mirror (`José` user folder): all tool output on screen and in `pc/logs/setup-*.log` (25 PASS lines of the self-test in the log), exit code 2 without a GPU. `irm \| iex` probe: no `exit`, session stays open. |
| 2 | `npm run gpu-check` may not be on PATH | fixed | `GPU-Check.cmd`; guide, `render/episode.mjs --help`, the self-test hint and the GPU banner name `pc\GPU-Check.cmd` on Windows (`render/lib/gpu.mjs` gpuCheckCommand). |
| 3 | lock the CONTENT of the approved death blocks | fixed | `check_final.py` proof 1g: `APPROVED_RATING_TEXT` (exact story lines) + `APPROVED_RATING_SHA256`; `--selftest` catches a reworded block, a cut picture and an edit of the table. |
| 4 | keep-awake during the long setup | fixed | `Set-KeepAwake` now covers the whole setup (top level, released in `finally`), render window too. |
| 5 | QuickEdit freeze on Windows 10 | fixed | `Disable-QuickEdit` in the setup and the render launcher (restored at the end); guide says "press Esc". Not testable on Linux (no console API): the P/Invoke fails there and is skipped. |
| 6 | sound must not commit audio masters | fixed + verified | `.gitignore` in `final/audio` and `final/vo`; no audio in `git ls-files`; `npm run selftest:sound`; re-packing `final-vo` reproduced the recorded SHA-256. |
| 7 | pin + SHA-256 ffmpeg and MinGit | fixed, extended | MinGit 2.55.0(5), ffmpeg 8.1.3 (Windows, Linux x64/arm64), and now also Node.js 22.22.0 and uv 0.5.11 for every platform; Node and uv values downloaded and matched on 2026-10-23. |
| 8 | Git via winget may need admin | fixed | portable MinGit in `%LOCALAPPDATA%`, no winget, no installer. |
| 9 | `.cmd` launchers rewritten by `git pull` while running | fixed | every `.cmd` is one parenthesised block (now ending in `exit /b !DK_RC!`, see the 2026-10-23 review, #8); `pc/.gitattributes` keeps them CRLF (`-text`); no `<`/`>` in their comments. |
| 10 | non-ASCII Windows user names in saved paths | fixed | UTF-8 (no BOM) `.bpy-python`; the setup log is copied byte for byte; `PYTHONUTF8=1` for every Python child of `build-caches.mjs`; verified with `.../José/python`. |
| 11 | guide gaps for a young non-programmer | fixed | rewritten guide: the four buttons, how to open the folder, where chrome.exe is, the Claude desktop app and `claude remote-control` (from the current docs), what to send back (`Send-Logs.cmd`). The setup now sets the Windows graphics preference itself. |
| 12 | rating lint only matched names | fixed | titles/kinship words, drinking words, pronoun context (rule 6b), cue directions `[to Abby]`, new-death lint (6d); reviewed hits listed with reasons (`REVIEWED_CONTEXT`). |
| 13 | approval markers vs SERIES.md section 5 | fixed | section 5 now describes the approval marker in the production copy and no markers in the reading copy; the reading copy also drops the `[creator-approved wording ...]` cue marker. |
| 14 | CHARACTERS.md "reigning" queen | fixed | quotes the handoff's own words; "reigning" and adulthood marked as **Inference**; the left arm marked as the handoff's production choice. |
| 15 | render PC "unknown" in SERIES.md s9 and render-schedule.md | fixed | both cite `pc/TARGET.md`; render-schedule has "On Daxtyn's PC": time scenarios 25-250x (about 1-5 days, NOT measured) and the 2 TB disk plan. |
| 16 | SERIES.md section 6 out of date | fixed | lists `check_final.py` (+ `--selftest`), `build_final_breakdown.py --check`, the extended-edition checks, the PC kit self-tests; `npm test` = 33 tests (2026-10-23). |
| 17 | stale voice-take notes | fixed | `final/PROGRESS.md`; `voices.json` via `tools/final_voices.py` (only notes changed; `vo/takes.json` still records the previous voices.json sha256 until `make_final_vo.py` runs again). |
| 18 | end-credits text missing | fixed (card redone 2026-10-23, below #5) | `final/credits.txt` (+ `credits-notes.md`); the card is made again when the text changes (and is approved). |

## The 2026-10-23 review: 12 defects, state on 2026-10-23 (evening)

Most important first. Each was reproduced before it was fixed; parts that were wrong are rejected with the reason.

| # | Defect | State | Where / how verified |
|---|---|---|---|
| 1 | no render gate: the PC would master shots nobody approved (high) | fixed | Reproduced: 78 shots would have rendered. Now `episodes/s01e01/final/render-ready.json` + `node render/gate.mjs approve/revoke/status/check`; lock = scene file, shot entry, the scene's whole static import closure (page, runtime, presets, data files; CRLF = LF), cache packages, credits text. `render/episode.mjs` masters only approved + unchanged shots, waits on drift, re-renders and re-joins on re-approval, drops a revoked shot from its scene; black cards exempt; `--ignore-gate` only with `--size`. Verified: selftest runs 0-8 (50 s), pc-kit test 5, `gate.mjs status` today: 0 approved, 76 ready but not approved, 648 waiting for scene files. |
| 2 | GPU check measured speed only, never the picture (high) | fixed | `render/lib/picture.mjs` + `pc/reference-image.json`: 192x108 thumbnail PSNR/SSIM, two 96x96 1:1 crops, pure black/white share, NaN/Inf per float buffer (against the reference frame's own counts), shader errors. Verdict SAME PICTURE / SMALL DIFFERENCES / DIFFERENT, exit 3, and `render/episode.mjs` will not start masters after DIFFERENT until `--accept-gpu-picture`. Limits calibrated on F2 frame 48 vs 49 (41.5 dB / 0.993; crops 25.2 and 30.5 dB). Chat JPG (frame + two crops) looked at for f2, f5, coast, kingdom. F5 found 96 NaN in its `scene` buffer on the cloud itself (hidden by the post chain): reported to the director track; the check treats the same count as a note. pc-kit test 8 (grain passes; darker, black block, lost texture, new NaN, shader errors are caught). Windows SwiftShader against the Linux reference (CI run 3, 40019810790): the coast frame is **bit-identical** (thumbnail and both crops PSNR infinite), SAME PICTURE, 10.14 s per 4K frame; so any difference a real GPU shows is the GPU's. |
| 3 | caches rebuilt on the PC may differ from the reviewed ones; Node.js not pinned (medium) | fixed, **not published** | `pc/pack-caches.mjs` (deterministic tar, every file's SHA-256) + `pc/cache-delivery.json` (4 families, 2,840 files, 1.55 GB); `build-caches.mjs` installs a package before rebuilding (`--from`, marker `.dk-package.json`, `--rebuild`). Reproduced first: the caches carry no build stamp (humans written 01:28-02:16, the last humans code change 02:18). Uploading the 1.5 GB of tars needs Daxtyn's go-ahead (rejected doing it unasked); until then the PC rebuilds. Both setups now always install Node 22.22.0 (`render/lib/pins.mjs`; pc-kit test 7; CI: `node v22.22.0` from `pc\tools\node`). |
| 4 | rating lint gaps; CHANGES.md overstated it (medium) | fixed | Reproduced: every probe passed the old lint. New: drink/tobacco/drug/intimacy words, kinship and rank words, second-person pronouns, a three-paragraph scope that ends when an adult is named, cue rule 6c (call + vice word, or offer + vice word nearby), gentle death words. `--selftest`: 17 broken copies + 1 table edit, all caught. Rejected: "the attendant" as protected (ATTENDANT is the adult at the nest in this script). CHANGES.md now says it checks wording, not meaning. |
| 5 | credits: CC BY wording, font, judder, one style (medium) | fixed | CC BY block with title, author, licence, link and "modified"; the full attribution with the source URL in `final/video-description.txt`. EB Garamond (OFL) from a pinned npm tarball (SHA-256 per file). The roll is drawn once and moves a whole number of pixels per frame (measured: exactly 3 px on all 636 text frames at 540p; 8 px at 4K). Two styles: role headings small, capitals, letter-spaced, grey; names larger, warm white. Looked at: contact sheet, 960x540 frame, 4K frames and 1:1 crops. Still a proposal for Daxtyn. |
| 6 | Windows messages said "npm run ..." (medium) | fixed | `renderCommand()` / `gpuCheckCommand()` in `render/lib/gpu.mjs`; pc-kit test 4 runs help, status, the no-GPU stop and the GPU banner as win32 and fails on "npm run". |
| 7 | no Windows test at all (medium) | fixed | `.github/workflows/pc-kit-windows.yml`. Run 1 (40018349188): Setup-Windows.cmd exit 0 in 73 s with Git hidden (MinGit 2.55.0, Node 22.22.0 and ffmpeg 8.1.3 downloaded and SHA-256 checked; Playwright's Chromium 1194 and bpy 4.2 installed), GPU-Check showed GPU NOT USED (Microsoft Basic Render Driver) **but GPU-Check.cmd returned 0, not 2**: a real launcher bug, fixed (#8). Runs 2 (40019699952) and 3 (40019810790) passed every step: GPU-Check.cmd exit code 2; picture SAME PICTURE; the 8 kit tests on win32 with the PowerShell parse test running (pwsh is there); selftest-episode runs 0-8 all PASS in 39 s; Send-Logs privacy (#11). Not covered there: a real GPU, an interactive console, Explorer. |
| 8 | setup exit codes and banner; SETUP RESULT not in the logs file (low) | fixed | Codes 0-5 in both setups, `SETUP RESULT: n - ...` banner (also on the stop path), `collect-logs` puts SETUP RESULT / GPU CHECK / PICTURE on top (seen in CI run 1). The `.cmd` launchers lost the code (`exit /b` after `pause` gave 0 on windows-latest): now `call set DK_RC=%%ERRORLEVEL%%` right after powershell and `exit /b !DK_RC!`. |
| 9 | the launcher invariants were not tested (low) | fixed | pc-kit tests 1-2 (CRLF, one block, the exit code line, ASCII, git eol) and 3 (pwsh parse, where pwsh exists; CI runs the kit tests on Windows). |
| 10 | guide gaps (low) | fixed | How to open PowerShell in a folder (address bar, `powershell`; or Open in Terminal); the Windows Security exclusion tip removed (no admin anywhere, every UAC prompt is a No); `chromium-<number>`; drag the GPU-check picture into the chat; PICTURE CHECK and `--accept-gpu-picture`; SETUP RESULT codes; the gate's "not approved yet"; one disk figure (tools, assets and caches about 8 GB, up to about 100 GB in all) in the guide, MANIFEST, the setup and the GPU check. |
| 11 | Send-Logs privacy (low) | fixed | `makePrivacy()`: the user folder in any letter case, its 8.3 short form, TEMP, user name and computer name; pc-kit test 6; CI run 3 on Windows: the Send-Logs file holds none of the user folder `C:\Users\runneradmin`, its 8.3 form `C:\Users\RUNNER~1`, TEMP, the user name or the computer name (`~` stands for the user folder 4 times). |
| 12 | `vo/takes.json` named an old `voices.json` (low) | fixed | `final/tools/refresh_vo_sources.py` found the old file in git, proved only notes changed (same render digest), checked all 389 WAVs and rewrote only `sources`; `--check` passes. |

## How to check the kit (all on the cloud machine)

```bash
npm test                                   # 41 tests (1 skipped without pwsh), ~4 min (pc-kit tests: node --test test/pc-kit.test.mjs, ~2 s)
npm run selftest:episode -- --cpu          # ~50 s (runs 0-8)
npm run selftest:sound                     # < 1 s
node pc/build-caches.mjs --check
node render/gate.mjs check                 # exit 1 if an approved shot changed since its approval
python3 episodes/s01e01/tools/check_final.py && python3 episodes/s01e01/tools/check_final.py --selftest
python3 episodes/s01e01/tools/build_final_breakdown.py --check
python3 episodes/s01e01/final/tools/refresh_vo_sources.py --check
node render/gpu-check.mjs --swiftshader --candidate lookdev-coast --frames 1   # picture check against the reference (~1 min)
```

On Windows: GitHub Actions > pc-kit-windows > Run workflow (or push a change to `pc/*.ps1`, `pc/*.cmd`, the
workflow, `render/gpu-check.mjs`, `render/lib/picture.mjs` or `pc/reference-image.json`).

PowerShell (no Windows here): PowerShell 7.4.6 and PSScriptAnalyzer were unpacked by an earlier session into
`scratchpad/ep1p2/pc/pwsh` and `.../pssa`, with `lint.ps1` (parse + 5.1/7.4 syntax compatibility). A mirror of the
project (symlinks + a fake `pc/tools/ffmpeg` and a `José` home) runs `setup-windows.ps1` end to end in about 30 s.

## Open / next

- **The first run with a real GPU.** `windows-latest` has no GPU and no interactive console: the D3D11 path on a real
  card, QuickEdit, keep-awake and Explorer are still only checked by reading. Ask Daxtyn for the Send-Logs text and the
  GPU-check picture after setup.
- **Approvals.** `render-ready.json` is empty: the director track approves shots with `node render/gate.mjs approve`.
- **Publishing the cache packages** (about 1.5 GB of tars, e.g. as a GitHub release) needs Daxtyn's go-ahead; then
  `node pc/pack-caches.mjs all --keep`, upload, `--record --url FAMILY=URL`, commit `pc/cache-delivery.json`.
- **Picture limits** are calibrated on CPU frames (SwiftShader, two neighbouring frames). The first real GPU result
  may show they need adjusting; look at its picture before trusting the verdict alone.
- **F5's 96 NaN** in its scene buffer (cloud machine, 2026-10-23): a scene or material fault for the style-frame /
  director tracks; the picture check notes it instead of failing.
- When his GPU check reports, put the measured factor into the render-schedule scenarios (or SPF via the pilot) and
  rebuild with `tools/build_final_breakdown.py`.
- Sound: nothing published yet (`delivery.json` archives are null). When the mix exists: `node pc/pack-sound.mjs mix`,
  upload, `--record --url`, commit `delivery.json`.
