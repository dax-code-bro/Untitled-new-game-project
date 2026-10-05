import json, os, re
HERE = os.path.dirname(__file__)
d = json.load(open(os.path.join(HERE, 'shotlist.snapshot.json')))
T = d['totals']; R = d['render_cost']; shots = d['shots']


def mmss(x):
    x = int(round(x)); return f'{x // 60}:{x % 60:02d}'


def h(x):
    return f'{x:.1f}'


FRIENDLY = {'HATCHLING_SOFTBODY': 'wet newborn hatchling', 'DUST': 'dust', 'DESTRUCTION': 'breaking ground/timber',
            'HEAD_IN_MOUTH': 'head-in-mouth', 'FAST_PASS': 'very fast pass', 'FACE_CLOSEUP': 'face close-up',
            'BODY_MECHANICS': 'body force', 'FIRE': 'fire', 'CREATURE_CONTACT': 'dragon-on-dragon contact',
            'WING_SEPARATION': 'wing tearing loose', 'WATER_IMPACT': 'water splash', 'CROWD': 'crowd',
            'WHITE_SCALES': 'white scales', 'SCALE': 'huge size', 'CLOTH': 'cloth', 'OCEAN': 'sea',
            'GOLD_MATERIAL': 'gold scales', 'LIPSYNC': 'lip-sync', 'SMOKE': 'smoke'}


def short(action, n=150):
    action = re.sub(r"^(Festival bell\. )?(ON-SCREEN LOCATION: [^.]*\. )?", '', action)
    action = re.sub(r"^[A-Z][A-Z\-' ]{3,}(\([^)]*\))?[.:,]\s*(one readable wide:\s*)?", '', action)
    action = action[0].upper() + action[1:] if action else action
    sents = re.split(r'(?<=[.!?])\s+', action)
    out = ''
    for s_ in sents:
        if len(out) + len(s_) > n and out:
            break
        out = (out + ' ' + s_).strip()
    if len(out) > n:
        out = out[:n - 3].rstrip() + '...'
    return out.replace('|', '/')


def line_range(dl):
    ids = [x['id'] for x in dl]
    ids = list(dict.fromkeys(ids))
    if not ids:
        return ''
    return ids[0] if len(ids) == 1 else f'{ids[0]}-{ids[-1]}'


sc = {r['scene']: r for r in d['scene_totals']}
sh = R['scenarios_hours_one_pass']
cx = R['complexity_adjusted_GUESS']
hardest = [s for s in shots if s['difficulty'] == 5]
L = []
w = L.append

w("# Dragon's Kingdom, Episode 1: shot list and honest runtime")
w('')
w('**This is a plan. Nothing has been rendered yet.** It splits the screenplay into individual camera shots and estimates how long each one runs. The full data for the build is in `shotlist.json`.')
w('')
w('## The short answer')
w('')
w(f"- **Expected length: about {round(T['expected_s'] / 60)} minutes** ({mmss(T['expected_s'])}). Realistic range: **{mmss(T['low_s'])} to {mmss(T['high_s'])}**.")
w(f"- The screenplay's schedule says 50 minutes. The story as written fills about **half** of that ({T['expected_vs_target_pct']}%).")
w(f"- That is not a problem with the story. It is simply how much happens in it:")
w(f"  - **{T['spoken_lines']} spoken lines** ({T['spoken_words']} words). Most are short, about 5 words each. At a natural pace that is about **{mmss(T['spoken_speech_only_s'])}** of pure speech, or **{mmss(T['dialogue_s'])}** with the small gaps between lines. Line numbers L001-L198 and speech times match `dialogue.json`.")
w(f"  - **Action and pictures** (hatching, take-off, flying, the chase, the attack, the aftermath): about **{mmss(T['action_s'])}**.")
w(f"  - **Pauses and holds**: the screenplay's own pauses (Abby's silence, holds on faces, the last prologue landscape) plus small half-second breaths between some lines: about **{mmss(T['breath_s'])}**.")
w('- The screenplay itself says not to stretch footage with repeats, frozen frames or slow talking to hit 50 minutes. So nothing here is stretched.')
w('- About 22 minutes (without ads) is a normal length for an animated TV episode.')
w('- The real length will only be known once we cut the **animatic**: a rough, low-resolution version timed to temporary voices.')
w('')
w('## Scene by scene, compared with the 50-minute schedule')
w('')
w('| Scene | What happens | Shots | Schedule says | Expected | Range | Of schedule |')
w('|---|---|---:|---:|---:|---:|---:|')
for r in d['scene_totals']:
    w(f"| {r['scene']} | {r['title']} | {r['shots']} | {mmss(r['plan_s'])} ({r['plan_window']}) | **{mmss(r['expected_s'])}** | {mmss(r['low_s'])}-{mmss(r['high_s'])} | {r['expected_vs_plan_pct']}% |")
w(f"| **Total** | | **{T['shots']}** | **50:00** | **{mmss(T['expected_s'])}** | {mmss(T['low_s'])}-{mmss(T['high_s'])} | {T['expected_vs_target_pct']}% |")
w('')
w('How each shot was timed: talking time (from the word count at a natural speaking speed) + time for the action to read clearly + any pause the screenplay asks for. "Low" means tight cutting. "High" means slower acting and longer holds. End titles are set at 40 seconds because the real credit list is short. Change that once the credits are known.')
w('')
w('## A choice only you can make')
w('')
w('1. **Keep Episode 1 at about 25 minutes.** It is a complete episode with a beginning, middle and cliffhanger.')
w('2. **Write more story** if you want it closer to 50 minutes: new scenes, not slower ones. About 20-25 extra minutes of new material would be needed.')
w('')
w('## How long the computer needs to make it')
w('')
B = R['basis']
w(f"At 24 frames per second, {mmss(T['expected_s'])} is **{R['frames_total_at_24fps']:,} frames**. Black screens and the credits need no 3D render, which leaves **{R['frames_3d']:,} frames** to render.")
w('')
w("The speeds below were **measured** on this computer (4 processor cores, no graphics card) with the render pipeline's own benchmark on its test scene. Another small job was running at the time, so an empty machine may be a little faster.")
w('')
pv = sh['preview_1080p_all_on_ones']
w('| Quality setting | Measured speed | Every frame drawn | With "twos" where allowed |')
w('|---|---:|---:|---:|')
w(f"| Animatic draft (960x540) | {B['draft_540p_rendered_fps_total'][0]:.2f}-{B['draft_540p_rendered_fps_total'][1]:.2f} frames/s | {h(sh['draft_540p_animatic_all_on_ones']['best_h'])}-{h(sh['draft_540p_animatic_all_on_ones']['worst_h'])} hours | {h(sh['draft_540p_animatic_twos_where_allowed']['best_h'])}-{h(sh['draft_540p_animatic_twos_where_allowed']['worst_h'])} hours |")
w(f"| Preview (1920x1080) | {B['preview_1080p_rendered_fps_total'][0]:.2f} frames/s | {h(pv['best_h'])} hours | |")
w(f"| final-fast (drawn at 1440p, sharpened up to 4K) | {B['final_fast_rendered_fps_total'][0]:.2f}-{B['final_fast_rendered_fps_total'][1]:.2f} frames/s | {h(sh['final_fast_all_on_ones']['best_h'])}-{h(sh['final_fast_all_on_ones']['worst_h'])} hours | {h(sh['final_fast_twos_where_allowed']['best_h'])}-{h(sh['final_fast_twos_where_allowed']['worst_h'])} hours |")
w(f"| Native 4K (3840x2160) | {B['native_4k_rendered_fps_total'][0]:.2f}-{B['native_4k_rendered_fps_total'][1]:.2f} frames/s | {h(sh['native_4k_all_on_ones']['best_h'])}-{h(sh['native_4k_all_on_ones']['worst_h'])} hours | {h(sh['native_4k_twos_where_allowed']['best_h'])}-{h(sh['native_4k_twos_where_allowed']['worst_h'])} hours |")
w('')
mpm = B['render_minutes_per_finished_minute_native_4k_all_ones']
w(f"- **One full native 4K render of the episode is about a day of non-stop rendering** ({h(sh['native_4k_all_on_ones']['best_h'])}-{h(sh['native_4k_all_on_ones']['worst_h'])} hours, about {mpm[0]:.0f}-{mpm[1]:.0f} minutes of rendering for every finished minute). It can run overnight in pieces and picks up again after any interruption.")
w("- An earlier quick test looked about 2.5 times faster. This plan uses the newer, slower measurement so it does not promise too much.")
w(f"- These numbers are for **one** full render. Real projects re-render shots after fixing them, so plan for more. Each shot will probably get 2-3 draft passes, and the final pass will run about 1.3-1.5 times.")
w(f"- The test scene is not the real episode. Busy shots (crowds, dust, the sea, Starlight over the village) will probably render slower. A rough guess with that included: native 4K about **{h(cx['native_4k_all_on_ones']['best_h'])}-{h(cx['native_4k_all_on_ones']['worst_h'])} hours**. This is an unmeasured guess. We will measure each location once it is built.")
w(f"- Even so, render time is not the slowest part. **Building and animating {T['shots']} shots** is the big job.")
w('')
w('### What "on twos" means')
w('')
w(f"Normally the computer draws all 24 pictures in every second (\"on ones\"). \"On twos\" draws 12 and shows each one twice. That halves render time and gives a slightly hand-animated look. With this renderer the camera also holds for two frames, so moving cameras would stutter. Twos is therefore allowed only on **{T['twos_eligible_shots']} shots** ({R['pct_3d_frames_twos_eligible']}% of the 3D-rendered frames, {R['pct_runtime_twos_eligible']}% of screen time). Those are shots with a locked camera and calm movement, like the birthing chamber, the treatment room, and the Cling festival talk.")
w('Shots that must stay on ones: all flying, the take-off, the chase, the fire, the splash, Starlight\'s dive, crowds, dust, and any shot where the camera moves.')
w('')
w('## The hardest shots to make convincing')
w('')
w(f"Every shot was rated from 1 (routine) to 5 (hardest) for this production method: code-built 3D, rendered without a graphics card. **{T['shots_per_difficulty']['5']} shots are rated 5** and **{T['shots_per_difficulty']['4']} are rated 4**. Together these {T['hard_shots']} are the shots marked `hard` in `shotlist.json`.")
w('')
w('| Shot | Why it is hard |')
w('|---|---|')
for s in hardest:
    tags = ', '.join(FRIENDLY.get(t, t.replace('_', ' ').lower()) for t in s['difficulty_tags'])
    w(f"| {s['id']} | **{tags}.** {short(s['action'], 170)} |")
w('')
pt = T['shots_per_tag']
w(f"The hard categories across the episode:")
w(f"- **Talking faces (lip-sync):** {pt['LIPSYNC']} shots.")
w(f"- **Faces in close-up:** {pt['FACE_CLOSEUP']} shots.")
w(f"- **Crowds:** {pt['CROWD']} shots.")
w(f"- **Dust:** {pt['DUST']} shots.")
w(f"- **Breaking things:** {pt['DESTRUCTION']} shots.")
w(f"- **Fire:** {pt['FIRE']} shots.")
w(f"- **Water impact:** {pt['WATER_IMPACT']} shots.")
w(f"- **Newborn hatchling:** {pt['HATCHLING_SOFTBODY']} shots.")
w(f"- **Cloth and banners:** {pt['CLOTH']} shots.")
w('')
w('Lip-sync tip: a free tool, Rhubarb Lip Sync (MIT license), can work out mouth shapes from a recorded voice line. For the animatic, voices can be temporary recordings by you or friends.')
w('')
w('## Rules every shot follows')
w('')
w('Each shot in `shotlist.json` carries the rules that apply to it. The main ones:')
w('')
w("- **Abby's LEFT arm** is hurt by the scout's pass (1E). From then on she never uses it normally. It is in a **sling from 2C**.")
w('- The scout loses its **LEFT wing**. The rider is **burned but alive** when last seen. Nobody says they are dead.')
w('- **"Attack" never makes fire.** Charcoal breathes fire only after **"Fire"**, and only briefly.')
w('- **Charcoal is never faster than the Slitherwing** in a straight line. He catches it with angles and turns.')
w('- **Starlight has no wounds and breathes no fire.** The damage comes from her dive and her wings. She is about twice Charcoal\'s size.')
w('- **Leaf starts the nip.** Charcoal lets him go **unharmed**. Leaf is always much smaller than Charcoal.')
w("- **Abby says nothing** to the succession question: no words, no nod.")
w('- **Flying shots keep one direction:** they travel left to right, with Leaf on the left and Charcoal on the right. The camera is on the island side, so it sees their right sides.')
w("- **The scout's pass (1E):** it flies through the gap between Leaf and Charcoal, on Leaf's left (sea) side, away from the camera. That is why Abby's LEFT arm is the one hurt. The close-up of her arm is filmed from straight in front of Leaf, so her left arm shows on the right of the screen.")
w('- **Cling keeps one map:** the arch is on the left and the broad road on the right, seen from the king\'s steps. The fountain with its stone pillar in the middle of the square is the landmark you can always see.')
w('')
w('## Questions for you')
w('')
w('All open questions from every planning file are collected, shortened and merged in `PRODUCTION_PLAN.md`.')
w('')
w('1. Are you happy with an Episode 1 of about 25 minutes, or do you want to add new scenes?')
w('2. The screenplay made Abby\'s injury her **left** arm as a suggestion. Is left right for your story?')
w('3. Some parts of the screenplay are suggested additions: Starlight\'s second pass, the healer scene lines, and the ending order to "send word to King Fallen". Keep them?')
w('4. Is the slightly choppier "on twos" look OK for the calm talking scenes? Or should everything be smooth?')
w('5. For the final video, is "final-fast" (drawn at 1440p and sharpened up to 4K) good enough, or should it be native 4K?')
w('6. Do you have drawings or pictures of how Charcoal, Leaf, Starlight and the people should look? Without them, every design is a temporary placeholder.')
w('')
w('---')
w('')
w('## Appendix: every shot, one line each')
w('')
w('Shot sizes: EWS = extreme wide, WS = wide, MS = medium, CU = close-up, INS = insert (a detail), POV = what a character sees, CARD = black or text.')
w('Marks: **5** = hardest, **4** = hard, *2s* = may be on twos.')
w('')
ABBR = {'extreme wide': 'EWS', 'wide': 'WS', 'medium': 'MS', 'close': 'CU', 'insert': 'INS', 'POV': 'POV', 'card (black/text, no 3D)': 'CARD'}
cur = None
for s in shots:
    grp = 'PROLOGUE+TITLE' if s['scene'] in ('PROLOGUE', 'TITLE') else s['scene']
    if grp != cur:
        cur = grp
        r = sc[grp]
        w('')
        w(f"### {grp}: {r['title']} ({mmss(r['expected_s'])} expected)")
        w('')
        w('| Shot | Size | What you see | Lines | Sec | Mark |')
        w('|---|---|---|---|---:|---|')
    mark = []
    if s['difficulty'] >= 4:
        mark.append(f"**{s['difficulty']}**")
    if s['twos'] == 'ok':
        mark.append('*2s*')
    w(f"| {s['id']} | {ABBR[s['shot_size']]} | {short(s['action'])} | {line_range(s['dialogue'])} | {s['est_seconds']:g} | {' '.join(mark)} |")
w('')

text = '\n'.join(L)
open(os.path.join(HERE, 'shotlist.snapshot.md'), 'w').write(text)
if os.environ.get('WRITE') == '1':
    open(os.path.join(HERE, '..', '..', 'shotlist.md'), 'w').write(text)
print(len(L), 'lines')
