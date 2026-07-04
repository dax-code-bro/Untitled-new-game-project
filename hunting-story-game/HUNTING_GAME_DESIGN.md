# Hunting Game Design — The Last Hunt

> This is a **standalone document for the hunting story game only**.
> It is intentionally separate from `LEGEND_DESIGN.md`, `legend.html`, and any
> first-person-shooter / Legend project files. Nothing here touches those.

---

## 1. The Pitch (one line)

A story-driven hunting game where every animal you track pulls you deeper into
the woods — and deeper into why you came out here in the first place.

---

## 2. Working Title

**The Last Hunt** *(placeholder — swap for whatever you land on)*

---

## 3. Story — by Dax

### Premise
**John Matthews, 24.** Recently married, with a three-month-old at home. The
family hunting lodge has been in the Matthews family for **six generations** —
until this season. John's uncle was diagnosed with **transthyretin amyloid
cardiomyopathy (ATTR-CM)**, and the only way he could afford the treatment
that can stop it was to sell the lodge.

The sale is agreed, but the papers haven't fully turned in yet. So for one
last stretch of the season, the lodge is still theirs. John brings his wife
and the baby up, and spends his last memories with the place — hunting it the
way his family always has.

The uncle didn't lose the lodge. He *traded* it — six generations of the
family's past for the chance to stay in its future. That trade is the heart
of the story.

### Characters
| Character | Who they are | Notes |
|-----------|--------------|-------|
| **John Matthews** | 24, the player | New husband, new dad, last Matthews to hunt the land |
| **Emma** *(placeholder name — rename her)* | John's wife | Up at the lodge with him, baby in tow |
| **The baby** | 3 months old | Name + boy/girl up to you |
| **Uncle Dale** *(placeholder name — rename him)* | The uncle with ATTR-CM | Sold the lodge for the cure; too sick to make the climb this season, but he's on the phone |

### Chapter I (current focus — this chapter stays for a while)
Chapter I is not a quick level; it's the whole game right now, and it will
keep growing scene by scene.

**Scene 1 — Arrival (done, full dialogue):** John, Emma, and the baby drive
up. The key sticks. Dale calls the landline — "Freezer's yours to fill,
Johnny. One more season." Emma sends John out with his grandfather's rifle.

**The hidden wall (done):** when the arrival scene ends, the player is given
**no objective, no prompt, nothing**. They're simply in the woods. Behind the
scenes, the game requires them to **find, track, and hunt 3 animals of any
species** before the day ends and the story continues. The sky slowly slides
toward dusk as the bag fills, so progress is *felt*, never announced.

**Scene 2 — First dusk (done, dialogue):** porch lamp comes on, John hauls
his take down the ridge, Emma's line about Dale's freezer. "The first day of
the last season is over. There will be more of them — but not many."

**Later Chapter I scenes:** TBD — Dax is writing. (Tree-stand initials,
Emma/baby scenes at the lodge, more Dale calls, etc.)

### Later chapters (parked, story reserved)
2. **Six Generations** — the initials in the tree stand; room for one more.
3. **Thirty Days** — the buyer's agent calls; the weather turns mean.
4. **The Old Man of the North Woods** — the legendary buck Dale and John's
   grandfather chased for thirty years and never took. One final choice
   (The Hunter / The Keeper — see below).

### Tone
Quiet, patient, bittersweet — but warm, not bleak. The lodge is full of a
young family, not ghosts. The kills should *mean* something (filling Dale's
freezer one last time). Think "reflective," not "arcade."

### The Choice (ending)
In the north clearing — the spot Dale never let anyone hunt — the Old Man
steps out of the pines. Six generations hunted this land and no one ever
brought him home. On Friday, none of it is theirs.
- **Take the shot → "The Hunter"** — the lodge goes to strangers, but the Old
  Man comes home with the family. Dale laughs until he coughs. The good kind.
- **Lower the rifle → "The Keeper"** — whoever buys the land will never know
  what walks it. The lodge was never the building.

---

## 4. Gameplay (the part I can build)

- **Perspective:** simple first-person-ish scene view (browser canvas).
- **Dialogue scenes:** full click-through dialogue (speaker name + line, stage
  directions in italics) over drawn backdrops (the lodge at morning/dusk).
- **Core loop:** find sign → wait → the animal appears → steady your breath
  (reticle tightens when you hold still) → fire in the window.
- **Tracking:** before an animal shows, its **sign** fades in on the ground —
  hoofprints (deer), paired paw prints (rabbit), scratch marks (pheasant).
  Hover the reticle over the sign to *read* it and learn what's coming.
- **Species (3 so far):** whitetail deer (big, pauses to feed), cottontail
  rabbit (small, fast, hops, stops without warning), pheasant (slow on the
  ground, but flushes into the air if you miss or take too long).
- **Hidden progression:** no visible quotas or objectives during free hunt.
  Story gates sit "behind a hidden wall" (e.g., 3 animals of any species ends
  day one). The world signals progress instead — the light slowly dies.
- **More mechanics later:** Dax has a list coming; this section will grow.

---

## 5. Build Status

| Piece | Status |
|-------|--------|
| Isolated project folder | ✅ done (`hunting-story-game/`) |
| Design/story doc (this file) | ✅ done |
| Playable prototype (`hunting-game.html`) | ✅ v0.3 — Chapter I: dialogue scenes + free hunt + hidden wall |
| Your real story text | ✅ John Matthews premise wired in (names still placeholder) |
| Dialogue (arrival + first dusk) | ✅ v1 draft — Dax can rewrite any line |
| 3 species + tracking sign | ✅ deer / rabbit / pheasant |
| Art / sound | ⬜ later |

---

## 6. How to run the prototype

Open `hunting-story-game/hunting-game.html` in any web browser. No install, no
build step, no dependencies. Double-click it.

---

## 7. Handing this to a developer later (if you want a human)

Everything a developer needs to start is in this folder:
- **This doc** = the story + design intent.
- **`hunting-game.html`** = a working proof-of-concept they can expand.

Good things to ask a developer for: "keep the reflective tone," "expand the
prototype's hunt loop into the 4 chapters," "add real art/sound." Point them at
this folder and nothing else in the repo.

---

*Everything for the hunting game lives in `hunting-story-game/`. Other projects
in this repo are off-limits and untouched.*
