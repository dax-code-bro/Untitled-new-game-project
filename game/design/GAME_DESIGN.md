# Untitled 3D Game — Design Base

> Working name: **TBD**. A 3D, first-person-rooted shooter with multiple modes.
> This document is the single source of truth for the game's design. It is
> intentionally isolated under `game/` and has **no relationship to any other
> project in this repository.**

Status: **design phase** — no engine/tech stack committed yet.
Last updated by design discussion: 2026-06-27.

### Canon & Preservation Policy
**Nothing about this story is ever to be lost or summarized away.** Every line
of dialogue and every small detail is preserved verbatim in version-controlled
files and committed/pushed as it's created. Full per-mission scripts live in
`game/design/missions/`. This design doc is the bible; the mission files are the
complete screenplays.

**Canon index:**
- `game/design/GAME_DESIGN.md` — this design bible (modes, mechanics, characters,
  rating, open decisions).
- `game/design/missions/mission-01.md` — **Mission 1, full script** (every line,
  every beat).
- `game/design/missions/mission-02.md` — **Mission 2, full script** — the 1948
  Saudi Arabia flashback (framed by a 1985 boardroom).
- `game/design/missions/mission-03.md` — **Mission 3** — "Would You Like a
  Receipt With That Order?" *(full script — Lady Death mansion raid).*
- `game/design/missions/mission-04.md` — **Mission 4** — "Sins of the Past"
  *(title + placement locked; beats pending — Spike & Molotov trapped on the
  island).*
- `game/design/hydra-drone-h1.md` — **H1.0 drone codex** (full specs + the
  13-drone status tracker).
- `game/design/assets/` — reference art (`hydra-logo.png`,
  `hydra-drone-h1.0.png`).

**Target content rating: ESRB M (Mature 17+).** Tone is gritty, grounded
military drama. All writing (dialogue, story beats, characters) should hold
this bar.

**Content descriptors (intended):**
- **Intense Violence** — graphic, realistic combat.
- **Strong Language** — mature/profane dialogue.
- **Dark Humor** — gallows/black comedy amid the grim tone.
- **Use of Tobacco** — characters may smoke (period-appropriate for 1985).
- **Drug Reference and Use** — references to and depiction of drug use.
- **Use of Alcohol** — alcoholic substances depicted/consumed.

*(These are deliberate, world-appropriate elements of a mature war story — not
gratuitous. Depicted in service of character and setting.)*

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

#### Mission Naming Convention (important)
**Every mission's title is a deliberate FORESHADOW** — it hints at either the
**ending** of the mission or **what's going to happen** during it. Titles are
thematic and symbolic, never just literal objective names. When naming a mission,
the title should encode a meaning the player only fully understands after playing
it. (See each mission file's "Title Meaning" note.)

#### Recurring Format — Mission Briefings
Between missions, there's a **briefing sequence**: the team sits around **General
Abraham**, who lays out the next mission's details before they head out. This is
a recurring connective beat across the campaign (a hub for exposition, banter,
and squad selection).
- *(Note: Abraham may be informally called "Captain" or "Colonel" in dialogue —
  canon rank is still **four-star general.**)*
- **Squad selection happens here** — not every operator deploys on every
  mission. The briefing establishes who's going (see Mission 3: only Spike &
  Molotov deploy).

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
- **Weapon of choice:** the **PP919** — a compact, single-fire (semi-auto) SMG.
  *(Reads as an original/fictional in-game designation; no real-world "PP919"
  exists. Fine for the arsenal — flag if you meant a real model like the
  PP-91 KEDR or PP-19.)*
- **Personality / heritage / backstory:** *TBD.*

##### 4. General Abraham
- **Rank:** four-star general — the top brass attached to the team.
- **Name:** "Abraham" (first/last unconfirmed).
- **Signature weapon:** a **pure gold Colt M1911** pistol — a flashy, prestige
  sidearm befitting a four-star general.
- **Role & everything else:** *TBD — deliberately revealed throughout the story*
  ("you'll see"). Whether he deploys in the field or commands from above is part
  of the narrative.
- **Knows HYDRA deeply** — he's the one who briefs the team on the drones'
  fates (Mission 2 boardroom), reinforcing that he's been read in on HYDRA all
  along (ties to his secrecy at the Mission 1 regroup).
- **Rank — RESOLVED:** canonically a **four-star general.** "Captain" is only
  informal/colloquial shorthand (e.g. the writer/players calling him that) — NOT
  his actual rank. Always **General Abraham** in canon.

##### 5. Rodriguez "Spike" Hamilton — **THE MAIN CHARACTER (the player)**
- **Callsign:** "Spike" (between first/last: Rodriguez Hamilton).
- **Role:** **the player character.** This is who the player controls — the
  operator in the opening who gears up and steps off the chopper.
- **Family:** Spike is an **orphan** by 1985.
  - **Father — Diego** (playable lead of the 1948 flashback, Mission 2): survived
    HYDRA's first strike in Saudi Arabia and **told young Spike the story
    himself.** Later **died of old age, shortly after Spike's mother passed.**
  - **Mother:** deceased (before Diego). *(Name/details TBD.)*
  - Makes Spike's 1985 war with HYDRA **generational and personal** — fighting
    his late father's enemy, alone.
- **Specialty / personality / weapon / backstory:** *TBD — revealed throughout
  the story* ("we will see").

##### 6. "Payback" — the mystery operator
- **Pronoun:** she/her.
- **Codename:** "Payback." **No one knows her real name** — she operates solely
  under the codename.
- **Weapon style:** **no signature weapon — and no fixed weapon at all.** She's
  an **improviser / scavenger**, using whatever is around and available. Travels
  light and adapts to the battlefield (a fitting trait for a nameless ghost).
  - *Design implication:* mechanically she leans on **battlefield pickups** —
    dropped enemy guns, environmental weapons — rather than a fixed loadout.
- **Role / specialty / personality / backstory:** *TBD.*

#### Mission 1 — Combat Beats (continued from the drop)

After deploying on the rooftop, the mission continues:

1. **Descent.** The squad heads down into a **staircase**, moving slowly deeper
   into the building.
2. **Crash + first contact.** As the player finally gets out the door, an
   **F-16 crashes** right next to the player and the team. *("AF 16" read as an
   Air Force F-16 — flag if it's something else.)* Molotov and the rest **move
   out behind cover**.
3. **First wave (tutorial fight).** ~**16 enemies** attack. They have
   **deliberately poor accuracy** (niche/low threat — this is the opening fight)
   and **one burst of the M16 drops each one**. The player also gets
   **supporting fire from teammates.** *(Design intent: a confidence-building
   intro encounter that teaches shooting + cover.)*
4. **Reach the clearing.** Pushing toward the main area, the squad finds a
   **clearing / safe pocket where enemies can't reach them** — a beat to regroup
   and give orders.
5. **Squad split (orders from Fox):**
   - **Fox → Molotov:** *"Molly, you're with me."* Molotov nods.
     *(Fox's nickname for Molotov: "Molly.")*
   - **Fox → Striker:** *"Mr. 24, stay attentive."* *(Fox's nickname for
     Striker, the 24-year-old rookie: "Mr. 24.")*
   - **Assignment:** **Striker + Payback clear the way for Spike** (the player).
   - **Objective set:** **take out a sniper in a watchtower** not far ahead.

This establishes the squad fighting as two elements — **Fox & Molotov** as one
pair, **Striker & Payback escorting Spike** toward the watchtower sniper.

6. **Fighting through the city.** The squad pushes slowly through, **everyone
   under heavy fire, clearing wave after wave** of enemies.
7. **Landmark reached:** **Torre del Reloj (the Clock Tower).**

> **⚠ Setting flag (important):** **Torre del Reloj** is the iconic Clock Tower
> gate of **Cartagena, Colombia** (the country). This is strong evidence the
> campaign is set in **Colombia**, not "Columbia, USA" as recorded at the title
> card. **Decision needed:** is it Colombia (the country) — which would update
> the opening title card to "CARTAGENA, COLOMBIA — 1985" — or a deliberate
> fictional "Columbia, USA" that happens to share the landmark name?

#### Mission 1 — Scene: The Clock Tower (Torre del Reloj)

**Gameplay flow:** push into the Clock Tower → climb the tower (ladder or
staircase, whichever the tower has) → **stealth-kill two guards** sniping the
team from the top → **pick up / reload their sniper rifle** → scope across the
city → spot **three friendly US Army tanks** rolling in to support → then
**several black HYDRA tanks** appear bearing the three-headed serpent crest.

**Dialogue script:**

> *(The trio — Spike, Striker, Payback — stack at the base of the tower; the
> stairs wind up into the dark.)*
>
> **PAYBACK:** *(low)* Two up top. Snipers — they've got eyes on Fox's element.
> **STRIKER:** *(whisper)* How do you wanna—
> **PAYBACK:** Quiet. Blades. Spike, take the left. I've got the right.
>
> *(Player climbs and stealth-kills the first guard; Payback takes the second.)*
>
> **STRIKER:** *(radio, hushed)* Mr. 24's got the stairs. Go.
> **PAYBACK:** Clear. Grab the rifle — you'll want the glass.
>
> *(Player reloads the dropped sniper, aims down sights, zooms over the city.)*
>
> **FOX:** *(radio)* Spike, talk to me. What do you see?
> **SPIKE:** ...Armor. Three tanks, rolling in from the north.
> **STRIKER:** Those ours?
> **SPIKE:** US Army markings. Cavalry's here.
> **FOX:** *(radio)* About bloody time.
>
> *(Beat. More tanks roll in at the far end — black, unmarked. The scope tightens
> on the hull: a three-headed serpent.)*
>
> **SPIKE:** ...Wait.
> **STRIKER:** What? What is it?
> **SPIKE:** More armor. But they're black. No US markings.
> **PAYBACK:** *(cold)* Zoom in. The hull.
> **SPIKE:** There's a symbol. Some kind of snake. Three heads.
> **FOX:** *(radio, long pause)* ...Say that again.
> **PAYBACK:** *(quiet)* Hydra.
> **STRIKER:** Who the hell are Hydra?
> **FOX:** *(radio, grim)* Trouble we were told didn't exist. Everyone — off the
> X. Now.

---

### Antagonist Faction — HYDRA

- **First appearance:** Mission 1, the Clock Tower reveal — black tanks bearing
  the crest roll in after the friendly US Army armor.
- **Emblem:** a **three-headed serpent** above the wordmark **HYDRA**.
  - Asset: `game/design/assets/hydra-logo.png` (provided reference).
- **Role:** the campaign's shadow enemy — a force "we were told didn't exist."
- **History — exists since at least 1948** (see Mission 2). In 1948, in Saudi
  Arabia, a HYDRA scientist launched a **rocket into space** that deployed
  **~13 capsules worldwide**, scattering in different directions — almost
  certainly the **seeding event** for HYDRA's global presence in 1985.
- **HYDRA drones** — fast, lethal transforming machine-creatures (quadruped ⇄
  biped) deployed from those capsules; can effortlessly kill trained soldiers
  (first seen 1948). Full specs + the 13-drone status tracker in
  `game/design/hydra-drone-h1.md`. Key traits: immune to bullets/fire/water,
  *stronger as they overheat*, **vulnerable to explosives**, blind to normal
  vision (thermal/night only).
- **Drone 9 (sentient, rogue):** one drone went **sentient** and works as a
  **bodyguard-for-hire** — an independent wildcard with major character
  potential (ally / boss / recruit).
- **Not all loyal** — HYDRA's own soldiers aren't all believers (the 1948
  scientist's guards turned on him). Loyalty-vs-coercion is a usable theme.
- **Details (leaders, goals, full tech):** *TBD.*

> **Naming note:** "HYDRA" is also the name of a famous Marvel Comics villain
> organization (though Marvel's emblem is a skull with tentacles, not a
> three-headed serpent). Flagging only in case you want a fully original name to
> avoid the association — totally fine to keep if the overlap is intentional.

#### Mission 1 — Scene: Anti-Tank Stand & Regroup

**Setup:** The player learns the captured sniper is loaded with **anti-tank
rounds** (an anti-materiel rifle). **Objective: destroy the HYDRA tanks before
they breach the main line and overrun your men.**

**Gameplay (timed sniper sequence):**
- **3 tanks**, each takes **3 anti-tank shots** to kill (9 shots total).
- **Time pressure:** the tanks are rolling toward the main line — destroy them
  **before they breach** or your men get wiped. Fail state = the line falls.
- After all three are destroyed, **head downstairs** and back onto the
  battlefield.

**Anti-tank stand — dialogue script:**

> *(Spike still holds the captured rifle. Below, the black HYDRA tanks grind
> toward the main line, tracer fire lighting the smoke.)*
>
> **PAYBACK:** *(grabs the breech, racks a fat round)* Wait — this isn't a
> marksman rig. It's **anti-tank**. They came up here to crack armor.
> **STRIKER:** Then what's it doing pointed at *people?*
> **PAYBACK:** Doesn't matter what it *was* for. Spike — it matters now.
> **FOX:** *(radio, gunfire behind him)* Spike! Those tanks reach the line and
> we're done — the whole element, gone! You've got the high seat — *use it!*
>
> **SPIKE:** *(settling the scope)* Loading. Talk me on.
> **PAYBACK:** Treads first — slow 'em down. Then the turret ring. Breathe
> between shots.
>
> *(— FIRST TANK —)*
> **SPIKE:** First one's lined up.
> *(THOOM.)*
> **PAYBACK:** Tread's gone. He's blind and crawling. Finish him.
> *(THOOM. THOOM.)*
> **STRIKER:** *(whoops)* That's a kill — he's brewing up!
> **FOX:** *(radio)* One down — two to go, and they are *not* slowing!
>
> *(— SECOND TANK —)*
> **SPIKE:** Second's turning on Fox's position.
> **FOX:** *(radio)* I'm *well* aware! Less talking, more shooting, lad!
> *(THOOM. THOOM. THOOM.)*
> **PAYBACK:** Splash. Cooked.
>
> *(— THIRD TANK, closest to the line —)*
> **STRIKER:** Last one's on the barricade — they're gonna breach!
> **SPIKE:** Not today.
> *(THOOM. THOOM.)*
> **PAYBACK:** One more — center mass!
> *(THOOM. The third tank erupts. A beat — then cheering from the line below.)*
> **FOX:** *(radio, ragged)* ...Line holds. Bloody beautiful shooting, Spike.
> Get down here.
> **PAYBACK:** *(sets the rifle down, quiet)* ...They sent armor. For us.
> *(beat)* That's not a warning. That's a hunt.

**Regroup — dialogue script:**

> *(Spike descends into the smoke and wreckage. ABRAHAM is on the battlefield;
> he strides over and extends a hand.)*
>
> **ABRAHAM:** Good shooting, son. *(firm handshake)* You just bought us the line.
>
> *(The squad gathers — battered, rattled. Several look furious.)*
>
> **STRIKER:** Sir — with respect — what the hell was that? Those tanks. That
> symbol.
> **MOLOTOV:** *(rare, low — he almost never speaks)* Hydra.
> **STRIKER:** Who *are* Hydra? Why do they have armor? Why does nobody—
> **FOX:** *(stepping in)* Easy, Mr. 24.
> **PAYBACK:** *(quiet, eyes locked on Abraham)* ...He knows.
>
> *(All eyes turn to Abraham.)*
>
> **ABRAHAM:** *(flat)* That's none of your concern. For the current moment.
> **STRIKER:** None of our—? They almost wiped us out!
> **ABRAHAM:** And you're still breathing. Keep it that way. Move out.

**Story threads planted:**
- **Abraham knows what HYDRA is and is withholding it** — sets up a
  trust/secrecy arc with the squad.
- **Payback also recognizes HYDRA** (she named them at the tower, and clocks
  Abraham's secret here) — two characters in the know, the rest in the dark.
- **Molotov breaking silence** to say the name underscores how serious it is.

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
