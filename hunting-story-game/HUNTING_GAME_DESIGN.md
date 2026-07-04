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

## 3. Story (this is your part — placeholders you can rewrite)

The story is **yours to write**. What's below is scaffolding so the game has
something to run on. Replace any of it.

### Premise
You play as a hunter returning to the woods where your grandfather taught you to
hunt. He's gone now. You told him you'd come back one last season. The forest
remembers you even if no one else does.

### Chapters (each is a "hunt")
1. **The First Light** — an easy morning hunt. Learn to track, aim, breathe.
2. **The Cold Trail** — the animals get warier. You find something of your
   grandfather's out here.
3. **The Storm** — weather turns. Survival matters as much as the hunt.
4. **The Last Hunt** — one final animal, one final choice: take the shot, or don't.

### Tone
Quiet, patient, a little lonely. Not a gore-fest. The kills should *mean*
something. Think "reflective," not "arcade."

### The Choice (ending hook)
The final chapter should let the player **choose not to shoot**. Two endings:
- Take the shot → "The Hunter"
- Lower the rifle → "The Keeper"

*(You can rewrite all of this — it's placeholder story to give the build shape.)*

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
| Playable prototype (`hunting-game.html`) | ✅ v0.1 — runnable in a browser |
| Your real story text | ⬜ your turn |
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
