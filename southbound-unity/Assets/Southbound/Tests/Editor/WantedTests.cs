// The law: the web game's star rules, cooling off when out of sight, arrests only for low heat; and the
// cruisers' routes over the lane graph.
using System;
using System.Linq;
using NUnit.Framework;
using Southbound.Core;

namespace Southbound.Tests
{
    public class WantedTests
    {
        [Test]
        public void Crimes_raise_the_stars_as_in_the_web_game()
        {
            var w = new Wanted();
            w.Crime("shots"); Assert.That(w.Stars, Is.EqualTo(1)); Assert.That(w.HeatLevel, Is.EqualTo(2));
            Assert.That(w.Lethal(false), Is.False, "shots alone: officers try to arrest you");
            w.Crime("kill"); Assert.That(w.Stars, Is.EqualTo(1)); Assert.That(w.Lethal(false), "a killing: they shoot");
            w.Crime("kill"); w.Crime("kill"); Assert.That(w.Stars, Is.EqualTo(2), "every third kill another star");
            w.Crime("copKill"); Assert.That(w.Stars, Is.EqualTo(4), "an officer down: at least three, and heat 4 makes it four");
            for (int i = 0; i < 20; i++) w.Crime("kill");
            Assert.That(w.Stars, Is.EqualTo(5)); Assert.That(w.HeatLevel, Is.EqualTo(5));
            Assert.That(Wanted.CarsPerStar[w.Stars], Is.EqualTo(6));
            var c = new Wanted(); c.Crime("carjack", nearPolice: false); Assert.That(c.Stars, Is.EqualTo(0), "a carjacking nobody saw");
            c.Crime("carjack", nearPolice: true); Assert.That(c.Stars, Is.EqualTo(1));
        }

        [Test]
        public void Stars_cool_off_out_of_sight()
        {
            var w = new Wanted(); w.Crime("kill"); w.Crime("kill"); w.Crime("kill");   // two stars
            int escapedWith = -1; w.Escaped += (max, kills) => escapedWith = max;
            for (int i = 0; i < 100; i++) w.Update(0.1, seen: true);
            Assert.That(w.Stars, Is.EqualTo(2), "while they can see you, nothing cools");
            double t = 0;
            while (w.Stars > 0 && t < 120) { w.Update(0.1, seen: false); t += 0.1; }
            Assert.That(w.Stars, Is.EqualTo(0)); Assert.That(escapedWith, Is.EqualTo(2));
            Assert.That(t, Is.InRange(16 + 12 - 4.5 - 1, 16 + 12 + 1), "8 + 4 per star for the first, a head start for the next");
            Assert.That(w.HeatLevel, Is.EqualTo(0), "a clean slate");
        }

        [Test]
        public void Only_low_heat_ends_in_an_arrest()
        {
            var w = new Wanted(); w.Crime("assault");
            Assert.That(w.CanArrest(true, false, 0.5, 2.0));
            Assert.That(w.CanArrest(false, false, 0.5, 2.0), Is.False, "not in a car");
            Assert.That(w.CanArrest(true, true, 0.5, 2.0), Is.False, "not with a gun out");
            Assert.That(w.CanArrest(true, false, 3, 2.0), Is.False, "not running");
            w.Crime("kill");
            Assert.That(w.CanArrest(true, false, 0.5, 2.0), Is.False, "after a killing they shoot instead");
        }

        [Test]
        public void Cruisers_find_their_way_over_the_lanes()
        {
            var w = CalveraWorld.Load(CalveraWorld.DefaultFolder(TestFiles.ProjectRoot));
            var lanes = Lanes.Build(w);
            var ns = new int[lanes.Count + 1]; var nx = lanes.SelectMany(l => l.Next).ToArray(); var len = lanes.Select(l => (float)l.Length).ToArray();
            for (int i = 0; i < lanes.Count; i++) ns[i + 1] = ns[i] + lanes[i].Next.Count;
            int found = 0, tried = 0;
            var rnd = new Random(3);
            for (int k = 0; k < 40; k++)
            {
                int a = rnd.Next(lanes.Count), b = rnd.Next(lanes.Count);
                var r = LaneRoute.Find(ns, nx, len, a, b);
                tried++;
                if (r.Count == 0) continue;
                found++;
                Assert.That(r[0], Is.EqualTo(a)); Assert.That(r[r.Count - 1], Is.EqualTo(b));
                for (int i = 1; i < r.Count; i++) Assert.That(lanes[r[i - 1]].Next, Does.Contain(r[i]), "each step carries on through a junction");
            }
            TestContext.WriteLine($"{found} of {tried} random lane pairs connect");
            Assert.That(found, Is.GreaterThan(tried / 2), "the road network mostly hangs together");
            Assert.That(LaneRoute.Find(ns, nx, len, 5, 5), Is.EqualTo(new[] { 5 }));
        }
    }
}
