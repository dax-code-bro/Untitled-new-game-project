// Downloads every surface's original maps (2K, 4K or 8K) from ambientCG,
// Poly Haven and cgbookcase (all CC0), packs the HDRP mask maps and points the
// materials at them. Runs in the background; the editor stays usable.
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Southbound.Core;
using UnityEditor;
using UnityEngine;

namespace Southbound.EditorTools
{
    public sealed class MaterialDownloader : EditorWindow
    {
        static readonly string[] Resolutions = { "2K", "4K", "8K" };
        int res = 1;
        Task<List<FetchResult>> job;
        CancellationTokenSource cancel;
        volatile int done;
        volatile string current = "";
        Vector2 scroll;
        readonly List<string> log = new List<string>();

        [MenuItem("Southbound/Materials/Download full-resolution textures...", priority = 21)]
        public static void Open() => GetWindow<MaterialDownloader>(true, "Southbound textures", true).minSize = new Vector2(520, 360);

        void OnGUI()
        {
            EditorGUILayout.LabelField("Full-resolution surfaces", EditorStyles.boldLabel);
            EditorGUILayout.HelpBox(
                "The project ships 512 px copies of the 29 surfaces (what the web game streams). This downloads the originals " +
                "from ambientCG, Poly Haven and cgbookcase (all CC0, free) and rebuilds the materials with them.\n\n" +
                "2K: about 0.5 GB to download.  4K: about 2 GB, the right choice for an RTX-class PC.  8K: about 7 GB, close-up detail, heavy on VRAM.\n(The five cgbookcase sets top out at 2K; they use 2K at any setting.)",
                MessageType.Info);
            using (new EditorGUI.DisabledScope(job != null))
                res = GUILayout.Toolbar(res, Resolutions);
            GUILayout.Space(6);
            if (job == null)
            {
                if (GUILayout.Button($"Download {Resolutions[res]} and rebuild materials", GUILayout.Height(32))) Start();
            }
            else
            {
                var r = EditorGUILayout.GetControlRect(false, 20);
                EditorGUI.ProgressBar(r, done / (float)MaterialLibrary.Sets.Length, $"{done}/{MaterialLibrary.Sets.Length}  {current}");
                if (GUILayout.Button("Cancel")) cancel?.Cancel();
            }
            scroll = EditorGUILayout.BeginScrollView(scroll);
            foreach (var l in log) EditorGUILayout.LabelField(l, EditorStyles.miniLabel);
            EditorGUILayout.EndScrollView();
        }

        void Start()
        {
            log.Clear();
            done = 0;
            string resolution = Resolutions[res];
            string rawRoot = Path.Combine(Paths.ProjectRoot, "Library", "SouthboundDownloads", resolution);
            cancel = new CancellationTokenSource();
            var ct = cancel.Token;
            job = Task.Run(async () =>
            {
                var results = new List<FetchResult>();
                using (var f = new MaterialFetcher())
                {
                    foreach (var set in MaterialLibrary.Sets)
                    {
                        if (ct.IsCancellationRequested) break;
                        current = set.Name;
                        results.Add(await f.FetchAsync(set, resolution, Path.Combine(rawRoot, set.Name), ct).ConfigureAwait(false));
                        done++;
                    }
                }
                return results;
            });
            EditorApplication.update += Poll;
        }

        void Poll()
        {
            Repaint();
            if (job == null || !job.IsCompleted) return;
            EditorApplication.update -= Poll;
            var results = job.IsFaulted ? new List<FetchResult>() : job.Result;
            if (job.IsFaulted) log.Add("Failed: " + job.Exception?.GetBaseException().Message);
            job = null;
            Install(results);
        }

        void Install(List<FetchResult> results)
        {
            int ok = 0, i = 0;
            try
            {
                foreach (var r in results)
                {
                    EditorUtility.DisplayProgressBar("Southbound", $"Packing {r.Set.Name}", i++ / (float)Math.Max(1, results.Count));
                    if (!r.Ok) { log.Add($"✗ {r.Set.Name} ({r.Set.Source}): {r.Error}  — keeps the bundled 512 px maps"); continue; }
                    string dir = $"{Paths.Downloaded}/{r.Set.Name}";
                    Paths.Ensure(dir);
                    string abs = Paths.Abs(dir), n = r.Set.Name;
                    void Copy(string map, string to) { if (r.Files.TryGetValue(map, out var src)) File.Copy(src, Path.Combine(abs, $"{n}_{to}{Path.GetExtension(src)}"), true); }
                    Copy("Color", "BaseColor");
                    Copy("Normal", "Normal");
                    Copy("Height", "Height");
                    Copy("Emission", "Emission");
                    r.Files.TryGetValue("Roughness", out var rough);
                    r.Files.TryGetValue("AO", out var ao);
                    r.Files.TryGetValue("Metal", out var metal);
                    r.Files.TryGetValue("Height", out var height);
                    Surfaces.PackMasks(rough, ao, metal, height, Path.Combine(abs, $"{n}_Mask.png"), Path.Combine(abs, $"{n}_TerrainMask.png"));
                    File.WriteAllText(Path.Combine(abs, "SOURCE.txt"), $"{r.Set.Credit}\nLicense: {r.Set.License}\nResolution: {r.Resolution}\n");
                    log.Add($"✓ {n} {r.Resolution} ({string.Join(", ", r.Files.Keys)})");
                    ok++;
                }
            }
            finally { EditorUtility.ClearProgressBar(); }
            AssetDatabase.Refresh();
            Surfaces.BuildAll();
            log.Add($"{ok}/{MaterialLibrary.Sets.Length} sets at full resolution. Materials rebuilt.");
            Debug.Log($"Southbound: {ok}/{MaterialLibrary.Sets.Length} texture sets downloaded and installed.");
        }

        void OnDestroy() { cancel?.Cancel(); EditorApplication.update -= Poll; }
    }
}
