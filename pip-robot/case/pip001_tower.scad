// PIP001 tower case - modular, printable on a Creality K2 Plus (350 x 350 x 350 mm bed)
//
// Stack (bottom to top):
//   base plate (caster-wheel pads) -> MISR section (3 fans each side) -> floor plate
//   -> middle section -> floor plate (Pi crib sits on it) -> PIP section (front display)
//   -> roof plate (top fan) -> head (camera + speaker grille)
//
// The whole back is ONE door, held on by 10 x 3 mm magnets. It's too tall for the bed, so it
// prints as 3 panels that lock together with half-lap joints (glue them). Cords leave through
// notches in the door's edges, so they can be slipped in without unplugging anything.
//
// Export one part:  openscad -D 'part="misr"' -o misr.stl pip001_tower.scad
// part = "assembly" | "misr" | "middle" | "pip" | "plate_base" | "plate_floor" | "plate_floor_pi"
//        | "plate_roof" | "head" | "door_1" | "door_2" | "door_3" | "pi_crib" | "display_clip"
//        | "pin" | "pin_short"

part = "assembly";
$fn = 64;

// ---------- main sizes (mm) ----------
W = 300;            // outside width and depth
WALL = 4;
COL = 14;           // corner columns (strength, pins, magnets)
PLATE = 4;          // floor / roof plates
BASE_T = 6;         // base plate is thicker (it carries the wheels)
H_MISR = 280;       // bottom: MISR001, most of the fans
H_MID = 200;        // middle: extra stuff
H_PIP = 160;        // top: PIP001 (Raspberry Pi) + display
PIN_D = 5.2;
PIN_DEPTH = 12;
MAG_D = 10.4;       // 10 x 3 mm round magnets
MAG_T = 3.2;
DOOR_T = 6;
LAP = 20;           // half-lap joint between door panels

// heights in the stack
Z_MISR = BASE_T;
Z_MID = Z_MISR + H_MISR + PLATE;
Z_PIP = Z_MID + H_MID + PLATE;
Z_ROOF = Z_PIP + H_PIP;
H_TOWER = Z_ROOF + PLATE;               // = door height
DOOR_SPLITS = [0, 225, 445, H_TOWER];   // 3 panels, each fits on the bed

// head
HEAD_W = 150; HEAD_D = 130; HEAD_H = 120; HEAD_FRONT = 12; HEAD_COL = 10;

// fans
FAN80_HOLE = 76;  FAN80_SCREW = 71.5;
FAN120_HOLE = 116; FAN120_SCREW = 105;
FAN_SCREW_D = 4.4;

// display: a common cheap 7" HDMI LCD (1024x600). MEASURE YOURS and change these numbers.
DISP_MOD = [165, 100];    // whole screen module
DISP_VIEW = [155, 88];    // visible picture area (the window)
DISP_Z = H_PIP / 2 + 5;   // centre height inside the PIP section

// ---------- helpers ----------
module fan_cut(hole, screw, depth) {
    rotate([90, 0, 0]) {
        cylinder(d = hole, h = depth, center = true);
        for (sx = [-1, 1], sz = [-1, 1])
            translate([sx * screw / 2, sz * screw / 2, 0]) cylinder(d = FAN_SCREW_D, h = depth, center = true);
    }
}

module corner_positions(w = W, d = W, c = COL) {
    for (p = [[c / 2, c / 2], [w - c / 2, c / 2], [c / 2, d - c / 2], [w - c / 2, d - c / 2]])
        translate([p[0], p[1], 0]) children();
}

function mag_z(h) = [25, h - 25];   // magnet heights inside one section

module section(h) {
    difference() {
        union() {
            difference() {
                cube([W, W, h]);
                translate([WALL, WALL, -1]) cube([W - 2 * WALL, W - 2 * WALL, h + 2]);
                translate([COL, W - WALL - 1, -1]) cube([W - 2 * COL, WALL + 2, h + 2]);  // open back
            }
            corner_positions() translate([-COL / 2, -COL / 2, 0]) cube([COL, COL, h]);
        }
        corner_positions() {
            translate([0, 0, -1]) cylinder(d = PIN_D, h = PIN_DEPTH + 1);
            translate([0, 0, h - PIN_DEPTH]) cylinder(d = PIN_D, h = PIN_DEPTH + 1);
        }
        for (x = [COL / 2, W - COL / 2], z = mag_z(h))
            translate([x, W - MAG_T, z]) rotate([-90, 0, 0]) cylinder(d = MAG_D, h = MAG_T + 1);
    }
}

module vent_grid(w, d, hole = 8, gap = 14) {
    for (x = [0 : gap : w], y = [0 : gap : d]) translate([x, y, 0]) cylinder(d = hole, h = 50, center = true, $fn = 6);
}

module plate_holes() { corner_positions() cylinder(d = PIN_D, h = 50, center = true); }

// cord holes between floors: one in each back corner
module floor_cord_holes() {
    translate([COL + 12, W - 60, -1]) cube([60, 32, 20]);
    translate([W - COL - 72, W - 60, -1]) cube([60, 32, 20]);
}

// caster wheel pads: slots fit square mounting plates with hole spacing from about 24 to 45 mm
CASTER_IN = 50;
module plate_base() {
    difference() {
        union() {
            cube([W, W, BASE_T]);
            corner_positions(W, W, 2 * CASTER_IN) translate([-30, -30, -6]) cube([60, 60, 6]);
        }
        corner_positions() translate([0, 0, -20]) cylinder(d = PIN_D, h = 50);
        intersection() {   // intake vents
            translate([90, 40, -10]) cube([W - 180, W - 80, 30]);
            translate([90, 40, 0]) vent_grid(W - 180, W - 80, 10, 16);
        }
        corner_positions(W, W, 2 * CASTER_IN) for (a = [45, 135, 225, 315]) rotate([0, 0, a])
            hull() { translate([17, 0, -20]) cylinder(d = 5.5, h = 40); translate([32, 0, -20]) cylinder(d = 5.5, h = 40); }
        translate([W / 2 - 35, W - 70, -20]) cube([70, 40, 40]);   // motor / wheel wires
    }
}

module plate_floor(pi = false) {
    difference() {
        cube([W, W, PLATE]);
        plate_holes();
        intersection() {
            translate([30, 30, -1]) cube([W - 60, W - 110, 10]);
            translate([30, 30, 0]) vent_grid(W - 60, W - 110);
        }
        floor_cord_holes();
        if (pi) for (p = crib_screws()) translate([p[0], p[1], 0]) cylinder(d = 3.4, h = 50, center = true);
    }
}

module plate_roof() {
    difference() {
        cube([W, W, PLATE]);
        plate_holes();
        translate([W / 2 - 25, HEAD_FRONT + HEAD_D / 2 - 15, -1]) cube([50, 30, 10]);   // head cables
        translate([(W - HEAD_W) / 2, HEAD_FRONT, 0]) corner_positions(HEAD_W, HEAD_D, HEAD_COL) cylinder(d = PIN_D, h = 50, center = true);
        translate([W / 2, 222, 0]) rotate([-90, 0, 0]) fan_cut(FAN120_HOLE, FAN120_SCREW, 50);
    }
}

module head() {
    difference() {
        union() {
            difference() {
                cube([HEAD_W, HEAD_D, HEAD_H]);
                translate([WALL, WALL, -1]) cube([HEAD_W - 2 * WALL, HEAD_D - 2 * WALL, HEAD_H - WALL + 1]);
            }
            corner_positions(HEAD_W, HEAD_D, HEAD_COL) translate([-HEAD_COL / 2, -HEAD_COL / 2, 0]) cube([HEAD_COL, HEAD_COL, HEAD_H - WALL]);
            translate([HEAD_W / 2 - 18, WALL, HEAD_H - 48]) cube([36, 3, 30]);   // camera pad
        }
        corner_positions(HEAD_W, HEAD_D, HEAD_COL) translate([0, 0, -1]) cylinder(d = PIN_D, h = PIN_DEPTH + 1);
        // camera eye: lens hole + M2 holes (21 x 12.5 mm - check against your AI Camera)
        translate([HEAD_W / 2, 0, HEAD_H - 33]) {
            rotate([-90, 0, 0]) cylinder(d = 16, h = 30, center = true);
            for (sx = [-1, 1], sz = [-1, 1])
                translate([sx * 10.5, 0, sz * 6.25 - 3]) rotate([-90, 0, 0]) cylinder(d = 2.2, h = 30, center = true);
        }
        for (cx = [0 : 9], cz = [0 : 4])   // speaker grille
            translate([HEAD_W / 2 - 40.5 + cx * 9, 0, 18 + cz * 9]) rotate([-90, 0, 0]) cylinder(d = 5, h = 30, center = true, $fn = 16);
        translate([HEAD_W / 2, HEAD_D, 25]) rotate([90, 0, 0]) cylinder(d = 22, h = 30, center = true);   // cables out the back
    }
}

// ---------- the one back door ----------
CORD_NOTCHES = [   // [height from bottom, width] on BOTH side edges (kept clear of the magnets)
    [70, 10], [130, 16], [190, 24], [300, 10], [360, 16], [500, 10], [560, 24], [600, 16]
];
MAG_ZS = concat([for (z = mag_z(H_MISR)) Z_MISR + z], [for (z = mag_z(H_MID)) Z_MID + z], [for (z = mag_z(H_PIP)) Z_PIP + z]);

module door_full() {
    difference() {
        cube([W, DOOR_T, H_TOWER]);
        for (x = [COL / 2, W - COL / 2], zz = MAG_ZS)
            translate([x, -0.01, zz]) rotate([-90, 0, 0]) cylinder(d = MAG_D, h = MAG_T);
        // cord notches: open to the edge, so a cord slides in sideways
        for (n = CORD_NOTCHES, side = [0, 1])
            translate([side == 0 ? -1 : W - 31, -1, n[0] - n[1] / 2]) cube([32, DOOR_T + 2, n[1]]);
        translate([W / 2 - 50, -1, -1]) cube([100, DOOR_T + 2, 30]);                // power strip / wall plug
        translate([W - 60, -1, 80]) rotate([-90, 0, 0]) cylinder(d = 16.2, h = 20);  // 16 mm power button
        for (z = [H_TOWER * 0.3, H_TOWER * 0.62])                                    // finger pulls
            translate([W / 2, DOOR_T + 1, z]) rotate([90, 0, 0]) cylinder(d = 34, h = 3.5);
        for (zz = [Z_MISR + 40 : 14 : Z_MISR + H_MISR - 40])                         // exhaust vents
            translate([60, -1, zz]) cube([W - 120, DOOR_T + 2, 5]);
    }
}

// Joints: panels 1 and 3 give the OUTER half of each overlap, panel 2 gives the INNER half.
// That way every panel's tabs are on one face, so each prints flat with no overhangs.
module door_panel(k) {
    a = DOOR_SPLITS[k]; b = DOOR_SPLITS[k + 1];
    outer = [-1, DOOR_T / 2, 0]; inner = [-1, -1, 0];
    intersection() {
        door_full();
        union() {
            if (k == 0) {
                translate([-1, -1, -1]) cube([W + 2, DOOR_T + 2, b + 1]);
                translate(outer + [0, 0, b]) cube([W + 2, DOOR_T / 2 + 1, LAP]);
            }
            if (k == 1) {
                translate(inner + [0, 0, a]) cube([W + 2, DOOR_T / 2 + 1, LAP]);
                translate([-1, -1, a + LAP]) cube([W + 2, DOOR_T + 2, b - a - LAP]);
                translate(inner + [0, 0, b]) cube([W + 2, DOOR_T / 2 + 1, LAP]);
            }
            if (k == 2) {
                translate(outer + [0, 0, a]) cube([W + 2, DOOR_T / 2 + 1, LAP]);
                translate([-1, -1, a + LAP]) cube([W + 2, DOOR_T + 2, b - a - LAP + 1]);
            }
        }
    }
}

// ---------- Raspberry Pi crib ----------
PI_L = 85; PI_W = 56; CRIB_GAP = 3; CRIB_WALL = 3; CRIB_H = 14;
CRIB_X = COL + 10; CRIB_Y = W - COL - 10 - (PI_W + 2 * CRIB_GAP + 2 * CRIB_WALL) - 45;  // back-left, clear of the cord hole
function crib_size() = [PI_L + 2 * CRIB_GAP + 2 * CRIB_WALL, PI_W + 2 * CRIB_GAP + 2 * CRIB_WALL];
function crib_screws() = [[CRIB_X + 6, CRIB_Y + 6], [CRIB_X + crib_size()[0] - 6, CRIB_Y + crib_size()[1] - 6]];

module pi_crib() {
    s = crib_size();
    difference() {
        union() {
            cube([s[0], s[1], 3]);
            for (cx = [0, 1], cy = [0, 1]) translate([cx * (s[0] - 20), cy * (s[1] - CRIB_WALL), 0]) cube([20, CRIB_WALL, CRIB_H]);
            for (cx = [0, 1], cy = [0, 1]) translate([cx * (s[0] - CRIB_WALL), cy * (s[1] - 16), 0]) cube([CRIB_WALL, 16, CRIB_H]);
            for (p = [[3.5, 3.5], [61.5, 3.5], [3.5, 52.5], [61.5, 52.5]])
                translate([CRIB_WALL + CRIB_GAP + p[0], CRIB_WALL + CRIB_GAP + p[1], 0]) cylinder(d = 6, h = 8);
        }
        for (p = [[3.5, 3.5], [61.5, 3.5], [3.5, 52.5], [61.5, 52.5]])
            translate([CRIB_WALL + CRIB_GAP + p[0], CRIB_WALL + CRIB_GAP + p[1], -1]) cylinder(d = 2.4, h = 20);
        for (p = crib_screws()) translate([p[0] - CRIB_X, p[1] - CRIB_Y, -1]) cylinder(d = 3.4, h = 10);
        translate([22, 18, -1]) cube([s[0] - 44, s[1] - 36, 10]);
    }
}

// ---------- sections ----------
module misr() {
    difference() {
        section(H_MISR);
        for (x = [WALL / 2, W - WALL / 2], y = [62, 150, 238])
            translate([x, y, H_MISR / 2]) rotate([0, 0, 90]) fan_cut(FAN80_HOLE, FAN80_SCREW, WALL + 4);
    }
}

module middle() { section(H_MID); }

// display window in the front, with two angled ledges inside (no supports needed) that clips screw onto
module pip() {
    L = DISP_MOD[0] + 8;
    difference() {
        union() {
            section(H_PIP);
            for (dz = [-1, 1]) hull() {
                translate([W / 2 - L / 2, WALL, DISP_Z + dz * (DISP_MOD[1] / 2 + 4) - 2]) cube([L, 9, 4]);
                translate([W / 2 - L / 2, WALL, DISP_Z + dz * (DISP_MOD[1] / 2 + 4) - 11]) cube([L, 0.5, 4]);
            }
        }
        translate([W / 2 - DISP_VIEW[0] / 2, -1, DISP_Z - DISP_VIEW[1] / 2]) cube([DISP_VIEW[0], WALL + 2, DISP_VIEW[1]]);
        for (sx = [-1, 1], dz = [-1, 1])
            translate([W / 2 + sx * (DISP_MOD[0] / 2 - 15), WALL + 6, DISP_Z + dz * (DISP_MOD[1] / 2 + 4)]) cylinder(d = 2.6, h = 30, center = true);
    }
}

// clip that screws to a ledge and holds the screen against the window
module display_clip() {
    difference() {
        union() { cube([20, 14, 3]); cube([20, 3, 12]); }
        translate([10, 8, -1]) cylinder(d = 3.2, h = 10);
    }
}

module pin() { cylinder(d = 4.8, h = 2 * PIN_DEPTH + PLATE - 2); }
module pin_short() { cylinder(d = 4.8, h = PIN_DEPTH + PLATE - 1); }

module assembly() {
    color("dimgray") plate_base();
    color("silver") translate([0, 0, Z_MISR]) misr();
    color("black") translate([0, 0, Z_MISR + H_MISR]) plate_floor();
    color("silver") translate([0, 0, Z_MID]) middle();
    color("black") translate([0, 0, Z_MID + H_MID]) plate_floor(true);
    color("orange") translate([CRIB_X, CRIB_Y, Z_PIP]) pi_crib();
    color("silver") translate([0, 0, Z_PIP]) pip();
    color("deepskyblue") translate([W / 2 - DISP_VIEW[0] / 2, 0.5, Z_PIP + DISP_Z - DISP_VIEW[1] / 2]) cube([DISP_VIEW[0], 1, DISP_VIEW[1]]);
    color("black") translate([0, 0, Z_ROOF]) plate_roof();
    color("white") translate([(W - HEAD_W) / 2, HEAD_FRONT, Z_ROOF + PLATE]) head();
    color("gray", 0.7) translate([0, W + 25, 0]) door_full();   // shown pulled back
}

if (part == "assembly") assembly();
else if (part == "misr") misr();
else if (part == "middle") middle();
else if (part == "pip") pip();
else if (part == "plate_base") rotate([180, 0, 0]) plate_base();   // print wheel-pads-up
else if (part == "plate_floor") plate_floor();
else if (part == "plate_floor_pi") plate_floor(true);
else if (part == "plate_roof") plate_roof();
else if (part == "head") rotate([180, 0, 0]) head();               // print top-down
else if (part == "door_1") rotate([-90, 0, 0]) door_panel(0);
else if (part == "door_2") rotate([90, 0, 0]) door_panel(1);        // inner face down
else if (part == "door_3") rotate([-90, 0, 0]) door_panel(2);
else if (part == "pi_crib") pi_crib();
else if (part == "display_clip") display_clip();
else if (part == "pin") pin();
else if (part == "pin_short") pin_short();
else if (part == "door_full") door_full();     // for checking only
