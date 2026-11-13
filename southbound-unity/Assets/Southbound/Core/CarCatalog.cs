// The cars: every body the web game builds (the 93 catalogue models, the service vehicles and the base
// bodies traffic uses), exported by tools/southbound/export-unity.mjs (cars step) into
// Data/Vehicles/cars.json. Each one carries the web game's body spec (carbuilder.js: lengths,
// heights, cabin and window lines, lamps, shape features), its handling (accel, top speed, grip) and
// its paint. The bodies are rebuilt from the spec by CarShape + SurfaceNets, the web game's own
// method, so a car in Unity has the same shape as in the browser.
//
// Coordinates here are the web game's car space: z forward (front bumper at +L/2), y up (ground 0),
// x toward the driver's side. CarMeshBuilder turns them into Unity's (x mirrored, like the world).
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;

namespace Southbound.Core
{
    /// <summary>A body spec, field for field as carbuilder.js keeps it (deriveSpec's output).</summary>
    public sealed class CarSpec
    {
        public double L, W, Ride, Rw, Tw, AxF, AxR, Belt, Roof, ZA0, ZA1, ZC0, ZC1, Nose, Hood, Deck, Tail, Hwc, Tumble, ZB, DoorR, GlassBack, Grille;
        public double[] Head = new double[4], Tail4 = new double[4];
        public double[] Bed, Box; // pickup bed [front z, rear z, floor y]; cargo box [front z, rear z, top y]
        public int Spokes;
        public bool Cabover, Bus, TwoTone, Chrome, Tow;
        public string Bar; // "siren", "taxi" or null
        // optional numbers: 0 = not there (the web game's falsy checks)
        public double Fender, Livery, Stripe, Soft, Bulge, Scoop, Waist, Flare, Rack, Spare, Bullbar, Steps, RoofMode, Split, GrilleH, Spoiler, Rust;
        public double[] RoofC, Paint, Paint2;

        public static CarSpec From(Dictionary<string, object> s)
        {
            // (a feature flag can be a number or `true`, as in the web game's spec: true counts as 1)
            double N(string k, double f = 0) => s.TryGetValue(k, out var v) ? (v is double d ? d : v is bool b ? (b ? 1 : 0) : f) : f;
            bool B(string k) => s.TryGetValue(k, out var v) && (v is bool b ? b : v is double d ? d != 0 : v is string str && str.Length > 0);
            double[] A(string k) => s.TryGetValue(k, out var v) && v is List<object> l ? l.Select(o => (double)o).ToArray() : null;
            return new CarSpec
            {
                L = N("L"), W = N("W"), Ride = N("ride"), Rw = N("Rw"), Tw = N("tw"), AxF = N("axF"), AxR = N("axR"), Belt = N("belt"), Roof = N("roof"),
                ZA0 = N("zA0"), ZA1 = N("zA1"), ZC0 = N("zC0"), ZC1 = N("zC1"), Nose = N("nose"), Hood = N("hood"), Deck = N("deck"), Tail = N("tail"),
                Hwc = N("hwc"), Tumble = N("tumble"), ZB = N("zB", -99), DoorR = N("doorR", 99), GlassBack = N("glassBack", -99), Grille = N("grille"),
                Head = A("head") ?? new double[4], Tail4 = A("tail4") ?? new double[4], Bed = A("bed"), Box = A("box"),
                Spokes = (int)N("spokes"), Cabover = B("cabover"), Bus = B("bus"), TwoTone = B("twoTone"), Chrome = B("chrome"), Tow = B("tow"),
                Bar = s.Text("bar"), Fender = N("fender"), Livery = N("livery"), Stripe = N("stripe"), Soft = N("soft"), Bulge = N("bulge"), Scoop = N("scoop"),
                Waist = N("waist"), Flare = N("flare"), Rack = N("rack"), Spare = N("spare"), Bullbar = N("bullbar"), Steps = N("steps"),
                RoofMode = N("roofMode"), Split = N("split"), GrilleH = N("grilleH"), Spoiler = N("spoiler"), Rust = N("rust"),
                RoofC = A("roofC"), Paint = A("paint"), Paint2 = A("paint2"),
            };
        }

        /// <summary>Top of the body's bounding box (roof or cargo box) plus room for roof gear.</summary>
        public double Top => Math.Max(Roof, Box != null ? Box[2] : 0) + 0.25;
    }

    /// <summary>How a car drives (library.js VEHICLES / catalog.js): m/s, m/s, lateral grip per second.</summary>
    public sealed class CarStats { public double Len, Accel, Top, Grip, Weight; }

    public sealed class CarInfo
    {
        public string Id, Class, Name, Base;
        public int Price;
        public bool Restricted, InCatalog;
        public CarStats Stats;
        public CarSpec Spec;
        /// <summary>Fixed paint (police black, taxi yellow...) r, g, b, metalness; null = a random road colour.</summary>
        public double[] Paint, Paint2;
        /// <summary>Driver's seat (hip point) and steering wheel in car space, from cabin.js; null for no cabin.</summary>
        public double[] Seat, SteeringWheel; // seat x, y, z, recline; wheel x, y, z, tilt, radius
    }

    public sealed class CarCatalog
    {
        public readonly List<CarInfo> Cars = new List<CarInfo>();
        /// <summary>Road paint mix: r, g, b, metalness, weight (carbuilder.js PAINTS).</summary>
        public readonly List<double[]> RoadPaints = new List<double[]>();
        /// <summary>Paint shop colours: name, r, g, b, metalness.</summary>
        public readonly List<(string name, double[] rgb, double metal)> ShopPaints = new List<(string, double[], double)>();
        readonly Dictionary<string, CarInfo> byId = new Dictionary<string, CarInfo>();

        public static string DefaultFile(string projectRoot) => Path.Combine(projectRoot, "Data", "Vehicles", "cars.json");

        public CarInfo this[string id] => byId.TryGetValue(id, out var c) ? c : null;

        public static CarCatalog Load(string file) => Parse(File.ReadAllText(file));

        public static CarCatalog Parse(string json)
        {
            var root = MiniJson.Parse(json) as Dictionary<string, object>;
            var cat = new CarCatalog();
            foreach (Dictionary<string, object> c in root.Arr("cars"))
            {
                var st = c.Obj("stats");
                double[] arr(string k) => c.TryGetValue(k, out var v) && v is List<object> l ? l.Select(o => (double)o).ToArray() : null;
                var info = new CarInfo
                {
                    Id = c.Text("id"), Class = c.Text("cls"), Name = c.Text("name"), Base = c.Text("base"), Price = (int)c.Num("price"),
                    Restricted = c.Flag("restricted"), InCatalog = c.Flag("catalog"),
                    Stats = new CarStats { Len = st.Num("len"), Accel = st.Num("accel"), Top = st.Num("top"), Grip = st.Num("grip"), Weight = st.Num("weight") },
                    Spec = CarSpec.From(c.Obj("spec")), Paint = arr("paint"), Paint2 = arr("paint2"),
                };
                var cab = c.Obj("cabin");
                if (cab != null)
                {
                    var s = cab.Obj("seat"); var w = cab.Obj("wheel");
                    info.Seat = new[] { s.Num("x"), s.Num("y"), s.Num("z"), s.Num("th") };
                    info.SteeringWheel = new[] { w.Num("x"), w.Num("y"), w.Num("z"), w.Num("tau"), w.Num("R") };
                }
                cat.Cars.Add(info);
                cat.byId[info.Id] = info;
            }
            foreach (List<object> p in root.Arr("roadPaints")) cat.RoadPaints.Add(p.Select(o => (double)o).ToArray());
            foreach (List<object> p in root.Arr("shopPaints")) cat.ShopPaints.Add(((string)p[0], ((List<object>)p[1]).Select(o => (double)o).ToArray(), (double)p[2]));
            return cat;
        }

        /// <summary>A road colour from the weighted mix (r, g, b, metalness), as carbuilder.js randomPaint.</summary>
        public double[] RandomPaint(Func<double> rnd)
        {
            double total = RoadPaints.Sum(p => p[4]), t = rnd() * total;
            foreach (var p in RoadPaints) if ((t -= p[4]) <= 0) return new[] { p[0], p[1], p[2], p[3] };
            var f = RoadPaints[0];
            return new[] { f[0], f[1], f[2], f[3] };
        }

        /// <summary>A traffic car type, weighted like the web game's randomCarType.</summary>
        public CarInfo RandomTraffic(Func<double> rnd)
        {
            var list = Cars.Where(c => c.Stats.Weight > 0).ToList();
            double t = rnd() * list.Sum(c => c.Stats.Weight);
            foreach (var c in list) if ((t -= c.Stats.Weight) <= 0) return c;
            return this["sedan"] ?? Cars[0];
        }
    }
}
