// The arsenal: every weapon and attachment in Southbound, generated exactly as
// the web game does (src/entities/arsenal.js). Weapons are real-world action
// types (service pistol, carbine, pump shotgun, bolt rifle, recurve bow...) made
// by invented Calvera gunmakers. Same seed, same order of random draws, same
// rounding, so every name, stat and price matches the browser version.
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;

namespace Southbound.Core
{
    public sealed class Weapon
    {
        public string Id, Cat, Platform, Name, Icon, FireMode, Caliber, Desc, Kind, ModelKey;
        public int Damage, Clip, Pellets = 1, Explosive, Speed, Scope, Price, Unlock;
        public double Rate, Range, Spread, Recoil, Len;
        public int Pen = 1;
        public bool Silent, Melee;
        public double[] Finish;
        /// <summary>Model proportions (len, barrel, stock, mag, flags) plus "s", the overall scale jitter.</summary>
        public Dictionary<string, double> Model = new Dictionary<string, double>();
        public string MeleeModel;
        public bool IsGun => !Melee;
        public bool Scoped => Scope > 0;
        public Weapon Clone()
        {
            var w = (Weapon)MemberwiseClone();
            w.Model = new Dictionary<string, double>(Model);
            w.Finish = (double[])Finish?.Clone();
            return w;
        }
        public override string ToString() => $"{Id} {Name} dmg {Damage} rate {Rate} clip {Clip} ${Price}";
    }

    public sealed class Attachment
    {
        public string Id, Slot, Name;
        public int Price;
        /// <summary>Multipliers (damage, spread, recoil, range, rate, clip, reload) and flags (silent, zoom, light...).</summary>
        public Dictionary<string, double> Mods = new Dictionary<string, double>();
    }

    public sealed class WeaponCategory
    {
        public string Key, Label;
        public List<string> Ids = new List<string>();
    }

    public sealed class Ammo
    {
        public string Name;
        public double Dmg = 1, Pen, Pellets = 1, Vehicle = 1, Radius;
        public bool Quiet, Slug, Fire;
    }

    public static class Arsenal
    {
        sealed class Plat
        {
            public string K;
            public double Dmg, Rate, Range, Spread, Recoil, Price;
            public int Clip, Pellets, Explosive, Speed, Scope;
            public bool Silent;
            public (string, double)[] Model;
        }

        static Plat P(string k, double dmg, double rate, int clip, double range, double spread, double recoil, double price, (string, double)[] model,
            int pellets = 0, int explosive = 0, int speed = 0, int scope = 0, bool silent = false) =>
            new Plat { K = k, Dmg = dmg, Rate = rate, Clip = clip, Range = range, Spread = spread, Recoil = recoil, Price = price, Model = model, Pellets = pellets, Explosive = explosive, Speed = speed, Scope = scope, Silent = silent };

        static (string, double)[] M(params (string, double)[] m) => m;

        static readonly string[] Makers = { "Calvera Arms", "Gulfline", "Redgrass Works", "Brazos Ordnance", "Port Iron", "Sabine & Co.", "Mill Creek Forge", "Arden Precision", "Sierra Norte Arms", "Bayou Tactical", "Lone Heron", "Cypress Armory" };
        static readonly double[][] Finishes = { new[] { 0.03, 0.03, 0.035 }, new[] { 0.18, 0.16, 0.12 }, new[] { 0.24, 0.22, 0.17 }, new[] { 0.07, 0.09, 0.06 }, new[] { 0.32, 0.33, 0.35 }, new[] { 0.5, 0.5, 0.52 }, new[] { 0.14, 0.06, 0.03 } };

        // category: count, label, base platforms (in the web game's object order)
        static readonly (string key, int count, string label, Plat[] plats)[] Cats =
        {
            ("pistol", 63, "Pistols", new[] {
                P("service", 34, 0.28, 15, 160, 0.012, 0.04, 450, M(("len", 0.19), ("barrel", 0.02), ("stock", 0), ("mag", 0.1))),
                P("compact", 30, 0.24, 10, 120, 0.016, 0.05, 380, M(("len", 0.16), ("barrel", 0.01), ("stock", 0), ("mag", 0.08))),
                P("magnum", 70, 0.6, 6, 190, 0.01, 0.12, 1200, M(("len", 0.24), ("barrel", 0.08), ("stock", 0), ("mag", 0.0), ("revolver", 1))),
                P("machine", 24, 0.07, 20, 110, 0.03, 0.05, 1600, M(("len", 0.2), ("barrel", 0.03), ("stock", 0), ("mag", 0.16))),
                P("target", 40, 0.35, 10, 230, 0.006, 0.04, 1500, M(("len", 0.25), ("barrel", 0.1), ("stock", 0), ("mag", 0.1))),
            }),
            ("rifle", 56, "Assault rifles", new[] {
                P("carbine", 30, 0.09, 30, 320, 0.014, 0.05, 3200, M(("len", 0.55), ("barrel", 0.3), ("stock", 0.25), ("mag", 0.2))),
                P("battle", 44, 0.12, 20, 420, 0.012, 0.08, 4800, M(("len", 0.62), ("barrel", 0.42), ("stock", 0.28), ("mag", 0.18))),
                P("bullpup", 31, 0.08, 30, 330, 0.013, 0.05, 4100, M(("len", 0.6), ("barrel", 0.18), ("stock", 0), ("mag", 0.2), ("bullpup", 1))),
                P("pdw", 25, 0.065, 40, 200, 0.02, 0.04, 2800, M(("len", 0.42), ("barrel", 0.12), ("stock", 0.18), ("mag", 0.24))),
            }),
            ("shotgun", 13, "Shotguns", new[] {
                P("pump", 16, 0.85, 6, 60, 0.07, 0.14, 2100, M(("len", 0.55), ("barrel", 0.45), ("stock", 0.3), ("mag", 0), ("tube", 1)), pellets: 8),
                P("auto", 14, 0.3, 8, 55, 0.08, 0.12, 3600, M(("len", 0.6), ("barrel", 0.4), ("stock", 0.3), ("mag", 0), ("tube", 1)), pellets: 8),
                P("double", 20, 0.25, 2, 45, 0.09, 0.18, 1500, M(("len", 0.45), ("barrel", 0.55), ("stock", 0.32), ("mag", 0), ("wood", 1)), pellets: 9),
            }),
            ("launcher", 12, "Rocket launchers", new[] {
                P("tube", 400, 1.6, 1, 400, 0.004, 0.2, 14000, M(("len", 1.0), ("barrel", 0), ("stock", 0), ("mag", 0), ("tube2", 1)), explosive: 9, speed: 70),
                P("grenade", 220, 0.8, 6, 160, 0.01, 0.15, 9000, M(("len", 0.55), ("barrel", 0.2), ("stock", 0.25), ("mag", 0), ("drum", 1)), explosive: 6, speed: 45),
            }),
            ("bow", 19, "Bows", new[] {
                P("recurve", 60, 1.1, 1, 120, 0.006, 0.0, 600, M(("bow", 1.2)), silent: true, speed: 65),
                P("compound", 85, 1.3, 1, 160, 0.004, 0.0, 1400, M(("bow", 0.95), ("cams", 1)), silent: true, speed: 90),
                P("longbow", 75, 1.4, 1, 150, 0.005, 0.0, 900, M(("bow", 1.6)), silent: true, speed: 75),
            }),
            ("sniper", 13, "Sniper rifles", new[] {
                P("bolt", 140, 1.4, 5, 900, 0.001, 0.2, 8500, M(("len", 0.75), ("barrel", 0.6), ("stock", 0.32), ("mag", 0.08)), scope: 8),
                P("heavy", 260, 1.9, 5, 1200, 0.0015, 0.3, 16000, M(("len", 0.9), ("barrel", 0.75), ("stock", 0.32), ("mag", 0.12), ("brake", 1)), scope: 12),
            }),
            ("marksman", 45, "Marksman rifles", new[] {
                P("dmr", 70, 0.32, 15, 600, 0.003, 0.1, 5600, M(("len", 0.62), ("barrel", 0.48), ("stock", 0.28), ("mag", 0.14)), scope: 4),
                P("lever", 62, 0.55, 8, 420, 0.004, 0.1, 2400, M(("len", 0.5), ("barrel", 0.5), ("stock", 0.3), ("mag", 0), ("tube", 1), ("wood", 1)), scope: 0),
                P("semi", 58, 0.28, 10, 480, 0.004, 0.08, 3900, M(("len", 0.55), ("barrel", 0.45), ("stock", 0.3), ("mag", 0.1), ("wood", 1)), scope: 3),
            }),
        };

        static readonly Dictionary<string, string[]> ModelNames = new Dictionary<string, string[]>
        {
            ["pistol"] = new[] { "P", "Model ", "Defender ", "Ranger ", "Hawk " },
            ["rifle"] = new[] { "AR-", "Mk", "Storm ", "Raptor ", "CR-" },
            ["shotgun"] = new[] { "Model ", "Coachman ", "Marsh " },
            ["launcher"] = new[] { "RL-", "Thunder " },
            ["bow"] = new[] { "", "Heron ", "Cypress " },
            ["sniper"] = new[] { "SR-", "Longshot " },
            ["marksman"] = new[] { "DM-", "Scout ", "Prairie " },
        };
        static readonly Dictionary<string, string> Icons = new Dictionary<string, string>
        {
            ["pistol"] = "🔫", ["rifle"] = "🪖", ["shotgun"] = "💥", ["launcher"] = "🚀", ["bow"] = "🏹", ["sniper"] = "🎯", ["marksman"] = "🎯",
        };

        // how each platform fires, what it's chambered in, how well it penetrates (1-5), and a line about it
        static readonly Dictionary<string, (string fire, string cal, int pen, string desc)> PlatInfo = new Dictionary<string, (string, string, int, string)>
        {
            ["service"] = ("Semi-auto", "9mm", 1, "Polymer-frame duty pistol. Reliable, light, holds a lot of rounds."),
            ["compact"] = ("Semi-auto", "9mm", 1, "Short slide and grip for concealed carry. Snappier to shoot."),
            ["magnum"] = ("Double-action revolver", ".357 Magnum", 2, "Six rounds that hit hard. Slow to reload, impossible to jam."),
            ["machine"] = ("Full-auto", "9mm", 1, "Pistol with a full-auto switch. Empties the magazine in a second."),
            ["target"] = ("Semi-auto", ".22 LR / .38", 1, "Long sight radius and a crisp trigger. Accurate at range."),
            ["carbine"] = ("Semi / full-auto", "5.56 NATO", 3, "The standard modern rifle. Light recoil, goes through car doors."),
            ["battle"] = ("Semi-auto", "7.62 NATO", 4, "Full-power rifle cartridge. Heavy, loud, punches through cover."),
            ["bullpup"] = ("Full-auto", "5.56 NATO", 3, "Rifle-length barrel in a compact body. Great in close quarters."),
            ["pdw"] = ("Full-auto", "9mm / 4.6mm", 2, "Submachine gun. Fast, controllable, short range."),
            ["pump"] = ("Pump-action", "12 gauge", 1, "Buckshot at close range ends arguments. Load slugs for reach."),
            ["auto"] = ("Semi-auto", "12 gauge", 1, "Gas-operated shotgun. Fast follow-up shots."),
            ["double"] = ("Break-action", "12 gauge", 1, "Two barrels, two shots, a lot of noise."),
            ["tube"] = ("Single shot", "84mm rocket", 5, "Disposable launcher. Turns vehicles into scrap."),
            ["grenade"] = ("Revolver cylinder", "40mm grenade", 5, "Six-shot grenade launcher. Lobbed explosive rounds."),
            ["recurve"] = ("Draw", "Arrow", 1, "Silent. Hunters use it to keep the meat clean."),
            ["compound"] = ("Draw", "Arrow", 2, "Cams and cables let you hold a heavy draw. Fast, flat arrows."),
            ["longbow"] = ("Draw", "Arrow", 1, "Traditional bow. Long draw, quiet, satisfying."),
            ["bolt"] = ("Bolt-action", ".308 Winchester", 4, "Scoped bolt rifle. One shot, one kill, at long range."),
            ["heavy"] = ("Bolt-action", ".338 Lapua", 5, "Long-range rifle that goes through engine blocks."),
            ["dmr"] = ("Semi-auto", "7.62 NATO", 4, "Designated marksman rifle. Accurate and quick to follow up."),
            ["lever"] = ("Lever-action", ".30-30", 3, "Classic ranch rifle. Smooth, fast, and still deadly."),
            ["semi"] = ("Semi-auto", ".308 Winchester", 4, "Scoped semi-auto hunting rifle."),
        };

        // knives and other hand weapons: id, name, damage, range, rate, blade length (m), price, kind, line
        static readonly (string id, string name, int dmg, double range, double rate, double len, int price, string kind, string desc)[] MeleeList =
        {
            ("switchblade", "Switchblade", 38, 1.45, 0.42, 0.21, 45, "blade", "Folds into your pocket. Opens with a click."),
            ("kitchen_knife", "Kitchen knife", 40, 1.5, 0.48, 0.32, 18, "blade", "Eight-inch chef's knife. Not made for this."),
            ("hunting_knife", "Hunting knife", 46, 1.55, 0.5, 0.3, 85, "blade", "Fixed blade for skinning game. Holds an edge."),
            ("combat_knife", "Combat knife", 52, 1.6, 0.48, 0.31, 130, "blade", "Seven-inch fixed blade with a guard."),
            ("machete", "Machete", 60, 1.95, 0.75, 0.6, 45, "blade", "Cane knife for clearing brush. Long reach."),
            ("hatchet", "Hatchet", 58, 1.7, 0.8, 0.38, 35, "blade", "Camp hatchet. Heavy head, short handle."),
            ("bat", "Baseball bat", 46, 2.0, 0.85, 0.84, 40, "blunt", "Ash wood, 34 inches."),
            ("crowbar", "Crowbar", 50, 1.85, 0.85, 0.6, 22, "blunt", "Steel pry bar. Opens doors and arguments."),
            ("tire_iron", "Tire iron", 44, 1.8, 0.75, 0.5, 15, "blunt", "Lug wrench from a trunk."),
            ("pipe_wrench", "Pipe wrench", 48, 1.75, 0.85, 0.45, 32, "blunt", "Fourteen-inch cast iron wrench."),
            ("knuckles", "Brass knuckles", 34, 1.4, 0.4, 0.1, 30, "blunt", "Makes a punch hurt a lot more."),
        };

        // attachments: 6 slots x families x 5 tiers
        static readonly (string slot, (string name, (string k, double v)[] mods)[] list)[] Att =
        {
            ("optic", new[] { ("Red dot", M(("spread", 0.9))), ("Holographic", M(("spread", 0.88))), ("Reflex", M(("spread", 0.9))), ("2x scope", M(("zoom", 2))), ("3x scope", M(("zoom", 3))), ("4x scope", M(("zoom", 4))), ("6x scope", M(("zoom", 6))), ("8x scope", M(("zoom", 8))), ("12x scope", M(("zoom", 12))), ("Thermal", M(("zoom", 4), ("thermal", 1))), ("Night vision", M(("zoom", 3), ("night", 1))) }),
            ("muzzle", new[] { ("Suppressor", M(("silent", 1), ("damage", 0.95))), ("Compensator", M(("recoil", 0.8))), ("Flash hider", M(("flash", 0.3))), ("Muzzle brake", M(("recoil", 0.7))), ("Choke", M(("spread", 0.7))), ("Heavy suppressor", M(("silent", 1), ("range", 0.9))) }),
            ("barrel", new[] { ("Short barrel", M(("range", 0.85), ("rate", 0.95))), ("Long barrel", M(("range", 1.2))), ("Heavy barrel", M(("spread", 0.8), ("rate", 1.05))), ("Fluted barrel", M(("rate", 0.95))), ("Match barrel", M(("spread", 0.7))) }),
            ("under", new[] { ("Vertical grip", M(("recoil", 0.85))), ("Angled grip", M(("recoil", 0.9), ("rate", 0.97))), ("Bipod", M(("spread", 0.75))), ("Thumb rest", M(("spread", 0.9))), ("Flashlight", M(("light", 1))), ("Handstop", M(("recoil", 0.92))), ("Underbarrel shotgun", M(("pellets", 1))) }),
            ("mag", new[] { ("Extended mag", M(("clip", 1.5))), ("Drum mag", M(("clip", 2.5), ("reload", 1.3))), ("Fast mag", M(("reload", 0.7))), ("Hollow-point rounds", M(("damage", 1.12))), ("Armor-piercing rounds", M(("damage", 1.08), ("range", 1.1))), ("Tracer rounds", M(("tracer", 1))) }),
            ("stock", new[] { ("Light stock", M(("rate", 0.97))), ("Heavy stock", M(("recoil", 0.85))), ("Folding stock", M(("recoil", 1.1))), ("Cheek riser", M(("spread", 0.9))) }),
        };
        static readonly string[] Tiers = { "", " Mk II", " Mk III", " Elite", " Custom" };

        public static readonly Dictionary<string, Ammo> AmmoTypes = new[]
        {
            new Ammo { Name = "FMJ" }, new Ammo { Name = "Hollow point", Dmg = 1.25, Pen = -1 }, new Ammo { Name = "Armor piercing", Dmg = 0.9, Pen = 2 },
            new Ammo { Name = "Subsonic", Dmg = 0.85, Quiet = true }, new Ammo { Name = "Buckshot" }, new Ammo { Name = "Birdshot", Dmg = 0.35, Pen = -1, Pellets = 2 },
            new Ammo { Name = "Slug", Dmg = 0.85, Pen = 1, Slug = true }, new Ammo { Name = "Flechette", Dmg = 0.9, Pen = 1 }, new Ammo { Name = "Broadhead", Dmg = 1.1 },
            new Ammo { Name = "Small game", Dmg = 0.6, Pen = -1 }, new Ammo { Name = "Fire arrow", Fire = true }, new Ammo { Name = "HE" },
            new Ammo { Name = "HEAT", Pen = 3, Vehicle = 1.6, Radius = 0.7 },
        }.ToDictionary(a => a.Name);

        /// <summary>Every weapon, in the web game's order (fists, the generated guns, the starter 9mm, melee).</summary>
        public static readonly List<Weapon> All = new List<Weapon>();
        public static readonly Dictionary<string, Weapon> ById = new Dictionary<string, Weapon>();
        public static readonly List<WeaponCategory> Categories = new List<WeaponCategory>();
        public static readonly List<Attachment> Attachments = new List<Attachment>();
        public static readonly Dictionary<string, Attachment> AttachmentById = new Dictionary<string, Attachment>();

        static void Add(Weapon w) { if (ById.ContainsKey(w.Id)) All.Remove(ById[w.Id]); All.Add(w); ById[w.Id] = w; }

        static Arsenal()
        {
            Add(new Weapon { Id = "fists", Name = "Fists", Cat = "melee", Icon = "👊", Damage = 26, Range = 1.6, Rate = 0.55, Melee = true, Price = 0, Unlock = 0 });
            foreach (var (cat, count, label, plats) in Cats)
            {
                var entry = new WeaponCategory { Key = cat, Label = label };
                Categories.Add(entry);
                var rng = new Mulberry32((uint)(cat.Length * 7919 + count));
                double r() => rng.Next();
                double jit(double a) => 1 + (r() - 0.5) * a;
                var names = ModelNames[cat];
                for (int i = 0; i < count; i++)
                {
                    var p = plats[i % plats.Length];
                    int tier = i / plats.Length;
                    string maker = Makers[(int)Math.Floor(r() * Makers.Length)];
                    string nm = names[(int)Math.Floor(r() * names.Length)];
                    int num = cat == "pistol" ? 9 + (int)Math.Floor(r() * 40) : 10 + (int)Math.Floor(r() * 90);
                    string x = tier > 2 && r() < 0.5 ? "X" : "";
                    var w = new Weapon { Id = $"{cat}_{(i + 1).ToString("00", CultureInfo.InvariantCulture)}", Cat = cat, Platform = p.K, Name = $"{maker} {nm}{num}{x}" };
                    w.Damage = (int)JsMath.Round(p.Dmg * jit(0.2) * (1 + tier * 0.025));
                    w.Rate = JsMath.ToFixed(p.Rate * jit(0.18), 3);
                    w.Clip = (int)Math.Max(1, JsMath.Round(p.Clip * (p.Clip > 2 ? jit(0.35) : 1)));
                    w.Range = JsMath.Round(p.Range * jit(0.2));
                    w.Spread = p.Spread * jit(0.4);
                    w.Recoil = p.Recoil * jit(0.3);
                    w.Pellets = p.Pellets > 0 ? p.Pellets : 1;
                    w.Explosive = p.Explosive; w.Speed = p.Speed; w.Silent = p.Silent; w.Scope = p.Scope;
                    w.Price = (int)(JsMath.Round(p.Price * jit(0.3) * (1 + tier * 0.08) / 50) * 50);
                    w.Finish = Finishes[(int)Math.Floor(r() * Finishes.Length)];
                    foreach (var (k, v) in p.Model) w.Model[k] = v;
                    w.Model["s"] = jit(0.15);
                    w.Icon = Icons[cat];
                    Add(w);
                    entry.Ids.Add(w.Id);
                }
            }
            foreach (var w in All)
            {
                if (w.Platform != null && PlatInfo.TryGetValue(w.Platform, out var pi)) { w.FireMode = pi.fire; w.Caliber = pi.cal; w.Pen = pi.pen; w.Desc = pi.desc; }
                // better guns unlock as the story goes on (missions completed)
                w.Unlock = w.Price < 1500 ? 0 : w.Price < 4000 ? 2 : w.Price < 8000 ? 5 : w.Price < 14000 ? 10 : 18;
            }
            ById["fists"].Unlock = 0;
            // the starter 9mm (~$450 at city prices)
            var starter = ById["pistol_01"].Clone();
            starter.Id = "pistol"; starter.Name = "Standard 9mm"; starter.Damage = 34; starter.Clip = 17; starter.Price = 360; starter.Unlock = 0; starter.ModelKey = "glock17";
            Add(starter);

            var melee = new WeaponCategory { Key = "melee", Label = "Knives & melee" };
            Categories.Add(melee);
            foreach (var m in MeleeList)
            {
                Add(new Weapon
                {
                    Id = m.id, Name = m.name, Cat = "melee", Icon = m.kind == "blade" ? "🔪" : "🏏", Damage = m.dmg, Range = m.range, Rate = m.rate, Melee = true, Len = m.len,
                    Price = m.price, Kind = m.kind, Pellets = 1, Pen = 1, Spread = 0, Clip = 0, FireMode = m.kind == "blade" ? "Blade" : "Blunt",
                    Caliber = $"{JsMath.Round(m.len * 100).ToString(CultureInfo.InvariantCulture)} cm", Desc = m.desc, Unlock = 0, Platform = "melee", MeleeModel = m.id,
                });
                melee.Ids.Add(m.id);
            }

            foreach (var (slot, list) in Att)
                foreach (var (name, mods) in list)
                    for (int ti = 0; ti < Tiers.Length; ti++)
                    {
                        var a = new Attachment { Id = $"{slot}_{Slug(name)}_{ti + 1}", Slot = slot, Name = name + Tiers[ti], Price = (int)JsMath.Round((250 + ti * 350) * (slot == "optic" ? 1.6 : 1)) };
                        foreach (var (k, v) in mods) a.Mods[k] = v != 1 && k != "zoom" ? 1 + (v - 1) * (1 + ti * 0.2) : v;
                        Attachments.Add(a);
                        AttachmentById[a.Id] = a;
                    }
        }

        static string Slug(string name)
        {
            var sb = new System.Text.StringBuilder();
            bool dash = false;
            foreach (char c in name.ToLowerInvariant())
            {
                if ((c >= 'a' && c <= 'z') || (c >= '0' && c <= '9')) { sb.Append(c); dash = false; }
                else if (!dash) { sb.Append('-'); dash = true; }
            }
            return sb.ToString();
        }

        public static Weapon Get(string id) => id != null && ById.TryGetValue(id, out var w) ? w : null;

        /// <summary>A weapon with its fitted attachments applied, as the arsenal screen does it.</summary>
        public static Weapon WithAttachments(Weapon w, IEnumerable<string> attachmentIds)
        {
            var o = w.Clone();
            if (attachmentIds == null) return o;
            foreach (var id in attachmentIds)
            {
                if (id == null || !AttachmentById.TryGetValue(id, out var a)) continue;
                var m = a.Mods;
                if (m.TryGetValue("damage", out var v) && v != 0) o.Damage = (int)JsMath.Round(o.Damage * v);
                if (m.TryGetValue("spread", out v) && v != 0) o.Spread *= v;
                if (m.TryGetValue("range", out v) && v != 0) o.Range = JsMath.Round(o.Range * v);
                if (m.TryGetValue("rate", out v) && v != 0) o.Rate *= v;
                if (m.TryGetValue("clip", out v) && v != 0) o.Clip = (int)JsMath.Round(o.Clip * v);
                if (m.TryGetValue("recoil", out v) && v != 0) o.Recoil *= v;
                if (m.TryGetValue("silent", out v) && v != 0) o.Silent = true;
                if (m.TryGetValue("zoom", out v) && v != 0) o.Scope = (int)v;
            }
            return o;
        }
    }
}
