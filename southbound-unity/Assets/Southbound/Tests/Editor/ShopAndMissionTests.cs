// Shops (the exported walk-in buildings, hours, the Gulf Mart menu, ammunition boxes) and missions and jobs
// (the exported data, the mission runner against a pretend world, a job shift's pay and levels).
using System;
using System.Collections.Generic;
using System.Linq;
using NUnit.Framework;
using Southbound.Core;

namespace Southbound.Tests
{
    public class ShopAndMissionTests
    {
        [Test]
        public void The_shops_came_over_with_keepers_counters_and_doors()
        {
            var shops = ShopCatalog.Load(ShopCatalog.DefaultFile(TestFiles.ProjectRoot));
            Assert.That(shops.Count(s => s.Kind == "guns"), Is.EqualTo(3));
            Assert.That(shops.Count(s => s.Kind == "mart"), Is.GreaterThanOrEqualTo(3));
            Assert.That(shops.Count(s => s.Kind == "clothes"), Is.EqualTo(3));
            Assert.That(shops.Select(s => s.Id), Does.Contain("precinct").And.Contain("hospital"));
            foreach (var s in shops)
            {
                // the counter sits between the keeper and the door, 1.9 m out from the keeper
                var (cx, cz) = s.Counter;
                double kd = Math.Sqrt((s.DoorX - s.KeeperX) * (s.DoorX - s.KeeperX) + (s.DoorZ - s.KeeperZ) * (s.DoorZ - s.KeeperZ));
                double cd = Math.Sqrt((s.DoorX - cx) * (s.DoorX - cx) + (s.DoorZ - cz) * (s.DoorZ - cz));
                Assert.That(kd, Is.EqualTo(7.8).Within(0.05), $"{s.Id}: keeper to door");
                Assert.That(cd, Is.EqualTo(5.9).Within(0.05), $"{s.Id}: the counter is between them");
                if (s.Kind == "mart") { var (px, pz) = s.Pump; Assert.That(Math.Sqrt((px - cx) * (px - cx) + (pz - cz) * (pz - cz)), Is.EqualTo(11).Within(1e-6)); }
            }
            var city = shops.First(s => s.Id == "city");
            Assert.That(city.Keeper, Is.EqualTo("Walt Ferreira")); Assert.That(city.PriceK, Is.EqualTo(1.25));
        }

        [Test]
        public void Hours_menu_and_ammunition_follow_the_web_game()
        {
            Assert.That(ShopCatalog.Open("city", 8.9), Is.False); Assert.That(ShopCatalog.Open("city", 9), Is.True); Assert.That(ShopCatalog.Open("city", 19), Is.False);
            Assert.That(ShopCatalog.Open("m-city", 3), Is.True, "Gulf Marts never close");
            Assert.That(ShopCatalog.ClosedText("Calvera Arms Exchange", "city"), Is.EqualTo("Calvera Arms Exchange is closed. Open 9 AM – 7 PM."));
            Assert.That(ShopCatalog.Menu.Length, Is.EqualTo(13));
            Assert.That(ShopCatalog.Menu.First(f => f.Id == "poboy").Feeds, Is.EqualTo(45 * 0.9).Within(1e-9));
            Assert.That(ShopCatalog.Menu.First(f => f.Id == "coffee").Feeds, Is.EqualTo(4));
            Assert.That(ShopCatalog.Menu.First(f => f.Id == "firstaid").Feeds, Is.EqualTo(0));
            Assert.That(ShopCatalog.BoxFor("9mm").Box, Is.EqualTo(50)); Assert.That(ShopCatalog.Cap("9mm"), Is.EqualTo(500)); Assert.That(ShopCatalog.Cap("Arrow"), Is.EqualTo(20));
            Assert.That(ShopCatalog.Price(450, 1.25), Is.EqualTo(563)); Assert.That(ShopCatalog.Price(9, 1.2), Is.EqualTo(11));
            // every gun the shops sell takes a caliber the counter stocks
            foreach (var w in Arsenal.All.Where(w => !w.Melee && w.Id != "fists"))
                Assert.That(ShopCatalog.BoxFor(w.Caliber), Is.Not.Null, $"{w.Id}: {w.Caliber}");
        }

        static MissionData Data => data ??= MissionData.Load(MissionData.DefaultFile(TestFiles.ProjectRoot));
        static MissionData data;

        [Test]
        public void The_story_side_jobs_places_and_jobs_came_over()
        {
            Assert.That(Data.Story.Count, Is.EqualTo(63)); Assert.That(Data.Side.Count, Is.EqualTo(12)); Assert.That(Data.Jobs.Count, Is.GreaterThanOrEqualTo(27));
            Assert.That(Data.Story[1].Title, Is.EqualTo("Danny's Truck"));
            Assert.That(Data.Story[1].Steps[0].Kind, Is.EqualTo("steal")); Assert.That(Data.Story[1].Steps[0].Car, Is.EqualTo("pickup_03")); Assert.That(Data.Story[1].Steps[0].Place, Is.EqualTo("impound"));
            foreach (var m in Data.Story.Concat(Data.Side))
                foreach (var s in m.Steps.Where(s => s.Place != null))
                    Assert.That(Data.Places.ContainsKey(s.Place), $"{m.Id}: the place '{s.Place}' is known");
            Assert.That(Data.NextStory(new List<string>()).Id, Is.EqualTo("m01"));
            Assert.That(Data.NextStory(new List<string> { "m01" }).Id, Is.EqualTo("m02"));
            Assert.That(Data.OpenSide(new List<string> { "m01" }, new List<string>()).Count(), Is.EqualTo(0), "side jobs open after enough story");
            Assert.That(Data.OpenSide(new List<string> { "m01", "m02" }, new List<string>()).Select(m => m.Id), Does.Contain("s1"));
            Assert.That(Data.Jobs.Count(j => j.Supported), Is.GreaterThanOrEqualTo(20), "most jobs run without boats or aircraft");
            Assert.That(Data.CityPitch, Is.EqualTo(96));
        }

        sealed class World : IMissionWorld
        {
            public (double x, double z) MePos; public bool Foot = true, InCar, Wrecked; public double Speed, Money = 1000; public int Stars, Foes; public bool Dead;
            public (double x, double z)? CarAt; public List<string> Said = new List<string>(), Bigs = new List<string>(); public (double, double, double)? Marked;
            public (double x, double z) Place(string name) => Data.Place(name);
            public (double x, double z) Me => MePos;
            public bool OnFoot => Foot;
            public bool InMissionVehicle => InCar;
            public bool MissionVehicleWrecked => Wrecked;
            public (double x, double z)? MissionVehiclePos => CarAt;
            public double VehicleSpeed => Speed;
            public int Wanted => Stars;
            public int FoesLeft => Foes;
            public bool PlayerDead => Dead;
            public void Mark(double x, double z, double r) => Marked = (x, z, r);
            public void Unmark() => Marked = null;
            public void SpawnVehicle(string carId, double x, double z) => CarAt = (x + 3, z);
            public void SpawnFoes(int n, double x, double z) => Foes = n;
            public void RaiseWanted(int stars) => Stars = Math.Max(Stars, stars);
            public bool Spend(double amount) { if (Money < amount) return false; Money -= amount; return true; }
            public void Earn(double amount) => Money += amount;
            public void Say(string who, string line) => Said.Add(line);
            public void Big(string title, string sub) => Bigs.Add(title);
        }

        [Test]
        public void Dannys_truck_take_it_and_bring_it_home()
        {
            var w = new World(); var r = new MissionRunner(1);
            int paid = 0; r.Completed += (m, p) => paid = p;
            r.Begin(Data.Story[1], w);
            Assert.That(w.Bigs[0], Is.EqualTo("DANNY'S TRUCK"));
            Assert.That(w.CarAt, Is.Not.Null, "the pickup is parked at the impound");
            Assert.That(r.Update(0.1, w), Does.Contain("take the marked vehicle"));
            w.InCar = true; w.Foot = false;
            r.Update(0.1, w);
            Assert.That(r.Step, Is.EqualTo(1));
            var home = Data.Place("millcreek");
            w.MePos = home; w.Speed = 10;
            r.Update(0.1, w);
            Assert.That(r.Active, Is.Not.Null, "not delivered while it's still rolling");
            w.Speed = 0.5;
            r.Update(0.1, w);
            Assert.That(r.Active, Is.Null); Assert.That(paid, Is.EqualTo(800)); Assert.That(w.Money, Is.EqualTo(1800)); Assert.That(w.Bigs.Last(), Is.EqualTo("MISSION PASSED"));
        }

        [Test]
        public void Missions_fail_and_skip_as_the_web_game_does()
        {
            // wreck the car you were sent for
            var w = new World(); var r = new MissionRunner(1); string why = null; r.Failed += (m, s) => why = s;
            r.Begin(Data.Story[1], w); w.Wrecked = true; r.Update(0.1, w);
            Assert.That(why, Is.EqualTo("The vehicle was wrecked")); Assert.That(w.Bigs.Last(), Is.EqualTo("MISSION FAILED"));
            // the targets, then the police
            var m = new Mission { Id = "t", Title = "Test", Who = "Lupe", Steps = { new MissionStep { Kind = "kill", N = 3, Place = "downtown" }, new MissionStep { Kind = "escape", N = 2 }, new MissionStep { Kind = "survive", N = 5 }, new MissionStep { Kind = "boat", Place = "lakemid" }, new MissionStep { Kind = "talk" } }, Reward = 100 };
            w = new World(); r = new MissionRunner(1);
            r.Begin(m, w);
            Assert.That(w.Foes, Is.EqualTo(3)); Assert.That(r.Update(0.1, w), Does.Contain("3 left"));
            w.Foes = 0; r.Update(0.1, w);
            Assert.That(w.Stars, Is.EqualTo(2), "lose the police raises the stars first");
            w.Stars = 0; r.Update(1, w); Assert.That(r.Step, Is.EqualTo(1), "they have to stay lost for a moment"); r.Update(1.5, w);
            Assert.That(r.Step, Is.EqualTo(2));
            for (int i = 0; i < 6; i++) r.Update(1, w);
            Assert.That(r.Step, Is.EqualTo(3)); Assert.That(w.Said.Last(), Does.Contain("boat").And.Contain("skipped"));
            for (int i = 0; i < 4; i++) r.Update(1, w);
            Assert.That(r.Step, Is.EqualTo(4), "the unsupported step is skipped after a moment");
            for (int i = 0; i < 3; i++) r.Update(1, w);
            Assert.That(r.Active, Is.Null, "talked, done");
            // can't pay, and dying
            w = new World { Money = 10 }; r = new MissionRunner(1); why = null; r.Failed += (mm, s) => why = s;
            r.Begin(new Mission { Id = "p", Title = "Pay", Who = "Voss", Steps = { new MissionStep { Kind = "pay", N = 500 } } }, w);
            Assert.That(why, Is.EqualTo("Not enough money"));
            w = new World(); r = new MissionRunner(1); why = null; r.Failed += (mm, s) => why = s;
            r.Begin(Data.Story[0], w); w.Dead = true; r.Update(0.1, w);
            Assert.That(why, Is.EqualTo("You died"));
        }

        [Test]
        public void A_shift_pays_per_stop_with_a_time_bonus_and_levels_up()
        {
            var taxi = Data.Jobs.First(j => j.Id == "taxi");
            Assert.That(JobShift.PayBase(taxi, 1), Is.EqualTo(90)); Assert.That(JobShift.PayBase(taxi, 3), Is.EqualTo(90 * 1.3).Within(1e-9));
            var draws = JobShift.StopDraws(taxi, Data, new Random(3));
            Assert.That(draws.Count, Is.EqualTo(taxi.Stops)); Assert.That(draws.All(d => d.road));
            var shift = new JobShift(taxi, 1, draws.Select(d => (d.x, d.z)).ToList());
            double total = 0;
            for (int s = 0; s < taxi.Stops; s++)
            {
                Assert.That(shift.Update(1, 100, true), Is.EqualTo(0), "not there yet");
                total += shift.Update(1, 2, true);
            }
            Assert.That(shift.Over && shift.Ok, Is.True);
            double bonus = JobShift.TimeBonus(360, taxi.Timer - 2 * taxi.Stops, taxi.Timer);
            Assert.That(total, Is.EqualTo(360 + bonus)); Assert.That(bonus, Is.GreaterThan(0));
            Assert.That(JobShift.Progress(1, 1), Is.EqualTo((1, 2))); Assert.That(JobShift.Progress(1, 2), Is.EqualTo((2, 0)));
            var late = new JobShift(taxi, 1, draws.Select(d => (d.x, d.z)).ToList());
            late.Update(taxi.Timer + 1, 100, true);
            Assert.That(late.Over && !late.Ok, Is.True, "out of time");
            var medic = Data.Jobs.First(j => j.Id == "paramedic");
            Assert.That(JobShift.StopDraws(medic, Data, new Random(1)).Count, Is.EqualTo(medic.Stops + 1), "back to the hospital at the end");
        }
    }
}
