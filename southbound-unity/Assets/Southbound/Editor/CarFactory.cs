// Makes the cars: one prefab per catalogue body (Data/Vehicles/cars.json), built the web game's way
// (Core/CarMeshBuilder: the body's distance field meshed by surface nets, four levels of detail,
// each triangle given its paint/glass/lamp slot) with the web game's wheels (Data/Vehicles/wheels.json),
// one shared HDRP Lit material that reads each car's palette, headlight beams and brake lights,
// collision boxes, a Rigidbody on raycast springs (CarController) and its look (CarBody).
//
//   Southbound > Cars > Build every car       all 101 prefabs (a few minutes)
//   Southbound > Cars > Car browser           pick one, build it, drop it in front of the scene camera
//
// Prefabs go to Assets/Southbound/Prefabs/Cars, meshes to Assets/Southbound/Art/Generated/Cars.
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Southbound.Core;
using UnityEditor;
using UnityEngine;
using UnityEngine.Rendering;

namespace Southbound.EditorTools
{
    public static class CarFactory
    {
        public const string PrefabDir = Paths.Prefabs + "/Cars";
        public const string MeshDir = Paths.Generated + "/Cars";
        const string WheelDir = MeshDir + "/Wheels";
        const string MaterialPath = Paths.Materials + "/CarPalette.mat";
        /// <summary>Screen height (fraction) below which each level gives way to the next; below the last the car isn't drawn.</summary>
        static readonly float[] LodHeights = { 0.22f, 0.08f, 0.028f, 0.005f };

        static CarCatalog cat;
        static WheelSet wheels;
        public static CarCatalog Catalog => cat ??= CarCatalog.Load(CarCatalog.DefaultFile(Paths.ProjectRoot));
        public static WheelSet Wheels => wheels ??= WheelSet.Load(WheelSet.DefaultFile(Paths.ProjectRoot));

        static bool HaveData()
        {
            if (File.Exists(CarCatalog.DefaultFile(Paths.ProjectRoot)) && File.Exists(WheelSet.DefaultFile(Paths.ProjectRoot))) return true;
            EditorUtility.DisplayDialog("Southbound", "No car data in Data/Vehicles.\nRun: node tools/southbound/export-unity.mjs cars", "OK");
            return false;
        }

        [MenuItem("Southbound/Cars/Build every car", priority = 50)]
        public static void BuildAll()
        {
            if (!HaveData()) return;
            cat = null; wheels = null; // re-read the data
            try
            {
                var cars = Catalog.Cars;
                for (int i = 0; i < cars.Count; i++)
                {
                    if (EditorUtility.DisplayCancelableProgressBar("Southbound cars", $"{cars[i].Name} ({i + 1}/{cars.Count})", i / (float)cars.Count)) break;
                    Prefab(cars[i].Id, true);
                }
            }
            finally { EditorUtility.ClearProgressBar(); AssetDatabase.SaveAssets(); }
            Debug.Log($"Southbound: {Catalog.Cars.Count} car prefabs in {PrefabDir}.");
        }

        /// <summary>The prefab for a car, built if it isn't there yet (or when asked to rebuild).</summary>
        public static GameObject Prefab(string id, bool rebuild = false)
        {
            string path = $"{PrefabDir}/{id}.prefab";
            if (!rebuild)
            {
                var have = AssetDatabase.LoadAssetAtPath<GameObject>(path);
                if (have != null) return have;
            }
            var car = Catalog[id];
            if (car == null) { Debug.LogWarning($"Southbound: no car '{id}' in the catalogue."); return null; }
            Paths.Ensure(PrefabDir);
            var root = Build(car);
            var prefab = PrefabUtility.SaveAsPrefabAsset(root, path);
            Object.DestroyImmediate(root);
            return prefab;
        }

        // ------------------------------------------------------------------ one car
        static GameObject Build(CarInfo car)
        {
            var s = car.Spec;
            string dir = $"{MeshDir}/{car.Id}";
            Paths.Ensure(dir);
            var mat = PaletteMaterial();
            var root = new GameObject(car.Id);
            var palette = new List<Renderer>();
            var lodRenderers = new List<Renderer>[4];
            for (int l = 0; l < 4; l++) lodRenderers[l] = new List<Renderer>();

            // body: four levels
            var body = new GameObject("Body").transform;
            body.SetParent(root.transform, false);
            for (int lod = 0; lod < CarMeshBuilder.Levels; lod++)
            {
                var mesh = SaveMesh(CarMeshBuilder.Body(s, lod), $"{dir}/{car.Id}_body{lod}.asset", $"{car.Id} body {lod}");
                var r = Part($"Body LOD{lod}", mesh, mat, body, lod < 3);
                palette.Add(r); lodRenderers[lod].Add(r);
            }

            // wheels: shared meshes per rim style, scaled to the car's tyre size
            var wm = WheelMeshes(s.Spokes);
            var wheelRoot = new GameObject("Wheels").transform;
            wheelRoot.SetParent(root.transform, false);
            var mounts = CarMeshBuilder.WheelMounts(s);
            string[] names = { "Wheel front left", "Wheel front right", "Wheel rear left", "Wheel rear right" };
            var pivots = new Transform[4];
            var scale = new Vector3((float)(s.Tw / Wheels.RefWidth), (float)(s.Rw / Wheels.RefRadius), (float)(s.Rw / Wheels.RefRadius));
            for (int i = 0; i < 4; i++)
            {
                var pivot = new GameObject(names[i]).transform;
                pivot.SetParent(wheelRoot, false);
                pivot.localPosition = new Vector3((float)mounts[i].x, (float)mounts[i].y, (float)mounts[i].z);
                if ((i & 1) == 1) pivot.localRotation = Quaternion.Euler(0, 180, 0);
                pivots[i] = pivot;
                for (int lv = 0; lv < 3; lv++)
                {
                    var r = Part($"Wheel LOD{lv}", wm[lv], mat, pivot, lv < 2);
                    r.transform.localScale = scale;
                    palette.Add(r);
                    lodRenderers[lv].Add(r);
                    if (lv == 2) lodRenderers[3].Add(r); // the far wheel serves the two far body levels
                }
            }
            var group = root.AddComponent<LODGroup>();
            group.SetLODs(Enumerable.Range(0, 4).Select(l => new LOD(LodHeights[l], lodRenderers[l].ToArray())).ToArray());
            group.RecalculateBounds();

            // collision: the lower body, the cabin, a cargo box
            var colRoot = new GameObject("Collision").transform;
            colRoot.SetParent(root.transform, false);
            float ride = (float)s.Ride, belt = (float)s.Belt, roof = (float)s.Roof, L = (float)s.L, W = (float)s.W;
            Box(colRoot, "Lower body", new Vector3(0, (ride + 0.04f + belt) / 2, 0), new Vector3(W * 0.97f, belt - ride - 0.04f, L * 0.97f));
            float zb = (float)System.Math.Min(s.ZC0, s.ZC1), zf = (float)System.Math.Max(s.ZA0, s.ZA1);
            if (zf - zb > 0.3f && roof > belt + 0.1f)
                Box(colRoot, "Cabin", new Vector3(0, (belt + roof) / 2, (zf + zb) / 2), new Vector3((float)(2 * s.Hwc), roof - belt, zf - zb));
            if (s.Box != null)
                Box(colRoot, "Cargo box", new Vector3(0, (belt + (float)s.Box[2]) / 2, (float)(s.Box[0] + s.Box[1]) / 2), new Vector3(W * 0.98f, (float)s.Box[2] - belt, (float)(s.Box[0] - s.Box[1])));

            // seat (hip point) and the driver's door
            var seat = new GameObject("Driver seat").transform;
            seat.SetParent(root.transform, false);
            if (car.Seat != null) seat.localPosition = new Vector3((float)-car.Seat[0], (float)car.Seat[1], (float)car.Seat[2]);
            else seat.localPosition = new Vector3((float)-s.Hwc * 0.44f, belt - 0.25f, (float)(s.ZA0 + s.ZC0) / 2);
            var door = new GameObject("Driver door").transform;
            door.SetParent(root.transform, false);
            var dp = CarMeshBuilder.DriverDoor(car);
            door.localPosition = new Vector3((float)dp.x, (float)dp.y, (float)dp.z);

            // lamps: two headlight beams, two brake/tail glows
            var lights = new GameObject("Lights").transform;
            lights.SetParent(root.transform, false);
            float hx = (float)s.Head[0], hy = (float)s.Head[1], tx = (float)s.Tail4[0], ty = (float)s.Tail4[1];
            var heads = new[] { -1, 1 }.Select(side => Lamp(lights, side < 0 ? "Headlight left" : "Headlight right", LightType.Spot,
                new Vector3(side * hx, hy, L / 2 - 0.08f), Quaternion.Euler(4, 0, 0), new Color(1f, 0.95f, 0.86f), 1300f, 70f)).ToArray();
            var tails = new[] { -1, 1 }.Select(side => Lamp(lights, side < 0 ? "Brake light left" : "Brake light right", LightType.Point,
                new Vector3(side * tx, ty, -L / 2 - 0.12f), Quaternion.identity, new Color(1f, 0.05f, 0.02f), 60f, 5f)).ToArray();

            // physics and driving
            var rb = root.AddComponent<Rigidbody>();
            float top = (float)(s.Box != null ? System.Math.Max(s.Roof, s.Box[2]) : s.Roof);
            rb.mass = Mathf.Clamp(120f * L * W * top, 700f, 16000f);
            var cc = root.AddComponent<CarController>();
            cc.carId = car.Id; cc.displayName = car.Name;
            cc.accel = (float)car.Stats.Accel; cc.topSpeed = (float)car.Stats.Top; cc.grip = (float)car.Stats.Grip;
            cc.axleFront = (float)s.AxF; cc.axleRear = (float)s.AxR; cc.wheelRadius = (float)s.Rw;
            cc.length = L; cc.width = W; cc.roof = top; cc.rideHeight = ride;
            cc.hasSiren = s.Bar == "siren"; cc.isTaxi = s.Bar == "taxi";
            cc.wheels = pivots; cc.seat = seat; cc.door = door;
            cc.travel = Mathf.Clamp((float)s.Rw * 0.55f, 0.14f, 0.3f);
            var cb = root.AddComponent<CarBody>();
            cb.look = CarLook.For(car, Wheels);
            cb.renderers = palette.ToArray();
            cb.headlights = heads; cb.brakeLights = tails;
            cb.hasSiren = cc.hasSiren;
            return root;
        }

        static MeshRenderer Part(string name, Mesh mesh, Material mat, Transform parent, bool shadows)
        {
            var go = new GameObject(name);
            go.transform.SetParent(parent, false);
            go.AddComponent<MeshFilter>().sharedMesh = mesh;
            var r = go.AddComponent<MeshRenderer>();
            r.sharedMaterial = mat;
            r.shadowCastingMode = shadows ? ShadowCastingMode.On : ShadowCastingMode.Off;
            return r;
        }

        static void Box(Transform parent, string name, Vector3 center, Vector3 size)
        {
            var go = new GameObject(name);
            go.transform.SetParent(parent, false);
            var b = go.AddComponent<BoxCollider>();
            b.center = center; b.size = new Vector3(Mathf.Max(0.05f, size.x), Mathf.Max(0.05f, size.y), Mathf.Max(0.05f, size.z));
        }

        static Light Lamp(Transform parent, string name, LightType type, Vector3 at, Quaternion rot, Color c, float lumens, float angleOrRange)
        {
            var go = new GameObject(name);
            go.transform.SetParent(parent, false);
            go.transform.SetLocalPositionAndRotation(at, rot);
            var l = go.AddComponent<Light>();
            l.type = type; l.color = c; l.shadows = LightShadows.None;
            if (type == LightType.Spot) { l.spotAngle = angleOrRange; l.innerSpotAngle = angleOrRange * 0.45f; l.range = 70; }
            else l.range = angleOrRange;
            Hdrp.SetupLamp(l, lumens);
            l.enabled = false; // CarBody turns them on
            return l;
        }

        // ------------------------------------------------------------------ meshes
        static Mesh SaveMesh(CarMeshData d, string path, string name)
        {
            var m = new Mesh { name = name, indexFormat = d.VertexCount > 65000 ? IndexFormat.UInt32 : IndexFormat.UInt16 };
            var v = new Vector3[d.VertexCount]; var n = new Vector3[d.VertexCount]; var uv = new Vector2[d.VertexCount]; var uv1 = new Vector2[d.VertexCount];
            for (int i = 0; i < v.Length; i++)
            {
                v[i] = new Vector3(d.Positions[i * 3], d.Positions[i * 3 + 1], d.Positions[i * 3 + 2]);
                n[i] = new Vector3(d.Normals[i * 3], d.Normals[i * 3 + 1], d.Normals[i * 3 + 2]);
                uv[i] = new Vector2(d.Uvs[i * 2], d.Uvs[i * 2 + 1]);
                // metres across the body (box projection) for the paint's flake detail map
                var (fu, fv) = CarPalette.FlakeUv(v[i].x, v[i].y, v[i].z, n[i].x, n[i].y, n[i].z);
                uv1[i] = new Vector2(fu, fv);
            }
            m.vertices = v; m.normals = n; m.uv = uv; m.uv2 = uv1;
            m.SetTriangles(d.Indices, 0, true);
            m.UploadMeshData(false);
            AssetDatabase.DeleteAsset(path);
            AssetDatabase.CreateAsset(m, path);
            return m;
        }

        static readonly Dictionary<int, Mesh[]> wheelCache = new Dictionary<int, Mesh[]>();
        static Mesh[] WheelMeshes(int spokes)
        {
            var st = Wheels.Style(spokes);
            if (wheelCache.TryGetValue(st.Spokes, out var have) && have.All(x => x != null)) return have;
            Paths.Ensure(WheelDir);
            var meshes = new Mesh[3];
            for (int lv = 0; lv < 3; lv++)
            {
                string path = $"{WheelDir}/wheel_{st.Spokes}spokes_{lv}.asset";
                meshes[lv] = AssetDatabase.LoadAssetAtPath<Mesh>(path) ?? SaveMesh(CarMeshBuilder.Wheel(st.Levels[lv], lv == 2), path, $"wheel {st.Spokes} spokes {lv}");
            }
            wheelCache[st.Spokes] = meshes;
            return meshes;
        }

        [MenuItem("Southbound/Cars/Rebuild the wheels", priority = 52)]
        static void RebuildWheels()
        {
            if (!HaveData()) return;
            wheelCache.Clear();
            AssetDatabase.DeleteAsset(WheelDir);
            foreach (var st in Wheels.Styles) WheelMeshes(st.Spokes);
            Debug.Log("Southbound: wheel meshes rebuilt (prefabs keep pointing at them).");
        }

        // ------------------------------------------------------------------ the shared material
        /// <summary>HDRP Lit reading a 16 x 4 palette: base colour, mask (metal, smoothness), clear-coat mask and
        /// emission. The textures here are a grey car's; each CarBody hands its own over at run time.</summary>
        public static Material PaletteMaterial()
        {
            var m = AssetDatabase.LoadAssetAtPath<Material>(MaterialPath);
            if (m != null) { Flakes(m); return m; }
            Paths.Ensure(Paths.Materials);
            Paths.Ensure(MeshDir);
            var look = new CarLook();
            float[] b = new float[CarPalette.Texels * 4], mk = new float[b.Length], co = new float[b.Length], em = new float[b.Length];
            CarPalette.Fill(look, b, mk, co);
            CarPalette.Emission(new CarLights(), em);
            Texture2D T(float[] f, bool linear, bool enc, bool hdr, string name)
            {
                var t = CarBody.MakeTexture(f, linear, enc, hdr);
                t.name = name;
                string p = $"{MeshDir}/{name}.asset";
                AssetDatabase.DeleteAsset(p);
                AssetDatabase.CreateAsset(t, p);
                return t;
            }
            var tb = T(b, false, true, false, "CarPalette_BaseColor");
            var tm = T(mk, true, false, false, "CarPalette_Mask");
            var tc = T(co, true, false, false, "CarPalette_Coat");
            var te = T(em, true, false, true, "CarPalette_Emission");
            m = Hdrp.Lit();
            m.name = "CarPalette";
            if (Hdrp.IsHdrpShader(m))
            {
                m.SetColor("_BaseColor", Color.white);
                m.SetTexture("_BaseColorMap", tb);
                m.SetTexture("_MaskMap", tm);
                m.SetFloat("_CoatMask", 1f);
                m.SetTexture("_CoatMaskMap", tc);
                m.SetTexture("_EmissiveColorMap", te);
                m.SetColor("_EmissiveColorLDR", Color.white);
                m.SetFloat("_UseEmissiveIntensity", 1);
                m.SetFloat("_EmissiveIntensityUnit", 0); // nits
                m.SetFloat("_EmissiveIntensity", 3000f);
                m.SetColor("_EmissiveColor", Color.white * 3000f);
                m.SetFloat("_ReceivesSSR", 1);
                Hdrp.ResetKeywords(m);
            }
            else
            {
                m.SetTexture("_MainTex", tb); m.SetTexture("_BaseMap", tb);
                m.SetTexture("_MetallicGlossMap", tm); m.EnableKeyword("_METALLICGLOSSMAP");
                m.SetTexture("_EmissionMap", te); m.SetColor("_EmissionColor", Color.white); m.EnableKeyword("_EMISSION");
            }
            AssetDatabase.CreateAsset(m, MaterialPath);
            Flakes(m);
            return m;
        }

        const string FlakePath = Paths.Generated + "/CarPaint_Flakes.png";

        /// <summary>Metallic flake and orange peel in the paint: HDRP's detail map (Core CarPalette.FlakeDetail) on the
        /// second UV set (metres across the body), masked to the paint by the palette mask's blue channel. Safe to run again.</summary>
        static void Flakes(Material m)
        {
            if (!Hdrp.IsHdrpShader(m)) return;
            if (!File.Exists(Paths.Abs(FlakePath)))
            {
                Paths.Ensure(Paths.Generated);
                const int size = 512;
                var f = CarPalette.FlakeDetail(size, 1987);
                var px = new Color32[size * size];
                for (int i = 0; i < px.Length; i++)
                    px[i] = new Color32((byte)(f[i * 4] * 255 + 0.5f), (byte)(f[i * 4 + 1] * 255 + 0.5f), (byte)(f[i * 4 + 2] * 255 + 0.5f), (byte)(f[i * 4 + 3] * 255 + 0.5f));
                Surfaces.Write(px, size, size, Paths.Abs(FlakePath));
                AssetDatabase.ImportAsset(FlakePath);
                if (AssetImporter.GetAtPath(FlakePath) is TextureImporter imp)
                {
                    imp.sRGBTexture = false; imp.wrapMode = TextureWrapMode.Repeat; imp.mipmapEnabled = true;
                    imp.textureCompression = TextureImporterCompression.Uncompressed;   // block compression would smear 2-texel flakes
                    imp.SaveAndReimport();
                }
            }
            m.SetTexture("_DetailMap", AssetDatabase.LoadAssetAtPath<Texture2D>(FlakePath));
            m.SetTextureScale("_DetailMap", new Vector2(14f, 14f));   // a 7 cm tile: flakes about half a millimetre
            m.SetFloat("_UVDetail", 1);                                // the second UV set
            m.SetVector("_UVDetailsMappingMask", new Vector4(0, 1, 0, 0));
            m.SetFloat("_DetailAlbedoScale", 0.35f);
            m.SetFloat("_DetailNormalScale", 1.1f);
            m.SetFloat("_DetailSmoothnessScale", 0.4f);
            Hdrp.ResetKeywords(m);
            EditorUtility.SetDirty(m);
        }

        // ------------------------------------------------------------------ the parked cars of Calvera
        /// <summary>The cars parked around Calvera when the web game starts (Data/World/calvera-parked.json),
        /// with John's rusty pickup in the showroom spot nearest the spawn. Road paints for the rest.</summary>
        public static Transform PlaceParked(string dataDir)
        {
            string file = Path.Combine(dataDir, "calvera-parked.json");
            if (!File.Exists(file) || !File.Exists(CarCatalog.DefaultFile(Paths.ProjectRoot))) { Debug.LogWarning("Southbound: no parked cars or car data (export-unity.mjs parked cars)."); return null; }
            var root = MiniJson.Parse(File.ReadAllText(file)) as Dictionary<string, object>;
            var parent = new GameObject("Cars").transform;
            var rnd = new Mulberry32(1987);
            int n = 0;
            foreach (Dictionary<string, object> p in root.Arr("parked"))
            {
                string type = p.Text("type");
                if (Catalog[type] == null) type = type == "concept" ? "rusty-pickup" : "sedan";
                var prefab = Prefab(type);
                if (prefab == null) continue;
                var go = (GameObject)PrefabUtility.InstantiatePrefab(prefab, parent);
                var (x, z) = CalveraWorld.ToUnity(p.Num("x"), p.Num("z"));
                go.transform.SetPositionAndRotation(new Vector3((float)x, (float)p.Num("y") + 0.05f, (float)z), Quaternion.Euler(0, (float)CalveraWorld.YawToUnity(p.Num("heading")), 0));
                var info = Catalog[type];
                if (info.Paint == null)
                {
                    var paint = Catalog.RandomPaint(rnd.Next);
                    var cb = go.GetComponent<CarBody>();
                    cb.look.Paint = new[] { (float)paint[0], (float)paint[1], (float)paint[2] };
                    cb.look.Metal = (float)paint[3];
                    PrefabUtility.RecordPrefabInstancePropertyModifications(cb);
                }
                n++;
            }
            Debug.Log($"Southbound: {n} parked cars placed.");
            return parent;
        }
    }

    /// <summary>Every car in the catalogue: build one and put it in front of the scene camera.</summary>
    public sealed class CarBrowser : EditorWindow
    {
        string filter = "";
        Vector2 scroll;

        [MenuItem("Southbound/Cars/Car browser", priority = 51)]
        static void Open() => GetWindow<CarBrowser>("Southbound cars");

        void OnGUI()
        {
            if (!File.Exists(CarCatalog.DefaultFile(Paths.ProjectRoot))) { EditorGUILayout.HelpBox("No Data/Vehicles/cars.json. Run: node tools/southbound/export-unity.mjs cars", MessageType.Warning); return; }
            filter = EditorGUILayout.TextField("Search", filter);
            scroll = EditorGUILayout.BeginScrollView(scroll);
            foreach (var c in CarFactory.Catalog.Cars)
            {
                if (filter.Length > 0 && c.Name.IndexOf(filter, System.StringComparison.OrdinalIgnoreCase) < 0 && c.Id.IndexOf(filter, System.StringComparison.OrdinalIgnoreCase) < 0) continue;
                EditorGUILayout.BeginHorizontal();
                EditorGUILayout.LabelField($"{c.Name}", GUILayout.MinWidth(160));
                EditorGUILayout.LabelField($"{c.Class}  {c.Stats.Top * 2.237:0} mph" + (c.Price > 0 ? $"  ${c.Price:N0}" : ""), GUILayout.MinWidth(160));
                if (GUILayout.Button("Place", GUILayout.Width(60))) Place(c.Id);
                if (GUILayout.Button("Rebuild", GUILayout.Width(64))) CarFactory.Prefab(c.Id, true);
                EditorGUILayout.EndHorizontal();
            }
            EditorGUILayout.EndScrollView();
        }

        static void Place(string id)
        {
            var prefab = CarFactory.Prefab(id);
            if (prefab == null) return;
            var go = (GameObject)PrefabUtility.InstantiatePrefab(prefab);
            var sv = SceneView.lastActiveSceneView;
            if (sv != null)
            {
                var cam = sv.camera.transform;
                Vector3 at = cam.position + cam.forward * 8;
                if (Physics.Raycast(at + Vector3.up * 50, Vector3.down, out var hit, 200)) at = hit.point;
                go.transform.SetPositionAndRotation(at, Quaternion.Euler(0, cam.eulerAngles.y + 90, 0));
            }
            Undo.RegisterCreatedObjectUndo(go, "Place car");
            Selection.activeGameObject = go;
        }
    }
}
