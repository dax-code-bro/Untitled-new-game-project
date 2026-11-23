// The player's profile, read from the web game's save (localStorage key
// "southbound.save.v1", exported from the pause menu as southbound-save.json).
// Everything the C# side doesn't use yet is kept in Raw and written back out,
// so a save can go web -> Unity -> web without losing anything.
using System;
using System.Collections.Generic;
using System.Linq;

namespace Southbound.Core
{
    public sealed class Profile
    {
        public const string WebStorageKey = "southbound.save.v1";

        public Dictionary<string, object> Raw = new Dictionary<string, object>();
        public double Money = 150, Bank, Hour = 9.5, PlaySeconds;
        public int Day = 1;
        public string Weather = "cloudy";
        /// <summary>Last position on the map (x, z in metres), or null for the default spawn.</summary>
        public double[] Pos;
        public List<string> OwnedWeapons = new List<string>();
        public Dictionary<string, double> Ammo = new Dictionary<string, double>();
        /// <summary>weapon id -> slot -> attachment id</summary>
        public Dictionary<string, Dictionary<string, string>> Fitted = new Dictionary<string, Dictionary<string, string>>();
        public List<string> OwnedAttachments = new List<string>();
        public List<string> Properties = new List<string>();
        public string Home;
        public Dictionary<string, double> Tools = new Dictionary<string, double>();
        public List<string> MissionsDone = new List<string>();
        /// <summary>Side jobs done (web P.side.done).</summary>
        public List<string> SideDone = new List<string>();
        /// <summary>Per job: level, xp toward the next (3 shifts a level), shifts worked (web P.jobs[id]).</summary>
        public Dictionary<string, double[]> Jobs = new Dictionary<string, double[]>();
        public Needs Needs = new Needs();
        public Dictionary<string, double> Stats = new Dictionary<string, double>();
        /// <summary>Everything you own that's kept in storage (web P.garage): cars, boats ("boat") and aircraft ("air"),
        /// each { uid, cat, type, up: { upgrade group: tier } }.</summary>
        public List<Dictionary<string, object>> GarageList = new List<Dictionary<string, object>>();
        public int Garage => GarageList.Count;
        /// <summary>Flight school medals by lesson number ("1": "gold"...), and the licence they lead to.</summary>
        public Dictionary<string, string> FlightSchool = new Dictionary<string, string>();
        public bool PilotLicence;

        /// <summary>A part of the web save kept as it is (fish on ice, the fishing log, pelts...), made if it isn't there.</summary>
        public Dictionary<string, object> Section(string key)
        {
            if (Raw.TryGetValue(key, out var v) && v is Dictionary<string, object> d) return d;
            d = new Dictionary<string, object>(); Raw[key] = d; return d;
        }
        /// <summary>A list in the web save kept as it is (texts, news...), made if it isn't there.</summary>
        public List<object> List(string key)
        {
            if (Raw.TryGetValue(key, out var v) && v is List<object> l) return l;
            l = new List<object>(); Raw[key] = l; return l;
        }
        /// <summary>A number at the top of the web save (baitCount...), 0 if it isn't there.</summary>
        public double Number(string key) => Raw.TryGetValue(key, out var v) && v is double d ? d : 0;
        public void SetNumber(string key, double v) => Raw[key] = v;
        /// <summary>Bait in the bucket (web P.baitCount).</summary>
        public int BaitCount { get => (int)Number("baitCount"); set => SetNumber("baitCount", value); }
        /// <summary>A tool bought (web career.addTool): one more of it; bait also fills the bucket.</summary>
        public void AddTool(Tool t)
        {
            Tools[t.Id] = (Tools.TryGetValue(t.Id, out var n) ? n : 0) + 1;
            if (t.Fx.TryGetValue("bait", out var b)) BaitCount += (int)b;
        }
        /// <summary>Use one up (a bandage, a repair kit): false if you have none.</summary>
        public bool UseTool(string id) { if (!Tools.TryGetValue(id, out var n) || n <= 0) return false; Tools[id] = n - 1; return true; }

        /// <summary>A stat (web P.stats: fishCaught, animals, flightTime, maxAlt, landings...).</summary>
        public double Stat(string k) => Stats.TryGetValue(k, out var v) ? v : 0;
        public void AddStat(string k, double n = 1) => Stats[k] = Stat(k) + n;

        /// <summary>Your boats ("boat") or aircraft ("air").</summary>
        public IEnumerable<Dictionary<string, object>> Fleet(string cat) => GarageList.Where(g => g.Text("cat") == cat);

        /// <summary>Into storage: a new boat or aircraft (returns its entry).</summary>
        public Dictionary<string, object> AddToFleet(string cat, string type)
        {
            int n = 50000 + GarageList.Count;
            string uid;
            do uid = "c" + n++; while (GarageList.Any(g => g.Text("uid") == uid));
            var e = new Dictionary<string, object> { ["uid"] = uid, ["cat"] = cat, ["type"] = type, ["up"] = new Dictionary<string, object>() };
            GarageList.Add(e);
            return e;
        }

        /// <summary>A fleet entry's upgrades as group -> tier.</summary>
        public static Dictionary<string, int> Upgrades(Dictionary<string, object> entry)
        {
            var o = new Dictionary<string, int>();
            var up = entry?.Obj("up");
            if (up != null) foreach (var kv in up) if (kv.Value is double t) o[kv.Key] = (int)t;
            return o;
        }

        public static Profile New() => FromJson("{\"v\":1}");

        public static Profile FromJson(string json)
        {
            var root = MiniJson.Parse(json) as Dictionary<string, object> ?? throw new FormatException("save is not a JSON object");
            if (root.Num("v", 1) != 1) throw new FormatException($"unknown save version {root.Num("v")}");
            var p = new Profile { Raw = root };
            p.Money = root.Num("money", 150);
            p.Bank = root.Num("bank");
            p.Hour = root.Num("hour", 9.5);
            p.Day = (int)root.Num("day", 1);
            p.PlaySeconds = root.Num("playSeconds");
            p.Weather = root.Text("weather", "cloudy");
            var pos = root.Arr("pos");
            if (pos != null && pos.Count >= 2 && pos[0] is double px && pos[1] is double pz) p.Pos = new[] { px, pz };
            var W = root.Obj("weapons");
            if (W != null)
            {
                p.OwnedWeapons = Strings(W.Arr("owned"));
                p.Ammo = Numbers(W.Obj("ammo"));
                var mods = W.Obj("mods");
                if (mods != null)
                    foreach (var kv in mods)
                    {
                        if (kv.Key == "owned") { p.OwnedAttachments = Strings(kv.Value as List<object>); continue; }
                        if (kv.Value is Dictionary<string, object> slots)
                            p.Fitted[kv.Key] = slots.Where(s => s.Value is string).ToDictionary(s => s.Key, s => (string)s.Value);
                    }
            }
            p.Properties = Strings(root.Arr("properties"));
            p.Home = root.Text("home");
            p.Tools = Numbers(root.Obj("tools"));
            p.MissionsDone = Strings(root.Obj("missions")?.Arr("done"));
            p.SideDone = Strings(root.Obj("side")?.Arr("done"));
            var jobs = root.Obj("jobs");
            if (jobs != null)
                foreach (var kv in jobs)
                    if (kv.Value is Dictionary<string, object> j) p.Jobs[kv.Key] = new[] { j.Num("level", 1), j.Num("xp"), j.Num("runs") };
            p.Stats = Numbers(root.Obj("stats"));
            p.GarageList = (root.Arr("garage") ?? new List<object>()).OfType<Dictionary<string, object>>().ToList();
            var fs = root.Obj("flightSchool");
            if (fs != null) foreach (var kv in fs) if (kv.Value is string medal) p.FlightSchool[kv.Key] = medal;
            p.PilotLicence = root.TryGetValue("pilotLicence", out var lic) && lic is bool lb && lb;
            var n = root.Obj("needs");
            if (n != null) p.Needs = new Needs { Energy = n.Num("energy", 90), Food = n.Num("food", 70), Weight = n.Num("weight", 78) };
            return p;
        }

        /// <summary>Back to the web game's format (unknown fields untouched).</summary>
        public string ToJson()
        {
            var r = new Dictionary<string, object>(Raw)
            {
                ["v"] = 1.0, ["money"] = Money, ["bank"] = Bank, ["hour"] = Hour, ["day"] = (double)Day, ["weather"] = Weather, ["playSeconds"] = PlaySeconds,
                ["pos"] = Pos == null ? null : new List<object> { Pos[0], Pos[1] },
                ["properties"] = Properties.Cast<object>().ToList(), ["home"] = Home,
                ["tools"] = Tools.ToDictionary(k => k.Key, k => (object)k.Value),
                ["stats"] = Stats.ToDictionary(k => k.Key, k => (object)k.Value),
                ["garage"] = GarageList.Cast<object>().ToList(),
                ["flightSchool"] = FlightSchool.ToDictionary(k => k.Key, k => (object)k.Value),
                ["pilotLicence"] = PilotLicence,
                ["needs"] = new Dictionary<string, object> { ["energy"] = Needs.Energy, ["food"] = Needs.Food, ["weight"] = Needs.Weight },
            };
            var W = Raw.Obj("weapons") != null ? new Dictionary<string, object>(Raw.Obj("weapons")) : new Dictionary<string, object>();
            W["owned"] = OwnedWeapons.Cast<object>().ToList();
            W["ammo"] = Ammo.ToDictionary(k => k.Key, k => (object)k.Value);
            var mods = Fitted.ToDictionary(k => k.Key, k => (object)k.Value.ToDictionary(s => s.Key, s => (object)s.Value));
            mods["owned"] = OwnedAttachments.Cast<object>().ToList();
            W["mods"] = mods;
            r["weapons"] = W;
            var missions = Raw.Obj("missions") != null ? new Dictionary<string, object>(Raw.Obj("missions")) : new Dictionary<string, object> { ["active"] = null };
            missions["done"] = MissionsDone.Cast<object>().ToList();
            r["missions"] = missions;
            var side = Raw.Obj("side") != null ? new Dictionary<string, object>(Raw.Obj("side")) : new Dictionary<string, object>();
            side["done"] = SideDone.Cast<object>().ToList();
            r["side"] = side;
            var jobsOut = Raw.Obj("jobs") != null ? new Dictionary<string, object>(Raw.Obj("jobs")) : new Dictionary<string, object>();
            foreach (var kv in Jobs)
            {
                var j = jobsOut.Obj(kv.Key) != null ? new Dictionary<string, object>(jobsOut.Obj(kv.Key)) : new Dictionary<string, object>();
                j["level"] = kv.Value[0]; j["xp"] = kv.Value[1]; j["runs"] = kv.Value[2];
                jobsOut[kv.Key] = j;
            }
            r["jobs"] = jobsOut;
            return MiniJson.Write(r);
        }

        /// <summary>A weapon as this player has it (with their fitted attachments).</summary>
        public Weapon Loadout(string weaponId)
        {
            var w = Arsenal.Get(weaponId);
            if (w == null) return null;
            return Fitted.TryGetValue(weaponId, out var slots) ? Arsenal.WithAttachments(w, slots.Values) : w.Clone();
        }

        static List<string> Strings(List<object> a) => a == null ? new List<string>() : a.OfType<string>().ToList();
        static Dictionary<string, double> Numbers(Dictionary<string, object> o) =>
            o == null ? new Dictionary<string, double>() : o.Where(kv => kv.Value is double).ToDictionary(kv => kv.Key, kv => (double)kv.Value);
    }
}
