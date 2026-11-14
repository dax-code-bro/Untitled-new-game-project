// Windows for Calvera's buildings in Unity. The web game paints them on in its facade shader
// (buildings.js: a window grid per building style, shopfronts along the ground floor of shop blocks on
// the walls that face a street, each window a room behind the glass); its 3D sills, heads and casings
// (facades.js) sit exactly on that grid. Here the same grid becomes real panes of glass, with a frame and
// glazing bars, each showing one of 64 generated rooms (or 32 shop interiors): a dark room by day behind
// reflective glass, and at night a lamp-lit one in some of the windows, the rest dark.
//   Place(world)  -> every pane (web-game world space)
//   Room(cell..)  -> the picture behind a pane: day (base colour) and night (emission), linear RGB
using System;
using System.Collections.Generic;

namespace Southbound.Core
{
    public enum PaneKind { Room, Shop }

    public sealed class Pane
    {
        public int Building, Wall, Style;
        public PaneKind Kind;
        /// <summary>Centre along the wall (the world x or z it runs along), its width, and its bottom and top (world y).</summary>
        public double U, Width, Y0, Y1;
        /// <summary>The wall's outward normal (web space) and where its plane is (z for nz != 0, x for nx != 0).</summary>
        public double Nx, Nz, Plane;
        /// <summary>The picture behind it (a cell of the room or shop atlas) and when it is lit: 0 never, 1 evenings, 2 all night.</summary>
        public int Cell, Lit;
        /// <summary>Glazing bars: a mullion down the middle; a rail across at RailAt (share of the height, 0 = none).</summary>
        public bool Mullion;
        public double RailAt;

        /// <summary>A point on the pane: `a` metres along the wall from its centre, `y` world height, `out` metres off the wall.</summary>
        public (double x, double y, double z) At(double a, double y, double outward)
            => Nz != 0 ? (U + a, y, Plane + Nz * outward) : (Plane + Nx * outward, y, U + a);
    }

    public sealed class RoomImage { public int W, H; public float[] Day, Night; }

    public static class BuildingWindows
    {
        public const int RoomCols = 8, RoomRows = 8, ShopCols = 4, ShopRows = 8;
        public const double ShopTop = 4.4, ShopGlass = 3.7, ShopSill = 0.34, Bay = 6;

        /// <summary>The facade shader's window grid (facades.js windowGrid): cell size, window size as a share of the cell, first row offset.</summary>
        public static (double cw, double ch, double sw, double sh, double off) Grid(int style)
        {
            if (style < 2.5) return (3.2, 3.4, 0.42, 0.5, 1.0);
            if (style < 3.5) return (9.0, 6.0, 0.3, 0.18, 1.0);
            if (style < 4.5) return (3.6, 3.0, 0.32, 0.42, 0.6);
            return (4.0, 4.0, 0.75, 0.55, 0.6);
        }

        static bool ShopStyle(int st) => st < 2.5 || st > 4.5;

        static double Hash(int a, int b, int c, int d)
        {
            unchecked
            {
                uint h = 2166136261u;
                foreach (int v in new[] { a, b, c, d }) { h ^= (uint)v; h *= 16777619u; h ^= h >> 13; h *= 0x5bd1e995u; h ^= h >> 15; }
                return (h & 0xffffff) / (double)0x1000000;
            }
        }

        /// <summary>The four walls of a building: outward normal, the plane, and the span along it (u0..u1).</summary>
        public static (double nx, double nz, double plane, double u0, double u1)[] Walls(CalveraWorld.Building b) => new[]
        {
            (0.0, 1.0, b.Z + b.D / 2, b.X - b.W / 2, b.X + b.W / 2),
            (0.0, -1.0, b.Z - b.D / 2, b.X - b.W / 2, b.X + b.W / 2),
            (1.0, 0.0, b.X + b.W / 2, b.Z - b.D / 2, b.Z + b.D / 2),
            (-1.0, 0.0, b.X - b.W / 2, b.Z - b.D / 2, b.Z + b.D / 2),
        };

        public static List<Pane> Place(CalveraWorld w)
        {
            var panes = new List<Pane>();
            for (int bi = 0; bi < w.Buildings.Count; bi++)
            {
                var b = w.Buildings[bi];
                int st = b.Style;
                bool ground = b.Y - w.HeightAt(b.X, b.Z) < 1.2;
                if (st <= 1 && !ground) continue;     // the towers' faces are photographed curtain walls
                bool shopBlock = ShopStyle(st) && ground;
                var G = Grid(st);
                double ww = G.sw * G.cw, wh = G.sh * G.ch;
                var walls = Walls(b);
                for (int wk = 0; wk < 4; wk++)
                {
                    var W = walls[wk];
                    bool shopFloor = shopBlock && ((b.Street >> wk) & 1) == 1;
                    if (st >= 2)
                        for (int i = (int)Math.Floor(W.u0 / G.cw); (i + 0.5) * G.cw < W.u1; i++)
                        {
                            double uc = (i + 0.5) * G.cw;
                            if (uc - ww / 2 < W.u0 + 0.2 || uc + ww / 2 > W.u1 - 0.2) continue;
                            for (int j = 0; ; j++)
                            {
                                double vc = G.off + (j + 0.5) * G.ch, vb = vc - wh / 2, vt = vc + wh / 2;
                                if (vt > b.H - 0.8) break;
                                if (shopFloor && vb < ShopTop) continue;
                                double h = Hash(bi, wk, i, j), h2 = Hash(j, i, wk, bi + 7);
                                int cell = (int)(h2 * RoomCols * RoomRows) % (RoomCols * RoomRows);
                                panes.Add(new Pane
                                {
                                    Building = bi, Wall = wk, Style = st, Kind = PaneKind.Room,
                                    U = uc, Width = ww, Y0 = b.Y + vb, Y1 = b.Y + vt,
                                    Nx = W.nx, Nz = W.nz, Plane = W.plane,
                                    Cell = cell, Lit = RoomLit(cell),
                                    Mullion = h > 0.45 && st != 4,
                                    // double-hung sashes on the houses; a transom on some of the rest
                                    RailAt = st == 4 || st == 5 ? (h < 0.9 ? 0.5 : 0) : st == 3 ? 0.5 : h < 0.25 ? 0.7 : 0,
                                });
                            }
                        }
                    if (!shopFloor) continue;
                    // the shopfront: a pane per 6 m bay (as the shader draws them), under the sign band
                    for (int k = (int)Math.Floor(W.u0 / Bay); k * Bay < W.u1; k++)
                    {
                        double a = Math.Max(k * Bay + 0.06 * Bay, W.u0 + 0.3), c = Math.Min(k * Bay + 0.94 * Bay, W.u1 - 0.3);
                        if (c - a < 1.0) continue;
                        int cell = (int)(Hash(bi, wk, k, 99) * ShopCols * ShopRows) % (ShopCols * ShopRows);
                        panes.Add(new Pane
                        {
                            Building = bi, Wall = wk, Style = st, Kind = PaneKind.Shop,
                            U = (a + c) / 2, Width = c - a, Y0 = b.Y + ShopSill, Y1 = b.Y + ShopGlass,
                            Nx = W.nx, Nz = W.nz, Plane = W.plane,
                            Cell = cell, Lit = ShopLit(cell),
                        });
                    }
                }
            }
            return panes;
        }

        /// <summary>Rooms: the first two rows of the atlas are lived in late (lit all night), the third only in the evening.</summary>
        public static int RoomLit(int cell) { int row = cell / RoomCols; return row < 2 ? 2 : row == 2 ? 1 : 0; }
        /// <summary>Shops: most keep their lights on all night, some close up in the evening, a few are dark.</summary>
        public static int ShopLit(int cell) { int row = cell / ShopCols; return row < 5 ? 2 : row == 5 ? 1 : 0; }

        // ------------------------------------------------------------------ the pictures behind the glass
        // Each picture is a small ray-traced room, in metres: the window is the rectangle x 0..Wm, y 0..Hm at
        // z = 0, the room runs back from it (floor below the sill, ceiling above the head), the eye stands
        // out in the street. Furniture is boxes; at night a lamp (with shadows) lights it, by day the window does.

        sealed class Box
        {
            public double X0, Y0, Z0, X1, Y1, Z1;
            public int Mat; public float R, G, B; public float Emit; public int Seed;
            public Box(double x0, double y0, double z0, double x1, double y1, double z1, int mat, float[] c, float emit = 0, int seed = 0)
            { X0 = Math.Min(x0, x1); X1 = Math.Max(x0, x1); Y0 = Math.Min(y0, y1); Y1 = Math.Max(y0, y1); Z0 = Math.Min(z0, z1); Z1 = Math.Max(z0, z1); Mat = mat; R = c[0]; G = c[1]; B = c[2]; Emit = emit; Seed = seed; }
        }
        // surface patterns
        const int MPlain = 0, MPaint = 1, MWood = 2, MPlanks = 3, MCarpet = 4, MTile = 5, MBooks = 6, MGoods = 7, MClothes = 8, MScreen = 9, MLamp = 10, MFabric = 11, MBoard = 12, MLeaf = 13, MMirror = 14;

        static readonly float[][] Paint = {
            new[] { 0.80f, 0.76f, 0.68f }, new[] { 0.85f, 0.84f, 0.80f }, new[] { 0.62f, 0.70f, 0.74f }, new[] { 0.74f, 0.66f, 0.55f },
            new[] { 0.56f, 0.61f, 0.50f }, new[] { 0.82f, 0.73f, 0.63f }, new[] { 0.70f, 0.70f, 0.72f }, new[] { 0.78f, 0.62f, 0.52f } };
        static readonly float[][] Woods = { new[] { 0.36f, 0.24f, 0.14f }, new[] { 0.52f, 0.37f, 0.22f }, new[] { 0.62f, 0.48f, 0.32f }, new[] { 0.25f, 0.17f, 0.11f } };
        static readonly float[][] Fabric = {
            new[] { 0.45f, 0.12f, 0.10f }, new[] { 0.18f, 0.24f, 0.36f }, new[] { 0.55f, 0.50f, 0.42f }, new[] { 0.22f, 0.32f, 0.22f }, new[] { 0.25f, 0.24f, 0.24f }, new[] { 0.60f, 0.42f, 0.22f } };
        static readonly float[][] Bright = {
            new[] { 0.85f, 0.15f, 0.12f }, new[] { 0.95f, 0.75f, 0.10f }, new[] { 0.15f, 0.45f, 0.80f }, new[] { 0.20f, 0.65f, 0.25f }, new[] { 0.95f, 0.95f, 0.92f },
            new[] { 0.95f, 0.45f, 0.10f }, new[] { 0.55f, 0.20f, 0.60f }, new[] { 0.10f, 0.10f, 0.12f }, new[] { 0.80f, 0.60f, 0.40f } };
        static readonly float[][] Lamps = { new[] { 1.0f, 0.74f, 0.46f }, new[] { 1.0f, 0.84f, 0.64f }, new[] { 0.88f, 0.93f, 1.0f }, new[] { 1.0f, 0.70f, 0.40f } };
        static readonly float[] White = { 0.86f, 0.86f, 0.84f }, Black = { 0.05f, 0.05f, 0.055f }, Grey = { 0.45f, 0.45f, 0.46f }, Steel = { 0.62f, 0.63f, 0.65f }, Green = { 0.16f, 0.36f, 0.14f };

        /// <summary>The room (or shop) behind a pane, `w` x `h` pixels, row 0 at the bottom. Day is the base colour
        /// (a room seen through glass by day is far darker than the sunlit wall; blinds and curtains hang at the
        /// glass and catch the daylight); Night is the emission: a lamp-lit room, or black when nobody is home.</summary>
        public static RoomImage Room(int cell, int w, int h, bool shop)
        {
            var rnd = new Mulberry32((uint)(cell * 7919 + (shop ? 104729 : 17)));
            double R() => rnd.Next();
            float[] Pick(float[][] a) => a[(int)(R() * a.Length) % a.Length];
            int lit = shop ? ShopLit(cell) : RoomLit(cell);

            // the window and the room behind it (metres)
            double Wm = shop ? 5.3 : 1.25, Hm = shop ? 3.36 : 1.5;
            double floorY = shop ? -0.34 : -0.9, ceilY = shop ? Hm + 0.7 : Hm + 0.25 + R() * 0.2;
            double xl = shop ? -1.5 - R() * 2 : -0.8 - R() * 1.6, xr = Wm + (shop ? 1.5 + R() * 2 : 0.8 + R() * 1.8), D = shop ? 8 + R() * 4 : 3.4 + R() * 1.6;
            // where the eye is: out in the street, below an upper-floor window, at eye level for a shop
            double ex = Wm / 2 + (R() - 0.5) * Wm * 1.2, ey = shop ? 1.26 : -0.9 + R() * 1.9, ez = shop ? -4.5 : -2.4 - R() * 1.6;

            var boxes = new List<Box>();
            var paint = shop ? Pick(new[] { White, new[] { 0.80f, 0.78f, 0.72f }, new[] { 0.30f, 0.32f, 0.34f } }) : Pick(Paint);
            var wood = Pick(Woods);
            int floorMat = shop ? MTile : (R() < 0.6 ? MPlanks : MCarpet);
            var floorC = floorMat == MPlanks ? Pick(Woods) : floorMat == MCarpet ? Pick(Fabric) : new[] { 0.70f, 0.69f, 0.66f };
            var lampC = shop ? (R() < 0.6 ? new[] { 0.92f, 0.96f, 1.0f } : new[] { 1.0f, 0.88f, 0.70f }) : Pick(Lamps);
            var lights = new List<(double x, double y, double z, double power)>();
            bool tvOnly = !shop && R() < 0.18;
            double back = D, mid = (xl + xr) / 2;
            void Add(double x0, double y0, double z0, double x1, double y1, double z1, int mat, float[] c, float emit = 0) => boxes.Add(new Box(x0, y0, z0, x1, y1, z1, mat, c, emit, (int)(R() * 1e6)));
            double F = floorY;
            if (shop)
            {
                int kind = cell % 6;
                double spanX = xr - xl;
                if (kind == 0 || kind == 3)
                {   // grocery / pharmacy: shelving along the walls, gondola aisles running back
                    var shelfC = kind == 3 ? White : Grey;
                    Add(xl, F, back - 0.5, xr, F + 2.0, back, MGoods, shelfC);
                    Add(xl, F, 1.5, xl + 0.5, F + 2.0, back, MGoods, shelfC);
                    Add(xr - 0.5, F, 1.5, xr, F + 2.0, back, MGoods, shelfC);
                    for (double gx = xl + 2.2; gx < xr - 1.6; gx += 2.4) Add(gx, F, 2.5, gx + 0.9, F + (kind == 3 ? 1.4 : 1.6), back - 1.6, MGoods, shelfC);
                    Add(xr - 2.6, F, 0.6, xr - 0.6, F + 1.0, 1.3, MPlain, kind == 3 ? White : Grey);   // the till counter
                    Add(xr - 2.0, F + 1.0, 0.8, xr - 1.6, F + 1.35, 1.1, MScreen, Black, 0.3f);
                    for (double lz = 1.5; lz < back - 0.5; lz += 2.5) Add(mid - spanX * 0.3, ceilY - 0.06, lz, mid + spanX * 0.3, ceilY - 0.02, lz + 0.18, MLamp, White, 1);
                }
                else if (kind == 1)
                {   // clothing: wall shelves of folded clothes, racks of hanging ones, mannequins in the window
                    Add(xl, F, back - 0.45, xr, F + 2.3, back, MClothes, wood);
                    for (double rz = 2.0; rz < back - 1.5; rz += 2.2)
                        for (double rx = xl + 1.0; rx < xr - 1.5; rx += 3.0)
                        { Add(rx, F + 0.55, rz, rx + 1.4, F + 1.45, rz + 0.5, MClothes, Steel); Add(rx + 0.65, F, rz + 0.2, rx + 0.75, F + 0.55, rz + 0.3, MPlain, Steel); }
                    for (int k = 0; k < 2; k++) { double mx = 0.9 + k * (Wm - 1.8); Add(mx - 0.2, F, 0.5, mx + 0.2, F + 1.75, 0.75, MFabric, Pick(Fabric)); Add(mx - 0.11, F + 1.75, 0.55, mx + 0.11, F + 1.98, 0.7, MPlain, new[] { 0.85f, 0.82f, 0.78f }); }
                    for (double lz = 1.5; lz < back; lz += 3) for (double lx = xl + 1.5; lx < xr - 1; lx += 2.5) Add(lx, ceilY - 0.05, lz, lx + 0.3, ceilY - 0.01, lz + 0.3, MLamp, White, 1);
                }
                else if (kind == 2)
                {   // a cafe: tables and chairs, the counter at the back under a menu board, pendant lamps
                    Add(xl + 1.0, F, back - 1.6, xr - 1.0, F + 1.05, back - 0.9, MWood, wood);
                    Add(xl + 1.0, F + 1.05, back - 1.6, xr - 1.0, F + 1.1, back - 0.9, MPlain, Grey);
                    Add(mid - 1.8, F + 1.7, back - 0.05, mid + 1.8, F + 2.6, back, MBoard, Black, 0.35f);
                    for (double tz = 1.2; tz < back - 2.5; tz += 2.0)
                        for (double tx = xl + 1.2; tx < xr - 1.0; tx += 2.2)
                        {
                            Add(tx, F + 0.72, tz, tx + 0.75, F + 0.76, tz + 0.75, MWood, wood); Add(tx + 0.33, F, tz + 0.33, tx + 0.42, F + 0.72, tz + 0.42, MPlain, Black);
                            Add(tx - 0.5, F + 0.45, tz + 0.15, tx - 0.05, F + 0.49, tz + 0.6, MWood, wood); Add(tx - 0.5, F + 0.49, tz + 0.15, tx - 0.45, F + 0.95, tz + 0.6, MWood, wood);
                            Add(tx + 0.25, ceilY - 0.9, tz + 0.25, tx + 0.5, ceilY - 0.7, tz + 0.5, MLamp, new[] { 1f, 0.85f, 0.6f }, 1); Add(tx + 0.36, ceilY - 0.7, tz + 0.36, tx + 0.39, ceilY, tz + 0.39, MPlain, Black);
                        }
                }
                else if (kind == 4)
                {   // a salon or barber: chairs facing mirrors along one wall
                    Add(xl, F + 0.9, 1.0, xl + 0.05, F + 2.2, back - 1, MMirror, Steel);
                    for (double cz = 1.5; cz < back - 1.5; cz += 1.8)
                    { Add(xl + 0.9, F + 0.35, cz, xl + 1.5, F + 0.55, cz + 0.6, MFabric, Black); Add(xl + 1.4, F + 0.55, cz, xl + 1.55, F + 1.3, cz + 0.6, MFabric, Black); Add(xl, F + 0.85, cz - 0.1, xl + 0.45, F + 0.9, cz + 0.7, MPlain, White); }
                    Add(xr - 2.2, F, back - 1.4, xr - 0.6, F + 1.05, back - 0.8, MWood, wood);
                    Add(xr - 1.0, F, 0.6, xr - 0.4, F + 1.1, 1.2, MLeaf, Green);
                    for (double lz = 1.5; lz < back; lz += 2.4) Add(mid - 1, ceilY - 0.05, lz, mid + 1, ceilY - 0.01, lz + 0.2, MLamp, White, 1);
                }
                else
                {   // an office (insurance, a bank branch, a realtor): desks, chairs, partitions
                    for (double dz = 1.6; dz < back - 1.5; dz += 2.6)
                        for (double dx = xl + 1.0; dx < xr - 1.6; dx += 2.8)
                        {
                            Add(dx, F + 0.72, dz, dx + 1.5, F + 0.76, dz + 0.75, MWood, wood); Add(dx, F, dz + 0.7, dx + 1.5, F + 0.72, dz + 0.75, MWood, wood);
                            Add(dx + 0.5, F + 0.76, dz + 0.45, dx + 1.0, F + 1.1, dz + 0.5, MScreen, Black, 0.5f);
                            Add(dx + 0.5, F + 0.45, dz - 0.6, dx + 1.0, F + 0.95, dz - 0.15, MFabric, Black);
                            Add(dx - 0.1, F, dz + 0.9, dx + 1.6, F + 1.4, dz + 0.95, MFabric, Pick(Fabric));
                        }
                    Add(mid - 1.0, F + 1.4, back - 0.05, mid + 1.0, F + 2.2, back, MBoard, Pick(Bright));
                    for (double lz = 1.5; lz < back; lz += 2.4) Add(mid - 2, ceilY - 0.05, lz, mid + 2, ceilY - 0.01, lz + 0.6, MLamp, White, 1);
                }
                foreach (var b in boxes) if (b.Mat == MLamp) lights.Add(((b.X0 + b.X1) / 2, b.Y0 - 0.1, (b.Z0 + b.Z1) / 2, 0.3 * (b.X1 - b.X0 + b.Z1 - b.Z0)));
            }
            else
            {
                int kind = (int)(R() * 4);
                double cxr = mid + (R() - 0.5) * (xr - xl) * 0.3;
                if (kind == 0)
                {   // a living room
                    var sofa = Pick(Fabric);
                    Add(cxr - 1.0, F, back - 0.9, cxr + 1.0, F + 0.45, back, MFabric, sofa);
                    Add(cxr - 1.0, F + 0.45, back - 0.25, cxr + 1.0, F + 0.85, back, MFabric, sofa);
                    Add(cxr - 1.0, F + 0.45, back - 0.9, cxr - 0.8, F + 0.65, back, MFabric, sofa); Add(cxr + 0.8, F + 0.45, back - 0.9, cxr + 1.0, F + 0.65, back, MFabric, sofa);
                    Add(cxr - 0.5, F + 0.38, back - 2.0, cxr + 0.5, F + 0.43, back - 1.4, MWood, wood); Add(cxr - 0.45, F, back - 1.95, cxr + 0.45, F + 0.38, back - 1.45, MWood, wood);
                    double px = cxr + (R() - 0.5) * 0.4; var pc = Pick(Bright);
                    Add(px - 0.35, F + 1.25, back - 0.03, px + 0.35, F + 1.75, back, MBoard, pc);
                    double sx = R() < 0.5 ? xl : xr - 0.35;
                    Add(sx, F, back - 2.2, sx + 0.35, F + 1.9, back - 1.3, MBooks, wood);
                    if (R() < 0.6) { Add(xl, F + 0.5, 1.2, xl + 0.45, F + 0.55, 2.2, MWood, wood); Add(xl + 0.02, F + 0.55, 1.4, xl + 0.06, F + 1.15, 2.0, MScreen, Black, tvOnly ? 1.2f : 0.15f); }
                    Add(xr - 0.5, F, back - 0.5, xr - 0.1, F + 0.8, back - 0.1, MLeaf, Green);
                    Add(cxr + 1.2, F, back - 0.4, cxr + 1.25, F + 1.5, back - 0.35, MPlain, Black); Add(cxr + 1.05, F + 1.5, back - 0.55, cxr + 1.4, F + 1.75, back - 0.2, MLamp, new[] { 1f, 0.9f, 0.75f }, 0.8f);
                }
                else if (kind == 1)
                {   // a bedroom
                    var bedCover = Pick(Fabric);
                    Add(cxr - 0.8, F, back - 2.1, cxr + 0.8, F + 0.55, back, MFabric, bedCover);
                    Add(cxr - 0.8, F, back - 0.08, cxr + 0.8, F + 1.1, back, MWood, wood);
                    Add(cxr - 0.7, F + 0.55, back - 0.55, cxr - 0.05, F + 0.68, back - 0.15, MPlain, White); Add(cxr + 0.05, F + 0.55, back - 0.55, cxr + 0.7, F + 0.68, back - 0.15, MPlain, White);
                    Add(cxr - 1.35, F, back - 0.5, cxr - 0.9, F + 0.55, back, MWood, wood); Add(cxr + 0.9, F, back - 0.5, cxr + 1.35, F + 0.55, back, MWood, wood);
                    Add(cxr - 1.25, F + 0.55, back - 0.35, cxr - 1.0, F + 0.8, back - 0.1, MLamp, new[] { 1f, 0.85f, 0.65f }, 0.8f);
                    double wx = R() < 0.5 ? xl : xr - 0.6;
                    Add(wx, F, 1.0, wx + 0.6, F + 2.0, 2.2, MWood, wood);
                    Add(cxr - 0.4, F + 1.4, back - 0.03, cxr + 0.4, F + 1.9, back, MBoard, Pick(Bright));
                }
                else if (kind == 2)
                {   // a kitchen
                    var cab = R() < 0.5 ? White : wood;
                    Add(xl, F, back - 0.6, xr, F + 0.9, back, MWood, cab);
                    Add(xl, F + 0.9, back - 0.62, xr, F + 0.94, back, MPlain, Pick(new[] { Black, Grey, new[] { 0.75f, 0.72f, 0.66f } }));
                    Add(xl, F + 1.45, back - 0.35, xr - 1.0, F + 2.15, back, MWood, cab);
                    Add(xr - 0.85, F, back - 0.75, xr - 0.05, F + 1.8, back - 0.05, MPlain, R() < 0.5 ? Steel : White);
                    Add(cxr - 0.6, F + 0.73, back - 2.4, cxr + 0.6, F + 0.77, back - 1.6, MWood, wood); Add(cxr - 0.55, F, back - 2.35, cxr + 0.55, F + 0.73, back - 1.65, MWood, wood);
                    Add(cxr - 0.2, ceilY - 0.6, back - 2.15, cxr + 0.2, ceilY - 0.4, back - 1.85, MLamp, new[] { 1f, 0.88f, 0.7f }, 1f);
                }
                else
                {   // a home office or study
                    Add(cxr - 0.8, F + 0.72, back - 0.75, cxr + 0.8, F + 0.76, back, MWood, wood); Add(cxr - 0.8, F, back - 0.1, cxr + 0.8, F + 0.72, back, MWood, wood);
                    Add(cxr - 0.3, F + 0.76, back - 0.3, cxr + 0.3, F + 1.15, back - 0.25, MScreen, Black, tvOnly ? 1.0f : 0.5f);
                    Add(cxr - 0.3, F + 0.45, back - 1.4, cxr + 0.3, F + 0.52, back - 0.9, MFabric, Black); Add(cxr - 0.3, F + 0.52, back - 1.45, cxr + 0.3, F + 1.15, back - 1.38, MFabric, Black);
                    Add(xl, F, back - 2.5, xl + 0.35, F + 2.0, back - 0.8, MBooks, wood);
                    Add(xr - 0.35, F, back - 2.5, xr, F + 2.0, back - 0.8, MBooks, wood);
                    Add(cxr + 0.5, F + 0.76, back - 0.4, cxr + 0.7, F + 1.15, back - 0.2, MLamp, new[] { 1f, 0.9f, 0.7f }, 0.8f);
                }
                if (tvOnly && !boxes.Exists(b => b.Mat == MScreen)) tvOnly = false;
                // the ceiling light
                double lx = cxr, lz = back * (0.4 + R() * 0.25);
                Add(lx - 0.18, ceilY - 0.08, lz - 0.18, lx + 0.18, ceilY, lz + 0.18, MLamp, White, tvOnly ? 0 : 1);
                if (!tvOnly) lights.Add((lx, ceilY - 0.3, lz, 1.0));
                foreach (var b in boxes) if (b.Mat == MLamp && b.Y1 < ceilY - 0.1 && !tvOnly) lights.Add(((b.X0 + b.X1) / 2, b.Y0 - 0.05, (b.Z0 + b.Z1) / 2, 0.45));
                if (tvOnly) foreach (var b in boxes) if (b.Mat == MScreen) lights.Add(((b.X0 + b.X1) / 2 + 0.6, (b.Y0 + b.Y1) / 2, (b.Z0 + b.Z1) / 2, 0.35));
            }

            int cover = shop ? 0 : cell % 4;                    // 1 blinds, 2 curtains, else open (a sheer on some)
            bool sheer = !shop && cell % 8 == 7;
            double blindTo = 1 - (0.2 + R() * 0.7), curtainW = 0.12 + R() * 0.2;
            var curtain = Pick(Fabric);
            var tvLight = new[] { 0.55f, 0.68f, 1.0f };
            var lightC = tvOnly ? tvLight : lampC;

            var img = new RoomImage { W = w, H = h, Day = new float[w * h * 3], Night = new float[w * h * 3] };
            for (int py = 0; py < h; py++)
                for (int px = 0; px < w; px++)
                {
                    double x = (px + 0.5) / w, y = (py + 0.5) / h;
                    // the ray from the eye through this point of the glass
                    double gx = x * Wm, gy = y * Hm;
                    double dx = gx - ex, dy = gy - ey, dz = -ez, dl = Math.Sqrt(dx * dx + dy * dy + dz * dz);
                    dx /= dl; dy /= dl; dz /= dl;
                    double ox = gx, oy = gy, oz = 0;
                    // the far side of the room shell
                    double t = 1e9; int axis = 2; double sgn = 1;
                    void Exit(double o, double d, double lo, double hi, int ax)
                    {
                        if (Math.Abs(d) < 1e-9) return;
                        double tt = d > 0 ? (hi - o) / d : (lo - o) / d;
                        if (tt > 0 && tt < t) { t = tt; axis = ax; sgn = d > 0 ? -1 : 1; }
                    }
                    Exit(ox, dx, xl, xr, 0); Exit(oy, dy, floorY, ceilY, 1); Exit(oz, dz, 0, D, 2);
                    int mat = axis == 1 ? (sgn > 0 ? -1 : -2) : -3;   // -1 floor, -2 ceiling, -3 a wall
                    Box hit = null;
                    foreach (var b in boxes)
                    {
                        if (!RayBox(ox, oy, oz, dx, dy, dz, b, out double tb, out int ab, out double sb)) continue;
                        if (tb < t) { t = tb; axis = ab; sgn = sb; hit = b; }
                    }
                    double hx = ox + dx * t, hy = oy + dy * t, hz = oz + dz * t;
                    double nx = axis == 0 ? sgn : 0, ny = axis == 1 ? sgn : 0, nz = axis == 2 ? sgn : 0;
                    // surface coordinates (metres) across and up the face
                    double su = axis == 0 ? hz : hx, sv = axis == 1 ? hz : hy;
                    float r, g, bl, emit = 0;
                    if (hit != null)
                    {
                        var c = Pattern(hit, su, sv, axis, hy, cell);
                        r = c.r; g = c.g; bl = c.b; emit = hit.Emit > 0 && (hit.Mat == MLamp || hit.Mat == MScreen || hit.Mat == MBoard) ? hit.Emit : 0;
                        if (hit.Mat == MScreen && axis == 1) emit = 0;
                    }
                    else if (mat == -1)
                    {
                        r = floorC[0]; g = floorC[1]; bl = floorC[2];
                        if (floorMat == MPlanks) { double k = 0.85 + 0.15 * Hash((int)Math.Floor(hx / 0.14), (int)Math.Floor(hz / 1.2 + Math.Floor(hx / 0.14) * 0.37), cell, 21); if ((hx / 0.14) % 1 < 0.06) k *= 0.7; r *= (float)k; g *= (float)k; bl *= (float)k; }
                        else if (floorMat == MTile) { bool chk = ((int)Math.Floor(hx / 0.6) + (int)Math.Floor(hz / 0.6)) % 2 == 0; float k = chk ? 1f : 0.86f; if ((hx / 0.6) % 1 < 0.02 || (hz / 0.6) % 1 < 0.02) k *= 0.8f; r *= k; g *= k; bl *= k; }
                        else { float k = (float)(0.92 + 0.08 * Hash((int)(hx * 30), (int)(hz * 30), cell, 3)); r *= k; g *= k; bl *= k; }
                    }
                    else if (mat == -2) { r = 0.88f; g = 0.88f; bl = 0.86f; }
                    else
                    {
                        r = paint[0]; g = paint[1]; bl = paint[2];
                        if (axis == 0) { r *= 0.95f; g *= 0.95f; bl *= 0.95f; }
                        if (hy < floorY + 0.1) { r *= 0.6f; g *= 0.6f; bl *= 0.6f; }   // skirting
                    }
                    // a little darkening into the corners (light that can't get there)
                    double corner = Math.Min(Math.Min(hx - xl, xr - hx), Math.Min(Math.Min(hy - floorY, ceilY - hy), D - hz));
                    float ao = (float)(1 - 0.35 * Math.Exp(-corner * 5));

                    // by day: light through the window (a soft source at the glass) and what bounces round the room
                    double wxp = Wm / 2 - hx, wyp = Hm * 0.6 - hy, wzp = -0.3 - hz, wd = Math.Sqrt(wxp * wxp + wyp * wyp + wzp * wzp);
                    double nl = Math.Max(0, (nx * wxp + ny * wyp + nz * wzp) / wd);
                    double dayShadow = Shadowed(hx + nx * 0.01, hy + ny * 0.01, hz + nz * 0.01, Wm / 2, Hm * 0.6, -0.3, boxes, hit) ? 0.35 : 1;
                    double dayL = (0.22 + 1.6 * nl * dayShadow / (1 + wd * wd / 6)) * ao;
                    // at night: the lamps
                    double nightL = 0;
                    if (lit > 0)
                    {
                        foreach (var L in lights)
                        {
                            double lxp = L.x - hx, lyp = L.y - hy, lzp = L.z - hz, ld = Math.Sqrt(lxp * lxp + lyp * lyp + lzp * lzp);
                            double ndl = Math.Max(0, (nx * lxp + ny * lyp + nz * lzp) / ld);
                            if (ndl <= 0) continue;
                            double add = L.power * ndl / (1 + ld * ld / (shop ? 9 : 2.5));
                            // only the lights that matter here cast a shadow (a shop has dozens of tubes)
                            if (add > 0.04 && Shadowed(hx + nx * 0.01, hy + ny * 0.01, hz + nz * 0.01, L.x, L.y, L.z, boxes, hit)) add *= 0.2;
                            nightL += add;
                        }
                        nightL = (nightL * 0.9 + (lights.Count > 0 ? (shop ? 0.12 : 0.1) : 0)) * ao;
                    }
                    float dr = (float)(r * dayL * 0.16), dg = (float)(g * dayL * 0.165), db = (float)(bl * dayL * 0.17);
                    var lc = lightC;
                    float nr = (float)(r * nightL * lc[0]), ng = (float)(g * nightL * lc[1]), nb = (float)(bl * nightL * lc[2]);
                    if (lit > 0 && emit > 0)
                    {
                        var ec = hit.Mat == MScreen ? tvLight : hit.Mat == MBoard ? new[] { r * 2.5f, g * 2.5f, bl * 2.5f } : new[] { 1f, 0.95f, 0.85f };
                        nr += ec[0] * emit; ng += ec[1] * emit; nb += ec[2] * emit;
                    }
                    if (shop) { dr *= 1.5f; dg *= 1.5f; db *= 1.5f; }

                    // what hangs at the glass
                    double cov = 0; float[] cc = null; double slat = 1;
                    if (cover == 1 && y > blindTo) { cov = 1; cc = new[] { 0.82f, 0.80f, 0.74f }; slat = (y * 30) % 1 < 0.15 ? 0.7 : 1.0; }
                    if (cover == 2 && (x < curtainW || x > 1 - curtainW)) { cov = 1; cc = curtain; slat = 0.82 + 0.18 * Math.Sin(x * 70); }
                    if (sheer && cov == 0) { cov = 0.55; cc = new[] { 0.9f, 0.9f, 0.88f }; }
                    if (cov > 0)
                    {
                        float k = (float)(cov * slat), keep = 1 - (float)cov;
                        dr = dr * keep + cc[0] * 0.45f * k; dg = dg * keep + cc[1] * 0.45f * k; db = db * keep + cc[2] * 0.45f * k;
                        float glow = (float)(lit > 0 ? 0.3 : 0) * k;  // a lit room shows through the cloth
                        nr = nr * keep + cc[0] * lc[0] * glow; ng = ng * keep + cc[1] * lc[1] * glow; nb = nb * keep + cc[2] * lc[2] * glow;
                    }
                    int o = (py * w + px) * 3;
                    img.Day[o] = Math.Min(1, dr); img.Day[o + 1] = Math.Min(1, dg); img.Day[o + 2] = Math.Min(1, db);
                    img.Night[o] = Math.Min(1, nr); img.Night[o + 1] = Math.Min(1, ng); img.Night[o + 2] = Math.Min(1, nb);
                }
            return img;
        }

        /// <summary>Where a ray first enters a box (t > 0): which axis's face it came through and that face's outward sign.</summary>
        static bool RayBox(double ox, double oy, double oz, double dx, double dy, double dz, Box b, out double t, out int axis, out double sgn)
        {
            t = 0; axis = 0; sgn = 1;
            double tmin = -1e9, tmax = 1e9;
            if (!Slab(ox, dx, b.X0, b.X1, 0, ref tmin, ref tmax, ref axis, ref sgn)) return false;
            if (!Slab(oy, dy, b.Y0, b.Y1, 1, ref tmin, ref tmax, ref axis, ref sgn)) return false;
            if (!Slab(oz, dz, b.Z0, b.Z1, 2, ref tmin, ref tmax, ref axis, ref sgn)) return false;
            if (tmin <= 1e-6) return false;
            t = tmin;
            return true;
        }

        static bool Slab(double o, double d, double lo, double hi, int a, ref double tmin, ref double tmax, ref int axis, ref double sgn)
        {
            if (Math.Abs(d) < 1e-12) return o >= lo && o <= hi;
            double t0 = (lo - o) / d, t1 = (hi - o) / d, s = -1;
            if (t0 > t1) { double tmp = t0; t0 = t1; t1 = tmp; s = 1; }
            if (t0 > tmin) { tmin = t0; axis = a; sgn = s; }
            if (t1 < tmax) tmax = t1;
            return tmin <= tmax;
        }

        static bool Shadowed(double x, double y, double z, double lx, double ly, double lz, List<Box> boxes, Box self)
        {
            double dx = lx - x, dy = ly - y, dz = lz - z, l = Math.Sqrt(dx * dx + dy * dy + dz * dz);
            dx /= l; dy /= l; dz /= l;
            foreach (var b in boxes)
            {
                if (b == self || b.Mat == MLamp) continue;
                if (RayBox(x, y, z, dx, dy, dz, b, out double t, out _, out _) && t < l - 0.05) return true;
            }
            return false;
        }

        static (float r, float g, float b) Pattern(Box b, double su, double sv, int axis, double y, int cell)
        {
            float r = b.R, g = b.G, bl = b.B;
            switch (b.Mat)
            {
                case MWood: { float k = (float)(0.88 + 0.12 * Hash((int)Math.Floor(su * 12), b.Seed, 1, 1)); return (r * k, g * k, bl * k); }
                case MBooks:
                case MGoods:
                case MClothes:
                {
                    bool goods = b.Mat == MGoods, clothes = b.Mat == MClothes;
                    double shelf = goods ? 0.4 : clothes ? 0.45 : 0.38, item = goods ? 0.11 : clothes ? 0.07 : 0.035;
                    double fy = (sv - b.Y0) / shelf, fr = fy - Math.Floor(fy);
                    if (axis == 1 || fr < 0.08) return (r * 0.9f, g * 0.9f, bl * 0.9f);    // tops and the shelf boards
                    int col = (int)Math.Floor(su / item), row = (int)Math.Floor(fy);
                    double hh = Hash(col, row, b.Seed, cell);
                    if (hh < (goods ? 0.08 : 0.12)) return (0.06f, 0.05f, 0.05f);             // a gap
                    var pal = goods || clothes ? Bright : Fabric;
                    var c = pal[(int)(Hash(col, row, b.Seed, 77) * pal.Length) % pal.Length];
                    double topAt = 0.55 + 0.4 * Hash(col, row, b.Seed, 5);
                    if (!clothes && fr > topAt) return (0.06f, 0.05f, 0.05f);                // above the books/goods
                    float k = (float)((goods || clothes ? 0.5 : 0.75) + 0.3 * Hash(col, row, b.Seed, 9));
                    return (Math.Min(1, c[0] * k), Math.Min(1, c[1] * k), Math.Min(1, c[2] * k));
                }
                case MFabric: { float k = (float)(0.92 + 0.08 * Math.Sin(su * 40) * Math.Sin(sv * 40)); return (r * k, g * k, bl * k); }
                case MBoard:
                {
                    double u = (su - (axis == 0 ? b.Z0 : b.X0)) / Math.Max(0.01, (axis == 0 ? b.Z1 - b.Z0 : b.X1 - b.X0)), v = (sv - b.Y0) / Math.Max(0.01, b.Y1 - b.Y0);
                    bool frame = u < 0.04 || u > 0.96 || v < 0.05 || v > 0.95;
                    if (frame) return (0.12f, 0.1f, 0.08f);
                    bool line = r < 0.1 && ((v * 9) % 1 < 0.35) && u > 0.1 && u < 0.1 + 0.8 * Hash((int)(v * 9), b.Seed, 1, 2);
                    return line ? (0.9f, 0.88f, 0.8f) : (r, g, bl);
                }
                case MLeaf: { double k = 0.6 + 0.6 * Hash((int)(su * 25), (int)(sv * 25), b.Seed, 4); return ((float)(r * k), (float)(g * k), (float)(bl * k)); }
                case MMirror: return (0.55f, 0.57f, 0.6f);
                case MLamp: return (1f, 1f, 0.97f);
                default: return (r, g, bl);
            }
        }
    }
}
