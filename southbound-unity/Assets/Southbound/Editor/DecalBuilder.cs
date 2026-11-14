// Puts Calvera's wear and tear into the scene as HDRP decals (Core/Decals: where and what): oil in the
// lanes, crack networks, skid marks and manhole covers on the roads, grime at the foot of every wall.
// The textures are generated once into Art/Generated/Decals; the manhole is the photo-scanned
// ambientCG cover. Decals need the HDRP asset's decal support (PhotoLook switches it on).
using System.Collections.Generic;
using System.IO;
using Southbound.Core;
using UnityEditor;
using UnityEngine;

namespace Southbound.EditorTools
{
    public static class DecalBuilder
    {
        const string Dir = Paths.Generated + "/Decals";

        public static void Build(CalveraWorld w)
        {
            var projType = Hdrp.FindType("UnityEngine.Rendering.HighDefinition.DecalProjector");
            var shader = Shader.Find("HDRP/Decal");
            if (projType == null || shader == null) { Debug.Log("Southbound: no HDRP decals here, street and wall wear skipped."); return; }
            Paths.Ensure(Dir);
            var mats = new Dictionary<DecalKind, Material>
            {
                [DecalKind.Oil] = Generated(DecalKind.Oil, 256, shader, smoothness: true),
                [DecalKind.Cracks] = Generated(DecalKind.Cracks, 512, shader, smoothness: false),
                [DecalKind.Skid] = Generated(DecalKind.Skid, 256, shader, smoothness: true),
                [DecalKind.Grime] = Generated(DecalKind.Grime, 512, shader, smoothness: true),
                [DecalKind.Manhole] = Manhole(shader),
            };
            var root = new GameObject("Decals (street and wall wear)").transform;
            var parents = new Dictionary<DecalKind, Transform>();
            foreach (var k in mats.Keys) { var p = new GameObject(k.ToString()).transform; p.SetParent(root, false); parents[k] = p; }
            int n = 0;
            foreach (var s in Decals.Place(w))
            {
                var mat = mats[s.Kind];
                if (mat == null) continue;
                var go = new GameObject(s.Kind.ToString().ToLowerInvariant());
                go.transform.SetParent(parents[s.Kind], false);
                Vector3 size;
                if (s.Kind == DecalKind.Grime)
                {
                    // projected into the wall, from the ground up; the angle fade keeps it off the pavement
                    // the wall's outward normal (web nx, nz) is (-nx, nz) in Unity; the projector looks the other way, into the wall
                    var into = new Vector3((float)s.Nx, 0, (float)-s.Nz);
                    go.transform.SetPositionAndRotation(new Vector3((float)-s.X, (float)(s.Y + s.Length / 2), (float)s.Z), Quaternion.LookRotation(into, Vector3.up));
                    size = new Vector3((float)s.Width + 0.1f, (float)s.Length, 0.8f);
                }
                else
                {
                    // projected straight down onto the road surface; its length runs along the road
                    double y = w.HeightAt(s.X, s.Z) + 0.06;
                    var along = new Vector3(-(float)System.Math.Sin(s.Heading), 0, (float)System.Math.Cos(s.Heading));
                    go.transform.SetPositionAndRotation(new Vector3((float)-s.X, (float)y, (float)s.Z), Quaternion.LookRotation(Vector3.down, along));
                    size = new Vector3((float)s.Width, (float)s.Length, 0.4f);
                }
                var p = go.AddComponent(projType);
                Hdrp.SetMember(p, "material", mat);
                Hdrp.SetMember(p, "size", size);
                Hdrp.SetMember(p, "pivot", Vector3.zero);
                Hdrp.SetMember(p, "drawDistance", s.Kind == DecalKind.Grime ? 160f : 110f);
                Hdrp.SetMember(p, "fadeScale", 0.85f);
                Hdrp.SetMember(p, "startAngleFade", 55f);
                Hdrp.SetMember(p, "endAngleFade", 75f);
                go.isStatic = true;
                n++;
            }
            Debug.Log($"Southbound: {n} decals (oil, cracks, skids, manholes, wall grime).");
        }

        /// <summary>A generated decal: base colour with alpha, and a mask (blue = opacity, alpha = smoothness).</summary>
        static Material Generated(DecalKind kind, int size, Shader shader, bool smoothness)
        {
            string name = kind.ToString();
            string colorPath = $"{Dir}/Decal_{name}_Color.png", maskPath = $"{Dir}/Decal_{name}_Mask.png", matPath = $"{Dir}/Decal_{name}.mat";
            if (!File.Exists(Paths.Abs(colorPath)) || !File.Exists(Paths.Abs(maskPath)))
            {
                var img = Decals.Texture(kind, size, 1987 + (int)kind);
                var col = new Color32[size * size]; var mask = new Color32[size * size];
                for (int i = 0; i < col.Length; i++)
                {
                    var c = new Color(img.Rgba[i * 4], img.Rgba[i * 4 + 1], img.Rgba[i * 4 + 2]).gamma;
                    byte a = (byte)(img.Rgba[i * 4 + 3] * 255);
                    col[i] = new Color32((byte)(c.r * 255), (byte)(c.g * 255), (byte)(c.b * 255), a);
                    mask[i] = new Color32(0, 255, a, (byte)(img.Smoothness[i] * 255));
                }
                Surfaces.Write(col, size, size, Paths.Abs(colorPath));
                Surfaces.Write(mask, size, size, Paths.Abs(maskPath));
                AssetDatabase.ImportAsset(colorPath); AssetDatabase.ImportAsset(maskPath);
                SetImport(colorPath, srgb: true); SetImport(maskPath, srgb: false);
            }
            var m = AssetDatabase.LoadAssetAtPath<Material>(matPath);
            if (m == null) { m = new Material(shader) { name = "Decal " + name }; AssetDatabase.CreateAsset(m, matPath); }
            m.SetTexture("_BaseColorMap", AssetDatabase.LoadAssetAtPath<Texture2D>(colorPath));
            m.SetTexture("_MaskMap", AssetDatabase.LoadAssetAtPath<Texture2D>(maskPath));
            m.SetFloat("_DecalBlend", 1f);
            m.SetFloat("_AffectAlbedo", 1f);
            m.SetFloat("_AffectNormal", 0f);
            m.SetFloat("_AffectMetal", 0f);
            m.SetFloat("_AffectAO", 0f);
            m.SetFloat("_AffectSmoothness", smoothness ? 1f : 0f);
            m.SetFloat("_DrawOrder", kind == DecalKind.Grime ? 0 : kind == DecalKind.Cracks ? 1 : 2);
            Hdrp.ResetKeywords(m);
            EditorUtility.SetDirty(m);
            return m;
        }

        /// <summary>The photo-scanned manhole cover (ambientCG ManholeCover011) as an opaque decal with its relief.</summary>
        static Material Manhole(Shader shader)
        {
            var maps = Surfaces.Find("ManholeCover011");
            if (maps == null) return null;
            string matPath = $"{Dir}/Decal_Manhole.mat";
            var m = AssetDatabase.LoadAssetAtPath<Material>(matPath);
            if (m == null) { m = new Material(shader) { name = "Decal manhole" }; AssetDatabase.CreateAsset(m, matPath); }
            m.SetTexture("_BaseColorMap", maps.Color);
            m.SetTexture("_NormalMap", maps.Normal);
            m.SetTexture("_MaskMap", maps.Mask);
            m.SetFloat("_DecalBlend", 1f);
            m.SetFloat("_AffectAlbedo", 1f);
            m.SetFloat("_AffectNormal", 1f);
            m.SetFloat("_AffectMetal", 1f);
            m.SetFloat("_AffectSmoothness", 1f);
            m.SetFloat("_DrawOrder", 3);
            Hdrp.ResetKeywords(m);
            EditorUtility.SetDirty(m);
            return m;
        }

        static void SetImport(string path, bool srgb)
        {
            if (!(AssetImporter.GetAtPath(path) is TextureImporter imp)) return;
            imp.sRGBTexture = srgb;
            imp.alphaIsTransparency = srgb;
            imp.wrapMode = TextureWrapMode.Clamp;
            imp.mipmapEnabled = true;
            imp.SaveAndReimport();
        }
    }
}
