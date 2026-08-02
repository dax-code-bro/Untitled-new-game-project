# Models

Drop your print files here — `.stl`, `.3mf`, or `.gcode`.

**Max part size on the K2 Combo: 260 × 260 × 260 mm.** Anything bigger needs
to be split and joined.

> Prefer **`.3mf`** over `.stl` when you have the choice — it carries your
> slicer settings, orientation, and per-object color assignments with it,
> which matters a lot for CFS multicolor prints.

## A naming idea (optional)

Keeping names consistent makes files easy to find later:

```
name_material_notes.ext
```

For example:

```
phone-stand_PLA_v2.3mf
benchy_PETG.gcode
drawer-divider_PLA_2-color.3mf
```

## Organizing as it grows

Once you have a lot of files, subfolders help — one per project, or per room
of the house. Do it whenever it starts to feel cluttered, not before.

## Note on large files

Git handles small model files fine, but multi-hundred-MB `.gcode` files will
bloat the repo. Keep finished G-code local and store the **`.3mf` source**
here instead — it's smaller and you can always re-slice.
