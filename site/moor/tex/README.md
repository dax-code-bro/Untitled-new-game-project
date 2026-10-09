# Dropping real photoscanned materials in here

The engine generates all twelve materials on the GPU at load. If you put real
scanned PBR maps in this folder, they replace the generated ones — no code
change, no rebuild.

## What to name them

One or both files per material, as JPEG:

    <name>_albedo.jpg     colour
    <name>_normal.jpg     tangent-space normal map

`<name>` must be one of:

    grass  rock  sand  asphalt  concrete  brick
    stucco panel metal wood  gravel  dirt

So `brick_albedo.jpg` and `brick_normal.jpg` replace the generated brick.
Anything missing just keeps its generated version, so you can do one at a time.

## Where to get them (all CC0, free for any use)

- **ambientCG** — https://ambientcg.com — photoscanned, thousands of materials
- **Poly Haven** — https://polyhaven.com/textures — photoscanned, CC0
- **FreePBR** — https://freepbr.com — free tier

Download the 1K or 2K JPEG version. Square images only. They are resized to
whatever resolution the texture setting is on, so 2K source is plenty.

## Why they are not already here

This repository is built in a sandbox whose egress policy blocks both sites
(the gateway answers 403 to the CONNECT). The generated materials exist so the
game has something decent to show without them, not because they are better.

## Tiling

Each material declares how many metres one tile covers — see `layerScale()` in
`engine/src/texgen.h`. Brick is 2.4 m, rock 4.5 m, and so on. If a scan looks
too large or too small, that is the number to change.
