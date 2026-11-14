// Puts the ambient townspeople into the Calvera scene: the Pedestrians component with the web game's
// MakeHuman people, the animation skeleton, and the town's pavements (Core/Sidewalks) baked in.
using System.Collections.Generic;
using System.Linq;
using Southbound.Core;
using UnityEditor;
using UnityEngine;

namespace Southbound.EditorTools
{
    public static class PedestrianBuilder
    {
        public static void Build(CalveraWorld w)
        {
            var people = new[] { "mh_m1", "mh_f1", "mh_m2", "mh_f2", "mh_m3", "mh_m4" }
                .Select(n => AssetDatabase.LoadAssetAtPath<GameObject>($"{Paths.Models}/people/{n}.glb")).Where(g => g != null).ToArray();
            var ual = AssetDatabase.LoadAssetAtPath<GameObject>($"{Paths.Models}/anims/ual.glb");
            if (people.Length == 0 || ual == null) { Debug.LogWarning("Southbound: the townspeople models aren't imported yet (glTFast): no pedestrians."); return; }
            var paths = Sidewalks.Paths(w);
            var starts = new List<int>(); var pts = new List<float>(); var lens = new List<float>();
            foreach (var p in paths)
            {
                starts.Add(pts.Count / 2);
                foreach (var (x, z) in p.Points) { var (ux, uz) = CalveraWorld.ToUnity(x, z); pts.Add((float)ux); pts.Add((float)uz); }
                lens.Add((float)p.Length);
            }
            starts.Add(pts.Count / 2);
            var go = new GameObject("Pedestrians (townspeople on the pavements)");
            var ped = go.AddComponent<Pedestrians>();
            ped.people = people; ped.skeleton = ual;
            ped.pointStart = starts.ToArray(); ped.points = pts.ToArray(); ped.pathLength = lens.ToArray();
            Debug.Log($"Southbound: {ped.count} townspeople walking {paths.Count} pavements ({lens.Sum() / 1000:F1} km).");
        }
    }
}
