// Puts the law into the Calvera scene: the Police component with the cruiser (the catalogue's "police"
// car, built as a prefab the first time), the web game's officer and the animation skeleton. It drives
// over the traffic's lanes, so it needs the Traffic component in the scene too (TrafficBuilder).
using UnityEditor;
using UnityEngine;

namespace Southbound.EditorTools
{
    public static class PoliceBuilder
    {
        public static void Build()
        {
            var go = new GameObject("Police");
            var police = go.AddComponent<Police>();
            if (CarFactory.HasData() && CarFactory.Catalog["police"] != null) police.cruiser = CarFactory.Prefab("police");
            police.officer = AssetDatabase.LoadAssetAtPath<GameObject>($"{Paths.Models}/people/mh_cop.glb");
            police.skeleton = AssetDatabase.LoadAssetAtPath<GameObject>($"{Paths.Models}/anims/ual.glb");
            if (police.cruiser == null) Debug.LogWarning("Southbound: no police car prefab (export-unity.mjs cars, then Southbound > Cars): wanted levels work, but no cruisers come.");
            if (police.officer == null || police.skeleton == null) Debug.LogWarning("Southbound: the officer model or the animation skeleton isn't imported yet (glTFast): cruisers come without officers.");
            else Debug.Log("Southbound: police ready (cruisers, officers, wanted levels).");
        }
    }
}
