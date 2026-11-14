// Grass on Calvera's terrain (Core/GroundCover): three tufts of real 3D strands (meadow green, tall dry
// straw, a short verge along the roads) as instanced terrain detail meshes (HDRP draws detail meshes
// only with GPU instancing; it has no billboard grass), planted per 2 m cell from the web game's ground
// splat. Each strand takes one of eight shades, darker at the root and paler at the tip.
using System.Collections.Generic;
using Southbound.Core;
using UnityEditor;
using UnityEngine;
using UnityEngine.Rendering;

namespace Southbound.EditorTools
{
    public static class GrassBuilder
    {
        const string Dir = Paths.Generated + "/Grass";
        const string PrefabDir = Paths.Prefabs + "/Grass";
        const int Res = 2048;   // detail cells over the 4 km map: 2 m each

        static readonly float[][] GreenShades = {
            new[] { 0.10f, 0.16f, 0.05f }, new[] { 0.13f, 0.19f, 0.06f }, new[] { 0.16f, 0.21f, 0.08f }, new[] { 0.12f, 0.17f, 0.07f },
            new[] { 0.18f, 0.22f, 0.09f }, new[] { 0.14f, 0.20f, 0.10f }, new[] { 0.20f, 0.24f, 0.10f }, new[] { 0.11f, 0.15f, 0.06f } };
        static readonly float[][] DryShades = {
            new[] { 0.40f, 0.33f, 0.20f }, new[] { 0.46f, 0.38f, 0.24f }, new[] { 0.35f, 0.28f, 0.17f }, new[] { 0.50f, 0.42f, 0.28f },
            new[] { 0.30f, 0.27f, 0.15f }, new[] { 0.43f, 0.36f, 0.19f }, new[] { 0.38f, 0.35f, 0.22f }, new[] { 0.33f, 0.30f, 0.18f } };

        public static void Build(CalveraWorld w, Terrain terrain, Color32[] splat)
        {
            if (terrain == null) return;
            Paths.Ensure(Dir); Paths.Ensure(PrefabDir);
            var kinds = new[]
            {
                (name: "Grass_Meadow", tuft: GroundCover.Tuft(22, 0.14, 0.42, 101), shades: GreenShades, tint: 1.0f),
                (name: "Grass_Dry", tuft: GroundCover.Tuft(16, 0.12, 0.72, 202), shades: DryShades, tint: 1.0f),
                (name: "Grass_Verge", tuft: GroundCover.Tuft(28, 0.16, 0.13, 303), shades: GreenShades, tint: 1.15f),
            };
            var protos = new List<DetailPrototype>();
            foreach (var k in kinds)
            {
                var prefab = Prefab(k.name, k.tuft, Material(k.name, k.shades, k.tint));
                var dp = new DetailPrototype
                {
                    usePrototypeMesh = true, prototype = prefab, renderMode = DetailRenderMode.VertexLit,
                    minWidth = 0.75f, maxWidth = 1.3f, minHeight = 0.7f, maxHeight = 1.35f, noiseSpread = 0.35f,
                    healthyColor = Color.white, dryColor = Color.white, useInstancing = true,
                };
#if UNITY_2022_2_OR_NEWER
                dp.alignToGround = 0.6f;   // tufts stand out of a slope like real grass, not plumb
#endif
                protos.Add(dp);
            }

            var plan = GroundCover.Place(w, Res, (x, z) =>
            {
                if (splat == null) return (0f, 0f, 0f, 0f);
                int i = Mathf.Clamp((int)System.Math.Round((x + w.Half) / w.Cell), 0, w.N - 1), j = Mathf.Clamp((int)System.Math.Round((z + w.Half) / w.Cell), 0, w.N - 1);
                var c = splat[(w.N - 1 - j) * w.N + i];   // PNG rows load bottom-up
                return (c.r / 255f, c.g / 255f, c.b / 255f, c.a / 255f);
            });

            var td = terrain.terrainData;
#if UNITY_2022_2_OR_NEWER
            td.SetDetailScatterMode(DetailScatterMode.InstanceCountMode);
#endif
            td.detailPrototypes = protos.ToArray();
            td.SetDetailResolution(Res, 32);
            var layers = new[] { plan.Green, plan.Dry, plan.Verge };
            long total = 0;
            for (int l = 0; l < layers.Length; l++)
            {
                // Unity's detail map is [z, x] from the terrain's corner; Unity x is the web's -x
                var map = new int[Res, Res];
                for (int uz = 0; uz < Res; uz++)
                    for (int ux = 0; ux < Res; ux++)
                    {
                        int v = layers[l][uz * Res + (Res - 1 - ux)];
                        map[uz, ux] = v; total += v;
                    }
                td.SetDetailLayer(0, 0, l, map);
            }
            terrain.detailObjectDistance = 90;
            terrain.detailObjectDensity = 1;
            EditorUtility.SetDirty(td);
            Debug.Log($"Southbound: grass planted: {total} tufts (meadow, dry grass, verges).");
        }

        static GameObject Prefab(string name, TuftMesh t, Material mat)
        {
            string meshPath = $"{Dir}/{name}.asset", prefabPath = $"{PrefabDir}/{name}.prefab";
            var m = new Mesh { name = name };
            var v = new Vector3[t.Vertices]; var n = new Vector3[t.Vertices]; var uv = new Vector2[t.Vertices];
            for (int i = 0; i < v.Length; i++)
            {
                v[i] = new Vector3(t.Positions[i * 3], t.Positions[i * 3 + 1], t.Positions[i * 3 + 2]);
                n[i] = new Vector3(t.Normals[i * 3], t.Normals[i * 3 + 1], t.Normals[i * 3 + 2]);
                uv[i] = new Vector2(t.Uvs[i * 2], t.Uvs[i * 2 + 1]);
            }
            m.vertices = v; m.normals = n; m.uv = uv;
            m.SetTriangles(t.Indices, 0);
            m.RecalculateBounds();
            AssetDatabase.DeleteAsset(meshPath);
            AssetDatabase.CreateAsset(m, meshPath);
            var go = new GameObject(name);
            go.AddComponent<MeshFilter>().sharedMesh = m;
            var r = go.AddComponent<MeshRenderer>();
            r.sharedMaterial = mat;
            r.shadowCastingMode = ShadowCastingMode.On;
            var prefab = PrefabUtility.SaveAsPrefabAsset(go, prefabPath);
            Object.DestroyImmediate(go);
            return prefab;
        }

        /// <summary>Eight shades side by side, each dark at the root (where the tuft shades itself) and paler at the tip.</summary>
        static Material Material(string name, float[][] shades, float tint)
        {
            const int W = GroundCover.Shades * 4, H = 64;
            var px = new Color32[W * H];
            for (int y = 0; y < H; y++)
                for (int x = 0; x < W; x++)
                {
                    var c = shades[x / 4];
                    float t = (y + 0.5f) / H;
                    float k = Mathf.Lerp(0.42f, 1.0f, Mathf.SmoothStep(0, 1, t * 1.4f)) * tint;
                    float tip = Mathf.Clamp01((t - 0.75f) / 0.25f);
                    var lin = new Color(c[0] * k + tip * 0.06f, c[1] * k + tip * 0.05f, c[2] * k + tip * 0.02f).gamma;
                    px[y * W + x] = new Color32((byte)(Mathf.Clamp01(lin.r) * 255), (byte)(Mathf.Clamp01(lin.g) * 255), (byte)(Mathf.Clamp01(lin.b) * 255), 255);
                }
            string texPath = $"{Dir}/{name}_Color.png";
            Surfaces.Write(px, W, H, Paths.Abs(texPath));
            AssetDatabase.ImportAsset(texPath);
            if (AssetImporter.GetAtPath(texPath) is TextureImporter imp)
            {
                imp.sRGBTexture = true; imp.wrapMode = TextureWrapMode.Clamp; imp.filterMode = FilterMode.Bilinear; imp.mipmapEnabled = true;
                imp.SaveAndReimport();
            }
            string matPath = $"{Dir}/{name}.mat";
            var m = AssetDatabase.LoadAssetAtPath<Material>(matPath);
            if (m == null) { m = Hdrp.Lit(); m.name = name; AssetDatabase.CreateAsset(m, matPath); }
            var tex = AssetDatabase.LoadAssetAtPath<Texture2D>(texPath);
            if (Hdrp.IsHdrpShader(m))
            {
                m.SetColor("_BaseColor", Color.white);
                m.SetTexture("_BaseColorMap", tex);
                m.SetFloat("_Smoothness", 0.3f);
                m.SetFloat("_DoubleSidedEnable", 1);
                m.SetFloat("_DoubleSidedNormalMode", 2);   // none: the strands' normals already point up, keep them on both sides
                m.enableInstancing = true;
                Hdrp.ResetKeywords(m);
            }
            else { m.mainTexture = tex; m.enableInstancing = true; }
            EditorUtility.SetDirty(m);
            return m;
        }
    }
}
