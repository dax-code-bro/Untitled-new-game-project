#!/usr/bin/env node
// Episode 1 sound mixer - a thin wrapper (engine phase 6): the mixer moved to scenes/lib/sound/mix.mjs, which takes
// --episode (default s01e01) and reads this folder's beds.json, fx/spots.json and music/cues.json for Episode 1.
// Same arguments, same output as before (byte-identical mix.wav for --cut 1C).
//
//   node episodes/s01e01/final/sound/mix.mjs [--cut PROLOGUE-TITLE-1A] [--work DIR] [--out DIR]
//        [--no-mux] [--no-music] [--no-fx] [--keep-work] [--edl F --cues F --video F]
import '../../../../scenes/lib/sound/mix.mjs';
