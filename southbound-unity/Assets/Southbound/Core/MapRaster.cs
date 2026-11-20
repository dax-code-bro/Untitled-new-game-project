// The map of Calvera for the HUD's minimap (and a full map later), drawn from the world data: the land
// hill-shaded by its heights, the sea, lakes and rivers, every road at its width (highways warmer, a dark
// edge so they read on light ground), and the buildings' footprints. Laid out the way a Unity texture is:
// row 0 is the south edge (Unity z = -Half), column 0 the west edge (Unity x = -Half; the web game's x is
// mirrored, see CalveraWorld.ToUnity).
using System;

namespace Southbound.Core
{
    public static class MapRaster
    {
        public static readonly byte[] Sea = { 22, 46, 66 }, Lake = { 30, 62, 86 }, Road = { 168, 172, 176 }, Highway = { 208, 186, 134 }, Edge = { 24, 26, 28 }, House = { 80, 84, 92 };

        /// <summary>RGBA, px by px, covering the whole world (Size metres a side).</summary>
        public static byte[] Render(CalveraWorld w, int px)
        {
            var rgba = new byte[px * px * 4];
            double m = w.Size / px;   // metres per pixel
            // the ground: hill-shaded, greener low, paler and drier up high
            for (int v = 0; v < px; v++)
                for (int u = 0; u < px; u++)
                {
                    var (wx, wz) = Web(w, px, u + 0.5, v + 0.5);
                    double h = w.HeightAt(wx, wz);
                    int o = (v * px + u) * 4;
                    rgba[o + 3] = 255;
                    if (h < w.SeaLevel) { Put(rgba, o, Sea, 1 - Math.Min(0.35, (w.SeaLevel - h) / 60)); continue; }
                    int i = (int)Math.Floor((wx + w.Half) / w.Cell), j = (int)Math.Floor((wz + w.Half) / w.Cell);
                    if (i >= 0 && j >= 0 && i < w.N - 1 && j < w.N - 1 && WaterBodies.Wet(w, i, j, out float level) && level > h - 0.05) { Put(rgba, o, Lake, 1); continue; }
                    // light from the north-west, like a printed relief map
                    double e = Math.Max(m, w.Cell);
                    double dx = (w.HeightAt(wx + e, wz) - w.HeightAt(wx - e, wz)) / (2 * e);
                    double dz = (w.HeightAt(wx, wz + e) - w.HeightAt(wx, wz - e)) / (2 * e);
                    // the surface normal in Unity space (x mirrored: d/dUnityX = -d/dWebX), lit from the north-west (-x, +z)
                    double nx = dx, nz = -dz, ny = 1, len = Math.Sqrt(nx * nx + ny * ny + nz * nz);
                    double lx = -0.55, ly = 0.7, lz = 0.45, ll = Math.Sqrt(lx * lx + ly * ly + lz * lz);
                    double shade = Math.Max(0, (nx * lx + ny * ly + nz * lz) / (len * ll));
                    double t = JsMath.Clamp((h - w.SeaLevel) / 140.0, 0, 1);
                    double r = Lerp(44, 92, t), g = Lerp(60, 90, t), b = Lerp(42, 70, t);
                    double k = 0.55 + 0.6 * shade;
                    rgba[o] = B(r * k); rgba[o + 1] = B(g * k); rgba[o + 2] = B(b * k);
                }
            // buildings
            foreach (var bd in w.Buildings)
            {
                var (cu, cv) = Pixel(w, px, bd.X, bd.Z);
                double hw = bd.W / 2 / m, hd = bd.D / 2 / m;
                for (int v = (int)Math.Floor(cv - hd); v <= (int)Math.Ceiling(cv + hd); v++)
                    for (int u = (int)Math.Floor(cu - hw); u <= (int)Math.Ceiling(cu + hw); u++)
                    {
                        if (u < 0 || v < 0 || u >= px || v >= px) continue;
                        double cover = Overlap(u, u + 1, cu - hw, cu + hw) * Overlap(v, v + 1, cv - hd, cv + hd);
                        if (cover > 0) Blend(rgba, (v * px + u) * 4, House, cover);
                    }
            }
            // roads: a dark edge first (all of them), then the asphalt on top, so junctions stay clean
            for (int pass = 0; pass < 2; pass++)
                foreach (var rd in w.Roads)
                {
                    var col = pass == 0 ? Edge : rd.Kind == "highway" ? Highway : Road;
                    double half = Math.Max(rd.Width / 2 / m, 0.7) + (pass == 0 ? 0.9 : 0);
                    for (int s = 0; s + 1 < rd.Points.Count; s++)
                    {
                        var (au, av) = Pixel(w, px, rd.Points[s].x, rd.Points[s].z);
                        var (bu, bv) = Pixel(w, px, rd.Points[s + 1].x, rd.Points[s + 1].z);
                        Segment(rgba, px, au, av, bu, bv, half, col);
                    }
                }
            return rgba;
        }

        /// <summary>Web-game coordinates of a pixel centre (u right = Unity +x = web -x, v up = z).</summary>
        public static (double x, double z) Web(CalveraWorld w, int px, double u, double v)
        {
            double ux = -w.Half + u / px * w.Size, uz = -w.Half + v / px * w.Size;
            return (-ux, uz);
        }

        /// <summary>Pixel coordinates (continuous) of a web-game point.</summary>
        public static (double u, double v) Pixel(CalveraWorld w, int px, double webX, double webZ)
        {
            var (ux, uz) = CalveraWorld.ToUnity(webX, webZ);
            return ((ux + w.Half) / w.Size * px, (uz + w.Half) / w.Size * px);
        }

        static void Segment(byte[] rgba, int px, double au, double av, double bu, double bv, double half, byte[] col)
        {
            int u0 = Math.Max(0, (int)Math.Floor(Math.Min(au, bu) - half - 1)), u1 = Math.Min(px - 1, (int)Math.Ceiling(Math.Max(au, bu) + half + 1));
            int v0 = Math.Max(0, (int)Math.Floor(Math.Min(av, bv) - half - 1)), v1 = Math.Min(px - 1, (int)Math.Ceiling(Math.Max(av, bv) + half + 1));
            double ex = bu - au, ey = bv - av, l2 = ex * ex + ey * ey;
            for (int v = v0; v <= v1; v++)
                for (int u = u0; u <= u1; u++)
                {
                    double qx = u + 0.5 - au, qy = v + 0.5 - av;
                    double t = l2 > 0 ? JsMath.Clamp((qx * ex + qy * ey) / l2, 0, 1) : 0;
                    double dx = qx - t * ex, dy = qy - t * ey, d = Math.Sqrt(dx * dx + dy * dy);
                    double cover = JsMath.Clamp(half + 0.5 - d, 0, 1);   // a pixel-wide soft edge
                    if (cover > 0) Blend(rgba, (v * px + u) * 4, col, cover);
                }
        }

        static double Overlap(double a0, double a1, double b0, double b1) => Math.Max(0, Math.Min(a1, b1) - Math.Max(a0, b0));
        static double Lerp(double a, double b, double t) => a + (b - a) * t;
        static byte B(double x) => (byte)Math.Round(JsMath.Clamp(x, 0, 255));
        static void Put(byte[] o, int i, byte[] c, double k) { o[i] = B(c[0] * k); o[i + 1] = B(c[1] * k); o[i + 2] = B(c[2] * k); }
        static void Blend(byte[] o, int i, byte[] c, double a)
        {
            if (a >= 1) { o[i] = c[0]; o[i + 1] = c[1]; o[i + 2] = c[2]; return; }
            for (int k = 0; k < 3; k++) o[i + k] = B(o[i + k] + (c[k] - o[i + k]) * a);
        }
    }
}
