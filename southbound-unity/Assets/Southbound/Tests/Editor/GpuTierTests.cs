// Graphics tiers: built-in laptop graphics get the light tier, gaming cards the heavier ones, and a higher
// tier never draws less than a lower one.
using System;
using NUnit.Framework;
using Southbound.Core;

namespace Southbound.Tests
{
    public class GpuTierTests
    {
        [TestCase("Intel(R) UHD Graphics 620", 128, Tier.Integrated)]
        [TestCase("Intel(R) Iris(R) Xe Graphics", 128, Tier.Integrated)]
        [TestCase("Intel(R) HD Graphics 520", 0, Tier.Integrated)]
        [TestCase("AMD Radeon(TM) Graphics", 512, Tier.Integrated)]
        [TestCase("AMD Radeon Vega 8 Graphics", 512, Tier.Integrated)]
        [TestCase("Microsoft Basic Render Driver", 0, Tier.Integrated)]
        [TestCase("Intel(R) Arc(TM) A770 Graphics", 16000, Tier.High)]
        [TestCase("NVIDIA GeForce GTX 1650", 4096, Tier.Medium)]
        [TestCase("NVIDIA GeForce RTX 3060 Laptop GPU", 6144, Tier.High)]
        [TestCase("NVIDIA GeForce RTX 4090", 24564, Tier.Ultra)]
        [TestCase("AMD Radeon RX 7900 XTX", 24560, Tier.Ultra)]
        [TestCase("AMD Radeon RX 6700 XT", 12272, Tier.High)]
        [TestCase("Some New GPU 9000", 12000, Tier.High)]
        [TestCase("Some Old GPU", 1024, Tier.Integrated)]
        public void Graphics_cards_get_their_tier(string name, int vram, Tier expected) => Assert.That(GpuTier.Classify(name, vram), Is.EqualTo(expected));

        [Test]
        public void Higher_tiers_never_draw_less()
        {
            for (int t = 1; t <= 3; t++)
            {
                var lo = GpuTier.Budget((Tier)(t - 1)); var hi = GpuTier.Budget((Tier)t);
                Assert.That(hi.MaxScale, Is.GreaterThanOrEqualTo(lo.MaxScale));
                Assert.That(hi.MinScale, Is.GreaterThanOrEqualTo(lo.MinScale));
                Assert.That(hi.CrowdScale, Is.GreaterThanOrEqualTo(lo.CrowdScale));
                Assert.That(hi.GrassDistance, Is.GreaterThan(lo.GrassDistance));
                Assert.That(hi.ShadowDistance, Is.GreaterThan(lo.ShadowDistance));
                Assert.That(hi.LightDistance, Is.GreaterThan(lo.LightDistance));
                foreach (var f in new Func<TierBudget, bool>[] { b => b.VolumetricClouds, b => b.VolumetricFog, b => b.Ssr, b => b.Ssgi, b => b.Ssao, b => b.ContactShadows })
                    Assert.That(!f(lo) || f(hi), "a pass on at a lower tier stays on above it");
            }
            var ig = GpuTier.Budget(Tier.Integrated);
            Assert.That(ig.VolumetricClouds || ig.VolumetricFog || ig.Ssgi || ig.Ssr, Is.False, "built-in graphics skip the heavy passes");
            Assert.That(ig.MaxScale, Is.LessThan(1), "and render below full resolution, upscaled");
        }

        [Test]
        public void Resolution_follows_the_frame_time()
        {
            var b = GpuTier.Budget(Tier.Integrated);
            float s = b.MaxScale;
            for (int i = 0; i < 100; i++) s = GpuTier.NextScale(s, 60, b);   // 60 ms frames: far too slow
            Assert.That(s, Is.EqualTo(b.MinScale), "drops to the floor when it can't keep up");
            for (int i = 0; i < 100; i++) s = GpuTier.NextScale(s, 15, b);   // plenty of room
            Assert.That(s, Is.EqualTo(b.MaxScale));
            float steady = GpuTier.NextScale(0.65f, 1000f / b.TargetFps, b);
            Assert.That(steady, Is.EqualTo(0.65f).Within(1e-6), "holds still on target");
        }
    }
}
