// How Calvera's water looks in HDRP's water system: the Gulf a warm, green-blue shallow sea with a
// steady onshore breeze, foam and caustics, and the inland lakes calm and tea-coloured (tannin from the
// cypress and pine country). Set by name so this compiles without HDRP.
using System.Collections;
using UnityEngine;

namespace Southbound.EditorTools
{
    public static class WaterLook
    {
        static void Set(Component ws, params (string field, object value)[] values)
        {
            foreach (var (f, v) in values)
                if (!Hdrp.SetMember(ws, f, v)) Debug.Log($"Southbound: water setting {f} not in this HDRP, skipped.");
        }

        public static void Ocean(Component ws)
        {
            Set(ws, ("surfaceType", "OceanSeaLake"), ("geometryType", "Infinite"),
                ("repetitionSize", 500f), ("largeWindSpeed", 22f), ("largeChaos", 0.85f), ("largeOrientationValue", 120f),
                ("ripples", true), ("ripplesWindSpeed", 9f), ("ripplesChaos", 0.8f),
                ("refractionColor", new Color(0.06f, 0.36f, 0.38f)), ("scatteringColor", new Color(0.02f, 0.22f, 0.19f)),
                ("absorptionDistance", 7f), ("ambientScattering", 0.15f), ("heightScattering", 0.25f), ("displacementScattering", 0.35f),
                ("startSmoothness", 0.96f), ("endSmoothness", 0.88f),
                ("foam", true), ("simulationFoamAmount", 0.25f), ("foamSmoothness", 0.3f),
                ("caustics", true), ("causticsIntensity", 0.45f),
                ("underWater", true), ("volumeDepth", 60f),
                ("tessellation", true), ("maxTessellationFactor", 3f));
        }

        public static void Lake(Component ws, MeshRenderer footprint)
        {
            Set(ws, ("surfaceType", "OceanSeaLake"), ("geometryType", "Custom"),
                ("repetitionSize", 120f), ("largeWindSpeed", 6f), ("largeChaos", 0.6f),
                ("ripples", true), ("ripplesWindSpeed", 6f),
                ("refractionColor", new Color(0.12f, 0.2f, 0.11f)), ("scatteringColor", new Color(0.05f, 0.1f, 0.05f)),
                ("absorptionDistance", 2.2f), ("startSmoothness", 0.95f), ("endSmoothness", 0.9f),
                ("foam", false), ("caustics", true), ("causticsIntensity", 0.3f),
                ("underWater", true), ("volumeDepth", 12f));
            var list = ws.GetType().GetField("meshRenderers")?.GetValue(ws) as IList;
            if (list != null) list.Add(footprint);
            else Debug.LogWarning("Southbound: WaterSurface.meshRenderers not found; the lake uses HDRP's default quad.");
        }
    }
}
