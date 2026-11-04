// Calvera as the web game generates it, exported by
// tools/southbound/export-unity.mjs into southbound-unity/Data/World/:
//   calvera-heights.r16   terrain heights, 16-bit, (n x n), row = z, column = x
//   calvera-water.r16     lake/river water level per cell (0 = no water)
//   calvera-splat.png     ground cover: R sand, G forest, B dry grass, A paved
//   calvera-world.json    roads, buildings, roofs, every tree and bush, spawn
//
// The web game is right-handed (three.js), Unity is left-handed. Everything
// goes through ToUnity, which mirrors X; that is the same flip glTFast applies
// to models, so imported models and the world agree.
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;

namespace Southbound.Core
{
    public sealed class CalveraWorld
    {
        public sealed class Road { public string Kind; public double Width; public List<(double x, double z)> Points = new List<(double, double)>(); }
        public sealed class Building { public double X, Z, W, D, H, Y; public int Style; public int Color; }
        public sealed class Roof { public double X, Z, W, D, H, Y, Rot; public int Color; }
        public sealed class Plant { public string Kind; public double X, Y, Z, Rot, Scale; }

        public double Half, Size, Cell, HMin, HMax, WaterMin, WaterMax, SeaLevel;
        public int N;
        /// <summary>Heights in metres, web layout (index = j * N + i, x = -Half + i * Cell, z = -Half + j * Cell).</summary>
        public float[] Heights;
        /// <summary>Water surface height in metres per cell, or NaN where there is none.</summary>
        public float[] Water;
        public List<Road> Roads = new List<Road>();
        public List<Building> Buildings = new List<Building>();
        public List<Roof> Roofs = new List<Roof>();
        public List<Plant> Plants = new List<Plant>();
        public double SpawnX, SpawnY, SpawnZ, SpawnHeading;

        public static string DefaultFolder(string projectRoot) => Path.Combine(projectRoot, "Data", "World");

        public static CalveraWorld Load(string folder)
        {
            var w = new CalveraWorld();
            var j = MiniJson.Parse(File.ReadAllText(Path.Combine(folder, "calvera-world.json"))) as Dictionary<string, object>;
            var info = j.Obj("world");
            w.Half = info.Num("half"); w.Size = info.Num("size"); w.Cell = info.Num("cell"); w.N = (int)info.Num("n");
            w.HMin = info.Num("hMin"); w.HMax = info.Num("hMax"); w.WaterMin = info.Num("waterMin"); w.WaterMax = info.Num("waterMax"); w.SeaLevel = info.Num("seaLevel");
            foreach (Dictionary<string, object> r in j.Arr("roads"))
            {
                var road = new Road { Kind = r.Text("kind"), Width = r.Num("width", 8) };
                foreach (List<object> p in r.Arr("pts")) road.Points.Add(((double)p[0], (double)p[1]));
                w.Roads.Add(road);
            }
            foreach (Dictionary<string, object> b in j.Arr("buildings"))
                w.Buildings.Add(new Building { X = b.Num("x"), Z = b.Num("z"), W = b.Num("w"), D = b.Num("d"), H = b.Num("h"), Y = b.Num("y"), Style = (int)b.Num("style"), Color = (int)b.Num("color") });
            foreach (Dictionary<string, object> b in j.Arr("roofs") ?? new List<object>())
                w.Roofs.Add(new Roof { X = b.Num("x"), Z = b.Num("z"), W = b.Num("w"), D = b.Num("d"), H = b.Num("h"), Y = b.Num("y"), Rot = b.Num("rot"), Color = (int)b.Num("color") });
            foreach (List<object> p in j.Arr("veg") ?? new List<object>())
                w.Plants.Add(new Plant { Kind = (string)p[0], X = (double)p[1], Y = (double)p[2], Z = (double)p[3], Rot = (double)p[4], Scale = (double)p[5] });
            var s = j.Obj("spawn");
            if (s != null) { w.SpawnX = s.Num("x"); w.SpawnY = s.Num("y"); w.SpawnZ = s.Num("z"); w.SpawnHeading = s.Num("heading"); }

            w.Heights = ReadR16(Path.Combine(folder, "calvera-heights.r16"), w.N * w.N, out var h16);
            for (int i = 0; i < w.Heights.Length; i++) w.Heights[i] = (float)(w.HMin + h16[i] / 65535.0 * (w.HMax - w.HMin));
            string wp = Path.Combine(folder, "calvera-water.r16");
            w.Water = new float[w.N * w.N];
            if (File.Exists(wp))
            {
                ReadR16(wp, w.N * w.N, out var w16);
                for (int i = 0; i < w.Water.Length; i++) w.Water[i] = w16[i] == 0 ? float.NaN : (float)(w.WaterMin + (w16[i] - 1) / 65534.0 * (w.WaterMax - w.WaterMin));
            }
            else for (int i = 0; i < w.Water.Length; i++) w.Water[i] = float.NaN;
            return w;
        }

        static float[] ReadR16(string path, int count, out ushort[] raw)
        {
            var bytes = File.ReadAllBytes(path);
            if (bytes.Length != count * 2) throw new InvalidDataException($"{Path.GetFileName(path)}: expected {count * 2} bytes, got {bytes.Length}");
            raw = new ushort[count];
            for (int i = 0; i < count; i++) raw[i] = (ushort)(bytes[i * 2] | (bytes[i * 2 + 1] << 8));
            return new float[count];
        }

        /// <summary>Web-game coordinates -> Unity coordinates (mirror X).</summary>
        public static (double x, double z) ToUnity(double webX, double webZ) => (-webX, webZ);
        /// <summary>Web-game yaw (radians about +Y) -> Unity yaw (degrees).</summary>
        public static double YawToUnity(double webRadians) => -webRadians * 180.0 / Math.PI;

        /// <summary>Terrain height at a web-game position, bilinear like the web game's Heightmap.height().</summary>
        public double HeightAt(double x, double z)
        {
            int res = N - 1;
            double gx = JsMath.Clamp((x + Half) / Cell, 0, res - 0.001), gz = JsMath.Clamp((z + Half) / Cell, 0, res - 0.001);
            int i = (int)gx, j = (int)gz;
            double fx = gx - i, fz = gz - j;
            int k = j * N + i;
            double a = Heights[k] + (Heights[k + 1] - Heights[k]) * fx;
            double b = Heights[k + N] + (Heights[k + N + 1] - Heights[k + N]) * fx;
            return a + (b - a) * fz;
        }

        /// <summary>Heights for Unity's TerrainData.SetHeights: [row = z, column = x], 0..1, mirrored to Unity space.</summary>
        public float[,] UnityTerrainHeights()
        {
            var o = new float[N, N];
            float range = (float)(HMax - HMin);
            for (int j = 0; j < N; j++)
                for (int c = 0; c < N; c++)
                    o[j, c] = (float)((Heights[j * N + (N - 1 - c)] - HMin) / range);
            return o;
        }

        /// <summary>Index into web-layout arrays for a Unity terrain cell (row = z, column = x).</summary>
        public int WebIndexForUnityCell(int row, int col) => row * N + (N - 1 - col);

        public IEnumerable<string> PlantKinds => Plants.Select(p => p.Kind).Distinct().OrderBy(k => k);

        /// <summary>Which surface set a building style is faced with (the web game's three facade groups).</summary>
        public static string FacadeFor(int style) => style switch
        {
            0 => "Facade002",            // glass towers
            1 => "Facade012",            // offices and stone blocks
            2 => "red_brick",            // brick blocks and shops
            3 => "CorrugatedSteel005",   // warehouses and sheds
            4 => "weathered_plank_siding", // houses
            5 => "StuccoWall01",         // stucco shops and low blocks
            _ => "Concrete034",
        };

        /// <summary>Penetration surface for a building style (matches the web game's collision boxes).</summary>
        public static string SurfFor(int style) => style switch { 0 => "masonry", 1 => "masonry", 2 => "brick", 3 => "metal", 4 => "frame", 5 => "block", _ => "masonry" };

        public static string RoadSurface(string kind) => kind == "dirt" || kind == "track" ? "Gravel004" : kind == "highway" ? "asphalt_02" : "Asphalt012";
    }
}
