// Boats and aircraft in the Calvera scene: a wooden pier on piles at each of the three marinas (the web game's
// shoreline search finds where), a booth at the foot of each, Redgrass Airfield's runway (photo-scanned asphalt,
// edge stripes, centre dashes, threshold bars), the hangar with its arched roof and sliding doors, the apron, the
// helipad, the fuel pad and pump, the windsock; every boat and aircraft's shape baked into the project; the Fleet
// (marinas, dealers, flight school, refuelling) with Calvera's heights and water copied in so a build has them;
// and Piloting on John. Runs as part of Build Calvera scene, or on its own: Southbound > Add boats and aircraft.
using System.IO;
using System.Linq;
using Southbound.Core;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

namespace Southbound.EditorTools
{
    public static class CraftBuilder
    {
        const string RootName = "Boats and aircraft";

        [MenuItem("Southbound/Add boats and aircraft to this scene", priority = 46)]
        public static void AddToOpenScene()
        {
            if (Object.FindFirstObjectByType<SouthboundGame>() == null) { EditorUtility.DisplayDialog("Southbound", "Open the Calvera scene first (or build it: Southbound > Build Calvera scene).", "OK"); return; }
            try { Build(); }
            finally { EditorUtility.ClearProgressBar(); }
            EditorSceneManager.MarkSceneDirty(EditorSceneManager.GetActiveScene());
            EditorSceneManager.SaveOpenScenes();
            Debug.Log("Southbound: boats and aircraft added. Press Play: the speedboat waits at Lake Arden Marina, the Skylark on Redgrass Airfield's runway.");
        }

        public static void Build()
        {
            string dataDir = CalveraWorld.DefaultFolder(Paths.ProjectRoot);
            string missionsFile = MissionData.DefaultFile(Paths.ProjectRoot);
            if (!File.Exists(Path.Combine(dataDir, "calvera-world.json")) || !File.Exists(missionsFile)) { Debug.LogWarning("Southbound: no world or mission data, so no boats or aircraft."); return; }
            var w = CalveraWorld.Load(dataDir);
            var L = MissionData.Load(missionsFile);
            foreach (var old in Object.FindObjectsByType<Fleet>(FindObjectsSortMode.None)) Object.DestroyImmediate(old.gameObject);
            var oldRoot = GameObject.Find(RootName); if (oldRoot != null) Object.DestroyImmediate(oldRoot);
            var root = new GameObject(RootName).transform;

            EditorUtility.DisplayProgressBar("Southbound", "Marinas: piers and booths", 0.1f);
            var marinas = Harbours.Marinas(w, L);
            foreach (var m in marinas) Pier(w, m, root);
            EditorUtility.DisplayProgressBar("Southbound", "Redgrass Airfield", 0.2f);
            Airfield(w, L, root);

            // the fleet, with Calvera's ground and water in the project (a build has no Data folder)
            string dir = Paths.Generated + "/World";
            Paths.Ensure(dir);
            File.Copy(Path.Combine(dataDir, "calvera-heights.r16"), Paths.Abs(dir + "/calvera-heights.bytes"), true);
            File.Copy(Path.Combine(dataDir, "calvera-water.r16"), Paths.Abs(dir + "/calvera-water.bytes"), true);
            string mdir = Paths.Generated + "/Missions"; Paths.Ensure(mdir);
            if (!File.Exists(Paths.Abs(mdir + "/calvera-missions.json"))) File.Copy(missionsFile, Paths.Abs(mdir + "/calvera-missions.json"), true);
            AssetDatabase.Refresh();
            var fleet = new GameObject("Fleet (marinas, airfield, flight school)").AddComponent<Fleet>();
            fleet.heights = AssetDatabase.LoadAssetAtPath<TextAsset>(dir + "/calvera-heights.bytes");
            fleet.water = AssetDatabase.LoadAssetAtPath<TextAsset>(dir + "/calvera-water.bytes");
            fleet.missions = AssetDatabase.LoadAssetAtPath<TextAsset>(mdir + "/calvera-missions.json");
            fleet.half = w.Half; fleet.cell = w.Cell; fleet.n = w.N; fleet.hMin = w.HMin; fleet.hMax = w.HMax; fleet.waterMin = w.WaterMin; fleet.waterMax = w.WaterMax; fleet.seaLevel = w.SeaLevel;

            // every craft's shape, baked
            string cdir = Paths.Generated + "/Craft"; Paths.Ensure(cdir);
            var all = CraftCatalog.Boats.Concat(CraftCatalog.Aircraft).ToList();
            var meshes = new Mesh[all.Count];
            for (int i = 0; i < all.Count; i++)
            {
                EditorUtility.DisplayProgressBar("Southbound", $"Shaping the {all[i].Name}", 0.3f + 0.65f * i / all.Count);
                string path = $"{cdir}/{all[i].Id}.asset";
                var mesh = AssetDatabase.LoadAssetAtPath<Mesh>(path);
                if (mesh == null) { mesh = CraftBody.ToUnity(CraftShape.Build(all[i]), all[i].Name); AssetDatabase.CreateAsset(mesh, path); }
                meshes[i] = mesh;
            }
            fleet.bakedIds = all.Select(e => e.Id).ToArray();
            fleet.bakedMeshes = meshes;

            // John can go aboard
            var player = Object.FindFirstObjectByType<PlayerController>();
            if (player != null)
            {
                var pil = player.GetComponent<Piloting>() ?? player.gameObject.AddComponent<Piloting>();
                pil.cameraRig = Object.FindFirstObjectByType<ThirdPersonCamera>();
            }
            AssetDatabase.SaveAssets();
            Debug.Log($"Southbound: {marinas.Count} marinas ({string.Join(", ", marinas.Select(m => m.Name))}), Redgrass Airfield, {all.Count} boats and aircraft shaped.");
        }

        static Vector3 U(double x, double y, double z) => new Vector3(-(float)x, (float)y, (float)z);

        // ------------------------------------------------------------------ marinas
        static void Pier(CalveraWorld w, Harbours.Marina m, Transform root)
        {
            var g = new GameObject(m.Name).transform; g.SetParent(root, false);
            double dx = m.WaterX - m.LandX, dz = m.WaterZ - m.LandZ, L = System.Math.Sqrt(dx * dx + dz * dz) + 6;
            double wl = w.WaterLevel(m.WaterX, m.WaterZ);
            float top = (float)wl + 0.75f;
            var mid = U((m.LandX + m.WaterX) / 2, top - 0.15, (m.LandZ + m.WaterZ) / 2);
            var dir = new Vector3(-(float)dx, 0, (float)dz).normalized;
            var rot = Quaternion.LookRotation(dir);
            var wood = Surfaces.Get("WoodFloor007");
            var deck = Block("Pier deck", new Vector3(3, 0.3f, (float)L), wood, g, mid, rot, 2f);
            deck.AddComponent<BoxCollider>();
            deck.AddComponent<SurfaceTag>().surface = "wood";
            // piles every 3 m down to the bed, on both sides
            for (float t = 1.5f; t < L; t += 3f)
                foreach (float side in new[] { -1.35f, 1.35f })
                {
                    var p = mid + dir * (t - (float)L / 2) + Vector3.Cross(Vector3.up, dir) * side;
                    double bed = w.HeightAt(-p.x, p.z);
                    float h = top - (float)bed + 0.2f;
                    if (h < 0.4f) continue;
                    var pile = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
                    pile.name = "Pile"; Object.DestroyImmediate(pile.GetComponent<Collider>());
                    pile.transform.SetParent(g, false);
                    pile.transform.position = new Vector3(p.x, top - h / 2, p.z);
                    pile.transform.localScale = new Vector3(0.28f, h / 2, 0.28f);
                    pile.GetComponent<MeshRenderer>().sharedMaterial = wood;
                }
            // the booth at the foot of the pier, where you buy and launch
            var at = U(m.LandX, w.HeightAt(m.LandX, m.LandZ), m.LandZ) - dir * 3.2f;
            var booth = Block("Booth", new Vector3(3.2f, 2.8f, 2.6f), Surfaces.Get("WoodSiding009"), g, at + Vector3.up * 1.4f, rot, 2f);
            booth.AddComponent<BoxCollider>();
            Block("Booth roof", new Vector3(3.8f, 0.18f, 3.2f), Surfaces.Get("CorrugatedSteel005"), g, at + Vector3.up * 2.9f, rot, 2f);
            Block("Sign", new Vector3(2.4f, 0.6f, 0.08f), Paint(new Color(0.08f, 0.32f, 0.42f)), g, at + Vector3.up * 3.4f + dir * 1.25f, rot, 1f);
        }

        // ------------------------------------------------------------------ Redgrass Airfield
        static void Airfield(CalveraWorld w, MissionData L, Transform root)
        {
            var g = new GameObject("Redgrass Airfield").transform; g.SetParent(root, false);
            float y = (float)L.AirfieldHeight;
            var asphalt = Surfaces.Get("Asphalt031");
            var white = Paint(new Color(0.87f, 0.86f, 0.82f));
            double x0 = L.AirfieldX0, x1 = L.AirfieldX1, z = L.AirfieldZ, wd = L.AirfieldW;
            // the runway and the taxiway to the apron
            var rw = Block("Runway", new Vector3((float)(x1 - x0), 0.2f, (float)wd), asphalt, g, U((x0 + x1) / 2, y - 0.07, z), Quaternion.identity, 4f);
            rw.AddComponent<BoxCollider>(); rw.AddComponent<SurfaceTag>().surface = "asphalt";
            var tw = Block("Taxiway", new Vector3(120, 0.2f, (float)(60 - wd / 2)), asphalt, g, U(x1 - 60, y - 0.07, z - 60 / 2.0 - wd / 4), Quaternion.identity, 4f);
            tw.AddComponent<BoxCollider>();
            foreach (var sd in new[] { -1, 1 }) Block("Edge stripe", new Vector3((float)(x1 - x0 - 8), 0.03f, 0.9f), white, g, U((x0 + x1) / 2, y + 0.045, z + sd * (wd / 2 - 1.2)), Quaternion.identity, 0);
            for (double x = x0 + 40; x < x1 - 40; x += 22) Block("Centre dash", new Vector3(14, 0.03f, 0.6f), white, g, U(x, y + 0.045, z), Quaternion.identity, 0);
            foreach (var x in new[] { x0 + 14, x1 - 14 }) for (int k = -5; k <= 5; k++) if (k != 0) Block("Threshold bar", new Vector3(19.6f, 0.03f, 0.96f), white, g, U(x, y + 0.045, z + k * 2.6), Quaternion.identity, 0);
            // the hangar: steel walls down to the lowest corner of the ground, an arched roof, sliding doors facing the runway
            var (hx, hz) = Harbours.Hangar(L);
            double low = new[] { (-20, -14), (20, -14), (-20, 14), (20, 14) }.Select(c => w.HeightAt(hx + c.Item1, hz + c.Item2)).Append(L.AirfieldHeight).Min() - 0.15;
            var steel = Surfaces.Get("CorrugatedSteel005");
            var hangar = Block("Hangar", new Vector3(40, (float)(12 + y - low), 28), steel, g, U(hx, (y + 12 + low) / 2, hz), Quaternion.identity, 3f);
            hangar.AddComponent<BoxCollider>(); hangar.AddComponent<SurfaceTag>().surface = "metal";
            var roof = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            roof.name = "Hangar roof"; Object.DestroyImmediate(roof.GetComponent<Collider>());
            roof.transform.SetParent(g, false); roof.transform.position = U(hx, y + 12, hz); roof.transform.rotation = Quaternion.Euler(90, 0, 0);
            roof.transform.localScale = new Vector3(40.6f, 14.3f, 12f);
            roof.GetComponent<MeshRenderer>().sharedMaterial = steel;
            var doorMat = Paint(new Color(0.36f, 0.39f, 0.38f));
            for (int k = 0; k < 4; k++) Block("Hangar door", new Vector3(8.9f, 10.2f, 0.16f), doorMat, g, U(hx - 13.5 + k * 9, y + 5.1, hz + 14.08 + (k % 2) * 0.18), Quaternion.identity, 0);
            Block("Apron", new Vector3(44, 0.2f, 30), Surfaces.Get("Concrete034"), g, U(hx, y - 0.06, hz + 29), Quaternion.identity, 3f).AddComponent<BoxCollider>();
            ClearTrees(new Rect(-(float)(hx + 26), (float)(hz - 20), 52, 84));
            // the helipad and the fuel pad
            var (px, pz, _) = Harbours.HeliPad(L);
            var pad = GameObject.CreatePrimitive(PrimitiveType.Cylinder); pad.name = "Helipad"; Object.DestroyImmediate(pad.GetComponent<Collider>());
            pad.transform.SetParent(g, false); pad.transform.position = U(px, w.HeightAt(px, pz) + 0.05, pz); pad.transform.localScale = new Vector3(16, 0.08f, 16);
            pad.GetComponent<MeshRenderer>().sharedMaterial = Surfaces.Get("Concrete034");
            var hy = w.HeightAt(px, pz) + 0.14;
            Block("H", new Vector3(0.9f, 0.03f, 6), white, g, U(px - 1.8, hy, pz), Quaternion.identity, 0);
            Block("H", new Vector3(0.9f, 0.03f, 6), white, g, U(px + 1.8, hy, pz), Quaternion.identity, 0);
            Block("H", new Vector3(3.6f, 0.03f, 0.9f), white, g, U(px, hy, pz), Quaternion.identity, 0);
            var (fx, fz) = Harbours.FuelPad(L);
            Block("Fuel pad", new Vector3(18, 0.04f, 18), Paint(new Color(0.75f, 0.62f, 0.18f)), g, U(fx, y + 0.03, fz), Quaternion.identity, 0);
            Block("Fuel pump", new Vector3(0.9f, 1.8f, 0.6f), Paint(new Color(0.75f, 0.12f, 0.08f)), g, U(fx, y + 0.9, fz - 10), Quaternion.identity, 0).AddComponent<BoxCollider>();
            // the windsock
            double sx = x1 - 130, sz = z - 32;
            var pole = GameObject.CreatePrimitive(PrimitiveType.Cylinder); pole.name = "Windsock pole";
            pole.transform.SetParent(g, false); pole.transform.position = U(sx, w.HeightAt(sx, sz) + 3, sz); pole.transform.localScale = new Vector3(0.14f, 3, 0.14f);
            pole.GetComponent<MeshRenderer>().sharedMaterial = Paint(new Color(0.8f, 0.8f, 0.8f));
            var sock = GameObject.CreatePrimitive(PrimitiveType.Cylinder); sock.name = "Windsock"; Object.DestroyImmediate(sock.GetComponent<Collider>());
            sock.transform.SetParent(g, false); sock.transform.position = U(sx - 1.1, w.HeightAt(sx, sz) + 5.8, sz); sock.transform.rotation = Quaternion.Euler(0, 0, 90); sock.transform.localScale = new Vector3(0.6f, 1.1f, 0.6f);
            sock.GetComponent<MeshRenderer>().sharedMaterial = Paint(new Color(1f, 0.42f, 0.1f));
        }

        /// <summary>Take the trees out from under something (terrain trees in a Unity-space rectangle).</summary>
        static void ClearTrees(Rect r)
        {
            var t = Terrain.activeTerrain;
            if (t == null) return;
            var td = t.terrainData; var o = t.transform.position; var size = td.size;
            td.treeInstances = td.treeInstances.Where(ti => { var p = new Vector2(o.x + ti.position.x * size.x, o.z + ti.position.z * size.z); return !r.Contains(p); }).ToArray();
        }

        /// <summary>A box with its texture at real-world scale (tile metres per repeat; 0: plain).</summary>
        static GameObject Block(string name, Vector3 size, Material m, Transform parent, Vector3 at, Quaternion rot, float tile)
        {
            var go = new GameObject(name);
            go.transform.SetParent(parent, false);
            go.transform.SetPositionAndRotation(at, rot);
            go.AddComponent<MeshFilter>().sharedMesh = BoxMesh(size, tile);
            go.AddComponent<MeshRenderer>().sharedMaterial = m;
            GameObjectUtility.SetStaticEditorFlags(go, StaticEditorFlags.BatchingStatic | StaticEditorFlags.ContributeGI);
            return go;
        }

        static Mesh BoxMesh(Vector3 s, float tile)
        {
            var h = s / 2;
            var v = new System.Collections.Generic.List<Vector3>(); var n = new System.Collections.Generic.List<Vector3>(); var uv = new System.Collections.Generic.List<Vector2>(); var tri = new System.Collections.Generic.List<int>();
            void Face(Vector3 normal, Vector3 u, Vector3 w, float su, float sw)
            {
                int b = v.Count;
                var c = Vector3.Scale(normal, h);
                var hu = Vector3.Scale(u, h); var hw = Vector3.Scale(w, h);
                v.Add(c - hu - hw); v.Add(c + hu - hw); v.Add(c + hu + hw); v.Add(c - hu + hw);
                for (int i = 0; i < 4; i++) n.Add(normal);
                float ku = tile > 0 ? su / tile : 1, kw = tile > 0 ? sw / tile : 1;
                uv.Add(new Vector2(0, 0)); uv.Add(new Vector2(ku, 0)); uv.Add(new Vector2(ku, kw)); uv.Add(new Vector2(0, kw));
                // wound so the face looks along its normal in Unity (clockwise seen from outside)
                if (Vector3.Dot(Vector3.Cross(v[b + 1] - v[b], v[b + 2] - v[b]), normal) > 0) { tri.Add(b); tri.Add(b + 2); tri.Add(b + 1); tri.Add(b); tri.Add(b + 3); tri.Add(b + 2); }
                else { tri.Add(b); tri.Add(b + 1); tri.Add(b + 2); tri.Add(b); tri.Add(b + 2); tri.Add(b + 3); }
            }
            Face(Vector3.up, Vector3.right, Vector3.forward, s.x, s.z); Face(Vector3.down, Vector3.right, Vector3.forward, s.x, s.z);
            Face(Vector3.right, Vector3.forward, Vector3.up, s.z, s.y); Face(Vector3.left, Vector3.forward, Vector3.up, s.z, s.y);
            Face(Vector3.forward, Vector3.right, Vector3.up, s.x, s.y); Face(Vector3.back, Vector3.right, Vector3.up, s.x, s.y);
            var m = new Mesh { name = "Box" };
            m.SetVertices(v); m.SetNormals(n); m.SetUVs(0, uv); m.SetTriangles(tri, 0);
            m.RecalculateBounds(); m.RecalculateTangents();
            return m;
        }

        static readonly System.Collections.Generic.Dictionary<Color, Material> paints = new System.Collections.Generic.Dictionary<Color, Material>();
        static Material Paint(Color c)
        {
            if (paints.TryGetValue(c, out var m) && m != null) return m;
            string path = $"{Paths.Materials}/Paint_{ColorUtility.ToHtmlStringRGB(c)}.mat";
            m = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (m == null)
            {
                Paths.Ensure(Paths.Materials);
                m = Hdrp.Lit(); m.name = "Paint " + ColorUtility.ToHtmlStringRGB(c);
                m.SetColor("_BaseColor", c); m.color = c; m.SetFloat("_Smoothness", 0.3f);
                AssetDatabase.CreateAsset(m, path);
            }
            paints[c] = m;
            return m;
        }
    }
}
