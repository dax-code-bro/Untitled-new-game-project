// Shops, from the web game: the walk-in buildings the street export carries (Data/World/calvera-shops.json:
// who keeps each, where the keeper stands, where the door is, the price factor), the opening hours
// (world/storefronts.js SHOP_HOURS), the Gulf Mart menu (systems/shops.js FOOD), the ammunition boxes
// (entities/arsenal.js CALIBERS) and the rules that go with them (what a gun costs at a given shop, how
// much eating feeds you, where the fuel pump stands in front of a Gulf Mart).
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;

namespace Southbound.Core
{
    public sealed class ShopInfo
    {
        public string Id, Kind, Name, Keeper, Blurb, Look, Hours;
        public double PriceK = 1;
        public string[] Lines = new string[0];
        /// <summary>Web-game coordinates: where the keeper stands (x, y, z), the building's facing (radians), the door (x, z), its origin.</summary>
        public double KeeperX, KeeperY, KeeperZ, Face, DoorX, DoorZ, X, Z, Y;
        public bool Sells => Kind == "guns" || Kind == "mart" || Kind == "clothes";

        /// <summary>Across the counter from the keeper, where you stand to be served (the web game's L(0, -D/2 + 3.6)).</summary>
        public (double x, double z) Counter
        {
            get
            {
                double fx = Math.Sin(Face), fz = Math.Cos(Face);   // the shop's front, out toward the road
                return (KeeperX + fx * 1.9, KeeperZ + fz * 1.9);
            }
        }

        /// <summary>A Gulf Mart's fuel pump, out on the forecourt (web: the counter plus 11 m toward the road).</summary>
        public (double x, double z) Pump { get { var (cx, cz) = Counter; return (cx + Math.Sin(Face) * 11, cz + Math.Cos(Face) * 11); } }
    }

    public sealed class Food
    {
        public string Id, Name, Desc; public int Price, Heal, Steady;
        /// <summary>How much it fills you (Needs.Feed): drinks a little, a first aid kit nothing, food 90% of what it heals.</summary>
        public double Feeds => Id == "water" || Id == "tea" || Id == "coffee" || Id == "energy" ? 4 : Id == "firstaid" ? 0 : Heal * 0.9;
    }

    public sealed class AmmoBox { public string Caliber, Unit, Guns; public int Box, Price, Cap; }

    public static class ShopCatalog
    {
        public static string DefaultFile(string projectRoot) => Path.Combine(projectRoot, "Data", "World", "calvera-shops.json");

        public static List<ShopInfo> Load(string file)
        {
            var list = new List<ShopInfo>();
            if (!File.Exists(file)) return list;
            var root = MiniJson.Parse(File.ReadAllText(file)) as Dictionary<string, object>;
            foreach (Dictionary<string, object> s in root.Arr("shops") ?? new List<object>())
            {
                var k = s.Arr("keeperAt"); var d = s.Arr("door"); var at = s.Arr("at");
                list.Add(new ShopInfo
                {
                    Id = s.Text("id"), Kind = s.Text("kind"), Name = s.Text("name"), Keeper = s.Text("keeper"), Blurb = s.Text("blurb"),
                    Look = s.Text("look"), Hours = s.Text("hours"), PriceK = s.Num("priceK", 1),
                    Lines = (s.Arr("lines") ?? new List<object>()).Select(o => o as string ?? "").ToArray(),
                    KeeperX = (double)k[0], KeeperY = (double)k[1], KeeperZ = (double)k[2], Face = s.Num("face"),
                    DoorX = (double)d[0], DoorZ = (double)d[1], X = at != null ? (double)at[0] : 0, Z = at != null ? (double)at[1] : 0, Y = s.Num("y"),
                });
            }
            return list;
        }

        // ------------------------------------------------------------------ opening hours (24 h clock); Gulf Marts never close
        public static readonly Dictionary<string, int[]> Hours = new Dictionary<string, int[]>
        {
            ["city"] = new[] { 9, 19 }, ["town"] = new[] { 6, 18 }, ["bayou"] = new[] { 5, 19 }, ["c-city"] = new[] { 10, 21 }, ["c-town"] = new[] { 8, 18 },
            ["c-bayou"] = new[] { 6, 19 }, ["a-city"] = new[] { 9, 19 }, ["a-town"] = new[] { 9, 17 }, ["auction"] = new[] { 9, 19 },
        };

        public static bool Open(string id, double hour) => id == null || !Hours.TryGetValue(id, out var h) || (hour >= h[0] && hour < h[1]);

        static string AmPm(int h) => h == 12 ? "12 PM" : h > 12 ? $"{h - 12} PM" : $"{h} AM";

        public static string ClosedText(string name, string id) { var h = id != null && Hours.TryGetValue(id, out var x) ? x : new[] { 9, 19 }; return $"{name} is closed. Open {AmPm(h[0])} – {AmPm(h[1])}."; }

        // ------------------------------------------------------------------ the Gulf Mart menu
        public static readonly Food[] Menu =
        {
            new Food { Id = "poboy", Name = "Shrimp po'boy", Price = 9, Heal = 45, Desc = "Fried shrimp, dressed, on French bread." },
            new Food { Id = "boudin", Name = "Boudin link", Price = 4, Heal = 20, Desc = "Pork and rice sausage, still hot." },
            new Food { Id = "etouffee", Name = "Crawfish étouffée", Price = 12, Heal = 55, Desc = "Over rice, in a foam box." },
            new Food { Id = "gumbo", Name = "Cup of gumbo", Price = 7, Heal = 35, Desc = "Chicken and sausage, dark roux." },
            new Food { Id = "catfish", Name = "Fried catfish plate", Price = 11, Heal = 50, Desc = "With fries and hush puppies." },
            new Food { Id = "jerky", Name = "Beef jerky", Price = 5, Heal = 15, Desc = "Keeps forever in the truck." },
            new Food { Id = "beans", Name = "Can of red beans", Price = 2, Heal = 18, Desc = "Eat it cold if you have to." },
            new Food { Id = "pralines", Name = "Pralines", Price = 3, Heal = 8, Desc = "Pecan candy. Pure sugar." },
            new Food { Id = "coffee", Name = "Black coffee", Price = 2, Heal = 5, Steady = 180, Desc = "Steadier hands for three minutes (less scope sway)." },
            new Food { Id = "energy", Name = "Energy drink", Price = 3, Heal = 5, Steady = 90, Desc = "Jittery focus. Steadier aim for a minute and a half." },
            new Food { Id = "tea", Name = "Sweet tea", Price = 2, Heal = 6, Desc = "A gallon of sugar water. Perfect." },
            new Food { Id = "water", Name = "Bottled water", Price = 1, Heal = 5, Desc = "For the heat." },
            new Food { Id = "firstaid", Name = "First aid kit", Price = 45, Heal = 70, Desc = "Gauze, tape, antiseptic." },
        };

        // ------------------------------------------------------------------ ammunition, by the box
        public static readonly AmmoBox[] Ammo =
        {
            new AmmoBox { Caliber = "9mm", Box = 50, Price = 30, Guns = "Service and compact pistols, machine pistols" },
            new AmmoBox { Caliber = ".357 Magnum", Box = 50, Price = 45, Guns = "Revolvers" },
            new AmmoBox { Caliber = ".38 Special", Box = 50, Price = 35, Guns = "Target pistols" },
            new AmmoBox { Caliber = "4.6×30mm", Box = 50, Price = 50, Guns = "Personal defence weapons" },
            new AmmoBox { Caliber = "5.56 NATO", Box = 60, Price = 55, Guns = "Carbines and bullpup rifles" },
            new AmmoBox { Caliber = "7.62 NATO", Box = 40, Price = 60, Guns = "Battle rifles and marksman rifles" },
            new AmmoBox { Caliber = "12 gauge", Box = 25, Price = 30, Guns = "Shotguns" },
            new AmmoBox { Caliber = ".308 Winchester", Box = 20, Price = 45, Guns = "Bolt-action and semi-auto hunting rifles" },
            new AmmoBox { Caliber = ".338 Lapua", Box = 10, Price = 70, Guns = "Heavy sniper rifles" },
            new AmmoBox { Caliber = ".30-30", Box = 20, Price = 35, Guns = "Lever-action rifles" },
            new AmmoBox { Caliber = "84mm rocket", Box = 1, Price = 900, Cap = 50, Unit = "rocket", Guns = "Rocket launchers" },
            new AmmoBox { Caliber = "40mm grenade", Box = 6, Price = 1200, Cap = 50, Unit = "grenade", Guns = "Grenade launchers" },
            new AmmoBox { Caliber = "Arrow", Box = 6, Price = 40, Cap = 20, Unit = "arrow", Guns = "Bows" },
        };

        public static AmmoBox BoxFor(string caliber) => Ammo.FirstOrDefault(a => a.Caliber == caliber);
        /// <summary>The most of a caliber you may carry: 500 rounds, 50 rockets or grenades, 20 arrows.</summary>
        public static int Cap(string caliber) { var b = BoxFor(caliber); return b != null && b.Cap > 0 ? b.Cap : 500; }

        /// <summary>A gun's price at a shop (its price factor: city dearer, the bayou cheaper).</summary>
        public static int Price(int basePrice, double priceK) => (int)Math.Round(basePrice * priceK, MidpointRounding.AwayFromZero);
    }
}
