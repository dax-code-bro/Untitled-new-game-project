// Fits Calvera to the graphics card (Core/GpuTier): on a laptop's built-in Intel or AMD graphics the game
// starts on the Integrated tier, which switches off HDRP's heaviest passes per camera (volumetric clouds and
// fog, screen-space reflections and GI, contact shadows, subsurface scattering, motion blur, film grain),
// draws at 50-80% resolution upscaled with STP (or the best upscaler the card has), and thins the world:
// fewer townspeople and cars, short grass and tree distances, a close shadow range, street lights and decals
// only nearby. Resolution then moves inside the tier's range to hold its frame rate, and if a tier still
// can't keep up for a while it drops to the one below. F7 picks a tier by hand (kept for next time).
// The Windows player asks for the dedicated card on laptops that have one (Unity exports the NVIDIA and AMD
// hints); this is for machines that only have built-in graphics, or where Windows insists on them.
using System;
using System.Collections;
using System.Reflection;
using Southbound.Core;
using UnityEngine;

namespace Southbound
{
    public sealed class PerformanceTier : MonoBehaviour
    {
        const string PrefKey = "southbound.tier";
        public static TierBudget Budget { get; private set; } = GpuTier.Budget(Tier.High);
        public static float RenderScale { get; private set; } = 1f;
        public static event Action<TierBudget> Changed;

        [Tooltip("Shown for a few seconds when the tier changes.")]
        public bool showNotice = true;
        string notice; float noticeUntil;
        float smoothMs = 16, slowFor;
        Delegate scaler;

        void Start()
        {
            var detected = GpuTier.Classify(SystemInfo.graphicsDeviceName, SystemInfo.graphicsMemorySize);
            int saved = PlayerPrefs.GetInt(PrefKey, -1);
            var t = saved >= 0 && saved <= 3 ? (Tier)saved : detected;
            Apply(t, saved >= 0 ? "your choice" : $"{SystemInfo.graphicsDeviceName}");
            InstallScaler();
        }

        void Update()
        {
            if (SbInput.TierDown)
            {
                var next = (Tier)(((int)Budget.Tier + 1) % 4);
                PlayerPrefs.SetInt(PrefKey, (int)next);
                Apply(next, "F7");
            }
            // hold the frame rate: resolution first, then the tier below if that isn't enough
            float ms = Time.unscaledDeltaTime * 1000f;
            if (ms > 0 && ms < 500) smoothMs = Mathf.Lerp(smoothMs, ms, 0.05f);
            RenderScale = GpuTier.NextScale(RenderScale, smoothMs, Budget);
            bool atFloor = RenderScale <= Budget.MinScale + 1e-3f;
            slowFor = atFloor && smoothMs > 1000f / Budget.TargetFps * 1.25f ? slowFor + Time.unscaledDeltaTime : 0;
            if (slowFor > 8 && Budget.Tier > Tier.Integrated && PlayerPrefs.GetInt(PrefKey, -1) < 0)
            {
                slowFor = 0;
                Apply(Budget.Tier - 1, "running slow");
            }
        }

        public void Apply(Tier t, string why)
        {
            Budget = GpuTier.Budget(t);
            RenderScale = Budget.MaxScale;
            QualitySettings.lodBias = Budget.LodBias;
            foreach (var terrain in Terrain.activeTerrains)
            {
                terrain.detailObjectDensity = Budget.GrassDensity;
                terrain.detailObjectDistance = Budget.GrassDistance;
                terrain.treeDistance = Budget.TreeDistance;
                terrain.treeBillboardDistance = Budget.TreeBillboard;
                terrain.heightmapPixelError = Budget.TerrainPixelError;
            }
            StartCoroutine(ApplyRendering());
            Changed?.Invoke(Budget);
            notice = $"Graphics: {t} ({why}). {Mathf.RoundToInt(Budget.MinScale * 100)}-{Mathf.RoundToInt(Budget.MaxScale * 100)}% resolution. F7 to change.";
            noticeUntil = Time.unscaledTime + 6;
            Debug.Log("Southbound: " + notice);
        }

        IEnumerator ApplyRendering()
        {
            yield return null;   // after every camera and volume has woken
            foreach (var cam in Camera.allCameras) Frame(cam);
            Volume();
            foreach (var p in FindAll("UnityEngine.Rendering.HighDefinition.DecalProjector"))
                Set(p, "drawDistance", Budget.DecalDistance);
            // water: the tessellated, caustic-lit surface on the cards that can afford it
            foreach (var w in FindAll("UnityEngine.Rendering.HighDefinition.WaterSurface"))
            {
                Set(w, "tessellation", Budget.Tier >= Tier.Medium);
                Set(w, "caustics", Budget.Tier >= Tier.High);
            }
        }

        // ------------------------------------------------------------------ HDRP by reflection
        static Type T(string name) { foreach (var a in AppDomain.CurrentDomain.GetAssemblies()) { var t = a.GetType(name); if (t != null) return t; } return null; }

        static UnityEngine.Object[] FindAll(string typeName)
        {
            var t = T(typeName);
            return t == null ? new UnityEngine.Object[0] : FindObjectsByType(t, FindObjectsSortMode.None);
        }

        static void Set(object target, string name, object value)
        {
            if (target == null) return;
            var ty = target.GetType();
            var p = ty.GetProperty(name, BindingFlags.Public | BindingFlags.Instance);
            try
            {
                if (p != null && p.CanWrite) { p.SetValue(target, Convert(value, p.PropertyType)); return; }
                var f = ty.GetField(name, BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance);
                f?.SetValue(target, Convert(value, f.FieldType));
            }
            catch { /* an HDRP without it */ }
        }

        static object Convert(object v, Type to) => v == null || to.IsInstanceOfType(v) ? v : to.IsEnum ? (v is string s ? Enum.Parse(to, s) : Enum.ToObject(to, v)) : System.Convert.ChangeType(v, to);

        /// <summary>This camera's own HDRP frame settings: the tier's passes on or off, dynamic resolution allowed.</summary>
        void Frame(Camera cam)
        {
            cam.allowDynamicResolution = true;
            var hdType = T("UnityEngine.Rendering.HighDefinition.HDAdditionalCameraData");
            var fieldType = T("UnityEngine.Rendering.HighDefinition.FrameSettingsField");
            if (hdType == null || fieldType == null) return;
            var hd = cam.GetComponent(hdType);
            if (hd == null) return;
            Set(hd, "allowDynamicResolution", true);
            Set(hd, "customRenderingSettings", true);
            var fsField = hdType.GetField("m_RenderingPathCustomFrameSettings", BindingFlags.NonPublic | BindingFlags.Instance);
            var maskField = hdType.GetField("renderingPathCustomFrameSettingsOverrideMask", BindingFlags.Public | BindingFlags.Instance);
            if (fsField == null || maskField == null) return;
            object fs = fsField.GetValue(hd), mask = maskField.GetValue(hd);
            var bitsField = mask.GetType().GetField("mask");
            object bits = bitsField?.GetValue(mask);
            var setEnabled = fs.GetType().GetMethod("SetEnabled");
            var indexer = bits?.GetType().GetProperty("Item");
            var b = Budget;
            foreach (var (name, on) in new[]
            {
                ("VolumetricClouds", b.VolumetricClouds), ("Volumetrics", b.VolumetricFog), ("ReprojectionForVolumetrics", b.VolumetricFog),
                ("SSR", b.Ssr), ("TransparentSSR", b.Ssr), ("SSGI", b.Ssgi), ("SSAO", b.Ssao), ("ContactShadows", b.ContactShadows),
                ("SubsurfaceScattering", b.Subsurface), ("MotionBlur", b.MotionBlur), ("FilmGrain", b.FilmGrain),
                ("LensFlareScreenSpace", b.LensFlares), ("LensFlareDataDriven", b.LensFlares), ("ChromaticAberration", b.Tier >= Tier.High),
                ("DepthOfField", b.Tier >= Tier.High), ("Distortion", b.Tier >= Tier.Medium), ("LowResTransparent", true),
            })
            {
                object f;
                try { f = Enum.Parse(fieldType, name); } catch { continue; }   // a field this HDRP doesn't have
                try
                {
                    setEnabled?.Invoke(fs, new[] { f, (object)on });
                    indexer?.SetValue(bits, true, new object[] { System.Convert.ToUInt32(f) });
                }
                catch { /* skip */ }
            }
            if (bitsField != null && bits != null) bitsField.SetValue(mask, bits);
            fsField.SetValue(hd, fs);
            maskField.SetValue(hd, mask);
        }

        /// <summary>The scene's look (its own copy of the profile): clouds, fog, reflections, GI and shadow range by tier.</summary>
        void Volume()
        {
            var volType = T("UnityEngine.Rendering.Volume");
            if (volType == null) return;
            foreach (var v in FindObjectsByType(volType, FindObjectsSortMode.None))
            {
                var profile = volType.GetProperty("profile")?.GetValue(v);
                if (profile == null) continue;
                var list = profile.GetType().GetField("components")?.GetValue(profile) as IEnumerable;
                if (list == null) continue;
                foreach (var c in list)
                {
                    if (c == null) continue;
                    switch (c.GetType().Name)
                    {
                        case "VolumetricClouds": Param(c, "enable", Budget.VolumetricClouds); break;
                        case "Fog": Param(c, "enableVolumetricFog", Budget.VolumetricFog); break;
                        case "GlobalIllumination": Param(c, "enable", Budget.Ssgi); break;
                        case "ScreenSpaceReflection": Param(c, "enabled", Budget.Ssr); break;
                        case "ContactShadows": Param(c, "enable", Budget.ContactShadows); break;
                        case "MotionBlur": Param(c, "intensity", Budget.MotionBlur ? 0.3f : 0f); break;
                        case "FilmGrain": Param(c, "intensity", Budget.FilmGrain ? 0.12f : 0f); break;
                        case "HDShadowSettings": Param(c, "maxShadowDistance", Budget.ShadowDistance); Param(c, "cascadeShadowSplitCount", Budget.Cascades); break;
                    }
                }
            }
        }

        static void Param(object comp, string field, object value)
        {
            var param = comp.GetType().GetField(field, BindingFlags.Public | BindingFlags.Instance)?.GetValue(comp);
            if (param == null) return;
            param.GetType().GetProperty("overrideState")?.SetValue(param, true);
            var vp = param.GetType().GetProperty("value");
            if (vp != null) try { vp.SetValue(param, Convert(value, vp.PropertyType)); } catch { /* type mismatch */ }
        }

        /// <summary>Hands HDRP's dynamic resolution our render scale (as a percentage of the screen).</summary>
        void InstallScaler()
        {
            var handler = T("UnityEngine.Rendering.DynamicResolutionHandler");
            var del = T("UnityEngine.Rendering.PerformDynamicRes");
            var policy = T("UnityEngine.Rendering.DynamicResScalePolicyType");
            var set = handler?.GetMethod("SetDynamicResScaler", BindingFlags.Public | BindingFlags.Static);
            if (set == null || del == null || policy == null) { Debug.Log("Southbound: no HDRP dynamic resolution here: full resolution."); return; }
            scaler = Delegate.CreateDelegate(del, this, GetType().GetMethod(nameof(Percentage), BindingFlags.NonPublic | BindingFlags.Instance));
            set.Invoke(null, new object[] { scaler, Enum.Parse(policy, "ReturnsPercentage") });
        }

        float Percentage() => RenderScale * 100f;

        void OnGUI()
        {
            if (!showNotice || Time.unscaledTime > noticeUntil || string.IsNullOrEmpty(notice)) return;
            var r = new Rect(16, Screen.height - 56, Mathf.Min(Screen.width - 32, 760), 40);
            GUI.color = new Color(0, 0, 0, 0.6f); GUI.DrawTexture(r, Texture2D.whiteTexture); GUI.color = Color.white;
            GUI.Label(new Rect(r.x + 12, r.y + 10, r.width - 24, 24), notice);
        }
    }
}
