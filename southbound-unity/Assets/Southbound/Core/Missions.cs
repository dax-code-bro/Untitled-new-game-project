// Missions and jobs, with the web game's rules (systems/missions.js, missionsplus.js, jobs.js). The data comes
// from the running web game (Data/World/calvera-missions.json, written by the street export): 63 story
// missions in three acts, 12 side jobs (open after so many story missions), the named places they send you
// (already snapped to roads), the 27 job boards where they ended up, and the town layout jobs draw stops from.
// MissionRunner steps through a mission (go here, drive there, take that car, deliver it, take out the
// targets, lose the police, hold on, talk, pay) against an IMissionWorld the game provides; JobShift runs a
// shift (stops against the clock, pay per stop growing with your level, a time bonus, levels every 3 shifts).
// Steps that need a boat, an aircraft, fishing or hunting aren't in the Unity version yet: they're skipped
// with a word to say so, and jobs that need them aren't offered.
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;

namespace Southbound.Core
{
    public sealed class MissionStep
    {
        public string Kind, Place, Car;
        public double N;
        public static readonly HashSet<string> NotHere = new HashSet<string> { "boat", "fly", "fish", "hunt" };
        public bool Supported => !NotHere.Contains(Kind);
    }

    public sealed class Mission
    {
        public string Id, Act, Who, Title, Brief;
        public List<MissionStep> Steps = new List<MissionStep>();
        public int Reward;
        public bool Side;
        /// <summary>Side jobs: story missions done before it opens.</summary>
        public int Need;
        /// <summary>Where the contact waits: the place of the first step that has one (downtown otherwise).</summary>
        public string StartPlace => Steps.FirstOrDefault(s => s.Place != null && s.Kind != "talk" && s.Kind != "pay" && s.Kind != "escape" && s.Kind != "survive")?.Place ?? "downtown";
    }

    public sealed class JobDef
    {
        public string Id, Name, Veh, Area, Text, Kind, Tool, Boat, Air;
        public double X, Z, Wait, Pay, Timer;
        public int Stops, Need;
        public bool Back, Siren, Fly, Land;
        /// <summary>Jobs the Unity version can run: on the road or on foot (no boats, aircraft, fishing or hunting yet).</summary>
        public bool Supported => Boat == null && Air == null && !Fly && Kind != "catch" && Kind != "hunt" && Area != "lake";
    }

    public sealed class MissionData
    {
        public List<Mission> Story = new List<Mission>(), Side = new List<Mission>();
        public Dictionary<string, (double x, double z)> Places = new Dictionary<string, (double, double)>();
        public List<JobDef> Jobs = new List<JobDef>();
        public double CityX0, CityZ0, CityPitch, DowntownX, DowntownZ, TownX0, TownZ0, TownPitch, LakeX, LakeZ, LakeR, PlainsX, PlainsZ, ForestX, ForestZ, AirfieldX1, AirfieldZ;
        public int CityNx, CityNz;

        public static string DefaultFile(string projectRoot) => Path.Combine(projectRoot, "Data", "World", "calvera-missions.json");

        public static MissionData Load(string file) => File.Exists(file) ? Parse(File.ReadAllText(file)) : new MissionData();

        public static MissionData Parse(string json)
        {
            var d = new MissionData();
            var root = MiniJson.Parse(json) as Dictionary<string, object>;
            if (root == null) return d;
            foreach (Dictionary<string, object> m in root.Arr("story") ?? new List<object>()) d.Story.Add(ReadMission(m, false));
            foreach (Dictionary<string, object> m in root.Arr("side") ?? new List<object>()) d.Side.Add(ReadMission(m, true));
            var places = root.Obj("places");
            if (places != null) foreach (var kv in places) if (kv.Value is List<object> p && p.Count >= 2) d.Places[kv.Key] = ((double)p[0], (double)p[1]);
            foreach (Dictionary<string, object> j in root.Arr("jobs") ?? new List<object>())
            {
                var at = j.Arr("at");
                d.Jobs.Add(new JobDef
                {
                    Id = j.Text("id"), Name = j.Text("name"), Veh = j.Text("veh"), Area = j.Text("area"), Text = j.Text("text"), Kind = j.Text("kind"), Tool = j.Text("tool"),
                    Boat = j.Text("boat"), Air = j.Text("air"), X = at != null ? (double)at[0] : 0, Z = at != null ? (double)at[1] : 0,
                    Wait = j.Num("wait"), Pay = j.Num("pay"), Timer = j.Num("timer", 300), Stops = (int)j.Num("stops"), Need = (int)j.Num("need"),
                    Back = j.Flag("back"), Siren = j.Flag("siren"), Fly = j.Flag("fly"), Land = j.Flag("land"),
                });
            }
            var L = root.Obj("layout");
            if (L != null)
            {
                var c = L.Obj("CITY"); var t = L.Obj("TOWN"); var lk = L.Obj("LAKE"); var pl = L.Obj("PLAINS"); var fo = L.Obj("FOREST"); var af = L.Obj("AIRFIELD");
                if (c != null) { d.CityX0 = c.Num("x0"); d.CityZ0 = c.Num("z0"); d.CityNx = (int)c.Num("nx"); d.CityNz = (int)c.Num("nz"); d.CityPitch = c.Num("pitch"); var dt = c.Arr("downtown"); if (dt != null) { d.DowntownX = (double)dt[0]; d.DowntownZ = (double)dt[1]; } }
                if (t != null) { d.TownX0 = t.Num("x0"); d.TownZ0 = t.Num("z0"); d.TownPitch = t.Num("pitch"); }
                if (lk != null) { d.LakeX = lk.Num("x"); d.LakeZ = lk.Num("z"); d.LakeR = lk.Num("r"); }
                if (pl != null) { d.PlainsX = pl.Num("x"); d.PlainsZ = pl.Num("z"); }
                if (fo != null) { d.ForestX = fo.Num("x"); d.ForestZ = fo.Num("z"); }
                if (af != null) { d.AirfieldX1 = af.Num("x1"); d.AirfieldZ = af.Num("z"); }
            }
            return d;
        }

        static Mission ReadMission(Dictionary<string, object> m, bool side)
        {
            var mi = new Mission { Id = m.Text("id"), Act = m.Text("act"), Who = m.Text("who"), Title = m.Text("title"), Brief = m.Text("brief"), Reward = (int)m.Num("reward"), Side = side, Need = (int)m.Num("need") };
            foreach (var o in m.Arr("steps") ?? new List<object>())
            {
                if (!(o is List<object> s) || s.Count == 0) continue;
                var st = new MissionStep { Kind = s[0] as string };
                object a1 = s.Count > 1 ? s[1] : null, a2 = s.Count > 2 ? s[2] : null;
                switch (st.Kind)
                {
                    case "steal": st.Car = a1 as string; st.Place = a2 as string; break;
                    case "kill": st.N = a1 is double k ? k : 1; st.Place = a2 as string; break;
                    case "escape": case "survive": case "fish": case "hunt": case "pay": st.N = a1 is double n ? n : 0; break;
                    case "talk": break;
                    default: st.Place = a1 as string; break;
                }
                mi.Steps.Add(st);
            }
            return mi;
        }

        /// <summary>The next story mission not yet done (in order), or null when the story's over.</summary>
        public Mission NextStory(ICollection<string> done) => Story.FirstOrDefault(m => !done.Contains(m.Id));

        /// <summary>Side jobs open now: enough story missions done, not done yet.</summary>
        public IEnumerable<Mission> OpenSide(ICollection<string> storyDone, ICollection<string> sideDone) => Side.Where(m => storyDone.Count >= m.Need && !sideDone.Contains(m.Id));

        /// <summary>Where a named place is (web coordinates); downtown if it isn't known.</summary>
        public (double x, double z) Place(string name) => name != null && Places.TryGetValue(name, out var p) ? p : Places.TryGetValue("downtown", out var d) ? d : (DowntownX, DowntownZ);
    }

    /// <summary>What a mission or a shift needs from the game (positions in the game's own space).</summary>
    public interface IMissionWorld
    {
        (double x, double z) Place(string name);
        (double x, double z) Me { get; }
        bool OnFoot { get; }
        bool InMissionVehicle { get; }
        bool MissionVehicleWrecked { get; }
        (double x, double z)? MissionVehiclePos { get; }
        double VehicleSpeed { get; }
        int Wanted { get; }
        int FoesLeft { get; }
        bool PlayerDead { get; }
        void Mark(double x, double z, double r);
        void Unmark();
        void SpawnVehicle(string carId, double x, double z);
        void SpawnFoes(int n, double x, double z);
        void RaiseWanted(int stars);
        bool Spend(double amount);
        void Earn(double amount);
        void Say(string who, string line);
        void Big(string title, string sub);
    }

    public sealed class MissionRunner
    {
        public Mission Active { get; private set; }
        public int Step { get; private set; } = -1;
        public double T { get; private set; }
        public (double x, double z, double r)? Marker { get; private set; }
        public event Action<Mission, int> Completed;
        public event Action<Mission, string> Failed;
        double waitT;
        static readonly string[] TalkLines = { "We'll talk more soon.", "Keep your head down.", "Danny trusted you. So do I.", "This town has a long memory." };
        readonly Random rnd;

        public MissionRunner(int seed = 0) { rnd = seed == 0 ? new Random() : new Random(seed); }

        public void Begin(Mission m, IMissionWorld w)
        {
            Active = m; Step = -1; T = 0;
            w.Big(m.Title.ToUpperInvariant(), $"{(m.Side ? "Side job" : m.Act)} · {m.Who}");
            w.Say(m.Who, m.Brief);
            Advance(w);
        }

        void Mark(IMissionWorld w, double x, double z, double r) { Marker = (x, z, r); w.Mark(x, z, r); }

        void Advance(IMissionWorld w)
        {
            Step++;
            if (Marker != null) { Marker = null; w.Unmark(); }
            if (Active == null) return;
            if (Step >= Active.Steps.Count) { Complete(w); return; }
            var s = Active.Steps[Step];
            T = 0; waitT = 0;
            if (!s.Supported)
            {
                w.Say(Active.Who, $"(This part needs {(s.Kind == "boat" ? "a boat" : s.Kind == "fly" ? "an aircraft" : s.Kind == "fish" ? "fishing" : "hunting")}, which isn't in the Unity version yet: skipped.)");
                waitT = 3;
                return;
            }
            switch (s.Kind)
            {
                case "goto": case "drive": case "deliver": { var (x, z) = w.Place(s.Place); Mark(w, x, z, s.Kind == "goto" ? 4 : 8); break; }
                case "steal": { var (x, z) = w.Place(s.Place); w.SpawnVehicle(s.Car, x, z); var p = w.MissionVehiclePos ?? (x, z); Mark(w, p.x, p.z, 3); break; }
                case "kill": { var (x, z) = w.Place(s.Place); w.SpawnFoes(Math.Max(1, (int)s.N), x, z); Mark(w, x, z, 25); break; }
                case "escape": w.RaiseWanted(Math.Max(1, (int)s.N)); break;
                case "pay":
                    if (!w.Spend(s.N)) { w.Say(Active.Who, $"Come back when you have ${s.N:N0}."); Fail(w, "Not enough money"); return; }
                    Advance(w); return;
                case "talk": w.Say(Active.Who, TalkLines[rnd.Next(TalkLines.Length)]); waitT = 2.5; break;
            }
        }

        void Complete(IMissionWorld w)
        {
            var m = Active; Active = null;
            w.Earn(m.Reward);
            w.Big("MISSION PASSED", $"{m.Title} · ${m.Reward:N0}");
            Completed?.Invoke(m, m.Reward);
        }

        public void Fail(IMissionWorld w, string why)
        {
            if (Active == null) return;
            var m = Active; Active = null;
            if (Marker != null) { Marker = null; w.Unmark(); }
            w.Big("MISSION FAILED", why ?? m.Title);
            Failed?.Invoke(m, why ?? "");
        }

        /// <summary>Advance; returns the objective line for the HUD (empty when nothing's running).</summary>
        public string Update(double dt, IMissionWorld w)
        {
            if (Active == null) return "";
            if (w.PlayerDead) { Fail(w, "You died"); return ""; }
            if (Step < 0 || Step >= Active.Steps.Count) return "";
            var s = Active.Steps[Step];
            T += dt;
            string label = Active.Title.ToUpperInvariant() + " · ";
            if (waitT > 0) { waitT -= dt; if (waitT <= 0) Advance(w); return Active == null ? "" : label + (s.Kind == "talk" ? "listen" : "…"); }
            var me = w.Me;
            bool inMarker = Marker is (double mx, double mz, double mr) && (me.x - mx) * (me.x - mx) + (me.z - mz) * (me.z - mz) < mr * mr;
            switch (s.Kind)
            {
                case "goto": if (inMarker && w.OnFoot) Advance(w); return label + "go to the marker";
                case "drive": if (inMarker && !w.OnFoot) Advance(w); return label + (!w.OnFoot ? "drive to the marker" : "get a vehicle and drive to the marker");
                case "steal":
                    if (w.MissionVehicleWrecked) { Fail(w, "The vehicle was wrecked"); return ""; }
                    if (w.InMissionVehicle) Advance(w);
                    else if (w.MissionVehiclePos is (double vx, double vz) && Marker != null) { Marker = (vx, vz, 3); }
                    return label + "take the marked vehicle";
                case "deliver":
                    if (w.MissionVehicleWrecked) { Fail(w, "The vehicle was wrecked"); return ""; }
                    if (inMarker && w.InMissionVehicle && Math.Abs(w.VehicleSpeed) < 2) Advance(w);
                    return label + (w.InMissionVehicle ? "deliver it to the marker" : "get back in the vehicle");
                case "kill": { int left = w.FoesLeft; if (left == 0) Advance(w); return label + $"take out the targets ({left} left)"; }
                case "escape": if (w.Wanted == 0 && T > 2) Advance(w); return label + "lose the police";
                case "survive": if (T >= s.N) Advance(w); return label + $"hold on {Math.Ceiling(s.N - T)}s";
            }
            return label;
        }
    }

    /// <summary>One work shift: stops against the clock, paid per stop (the web game's jobs.js).</summary>
    public sealed class JobShift
    {
        public readonly JobDef Def;
        public readonly List<(double x, double z)> Stops;
        public int Stop { get; private set; }
        public double T { get; private set; }
        public double Earned { get; private set; }
        public readonly double Base;
        public bool Over { get; private set; }
        public bool Ok { get; private set; }
        double waitT;

        public JobShift(JobDef def, int level, List<(double x, double z)> stops)
        {
            Def = def; Stops = stops; T = def.Timer; Base = PayBase(def, level); waitT = def.Wait;
        }

        /// <summary>Pay per stop: 15% more for every level in that job.</summary>
        public static double PayBase(JobDef d, int level) => d.Pay * (1 + (Math.Max(1, level) - 1) * 0.15);

        /// <summary>The reward for finishing early: a quarter of what you earned, scaled by the time left.</summary>
        public static double TimeBonus(double earned, double timeLeft, double timer) => Math.Round(earned * 0.25 * Math.Max(0, timeLeft / Math.Max(1, timer)));

        /// <summary>After a finished shift: (level, xp) -> the next (a level every 3 shifts).</summary>
        public static (int level, int xp) Progress(int level, int xp) => xp + 1 >= 3 ? (level + 1, 0) : (level, xp + 1);

        /// <summary>
        /// Where a shift's stops are drawn from (web coordinates): around a centre, between r0 and r1, on a road
        /// (`road`) or anywhere; the game picks the actual points. Back-to-base jobs end where they started (the
        /// paramedics at the hospital).
        /// </summary>
        public static List<(double x, double z, double r0, double r1, bool road)> StopDraws(JobDef d, MissionData L, Random rnd)
        {
            var o = new List<(double, double, double, double, bool)>();
            double cityCx = L.CityX0 + L.CityNx * L.CityPitch / 2, cityCz = L.CityZ0 + L.CityNz * L.CityPitch / 2;
            for (int i = 0; i < d.Stops; i++)
                switch (d.Area)
                {
                    case "city": o.Add((cityCx, cityCz, 40, 330, true)); break;
                    case "downtown": o.Add((L.DowntownX, L.DowntownZ, 20, 160, true)); break;
                    case "town": o.Add((L.TownX0 + 144, L.TownZ0 + 108, 20, 200, true)); break;
                    case "around": o.Add((d.X, d.Z, 60, 340, false)); break;
                    case "near": o.Add((d.X, d.Z, 15, 60, false)); break;
                    case "forest": o.Add((L.ForestX + 200, L.ForestZ + 180, 40, 200, false)); break;
                    case "plains": o.Add((L.PlainsX, L.PlainsZ, 80, 460, false)); break;
                    default:
                        {
                            var far = new[] { (L.TownX0 + 144, L.TownZ0 + 120), (L.CityX0 + 200, L.CityZ0 + 200), (L.AirfieldX1 - 100, L.AirfieldZ - 40), (L.PlainsX, L.PlainsZ) };
                            var (x, z) = far[(i + rnd.Next(4)) % 4];
                            o.Add((x, z, 0, 30, true));
                            break;
                        }
                }
            if (d.Back) o.Add(d.Id == "paramedic" ? (L.CityX0 + L.CityNx * L.CityPitch + 24, L.CityZ0 + 2 * L.CityPitch, 0, 20, true) : (d.X, d.Z, 0, 6, false));
            return o;
        }

        /// <summary>Advance the clock and the stop you're at; returns what was paid this step (0 if nothing).</summary>
        public double Update(double dt, double distToStop, bool stoppedThere)
        {
            if (Over) return 0;
            T -= dt;
            if (T <= 0) { Over = true; Ok = false; return 0; }
            if (distToStop > Reach || !stoppedThere) return 0;
            waitT -= dt;
            if (waitT > 0) return 0;
            double pay = Math.Round(Base);
            Earned += pay;
            Stop++; waitT = Def.Wait;
            if (Stop >= Stops.Count)
            {
                double bonus = TimeBonus(Earned, T, Def.Timer);
                Earned += bonus; pay += bonus;
                Over = true; Ok = true;
            }
            return pay;
        }

        /// <summary>How close counts as at the stop (a vehicle needs a little more room than someone on foot).</summary>
        public double Reach => Def.Veh != null ? 8 : 4;
        public double Waiting => Math.Max(0, waitT);

        public void Quit() { Over = true; Ok = false; }
    }
}
