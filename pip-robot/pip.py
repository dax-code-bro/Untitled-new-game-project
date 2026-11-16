#!/usr/bin/env python3
"""
Pip - a little desk robot for the Raspberry Pi 5 + AI Camera.
100% free and offline: no API keys, no internet needed once set up.

  Eyes  : AI Camera (IMX500) spots people/objects on the camera chip
  Ears  : Vosk turns your voice into text
  Brain : Ollama runs a small AI model on the Pi
  Voice : Piper speaks (falls back to espeak-ng)

Run:  .venv/bin/python pip.py          (full robot)
      .venv/bin/python pip.py --type   (type instead of talking - good for testing)
"""
import json, os, queue, subprocess, sys, threading, time

import requests

HERE = os.path.dirname(os.path.abspath(__file__))
MODELS = os.path.join(HERE, "models")
MEMORY_FILE = os.path.join(HERE, "memory.json")

# ---------- Change these to customise your robot ----------
NAME = "Pip"
BRAIN_MODEL = "llama3.2:1b"   # try "gemma3:1b" or "qwen2.5:1.5b" too (ollama pull <name>)
PERSONALITY = f"""You are {NAME}, a tiny curious robot who lives on a desk.
You see through a little camera and talk through a tiny speaker.
You are playful, warm, a bit silly, and love learning about your human.
ALWAYS answer in one or two short sentences. Never use emojis or lists.
If you learn your human's name or something they like, remember it."""
GREET_AFTER_SECONDS = 30      # say hi if a person shows up after being gone this long
# ----------------------------------------------------------

TYPE_MODE = "--type" in sys.argv
speaking = threading.Event()  # while set, the mic ignores sound (so Pip doesn't hear itself)
events = queue.Queue()        # ("heard", text) or ("saw_person", None)


# ================= MEMORY =================
def load_memory():
    try:
        with open(MEMORY_FILE) as f:
            return json.load(f)
    except Exception:
        return []

def save_memory(history):
    with open(MEMORY_FILE, "w") as f:
        json.dump(history[-30:], f, indent=1)  # keep the last 30 lines of chat


# ================= EYES =================
class Eyes:
    """Runs object detection on the AI Camera chip itself (costs the Pi almost nothing)."""
    def __init__(self):
        self.seeing = []          # labels currently in view, e.g. ["person", "cup"]
        self.ok = False
        try:
            from picamera2 import Picamera2
            from picamera2.devices import IMX500
            net = "/usr/share/imx500-models/imx500_network_ssd_mobilenetv2_fpnlite_320x320_pp.rpk"
            self.imx = IMX500(net)
            labels = getattr(self.imx.network_intrinsics, "labels", None) if self.imx.network_intrinsics else None
            self.labels = [l for l in labels] if labels else None
            self.cam = Picamera2(self.imx.camera_num)
            self.cam.start(self.cam.create_preview_configuration(buffer_count=12))
            self.ok = True
            threading.Thread(target=self._loop, daemon=True).start()
            print("[eyes] AI camera running")
        except Exception as e:
            print(f"[eyes] camera not available ({e}) - Pip will be blind for now")

    def _label(self, idx):
        idx = int(idx)
        if self.labels and 0 <= idx < len(self.labels):
            return self.labels[idx]
        return "person" if idx == 0 else "something"

    def _loop(self):
        last_person = 0.0
        while True:
            try:
                md = self.cam.capture_metadata()
                out = self.imx.get_outputs(md, add_batch=True)
                if out is None:
                    continue
                _, scores, classes = out[0][0], out[1][0], out[2][0]
                found = sorted({self._label(c) for s, c in zip(scores, classes) if s > 0.55})
                found = [f for f in found if f and f != "-"]
                self.seeing = found
                if "person" in found:
                    if time.time() - last_person > GREET_AFTER_SECONDS:
                        events.put(("saw_person", None))
                    last_person = time.time()
            except Exception as e:
                print("[eyes] hiccup:", e)
                time.sleep(1)


# ================= EARS =================
def listen_forever():
    import sounddevice as sd
    from vosk import KaldiRecognizer, Model, SetLogLevel
    SetLogLevel(-1)
    rec = KaldiRecognizer(Model(os.path.join(MODELS, "vosk")), 16000)
    audio = queue.Queue()

    def on_audio(data, frames, t, status):
        if not speaking.is_set():
            audio.put(bytes(data))

    with sd.RawInputStream(samplerate=16000, blocksize=8000, dtype="int16",
                           channels=1, callback=on_audio):
        print("[ears] listening...")
        while True:
            data = audio.get()
            if speaking.is_set():
                rec.Reset()
                continue
            if rec.AcceptWaveform(data):
                text = json.loads(rec.Result()).get("text", "").strip()
                if len(text) > 1 and text not in ("the", "huh", "a"):
                    events.put(("heard", text))

def type_forever():
    while True:
        events.put(("heard", input("You: ").strip()))


# ================= VOICE =================
def speak(text):
    print(f"{NAME}: {text}")
    if TYPE_MODE:
        return
    speaking.set()
    try:
        wav = "/tmp/pip_voice.wav"
        voice = os.path.join(MODELS, "voice.onnx")
        ok = subprocess.run([sys.executable, "-m", "piper", "-m", voice, "-f", wav, "--", text],
                            capture_output=True).returncode == 0
        if ok:
            subprocess.run(["aplay", "-q", wav])
        else:
            subprocess.run(["espeak-ng", "-p", "70", "-s", "160", text])
    finally:
        time.sleep(0.3)
        speaking.clear()


# ================= BRAIN =================
def think(history, eyes):
    seeing = ", ".join(eyes.seeing) if eyes and eyes.seeing else "nothing in particular"
    messages = [{"role": "system", "content": PERSONALITY + f"\nRight now your camera sees: {seeing}."}]
    messages += history[-16:]
    try:
        r = requests.post("http://localhost:11434/api/chat", timeout=120, json={
            "model": BRAIN_MODEL, "messages": messages, "stream": False,
            "keep_alive": "60m", "options": {"num_predict": 80, "temperature": 0.8},
        })
        return r.json()["message"]["content"].strip()
    except Exception as e:
        print("[brain] error:", e)
        return "Bzzt. My brain is still waking up. Is Ollama running?"


# ================= MAIN =================
def main():
    history = load_memory()
    eyes = None if TYPE_MODE else Eyes()
    threading.Thread(target=type_forever if TYPE_MODE else listen_forever, daemon=True).start()

    speak(f"Beep boop! {NAME} is awake.")
    while True:
        kind, text = events.get()
        if kind == "saw_person":
            history.append({"role": "user", "content": "(Someone just walked up to you. Greet them.)"})
        else:
            if not text:
                continue
            print("You said:", text)
            history.append({"role": "user", "content": text})
        reply = think(history, eyes)
        history.append({"role": "assistant", "content": reply})
        save_memory(history)
        speak(reply)

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print(f"\n{NAME} is going to sleep. Bye!")
