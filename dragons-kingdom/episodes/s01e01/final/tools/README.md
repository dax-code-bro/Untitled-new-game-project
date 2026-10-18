# Episode 1 final: voice tools

| Script | What it does |
|---|---|
| `make_final_vo.py` | Makes a computer-voice take for every spoken line of `../dialogue.json` (the locked shooting script), plus labelled placeholders for the sung verse and the screams and cries, then checks all of them. Output goes to `../vo/` (see `../vo/README.md`). |

## Setup (once)

This script uses the preview's Python environment and the preview's voice tool. It imports
`../../preview/tools/make_vo.py` as a module and does not copy it.

```bash
python3.11 -m venv preview-venv
preview-venv/bin/pip install -r ../../preview/tools/requirements-vo.txt
```

You also need:
- the system tools espeak-ng 1.51 and SoX 14.4.2 (Ubuntu 24.04 packages);
- the Kokoro model files `kokoro-v1.0.int8.onnx` and `voices-v1.0.bin`. Their download URL and sha256 are pinned in `requirements-vo.txt`. Put them in `../../preview/.cache/kokoro/` or point `DK_KOKORO_DIR` at them. `node pc/build-caches.mjs --only voice` downloads them too.

## Run (from this folder)

```bash
python -I make_final_vo.py                       # all 385 lines + 4 non-verbal placeholders, then every check
python -I make_final_vo.py --only L048,X9-01     # re-make some takes; takes.json keeps the others
python -I make_final_vo.py --verify              # check the files that exist; render nothing
python -I make_final_vo.py --repeat-check sample # make a sample again in fresh processes and compare sha256
```

The script runs 4 worker processes (`--jobs`, or `DK_JOBS`). Each one runs onnxruntime with 1 thread
(`DK_THREADS`), which keeps the takes deterministic. A full run took about 13 minutes on the 4-vCPU
cloud machine, plus about 4 minutes for the checks. `DK_TMP` sets the folder for SoX's temporary files.

The exit code is 0 only when every check in `takes.json` → `checks.problems` passes.

## Other operating systems

The takes were made and checked on Linux (Ubuntu 24.04, espeak-ng 1.51). On another Linux machine with
the same pinned versions, the script makes the same files byte for byte.

On Windows or macOS (decision 4 on 2026-10-18: final rendering runs on Daxtyn's PC) the script is
written to run, but it has **not been tested** there:
- SoX must be on PATH.
- Without the system espeak-ng, the script uses the copy bundled with the `espeakng-loader` package. A
  different espeak-ng version can phonemize some words differently, so those takes may not match these
  files.

For the render PC, copy the finished `../vo/` folder instead of re-making the takes.
