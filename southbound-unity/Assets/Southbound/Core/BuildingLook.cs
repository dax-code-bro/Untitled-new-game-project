// What each building in Calvera is clad in: the web game gives every building a style and a colour;
// here each one also gets a photo-scanned wall (lap siding, stucco, four kinds of brick, stone,
// concrete, steel...) picked deterministically by its index, and painted walls take the building's
// own web colour while natural ones (brick, stone, weathered wood, rust) keep theirs with only a hint
// of it. Roofs get shingles, clay barrel tiles or terracotta the same way. So no two neighbours on a
// block look cloned, and the city keeps the web game's colours.
using System;

namespace Southbound.Core
{
    public readonly struct Cladding
    {
        public readonly string Wall, Top;
        /// <summary>Linear RGB multiplier for the wall texture (1,1,1 = as photographed).</summary>
        public readonly double R, G, B;
        public readonly bool Painted;
        public Cladding(string wall, string top, double r, double g, double b, bool painted) { Wall = wall; Top = top; R = r; G = g; B = b; Painted = painted; }
        public string Key => $"{Wall}_{(int)Math.Round(R * 255):x2}{(int)Math.Round(G * 255):x2}{(int)Math.Round(B * 255):x2}";
    }

    public static class BuildingLook
    {
        // (set, weight, painted): a painted set's texture is near-white and takes the building's colour
        static readonly (string set, int w, bool painted)[][] Walls =
        {
            new[] { ("Facade002", 100, false) },                                                                                   // 0 glass towers
            new[] { ("Facade012", 40, false), ("Concrete045", 25, true), ("Bricks066", 20, false), ("Concrete047A", 15, false) }, // 1 offices, stone blocks
            new[] { ("red_brick", 30, false), ("Bricks085", 20, false), ("Bricks090", 20, false), ("Bricks097", 15, false), ("Bricks059", 15, false) }, // 2 brick
            new[] { ("CorrugatedSteel005", 50, true), ("RustyCorrugatedMetalPanel01", 25, false), ("Concrete047A", 25, false) },  // 3 warehouses
            new[] { ("WoodSiding009", 35, true), ("Plaster001", 20, true), ("PaintedPlaster017", 10, true), ("weathered_plank_siding", 15, false), ("Bricks090", 12, false), ("WoodSiding011", 8, false) }, // 4 houses
            new[] { ("StuccoWall01", 35, true), ("Plaster003", 30, true), ("PaintedPlaster014", 15, true), ("Plaster001", 20, true) }, // 5 stucco shops
        };
        /// <summary>Pitched roof coverings (shingles are the Gulf Coast norm; clay and terracotta on the older and Spanish-style houses).</summary>
        public static readonly (string set, int w)[] Roofs = { ("RoofingTiles001", 45), ("RoofingTiles013A", 25), ("RoofingTiles014A", 15), ("RoofingTiles008", 15) };
        /// <summary>How light a painted set's texture is on average (its albedo), so tint x texture ~ the web colour.</summary>
        const double PaintedAlbedo = 0.78;

        static double ToLinear(double c) => c <= 0.04045 ? c / 12.92 : Math.Pow((c + 0.055) / 1.055, 2.4);

        static T Pick<T>((T item, int w)[] list, double u)
        {
            int total = 0; foreach (var x in list) total += x.w;
            double t = u * total;
            foreach (var x in list) { if ((t -= x.w) < 0) return x.item; }
            return list[list.Length - 1].item;
        }

        static double Hash(int index, int salt) => new Mulberry32((uint)(index * 2654435761u ^ (uint)(salt * 40503))).Next();

        /// <summary>The cladding of building `index` (its order in the world data) of a style and web colour (0xRRGGBB).</summary>
        public static Cladding For(int style, int color, int index)
        {
            var list = Walls[Math.Max(0, Math.Min(Walls.Length - 1, style))];
            double u = Hash(index, 7);
            int total = 0; foreach (var x in list) total += x.w;
            double t = u * total;
            var pick = list[list.Length - 1];
            foreach (var x in list) { if ((t -= x.w) < 0) { pick = x; break; } }
            double r = ToLinear(((color >> 16) & 255) / 255.0), g = ToLinear(((color >> 8) & 255) / 255.0), b = ToLinear((color & 255) / 255.0);
            double tr, tg, tb;
            if (pick.painted)
            {
                // the web colour, as paint over a near-white texture
                tr = Math.Min(1, r / PaintedAlbedo); tg = Math.Min(1, g / PaintedAlbedo); tb = Math.Min(1, b / PaintedAlbedo);
            }
            else
            {
                // keep the photographed colour; a 20% nudge toward the web colour's hue so blocks still vary
                double l = Math.Max(1e-3, (r + g + b) / 3);
                tr = 0.8 + 0.2 * Math.Min(1.4, r / l); tg = 0.8 + 0.2 * Math.Min(1.4, g / l); tb = 0.8 + 0.2 * Math.Min(1.4, b / l);
                double m = Math.Max(tr, Math.Max(tg, tb)); tr /= m; tg /= m; tb /= m;
            }
            // quantise so neighbours of one colour share a material
            tr = Math.Round(tr * 32) / 32; tg = Math.Round(tg * 32) / 32; tb = Math.Round(tb * 32) / 32;
            string top = style == 4 ? Roof(index) : style == 1 || style == 0 ? "Concrete047A" : "Gravel004";
            return new Cladding(pick.set, top, tr, tg, tb, pick.painted);
        }

        /// <summary>A pitched roof's covering by its index.</summary>
        public static string Roof(int index) => Pick(Roofs, Hash(index, 13));
    }
}
