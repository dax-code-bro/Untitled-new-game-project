// Boats and aircraft against the browser (fixture: Tools/CoreTests/fixtures/craft-parity.json, written by
// tools/southbound/craft-parity.mjs from the web game's own entities/craft.js): the same manoeuvres on the same
// made-up shore give the same positions, speeds and attitudes step for step, every craft's mesh has the browser's
// vertex and triangle counts, and the upgrade prices match. Plus the marinas found on the real Calvera.
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using NUnit.Framework;
using Southbound.Core;

namespace Southbound.Tests
{
    public class CraftTests
    {
        static Dictionary<string, object> parity;
        static Dictionary<string, object> Parity => parity ??= MiniJson.Parse(File.ReadAllText(TestFiles.Fixture("craft-parity.json"))) as Dictionary<string, object>;

        // the fixture's world (craft-parity.mjs): sea over a seabed east to a beach, a lake at 45 m, a field at 12 m
        sealed class Shore : ICraftGround
        {
            public double Height(double x, double z) => z < -200 ? 12 : z > 300 ? (x < 100 ? 40 : 50) : x < 60 ? -6 : -6 + (x - 60) * 0.5;
            public double Water(double x, double z) => z > 300 ? (x < 100 ? 45 : 0) : 0;
        }

        static CraftInput In(Dictionary<string, object> o) => new CraftInput
        {
            Throttle = o.Num("throttle"), Brake = o.Num("brake"), Steer = o.Num("steer"),
            Up = o.TryGetValue("handbrake", out var h) && h is bool hb && hb, Down = o.TryGetValue("nitro", out var n) && n is bool nb && nb,
        };

        [Test]
        public void Boats_handle_as_in_the_browser()
        {
            var g = new Shore();
            foreach (Dictionary<string, object> run in Parity.Arr("boats"))
            {
                var b = new BoatModel(CraftCatalog.Find(run.Text("id"))) { X = 0, Y = 0, Z = 0, Heading = Math.PI / 2, T = 0 };
                int i = 0;
                foreach (Dictionary<string, object> st in run.Arr("steps"))
                {
                    b.Step(1 / 30.0, In(st.Obj("in")), g);
                    if (st.ContainsKey("x"))
                    {
                        string at = $"{run.Text("id")} step {i}";
                        Assert.That(b.X, Is.EqualTo(st.Num("x")).Within(1e-6), at + " x"); Assert.That(b.Z, Is.EqualTo(st.Num("z")).Within(1e-6), at + " z");
                        Assert.That(b.Y, Is.EqualTo(st.Num("y")).Within(1e-6), at + " y"); Assert.That(b.Heading, Is.EqualTo(st.Num("h")).Within(1e-7), at + " heading");
                        Assert.That(b.Pitch, Is.EqualTo(st.Num("p")).Within(1e-7), at + " pitch"); Assert.That(b.Roll, Is.EqualTo(st.Num("r")).Within(1e-7), at + " roll");
                        Assert.That(b.Speed, Is.EqualTo(st.Num("s")).Within(1e-6), at + " speed");
                    }
                    i++;
                }
            }
        }

        [Test]
        public void Aircraft_fly_as_in_the_browser()
        {
            var g = new Shore();
            foreach (Dictionary<string, object> run in Parity.Arr("air"))
            {
                var a = new AirModel(CraftCatalog.Find(run.Text("id")), new Random(1));
                a.Place(run.Num("x"), run.Num("z"), run.Num("h"), g);
                int i = 0; bool climbed = false;
                foreach (Dictionary<string, object> st in run.Arr("steps"))
                {
                    a.Flaps = st.Num("flaps"); a.GearDown = st.TryGetValue("gear", out var gd) && gd is bool gb && gb;
                    a.Step(1 / 30.0, In(st.Obj("in")), g);
                    if (st.ContainsKey("x"))
                    {
                        string at = $"{run.Text("id")} step {i}";
                        Assert.That(a.X, Is.EqualTo(st.Num("x")).Within(1e-5), at + " x"); Assert.That(a.Z, Is.EqualTo(st.Num("z")).Within(1e-5), at + " z");
                        Assert.That(a.Y, Is.EqualTo(st.Num("y")).Within(1e-5), at + " y"); Assert.That(a.Heading, Is.EqualTo(st.Num("h")).Within(1e-7), at + " heading");
                        Assert.That(a.Pitch, Is.EqualTo(st.Num("p")).Within(1e-7), at + " pitch"); Assert.That(a.Roll, Is.EqualTo(st.Num("r")).Within(1e-7), at + " roll");
                        Assert.That(a.Speed, Is.EqualTo(st.Num("s")).Within(1e-6), at + " speed"); Assert.That(a.Vy, Is.EqualTo(st.Num("vy")).Within(1e-6), at + " climb");
                        Assert.That(a.Power, Is.EqualTo(st.Num("power")).Within(1e-9), at + " power"); Assert.That(a.Fuel, Is.EqualTo(st.Num("fuel")).Within(1e-9), at + " fuel");
                        Assert.That(a.Alt, Is.EqualTo(st.Num("alt")).Within(1e-5), at + " altitude"); Assert.That(a.Health, Is.EqualTo(st.Num("hp")).Within(1e-6), at + " health");
                        if (a.Alt > 30) climbed = true;
                    }
                    if (st.ContainsKey("stalled")) break;
                    i++;
                }
                Assert.That(climbed, $"{run.Text("id")} got off the ground");
                var t = run.Obj("touch");
                if (t != null) { Assert.That(a.TouchVs, Is.EqualTo(t.Num("vs")).Within(1e-6)); Assert.That(a.TouchSeq, Is.GreaterThan(0)); }
            }
        }

        [Test]
        public void Every_craft_is_shaped_as_in_the_browser()
        {
            var want = Parity.Arr("meshes").Cast<Dictionary<string, object>>().ToDictionary(m => m.Text("id"));
            Assert.That(want.Count, Is.EqualTo(CraftCatalog.Boats.Count + CraftCatalog.Aircraft.Count));
            foreach (var e in CraftCatalog.Boats.Concat(CraftCatalog.Aircraft))
            {
                var m = CraftShape.Build(e);
                Assert.That(m.Mesh.VertexCount, Is.EqualTo((int)want[e.Id].Num("vertices")), e.Id + " vertices");
                Assert.That(m.Mesh.TriangleCount, Is.EqualTo((int)want[e.Id].Num("triangles")), e.Id + " triangles");
                Assert.That(m.TriLook.Length, Is.EqualTo(m.Mesh.TriangleCount));
                Assert.That(m.Looks.Count, Is.InRange(2, 16), e.Id + " colours");
                if (e.Heli) Assert.That(m.Rotor, Is.Not.Null, e.Id + " has a rotor");
            }
            Assert.That(CraftShape.Build(CraftCatalog.Find("sailboat")).Sails.Count, Is.EqualTo(2));
            Assert.That(CraftShape.Build(CraftCatalog.Find("airboat")).Props.Count, Is.EqualTo(1), "the airboat's fan");
            Assert.That(CraftShape.Build(CraftCatalog.Find("twin")).Props.Count, Is.EqualTo(2));
        }

        [Test]
        public void Catalogues_and_upgrades_match()
        {
            Assert.That(CraftCatalog.Boats.Count, Is.EqualTo(16)); Assert.That(CraftCatalog.Aircraft.Count, Is.EqualTo(11));
            var up = Parity.Obj("upgrades");
            var boat = up.Arr("boat").Cast<List<object>>().ToList(); var air = up.Arr("air").Cast<List<object>>().ToList();
            Assert.That(CraftCatalog.BoatUpgrades.Select(u => u.Id), Is.EqualTo(boat.Select(b => (string)b[0])));
            Assert.That(CraftCatalog.BoatUpgrades.Select(u => (double)u.Price), Is.EqualTo(boat.Select(b => (double)b[1])));
            Assert.That(CraftCatalog.AirUpgrades.Select(u => u.Id), Is.EqualTo(air.Select(b => (string)b[0])));
            Assert.That(CraftCatalog.AirUpgrades.Select(u => (double)u.Price), Is.EqualTo(air.Select(b => (double)b[1])));
            Assert.That(CraftCatalog.Find("patrol-boat").Restricted && CraftCatalog.Find("medevac").Restricted, "police and medevac craft aren't for sale");
            Assert.That(CraftCatalog.Find("tour-heli").Heli && !CraftCatalog.Find("skylark").Heli);
            // upgrades make a boat quicker and tougher
            var b = new BoatModel(CraftCatalog.Find("skiff"));
            b.Upgrade(new Dictionary<string, int> { ["Outboard power"] = 3, ["Hull armor"] = 2 });
            Assert.That(b.Accel, Is.EqualTo(4 * 1.18).Within(1e-9)); Assert.That(b.MaxHealth, Is.EqualTo(150));
            Assert.That(Harbours.LandingWord(-1, true), Is.EqualTo("Butter landing")); Assert.That(Harbours.LandingWord(-6, true), Is.EqualTo("Hard landing")); Assert.That(Harbours.LandingWord(-1, false), Is.EqualTo("Belly landing!"));
            Assert.That(CraftCatalog.FuelCost(0.5, false), Is.EqualTo(130));
        }

        [Test]
        public void Your_boats_and_aircraft_are_saved_the_web_game_s_way()
        {
            var p = Profile.FromJson("{\"v\":1,\"garage\":[{\"uid\":\"g1\",\"cat\":\"car\",\"type\":\"sedan\",\"up\":{}}],\"stats\":{\"fishCaught\":4}}");
            Assert.That(p.Garage, Is.EqualTo(1)); Assert.That(p.Fleet("boat").Count(), Is.EqualTo(0));
            var b = p.AddToFleet("boat", "skiff");
            ((Dictionary<string, object>)b["up"])["Outboard power"] = 3.0;
            p.AddToFleet("air", "skylark");
            p.FlightSchool["1"] = "gold"; p.PilotLicence = true; p.AddStat("landings"); p.AddStat("fishCaught", 2);
            var q = Profile.FromJson(p.ToJson());
            Assert.That(q.Garage, Is.EqualTo(3), "the car stays in the garage too");
            Assert.That(q.Fleet("boat").Single().Text("type"), Is.EqualTo("skiff"));
            Assert.That(Profile.Upgrades(q.Fleet("boat").Single())["Outboard power"], Is.EqualTo(3));
            Assert.That(q.Fleet("air").Single().Text("uid"), Is.Not.EqualTo(q.Fleet("boat").Single().Text("uid")));
            Assert.That(q.FlightSchool["1"], Is.EqualTo("gold")); Assert.That(q.PilotLicence);
            Assert.That(q.Stat("landings"), Is.EqualTo(1)); Assert.That(q.Stat("fishCaught"), Is.EqualTo(6));
        }

        [Test]
        public void The_marinas_are_on_Calvera_s_shores()
        {
            var w = CalveraWorld.Load(CalveraWorld.DefaultFolder(TestFiles.ProjectRoot));
            var data = MissionData.Load(MissionData.DefaultFile(TestFiles.ProjectRoot));
            var ms = Harbours.Marinas(w, data);
            Assert.That(ms.Select(m => m.Name), Is.EqualTo(new[] { "Lake Arden Marina", "Port Calvera Harbor", "Bayou Verde Landing" }));
            foreach (var m in ms)
            {
                Assert.That(w.WaterLevel(m.WaterX, m.WaterZ) - w.HeightAt(m.WaterX, m.WaterZ), Is.GreaterThan(1.4), m.Name + ": deep water at the pier's end");
                Assert.That(w.HeightAt(m.LandX, m.LandZ) - w.WaterLevel(m.LandX, m.LandZ), Is.GreaterThan(0.4), m.Name + ": dry land at its foot");
                var (bx, bz, _) = Harbours.BoatSpot(m);
                Assert.That(w.WaterLevel(bx, bz) - w.HeightAt(bx, bz), Is.GreaterThan(0.3), m.Name + ": a boat floats where it's launched");
            }
            // the web game puts the harbour mission's water 60 m out from the Port Calvera pier
            var hw = data.Place("harborwater");
            Assert.That(ms[1].WaterX, Is.EqualTo(hw.x).Within(0.01)); Assert.That(ms[1].WaterZ + 60, Is.EqualTo(hw.z).Within(0.01));
            Assert.That(w.WaterLevel(data.LakeX, data.LakeZ), Is.EqualTo(data.LakeLevel).Within(0.5), "Lake Arden's surface");
            // a boat on Lake Arden floats and moves; on land it doesn't
            var boat = new BoatModel(CraftCatalog.Find("skiff"), new Random(1));
            boat.Place(data.LakeX, data.LakeZ, 0, w);
            for (int i = 0; i < 90; i++) boat.Step(1 / 30.0, new CraftInput { Throttle = 1 }, w);
            Assert.That(boat.Afloat && boat.Speed > 2, "under way on the lake");
            // planes wait on the runway, which is flat
            var (ax, az, _) = Harbours.AirSpawn(data);
            Assert.That(w.HeightAt(ax, az), Is.EqualTo(data.AirfieldHeight).Within(1.5));
            Assert.That(Harbours.OnRunway(data, ax, az));
        }
    }
}
