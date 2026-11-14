// The rest of the street: instances bake into Unity space mirrored, wound the right way round (also for
// mirrored instances), with normals that survive non-uniform scale; colours round-trip through the
// palette; and the export carries the streets' furniture where the web game puts it.
using System;
using System.Linq;
using NUnit.Framework;
using Southbound.Core;

namespace Southbound.Tests
{
    public class StreetDataTests
    {
        // a triangle facing +y (counter-clockwise from above in three.js's right-handed space)
        static StreetData.Shape Tri() => new StreetData.Shape { N = 3, Pos = new float[] { 0, 0, 0, 0, 0, 1, 1, 0, 0 }, Nrm = new float[] { 0, 1, 0, 0, 1, 0, 0, 1, 0 }, Idx = new[] { 0, 1, 2 } };
        static float[] Identity() => new float[] { 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1 };

        // Unity's front face: (b - a) x (c - a) points along the outward normal (Unity's own cross product)
        static double FaceY(StreetData.Baked b, int t)
        {
            int a = b.I[t] * 3, c = b.I[t + 1] * 3, d = b.I[t + 2] * 3;
            double ux = b.P[c] - b.P[a], uy = b.P[c + 1] - b.P[a + 1], uz = b.P[c + 2] - b.P[a + 2];
            double vx = b.P[d] - b.P[a], vy = b.P[d + 1] - b.P[a + 1], vz = b.P[d + 2] - b.P[a + 2];
            // the y of Vector3.Cross(b - a, c - a)
            return uz * vx - ux * vz;
        }

        [Test]
        public void Instances_bake_mirrored_and_wound_for_unity()
        {
            var s = Tri();
            // web space: (b - a) x (c - a) = (0,0,1) x (1,0,0) = (0,1,0): faces up
            var plain = new StreetData.Baked();
            StreetData.Bake(s, Identity(), -1, (1, 1, 1), false, plain);
            Assert.That(plain.P[6], Is.EqualTo(-1f), "x mirrored");
            Assert.That(plain.N[1], Is.EqualTo(1f));
            double upPlain = FaceY(plain, 0);
            // the same triangle under a mirroring instance matrix (x scaled by -1) must face the same way in Unity
            var mirrorM = Identity(); mirrorM[0] = -1;
            var mirrored = new StreetData.Baked();
            StreetData.Bake(s, mirrorM, -1, (1, 1, 1), false, mirrored);
            Assert.That(Math.Sign(FaceY(mirrored, 0)), Is.EqualTo(Math.Sign(upPlain)), "a mirrored instance is re-wound");
            // and Unity reads it as facing the sky: Vector3.Cross(b - a, c - a) points out of a front face
            Assert.That(upPlain, Is.GreaterThan(0), "front face toward the sky in Unity");

            // non-uniform scale keeps normals perpendicular: a slanted face on a box stretched 4x along x
            var slant = new StreetData.Shape { N = 3, Pos = new float[] { 0, 0, 0, 1, 1, 0, 0, 0, 1 }, Nrm = Enumerable.Repeat(new float[] { -0.7071f, 0.7071f, 0 }, 3).SelectMany(v => v).ToArray(), Idx = new[] { 0, 1, 2 } };
            var stretch = Identity(); stretch[0] = 4;
            var b = new StreetData.Baked();
            StreetData.Bake(slant, stretch, -1, (1, 1, 1), false, b);
            double ex = b.P[3] - b.P[0], ey = b.P[4] - b.P[1], ez = b.P[5] - b.P[2];   // an edge of the stretched face (Unity space)
            Assert.That(Math.Abs(ex * b.N[0] + ey * b.N[1] + ez * b.N[2]), Is.LessThan(1e-5), "normal stays perpendicular to the stretched face");

            // instance tint and vertex colour multiply; flipV mirrors v
            s.Uv = new float[] { 0, 0.25f, 0, 0, 0, 0 }; s.Col = new float[] { 0.5f, 1, 1, 1, 1, 1, 1, 1, 1 };
            var c = new StreetData.Baked();
            StreetData.Bake(s, Identity(), -1, (0.5f, 1, 1), true, c);
            Assert.That(c.C[0], Is.EqualTo(0.25f)); Assert.That(c.U[1], Is.EqualTo(0.75f));
        }

        [Test]
        public void An_instanced_piece_lands_where_its_baked_copy_does()
        {
            // StreetBuilder places shared meshes (baked with the identity: S v) by S M S; that must equal baking with M
            var s = Tri();
            var rnd = new Random(5);
            for (int trial = 0; trial < 20; trial++)
            {
                double yaw = rnd.NextDouble() * 6.28, sc = 0.5 + rnd.NextDouble();
                float c = (float)(Math.Cos(yaw) * sc), sn = (float)(Math.Sin(yaw) * sc);
                // three.js column-major: rotation about y, uniform scale, a translation
                var m = new float[] { c, 0, -sn, 0, 0, (float)sc, 0, 0, sn, 0, c, 0, (float)(rnd.NextDouble() * 100), 3, (float)(rnd.NextDouble() * 100), 1 };
                var baked = new StreetData.Baked(); StreetData.Bake(s, m, -1, (1, 1, 1), false, baked);
                var local = new StreetData.Baked(); StreetData.Bake(s, Identity(), -1, (1, 1, 1), false, local);
                // M' = S M S, column by column (as StreetBuilder builds it)
                double[] c0 = { m[0], -m[1], -m[2] }, c1 = { -m[4], m[5], m[6] }, c2 = { -m[8], m[9], m[10] }, t = { -m[12], m[13], m[14] };
                for (int v = 0; v < 3; v++)
                {
                    double x = local.P[v * 3], y = local.P[v * 3 + 1], z = local.P[v * 3 + 2];
                    for (int k = 0; k < 3; k++)
                        Assert.That(c0[k] * x + c1[k] * y + c2[k] * z + t[k], Is.EqualTo(baked.P[v * 3 + k]).Within(1e-3));
                }
                Assert.That(local.I, Is.EqualTo(baked.I), "same winding");
            }
        }

        [Test]
        public void Colours_round_trip_through_the_palette()
        {
            foreach (var (r, g, b) in new[] { (0.0f, 0.0f, 0.0f), (1f, 1f, 1f), (0.2f, 0.5f, 0.05f), (0.8f, 0.1f, 0.4f) })
            {
                var (u, v) = StreetData.PaletteUv(r, g, b);
                int i = (int)(u * StreetData.PaletteSize), j = (int)(v * StreetData.PaletteSize);
                var c = StreetData.PaletteColour(i, j);
                Assert.That(Math.Pow(c.r, 1 / 2.2), Is.EqualTo(Math.Pow(r, 1 / 2.2)).Within(0.035));
                Assert.That(Math.Pow(c.g, 1 / 2.2), Is.EqualTo(Math.Pow(g, 1 / 2.2)).Within(0.035));
                Assert.That(Math.Pow(c.b, 1 / 2.2), Is.EqualTo(Math.Pow(b, 1 / 2.2)).Within(0.035));
            }
        }

        [Test]
        public void A_wire_is_a_closed_thin_tube()
        {
            var t = new StreetData.Baked();
            StreetData.Tube(0, 8, 0, 30, 7.5, 0, 0.012, 5, t);
            Assert.That(t.Vertices, Is.EqualTo(10)); Assert.That(t.I.Count, Is.EqualTo(30));
            for (int i = 0; i < 5; i++)
            {
                double dy = t.P[i * 3 + 1] - 8, dz = t.P[i * 3 + 2];
                Assert.That(Math.Sqrt(dy * dy + dz * dz), Is.EqualTo(0.012).Within(0.002), "radius round the start");
            }
            Assert.That(t.P[5 * 3], Is.EqualTo(-30f).Within(1e-4), "far end mirrored into Unity space");
        }

        [Test]
        public void The_street_export_carries_the_furniture()
        {
            var folder = CalveraWorld.DefaultFolder(TestFiles.ProjectRoot);
            var d = StreetData.Load(folder);
            if (d.Objects.Count == 0) Assert.Ignore("no calvera-street.json (run export-unity.mjs street)");
            var w = CalveraWorld.Load(folder);
            int placed = d.Objects.Sum(o => o.Instances);
            TestContext.WriteLine($"{d.Objects.Count} objects, {placed} placed, {d.Wires.Count} wire sets, {d.Shapes.Count} shapes, {d.Mats.Count} materials, {d.Textures.Count} textures");
            Assert.That(placed, Is.GreaterThan(5000));
            Assert.That(d.Objects.Any(o => o.Tag.StartsWith("roads.js:heads")), "street lights");
            Assert.That(d.Objects.Any(o => o.Tag.StartsWith("powerlines.js")), "utility poles");
            Assert.That(d.Wires.Count, Is.GreaterThan(0), "wires");
            Assert.That(d.Objects.Any(o => o.Tag.StartsWith("palms.js")), "palms");
            Assert.That(d.Objects.Any(o => o.Name.StartsWith("clutter:")), "street clutter");
            Assert.That(d.Objects.Any(o => o.Tag.StartsWith("roads.js:hwMesh") || o.Tag.StartsWith("roads.js:stMesh")), Is.False, "road ribbons stay Unity's own");
            // everything stands on the map
            foreach (var o in d.Objects)
                for (int i = 0; i < o.Instances; i += 13)
                {
                    var (x, y, z) = StreetData.Origin(o.Matrix(i));
                    Assert.That(Math.Abs(x), Is.LessThanOrEqualTo(w.Half + 1)); Assert.That(Math.Abs(z), Is.LessThanOrEqualTo(w.Half + 1));
                    Assert.That(y, Is.InRange(w.HMin - 60, w.HMax + 150));
                }
            // every reference resolves
            foreach (var o in d.Objects) { Assert.That(o.Shape, Is.InRange(0, d.Shapes.Count - 1)); Assert.That(o.Mats.All(m => m >= 0 && m < d.Mats.Count)); }
            foreach (var m in d.Mats) Assert.That(m.Map, Is.InRange(-1, d.Textures.Count - 1));
            // and they bake: the street lights' heads up at lamp height over the road
            var heads = d.Objects.First(o => o.Tag == "roads.js:heads");
            var b = new StreetData.Baked();
            StreetData.Bake(d.Shapes[heads.Shape], heads.Matrix(0), -1, (1, 1, 1), false, b);
            Assert.That(b.Vertices, Is.GreaterThan(0));
            var (hx, hy, hz) = StreetData.Origin(heads.Matrix(0));
            Assert.That(hy - w.HeightAt(hx, hz), Is.InRange(6.5, 9.5), "lamp heads about 7.8 m up");
        }
    }
}
