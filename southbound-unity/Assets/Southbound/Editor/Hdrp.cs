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

        /// <summary>A directional light drawn in HDRP's physically based sky as a disc (sun or moon).</summary>
        public static void SetupCelestialBody(Light light, float angularDiameterDegrees, float flareSize, Texture surface)
        {
            var hdType = FindType("UnityEngine.Rendering.HighDefinition.HDAdditionalLightData");
            if (hdType == null) return;
            var hd = light.GetComponent(hdType) ?? light.gameObject.AddComponent(hdType);
            SetMember(hd, "interactsWithSky", true);
            SetMember(hd, "angularDiameter", angularDiameterDegrees);
            SetMember(hd, "flareSize", flareSize);
            if (surface != null) SetMember(hd, "surfaceTexture", surface);
        }

        /// <summary>A lamp (car headlight, brake light) in lumens, no shadows.</summary>
        public static void SetupLamp(Light light, float lumens)
        {
            light.shadows = LightShadows.None;
            var hdType = FindType("UnityEngine.Rendering.HighDefinition.HDAdditionalLightData");
            if (hdType == null || !Installed) { light.intensity = light.type == LightType.Spot ? 3f : 1.5f; return; }
            var hd = light.GetComponent(hdType) ?? light.gameObject.AddComponent(hdType);
            if (!SetMember(light, "lightUnit", "Lumen")) SetMember(hd, "lightUnit", "Lumen"); // (older HDRP keeps the unit on its own component)
            light.intensity = lumens;
            var set = hdType.GetMethods().FirstOrDefault(m => m.Name == "SetIntensity" && m.GetParameters().Length == 1);
            try { set?.Invoke(hd, new object[] { lumens }); } catch { /* newer HDRP: Light.intensity already set */ }
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

        /// <summary>Adds a Volume override (by HDRP type name) to a profile and sets its parameters: a public
        /// VolumeParameter field gets its value and override switched on; a plain public property (like
        /// VolumetricClouds.cloudPreset) is set directly. Returns the component, or null when this HDRP has no such type.</summary>
        public static ScriptableObject Override(ScriptableObject profile, string typeName, params (string field, object value)[] values)
        {
            var t = FindType(typeName);
            if (t == null) { Debug.LogWarning($"Southbound: {typeName} not found in this HDRP version, skipped."); return null; }
            ScriptableObject comp = null;
            // reuse the profile's existing component of this type
            if (profile.GetType().GetField("components")?.GetValue(profile) is System.Collections.IList list)
                foreach (var c in list) if (c != null && c.GetType() == t) comp = (ScriptableObject)c;
            if (comp == null)
            {
                var add = profile.GetType().GetMethod("Add", new[] { typeof(Type), typeof(bool) });
                comp = add?.Invoke(profile, new object[] { t, false }) as ScriptableObject;
                if (comp == null) return null;
                comp.hideFlags = HideFlags.HideInInspector | HideFlags.HideInHierarchy;
                if (AssetDatabase.Contains(profile)) AssetDatabase.AddObjectToAsset(comp, profile);
            }
            SetMember(comp, "active", true);
            foreach (var (field, value) in values)
            {
                var f = t.GetField(field, BindingFlags.Public | BindingFlags.Instance);
                var param = f?.GetValue(comp);
                if (param != null)
                {
                    SetMember(param, "value", value);
                    SetMember(param, "overrideState", true);
                    continue;
                }
                var prop = t.GetProperty(field, BindingFlags.Public | BindingFlags.Instance);
                if (prop != null && prop.CanWrite) { SetMember(comp, field, value); continue; }
                Debug.LogWarning($"Southbound: {t.Name}.{field} not found, skipped.");
            }
            EditorUtility.SetDirty(comp);
            return comp;
        }

        /// <summary>The HDRP asset in use (Graphics settings or the current quality level), or null.</summary>
        public static Object PipelineAsset()
        {
            var rp = QualitySettings.renderPipeline ?? UnityEngine.Rendering.GraphicsSettings.defaultRenderPipeline;
            return rp != null && rp.GetType().Name.Contains("HDRenderPipelineAsset") ? rp : null;
        }

        /// <summary>Turns HDRP asset features on through its serialized settings (m_RenderPipelineSettings.*);
        /// unknown names are skipped with a note, so this works across HDRP versions.</summary>
        public static int SetPipelineFeatures(Object asset, params (string path, object value)[] settings)
        {
            if (asset == null) return 0;
            var so = new SerializedObject(asset);
            int done = 0;
            foreach (var (path, value) in settings)
            {
                var p = so.FindProperty("m_RenderPipelineSettings." + path);
                if (p == null) { Debug.Log($"Southbound: HDRP asset has no {path} here, skipped."); continue; }
                switch (value)
                {
                    case bool b when p.propertyType == SerializedPropertyType.Boolean: p.boolValue = b; done++; break;
                    case int i when p.propertyType == SerializedPropertyType.Integer || p.propertyType == SerializedPropertyType.Enum: p.intValue = i; done++; break;
                    case float f when p.propertyType == SerializedPropertyType.Float: p.floatValue = f; done++; break;
                    default: Debug.Log($"Southbound: HDRP asset {path} is a {p.propertyType}, not set."); break;
                }
            }
            so.ApplyModifiedPropertiesWithoutUndo();
            EditorUtility.SetDirty(asset);
            return done;
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
