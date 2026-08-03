// ============================================================
//  DEMO — see the snap-fit hook engage its catch window
// ============================================================
//  Open in OpenSCAD, press F5. The blue hook's barb pokes
//  through the window in the silver catch plate = locked.
//  This just visualizes the fit; the real shell will use
//  snap_hook() on one half and snap_window() cut into the other.
// ============================================================

include <../lib/snapfit.scad>

// hook on shell A
color("SteelBlue") snap_hook();

// catch on shell B (barb should poke through the window)
color("Silver")    snap_catch();

// --- a full edge: several hooks spaced along a shell rim ---
translate([0, 0, 40]) {
    edge_len   = 90;
    hook_pitch = 30;   // spacing between hooks
    for (z = [0 : hook_pitch : edge_len])
        translate([0, 0, z - edge_len/2])
            color("SteelBlue") snap_hook();
}
