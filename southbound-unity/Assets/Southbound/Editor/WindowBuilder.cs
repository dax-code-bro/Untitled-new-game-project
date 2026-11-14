// Glazes Calvera (Core/BuildingWindows: the web game's window grid, pane for pane): a sheet of glass on
// every window and shopfront bay, showing a generated room or shop interior, with a frame and glazing
// bars that stand proud of it so the glass reads as set back. The glass is HDRP/Lit, smooth and dark, so
// it takes its reflections from the sky and the street (SSR, probes) with the Fresnel falloff of real
// glass; its emission is the night picture in nits, so the daylight exposure hides it and the rooms glow
// once the sun is down. NightWindows (on the root) puts out the evening lights late at night.
// Pieces are merged per 256 m square, a mesh for the glass and one for the frames.
using System.Collections.Generic;
using System.IO;
using Southbound.Core;
using UnityEditor;
using UnityEngine;
using UnityEngine.Rendering;

namespace Southbound.EditorTools
{
    public static class WindowBuilder
    {
        const string Dir = Paths.Generated + "/Windows";
        const string MeshDir = Paths.Scenes + "/Calvera_Meshes";
        const double Cell = 256;
        const float GlassOut = 0.012f;    // glass just off the wall
        const int RoomCell = 256, ShopW = 512, ShopH = 256, Atlas = 2048;

        // glass sub-meshes: rooms (lit all night or never), rooms lit in the evening, shops, shops closing in the evening
        const int GRooms = 0, GRoomsEve = 1, GShops = 2, GShopsEve = 3;
        // frame sub-meshes
        const int FWhite = 0, FBronze = 1, FSteel = 2;

        sealed class Chunk
        {
            public readonly Geo Glass = new Geo(4), Frame = new Geo(3);
        }

        sealed class Geo
        {
            public readonly List<Vector3> V = new List<Vector3>(), N = new List<Vector3>();
            public readonly List<Vector2> Uv = new List<Vector2>();
            public readonly List<int>[] Sub;
            public Geo(int subs) { Sub = new List<int>[subs]; for (int i = 0; i < subs; i++) Sub[i] = new List<int>(); }

            public void Quad(Vector3 a, Vector3 b, Vector3 c, Vector3 d, Vector3 n, Vector2 ua, Vector2 ub, Vector2 uc, Vector2 ud, int sub)
            {
                int o = V.Count;
                V.Add(a); V.Add(b); V.Add(c); V.Add(d);
                N.Add(n); N.Add(n); N.Add(n); N.Add(n);
                Uv.Add(ua); Uv.Add(ub); Uv.Add(uc); Uv.Add(ud);
                bool flip = Vector3.Dot(Vector3.Cross(b - a, c - a), n) < 0;
                Sub[sub].AddRange(flip ? new[] { o, o + 2, o + 1, o, o + 3, o + 2 } : new[] { o, o + 1, o + 2, o, o + 2, o + 3 });
            }

            /// <summary>A bar standing off the wall: centre, the wall's right/up/out axes, its size along each; no back face.</summary>
            public void Bar(Vector3 c, Vector3 right, Vector3 up, Vector3 outward, float sx, float sy, float sz, int sub)
            {
                Vector3 X = right * (sx / 2), Y = up * (sy / 2), Z = outward * (sz / 2);
                Vector2 z0 = Vector2.zero, z1 = new Vector2(1, 0), z2 = new Vector2(1, 1), z3 = new Vector2(0, 1);
                Quad(c - X - Y + Z, c + X - Y + Z, c + X + Y + Z, c - X + Y + Z, outward, z0, z1, z2, z3, sub);   // front
                Quad(c - X + Y - Z, c + X + Y - Z, c + X + Y + Z, c - X + Y + Z, up, z0, z1, z2, z3, sub);        // top
                Quad(c - X - Y - Z, c + X - Y - Z, c + X - Y + Z, c - X - Y + Z, -up, z0, z1, z2, z3, sub);       // bottom
                Quad(c + X - Y - Z, c + X + Y - Z, c + X + Y + Z, c + X - Y + Z, right, z0, z1, z2, z3, sub);     // right end
                Quad(c - X - Y - Z, c - X + Y - Z, c - X + Y + Z, c - X - Y + Z, -right, z0, z1, z2, z3, sub);    // left end
            }
        }

        public static void Build(CalveraWorld w)
        {
            var panes = BuildingWindows.Place(w);
            if (panes.Count == 0) return;
            Paths.Ensure(Dir); Paths.Ensure(MeshDir);
            var roomTex = Atlases(false); var shopTex = Atlases(true);
            var glass = new[]
            {
                Glass("Window glass", roomTex, 30f), Glass("Window glass (evening)", roomTex, 30f),
                Glass("Shop glass", shopTex, 70f), Glass("Shop glass (evening)", shopTex, 70f),
            };
            var frames = new[]
            {
                Frame("Window frame white", new Color(0.86f, 0.85f, 0.81f), 0.55f, 0f),
                Frame("Window frame bronze", new Color(0.11f, 0.09f, 0.07f), 0.6f, 0.2f),
                Frame("Window frame steel", new Color(0.36f, 0.38f, 0.39f), 0.5f, 0.7f),
            };

            var chunks = new Dictionary<(int, int), Chunk>();
            foreach (var p in panes)
            {
                var (cx, _, cz) = p.At(0, 0, 0);
                var key = ((int)System.Math.Floor(cx / Cell), (int)System.Math.Floor(cz / Cell));
                if (!chunks.TryGetValue(key, out var ch)) chunks[key] = ch = new Chunk();
                Glaze(ch, p, w.Buildings[p.Building]);
            }

            var root = new GameObject("Windows (glass, frames, rooms)").transform;
            int n = 0;
            foreach (var kv in chunks)
            {
                string tag = $"{kv.Key.Item1}_{kv.Key.Item2}";
                Emit(kv.Value.Glass, "WindowGlass_" + tag, glass, root, shadows: false);
                Emit(kv.Value.Frame, "WindowFrames_" + tag, frames, root, shadows: true);
                n++;
            }
            var nw = root.gameObject.AddComponent<NightWindows>();
            nw.eveningRooms = glass[GRoomsEve];
            nw.eveningShops = glass[GShopsEve];
            Debug.Log($"Southbound: {panes.Count} windows and shopfront bays glazed in {n} squares.");
        }

        static void Glaze(Chunk ch, Pane p, CalveraWorld.Building b)
        {
            // the wall's axes in Unity space: out of the wall, up, and to the right as seen from outside
            var (nx, nz) = CalveraWorld.ToUnity(p.Nx, p.Nz);
            var outward = new Vector3((float)nx, 0, (float)nz);
            var right = Vector3.Cross(Vector3.up, -outward).normalized;
            var (wx, wy, wz) = p.At(0, (p.Y0 + p.Y1) / 2, 0);
            var (ux, uz) = CalveraWorld.ToUnity(wx, wz);
            var centre = new Vector3((float)ux, (float)wy, (float)uz);
            float hw = (float)p.Width / 2, hh = (float)(p.Y1 - p.Y0) / 2;

            // the glass, showing its cell of the atlas (inset a few texels so mipmaps don't bleed into the next room)
            bool shop = p.Kind == PaneKind.Shop;
            int cols = shop ? BuildingWindows.ShopCols : BuildingWindows.RoomCols;
            float cw = 1f / cols, chh = 1f / (shop ? BuildingWindows.ShopRows : BuildingWindows.RoomRows);
            int col = p.Cell % cols, row = p.Cell / cols;
            float pad = 3f / Atlas;
            // row 0 of the atlas is drawn at the top of the picture (v = 1 - ...)
            float u0 = col * cw + pad, u1 = (col + 1) * cw - pad, v1 = 1 - row * chh - pad, v0 = 1 - (row + 1) * chh + pad;
            var g = centre + outward * GlassOut;
            int sub = shop ? (p.Lit == 1 ? GShopsEve : GShops) : (p.Lit == 1 ? GRoomsEve : GRooms);
            ch.Glass.Quad(g - right * hw - Vector3.up * hh, g + right * hw - Vector3.up * hh, g + right * hw + Vector3.up * hh, g - right * hw + Vector3.up * hh,
                outward, new Vector2(u0, v0), new Vector2(u1, v0), new Vector2(u1, v1), new Vector2(u0, v1), sub);
            if (shop) return; // the shopfront's mullions and transoms come from the web game's architecture

            // the frame: bars round the edge, proud of the glass; glazing bars across it
            int fm = p.Style == 3 ? FSteel : p.Style == 2 && Hash(p.Building) < 0.5 ? FBronze : FWhite;
            float bw = p.Style == 4 || p.Style == 5 ? 0.045f : 0.065f, depth = 0.055f;
            var c = centre + outward * (depth / 2);
            ch.Frame.Bar(c + Vector3.up * (hh - bw / 2), right, Vector3.up, outward, hw * 2, bw, depth, fm);
            ch.Frame.Bar(c - Vector3.up * (hh - bw / 2), right, Vector3.up, outward, hw * 2, bw, depth, fm);
            ch.Frame.Bar(c - right * (hw - bw / 2), right, Vector3.up, outward, bw, hh * 2 - bw * 2, depth, fm);
            ch.Frame.Bar(c + right * (hw - bw / 2), right, Vector3.up, outward, bw, hh * 2 - bw * 2, depth, fm);
            float inner = 0.035f, innerDepth = 0.04f;
            var ci = centre + outward * (innerDepth / 2);
            if (p.Mullion) ch.Frame.Bar(ci, right, Vector3.up, outward, inner, hh * 2 - bw * 2, innerDepth, fm);
            if (p.Style == 3)  // industrial: a steel grid
                for (int k = 1; k < 4; k++) ch.Frame.Bar(ci + right * (-hw + hw * 2 * k / 4f), right, Vector3.up, outward, inner, hh * 2 - bw * 2, innerDepth, fm);
            if (p.RailAt > 0)
            {
                float y = -hh + (float)p.RailAt * hh * 2;
                ch.Frame.Bar(ci + Vector3.up * y, right, Vector3.up, outward, hw * 2 - bw * 2, p.Style == 4 || p.Style == 5 ? 0.05f : inner, innerDepth, fm);
            }
        }

        static float Hash(int i) { unchecked { uint h = (uint)i * 2654435761u; h ^= h >> 16; return (h & 0xffff) / 65536f; } }

        static void Emit(Geo g, string name, Material[] mats, Transform root, bool shadows)
        {
            if (g.V.Count == 0) return;
            var m = new Mesh { name = name, indexFormat = IndexFormat.UInt32 };
            m.SetVertices(g.V); m.SetNormals(g.N); m.SetUVs(0, g.Uv);
            // only the sub-meshes that have something in them, with their materials
            var used = new List<Material>(); int s = 0;
            for (int i = 0; i < g.Sub.Length; i++) if (g.Sub[i].Count > 0) s++;
            m.subMeshCount = s; s = 0;
            for (int i = 0; i < g.Sub.Length; i++) if (g.Sub[i].Count > 0) { m.SetTriangles(g.Sub[i], s++); used.Add(mats[i]); }
            m.RecalculateTangents(); m.RecalculateBounds();
            string path = $"{MeshDir}/{name}.asset";
            AssetDatabase.DeleteAsset(path);
            AssetDatabase.CreateAsset(m, path);
            var go = new GameObject(name);
            go.transform.SetParent(root, false);
            go.AddComponent<MeshFilter>().sharedMesh = m;
            var r = go.AddComponent<MeshRenderer>();
            r.sharedMaterials = used.ToArray();
            r.shadowCastingMode = shadows ? ShadowCastingMode.On : ShadowCastingMode.Off;
            GameObjectUtility.SetStaticEditorFlags(go, StaticEditorFlags.BatchingStatic | StaticEditorFlags.OccludeeStatic);
        }

        // ------------------------------------------------------------------ the room and shop pictures
        /// <summary>The day (base colour) and night (emission) atlases: 8 x 8 rooms or 4 x 8 shops, cell 0 at the top left.</summary>
        static (Texture2D day, Texture2D night) Atlases(bool shop)
        {
            string name = shop ? "Shops" : "Rooms";
            string dayPath = $"{Dir}/{name}_Day.png", nightPath = $"{Dir}/{name}_Night.png";
            if (!File.Exists(Paths.Abs(dayPath)) || !File.Exists(Paths.Abs(nightPath)))
            {
                int cols = shop ? BuildingWindows.ShopCols : BuildingWindows.RoomCols, rows = shop ? BuildingWindows.ShopRows : BuildingWindows.RoomRows;
                int cw = shop ? ShopW : RoomCell, chh = shop ? ShopH : RoomCell;
                var day = new Color32[Atlas * Atlas]; var night = new Color32[Atlas * Atlas];
                for (int cell = 0; cell < cols * rows; cell++)
                {
                    var img = BuildingWindows.Room(cell, cw, chh, shop);
                    int ox = (cell % cols) * cw, oy = Atlas - (cell / cols + 1) * chh;   // texture rows count up from the bottom
                    for (int y = 0; y < chh; y++)
                        for (int x = 0; x < cw; x++)
                        {
                            int s = (y * cw + x) * 3, d = (oy + y) * Atlas + ox + x;
                            day[d] = Gamma(img.Day[s], img.Day[s + 1], img.Day[s + 2]);
                            night[d] = Gamma(img.Night[s], img.Night[s + 1], img.Night[s + 2]);
                        }
                }
                Surfaces.Write(day, Atlas, Atlas, Paths.Abs(dayPath));
                Surfaces.Write(night, Atlas, Atlas, Paths.Abs(nightPath));
                AssetDatabase.ImportAsset(dayPath); AssetDatabase.ImportAsset(nightPath);
                foreach (var pth in new[] { dayPath, nightPath })
                    if (AssetImporter.GetAtPath(pth) is TextureImporter imp)
                    {
                        imp.sRGBTexture = true; imp.wrapMode = TextureWrapMode.Clamp; imp.mipmapEnabled = true; imp.anisoLevel = 4;
                        imp.textureCompression = TextureImporterCompression.CompressedHQ;
                        imp.SaveAndReimport();
                    }
            }
            return (AssetDatabase.LoadAssetAtPath<Texture2D>(dayPath), AssetDatabase.LoadAssetAtPath<Texture2D>(nightPath));
        }

        static Color32 Gamma(float r, float g, float b)
        {
            var c = new Color(r, g, b).gamma;
            return new Color32((byte)Mathf.Clamp(c.r * 255f + 0.5f, 0, 255), (byte)Mathf.Clamp(c.g * 255f + 0.5f, 0, 255), (byte)Mathf.Clamp(c.b * 255f + 0.5f, 0, 255), 255);
        }

        static Material Glass(string name, (Texture2D day, Texture2D night) tex, float nits)
        {
            string path = $"{Dir}/{name.Replace(' ', '_').Replace("(", "").Replace(")", "")}.mat";
            var m = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (m == null) { m = Hdrp.Lit(); m.name = name; AssetDatabase.CreateAsset(m, path); }
            if (Hdrp.IsHdrpShader(m))
            {
                m.SetColor("_BaseColor", Color.white);
                m.SetTexture("_BaseColorMap", tex.day);
                m.SetFloat("_Metallic", 0f);
                m.SetFloat("_Smoothness", 0.96f);
                m.SetTexture("_EmissiveColorMap", tex.night);
                m.SetColor("_EmissiveColorLDR", Color.white);
                m.SetFloat("_UseEmissiveIntensity", 1);
                m.SetFloat("_EmissiveIntensityUnit", 0); // nits
                m.SetFloat("_EmissiveIntensity", nits);
                m.SetColor("_EmissiveColor", Color.white * nits);
                Hdrp.ResetKeywords(m);
            }
            else
            {
                m.mainTexture = tex.day; m.SetFloat("_Glossiness", 0.96f);
                m.SetTexture("_EmissionMap", tex.night); m.SetColor("_EmissionColor", Color.white); m.EnableKeyword("_EMISSION");
            }
            EditorUtility.SetDirty(m);
            return m;
        }

        static Material Frame(string name, Color color, float smoothness, float metallic)
        {
            string path = $"{Dir}/{name.Replace(' ', '_')}.mat";
            var m = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (m == null) { m = Hdrp.Lit(); m.name = name; AssetDatabase.CreateAsset(m, path); }
            if (Hdrp.IsHdrpShader(m))
            {
                m.SetColor("_BaseColor", color);
                m.SetFloat("_Smoothness", smoothness);
                m.SetFloat("_Metallic", metallic);
                Hdrp.ResetKeywords(m);
            }
            else { m.color = color; m.SetFloat("_Glossiness", smoothness); m.SetFloat("_Metallic", metallic); }
            EditorUtility.SetDirty(m);
            return m;
        }
    }
}
