// Puts the rest of Calvera's streets into the scene (Core/StreetData, from `export-unity.mjs street`):
// sidewalks, kerbs and intersections, the city blocks' concrete, bridges, street lights, utility poles and
// their wires, palms, front yards (walks, driveways, fences, mailboxes, bins...), chain-link, gutters,
// rooftop units, storefronts, shop and street signs, billboards, wayfinding, benches, hydrants, drains and
// litter. Every instance is baked into static meshes per 256 m square (one draw per material per square),
// with the web game's materials as HDRP Lit:
//   - photo-scanned surfaces (concrete, asphalt...) as the matching CC0 set, mapped triplanar in world space
//   - its canvas textures (signs, billboards, street names) as they are
//   - plain colours (three.js per-vertex and per-instance colours included) through a 64 x 64 palette
// Solid pieces get colliders; lamp glass glows at night and has a real light under it (StreetLights).
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Southbound.Core;
using UnityEditor;
using UnityEngine;
using UnityEngine.Rendering;

namespace Southbound.EditorTools
{
    public static class StreetBuilder
    {
        const string Dir = Paths.Generated + "/Street";
        const string MeshDir = Paths.Scenes + "/Calvera_Meshes";
        const double Cell = 256;

        sealed class Chunk
        {
            public readonly Dictionary<Material, StreetData.Baked> Draw = new Dictionary<Material, StreetData.Baked>();
            public readonly StreetData.Baked Solid = new StreetData.Baked();
        }

        public static void Build(string dataDir)
        {
            var d = StreetData.Load(dataDir);
            if (d.Objects.Count == 0) { Debug.LogWarning("Southbound: no calvera-street.json (run node tools/southbound/export-unity.mjs street): no sidewalks, lights, poles, yards or signs."); return; }
            Paths.Ensure(Dir); Paths.Ensure(MeshDir);
            var tex = ImportTextures(d, dataDir);
            var palette = Palette();
            var mats = new Dictionary<string, Material>();
            var chunks = new Dictionary<(int, int), Chunk>();
            var lamps = new List<(Vector3 at, bool street)>();
            int placed = 0;

            var protos = new List<StreetData.Obj>();
            foreach (var o in d.Objects)
            {
                var shape = d.Shapes[o.Shape];
                // heavy pieces repeated many times (palm crowns, palmetto clumps, hydrants) share one mesh and are
                // placed as instances (culled when tiny on screen) rather than copied into the merged squares
                if (o.Instanced && o.Instances >= 8 && (long)shape.N * o.Instances > 200_000) { protos.Add(o); continue; }
                bool grouped = shape.Groups.Count > 0 && o.Mats.Length > 1;
                // how tall one of these stands (for colliders): the shape's own height
                float ymin = float.MaxValue, ymax = float.MinValue;
                for (int i = 1; i < shape.Pos.Length; i += 3) { ymin = Mathf.Min(ymin, shape.Pos[i]); ymax = Mathf.Max(ymax, shape.Pos[i]); }
                for (int i = 0; i < o.Instances; i++)
                {
                    var m = o.Matrix(i);
                    var (x, y, z) = StreetData.Origin(m);
                    var key = ((int)System.Math.Floor(x / Cell), (int)System.Math.Floor(z / Cell));
                    if (!chunks.TryGetValue(key, out var ch)) chunks[key] = ch = new Chunk();
                    var tint = o.Colour(i);
                    float sy = new Vector3(m[4], m[5], m[6]).magnitude;
                    for (int k = 0; k < (grouped ? o.Mats.Length : 1); k++)
                    {
                        var sm = d.Mats[o.Mats[k]];
                        var (mat, usesPalette, flipV) = MaterialFor(d, sm, tint, tex, palette, mats, StreetData.SurfaceFor(o, sm), Glows(o));
                        if (mat == null) continue;
                        if (!ch.Draw.TryGetValue(mat, out var bk)) ch.Draw[mat] = bk = new StreetData.Baked();
                        int v0 = bk.Vertices;
                        StreetData.Bake(shape, m, grouped ? k : -1, usesPalette ? tint : (1, 1, 1), flipV, bk);
                        if (usesPalette)
                            for (int v = v0; v < bk.Vertices; v++)
                            {
                                var (pu, pv) = StreetData.PaletteUv(bk.C[v * 3] * sm.Color[0], bk.C[v * 3 + 1] * sm.Color[1], bk.C[v * 3 + 2] * sm.Color[2]);
                                bk.U[v * 2] = pu; bk.U[v * 2 + 1] = pv;
                            }
                        bool solid = !sm.Basic && !sm.Transparent && !sm.Lamp && (ymax - ymin) * sy > 0.05f
                            && !(o.Name ?? "").Contains("lit:") && !(o.Name ?? "").Contains("weed") && !o.Tag.Contains("crown") && !o.Tag.StartsWith("palms.js:im");
                        if (solid) StreetData.Bake(shape, m, grouped ? k : -1, (1, 1, 1), false, ch.Solid);
                        if (sm.Lamp)
                        {
                            float cy = (ymin + ymax) / 2;
                            lamps.Add((new Vector3(-(m[12] + m[4] * cy), m[13] + m[5] * cy, m[14] + m[6] * cy), o.Tag.StartsWith("roads.js")));
                        }
                    }
                    placed++;
                }
            }

            // wires: thin tubes, sagging as the web game hangs them
            var wireMat = Plain("Wire", new Color(0.05f, 0.05f, 0.05f), 0.35f, 0.3f);
            foreach (var wset in d.Wires)
            {
                double r = wset.Tag.StartsWith("powerlines.js") ? 0.014 : 0.008;
                int n = wset.Pos.Length / 3;
                IEnumerable<(int a, int b)> segs = wset.Idx != null
                    ? Enumerable.Range(0, wset.Idx.Length / 2).Select(s => (wset.Idx[s * 2], wset.Idx[s * 2 + 1]))
                    : wset.Segments ? Enumerable.Range(0, n / 2).Select(s => (s * 2, s * 2 + 1)) : Enumerable.Range(0, n - 1).Select(s => (s, s + 1));
                foreach (var (a, b) in segs)
                {
                    double ax = wset.Pos[a * 3], ay = wset.Pos[a * 3 + 1], az = wset.Pos[a * 3 + 2], bx = wset.Pos[b * 3], by = wset.Pos[b * 3 + 1], bz = wset.Pos[b * 3 + 2];
                    var key = ((int)System.Math.Floor((ax + bx) / 2 / Cell), (int)System.Math.Floor((az + bz) / 2 / Cell));
                    if (!chunks.TryGetValue(key, out var ch)) chunks[key] = ch = new Chunk();
                    if (!ch.Draw.TryGetValue(wireMat, out var bk)) ch.Draw[wireMat] = bk = new StreetData.Baked();
                    StreetData.Tube(ax, ay, az, bx, by, bz, r, 5, bk);
                }
            }

            var root = new GameObject("Street (sidewalks, lights, poles, yards, signs, clutter)").transform;
            int meshes = 0;
            foreach (var kv in chunks)
            {
                string tag = $"{kv.Key.Item1}_{kv.Key.Item2}";
                var ch = kv.Value;
                var used = ch.Draw.Where(p => p.Value.I.Count > 0).ToList();
                if (used.Count == 0) continue;
                var mesh = new Mesh { name = "Street_" + tag, indexFormat = IndexFormat.UInt32 };
                var v = new List<Vector3>(); var n = new List<Vector3>(); var uv = new List<Vector2>();
                mesh.subMeshCount = used.Count;
                var subs = new List<int[]>();
                foreach (var (mat, bk) in used)
                {
                    int o = v.Count;
                    for (int i = 0; i < bk.Vertices; i++)
                    {
                        v.Add(new Vector3(bk.P[i * 3], bk.P[i * 3 + 1], bk.P[i * 3 + 2]));
                        n.Add(new Vector3(bk.N[i * 3], bk.N[i * 3 + 1], bk.N[i * 3 + 2]));
                        uv.Add(new Vector2(bk.U[i * 2], bk.U[i * 2 + 1]));
                    }
                    subs.Add(bk.I.Select(i => i + o).ToArray());
                }
                mesh.SetVertices(v); mesh.SetNormals(n); mesh.SetUVs(0, uv);
                for (int s = 0; s < subs.Count; s++) mesh.SetTriangles(subs[s], s);
                mesh.RecalculateTangents(); mesh.RecalculateBounds();
                Save(mesh);
                var go = new GameObject(mesh.name);
                go.transform.SetParent(root, false);
                go.AddComponent<MeshFilter>().sharedMesh = mesh;
                var r = go.AddComponent<MeshRenderer>();
                r.sharedMaterials = used.Select(p => p.Key).ToArray();
                r.shadowCastingMode = ShadowCastingMode.On;
                GameObjectUtility.SetStaticEditorFlags(go, StaticEditorFlags.BatchingStatic | StaticEditorFlags.OccludeeStatic | StaticEditorFlags.OccluderStatic);
                if (ch.Solid.I.Count > 0)
                {
                    var cm = new Mesh { name = "StreetCollision_" + tag, indexFormat = IndexFormat.UInt32 };
                    cm.SetVertices(Enumerable.Range(0, ch.Solid.Vertices).Select(i => new Vector3(ch.Solid.P[i * 3], ch.Solid.P[i * 3 + 1], ch.Solid.P[i * 3 + 2])).ToList());
                    cm.SetTriangles(ch.Solid.I, 0);
                    cm.RecalculateBounds();
                    Save(cm);
                    go.AddComponent<MeshCollider>().sharedMesh = cm;
                }
                meshes++;
            }

            // the shared-mesh pieces
            var protoRoot = new GameObject("Palms, palmettos and other repeated pieces").transform;
            protoRoot.SetParent(root, false);
            foreach (var o in protos)
            {
                var shape = d.Shapes[o.Shape];
                bool grouped = shape.Groups.Count > 0 && o.Mats.Length > 1;
                var local = new Mesh { name = "StreetPiece_" + o.Tag.Replace(':', '_').Replace(".js", "") + "_" + o.Shape, indexFormat = IndexFormat.UInt32 };
                var v = new List<Vector3>(); var n = new List<Vector3>(); var uv = new List<Vector2>(); var subs = new List<int[]>(); var used = new List<Material>();
                var ident = new float[] { 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1 };
                bool solidAny = false;
                for (int k = 0; k < (grouped ? o.Mats.Length : 1); k++)
                {
                    var sm = d.Mats[o.Mats[k]];
                    var (mat, usesPalette, flipV) = MaterialFor(d, sm, (1, 1, 1), tex, palette, mats, StreetData.SurfaceFor(o, sm), Glows(o));
                    if (mat == null) continue;
                    var bk = new StreetData.Baked();
                    StreetData.Bake(shape, ident, grouped ? k : -1, (1, 1, 1), flipV, bk);
                    if (usesPalette) for (int q = 0; q < bk.Vertices; q++) { var (pu, pv) = StreetData.PaletteUv(bk.C[q * 3] * sm.Color[0], bk.C[q * 3 + 1] * sm.Color[1], bk.C[q * 3 + 2] * sm.Color[2]); bk.U[q * 2] = pu; bk.U[q * 2 + 1] = pv; }
                    int off = v.Count;
                    for (int q = 0; q < bk.Vertices; q++) { v.Add(new Vector3(bk.P[q * 3], bk.P[q * 3 + 1], bk.P[q * 3 + 2])); n.Add(new Vector3(bk.N[q * 3], bk.N[q * 3 + 1], bk.N[q * 3 + 2])); uv.Add(new Vector2(bk.U[q * 2], bk.U[q * 2 + 1])); }
                    subs.Add(bk.I.Select(i => i + off).ToArray()); used.Add(mat);
                    mat.enableInstancing = true;
                    solidAny |= !sm.Basic && !sm.Transparent && !o.Tag.Contains("crown") && !o.Tag.StartsWith("palms.js:im");
                }
                if (used.Count == 0) continue;
                local.SetVertices(v); local.SetNormals(n); local.SetUVs(0, uv); local.subMeshCount = subs.Count;
                for (int q = 0; q < subs.Count; q++) local.SetTriangles(subs[q], q);
                local.RecalculateTangents(); local.RecalculateBounds();
                Save(local);
                var group = new GameObject(local.name).transform;
                group.SetParent(protoRoot, false);
                for (int i = 0; i < o.Instances; i++)
                {
                    // the web matrix conjugated by the mirror (S M S), as position, rotation and scale
                    var m = o.Matrix(i);
                    var M = new Matrix4x4();
                    M.SetColumn(0, new Vector4(m[0], -m[1], -m[2], 0));
                    M.SetColumn(1, new Vector4(-m[4], m[5], m[6], 0));
                    M.SetColumn(2, new Vector4(-m[8], m[9], m[10], 0));
                    M.SetColumn(3, new Vector4(-m[12], m[13], m[14], 1));
                    var go = new GameObject(o.Tag);
                    go.transform.SetParent(group, false);
                    go.transform.SetPositionAndRotation(M.GetColumn(3), M.rotation);
                    go.transform.localScale = M.lossyScale;
                    go.AddComponent<MeshFilter>().sharedMesh = local;
                    var r = go.AddComponent<MeshRenderer>();
                    r.sharedMaterials = used.ToArray();
                    r.shadowCastingMode = ShadowCastingMode.On;
                    var lod = go.AddComponent<LODGroup>();
                    lod.SetLODs(new[] { new LOD(0.008f, new Renderer[] { r }) });
                    if (solidAny && !o.Tag.StartsWith("palms.js:im")) go.AddComponent<MeshCollider>().sharedMesh = local;
                    GameObjectUtility.SetStaticEditorFlags(go, StaticEditorFlags.OccludeeStatic);
                    placed++;
                }
            }

            // the lights under the lamp glass: street lights shine down the road, porch lanterns light the steps
            var lightsRoot = new GameObject("Street lights").transform;
            lightsRoot.SetParent(root, false);
            foreach (var (at, street) in lamps)
            {
                var go = new GameObject(street ? "street light" : "porch light");
                go.transform.SetParent(lightsRoot, false);
                go.transform.position = at + (street ? Vector3.down * 0.15f : Vector3.zero);
                go.transform.rotation = street ? Quaternion.LookRotation(Vector3.down, Vector3.forward) : Quaternion.identity;
                var l = go.AddComponent<Light>();
                l.type = street ? LightType.Spot : LightType.Point;
                l.color = street ? new Color(1f, 0.83f, 0.62f) : new Color(1f, 0.78f, 0.52f);
                if (street) { l.spotAngle = 135; l.innerSpotAngle = 70; l.range = 40; } else l.range = 9;
                Hdrp.SetupLamp(l, street ? 9000f : 450f);
                var hd = Hdrp.FindType("UnityEngine.Rendering.HighDefinition.HDAdditionalLightData");
                if (hd != null && go.GetComponent(hd) is Component c) Hdrp.SetMember(c, "fadeDistance", street ? 220f : 90f);
                l.enabled = false;   // StreetLights turns them on at dusk
            }
            var sl = root.gameObject.AddComponent<StreetLights>();
            sl.glass = mats.Values.Where(m => m.name.StartsWith("Street lamp")).ToArray();
            sl.signs = mats.Values.Where(m => m.name.StartsWith("Street lit sign")).ToArray();
            Debug.Log($"Southbound: the street: {placed} pieces in {meshes} squares, {d.Wires.Sum(w => w.Pos.Length / 6)} wire spans, {lamps.Count} lamps.");
        }

        static void Save(Mesh m)
        {
            string path = $"{MeshDir}/{m.name}.asset";
            AssetDatabase.DeleteAsset(path);
            AssetDatabase.CreateAsset(m, path);
        }

        // ------------------------------------------------------------------ materials
        /// <summary>The material a web material becomes, whether its colour goes through the palette, and whether v flips.</summary>
        /// <summary>Signs the web game lights after dark: shop names over the bays, storefront signs, billboards.</summary>
        static bool Glows(StreetData.Obj o) => o.Name == "facade-signs" || o.Tag == "storefronts.js:sign" || o.Tag == "billboards.js:mesh";

        static (Material mat, bool palette, bool flipV) MaterialFor(StreetData d, StreetData.Mat sm, (float r, float g, float b) tint, Dictionary<int, Texture2D> tex, Texture2D palette, Dictionary<string, Material> cache, string forced, bool glow = false)
        {
            float Q(float x) => Mathf.Round(x * 16) / 16;
            string lit = $"{Q(sm.Rough)}_{Q(sm.Metal)}_{(sm.DoubleSided ? 1 : 0)}_{(sm.Basic ? 1 : 0)}";
            var t = sm.Map >= 0 ? d.Textures[sm.Map] : null;
            if (forced == "chainlink")
            {
                if (!cache.TryGetValue("chainlink", out var cl)) cache["chainlink"] = cl = ChainLink();
                return (cl, false, false);
            }
            if (forced != null) t = new StreetData.Tex { Surf = forced };
            // lamp glass: its own material (StreetLights drives its glow)
            if (sm.Lamp)
            {
                string k = $"lamp_{Q(sm.Emissive[0])}_{Q(sm.Emissive[1])}_{Q(sm.Emissive[2])}";
                if (!cache.TryGetValue(k, out var lm))
                {
                    lm = Plain("Street lamp " + cache.Count, new Color(sm.Color[0], sm.Color[1], sm.Color[2]).gamma, 1 - sm.Rough, sm.Metal);
                    if (Hdrp.IsHdrpShader(lm))
                    {
                        lm.SetColor("_EmissiveColorLDR", new Color(sm.Emissive[0], sm.Emissive[1], sm.Emissive[2]).gamma);
                        lm.SetFloat("_UseEmissiveIntensity", 1); lm.SetFloat("_EmissiveIntensityUnit", 0);
                        lm.SetFloat("_EmissiveIntensity", 0); lm.SetColor("_EmissiveColor", Color.black);
                        Hdrp.ResetKeywords(lm);
                    }
                    cache[k] = lm;
                }
                return (lm, false, false);
            }
            if (t != null && !string.IsNullOrEmpty(t.Surf))
            {
                // a photo-scanned surface: the CC0 set, triplanar in world space, tinted
                // the web game's colour multiplies its own texture; a surface it draws in a shader of its own keeps the scan's colour
                var bc = forced != null ? new[] { 0.78f, 0.78f, 0.78f } : sm.Color;
                var tc = new Color(Mathf.Min(1, bc[0] * tint.r / 0.78f), Mathf.Min(1, bc[1] * tint.g / 0.78f), Mathf.Min(1, bc[2] * tint.b / 0.78f));
                string k = $"surf_{t.Surf}_{Q(tc.r)}_{Q(tc.g)}_{Q(tc.b)}";
                if (!cache.TryGetValue(k, out var m))
                {
                    var src = Surfaces.Get(t.Surf);
                    var set = MaterialLibrary.Get(t.Surf);
                    if (src == null || set == null) return (FallbackPlain(sm, palette, cache, lit), true, false);
                    m = new Material(src) { name = $"Street {t.Surf} {cache.Count}" };
                    if (Hdrp.IsHdrpShader(m))
                    {
                        m.SetColor("_BaseColor", new Color(Q(tc.r), Q(tc.g), Q(tc.b)).gamma);
                        m.SetFloat("_UVBase", 5);   // triplanar
                        m.SetFloat("_TexWorldScale", (float)(1.0 / set.TileMeters));
                        m.SetFloat("_DisplacementMode", 0);
                        Hdrp.ResetKeywords(m);
                    }
                    AssetDatabase.CreateAsset(m, $"{Dir}/{m.name.Replace(' ', '_')}.mat");
                    cache[k] = m;
                }
                return (m, false, false);
            }
            if (t != null && tex.TryGetValue(sm.Map, out var tx) && tx != null)
            {
                // a canvas texture (a sign, a billboard, a street name, litter): as it is, tinted per instance
                var tc = new Color(Q(sm.Color[0] * tint.r), Q(sm.Color[1] * tint.g), Q(sm.Color[2] * tint.b));
                string k = $"tex_{sm.Map}_{tc.r}_{tc.g}_{tc.b}_{lit}_{(sm.Transparent ? 1 : 0)}_{(glow ? 1 : 0)}";
                if (!cache.TryGetValue(k, out var m))
                {
                    m = sm.Basic ? Unlit($"Street sign {cache.Count}") : Plain(glow ? $"Street lit sign {cache.Count}" : $"Street sign {cache.Count}", Color.white, 1 - sm.Rough, sm.Metal);
                    if (glow && Hdrp.IsHdrpShader(m))
                    {
                        // lit from inside at night (StreetLights turns it up): the sign's own picture glows
                        m.SetTexture("_EmissiveColorMap", tx);
                        m.SetColor("_EmissiveColorLDR", Color.white);
                        m.SetFloat("_UseEmissiveIntensity", 1); m.SetFloat("_EmissiveIntensityUnit", 0);
                        m.SetFloat("_EmissiveIntensity", 0); m.SetColor("_EmissiveColor", Color.black);
                    }
                    if (Hdrp.IsHdrpShader(m) || m.shader.name.StartsWith("HDRP/"))
                    {
                        m.SetTexture(sm.Basic ? "_UnlitColorMap" : "_BaseColorMap", tx);
                        m.SetColor(sm.Basic ? "_UnlitColor" : "_BaseColor", tc.gamma);
                        if (sm.Transparent || sm.AlphaTest > 0) { m.SetFloat("_AlphaCutoffEnable", 1); m.SetFloat("_AlphaCutoff", Mathf.Max(0.3f, sm.AlphaTest)); }
                        if (sm.DoubleSided) m.SetFloat("_DoubleSidedEnable", 1);
                        Hdrp.ResetKeywords(m);
                    }
                    EditorUtility.SetDirty(m);
                    cache[k] = m;
                }
                return (m, false, !t.FlipY);
            }
            // plain colours: through the palette
            if (sm.Transparent && sm.Opacity < 0.95f)
            {
                string k = $"glass_{Q(sm.Color[0])}_{Q(sm.Color[1])}_{Q(sm.Color[2])}_{Q(sm.Opacity)}";
                if (!cache.TryGetValue(k, out var g)) cache[k] = g = Glass($"Street glass {cache.Count}", new Color(sm.Color[0], sm.Color[1], sm.Color[2]).gamma, sm.Opacity);
                return (g, false, false);
            }
            return (FallbackPlain(sm, palette, cache, lit), true, false);
        }

        static Material FallbackPlain(StreetData.Mat sm, Texture2D palette, Dictionary<string, Material> cache, string lit)
        {
            string k = "pal_" + lit;
            if (cache.TryGetValue(k, out var m)) return m;
            m = sm.Basic ? Unlit($"Street painted {cache.Count}") : Plain($"Street painted {cache.Count}", Color.white, 1 - sm.Rough, sm.Metal);
            if (m.shader.name.StartsWith("HDRP/"))
            {
                m.SetTexture(sm.Basic ? "_UnlitColorMap" : "_BaseColorMap", palette);
                if (sm.DoubleSided) m.SetFloat("_DoubleSidedEnable", 1);
                Hdrp.ResetKeywords(m);
            }
            else m.mainTexture = palette;
            EditorUtility.SetDirty(m);
            cache[k] = m;
            return m;
        }

        static Material Plain(string name, Color c, float smoothness, float metallic)
        {
            string path = $"{Dir}/{name.Replace(' ', '_')}.mat";
            var m = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (m == null) { m = Hdrp.Lit(); m.name = name; AssetDatabase.CreateAsset(m, path); }
            if (Hdrp.IsHdrpShader(m)) { m.SetColor("_BaseColor", c); m.SetFloat("_Smoothness", smoothness); m.SetFloat("_Metallic", metallic); Hdrp.ResetKeywords(m); }
            else { m.color = c; m.SetFloat("_Glossiness", smoothness); m.SetFloat("_Metallic", metallic); }
            EditorUtility.SetDirty(m);
            return m;
        }

        static Material Unlit(string name)
        {
            string path = $"{Dir}/{name.Replace(' ', '_')}.mat";
            var m = AssetDatabase.LoadAssetAtPath<Material>(path);
            var sh = Shader.Find("HDRP/Unlit") ?? Shader.Find("Unlit/Texture");
            if (m == null) { m = new Material(sh) { name = name }; AssetDatabase.CreateAsset(m, path); }
            return m;
        }

        static Material Glass(string name, Color c, float opacity)
        {
            var m = Plain(name, new Color(c.r, c.g, c.b, opacity), 0.95f, 0f);
            if (Hdrp.IsHdrpShader(m))
            {
                m.SetFloat("_SurfaceType", 1);      // transparent
                m.SetFloat("_BlendMode", 0);        // alpha
                m.SetFloat("_EnableBlendModePreserveSpecularLighting", 1);
                m.SetFloat("_DoubleSidedEnable", 1);
                Hdrp.ResetKeywords(m);
            }
            EditorUtility.SetDirty(m);
            return m;
        }

        /// <summary>Chain-link: galvanised diamond mesh you see through, alpha-clipped, mapped in world space.</summary>
        static Material ChainLink()
        {
            string path = $"{Dir}/ChainLink.png";
            if (!File.Exists(Paths.Abs(path)))
            {
                const int size = 512;
                var f = StreetData.ChainLink(size);
                var px = new Color32[size * size];
                for (int i = 0; i < px.Length; i++)
                {
                    var c = new Color(f[i * 4], f[i * 4 + 1], f[i * 4 + 2]).gamma;
                    px[i] = new Color32((byte)(c.r * 255), (byte)(c.g * 255), (byte)(c.b * 255), (byte)(f[i * 4 + 3] * 255));
                }
                Surfaces.Write(px, size, size, Paths.Abs(path));
                AssetDatabase.ImportAsset(path);
                if (AssetImporter.GetAtPath(path) is TextureImporter imp)
                {
                    imp.sRGBTexture = true; imp.alphaIsTransparency = true; imp.mipmapEnabled = true; imp.mipMapsPreserveCoverage = true; imp.alphaTestReferenceValue = 0.5f;
                    imp.wrapMode = TextureWrapMode.Repeat; imp.SaveAndReimport();
                }
            }
            var m = Plain("Street chain-link", Color.white, 0.55f, 0.6f);
            if (Hdrp.IsHdrpShader(m))
            {
                m.SetTexture("_BaseColorMap", AssetDatabase.LoadAssetAtPath<Texture2D>(path));
                m.SetFloat("_UVBase", 5); m.SetFloat("_TexWorldScale", 2f);   // a 0.5 m tile, triplanar
                m.SetFloat("_AlphaCutoffEnable", 1); m.SetFloat("_AlphaCutoff", 0.5f);
                m.SetFloat("_DoubleSidedEnable", 1);
                Hdrp.ResetKeywords(m);
            }
            EditorUtility.SetDirty(m);
            return m;
        }

        /// <summary>The 64 x 64 palette every plain colour is read from (Core/StreetData.PaletteColour).</summary>
        public static Texture2D Palette()
        {
            string path = $"{Dir}/Street_Palette.png";
            Paths.Ensure(Dir);
            if (!File.Exists(Paths.Abs(path)))
            {
                int s = StreetData.PaletteSize;
                var px = new Color32[s * s];
                for (int j = 0; j < s; j++)
                    for (int i = 0; i < s; i++)
                    {
                        var (r, g, b) = StreetData.PaletteColour(i, j);
                        var c = new Color(r, g, b).gamma;
                        px[j * s + i] = new Color32((byte)(c.r * 255 + 0.5f), (byte)(c.g * 255 + 0.5f), (byte)(c.b * 255 + 0.5f), 255);
                    }
                Surfaces.Write(px, s, s, Paths.Abs(path));
                AssetDatabase.ImportAsset(path);
                if (AssetImporter.GetAtPath(path) is TextureImporter imp)
                {
                    imp.sRGBTexture = true; imp.filterMode = FilterMode.Point; imp.mipmapEnabled = false; imp.wrapMode = TextureWrapMode.Clamp;
                    imp.textureCompression = TextureImporterCompression.Uncompressed;
                    imp.SaveAndReimport();
                }
            }
            return AssetDatabase.LoadAssetAtPath<Texture2D>(path);
        }

        /// <summary>The web game's canvas textures (signs, billboards...), copied into the project and imported.</summary>
        static Dictionary<int, Texture2D> ImportTextures(StreetData d, string dataDir)
        {
            var map = new Dictionary<int, Texture2D>();
            for (int i = 0; i < d.Textures.Count; i++)
            {
                var t = d.Textures[i];
                if (string.IsNullOrEmpty(t.File)) continue;
                string src = Path.Combine(dataDir, t.File), dst = $"{Dir}/Tex_{i}.png";
                if (!File.Exists(src)) continue;
                File.Copy(src, Paths.Abs(dst), true);
                AssetDatabase.ImportAsset(dst);
                if (AssetImporter.GetAtPath(dst) is TextureImporter imp)
                {
                    imp.sRGBTexture = true; imp.alphaIsTransparency = true; imp.mipmapEnabled = true; imp.anisoLevel = 4;
                    imp.wrapMode = t.Repeat ? TextureWrapMode.Repeat : TextureWrapMode.Clamp;
                    imp.SaveAndReimport();
                }
                map[i] = AssetDatabase.LoadAssetAtPath<Texture2D>(dst);
            }
            return map;
        }
    }
}
