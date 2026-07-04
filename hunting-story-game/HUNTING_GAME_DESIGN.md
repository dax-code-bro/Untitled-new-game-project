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

**The game is 3D.** Full first-person 3D world (three.js, vendored in
`lib/` — no internet needed, double-click still works). The current build is
**placeholder geometry only: flat colors, no textures, no custom shaders** —
by design. The team adds its own shaders, graphics, and textures later; this
build is the skeleton they skin.

- **Player:** true first-person controller — WASD to move, mouse look
  (pointer lock), click to fire. Collision with trees/rocks/lodge, world
  boundary at the treeline.
- **The world:** open pine woods (~170 trees), rocks, a clearing, and the
  lodge at the south edge with lit windows, chimney, porch — and a porch lamp
  that only comes on at dusk.
- **Dialogue scenes:** full click-through dialogue (speaker name + line,
  stage directions in italics) played over the live 3D world with a slow
  cinematic camera drift.
- **Core loop:** walk the woods → find sign → wait → the animal appears →
  stand still to steady your breath (crosshair tightens) → fire. Shots use a
  real raycast with spread scaled by unsteadiness.
- **Tracking:** track marks appear on the ground somewhere in the woods.
  Walk up to them to *read* the sign — it tells you what's feeding nearby.
  The animal spawns a little further along the trail.
- **Species (3 so far):** whitetail deer (walks/grazes), cottontail rabbit
  (small target, hops), pheasant (flushes into the sky when spooked). All
  flee if you miss near them or walk too close.
- **Hidden progression:** no visible quotas or objectives during free hunt.
  Story gates sit "behind a hidden wall" (3 animals of any species ends day
  one). The world signals progress instead — the sky slides to dusk, the sun
  drops orange, the porch lamp comes on.
- **More mechanics later:** Dax has a list coming; this section will grow.

### Files
| File | What it is |
|------|-----------|
| `hunting-game.html` | **The game** (3D). Open in any browser. |
| `lib/three.min.js` | three.js r149, vendored so the game runs offline |
| `prototype-2d.html` | the earlier 2D prototype, kept for reference |

---

## 5. Build Status

| Piece | Status |
|-------|--------|
| Isolated project folder | ✅ done (`hunting-story-game/`) |
| Design/story doc (this file) | ✅ done |
| Playable game (`hunting-game.html`) | ✅ v0.4 — **3D**: first-person player, Chapter I dialogue, free hunt, hidden wall |
| Placeholder art (flat colors, no textures/shaders) | ✅ by design — team art pass comes later |
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
