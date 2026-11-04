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
                "2K: about 0.4 GB to download.  4K: about 2 GB, the right choice for an RTX-class PC.  8K: about 7 GB, close-up detail, heavy on VRAM.\n24 sets come down automatically (ambientCG, Poly Haven). The 5 cgbookcase sets (2K) are a browser download each; the log lists their pages, then use Import downloaded zip.",
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
                        if (!set.Automatic) { done++; continue; } // cgbookcase: by hand (see the log)
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
                    InstallOne(r);
                    log.Add($"✓ {r.Set.Name} {r.Resolution} ({string.Join(", ", r.Files.Keys)})");
                    ok++;
                }
            }
            finally { EditorUtility.ClearProgressBar(); }
            AssetDatabase.Refresh();
            Surfaces.BuildAll();
            log.Add($"{ok} sets at full resolution. Materials rebuilt.");
            var manual = MaterialLibrary.Sets.Where(s => !s.Automatic).ToList();
            if (manual.Count > 0)
            {
                log.Add($"{manual.Count} cgbookcase sets have to be downloaded in a browser (2K, free, no account): open each page, press Download, then Southbound > Materials > Import downloaded zip.");
                foreach (var s in manual) log.Add("   " + s.Page);
            }
            Debug.Log($"Southbound: {ok} texture sets downloaded and installed.");
        }

        /// <summary>Copies a set's maps into Art/Downloaded and packs its HDRP masks.</summary>
        public static void InstallOne(FetchResult r)
        {
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
        }

        /// <summary>For sets downloaded in a browser (cgbookcase), or any texture zip from the three sites.</summary>
        [MenuItem("Southbound/Materials/Import downloaded zip...", priority = 22)]
        public static void ImportZip()
        {
            string file = EditorUtility.OpenFilePanel("Texture zip (e.g. Cobblestone01_MR_2K.zip)", Environment.GetFolderPath(Environment.SpecialFolder.UserProfile) + "/Downloads", "zip");
            if (string.IsNullOrEmpty(file)) return;
            string fname = Path.GetFileNameWithoutExtension(file);
            var set = MaterialLibrary.Sets.OrderByDescending(s => s.Name.Length).FirstOrDefault(s => fname.StartsWith(s.Name, StringComparison.OrdinalIgnoreCase));
            if (set == null)
            {
                EditorUtility.DisplayDialog("Southbound", $"{Path.GetFileName(file)} doesn't match any of the 29 surfaces (the file name should start with the set name, e.g. Cobblestone01_...).", "OK");
                return;
            }
            var r = new FetchResult { Set = set, Resolution = fname.Contains("4K") ? "4K" : fname.Contains("8K") ? "8K" : fname.Contains("1K") ? "1K" : "2K" };
            string tmp = Path.Combine(Paths.ProjectRoot, "Library", "SouthboundDownloads", "manual", set.Name);
            MaterialFetcher.ExtractZip(File.ReadAllBytes(file), tmp, r);
            if (!r.Ok) { EditorUtility.DisplayDialog("Southbound", $"No colour and normal map found in {Path.GetFileName(file)} (got: {string.Join(", ", r.Files.Keys)}).", "OK"); return; }
            InstallOne(r);
            AssetDatabase.Refresh();
            Surfaces.Build(set);
            Surfaces.Layer(set);
            AssetDatabase.SaveAssets();
            Debug.Log($"Southbound: {set.Name} installed from {Path.GetFileName(file)} ({string.Join(", ", r.Files.Keys)}).");
        }

        void OnDestroy() { cancel?.Cancel(); EditorApplication.update -= Poll; }
    }
}
