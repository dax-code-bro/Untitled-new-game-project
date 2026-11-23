// Property with the web game's rules (systems/estate.js, systems/propertyplus.js): a door on every building (the side
// facing its nearest road), 198 properties for sale (and 48 more homes in the outer neighbourhoods) with the browser's
// ids, prices and addresses (its dice, so a web save's properties are the same buildings), what each building is inside
// (home, apartment, store, bar, office, warehouse) and when its door is open, business income, rent from homes you
// don't live in, daily tax and upkeep, the market drifting by type, break-ins (an alarm stops them), upgrades (alarm,
// solar panels, renovation), selling at the realtor for today's value less 6%, and sleeping at home.
using System;
using System.Collections.Generic;
using System.Linq;

namespace Southbound.Core
{
    public sealed class Door { public int I; public CalveraWorld.Building B; public double X, Z, Nx, Nz; }

    public sealed class Property
    {
        public string Id, Type, Name, Region;
        public int Price;
        public Door Door;
        public double Area => Door.B.W * Door.B.D;
    }

    public static class Estate
    {
        static readonly string[] Streets = { "Bayou Ave", "Magnolia St", "Pelican Way", "Cypress Ln", "Harbor Blvd", "Gulf St", "Live Oak Dr", "Calvera Ave", "Sabine St", "Pecan Ct", "Mockingbird Ln", "Levee Rd", "Cotton Row", "Shrimp Dock Rd", "Heron Pl", "Mission St" };
        static readonly Dictionary<int, string> Types = new Dictionary<int, string> { [4] = "House", [2] = "Apartment", [5] = "Storefront", [3] = "Warehouse", [1] = "Office", [0] = "Penthouse" };
        /// <summary>Businesses pay a share of their price every game day.</summary>
        public static readonly Dictionary<string, double> Income = new Dictionary<string, double> { ["Storefront"] = 0.012, ["Warehouse"] = 0.01, ["Office"] = 0.009 };
        /// <summary>Homes you don't live in are let out: a share of their worth every day.</summary>
        public static readonly Dictionary<string, double> Rent = new Dictionary<string, double> { ["House"] = 0.004, ["Apartment"] = 0.005, ["Penthouse"] = 0.0045 };

        static Func<double> Rng(long seed) { var m = new Mulberry32((uint)seed); return m.Next; }

        /// <summary>The nearest point on any road (the web game's nearestRoad over the road graph).</summary>
        public static (double x, double z, double dist)? NearestRoad(CalveraWorld w, double x, double z)
        {
            (double, double, double)? best = null; double bd = double.MaxValue;
            foreach (var r in w.Roads)
                for (int i = 1; i < r.Points.Count; i++)
                {
                    var (ax, az) = r.Points[i - 1]; var (bx, bz) = r.Points[i];
                    double dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz; if (L2 == 0) L2 = 1;
                    double t = Math.Max(0, Math.Min(1, ((x - ax) * dx + (z - az) * dz) / L2));
                    double px = ax + dx * t, pz = az + dz * t, d = (px - x) * (px - x) + (pz - z) * (pz - z);
                    if (d < bd) { bd = d; best = (px, pz, Math.Sqrt(d)); }
                }
            return best;
        }

        /// <summary>A door on every building: on the wall facing its nearest road, 0.9 m out.</summary>
        public static List<Door> Doors(CalveraWorld w)
        {
            var o = new List<Door>();
            for (int i = 0; i < w.Buildings.Count; i++)
            {
                var b = w.Buildings[i];
                double nx = 0, nz = 1;
                var r = NearestRoad(w, b.X, b.Z);
                if (r is (double rx, double rz, double _))
                {
                    double dx = rx - b.X, dz = rz - b.Z;
                    if (Math.Abs(dx) / b.W > Math.Abs(dz) / b.D) nx = Math.Sign(dx); else { nx = 0; nz = Math.Sign(dz); if (nz == 0) nz = 1; }
                    if (nx != 0) nz = 0;
                }
                o.Add(new Door { I = i, B = b, Nx = nx, Nz = nz, X = b.X + nx * (b.W / 2 + 0.9), Z = b.Z + nz * (b.D / 2 + 0.9) });
            }
            return o;
        }

        /// <summary>The properties, in the browser's order (the original 198 first: their ids are in saves).</summary>
        public static List<Property> Properties(List<Door> doors, MissionData L)
        {
            int[] order = { 4, 2, 5, 3, 1, 0 };
            var props = new List<Property>(); var seen = new HashSet<int>();
            const int MAX = 198 + 48;
            foreach (bool extra in new[] { false, true })
                foreach (int st in order)
                    foreach (var d in doors)
                    {
                        if (props.Count >= (extra ? MAX : 198)) break;
                        if (d.B.Extra != extra || d.B.Style != st || seen.Contains(d.I)) continue;
                        seen.Add(d.I);
                        var r = Rng(d.I * 977 + 13);
                        string type = Types.TryGetValue(st, out var tt) ? tt : "House";
                        bool inCity = d.B.X > L.CityX0 - 40 && d.B.X < L.CityX0 + L.CityNx * L.CityPitch + 40 && d.B.Z > L.CityZ0 - 40;
                        bool downtown = Math.Sqrt((d.B.X - L.DowntownX) * (d.B.X - L.DowntownX) + (d.B.Z - L.DowntownZ) * (d.B.Z - L.DowntownZ)) < 220;
                        double area = d.B.W * d.B.D * Math.Max(1, Math.Min(d.B.H / 3.2, type == "Penthouse" ? 1 : 4));
                        double bas = type switch { "House" => 1400, "Apartment" => 2100, "Storefront" => 1700, "Warehouse" => 650, "Office" => 2600, "Penthouse" => 9000, _ => 1500 };
                        double price = JsMath.Round(area * bas * (inCity ? 1.2 : 0.75) * (downtown ? 1.6 : 1) * (0.85 + r() * 0.3) / 1000) * 1000;
                        string name;
                        if (type == "House" && Math.Sqrt((d.B.X - L.LakeX) * (d.B.X - L.LakeX) + (d.B.Z - L.LakeZ) * (d.B.Z - L.LakeZ)) < L.LakeR * 1.6)
                            name = "Lake Arden " + new[] { "Cabin", "Cottage", "Lodge" }[props.Count % 3];
                        else
                        {
                            int num = 100 + (int)Math.Floor(r() * 4800); string street = Streets[(int)Math.Floor(r() * Streets.Length)];
                            name = $"{num} {street}" + (type == "Apartment" ? $" · Apt {1 + (int)Math.Floor(r() * 30)}" : "");
                        }
                        string region = inCity ? "Port Calvera" : d.B.Extra ? "Calvera outskirts" : d.B.X < L.TownX0 + 400 && d.B.X > L.TownX0 - 200 ? "Mill Creek" : "Countryside";
                        props.Add(new Property { Id = $"prop_{props.Count + 1:000}", Door = d, Type = type, Name = name, Price = (int)Math.Max(price, 18000), Region = region });
                    }
            return props;
        }

        /// <summary>What a building is inside (the browser's dice): home, apartment, store, bar, office, warehouse.</summary>
        public static string Kind(Door d)
        {
            var r = Rng(d.I * 31 + 7); double a = r(), c = r();
            return d.B.Style switch { 4 => "home", 2 => a < 0.5 ? "home" : "apartment", 5 => c < 0.35 ? "bar" : "store", 3 => "warehouse", 1 => "office", 0 => "office", _ => "home" };
        }

        /// <summary>Is the door open now? Owned: always; for sale: viewings 9 to 5; shops, bars and offices keep hours; most homes are locked.</summary>
        public static bool Open(Door d, double hour, bool owned, bool forSale)
        {
            if (owned) return true;
            string k = Kind(d); double dice = Rng(d.I * 131 + 3)();
            if (forSale && hour >= 9 && hour < 17) return true;
            if (k == "store") return hour >= 7 && hour < 23;
            if (k == "bar") return hour >= 11 || hour < 2;
            if (k == "office") return hour >= 8 && hour < 18;
            return dice >= 0.7;   // homes and warehouses: three in ten are left open
        }

        /// <summary>Is someone home (the browser's fallback without the residents' days)?</summary>
        public static bool SomeoneHome(Door d, double hour, int day) { bool night = hour < 7 || hour > 19; return Rng(d.I * 71 + day)() < (night ? 0.8 : 0.4); }

        /// <summary>The realtor: on the first storefront within 200 m of the city's west side (Gulf Coast Realty).</summary>
        public static Door RealtorDoor(List<Door> doors, MissionData L) =>
            doors.FirstOrDefault(d => d.B.Style == 5 && Math.Sqrt((d.X - (L.CityX0 + 60)) * (d.X - (L.CityX0 + 60)) + (d.Z - (L.CityZ0 + 3 * L.CityPitch)) * (d.Z - (L.CityZ0 + 3 * L.CityPitch))) < 200) ?? doors[0];

        // ---------------------------------------------------------------- owning it (the save: properties, home, propUp, market)
        public static bool Owned(Profile p, Property x) => p.Properties.Contains(x.Id);
        public static Dictionary<string, object> Ups(Profile p, Property x) { var u = p.Section("propUp"); if (!(u.Obj(x.Id) is Dictionary<string, object> d)) { d = new Dictionary<string, object>(); u[x.Id] = d; } return d; }
        public static double Market(Profile p, string type) => p.Section("market").TryGetValue(type, out var v) && v is double d ? d : 1;
        public static double Worth(Profile p, Property x) => Math.Round(x.Price * Market(p, x.Type) * (Ups(p, x).Flag("reno") ? 1.15 : 1));
        public static double RentOf(Profile p, Property x) => Rent.TryGetValue(x.Type, out var k) && p.Home != x.Id ? Math.Round(Worth(p, x) * k * (Ups(p, x).Flag("reno") ? 1.15 : 1)) : 0;
        public static double SalePrice(Profile p, Property x) => Math.Round(Worth(p, x) * 0.94);

        public sealed class Upgrade { public string Key, Name, Sub; public Func<Property, int> Cost; }
        public static readonly Upgrade[] Upgrades =
        {
            new Upgrade { Key = "alarm", Name = "Security alarm", Sub = "Burglars set it off and the police come. Nothing taken.", Cost = x => 800 },
            new Upgrade { Key = "solar", Name = "Solar panels", Sub = "Cuts the daily upkeep by two thirds.", Cost = x => (int)JsMath.Round(1200 + x.Price * 0.02) },
            new Upgrade { Key = "reno", Name = "Renovation", Sub = "Kitchen, bathroom, floors and paint: +15% value and rent.", Cost = x => (int)JsMath.Round(x.Price * 0.1) },
        };

        public static bool Buy(Profile p, Property x)
        {
            if (Owned(p, x) || p.Money < x.Price) return false;
            p.Money -= x.Price; p.Properties.Add(x.Id); if (p.Home == null) p.Home = x.Id;
            return true;
        }

        public static double Sell(Profile p, Property x)
        {
            if (!Owned(p, x) || p.Home == x.Id) return 0;
            double v = SalePrice(p, x);
            p.Properties.Remove(x.Id); p.Section("propUp").Remove(x.Id); p.Money += v;
            return v;
        }

        /// <summary>Pay from the bank if it can, else cash: "bank", "cash" or "short".</summary>
        static string Pay(Profile p, double n) { if (p.Bank >= n) { p.Bank -= n; return "bank"; } double cash = Math.Min(p.Money, n); p.Money -= cash; return cash < n ? "short" : "cash"; }

        /// <summary>A new day's accounts: the market drifts, businesses pay, rent comes in, tax goes out, maybe a break-in.
        /// Returns the texts to send (from, body) and the news.</summary>
        public static (List<(string from, string body)> texts, List<string> news) Settle(Profile p, List<Property> props, Random rnd, Property standingIn = null)
        {
            var texts = new List<(string, string)>(); var news = new List<string>();
            var mk = p.Section("market");
            foreach (var type in props.Select(x => x.Type).Distinct()) { double m = Market(p, type); mk[type] = Math.Max(0.75, Math.Min(1.35, m + (rnd.NextDouble() - 0.5) * 0.04 + (1 - m) * 0.05)); }
            var mine = props.Where(x => Owned(p, x)).ToList();
            if (mine.Count == 0) return (texts, news);
            double income = mine.Sum(x => Income.TryGetValue(x.Type, out var k) ? Math.Round(x.Price * k) : 0);
            if (income > 0) p.Money += income;
            double rent = mine.Sum(x => RentOf(p, x));
            double tax = mine.Sum(x => Math.Round(Worth(p, x) * 0.0009 * (Ups(p, x).Flag("solar") ? 0.33 : 1)));
            if (rent > 0) p.Money += rent;
            string how = Pay(p, tax);
            texts.Add(("Calvera County", $"Daily property tax and upkeep: ${tax:N0}" + (how == "bank" ? " (paid from your bank)" : how == "short" ? " — you were short; pay it off soon" : "") + "." + (rent > 0 ? $" Rent received: ${rent:N0}." : "") + (income > 0 ? $" Business income: ${income:N0}." : "")));
            foreach (var x in mine)
            {
                if (rnd.NextDouble() > 0.06 || x == standingIn) continue;
                if (Ups(p, x).Flag("alarm")) { texts.Add(("Bayou Security", $"Alarm at {x.Name}. Police attended; nothing taken.")); continue; }
                double loss = Math.Min(Math.Round(150 + Worth(p, x) * 0.004), 2500);
                Pay(p, loss);
                texts.Add(("Calvera PD", $"Burglary reported at your property, {x.Name}. Estimated loss ${loss:N0}. An alarm would have helped."));
                news.Add($"Break-in on {x.Name.Split(',')[0]}. Police ask neighbours to report anything suspicious.");
                break;
            }
            return (texts, news);
        }
    }
}
