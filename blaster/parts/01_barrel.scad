// ============================================================
//  PART 01 — BARREL
// ============================================================
//  Guides the foam dart as the air charge pushes it out.
//  A smooth bore sized just over the dart OD so the dart
//  seals lightly but doesn't jam.
//
//  Suggested material: CF-PLA or PETG (rigid, smooth inside).
//  Print upright (muzzle down) for the roundest bore, or lay
//  flat with supports if your bed is short.
// ============================================================

include <../params.scad>

// ---- barrel-specific params ----
barrel_len      = 75.0;                     // a bit longer than a dart
barrel_id       = dart_od + barrel_clearance; // bore diameter
barrel_wall     = 2.4;                       // barrel is thinner than default
barrel_od       = barrel_id + 2*barrel_wall;
leadin_len      = 6.0;                        // funnel at breech end
mount_ring_th   = 4.0;                        // mounting flange thickness
mount_ring_od   = barrel_od + 8.0;

module barrel() {
    difference() {
        union() {
            // main tube
            cylinder(h = barrel_len, d = barrel_od);
            // mounting flange at the breech (bottom) end
            cylinder(h = mount_ring_th, d = mount_ring_od);
        }

        // through bore
        translate([0,0,-1])
            cylinder(h = barrel_len + 2, d = barrel_id);

        // lead-in funnel at breech so darts feed in easily
        translate([0,0,-0.01])
            cylinder(h = leadin_len,
                     d1 = barrel_id + 3.0,
                     d2 = barrel_id);

        // two mounting screw holes through the flange
        for (a = [0, 180])
            rotate([0,0,a])
                translate([mount_ring_od/2 - 3.5, 0, -1])
                    cylinder(h = mount_ring_th + 2,
                             d = screw_dia + screw_clearance);
    }
}

barrel();
