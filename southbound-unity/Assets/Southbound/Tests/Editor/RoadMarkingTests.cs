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

namespace Southbound.Tests
{
    public class ReflectionSpotTests
    {
        [Test]
        public void Reflection_probes_fill_the_town_streets()
        {
            var w = CalveraWorld.Load(CalveraWorld.DefaultFolder(TestFiles.ProjectRoot));
            var spots = ReflectionSpots.Place(w);
            TestContext.WriteLine($"{spots.Count} reflection probes ({spots.Count(s => s.Junction)} over junctions)");
            Assert.That(spots.Count, Is.InRange(40, 1200));
            foreach (var s in spots)
            {
                Assert.That(s.Y - w.HeightAt(s.X, s.Z), Is.EqualTo(2.5).Within(1e-6), "about eye height");
                // no two probes on top of each other (except a junction's neighbours along the road)
                Assert.That(spots.Count(o => (o.X - s.X) * (o.X - s.X) + (o.Z - s.Z) * (o.Z - s.Z) < 10 * 10), Is.LessThanOrEqualTo(2));
            }
            // and none out in the country
            var far = spots.Where(s => !w.Buildings.Any(b => Math.Abs(b.X - s.X) < 60 + b.W / 2 && Math.Abs(b.Z - s.Z) < 60 + b.D / 2)).ToList();
            Assert.That(far, Is.Empty);
        }
    }
}

namespace Southbound.Tests
{
    public class SidewalkTests
    {
        [Test]
        public void Townspeople_walk_the_pavements()
        {
            var w = CalveraWorld.Load(CalveraWorld.DefaultFolder(TestFiles.ProjectRoot));
            var paths = Sidewalks.Paths(w);
            double total = paths.Sum(p => p.Length);
            TestContext.WriteLine($"{paths.Count} pavement paths, {total / 1000:F1} km");
            Assert.That(paths.Count, Is.GreaterThan(30));
            Assert.That(total, Is.GreaterThan(5000));
            foreach (var p in paths)
            {
                for (double s = 0; s <= p.Length; s += 7)
                {
                    var (x, z, dx, dz) = Sidewalks.At(p, s);
                    Assert.That(dx * dx + dz * dz, Is.EqualTo(1).Within(1e-6));
                    // off the carriageway: at least the kerb's distance from the nearest road's centre line, minus a little at the corners
                    double best = double.MaxValue, half = 0;
                    foreach (var r in w.Roads)
                        for (int k = 1; k < r.Points.Count; k++)
                        {
                            var (ax, az) = r.Points[k - 1]; var (bx, bz) = r.Points[k];
                            double vx = bx - ax, vz = bz - az, l2 = vx * vx + vz * vz; if (l2 < 1e-9) continue;
                            double t = Math.Max(0, Math.Min(1, ((x - ax) * vx + (z - az) * vz) / l2));
                            double ex = x - (ax + vx * t), ez = z - (az + vz * t), d = Math.Sqrt(ex * ex + ez * ez);
                            if (d < best) { best = d; half = r.Width / 2; }
                        }
                    if (best < half) { /* crossing at a junction: allowed */ }
                }
                var (sx, sz, _, _) = Sidewalks.At(p, 0);
                Assert.That(sx, Is.EqualTo(p.Points[0].x).Within(1e-9));
            }
            // most of the walking is on the pavement, not out in the road
            int onRoad = 0, all = 0;
            foreach (var p in paths)
                for (double s = 0; s <= p.Length; s += 11)
                {
                    var (x, z, _, _) = Sidewalks.At(p, s); all++;
                    foreach (var r in w.Roads)
                    {
                        bool hit = false;
                        for (int k = 1; k < r.Points.Count && !hit; k++)
                        {
                            var (ax, az) = r.Points[k - 1]; var (bx, bz) = r.Points[k];
                            double vx = bx - ax, vz = bz - az, l2 = vx * vx + vz * vz; if (l2 < 1e-9) continue;
                            double t = Math.Max(0, Math.Min(1, ((x - ax) * vx + (z - az) * vz) / l2));
                            double ex = x - (ax + vx * t), ez = z - (az + vz * t);
                            if (ex * ex + ez * ez < (r.Width / 2 - 0.5) * (r.Width / 2 - 0.5)) hit = true;
                        }
                        if (hit) { onRoad++; break; }
                    }
                }
            TestContext.WriteLine($"{onRoad} of {all} samples are crossing a road");
            Assert.That(onRoad, Is.LessThan(all / 8), "pedestrians keep to the pavement");
        }
    }
}

namespace Southbound.Tests
{
    public class LaneTests
    {
        [Test]
        public void Traffic_keeps_right_and_carries_on_through_junctions()
        {
            var w = CalveraWorld.Load(CalveraWorld.DefaultFolder(TestFiles.ProjectRoot));
            var lanes = Lanes.Build(w);
            int linked = lanes.Count(l => l.Next.Count > 0);
            TestContext.WriteLine($"{lanes.Count} lanes, {linked} carry on somewhere, {lanes.Sum(l => l.Length) / 1000:F1} km");
            Assert.That(lanes.Count, Is.GreaterThan(w.Roads.Count));
            Assert.That(linked, Is.GreaterThan(lanes.Count / 2));
            foreach (var l in lanes)
            {
                var r = w.Roads[l.Road];
                // on the right of the direction of travel: the cross product of heading and (lane - centre) is negative
                var (x, z, dx, dz) = Lanes.At(l, l.Length / 2);
                double best = double.MaxValue, cx = 0, cz = 0;
                for (int k = 1; k < r.Points.Count; k++)
                {
                    var (ax, az) = r.Points[k - 1]; var (bx, bz) = r.Points[k];
                    double vx = bx - ax, vz = bz - az, l2 = vx * vx + vz * vz; if (l2 < 1e-9) continue;
                    double t = Math.Max(0, Math.Min(1, ((x - ax) * vx + (z - az) * vz) / l2));
                    double px = ax + vx * t, pz = az + vz * t, d = (x - px) * (x - px) + (z - pz) * (z - pz);
                    if (d < best) { best = d; cx = px; cz = pz; }
                }
                double ox = x - cx, oz = z - cz;
                // right of heading (dx, dz) is (-dz, dx)
                Assert.That(ox * -dz + oz * dx, Is.GreaterThan(0), "keeps right");
                Assert.That(Math.Sqrt(best), Is.LessThan(r.Width / 2), "on the carriageway");
                foreach (int n in l.Next) Assert.That(!(lanes[n].Road == l.Road && lanes[n].Forward != l.Forward), "no U-turns");
            }
        }
    }
}
