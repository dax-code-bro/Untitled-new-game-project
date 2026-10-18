# Episode 1 data tools

These scripts rebuild the planning data in this folder from `screenplay.md`. Run them from anywhere with Python 3 (standard library only):

| Script | Rebuilds |
|---|---|
| `extract_dialogue.py` (`--check` to verify) | `dialogue.json`, `dialogue.md`, `onscreen-text.json` |
| `shotlist/extract.py`, then `shotlist/build.py`, then `shotlist/md.py` | `shotlist.json`, `shotlist.md` (shots are hand-authored in `shotlist/shots_data.py`) |
| `assets/build_assets.py` | `assets.json` (needs `dialogue.json` and `shotlist.json` first) |
| `check_extended.py` (`--markdown`, `--review`, `--json out.json`) | Nothing. It proves that every line of `screenplay.md` survives word for word and in order in `screenplay-extended.md` (also byte for byte outside the marked blocks). It also checks the markers, the dependency notes and the canon lint, and prints the extended runtime and render estimate used in `expansion-proposal.md` |
| `check_final.py` (`--markdown`, `--review`, `--json out.json`, `--clean`, `--update-timing`) | `final/screenplay-final-clean.md` (with `--clean`) and the runtime figure in the script's timing note (with `--update-timing`). It proves that the locked shooting script `final/screenplay-final.md` keeps `screenplay.md` word for word (every changed line keeps its old wording in a `WAS` section, and restoring those gives `screenplay.md` byte for byte), that the 28 additions are exactly as proposed in `screenplay-extended.md` outside their marked changes, that every spoken line of `screenplay.md` is spoken word for word except Daxtyn's approved changes (`APPROVED_CHANGES`, 2026-10-18: the five species lines, one of them his [ORIGINAL] line, each recorded with its old and new text), that the other three [ORIGINAL] lines are untouched, and that only the rating-pass blocks he approved (`APPROVED_RATING`: the deaths in Cling) carry an approval marker. It lints the canon (`DRAGONS.md`: no species, two legs, low stance; the CANON LOCK) and the rating limits of `SERIES.md` section 8 on all new text (Remi is an adult since 2026-10-18; Abby, the Cling child, the young attendant and the young riders are protected), checks the dependency links, and prints the runtime with the same model as `check_extended.py`, whose tables it imports. Run it after every edit to the final script; it must exit 0 |

### The locked shooting script (`../final/`)

| Script | Rebuilds |
|---|---|
| `build_final_breakdown.py` (`--check` to verify) | Runs the five steps below in order and stops at the first failure. Run it after every edit to `final/screenplay-final.md` |
| `check_final.py` | (see above) must exit 0 first |
| `extract_final_dialogue.py` (`--check`) | `final/dialogue.json`, `final/dialogue.md`, `final/onscreen-text.json`: every spoken line of the shooting text with its origin (handoff / proposed addition / proposed rating pass), the CHANGED block that reworded it and its old wording, whether Daxtyn approved the wording (`creator_approved`), timing and subtitle cues. Handoff lines keep L001-L198; addition lines are X#-NN, rating-pass lines R#-NN. Reuses `extract_dialogue.py`'s timing model, subtitle splitter and hand-checked annotations |
| `final_voices.py` (`--check`) | `final/voices.json`: one Kokoro (Apache-2.0) voice per role; the handoff roles keep their `voices.json` voices (so the preview takes stay valid), the new roles get unused allowed voices or blends of two allowed voices |
| `shotlist/final_build.py` (`--check`) | `final/shotlist.json`, `final/shotlist.md`: every shot of the episode in order, from `shotlist/shots_data.py` (handoff) + `shotlist/final_shots_data.py` (additions, rating pass, changed shots). Checks line coverage and order, block order against the script, the no-child-in-frame rule, and that the picture time per block equals `check_final.py`'s tables |
| `shotlist/final_render_schedule.py` (`--check`) | `final/render-schedule.md`, `final/render-jobs.json`: native-4K hours per scene from the measured style-frame speeds, chunk/job layout, disk plan and delivery order |

`final/assets-delta.md` (what has to be built for the final script) is written by hand.

`audio-prototypes/` holds the free-voice tests (Piper, Kokoro), the procedural sound-effect and music sketches, and the script that wrote `voices.json`. They are kept for reference. They need `numpy`/`scipy` and the downloaded voice models, and some of their paths still point at the session scratchpad, so they are not rebuild steps.
