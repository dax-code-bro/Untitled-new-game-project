# Credits

Southbound's code, world and game design are original. These open-source
assets are used under their licenses (CC0 and MIT), listed below.
Attribution is optional for the CC0 packs, but these creators deserve the thanks.

| What | Pack | Author | License | Used for |
|---|---|---|---|---|
| People | Base body, body-shape targets, skeleton, skin weights, skins, clothes, shoes, hair, eyebrows, eyelashes, eyes | [MakeHuman](http://www.makehumancommunity.org) | CC0 1.0 (the official MakeHuman license releases all bundled assets, textures and MHCLO clothes as CC0) | Player, pedestrians and police, assembled by `tools/southbound/build-human.py` (`assets/people/`) |
| Trees & bushes | ez-tree procedural trees (baked by `tools/southbound/bake-vegetation.mjs`), grass clump and rock models | [Daniel Greenheck](https://github.com/dgreenheck/ez-tree) | MIT; bark textures from Poly Haven (CC0) | Forests, parks, bushes, grass, rocks (`assets/veg/`, license copy in `assets/veg/LICENSE-ez-tree.txt`) |
| Animations | Universal Animation Library (Standard) | [Quaternius](https://quaternius.com/packs/universalanimationlibrary.html) | CC0 1.0 | Walking, running, driving, pistol, punches, hits, death, swimming (`assets/anims/`) |
| Vehicles | Procedural (built in code, `src/assets/carbuilder.js`) | Southbound | Original | Every car, van, truck, police cruiser, ambulance and fire engine |
| Weapons | Procedural (built in code, `src/entities/arsenal.js`) | Southbound | Original | 221 weapons and 195 attachments; all makers and model names are invented |
| Clouds, weather | Ray-marched clouds and rain (`src/world/clouds.js`, `weather.js`) | Southbound | Original | Cloud noise is generated at load time |
| Surfaces | Grass004, Ground037, Rock030, Concrete034, Facade002, Facade012, Facade014 | [ambientCG](https://ambientcg.com) (Lennart Demes) | CC0 1.0 | Grass, dry ground, cliffs, sidewalks, photographed glass-tower and office facades with night lighting (`assets/textures/`) |
| Surfaces | asphalt_02, forest_ground_04, coast_sand_01, brick_wall_10, plastered_wall_03 | [Poly Haven](https://polyhaven.com) | CC0 1.0 | Roads, forest floor, beaches, brick and plaster walls (`assets/textures/`) |
| Surfaces | Asphalt012, RoofingTiles013A, CorrugatedSteel005, Gravel004, WoodFloor007 | [ambientCG](https://ambientcg.com) (Lennart Demes) | CC0 1.0 | Road resurfacing patches, shingle roofs, steel sheds, gravel, interior wood floors (`assets/textures/`) |
| Surfaces | square_concrete_pavers, red_brick, weathered_plank_siding, brown_mud, forest_leaves_02, cliff_side | [Poly Haven](https://polyhaven.com) | CC0 1.0 | Sidewalk pavers, brick walls, house siding, mud, forest leaf litter, cliffs (`assets/textures/`) |
| Surfaces | Cobblestone01, StuccoWall01, RustyCorrugatedMetalPanel01, Dirt01, BathroomTiles02 | [cgbookcase](https://www.cgbookcase.com) | CC0 1.0 | Cobbles, stucco shops, rusting sheds, rocky dirt, bathroom floors (`assets/textures/`) |

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
- `github.com/Papyszoo/CC0-Public-Domain-Textures`: ambientCG and Poly Haven textures as KTX2 (repo license CC0-1.0)

To regenerate `assets/`, see `tools/southbound/pack-assets.mjs`.

## Open-source 3D models (`assets/open/`, packed by `tools/southbound/pack-open.mjs`)

From the [Khronos glTF Sample Assets](https://github.com/KhronosGroup/glTF-Sample-Assets) (textures re-encoded to WebP, meshes compressed with meshopt; Khronos logos removed):

| Model | Used as | Credit / license |
|---|---|---|
| CarConcept | "Gulfstar Concept" supercar, the PC starter car | © 2024 Darmstadt Graphics Group GmbH, Eric Chadwick (model and textures), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/); based on a public-domain concept car by Unity Fan |
| GlamVelvetSofa | living-room sofa | © 2021 Wayfair, LLC, Eric Chadwick, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| SheenWoodLeatherSofa | living-room sofa | © 2024 Darmstadt Graphics Group GmbH, Eric Chadwick (improvements), CC BY 4.0; original by Fran Calvente, CC0 |
| ChairDamaskPurplegold | dining chair | © 2021 Wayfair, Eric Chadwick, CC BY 4.0 |
| CommercialRefrigerator | store fridges | © 2025 Darmstadt Graphics Group GmbH, Eric Chadwick, CC BY 4.0; based on "Commercial Fridge" by Sean Thomas, CC BY 4.0 |
| DiffuseTransmissionPlant | table plant | © 2024 Darmstadt Graphics Group GmbH, Eric Chadwick (materials), CC BY 4.0; original by Rico Cilliers, CC0 |
| Fox | red fox (wildlife) | model by PixelMannen (CC0); rigging and animation © 2014 tomkranis, CC BY 4.0 |
| SheenChair | chairs | © 2020 Wayfair, LLC, CC0 |
| Lantern, BarramundiFish, BoomBox, WaterBottle, AntiqueCamera | props, caught fish | Microsoft and others, CC0 |

From [Quaternius](https://quaternius.com) (CC0, via [quaternius-showcase](https://github.com/trebeljahr/quaternius-showcase)):
Animals pack (deer, stag, wolf as coyote, horse, cow, bull — rigged and animated), House Interior pack (beds, sofas, kitchens,
bathrooms, lamps, shelves, plants, curtains), Fish pack (fish, shark), Medieval Weapons pack (wooden bows).

## Unity version (`southbound-unity/`)

The Unity project uses the same assets as above (converted to PNG/JPG and plain
glTF by `tools/southbound/export-unity.mjs`). Its texture downloader fetches the
full-resolution originals of the same 29 CC0 sets directly from ambientCG, Poly Haven
and cgbookcase, and writes each set's credit next to it. Bullet-hole decals are drawn
in code.
