// Where Calvera's streets get reflection probes: box-projected boxes that fill each street canyon in the
// built-up parts of town, one over every junction and one every ~50 m between, at about eye height, so
// windows, wet asphalt and puddles reflect the street they're in rather than the open sky (screen-space
// reflections only see what's on screen). Web space; Heading is the road's direction.
using System;
using System.Collections.Generic;

namespace Southbound.Core
{
    public static class ReflectionSpots
    {
        public struct Spot { public double X, Y, Z, Heading, Across, Along, Height; public bool Junction; }

        public static List<Spot> Place(CalveraWorld w, double builtUpRadius = 45, double spacing = 50)
        {
            var spots = new List<Spot>();
            bool BuiltUp(double x, double z)
            {
                foreach (var b in w.Buildings)
                {
                    double dx = Math.Max(Math.Abs(x - b.X) - b.W / 2, 0), dz = Math.Max(Math.Abs(z - b.Z) - b.D / 2, 0);
                    if (dx * dx + dz * dz < builtUpRadius * builtUpRadius) return true;
                }
                return false;
            }
            bool Near(double x, double z, double r)
            {
                foreach (var s in spots) if ((s.X - x) * (s.X - x) + (s.Z - z) * (s.Z - z) < r * r) return true;
                return false;
            }
            foreach (var (jx, jz) in RoadNetwork.Junctions(w))
                if (BuiltUp(jx, jz)) spots.Add(new Spot { X = jx, Z = jz, Y = w.HeightAt(jx, jz) + 2.5, Heading = 0, Across = 34, Along = 34, Height = 26, Junction = true });
            foreach (var r in w.Roads)
            {
                double along = 0, next = spacing / 2;
                for (int k = 1; k < r.Points.Count; k++)
                {
                    var (ax, az) = r.Points[k - 1]; var (bx, bz) = r.Points[k];
                    double dx = bx - ax, dz = bz - az, l = Math.Sqrt(dx * dx + dz * dz);
                    if (l < 1e-6) continue;
                    while (next <= along + l)
                    {
                        double f = (next - along) / l, x = ax + dx * f, z = az + dz * f;
                        if (BuiltUp(x, z) && !Near(x, z, spacing * 0.6))
                            spots.Add(new Spot { X = x, Z = z, Y = w.HeightAt(x, z) + 2.5, Heading = Math.Atan2(dx, dz), Across = r.Width + 18, Along = spacing + 6, Height = 26 });
                        next += spacing;
                    }
                    along += l;
                }
            }
            return spots;
        }
    }
}
