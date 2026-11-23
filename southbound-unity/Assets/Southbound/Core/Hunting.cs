// Hunting with the web game's rules (systems/hunting.js, systems/wilds.js): deer, bucks, coyotes, foxes, wild mustangs
// and longhorn cattle by region and hour, three legendary animals in their own country, the senses (they hear your
// noise, quieter when you walk softly, and smell you downwind), grazing, wandering, fleeing, coyotes and bulls that
// charge and bite, a wounded animal that bleeds (and leaves a trail) until it lies down, pelts graded by how clean
// the kill was, skinning with a knife, meat, the trading posts (pelts, meat, a cooked plate, the licence), and poaching
// (no licence, or a protected animal) as a crime if anyone sees. Positions are on the web map (x, z, heading h).
using System;
using System.Collections.Generic;
using System.Linq;

namespace Southbound.Core
{
    public sealed class Species
    {
        public string Id, Name, Model, Base, Region, Rumour;
        public double H, Hp, Speed, Wary, Pelt, Aggro, Dmg;
        public bool Protected, Herd, Rare, Legend;
        public string[] Regions;
        /// <summary>Clip names: idle, walk, run, eat, death, attack (null where the model has none).</summary>
        public string[] Clips;
        public uint Tint;
    }

    public static class Hunting
    {
        static readonly string[] QC = { "Idle", "Walk", "Gallop", "Eating", "Death", "Attack_Headbutt" };
        public static readonly Dictionary<string, Species> All = Build();
        public static readonly string[] Quality = { "", "poor", "good", "perfect" };
        public static readonly double[] QMult = { 0, 0.45, 0.8, 1.25 };
        /// <summary>Meat off the carcass (lb).</summary>
        public static readonly Dictionary<string, double> Meat = new Dictionary<string, double> { ["deer"] = 45, ["stag"] = 70 };
        /// <summary>When each is about: deer at dawn and dusk, coyotes and foxes at night.</summary>
        public static readonly Dictionary<string, string> Active = new Dictionary<string, string> { ["deer"] = "dusk", ["stag"] = "dusk", ["coyote"] = "night", ["fox"] = "night" };
        public static readonly string[] Legends = { "paleBuck", "oldScar", "ember" };

        static Dictionary<string, Species> Build()
        {
            var d = new Dictionary<string, Species>
            {
                ["deer"] = new Species { Id = "deer", Name = "White-tailed doe", Model = "quaternius/animals_pack/Deer", H = 1.45, Hp = 50, Speed = 11, Wary = 70, Pelt = 90, Clips = QC, Regions = new[] { "Redgrass Plains", "Pinewood Hollow", "Calvera River", "Calvera County", "Bayou Verde" } },
                ["stag"] = new Species { Id = "stag", Name = "White-tailed buck", Model = "quaternius/animals_pack/Stag", H = 1.85, Hp = 70, Speed = 11, Wary = 80, Pelt = 160, Clips = QC, Regions = new[] { "Redgrass Plains", "Pinewood Hollow", "Calvera River", "Calvera County" } },
                ["coyote"] = new Species { Id = "coyote", Name = "Coyote", Model = "quaternius/animals_pack/Wolf", H = 0.85, Hp = 35, Speed = 12, Wary = 55, Pelt = 60, Aggro = 0.25, Dmg = 8, Clips = new[] { "Idle", "Walk", "Gallop", "Eating", "Death", "Attack" }, Regions = new[] { "Redgrass Plains", "Sierra Norte", "Pinewood Hollow" } },
                ["fox"] = new Species { Id = "fox", Name = "Red fox", Model = "khronos/Fox", H = 0.55, Hp = 20, Speed = 10, Wary = 40, Pelt = 75, Clips = new[] { "Survey", "Walk", "Run", "Survey", null, null }, Regions = new[] { "Pinewood Hollow", "Calvera River", "Calvera County", "Mill Creek", "Bayou Verde" } },
                ["horse"] = new Species { Id = "horse", Name = "Wild mustang", Model = "quaternius/animals_pack/Horse", H = 2.2, Hp = 120, Speed = 14, Wary = 60, Pelt = 0, Protected = true, Clips = QC, Regions = new[] { "Redgrass Plains", "Sierra Norte" } },
                ["cow"] = new Species { Id = "cow", Name = "Longhorn cow", Model = "quaternius/animals_pack/Cow", H = 1.7, Hp = 140, Speed = 6, Wary = 12, Pelt = 0, Protected = true, Clips = QC, Regions = new[] { "Redgrass Plains" }, Herd = true },
                ["bull"] = new Species { Id = "bull", Name = "Longhorn bull", Model = "quaternius/animals_pack/Bull", H = 1.85, Hp = 200, Speed = 9, Wary = 18, Pelt = 0, Protected = true, Aggro = 0.6, Dmg = 25, Clips = QC, Regions = new[] { "Redgrass Plains" }, Herd = true, Rare = true },
            };
            void L(string id, string bs, string name, double h, double hp, double wary, double pelt, uint tint, string region, string rumour, double? aggro = null, double? dmg = null)
            {
                var b = d[bs];
                d[id] = new Species
                {
                    Id = id, Base = bs, Name = name, Model = b.Model, H = h, Hp = hp, Speed = b.Speed, Wary = wary, Pelt = pelt, Aggro = aggro ?? b.Aggro, Dmg = dmg ?? b.Dmg, Clips = b.Clips,
                    Regions = new[] { region }, Region = region, Rumour = rumour, Legend = true, Rare = true, Protected = false, Tint = tint,
                };
            }
            L("paleBuck", "stag", "The Pale Buck", 2.25, 170, 120, 900, 0xf4f0e6, "Pinewood Hollow", "A white buck, seen at first light up in Pinewood Hollow. Nobody's got close.");
            L("oldScar", "coyote", "Old Scar", 1.15, 130, 70, 650, 0x6b5644, "Sierra Norte", "A big grey coyote with a torn face, running the high ground in the Sierra Norte. He doesn't run from people.", 0.95, 16);
            L("ember", "fox", "Ember", 0.72, 50, 95, 600, 0xd9541a, "Bayou Verde", "A fox redder than any you've seen, out in Bayou Verde after dark.");
            return d;
        }

        public static string Phase(double hour) => hour < 5 || hour > 21 ? "night" : (hour < 8.5 || hour > 17.5) ? "dusk" : "day";
        static string Kind(Species s) => s.Base ?? s.Id;

        /// <summary>What's about in this region at this hour (null: nothing lives here). More of whatever's active now.</summary>
        public static string Pick(string region, string phase, Random rnd)
        {
            var opts = All.Values.Where(s => !s.Legend && s.Regions.Contains(region) && (!s.Rare || rnd.NextDouble() < 0.2)).ToList();
            if (opts.Count == 0) return null;
            var wt = opts.Select(s => Active.TryGetValue(s.Id, out var a) ? (a == phase ? 2.5 : a == "night" && phase == "day" ? 0.5 : 1) : 1).ToArray();
            double r = rnd.NextDouble() * wt.Sum();
            for (int i = 0; i < opts.Count; i++) if ((r -= wt[i]) <= 0) return opts[i].Id;
            return opts[0].Id;
        }

        /// <summary>The chance a legend shows up on a 45 s check in its region (likelier at its hour).</summary>
        public static double LegendChance(Species L, string phase) => Active.TryGetValue(L.Base, out var a) && a == phase ? 0.35 : 0.08;

        /// <summary>The trading posts (web layout): the plains, the bayou, the forest.</summary>
        public static (double x, double z, string name)[] Posts(MissionData L) => new[]
        {
            (L.PlainsX - 120, L.PlainsZ + 60, "Redgrass Trading Post"), (L.BayouX + 200, L.BayouZ - 220, "Bayou Fur & Hide"), (L.ForestX + 300, L.ForestZ + 260, "Pinewood Game Warden"),
        };

        // ---------------------------------------------------------------- the save: pelts, meat, legends, the licence
        public static bool Licensed(Profile p) => p.Raw.TryGetValue("huntLicence", out var v) && v is bool b && b;
        public static void License(Profile p) => p.Raw["huntLicence"] = true;
        public static double MeatLb(Profile p) => p.Number("meat");

        /// <summary>A pelt lot's worth (older saves kept a count only: those are priced as "good").</summary>
        public static double PeltValue(Profile p, string id)
        {
            double v = p.Section("peltVal").Num(id), n = p.Section("pelts").Num(id);
            return Math.Round(v > 0 ? v : All[id].Pelt * n * QMult[2]);
        }

        /// <summary>Skin a carcass: the pelt (graded), the meat, the legend, the count. Returns the meat (lb).</summary>
        public static double Skin(Profile p, Animal a, Random rnd)
        {
            var s = a.S; int q = a.QualityGrade;
            var pelts = p.Section("pelts"); pelts[a.Id] = pelts.Num(a.Id) + 1;
            var vals = p.Section("peltVal"); vals[a.Id] = vals.Num(a.Id) + Math.Round(s.Pelt * QMult[q]);
            p.AddStat("animals");
            double lb = Math.Round((Meat.TryGetValue(Kind(s), out var m) ? m : 0) * (0.8 + rnd.NextDouble() * 0.4) * (s.Legend ? 1.4 : 1));
            p.SetNumber("meat", p.Number("meat") + lb);
            if (s.Legend) p.Section("legends")[a.Id] = (double)DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            return lb;
        }

        public static bool Taken(Profile p, string legend) => p.Section("legends").ContainsKey(legend);
        public static string Stars(int q) => new string('★', q) + new string('☆', 3 - q);
    }

    /// <summary>One animal's mind and body (the web game's Animal class): graze, walk, flee, charge, bleed, die.</summary>
    public sealed class Animal
    {
        public readonly string Id; public readonly Species S;
        public double X, Y, Z, Heading, Speed, T, Hp, DeadT, AttackT, DripT;
        public string Mode = "graze";
        public bool Dead, Bleed;
        public int Hits, QualityGrade = 3;
        /// <summary>Set when it bites (damage), or wants a drop of blood on the ground (a trail); the game clears them.</summary>
        public double Bit; public bool Drip;
        /// <summary>The last frame's animation: idle, walk, run, eat, attack, death.</summary>
        public string Anim = "eat";
        readonly Random rnd; readonly double size;

        public Animal(string id, double x, double z, ICraftGround g, Random rnd, double size = 1)
        {
            Id = id; S = Hunting.All[id]; this.rnd = rnd; this.size = size;
            X = x; Z = z; Y = g.Height(x, z); Heading = rnd.NextDouble() * Math.PI * 2; T = rnd.NextDouble() * 4; Hp = S.Hp;
        }

        /// <summary>A hit (damage; melee keeps the pelt perfect). True if it killed it.</summary>
        public bool Hurt(double d, bool melee)
        {
            if (Dead) return false;
            Hp -= d; Hits++; Mode = S.Aggro > 0 && rnd.NextDouble() < S.Aggro ? "charge" : "flee"; T = 6;
            // the pelt: one clean shot from the right calibre is perfect; more holes or too big a gun spoil it
            double big = d / S.Hp;
            QualityGrade = Math.Min(QualityGrade, melee ? 3 : big > 4 ? 1 : Hits == 1 && big < 2.6 ? 3 : Hits <= 2 ? 2 : 1);
            if (Hp <= 0) { Die(); return true; }
            if (Hp < S.Hp * 0.75) Bleed = true;   // a wounded animal runs, slows, and leaves a trail
            return false;
        }

        public void Die() { Dead = true; Speed = 0; Hp = 0; Anim = "death"; }

        /// <param name="noise">How much noise you make (1 walking, 3 just after a shot; quieter walking softly).</param>
        /// <param name="windK">The wind's effect for the direction from you to it (Wind.K).</param>
        /// <param name="playerAfoot">Bites only land on someone on foot.</param>
        public void Update(double dt, double px, double pz, double noise, Func<double, double, double> windK, ICraftGround g, bool playerAfoot)
        {
            Bit = 0; Drip = false;
            if (Dead) { DeadT += dt; return; }
            double dx = px - X, dz = pz - Z, d = Math.Sqrt(dx * dx + dz * dz);
            double wk = windK != null ? windK(-dx / (d == 0 ? 1 : d), -dz / (d == 0 ? 1 : d)) : 1;
            double sense = Math.Max(S.Wary * noise * (wk < 1 ? 0.8 : 1), wk > 1 ? S.Wary * wk : 0);
            if ((Mode == "graze" || Mode == "walk") && d < sense) { Mode = S.Aggro > 0 && rnd.NextDouble() < S.Aggro * 0.6 && d < 25 ? "charge" : "flee"; T = 8; }
            if (Bleed)
            {
                Hp -= S.Hp * 0.014 * dt;   // bleeding out (about a minute)
                if ((DripT -= dt) <= 0 && Speed > 0.5) { DripT = 0.45; Drip = true; }
                if (Hp <= 0) { Die(); return; }
            }
            T -= dt;
            double target = 0;
            if (Mode == "flee") { Heading = Math.Atan2(-dx, -dz) + Math.Sin(T * 1.3) * 0.4; target = S.Speed; if (T < 0 && d > S.Wary * 1.5) Mode = "graze"; }
            else if (Mode == "charge")
            {
                Heading = Math.Atan2(dx, dz); target = S.Speed * 1.05;
                if (d < 1.4 + size * 0.5 && (AttackT -= dt) <= 0) { AttackT = 1.2; if (playerAfoot) Bit = S.Dmg > 0 ? S.Dmg : 5; Anim = "attack"; }
                if (T < 0 || d > 60) Mode = "flee";
            }
            else if (Mode == "walk") { target = S.Speed * 0.14; if (T < 0) { Mode = "graze"; T = 4 + rnd.NextDouble() * 8; } }
            else if (T < 0) { Mode = "walk"; T = 3 + rnd.NextDouble() * 5; Heading += (rnd.NextDouble() - 0.5) * 2; }
            if (Bleed) target *= 0.5 + 0.5 * Math.Max(0, Hp / S.Hp);
            Speed += (target - Speed) * Math.Min(1, dt * 3);
            double nx = X + Math.Sin(Heading) * Speed * dt, nz = Z + Math.Cos(Heading) * Speed * dt;
            if (g.Water(nx, nz) - g.Height(nx, nz) < 0.5) { X = nx; Z = nz; } else Heading += 1.5;
            Y = g.Height(X, Z);
            string k = Mode == "charge" || Speed > S.Speed * 0.4 ? "run" : Speed > 0.3 ? "walk" : Mode == "graze" ? "eat" : "idle";
            if (!(Anim == "attack" && AttackT > 0.6)) Anim = k;
        }
    }
}
