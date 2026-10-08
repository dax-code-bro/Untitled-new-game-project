# Episode 1 style frames - PROVISIONAL

Stage A of `../PRODUCTION_PLAN.md` (look approval). Five native 4K (3840x2160) stills that test
whether the pipeline can pass as live-action photography. **Every dragon, character and building
design in them is provisional** (nothing is approved yet); each image carries a PROVISIONAL slate.

Round 3 (2026-10-08) rebuilt all five with the models of every domain: the creatures library
(`scenes/lib/creatures`), the humans library's cast builds (`scenes/lib/humans`: Remi, Abby, the
keeper, Alexandria, the watchman, musicians, vendor, parent and child, 18 festival villagers,
riders), and the architecture kit (`scenes/lib/architecture`: the Verdor stable, keepers' lodge and
access rig, the birthing chamber, the Cling square).

| file | scene / shots | what it shows |
|---|---|---|
| `F1_prologue-dawn_PROVISIONAL_preview.jpg` | Prologue, P-03 / P-06 | cold pale dawn, the sun hidden in a bank of sea cloud, the island's high ground in cloud, a small period trading ship crossing the foreground; something vast passes in the mist (only its shadow) |
| `F2_verdor-riding-grounds_PROVISIONAL_preview.jpg` | 1B-02 / 1B-04 | Charcoal lying in the launch area (screen right) side-lit so the black scales show texture and highlights, his access rig behind his shoulder with the gangway on his back, Remi (muted blue) reaching for the mounting strap; Leaf sitting upright with Abby at his chest in front of the stable (screen left); the keeper at the far-left field edge |
| `F3_flight-off-verdor_PROVISIONAL_preview.jpg` | 1C-11 / 1D | the flight line: camera on the inland side, travel screen left to right (their right sides), Charcoal drawn level with Leaf, his shadow on the shallows |
| `F4_birthing-chamber_PROVISIONAL_preview.jpg` | 1A-12 / 1A-17 | the wet gold hatchling (no glow) on the nest linen, Alexandria's hands at screen right with a folded linen cloth, lamplight in front and the cool daylight shaft from the high window behind |
| `F5_cling-square_PROVISIONAL_preview.jpg` | 3B-02 .. 3B-08 | the Cling map from above the king's steps: stone arch left, gate right, fountain with its pillar at the centre, the vendor stall with bread and fruit left of centre, musicians right of centre, children, the crowd; the watchman at the edge of the square pointing at Starlight, immense over the north roofs |

Files: `*_PROVISIONAL_preview.jpg` (1920 wide) are kept in git. The 4K PNGs and render logs go to
`output/lookdev/style-frames/` (git-ignored); recreate them with

```
cd dragons-kingdom
bash episodes/s01e01/style-frames/make.sh            # all five (or: make.sh F2 F5)
```

The scenes are `scenes/lookdev/style-f1-prologue.js` ... `style-f5-cling-square.js`; the camera,
lens, light and grade of each are described in the file header. The set-building library they use
(`scenes/lib/sets/`) has its own contact sheet, `scenes/lookdev/style-contact.js`.
