// Bullet-hole decals, drawn procedurally (no texture files to license): torn
// drywall paper around a dark hole, the blown-out gypsum crater on the exit
// side, splintered wood, chipped brick and concrete, bright dented metal, and
// a spider-web crack in glass.
using System.IO;
using Southbound.Core;
using UnityEditor;
using UnityEngine;

namespace Southbound.EditorTools
{
    public static class HoleMaterials
    {
        const int N = 128;

        public static Material[] All()
        {
            var kinds = (HoleKind[])System.Enum.GetValues(typeof(HoleKind));
            var mats = new Material[kinds.Length];
            foreach (var k in kinds) mats[(int)k] = Make("hole_" + k.ToString().ToLowerInvariant(), Draw(k));
            return mats;
        }

        public static Material Blood() => Make("hole_blood", Splat(new Color(0.28f, 0.02f, 0.02f)));

        static float Noise(float x, float y, int seed)
        {
            // value noise, good enough for ragged edges
            int xi = Mathf.FloorToInt(x), yi = Mathf.FloorToInt(y);
            float fx = x - xi, fy = y - yi;
            float H(int a, int b) { uint h = (uint)(a * 374761393 + b * 668265263 + seed * 2147483647); h = (h ^ (h >> 13)) * 1274126177; return (h & 0xffff) / 65535f; }
            float sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
            return Mathf.Lerp(Mathf.Lerp(H(xi, yi), H(xi + 1, yi), sx), Mathf.Lerp(H(xi, yi + 1), H(xi + 1, yi + 1), sx), sy);
        }

        static Color32[] Draw(HoleKind k)
        {
            var px = new Color32[N * N];
            for (int y = 0; y < N; y++)
                for (int x = 0; x < N; x++)
                {
                    float u = (x + 0.5f) / N * 2 - 1, v = (y + 0.5f) / N * 2 - 1;
                    float r = Mathf.Sqrt(u * u + v * v), ang = Mathf.Atan2(v, u);
                    float rag = Noise(Mathf.Cos(ang) * 3 + 5, Mathf.Sin(ang) * 3 + 5, (int)k) * 0.35f + Noise(u * 9, v * 9, 7 + (int)k) * 0.15f;
                    Color c = Color.clear;
                    switch (k)
                    {
                        case HoleKind.Drywall:
                            if (r < 0.22f + rag * 0.2f) c = new Color(0.05f, 0.05f, 0.05f, 1);
                            else if (r < 0.5f + rag) c = new Color(0.86f, 0.84f, 0.8f, 1) * (0.8f + 0.2f * Noise(u * 20, v * 20, 3));
                            break;
                        case HoleKind.DrywallExit:
                            if (r < 0.3f + rag * 0.3f) c = new Color(0.06f, 0.06f, 0.06f, 1);
                            else if (r < 0.85f + rag * 0.4f) { float t = Noise(u * 14, v * 14, 9); c = Color.Lerp(new Color(0.93f, 0.91f, 0.86f), new Color(0.7f, 0.68f, 0.63f), t); c.a = 1; }
                            break;
                        case HoleKind.Wood:
                        case HoleKind.Frame:
                            if (r < 0.2f + rag * 0.15f) c = new Color(0.08f, 0.05f, 0.03f, 1);
                            else if (r < 0.45f + rag * 0.5f * (0.5f + 0.5f * Mathf.Abs(Mathf.Sin(ang * 3)))) c = new Color(0.62f, 0.48f, 0.32f, 1) * (0.75f + 0.25f * Noise(u * 30, v * 4, 2));
                            break;
                        case HoleKind.Brick:
                            if (r < 0.2f + rag * 0.15f) c = new Color(0.12f, 0.06f, 0.04f, 1);
                            else if (r < 0.7f + rag * 0.4f) c = new Color(0.7f, 0.42f, 0.32f, 1) * (0.8f + 0.2f * Noise(u * 16, v * 16, 4));
                            break;
                        case HoleKind.Concrete:
                            if (r < 0.2f + rag * 0.15f) c = new Color(0.1f, 0.1f, 0.1f, 1);
                            else if (r < 0.7f + rag * 0.4f) c = new Color(0.72f, 0.71f, 0.68f, 1) * (0.8f + 0.2f * Noise(u * 16, v * 16, 5));
                            break;
                        case HoleKind.Metal:
                            if (r < 0.28f) c = new Color(0.04f, 0.04f, 0.045f, 1);
                            else if (r < 0.48f + rag * 0.15f) c = new Color(0.78f, 0.78f, 0.8f, 1);
                            break;
                        case HoleKind.Glass:
                            {
                                float crack = Mathf.Abs(Mathf.Sin(ang * 7 + Noise(r * 6, 0, 1) * 2)) < 0.06f ? 1 : 0;
                                float ring = Mathf.Abs(Mathf.Sin(r * 18 + rag * 6)) < 0.08f && r < 0.8f ? 1 : 0;
                                if (r < 0.08f) c = new Color(0.2f, 0.2f, 0.22f, 1);
                                else if (r < 0.95f && (crack > 0 || ring > 0)) c = new Color(0.92f, 0.95f, 0.97f, 1);
                                break;
                            }
                    }
                    px[y * N + x] = c;
                }
            return px;
        }

        static Color32[] Splat(Color col)
        {
            var px = new Color32[N * N];
            for (int y = 0; y < N; y++)
                for (int x = 0; x < N; x++)
                {
                    float u = (x + 0.5f) / N * 2 - 1, v = (y + 0.5f) / N * 2 - 1;
                    float r = Mathf.Sqrt(u * u + v * v), ang = Mathf.Atan2(v, u);
                    float edge = 0.45f + Noise(Mathf.Cos(ang) * 4 + 9, Mathf.Sin(ang) * 4 + 9, 11) * 0.4f;
                    bool drop = Noise(u * 10, v * 10, 13) > 0.8f && r < 0.95f;
                    px[y * N + x] = r < edge || drop ? (Color32)new Color(col.r, col.g, col.b, 1) : new Color32(0, 0, 0, 0);
                }
            return px;
        }

        static Material Make(string name, Color32[] px)
        {
            Paths.Ensure(Paths.Generated);
            string texPath = $"{Paths.Generated}/{name}.png";
            Surfaces.Write(px, N, N, Paths.Abs(texPath));
            AssetDatabase.ImportAsset(texPath);
            var tex = AssetDatabase.LoadAssetAtPath<Texture2D>(texPath);
            Paths.Ensure(Paths.Materials + "/Holes");
            string path = $"{Paths.Materials}/Holes/{name}.mat";
            var m = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (m == null) { m = Hdrp.Lit(); m.name = name; AssetDatabase.CreateAsset(m, path); }
            if (Hdrp.IsHdrpShader(m))
            {
                m.SetTexture("_BaseColorMap", tex);
                m.SetColor("_BaseColor", Color.white);
                m.SetFloat("_AlphaCutoffEnable", 1);
                m.SetFloat("_AlphaCutoff", 0.5f);
                m.SetFloat("_Smoothness", name.Contains("metal") || name.Contains("glass") || name.Contains("blood") ? 0.8f : 0.15f);
                m.SetFloat("_ReceivesSSR", 0);
                Hdrp.ResetKeywords(m);
            }
            else
            {
                m.mainTexture = tex;
                m.SetFloat("_Mode", 1); m.SetFloat("_Cutoff", 0.5f); m.EnableKeyword("_ALPHATEST_ON");
                m.renderQueue = (int)UnityEngine.Rendering.RenderQueue.AlphaTest;
            }
            m.enableInstancing = true;
            EditorUtility.SetDirty(m);
            return m;
        }
    }
}
