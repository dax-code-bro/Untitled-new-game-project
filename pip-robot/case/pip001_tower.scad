// PIP001 tower case - modular, printable on a Creality K2 Plus (350 x 350 x 350 mm bed)
//
// Stack (bottom to top):
//   base plate -> MISR section (3 fans each side) -> floor plate -> middle section
//   -> floor plate (Pi crib sits on it) -> PIP section -> roof plate (top fan) -> head
//
// Every section is an open-backed tube. A removable back door (held by 10x3 mm magnets)
// covers each one. Sections and plates line up with printed pins in the corner columns.
//
// Export one part at a time:  openscad -D 'part="misr"' -o misr.stl pip001_tower.scad
// part = "assembly" | "misr" | "middle" | "pip" | "plate_base" | "plate_floor" | "plate_floor_pi"
//        | "plate_roof" | "head" | "door_misr" | "door_middle" | "door_pip" | "pi_crib" | "pin"

part = "assembly";
$fn = 64;

// ---------- main sizes (mm) ----------
W = 300;            // outside width and depth (fits the 350 mm bed with room for a brim)
WALL = 4;           // wall thickness
COL = 14;           // corner column size (strength + pin holes + magnets)
PLATE = 4;          // floor / roof plate thickness
H_MISR = 280;       // bottom section: MISR001, most of the fans
H_MID = 200;        // middle section: extra stuff
H_PIP = 160;        // top section: PIP001 (Raspberry Pi)
PIN_D = 5.2;        // pin hole
PIN_DEPTH = 12;
MAG_D = 10.4;       // 10 x 3 mm round magnets
MAG_T = 3.2;
DOOR_T = 4;

// head
HEAD_W = 150; HEAD_D = 130; HEAD_H = 120; HEAD_FRONT = 12;   // gap from the tower's front edge
HEAD_COL = 10;

// fans
FAN80_HOLE = 76;  FAN80_SCREW = 71.5;
FAN120_HOLE = 116; FAN120_SCREW = 105;
FAN_SCREW_D = 4.4;

// ---------- helpers ----------
module fan_cut(hole, screw, depth) {
    // cut through a wall lying in the XZ plane (cut along Y)
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

// open-backed tube with corner columns, pin holes and door magnets
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
        // pin holes top and bottom
        corner_positions() {
            translate([0, 0, -1]) cylinder(d = PIN_D, h = PIN_DEPTH + 1);
            translate([0, 0, h - PIN_DEPTH]) cylinder(d = PIN_D, h = PIN_DEPTH + 1);
        }
        // magnet pockets in the back faces of the two back columns
        for (x = [COL / 2, W - COL / 2], z = [25, h - 25])
            translate([x, W - MAG_T, z]) rotate([-90, 0, 0]) cylinder(d = MAG_D, h = MAG_T + 1);
    }
}

module vent_grid(w, d, hole = 8, gap = 14) {
    for (x = [0 : gap : w], y = [0 : gap : d]) translate([x, y, 0]) cylinder(d = hole, h = 50, center = true, $fn = 6);
}

module plate_holes() { corner_positions() cylinder(d = PIN_D, h = 50, center = true); }

module plate_base() {
    difference() {
        cube([W, W, PLATE]);
        plate_holes();
        // big intake vent for the MISR fans
        intersection() {
            translate([40, 40, 0]) cube([W - 80, W - 80, 50], center = false);
            translate([40, 40, 0]) vent_grid(W - 80, W - 80, 10, 16);
        }
    }
    // feet
    corner_positions(W, W, 40) translate([0, 0, -6]) difference() {
        cylinder(d = 26, h = 6);
        translate([0, 0, -1]) cylinder(d = PIN_D, h = 10);
    }
}

module plate_floor(pi = false) {
    difference() {
        cube([W, W, PLATE]);
        plate_holes();
        // air flows up through the tower
        intersection() {
            translate([30, 30, -1]) cube([W - 60, W - 110, 10]);
            translate([30, 30, 0]) vent_grid(W - 60, W - 110);
        }
        // cable pass-through (back right)
        translate([W - 110, W - 60, -1]) cube([70, 32, 10]);
        // Pi crib screw holes (crib sits in the back-left corner)
        if (pi) for (p = crib_screws()) translate([p[0], p[1], 0]) cylinder(d = 3.4, h = 50, center = true);
    }
}

module plate_roof() {
    difference() {
        cube([W, W, PLATE]);
        plate_holes();
        // head cable hole (under the head)
        translate([W / 2 - 25, HEAD_FRONT + HEAD_D / 2 - 15, -1]) cube([50, 30, 10]);
        // head pin holes
        translate([(W - HEAD_W) / 2, HEAD_FRONT, 0]) corner_positions(HEAD_W, HEAD_D, HEAD_COL) cylinder(d = PIN_D, h = 50, center = true);
        // top exhaust fan (120 mm) behind the head
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
            // camera mounting pad inside the front wall
            translate([HEAD_W / 2 - 18, WALL, HEAD_H - 48]) cube([36, 3, 30]);
        }
        corner_positions(HEAD_W, HEAD_D, HEAD_COL) translate([0, 0, -1]) cylinder(d = PIN_D, h = PIN_DEPTH + 1);
        // camera "eye": lens hole + M2 holes (21 x 12.5 mm pattern - check against your AI Camera)
        translate([HEAD_W / 2, 0, HEAD_H - 33]) {
            rotate([-90, 0, 0]) cylinder(d = 16, h = 30, center = true);
            for (sx = [-1, 1], sz = [-1, 1])
                translate([sx * 10.5, 0, sz * 6.25 - 3]) rotate([-90, 0, 0]) cylinder(d = 2.2, h = 30, center = true);
        }
        // speaker grille below the camera
        for (cx = [0 : 9], cz = [0 : 4]) translate([HEAD_W / 2 - 40.5 + cx * 9, 0, 18 + cz * 9]) rotate([-90, 0, 0]) cylinder(d = 5, h = 30, center = true, $fn = 16);
        // a few vents on the sides
        for (i = [0 : 3]) translate([-1, 30 + i * 18, 40]) cube([HEAD_W + 2, 6, 40]);
    }
}

module door(h, power_button = false) {
    difference() {
        cube([W, DOOR_T, h]);
        for (x = [COL / 2, W - COL / 2], z = [25, h - 25])
            translate([x, -0.01, z]) rotate([-90, 0, 0]) cylinder(d = MAG_D, h = MAG_T);
        // finger notch to pull it off
        translate([W / 2, DOOR_T + 2, h - 30]) rotate([90, 0, 0]) cylinder(d = 30, h = 3);
        // vents
        for (i = [0 : floor((h - 80) / 12)]) translate([60, -1, 40 + i * 12]) cube([W - 120, DOOR_T + 2, 5]);
        if (power_button) {
            translate([W - 45, -1, h - 50]) rotate([-90, 0, 0]) cylinder(d = 16.2, h = 20);   // 16 mm push button
            translate([45, -1, 30]) rotate([-90, 0, 0]) cylinder(d = 40, h = 20);              // power cables in
        }
    }
}

// Raspberry Pi 5 "crib": base plate, 4 M2.5 standoffs, corner walls so it can't slide off
PI_L = 85; PI_W = 56; CRIB_GAP = 3; CRIB_WALL = 3; CRIB_H = 14;
CRIB_X = COL + 10; CRIB_Y = W - COL - 10 - (PI_W + 2 * CRIB_GAP + 2 * CRIB_WALL);   // back-left corner
function crib_size() = [PI_L + 2 * CRIB_GAP + 2 * CRIB_WALL, PI_W + 2 * CRIB_GAP + 2 * CRIB_WALL];
function crib_screws() = [[CRIB_X + 6, CRIB_Y + 6], [CRIB_X + crib_size()[0] - 6, CRIB_Y + crib_size()[1] - 6]];

module pi_crib() {
    s = crib_size();
    difference() {
        union() {
            cube([s[0], s[1], 3]);
            // corner walls only, so every port stays reachable
            for (cx = [0, 1], cy = [0, 1]) translate([cx * (s[0] - 20), cy * (s[1] - CRIB_WALL), 0]) cube([20, CRIB_WALL, CRIB_H]);
            for (cx = [0, 1], cy = [0, 1]) translate([cx * (s[0] - CRIB_WALL), cy * (s[1] - 16), 0]) cube([CRIB_WALL, 16, CRIB_H]);
            // standoffs at the Pi 5 hole pattern (58 x 49 mm, 3.5 mm in from the edge)
            for (p = [[3.5, 3.5], [61.5, 3.5], [3.5, 52.5], [61.5, 52.5]])
                translate([CRIB_WALL + CRIB_GAP + p[0], CRIB_WALL + CRIB_GAP + p[1], 0]) cylinder(d = 6, h = 8);
        }
        for (p = [[3.5, 3.5], [61.5, 3.5], [3.5, 52.5], [61.5, 52.5]])
            translate([CRIB_WALL + CRIB_GAP + p[0], CRIB_WALL + CRIB_GAP + p[1], -1]) cylinder(d = 2.4, h = 20);
        // screw-down holes + airflow under the Pi
        for (p = crib_screws()) translate([p[0] - CRIB_X, p[1] - CRIB_Y, -1]) cylinder(d = 3.4, h = 10);
        translate([22, 18, -1]) cube([s[0] - 44, s[1] - 36, 10]);
    }
}

module misr() {
    difference() {
        section(H_MISR);
        // 3 x 80 mm fans on the left and right sides
        for (x = [WALL / 2, W - WALL / 2], y = [62, 150, 238])
            translate([x, y, H_MISR / 2]) rotate([0, 0, 90]) fan_cut(FAN80_HOLE, FAN80_SCREW, WALL + 4);
        // front intake slots
        for (i = [0 : 10]) translate([60 + i * 18, -1, 40]) cube([8, WALL + 2, H_MISR - 80]);
    }
}

module middle() {
    difference() {
        section(H_MID);
        for (i = [0 : 10]) translate([60 + i * 18, -1, 40]) cube([8, WALL + 2, H_MID - 80]);
    }
}

module pip() {
    difference() {
        section(H_PIP);
        // status light slots on the front (for an LED strip behind them)
        for (i = [0 : 10]) translate([60 + i * 18, -1, 50]) cube([8, WALL + 2, 60]);
    }
}

module pin() { cylinder(d = 4.8, h = 2 * PIN_DEPTH + PLATE - 2); }

module assembly() {
    color("dimgray") plate_base();
    z1 = PLATE;
    color("silver") translate([0, 0, z1]) misr();
    color("black") translate([0, 0, z1 + H_MISR]) plate_floor();
    z2 = z1 + H_MISR + PLATE;
    color("silver") translate([0, 0, z2]) middle();
    color("black") translate([0, 0, z2 + H_MID]) plate_floor(true);
    z3 = z2 + H_MID + PLATE;
    color("orange") translate([CRIB_X, CRIB_Y, z3]) pi_crib();
    color("silver") translate([0, 0, z3]) pip();
    color("black") translate([0, 0, z3 + H_PIP]) plate_roof();
    color("white") translate([(W - HEAD_W) / 2, HEAD_FRONT, z3 + H_PIP + PLATE]) head();
    // doors on the back (shown slightly pulled out)
    color("gray", 0.6) {
        translate([0, W + 20, z1]) door(H_MISR, true);
        translate([0, W + 20, z2]) door(H_MID);
        translate([0, W + 20, z3]) door(H_PIP);
    }
}

if (part == "assembly") assembly();
else if (part == "misr") misr();
else if (part == "middle") middle();
else if (part == "pip") pip();
else if (part == "plate_base") rotate([180, 0, 0]) plate_base();      // print feet-up
else if (part == "plate_floor") plate_floor();
else if (part == "plate_floor_pi") plate_floor(true);
else if (part == "plate_roof") plate_roof();
else if (part == "head") rotate([180, 0, 0]) head();                  // print top-down, no supports
else if (part == "door_misr") rotate([-90, 0, 0]) door(H_MISR, true);
else if (part == "door_middle") rotate([-90, 0, 0]) door(H_MID);
else if (part == "door_pip") rotate([-90, 0, 0]) door(H_PIP);
else if (part == "pi_crib") pi_crib();
else if (part == "pin") pin();
