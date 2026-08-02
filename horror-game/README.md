# THE BIRCH

A first-person horror game built with [Three.js](https://threejs.org/). No build
step, no bundler, no runtime network access.

## The facility

Fourteen connected rooms on one floor. You start in **Waiting**, behind sealed
tempered-glass doors. The corridors are long on purpose — 40m each way, and 45m
south — so you lose sight of both ends of them.

```
   WAREHOUSE ══ 40m WEST CORRIDOR ══ WAITING ══ 40m EAST CORRIDOR ══ JUNCTION ── STORAGE (locked)
    (key)            │                                   │                │
                 RESTROOMS                        CORPORATE OFFICE   45m SOUTH CORRIDOR
                                                                          │
                                                                     ASSEMBLY (barricaded)
                                                                          │
                                                                      AIRLOCK
                                                                          │
                                                              EXTERMINATION ── SUPPLY
                                                                           └── RESTROOM
```

### Waiting

A round reception **island** with a dropped **bulkhead** soffit hanging over it,
lit from recessed downlights in its underside. **Four screens are mounted to the
bulkhead's outer face, one per side — only one of them still works.** The counter
rings the island with a single gap at the back; you have to walk around and
through it to get inside. On the counter: a tipped coffee cup drying into the
newspapers, scattered paper, pens laid out separately, a half-cracked monitor
facing inward. Shelves of books against the back wall, and an old telephone —
the line is dead.

Seating is a **single row**, every chair facing the reception island — no
facing pairs. It stops well short of both corridor mouths and leaves a walkway
down the middle from the entrance, so nothing blocks the way to either hallway.

**The Wi-Fi puzzle.** Crawl under the rolling chair and look up: the password is
taped to the underside of the seat. Use the terminal, pick `WAITING ROOM WIFI`
out of the junk networks, enter the code, and the one surviving screen wakes up
and plays sixty seconds of basketball highlights before it shorts out.

### The rest

- **Corporate office** — vintage shelf of fossil casts and books, an old
  chandelier, chairs clawed to pieces. The door was thrown hard enough to bury
  itself halfway into a wall.
- **Warehouse** — racking, torn open. The storage key is here.
- **Storage unit** — locked until you find the key. Nick Ahoy's body, his
  journal, and a Glock 19 with two magazines: **34 rounds for the whole game.**
- **Assembly** — barricaded; you get through it on your belly. Workers on the
  floor with plating driven into them, and a holding cage whose bars are bent
  outward.
- **Extermination chamber** — dead scientists, broken glass, a clipboard, a
  splinter of pale birchwood, and a blueprint: eleven feet, tungsten frame,
  non-oxidising steel joints, birchwood body. Three attempts at naming it, all
  struck out.

Dressing throughout: an EXIT sign still lit over the sealed entrance, a wall
clock stopped where the power died, magazines on the waiting-room tables,
directional signage and conduit down the corridors, a tipped wet-floor cone,
papers spilled outside the office, a desk lamp and a phone off the hook inside
it, framed certificates, stall doors and toilets in the restrooms (one door
ajar, one torn off flat), pallets and a roof-leak puddle in the warehouse,
drag marks running the south corridor into Assembly — and on the storage unit
wall, twenty-three days of tally marks scratched into the paint. The count
stops.

### Doors

Every doorway carries a leaf built to its own spec, and all of them open:

| Doorway | Door |
| --- | --- |
| Waiting → both corridors | Simple panelled wood, lever handles |
| Restrooms | Dark wood, signage plate, louvre vent along the bottom rail |
| Warehouse | Steel double doors, push bars, wired-glass vision panels |
| Corporate office | **No leaf** — torn off its hinges; only bent hinges and splinters remain |
| East junction | Fire door, push bar, `FIRE DOOR / KEEP SHUT` plate |
| Storage unit | Plain panelled wood, locked — a brass deadbolt, nothing more |
| Assembly | Steel door standing open, planks nailed across the frame |
| Airlock (both ends) | Hazard-striped hatches with wheel handles and dogging bolts |
| Utility room | Utility steel, signage plate |
| Entrance | Tempered glass — sealed |

### Sound

**Every room has its own audio track** — fourteen beds, one per room, each a
distinct recipe of filtered noise and drones that crossfade as you cross a
doorway. On top of the beds, each area rolls its own random one-shots: dripping
taps in both restrooms, distant knocks in the corridors, racking groans in the
warehouse, long scrapes and deep booms in Assembly, gas hiss in the chamber, a
wood creak in the office.

**Footsteps follow the surface.** Carpet pads softly with a hint of fibre; tile
gives a hard heel-click, a faint ring, and the room slapping it back; corridor
concrete is a flat thud and scuff; the industrial floors crunch loose debris;
the lab's vinyl clicks tight and dry.

**Doors sound like what they're made of.** Wood doors are a latch, stick-slip
hinge squeaks and a shut thud; steel doors groan on resonance with a push-bar
clack and a ring off the leaf; the airlock hatches ratchet their wheel before a
heavy clunk.

### Mirrors

The restrooms have real mirrors: a planar reflector re-renders the scene from a
camera mirrored through the glass. They only render while you are close and on
the reflective side, since each one costs a whole extra pass. The glass carries
its own aged silvering — dirt toward the edges and speckled desilvering.

### The people

Everyone in the building is the same blocky rig (`humanoid.js`): square head,
slab torso, thin limbs, and a real pivot at every hip, knee, shoulder and elbow,
so one figure poses a walking escort, a corpse, and your own reflection. Only
the clothing changes:

| Outfit | Worn by |
| --- | --- |
| Blue intern tee, scuffed white pants | you |
| The same, filthier | Nick, in storage — he had your job |
| White lab coat and trousers | the scientists in extermination |
| Slate canvas coveralls | the assembly floor |
| Dark utility uniform | Trapnell, containment |
| Black suit and tie | the two who threw you in |

Clothing is a procedural scuffed-weave texture, generated once per colour and
shared by every figure wearing it. The dead get a second variant with blood
soaked in, heaviest where the cloth met the floor.

Poses (`stand`, `crouch`, `crawl`, `sprawl`, `faceup`, `slumped`, `crumpled`)
set joint angles and a body tilt, then the rig **measures** its own lowest
point and settles onto the floor — a tilt pivots a figure around its feet and
every limb angle changes the footprint, so written-in drop values go wrong the
moment a pose is edited. Bodies are placed by `centerOn(x, z)` for the same
reason: a standing figure occupies its own coordinates, a sprawled one reaches
more than a metre past them.

**Your own body** exists and is rigged to your stance and stride. It lives on
render layer 1, which your eyes do not draw — otherwise you would be looking at
the inside of your own head — while mirrors and the security feeds do. Point a
planted camera back down a corridor you are standing in and you will watch
yourself on it.

## Controls

| Input | Action |
| --- | --- |
| `W` `A` `S` `D` | Move |
| Mouse | Look (pointer lock), or drag to look |
| `E` | Use / read / take |
| `C` or `Ctrl` | Crouch |
| `Z` | Crawl — needed for the Wi-Fi note and the barricade |
| `Shift` | Run immediately |
| `R` | Reload |
| `←` `→` / `Q` | Turn, when pointer lock is unavailable |
| `G` | Flashlight on/off |
| `Esc` | Pause, or close a document |

**Sprinting is automatic.** Hold a steady line forward for two seconds and
Brian breaks into a run on his own — there is no key to hold down, which is the
only way it can work on a touchscreen. Strafing, backing up, crouching,
stopping, or walking into a wall drops you straight back to a walk, and you
cannot run at all on an empty stomach. `Shift` still starts a run instantly if
you would rather not wait. The view opens up a few degrees while you are
running, and the stance readout says so.

On touch (phones, tablets) the full loop is playable by finger: stick to
move, drag to look, tap the world (or the **Use** button) to interact, tap a
hotbar slot to select it, and the big action button does whatever is in
hand — **Fire**, **Place**, **Drink**, **Eat**, **Chug**. **Reload** appears
when a gun is selected; **Items** opens the inventory; the armor slot on the
hotbar opens it too. Pointer lock is never requested on coarse-pointer
devices — it would swallow every tap.

## Playing it online

**https://dax-code-bro.github.io/Untitled-new-game-project/**

Every push to the game's branch redeploys the site automatically via the
`gh-pages` workflow — installed copies pick the update up on their next
launch. If the URL 404s on first visit, enable Pages once: repository
Settings → Pages → Source: *Deploy from a branch* → `gh-pages` → Save.

**On iPhone/iPad:** open the URL in Safari → Share → **Add to Home Screen**.
It installs like an app: fullscreen, its own icon, playable offline.

## Installing it

The game is a PWA. Served over HTTPS (or localhost), it registers a service
worker that caches the whole single-file build — installable to a home screen
or desktop, fullscreen, landscape, and fully playable offline. `file://` and
embedded hosts skip the worker gracefully.

## Running it

**Simplest:** open `standalone.html` — a single self-contained file that runs
from `file://` with no server.

**For development,** `index.html` loads the vendored module build, which needs a
server because of ES module semantics:

```bash
cd horror-game
python3 -m http.server 8000
```

## Layout

```
horror-game/
├── index.html            # markup, styles, UI wiring — the source of truth
├── textures.js           # every surface, drawn to a canvas at load
├── fittings.js           # doors and the planar-reflector mirrors
├── level.js              # floorplan, geometry, props, per-room lighting
├── game.js               # renderer, player, collision, interaction, audio
├── build-standalone.mjs  # inlines Three.js + the scripts into the builds
├── standalone.html       # single-file playable build
├── vendor/three/         # Three.js r160, vendored (no CDN at runtime)
└── dist/artifact.html    # body-fragment build output
```

Walls are generated from room rectangles with doorway gaps punched out, so the
floorplan is edited as data in `level.js` rather than as placed meshes. Wall
planes are merged across rooms before they are built — building per-room would
put two coincident faces wherever rooms share a plane, which z-fights.

```bash
node build-standalone.mjs
```

## Notes

- **Every texture is procedural** — concrete with formwork lines and hairline
  cracks, wood with grain bands and knots, brushed and rusted metal, tile with
  grimed grout, carpet with contract-flooring fleck. Nothing is fetched.
- **Mirror reflections need oblique near-plane clipping.** The mirrored camera
  sits behind the wall the glass hangs on, so without skewing the near plane
  onto the mirror surface it renders the back of that wall and the reflection
  is a dark slab. The render target also needs an explicit sRGB colour space,
  or the reflection is written linear and shown as though it were sRGB.
- **All audio is synthesised at runtime** — per-room tone beds, footsteps that
  change with the surface, and stingers. No audio files.
- **Lighting is culled to the nearest six fixtures.** Forward rendering
  evaluates every light in every fragment shader, and the corridors alone carry
  dozens. The count of *visible* lights is held constant, because a changing
  count makes Three.js recompile every shader mid-play. Fixtures flicker in four
  styles — `steady`, `buzz`, `dying`, `strobe` — assigned down the corridor runs.
- **The highlight reel is a stylised silhouette animation**, drawn to a canvas
  each frame. It is not real broadcast footage.
- **Deliberately single-theme.** A horror game that repaints itself for light
  mode defeats its own subject.
- `window.__horror.getState()` and friends expose real state for testing — the
  scene animates every frame, so pixel diffing proves nothing.

### The Birch

Designed by the author. A store mannequin, eleven feet tall and far too thin,
hand-carved from pale birch — every ball joint visible, tungsten bolts through
the ones that mattered. Its hands are flat paddles, made flat **so it could
never hurt anyone.** It turned them into spears. Gears wind up when it starts
to move, and tick under every wooden footfall.

It hides in the vents. The SECURITY crate sits in the corner of the waiting
room; taking the five cameras changes nothing. Placing all five changes
nothing. The game begins the moment you open the camera view on the terminal —
the speakers die mid-chorus, and one of your own feeds already has it in
frame, looking at the lens.

**The loop.** It haunts three spots, 5 to 25 minutes at a time: the storage
unit, where it smears Nick's blood over its face and body (the stains are
permanent); the broken holding cage, where it stands in a frozen pirouette;
and the warehouse, one flat hand raised in a hello. **While you are looking
at it, it cannot move.** The moment you look away, it does. When it leaves a
spot it either relocates or comes for Waiting — and your only warning is the
cameras.

**Cameras.** Five in the corner crate, more in loot. Place with `F` or from
the hotbar — **on open floor you plant a three-foot tripod** (three legs
meeting a pan-head hub, unfolding out of your hands with a settle-bounce as
you set it down; its feed watches from knee height), **aimed at a wall within
arm's reach you bolt on a standard wall unit** (plate, arm, hinge, head — the
arm swings down into position). Walk up to any placed camera and collect it
back into the bag to re-site it — destroyed housings are beyond repair. Watch
them all
watch them from the reception terminal. Worst case: you flip to a feed and it
is already there, hand raised, a smiley drawn on its face in blood — it found
your camera, and that feed is about to die.

**Hard seal.** The terminal drops earthquake-rated tungsten shutters over
Waiting's corridor doorways — **one at a time**, so you must seal the side it
is coming from. Sealed out, it bangs on the metal. Do not open it. Sometimes
the banging stops and something worse starts.

**It cannot see you and it cannot smell you.** The face is a drawing. What
it has is the chip that never stopped thinking and a body that reads the room
off the shifts coming back at it — echolocation. So it finds you by **noise,
from any direction**. Turning your back on it means nothing. Standing still
means everything: stood still you are silent and it cannot find you at all,
crawling carries about two metres, crouch-walking five, walking eleven,
sprinting nineteen. A gunshot indoors is heard by the entire building.

**How it moves.** Standing upright it is 3.4m and the corridors are 3.4m, so
it **folds its back to get down them** and unfolds again in a room with
height. At its leisure it walks — hunched, arms hanging, taking the place
apart room by room, and at night it is out there doing exactly that. Once it
has heard you it **jogs**: hunched further, arms thrown out and arched, the
backs of its hands sweeping the walls, because that is how it knows where the
walls are. A jog is pitched just under your sprint — **run the moment you
hear it and you stay ahead; hesitate and you do not.**

**Rage.** Put a bullet in it and it does not come for you. It reels, it
**runs**, and it is gone for the rest of that night. It comes back the
**next** night with a smiley drawn on it like a child with a sharpie, and
that night it hunts you **on the ceiling** — flat to it, limbs splayed, head
turning all the way round underneath. It stops caring whether you watch, it
matches your sprint, and every light dies where it walks. You are not
outrunning that. You are getting a door down.

**The shock.** If it lurks in the cage it once escaped, the terminal can
electrify the floor: 100 frozen seconds to plant cameras, seal a door, or run.

**The kill.** Three of them, and it picks. **Impaled** — the flat hand goes
in and you stand there looking down at it, shaking, while it fills the
bottom of your vision; then it is not your eyes any more, and you watch from
outside as the second hand goes in, it lifts you over its head, and takes
you apart at the waist. **Slammed** — off your feet and driven into the
floor, and again, and again, and the fifth one you do not come back up from.
**Butchered** — a headbutt that puts the lights out, your legs swept from
under you, and then it kneels into the work with both hands.

With riot gear the impale can shatter its arm instead — break both and all it
has left is a desperate headbutt. Headbutt into a riot shield and its own head
comes off. In the body: a keycard. Tear it out, open the entrance, and walk
into the orange letters: **MISSION PASSED — RESPECT ++++**, with your $2,000.

### The building

**Music.** Until the Birch wakes, the whole facility plays classic mediocre
pop — a four-chord loop rendered offline and piped through store speakers.
When you bring the cameras back to the desk, the tape sags to a stop, and
every room's eerie bed and disturbing one-shots take over.

**Vents.** Four crawl runs through the walls: Waiting↔Restrooms,
Waiting↔Office, the two long corridors, Warehouse↔West corridor. Wrench a
grate off (once — it stays off) and crawl through. But every vent you open is
a route the Birch can use too: with grates off, it moves between its haunts
through the ducts, instantly, with nothing but a scramble in the walls as
warning.

**Hotbar and inventory.** Minecraft-style: five hotbar slots (keys `1–5`), an
armor slot, twenty inventory spaces (`Tab`). Click uses whatever is selected —
weapons fire, consumables consume, cameras place. **Riot gear only protects
you once it is equipped in the armor slot.** First pickups bind themselves to
free slots.

**The guns are guns now.** Visible arms with hands actually on the weapons.
The Glock 19 has a reciprocating slide and an animated magazine reload. The
semi-automatic 12-gauge feeds from a six-shell tube, reloads shell by shell,
and throws an eight-pellet spread. The rifle is a Remington 700 — walnut
stock, iron sights, and a bolt the right hand visibly cycles between shots,
which IS the rate of fire. Every shot ejects real brass that bounces on the
floor, sends a tracer you can watch fly, and puffs dust where it lands.
Rounds stop at walls.

**Doors are not shelter.** Anything that isn't hard-sealed tungsten, the
Birch bashes straight through — the leaf is destroyed permanently, with a
splintering crash you'll hear from rooms away.

**The cameras are vintage.** Black-and-white feeds with lifted blacks, a
blinking red dot beside REC, two bars of battery, full signal — and when a
camera dies, static and CONNECTION LOST. Each head pans and tilts from the
terminal (buttons or arrow keys). If the movement register reads POSITIVE on
the feed you're watching, you get the SHOCK button — and here is the trade:
it takes the current, it screams, and it comes for the hallway at a dead run.
Hit HARD SEAL immediately.

### Survival

Ten bars of hunger, ten of thirst, twenty of energy. Water restores five
thirst, beans three hunger. At zero thirst you hallucinate — text scrambles
into numbers, the corridor won't hold still, and you can collapse for fifty
helpless seconds. At zero hunger you lose the sprint and eventually die. Energy
refills one bar per three seconds of standing still — or slam a GAMER ENERGY
to overcharge to 25: green bars, wider eyes, faster legs, and your character
starts saying unhinged things to the furniture. Ten in a row risks a fatal
cardiac event. Overeat or overdrink and you will need the toilet; both
restrooms finally justify their existence.

**The flashlight** sits on the reception counter, next to the key. Taking it
switches it on. The beam is a spotlight parented to the camera, so it always
points where you look, and it **stays lit while you hold a gun** — a torch you
have to holster to shoot is a torch nobody uses. Toggle it with `G`, or from
its hotbar slot (which is how touch players reach it). No battery meter: it was
asked for as a light, not as another bar to manage.

**Pickups are taken once.** A one-shot pickup is hidden *and* pulled out of
the interactable list, because Three.js's raycaster does not care whether a
mesh is visible — hiding alone left the Glock targetable, and every re-press
handed out another full thirty-four rounds. Containers like the camera crate
stay in the world on purpose and tell you they are empty.

**Nothing is sunk inside anything.** `propOverlaps()` walks every interactable
against every mesh in the level and reports any pair that both overlaps by
volume and bites at least 15mm deep on all three axes — the depth test is what
separates a cup standing on a newspaper from a key buried in a countertop. It
found the counter clutter sitting *inside* the counter slab (the surface is at
1.12, everything had been placed at 1.09), every wall sign mounted behind its
own wall face, the Glock modelled as two boxes intersecting each other with the
grip through the floor, a radio inside its case, and crates sunk a fifth of a
metre into shelf boards.

**The storage key** is on the same counter, on a paper tag. It used to be face
down on a crate in the unlit warehouse, which is a fine place to hide a key and
a bad place to find one.

**Some of it is scattered, and it moves.** Beyond the fixed warehouse shelf,
five to seven bottles and cans are strewn around the facility, in different
places every run — on the waiting-room tables, the office desk, the assembly
line's belt, a restroom sink, a corridor floor, the pallets, the bunks down in
the Camper Barracks. The pool of spots is hand-placed rather than generated,
because the point is that they only ever turn up where a person would
plausibly have set down a drink. Nothing is ever left in the extermination
chamber, the airlock, the containment wing or the shaft — nobody was eating in
those rooms — and nothing in the storage unit or the utility room either.

**The food is finite.** A braced shelf against the warehouse's west wall holds
six bottles of water and six cans of beans, each one modelled — a ribbed steel
can with a paper label and rolled rims, a moulded bottle with a neck, cap and
label band — and each taken individually, once. The shelf empties as you strip
it. A few already-drained cans lie on their sides beside it. Everything else
has to come out of the loot crates, which is the whole pressure: Nick had this
same shelf, and it ran out.

### Warehouse loot

The warehouse is stocked the way a dying company stocks shelves: crooked
stacks with gaps, crates scattered and tipped in the aisles, some on the
racking, three already half-open with the water and beans visible inside.
About twenty are openable, every roll independent: cameras ×5 (30%), 9mm
(10%), a shotgun or assault rifle (2%), water (50%), beans (60%), GAMER
ENERGY (25%), riot gear (9%) — and the suite statistically verifies those
numbers against 20,000 simulated rolls.

## Not built yet## Not built yet

The rest of the layout, when the author describes it. The riot-shield keycard
is currently the only way out.
