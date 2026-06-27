# Untitled 3D Game — Design Base

> Working name: **TBD**. A 3D, first-person-rooted shooter with multiple modes.
> This document is the single source of truth for the game's design. It is
> intentionally isolated under `game/` and has **no relationship to any other
> project in this repository.**

Status: **design phase** — no engine/tech stack committed yet.
Last updated by design discussion: 2026-06-27.

---

## 1. The Pitch

A 3D shooter built around tight, tactical gunplay and a deep arsenal. Players
move with a full traversal kit — sprint, slide, crouch, crawl/prone — and fight
across three distinct modes that share one core combat feel.

---

## 2. Modes

The game ships with three modes. They share movement and combat systems but
differ in structure, goal, and allowed camera.

| Mode         | Structure                     | Players        | Perspective              |
| ------------ | ----------------------------- | -------------- | ------------------------ |
| **Campaign** | Story-driven missions         | Single-player  | **First-person only**    |
| **Multiplayer** | Competitive matches        | PvP, online    | **First-person only**    |
| **Zombies**  | Co-op survival vs. waves      | Co-op          | **First OR third person** (player's choice) |

### Campaign
- Narrative-driven mission structure.
- Locked to first-person for immersion.
- **Length: ~48 hours of total playtime**, accumulated across a series of
  missions. Each mission contributes enough runtime that, summed together, the
  full campaign runs roughly 48 hours. This is an epic-length campaign
  (most AAA campaigns are 6–15 hrs) — content scope is a first-class concern.
- **Structure** (linear / open-world / hub-and-spoke): **TBD** ("you'll see").
- **Era/setting:** **1985.** Cold-War-era tone.

#### Cold Open (campaign intro)
The campaign opens cinematically:
1. Open on a **helicopter flying in** toward the drop.
2. Location/date title card stamps in: **COLUMBIA, USA — 1985.**
   - *(Recorded as "Columbia, USA" per design. Flagged: distinct from
     "Colombia" the country — to be confirmed if the country was intended.)*
3. Briefing redacts itself for mystery:
   - **OBJECTIVE: CLASSIFIED**
   - **MISSION: CLASSIFIED**

The player drops in knowing nothing — the "classified" framing is a deliberate
mystery hook that the campaign pays off over time.

#### Opening Sequence — The Drop (Mission 1 intro)
Continues from the cold open:
- Fly over Columbia: below is **a huge pile of smoke and despair** — the city is
  devastated. The chopper heads straight toward it.
- The helicopter lands in a **clearing on top of a building** (rooftop LZ).
- Camera cuts to **inside the helicopter — the main character (the player)**.
- **Gear up:** the player picks up their **rifle and magazines** (likely the
  first interactive moment / control hand-off).
- The player **disembarks alongside their team**.

This is the cinematic-to-gameplay hand-off: the player takes control as they
gear up and step off the chopper with the squad.

#### The Squad
The player deploys with a team. Each member and their role:

> **TBD** — to be defined (see discussion). Roster, names, and roles pending.

### Multiplayer
- Competitive PvP.
- Locked to first-person for a level playing field.
- Modes/maps within MP: **TBD.**

### Zombies
- Co-op survival against escalating waves of zombies.
- **Only mode that allows third-person** — player toggles first ⇄ third.
- Progression within a match (rounds, upgrades): **TBD.**

---

## 3. Core Mechanics (shared across all modes)

### Movement / Traversal
- **Sprint** — fast directional movement.
- **Slide** — momentum slide, typically from sprint into crouch.
- **Crouch** — lowered stance for cover and accuracy.
- **Crawl / Prone** — go fully prone; lowest profile.
- (Stance transitions — slide-to-prone, etc. — to be defined during prototyping.)

### Combat
- **Guns are the core.** A deep arsenal — **hundreds of guns** to choose from.
  - Implies a weapon framework: categories, stats, attachments/loadouts (detail TBD).
- **Melee** — close-quarters backup attack.
- **Throwables:**
  - **Frag grenade** — lethal explosive.
  - **Concussion grenade** — disorient/stun.

---

## 4. Open Decisions (deliberately TBD)

These are intentionally unresolved and tracked so we settle them on purpose:

- [ ] **Game name** — to be decided later.
- [ ] **Setting & vibe** — modern military / post-apocalyptic / sci-fi / horror / other.
- [ ] **Tech stack / engine** — not committed. (Browser 3D via three.js/Babylon,
      or a full engine like Godot/Unity/Unreal — depends on scope & target platform.)
- [ ] **Target platform** — web, desktop, console-style?
- [ ] **Weapon system depth** — attachments, loadouts, unlock/progression.
- [ ] **Multiplayer netcode model** — out of scope until a vertical slice exists.

---

## 5. Build Philosophy

Design first, then a thin vertical slice. The first technical milestone should
prove the **core feel**: move (sprint/slide/crouch/prone) + shoot one gun in a
first-person 3D space. Everything else (arsenal breadth, modes, netcode) layers
on top of a combat core that feels good.
