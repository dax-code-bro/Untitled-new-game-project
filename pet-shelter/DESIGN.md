# Pet Shelter Game — Master Design Notes

> **Working title:** Untitled Pet Shelter Game (the owner will name it later).
> This folder (`pet-shelter/`) is a **standalone project**. It does not use or change
> any other project in this repository (`legend.html`, `engine/`, `web/`, `desktop/`,
> `game/`, etc.). Keep it that way.

This file is the "don't forget anything" record. Every requirement the owner has
given goes here, in their words where possible, with the current implementation
status. Update it each time new direction comes in.

---

## 1. Technical foundation (owner's requirements)

| Requirement | Notes | Status |
|---|---|---|
| **Written in C++** | C++17, CMake, builds on Windows / Linux / macOS | ✅ Base done |
| **HDR rendering** | Every frame renders into a 16-bit float (RGBA16F) buffer. Then: auto-exposure (eye adaptation), bloom, ACES filmic tonemapping, gamma correction. Real light units: the sun is much brighter than the indoor lights, and the eye adjusts when you walk inside or out. | ✅ Base done |
| **Custom GLSL on everything** | Owner said "custom GSSL locking on every model, every animation, absolutely everything". Read as **custom GLSL shaders/lighting on every model and animation** (⚠️ confirm with the owner). Nothing uses fixed-function or stock shaders: world, terrain, sky, character, doors, gate, cars, fence, shadows, bloom, tonemap and CCTV feeds all run through our own `.glsl` files in `shaders/`. Animated objects (doors, gate, cars, the character's skeleton) go through the same lit shader, so they get the same lighting and shadows. | ✅ Base done |
| Title | Decided later by the owner | ⏳ |

### Engine features in the base
- OpenGL 3.3 core, own function loader (no GLAD needed), GLFW window, Dear ImGui for menus and the computer screens.
- Physically based lighting (GGX): sun, sky ambient, up to 16 indoor point lights, emissive materials.
- Two-cascade sun shadow maps with PCF filtering.
- Logarithmic depth buffer, so the whole map can be drawn from 5 cm away out to 90 km without flickering.
- Analytic sky with a sun disk, day/night cycle, stars and distance fog.
- Material patterns generated in the shader: asphalt and road lines, grass/rock/dirt terrain, wood, tile, carpet, chain-link fence, a glowing monitor.
- Keyframe/tween animation system that drives all animation: doors, gate, cutscene camera, character skeleton (idle and walk cycles), highway traffic.
- Security camera feeds rendered live to a texture (render-to-texture with a CCTV shader).

---

## 2. Game start flow

1. **Main menu**: New Game / Continue / Quit.
2. **New Game → Character customization first.**
   - Pick **gender: male or female**. Both have **lots of customization options**.
   - Current options: name, gender, preset, height, build/weight, muscle, shoulder width,
     hip width, skin tone, face (jaw width, face length, nose size), eye color, hair style (8),
     hair color, facial hair (4, available for any gender), top style and color, pants color,
     shoe color, accessory (none/glasses/cap). The 3D preview updates live, plays an idle
     animation and can be rotated.
3. **Opening cutscene: plays every time a new game starts.** Aerial shot of the land, then the
   highway gate opens, your car drives down the road and parks, your character gets out and walks to the
   front door, and the camera moves into your eyes to hand over to POV mode. Space or Enter skips it.
4. Gameplay starts in **POV mode** outside the front door.

---

## 3. Game modes

### Creative mode
Like *Jurassic World Evolution* and *Planet Zoo*: a free building camera where you build everything.
- Orbit/pan/zoom camera (WASD/arrows pan, right mouse rotates, wheel zooms, Q/E rotate).
- Build palette with costs. Items have a ghost preview (green = valid, red = invalid), grid snap,
  R to rotate, and a delete tool.
- You can **only build inside the barrier** (see §4).
- Time controls: pause / 1× / 5× / 20×.
- Current placeables: kennel block, dog run, cat house, path, tree, bench, lamp post,
  security camera, staff building, parking lot. More will come with animals.

### POV mode
- **Locked into first person** as your character. You walk around the facility.
- WASD to move, mouse to look, Shift to sprint, E to interact (doors, gate, computer).
- Collision with walls, furniture, doors, fences and the barrier.
- Tab switches between Creative and POV.

---

## 4. The world

- **Buildable/walkable area: 500 square miles**, about 22.36 mi × 22.36 mi (36.0 km × 36.0 km).
  The owner noted this is roughly 9× the size of RDR2's map.
- **A barrier confines the player** to that space, and building is only allowed inside it.
- **Beyond the barrier the background is fully built** too (terrain, hills and mountains,
  forest, the highway with traffic, sky) even though you can't walk there.
- **The area is fully fenced off.** A chain-link fence runs the whole perimeter.
- **Starting facility:** a small single-story building with a **road leading out to the highway**.
  The road is blocked from the highway by a **gate that only you have permission to open**.
  - The gate can be opened by the player (E at the gate) or from the office computer.
  - Security settings: automatic mode (opens for visitors during opening hours), lock.

### Starting building layout (walk-in order)
- **Waiting room** (front door enters here).
  - **Left door** → a **narrow, small hallway**:
    - a **bathroom**
    - on the **left side wall: your office**, with **your computer, a desk and a chair**.
  - **Right door** → another hallway:
    - **another bathroom**
    - **a medical room**: **shelves filled with medical supplies** and an
      **operating table ("operating chair") for the animals**
    - **an appointment room**

---

## 5. The office computer

Interact with the computer in your office (E). It opens full screen. Tabs:

1. **Animals**: look at all of your animals. *(Framework and empty list for now. Animals come next.)*
2. **Security**: place and view **security cameras** (live feeds), control the **automatic gate**,
   **locks** (gate and building doors), and gate access/permissions.
3. **Finances**, "the most important thing", your **financial rating**:
   - **Taxes**: payroll tax, income tax (quarterly), property tax, sales tax on adoptions.
   - **Income**: adoption fees (with animals), donations, grants, visitor revenue.
   - **Payroll**: pay your staff (hire/fire, wages, weekly payday).
   - **Budget allocation**: choose where your money goes (animal care, medical,
     wages/bonuses, marketing, maintenance, security, savings).
   - Ledger and balance history graph.
4. **Ratings**:
   - **Private rating**: how the people around you (staff, neighbors, community)
     *privately* think of you. Driven by how well you pay staff, paying on time, animal welfare, and taxes paid.
     It affects staff morale and quitting, and the quality of people who apply.
   - **Public rating**: **"really matters."** With a bad public rating, nobody buys or adopts
     animals from you. With a good one, everyone comes to you, you're packed with people and
     **you'll need to expand fast**. It drives visitor count, adoption demand and donations.

---

## 6. Economy model (base numbers, tunable in `src/game/Economy.cpp`)
- Start: $150,000 cash plus a one-time $25,000 small-business grant.
- Game clock: 1 real second = 1 game minute at 1× (a day is 24 real minutes).
- Daily: visitors = f(public rating, open hours, gate state, capacity). Donations per visitor.
  Utilities and supplies costs.
- Weekly (Friday): payroll. **Employer payroll tax 7.65%**, plus 0.6% federal unemployment (FUTA).
- Quarterly: **income tax 21%** of positive quarterly profit. **Property tax** 1.1%/yr of property value, paid quarterly.
- Budget allocation: percentages of the monthly discretionary budget. Each category feeds the ratings.
- Financial rating: a letter grade (A+ to F) from cash runway, profit trend, debt and taxes paid on time.

---

## 7. Status log
- **Base foundation built.** Engine, HDR pipeline, world, starting facility, character creator, opening
  cutscene, POV and Creative modes, office computer (Animals/Security/Finances/Ratings), economy and
  taxes, staff/payroll, private and public ratings, security cameras, gate and locks, save/load.
- Verified with 59 headless sim tests (now incl. species counts, surgery, incidents, staff, interviews) and a 24-shot screenshot suite (`--screenshots`). Samples are in `docs/screenshots/`.
- The character, furniture and buildings are **procedural placeholder geometry** (built in code from
  boxes, cylinders and ellipsoids). They already use the final shader and lighting pipeline, so real modeled
  and rigged assets can replace them later without renderer changes.

- **Playable in the browser** (WebAssembly/WebGL 2) at the published link, on computers and on
  phones/tablets held sideways. Phone mode has touch controls, larger UI, a name box that uses the phone keyboard,
  and lighter graphics (1024 shadow maps, shorter tree distance).

## 8. Animals (owner's direction, update 2)

### 8.1 Classes and counts
Every animal is a **real-life species**. There are five classes:

| Class | Species | What it means |
|---|---|---|
| **Small** | 20 | Small pets (dachshund, rabbits, hamsters, small cats and birds...) |
| **Medium** | 40 | Most dogs and cats, goats, pigs, parrots, reptiles... |
| **Large** | 20 | Giant dogs, horses, donkeys, cattle, llamas... |
| **Feral** | 40 | Wild or feral animals brought in for checkups (deer, wild pig, raccoon...). **Requires an upgraded (much bigger) medical room** and the **staff protective gear** unlock. |
| **Restricted** | 19 | Dangerous animals (panther, tiger, grizzly bear...). The player must **calmly control the situation and call the police**. |

The full species list lives in `src/game/Species.cpp`.

### 8.2 Models and animation
- Full 3-D models for every species, "hyper developed". The owner wants every model play-tested so that
  **nothing looks even slightly wrong**.
- **Dozens of colors and variations** per species (named coat colors and patterns, white markings,
  eye colors, size and weight variation), plus **male and female** (e.g. antlers, manes and tusks only on males,
  size differences) and **babies**.
- **"Every animal has a different animation for every little thing."** Walk, trot, run, hop, sit, lie,
  sleep, eat, drink, sniff, groom, scratch, shake, yawn, stretch, play, vocalize, growl, attack/fight,
  flinch, limp, cower, anesthetized, recovering, plus species signatures (rabbit binky, cat knead,
  bird preen/peck/fly, snake coil/strike/tongue-flick, turtle withdraw, bear stand-up, horse rear...).

### 8.3 Mature content (owner-approved direction)
- **Blood and gore** during operations (watching or doing one yourself).
- **Animal fights**. Baby animals can get hurt.
- **Anesthesia** for operations.
- **Protests can turn deadly fast.**
- **Tobacco, alcohol and drug references.** Visitors smoking, drinking or using drugs on the property must be
  kicked out by you or security guards.

### 8.4 Private rating: new rules
- **Staff need rest.** Not letting staff rest lowers the private rating. **Underpaying and overworking** workers is
  a ticket to a significant drop.
- **Interview staff every once in a while** and ask how they're doing. Schedule days off and vacations.
- **Staff life events**: a family member dies, their house burns down, heavy stress, injury... The player should
  rest them or give them time off. A quick way to raise the private rating: **give them money when they're
  going through a tough time**, **pay for a vacation**, or **pay a medical bill** if they get hurt.
- **Low private rating**: employees start **quitting**, **sabotaging** (they may **poison animals**) and
  **spreading rumors** (hurts the public rating).
- **Decent or high**: staff work normally. **Super high**: staff **greet you by name** and talk to you about their
  personal lives.

### 8.5 Public rating: new rules
- It drops if you're **mean, disrespectful or uncaring toward clients**, if you **put animals through surgery or
  procedures without telling the owner**, or if **an animal dies**.
- **Protesters** can show up. Declining their interview, or failing the online interview, significantly
  lowers the public rating.

## 8.6 Animals: what's built (update 2 status)
- **Species:** 139 real species exactly as asked: 20 small, 40 medium, 20 large, 40 feral, 19 restricted
  (`src/game/Species.cpp`). Each has its scientific name, a real fact, diet, lifespan, temperament, fee, care cost,
  measured proportions and its real coat colors. Domestic breeds carry breed-standard colors (the dachshund alone
  has 15; cats up to 23; horses up to 17), and every individual also varies by sex, age, size, weight, random
  white markings and color jitter. Babies are generated with big heads, short snouts and floppy ears; fawns get spots.
- **Models:** each animal is one continuous skinned mesh generated from its measurements, with the following:
  - Anatomy: a torso with chest, loin and haunches; legs with paws, hooves and claws; skull and muzzle.
  - Head details: a jaw, tongue, eyes on the skull with round, slit or goat pupils, and 11 ear types.
  - Extras: 8 horn and antler types, manes, tusks, beards, combs, wattles and snoods.
  - Special body plans: birds with folded wings, lizards and crocodiles, turtles and tortoises with domed scute
    shells, snakes, a knuckle-walking chimp with a bare face, and rabbits in the sitting "loaf" posture.
  - Coat shader: 23 real patterns plus fur shells and blood wounds.
- **Animation:** 47 behaviors blended over walk/trot/gallop/hop/waddle/slither/knuckle gaits
  (`src/game/AnimalAnimator.cpp`). Each species only uses the behaviors it really does: rabbits thump and binky,
  cats knead and pounce, horses rear and kick, cobras hood up, turtles hide in the shell, chimps chest-beat.
  Sedated (on the operating table) and dead poses are included.
- **Play-testing:** `PetShelter --animals DIR [--only "Name,Name"|Class] [--poses]` photographs every species
  (male, female and baby from the side and the front) and, with `--poses`, every behavior. All 139 were reviewed
  and the obvious problems fixed: bodies were tubes, cats looked like weasels, rabbits looked like hairballs, horse
  necks were planks, eyes were buried, there was a "grin" seam and birds had shield wings.
  **Still honestly rough:** the models are procedural and stylized, not hand-sculpted. Small terriers still read
  a bit horse-like, fur shells can look fuzzy up close, and snakes lie straight unless coiled. More passes are needed
  to reach "nothing even slightly looks wrong".
- **Housing (Creative mode):**
  - Existing: Kennel Block (dogs) and Cat House.
  - New: Small Animal House (rabbits, rodents, ferrets, birds, reptiles), Barn & Paddock (horses, donkeys, cattle,
    camelids, pigs, goats, sheep, poultry), Feral Holding and Secure Enclosure (dangerous animals until transfer).
  - New: the **Surgery Wing**, which is the bigger medical room, required for feral and large animals.
  - The starting medical room holds 4 crates.
- **Protective gear** is a $4,500 unlock. Without it, staff get bitten handling feral animals (life event plus ER bill).
- **Animals in the world:** every animal is an actor in its housing (kennel runs, paddock, pens, medical room),
  choosing behaviors from health, mood, stress and time of day (sleeping at night, eating at 8 AM and 5 PM,
  limping when injured).
- **Sim:** intake (strays, surrenders, litters with babies), feeding and cleaning by caretakers, illness,
  injuries, bleeding, fights in shared housing (babies can be torn open and killed), adoptions, deaths, owned client
  pets, feral intake from animal control, release to the wild, and sanctuary transfers.
- **Surgery:** the operating table in the medical room runs these steps in order:
  1. Owner consent.
  2. Anesthesia dose in mg/kg. Too light and the animal wakes screaming; too much and it stops breathing.
  3. Incision.
  4. Clamp the bleeders.
  5. Repair.
  6. Suture.

  Live heart rate, SpO2, depth and blood loss are shown, with blood on the animal. Operating on an owned pet without
  consent is found out 75% of the time and becomes a scandal.
- **Restricted animals:** a tiger, bear or other restricted animal can turn up loose by the parking lot. The right
  move is to stay calm, get everyone inside and call 911 (the [P] key or the button). Police dart it; it goes to your
  Secure Enclosure or is taken away. Panic or trying to catch it gets people mauled or killed, with huge rating hits
  and protests.
- **Staff wellbeing:** fatigue, stress, trust, days off per week, vacations, one-on-ones, gifts and paying medical
  bills.
  - Life events: family death, house fire, injury, illness, burnout, new baby and wedding, each with supportive
    down to cold choices.
  - High private rating: staff greet you by name in the morning and share their family and hobbies.
  - Low private rating: rumors, quitting and sabotage (antifreeze in a water bowl; cameras can catch who did it).
- **Public events:**
  - Client visits: warm, silent, curt or refuse.
  - Consent.
  - Deaths.
  - Smoking, drinking and drugs on the property: ask, kick out, call police or ignore.
  - Protests that grow, calm down, or turn deadly.
  - Online interview: 3 questions. Declining or failing it is a big public hit.
- Decisions pop up as cards ([Q] in POV; urgent ones stop time) and are also in the computer's **Inbox** tab. The
  **Animals** tab has a live rotating 3D record with every behavior; the **Staff** tab covers wellbeing.

## 8.7 Update 3: owner's direction (land, build mode, care, clinic, recruiting, driving)
Recorded as said, with my interpretation where it was ambiguous (marked *interpretation*):

**Nature everywhere.** Trees and natural things all around, including outside the border.

**Land and the fence.**
- You start with a fenced *workspace* (keeps animals in and wild animals out), with the gate where cars come in.
- The way you reach the full 500 sq mi: from the office computer's **Store** you buy land **one square mile at
  a time**, and the fence **moves dynamically** around everything you own.
- Buying land also lets you **push back the road**, until you eventually own all 500 sq mi.
- *Interpretation (built):* land is a 1-mile grid. Your first purchase is the square mile around the shelter, then
  any square next to land you already own. The public highway stays where it is. The road and the fence move out
  with your land; the gate stays where the access road meets the highway. **Question for you:** should the highway
  itself move back as you buy land to the south?

**Behind the shelter.** Five small storage/cargo-container animal shelters, each with its own small fenced yard.

**Build mode categories.** (You said you'll explain each one later; they exist now as categories.)
- Pathways; Research; Roofs, walls and windows; Trees (plant them); Fences and gates.
- Client: little buildings for your clients.
- Operations: expand the main building and decorate it (plants and so on), upgrade the clinic room, add things for
  the animals and the container shelters.

**Daily animal care.**
- A **manual check-up on every animal every day**: you walk up and check on it yourself.
- Make sure each animal has **food and water of its choice** and has shelter.

**Clinic check-ups.**
- You can bring an animal to the clinic for a check-up, and each animal type has its **own procedure**.
- Dogs are taken away for a **scan**, and the results come back as a **sonogram (ultrasound)**. You must identify
  what's wrong, e.g. the dog ate something it wasn't supposed to.

**Operations.**
- Realistic blood and gore.
- You have to worry about **hitting organs, arteries, veins and bones**.

**Recruit (office computer).**
- The bigger your facility, the more workers you can have, but **each one needs their own office**, and all of them
  need to feel good.
- **40 different people** to hire, with different genders, bios, names and looks.
- Someone already on your team (same name, same model) is **not available** to recruit.
- *Interpretation:* once you lose them (they quit or are fired) they come back to the recruit pool after a while;
  if they died they never come back.
- **Staff screen:** transparent squares showing each person's face. Click one to **fire** them, and to see their
  **bio**, their **experience at past workplaces** and any **bad history**.

**Driving.**
- You spawn with the **red truck** from the cutscene. You open its door, get in, and drive onto the highway.
- You must obey the **speed limit**, **traffic lights** and **turn signals**: every little thing.
- **Signs** point to where things are and show where you are. (You said I can choose where to put things.)
- You drive to a **pet store** that sells **snakes, birds, cats and dogs**.

## 8.8 Driving and the pet store: what's built (update 3)
Where I put things (you said I could choose):
- **HWY 89** runs east-west past your gate. Traffic drives on the right: eastbound in the two lanes on the far
  (south) side, westbound on your side. Limit **55 mph**.
- The **pet store, "Paws & Claws Pet Supply"**, is **2 miles east** on **Crossroads Rd**, a side road going south at
  the only **traffic light**. It's open 7 AM to 9 PM, and restocks every morning with 3 dogs, 2 cats, 2 birds and
  2 snakes (real species, each with a name, sex, coat and price). It also sells food at retail prices.
- **Cedar Flats** (the town) is 12 miles west. It's signposted but not built yet.
- **Signs:** speed limits every mile each way; green **mile markers** ("HWY 89 MILE 12" is your gate); guide signs
  "ANIMAL SHELTER NEXT LEFT/RIGHT" and "PET STORE, CROSSROADS RD, NEXT RIGHT/LEFT"; a direction sign at your gate
  ("<- EAST Pet Store 2 mi / WEST -> Cedar Flats 12 mi"); a blue "YOUR SHELTER" sign; 25 mph signs on your drive
  and the side road; the store's pylon sign. The words on each sign are readable as you drive up.
- The GPS map in the corner shows where you are, your fence, the highway, the shelter and the store, with miles to each.

How it plays:
- Walk up to the red truck (the same one from the cutscene) and look at the handle: **E opens the door**. Look into
  the cab and press **E to get in** (the door pulls shut behind you). You can also close the door from outside.
- **Controls:** W gas, S brake (hold to reverse), A/D steer, Space handbrake, **Q/E left/right turn signal** (it
  cancels itself when you straighten out after a turn, like a real truck), L headlights, V driver's seat or
  behind-the-truck camera, mouse to look around the cab, C to look ahead again, **F to get out** (stop first).
  On phones: the joystick is the pedals and the wheel, with buttons for signals, brake, lights, view and get out.
- The truck has a working steering wheel view, see-through windows, an opening door, steering and rolling
  wheels, brake/tail lights, blinking signals, headlights and reverse lights.
- The **gate remote** on the visor opens your gate as you drive up to it.
- **Traffic:** 40 cars follow the car ahead, keep their distance, stop for red and yellow lights, and slow down
  behind you.
- **Rules of the road** (the police pull you over and fine you; your public rating drops a little):
  - Speeding more than 5 mph over the limit for 3 seconds: $150 + $10 per mph over. You get a warning first.
    Your own land has a posted 15 mph limit, but police don't patrol your private drive (warning only).
  - Running a red light at any of the 3 stop lines: $300.
  - Changing lanes without signaling: $120.
  - Turning onto or off the highway without signaling the matching direction: $120.
  - Driving on the wrong side of the highway: $400 (after a "WRONG WAY" warning).
  - Hitting another car: $800 reckless driving + $1,200 body work.
- **Buying animals:** at the store counter you pay and the animal rides home in a carrier in the truck bed. Drive
  home and get out on your land: they're unloaded and join the shelter (housed like any new arrival).

## 8.9 Update 4: owner's direction — make it a PWA
"Let's turn this into a PWA." The browser version becomes an installable app: add it to your home screen / dock,
it opens full screen like a normal app, works offline after the first load, and your saves are kept on the device.

What's built:
- `build-web/pwa/` is assembled by the web build (`web/pwa/assemble.cmake`): the game page with app meta tags, a
  web app manifest (name "Untitled Pet Shelter", short name "Pet Shelter", full screen, landscape, dark green theme),
  paw-print icons (normal, maskable for Android, Apple touch icon, favicon) and a service worker.
- Service worker: saves the game files on the first visit so it runs offline. The page itself is fetched fresh when
  online (so updates arrive), game files are served from the saved copy for that release, fonts are refreshed in
  the background. Each release (`PS_BUILD`) gets its own cache and old ones are deleted.
- Saves now survive closing the browser or app (IndexedDB). Autosave every 5 minutes of play and whenever the app
  goes to the background.
- Checked in Chromium: the manifest has no errors, it's installable, the service worker controls the page, the game
  starts with the network switched off, and a saved game is still there after a reload.
- **How the owner uses it:** "What I normally do is I just get the latest link, save it as a web app or to my home
  screen, and then you just make changes to that specific version so I don't have to download a new link every time."
  So: one permanent link, saved to the home screen, and every update goes to that same link. The play link
  https://claude.ai/artifact/LMioUChoeVEsUUuLZD2R1h already works this way (each release replaces it in place).
- **Owner's pick for hosting: githack** ("Why not just use Githack"). The home-screen link is
  https://raw.githack.com/dax-code-bro/Untitled-new-game-project/claude/pet-shelter-base-ygolsg/pet-shelter/app/index.html
  It serves `pet-shelter/app/` straight from this public repo, so every push updates the same link. (The claude.ai
  link couldn't be saved as an app, pet-shelter.vercel.app belongs to someone else, and the Vercel connection isn't
  allowed to create projects.) Because githack doesn't open bare folder addresses, the app starts at index.html.
- Hosting: a PWA needs its own HTTPS web address. The claude.ai play link can't be installed as an app (it runs
  inside claude.ai), so the installable version needs a host such as GitHub Pages or Vercel.

## 8.10 Update 5: owner's direction — the fence hugs the shelter
"I want the fence to just be covering the perimeter of your shelter, but as you expand it, the fence dynamically
gives you more room."

What's built:
- The fence now surrounds only the shelter's **yard**: the building, the parking lot and the five container
  shelters, with about 10 m to walk around them. The **front gate** (sliding gate, keypad, camera, sign) sits where
  the access road leaves the yard, about 50 m south of the building; the road runs on through open land to HWY 89.
- **It grows by itself:** build something outside the fence (anything except trees, paths, lamp posts and cameras) on
  land you own and the fence moves out to take it in, gate and all. Remove it and the fence moves back in.
- The fence is solid now (you, your truck and the animals can only get in and out through the gate). Outside it
  you can still walk and drive anywhere on land you own.
- Buying land (computer Store) gives you more room to build; your **property line** is marked by orange-topped
  survey stakes, and both the yard fence and the property line show on the driving map.
- The truck's gate remote opens the gate when you're within about 45 m. The gate slides open in 4.5 s (was 7 s).

## 9. Next up
- More model passes until nothing looks off (small terriers, fur close-ups, coiled snakes).
- Staff and protesters as visible people in the world; clients in the waiting room.
- Animals walking on leashes with the player, hands-on feeding and cleaning in POV.

## 9b. Open questions for the owner (animals)
- Are adoptions the main income from animals, or will you also sell animals (the owner mentioned "buy animals")?
- Do feral animals get released back to the wild after treatment? (Built as: yes, it's offered once they recover.)

## 9c. Open questions for the owner (general)
- Game title.
- Is walking beyond the property gate onto the highway ever allowed, or only for vehicles?
- Do staff need to be visible NPCs walking around in POV mode? (Planned; data model exists.)
- (Answered in update 3: yes, you drive the red truck.)
- Should the shelter be a for-profit business or a nonprofit (no income tax, but different rules)?
- Did "GSSL locking" mean GLSL *lighting*/shaders (what's built), or something else?

---

## 10. Code map
```
pet-shelter/
  CMakeLists.txt        fetches GLFW + Dear ImGui automatically
  DESIGN.md             this file
  shaders/              every GLSL shader (common, lit, shadow, sky, terrain, bloom, tonemap, cctv, ...)
  src/core/             math, GL loader, input, timing, save files
  src/render/           shader loader, meshes, HDR renderer, shadow maps, bloom, cameras
  src/world/            terrain (500 sq mi), facility building, fence/barrier, gate, highway, trees, collision
  src/game/             character creator, economy, ratings, staff, security, cutscene, modes, computer UI
  src/main.cpp          app entry and state machine
  tests/                headless tests for economy, ratings and collision (no GPU needed)
  docs/screenshots/     renders from the screenshot suite
  README.md             build instructions + controls
```
