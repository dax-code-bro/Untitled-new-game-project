// The rest of Calvera's streets, as the web game builds them (export-unity.mjs street ->
// Data/World/calvera-street.json): shapes, materials, textures and every placed instance, in the web game's
// space. Bake() turns one instance into Unity-space triangles: placed by its matrix, normals through the
// inverse transpose, x mirrored into Unity's left-handed space and the winding put right (a mirrored
// instance flips it once more). Colours that HDRP Lit can't take per vertex (three.js vertex and instance
// colours) become a texture coordinate into a small palette (the trick the cars use).
using System;
using System.Collections.Generic;
using System.IO;

namespace Southbound.Core
{
    public sealed class StreetData
    {
        public sealed class Shape { public int N; public float[] Pos, Nrm, Uv, Col; public int ColSize = 3; public int[] Idx; public List<(int start, int count, int mat)> Groups = new List<(int, int, int)>(); }
        public sealed class Mat
        {
            public string Type, Surf;
            public float[] Color = { 1, 1, 1 }, Emissive = { 0, 0, 0 };
            public float Rough = 1, Metal, EmissiveIntensity, Opacity = 1, AlphaTest;
            public int Map = -1;
            public bool Transparent, DoubleSided, VertexColors, Custom;
            /// <summary>Lamp glass: it glows (emissive colour set), lit at night.</summary>
            public bool Lamp => Emissive[0] + Emissive[1] + Emissive[2] > 0.05f;
            public bool Basic => Type == "MeshBasicMaterial";
        }
        public sealed class Tex { public string Surf, Slot, File; public int W, H; public bool Repeat, FlipY = true; }
        public sealed class Obj
        {
            public string Tag, Name; public int Shape; public int[] Mats; public float[] World; public float[] Inst; public float[] Colors; public int Count; public bool Shadows;
            public bool Instanced => Inst != null;
            public int Instances => Instanced ? Count : 1;
            /// <summary>Instance i's matrix (three.js order: column-major, 16 floats).</summary>
            public float[] Matrix(int i) { if (!Instanced) return World; var m = new float[16]; Array.Copy(Inst, i * 16, m, 0, 16); return m; }
            public (float r, float g, float b) Colour(int i) => Colors == null ? (1, 1, 1) : (Colors[i * 3], Colors[i * 3 + 1], Colors[i * 3 + 2]);
        }
        public sealed class Wire { public string Tag; public bool Segments; public float[] Pos; public int[] Idx; public float[] Color; }

        public readonly List<Shape> Shapes = new List<Shape>();
        public readonly List<Mat> Mats = new List<Mat>();
        public readonly List<Tex> Textures = new List<Tex>();
        public readonly List<Obj> Objects = new List<Obj>();
        public readonly List<Wire> Wires = new List<Wire>();

        public static string FileIn(string folder) => Path.Combine(folder, "calvera-street.json");

        public static StreetData Load(string folder)
        {
            var d = new StreetData();
            string f = FileIn(folder);
            if (!File.Exists(f)) return d;
            var j = (Dictionary<string, object>)MiniJson.Parse(File.ReadAllText(f));
            foreach (Dictionary<string, object> g in j.Arr("geometries"))
            {
                var s = new Shape { N = (int)g.Num("n"), Pos = F(g.Text("pos")), Nrm = F(g.Text("nrm")), Uv = F(g.Text("uv")), Col = F(g.Text("col")), ColSize = (int)g.Num("colSize", 3), Idx = I(g.Text("idx")) };
                if (g.TryGetValue("groups", out var gr) && gr is List<object> gl)
                    foreach (List<object> q in gl) s.Groups.Add(((int)(double)q[0], (int)(double)q[1], (int)(double)q[2]));
                d.Shapes.Add(s);
            }
            foreach (Dictionary<string, object> m in j.Arr("materials"))
                d.Mats.Add(new Mat
                {
                    Type = m.Text("type"), Surf = m.Text("surf"), Color = V(m, "color") ?? new float[] { 1, 1, 1 }, Emissive = V(m, "emissive") ?? new float[] { 0, 0, 0 },
                    Rough = (float)m.Num("rough", 1), Metal = (float)m.Num("metal"), EmissiveIntensity = (float)m.Num("emissiveIntensity"), Opacity = (float)m.Num("opacity", 1),
                    AlphaTest = (float)m.Num("alphaTest"), Map = m.TryGetValue("map", out var mp) && mp is double md ? (int)md : -1,
                    Transparent = m.Flag("transparent"), DoubleSided = m.Flag("doubleSided"), VertexColors = m.Flag("vertexColors"), Custom = m.Flag("custom"),
                });
            foreach (Dictionary<string, object> t in j.Arr("textures"))
                d.Textures.Add(new Tex { Surf = t.Text("surf"), Slot = t.Text("slot"), File = t.Text("file"), W = (int)t.Num("w"), H = (int)t.Num("h"), Repeat = t.Flag("repeat"), FlipY = t.Flag("flipY", true) });
            foreach (Dictionary<string, object> o in j.Arr("objects"))
            {
                var mats = new List<int>(); foreach (var x in (List<object>)o["mats"]) mats.Add((int)(double)x);
                var w = new float[16]; var wl = (List<object>)o["world"]; for (int i = 0; i < 16; i++) w[i] = (float)(double)wl[i];
                d.Objects.Add(new Obj { Tag = o.Text("tag"), Name = o.Text("name"), Shape = (int)o.Num("geo"), Mats = mats.ToArray(), World = w, Inst = F(o.Text("inst")), Colors = F(o.Text("colors")), Count = (int)o.Num("count", 1), Shadows = o.Flag("shadows") });
            }
            foreach (Dictionary<string, object> l in j.Arr("lines") ?? new List<object>())
                d.Wires.Add(new Wire { Tag = l.Text("tag"), Segments = l.Flag("segments"), Pos = F(l.Text("pos")), Idx = I(l.Text("idx")), Color = V(l, "color") });
            return d;
        }

        static float[] V(Dictionary<string, object> m, string k)
        {
            if (!m.TryGetValue(k, out var v) || !(v is List<object> l)) return null;
            var a = new float[l.Count]; for (int i = 0; i < a.Length; i++) a[i] = (float)(double)l[i];
            return a;
        }
        static float[] F(string b64)
        {
            if (string.IsNullOrEmpty(b64)) return null;
            var bytes = Convert.FromBase64String(b64); var a = new float[bytes.Length / 4];
            Buffer.BlockCopy(bytes, 0, a, 0, a.Length * 4);
            return a;
        }
        static int[] I(string b64)
        {
            if (string.IsNullOrEmpty(b64)) return null;
            var bytes = Convert.FromBase64String(b64); var a = new int[bytes.Length / 4];
            Buffer.BlockCopy(bytes, 0, a, 0, a.Length * 4);
            return a;
        }

        // ------------------------------------------------------------------ baking
        public sealed class Baked
        {
            public readonly List<float> P = new List<float>(), N = new List<float>(), U = new List<float>();
            /// <summary>The colour each vertex carries (material x instance x vertex colour), for the palette.</summary>
            public readonly List<float> C = new List<float>();
            public readonly List<int> I = new List<int>();
            public int Vertices => P.Count / 3;
        }

        /// <summary>The triangles of `shape` (only those drawn with material slot `slot`, or all for -1) placed
        /// by matrix m, appended to `into` in Unity space. `tint` multiplies the colour every vertex carries.</summary>
        public static void Bake(Shape s, float[] m, int slot, (float r, float g, float b) tint, bool flipV, Baked into)
        {
            // the normal matrix: inverse transpose of the upper 3x3
            double a = m[0], b = m[4], c = m[8], d = m[1], e = m[5], f = m[9], g = m[2], h = m[6], k = m[10];
            double det = a * (e * k - f * h) - b * (d * k - f * g) + c * (d * h - e * g);
            double id = Math.Abs(det) < 1e-12 ? 0 : 1 / det;
            // inverse (row-major r_ij), then transposed for normals
            double i00 = (e * k - f * h) * id, i01 = (c * h - b * k) * id, i02 = (b * f - c * e) * id;
            double i10 = (f * g - d * k) * id, i11 = (a * k - c * g) * id, i12 = (c * d - a * f) * id;
            double i20 = (d * h - e * g) * id, i21 = (b * g - a * h) * id, i22 = (a * e - b * d) * id;
            var map = new Dictionary<int, int>();
            int Vert(int v)
            {
                if (map.TryGetValue(v, out int o)) return o;
                o = into.Vertices;
                double x = s.Pos[v * 3], y = s.Pos[v * 3 + 1], z = s.Pos[v * 3 + 2];
                double wx = m[0] * x + m[4] * y + m[8] * z + m[12], wy = m[1] * x + m[5] * y + m[9] * z + m[13], wz = m[2] * x + m[6] * y + m[10] * z + m[14];
                into.P.Add((float)-wx); into.P.Add((float)wy); into.P.Add((float)wz);
                double nx = 0, ny = 1, nz = 0;
                if (s.Nrm != null)
                {
                    double px = s.Nrm[v * 3], py = s.Nrm[v * 3 + 1], pz = s.Nrm[v * 3 + 2];
                    // n' = (M^-1)^T n: row j of the result is column j of the inverse
                    nx = i00 * px + i10 * py + i20 * pz; ny = i01 * px + i11 * py + i21 * pz; nz = i02 * px + i12 * py + i22 * pz;
                    double l = Math.Sqrt(nx * nx + ny * ny + nz * nz); if (l > 1e-12) { nx /= l; ny /= l; nz /= l; }
                }
                into.N.Add((float)-nx); into.N.Add((float)ny); into.N.Add((float)nz);
                float u = s.Uv != null ? s.Uv[v * 2] : 0, vv = s.Uv != null ? s.Uv[v * 2 + 1] : 0;
                into.U.Add(u); into.U.Add(flipV ? 1 - vv : vv);
                float cr = tint.r, cg = tint.g, cb = tint.b;
                if (s.Col != null) { cr *= s.Col[v * s.ColSize]; cg *= s.Col[v * s.ColSize + 1]; cb *= s.Col[v * s.ColSize + 2]; }
                into.C.Add(cr); into.C.Add(cg); into.C.Add(cb);
                map[v] = o;
                return o;
            }
            // which triangles: the group drawn with this slot, or everything
            int count = s.Idx != null ? s.Idx.Length : s.N;
            var ranges = new List<(int start, int count)>();
            if (slot < 0 || s.Groups.Count == 0) ranges.Add((0, count));
            else foreach (var q in s.Groups) if (q.mat == slot) ranges.Add((q.start, Math.Min(q.count, count - q.start)));
            // the mirror into Unity flips the winding once, a mirrored instance once more
            bool flip = det > 0;
            foreach (var (start, cnt) in ranges)
                for (int t = start; t + 2 < start + cnt + 0; t += 3)
                {
                    int i0 = s.Idx != null ? s.Idx[t] : t, i1 = s.Idx != null ? s.Idx[t + 1] : t + 1, i2 = s.Idx != null ? s.Idx[t + 2] : t + 2;
                    int A = Vert(i0), B = Vert(i1), C = Vert(i2);
                    if (flip) { into.I.Add(A); into.I.Add(C); into.I.Add(B); } else { into.I.Add(A); into.I.Add(B); into.I.Add(C); }
                }
        }

        /// <summary>The photo-scanned set a piece is really made of, where the web game draws it in its own shader
        /// (sidewalk pavers, kerbs, bridge decks, poured walks and drives, gravel shoulders, bare footings, palm
        /// bark), or "chainlink"; null to go by the exported material.</summary>
        public static string SurfaceFor(Obj o, Mat m)
        {
            string t = o.Tag ?? "";
            if (t == "roads.js:slab" || t == "roads.js:pm") return "square_concrete_pavers";
            if (t == "roads.js:curb" || t == "roads.js:cm") return "Concrete045";
            if (t == "roads.js:bm") return "Concrete047A";
            if (t == "yards.js:im" && !m.VertexColors && m.Map < 0 && m.Color[0] > 0.9f && m.Color[1] > 0.9f && m.Color[2] > 0.9f && !m.Lamp) return "Concrete034";
            if (t == "shoulders.js:mesh") return "Gravel004";
            if (t == "shoulders.js:im") return "Ground054";
            if (t == "palms.js:trunk") return "Bark007";
            if (t == "buildings.js:fmesh") return "chainlink";
            return null;
        }

        /// <summary>Galvanised chain-link for a 0.5 m tile (RGBA, alpha = wire): 5 cm diamonds of 3 mm wire.</summary>
        public static float[] ChainLink(int size)
        {
            var px = new float[size * size * 4];
            const double cells = 10;                     // diamonds across the tile (0.5 m / 5 cm)
            const double wire = 0.06;                     // share of a diamond's pitch that is wire (~3 mm)
            for (int j = 0; j < size; j++)
                for (int i = 0; i < size; i++)
                {
                    double x = (i + 0.5) / size * cells, y = (j + 0.5) / size * cells;
                    double a = x + y, b = x - y;
                    double fa = a - Math.Floor(a), fb = b - Math.Floor(b);
                    double d = Math.Min(Math.Min(fa, 1 - fa), Math.Min(fb, 1 - fb));
                    bool on = d < wire / 2;
                    // a little shading across the wire's round section
                    float shade = on ? (float)(0.75 + 0.25 * Math.Cos(d / (wire / 2) * Math.PI / 2)) : 0;
                    int o = (j * size + i) * 4;
                    px[o] = 0.72f * shade + 0.05f; px[o + 1] = 0.74f * shade + 0.05f; px[o + 2] = 0.76f * shade + 0.05f; px[o + 3] = on ? 1 : 0;
                }
            return px;
        }

        /// <summary>Where an instance stands (web space x, z): its matrix's translation.</summary>
        public static (double x, double y, double z) Origin(float[] m) => (m[12], m[13], m[14]);

        /// <summary>A wire as a thin tube (Unity space): `sides`-sided, radius r, along each segment.</summary>
        public static void Tube(double ax, double ay, double az, double bx, double by, double bz, double r, int sides, Baked into)
        {
            // Unity space: mirror x
            ax = -ax; bx = -bx;
            double dx = bx - ax, dy = by - ay, dz = bz - az, l = Math.Sqrt(dx * dx + dy * dy + dz * dz);
            if (l < 1e-6) return;
            dx /= l; dy /= l; dz /= l;
            // two axes across the wire
            double ux = -dz, uy = 0, uz = dx, ul = Math.Sqrt(ux * ux + uz * uz);
            if (ul < 1e-6) { ux = 1; uy = 0; uz = 0; ul = 1; }
            ux /= ul; uz /= ul;
            double vx = dy * uz - dz * uy, vy = dz * ux - dx * uz, vz = dx * uy - dy * ux;
            int o = into.Vertices;
            for (int end = 0; end < 2; end++)
                for (int k = 0; k < sides; k++)
                {
                    double ang = 2 * Math.PI * k / sides, cs = Math.Cos(ang), sn = Math.Sin(ang);
                    double nx = ux * cs + vx * sn, ny = uy * cs + vy * sn, nz = uz * cs + vz * sn;
                    double px = end == 0 ? ax : bx, py = end == 0 ? ay : by, pz = end == 0 ? az : bz;
                    into.P.Add((float)(px + nx * r)); into.P.Add((float)(py + ny * r)); into.P.Add((float)(pz + nz * r));
                    into.N.Add((float)nx); into.N.Add((float)ny); into.N.Add((float)nz);
                    into.U.Add((float)k / sides); into.U.Add(end);
                    into.C.Add(1); into.C.Add(1); into.C.Add(1);
                }
            for (int k = 0; k < sides; k++)
            {
                int k1 = (k + 1) % sides, a0 = o + k, a1 = o + k1, b0 = o + sides + k, b1 = o + sides + k1;
                into.I.AddRange(new[] { a0, b0, b1, a0, b1, a1 });
            }
        }

        /// <summary>The palette cell (0..PaletteSize^2 - 1) a colour falls in: 4 levels per channel... 16 levels
        /// of each, packed. Returns the texture coordinate of that cell's centre.</summary>
        public const int PaletteSize = 64, PaletteLevels = 16;
        public static (float u, float v) PaletteUv(float r, float g, float b)
        {
            int q(float x) => Math.Max(0, Math.Min(PaletteLevels - 1, (int)Math.Round(Math.Pow(Math.Max(0, Math.Min(1, x)), 1 / 2.2) * (PaletteLevels - 1))));
            int idx = (q(r) * PaletteLevels + q(g)) * PaletteLevels + q(b);   // 0..4095 = 64 x 64
            return ((idx % PaletteSize + 0.5f) / PaletteSize, (idx / PaletteSize + 0.5f) / PaletteSize);
        }

        /// <summary>The palette texture's colour at cell (i, j), linear RGB: the inverse of PaletteUv.</summary>
        public static (float r, float g, float b) PaletteColour(int i, int j)
        {
            int idx = j * PaletteSize + i, r = idx / (PaletteLevels * PaletteLevels), g = idx / PaletteLevels % PaletteLevels, b = idx % PaletteLevels;
            float L(int x) => (float)Math.Pow(x / (double)(PaletteLevels - 1), 2.2);
            return (L(r), L(g), L(b));
        }
    }
}
