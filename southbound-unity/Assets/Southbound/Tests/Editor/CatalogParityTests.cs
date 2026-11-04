// The C# arsenal must match the web game's, number for number. The fixture is
// dumped from the JS source by tools/southbound/export-unity.mjs catalog.
using System.Collections.Generic;
using System.IO;
using System.Linq;
using NUnit.Framework;
using Southbound.Core;

namespace Southbound.Tests
{
    public class CatalogParityTests
    {
        static Dictionary<string, object> fixture;
        static Dictionary<string, object> Fixture => fixture ??= (Dictionary<string, object>)MiniJson.Parse(File.ReadAllText(TestFiles.Fixture("catalog.json")));

        [Test]
        public void Mulberry32MatchesJavaScript()
        {
            var r = new Mulberry32(2026);
            Assert.AreEqual(0.45540769933722913, r.Next());
            Assert.AreEqual(0.30849614599719644, r.Next());
            Assert.AreEqual(0.6611574492417276, r.Next());
            Assert.AreEqual(0.6184752183035016, r.Next());
            Assert.AreEqual(0.15228010178543627, r.Next());
            var r2 = new Mulberry32(4294967295);
            Assert.AreEqual(0.8964226141106337, r2.Next());
            Assert.AreEqual(0.189478256739676, r2.Next());
        }

        [TestCase(0.2805, 0.281)]
        [TestCase(1.0005, 1.0)]
        [TestCase(0.1235, 0.123)]
        [TestCase(2.675, 2.675)]
        [TestCase(0.0645, 0.065)]
        [TestCase(1.3375, 1.337)]
        [TestCase(123.4565, 123.457)]
        [TestCase(0.0005, 0.001)]
        [TestCase(0.28198800000000007, 0.282)]
        public void ToFixedMatchesJavaScript(double x, double expected) => Assert.AreEqual(expected, JsMath.ToFixed(x, 3));

        [TestCase(0.5, 1)]
        [TestCase(1.5, 2)]
        [TestCase(2.5, 3)]
        [TestCase(-0.5, 0)]
        [TestCase(-1.5, -1)]
        [TestCase(0.49999999999999994, 0)]
        public void RoundMatchesJavaScript(double x, double expected) => Assert.AreEqual(expected, JsMath.Round(x));

        [Test]
        public void SameWeaponsInTheSameOrder()
        {
            var ids = ((List<object>)Fixture["weapons"]).Cast<Dictionary<string, object>>().Select(w => (string)w["id"]).ToList();
            CollectionAssert.AreEqual(ids, Arsenal.All.Select(w => w.Id).ToList());
            Assert.AreEqual(234, Arsenal.All.Count); // fists + 221 guns + the starter 9mm + 11 melee
        }

        [Test]
        public void EveryWeaponMatchesExactly()
        {
            int checkedFields = 0;
            foreach (Dictionary<string, object> js in (List<object>)Fixture["weapons"])
            {
                var w = Arsenal.Get((string)js["id"]);
                string id = w.Id;
                void Eq(string key, object actual)
                {
                    if (!js.TryGetValue(key, out var expected)) return;
                    checkedFields++;
                    if (expected is double d) Assert.AreEqual(d, System.Convert.ToDouble(actual), 0, $"{id}.{key}");
                    else Assert.AreEqual(expected, actual, $"{id}.{key}");
                }
                Eq("name", w.Name); Eq("cat", w.Cat); Eq("platform", w.Platform); Eq("icon", w.Icon);
                Eq("damage", w.Damage); Eq("rate", w.Rate); Eq("clip", w.Clip); Eq("range", w.Range);
                Eq("spread", w.Spread); Eq("recoil", w.Recoil); Eq("pellets", w.Pellets); Eq("explosive", w.Explosive);
                Eq("speed", w.Speed); Eq("silent", w.Silent); Eq("scope", w.Scope); Eq("price", w.Price);
                Eq("fireMode", w.FireMode); Eq("caliber", w.Caliber); Eq("pen", w.Pen); Eq("desc", w.Desc); Eq("unlock", w.Unlock);
                Eq("melee", w.Melee); Eq("len", w.Len); Eq("kind", w.Kind); Eq("modelKey", w.ModelKey);
                if (js.TryGetValue("finish", out var f))
                    CollectionAssert.AreEqual(((List<object>)f).Cast<double>().ToArray(), w.Finish, $"{id}.finish");
                if (js.TryGetValue("model", out var m))
                    foreach (var kv in (Dictionary<string, object>)m)
                    {
                        if (kv.Value is string melee) { Assert.AreEqual(melee, w.MeleeModel, $"{id}.model.melee"); continue; }
                        Assert.IsTrue(w.Model.TryGetValue(kv.Key, out var v), $"{id}.model.{kv.Key} missing");
                        Assert.AreEqual((double)kv.Value, v, 0, $"{id}.model.{kv.Key}");
                    }
            }
            Assert.Greater(checkedFields, 4000);
        }

        [Test]
        public void EveryAttachmentMatchesExactly()
        {
            var list = ((List<object>)Fixture["attachments"]).Cast<Dictionary<string, object>>().ToList();
            Assert.AreEqual(195, list.Count);
            Assert.AreEqual(list.Count, Arsenal.Attachments.Count);
            for (int i = 0; i < list.Count; i++)
            {
                var js = list[i];
                var a = Arsenal.Attachments[i];
                Assert.AreEqual(js["id"], a.Id);
                Assert.AreEqual(js["slot"], a.Slot);
                Assert.AreEqual(js["name"], a.Name);
                Assert.AreEqual((double)js["price"], a.Price, 0, a.Id);
                var mods = (Dictionary<string, object>)js["mods"];
                CollectionAssert.AreEquivalent(mods.Keys, a.Mods.Keys, a.Id);
                foreach (var kv in mods) Assert.AreEqual((double)kv.Value, a.Mods[kv.Key], 0, $"{a.Id}.{kv.Key}");
            }
        }

        [Test]
        public void CategoriesMatch()
        {
            var cats = ((List<object>)Fixture["categories"]).Cast<Dictionary<string, object>>().ToList();
            Assert.AreEqual(cats.Count, Arsenal.Categories.Count);
            for (int i = 0; i < cats.Count; i++)
            {
                Assert.AreEqual(cats[i]["k"], Arsenal.Categories[i].Key);
                Assert.AreEqual(cats[i]["label"], Arsenal.Categories[i].Label);
                CollectionAssert.AreEqual(((List<object>)cats[i]["ids"]).Cast<string>().ToList(), Arsenal.Categories[i].Ids);
            }
        }

        [Test]
        public void AttachmentsApplyLikeTheArsenalScreen()
        {
            var w = Arsenal.Get("rifle_01");
            var o = Arsenal.WithAttachments(w, new[] { "muzzle_suppressor_1", "mag_extended-mag_3", "optic_4x-scope_1" });
            Assert.IsTrue(o.Silent);
            Assert.AreEqual(JsMath.Round(w.Damage * 0.95), o.Damage);
            Assert.AreEqual(JsMath.Round(w.Clip * Arsenal.AttachmentById["mag_extended-mag_3"].Mods["clip"]), o.Clip);
            Assert.AreEqual(4, o.Scope);
            Assert.AreEqual(w.Damage, Arsenal.Get("rifle_01").Damage, "the catalog entry is not changed");
        }

        [Test]
        public void NoSciFi()
        {
            // a real-world game: every weapon is a real action type and calibre
            var real = new[] { "9mm", ".357", ".22", "5.56", "7.62", "4.6mm", "12 gauge", "84mm", "40mm", "Arrow", ".308", ".338", ".30-30", "cm" };
            foreach (var w in Arsenal.All.Where(x => x.Id != "fists"))
                Assert.IsTrue(real.Any(c => w.Caliber.Contains(c)), $"{w.Id} {w.Caliber}");
        }
    }
}
