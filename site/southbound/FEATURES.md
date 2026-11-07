# Southbound feature tracker

The owner's goal: **~30 new things added to every feature in the game, and 30+ brand-new
features.** This file is the source of truth for how far that has got. Update it whenever a
batch ships (counts, the batch name, and strike the ideas you used from the backlog). Pick the
feature with the fewest additions next. Batches ship as F# (features) alternating with G#
(graphics); see `ROADMAP.md` for what each one contains.

Counts are additions made in the "add to every feature" programme (F1 onwards, plus the S3/S4
side batches where they extended a feature). The original build of each feature isn't counted.

## Status (last updated: Phase 1.48, after G10)

| # | Feature | Files | Added | Batches | Status |
|---|---------|-------|------:|---------|--------|
| 1 | Gangs & the hideout | gang.js, crew.js | 35 | F10 | **done (35)** |
| 1a | Story missions | missions.js, missionsplus.js | 22 | F11 | 8 to go |
| 1c | Aircraft & flying | craft.js, aviation.js | 20 | F12 | 10 to go |
| 25 | Armory, armor & medical | armory.js, medical.js | 26 | F14 | 4 to go |
| 24 | Clothing & barber | grooming.js, clothes.js, clothing.js, details.js | 20 | F13 | 10 to go |
| 1b | Hunting | hunting.js, wilds.js | 12 | F5 | 18 to go |
| 2 | Police & law | police.js, policeplus.js, law.js | 11 | S3, F4 | 19 to go |
| 3 | Phone | phone.js, phoneplus.js | 10 | F6 | 20 to go |
| 4 | Residents / people | population.js, residents.js, peds.js | 8 | S3, S4 | 22 to go |
| 5 | Jobs | jobs.js | 8 | F7 | 22 to go |
| 6 | Driving & cars | driving.js, vehicle.js | 7 | F1, G4 | 23 to go |
| 7 | Fishing | fishing.js | 7 | F5 | 23 to go |
| 8 | Property | estate.js, propertyplus.js | 8 | S2, F8 | 22 to go |
| 9 | Street life | ambient.js, streetlife.js | 5 | F3 | 25 to go |
| 10 | Food & Gulf Marts | shops.js, foodplus.js | 4 | F9 | 26 to go |
| 11 | Guns & combat | gunwork.js, combat.js | 5 | F2 | 25 to go |
| 12 | Robbery & street crime | robbery.js, streetcrime.js, kerbside.js | 4 | S2, S4, F5 | 26 to go |
| 13 | Weather & time | weather.js, sky.js | 3 | F6, G8 | 27 to go |
| 14 | Boats & water | marine-air.js, splashes.js | 2 | G5 | 28 to go |
| 15 | Garage & customs | garage.js | 2 | F1 | 28 to go |
| 16 | Interiors | estate.js | 2 | S2, S4 | 28 to go |
| 17 | HUD, map & UI | hud.js, ui/ | 2 | F5, F6 | 28 to go |
| 18 | Needs (sleep, food, weight) | needs.js | 1 | F9 | 29 to go |
| 19 | Wounds & health | wounds.js | 1 | F9 | 29 to go |
| 20 | Tools & inventory | tools.js | 1 | F2 | 29 to go |
| 26 | Gunsmiths | gunstores.js | 0 | | 30 to go |
| 27 | Stray & farm animals | strays.js | 0 | | 30 to go |
| 28 | World events | world-events.js | 0 | | 30 to go |
| 29 | Demolition & damage | demolition.js, holes.js | 0 | | 30 to go |
| 30 | Property auction | auction.js | 0 | | 30 to go |
| 31 | Audio | core/audio.js | 0 | | 30 to go |
| 32 | Camera & controls | core/camera.js, input.js | 0 | | 30 to go |
| 33 | Career, stats & saving | career.js | 0 | | 30 to go |
| 34 | Hospital & precinct | civic.js | 0 | | 30 to go |
| 35 | Roadside (breakdowns, hitchhikers) | roadside.js | 0 | | 30 to go |
| 36 | Physics props | props.js | 0 | | 30 to go |
| 37 | Loot | loot.js | 0 | | 30 to go |
| 38 | Car combat | carcombat.js | 0 | | 30 to go |
| 39 | Movement & footing | footing.js, player.js | 0 | | 30 to go |

**Totals: about 228 additions across 25 features; 14 features untouched; 1 feature at 30+ (gangs).**
Brand-new features added this programme (not extensions): banking, news, contacts, cabs,
legendary animals and fish, poaching, property market, burglaries, food spoilage, tracks in the
ground, boat wakes, rain soak, crew jobs, hideout raids, 12 side jobs, flight school, laundromats,
dirty/bloody clothes, dust (G9: cars, feet, aircraft, dust devils), gravel county roads and live
oaks (G10): about 32 of the 30+ asked for.

## Backlog: ideas per feature (take from here, strike when shipped)

- **Gangs & hideout (F10 shipped; left for a later batch):** protection money from businesses,
  recruiting new members, gang colours and vehicles, safehouses, informants, a crew member
  following you as backup, betrayal risk.
- **Story missions (F11 shipped 22; left):** mission choices with consequences, cutscene camera
  framing, accuracy rating, epilogue missions after the story, more side jobs, timed bonus
  objectives per mission, side characters returning in later side jobs.
- **Aircraft (F12 shipped 20; left):** skydiving and parachutes, crop-dusting pay by coverage,
  helicopter winch, cockpit view, airport traffic (other planes landing), hangar rental,
  aerobatics scoring in the stunt plane, banner towing, bird strikes, fuel trucks.
- **Clothing & barber (F13 shipped 20; left):** weather-appropriate clothes (cold, rain), ~~clothes
  getting dirty and bloody~~, ~~washing~~, ~~outfits saved~~, ~~disguises~~, ~~beard styles~~,
  tattoos, accessories (watches, glasses, chains), uniforms for jobs, NPC reactions to how well
  you dress (smart clothes in the city, workwear in the country), torn clothes from bullets and
  falls, a tailor for repairs, sweat stains in the heat.
- **Armory / medical (F14 shipped 26; left):** bandaging takes time (an animation), tourniquet
  time limits, ~~splints for broken bones~~, ~~painkillers with side effects~~, ~~armor
  durability and repair~~, ~~infection~~, ~~hospital bills by injury~~, a crew medic at the
  hideout, scars drawn on the skin, heartbeat sound at low health, blood trails when bleeding.
- **Audio:** footsteps by surface, wind in grass, birdsong by time of day, rain on roofs and car
  roofs, distant traffic, sirens doppler, radio stations (original, procedurally generated),
  ambient city hum, gun echoes by environment, interior reverb.
- **HUD, map & UI:** map legend and filters, custom markers, fast travel signposts, a journal,
  achievements, a photo gallery, a settings search, minimap rotation option, compass.
- (more lists to be added as each feature comes up)
