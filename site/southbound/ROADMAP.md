# SOUTHBOUND — Roadmap / Master To-Do

Original open-world action game set in **Calvera**, a fictional state on the
southern edge of North America (Gulf Coast). Inspired by the open-world crime
genre, but every name, place, character and story beat is our own.

Status key: `[x]` done · `[~]` started / partial · `[ ]` not started

---

## Phase 1 — Graphics, world, core slice (current)

- [x] Three.js vendored locally (no CDN needed at runtime)
- [x] Start screen: **Phone** vs **PC** selection before loading
- [x] Auto GPU detection (reads GPU name, picks a preset)
- [x] Quality presets: Phone / Low / Medium / High / Ultra
- [x] Dynamic resolution: holds the target FPS (60 phone, 60–120 PC)
- [x] Render resolution up to 4K (3840×2160) on PC
- [x] Settings menu (graphics, controls, audio, content filters) saved locally
- [x] Physical sky + day/night cycle, sun and moon light
- [x] Image-based lighting from the sky (reflections on cars, water)
- [x] Cascaded-style sun shadows that follow the player
- [x] Procedural terrain shader (grass / dirt / rock / sand / snow by slope + height)
- [x] Water shader (Fresnel, animated waves, sun glints, shoreline foam)
- [x] Post-processing: bloom, SMAA, ambient occlusion (Ultra), ACES tone mapping, vignette, color grade
- [x] Instanced forests with wind animation, grass fields (PC)
- [x] Procedural textures (asphalt + lane lines, building facades, lit windows at night)
- [x] Regions: big city, small town, dense forest, open hunting plains, big lake, rivers/creeks, coast
- [x] Road network connecting regions
- [x] On-foot player, third-person camera, keyboard/mouse + touch controls
- [x] Drivable car (arcade physics, terrain following, collisions)
- [x] AI traffic that follows roads and keeps distance
- [x] HUD: minimap, speedometer, clock, region banner, FPS
- [x] Automated playtest: screenshots + video (tools/playtest.js)

## Phase 1.5 — Open-source asset pass (GTA-style) (done)

- [x] Animated people from Quaternius CC0 packs (12 outfits), 24 retargeted animations
- [x] Kenney CC0 Car Kit: 13 vehicles incl. police, taxi, ambulance, fire truck, garbage truck
- [x] Pedestrians on city/town sidewalks: cross streets, chat, flee gunfire, get hit, die, drop cash
- [x] Combat: fists + pistol, aiming camera, crosshair, hit detection, muzzle flash, tracers, blood (Content filter aware)
- [x] Wanted level (1–5 stars), police cruisers with sirens that chase you, officers who get out and shoot
- [x] Arrest and death with respawn at precinct / hospital, money, health and armor
- [x] Carjacking: the driver gets thrown out and runs off
- [x] HUD: health/armor under the radar, money, wanted stars, weapon + ammo, police on the radar
- [x] Game ships as one bundled script so it runs on older phones (tools/southbound/build.mjs)

## Phase 1.6 — Cinematic graphics pass (done)

- [x] Photo-scanned CC0 surfaces (ambientCG) in GPU-compressed KTX2 for terrain, roads, sidewalks, brick and concrete walls
- [x] Terrain: height-blended layers, anti-tiling, triplanar cliffs, normal maps
- [x] Height fog with sun glow (golden-hour haze), cloud layer
- [x] Post chain (pmndrs postprocessing + N8AO): AO, sun shafts, DOF (Ultra), bloom, AgX tone mapping, colour grade, grain
- [x] Realistic trees and bushes (ez-tree, baked): 3D near the camera, impostor sprites far away
- [x] Grass clumps and scanned rocks as ground cover
- [x] Hydraulic erosion on the terrain (gullies, ridges, valley floors)
- [x] Realistic player, pedestrians and police built from CC0 MakeHuman assets
- [x] Volumetric ray-marched clouds (cached in a sky cube, so 4K costs the same as 720p); clouds show in reflections
- [x] Weather: clear / cloudy / overcast / rain / storm with lightning and thunder; rain streaks; wet roads with puddles and street-light reflections
- [x] Planar reflections on the lake and the Gulf (High/Ultra)
- [x] Procedural realistic vehicles: smooth bodies, clear-coat paint, glass, LED lights, grilles, plates, panel gaps, real rims and tyres, LODs; random real-world paint colours for traffic

## Phase 1.7 — Arsenal + store readiness (done)

- [x] 221 weapons in 7 categories from 22 base platforms by 12 invented gunmakers (stats, prices, procedural 3D models)
- [x] 195 attachments in 6 slots (optics, muzzle, barrel, underbarrel, magazine, stock) that change weapon stats
- [x] Arsenal store screen (B key / HUD button): browse, buy, equip, fit attachments
- [x] Shotgun pellets, explosive rockets/grenades with blast damage, silent bows with arrows in flight
- [x] Installable web app (manifest + icons); Capacitor setup guide for the App Store / Google Play (`mobile/`)

## Phase 1.8 — The whole list (first playable versions)

- [x] Career save on the device (money, garage, weapons, properties, home, tools, jobs, story) + autosave
- [x] Interaction markers (light columns), minimap blips, GPS waypoints, phone menu (I / 📱)
- [x] 93 land vehicles in 15 classes (procedural, built on first use), dealerships, 63 parts per car + 20 paints, nitrous
- [x] 16 boats + 98 boat upgrades, 3 marinas with piers, buoyant boat physics
- [x] 11 aircraft (6 planes, 5 helicopters) + 17 upgrades, Redgrass Airfield (runway, hangar), arcade flight
- [x] Every building enterable: generated homes, apartments, offices, stores, bars, warehouses
- [x] 198 properties for sale (homes = save/sleep point, businesses pay daily), realtor listings
- [x] 243 tools in 8 trades (heal, armor, repair, flashlight, metal detector, calls, rods, bait, trade tools for jobs)
- [x] Hunting: 8 species with behaviour (graze/flee/charge), skinning, 3 trading posts
- [x] Fishing: cast/bite/reel-tension minigame, 4 water types, 23 species, fish market + log
- [x] 27 jobs with work vehicles, timers, pay per stop and levels
- [x] 63 story missions in 3 acts (original story: Eli Navarro vs. the Delacroix family, the Ríos crew and Capt. Voss)

## Phase 1.9 — Open-source 3D models instead of generated ones

- [x] Animals: Quaternius CC0 animated deer, stag, coyote, wild horse, longhorn cattle + Khronos fox (replaces generated animals)
- [x] Interiors furnished with Quaternius house-interior models + photoreal Khronos furniture (sofas, chairs, store fridges, lamps, plants)
- [x] Photoreal Khronos concept car (drivable, PC starter car), open-source fish and bow models
- [ ] Realistic open-source cars, boats, aircraft and modern guns: on Sketchfab / Poly Pizza / Poly Haven / itch.io,
      which this cloud environment's network policy blocks. Allow `polyhaven.com`, `api.polyhaven.com`,
      `dl.polyhaven.org`, `poly.pizza`, `static.poly.pizza`, `3dassets.dev`, `kenney.nl`, `quaternius.com`, `itch.io`
      (environment settings → Network access) and the generated vehicles/guns can be swapped the same way.

## Phase 1.10 — HUD, exact hitboxes, QA

- [x] HUD: vehicle damage silhouette + speed (bottom right), chase-only wanted stars, 10 s area card (name, time, wanted),
      minimap icons (homes, jobs, shops, animals as road signs, cops blue, attackers red, your car as a silhouette), free camera (C)
- [x] Exact hitboxes: shots test real triangles (skinned people/animals in pose, vehicles, trunks, rocks, poles, furniture) via BVH;
      vehicles collide with their exact oriented footprint (buildings, trees, poles, cars, player)
- [x] QA harness (`node tools/southbound/qa.mjs <preset> [--all-doors]`): 499 checks (925 with every door) pass on Phone and High
- [x] Polish: blurred reflection sky (no grain), photo-scanned interior walls/floors, rain ripples, streaky wet reflections

## Phase 2 — World depth

- [ ] Expand map to more of the continent's southern side (multiple states/regions)
- [ ] Streaming world chunks (needed before the map gets much bigger)
- [~] Every building gets an enterable interior (procedural generator done; hand-made key interiors to do)
- [ ] Pedestrians with daily routines
- [ ] Traffic lights, lane changes, police response
- [ ] Weather: rain, storms, fog, hurricanes
- [ ] Real asset pass (needs network allow-list: polyhaven.com, ambientcg.com, kenney.nl, quaternius.com, freesound.org)

## Phase 1.11 — RDR-style play, living world

- [x] Daytime: stronger sun, less milky haze, bluer sky, punchier grade (phones too, via the tone-mapping curve)
- [x] Ground cover: continuous grass carpet on every preset (terrain-coloured blades, tall golden grass on the plains,
      lawns in town), wildflower patches, scattered stones, bush clusters and lone trees on the plains
- [x] Feet on the drawn ground: road surface, sidewalks and curbs, terrain triangles; smooth curb steps
- [x] Auto vault / mantle / climb up to 2.5 m (6'3" + arms) when there's a ledge and a clear top
- [x] Hands follow the animation's finger poses (no curled rest pose)
- [x] Weapon wheel (holster, sidearm, dual sidearms, rifle, shotgun, long range, bow, heavy), slow-mo while open
- [x] Holsters: sidearm on the hip, long gun slung on the back; aiming draws, H holsters
- [x] Real-world firearm models only, no sci-fi: Quaternius Survival pack (pistols, revolvers, shotguns) and
      Toon Shooter Game Kit (AK rifle, SMG, bolt-action snipers, pump shotgun, revolver grenade launcher), all CC0
- [x] Arm IK holds per weapon type (two-handed pistol, shouldered rifles/shotguns, low ready, port arms, dual wield);
      reloads per action (box mag, pump, bolt, revolver); idle inspects
- [x] Gun HUD: only minimap + health + grey weapon silhouette and ammo while a gun is out on foot
- [x] First person with sharper shadows and higher resolution
- [x] Hold-to-interact: greet / antagonize (4x: fight or call the cops; 2x on a cop: arrest)
- [x] Police heat: holstered arrest teams for minor crimes, guns drawn for felonies, shoot on sight for killings
      or if your gun is out, SWAT with rifles, tanks (Quaternius Tank pack) at the top
- [x] Surrender + arrest scene (cuffed, into the cruiser, days pass, fine from your bounty)
- [x] Bounty after escaping outside the city; hunters every 3 game days, bigger and better armed as you kill them;
      top tier brings a minigun gunship and the police; pay it off at the Central Precinct
- [x] Roadside walkers on country roads; stop and offer a ride for a tip
- [x] More pedestrians and traffic on every preset
- [x] No glowing ground markers; custom shops are drive-in workshops; car doors swing open when you get in
- [x] Loading screen with in-game art, tips and progress
- [x] Fewer touch buttons: ◎ interact replaces the car button; map, phone, arsenal, free cam moved to pause

## Phase 1.48 — The Gulf Coast as it really looks (graphics milestone G10)

Aimed at a photo the owner took: a gravel county road on a humid, cloudy evening, live oaks,
mown lawns, houses on big lots, a dusty car on the verge.
- [x] Soft cloudy light: a sun behind thin cloud spreads instead of just dimming. Shadows fade
      and soften, the sky lights everything evenly (`world/sky.js`)
- [x] Humid Gulf haze: things a few hundred metres off pale and blue, more early and late in the
      day and under cloud (aerial perspective)
- [x] A photograph's colour, not a game's: the grade is close to neutral in sun and soft and muted
      under cloud, on every preset (the Low/Phone tone curve too)
- [x] Live oaks: the Gulf Coast's tree, wide and low on a short, thick trunk under a dense, dark
      crown. A share of the broadleaf trees outside the woods became live oaks, and Mill Creek's
      front yards got big shade oaks (`world/vegetation.js`)
- [x] Gravel county roads: the lanes round the far edge of the outskirts are crushed white
      limestone. Every stone its own size and shade close up, two packed tyre tracks, loose rock on
      the crown, dirt and grass creeping in from the verges, darker when wet (`world/roads.js`)
- [x] The terrain round those lanes is dirt and dry grass, not pavement (`world/heightmap.js`)
- [x] Dust comes up off the gravel (G9's dust knows the county roads)
- [x] Fixed: a whole frame could go black on Medium and up. One bad pixel value (a NaN) anywhere
      on screen was blurred by the post-processing into every pixel. Every material now hands the
      post chain a clean value (`main.js`)

## Phase 1.47 — Armour and medical, batch one (feature batch F14)

Staying alive (`src/systems/medical.js`, with hooks in `armory.js` and `main.js`):
- [x] Wounds left undressed for half a day get infected: a fever that tires you, shakes your aim
      and slowly drains your health; dressings, gauze, an IFAK or a trauma bag keep a wound clean
- [x] Antibiotics from the hospital pharmacy, taken from the phone; a course clears the infection
- [x] Painkillers warn you as they wear off; three in a few hours and you're woozy (a shaky aim,
      the colours swim), a fourth makes you sick
- [x] A plate that stops a round still knocks the wind out of you: no sprinting, a shaky aim
- [x] Helmets wear out and crack (and get replaced at the armour stores); a round your helmet
      stops still rings your head
- [x] The weight of a plate carrier slows your sprint, and it's hot work at midday
- [x] Hard crashes hurt, and can concuss you: blurred, swimming vision and an unsteady aim
- [x] Losing blood greys and darkens the world as your health runs low
- [x] Falls hurt; a long one can break a leg (a splint, an IFAK or a doctor fixes it)
- [x] Cottonmouths in Bayou Verde, mostly at dusk and after dark: a bite that needs antivenom
      at the hospital (an IFAK or trauma bag slows the venom)
- [x] Animal bites can get infected, and want rabies shots within three days
- [x] Healing on your own: fed and rested you slowly come back to three-quarters; a night's
      sleep or a long rest heals more
- [x] Doctors at the Port Calvera Medical Center and the Mill Creek Clinic: treatment billed by
      what's wrong (stitches, a broken leg, antivenom, rabies shots...), and a pharmacy
- [x] A first-aid cabinet at the hideout: two fresh bandages a day
- [x] Healed wounds leave scars
- [x] The phone's Health tab: wounds, infection, venom, concussion, antibiotics, armour and
      helmet condition, and your medical record (times shot, plates that saved you, scars,
      hospital visits, snakebites, falls)
- [x] Dust devils made thicker and taller (G9 follow-up)

## Phase 1.46 — Dust (graphics milestone G9)

What dry ground gives up when something moves over it (`src/systems/dust.js`):
- [x] Cars and trucks off the pavement (dirt, sand, the forest floor, dry grass) throw a rolling
      cloud off the back wheels that hangs, spreads and drifts off with the wind; more at speed,
      a lot more when you slide it
- [x] Traffic and police cars do it too, so a car on a dirt track shows from a long way off
- [x] Running feet kick up small puffs on dry soil and sand; so do galloping mustangs and deer
- [x] A plane's prop blast on a dry strip; a helicopter's downwash blows a ring of dust out
      from under it
- [x] Dust devils: on hot, clear afternoons a whirl of dust wanders across open dry ground
- [x] Rain lays the dust: none off wet ground, and it comes back as things dry out
- [x] Coloured by the ground it came off (pale sand, tan soil, grey-brown forest floor); lit by
      the sun and sky (dark at night), glowing when you look through it towards a low sun
- [x] Drawn as one instanced pool of soft puffs that face whatever camera draws them (in the
      shader), sized by the quality preset

## Phase 1.45 — Clothes and the barber, batch one (feature batch F13)

Clothes that get lived in (`src/systems/grooming.js`, the mud and blood drawn in
`src/entities/clothing.js`):
- [x] Mud: walking and running on dirt, sand, grass and through the woods dirties your shoes and
      trouser legs first, then works up; drawn on the clothes from the ground up
- [x] Rain on soft ground makes it worse; a good rain on pavement rinses a little off
- [x] Going down (ragdolling) in the dirt is worse than walking in it
- [x] Blood: getting hurt bloodies your shirt, in patches
- [x] Suds Laundromats in Port Calvera and Mill Creek: $8 and half an hour, like new
- [x] The basin at the hideout: wash up for free
- [x] Anything you change into is clean
- [x] A change of clothes as a disguise: change while the police can't see you and they lose a
      star (once every five minutes, up to three stars)
- [x] Saved outfits: five slots in the phone (Outfits tab), worn at the hideout, indoors or in a
      clothing store
- [x] The phone tells you what state your clothes are in (clean, muddy, filthy, bloodstained)
- [x] People notice: strangers comment on the mud, the blood or a wild beard
- [x] An officer who sees you covered in blood stops you to ask whose it is
- [x] A jacket in the midday heat tires you out faster
- [x] Saturday sale: 20% off at every clothing store

At the barber (`src/systems/details.js`):
- [x] Beard styles: full, goatee, moustache, stubble, clean
- [x] Hair styles: short, buzz (stubble on the scalp), slicked back (darker, glossy), shaved
- [x] Hair dye: black, brown, grey, blond, red (or back to natural)
- [x] Each change is a new option in the barber's chair, with its price
- [x] Washes and haircuts counted in your stats
- [x] Facial hair painted on the face instead of the old see-through shells: stubble that fills
      in to a beard over a week, in the shape you chose; dye recolours your own hair and brows

## Phase 1.44 — Flying, batch one (feature batch F12)

In the aircraft (`src/entities/craft.js`):
- [x] Fuel: it burns with the power you use; run dry and the engine stops (glide a plane in,
      autorotate a helicopter down)
- [x] Stalls: too slow in the air and the wing quits; the nose drops
- [x] Landing gear (G) and flaps (J): the gear up is faster but a belly landing wrecks the plane;
      flaps let you fly slower and land shorter
- [x] The wind carries you (the real wind, the one the windsock and the hunters' arrow show) and
      storms throw you about
- [x] Touchdowns measured: how hard you hit and what on

At the controls and at the field (`src/systems/aviation.js`):
- [x] A flight panel: airspeed in knots, height in feet, heading, climb rate, fuel, gear, flaps
- [x] Warnings: STALL, PULL UP, LOW FUEL, ENGINE OUT
- [x] Damage you can see: a smoking engine when it's hurt, an engine that can quit when it's bad
- [x] Landings rated: butter, smooth, firm, hard, belly
- [x] The radio at Redgrass: cleared for departure (with the wind), in the pattern, welcome back
- [x] Runway edge and threshold lights after dark; a windsock that shows the real wind
- [x] Nav lights (red, green) and a white strobe on every aircraft near you at night
- [x] Refuelling: stop on the fuel pad at Redgrass, or by a marina pier in a seaplane
- [x] Flight school at Redgrass: take-off, the circuit and landing, with medals, and a pilot's
      licence at the end (the flying jobs pay 15% more)
- [x] Low flying over Port Calvera is against the law: under about 250 ft for long and the
      police have your tail number
- [x] Flight time, highest altitude and landings in your stats

## Phase 1.43 — Story missions, batch one (feature batch F11)

- [x] Medals (`src/systems/missionsplus.js`): gold, silver or bronze for every mission, from three
      things: inside the par time (worked out from the mission's own steps), little damage taken,
      and no police on you that the mission didn't ask for. Each is +10% pay; your best is kept
- [x] Checkpoints: fail partway and press F within 15 seconds to retry from the step you were on
      (from the theft, if it was the delivery that went wrong), not from the top
- [x] Hints: fail the same mission twice and you get a tip for the step that's beating you
- [x] Failing for a reason: you died, you were arrested, the mission vehicle was wrecked
- [x] Contacts text you when their next mission is ready, trust you more with every job (more
      for gold), and have their own words when you finish
- [x] Act title cards when a new act starts, the papers notice, and an ending card
- [x] The phone's Story tab: medals and trust on every mission, GPS to the next one, replay any
      finished mission for a better medal (a quarter of the pay), abandon the job you're on
- [x] Gold medal milestones: 5, 15 and 30 golds pay out
- [x] Twelve side jobs from people around Calvera (a yellow ? on the map), opening up as the story
      goes on: a lost retriever in Pinewood Hollow, a drifting skiff, a wedding run, a crawfish
      boil, a gator in the motel pool, a repo job, a storm chaser, night fishing, a record
      collector, moving day, air mail and closing time at the Rusty Anchor

## Phase 1.42 — The Gulf Line crew, batch one (feature batch F10)

Crew (`src/systems/crew.js`, on the crew's own menu at the hideout):
- [x] Loyalty for each of the fourteen, and moods (happy, content, grumbling, angry, nervous,
      hurting, out on a job, locked up) that come from how you treat them and what's going on
- [x] Four skills each (driving, shooting, stealth, smarts), different for every member, that
      grow with the work they do
- [x] A Crew tab: everyone's mood, loyalty, skills and jobs done
- [x] Payday every three days (their cut, by head); skip it and they grumble, then loyalty drops
- [x] Gifts (once a day each), and a favour each per week from what you carry (fish, scrap metal,
      game meat, a pelt, a loan they pay back with interest)
- [x] Birthdays: Rico texts you the morning of, and a present means more that day
- [x] The gang's respect: Unknown, Known, Respected, Feared, Legend, from jobs, raids and
      running rivals off their turf; it unlocks the bigger upgrades and makes the paper
- [x] Crew who stay unhappy too long take off for a couple of days

Crew jobs (a Jobs tab):
- [x] Five jobs to send people on: a smuggling run, the chop shop, a card game, collecting
      debts, a fishing charter. The best free person for it goes; they're gone for hours of game
      time and their skills, loyalty and the heat decide how it goes
- [x] Their cut goes into the hideout stash and they text you how it went (cards can lose)
- [x] Injuries (hurt crew rest, sitting, for a day) and arrests: bail them out from the crew menu,
      or they sit three days and come home sour
- [x] Gang heat: every job raises it, it cools a little each day, and high heat means more arrests

The hideout:
- [x] Rico's morning briefing: a tip a day (where the white buck was seen, which turf is soft,
      where the police are doubling up)
- [x] Talk round the fire at night: the crew rib each other
- [x] They greet you when you get back, notice when you're hurt (Marisol) or have the police on
      you (Jayden)
- [x] A day and a night: some are out on errands in the afternoon; at night most sleep, while
      Big O and Jayden keep watch and Marisol stays on call
- [x] Three chores a day (chop firewood, haul water, mend the fence): a few dollars and the crew
      notices
- [x] Eight upgrades you can see: bunkhouse beds (wake fully rested and healed), an outdoor
      kitchen (a free meal a day), a police radio, floodlights, a gate and fence, an armory rack
      (restock every gun once a day), a watchtower and a garage bay (half-price repairs)
- [x] A cash stash: money there is safe from muggers, arrests and hospital bills

Rivals:
- [x] Gangs you've run off their turf come for the hideout at night while you're there: four of
      them up the road, the crew takes cover, and beating them off earns respect
- [x] While you're away they can hit the stash (unless the gate's built; floodlights halve it)
- [x] A Turf tab (the three gangs, how often you've hit them) and truces: a week's peace for
      $1,500, and their turf warns you instead of shooting

## Phase 1.41 — Real grass blades (no more crossed cards)

- [x] The meadow and plains grass round you is now real strands (`src/world/grasscards.js`), not
      painted cards stood up in crosses (from above those read as flat stars). Every tuft is a
      bunch of individual blades rooted over a small patch, each tapering to a point and leaning
      and curling its own way, with a darker root, a pale midrib, darker edges, bleached tips on
      some, a few dead straw blades and the odd seed stalk
- [x] Three rings round the camera, all blades: thin and packed tight close up (5-13 mm), then
      wider blades further apart, out to the edge of the grass, so the ground stays covered at
      every distance. More blades per tuft on the higher presets
- [x] Everything the cards did still works: the wind, parting round you and your vehicle, the
      ground's own grass colour, straw on the dry plains, the lawn and path masks, light through
      the blades from behind

## Phase 1.40 — People and cars in the rain (graphics milestone G8)

- [x] Soaked through (`src/entities/bodyshade.js`): out in the rain everyone gets wetter over a
      minute or so: clothes go darker and lose their sheen, hair darker and glossy, skin glistens.
      They dry over a few minutes when it stops (faster indoors)
- [x] Tyre spray: cars on wet roads throw spray up behind their back wheels, more the faster they go
- [x] Footsteps splash on wet ground

## Phase 1.39 — Food and the Gulf Marts, batch one (feature batch F9)

- [x] Fresh food goes off (`src/systems/foodplus.js`): a po'boy, étouffée, gumbo, catfish or boudin
      carried for more than a day is "going off", and eating it can make you sick: you lose health,
      can't heal for a while and feel it
- [x] Coffee and energy drinks wake you up a bit (they help with tiredness, not only your aim)
- [x] A loyalty card: every tenth Gulf Mart purchase is on the house
- [x] Today's special: one thing on the menu each day at 40% off

## Phase 1.38 — Property, batch one (feature batch F8)

- [x] Rent (`src/systems/propertyplus.js`): houses, apartments and penthouses you own but don't live
      in are let out, and the rent comes in every day
- [x] Tax and upkeep every day, paid from the bank if there's money in it (else from your pocket);
      the county texts you the day's account
- [x] The market moves: each kind of property drifts up and down a little every day (pulled back
      towards normal); the realtor shows what yours are worth today
- [x] Sell anything you own (not your home) at today's value, less the agent's 6%
- [x] Burglaries: now and then someone breaks into one of your places while you're away, and you
      lose something; it makes the paper
- [x] Upgrades for each place you own: a security alarm (the police come, nothing's taken), solar
      panels (two thirds off the upkeep), a renovation (+15% value and rent)

## Phase 1.37 — Light in the air at night (graphics milestone G7)

- [x] Lamp light (`src/world/beams.js`): after dark a soft cone of lit air hangs under each street
      lamp near you; thick where you look across it, fading at its edges and towards the ground
- [x] Headlight beams: two beams ahead of every car near you (yours, the traffic's), a touch
      down; police cars with their lights on throw red and blue
- [x] Haze: the cones are faint on a clear night and stand out in fog, mist and rain
- [x] Cheap enough to leave on: only the nearest lamps (re-picked twice a second) and cars near you,
      nothing indoors or in daylight, off on the Phone preset

## Phase 1.36 — Jobs, batch one (feature batch F7)

- [x] Every shift is rated (`src/systems/jobs.js`): knocks and crashes in the work vehicle cost
      stars, and riders (taxi, bus, ambulance, charter, air tours, medevac) complain out loud
- [x] Tips: riders tip for a smooth ride, by the stars; pizza tips for pizza that's still hot (and
      none when it's gone cold)
- [x] The night shift (10 pm to 6 am) pays a quarter more
- [x] Ranks in every job: Trainee, Regular, Senior, Lead, Veteran (on the job board and the phone)
- [x] Wreck the work vehicle and you're fired, for the rest of the day
- [x] Dispatch texts you the shift's rating; five great shifts in one job and you're employee of the
      month (+$500, and it makes the paper)
- [x] Work vehicles come with a full tank; the phone's Jobs tab shows rank, shifts, total earned
      and the last rating

## Phase 1.35 — Tracks in the ground (graphics milestone G6)

- [x] Prints (`src/world/tracks.js`, `src/systems/prints.js`): boot prints behind you and the people
      walking near you, cloven hooves behind deer, cattle and horses, paw prints behind coyotes and
      foxes, and tyre tracks from every wheel of your car or truck off the road
- [x] Only in soft ground (sand, dirt, grass, forest litter), deepest in sand and wet ground; each is
      pressed in along the slope, with a normal map so its rim catches the light
- [x] They fade over a few minutes, faster in the rain, so a fresh trail is a fresh trail: follow a
      deer's prints to where it went, or your own back

## Phase 1.34 — The phone, batch two (feature batch F6)

- [x] Battery (`src/systems/phoneplus.js`): it runs down, faster with the screen or the light on,
      and charges in any vehicle or indoors. Flat, the phone won't open. Shown under the phone button
- [x] The phone's own light: no flashlight? L turns on the phone's (dimmer, and it eats the battery)
- [x] Bank: cash on you is what a mugger, an arrest or the hospital takes a cut of. An ATM stands
      outside every Gulf Mart: deposit and withdraw there, check the balance anywhere. A little
      interest every day (the bank texts you)
- [x] News: the Calvera Courier writes up robberies, killings, gunfire and poaching (some of it
      yours) and the local goings-on, a new paper every day
- [x] Messages: texts from people you've met, the bank, and anyone else with something to say;
      unread ones show by the battery
- [x] Contacts: talk to someone (F) and they give you their number. Call them and they tell you
      where they are and what they're doing (by their day), or don't pick up if they're asleep
- [x] Weather: what it's doing now and what's coming, and when. The weather itself now builds and
      clears a step at a time (clear, cloudy, overcast, rain, storm): no storm out of a blue sky
- [x] Camera: take a photo of what you see, without the HUD, saved as a PNG
- [x] Cab: a ride to any place in the Places list ($4 + $2.60 a mile). Wait for it, fade out,
      get dropped off; the clock moves on by the length of the ride. Not with the police after you

## Phase 1.33 — Hunting and fishing, batch one (feature batch F5)

- [x] The wind and your scent (`src/systems/hunting.js`): animals downwind of you smell you from much
      further off; upwind you can get close. A small wind readout (and arrow) shows near game
- [x] Walking softly: slow on foot and they hear you at half the distance; running, from further
- [x] When they're about: deer and bucks at dawn and dusk, coyotes and foxes at night
- [x] Wounded animals: hit but not killed, they run, slow as they weaken, and bleed out within a
      minute or so, leaving a blood trail on the ground you can follow (`src/systems/wilds.js`)
- [x] Pelt quality: one clean shot from the right calibre is perfect (★★★); more holes, or far too
      big a gun, and the buyer pays less. Shown when you skin it and in the price
- [x] Meat: a deer or buck gives you meat. Sell it at a trading post or have a plate cooked there
      (it fills you up)
- [x] Legendary animals: the Pale Buck in Pinewood Hollow, Old Scar in the Sierra Norte and Ember in
      Bayou Verde. One of each, rarely about (likelier at their hour), bigger, warier and worth
      hundreds. The trading posts' Rumours tab says where to look
- [x] A hunting licence ($40 at any trading post). Without one, or killing a horse or a cow, is
      poaching: a crime if anybody sees it
- [x] Crows find a carcass left lying and circle over it, lifting off when you come close
- [x] Ducks: rafts of them paddling on the lake, the rivers and the bayou; they burst off the water at
      a shot, when you walk up, or when a boat comes through
- [x] Fishing: bites come quicker at first and last light and in the rain, slower in the midday heat
      or a storm, and quicker the more you've caught
- [x] Size limits: anything under the limit goes back (it's still in your log)
- [x] Records: beat your best for a species and it says so
- [x] Legendary fish: Old Mossback (lake), the Ferryman (river), Gator Jaw (bayou), the Silver King
      (sea). Rare, on a good rod, and they fight
- [x] The line sags between rod and water and comes tight as you reel; the rod bows under the strain;
      a hooked fish runs left and right and comes in as you win
- [x] Fresh fish: a catch more than two days old fetches half at the market

## Phase 1.32 — Water up close (graphics milestone G5)

- [x] Wakes (`src/world/wakes.js`, `src/systems/splashes.js`): your boat drops a disturbance every
      tenth of a second; the water shader turns each into a spreading ring and churned white water,
      and together they draw the V of a real wake with a foaming trail behind the stern
- [x] Bow spray off the hull at speed; a big splash when a car drives into the water and a bow wave
      as it ploughs on; a helicopter low over water flattens a ring and blows spray
- [x] Wading: you, people and animals walking through water leave rings
- [x] Bullets stop at the water's surface and splash there (not on the bottom), with a ring
- [x] Rain falling on lakes, rivers and the sea: rings everywhere
- [x] Fish rising: a quiet ring now and then on calm water near you (more at dawn and dusk); the
      bobber plops in, twitches on a bite and stirs the water while a fish fights
- [x] Sunlight through the thin top of a wave (and a wake's crests) when you look toward the sun
- [x] Caustics: a bright web of focused sunlight drifting over the bed of shallow water
- [x] The wet line: the bank just above the water is dark and shiny, and on the coast it creeps up
      and back with the swash

## Phase 1.31 — Police, batch two (feature batch F4)

- [x] The police helicopter (`src/systems/policeplus.js`): from three stars a Calvera PD Air Unit
      comes up and hangs over where they think you are; it can see you from the air out in the open
      (helping the cars find you), and after dark it lights you up with a searchlight that sweeps
      round where you were when it loses you. It goes home when the stars drop
- [x] Roadblocks: at three stars and up, driving, a roadblock goes up on the road ahead of you — two
      cruisers across it, officers behind them, and a stinger. Drive over the stinger and the tyres
      are shredded: slow, the car pulls and shimmies, until a garage repair
- [x] Bribes: at one star, with an officer about to cuff you, offer him money (F). Some take it and
      look the other way; some don't, and that's another star
- [x] The radio: you only hear the police radio when they're close, or anywhere if you've bought a
      police scanner

## Phase 1.30 — Street life, batch one (feature batch F3)

- [x] Pigeons (`src/systems/ambient.js`): little flocks pecking about on the downtown pavements; they
      burst up and away when you run at them, a car goes by close or a shot's fired, and settle again
      somewhere else half a minute later
- [x] Umbrellas: when it rains most people out walking put one up (and drop it when they run)
- [x] Joggers in the early morning and the evening
- [x] People stood about on their phones
- [x] Food carts on four downtown corners: a vendor, a cart with its awning, the Gulf Mart menu a
      little cheaper

## Phase 1.29 — Weapons, batch one (feature batch F2)

- [x] Guns wear (`src/systems/gunwork.js`): a little with every shot, cheap guns faster, more in the
      wet. A worn gun can jam — a dead click and "Jammed"; reload (R) clears it. Your guns' wear is saved
- [x] A gun-cleaning kit (hardware store, Hunting): stand still with a worn gun and press F; a few
      seconds crouched over it and it's like new
- [x] Takedowns: fists up or a blade out, come up behind someone who hasn't seen you and press F.
      Fists knock them out cold (they drop, lie there half a minute, come round and run); a blade is
      silent and final. Anyone who sees it calls it in
- [x] A suppressed shot is only heard close by: it scares and alerts people within ~10 m, not 45
- [x] Police cruisers drive the roads to you (shortest route over the street grid and highways)
      instead of steering straight at you through buildings, and a cruiser that isn't getting any
      closer backs up and tries again

## Phase 1.28 — Driving, batch one (feature batch F1)

- [x] Fuel (`src/systems/driving.js`): every car has a tank that drains with the throttle and speed
      (a full tank is ~25 minutes of hard driving); a gauge under the speedometer; run dry and the
      engine coughs and dies. Fill up at any Gulf Mart (pull in, F), or pour in the fuel can
- [x] Skid marks: brake hard, drift or pull the handbrake and the tyres leave black marks on the road
      that stay (the last 700 strips)
- [x] The horn: people in front of the car jump out of the way, and some tell you what they think
- [x] Stealing a parked car: you hot-wire it before it starts (quicker with a lockpick set); one in
      three has an alarm that whoops and flashes the lights, and someone calls it in
- [x] Speeding: a patrol car that clocks you well over the limit (35 in town, 55 on country roads,
      70 on the highway) lights up and pulls you over. Stop and you get a ticket ($50 + $5 a mph
      over); keep going and you're wanted

## Phase 1.27 — Paint, dirt and rain on the cars (graphics milestone G4)

- [x] Metallic paint has flake under the clear coat: tiny mirrors at random angles that sparkle in the
      sun up close, while the clear coat over them stays glass-smooth
- [x] Cars get dirty: road film and dust from the sills up and mud thrown up behind the wheels, the
      bonnet and roof only once it's really filthy; dust when it's dry, dark mud when it's wet. It
      builds as you drive (fast off-road, slowly on asphalt), rain rinses the road film off, and
      cars out in the world start with some of their own
- [x] Dusty glass, except the two arcs the wipers sweep on the windscreen
- [x] Rain stands in beads on the glass and the paint
- [x] A car wash at Calvera Customs ($15)

## Phase 1.26 — Loose ends from the list (side batch S4)

- [x] Police cruisers no longer drive through traffic, parked cars, each other or yours; a traffic car
      a cruiser hits stops where it is
- [x] Doors you can see: walk in and a real door swings open on its hinge into a dark doorway before
      you step through; run in and it bangs back off its stop; it swings shut behind you when you
      come out
- [x] Showrooms at the hunting post (every animal in the wildlife guide, and whose pelts you're
      selling) and the fish market (your catch on the counter)
- [x] Shops and bars with a clerk behind the counter inside (one of the residents who works there,
      by name, when their shift's on) — and they can be held up like any store; bartenders keep
      something under the bar more often. The police are told even if you've already left
- [x] People react in their own ways: most run, some drop and cover their heads, some freeze for a
      moment, some get their phone out and call it in (and the police hear about it), then run
- [x] Point a gun at someone and their hands go up, and stay up while the gun's on them; lower it and
      they bolt. Armed ones may draw on you instead

## Phase 1.25 — The people of Calvera, and police who have to find you (side batch S3)

- [x] About 3,000 residents (`src/systems/residents.js`), each with a name, an age, a home (houses
      hold a family, apartment blocks dozens), a job and its hours (office, store, warehouse, bar,
      or out on the road; some retired, some out of work), 3-8 friends (neighbours and workmates
      mostly) and a favourite bar
- [x] Everyone has a day: asleep, up, the commute, work, lunch out some days, home; evenings out at
      the bar or round at a friend's, a walk after dinner; weekends their own. Where each of them is
      at any moment follows from that, across the whole map, for almost nothing (~1 ms for all 3,000)
- [x] Near you, the ones whose day has them outdoors are real people on the street
      (`src/systems/population.js`): walking where they're actually going, block by block along the
      sidewalks, and in through their own front door; a crowd smoking outside a bar at night
- [x] Friends who run into each other stop and talk; walk up to anyone and say hello (F): a name, a
      job and a line about their day
- [x] Kill a resident and they're gone for good (saved). Twenty minutes later someone new moves into
      their home
- [x] Police have to find you: they track you only while they can see you (line of sight) or hear
      you (gunfire), otherwise they drive to where you were last seen and search round it, widening
      the search the longer you're gone; the stars cool off while they can't see you
- [x] A gun out in front of them gets an order first ("Drop the weapon!") and a few seconds to obey
- [x] In a gunfight one officer of each car takes cover behind it while the other works round your
      side; a beat before they fire when they find you again
- [x] Radio chatter: shots fired, officer hit, officer down, robbery in progress, lost visual, eyes on
      the suspect

## Phase 1.24 — Light through the leaves (graphics milestone G3)

- [x] With the sun behind a tree its leaves glow: the light comes through them, yellowed, brightest
      looking towards the sun; outer leaves glow and inner ones stay in their shade (the sun's shadow
      map decides which)
- [x] Canopies are darker inside: every leaf knows how deep in the crown and how low it sits
      (baked per vertex when the trees load), and gets that much less sky and bounce light
- [x] No two trees quite the same green, and clumps of leaves vary within a tree (greener,
      yellower, lighter, darker)
- [x] Far trees (impostors) glow against a low sun too
- [x] Off on Phone; the lighter mid-distance trees get all of it

## Phase 1.23 — Doors, hold-ups and showrooms (side batch S2)

- [x] No more "press F to open the door": walk into a door and you open it and go in
- [x] Run into a door and you shoulder it open; whoever's working inside tells you to chill out
      ("Whoa, whoa! Chill out, man!", "You break it, you buy it, buddy."), a homeowner less politely
- [x] A locked door rattles when you walk into it, and gives way after two to four running hits
      (homes, shops, warehouses get sturdier) — a break-in, same as kicking it; F still knocks
- [x] Rob a store (`src/systems/robbery.js`): hold a gun on the clerk at a Gulf Mart, a clothing store
      or a gun shop. Most put their hands up and empty the register into your hands; let the gun drop
      first and they hit the panic button. Some come up from under the counter with a shotgun and
      fight (a gun-shop owner nearly always; more often out in the country and late at night). Either
      way the police are told (two stars); the till is empty until tomorrow, and a dead clerk is
      replaced the next day
- [x] Every store is a showroom like the gun store: the list on the left, the thing itself turning
      on a stand on the right (drag to turn it), its details and the buy button under it
      (`src/ui/shop.js`, `src/ui/viewer.js`): cars at the dealers, your own car wearing the paint or
      part you're looking at in the custom shop, boats and aircraft, the real building as an
      architect's model at the realtor, and food at the Gulf Mart
- [x] 3D models for all 240 tools and the crafting supplies (`src/entities/toolmodels.js`): rods,
      lures, knives, pliers, power tools, ladders, kits, gadgets, garden tools, mowers...

## Phase 1.22 — People up close (graphics milestone G2)

- [x] Skin (`src/entities/bodyshade.js`): light goes into it and comes out a little way off, red
      furthest, so the line between light and shadow on a face is soft and warm, not a hard grey edge
- [x] With the sun behind someone, the outline of the face and the ear rims glow red
- [x] Skin's shine is two layers (a tight oily one over a broad soft one) instead of plastic
- [x] Pores and the skin's fine grain within arm's length, fading out once a pixel is too big to
      show them (no shimmer or sandpaper further off)
- [x] Hair: a strand highlight across it (two lobes, the second coloured by the hair), and light
      through its edges against the sun
- [x] Eyes: wet, and set back in the head instead of glowing with skylight
- [x] Clothes: cotton and wool catch the light at grazing angles (a soft sheen on folds and edges)
- [x] Works for every person, recoloured gang members and SWAT, and the player's outfits; off on Phone,
      pores off on Low
- [x] Fix: the hit info never reached the ragdoll (the wound system dropped it), so every death got the
      same small shove; now a car throws the body, a head shot snaps it back. Guns were also dropped
      twice on death

## Phase 1.21 — Bodies fall for real (side batch S1)

- [x] Ragdolls (`src/entities/ragdoll.js`): when someone dies, physics takes over from the animation.
      Fifteen joints with stiff bones and a braced torso fall under gravity onto the real ground,
      slide and settle; the skeleton follows, so the character's own body crumples. No two deaths
      look the same
- [x] The push goes in where they were struck: a head shot snaps the head back, a leg shot takes the
      legs out, a blast throws everyone outward, a car scoops the legs and throws the body
- [x] Hits someone survives: the part that was hit jerks away (head, shoulder, knee), and a body shot
      can double them over
- [x] Run people over: a car above ~30 km/h throws and kills; slower knocks them down and back; at a
      crawl it only pushes them aside. Parked and moving cars all count
- [x] Your car no longer drives through police cars; a hard hit shoves a parked car and slews it round
- [x] No more cash floating over the dead (`src/systems/loot.js`). Walk up and search the body: you
      crouch over it and take what's there. Officers drop their sidearm (SWAT their rifle) and may
      have a little cash; a civilian with a gun out drops it, and a hidden gun or knife is found on
      him; anyone else may have some cash, and very rarely a pistol. A dropped gun lies on the ground
      to be picked up
- [x] You go limp too when you're killed on foot, and get up again at the hospital

## Phase 1.20 — Cloud shadows (graphics milestone G1)

- [x] The clouds' shadows slide over the land, streets, roofs, trees, cars and people with the wind
      (`src/core/cloudshadow.js`): every lit surface follows the sun ray up through the cloud layer
      and reads the same cloud field the sky draws; sunlight dims, skylight stays
- [x] The sky's clouds are anchored to the world (they pass overhead as you travel), so the shadows
      are cast by the clouds you see; the cloud cube takes the viewer's position once per round of
      faces (no seams) and redraws at once after a teleport
- [x] Grass translucency and far tree impostors darken under a cloud too; weaker with a low sun or
      overcast; off on Phone

## Phase 1.19 — Lighter frames: KTX2 textures and levels of detail

- [x] Wheels in three levels (they were ~20k triangles each, most of a street's triangles); a fourth,
      coarsest car-body shell past 95 m
- [x] Terrain tiles in three levels (index buffers over the same vertices; the skirts hide the seams)
- [x] Near 3D trees in two levels (meshoptimizer trunk/branches, thinned and grown leaf cards)
- [x] People, the concept car, guns and heavy open-library models: simplified versions made at load
      (`src/core/lod.js`), swapped by size on screen
- [x] Parking meters, hydrants and street junk: only the nearby ones are drawn (`src/core/nearinst.js`)
- [x] KTX2 for the people, the concept car, the guns and the trees (`tools/southbound/pack-ktx2.mjs`):
      ~260 MB of texture memory down to ~65 MB; the Unity exporter decodes KTX2
- [x] Triangles a frame on High: forest 17.9M -> 8.6M, meadow 7.9M -> 4.2M, street 8.8M -> 5.5M,
      downtown 4.1M -> 3.2M

## Phase 1.18 — Light, wear and footing (all-out attention to detail)

- [x] Dynamic lighting (`src/core/gi.js`, Medium and up): the surroundings (ground, buildings,
      roads, water, sky, trees) are captured round the camera into a small cube, one face a frame,
      and filtered into the reflections and ambient light, so paint, glass and metal reflect the
      real street and the ambient takes the colour of where you are; recaptured on a timer and
      straight away when you've moved; the ground's colour bounces up; after dark the nearest
      street lamps are real lights, your car has a pair of headlights, gunfire lights the street
- [x] Micro-surface imperfection on every stock PBR material (`src/core/imperfect.js`): patchy
      roughness, hairline scratches in the highlights, dust on top faces, a faint orange-peel up
      close; far pixels cost one noise lookup
- [x] Substrate scanner (`src/core/substrate.js`): one table, one `scan()` for any hit, object,
      material or patch of ground (tags, then names, then the surface's own physics, then the
      terrain's layers); drives bullet penetration and holes, impact debris (sparks, splinters,
      shards, grit, dirt, splashes, chips in the thing's own paint), footsteps, grip and wear.
      Press N to see what it reads under the crosshair and underfoot
- [x] Material-agnostic abrasion (`src/core/abrasion.js`): each mesh's real edges found once (in a
      Web Worker), convex and concave, as exact distances; one shader wears each substrate its own
      way (painted metal chips to steel with rust in the joints, wood pales, paint rubs through to
      timber, plastic whitens, stone chips, glass frosts, fabric fades, leather polishes, rubber greys)
- [x] Footsteps synthesized from each substrate's sound (strike, ring, knock, crunch, softness, wet)
- [x] Contextual locomotion safety (`src/systems/footing.js`): stop at ledges and cliff edges
      unless sprinting or jumping (slide along them instead); slopes limited by grip (dry rock vs
      wet grass), slipping back off what's too steep, a careful pace down steep ground; slick
      surfaces take acceleration and sprint away; wading slows with depth; narrow footing up high
      is walked
- [x] Hardware check: `probeGPU()` asks WebGPU for the high-performance adapter and warns when the
      browser is on built-in graphics while a faster card idles; shown on the menu and in the FPS
      readout
- [x] `ARCHITECTURE.md`: WebGPU, GI, abrasion, KTX2/LOD streaming, workers + SharedArrayBuffer,
      with what's done, what's next, and code

## Phase 1.17 — Grass

- [x] The thin-blade carpet (flat green ribbons, ground showing between them) is gone
- [x] New grass (`src/world/grasscards.js`): blades painted at load time (~240 per card: thin,
      tapered, curving, varied muted greens, lighter midribs, darker edges, bleached tips, dry
      blades, the odd seed head) on clumps of three crossed, splayed cards; a tight near ring and
      a wider far ring; crisp edges at any distance; wind and parting round the player
- [x] Only in the wild parts: meadows (in big soft fields) and all over the dry plains; never on
      mown lawns, the city, pavement, sand, forest floor or steep rock
- [x] No ground between blades: the terrain under the grass is darkened to its shaded depths,
      and towards the edge the grass takes the scanned ground's colour, so there's no line
- [x] Straw-gold on the plains; Settings › "3D grass" turns it off (photo-scanned ground only)

## Phase 1.16 — Frame rate

- [x] Rocks: every boulder on the map (~2,800 scans at ~1,500 triangles) was drawn every frame and
      again into the shadow map; now only the ones near the camera are drawn, and the pebbles
      round the player are low-poly (22M -> 8.8M triangles a frame downtown on High)
- [x] The water mirror (a second render of the whole scene) ran almost everywhere: its "near
      water" test was true anywhere under 60 m altitude; now only within sight of the lake/Gulf
- [x] Cars past a few hundred metres aren't drawn; cabins (seats, dash) only up close
- [x] Performance guard (with adaptive resolution on): if the frame rate stays under 24, turn
      off reflections, then post effects, then shadows, then grass/resolution; next launch starts
      one preset lower
- [x] Software rendering (hardware acceleration off) is detected and explained on the menu and
      in game, with the steps to turn it on
- [x] Menu title no longer cut off on short or narrow windows

## Phase 1.15 — Visual error sweep (62 problems, ~1,000 broken spots, all fixed)

A placement audit (every building, tree, fence, prop, facade piece and shop measured against
the terrain, roads, water and each other) plus 60+ screenshots across the map, day and night,
rain and storm, interiors, first person and in cars. Highlights:
- [x] Buildings: no gap under the low corner (walls run into a concrete foundation), none on a
      road, inside another or buried to the eaves; shopfronts only on walls that face a street
- [x] ~700 rooftop units and water tanks were inside the upper blocks of set-back towers;
      awnings, porches and steps no longer poke into the next building
- [x] Trees: none on highways, in shops, through porches or on the walking line; street trees
      back in kerb-edge pits
- [x] Fences step down slopes in panels and never cross roads or buildings
- [x] Streets: double yellow, parking lanes with stalls, parked cars, meters and hydrants;
      parking-lot blocks with painted stalls; parks with lawns, paths and benches; mown yards
      round every building; Mill Creek gets sidewalks and lawns instead of solid paving
- [x] Port yard paved; asphalt runway with edge stripes; a real hangar (with collision)
- [x] Glass: shop windows no longer pale panels (interior light levels, canyon reflections,
      a distance fallback using the wall colour), no lit-looking blinds by day, warm/cool lit
      offices at night; intersections no longer blurry (instance transform missing)
- [x] Rain ripples only in puddles; wet reflections not broken up into blobs
- [x] Night: parked cars' lights off; decals, blood and runway paint no longer glow
- [x] Interiors: painted drywall, lights off by day, windows dark at night
- [x] Warehouses get loading doors, skylights and vents; shops get forecourts
- [x] Gang turf no longer "cleared" just by walking away

## Phase 1.14 — Port Calvera fades out on every side

- [x] Residential streets run out of the north and east edges of the city (between the
      shops on the edge strip) to an outer street; before, the poor edge of town only
      existed along the two west highways
- [x] Along them, walk-ups and corner stores first (terraced into the hill), then houses
      with porches and yards, then the poor end: tired houses, garages, sheds, trailers,
      junk and chain-link
- [x] Every older building, road and shop stays exactly where it was (checked), so saved
      homes don't move; up to 48 new homes are for sale as "Calvera outskirts"

## Phase 1.13 — Buildings in real 3D (`src/world/facades.js`)

- [x] Cornices, parapet walls with copings, plinths, string courses, stone quoins, metal
      corner trims and caps on towers
- [x] Shopfronts: piers between the bays, sign bands, granite stall risers, glazing bars,
      canvas awnings; shop interiors no longer blank white, glass reflects the street
- [x] Every window gets a sill and a head (stone on brick, painted casings and shutters on
      houses), placed on the shader's window grid, streamed in around the camera
- [x] Houses: front doors facing the street, porches with posts, rails, steps and a roof,
      corner boards, fascia, chimneys; gable roofs get ridge caps, eave and rake boards
- [x] Rooftops: AC units with fans and louvres, round wooden water tanks on legs
- [x] Fixed: a NaN in the shingle-roof shader on gable ends blacked out the whole screen
      (through bloom) when looking at houses in Mill Creek
- [x] The same pieces export to the Unity scene (`calvera-facades.json`)

## Phase 1.12 — Carryover to Unity 6 + HDRP (`southbound-unity/`)

- [x] Unity 6 HDRP project with a setup window (packages, HDRP wizard, materials, world, save)
- [x] Game rules ported to engine-free C#: arsenal (234 weapons, 195 attachments, matched
      number for number by a test), ballistics and penetration, armour and hit zones, needs,
      rebuild stages, the web save (read and written back)
- [x] Calvera exported from the web game: terrain, ground cover, water, roads, buildings,
      roofs, 47 345 trees and bushes; built into a scene in one click
- [x] 29 CC0 surfaces as HDRP Lit materials and terrain layers, plus a downloader for the
      2K/4K/8K originals (ambientCG, Poly Haven, cgbookcase)
- [x] John: controller, third-person camera, animation retargeting, gunplay with wall
      penetration and bullet holes; a penetration range by the spawn
- [x] Web game: Pause > Export save (imports into Unity)
- [ ] Vehicles, people and police AI, interiors, missions and jobs, HUD, HDRP water

## Phase 3 — Content catalogs (targets)

| Item | Target | Done |
|---|---|---|
| Assault rifles | 56 | 56 (variants of 4 platforms) |
| Shotguns | 13 | 13 (3 platforms) |
| Rocket launchers | 12 | 12 (2 platforms) |
| Bows | 19 | 19 (3 platforms) |
| Sniper rifles | 13 | 13 (2 platforms) |
| Marksman rifles | 45 | 45 (3 platforms) |
| Pistols | 63 | 63 (5 platforms) |
| Weapon attachments | 193+ | 195 (39 parts × 5 tiers) |
| Land vehicles | 93 | 93 (15 classes, derived from 15 body types) |
| Water vehicles | 16 | 16 |
| Air vehicles | 11 | 11 |
| Car upgrades (per car) | 63 | 63 (48 performance + 15 looks) |
| Boat upgrades | 98 | 98 (14 systems × 7 levels) |
| Plane upgrades | 17 | 17 |
| Buyable houses | 198 | 198 |
| Tools | 240 | 243 |
| Jobs | 27 | 27 |
| Story missions | 63 | 63 (first pass: objectives + short dialogue) |

## Phase 4 — Systems

- [~] Combat: shooting, aiming, 7 weapon classes done; cover and a vehicle damage model to do
- [~] Hunting: animals with AI and skinning done; tracking and trophies to do
- [x] Fishing: casting, fish species by water type, reel mini-game
- [x] Economy: money, shops, property ownership
- [x] Jobs system framework (27 jobs)
- [~] Mission scripting system + story (63 missions done; cutscenes, voice and hostile AI to do)
- [x] Garage / tuning UI
- [x] Save system

## Phase 5 — Ship

- [ ] Content rating: what's planned (blood/gore, strong language, drugs, tobacco)
      is a **17+ (App Store) / M (ESRB)** game, not "kid friendly". The content
      filters in Settings let players turn gore and language off.
- [ ] Wrap the web build for iOS/Android (Capacitor) and submit to the stores
- [ ] Apple developer account ($99/yr), store listing, privacy policy

---

## Known issues / next fixes

- Frame rates have only been measured in a software renderer (the cloud box has
  no GPU). Real phone and PC frame rates still need testing on actual devices.
- Cars can't be damaged yet. Collisions push and slow you down.
- Traffic has no traffic lights, so cars cross intersections without stopping
  for each other.
- Buildings are solid for now. The interior system is Phase 2.

## Session log

- **Desktop app and a new look:**
  - **Southbound for Windows** (`southbound-desktop/`). The game is now its own program instead of a browser tab:
    - An installer and a portable .exe, built on GitHub's Windows machines (Actions > southbound-desktop > Southbound-Windows).
    - Every build is started on Windows and has to load the whole world before it is uploaded.
    - It always uses the fast graphics card and never slows down in the background. F11 switches fullscreen.
  - **Cinematic preset** for RTX 4090/4080/5090/5080-class cards: supersampled, 8K shadow map, full-resolution ambient occlusion, 4.8 km draw distance, denser forests and traffic.
  - **Rooms behind every window.** Each window is drawn as a real room box behind the glass:
    - Walls, floor and ceiling in that room's colours, a doorway into the hall, a sofa or bed, a picture on the wall, ceiling lights at night.
    - Blinds pulled down to different heights, or curtains.
    - Shop windows look into stores with shelves of stock.
    - The glass reflects the sky, more strongly edge-on.
  - **New materials** (16 CC0 sets, most with height maps):
    - Two kinds of real brick with depth in the mortar, stucco shops, painted lap siding on houses.
    - Corrugated steel and rusting sheds, shingle roofs laid along the ridge.
    - Square concrete pavers for sidewalks, with stains and gum spots, and concrete curbs.
    - Roads: repair patches with sealed seams, polished tyre paths, oil down the middle of every lane.
    - A photographed cliff face for rock, leaf litter on forest floors, wood floors and tiled bathrooms inside homes.
  - Buildings are drawn in three shader groups (towers and offices, brick and shops, houses and warehouses), so each stays within the 16 textures a GPU allows per shader.

- **Inside cars, through walls, houses that burn:**
  - **Car interiors.**
    - Up close, every procedural car has see-through glass with privacy glass in the back, and the glass turns to a reflection when seen edge-on.
    - Inside is a cabin sized from the car's own measurements:
      - Dash with a binnacle and lit speedometer and tachometer whose needles move, centre stack with a radio, knobs and four slatted vents, and a glovebox.
      - Column and stalks, and a steering wheel that turns with the front wheels.
      - Console with the gear lever and cup holders, pedals.
      - Seats with bolsters and headrests, a rear bench where there's room, seatbelts.
      - Sun visors, dome light, rear-view mirror, door pulls, and a parcel shelf or cargo floor.
    - The inside of the shell is trimmed as headliner, door cards and carpet.
    - Sunlight falls through the windows.
    - Front doors are split out of the body and swing on their hinges.
    - You sit in the driver's seat, reclined to fit that car's roof and floor, with your hands IK'd to the rim as it turns.
    - Traffic shows clear glass when someone is at the wheel, tinted when nobody is.
    - The fourth camera (V) in a car is the driver's-eye cockpit view.
  - **Rico rides along.** He walks round to the passenger door, opens it and climbs in, and the truck waits for him. He rides with you, turning to you when he talks. At the drop-off he gets out, shuts the door and walks off down the sidewalk. The truck is left at the curb, and Wrench collects it.
  - **Rico's truck.** The '89 pickup is a full procedural truck with faded paint and rust climbing from the sills and arches.
  - **Walls.**
    - Rounds go through what they can: glass, drywall (studs are harder), hollow doors, framed outside walls, sheet metal.
    - With a rifle or armour-piercing ammo they also go through stucco, wood, brick veneer and block.
    - Masonry, stone, steel poles and trees stop everything.
    - Each wall costs the round energy and penetration, so whoever is behind it takes less.
    - Bullet holes are drawn per pixel for each material: drywall, wood, brick, concrete, metal and glass.
      - A drywall hole shows the torn paper, the gypsum core and the cavity behind it: the wood stud where one is (16 in on centre), or the back of the far panel, or pink insulation in outside walls.
      - Exit holes blow out wider, and a group of shots tears into one big hole you can see the framing through.
  - **Houses burn and come back.**
    - A rocket or a car going up next to a house sets it on fire. It chars to a shell and the flames come out of it.
    - The family gets out and watches from across the street, and someone calls it in.
    - An engine drives down the road with its siren, the crew runs hoses and knocks the fire down, then they pack up and leave.
    - The survivors load a van and move out.
    - A builder then puts the house back over about a game day and a half:
      - The site is fenced, with a dumpster, a portable toilet, a lumber stack and a permit sign.
      - Debris is cleared and the slab is poured.
      - Studs, plates and headers go up wall by wall, then the roof trusses.
      - OSB sheathing goes on, then decking and shingle courses from the eaves up, then siding from the bottom up.
    - Workers in hard hats and hi-vis hammer away in the daytime only.
    - Ruins and rebuilds are saved.
  - **Startup flicker fixed.** The black blinks at the start came from dynamic resolution resizing the canvas after each frame was drawn. It now resizes before drawing. The loading screen also stays up until the world has rendered once, then fades out.
  - **Mice** join the rats: smaller, quicker, and they freeze before they bolt.
  - **Guns look like their own guns.** Every catalogue gun leaves the factory with its own fittings, so guns that share a base model still look different:
    - Optics: red dot tube, holographic window, variable scope on rings, or a micro dot on a pistol slide. Iron sights when there's no glass.
    - Muzzle devices: birdcage hider, compensator, brake, suppressor can.
    - Under the handguard: vertical or angled grip, weapon light, folded bipod, hand stop.
    - Slings on long guns and shell carriers on shotguns.
    - Gunsmith attachments now show on the gun, replacing the factory part in that slot.
    - In first person you sight through the optic.
    - The muzzle flash comes from the end of the muzzle device. The bore line is found from each model's geometry.
  - **Chain-link fences** around lots are see-through galvanised wire mesh with a top rail and posts, not grey slabs.

- **Start with nothing:** a new game gives you $150, the clothes you're
  wearing and your fists. Rico no longer hands out a gun or a truck: he pays
  you $200 for the ride downtown, tells you to buy a 9mm (Walt sells the
  Standard 9mm, about $450 in the city, less in Mill Creek and the bayou) and
  will sell you his rusty pickup for $400 at the yard. Bandages, holsters and
  everything else are bought. The car parked by the spawn belongs to someone
  else: taking a parked car that isn't yours is theft if anyone sees it. The
  start menu has a New game button (Play becomes Continue when you have a
  save).

- **Armour, wounds and the street (after the detail pass):**
  - Armour stores (Gulf Coast Tactical downtown, Sabine Army Surplus in Mill
    Creek): NIJ-rated vests and plate carriers (IIIA soft armour to Level IV
    ceramic, with plate wear), helmets, bags that hide long guns (daypack to
    guitar case), holsters, and medical supplies, all shown on John in 3D.
  - Police stop you for a gun they can see in town; bystanders call 911.
    Sidearms hide under an untucked shirt or jacket with the right holster,
    long guns in a big enough bag. On arrest your weapons go to the evidence
    room at the Central Precinct (pay a release fee to get them back).
  - Damage depends on the round's penetration, the armour, and where it hit:
    plates and helmets stop what they're rated for, leg hits make people
    limp, arm hits make them drop their gun, the badly hurt go down; a downed
    officer's partner drags them out of the fire and an ambulance comes. You
    can bandage a downed stranger. Player wounds (leg, arm, bleeding) are
    treated with bandages, tourniquets, splints, IFAKs and trauma bags (H).
  - Eleven knives and hand weapons. Some pedestrians carry pistols or knives
    and fight back; muggers may carry knives; armed people drop their weapon
    when they fall.
  - Witnesses: unless a cop saw it, someone has to call 911. Reach them first
    and you can try to pay them off. Some refuse; some take it and call.
  - Every shop has its own building style, a door that opens as you walk up,
    an OPEN sign and real opening hours. Blue road signs point the way to
    every shop, and the phone's Places tab lists them all with GPS.
  - The Calvera Property Auction sells foreclosed houses and seized cars
    every day with live bidding.
  - Colour: AgX tone mapping and neutral grading (removed a yellow cast).

- **Real-world detail pass (John Cortes and the Gulf Line crew):**
  - Story opening: you play John Cortes. A cutscene introduces Rico's crew of
    14 (each with their own look, name, job and lines); Rico hands you a
    standard 9mm and a rusty pickup you can sell. The crew live at a scrapyard
    hideout and sell services: repairs, towing, hauling cars out of the water,
    patching you up, wiping bounties, and building scopes and suppressors from
    supplies you bring.
  - Guns: real CC-BY firearm models (Glock 17/19, Colt Python, 1851 Navy,
    M4A1, M24, Remington 870) with per-gun holds. Three gunsmiths with a
    shopkeeper dialog, a catalog (silhouettes, fire mode, calibre,
    descriptions), story unlocks, a three-of-a-kind limit, a spinning 3D
    preview, and customisation (attachments, skins, paint, your own colour,
    ammo type).
  - Combat: no fixed damage, only fixed penetration. Ammo types; scopes that
    actually zoom, with breathing sway and hold-breath; you can shoot drivers
    through the glass; cars burn and explode.
  - World: the city thins out into run-down lots and grass at its edges; two
    new hamlets; cluttered alleys; muggings, robberies, fights and
    breakdowns; three rival gangs with turf. Gunfire in town brings the
    police, but gunfire out in the country doesn't.
  - Small details: gun safety on/off (K), brass casings and muzzle smoke,
    hair and stubble that grow day by day, barbershops, cracked windows that
    a repairman fixes within a day, fire crews at wrecks, and fire alarms in
    every building (pull station, horn, strobe, smoke detector, a fire truck
    that responds, police if someone saw you).
  - Shops: clothing (three stores, 13,500 pieces across tops, jackets, pants,
    shoes, hats, eyewear, neckwear and gloves, worn on John via a shader, with
    a live 3D fitting room and a wardrobe), Gulf Mart corner stores (food to eat
    or carry; coffee steadies your aim), and crafting supplies at the hardware
    store.
  - Phone: the Runr app delivers guns (with their attachments), food and
    supplies by courier, tows your car back to the road (by boat if it's in
    the sea), and gives you a ride to the hideout. Everything costs money.
  - Billboards with local ads along the highways (lit at night). Map badges:
    J for jobs, S for shops. Cleaner interaction prompts.
  - Strictly real-world: no sci-fi weapons or props anywhere.

- **Graphics push (clouds, weather, cars, arsenal):** volumetric clouds, weather
  with wet roads, water reflections, procedural realistic cars replacing the
  Kenney kit, 221 weapons + 195 attachments with a store, installable web app.
  Not yet done: WebGPU renderer, interiors, missions, boats/planes, vehicle
  upgrades, real-device frame-rate measurements.

- **Session 1:** Phase 1 built. External asset sites are blocked by the cloud
  environment's network policy, so every texture, model and sound is made in code.
  Playtested in headless Chromium (software rendering): 12 location screenshots,
  a midway video and a final video. Fixes made during the playtest: overexposed
  sky lighting, window shimmer at a distance, the menu FPS dropdown clashing
  with the HUD, bayou ground colour, night sky colour, night lighting, and
  terrain poking through highways on climbs.
