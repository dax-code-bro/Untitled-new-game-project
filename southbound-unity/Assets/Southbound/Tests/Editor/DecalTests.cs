// Street and wall wear: the generated decal textures have the right shapes, and the decals land on
// the roads (and at the foot of every wall) in sensible numbers.
using System;
using System.Linq;
using NUnit.Framework;
using Southbound.Core;

namespace Southbound.Tests
{
    public class DecalTests
    {
        static double Alpha(Decals.DecalImage img, double u, double v) { int i = (int)(u * img.Size), j = (int)(v * img.Size); return img.Rgba[(j * img.Size + i) * 4 + 3]; }
        static double MeanAlpha(Decals.DecalImage img) { double s = 0; for (int k = 3; k < img.Rgba.Length; k += 4) s += img.Rgba[k]; return s / (img.Size * img.Size); }

        [Test]
        public void Decal_textures_have_their_shapes()
        {
            var oil = Decals.Texture(DecalKind.Oil, 128, 1);
            Assert.That(Alpha(oil, 0.5, 0.5), Is.GreaterThan(0.5), "an oil pool is dark in the middle");
            Assert.That(Alpha(oil, 0.02, 0.02), Is.LessThan(0.05), "and clear at the corners");
            var cracks = Decals.Texture(DecalKind.Cracks, 256, 2);
            Assert.That(MeanAlpha(cracks), Is.InRange(0.02, 0.35), "cracks are thin lines, not a blot");
            var grime = Decals.Texture(DecalKind.Grime, 128, 3);
            double low = 0, high = 0; for (int i = 0; i < 128; i++) { low += Alpha(grime, (i + 0.5) / 128, 0.03); high += Alpha(grime, (i + 0.5) / 128, 0.95); }
            Assert.That(low, Is.GreaterThan(high * 3), "grime is darkest at the ground");
            var skid = Decals.Texture(DecalKind.Skid, 128, 4);
            Assert.That(Alpha(skid, 0.3, 0.4), Is.GreaterThan(Alpha(skid, 0.5, 0.4) + 0.2), "two tyre streaks, clear between");
            Assert.That(oil.Rgba.All(f => f >= 0 && f <= 1), "colours in range");
            // tileable noise wraps
            Assert.That(Decals.Noise(0.3, 0.7, 5, 8), Is.EqualTo(Decals.Noise(8.3, 0.7, 5, 8)).Within(1e-9));
        }

        [Test]
        public void Decals_land_on_the_roads_and_at_the_walls()
        {
            var w = CalveraWorld.Load(CalveraWorld.DefaultFolder(TestFiles.ProjectRoot));
            var spots = Decals.Place(w);
            Assert.That(spots.Count(s => s.Kind == DecalKind.Grime), Is.EqualTo(w.Buildings.Count * 4), "every wall");
            Assert.That(spots.Count(s => s.Kind == DecalKind.Manhole), Is.GreaterThan(20), "manholes at the junctions and along the streets");
            int oil = spots.Count(s => s.Kind == DecalKind.Oil), cracks = spots.Count(s => s.Kind == DecalKind.Cracks);
            TestContext.WriteLine($"{spots.Count} decals: oil {oil}, cracks {cracks}, manholes {spots.Count(s => s.Kind == DecalKind.Manhole)}, skids {spots.Count(s => s.Kind == DecalKind.Skid)}");
            Assert.That(oil, Is.InRange(200, 20000)); Assert.That(cracks, Is.InRange(100, 20000));
            // every oil stain is on a road: within half the road's width of its centre line
            foreach (var s in spots.Where(s => s.Kind == DecalKind.Oil).Take(500))
            {
                double best = double.MaxValue, half = 0;
                foreach (var r in w.Roads)
                    for (int k = 1; k < r.Points.Count; k++)
                    {
                        var (ax, az) = r.Points[k - 1]; var (bx, bz) = r.Points[k];
                        double vx = bx - ax, vz = bz - az, l2 = vx * vx + vz * vz; if (l2 < 1e-9) continue;
                        double t = Math.Max(0, Math.Min(1, ((s.X - ax) * vx + (s.Z - az) * vz) / l2));
                        double dx = s.X - (ax + vx * t), dz = s.Z - (az + vz * t), d = Math.Sqrt(dx * dx + dz * dz);
                        if (d < best) { best = d; half = r.Width / 2; }
                    }
                Assert.That(best, Is.LessThan(half), "oil on the road");
            }
            var again = Decals.Place(w);
            Assert.That(again.Count, Is.EqualTo(spots.Count), "deterministic");
        }
    }
}
