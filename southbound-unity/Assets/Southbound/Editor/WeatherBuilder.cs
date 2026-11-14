// Weather for the Calvera scene: the WeatherController (Runtime) with what it works on: the rain streak
// material, ~1 400 puddle decals in the roads' dips and gutters (Core/Puddles: dark water with a flat normal,
// so the puddles mirror the sky and the street lights), and the roots whose materials get wet.
using System.Collections.Generic;
using System.IO;
using Southbound.Core;
using UnityEditor;
using UnityEngine;

namespace Southbound.EditorTools
{
    public static class WeatherBuilder
    {
        const string Dir = Paths.Generated + "/Weather";

        public static void Build(CalveraWorld w)
        {
            Paths.Ensure(Dir);
            var go = new GameObject("Weather");
            var wc = go.AddComponent<WeatherController>();
            wc.rainMaterial = RainMaterial();
            wc.ground = Roots("Roads", "Road paint", "Street (sidewalks, lights, poles, yards, signs, clutter)");
            wc.walls = Roots("Buildings", "Architecture", "Windows (glass, frames, rooms)");
            wc.puddles = PlacePuddles(w, go.transform);
            Debug.Log($"Southbound: weather (F8 cycles it): {wc.puddles.Length} puddles, wet streets, rain, lightning.");
        }

        static Transform[] Roots(params string[] names)
        {
            var list = new List<Transform>();
            foreach (var n in names) { var g = GameObject.Find(n); if (g != null) list.Add(g.transform); }
            return list.ToArray();
        }

        static Component[] PlacePuddles(CalveraWorld w, Transform parent)
        {
            var projType = Hdrp.FindType("UnityEngine.Rendering.HighDefinition.DecalProjector");
            var shader = Shader.Find("HDRP/Decal");
            if (projType == null || shader == null) { Debug.Log("Southbound: no HDRP decals here, no puddles."); return new Component[0]; }
            var mat = PuddleMaterial(shader);
            var root = new GameObject("Puddles").transform;
            root.SetParent(parent, false);
            var list = new List<Component>();
            foreach (var s in Puddles.Place(w))
            {
                var go = new GameObject("puddle");
                go.transform.SetParent(root, false);
                double y = w.HeightAt(s.X, s.Z) + 0.06;
                var along = new Vector3(-(float)System.Math.Sin(s.Heading), 0, (float)System.Math.Cos(s.Heading));
                go.transform.SetPositionAndRotation(new Vector3((float)-s.X, (float)y, (float)s.Z), Quaternion.LookRotation(Vector3.down, along));
                var p = go.AddComponent(projType);
                Hdrp.SetMember(p, "material", mat);
                Hdrp.SetMember(p, "size", new Vector3((float)s.Width, (float)s.Length, 0.5f));
                Hdrp.SetMember(p, "pivot", Vector3.zero);
                Hdrp.SetMember(p, "drawDistance", 140f);
                Hdrp.SetMember(p, "fadeScale", 0.9f);
                Hdrp.SetMember(p, "fadeFactor", 0f);      // WeatherController fills them as it rains
                go.isStatic = true;
                list.Add(p);
            }
            return list.ToArray();
        }

        /// <summary>Standing water: darkens what's under it, flattens its bumps (so it mirrors), and turns it glassy.</summary>
        static Material PuddleMaterial(Shader shader)
        {
            string colorPath = $"{Dir}/Puddle_Color.png", maskPath = $"{Dir}/Puddle_Mask.png", normalPath = $"{Dir}/Puddle_Normal.png", matPath = $"{Dir}/Puddle.mat";
            const int size = 256;
            if (!File.Exists(Paths.Abs(colorPath)))
            {
                var a = Puddles.Mask(size, 7);
                var col = new Color32[size * size]; var mask = new Color32[size * size]; var nrm = new Color32[size * size];
                for (int i = 0; i < a.Length; i++)
                {
                    byte al = (byte)(a[i] * 255);
                    col[i] = new Color32(14, 16, 18, (byte)(a[i] * 200));      // water over asphalt: much darker
                    mask[i] = new Color32(0, 255, al, 248);                    // opacity in blue, smoothness ~0.97 in alpha
                    nrm[i] = new Color32(128, 128, 255, al);                   // flat: the puddle is a mirror
                }
                Surfaces.Write(col, size, size, Paths.Abs(colorPath));
                Surfaces.Write(mask, size, size, Paths.Abs(maskPath));
                Surfaces.Write(nrm, size, size, Paths.Abs(normalPath));
                foreach (var (p, srgb, normal) in new[] { (colorPath, true, false), (maskPath, false, false), (normalPath, false, true) })
                {
                    AssetDatabase.ImportAsset(p);
                    if (AssetImporter.GetAtPath(p) is TextureImporter imp)
                    {
                        imp.sRGBTexture = srgb; imp.alphaIsTransparency = srgb; imp.wrapMode = TextureWrapMode.Clamp; imp.mipmapEnabled = true;
                        if (normal) imp.textureType = TextureImporterType.NormalMap;
                        imp.SaveAndReimport();
                    }
                }
            }
            var m = AssetDatabase.LoadAssetAtPath<Material>(matPath);
            if (m == null) { m = new Material(shader) { name = "Puddle" }; AssetDatabase.CreateAsset(m, matPath); }
            m.SetTexture("_BaseColorMap", AssetDatabase.LoadAssetAtPath<Texture2D>(colorPath));
            m.SetTexture("_MaskMap", AssetDatabase.LoadAssetAtPath<Texture2D>(maskPath));
            m.SetTexture("_NormalMap", AssetDatabase.LoadAssetAtPath<Texture2D>(normalPath));
            m.SetFloat("_DecalBlend", 1f);
            m.SetFloat("_AffectAlbedo", 1f); m.SetFloat("_AffectNormal", 1f); m.SetFloat("_AffectSmoothness", 1f); m.SetFloat("_AffectMetal", 0f); m.SetFloat("_AffectAO", 0f);
            m.SetFloat("_DrawOrder", 5);
            Hdrp.ResetKeywords(m);
            EditorUtility.SetDirty(m);
            return m;
        }

        /// <summary>Rain streaks: a thin vertical gradient, additive, unlit (lit by nothing but its own faint grey).</summary>
        static Material RainMaterial()
        {
            string texPath = $"{Dir}/RainStreak.png", matPath = $"{Dir}/Rain.mat";
            if (!File.Exists(Paths.Abs(texPath)))
            {
                const int W = 8, H = 64;
                var px = new Color32[W * H];
                for (int y = 0; y < H; y++)
                    for (int x = 0; x < W; x++)
                    {
                        float across = 1 - Mathf.Abs((x + 0.5f) / W * 2 - 1), along = Mathf.Sin((y + 0.5f) / H * Mathf.PI);
                        px[y * W + x] = new Color32(255, 255, 255, (byte)(Mathf.Pow(across, 1.5f) * along * 255));
                    }
                Surfaces.Write(px, W, H, Paths.Abs(texPath));
                AssetDatabase.ImportAsset(texPath);
                if (AssetImporter.GetAtPath(texPath) is TextureImporter imp) { imp.alphaIsTransparency = true; imp.wrapMode = TextureWrapMode.Clamp; imp.SaveAndReimport(); }
            }
            var sh = Shader.Find("HDRP/Unlit") ?? Shader.Find("Particles/Standard Unlit") ?? Shader.Find("Unlit/Transparent");
            var m = AssetDatabase.LoadAssetAtPath<Material>(matPath);
            if (m == null) { m = new Material(sh) { name = "Rain" }; AssetDatabase.CreateAsset(m, matPath); }
            var tex = AssetDatabase.LoadAssetAtPath<Texture2D>(texPath);
            if (m.shader.name == "HDRP/Unlit")
            {
                m.SetTexture("_UnlitColorMap", tex);
                m.SetColor("_UnlitColor", new Color(0.7f, 0.72f, 0.76f, 0.5f));
                m.SetFloat("_SurfaceType", 1);   // transparent
                m.SetFloat("_BlendMode", 1);     // additive
                m.SetFloat("_ZWrite", 0);
                Hdrp.ResetKeywords(m);
            }
            else m.mainTexture = tex;
            EditorUtility.SetDirty(m);
            return m;
        }
    }
}
