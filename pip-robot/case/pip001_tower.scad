// PIP001 tower case v3 - the 4 Dell towers live inside as MISR001
// Printable on a Creality K2 Plus (350 x 350 x 350 mm bed).
//
// Stack (bottom to top):
//   base plate (caster pads)
//   MISR-A section: Dell #1 and #2, lying flat, stacked on each other
//   ring plate (open middle, so the Dells stack straight through)
//   MISR-B section: Dell #3 and #4
//   floor plate
//   middle section: network switch, power strip, extra stuff
//   floor plate (Pi crib sits on it)
//   PIP section: Raspberry Pi + front display
//   roof plate (vents)
//   head: camera + speaker grille
//
// No extra fans: each Dell has its own. Dells pull air in the FRONT and blow it out the BACK,
// so the MISR fronts are a hex grille and the door behind them is mostly vents.
// The back is ONE magnetic door, printed as 3 panels with half-lap joints (glue them).
//
// Export one part:  openscad -D 'part="misr"' -o misr.stl pip001_tower.scad
// parts: assembly misr middle pip plate_base plate_ring plate_floor plate_floor_pi plate_roof
//        head door_1 door_2 door_3 pi_crib display_clip dell_guide pin pin_short door_full

part = "assembly";
$fn = 64;

// ---------- Dell Precision 3420 SFF, lying flat ----------
DELL = [290, 293, 93];    // width, depth, height (measured lying on its side, feet included)
DELL_GAP = 2;             // between stacked Dells (their rubber feet)

// ---------- main sizes (mm) ----------
W = 326;            // outside width and depth: fits the Dells, still fits the 350 mm bed
WALL = 4;
COL = 12;           // corner columns (pins + magnets)
PLATE = 4;
BASE_T = 10;        // base carries ~20 kg of Dells: extra thick
H_MISR = 2 * DELL[2] + 2 * DELL_GAP + 5;   // two Dells per MISR section
H_MID = 140;
H_PIP = 160;
PIN_D = 5.2; PIN_DEPTH = 12;
MAG_D = 10.4; MAG_T = 3.2;
DOOR_T = 6; LAP = 20;

Z_A = BASE_T;
Z_B = Z_A + H_MISR + PLATE;
Z_MID = Z_B + H_MISR + PLATE;
Z_PIP = Z_MID + H_MID + PLATE;
Z_ROOF = Z_PIP + H_PIP;
H_TOWER = Z_ROOF + PLATE;
DOOR_SPLITS = [0, round(H_TOWER / 3), round(2 * H_TOWER / 3), H_TOWER];

// head
HEAD_W = 150; HEAD_D = 130; HEAD_H = 120; HEAD_FRONT = 12; HEAD_COL = 10;

// display: common cheap 7" HDMI LCD. MEASURE YOURS and change these.
DISP_MOD = [165, 100];
DISP_VIEW = [155, 88];
DISP_Z = H_PIP / 2 + 5;

// ---------- helpers ----------
module corner_positions(w = W, d = W, c = COL) {
    for (p = [[c / 2, c / 2], [w - c / 2, c / 2], [c / 2, d - c / 2], [w - c / 2, d - c / 2]])
        translate([p[0], p[1], 0]) children();
}

function mag_z(h) = [25, h - 25];

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

// flat hex vents (for plates)
module vent_grid(w, d, hole = 8, gap = 14) {
    for (x = [0 : gap : w], y = [0 : gap : d]) translate([x, y, 0]) cylinder(d = hole, h = 50, center = true, $fn = 6);
}

// diamond grille cut through a wall in the XZ plane. 45-degree edges, so it prints with no supports.
module wall_grille(w, h, hole = 12, gap = 17) {
    for (i = [0 : floor(w / gap)], j = [0 : floor(h / (gap / 2))])
        let (x = i * gap + ((j % 2) * gap / 2))
            if (x <= w) translate([x, 0, j * gap / 2]) rotate([-90, 0, 0]) cylinder(d = hole, h = 50, center = true, $fn = 4);
}

module plate_holes() { corner_positions() cylinder(d = PIN_D, h = 60, center = true); }

module floor_cord_holes() {
    translate([COL + 14, W - 62, -1]) cube([60, 34, 20]);
    translate([W - COL - 74, W - 62, -1]) cube([60, 34, 20]);
}

// ---------- plates ----------
CASTER_IN = 55;
module plate_base() {
    difference() {
        union() {
            cube([W, W, BASE_T]);
            corner_positions(W, W, 2 * CASTER_IN) translate([-30, -30, -6]) cube([60, 60, 6]);
        }
        corner_positions() translate([0, 0, -20]) cylinder(d = PIN_D, h = 60);
        // caster slots: fit square plates with hole spacing about 24-45 mm
        corner_positions(W, W, 2 * CASTER_IN) for (a = [45, 135, 225, 315]) rotate([0, 0, a])
            hull() { translate([17, 0, -20]) cylinder(d = 5.5, h = 40); translate([32, 0, -20]) cylinder(d = 5.5, h = 40); }
        translate([W / 2 - 35, W - 70, -20]) cube([70, 40, 40]);   // wheel / motor wires
        dell_guide_holes();
    }
}

// open ring: the Dells pass straight through it
module plate_ring() {
    difference() {
        cube([W, W, PLATE]);
        plate_holes();
        translate([(W - DELL[0]) / 2 - 3, (W - DELL[1]) / 2 - 3, -1]) cube([DELL[0] + 6, DELL[1] + 6, 10]);
    }
}

module plate_floor(pi = false) {
    difference() {
        cube([W, W, PLATE]);
        plate_holes();
        intersection() {
            translate([30, 30, -1]) cube([W - 60, W - 115, 10]);
            translate([30, 30, 0]) vent_grid(W - 60, W - 115);
        }
        floor_cord_holes();
        if (pi) for (p = crib_screws()) translate([p[0], p[1], 0]) cylinder(d = 3.4, h = 50, center = true);
    }
}

module plate_roof() {
    difference() {
        cube([W, W, PLATE]);
        plate_holes();
        translate([W / 2 - 25, HEAD_FRONT + HEAD_D / 2 - 15, -1]) cube([50, 30, 10]);
        translate([(W - HEAD_W) / 2, HEAD_FRONT, 0]) corner_positions(HEAD_W, HEAD_D, HEAD_COL) cylinder(d = PIN_D, h = 50, center = true);
        // passive vents behind the head (warm air from the Pi and screen rises out)
        intersection() {
            translate([40, HEAD_FRONT + HEAD_D + 20, -1]) cube([W - 80, W - HEAD_FRONT - HEAD_D - 50, 10]);
            translate([40, HEAD_FRONT + HEAD_D + 20, 0]) vent_grid(W - 80, W - HEAD_FRONT - HEAD_D - 50);
        }
    }
}

// ---------- Dell guides: 3 rails on the base (front, left, right) so the stack can't slide.
// The back is left open: the Dells slide in and out through the back door.
function dell_guides() = [   // [x, y, rotation] - each rail is 60 long, 5 thick, 25 tall
    [W / 2 - 30, (W - DELL[1]) / 2 - 6.5, 0],
    [(W - DELL[0]) / 2 - 1.5, W / 2 - 30, 90],
    [(W + DELL[0]) / 2 + 6.5, W / 2 - 30, 90]];
module dell_guide() {   // screws to the base from below (2 x M3, self-tapping)
    difference() {
        cube([60, 5, 25]);
        for (x = [12, 48]) translate([x, 2.5, -1]) cylinder(d = 2.6, h = 12);
    }
}
module dell_guide_holes() {
    for (g = dell_guides()) translate([g[0], g[1], 0]) rotate([0, 0, g[2]])
        for (x = [12, 48]) translate([x, 2.5, -20]) cylinder(d = 3.4, h = 60);
}

// ---------- head ----------
module head() {
    difference() {
        union() {
            difference() {
                cube([HEAD_W, HEAD_D, HEAD_H]);
                translate([WALL, WALL, -1]) cube([HEAD_W - 2 * WALL, HEAD_D - 2 * WALL, HEAD_H - WALL + 1]);
            }
            corner_positions(HEAD_W, HEAD_D, HEAD_COL) translate([-HEAD_COL / 2, -HEAD_COL / 2, 0]) cube([HEAD_COL, HEAD_COL, HEAD_H - WALL]);
            translate([HEAD_W / 2 - 18, WALL, HEAD_H - 48]) cube([36, 3, 30]);
        }
        corner_positions(HEAD_W, HEAD_D, HEAD_COL) translate([0, 0, -1]) cylinder(d = PIN_D, h = PIN_DEPTH + 1);
        translate([HEAD_W / 2, 0, HEAD_H - 33]) {   // camera eye (21 x 12.5 mm M2 pattern - check it)
            rotate([-90, 0, 0]) cylinder(d = 16, h = 30, center = true);
            for (sx = [-1, 1], sz = [-1, 1])
                translate([sx * 10.5, 0, sz * 6.25 - 3]) rotate([-90, 0, 0]) cylinder(d = 2.2, h = 30, center = true);
        }
        for (cx = [0 : 9], cz = [0 : 4])   // speaker grille
            translate([HEAD_W / 2 - 40.5 + cx * 9, 0, 18 + cz * 9]) rotate([-90, 0, 0]) cylinder(d = 5, h = 30, center = true, $fn = 16);
        translate([HEAD_W / 2, HEAD_D, 25]) rotate([90, 0, 0]) cylinder(d = 22, h = 30, center = true);
    }
}

// ---------- the one back door ----------
CORD_NOTCHES = [[70, 10], [120, 16], [290, 24], [330, 10], [455, 16], [600, 24], [640, 10], [700, 10]];   // kept clear of magnets and panel joints
MAG_ZS = concat([for (z = mag_z(H_MISR)) Z_A + z], [for (z = mag_z(H_MISR)) Z_B + z],
                [for (z = mag_z(H_MID)) Z_MID + z], [for (z = mag_z(H_PIP)) Z_PIP + z]);

module door_full() {
    difference() {
        cube([W, DOOR_T, H_TOWER]);
        for (x = [COL / 2, W - COL / 2], zz = MAG_ZS)
            translate([x, -0.01, zz]) rotate([-90, 0, 0]) cylinder(d = MAG_D, h = MAG_T);
        for (n = CORD_NOTCHES, side = [0, 1])
            if (n[0] + n[1] / 2 < H_TOWER - 5)
                translate([side == 0 ? -1 : W - 31, -1, n[0] - n[1] / 2]) cube([32, DOOR_T + 2, n[1]]);
        translate([W / 2 - 50, -1, -1]) cube([100, DOOR_T + 2, 30]);   // power strip / wall plug
        for (z = [Z_MID + 40, Z_PIP + 60])                                // finger pulls
            translate([W / 2, DOOR_T + 1, z]) rotate([90, 0, 0]) cylinder(d = 34, h = 3.5);
        // big exhaust grille behind the Dells (their hot air and cables come out here)
        translate([50, 0, Z_A + 26.3]) wall_grille(W - 100, 2 * H_MISR + PLATE - 50, 12, 17);
    }
}

// Panels 1 and 3 give the OUTER half of each overlap, panel 2 the INNER half, so every
// panel's tabs are on one face and each prints flat with no overhangs.
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
CRIB_X = COL + 12; CRIB_Y = W - COL - 12 - (PI_W + 2 * CRIB_GAP + 2 * CRIB_WALL) - 45;
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
// MISR: hex grille across the front so the Dells can breathe in
module misr() {
    difference() {
        section(H_MISR);
        translate([45, WALL / 2, 22]) wall_grille(W - 90, H_MISR - 44, 12, 17);
    }
}

module middle() { section(H_MID); }

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
    color("dimgray") for (g = dell_guides()) translate([g[0], g[1], BASE_T]) rotate([0, 0, g[2]]) dell_guide();
    // the 4 Dells (dark), stacked
    color([0.12, 0.12, 0.12]) for (i = [0 : 3])
        translate([(W - DELL[0]) / 2, (W - DELL[1]) / 2, BASE_T + i * (DELL[2] + DELL_GAP)]) cube(DELL);
    color("silver") translate([0, 0, Z_A]) misr();
    color("black") translate([0, 0, Z_A + H_MISR]) plate_ring();
    color("silver") translate([0, 0, Z_B]) misr();
    color("black") translate([0, 0, Z_B + H_MISR]) plate_floor();
    color("silver") translate([0, 0, Z_MID]) middle();
    color("black") translate([0, 0, Z_MID + H_MID]) plate_floor(true);
    color("orange") translate([CRIB_X, CRIB_Y, Z_PIP]) pi_crib();
    color("silver") translate([0, 0, Z_PIP]) pip();
    color("deepskyblue") translate([W / 2 - DISP_VIEW[0] / 2, 0.5, Z_PIP + DISP_Z - DISP_VIEW[1] / 2]) cube([DISP_VIEW[0], 1, DISP_VIEW[1]]);
    color("black") translate([0, 0, Z_ROOF]) plate_roof();
    color("white") translate([(W - HEAD_W) / 2, HEAD_FRONT, Z_ROOF + PLATE]) head();
    color("gray", 0.7) translate([0, W + 25, 0]) door_full();
}

if (part == "assembly") assembly();
else if (part == "misr") misr();
else if (part == "middle") middle();
else if (part == "pip") pip();
else if (part == "plate_base") rotate([180, 0, 0]) plate_base();   // print pads-up
else if (part == "plate_ring") plate_ring();
else if (part == "plate_floor") plate_floor();
else if (part == "plate_floor_pi") plate_floor(true);
else if (part == "plate_roof") plate_roof();
else if (part == "head") rotate([180, 0, 0]) head();               // print top-down
else if (part == "door_1") rotate([-90, 0, 0]) door_panel(0);
else if (part == "door_2") rotate([90, 0, 0]) door_panel(1);        // inner face down
else if (part == "door_3") rotate([-90, 0, 0]) door_panel(2);
else if (part == "pi_crib") pi_crib();
else if (part == "display_clip") display_clip();
else if (part == "dell_guide") dell_guide();
else if (part == "pin") pin();
else if (part == "pin_short") pin_short();
else if (part == "door_full") door_full();
