# Episode 1 style frames - PROVISIONAL

Stage A of `../PRODUCTION_PLAN.md` (look approval). Five native 4K (3840x2160) stills that test
whether the pipeline can pass as live-action photography. **Every dragon, character and building
design in them is provisional** (nothing is approved yet); each image carries a PROVISIONAL slate.

Round 3 (2026-10-08) rebuilt all five with the models of every domain: the creatures library
(`scenes/lib/creatures`), the humans library's cast builds (`scenes/lib/humans`: Remi, Abby, the
keeper, Alexandria, the watchman, musicians, vendor, parent and child, 18 festival villagers,
riders), and the architecture kit (`scenes/lib/architecture`: the Verdor stable, keepers' lodge and
access rig, the birthing chamber, the Cling square).

Round 4 (2026-10-15) re-rendered the four frames with dragons (F2-F5) with Daxtyn's new dragons
(`DRAGONS.md`, 2026-10-14): every dragon has exactly **two legs** (the wings are the front limbs, as
in bats and pterosaurs) and its own **horns**, each body designed as a real animal
(`scenes/lib/creatures/DESIGN.md`). Each frame was re-staged for the new anatomy (see the table).
F1 shows no dragon (only a shadow in the mist) and was not re-rendered.

| file | scene / shots | what it shows |
|---|---|---|
| `F1_prologue-dawn_PROVISIONAL_preview.jpg` | Prologue, P-03 / P-06 | cold pale dawn, the sun hidden in a bank of sea cloud, the island's high ground in cloud, a small period trading ship crossing the foreground; something vast passes in the mist (only its shadow) |
| `F2_verdor-riding-grounds_PROVISIONAL_preview.jpg` | 1B-02 / 1B-04 | Charcoal resting in the launch area (screen right) in the sphinx lie his design gives him (belly down, both hind legs folded under, the folded wings along his flanks with the forearms on the grass), his head resting on its chin so the mouth line, the nostril and the blue eye read; his access rig behind his shoulder with the gangway lowered onto his back beside the riding rig, Remi (muted blue) at the gangway's foot on Charcoal's back taking the mounting strap from the rig's grab bar; Leaf sitting back on his haunches like a dog (two legs, wings folded) in front of the stable with Abby at his chest fastening the breast strap (screen left); the keeper at the far-left field edge |
| `F3_flight-off-verdor_PROVISIONAL_preview.jpg` | 1C-11 / 1D | the flight line from a camera ship on the inland side (55 mm, ~120 m up), travel screen left to right (their right sides): Charcoal drawn level and coasting on his spread grey, black-striped wings (no wingbeat to smear across the shutter), Leaf nearer and a little behind in a quick mid-downstroke, Remi and Abby in their saddles, Charcoal's shadow on the shallows lower right |
| `F4_birthing-chamber_PROVISIONAL_preview.jpg` | 1A-12 / 1A-17 | the wet gold newborn (no glow; horn buds, its wings folded on its back, two legs splayed) pushing weakly up with its chest on a folded linen cloth that Alexandria's hands (from the right, her face out of frame) hold under it; seen in three-quarter profile so the snout, mouth line and eye read; the opened shell behind, the lamp key low at frame left and the cool window light on the far wall |
| `F5_cling-square_PROVISIONAL_preview.jpg` | 3B-02 .. 3B-08 | the Cling map from above the king's steps: stone arch left, gate right, fountain with its pillar at the centre, the vendor stall with bread and fruit left of centre, musicians right of centre, children, the crowd; the watchman at the edge of the square pointing at Starlight gliding in head-on against the cloud (two legs drawn up, her crown of horns), ~195 m away and still wider on screen than the whole north row |

Files: `*_PROVISIONAL_preview.jpg` (1920 wide) are kept in git. The 4K PNGs and render logs go to
`output/lookdev/style-frames/` (git-ignored); recreate them with

```
cd dragons-kingdom
bash episodes/s01e01/style-frames/make.sh            # all five (or: make.sh F2 F5)
```

The scenes are `scenes/lookdev/style-f1-prologue.js` ... `style-f5-cling-square.js`; the camera,
lens, light and grade of each are described in the file header. Render times per 4K frame (round 4,
this machine): F2 434.7 s, F3 131.0 s, F4 428.7 s, F5 821.5 s of rendering (541, 235, 524 and 923 s
with the scene build); see `scenes/lib/sets/PROGRESS.md`. The set-building library they use
(`scenes/lib/sets/`) has its own contact sheet, `scenes/lookdev/style-contact.js`.
