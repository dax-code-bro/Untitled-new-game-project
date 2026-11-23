// Calvera's boats and aircraft (the web game's marine-air.js and aviation.js): three marinas (Lake Arden, Port Calvera
// Harbor, Bayou Verde Landing) each with a pier and a counter selling the 15 boats and 98 upgrades and launching the
// ones you own, Redgrass Airfield's office selling the 9 aircraft and 17 upgrades, a speedboat and a Skylark there to
// try from the start, the flight school (three lessons, medals, a pilot's licence: +15% on the flying jobs), the fuel
// pad, landings rated, the tower on the radio, the wind and storms on the airframe, low flying over Port Calvera
// against the law, flight time and highest altitude in your stats. The flight panel and the warnings are on the HUD.
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Southbound.Core;
using UnityEngine;

namespace Southbound
{
    public sealed class Fleet : MonoBehaviour
    {
        [Tooltip("Calvera's heights and water (Data/World/calvera-heights.r16 and calvera-water.r16 copied in as .bytes), and the world header.")]
        public TextAsset heights, water;
        public double half = 2048, cell = 4, hMin = -45, hMax = 228.57, waterMin = 0, waterMax = 91.42, seaLevel = 0;
        public int n = 1025;
        [Tooltip("The missions data (for the layout: lake, city, bayou, airfield).")]
        public TextAsset missions;
        [Tooltip("Craft meshes baked by the builder, by catalogue id (built in the game when missing).")]
        public Mesh[] bakedMeshes;
        public string[] bakedIds;

        public static Fleet Instance { get; private set; }
        /// <summary>Calvera's ground and water, for anything that needs them (boats, fishing, hunting).</summary>
        public static CalveraWorld Ground { get; private set; }
        public MissionData Layout { get; private set; }
        public List<Harbours.Marina> Marinas { get; private set; } = new List<Harbours.Marina>();
        public string Prompt { get; private set; }
        /// <summary>The flight panel (aboard an aircraft) and a warning in red, for the HUD.</summary>
        public string Panel { get; private set; }
        public string Warning { get; private set; }
        public string Objective { get; private set; }
        public Wind Wind { get; } = new Wind();

        SouthboundGame game;
        Harbours.Marina activeMarina;
        int lastTouch; bool wasAir, zone; float padT, lowT; bool warned;
        // the flight school
        FlightSchool.Lesson lesson; CraftBody lessonCraft; float lessonT; int ring; bool landed;
        (double x, double z)[] rings;
        GameObject ringMarker;

        void Awake() { Instance = this; LoadGround(); }
        System.Func<string> hudPrompt, hudObjective, hudPanel, hudWarning;
        void OnEnable()
        {
            Hud.Sources.Add(Blips);
            Hud.Prompts.Add(hudPrompt = () => Prompt); Hud.Objectives.Add(hudObjective = () => Objective);
            Hud.Panels.Add(hudPanel = () => Panel); Hud.Warnings.Add(hudWarning = () => Warning);
        }
        void OnDisable()
        {
            Hud.Sources.Remove(Blips);
            Hud.Prompts.Remove(hudPrompt); Hud.Objectives.Remove(hudObjective); Hud.Panels.Remove(hudPanel); Hud.Warnings.Remove(hudWarning);
        }

        void LoadGround()
        {
            if (Ground != null) return;
            try
            {
                if (heights != null) Ground = CalveraWorld.FromGrids(heights.bytes, water != null ? water.bytes : null, half, cell, n, hMin, hMax, waterMin, waterMax, seaLevel);
#if UNITY_EDITOR
                else
                {
                    // (a scene built before the boats came: read Calvera straight from the project's Data folder)
                    string dir = CalveraWorld.DefaultFolder(Path.GetDirectoryName(Application.dataPath));
                    if (File.Exists(Path.Combine(dir, "calvera-world.json"))) Ground = CalveraWorld.Load(dir);
                }
#endif
            }
            catch (System.Exception e) { Debug.LogWarning("Southbound: couldn't read Calvera's ground for the boats and aircraft: " + e.Message); }
        }

        /// <summary>Does the game have boats / aircraft (the ground is there to float and fly over)?</summary>
        public bool Ready => Ground != null && Layout != null;

        void Start()
        {
            game = SouthboundGame.Instance != null ? SouthboundGame.Instance : FindAnyObjectByType<SouthboundGame>();
            Layout = missions != null ? MissionData.Parse(missions.text) : Southbound.Missions.Instance != null ? Southbound.Missions.Instance.Data : null;
            if (!Ready) { Debug.LogWarning("Southbound: no ground or layout for the boats and aircraft; they're off."); enabled = false; return; }
            Marinas = Harbours.Marinas(Ground, Layout);
            activeMarina = Marinas.FirstOrDefault();
            // a couple to try from the start (the web game's free speedboat and Skylark)
            if (activeMarina != null) { var (x, z, h) = Harbours.BoatSpot(activeMarina); Spawn(CraftCatalog.Find("speedboat"), x, z, h); }
            { var (x, z, h) = Harbours.AirSpawn(Layout); Spawn(CraftCatalog.Find("skylark"), x, z, h); }
            rings = FlightSchool.Rings(Layout);
        }

        static Vector3 U(double x, double z, double y = 0) => new Vector3(-(float)x, (float)y, (float)z);

        /// <summary>Put a craft in the world at a web-map spot.</summary>
        public CraftBody Spawn(CraftEntry e, double x, double z, double heading, IDictionary<string, int> up = null, string uid = null)
        {
            if (e == null || Ground == null) return null;
            var go = new GameObject(e.Name);
            var c = go.AddComponent<CraftBody>();
            c.uid = uid;
            Mesh baked = null;
            if (bakedIds != null) for (int i = 0; i < bakedIds.Length && i < bakedMeshes.Length; i++) if (bakedIds[i] == e.Id) baked = bakedMeshes[i];
            c.Init(e, Ground, x, z, heading, up, baked);
            return c;
        }

        Vector3 Me => game != null && game.player != null ? game.player.transform.position : Vector3.zero;
        bool OnFoot => game != null && game.player != null && game.player.enabled;

        void Update()
        {
            Prompt = null; Panel = null; Warning = null; Objective = null;
            if (!Ready || game == null || Time.timeScale == 0 || StoreScreen.Showing) return;
            float dt = Time.deltaTime;
            var wc = FindWeather();
            string wx = wc != null ? wc.Model.Name : "cloudy";
            Wind.Update(dt, Time.time, wx, wc != null ? wc.Model.Rain : 0);
            Counters();
            var c = Piloting.Instance != null ? Piloting.Instance.Craft : null;
            if (c != null && c.IsAir) Flying(c, dt, wx);
            else { wasAir = false; if (lesson != null && c == null) EndLesson(false, "You left the aircraft"); }
            if (c != null && c.IsBoat) Panel = $"{Mathf.RoundToInt(Mathf.Abs(c.Speed) * 1.944f)} KN   ·   HULL {Mathf.RoundToInt((float)(c.Health / c.MaxHealth * 100))}%";
        }

        WeatherController weather; bool weatherLooked;
        WeatherController FindWeather() { if (!weatherLooked) { weather = FindAnyObjectByType<WeatherController>(); weatherLooked = true; } return weather; }

        // ------------------------------------------------------------------ the counters: marinas, the airfield office, the flight school
        void Counters()
        {
            if (!OnFoot) return;
            var me = Me;
            foreach (var m in Marinas)
                if (Near(me, m.LandX, m.LandZ, 3.5f))
                {
                    Prompt = $"F  visit {m.Name} (boats)";
                    if (SbInput.InteractDown) { activeMarina = m; StoreScreen.Show(new Dealer(this, true, m.Name)); }
                    return;
                }
            var (ox, oz) = Harbours.Office(Layout);
            if (Near(me, ox, oz, 3.5f))
            {
                Prompt = "F  visit the airfield office (aircraft)";
                if (SbInput.InteractDown) StoreScreen.Show(new Dealer(this, false, "Redgrass Airfield · Aircraft"));
                return;
            }
            var (sx, sz) = Harbours.School(Layout);
            if (lesson == null && Near(me, sx, sz, 2.5f))
            {
                var next = NextLesson();
                Prompt = next != null ? $"F  flight school: lesson {next.N} · {next.Name} (${FlightSchool.Price})" : "Redgrass Flight School · licensed pilot ✓";
                if (next != null && SbInput.InteractDown)
                {
                    if (game.Profile.Money < FlightSchool.Price) game.Toast("Lessons are $150");
                    else { game.Profile.Money -= FlightSchool.Price; StartLesson(next); }
                }
            }
        }

        static bool Near(Vector3 me, double x, double z, float r) { var d = new Vector2(me.x + (float)x, me.z - (float)z); return d.sqrMagnitude < r * r; }

        /// <summary>Launch a boat from storage, or a bought one, at the marina you're at (aircraft: the runway or the pad).</summary>
        public CraftBody Launch(Dictionary<string, object> entry)
        {
            var e = CraftCatalog.Find(entry.Text("type"));
            if (e == null) return null;
            string uid = entry.Text("uid");
            foreach (var old in CraftBody.All.ToList()) if (old.uid == uid && old.Pilot == null) Destroy(old.gameObject);   // one of each
            var (x, z, h) = e.Boat ? Harbours.BoatSpot(activeMarina ?? Marinas[0]) : e.Heli ? Harbours.HeliPad(Layout) : Harbours.AirSpawn(Layout);
            var c = Spawn(e, x, z, h, Profile.Upgrades(entry), uid);
            game.Toast($"{e.Name} is ready {(e.Boat ? "at the end of the pier" : "on the " + (e.Heli ? "helipad" : "runway"))}", 3f);
            return c;
        }

        /// <summary>The boat or aircraft upgrades would be fitted to: the one you're aboard, else the last you bought.</summary>
        Dictionary<string, object> LastOwned(bool boats)
        {
            string cat = boats ? "boat" : "air";
            var c = Piloting.Instance != null ? Piloting.Instance.Craft : null;
            if (c != null && c.uid != null && c.IsBoat == boats) { var g = game.Profile.Fleet(cat).FirstOrDefault(x => x.Text("uid") == c.uid); if (g != null) return g; }
            return game.Profile.Fleet(cat).LastOrDefault();
        }

        sealed class Dealer : StoreScreen.IStore
        {
            readonly Fleet f; readonly bool boats; readonly string where;
            public Dealer(Fleet f, bool boats, string where) { this.f = f; this.boats = boats; this.where = where; }
            List<CraftEntry> Catalog => boats ? CraftCatalog.Boats : CraftCatalog.Aircraft;
            List<CraftUpgrade> Ups => boats ? CraftCatalog.BoatUpgrades : CraftCatalog.AirUpgrades;
            public string Title => boats ? $"Marine Sales & Service · {where}" : where;
            public string Keeper => boats ? "The dockmaster looks up from the ledger. \"Looking to get out on the water?\"" : "The duty manager at the desk. \"Cleared for purchase, if your money's good.\"";
            public string[] Tabs => new[] { boats ? $"Boats ({Catalog.Count(c => !c.Restricted)})" : $"Aircraft ({Catalog.Count(c => !c.Restricted)})", $"Upgrades ({Ups.Count})", boats ? "My boats" : "My aircraft" };

            public void Fill(string tab, List<StoreScreen.Row> rows, Profile p)
            {
                string cat = boats ? "boat" : "air";
                if (tab.StartsWith("Boats") || tab.StartsWith("Aircraft"))
                    foreach (var e in Catalog.Where(c => !c.Restricted))
                    {
                        bool own = p.Fleet(cat).Any(g => g.Text("type") == e.Id);
                        var spec = e.Boat ? $"{CraftCatalog.BoatTypes[e.Type].L:0.#} m · up to {CraftCatalog.BoatTypes[e.Type].Top * 1.944:0} knots" : e.Heli ? $"helicopter · {CraftCatalog.Air[e.Type].Top * 1.944:0} knots" : $"{(CraftCatalog.Air[e.Type].Jet ? "jet" : "plane")} · {CraftCatalog.Air[e.Type].Top * 1.944:0} knots";
                        rows.Add(new StoreScreen.Row
                        {
                            Name = e.Name, Sub = spec + (own ? " · you own one" : ""), Price = $"${e.Price:N0}", Enabled = p.Money >= e.Price,
                            Buy = () =>
                            {
                                if (p.Money < e.Price) return;
                                p.Money -= e.Price;
                                var g = p.AddToFleet(cat, e.Id);
                                f.game.Save();
                                f.Launch(g);
                                StoreScreen.Hide();
                            },
                        });
                    }
                else if (tab.StartsWith("Upgrades"))
                {
                    var g = f.LastOwned(boats);
                    if (g == null) return;
                    var have = Profile.Upgrades(g);
                    foreach (var u in Ups)
                    {
                        bool fitted = have.TryGetValue(u.Group, out int t) && t >= u.Tier;
                        string fx = string.Join(", ", new[] { u.Accel > 0 ? $"+{u.Accel * u.Tier * 100:0}% acceleration" : null, u.Top > 0 ? $"+{u.Top * u.Tier * 100:0}% top speed" : null, u.Turn > 0 ? $"+{u.Turn * u.Tier * 100:0}% turning" : null, u.Roll > 0 ? $"+{u.Roll * u.Tier * 100:0}% roll rate" : null, u.Armor > 0 ? $"+{u.Armor * u.Tier:0} hull" : null, u.Effect }.Where(s => s != null));
                        rows.Add(new StoreScreen.Row
                        {
                            Name = u.Name, Sub = u.Group + (fx.Length > 0 ? " · " + fx : ""), Price = fitted ? "Fitted" : $"${u.Price:N0}", Enabled = !fitted && p.Money >= u.Price,
                            Buy = () =>
                            {
                                if (fitted || p.Money < u.Price) return;
                                p.Money -= u.Price;
                                var up = g.Obj("up"); if (up == null) g["up"] = up = new Dictionary<string, object>();
                                up[u.Group] = (double)u.Tier;
                                foreach (var c in CraftBody.All) if (c.uid == g.Text("uid")) c.Upgrade(Profile.Upgrades(g));
                                f.game.Save();
                            },
                        });
                    }
                }
                else
                    foreach (var g in p.Fleet(cat))
                    {
                        var e = CraftCatalog.Find(g.Text("type"));
                        if (e == null) continue;
                        var gg = g;
                        rows.Add(new StoreScreen.Row { Name = e.Name, Sub = "owned · " + (Profile.Upgrades(g).Count == 0 ? "stock" : string.Join(", ", Profile.Upgrades(g).Select(kv => $"{kv.Key} {kv.Value}"))), Price = "Launch", Buy = () => { f.Launch(gg); StoreScreen.Hide(); } });
                    }
            }

            public string Note(string tab)
            {
                if (tab.StartsWith("Upgrades"))
                {
                    var g = f.LastOwned(boats);
                    return g == null ? $"Buy a {(boats ? "boat" : "plane")} first." : $"Fitting to: {CraftCatalog.Find(g.Text("type"))?.Name}";
                }
                if (tab.StartsWith("My")) return "Bring any of your own out of storage.";
                return boats ? "New boats wait at the end of the pier. W throttle, S astern, A/D steer; F at the helm to step off." : "Planes wait on the runway, helicopters on the pad. Refuel by stopping on the fuel pad by the office.";
            }
        }

        // ------------------------------------------------------------------ flying (aviation.js)
        void Flying(CraftBody c, float dt, string wx)
        {
            var v = c.Air;
            var (dx, dz) = Wind.Drift; v.WindX = dx; v.WindZ = dz;
            v.Turb = Wind.Turbulence(wx);
            int kt = Mathf.RoundToInt(Mathf.Abs((float)v.Speed) * 1.944f), ft = Mathf.RoundToInt((float)v.Alt * 3.281f), fpm = Mathf.RoundToInt((float)v.Vy * 196.85f);
            float hdg = ((float)(-v.Heading * Mathf.Rad2Deg) % 360 + 360) % 360;
            Panel = $"{kt} KT   {ft} FT   HDG {Mathf.RoundToInt(hdg):000}°   {(fpm >= 0 ? "+" : "")}{fpm} FPM   FUEL {Mathf.RoundToInt((float)v.Fuel * 100)}%" + (v.Heli ? "" : $"   GEAR {(v.GearDown ? "DN" : "UP")}   FLAPS {(v.Flaps != 0 ? "DN" : "UP")}");
            // warnings
            if (v.Health <= 0 || v.EngineOut) Warning = v.Heli ? "ENGINE OUT · AUTOROTATE" : "ENGINE OUT · GLIDE";
            else if (v.Fuel <= 0) Warning = v.Heli ? "NO FUEL · AUTOROTATE" : "NO FUEL · GLIDE";
            else if (v.Stall) Warning = "STALL";
            else if (v.Airborne && v.Alt < 60 && v.Vy < -8) Warning = "PULL UP";
            else if (v.Fuel < 0.15 && Mathf.FloorToInt(Time.time / 0.6f) % 2 == 1) Warning = "LOW FUEL";
            // badly hurt, the engine can quit
            if (v.Health < 25 && v.Airborne && !v.EngineOut && Random.value < dt * 0.03f) { v.EngineOut = true; game.Toast("The engine coughs and dies.", 2.5f); }
            // landings rated, the radio
            bool nearField = Vector2.Distance(new Vector2((float)v.X, (float)v.Z), new Vector2((float)(Layout.AirfieldX0 + Layout.AirfieldX1) / 2, (float)Layout.AirfieldZ)) < 900;
            string call = $"N{(v.Entry.Id.Length * 97 + 120)}{(v.Heli ? "H" : "RG")}";
            if (v.TouchSeq != lastTouch)
            {
                lastTouch = v.TouchSeq;
                game.Profile.AddStat("landings");
                game.Toast($"{Harbours.LandingWord(v.TouchVs, v.TouchGear)} · {-v.TouchVs * 196.85:0} fpm", 2.4f);
                if (nearField) Radio($"{call}, welcome to Redgrass. Taxi to parking.");
                if (lesson != null && lesson.N == 3 && c == lessonCraft)
                {
                    if (!Harbours.OnRunway(Layout, v.X, v.Z)) EndLesson(false, "You landed off the runway");
                    else if (-v.TouchVs > 3.5 || !v.TouchGear) EndLesson(false, "Too hard a landing");
                    else landed = true;
                }
            }
            if (v.Airborne && !wasAir && nearField) Radio($"{call}, cleared for departure. Winds {Mathf.RoundToInt((float)Wind.Kmh)} km/h.");
            bool inZone = nearField && v.Airborne && v.Alt < 330;
            if (inZone && !zone && wasAir) Radio($"{call}, you're in the pattern. Report final.");
            zone = inZone; wasAir = v.Airborne;
            if (v.Airborne) { game.Profile.AddStat("flightTime", dt); game.Profile.Stats["maxAlt"] = System.Math.Max(game.Profile.Stat("maxAlt"), System.Math.Round(v.Y)); }
            // fuel: stop on the pad (or by a marina in a seaplane)
            var (px, pz) = Harbours.FuelPad(Layout);
            bool atPad = Vector2.Distance(new Vector2((float)v.X, (float)v.Z), new Vector2((float)px, (float)pz)) < 20 || (v.Floats && Marinas.Any(m => Vector2.Distance(new Vector2((float)v.X, (float)v.Z), new Vector2((float)m.WaterX, (float)m.WaterZ)) < 30));
            if (atPad && !v.Airborne && System.Math.Abs(v.Speed) < 1 && v.Fuel < 0.98)
            {
                padT += dt;
                if (padT > 1.5f)
                {
                    int cost = CraftCatalog.FuelCost(v.Fuel, v.Heli);
                    if (game.Profile.Money >= cost) { game.Profile.Money -= cost; v.Fuel = 1; game.Toast($"Refuelled: ${cost:N0}", 2f); }
                    padT = -20;
                }
                else if (padT > 0) Prompt = "Refuelling…";
            }
            else if (padT > 0) padT = 0;
            // low flying over Port Calvera
            bool overCity = Harbours.OverCity(Layout, v.X, v.Z);
            if (overCity && v.Airborne && v.Alt < 70)
            {
                lowT += dt;
                if (lowT > 4 && !warned) { warned = true; Police.Crime("disturbance"); game.Toast("Low flying over the city: the police have your tail number.", 3f); }
            }
            else { lowT = 0; if (!overCity) warned = false; }
            // the lesson
            if (lesson != null && c == lessonCraft) Lesson(v, dt);
        }

        void Radio(string line) => game.Toast("Redgrass tower: " + line, 3.2f);

        FlightSchool.Lesson NextLesson() => FlightSchool.Lessons.FirstOrDefault(l => !game.Profile.FlightSchool.ContainsKey(l.N.ToString()));

        void StartLesson(FlightSchool.Lesson l)
        {
            var e = CraftCatalog.Find("skylark");
            var at = l.N == 3 ? (Layout.AirfieldX0 - 700, Layout.AirfieldZ, System.Math.PI / 2) : Harbours.AirSpawn(Layout);
            var c = Spawn(e, at.Item1, at.Item2, at.Item3);
            if (c == null) return;
            if (l.N == 3) { var v = c.Air; v.Y = Ground.HeightAt(at.Item1, at.Item2) + 150; v.Speed = 38; v.Power = 0.45; v.Airborne = true; v.GearDown = false; }
            Piloting.Instance?.Board(c);
            lesson = l; lessonCraft = c; lessonT = 0; ring = 0; landed = false;
            Hud.Big($"LESSON {l.N}: {l.Name.ToUpperInvariant()}", l.Brief, 5f);
            MarkRing();
        }

        void Lesson(AirModel v, float dt)
        {
            lessonT += dt;
            if (lessonT > lesson.Limit) { EndLesson(false, "Out of time"); return; }
            if (v.Health < 50) { EndLesson(false, "You damaged the trainer"); return; }
            if (lesson.N == 1 && v.Alt > 122) { EndLesson(true, null); return; }
            if (lesson.N == 2)
            {
                var r = rings[ring];
                if (Vector2.Distance(new Vector2((float)v.X, (float)v.Z), new Vector2((float)r.x, (float)r.z)) < 55 && v.Alt > 90 && v.Alt < 310)
                {
                    ring++; game.Toast($"Marker {ring}/4", 1.2f);
                    if (ring >= rings.Length) { EndLesson(true, null); return; }
                    MarkRing();
                }
            }
            if (lesson.N == 3 && landed && System.Math.Abs(v.Speed) < 2) { EndLesson(true, null); return; }
            if (lesson != null) Objective = $"LESSON {lesson.N} · {lesson.Name} · {Mathf.CeilToInt((float)(lesson.Limit - lessonT))} s";
        }

        void MarkRing()
        {
            if (ringMarker != null) ringMarker.SetActive(false);
            if (lesson == null || lesson.N != 2 || ring >= rings.Length) return;
            if (ringMarker == null)
            {
                ringMarker = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
                ringMarker.name = "Flight school marker";
                Destroy(ringMarker.GetComponent<Collider>());
                var mm = Southbound.Missions.Instance != null ? Southbound.Missions.Instance.markerMaterial : null;
                if (mm != null) ringMarker.GetComponent<MeshRenderer>().sharedMaterial = mm;
            }
            var r = rings[ring];
            ringMarker.transform.position = U(r.x, r.z, Ground.HeightAt(r.x, r.z) + 200);
            ringMarker.transform.localScale = new Vector3(100, 110, 100);
            ringMarker.SetActive(true);
        }

        void EndLesson(bool ok, string why)
        {
            if (lesson == null) return;
            var l = lesson; float t = lessonT;
            if (ringMarker != null) ringMarker.SetActive(false);
            if (ok)
            {
                string medal = FlightSchool.Medal(l, t);
                game.Profile.FlightSchool[l.N.ToString()] = medal;
                Hud.Big($"LESSON {l.N} PASSED", $"{l.Name} · {medal} · {Mathf.RoundToInt(t)} s", 4f);
                if (NextLesson() == null && !game.Profile.PilotLicence) { game.Profile.PilotLicence = true; game.Toast("PILOT'S LICENCE: flying jobs pay 15% more. \"Congratulations, captain.\"", 5f); }
            }
            else Hud.Big($"LESSON {l.N} FAILED", why, 3f);
            lesson = null; lessonCraft = null;
            game.Save();
        }

        // ------------------------------------------------------------------ the minimap
        void Blips(List<Hud.Blip> into)
        {
            if (!Ready) return;
            foreach (var m in Marinas) into.Add(new Hud.Blip { at = U(m.LandX, m.LandZ), color = new Color(0.25f, 0.88f, 0.82f), size = 8 });
            var (ox, oz) = Harbours.Office(Layout);
            into.Add(new Hud.Blip { at = U(ox, oz), color = new Color(0.63f, 0.63f, 1f), size = 8 });
            var (sx, sz) = Harbours.School(Layout);
            into.Add(new Hud.Blip { at = U(sx, sz), color = new Color(0.38f, 0.75f, 1f), size = 6 });
            var (px, pz) = Harbours.FuelPad(Layout);
            into.Add(new Hud.Blip { at = U(px, pz), color = new Color(1f, 0.81f, 0.25f), size = 5 });
            if (lesson != null && lesson.N == 2 && ring < rings.Length) into.Add(new Hud.Blip { at = U(rings[ring].x, rings[ring].z), color = new Color(0.38f, 0.75f, 1f), size = 11, keepOnEdge = true });
            foreach (var c in CraftBody.All) if (c.Pilot == null && c.uid != null) into.Add(new Hud.Blip { at = c.transform.position, color = new Color(0.55f, 0.8f, 1f), size = 6 });
        }
    }
}
