#!/usr/bin/env bash
# One-time setup for Pip, the little desk robot (Raspberry Pi 5 + AI Camera).
# Everything here is free and runs offline once installed.
# Run from inside the pip-robot folder:   bash setup.sh
set -e
cd "$(dirname "$0")"

echo "== 1/5  System packages (camera, audio, fallback voice) =="
sudo apt update
sudo apt install -y imx500-all python3-picamera2 espeak-ng alsa-utils \
  portaudio19-dev unzip wget curl

echo "== 2/5  The brain: Ollama + a small model =="
if ! command -v ollama >/dev/null; then
  curl -fsSL https://ollama.com/install.sh | sh
fi
ollama pull llama3.2:1b
ollama pull moondream   # lets Pip describe what the camera sees

echo "== 3/5  Python packages =="
# --system-site-packages lets the venv see the camera library apt installed
python3 -m venv --system-site-packages .venv
.venv/bin/pip install --upgrade pip
.venv/bin/pip install vosk sounddevice requests piper-tts

echo "== 4/5  Ears: Vosk speech model (~40 MB) =="
mkdir -p models
if [ ! -d models/vosk ]; then
  wget -O /tmp/vosk.zip https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip
  unzip -q /tmp/vosk.zip -d models
  mv models/vosk-model-small-en-us-0.15 models/vosk
fi

echo "== 5/5  Voice: Piper voice (~60 MB) =="
V=https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium
[ -f models/voice.onnx ] || wget -O models/voice.onnx "$V/en_US-lessac-medium.onnx"
[ -f models/voice.onnx.json ] || wget -O models/voice.onnx.json "$V/en_US-lessac-medium.onnx.json"

echo
echo "All done! Reboot once (needed for the AI camera):  sudo reboot"
echo "Then start Pip with:   cd $(pwd) && .venv/bin/python pip.py"
