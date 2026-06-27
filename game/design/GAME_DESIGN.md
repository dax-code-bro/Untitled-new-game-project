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
The player deploys with a team. Roster (being defined member by member):

##### 1. Webber "Molotov" Newman
- **Callsign:** "Molotov" (sits between first/last name: Webber Newman).
- **Demeanor:** exceptionally quiet — almost never talks. Dead serious, with
  the occasional flash of humor.
- **Look:** full-covering ski mask, spray-painted with **fire and a Molotov
  cocktail** (origin of the callsign).
- **Role / specialty:** the squad's **brute-force all-rounder** — versatile and
  heavy-hitting, can fill any gap in a fight.
- **Heritage:** German American.
- **Signature weapon:** **M16** (read from "in 16"; era-appropriate for 1985)
  with a **flame charm hanging off the side**, matching his fire motif.
- **Rank / backstory:** *TBD.*

##### 2. James "Fox" Carter
- **Callsign:** "Fox" (between first/last: James Carter).
- **Age / heritage:** **65 years old** (born 1920; as of the 1985 setting), **Irish**.
- **Archetype:** grizzled, battle-hardened war veteran — implied elite
  special-forces / SWAT skillset (see service record).
- **Role / specialty:** **Team leader and founder** — he created the unit and
  commands it. SWAT-caliber veteran skillset.
- **Signature weapon:** **Benelli M3 Super 90** combat shotgun (swapped from
  "Bonelli M4" to stay closer to the 1985 era; M3 debuted 1989).
- **Personality:** *TBD.*

###### Service Record (40 years of combat)
A veteran of three eras of warfare:

**1. World War II (1939–1945) — age 19–25**
A young, fierce fighter in the most brutal combat in human history. Likely
volunteered for the newly formed elite **British Commandos** or the **SAS**.
- **Second Battle of El Alamein (1942):** desert warfare in North Africa
  against Rommel's Panzer armies.
- **D-Day & the Battle of Normandy (1944):** storming the beaches of France /
  dropping behind enemy lines as a paratrooper.
- **The Scheldt / Arnhem (1944):** grim, muddy close-quarters infantry warfare
  clearing entrenched German positions.

**2. The Korean War (1950–1953) — age 30–33**
Stayed in service after WWII; deployed to Korea with the British Army (e.g. the
**Royal Ulster Rifles**, famous for its Irish soldiers).
- **Battle of Happy Valley (1951):** a freezing winter rearguard action against
  a massive Chinese Red Army breakthrough outside Seoul.
- **Battle of the Imjin River (1951):** block-by-block urban defense and
  hilltop trench warfare under overwhelming artillery fire.

**3. The Congo Crisis / Niemba Ambush (1960) — age 40**
Ireland's first deadly UN peacekeeping mission. As a 40-year-old veteran, now a
high-ranking **Sergeant / officer** leading young Irish troops.
- **The Niemba Ambush:** a real, tragic, legendary event — an Irish patrol cut
  off and ambushed by overwhelming numbers, ending in brutal hand-to-hand
  combat; a defining moment of bravery in Irish military history.

> **Timeline:** born **1920** — age 19 in 1939 (WWII), 30 in 1950 (Korea), 40
> in 1960 (Congo), and **65** in the 1985 setting. All battle-ages consistent.

##### 3. John "Striker" Jones
- **Callsign:** "Striker" (between first/last: John Jones).
- **Pronoun:** he/him.
- **Age:** ~24 — the **fresh recruit / new blood** of the squad (the rookie).
- **Role / specialty:** *TBD* (rookie archetype; finding his footing).
- **Weapon of choice:** a **compact, single-fire (semi-auto) SMG**
  (specific model *TBD* — period-fitting compacts: Micro/Mini Uzi, MAC-10/11,
  MP5K).
- **Personality / heritage / backstory:** *TBD.*

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
