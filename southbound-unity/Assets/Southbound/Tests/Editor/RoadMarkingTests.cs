// Road paint: lines on every road, inside the road's width, sitting just above the asphalt, facing up,
// broken at the junctions where the crosswalks are.
using System;
using System.Linq;
using NUnit.Framework;
using Southbound.Core;

namespace Southbound.Tests
{
    public class RoadMarkingTests
    {
        [Test]
        public void Roads_get_their_paint()
        {
            var w = CalveraWorld.Load(CalveraWorld.DefaultFolder(TestFiles.ProjectRoot));
            var m = RoadMarkings.Build(w, w.HeightAt);
            int verts = m.Positions.Count / 3;
            TestContext.WriteLine($"{m.Quads} marking quads ({m.White.Count / 6} white, {m.Yellow.Count / 6} yellow), {m.Crosswalks} crosswalks, {verts} vertices");
            Assert.That(m.Yellow.Count / 6, Is.GreaterThan(10000), "yellow centre lines along the ~25 km of road");
            Assert.That(m.White.Count / 6, Is.GreaterThan(10000), "white edge and parking lines");
            Assert.That(m.Crosswalks, Is.GreaterThan(40), "a crosswalk on the approaches to the junctions");
            Assert.That(m.Uvs.Count / 2, Is.EqualTo(verts));

            // every triangle faces up (web space, right-handed: (b-a) x (c-a) has +y)
            foreach (var list in new[] { m.White, m.Yellow })
                for (int i = 0; i < list.Count; i += 3)
                {
                    int a = list[i] * 3, b = list[i + 1] * 3, c = list[i + 2] * 3;
                    double ux = m.Positions[b] - m.Positions[a], uz = m.Positions[b + 2] - m.Positions[a + 2];
                    double vx = m.Positions[c] - m.Positions[a], vz = m.Positions[c + 2] - m.Positions[a + 2];
                    Assert.That(uz * vx - ux * vz, Is.GreaterThan(0), "paint faces the sky");
                }

            // sampled vertices: on a road (within its half width) and 1-3 cm above the asphalt
            var junctions = RoadNetwork.Junctions(w);
            int off = 0;
            for (int i = 0; i < verts; i += 37)
            {
                double x = m.Positions[i * 3], y = m.Positions[i * 3 + 1], z = m.Positions[i * 3 + 2];
                double best = double.MaxValue, half = 0;
                foreach (var r in w.Roads)
                    for (int k = 1; k < r.Points.Count; k++)
                    {
                        var (ax, az) = r.Points[k - 1]; var (bx, bz) = r.Points[k];
                        double vx = bx - ax, vz = bz - az, l2 = vx * vx + vz * vz; if (l2 < 1e-9) continue;
                        double t = Math.Max(0, Math.Min(1, ((x - ax) * vx + (z - az) * vz) / l2));
                        double dx = x - (ax + vx * t), dz = z - (az + vz * t), d = Math.Sqrt(dx * dx + dz * dz);
                        if (d - r.Width / 2 < best - half) { best = d; half = r.Width / 2; }
                    }
                Assert.That(best, Is.LessThanOrEqualTo(half + 0.01), "paint stays on the road");
                if (Math.Abs(y - (w.HeightAt(x, z) + 0.075)) > 0.25) off++;
            }
            Assert.That(off, Is.LessThan(verts / 37 / 50), "paint follows the road surface (under 2% off by more than 25 cm)");

            // centre lines stop short of the junctions (the narrowest road's radius is 5 + 2 m)
            for (int i = 0; i < m.Yellow.Count; i += 6)
            {
                double cx = 0, cz = 0;
                for (int k = 0; k < 6; k++) { cx += m.Positions[m.Yellow[i + k] * 3] / 6; cz += m.Positions[m.Yellow[i + k] * 3 + 2] / 6; }
                foreach (var j in junctions)
                    Assert.That((j.x - cx) * (j.x - cx) + (j.z - cz) * (j.z - cz), Is.GreaterThan(6.5 * 6.5), "no centre line through a junction");
            }

            // heights are all real numbers
            Assert.That(m.Positions.Where((v, i) => i % 3 == 1).All(y => !double.IsNaN(y)), "no NaN heights");

            var again = RoadMarkings.Build(w, w.HeightAt);
            Assert.That(again.Positions.SequenceEqual(m.Positions), "deterministic");
        }

        [Test]
        public void Paint_is_worn_but_mostly_there()
        {
            var img = RoadMarkings.PaintTexture(256, 5);
            double sum = 0; int holes = 0;
            for (int k = 3; k < img.Rgba.Length; k += 4) { sum += img.Rgba[k]; if (img.Rgba[k] < 0.5) holes++; }
            double coverage = sum / (256 * 256);
            TestContext.WriteLine($"paint coverage {coverage:P1}, worn texels {holes}");
            Assert.That(coverage, Is.InRange(0.78, 0.94), "most of the paint is left");
            Assert.That(holes, Is.GreaterThan(256 * 256 / 25), "but it is visibly worn");
            Assert.That(img.Rgba.All(f => f >= 0 && f <= 1) && img.Smoothness.All(f => f >= 0 && f <= 1));
            // tileable: the first and last columns and rows match their neighbours across the seam
            double seam = 0, inner = 0;
            for (int j = 0; j < 256; j++)
            {
                seam += Math.Abs(img.Rgba[(j * 256 + 255) * 4 + 3] - img.Rgba[(j * 256) * 4 + 3]);
                inner += Math.Abs(img.Rgba[(j * 256 + 128) * 4 + 3] - img.Rgba[(j * 256 + 127) * 4 + 3]);
            }
            Assert.That(seam, Is.LessThan(inner * 3 + 2), "no seam where the tile repeats");
        }
    }
}
