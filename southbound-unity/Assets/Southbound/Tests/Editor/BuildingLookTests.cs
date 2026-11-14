// Building cladding: every style gets a mix of real walls, painted ones carry the web colour, picks are stable.
using System.Collections.Generic;
using System.Linq;
using NUnit.Framework;
using Southbound.Core;

namespace Southbound.Tests
{
    public class BuildingLookTests
    {
        [Test]
        public void Each_style_gets_a_mix_of_walls_and_painted_walls_take_the_web_colour()
        {
            var w = CalveraWorld.Load(CalveraWorld.DefaultFolder(TestFiles.ProjectRoot));
            var picks = w.Buildings.Select((b, i) => (b, c: BuildingLook.For(b.Style, b.Color, i))).ToList();
            foreach (var style in new[] { 1, 2, 3, 4, 5 })
                Assert.That(picks.Where(p => p.b.Style == style).Select(p => p.c.Wall).Distinct().Count(), Is.GreaterThanOrEqualTo(3), $"style {style} has several wall kinds");
            foreach (var (b, c) in picks)
            {
                Assert.That(MaterialLibrary.Get(c.Wall), Is.Not.Null, c.Wall + " is in the library");
                Assert.That(MaterialLibrary.Get(c.Top), Is.Not.Null, c.Top + " is in the library");
                Assert.That(new[] { c.R, c.G, c.B }.All(v => v >= 0 && v <= 1), "tint in range");
                Assert.That(BuildingLook.For(b.Style, b.Color, picks.IndexOf((b, c))).Key, Is.EqualTo(c.Key), "deterministic");
            }
            // a painted house is its web colour: a pale green house stays greener than it is red
            var green = picks.First(p => p.c.Painted && p.b.Color == 0x9fb6a7);
            Assert.That(green.c.G, Is.GreaterThan(green.c.R));
            // natural walls stay close to the photo
            Assert.That(picks.Where(p => !p.c.Painted).All(p => p.c.R > 0.7 && p.c.G > 0.7 && p.c.B > 0.7));
            int materials = picks.Select(p => p.c.Key).Distinct().Count();
            TestContext.WriteLine($"{picks.Count} buildings, {materials} wall materials");
            Assert.That(materials, Is.InRange(20, 200), "variety without a material per building");
            var roofs = Enumerable.Range(0, 400).Select(BuildingLook.Roof).ToList();
            Assert.That(roofs.Distinct().Count(), Is.EqualTo(4));
            Assert.That(roofs.Count(r => r == "RoofingTiles001"), Is.GreaterThan(roofs.Count(r => r == "RoofingTiles008")), "shingles most common");
        }
    }
}
