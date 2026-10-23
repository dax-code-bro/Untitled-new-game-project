# Episode 1 sound for the render PC

This folder is where the episode's **sound mix** goes: `S01E01_mix.wav` for the whole episode, or
`scenes/<scene>.wav` with one file per scene, plus the subtitles timed to it, `S01E01.en.srt`.
`render/episode.mjs` looks here (and in `output/episode1/audio/`) and adds the sound to finished
scene files without rendering the pictures again. The mix is **not made yet**.

Sound files are never committed (`SERIES.md` section 2). The `.gitignore` here keeps them out of
git. They reach Daxtyn's PC like this (details in `pc/MANIFEST.md`, "Sound"):

1. On the computer that has the files: `node pc/pack-sound.mjs mix` (or `final-vo` for the voice
   takes in `../vo/`). It writes one deterministic `.tar` and prints its size and SHA-256.
2. Upload the `.tar` somewhere free with a direct download link, for example a GitHub release of
   this repository. Then `node pc/pack-sound.mjs mix --record --url <link>` writes the link and the
   SHA-256 values into `delivery.json`. Commit and push only that small file.
3. On the PC the desktop shortcut runs `git pull` and `pc/build-caches.mjs`, which downloads the
   `.tar`, checks it and every file in it, and puts the files here (or in `../vo/`).

Without an upload, copy the `.tar` (or the folder) to the PC and run there:
`node pc/build-caches.mjs --only sound --from <file.tar or folder>`.
