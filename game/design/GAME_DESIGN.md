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
- `game/design/ALL-IN-ONE.md` — **auto-generated combined snapshot** of every doc
  below, for easy reading/export. Regenerate after edits with
  `bash game/design/build-combined.sh`. *(The individual files are the source of
  truth; don't edit ALL-IN-ONE directly.)*
- `game/design/GAME_DESIGN.md` — this design bible (modes, mechanics, characters,
  rating, open decisions).
- `game/design/missions/mission-01.md` — **Mission 1, full script** (every line,
  every beat).
- `game/design/missions/mission-02.md` — **Mission 2, full script** — the 1948
  Saudi Arabia flashback (framed by a 1985 boardroom).
- `game/design/missions/mission-03.md` — **Mission 3** — "Would You Like a
  Receipt With That Order?" *(full script — Lady Death mansion raid).*
- `game/design/missions/mission-04.md` — **Mission 4** — "Sins of the Past"
  *(full opening + breather ending — island warzone, rebels, escape by cruise
  ship; 3-day voyage sets up Mission 5).*
- `game/design/missions/mission-05.md` — **Mission 5** — "A Lost Cause"
  *(opening scripted — voyage arrival, rescue chopper, ride to HQ; rest pending).*
- `game/design/missions/mission-06.md` — **Mission 6** — "Hellfire"
  *(cold-open scripted — immediate air scramble vs. the bomber swarm; rest
  pending).*
- `game/design/missions/mission-07.md` — **Mission 7** — "Industry"
  *(title + placement locked; beats pending).*

- `game/design/missions/mission-08-molotov-flashback.md` — **Mission 8
  (tentative)** — Molotov's backstory flashback *(complete)*.
- `game/design/missions/mission-09.md` — **Mission 9 — "The Reboot"** —
  Spike & Striker raid a HYDRA base near Africa for intel on Drone 9's latest
  user and a potential **owner of HYDRA** *(scripted + fracturing aftermath)*.
- `game/design/missions/mission-10.md` — **Mission 10 — "Whom Can We Trust Among
  Us?"** — Spike confirms Abraham, Molotov cripples him (brainwashing) *(scripted)*.
- `game/design/missions/mission-11.md` — **Mission 11 (title TBD)** — **the
  Abraham betrayal/massacre**: Apex annihilated, Fox executed, twins killed
  *(scripted)*.
- `game/design/missions/mission-12.md` — **Mission 12 (title TBD)** — Molotov's
  POV: races to warn the team, finds them all dead; breaks down over Fox's body
  *(scripted)*.
- `game/design/missions/mission-13.md` — **Mission 13 — "The Three Pillars of
  Ruin"** — 2000 era opens: hunt the three villains (Abraham, Prestige, Hunter
  "the Terrorist in Black"); time skip
- `game/design/missions/mission-14.md` — **Mission 14 — "The Pillar Made of
  Titanium"** — HQ renovation (gear degradation reversed), Assault-on-Hunter
  postponed; Hunter hunts Prestige.
- `game/design/missions/mission-15.md` — **Mission 15 — "The Pillar of
  Prestige"** — the medical place, the tile, the blood tunnel, **Drone 06**
  *(scripted w/ full dialogue)*.
  ("15 years later — Dec 31, 2000"); a prison, rows of **H1.0-pattern robots**
  *(scene; timeline resolved)*.
- `game/design/missions/mission-16.md` — **Mission 16 (title TBD)** — family
  council, the gunsmith parley (Hunter allied), homecoming, the salt-covenant
  treaty gift *(scripted)*.
- `game/design/missions/mission-17.md` — **Mission 17 (title TBD)** — the
  storming of Prestige's base; **playable Hunter**; the split bullet; **PRESTIGE
  DIES**; coda: the night of peace *(scripted — COMPLETE)*.
- `game/design/missions/mission-18.md` — **Mission 18 (title TBD)** — HYDRA is
  GONE; **Spike's dire hour** (practically a full cyborg) → **⚠⚠⚠ THE REVEAL:
  Spike is secretly Abraham's** (AI ghosts of Payback & the others planted in
  his head; the sanctuary trap) *(scripted)*.
- `game/design/missions/mission-19.md` — **Mission 19 (title TBD)** — the
  Antarctica expedition: the safe house, **the 87° surge, the GREEN
  CONTINENT** (climate shift), the mountain mine (⚠ "Everest"), **playable
  Spike stealth** (rocks/bribes/prisoner command), **the uprising** (Martin &
  Lewis), the family's arrival, the eve of the true rebellion *(scripted;
  in progress)*.
- `game/design/missions/mission-20.md` — **Mission 20 (title TBD)** — **the
  true rebellion** (pickaxes, the machine-gun fifty); **played as ATOMIC**;
  the hill: **Abraham shoots Atomic (POV death)**, **MOLOTOV EXECUTES SPIKE**,
  the third-person circle; Molotov shields Jonah (leg); the friendly-fire
  **AIRSTRIKE**; Cocktail POV → **the crack: JONAH KILLS ABRAHAM** (choice /
  fail state); **the exile** — father & son flee their own team. **☠ Spike,
  Atomic & Abraham KIA; all Pillars resolved.** Then: **THE END — credits
  montage** (pick up Elizabeth at the mansion; Molotov builds a house,
  settles with his family) + **end-credit scene: Molotov's apology at
  Spike's grave in a beautiful park.** **THE CAMPAIGN ENDS HERE** *(scripted
  — COMPLETE; M20 is the finale)*.

**Timeline chain:** 1985 (campaign M1–M12) → Dec 31, 2000 (M13 time-skip; epilogue
era M13–M20) → **campaign ENDS at M20** (credits; Molotov settles with his
family; Spike's grave) → late 2001 / post-9/11 (open-world mercenary mode —
Molotov in hiding as the secret contractor; the M20 exile is why).

**Known mission order so far:** 1 (Colombia/Columbia, classified) → 2 (1948
flashback + boardroom) → 3 "Would You Like a Receipt With That Order?" → 4 "Sins
of the Past" → 5 "A Lost Cause" → 6 "Hellfire" → 7 "Industry" → 8 (tentative,
Molotov flashback) → 9 "The Reboot" → 10 "Whom Can We Trust Among Us?"
→ 11 (title TBD, the massacre) → 12 (title TBD, Molotov finds them).
- `game/design/modes/new-mode-post-epilogue.md` — **New 4th mode** (operator-
  select, ~1 yr after the epilogue) *(premise + early roster)*.
- `game/design/modes/multiplayer.md` — **Multiplayer** — loadout slots
  (primary/secondary/lethal/tactical/POWER) + equipment (Hydro Gas, The Spider,
  HYDRA Hound, Da Vinci Tank, etc.).
- `game/design/modes/zombies.md` — **Zombies** — starts with the 🔒 sealed
  Broken-Spirit/Hound Easter egg (payoff deliberately unrevealed).
- `game/design/hydra-drone-h1.md` — **H1.0 drone codex** (full specs + the
  13-drone status tracker; plus the new **H2.1 bomber** generation).
- `game/design/hydro-hound.md` — **Hydro Hound** codex (HYDRA robot war-dog:
  full sheet specs + kill-unlocked skin system).
- `game/design/emp-shark.md` — **EMP Shark** allied anti-drone weapon spec.
- `game/design/factions.md` — **Factions** (the 5 main + notes).
- `game/design/arsenal.md` — **Arsenal** — the 200+ named guns (each with a unique
  attachment); master weapon catalog.
- `game/design/campaign-loadout.md` — **Campaign Loadout / Mission Board** —
  pre-mission Primary/Secondary/Lethal/Melee selection; the restricted
  campaign weapon + attachment lists; mission-by-mission unlock schedule
  (M1 fixed M4 → M19–20 everything).
- `game/design/operator-gear.md` — **Operator Gear** — switchable outfit
  sets for all playable operators, unlocked by mission progression (first
  set recorded: Molotov's "Flame On" — gangster tailoring, fire decals,
  glass amber mask).
- `game/design/dlc-sins-of-the-past.md` — **DLC "Sins of the Past"** — story-gap
  filler + a new Zombies mode + new guns *(⚠ name collides with Mission 4)*.
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

### Language Policy — profanity ESCALATES with the story (canon)
Profanity is a **damage meter for the team's soul.** It scales with how
battle-hardened and destroyed the characters are:
- **1985, early campaign (M1–M6):** disciplined soldiers — moderate military
  swearing (hell/damn/ass, occasional s-word); f-bombs reserved for true shock.
- **The dark turn (M7–M12):** heavier — s-words common; f-bombs land at impact
  moments (betrayals, deaths).
- **THE EPILOGUE (M13+):** **full strength, unfiltered.** These people are
  battle-hardened and completely destroyed — **they don't care anymore.**
  F-bombs are casual in combat chatter. The restraint is gone because the
  people it belonged to are gone.
- **Character calibration:**
  - **Dice / Atomic:** swear easily and often.
  - **Fox (1985):** swears Irish ("bloody," "feckin'").
  - **Hunter:** **never swears** — too composed; it makes him scarier.
  - **Molotov:** may swear **once in the entire game** (same law as the tear —
    save it, spend it where it detonates).
  - **Jonah (15):** swears like a teenager trying it out; **Atomic polices his
    mouth** (running bit + characterization).

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
| **New mode** *(TBD)* | Operator-select, **~1 yr after the campaign epilogue** | TBD | TBD |

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

#### Playable Characters (multiple POVs)
**Spike is the official main character** — the protagonist with the most
development and the most missions. **But the campaign hands the controller to
other characters for certain missions**, putting the player in someone else's
boots:
- **Mission 2** — played as **Diego** (Spike's father) in the 1948 flashback.
  (More flashback than mission, but the player still acts — it counts as a
  playable mission.)
- **Mission 7 "Industry"** — played as **Payback** alongside the **less-heard-of
  operators** (Brian/Jesse Wolford, Monroe Sydney) on their own op. This is how
  those background operators get their **development/spotlight**.
- Other POV-swap missions may follow this pattern. Spike remains the through-line
  and most-developed lead.

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

#### The Squad — **TEAM APEX**
The player's unit is called **TEAM APEX.** Founded and led by Fox; General
Abraham is the brass attached to it.
**⚠ The known roster below is NOT the whole team** — Team Apex has additional
members not yet introduced (TBD). The six documented so far:

##### 1. Webber "Molotov" Newman  — **(TURNED ON SPIKE — Mission 10)**
> **Status:** left Apex and went into hiding (Mission 9), then **confronted and
> CRIPPLED Spike in Mission 10** — stabbed him in the back, shot him, and left him
> paralyzed ("I can't feel my legs"). His stance: **"the system is wrong."** Half
> his mask broke in the fight, **revealing his burn-scarred face.**
> **Agenda — RESOLVED (tragic):** Molotov **fully agreed with Spike** (the system/
> Abraham IS corrupt). "The system is wrong, Spike" was agreement. He left and
> came to **pull Spike OUT and save him** — because Spike had become a **brother**
> and **he couldn't watch another brother die** (he couldn't save his real one).
> He **didn't know the brainwashing surge broke through** — so the brother he came
> to rescue attacked him, and he crippled Spike in the scramble. **No villain
> here — just two men who were right, and a dart that ruined it.** His sorrow = he
> maimed the brother he came to save.
> **POST-CAMPAIGN — CONFIRMED ALIVE:** Molotov **survives the campaign.** A year
> later he's the **secret hidden contractor** in the new mode (lives in a cave,
> teaches the player to hunt/skydive/parachute, gives jobs to liberate the
> island). After his contracts, he **buys a helicopter and leaves**; a radio
> transmission reveals he **reached the coast but his chopper died on the beach**,
> surviving on a few months' supplies — fate uncertain/bittersweet. The lone true
> survivor of Team Apex finally walking away from the war.
> **HAS A SON (revealed M13, year 2000): Jonah "Cocktail" Newman** — in the 15
> years after the massacre, Molotov built a **family**. His son fights beside him
> as the new team's young **sniper**, wearing **a version of the fire mask**
> passed down as legacy and protection (the inversion of what Webber's own father
> did with fire — the cycle broken). Jonah chose the callsign **"Cocktail"**
> because it completes his father's: **Molotov + Cocktail = Molotov Cocktail.**
> **THE MOTHER — ELIZABETH.** Born **Elizabeth Sean**; married name recorded as
> **"Elizabeth Weber"** *(⚠ as heard — taking WEBBER (his first name) as her
> surname, or a slip for "Newman"? If deliberate, it's devastating: the dead,
> forbidden name lives on through her. Confirm.)*
> - Had **Jonah shortly after the deaths of Fox, Payback, and John** (the M11
>   massacre, 1985) — so the relationship predates/spans the campaign's end.
>   **Jonah is ~15 years old in Mission 13 (Dec 2000) — CONFIRMED.** A teenage
>   sniper fighting beside his father.
> - **Alive in 2000.** Supports Molotov's work; **sometimes even shows up.**
> - Her love is **"a different kind — very strong and quiet"** (a mirror of him).
> - **What she is to HIM:** not just a person — **something hard to put into
>   words.** (Deliberately left undefined: the man of few words has one thing
>   language can't hold. Write around it, never through it.)
> - She lets her husband AND son go on missions because, in her mind, **Molotov
>   is the strongest person she's ever met — and their son is his blood.**
> **Fox was his one breaking point:** Molotov held his flat, serious tone through
> the entire Spike tragedy (agreeing with him, then crippling him) — **no tears,
> no waver.** The ONLY thing that shatters his composure is finding **Fox's body**
> (M12): one tear, "I'm sorry." Fox — who took him in and called him "Molly" —
> meant more to him than anyone. His single point of vulnerability.
> **⭐ HARD CANON RULE:** the tear over Fox (M12) is the **ONLY time in the ENTIRE
> GAME** that Molotov **changes his tone or sheds a tear.** Every other moment —
> the whole campaign, the Spike tragedy, even the post-epilogue mode as the secret
> contractor — he stays flat and serious. Writers must keep this true: **exactly
> one emotional beat, ever.** Break it anywhere and it loses all its weight.

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
- **Backstory (Mission 8 flashback):**
  - **Childhood:** real name **Webber**; abusive **German father** who used fire
    as punishment and set a toy room ablaze with Webber's **little brother**
    inside. Mother **died in the war.** Young Webber smashed the door with a
    hammer, **saved his brother, and killed his father** with a revolver.
  - **"The Mollys" (~age 18, brother 16):** the brothers joined a **fire-masked
    liberation group, "the Mollys,"** that freed territory from German control
    and helped **take down Hitler.** *This is the origin of his fire mask and his
    name* — "Molotov" / "Molly" both come from the Mollys.
  - **The loss:** his **brother was betrayed and shot dead in front of him.**
    Webber was hit by a **flamethrower** off a 3-story building, **impaled on a
    spike**, tore free, and doused himself in water. **Two years later he killed
    the entire team** responsible (revenge). **Seven months later, joined Team
    Apex.**
- **Identity capstone:** *"That day, Webber died in a grave. But Molotov lived."*
  The boy who saved his brother died with him; "Molotov" is the self that
  remained.
- **Naming:** he **likes "Molly," "Molotov," or anything else** — those are the
  self he chose. The **only name he rejects is "Webber"** (his dead self). So
  Fox's "Molly" is warm/welcome; calling him **"Webber"** is the thing that cuts.
- **His past is off-limits:** he **does not like others bringing up his past** —
  anyone raising it (the father, the fire, the Mollys, the grave) gets stonewalled
  or worse. (Distinct from, and layered on top of, the "Webber" name rule.)
- **Why the mask:** the flamethrower left **severe burns mainly on his face** —
  the full-covering ski mask hides the scarring. (His **hair is fine/untouched**;
  not bald.)
- **Rank:** *TBD.*
- **AGE — CANON (M16):** **22 in 1985 → ~37 in 2000** (born ~1963). Consistent
  with Jonah's birth (~1986, Molotov ~23).
  - **TIMELINE — RESOLVED (alt-history):** in this universe, **the "mustache
    guy" survived a LOT longer** — German control persisted deep into the 20th
    century, and the **Mollys helped take him down ~1981**, when Webber was 18.
    The full reconciled line (all consistent, born ~1963):
    - ~1973 (age ~10): the father, the fire, the revolver (childhood flashback).
    - Mother "fell in the war" — the **extended German conflict** of this
      alt-history.
    - ~1981 (age 18): joins the **Mollys** with his brother (16); they help
      take down the mustache guy; the betrayal, the flamethrower, the burns.
    - ~1981–83: two years hunting the betrayers.
    - ~1984: **seven months later, joins Team Apex.**
    - 1985 (age 22): Mission 1. **The math locks end to end.**

##### 2. James "Fox" Carter — **DECEASED (KIA Mission 11)**
> **Status:** **executed by Abraham** (golden Colt M1911, headshot) after the
> ambush, while crawling away wounded. The founder and heart of Team Apex, killed
> by the general he trusted.

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

- **⚠ THREAD — Fox's dark thought (Mission 7 coda):** alone after Sydney's
  betrayal, Fox contemplates: if *one* quiet soldier turning nearly killed two of
  his men, **what would the whole team turning do** — they could "wipe out a
  city." Deliberately ambiguous: **fear** (paranoia / burden of command) or
  **temptation** (his team as a weapon to unleash). A major seed for Fox's arc.
  - **Materializing (Mission 9 aftermath):** the team is fracturing — Sydney
    (traitor, dead), **Molotov gone into hiding**, Spike diverging. Fox's fear of
    the unit coming apart is starting to come true.

##### 3. John "Striker" Jones — **DECEASED (KIA Mission 11)**
> **Status:** killed in the LMG ambush — **500+ rounds of 5.56×45mm NATO.**
> Definitively dead. The rookie who hardened across the campaign, cut down with
> the trio.

- **Callsign:** "Striker" (between first/last: John Jones).
- **Pronoun:** he/him.
- **Age:** ~24 — the **fresh recruit / new blood** of the squad (the rookie).
- **Role / specialty:** *TBD* (rookie archetype; finding his footing).
- **Weapon of choice:** the **PP919** — a compact, single-fire (semi-auto) SMG.
  *(Reads as an original/fictional in-game designation; no real-world "PP919"
  exists. Fine for the arsenal — flag if you meant a real model like the
  PP-91 KEDR or PP-19.)*
- **Personality / heritage / backstory:** *TBD.*

##### 4. General Abraham — **THE TRAITOR (revealed Mission 11)**
> **THE BIG REVEAL:** Abraham is the traitor — HYDRA's / Victor Prestige's man
> ("Ray Abraham"). He **used Team Apex to retrieve the final intel** on the HYDRA
> leader, then **led them into an ambush and annihilated them**, personally
> **executing Fox** with his golden Colt M1911. His exit line: *"Next time, just
> don't try to double-check. That's all you had to do."* Recontextualizes his
> whole arc — the secrecy, the deep HYDRA knowledge, "fixes broken people," even
> his Hellfire objection. The team's own general was the snake all along.
> **YEAR 2000 (M15 intel):** last seen in **ANTARCTICA**, **harvesting a mountain
> of uranium**; the **magnetic field around Antarctica has drastically
> increased** due to a **satellite he stationed above the region** *(⚠ possible
> nuke detonation — garbled, confirm)*. Whatever he's building down there is the
> era's looming endgame — the team chose to hunt Hunter first.
> **THE GREEN CONTINENT (M19 — seen firsthand):** the uranium + the
> magnetic-field change have put Antarctica through a **major climate shift** —
> a large portion is now **87°F, warm and lush with green grass**, the mountain's
> ice melted. His mine runs on **slave labor: hundreds of prisoners in
> protective suits.** Abraham didn't just build a base — **he changed the
> weather of a continent.** *(⚠ the mountain is "actually Mount Everest" as
> narrated — possible garble for Mount EREBUS; unruled.)*
> **⚠ Reaches into the US military (M12):** the ambush used **American military
> vehicles alongside HYDRA** — so **US forces/government are complicit** with
> HYDRA, not just Abraham. The corruption goes far higher than one general. Major
> conspiracy thread.
> **⚠⚠⚠ HIS MASTERSTROKE (M18 reveal):** Abraham **owns SPIKE.** He "brought
> back" Payback and the others as **AI planted in Spike's cyborg head** — and
> the lie became Spike's sanctuary. "Fixes broken people," perfected: he took
> the most broken man alive and fixed him into a weapon. The team hunting him
> is carrying his agent to Antarctica (M19).
> **☠☠ FATE — DEAD (M20):** after the hill (Atomic shot, Spike executed by
> Molotov, Molotov leg-shot shielding Jonah) and the friendly-fire airstrike,
> Abraham stabbed Molotov in the stomach and beat him down in a knife/fist
> fight — and was then **shot in the back through a crack in the rubble by
> JONAH "COCKTAIL" NEWMAN, age 15**, with an ash-covered 9mm (player choice;
> refusing = Abraham executes Molotov & shoots Jonah = mission failed). No
> last words scripted. The traitor of 1985, killed by the son of the man he
> couldn't kill — in the back, like everything he ever did.

- **Rank:** four-star general — the top brass attached to the team.
- **Name:** "Abraham" (first/last unconfirmed).
- **Signature weapon:** a **pure gold Colt M1911** pistol — a flashy, prestige
  sidearm befitting a four-star general.
  - **2000 era (M20 — ruled):** he carries **TWO guns** — a **GOLDEN REVOLVER**
    (the statement piece; shot Atomic) and a **standard SILVER 1911** (the
    workhorse; drawn on Cocktail & Molotov). *(⚠ minor: whether the golden
    revolver replaced the '85 gold M1911 or the gold gun was always a
    revolver — creator may rule whenever; non-blocking.)*
- **Role & everything else:** *TBD — deliberately revealed throughout the story*
  ("you'll see"). Whether he deploys in the field or commands from above is part
  of the narrative.
- **Knows HYDRA deeply** — he's the one who briefs the team on the drones'
  fates (Mission 2 boardroom), reinforcing that he's been read in on HYDRA all
  along (ties to his secrecy at the Mission 1 regroup).
- **"Fixes broken people" (Mission 7 reveal):** Sydney says Brian was a "broken
  product until **Abraham fixed** him" — a **metaphor.** Abraham has a pattern of
  **taking in broken/damaged people, rehabilitating them, and recruiting them**
  onto Team Apex. Team Apex is, in part, **Abraham's collection of people he
  saved** — which is why their loyalty to him runs deep (and why Sydney, who
  "never needed fixing," doesn't share it).
- **Rank — RESOLVED:** canonically a **four-star general.** "Captain" is only
  informal/colloquial shorthand (e.g. the writer/players calling him that) — NOT
  his actual rank. Always **General Abraham** in canon.
- **⚠⚠ THE "RAY ABRAHAM" BOMBSHELL (Mission 9):** an interrogated HYDRA soldier
  says leader **Victor Prestige has been talking to a "Ray Abraham."** Same
  surname as the General. Combined with his secrecy (knows HYDRA, withholds
  intel, briefed the drones, "fixes broken people"), this seeds a possible
  **Abraham = HYDRA insider / double agent** twist (or relative / red herring).
  Spike clocks the name. A potential campaign-defining reveal — handle
  deliberately.
  - **⚠ "CONFIRMED" (Mission 10):** Spike finds **documents confirming Abraham's
    HYDRA connection** — to him, the suspicion is now fact. *But Spike is crippled
    and alone right after, so the proof may not reach the team.* (Exact nature of
    Abraham's involvement still TBD — mole? Victor's contact? deeper game?)

##### 5. Rodriguez "Spike" Hamilton — **THE MAIN CHARACTER (the player)** — **☠ DECEASED (KIA Mission 20)**
> **FATE:** during the Antarctic rebellion, Spike **walked away along the
> cliffs to Abraham.** On the hill, after Abraham gunned down Atomic,
> **MOLOTOV — in a rage, too broken for anything else — shot Spike in the
> head.** Head jerked back, knees, face-plant. **The main character is dead**,
> killed by the man who once crippled him by accident (M10) and loved him as a
> brother. Whether Molotov killed a traitor or a puppet (the M18 sanctuary
> ghosts) was never answered before the bullet — the story's cruelest open
> question.
> **THE GRAVE (campaign ending):** Spike is buried in a **beautiful park.**
> The campaign's final scene is Molotov's hand on his headstone: *"I'm sorry —
> what I did to you. I put you through so much pain. But I didn't know what I
> was doing. I just hope one day you can forgive me."* The story that began
> as Spike's ends at his grave.
> **🔒 SEALED (creator ruling):** whether Molotov ever learned the truth about
> the twisting is one of the campaign's **three permanently unanswered
> questions** (see mission-20.md ending notes) — never to be resolved in any
> future material.

- **Callsign:** "Spike" (between first/last: Rodriguez Hamilton).
- **Role:** **the player character.** This is who the player controls — the
  operator in the opening who gears up and steps off the chopper.
- **⚠ THE BRAINWASHING ARC (Mission 3 → 10):** the Mission 3 jungle **dart** was a
  **HYDRA brainwashing program** meant to make Spike **kill all his allies**
  (stripping humanity, sanity, emotions). The dying operator **missed his head and
  hit his neck**, so it worked **slowly** — Spike spent Missions 3–10
  **unknowingly fighting it** (his obsessive, divided, paranoid behavior was that
  internal war). At Mission 10's climax an **adrenaline surge** let it break
  through for **one short burst** → he **attacked Molotov** → the same surge
  **flushed it out; it FAILED.** **Spike is now free of it.** (His "betrayal" of
  Molotov was never his choice.)
- **⚠ STATUS (Mission 10):** **gravely wounded / paralyzed** — Molotov stabbed and
  shot him; **"I can't feel my legs."** Crippled by a teammate and left alone.
  (Permanent or temporary — TBD; a huge swing for the back half.)
- **Family:** Spike is an **orphan** by 1985.
  - **Father — Diego** (playable lead of the 1948 flashback, Mission 2): survived
    HYDRA's first strike in Saudi Arabia and **told young Spike the story
    himself.** Later **died of old age, shortly after Spike's mother passed.**
  - **Mother:** deceased (before Diego). *(Name/details TBD.)*
  - Makes Spike's 1985 war with HYDRA **generational and personal** — fighting
    his late father's enemy, alone.
- **Specialty / personality / weapon / backstory:** *TBD — revealed throughout
  the story* ("we will see").
- **⚠ THE CYBORG (2000 era — revealed post-M17):** Spike is **practically a
  FULL cyborg.** The M10 crippling was only the start — the gravity-stabilizer
  waist rig grew, over 15 years, into near-total replacement of his body.
  *(Which parts, how it happened, whether Charles built him — OPEN; see M18.)*
- **⚠ SOMETHING DIRE (M18):** with HYDRA finally gone, Spike is in crisis —
  **he lost the people he looked up to** (all of Team Apex), **he's practically
  a full cyborg**, and **everything he's ever loved is gone.** The war's end
  gave Molotov everything back and gave Spike nothing.
- **⚠⚠⚠ THE SECOND TWISTING (M18 reveal — MASSIVE SPOILER):** **Spike has
  secretly been working with ABRAHAM.** Abraham twisted him in a mysterious
  way — by **"bringing back" Payback and the others** as **AI planted inside
  Spike's head** (his cybernetics = the door). Spike believed it, and **over
  time the twisted form became his SANCTUARY** — the fake dead are the only
  home he has left. Abraham's lifelong method ("he fixes broken people" — how
  he got Brian) executed on the main character: HYDRA's dart took him by
  force and failed (M3–10); **Abraham took him with love and succeeded.**
  **The player has been playing the traitor.** *(Audience-only reveal —
  presumed dramatic irony. Since-when / which ghosts / what he's done for
  Abraham / does-he-know — ALL OPEN, see mission-18.md.)*

##### 6. "Payback" — the mystery operator — **DECEASED (KIA Mission 11)**
> **Status:** killed in the LMG ambush — **500+ rounds of 5.56×45mm NATO.**
> Definitively dead (no survival twist). Her real name died with her — never
> revealed.
> **⚠ BUT (M18):** an **AI recreation of Payback** (and "the others") exists —
> **planted inside Spike's head by Abraham** to twist him. She is still dead;
> the ghost is a puppet. (Which "others" got recreated — OPEN.)

- **Pronoun:** she/her.
- **Codename:** "Payback." **No one knows her real name** — she operates solely
  under the codename.
- **Weapon style:** **no signature weapon — and no fixed weapon at all.** She's
  an **improviser / scavenger**, using whatever is around and available. Travels
  light and adapts to the battlefield (a fitting trait for a nameless ghost).
  - *Design implication:* mechanically she leans on **battlefield pickups** —
    dropped enemy guns, environmental weapons — rather than a fixed loadout.
- **Loyalty (Mission 10):** **remains loyal to the system** as the team fractures.
- **Role / specialty / personality / backstory:** *TBD.*

##### 7 & 8. The Wolford Twins — Brian & Jesse Wolford — **DECEASED (KIA Mission 11)**
> **Status:** **both killed on the overwatch hill** in Mission 11 — shot from
> behind by two of Abraham's planted operators the instant Brian lined up a shot
> on Abraham. They died realizing the betrayal, one trigger-pull short of
> stopping it.

- **Brian Wolford and Jesse Wolford are TWINS** — Team Apex's quieter operators,
  a matched pair (relationship CONFIRMED).
- Background roster; deployed on Hellfire (every member was).
- **CAMEO — Mission 1:** the two of them appear on the rooftop (look left before
  descending), sniping enemies below — side by side, fittingly. Present since the
  very first mission.
- **Spotlight — Mission 7 "Industry":** they infiltrate the HYDRA casino in
  **police/security uniforms.** **Personalities established here:**
  - **Brian Wolford** — the **trigger**: cold, calm, lethally fast. Dropped five
    guards with a shotgun before any could react, then walked off without a word.
  - **Jesse Wolford** — the **talker**, but **nervous/anxious**: handles the
    bluffing, but fumbles under pressure (cracked giving a fake ID).
  - A classic twin contrast — the steady gun and the jittery mouth.
- **Loyalty (Mission 10):** the twins **remain loyal to the system — most
  steadfastly of anyone** as the team fractures. Fits "Abraham fixed Brian":
  they owe the establishment everything.
- **Brian — "broken product" (metaphor):** Sydney calls Brian a "broken product
  until Abraham fixed him" — **figurative.** Brian was a **broken/damaged man**
  whom **Abraham rehabilitated** and recruited. Fully human; gives Brian a
  troubled past + a debt of loyalty to Abraham/Apex. (May apply to Jesse too.)
- **Weapons:** Brian favors a **shotgun** (at least here). Jesse — TBD.
- Callsigns: *TBD* (nameplates fall back to "Brian"/"Jesse").

##### 9. Monroe Sydney — **DECEASED (KIA Mission 7, traitor)**
- Quieter supporting operator (background roster). Deployed on Hellfire.
- **Role — the inside man:** in Mission 7 "Industry," he had **secretly taken a
  job at the HYDRA casino** weeks ahead, embedding himself; he opens the latch to
  the manufacturing lab.
- **FATE:** after betraying the team and aiming at Jesse, **killed by Brian** —
  a thrown knife to the head. The team only learned he was a traitor afterward.
- **Goes by "Sydney."**
- **⚠ BETRAYAL — confirmed in his own words:** at the climax he stands with a
  soldier and a security guard, **revolvers on the twins**, and openly sides
  against Apex. He's cold and ideological about it — taunts Brian as a "broken
  product" Abraham fixed, and claims **he "never needed fixing."** Positions
  himself as the genuine article vs. Abraham's "repaired" operators.
- **The hook:** *why* did he turn? What does "never needed fixing" mean about his
  past and how he sees Team Apex? Now the most pivotal quiet operator.
- Callsign / weapon / full backstory: *TBD.*

> **Roster note:** Members 1–6 are the spotlighted core; **7–9 (Brian Wolford,
> Jesse Wolford, Monroe Sydney) are the quieter, less-mentioned operators** of
> Team Apex. There may still be more members beyond these nine (TBD).

#### THE NEW TEAM (2000 era — Mission 13 onward)
Post-massacre, the survivors built a new unit *(team name TBD)*:
1. **Molotov** — leader-figure; fixed futuristic mask; XM4.
2. **Spike** — walks via a **gravity stabilizer** waist rig; heavy weapons.
3. **Jonah "Cocktail" Newman** — Molotov's son, 15, sniper, legacy mask.
   **M20:** held the standoff circle without breaking; **KILLED GENERAL
   ABRAHAM** — shot in the back through a crack in the rubble, ash-covered
   9mm, wounded arm, age fifteen. The last Pillar fell to the kid. Now a
   **fugitive alongside his father** (the M20 exile).
4. **Nova** — **Payback's replacement** (fills her role on the team), and a
   former **cartel inner-circle** member. *(Echoes the campaign's cartel world —
   Lady Death's orbit? Connection TBD. Gender/pronouns not yet stated.)*
5. **Atomic** — a **huge Hawaiian bodybuilder**; the team's **heavyweight.**
   **☠ DECEASED (KIA M20):** shot in the chest by Abraham (golden 1911, slow
   motion) on the hill; **bled out during the standoff — in first person**
   (M20 was played as Atomic; the player's vision spun, closed, and died).
   He shielded Jonah once (M16); he died steps from him.
6. **Jeff** — **more mysterious than the others.** (The most ordinary name on
   the roster, the least-known man behind it. Deliberate.)
7. **Charles** — the **tech specialist**: **builds most of the guns, ammo, and
   gear the team uses.** Extremely valuable member. *(Strong inference — did
   Charles build **Spike's gravity stabilizer** and **Molotov's fixed futuristic
   mask**? Confirm.)*
- **Elizabeth** (see Molotov's entry) supports the team; sometimes shows up.
- **MARTIN & LEWIS (M19):** Spike's **two trusted lieutenants** from the
  Antarctic prisoner uprising — freed uranium-mine slaves, first to be geared
  up, core of the prisoner militia. *(Everything else about them — TBD; do
  not invent.)*
- Era goal: take down **the Three Pillars of Ruin** (Abraham, Prestige, Hunter).
  *(Status: Prestige dead M17; Hunter allied; Abraham = the endgame.)*

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
- **History — over a CENTURY old (~since 1873).** The 1948 H1.0 drones took
  **~75 years** to develop, so HYDRA's program dates to **~1873** — a patient,
  generational organization, ~110+ years old by 1985.
- **1948 seeding event** (see Mission 2): in Saudi Arabia, a HYDRA scientist
  launched a **rocket into space** that deployed **~13 capsules worldwide**,
  scattering in different directions — the **seeding event** for HYDRA's global
  presence in 1985.
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
- **GLOBAL SCALE — hundreds of major bases.** HYDRA operates **hundreds of major
  bases** worldwide, concentrated in:
  - **The United States**
  - **Germany**
  - **Russia**
  - **China**
  - **a few in Mexico**
  The Mission 7 casino is **just one** of these hundreds. Implication: this is a
  vast, near-state-level global organization — no single raid meaningfully dents
  it, which raises the stakes of the whole war (and explains their resources).
- **HYDRA TECHNOLOGIES** — the org's tech/manufacturing division brand (stamped
  on Hydro Hound sheets). Slogan: **"Only the strong survive."**
- **Funding — front businesses:** HYDRA runs **high-class casino fronts** that
  pull in millions/billions, bankrolling the drone program — and hide production
  in plain sight (Mission 7's casino has the H3.2 factory in its back half).
- **Leadership — Victor Prestige (Mission 9 reveal):** named as **HYDRA's leader
  / "owner."** First real name at the top of the century-old org. Details TBD.
- **☠ HYDRA — GONE (post-M17):** with **Prestige dead**, **ALL of HYDRA is
  gone.** The century-old organization is finished — no owner, no factories,
  no program. What remains: **Abraham** (the last hostile Pillar, Antarctica)
  and whatever leaderless machines are still loose in the world (the two new
  drone models, Drone 9, the unaccounted originals).
- **THE THREE PILLARS OF RUIN (2000 era):** the era's three central villains —
  **General Abraham** (the traitor), **Victor Prestige** (HYDRA's owner), and
  **HUNTER, "the Terrorist in Black."** The new team's goal: find and take down
  all three.
  - **STATUS (post-M20): ALL THREE PILLARS RESOLVED.** **Victor Prestige —
    DEAD** (M17, Hunter's forged round on the catwalk). **General Abraham —
    DEAD** (M20, shot in the back through the rubble by Jonah "Cocktail"
    Newman, 15). **Hunter — ALLY** (M16 parley; alive).
  - **The bitter math:** neither Pillar fell to the team proper — one Pillar
    killed another, and a child killed the last. And the "victory" ended with
    **Molotov and Jonah fleeing their own team** (M20 exile).
  - **PRESTIGE'S DEATH (M17):** stormed his base with Hunter's militia; Prestige
    made his last stand on a **catwalk** over the burning garage, **missing
    every shot** (pistol, then a point-blank Glock). Hunter grappled up, we
    **played as Hunter** for the first time, ran him down, and killed him with
    the forged round — *"This is for my parents… for my friend."* **The maker
    died by the made.** ⚠ **"my friend" = unidentified second victim (open).**
- **HUNTER — what's known (M13):** signature weapon is a **black-and-gold
  revolver.** MO: **walks into maximum-security sites in plain sight**, executes
  high-ranking targets **in front of hundreds of guards who somehow do
  nothing**, and **escapes seamlessly, every time.** Locals won't say his name
  loudly. *(How he does it — bought guards? tech? something that "turns people
  off"? — TBD. Note: the gold-on-the-gun echoes **Abraham's gold Colt** —
  connection or coincidence, TBD.)*

- **HUNTER — ORIGIN (the Hellfire orphan):**
  - **Mission 6 ("Hellfire," 1985) created him.** When the Hellfire missiles
    shredded the H2.1 swarm, the burning ~4-ft drones rained on the city — and
    **14-year-old Hunter watched his parents get brutally mutilated by the
    propellers of falling drones.** He is the human cost of the President's
    no-win choice — one of the "thousands" sacrificed for the billions.
  - **His vendetta:** revenge on **the President and EVERYONE involved in the
    Hellfire mission.** *(⚠ Dramatic irony — that list plausibly includes
    SPIKE and MOLOTOV, who flew that mission. The team hunting Hunter may be ON
    Hunter's list. Confirm.)*
  - **The musket:** he took his **father's old musket** (a modern reproduction —
    still painfully slow) as his first weapon. Sentimental, impractical, his.
  - **First kill:** a **coastal farmer** who shot at Hunter as he tried to steal
    tropical pigs. Hunter killed him, took his weapons and ammo.
  - **The farm's secret:** the farmer kept **slaves/workers.** Hunter **freed
    them all** — gave the **women and children $300 and shipped them to America**
    for a better life; the **unmarried / childless men chose to go WITH him.**
    Those freed men became the seed of his **criminal empire.**
  - **His army = people he liberated.** That's why his men adore him and why he
    moves untouchable through crowds — he is, to the bottom of the world, a
    liberator. To the top of it, a terrorist.
  - **Thesis: "Hunter is CRUEL — but FAIR."** The warehouse game is the cruelty;
    the $300 and the freedom papers are the fairness. Both are true at once.
  - **Age — LOCKED:** **16 at Hellfire (1985) → ~31 in 2000.** Still very young
    for what he's built.
  - **THE BULLET:** forged from **pieces of the drones that killed his
    parents** — collected the day they died, welded, shaved to bullet size,
    carried ~15 years. Reserved for **Prestige**: the maker dies by the made.
    "Simple trade."
    - **PAYOFF (M17):** he fired it into Prestige on the catwalk. Because it was
      **improvised — "didn't seat the bullets together too good" — it SPLIT IN
      TWO in flight.** Both halves hit; Prestige died in ~2 seconds. Even
      Hunter's *sloppy* round finishes the job. **The parents' drones killed
      their own maker.** ✔ **USED / SPENT.**
  - **ALLIED (M16):** parleyed with Molotov at a gunsmith; joins the Prestige
    hit; may help against Abraham **if he survives.**
- **HUNTER — THE FAMILY & THE SUCCESSION (M16 reveal):**
  - **At age 20 he had three children**, whom he **values dearly** — they are
    the heirs he'll **pass his criminal empire to.** He wants to hand down his
    legacy **as soon as possible.**
  - **Three trusted soldiers:** when his time comes, each becomes the **right
    hand** of one of his children. Succession fully planned.
  - **The Molotov parallel:** both men have **families they love** (for
    different reasons) and **both want Prestige dead.** Two fathers building
    legacies — one passes down a fire mask, the other an empire. This parallel
    is the basis for the parley.
- **⚠⚠ The "Ray Abraham" connection (Mission 9):** an interrogated soldier says
  Victor Prestige **has been talking to a "Ray Abraham."** The surname matches the
  team's own **General Abraham** — a potential bombshell (Abraham as HYDRA
  insider/double agent? a relative? red herring?). Major open twist; see
  `mission-09.md` and Abraham's profile.
- **Drone program is compartmentalized** — even HYDRA bases (e.g. the Mission 9
  Africa base) keep **no drone intel** and have "never seen a single one." The
  drones are walled off inside the org.
- **Brainwashing tech (darts):** HYDRA has **brainwashing dart** programs designed
  to turn a target into an ally-killing weapon (strip humanity/sanity/emotions).
  Used on Spike in Mission 3 (see his arc) — it failed, but the tech is real and a
  standing threat.
- **Details (goals, full tech):** *TBD.*

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

### HUD — Named-Character Nameplate System
When the player's **crosshair passes over a NAMED individual** (a character with a
name in the campaign), their name appears **next to the crosshair**, color-coded
by allegiance:
- **Enemy (named):** **RED** — shows their **FULL NAME**.
- **Friendly / ally:** **BLUE** — shows their **CODE NAME** (or, if they have no
  code name, their **first name** instead — still in blue).
- **Neutral:** **WHITE** — shows their name.

**Only triggers for named campaign individuals** — generic/unnamed enemies and
background NPCs show **nothing**. This is the player's tool for spotting story
characters in a crowd (e.g. identifying the Brian & Jesse cameo in Mission 1, or
clocking a named enemy among mooks).
- *(Friendlies without a code name simply show their **first name** in blue — so
  Brian/Jesse Wolford & Monroe Sydney would display as "Brian," "Jesse,"
  "Monroe" unless/until they're given callsigns. Code names are optional flavor,
  not required.)*

### Story-Protection Rules (named characters)
Two hard rules guard the narrative around named characters:
- **Friendly fire (teammates AND neutrals) — forbidden.** If the player tries to
  kill a **teammate** *or* a **neutral** (blue or white nameplate), the screen
  **immediately goes BLACK** and displays:
  > **"Friendly fire will not be tolerated."**
  …then the **mission restarts from the last checkpoint.** (Applies to any
  non-hostile named character — you simply cannot kill allies or neutrals.)
- **Named enemies — protected until scripted.** A **named enemy individual
  cannot be shot/killed until the game explicitly allows it** (as part of an
  objective). If the player tries to harm them early, the game responds:
  > **"Nice try, but be patient."**
  …and the enemy takes no damage until their scripted moment arrives.

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
- [x] **Tech stack / engine — DECIDED: UNREAL ENGINE** for the real game build.
      (The Three.js browser demo in `game/demo/` stays as the playable prototype /
      proof-of-feel; production development targets Unreal.)
- [ ] **Target platform** — web, desktop, console-style?
- [ ] **Weapon system depth** — attachments, loadouts, unlock/progression.
- [ ] **Multiplayer netcode model** — out of scope until a vertical slice exists.

---

## 5. Build Philosophy

Design first, then a thin vertical slice. The first technical milestone should
prove the **core feel**: move (sprint/slide/crouch/prone) + shoot one gun in a
first-person 3D space. Everything else (arsenal breadth, modes, netcode) layers
on top of a combat core that feels good.
