// Clothes and the barber with the web game's rules (entities/clothing.js, systems/details.js, systems/grooming.js): the
// catalogue (8 slots, 75 styles, their patterns and 50 colours, 25 frame colours for eyewear: 13,500 pieces), item keys
// as the browser writes them (slot:style:pattern:colour), names and prices (a pattern costs a little more), the outfit
// you start in, the wardrobe you own and what you're wearing (Profile "wardrobe" and "outfit"), and the barber (a cut,
// a shave, the works, the styles and the dye; hair and stubble grow a little every day: Profile "groom").
using System;
using System.Collections.Generic;
using System.Linq;

namespace Southbound.Core
{
    public sealed class Style
    {
        public string Id, Name, Desc;
        public int Price;
        /// <summary>Tops and jackets: how far the sleeve runs (1.2 full, 0.55 the elbow, 0.3 short, below 0 none) and the hem
        /// (a tucked shirt 0.16; a long coat below 0); a jacket worn open; trousers' leg (-2 full length, -0.32 shorts).</summary>
        public double Sleeve = double.NaN, Hem = double.NaN, Open, Leg = double.NaN, Rough = 0.7, Inflate;
    }

    public sealed class Slot
    {
        public string K, Label;
        public bool Frames;
        public string[] Patterns;
        public Style[] Styles;
        public int Count => Styles.Length * Patterns.Length * (Frames ? Clothing.FrameColors.Length : Clothing.Colors.Length);
    }

    public sealed class Item
    {
        public Slot Slot; public Style Style; public int Pat, Col;
        public string Pattern => Slot.Patterns[Pat];
        public (string name, int hex) Color => (Slot.Frames ? Clothing.FrameColors : Clothing.Colors)[Col];
        public string Key => Clothing.Key(Slot.K, Style.Id, Pat, Col);
    }

    public static class Clothing
    {
        public static readonly (string name, int hex)[] Colors = {("Black", 0x161616), ("Charcoal", 0x33343a), ("Slate grey", 0x5d636b), ("Heather grey", 0x9a9b9e), ("Silver", 0xc4c6c8), ("White", 0xf1f0ec), ("Cream", 0xe8dcc2), ("Khaki", 0xc3ae86), ("Tan", 0xb08d62), ("Camel", 0xa87a48), ("Brown", 0x6b4528), ("Chocolate", 0x45291a), ("Rust", 0x9a4a22), ("Brick red", 0x8e2f25), ("Red", 0xb3241f), ("Cherry", 0x8a1424), ("Burgundy", 0x5c1a24), ("Pink", 0xe5a1b0), ("Hot pink", 0xd2467a), ("Coral", 0xe9765f), ("Orange", 0xdf6a1f), ("Blaze orange", 0xff5a10), ("Mustard", 0xc9a033), ("Yellow", 0xe8cf3a), ("Lemon", 0xf1e58a), ("Olive", 0x6b6a35), ("Army green", 0x4b5530), ("Forest green", 0x24452c), ("Kelly green", 0x2f8a46), ("Mint", 0x9fd6b6), ("Teal", 0x1f6e6e), ("Turquoise", 0x3fb3b0), ("Sky blue", 0x8cbfe0), ("Light blue", 0xb6cfe6), ("Denim blue", 0x48678c), ("Royal blue", 0x2a4fa8), ("Navy", 0x1d2a44), ("Indigo", 0x2c2f5a), ("Purple", 0x5a3478), ("Lavender", 0xab97c9), ("Plum", 0x5a2d4a), ("Sand", 0xd7c49e), ("Stone", 0xa79f8f), ("Mud", 0x5e5140), ("Moss", 0x5d6b3a), ("Gulf blue", 0x2f6f9a), ("Sunset", 0xe88b4a), ("Oxblood", 0x4a1414), ("Bone", 0xddd3bd), ("Gunmetal", 0x3d4248)};
        public static readonly (string name, int hex)[] FrameColors = {("Black", 0x111111), ("Matte black", 0x262626), ("Tortoise", 0x5a3a1e), ("Honey tortoise", 0x9a6a2e), ("Gold", 0xc9a640), ("Rose gold", 0xc98f78), ("Silver", 0xbfc3c7), ("Gunmetal", 0x3d4248), ("Bronze", 0x7a5a32), ("Crystal", 0xd8dde0), ("White", 0xeeeeea), ("Red", 0xa8221c), ("Burgundy", 0x5c1a24), ("Navy", 0x1d2a44), ("Royal blue", 0x2a4fa8), ("Teal", 0x1f6e6e), ("Olive", 0x6b6a35), ("Forest green", 0x24452c), ("Brown", 0x6b4528), ("Tan", 0xb08d62), ("Pink", 0xe5a1b0), ("Orange", 0xdf6a1f), ("Yellow", 0xe8cf3a), ("Purple", 0x5a3478), ("Clear grey", 0x9a9b9e)};
        public static readonly Slot[] Slots =
        {
            new Slot { K = "top", Label = "Tops", Frames = false, Patterns = new[] { "Solid", "Striped", "Plaid", "Camo", "Faded", "Two-tone" }, Styles = new[]
            {
                new Style { Id = "tee", Name = "T-shirt", Price = 18, Sleeve = 0.3, Hem = 0.06, Desc = "Heavyweight cotton crew neck." },
                new Style { Id = "vneck", Name = "V-neck tee", Price = 20, Sleeve = 0.3, Hem = 0.06, Desc = "Soft jersey with a V neck." },
                new Style { Id = "longtee", Name = "Long-sleeve tee", Price = 24, Sleeve = 1.2, Hem = 0.06, Desc = "For mornings on the water." },
                new Style { Id = "henley", Name = "Henley", Price = 32, Sleeve = 1.2, Hem = 0.06, Desc = "Three-button placket, long sleeves." },
                new Style { Id = "tank", Name = "Tank top", Price = 14, Sleeve = -0.3, Hem = 0.06, Desc = "Gulf summer. Bare shoulders." },
                new Style { Id = "polo", Name = "Polo shirt", Price = 36, Sleeve = 0.32, Hem = 0.1, Desc = "Pique knit with a two-button placket." },
                new Style { Id = "work", Name = "Work shirt", Price = 38, Sleeve = 0.55, Hem = 0.16, Desc = "Twill, two flap pockets, sleeves rolled to the elbow. Tucked in." },
                new Style { Id = "flannel", Name = "Flannel shirt", Price = 42, Sleeve = 1.2, Hem = 0.04, Desc = "Brushed cotton, worn open at the waist." },
                new Style { Id = "western", Name = "Western shirt", Price = 58, Sleeve = 1.2, Hem = 0.16, Desc = "Pearl snaps and a pointed yoke. Tucked in." },
                new Style { Id = "dress", Name = "Dress shirt", Price = 64, Sleeve = 1.2, Hem = 0.16, Desc = "Poplin, tucked in. For court dates and funerals." },
                new Style { Id = "hoodie", Name = "Hoodie", Price = 48, Sleeve = 1.2, Hem = 0.02, Inflate = 0.006, Desc = "Fleece pullover with a kangaroo pocket." },
                new Style { Id = "sweat", Name = "Sweatshirt", Price = 40, Sleeve = 1.2, Hem = 0.04, Inflate = 0.005, Desc = "Loopback cotton crew." },
                new Style { Id = "sweater", Name = "Knit sweater", Price = 70, Sleeve = 1.2, Hem = 0.04, Inflate = 0.007, Desc = "Chunky cable knit for the two cold days a year." },
                new Style { Id = "thermal", Name = "Thermal", Price = 30, Sleeve = 1.2, Hem = 0.06, Desc = "Waffle-knit long underwear top." },
                new Style { Id = "jersey", Name = "Ball jersey", Price = 55, Sleeve = 0.34, Hem = 0.02, Desc = "Mesh jersey from a team that never made the playoffs." },
            } },
            new Slot { K = "outer", Label = "Jackets & vests", Frames = false, Patterns = new[] { "Solid", "Camo", "Plaid", "Two-tone" }, Styles = new[]
            {
                new Style { Id = "denim", Name = "Denim jacket", Price = 85, Sleeve = 1.2, Hem = 0.14, Open = 1, Rough = 0.85, Inflate = 0.01, Desc = "Trucker-style, worn open." },
                new Style { Id = "leather", Name = "Leather jacket", Price = 240, Sleeve = 1.2, Hem = 0.12, Open = 1, Rough = 0.42, Inflate = 0.012, Desc = "Cowhide. Gets better every year." },
                new Style { Id = "bomber", Name = "Bomber jacket", Price = 120, Sleeve = 1.2, Hem = 0.12, Open = 0, Rough = 0.6, Inflate = 0.016, Desc = "Nylon flight jacket, ribbed cuffs." },
                new Style { Id = "canvas", Name = "Canvas work jacket", Price = 110, Sleeve = 1.2, Hem = 0.06, Open = 1, Rough = 0.9, Inflate = 0.014, Desc = "Duck canvas chore coat." },
                new Style { Id = "wind", Name = "Windbreaker", Price = 60, Sleeve = 1.2, Hem = 0.08, Open = 0, Rough = 0.5, Inflate = 0.01, Desc = "Packs into its own pocket." },
                new Style { Id = "slicker", Name = "Rain slicker", Price = 75, Sleeve = 1.2, Hem = -0.15, Open = 0, Rough = 0.28, Inflate = 0.016, Desc = "Long, rubberised, hurricane season ready." },
                new Style { Id = "puffer", Name = "Puffer vest", Price = 90, Sleeve = -1, Hem = 0.1, Open = 0, Rough = 0.45, Inflate = 0.026, Desc = "Quilted down vest. Sleeveless." },
                new Style { Id = "huntvest", Name = "Hunting vest", Price = 45, Sleeve = -1, Hem = 0.1, Open = 1, Rough = 0.8, Inflate = 0.014, Desc = "Shell loops and a game pouch. Comes in safety orange." },
                new Style { Id = "blazer", Name = "Suit jacket", Price = 260, Sleeve = 1.2, Hem = 0.02, Open = 1, Rough = 0.7, Inflate = 0.01, Desc = "Single-breasted wool. Wear it to the bank." },
                new Style { Id = "field", Name = "Field coat", Price = 180, Sleeve = 1.2, Hem = -0.1, Open = 1, Rough = 0.85, Inflate = 0.016, Desc = "Waxed cotton, corduroy collar, long." },
            } },
            new Slot { K = "bottom", Label = "Pants & shorts", Frames = false, Patterns = new[] { "Solid", "Denim wash", "Camo", "Plaid", "Pinstripe" }, Styles = new[]
            {
                new Style { Id = "jeans", Name = "Jeans", Price = 55, Leg = -2, Desc = "Fourteen-ounce denim, straight leg." },
                new Style { Id = "workpants", Name = "Work pants", Price = 48, Leg = -2, Desc = "Double-knee duck canvas." },
                new Style { Id = "chinos", Name = "Chinos", Price = 50, Leg = -2, Desc = "Cotton twill trousers." },
                new Style { Id = "cargo", Name = "Cargo pants", Price = 52, Leg = -2, Desc = "Six pockets, all of them full." },
                new Style { Id = "joggers", Name = "Joggers", Price = 38, Leg = -2, Desc = "Fleece with ribbed ankle cuffs." },
                new Style { Id = "slacks", Name = "Dress slacks", Price = 90, Leg = -2, Desc = "Pressed wool, sharp crease." },
                new Style { Id = "overalls", Name = "Overalls", Price = 70, Leg = -2, Desc = "Bib overalls with brass buckles." },
                new Style { Id = "shorts", Name = "Shorts", Price = 30, Leg = -0.32, Desc = "Above the knee." },
                new Style { Id = "cargoshorts", Name = "Cargo shorts", Price = 34, Leg = -0.38, Desc = "Knee length, pockets for everything." },
                new Style { Id = "cutoffs", Name = "Cut-offs", Price = 22, Leg = -0.2, Desc = "Old jeans with the legs cut off. Frayed." },
            } },
            new Slot { K = "shoes", Label = "Footwear", Frames = false, Patterns = new[] { "Plain", "Two-tone" }, Styles = new[]
            {
                new Style { Id = "workboots", Name = "Work boots", Price = 140, Rough = 0.75, Desc = "Steel toe, oil resistant." },
                new Style { Id = "cowboy", Name = "Cowboy boots", Price = 220, Rough = 0.45, Desc = "Stitched shafts and a stacked heel." },
                new Style { Id = "sneakers", Name = "Sneakers", Price = 70, Rough = 0.8, Desc = "Canvas low-tops with white soles." },
                new Style { Id = "hightops", Name = "High-tops", Price = 95, Rough = 0.7, Desc = "Basketball shoes." },
                new Style { Id = "loafers", Name = "Loafers", Price = 120, Rough = 0.4, Desc = "Leather penny loafers." },
                new Style { Id = "oxfords", Name = "Dress shoes", Price = 160, Rough = 0.22, Desc = "Polished oxfords." },
                new Style { Id = "hikers", Name = "Hiking boots", Price = 130, Rough = 0.8, Desc = "Waterproof, lugged soles." },
                new Style { Id = "rubber", Name = "Rubber boots", Price = 40, Rough = 0.35, Desc = "White shrimp boots. Bayou formal." },
                new Style { Id = "slipons", Name = "Slip-ons", Price = 45, Rough = 0.8, Desc = "Canvas, no laces." },
                new Style { Id = "runners", Name = "Running shoes", Price = 110, Rough = 0.6, Desc = "Mesh trainers." },
            } },
            new Slot { K = "hat", Label = "Hats", Frames = false, Patterns = new[] { "Solid", "Camo", "Two-tone" }, Styles = new[]
            {
                new Style { Id = "cap", Name = "Ball cap", Price = 22, Desc = "Curved brim, six panels." },
                new Style { Id = "trucker", Name = "Trucker cap", Price = 18, Desc = "Foam front, mesh back." },
                new Style { Id = "cowboy", Name = "Cowboy hat", Price = 120, Desc = "Felt, cattleman crease." },
                new Style { Id = "fedora", Name = "Fedora", Price = 85, Desc = "Wool felt with a grosgrain band." },
                new Style { Id = "beanie", Name = "Beanie", Price = 16, Desc = "Ribbed knit with a cuff." },
                new Style { Id = "bucket", Name = "Bucket hat", Price = 24, Desc = "Cotton, all-round brim." },
                new Style { Id = "straw", Name = "Straw hat", Price = 30, Desc = "Wide brim for the sun." },
                new Style { Id = "flatcap", Name = "Flat cap", Price = 40, Desc = "Tweed newsboy cap." },
                new Style { Id = "boonie", Name = "Boonie hat", Price = 26, Desc = "Floppy brim, for fishing." },
                new Style { Id = "headwrap", Name = "Head bandana", Price = 10, Desc = "Tied at the back." },
            } },
            new Slot { K = "eye", Label = "Eyewear", Frames = true, Patterns = new[] { "Clear", "Smoke", "Amber", "Mirror" }, Styles = new[]
            {
                new Style { Id = "aviator", Name = "Aviators", Price = 90, Desc = "Teardrop lenses, wire frame." },
                new Style { Id = "wayfarer", Name = "Wayfarers", Price = 80, Desc = "Thick acetate frames." },
                new Style { Id = "round", Name = "Round frames", Price = 70, Desc = "Small round lenses." },
                new Style { Id = "sport", Name = "Sport wraps", Price = 110, Desc = "One curved lens. For boats." },
                new Style { Id = "readers", Name = "Reading glasses", Price = 25, Desc = "Gas station readers." },
                new Style { Id = "clubmaster", Name = "Browline", Price = 95, Desc = "Heavy brow, thin wire rims." },
                new Style { Id = "square", Name = "Square frames", Price = 75, Desc = "Bold and square." },
                new Style { Id = "cateye", Name = "Cat-eye", Price = 85, Desc = "Swept-up corners." },
                new Style { Id = "shield", Name = "Shield", Price = 100, Desc = "One flat lens, edge to edge." },
                new Style { Id = "safety", Name = "Safety glasses", Price = 12, Desc = "ANSI rated, side shields." },
            } },
            new Slot { K = "neck", Label = "Neckwear", Frames = false, Patterns = new[] { "Solid", "Patterned" }, Styles = new[]
            {
                new Style { Id = "bandana", Name = "Neck bandana", Price = 10, Desc = "Cotton square tied at the throat." },
                new Style { Id = "scarf", Name = "Scarf", Price = 35, Desc = "Wool, wrapped once." },
                new Style { Id = "tie", Name = "Necktie", Price = 45, Desc = "Silk, four-in-hand knot." },
                new Style { Id = "bowtie", Name = "Bow tie", Price = 40, Desc = "Self-tie." },
                new Style { Id = "bolo", Name = "Bolo tie", Price = 60, Desc = "Braided cord with a silver slide." },
            } },
            new Slot { K = "gloves", Label = "Gloves", Frames = false, Patterns = new[] { "Plain", "Two-tone" }, Styles = new[]
            {
                new Style { Id = "work", Name = "Work gloves", Price = 20, Rough = 0.85, Desc = "Leather palms, knit cuffs." },
                new Style { Id = "driving", Name = "Driving gloves", Price = 60, Rough = 0.4, Desc = "Thin leather, perforated." },
                new Style { Id = "fingerless", Name = "Fingerless gloves", Price = 18, Rough = 0.8, Desc = "Fingertips free for the trigger." },
                new Style { Id = "rubber", Name = "Rubber gloves", Price = 8, Rough = 0.3, Desc = "For gutting fish." },
                new Style { Id = "wool", Name = "Wool gloves", Price = 22, Rough = 0.95, Desc = "Knitted." },
            } },
        };

        public static readonly string[] Optional = { "outer", "hat", "eye", "neck", "gloves" };
        public static Slot SlotOf(string k) => Slots.FirstOrDefault(s => s.K == k);
        public static int CatalogSize => Slots.Sum(s => s.Count);

        public static string Key(string slot, string style, int pat, int col) => $"{slot}:{style}:{pat}:{col}";

        public static Item Parse(string key)
        {
            if (string.IsNullOrEmpty(key)) return null;
            var p = key.Split(':');
            if (p.Length < 4) return null;
            var s = SlotOf(p[0]); if (s == null) return null;
            var st = s.Styles.FirstOrDefault(x => x.Id == p[1]); if (st == null) return null;
            int.TryParse(p[2], out int pat); int.TryParse(p[3], out int col);
            var pal = s.Frames ? FrameColors : Colors;
            return new Item { Slot = s, Style = st, Pat = Math.Max(0, Math.Min(s.Patterns.Length - 1, pat)), Col = col >= 0 && col < pal.Length ? col : 0 };
        }

        public static string Name(string key)
        {
            var it = Parse(key); if (it == null) return "";
            if (it.Slot.Frames) return $"{it.Style.Name} · {it.Color.name} frame, {it.Pattern.ToLowerInvariant()} lens";
            return $"{it.Style.Name} · {(it.Pattern == "Solid" || it.Pattern == "Plain" ? "" : it.Pattern + ", ")}{it.Color.name}";
        }

        /// <summary>The price at a store (k: the shop's price factor; Saturdays are 20% off).</summary>
        public static int Price(string key, double k = 1)
        {
            var it = Parse(key); if (it == null) return 0;
            double[] pm = { 1, 1.15, 1.2, 1.1, 0.9, 1.1 };
            double m = it.Pat < pm.Length ? pm[it.Pat] : 1;
            return (int)Math.Max(5, JsMath.Round(it.Style.Price * m * k / 5) * 5);
        }

        static int ColorIndex(string name) => Array.FindIndex(Colors, c => c.name == name);
        public static Dictionary<string, string> DefaultOutfit() => new Dictionary<string, string>
        {
            ["top"] = Key("top", "flannel", 2, ColorIndex("Brick red")), ["outer"] = null,
            ["bottom"] = Key("bottom", "jeans", 1, ColorIndex("Indigo")), ["shoes"] = Key("shoes", "workboots", 0, ColorIndex("Brown")),
            ["hat"] = null, ["eye"] = null, ["neck"] = null, ["gloves"] = null,
        };

        // ---------------------------------------------------------------- the save
        public static List<string> Wardrobe(Profile p)
        {
            var l = p.List("wardrobe");
            if (l.Count == 0) foreach (var v in DefaultOutfit().Values) if (v != null) l.Add(v);
            return l.OfType<string>().ToList();
        }

        public static bool Owns(Profile p, string key) => Wardrobe(p).Contains(key);

        /// <summary>What you're wearing (slot -> item key or null).</summary>
        public static Dictionary<string, string> Outfit(Profile p)
        {
            var o = p.Section("outfit");
            if (o.Count == 0) foreach (var kv in DefaultOutfit()) o[kv.Key] = kv.Value;
            return o.ToDictionary(kv => kv.Key, kv => kv.Value as string);
        }

        public static void Wear(Profile p, string slot, string key)
        {
            if (key == null && !Optional.Contains(slot)) return;   // (you can't go without trousers)
            Outfit(p); p.Section("outfit")[slot] = key;
        }

        /// <summary>Buy a piece (and put it on): false if you can't afford it or already own it.</summary>
        public static bool Buy(Profile p, string key, double k = 1)
        {
            if (Owns(p, key)) { Wear(p, Parse(key).Slot.K, key); return true; }
            int price = Price(key, k);
            if (p.Money < price) return false;
            p.Money -= price;
            Wardrobe(p); p.List("wardrobe").Add(key);
            Wear(p, Parse(key).Slot.K, key);
            return true;
        }

        public static bool SaturdaySale(int day) => day % 7 == 6;

        // ---------------------------------------------------------------- the barber
        public static readonly string[] HairStyles = { "short", "buzz", "slicked", "shaved" };
        public static readonly string[] Beards = { "full", "goatee", "moustache", "stubble", "clean" };
        public static readonly Dictionary<string, int> Dyes = new Dictionary<string, int> { ["black"] = 0x141110, ["brown"] = 0x4a3020, ["grey"] = 0x9a958e, ["blond"] = 0xc9a868, ["red"] = 0x7a3418 };
        public static readonly (string id, string label, int price)[] Cuts = { ("cut", "Haircut", 25), ("shave", "Shave", 15), ("works", "The works (cut + shave)", 35) };
        /// <summary>The barbershops (web layout): Slick's in the city, the Mill Creek Barber.</summary>
        public static (double x, double z, string name)[] Barbers(MissionData L) => new[]
        {
            (L.CityX0 + 2 * L.CityPitch + 14, L.CityZ0 - 6, "Slick's Barbershop"), (L.TownX0 + L.TownPitch + 10, L.TownZ0 + L.TownNz * L.TownPitch + 4, "Mill Creek Barber"),
        };

        public static Dictionary<string, object> Groom(Profile p)
        {
            var g = p.Section("groom");
            if (!g.ContainsKey("hair")) { g["hair"] = 0.0; g["beard"] = 0.0; g["day"] = (double)p.Day; }
            if (!(g.Obj("style") is Dictionary<string, object> st)) { st = new Dictionary<string, object> { ["beard"] = "full", ["hair"] = "short", ["dye"] = null }; g["style"] = st; }
            if (st.Text("hair") == "long") st["hair"] = "short";
            return g;
        }

        /// <summary>A day or more since: hair and beard grow a day a day.</summary>
        public static void Grow(Profile p)
        {
            var g = Groom(p); double dd = Math.Max(0, p.Day - g.Num("day"));
            if (dd <= 0) return;
            g["day"] = (double)p.Day; g["hair"] = g.Num("hair") + dd; g["beard"] = g.Num("beard") + dd;
        }

        /// <summary>The barber's chair: cut, shave or the works (false if you can't pay).</summary>
        public static bool Cut(Profile p, string what)
        {
            var c = Cuts.FirstOrDefault(x => x.id == what); if (c.id == null || p.Money < c.price) return false;
            p.Money -= c.price; var g = Groom(p);
            if (what != "shave") g["hair"] = 0.0;
            if (what != "cut") g["beard"] = 0.0;
            p.AddStat("haircuts");
            return true;
        }

        public static void SetStyle(Profile p, string part, string value) { var st = Groom(p).Obj("style"); st[part] = value; }
        public static string StyleOf(Profile p, string part) => Groom(p).Obj("style").Text(part);
        /// <summary>How thick the beard is (0 clean .. 1 a week's growth).</summary>
        public static double BeardDensity(Profile p) => Math.Min(1, Groom(p).Num("beard") / 7);
    }
}
