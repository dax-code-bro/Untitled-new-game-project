# Episode 1 locked shooting script: progress

Owner of this folder and of `../tools/` (the check tools and generators). Resume from here after a restart.

## Second review of 2026-10-23 (evening): what changed here

- **REQUEST to the director track: approve shots with the render gate.** `render-ready.json` (this folder) decides which
  shots the render PC may turn into 4K masters; it is empty, so the PC masters nothing yet (76 shots have scene files and
  wait for approval, `node render/gate.mjs status`). After reviewing a shot's draft: `node render/gate.mjs approve <shot ids>
  --by "<who>" [--note "..."]` (or `--scene 1A`), commit `render-ready.json`. Changing an approved shot's scene, entry or
  any file its scene loads makes it wait until it is approved again (`node render/gate.mjs check` exits 1); `revoke` takes
  a shot back. The credits card (E-01) is gated on `credits.txt` the same way.
- Rating lint (`../tools/check_final.py`), extended after every probe of the reviewer passed the old one: drink, tobacco,
  drug and intimacy words; sons, heirs, youths, pages, squires, apprentices; second-person pronouns; a scope of the
  paragraph and the three before it, ended when an adult is named; rule 6c for spoken cues (a call plus a vice word, or a
  call plus an offer with a vice word nearby); gentle death words. `--selftest`: 17 broken copies + 1 table edit, all
  caught. "The attendant" stays unprotected: ATTENDANT is the adult at the nest in this script (YOUNG ATTENDANT is
  protected). `CHANGES.md` now says the lint checks wording, not meaning.
- `credits.txt` is in heading / name blocks (format in `credits-notes.md`), with the CC BY block (title, author, licence,
  link, "modified") and the credits typeface (EB Garamond, OFL). `video-description.txt` holds the full attribution with
  the source URL for the video page. The card was rendered and looked at (contact sheet, 960x540 and 4K frames, 1:1 crops).

## Follow-ups of 2026-10-23 (the review of the PC kit and the script)

- `check_final.py`: proof 1g locks the CONTENT of the five approved death blocks (R15, R16b, R18, R20, R21): their story
  lines are stored word for word in `APPROVED_RATING_TEXT` (the text CHANGES.md question 4 put to Daxtyn, commit 89efae0;
  the approval commit 3f43434 changed only markers and NOTE lines), and `APPROVED_RATING_SHA256` guards that table.
- Rating lint: titles and kinship words (`his sister`, `her daughter`, `Leaf's rider`, ...) count as protected names;
  drinking words count as alcohol; rule 6b flags a vice word with a pronoun right after a protected character is named
  (same or previous paragraph; widened in the second review above); cue directions `[to Abby]` with a vice word fail;
  rule 6d fails any death word in new text outside the approved blocks. The hits read in context are in
  `REVIEWED_CONTEXT` with the reason. `--selftest` then ran 8 broken copies (17 since the second review).
- The reading copy drops the `[creator-approved wording 2026-10-18]` cue marker too (SERIES.md section 5 now describes
  how accepted text stays marked in the production copy and has no markers in the reading copy).
- `voices.json` (via `tools/final_voices.py`): status notes now say that computer-voice takes of every line exist in
  `vo/` (384 takes + 5 placeholders, 2026-10-18), measured but not listened to, none approved; the L048/L053/L054 notes
  point to the final takes. Only notes changed, no casting. `vo/takes.json` now records the current voices.json
  (fa8e15bb...) as its source: `tools/refresh_vo_sources.py` (2026-10-23) found the version the takes were made from
  in git (commit 3f43434), proved that the parts that decide how a take sounds are identical (render digest), verified
  all 389 take files against their sha256, and wrote only the sources block (with a dated `sources_refreshed` entry).
- `render-schedule.md` (via `tools/shotlist/final_render_schedule.py`): the render PC is no longer "not known":
  `pc/TARGET.md` (Windows, RTX 4090, about 2 TB). New section "On Daxtyn's PC" with time scenarios (25-250x this
  machine: about 1-5 days non-stop, setup and encodes included; NOT measured) and the disk plan (54-100 GB, 3-5% of his
  disk: keep every shot and scene file until he approves the episode).
- `credits.txt`: the end-credits text (the END card), from the real contributors and the licences only.

## Daxtyn's decisions applied (2026-10-18)

- Decision 1 (species lines): the PENDING P1-P3 blocks and the open-question note after Abby's [ORIGINAL] line are gone.
  The five lines are CHANGED blocks with reason "creator-approved 2026-10-18" and the cue marker
  `[creator-approved wording 2026-10-18]`: C8b (L048, his [ORIGINAL] line, approved change), C9 (L053+L054), C19 (L109),
  C30 (X17-11, inside the proposed X17). Old wording kept as WAS. `check_final.APPROVED_CHANGES` records old+new text;
  `PENDING_LINES` is empty.
- Decision 2 (deaths in Cling): R15, R16b, R18, R20, R21 use `[RATING PASS R# — creator-approved 2026-10-18 — begin]`
  and a `[RATING PASS — creator-approved 2026-10-18]` NOTE (`check_final.APPROVED_RATING`). R19, R16, R17 stay proposed.
- Decision 3 (Remi adult): Remi and "prince" left `PROTECTED_RE`/`PROTECTED_SPEAKERS` (check_final) and `CHILDISH_RE`
  (final_build). No Remi drinking beat exists or was added (CHANGES.md section 3 offers one).
- Decision 4 (render on Daxtyn's PC): a note at the top of render-schedule.md (figures = CPU-only upper bound); since
  2026-10-23 also the section "On Daxtyn's PC" (pc/TARGET.md). The render tools are the PC kit's (`pc/`, `render/`).
- New checker proofs: 1e (198 handoff spoken lines: 194 verbatim + 4 approved, nothing else spoken outside the
  additions), 1f (approved changes exact, nothing else claims approval, cue marker only in approved NOW text); approved
  marker form only for APPROVED_RATING. Negative tests (13 broken copies, `--final COPY`) all exit 1; Remi with a flask
  in R10 passes.
- Breakdown rebuilt: dialogue `creator_approved`/`was_original` fields, L068 context (FINAL_CONTEXT), voices.json
  approved special lines (the preview takes of L048/L053/L054 have the old wording; the final takes in `vo/` have the new one), species pronunciations dropped,
  creature "design" instead of "species"; shot 1D-09 override; APPROVED_WORDING flag (4 shots).
- Estimate now 54:24 (44:18-68:56); shot list 54:16; 37 changed lines (19 DRAGONS.md, 14 rating, 4 approved).
- Docs: CHANGES.md (questions 1, 3, 4 answered, section 9), DRAGONS.md (question closed), SERIES.md section 9
  (decisions log), new ../../../CHARACTERS.md.

## State (2026-10-16, review round)

- `screenplay-final.md` is the locked shooting script and the source of truth, edited by hand.
  - 28 additions, marked `[PROPOSED ADDITION X# — in the shooting script by default 2026-10-16, not accepted by Daxtyn — begin]`
    (SERIES.md section 5: proposals stay marked until Daxtyn says yes).
  - 24 rating-pass blocks `[PROPOSED RATING PASS R# — begin]` (R1-R21 plus R8b, R9b, R16b added in review).
  - 33 changed lines: 19 for DRAGONS.md, 14 for the rating pass. C9, C19, C30 (species dialogue) and C33 were withdrawn.
  - 3 `[PENDING P# — Daxtyn wording — DRAGONS.md L9 — begin]` blocks after the proposed dialogue lines that keep a
    species word until Daxtyn chooses new wording (L053/L054, L109, Abby's X17 line). The lines are shot as written.
  - 5 `FINAL SCRIPT NOTE` blocks (marker legend, superseding rules, timing, the open "Bashion" question, closing check).
- `screenplay-final-clean.md` is generated by `python3 ../tools/check_final.py --clean`. Never edit it by hand.
- `CHANGES.md` is the plain-language list for Daxtyn (section 8 lists the review fixes).
- `../tools/check_final.py` passes (exit 0). Estimate: expected 54:22, tight 44:16, loose 68:54.
- `../tools/check_extended.py` and `../tools/extract_dialogue.py --check` still pass on the original files.

## Review round (2026-10-16): all 25 findings checked and applied

Species dialogue back to as-written + PENDING; C16/C17 no longer "bleeding to death"; low, level stance everywhere
(no dog-sit); PROPOSED markers; Remi's blood (R8 scrub, R8b, R9b, C20); R4 late morning; R3/R11/R12/R13 say where the
children are; R13 sung low at the alley end with the musician eating there; R16 split (R16 villager, R16b guard who
dies); deaths group (R16b, R18, R20, R21 lean on R15); every dead body an adult; dead laid out below the steps; R1 note;
C14 scream; C35; "bloody" x3 -> 1; C33 and R11's ale sentence removed. New checker rules: PENDING blocks and
PENDING_LINES, haunch/dog-sit stance lint, scout bleeding-out words, DEAD_BLOCKS child lint, R-ids with a letter.
Negative tests (broken copies, `--final COPY`, expect exit 1) all caught: species word in an R-block, PENDING block
removed, R15 cut with R16b kept, a child among the dead, "haunches", "pumping" near the scout, an old marker,
a CHANGED block on a PENDING line.

## After any edit to screenplay-final.md

1. `python3 tools/check_final.py --update-timing --clean` (from `episodes/s01e01/`), then `python3 tools/check_final.py` must exit 0.
2. If you add, cut or renumber a block, update `RATING_SHOTS`, `CHANGE_SHOTS`, `RATING_DEPENDS` or `PENDING_LINES` in
   `tools/check_final.py`, the closing note's link paragraphs, and `CHANGES.md`.
3. `python3 tools/build_final_breakdown.py` (rebuilds the breakdown below; `--check` verifies it is current).

## Breakdown of the final script (done 2026-10-16)

Generated into this folder from `screenplay-final.md` (`tools/build_final_breakdown.py --check` exits 0):
- `dialogue.json` / `dialogue.md`: 385 spoken lines (198 handoff, 171 additions, 16 rating pass), 26 speakers,
  4 PENDING lines then (none since 2026-10-18), est. 12:52 of speech. `onscreen-text.json`: 12 cards (T11 Cling caption in X5, T12 optional hull name in X4).
- `voices.json`: 26 roles; the 18 handoff roles keep `../voices.json` (ADULT VILLAGER recast male: the additions make
  him a man); 8 new roles (YOUNG ATTENDANT af_sky, LOOKOUT af_jessica, SAILOR bf_alice, OLD WOMAN bf_isabella, PARTNER
  af_sarah, and blends for SHIP'S MASTER, KEEPER, INSTRUCTOR, ADULT VILLAGER because all nine allowed male voices were
  taken). Blends are not auditioned by ear (their final takes in `vo/` were measured only).
- `shotlist.json` / `shotlist.md`: 726 shots (331 handoff incl. 3 CHANGED extras, 352 additions, 43 rating pass),
  54:14 expected (44:08-68:50); 1B-11 and X7's last shot are played once (duplicates). check_final says 54:22.
- `render-schedule.md` / `render-jobs.json`: ~2,580 h one browser (1,956-3,545), ~2,366 h wall with 2 browsers
  (~99 days) from the MEASURED round-4 style-frame speeds x the measured velocity-blur ratio; 723 jobs, chunks
  0.25-2 s; scene-by-scene delivery (intermediates 21-42 GB total, never all on disk at once).
- `assets-delta.md` (hand-written): sets S1-S9, people H1-H12, dragons D1-D7, props P1-P12, effects F1-F10,
  animation A1-A7 that do not exist in `scenes/lib/` yet.

## Open (needs Daxtyn or a later step)

- CHANGES.md questions 2 and 5-10 (dog-sit, wine, the drug's name, the verse, language, new roles, which additions to
  keep). Questions 1, 3 and 4 were answered on 2026-10-18.
- Listen to the takes of the four blended voices and the eight new roles (`vo/takes.md`); record the sung verse
  (R13-01), Abby's cry (X12) and the rider's scream with people (`vo/` has PLACEHOLDER stand-ins). The final takes of
  L048, L053, L054 with the approved wording exist (`vo/`, 2026-10-18).
- Pilot renders to replace the s/frame estimates (`final_build.py` SPF), then rebuild the schedule.
- When Daxtyn accepts an addition, SERIES.md section 5 says remove its markers: check_final.py's proofs 1b/2 then need an
  "accepted text" mode (not built).
