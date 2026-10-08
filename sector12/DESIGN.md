# Sector 12 — Game Design

This document records the design as specified, plus the decisions taken to fill gaps. Lines marked **⚑** are interpretations or placeholder numbers rather than part of the original spec, and can be changed.

All numbers live in code: `src/data/catalog.js` holds the printable items, and `src/data/world.js` holds animals, caches, weather and AI operators. The crafting tables at the end of this doc are generated from the catalog with `node tools/catalog-tables.mjs`.

## The island

- **Sector 12** is an island in the middle of nowhere, surrounded by a giant ocean. Sandy beaches ring the whole coast. Moving inland, the beach gives way to the four biomes.
- **Size:** 700 mi² ≈ 1,813 km², which is a **42.6 km × 42.6 km** map. The island's radius is about 18.5 km and the rest is ocean.
- **Spawn:** the center of the map, at **the POB**. A 150 m **safe zone** surrounds it, and AI operators stay out of it. **⚑**
- The terrain is generated from one fixed seed, so the island is identical every time.

| Region | Direction | Identity |
|---|---|---|
| **Frostfang Range** | North | A giant snowy mountain and the hardest part of the map. The best loot and the most filament caches are here, but it's so cold that most people don't bother. You need expensive cold gear to survive, and only hardcore players go. Rugged, rigid terrain where you **slip on icy slopes**. Temperatures run from -3 to -38 °C on the slopes and -49 to -58 °C at the summit. **Extraction is at the very tip of the mountain** (2,357 m). |
| **Scorch Expanse** | West | The most scorching part of the map, reaching 53 °C at midday (59 °C in a sandstorm). Light sand gear is enough to survive. Very flat, with fields of sand dunes every once in a while. |
| **Verdant Reach** | East | **⚑ Wildcard (the original spec gave no traits for the east):** hot, humid jungle (25–37 °C). Hilly ground cut by rivers and swampy lowlands, with a dense canopy that blocks long sightlines. Medium difficulty. Points of interest: Verdant Ruins (a climbable stepped temple), Canopy Village (huts on stilts) and Howler Ridge. |
| **Timberline Wilds** | South | Normal forest. Known for **hiding spots** and as a **great hunting and camping location**, thanks to rugged terrain and **giant trees** (30–45 m conifers). There's an **abundance of water** (lakes and streams). Mild temperatures make it the must-go area for low-level players. |
| **The Hub** | Center | Dry grassland around the POB. |

**⚑ Points of interest:**
- North: Frostfang Summit (extraction), Whiteout Station, Glacier Pass Depot, Icebreaker Cliffs
- West: Scorch Flats Airfield, Old Salt Refinery, Dune Sea Outpost, Mirage Wells
- East: Verdant Ruins, Canopy Village, Howler Ridge
- South: Timberfall Lodge, Mirror Lakes Camp, Hunter's Hollow
- Coast: Shipwreck Cove, Lighthouse Point

## The POB (Printing Operations Base)

- Three storeys tall (10.5 m) with a footprint of about 14 m. The spec said "about as wide as 10 feet", but also that the thing is absolutely massive, so it was built big. **⚑**
- It has **four pillars**, and **metal beams run from each pillar to the middle**. **A 3D-printer nozzle hangs** from the center.
- A **giant touchscreen** stands on one side, and a **deposit crate** sits next to it.
- **You watch your items being printed in real time.** The nozzle sweeps over the bed and the item appears layer by layer.
- Every item has its own print time. Print jobs use real-world timestamps, so they keep printing even while you're in the field or the game is closed. **⚑**
- **Terminal tabs:**
  - **PRINT:** a scrollable catalog with categories (Weapons, Tools, Buildings, and added sections: Ammo, Attachments, Armor, Medical, Gear, Camo), search, sorting and an "affordable only" filter.
  - **QUEUE:** jobs in progress. Cancelling gives a full refund.
  - **LOCKER:** printed or extracted items, which you take into your inventory or store.

## Filament

| Source | Filament |
|---|---|
| Headshot kill on an operator | **10** |
| Body-shot kill | **5** |
| Explosive kill or mid-air kill (you or the victim airborne) | **30** |
| Small cache | **30** |
| Medium cache | **50–70** |
| Large cache | **70–200** |
| Abominable cache (extraction summit only) | **10,000** |
| World loot and operator bodies | small amounts **⚑** |

- **Cost guide:**
  - Weak, almost useless items cost about **10** (Zip .22).
  - A standard good assault rifle costs about **30** (XM9 Model 6, KA-43).
  - Super useful items cost **100+** (Patriot 09 at 110, BG 850 Cal at 450).
  - Huge projects cost **1,000** (the Sentry Turret).
- **Caches:** a cargo helicopter crosses the island every 4 minutes **⚑**. Each pass has a **30% chance** of dropping a cache at a random point.
  - **Size odds:** small 30%, medium 45%, large 25%. Only "small = 30%" came from the spec; the medium and large odds are interpretations. **⚑**
  - **Regions** weight both where caches land and how big they are. The north gets the most and the biggest.
  - **Abominable cache:** each pass also has a **5% chance** of dropping one at the extraction summit.
- **Deposit** filament (and cloth) into the POB crate to bank it. Carried filament is lost if you die.

## Weapons

| Weapon | Spec |
|---|---|
| **GG 60** | Full-auto Glock. 22 rounds, 1,300 RPM, heavy recoil; only good against unarmored players. |
| **Kalani KA-43** | AK-47 equivalent. |
| **XM9 Model 6** | M4 equivalent. |
| **Patriot 09** | 5.56 NATO, full-auto, 600 RPM, with a foregrip. **Pump the foregrip [V]** to click over to the second tube, which fires 12-gauge shells. |
| **Victors** | Two full-auto SMGs, one in each hand. Spray and pray at 2,000 RPM, 9 mm. **Only 30 rounds, and they can't be reloaded.** |
| **Trench Shotgun** | Pump action. |
| **Semi-Auto Shotgun** | Semi-auto. |
| **1911** | Classic pistol. |
| **Six Shooter** | Revolver. |
| **The Guillotine** | Giant .50 caliber revolver. |
| **744** | Desert Eagle equivalent. |
| **Slug Thrower** | Long-range shotgun: 100 m range, 74 damage, break action, one shot, slugs only. |
| **BG 850 Cal** | .50 cal sniper rifle. One-shots armor up to level 9; level 10 takes two hits. |
| Knife, Hatchet, Throwing Knives | Melee and throwables. |
| **CO2 Knife** | A knife with a trigger in the handle. The blade fires straight out to 25 m; past that you have to aim up. |
| Flare gun | 2 shots. Enemies within 50 m of the flare are outlined in red for 10 minutes, for you and your team. |

**Ammo classes:**

| Class | Calibers |
|---|---|
| Light | .22 and 9 mm and smaller |
| Medium | .38 Special up to 5.56 |
| Heavy | Above 5.56 |
| Explosive rounds | Any gun that isn't a shotgun |
| Shotgun shells, slugs, explosive slugs | Shotguns (the Slug Thrower takes slugs only) |
| AP rounds | Light, medium and heavy variants **⚑** (listed as an attachment in the spec) |

- **Ballistics:** where you hit and what you hit with both matter.
  - Hit zones are head, torso, arms and legs.
  - Penetration power is compared against armor level.
  - Bullets can pass through thin walls, trees (heavy rounds only) and bodies.
  - Damage falls off beyond a weapon's range.

## Armor, gear and attachments

- **Armor vests L1–L10** and **helmets L1–L10**.
  - Each armor level stops rounds below its penetration power.
  - L10 needs two shots from a .50 cal.
  - Heavier armor slows you down; L10 costs about 20% of your speed.
- **Backpacks L1–L10:** each level adds storage, from 6 to 40 slots.
- **Gear:**
  - **Winter gear** for the north.
  - **Sand gear** for the west.
  - **Camo suits** (forest, desert, winter) go **over any armor**. They give heat resistance, make you much harder to spot in their matching biome, and stop you being pinned (or shown on a kill cam).
- **Attachments:** some guns don't accept every one.
  - Extended Mag I, II and III, and a Drum magazine.
  - Red dot, holographic sight, and 1x, 4x, 6x and 10x scopes.
- **Gun camo** is cut from **cloth** you find (or from animal hides). Options: gold, redwood, forest, winter, sand, black & gold, white & gold, white, black.

## Survival systems

- **Bleeding:** light and heavy, plus fractures and lodged fragments.
  - **Bandage:** stops light bleeding.
  - **Gauze:** stops light bleeding and downgrades heavy bleeding to light.
  - **Tourniquet:** stops heavy bleeding.
  - **Medic kit:** stops all bleeding, fixes fractures and heals.
  - **Adrenaline shot:** speed boost and no pain.
  - **Numbing gel:** ignore fracture and pain penalties.
  - **Scalpel:** removes fragments.
  - **Hand warmers:** extra cold protection.
- **Temperature:** each biome's climate, day/night swings, altitude, weather and your gear set an exposure level. Full exposure means frostbite or heatstroke damage and slower movement. A **campfire** warms you up.
- **Time:** one game day is **30 real minutes**. Nights are moonlit.
- **Weather:**
  - Rain in the south and east.
  - Sandstorms in the west.
  - Blizzards in the north.
  - **Tornadoes** in the west, hub and south: they pull you in and hurt.

## Animals

Spawn chances per roll are kept deliberately low so this doesn't turn into a hunting game.

| Animal | Chance | Where |
|---|---|---|
| Sand wolves | 30% | Desert |
| Rabbits | 20% | Everywhere (each region has its own variant) |
| Deer | 15% | Forest |
| Wolves | 10% | |
| Squirrels, raccoons, coyotes | 5% each | |
| Bears, moose | 1% each | |

- **Behavior:** prey flee, wolves hunt in packs, and bears and moose defend themselves.
- **Hunting:** hit zones (head, vitals, body, legs), bleeding with blood trails, and harvesting for meat and hides (hides count as cloth).
- **Tree stands** are a printable building you can climb.

## Loop

1. Spawn at the POB.
2. Take gear out of your locker.
3. Head into a region.
4. Loot crates, hunt, contest caches and kill operators for filament.
5. Either **return to the POB** to deposit filament and print gear, or **extract at Frostfang Summit** to bank everything you carry (it goes to your locker).
6. If you die, you lose what you were carrying.
7. Leaving the game inside the safe zone keeps your kit; leaving outside it loses your kit. **⚑**

## Not built yet

- **Multiplayer.** "Other players" are AI operators for now. Teams and the kill cam need networking.
- **Photogrammetry art.** Everything uses procedural placeholders until real scans go through `pipeline/`.
- **A native or desktop engine** for the full-detail version on a high-end PC.

---

## Crafting catalog (generated)

### Weapons

| Weapon | Type | Caliber / ammo | Damage | RPM | Mag | Action | Filament | Print time |
|---|---|---|---|---|---|---|---|---|
| Throwing Knives (x3) | Throwable | — | 60 | — | 3 | melee | 8 | 40s |
| Zip .22 | Pistol | .22 LR | 16 | 60 | 1 | break | 10 | 45s |
| 1911 | Pistol | .45 ACP | 34 | 400 | 7 | semi | 15 | 1m |
| Six Shooter | Revolver | .357 Magnum | 48 | 220 | 6 | revolver | 18 | 1m 10s |
| CO2 Knife | Melee | — | 45 | — | — | melee | 20 | 1m 20s |
| GG 60 | Machine Pistol | 9mm | 17 | 1300 | 22 | auto | 22 | 1m 30s |
| Victors | Dual SMGs | 9mm | 15 | 2000 | 30 | auto | 25 | 1m 40s |
| Trench Shotgun | Shotgun | 12 Gauge | 15×8 | 70 | 6 | pump | 28 | 1m 50s |
| XM9 Model 6 | Assault Rifle | 5.56 NATO | 28 | 780 | 30 | auto | 30 | 2m 30s |
| Kalani KA-43 | Assault Rifle | 7.62x39 | 35 | 600 | 30 | auto | 32 | 2m 40s |
| Slug Thrower | Break-Action | 12 Gauge Slug | 74 | 60 | 1 | break | 38 | 2m 20s |
| Semi-Auto Shotgun | Shotgun | 12 Gauge | 12×8 | 260 | 8 | semi | 42 | 2m 30s |
| 744 | Hand Cannon | .50 AE | 72 | 200 | 7 | semi | 45 | 2m 30s |
| The Guillotine | Revolver | .50 Magnum | 98 | 120 | 5 | revolver | 70 | 3m 30s |
| Patriot 09 | Hybrid Rifle | 5.56 NATO + 12 Gauge | 30 | 600 | 30 | auto | 110 | 6m |
| BG 850 Cal | Sniper Rifle | .50 BMG | 170 | 40 | 5 | bolt | 450 | 15m |

### Ammo

| Item | Notes | Filament | Print time |
|---|---|---|---|
| Light Ammo x30 |  | 3 | 15s |
| Medium Ammo x30 |  | 4 | 20s |
| Shotgun Shells x12 |  | 4 | 20s |
| Shotgun Slugs x8 |  | 5 | 20s |
| Heavy Ammo x20 |  | 6 | 25s |
| AP Light Rounds x30 |  | 8 | 30s |
| AP Medium Rounds x30 |  | 10 | 35s |
| AP Heavy Rounds x20 |  | 14 | 40s |
| Explosive Slugs x4 |  | 15 | 1m |
| Explosive Rounds x10 |  | 20 | 1m |

### Attachments

| Item | Notes | Filament | Print time |
|---|---|---|---|
| Extended Mag I | +25% magazine | 8 | 40s |
| Red Dot | Clean dot sight | 10 | 40s |
| 1x Scope | Low-power optic | 10 | 45s |
| Holographic Sight | Wide holo reticle | 12 | 45s |
| Extended Mag II | +50% magazine | 15 | 1m |
| Extended Mag III | +75% magazine | 25 | 1m 30s |
| 4x Scope | Mid-range magnified optic | 25 | 1m 20s |
| 6x Scope | Long-range optic | 40 | 2m |
| Drum Magazine | +150% magazine, slower reload | 45 | 2m 30s |
| 10x Scope | Extreme-range optic | 90 | 4m |

### Armor

| Item | Notes | Filament | Print time |
|---|---|---|---|
| Backpack L1 | 6 slots | 8 | 40s |
| Helmet L1 | Level 1 head protection | 9 | 45s |
| Backpack L2 | 9 slots | 12 | 1m 29s |
| Helmet L2 | Level 2 head protection | 14 | 1m 43s |
| Armor Vest L1 | Level 1 body armor | 15 | 1m |
| Backpack L3 | 12 slots | 18 | 2m 21s |
| Helmet L3 | Level 3 head protection | 22 | 2m 48s |
| Armor Vest L2 | Level 2 body armor | 23 | 2m 23s |
| Backpack L4 | 15 slots | 27 | 3m 17s |
| Helmet L4 | Level 4 head protection | 34 | 3m 58s |
| Armor Vest L3 | Level 3 body armor | 36 | 3m 57s |
| Backpack L5 | 18 slots | 41 | 4m 15s |
| Helmet L5 | Level 5 head protection | 52 | 5m 10s |
| Armor Vest L4 | Level 4 body armor | 56 | 5m 39s |
| Backpack L6 | 22 slots | 61 | 5m 14s |
| Helmet L6 | Level 6 head protection | 80 | 6m 26s |
| Armor Vest L5 | Level 5 body armor | 87 | 7m 29s |
| Backpack L7 | 26 slots | 91 | 6m 15s |
| Helmet L7 | Level 7 head protection | 125 | 7m 45s |
| Armor Vest L6 | Level 6 body armor | 134 | 9m 23s |
| Backpack L8 | 30 slots | 137 | 7m 17s |
| Helmet L8 | Level 8 head protection | 193 | 9m 6s |
| Backpack L9 | 35 slots | 205 | 8m 21s |
| Armor Vest L7 | Level 7 body armor | 208 | 11m 23s |
| Helmet L9 | Level 9 head protection | 300 | 10m 28s |
| Backpack L10 | 40 slots | 308 | 9m 25s |
| Armor Vest L8 | Level 8 body armor | 322 | 13m 27s |
| Helmet L10 | Level 10 head protection | 465 | 11m 53s |
| Armor Vest L9 | Level 9 body armor | 500 | 15m 35s |
| Armor Vest L10 | Level 10 body armor. Survives a .50 cal. Heavy: slows you down. | 775 | 17m 47s |

### Medical

| Item | Notes | Filament | Print time |
|---|---|---|---|
| Bandage | Stops light bleeding, +10 HP | 2 | 10s |
| Hand Warmers | +12 C cold protection for 5 minutes | 3 | 15s |
| Gauze | Stops light bleeding and turns heavy bleeding light, +15 HP | 4 | 15s |
| Tourniquet | Stops heavy bleeding (limbs) | 6 | 20s |
| Scalpel | Removes lodged fragments (shotgun/explosive hits) | 6 | 30s |
| Numbing Gel | Ignore fracture and pain penalties for 90 s | 8 | 30s |
| Adrenaline Shot | +25% speed and no pain for 25 s | 12 | 45s |
| Medic Kit | Stops all bleeding, fixes fractures, +60 HP | 18 | 1m |

### Tools

| Item | Notes | Filament | Print time |
|---|---|---|---|
| Knife | Melee. Harvests animals. | 6 | 30s |
| Hatchet | Heavy melee. Harvests animals faster. | 10 | 45s |
| Flare Gun | 2 shots. Every enemy within 50 m of the flare is outlined red for 10 minutes. | 25 | 1m 30s |

### Gear

| Item | Notes | Filament | Print time |
|---|---|---|---|
| Sand Gear | Light gear for the Scorch Expanse. | 30 | 2m 30s |
| Winter Gear | Keeps you alive in the Frostfang Range. Hot everywhere else. | 40 | 3m |
| Forest Camo Suit | Worn over armor. Heat resistant, hides you in the forest and jungle. Can't be pinned, no kill cam. | 60 | 4m |
| Desert Camo Suit | Worn over armor. Very heat resistant, hides you in the desert. Can't be pinned, no kill cam. | 60 | 4m |
| Winter Camo Suit | Worn over armor. Hides you in snow. Can't be pinned, no kill cam. | 60 | 4m |

### Buildings

| Item | Notes | Filament | Print time |
|---|---|---|---|
| Campfire | Warmth (+25 C within 6 m) for 10 minutes. | 6 | 30s |
| Sandbag Wall | Waist-high bullet-stopping cover. | 12 | 1m |
| Wooden Barricade | Full-height wooden wall. | 18 | 1m 20s |
| Tree Stand | Climbable hunting platform, 5 m up. Place next to a tree. | 35 | 3m 20s |
| Sentry Turret | Automated turret. Engages hostiles within 45 m. Feeds on medium ammo. | 1000 | 30m |

### Camo

| Item | Notes | Filament | Print time |
|---|---|---|---|
| White Camo | needs 2 cloth | 5 | 30s |
| Black Camo | needs 2 cloth | 5 | 30s |
| Forest Camo | needs 3 cloth | 8 | 40s |
| Winter Camo | needs 3 cloth | 8 | 40s |
| Sand Camo | needs 3 cloth | 8 | 40s |
| Redwood Camo | needs 3 cloth | 10 | 50s |
| Gold Camo | needs 6 cloth | 40 | 2m |
| Black & Gold Camo | needs 6 cloth | 50 | 2m 30s |
| White & Gold Camo | needs 6 cloth | 50 | 2m 30s |

### Ammo classes

| Ammo | Penetration | Notes |
|---|---|---|
| Light Ammo | 2 |  |
| Medium Ammo | 4 |  |
| Heavy Ammo | 6 |  |
| AP Light Rounds | 5 | armor piercing |
| AP Medium Rounds | 7 | armor piercing |
| AP Heavy Rounds | 9 | armor piercing |
| Explosive Rounds | 3 | explosive (35 dmg, 2.5 m) |
| Shotgun Shells | 1 | buckshot |
| Shotgun Slugs | 5 |  |
| Explosive Slugs | 4 | explosive (70 dmg, 4 m) |
