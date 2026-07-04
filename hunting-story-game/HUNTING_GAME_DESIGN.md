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

### Chapters (each is a "hunt")
1. **Coming Home** — John arrives with his family. The gate key still sticks.
   Dale calls: "Freezer's yours to fill, Johnny. One more season."
2. **Six Generations** — John finds six sets of initials carved in the tree
   stand, the oldest nearly grown over. There's room for one more.
3. **Thirty Days** — the buyer's agent calls the lodge landline. Thirty days
   until the papers turn in. The weather turns mean, like the woods heard it.
4. **The Old Man of the North Woods** — the legendary buck Dale and John's
   grandfather chased for thirty years and never took. One final choice.

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
- **Core loop:** watch the treeline → an animal appears → line up your shot →
  control your breathing (aim steadies then drifts) → fire in the window.
- **Tracking:** between animals, follow tracks/sounds that hint what's coming.
- **Patience meter:** rushing scares animals off; waiting is rewarded.
- **Story beats:** short narrative text between hunts (pulled from Section 3).

---

## 5. Build Status

| Piece | Status |
|-------|--------|
| Isolated project folder | ✅ done (`hunting-story-game/`) |
| Design/story doc (this file) | ✅ done |
| Playable prototype (`hunting-game.html`) | ✅ v0.2 — runnable in a browser |
| Your real story text | ✅ John Matthews premise wired in (names still placeholder) |
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
