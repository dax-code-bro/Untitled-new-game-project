// Calvera's weather in HDRP (Core/Weather: the web game's model). It drives:
//  - the sky: the volumetric cloud preset by cover (sparse .. stormy), thicker fog in rain, a dimmer sun
//  - wet streets: roads, road paint, sidewalks and buildings darken and turn glossy as they soak (copies of
//    their materials, so the assets don't change), walls less than the ground
//  - puddles: the HDRP decals WeatherBuilder put in the dips and gutters fade in as they fill
//  - rain: streaks falling round the camera
//  - storms: lightning flashes and thunder a few seconds behind (made in code)
// F8 cycles the weather by hand.
using System;
using System.Collections.Generic;
using System.Reflection;
using Southbound.Core;
using UnityEngine;

namespace Southbound
{
    public sealed class WeatherController : MonoBehaviour
    {
        [Tooltip("Static world roots whose materials get wet (StreetBuilder/CalveraBuilder fill this in).")]
        public Transform[] ground;
        [Tooltip("Roots whose surfaces are mostly walls: they get half as wet.")]
        public Transform[] walls;
        [Tooltip("The puddle decals (HDRP DecalProjector components).")]
        public Component[] puddles;
        [Tooltip("Rain streak material (HDRP/Unlit, additive).")]
        public Material rainMaterial;
        public int startWeather = 1;
        public uint seed = 2026;

        public Weather Model { get; private set; }
        public static float SunScale { get; private set; } = 1;

        readonly Dictionary<Material, (Material copy, Color baseColor, float smooth, float rmin, float rmax, bool mask)> wet = new Dictionary<Material, (Material, Color, float, float, float, bool)>();
        readonly List<(Material copy, float factor)> wetList = new List<(Material, float)>();
        float shownWet = -1, shownPuddles = -1;
        string shownPreset;
        double lastHour = double.NaN;
        ParticleSystem rain;
        Light lightning;
        AudioSource thunder;
        float thunderIn = -1;
        object volumeProfile;

        static readonly int IdBase = Shader.PropertyToID("_BaseColor"), IdSmooth = Shader.PropertyToID("_Smoothness"),
            IdRMin = Shader.PropertyToID("_SmoothnessRemapMin"), IdRMax = Shader.PropertyToID("_SmoothnessRemapMax"), IdMask = Shader.PropertyToID("_MaskMap"), IdEmissiveMap = Shader.PropertyToID("_EmissiveColorMap");

        void Start()
        {
            Model = new Weather(seed, startWeather);
            Model.Snap();
            Collect(ground, 1f);
            Collect(walls, 0.5f);
            MakeRain();
            var lgo = new GameObject("Lightning");
            lgo.transform.SetParent(transform, false);
            lightning = lgo.AddComponent<Light>();
            lightning.type = LightType.Directional; lightning.color = new Color(0.85f, 0.9f, 1f); lightning.shadows = LightShadows.None; lightning.enabled = false;
            thunder = gameObject.AddComponent<AudioSource>();
            thunder.spatialBlend = 0; thunder.playOnAwake = false;
            volumeProfile = FindProfile();
        }

        // ------------------------------------------------------------------ per frame
        void Update()
        {
            var game = SouthboundGame.Instance;
            double hour = game != null ? game.Profile.Hour : DayNight.Hour;
            double hours = double.IsNaN(lastHour) ? 0 : hour - lastHour;
            if (hours < 0) hours += 24;
            lastHour = hour;
            if (SbInput.WeatherDown) { Model.Set((Model.Kind + 1) % Weather.Order.Length); }
            Model.Update(Time.deltaTime, hours);

            SunScale = (float)(1 - Model.Dark * 0.85);
            ApplySky();
            ApplyWet();
            ApplyRain();
            ApplyLightning();
        }

        void ApplySky()
        {
            if (volumeProfile == null) return;
            string preset = Model.Cover < 0.45 ? "Sparse" : Model.Cover < 0.7 ? "Cloudy" : Model.Cover < 0.9 ? "Overcast" : "Stormy";
            if (preset != shownPreset)
            {
                var clouds = Component(volumeProfile, "VolumetricClouds");
                if (clouds != null)
                {
                    var p = clouds.GetType().GetProperty("cloudPreset", BindingFlags.Public | BindingFlags.Instance);
                    if (p != null && p.PropertyType.IsEnum) try { p.SetValue(clouds, Enum.Parse(p.PropertyType, preset)); } catch { /* an HDRP without that preset */ }
                }
                shownPreset = preset;
            }
            var fog = Component(volumeProfile, "Fog");
            if (fog != null) SetParam(fog, "meanFreePath", (float)(1600 / Model.Fog));
        }

        void ApplyWet()
        {
            if (Mathf.Abs((float)Model.Wet - shownWet) > 0.01f)
            {
                shownWet = (float)Model.Wet;
                foreach (var kv in wet)
                {
                    var (copy, bc, sm, rmin, rmax, mask) = kv.Value;
                    float w = shownWet * Factor(copy);
                    // wet asphalt and concrete go darker and glossy: the water fills the pores and the surface turns to a film
                    copy.SetColor(IdBase, new Color(bc.r * Mathf.Lerp(1, 0.62f, w), bc.g * Mathf.Lerp(1, 0.62f, w), bc.b * Mathf.Lerp(1, 0.64f, w), bc.a));
                    if (mask) { copy.SetFloat(IdRMin, Mathf.Lerp(rmin, 0.55f, w)); copy.SetFloat(IdRMax, Mathf.Lerp(rmax, 0.95f, w)); }
                    else copy.SetFloat(IdSmooth, Mathf.Lerp(sm, 0.9f, w));
                }
            }
            if (puddles != null && Mathf.Abs((float)Model.Puddles - shownPuddles) > 0.01f)
            {
                shownPuddles = (float)Model.Puddles;
                foreach (var p in puddles) if (p != null) SetMember(p, "fadeFactor", shownPuddles);
            }
        }

        float Factor(Material copy) { foreach (var (c, f) in wetList) if (c == copy) return f; return 1; }

        void ApplyRain()
        {
            if (rain == null) return;
            var cam = Camera.main;
            if (cam != null) rain.transform.position = cam.transform.position + Vector3.up * 14f;
            var em = rain.emission;
            em.rateOverTime = (float)(Model.Rain * 14000);
            if (Model.Rain > 0.01 && !rain.isPlaying) rain.Play();
            if (Model.Rain <= 0.01 && rain.isPlaying) rain.Stop();
        }

        void ApplyLightning()
        {
            if (Model.Thunder)
            {
                lightning.transform.rotation = Quaternion.Euler(UnityEngine.Random.Range(35f, 70f), UnityEngine.Random.Range(0f, 360f), 0);
                float distance = UnityEngine.Random.Range(0.4f, 5f);   // seconds until the thunder: ~340 m a second
                thunderIn = distance;
                thunder.clip = ThunderClip(distance);
            }
            lightning.enabled = Model.Flash > 0.01;
            lightning.intensity = (float)(Model.Flash * Model.Flash) * 25000f;
            if (thunderIn >= 0 && (thunderIn -= Time.deltaTime) < 0) { thunder.volume = Mathf.Clamp01(1.2f - thunderIn * 0.15f); thunder.Play(); thunderIn = -1; }
        }

        // ------------------------------------------------------------------ set-up
        void Collect(Transform[] roots, float factor)
        {
            if (roots == null) return;
            foreach (var root in roots)
            {
                if (root == null) continue;
                foreach (var r in root.GetComponentsInChildren<MeshRenderer>(true))
                {
                    var mats = r.sharedMaterials; bool changed = false;
                    for (int i = 0; i < mats.Length; i++)
                    {
                        var m = mats[i];
                        if (m == null || m.shader == null || m.shader.name != "HDRP/Lit") continue;
                        // glass is wet already, and lamp glass belongs to StreetLights (whichever Start runs first)
                        if (m.name.IndexOf("glass", StringComparison.OrdinalIgnoreCase) >= 0 || m.name.IndexOf("lamp", StringComparison.OrdinalIgnoreCase) >= 0) continue;
                        // anything that glows (lit signs, windows) is driven by its own component
                        if (m.HasProperty(IdEmissiveMap) && m.GetTexture(IdEmissiveMap) != null) continue;
                        if (!wet.TryGetValue(m, out var e))
                        {
                            var copy = new Material(m) { name = m.name + " (wet)" };
                            e = (copy, m.HasProperty(IdBase) ? m.GetColor(IdBase) : Color.white, m.HasProperty(IdSmooth) ? m.GetFloat(IdSmooth) : 0.5f,
                                m.HasProperty(IdRMin) ? m.GetFloat(IdRMin) : 0, m.HasProperty(IdRMax) ? m.GetFloat(IdRMax) : 1, m.HasProperty(IdMask) && m.GetTexture(IdMask) != null);
                            wet[m] = e; wetList.Add((copy, factor));
                        }
                        mats[i] = e.copy; changed = true;
                    }
                    if (changed) r.sharedMaterials = mats;
                }
            }
        }

        void MakeRain()
        {
            var go = new GameObject("Rain");
            go.transform.SetParent(transform, false);
            rain = go.AddComponent<ParticleSystem>();
            rain.Stop(true, ParticleSystemStopBehavior.StopEmittingAndClear);
            var main = rain.main;
            main.loop = true; main.startLifetime = 2.2f; main.startSpeed = 0; main.startSize = 0.012f;
            main.startColor = new Color(0.62f, 0.64f, 0.68f, 0.35f); main.maxParticles = 30000; main.simulationSpace = ParticleSystemSimulationSpace.World;
            var vel = rain.velocityOverLifetime; vel.enabled = true; vel.space = ParticleSystemSimulationSpace.World;
            vel.x = new ParticleSystem.MinMaxCurve(1.2f, 1.8f); vel.y = new ParticleSystem.MinMaxCurve(-12f, -10f); vel.z = new ParticleSystem.MinMaxCurve(0.6f, 1.0f);
            var shape = rain.shape; shape.shapeType = ParticleSystemShapeType.Box; shape.scale = new Vector3(44, 1, 44);
            var em = rain.emission; em.rateOverTime = 0;
            var r = go.GetComponent<ParticleSystemRenderer>();
            r.renderMode = ParticleSystemRenderMode.Stretch; r.velocityScale = 0.045f; r.lengthScale = 1f;
            if (rainMaterial != null) r.sharedMaterial = rainMaterial;
            r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off; r.receiveShadows = false;
        }

        /// <summary>A roll of thunder: a crack, then rumbling noise that dies away; farther strikes are softer and duller.</summary>
        static AudioClip ThunderClip(float distanceSeconds)
        {
            const int rate = 22050;
            int n = (int)(rate * (4 + distanceSeconds));
            var s = new float[n];
            var rnd = new System.Random((int)(distanceSeconds * 1000));
            double brown = 0, lp = 0, cut = Mathf.Lerp(0.15f, 0.03f, distanceSeconds / 5f);
            for (int i = 0; i < n; i++)
            {
                double t = i / (double)rate;
                brown = (brown + (rnd.NextDouble() * 2 - 1) * 0.08) * 0.995;
                lp += (brown - lp) * cut;
                double crack = distanceSeconds < 1.5 ? Math.Exp(-t * 18) * (rnd.NextDouble() * 2 - 1) * 0.6 : 0;
                double roll = (1 - Math.Exp(-t * 6)) * Math.Exp(-t / (1.2 + distanceSeconds * 0.4)) * (0.7 + 0.3 * Math.Sin(t * 3.1 + rnd.NextDouble() * 0.2));
                s[i] = (float)Math.Max(-1, Math.Min(1, lp * 6 * roll + crack));
            }
            var clip = AudioClip.Create("thunder", n, 1, rate, false);
            clip.SetData(s, 0);
            return clip;
        }

        // ------------------------------------------------------------------ HDRP by reflection (runtime)
        static object FindProfile()
        {
            var volType = Type.GetType("UnityEngine.Rendering.Volume, Unity.RenderPipelines.Core.Runtime");
            if (volType == null) return null;
            foreach (var v in FindObjectsByType(volType, FindObjectsSortMode.None))
            {
                var isGlobal = volType.GetProperty("isGlobal")?.GetValue(v) ?? volType.GetField("isGlobal")?.GetValue(v);
                if (isGlobal is bool g && !g) continue;
                // `profile` hands back this volume's own copy (the asset stays as it is)
                var p = volType.GetProperty("profile")?.GetValue(v);
                if (p != null) return p;
            }
            return null;
        }

        static object Component(object profile, string typeName)
        {
            var list = profile.GetType().GetField("components")?.GetValue(profile) as System.Collections.IEnumerable;
            if (list == null) return null;
            foreach (var c in list) if (c != null && c.GetType().Name == typeName) return c;
            return null;
        }

        static void SetParam(object comp, string field, object value)
        {
            var f = comp.GetType().GetField(field, BindingFlags.Public | BindingFlags.Instance);
            var param = f?.GetValue(comp);
            if (param == null) return;
            param.GetType().GetProperty("overrideState")?.SetValue(param, true);
            try { param.GetType().GetProperty("value")?.SetValue(param, value); } catch { /* type mismatch on an older HDRP */ }
        }

        static void SetMember(object target, string name, object value)
        {
            var t = target.GetType();
            var p = t.GetProperty(name, BindingFlags.Public | BindingFlags.Instance);
            if (p != null && p.CanWrite) { try { p.SetValue(target, value); } catch { } return; }
            var f = t.GetField(name, BindingFlags.Public | BindingFlags.Instance);
            if (f != null) try { f.SetValue(target, value); } catch { }
        }

        void OnDestroy() { foreach (var kv in wet) if (kv.Value.copy != null) Destroy(kv.Value.copy); }
    }
}
