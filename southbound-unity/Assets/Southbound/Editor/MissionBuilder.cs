// Puts the story, side jobs and work into the Calvera scene: the Missions component with the web game's
// mission data (Data/World/calvera-missions.json, copied into the project as a text asset so a build has it),
// the cars missions take and jobs drive (built as prefabs the first time), people for contacts and targets,
// and the glowing marker's material.
using System.IO;
using System.Linq;
using Southbound.Core;
using UnityEditor;
using UnityEngine;

namespace Southbound.EditorTools
{
    public static class MissionBuilder
    {
        public static void Build()
        {
            string src = MissionData.DefaultFile(Paths.ProjectRoot);
            if (!File.Exists(src)) { Debug.LogWarning("Southbound: no mission data (node tools/southbound/export-unity.mjs street writes Data/World/calvera-missions.json)."); return; }
            string dir = Paths.Generated + "/Missions";
            Paths.Ensure(dir);
            string dst = dir + "/calvera-missions.json";
            File.Copy(src, Paths.Abs(dst), true);
            AssetDatabase.ImportAsset(dst, ImportAssetOptions.ForceUpdate);
            var data = MissionData.Load(src);
            var go = new GameObject("Missions");
            var m = go.AddComponent<Missions>();
            m.data = AssetDatabase.LoadAssetAtPath<TextAsset>(dst);
            // every car a mission takes, every job's vehicle, and a plain sedan to fall back on
            if (CarFactory.HasData())
            {
                var ids = data.Story.Concat(data.Side).SelectMany(x => x.Steps).Where(s => s.Car != null).Select(s => s.Car)
                    .Concat(data.Jobs.Where(j => j.Supported && j.Veh != null).Select(j => j.Veh)).Append("sedan").Distinct()
                    .Where(id => CarFactory.Catalog[id] != null).ToList();
                var built = ids.Select(id => (id, p: CarFactory.Prefab(id))).Where(x => x.p != null).ToList();
                m.carIds = built.Select(x => x.id).ToArray();
                m.carPrefabs = built.Select(x => x.p).ToArray();
            }
            m.people = new[] { "mh_m1", "mh_m2", "mh_m3", "mh_m4", "mh_f1", "mh_f2" }
                .Select(n => AssetDatabase.LoadAssetAtPath<GameObject>($"{Paths.Models}/people/{n}.glb")).Where(g => g != null).ToArray();
            m.skeleton = AssetDatabase.LoadAssetAtPath<GameObject>($"{Paths.Models}/anims/ual.glb");
            m.markerMaterial = MarkerMaterial();
            Debug.Log($"Southbound: {data.Story.Count} story missions, {data.Side.Count} side jobs, {data.Jobs.Count(j => j.Supported)} of {data.Jobs.Count} jobs (the rest need boats, aircraft, fishing or hunting), {m.carPrefabs?.Length ?? 0} mission and job cars.");
        }

        /// <summary>The marker: a red glow you can see through (unlit, additive).</summary>
        static Material MarkerMaterial()
        {
            string path = $"{Paths.Materials}/MissionMarker.mat";
            var m = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (m != null) return m;
            Paths.Ensure(Paths.Materials);
            var sh = Shader.Find("HDRP/Unlit") ?? Shader.Find("Unlit/Transparent") ?? Shader.Find("Unlit/Color");
            m = new Material(sh) { name = "Mission marker" };
            if (sh.name == "HDRP/Unlit")
            {
                m.SetColor("_UnlitColor", new Color(1f, 0.19f, 0.25f, 0.35f) * 2f);
                m.SetFloat("_SurfaceType", 1); m.SetFloat("_BlendMode", 1); m.SetFloat("_ZWrite", 0);
                m.SetFloat("_DoubleSidedEnable", 1);
                Hdrp.ResetKeywords(m);
            }
            else m.color = new Color(1f, 0.19f, 0.25f, 0.35f);
            AssetDatabase.CreateAsset(m, path);
            return m;
        }
    }
}
