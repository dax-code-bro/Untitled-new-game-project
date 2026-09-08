# Survivor

A survival game on one island, where the mechanics are computed from
published physics and physiology rather than tuned as game numbers.

The claim this project makes is that its systems match reality. A claim like
that has to be falsifiable, so `survivor/test/sim.test.js` checks 227
assertions against data from outside the project — manufacturer ballistics
tables, sports-medicine hydration figures, forensic decomposition metrics,
the AWG ampacity tables, published gelatin penetration results. Where a
source gives a range, the range is the assertion. Where sources disagree,
the comment says so.

```bash
npm run build        # engine + survivor bundles
npm test             # 87 engine + 227 simulation assertions, headless
npm run serve        # then open http://localhost:8080/survivor/
```

---

## How the mechanics compare to real life

| System | What it is |
|---|---|
| **Metabolism** | Pandolf load-carriage equation with the Santee downhill correction. A 20 kg pack up a 15% grade costs 942 W, and the load term is quadratic, so the last few kilos hurt far more than the first. Resting rate from Mifflin-St Jeor. |
| **Water** | Sweat driven by core temperature, capped by the air's real evaporative capacity from vapour-pressure difference. Sweat produced beyond that capacity runs off you and cools nothing — which is why humid heat kills where dry heat of the same temperature does not. Death by dehydration in 1-2 days working in heat, 5-6 resting in the cool; the "three days" rule of thumb is bracketed rather than hard-coded. |
| **Heat** | Two-node balance with clothing insulation in clo, a logarithmic wind profile (the wind at head height in a wood is a fifth of the reported wind), and vasoconstriction. 10 °C water reaches moderate hypothermia in 74 minutes; 10 °C air takes hours. Shivering runs on fat indefinitely and on glycogen for the hard end, so it fails when the food does. |
| **Food** | Glycogen, then fat, then lean mass — with the lean share rising as fat runs out, which is the mechanism that actually kills the starving. Death at day 60 with water available, at BMI 13. |
| **Sleep** | Borbély two-process model. Sleep pressure rises with an 18.2 h time constant and clears with a 4.2 h one, so eight hours repays sixteen. Alertness has a real circadian trough at 04:00. |
| **Ballistics** | RK4 point-mass integration with the G1 and G7 standard drag functions and banded coefficients where the maker publishes them. Velocities land within 3% of manufacturer tables to 300 yards; free recoil within the published spread from a .45 to a .50 BMG. |
| **Penetration** | Poncelet, plus the two things that turn out to be the whole story — see below. |
| **Disease** | Eighteen real pathogens with their real vectors, incubation windows and symptom sets. |
| **Injury** | Anatomical. A femoral bleed reaches class IV shock in about ninety seconds and is capped by cardiac output; bones break on delivered energy against published thresholds. |
| **Ecology** | Twenty species with published masses, home ranges, group sizes and activity patterns. |
| **Terrain** | Droplet hydraulic erosion and thermal erosion, with priority-flood pit filling so drainage is connected. |
| **Weather** | Pressure systems that move through, with real solar declination and hour angle driving light and temperature. |
| **Electricity** | AWG resistance and ampacity, thermal-magnetic breakers, and the published shock-current thresholds. |

### The one that matters most: penetration

A wall is not a surface with a flag on it. It is a stack — paper, gypsum,
cavity, stud, gypsum, paper — and a round arrives at each layer with whatever
velocity the last one left it. Two additions to the classical Poncelet model
make it agree with published results:

**Yaw.** A rifle bullet turns broadside inside fifteen centimetres of tissue
and a pistol bullet never does. That is why a 9mm and a .308 reach comparable
depth in ordnance gelatin despite a sevenfold difference in energy — a result
no single drag law can reproduce.

**Erosion.** A bullet is destroyed by a target harder than itself, and the
pressure that can be brought to bear is limited by what the target can
withstand. That is why an M855 steel core outpenetrates a .308 in steel plate
on half the energy, and why a lead-cored 9mm barely marks it.

Together they make wall-banging behave: a 9mm through an interior partition
arrives at about a quarter of its effect on the far side, a .308 arrives at
full effect, and the shot that hits a stud instead of the cavity is the one
that does not make it through.

| Cartridge | Model | Published |
|---|---|---|
| 9mm 115gr FMJ in gelatin | 61 cm | 60-76 cm |
| .45 ACP 230gr FMJ | 67 cm | 60-70 cm |
| .308 168gr in gelatin | 54 cm | 45-78 cm |
| 9mm through ½" drywall | 9 sheets | 8-12 |
| 5.56 M855 into mild steel | 13 mm | ~9.5 mm |
| .308 into pine | 420 mm | 400+ mm |
| .308 at 300 yd | 2082 fps | 2107 fps |
| .308 recoil, 8 lb rifle | 15.3 ft-lbf | 15-18 |

---

## The island

Four kilometres a side, generated from a seed and then eroded. The design
document says the island is 100 m across; a gated community of 26 houses
needs about 300 m on its own, a downtown with towers needs 600, and a cattle
prairie needs 500, so 100 m would be one house's garden. **`worldSizeM` is a
single number** — change it and everything downstream scales.

Fifteen places, sited by searching the terrain for ground that suits them
rather than by coordinate. The design's five are all here. The other ten
exist because the simulation needed somewhere for its consequences to land: a
clinic with the drugs the disease table wants, a waterworks worth restarting,
an airstrip holding aviation fuel the estate's helicopter cannot come and
collect.

Nothing regenerates. The terrain comes back from its seed; everything the
players changed comes back from the save, which is a kilobyte for a world
where nothing has happened yet.

## Diagnosis, not diagnosis

The game never announces that you have giardiasis. It announces greasy stools,
bloating and sulphurous belching starting nine days after you drank from that
creek. The player gets symptoms and a differential; the wrong drug does
nothing and is gone. Rabies can only be treated before symptoms and never
after. Brucellosis needs two drugs at once. Protein poisoning is cured by fat,
and eating nothing but rabbit is what causes it — from the nutrition table,
not from a rule.

Every vector hangs off something the player actually does: drinking from a
stream, skinning a rabbit bare-handed, eating undercooked bear, being bitten
by a coyote, sweeping out a house full of mouse droppings, spending days in
wet boots.

## Lives

Singleplayer has unlimited lives, an optional creative mode and an optional
keep-inventory. Multiplayer has one. When a character dies on a server that
account rejoins as a spectator — it can watch, and that is all. The body stays
where it fell with everything on it, for as long as the world lasts.

A knockout is not a coin flip: the duration is read off the energy of the
blow, from three game-minutes for a graze to a full game-day at the point the
skull is about to fail.

---

## Layout

```
survivor/src/
  00-units.js        SI everywhere, converted only at the edges
  10-physiology.js   the body as coupled reservoirs
  12-disease.js      eighteen pathogens, symptoms and treatments
  14-injury.js       wounds, fractures, bleeding, unconsciousness
  20-ballistics.js   cartridges, drag functions, trajectories, recoil
  22-penetration.js  Poncelet with yaw and erosion; material and wall stacks
  30-species.js      animals, with the numbers that make them real
  32-ecology.js      500 animals, feeding zones, predation, decomposition
  34-fish.js         200 fish, structure, thermal stratification, playing one
  40-worldclock.js   40-minute day with real solar geometry; weather fronts
  42-terrain.js      island generation, erosion, biomes, rivers
  50-structures.js   floor plans, layered walls, wiring
  52-poi.js          siting and building the fifteen places
  60-electrical.js   circuits, breakers, generators, shocks
  70-firearms.js     parts that wear, attachments, stoppages, handloading
  80-world.js        assembly, players, life rules, persistence
```

The sources are plain scripts concatenated into one IIFE, the same as the
engine, so the whole game is two `<script>` tags with no bundler and no
import map.

---

## Honest limits

Worth knowing before you hit them.

- **The terrain is one mesh at about eight metres a cell.** It holds the
  shape of the island and every slope you can walk, and it is visibly coarse
  close up. A clipmap or quadtree LOD is the next real piece of work.
- **Buildings are generated but not yet rendered.** Twelve thousand rooms and
  forty thousand walls exist as data with full layer stacks, and the
  ballistics model shoots through them correctly; putting geometry on them is
  the next milestone.
- **Four sculpted quadruped archetypes** in the engine cover twenty species,
  scaled to their real shoulder heights. A wolf is currently drawn on a felid
  body. More species need sculpting, not code.
- **Animals do not yet respond to being shot in the playable build** — the
  wound, tracking and blood-trail systems are built and tested, but not wired
  to the trigger.
- **Water is a slab, not a fluid.** The engine's particle solver is a bathtub;
  the sea here is the edge of the world.
- **Weather is not rendered.** Rain, snow and fog exist in the simulation and
  drive the physiology; only the fog and the light reach the screen.
- **Multiplayer is modelled, not networked.** The one-life rule, spectating,
  corpses and knockouts are implemented and tested against a single process.
- **Frame rates measured in CI mean nothing.** There is no GPU here, so the
  browser test runs on a software rasteriser at about one frame a second.
  What it proves is that every shader compiles and every draw succeeds.
