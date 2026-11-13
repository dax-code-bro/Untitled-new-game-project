// The cars against the web game: the catalogue, the body distance fields, the surface-nets meshes
// and the driving equations, number for number with what carbuilder.js and vehicle.js produce in the
// browser (fixture: Tools/CoreTests/fixtures/cars-parity.json, written by export-unity.mjs cars).
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using NUnit.Framework;
using Southbound.Core;

namespace Southbound.Tests
{
    public class CarTests
    {
        static CarCatalog cat;
        static Dictionary<string, object> parity;
        static CarCatalog Cat => cat ??= CarCatalog.Load(CarCatalog.DefaultFile(TestFiles.ProjectRoot));
        static Dictionary<string, object> Parity => parity ??= MiniJson.Parse(File.ReadAllText(TestFiles.Fixture("cars-parity.json"))) as Dictionary<string, object>;
        static double D(object o) => (double)o;

        [Test]
        public void Catalogue_has_every_body_with_its_handling()
        {
            Assert.That(Cat.Cars.Count, Is.GreaterThanOrEqualTo(100), "the catalogue plus the base bodies");
            Assert.That(Cat.Cars.Select(c => c.Id).Distinct().Count(), Is.EqualTo(Cat.Cars.Count), "ids are unique");
            Assert.That(Cat.Cars.Count(c => c.InCatalog), Is.GreaterThanOrEqualTo(90));
            var sedan = Cat["sedan"];
            Assert.That(sedan.Stats.Accel, Is.EqualTo(9)); Assert.That(sedan.Stats.Top, Is.EqualTo(50)); Assert.That(sedan.Stats.Grip, Is.EqualTo(7.5));
            Assert.That(Cat["police"].Paint, Is.Not.Null, "service vehicles have their fixed paint");
            Assert.That(Cat["police"].Spec.Bar, Is.EqualTo("siren"));
            foreach (var c in Cat.Cars)
            {
                var s = c.Spec;
                Assert.That(s.L, Is.GreaterThan(3).And.LessThan(14), c.Id); // (the buses are over 10 m)
                Assert.That(s.AxF, Is.GreaterThan(s.AxR), c.Id);
                Assert.That(s.Roof, Is.GreaterThan(s.Belt), c.Id);
                Assert.That(c.Stats.Top, Is.GreaterThan(20), c.Id);
            }
            Assert.That(Cat.RoadPaints.Count, Is.EqualTo(11));
            Assert.That(Cat.ShopPaints.Count, Is.EqualTo(20));
            var rnd = new Mulberry32(7);
            Assert.That(Cat.RandomTraffic(rnd.Next).Stats.Weight, Is.GreaterThan(0));
        }

        [Test]
        public void Body_fields_match_the_browser()
        {
            foreach (Dictionary<string, object> sh in Parity.Arr("shapes"))
            {
                string id = sh.Text("id");
                var sdf = CarShape.Body(Cat[id].Spec);
                double worst = 0;
                foreach (List<object> p in sh.Arr("samples"))
                {
                    double v = sdf(D(p[0]), D(p[1]), D(p[2]));
                    worst = Math.Max(worst, Math.Abs(v - D(p[3])));
                }
                Assert.That(worst, Is.LessThan(1e-9), $"{id}: largest difference from the browser's field");
            }
        }

        [Test]
        public void Body_meshes_match_the_browser_vertex_for_vertex()
        {
            foreach (Dictionary<string, object> sh in Parity.Arr("shapes"))
            {
                string id = sh.Text("id");
                double[] min = sh.Arr("min").Select(D).ToArray(), max = sh.Arr("max").Select(D).ToArray();
                var m = SurfaceNets.Build(CarShape.Body(Cat[id].Spec), min, max, sh.Num("h"));
                Assert.That(m.VertexCount, Is.EqualTo((int)sh.Num("verts")), id + " vertices");
                Assert.That(m.TriangleCount, Is.EqualTo((int)sh.Num("tris")), id + " triangles");
                double[] sum = new double[3];
                for (int i = 0; i < m.Positions.Length; i += 3) { sum[0] += m.Positions[i]; sum[1] += m.Positions[i + 1]; sum[2] += m.Positions[i + 2]; }
                var want = sh.Arr("sum").Select(D).ToArray();
                for (int a = 0; a < 3; a++) Assert.That(sum[a], Is.EqualTo(want[a]).Within(1e-6 * Math.Max(1, Math.Abs(want[a]))), $"{id} position sum {a}");
            }
        }

        [Test]
        public void Driving_matches_the_browser_step_for_step()
        {
            var scen = new Dictionary<string, (double secs, double v0, Func<double, DriveInput> at)>
            {
                ["launch"] = (12, 0, t => new DriveInput { Throttle = 1 }),
                ["nitro"] = (6, 0, t => new DriveInput { Throttle = 1, Nitro = true }),
                ["turn"] = (4, 20, t => new DriveInput { Throttle = 0.4, Steer = 1 }),
                ["brake"] = (4, 30, t => new DriveInput { Brake = 1 }),
                ["reverse"] = (5, 0, t => new DriveInput { Brake = 1, Steer = -0.5 }),
                ["handbrake"] = (3, 22, t => new DriveInput { Steer = t < 0.5 ? 0 : -1, Handbrake = t > 0.4 }),
                ["coast"] = (8, 25, t => new DriveInput { Steer = 0.3 }),
            };
            foreach (Dictionary<string, object> set in Parity.Arr("drives"))
            {
                string id = set.Text("id");
                var tj = set.Obj("t");
                var tune = new DriveTuning { Accel = tj.Num("accel"), Top = tj.Num("top"), Grip = tj.Num("grip"), BrakeK = tj.Num("brakeK", 1), Wf = tj.Num("wf"), Wr = tj.Num("wr") };
                var fromCatalog = DriveTuning.For(Cat[id]);
                Assert.That(fromCatalog.Accel, Is.EqualTo(tune.Accel), id); Assert.That(fromCatalog.Top, Is.EqualTo(tune.Top), id);
                Assert.That(fromCatalog.Wf - fromCatalog.Wr, Is.EqualTo(tune.Wf - tune.Wr).Within(1e-12), id);
                foreach (var kv in set.Obj("runs"))
                {
                    var sc = scen[kv.Key];
                    var dm = new DriveModel { Forward = sc.v0 };
                    double heading = 0, x = 0, z = 0, dt = 1 / 60.0;
                    var rows = (List<object>)kv.Value; int r = 0;
                    for (int i = 1; i <= sc.secs * 60; i++)
                    {
                        heading += dm.Step(tune, sc.at((i - 1) * dt), dt);
                        double fx = Math.Sin(heading), fz = Math.Cos(heading), sx = Math.Cos(heading), sz = -Math.Sin(heading);
                        x += (fx * dm.Forward + sx * dm.Sideways) * dt; z += (fz * dm.Forward + sz * dm.Sideways) * dt;
                        if (i % 30 != 0) continue;
                        var row = ((List<object>)rows[r++]).Select(D).ToArray();
                        string at = $"{id} {kv.Key} t={row[0]}";
                        Assert.That(dm.Forward, Is.EqualTo(row[1]).Within(1e-9), at + " forward speed");
                        Assert.That(dm.Sideways, Is.EqualTo(row[2]).Within(1e-9), at + " sideways speed");
                        Assert.That(heading, Is.EqualTo(row[3]).Within(1e-9), at + " heading");
                        Assert.That(x, Is.EqualTo(row[4]).Within(1e-6), at + " x");
                        Assert.That(z, Is.EqualTo(row[5]).Within(1e-6), at + " z");
                        Assert.That(dm.Steer, Is.EqualTo(row[6]).Within(1e-12), at + " steer");
                    }
                    Assert.That(r, Is.EqualTo(rows.Count));
                }
            }
        }

        [Test]
        public void Cars_reach_their_top_speed_and_stop()
        {
            foreach (var c in Cat.Cars.Where(c => c.InCatalog))
            {
                var t = DriveTuning.For(c); var dm = new DriveModel();
                for (int i = 0; i < 60 * 60; i++) dm.Step(t, new DriveInput { Throttle = 1 }, 1 / 60.0);
                Assert.That(dm.Forward, Is.GreaterThan(t.Top * 0.8).And.LessThan(t.Top * 1.001), c.Id + " top speed after a minute flat out");
                int steps = 0;
                while (dm.Forward > 0.5 && steps < 600) { dm.Step(t, new DriveInput { Brake = 1 }, 1 / 60.0); steps++; }
                Assert.That(steps / 60.0, Is.LessThan(6), c.Id + " stops within 6 s from top speed");
            }
        }
    }
}
