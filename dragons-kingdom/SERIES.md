# Dragon's Kingdom: series production standards

These rules apply to every episode of Dragon's Kingdom and to everyone working on it, people and tools alike. Where an older plan or note in this repository says something different, this file wins. Only Daxtyn Sanches, the creator, can change these rules.

## 1. Episode length: 50 to 60 minutes

- **The creator's direction (2026-10-06):** "most episodes only range 50 minutes to an hour." The target for every episode is 50:00 to 60:00, counting the opening and the end titles. An episode outside that range needs Daxtyn's OK first.
- **Length is measured, not promised.** A screenplay or shot list only gives an estimate. The length counts once a timed animatic exists (a rough cut with temporary voices and sound). Until then, any length is an estimate and has to be called one.
- **Never stretch.** These rules come from the Episode 1 screenplay and apply to the whole series:
  - no repeated shots, loops, frozen pictures or slowed-down speech used to reach a number;
  - no recap scenes that retell what the audience has just seen;
  - no padding of any kind.
- **If an episode runs short,** write new story: a new scene, a new setup and payoff, a character beat that changes something. Every addition follows the canon process in section 5.
- **If an episode runs long,** cut in an order agreed in advance and written down in that episode's plan (Episode 1: `episodes/s01e01/expansion-proposal.md`).

## 2. Final masters: native 4K, 24 fps

- **Every final master is native 3840 x 2160 at 24 frames per second.** "Native" means every frame is drawn at 3840 x 2160. Nothing is drawn smaller and scaled up.
- **Render final masters with `--preset final` on every frame.** Do not use these for a final master:
  - `--preset final-fast` (drawn at 2560 x 1440 and scaled up to 4K);
  - `--twos` (a new picture only every second frame);
  - `--preset draft` or `--preset preview`.
- **Those faster settings are allowed only for animatics, previews, look tests and timing checks.** A file made with them is labelled as a preview everywhere it appears and is never called a master.
- Older planning text that recommends `final-fast` or `--twos` for parts of a final master is replaced by this rule. For example, the "recommended mix" in `episodes/s01e01/PRODUCTION_PLAN.md` (section 4D and the "Recommended mix" row in section 5) now applies to previews only. The native-4K hours in those tables are the ones that count for masters.
- **Container and sound:** the pipeline's 4K H.264 output (see `README.md`), with the episode's stereo audio mix muxed in. If the 10-bit option (`--bit-depth 10`) is used, use it for the whole episode, not a single scene.
- **Render time is planned from measurements.** Speeds come from the pipeline benchmark and from per-set measurements once sets exist; nobody guesses them. Every plan states its hours and its disk space as estimates, and replaces them with measured figures as soon as they exist.
- **Disk is a hard limit on this machine.** Delete chunk folders once a scene is verified and joined. Move finished files off the machine. Never commit video, audio masters or large binaries to git. Plan the final assembly so there is room for both the scene files and the joined master at once.

## 3. The look: live action

- **The target:** every shot should look as if it were filmed with a real camera in real places. That means real light, real materials, real weather and creatures with real weight. The Episode 1 screenplay asks for the same thing: "realistic cinematic fantasy; natural materials; large outdoor environments; physically readable movement."
- **The creator's direction (2026-10-06):** "go full 4K and make everything look live action." When a shot is hard, use the methods real film and visual-effects crews use instead of giving up on the look:
  - Real-camera behaviour: lens choice, exposure, depth of field, motion blur and grain.
  - Photographic light: real sky and HDRI light, baked light and shadow detail where it helps, atmosphere and haze for distance, wet and dry surfaces, dust and spray.
  - Photo-scanned materials and models from free libraries (section 4).
  - Scale shown through ordinary things next to the dragons: people, boats, buildings, grass, birds.
  - Physically believable motion: weight, wingbeats matched to size, and the ground reacting.
  - Framing and editing that hide what is not yet convincing. Real productions do this: they shoot tighter, cut on action, use weather and backlight, and keep the hardest view short. All of it is fair, as long as the story stays readable.
- **Design rules still apply.** Dragons have no glow, no extra limbs and no decorative armour. Starlight's scales are reflective and white, not a glowing crystal body. Riders use saddles and riding rigs. Designs stay provisional until Daxtyn approves reference images.
- **Claim only what has been made and looked at.** Nobody calls a shot "live action", "photoreal" or "finished" from a plan, a description or a small preview. Before any claim about how a frame looks:
  - render it at full 4K;
  - look at a downscaled whole frame;
  - look at 1:1 crops of the faces, the dragons, the edges and the skies.
- **Describe weak spots plainly.** Even when the look falls short somewhere, say what is weak and what the next step is.
- **A finished episode** is presented as finished only when a real playable file exists. Before that, someone has to watch it from start to end and check for:
  - missing sound;
  - blank or black sections;
  - repeated footage;
  - characters whose look changes between shots;
  - continuity errors.

## 4. Free and open assets only, with a licence record

- **Free only.** No paid assets and no paid services. Before using any outside generation service, state what it really costs and what its limits are, and do not choose a paid one quietly. The creator's budget is free.
- **Licences, in order of preference:**
  1. CC0 or public domain;
  2. CC BY, which is allowed only if the credit is recorded and shown in the end titles.
- **Licences not to use:** anything "non-commercial", "no derivatives" or "editorial only". The same goes for anything without a clear licence, and for any likeness of a real person or a celebrity.
- **Record every downloaded file in a manifest** (`assets-lib/manifest.json`), with:
  - the licence;
  - the author;
  - the page it came from;
  - the exact download URL;
  - its sha256 fingerprint.
- **Keep the credits up to date.** CC BY credits go in `assets-lib/CREDITS.md` and from there into the end titles.
- **Big files stay out of git.** The repository keeps only the manifest, the re-download script (`assets-lib/fetch.mjs`) and the notes. Downloaded files are git-ignored and can be fetched again byte for byte.
- **Our own work counts too.** Voices, music and sound effects made with free tools have their tool and model licences recorded in the same way (see each episode's `audio-plan.md` and `voices.json`).

## 5. Canon: proposed until Daxtyn accepts it

- **Canon means:** Daxtyn's own words and decisions, and the facts listed in an episode's CANON LOCK.
- **Everything else is proposed.** That includes:
  - dialogue not marked [ORIGINAL];
  - staging, supporting characters, costumes, camera, music and timing;
  - designs and sizes;
  - every extended-edition addition.
- **Mark proposals where they live.** In a screenplay, a proposed addition sits between `[PROPOSED ADDITION … — begin]` and `[PROPOSED ADDITION … — end]` lines and opens with a `NOTE (not spoken)`. Each one can be accepted or rejected on its own. If it leans on another addition, its first note says so.
- **Keep the original intact.** The creator's text is never edited in place. A script proves that every original line survives, word for word and in order (Episode 1: `episodes/s01e01/tools/check_extended.py`). Run it after every edit.
- **Never blur who wrote what.** Do not tell Daxtyn he wrote something he did not, or that he asked for something he did not ask for.
  - In documents for Daxtyn, say "your" only for his own words and decisions, such as his [ORIGINAL] lines, the CANON LOCK facts and his recorded requests.
  - For everything else, say "the screenplay", "the current draft" or "we propose".
  - When a document says he asked for something, quote him and give the date.
- **Accepting a proposal:**
  - It becomes canon only when Daxtyn says yes to it.
  - Record what he accepted and when, in that episode's folder.
  - Then take off its PROPOSED markers and rebuild the planning files (dialogue, shot list, assets, voices) from the accepted text.
  - How the accepted text stays marked: the production copy of a screenplay (the one whose checks prove the original survives) still has to tell his text, the accepted text and the proposals apart. So there an approval marker that names the date takes the place of the PROPOSED one, for example `[RATING PASS R15 — creator-approved 2026-10-18 — begin]`, and a cue whose wording he approved carries `[creator-approved wording 2026-10-18]`, the way his own lines carry [ORIGINAL]. The reading copy (Episode 1: `episodes/s01e01/final/screenplay-final-clean.md`) has no markers at all.
  - The check records the exact text he accepted and fails if a word of it changes (Episode 1: `APPROVED_CHANGES` and `APPROVED_RATING_TEXT` in `episodes/s01e01/tools/check_final.py`). Changing accepted text is a new proposal: it needs his OK again.
- **Respect later episodes.** No episode borrows material that belongs to a later one, and none locks in later-episode facts, such as who carries a message, how a rescue goes or what happens to a character. If a later episode is affected, it goes to Daxtyn as a question.

## 6. Checks to run

Run them from `dragons-kingdom/`. Each must pass (exit code 0) before the work it covers is committed.

- **Render pipeline:** `npm test` (41 tests on 2026-10-23, about 4 minutes on the cloud machine; the PowerShell parse test is skipped where no pwsh is installed. They are the render tests and the render PC kit tests in `test/pc-kit.test.mjs`: the Windows launchers' shape, no "npm run" in what Windows shows, the render gate's lock and verdicts, Send-Logs privacy, the pinned Node.js, the GPU picture comparison). It must pass before render code changes are committed.
- **Render gate (which shots may become 4K masters):** `node render/gate.mjs check` exits 1 when a shot approved in `episodes/s01e01/final/render-ready.json` has changed since its approval (approve it again with `node render/gate.mjs approve <shot> --by "<who>"`, or revoke it). `node render/gate.mjs status` lists every shot's state.
- **Locked shooting script (Episode 1):** `python3 episodes/s01e01/tools/check_final.py`. Exit code 0 means:
  - the handoff (`screenplay.md`) survives word for word, and only the changes Daxtyn approved touch its spoken lines;
  - the blocks he approved hold exactly the text he approved (the six deaths in Cling, the new species wording);
  - the additions are exactly the proposals, with their markers and dependency notes;
  - the canon lint and the rating lint of section 8 are clean. The rating lint matches **wording, not meaning**: a protected character named, called by a title or kinship word (sons, heirs, pages, squires, apprentices...), or referred to by a pronoun (including you / thee / thy) while a protected character is in scope (named in that paragraph or the three before it, until an adult is named instead), together with drink, tobacco, drug or intimacy words; a spoken cue that calls a protected character and has a vice word anywhere in it; a cue that calls a protected character and offers something ("have", "take", "try", "a pull") with a vice word in the same or the previous paragraph; and no new death outside the approved ones, including gentle death words (drowns, perishes, "does not move again", "stops breathing"). Each reviewed exception is listed with its reason in `REVIEWED_CONTEXT`. A sentence that means something forbidden in words the lint does not know still needs a human reading;
  - the runtime in the script's timing note and the reading copy `screenplay-final-clean.md` are current (after an edit: `--update-timing --clean`).
  - `--selftest` feeds it broken copies that must fail (seventeen, plus an edit of the approved-text table), as a check of the checker itself.
- **Planning data (Episode 1):** `python3 episodes/s01e01/tools/build_final_breakdown.py --check`: dialogue, voices, shot list and render schedule are rebuilt from the locked script and match it.
- **Extended edition (Episode 1):** `python3 episodes/s01e01/tools/check_extended.py` (the original screenplay intact in `screenplay-extended.md`, additions marked, canon lint clean) and `python3 episodes/s01e01/tools/extract_dialogue.py --check`.
- **Voice takes record (Episode 1):** `python3 episodes/s01e01/final/tools/refresh_vo_sources.py --check`: `vo/takes.json` names the current `voices.json` and every take still matches its recorded SHA-256.
- **Render PC kit:** `node pc/build-caches.mjs --check` (everything a render needs that is not in git), `npm run selftest:episode` (the episode runner: skip, stop, resume, assemble, sound swap, and the render gate: unapproved, approved, changed after approval, approved again, revoked), `npm run selftest:sound` (the sound delivery route), the GitHub Actions workflow `pc-kit-windows` (the setup, the GPU check, the picture check, the kit tests and the self-test on a real Windows machine; run it from the Actions tab) and, on the render PC, `pc\GPU-Check.cmd` (`pc/RENDER_ON_YOUR_PC.md`).

## 7. Where episodes come from

Daxtyn writes the main story with ChatGPT. That story is ahead of production (around Season 2, Episode 6 as of October 2026).

- Each episode arrives as a written handoff from Daxtyn, like the Season 1, Episode 1 handoff in `episodes/s01e01/screenplay.md`. It goes in `episodes/sXXeYY/screenplay.md`, unchanged.
- Episodes are produced in order, starting with Season 1, Episode 1, until production catches up with the story.
- Once production catches up, Daxtyn continues the story and sends each new episode's full description as it is written.
- Characters, dragons, places and props are built once and reused in every episode they appear in, so each one looks the same everywhere. An episode's breakdown lists which existing models it reuses and which new ones it needs.

## 8. Rating and content (decided by Daxtyn on 2026-10-16)

The show is for mature audiences, like a TV-MA fantasy drama. Daxtyn listed what it contains:

- drug references and drug use, tobacco, alcohol
- strong language
- dark humor and ordinary humor
- suggestive material
- intense violence, strong blood and gore

Production limits that always apply:
- Suggestive material stays non-explicit, and only ever involves adults. It never involves children or characters who could be children (for example Abby, who the Episode 1 screenplay calls a child, or the child in Cling).
- Children are never shown using drugs, tobacco or alcohol.
- Violence and gore are shown as in a live-action drama. They serve the story and are not instructions for real-world harm.

## 9. Canon decisions log

Daxtyn's decisions, newest first, with the date and where each one is recorded in full. This log only records what he decided; it does not change the rules above. Which characters are adults is in `CHARACTERS.md`; the dragon designs are in `DRAGONS.md`.

| Date | Daxtyn's decision | Recorded in |
|---|---|---|
| 2026-10-18 | **Species lines (Episode 1):** use the suggested wording. His own [ORIGINAL] line "Why couldn't I get a Bashion?" becomes "Why couldn't I get one like Charcoal?" (he approved changing his own line; the old wording is kept). "Nightwings are faster. More versatile." / "And Bashions?" become "Smaller ones are faster. More versatile." / "And big ones?". "...A Slitherwing." becomes "...A small dragon. Fast.". "I still want a Bashion." becomes "I still want one like Charcoal.". This closes the open question in `DRAGONS.md`. | `DRAGONS.md`; `episodes/s01e01/final/CHANGES.md` section 9; `screenplay-final.md` (C8b, C9, C19, C30) |
| 2026-10-18 | **Deaths in Cling (Episode 1):** keep the six unnamed adult deaths, with their gore, in Starlight's attack (rating-pass pieces R15, R16b, R18, R20, R21). | `episodes/s01e01/final/CHANGES.md` question 4 and section 9 |
| 2026-10-18 | **Remi is an adult.** He may drink, swear and so on. The limits of section 8 still apply to Abby, the child in Cling and anyone who could be a child. His exact age is not set. | `CHARACTERS.md` |
| 2026-10-18 | **Production, not canon: final 4K rendering runs on Daxtyn's own gaming PC, on its graphics card**, instead of the CPU-only cloud machine. The same day he described the PC: Windows, an NVIDIA GeForce RTX 4090 (his words: "I'm pretty sure"; the GPU check confirms the real model) and about 2 TB of free disk. The render kit targets that PC first; macOS and Linux stay supported. Section 2's native-4K rule is unchanged. | `pc/TARGET.md`; `episodes/s01e01/final/render-schedule.md`; `pc/RENDER_ON_YOUR_PC.md` |
| 2026-10-16 | The rating and content of the show (section 8). | Section 8 |
| 2026-10-16 | "Give me the complete episode one" (Episode 1 shooting script; the additions stay proposals until he accepts them). | `episodes/s01e01/final/CHANGES.md` |
| 2026-10-16 | Dragons stand low and normal, the two legs toward the center of the body. | `DRAGONS.md` |
| 2026-10-14 | Every dragon has two legs, horns, and wings as its front limbs; Claude designs the bodies and Daxtyn reviews pictures. | `DRAGONS.md` |
| 2026-10-09 | No dragon species: every dragon is its own design. Charcoal's and Leaf's looks. Leaf is about a quarter of Charcoal's size. | `DRAGONS.md` |
| 2026-10-06 | Episodes run 50 minutes to an hour; full native 4K that looks like live action. | Sections 1-3 |
