# Asset library (free, photo-based)

Real-world photo material for Dragon's Kingdom: sky/lighting panoramas (HDRIs),
photo-scanned surface materials (PBR textures), scanned 3D models and a CC0
human base mesh. Everything is free to use in the series (CC0, plus one CC BY
item that must be credited - see [CREDITS.md](CREDITS.md)).

The big files are **not** stored in git. Git only keeps the list
(`manifest.json`), the downloader (`fetch.mjs`), this file, `CREDITS.md` and
`.gitignore`. One command downloads everything again, byte for byte:

```bash
cd dragons-kingdom
node assets-lib/fetch.mjs            # ~0.7 GB today; safe to run again any time
```

It skips what is already there, resumes interrupted downloads, and checks every
file against its sha256 fingerprint before using it.

## What is in it (status 2026-10-06)

| kind | downloaded now | waiting for blocked hosts |
|---|---:|---:|
| HDRIs (sky + light) | 11 (4k, Poly Haven) | 4 (8k versions for visible sky) |
| PBR materials | 22 (2K) | 42 (Poly Haven 2K/4K, ambientCG 2K) |
| models | 4 | 17 (Poly Haven 2K) |
| human base mesh | 1 (MakeHuman, CC0) | - |

Downloaded now (723.9 MB on disk), by Episode 1 need:

* **Light / sky**: dawn over the sea with a low sun (`umhlanga_sunrise`), misty
  dawn (`kloppenheim_01`), overcast bay with cloud on the hills
  (`fish_hoek_beach`), clear day with cumulus (`kloofendal_48d_partly_cloudy`,
  `cloud_layers`), sea cliff (`white_cliff_top`), warm low sun (`cape_hill`,
  `evening_meadow`, `venice_sunset`), interiors (`old_room`,
  `castle_zavelstein_cellar`).
* **Ground**: moss grass, grass+dirt, sparse grass, mossy dirt, dark mud (launch
  scar), dry dirt, pale sand, rippled sand, shingle (ambientCG `Ground*`).
* **Stone**: pale weathered rock (`Rock26`), Poly Haven `white_sandstone_bricks_03`
  and `sandstone_blocks_04` (Verdor's pale stone), `floor_pebbles_01`.
* **Wood, leather, cloth, metal**: weathered wood, planks, black and red-brown
  leather (saddles), linen, red and green woven cloth (banners), rusted iron,
  wicker (512 px only).
* **Models**: a scanned coastal cliff composition (outer rocks; CC BY 4.0), a
  wooden sailing ship (Poly Haven `dutch_ship_medium`, 1k textures), an old
  street lantern, a fish for the stalls.
* **Human**: MakeHuman base mesh + default skeleton and skin weights (CC0).

Each entry in `manifest.json` says which Episode 1 sets it serves (`sets`), what
it is for (`use`), its licence, author, original page and the exact URL it was
downloaded from.

## Why some things are "blocked", and how to unblock them

This build environment's network policy refuses the two big free libraries and
most other asset sites (`api.polyhaven.com`, `dl.polyhaven.org`, `ambientcg.com`,
`acg-download.struffelproductions.com`, `files.makehumancommunity.org`,
`download.blender.org`, `sketchfab.com`, ...; full list in
`manifest.json` -> `hosts`). The 38 assets above were found on hosts that *are*
reachable (Google's Kubric research mirror of the Poly Haven HDRIs, and GitHub
repositories that vendor CC0 Poly Haven / ambientCG / Khronos / MakeHuman files).

The other 63 are already listed with verified ids. To get them, allow these
hosts in the environment's network settings (Custom access, keep the package
managers): `api.polyhaven.com`, `dl.polyhaven.org`, `ambientcg.com`,
`acg-download.struffelproductions.com`. Then:

```bash
node assets-lib/fetch.mjs --discover   # checks the Poly Haven ids (some model ids are unverified)
node assets-lib/fetch.mjs --lock       # downloads them and records their sha256 in manifest.json
node assets-lib/fetch.mjs --credits    # refresh CREDITS.md
```

Estimated size of the blocked part: ~1.5-2 GB (Poly Haven does not publish
sizes offline; ambientCG's six zips are 142 MB). Together with what is here,
the library stays under the 3.5 GB budget.

## Command reference

```
node assets-lib/fetch.mjs [options]
  --only TEXT[,TEXT]   only ids containing TEXT (e.g. --only hdri/,pbr/acg_ground)
  --set SET            only assets for an Episode 1 set (e.g. set.cling_village_square)
  --kind K             hdri | pbr | model | human
  --dry-run            list what would be downloaded
  --verify             re-hash every file (normally size+mtime are trusted after the first check)
  --lock               record sha256/size of newly resolved files in manifest.json
  --discover           check Poly Haven ids against the live catalogue, suggest close matches
  --credits            regenerate CREDITS.md
  --dir DIR            library root (default: this folder)   --jobs N   parallel downloads (4)
  --strict             exit 1 if anything is missing (also blocked entries)
  --keep-archives      keep downloaded .tar.gz/.zip in .cache/
```

Exit code 0 when every "available" asset is present and verified (blocked hosts
are reported, not fatal unless `--strict`); 1 if one is missing or damaged.
Works through `HTTPS_PROXY` (CONNECT tunnel) and honours `NO_PROXY`; no npm
packages needed.

Tested here: fresh download (38 assets in 29 s), re-run (3 s, nothing
downloaded), a flipped byte in a file (detected, file re-downloaded), a 7 MB
partial file (resumed with an HTTP Range request: 12.0 MB fetched for the 19 MB
file, final sha256 correct), `kill -9` in the middle of downloading four HDRIs
(re-run finished them), `--verify` over all files. The Poly Haven and ambientCG
code paths could not run against the live services (blocked); they were checked
offline: zip/tar.gz readers on archives made with Python (deflate + stored, GNU
long names, pax headers), and the Poly Haven resolver against mocked API
answers in the documented `/files` + `/info` shape (texture maps with a missing
AO and a PNG-only displacement, a glTF with `include` files, an 8k HDRI, an
unknown id, and a path-traversal `include` that must be refused). Run
`--discover` first when the hosts are opened.

## Adding an asset

Edit `manifest.json` (it is the source of truth) and add an entry like the
existing ones: `id` (`<kind>/<name>`; files go to that folder), `kind`
(`hdri` | `pbr` | `model` | `human`), `title`, `license` (CC0 or a CC BY with a
credit line), `author`, `origin.url` (the asset's own page), `via` (where the
file really comes from), `sets`, `use`, `files` (`path` + `url`, optionally
`archive: {format: "tar.gz"|"zip", member}`), and `params` (`maps` for PBR sets
incl. `normal_convention` "gl"/"dx" and `tile_m`; `entry` for models). Leave
`sha256` out and run `node assets-lib/fetch.mjs --only <id> --lock`: the file is
downloaded and its sha256/size are written into the manifest. For Poly Haven /
ambientCG use a `resolve` block instead of `files` (see the blocked entries).

## Using it in a scene

`scenes/lib/assets.js`:

```js
import { loadHDRI, loadPBR, loadModel } from './lib/assets.js';

export async function setup(ctx) {
  const sky = await loadHDRI('hdri/kloofendal_48d_partly_cloudy', ctx, { extractSun: true, rotationY: -1.58 });
  const sun = sky.apply(ctx.scene);           // scene.environment + background; returns the sun as a light
  sun.castShadow = true; ctx.scene.add(sun, sun.target);

  const turf = await loadPBR('pbr/acg_ground037', ctx, { worldSize: 40 });  // UV 0..1 = 40 m
  const cliff = await loadModel('model/babylon_coastal_cliff', ctx);
  ctx.scene.add(cliff.scene);
}
```

* `loadHDRI(id, ctx, opts)` -> `{ texture, envMap, sun, apply(scene) }`. With
  `extractSun` the sun is cut out of the HDRI and returned as a
  DirectionalLight with exactly the removed energy (sharp shadows, no
  double-counted sun) - the usual VFX approach.
* `loadPBR(id, ctx, opts)` -> `MeshStandardMaterial` (or `MeshPhysicalMaterial`
  with `sheen` for cloth). Albedo is sRGB, everything else linear data; DirectX
  normal maps get `normalScale.y = -1`; packed maps (HDRP mask, glTF ORM) are
  read from the right channels. `worldSize` (metres covered by UV 0..1) uses
  the set's `tile_m`; `repeat` sets the repeat directly; `displacementScale`
  (metres) enables real displacement (needs dense geometry).
* `loadModel(id, ctx, opts)` -> `{ scene, animations }` for glTF/GLB (Draco,
  KTX2/Basis, meshopt, GPU instancing) and OBJ (MakeHuman: decimetres -> metres,
  helper meshes hidden, smooth normals).

All loads go through three.js loaders / `fetch`, so the render runtime waits for
them and fingerprints exactly the files a scene used. Each asset folder has an
`asset.json` (written by fetch.mjs) that the loaders read.

**Determinism:** GLTFLoader builds meshes in whatever order its worker decodes
finish, which changes three's internal ids between runs; `loadModel` therefore
gives every mesh a distinct `renderOrder` in scene-graph order. Without it the
cliff model rendered 424 pixels differently in two runs; with it, three runs
were pixel-identical. Keep that in mind for anything else created
asynchronously that overlaps (decals, coplanar cards).

## Verification (2026-10-06)

`scenes/asset-library-test.js` renders every downloaded material on a 1 m ball
under the real HDRI, with an 18% grey ball and a chrome ball (the standard VFX
lighting references), the cliff scan, the lantern, the fish and the MakeHuman
body for scale:

```bash
node render/render.mjs --still scenes/asset-library-test.js --time 0 --preset final --png output/asset-library-test-4k.png
```

Measured (final run): 3840x2160 still, 10.1 s for the frame (9.3 s scene
pass), 31 s including loading; ~5.4 GB peak resident memory summed over all
processes. The GPU held 155 textures (including the cliff's 48 KTX2 textures,
24 label canvases and the render targets); an uncompressed 2K texture costs
~22 MB with mipmaps, so the loader shares one image between all materials that
use the same file. Two renders of the frame are pixel-identical.

Checks done on the downloaded files and in the renderer:

* **Hashes**: the Git LFS files' sha256 match the LFS pointers' oids.
* **Normal-map convention**, per set, two ways: correlation of the normal map's
  green channel with the height map's gradient, and the curl of the normal field
  under both conventions (the wrong one is not integrable). Result: the
  ambientCG cc0textures-era maps are DirectX, the Poly Haven maps OpenGL (all 11
  sets with height maps agree on both tests). Then in the renderer: a flat plane
  with the loader's normal map vs. real geometry displaced from the height map,
  shading correlation +0.65 ... +0.94, versus -0.13 ... +0.37 with the opposite
  convention (3 sets x 2 light directions).
* **Colour space**: an albedo-only plane under an ambient light of intensity pi
  with linear tone mapping reproduces the texture's sRGB means within 1-2 code
  values (a wrong sRGB/linear setting would be off by ~50).
* **HDRI orientation and energy**: the extracted sun direction matches the
  shadows and the chrome ball's reflection; its energy (4.43) matches an
  independent numpy integration of the same file (4.41). The file is read as
  32-bit float for this: half float would clip the sun (peak ~7.5e4 > 65504).

## Known limits (honest list)

* **Visible 4K sky**: a 4k equirectangular HDRI has ~11 pixels per degree; a 4K
  frame with a 40 degree lens needs ~96. Used directly as the background it is
  visibly soft (checked at 1:1). Fine for light and reflections; for skies on
  screen use the 8k/16k Poly Haven originals once reachable, sky-only shots with
  shallow depth of field, or a sharper sky layer (procedural / painted clouds)
  in front of the HDRI.
* **Older ambientCG sets** (`acg_*`) are 2K and from the 2018-2020
  cc0textures.com era; their current ambientCG ids are guesses; their `tile_m`
  (real size) values are estimates from the photos.
* **HDRP-packed Poly Haven sets** (`ph_white_sandstone_bricks_03`,
  `ph_sandstone_blocks_04`, `ph_floor_pebbles_01`): the repacker stored
  roughness inconsistently (as smoothness in two sets, as roughness in one); the
  manifest records the per-set choice. Replace with the originals when possible.
* **Not available from here**: cobblestone/flagstone, roof tiles and rope
  textures, trees/shrubs/barrels/crates/baskets scans, realistic human skin, hair
  and eye textures. They are in the blocked list (except skins: MakeHuman's
  CC0 skin library lives on files.makehumancommunity.org).
* **Large tiled ground**: one 2K set repeated over 80 m shows visible
  repetition and streaky aliasing at grazing angles (seen in the 4K test). Big
  terrain needs the usual tricks: a second detail scale, macro colour
  variation, blending several sets, normal-map fade with distance.
* **CC BY item**: the coastal cliff composition must be credited (CREDITS.md).
