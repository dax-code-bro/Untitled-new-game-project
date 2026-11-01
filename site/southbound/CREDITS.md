# Credits

Southbound's code, world and game design are original. These open-source
assets are used under their licenses. All of the art packs are CC0 (public domain),
so attribution is optional, but these creators deserve the thanks.

| What | Pack | Author | License | Used for |
|---|---|---|---|---|
| People | Ultimate Modular Men Pack, Ultimate Modular Women Pack | [Quaternius](https://quaternius.com) | CC0 1.0 | Player, pedestrians, police officers (`assets/people/`) |
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

- `github.com/trebeljahr/quaternius-showcase`: people models (pack licenses listed in its `LICENSES.md`)
- `github.com/J-Ponzo/gltf-universal-animation-library`: animation library
- `github.com/Arslan12216775/kenney_car-kit`: Kenney Car Kit (its `License.txt` is CC0)
- `github.com/Papyszoo/CC0-Public-Domain-Textures`: ambientCG and Poly Haven textures as KTX2 (repo license CC0-1.0)

To regenerate `assets/`, see `tools/southbound/pack-assets.mjs`.
