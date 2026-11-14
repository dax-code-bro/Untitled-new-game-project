// Weather: a step at a time, eases in, roads soak in a minute and dry in minutes, puddles fill behind, storms flash.
using System;
using NUnit.Framework;
using Southbound.Core;

namespace Southbound.Tests
{
    public class WeatherTests
    {
        [Test]
        public void Weather_changes_a_step_at_a_time()
        {
            var w = new Weather(7, 0);
            int changes = 0, prev = w.Kind;
            var seen = new bool[5];
            // ten game days at a minute of game time per real second
            for (int i = 0; i < 24 * 60 * 10; i++)
            {
                w.Update(1, 1 / 60.0);
                if (w.Kind != prev) { Assert.That(Math.Abs(w.Kind - prev), Is.LessThanOrEqualTo(1), "no storm out of a clear sky"); changes++; prev = w.Kind; }
                seen[w.Kind] = true;
            }
            TestContext.WriteLine($"{changes} changes in ten days");
            Assert.That(changes, Is.InRange(10, 80));
            Assert.That(seen[0] && seen[1] && seen[2], "clear, cloudy and overcast all come round");
        }

        [Test]
        public void Rain_soaks_the_roads_and_they_dry()
        {
            var w = new Weather(3, 1);
            w.Set(3);
            double t = 0;
            while (w.Wet < 0.99 && t < 600) { w.Update(1, 0, auto: false); t++; }
            TestContext.WriteLine($"soaked after {t} s (rain eases in over ~40 s)");
            Assert.That(t, Is.InRange(60, 240), "wet through within a few minutes of rain starting");
            for (int i = 0; i < 300; i++) w.Update(1, 0, auto: false);
            Assert.That(w.Puddles, Is.GreaterThan(0.9), "puddles fill once it's soaked");
            w.Set(0);
            t = 0;
            while (w.Wet > 0.01 && t < 3600) { w.Update(1, 0, auto: false); t++; }
            Assert.That(t, Is.InRange(300, 700), "dries over several minutes");
            Assert.That(w.Puddles, Is.GreaterThan(w.Wet), "puddles outlast the wet surface");
            Assert.That(w.Rain, Is.LessThan(0.01)); Assert.That(w.Cover, Is.EqualTo(0.3).Within(0.01));
        }

        [Test]
        public void Storms_throw_lightning()
        {
            var w = new Weather(9, 4); w.Snap();
            int strikes = 0;
            for (int i = 0; i < 6000; i++) { w.Update(0.1, 0, auto: false); if (w.Thunder) { strikes++; Assert.That(w.Flash, Is.EqualTo(1)); } }
            Assert.That(strikes, Is.InRange(30, 120), "about one strike every 8 s");
            var calm = new Weather(9, 0); calm.Snap();
            for (int i = 0; i < 6000; i++) { calm.Update(0.1, 0, auto: false); Assert.That(calm.Thunder, Is.False); }
        }
    }
}

namespace Southbound.Tests
{
    public class PuddleTests
    {
        [Test]
        public void Puddles_gather_on_the_roads()
        {
            var w = CalveraWorld.Load(CalveraWorld.DefaultFolder(TestFiles.ProjectRoot));
            var spots = Puddles.Place(w);
            TestContext.WriteLine($"{spots.Count} puddles");
            Assert.That(spots.Count, Is.InRange(500, 12000));
            foreach (var s in spots)
            {
                double best = double.MaxValue, half = 0;
                foreach (var r in w.Roads)
                    for (int k = 1; k < r.Points.Count; k++)
                    {
                        var (ax, az) = r.Points[k - 1]; var (bx, bz) = r.Points[k];
                        double vx = bx - ax, vz = bz - az, l2 = vx * vx + vz * vz; if (l2 < 1e-9) continue;
                        double t = Math.Max(0, Math.Min(1, ((s.X - ax) * vx + (s.Z - az) * vz) / l2));
                        double dx = s.X - (ax + vx * t), dz = s.Z - (az + vz * t), d = Math.Sqrt(dx * dx + dz * dz);
                        if (d - r.Width / 2 < best - half) { best = d; half = r.Width / 2; }
                    }
                Assert.That(best, Is.LessThan(half), "on the road");
            }
            var m = Puddles.Mask(64, 1);
            Assert.That(m[32 * 64 + 32], Is.EqualTo(1).Within(1e-6), "wet in the middle");
            Assert.That(m[0], Is.EqualTo(0), "dry at the corner");
            Assert.That(Puddles.Place(w).Count, Is.EqualTo(spots.Count), "deterministic");
        }
    }
}
