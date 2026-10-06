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
  - Then remove its markers and rebuild the planning files (dialogue, shot list, assets, voices) from the accepted text.
- **Respect later episodes.** No episode borrows material that belongs to a later one, and none locks in later-episode facts, such as who carries a message, how a rescue goes or what happens to a character. If a later episode is affected, it goes to Daxtyn as a question.

## 6. Checks to run

- **Render pipeline:** `npm test` in `dragons-kingdom/` (24 tests at the time of writing). It must pass before render code changes are committed.
- **Screenplay integrity (Episode 1):** `python3 episodes/s01e01/tools/check_extended.py`. Exit code 0 means:
  - the original screenplay is intact;
  - the additions are marked correctly and their dependency notes are present;
  - the canon lint is clean.
- **Planning data (Episode 1):** `python3 episodes/s01e01/tools/extract_dialogue.py --check`.
