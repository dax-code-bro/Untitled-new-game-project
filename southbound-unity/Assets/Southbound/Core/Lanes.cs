// The lanes Calvera's traffic drives: down every road both ways, keeping right (the middle of the right-hand
// travel lane: clear of the parking lane on the 16 m city streets), at a speed by road kind, each lane's end
// linked to the lanes that carry on from that junction (never straight back the way it came). Web space.
using System;
using System.Collections.Generic;

namespace Southbound.Core
{
    public static class Lanes
    {
        public sealed class Lane
        {
            public readonly List<(double x, double z)> Points = new List<(double, double)>();
            public double Length, Speed;
            public int Road; public bool Forward;
            public readonly List<int> Next = new List<int>();
        }

        /// <summary>How far right of the centre line the lane runs.</summary>
        public static double Offset(CalveraWorld.Road r) => r.Kind == "highway" ? r.Width * 0.25 : r.Width >= 15 ? 2.65 : r.Width * 0.25;
        public static double SpeedFor(CalveraWorld.Road r) => r.Kind == "highway" ? 24 : r.Kind == "dirt" || r.Kind == "track" ? 9 : r.Width >= 15 ? 12 : 14;

        public static List<Lane> Build(CalveraWorld w, double linkRadius = 14)
        {
            var lanes = new List<Lane>();
            for (int ri = 0; ri < w.Roads.Count; ri++)
            {
                var r = w.Roads[ri];
                if (r.Points.Count < 2) continue;
                foreach (bool fwd in new[] { true, false })
                {
                    var src = new List<(double x, double z)>(r.Points);
                    if (!fwd) src.Reverse();
                    var lane = new Lane { Road = ri, Forward = fwd, Speed = SpeedFor(r) };
                    double off = Offset(r);
                    for (int k = 0; k < src.Count; k++)
                    {
                        var p0 = src[Math.Max(0, k - 1)]; var p1 = src[Math.Min(src.Count - 1, k + 1)];
                        double dx = p1.x - p0.x, dz = p1.z - p0.z, l = Math.Sqrt(dx * dx + dz * dz);
                        if (l < 1e-9) continue;
                        // right of the way you're going: (-dz, dx)
                        double x = src[k].x - dz / l * off, z = src[k].z + dx / l * off;
                        if (lane.Points.Count > 0) { var q = lane.Points[lane.Points.Count - 1]; lane.Length += Math.Sqrt((x - q.x) * (x - q.x) + (z - q.z) * (z - q.z)); }
                        lane.Points.Add((x, z));
                    }
                    if (lane.Points.Count >= 2 && lane.Length > 5) lanes.Add(lane);
                }
            }
            // what carries on from each lane's end: lanes starting near it, not the same road turned round
            for (int i = 0; i < lanes.Count; i++)
            {
                var a = lanes[i]; var end = a.Points[a.Points.Count - 1];
                for (int j = 0; j < lanes.Count; j++)
                {
                    if (i == j) continue;
                    var b = lanes[j];
                    if (b.Road == a.Road && b.Forward != a.Forward) continue;
                    var st = b.Points[0];
                    if ((st.x - end.x) * (st.x - end.x) + (st.z - end.z) * (st.z - end.z) < linkRadius * linkRadius) a.Next.Add(j);
                }
            }
            return lanes;
        }

        /// <summary>The point `s` metres along a lane and its heading (unit x, z).</summary>
        public static (double x, double z, double dx, double dz) At(Lane l, double s)
        {
            s = Math.Max(0, Math.Min(l.Length, s));
            double acc = 0;
            for (int k = 1; k < l.Points.Count; k++)
            {
                var a = l.Points[k - 1]; var b = l.Points[k];
                double dx = b.x - a.x, dz = b.z - a.z, len = Math.Sqrt(dx * dx + dz * dz);
                if (len < 1e-9) continue;
                if (acc + len >= s || k == l.Points.Count - 1) { double f = Math.Max(0, Math.Min(1, (s - acc) / len)); return (a.x + dx * f, a.z + dz * f, dx / len, dz / len); }
                acc += len;
            }
            var e = l.Points[l.Points.Count - 1];
            return (e.x, e.z, 1, 0);
        }
    }
}
