// ============================================================
//  SNAP-FIT LIBRARY — cantilever hooks + catch windows
// ============================================================
//  Two mating pieces:
//    * snap_hook()  -> the little hook/barb tab (goes on shell A)
//    * snap_catch() -> a plate with a window the barb locks into
//                      (in a real shell you SUBTRACT snap_window()
//                       from shell B's edge instead of adding a plate)
//
//  How it locks / releases:
//    - Insertion: the barb's shallow top ramp lets it flex inward
//      and slide through the window, then spring back out = LOCKED.
//    - Release: the barb's underside (retention face) is ANGLED, so
//      a firm pull cams it back inward and it pops free = EASY APART.
//    Raise `snap_ret_rise` -> easier to pull apart.
//    Lower it toward 0 -> grips harder (0 ≈ permanent).
//
//  LOCAL FRAME for these modules:
//    +X = barb protrusion direction
//    +Y = height / insertion travel
//     Z = clip width (centered on 0)
//  Place/rotate them onto the shell edge as needed.
// ============================================================

include <../params.scad>

// ---- snap tuning (adjust to taste, then reprint one to test) ----
snap_w         = 8.0;   // clip width
snap_t         = 2.0;   // beam thickness — thinner = flexier/easier
snap_len       = 12.0;  // cantilever length — longer = flexier
snap_barb      = 1.8;   // how far the barb sticks out (the "bite")
snap_barb_h    = 3.0;   // barb height along the beam
snap_ret_rise  = 1.2;   // retention-face slope; bigger = easier release
snap_base_d    = 4.0;   // foot that bonds the hook to the shell wall
snap_base_h    = 3.0;   // foot height
snap_win_clear = 0.4;   // clearance around the barb in the window

// --- the hook/barb tab -------------------------------------------
module snap_hook() {
    zb = snap_len - snap_barb_h;   // where the barb starts up the beam
    linear_extrude(height = snap_w, center = true) {
        // beam + barb (profile: X = protrusion, Y = height)
        polygon([
            [0, 0],
            [snap_t, 0],
            [snap_t, zb],
            [snap_t + snap_barb, zb + snap_ret_rise], // angled retention face
            [snap_t, snap_len],                        // shallow insertion ramp
            [0, snap_len],
        ]);
        // foot: bonds flat onto the shell wall behind the beam
        polygon([
            [-snap_base_d, 0],
            [0, 0],
            [0, snap_base_h],
            [-snap_base_d, snap_base_h],
        ]);
    }
}

// --- the window NEGATIVE: subtract this from shell B's edge wall ---
// wall_th = thickness of the wall you're cutting the window into.
module snap_window(wall_th = 1.5) {
    zb  = snap_len - snap_barb_h;
    wh  = snap_barb_h + 2*snap_win_clear;   // window height
    ww  = snap_w + 2*snap_win_clear;        // window width
    translate([snap_t - 0.5, zb - snap_win_clear, -ww/2])
        cube([wall_th + 1.0, wh, ww]);
}

// --- a demo catch plate (for visualizing engagement only) ---------
module snap_catch(plate_th = 1.5) {
    difference() {
        translate([snap_t, -2, -(snap_w/2 + 3)])
            cube([plate_th, snap_len + 6, snap_w + 6]);
        snap_window(plate_th);
    }
}
