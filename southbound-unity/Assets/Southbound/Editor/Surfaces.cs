// Southbound's 29 photo-scanned surfaces as HDRP Lit materials and terrain
// layers. Uses the downloaded originals (2K/4K/8K) when they are there, the
// bundled 512 px copies otherwise. Also the texture import rules.
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Southbound.Core;
using UnityEditor;
using UnityEngine;

namespace Southbound.EditorTools
{
    public static class Paths
    {
        public const string Root = "Assets/Southbound";
        public const string Bundled = Root + "/Art/Surfaces";
        public const string Downloaded = Root + "/Art/Downloaded";
        public const string Generated = Root + "/Art/Generated";
        public const string Models = Root + "/Art/Models";
        public const string Materials = Root + "/Materials";
        public const string TerrainLayers = Root + "/Materials/Terrain";
        public const string Prefabs = Root + "/Prefabs";
        public const string Scenes = Root + "/Scenes";
        public static string ProjectRoot => Path.GetDirectoryName(Application.dataPath);
        public static string Abs(string assetPath) => Path.Combine(ProjectRoot, assetPath);

        public static void Ensure(string assetFolder)
        {
            if (AssetDatabase.IsValidFolder(assetFolder)) return;
            string parent = Path.GetDirectoryName(assetFolder).Replace('\\', '/');
            Ensure(parent);
            AssetDatabase.CreateFolder(parent, Path.GetFileName(assetFolder));
        }
    }

    /// <summary>Import rules: normal maps as normal maps, mask/height/roughness linear, big sizes allowed.</summary>
    public sealed class SouthboundTextureImport : AssetPostprocessor
    {
        void OnPreprocessTexture()
        {
            if (!assetPath.StartsWith(Paths.Root + "/Art/")) return;
            var ti = (TextureImporter)assetImporter;
            string n = Path.GetFileNameWithoutExtension(assetPath).ToLowerInvariant();
            ti.maxTextureSize = 8192;
            ti.mipmapEnabled = true;
            ti.anisoLevel = 8;
            ti.textureCompression = TextureImporterCompression.CompressedHQ;
            if (n.EndsWith("_normal")) { ti.textureType = TextureImporterType.NormalMap; return; }
            ti.textureType = TextureImporterType.Default;
            if (n.EndsWith("_mask") || n.EndsWith("_terrainmask") || n.EndsWith("_height") || n.EndsWith("_roughness") || n.EndsWith("_ao")) ti.sRGBTexture = false;
            if (n.Contains("impostor") || n.StartsWith("leaf_") || n.StartsWith("hole_"))
            {
                ti.alphaIsTransparency = true;
                ti.wrapMode = TextureWrapMode.Clamp;
                ti.mipMapsPreserveCoverage = true;
                ti.alphaTestReferenceValue = 0.4f;
            }
        }
    }

    public static class Surfaces
    {
        public sealed class Maps
        {
            public Texture2D Color, Normal, Mask, TerrainMask, Height, Emission;
            public string Origin;
        }

        /// <summary>The best maps we have for a set: downloaded originals first, bundled copies second.</summary>
        public static Maps Find(string set)
        {
            foreach (var dir in new[] { $"{Paths.Downloaded}/{set}", $"{Paths.Bundled}/{set}" })
            {
                if (!AssetDatabase.IsValidFolder(dir)) continue;
                Texture2D T(string map) => new[] { ".jpg", ".png" }.Select(e => AssetDatabase.LoadAssetAtPath<Texture2D>($"{dir}/{set}_{map}{e}")).FirstOrDefault(t => t != null);
                var m = new Maps { Color = T("BaseColor"), Normal = T("Normal"), Mask = T("Mask"), TerrainMask = T("TerrainMask"), Height = T("Height"), Emission = T("Emission"), Origin = dir };
                if (m.Color != null) return m;
            }
            return null;
        }

        static readonly Dictionary<string, float> Parallax = new Dictionary<string, float>
        {
            // pixel displacement depth in cm for surfaces where it reads (cobbles, pavers, bricks, shingles...)
            ["Cobblestone01"] = 3f, ["square_concrete_pavers"] = 1.5f, ["red_brick"] = 2f, ["weathered_plank_siding"] = 1.2f, ["RoofingTiles013A"] = 2f,
            ["Gravel004"] = 2.5f, ["Dirt01"] = 2f, ["brown_mud"] = 2f, ["forest_leaves_02"] = 2f, ["cliff_side"] = 6f, ["Asphalt012"] = 0.6f,
            ["CorrugatedSteel005"] = 1.5f, ["RustyCorrugatedMetalPanel01"] = 1.5f, ["StuccoWall01"] = 0.8f, ["WoodFloor007"] = 0.4f,
        };

        /// <summary>Create or update the material for one set. UVs are in metres; tiling is 1 / tile size.</summary>
        public static Material Build(MaterialSet set)
        {
            var maps = Find(set.Name);
            if (maps == null) { Debug.LogWarning($"Southbound: no textures for {set.Name}"); return null; }
            Paths.Ensure(Paths.Materials);
            string path = $"{Paths.Materials}/{set.Name}.mat";
            var m = AssetDatabase.LoadAssetAtPath<Material>(path);
            var shader = Shader.Find("HDRP/Lit") ?? Shader.Find("Universal Render Pipeline/Lit") ?? Shader.Find("Standard");
            if (m == null) { m = new Material(shader) { name = set.Name }; AssetDatabase.CreateAsset(m, path); }
            else m.shader = shader;
            var tiling = Vector2.one / (float)set.TileMeters;
            if (Hdrp.IsHdrpShader(m))
            {
                m.SetColor("_BaseColor", Color.white);
                m.SetTexture("_BaseColorMap", maps.Color);
                m.SetTextureScale("_BaseColorMap", tiling);
                m.SetTexture("_NormalMap", maps.Normal);
                m.SetFloat("_NormalScale", 1f);
                m.SetTexture("_MaskMap", maps.Mask);
                if (maps.Height != null && Parallax.TryGetValue(set.Name, out var cm))
                {
                    m.SetTexture("_HeightMap", maps.Height);
                    m.SetFloat("_DisplacementMode", 2); // pixel displacement (parallax occlusion)
                    m.SetFloat("_HeightPoMAmplitude", cm);
                    m.SetFloat("_PPDMinSamples", 5);
                    m.SetFloat("_PPDMaxSamples", 24);
                    m.SetFloat("_DisplacementLockObjectScale", 0);
                }
                else { m.SetTexture("_HeightMap", null); m.SetFloat("_DisplacementMode", 0); }
                if (maps.Emission != null)
                {
                    // lit windows on the glass towers and offices (the sun-scale exposure needs real nits)
                    m.SetTexture("_EmissiveColorMap", maps.Emission);
                    m.SetColor("_EmissiveColorLDR", Color.white);
                    m.SetFloat("_UseEmissiveIntensity", 1);
                    m.SetFloat("_EmissiveIntensityUnit", 0); // nits
                    m.SetFloat("_EmissiveIntensity", 60f);
                    m.SetColor("_EmissiveColor", Color.white * 60f);
                }
                Hdrp.ResetKeywords(m);
            }
            else if (Hdrp.IsUrpShader(m))
            {
                m.SetTexture("_BaseMap", maps.Color); m.SetTextureScale("_BaseMap", tiling);
                m.SetTexture("_BumpMap", maps.Normal); m.EnableKeyword("_NORMALMAP");
                m.SetTexture("_MetallicGlossMap", maps.Mask); m.EnableKeyword("_METALLICSPECGLOSSMAP");
                m.SetTexture("_OcclusionMap", maps.Mask); m.EnableKeyword("_OCCLUSIONMAP");
            }
            else
            {
                // built-in Standard reads metallic from R, occlusion from G and smoothness from A: the HDRP mask layout fits
                m.SetTexture("_MainTex", maps.Color); m.SetTextureScale("_MainTex", tiling);
                m.SetTexture("_BumpMap", maps.Normal); m.EnableKeyword("_NORMALMAP");
                m.SetTexture("_MetallicGlossMap", maps.Mask); m.EnableKeyword("_METALLICGLOSSMAP");
                m.SetTexture("_OcclusionMap", maps.Mask);
            }
            EditorUtility.SetDirty(m);
            return m;
        }

        public static TerrainLayer Layer(MaterialSet set)
        {
            var maps = Find(set.Name);
            if (maps == null) return null;
            Paths.Ensure(Paths.TerrainLayers);
            string path = $"{Paths.TerrainLayers}/{set.Name}.terrainlayer";
            var l = AssetDatabase.LoadAssetAtPath<TerrainLayer>(path);
            if (l == null) { l = new TerrainLayer(); AssetDatabase.CreateAsset(l, path); }
            l.diffuseTexture = maps.Color;
            l.normalMapTexture = maps.Normal;
            l.normalScale = 1;
            // HDRP terrain mask: R metal, G AO, B height (for height-based blending), A smoothness
            l.maskMapTexture = maps.TerrainMask != null ? maps.TerrainMask : maps.Mask;
            l.tileSize = Vector2.one * (float)set.TileMeters;
            EditorUtility.SetDirty(l);
            return l;
        }

        [MenuItem("Southbound/Materials/Build all materials", priority = 20)]
        public static void BuildAll()
        {
            try
            {
                AssetDatabase.StartAssetEditing();
                int i = 0;
                foreach (var s in MaterialLibrary.Sets)
                {
                    EditorUtility.DisplayProgressBar("Southbound", $"Material {s.Name}", i++ / (float)MaterialLibrary.Sets.Length);
                    Build(s);
                    Layer(s);
                }
            }
            finally { AssetDatabase.StopAssetEditing(); EditorUtility.ClearProgressBar(); }
            AssetDatabase.SaveAssets();
            Debug.Log($"Southbound: {MaterialLibrary.Sets.Length} materials and terrain layers in {Paths.Materials}" + (Hdrp.Installed ? "" : " (HDRP isn't installed yet: they use a fallback shader; run Build all materials again after setup)."));
        }

        public static Material Get(string set) => AssetDatabase.LoadAssetAtPath<Material>($"{Paths.Materials}/{set}.mat") ?? Build(MaterialLibrary.Get(set));

        // ---- image helpers (CPU side: packing downloaded maps)
        public static Color32[] Load(string absPath, out int w, out int h)
        {
            var t = new Texture2D(2, 2, TextureFormat.RGBA32, false, true);
            try
            {
                if (!t.LoadImage(File.ReadAllBytes(absPath))) throw new IOException("can't decode " + absPath);
                w = t.width; h = t.height;
                return t.GetPixels32();
            }
            finally { Object.DestroyImmediate(t); }
        }

        static byte Sample(Color32[] px, int pw, int ph, int x, int y, int w, int h)
        {
            if (px == null) return 0;
            if (pw == w && ph == h) return px[y * w + x].r;
            return px[(y * ph / h) * pw + (x * pw / w)].r;
        }

        /// <summary>HDRP mask maps from separate roughness / AO / metal / height images (any may be missing).</summary>
        public static void PackMasks(string roughAbs, string aoAbs, string metalAbs, string heightAbs, string maskOut, string terrainMaskOut)
        {
            Color32[] R = null, A = null, M = null, H = null;
            int w = 0, h = 0, rw = 0, rh = 0, aw = 0, ah = 0, mw = 0, mh = 0, hw = 0, hh = 0;
            if (roughAbs != null && File.Exists(roughAbs)) { R = Load(roughAbs, out rw, out rh); w = rw; h = rh; }
            if (aoAbs != null && File.Exists(aoAbs)) { A = Load(aoAbs, out aw, out ah); if (w == 0) { w = aw; h = ah; } }
            if (metalAbs != null && File.Exists(metalAbs)) { M = Load(metalAbs, out mw, out mh); if (w == 0) { w = mw; h = mh; } }
            if (heightAbs != null && File.Exists(heightAbs)) { H = Load(heightAbs, out hw, out hh); if (w == 0) { w = hw; h = hh; } }
            if (w == 0) { w = h = 4; }
            var mask = new Color32[w * h];
            var tmask = terrainMaskOut != null ? new Color32[w * h] : null;
            for (int y = 0; y < h; y++)
                for (int x = 0; x < w; x++)
                {
                    byte metal = M != null ? Sample(M, mw, mh, x, y, w, h) : (byte)0;
                    byte ao = A != null ? Sample(A, aw, ah, x, y, w, h) : (byte)255;
                    byte smooth = R != null ? (byte)(255 - Sample(R, rw, rh, x, y, w, h)) : (byte)30;
                    mask[y * w + x] = new Color32(metal, ao, 255, smooth);
                    if (tmask != null) tmask[y * w + x] = new Color32(metal, ao, H != null ? Sample(H, hw, hh, x, y, w, h) : (byte)128, smooth);
                }
            Write(mask, w, h, maskOut);
            if (tmask != null) Write(tmask, w, h, terrainMaskOut);
        }

        public static void Write(Color32[] px, int w, int h, string absOut)
        {
            var t = new Texture2D(w, h, TextureFormat.RGBA32, false, true);
            try { t.SetPixels32(px); t.Apply(false); File.WriteAllBytes(absOut, t.EncodeToPNG()); }
            finally { Object.DestroyImmediate(t); }
        }
    }
}
