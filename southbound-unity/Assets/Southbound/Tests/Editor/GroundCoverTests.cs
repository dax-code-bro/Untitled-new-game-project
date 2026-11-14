// Grass: tufts are thin leaning strands of the right size; it grows on open ground and never on roads,
// building footprints or water.
using System;
using System.Linq;
using NUnit.Framework;
using Southbound.Core;

namespace Southbound.Tests
{
    public class GroundCoverTests
    {
        [Test]
        public void A_tuft_is_thin_leaning_strands()
        {
            var t = GroundCover.Tuft(20, 0.12, 0.4, 3);
            Assert.That(t.Indices.Count / 3, Is.EqualTo(20 * 5), "two quads and a point per blade");
            Assert.That(t.Vertices, Is.EqualTo(20 * 7));
            for (int i = 0; i < t.Vertices; i++)
            {
                float x = t.Positions[i * 3], y = t.Positions[i * 3 + 1], z = t.Positions[i * 3 + 2];
                Assert.That(y, Is.InRange(-1e-6, 0.4 * 1.21));
                Assert.That(Math.Sqrt(x * x + z * z), Is.LessThan(0.12 + 0.6 * 0.4 * 1.2), "within the patch plus the lean");
                Assert.That(t.Normals[i * 3 + 1], Is.GreaterThan(0.7), "lit from above like grass");
                Assert.That(t.Uvs[i * 2], Is.InRange(0, 1)); Assert.That(t.Uvs[i * 2 + 1], Is.InRange(0, 1));
            }
            // blades are thin: the two root vertices of each blade are under a centimetre apart
            for (int b = 0; b < 20; b++)
            {
                int o = b * 7 * 3;
                double dx = t.Positions[o] - t.Positions[o + 3], dz = t.Positions[o + 2] - t.Positions[o + 5];
                Assert.That(Math.Sqrt(dx * dx + dz * dz), Is.LessThan(0.011));
            }
            Assert.That(t.Indices.All(i => i >= 0 && i < t.Vertices));
        }

        [Test]
        public void Grass_grows_on_open_ground_only()
        {
            var w = CalveraWorld.Load(CalveraWorld.DefaultFolder(TestFiles.ProjectRoot));
            // an all-grass splat: what's left bare is down to the roads, buildings, water and rock
            var plan = GroundCover.Place(w, 1024, (x, z) => (0f, 0f, 0f, 0f));
            double cs = plan.CellSize;
            long green = plan.Green.Sum(v => (long)v), verge = plan.Verge.Sum(v => (long)v);
            TestContext.WriteLine($"{green} green tufts, {verge} on the verges, over {plan.Res}^2 cells of {cs} m");
            Assert.That(green, Is.GreaterThan(1_000_000));
            Assert.That(plan.Dry.All(v => v == 0), "no dry grass where the splat has none");
            Assert.That(plan.Green.Max(), Is.LessThanOrEqualTo(12));
            (int i, int j) Cell(double x, double z) => ((int)Math.Floor((x + w.Half) / cs), (int)Math.Floor((z + w.Half) / cs));
            // nothing on a road
            foreach (var r in w.Roads)
                for (int k = 0; k < r.Points.Count; k += 3)
                {
                    var (i, j) = Cell(r.Points[k].x, r.Points[k].z);
                    if (i < 0 || j < 0 || i >= plan.Res || j >= plan.Res) continue;
                    Assert.That(plan.Green[j * plan.Res + i] + plan.Verge[j * plan.Res + i], Is.EqualTo(0), "grass on a road");
                }
            // nothing inside a building
            foreach (var b in w.Buildings)
            {
                var (i, j) = Cell(b.X, b.Z);
                Assert.That(plan.Green[j * plan.Res + i] + plan.Verge[j * plan.Res + i], Is.EqualTo(0), "grass inside a building");
            }
            // nothing under water (sample the sea far out and lake cells)
            int wet = 0;
            for (int j = 0; j < plan.Res; j += 7)
                for (int i = 0; i < plan.Res; i += 7)
                {
                    double x = -w.Half + (i + 0.5) * cs, z = -w.Half + (j + 0.5) * cs;
                    int hi = (int)Math.Round((x + w.Half) / w.Cell), hj = (int)Math.Round((z + w.Half) / w.Cell);
                    float wl = w.Water[Math.Min(w.N - 1, hj) * w.N + Math.Min(w.N - 1, hi)];
                    if (!float.IsNaN(wl) && wl > w.HeightAt(x, z) + 0.3) { wet++; Assert.That(plan.Green[j * plan.Res + i], Is.EqualTo(0), "grass under water"); }
                }
            Assert.That(wet, Is.GreaterThan(100), "the test did look at water");
            // the dry-grass layer follows the splat
            var dry = GroundCover.Place(w, 256, (x, z) => (0f, 0f, 1f, 0f));
            Assert.That(dry.Green.Sum(v => (long)v), Is.EqualTo(0)); Assert.That(dry.Dry.Sum(v => (long)v), Is.GreaterThan(1000));
        }
    }
}
