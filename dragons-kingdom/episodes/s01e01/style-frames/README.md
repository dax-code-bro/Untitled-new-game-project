# Episode 1 style frames - PROVISIONAL

Stage A of `../PRODUCTION_PLAN.md` (look approval). Five native 4K
(3840x2160) stills that test whether the pipeline can pass as live-action
photography. **Every dragon and character design in them is provisional**
(no approved references exist yet); each image carries a PROVISIONAL slate.

| file | scene / shots | what it tests |
|---|---|---|
| `F1_prologue-dawn_PROVISIONAL` | Prologue, P-03 / P-06 | dawn sea, island in cloud, a small period ship, something vast passing in the mist (only its shadow) |
| `F2_verdor-riding-grounds_PROVISIONAL` | 1B-02 / 1B-04 | Charcoal's scale against Remi reaching for the strap; Leaf sitting upright with Abby; the ground keeper outside the launch space |
| `F3_flight-off-verdor_PROVISIONAL` | 1C-11 / 1D | the size difference in flight (long lens), the coast inland, surf; same sky and sun as F2 |
| `F4_birthing-chamber_PROVISIONAL` | 1A-12 / 1A-17 | wet gold hatchling, no glow, broken shell, lamplight and window light |
| `F5_cling-square_PROVISIONAL` | 3B-02 / 3B-08 | the festival square from the king's steps, the watchman pointing, Starlight white against cloud |

Files: `*_PROVISIONAL_preview.jpg` (1920 wide) are kept in git. The 4K PNGs
(`*.png`, ~13-19 MB each) are git-ignored; recreate them with

```
cd dragons-kingdom
bash episodes/s01e01/style-frames/make.sh
```

(about 15-20 minutes on a 4-core CPU-only machine). The scenes are
`scenes/lookdev/style-f1-prologue.js` ... `style-f5-cling-square.js`; the
camera, lens and grade of each are described in the file header.
