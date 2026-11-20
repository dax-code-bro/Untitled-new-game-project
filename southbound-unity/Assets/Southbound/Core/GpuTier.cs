// How much Calvera this graphics card can draw. Laptops' built-in graphics (Intel UHD / Iris Xe, AMD
// "Radeon Graphics") get the Integrated tier: the expensive HDRP passes off (volumetric clouds and fog,
// screen-space GI and reflections, contact shadows), rendering at 50-80% resolution and upscaled, fewer
// people and cars, shorter grass, tree, shadow, light and decal distances. The tiers above add them back.
// The same idea as the web game's Low / Medium / High / Ultra (settings.js detectGPU), for Unity.
using System;
using System.Text.RegularExpressions;

namespace Southbound.Core
{
    public enum Tier { Integrated = 0, Medium = 1, High = 2, Ultra = 3 }

    public sealed class TierBudget
    {
        public Tier Tier;
        /// <summary>Render resolution range (share of the screen); dynamic resolution moves inside it to hold the frame rate.</summary>
        public float MinScale, MaxScale;
        /// <summary>Frames a second to hold before lowering the resolution.</summary>
        public float TargetFps;
        public float CrowdScale, TrafficScale;
        public float GrassDensity, GrassDistance, TreeDistance, TreeBillboard, TerrainPixelError;
        public float ShadowDistance; public int Cascades;
        public float LightDistance, DecalDistance, LodBias;
        public int RainParticles;
        public bool VolumetricClouds, VolumetricFog, Ssr, Ssgi, Ssao, ContactShadows, MotionBlur, FilmGrain, Subsurface, LensFlares;
    }

    public static class GpuTier
    {
        /// <summary>The tier for a graphics device by its name (SystemInfo.graphicsDeviceName) and memory in MB.</summary>
        public static Tier Classify(string name, int vramMb)
        {
            string n = (name ?? "").ToLowerInvariant();
            bool has(string pattern) => Regex.IsMatch(n, pattern);
            if (has(@"swiftshader|llvmpipe|software|basic render|microsoft basic")) return Tier.Integrated;
            // built into the processor: Intel (but not the Arc cards), AMD's APUs ("Radeon(TM) Graphics", Vega N)
            if (has(@"intel") && !has(@"\barc\b")) return Tier.Integrated;
            if (has(@"radeon\(tm\) graphics|radeon graphics|vega \d+ graphics|radeon \d{3}m\b|radeon 7[0-9]0m")) return Tier.Integrated;
            if (has(@"rtx\s*(5090|5080|4090|4080)|rx\s*(9070|79\d\d)")) return Tier.Ultra;
            if (has(@"rtx\s*(50|40)[6-7]0|rtx\s*30[6-9]0|rtx\s*20[6-8]0|rx\s*(78\d\d|77\d\d|76\d\d|69\d\d|68\d\d|67\d\d)|arc(\(tm\))?\s*a7[57]0|arc(\(tm\))?\s*b5[78]0")) return Tier.High;
            if (has(@"gtx|rtx|rx\s*\d{3,4}|arc|radeon pro|quadro")) return Tier.Medium;
            // unknown: go by memory (shared memory on integrated chips is reported small or not at all)
            return vramMb >= 6000 ? Tier.High : vramMb >= 3000 ? Tier.Medium : Tier.Integrated;
        }

        public static TierBudget Budget(Tier t) => t switch
        {
            Tier.Integrated => new TierBudget
            {
                Tier = t, MinScale = 0.5f, MaxScale = 0.8f, TargetFps = 30,
                CrowdScale = 0.35f, TrafficScale = 0.45f,
                GrassDensity = 0.2f, GrassDistance = 35, TreeDistance = 700, TreeBillboard = 70, TerrainPixelError = 8,
                ShadowDistance = 120, Cascades = 2, LightDistance = 70, DecalDistance = 45, LodBias = 0.6f, RainParticles = 3000,
            },
            Tier.Medium => new TierBudget
            {
                Tier = t, MinScale = 0.67f, MaxScale = 1f, TargetFps = 45,
                CrowdScale = 0.65f, TrafficScale = 0.7f,
                GrassDensity = 0.55f, GrassDistance = 60, TreeDistance = 1000, TreeBillboard = 110, TerrainPixelError = 4,
                ShadowDistance = 350, Cascades = 3, LightDistance = 130, DecalDistance = 80, LodBias = 1f, RainParticles = 8000,
                Ssao = true, ContactShadows = true, LensFlares = true, Subsurface = true,
            },
            Tier.High => new TierBudget
            {
                Tier = t, MinScale = 0.8f, MaxScale = 1f, TargetFps = 55,
                CrowdScale = 1f, TrafficScale = 1f,
                GrassDensity = 1f, GrassDistance = 90, TreeDistance = 1200, TreeBillboard = 160, TerrainPixelError = 2,
                ShadowDistance = 700, Cascades = 4, LightDistance = 220, DecalDistance = 110, LodBias = 1.4f, RainParticles = 14000,
                VolumetricClouds = true, VolumetricFog = true, Ssr = true, Ssao = true, ContactShadows = true, MotionBlur = true, FilmGrain = true, Subsurface = true, LensFlares = true,
            },
            _ => new TierBudget
            {
                Tier = Tier.Ultra, MinScale = 1f, MaxScale = 1f, TargetFps = 60,
                CrowdScale = 1f, TrafficScale = 1f,
                GrassDensity = 1f, GrassDistance = 120, TreeDistance = 1600, TreeBillboard = 220, TerrainPixelError = 1,
                ShadowDistance = 900, Cascades = 4, LightDistance = 300, DecalDistance = 160, LodBias = 2f, RainParticles = 20000,
                VolumetricClouds = true, VolumetricFog = true, Ssr = true, Ssgi = true, Ssao = true, ContactShadows = true, MotionBlur = true, FilmGrain = true, Subsurface = true, LensFlares = true,
            },
        };

        /// <summary>The next render scale for a measured frame time: down quickly when slow, up slowly when there's room.</summary>
        public static float NextScale(float scale, float frameMs, TierBudget b)
        {
            float budget = 1000f / b.TargetFps;
            if (frameMs > budget * 1.08f) scale -= 0.04f * Math.Min(3f, frameMs / budget);
            else if (frameMs < budget * 0.8f) scale += 0.01f;
            return Math.Max(b.MinScale, Math.Min(b.MaxScale, scale));
        }
    }
}
