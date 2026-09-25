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
- Verified with 34 headless sim tests and a 24-shot screenshot suite (`--screenshots`). Samples are in `docs/screenshots/`.
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

## 9. Next up
- Build out the animal systems above in stages (species data, then models and animation, then sim and events).

## 9b. Open questions for the owner (animals)
- Are adoptions the main income from animals, or will you also sell animals (the owner mentioned "buy animals")?
- Do feral animals get released back to the wild after treatment?

## 9c. Open questions for the owner (general)
- Game title.
- Is walking beyond the property gate onto the highway ever allowed, or only for vehicles?
- Do staff need to be visible NPCs walking around in POV mode? (Planned; data model exists.)
- Can the character leave POV mode in a vehicle (drive the car)?
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
