// The paint on Calvera's roads, as real geometry a centimetre and a half above the asphalt (the web
// game paints it into its road textures; roads.js): the same layout per road type.
//  - highways (12 m): white edge lines and a double yellow centre line
//  - city streets (16 m): double yellow, a parking lane along each kerb behind a white line, a tick
//    between stalls every 8 m
//  - other streets (10-12 m): a dashed yellow centre line and white edge lines
//  - junctions: lines stop short of the crossing, with a zebra crosswalk and a stop bar on every
//    approach (traffic keeps right)
// Positions are the web game's world (x, y, z); heights follow the road ribbon exactly as the scene
// builds it (its edges sampled from the terrain, +6 cm), plus 1.5 cm.
using System;
using System.Collections.Generic;

namespace Southbound.Core
{
    public static class RoadNetwork
    {
        /// <summary>Junctions: places where two roads' points come within 6 m (one per 20 m).</summary>
        public static List<(double x, double z)> Junctions(CalveraWorld w)
        {
            var grid = new Dictionary<(int, int), List<(int road, double x, double z)>>();
            for (int ri = 0; ri < w.Roads.Count; ri++)
                foreach (var p in w.Roads[ri].Points)
                {
                    var key = ((int)Math.Floor(p.x / 8), (int)Math.Floor(p.z / 8));
                    if (!grid.TryGetValue(key, out var l)) grid[key] = l = new List<(int, double, double)>();
                    l.Add((ri, p.x, p.z));
                }
            var junctions = new List<(double x, double z)>();
            foreach (var cell in grid)
                foreach (var a in cell.Value)
                {
                    bool near = false;
                    for (int dx = -1; dx <= 1 && !near; dx++)
                        for (int dz = -1; dz <= 1 && !near; dz++)
                            if (grid.TryGetValue((cell.Key.Item1 + dx, cell.Key.Item2 + dz), out var l2))
                                foreach (var b in l2) if (b.road != a.road && (a.x - b.x) * (a.x - b.x) + (a.z - b.z) * (a.z - b.z) < 36) { near = true; break; }
                    if (!near) continue;
                    bool dup = false;
                    foreach (var j in junctions) if ((j.x - a.x) * (j.x - a.x) + (j.z - a.z) * (j.z - a.z) < 400) { dup = true; break; }
                    if (!dup) junctions.Add((a.x, a.z));
                }
            return junctions;
        }
    }

    public sealed class MarkingMesh
    {
        /// <summary>x, y, z per vertex (web world).</summary>
        public readonly List<double> Positions = new List<double>();
        /// <summary>Per vertex: u = metres across from the road's centre line / 2, v = metres along it / 2 (a 2 m paint tile).</summary>
        public readonly List<double> Uvs = new List<double>();
        /// <summary>Triangles of white paint and of yellow paint (counter-clockwise from above, web space).</summary>
        public readonly List<int> White = new List<int>(), Yellow = new List<int>();
        public int Quads => (White.Count + Yellow.Count) / 6;
        /// <summary>How many zebra crosswalks were painted.</summary>
        public int Crosswalks;
    }

    public static class RoadMarkings
    {
        const double Lift = 0.06 + 0.015;
        struct Line { public double Offset, Width, Period, On; public bool Yellow; }

        static List<Line> Layout(CalveraWorld.Road r)
        {
            var L = new List<Line>();
            double w = r.Width;
            if (r.Kind == "highway")
            {
                L.Add(new Line { Offset = -w / 2 + w * 0.045, Width = w * 0.02 });
                L.Add(new Line { Offset = w / 2 - w * 0.045, Width = w * 0.02 });
                L.Add(new Line { Offset = -w * 0.006, Width = w * 0.012, Yellow = true });
                L.Add(new Line { Offset = w * 0.012, Width = w * 0.012, Yellow = true });
            }
            else if (w >= 15)
            {
                L.Add(new Line { Offset = -0.16, Width = 0.12, Yellow = true });
                L.Add(new Line { Offset = 0.16, Width = 0.12, Yellow = true });
                L.Add(new Line { Offset = -5.2, Width = 0.12 });
                L.Add(new Line { Offset = 5.2, Width = 0.12 });
            }
            else
            {
                L.Add(new Line { Offset = 0, Width = w * 0.012, Yellow = true, Period = 9, On = 3 });
                L.Add(new Line { Offset = -w / 2 + w * 0.066, Width = w * 0.012 });
                L.Add(new Line { Offset = w / 2 - w * 0.066, Width = w * 0.012 });
            }
            return L;
        }

        /// <summary>Worn road paint for a 2 m x 2 m tile (tileable): alpha is where paint is left (worn patches and
        /// fine chips show the asphalt through), colour a slightly dirty white to tint, smoothness of the beaded paint.</summary>
        public static Decals.DecalImage PaintTexture(int size, int seed, double coverage = 0.86)
        {
            var img = new Decals.DecalImage { Size = size, Rgba = new float[size * size * 4], Smoothness = new float[size * size] };
            // threshold so that about `coverage` of the tile keeps its paint (Fbm is roughly 0.5 +- 0.15)
            double cut = 0.5 - 0.15 * 1.6 * (coverage - 0.5) * 2;
            for (int j = 0; j < size; j++)
                for (int i = 0; i < size; i++)
                {
                    double x = (i + 0.5) / size, y = (j + 0.5) / size;
                    double patches = Decals.Fbm(x * 8, y * 8, seed, 5, 8);                // 25 cm worn patches
                    double chips = Decals.Noise(x * 160, y * 160, seed + 101, 160);       // 1 cm chips
                    double v = patches + (chips - 0.5) * 0.12;
                    double a = Math.Max(0, Math.Min(1, (v - cut) / 0.025));
                    double dirt = Decals.Fbm(x * 4, y * 4, seed + 7, 4, 4);                // grime ground into it
                    float c = (float)(0.80 + 0.2 * (1 - dirt) - 0.08 * (1 - a));
                    int k = (j * size + i) * 4;
                    img.Rgba[k] = c; img.Rgba[k + 1] = c; img.Rgba[k + 2] = c * 0.985f; img.Rgba[k + 3] = (float)a;
                    img.Smoothness[j * size + i] = (float)(0.32 + 0.16 * patches);
                }
            return img;
        }

        /// <summary>The marking mesh for every road; `terrain(x, z)` is the ground height the road ribbon sits on.</summary>
        public static MarkingMesh Build(CalveraWorld w, Func<double, double, double> terrain)
        {
            var mesh = new MarkingMesh();
            var junctions = RoadNetwork.Junctions(w);
            foreach (var r in w.Roads) Road(r, terrain, junctions, mesh);
            return mesh;
        }

        static void Road(CalveraWorld.Road r, Func<double, double, double> terrain, List<(double x, double z)> junctions, MarkingMesh mesh)
        {
            var pts = r.Points;
            int n = pts.Count;
            if (n < 2) return;
            double half = r.Width / 2, radius = half + 2;
            // the ribbon's edge heights at each point (as the scene builder makes it: side from prev->next)
            var hl = new double[n]; var hr = new double[n];
            var sx = new double[n]; var sz = new double[n];
            for (int k = 0; k < n; k++)
            {
                var p0 = pts[Math.Max(0, k - 1)]; var p1 = pts[Math.Min(n - 1, k + 1)];
                double dx = p1.x - p0.x, dz = p1.z - p0.z, l = Math.Sqrt(dx * dx + dz * dz);
                if (l < 1e-9) { dx = 0; dz = 1; l = 1; }
                // perpendicular (web space): the mirror into Unity turns "left" into "right" but the ribbon is symmetric
                sx[k] = dz / l; sz[k] = -dx / l;
                hl[k] = terrain(pts[k].x - sx[k] * half, pts[k].z - sz[k] * half);
                hr[k] = terrain(pts[k].x + sx[k] * half, pts[k].z + sz[k] * half);
            }
            bool InJunction(double x, double z)
            {
                foreach (var j in junctions) if ((j.x - x) * (j.x - x) + (j.z - z) * (j.z - z) < radius * radius) return true;
                return false;
            }
            // height of a point on segment k at fraction f along it, `o` metres across from the centre line: on
            // the ribbon's own two triangles (its diagonal runs from the -side at k to the +side at k+1)
            double Height(int k, double f, double o)
            {
                double t = Math.Max(0, Math.Min(1, (o + half) / r.Width));
                double h = t >= f
                    ? hl[k] + (hr[k] - hl[k]) * (t - f) + (hr[k + 1] - hl[k]) * f
                    : hl[k] + (hr[k + 1] - hl[k]) * t + (hl[k + 1] - hl[k]) * (f - t);
                return h + Lift;
            }
            void Quad(int k, double f0, double f1, double o0, double o1, double dAt, bool yellow)
            {
                var a = pts[k]; var b = pts[k + 1];
                double dx = b.x - a.x, dz = b.z - a.z, l = Math.Sqrt(dx * dx + dz * dz);
                double px = dz / l, pz = -dx / l;
                int baseIdx = mesh.Positions.Count / 3;
                foreach (var (f, o) in new[] { (f0, o0), (f0, o1), (f1, o1), (f1, o0) })
                {
                    double x = a.x + dx * f + px * o, z = a.z + dz * f + pz * o;
                    mesh.Positions.Add(x); mesh.Positions.Add(Height(k, f, o)); mesh.Positions.Add(z);
                    mesh.Uvs.Add(o / 2); mesh.Uvs.Add((dAt + (f - f0) * l) / 2);
                }
                // counter-clockwise seen from above (+y) in web space: (0,1,2), (0,2,3) when o1 > o0 points to +perp
                var list = yellow ? mesh.Yellow : mesh.White;
                list.Add(baseIdx); list.Add(baseIdx + 2); list.Add(baseIdx + 1);
                list.Add(baseIdx); list.Add(baseIdx + 3); list.Add(baseIdx + 2);
            }

            var lines = Layout(r);
            // the road as 1 m pieces, each marked in or out of a junction
            var pieces = new List<(int k, double f0, double f1, double d0, double d1, bool inJ)>();
            double cum = 0;
            for (int k = 0; k < n - 1; k++)
            {
                var a = pts[k]; var b = pts[k + 1];
                double dx = b.x - a.x, dz = b.z - a.z, segLen = Math.Sqrt(dx * dx + dz * dz);
                if (segLen < 1e-6) continue;
                int steps = Math.Max(1, (int)Math.Ceiling(segLen / 1.0));
                for (int st = 0; st < steps; st++)
                {
                    double f0 = st / (double)steps, f1 = (st + 1) / (double)steps, fm = (f0 + f1) / 2;
                    pieces.Add((k, f0, f1, cum + f0 * segLen, cum + f1 * segLen, InJunction(a.x + dx * fm, a.z + dz * fm)));
                }
                cum += segLen;
            }
            if (pieces.Count == 0) return;
            // crosswalk bands (distance along the road) just outside each junction, and the stop bar before
            // each, across the lane that drives into the junction (traffic keeps right: the -o side heading +d)
            var bands = new List<(double d0, double d1)>();
            var bars = new List<(double d0, double d1, double o0, double o1)>();
            bool paintCrossings = r.Kind != "highway";
            for (int i = 1; i < pieces.Count && paintCrossings; i++)
            {
                if (pieces[i].inJ == pieces[i - 1].inJ) continue;
                double at = pieces[i].d0;
                if (pieces[i].inJ)
                {   // entering
                    bands.Add((at - 3.0, at - 0.4));
                    bars.Add((at - 4.0, at - 3.55, -half * 0.9, -0.35));
                }
                else
                {   // leaving
                    bands.Add((at + 0.4, at + 3.0));
                    bars.Add((at + 3.55, at + 4.0, 0.35, half * 0.9));
                }
            }
            mesh.Crosswalks += bands.Count;
            bool InBand(double d) { foreach (var bd in bands) if (d >= bd.d0 && d < bd.d1) return true; return false; }
            bool InBar(double d) { foreach (var bd in bars) if (d >= bd.d0 - 0.1 && d < bd.d1 + 0.1) return true; return false; }

            foreach (var pc in pieces)
            {
                if (pc.inJ) continue;
                double segLen = (pc.d1 - pc.d0) / (pc.f1 - pc.f0);
                double F(double d) => pc.f0 + (d - pc.d0) / segLen;
                // zebra stripes: 8 bars along the road, across its width
                foreach (var bd in bands)
                {
                    double s0 = Math.Max(pc.d0, bd.d0), s1 = Math.Min(pc.d1, bd.d1);
                    if (s1 - s0 < 1e-4) continue;
                    for (int s = 0; s < 8; s++)
                    {
                        double o = -half * 0.85 + (s + 0.5) * (r.Width * 0.85 / 8);
                        Quad(pc.k, F(s0), F(s1), o - 0.3, o + 0.3, s0, false);
                    }
                }
                foreach (var br in bars)
                {
                    double s0 = Math.Max(pc.d0, br.d0), s1 = Math.Min(pc.d1, br.d1);
                    if (s1 - s0 < 1e-4) continue;
                    Quad(pc.k, F(s0), F(s1), br.o0, br.o1, s0, false);
                }
                // the lines, except where the crosswalk and stop bar are; dashes by distance along the road
                double dm = (pc.d0 + pc.d1) / 2;
                if (InBand(dm)) continue;
                bool bar = InBar(dm);
                foreach (var ln in lines)
                {
                    if (ln.Period > 0 && (dm % ln.Period) >= ln.On) continue;
                    if (bar && ln.Yellow) continue;
                    Quad(pc.k, pc.f0, pc.f1, ln.Offset - ln.Width / 2, ln.Offset + ln.Width / 2, pc.d0, ln.Yellow);
                }
                // parking stall ticks on the city streets: every 8 m, from the parking line toward the kerb
                if (r.Kind != "highway" && r.Width >= 15 && Math.Floor(pc.d1 / 8) > Math.Floor(pc.d0 / 8) && !bar)
                {
                    double ft = F(Math.Floor(pc.d1 / 8) * 8), tf = 0.1 / segLen;
                    ft = Math.Min(ft, 1 - tf);
                    if (ft >= 0)
                    {
                        double dt = pc.d0 + (ft - pc.f0) * segLen;
                        Quad(pc.k, ft, ft + tf, 5.2, 5.9, dt, false);
                        Quad(pc.k, ft, ft + tf, -5.9, -5.2, dt, false);
                    }
                }
            }
        }
    }
}
