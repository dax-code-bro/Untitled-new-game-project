// Fishing and the tool stores in the Calvera scene: a booth with a sign for Calvera Hardware, Mill Creek Feed &
// Hardware and Bayou Outfitters, a bait & tackle counter and a fish market beside every marina's booth (where the web
// game puts them), the Outfitters (the counters) and Angling (the rod, the line, the bite) with the fish models to hold
// up. Runs after CraftBuilder (it needs the marinas), as part of Build Calvera scene or Add the new features.
using System.IO;
using System.Linq;
using Southbound.Core;
using UnityEditor;
using UnityEngine;

namespace Southbound.EditorTools
{
    public static class OutdoorsBuilder
    {
        const string RootName = "Outfitters and fishing";

        public static void Build()
        {
            string dataDir = CalveraWorld.DefaultFolder(Paths.ProjectRoot);
            string missionsFile = MissionData.DefaultFile(Paths.ProjectRoot);
            if (!File.Exists(Path.Combine(dataDir, "calvera-world.json")) || !File.Exists(missionsFile)) return;
            EditorUtility.DisplayProgressBar("Southbound", "Tool stores and fishing", 0.5f);
            var w = CalveraWorld.Load(dataDir);
            var L = MissionData.Load(missionsFile);
            foreach (var o in Object.FindObjectsByType<Outfitters>(FindObjectsSortMode.None)) Object.DestroyImmediate(o.gameObject);
            var oldRoot = GameObject.Find(RootName); if (oldRoot != null) Object.DestroyImmediate(oldRoot);
            var root = new GameObject(RootName).transform;

            var marinas = Harbours.Marinas(w, L);
            foreach (var p in Outfitters.Places(L, marinas))
            {
                // a counter facing the nearest road would be nicer; it faces south-east, like the marina booths' signs
                var at = new Vector3(-(float)p.x, (float)w.HeightAt(p.x, p.z), (float)p.z);
                bool small = p.name == "Bait & Tackle" || p.kind == "market";
                var size = small ? new Vector3(2.2f, 2.4f, 1.6f) : new Vector3(5, 3.2f, 3.5f);
                var back = at + new Vector3(0, 0, -(size.z / 2 + 1.1f));
                var b = CraftBuilder.Block(p.name, size, Surfaces.Get(small ? "WoodSiding009" : "CorrugatedSteel005"), root, back + Vector3.up * size.y / 2, Quaternion.identity, 2f);
                b.AddComponent<BoxCollider>();
                CraftBuilder.Block(p.name + " counter", new Vector3(size.x * 0.8f, 1.05f, 0.5f), Surfaces.Get("WoodFloor007"), root, at + new Vector3(0, 0.52f, -0.75f), Quaternion.identity, 1f).AddComponent<BoxCollider>();
                var sign = p.kind == "market" ? new Color(0.15f, 0.42f, 0.7f) : small ? new Color(0.85f, 0.45f, 0.1f) : new Color(0.55f, 0.12f, 0.08f);
                CraftBuilder.Block(p.name + " sign", new Vector3(size.x * 0.9f, 0.7f, 0.08f), CraftBuilder.Paint(sign), root, back + new Vector3(0, size.y + 0.5f, size.z / 2), Quaternion.identity, 0);
            }
            var go = new GameObject("Outfitters (tools, bait & tackle, fish market)");
            go.AddComponent<Outfitters>();
            var fishing = go.AddComponent<Angling>();
            fishing.fishModels = new[] { "khronos/BarramundiFish", "quaternius/fish_pack/Fish1", "quaternius/fish_pack/Fish2", "quaternius/fish_pack/Fish3" }
                .Select(n => AssetDatabase.LoadAssetAtPath<GameObject>($"{Paths.Models}/open/{n}.glb")).Where(g => g != null).ToArray();
            fishing.sharkModel = AssetDatabase.LoadAssetAtPath<GameObject>($"{Paths.Models}/open/quaternius/fish_pack/Shark.glb");
            Debug.Log($"Southbound: 3 tool stores and {marinas.Count * 2} marina counters; fishing with {fishing.fishModels.Length} fish models.");
        }
    }
}
