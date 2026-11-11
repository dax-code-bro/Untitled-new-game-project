# Dragon's Kingdom T00: native 4K render schedule

> Made by `engine/package.mjs` from `final/shotlist.json` (Engine test episode (three shots in Cling, one in a generated bakery)); the per-shot jobs are `render-jobs.json`, the approvals `render-ready.json` (`render/gate.mjs`). On the PC: `pc\Render-Episode.cmd --episode t00`.

- **372 frames** (0:16), 372 of them 3D; about **17.4 h of rendering for one browser on the cloud machine's CPU** (range 13.9-23.0 h). A graphics card (the render PC's) is tens of times faster: `pc\GPU-Check.cmd` measures it, `STATUS.txt` tracks it.

## Per scene, in delivery order

| # | Scene | Starts | Length | Shots / jobs | Frames | Mean s/frame | Render h (1 browser) | Range h | Wall h (2 browsers) | Days | Intermediates GB | Scene master GB |
|---:|---|---:|---:|---:|---:|---:|---:|---|---:|---:|---|---|
| 1 | 0A: CLING VILLAGE SQUARE | 0:00 | 0:12 | 3 / 3 | 276 | 205 | 15.7 | 12.6-20.8 | 14.4 | 0.6 | 0.1-0.2 | 0.0-0.1 |
| 2 | 0B: CLING BAKERY | 0:12 | 0:04 | 1 / 1 | 96 | 64 | 1.7 | 1.4-2.3 | 1.6 | 0.1 | 0.0-0.1 | 0.0-0.0 |
| | **Total** | | **0:16** | **4 / 4** | **372** | | **17.4** | 13.9-23.0 | **16.0** | **0.7** | | |

## Seconds per 4K frame, by set

| Set | Shots | Frames | s per 4K frame | Hours (1 browser) | Basis |
|---|---:|---:|---:|---:|---|
| CLING_SQUARE | 3 | 276 | 205 | 15.7 | ESTIMATE: median of the Episode 1 shots on CLING_SQUARE |
| CLING_BAKERY | 1 | 96 | 64 | 1.7 | ESTIMATE: ALEXANDRIA_ROOM class (0.6 x F4: an interior, a few people, window light) |
