// Reflection probes down Calvera's streets (Core/ReflectionSpots): a box-projected HDRP probe filling each
// street canyon in town, so window glass, wet asphalt and puddles reflect the street around them instead of
// the open sky where screen-space reflections run out. They're baked:
//   Southbound > Look > Bake reflections   (or Lighting > Generate Lighting)
using Southbound.Core;
using UnityEditor;
using UnityEngine;

namespace Southbound.EditorTools
{
    public static class ReflectionProbeBuilder
    {
        public static void Build(CalveraWorld w)
        {
            var hdType = Hdrp.FindType("UnityEngine.Rendering.HighDefinition.HDAdditionalReflectionData");
            var root = new GameObject("Reflection probes (street canyons)").transform;
            int n = 0;
            foreach (var s in ReflectionSpots.Place(w))
            {
                var go = new GameObject(s.Junction ? "junction probe" : "street probe");
                go.transform.SetParent(root, false);
                go.transform.SetPositionAndRotation(new Vector3((float)-s.X, (float)s.Y, (float)s.Z), Quaternion.Euler(0, (float)(-s.Heading * 180 / System.Math.PI), 0));
                var size = new Vector3((float)s.Across, (float)s.Height, (float)s.Along);
                var p = go.AddComponent<ReflectionProbe>();
                p.mode = UnityEngine.Rendering.ReflectionProbeMode.Baked;
                p.boxProjection = true;
                p.size = size;
                // the box sits on the road: from just under it to the rooftops
                p.center = new Vector3(0, (float)(s.Height / 2 - 2.8), 0);
                p.blendDistance = 4;
                p.resolution = 256;
                if (hdType != null)
                {
                    var hd = go.GetComponent(hdType) ?? go.AddComponent(hdType);
                    Hdrp.SetMember(hd, "mode", "Baked");
                    var iv = hdType.GetProperty("influenceVolume")?.GetValue(hd);
                    if (iv != null)
                    {
                        Hdrp.SetMember(iv, "shape", "Box");
                        Hdrp.SetMember(iv, "boxSize", size);
                        Hdrp.SetMember(iv, "offset", p.center);
                        Hdrp.SetMember(iv, "boxBlendDistancePositive", new Vector3(4, 2, 4));
                        Hdrp.SetMember(iv, "boxBlendDistanceNegative", new Vector3(4, 0.5f, 4));
                    }
                }
                go.isStatic = true;
                n++;
            }
            Debug.Log($"Southbound: {n} reflection probes down the streets. Bake them with Southbound > Look > Bake reflections.");
        }

        [MenuItem("Southbound/Look/Bake reflections", priority = 46)]
        public static void Bake()
        {
            // HDRP bakes its probes with the rest of the lighting
            if (!Lightmapping.BakeAsync()) Debug.LogWarning("Southbound: couldn't start the bake (is a bake already running?).");
            else Debug.Log("Southbound: baking the street reflections (Lighting window shows progress).");
        }
    }
}
