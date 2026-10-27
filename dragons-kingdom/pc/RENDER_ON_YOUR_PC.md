# Render Dragon's Kingdom on your own PC

This folder lets your gaming PC make **Episode 1 in real 4K** (3840 x 2160, 24 frames per
second) with its **graphics card**. The cloud computer that builds the scenes has no graphics
card, so there the whole episode would take months. Your PC should take days. How many days we
only know after the GPU check (step 2).

Everything here is free. Nothing needs an administrator password: if Windows ever asks "Do you
want to allow this app to make changes to your device?", click **No**, every time (nothing in this
guide needs a **Yes**). The setup uses its own copies of the tools, in your own folders. You can stop at any time and carry on later without
losing finished work.

Your PC as you described it (`pc/TARGET.md`): Windows, an NVIDIA GeForce RTX 4090 and about 2 TB
free. That is plenty: the episode needs up to about 100 GB (the tools, assets and caches about 8 GB,
the rest is the video while it renders), and the 4090 has 24 GB of video memory.

---

## The four buttons

After the setup, everything is a double-click. They are all in the folder
`C:\Users\<your name>\DragonsKingdom\dragons-kingdom\pc`:

| Double-click | What it does |
|---|---|
| **Setup-Windows.cmd** | Installs or repairs everything. Safe to run again any time. |
| **GPU-Check.cmd** | Finds your graphics card, draws one 4K test picture and says how long the episode will take. |
| **Render-Episode.cmd** (also on your desktop as **"Render Dragon's Kingdom"**) | Gets the newest scenes and renders. Close the window to stop; double-click again to carry on. |
| **Send-Logs.cmd** | Puts everything Claude needs to know into one text file and copies it, so you can paste it into the chat. |

**How to open that folder:** press **Windows key + R**, paste this line, press **Enter**:

```
%USERPROFILE%\DragonsKingdom\dragons-kingdom\pc
```

**How to type a command** (a few things below say "type `pc\Render-Episode.cmd ...`"): they are typed in
PowerShell opened **in the `dragons-kingdom` folder**:

1. Press **Windows key + R**, paste `%USERPROFILE%\DragonsKingdom\dragons-kingdom`, press **Enter**.
   A File Explorer window opens on that folder.
2. Click the **address bar** at the top of that window (where the folder's path is shown), type
   `powershell` and press **Enter**. A PowerShell window opens, already in that folder.
   (Or: right-click an empty spot in the folder and choose **Open in Terminal**.)
3. Type (or paste with a right-click) the command and press **Enter**.

---

## Step 1: install everything (one line, once)

1. Press the **Windows key**, type **PowerShell**, and press **Enter**. A dark blue (or black) window opens.
2. Copy this whole line, click into that window, **right-click** (that pastes) and press **Enter**:

   ```powershell
   irm https://raw.githubusercontent.com/dax-code-bro/Untitled-new-game-project/claude/ultimate-ai-legend-KhpoT/dragons-kingdom/pc/setup-windows.ps1 | iex
   ```

3. Let it run. It puts the project in `C:\Users\<your name>\DragonsKingdom` and then:
   - gets Git and Python if the PC does not have them, and always its own copies of Node.js and ffmpeg
     (the exact versions the cloud computer uses), each checked against its fingerprint (SHA-256)
     before it is used, all inside your own folders;
   - downloads the free photo textures and sky pictures;
   - makes the human characters, the landscapes and the cloth (the long part). Once the cloud
     publishes them as downloads (not yet on 2026-10-23), it downloads the cloud's own copies
     instead, checked file by file, so your PC uses exactly what every shot was reviewed with;
   - sets Windows' graphics setting to "High performance" for the programs that draw the frames;
   - runs the GPU check and a 1-minute test render;
   - puts the **"Render Dragon's Kingdom"** shortcut on your desktop.

**How long:** 1 to 3 hours the first time, mostly the characters. The window prints a line each
time a character is finished, and one can take 5 to 15 minutes, so a quiet window is normal.
The PC does not go to sleep while the setup runs (the screen may still turn off).

**Do not click inside the window while it works.** On Windows 10 a click can pause it. The setup
switches that off, but if the window ever seems frozen, press **Esc**.

Everything the setup does is shown in the window and saved in `pc\logs\setup-<date>.log`.

**If it stops** with `SETUP STOPPED: ...`, read the message, fix what it says (often: the internet
dropped, or the disk is full), and paste the same line again. It skips what is already done.

Already have the project folder? Double-click `Setup-Windows.cmd` instead. It does the same.

---

## Step 2: the GPU check

The setup runs it for you. To run it again later, double-click **GPU-Check.cmd**. It:

1. finds your graphics card and checks that the hidden browser that draws the frames (Chromium)
   really uses it;
2. draws one real 4K picture of the riding-grounds style frame (Charcoal, Leaf, Remi, Abby) and
   saves it as `output\gpu-check\gpu-check-f2-velocity.png`, so you can look at it;
3. **compares that picture with the same picture drawn by the cloud computer** (on which every shot
   is reviewed) and prints a banner `PICTURE CHECK: SAME PICTURE`, `SMALL DIFFERENCES` or
   `DIFFERENT`;
4. prints how many **seconds one 4K frame takes** and an **estimate for the whole episode**.

**Good result:** a line like `OK  win-d3d11  GPU  ANGLE (NVIDIA, NVIDIA GeForce RTX 4090 ...)`, then
`PICTURE CHECK: SAME PICTURE`, the seconds per frame and the estimate.

**Every time, please drag the picture into the chat with Claude:** the GPU check saves
`output\gpu-check\gpu-check-picture-for-claude.jpg` (the whole frame and two close-ups) and prints
where it is. Open that folder, drag the file into the chat. Send-Logs.cmd also copies it next to its
text file.

**`PICTURE CHECK: DIFFERENT`:** your graphics card draws the frame differently from the cloud
computer (wrong colours, missing parts, black or white spots). The render then **does not start**
until someone has looked at the picture: drag it into the chat and send the logs. Only when Claude
says it is fine, type `pc\Render-Episode.cmd --accept-gpu-picture` (see "How to type a command").
`SMALL DIFFERENCES` does not stop anything, but please send the picture too.

**Bad result:** a big banner **GPU NOT USED**. Chromium fell back to drawing on the processor,
which is far too slow, so nothing is rendered in this state. Do what the banner says (mostly:
update the graphics driver in the NVIDIA app, restart the PC, double-click GPU-Check.cmd again),
then send the logs (see "Talking to Claude").

For comparison: the cloud computer needs **77 seconds** for one 4K frame of that picture. The
schedule (`episodes/s01e01/final/render-schedule.md`, "On Daxtyn's PC") guesses that a 4090 is 25
to 250 times faster, which would mean about 1 to 5 days of rendering for the whole episode. That
is a guess until your GPU check measures it.

**The quality tier.** A graphics card like the 4090 can afford more work per pixel than the cloud
computer, so the GPU check also draws its test frame at higher **quality tiers** (`high`, `ultra`,
and others when they might fit): finer shadows, real motion blur from many sub-frames, reflections on
water and wet stone. Every tier is still native 4K on every frame. It checks that each tier draws the
same picture as `final`, works out how long the whole episode would take at each one, and ends with a
banner `RECOMMENDED QUALITY TIER: ...`: the best tier that keeps Episode 1 under about 3 days.
**You do not have to do anything with it:** the render (Step 3) uses that tier by itself, but only
when it was really measured on your card and every picture check passed; otherwise it uses `final`.
The render window prints which one it uses in a line `quality tier: ...`. To choose yourself, type
for example `pc\Render-Episode.cmd --tier final` (see "How to type a command"). Shots that are
already finished keep the tier they were made with.

---

## Step 3: render

Double-click **"Render Dragon's Kingdom"** on the desktop. Each time, it:

1. gets the newest scene files from the cloud (`git pull`);
2. rebuilds a cache only if the new files need it (usually a few seconds);
3. renders Episode 1 **scene by scene, in story order**. The PC does not sleep while the window is open.

What you will see: one line per shot, then a progress line like
`frames 120/276 (43%) | 0.80 fps | ETA 3m10s`.

- **To stop:** close the window, or press **Ctrl+C**. Finished work is kept.
- **To carry on:** double-click the shortcut again. Unfinished shots continue from their last
  finished piece; at most a few seconds of work are lost.
- **`SKIPPED - waiting for ...`** is normal: the cloud is still building those scenes. Each time you
  start the shortcut, it pulls the new ones and renders them.
- **`SKIPPED - not approved for the masters yet`** is normal too: a shot is rendered in 4K only after
  the director (the cloud session) has approved it, in the file
  `episodes\s01e01\final\render-ready.json` that arrives with the newest scenes. If an approved shot
  is changed and approved again, the next start renders it again and joins its scene again by itself.
  A scene file is only made when all its shots are approved and rendered.
- **Only at night?** Type `pc\Render-Episode.cmd --max-hours 8` (see "How to type a command").
  It finishes the shot it is on and stops.
- **Gaming?** The game and the render share the graphics card. Stop the render first, start it again afterwards.
- **Do not click inside the render window.** If it ever seems frozen, press **Esc**.

---

## Where the video appears

All in `C:\Users\<your name>\DragonsKingdom\dragons-kingdom\output\episode1\`:

| File | What it is |
|---|---|
| `scenes\1A.mp4` (and the other scenes) | Each scene as soon as all its shots are done, with sound once the mix exists, and a subtitle file next to it. Watch them in VLC. |
| `DragonsKingdom_S01E01_4K.mp4` | **The whole episode** in 4K with English subtitles you can switch on. It appears when every scene is done. It is 10-bit: VLC and YouTube play it, some TVs and phones do not. |
| `DragonsKingdom_S01E01_1080p.mp4` | The same episode in 1080p, 8-bit: plays on phones, tablets and TVs. |
| `STATUS.txt` | Which scenes are done, which are waiting, roughly how long is left. |

Check progress without rendering: open `STATUS.txt`, or type `pc\Render-Episode.cmd --status` (see
"How to type a command"). It also says how many shots are waiting for approval.

---

## Talking to Claude

### What to send back

Double-click **Send-Logs.cmd**. It writes one file, `pc\logs\send-to-claude-<date>.txt`, copies
its text and opens its folder. Then click into the chat with Claude and press **Ctrl+V** (or drag
the file into the chat). The file has your PC's graphics card and drivers as the GPU check saw
them, the end of the setup, cache and render logs and the render status. Your user folder's name
is replaced by `~`, and nothing is sent anywhere by itself.

Its first lines are the results that matter most: `SETUP RESULT`, `GPU CHECK` and `PICTURE`.

Send it:
- after the setup has finished (or stopped);
- whenever the GPU check says **GPU NOT USED** or **PICTURE CHECK: DIFFERENT** (and drag the picture
  in too);
- when a shot says **FAILED**;
- now and then while it renders, so the cloud session can plan the next scenes with your real speed.

### Let a Claude session on your PC do it for you

Claude can also run the setup and the render on your PC and tell you what it sees. Two ways:

- **The Claude desktop app** (easiest): download it from https://claude.com/download, install it,
  sign in with your Claude account, open **Claude Code** in the app (the **Code** tab), choose the
  `DragonsKingdom` folder (any folder if the setup has not run yet), and paste the prompt below.
- **Claude Code in a terminal, with Remote Control:** if Claude Code is installed on the PC (the
  official install guide is https://code.claude.com/docs/en/setup), open PowerShell in
  the `DragonsKingdom` folder (as in "How to type a command", with `%USERPROFILE%\DragonsKingdom`)
  and type `claude remote-control`. That session then shows up in the
  Claude app, so you can follow and steer it from there, also from your phone. The setup does not
  install Claude Code; if this sounds like too much, use the desktop app.

Prompt to paste:

> Please read `dragons-kingdom/pc/RENDER_ON_YOUR_PC.md`. If the project is not on this PC yet, run the
> one-line setup from step 1; otherwise run `dragons-kingdom\pc\Setup-Windows.cmd`. Show me the GPU
> check result (the seconds per frame, the estimate and the PICTURE CHECK verdict) and open the picture
> `output\gpu-check\gpu-check-picture-for-claude.jpg` so we can look at it. If it says "GPU NOT USED"
> or "DIFFERENT", help me fix it.
> Then start the render with `dragons-kingdom\pc\Render-Episode.cmd`, and when I ask, run
> `dragons-kingdom\pc\Send-Logs.cmd` and give me the text to send to the cloud session.

---

## If something goes wrong

| Message | What to do |
|---|---|
| `GPU NOT USED` | Update the graphics driver (NVIDIA app), restart the PC, double-click GPU-Check.cmd. Still there? Open Windows Settings > System > Display > Graphics and check that the programs the banner lists are set to **High performance** (the setup sets them for you; on a desktop with one graphics card this changes nothing). To find them with **Browse**, paste `%LOCALAPPDATA%\ms-playwright` into the file-name box, press Enter, and open the folder whose name starts with `chromium-` and a number (for example `chromium-1194`), then `chrome-win\chrome.exe`; and the same in the folder starting with `chromium_headless_shell-`, `chrome-win\headless_shell.exe` (these are not Google Chrome). The GPU NOT USED banner prints the exact paths. Then send the logs. |
| `PICTURE CHECK: DIFFERENT` | Drag `output\gpu-check\gpu-check-picture-for-claude.jpg` into the chat and send the logs. Update the graphics driver and run GPU-Check.cmd again. Only when Claude says the picture is fine: `pc\Render-Episode.cmd --accept-gpu-picture`. |
| `SETUP RESULT: 1` ... `5` | The number says what happened: **0** everything ok; **1** the setup stopped (the message above says why); **2** no graphics card found (GPU NOT USED); **3** the GPU check picture is DIFFERENT, or the heaviest test frame failed; **4** the GPU check itself crashed; **5** the 1-minute test render failed. For 1, fix what it says and run the setup again; for 2 to 5, send the logs. |
| `SETUP STOPPED: ...` | Do what the message says, then run the setup again. It continues where it stopped. |
| `STOP: some git-ignored caches are missing` | Double-click Setup-Windows.cmd. |
| `STOP: only N GB free` | Free some disk space (finished scene files can be copied to another drive). |
| `this job is already being rendered by another process` | A second render window is open. Close one. |
| `WebGL context lost`, or a shot `FAILED` | The render retries once with one browser. If it fails again, double-click Send-Logs.cmd and send the text. |
| The PC restarted for Windows Update | Double-click the shortcut again. Pausing updates for a week while rendering (Settings > Windows Update) avoids it. |
| Everything is very slow | Double-click GPU-Check.cmd: it shows whether the graphics card is used. Do not change antivirus or Windows Security settings for this (that needs an administrator, and this guide never does); send the logs instead. |
| The window seems frozen | Press **Esc** (a click inside the window can pause it on Windows 10). Nothing is lost. |
| `No graphics card has been checked on this computer yet` | Double-click GPU-Check.cmd and do what its banner says. |
| `WARNING sound ...` | The sound download did not work this time. The pictures render anyway; the next start tries again. |

---

## Mac or Linux

Open a Terminal and run:

```bash
curl -fsSL https://raw.githubusercontent.com/dax-code-bro/Untitled-new-game-project/claude/ultimate-ai-legend-KhpoT/dragons-kingdom/pc/setup.sh | bash
```

The project goes to `~/DragonsKingdom`. Render with `bash ~/DragonsKingdom/dragons-kingdom/pc/render-episode.sh`;
add `--status` for progress, `--gpu-check` for the GPU check, `--send-logs` for the logs file. On Linux
the graphics driver needs Vulkan support (`vulkaninfo` should list your card). On a Mac, ffmpeg comes
from Homebrew and is not the pinned version the Windows and Linux setups use.

---

## Honest notes (state on 2026-10-23)

- **Most scene files do not exist yet.** The cloud is building them set by set. Until a scene's
  files arrive, its shots are skipped. Start the shortcut again after new scenes are announced.
- **Sound:** the episode's sound mix is not made yet, so scene files are silent until it arrives.
  Sound files never go through git: when the mix is ready, the cloud publishes it as one download
  and puts its fingerprint in git; the next start of the shortcut downloads it, checks it and adds
  it to the finished scenes without rendering the pictures again (`pc/MANIFEST.md`, "Sound").
  The episode is not finished until it has sound.
- **Subtitles:** until the mix gives exact timings, subtitle timing is estimated from the shot
  list. The words are the final script's.
- **End credits:** `episodes\s01e01\final\credits.txt` lists the real contributors and the free
  assets with their licences. It is a proposal: you decide the wording (`credits-notes.md` next to
  it says where each line comes from). When the file changes and the director approves the new
  credits, the next render redoes only the credits roll.
- **The Windows scripts were tested on a real Windows computer without a graphics card**
  (GitHub's Windows Server 2025 test machine, Windows PowerShell 5.1, 2026-10-23): the setup
  installed the tools in about a minute (the long character-building step was left out there) and
  said `SETUP RESULT: 0`; GPU-Check.cmd showed the GPU NOT USED banner and ended with code 2, as it
  should there; a 4K test picture (the coast) drawn there was exactly the cloud computer's; the render self-test (render, stop, resume, approvals, credits change, joining
  the episode) passed; Send-Logs.cmd left no user or computer name in its file. A real graphics card,
  the console window you click in, and File Explorer were not part of that test, so **your first
  run is still the real test**. Please send the logs and the picture.
- The GPU check's estimate scales one test frame to every set. The cloud's per-set figures are
  themselves estimates for sets that are not built yet. The real speed shows once the first scenes
  render (`STATUS.txt` then uses the measured speed).

Technical details for helpers: `pc/MANIFEST.md` (everything that is not in git and how it is
rebuilt), `pc/PROGRESS.md` (state of this kit), `node render/episode.mjs --help`,
`node render/gpu-check.mjs --help`, `node pc/build-caches.mjs --help`.
