// Hunting with the web game's rules (systems/hunting.js, systems/wilds.js).
using System;
using System.Linq;
using NUnit.Framework;
using Southbound.Core;

namespace Southbound.Tests
{
    public class HuntingTests
    {
        sealed class Field : ICraftGround { public double Height(double x, double z) => 10; public double Water(double x, double z) => x > 500 ? 12 : 0; }

        [Test]
        public void The_animals_and_legends_came_over()
        {
            Assert.That(Hunting.All.Count, Is.EqualTo(10));
            Assert.That(Hunting.All.Values.Count(s => s.Legend), Is.EqualTo(3));
            var pale = Hunting.All["paleBuck"];
            Assert.That(pale.Base, Is.EqualTo("stag")); Assert.That(pale.Speed, Is.EqualTo(11)); Assert.That(pale.Pelt, Is.EqualTo(900)); Assert.That(pale.Regions, Is.EqualTo(new[] { "Pinewood Hollow" }));
            Assert.That(Hunting.All["oldScar"].Aggro, Is.EqualTo(0.95)); Assert.That(Hunting.All["ember"].Aggro, Is.EqualTo(0));
            Assert.That(Hunting.Phase(6), Is.EqualTo("dusk")); Assert.That(Hunting.Phase(12), Is.EqualTo("day")); Assert.That(Hunting.Phase(23), Is.EqualTo("night"));
            var rnd = new Random(3);
            var plains = Enumerable.Range(0, 400).Select(_ => Hunting.Pick("Redgrass Plains", "dusk", rnd)).ToList();
            Assert.That(plains.Distinct(), Is.SubsetOf(new[] { "deer", "stag", "coyote", "horse", "cow", "bull" }));
            Assert.That(plains.Count(s => s == "deer"), Is.GreaterThan(plains.Count(s => s == "coyote")), "deer are about at dusk");
            Assert.That(Hunting.Pick("Port Calvera", "day", rnd), Is.Null, "nothing to hunt downtown");
            Assert.That(Hunting.LegendChance(pale, "dusk"), Is.EqualTo(0.35)); Assert.That(Hunting.LegendChance(pale, "night"), Is.EqualTo(0.08));
        }

        [Test]
        public void They_hear_you_smell_you_and_run()
        {
            var g = new Field(); var rnd = new Random(1);
            var deer = new Animal("deer", 0, 0, g, rnd);
            deer.Update(0.1, 0, 120, 1, null, g, true);
            Assert.That(deer.Mode, Is.Not.EqualTo("flee"), "120 m off and quiet: it grazes");
            deer.Update(0.1, 0, 60, 1, null, g, true);
            Assert.That(deer.Mode, Is.EqualTo("flee"), "inside 70 m it hears you");
            for (int i = 0; i < 30; i++) deer.Update(0.1, 0, 60, 1, null, g, true);
            Assert.That(deer.Z, Is.LessThan(-5), "and runs away from you");
            // downwind of an animal, it smells you from further; upwind, walking softly, you get closer
            var a = new Animal("stag", 0, 0, g, rnd); var wind = new Wind(1) { X = 0, Z = 1, Kmh = 20 };   // blowing toward +z (from you to it, you at -z)
            a.Update(0.1, 0, -100, 1, wind.K, g, true);
            Assert.That(a.Mode, Is.EqualTo("flee"), "the wind carries your scent 100 m");
            var b = new Animal("stag", 0, 0, g, rnd);
            b.Update(0.1, 0, 60, 0.55, wind.K, g, true);
            Assert.That(b.Mode, Is.Not.EqualTo("flee"), "upwind and quiet at 60 m");
            // water stops them
            var c = new Animal("deer", 498, 0, g, rnd) { Heading = Math.PI / 2, Mode = "flee", T = 10 };
            for (int i = 0; i < 20; i++) c.Update(0.05, 400, 0, 1, null, g, true);
            Assert.That(c.X, Is.LessThan(500.5));
        }

        [Test]
        public void A_coyote_can_charge_and_bite()
        {
            var g = new Field(); int bites = 0;
            for (int seed = 0; seed < 40; seed++)
            {
                var y = new Animal("coyote", 0, 0, g, new Random(seed)) { Mode = "charge", T = 6 };
                for (int i = 0; i < 100; i++) { y.Update(0.05, 0, 1.2, 1, null, g, true); if (y.Bit > 0) { bites++; Assert.That(y.Bit, Is.EqualTo(8)); break; } }
            }
            Assert.That(bites, Is.EqualTo(40), "a charging coyote at your heels bites");
            var z = new Animal("coyote", 0, 0, g, new Random(2)) { Mode = "charge", T = 6 };
            for (int i = 0; i < 100; i++) { z.Update(0.05, 0, 1.2, 1, null, g, false); Assert.That(z.Bit, Is.EqualTo(0), "not through a car door"); }
        }

        [Test]
        public void The_pelt_is_graded_by_the_kill_and_a_wounded_animal_bleeds_out()
        {
            var g = new Field(); var rnd = new Random(4);
            var clean = new Animal("deer", 0, 0, g, rnd);
            Assert.That(clean.Hurt(60, false), Is.True); Assert.That(clean.QualityGrade, Is.EqualTo(3), "one clean shot: perfect");
            var blasted = new Animal("deer", 0, 0, g, rnd);
            blasted.Hurt(250, false); Assert.That(blasted.QualityGrade, Is.EqualTo(1), "too big a gun: poor");
            var twice = new Animal("stag", 0, 0, g, rnd);
            twice.Hurt(30, false); Assert.That(twice.Bleed, Is.True); twice.Hurt(50, false); Assert.That(twice.QualityGrade, Is.EqualTo(2));
            var knifed = new Animal("fox", 0, 0, g, rnd); knifed.Hurt(5, true); knifed.Hurt(5, true); knifed.Hurt(15, true); Assert.That(knifed.QualityGrade, Is.EqualTo(3), "a blade keeps it perfect");
            // wounded, it runs, leaves a trail and lies down within about a minute
            var hit = new Animal("deer", 0, 0, g, rnd);
            hit.Hurt(20, false);
            int drips = 0; double t = 0;
            while (!hit.Dead && t < 120) { hit.Update(0.1, 0, 50, 1, null, g, true); if (hit.Drip) drips++; t += 0.1; }
            Assert.That(hit.Dead, Is.True); Assert.That(t, Is.InRange(30, 75)); Assert.That(drips, Is.GreaterThan(20), "a blood trail to follow");
        }

        [Test]
        public void Skinning_pelts_meat_the_licence_and_the_posts()
        {
            var g = new Field(); var rnd = new Random(5); var p = Profile.New();
            Assert.That(Hunting.Licensed(p), Is.False);
            var stag = new Animal("stag", 0, 0, g, rnd); stag.Hurt(80, false);
            double lb = Hunting.Skin(p, stag, rnd);
            Assert.That(lb, Is.InRange(56, 84));
            Assert.That(p.Section("pelts").Num("stag"), Is.EqualTo(1)); Assert.That(Hunting.PeltValue(p, "stag"), Is.EqualTo(200), "perfect: 160 x 1.25");
            Assert.That(p.Stat("animals"), Is.EqualTo(1)); Assert.That(Hunting.MeatLb(p), Is.EqualTo(lb));
            var fox = new Animal("fox", 0, 0, g, rnd); fox.Hurt(30, false); fox.Hurt(30, false);
            Assert.That(Hunting.Skin(p, fox, rnd), Is.EqualTo(0), "no meat off a fox");
            var legend = new Animal("ember", 0, 0, g, rnd); legend.Hurt(60, false);
            Hunting.Skin(p, legend, rnd);
            Assert.That(Hunting.Taken(p, "ember"));
            Hunting.License(p);
            var q = Profile.FromJson(p.ToJson());
            Assert.That(Hunting.Licensed(q) && Hunting.Taken(q, "ember")); Assert.That(q.Stat("animals"), Is.EqualTo(3)); Assert.That(Hunting.PeltValue(q, "stag"), Is.EqualTo(200));
            // an older save that kept a count only: priced as "good"
            var old = Profile.FromJson("{\"v\":1,\"pelts\":{\"coyote\":2}}");
            Assert.That(Hunting.PeltValue(old, "coyote"), Is.EqualTo(96));
            var L = MissionData.Load(MissionData.DefaultFile(TestFiles.ProjectRoot));
            var posts = Hunting.Posts(L);
            Assert.That(posts[0], Is.EqualTo((1150 - 120.0, -700 + 60.0, "Redgrass Trading Post")));
            Assert.That(Regions.At(posts[0].x, posts[0].z, L), Is.EqualTo("Redgrass Plains"));
            Assert.That(Regions.At(posts[2].x, posts[2].z, L), Is.EqualTo("Pinewood Hollow"));
        }
    }
}
