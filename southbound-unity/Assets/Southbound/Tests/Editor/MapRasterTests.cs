// The HUD map: the right size, roads where the roads are (mirrored into Unity space), water blue, land green.
using System;
using System.Linq;
using NUnit.Framework;
using Southbound.Core;

namespace Southbound.Tests
{
    public class MapRasterTests
    {
        const int Px = 1024;
        static CalveraWorld world;
        static byte[] map;

        [OneTimeSetUp]
        public void Draw()
        {
            world = CalveraWorld.Load(CalveraWorld.DefaultFolder(TestFiles.ProjectRoot));
            map = MapRaster.Render(world, Px);
        }

        static (int r, int g, int b) At(double u, double v) { int o = ((int)v * Px + (int)u) * 4; return (map[o], map[o + 1], map[o + 2]); }
        static bool Near((int r, int g, int b) c, byte[] want, int tol = 12) => Math.Abs(c.r - want[0]) <= tol && Math.Abs(c.g - want[1]) <= tol && Math.Abs(c.b - want[2]) <= tol;

        [Test]
        public void Covers_the_world_opaque()
        {
            Assert.That(map.Length, Is.EqualTo(Px * Px * 4));
            for (int k = 3; k < map.Length; k += 4) if (map[k] != 255) Assert.Fail($"pixel {k / 4} not opaque");
        }

        [Test]
        public void Roads_are_drawn_where_they_run_mirrored_into_Unity_space()
        {
            int hits = 0, tried = 0;
            foreach (var r in world.Roads.Where(r => r.Width / (world.Size / Px) >= 2))   // wide enough to have a solid middle at this size
                for (int s = 0; s + 1 < r.Points.Count; s += 3)
                {
                    var (ax, az) = r.Points[s]; var (bx, bz) = r.Points[s + 1];
                    var (u, v) = MapRaster.Pixel(world, Px, (ax + bx) / 2, (az + bz) / 2);
                    if (u < 1 || v < 1 || u >= Px - 1 || v >= Px - 1) continue;
                    tried++;
                    if (Near(At(u, v), r.Kind == "highway" ? MapRaster.Highway : MapRaster.Road, 30)) hits++;
                }
            Assert.That(tried, Is.GreaterThan(50));
            Assert.That(hits / (double)tried, Is.GreaterThan(0.9), $"{hits} of {tried} road midpoints are road-coloured");
            // the mirror: a road point east in the web game (x > 0) is in the left (west) half in Unity
            var p = world.Roads.SelectMany(r => r.Points).First(q => q.x > 400);
            Assert.That(MapRaster.Pixel(world, Px, p.x, p.z).u, Is.LessThan(Px / 2));
            var (wx, wz) = MapRaster.Web(world, Px, MapRaster.Pixel(world, Px, p.x, p.z).u, MapRaster.Pixel(world, Px, p.x, p.z).v);
            Assert.That(wx, Is.EqualTo(p.x).Within(1e-6)); Assert.That(wz, Is.EqualTo(p.z).Within(1e-6));
        }

        [Test]
        public void Sea_is_blue_and_land_is_green()
        {
            int sea = 0, seaBlue = 0, land = 0, landGreen = 0;
            for (int v = 0; v < Px; v += 37)
                for (int u = 0; u < Px; u += 37)
                {
                    var (wx, wz) = MapRaster.Web(world, Px, u + 0.5, v + 0.5);
                    double h = world.HeightAt(wx, wz);
                    var c = At(u, v);
                    if (h < world.SeaLevel - 1) { sea++; if (c.b > c.r + 15) seaBlue++; }
                    else if (h > world.SeaLevel + 3) { land++; if (c.g >= c.r && c.g >= c.b) landGreen++; }
                }
            Assert.That(sea, Is.GreaterThan(20)); Assert.That(land, Is.GreaterThan(20));
            Assert.That(seaBlue, Is.EqualTo(sea), "the sea is blue");
            Assert.That(landGreen / (double)land, Is.GreaterThan(0.8), $"{landGreen} of {land} land samples are green (roads and roofs are the rest)");
        }
    }
}
