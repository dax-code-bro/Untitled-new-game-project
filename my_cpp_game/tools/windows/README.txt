LEGEND ENGINE -- NATIVE BUILD (Windows, OpenGL 4.6)
====================================================

Double-click one of the "Explore - ..." files. Each opens fullscreen at
your monitor's own resolution (a 4K monitor renders a 4K frame).

  Explore - Showcase               the golden-hour plaza, every effect on
  Explore - Showcase (cinematic)   8192 shadows, 4096 textures, max samples
  Explore - Bunker Nine / Coastline   the zombies maps, exported from the game
  Explore - Helipad / Resort / Town / Demolition   the multiplayer maps

WHAT THIS IS: the game's renderer and maps running natively on your
graphics card. You fly through the maps; the gameplay itself (zombies,
guns, matches) is still in the web version and is not in this build yet.
  Screenshot - 8K Showcase        renders a 7680x4320 PNG next to the .exe
  Windowed                        a 1600x900 window instead of fullscreen

CONTROLS
  W A S D      move          Q / E    down / up
  Right mouse  hold to look  Shift    move faster
  1 - 6        jump between the showcase's camera shots
  F12          save screenshot.png      Esc   quit

LIVE TUNING
  Edit scripts\look.ini while the game runs and save it: the sun, sky, fog,
  bloom, exposure and every other look setting update on the next frame.
  Shaders in shaders\ reload the same way.

REQUIREMENTS
  Windows 10 or 11, 64-bit, and a graphics card with OpenGL 4.5 or newer --
  any NVIDIA GTX 600 or later, AMD Radeon HD 7000 / RX or later, or Intel
  UHD 600 or later, with a current driver.
  Video memory: about 1.5 GB at the default 2048 textures; about 5 GB for
  the 4096 (4K) textures the cinematic and map launchers use. If a 4K
  launcher runs out of memory, edit it and change 4096 to 2048.

COMMAND LINE (my_cpp_game.exe --help style)
  --fullscreen | --width W --height H     window
  --quality ultra|cinematic               effect budget
  --texture-res 512..4096                 procedural texture size
  --scale 2                               supersample 2x2 (sharpest, slowest)
  --scene scenes\coastline.lescene        load an exported map
  --screenshot out.png                    render offscreen at W x H and exit
  --set post.exposure=1.2                 override any look setting
  --disable ssr,volumetric,...            switch individual passes off

The phone keeps the web version: phones do not run desktop OpenGL.
