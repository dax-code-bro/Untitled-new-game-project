// Calvera's street lights and porch lanterns come on at dusk and go off at dawn (DayNight.Night), each a
// moment apart like real photocells, and their glass glows (emission in nits) while they're on. Works on
// copies of the lamp materials, so the assets don't change.
using System.Collections.Generic;
using UnityEngine;

namespace Southbound
{
    public sealed class StreetLights : MonoBehaviour
    {
        [Tooltip("The lamp-glass materials (StreetBuilder fills this in).")]
        public Material[] glass;
        [Tooltip("How bright lit glass is (nits).")]
        public float glassNits = 4000f;
        [Tooltip("Signs lit from inside after dark (shop names, storefront signs, billboards), and how bright (nits).")]
        public Material[] signs;
        public float signNits = 70f;
        [Tooltip("DayNight.Night above which the lights are on.")]
        public float threshold = 0.3f;

        Light[] lights;
        float[] delay;
        Material[] copies;
        int signCount;
        bool on;
        float since;
        static readonly int IdEmissive = Shader.PropertyToID("_EmissiveColor"), IdLdr = Shader.PropertyToID("_EmissiveColorLDR");

        void Start()
        {
            lights = GetComponentsInChildren<Light>(true);
            delay = new float[lights.Length];
            for (int i = 0; i < delay.Length; i++) delay[i] = Random.Range(0f, 6f);
            // lamp glass and lit signs, as copies (the assets stay as they are)
            var src = new List<Material>();
            if (glass != null) src.AddRange(glass);
            if (signs != null) src.AddRange(signs);
            if (src.Count == 0) return;
            glass = src.ToArray();
            copies = new Material[glass.Length];
            for (int i = 0; i < glass.Length; i++) copies[i] = glass[i] != null ? new Material(glass[i]) : null;
            signCount = signs?.Length ?? 0;
            foreach (var r in GetComponentsInChildren<MeshRenderer>(true))
            {
                var mats = r.sharedMaterials; bool changed = false;
                for (int i = 0; i < mats.Length; i++)
                    for (int k = 0; k < glass.Length; k++)
                        if (mats[i] == glass[k] && copies[k] != null) { mats[i] = copies[k]; changed = true; }
                if (changed) r.sharedMaterials = mats;
            }
            Apply(DayNight.Night > threshold, true);
        }

        void Update()
        {
            bool want = DayNight.Night > threshold;
            if (want != on) { on = want; since = 0; }
            since += Time.deltaTime;
            Apply(on, false);
        }

        void Apply(bool lit, bool force)
        {
            // each light switches a few seconds apart from its neighbours
            for (int i = 0; i < lights.Length; i++)
            {
                bool s = force ? lit : lit ? since > delay[i] : since <= delay[i] * 0.3f ? lights[i].enabled : false;
                if (lights[i].enabled != s) lights[i].enabled = s;
            }
            if (copies == null) return;
            for (int i = 0; i < copies.Length; i++)
            {
                var m = copies[i];
                if (m == null) continue;
                var c = m.HasProperty(IdLdr) ? m.GetColor(IdLdr) : Color.white;
                bool sign = i >= copies.Length - signCount;
                m.SetColor(IdEmissive, lit ? c.linear * (sign ? signNits : glassNits) : Color.black);
            }
        }

        void OnDestroy() { if (copies != null) foreach (var m in copies) if (m != null) Destroy(m); }
    }
}
