// The photoreal look for Calvera in HDRP: turns on the pipeline features a modern open-world game
// leans on (volumetric clouds and fog, screen-space reflections and global illumination, decals,
// water, lens flares) and builds the scene's Volume: a physically based sky tuned for humid Gulf Coast
// air, automatic exposure, volumetric clouds, height fog with light shafts, SSR + SSGI + AO, contact
// and micro shadows, ACES with a light filmic grade, bloom, a little grain and vignette, a starry night
// sky, and a path tracer that photo mode switches on.
//
//   Southbound > Look > Make it photoreal      (also runs when the Calvera scene is built)
//
// HDRP is reached by name (Hdrp.cs) so this compiles without it; anything an HDRP version lacks is
// skipped with a note in the console.
using System.IO;
using UnityEditor;
using UnityEngine;

namespace Southbound.EditorTools
{
    public static class PhotoLook
    {
        public const string ProfilePath = Paths.Scenes + "/Calvera_Look.asset";
        const string StarsPath = Paths.Generated + "/NightSky_Stars.png";
        const string HD = "UnityEngine.Rendering.HighDefinition.";

        [MenuItem("Southbound/Look/Make it photoreal", priority = 45)]
        public static void ApplyToOpenScene()
        {
            Features();
            var profile = BuildProfile();
            var vol = Object.FindObjectsByType<Component>(FindObjectsSortMode.None);
            GameObject volumeGo = null;
            foreach (var c in vol) if (c != null && c.GetType().FullName == "UnityEngine.Rendering.Volume") { volumeGo = c.gameObject; break; }
            if (volumeGo == null) volumeGo = CreateVolume(profile);
            else Hdrp.SetMember(volumeGo.GetComponent(Hdrp.FindType("UnityEngine.Rendering.Volume")), "sharedProfile", profile);
            Debug.Log("Southbound: photoreal look applied (pipeline features, sky, clouds, fog, reflections, GI, grade). Press Play, or F10 in game for the path-traced photo mode on an RTX card.");
        }

        /// <summary>The HDRP asset's feature switches the look needs.</summary>
        public static void Features()
        {
            var asset = Hdrp.PipelineAsset();
            if (asset == null) { Debug.LogWarning("Southbound: no HDRP asset in use (run the HDRP Wizard's Fix All first). Features not changed."); return; }
            int n = Hdrp.SetPipelineFeatures(asset,
                ("supportVolumetrics", true), ("supportVolumetricClouds", true), ("supportWater", true), ("supportWaterDecals", true),
                ("supportSSR", true), ("supportSSRTransparent", true), ("supportSSAO", true), ("supportSSGI", true),
                ("supportDecals", true), ("supportDecalLayers", true), ("supportLightLayers", true), ("supportSubsurfaceScattering", true),
                ("supportMotionVectors", true), ("supportScreenSpaceLensFlare", true), ("supportDataDrivenLensFlare", true),
                ("supportTerrainHole", true), ("supportTransparentDepthPrepass", true), ("supportDitheringCrossFade", true));
            Debug.Log($"Southbound: {n} HDRP features switched on in {asset.name}.");
        }

        /// <summary>Puts a global Volume with the look in the open scene.</summary>
        public static GameObject CreateVolume(ScriptableObject profile = null)
        {
            profile ??= BuildProfile();
            var volType = Hdrp.FindType("UnityEngine.Rendering.Volume");
            if (volType == null || profile == null) return null;
            var go = new GameObject("Photoreal look (Volume)");
            var vol = go.AddComponent(volType);
            Hdrp.SetMember(vol, "isGlobal", true);
            Hdrp.SetMember(vol, "priority", 1f);
            Hdrp.SetMember(vol, "sharedProfile", profile);
            return go;
        }

        /// <summary>(Re)builds the look's Volume profile asset.</summary>
        public static ScriptableObject BuildProfile()
        {
            var profType = Hdrp.FindType("UnityEngine.Rendering.VolumeProfile");
            if (profType == null) { Debug.LogWarning("Southbound: VolumeProfile type not found (is HDRP installed?)."); return null; }
            Paths.Ensure(Paths.Scenes);
            AssetDatabase.DeleteAsset(ProfilePath);
            var p = ScriptableObject.CreateInstance(profType);
            AssetDatabase.CreateAsset(p, ProfilePath);

            // sky: physically based, a hazy humid Gulf atmosphere, stars at night
            Hdrp.Override(p, HD + "VisualEnvironment", ("skyType", 4), ("skyAmbientMode", "Dynamic"), ("windOrientation", 135f), ("windSpeed", 14f));
            var stars = StarTexture();
            Hdrp.Override(p, HD + "PhysicallyBasedSky",
                ("aerosolDensity", 0.035f),                         // ~3x the default haze: Gulf humidity
                ("aerosolTint", new Color(0.93f, 0.91f, 0.87f)),
                ("aerosolAnisotropy", 0.82f),
                ("groundTint", new Color(0.13f, 0.12f, 0.10f)),
                ("spaceEmissionTexture", stars),
                ("spaceEmissionMultiplier", stars != null ? 0.6f : 1f),
                ("updateMode", "Realtime"));
            // clouds: real volumetric cumulus, slow drift, their shadows on the ground
            Hdrp.Override(p, HD + "VolumetricClouds",
                ("enable", true), ("cloudPreset", "Cloudy"), ("shadows", true), ("shadowOpacity", 0.7f), ("shadowDistance", 6000f),
                ("numPrimarySteps", 64), ("numLightSteps", 6), ("ghostingReduction", true));
            // fog: kilometres of humid haze, denser near the ground, with light shafts
            Hdrp.Override(p, HD + "Fog",
                ("enabled", true), ("colorMode", "SkyColor"), ("meanFreePath", 1600f), ("baseHeight", 0f), ("maximumHeight", 220f),
                ("maxFogDistance", 9000f), ("enableVolumetricFog", true), ("albedo", new Color(0.94f, 0.95f, 0.97f)),
                ("anisotropy", 0.65f), ("depthExtent", 160f), ("multipleScatteringIntensity", 0.6f), ("globalLightProbeDimmer", 0.85f));
            // exposure: a camera that adapts like an eye, bright noon to moonlit streets
            Hdrp.Override(p, HD + "Exposure",
                ("mode", "AutomaticHistogram"), ("meteringMode", "CenterWeighted"), ("limitMin", -4f), ("limitMax", 15.5f),
                ("compensation", 0.2f), ("histogramPercentages", new Vector2(45f, 92f)),
                ("adaptationSpeedDarkToLight", 2.2f), ("adaptationSpeedLightToDark", 1.1f));
            // light bouncing: screen-space GI and reflections, ambient occlusion, contact and micro shadows
            Hdrp.Override(p, HD + "GlobalIllumination", ("enable", true));
            Hdrp.Override(p, HD + "ScreenSpaceReflection", ("enabled", true), ("enabledTransparent", true), ("usedAlgorithm", "PBRAccumulation"), ("reflectSky", true));
            Hdrp.Override(p, HD + "ScreenSpaceAmbientOcclusion", ("intensity", 1.25f), ("radius", 1.6f), ("directLightingStrength", 0.25f), ("specularOcclusion", 0.6f));
            Hdrp.Override(p, HD + "ContactShadows", ("enable", true), ("length", 0.22f), ("maxDistance", 60f), ("fadeDistance", 8f), ("opacity", 0.9f));
            Hdrp.Override(p, HD + "MicroShadowing", ("enable", true), ("opacity", 0.85f));
            Hdrp.Override(p, HD + "HDShadowSettings", ("maxShadowDistance", 900f), ("cascadeShadowSplitCount", 4));
            // the camera: ACES film response, a light filmic grade, bloom, a hint of grain, vignette and motion blur
            Hdrp.Override(p, HD + "Tonemapping", ("mode", "ACES"));
            Hdrp.Override(p, HD + "ColorAdjustments", ("contrast", 10f), ("saturation", 8f));
            Hdrp.Override(p, HD + "WhiteBalance", ("temperature", 5f), ("tint", 1f));
            Hdrp.Override(p, HD + "Bloom", ("intensity", 0.14f), ("scatter", 0.65f), ("threshold", 0f), ("anamorphic", true));
            Hdrp.Override(p, HD + "ScreenSpaceLensFlare", ("intensity", 0.35f), ("streaksIntensity", 0.4f), ("streaksLength", 0.4f));
            Hdrp.Override(p, HD + "FilmGrain", ("type", "Thin1"), ("intensity", 0.12f), ("response", 0.8f));
            Hdrp.Override(p, HD + "Vignette", ("intensity", 0.18f), ("smoothness", 0.45f));
            Hdrp.Override(p, HD + "ChromaticAberration", ("intensity", 0.04f));
            Hdrp.Override(p, HD + "MotionBlur", ("intensity", 0.3f), ("maximumVelocity", 140f));
            // photo mode: the path tracer, off until F10 turns it on (needs DirectX 12 and an RTX card)
            Hdrp.Override(p, HD + "PathTracing", ("enable", false), ("maximumSamples", 512), ("maximumDepth", 6), ("denoising", "OpenImageDenoise"));
            EditorUtility.SetDirty(p);
            AssetDatabase.SaveAssets();
            return p;
        }

        // ------------------------------------------------------------------ the night sky
        /// <summary>A starfield cubemap for the sky's space emission: ~9 000 stars by magnitude and a faint milky band.</summary>
        static Texture StarTexture()
        {
            if (!File.Exists(Paths.Abs(StarsPath)))
            {
                Paths.Ensure(Paths.Generated);
                const int face = 1024;
                var img = new Texture2D(face * 6, face, TextureFormat.RGB24, false, true);
                var px = new Color32[face * 6 * face];
                var stars = Core.NightSky.Stars(9000, 1987);
                foreach (var s in stars)
                {
                    var (f, u, v) = Core.NightSky.CubeFace(s.x, s.y, s.z);
                    int x = Mathf.Clamp((int)(u * face), 0, face - 1) + f * face, y = Mathf.Clamp((int)(v * face), 0, face - 1);
                    byte b = (byte)Mathf.Clamp(s.brightness * 255f, 8, 255);
                    var c = new Color32((byte)(b * s.r), (byte)(b * s.g), (byte)(b * s.b), 255);
                    px[y * face * 6 + x] = Max(px[y * face * 6 + x], c);
                }
                // the milky band: a faint glow along a great circle
                for (int f = 0; f < 6; f++)
                    for (int y = 0; y < face; y += 1)
                        for (int x = 0; x < face; x += 1)
                        {
                            var (dx, dy, dz) = Core.NightSky.FaceDirection(f, (x + 0.5) / face, (y + 0.5) / face);
                            double g = Core.NightSky.MilkyWay(dx, dy, dz);
                            if (g <= 0.002) continue;
                            int i = y * face * 6 + f * face + x;
                            byte add = (byte)Mathf.Clamp((float)(g * 34), 0, 34);
                            var o = px[i];
                            px[i] = new Color32((byte)Mathf.Min(255, o.r + add), (byte)Mathf.Min(255, o.g + add), (byte)Mathf.Min(255, o.b + add * 1.15f), 255);
                        }
                img.SetPixels32(px);
                File.WriteAllBytes(Paths.Abs(StarsPath), img.EncodeToPNG());
                Object.DestroyImmediate(img);
                AssetDatabase.ImportAsset(StarsPath);
            }
            var imp = AssetImporter.GetAtPath(StarsPath) as TextureImporter;
            if (imp != null && imp.textureShape != TextureImporterShape.TextureCube)
            {
                imp.textureShape = TextureImporterShape.TextureCube;
                imp.generateCubemap = TextureImporterGenerateCubemap.AutoCubemap;
                imp.sRGBTexture = false;
                imp.mipmapEnabled = false;
                imp.textureCompression = TextureImporterCompression.CompressedHQ;
                imp.SaveAndReimport();
            }
            return AssetDatabase.LoadAssetAtPath<Cubemap>(StarsPath);
        }

        static Color32 Max(Color32 a, Color32 b) => new Color32((byte)Mathf.Max(a.r, b.r), (byte)Mathf.Max(a.g, b.g), (byte)Mathf.Max(a.b, b.b), 255);
    }
}
