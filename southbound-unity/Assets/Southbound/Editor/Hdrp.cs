// HDRP calls made by name, so this editor code compiles before HDRP is
// installed (and keeps compiling across HDRP versions). Every call fails soft:
// it logs and carries on.
using System;
using System.Linq;
using System.Reflection;
using UnityEditor;
using UnityEngine;
using Object = UnityEngine.Object;

namespace Southbound.EditorTools
{
    public static class Hdrp
    {
        public static bool Active
        {
            get
            {
                var rp = UnityEngine.Rendering.GraphicsSettings.currentRenderPipeline;
                return rp != null && rp.GetType().Name.Contains("HDRenderPipelineAsset");
            }
        }
        public static bool Installed => Shader.Find("HDRP/Lit") != null;

        public static Type FindType(string fullName)
        {
            foreach (var a in AppDomain.CurrentDomain.GetAssemblies())
            {
                var t = a.GetType(fullName, false);
                if (t != null) return t;
            }
            return null;
        }

        /// <summary>HDRP sets a material's keywords and passes from its properties; do that after editing them.</summary>
        public static void ResetKeywords(Material m)
        {
            var t = FindType("UnityEditor.Rendering.HighDefinition.HDShaderUtils");
            var mi = t?.GetMethod("ResetMaterialKeywords", BindingFlags.Public | BindingFlags.Static, null, new[] { typeof(Material) }, null);
            try { mi?.Invoke(null, new object[] { m }); }
            catch (Exception e) { Debug.LogWarning($"Southbound: HDRP keyword reset failed on {m.name}: {e.InnerException?.Message ?? e.Message}"); }
        }

        public static bool SetMember(object target, string name, object value)
        {
            if (target == null) return false;
            var t = target.GetType();
            try
            {
                var p = t.GetProperty(name, BindingFlags.Public | BindingFlags.Instance);
                if (p != null && p.CanWrite) { p.SetValue(target, Convert(value, p.PropertyType)); return true; }
                var f = t.GetField(name, BindingFlags.Public | BindingFlags.Instance);
                if (f != null) { f.SetValue(target, Convert(value, f.FieldType)); return true; }
            }
            catch (Exception e) { Debug.LogWarning($"Southbound: couldn't set {t.Name}.{name}: {e.InnerException?.Message ?? e.Message}"); }
            return false;
        }

        static object Convert(object v, Type to)
        {
            if (v == null || to.IsInstanceOfType(v)) return v;
            if (to.IsEnum) return v is string s ? Enum.Parse(to, s) : Enum.ToObject(to, v);
            return System.Convert.ChangeType(v, to);
        }

        public static object Invoke(object target, string method, params object[] args)
        {
            if (target == null) return null;
            var mi = target.GetType().GetMethods(BindingFlags.Public | BindingFlags.Instance)
                .FirstOrDefault(m => m.Name == method && m.GetParameters().Length == args.Length);
            try { return mi?.Invoke(target, args); }
            catch (Exception e) { Debug.LogWarning($"Southbound: {target.GetType().Name}.{method} failed: {e.InnerException?.Message ?? e.Message}"); return null; }
        }

        /// <summary>A sun in lux (HDRP is physically based: a clear noon is ~100 000 lux).</summary>
        public static void SetupSun(Light light, float lux)
        {
            light.type = LightType.Directional;
            light.shadows = LightShadows.Soft;
            light.useColorTemperature = true;
            light.colorTemperature = 5600;
            var hdType = FindType("UnityEngine.Rendering.HighDefinition.HDAdditionalLightData");
            Component hd = null;
            if (hdType != null) hd = light.GetComponent(hdType) ?? light.gameObject.AddComponent(hdType);
            SetMember(light, "lightUnit", "Lux"); // Unity 2023+: the unit lives on the Light
            light.intensity = lux;
            if (hd != null)
            {
                var set = hdType.GetMethods().FirstOrDefault(m => m.Name == "SetIntensity" && m.GetParameters().Length == 1);
                try { set?.Invoke(hd, new object[] { lux }); } catch { /* newer HDRP: Light.intensity already set */ }
                Invoke(hd, "EnableShadows", true);
            }
        }

        /// <summary>
        /// A global Volume for the scene: physically based sky, automatic exposure, volumetric
        /// fog, ACES, contact shadows, SSAO and a long shadow distance.
        /// </summary>
        public static GameObject CreateSkyAndFogVolume(string profilePath)
        {
            var volType = FindType("UnityEngine.Rendering.Volume");
            var profType = FindType("UnityEngine.Rendering.VolumeProfile");
            if (volType == null || profType == null) { Debug.LogWarning("Southbound: Volume types not found (is HDRP installed?)."); return null; }
            var profile = AssetDatabase.LoadAssetAtPath(profilePath, profType) as ScriptableObject;
            if (profile == null)
            {
                profile = ScriptableObject.CreateInstance(profType);
                AssetDatabase.CreateAsset(profile, profilePath);
                Override(profile, "UnityEngine.Rendering.HighDefinition.VisualEnvironment", ("skyType", 4), ("skyAmbientMode", "Dynamic"));
                Override(profile, "UnityEngine.Rendering.HighDefinition.PhysicallyBasedSky");
                Override(profile, "UnityEngine.Rendering.HighDefinition.Exposure", ("mode", "AutomaticHistogram"), ("limitMin", -2f), ("limitMax", 16f));
                Override(profile, "UnityEngine.Rendering.HighDefinition.Fog", ("enabled", true), ("meanFreePath", 900f), ("maximumHeight", 600f), ("enableVolumetricFog", true));
                Override(profile, "UnityEngine.Rendering.HighDefinition.Tonemapping", ("mode", "ACES"));
                Override(profile, "UnityEngine.Rendering.HighDefinition.HDShadowSettings", ("maxShadowDistance", 600f));
                Override(profile, "UnityEngine.Rendering.HighDefinition.ContactShadows", ("enable", true));
                Override(profile, "UnityEngine.Rendering.HighDefinition.ScreenSpaceAmbientOcclusion", ("intensity", 1f));
                Override(profile, "UnityEngine.Rendering.HighDefinition.Bloom", ("intensity", 0.08f));
                EditorUtility.SetDirty(profile);
                AssetDatabase.SaveAssets();
            }
            var go = new GameObject("Sky and Fog Volume");
            var vol = go.AddComponent(volType);
            SetMember(vol, "isGlobal", true);
            SetMember(vol, "sharedProfile", profile);
            return go;
        }

        static void Override(ScriptableObject profile, string typeName, params (string field, object value)[] values)
        {
            var t = FindType(typeName);
            if (t == null) { Debug.LogWarning($"Southbound: {typeName} not found in this HDRP version, skipped."); return; }
            var add = profile.GetType().GetMethod("Add", new[] { typeof(Type), typeof(bool) });
            var comp = add?.Invoke(profile, new object[] { t, false }) as ScriptableObject;
            if (comp == null) return;
            comp.hideFlags = HideFlags.HideInInspector | HideFlags.HideInHierarchy;
            AssetDatabase.AddObjectToAsset(comp, profile);
            foreach (var (field, value) in values)
            {
                var f = t.GetField(field, BindingFlags.Public | BindingFlags.Instance);
                var param = f?.GetValue(comp);
                if (param == null) { Debug.LogWarning($"Southbound: {t.Name}.{field} not found, skipped."); continue; }
                SetMember(param, "value", value);
                SetMember(param, "overrideState", true);
            }
            EditorUtility.SetDirty(comp);
        }

        /// <summary>Make an imported material asset editable copy if needed.</summary>
        public static Material Lit()
        {
            var sh = Shader.Find("HDRP/Lit") ?? Shader.Find("Universal Render Pipeline/Lit") ?? Shader.Find("Standard");
            return new Material(sh);
        }

        public static bool IsHdrpShader(Material m) => m != null && m.shader != null && m.shader.name.StartsWith("HDRP/");
        public static bool IsUrpShader(Material m) => m != null && m.shader != null && m.shader.name.StartsWith("Universal Render Pipeline/");

        public static void Destroy(Object o) { if (o != null) Object.DestroyImmediate(o); }
    }
}
