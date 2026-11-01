# Credits

Southbound's code, world and game design are original. These open-source
assets are used under their licenses (CC0 and MIT), listed below.
Attribution is optional for the CC0 packs, but these creators deserve the thanks.

| What | Pack | Author | License | Used for |
|---|---|---|---|---|
| People | Base body, body-shape targets, skeleton, skin weights, skins, clothes, shoes, hair, eyebrows, eyelashes, eyes | [MakeHuman](http://www.makehumancommunity.org) | CC0 1.0 (the official MakeHuman license releases all bundled assets, textures and MHCLO clothes as CC0) | Player, pedestrians and police, assembled by `tools/southbound/build-human.py` (`assets/people/`) |
| Trees & bushes | ez-tree procedural trees (baked by `tools/southbound/bake-vegetation.mjs`), grass clump and rock models | [Daniel Greenheck](https://github.com/dgreenheck/ez-tree) | MIT; bark textures from Poly Haven (CC0) | Forests, parks, bushes, grass, rocks (`assets/veg/`, license copy in `assets/veg/LICENSE-ez-tree.txt`) |
| Animations | Universal Animation Library (Standard) | [Quaternius](https://quaternius.com/packs/universalanimationlibrary.html) | CC0 1.0 | Walking, running, driving, pistol, punches, hits, death, swimming (`assets/anims/`) |
| Vehicles | Car Kit 3.1 | [Kenney](https://kenney.nl) | CC0 1.0 | Traffic, police cruisers, the player's cars (`assets/cars/`) |
| Surfaces | Grass004, Ground037, Rock030, Concrete034, Facade002, Facade012, Facade014 | [ambientCG](https://ambientcg.com) (Lennart Demes) | CC0 1.0 | Grass, dry ground, cliffs, sidewalks, photographed glass-tower and office facades with night lighting (`assets/textures/`) |
| Surfaces | asphalt_02, forest_ground_04, coast_sand_01, brick_wall_10, plastered_wall_03 | [Poly Haven](https://polyhaven.com) | CC0 1.0 | Roads, forest floor, beaches, brick and plaster walls (`assets/textures/`) |

Software:

| What | License |
|---|---|
| [Three.js](https://threejs.org) r170 (`vendor/three/`) | MIT |
| [postprocessing](https://github.com/pmndrs/postprocessing) 6.39 by pmndrs (`vendor/postprocessing/`): bloom, sun shafts, depth of field, AgX tone mapping, SMAA, grain | Zlib |
| [N8AO](https://github.com/N8python/n8ao) 2.0 (`vendor/n8ao/`): ambient occlusion | ISC |
| Basis Universal transcoder (`vendor/three/addons/libs/basis/`): KTX2 texture decoding | Apache-2.0 |
| [glTF-Transform](https://gltf-transform.dev) (asset packing, build-time only) | MIT |
| [esbuild](https://esbuild.github.io) (bundling, build-time only) | MIT |

Where the files came from (GitHub mirrors of the original downloads):

- `github.com/makehumancommunity/makehuman`: base mesh, rig, weights, targets, eyes (`LICENSE.ASSETS.md`, CC0)
- `github.com/dmaugis/makehuman-py3-assets`: clothes/hair fitting data (`.mhclo`/`.obj`) bundled with MakeHuman
- npm `makehuman-data`: compiled targets and textures of the same MakeHuman assets
- npm `@dgreenheck/ez-tree` (MIT): tree generator, bark and leaf textures, grass and rock models
- `github.com/J-Ponzo/gltf-universal-animation-library`: animation library
- `github.com/Arslan12216775/kenney_car-kit`: Kenney Car Kit (its `License.txt` is CC0)
- `github.com/Papyszoo/CC0-Public-Domain-Textures`: ambientCG and Poly Haven textures as KTX2 (repo license CC0-1.0)

To regenerate `assets/`, see `tools/southbound/pack-assets.mjs`.
