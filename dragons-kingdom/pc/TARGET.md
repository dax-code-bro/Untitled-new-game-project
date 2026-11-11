# Daxtyn's render PC (described 2026-10-18; graphics card corrected 2026-11-11)

- Operating system: **Windows**
- Graphics card: **NVIDIA GeForce RTX 5090** (32 GB video memory, Blackwell). Daxtyn on 2026-11-11: "Turns out I have a 5090"
  (on 2026-10-18 he had said a 4090, "I'm pretty sure"). The GPU check confirms the real model.
  Blackwell cards need a current NVIDIA driver (570 series or newer); the render path is Chrome WebGL2 through
  ANGLE / Direct3D 11, so no CUDA, PyTorch or Blender GPU build is involved (bpy only builds character caches, on the CPU).
- Free disk space: **about 2 TB**

The render kit targets this PC first. `node render/gpu-check.mjs` reports the real GPU name and the measured speed.
