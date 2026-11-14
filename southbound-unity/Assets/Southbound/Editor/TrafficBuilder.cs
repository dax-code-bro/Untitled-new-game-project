// Puts the traffic into the Calvera scene: the Traffic component with a dozen everyday cars from the
// catalogue (built as prefabs the first time) and the lanes (Core/Lanes) baked in.
using System.Collections.Generic;
using System.Linq;
using Southbound.Core;
using UnityEngine;

namespace Southbound.EditorTools
{
    public static class TrafficBuilder
    {
        static readonly string[] Mix = { "sedan", "hatchback-sports", "van", "taxi", "delivery", "suv", "sedan_03", "compact_02", "pickup_02", "suv_04", "wagon_01", "sedan_07" };

        public static void Build(CalveraWorld w)
        {
            var prefabs = new List<GameObject>();
            foreach (var id in Mix)
            {
                if (CarFactory.Catalog[id] == null) continue;
                var p = CarFactory.Prefab(id);
                if (p != null) prefabs.Add(p);
            }
            if (prefabs.Count == 0) { Debug.LogWarning("Southbound: no car prefabs (export-unity.mjs cars, then Southbound > Cars): no traffic."); return; }
            var lanes = Lanes.Build(w);
            var starts = new List<int>(); var pts = new List<float>(); var lens = new List<float>(); var speeds = new List<float>();
            var nextStart = new List<int>(); var next = new List<int>();
            foreach (var l in lanes)
            {
                starts.Add(pts.Count / 2);
                foreach (var (x, z) in l.Points) { var (ux, uz) = CalveraWorld.ToUnity(x, z); pts.Add((float)ux); pts.Add((float)uz); }
                lens.Add((float)l.Length); speeds.Add((float)l.Speed);
                nextStart.Add(next.Count); next.AddRange(l.Next);
            }
            starts.Add(pts.Count / 2); nextStart.Add(next.Count);
            var go = new GameObject("Traffic");
            var t = go.AddComponent<Traffic>();
            t.cars = prefabs.ToArray();
            t.pointStart = starts.ToArray(); t.points = pts.ToArray(); t.laneLength = lens.ToArray(); t.laneSpeed = speeds.ToArray();
            t.nextStart = nextStart.ToArray(); t.next = next.ToArray();
            Debug.Log($"Southbound: traffic: {t.count} cars ({prefabs.Count} models) on {lanes.Count} lanes ({lens.Sum() / 1000:F1} km).");
        }
    }
}
