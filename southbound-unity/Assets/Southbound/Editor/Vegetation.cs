// Trees and bushes: the web game's ez-tree models (MIT) with their Poly Haven
// bark (CC0) and leaf cards, as terrain tree prototypes with a crossed-card
// impostor LOD for distance, planted exactly where the web game plants them.
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Southbound.Core;
using UnityEditor;
using UnityEngine;
using UnityEngine.Rendering;

namespace Southbound.EditorTools
{
    public static class Vegetation
    {
        const string Veg = Paths.Models + "/veg";
        const string TreePrefabs = Paths.Prefabs + "/Trees";

        public static void Plant(CalveraWorld w, Terrain terrain)
        {
            string manifestPath = Paths.Abs($"{Veg}/manifest.json");
            if (!File.Exists(manifestPath)) { Debug.LogWarning("Southbound: veg/manifest.json missing, no trees."); return; }
            var manifest = ((Dictionary<string, object>)MiniJson.Parse(File.ReadAllText(manifestPath))).Arr("trees").Cast<Dictionary<string, object>>().ToDictionary(t => t.Text("id"));
            var protos = new List<TreePrototype>();
            var index = new Dictionary<string, int>();
            foreach (var kind in w.PlantKinds)
            {
                if (!manifest.TryGetValue(kind, out var entry)) continue;
                var prefab = Prefab(kind, entry);
                if (prefab == null) continue;
                index[kind] = protos.Count;
                protos.Add(new TreePrototype { prefab = prefab, bendFactor = 0 });
            }
            if (protos.Count == 0) { Debug.LogWarning("Southbound: tree models aren't imported yet (install glTFast in the Southbound setup window, then build again)."); return; }
            var td = terrain.terrainData;
            td.treePrototypes = protos.ToArray();
            Vector3 o = terrain.transform.position, size = td.size;
            var list = new List<TreeInstance>(w.Plants.Count);
            foreach (var p in w.Plants)
            {
                if (!index.TryGetValue(p.Kind, out int pi)) continue;
                var (ux, uz) = CalveraWorld.ToUnity(p.X, p.Z);
                list.Add(new TreeInstance
                {
                    position = new Vector3(((float)ux - o.x) / size.x, ((float)p.Y - o.y) / size.y, ((float)uz - o.z) / size.z),
                    widthScale = (float)p.Scale, heightScale = (float)p.Scale,
                    rotation = -(float)p.Rot, // mirrored world: rotations turn the other way
                    color = Color.white, lightmapColor = Color.white, prototypeIndex = pi,
                });
            }
            td.SetTreeInstances(list.ToArray(), false);
            terrain.Flush();
        }

        static GameObject Prefab(string id, Dictionary<string, object> entry)
        {
            Paths.Ensure(TreePrefabs);
            string path = $"{TreePrefabs}/{id}.prefab";
            var glb = AssetDatabase.LoadAssetAtPath<GameObject>($"{Veg}/{id}.glb");
            if (glb == null) return AssetDatabase.LoadAssetAtPath<GameObject>(path);
            var filters = glb.GetComponentsInChildren<MeshFilter>(true);
            var bark = filters.FirstOrDefault(f => f.name.ToLowerInvariant().Contains("bark"));
            var leaves = filters.FirstOrDefault(f => f.name.ToLowerInvariant().Contains("lea"));
            if (bark == null && leaves == null) return null;
            string barkType = entry.Text("bark", "oak"), leafType = entry.Text("leaf", "oak");
            var root = new GameObject(id);
            try
            {
                var lod0 = new List<Renderer>();
                if (bark != null) lod0.Add(Part(root, "bark", bark.sharedMesh, BarkMaterial(barkType, (int)entry.Num("barkTint", 0xffffff)), bark.transform));
                if (leaves != null) lod0.Add(Part(root, "leaves", leaves.sharedMesh, LeafMaterial(leafType, (int)entry.Num("leafTint", 0xffffff), (float)entry.Num("leafAlphaTest", 0.4)), leaves.transform));
                var imp = Part(root, "impostor", ImpostorMesh(id, (float)entry.Num("width", 10), (float)entry.Num("height", 10)), ImpostorMaterial(id));
                imp.shadowCastingMode = ShadowCastingMode.On;
                var lods = root.AddComponent<LODGroup>();
                lods.SetLODs(new[] { new LOD(0.08f, lod0.ToArray()), new LOD(0.004f, new Renderer[] { imp }) });
                lods.fadeMode = LODFadeMode.CrossFade;
                lods.animateCrossFading = true;
                lods.RecalculateBounds();
                return PrefabUtility.SaveAsPrefabAsset(root, path);
            }
            finally { Object.DestroyImmediate(root); }
        }

        static MeshRenderer Part(GameObject root, string name, Mesh mesh, Material mat, Transform from = null)
        {
            var go = new GameObject(name);
            go.transform.SetParent(root.transform, false);
            if (from != null)
            {
                // keep the node's placement and scale (the tree meshes are quantized; the node scale restores metres)
                var top = from.root;
                go.transform.localPosition = top.InverseTransformPoint(from.position);
                go.transform.localRotation = Quaternion.Inverse(top.rotation) * from.rotation;
                go.transform.localScale = Vector3.Scale(from.lossyScale, new Vector3(1 / top.lossyScale.x, 1 / top.lossyScale.y, 1 / top.lossyScale.z));
            }
            go.AddComponent<MeshFilter>().sharedMesh = mesh;
            var r = go.AddComponent<MeshRenderer>();
            r.sharedMaterial = mat;
            return r;
        }

        static Color Hex(int rgb) => new Color(((rgb >> 16) & 255) / 255f, ((rgb >> 8) & 255) / 255f, (rgb & 255) / 255f);

        static Material Mat(string name)
        {
            Paths.Ensure(Paths.Materials + "/Vegetation");
            string path = $"{Paths.Materials}/Vegetation/{name}.mat";
            var m = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (m == null) { m = Hdrp.Lit(); m.name = name; AssetDatabase.CreateAsset(m, path); }
            m.enableInstancing = true;
            return m;
        }

        static Material BarkMaterial(string type, int tint)
        {
            var m = Mat("Bark_" + type);
            var color = AssetDatabase.LoadAssetAtPath<Texture2D>($"{Veg}/bark_{type}_color.jpg");
            var normal = AssetDatabase.LoadAssetAtPath<Texture2D>($"{Veg}/bark_{type}_normal.jpg");
            Paths.Ensure(Paths.Generated);
            string maskPath = $"{Paths.Generated}/bark_{type}_Mask.png";
            if (!File.Exists(Paths.Abs(maskPath)))
            {
                Surfaces.PackMasks(Paths.Abs($"{Veg}/bark_{type}_roughness.jpg"), Paths.Abs($"{Veg}/bark_{type}_ao.jpg"), null, null, Paths.Abs(maskPath), null);
                AssetDatabase.ImportAsset(maskPath);
            }
            var mask = AssetDatabase.LoadAssetAtPath<Texture2D>(maskPath);
            if (Hdrp.IsHdrpShader(m))
            {
                m.SetColor("_BaseColor", Hex(tint));
                m.SetTexture("_BaseColorMap", color);
                m.SetTexture("_NormalMap", normal);
                m.SetTexture("_MaskMap", mask);
                Hdrp.ResetKeywords(m);
            }
            else { m.color = Hex(tint); m.mainTexture = color; m.SetTexture("_BumpMap", normal); }
            EditorUtility.SetDirty(m);
            return m;
        }

        static Material Cutout(Material m, Texture2D tex, Color tint, float cutoff)
        {
            if (Hdrp.IsHdrpShader(m))
            {
                m.SetColor("_BaseColor", tint);
                m.SetTexture("_BaseColorMap", tex);
                m.SetFloat("_AlphaCutoffEnable", 1);
                m.SetFloat("_AlphaCutoff", cutoff);
                m.SetFloat("_AlphaCutoffShadow", cutoff);
                m.SetFloat("_DoubleSidedEnable", 1);
                m.SetFloat("_DoubleSidedNormalMode", 1); // mirror: leaves lit from both sides
                m.SetFloat("_Smoothness", 0.25f);
                Hdrp.ResetKeywords(m);
            }
            else
            {
                m.color = tint; m.mainTexture = tex;
                m.SetFloat("_Mode", 1); m.SetFloat("_Cutoff", cutoff); m.EnableKeyword("_ALPHATEST_ON");
                m.renderQueue = (int)RenderQueue.AlphaTest;
            }
            EditorUtility.SetDirty(m);
            return m;
        }

        static Material LeafMaterial(string type, int tint, float cutoff) =>
            Cutout(Mat("Leaf_" + type), AssetDatabase.LoadAssetAtPath<Texture2D>($"{Veg}/leaf_{type}.png"), Hex(tint), Mathf.Clamp(cutoff, 0.1f, 0.8f));

        static Material ImpostorMaterial(string id) =>
            Cutout(Mat("Impostor_" + id), AssetDatabase.LoadAssetAtPath<Texture2D>($"{Veg}/{id}_impostor.png"), Color.white, 0.4f);

        /// <summary>Two crossed cards with the tree's picture, for distance.</summary>
        static Mesh ImpostorMesh(string id, float width, float height)
        {
            string path = $"{TreePrefabs}/{id}_impostor_mesh.asset";
            var m = AssetDatabase.LoadAssetAtPath<Mesh>(path);
            if (m != null) return m;
            float hw = width / 2;
            m = new Mesh { name = id + " impostor" };
            m.vertices = new[]
            {
                new Vector3(-hw, 0, 0), new Vector3(hw, 0, 0), new Vector3(hw, height, 0), new Vector3(-hw, height, 0),
                new Vector3(0, 0, -hw), new Vector3(0, 0, hw), new Vector3(0, height, hw), new Vector3(0, height, -hw),
            };
            m.uv = new[] { new Vector2(0, 0), new Vector2(1, 0), new Vector2(1, 1), new Vector2(0, 1), new Vector2(0, 0), new Vector2(1, 0), new Vector2(1, 1), new Vector2(0, 1) };
            m.triangles = new[] { 0, 2, 1, 0, 3, 2, 4, 6, 5, 4, 7, 6 };
            m.RecalculateNormals(); m.RecalculateTangents(); m.RecalculateBounds();
            AssetDatabase.CreateAsset(m, path);
            return m;
        }
    }
}
