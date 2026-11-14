// Lakes and rivers for HDRP's water: flat lakes found at their level, the rest left as river, no cell twice.
using System.Linq;
using NUnit.Framework;
using Southbound.Core;

namespace Southbound.Tests
{
    public class WaterBodiesTests
    {
        [Test]
        public void Lake_Arden_and_the_pond_are_lakes_and_the_rest_is_river()
        {
            var w = CalveraWorld.Load(CalveraWorld.DefaultFolder(TestFiles.ProjectRoot));
            var bodies = WaterBodies.Split(w);
            var lakes = bodies.Where(b => b.Lake).ToList();
            Assert.That(lakes, Is.Not.Empty);
            Assert.That(lakes[0].Level, Is.EqualTo(45).Within(0.6), "Lake Arden sits at ~45 m");
            Assert.That(lakes[0].Cells.Count, Is.GreaterThan(20000));
            Assert.That(lakes.Any(l => l.Level > 20 && l.Level < 24), "the pond at ~22 m");
            Assert.That(lakes.Count, Is.LessThan(12), "a handful of water surfaces, not hundreds");
            var river = bodies.Single(b => !b.Lake);
            Assert.That(river.Cells.Count, Is.GreaterThan(500), "the rivers down to the coast");
            var all = bodies.SelectMany(b => b.Cells).ToList();
            Assert.That(all.Distinct().Count(), Is.EqualTo(all.Count), "no cell in two bodies");
            int wet = 0;
            for (int j = 0; j < w.N - 1; j++) for (int i = 0; i < w.N - 1; i++) if (WaterBodies.Wet(w, i, j, out _)) wet++;
            Assert.That(all.Count, Is.EqualTo(wet), "every wet cell placed");
            foreach (var l in lakes)
                foreach (var (i, j) in l.Cells.Take(400))
                {
                    WaterBodies.Wet(w, i, j, out float lv);
                    Assert.That(lv, Is.EqualTo(l.Level).Within(0.6), "a lake is level");
                }
        }
    }
}
