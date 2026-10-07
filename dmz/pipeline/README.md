# Photogrammetry pipeline (open source)

This pipeline goes from real-world photos to an in-game asset:

```
 photos ──► reconstruct.sh ──► raw scan ──► process_scan.py ──► .glb + LODs ──► assets.json ──► game
          (COLMAP + OpenMVS    (millions of    (Blender: clean,      (viewer.html
           or Meshroom)         tris, messy)    scale, bake, LOD)     to check it)
```

Every tool here is free and open source:
- [COLMAP](https://colmap.github.io) and [OpenMVS](https://github.com/cdcseacave/openMVS), or [Meshroom](https://alicevision.org) instead of both
- [Blender](https://www.blender.org)
- Three.js / glTF
- [glTF-Transform](https://gltf-transform.dev), optional, for compressing files

---

## 1. Capture: what decides the quality

Photogrammetry can only reconstruct what it can see clearly in **many overlapping, sharp photos**. Most bad scans come from bad photos, not bad software.

**Camera**
- Any camera works, including a phone. A DSLR or mirrorless camera with a fixed lens is best. Shoot RAW if you can and export 16-bit TIFF or high-quality JPEG.
- Use manual exposure, and keep ISO, aperture and white balance the same for the whole set.
- Use aperture f/8 to f/11 so the whole object is in focus. Keep shutter speed 1/125 or faster, or use a tripod.
- Don't zoom between shots, and turn off in-camera stabilisation if you're on a tripod.

**Coverage**
- Aim for **60–80% overlap** between neighbouring photos. Step around the object every 10–15°.
- Shoot 3 rings: low (about 20° up), eye level and high (about 60° down). Add a few top-down shots and close-ups of detailed areas.
- Small props usually need 60–150 photos. A building facade needs 200–600. A whole ruin needs 1000+.
- For objects you can pick up, put them on a turntable in front of a plain background. Rotate the object, not the camera, and keep the lighting fixed.

**Light**
- An **overcast day is ideal**. It gives soft, even light with no hard shadows baked into the texture.
- Avoid shiny, transparent and plain featureless surfaces. They don't reconstruct. Scanning spray (it evaporates) or a light chalk dust helps on smooth surfaces.
- For the highest quality ("de-lit" albedo), use cross-polarized flash: a polarizing film on the flash and a polarizer on the lens rotated 90°. This removes reflections.

**Scale and colour**
- Put a ruler or a coded scale bar in the scene, or measure the object's real height. `process_scan.py --height` uses that number to give the asset its true size in meters.
- Shoot one frame with a colour checker card at the start of each set so the colours stay accurate.

**What to scan for an extraction shooter**
Rocks, cliff chunks, debris piles, concrete barriers, sandbags, crates, barrels, wrecked cars, wall and ground surfaces, doors, tree trunks and bark, plus the containers and props the loot system uses.

## 2. Reconstruct: photos → raw scan

```bash
./reconstruct.sh ~/scans/rock_07/photos ~/scans/rock_07/work            # COLMAP + OpenMVS
./reconstruct.sh ~/scans/rock_07/photos ~/scans/rock_07/work --meshroom # or Meshroom
```

You need an NVIDIA GPU with CUDA for reasonable speed. Expect anywhere from minutes for a small prop to hours for a large set. The output is a textured `.obj`, usually with millions of triangles and stray debris around the subject. That's expected; the next step cleans it up.

On Windows, the Meshroom GUI does the same job if you'd rather not use the command line: drag the photos in, press Start, then use `MeshroomCache/Texturing/.../texturedMesh.obj`.

## 3. Process: raw scan → game asset

```bash
# with the Blender app
blender -b -P process_scan.py -- --input work/dense/scene_textured.obj --name rock_07 \
  --out ../assets/scans/rock_07 --height 1.4 --slot rock --manifest ../assets/assets.json \
  --license own-scan --author "Your Name"

# or with the pip module:  pip install bpy   (it needs a matching Python version)
python process_scan.py --input ... (same arguments)
```

The script:
1. **Cleans** the scan: welds vertices and removes floating debris and loose geometry (`--keep-fraction`).
2. **Normalises** it: centres it, puts it on the ground and scales it to `--height` meters.
3. **Builds LOD0**: decimates to the first `--lods` budget, re-UVs it, and **bakes base colour and a normal map** from the full-resolution scan. The low-poly mesh keeps the detail of millions of triangles.
4. **Builds LOD1..n**: cheaper versions that share LOD0's textures and kick in at `--lod-distances`.
5. **Exports** `<name>.glb` with nodes `<name>_LOD0..n`, writes `<name>.json`, and registers the asset in the game manifest.

Defaults: `--lods 20000,5000,1200 --lod-distances 0,25,70 --tex 2048`. Give hero props more (`--lods 60000,15000,4000 --tex 4096`) and give clutter less.

Optional: compress for shipping. This makes the file much smaller and decodes on the GPU:
```bash
npx @gltf-transform/cli optimize rock_07.glb rock_07.glb --texture-compress ktx2
```
If you do this, the game also needs `KTX2Loader` enabled in `src/assets.js`.

## 4. Check it

Open `viewer.html` from the game server (`http://localhost:8000/viewer.html`). Pick the asset from the list or drag a `.glb` onto the page. Check:
- **Scale** against the 1.8 m human and the 1 m grid
- **LOD** switching. Under Auto, zoom out and watch for popping.
- **Wireframe**, to judge the triangle budget
- **Rotate sun**, to make sure no shadows got baked into the texture (they look wrong once the game's sun moves)

## 5. In the game

`src/assets.js` loads everything in `assets/assets.json`. The world asks for scans by **slot**:

| slot | replaces | collider |
| --- | --- | --- |
| `rock` | block rocks | the scan's scaled bounds |
| `tree` | cone trees | trunk (unchanged) |
| `car` | block cars (scaled to 4.4 m long, aligned with the road) | the scan's scaled bounds |

Gameplay uses simple box colliders, never the scan triangles, so a dense scan costs nothing in physics. The map layout is seeded and stays **identical** whether or not scans are installed. Scans only replace how things look.

To add a new kind of prop: give it a new `--slot`, then in `src/world.js` call `this.scanProp('<slot>', rect)` where the placeholder geometry is placed (see `buildRocks()`).

`assets/scans/rock_test` is a **procedurally generated test rock** (`tools/make_test_scan.py`) that proves the pipeline end to end. Delete it once you have real rock scans:
remove its folder and its entry in `assets/assets.json`.

## Open-licensed models you can use

When you use other people's scans, record `--license` and `--author` for every one; the viewer shows them.

| Source | License | Notes |
| --- | --- | --- |
| [Poly Haven](https://polyhaven.com/models) | CC0 | High-quality scanned models and textures, no attribution required |
| [ambientCG](https://ambientcg.com) | CC0 | Scanned PBR materials for ground, walls and rock |
| [Smithsonian Open Access 3D](https://3d.si.edu) | CC0 (per item) | Museum-grade scans |
| [Sketchfab](https://sketchfab.com) | filter by CC0 / CC-BY | Lots of photogrammetry. Check each model's license; CC-BY requires credit |

Avoid sources whose licence forbids redistribution or use in games. Check before you build a level around an asset.
