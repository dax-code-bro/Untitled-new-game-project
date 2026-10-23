# PC render kit: progress (for whoever picks this up next)

Owner: the pc-render track. Also owns `render/episode.mjs` (with additive care: other tracks own
`render/lib/presets.mjs`), the docs in `episodes/s01e01/final/`, `episodes/s01e01/tools/check_final.py`,
`SERIES.md` sections 5, 6 and 9, and `CHARACTERS.md`.

Daxtyn's render PC: `pc/TARGET.md` (Windows, RTX 4090, about 2 TB free). Nothing has run on it yet.

## Files

| File | What it is |
|---|---|
| `RENDER_ON_YOUR_PC.md` | The guide for Daxtyn (written for a young non-programmer). |
| `MANIFEST.md` | Everything a render needs that is not in git, how it is rebuilt, the pinned downloads with SHA-256, the sound route, disk. |
| `setup-windows.ps1` (+ `Setup-Windows.cmd`) | One-command Windows setup (`irm ... \| iex` or double-click). Exit 0 ok, 2 no usable GPU, 1 stopped. |
| `setup.sh` | The same for macOS / Linux. |
| `render-episode.ps1` (+ `Render-Episode.cmd`, `GPU-Check.cmd`, `Send-Logs.cmd`), `render-episode.sh` | git pull + caches + `render/episode.mjs`; `--gpu-check`; `--send-logs`; `--status`. |
| `build-caches.mjs` | Builds / checks every non-git cache (stamps with code hashes); family `sound` installs published sound packages. |
| `sound-delivery.mjs`, `pack-sound.mjs` | Sound that never goes through git: deterministic tar + SHA-256 per file, `episodes/s01e01/final/audio/delivery.json`. |
| `collect-logs.mjs` | One text file for the Claude session (`pc/logs/send-to-claude-<date>.txt`), user folder replaced by `~`. |
| `selftest-episode.mjs`, `selftest-sound.mjs` | `npm run selftest:episode` (episode runner, 6 runs incl. a credits change), `npm run selftest:sound` (11 checks). |
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
| 9 | `.cmd` launchers rewritten by `git pull` while running | fixed | every `.cmd` is one parenthesised block ending in `exit /b`; `pc/.gitattributes` keeps them CRLF (`-text`); no `<`/`>` in their comments. |
| 10 | non-ASCII Windows user names in saved paths | fixed | UTF-8 (no BOM) `.bpy-python`; the setup log is copied byte for byte; `PYTHONUTF8=1` for every Python child of `build-caches.mjs`; verified with `.../José/python`. |
| 11 | guide gaps for a young non-programmer | fixed | rewritten guide: the four buttons, how to open the folder, where chrome.exe is, the Claude desktop app and `claude remote-control` (from the current docs), what to send back (`Send-Logs.cmd`). The setup now sets the Windows graphics preference itself. |
| 12 | rating lint only matched names | fixed | titles/kinship words, drinking words, pronoun context (rule 6b), cue directions `[to Abby]`, new-death lint (6d); reviewed hits listed with reasons (`REVIEWED_CONTEXT`). |
| 13 | approval markers vs SERIES.md section 5 | fixed | section 5 now describes the approval marker in the production copy and no markers in the reading copy; the reading copy also drops the `[creator-approved wording ...]` cue marker. |
| 14 | CHARACTERS.md "reigning" queen | fixed | quotes the handoff's own words; "reigning" and adulthood marked as **Inference**; the left arm marked as the handoff's production choice. |
| 15 | render PC "unknown" in SERIES.md s9 and render-schedule.md | fixed | both cite `pc/TARGET.md`; render-schedule has "On Daxtyn's PC": time scenarios 25-250x (about 1-5 days, NOT measured) and the 2 TB disk plan. |
| 16 | SERIES.md section 6 out of date | fixed | lists `check_final.py` (+ `--selftest`), `build_final_breakdown.py --check`, the extended-edition checks, the PC kit self-tests; `npm test` = 33 tests (2026-10-23). |
| 17 | stale voice-take notes | fixed | `final/PROGRESS.md`; `voices.json` via `tools/final_voices.py` (only notes changed; `vo/takes.json` still records the previous voices.json sha256 until `make_final_vo.py` runs again). |
| 18 | end-credits text missing | fixed | `final/credits.txt` (+ `credits-notes.md`); the card centres every line (FFmpeg 6.1+ `text_align`) and is made again when the text changes; checked at 960x540 and one 4K frame. |

## How to check the kit (all on the cloud machine)

```bash
npm test                                   # 33 tests, ~3 min
npm run selftest:episode -- --cpu          # ~25 s
npm run selftest:sound                     # < 1 s
node pc/build-caches.mjs --check
python3 episodes/s01e01/tools/check_final.py && python3 episodes/s01e01/tools/check_final.py --selftest
python3 episodes/s01e01/tools/build_final_breakdown.py --check
```

PowerShell (no Windows here): PowerShell 7.4.6 and PSScriptAnalyzer were unpacked by an earlier session into
`scratchpad/ep1p2/pc/pwsh` and `.../pssa`, with `lint.ps1` (parse + 5.1/7.4 syntax compatibility). A mirror of the
project (symlinks + a fake `pc/tools/ffmpeg` and a `José` home) runs `setup-windows.ps1` end to end in about 30 s.

## Open / next

- **The first real Windows run.** Everything Windows-specific (console API, keep-awake, registry graphics preference,
  `Set-Clipboard`, Explorer, MinGit, D3D11) has only been checked on Linux. Ask Daxtyn for the Send-Logs text after setup.
- When his GPU check reports, put the measured factor into the render-schedule scenarios (or SPF via the pilot) and
  rebuild with `tools/build_final_breakdown.py`.
- Credits font: the card uses the OS serif font (Georgia / DejaVu Serif); an open-licence font in `assets-lib` would make
  it identical everywhere (asset-library work, not done).
- Sound: nothing published yet (`delivery.json` archives are null). When the mix exists: `node pc/pack-sound.mjs mix`,
  upload, `--record --url`, commit `delivery.json`.
