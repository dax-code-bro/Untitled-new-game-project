// The Unity car meshes: every body's zones (glass, lamps, plates, sirens, rust), the palette the
// material reads, the levels of detail, the mirror into Unity's coordinates, and the wheels decoded
// from Data/Vehicles/wheels.json.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using NUnit.Framework;
using Southbound.Core;

namespace Southbound.Tests
{
    public class CarMeshTests
    {
        static CarCatalog cat;
        static WheelSet wheels;
        static CarCatalog Cat => cat ??= CarCatalog.Load(CarCatalog.DefaultFile(TestFiles.ProjectRoot));
        static WheelSet Wheels => wheels ??= WheelSet.Load(WheelSet.DefaultFile(TestFiles.ProjectRoot));

        static int Count(CarMeshData m, params int[] slots) => slots.Sum(s => m.SlotTriangles[s]);

        [Test]
        public void Every_body_has_its_glass_lamps_and_plates()
        {
            foreach (var c in Cat.Cars)
            {
                var m = CarMeshBuilder.Body(c.Spec, 1);
                string id = c.Id;
                Assert.That(Count(m, CarZones.Paint, CarZones.Paint2, CarZones.PaintFaded, CarZones.Paint2Faded), Is.GreaterThan(m.TriangleCount / 5), id + " is mostly paint");
                Assert.That(Count(m, CarZones.Glass, CarZones.GlassLow), Is.GreaterThan(m.TriangleCount / 60), id + " has windows");
                Assert.That(Count(m, CarZones.HeadReflector, CarZones.HeadLed, CarZones.HeadProjector), Is.GreaterThan(4), id + " has headlights");
                Assert.That(Count(m, CarZones.TailOuter, CarZones.TailInner), Is.GreaterThan(4), id + " has tail lights");
                Assert.That(Count(m, CarZones.Underside, CarZones.WheelWell), Is.GreaterThan(0), id + " has an underside");
                Assert.That(Count(m, CarZones.Plate, CarZones.PlateText), Is.GreaterThan(0), id + " has number plates");
            }
        }

        [Test]
        public void Service_cars_and_old_cars_keep_their_details()
        {
            var police = CarMeshBuilder.Body(Cat["police"].Spec, 1);
            Assert.That(police.SlotTriangles[CarZones.SirenRed], Is.GreaterThan(4), "police siren, red half");
            Assert.That(police.SlotTriangles[CarZones.SirenBlue], Is.GreaterThan(4), "police siren, blue half");
            Assert.That(police.SlotTriangles[CarZones.Paint2], Is.GreaterThan(20), "police doors in the second colour");
            var taxi = CarMeshBuilder.Body(Cat["taxi"].Spec, 1);
            Assert.That(taxi.SlotTriangles[CarZones.TaxiSign], Is.GreaterThan(4), "taxi roof sign");
            var rusty = Cat.Cars.Where(c => c.Spec.Rust > 0.3).ToList();
            Assert.That(rusty, Is.Not.Empty, "the catalogue has old, rusty cars");
            foreach (var c in rusty.Take(4))
            {
                var m = CarMeshBuilder.Body(c.Spec, 1);
                Assert.That(Count(m, CarZones.RustDark, CarZones.RustLight), Is.GreaterThan(0), c.Id + " shows rust");
                Assert.That(Count(m, CarZones.PaintFaded, CarZones.Paint2Faded), Is.GreaterThan(0), c.Id + " has a sun-faded top");
            }
            var chrome = Cat.Cars.First(c => c.Spec.Chrome);
            Assert.That(CarMeshBuilder.Body(chrome.Spec, 1).SlotTriangles[CarZones.Chrome], Is.GreaterThan(0), chrome.Id + " chrome bumpers");
            var plain = CarMeshBuilder.Body(Cat["sedan"].Spec, 1);
            Assert.That(Count(plain, CarZones.SirenRed, CarZones.SirenBlue, CarZones.TaxiSign, CarZones.RustDark, CarZones.RustLight), Is.EqualTo(0), "a plain sedan has none of those");
        }

        [Test]
        public void Body_meshes_are_valid_and_mirrored_into_unity()
        {
            foreach (var id in new[] { "sedan", "police", "bus_01", "suv_07", "tow-truck" })
            {
                var s = Cat[id].Spec;
                var (min, max) = CarMeshBuilder.Bounds(s);
                int prev = int.MaxValue;
                for (int lod = 0; lod < CarMeshBuilder.Levels; lod++)
                {
                    var m = CarMeshBuilder.Body(s, lod);
                    string at = $"{id} level {lod}";
                    Assert.That(m.TriangleCount, Is.LessThan(prev), at + " is lighter than the level before");
                    prev = m.TriangleCount;
                    Assert.That(m.SlotTriangles.Sum(), Is.EqualTo(m.TriangleCount), at);
                    Assert.That(m.Indices.All(i => i >= 0 && i < m.VertexCount), at + " indices in range");
                    for (int v = 0; v < m.VertexCount; v++)
                    {
                        float x = m.Positions[v * 3], y = m.Positions[v * 3 + 1], z = m.Positions[v * 3 + 2];
                        // (the grid runs up to two cells past the box, as in the browser: a bull bar can reach there)
                        double g = 2 * CarMeshBuilder.CellSize(s, lod) + 1e-4;
                        Assert.That(-x >= min[0] && -x <= max[0] + g && y >= min[1] && y <= max[1] + g && z >= min[2] && z <= max[2] + g, at + " vertex inside the (mirrored) box");
                        double nl = Math.Sqrt(m.Normals[v * 3] * m.Normals[v * 3] + m.Normals[v * 3 + 1] * m.Normals[v * 3 + 1] + m.Normals[v * 3 + 2] * m.Normals[v * 3 + 2]);
                        Assert.That(nl, Is.EqualTo(1).Within(1e-3), at + " unit normals");
                        float u = m.Uvs[v * 2] * CarPalette.Width - 0.5f, w = m.Uvs[v * 2 + 1] * CarPalette.Height - 0.5f;
                        Assert.That(Math.Abs(u - Math.Round(u)) < 1e-4 && Math.Abs(w - Math.Round(w)) < 1e-4, at + " UVs on texel centres");
                    }
                    // Unity's front face: (b - a) x (c - a) along the outward normal (as Mesh.RecalculateNormals
                    // makes it; clockwise seen from outside in its left-handed space). The mirror flips that,
                    // so the builder re-winds every triangle.
                    int outward = 0;
                    for (int t = 0; t < m.Indices.Length; t += 3)
                    {
                        int a = m.Indices[t] * 3, b = m.Indices[t + 1] * 3, c = m.Indices[t + 2] * 3;
                        double ex = m.Positions[b] - m.Positions[a], ey = m.Positions[b + 1] - m.Positions[a + 1], ez = m.Positions[b + 2] - m.Positions[a + 2];
                        double fx = m.Positions[c] - m.Positions[a], fy = m.Positions[c + 1] - m.Positions[a + 1], fz = m.Positions[c + 2] - m.Positions[a + 2];
                        double cx = ey * fz - ez * fy, cy = ez * fx - ex * fz, cz = ex * fy - ey * fx;
                        if (cx * m.Normals[a] + cy * m.Normals[a + 1] + cz * m.Normals[a + 2] > 0) outward++;
                    }
                    Assert.That(outward, Is.GreaterThan(m.TriangleCount * 0.97), at + " front faces outward in Unity");
                }
            }
        }

        [Test]
        public void The_near_level_is_finer_than_the_browsers_and_quick_to_build()
        {
            var s = Cat["sedan"].Spec;
            var sw = Stopwatch.StartNew();
            var near = CarMeshBuilder.Body(s, 0);
            sw.Stop();
            TestContext.WriteLine($"sedan near level: {near.TriangleCount} triangles, {near.VertexCount} vertices, {sw.ElapsedMilliseconds} ms; " +
                string.Join(", ", Enumerable.Range(0, CarMeshBuilder.Levels).Select(l => $"L{l} {CarMeshBuilder.CellSize(s, l) * 100:0.0} cm")));
            Assert.That(CarMeshBuilder.CellSize(s, 0), Is.LessThan(Math.Max(0.045, s.L / 150)), "finer than the browser's near level");
            Assert.That(near.TriangleCount, Is.InRange(20000, 160000));
            Assert.That(sw.Elapsed.TotalSeconds, Is.LessThan(20));
        }

        [Test]
        public void Palette_holds_the_paint_and_the_lights()
        {
            var car = Cat["police"];
            var look = CarLook.For(car, Wheels);
            Assert.That(look.Paint[0], Is.EqualTo((float)car.Paint[0]));
            Assert.That(look.Paint2[0], Is.EqualTo(0.85f).Within(1e-6), "police second colour (white doors)");
            float[] b = new float[CarPalette.Texels * 4], mk = new float[b.Length], co = new float[b.Length], em = new float[b.Length];
            CarPalette.Fill(look, b, mk, co);
            Assert.That(b[CarZones.Paint * 4], Is.EqualTo(look.Paint[0]));
            Assert.That(co[CarZones.Glass * 4], Is.EqualTo(1), "glass is clear-coated");
            Assert.That(mk[CarZones.Chrome * 4], Is.EqualTo(1), "chrome is metal");
            Assert.That(mk[CarZones.Chrome * 4 + 3], Is.EqualTo(0.9f).Within(1e-6), "smoothness = 1 - roughness");
            Assert.That(b[CarZones.WheelFirst * 4], Is.EqualTo(0.028f).Within(1e-6), "tyre rubber");
            CarPalette.Emission(new CarLights(), em);
            float drl = em[CarZones.HeadLed * 4], tail = em[CarZones.TailInner * 4];
            Assert.That(em[CarZones.SirenRed * 4], Is.EqualTo(0), "siren off");
            CarPalette.Emission(new CarLights { Head = 1, Brake = 1, SirenRed = 1 }, em);
            Assert.That(em[CarZones.HeadLed * 4], Is.GreaterThan(drl * 5), "headlights on");
            Assert.That(em[CarZones.HeadProjector * 4], Is.GreaterThan(10));
            Assert.That(em[CarZones.TailInner * 4], Is.GreaterThan(tail * 20), "brake lights");
            Assert.That(em[CarZones.SirenRed * 4], Is.GreaterThan(8));
            Assert.That(em[CarZones.TailOuter * 4], Is.LessThan(em[CarZones.TailInner * 4]));
            for (int s = 0; s < CarZones.Count; s++) Assert.That(CarZones.Names[s], Is.Not.Empty);
        }

        [Test]
        public void Wheels_decode_from_the_browser_export()
        {
            Assert.That(Wheels.Styles.Select(s => s.Spokes), Is.EquivalentTo(new[] { 0, 5, 6, 10, 14 }));
            foreach (var st in Wheels.Styles)
            {
                Assert.That(st.Levels.Length, Is.EqualTo(3));
                Assert.That(st.Levels[0].Triangles, Is.GreaterThan(st.Levels[1].Triangles));
                Assert.That(st.Levels[1].Triangles, Is.GreaterThan(st.Levels[2].Triangles));
                Assert.That(st.Levels[0].Palette.Length, Is.EqualTo(6));
                for (int i = 0; i < 6; i++) Assert.That(st.Levels[1].Palette[i], Is.EqualTo(st.Levels[0].Palette[i]), $"{st.Spokes} spokes: near and middle wheels share part colours");
                foreach (var lv in st.Levels)
                {
                    string at = $"{st.Spokes} spokes level {lv.Level}";
                    Assert.That(lv.Positions.Length / 3, Is.EqualTo(lv.Vertices), at);
                    Assert.That(lv.Indices.Length / 3, Is.EqualTo(lv.Triangles), at);
                    Assert.That(lv.Indices.All(i => i < lv.Vertices), at);
                    Assert.That(lv.Part.All(p => p < lv.Palette.Length), at);
                    double rMax = 0, xMin = 9, xMax = -9;
                    for (int v = 0; v < lv.Vertices; v++)
                    {
                        double x = lv.Positions[v * 3], y = lv.Positions[v * 3 + 1], z = lv.Positions[v * 3 + 2];
                        rMax = Math.Max(rMax, Math.Sqrt(y * y + z * z)); xMin = Math.Min(xMin, x); xMax = Math.Max(xMax, x);
                    }
                    Assert.That(rMax, Is.EqualTo(Wheels.RefRadius).Within(0.002), at + " tyre radius");
                    Assert.That(xMax - xMin, Is.EqualTo(Wheels.RefWidth).Within(0.05), at + " tyre width");
                    var m = CarMeshBuilder.Wheel(lv, lv.Level == 2);
                    Assert.That(m.SlotTriangles.Sum(), Is.EqualTo(lv.Triangles), at);
                    // the rim face (rim parts at the outer edge) faces the driver's side, -x, once mirrored
                    double rimX = 0; int rimN = 0;
                    for (int v = 0; v < lv.Vertices; v++) if (lv.Part[v] == 1) { rimX += m.Positions[v * 3]; rimN++; }
                    Assert.That(rimX / rimN, Is.LessThan(0), at + " rim face toward -x");
                }
            }
            var look = CarLook.For(Cat["sedan"], Wheels);
            Assert.That(look.Wheel.Take(3), Is.EqualTo(new[] { 0.028f, 0.028f, 0.03f }), "tyre colour from the export");
        }
    }
}
