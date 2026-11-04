# Southbound for Windows (desktop app)

The game in its own window, run from disk: no browser, no tabs, no address bar.
It always uses the fast graphics card, ignores the browser GPU blocklist, never
slows down when the window is in the background, and starts on the
**Cinematic** preset on RTX 4090 / 4080 / 5090 / 5080 class cards
(supersampled, 8K shadow map, full-resolution ambient occlusion, longest draw
distance, densest world).

## Get it

GitHub > Actions > **southbound-desktop** > the newest run > **Southbound-Windows**
(download). Inside:

- `Southbound Setup <version>.exe`: installs it with a desktop shortcut.
- `Southbound-Portable-<version>.exe`: runs without installing.
- `smoke.png`: a screenshot of the world from the test start on GitHub's machine.

F11 switches fullscreen. Saves live in your Windows user folder
(`%APPDATA%\Southbound`).

## Build it yourself

```
node tools/southbound/build.mjs      # at the repo root, if you changed the game source
cd southbound-desktop
npm install
npm start                            # run it
npm run dist:win                     # make the installer and the portable exe in release/
```

Under the hood it is an Electron app: the game's WebGL renderer runs inside a
desktop window, served from the install folder through a private `app://` scheme.
