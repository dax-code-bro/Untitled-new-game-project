// Car meshes for Unity: the body rebuilt from its spec (CarShape + SurfaceNets, the web game's own
// method) at four levels of detail, every triangle given its palette slot (CarZones), and the wheels
// from the web game's own wheel builder (exported to Data/Vehicles/wheels.json: five rim styles,
// three levels each, made for a 0.35 m wheel 0.24 m wide and scaled to each car).
//
// Output is in Unity's coordinates: the web game's car space with x mirrored (the same mirror as
// the world, CalveraWorld.ToUnity), so triangles are re-wound to keep facing out. Unity's car
// forward is +z, up +y, the driver's side -x.
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;

namespace Southbound.Core
{
    public sealed class CarMeshData
    {
        public float[] Positions, Normals, Uvs;
        public int[] Indices;
        /// <summary>Triangles per palette slot (for tests and the build report).</summary>
        public int[] SlotTriangles = new int[CarPalette.Texels];
        public int VertexCount => Positions.Length / 3;
        public int TriangleCount => Indices.Length / 3;
    }

    public sealed class WheelLevel
    {
        public int Level, Vertices, Triangles;
        /// <summary>Part colours: r, g, b, roughness, metalness.</summary>
        public double[][] Palette;
        public float[] Positions, Normals; // web wheel space (axle along x, rim face toward +x)
        public byte[] Part;                // palette index per vertex
        public int[] Indices;
    }

    public sealed class WheelStyle { public int Spokes; public WheelLevel[] Levels; }

    public sealed class WheelSet
    {
        public double RefRadius = 0.35, RefWidth = 0.24;
        public readonly List<WheelStyle> Styles = new List<WheelStyle>();
        public static string DefaultFile(string projectRoot) => Path.Combine(projectRoot, "Data", "Vehicles", "wheels.json");
        public static WheelSet Load(string file) => Parse(File.ReadAllText(file));

        /// <summary>The rim style a car's spoke count picks (the nearest exported one).</summary>
        public WheelStyle Style(int spokes) => Styles.FirstOrDefault(s => s.Spokes == spokes) ?? Styles.OrderBy(s => Math.Abs(s.Spokes - spokes)).FirstOrDefault();

        /// <summary>A mesh in the export's packed form (positions in posScale steps as int16, normals as int8/127, a
        /// palette index per vertex, 16- or 32-bit indices): the wheels and the car cabins.</summary>
        public static WheelLevel Decode(Dictionary<string, object> lv)
        {
            double ps = lv.Num("posScale", 1e-4);
            var pos = Convert.FromBase64String(lv.Text("pos"));
            var nrm = Convert.FromBase64String(lv.Text("nrm"));
            var pal = Convert.FromBase64String(lv.Text("pal"));
            var idxB = Convert.FromBase64String(lv.Text("idx"));
            int n = pos.Length / 6;
            var w = new WheelLevel
            {
                Level = (int)lv.Num("level"), Vertices = (int)lv.Num("verts"), Triangles = (int)lv.Num("tris"),
                Palette = lv.Arr("palette").Select(p => ((List<object>)p).Select(o => (double)o).ToArray()).ToArray(),
                Positions = new float[n * 3], Normals = new float[n * 3], Part = pal,
            };
            for (int i = 0; i < n * 3; i++)
            {
                w.Positions[i] = (float)(BitConverter.ToInt16(pos, i * 2) * ps);
                w.Normals[i] = (sbyte)nrm[i] / 127f;
            }
            bool i32 = lv.Flag("idx32");
            int ni = idxB.Length / (i32 ? 4 : 2);
            w.Indices = new int[ni];
            for (int i = 0; i < ni; i++) w.Indices[i] = i32 ? BitConverter.ToInt32(idxB, i * 4) : BitConverter.ToUInt16(idxB, i * 2);
            return w;
        }

        public static WheelSet Parse(string json)
        {
            var root = MiniJson.Parse(json) as Dictionary<string, object>;
            var set = new WheelSet();
            var rf = root.Obj("ref");
            if (rf != null) { set.RefRadius = rf.Num("Rw", 0.35); set.RefWidth = rf.Num("tw", 0.24); }
            foreach (Dictionary<string, object> st in root.Arr("styles"))
            {
                var levels = new List<WheelLevel>();
                foreach (Dictionary<string, object> lv in st.Arr("levels")) levels.Add(Decode(lv));
                set.Styles.Add(new WheelStyle { Spokes = (int)st.Num("spokes"), Levels = levels.ToArray() });
            }
            return set;
        }
    }

    /// <summary>The web game's car cabins (cabin.js buildInterior: dash and dials, console, seats, bench, belts, visors,
    /// mirror), one per body in car space, and the steering wheel in its own frame (placed by each car's cabin.wheel).</summary>
    public sealed class CabinSet
    {
        public WheelLevel Steering;
        public readonly Dictionary<string, WheelLevel> Cars = new Dictionary<string, WheelLevel>();
        public static string DefaultFile(string projectRoot) => Path.Combine(projectRoot, "Data", "Vehicles", "cabins.json");
        public static CabinSet Load(string file)
        {
            var set = new CabinSet();
            if (!File.Exists(file)) return set;
            var root = MiniJson.Parse(File.ReadAllText(file)) as Dictionary<string, object>;
            if (root.Obj("steering") is Dictionary<string, object> st) set.Steering = WheelSet.Decode(st);
            if (root.Obj("cars") is Dictionary<string, object> cars)
                foreach (var kv in cars) if (kv.Value is Dictionary<string, object> c) set.Cars[kv.Key] = WheelSet.Decode(c);
            return set;
        }
    }

    public static class CarMeshBuilder
    {
        /// <summary>Levels of detail: near (finer than the browser, ~3 cm), the browser's own near level,
        /// its middle level and its far level.</summary>
        public const int Levels = 4;
        public static double CellSize(CarSpec s, int lod)
        {
            switch (lod)
            {
                case 0: return Math.Max(0.028, s.L / 175);
                case 1: return Math.Max(0.045, s.L / 110);
                case 2: return Math.Max(0.11, s.L / 60);
                default: return Math.Max(0.2, s.L / 26);
            }
        }

        public static (double[] min, double[] max) Bounds(CarSpec s) =>
            (new[] { -s.W / 2 - 0.3, 0.0, -s.L / 2 - 0.1 }, new[] { s.W / 2 + 0.3, s.Top, s.L / 2 + 0.1 });

        /// <summary>The body mesh at a level of detail, in Unity coordinates, with palette texture coordinates.</summary>
        public static CarMeshData Body(CarSpec s, int lod) => Body(s, CellSize(s, lod));

        public static CarMeshData Body(CarSpec s, double h)
        {
            var sdf = CarShape.Body(s);
            var (min, max) = Bounds(s);
            var m = SurfaceNets.Build(sdf, min, max, h);
            var P = m.Positions; var N = m.Normals; var I = m.Indices;
            // shading normals: the field's own, smoothed across gentle bends (zones still use the field's)
            var S = SmoothNormals(N, I, P.Length / 3);
            var outP = new List<float>(P.Length); var outN = new List<float>(N.Length); var outUv = new List<float>(P.Length);
            var outI = new int[I.Length];
            var remap = new Dictionary<long, int>();
            var data = new CarMeshData();
            for (int t = 0; t < I.Length; t += 3)
            {
                int a = I[t], b = I[t + 1], c = I[t + 2];
                // the zone at the triangle's centre, with its averaged normal (the shader's interpolated one)
                double cx = (P[a * 3] + P[b * 3] + P[c * 3]) / 3.0, cy = (P[a * 3 + 1] + P[b * 3 + 1] + P[c * 3 + 1]) / 3.0, cz = (P[a * 3 + 2] + P[b * 3 + 2] + P[c * 3 + 2]) / 3.0;
                double nx = N[a * 3] + N[b * 3] + N[c * 3], ny = N[a * 3 + 1] + N[b * 3 + 1] + N[c * 3 + 1], nz = N[a * 3 + 2] + N[b * 3 + 2] + N[c * 3 + 2];
                double nl = Math.Sqrt(nx * nx + ny * ny + nz * nz); if (nl > 0) { nx /= nl; ny /= nl; nz /= nl; }
                int slot = CarZones.Slot(s, cx, cy, cz, nx, ny, nz);
                data.SlotTriangles[slot]++;
                var (u, v) = CarPalette.Uv(slot);
                // mirrored x flips the winding: a, c, b
                int[] tri = { a, c, b };
                for (int k = 0; k < 3; k++)
                {
                    int vi = tri[k];
                    long key = (long)vi * 64 + slot;
                    if (!remap.TryGetValue(key, out int ni))
                    {
                        ni = outP.Count / 3; remap[key] = ni;
                        outP.Add(-P[vi * 3]); outP.Add(P[vi * 3 + 1]); outP.Add(P[vi * 3 + 2]);
                        outN.Add(-S[vi * 3]); outN.Add(S[vi * 3 + 1]); outN.Add(S[vi * 3 + 2]);
                        outUv.Add(u); outUv.Add(v);
                    }
                    outI[t + k] = ni;
                }
            }
            data.Positions = outP.ToArray(); data.Normals = outN.ToArray(); data.Uvs = outUv.ToArray(); data.Indices = outI;
            return data;
        }

        /// <summary>
        /// The body's profiles are tables joined by straight segments, so the field has faint creases
        /// every few centimetres; on glossy paint and glass they show as bands in the reflections (the
        /// browser has them too, under its flake and dirt layers). Averaging each normal with its
        /// neighbours' a few times, only across bends gentler than ~37 degrees, smooths the shading and
        /// keeps real edges. Positions don't move.
        /// </summary>
        public static float[] SmoothNormals(float[] normals, int[] indices, int vertexCount, int iterations = 3, double minCos = 0.8)
        {
            var start = new int[vertexCount + 1];
            for (int t = 0; t < indices.Length; t++) start[indices[t] + 1] += 2;
            for (int v = 0; v < vertexCount; v++) start[v + 1] += start[v];
            var fill = (int[])start.Clone();
            var nb = new int[start[vertexCount]];
            for (int t = 0; t < indices.Length; t += 3)
                for (int k = 0; k < 3; k++)
                {
                    int a = indices[t + k], b = indices[t + (k + 1) % 3];
                    nb[fill[a]++] = b; nb[fill[b]++] = a;
                }
            var cur = (float[])normals.Clone();
            var next = new float[cur.Length];
            for (int it = 0; it < iterations; it++)
            {
                for (int v = 0; v < vertexCount; v++)
                {
                    double x = cur[v * 3], y = cur[v * 3 + 1], z = cur[v * 3 + 2], sx = x, sy = y, sz = z;
                    for (int e = start[v]; e < start[v + 1]; e++)
                    {
                        int w = nb[e];
                        double nx = cur[w * 3], ny = cur[w * 3 + 1], nz = cur[w * 3 + 2];
                        if (x * nx + y * ny + z * nz < minCos) continue;
                        sx += nx; sy += ny; sz += nz; // (each shared edge counts twice: closer neighbours weigh more)
                    }
                    double l = Math.Sqrt(sx * sx + sy * sy + sz * sz); if (l == 0) l = 1;
                    next[v * 3] = (float)(sx / l); next[v * 3 + 1] = (float)(sy / l); next[v * 3 + 2] = (float)(sz / l);
                }
                var tmp = cur; cur = next; next = tmp;
            }
            // never turn a normal more than ~30 degrees from the field's (thin, sharp bits would drift)
            for (int v = 0; v < vertexCount; v++)
            {
                double ox = normals[v * 3], oy = normals[v * 3 + 1], oz = normals[v * 3 + 2];
                for (int k = 0; k < 4 && ox * cur[v * 3] + oy * cur[v * 3 + 1] + oz * cur[v * 3 + 2] < 0.866; k++)
                {
                    double x = ox + cur[v * 3], y = oy + cur[v * 3 + 1], z = oz + cur[v * 3 + 2], l = Math.Sqrt(x * x + y * y + z * z);
                    if (l < 1e-9) { x = ox; y = oy; z = oz; l = 1; }
                    cur[v * 3] = (float)(x / l); cur[v * 3 + 1] = (float)(y / l); cur[v * 3 + 2] = (float)(z / l);
                }
            }
            return cur;
        }

        /// <summary>A wheel in Unity coordinates (mirrored: the rim faces -x, the driver's side). Put it on the
        /// driver's side as it is and turn it 180 degrees about y for the other side; scale it by
        /// (width / RefWidth, radius / RefRadius, radius / RefRadius).</summary>
        public static CarMeshData Wheel(WheelLevel w, bool far)
        {
            int n = w.Positions.Length / 3;
            var d = new CarMeshData { Positions = new float[n * 3], Normals = new float[n * 3], Uvs = new float[n * 2], Indices = new int[w.Indices.Length] };
            for (int i = 0; i < n; i++)
            {
                d.Positions[i * 3] = -w.Positions[i * 3]; d.Positions[i * 3 + 1] = w.Positions[i * 3 + 1]; d.Positions[i * 3 + 2] = w.Positions[i * 3 + 2];
                d.Normals[i * 3] = -w.Normals[i * 3]; d.Normals[i * 3 + 1] = w.Normals[i * 3 + 1]; d.Normals[i * 3 + 2] = w.Normals[i * 3 + 2];
                int slot = (far ? CarZones.WheelFarFirst : CarZones.WheelFirst) + w.Part[i];
                var (u, v) = CarPalette.Uv(slot);
                d.Uvs[i * 2] = u; d.Uvs[i * 2 + 1] = v;
            }
            for (int t = 0; t < w.Indices.Length; t += 3)
            {
                d.Indices[t] = w.Indices[t]; d.Indices[t + 1] = w.Indices[t + 2]; d.Indices[t + 2] = w.Indices[t + 1];
                d.SlotTriangles[(far ? CarZones.WheelFarFirst : CarZones.WheelFirst) + w.Part[w.Indices[t]]]++;
            }
            return d;
        }

        /// <summary>Where the wheels sit on a car, Unity coordinates: front-left, front-right, rear-left, rear-right
        /// (left = the driver's side, -x), each at axle height.</summary>
        public static (double x, double y, double z)[] WheelMounts(CarSpec s)
        {
            double wx = s.W / 2 - s.Tw / 2 - 0.035;
            return new[] { (-wx, s.Rw, s.AxF), (wx, s.Rw, s.AxF), (-wx, s.Rw, s.AxR), (wx, s.Rw, s.AxR) };
        }

        /// <summary>The driver's door in Unity coordinates (just outside the body beside the seat).</summary>
        public static (double x, double y, double z) DriverDoor(CarInfo c)
        {
            var s = c.Spec;
            double z = c.Seat != null ? c.Seat[2] : (s.ZA0 + s.ZC0) / 2;
            return (-(s.W / 2 + 0.55), 0, z);
        }
    }
}
