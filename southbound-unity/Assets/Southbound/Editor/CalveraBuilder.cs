// Builds Calvera in Unity from the web game's own data (Data/World/): the 4 km
// terrain with its ground cover, the sea, lakes and rivers, every road, every
// building and gable roof, all 47 000 trees and bushes, a sun and sky, the
// cars parked around town (John's rusty pickup by the spawn), and John with a
// camera, a gun and a shooting range to try the wall penetration.
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Southbound.Core;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;

namespace Southbound.EditorTools
{
    public static class CalveraBuilder
    {
        const string ScenePath = Paths.Scenes + "/Calvera.unity";
        const string MeshDir = Paths.Scenes + "/Calvera_Meshes";

        [MenuItem("Southbound/Build Calvera scene", priority = 40)]
        public static void Build()
        {
            string dataDir = CalveraWorld.DefaultFolder(Paths.ProjectRoot);
            if (!File.Exists(Path.Combine(dataDir, "calvera-world.json")))
            {
                EditorUtility.DisplayDialog("Southbound", $"No world data in {dataDir}.\nRun: node tools/southbound/export-unity.mjs world", "OK");
                return;
            }
            if (!EditorSceneManager.SaveCurrentModifiedScenesIfUserWantsTo()) return;
            try
            {
                EditorUtility.DisplayProgressBar("Southbound", "Reading Calvera", 0.02f);
                var world = CalveraWorld.Load(dataDir);
                Paths.Ensure(Paths.Scenes);
                Paths.Ensure(MeshDir);
                if (!File.Exists(Paths.Abs($"{Paths.Materials}/Asphalt012.mat"))) Surfaces.BuildAll();
                var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);

                EditorUtility.DisplayProgressBar("Southbound", "Terrain", 0.1f);
                var terrain = BuildTerrain(world);
                EditorUtility.DisplayProgressBar("Southbound", "Water", 0.35f);
                BuildWater(world);
                EditorUtility.DisplayProgressBar("Southbound", "Roads", 0.45f);
                BuildRoads(world);
                EditorUtility.DisplayProgressBar("Southbound", "Buildings", 0.55f);
                BuildBuildings(world);
                EditorUtility.DisplayProgressBar("Southbound", "Cornices, shopfronts, porches, window sills", 0.62f);
                FacadeBuilder.Build(dataDir, MeshDir);
                EditorUtility.DisplayProgressBar("Southbound", "Trees", 0.7f);
                Vegetation.Plant(world, terrain);
                EditorUtility.DisplayProgressBar("Southbound", "Sun, sky and John", 0.9f);
                var sun = BuildLighting();
                var john = BuildPlayer(world, sun);
                BuildRange(john.transform.position, john.transform.forward);
                EditorUtility.DisplayProgressBar("Southbound", "Parked cars", 0.94f);
                CarFactory.PlaceParked(dataDir);

                EditorSceneManager.SaveScene(scene, ScenePath);
                AddToBuildSettings(ScenePath);
                Debug.Log($"Southbound: Calvera built ({world.Buildings.Count} buildings, {world.Roads.Count} roads, {world.Plants.Count} plants). Press Play.");
            }
            finally { EditorUtility.ClearProgressBar(); }
        }

        static Vector3 U(double webX, double y, double webZ) { var (x, z) = CalveraWorld.ToUnity(webX, webZ); return new Vector3((float)x, (float)y, (float)z); }

        static Mesh SaveMesh(Mesh m, string name)
        {
            string path = $"{MeshDir}/{name}.asset";
            AssetDatabase.DeleteAsset(path);
            AssetDatabase.CreateAsset(m, path);
            return m;
        }

        static GameObject MeshObject(string name, Mesh mesh, Material[] mats, Transform parent, bool shadows = true)
        {
            var go = new GameObject(name);
            go.transform.SetParent(parent, false);
            go.AddComponent<MeshFilter>().sharedMesh = mesh;
            var r = go.AddComponent<MeshRenderer>();
            r.sharedMaterials = mats;
            r.shadowCastingMode = shadows ? ShadowCastingMode.On : ShadowCastingMode.Off;
            GameObjectUtility.SetStaticEditorFlags(go, StaticEditorFlags.BatchingStatic | StaticEditorFlags.ContributeGI | StaticEditorFlags.OccluderStatic | StaticEditorFlags.OccludeeStatic);
            return go;
        }

        // ------------------------------------------------------------------ terrain
        static Terrain BuildTerrain(CalveraWorld w)
        {
            var td = new TerrainData { heightmapResolution = w.N };
            td.size = new Vector3((float)w.Size, (float)(w.HMax - w.HMin), (float)w.Size);
            td.SetHeights(0, 0, w.UnityTerrainHeights());
            // ground cover: grass, dry grass, sand, forest floor, paved, rock (by slope)
            string[] sets = { "Grass004", "Ground037", "coast_sand_01", "forest_ground_04", "Concrete034", "cliff_side" };
            td.terrainLayers = sets.Select(s => Surfaces.Layer(MaterialLibrary.Get(s))).ToArray();
            int ar = w.N - 1;
            td.alphamapResolution = ar;
            var splat = LoadSplat(w.N);
            var a = new float[ar, ar, sets.Length];
            for (int row = 0; row < ar; row++)
                for (int col = 0; col < ar; col++)
                {
                    int k = w.WebIndexForUnityCell(row, col);
                    int i = k % w.N, j = k / w.N;
                    float s = 0, f = 0, d = 0, p = 0;
                    if (splat != null)
                    {
                        var c = splat[(w.N - 1 - j) * w.N + i]; // PNG rows load bottom-up
                        s = c.r / 255f; f = c.g / 255f; d = c.b / 255f; p = c.a / 255f;
                    }
                    // slope from the heights
                    int i1 = Mathf.Min(i + 1, w.N - 1), j1 = Mathf.Min(j + 1, w.N - 1);
                    float dx = w.Heights[j * w.N + i1] - w.Heights[k], dz = w.Heights[j1 * w.N + i] - w.Heights[k];
                    float slope = Mathf.Sqrt(dx * dx + dz * dz) / (float)w.Cell;
                    float rock = Mathf.Clamp01((slope - 0.55f) / 0.35f) * (1 - p);
                    float rest = 1 - p;
                    float wSand = s * rest; rest -= wSand;
                    float wForest = f * rest; rest -= wForest;
                    float wDry = d * rest; rest -= wDry;
                    float wGrass = rest;
                    float[] wts = { wGrass, wDry, wSand, wForest, p, 0 };
                    for (int l = 0; l < 5; l++) wts[l] *= 1 - rock;
                    wts[5] = rock;
                    float sum = wts.Sum();
                    for (int l = 0; l < wts.Length; l++) a[row, col, l] = sum > 0 ? wts[l] / sum : (l == 0 ? 1 : 0);
                }
            td.SetAlphamaps(0, 0, a);
            string tdPath = Paths.Scenes + "/Calvera_Terrain.asset";
            AssetDatabase.DeleteAsset(tdPath);
            AssetDatabase.CreateAsset(td, tdPath);
            var go = Terrain.CreateTerrainGameObject(td);
            go.name = "Calvera Terrain";
            go.transform.position = new Vector3((float)-w.Half, (float)w.HMin, (float)-w.Half);
            var t = go.GetComponent<Terrain>();
            t.heightmapPixelError = 2;
            t.basemapDistance = 400;
            t.drawInstanced = true;
            t.treeDistance = 1200;
            t.treeBillboardDistance = 160;
            t.treeCrossFadeLength = 20;
            t.treeMaximumFullLODCount = 400;
            t.detailObjectDistance = 120;
            go.AddComponent<SurfaceTag>().surface = "stone";
            return t;
        }

        static Color32[] LoadSplat(int n)
        {
            string p = Path.Combine(CalveraWorld.DefaultFolder(Paths.ProjectRoot), "calvera-splat.png");
            if (!File.Exists(p)) return null;
            var px = Surfaces.Load(p, out int w, out int h);
            return w == n && h == n ? px : null;
        }

        // ------------------------------------------------------------------ water
        static void BuildWater(CalveraWorld w)
        {
            var root = new GameObject("Water").transform;
            var mat = WaterMaterial();
            var waterType = Hdrp.FindType("UnityEngine.Rendering.HighDefinition.WaterSurface");
            // the Gulf: HDRP's ocean (waves, foam, caustics, under water) out to the horizon, or a plane without it
            if (waterType != null)
            {
                var sea = new GameObject("Gulf of Calvera (HDRP ocean)");
                sea.transform.SetParent(root, false);
                sea.transform.position = new Vector3(0, (float)w.SeaLevel, 0);
                WaterLook.Ocean(sea.AddComponent(waterType));
            }
            else
            {
                var sea = new Mesh { name = "Sea" };
                float S = 12000;
                sea.vertices = new[] { new Vector3(-S, 0, -S), new Vector3(S, 0, -S), new Vector3(S, 0, S), new Vector3(-S, 0, S) };
                sea.uv = new[] { new Vector2(0, 0), new Vector2(S / 4, 0), new Vector2(S / 4, S / 4), new Vector2(0, S / 4) };
                sea.triangles = new[] { 0, 2, 1, 0, 3, 2 };
                sea.RecalculateNormals(); sea.RecalculateBounds();
                MeshObject("Sea", SaveMesh(sea, "Sea"), new[] { mat }, root, false).transform.position = new Vector3(0, (float)w.SeaLevel - 0.05f, 0);
            }
            // inland: each level lake its own HDRP water surface (Lake Arden, the pond); the rivers a sloped mesh
            int lakeNo = 0;
            foreach (var body in WaterBodies.Split(w))
            {
                var v = new List<Vector3>(); var tri = new List<int>();
                int n = w.N;
                foreach (var (i, j) in body.Cells)
                {
                    int o = v.Count;
                    double x0 = -w.Half + i * w.Cell, z0 = -w.Half + j * w.Cell;
                    if (body.Lake)
                    {
                        // flat at 0 (the surface sits at the lake's level), half a cell wider so it meets the shore
                        double e = w.Cell * 0.5;
                        v.Add(U(x0 - e, 0, z0 - e)); v.Add(U(x0 + w.Cell + e, 0, z0 - e)); v.Add(U(x0 + w.Cell + e, 0, z0 + w.Cell + e)); v.Add(U(x0 - e, 0, z0 + w.Cell + e));
                    }
                    else
                    {
                        float a = w.Water[j * n + i], b = w.Water[j * n + i + 1], c = w.Water[(j + 1) * n + i + 1], d = w.Water[(j + 1) * n + i];
                        v.Add(U(x0, a, z0)); v.Add(U(x0 + w.Cell, b, z0)); v.Add(U(x0 + w.Cell, c, z0 + w.Cell)); v.Add(U(x0, d, z0 + w.Cell));
                    }
                    // X is mirrored, so the winding flips to keep the faces up
                    tri.AddRange(new[] { o, o + 1, o + 2, o, o + 2, o + 3 });
                }
                string name = body.Lake ? (lakeNo++ == 0 ? "Lake Arden" : $"Lake {lakeNo}") : "Rivers";
                var m = new Mesh { name = name, indexFormat = IndexFormat.UInt32 };
                m.SetVertices(v); m.SetTriangles(tri, 0);
                m.SetUVs(0, v.Select(p => new Vector2(p.x / 4, p.z / 4)).ToList());
                m.RecalculateNormals(); m.RecalculateBounds();
                var go = MeshObject(name, SaveMesh(m, name.Replace(' ', '_')), new[] { mat }, root, false);
                if (body.Lake)
                {
                    go.transform.position = new Vector3(0, body.Level, 0);
                    if (waterType != null)
                    {
                        // HDRP draws the water on this mesh itself; the plain renderer stays hidden
                        var r = go.GetComponent<MeshRenderer>();
                        r.enabled = false;
                        WaterLook.Lake(go.AddComponent(waterType), r);
                    }
                }
            }
        }

        static Material WaterMaterial()
        {
            string path = $"{Paths.Materials}/Water.mat";
            var m = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (m == null) { m = Hdrp.Lit(); m.name = "Water"; AssetDatabase.CreateAsset(m, path); }
            var deep = new Color(0.02f, 0.07f, 0.08f);
            if (Hdrp.IsHdrpShader(m))
            {
                m.SetColor("_BaseColor", deep);
                m.SetFloat("_Smoothness", 0.96f);
                m.SetFloat("_Metallic", 0f);
                m.SetTexture("_NormalMap", Surfaces.Find("coast_sand_01")?.Normal);
                m.SetFloat("_NormalScale", 0.15f);
                Hdrp.ResetKeywords(m);
            }
            else { m.color = deep; m.SetFloat("_Glossiness", 0.96f); }
            EditorUtility.SetDirty(m);
            return m;
        }

        // ------------------------------------------------------------------ roads
        static void BuildRoads(CalveraWorld w)
        {
            var root = new GameObject("Roads").transform;
            foreach (var group in w.Roads.GroupBy(r => CalveraWorld.RoadSurface(r.Kind)))
            {
                var v = new List<Vector3>(); var uv = new List<Vector2>(); var tri = new List<int>();
                foreach (var road in group)
                {
                    var pts = road.Points;
                    if (pts.Count < 2) continue;
                    float half = (float)road.Width / 2;
                    float along = 0;
                    Vector3 last = Vector3.zero;
                    int start = v.Count;
                    for (int k = 0; k < pts.Count; k++)
                    {
                        var p = pts[k];
                        var prev = pts[Mathf.Max(0, k - 1)]; var next = pts[Mathf.Min(pts.Count - 1, k + 1)];
                        Vector3 c = U(p.x, w.HeightAt(p.x, p.z) + 0.06, p.z);
                        Vector3 dir = U(next.x, 0, next.z) - U(prev.x, 0, prev.z); dir.y = 0;
                        if (dir.sqrMagnitude < 1e-6f) dir = Vector3.forward;
                        dir.Normalize();
                        Vector3 side = new Vector3(dir.z, 0, -dir.x) * half;
                        if (k > 0) along += Vector3.Distance(c, last);
                        last = c;
                        Vector3 l = c - side, r = c + side;
                        l.y = (float)w.HeightAt(-l.x, l.z) + 0.06f; r.y = (float)w.HeightAt(-r.x, r.z) + 0.06f;
                        v.Add(l); v.Add(r);
                        uv.Add(new Vector2(0, along)); uv.Add(new Vector2((float)road.Width, along));
                        if (k > 0)
                        {
                            int o = start + (k - 1) * 2;
                            tri.AddRange(new[] { o, o + 2, o + 1, o + 1, o + 2, o + 3 });
                        }
                    }
                }
                var m = new Mesh { name = "Roads " + group.Key, indexFormat = IndexFormat.UInt32 };
                m.SetVertices(v); m.SetUVs(0, uv); m.SetTriangles(tri, 0);
                m.RecalculateNormals();
                FixUp(m);
                m.RecalculateTangents(); m.RecalculateBounds();
                var roadGo = MeshObject("Roads " + group.Key, SaveMesh(m, "Roads_" + group.Key), new[] { Surfaces.Get(group.Key) }, root, false);
                roadGo.AddComponent<MeshCollider>().sharedMesh = m; // cars ride on the asphalt, not the ground 6 cm under it
            }
        }

        /// <summary>If a ribbon came out facing down (winding after the mirror), flip it.</summary>
        static void FixUp(Mesh m)
        {
            var n = m.normals;
            if (n.Length == 0 || n.Average(x => x.y) >= 0) return;
            var t = m.triangles;
            for (int i = 0; i < t.Length; i += 3) { int s = t[i + 1]; t[i + 1] = t[i + 2]; t[i + 2] = s; }
            m.triangles = t;
            m.RecalculateNormals();
        }

        // ------------------------------------------------------------------ buildings
        static void BuildBuildings(CalveraWorld w)
        {
            var root = new GameObject("Buildings").transform;
            var colliders = new GameObject("Building colliders").transform;
            colliders.SetParent(root, false);
            // each building its own cladding (BuildingLook): a photo-scanned wall, painted in the web game's colour
            var groups = new Dictionary<string, (MeshBuilder mb, Cladding c)>();
            for (int bi = 0; bi < w.Buildings.Count; bi++)
            {
                var b = w.Buildings[bi];
                var look = BuildingLook.For(b.Style, b.Color, bi);
                string key = look.Key + "|" + look.Top;
                if (!groups.TryGetValue(key, out var g)) groups[key] = g = (new MeshBuilder(2), look);
                float y0 = (float)b.Y - 2, y1 = (float)(b.Y + b.H);
                var c = U(b.X, 0, b.Z);
                g.mb.Box(new Vector3(c.x, (y0 + y1) / 2, c.z), new Vector3((float)b.W, y1 - y0, (float)b.D), wallsSub: 0, topSub: 1);
                var col = new GameObject("building").AddComponent<BoxCollider>();
                col.transform.SetParent(colliders, false);
                col.transform.position = new Vector3(c.x, (y0 + y1) / 2, c.z);
                col.size = new Vector3((float)b.W, y1 - y0, (float)b.D);
                col.gameObject.AddComponent<SurfaceTag>().surface = CalveraWorld.SurfFor(b.Style);
                col.gameObject.isStatic = true;
            }
            int n = 0;
            foreach (var (mb, look) in groups.Values)
            {
                string name = $"Buildings {look.Key}";
                var mesh = mb.ToMesh(name);
                MeshObject(name, SaveMesh(mesh, "Buildings_" + (n++)), new[] { WallMaterial(look), Surfaces.Get(look.Top) }, root);
            }
            // gable roofs: ridge along X, or along Z when turned a quarter
            // shingles, clay barrel tiles or terracotta, roof by roof
            var roofGroups = new Dictionary<string, MeshBuilder>();
            for (int ri = 0; ri < w.Roofs.Count; ri++)
            {
                var r = w.Roofs[ri];
                string set = BuildingLook.Roof(ri);
                if (!roofGroups.TryGetValue(set, out var rb)) roofGroups[set] = rb = new MeshBuilder(2);
                bool alongZ = Mathf.Abs(Mathf.Sin((float)r.Rot)) > 0.5f;
                rb.Gable(U(r.X, r.Y, r.Z), (float)r.W, (float)r.D, (float)r.H, alongZ, slopeSub: 0, gableSub: 1);
            }
            foreach (var kv in roofGroups)
                MeshObject("Roofs " + kv.Key, SaveMesh(kv.Value.ToMesh("Roofs " + kv.Key), "Roofs_" + kv.Key), new[] { Surfaces.Get(kv.Key), Surfaces.Get("WoodSiding009") }, root);
        }

        /// <summary>A wall material: the set's own, or a tinted copy of it (saved once per colour) for painted walls.</summary>
        static Material WallMaterial(Cladding look)
        {
            var baseMat = Surfaces.Get(look.Wall);
            if (baseMat == null || (look.R > 0.99 && look.G > 0.99 && look.B > 0.99)) return baseMat;
            string dir = $"{Paths.Materials}/Variants";
            Paths.Ensure(dir);
            string path = $"{dir}/{look.Key}.mat";
            var m = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (m == null) { m = new Material(baseMat) { name = look.Key }; AssetDatabase.CreateAsset(m, path); }
            else m.CopyPropertiesFromMaterial(baseMat);
            // the tint is linear; material colours are authored gamma-encoded
            var tint = new Color((float)look.R, (float)look.G, (float)look.B).gamma;
            if (Hdrp.IsHdrpShader(m)) m.SetColor("_BaseColor", tint); else m.color = tint;
            EditorUtility.SetDirty(m);
            return m;
        }

        /// <summary>Boxes and roofs with UVs in metres (materials tile by 1 / real tile size).</summary>
        sealed class MeshBuilder
        {
            readonly List<Vector3> v = new List<Vector3>();
            readonly List<Vector3> n = new List<Vector3>();
            readonly List<Vector2> uv = new List<Vector2>();
            readonly List<int>[] subs;
            public MeshBuilder(int submeshes) { subs = Enumerable.Range(0, submeshes).Select(_ => new List<int>()).ToArray(); }

            void Quad(Vector3 a, Vector3 b, Vector3 c, Vector3 d, Vector3 normal, Vector2 ua, Vector2 ub, Vector2 uc, Vector2 ud, int sub)
            {
                int o = v.Count;
                v.AddRange(new[] { a, b, c, d });
                n.AddRange(new[] { normal, normal, normal, normal });
                uv.AddRange(new[] { ua, ub, uc, ud });
                // keep the front face towards the normal whatever order the corners came in
                bool flip = Vector3.Dot(Vector3.Cross(b - a, c - a), normal) < 0;
                subs[sub].AddRange(flip ? new[] { o, o + 2, o + 1, o, o + 3, o + 2 } : new[] { o, o + 1, o + 2, o, o + 2, o + 3 });
            }

            void Tri(Vector3 a, Vector3 b, Vector3 c, Vector3 normal, Vector2 ua, Vector2 ub, Vector2 uc, int sub)
            {
                int o = v.Count;
                v.AddRange(new[] { a, b, c });
                n.AddRange(new[] { normal, normal, normal });
                uv.AddRange(new[] { ua, ub, uc });
                bool flip = Vector3.Dot(Vector3.Cross(b - a, c - a), normal) < 0;
                subs[sub].AddRange(flip ? new[] { o, o + 2, o + 1 } : new[] { o, o + 1, o + 2 });
            }

            public void Box(Vector3 center, Vector3 size, int wallsSub, int topSub)
            {
                Vector3 h = size / 2;
                float x0 = center.x - h.x, x1 = center.x + h.x, y0 = center.y - h.y, y1 = center.y + h.y, z0 = center.z - h.z, z1 = center.z + h.z;
                // walls: u runs along the wall, v up, both in metres (world-anchored so neighbours line up)
                Quad(new Vector3(x0, y0, z0), new Vector3(x1, y0, z0), new Vector3(x1, y1, z0), new Vector3(x0, y1, z0), Vector3.back, new Vector2(x0, y0), new Vector2(x1, y0), new Vector2(x1, y1), new Vector2(x0, y1), wallsSub);
                Quad(new Vector3(x1, y0, z1), new Vector3(x0, y0, z1), new Vector3(x0, y1, z1), new Vector3(x1, y1, z1), Vector3.forward, new Vector2(-x1, y0), new Vector2(-x0, y0), new Vector2(-x0, y1), new Vector2(-x1, y1), wallsSub);
                Quad(new Vector3(x0, y0, z1), new Vector3(x0, y0, z0), new Vector3(x0, y1, z0), new Vector3(x0, y1, z1), Vector3.left, new Vector2(-z1, y0), new Vector2(-z0, y0), new Vector2(-z0, y1), new Vector2(-z1, y1), wallsSub);
                Quad(new Vector3(x1, y0, z0), new Vector3(x1, y0, z1), new Vector3(x1, y1, z1), new Vector3(x1, y1, z0), Vector3.right, new Vector2(z0, y0), new Vector2(z1, y0), new Vector2(z1, y1), new Vector2(z0, y1), wallsSub);
                Quad(new Vector3(x0, y1, z0), new Vector3(x1, y1, z0), new Vector3(x1, y1, z1), new Vector3(x0, y1, z1), Vector3.up, new Vector2(x0, z0), new Vector2(x1, z0), new Vector2(x1, z1), new Vector2(x0, z1), topSub);
            }

            public void Gable(Vector3 basePos, float w, float d, float h, bool alongZ, int slopeSub, int gableSub)
            {
                // ridge length L along the ridge axis, span S across it
                float L = alongZ ? d : w, S = alongZ ? w : d;
                Vector3 ax = alongZ ? Vector3.forward : Vector3.right, ac = alongZ ? Vector3.right : Vector3.forward;
                Vector3 P(float a, float y, float c) => basePos + ax * a + ac * c + Vector3.up * y;
                float hl = L / 2, hs = S / 2, slope = Mathf.Sqrt(hs * hs + h * h);
                Vector3 n1 = (ac * -h + Vector3.up * hs).normalized, n2 = (ac * h + Vector3.up * hs).normalized;
                Quad(P(-hl, 0, -hs), P(hl, 0, -hs), P(hl, h, 0), P(-hl, h, 0), n1, new Vector2(0, 0), new Vector2(L, 0), new Vector2(L, slope), new Vector2(0, slope), slopeSub);
                Quad(P(hl, 0, hs), P(-hl, 0, hs), P(-hl, h, 0), P(hl, h, 0), n2, new Vector2(0, 0), new Vector2(L, 0), new Vector2(L, slope), new Vector2(0, slope), slopeSub);
                Tri(P(-hl, 0, -hs), P(-hl, h, 0), P(-hl, 0, hs), -ax, new Vector2(0, 0), new Vector2(hs, h), new Vector2(S, 0), gableSub);
                Tri(P(hl, 0, hs), P(hl, h, 0), P(hl, 0, -hs), ax, new Vector2(0, 0), new Vector2(hs, h), new Vector2(S, 0), gableSub);
            }

            public Mesh ToMesh(string name)
            {
                var m = new Mesh { name = name, indexFormat = IndexFormat.UInt32, subMeshCount = subs.Length };
                m.SetVertices(v); m.SetNormals(n); m.SetUVs(0, uv);
                for (int i = 0; i < subs.Length; i++) m.SetTriangles(subs[i], i);
                m.RecalculateTangents(); m.RecalculateBounds();
                return m;
            }
        }

        // ------------------------------------------------------------------ light, player
        static Light BuildLighting()
        {
            var go = new GameObject("Sun");
            var sun = go.AddComponent<Light>();
            Hdrp.SetupSun(sun, 120000f);
            Hdrp.SetupCelestialBody(sun, 0.53f, 2f, null);
            go.transform.rotation = Quaternion.Euler(50, -30, 0);
            // the moon: a second, faint, cool directional light; DayNight hands it the shadows at night
            var moonGo = new GameObject("Moon");
            var moon = moonGo.AddComponent<Light>();
            Hdrp.SetupSun(moon, 0.35f);
            moon.colorTemperature = 7000f;
            moon.shadows = LightShadows.None;
            Hdrp.SetupCelestialBody(moon, 0.52f, 0.5f, null);
            var dn = new GameObject("Day and night").AddComponent<DayNight>();
            dn.sun = sun; dn.moon = moon;
            if (Hdrp.Installed)
            {
                PhotoLook.Features();
                PhotoLook.CreateVolume();
            }
            else
            {
                sun.intensity = 1.2f;
                moon.intensity = 0.02f;
                dn.sunLux = 1.2f; dn.moonLux = 0.05f;
                RenderSettings.ambientMode = AmbientMode.Trilight;
            }
            return sun;
        }

        static GameObject BuildPlayer(CalveraWorld w, Light sun)
        {
            var spawn = U(w.SpawnX, w.HeightAt(w.SpawnX, w.SpawnZ) + 0.05, w.SpawnZ);
            var john = new GameObject("John Cortes");
            john.transform.SetPositionAndRotation(spawn, Quaternion.Euler(0, (float)CalveraWorld.YawToUnity(w.SpawnHeading), 0));
            var cc = john.AddComponent<CharacterController>();
            cc.height = 1.8f; cc.radius = 0.3f; cc.center = new Vector3(0, 0.9f, 0); cc.stepOffset = 0.4f; cc.slopeLimit = 50;
            var pc = john.AddComponent<PlayerController>();

            // the character model and the animation skeleton (both imported by glTFast)
            var heroAsset = AssetDatabase.LoadAssetAtPath<GameObject>($"{Paths.Models}/people/hero.glb");
            var ualAsset = AssetDatabase.LoadAssetAtPath<GameObject>($"{Paths.Models}/anims/ual.glb");
            if (heroAsset != null)
            {
                var model = (GameObject)PrefabUtility.InstantiatePrefab(heroAsset);
                if (model == null) model = Object.Instantiate(heroAsset);
                model.name = "Model";
                model.transform.SetParent(john.transform, false);
                pc.model = model.transform;
                foreach (var col in model.GetComponentsInChildren<Collider>()) Object.DestroyImmediate(col);
                if (ualAsset != null)
                {
                    var skel = (GameObject)PrefabUtility.InstantiatePrefab(ualAsset) ?? Object.Instantiate(ualAsset);
                    skel.name = "Animation skeleton (UAL)";
                    skel.transform.SetParent(john.transform, false);
                    var rt = john.AddComponent<Retargeter>();
                    rt.sourceRoot = skel.transform;
                    rt.targetRoot = model.transform;
                    pc.animator = rt;
                }
            }
            else
            {
                Debug.LogWarning("Southbound: hero.glb isn't imported yet (install glTFast from the Southbound setup window). John is a capsule for now.");
                var cap = GameObject.CreatePrimitive(PrimitiveType.Capsule);
                Object.DestroyImmediate(cap.GetComponent<Collider>());
                cap.transform.SetParent(john.transform, false);
                cap.transform.localPosition = new Vector3(0, 0.9f, 0);
                pc.model = cap.transform;
            }

            var camGo = new GameObject("Main Camera") { tag = "MainCamera" };
            var cam = camGo.AddComponent<Camera>();
            cam.nearClipPlane = 0.08f; cam.farClipPlane = 9000f; cam.fieldOfView = 60;
            camGo.AddComponent<AudioListener>();
            var tpc = camGo.AddComponent<ThirdPersonCamera>();
            tpc.target = john.transform;
            camGo.transform.position = spawn + new Vector3(0, 2, -4);
            pc.cameraRig = camGo.transform;

            var holes = new GameObject("Bullet holes").AddComponent<BulletHoles>();
            holes.materials = HoleMaterials.All();
            holes.blood = HoleMaterials.Blood();
            var gun = john.AddComponent<Gunplay>();
            gun.cam = cam; gun.cameraRig = tpc; gun.player = pc; gun.holes = holes;
            gun.audioSource = john.AddComponent<AudioSource>();

            var drive = john.AddComponent<Driving>();
            drive.cameraRig = tpc;

            var game = new GameObject("Southbound").AddComponent<SouthboundGame>();
            game.sun = sun; game.player = pc; game.gunplay = gun; game.driving = drive;
            game.dayNight = Object.FindFirstObjectByType<DayNight>();
            game.gameObject.AddComponent<PhotoMode>();
            return john;
        }

        // ------------------------------------------------------------------ shooting range
        // Walls of every kind with targets behind them, next to the spawn: shoot through
        // drywall (studs every 16"), a door, sheet metal, brick, glass, and see what gets through.
        static void BuildRange(Vector3 at, Vector3 facing)
        {
            var root = new GameObject("Penetration range").transform;
            facing.y = 0; facing = facing.sqrMagnitude > 0.01f ? facing.normalized : Vector3.forward;
            var right = Vector3.Cross(Vector3.up, facing);
            root.position = at + facing * 12f;
            root.rotation = Quaternion.LookRotation(facing);
            var walls = new (string surf, string set, float thick, float width)[]
            {
                ("drywall", "plastered_wall_03", 0.12f, 2.4f), ("door", "WoodFloor007", 0.045f, 0.9f), ("metal", "CorrugatedSteel005", 0.02f, 1.6f),
                ("frame", "weathered_plank_siding", 0.18f, 2.4f), ("brick", "red_brick", 0.23f, 2.4f), ("block", "Concrete034", 0.2f, 2.4f), ("glass", "Facade002", 0.01f, 1.6f),
            };
            float x = -9;
            foreach (var wl in walls)
            {
                var wall = GameObject.CreatePrimitive(PrimitiveType.Cube);
                wall.name = $"{wl.surf} wall ({wl.thick * 100:0} cm)";
                wall.transform.SetParent(root, false);
                wall.transform.localPosition = new Vector3(x + wl.width / 2, 1.2f, 0);
                wall.transform.localScale = new Vector3(wl.width, 2.4f, wl.thick);
                wall.GetComponent<MeshRenderer>().sharedMaterial = Surfaces.Get(wl.set);
                wall.AddComponent<SurfaceTag>().surface = wl.surf;
                // a target standing behind each wall (one in a level III plate)
                var target = GameObject.CreatePrimitive(PrimitiveType.Capsule);
                target.name = $"Target behind {wl.surf}";
                target.transform.SetParent(root, false);
                target.transform.localPosition = new Vector3(x + wl.width / 2, 0.9f, 1.4f);
                var hp = target.AddComponent<Health>();
                hp.feet = -0.9f;
                if (wl.surf == "drywall") { hp.armour = 3; target.name += " (plate III)"; }
                x += wl.width + 0.6f;
            }
            var floor = GameObject.CreatePrimitive(PrimitiveType.Cube);
            floor.name = "Range pad";
            floor.transform.SetParent(root, false);
            floor.transform.localPosition = new Vector3(0, -0.05f, 0.5f);
            floor.transform.localScale = new Vector3(22, 0.1f, 6);
            floor.GetComponent<MeshRenderer>().sharedMaterial = Surfaces.Get("Concrete034");
            floor.AddComponent<SurfaceTag>().surface = "masonry";
        }

        static void AddToBuildSettings(string path)
        {
            var list = EditorBuildSettings.scenes.ToList();
            if (list.Any(s => s.path == path)) return;
            list.Insert(0, new EditorBuildSettingsScene(path, true));
            EditorBuildSettings.scenes = list.ToArray();
        }
    }
}
