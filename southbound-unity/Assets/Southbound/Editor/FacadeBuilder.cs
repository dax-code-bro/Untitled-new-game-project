// Builds the web game's 3D architecture in Unity from calvera-facades.json:
// cornices, parapets, shopfronts and awnings, porches and doors, roof trim,
// rooftop units, and every window sill and head. Pieces are merged into
// static meshes by material and colour (a few hundred draw calls for the city).
using System.Collections.Generic;
using System.Linq;
using Southbound.Core;
using UnityEditor;
using UnityEngine;
using UnityEngine.Rendering;

namespace Southbound.EditorTools
{
    public static class FacadeBuilder
    {
        const int MaxVerts = 60000;

        public static void Build(string dataDir, string meshDir)
        {
            var kinds = FacadeData.Load(dataDir);
            if (kinds.Count == 0) { Debug.LogWarning("Southbound: no calvera-facades.json (run node tools/southbound/export-unity.mjs world)."); return; }
            var root = new GameObject("Architecture").transform;
            int pieces = 0, meshes = 0;
            foreach (var k in kinds)
            {
                string kind = k.Name.Replace("near-", "");
                foreach (var group in Enumerable.Range(0, k.Count).GroupBy(i => k.Colors[i]))
                {
                    var mat = MaterialFor(kind, group.Key);
                    var idx = group.ToList();
                    int vertsPer = k.Shape == "box" ? 24 : k.Shape == "cylinder" ? 16 * 4 + 2 : 16 * 3 + 1;
                    int perMesh = Mathf.Max(1, MaxVerts / vertsPer);
                    for (int start = 0, part = 0; start < idx.Count; start += perMesh, part++)
                    {
                        var mesh = BuildMesh(k, idx.Skip(start).Take(perMesh), $"{k.Name}_{group.Key:x6}_{part}");
                        string name = $"Facade_{k.Name}_{group.Key:x6}_{part}";
                        AssetDatabase.DeleteAsset($"{meshDir}/{name}.asset");
                        AssetDatabase.CreateAsset(mesh, $"{meshDir}/{name}.asset");
                        var go = new GameObject(name);
                        go.transform.SetParent(root, false);
                        go.AddComponent<MeshFilter>().sharedMesh = mesh;
                        var r = go.AddComponent<MeshRenderer>();
                        r.sharedMaterial = mat;
                        r.shadowCastingMode = k.Name.StartsWith("near-") ? ShadowCastingMode.Off : ShadowCastingMode.On;
                        GameObjectUtility.SetStaticEditorFlags(go, StaticEditorFlags.BatchingStatic | StaticEditorFlags.OccludeeStatic);
                        meshes++;
                    }
                    pieces += idx.Count;
                }
            }
            Debug.Log($"Southbound: architecture built: {pieces} pieces in {meshes} meshes.");
        }

        static Vector3 V(FacadeKind k, int i, double lx, double ly, double lz)
        {
            var (x, y, z) = k.Point(i, lx, ly, lz);
            var (ux, uz) = CalveraWorld.ToUnity(x, z);
            return new Vector3((float)ux, (float)y, (float)uz);
        }

        static Mesh BuildMesh(FacadeKind k, IEnumerable<int> pieces, string name)
        {
            var v = new List<Vector3>(); var tri = new List<int>(); var uv = new List<Vector2>();
            foreach (int i in pieces)
            {
                if (k.Shape == "box") Box(k, i, v, tri);
                else Round(k, i, v, tri, k.Shape == "cone");
            }
            // UVs in metres, projected along each face (materials tile by 1 / real tile size)
            for (int t = 0; t < tri.Count; t += 3)
            {
                Vector3 a = v[tri[t]], b = v[tri[t + 1]], c = v[tri[t + 2]];
                Vector3 n = Vector3.Cross(b - a, c - a);
                n = new Vector3(Mathf.Abs(n.x), Mathf.Abs(n.y), Mathf.Abs(n.z));
                foreach (int vi in new[] { tri[t], tri[t + 1], tri[t + 2] })
                {
                    var p = v[vi];
                    while (uv.Count <= vi) uv.Add(Vector2.zero);
                    uv[vi] = n.x >= n.y && n.x >= n.z ? new Vector2(p.z, p.y) : n.y >= n.z ? new Vector2(p.x, p.z) : new Vector2(p.x, p.y);
                }
            }
            var m = new Mesh { name = name, indexFormat = IndexFormat.UInt32 };
            m.SetVertices(v); m.SetTriangles(tri, 0); m.SetUVs(0, uv);
            m.RecalculateNormals(); m.RecalculateTangents(); m.RecalculateBounds();
            return m;
        }

        static readonly int[][] Faces =
        {
            new[] { 0, 1, 3, 2 }, new[] { 4, 6, 7, 5 }, new[] { 0, 4, 5, 1 }, new[] { 2, 3, 7, 6 }, new[] { 0, 2, 6, 4 }, new[] { 1, 5, 7, 3 },
        };

        // eight corners, six faces with their own vertices (flat shading); faces wound to point outward
        static void Box(FacadeKind k, int i, List<Vector3> v, List<int> tri)
        {
            var c = new Vector3[8];
            for (int n = 0; n < 8; n++) c[n] = V(k, i, (n & 1) != 0 ? 0.5 : -0.5, (n & 2) != 0 ? 0.5 : -0.5, (n & 4) != 0 ? 0.5 : -0.5);
            Vector3 centre = Vector3.zero; foreach (var p in c) centre += p; centre /= 8;
            foreach (var f in Faces)
            {
                int o = v.Count;
                foreach (int n in f) v.Add(c[n]);
                Quad(v, tri, o, centre);
            }
        }

        static void Quad(List<Vector3> v, List<int> tri, int o, Vector3 centre)
        {
            Vector3 a = v[o], b = v[o + 1], cc = v[o + 2];
            Vector3 n = Vector3.Cross(b - a, cc - a);
            bool outward = Vector3.Dot(n, (a + cc) * 0.5f - centre) >= 0;
            // Unity draws clockwise faces: a normal from Cross(b-a, c-a) pointing out means clockwise from outside
            if (outward) tri.AddRange(new[] { o, o + 1, o + 2, o, o + 2, o + 3 });
            else tri.AddRange(new[] { o, o + 2, o + 1, o, o + 3, o + 2 });
        }

        static void Round(FacadeKind k, int i, List<Vector3> v, List<int> tri, bool cone)
        {
            const int N = 16;
            Vector3 centre = V(k, i, 0, 0, 0);
            for (int s = 0; s < N; s++)
            {
                double a0 = s * 2 * Mathf.PI / N, a1 = (s + 1) * 2 * Mathf.PI / N;
                Vector3 b0 = V(k, i, 0.5 * Mathf.Cos((float)a0), -0.5, 0.5 * Mathf.Sin((float)a0)), b1 = V(k, i, 0.5 * Mathf.Cos((float)a1), -0.5, 0.5 * Mathf.Sin((float)a1));
                Vector3 t0 = cone ? V(k, i, 0, 0.5, 0) : V(k, i, 0.5 * Mathf.Cos((float)a0), 0.5, 0.5 * Mathf.Sin((float)a0));
                Vector3 t1 = cone ? t0 : V(k, i, 0.5 * Mathf.Cos((float)a1), 0.5, 0.5 * Mathf.Sin((float)a1));
                int q = v.Count;
                v.Add(b0); v.Add(b1); v.Add(t1); v.Add(t0);
                Quad(v, tri, q, centre);
                if (!cone)
                {
                    int top = v.Count;
                    v.Add(V(k, i, 0, 0.5, 0)); v.Add(t0); v.Add(t1);
                    Vector3 n = Vector3.Cross(v[top + 1] - v[top], v[top + 2] - v[top]);
                    if (n.y >= 0) tri.AddRange(new[] { top, top + 1, top + 2 }); else tri.AddRange(new[] { top, top + 2, top + 1 });
                }
            }
        }

        static readonly Dictionary<string, Material> cache = new Dictionary<string, Material>();

        static Material MaterialFor(string kind, int rgb)
        {
            string key = $"{kind}_{rgb:x6}";
            if (cache.TryGetValue(key, out var m) && m != null) return m;
            Paths.Ensure(Paths.Materials + "/Architecture");
            string path = $"{Paths.Materials}/Architecture/{key}.mat";
            m = AssetDatabase.LoadAssetAtPath<Material>(path);
            var color = new Color(((rgb >> 16) & 255) / 255f, ((rgb >> 8) & 255) / 255f, (rgb & 255) / 255f);
            if (m == null)
            {
                Material baseMat = kind == "stone" ? Surfaces.Get("Concrete034") : kind == "brick" ? Surfaces.Get("red_brick") : null;
                m = baseMat != null ? new Material(baseMat) : Hdrp.Lit();
                m.name = key;
                AssetDatabase.CreateAsset(m, path);
            }
            float smooth = kind == "metal" ? 0.65f : kind == "paint" ? 0.45f : kind == "canvas" ? 0.08f : kind == "wood" ? 0.2f : 0.15f;
            float metal = kind == "metal" ? 0.85f : 0f;
            // the web game multiplies the stone and brick textures up by ~1.7; HDRP's base colour can't go above 1, so lighten a little
            var c = kind == "stone" || kind == "brick" ? Color.Lerp(color, Color.white, 0.25f) : color;
            if (Hdrp.IsHdrpShader(m))
            {
                m.SetColor("_BaseColor", c);
                if (m.GetTexture("_MaskMap") == null) { m.SetFloat("_Smoothness", smooth); m.SetFloat("_Metallic", metal); }
                if (kind == "canvas") m.SetFloat("_DoubleSidedEnable", 1);
                Hdrp.ResetKeywords(m);
            }
            else { m.color = c; m.SetFloat("_Glossiness", smooth); m.SetFloat("_Metallic", metal); }
            EditorUtility.SetDirty(m);
            cache[key] = m;
            return m;
        }
    }
}
