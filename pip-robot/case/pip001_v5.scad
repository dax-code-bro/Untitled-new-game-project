// PIP001 tower v5 - 5 pull-out Dell drawers, separate cable column, two doors, anti-tip base.
// Every part fits a Creality K2 Plus bed (350 x 350 mm).
//
// LAYOUT (looking from the front)
//
//        [ head ]
//   +----------------+------+
//   | CONTROL (PIP)  |  C   |  network switch, USB hub; LCD is in the front door
//   +----------------+  A   |
//   | BAY 5  (Dell)  |  B   |  each bay is its own sealed cabinet:
//   | BAY 4  (Dell)  |  L   |    air goes front -> back inside the bay only
//   | BAY 3  (Dell)  |  E   |  cables go sideways into the CABLE column,
//   | BAY 2  (Dell)  |      |    then out its back through 3-inch holes
//   | BAY 1  (Dell)  |      |
//   +----------------+------+
//   |  BASE + ballast box   |  outrigger feet with rubber pads
//
// FRONT door (main): intake grille for every bay + the 7" LCD window. Magnets.
// BACK door (service): exhaust grille. Open it and each Dell slides out on its own tray.
//
// Each level is 2 prints: "a" (Dell bay, 316 wide) and "b" (cable column, 98 wide).
//
// parts: assembly bay_a bay_b ctrl_a ctrl_b base_a base_b roof_a roof_b tray foot head
//        front_1 front_2 front_3 back_1 back_2 back_3 display_clip pin pin_short front_full back_full

part = "assembly";
$fn = 48;

// ---------- the computers ----------
DELL = [290, 293, 93];      // Dell slim / SFF 2016-2019 (3420, 3430, OptiPlex x060): 290 x 292.8 x 92.6
N_BAYS = 5;

// ---------- sizes (mm) ----------
WS = 8;                     // side wall / divider thickness
BAY_IN = 300;               // inside width of a Dell bay
CHASE_IN = 90;              // inside width of the cable column (fits 3-inch plugs)
XA = WS + BAY_IN + WS;      // width of an "a" piece = 316
XB = CHASE_IN + WS;         // width of a "b" piece = 98
W = XA + XB;                // whole tower width = 414
D = 330;                    // depth
FLOOR = 4;
BAY_H = 112;                // floor 4 + tray 4 + Dell 93 + 11 clearance
CTRL_H = 160;
BASE_H = 40;
FOOT_T = 8;
BOSS = 12;                  // corner bosses (pins + magnets)
PIN_D = 5.2; PIN_DEPTH = 12;
MAG_D = 6.4; MAG_T = 3.2;   // 6 x 3 mm round magnets
DOOR_T = 6; LAP = 20;
HOLE3 = 76;                 // "3 inch" cable holes

// stack heights
Z_BASE = FOOT_T;
Z_BAY0 = Z_BASE + BASE_H;
function z_bay(i) = Z_BAY0 + i * BAY_H;
Z_CTRL = z_bay(N_BAYS);
Z_ROOF = Z_CTRL + CTRL_H;
H_DOORS = Z_ROOF + FLOOR - Z_BAY0;                 // doors cover bays + control + roof edge
DOOR_SPLITS = [0, round(H_DOORS / 3), round(2 * H_DOORS / 3), H_DOORS];

// head / display
HEAD_W = 150; HEAD_D = 130; HEAD_H = 120; HEAD_COL = 10;
DISP_MOD = [165, 100]; DISP_VIEW = [155, 88];

// ---------- helpers ----------
module diamond_grille(w, h, hole = 12, gap = 17) {   // in the XZ plane, cut along Y; 45-degree edges
    for (i = [0 : floor(w / gap)], j = [0 : floor(h / (gap / 2))])
        let (x = i * gap + ((j % 2) * gap / 2))
            if (x <= w) translate([x, 0, j * gap / 2]) rotate([-90, 0, 0]) cylinder(d = hole, h = 60, center = true, $fn = 4);
}
module rounded_slot(w, h, depth) {                    // in the XZ plane, cut along Y
    hull() for (x = [-w / 2 + h / 2, w / 2 - h / 2]) translate([x, 0, 0]) rotate([90, 0, 0]) cylinder(d = h, h = depth, center = true);
}
module vent_grid(w, d, hole = 8, gap = 14) {
    for (x = [0 : gap : w], y = [0 : gap : d]) translate([x, y, 0]) cylinder(d = hole, h = 60, center = true, $fn = 6);
}

// pin / magnet positions (boss centres) in each piece, x relative to the piece
// Front: corner bosses (they also stop the Dell sliding out the front).
// Back: NO bosses, so the tray and Dell can slide out the back. Back pins sit inside the walls.
function pins_front() = [[WS + BOSS / 2, BOSS / 2], [XA - WS - BOSS / 2, BOSS / 2]];
function pins_back() = [[WS / 2, D - 6], [XA - WS / 2, D - 6]];
function pins_a() = concat(pins_front(), pins_back());
function pins_b() = [[XB - WS - BOSS / 2, BOSS / 2], [XB - WS - BOSS / 2, D - BOSS / 2]];
// door magnets: front ones in the front bosses, back ones in the back ends of the walls
function mag_x() = [WS + BOSS / 2, XA - WS - BOSS / 2];
function mag_x_back() = [WS / 2, XA - WS / 2];
function mag_z(h) = [22, h - 22];

module bosses(list, h) { for (p = list) translate([p[0] - BOSS / 2, p[1] - BOSS / 2, 0]) cube([BOSS, BOSS, h]); }
module pin_holes(list, h) {
    for (p = list) translate([p[0], p[1], 0]) {
        translate([0, 0, -1]) cylinder(d = PIN_D, h = PIN_DEPTH + 1);
        translate([0, 0, h - PIN_DEPTH]) cylinder(d = PIN_D, h = PIN_DEPTH + 1);
    }
}
module mag_pockets(h) {
    for (x = mag_x(), z = mag_z(h)) translate([x, -0.01, z]) rotate([-90, 0, 0]) cylinder(d = MAG_D, h = MAG_T);
    for (x = mag_x_back(), z = mag_z(h)) translate([x, D - MAG_T, z]) rotate([-90, 0, 0]) cylinder(d = MAG_D, h = MAG_T + 0.01);
}
// bolt holes joining "a" to "b" through the divider (M4)
JOIN_Y = [60, D - 60];
module join_holes(h) { for (y = JOIN_Y) translate([XA - WS - 1, y, h / 2]) rotate([0, 90, 0]) cylinder(d = 4.4, h = WS + 40); }

// ---------- level pieces ----------
// "a": floor + left wall + divider + 4 bosses. Open front and back (the doors close them).
module piece_a(h, divider_port = true, floor_on = true) {
    difference() {
        union() {
            if (floor_on) cube([XA, D, FLOOR]);
            cube([WS, D, h]);                                  // left wall
            translate([XA - WS, 0, 0]) cube([WS, D, h]);       // divider (shared with cable column)
            bosses(pins_front(), h);
        }
        pin_holes(pins_a(), h);
        mag_pockets(h);
        join_holes(h);
        // cable port: from behind the Dell, sideways into the cable column
        if (divider_port) translate([XA - WS - 1, D - 95, 18]) cube([WS + 2, 70, h - 36]);
    }
}
// "b": cable column. Floor with a pass-through, right wall, fixed front and back panels.
// The back panel has a 3-inch hole on every level; the floor lets cables run up and down.
module piece_b(h, floor_on = true) {
    difference() {
        union() {
            if (floor_on) cube([XB, D, FLOOR]);
            translate([XB - WS, 0, 0]) cube([WS, D, h]);       // right wall
            cube([XB, 4, h]);                                  // front panel (fixed)
            translate([0, D - 4, 0]) cube([XB, 4, h]);         // back panel (fixed)
            bosses(pins_b(), h);
        }
        pin_holes(pins_b(), h);
        // 3-inch cable hole in the back
        translate([CHASE_IN / 2, D - 2, h / 2]) rotate([0, 0, 0]) rounded_slot(HOLE3, min(46, h - 30), 20);
        // pass-through to the level below / above
        if (floor_on) translate([10, 40, -1]) cube([CHASE_IN - 20, D - 80, FLOOR + 2]);
        // flange holes lining up with the divider bolts
        for (y = JOIN_Y) translate([-1, y, h / 2]) rotate([0, 90, 0]) cylinder(d = 4.4, h = 20);
        // a slim light slot on the front panel (LED strip behind it, optional)
        translate([CHASE_IN / 2 - 3, -1, 20]) cube([6, 6, h - 40]);
    }
    // flange the bolts go through (sits against the divider).
    // It's a rib from the floor up, so it never prints in mid-air.
    difference() {
        for (y = JOIN_Y) translate([0, y - 15, 0]) cube([6, 30, h / 2 + 15]);
        for (y = JOIN_Y) translate([-1, y, h / 2]) rotate([0, 90, 0]) cylinder(d = 4.4, h = 20);
    }
}

module bay_a() { piece_a(BAY_H); }
module bay_b() { piece_b(BAY_H); }
module ctrl_a() { piece_a(CTRL_H, divider_port = true); }
module ctrl_b() { piece_b(CTRL_H); }

// ---------- base with ballast box ----------
module base_a() {
    difference() {
        union() {
            cube([XA, D, BASE_H]);
        }
        // ballast box: fill with sand bags, steel plates or old weights
        translate([WS + 14, 14, 4]) cube([XA - 2 * WS - 28, D - 28, BASE_H]);
        pin_holes(pins_a(), BASE_H);
        join_holes(BASE_H);
        for (p = foot_points_a()) translate([p[0], p[1], -1]) cylinder(d = 4.4, h = 20);
    }
}
module base_b() {
    difference() {
        cube([XB, D, BASE_H]);
        translate([10, 14, 4]) cube([CHASE_IN - 20, D - 28, BASE_H]);   // more ballast / power strip
        pin_holes(pins_b(), BASE_H);
        for (y = JOIN_Y) translate([-1, y, BASE_H / 2]) rotate([0, 90, 0]) cylinder(d = 4.4, h = 20);
        for (p = foot_points_b()) translate([p[0], p[1], -1]) cylinder(d = 4.4, h = 20);
    }
}

// ---------- anti-tip feet: stick out past the tower, rubber pad underneath ----------
FOOT_OUT = 45;   // how far each foot reaches past the tower edge
function foot_points_a() = [[30, 30], [30, D - 30]];
function foot_points_b() = [[XB - 30, 30], [XB - 30, D - 30]];
module foot() {   // L-shaped outrigger, printed flat. Bolts up into the base (2 x M4).
    difference() {
        union() {
            hull() { translate([0, 0, 0]) cube([90, 30, FOOT_T]); translate([0, 0, 0]) cube([30, 90, FOOT_T]); }
            hull() { translate([-FOOT_OUT, -FOOT_OUT, 0]) cylinder(d = 50, h = FOOT_T); translate([10, 10, 0]) cylinder(d = 40, h = FOOT_T); }
        }
        // bolt holes (the tower corner sits at 0,0)
        translate([30, 30, -1]) cylinder(d = 4.4, h = 20);
        translate([30, 30, -1]) cylinder(d = 8.5, h = 4.5);
        // rubber pad pocket under the outer pad (25 mm pad, 3 mm deep)
        translate([-FOOT_OUT, -FOOT_OUT, -1]) cylinder(d = 25.5, h = 4);
        translate([20, 20, -1]) cylinder(d = 25.5, h = 4);
        // grip grooves on the bottom (in case there are no pads yet)
        for (i = [-6 : 6]) translate([-FOOT_OUT, -FOOT_OUT, 0]) rotate([0, 0, 45]) translate([i * 4, -40, -0.01]) cube([1.2, 80, 0.8]);
    }
}

// ---------- roof ----------
module roof_a() {
    difference() {
        cube([XA, D, FLOOR]);
        for (p = pins_a()) translate([p[0], p[1], 0]) cylinder(d = PIN_D, h = 30, center = true);
        translate([(XA - HEAD_W) / 2, 12, 0]) for (p = [[HEAD_COL / 2, HEAD_COL / 2], [HEAD_W - HEAD_COL / 2, HEAD_COL / 2], [HEAD_COL / 2, HEAD_D - HEAD_COL / 2], [HEAD_W - HEAD_COL / 2, HEAD_D - HEAD_COL / 2]])
            translate([p[0], p[1], 0]) cylinder(d = PIN_D, h = 30, center = true);
        translate([XA / 2 - 25, 12 + HEAD_D / 2 - 15, -1]) cube([50, 30, 10]);           // head cables
        intersection() {                                                                // chimney vents
            translate([40, 160, -1]) cube([XA - 80, D - 200, 10]);
            translate([40, 160, 0]) vent_grid(XA - 80, D - 200);
        }
    }
}
module roof_b() {
    difference() {
        cube([XB, D, FLOOR]);
        for (p = pins_b()) translate([p[0], p[1], 0]) cylinder(d = PIN_D, h = 30, center = true);
        translate([12, 40, -1]) cube([CHASE_IN - 24, D - 80, 10]);   // cable column vents out the top
    }
}

// ---------- pull-out tray (one per Dell) ----------
TRAY_T = 4;
TRAY_X = WS + 2;                 // 2 mm play each side
TRAY_W = BAY_IN - 4;             // 296
TRAY_Y0 = 14; TRAY_Y1 = D - 14;  // stays clear of the corner bosses
module tray() {
    L = TRAY_Y1 - TRAY_Y0;
    difference() {
        union() {
            cube([TRAY_W, L, TRAY_T]);
            cube([2, L, 14]);                                       // side lips keep the Dell straight
            translate([TRAY_W - 2, 0, 0]) cube([2, L, 14]);
            translate([0, L - 3, 0]) cube([TRAY_W, 3, 10]);          // back lip (Dell can't slide off)
            // handle: you pull from the back door
            translate([TRAY_W / 2 - 35, L - 3, 0]) difference() {
                cube([70, 14, 14]);
                translate([10, -1, 5]) cube([50, 10, 30]);
            }
        }
        // airflow holes under the Dell
        intersection() {
            translate([30, 40, -1]) cube([TRAY_W - 60, L - 80, 10]);
            translate([30, 40, 0]) vent_grid(TRAY_W - 60, L - 80, 10, 16);
        }
    }
}

// ---------- head (same as v4) ----------
module head() {
    WALL = 4;
    difference() {
        union() {
            difference() {
                cube([HEAD_W, HEAD_D, HEAD_H]);
                translate([WALL, WALL, -1]) cube([HEAD_W - 2 * WALL, HEAD_D - 2 * WALL, HEAD_H - WALL + 1]);
            }
            for (p = [[0, 0], [HEAD_W - HEAD_COL, 0], [0, HEAD_D - HEAD_COL], [HEAD_W - HEAD_COL, HEAD_D - HEAD_COL]])
                translate([p[0], p[1], 0]) cube([HEAD_COL, HEAD_COL, HEAD_H - WALL]);
        }
        for (p = [[HEAD_COL / 2, HEAD_COL / 2], [HEAD_W - HEAD_COL / 2, HEAD_COL / 2], [HEAD_COL / 2, HEAD_D - HEAD_COL / 2], [HEAD_W - HEAD_COL / 2, HEAD_D - HEAD_COL / 2]])
            translate([p[0], p[1], -1]) cylinder(d = PIN_D, h = PIN_DEPTH + 1);
        translate([HEAD_W / 2, 0, HEAD_H - 33]) rotate([-90, 0, 0]) cylinder(d = 16, h = 30, center = true);   // webcam eye
        for (cx = [0 : 9], cz = [0 : 4])
            translate([HEAD_W / 2 - 40.5 + cx * 9, 0, 18 + cz * 9]) rotate([-90, 0, 0]) cylinder(d = 5, h = 30, center = true, $fn = 16);
        translate([HEAD_W / 2, HEAD_D, 25]) rotate([90, 0, 0]) cylinder(d = 22, h = 30, center = true);
    }
}

// ---------- doors (cover the "a" column; door z = 0 is the top of the base) ----------
function door_mags() = [for (i = [0 : N_BAYS - 1]) for (z = mag_z(BAY_H)) i * BAY_H + z, for (z = mag_z(CTRL_H)) N_BAYS * BAY_H + z];
DISP_Z = N_BAYS * BAY_H + CTRL_H / 2;    // LCD centre height on the front door

module door_common(front = true) {
    difference() {
        cube([XA, DOOR_T, H_DOORS]);
        for (x = front ? mag_x() : mag_x_back(), z = door_mags()) translate([x, -0.01, z]) rotate([-90, 0, 0]) cylinder(d = MAG_D, h = MAG_T);
        // grille in front of / behind every Dell
        for (i = [0 : N_BAYS - 1]) translate([40, 0, i * BAY_H + 20.3]) diamond_grille(XA - 80, BAY_H - 40, 11, 16);
    }
}
module front_full() {
    L = DISP_MOD[0] + 10;
    difference() {
        union() {
            door_common(true);
            // LCD ledges on the inside face (angled underneath, no supports)
            for (dz = [-1, 1]) hull() {
                translate([XA / 2 - L / 2, -9, DISP_Z + dz * (DISP_MOD[1] / 2 + 4) - 2]) cube([L, 9, 4]);
                translate([XA / 2 - L / 2, -0.5, DISP_Z + dz * (DISP_MOD[1] / 2 + 4) - 11]) cube([L, 0.5, 4]);
            }
        }
        translate([XA / 2 - DISP_VIEW[0] / 2, -1, DISP_Z - DISP_VIEW[1] / 2]) cube([DISP_VIEW[0], DOOR_T + 2, DISP_VIEW[1]]);
        for (sx = [-1, 1], dz = [-1, 1]) translate([XA / 2 + sx * (DISP_MOD[0] / 2 - 15), -6, DISP_Z + dz * (DISP_MOD[1] / 2 + 4)]) cylinder(d = 2.6, h = 30, center = true);
        // finger pull
        translate([XA - 30, DOOR_T + 1, H_DOORS * 0.45]) rotate([90, 0, 0]) cylinder(d = 30, h = 3.5);
    }
}
module back_full() {
    difference() {
        door_common(false);
        translate([XA / 2, DOOR_T + 1, N_BAYS * BAY_H + CTRL_H / 2]) rotate([90, 0, 0]) cylinder(d = 30, h = 3.5);
        translate([40, 0, N_BAYS * BAY_H + 25.3]) diamond_grille(XA - 80, CTRL_H - 50, 11, 16);   // control-level exhaust
    }
}
// 3 panels with half-lap joints; panels 1 and 3 give the outer half, panel 2 the inner half
module door_panel(k, front = true) {
    a = DOOR_SPLITS[k]; b = DOOR_SPLITS[k + 1];
    outer = [-30, DOOR_T / 2, 0]; inner = [-30, -20, 0];
    intersection() {
        if (front) front_full(); else back_full();
        union() {
            if (k == 0) { translate([-30, -20, -1]) cube([XA + 60, DOOR_T + 40, b + 1]); translate(outer + [0, 0, b]) cube([XA + 60, DOOR_T / 2 + 30, LAP]); }
            if (k == 1) {
                translate(inner + [0, 0, a]) cube([XA + 60, DOOR_T / 2 + 20, LAP]);
                translate([-30, -20, a + LAP]) cube([XA + 60, DOOR_T + 40, b - a - LAP]);
                translate(inner + [0, 0, b]) cube([XA + 60, DOOR_T / 2 + 20, LAP]);
            }
            if (k == 2) { translate(outer + [0, 0, a]) cube([XA + 60, DOOR_T / 2 + 30, LAP]); translate([-30, -20, a + LAP]) cube([XA + 60, DOOR_T + 40, b - a - LAP + 1]); }
        }
    }
}

module display_clip() { difference() { union() { cube([20, 14, 3]); cube([20, 3, 12]); } translate([10, 8, -1]) cylinder(d = 3.2, h = 10); } }
module pin() { cylinder(d = 4.8, h = 2 * PIN_DEPTH - 1); }
module pin_short() { cylinder(d = 4.8, h = PIN_DEPTH + FLOOR - 1); }

// ---------- assembly ----------
module assembly(dells = N_BAYS) {
    // feet
    color("dimgray") {
        translate([0, 0, 0]) foot();
        translate([W, 0, 0]) mirror([1, 0, 0]) foot();
        translate([0, D, 0]) mirror([0, 1, 0]) foot();
        translate([W, D, 0]) mirror([1, 0, 0]) mirror([0, 1, 0]) foot();
    }
    color([0.15, 0.15, 0.16]) translate([0, 0, Z_BASE]) render() base_a();
    color([0.15, 0.15, 0.16]) translate([XA, 0, Z_BASE]) render() base_b();
    for (i = [0 : N_BAYS - 1]) {
        color([0.17, 0.17, 0.18]) translate([0, 0, z_bay(i)]) render() bay_a();
        color([0.14, 0.14, 0.15]) translate([XA, 0, z_bay(i)]) render() bay_b();
        color([0.25, 0.25, 0.27]) translate([TRAY_X, TRAY_Y0, z_bay(i) + FLOOR]) render() tray();
        if (i < dells) color(i == 4 ? [0.15, 0.3, 0.65] : [0.33, 0.34, 0.36])
            translate([WS + (BAY_IN - DELL[0]) / 2, 20, z_bay(i) + FLOOR + TRAY_T]) cube(DELL);
    }
    color([0.17, 0.17, 0.18]) translate([0, 0, Z_CTRL]) render() ctrl_a();
    color([0.14, 0.14, 0.15]) translate([XA, 0, Z_CTRL]) render() ctrl_b();
    color([0.12, 0.12, 0.13]) translate([0, 0, Z_ROOF]) render() roof_a();
    color([0.12, 0.12, 0.13]) translate([XA, 0, Z_ROOF]) render() roof_b();
    color([0.18, 0.18, 0.19]) translate([(XA - HEAD_W) / 2, 12, Z_ROOF + FLOOR]) render() head();
    color([0.2, 0.2, 0.21]) translate([0, 0, Z_BAY0]) mirror([0, 1, 0]) render() front_full();
    color("deepskyblue") translate([XA / 2 - DISP_VIEW[0] / 2, -DOOR_T - 0.5, Z_BAY0 + DISP_Z - DISP_VIEW[1] / 2]) cube([DISP_VIEW[0], 1, DISP_VIEW[1]]);
    color([0.2, 0.2, 0.21]) translate([0, D, Z_BAY0]) render() back_full();
}

if (part == "assembly") assembly();
else if (part == "bay_a") bay_a();
else if (part == "bay_b") bay_b();
else if (part == "ctrl_a") ctrl_a();
else if (part == "ctrl_b") ctrl_b();
else if (part == "base_a") base_a();
else if (part == "base_b") base_b();
else if (part == "roof_a") roof_a();
else if (part == "roof_b") roof_b();
else if (part == "tray") tray();
else if (part == "foot") foot();
else if (part == "head") rotate([180, 0, 0]) head();
else if (part == "front_1") rotate([-90, 0, 0]) door_panel(0, true);
else if (part == "front_2") rotate([90, 0, 0]) door_panel(1, true);
else if (part == "front_3") rotate([-90, 0, 0]) door_panel(2, true);
else if (part == "back_1") rotate([-90, 0, 0]) door_panel(0, false);
else if (part == "back_2") rotate([90, 0, 0]) door_panel(1, false);
else if (part == "back_3") rotate([-90, 0, 0]) door_panel(2, false);
else if (part == "front_full") front_full();
else if (part == "back_full") back_full();
else if (part == "display_clip") display_clip();
else if (part == "pin") pin();
else if (part == "pin_short") pin_short();
