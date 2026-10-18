# Render Dragon's Kingdom on your own PC

This folder lets your gaming PC make **Episode 1 in real 4K** (3840 x 2160, 24 frames per
second) using its **graphics card**. The cloud computer that builds the scenes has no graphics
card, so on it the whole episode would take months. Your PC should be much faster. How much
faster we only know after the GPU check in step 2.

Everything here is free. Nothing needs an administrator password. You can stop at any time and
carry on later without losing finished work.

---

## What you need

| | |
|---|---|
| **Computer** | Windows 10 or 11 (64-bit). A Mac or a Linux PC works too (see "Mac or Linux" below). |
| **Graphics card** | Any recent gaming card: NVIDIA GTX 1660 / RTX 20-series or newer, AMD RX 5000 or newer, or Intel Arc. 8 GB of video memory or more is best. |
| **Memory (RAM)** | 16 GB or more. |
| **Free disk space** | About **100 GB**, on an SSD if you can. Tools and caches are about 8 GB. The rest is the rendered episode. |
| **Internet** | For the setup: about 4 GB of downloads. After that only for `git pull`, which gets new scenes. |
| **Time** | Setup: **1-3 hours** the first time. Most of that is building the 48 human characters, and it runs by itself. Rendering: the GPU check estimates it for your PC. |

Your PC as you described it (`pc/TARGET.md`): Windows, an NVIDIA GeForce RTX 4090 and about 2 TB
free. That is more than enough: the 4090 has 24 GB of video memory, and 2 TB holds the whole
episode many times over. The GPU check confirms the real card.

---

## Step 1: install everything (one line)

1. Press the **Windows key**, type **PowerShell**, and press **Enter**.
2. Copy this whole line, paste it into the blue window (right-click pastes), and press **Enter**:

   ```powershell
   irm https://raw.githubusercontent.com/dax-code-bro/Untitled-new-game-project/claude/ultimate-ai-legend-KhpoT/dragons-kingdom/pc/setup-windows.ps1 | iex
   ```

3. Let it run. It puts the project in `C:\Users\<you>\DragonsKingdom` and then:
   - installs Git, Node.js, ffmpeg and Python into the project folder (or uses the ones you already have);
   - downloads the free photo textures and sky pictures;
   - builds the human characters, the landscapes and the cloth;
   - runs the GPU check and a 1-minute test render;
   - puts a shortcut called **"Render Dragon's Kingdom"** on your desktop.

If Windows asks "Do you want to allow this app to make changes?" for Git, click **Yes**.

**If it stops** with `SETUP STOPPED: ...`, read the message, fix what it says (often the
internet dropped, or the disk is full), and paste the same line again. It skips everything that
is already done.

Already have the project folder? Double-click `dragons-kingdom\pc\Setup-Windows.cmd`. It does
the same thing.

---

## Step 2: the GPU check

The setup runs it for you. To run it again later, open PowerShell in the `dragons-kingdom`
folder and type `npm run gpu-check`. It:

1. finds your graphics card and checks that Chromium (the hidden browser that draws the frames)
   really uses it;
2. draws one real 4K frame of the riding-grounds style frame (Charcoal, Leaf, Remi, Abby). The
   picture is saved as `output\gpu-check\gpu-check-f2-velocity.png`, so you can look at it;
3. prints how many **seconds one 4K frame takes** and an **estimate for the whole episode**, scene
   by scene.

**Good result:** a line like `OK win-d3d11  GPU  ANGLE (NVIDIA, NVIDIA GeForce RTX ...)`, then the
seconds per frame and the estimate.

**Bad result:** a big banner that says **GPU NOT USED**. This means Chromium fell back to
drawing on the processor, which is far too slow. Nothing is rendered in this state. The banner
says what to try, mostly updating the graphics driver. Then send the log (see "What to send
back").

For comparison, the cloud computer (4 processor cores, no graphics card) needs **75-77 seconds**
for one steady frame of that style frame, and about 2,600 hours (108 days) for the episode.

---

## Step 3: render

Double-click **"Render Dragon's Kingdom"** on the desktop (or `dragons-kingdom\pc\Render-Episode.cmd`).
Each time, it:

1. gets the newest scene files from the cloud (`git pull`);
2. rebuilds a cache only if the new files need it. Usually this takes a few seconds;
3. renders Episode 1 **scene by scene, in story order**, and **keeps the PC awake** while the
   window is open.

What you will see: one line per shot, then a progress line like
`frames 120/276 (43%) | 0.80 fps | ETA 3m10s`.

- **To stop:** press **Ctrl+C** or close the window. Finished work is kept.
- **To continue:** double-click the shortcut again. Unfinished shots continue from their last
  finished piece. At most a few seconds of work are lost.
- **Scenes that are not built yet** show `SKIPPED - waiting for ...`. That is normal: the cloud is
  still building them. Each time you start the shortcut it pulls the new ones and renders them.
- **Only at night?** Start it with a time limit: open PowerShell in `dragons-kingdom` and type
  `pc\Render-Episode.cmd --max-hours 8`. It finishes the shot it is working on and stops.
- **Gaming at the same time?** The game and the render share the graphics card. Stop the render
  first (Ctrl+C), then start it again afterwards.

---

## Where the video appears

| File | What it is |
|---|---|
| `output\episode1\scenes\1A.mp4` (and the other scenes) | Each scene as soon as all its shots are finished, with sound if the sound mix exists, and a `.en.srt` subtitle file next to it. Watch them in VLC. |
| `output\episode1\DragonsKingdom_S01E01_4K.mp4` | **The whole episode** in 4K with switchable English subtitles. It appears when every scene is done. It is 10-bit: VLC and YouTube play it, some TVs and phones do not. |
| `output\episode1\DragonsKingdom_S01E01_1080p.mp4` | The same episode in 1080p and 8-bit. It plays on phones, tablets and TVs. |
| `output\episode1\STATUS.txt` | Progress: which scenes are done, which are waiting, and roughly how many hours are left. |

**Check progress at any time** without rendering: open `output\episode1\STATUS.txt`, or run
`pc\Render-Episode.cmd --status`.

---

## Let a Claude session on your PC do it

Claude can run all of this for you on your PC and report back. Use either of these:

- **Claude Desktop app:** open the **Code** part, choose the `DragonsKingdom` folder (or any folder
  if it is not installed yet), and paste the prompt below.
- **Terminal:** open PowerShell in the `DragonsKingdom` folder and run `claude remote-control`. You
  (or the cloud session) can then drive that session from the Claude app.

Prompt to paste:

> Please read `dragons-kingdom/pc/RENDER_ON_YOUR_PC.md`. If the project is not on this PC yet, run the
> one-line setup from step 1. Otherwise run `dragons-kingdom\pc\Setup-Windows.cmd`. Show me the
> GPU check result (the seconds per frame and the estimate). If it says "GPU NOT USED", help me fix
> it. Then start the render with `pc\Render-Episode.cmd` and tell me what `--status` says.

---

## What to send back to the cloud session

Send these files from `dragons-kingdom\pc\logs\`:

1. **`gpu-check-<date>.txt`** (the most important one): your graphics card, the seconds per 4K
   frame and the estimate;
2. **`setup-<date>.log`** if the setup stopped;
3. `output\episode1\STATUS.txt` from time to time, plus **`episode.log`** if a shot says `FAILED`.

---

## If something goes wrong

| Message | What to do |
|---|---|
| `GPU NOT USED` | Update the graphics driver (NVIDIA app / AMD Adrenalin / Intel Driver Assistant) and restart the PC. On a laptop, plug in the charger. Then open Settings > System > Display > Graphics and set `node.exe` and `chrome.exe` to **High performance**. Run `npm run gpu-check` again and send the log. |
| `STOP: some git-ignored caches are missing` | Run `pc\Setup-Windows.cmd` again. |
| `STOP: only N GB free` | Free disk space. Finished scene files can be copied to another drive. |
| `this job is already being rendered by another process` | A second render window is open. Close one. |
| `WebGL context lost`, or a shot `FAILED` | The render retries once with one browser. If it still fails, send `pc\logs\episode.log`. |
| The PC restarted for Windows Update | Double-click the shortcut again. Pausing updates for a week while rendering (Settings > Windows Update) avoids it. |
| Everything is very slow | Run `npm run gpu-check`. It shows whether the graphics card is used. Antivirus scanning the `DragonsKingdom` folder can also slow things down; you may add it to the Windows Security exclusions. |

---

## Mac or Linux

Open a Terminal and run:

```bash
curl -fsSL https://raw.githubusercontent.com/dax-code-bro/Untitled-new-game-project/claude/ultimate-ai-legend-KhpoT/dragons-kingdom/pc/setup.sh | bash
```

The project goes to `~/DragonsKingdom`. Render with `bash ~/DragonsKingdom/dragons-kingdom/pc/render-episode.sh`.
Check progress with the same command plus `--status`. On Linux the graphics driver needs Vulkan
support, and `vulkaninfo` should list your card.

---

## Honest notes (state on 2026-10-18)

- **Most scene files do not exist yet.** The cloud is building them set by set. Until a scene's
  files arrive, its shots are skipped. Run the shortcut again after new scenes are announced.
- **Sound:** the final sound mix for Episode 1 is not made yet. Scene files are silent until it
  arrives. It will be put in `output\episode1\audio\` or `episodes\s01e01\final\audio\`, and running
  the shortcut again adds it to the finished scenes without re-rendering the pictures. The episode
  is not finished until it has sound.
- **Subtitles:** until the sound mix provides exact timings, subtitle timing is **estimated** from
  the shot list. The words are the final script's.
- **End credits:** the credits text (`episodes\s01e01\final\credits.txt`) is not written yet.
  Until it is, the END scene waits, and so does the full episode file.
- **The Windows scripts were written and checked on a Linux computer.** PowerShell syntax, a test
  run of the Linux version, and a full test render on the processor all passed there. A real
  Windows PC with a graphics card has not run them yet. **Your first run is the real test**, so
  please send the logs.
- The estimate in the GPU check scales one test frame to every set. The cloud's per-set
  figures are themselves estimates for sets that are not built yet. The real speed shows once the
  first scenes render (`STATUS.txt` then uses the measured speed).

Technical details for helpers: `pc/MANIFEST.md` (everything that is not in git and how it is
rebuilt), `node render/episode.mjs --help`, `node render/gpu-check.mjs --help`,
`node pc/build-caches.mjs --help`.
