# Pip — a little desk robot

Raspberry Pi 5 + Raspberry Pi AI Camera. Free and offline: no API keys and no internet once
it's set up. (This folder is separate from the Southbound game.)

## You need
- Raspberry Pi 5 (4 GB or 8 GB), official 27W USB-C power supply, microSD card (32 GB+)
- Raspberry Pi AI Camera, plugged into a camera port with the ribbon cable
- A USB microphone and a small speaker (a USB speaker or one with a 3.5mm-to-USB adapter;
  the Pi 5 has no headphone jack)

## Setup
1. Use **Raspberry Pi Imager** on a computer to flash **Raspberry Pi OS (64-bit)**. In its
   settings, set your Wi-Fi and a username.
2. Boot the Pi, open a Terminal and run:
   ```
   git clone -b claude/clever-babbage-ogrbaw https://github.com/dax-code-bro/Untitled-new-game-project.git
   cd Untitled-new-game-project/pip-robot
   bash setup.sh
   sudo reboot
   ```
3. After the reboot:
   ```
   cd Untitled-new-game-project/pip-robot
   .venv/bin/python pip.py --type     # test the brain by typing first
   .venv/bin/python pip.py            # the full robot: eyes, ears and voice
   ```

## Customise
Edit the top of `pip.py`: `NAME`, `PERSONALITY`, `BRAIN_MODEL`. Pip saves recent chats in
`memory.json`. Delete that file to give Pip a fresh start.

## If something goes wrong
- **Pip can't hear you:** run `arecord -l` to check that the mic shows up.
- **No sound:** run `aplay -l`, then `speaker-test -t wav -c 2`.
- **Camera not found:** check the ribbon cable (it's easy to put in backwards) and run `rpicam-hello`.
- **Brain error:** run `ollama list` and check that `llama3.2:1b` is listed.
