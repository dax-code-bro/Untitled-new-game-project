# Profiles & settings — K2 Combo

Starting points for each material, plus a place to record what actually
worked on your machine.

Creality Print ships with tuned K2 profiles, so **start with the built-in
profile for your filament** and adjust from there. The numbers below are
sanity checks, not replacements.

## Starting temperatures

Remember the ceilings: **nozzle 300 °C, bed 100 °C.**

| Material | Nozzle | Bed | Speed | Notes |
| --- | --- | --- | --- | --- |
| **PLA** | 200–220 °C | 55–60 °C | fast — it's what the K2 is built for | Easiest. Start here. Crack the door if it heat-creeps in a long print. |
| **PETG** | 230–250 °C | 70–80 °C | ~50–60% of PLA speed | Slow down. Prone to stringing — tune retraction. Use glue stick as a *release* agent so it doesn't bond to the plate. |
| **TPU (flexible)** | 210–230 °C | 30–50 °C | slow, 20–30 mm/s | **Do not run through the CFS** — feed it direct. See the CFS notes. |
| **ABS** | 240–270 °C | 90–100 °C | moderate | Keep the enclosure **shut** — drafts cause warping and layer splits. Ventilate the room. |
| **ASA** | 240–270 °C | 90–100 °C | moderate | Like ABS but UV-stable. Good for outdoor parts. Enclosure shut. |
| **PLA-CF / PETG-CF** | +10 °C over base | same as base | moderate | Abrasive — needs a **hardened nozzle**. Will chew a brass one. |

> **Too hot to reach:** PPS, PEEK, and most PA/PPA blends want more than
> 300 °C. Not this machine.

## Known-good settings — my machine

Fill this in as you dial things in. This is the table that actually matters.

| Material | Brand | Nozzle | Bed | Flow | Retraction | Result |
| --- | --- | --- | --- | --- | --- | --- |
| | | | | | | |

## Exported profiles

Drop exported slicer profiles in this folder so they can be re-imported after
a reinstall or on another computer.

## Things worth knowing on the K2

- **It auto-levels.** Let it run its leveling routine; don't fight it with
  manual Z tweaks unless the first layer is genuinely off.
- **Enclosed means heat.** Great for ABS/ASA, but PLA can soften and
  heat-creep on long prints — leave the door ajar for big PLA jobs.
- **Speed is a ceiling, not a target.** 600 mm/s is real, but quality parts
  usually print slower. Don't chase the top number.
- **Dry filament matters more at speed.** Wet PETG/TPU pops and strings badly.
