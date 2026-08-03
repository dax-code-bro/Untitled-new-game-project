// ============================================================
//  FOAM DART BLASTER — SHARED PARAMETERS
// ============================================================
//  Every part file includes this so all pieces agree on
//  dart size, clearances, and material. Change a number here
//  and every part updates. Units are millimeters.
//
//  Design target: spring-plunger blaster firing standard
//  Nerf Elite foam darts (the blue/orange 72mm foam darts).
// ============================================================

// ---------- THE DART (do not guess — measure yours) ----------
// Standard Nerf Elite dart, measured with calipers:
dart_od        = 13.0;   // foam outer diameter
dart_len       = 72.0;   // full dart length incl. tip
dart_tip_len   = 8.0;    // soft tip length (front)

// ---------- FIT / TOLERANCE ----------
// FDM prints come out a touch oversized on holes. These are the
// clearances added so foam feeds and parts slide. Carbon-fiber
// filaments print dimensionally stiff, so ~0.3–0.4mm is a good
// sliding fit. Tune after a test print.
barrel_clearance   = 0.4;   // added to dart_od for the barrel bore
slide_clearance    = 0.35;  // sliding fits (plunger, priming rail)
press_clearance    = 0.10;  // press/pin fits
screw_clearance    = 0.30;  // clearance holes for screws

// ---------- WALLS / GENERAL ----------
wall           = 3.0;    // default structural wall thickness
$fn            = 96;     // curve smoothness for preview/render

// ---------- HARDWARE (buy these — sizes we'll design around) ----------
main_spring_od     = 18.0;  // main plunger spring outer dia
main_spring_len    = 90.0;  // free length
main_spring_wire   = 1.4;   // wire gauge
trigger_spring_od  = 6.0;   // small return spring for trigger
mag_spring_od      = 10.0;  // magazine follower spring
screw_dia          = 3.0;   // M3 body screws
pin_dia            = 3.0;   // 3mm steel pivot pins

// ============================================================
//  MATERIAL PLAN  (what filament each part should print in)
// ============================================================
//  Filled in as we design each part. "CF" = carbon-fiber
//  reinforced (needs a hardened steel nozzle!).
//
//   Part            Material         Why
//   --------------  ---------------  --------------------------
//   Barrel          CF-PLA/PETG      rigid, smooth bore
//   Plunger tube    CF-Nylon/PETG    takes repeated stress
//   Plunger head    PLA + rubber     seal surface
//   Trigger/catch   CF-Nylon         high wear, must not snap
//   Priming handle  CF-PLA           stiffness
//   Shell halves    PLA or PETG      big, cosmetic, low stress
//   Grip            TPU or PLA       comfort vs. rigidity
// ============================================================
