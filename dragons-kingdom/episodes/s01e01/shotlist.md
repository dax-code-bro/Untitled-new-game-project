# Dragon's Kingdom, Episode 1: shot list and honest runtime

**This is a plan. Nothing has been rendered yet.** It splits the screenplay into individual camera shots and estimates how long each one runs. The full data for the build is in `shotlist.json`.

## The short answer

- **Expected length: about 25 minutes** (25:16). Realistic range: **20:36 to 31:58**.
- The screenplay's schedule says 50 minutes. The story as written fills about **half** of that (51%).
- That is not a problem with the story. It is simply how much happens in it:
  - **198 spoken lines** (974 words). Most are short, about 5 words each. At a natural pace that is about **6:47** of pure speech, or **7:57** with the small gaps between lines. Line numbers L001-L198 and speech times match `dialogue.json`.
  - **Action and pictures** (hatching, take-off, flying, the chase, the attack, the aftermath): about **16:08**.
  - **Pauses and holds**: the screenplay's own pauses (Abby's silence, holds on faces, the last prologue landscape) plus small half-second breaths between some lines: about **1:09**.
- The screenplay itself says not to stretch footage with repeats, frozen frames or slow talking to hit 50 minutes. So nothing here is stretched.
- About 22 minutes (without ads) is a normal length for an animated TV episode.
- The real length will only be known once we cut the **animatic**: a rough, low-resolution version timed to temporary voices.

## Scene by scene, compared with the 50-minute schedule

| Scene | What happens | Shots | Schedule says | Expected | Range | Of schedule |
|---|---|---:|---:|---:|---:|---:|
| PROLOGUE+TITLE | Historical prologue and main title | 18 | 3:00 (00:00-03:00) | **1:43** | 1:24-2:10 | 57% |
| 1A | The gold hatchling | 34 | 4:30 (03:00-07:30) | **2:34** | 2:03-3:14 | 57% |
| 1B | Preparing to fly | 15 | 3:00 (07:30-10:30) | **1:10** | 0:58-1:29 | 39% |
| 1C | Takeoff and open sky | 19 | 3:30 (10:30-14:00) | **1:32** | 1:12-2:00 | 44% |
| 1D | Siblings, succession, and the playful nip | 26 | 4:00 (14:00-18:00) | **1:59** | 1:38-2:30 | 50% |
| 1E | The first fast pass | 18 | 2:30 (18:00-20:30) | **0:56** | 0:47-1:11 | 38% |
| 1F | Pursuit and the scout's fall | 33 | 4:30 (20:30-25:00) | **1:49** | 1:28-2:22 | 40% |
| 2A | Return to Verdor | 20 | 3:00 (25:00-28:00) | **1:32** | 1:16-1:56 | 51% |
| 2B | Treatment and Remi's report | 28 | 5:00 (28:00-33:00) | **2:30** | 2:06-3:02 | 50% |
| 2C | Santa Maria orders and sibling aftermath | 21 | 2:30 (33:00-35:30) | **1:44** | 1:26-2:06 | 69% |
| 3A | Cling's festival and its king | 26 | 4:00 (35:30-39:30) | **2:16** | 1:52-2:46 | 56% |
| 3B | The white dragon approaches | 20 | 2:30 (39:30-42:00) | **1:10** | 0:56-1:28 | 47% |
| 3C | Starlight's attack | 34 | 5:00 (42:00-47:00) | **2:20** | 1:56-2:59 | 47% |
| 3D | Aftermath and cliffhanger | 16 | 2:00 (47:00-49:00) | **1:20** | 1:04-1:44 | 67% |
| END | End credits | 1 | 1:00 (49:00-50:00) | **0:40** | 0:30-1:00 | 67% |
| **Total** | | **329** | **50:00** | **25:16** | 20:36-31:58 | 51% |

How each shot was timed: talking time (from the word count at a natural speaking speed) + time for the action to read clearly + any pause the screenplay asks for. "Low" means tight cutting. "High" means slower acting and longer holds. End titles are set at 40 seconds because the real credit list is short. Change that once the credits are known.

## A choice only you can make

1. **Keep Episode 1 at about 25 minutes.** It is a complete episode with a beginning, middle and cliffhanger.
2. **Write more story** if you want it closer to 50 minutes: new scenes, not slower ones. About 20-25 extra minutes of new material would be needed.

## How long the computer needs to make it

At 24 frames per second, 25:16 is **36,372 frames**. Black screens and the credits need no 3D render, which leaves **35,220 frames** to render.

The speeds below were **measured** on this computer (4 processor cores, no graphics card) with the render pipeline's own benchmark on its test scene. Another small job was running at the time, so an empty machine may be a little faster.

| Quality setting | Measured speed | Every frame drawn | With "twos" where allowed |
|---|---:|---:|---:|
| Animatic draft (960x540) | 3.06-3.35 frames/s | 2.9-3.2 hours | 2.3-2.5 hours |
| Preview (1920x1080) | 1.44 frames/s | 6.8 hours | |
| final-fast (drawn at 1440p, sharpened up to 4K) | 0.48-0.56 frames/s | 17.5-20.4 hours | 13.5-15.8 hours |
| Native 4K (3840x2160) | 0.37-0.42 frames/s | 23.3-26.4 hours | 18.0-20.5 hours |

- **One full native 4K render of the episode is about a day of non-stop rendering** (23.3-26.4 hours, about 57-65 minutes of rendering for every finished minute). It can run overnight in pieces and picks up again after any interruption.
- An earlier quick test looked about 2.5 times faster. This plan uses the newer, slower measurement so it does not promise too much.
- These numbers are for **one** full render. Real projects re-render shots after fixing them, so plan for more. Each shot will probably get 2-3 draft passes, and the final pass will run about 1.3-1.5 times.
- The test scene is not the real episode. Busy shots (crowds, dust, the sea, Starlight over the village) will probably render slower. A rough guess with that included: native 4K about **27.8-31.6 hours**. This is an unmeasured guess. We will measure each location once it is built.
- Even so, render time is not the slowest part. **Building and animating 329 shots** is the big job.

### What "on twos" means

Normally the computer draws all 24 pictures in every second ("on ones"). "On twos" draws 12 and shows each one twice. That halves render time and gives a slightly hand-animated look. With this renderer the camera also holds for two frames, so moving cameras would stutter. Twos is therefore allowed only on **143 shots** (45.1% of the 3D-rendered frames, 43.7% of screen time). Those are shots with a locked camera and calm movement, like the birthing chamber, the treatment room, and the Cling festival talk.
Shots that must stay on ones: all flying, the take-off, the chase, the fire, the splash, Starlight's dive, crowds, dust, and any shot where the camera moves.

## The hardest shots to make convincing

Every shot was rated from 1 (routine) to 5 (hardest) for this production method: code-built 3D, rendered without a graphics card. **23 shots are rated 5** and **62 are rated 4**. Together these 85 are the shots marked `hard` in `shotlist.json`.

| Shot | Why it is hard |
|---|---|
| 1A-12 | **wet newborn hatchling, gold scales.** The hatchling emerges awkwardly: wet, unsteady, exhausted. Gold along its scales; fragile movement. No glow. |
| 1C-05 | **dust, breaking ground/timber, huge size.** He launches. Dirt lifts, turf breaks, loose stones jump, a rolling dust cloud crosses the empty launch area. Field was cleared: no bystanders. |
| 1C-06 | **dust, breaking ground/timber.** The ground visibly devastated beneath and behind him; dust rolls toward and past camera. |
| 1D-19 | **head-in-mouth, huge size.** Wide angle establishing both dragons and both riders. Charcoal opens his jaws and takes Leaf's whole head into his mouth. Abby's body remains safely outside. |
| 1D-22 | **head-in-mouth.** Charcoal releases Leaf. Leaf jerks his head back, puts immediate distance between them, eyes forward. Leaf is uninjured. |
| 1E-03 | **very fast pass, huge size.** Coming head-on from ahead, the Slitherwing cuts through the gap between Leaf and Charcoal, passing close along Leaf's LEFT (seaward) side, the far side from this inlan... |
| 1E-04 | **face close-up, body force.** Leaf rolls to his RIGHT; Abby is thrown against her restraint and her LEFT arm (screen RIGHT here) is wrenched violently. |
| 1F-13 | **fire.** Charcoal releases a brief directed breath of flame, not sustained, not explosive. The scout tries to slip beneath it. |
| 1F-14 | **fire, cloth.** One short flash of burning outer cloth, a flinch, a cry lost in the wind. Cut away before any skin. |
| 1F-17 | **dragon-on-dragon contact.** Charcoal catches the scout in his jaws. The scout struggles. No prolonged gore. |
| 1F-20 | **wing tearing loose.** Charcoal's movement and the scout's desperate twist tear the scout's LEFT wing loose, shown in silhouette against bright water. No close-up of the wound. |
| 1F-26 | **water splash, sea.** The impact seen from above and far away: a burst of water, a broken trail across the surface. |
| 1F-27 | **water splash, sea.** Then movement: the rider's secured form remains with the dragon. The dragon makes a weak effort to keep itself above water. Their future is not decided. |
| 3A-01 | **crowd, cloth.** A festival already in motion; begin at human height, traveling through the village (this exact route returns blocked in 3D). |
| 3B-08 | **white scales, huge size.** Starlight resolves: white scales take color from daylight, silver highlights, soft gray beneath, a suggestion of crystal-like facets (not transparent crystal, no glow). |
| 3C-02 | **crowd.** The deep, broad wing noise seems to come from the buildings around the crowd. People start to move. |
| 3C-05 | **crowd.** The captain redirects guards to widen the flow. Coherent crowd motion: some to the arch (LEFT), others to the broad road (RIGHT). Nobody runs in circles. |
| 3C-11 | **breaking ground/timber, dust, white scales, crowd.** Her body strikes the edge of the festival structures and adjoining roofline. Timber breaks, tiles scatter, decorations vanish in dust. |
| 3C-12 | **breaking ground/timber, dust.** Back to the people: the force sweeps the abandoned stall into the square. |
| 3C-14 | **dust, crowd, cloth.** Several seconds of dust, cloth and moving feet, with the fountain edge and its central stone pillar as the continuous point of reference. |
| 3C-27 | **breaking ground/timber, dust.** The shock of air; debris strikes empty ground where people stood moments earlier. |
| 3C-28 | **breaking ground/timber, dust, white scales.** The single exterior wide shot establishing the actual physical damage. She pulls up beyond the roofs. No defending fleet, no new wounds. |
| 3C-32 | **cloth, dust, white scales.** The banner travels upward, briefly visible against her vast underside, then disappears into dust. |

The hard categories across the episode:
- **Talking faces (lip-sync):** 97 shots.
- **Faces in close-up:** 43 shots.
- **Crowds:** 20 shots.
- **Dust:** 33 shots.
- **Breaking things:** 8 shots.
- **Fire:** 2 shots.
- **Water impact:** 2 shots.
- **Newborn hatchling:** 11 shots.
- **Cloth and banners:** 14 shots.

Lip-sync tip: a free tool, Rhubarb Lip Sync (MIT license), can work out mouth shapes from a recorded voice line. For the animatic, voices can be temporary recordings by you or friends.

## Rules every shot follows

Each shot in `shotlist.json` carries the rules that apply to it. The main ones:

- **Abby's LEFT arm** is hurt by the scout's pass (1E). From then on she never uses it normally. It is in a **sling from 2C**.
- The scout loses its **LEFT wing**. The rider is **burned but alive** when last seen. Nobody says they are dead.
- **"Attack" never makes fire.** Charcoal breathes fire only after **"Fire"**, and only briefly.
- **Charcoal is never faster than the Slitherwing** in a straight line. He catches it with angles and turns.
- **Starlight has no wounds and breathes no fire.** The damage comes from her dive and her wings. She is about twice Charcoal's size.
- **Leaf starts the nip.** Charcoal lets him go **unharmed**. Leaf is always much smaller than Charcoal.
- **Abby says nothing** to the succession question: no words, no nod.
- **Flying shots keep one direction:** they travel left to right, with Leaf on the left and Charcoal on the right. The camera is on the island side, so it sees their right sides.
- **The scout's pass (1E):** it flies through the gap between Leaf and Charcoal, on Leaf's left (sea) side, away from the camera. That is why Abby's LEFT arm is the one hurt. The close-up of her arm is filmed from straight in front of Leaf, so her left arm shows on the right of the screen.
- **Cling keeps one map:** the arch is on the left and the broad road on the right, seen from the king's steps. The fountain with its stone pillar in the middle of the square is the landmark you can always see.

## Questions for you

All open questions from every planning file are collected, shortened and merged in `PRODUCTION_PLAN.md`.

1. Are you happy with an Episode 1 of about 25 minutes, or do you want to add new scenes?
2. The screenplay made Abby's injury her **left** arm as a suggestion. Is left right for your story?
3. Some parts of the screenplay are suggested additions: Starlight's second pass, the healer scene lines, and the ending order to "send word to King Fallen". Keep them?
4. Is the slightly choppier "on twos" look OK for the calm talking scenes? Or should everything be smooth?
5. For the final video, is "final-fast" (drawn at 1440p and sharpened up to 4K) good enough, or should it be native 4K?
6. Do you have drawings or pictures of how Charcoal, Leaf, Starlight and the people should look? Without them, every design is a temporary placeholder.

---

## Appendix: every shot, one line each

Shot sizes: EWS = extreme wide, WS = wide, MS = medium, CU = close-up, INS = insert (a detail), POV = what a character sees, CARD = black or text.
Marks: **5** = hardest, **4** = hard, *2s* = may be on twos.


### PROLOGUE+TITLE: Historical prologue and main title (1:43 expected)

| Shot | Size | What you see | Lines | Sec | Mark |
|---|---|---|---|---:|---|
| P-01 | CARD | Black screen. Before any image: waves folding against a rocky shore; a single seabird calls. |  | 4 |  |
| P-02 | EWS | Fade in: low view just above the water. Pale sky reflected between moving bands of deep blue. |  | 6 |  |
| P-03 | EWS | Camera travels toward an island whose high ground disappears into morning cloud. | L001 | 11.5 |  |
| P-04 | INS | A working hand secures a rope aboard the vessel. |  | 3.5 | *2s* |
| P-05 | MS | An anonymous sailor turns toward an unfamiliar sound above the fog. Face kept small/three-quarter; not a historical discoverer, no date. |  | 3.5 |  |
| P-06 | WS | The mist changes shape. Something passes beyond it, so large the eye first mistakes its shadow for cloud. Never resolve a dragon; no named dragon. |  | 6 | **4** |
| P-07 | MS | The sailor becomes still, seen from behind as a dark shape against the bright fog. |  | 3.5 | *2s* |
| P-08 | EWS | Landscape 1 (dissolve): a coastal settlement under a pale sky. | L002 | 8 |  |
| P-09 | EWS | Landscape 2 (dissolve): open sea to the horizon. | L002 | 8.5 |  |
| P-10 | EWS | Landscape 3: a forest reaching a cliff edge. Simple caption TARA over this unlocated land only, synced to the spoken word. | L003 | 2 |  |
| P-11 | EWS | Landscape 4: distant fortified walls. Caption SCRAPPER over this view only, synced to the spoken word. No other named place in view. | L003 | 2 |  |
| P-12 | EWS | Landscape 5: a misted island seen from open water, alone in frame. Caption VERDOR over this view only, synced to the spoken word. | L003 | 2 |  |
| P-13 | EWS | Landscape 6: calm open water under a high bright sky, no coastline. Caption CITADEL SEA over this water only, synced to the spoken words. | L003 | 2.5 |  |
| P-14 | EWS | Landscape 7: a different stretch of water (long swell under low cloud, different light), no coastline. | L003 | 2 |  |
| P-15 | EWS | The last landscape breathes: unreached islands on the horizon, no caption. | L003 | 11.5 |  |
| P-16 | WS | A wing-shaped cloud drifts across a brightening sky. | L004 | 11 |  |
| P-17 | WS | Match cut: the cloud shape becomes a dragon's immense shadow traveling across grass in the present day. Cut before the dragon is identified. | L005 | 7.5 |  |
| T-01 | CU | Main title DRAGON'S KINGDOM appears against the dark surface of a closed egg. A quiet scratch from within. Music gives way to the scratch. |  | 8 |  |

### 1A: The gold hatchling (2:34 expected)

| Shot | Size | What you see | Lines | Sec | Mark |
|---|---|---|---|---:|---|
| 1A-01 | CU | Close on the egg. A fine crack extends from an existing fracture, then stops. Something inside scrapes again, smaller than the prologue sound. |  | 5.5 | **4** *2s* |
| 1A-02 | WS | The chamber: warm, practical, maintained. Prepared bedding, bowls of water, folded cloth. No magical apparatus. Incubation method kept generic. |  | 6 |  |
| 1A-03 | MS | The attendant looks to the opening door. Queen Alexandria enters without announcement. |  | 5 | *2s* |
| 1A-04 | MS | Quiet exchange across the nest. | L006-L009 | 8.5 |  |
| 1A-05 | MS | Alexandria takes a place beside the prepared nest. She does not reach in. |  | 3.5 | *2s* |
| 1A-06 | INS | Another piece of shell shifts. The hatchling makes a faint effortful sound. |  | 3 | **4** *2s* |
| 1A-07 | INS | Birth stage 1: pressure beneath the shell; the surface flexes outward. |  | 4 | **4** *2s* |
| 1A-08 | INS | Birth stage 2: a fragment lifts away. |  | 3.5 | **4** *2s* |
| 1A-09 | CU | Birth stage 3: a small gold shape presses into the opening. Gold catches lamplight; it does not emit light. |  | 4.5 | **4** |
| 1A-10 | CU | Birth stage 4: a pause to breathe. The shape stills; a faint breath moves the shell edge. |  | 4.5 | **4** *2s* |
| 1A-11 | MS | The attendants watch carefully, not celebrating. |  | 2.5 | *2s* |
| 1A-12 | CU | The hatchling emerges awkwardly: wet, unsteady, exhausted. Gold along its scales; fragile movement. No glow. |  | 9 | **5** |
| 1A-13 | MS | The attendant, quietly. | L010 | 2.5 | *2s* |
| 1A-14 | CU | Alexandria lowers herself closer. Her expression softens. |  | 3 | *2s* |
| 1A-15 | CU | She whispers the ORIGINAL line, for the hatchling not the room. HOLD on her face for a beat after the line. | L011 | 5.5 | **4** *2s* |
| 1A-16 | MS | The attendant hears but does not respond. |  | 2 | *2s* |
| 1A-17 | INS | The hatchling tries to lift itself and slips against the broken shell. Alexandria supports it with a folded cloth. Practical tenderness. |  | 6.5 | **4** *2s* |
| 1A-18 | MS | At the doorway Abby leans in; Remi stands just behind her. The stillness is interrupted, not made comic. | L012 | 3 | *2s* |
| 1A-19 | MS | Alexandria, without looking away from the hatchling. | L013 | 1.5 | *2s* |
| 1A-20 | WS | Abby takes two quick steps, remembers the instruction, and slows. Remi follows, looking first at the shell, then at the gold hatchling. |  | 4 | *2s* |
| 1A-21 | MS | Siblings over the nest. | L014-L016 | 6.5 | *2s* |
| 1A-22 | CU | Abby crouches to its level. Its head shifts toward her voice. She almost reaches out, then looks to Alexandria. |  | 5 | **4** *2s* |
| 1A-23 | MS | Alexandria, gently. | L017 | 2.5 | *2s* |
| 1A-24 | MS | Remi asks; the attendant answers. | L018-L019 | 6 | *2s* |
| 1A-25 | CU | The hatchling goes still. For one unsettling instant Abby is afraid it has stopped breathing. |  | 4 | *2s* |
| 1A-26 | INS | Then its side rises. |  | 2.5 | **4** *2s* |
| 1A-27 | MS | Relief, quietly shared. | L020-L021 | 3 | *2s* |
| 1A-28 | WS | Remi asks about a name. Abby does not move her eyes from the hatchling. | L022-L024 | 6 | *2s* |
| 1A-29 | MS | Remi gives her a sideways look; she keeps watching the hatchling, satisfied she has annoyed him. | L025 | 3.5 | *2s* |
| 1A-30 | MS | Warm but final. Abby stands reluctantly; Remi turns toward the door. | L026 | 6 | *2s* |
| 1A-31 | WS | Exchange on the way out. | L027-L031 | 8.5 | *2s* |
| 1A-32 | MS | Abby looks back once at the gold hatchling. Then the children leave. |  | 4 | *2s* |
| 1A-33 | MS | Alexandria stays. Her hand rests near the newborn without restraining it. |  | 6 | *2s* |
| 1A-34 | INS | The tiny rise of its breathing (match-cut source). |  | 2.5 | **4** *2s* |

### 1B: Preparing to fly (1:10 expected)

| Shot | Size | What you see | Lines | Sec | Mark |
|---|---|---|---|---:|---|
| 1B-01 | INS | Match cut: the immense rise of Charcoal's side, close enough to read as dark terrain. Black scales show texture and natural highlights. |  | 4 |  |
| 1B-02 | WS | Move back until Remi comes into view beside him, reaching for a riding strap: scale established by an ordinary human action. |  | 8 | **4** |
| 1B-03 | MS | Charcoal's breathing moves the air around Remi (hair and cloth stir). Calm, unthreatened dragon. |  | 3.5 | *2s* |
| 1B-04 | WS | Farther across the field: Leaf sits upright like a dog; Abby in front of him straightens riding equipment. |  | 4 | *2s* |
| 1B-05 | MS | Leaf turns toward a noise and pulls the equipment out of reach. She calls him; Leaf turns back; she finishes fastening. | L032 | 5.5 | *2s* |
| 1B-06 | WS | Across a short distance (speaking range). They do not need to look at each other for every line. | L033-L036 | 7.5 | *2s* |
| 1B-07 | INS | Remi checks his own equipment instead of answering. |  | 3 | *2s* |
| 1B-08 | WS | An unnamed ground keeper stands well outside Charcoal's launch space. | L037 | 3 | *2s* |
| 1B-09 | MS | Remi acknowledges with a raised hand. |  | 2 | *2s* |
| 1B-10 | MS | Abby mounts Leaf by a low step or platform suited to his height. Remi glances over to check she is mounted before finishing his own preparations. |  | 6 | **4** *2s* |
| 1B-11 | WS | Remi climbs Charcoal's grounded access rig. No implausible jumps onto a gigantic dragon. |  | 6 | **4** *2s* |
| 1B-12 | WS | Both mounted at very different heights. | L038-L040 | 6 | *2s* |
| 1B-13 | CU | Leaf watches Charcoal, alert to the larger dragon's movement. |  | 3 | *2s* |
| 1B-14 | CU | Abby rests a hand against Leaf, directing his attention forward. | L041 | 3 | *2s* |
| 1B-15 | WS | Leaf rises. Charcoal stays in frame behind him: Leaf is small next to Charcoal yet huge next to Abby. |  | 6 |  |

### 1C: Takeoff and open sky (1:32 expected)

| Shot | Size | What you see | Lines | Sec | Mark |
|---|---|---|---|---:|---|
| 1C-01 | WS | Leaf takes off ahead of Charcoal. The first wingbeat shakes loose grass. |  | 4 |  |
| 1C-02 | MS | Abby leans into the familiar motion: experienced, comfortable, not a first ride. |  | 3 |  |
| 1C-03 | WS | Charcoal begins to move. The sound drops into a lower register. His wings open until the frame cannot contain them. |  | 7 | **4** |
| 1C-04 | WS | The camera stays at ground level long enough for the audience to understand what is above it. |  | 4 |  |
| 1C-05 | WS | He launches. Dirt lifts, turf breaks, loose stones jump, a rolling dust cloud crosses the empty launch area. Field was cleared: no bystanders. |  | 6 | **5** |
| 1C-06 | WS | The ground visibly devastated beneath and behind him; dust rolls toward and past camera. |  | 4 | **5** |
| 1C-07 | MS | Abby looks back through the departing dust. |  | 2.5 |  |
| 1C-08 | POV | Charcoal rises out of the dust with Remi a small fixed point on his back. |  | 5 | **4** |
| 1C-09 | CU | The joke is for Abby and the viewer; Remi is too far away to hear it, so there is no reply. | L042 | 4 |  |
| 1C-10 | EWS | The dragons climb over the coast: the shoreline first. |  | 6 |  |
| 1C-11 | WS | Their relation to one another (establishes the flight line used through 1E). |  | 5 |  |
| 1C-12 | EWS | The sea below; their shadows on the water. |  | 4 |  |
| 1C-13 | WS | Charcoal draws level. His larger shadow crosses the water. Leaf adjusts with quicker wingbeats. Remi waits until they are near enough to speak. |  | 6 |  |
| 1C-14 | MS | Speaking range check-in. | L043-L045 | 5 |  |
| 1C-15 | EWS | Their path curves along the coast. For a stretch nobody speaks. The camera travels with them rather than spinning around them. |  | 9 |  |
| 1C-16 | INS | Detail 1 (will change later): Abby using both hands comfortably on the grips/reins. |  | 3 |  |
| 1C-17 | CU | Detail 2: Leaf glances at Charcoal without fear. |  | 3 |  |
| 1C-18 | MS | Detail 3: Remi relaxed enough to look at the island instead of scanning the sky. |  | 3 |  |
| 1C-19 | EWS | The sky is beautiful because it can be watched without being attacked. Private freedom, not a military procession. |  | 8 |  |

### 1D: Siblings, succession, and the playful nip (1:59 expected)

| Shot | Size | What you see | Lines | Sec | Mark |
|---|---|---|---|---:|---|
| 1D-01 | MS | Remi looks toward the palace's distant position. |  | 2.5 |  |
| 1D-02 | POV | The palace, distant on the island. |  | 3 |  |
| 1D-03 | MS | He turns to Abby and begins casually, as if continuing a conversation that has occupied him more than he admits. ORIGINAL line, verbatim. | L046 | 8.5 |  |
| 1D-04 | CU | Abby says nothing. She looks ahead. No answer, no nod, no narration. The silence lasts long enough to become uncomfortable. |  | 4 | **4** |
| 1D-05 | MS | Remi gives himself an answer. ORIGINAL line, verbatim. | L047 | 2.5 |  |
| 1D-06 | WS | The dragons continue across open water. |  | 4 |  |
| 1D-07 | CU | A shallow smile flickers across Abby's face. She still does not answer. |  | 3 | **4** |
| 1D-08 | POV | She looks across Charcoal's enormous body, the effortless way he holds the air. |  | 4 |  |
| 1D-09 | CU | ORIGINAL line, verbatim. | L048 | 3 |  |
| 1D-10 | MS | Sibling exchange across the gap. | L049-L051 | 8 |  |
| 1D-11 | CU | Abby touches Leaf affectionately. Leaf turns one eye toward her voice. | L052 | 5 |  |
| 1D-12 | MS | Plain answer; he is not advertising a war. A little quiet afterward. | L053-L055 | 8 |  |
| 1D-13 | MS | Light teasing. | L056-L059 | 12 |  |
| 1D-14 | WS | Leaf edges closer to Charcoal. Abby gives a small corrective gesture. Leaf follows for a moment, then looks back at the larger dragon. |  | 6 |  |
| 1D-15 | MS | Warning Leaf. | L060 | 1.5 |  |
| 1D-16 | WS | Leaf makes a quick nip toward Charcoal: irritating, not damaging. Shown clearly once. |  | 2.5 |  |
| 1D-17 | CU | Charcoal turns his head slowly. No roar; his calm is the point. |  | 4 |  |
| 1D-18 | MS | Remi notices the turn and watches: attentive, not panicked. | L061 | 3.5 |  |
| 1D-19 | WS | Wide angle establishing both dragons and both riders. Charcoal opens his jaws and takes Leaf's whole head into his mouth. |  | 5 | **5** |
| 1D-20 | CU | Abby's astonished stillness. |  | 2.5 |  |
| 1D-21 | MS | Remi, more resigned than frightened, quietly to Charcoal. | L062 | 2.5 |  |
| 1D-22 | WS | Charcoal releases Leaf. Leaf jerks his head back, puts immediate distance between them, eyes forward. Leaf is uninjured. |  | 4 | **5** |
| 1D-23 | MS | Abby processing; Remi dry. | L063-L066 | 8.5 |  |
| 1D-24 | CU | Abby checks Leaf visually: uninjured. She rubs a hand against him, answering her earlier question better than her dialogue did. | L067 | 6 |  |
| 1D-25 | MS | Remi allows a small smile. Charcoal returns his head to the flight path as though the matter never deserved attention. |  | 3 |  |
| 1D-26 | MS | Lightness returns briefly. Keep it brief so the interruption feels sudden (no added hold). | L068-L069 | 2.5 |  |

### 1E: The first fast pass (0:56 expected)

| Shot | Size | What you see | Lines | Sec | Mark |
|---|---|---|---|---:|---|
| 1E-01 | WS | An ordinary flight shot. Leaf slightly behind and on the inland side of Charcoal. Island off their inland side; open water the other way. |  | 4.5 |  |
| 1E-02 | WS | A narrow shape appears at the far right edge of frame (ahead of them, beyond Leaf, toward the gap between Leaf and Charcoal), gone before its ident... |  | 2 |  |
| 1E-03 | WS | Coming head-on from ahead, the Slitherwing cuts through the gap between Leaf and Charcoal, passing close along Leaf's LEFT (seaward) side, the far... |  | 1.5 | **5** |
| 1E-04 | MS | Leaf rolls to his RIGHT; Abby is thrown against her restraint and her LEFT arm (screen RIGHT here) is wrenched violently. |  | 3 | **5** |
| 1E-05 | MS | Back on the inland side. Leaf catches himself. |  | 3 |  |
| 1E-06 | MS | Remi. | L070 | 1.5 |  |
| 1E-07 | CU | Abby tries to reply; her first breath will not form a word. Leaf's wingbeats rapid and uneven. |  | 3 |  |
| 1E-08 | MS | Remi. | L071 | 2.5 |  |
| 1E-09 | CU | Pain narrows her voice. | L072 | 1.5 |  |
| 1E-10 | MS | Remi. | L073 | 3.5 |  |
| 1E-11 | POV | The scout's silhouette reappears at a distance, crossing toward open water. |  | 3 |  |
| 1E-12 | MS | Remi looks between the scout and Abby. Charcoal has already tracked the movement with his head. |  | 3 |  |
| 1E-13 | WS | Remi brings Charcoal near Leaf long enough to see that Abby is secured and Leaf has regained stable flight. Remi checks before he leaves. |  | 5 |  |
| 1E-14 | MS | Short, clipped exchange. | L074-L076 | 7 |  |
| 1E-15 | CU | Leaf turns toward Verdor. Abby leans over him, speaking close. | L077 | 4 |  |
| 1E-16 | MS | Remi watches them commit to the route home. |  | 3 |  |
| 1E-17 | CU | He looks at the scout. His easy expression has disappeared. |  | 2 | **4** |
| 1E-18 | WS | Remi gives the command. Charcoal banks. NO FLAME: Attack is a physical-attack command. | L078 | 3.5 |  |

### 1F: Pursuit and the scout's fall (1:49 expected)

| Shot | Size | What you see | Lines | Sec | Mark |
|---|---|---|---|---:|---|
| 1F-01 | EWS | Establish all three paths once. Charcoal turns to intercept; he is not the faster species and closes through position, not speed. |  | 6 | **4** |
| 1F-02 | WS | The scout banks around a coastal outcrop or low bank of sea mist. |  | 4 |  |
| 1F-03 | WS | Charcoal takes the inside angle: a deliberate, expensive turn. The air shakes under each correction. |  | 5 |  |
| 1F-04 | MS | Remi stays low. |  | 2.5 |  |
| 1F-05 | WS | The scout rider looks back. Distance and helmet/clothing keep identity unresolved: no face, no insignia, no speech. |  | 3 |  |
| 1F-06 | WS | The rider directs the smaller dragon away from Charcoal's first reach. Charcoal's jaws close on empty air. He missed. |  | 4 |  |
| 1F-07 | CU | Remi. | L079 | 1.5 |  |
| 1F-08 | WS | The scout drops; Charcoal turns across rather than copying the whole maneuver. Water fills the background. |  | 6 | **4** |
| 1F-09 | MS | Abby approaching Verdor. She tries to shift her left arm and stops with a gasp. |  | 4 |  |
| 1F-10 | WS | Leaf corrects beneath her. |  | 3 |  |
| 1F-11 | WS | Back to Remi: the scout passes through an angle where its rider is exposed to Charcoal's line of fire. |  | 3 |  |
| 1F-12 | CU | Remi gives the breath-weapon command. | L080 | 1.5 |  |
| 1F-13 | WS | Charcoal releases a brief directed breath of flame, not sustained, not explosive. The scout tries to slip beneath it. |  | 3 | **5** |
| 1F-14 | MS | One short flash of burning outer cloth, a flinch, a cry lost in the wind. Cut away before any skin. |  | 1.5 | **5** |
| 1F-15 | WS | The rider remains strapped on and moving. The smaller dragon's turn loses coordination. Thin smoke trails. |  | 3.5 |  |
| 1F-16 | WS | The camera returns wide before contact so the viewer understands which dragon is on which side. |  | 3 |  |
| 1F-17 | MS | Charcoal catches the scout in his jaws. The scout struggles. No prolonged gore. |  | 3.5 | **5** |
| 1F-18 | MS | Remi is jolted and catches himself against the riding rig. |  | 2 |  |
| 1F-19 | CU | The command begins amid the struggle. | L081 | 1.5 |  |
| 1F-20 | WS | Charcoal's movement and the scout's desperate twist tear the scout's LEFT wing loose, shown in silhouette against bright water. |  | 3 | **5** |
| 1F-21 | CU | Remi's reaction. |  | 1.5 |  |
| 1F-22 | MS | The complete command. Charcoal releases and checks his next movement. His violence stops with the command. | L082 | 3 |  |
| 1F-23 | WS | The sudden imbalance of the falling dragon. Its remaining right wing cannot restore controlled flight. |  | 4 |  |
| 1F-24 | MS | Remi watches for where it will come down. |  | 2.5 |  |
| 1F-25 | EWS | Charcoal circles once at a distance, giving a clear position relative to the outcrop (no precise map). |  | 6 |  |
| 1F-26 | EWS | The impact seen from above and far away: a burst of water, a broken trail across the surface. |  | 4 | **5** |
| 1F-27 | EWS | Then movement: the rider's secured form remains with the dragon. The dragon makes a weak effort to keep itself above water. |  | 5 | **5** |
| 1F-28 | MS | Remi looks inland. |  | 2 |  |
| 1F-29 | POV | Leaf is a diminishing shape approaching home. |  | 2.5 |  |
| 1F-30 | CU | He looks back down and fixes the location in his mind. |  | 3 |  |
| 1F-31 | WS | Ordinary directional speech (not a new formal command). Charcoal banks toward home. | L083 | 4 |  |
| 1F-32 | WS | The sea closes over the last drifting trace of smoke. |  | 4 |  |
| 1F-33 | INS | Abby's right hand holding fast. Two injured parties, not a victory. |  | 3 |  |

### 2A: Return to Verdor (1:32 expected)

| Shot | Size | What you see | Lines | Sec | Mark |
|---|---|---|---|---:|---|
| 2A-01 | WS | Ground keepers see Leaf returning alone and too urgently. |  | 4 |  |
| 2A-02 | MS | One raises a hand; another notices Abby hunched over the saddle. The mood changes before anyone hears her. |  | 3 | *2s* |
| 2A-03 | MS | The keeper calls out. | L084 | 2.5 | *2s* |
| 2A-04 | WS | Leaf lands with more caution than before, keeping his rider steady. Abby flinches despite the care. |  | 6 | **4** |
| 2A-05 | MS | The green dragon turns immediately to look at her. |  | 2.5 | *2s* |
| 2A-06 | MS | Abby stays in the saddle, arm held in. | L085-L087 | 7 | *2s* |
| 2A-07 | WS | The keeper calls for assistance; a stable platform is brought alongside. No leaping, no two-armed sliding. |  | 5 | *2s* |
| 2A-08 | CU | The reassurance is for Leaf even though she is hurt. | L088 | 3.5 | *2s* |
| 2A-09 | MS | Leaf remains close. A keeper pauses rather than forcing past his watchful head. | L089-L090 | 6.5 | *2s* |
| 2A-10 | WS | With Abby's permission and Leaf watching, keepers help her down. One supports her balance; nobody moves the injured arm. |  | 7 | **4** *2s* |
| 2A-11 | MS | Standing. | L091-L092 | 4 | *2s* |
| 2A-12 | WS | Charcoal's shadow crosses the field. Everyone outside the assistance group clears back. |  | 3 |  |
| 2A-13 | EWS | A heavy landing disturbance, but away from Abby and Leaf. Do not bury the injured child in dust. |  | 6 | **4** |
| 2A-14 | WS | Remi dismounts by the established rig and hurries to Abby. Charcoal watches from behind him, quiet manner restored. |  | 6 | *2s* |
| 2A-15 | MS | Brother and sister. | L093-L095 | 5.5 | *2s* |
| 2A-16 | CU | Her look says the answer is inadequate; then the pain takes her attention again. |  | 3 | **4** *2s* |
| 2A-17 | MS | Remi to the keeper. | L096-L097 | 6 | *2s* |
| 2A-18 | WS | Abby is helped inside. She looks back toward Leaf. |  | 4 | *2s* |
| 2A-19 | MS | Leaf takes a step after her, then stops at the keeper's quiet presence and Abby's raised right hand. | L098 | 4.5 | *2s* |
| 2A-20 | CU | Hold on Leaf watching her go. Cut before it becomes a sentimental montage. |  | 3.5 | *2s* |

### 2B: Treatment and Remi's report (2:30 expected)

| Shot | Size | What you see | Lines | Sec | Mark |
|---|---|---|---|---:|---|
| 2B-01 | WS | Abby seated; left arm supported; riding outer layer loosened carefully. No graphic injury. |  | 4 | *2s* |
| 2B-02 | MS | The healer begins. | L099-L101 | 9 | *2s* |
| 2B-03 | MS | Remi stands too close because he does not know where else to be. The healer looks up. He steps back. | L102 | 4.5 | *2s* |
| 2B-04 | MS | The door opens; Alexandria enters. Her first look is at Abby's face, her second at the arm, her third at Remi. |  | 5 | *2s* |
| 2B-05 | MS | Mother and daughter. | L103-L105 | 6 | *2s* |
| 2B-06 | MS | Alexandria kneels/sits level with her daughter and lets Abby take her hand with the uninjured RIGHT hand. |  | 4 | *2s* |
| 2B-07 | MS | Alexandria to the healer. | L106-L107 | 6.5 | *2s* |
| 2B-08 | MS | The healer continues in broad, credible action (no instructional demonstration). Time for Abby's breathing to settle. |  | 6 | *2s* |
| 2B-09 | MS | Alexandria asks; Remi reports. | L108-L109 | 8 | *2s* |
| 2B-10 | MS | Alexandria's questions; his short answer. | L110-L112 | 4.5 | *2s* |
| 2B-11 | MS | Remi. | L113 | 6.5 | *2s* |
| 2B-12 | CU | Abby. | L114 | 3.5 | *2s* |
| 2B-13 | INS | Alexandria briefly squeezes Abby's hand. Her voice remains level. |  | 2.5 | *2s* |
| 2B-14 | MS | Questions about the rider. The limitation registers: he reports what he saw. | L115-L118 | 9.5 | *2s* |
| 2B-15 | MS | Remi does not answer immediately. | L119 | 3.5 | *2s* |
| 2B-16 | CU | Abby looks toward him. She has not heard what happened after she turned home. |  | 2 | *2s* |
| 2B-17 | MS | Remi answers; Alexandria asks; he qualifies. | L120-L122 | 6.5 | *2s* |
| 2B-18 | MS | The healer pauses only long enough to notice the room change, then continues. |  | 2.5 | *2s* |
| 2B-19 | CU | Alexandria. | L123 | 2 | *2s* |
| 2B-20 | CU | He makes himself finish. | L124-L125 | 9 | **4** *2s* |
| 2B-21 | CU | Abby looks down. |  | 2.5 | *2s* |
| 2B-22 | CU | Alexandria watches Remi without approval or condemnation. |  | 4 | **4** *2s* |
| 2B-23 | MS | Nobody supplies an easy answer. | L126-L128 | 7.5 | *2s* |
| 2B-24 | MS | Suspicion separated from knowledge. | L129-L131 | 10 | *2s* |
| 2B-25 | MS | Suspicion, not confirmation. | L132-L133 | 7 | *2s* |
| 2B-26 | MS | She releases Abby's hand only after a warning glance and checking the healer is ready. |  | 3 | *2s* |
| 2B-27 | MS | Quiet promise. | L134-L136 | 7.5 | *2s* |
| 2B-28 | WS | Alexandria steps to the open doorway and calls an unnamed royal messenger. Remi follows only as far as the threshold, staying in Abby's view. |  | 4 | *2s* |

### 2C: Santa Maria orders and sibling aftermath (1:44 expected)

| Shot | Size | What you see | Lines | Sec | Mark |
|---|---|---|---|---:|---|
| 2C-01 | MS | Alexandria gives the order. | L137-L138 | 10.5 | *2s* |
| 2C-02 | CU | Detail of the order: prepare for injured survivors. | L139 | 8 | *2s* |
| 2C-03 | MS | She looks at Remi. | L140 | 2.5 | *2s* |
| 2C-04 | MS | Remi points through the opening at the visible coastline: the outer rocks, his approach, where he saw the fall. No map. | L141 | 8.5 | *2s* |
| 2C-05 | POV | Through the opening: the point and the outer rocks. |  | 2.5 | *2s* |
| 2C-06 | MS | The messenger leaves immediately. | L142 | 3.5 | *2s* |
| 2C-07 | WS | The messenger runs down weathered steps. |  | 4 |  |
| 2C-08 | WS | He reaches the waiting crew and delivers the order (mimed under ambience; no repeated dialogue). |  | 4 | *2s* |
| 2C-09 | INS | Ropes handled. The name appears on the hull only if the lettering can be made legible. |  | 3 | *2s* |
| 2C-10 | WS | Supplies brought aboard. |  | 3 | *2s* |
| 2C-11 | MS | A lookout turns seaward. Preparations are beginning; the rescue is not shown or resolved. |  | 3 | *2s* |
| 2C-12 | WS | Abby now has her left arm in a sling. Remi sits nearby, with no task left to hide inside. |  | 3 | *2s* |
| 2C-13 | MS | Apology. | L143-L146 | 7.5 | *2s* |
| 2C-14 | MS | He looks toward the open door, thinking of the sky outside it. |  | 2.5 | *2s* |
| 2C-15 | MS | No laugh at first; then Remi lets out a small breath that nearly becomes one. Abby still pale and tired, still herself. | L147-L148 | 7 | *2s* |
| 2C-16 | MS | About Leaf. | L149-L152 | 7.5 | *2s* |
| 2C-17 | WS | Alexandria returns. Remi stands out of habit; she gestures for him to stay seated. For a moment she sees them as her children. |  | 5 | *2s* |
| 2C-18 | MS | Staying put. | L153-L154 | 5.5 | *2s* |
| 2C-19 | CU | Alexandria looks to the healer (off-screen R, established in 2C-17), then back to Abby. | L155 | 4 | *2s* |
| 2C-20 | WS | Outside: Leaf and Charcoal occupy separate parts of the grounds. Leaf watches the doorway. |  | 4 | *2s* |
| 2C-21 | MS | Charcoal lies still, breathing slowly. The calm that was amusing in the sky is more complicated now. |  | 5 | *2s* |

### 3A: Cling's festival and its king (2:16 expected)

| Shot | Size | What you see | Lines | Sec | Mark |
|---|---|---|---|---:|---|
| 3A-01 | WS | A festival already in motion; begin at human height, traveling through the village (this exact route returns blocked in 3D). |  | 6 | **5** |
| 3A-02 | INS | Hands exchange food. |  | 3 | *2s* |
| 3A-03 | WS | Fabric banners shift above the street. |  | 3 |  |
| 3A-04 | MS | A musician starts a phrase; another joins. (The musician is also repairing a loose fastening between phrases.) |  | 4 | *2s* |
| 3A-05 | WS | Children chase one another between adults who are working as much as celebrating. |  | 4 | **4** |
| 3A-06 | MS | The vendor keeps his stall steady on uneven stones; someone catches the corner again. | L156 | 6.5 | *2s* |
| 3A-07 | MS | Familiar banter. The musician smiles and helps straighten the cloth. | L157-L158 | 6 | *2s* |
| 3A-08 | WS | A parent carries a parcel while keeping a child close; a guard tries to see over decorations. |  | 4 | **4** |
| 3A-09 | WS | The King of Cling enters the square with a small escort. Respectful movement, not universal kneeling. |  | 5 | **4** |
| 3A-10 | MS | Accessible king. | L159-L161 | 7 | *2s* |
| 3A-11 | MS | He lets the people laugh and gestures for the music to continue. The guard captain scans the square. |  | 4 | **4** |
| 3A-12 | MS | Steps can wait. | L162-L163 | 4 | *2s* |
| 3A-13 | MS | The king notices a child trying to see around the adults and shifts aside, giving the child a view of the musicians. No speech about kindness. |  | 4 | *2s* |
| 3A-14 | MS | The innocent question. | L164-L168 | 9.5 | *2s* |
| 3A-15 | CU | The child considers the disappointing answer. The king gives a brief apologetic look and continues. Nobody remarks on the irony. |  | 3 | *2s* |
| 3A-16 | WS | From the steps at the edge of the square, the king takes in the gathering. A line of banners partly obscures the far sky. |  | 4 | **4** |
| 3A-17 | MS | The guard captain moves one banner aside so it cannot block the watchman's sight. |  | 3 | *2s* |
| 3A-18 | MS | The king begins; the vendor heckles from the crowd. | L169-L170 | 7 | **4** |
| 3A-19 | MS | His short thank-you. | L171 | 14.5 |  |
| 3A-20 | WS | The crowd responds. He allows it to settle. |  | 4 | **4** |
| 3A-21 | MS | The closing lines. | L172 | 10 | *2s* |
| 3A-22 | MS | Musicians lift their hands in exaggerated gratitude, then return to the tune. The last untroubled stretch begins. |  | 5 | *2s* |
| 3A-23 | WS | Escape geography 1: the parent and child move from the square toward the stone arch (screen LEFT). |  | 4 | **4** |
| 3A-24 | MS | Escape geography 2: the vendor stores an empty crate in the alley behind his stall. |  | 3 | *2s* |
| 3A-25 | WS | Escape geography 3: a guard checks the gate opening onto the broader road (screen RIGHT). |  | 3 | *2s* |
| 3A-26 | WS | The last entirely untroubled wide of the square, with the reference landmark (the fountain's raised edge and its central stone pillar) and the sepa... |  | 5 | **4** |

### 3B: The white dragon approaches (1:10 expected)

| Shot | Size | What you see | Lines | Sec | Mark |
|---|---|---|---|---:|---|
| 3B-01 | MS | A watchman looks up from the edge of the square. |  | 3 | *2s* |
| 3B-02 | POV | Something white lies against the cloud. It seems still because it is coming nearly toward him. |  | 4 |  |
| 3B-03 | WS | Its changing size exposes its approach. A white wing briefly separates from the cloud behind it. Not yet a full reveal. |  | 4 |  |
| 3B-04 | CU | The word is swallowed by the music. | L173 | 1.5 | *2s* |
| 3B-05 | MS | He raises his voice. | L174 | 1.5 | *2s* |
| 3B-06 | WS | The guard captain turns. A few people follow his gaze; others keep eating and talking because a dragon in the world is not automatically an attack. |  | 4 | **4** |
| 3B-07 | MS | The watchman points; the king follows the line of his hand. | L175 | 3.5 | *2s* |
| 3B-08 | EWS | Starlight resolves: white scales take color from daylight, silver highlights, soft gray beneath, a suggestion of crystal-like facets (not transpare... |  | 7 | **5** |
| 3B-09 | CU | The king, quietly. | L176 | 2 | *2s* |
| 3B-10 | MS | The captain sees the king's expression and does not ask again. | L177-L178 | 3.5 | *2s* |
| 3B-11 | MS | The captain starts the evacuation. | L179 | 5.5 | *2s* |
| 3B-12 | MS | The music falters one instrument at a time. |  | 4 | *2s* |
| 3B-13 | MS | The vendor looks up, then puts down what he is holding. |  | 3 | *2s* |
| 3B-14 | MS | The parent pulls the child closer. |  | 2.5 | *2s* |
| 3B-15 | CU | High above the village: Queen Fall riding Starlight, introduced in a controlled close shot. Not labelled Alexandria. Expression intent, unreadable. |  | 3 | **4** |
| 3B-16 | WS | Re-establish her smallness against her dragon. |  | 4 | **4** |
| 3B-17 | POV | Queen Fall surveys the gathering. No speech about Tara's war policy. |  | 3 | **4** |
| 3B-18 | CU | Low-key authority; no shouting. | L180 | 2 |  |
| 3B-19 | WS | Starlight changes posture; her wings adjust; her line steepens into a physical dive. No breath weapon. |  | 4 |  |
| 3B-20 | WS | Ground level: the white shape that seemed beautiful becomes terrifying as it grows and lowers. Her shadow reaches the first roofs. |  | 5 | **4** |

### 3C: Starlight's attack (2:20 expected)

| Shot | Size | What you see | Lines | Sec | Mark |
|---|---|---|---|---:|---|
| 3C-01 | INS | The music has stopped. A banner snaps sharply. |  | 2 |  |
| 3C-02 | WS | The deep, broad wing noise seems to come from the buildings around the crowd. People start to move. |  | 3 | **5** |
| 3C-03 | MS | The captain reaches for the king. The king pulls toward the nearest people instead of the private exit. | L181 | 3.5 |  |
| 3C-04 | MS | The king directs the evacuation. | L182 | 5 |  |
| 3C-05 | WS | The captain redirects guards to widen the flow. Coherent crowd motion: some to the arch (LEFT), others to the broad road (RIGHT). |  | 5 | **5** |
| 3C-06 | MS | The vendor's stall cloth tears free and wraps across his view; he fights it aside. |  | 4 | **4** |
| 3C-07 | MS | The musician helps a fallen person rise. |  | 3 | **4** |
| 3C-08 | MS | The parent loses hold of the parcel and lets it go rather than letting go of the child. |  | 3 |  |
| 3C-09 | WS | Continuous flight path, part 1-2: high approach, descent toward the square, wings partly folded. |  | 3.5 | **4** |
| 3C-10 | EWS | Her wings open with crushing force as she changes angle over the village. |  | 3 | **4** |
| 3C-11 | WS | Her body strikes the edge of the festival structures and adjoining roofline. Timber breaks, tiles scatter, decorations vanish in dust. |  | 5 | **5** |
| 3C-12 | WS | Back to the people: the force sweeps the abandoned stall into the square. |  | 3 | **5** |
| 3C-13 | MS | The king and the captain move behind a stone support as fragments pass. | L183 | 4 | **4** |
| 3C-14 | MS | Several seconds of dust, cloth and moving feet, with the fountain edge and its central stone pillar as the continuous point of reference. |  | 5 | **5** |
| 3C-15 | WS | The parent reaches the arch with the child. A fallen beam blocks part of the route. |  | 3 | **4** |
| 3C-16 | MS | Two guards and the musician push the beam enough for people to pass. Brief effort under danger. |  | 5 | **4** |
| 3C-17 | MS | Through the arch. | L184-L186 | 6.5 |  |
| 3C-18 | WS | Above the dust, Starlight rises. It takes visible effort to redirect such an immense body. Queen Fall moves with the climb. No hovering. |  | 6 | **4** |
| 3C-19 | MS | On the ground the king emerges from partial cover. A guard reaches him. | L187-L189 | 7.5 | **4** |
| 3C-20 | CU | The king looks up. The warning is true. |  | 2 | **4** |
| 3C-21 | EWS | Broad view: Starlight's bank beyond the village, her whiteness catching the light, momentarily serene against the destruction. |  | 6 | **4** |
| 3C-22 | CU | Queen Fall looks down at the square. No smile, no battle speech. |  | 3 | **4** |
| 3C-23 | MS | At ground level the vendor crawls clear of the wrecked stall and looks screen LEFT toward the musician, still helping at the arch. |  | 4 | **4** |
| 3C-24 | MS | The musician abandons the last festival equipment at the arch and follows. Nobody repeats their earlier joke. | L190 | 4.5 | **4** |
| 3C-25 | MS | Camera stays with the people: the shadow sweeps over them. |  | 3 | **4** |
| 3C-26 | WS | A white expanse fills the gap between roofs. |  | 2.5 |  |
| 3C-27 | WS | The shock of air; debris strikes empty ground where people stood moments earlier. |  | 3.5 | **5** |
| 3C-28 | EWS | The single exterior wide shot establishing the actual physical damage. She pulls up beyond the roofs. No defending fleet, no new wounds. |  | 5 | **5** |
| 3C-29 | MS | The king helps the guard captain pull an injured adult villager into shelter. No named casualty. |  | 4 | **4** |
| 3C-30 | MS | He turns to the guard and waits for an acknowledgement rather than promising everyone is safe. | L191-L193 | 7.5 |  |
| 3C-31 | WS | Starlight's body clears the roofline; her wake pulls the remaining banner loose from the square. |  | 3 | **4** |
| 3C-32 | WS | The banner travels upward, briefly visible against her vast underside, then disappears into dust. |  | 4 | **5** |
| 3C-33 | MS | The captain finally gets the king under substantial stone cover. The king looks out through the opening. |  | 4 | **4** |
| 3C-34 | POV | The square he addressed only minutes before. |  | 4 | **4** |

### 3D: Aftermath and cliffhanger (1:20 expected)

| Shot | Size | What you see | Lines | Sec | Mark |
|---|---|---|---|---:|---|
| 3D-01 | EWS | Starlight climbs beyond the village, visible long enough to show the passes have ended, though nobody below can know if she will return. |  | 6 |  |
| 3D-02 | WS | High aerial: Queen Fall does not speak. Starlight's breathing and wings fill the shot. |  | 5 |  |
| 3D-03 | INS | Cut down to the smallness of the square's sounds. |  | 4 | *2s* |
| 3D-04 | WS | The same route as the opening festival shot, now blocked. The camera moves only as far as it can. |  | 6 | **4** |
| 3D-05 | MS | Familiar places changed: the torn stall. |  | 2.5 | *2s* |
| 3D-06 | MS | The silent music space. |  | 2.5 | *2s* |
| 3D-07 | WS | The empty steps; the stone arch still standing. |  | 3.5 | *2s* |
| 3D-08 | MS | The parent sits with the child under shelter. Both alive. |  | 5 | *2s* |
| 3D-09 | MS | The vendor finds the musician and takes his arm to check that he is standing. They say nothing. |  | 6 | *2s* |
| 3D-10 | WS | The king walks into the edge of the square with the guard captain. Dust marks his clothing. No crown gag. He has work to do. |  | 4 | *2s* |
| 3D-11 | MS | Practical orders under pressure. | L194-L196 | 10 | *2s* |
| 3D-12 | MS | The captain looks toward the receding white shape. | L197 | 4 | *2s* |
| 3D-13 | CU | Ending bridge (proposed): a messenger order, not the next episode's investigation. | L198 | 5 | *2s* |
| 3D-14 | WS | The captain leaves to act. The king remains a moment, looking at the damaged square. A faint gust moves one surviving strip of festival cloth. |  | 6 | *2s* |
| 3D-15 | EWS | Wide from above the roofs. The village is small in its landscape. Far beyond, Starlight is a white moving shape, beautiful again at a distance. |  | 7 |  |
| 3D-16 | CARD | Black. |  | 4 |  |

### END: End credits (0:40 expected)

| Shot | Size | What you see | Lines | Sec | Mark |
|---|---|---|---|---:|---|
| E-01 | CARD | End titles. Restrained main theme, no cheerful resolution. Credit ONLY real contributors and real tools/assets with their licenses. |  | 40 |  |
