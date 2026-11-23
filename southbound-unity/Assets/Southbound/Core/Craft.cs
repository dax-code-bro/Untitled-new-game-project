// Boats and aircraft, with the web game's rules (entities/craft.js, systems/marine-air.js, systems/aviation.js):
// the 16 boats and 11 aircraft with their prices and colours, the 98 boat and 17 aircraft upgrades, the arcade
// physics (a boat planes, leans into turns, rocks on the waves and runs aground at the shore; a plane needs
// flying speed, stalls when too slow, has flaps and landing gear, burns fuel, drifts with the wind and bucks in
// storms, and knows how hard it touched down; a helicopter hovers on its collective and autorotates with the
// engine dead), the shapes (the same signed-distance parts as the browser, meshed with the same surface nets and
// coloured per part), and where the marinas sit (the browser's shoreline search).
//
// Everything here works in the web game's own space (x, z on the map; heading h with forward = (sin h, cos h),
// + turns left) so it can be checked against the browser; the game mirrors it into Unity (x -> -x, yaw = -h).
using System;
using System.Collections.Generic;
using System.Linq;

namespace Southbound.Core
{
    /// <summary>What's under a craft (the web game's Heightmap.height / waterLevel).</summary>
    public interface ICraftGround
    {
        double Height(double x, double z);
        /// <summary>The water's surface (0 at sea; a lake or river its own level), even where it's dry land.</summary>
        double Water(double x, double z);
    }

    /// <summary>The controls (the car's: W throttle, S brake, A/D steer with + left, Space and Shift).</summary>
    public struct CraftInput
    {
        public double Throttle, Brake, Steer;
        /// <summary>Space: a helicopter's collective up, a plane's nose up.</summary>
        public bool Up;
        /// <summary>Shift: collective down, nose down.</summary>
        public bool Down;
    }

    public sealed class CraftEntry
    {
        public string Id, Name, Type;
        public int Price;
        public double[] Paint, Trim;
        public bool Boat;
        /// <summary>Police, medevac: not for sale.</summary>
        public bool Restricted => Price == 0;
        public bool Heli => !Boat && CraftCatalog.Air[Type].Heli;
    }

    public sealed class CraftUpgrade
    {
        public string Id, Group, Name;
        public int Tier, Price;
        public double Accel, Top, Turn, Roll, Armor;
        public string Effect;
    }

    public sealed class BoatSpec
    {
        public double L, W, Draft, Free, Dead, Bow, Cockpit, Top, Accel, Turn, Mast, Sail;
        public double[] Console, Cabin;
        public bool Pontoon, Seat, TTop, Windshield, Flat, Fan, Flybridge, Siren;
    }

    public sealed class AirSpec
    {
        public bool Heli;
        public double L, Span, R, WingY, Top, Accel, Lift, Roll, Pitch, Rotor;
        public bool High, Biplane, Floats, Twin, Jet;
    }

    public static class CraftCatalog
    {
        public static readonly Dictionary<string, BoatSpec> BoatTypes = new Dictionary<string, BoatSpec>
        {
            ["jetski"] = new BoatSpec { L = 3.2, W = 1.2, Draft = 0.25, Free = 0.55, Dead = 0.3, Bow = 2.2, Seat = true, Top = 28, Accel = 9, Turn = 1.6 },
            ["skiff"] = new BoatSpec { L = 4.6, W = 1.8, Draft = 0.25, Free = 0.6, Dead = 0.15, Bow = 2.0, Cockpit = 0.45, Top = 16, Accel = 4, Turn = 1.0 },
            ["bass"] = new BoatSpec { L = 6.0, W = 2.3, Draft = 0.3, Free = 0.62, Dead = 0.25, Bow = 2.6, Cockpit = 0.35, Console = new[] { 0.2, 0.9 }, Top = 26, Accel = 6.5, Turn = 1.0 },
            ["center"] = new BoatSpec { L = 7.5, W = 2.6, Draft = 0.45, Free = 0.95, Dead = 0.4, Bow = 2.2, Cockpit = 0.55, Console = new[] { 0.3, 1.1 }, TTop = true, Top = 24, Accel = 5.5, Turn = 0.85 },
            ["speed"] = new BoatSpec { L = 8.5, W = 2.5, Draft = 0.4, Free = 0.85, Dead = 0.45, Bow = 3.4, Cockpit = 0.5, Windshield = true, Top = 36, Accel = 8, Turn = 0.8 },
            ["racer"] = new BoatSpec { L = 11.0, W = 2.6, Draft = 0.4, Free = 0.95, Dead = 0.5, Bow = 4.2, Cockpit = 0.45, Windshield = true, Top = 46, Accel = 9.5, Turn = 0.6 },
            ["pontoon"] = new BoatSpec { L = 7.0, W = 2.6, Pontoon = true, Draft = 0.4, Free = 0.9, Top = 12, Accel = 3, Turn = 0.7 },
            ["airboat"] = new BoatSpec { L = 5.2, W = 2.4, Draft = 0.12, Free = 0.5, Dead = 0.02, Bow = 1.4, Flat = true, Fan = true, Top = 22, Accel = 6, Turn = 1.2 },
            ["cruiser"] = new BoatSpec { L = 11.5, W = 3.6, Draft = 0.8, Free = 1.4, Dead = 0.35, Bow = 2.4, Cabin = new[] { 0.1, -2.5, 1.8 }, Windshield = true, Top = 20, Accel = 3.5, Turn = 0.55 },
            ["yacht"] = new BoatSpec { L = 18.0, W = 5.0, Draft = 1.2, Free = 1.9, Dead = 0.35, Bow = 2.6, Cabin = new[] { 3.0, -5.5, 2.4 }, Flybridge = true, Top = 18, Accel = 2.5, Turn = 0.4 },
            ["trawler"] = new BoatSpec { L = 13.0, W = 4.2, Draft = 1.2, Free = 1.6, Dead = 0.25, Bow = 2.0, Cabin = new[] { 2.5, -0.5, 2.6 }, Mast = 6, Top = 12, Accel = 2.2, Turn = 0.45 },
            ["sail"] = new BoatSpec { L = 9.0, W = 3.0, Draft = 0.6, Free = 0.9, Dead = 0.35, Bow = 2.6, Cockpit = 0.5, Sail = 11, Cabin = new[] { 1.2, -0.6, 0.6 }, Top = 10, Accel = 2.0, Turn = 0.6 },
            ["patrol"] = new BoatSpec { L = 10.0, W = 3.2, Draft = 0.6, Free = 1.2, Dead = 0.45, Bow = 2.6, Cabin = new[] { 1.5, -1.5, 1.7 }, Windshield = true, Siren = true, Top = 30, Accel = 6, Turn = 0.75 },
        };

        public static readonly Dictionary<string, AirSpec> Air = new Dictionary<string, AirSpec>
        {
            ["prop"] = new AirSpec { L = 8.2, Span = 11, R = 0.65, WingY = 1.55, High = true, Top = 65, Accel = 7, Lift = 22, Roll = 1.2, Pitch = 0.8 },
            ["duster"] = new AirSpec { L = 8.8, Span = 13, R = 0.6, WingY = 0.9, Top = 60, Accel = 6.5, Lift = 20, Roll = 1.1, Pitch = 0.7 },
            ["stunt"] = new AirSpec { L = 6.8, Span = 7.5, R = 0.55, WingY = 0.8, Top = 90, Accel = 10, Lift = 28, Roll = 2.4, Pitch = 1.2, Biplane = true },
            ["seaplane"] = new AirSpec { L = 9.5, Span = 12.5, R = 0.7, WingY = 1.7, High = true, Floats = true, Top = 60, Accel = 6, Lift = 21, Roll = 1.0, Pitch = 0.7 },
            ["twin"] = new AirSpec { L = 11, Span = 14, R = 0.8, WingY = 0.9, Twin = true, Top = 85, Accel = 8, Lift = 30, Roll = 0.9, Pitch = 0.6 },
            ["jet"] = new AirSpec { L = 15, Span = 13.5, R = 0.95, WingY = 0.8, Jet = true, Top = 140, Accel = 12, Lift = 45, Roll = 1.0, Pitch = 0.6 },
            ["heli"] = new AirSpec { Heli = true, L = 9.5, R = 1.15, Rotor = 5.2, Top = 55, Accel = 9, Roll = 1.6, Pitch = 1.0 },
            ["heliBig"] = new AirSpec { Heli = true, L = 12.5, R = 1.5, Rotor = 6.8, Top = 60, Accel = 8, Roll = 1.2, Pitch = 0.8 },
        };

        static CraftEntry E(bool boat, string id, string name, string type, int price, double[] paint, double[] trim) => new CraftEntry { Boat = boat, Id = id, Name = name, Type = type, Price = price, Paint = paint, Trim = trim };
        static double[] C(double r, double g, double b) => new[] { r, g, b };

        public static readonly List<CraftEntry> Boats = new List<CraftEntry>
        {
            E(true, "wave-runner", "Heron WaveRunner", "jetski", 11000, C(0.85, 0.85, 0.85), C(0.05, 0.3, 0.6)),
            E(true, "wave-runner-x", "Heron WaveRunner X", "jetski", 15500, C(0.08, 0.08, 0.09), C(0.7, 0.8, 0.05)),
            E(true, "skiff", "Bayline Bayou Skiff", "skiff", 6000, C(0.32, 0.36, 0.28), C(0.25, 0.27, 0.22)),
            E(true, "bass-boat", "Gulfstar Bass Pro", "bass", 24000, C(0.45, 0.04, 0.03), C(0.85, 0.85, 0.85)),
            E(true, "center-console", "Pelican 24 CC", "center", 48000, C(0.86, 0.86, 0.84), C(0.1, 0.25, 0.5)),
            E(true, "center-console-x", "Pelican 26 Offshore", "center", 61000, C(0.8, 0.82, 0.84), C(0.02, 0.02, 0.03)),
            E(true, "speedboat", "Corsair Vela 28", "speed", 85000, C(0.85, 0.85, 0.85), C(0.6, 0.05, 0.02)),
            E(true, "speedboat-x", "Corsair Vela 32", "speed", 120000, C(0.03, 0.04, 0.08), C(0.85, 0.85, 0.85)),
            E(true, "racer", "Corsair Thunder 38", "racer", 260000, C(0.65, 0.12, 0.02), C(0.9, 0.9, 0.9)),
            E(true, "pontoon", "Lake Arden Party Barge", "pontoon", 32000, C(0.75, 0.75, 0.72), C(0.2, 0.2, 0.22)),
            E(true, "airboat", "Bayou Verde Airboat", "airboat", 29000, C(0.25, 0.3, 0.2), C(0.2, 0.2, 0.2)),
            E(true, "cruiser", "Sabine 38 Cruiser", "cruiser", 340000, C(0.88, 0.88, 0.86), C(0.05, 0.12, 0.3)),
            E(true, "yacht", "Gulfline 60 Motor Yacht", "yacht", 1800000, C(0.9, 0.9, 0.9), C(0.06, 0.06, 0.08)),
            E(true, "trawler", "Ironbridge Shrimp Trawler", "trawler", 210000, C(0.85, 0.82, 0.75), C(0.5, 0.06, 0.04)),
            E(true, "sailboat", "Cypress 30 Sloop", "sail", 95000, C(0.9, 0.9, 0.88), C(0.05, 0.15, 0.4)),
            E(true, "patrol-boat", "Calvera PD Marine Unit", "patrol", 0, C(0.9, 0.9, 0.9), C(0.05, 0.08, 0.3)),
        };

        public static readonly List<CraftEntry> Aircraft = new List<CraftEntry>
        {
            E(false, "skylark", "Heron Skylark 172", "prop", 220000, C(0.9, 0.9, 0.88), C(0.6, 0.05, 0.03)),
            E(false, "crop-duster", "Redgrass Ag-Wagon", "duster", 160000, C(0.85, 0.65, 0.05), C(0.1, 0.1, 0.1)),
            E(false, "stunt", "Lone Star Barnstormer", "stunt", 340000, C(0.55, 0.03, 0.03), C(0.9, 0.9, 0.9)),
            E(false, "seaplane", "Bayline Otter Float", "seaplane", 480000, C(0.9, 0.85, 0.2), C(0.1, 0.2, 0.45)),
            E(false, "twin", "Gulfstar Twin Commander", "twin", 900000, C(0.88, 0.88, 0.9), C(0.05, 0.12, 0.35)),
            E(false, "bizjet", "Meridian Executive Jet", "jet", 4200000, C(0.92, 0.92, 0.94), C(0.12, 0.12, 0.15)),
            E(false, "tour-heli", "Gulf Coast Tours Heli", "heli", 900000, C(0.85, 0.85, 0.85), C(0.05, 0.3, 0.6)),
            E(false, "news-heli", "Channel 9 News Chopper", "heli", 1100000, C(0.1, 0.25, 0.6), C(0.9, 0.9, 0.9)),
            E(false, "police-heli", "Calvera PD Air Unit", "heli", 0, C(0.05, 0.05, 0.06), C(0.9, 0.9, 0.9)),
            E(false, "medevac", "Mercy Medevac", "heliBig", 0, C(0.9, 0.9, 0.9), C(0.6, 0.03, 0.02)),
            E(false, "cargo-heli", "Ironbridge Sky Crane", "heliBig", 2600000, C(0.35, 0.36, 0.3), C(0.85, 0.6, 0.05)),
        };

        public static CraftEntry Find(string id) => Boats.FirstOrDefault(b => b.Id == id) ?? Aircraft.FirstOrDefault(a => a.Id == id);

        static string Slug(string name) => System.Text.RegularExpressions.Regex.Replace(name.ToLowerInvariant(), "[^a-z]+", "-");

        static readonly (string name, double accel, double top, double turn, double armor, string fx)[] BoatSys =
        {
            ("Outboard power", 0.06, 0.03, 0, 0, null), ("Propeller pitch", 0, 0.03, 0, 0, null), ("Trim tabs", 0, 0, 0.04, 0, null), ("Hull coating", 0.02, 0.02, 0, 0, null),
            ("Fuel system", 0.02, 0, 0, 0, null), ("Steering", 0, 0, 0.05, 0, null), ("Navigation electronics", 0, 0, 0, 0, "nav"), ("Fish finder", 0, 0, 0, 0, "fish"), ("Livewell", 0, 0, 0, 0, "fish"),
            ("Bilge & pumps", 0, 0, 0, 15, null), ("Hull armor", 0, 0, 0, 25, null), ("Sound system", 0, 0, 0, 0, null), ("Lighting", 0, 0, 0, 0, "lights"), ("Anchor & winch", 0, 0, 0, 0, null),
        };
        /// <summary>98 boat upgrades: 14 systems x 7 levels (the web game's BOAT_UPGRADES).</summary>
        public static readonly List<CraftUpgrade> BoatUpgrades = BuildBoatUpgrades();
        static List<CraftUpgrade> BuildBoatUpgrades()
        {
            var o = new List<CraftUpgrade>();
            foreach (var s in BoatSys)
                for (int t = 1; t <= 7; t++)
                    o.Add(new CraftUpgrade { Id = $"boat-{Slug(s.name)}-{t}", Group = s.name, Tier = t, Name = $"{s.name} L{t}", Accel = s.accel, Top = s.top, Turn = s.turn, Armor = s.armor, Effect = s.fx, Price = (int)JsMath.Round(600 * t * (1 + t * 0.3)) });
            return o;
        }

        /// <summary>17 aircraft upgrades (the web game's AIR_UPGRADES).</summary>
        public static readonly List<CraftUpgrade> AirUpgrades = BuildAirUpgrades();
        static List<CraftUpgrade> BuildAirUpgrades()
        {
            var sys = new (string name, int tiers, double accel, double top, double roll, double armor, string fx)[]
            {
                ("Engine overhaul", 3, 0.1, 0.05, 0, 0, null), ("Propeller / turbine", 2, 0, 0.06, 0, 0, null), ("Avionics", 2, 0, 0, 0, 0, "stable"), ("Control surfaces", 2, 0, 0, 0.12, 0, null),
                ("Landing gear", 2, 0, 0, 0, 20, null), ("Armor plating", 3, 0, 0, 0, 35, null), ("Fuel tanks", 2, 0.03, 0, 0, 0, null), ("Smoke system", 1, 0, 0, 0, 0, "smoke"),
            };
            var o = new List<CraftUpgrade>();
            foreach (var s in sys)
                for (int i = 0; i < s.tiers; i++)
                    o.Add(new CraftUpgrade { Id = $"air-{Slug(s.name)}-{i + 1}", Group = s.name, Tier = i + 1, Name = $"{s.name} {i + 1}", Accel = s.accel, Top = s.top, Roll = s.roll, Armor = s.armor, Effect = s.fx, Price = (int)JsMath.Round(9000 * (i + 1) * (1 + i * 0.4)) });
            return o;
        }

        /// <summary>Refuelling an aircraft: what's missing from the tank, priced the web game's way.</summary>
        public static int FuelCost(double fuel, bool heli) => (int)JsMath.Round((1 - fuel) * (heli ? 420 : 260));
    }

    static class CraftMath
    {
        public static double Clamp(double v, double a, double b) => v < a ? a : v > b ? b : v;
        public static double Lerp(double a, double b, double t) => a + (b - a) * t;
        public static double Hyp2(double a, double b) => Math.Sqrt(a * a + b * b);
    }

    /// <summary>A boat on the water (the web game's Boat.physics, line for line).</summary>
    public sealed class BoatModel
    {
        public readonly CraftEntry Entry;
        public readonly BoatSpec S;
        public double X, Y, Z, Heading, Pitch, Roll, Speed, VelX, VelZ, Steer, Impact, T;
        public double Accel, Top, Turn, Health = 100, MaxHealth = 100;
        public bool Afloat;

        public BoatModel(CraftEntry e, Random rnd = null)
        {
            Entry = e; S = CraftCatalog.BoatTypes[e.Type];
            Accel = S.Accel; Top = S.Top; Turn = S.Turn;
            T = (rnd ?? new Random()).NextDouble() * 10;
        }

        public double Radius => S.W / 2 + 0.3;
        public double Draft => S.Draft;

        /// <summary>Fit the upgrades (group -> tier, as the save keeps them).</summary>
        public void Upgrade(IDictionary<string, int> up)
        {
            Accel = S.Accel; Top = S.Top; Turn = S.Turn;
            double armor = 0;
            if (up != null)
                foreach (var kv in up)
                {
                    var u = CraftCatalog.BoatUpgrades.FirstOrDefault(b => b.Group == kv.Key);
                    if (u == null) continue;
                    int t = kv.Value;
                    Accel *= 1 + u.Accel * t; Top *= 1 + u.Top * t; Turn *= 1 + u.Turn * t; armor += u.Armor * t;
                }
            MaxHealth = 100 + armor; Health = Math.Min(Health, MaxHealth);
        }

        public void Place(double x, double z, double heading, ICraftGround g) { X = x; Z = z; Heading = heading; Y = Math.Max(g.Water(x, z), g.Height(x, z)); VelX = VelZ = Speed = 0; }

        public void Step(double dt, CraftInput input, ICraftGround hm)
        {
            double fx = Math.Sin(Heading), fz = Math.Cos(Heading);
            double vF = VelX * fx + VelZ * fz;
            double vR = VelX * Math.Cos(Heading) - VelZ * Math.Sin(Heading);
            double wl = hm.Water(X, Z), ground = hm.Height(X, Z);
            bool afloat = wl - ground > Draft * 0.6;
            Afloat = afloat;
            if (afloat)
            {
                vF += Accel * input.Throttle * Math.Max(0, 1 - vF / Top) * dt;
                if (input.Brake > 0) vF -= (vF > 0 ? 6 : 2.5) * input.Brake * dt;
                vF = Math.Max(vF, -5);
            }
            vF -= vF * (afloat ? 0.18 : 2.5) * dt;
            vR *= Math.Exp(-(afloat ? 2.2 : 6) * dt);
            Steer = CraftMath.Lerp(Steer, input.Steer, Math.Min(1, dt * 4));
            Heading += Steer * Turn * CraftMath.Clamp(Math.Abs(vF) / 5, 0.25, 1) * Math.Sign(vF == 0 ? 1 : vF) * dt;
            double nfx = Math.Sin(Heading), nfz = Math.Cos(Heading);
            VelX = nfx * vF + Math.Cos(Heading) * vR;
            VelZ = nfz * vF - Math.Sin(Heading) * vR;
            double nx = X + VelX * dt, nz = Z + VelZ * dt;
            // run aground: stop at the shore
            if (hm.Water(nx, nz) - hm.Height(nx, nz) < Draft * 0.4)
            {
                Impact = Math.Max(Impact, Math.Abs(vF) * 0.4);
                VelX *= -0.25; VelZ *= -0.25;
            }
            else { X = nx; Z = nz; }
            T += dt;
            double waves = Math.Sin(T * 1.7) * 0.06 + Math.Sin(T * 2.9 + 1) * 0.03;
            Y = Math.Max(wl, ground) + waves * (1 - CraftMath.Clamp(Math.Abs(vF) / 15, 0, 0.7));
            // the bow lifts as the hull comes onto the plane, and she leans into turns
            Pitch = CraftMath.Lerp(Pitch, CraftMath.Clamp(vF / Top, 0, 1) * 0.07 + Math.Sin(T * 1.3) * 0.02, Math.Min(1, dt * 3));
            Roll = CraftMath.Lerp(Roll, -Steer * CraftMath.Clamp(vF / Top, 0, 1) * 0.12 + Math.Sin(T * 1.1) * 0.02, Math.Min(1, dt * 3));
            Speed = vF;
            Impact = Math.Max(0, Impact - dt * 5);
        }

        /// <summary>Stepping off: the nearest dry ground (null if there's none within 80 m).</summary>
        public (double x, double z)? ExitPoint(ICraftGround hm)
        {
            for (int r = 3; r < 80; r += 3)
                for (int a = 0; a < 16; a++)
                {
                    double x = X + Math.Cos(a / 16.0 * Math.PI * 2) * r, z = Z + Math.Sin(a / 16.0 * Math.PI * 2) * r;
                    if (hm.Height(x, z) > hm.Water(x, z) + 0.3) return (x, z);
                }
            return null;
        }
    }

    /// <summary>A plane or a helicopter (the web game's Aircraft.physics, line for line).</summary>
    public sealed class AirModel
    {
        public readonly CraftEntry Entry;
        public readonly AirSpec S;
        public bool Heli => S.Heli;
        public double X, Y, Z, VelX, VelZ, Vy, Heading, Pitch, Roll, Speed, Power, Alt;
        public double Accel, Top, RollK, PitchK, Health = 100, MaxHealth = 100, Impact, RotorSpin;
        public double Fuel = 1, Flaps, WindX, WindZ, Turb;
        public bool GearDown = true, EngineOut, Stall, Airborne;
        /// <summary>The last touchdown: vertical speed (m/s, negative down), wheels (or skids, floats) under you, speed. Seq counts them.</summary>
        public double TouchVs, TouchSpeed; public bool TouchGear; public int TouchSeq;
        bool high; double lastVy;
        readonly Random rnd;

        public AirModel(CraftEntry e, Random rnd = null)
        {
            Entry = e; S = CraftCatalog.Air[e.Type];
            this.rnd = rnd ?? new Random();
            Accel = S.Accel; Top = S.Top; RollK = S.Roll; PitchK = S.Pitch;
        }

        public bool Floats => S.Floats;
        public double Radius => (S.Span > 0 ? S.Span : 3) / 2;

        /// <summary>Fit the upgrades (group -> tier). As in the browser, only the fitted tier counts.</summary>
        public void Upgrade(IDictionary<string, int> up)
        {
            Accel = S.Accel; Top = S.Top; RollK = S.Roll; PitchK = S.Pitch;
            double armor = 0;
            if (up != null)
                foreach (var u in CraftCatalog.AirUpgrades)
                {
                    if (!up.TryGetValue(u.Group, out int t) || t == 0 || u.Tier != t) continue;
                    Accel *= 1 + u.Accel * t; Top *= 1 + u.Top * t; RollK *= 1 + u.Roll * t; armor += u.Armor * t;
                }
            MaxHealth = 100 + armor;
        }

        public double GroundAt(ICraftGround hm, double x, double z) { double g = hm.Height(x, z), w = hm.Water(x, z); return Floats && w > g ? w : g; }

        public void Place(double x, double z, double heading, ICraftGround g) { X = x; Z = z; Heading = heading; Y = GroundAt(g, x, z); Speed = Vy = VelX = VelZ = 0; Alt = 0; Airborne = false; }

        public bool Dead => Fuel <= 0 || EngineOut || Health <= 0;

        public void Step(double dt, CraftInput input, ICraftGround hm)
        {
            double ground = GroundAt(hm, X, Z);
            double steer = input.Steer;
            bool dead = Dead;
            if (Heli)
            {
                // collective: Space up, Shift down; W/S tilt forward/back; A/D yaw
                double lift = (input.Up ? 1 : 0) - (input.Down ? 1 : 0);
                Power = CraftMath.Lerp(Power, dead ? 0 : 1, dt * 0.5);
                // no engine: autorotation, a steady descent you can still steer and flare
                Vy = dead ? CraftMath.Lerp(Vy, -4.5 + Math.Max(0, lift) * 2.5, dt * 1.2) : CraftMath.Lerp(Vy, lift * 7 * Power, dt * 1.5);
                double fwd = input.Throttle - input.Brake;
                Pitch = CraftMath.Lerp(Pitch, -fwd * 0.22, dt * 2);
                Roll = CraftMath.Lerp(Roll, -steer * 0.15, dt * 2);
                Heading += steer * RollK * 0.8 * dt;
                Speed = CraftMath.Lerp(Speed, fwd * Top * (Y - ground > 1.5 ? 1 : 0.1), dt * 0.6);
            }
            else
            {
                // the throttle lever on W/S, rudder and ailerons on A/D, the elevator on Space (up) and Shift (down)
                Power = dead ? Math.Max(0, Power - dt) : CraftMath.Clamp(Power + (input.Throttle - input.Brake) * dt * 0.6, 0, 1);
                bool air = Y - ground > 0.6;
                // drag set by the aircraft's own top speed (full power holds it there); flaps add half again, the gear a little
                double dragK = Accel / (Top * Top) * (1 + Flaps * 0.5) * (GearDown ? 1 : 0.85);
                double drag = dragK * Speed * Math.Abs(Speed);
                Speed += (Accel * Power - drag - (air ? Math.Sin(Pitch) * 9.8 : 0)) * dt;
                if (!air && input.Brake > 0 && Power < 0.05) Speed = Math.Max(0, Speed - 8 * dt);
                Speed = Math.Max(0, Speed);
                double elev = (input.Up ? 1 : 0) - (input.Down ? 1 : 0);
                double authority = CraftMath.Clamp(Speed / (S.Lift * 0.9), 0, 1);
                Pitch = CraftMath.Clamp(Pitch + elev * PitchK * authority * dt - (air ? 0 : Pitch * dt * 2), -0.9, 0.9);
                if (!air && Pitch < 0) Pitch = 0;
                Roll = CraftMath.Lerp(Roll, air ? -steer * 0.7 : 0, dt * RollK);
                Heading += (air ? -Roll * 0.55 : steer * 0.6 * CraftMath.Clamp(Speed / 10, 0, 1)) * dt;
                double liftSpd = S.Lift * (Flaps != 0 ? 0.82 : 1);
                double liftK = CraftMath.Clamp(Math.Pow(Speed / liftSpd, 2), 0, 1.6);
                // too slow in the air: the wing stalls and the nose drops
                Stall = air && Speed < liftSpd * 0.72;
                if (Stall) { Pitch = Math.Max(-0.6, Pitch - dt * 0.7); Roll += (rnd.NextDouble() - 0.5) * dt * 1.5; }
                double climb = Speed * Math.Sin(Pitch) * liftK - (1 - Math.Min(liftK, 1)) * 9 * (air ? 1 : 0);
                Vy = CraftMath.Lerp(Vy, climb, dt * 2);
            }
            // fuel burns with the power; in the air the wind carries you and storms throw you about
            if (!dead) Fuel = Math.Max(0, Fuel - dt * (Heli ? 0.0007 : 0.00015 + Power * 0.0006));
            if (Airborne && Turb > 0) { Pitch += (rnd.NextDouble() - 0.5) * Turb * dt * 2; Roll += (rnd.NextDouble() - 0.5) * Turb * dt * 3; Vy += (rnd.NextDouble() - 0.5) * Turb * 18 * dt; }
            double hx = Math.Sin(Heading), hz = Math.Cos(Heading);
            double hs = Speed * Math.Cos(Pitch);
            VelX = hx * hs; VelZ = hz * hs;
            X += (VelX + (Airborne ? WindX : 0)) * dt; Z += (VelZ + (Airborne ? WindZ : 0)) * dt;
            Y += Vy * dt;
            double g2 = GroundAt(hm, X, Z);
            if (Y <= g2)
            {
                if (Vy < -7 || (!Heli && Math.Abs(Roll) > 0.5)) { Health -= Math.Abs(Vy) * 6; Impact = Math.Abs(Vy); }
                Y = g2; Vy = Math.Max(0, Vy);
                if (Heli) Speed *= Math.Exp(-3 * dt);
                Airborne = false;
            }
            else Airborne = Y - g2 > 1;
            Alt = Y - g2;
            // the touchdown: from flight to within a hand's breadth of the ground: how hard, and on what (no wheels is a belly landing)
            if (high && Alt < 0.3)
            {
                high = false;
                TouchVs = Math.Min(Vy, lastVy); TouchGear = GearDown || Heli || Floats; TouchSpeed = Speed; TouchSeq++;
                if (!TouchGear) { Health -= 25; Speed *= 0.4; Impact = 4; }
            }
            if (Alt > 0.8) high = true;
            lastVy = Vy;
            X = CraftMath.Clamp(X, -2000, 2000); Z = CraftMath.Clamp(Z, -2000, 2000);
            Impact = Math.Max(0, Impact - dt * 5);
            RotorSpin += dt * (Heli ? 30 * Math.Max(Power, 0.15) : 10 + Power * 60);
        }

        /// <summary>Getting out: beside it on the ground, or (more than 3 m up) bailing out.</summary>
        public (double x, double z, bool bail) ExitPoint()
        {
            if (Alt > 3) return (X + 4, Z, true);
            return (X + Math.Cos(Heading) * (Radius + 1.5), Z - Math.Sin(Heading) * (Radius + 1.5), false);
        }

        /// <summary>G: the gear goes up only once you're off the ground.</summary>
        public bool ToggleGear() { if (Heli || Floats) return false; if (!GearDown || Alt > 2) { GearDown = !GearDown; return true; } return false; }
        public bool ToggleFlaps() { if (Heli) return false; Flaps = Flaps != 0 ? 0 : 1; return true; }
    }

    /// <summary>Calvera's marinas, airfield and the coast (the web game's layout and marine-air.js).</summary>
    public static class Harbours
    {
        public sealed class Marina { public string Name; public double LandX, LandZ, WaterX, WaterZ, Dir, PierEndX, PierEndZ; }

        /// <summary>The coastline's z at x (world/layout.js coastZ).</summary>
        public static double CoastZ(double x) => 1480 + 90 * Math.Sin(x * 0.0021 + 1.0) + 50 * Math.Sin(x * 0.0057 + 2.0);

        /// <summary>From a water point toward land: the last deep water and the first dry land (null if none).</summary>
        public static Marina Shore(ICraftGround g, string name, double wx, double wz, double lx, double lz)
        {
            (double x, double z)? water = null;
            for (int k = 0; k <= 200; k++)
            {
                double t = k * 0.005;
                double x = wx + (lx - wx) * t, z = wz + (lz - wz) * t;
                double deep = g.Water(x, z) - g.Height(x, z);
                if (deep > 1.4) water = (x, z);
                if (deep < -0.4 && water != null)
                {
                    var m = new Marina { Name = name, LandX = x, LandZ = z, WaterX = water.Value.x, WaterZ = water.Value.z, Dir = Math.Atan2(wx - lx, wz - lz) };
                    double a = Math.Atan2(m.WaterX - m.LandX, m.WaterZ - m.LandZ);
                    m.PierEndX = m.WaterX + Math.Sin(a) * 2; m.PierEndZ = m.WaterZ + Math.Cos(a) * 2;
                    return m;
                }
            }
            return null;
        }

        /// <summary>The three marinas the web game builds (Lake Arden, Port Calvera Harbor, Bayou Verde Landing).</summary>
        public static List<Marina> Marinas(ICraftGround g, MissionData L)
        {
            double cityX = L.CityX0 + 3 * L.CityPitch;
            var o = new List<Marina>
            {
                Shore(g, "Lake Arden Marina", L.LakeX, L.LakeZ, L.LakeX + L.LakeR * 2, L.LakeZ + 120),
                Shore(g, "Port Calvera Harbor", cityX, CoastZ(cityX) + 140, cityX, L.CityZ0 + L.CityNz * L.CityPitch - 40),
                Shore(g, "Bayou Verde Landing", L.BayouX, L.BayouZ + 300, L.BayouX + 260, L.BayouZ - 80),
            };
            return o.Where(m => m != null).ToList();
        }

        /// <summary>Where a boat bought or launched at a marina waits: off the end of the pier, side on.</summary>
        public static (double x, double z, double h) BoatSpot(Marina m)
        {
            double a = Math.Atan2(m.WaterX - m.LandX, m.WaterZ - m.LandZ);
            return (m.PierEndX + Math.Cos(a) * 4.5, m.PierEndZ - Math.Sin(a) * 4.5, a);
        }

        // Redgrass Airfield (layout AIRFIELD): planes wait on the runway, helicopters on the pad.
        public static (double x, double z, double h) AirSpawn(MissionData L) => (L.AirfieldX1 - 90, L.AirfieldZ, -Math.PI / 2);
        public static (double x, double z, double h) HeliPad(MissionData L) => (L.AirfieldX1 - 40, L.AirfieldZ - 40, -Math.PI / 2);
        public static (double x, double z) FuelPad(MissionData L) => (L.AirfieldX1 - 60, L.AirfieldZ - 26);
        public static (double x, double z) Office(MissionData L) => (L.AirfieldX1 - 60, L.AirfieldZ - 62);
        public static (double x, double z) School(MissionData L) => (L.AirfieldX1 - 52, L.AirfieldZ - 64);
        public static (double x, double z) Hangar(MissionData L) => (L.AirfieldX1 - 60, L.AirfieldZ - 80);
        public static bool OverCity(MissionData L, double x, double z) => x > L.CityX0 && x < L.CityX0 + L.CityNx * L.CityPitch && z > L.CityZ0 && z < L.CityZ0 + L.CityNz * L.CityPitch;
        public static bool OnRunway(MissionData L, double x, double z) => x > L.AirfieldX0 && x < L.AirfieldX1 && Math.Abs(z - L.AirfieldZ) < L.AirfieldW / 2 + 4;

        /// <summary>How a touchdown went (aviation.js): Belly landing! / Butter / Smooth / Firm / Hard.</summary>
        public static string LandingWord(double vs, bool gear)
        {
            double s = -vs;
            return !gear ? "Belly landing!" : s < 1.5 ? "Butter landing" : s < 3 ? "Smooth landing" : s < 5 ? "Firm landing" : "Hard landing";
        }
    }

    /// <summary>Flight school at Redgrass (aviation.js LESSONS): take-off, the circuit, landing. Medals by time.</summary>
    public static class FlightSchool
    {
        public sealed class Lesson { public int N; public string Name, Brief; public double Limit; }
        public static readonly Lesson[] Lessons =
        {
            new Lesson { N = 1, Name = "Take-off", Brief = "Full throttle (W), lift off at flying speed (Space eases the nose up) and climb to 400 ft.", Limit = 150 },
            new Lesson { N = 2, Name = "The circuit", Brief = "Fly through the four markers around the field, between 300 and 1,000 ft.", Limit = 300 },
            new Lesson { N = 3, Name = "Landing", Brief = "Line up with the runway, gear down (G), flaps (J), and set it down gently. Stop on the runway.", Limit = 360 },
        };
        public const int Price = 150;
        public static string Medal(Lesson l, double t) => t < l.Limit * 0.5 ? "gold" : t < l.Limit * 0.8 ? "silver" : "bronze";
        /// <summary>The circuit's four markers (web x, z) around the field.</summary>
        public static (double x, double z)[] Rings(MissionData L) => new[] { (-200.0, -320.0), (-650.0, -320.0), (-650.0, 320.0), (-200.0, 320.0) }.Select(d => (L.AirfieldX1 + d.Item1, L.AirfieldZ + d.Item2)).ToArray();
    }

    /// <summary>A craft's shape: the browser's signed-distance parts, meshed by surface nets, a colour per triangle.</summary>
    public sealed class CraftMesh
    {
        public SurfaceMesh Mesh;
        /// <summary>Per triangle: an index into Looks.</summary>
        public int[] TriLook;
        public List<(float r, float g, float b, float rough, float metal)> Looks = new List<(float, float, float, float, float)>();
        /// <summary>Where the spinning parts go (craft space): props (planes, the airboat's fan), the main and tail rotor.</summary>
        public List<(double x, double y, double z)> Props = new List<(double, double, double)>();
        public double PropLength = 1.9;
        public (double x, double y, double z)? Rotor, TailRotor;
        public double RotorLength;
        /// <summary>The sailboat's mainsail and jib (three corners each), and the draft line's height.</summary>
        public List<double[]> Sails = new List<double[]>();
        public double Height;
    }

    public static class CraftShape
    {
        sealed class Part { public string Kind; public Sdf D; public bool Sub; public double K; }

        static double Smax(double a, double b, double k) => CarShape.Smax(a, b, k);
        static double Smin(double a, double b, double k) => CarShape.Smin(a, b, k);
        static double Hyp2(double a, double b) => Math.Sqrt(a * a + b * b);
        static double Hyp3(double a, double b, double c) => Math.Sqrt(a * a + b * b + c * c);
        static double Clamp(double v, double a, double b) => v < a ? a : v > b ? b : v;
        static double Lerp(double a, double b, double t) => a + (b - a) * t;

        public static Sdf RoundBox(double cx, double cy, double cz, double hx, double hy, double hz, double r) => (x, y, z) =>
        {
            double qx = Math.Abs(x - cx) - hx + r, qy = Math.Abs(y - cy) - hy + r, qz = Math.Abs(z - cz) - hz + r;
            return Hyp3(Math.Max(qx, 0), Math.Max(qy, 0), Math.Max(qz, 0)) + Math.Min(Math.Max(Math.Max(qx, qy), qz), 0) - r;
        };
        static Sdf CapsuleZ(double z0, double z1, double r0, double r1, double y0 = 0) => (x, yy, z) =>
        {
            double t = Clamp((z - z0) / (z1 - z0), 0, 1), r = Lerp(r0, r1, t);
            return Math.Sqrt(x * x + (yy - y0) * (yy - y0) + (z - Lerp(z0, z1, t)) * (z - Lerp(z0, z1, t))) - r;
        };
        static Sdf Ellipsoid(double cx, double cy, double cz, double rx, double ry, double rz) => (x, y, z) =>
        {
            double qx = (x - cx) / rx, qy = (y - cy) / ry, qz = (z - cz) / rz;
            double k0 = Math.Sqrt(qx * qx + qy * qy + qz * qz);
            double k1 = Math.Sqrt((qx / rx) * (qx / rx) + (qy / ry) * (qy / ry) + (qz / rz) * (qz / rz));
            if (k1 == 0) k1 = 1e-6;
            return k0 * (k0 - 1) / k1;
        };

        static CraftMesh Mesh(List<Part> parts, double[] min, double[] max, double h, Func<string, double, double, double, double, (double[] c, double r, double m)> colorOf)
        {
            Sdf sdf = (x, y, z) =>
            {
                double d = 1e9;
                foreach (var p in parts) d = p.Sub ? Smax(d, -p.D(x, y, z), p.K != 0 ? p.K : 0.03) : (p.K != 0 ? Smin(d, p.D(x, y, z), p.K) : Math.Min(d, p.D(x, y, z)));
                return d;
            };
            var g = SurfaceNets.Build(sdf, min, max, h);
            var o = new CraftMesh { Mesh = g, TriLook = new int[g.TriangleCount] };
            var keys = new Dictionary<(float, float, float, float, float), int>();
            var P = g.Positions; var I = g.Indices;
            for (int t = 0; t < g.TriangleCount; t++)
            {
                int a = I[t * 3], b = I[t * 3 + 1], c = I[t * 3 + 2];
                double x = (P[a * 3] + P[b * 3] + P[c * 3]) / 3.0, y = (P[a * 3 + 1] + P[b * 3 + 1] + P[c * 3 + 1]) / 3.0, z = (P[a * 3 + 2] + P[b * 3 + 2] + P[c * 3 + 2]) / 3.0;
                // the face's own normal (which way it faces decides the non-skid deck)
                double ux = P[b * 3] - P[a * 3], uy = P[b * 3 + 1] - P[a * 3 + 1], uz = P[b * 3 + 2] - P[a * 3 + 2];
                double vx = P[c * 3] - P[a * 3], vy = P[c * 3 + 1] - P[a * 3 + 1], vz = P[c * 3 + 2] - P[a * 3 + 2];
                double nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, nl = Math.Sqrt(nx * nx + ny * ny + nz * nz);
                double fny = nl > 0 ? ny / nl : 0;
                // which way does the mesh face? (the normals point out of the solid)
                double avgNy = (g.Normals[a * 3 + 1] + g.Normals[b * 3 + 1] + g.Normals[c * 3 + 1]) / 3.0;
                if (avgNy * fny < 0) fny = -fny;
                int best = 0; double bd = 1e9;
                for (int k = 0; k < parts.Count; k++) { if (parts[k].Sub) continue; double d = Math.Abs(parts[k].D(x, y, z)); if (d < bd) { bd = d; best = k; } }
                var (col, rough, metal) = colorOf(parts[best].Kind, x, y, z, fny);
                var key = ((float)col[0], (float)col[1], (float)col[2], (float)rough, (float)metal);
                if (!keys.TryGetValue(key, out int li)) { li = o.Looks.Count; keys[key] = li; o.Looks.Add(key); }
                o.TriLook[t] = li;
            }
            return o;
        }

        public static CraftMesh Build(CraftEntry e) => e.Boat ? Boat(CraftCatalog.BoatTypes[e.Type], e.Paint, e.Trim) : Aircraft(CraftCatalog.Air[e.Type], e.Paint, e.Trim);

        public static CraftMesh Boat(BoatSpec s, double[] paint, double[] trim)
        {
            double L = s.L, W = s.W, L2 = L / 2;
            var parts = new List<Part>();
            Func<double, double> deckY = z => s.Free + Math.Max(0, z / L2) * 0.22;
            void Add(string kind, Sdf d, double k = 0) => parts.Add(new Part { Kind = kind, D = d, K = k });
            if (s.Pontoon)
            {
                foreach (var sx in new[] { -1.0, 1.0 }) { var cap = CapsuleZ(-L2 + 0.4, L2 - 0.5, 0.32, 0.28, -0.05); double off = sx * (W / 2 - 0.4); Add("tube", (x, y, z) => cap(x - off, y, z)); }
                Add("deck", RoundBox(0, 0.42, 0, W / 2, 0.06, L2, 0.03));
                var outer = RoundBox(0, 0.85, -0.2, W / 2 - 0.05, 0.4, L2 - 0.6, 0.05); var inner = RoundBox(0, 0.95, -0.2, W / 2 - 0.12, 0.6, L2 - 0.7, 0.05);
                Add("rail", (x, y, z) => Smax(outer(x, y, z), -inner(x, y, z), 0.02));
                Add("console", RoundBox(0.6, 0.9, 1.0, 0.35, 0.45, 0.35, 0.08));
                Add("seat", RoundBox(0, 0.68, -1.5, W / 2 - 0.3, 0.2, 0.5, 0.1));
            }
            else
            {
                Add("hull", (x, y, z) =>
                {
                    double u = Clamp(z / L2, -1, 1);
                    double plan = z > 0 ? 1 - Math.Pow(u, s.Bow) : 1 - Math.Pow(-u, 8);
                    double hw = W / 2 * Math.Sqrt(Math.Max(0, plan)) * (s.Flat ? 1 : (0.88 + 0.12 * Clamp((y + s.Draft) / (s.Free + s.Draft), 0, 1)));
                    double yb = -s.Draft + Math.Abs(x) * s.Dead + Math.Max(0, u - 0.55) * (s.Free * 0.8);
                    double d = Smax(Math.Abs(x) - hw, yb - y, 0.05);
                    d = Smax(d, y - deckY(z), 0.04);
                    return Smax(d, -L2 - z, 0.06);
                });
                if (s.Cockpit != 0)
                    parts.Add(new Part
                    {
                        Sub = true, K = 0.04, Kind = "cockpit",
                        D = (x, y, z) =>
                        {
                            double u = Clamp(z / L2, -1, 1), plan = z > 0 ? 1 - Math.Pow(u, s.Bow) : 1;
                            return Smax(Smax(Math.Abs(x) - (W / 2 * Math.Sqrt(Math.Max(0, plan)) - 0.12), (deckY(z) - s.Cockpit) - y, 0.03), z - L2 * (s.Windshield ? 0.25 : 0.6), 0.05);
                        },
                    });
                if (s.Seat) { Add("seat", RoundBox(0, s.Free + 0.12, -0.2, 0.22, 0.12, 0.7, 0.1)); Add("console", RoundBox(0, s.Free + 0.2, 0.75, 0.25, 0.18, 0.2, 0.08)); }
                if (s.Console != null) Add("console", RoundBox(0, deckY(0) - s.Cockpit + s.Console[1] / 2, s.Console[0], 0.45, s.Console[1] / 2, 0.4, 0.08));
                if (s.TTop)
                {
                    Add("rail", RoundBox(0, deckY(0) - s.Cockpit + 2.1, 0.0, 0.85, 0.04, 0.9, 0.03));
                    var post = RoundBox(0.7, deckY(0) - s.Cockpit + 1.6, 0, 0.03, 0.5, 0.03, 0.015);
                    Add("rail", (x, y, z) => post(Math.Abs(x), y, Math.Abs(z) < 0.8 ? 0 : z));
                }
                if (s.Windshield)
                {
                    double zz = L2 * 0.25; var pane = RoundBox(0, deckY(zz) + 0.25, zz, W / 2 - 0.3, 0.28, 0.04, 0.02);
                    Add("glass", (x, y, z) => Smax(pane(x, y, z - (y - deckY(zz)) * 0.6), Math.Abs(x) - (W / 2 - 0.35), 0.02));
                }
                if (s.Cabin != null)
                {
                    double z0 = s.Cabin[0], z1 = s.Cabin[1], hh = s.Cabin[2];
                    Add("cabin", RoundBox(0, deckY(0) + hh / 2, (z0 + z1) / 2, W / 2 - 0.35, hh / 2, (z0 - z1) / 2, 0.25), 0.05);
                    Add("glass", RoundBox(0, deckY(0) + hh * 0.68, (z0 + z1) / 2, W / 2 - 0.33, hh * 0.13, (z0 - z1) / 2 - 0.3, 0.05));
                    if (s.Flybridge)
                    {
                        Add("cabin", RoundBox(0, deckY(0) + hh + 0.6, (z0 + z1) / 2 - 0.5, W / 2 - 0.9, 0.6, (z0 - z1) / 2 - 1.2, 0.2), 0.05);
                        Add("glass", RoundBox(0, deckY(0) + hh + 0.8, (z0 + z1) / 2 - 0.5, W / 2 - 0.88, 0.15, (z0 - z1) / 2 - 1.5, 0.05));
                    }
                }
                if (s.Mast != 0) { Add("rail", RoundBox(0, deckY(0) + s.Mast / 2, s.Cabin[0] - 1, 0.08, s.Mast / 2, 0.08, 0.04)); Add("rail", RoundBox(0, deckY(0) + s.Mast * 0.7, s.Cabin[0] - 1 - 3, 0.05, 0.05, 3, 0.03)); }
                if (s.Sail != 0) { Add("rail", RoundBox(0, deckY(0) + s.Sail / 2, 0.8, 0.07, s.Sail / 2, 0.07, 0.03)); Add("rail", RoundBox(0, deckY(0) + 1.0, -1.2, 0.05, 0.05, 2.0, 0.03)); }
                if (s.Fan)
                {
                    Add("cage", (x, y, z) => Math.Abs(Hyp2(x, y - 1.6) - 1.0) - 0.03 + Math.Max(0, Math.Abs(z + L2 - 0.6) - 0.08));
                    Add("console", RoundBox(0, 1.6, -L2 + 0.85, 0.3, 0.3, 0.25, 0.1));
                    Add("seat", RoundBox(0, 1.0, -0.5, 0.35, 0.5, 0.35, 0.08));
                }
                if (s.Siren) Add("siren", RoundBox(0, deckY(0) + s.Cabin[2] + 0.12, (s.Cabin[0] + s.Cabin[1]) / 2, 0.45, 0.07, 0.12, 0.04));
            }
            double top = 3 + s.Mast + s.Sail + (s.Flybridge ? 2 : 0);
            double h = Math.Max(0.06, L / 140);
            (double[], double, double) ColorOf(string kind, double x, double y, double z, double ny)
            {
                if (kind == "hull")
                {
                    if (y < 0.0) return (new[] { 0.12, 0.03, 0.03 }, 0.6, 0);   // antifouling
                    if (y < 0.1) return (trim, 0.3, 0.2);                        // boot stripe
                    if (ny > 0.7) return (new[] { 0.62, 0.6, 0.55 }, 0.7, 0);   // non-skid deck
                    return (paint, 0.25, 0.1);
                }
                if (kind == "glass") return (new[] { 0.02, 0.025, 0.03 }, 0.03, 0);
                if (kind == "deck") return (new[] { 0.42, 0.3, 0.18 }, 0.7, 0);
                if (kind == "tube" || kind == "rail" || kind == "cage") return (new[] { 0.7, 0.71, 0.73 }, 0.25, 1);
                if (kind == "seat") return (new[] { 0.85, 0.82, 0.75 }, 0.6, 0);
                if (kind == "siren") return (x < 0 ? new[] { 0.6, 0.02, 0.02 } : new[] { 0.02, 0.05, 0.6 }, 0.2, 0);
                if (kind == "cabin") return (y > deckY(0) + 0.5 ? new[] { 0.9, 0.9, 0.88 } : paint, 0.3, 0);
                return (trim, 0.35, 0.2);
            }
            var o = Mesh(parts, new[] { -W / 2 - 1.2, -s.Draft - 0.1, -L2 - 0.2 }, new[] { W / 2 + 1.2, top, L2 + 0.2 }, h, ColorOf);
            o.Height = top;
            if (s.Sail != 0)
            {
                double d0 = deckY(0);
                o.Sails.Add(new[] { 0, d0 + 1.1, 0.75, 0, d0 + s.Sail - 0.3, 0.75, 0, d0 + 1.1, -3.1 });
                o.Sails.Add(new[] { 0, d0 + 0.6, L2 - 0.3, 0, d0 + s.Sail * 0.8, 0.9, 0, d0 + 0.8, 0.95 });
            }
            if (s.Fan) { o.Props.Add((0, 1.6, -L2 + 0.5)); o.PropLength = 1.8; }
            return o;
        }

        public static CraftMesh Aircraft(AirSpec s, double[] paint, double[] trim)
        {
            var parts = new List<Part>();
            double L2 = s.L / 2;
            void Add(string kind, Sdf d, double k = 0) => parts.Add(new Part { Kind = kind, D = d, K = k });
            if (!s.Heli)
            {
                double r = s.R;
                Add("body", (x, y, z) =>
                {
                    double t = Clamp((z + L2) / s.L, 0, 1); // 0 tail .. 1 nose
                    double rr = r * (t < 0.55 ? 0.25 + 0.75 * Math.Pow(t / 0.55, 0.7) : 1 - Math.Pow((t - 0.55) / 0.45, 3) * 0.55);
                    return Smax(Hyp2(x, (y - 1.2) * (y > 1.2 ? 1 : 1.15)) - rr, Math.Abs(z) - L2, 0.1);
                });
                Add("glass", Ellipsoid(0, 1.2 + r * 0.55, L2 * 0.38, r * 0.62, r * 0.42, r * 1.3));
                Sdf Wing(double y0, double span) => (x, yy, z) => { double chord = 1.5 - Math.Abs(x) / span * 0.6; return RoundBox(0, y0, L2 * 0.2, span / 2, 0.08, chord / 2, 0.05)(x, yy, z - Math.Abs(x) * (s.Jet ? 0.35 : 0.02)); };
                Add("wing", Wing(s.WingY, s.Span), 0.08);
                if (s.Biplane)
                {
                    Add("wing", Wing(s.WingY + 1.3, s.Span * 0.95));
                    var strut = RoundBox(s.Span * 0.3, s.WingY + 0.65, L2 * 0.2, 0.04, 0.65, 0.04, 0.02);
                    Add("strut", (x, y, z) => strut(Math.Abs(x), y, z));
                }
                if (s.High) { var strut = RoundBox(1.3, 1.1, L2 * 0.22, 0.05, 0.05, 0.05, 0.02); Add("strut", (x, y, z) => strut(Math.Abs(x) * 0.3 + 0.9, y - (Math.Abs(x) - 1.0) * 0.18, z)); }
                Add("wing", RoundBox(0, 1.3, -L2 + 0.6, s.Span * 0.2, 0.05, 0.5, 0.04)); // tailplane
                var fin = RoundBox(0, 1.3 + 0.9, -L2 + 0.75, 0.05, 0.9, 0.55, 0.04);
                Add("trim", (x, y, z) => fin(x, y, z + (y - 1.3) * 0.5));
                if (s.Twin || s.Jet)
                    foreach (var sx in new[] { -1.0, 1.0 })
                    {
                        var eng = CapsuleZ(-0.4, 1.4, 0.38, 0.42, s.Jet ? 1.55 : s.WingY - 0.05);
                        double ox = sx * (s.Jet ? 1.35 : 2.6), oz = s.Jet ? -L2 + 2.0 : L2 * 0.2;
                        Add("engine", (x, y, z) => eng(x - ox, y, z - oz));
                    }
                if (s.Floats)
                    foreach (var sx in new[] { -1.0, 1.0 })
                    {
                        var fl = CapsuleZ(-L2 + 1.5, L2 - 0.6, 0.35, 0.22, 0.35); double ox = sx * 1.4;
                        Add("float", (x, y, z) => fl(x - ox, y, z));
                        Add("strut", RoundBox(sx * 1.4, 0.75, 0.6, 0.04, 0.4, 0.04, 0.02));
                    }
                else
                {
                    var main = RoundBox(1.1, 0.32, L2 * 0.12, 0.08, 0.32, 0.18, 0.06);
                    Add("gear", (x, y, z) => main(Math.Abs(x), y, z));
                    Add("gear", RoundBox(0, 0.3, s.Jet ? L2 * 0.7 : L2 * 0.75, 0.07, 0.3, 0.14, 0.05));
                }
            }
            else
            {
                // helicopter: cabin pod, tail boom, skids, rotor mast
                double r = s.R;
                Add("body", Ellipsoid(0, 1.55, 0.6, r, r * 1.0, r * 1.9), 0.15);
                Add("glass", Ellipsoid(0, 1.75, 1.35, r * 0.82, r * 0.72, r * 1.05));
                Add("body", CapsuleZ(-L2 + 0.3, -0.6, 0.18, 0.42, 1.75), 0.25);
                var fin = RoundBox(0, 2.4, -L2 + 0.55, 0.05, 0.7, 0.4, 0.04);
                Add("trim", (x, y, z) => fin(x, y, z + (y - 2.2) * 0.4));
                var skid = RoundBox(0.95, 0.08, 0.6, 0.05, 0.05, 1.7, 0.04); var leg = RoundBox(0.85, 0.45, 0.6, 0.04, 0.4, 0.04, 0.02);
                Add("gear", (x, y, z) => skid(Math.Abs(x), y, z));
                Add("gear", (x, y, z) => leg(Math.Abs(x), y, Math.Abs(z - 0.6) < 0.7 ? 0.6 + 0.7 : z));
                Add("engine", RoundBox(0, 1.55 + r * 0.95, 0.2, 0.35, 0.22, 0.8, 0.15), 0.1);
            }
            double h = Math.Max(0.065, s.L / 150);
            double span = s.Span > 0 ? s.Span : s.R * 2.5;
            (double[], double, double) ColorOf(string kind, double x, double y, double z, double ny)
            {
                if (kind == "glass") return (new[] { 0.02, 0.03, 0.04 }, 0.03, 0);
                if (kind == "trim" || kind == "float") return (trim, 0.3, 0.1);
                if (kind == "gear" || kind == "strut") return (new[] { 0.15, 0.15, 0.16 }, 0.5, 0.6);
                if (kind == "engine") return (new[] { 0.6, 0.6, 0.62 }, 0.3, 0.8);
                if (kind == "body" && Math.Abs(y - 1.2) < 0.08 && !s.Heli) return (trim, 0.3, 0.1); // cheat line
                return (paint, 0.28, 0.15);
            }
            var o = Mesh(parts, new[] { -span / 2 - 0.4, -0.1, -L2 - 0.3 }, new[] { span / 2 + 0.4, 4.2, L2 + 0.4 }, h, ColorOf);
            o.Height = 4.2;
            if (!s.Heli)
            {
                if (!s.Jet)
                {
                    if (!s.Twin) o.Props.Add((0, 1.2, L2 + 0.05));
                    else foreach (var sx in new[] { -1.0, 1.0 }) o.Props.Add((sx * 2.6, s.WingY - 0.05, L2 * 0.2 + 1.5));
                }
            }
            else
            {
                o.Rotor = (0, 1.55 + s.R * 1.25, 0.2); o.RotorLength = s.Rotor;
                o.TailRotor = (0.18, 2.3, -L2 + 0.55);
            }
            return o;
        }
    }
}
