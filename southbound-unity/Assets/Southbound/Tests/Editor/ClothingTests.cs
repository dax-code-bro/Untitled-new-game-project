// Clothes and the barber with the web game's rules (entities/clothing.js, systems/details.js), and the outfit cut.
using System.Collections.Generic;
using System.Linq;
using NUnit.Framework;
using Southbound.Core;

namespace Southbound.Tests
{
    public class ClothingTests
    {
        static Style S(string slot, string id) => Clothing.SlotOf(slot).Styles.First(s => s.Id == id);

        [Test]
        public void The_catalogue_keys_names_and_prices_are_the_browser_s()
        {
            Assert.That(Clothing.CatalogSize, Is.EqualTo(13500), "the web game's 13,500 pieces");
            Assert.That(Clothing.Slots.Select(s => s.K), Is.EqualTo(new[] { "top", "outer", "bottom", "shoes", "hat", "eye", "neck", "gloves" }));
            var o = Clothing.DefaultOutfit();
            Assert.That(o["top"], Is.EqualTo("top:flannel:2:13"), "a brick red plaid flannel");
            Assert.That(Clothing.Name(o["top"]), Is.EqualTo("Flannel shirt · Plaid, Brick red"));
            Assert.That(Clothing.Price(o["top"]), Is.EqualTo(50), "42 x 1.2, to the nearest 5");
            Assert.That(Clothing.Name("eye:aviator:1:4"), Is.EqualTo("Aviators · Gold frame, smoke lens"));
            Assert.That(Clothing.Price("top:tank:4:0"), Is.EqualTo(15), "a faded tank top is cheaper (and never under $5)");
            Assert.That(Clothing.Price("hat:headwrap:0:0", 0.4), Is.EqualTo(5));
            Assert.That(Clothing.Parse("top:nope:0:0"), Is.Null); Assert.That(Clothing.Parse(null), Is.Null);
        }

        [Test]
        public void Buying_wearing_and_the_save()
        {
            var p = Profile.New(); p.Money = 1000;
            Assert.That(Clothing.Wardrobe(p).Count, Is.EqualTo(3), "you start with what you stand in");
            string tee = Clothing.Key("top", "tee", 0, 5);
            Assert.That(Clothing.Buy(p, tee)); Assert.That(p.Money, Is.EqualTo(1000 - 20));
            Assert.That(Clothing.Outfit(p)["top"], Is.EqualTo(tee), "on as you buy it");
            Assert.That(Clothing.Buy(p, tee)); Assert.That(p.Money, Is.EqualTo(980), "owning it already costs nothing");
            Clothing.Wear(p, "bottom", null);
            Assert.That(Clothing.Outfit(p)["bottom"], Is.Not.Null, "you can't go without trousers");
            Clothing.Buy(p, Clothing.Key("hat", "cowboy", 0, 10)); Clothing.Wear(p, "hat", null);
            Assert.That(Clothing.Outfit(p)["hat"], Is.Null, "a hat comes off");
            p.Money = 5; Assert.That(Clothing.Buy(p, Clothing.Key("outer", "leather", 0, 0)), Is.False);
            var q = Profile.FromJson(p.ToJson());
            Assert.That(Clothing.Wardrobe(q), Does.Contain(tee)); Assert.That(Clothing.Outfit(q)["top"], Is.EqualTo(tee));
            // the barber
            q.Money = 100; q.Day = 1; Clothing.Groom(q); q.Day = 10;
            Clothing.Grow(q); var g = Clothing.Groom(q);
            Assert.That(g.Num("beard"), Is.EqualTo(9), "nine days of stubble since day 1");
            Assert.That(Clothing.BeardDensity(q), Is.EqualTo(1));
            Assert.That(Clothing.Cut(q, "shave")); Assert.That(Clothing.Groom(q).Num("beard"), Is.EqualTo(0)); Assert.That(Clothing.Groom(q).Num("hair"), Is.EqualTo(9), "a shave leaves the hair");
            Assert.That(Clothing.Cut(q, "works")); Assert.That(q.Money, Is.EqualTo(100 - 15 - 35));
            Clothing.SetStyle(q, "dye", "blond");
            Assert.That(Clothing.StyleOf(Profile.FromJson(q.ToJson()), "dye"), Is.EqualTo("blond"));
            var L = MissionData.Load(MissionData.DefaultFile(TestFiles.ProjectRoot));
            Assert.That(Clothing.Barbers(L)[0], Is.EqualTo((260 + 2 * 96 + 14.0, 760 - 6.0, "Slick's Barbershop")));
        }

        [Test]
        public void The_suit_is_cut_into_the_outfit()
        {
            var flannel = S("top", "flannel"); var tee = S("top", "tee"); var tank = S("top", "tank"); var work = S("top", "work");
            var jeans = S("bottom", "jeans"); var shorts = S("bottom", "shorts");
            var leather = S("outer", "leather"); var puffer = S("outer", "puffer");
            // a forearm: covered by long sleeves, bare in a tee
            Assert.That(OutfitCut.Suit(0.5, 0.15, 0, flannel, null, jeans), Is.EqualTo(Cloth.Top));
            Assert.That(OutfitCut.Suit(0.5, 0.15, 0, tee, null, jeans), Is.EqualTo(Cloth.Skin));
            Assert.That(OutfitCut.Suit(0.3, 0.45, 0, tee, null, jeans), Is.EqualTo(Cloth.Top), "a tee's short sleeve");
            Assert.That(OutfitCut.Suit(0.3, 0.45, 0, tank, null, jeans), Is.EqualTo(Cloth.Skin), "a tank top's bare shoulder");
            // the chest under an open jacket, and beside the opening
            Assert.That(OutfitCut.Suit(0.0, 0.4, 0.1, work, leather, jeans), Is.EqualTo(Cloth.Top));
            Assert.That(OutfitCut.Suit(0.15, 0.4, 0.1, work, leather, jeans), Is.EqualTo(Cloth.Outer));
            Assert.That(OutfitCut.Suit(0.0, 0.4, -0.1, work, leather, jeans), Is.EqualTo(Cloth.Outer), "the back is all jacket");
            Assert.That(OutfitCut.Suit(0.45, 0.2, 0, tee, puffer, jeans), Is.EqualTo(Cloth.Skin), "a vest has no sleeves");
            // the hem: a tucked work shirt stops at the belt, an untucked flannel hangs over it
            Assert.That(OutfitCut.Suit(0.1, 0.02, 0.1, work, null, jeans), Is.EqualTo(Cloth.Bottom));
            Assert.That(OutfitCut.Suit(0.1, 0.02, 0.1, flannel, null, jeans), Is.EqualTo(Cloth.Top));
            // the legs: jeans to the ankle, shorts above the knee
            Assert.That(OutfitCut.Suit(0.1, -0.6, 0, flannel, null, jeans), Is.EqualTo(Cloth.Bottom));
            Assert.That(OutfitCut.Suit(0.1, -0.6, 0, flannel, null, shorts), Is.EqualTo(Cloth.Skin));
            Assert.That(OutfitCut.Suit(0.1, -0.2, 0, flannel, null, shorts), Is.EqualTo(Cloth.Bottom));
            Assert.That(OutfitCut.Hand(0.62, 0.08) && !OutfitCut.Hand(0.4, 0.2));
        }
    }
}
