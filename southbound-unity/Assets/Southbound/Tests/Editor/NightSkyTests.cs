// The sky's maths: where the sun and moon are over the Gulf Coast, and the starfield's cube-map mapping.
using System;
using System.Linq;
using NUnit.Framework;
using Southbound.Core;

namespace Southbound.Tests
{
    public class NightSkyTests
    {
        [Test]
        public void The_sun_rises_in_the_east_peaks_at_noon_and_sets_in_the_west()
        {
            var noon = NightSky.Sun(12, 172);
            Assert.That(noon.elevation, Is.EqualTo(90 - NightSky.Latitude + 23.44).Within(0.5), "midsummer noon, nearly overhead");
            Assert.That(NightSky.Sun(0, 172).elevation, Is.LessThan(-30), "midnight");
            var morning = NightSky.Sun(8, 172); var evening = NightSky.Sun(16, 172);
            Assert.That(morning.azimuth, Is.InRange(45, 135), "morning sun in the east");
            Assert.That(evening.azimuth, Is.InRange(225, 315), "afternoon sun in the west");
            Assert.That(morning.elevation, Is.EqualTo(evening.elevation).Within(1e-6), "symmetric about noon");
            // sunrise between 5 and 7 in summer, and the winter noon sun is lower
            double rise = Enumerable.Range(0, 24 * 60).Select(m => m / 60.0).First(h => NightSky.Sun(h, 172).elevation > 0);
            Assert.That(rise, Is.InRange(5, 7));
            Assert.That(NightSky.Sun(12, 355).elevation, Is.LessThan(noon.elevation - 40), "winter noon");
        }

        [Test]
        public void The_moon_follows_its_phase_and_night_falls_at_dusk()
        {
            Assert.That(NightSky.Moon(29.53 * 3 - 7.4).illumination, Is.LessThan(0.01), "new moon");
            Assert.That(NightSky.Moon(29.53 * 3 - 7.4 + 29.53 / 2).illumination, Is.GreaterThan(0.99), "full moon");
            // a full moon is high around midnight, a new moon is down
            double full = 0.5;
            Assert.That(NightSky.MoonPosition(0, 172, full).elevation, Is.GreaterThan(30));
            Assert.That(NightSky.MoonPosition(0, 172, 0).elevation, Is.LessThan(0));
            Assert.That(NightSky.Night(40), Is.EqualTo(0));
            Assert.That(NightSky.Night(-10), Is.EqualTo(1));
            Assert.That(NightSky.Night(-2), Is.InRange(0.3, 0.6), "twilight");
        }

        [Test]
        public void Cube_faces_map_directions_both_ways()
        {
            var rnd = new Mulberry32(5);
            for (int i = 0; i < 2000; i++)
            {
                double z = rnd.Next() * 2 - 1, a = rnd.Next() * Math.PI * 2, r = Math.Sqrt(1 - z * z);
                double x = r * Math.Cos(a), y = z, w = r * Math.Sin(a);
                var (f, u, v) = NightSky.CubeFace(x, y, w);
                Assert.That(u, Is.InRange(0, 1)); Assert.That(v, Is.InRange(0, 1));
                var d = NightSky.FaceDirection(f, u, v);
                Assert.That(d.x * x + d.y * y + d.z * w, Is.GreaterThan(1 - 1e-9), "round trip");
            }
            Assert.That(NightSky.CubeFace(1, 0, 0).face, Is.EqualTo(0));
            Assert.That(NightSky.CubeFace(0, 1, 0).face, Is.EqualTo(2));
            Assert.That(NightSky.CubeFace(0, 0, -1).face, Is.EqualTo(5));
        }

        [Test]
        public void Stars_are_mostly_faint_with_a_few_bright_ones()
        {
            var s = NightSky.Stars(9000, 1987);
            Assert.That(s.Count, Is.EqualTo(9000));
            Assert.That(s.All(t => Math.Abs(t.x * t.x + t.y * t.y + t.z * t.z - 1) < 1e-9), "on the sphere");
            Assert.That(s.Count(t => t.brightness > 0.5), Is.InRange(200, 1500), "a few hundred bright stars");
            Assert.That(s.Count(t => t.brightness < 0.2), Is.GreaterThan(4500), "most faint");
            Assert.That(NightSky.MilkyWay(0.33, 0.52, 0.787), Is.LessThan(0.01), "the band's pole is dark");
        }
    }
}
