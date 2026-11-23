// Fishing with the web game's rules (systems/fishing.js): what lives in the lake, the rivers, the bayou and the Gulf
// (weight ranges, price a pound, how common), one legendary fish in each, the size limit, how long a bite takes (the
// hour, the weather, the rod, a fish finder, your experience), the bite window, the fight (hold to reel: progress and
// tension; let go before the line snaps), and the catch: kept on ice (Profile "fish"), logged with your records,
// half price at the market once it's two days old. Also Calvera's named regions (world/layout.js REGIONS).
using System;
using System.Collections.Generic;
using System.Linq;

namespace Southbound.Core
{
    public sealed class FishSpecies { public string Name; public double MinLb, MaxLb, Price, Rarity; public double KeepMin => MinLb + (MaxLb - MinLb) * 0.1; }
    public sealed class LegendFish { public string Id, Name; public double MinLb, MaxLb, Price, Fight; }

    public static class Regions
    {
        /// <summary>The named region at a web-map point (first hit wins, as in the browser; the river valley isn't told apart).</summary>
        public static string At(double x, double z, MissionData L)
        {
            if (x > L.CityX0 - 40 && x < L.CityX0 + L.CityNx * L.CityPitch + 40 && z > L.CityZ0 - 40 && z < Harbours.CoastZ(x)) return "Port Calvera";
            if (Hyp(x - (L.TownX0 + 144), z - (L.TownZ0 + 108)) < 260) return "Mill Creek";
            if (Hyp(x - L.LakeX, z - L.LakeZ) < L.LakeR * 1.5) return "Lake Arden";
            if (Hyp(x - L.BayouX, z - L.BayouZ) < L.BayouR) return "Bayou Verde";
            if (z > Harbours.CoastZ(x) - 120) return "Gulf Shore";
            if (Hyp(x - L.ForestX, z - L.ForestZ) < L.ForestR) return "Pinewood Hollow";
            if (x > L.AirfieldX0 - 80 && x < L.AirfieldX1 + 80 && Math.Abs(z - L.AirfieldZ) < 150) return "Redgrass Airfield";
            if (Hyp(x - L.PlainsX, z - L.PlainsZ) < L.PlainsR) return "Redgrass Plains";
            if (z < -1500) return "Sierra Norte";
            double dx = Math.Max(Math.Max(L.CityX0 - x, 0), x - L.CityX0 - L.CityNx * L.CityPitch), dz = Math.Max(Math.Max(L.CityZ0 - z, 0), z - L.CityZ0 - L.CityNz * L.CityPitch);
            if (Hyp(dx, dz) < 430) return "Calvera Outskirts";
            return "Calvera County";
        }
        static double Hyp(double a, double b) => Math.Sqrt(a * a + b * b);
    }

    public static class Fishing
    {
        static FishSpecies F(string n, double a, double b, double p, double r) => new FishSpecies { Name = n, MinLb = a, MaxLb = b, Price = p, Rarity = r };
        public static readonly Dictionary<string, FishSpecies[]> Waters = new Dictionary<string, FishSpecies[]>
        {
            ["lake"] = new[] { F("Largemouth bass", 1, 9, 6, 1), F("Bluegill", 0.2, 1.2, 4, 1.4), F("Crappie", 0.4, 2.5, 5, 1.1), F("Channel catfish", 2, 20, 3, 0.9), F("Longnose gar", 3, 25, 2, 0.5), F("Striped bass", 4, 30, 5, 0.25) },
            ["river"] = new[] { F("Channel catfish", 2, 25, 3, 1), F("Blue catfish", 5, 60, 3, 0.35), F("Spotted bass", 1, 5, 6, 0.9), F("Freshwater drum", 1, 10, 2, 0.8), F("Alligator gar", 20, 140, 2, 0.08) },
            ["bayou"] = new[] { F("Bowfin", 2, 12, 2, 1), F("Spotted gar", 1, 8, 2, 1), F("Flathead catfish", 4, 50, 3, 0.6), F("Redear sunfish", 0.3, 2, 5, 1.1), F("Alligator gar", 20, 160, 2, 0.12) },
            ["ocean"] = new[] { F("Redfish", 3, 30, 8, 1), F("Speckled trout", 1, 8, 9, 1), F("Flounder", 1, 10, 10, 0.7), F("Sheepshead", 1, 12, 6, 0.8), F("Red snapper", 4, 35, 12, 0.4), F("Tarpon", 30, 200, 4, 0.08), F("Bull shark", 80, 400, 3, 0.04) },
        };
        public static readonly Dictionary<string, LegendFish> Legends = new Dictionary<string, LegendFish>
        {
            ["lake"] = new LegendFish { Id = "mossback", Name = "Old Mossback (largemouth bass)", MinLb = 14, MaxLb = 17, Price = 40, Fight = 2.6 },
            ["river"] = new LegendFish { Id = "ferryman", Name = "The Ferryman (blue catfish)", MinLb = 95, MaxLb = 120, Price = 9, Fight = 3.4 },
            ["bayou"] = new LegendFish { Id = "gatorjaw", Name = "Gator Jaw (alligator gar)", MinLb = 180, MaxLb = 230, Price = 6, Fight = 3.6 },
            ["ocean"] = new LegendFish { Id = "silverking", Name = "The Silver King (tarpon)", MinLb = 240, MaxLb = 280, Price = 6, Fight = 3.8 },
        };
        public static int SpeciesCount => Waters.Values.SelectMany(w => w).Select(f => f.Name).Distinct().Count();

        /// <summary>What kind of water this is: lake, bayou, ocean or river.</summary>
        public static string WaterKind(double x, double z, MissionData L, ICraftGround g)
        {
            if (Math.Sqrt((x - L.LakeX) * (x - L.LakeX) + (z - L.LakeZ) * (z - L.LakeZ)) < L.LakeR * 1.3) return "lake";
            if (Math.Sqrt((x - L.BayouX) * (x - L.BayouX) + (z - L.BayouZ) * (z - L.BayouZ)) < L.BayouR) return "bayou";
            if (Regions.At(x, z, L) == "Gulf Shore" || g.Water(x, z) < 0.5) return "ocean";
            return "river";
        }

        /// <summary>How long a bite takes, as a multiplier: dawn and dusk are best, midday slow, rain and overcast help, a storm doesn't; experience shaves it.</summary>
        public static double BiteMul(double hour, double rain, string weather, string kind, double fishCaught)
        {
            double h = hour;
            double m = (h > 5 && h < 8.5) || (h > 17.5 && h < 20.5) ? 0.6 : h > 11 && h < 15 ? 1.3 : h < 5 || h > 21 ? (kind == "ocean" ? 1.1 : 0.85) : 1;
            if (rain > 0.2 || weather == "overcast") m *= 0.75;
            if (weather == "storm") m *= 1.4;
            return m * Math.Max(0.7, 1 - fishCaught * 0.002);
        }

        static bool Golden(double h) => (h > 5 && h < 8.5) || (h > 17.5 && h < 20.5);

        /// <summary>A fish on the line: what it is, how heavy, what it's worth a pound, the size limit, how hard it fights.</summary>
        public sealed class Hooked { public string Name, Legend; public double Lb, Price, Min, Fight; }

        /// <summary>What takes the bait (the browser's draw, including its weighting quirk), and now and then the legend.</summary>
        public static Hooked Hook(string kind, double rod, double hour, ICollection<string> legendsCaught, Random rnd)
        {
            var pool = Waters[kind];
            double total = pool.Sum(f => f.Rarity * (1 + rod * 0.02));
            double r = rnd.NextDouble() * total; var pick = pool[0];
            foreach (var x in pool) if ((r -= x.Rarity) <= 0) { pick = x; break; }
            double lb = pick.MinLb + (pick.MaxLb - pick.MinLb) * Math.Pow(rnd.NextDouble(), 2.2 - Math.Min(rod, 15) * 0.05);
            var h = new Hooked { Name = pick.Name, Lb = lb, Price = pick.Price, Min = pick.KeepMin, Fight = 0.5 + Math.Min(lb / 60, 2.5) };
            var L = Legends[kind];
            if (!legendsCaught.Contains(L.Id) && rod >= 4 && rnd.NextDouble() < 0.015 * (Golden(hour) ? 2.5 : 1))
                h = new Hooked { Name = L.Name, Lb = L.MinLb + rnd.NextDouble() * (L.MaxLb - L.MinLb), Price = L.Price, Legend = L.Id, Min = 0, Fight = L.Fight };
            return h;
        }
    }

    /// <summary>One cast: wait, the bite, the fight. Update with whether the reel is held; it ends Caught, Snapped or GotAway.</summary>
    public sealed class FishingLine
    {
        public enum Phase { Wait, Bite, Reel, Caught, Snapped, GotAway }
        public Phase State { get; private set; } = Phase.Wait;
        public readonly string Kind;
        public double T, Progress, Tension;
        public Fishing.Hooked Fish { get; private set; }
        readonly double rod, hour; readonly ICollection<string> legends; readonly Random rnd;
        public bool Over => State == Phase.Caught || State == Phase.Snapped || State == Phase.GotAway;

        /// <param name="biteMul">Fishing.BiteMul for the hour and weather.</param>
        public FishingLine(string kind, double rod, bool finder, double biteMul, double hour, ICollection<string> legendsCaught, Random rnd)
        {
            Kind = kind; this.rod = rod; this.hour = hour; legends = legendsCaught; this.rnd = rnd;
            T = (6 + rnd.NextDouble() * 14) / (1 + rod * 0.05) / (finder ? 1.5 : 1) * biteMul;
        }

        /// <param name="strike">The key pressed this frame (strike on the bite).</param>
        /// <param name="held">The reel held.</param>
        public void Update(double dt, bool strike, bool held)
        {
            if (Over) return;
            T -= dt;
            switch (State)
            {
                case Phase.Wait: if (T <= 0) { State = Phase.Bite; T = 1.6; } return;
                case Phase.Bite:
                    if (strike || held) { Fish = Fishing.Hook(Kind, rod, hour, legends, rnd); State = Phase.Reel; return; }
                    if (T <= 0) State = Phase.GotAway;
                    return;
                case Phase.Reel:
                    double strong = Fish.Fight / (1 + rod * 0.12);
                    if (held) { Progress += dt * 0.22 / strong; Tension += dt * (0.35 + rnd.NextDouble() * 0.5) * strong; }
                    else { Tension = Math.Max(0, Tension - dt * 0.6); Progress = Math.Max(0, Progress - dt * 0.03 * strong); }
                    if (Tension >= 1) State = Phase.Snapped;
                    else if (Progress >= 1) State = Phase.Caught;
                    return;
            }
        }

        /// <summary>The reel's gauges as the browser draws them.</summary>
        public string Gauges { get { string Bar(double v) { int n = (int)Math.Round(Math.Min(1, v) * 10); return new string('█', n) + new string('░', 10 - n); } return $"Reel (hold F or Shift): {Bar(Progress)}   Tension: {Bar(Tension)}"; } }
    }

    /// <summary>The catch kept on ice and the log (the web save's "fish", "fishLog", "legendFish").</summary>
    public static class FishStore
    {
        /// <summary>Land a fish: logged (a record?), counted, kept or released. Returns "released", "record", "legend" or "caught".</summary>
        public static string Land(Profile p, Fishing.Hooked f, int day)
        {
            var log = p.Section("fishLog");
            var e = log.Obj(f.Name) ?? new Dictionary<string, object> { ["n"] = 0.0, ["best"] = 0.0 };
            bool record = e.Num("n") > 0 && f.Lb > e.Num("best");
            e["n"] = e.Num("n") + 1; e["best"] = Math.Max(e.Num("best"), f.Lb);
            log[f.Name] = e;
            p.AddStat("fishCaught");
            if (f.Lb < f.Min) return "released";
            var ice = p.Section("fish");
            var cur = ice.Obj(f.Name) ?? new Dictionary<string, object> { ["n"] = 0.0, ["lb"] = 0.0, ["price"] = f.Price };
            cur["n"] = cur.Num("n") + 1; cur["lb"] = cur.Num("lb") + f.Lb;
            cur["day"] = Math.Min(cur.ContainsKey("day") && cur["day"] is double d ? d : 1e9, day);
            if (f.Legend != null) { p.Section("legendFish")[f.Legend] = (double)DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(); cur["price"] = f.Price * 3; }
            ice[f.Name] = cur;
            return f.Legend != null ? "legend" : record ? "record" : "caught";
        }

        /// <summary>What a lot on ice fetches: by the pound, half once it's two days old.</summary>
        public static double Worth(Dictionary<string, object> lot, int today) => lot.Num("lb") * lot.Num("price") * (Stale(lot, today) ? 0.5 : 1);
        public static bool Stale(Dictionary<string, object> lot, int today) => lot.ContainsKey("day") && lot["day"] is double d && today - d >= 2;

        public static ICollection<string> LegendsCaught(Profile p) => p.Section("legendFish").Keys.ToList();
    }
}
