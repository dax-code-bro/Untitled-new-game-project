// Where Calvera's townspeople walk: a line down each side of every town street, on the pavement 2 m out
// from the kerb, wherever the street runs through a built-up part of town. Web space; each path is a
// polyline the pedestrians follow (crossing at the junctions where two meet, as people do).
using System;
using System.Collections.Generic;

namespace Southbound.Core
{
    public static class Sidewalks
    {
        public sealed class Path
        {
            public readonly List<(double x, double z)> Points = new List<(double, double)>();
            public double Length;
        }

        public static List<Path> Paths(CalveraWorld w, double builtUpRadius = 40, double kerbOut = 2.0)
        {
            var paths = new List<Path>();
            bool BuiltUp(double x, double z)
            {
                foreach (var b in w.Buildings)
                {
                    double dx = Math.Max(Math.Abs(x - b.X) - b.W / 2, 0), dz = Math.Max(Math.Abs(z - b.Z) - b.D / 2, 0);
                    if (dx * dx + dz * dz < builtUpRadius * builtUpRadius) return true;
                }
                return false;
            }
            bool InBuilding(double x, double z)
            {
                foreach (var b in w.Buildings) if (Math.Abs(x - b.X) < b.W / 2 + 0.3 && Math.Abs(z - b.Z) < b.D / 2 + 0.3) return true;
                return false;
            }
            foreach (var r in w.Roads)
            {
                if (r.Kind == "highway" || r.Kind == "dirt" || r.Kind == "track" || r.Points.Count < 2) continue;
                double off = r.Width / 2 + kerbOut;
                foreach (int side in new[] { -1, 1 })
                {
                    Path cur = null;
                    void Close() { if (cur != null && cur.Points.Count >= 2 && cur.Length >= 20) paths.Add(cur); cur = null; }
                    var pts = r.Points;
                    for (int k = 0; k < pts.Count; k++)
                    {
                        var p0 = pts[Math.Max(0, k - 1)]; var p1 = pts[Math.Min(pts.Count - 1, k + 1)];
                        double dx = p1.x - p0.x, dz = p1.z - p0.z, l = Math.Sqrt(dx * dx + dz * dz);
                        if (l < 1e-9) continue;
                        double x = pts[k].x + dz / l * off * side, z = pts[k].z - dx / l * off * side;
                        if (!BuiltUp(x, z) || InBuilding(x, z)) { Close(); continue; }
                        if (cur == null) cur = new Path();
                        if (cur.Points.Count > 0) { var q = cur.Points[cur.Points.Count - 1]; cur.Length += Math.Sqrt((x - q.x) * (x - q.x) + (z - q.z) * (z - q.z)); }
                        cur.Points.Add((x, z));
                    }
                    Close();
                }
            }
            return paths;
        }

        /// <summary>The point `s` metres along a path, and the way it runs there (unit x, z).</summary>
        public static (double x, double z, double dx, double dz) At(Path p, double s)
        {
            s = Math.Max(0, Math.Min(p.Length, s));
            double acc = 0;
            for (int k = 1; k < p.Points.Count; k++)
            {
                var a = p.Points[k - 1]; var b = p.Points[k];
                double dx = b.x - a.x, dz = b.z - a.z, l = Math.Sqrt(dx * dx + dz * dz);
                if (l < 1e-9) continue;
                if (acc + l >= s || k == p.Points.Count - 1)
                {
                    double f = Math.Max(0, Math.Min(1, (s - acc) / l));
                    return (a.x + dx * f, a.z + dz * f, dx / l, dz / l);
                }
                acc += l;
            }
            var e = p.Points[p.Points.Count - 1];
            return (e.x, e.z, 1, 0);
        }
    }
}
