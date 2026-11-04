using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using NUnit.Framework;
using Southbound.Core;

namespace Southbound.Tests
{
    public class BallisticsTests
    {
        static readonly Ammo FMJ = Arsenal.AmmoTypes["FMJ"];

        [Test]
        public void NineMilGoesThroughDrywallButNotAStud()
        {
            var w = Arsenal.Get("pistol");
            Assert.AreEqual(1, w.Pen);
            var r = Ballistics.Fire(w, FMJ);
            Assert.IsTrue(Ballistics.TryPenetrate(r, "drywall", 0.12, stud: false, remaining: 50));
            Assert.AreEqual(0.78, r.Keep, 1e-12);
            Assert.IsFalse(Ballistics.TryPenetrate(Ballistics.Fire(w, FMJ), "drywall", 0.12, stud: true, remaining: 50));
        }

        [Test]
        public void RifleGoesThroughAStudAndLosesSomething()
        {
            var w = Arsenal.Get("rifle_01"); // carbine, 5.56
            Assert.AreEqual(3, w.Pen);
            var r = Ballistics.Fire(w, FMJ);
            Assert.IsTrue(Ballistics.TryPenetrate(r, "frame", 0.1, stud: true, remaining: 100));
            Assert.AreEqual(1, r.Pen);
            Assert.AreEqual(0.35, r.Keep, 1e-12);
            Assert.AreEqual(2, r.PenLoss);
        }

        [Test]
        public void BrickNeedsAFullPowerRifle()
        {
            Assert.IsFalse(Ballistics.TryPenetrate(Ballistics.Fire(Arsenal.Get("rifle_01"), FMJ), "brick", 0.23, false, 100));
            Assert.IsTrue(Ballistics.TryPenetrate(Ballistics.Fire(Arsenal.Get("rifle_02"), FMJ), "brick", 0.23, false, 100)); // battle rifle, 7.62
            Assert.IsTrue(Ballistics.TryPenetrate(Ballistics.Fire(Arsenal.Get("rifle_01"), Arsenal.AmmoTypes["Armor piercing"]), "brick", 0.23, false, 100));
        }

        [Test]
        public void SolidThingsStopEverything()
        {
            foreach (var s in new[] { "masonry", "stone", "steel", "tree", "floor" })
                Assert.IsFalse(Ballistics.TryPenetrate(new Round { Pen = 50 }, s, 0.01, false, 100), s);
            Assert.IsFalse(Ballistics.TryPenetrate(new Round { Pen = 50 }, "glass", 0.2, false, 100), "too thick");
            Assert.IsFalse(Ballistics.TryPenetrate(new Round { Pen = 5 }, "glass", 0.01, false, 0.05), "no range left");
        }

        [Test]
        public void AtMostThreeWalls()
        {
            var r = new Round { Pen = 5 };
            for (int i = 0; i < 3; i++) Assert.IsTrue(Ballistics.TryPenetrate(r, "glass", 0.01, false, 100));
            Assert.IsFalse(Ballistics.TryPenetrate(r, "glass", 0.01, false, 100));
        }

        [Test]
        public void StudsEvery16Inches()
        {
            // wall facing +Z: studs along X at multiples of 0.4064 m
            Assert.IsTrue(Ballistics.OverStud(0.4064 * 3, 5, 0, 1));
            Assert.IsTrue(Ballistics.OverStud(-0.4064 * 3 + 0.02, 5, 0, 1));
            Assert.IsFalse(Ballistics.OverStud(0.2032, 5, 0, 1));
            Assert.IsFalse(Ballistics.OverStud(1, 1, 0, 0), "floor or ceiling: no studs");
        }

        [Test]
        public void ArmourStopsWhatItIsRatedFor()
        {
            Func<double> never = () => 0.99, always = () => 0.0;
            Assert.IsTrue(Ballistics.ArmourStops(3, 3, never));
            Assert.IsFalse(Ballistics.ArmourStops(3, 4, always));
            Assert.IsTrue(Ballistics.ArmourStops(3.5, 4, always), "IIIA-style half level stops one more class sometimes");
            Assert.IsFalse(Ballistics.ArmourStops(3.5, 4, never));
            Assert.IsFalse(Ballistics.ArmourStops(0, 0, always));
        }

        [Test]
        public void WhereYouGetHit()
        {
            Assert.AreEqual(BodyPart.Head, Ballistics.Part(true, 1.7, 0));
            Assert.AreEqual(BodyPart.Leg, Ballistics.Part(false, 0.5, 0));
            Assert.AreEqual(BodyPart.Arm, Ballistics.Part(false, 1.2, 0.3));
            Assert.AreEqual(BodyPart.Torso, Ballistics.Part(false, 1.2, 0.1));
            var w = Arsenal.Get("pistol");
            double mid() => 0.5;
            var head = Ballistics.HitPerson(w, FMJ, null, 10, true, 1.7, 0, 0, 0, mid);
            var torso = Ballistics.HitPerson(w, FMJ, null, 10, false, 1.2, 0, 0, 0, mid);
            Assert.AreEqual(3, head.Damage / torso.Damage, 1e-9);
            var plated = Ballistics.HitPerson(w, FMJ, null, 10, false, 1.2, 0, 3, 0, mid);
            Assert.IsTrue(plated.Stopped);
            Assert.AreEqual(0.1, plated.Damage / torso.Damage, 1e-9);
        }

        [Test]
        public void ThroughAWallHitsSofter()
        {
            var w = Arsenal.Get("rifle_02");
            var r = Ballistics.Fire(w, FMJ);
            Ballistics.TryPenetrate(r, "drywall", 0.12, false, 100);
            double open = Ballistics.HitPerson(w, FMJ, null, 10, false, 1.2, 0, 0, 0, () => 0.5).Damage;
            double through = Ballistics.HitPerson(w, FMJ, r, 10, false, 1.2, 0, 0, 0, () => 0.5).Damage;
            Assert.AreEqual(0.78, through / open, 1e-9);
        }

        [Test]
        public void FalloffAndShotguns()
        {
            var w = Arsenal.Get("pistol");
            Assert.AreEqual(1, Ballistics.Falloff(w, w.Range * 0.4));
            Assert.AreEqual(0.5, Ballistics.Falloff(w, w.Range * 2));
            var pump = Arsenal.Get("shotgun_01");
            Assert.AreEqual(8, Ballistics.Pellets(pump, Arsenal.AmmoTypes["Buckshot"]));
            Assert.AreEqual(16, Ballistics.Pellets(pump, Arsenal.AmmoTypes["Birdshot"]));
            Assert.AreEqual(1, Ballistics.Pellets(pump, Arsenal.AmmoTypes["Slug"]));
            Assert.AreEqual(pump.Range * 2, Ballistics.Range(pump, Arsenal.AmmoTypes["Slug"]));
        }
    }

    public class NeedsTests
    {
        [Test]
        public void DrainsWithTheClock()
        {
            var n = new Needs();
            n.Drain(1, running: false);
            Assert.AreEqual(90 - 4.2, n.Energy, 1e-9);
            Assert.AreEqual(70 - 5.5, n.Food, 1e-9);
            n.Drain(1, running: true);
            Assert.AreEqual(90 - 4.2 - 4.2 * 1.6, n.Energy, 1e-9);
            var m = new Needs();
            m.Drain(60, false);
            Assert.AreEqual(90, m.Energy, "more than 48 h at once is a clock jump, not time passing");
        }

        [Test]
        public void EatingPastFullPutsOnWeight()
        {
            var n = new Needs { Food = 95 };
            n.Feed(25);
            Assert.AreEqual(110, n.Food);
            Assert.AreEqual(78 + 20 * 0.012, n.Weight, 1e-9);
        }

        [Test]
        public void StarvingLosesWeightAndHealth()
        {
            var n = new Needs { Food = 5 };
            n.Drain(10, false);
            Assert.AreEqual(0, n.Food);
            Assert.AreEqual(78 - 0.4, n.Weight, 1e-9);
            Assert.AreEqual(0.25, n.Tick(1, false, 0, 100), 1e-9);
            Assert.AreEqual("Starving", n.FoodWord);
        }

        [Test]
        public void SleepAndBody()
        {
            var n = new Needs { Energy = 10, Food = 50 };
            Assert.AreEqual(40, n.Sleep(8));
            Assert.AreEqual(100, n.Energy);
            Assert.AreEqual(30, n.Food);
            var thin = new Needs { Weight = 60 };
            Assert.AreEqual(85, thin.MaxHealth);
            Assert.AreEqual("60.0 kg (under)", thin.WeightText);
            Assert.Less(thin.BodyScale.x, 1);
        }

        [Test]
        public void TiredPeopleRunOutOfBreath()
        {
            var rested = new Needs();
            var tired = new Needs { Energy = 20 };
            for (int i = 0; i < 30; i++) { rested.Tick(0.1, true, 7, 100); tired.Tick(0.1, true, 7, 100); }
            Assert.Less(tired.Stamina, rested.Stamina);
            Assert.AreEqual(1.35, tired.SpreadMultiplier);
        }
    }

    public class RebuildTests
    {
        [Test]
        public void ThirtyHoursOfWork()
        {
            Assert.AreEqual(30, Rebuild.TotalHours);
            Assert.AreEqual("clear", Rebuild.At(0).Name);
            Assert.AreEqual("slab", Rebuild.At(5 / 30.0).Name);
            Assert.AreEqual("frame", Rebuild.At(10 / 30.0).Name);
            var done = Rebuild.At(1);
            Assert.AreEqual("siding", done.Name);
            Assert.AreEqual(1, done.F);
        }

        [Test]
        public void LayersGoUpInOrder()
        {
            var framing = Rebuild.At((3 + 4 + 4) / 30.0); // halfway through framing
            Assert.AreEqual(0.5 / 0.6, Rebuild.Layer(framing, "studs"), 1e-9);
            Assert.AreEqual(0, Rebuild.Layer(framing, "trusses"));
            Assert.AreEqual(0, Rebuild.Layer(framing, "sheets"));
            Assert.AreEqual(1, Rebuild.Layer(framing, "slab"));
            Assert.AreEqual(0, Rebuild.Layer(framing, "shell"));
            var end = Rebuild.At(1);
            foreach (var l in new[] { "studs", "headers", "plates", "trusses", "sheets", "decking", "shingles", "siding", "slab" })
                Assert.AreEqual(1, Rebuild.Layer(end, l), l);
        }
    }

    public class SaveTests
    {
        const string WebSave = @"{""v"":1,""created"":1730000000000,""saved"":1730000100000,""playSeconds"":5400,
            ""money"":12850,""bank"":3000,""hour"":21.25,""day"":4,""weather"":""rain"",""pos"":[-1210.5,388.2],
            ""weapons"":{""owned"":[""fists"",""pistol"",""rifle_02""],""ammo"":{""pistol"":34,""rifle_02"":120},
              ""mods"":{""rifle_02"":{""muzzle"":""muzzle_suppressor_2"",""optic"":""optic_4x-scope_1""},""owned"":[""muzzle_suppressor_2""]}},
            ""garage"":[{""uid"":1,""cat"":""car"",""type"":""rusty-pickup""}],""properties"":[""h12""],""home"":""h12"",
            ""tools"":{""lockpick"":2},""missions"":{""done"":[""m01"",""m02""],""active"":""m03""},
            ""needs"":{""energy"":40,""food"":22,""weight"":81.5},""ruins"":{""17"":{""t"":3}},
            ""stats"":{""kills"":3,""earned"":40000}}";

        [Test]
        public void ReadsTheWebSave()
        {
            var p = Profile.FromJson(WebSave);
            Assert.AreEqual(12850, p.Money);
            Assert.AreEqual(4, p.Day);
            Assert.AreEqual(21.25, p.Hour);
            CollectionAssert.AreEqual(new[] { -1210.5, 388.2 }, p.Pos);
            CollectionAssert.AreEqual(new[] { "fists", "pistol", "rifle_02" }, p.OwnedWeapons);
            Assert.AreEqual(120, p.Ammo["rifle_02"]);
            Assert.AreEqual("muzzle_suppressor_2", p.Fitted["rifle_02"]["muzzle"]);
            CollectionAssert.AreEqual(new[] { "muzzle_suppressor_2" }, p.OwnedAttachments);
            Assert.AreEqual(1, p.Garage);
            Assert.AreEqual(22, p.Needs.Food);
            Assert.IsTrue(p.Needs.Hungry);
            Assert.AreEqual(2, p.MissionsDone.Count);
            var gun = p.Loadout("rifle_02");
            Assert.IsTrue(gun.Silent);
            Assert.AreEqual(4, gun.Scope);
        }

        [Test]
        public void RoundTripKeepsEverything()
        {
            var p = Profile.FromJson(WebSave);
            p.Money += 500;
            p.Needs.Feed(30);
            var back = Profile.FromJson(p.ToJson());
            Assert.AreEqual(13350, back.Money);
            Assert.AreEqual(52, back.Needs.Food, 1e-9);
            Assert.AreEqual("m03", back.Raw.Obj("missions").Text("active"), "fields the C# side doesn't know survive");
            Assert.IsNotNull(back.Raw.Obj("ruins"));
            Assert.AreEqual("rusty-pickup", ((Dictionary<string, object>)back.Raw.Arr("garage")[0]).Text("type"));
            Assert.AreEqual("muzzle_suppressor_2", back.Fitted["rifle_02"]["muzzle"]);
        }

        [Test]
        public void NewProfileMatchesTheWebDefaults()
        {
            var p = Profile.New();
            Assert.AreEqual(150, p.Money);
            Assert.AreEqual(9.5, p.Hour);
            Assert.AreEqual(1, p.Day);
            Assert.IsNull(p.Pos);
        }

        [Test]
        public void RejectsOtherVersions() => Assert.Throws<FormatException>(() => Profile.FromJson("{\"v\":2}"));
    }

    public class JsonTests
    {
        [Test]
        public void ParsesAndWrites()
        {
            var o = (Dictionary<string, object>)MiniJson.Parse("{\"a\":[1,2.5,-3e2,true,null,\"x\\\"y\\u00e9\"],\"b\":{}}");
            var a = (List<object>)o["a"];
            Assert.AreEqual(-300.0, a[2]);
            Assert.AreEqual("x\"yé", a[5]);
            Assert.AreEqual("{\"a\":[1,2.5,-300,true,null,\"x\\\"yé\"],\"b\":{}}", MiniJson.Write(o));
        }
    }

    public class MaterialLibraryTests
    {
        [Test]
        public void TwentyNineSetsWithTheirSources()
        {
            Assert.AreEqual(29, MaterialLibrary.Sets.Length);
            Assert.AreEqual(TextureSource.CgBookcase, MaterialLibrary.Get("Cobblestone01").Source);
            Assert.AreEqual(TextureSource.PolyHaven, MaterialLibrary.Get("asphalt").Source);
            Assert.AreEqual(TextureSource.AmbientCG, MaterialLibrary.Get("road").Source);
            Assert.AreEqual("rusty-corrugated-metal-panel-01", MaterialLibrary.Get("RustyCorrugatedMetalPanel01").SourceId);
        }

        [TestCase("Rock030_4K-JPG_Color.jpg", "Color")]
        [TestCase("Rock030_4K-JPG_NormalGL.jpg", "Normal")]
        [TestCase("Rock030_4K-JPG_NormalDX.jpg", null)]
        [TestCase("Rock030_4K-JPG_Displacement.jpg", "Height")]
        [TestCase("Rock030_4K-JPG_AmbientOcclusion.jpg", "AO")]
        [TestCase("asphalt_02_diff_2k.jpg", "Color")]
        [TestCase("asphalt_02_nor_gl_2k.jpg", "Normal")]
        [TestCase("asphalt_02_nor_dx_2k.jpg", null)]
        [TestCase("asphalt_02_rough_2k.jpg", "Roughness")]
        [TestCase("Cobblestone01_2K_BaseColor.png", "Color")]
        [TestCase("Cobblestone01_2K_Metallic.png", "Metal")]
        [TestCase("Rock030.png", null)]
        public void KnowsEveryMapName(string file, string map) => Assert.AreEqual(map, MaterialLibrary.ClassifyFile(file));

        [Test]
        public void TheBundledSetsAreAllThere()
        {
            string dir = Path.Combine(TestFiles.ProjectRoot, "Assets", "Southbound", "Art", "Surfaces");
            foreach (var s in MaterialLibrary.Sets)
            {
                Assert.IsTrue(File.Exists(Path.Combine(dir, s.Name, s.Name + "_BaseColor.jpg")), s.Name);
                Assert.IsTrue(File.Exists(Path.Combine(dir, s.Name, s.Name + "_Mask.png")), s.Name);
            }
        }
    }

    public class WorldTests
    {
        static CalveraWorld world;
        static CalveraWorld World => world ??= CalveraWorld.Load(CalveraWorld.DefaultFolder(TestFiles.ProjectRoot));

        [Test]
        public void CalveraLoads()
        {
            Assert.AreEqual(1025, World.N);
            Assert.AreEqual(4096, World.Size);
            Assert.Greater(World.Buildings.Count, 300);
            Assert.Greater(World.Roads.Count, 50);
            Assert.Greater(World.Plants.Count, 1000);
            Assert.Less(World.HMin, 0, "the sea floor is below sea level");
            Assert.Greater(World.HMax, 50, "there are hills");
        }

        [Test]
        public void HeightsMatchTheWebGameWithin16BitPrecision()
        {
            double step = (World.HMax - World.HMin) / 65535.0;
            // the player spawns standing on the ground; buildings sit on it
            Assert.AreEqual(World.SpawnY, World.HeightAt(World.SpawnX, World.SpawnZ), 0.6);
            foreach (var p in World.Plants.Take(200)) Assert.AreEqual(p.Y + 0.15, World.HeightAt(p.X, p.Z), 0.05 + step, p.Kind);
        }

        [Test]
        public void UnityHeightsAreMirrored()
        {
            var h = World.UnityTerrainHeights();
            int n = World.N;
            Assert.AreEqual(n, h.GetLength(0));
            float range = (float)(World.HMax - World.HMin);
            // web cell (i, j) lands at Unity column n-1-i: same world point once X is mirrored
            int i = 300, j = 700;
            Assert.AreEqual((World.Heights[j * n + i] - World.HMin) / range, h[j, n - 1 - i], 1e-6);
            var (ux, uz) = CalveraWorld.ToUnity(-World.Half + i * World.Cell, -World.Half + j * World.Cell);
            Assert.AreEqual(-World.Half + (n - 1 - i) * World.Cell, ux, 1e-9);
            Assert.AreEqual(-World.Half + j * World.Cell, uz, 1e-9);
        }
    }
}
