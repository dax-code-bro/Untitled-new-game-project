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
        public Needs Needs = new Needs();
        public Dictionary<string, double> Stats = new Dictionary<string, double>();
        public int Garage;

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
            p.Stats = Numbers(root.Obj("stats"));
            p.Garage = root.Arr("garage")?.Count ?? 0;
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
