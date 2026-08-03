# MOOR — Design Base

> Working name: **MOOR**. An open-world sandbox city game.
> Playable build: **`site/city.html`** (self-contained, opens at `/city.html`).
>
> This project is **isolated**. It has no relationship to `game/` (the mature
> military shooter design) or to the Legend AI app. Renaming is free — the name
> appears only in `site/city.html` and this file.

Status: **playable vertical slice**. Last updated 2026-08-03.

---

## 1. The Pitch

A living 100-square-mile world that **never tells you what to do**.

No tutorial. No mission markers. No opening cinematic explaining your goals. You
spawn on a street in Moor City and the world is simply already running — traffic
jamming, people walking, sirens somewhere, deer in the hills. Everything you can
do is available from the first second, and the game announces none of it.

Follow every traffic law forever, or name your own organization five minutes in.
Both are the game. The only limit is your imagination.

**Family-friendly.** Heists, chases, mafias and police — but nobody bleeds and
nobody dies. Cops **arrest** you. People dive out of the way of cars. The tone is
cartoon-caper, not crime-drama.

---

## 2. The World — hard numbers

100 square miles, modelled as a 16,000 × 16,000 unit map on a 128 × 128 terrain
grid (1 "mile" = 1,600 units).

| Share | What | Verified |
| ----- | ---- | -------- |
| **30%** | Water — one large ocean across the south-east, plus three massive lakes | **30.00%** |
| **40%** | Built-up — cities, neighbourhoods, small towns; **every building enterable** | **40.00%** |
| **30%** | Wild — mountains, forest, grassy hills, beaches, open wildlife | **29.99%** |

The ratios are not approximate. Terrain is classified by **percentile threshold**,
so the split is exact by construction and is displayed on the title screen and
the full map.

**Six settlements**, placed procedurally on solid, spread-out ground:

- **MOOR CITY** — the big one, downtown towers
- **FAIRBAY**, **NORTHRIDGE** — neighbourhoods
- **PINE HOLLOW**, **SALT CREEK**, **ELDER MILL** — small towns

Districts grow outward from their centres by weight, so the city sprawls and the
towns stay small. Highways are force-routed between neighbouring districts (with
bridges over water) so the map is always traversable.

**Generated per world:** ~3,100 buildings, ~1,400 road segments, ~14,700 trees
and rocks. Generation takes **~460 ms**.

### Model reuse

Explicitly allowed, and load-bearing. Interiors are built from a **modular kit**
(shelf rows, counters, tables, beds, desks, vault) assembled per building type
with a per-building seed. That is what makes 40 sq mi of enterable space possible
instead of impossible.

---

## 3. What's in the playable build

### Traffic — the headline
- Cars route a real road graph; varied models and colours, duplicates allowed
- **Traffic lights** at busy intersections → organic jams
- Cars queue behind each other, slow for the player on foot
- **Honking** when stuck; after ~9s a driver **gets out and yells** ("MOVE IT!",
  "MY BUMPER!", "GREEN MEANS GO!")
- **Crashes** with debris particles; wrecked drivers climb out angry
- ~50 vehicles live around the player at once, streamed in and out

### Police & crime
- 0–5 star wanted system with heat decay
- Police **route along roads toward you** when you're wanted, run red lights,
  and switch to direct pursuit within a star-scaled radius
- Arrest on sustained contact → fine (25% of cash), released downtown, 5 hours pass
- **Crimes:** rob a store register, rob a bank teller, crack the **vault**
  ($2,200–$7,400, 4 stars), steal an occupied car
- No weapons, no combat, no gore — you rob, you run, you get caught or you don't

### Your own organization — the soul of it
- **The game never mentions this exists.** It is one entry in your phone menu.
- Found it any time, from second one. **Name it whatever you want.**
- Recruit any pedestrian for $500 — they follow you in a crew
- Influence grows with every crime; disband whenever

### Freedom
- Enter **any** building — 10 types, each with generated interiors
- Buy property (houses, apartments); apartments charge **daily rent** and you
  lose them if you can't pay
- **Sleep** in your own bed to skip to morning (also saves)
- Shops: general store, outfitter, electronics, gas station, diner
- **A game inside the game** — buy a console, plug it into *your own* TV, play
  BLOCK RUNNER, and the score pays out real money
- **Fishing** — timing minigame; 24 species, **correctly split** between
  freshwater and ocean; rarer fish are worth more
- **Wildlife** — 26 species across forest / mountain / grassland habitats, each
  with real habitat rules. Family-friendly "hunting": a **Field Camera** tags
  them for the Field Guide and pays out
- Day/night cycle (1 day = 12 real minutes), lit windows, headlights, street lamps
- Minimap, full map with district labels, phone menu, Field Guide, save/load

### Controls — stick + two buttons, by design
Everything is reachable with a joystick and A/B, so it plays identically on a
phone, a controller and a keyboard.

| Input | On foot | Driving | Menus |
| ----- | ------- | ------- | ----- |
| Stick / WASD / arrows | Move | Steer + throttle | Navigate |
| **A** (Space) | Context: enter, talk, take, fish, record | Get out | Select |
| **B** (X) | Run | Brake | Back |
| **Hold B** | Phone | Phone | — |

The context action is a single button that reads the situation, so there is never
a second thing to learn.

---

## 4. Verification

Tested headless (Chromium) on desktop (1280×800) and phone (390×844) viewports.

- **0 errors**, 0 console errors, across every system
- **59–60 fps** on foot and driving, in the densest downtown
- Terrain ratios exact: 30.00 / 40.00 / 29.99
- Driving: 0→146 mph acceleration curve, braking, ±135°/s steering, reverse,
  no turning while stopped
- **No soft-locks** — 6/6 head-on building crashes at full speed escaped in reverse
- Save/load round-trips money, org, property, and both Field Guides
- Fish correctly separated by water body; wildlife spawns 8–9 distinct species
  per wild biome

---

## 5. Deliberately not in v1

Called out honestly rather than quietly dropped:

- **Weapons and combat.** Left out pending a decision on tone (see below). The
  crime loop currently works entirely through robbery, chases and arrests.
- **"Thousands" of species.** There are **50** (26 land, 24 fish). For scale,
  Red Dead Redemption 2 — the most detailed world ever shipped — has about 200.
  The framework takes new species as one line each; the number is a content
  decision, not an engineering one.
- **Build-your-own house / build-your-own gun.** Property is buy-only for now.
- Swimming and boats — water blocks you on foot and bounces cars.
- Interiors are per-*type*, not per-*building* unique.
- Multiplayer, story missions, character creation.

**Scope note, stated plainly:** the full vision as described is larger than
GTA 6 — roughly a $1–2B, 2,000-person, decade-long project. This build is the
vertical slice that proves the *feel* at real map scale. Everything above is
expandable from here.

---

## 6. Open decision — needs an answer

**Where is the family-friendly line on weapons?**

The build currently assumes **cartoon / no-blood**: guns and heists can exist,
nobody bleeds, cops arrest rather than anything worse. Alternatives:

- **A — Cartoon (current default).** Slapstick, LEGO City-ish. Weapons could be
  added as non-harmful (paint, foam, water) props.
- **B — Realistic but restrained.** Serious tone, no gore, real consequences.
- **C — Something else.**

This answer changes art direction and several systems, so it is left open rather
than guessed.
