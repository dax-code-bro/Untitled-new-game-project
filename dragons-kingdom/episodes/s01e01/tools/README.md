# Episode 1 data tools

These scripts rebuild the planning data in this folder from `screenplay.md`. Run them from anywhere with Python 3 (standard library only):

| Script | Rebuilds |
|---|---|
| `extract_dialogue.py` (`--check` to verify) | `dialogue.json`, `dialogue.md`, `onscreen-text.json` |
| `shotlist/extract.py`, then `shotlist/build.py`, then `shotlist/md.py` | `shotlist.json`, `shotlist.md` (shots are hand-authored in `shotlist/shots_data.py`) |
| `assets/build_assets.py` | `assets.json` (needs `dialogue.json` and `shotlist.json` first) |
| `check_extended.py` (`--markdown`, `--review`, `--json out.json`) | Nothing. It proves that every line of `screenplay.md` survives word for word and in order in `screenplay-extended.md` (also byte for byte outside the marked blocks). It also checks the markers, the dependency notes and the canon lint, and prints the extended runtime and render estimate used in `expansion-proposal.md` |

`audio-prototypes/` holds the free-voice tests (Piper, Kokoro), the procedural sound-effect and music sketches, and the script that wrote `voices.json`. They are kept for reference. They need `numpy`/`scipy` and the downloaded voice models, and some of their paths still point at the session scratchpad, so they are not rebuild steps.
