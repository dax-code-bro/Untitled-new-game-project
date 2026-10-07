#!/usr/bin/env python3
"""render_plan.py - native-4K render plan for the S01E01 work-in-progress preview.

Reads ../edl.json (run build_edl.py first). Writes:
  ../render-plan.md     the plan for people: per set, per shot, hours, tricks, job layout, conform
  ../render-jobs.json   the job list a queue runner can execute (one render.mjs job per shot)

Nothing is rendered here (and nothing heavy is run): the seconds-per-frame figures are the
style-frame measurements from the README (first frame of a fresh browser at native 4K) and,
where no measurement exists, estimates derived from them. Each number says which it is.
Deterministic: same edl.json -> same outputs.
"""
import json
import math
from pathlib import Path

HERE = Path(__file__).resolve().parent
PREVIEW = HERE.parent
EP = PREVIEW.parent
REPO = EP.parents[2]
FPS = 24

# ----------------------------------------------------------------------------- cost model
# seconds per native-4K frame, one browser on this 4-thread CPU-only machine (SwiftShader)
COST = {
    'sea': {'spf': 12.7, 'range': [10.0, 16.0], 'kind': 'MEASURED',
            'basis': 'style frame F1 (scenes/lookdev/style-f1-prologue.js) with --cinematic velocity: 12.7 s per 4K frame '
                     '(README: "13 s (F1)", first frame of a fresh browser incl. shader compilation).'},
    'vista': {'spf': 13.0, 'range': [10.0, 20.0], 'kind': 'ESTIMATE',
              'basis': 'F1-class picture (FFT ocean, haze, fog banks, terrain at distance, no hero creatures or people); '
                       'set to F1\'s 12.7 s, rounded up for the extra buildings/trees.'},
    'meadow': {'spf': 35.0, 'range': [25.0, 50.0], 'kind': 'ESTIMATE',
               'basis': 'F2\'s riding-grounds terrain, 77k grass tufts and sun shadows without the two creatures and three people '
                        '(F2 is 50.7 s with them).'},
    'grounds': {'spf': 50.7, 'range': [40.0, 60.0], 'kind': 'MEASURED',
                'basis': 'style frame F2 (scenes/lookdev/style-f2-riding-grounds.js) with --cinematic velocity: 50.7 s per 4K frame '
                         '(README: "51 s (F2)"; 64k+10k+3.5k grass tufts, Charcoal, Leaf, three people, shadow cascades).'},
    'dust': {'spf': 65.0, 'range': [50.0, 90.0], 'kind': 'ESTIMATE',
             'basis': 'F2 plus dust as growing volumetric banks and a few hundred instanced stones/sods (1C-05, 1C-06, 1C-08).'},
    'chamber': {'spf': 55.0, 'range': [40.0, 67.0], 'kind': 'ESTIMATE',
                'basis': 'style frame F4 (birthing chamber) measured 202 s with 8 sub-frames. Going to velocity blur cut F1 to 0.33x '
                         'and F2 to 0.20x of their 8-sub-frame cost, so F4 should land at 40-67 s; F4 has a large fixed cost '
                         '(96-tap depth of field, near-field fog), so the middle of that range is used. Wide shots with 3-4 people '
                         'will sit at the top of it.'},
    'sky': {'spf': 40.0, 'range': [29.0, 49.0], 'kind': 'ESTIMATE',
            'basis': 'style frame F3 (flight off Verdor) measured 146 s with 8 sub-frames; the same 0.20-0.33x velocity ratio '
                     'gives 29-49 s (two creatures, riders, cliffs, ocean, haze).'},
    'sky_acc8': {'spf': 146.0, 'range': [120.0, 160.0], 'kind': 'MEASURED',
                 'basis': 'style frame F3 as measured: 146 s per 4K frame with 8 accumulated sub-frames (the README table). '
                          'Used only for the pass (1E-03), where velocity blur would be wrong for a curved, very fast move.'},
    'none': {'spf': 0.0, 'range': [0.0, 0.0], 'kind': 'NO RENDER',
             'basis': 'black frame drawn by ffmpeg in the conform'},
}
SET_COST = {'SEA_COAST_DAWN': 'sea', 'PROLOGUE_VISTAS': 'vista', 'VERDOR_GROUNDS': 'grounds', 'BIRTHING_CHAMBER': 'chamber',
            'SKY_OFF_VERDOR': 'sky', 'CARD_BLACK': 'none'}
CLASS_ALIAS = {'meadow': 'meadow', 'dust': 'dust', 'chamber': 'chamber', 'sky_acc8': 'sky_acc8'}
# throughput of 2 browsers vs 1 on this machine (README "npm run bench", native 4K: 1 -> 0.466 fps, 2 -> 0.511 fps)
TWO_WORKER_GAIN = 0.511 / 0.466
STEADY_STATE = 0.85   # assumed: steady-state frames vs the first-frame figures above (shader compile excluded); measure in the pilot

SETS = {
    'SEA_COAST_DAWN': {
        'scene': 'episodes/s01e01/preview/scenes/sea-coast-dawn.js', 'from': 'scenes/lookdev/style-f1-prologue.js',
        'libs': ['dk/ocean.js (FFT ocean, setWake, surf)', 'runtime/cinematic (atmosphere, volumetric fog banks, velocity blur, grade)',
                 'scenes/lib/sets/ship.js (knarr)', 'scenes/lib/sets/terrain.js (island)', 'scenes/lib/sets/fx.js (silhouetteCard: the shape in the fog)',
                 'scenes/lib/assets.js (HDRI: umhlanga_sunrise / kloppenheim_01)', 'scenes/lib/humans (sailor1, sailor2)',
                 'scenes/lookdev/finish.js (filmFinish)'],
    },
    'PROLOGUE_VISTAS': {
        'scene': 'episodes/s01e01/preview/scenes/prologue-vistas.js', 'from': 'new set in the F1 look (one landscape per shot)',
        'libs': ['dk/ocean.js', 'scenes/lib/sets/terrain.js + kitbash.js (cliffs; CC BY 4.0 scans, credited in assets-lib/CREDITS.md)',
                 'scenes/lib/sets/scatter.js + assets-lib ph_fir_sapling / ph_island_tree_02 (forest)', 'scenes/lib/sets/buildings.js (walls, towers)',
                 'scenes/lib/sets/town.js (settlement)', 'scenes/lib/assets.js (HDRIs: kloppenheim_01, cloud_layers, umhlanga_sunrise, fish_hoek_beach)',
                 'runtime/cinematic (volumetric banks: the wing-shaped cloud)', 'scenes/lookdev/finish.js'],
    },
    'VERDOR_GROUNDS': {
        'scene': 'episodes/s01e01/preview/scenes/riding-grounds.js', 'from': 'scenes/lookdev/style-f2-riding-grounds.js',
        'libs': ['scenes/lib/sets/terrain.js, grass.js, scatter.js, kitbash.js, buildings.js (doorway)',
                 'scenes/lib/creatures (charcoal, leaf; createSaddle, mountRider; sit / stand / flight / glide poses)',
                 'scenes/lib/humans (remi, abby, remi_ride, abby_ride, keeper1/2)', 'dk/ocean.js (sea beyond the field)',
                 'scenes/lib/assets.js (HDRI kloofendal_48d_partly_cloudy, same sun as F3)', 'dk/camera.js (ground shake at the launch)',
                 'scenes/lookdev/finish.js'],
    },
    'BIRTHING_CHAMBER': {
        'scene': 'episodes/s01e01/preview/scenes/birthing-chamber.js', 'from': 'scenes/lookdev/style-f4-birthing-chamber.js',
        'libs': ['scenes/lib/creatures (hatchling: wet dielectric gold, no glow)', 'scenes/lib/humans (alexandria, attendant, abby, remi, one crowd-kit woman)',
                 'scenes/lib/sets/buildings.js + materials.js (walls, high opening, door for the wide shots)',
                 'scenes/lib/assets.js (HDRI castle_zavelstein_cellar; stone/linen/wood scans; ph_wooden_stool_02)',
                 'runtime/cinematic (window-shaft fog, depth of field)', 'scenes/lookdev/finish.js'],
    },
    'SKY_OFF_VERDOR': {
        'scene': 'episodes/s01e01/preview/scenes/sky-off-verdor.js', 'from': 'scenes/lookdev/style-f3-flight.js',
        'libs': ['dk/ocean.js (+ creature shadows on the water)', 'scenes/lib/sets/terrain.js + kitbash.js (coast, cliffs, surf)',
                 'scenes/lib/creatures (charcoal, leaf, scout; flight / glide / bank poses, jaw for 1D-19)',
                 'scenes/lib/humans riders (abby_ride, abby_ride_injured, remi_ride, scout_ride)', 'scenes/lib/sets/buildings.js (palace stand-in, 1D-02)',
                 'dk/camera.js (aerial and dragonback shake)', 'scenes/lib/assets.js (HDRI kloofendal, same sun as F2)', 'scenes/lookdev/finish.js'],
    },
}


def tc(frame):
    s, f = divmod(frame, FPS)
    m, s = divmod(s, 60)
    h, m = divmod(m, 60)
    return f'{h:02d}:{m:02d}:{s:02d}:{f:02d}'


def chunk_frames(spf):
    """About 25 min (at most ~30 min) of one browser's work per chunk: a restart loses at most that per worker."""
    if spf < 20:
        return 48
    if spf <= 100:
        return 24
    return 12


def main():
    edl = json.loads((PREVIEW / 'edl.json').read_text())
    shots = [e for e in edl['events'] if e['kind'] == 'shot']
    total = edl['totals']['frames']

    # ------------------------------------------------------------ per shot cost + set timelines
    jobs = []
    set_cursor = {}
    rows = []
    for e in shots:
        cls = e['render'].get('cost_class') or SET_COST[e['set']]
        cls = CLASS_ALIAS.get(cls, cls)
        if e['set'] == 'CARD_BLACK':
            cls = 'none'
        c = COST[cls]
        n = e['render']['frames_to_render']
        h0, h1 = e['render']['handles_frames']
        row = {'shot': e['id'], 'set': e['set'], 'frames': n, 'edl_frames': e['duration_frames'], 'handles': [h0, h1],
               'cost_class': cls, 'spf': c['spf'], 'spf_range': c['range'], 'kind': c['kind'], 'mode': e['render']['mode'],
               'hours_1browser': n * c['spf'] / 3600, 'hours_low': n * c['range'][0] / 3600, 'hours_high': n * c['range'][1] / 3600}
        rows.append(row)
        if n == 0:
            continue
        # set timeline: every shot starts on a whole second, 1 s after the previous one (incl. handles), so the
        # shutter-open sample of a first frame never falls into another shot
        start_s = set_cursor.get(e['set'], 0)
        set_cursor[e['set']] = int(math.ceil(start_s + n / FPS + 1.0))
        cf = chunk_frames(c['spf'])
        out = f'output/preview-s01e01/{e["id"]}'
        scene = SETS[e['set']]['scene']
        cine = 'hero' if e['render']['mode'] == 'accumulate8' else 'velocity'
        cmd = (f'node render/render.mjs {scene} --preset final --cinematic {cine} --start {start_s} --seconds {n / FPS:.6f} '
               f'--workers 2 --chunk-seconds {cf / FPS:.4f} --bit-depth 10 --crf 12 --out {out}')
        jobs.append({'job': e['id'], 'shot': e['id'], 'set': e['set'], 'scene': scene, 'set_time_start_s': start_s,
                     'set_time_first_edl_frame': start_s * FPS + h0, 'frames': n, 'handles': [h0, h1],
                     'edl_start_frame': e['start_frame'], 'edl_end_frame': e['end_frame'],
                     'cinematic': cine, 'chunk_frames': cf, 'chunks': math.ceil(n / cf), 'spf_expected': c['spf'],
                     'hours_expected_1browser': round(n * c['spf'] / 3600, 3), 'out': out, 'command': cmd})

    # ------------------------------------------------------------ totals
    by_set = {}
    for r in rows:
        s = by_set.setdefault(r['set'], {'shots': 0, 'frames': 0, 'h': 0.0, 'lo': 0.0, 'hi': 0.0, 'classes': set()})
        s['shots'] += 1
        s['frames'] += r['frames']
        s['h'] += r['hours_1browser']
        s['lo'] += r['hours_low']
        s['hi'] += r['hours_high']
        if r['frames']:
            s['classes'].add(r['cost_class'])
    H = sum(r['hours_1browser'] for r in rows)
    LO = sum(r['hours_low'] for r in rows)
    HI = sum(r['hours_high'] for r in rows)
    rendered = sum(r['frames'] for r in rows)
    wall2 = H / TWO_WORKER_GAIN
    wall2_steady = H * STEADY_STATE / TWO_WORKER_GAIN
    wall_lo = LO * STEADY_STATE / TWO_WORKER_GAIN
    wall_hi = HI / TWO_WORKER_GAIN
    setup_h = len(jobs) * 2 * 75 / 3600 / TWO_WORKER_GAIN    # ~75 s browser start + scene build + first-frame compile per browser per job

    doc_jobs = {
        'schema': 'dragons-kingdom/preview-render-jobs v1',
        'generated_by': 'dragons-kingdom/episodes/s01e01/preview/tools/render_plan.py',
        'edl_sha_note': 'built from edl.json; re-run render_plan.py whenever edl.json changes',
        'run_from': 'dragons-kingdom/',
        'status': 'PLAN. The scene files listed here are not written yet (next step); do not start before the model-quality workflow has finished.',
        'rules': {
            'one_job_per_shot': 'so a finished shot stays valid when another shot is fixed later (render.mjs fingerprints the scene and every asset)',
            'set_timeline': 'each set scene lays its shots out on whole seconds with >= 1 s between them; the scene picks the shot for time t by round(t*24) against this table, so the motion-blur shutter-open sample of a first frame never falls into the previous shot',
            'handles': 'dissolve handles are included in frames (head first); the conform trims them',
            'chunks': 'chunk_frames keeps one chunk at about 25 min (at most ~30 min, the pass) of one browser; a restart loses at most the chunk each worker had in progress',
            'intermediate': '10-bit H.264 at CRF 12 (one more encode happens in the conform)',
        },
        'totals': {'jobs': len(jobs), 'frames_to_render': rendered, 'hours_1browser_first_frame_figures': round(H, 1),
                   'wall_hours_this_machine_2_workers': round(wall2, 1)},
        'jobs': jobs,
    }
    (PREVIEW / 'render-jobs.json').write_text(json.dumps(doc_jobs, indent=1) + '\n')

    # ------------------------------------------------------------ markdown
    o = []
    w = o.append
    w("# Dragon's Kingdom S01E01: work-in-progress preview, native 4K render plan")
    w('')
    w('> **Plan only.** Nothing has been rendered for this preview yet, and the scene files it names have not been written. '
      'Do not start until the model-quality workflow has finished: it owns `scenes/lib/creatures`, `humans`, `architecture`, `nature`, `props` and '
      '`scenes/lookdev`, and every render job fingerprints those files. '
      'The seconds-per-frame figures are style-frame measurements where they say MEASURED, and estimates derived from them everywhere else.')
    w('')
    w(f'Generated by `tools/render_plan.py` from `edl.json` ({edl["totals"]["tc"]}, {total} frames). The job list is in `render-jobs.json`.')
    w('')
    w('## The answer')
    w('')
    w(f'- **{rendered:,} frames to render at 3840x2160.** That is the {edl["totals"]["picture_frames_excluding_cards"]:,} picture frames minus the black P-01, '
      f'plus {sum(sum(r["handles"]) for r in rows)} dissolve-handle frames. The two cards, the captions, the title and the corner tag are drawn in the conform, not rendered.')
    w(f'- **About {H:.0f} hours of rendering for one browser** using the first-frame figures below (range {LO:.0f}-{HI:.0f} h).')
    w(f'- **With 2 workers on this 4-thread machine: about {wall2:.0f} hours ({wall2 / 24:.1f} days).** Expect {wall2_steady:.0f} h '
      f'if steady-state frames run {int(round((1 - STEADY_STATE) * 100))} % faster than first frames, which the pilot will measure. '
      f'The full range is {wall_lo:.0f}-{wall_hi:.0f} h. Browser start-up and scene setup add about {setup_h:.1f} h over {len(jobs)} jobs.')
    w(f'  - Two browsers do not halve the time on this machine. SwiftShader already spreads one browser across all 4 threads; '
      f'the README benchmark measured 0.466 frames/s for 1 browser and 0.511 for 2, a {TWO_WORKER_GAIN:.2f}x gain.')
    w(f'  - On **two separate machines** like this one, splitting the jobs by set brings it to about {H / 2 / TWO_WORKER_GAIN:.0f} h '
      f'({H / 2 / TWO_WORKER_GAIN / 24:.1f} days), or less on machines with more cores.')
    w('- **The look is native 4K throughout.** There is no `final-fast` upscale and no animation on twos.')
    w('  - All running footage uses the measured style-frame finish with velocity motion blur.')
    w('  - The pass (1E-03) uses 8 real sub-frames, because velocity blur assumes straight motion.')
    w('- **Biggest costs:** the birthing chamber, the sky and the riding grounds; see the table. '
      'The two sets with no measurement, BIRTHING_CHAMBER and SKY_OFF_VERDOR, are over half the total. Measuring them in the pilot is the first thing to do.')
    w('')
    w('## Per set')
    w('')
    w('| Set | Shots | Frames to render | s per 4K frame | Basis | Hours (1 browser) | Range |')
    w('|---|---:|---:|---|---|---:|---|')
    for sname in ['CARD_BLACK', 'SEA_COAST_DAWN', 'PROLOGUE_VISTAS', 'VERDOR_GROUNDS', 'BIRTHING_CHAMBER', 'SKY_OFF_VERDOR']:
        s = by_set.get(sname)
        if not s:
            continue
        cls = sorted(s['classes'])
        spf = ', '.join(f'{COST[c]["spf"]:g} ({c})' for c in cls) or '0'
        kinds = ', '.join(sorted({COST[c]['kind'] for c in cls})) or 'NO RENDER'
        w(f'| {sname} | {s["shots"]} | {s["frames"]:,} | {spf} | {kinds} | {s["h"]:.1f} | {s["lo"]:.1f}-{s["hi"]:.1f} |')
    w(f'| **Total** | {len(shots)} | **{rendered:,}** | | | **{H:.1f}** | {LO:.1f}-{HI:.1f} |')
    w('')
    w('Where each figure comes from:')
    w('')
    for k, c in COST.items():
        if k == 'none':
            continue
        w(f'- **{k}: {c["spf"]:g} s, {c["kind"]}** (range {c["range"][0]:g}-{c["range"][1]:g} s). {c["basis"]}')
    w('')
    w('All figures are for the **first frame of a fresh browser**, shader compilation included, which is how the README measured them. '
      'Steady-state frames should be cheaper. This machine also had other render jobs running during those measurements.')
    w('')
    w('## Scene files and libraries per set')
    w('')
    w('Each set becomes one shot-driven scene in `episodes/s01e01/preview/scenes/` (to be written in the next step).')
    w('')
    w('- **Camera, lens, timing and blocking** come from `edl.json` through a generated shot table (`scenes/<set>.shots.json`). '
      'The scene loads it in `setup()`, so render jobs fingerprint it.')
    w('- **`update(t)`** looks up the shot by `round(t*24)` in its own set timeline, then poses everything for `t`, as a pure function of `t`.')
    w('- **The look** is the style frame\'s look (`filmFinish`), rendered with `--cinematic velocity`.')
    w('')
    for sname, s in SETS.items():
        ids = [r['shot'] for r in rows if r['set'] == sname]
        w(f'### {sname}')
        w('')
        w(f'- **Scene:** `{s["scene"]}`, built from `{s["from"]}`.')
        w(f'- **Shots:** {ids[0]} ... {ids[-1]} ({len(ids)} shots). ' + ', '.join(ids))
        w('- **Libraries:** ' + '; '.join(f'`{x.split(" ")[0]}`' + (' ' + ' '.join(x.split(' ')[1:]) if ' ' in x else '') for x in s['libs']) + '.')
        w('')
    w('CARD_BLACK (P-01) and the two WORK IN PROGRESS cards are generated by ffmpeg in the conform. '
      'They use `color=black` plus `drawtext` with Liberation Serif (SIL OFL 1.1) or DejaVu Serif (Bitstream Vera license), both system fonts. '
      'Add the font used to `LICENSES.md` when the conform is built.')
    w('')
    w('## Cheapest tricks that keep the look')
    w('')
    w('Only tricks that change nothing visible are in this list. Each one is checked with an A/B still before it is used: '
      'render one frame both ways at 4K and compare. A difference anyone could see means the trick is dropped.')
    w('')
    w('1. **Velocity motion blur instead of 8 sub-frames for running footage.** This is already in the figures above.')
    w('   - Measured: F1 went from 39 s to 12.7 s and F2 from 253 s to 50.7 s per frame, with the same grade, grain and lens.')
    w('   - Only 1E-03 keeps 8 sub-frames, because its curved high-speed pass would blur wrongly with velocity blur.')
    w('2. **Do not render what is not 3D.** P-01 black, both cards, the five place captions, the title, the corner tag and every dissolve are done in the conform.')
    w(f'   - That saves {edl["events"][0]["duration_frames"] + edl["events"][-1]["duration_frames"] + next(e for e in shots if e["id"] == "P-01")["duration_frames"]} frames.')
    w('   - A text change never forces a re-render.')
    w('3. **Shadow cache (`ctx.shadows`) on locked-off shots.** It is bit-identical by construction (`npm test`).')
    w('   - The chamber is locked off in 28 of its 35 shots, and the riding grounds in most of 1B. Static walls, terrain, the nest and the grounded dragons\' bodies are drawn into the shadow map once per shot.')
    w('   - Only moving casters go in `dynamic`: breathing flanks, people, the hatchling.')
    w('   - Measured saving: 50-90 ms per frame in test-kingdom, more where there is more static geometry. That is small (~2-4 %) but free.')
    w('4. **Grass LOD by distance.** F2 draws all 77k tufts in three layers in every frame (`grass.js` has no LOD; each layer is one instanced mesh).')
    w('   - Split each layer into distance tiles with `dk/instancing.js` tiled instancing, so off-screen tiles are skipped. That trick took the test-kingdom forest from 570 to 190 ms per draft frame.')
    w('   - Beyond ~40 m, use a 3-blade tuft instead of a 7-12-blade one. A 4K pixel covers several blades there, and the blades\' sky-bent normals keep the shading the same.')
    w('   - Expected saving: 15-25 % on the grounds shots, the biggest single saving available (to be measured). It must pass an A/B still at the 1B-02 end frame and the 1C-01 low angle.')
    w('5. **Switch off what a shot cannot see.**')
    w('   - Shots facing inland, and every chamber shot, skip `ocean.update(t)`: 125 ms of CPU for the FFT, twice with velocity blur.')
    w('   - They also skip the ocean late pass (about 1 s per 4K frame when water fills the view).')
    w('   - Sets that are behind the camera are left out of the scene graph for that shot.')
    w('   - Nothing visible changes, because the camera cannot see them. Check reflections: the ocean reflects only what is on screen anyway.')
    w('6. **Render the sky background once, only where nothing in it moves.**')
    w('   - Most locked-off shots do not qualify. The sea moves, the clouds drift, grain changes every frame, the window-shaft fog drifts, and depth of field and fog need the full depth buffer.')
    w('   - The runtime has no plate-plus-holdout compositing today, so this trick is **not used**. Adding it would need a runtime change and its own bit-exact test.')
    w('   - The sky is already cheap: it is drawn last, so only uncovered pixels pay for it.')
    w('7. **One browser setup per shot job, two browsers per job.** Both browsers take chunks from the same shot, so the scene builds (up to ~45 s for the heavy sets) are paid twice per shot, not per chunk.')
    w('8. **Measure before committing.** The pilot (below) replaces the estimates with steady-state numbers, and the plan is recomputed with `render_plan.py`.')
    w('')
    w('Rejected because they change the look:')
    w('')
    w('- `final-fast`: renders at 1440p and upscales.')
    w('- `--twos`: stylises the motion and freezes the grain on pairs of frames.')
    w('- Fewer depth-of-field or motion-blur taps.')
    w('- Lower fog-froxel resolution: visible blocks in the light shafts at 4K.')
    w('- Smaller shadow maps.')
    w('- Lowering the ocean cascade resolution: needs an A/B test first and is not counted.')
    w('')
    w('## Job and chunk layout (a restart loses at most one chunk per worker)')
    w('')
    w(f'- **One `render.mjs` job per shot: {len(jobs)} jobs.** Each job has its own folder in `output/preview-s01e01/<shot>/`; `output/` is git-ignored.')
    w('  - A finished shot stays valid when another shot is fixed later.')
    w('  - Editing a scene or asset invalidates only the jobs that have not finished, and `render.mjs` refuses to mix versions inside one video.')
    w('- **Set timeline.** Inside its set scene, each shot starts on a whole second, at least 1 s after the previous shot plus its handles.')
    w('  - `--start` is that whole second and `--seconds` is frames/24, so `render.mjs`\'s rounding gives exactly the planned frames.')
    w('  - Choosing the shot by `round(t*24)` keeps the shutter-open sample of each frame (t - 1/96 s) inside the right shot.')
    w('- **Chunks.** 2 s chunks (48 frames) for shots under 20 s per frame, 1 s (24 frames) up to 100 s per frame, and 0.5 s (12 frames) for the pass.')
    longest = max(jobs, key=lambda j: (j['chunk_frames'] * j['spf_expected'], j['shot']))
    w(f'  - Chunks are sized to about 25 minutes of one browser\'s work; the longest is {longest["shot"]}, '
      f'{longest["chunk_frames"]} frames at {longest["spf_expected"]:g} s = {longest["chunk_frames"] * longest["spf_expected"] / 60:.0f} minutes.')
    w('  - `render.mjs` encodes each chunk, decodes it completely to check it, records its size and SHA-1, and only then marks it done.')
    w('  - **If the container restarts, run the same queue command again.** Finished jobs are skipped, and the interrupted job re-renders only the chunks that were not finished and verified. '
      'Each chunk is checked on its own, so one that finished out of order is kept.')
    w('  - At most the chunk each of the 2 workers had in progress is lost: 2 x 24 frames on the chamber, about 20 minutes.')
    w('- **Workers.** `--workers 2` per job.')
    w('  - Each 4K browser needs about 2.6 GB on test-kingdom; the heavy sets need more (the pilot measures it).')
    w('  - If two browsers do not fit in the 15 GB, use `--workers 1` and lose about 9 % of the throughput.')
    w('- **Output format.** Intermediates are written with `--bit-depth 10 --crf 12`: High 10, so smooth skies survive the second encode in the conform. '
      f'Expect roughly 4-8 GB for all shots, since film grain is expensive to encode. Check `df` first.')
    w('- **Order.**')
    w('  1. Pilot: 24 frames each of P-03, 1A-04, 1A-28, 1B-02, 1D-10 and 1E-03, with `--timing` on one frame each. These measure steady-state seconds per frame and peak RAM.')
    w('  2. Recompute this plan.')
    w('  3. Render all jobs in EDL order, so a partial render is always a watchable beginning.')
    w('- The queue runner (next step) reads `render-jobs.json`. It runs each `command` from `dragons-kingdom/`, skips jobs whose `<shot>.mp4` exists and passes `ffprobe`, '
      'and logs the s/frame of every job back into the plan.')
    w('')
    w('Example: the first job of each set.')
    w('')
    w('```')
    seen = set()
    for j in jobs:
        if j['set'] in seen:
            continue
        seen.add(j['set'])
        w(j['command'])
    w('```')
    w('')
    w('## Conform (after the shots exist)')
    w('')
    w('1. **Picture.** One ffmpeg pass builds the timeline from `edl.json`:')
    w('   - Trim each shot\'s handles. Use `xfade` for the prologue dissolves (centred on the cut) and fade P-02 in from black.')
    w('   - Generate P-01 black and the two cards.')
    w('   - Draw the captions, the title and the corner tag with `drawtext`, using the EDL frames and fades.')
    w('   - Encode once, in two versions:')
    w('     - an 8-bit CRF 16 master that plays everywhere;')
    w('     - a 10-bit CRF 16 master for YouTube.')
    w('   - x264 at 4K runs at a few frames per second here, so allow 1-2 h.')
    w('2. **Sound.** The mix places each take at `take_start_frame x 2000` samples.')
    l3 = next(l for l in edl['lines'] if l['id'] == 'L003')
    w(f'   - L003 goes in as its {len(l3["parts"])} parts at their `timeline_frame`s (`edl.json` lines, `parts`), with 5 ms fades at each cut. '
      'Gains and spaces come from `takes.json`, with the beds, cues and music from `edl.json`.')
    w('   - The master is 48 kHz, 24-bit and exactly `frames x 2000` samples, loudness-normalised as in `audio-plan.md`. It is muxed as AAC 256k, with the video stream copied.')
    w('3. **Subtitles.** A soft English track is generated from `edl.json` line times and `dialogue.json` `subtitle_cues`.')
    w(f'4. **Checks.** The video is exactly {total} frames at 24 fps and 3840x2160, and the audio is exactly {total * 2000:,} samples.')
    w('   - Extract stills at every cut, at frames 0-71 (the card) and at the last 96 frames.')
    w('   - Re-run `check_edl.py`.')
    w('')
    w('## What does not exist yet (honest substitutes are in edl.md)')
    w('')
    counts = {}
    for e in shots:
        for n in e['needs']:
            counts[n['status']] = counts.get(n['status'], 0) + 1
    w(f'- **Missing ({counts.get("missing", 0)} items).** The biggest gaps:')
    w('  - **Human body animation:** walking, sitting, standing up, bowing, mounting, climbing, the injury reaction. The humans library has baked poses and idle motion only.')
    w('  - **Charcoal\'s access rig.**')
    w('  - **The emergence soft-body.**')
    w('  - **Dust and turf effects** for the launch.')
    w('  - **A wing-shaped cloud.**')
    w('  - **A palace.**')
    w('  - **A second attendant.**')
    w(f'- **Small builds ({counts.get("small-build", 0)} items):**')
    w('  - Shader and pose tweaks: the closed egg, a growing crack, pose blends.')
    w('  - Simple props: a low step, a hero rope.')
    w('  - Extending the chamber for wide shots.')
    w('  - Non-verbal breaths and the cry.')
    w(f'- **Exists but is being reworked ({counts.get("exists-wip", 0)} items).** Every creature and person is still being improved by the model-quality workflow. '
      'Several human caches (`abby_ride`, `remi_ride`, `alexandria`, `keeper1`) were absent while that workflow was rebuilding them.')
    w('')
    w('## Risks')
    w('')
    w('- **The estimates are unmeasured for the two largest sets.** The chamber and the sky could each move the total by ±20 h. The pilot settles this.')
    w('- **The scene files are not written yet.** They are a sizeable piece of work, mostly assembling existing pieces per shot.')
    w('- **Faces are deliberately unreadable.** Every line is staged without a readable mouth, and five face beats are carried by the body. '
      'This is the right call while lip-sync does not exist, but the preview will feel more distant than the finished episode should.')
    w('- **The machine is shared.** The model-quality workflow runs heavy jobs, and these figures assume the CPU is free.')
    w('')
    (PREVIEW / 'render-plan.md').write_text('\n'.join(o))
    print(f'render-plan.md: {rendered} frames, {H:.1f} h (1 browser, first-frame figures), ~{wall2:.0f} h wall with 2 workers '
          f'({wall_lo:.0f}-{wall_hi:.0f} h); {len(jobs)} jobs')


if __name__ == '__main__':
    main()
