// A car body as a signed-distance field: the web game's carbuilder.js bodySDF, line for line.
// Negative inside, positive outside, in metres, car space (z forward, y up, x to the driver's side).
// The lower body and the greenhouse are "blocks" (side profile, front and rear faces and the
// half-width as smooth curves, intersected with rounded edges), smoothly joined, with the design's
// own features blended in (bonnet bulge and scoop, wheel-arch flares, roof rails, spare wheel, bull
// bar, running boards, siren bar, taxi sign, tow boom, ladder rails), fenders over the wheels, the
// wheel arches cut out and a pickup's bed hollowed. Tables are float32 like the web game's, and
// rounding is JavaScript's, so a field sample agrees with the browser to the last bit or two.
using System;
using System.Collections.Generic;
using System.Linq;

namespace Southbound.Core
{
    public delegate double Sdf(double x, double y, double z);

    public static class CarShape
    {
        static double Hyp2(double a, double b) => Math.Sqrt(a * a + b * b);
        static double Hyp3(double a, double b, double c) => Math.Sqrt(a * a + b * b + c * c);
        public static double Smax(double a, double b, double k) { double h = Math.Max(k - Math.Abs(a - b), 0) / k; return Math.Max(a, b) + h * h * k * 0.25; }
        public static double Smin(double a, double b, double k) { double h = Math.Max(k - Math.Abs(a - b), 0) / k; return Math.Min(a, b) - h * h * k * 0.25; }

        /// <summary>A smooth 1D curve through control points (Catmull-Rom), tabulated every centimetre.</summary>
        public sealed class Profile
        {
            readonly float[] val, der;
            readonly double x0, step;
            readonly int n;

            public Profile(double[][] points, double step = 0.01)
            {
                var p = points.OrderBy(q => q[0]).ToArray(); // (stable, like Array.prototype.sort)
                x0 = p[0][0]; double x1 = p[p.Length - 1][0];
                this.step = step;
                n = Math.Max(2, (int)Math.Ceiling((x1 - x0) / step) + 1);
                val = new float[n]; der = new float[n];
                for (int i = 0; i < n; i++) val[i] = (float)At(p, x0 + i * step);
                for (int i = 0; i < n; i++)
                    der[i] = (float)((val[Math.Min(n - 1, i + 1)] - (double)val[Math.Max(0, i - 1)]) / (step * (i == 0 || i == n - 1 ? 1 : 2)));
            }

            static double At(double[][] p, double x)
            {
                int i = 0;
                while (i < p.Length - 2 && x > p[i + 1][0]) i++;
                double[] a = p[Math.Max(0, i - 1)], b = p[i], c = p[i + 1], d = p[Math.Min(p.Length - 1, i + 2)];
                double t = (x - b[0]) / Math.Max(1e-6, c[0] - b[0]);
                double m1 = (c[1] - a[1]) / Math.Max(1e-6, c[0] - a[0]) * (c[0] - b[0]);
                double m2 = (d[1] - b[1]) / Math.Max(1e-6, d[0] - b[0]) * (c[0] - b[0]);
                double t2 = t * t, t3 = t2 * t;
                return (2 * t3 - 3 * t2 + 1) * b[1] + (t3 - 2 * t2 + t) * m1 + (-2 * t3 + 3 * t2) * c[1] + (t3 - t2) * m2;
            }

            int Idx(double x) => Math.Min(n - 1, Math.Max(0, (int)JsMath.Round((x - x0) / step)));
            public double F(double x) => val[Idx(x)];
            public double D(double x) => der[Idx(x)];
        }

        /// <summary>A body block: side profile (top/bottom vs z), front and rear faces (z vs y) and half-width vs y.</summary>
        static Sdf Block(double[][] top, double[][] bot, double[][] front, double[][] rear, double[][] side, double kTop = 0.1, double kBot = 0.04, double kEnd = 0.25)
        {
            Profile T = new Profile(top), B = new Profile(bot), F = new Profile(front), R = new Profile(rear), S = new Profile(side);
            return (x, y, z) =>
            {
                double dx = (Math.Abs(x) - S.F(y)) / Hyp2(1, S.D(y));
                double dt = (y - T.F(z)) / Hyp2(1, T.D(z));
                double db = (B.F(z) - y) / Hyp2(1, B.D(z));
                double df = (z - F.F(y)) / Hyp2(1, F.D(y));
                double dr = (R.F(y) - z) / Hyp2(1, R.D(y));
                double d = Smax(dx, dt, kTop);
                d = Smax(d, db, kBot);
                d = Smax(d, df, kEnd);
                return Smax(d, dr, kEnd);
            };
        }

        /// <summary>A field with an optional cheap lower bound (the distance to the unrounded box) for early outs.</summary>
        sealed class Part
        {
            public Sdf F; public Sdf Bound;
            public Part(Sdf f, Sdf bound = null) { F = f; Bound = bound; }
        }

        static Part RoundBox(double cx, double cy, double cz, double hx, double hy, double hz, double r)
        {
            Sdf f = (x, y, z) =>
            {
                double qx = Math.Abs(x - cx) - hx + r, qy = Math.Abs(y - cy) - hy + r, qz = Math.Abs(z - cz) - hz + r;
                return Hyp3(Math.Max(qx, 0), Math.Max(qy, 0), Math.Max(qz, 0)) + Math.Min(Math.Max(Math.Max(qx, qy), qz), 0) - r;
            };
            Sdf b = (x, y, z) => Math.Max(Math.Max(Math.Abs(x - cx) - hx, Math.Abs(y - cy) - hy), Math.Abs(z - cz) - hz);
            return new Part(f, b);
        }

        static Part MirrorX(Part p) => new Part((x, y, z) => p.F(Math.Abs(x), y, z), p.Bound != null ? (Sdf)((x, y, z) => p.Bound(Math.Abs(x), y, z)) : null);

        static double[][] Pts(params double[] xy)
        {
            var r = new double[xy.Length / 2][];
            for (int i = 0; i < r.Length; i++) r[i] = new[] { xy[i * 2], xy[i * 2 + 1] };
            return r;
        }

        /// <summary>The body's distance field (carbuilder.js bodySDF).</summary>
        public static Sdf Body(CarSpec s)
        {
            double L2 = s.L / 2, W2 = s.W / 2, soft = s.Soft != 0 ? s.Soft : 1;
            var parts = new List<Sdf>();
            var extrasLater = new List<Part>();
            // lower body: nose -> hood -> belt line -> deck -> tail
            var top = s.Cabover
                ? Pts(L2, s.Belt - 0.1, L2 - 0.3, s.Belt, -L2, s.Belt)
                : Pts(L2, s.Nose, L2 - 0.3, s.Nose + (s.Hood - s.Nose) * 0.55, s.ZA0 + 0.12, s.Hood, s.ZA0, s.Belt, s.ZC0, s.Belt,
                      s.ZC0 - 0.12, s.Deck, -L2 + 0.22, s.Deck - 0.02, -L2, s.Tail);
            double lowFront = s.Ride + 0.1;
            parts.Add(Block(top,
                Pts(L2, lowFront + 0.08, L2 - 0.5, s.Ride, -L2 + 0.5, s.Ride, -L2, lowFront + 0.1),
                Pts(0, L2 - 0.12, lowFront + 0.15, L2, s.Nose, L2 - (s.Cabover ? 0.02 : 0.06), s.Nose + 0.4, L2 - 0.4),
                Pts(0, -L2 + 0.12, lowFront + 0.15, -L2, s.Tail + 0.2, -L2 + 0.06),
                Pts(0, W2 - 0.08, s.Ride + 0.12, W2 - 0.015, (s.Ride + s.Belt) / 2, W2, s.Belt, W2 - 0.04, s.Belt + 0.3, W2 - 0.12),
                kTop: (s.Cabover ? 0.12 : 0.13) * soft, kEnd: (s.Cabover ? 0.18 : 0.32) * soft));
            // greenhouse
            double rspan = s.ZA1 - s.ZC1;
            parts.Add(Block(
                Pts(s.ZA1 + 0.3, s.Roof - 0.06, s.ZA1, s.Roof - 0.015, s.ZC1 + rspan * 0.5, s.Roof, s.ZC1, s.Roof - 0.02, s.ZC1 - 0.3, s.Roof - 0.08),
                Pts(-L2, s.Belt - 0.25, L2, s.Belt - 0.25),
                Pts(s.Belt, s.ZA0, s.Roof, s.ZA1), Pts(s.Belt, s.ZC0, s.Roof, s.ZC1),
                Pts(s.Belt, s.Hwc, s.Roof, s.Hwc - (s.Roof - s.Belt) * s.Tumble),
                kTop: (s.Cabover ? 0.1 : 0.09) * soft, kEnd: (s.Cabover ? 0.12 : 0.05) * soft, kBot: 0.02));
            // cargo box (box trucks)
            if (s.Box != null)
            {
                double z0 = s.Box[0], z1 = s.Box[1], yt = s.Box[2];
                parts.Add(RoundBox(0, (s.Belt - 0.6 + yt) / 2, (z0 + z1) / 2, W2, (yt - (s.Belt - 0.6)) / 2, (z0 - z1) / 2, 0.1).F);
            }
            // ---- design features
            var blend = new List<Part>();
            if (s.Bulge != 0) { double z0 = s.ZA0 + 0.12, z1 = s.ZA0 + (L2 - s.ZA0) * 0.62; blend.Add(RoundBox(0, s.Hood - 0.03, (z0 + z1) / 2, W2 * 0.3, 0.03 + s.Bulge, (z1 - z0) / 2, 0.05)); }
            if (s.Scoop != 0)
            {
                double zc = s.ZA0 + 0.42;
                var sc = RoundBox(0, s.Hood + 0.05, zc, 0.24, 0.07, 0.26, 0.035); var mouth = RoundBox(0, s.Hood + 0.07, zc + 0.3, 0.19, 0.04, 0.12, 0.01);
                extrasLater.Add(new Part((x, y, z) => Smax(sc.F(x, y, z), -mouth.F(x, y, z), 0.01)));
            }
            if (s.Flare != 0) foreach (var za in new[] { s.AxF, s.AxR }) blend.Add(MirrorX(RoundBox(W2 - 0.04 + s.Flare / 2, s.Rw + 0.06, za, s.Flare / 2 + 0.05, s.Rw * 0.62, s.Rw + 0.3, 0.05)));
            if (s.Rack != 0)
            {
                double tw = s.Hwc - (s.Roof - s.Belt) * s.Tumble - 0.1, zc = (s.ZA1 + s.ZC1) / 2, hz = Math.Max(0.3, (s.ZA1 - s.ZC1) / 2 * 0.86);
                extrasLater.Add(MirrorX(RoundBox(tw, s.Roof + 0.045, zc, 0.022, 0.03, hz, 0.012)));
                if (s.Rack > 1) foreach (var k in new[] { -0.55, 0.0, 0.55 }) extrasLater.Add(RoundBox(0, s.Roof + 0.085, zc + k * hz, tw, 0.014, 0.022, 0.008));
            }
            if (s.Spare != 0)
            {
                double cy = Math.Max(s.Ride + s.Rw + 0.2, s.Tail - s.Rw - 0.05), r = s.Rw + 0.02;
                extrasLater.Add(new Part((x, y, z) => Math.Max(Hyp2(x, y - cy) - r, Math.Abs(z - (-L2 - 0.11)) - 0.1)));
            }
            if (s.Bullbar != 0)
            {
                extrasLater.Add(MirrorX(RoundBox(0.42, s.Ride + 0.3, L2 + 0.1, 0.028, 0.3, 0.028, 0.02)));
                extrasLater.Add(RoundBox(0, s.Ride + 0.58, L2 + 0.1, 0.45, 0.028, 0.028, 0.02));
                extrasLater.Add(RoundBox(0, s.Ride + 0.2, L2 + 0.06, 0.6, 0.05, 0.06, 0.02));
            }
            if (s.Steps != 0) extrasLater.Add(MirrorX(RoundBox(W2 + 0.035, s.Ride + 0.14, (s.AxF + s.AxR) / 2, 0.075, 0.022, Math.Max(0.3, (s.AxF - s.AxR) / 2 - s.Rw - 0.22), 0.01)));
            // fender humps over the wheels
            var axles = new[] { s.AxF, s.AxR };
            double fender = s.Fender != 0 ? s.Fender : 0.12;
            Sdf fenders = (x, y, z) =>
            {
                double d = 1e9;
                foreach (var za in axles) d = Math.Min(d, Hyp2(z - za, y - s.Rw) - (s.Rw + fender));
                return Smax(Smax(d, Math.Abs(x) - W2 + 0.005, 0.06), (W2 - 0.5) - Math.Abs(x), 0.06);
            };
            // side mirrors and roof equipment
            var extras = new List<Part>
            {
                MirrorX(RoundBox(s.Hwc + 0.12, s.Belt + 0.07, s.ZA0 - 0.12, 0.1, 0.06, 0.05, 0.035)),
                MirrorX(RoundBox(s.Hwc + 0.03, s.Belt + 0.04, s.ZA0 - 0.12, 0.06, 0.02, 0.025, 0.012)),
            };
            extras.AddRange(extrasLater);
            if (s.Bar == "siren") extras.Add(RoundBox(0, s.Roof + 0.07, s.Cabover ? s.ZA1 - 0.5 : (s.ZA1 + s.ZC1) / 2 + 0.25, 0.62, 0.065, 0.13, 0.05));
            if (s.Bar == "taxi") extras.Add(RoundBox(0, s.Roof + 0.1, (s.ZA1 + s.ZC1) / 2, 0.36, 0.1, 0.11, 0.04));
            if (s.Tow)
            {
                extras.Add(RoundBox(0, s.Belt + 0.55, -s.L / 2 + 0.6, 0.12, 0.6, 0.12, 0.03));
                extras.Add(RoundBox(0, s.Belt + 0.95, -s.L / 2 + 0.05, 0.08, 0.08, 0.7, 0.03));
            }
            if (s.Cabover && s.Box != null && !s.TwoTone)
            {
                extras.Add(MirrorX(RoundBox(0.55, s.Box[2] + 0.12, -1.0, 0.04, 0.05, 3.2, 0.02)));
                for (double z = -4.0; z <= 2.0; z += 0.5) extras.Add(RoundBox(0, s.Box[2] + 0.12, z, 0.55, 0.025, 0.025, 0.012));
            }
            Sdf bedCavity = null;
            if (s.Bed != null)
            {
                double zf = s.Bed[0], zr = s.Bed[1], floor = s.Bed[2];
                bedCavity = RoundBox(0, floor + 1.0, (zf + zr) / 2, W2 - 0.08, 1.0, (zf - zr) / 2, 0.03).F;
            }
            // a pinched waist: narrower at the doors than over the wheels
            double zm = (s.ZA0 + s.ZC0) / 2, wl = s.L * 0.2;
            var ex = extras.ToArray(); var bl = blend.ToArray(); var p0 = parts[0]; var p1 = parts[1]; var p2 = parts.Count > 2 ? parts[2] : null;
            return (x, y, z) =>
            {
                if (s.Waist != 0) { double q = (z - zm) / wl; x *= 1 + s.Waist * Math.Exp(-(q * q)); }
                double d = Smin(p0(x, y, z), p1(x, y, z), s.Cabover ? 0.05 : 0.04);
                if (p2 != null) d = Smin(d, p2(x, y, z), 0.04);
                foreach (var b in bl) d = Smin(d, b.F(x, y, z), 0.09);
                d = Smin(d, fenders(x, y, z), 0.14);
                foreach (var e in ex) if (e.Bound == null || e.Bound(x, y, z) < d) d = Math.Min(d, e.F(x, y, z));
                // wheel arches (only through the outer shell, so the wells stay closed)
                foreach (var za in axles)
                {
                    double arch = Smax(Hyp2(z - za, y - s.Rw) - (s.Rw + 0.075), (W2 - 0.4) - Math.Abs(x), 0.02);
                    d = Smax(d, -arch, 0.03);
                }
                if (bedCavity != null) d = Smax(d, -bedCavity(x, y, z), 0.02);
                return d;
            };
        }
    }
}
