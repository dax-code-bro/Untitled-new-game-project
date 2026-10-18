#!/usr/bin/env python3
"""Write final/render-schedule.md and final/render-jobs.json from final/shotlist.json.

Native 4K masters only (SERIES.md section 2: --preset final on every frame; no final-fast, no --twos). Seconds per
frame come from final/shotlist.json (native_4k_s_per_frame: MEASURED style-frame figures and estimates derived from
them, see final_build.py SPF). Nothing here is measured on the final sets yet: the pilot replaces the estimates.
All speeds are from the CPU-only cloud machine; Daxtyn decided on 2026-10-18 that the masters render on his own PC's
graphics card (OS and GPU not known yet), so the page says these figures are an upper bound until his PC is measured.

Usage: python3 tools/shotlist/final_render_schedule.py [--check]
"""
import json
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
EP = os.path.normpath(os.path.join(HERE, '..', '..'))
SHOTLIST = os.path.join(EP, 'final', 'shotlist.json')
OUT_MD = os.path.join(EP, 'final', 'render-schedule.md')
OUT_JOBS = os.path.join(EP, 'final', 'render-jobs.json')
FPS = 24

TWO_BROWSER_GAIN = 1.10           # MEASURED (README benchmark): 0.466 fps with 1 browser, 0.511 with 2
SETUP_S = {                       # MEASURED style frames, round 4: total incl. scene build minus render (s)
    'SEA_COAST_DAWN': 20, 'PROLOGUE_VISTAS': 20, 'VERDOR_GROUNDS': 106, 'RIDING_SCHOOL_FIELD': 106, 'SANTA_MARIA_DECK': 106,
    'SKY_OFF_VERDOR': 104, 'COASTAL_SKY_WATER': 104, 'OUTER_ROCKS': 104, 'BIRTHING_CHAMBER': 96, 'ALEXANDRIA_ROOM': 96,
    'PALACE_CORRIDOR': 96, 'TREATMENT_ROOM': 96, 'VERDOR_AERIAL': 102, 'VERDOR_HARBOR': 102, 'CLING_SQUARE': 102,
    'CLING_ROAD': 102, 'CLING_SKY': 102, 'CARD_BLACK': 0}
MB_PER_FRAME_SHOT = (0.28, 0.56)  # ESTIMATE (preview/render-plan.md): 10-bit CRF 12 intermediates with film grain
MB_PER_FRAME_MASTER = (0.15, 0.30)  # ESTIMATE: 10-bit or 8-bit CRF 16 scene/episode masters (~29-58 Mbit/s at 4K24)
CHUNK_FRAMES = (48, 24, 12, 6)    # 2, 1, 0.5, 0.25 s
CHUNK_BUDGET_S = 1500             # aim: one chunk = at most ~25 min of one browser's work

# What has to exist before each delivery can render (ids from final/assets-delta.md).
PREREQ = {
    'PROLOGUE+TITLE': 'Nothing new: F1 style frame, the prologue vistas of the preview plan, the title egg.',
    '1A': 'S1 queen\'s room, S2 palace corridor; H1 young attendant, H2 two servants; P1 wine jug and cup; D4 Leaf\'s low crouch (X2); A1 walking and everyday actions.',
    '1B': 'S8 riding-grounds additions (stakes, rig runners); P2 clay pipe and ember, F4 pipe smoke; D4 Leaf low and level, D6 Charcoal lowering for mounting; A2 climbing the access rig.',
    '1C': 'S3 Verdor from the air, S4 outer rocks, S9a Cling morning state; D1 small working dragons, D2 young riders\' dragons; H3 lookout, H7 instructor, H8 young riders; P8 nets, slipway, fishing boats; F4 sweet pipe smoke; D7 seabird flocks, F8 downwash and spray at the rocks; D6 Charcoal\'s climb and dive; A3 quay and lesson behaviours.',
    '1D': 'Nothing new (head-in-mouth exists).',
    '1E': 'Nothing new (the pass renders with 8 sub-frames, 1E-03).',
    '1F': 'F1 blood (spray, decals, red stain in the sea), F2 burn on the rider, F3 the torn wing root with blood, F7 mist white-out, F8 downwash at the rocks, F10 sun glare; S5 Santa Maria deck; H4 ship\'s master, H5 crew (seated, dice); P3 ale jug, dice and cup.',
    '2A': 'F1 blood on Remi (state 1 to 2), D5 Charcoal\'s bloody jaw; H6 second keeper.',
    '2B': 'F1 Remi blood state 2 (hands, sleeves, hairline).',
    '2C': 'S6 riding-school field, S7 road outside Cling, S9b Cling midday state; H9 farm family (villager uninjured, partner, two small children), H10 old woman; D3 hatchling drinking and standing; D5 and D6 Charcoal\'s jaw washed, the saddle off, eating; P4 feed cart, P5 buckets and wet cloths, P6 spades and turf, P7 ship\'s boat, poles, sail set; F1 pink water, red runoff, membrane strip; F9 sail filling, gull swoop; A4 children\'s dance lesson.',
    '3A': 'P9 festival table, honey cakes, cups and jugs, upturned crate, the king\'s plain seat; A4 children\'s dance, A5 table and singing behaviours, toast.',
    '3B': 'Nothing new beyond 3A (Starlight from F5; X24 high view).',
    '3C': 'F6 roofline collapse and breaking music stage, F1 blood on paving and a wall smear, F3 the villager\'s split scalp and open fracture; H11 escort guard (no lines, distinct), H12 the dead (adult bodies, lying and covered); A6 evacuation on two routes, falls, stunt (R16b).',
    '3D': 'S9c Cling after the attack (dust, wreckage, the dead laid out below the steps); H12 covered dead, P10 broken instrument, P11 banner-pole splint; A7 survivors, carrying the injured, searching.',
    'END': 'Text only (credits from the real contributors and licences).',
}


def main(argv):
    d = json.load(open(SHOTLIST, encoding='utf-8'))
    shots = d['shots']
    group = lambda c: 'PROLOGUE+TITLE' if c in ('PROLOGUE', 'TITLE') else c
    jobs = []
    for s in shots:
        spf = s['native_4k_s_per_frame']
        frames = s['frames_at_24fps']
        if s['render'] != '3d':
            chunk = None
        else:
            chunk = next((c for c in CHUNK_FRAMES if c * spf['expected'] <= CHUNK_BUDGET_S), CHUNK_FRAMES[-1])
        hours = frames * spf['expected'] / 3600.0
        jobs.append({
            'job': s['id'], 'seq': s['seq'], 'scene': group(s['scene']), 'part': s['part'], 'set': s['set'],
            'render': s['render'], 'frames': frames, 'seconds': s['est_seconds'],
            's_per_frame': spf['expected'], 's_per_frame_range': [spf['low'], spf['high']], 'basis': spf['basis'],
            'chunk_frames': chunk, 'chunk_seconds': (chunk / FPS) if chunk else None,
            'chunks': math.ceil(frames / chunk) if chunk else 0,
            'hours_1_browser': round(hours, 3),
            'setup_s': SETUP_S.get(s['set'], 100) if s['render'] == '3d' else 0,
            'sub_frames': 8 if s['id'] == '1E-03' else None,
            'command': None if s['render'] != '3d' else (
                'node render/render.mjs episodes/s01e01/final/scenes/%s.js --preset final --cinematic %s --start <shot start, s> '
                '--seconds %.6f --workers 2 --chunk-seconds %.4f --bit-depth 10 --crf 12 --out output/s01e01/%s/%s' % (
                    s['set'].lower().replace('_', '-'), 'film' if s['id'] == '1E-03' else 'velocity', frames / FPS, chunk / FPS,
                    group(s['scene']), s['id'])),
        })
    scenes = []
    t_start = 0.0
    for r in d['scene_totals']:
        js = [j for j in jobs if j['scene'] == r['scene']]
        fr = sum(j['frames'] for j in js)
        fr3d = sum(j['frames'] for j in js if j['render'] == '3d')
        h = sum(j['frames'] * j['s_per_frame'] for j in js) / 3600
        h_lo = sum(j['frames'] * j['s_per_frame_range'][0] for j in js) / 3600
        h_hi = sum(j['frames'] * j['s_per_frame_range'][1] for j in js) / 3600
        h_loose = h_hi * (r['high_s'] / r['expected_s']) if r['expected_s'] else 0
        setup_h = sum(j['setup_s'] for j in js) / 3600
        wall = (h / TWO_BROWSER_GAIN) + setup_h
        sets = {}
        for j in js:
            sets.setdefault(j['set'], [0, 0.0])
            sets[j['set']][0] += j['frames']
            sets[j['set']][1] += j['frames'] * j['s_per_frame'] / 3600
        scenes.append({
            'scene': r['scene'], 'title': r['title'], 'start_s': t_start, 'expected_s': r['expected_s'],
            'low_s': r['low_s'], 'high_s': r['high_s'], 'shots': len(js), 'jobs': sum(1 for j in js if j['render'] == '3d'),
            'frames': fr, 'frames_3d': fr3d, 'mean_s_per_frame': (h * 3600 / fr3d) if fr3d else 0,
            'hours_1_browser': h, 'hours_range': [h_lo, h_hi], 'hours_loose_cut_worst': h_loose, 'setup_h': setup_h,
            'wall_h_2_browsers': wall, 'wall_days': wall / 24,
            'disk_shots_gb': [fr3d * m / 1024 for m in MB_PER_FRAME_SHOT],
            'disk_master_gb': [fr * m / 1024 for m in MB_PER_FRAME_MASTER],
            'max_chunk_min': max([(j['chunk_frames'] or 0) * j['s_per_frame'] / 60 for j in js] + [0]),
            'sets': sets, 'prereq': PREREQ.get(r['scene'], ''),
        })
        t_start += r['expected_s']
    T = {k: sum(s[k] for s in scenes) for k in ('frames', 'frames_3d', 'hours_1_browser', 'setup_h', 'wall_h_2_browsers', 'hours_loose_cut_worst')}
    T['hours_lo'] = sum(s['hours_range'][0] for s in scenes)
    T['hours_hi'] = sum(s['hours_range'][1] for s in scenes)
    by_set = {}
    for j in jobs:
        b = by_set.setdefault(j['set'], {'shots': 0, 'frames': 0, 'hours': 0.0, 's_per_frame': j['s_per_frame'], 'basis': j['basis']})
        b['shots'] += 1
        b['frames'] += j['frames']
        b['hours'] += j['frames'] * j['s_per_frame'] / 3600
    meta = {
        'status': 'PLAN ONLY. Nothing of the final script has been rendered. Seconds per frame are MEASURED style-frame figures and estimates derived from them; the pilot measures the real sets.',
        'source': 'episodes/s01e01/final/shotlist.json', 'source_sha256': d['meta']['source_sha256'],
        'generated_by': 'episodes/s01e01/tools/shotlist/final_render_schedule.py',
        'rules': ['Native 3840x2160, --preset final on every frame (SERIES.md section 2). No final-fast, no --twos, no draft/preview for masters.',
                  'One render.mjs job per shot; chunks sized so one chunk is at most ~25 min of one browser (a restart loses at most one chunk per browser).',
                  'Intermediates: 10-bit CRF 12. Conform per scene, verify, move the scene master off the machine, then delete that scene\'s shot files and chunk folders.'],
        'totals': {'frames': T['frames'], 'frames_3d': T['frames_3d'], 'hours_1_browser': round(T['hours_1_browser'], 1),
                   'hours_range': [round(T['hours_lo'], 1), round(T['hours_hi'], 1)], 'wall_hours_2_browsers': round(T['wall_h_2_browsers'], 1)},
    }
    jobs_json = json.dumps({'meta': meta, 'jobs': jobs}, indent=1, ensure_ascii=False) + '\n'
    md = build_md(d, scenes, by_set, T, jobs)
    if '--check' in argv:
        ok = all(os.path.exists(p) and open(p, encoding='utf-8').read() == c for p, c in ((OUT_MD, md), (OUT_JOBS, jobs_json)))
        print('up to date' if ok else 'STALE: final/render-schedule.md or final/render-jobs.json')
        return 0 if ok else 1
    open(OUT_MD, 'w', encoding='utf-8').write(md)
    open(OUT_JOBS, 'w', encoding='utf-8').write(jobs_json)
    print('render schedule: %d frames (%d 3D); %.0f h one browser (%.0f-%.0f); %.0f h wall with 2 browsers = %.0f days' % (
        T['frames'], T['frames_3d'], T['hours_1_browser'], T['hours_lo'], T['hours_hi'], T['wall_h_2_browsers'], T['wall_h_2_browsers'] / 24))
    return 0


def build_md(d, scenes, by_set, T, jobs):
    mm = lambda x: '%d:%02d' % (int(round(x)) // 60, int(round(x)) % 60)
    W = []
    w = W.append
    tot = d['totals']
    days = T['wall_h_2_browsers'] / 24
    shot_gb = [T['frames_3d'] * m / 1024 for m in MB_PER_FRAME_SHOT]
    master_gb = [T['frames'] * m / 1024 for m in MB_PER_FRAME_MASTER]
    w("# Dragon's Kingdom S01E01: native 4K render schedule for the locked shooting script")
    w('')
    w('> **Plan only.** Nothing of the final script has been rendered. The seconds per frame are measured on the five style frames and estimated from them for the other sets; nobody has rendered a frame of the new sets yet. Every figure here is an estimate until the pilot (step 1 below) measures the real scenes. Made by `tools/shotlist/final_render_schedule.py` from `shotlist.json`; the per-shot job list is `render-jobs.json`.')
    w('')
    w('> **Where the masters will render (Daxtyn\'s decision, 18 October 2026).** The final 4K masters will render on Daxtyn\'s own gaming PC, on its graphics card, not on this CPU-only cloud machine. Its operating system and graphics card are not known yet: Windows 10/11 is the most likely, and macOS and Linux are to be supported too. Every hour and day figure below was measured or estimated on this 4-vCPU machine without a GPU (SwiftShader), so it is a CPU-only upper bound, not a forecast for his PC, and the disk plan is written for the 15 GB free here. Before planning his render, run the pilot (step 1) on his PC with the renderer\'s `--gpu` option, put the measured seconds per frame into `final_build.py` (`SPF`) and rebuild this schedule.')
    w('')
    w('## The answer')
    w('')
    w('- **%s frames** at 24 fps for the expected %s cut (%d shots; %s frames are 3D, the rest are black or text cards made in the conform).' % (
        format(T['frames'], ','), mm(tot['expected_s']), tot['shots'], format(T['frames_3d'], ',')))
    w('- **About %s hours of rendering for one browser** at native 4K (range %s-%s h from the per-set seconds per frame; up to %s h if the loose cut and the slow end both happen).' % (
        format(round(T['hours_1_browser']), ','), format(round(T['hours_lo']), ','), format(round(T['hours_hi']), ','), format(round(T['hours_loose_cut_worst']), ',')))
    w('- **On this one machine (4 vCPU, no GPU), two browsers: about %s hours of wall-clock time, about %.0f days (%.1f months) of continuous rendering**, scene setup included. Two browsers do not halve the time here: SwiftShader already uses all four threads, and the README benchmark measured only a %.2fx gain for the second browser.' % (
        format(round(T['wall_h_2_browsers']), ','), days, days / 30.4, TWO_BROWSER_GAIN))
    w('- **Why so much more than the old "43-70 hours":** that figure used the speed of the simple benchmark scene (0.37-0.50 frames per second). The real sets are much heavier. The five style frames, rendered at 4K on this machine, took 131-822 s per frame with the 8-sub-frame film finish, which is about 26-270 s per frame with velocity motion blur. Cling, the heaviest set, is about a third of the episode.')
    w('- **Disk:** the 10-bit intermediates of the whole episode would take about %.0f-%.0f GB, and a finished 4K master about %.0f-%.0f GB, against about 15 GB free here. So the episode is rendered, checked and delivered **one scene at a time** (largest scene: %.1f-%.1f GB of intermediates), and the full-episode join happens on a drive with room for both the scene files and the master.' % (
        shot_gb[0], shot_gb[1], master_gb[0], master_gb[1], max(s['disk_shots_gb'][0] for s in scenes), max(s['disk_shots_gb'][1] for s in scenes)))
    w('- **What would make it faster without changing the look:** a second (or third) machine taking whole scenes (the job list splits cleanly by scene); a machine with a real graphics card (`--gpu`, never measured here); the free tricks in `../preview/render-plan.md` ("Cheapest tricks that keep the look": grass LOD, skipping the ocean where it cannot be seen, the shadow cache), each checked with an A/B still. `final-fast` and `--twos` are not allowed for masters (`SERIES.md` section 2); they are fine for the animatic and for previews, which must be labelled as previews.')
    w('')
    w('## Seconds per 4K frame, by set')
    w('')
    w('MEASURED anchors on this machine (`../style-frames/README.md`, `scenes/lib/sets/PROGRESS.md`, round 4, `--preset final`, 8-sub-frame film finish): F1 prologue 47.8 s (shared machine), F2 riding grounds 434.7 s, F3 flight 131.0 s, F4 birthing chamber 428.7 s, F5 Cling square 821.5 s per frame. Masters use velocity motion blur instead of 8 sub-frames (same lens, grade and grain): that was MEASURED at 0.20x on F2 (253 to 50.7 s) and 0.33x on F1 (39 to 12.7 s) (`../preview/render-plan.md`). So: F1 sets use the measured 12.7-16 s; F2 sets 0.20x (the ratio measured on F2); F3-F5 sets 0.25x, with 0.20x and 0.33x as the range. The pass (1E-03) keeps 8 sub-frames (MEASURED F3: 131 s). Shots with dust, destruction, fog or a crowd outside Cling get x1.10-1.25.')
    w('')
    w('| Set | Shots | Frames | s per 4K frame | Hours (1 browser) | Basis |')
    w('|---|---:|---:|---:|---:|---|')
    for k, b in sorted(by_set.items(), key=lambda kv: -kv[1]['hours']):
        w('| %s | %d | %s | %s | %.1f | %s |' % (k, b['shots'], format(b['frames'], ','), ('%g' % b['s_per_frame']) if b['shots'] else '', b['hours'], b['basis']))
    w('| **Total** | %d | %s | | **%.0f** | |' % (sum(b['shots'] for b in by_set.values()), format(T['frames'], ','), T['hours_1_browser']))
    w('')
    w('(Per-shot multipliers mean a set\'s shots can differ from the figure in this table; `render-jobs.json` has each job\'s own figure.)')
    w('')
    w('## Per scene, in delivery order')
    w('')
    w('Each scene is a delivery: it is rendered, conformed with its sound, checked end to end and sent to Daxtyn before the next one starts, so finished scenes reach him one by one and a partial render is always a watchable beginning.')
    w('')
    w('| # | Scene | Starts | Length | Shots / jobs | Frames | Mean s/frame | Render h (1 browser) | Range h | Wall h (2 browsers) | Days | Intermediates GB | Scene master GB |')
    w('|---:|---|---:|---:|---:|---:|---:|---:|---|---:|---:|---|---|')
    for i, s in enumerate(scenes, 1):
        w('| %d | %s: %s | %s | %s | %d / %d | %s | %.0f | %.0f | %.0f-%.0f | %.0f | %.1f | %.1f-%.1f | %.1f-%.1f |' % (
            i, s['scene'], s['title'], mm(s['start_s']), mm(s['expected_s']), s['shots'], s['jobs'], format(s['frames'], ','),
            s['mean_s_per_frame'], s['hours_1_browser'], s['hours_range'][0], s['hours_range'][1], s['wall_h_2_browsers'], s['wall_days'],
            s['disk_shots_gb'][0], s['disk_shots_gb'][1], s['disk_master_gb'][0], s['disk_master_gb'][1]))
    w('| | **Total** | | **%s** | **%d / %d** | **%s** | | **%.0f** | %.0f-%.0f | **%.0f** | **%.0f** | %.0f-%.0f | %.0f-%.0f |' % (
        mm(tot['expected_s']), tot['shots'], sum(s['jobs'] for s in scenes), format(T['frames'], ','), T['hours_1_browser'], T['hours_lo'], T['hours_hi'],
        T['wall_h_2_browsers'], T['wall_h_2_browsers'] / 24, shot_gb[0], shot_gb[1], master_gb[0], master_gb[1]))
    w('')
    w('Wall hours = render hours / %.2f (two browsers) + one scene setup per job (MEASURED on the style frames: 20 s on the sea, 96-106 s on the heavy sets). Disk: intermediates %.2f-%.2f MB per frame (10-bit CRF 12 with film grain, ESTIMATE from the preview plan); masters %.2f-%.2f MB per frame (CRF 16, about 29-58 Mbit/s, ESTIMATE). The pilot measures both.' % (
        TWO_BROWSER_GAIN, MB_PER_FRAME_SHOT[0], MB_PER_FRAME_SHOT[1], MB_PER_FRAME_MASTER[0], MB_PER_FRAME_MASTER[1]))
    w('')
    w('## Build and render order')
    w('')
    w('1. **Pilot (about 2-3 days).** Before any scene: render 24 frames of one typical shot from every set that exists or is built next (the five style-frame sets first), with `--timing` on one frame each, at native 4K. Record the steady-state seconds per frame and the peak memory, put them into `final_build.py` (`SPF`), and rebuild this schedule. Check that two browsers fit in memory on the heavy sets (each 4K browser needs about 2.6 GB on the benchmark; Cling needs more); if not, use `--workers 1` and lose about 9 %% of the throughput.')
    w('2. **Build what the next delivery needs, then render it.** The ids are the items in `assets-delta.md`. Build work and rendering overlap: while one scene renders (CPU-bound, both browsers), the next scene\'s sets and animation are written and checked at draft and preview size, which costs little CPU.')
    w('3. **Deliver in story order:**')
    w('')
    for i, s in enumerate(scenes, 1):
        sets = ', '.join('%s (%s frames)' % (k, format(v[0], ',')) for k, v in sorted(s['sets'].items(), key=lambda kv: -kv[1][0]))
        w('   %d. **%s: %s** (%s, %s frames, about %.1f days on this machine). Sets: %s. Build first: %s' % (
            i, s['scene'], s['title'], mm(s['expected_s']), format(s['frames'], ','), s['wall_days'], sets, s['prereq']))
    w('')
    w('4. **If a second machine is available**, give it whole scenes from the far end of the list (3A-3D, the heaviest: Cling) while this machine works from the start. The Cling square must be finished by delivery 4 anyway, because 1C (X5) and 2C (X14) visit it.')
    w('')
    w('## Job and chunk layout (a restart loses little)')
    w('')
    w('- **One `render.mjs` job per shot** (%d jobs; black and text cards are not rendered, they are made in the conform). Each job has its own folder, `output/s01e01/<scene>/<shot>/` (git-ignored). A finished shot stays valid when another shot is fixed later, and `render.mjs` refuses to mix versions inside one video.' % sum(1 for j in jobs if j['render'] == '3d'))
    w('- **Scene files** go in `episodes/s01e01/final/scenes/<set>.js` (to be written; the commands in `render-jobs.json` name them). Each set scene reads a generated shot table (camera, lens, blocking per shot) in `setup()` so jobs fingerprint it, and `update(t)` poses everything as a pure function of `t`, as in the preview plan.')
    w('- **Chunks:** 2 s (48 frames) where a frame takes under ~31 s, 1 s up to ~62 s, 0.5 s up to 125 s, and 0.25 s (6 frames) above that, so one chunk is at most about 25 minutes of one browser\'s work (the slowest, a dusty Cling shot, about %.0f minutes). `render.mjs` decodes and checksums every chunk before marking it done.' % max(s['max_chunk_min'] for s in scenes))
    w('- **After a restart or a crash, run the same command again.** Finished jobs are skipped, and an interrupted job re-renders only the chunks that were not finished and verified: at most one chunk per browser is lost.')
    w('- **Masters:** `--preset final --cinematic velocity --bit-depth 10 --crf 12 --workers 2` for every shot; 1E-03 keeps the 8-sub-frame film finish (`--cinematic film`). No `final-fast`, no `--twos` (`SERIES.md` section 2).')
    w('')
    w('## Disk plan (about 15 GB free on this machine)')
    w('')
    w('- **While a scene renders:** its shot files (largest scene %.1f-%.1f GB) plus the chunk folders of the shots in progress. Delete each shot\'s chunk folder as soon as its `.mp4` is verified (`SERIES.md` section 2).' % (max(s['disk_shots_gb'][0] for s in scenes), max(s['disk_shots_gb'][1] for s in scenes)))
    w('- **Conform the scene:** trim, cut and dissolve the shots, draw the captions, mux the scene\'s stereo mix and subtitles, write one scene master (10-bit, CRF 16), and check it from start to end (sound present, no black or repeated footage, faces and dragons consistent, continuity flags). Then copy the scene master off the machine and delete the scene\'s shot files.')
    w('- **The full episode** is joined from the scene masters with a stream copy (no re-encode). The joined master is about %.0f-%.0f GB, so the join needs a drive with room for the scene masters and the master at once, about %.0f-%.0f GB: not this machine. An 8-bit copy for playback anywhere and a 10-bit copy for YouTube are made from it there.' % (
        master_gb[0], master_gb[1], 2 * master_gb[0], 2 * master_gb[1]))
    w('- **Never commit** video, audio masters or chunk folders to git (`output/` is git-ignored).')
    w('')
    w('## Risks')
    w('')
    w('- **The estimates are not measured on the new sets.** Seven sets do not exist yet (see `assets-delta.md`), and the Cling estimate alone moves the total by hundreds of hours. The pilot settles it.')
    w('- **Months, not days.** On this one machine the episode is a %.0f-day render even if nothing goes wrong. Retakes (a fix found while checking a scene) add to it: plan about 1.3-1.5x the final pass for fixes on the hard shots (%d hard shots).' % (days, d['totals']['hard_shots']))
    w('- **Building comes first.** The bottleneck before any of this is building the %d new shots\' sets, people, dragons, effects and animation (`assets-delta.md`), not render hours.' % (tot['shots_by_origin']['addition'] + tot['shots_by_origin']['rating_pass']))
    w('- **The machine is shared.** Other workflows run heavy jobs here; these figures assume the CPU is free.')
    w('')
    return '\n'.join(W)


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
