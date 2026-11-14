// Calvera's weather, as the web game runs it (world/weather.js): clear, cloudy, overcast, rain, storm.
// The weather changes every 3-8 game hours and only a step at a time (no storm out of a clear sky), eases
// toward the new state over ~40 s, roads soak through in a minute of rain and take several minutes to dry,
// puddles fill behind the wetness, and storms throw lightning.
using System;
using System.Collections.Generic;

namespace Southbound.Core
{
    public sealed class Weather
    {
        public struct State { public string Name; public double Cover, Rain, Dark, Fog, W; }

        public static readonly State[] Order =
        {
            new State { Name = "clear", Cover = 0.3, Rain = 0, Dark = 0, Fog = 1.0, W = 35 },
            new State { Name = "cloudy", Cover = 0.56, Rain = 0, Dark = 0.1, Fog = 1.0, W = 30 },
            new State { Name = "overcast", Cover = 0.82, Rain = 0, Dark = 0.45, Fog = 1.4, W = 12 },
            new State { Name = "rain", Cover = 0.88, Rain = 0.65, Dark = 0.6, Fog = 2.0, W = 15 },
            new State { Name = "storm", Cover = 0.97, Rain = 1.0, Dark = 0.75, Fog = 2.6, W = 8 },
        };

        readonly Mulberry32 rnd;
        public int Kind { get; private set; } = 1;
        public int Upcoming { get; private set; } = -1;
        /// <summary>Game hours until the weather turns.</summary>
        public double NextChange;
        /// <summary>The eased values the world shows: cloud cover, rain (0..1), how dark the light is, fog thickness (x).</summary>
        public double Cover, Rain, Dark, Fog = 1;
        /// <summary>How wet the roads are (0..1) and how full the puddles (they fill after the surface is soaked).</summary>
        public double Wet, Puddles;
        /// <summary>A lightning flash (1 at the strike, fading in a quarter second); Thunder is true on the frame of a strike.</summary>
        public double Flash;
        public bool Thunder;

        public string Name => Order[Kind].Name;

        public Weather(uint seed = 2026, int start = 1)
        {
            rnd = new Mulberry32(seed);
            Kind = start;
            var s = Order[start];
            Cover = s.Cover; Rain = s.Rain; Dark = s.Dark; Fog = s.Fog;
            NextChange = 3 + rnd.Next() * 4;
        }

        /// <summary>The next weather after `from`: itself or a neighbour, weighted (clear and cloudy are common, storms rare).</summary>
        public int Roll(int from)
        {
            int lo = Math.Max(0, from - 1), hi = Math.Min(Order.Length - 1, from + 1);
            double total = 0; for (int j = lo; j <= hi; j++) total += Order[j].W;
            double t = rnd.Next() * total;
            for (int j = lo; j <= hi; j++) if ((t -= Order[j].W) <= 0) return j;
            return lo;
        }

        public void Set(int kind) { Kind = Math.Max(0, Math.Min(Order.Length - 1, kind)); Upcoming = -1; }

        /// <summary>Jump straight to the target (loading a save, a test): wet roads if it's raining.</summary>
        public void Snap()
        {
            var s = Order[Kind];
            Cover = s.Cover; Rain = s.Rain; Dark = s.Dark; Fog = s.Fog;
            Wet = s.Rain > 0 ? 0.9 : 0; Puddles = s.Rain > 0 ? 0.8 : 0;
        }

        /// <summary>Advance by dt real seconds, during which `gameHours` passed on the game clock.</summary>
        public void Update(double dt, double gameHours, bool auto = true)
        {
            if (auto)
            {
                NextChange -= gameHours;
                if (Upcoming < 0) Upcoming = Roll(Kind);
                if (NextChange <= 0)
                {
                    NextChange = 3 + rnd.Next() * 5;
                    Kind = Upcoming;
                    Upcoming = Roll(Kind);
                }
            }
            var t = Order[Kind];
            double k = Math.Min(1, dt / 40);
            Cover += (t.Cover - Cover) * k; Rain += (t.Rain - Rain) * k; Dark += (t.Dark - Dark) * k; Fog += (t.Fog - Fog) * k;
            // roads soak in a minute of rain and take several to dry
            Wet = Math.Max(0, Math.Min(1, Wet + (Rain > 0.05 ? dt / 60 : -dt / 400)));
            // puddles gather once the ground is soaked, and dry off slower still
            Puddles = Math.Max(0, Math.Min(1, Puddles + (Rain > 0.05 && Wet > 0.6 ? dt / 120 : -dt / 900)));
            Flash = Math.Max(0, Flash - dt * 4);
            Thunder = false;
            if (Kind == 4 && rnd.Next() < dt * 0.12) { Flash = 1; Thunder = true; }
        }
    }
}

namespace Southbound.Core
{
    /// <summary>Where rain gathers on Calvera's roads: in the dips along each road (lower than the road either side)
    /// and in the gutters along the kerbs, plus the odd hollow in the lane. Web space, metres.</summary>
    public static class Puddles
    {
        public struct Spot { public double X, Z, Heading, Width, Length; }

        public static List<Spot> Place(CalveraWorld w, int seed = 404)
        {
            var spots = new List<Spot>();
            var rnd = new Mulberry32((uint)seed);
            foreach (var r in w.Roads)
            {
                var pts = r.Points;
                if (pts.Count < 2) continue;
                double half = r.Width / 2;
                // walk the road every 4 m: height along the centre line, and the way it runs
                var samples = new List<(double x, double z, double h, double hx, double hz)>();
                for (int k = 1; k < pts.Count; k++)
                {
                    var (ax, az) = pts[k - 1]; var (bx, bz) = pts[k];
                    double dx = bx - ax, dz = bz - az, l = Math.Sqrt(dx * dx + dz * dz);
                    if (l < 1e-6) continue;
                    int n = Math.Max(1, (int)(l / 4));
                    for (int s = 0; s < n; s++) { double f = (s + 0.5) / n, x = ax + dx * f, z = az + dz * f; samples.Add((x, z, w.HeightAt(x, z), dx / l, dz / l)); }
                }
                for (int i = 0; i < samples.Count; i++)
                {
                    var c = samples[i];
                    double heading = Math.Atan2(c.hx, c.hz);
                    // a dip: lower than the road 8 m either way
                    bool dip = i >= 2 && i < samples.Count - 2 && c.h < samples[i - 2].h - 0.03 && c.h < samples[i + 2].h - 0.03;
                    if (dip)
                    {
                        spots.Add(new Spot { X = c.x, Z = c.z, Heading = heading + (rnd.Next() - 0.5) * 0.6, Width = Math.Min(r.Width * 0.8, 2.5 + rnd.Next() * 3), Length = 3 + rnd.Next() * 4 });
                        continue;
                    }
                    // the gutters: water runs to the kerb and sits there in long thin pools
                    if (rnd.Next() < 0.22)
                    {
                        double side = rnd.Next() < 0.5 ? -1 : 1, off = half - 0.45 - rnd.Next() * 0.3;
                        spots.Add(new Spot { X = c.x + c.hz * off * side, Z = c.z - c.hx * off * side, Heading = heading, Width = 0.6 + rnd.Next() * 0.6, Length = 2 + rnd.Next() * 4 });
                    }
                    else if (rnd.Next() < 0.04)
                    {
                        // a worn hollow in a wheel track
                        double side = rnd.Next() < 0.5 ? -1 : 1, off = half * (0.25 + rnd.Next() * 0.3);
                        spots.Add(new Spot { X = c.x + c.hz * off * side, Z = c.z - c.hx * off * side, Heading = rnd.Next() * Math.PI, Width = 0.8 + rnd.Next() * 1.2, Length = 1 + rnd.Next() * 1.5 });
                    }
                }
            }
            return spots;
        }

        /// <summary>A puddle's shape: alpha (0..1, ragged edges, a few dry islands), row 0 at the bottom.</summary>
        public static float[] Mask(int size, int seed)
        {
            var a = new float[size * size];
            for (int j = 0; j < size; j++)
                for (int i = 0; i < size; i++)
                {
                    double u = (i + 0.5) / size * 2 - 1, v = (j + 0.5) / size * 2 - 1;
                    double r = Math.Sqrt(u * u + v * v);
                    double n = Decals.Fbm((i + 0.5) / size * 6, (j + 0.5) / size * 6, seed, 4);
                    double edge = 0.62 + (n - 0.5) * 0.7;          // a ragged rim
                    double k = (edge - r) / 0.08;
                    a[j * size + i] = (float)Math.Max(0, Math.Min(1, k));
                }
            return a;
        }
    }
}
