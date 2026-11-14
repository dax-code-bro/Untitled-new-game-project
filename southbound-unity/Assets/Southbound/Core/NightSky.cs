// The night sky over Calvera: a fixed starfield (positions on the sphere, brightness by a magnitude-like
// spread, colour by star temperature) and the faint band of the Milky Way, plus the cube-map face
// mapping (DirectX convention: faces +X, -X, +Y, -Y, +Z, -Z; v measured from the bottom of the image as
// Unity's textures store it) so the editor can paint them into a cubemap for HDRP's sky.
// Also the sun and moon for a place on the Gulf Coast (latitude ~29.7 N): where they are at any hour.
using System;
using System.Collections.Generic;

namespace Southbound.Core
{
    public static class NightSky
    {
        public struct Star { public double x, y, z; public float brightness, r, g, b; }

        public static List<Star> Stars(int count, int seed)
        {
            var rnd = new Mulberry32((uint)seed);
            var list = new List<Star>(count);
            for (int i = 0; i < count; i++)
            {
                // uniform on the sphere
                double z = rnd.Next() * 2 - 1, a = rnd.Next() * Math.PI * 2, r = Math.Sqrt(1 - z * z);
                // most stars faint, a few bright (roughly the magnitude distribution)
                double m = rnd.Next();
                float bright = (float)(0.08 + 0.92 * Math.Pow(m, 7));
                // colour by temperature: blue-white .. white .. yellow .. orange
                double t = rnd.Next();
                float cr, cg, cb;
                if (t < 0.15) { cr = 0.78f; cg = 0.86f; cb = 1f; }
                else if (t < 0.6) { cr = 1f; cg = 1f; cb = 1f; }
                else if (t < 0.85) { cr = 1f; cg = 0.94f; cb = 0.8f; }
                else { cr = 1f; cg = 0.8f; cb = 0.6f; }
                list.Add(new Star { x = r * Math.Cos(a), y = z, z = r * Math.Sin(a), brightness = bright, r = cr, g = cg, b = cb });
            }
            return list;
        }

        /// <summary>The face (0..5: +X -X +Y -Y +Z -Z) and its texture coordinates (u right, v up from the bottom) for a direction.</summary>
        public static (int face, double u, double v) CubeFace(double x, double y, double z)
        {
            double ax = Math.Abs(x), ay = Math.Abs(y), az = Math.Abs(z), sc, tc, ma; int f;
            if (ax >= ay && ax >= az) { ma = ax; if (x > 0) { f = 0; sc = -z; tc = -y; } else { f = 1; sc = z; tc = -y; } }
            else if (ay >= az) { ma = ay; if (y > 0) { f = 2; sc = x; tc = z; } else { f = 3; sc = x; tc = -z; } }
            else { ma = az; if (z > 0) { f = 4; sc = x; tc = -y; } else { f = 5; sc = -x; tc = -y; } }
            double u = 0.5 * (sc / ma + 1), t = 0.5 * (tc / ma + 1);
            return (f, u, 1 - t);
        }

        /// <summary>The unit direction through a face's texel (the inverse of CubeFace).</summary>
        public static (double x, double y, double z) FaceDirection(int face, double u, double v)
        {
            double sc = 2 * u - 1, tc = 2 * (1 - v) - 1, x, y, z;
            switch (face)
            {
                case 0: x = 1; y = -tc; z = -sc; break;
                case 1: x = -1; y = -tc; z = sc; break;
                case 2: x = sc; y = 1; z = tc; break;
                case 3: x = sc; y = -1; z = -tc; break;
                case 4: x = sc; y = -tc; z = 1; break;
                default: x = -sc; y = -tc; z = -1; break;
            }
            double l = Math.Sqrt(x * x + y * y + z * z);
            return (x / l, y / l, z / l);
        }

        /// <summary>The Milky Way's glow (0..~0.6) in a direction: a soft band around a tilted great circle, brighter toward its core.</summary>
        public static double MilkyWay(double x, double y, double z)
        {
            const double nx = 0.33, ny = 0.52, nz = 0.787; // the band's pole (unit)
            double d = x * nx + y * ny + z * nz;
            double band = Math.Exp(-(d / 0.13) * (d / 0.13));
            double core = 0.55 + 0.45 * Math.Max(0, x * 0.83 + y * -0.2 + z * -0.52); // brighter toward the galactic centre
            return band * core * 0.6;
        }

        // ------------------------------------------------------------------ sun and moon
        public const double Latitude = 29.7; // degrees north (the upper Gulf Coast)

        /// <summary>The sun's elevation and azimuth (degrees; azimuth from north toward east) at an hour of a day of the year.</summary>
        public static (double elevation, double azimuth) Sun(double hour, int dayOfYear)
        {
            double decl = 23.44 * Math.Sin(2 * Math.PI * (284 + dayOfYear) / 365.0) * Math.PI / 180;
            double lat = Latitude * Math.PI / 180, ha = (hour - 12) * 15 * Math.PI / 180;
            double sinEl = Math.Sin(lat) * Math.Sin(decl) + Math.Cos(lat) * Math.Cos(decl) * Math.Cos(ha);
            double el = Math.Asin(Math.Max(-1, Math.Min(1, sinEl)));
            double cosAz = (Math.Sin(decl) - Math.Sin(el) * Math.Sin(lat)) / (Math.Cos(el) * Math.Cos(lat) + 1e-9);
            double az = Math.Acos(Math.Max(-1, Math.Min(1, cosAz)));
            if (ha > 0) az = 2 * Math.PI - az; // afternoon: the sun is in the west
            return (el * 180 / Math.PI, az * 180 / Math.PI);
        }

        /// <summary>Moon phase 0..1 (0 new, 0.5 full) on a game day, and how lit its face is (0..1).</summary>
        public static (double phase, double illumination) Moon(double day)
        {
            double phase = ((day + 7.4) / 29.53) % 1.0; if (phase < 0) phase += 1;
            return (phase, 0.5 * (1 - Math.Cos(2 * Math.PI * phase)));
        }

        /// <summary>The moon's elevation and azimuth: it trails the sun by its phase (new moon with the sun, full moon opposite).</summary>
        public static (double elevation, double azimuth) MoonPosition(double hour, int dayOfYear, double phase)
            => Sun(hour - phase * 24.0 + 24.0, dayOfYear);

        /// <summary>How dark it is (0 day .. 1 full night) from the sun's elevation: civil twilight in between.</summary>
        public static double Night(double sunElevation) => Math.Max(0, Math.Min(1, (2.0 - sunElevation) / 9.0));
    }
}
