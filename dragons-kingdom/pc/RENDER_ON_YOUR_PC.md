# Render Dragon's Kingdom on your own PC

This folder lets your gaming PC make **Episode 1 in real 4K** (3840 x 2160, 24 frames per
second) with its **graphics card**. The cloud computer that builds the scenes has no graphics
card, so there the whole episode would take months. Your PC should take days. How many days we
only know after the GPU check (step 2).

Everything here is free. Nothing needs an administrator password: if Windows ever asks "Do you
want to allow this app to make changes to your device?", click **No**. The setup uses its own
copies of the tools, in your own folders. You can stop at any time and carry on later without
losing finished work.

Your PC as you described it (`pc/TARGET.md`): Windows, an NVIDIA GeForce RTX 4090 and about 2 TB
free. That is plenty: the episode needs about 100 GB, and the 4090 has 24 GB of video memory.

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

---

## Step 1: install everything (one line, once)

1. Press the **Windows key**, type **PowerShell**, and press **Enter**. A dark blue (or black) window opens.
2. Copy this whole line, click into that window, **right-click** (that pastes) and press **Enter**:

   ```powershell
   irm https://raw.githubusercontent.com/dax-code-bro/Untitled-new-game-project/claude/ultimate-ai-legend-KhpoT/dragons-kingdom/pc/setup-windows.ps1 | iex
   ```

3. Let it run. It puts the project in `C:\Users\<your name>\DragonsKingdom` and then:
   - gets Git, Node.js, Python and ffmpeg if the PC does not have them: always the same versions, each
     checked against its fingerprint (SHA-256) before it is used, all inside your own folders;
   - downloads the free photo textures and sky pictures;
   - builds the human characters, the landscapes and the cloth (the long part);
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
3. prints how many **seconds one 4K frame takes** and an **estimate for the whole episode**.

**Good result:** a line like `OK  win-d3d11  GPU  ANGLE (NVIDIA, NVIDIA GeForce RTX 4090 ...)`, then
the seconds per frame and the estimate.

**Bad result:** a big banner **GPU NOT USED**. Chromium fell back to drawing on the processor,
which is far too slow, so nothing is rendered in this state. Do what the banner says (mostly:
update the graphics driver in the NVIDIA app, restart the PC, double-click GPU-Check.cmd again),
then send the logs (see "Talking to Claude").

For comparison: the cloud computer needs **77 seconds** for one 4K frame of that picture. The
schedule (`episodes/s01e01/final/render-schedule.md`, "On Daxtyn's PC") guesses that a 4090 is 25
to 250 times faster, which would mean about 1 to 5 days of rendering for the whole episode. That
is a guess until your GPU check measures it.

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
- **Only at night?** Open PowerShell in the `dragons-kingdom` folder and type
  `pc\Render-Episode.cmd --max-hours 8`. It finishes the shot it is on and stops.
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

Check progress without rendering: open `STATUS.txt`, or type `pc\Render-Episode.cmd --status` in PowerShell.

---

## Talking to Claude

### What to send back

Double-click **Send-Logs.cmd**. It writes one file, `pc\logs\send-to-claude-<date>.txt`, copies
its text and opens its folder. Then click into the chat with Claude and press **Ctrl+V** (or drag
the file into the chat). The file has your PC's graphics card and drivers as the GPU check saw
them, the end of the setup, cache and render logs and the render status. Your user folder's name
is replaced by `~`, and nothing is sent anywhere by itself.

Send it:
- after the setup has finished (or stopped);
- whenever the GPU check says **GPU NOT USED**;
- when a shot says **FAILED**;
- now and then while it renders, so the cloud session can plan the next scenes with your real speed.

### Let a Claude session on your PC do it for you

Claude can also run the setup and the render on your PC and tell you what it sees. Two ways:

- **The Claude desktop app** (easiest): download it from https://claude.com/download, install it,
  sign in with your Claude account, open **Claude Code** in the app (the **Code** tab), choose the
  `DragonsKingdom` folder (any folder if the setup has not run yet), and paste the prompt below.
- **Claude Code in a terminal, with Remote Control:** if Claude Code is installed on the PC (the
  official install guide is https://code.claude.com/docs/en/setup), open PowerShell in
  the `DragonsKingdom` folder and type `claude remote-control`. That session then shows up in the
  Claude app, so you can follow and steer it from there, also from your phone. The setup does not
  install Claude Code; if this sounds like too much, use the desktop app.

Prompt to paste:

> Please read `dragons-kingdom/pc/RENDER_ON_YOUR_PC.md`. If the project is not on this PC yet, run the
> one-line setup from step 1; otherwise run `dragons-kingdom\pc\Setup-Windows.cmd`. Show me the GPU
> check result (the seconds per frame and the estimate). If it says "GPU NOT USED", help me fix it.
> Then start the render with `dragons-kingdom\pc\Render-Episode.cmd`, and when I ask, run
> `dragons-kingdom\pc\Send-Logs.cmd` and give me the text to send to the cloud session.

---

## If something goes wrong

| Message | What to do |
|---|---|
| `GPU NOT USED` | Update the graphics driver (NVIDIA app), restart the PC, double-click GPU-Check.cmd. Still there? Open Windows Settings > System > Display > Graphics and check that the programs the banner lists are set to **High performance** (the setup sets them for you; on a desktop with one graphics card this changes nothing). To find them with **Browse**, paste `%LOCALAPPDATA%\ms-playwright` into the file-name box, press Enter, and open `chromium-1194\chrome-win\chrome.exe` and `chromium_headless_shell-1194\chrome-win\headless_shell.exe` (these are not Google Chrome). Then send the logs. |
| `SETUP STOPPED: ...` | Do what the message says, then run the setup again. It continues where it stopped. |
| `STOP: some git-ignored caches are missing` | Double-click Setup-Windows.cmd. |
| `STOP: only N GB free` | Free some disk space (finished scene files can be copied to another drive). |
| `this job is already being rendered by another process` | A second render window is open. Close one. |
| `WebGL context lost`, or a shot `FAILED` | The render retries once with one browser. If it fails again, double-click Send-Logs.cmd and send the text. |
| The PC restarted for Windows Update | Double-click the shortcut again. Pausing updates for a week while rendering (Settings > Windows Update) avoids it. |
| Everything is very slow | Double-click GPU-Check.cmd: it shows whether the graphics card is used. Antivirus scanning the `DragonsKingdom` folder can also slow things down; you may add it to the Windows Security exclusions. |
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
  it says where each line comes from). When the file changes, the next render redoes only the
  credits roll.
- **The Windows scripts were written and checked on a Linux computer.** On 2026-10-23 the whole
  Windows setup ran there under PowerShell 7 (with a user folder named `José` to test non-English
  letters): every tool's output appeared on the screen and in the setup log, and the setup ended
  with exit code 2 because that computer has no graphics card. The scripts were also checked for
  Windows PowerShell 5.1 syntax. Windows itself, its console and a real graphics card were not part
  of that test, so **your first run is the real test**. Please send the logs.
- The GPU check's estimate scales one test frame to every set. The cloud's per-set figures are
  themselves estimates for sets that are not built yet. The real speed shows once the first scenes
  render (`STATUS.txt` then uses the measured speed).

Technical details for helpers: `pc/MANIFEST.md` (everything that is not in git and how it is
rebuilt), `pc/PROGRESS.md` (state of this kit), `node render/episode.mjs --help`,
`node render/gpu-check.mjs --help`, `node pc/build-caches.mjs --help`.
