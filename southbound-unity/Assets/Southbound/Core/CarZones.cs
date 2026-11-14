// Where on a car body each material goes: paint, glass, window trim, headlights (reflector, LED
// strip, projector), grille, plates, tail lights, siren bar, chrome, rust... The web game decides
// this per pixel in its body shader (carbuilder.js sbZones). Here the same rules run once per
// triangle when the mesh is built, and each triangle gets a slot in a small palette (16 x 4 texels:
// base colour, mask, coat and emission maps on a stock HDRP Lit material). The finest body level is
// built finer than the browser's (about 3 cm) so the lamps and window edges stay crisp.
// Left for the HDRP car shader (U4): panel gaps, metallic flakes, dirt and rain beads.
//
// Car space is the web game's (z forward, y up, x toward the driver's side).
using System;

namespace Southbound.Core
{
    public static class CarZones
    {
        // body slots
        public const int Paint = 0, Paint2 = 1, RoofTop = 2, Underside = 3, WheelWell = 4, Glass = 5, GlassLow = 6, GlassTrim = 7,
            Chrome = 8, Accessory = 9, HeadReflector = 10, HeadLed = 11, HeadProjector = 12, HeadBezel = 13, Grille = 14, GrilleRim = 15,
            Plate = 16, PlateText = 17, TailOuter = 18, TailInner = 19, SirenRed = 20, SirenBlue = 21, TaxiSign = 22, DoorHandle = 23,
            RustDark = 24, RustLight = 25, PaintFaded = 26, Paint2Faded = 27;
        /// <summary>Wheel parts: tyre, rim, barrel, hub, brake disc, caliper (near levels), then the far level's tyre and rim face.</summary>
        public const int WheelFirst = 48, WheelFarFirst = 54;
        public const int Count = 28;
        public static readonly string[] Names =
        {
            "paint", "paint2", "roof", "underside", "wheel well", "glass", "glass (lower)", "window trim", "chrome", "black trim",
            "headlight reflector", "headlight LED", "headlight projector", "headlight bezel", "grille", "grille surround",
            "plate", "plate letters", "tail light", "tail light (inner)", "siren red", "siren blue", "taxi sign", "door handle",
            "rust (dark)", "rust (light)", "paint (faded)", "paint2 (faded)",
        };
        public static bool IsGlass(int slot) => slot == Glass || slot == GlassLow;
        public static bool IsLamp(int slot) => slot >= HeadReflector && slot <= HeadProjector || slot == TailOuter || slot == TailInner;

        static double Clamp01(double v) => v < 0 ? 0 : v > 1 ? 1 : v;
        static double Mix(double a, double b, double t) => a + (b - a) * t;
        static double Fract(double v) => v - Math.Floor(v);
        static double Rect(double px, double py, double cx, double cy, double hx, double hy, double r)
        {
            double qx = Math.Abs(px - cx) - hx + r, qy = Math.Abs(py - cy) - hy + r;
            return Math.Sqrt(Math.Max(qx, 0) * Math.Max(qx, 0) + Math.Max(qy, 0) * Math.Max(qy, 0)) + Math.Min(Math.Max(qx, qy), 0) - r;
        }
        // the shader's value noise (sbHash / sbNoise)
        static double Hash(double x, double y, double z)
        {
            x = Fract(x * 0.3183099 + 0.1) * 17; y = Fract(y * 0.3183099 + 0.1) * 17; z = Fract(z * 0.3183099 + 0.1) * 17;
            return Fract(x * y * z * (x + y + z));
        }
        public static double Noise(double x, double y, double z)
        {
            double ix = Math.Floor(x), iy = Math.Floor(y), iz = Math.Floor(z), fx = x - ix, fy = y - iy, fz = z - iz;
            fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy); fz = fz * fz * (3 - 2 * fz);
            return Mix(Mix(Mix(Hash(ix, iy, iz), Hash(ix + 1, iy, iz), fx), Mix(Hash(ix, iy + 1, iz), Hash(ix + 1, iy + 1, iz), fx), fy),
                       Mix(Mix(Hash(ix, iy, iz + 1), Hash(ix + 1, iy, iz + 1), fx), Mix(Hash(ix, iy + 1, iz + 1), Hash(ix + 1, iy + 1, iz + 1), fx), fy), fz);
        }

        /// <summary>The slot for a point on the body with its outward normal (unit), in car space.</summary>
        public static int Slot(CarSpec s, double x, double y, double z, double nx, double ny, double nz)
        {
            double ax = Math.Abs(x), belt = s.Belt, roof = s.Roof, ride = s.Ride, W2 = s.W / 2, L2 = s.L / 2;
            double doorF = s.AxF - s.Rw - 0.14;
            int slot = Paint; bool paint = true;
            // liveries
            if (s.Livery > 0.5 && s.Livery < 1.5 && ((z < doorF && z > s.DoorR && y < belt && y > ride + 0.16) || y > belt + 0.02)) slot = Paint2;
            if (s.Stripe > 0 && Math.Abs(y - s.Stripe) < 0.1) slot = Paint2;
            if (s.TwoTone && z < s.ZC0 - 0.05 && y > belt - 0.5) slot = Paint2;
            // lower trim, skirts and underside
            if (y < ride + 0.05 || ny < -0.55) { slot = Underside; paint = false; }
            // wheel wells
            double dW = Math.Min(Math.Sqrt((z - s.AxF) * (z - s.AxF) + (y - s.Rw) * (y - s.Rw)), Math.Sqrt((z - s.AxR) * (z - s.AxR) + (y - s.Rw) * (y - s.Rw)));
            if (dW < s.Rw + 0.09 && ax < W2 - 0.012 && ny < 0.45) { slot = WheelWell; paint = false; }
            // greenhouse: windscreen, rear window, side glass, pillars and trim
            if (y > belt + 0.02 && y < roof + 0.01)
            {
                double tw = Clamp01((y - belt) / (roof - belt));
                double zws = Mix(s.ZA0, s.ZA1, tw), zrw = Mix(s.ZC0, s.ZC1, tw);
                double hwc = s.Hwc - (y - belt) * s.Tumble;
                bool glass = false, trim = false;
                if (y < roof - 0.025)
                {
                    if (z > zws - 0.1 && nz > 0.15) { glass = ax < hwc - 0.09; trim = !glass && ax < hwc - 0.065; }
                    else if (z < zrw + 0.1 && nz < -0.15) { glass = ax < hwc - 0.1; trim = !glass && ax < hwc - 0.075; }
                    else if (Math.Abs(nx) > 0.3 && ny < 0.85)
                    {
                        double zf = zws - 0.11, zr = Math.Max(zrw + 0.14, s.GlassBack), yt = roof - 0.07;
                        double edge = Math.Min(Math.Min(zf - z, z - zr), yt - y);
                        if (edge > 0) { glass = edge > 0.016 && Math.Abs(z - s.ZB) > 0.045; trim = !glass; }
                    }
                }
                // two-tone body above the split line; a vinyl or fabric roof
                if (!glass && !trim && s.Split > 0 && y > s.Split && paint) slot = Paint2;
                if (!glass && !trim && s.RoofMode > 0.5 && y > Mix(belt, roof, s.RoofMode > 1.5 ? 0.3 : 0.82)) { slot = RoofTop; paint = false; }
                if (glass) { slot = y < belt + (roof - belt) * 0.45 ? GlassLow : Glass; paint = false; }
                else if (trim) { slot = GlassTrim; paint = false; }
            }
            if (paint && s.Split > 0 && y > s.Split && y <= belt + 0.02) slot = Paint2;
            // chrome bumpers
            if (s.Chrome && (z > L2 - 0.16 || z < -L2 + 0.16) && y > ride + 0.07 && y < ride + 0.3) { slot = Chrome; paint = false; }
            // black accessories: roof rails, running boards, bull bar, spare wheel, flares' plastic cladding
            bool acc = s.Rack != 0 || s.Steps != 0 || s.Bullbar != 0 || s.Spare != 0 || s.Flare != 0;
            if (acc && (y > roof + 0.025 || ax > W2 + 0.012 || z > L2 + 0.03 || z < -L2 - 0.03)) { slot = Accessory; paint = false; }
            // front: headlights, grille, plate
            if (nz > 0.25 && z > L2 - 0.6 && z < L2 + 0.025)
            {
                double hx = ax - s.Head[0], hy = y - s.Head[1];
                hy -= hx * 0.18; // lamps sweep up toward the corners
                double hl = Rect(hx, hy, 0, 0, s.Head[2], s.Head[3], 0.025);
                if (hl < 0)
                {
                    bool led = Math.Abs(hy - s.Head[3] * 0.55) < s.Head[3] * 0.22 && Math.Abs(hx) < s.Head[2] * 0.85;
                    double px = hx + s.Head[2] * 0.45, py = hy + s.Head[3] * 0.15;
                    bool proj = Math.Sqrt(px * px + py * py) < s.Head[3] * 0.55;
                    slot = proj ? HeadProjector : led ? HeadLed : HeadReflector; paint = false;
                }
                else if (hl < 0.008) { slot = HeadBezel; paint = false; }
                double gh = s.GrilleH > 0 ? s.GrilleH : 0.075;
                double gcy = s.Head[1] - s.Head[3] - 0.075 - (gh - 0.075);
                double gr = Rect(x, y, 0, gcy, s.Grille, gh, 0.03);
                if (gr < 0) { slot = Grille; paint = false; }
                else if (gr < 0.014) { slot = GrilleRim; paint = false; }
                PlateAt(x, y, ride + 0.2, ref slot, ref paint);
            }
            // rear: tail lights and plate
            if (nz < -0.25 && z < -L2 + 0.6 && z > -L2 - 0.025)
            {
                double tl = Rect(ax, y, s.Tail4[0], s.Tail4[1], s.Tail4[2], s.Tail4[3], 0.025);
                if (tl < 0)
                {
                    double inner = Rect(ax, y, s.Tail4[0], s.Tail4[1], s.Tail4[2] - 0.025, s.Tail4[3] - 0.025, 0.02);
                    slot = inner < 0 ? TailInner : TailOuter; paint = false;
                }
                PlateAt(x, y, ride + 0.38, ref slot, ref paint);
            }
            // roof equipment: siren bar / taxi sign
            if (s.Bar != null && y > roof + 0.008)
            {
                slot = s.Bar == "taxi" ? TaxiSign : x < 0 ? SirenRed : SirenBlue;
                paint = false;
            }
            // old paint: rust from the sills and arches up, a sun-faded, chalky top
            if (paint && s.Rust > 0)
            {
                double rn = Noise(x * 7, y * 7, z * 7) * 0.6 + Noise(x * 23, y * 23, z * 23) * 0.4;
                double low = Clamp01(1 - (y - ride) / 0.45) + Clamp01(1 - dW / (s.Rw + 0.25)) * 0.6;
                double th = 0.66 - s.Rust * 0.16 - low * 0.22;
                double t = Clamp01((rn - th) / 0.05); double r = t * t * (3 - 2 * t);
                if (r > 0.5) { slot = Noise(x * 70, y * 70, z * 70) > 0.5 ? RustLight : RustDark; paint = false; }
                else if (ny > 0.5) slot = slot == Paint2 ? Paint2Faded : PaintFaded;
            }
            // door handles
            if (paint && Math.Abs(nx) > 0.6 && Math.Abs(y - (belt - 0.085)) < 0.017 && Math.Abs(z - (s.ZB > -50 ? s.ZB - 0.22 : doorF - 0.85)) < 0.075) slot = DoorHandle;
            return slot;
        }

        static void PlateAt(double x, double y, double cy, ref int slot, ref bool paint)
        {
            if (Rect(x, y, 0, cy, 0.26, 0.062, 0.012) >= 0) return;
            slot = Math.Abs(y - cy + 0.005) < 0.024 && Math.Abs(x) < 0.2 && Fract(x * 16) < 0.62 ? PlateText : Plate;
            paint = false;
        }
    }

    /// <summary>What a car looks like beyond its shape: paint, second colour, roof cover, age, wheel colours.
    /// Plain fields so a Unity component can keep one (Unity serialises it).</summary>
    [Serializable]
    public sealed class CarLook
    {
        public float[] Paint = { 0.6f, 0.6f, 0.62f };
        public float Metal = 0.5f;
        public float[] Paint2 = { 0.85f, 0.85f, 0.85f };
        public float[] RoofC = { 0.02f, 0.02f, 0.022f };
        public int RoofMode;
        public float Rust;
        /// <summary>The glass tint (web uTint): 0 clear .. 1 limo black.</summary>
        public float Tint = 0.2f;
        /// <summary>Wheel part colours: 8 parts x (r, g, b, roughness, metalness), slots 48..55.</summary>
        public float[] Wheel = new float[8 * 5];

        public static CarLook For(CarInfo car, WheelSet wheels, double[] paint = null)
        {
            var s = car.Spec;
            var p = paint ?? car.Paint ?? s.Paint;
            var look = new CarLook { RoofMode = (int)s.RoofMode, Rust = (float)s.Rust };
            if (p != null) { look.Paint = new[] { (float)p[0], (float)p[1], (float)p[2] }; if (p.Length > 3) look.Metal = (float)p[3]; }
            var p2 = car.Paint2 ?? s.Paint2;
            if (p2 != null) look.Paint2 = new[] { (float)p2[0], (float)p2[1], (float)p2[2] };
            if (s.RoofC != null) look.RoofC = new[] { (float)s.RoofC[0], (float)s.RoofC[1], (float)s.RoofC[2] };
            var st = wheels?.Style(s.Spokes);
            if (st != null)
            {
                for (int i = 0; i < 6 && i < st.Levels[0].Palette.Length; i++) for (int k = 0; k < 5; k++) look.Wheel[i * 5 + k] = (float)st.Levels[0].Palette[i][k];
                var far = st.Levels[st.Levels.Length - 1].Palette;
                for (int i = 0; i < 2 && i < far.Length; i++) for (int k = 0; k < 5; k++) look.Wheel[(6 + i) * 5 + k] = (float)far[i][k];
            }
            return look;
        }
    }

    /// <summary>The lights a car has on: 0..1 each (web uLights, uBrake, uSirenR, uSirenB).</summary>
    public struct CarLights { public double Head, Brake, SirenRed, SirenBlue; }

    /// <summary>The 16 x 4 palette textures, as linear RGBA floats (4 per texel, row by row).</summary>
    public static class CarPalette
    {
        public const int Width = 16, Height = 4, Texels = Width * Height;

        /// <summary>Texture coordinate of a slot's texel centre.</summary>
        public static (float u, float v) Uv(int slot) => ((slot % Width + 0.5f) / Width, (slot / Width + 0.5f) / Height);

        /// <summary>The second texture coordinate (for the flake detail map): metres across whichever face of the
        /// body the normal points out of (a box projection, so flakes stay the same size everywhere).</summary>
        public static (float u, float v) FlakeUv(float x, float y, float z, float nx, float ny, float nz)
        {
            float ax = Math.Abs(nx), ay = Math.Abs(ny), az = Math.Abs(nz);
            if (ax >= ay && ax >= az) return (z, y);
            if (ay >= az) return (x, z);
            return (x, y);
        }

        /// <summary>Metallic flake as an HDRP detail map (linear RGBA, tileable; 0.5 = no change): R lightens or
        /// darkens the colour, G and A tilt the normal (G = y, A = x), B nudges smoothness. Each flake is a tiny
        /// mirror at its own angle, so it catches the light on its own: the sparkle of metallic paint.</summary>
        public static float[] FlakeDetail(int size, int seed, int cellsAcross = 96)
        {
            var px = new float[size * size * 4];
            for (int i = 0; i < px.Length; i++) px[i] = 0.5f;
            var rnd = new Mulberry32((uint)seed);
            double cell = size / (double)cellsAcross;
            for (int cj = 0; cj < cellsAcross; cj++)
                for (int ci = 0; ci < cellsAcross; ci++)
                {
                    // a flake somewhere in its cell, a random size and tilt
                    double fx = (ci + 0.15 + 0.7 * rnd.Next()) * cell, fy = (cj + 0.15 + 0.7 * rnd.Next()) * cell;
                    double rad = cell * (0.22 + 0.25 * rnd.Next());
                    double tx = (rnd.Next() - 0.5) * 1.3, ty = (rnd.Next() - 0.5) * 1.3, bright = (rnd.Next() - 0.4) * 0.35, smooth = 0.5 + rnd.Next() * 0.2;
                    int x0 = (int)Math.Floor(fx - rad), x1 = (int)Math.Ceiling(fx + rad), y0 = (int)Math.Floor(fy - rad), y1 = (int)Math.Ceiling(fy + rad);
                    for (int y = y0; y <= y1; y++)
                        for (int x = x0; x <= x1; x++)
                        {
                            double dx = x + 0.5 - fx, dy = y + 0.5 - fy;
                            if (dx * dx + dy * dy > rad * rad) continue;
                            int wx = ((x % size) + size) % size, wy = ((y % size) + size) % size, o = (wy * size + wx) * 4;   // wraps: tileable
                            px[o] = (float)Math.Max(0, Math.Min(1, 0.5 + bright));
                            px[o + 1] = (float)Math.Max(0, Math.Min(1, 0.5 + ty * 0.5));
                            px[o + 2] = (float)smooth;
                            px[o + 3] = (float)Math.Max(0, Math.Min(1, 0.5 + tx * 0.5));
                        }
                }
            return px;
        }

        /// <summary>Fills base colour (linear rgb, a = 1), mask (HDRP: r metal, g occlusion, b detail, a smoothness) and coat mask (r) for every slot.</summary>
        public static void Fill(CarLook k, float[] baseColor, float[] mask, float[] coat)
        {
            void Set(int slot, double r, double g, double b, double rough, double metal, double cm, double detail = 0)
            {
                int i = slot * 4;
                baseColor[i] = (float)r; baseColor[i + 1] = (float)g; baseColor[i + 2] = (float)b; baseColor[i + 3] = 1;
                mask[i] = (float)metal; mask[i + 1] = 1; mask[i + 2] = (float)detail; mask[i + 3] = (float)(1 - rough);
                coat[i] = coat[i + 1] = coat[i + 2] = (float)cm; coat[i + 3] = 1;
            }
            for (int s = 0; s < Texels; s++) Set(s, 0.5, 0.5, 0.5, 0.5, 0, 0);
            double m = k.Metal, rust = k.Rust;
            double pr = 0.3 + (0.36 - 0.3) * m, pm = m * 0.6, pc = 1.0;
            if (rust > 0) { pc *= 1 - rust * 0.85; pr += (0.72 - pr) * rust * 0.8; pm *= 1 - rust * 0.7; }
            double[] P = { k.Paint[0], k.Paint[1], k.Paint[2] }, P2 = { k.Paint2[0], k.Paint2[1], k.Paint2[2] };
            // metallic flake in the paint (the detail map): strong in metallic paint, a faint orange peel in solid
            // colours, mostly gone where the paint has oxidised
            double fl = (0.2 + 0.8 * m) * (1 - rust * 0.9);
            Set(CarZones.Paint, P[0], P[1], P[2], pr, pm, pc, fl);
            Set(CarZones.Paint2, P2[0], P2[1], P2[2], pr, pm, pc, fl);
            double fade = rust * 0.55;
            Set(CarZones.PaintFaded, P[0] + (P[0] * 0.75 + 0.1 - P[0]) * fade, P[1] + (P[1] * 0.75 + 0.1 - P[1]) * fade, P[2] + (P[2] * 0.75 + 0.1 - P[2]) * fade, pr, pm, pc, fl * 0.7);
            Set(CarZones.Paint2Faded, P2[0] + (P2[0] * 0.75 + 0.1 - P2[0]) * fade, P2[1] + (P2[1] * 0.75 + 0.1 - P2[1]) * fade, P2[2] + (P2[2] * 0.75 + 0.1 - P2[2]) * fade, pr, pm, pc, fl * 0.7);
            bool fabric = k.RoofMode > 1;
            double rc = fabric ? 0.925 : 1; // woven cloth averages a little darker
            Set(CarZones.RoofTop, k.RoofC[0] * rc, k.RoofC[1] * rc, k.RoofC[2] * rc, fabric ? 0.92 : 0.55, 0, fabric ? 0 : 0.3);
            Set(CarZones.Underside, 0.022, 0.022, 0.022, 0.75, 0, 0);
            Set(CarZones.WheelWell, 0.01, 0.01, 0.01, 0.92, 0, 0);
            double gk = 1 - k.Tint * 0.8, gl = 1 - k.Tint;
            Set(CarZones.Glass, 0.01 * gk, 0.012 * gk, 0.014 * gk, 0.025, 0, 1);
            Set(CarZones.GlassLow, 0.01 * gk + 0.03 * gl, 0.012 * gk + 0.035 * gl, 0.014 * gk + 0.04 * gl, 0.025, 0, 1);
            Set(CarZones.GlassTrim, 0.018, 0.018, 0.018, 0.3, 0, 0.6);
            Set(CarZones.Chrome, 0.72, 0.72, 0.72, 0.1, 1, 1);
            Set(CarZones.Accessory, 0.025, 0.025, 0.025, 0.7, 0.2, 0);
            Set(CarZones.HeadReflector, 0.5, 0.5, 0.5, 0.05, 0.95, 1);
            Set(CarZones.HeadLed, 0.5, 0.5, 0.5, 0.05, 0.95, 1);
            Set(CarZones.HeadProjector, 0.04, 0.04, 0.04, 0.02, 0, 1);
            Set(CarZones.HeadBezel, 0.06, 0.06, 0.06, 0.25, 0.6, 1);
            Set(CarZones.Grille, 0.0225, 0.0225, 0.0225, 0.5, 0.4, 0); // (the mesh pattern averaged)
            Set(CarZones.GrilleRim, 0.7, 0.7, 0.7, 0.12, 1, 1);
            Set(CarZones.Plate, 0.72, 0.73, 0.74, 0.45, 0, 0);
            Set(CarZones.PlateText, 0.04, 0.06, 0.16, 0.45, 0, 0);
            Set(CarZones.TailOuter, 0.22, 0.008, 0.008, 0.08, 0.1, 1);
            Set(CarZones.TailInner, 0.22, 0.008, 0.008, 0.08, 0.1, 1);
            Set(CarZones.SirenRed, 0.3, 0.01, 0.01, 0.08, 0, 1);
            Set(CarZones.SirenBlue, 0.01, 0.02, 0.3, 0.08, 0, 1);
            Set(CarZones.TaxiSign, 0.9, 0.85, 0.6, 0.2, 0, 0.5);
            Set(CarZones.DoorHandle, 0.55, 0.55, 0.55, 0.18, 1, 1);
            Set(CarZones.RustDark, 0.13, 0.05, 0.018, 0.95, 0, 0);
            Set(CarZones.RustLight, 0.32, 0.13, 0.04, 0.95, 0, 0);
            for (int w = 0; w < 8; w++)
            {
                var c = k.Wheel; int o = w * 5;
                Set(CarZones.WheelFirst + w, c[o], c[o + 1], c[o + 2], c[o + 3], c[o + 4], 0);
            }
        }

        /// <summary>Emission per slot (linear rgb in the web game's units: 1 = a lit sign), for the lights that are on.</summary>
        public static void Emission(CarLights l, float[] emit, double lightK = 1)
        {
            Array.Clear(emit, 0, emit.Length);
            void Set(int slot, double r, double g, double b, double k) { int i = slot * 4; emit[i] = (float)(r * k); emit[i + 1] = (float)(g * k); emit[i + 2] = (float)(b * k); emit[i + 3] = 1; }
            Set(CarZones.HeadReflector, 1, 0.96, 0.9, 0.04 * lightK);
            Set(CarZones.HeadLed, 1, 0.96, 0.9, (1.2 + l.Head * 6) * lightK);
            Set(CarZones.HeadProjector, 1, 0.96, 0.9, (l.Head * 12 + 0.04) * lightK);
            double tail = 0.2 + l.Head * 1.6 + l.Brake * 5;
            Set(CarZones.TailOuter, 1, 0.03, 0.015, 0.35 * tail);
            Set(CarZones.TailInner, 1, 0.03, 0.015, tail);
            Set(CarZones.SirenRed, 1, 0.02, 0.02, l.SirenRed * 9);
            Set(CarZones.SirenBlue, 0.05, 0.18, 1, l.SirenBlue * 9);
            Set(CarZones.TaxiSign, 1, 0.8, 0.3, 0.15 + l.Head * 2.5);
        }
    }
}
