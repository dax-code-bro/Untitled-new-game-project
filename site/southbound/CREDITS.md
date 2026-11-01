# Credits

Southbound's code, world and game design are original. These open-source
assets are used under their licenses. All three packs are CC0 (public domain),
so attribution is optional, but these creators deserve the thanks.

| What | Pack | Author | License | Used for |
|---|---|---|---|---|
| People | Ultimate Modular Men Pack, Ultimate Modular Women Pack | [Quaternius](https://quaternius.com) | CC0 1.0 | Player, pedestrians, police officers (`assets/people/`) |
| Animations | Universal Animation Library (Standard) | [Quaternius](https://quaternius.com/packs/universalanimationlibrary.html) | CC0 1.0 | Walking, running, driving, pistol, punches, hits, death, swimming (`assets/anims/`) |
| Vehicles | Car Kit 3.1 | [Kenney](https://kenney.nl) | CC0 1.0 | Traffic, police cruisers, the player's cars (`assets/cars/`) |

Software:

| What | License |
|---|---|
| [Three.js](https://threejs.org) r170 (`vendor/three/`) | MIT |
| [glTF-Transform](https://gltf-transform.dev) (asset packing, build-time only) | MIT |
| [esbuild](https://esbuild.github.io) (bundling, build-time only) | MIT |

Where the files came from (GitHub mirrors of the original downloads):

- `github.com/trebeljahr/quaternius-showcase`: people models (pack licenses listed in its `LICENSES.md`)
- `github.com/J-Ponzo/gltf-universal-animation-library`: animation library
- `github.com/Arslan12216775/kenney_car-kit`: Kenney Car Kit (its `License.txt` is CC0)

To regenerate `assets/`, see `tools/southbound/pack-assets.mjs`.
