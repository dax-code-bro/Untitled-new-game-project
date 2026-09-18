# Texture packs

Drop real photographed materials in here and the game uses them instead
of the procedural ones. Nothing in here is required — with this folder
empty the game runs exactly as it does now, on generated textures.

## Why this folder is empty in the repo

The container this game is built in cannot reach ambientCG, Poly Haven,
Kenney, OpenGameArt or Sketchfab — the egress proxy refuses all of them.
So the assets have to be fetched by a human on a normal machine. This
file is the shopping list.

## What to get, and from where

**ambientCG.com** and **polyhaven.com/textures** are the two to use.
Both are **CC0** — public domain, no attribution required, no licence to
track, safe to commit. Both publish exactly the three maps this loader
wants.

Get the **1K** versions, not 2K or 4K. At 1K a full set is about 2–4 MB;
at 4K it is 40 MB and the game will not load faster for it. Twelve
recipes at 1K is roughly 30–50 MB total, which is a reasonable thing to
put in a git repository. 4K would be half a gigabyte and is not.

| recipe     | search for                        |
|------------|-----------------------------------|
| `brick`    | Bricks — red, weathered, running bond |
| `concrete` | Concrete — poured, stained        |
| `wood`     | Planks — painted or bare weatherboard |
| `metal`    | Metal — brushed or painted steel  |
| `rust`     | Metal — rusted, corroded          |
| `rock`     | Rock — cliff face                 |
| `grass`    | Grass — lawn, from above          |
| `dirt`     | Ground — dry earth                |
| `sand`     | Ground — sand                     |
| `tile`     | Tiles — ceramic floor             |
| `fabric`   | Fabric — canvas or denim          |

## Where to put them

    site/assets/textures/<recipe>/albedo.jpg
    site/assets/textures/<recipe>/normal.jpg
    site/assets/textures/<recipe>/orm.jpg          (if the pack has one)

If the pack ships occlusion, roughness and metalness as separate files
rather than one ORM, name them `ao.jpg`, `roughness.jpg`,
`metalness.jpg` and the loader will assemble them.

Normal maps must be **OpenGL convention** (green channel points up).
ambientCG and Poly Haven both are. If a wall looks lit from the wrong
side, that is an inverted green channel and it is the one thing to check
first.

## A note on models

This folder is materials only, and that is deliberate. Guns, props and
characters are a different problem: the engine has no glTF or OBJ
loader, so a downloaded model has nothing to open it. Materials were
done first because they are the larger part of what makes a surface look
real, and because the loader for them is small enough to be trustworthy.

Kenney's packs are CC0 and safe, but they are stylised low-poly — using
them would move the look away from photographic realism rather than
toward it. Worth knowing before spending an evening downloading them.
