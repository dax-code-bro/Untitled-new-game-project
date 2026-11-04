// The web game's 3D architecture pieces (src/world/facades.js): cornices,
// parapets, shopfront piers, awnings, porches, doors, roof trim, rooftop units
// and every window sill and head, exported to Data/World/calvera-facades.json.
// Each piece is a box, cylinder or cone with a position, rotation (Y, then X,
// then Z, in the web game's right-handed space), size and colour.
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;

namespace Southbound.Core
{
    public sealed class FacadeKind
    {
        public string Name, Shape;
        public float[] F;
        public int[] Colors;
        public int Stride = 9;
        public int Count => Colors.Length;

        /// <summary>A corner/vertex of piece i: local point in the unit shape (-0.5..0.5) -> web-game world space.</summary>
        public (double x, double y, double z) Point(int i, double lx, double ly, double lz)
        {
            int o = i * Stride;
            double px = F[o], py = F[o + 1], pz = F[o + 2], ry = F[o + 3], rx = F[o + 4], sx = F[o + 5], sy = F[o + 6], sz = F[o + 7], rz = Stride > 8 ? F[o + 8] : 0;
            double x = lx * sx, y = ly * sy, z = lz * sz;
            // R = Ry * Rx * Rz (right-handed), applied to the scaled point
            double c = Math.Cos(rz), s = Math.Sin(rz);
            double x1 = c * x - s * y, y1 = s * x + c * y, z1 = z;
            c = Math.Cos(rx); s = Math.Sin(rx);
            double x2 = x1, y2 = c * y1 - s * z1, z2 = s * y1 + c * z1;
            c = Math.Cos(ry); s = Math.Sin(ry);
            double x3 = c * x2 + s * z2, y3 = y2, z3 = -s * x2 + c * z2;
            return (px + x3, py + y3, pz + z3);
        }
    }

    public static class FacadeData
    {
        public static string FileIn(string folder) => Path.Combine(folder, "calvera-facades.json");

        public static List<FacadeKind> Load(string folder)
        {
            var list = new List<FacadeKind>();
            string p = FileIn(folder);
            if (!File.Exists(p)) return list;
            var j = MiniJson.Parse(File.ReadAllText(p)) as Dictionary<string, object>;
            int stride = (int)j.Num("stride", 9);
            var kinds = j.Obj("kinds");
            if (kinds == null) return list;
            foreach (var kv in kinds)
            {
                var k = (Dictionary<string, object>)kv.Value;
                list.Add(new FacadeKind
                {
                    Name = kv.Key, Shape = k.Text("shape", "box"), Stride = stride,
                    F = k.Arr("f").Select(v => (float)(double)v).ToArray(),
                    Colors = k.Arr("c").Select(v => (int)(double)v).ToArray(),
                });
            }
            return list;
        }
    }
}
