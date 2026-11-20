// The car's condition (the web game's damage, fire and fuel numbers) and the front doors cut out of the body.
using System;
using System.Linq;
using NUnit.Framework;
using Southbound.Core;

namespace Southbound.Tests
{
    public class CarDamageTests
    {
        [Test]
        public void Crashes_dent_the_side_hit_and_wreck_the_engine_at_zero()
        {
            Assert.That(CarDamage.CrashDamage(3.9), Is.EqualTo(0));
            Assert.That(CarDamage.CrashDamage(13), Is.EqualTo(22).Within(1e-9));
            Assert.That(CarDamage.Side(0.1, 2), Is.EqualTo(CarSide.Front));
            Assert.That(CarDamage.Side(-0.1, -2), Is.EqualTo(CarSide.Rear));
            Assert.That(CarDamage.Side(-1, 0.5), Is.EqualTo(CarSide.Left));
            var d = new CarDamage();
            d.Crash(13, CarSide.Front);
            Assert.That(d.Health, Is.EqualTo(78).Within(1e-9));
            Assert.That(d.Dents[(int)CarSide.Front], Is.EqualTo(22 / 100.0 * 2.2).Within(1e-9));
            Assert.That(d.Dents[(int)CarSide.Rear], Is.EqualTo(0));
            Assert.That(d.Glass[(int)CarSide.Front], Is.EqualTo(1), "a 13 m/s hit cracks the windscreen");
            Assert.That(d.Smoke, Is.EqualTo(0));
            for (int i = 0; i < 4; i++) d.Crash(13, CarSide.Front);
            Assert.That(d.Dents[(int)CarSide.Front], Is.EqualTo(1), "dents top out");
            Assert.That(d.Wrecked && !d.OnFire && !d.Runs, "crashing kills the engine, it doesn't set it alight");
            Assert.That(CarDamage.DriverHurt(12), Is.EqualTo(0)); Assert.That(CarDamage.DriverHurt(17), Is.EqualTo(10).Within(1e-9));
        }

        [Test]
        public void Shot_or_blown_up_to_nothing_it_burns_then_explodes()
        {
            var d = new CarDamage();
            int shots = 0;
            while (!d.OnFire && shots < 1000) { d.Shot(40, 1, CarSide.Left, shots % 2 == 0); shots++; }
            Assert.That(shots, Is.EqualTo(10), "a quarter of a 40-damage round, 100 health");
            Assert.That(d.Glass[(int)CarSide.Left], Is.EqualTo(3), "and the window on that side is gone");
            Assert.That(d.Smoke, Is.EqualTo(3));
            Assert.That(d.FireLeft, Is.InRange(3.5, 5.5));
            double t = 0; bool boom = false;
            while (!boom && t < 10) { boom = d.Burn(0.1); t += 0.1; }
            Assert.That(boom && d.Exploded, Is.True); Assert.That(t, Is.InRange(3.5, 5.6));
            Assert.That(d.Burn(0.1), Is.False, "it only goes up once");
            var b = new CarDamage();
            Assert.That(b.Blast(160, 1, 8, CarSide.Front), Is.True, "a close blast sets it off");
            Assert.That(b.FireLeft, Is.EqualTo(0.4).Within(1e-9));
            Assert.That(new CarDamage().Blast(160, 9, 8, CarSide.Front), Is.False, "outside the radius nothing happens");
        }

        [Test]
        public void Fuel_burns_with_throttle_and_speed_and_costs_to_fill()
        {
            var d = new CarDamage();
            d.Drain(60, 0, 0, false);
            Assert.That(d.Fuel, Is.EqualTo(1 - 60 * 0.00012).Within(1e-12), "idling");
            var flat = new CarDamage(); double t = 0;
            while (flat.Runs && t < 7200) { flat.Drain(1, 1, 40, false); t++; }
            Assert.That(t / 60, Is.InRange(13, 15), "about 14 minutes flat out at 90 mph on a tank (the web game's rates)");
            Assert.That(flat.Power, Is.EqualTo(0), "an empty tank, no engine");
            Assert.That(CarDamage.FillCost(0), Is.EqualTo(62)); Assert.That(CarDamage.FillCost(0.99), Is.EqualTo(2));
            var hurt = new CarDamage(); hurt.Hit(81, CarSide.Front);
            Assert.That(hurt.Power, Is.EqualTo(0.6)); Assert.That(hurt.Smoke, Is.EqualTo(2));
            hurt.Repair(100);
            Assert.That(hurt.Health, Is.EqualTo(100)); Assert.That(hurt.Dents.All(x => x == 0)); Assert.That(hurt.Power, Is.EqualTo(1));
        }

        [Test]
        public void The_front_doors_come_out_of_the_body_on_their_own_sides()
        {
            var cat = CarCatalog.Load(CarCatalog.DefaultFile(TestFiles.ProjectRoot));
            foreach (var id in new[] { "sedan", "pickup_02", "suv", "hatchback-sports" })
            {
                var car = cat[id];
                if (car == null) continue;
                var s = car.Spec;
                var m = CarMeshBuilder.Body(s, 1);
                var doors = CarDoors.Split(s, m.Positions, m.Normals, new[] { m.Indices }, out var body);
                Assert.That(doors, Is.Not.Null, id);
                int total = body[0].Length + doors.Sum(d => d.Triangles[0].Length);
                Assert.That(total, Is.EqualTo(m.Indices.Length), $"{id}: every triangle goes somewhere, once");
                double doorF = s.AxF - s.Rw - 0.14;
                foreach (var d in doors)
                {
                    var I = d.Triangles[0];
                    Assert.That(I.Length / 3, Is.GreaterThan(30), $"{id} {d.Name}");
                    bool driver = d.Name.Contains("driver");
                    for (int t = 0; t < I.Length; t += 3)
                    {
                        double x = (m.Positions[I[t] * 3] + m.Positions[I[t + 1] * 3] + m.Positions[I[t + 2] * 3]) / 3;
                        Assert.That(driver ? x < 0 : x > 0, $"{id}: the {d.Name} is on its own side (driver -x in Unity)");
                    }
                    // opening swings the back of the door outward
                    double th = d.OpenDegrees * Math.PI / 180;
                    double backX = -Math.Sin(th);   // where (0, 0, -1) from the hinge goes under Unity's yaw
                    Assert.That(Math.Sign(backX), Is.EqualTo(Math.Sign(d.HingeX)), $"{id}: the {d.Name} opens outward");
                    Assert.That(d.HingeZ, Is.EqualTo(doorF + 0.01).Within(1e-9));
                }
            }
            Assert.That(CarDoors.Split(new CarSpec { Bus = true }, new float[0], new float[0], new[] { new int[0] }, out _), Is.Null, "no swinging doors on a bus");
        }
    }
}
