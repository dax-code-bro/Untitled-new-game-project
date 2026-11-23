// Property with the web game's rules (systems/estate.js, propertyplus.js). The fixture (Tools/CoreTests/fixtures/
// estate-parity.json) is the running web game's own list, read out of the browser: its world has moved on since the
// Unity export (the outskirts lots after building 343 changed), so it's compared where the two still agree.
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using NUnit.Framework;
using Southbound.Core;

namespace Southbound.Tests
{
    public class EstateTests
    {
        static CalveraWorld world; static MissionData data;
        static CalveraWorld W => world ??= CalveraWorld.Load(CalveraWorld.DefaultFolder(TestFiles.ProjectRoot));
        static MissionData L => data ??= MissionData.Load(MissionData.DefaultFile(TestFiles.ProjectRoot));
        const int Shared = 344;   // buildings 0..343 are the same in the Unity export and the web game today

        [Test]
        public void Doors_kinds_and_listings_match_the_browser()
        {
            var web = MiniJson.Parse(File.ReadAllText(TestFiles.Fixture("estate-parity.json"))) as Dictionary<string, object>;
            var doors = Estate.Doors(W);
            var kinds = web.Arr("kinds").Cast<string>().ToList(); var wdoors = web.Arr("doors").Cast<List<object>>().ToList();
            var basic = new HashSet<string> { "home", "apartment", "store", "bar", "office", "warehouse" };
            int checkedKinds = 0;
            for (int i = 0; i < Shared; i++)
            {
                Assert.That((doors[i].Nx, doors[i].Nz), Is.EqualTo(((double)wdoors[i][1], (double)wdoors[i][2])), $"building {i}: the door's on the same side");
                if (!basic.Contains(kinds[i])) continue;   // (a workplace the web game runs: the barber's, offices)
                Assert.That(Estate.Kind(doors[i]), Is.EqualTo(kinds[i]), $"building {i}"); checkedKinds++;
            }
            Assert.That(checkedKinds, Is.GreaterThan(300));
            var props = Estate.Properties(doors, L);
            // the same building lists the same: address, type, region, price (ids line up until the lists part ways)
            var webByBuilding = web.Arr("props").Cast<List<object>>().ToDictionary(x => (int)(double)x[1]);
            int same = 0, sameId = 0;
            foreach (var p in props.Where(x => x.Door.I < Shared))
            {
                if (!webByBuilding.TryGetValue(p.Door.I, out var wp)) continue;
                Assert.That(p.Name, Is.EqualTo((string)wp[3]), p.Id); Assert.That(p.Type, Is.EqualTo((string)wp[4])); Assert.That(p.Region, Is.EqualTo((string)wp[5]));
                Assert.That(Math.Abs(p.Price - (double)wp[2]), Is.LessThanOrEqualTo(Math.Max(1000, p.Price * 0.03)), p.Id + ": the price (a building trimmed a little differently since the export)");
                same++; if (p.Id == (string)wp[0]) sameId++;
            }
            Assert.That(sameId, Is.GreaterThanOrEqualTo(70), "prop_001 onwards carry over from a web save (until the lists part ways)"); Assert.That(same, Is.GreaterThan(150));
        }

        [Test]
        public void The_listings_hang_together()
        {
            var props = Estate.Properties(Estate.Doors(W), L);
            Assert.That(props.Count, Is.EqualTo(246));
            Assert.That(props.Take(198).All(p => !p.Door.B.Extra), "the original 198 first");
            Assert.That(props.Skip(198).All(p => p.Door.B.Extra && p.Region == "Calvera outskirts"));
            Assert.That(props.Select(p => p.Id), Is.EqualTo(Enumerable.Range(1, 246).Select(i => $"prop_{i:000}")));
            Assert.That(props.Select(p => p.Door.I).Distinct().Count(), Is.EqualTo(246));
            Assert.That(props.All(p => p.Price >= 18000 && p.Price % 1000 == 0));
            Assert.That(props.Count(p => p.Name.StartsWith("Lake Arden")), Is.GreaterThan(5), "cabins round the lake");
            Assert.That(props.Select(p => p.Type).Distinct(), Is.SupersetOf(new[] { "House", "Apartment", "Storefront" }));
            var realtor = Estate.RealtorDoor(Estate.Doors(W), L);
            Assert.That(realtor.B.Style, Is.EqualTo(5));
        }

        [Test]
        public void Owning_property_buying_selling_and_the_days_accounts()
        {
            var props = Estate.Properties(Estate.Doors(W), L);
            var p = Profile.New(); p.Money = 1e9;
            var house = props.First(x => x.Type == "House"); var flat = props.First(x => x.Type == "Apartment"); var shop = props.First(x => x.Type == "Storefront");
            Assert.That(Estate.Buy(p, house)); Assert.That(p.Home, Is.EqualTo(house.Id), "the first place is home");
            Assert.That(Estate.Buy(p, flat) && Estate.Buy(p, shop)); Assert.That(Estate.Buy(p, shop), Is.False, "you can't buy it twice");
            Assert.That(Estate.RentOf(p, house), Is.EqualTo(0), "no rent from your own home");
            Assert.That(Estate.RentOf(p, flat), Is.EqualTo(Math.Round(flat.Price * 0.005)));
            Estate.Ups(p, flat)["reno"] = true;
            Assert.That(Estate.Worth(p, flat), Is.EqualTo(Math.Round(flat.Price * 1.15)));
            double before = p.Money; p.Bank = 0;
            var (texts, _) = Estate.Settle(p, props, new Random(3));
            double tax = new[] { house, flat, shop }.Sum(x => Math.Round(Estate.Worth(p, x) * 0.0009));
            Assert.That(texts[0].from, Is.EqualTo("Calvera County"));
            Assert.That(p.Money, Is.EqualTo(before + Estate.RentOf(p, flat) + Math.Round(shop.Price * 0.012) - tax).Within(2600), "rent and income in, tax out (and maybe a burglary)");
            foreach (var t in props.Select(x => x.Type).Distinct()) Assert.That(Estate.Market(p, t), Is.InRange(0.75, 1.35));
            Assert.That(Estate.Sell(p, house), Is.EqualTo(0), "not your home");
            double v = Estate.Sell(p, flat);
            Assert.That(v, Is.EqualTo(Math.Round(Estate.Worth(Profile.New(), flat) * Estate.Market(p, flat.Type) * 1.15 * 0.94)).Within(1));
            Assert.That(p.Properties, Does.Not.Contain(flat.Id)); Assert.That(p.Section("propUp").ContainsKey(flat.Id), Is.False);
            var q = Profile.FromJson(p.ToJson());
            Assert.That(q.Properties, Is.EquivalentTo(new[] { house.Id, shop.Id })); Assert.That(q.Home, Is.EqualTo(house.Id));
            // doors: owned always open; a for-sale place open for viewings; most homes locked
            var homes = Estate.Doors(W).Where(d => Estate.Kind(d) == "home").ToList();
            double openShare = homes.Count(d => Estate.Open(d, 22, false, false)) / (double)homes.Count;
            Assert.That(openShare, Is.InRange(0.15, 0.45));
            Assert.That(Estate.Open(house.Door, 3, true, true)); Assert.That(Estate.Open(house.Door, 10, false, true));
        }
    }
}
