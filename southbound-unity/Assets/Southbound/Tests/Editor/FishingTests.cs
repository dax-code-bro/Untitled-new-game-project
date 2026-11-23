// Fishing and the tools, with the web game's rules (systems/fishing.js, systems/tools.js).
using System;
using System.Collections.Generic;
using System.Linq;
using NUnit.Framework;
using Southbound.Core;

namespace Southbound.Tests
{
    public class FishingTests
    {
        static CalveraWorld world; static MissionData data;
        static CalveraWorld W => world ??= CalveraWorld.Load(CalveraWorld.DefaultFolder(TestFiles.ProjectRoot));
        static MissionData L => data ??= MissionData.Load(MissionData.DefaultFile(TestFiles.ProjectRoot));

        [Test]
        public void The_tools_came_over_with_the_web_game_s_ids()
        {
            Assert.That(Tools.All.Count, Is.EqualTo(245));
            Assert.That(Tools.All.Select(t => t.Id).Distinct().Count(), Is.EqualTo(245), "ids are unique");
            Assert.That(Tools.Get("fishing_earthworms-24-").Fx["bait"], Is.EqualTo(24), "ids keep the web game's slugs (trailing dash and all)");
            Assert.That(Tools.Get("fishing_deep-sea-rod-elite").Price, Is.EqualTo(60 * 5 * 9)); Assert.That(Tools.Get("fishing_deep-sea-rod-elite").Fx["rod"], Is.EqualTo(15));
            Assert.That(Tools.Get("hunting_electronic-caller").Tags["call"], Is.EqualTo("any"));
            Assert.That(Tools.Trades.Select(t => Tools.All.Count(x => x.Trade == t)).Sum(), Is.EqualTo(245));
            var p = Profile.New();
            Assert.That(Tools.Best(p.Tools, "rod"), Is.EqualTo(0));
            p.AddTool(Tools.Get("fishing_spinning-rod-pro")); p.AddTool(Tools.Get("fishing_fly-rod-basic")); p.AddTool(Tools.Get("fishing_live-shrimp-12-"));
            Assert.That(Tools.Best(p.Tools, "rod"), Is.EqualTo(7), "the best rod you own");
            Assert.That(p.BaitCount, Is.EqualTo(12));
            p.AddTool(Tools.Get("hunting_predator-call"));
            Assert.That(Tools.Call(p.Tools), Is.EqualTo("coyote"));
            Assert.That(p.UseTool("hunting_predator-call") && !p.UseTool("hunting_predator-call"), "used up");
            var q = Profile.FromJson(p.ToJson());
            Assert.That(q.BaitCount, Is.EqualTo(12)); Assert.That(Tools.Best(q.Tools, "rod"), Is.EqualTo(7));
            var stores = Tools.Stores(L);
            Assert.That(stores.Select(s => s.name), Is.EqualTo(new[] { "Calvera Hardware", "Mill Creek Feed & Hardware", "Bayou Outfitters (hunting)" }));
            Assert.That(stores[1].z, Is.EqualTo(-360 + 3 * 72 + 18));
        }

        [Test]
        public void The_water_decides_what_bites()
        {
            Assert.That(Fishing.WaterKind(L.LakeX, L.LakeZ, L, W), Is.EqualTo("lake"));
            Assert.That(Fishing.WaterKind(L.BayouX, L.BayouZ, L, W), Is.EqualTo("bayou"));
            var hw = L.Place("harborwater");
            Assert.That(Fishing.WaterKind(hw.x, hw.z, L, W), Is.EqualTo("ocean"));
            Assert.That(Fishing.WaterKind(-120, 200, L, W), Is.EqualTo("river"), "the Calvera River runs past here");
            Assert.That(Regions.At(L.DowntownX, L.DowntownZ, L), Is.EqualTo("Port Calvera"));
            Assert.That(Regions.At(L.LakeX, L.LakeZ, L), Is.EqualTo("Lake Arden"));
            Assert.That(Regions.At(L.PlainsX, L.PlainsZ, L), Is.EqualTo("Redgrass Plains"));
            Assert.That(Fishing.SpeciesCount, Is.EqualTo(21));
            Assert.That(Fishing.BiteMul(6.5, 0, "clear", "lake", 0), Is.EqualTo(0.6), "dawn");
            Assert.That(Fishing.BiteMul(13, 0, "clear", "lake", 0), Is.EqualTo(1.3), "midday");
            Assert.That(Fishing.BiteMul(23, 0.5, "rain", "ocean", 0), Is.EqualTo(1.1 * 0.75).Within(1e-12), "night on the Gulf, in the rain");
            Assert.That(Fishing.BiteMul(10, 1, "storm", "river", 200), Is.EqualTo(1 * 0.75 * 1.4 * 0.7).Within(1e-12), "a storm, and experience caps at 30% quicker");
        }

        [Test]
        public void A_cast_bites_fights_and_lands()
        {
            var rnd = new Random(5);
            var legends = new List<string>();
            // ignore the bite and it gets away
            var line = new FishingLine("lake", 1, false, 1, 12, legends, rnd);
            Assert.That(line.T, Is.InRange(6 / 1.05, 20 / 1.05));
            while (line.State == FishingLine.Phase.Wait) line.Update(0.1, false, false);
            Assert.That(line.State, Is.EqualTo(FishingLine.Phase.Bite));
            for (int i = 0; i < 20; i++) line.Update(0.1, false, false);
            Assert.That(line.State, Is.EqualTo(FishingLine.Phase.GotAway));
            // strike, and reel with breaks so the line holds: a lake fish comes in
            int caught = 0, snapped = 0;
            for (int n = 0; n < 40; n++)
            {
                line = new FishingLine("lake", 3, true, 1, 12, legends, rnd);
                while (line.State == FishingLine.Phase.Wait) line.Update(0.1, false, false);
                line.Update(0.05, true, false);
                Assert.That(line.State, Is.EqualTo(FishingLine.Phase.Reel));
                Assert.That(Fishing.Waters["lake"].Select(f => f.Name).Concat(new[] { Fishing.Legends["lake"].Name }), Does.Contain(line.Fish.Name));
                for (int i = 0; i < 4000 && !line.Over; i++) line.Update(0.05, false, line.Tension < 0.6);
                if (line.State == FishingLine.Phase.Caught) caught++; else if (line.State == FishingLine.Phase.Snapped) snapped++;
            }
            Assert.That(caught, Is.EqualTo(40), "easing off before the line's too tight lands every lake fish");
            // holding on regardless against a big fish snaps the line
            var big = new FishingLine("ocean", 0, false, 1, 12, legends, new Random(9));
            while (big.State == FishingLine.Phase.Wait) big.Update(0.1, false, false);
            big.Update(0.05, true, false);
            for (int i = 0; i < 4000 && !big.Over; i++) big.Update(0.05, false, true);
            Assert.That(big.State, Is.AnyOf(FishingLine.Phase.Snapped, FishingLine.Phase.Caught));
        }

        [Test]
        public void The_catch_goes_on_ice_and_in_the_log()
        {
            var p = Profile.New(); p.Day = 3;
            var bass = new Fishing.Hooked { Name = "Largemouth bass", Lb = 4, Price = 6, Min = 1.8 };
            Assert.That(FishStore.Land(p, bass, 3), Is.EqualTo("caught"));
            Assert.That(FishStore.Land(p, new Fishing.Hooked { Name = "Largemouth bass", Lb = 6, Price = 6, Min = 1.8 }, 4), Is.EqualTo("record"));
            Assert.That(FishStore.Land(p, new Fishing.Hooked { Name = "Bluegill", Lb = 0.25, Price = 4, Min = 0.3 }, 4), Is.EqualTo("released"), "under the size limit");
            Assert.That(p.Stat("fishCaught"), Is.EqualTo(3), "a released fish still counts as caught");
            var lot = p.Section("fish").Obj("Largemouth bass");
            Assert.That(lot.Num("n"), Is.EqualTo(2)); Assert.That(lot.Num("lb"), Is.EqualTo(10)); Assert.That(lot.Num("day"), Is.EqualTo(3), "as old as its oldest fish");
            Assert.That(p.Section("fish").Obj("Bluegill"), Is.Null);
            Assert.That(FishStore.Worth(lot, 4), Is.EqualTo(60)); Assert.That(FishStore.Worth(lot, 5), Is.EqualTo(30), "two days old: half price");
            var legend = Fishing.Legends["lake"];
            Assert.That(FishStore.Land(p, new Fishing.Hooked { Name = legend.Name, Lb = 15, Price = legend.Price, Legend = legend.Id }, 5), Is.EqualTo("legend"));
            Assert.That(FishStore.LegendsCaught(p), Does.Contain("mossback"));
            Assert.That(p.Section("fish").Obj(legend.Name).Num("price"), Is.EqualTo(120), "a legend fetches three times its price");
            var q = Profile.FromJson(p.ToJson());
            Assert.That(q.Section("fishLog").Obj("Largemouth bass").Num("best"), Is.EqualTo(6)); Assert.That(FishStore.LegendsCaught(q), Does.Contain("mossback"));
            // with mossback caught, the lake's legend doesn't bite again
            var r = new Random(1);
            for (int i = 0; i < 3000; i++) Assert.That(Fishing.Hook("lake", 15, 6.5, FishStore.LegendsCaught(q), r).Legend, Is.Null);
            int seen = 0; for (int i = 0; i < 3000; i++) if (Fishing.Hook("lake", 15, 6.5, new List<string>(), r).Legend != null) seen++;
            Assert.That(seen, Is.InRange(40, 200), "about one bite in 27 at dawn on a serious rod");
            Assert.That(Enumerable.Range(0, 2000).Count(_ => Fishing.Hook("lake", 1, 6.5, new List<string>(), r).Legend != null), Is.EqualTo(0), "never on a basic rod");
        }
    }
}
