// The Southbound setup window: opens the first time the project is opened and
// walks through everything in order (packages, HDRP, materials, the world, your
// save). Menu: Southbound > Setup.
using System.IO;
using System.Linq;
using Southbound.Core;
using UnityEditor;
using UnityEditor.PackageManager;
using UnityEditor.PackageManager.Requests;
using UnityEngine;

namespace Southbound.EditorTools
{
    [InitializeOnLoad]
    public sealed class SetupWindow : EditorWindow
    {
        // glTF importer (people, animations, guns, trees, props), Input System (keyboard, mouse, gamepad),
        // AI Navigation (navmesh for people and traffic, next on the list)
        static readonly string[] Packages = { "com.unity.cloud.gltfast", "com.unity.inputsystem", "com.unity.ai.navigation" };
        static AddRequest request;
        static readonly System.Collections.Generic.Queue<string> pending = new System.Collections.Generic.Queue<string>();
        Vector2 scroll;

        static SetupWindow()
        {
            EditorApplication.delayCall += () =>
            {
                string key = "Southbound.SetupShown." + Application.dataPath.GetHashCode();
                if (EditorPrefs.GetBool(key)) return;
                EditorPrefs.SetBool(key, true);
                Open();
            };
        }

        [MenuItem("Southbound/Setup", priority = 0)]
        public static void Open() => GetWindow<SetupWindow>(false, "Southbound", true).minSize = new Vector2(460, 560);

        static bool HasType(string name) => Hdrp.FindType(name) != null;
        static bool GltfInstalled => HasType("GLTFast.GltfImport");
        static bool InputSystemInstalled => HasType("UnityEngine.InputSystem.Keyboard");
        static bool MaterialsBuilt => File.Exists(Paths.Abs($"{Paths.Materials}/Asphalt012.mat"));
        static bool SceneBuilt => File.Exists(Paths.Abs($"{Paths.Scenes}/Calvera.unity"));
        static bool FullRes => Directory.Exists(Paths.Abs(Paths.Downloaded)) && Directory.GetDirectories(Paths.Abs(Paths.Downloaded)).Length > 0;

        void OnGUI()
        {
            scroll = EditorGUILayout.BeginScrollView(scroll);
            EditorGUILayout.LabelField("Southbound for Unity", new GUIStyle(EditorStyles.boldLabel) { fontSize = 16 });
            EditorGUILayout.LabelField("Calvera, carried over from the web game. Do these in order.", EditorStyles.wordWrappedMiniLabel);
            GUILayout.Space(8);

            Step(1, "Packages", GltfInstalled && InputSystemInstalled,
                "glTFast (imports John, the animations, guns, trees and props), Input System (gamepad), AI Navigation.",
                request != null && !request.IsCompleted ? "Installing..." : "Install packages", () =>
                {
                    pending.Clear();
                    foreach (var p in Packages) pending.Enqueue(p);
                    NextPackage();
                });

            Step(2, "HDRP", Hdrp.Active,
                Hdrp.Installed ? "HDRP is installed. Open the HDRP Wizard and press Fix All (creates the HDRP asset and sets it up). Pick DirectX 12 in the wizard if you want ray tracing on an RTX card."
                               : "HDRP isn't installed. Package Manager: install High Definition RP, then come back here.",
                "Open HDRP Wizard", () =>
                {
                    PlayerSettings.colorSpace = ColorSpace.Linear;
                    if (!EditorApplication.ExecuteMenuItem("Window/Rendering/HDRP Wizard"))
                        EditorUtility.DisplayDialog("Southbound", "Couldn't find the HDRP Wizard (Window > Rendering > HDRP Wizard). Is HDRP installed?", "OK");
                });

            Step(3, "Materials", MaterialsBuilt,
                "29 photo-scanned CC0 surfaces as HDRP Lit materials (parallax on cobbles, bricks, shingles) and terrain layers. Uses the bundled 512 px maps.",
                "Build materials", Surfaces.BuildAll);

            Step(4, "Full-resolution textures (recommended)", FullRes,
                "Downloads the 2K / 4K / 8K originals from ambientCG and Poly Haven (24 sets) and rebuilds the materials; the 5 cgbookcase sets are a quick browser download each. This is where the detail comes from.",
                "Download...", MaterialDownloader.Open);

            Step(5, "Animations", AnimationsLegacy(),
                "The animation library has to import as Legacy clips so John's skeleton can be driven from it.",
                "Fix animation import", FixAnimationImport);

            Step(6, "Calvera", SceneBuilt,
                "Builds the 4 km map from the web game's data: terrain and ground cover, sea, lakes, roads, buildings, roofs, 47 000 trees, sun and sky, John, and a penetration range by the spawn.",
                "Build Calvera scene", CalveraBuilder.Build);

            Step(7, "Your save (optional)", File.Exists(SouthboundGame.SavePath),
                "In the web game: Pause > Export save. Then import the southbound-save.json here: money, guns, attachments, ammo, needs and where you were all come across.",
                "Import web save...", ImportWebSave);

            GUILayout.Space(10);
            EditorGUILayout.HelpBox("Then press Play. WASD move · Shift sprint · Space jump · C crouch · right mouse aim · left mouse shoot · R reload · 1-9 / wheel switch gun · H holster · Esc pause and save.", MessageType.None);
            EditorGUILayout.EndScrollView();
        }

        static void Step(int n, string title, bool done, string text, string button, System.Action action)
        {
            using (new EditorGUILayout.VerticalScope(EditorStyles.helpBox))
            {
                EditorGUILayout.LabelField($"{n}. {title}   {(done ? "✓ done" : "")}", EditorStyles.boldLabel);
                EditorGUILayout.LabelField(text, EditorStyles.wordWrappedMiniLabel);
                if (GUILayout.Button(button, GUILayout.Height(24))) EditorApplication.delayCall += () => action();
            }
        }

        // one at a time; each resolves to the newest version that fits this editor
        static void NextPackage()
        {
            if (pending.Count == 0) { request = null; return; }
            string name = pending.Dequeue();
            Debug.Log("Southbound: installing " + name);
            request = Client.Add(name);
            EditorApplication.update += WatchRequest;
        }

        static void WatchRequest()
        {
            if (request == null || !request.IsCompleted) return;
            EditorApplication.update -= WatchRequest;
            if (request.Status == StatusCode.Success) Debug.Log($"Southbound: installed {request.Result.name} {request.Result.version}");
            else Debug.LogError("Southbound: package install failed: " + request.Error?.message);
            NextPackage();
        }

        const string UalPath = Paths.Models + "/anims/ual.glb";

        static bool AnimationsLegacy()
        {
            var imp = AssetImporter.GetAtPath(UalPath);
            if (imp == null) return false;
            var p = new SerializedObject(imp).FindProperty("importSettings.animationMethod");
            return p != null && p.enumNames.Length > p.enumValueIndex && p.enumValueIndex >= 0 && p.enumNames[p.enumValueIndex] == "Legacy";
        }

        static void FixAnimationImport()
        {
            var imp = AssetImporter.GetAtPath(UalPath);
            if (imp == null) { EditorUtility.DisplayDialog("Southbound", "ual.glb isn't imported yet: install the packages (step 1) first.", "OK"); return; }
            var so = new SerializedObject(imp);
            var p = so.FindProperty("importSettings.animationMethod");
            if (p == null) { Debug.LogWarning("Southbound: this glTFast version has no importSettings.animationMethod; set Animation to Legacy on ual.glb by hand."); return; }
            int legacy = System.Array.IndexOf(p.enumNames, "Legacy");
            if (legacy < 0) return;
            p.enumValueIndex = legacy;
            so.ApplyModifiedPropertiesWithoutUndo();
            imp.SaveAndReimport();
            Debug.Log("Southbound: ual.glb now imports its 24 clips as Legacy animations.");
        }

        [MenuItem("Southbound/Import web save...", priority = 60)]
        public static void ImportWebSave()
        {
            string file = EditorUtility.OpenFilePanel("Southbound save from the web game", System.Environment.GetFolderPath(System.Environment.SpecialFolder.UserProfile) + "/Downloads", "json");
            if (string.IsNullOrEmpty(file)) return;
            try
            {
                var p = Profile.FromJson(File.ReadAllText(file));
                Directory.CreateDirectory(Path.GetDirectoryName(SouthboundGame.SavePath));
                File.Copy(file, SouthboundGame.SavePath, true);
                EditorUtility.DisplayDialog("Southbound", $"Save imported.\n\n${p.Money:N0} cash, day {p.Day}, {p.OwnedWeapons.Count} weapons, {p.Properties.Count} properties.\n\n{SouthboundGame.SavePath}", "OK");
            }
            catch (System.Exception e) { EditorUtility.DisplayDialog("Southbound", "That doesn't look like a Southbound save: " + e.Message, "OK"); }
        }

        [MenuItem("Southbound/Open save folder", priority = 61)]
        public static void OpenSaveFolder() => EditorUtility.RevealInFinder(SouthboundGame.SavePath);
    }
}
