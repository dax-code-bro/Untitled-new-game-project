# Multiplayer — Design

> **Canonical design (in progress).** Preserves EVERY detail. Target rating:
> **ESRB M.** First-person only (per the modes table in GAME_DESIGN.md).
> Arsenal: 200+ guns (see `arsenal.md`).

## Loadout System

Each player's loadout has (at least) four slots:

### 1. PRIMARY slot
Holds the big guns — anything that "sounds like a primary":
- **Assault Rifles**
- **Marksman Rifles**
- **SMGs**
- **LMGs** *(⚠ see flag — LMG isn't currently one of the 10 arsenal classes)*
- *(By the same "sounds primary" rule, presumably also Shotguns, Sniper Rifles,
  Bows/Crossbows — confirm.)*

### 2. SECONDARY slot
The backup — anything that "sounds like a secondary":
- **Explosive weapons** (launchers)
- **Special** *(= the Unique/Exotic class? confirm)*
- **Pistols**

### 3. LETHAL slot
The defined lethal equipment:

| Lethal | Effect |
| --- | --- |
| **Frag Grenade** | The classic explosive. |
| **Semtex** | Sticky grenade. |
| **Molotov** | Fire bomb / area burn. *(Shares its name with the operator — fitting, since he's literally named after it.)* |
| **C4** | Plantable, remote-detonated charge. |
| **The Spider** | **EMP-like deployable: an electronic spider** that **crawls into the suit of another player, rips out the suit's electronics, and causes them to EXPLODE.** Part hunter-killer drone, part nightmare. |
| **Claymore** | Directional proximity mine. |
| **Mine** | Classic landmine. |

> **Lore implication (The Spider):** for the Spider to work, **players wear
> suits with onboard electronics** — a canon detail about this world's soldiers
> (and consistent with HYDRA-era tech). Worth defining what else the suit does.

### 4. TACTICAL slot
The defined tactical equipment:

| Tactical | Effect | Duration |
| --- | --- | --- |
| **Hydro Gas** | A **special black gas**. Hallucination agent: **enemies appear where they actually aren't**, and **figures that don't exist start shooting at you** — and you **take a bit of damage** from the phantom fire. | **9 seconds** |
| **Concussion Grenade** | Screen goes **black for 1 second**, then **movement and controls are INVERTED** | **3 seconds** (inversion) |
| **Flashbang** | Screen **flashes white** | **4 seconds** |
| **Smoke Grenade** | Classic vision-blocking smoke | — |
| **EMP** | (Electronics/equipment disable — details TBD) | — |
| **RTGMK** — "Ready To Go Med Kit" | This game's version of a **stim shot** — instant self-heal | — |

### 5. POWER slot
The big-ticket deployables — each one is a match-changing piece of hardware:

#### 🐕 HYDRA Hound
- A **robot dog** — literally a **Doberman made of metal and wires.**
- **Two turrets**, one mounted on each side, plus a **deadly neurotoxin bite.**
- **PERMANENT deployment** — no timer, no auto-expire, no self-destruct. It stays
  on the map **until someone destroys it.** (Explicit design intent: unlike
  typical timed deployables.)
- **Speed:** runs slightly faster than a sprinting player.
- **Leap attack:** within ~**3 feet** of an enemy it can **leap on them and maul
  them to death.**
- **Follow behavior:** heels within **10 feet of its owner** — but the moment it
  **spots an enemy it breaks that rule** and **hunts them until they're dead.**
- **Health & armor:**
  - Base health ≈ **4 players' worth** (an SMG could shred it alone)…
  - …so it wears **ARMOR** that **significantly reduces damage from grenades,
    fire, EMP, and bullets** — armor durability ≈ **~15 players' worth of
    semi-auto AK-47 fire.** Strip the armor and it shreds fast.
- **Traversal animations (signature charm):** normal drops it just **leaps
  down**; but off a big fall it **jumps and pops a MINI PARACHUTE**, gliding
  down "very cutely" to land right beside you.

#### ☁ Hydra Gas Trap
- Placed trap; lasts **10 minutes** unless destroyed.
- When an enemy comes near, releases a **massive cloud of Hydra Gas** (the
  hallucination gas from the tactical slot).

#### 🛡 Da Vinci Tank
- You receive a little **XL radio** and **choose where to call it in** — a
  **transport helicopter** flies overhead and **drops a package.**
- Run up, press **UNBOX** → quick animation: your character **swipes a knife at
  the box** and the whole crate falls away — revealing a **modernized version of
  Leonardo da Vinci's tank** (the round Renaissance war machine, rebuilt).
- **Armament: 16 fast-spinning rocket launchers** ringing the hull.
- **Weaknesses (by design):**
  - **Incredibly vulnerable to EMP — just 2 EMPs kill it.** Otherwise it's
    effectively **unkillable.**
  - **Glacially slow turn rate** — "turning slower than a snail."

#### 🥾 Anti-Gravity Boots
- Let you **float around in the air.**
- *(User's own note, preserved: "who knows why I added this — maybe in 30 years
  we'll find out." 👀 Possible long-game foreshadowing; left as a mystery.)*

#### 🤖 Hellfire GEAR *(⚠ name as heard: "hellfire missile and GEAR" — confirm)*
- Called in by **transport helicopter** drop.
- A **massive suit of armor — a MECH suit** loaded with "too many guns"
  (plausibly incl. hellfire missiles, per the name).
- **Insane damage output** — "delete everyone in front of you" — with **insane
  health and armor** to match.

#### 👻 Camo
- **Complete invisibility** — you *and your weapon* — for **30 seconds.**
- Counterplay: a **faint blue tint** remains, so sharp-eyed enemies can
  occasionally spot you.

> **⚠ Open design question — what GATES the power slot?** These are enormous
> (permanent war-dog, near-unkillable tank, a mech). Are they earned in-match
> (kill/score-streak style), once-per-life, once-per-match, on a long cooldown,
> or limited some other way? This is the key balance decision for the slot.

## Notes / Flags
- **Hydro Gas is the standout** — a hallucination grenade is rare in shooters
  (phantom enemies + phantom damage = paranoia in a can). Fits the HYDRA-tech
  world perfectly. *(⚠ Spelling: "Hydro" as given — likely intended as
  **HYDRA Gas** given the faction; confirm. Also confirm how phantom damage
  works — small ticks while inside? Can you tell phantoms from real enemies?)*
- **Concussion inverting your controls** is a mean, memorable take on the
  standard concussion (most games just slow you).
- **⚠ LMG class:** primaries list LMGs, but the 200-gun arsenal breakdown has
  **no LMG class** (AR 44 / Marksman 30 / Exotic 26 / ProjMelee 25 / SMG 20 /
  Shotgun 14 / Explosive 11 / Sniper 11 / Bows 10 / Pistols 9). Either LMGs fold
  into an existing class, or the breakdown needs an LMG class carved out. Decide.
- **"Special" in secondary** — reading as the **Unique/Exotic** class; confirm.
- **Where do Projectile Melee weapons slot?** (Primary? Secondary? Lethal?) TBD.

## Still to design
- Lethal slot contents
- Perks? Killstreaks/scorestreaks? Field upgrades?
- Match modes (TDM, Domination, etc.) + maps
- Progression (weapon levels already exist per `arsenal.md` attachments — see
  unlock levels there)
