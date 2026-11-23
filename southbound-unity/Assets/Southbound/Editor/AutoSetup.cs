// "Set up everything": the setup window's steps one after another, with nobody at the keyboard: the packages
// (glTFast, Input System, AI Navigation), HDRP (an HDRP asset made and switched on, linear colour, DirectX 12
// first for ray tracing), the materials, the full-resolution 4K textures, the animation import, and the Calvera
// scene. Installing packages reloads the editor's scripts (and the Input System may ask to restart Unity), so the
// step it's on is kept in EditorPrefs and it carries on by itself after a reload or a restart. A step that fails
// is reported in the Console and skipped where the game can do without it (the 4K textures); the others stop
// the run with a message saying what to do.
using System;
using System.Linq;
using UnityEditor;
using UnityEditor.PackageManager;
using UnityEditor.PackageManager.Requests;
using UnityEngine;
using UnityEngine.Rendering;
using Object = UnityEngine.Object;

namespace Southbound.EditorTools
{
    [InitializeOnLoad]
    public static class AutoSetup
    {
        public static readonly string[] Steps = { "Installing packages", "Setting up HDRP", "Building materials", "Downloading 4K textures", "Fixing the animation import", "Building the Calvera scene" };

        static string Key => "Southbound.AutoSetup." + Application.dataPath.GetHashCode();
        /// <summary>The step running now (0-based), or -1 when it isn't running.</summary>
        public static int Step { get => EditorPrefs.GetInt(Key + ".step", -1); private set => EditorPrefs.SetInt(Key + ".step", value); }
        static double StepStarted { get => double.TryParse(EditorPrefs.GetString(Key + ".t", "0"), out var t) ? t : 0; set => EditorPrefs.SetString(Key + ".t", value.ToString("R")); }
        public static bool Running => Step >= 0;
        public static string Status => Running && Step < Steps.Length ? $"Step {Step + 1} of {Steps.Length}: {Steps[Step]}..." : "";

        static bool busy;          // the current step's work has been started in this domain
        static AddRequest request;

        static AutoSetup()
        {
            // carry on after a script reload or an editor restart
            if (Running) EditorApplication.delayCall += () => { EditorApplication.update -= Tick; EditorApplication.update += Tick; };
        }

        public static void Start()
        {
            Step = 0; StepStarted = Now; busy = false; request = null;
            foreach (var n in Needed) EditorPrefs.DeleteKey(Key + ".asked." + n.pkg);
            Debug.Log("Southbound: setting up everything. This takes a while (the 4K textures are about 2 GB); Unity may reload or ask to restart on the way. It carries on by itself.");
            EditorApplication.update -= Tick; EditorApplication.update += Tick;
        }

        public static void Stop(string why = null)
        {
            Step = -1; busy = false;
            EditorApplication.update -= Tick;
            EditorUtility.ClearProgressBar();
            if (why != null) { Debug.LogWarning("Southbound: setup stopped: " + why); EditorUtility.DisplayDialog("Southbound", "Setup stopped:\n\n" + why, "OK"); }
        }

        static double Now => DateTime.UtcNow.Subtract(DateTime.UnixEpoch).TotalSeconds;

        static void Next()
        {
            busy = false;
            Step = Step + 1; StepStarted = Now;
            if (Step >= Steps.Length) Finish();
        }

        static void Tick()
        {
            if (!Running) { EditorApplication.update -= Tick; return; }
            if (EditorApplication.isCompiling || EditorApplication.isUpdating || EditorApplication.isPlayingOrWillChangePlaymode) return;
            try
            {
                switch (Step)
                {
                    case 0: Packages0(); break;
                    case 1: HdrpSetup(); Next(); break;
                    case 2: Surfaces.BuildAll(); Next(); break;
                    case 3: Textures(); break;
                    case 4: Animations(); break;
                    case 5: EditorApplication.update -= Tick; CalveraBuilder.Build(); EditorApplication.update += Tick; Next(); break;
                    default: Finish(); break;
                }
            }
            catch (Exception e)
            {
                Debug.LogException(e);
                Stop($"{Steps[Mathf.Clamp(Step, 0, Steps.Length - 1)]} failed: {e.Message}\n\nThe details are in the Console. The setup window's buttons still work one by one.");
            }
        }

        // ------------------------------------------------------------------ 1. packages
        // each one, and a type that's there once it has installed and compiled
        static readonly (string pkg, string type)[] Needed =
        {
            ("com.unity.cloud.gltfast", "GLTFast.GltfImport"), ("com.unity.inputsystem", "UnityEngine.InputSystem.Keyboard"),
            ("com.unity.ai.navigation", "Unity.AI.Navigation.NavMeshSurface"),
        };
        static bool Has(string type) => Hdrp.FindType(type) != null;

        // one at a time: each install compiles and reloads the editor's scripts, and this carries on afterwards
        static void Packages0()
        {
            if (request != null && !request.IsCompleted) return;
            if (request != null && request.Status == StatusCode.Failure)
            {
                var e = request.Error?.message; request = null;
                Stop("a package didn't install: " + e);
                return;
            }
            var missing = Needed.FirstOrDefault(n => !Has(n.type));
            if (missing.pkg == null) { foreach (var n in Needed) EditorPrefs.DeleteKey(Key + ".asked." + n.pkg); Debug.Log("Southbound: packages in."); Next(); return; }
            string asked = Key + ".asked." + missing.pkg;
            if (EditorPrefs.HasKey(asked))
            {
                // asked already (here or before a reload): it appears once Unity has compiled it
                double.TryParse(EditorPrefs.GetString(asked), out var when);
                if (Now - when < 600) return;
                EditorPrefs.DeleteKey(asked);
                Stop($"{missing.pkg} still isn't in after 10 minutes. Install it with the setup window's first button, or Window > Package Manager.");
                return;
            }
            EditorPrefs.SetString(asked, Now.ToString("R"));
            Debug.Log("Southbound: installing " + missing.pkg);
            request = Client.Add(missing.pkg);
        }

        // ------------------------------------------------------------------ 2. HDRP
        /// <summary>An HDRP asset (if there's none), set as the project's pipeline; linear colour; DirectX 12 first.</summary>
        public static void HdrpSetup()
        {
            PlayerSettings.colorSpace = ColorSpace.Linear;
            // DirectX 12 first so HDRP's ray tracing can run on an RTX card (DirectX 11 behind it for older cards)
            try
            {
                PlayerSettings.SetUseDefaultGraphicsAPIs(BuildTarget.StandaloneWindows64, false);
                PlayerSettings.SetGraphicsAPIs(BuildTarget.StandaloneWindows64, new[] { UnityEngine.Rendering.GraphicsDeviceType.Direct3D12, UnityEngine.Rendering.GraphicsDeviceType.Direct3D11 });
            }
            catch (Exception e) { Debug.LogWarning("Southbound: couldn't set DirectX 12: " + e.Message); }
            if (Hdrp.Active) { Debug.Log("Southbound: HDRP already set up."); return; }
            var assetType = Hdrp.FindType("UnityEngine.Rendering.HighDefinition.HDRenderPipelineAsset");
            if (assetType == null) throw new Exception("HDRP isn't installed (Package Manager: High Definition RP).");
            var existing = AssetDatabase.FindAssets("t:HDRenderPipelineAsset").Select(g => AssetDatabase.LoadAssetAtPath<RenderPipelineAsset>(AssetDatabase.GUIDToAssetPath(g))).FirstOrDefault(a => a != null);
            var asset = existing;
            if (asset == null)
            {
                Paths.Ensure(Paths.Root + "/Settings");
                asset = (RenderPipelineAsset)ScriptableObject.CreateInstance(assetType);
                AssetDatabase.CreateAsset(asset, Paths.Root + "/Settings/HDRenderPipelineAsset.asset");
                AssetDatabase.SaveAssets();
            }
            GraphicsSettings.defaultRenderPipeline = asset;
            // every quality level uses it (a level with its own pipeline overrides the default)
            int keep = QualitySettings.GetQualityLevel();
            for (int i = 0; i < QualitySettings.names.Length; i++) { QualitySettings.SetQualityLevel(i, false); QualitySettings.renderPipeline = asset; }
            QualitySettings.SetQualityLevel(keep, false);
            AssetDatabase.SaveAssets();
            Debug.Log($"Southbound: HDRP switched on ({AssetDatabase.GetAssetPath(asset)}). Window > Rendering > HDRP Wizard can check the rest.");
        }

        // ------------------------------------------------------------------ 4. textures
        static void Textures()
        {
            if (busy) return;   // waiting for the download (MaterialDownloader calls back)
            busy = true;
            MaterialDownloader.StartUnattended(1, ok =>
            {
                if (ok == 0) Debug.LogWarning("Southbound: no 4K textures came down (no internet?); the game uses the bundled 512 px maps. Try Southbound > Materials > Download later.");
                if (Running && Step == 3) Next();
            });
        }

        // ------------------------------------------------------------------ 5. animations
        static void Animations()
        {
            if (AssetImporter.GetAtPath(Paths.Models + "/anims/ual.glb") == null)
            {
                // the models import after glTFast arrives; give it a few minutes
                if (Now - StepStarted < 300) { AssetDatabase.Refresh(); return; }
                Stop("the animation library (Art/Models/anims/ual.glb) didn't import. Is glTFast installed (step 1)?");
                return;
            }
            SetupWindow.FixAnimationImport();
            Next();
        }

        static void Finish()
        {
            Step = -1; busy = false;
            EditorApplication.update -= Tick;
            EditorUtility.ClearProgressBar();
            Debug.Log("Southbound: set up. Press Play.");
            EditorUtility.DisplayDialog("Southbound", "Everything is set up and Calvera is built.\n\nPress Play (the ▶ at the top) to drive around.\n\nIf you changed to DirectX 12 just now, restart Unity once for ray tracing.", "Play later");
        }
    }
}
