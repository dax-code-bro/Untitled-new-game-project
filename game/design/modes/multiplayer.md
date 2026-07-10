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
- *(Contents TBD — frags, semtex, throwing knives, etc. — user to define.)*

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
