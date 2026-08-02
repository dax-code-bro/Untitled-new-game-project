# CFS — multicolor printing

The Creality Filament System is the box that feeds multiple filaments to the
printer automatically.

## How it works

- **4 spools per CFS unit.** Chain up to **4 units → 16 colors**.
- **RFID.** Creality filament is read automatically — type and color show up in
  the slicer without you telling it anything.
- **Sealed and desiccated.** It doubles as dry storage, which genuinely helps
  print quality. Keep the desiccant fresh.
- **Runout relay.** If a spool runs out mid-print, it can switch to another
  slot with matching filament and keep going.

## Before your first multicolor print

1. Get **single-color prints looking good first.** Multicolor adds variables;
   don't debug both at once.
2. Load two spools of the **same brand and type** (two PLAs) — different
   materials need different temps and will fight each other.
3. In the slicer, assign colors by object or by paint, slice, and check the
   preview before sending.

## What to expect

- **It's slower.** Every color change purges filament and wipes. A two-color
  print takes noticeably longer than a single-color one.
- **There's waste.** The purge tower / poop chute is normal, not a defect.
  Fewer color *changes per layer* means less waste — a model that's red on top
  and blue on the bottom wastes far less than one with speckles throughout.
- **Reduce waste** by lowering purge volumes once you trust your setup, and by
  designing/choosing models with color split by height where possible.

## What NOT to put in the CFS

| Filament | Why |
| --- | --- |
| **TPU / flexibles** | Too soft — buckles and jams in the feed path. Feed direct from a spool holder. |
| **Wet filament** | Swells and snaps in the tubes. Dry it first. |
| **Damaged / tangled spools** | A tangle mid-print stalls the whole job. Check the spool winds cleanly. |
| **Heavily abrasive CF blends** | Workable, but wears the path faster. Use a hardened nozzle and accept the wear. |

## Troubleshooting

**Filament won't load** — check the spool isn't crossed over itself; cut a
clean 45° tip on the filament end.

**Colors bleeding into each other** — purge volume is too low. Raise it in the
slicer.

**Jams on the same slot repeatedly** — check that slot's PTFE path for debris
or a burr; swap the spool to a different slot to isolate whether it's the slot
or the filament.

**Runs out and doesn't relay** — relay only works when another slot holds
matching filament that the system recognizes.

---

## My CFS setup

Keep track of what's loaded so you don't have to open it to check.

| Slot | Material | Color | Brand | Notes |
| --- | --- | --- | --- | --- |
| 1 | | | | |
| 2 | | | | |
| 3 | | | | |
| 4 | | | | |
