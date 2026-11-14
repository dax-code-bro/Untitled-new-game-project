// Paints Calvera's roads (Core/RoadMarkings: the web game's layout) as thin meshes 1.5 cm above the
// asphalt: white edge and parking lines, double and dashed yellow centre lines, zebra crosswalks and stop
// bars. The paint is worn: an alpha-clipped HDRP/Lit material whose generated texture lets the asphalt
// show through where tyres have taken it off, so oil and skid decals still land on top of it.
// The meshes are cut into 256 m squares so the far ones are culled.
using System.Collections.Generic;
using System.IO;
using Southbound.Core;
using UnityEditor;
using UnityEngine;
using UnityEngine.Rendering;

namespace Southbound.EditorTools
{
    public static class RoadMarkingBuilder
    {
        const string Dir = Paths.Generated + "/RoadPaint";
        const string MeshDir = Paths.Scenes + "/Calvera_Meshes";
        const double Cell = 256;

        sealed class Chunk
        {
            public readonly List<Vector3> V = new List<Vector3>();
            public readonly List<Vector2> Uv = new List<Vector2>();
            public readonly List<int> White = new List<int>(), Yellow = new List<int>();
            public readonly Dictionary<int, int> Map = new Dictionary<int, int>();
        }

        public static void Build(CalveraWorld w)
        {
            var paint = RoadMarkings.Build(w, w.HeightAt);
            var chunks = new Dictionary<(int, int), Chunk>();
            void Take(List<int> tris, bool yellow)
            {
                // quads are 6 indices each; a quad goes to the square its first corner is in
                for (int q = 0; q < tris.Count; q += 6)
                {
                    int first = tris[q];
                    var key = ((int)System.Math.Floor(paint.Positions[first * 3] / Cell), (int)System.Math.Floor(paint.Positions[first * 3 + 2] / Cell));
                    if (!chunks.TryGetValue(key, out var c)) chunks[key] = c = new Chunk();
                    var dst = yellow ? c.Yellow : c.White;
                    for (int t = q; t < q + 6; t += 3)
                    {
                        // the mirror into Unity flips the winding: (a, b, c) -> (a, c, b)
                        dst.Add(Index(c, tris[t])); dst.Add(Index(c, tris[t + 2])); dst.Add(Index(c, tris[t + 1]));
                    }
                }
            }
            int Index(Chunk c, int src)
            {
                if (c.Map.TryGetValue(src, out int i)) return i;
                i = c.V.Count;
                var (x, z) = CalveraWorld.ToUnity(paint.Positions[src * 3], paint.Positions[src * 3 + 2]);
                c.V.Add(new Vector3((float)x, (float)paint.Positions[src * 3 + 1], (float)z));
                c.Uv.Add(new Vector2((float)paint.Uvs[src * 2], (float)paint.Uvs[src * 2 + 1]));
                c.Map[src] = i;
                return i;
            }
            Take(paint.White, false);
            Take(paint.Yellow, true);

            var white = Material("White", new Color32(0xdc, 0xdc, 0xd4, 255));
            var yellow = Material("Yellow", new Color32(0xe0, 0xa5, 0x1c, 255));
            Paths.Ensure(MeshDir);
            var root = new GameObject("Road paint").transform;
            int n = 0;
            foreach (var kv in chunks)
            {
                var c = kv.Value;
                var m = new Mesh { name = $"RoadPaint_{kv.Key.Item1}_{kv.Key.Item2}", indexFormat = IndexFormat.UInt32 };
                m.SetVertices(c.V); m.SetUVs(0, c.Uv);
                m.subMeshCount = 2;
                m.SetTriangles(c.White, 0); m.SetTriangles(c.Yellow, 1);
                m.RecalculateNormals();
                if (Average(m.normals) < 0) Flip(m);
                m.RecalculateTangents(); m.RecalculateBounds();
                string path = $"{MeshDir}/{m.name}.asset";
                AssetDatabase.DeleteAsset(path);
                AssetDatabase.CreateAsset(m, path);
                var go = new GameObject(m.name);
                go.transform.SetParent(root, false);
                go.AddComponent<MeshFilter>().sharedMesh = m;
                var r = go.AddComponent<MeshRenderer>();
                r.sharedMaterials = new[] { white, yellow };
                r.shadowCastingMode = ShadowCastingMode.Off;   // paint casts no shadow, it only receives
                GameObjectUtility.SetStaticEditorFlags(go, StaticEditorFlags.BatchingStatic | StaticEditorFlags.OccludeeStatic);
                n++;
            }
            Debug.Log($"Southbound: road paint, {paint.Quads} strips in {n} squares ({paint.Crosswalks} crosswalks).");
        }

        static float Average(Vector3[] normals) { double s = 0; foreach (var v in normals) s += v.y; return normals.Length == 0 ? 1 : (float)(s / normals.Length); }

        static void Flip(Mesh m)
        {
            for (int sm = 0; sm < m.subMeshCount; sm++)
            {
                var t = m.GetTriangles(sm);
                for (int i = 0; i < t.Length; i += 3) { int s = t[i + 1]; t[i + 1] = t[i + 2]; t[i + 2] = s; }
                m.SetTriangles(t, sm);
            }
            m.RecalculateNormals();
        }

        /// <summary>Worn road paint in a colour: the generated 2 m tile, alpha-clipped where the paint is gone.</summary>
        static Material Material(string name, Color32 tint)
        {
            Paths.Ensure(Dir);
            string colorPath = $"{Dir}/RoadPaint_Color.png", maskPath = $"{Dir}/RoadPaint_Mask.png", matPath = $"{Dir}/RoadPaint_{name}.mat";
            if (!File.Exists(Paths.Abs(colorPath)) || !File.Exists(Paths.Abs(maskPath)))
            {
                const int size = 1024;
                var img = RoadMarkings.PaintTexture(size, 5);
                var col = new Color32[size * size]; var mask = new Color32[size * size];
                for (int i = 0; i < col.Length; i++)
                {
                    var c = new Color(img.Rgba[i * 4], img.Rgba[i * 4 + 1], img.Rgba[i * 4 + 2]).gamma;
                    col[i] = new Color32((byte)(c.r * 255), (byte)(c.g * 255), (byte)(c.b * 255), (byte)(img.Rgba[i * 4 + 3] * 255));
                    mask[i] = new Color32(0, 255, 0, (byte)(img.Smoothness[i] * 255));   // metal 0, AO 1, smoothness in alpha
                }
                Surfaces.Write(col, size, size, Paths.Abs(colorPath));
                Surfaces.Write(mask, size, size, Paths.Abs(maskPath));
                AssetDatabase.ImportAsset(colorPath); AssetDatabase.ImportAsset(maskPath);
                SetImport(colorPath, true); SetImport(maskPath, false);
            }
            var m = AssetDatabase.LoadAssetAtPath<Material>(matPath);
            if (m == null) { m = Hdrp.Lit(); m.name = "Road paint " + name.ToLowerInvariant(); AssetDatabase.CreateAsset(m, matPath); }
            var color = AssetDatabase.LoadAssetAtPath<Texture2D>(colorPath);
            if (Hdrp.IsHdrpShader(m))
            {
                m.SetColor("_BaseColor", tint);
                m.SetTexture("_BaseColorMap", color);
                m.SetTexture("_MaskMap", AssetDatabase.LoadAssetAtPath<Texture2D>(maskPath));
                m.SetFloat("_SmoothnessRemapMin", 0f); m.SetFloat("_SmoothnessRemapMax", 1f);
                m.SetFloat("_AlphaCutoffEnable", 1);
                m.SetFloat("_AlphaCutoff", 0.5f);
                Hdrp.ResetKeywords(m);
            }
            else
            {
                m.color = tint; m.mainTexture = color;
                m.SetFloat("_Mode", 1); m.SetFloat("_Cutoff", 0.5f); m.EnableKeyword("_ALPHATEST_ON");
                m.renderQueue = (int)RenderQueue.AlphaTest;
            }
            EditorUtility.SetDirty(m);
            return m;
        }

        static void SetImport(string path, bool srgb)
        {
            if (!(AssetImporter.GetAtPath(path) is TextureImporter imp)) return;
            imp.sRGBTexture = srgb;
            imp.alphaIsTransparency = srgb;
            imp.wrapMode = TextureWrapMode.Repeat;
            imp.mipmapEnabled = true;
            imp.anisoLevel = 8;   // seen at grazing angles down the road
            imp.SaveAndReimport();
        }
    }
}
