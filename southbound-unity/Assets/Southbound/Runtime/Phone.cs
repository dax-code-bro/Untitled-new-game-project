// The phone (I), the web game's phone.js and phoneplus.js: your inventory (use a first-aid kit, a repair kit, the
// flashlight, a hunting call), the garage (boats to the nearest marina, aircraft to the airfield, a car from storage),
// your weapons (take one out), the jobs and the story so far (GPS to a job board), every place in Calvera nearest first
// (GPS: a marker and a dot on the minimap's rim), Runr (food, a gun or your car towed, by courier), a cab to anywhere
// (paid by the mile; the clock moves on), the bank (balance anywhere, deposits and withdrawals at a Gulf Mart), texts,
// the Calvera Courier's news (the police log makes the paper), the weather, your stats and Save. L lights the
// flashlight (or the phone's own, dimmer).
using System.Collections.Generic;
using System.Linq;
using Southbound.Core;
using UnityEngine;

namespace Southbound
{
    public sealed class Phone : MonoBehaviour
    {
        public static Phone Instance { get; private set; }
        SouthboundGame game;
        string Prompt;
        System.Func<string> hudPrompt, hudObjective;

        // the GPS waypoint
        GameObject marker; Vector3 wpAt; string wpLabel; bool wp;
        // Runr deliveries and the cab
        sealed class Order { public string label; public float wait; public System.Action arrive; }
        readonly List<Order> orders = new List<Order>();
        (Vector3 at, string name, float t, double mi)? ride;
        int lastDay = -1; float lastStory = -999;
        Light torch; bool torchOn;

        void Awake() => Instance = this;
        void OnEnable() { Hud.Sources.Add(Blips); Hud.Prompts.Add(hudPrompt = () => Prompt); Hud.Objectives.Add(hudObjective = () => ride != null ? "CAB · waiting for your ride…" : null); Police.Reported += OnCrime; }
        void OnDisable() { Hud.Sources.Remove(Blips); Hud.Prompts.Remove(hudPrompt); Hud.Objectives.Remove(hudObjective); Police.Reported -= OnCrime; }

        void Start()
        {
            game = SouthboundGame.Instance;
            if (game != null && game.Profile.List("news").Count == 0) for (int i = 0; i < 3; i++) PhoneBook.News(game.Profile, PhoneBook.Filler[Random.Range(0, PhoneBook.Filler.Length)]);
        }

        void OnCrime(string kind)
        {
            if (game == null || Time.time - lastStory < 30) return;
            string story = PhoneBook.CrimeStory(kind, Region());
            if (story == null) return;
            lastStory = Time.time; PhoneBook.News(game.Profile, story);
        }

        string Region() { var f = Fleet.Instance; if (f == null || !f.Ready || game.player == null) return "Calvera"; var p = game.player.transform.position; return Regions.At(-p.x, p.z, f.Layout); }

        void Update()
        {
            Prompt = null;
            if (game == null) game = SouthboundGame.Instance;
            if (game == null || game.player == null) return;
            var p = game.Profile;
            // a new day: interest, a paper
            if (lastDay < 0) lastDay = p.Day;
            if (p.Day != lastDay)
            {
                lastDay = p.Day;
                double i = PhoneBook.Interest(p.Bank);
                if (i > 0) { p.Bank += i; PhoneBook.Text(p, "Gulf Coast Bank", $"Interest paid: ${i:N0}. Balance ${p.Bank:N0}."); }
                PhoneBook.News(p, PhoneBook.Filler[Random.Range(0, PhoneBook.Filler.Length)]);
            }
            if (Time.timeScale == 0 || StoreScreen.Showing) return;
            float dt = Time.deltaTime;
            if (SbInput.LetterDown('I') && game.Health > 0) { StoreScreen.Show(new Screen(this)); return; }
            Torch();
            // the waypoint: reached on foot
            if (wp && game.player.enabled && new Vector2(game.player.transform.position.x - wpAt.x, game.player.transform.position.z - wpAt.z).sqrMagnitude < 64) ClearWaypoint();
            if (wp && marker != null) marker.transform.position = new Vector3(wpAt.x, Pedestrians.Ground(wpAt + Vector3.up * 400, 800, wpAt.y) + 40, wpAt.z);
            // couriers
            for (int k = orders.Count - 1; k >= 0; k--)
            {
                var o = orders[k];
                if ((o.wait -= dt) > 0) continue;
                if (!game.player.enabled) { o.wait = 3; continue; }   // they wait till you're on foot
                orders.RemoveAt(k);
                o.arrive();
                game.Toast("Runr courier: \"Sign here. Have a good one.\"", 2.4f);
            }
            // the cab
            if (ride is (Vector3 at, string name, float t, double mi))
            {
                if (!game.player.enabled || (Police.Instance != null && Police.Instance.Stars > 0)) { game.Toast("Cab: \"Forget it.\" (no refund)", 2f); ride = null; }
                else if ((t -= dt) <= 0)
                {
                    ride = null;
                    Teleport(Kerb(at), at);
                    p.Hour = (p.Hour + PhoneBook.CabHours(mi)) % 24;
                    Hud.Big("", $"Dropped off at {name}.", 2f);
                }
                else ride = (at, name, t, mi);
            }
        }

        // ------------------------------------------------------------------ GPS
        public void SetWaypoint(Vector3 at, string label)
        {
            wpAt = at; wpLabel = label; wp = true;
            if (marker == null)
            {
                marker = GameObject.CreatePrimitive(PrimitiveType.Cylinder); marker.name = "GPS waypoint";
                Destroy(marker.GetComponent<Collider>());
                var mm = Missions.Instance != null ? Missions.Instance.markerMaterial : null;
                if (mm != null) marker.GetComponent<MeshRenderer>().sharedMaterial = mm;
            }
            marker.transform.localScale = new Vector3(6, 40, 6);
            marker.SetActive(true);
            game.Toast("GPS: " + label, 2f);
        }
        public void ClearWaypoint() { wp = false; if (marker != null) marker.SetActive(false); }

        void Blips(List<Hud.Blip> into) { if (wp) into.Add(new Hud.Blip { at = wpAt, color = new Color(1f, 0.25f, 0.38f), size = 10, keepOnEdge = true }); }

        // ------------------------------------------------------------------ the flashlight
        void Torch()
        {
            bool afoot = game.player.enabled;
            double best = Tools.Best(game.Profile.Tools, "light");
            if (afoot && SbInput.LightsDown) { torchOn = !torchOn; game.Toast(best > 0 ? $"Flashlight {(torchOn ? "on" : "off")}" : $"Phone light {(torchOn ? "on" : "off")}", 1.2f); }
            if (torch == null)
            {
                var go = new GameObject("Flashlight");
                torch = go.AddComponent<Light>(); torch.type = LightType.Spot; torch.spotAngle = 52; torch.range = 30; torch.color = new Color(1f, 0.95f, 0.87f); torch.shadows = LightShadows.Soft;
            }
            bool on = torchOn && afoot;
            torch.enabled = on;
            if (!on) return;
            var t = game.player.transform;
            torch.intensity = best > 0 ? 40f * (float)best : 14f;
            torch.transform.SetPositionAndRotation(t.position + t.forward * 0.3f + Vector3.up * 1.45f, Quaternion.LookRotation(t.forward * 10 - Vector3.up * 1.45f));
        }

        // ------------------------------------------------------------------ getting about
        static Vector3 U(double x, double z) => new Vector3(-(float)x, 0, (float)z);

        /// <summary>Every place worth going to: the shops and services, the marinas and the airfield, the tool stores and trading posts, the job boards.</summary>
        public List<(string name, string kind, Vector3 at)> Places()
        {
            var o = new List<(string, string, Vector3)>();
            if (Shops.Instance != null) foreach (var s in Shops.Instance.shops) o.Add((s.name, s.kind == "guns" ? "Gun store" : s.kind == "clothes" ? "Clothing" : s.kind == "mart" ? "Gulf Mart" : s.kind, s.door));
            var f = Fleet.Instance;
            if (f != null && f.Ready)
            {
                foreach (var m in f.Marinas) o.Add((m.Name, "Marina (boats)", U(m.LandX, m.LandZ)));
                var (ox, oz) = Harbours.Office(f.Layout); o.Add(("Redgrass Airfield", "Aircraft", U(ox, oz)));
                var (sx, sz) = Harbours.School(f.Layout); o.Add(("Redgrass Flight School", "Lessons", U(sx, sz)));
                foreach (var t in Tools.Stores(f.Layout)) o.Add((t.name, "Tools", U(t.x, t.z)));
                foreach (var t in Hunting.Posts(f.Layout)) o.Add((t.name, "Trading post", U(t.x, t.z)));
                if (Fleet.Instance.Marinas.Count > 0) { var m0 = Fleet.Instance.Marinas[0]; o.Add(("Fish Market (Lake Arden)", "Sell your catch", U(m0.LandX - 6, m0.LandZ + 4))); }
            }
            if (Missions.Instance != null) foreach (var j in Missions.Instance.Data.Jobs) o.Add((j.Name, "Job board", U(j.X, j.Z)));
            foreach (var extra in MorePlaces) foreach (var x in extra()) o.Add(x);
            var me = game.player.transform.position;
            return o.OrderBy(x => (x.Item3 - me).sqrMagnitude).ToList();
        }
        /// <summary>Other systems add places (your homes).</summary>
        public static readonly List<System.Func<IEnumerable<(string, string, Vector3)>>> MorePlaces = new List<System.Func<IEnumerable<(string, string, Vector3)>>>();

        Vector3 Kerb(Vector3 place)
        {
            var tr = FindAnyObjectByType<Traffic>();
            if (tr == null || !tr.Ready) return place + new Vector3(3, 0, 3);
            int lane = tr.NearestLane(place, out float s);
            var (q, dir) = tr.Sample(lane, s);
            var road = new Vector3(q.x, 0, q.y);
            var to = place - road; to.y = 0;
            float d = to.magnitude;
            return d < 150 ? road + to.normalized * Mathf.Min(d, 6f) : place + new Vector3(3, 0, 3);
        }

        void Teleport(Vector3 at, Vector3 face)
        {
            var t = game.player.transform;
            var cc = t.GetComponent<CharacterController>();
            if (cc != null) cc.enabled = false;
            at.y = Pedestrians.Ground(at + Vector3.up * 400, 800, at.y) + 0.05f;
            var look = face - at; look.y = 0;
            t.SetPositionAndRotation(at, look.sqrMagnitude > 0.01f ? Quaternion.LookRotation(look) : t.rotation);
            if (cc != null) cc.enabled = true;
        }

        bool AtAtm()
        {
            if (Shops.Instance == null) return false;
            var me = game.player.transform.position;
            return Shops.Instance.shops.Any(s => s.kind == "mart" && (s.door - me).sqrMagnitude < 14f * 14f);
        }

        // ------------------------------------------------------------------ the phone's screen
        sealed class Screen : StoreScreen.IStore
        {
            readonly Phone ph;
            public Screen(Phone ph) { this.ph = ph; }
            SouthboundGame G => ph.game;
            public string Title => $"Phone · {PhoneBook.Clock(G.Profile.Hour)} · day {G.Profile.Day}";
            public string Keeper { get { int u = PhoneBook.Unread(G.Profile); return u > 0 ? $"✉ {u} new message{(u > 1 ? "s" : "")}" : "No new messages."; } }
            public string[] Tabs => new[] { "Inventory", "Garage", "Weapons", "Jobs", "Story", "Places", "Runr", "Cab", "Bank", "Messages", "News", "Weather", "Stats & save" }.Concat(MoreTabs.Select(t => t.name)).ToArray();
            /// <summary>Other systems' tabs (Properties).</summary>

            public void Fill(string tab, List<StoreScreen.Row> rows, Profile p)
            {
                var more = MoreTabs.FirstOrDefault(t => t.name == tab);
                if (more.fill != null) { more.fill(rows, p); return; }
                switch (tab)
                {
                    case "Inventory": Inventory(rows, p); break;
                    case "Garage": Garage(rows, p); break;
                    case "Weapons":
                        var gun = Gunplay.Instance;
                        if (gun == null) break;
                        foreach (var id in gun.Owned.Where(id => id != "fists"))
                        {
                            var w = Arsenal.Get(id); if (w == null) continue; string wid = id;
                            bool cur = gun.Weapon != null && gun.Weapon.Id == id;
                            rows.Add(new StoreScreen.Row { Name = w.Name, Sub = w.Melee ? (w.Cat ?? "melee") : $"takes {w.Caliber} · {(p.Ammo.TryGetValue(id, out var a) ? a : 0):0} rounds", Price = cur ? "Equipped" : "Equip", Enabled = !cur, Buy = () => gun.EquipId(wid) });
                        }
                        break;
                    case "Jobs":
                        foreach (var j in Missions.Instance != null ? Missions.Instance.Data.Jobs : new List<JobDef>())
                        {
                            var lv = p.Jobs.TryGetValue(j.Id, out var jj) ? jj : null; var jd = j;
                            rows.Add(new StoreScreen.Row { Name = j.Name, Sub = j.Text + (lv != null ? $" · level {lv[0]:0}, {lv[2]:0} shifts" : ""), Price = "GPS", Buy = () => { ph.SetWaypoint(U(jd.X, jd.Z), jd.Name); StoreScreen.Hide(); } });
                        }
                        break;
                    case "Story":
                        if (Missions.Instance == null) break;
                        var next = Missions.Instance.Data.NextStory(p.MissionsDone);
                        int n = 0;
                        foreach (var m in Missions.Instance.Data.Story)
                        {
                            bool done = p.MissionsDone.Contains(m.Id); n++;
                            rows.Add(new StoreScreen.Row { Name = $"{n}. {m.Title}", Sub = $"{m.Act} · {m.Who} · ${m.Reward:N0}" + (m == next ? " · " + m.Brief : ""), Price = done ? "Done" : m == next ? "Next" : "Locked", Enabled = false });
                        }
                        break;
                    case "Places":
                        foreach (var (name, kind, at) in ph.Places().Take(60))
                        {
                            float d = Vector3.Distance(at, G.player.transform.position); var a2 = at; var n2 = name;
                            rows.Add(new StoreScreen.Row { Name = name, Sub = $"{kind} · {Far(d)} away", Price = "GPS", Buy = () => { ph.SetWaypoint(a2, n2); StoreScreen.Hide(); } });
                        }
                        break;
                    case "Runr": Runr(rows, p); break;
                    case "Cab":
                        foreach (var (name, kind, at) in ph.Places().Take(40))
                        {
                            var (fare, mi) = PhoneBook.Cab(Vector3.Distance(at, G.player.transform.position)); var a3 = at; var n3 = name;
                            rows.Add(new StoreScreen.Row
                            {
                                Name = name, Sub = $"{kind} · {mi:0.0} mi", Price = $"${fare:N0}", Enabled = p.Money >= fare,
                                Buy = () =>
                                {
                                    if (!G.player.enabled) { G.Toast("Step out of the vehicle to be picked up.", 1.8f); return; }
                                    if (Police.Instance != null && Police.Instance.Stars > 0) { G.Toast("Cab: \"Not with the cops after you, friend.\"", 2f); return; }
                                    if (p.Money < fare) return;
                                    p.Money -= fare; ph.ride = (a3, n3, 6 + Random.value * 6, mi);
                                    G.Toast($"Cab on its way to you (${fare:N0}). Wait here.", 2.5f); StoreScreen.Hide();
                                },
                            });
                        }
                        break;
                    case "Bank":
                        bool atm = ph.AtAtm();
                        foreach (var (k, amt) in new[] { ("dep", 100.0), ("dep", 1000.0), ("all", p.Money), ("wd", 100.0), ("wd", 1000.0) })
                        {
                            bool dep = k != "wd"; double a = k == "all" ? System.Math.Floor(p.Money) : amt;
                            rows.Add(new StoreScreen.Row
                            {
                                Name = k == "all" ? "Deposit everything" : $"{(dep ? "Deposit" : "Withdraw")} ${a:N0}", Sub = dep ? "Cash into your account" : "Cash from your account",
                                Price = atm ? "OK" : "ATM only", Enabled = atm && a > 0 && (dep ? p.Money >= a : p.Bank >= a),
                                Buy = () => { if (dep) { p.Money -= a; p.Bank += a; } else { p.Bank -= a; p.Money += a; } G.Save(); },
                            });
                        }
                        break;
                    case "Messages":
                        foreach (var t in p.List("texts").OfType<Dictionary<string, object>>()) rows.Add(new StoreScreen.Row { Name = (t.Flag("unread") ? "● " : "") + t.Text("from"), Sub = $"{t.Text("body")} · day {t.Num("day"):0}, {PhoneBook.Clock(t.Num("hour"))}", Price = "·", Enabled = false });
                        PhoneBook.ReadAll(p);
                        break;
                    case "News":
                        foreach (var t in p.List("news").OfType<Dictionary<string, object>>()) rows.Add(new StoreScreen.Row { Name = t.Text("text"), Sub = $"Calvera Courier · day {t.Num("day"):0}", Price = "·", Enabled = false });
                        break;
                    case "Weather":
                        var wc = FindAnyObjectByType<WeatherController>();
                        string now = wc != null ? wc.Model.Name : "cloudy";
                        rows.Add(new StoreScreen.Row { Name = "Now: " + PhoneBook.WeatherWord(now), Sub = $"{ph.Region()} · wind {(Fleet.Instance != null ? Fleet.Instance.Wind.Kmh : 8):0} km/h", Price = "·", Enabled = false });
                        if (wc != null && wc.Model.Upcoming >= 0)
                        {
                            string nx = Weather.Order[wc.Model.Upcoming].Name;
                            rows.Add(new StoreScreen.Row { Name = $"From about {PhoneBook.Clock((p.Hour + wc.Model.NextChange) % 24)}: {PhoneBook.WeatherWord(nx)}", Sub = PhoneBook.WeatherAdvice(nx), Price = "·", Enabled = false });
                        }
                        break;
                    default:
                        rows.Add(new StoreScreen.Row { Name = "Save game", Sub = SouthboundGame.SavePath, Price = "Save", Buy = () => G.Save() });
                        rows.Add(new StoreScreen.Row { Name = "Money", Sub = $"${p.Money:N0} on you · ${p.Bank:N0} in the bank", Price = "·", Enabled = false });
                        rows.Add(new StoreScreen.Row { Name = "Story", Sub = $"{p.MissionsDone.Count} / {(Missions.Instance != null ? Missions.Instance.Data.Story.Count : 63)} missions · {p.SideDone.Count} side jobs", Price = "·", Enabled = false });
                        foreach (var kv in p.Stats.OrderBy(k => k.Key)) rows.Add(new StoreScreen.Row { Name = System.Text.RegularExpressions.Regex.Replace(kv.Key, "([A-Z])", " $1").ToLowerInvariant(), Sub = kv.Value.ToString("N0"), Price = "·", Enabled = false });
                        break;
                }
            }

            static string Far(float d) => d < 1609 ? $"{Mathf.Round(d * 3.281f / 100) * 100:0} ft" : $"{d / 1609:0.0} mi";

            void Inventory(List<StoreScreen.Row> rows, Profile p)
            {
                foreach (var kv in p.Tools.Where(kv => kv.Value > 0).ToList())
                {
                    var t = Tools.Get(kv.Key); if (t == null) continue;
                    bool use = t.Has("heal") || t.Has("repair") || t.Has("light") || t.Has("call");
                    rows.Add(new StoreScreen.Row { Name = t.Name, Sub = $"{t.Trade} · × {kv.Value:0}" + (t.Describe.Length > 0 ? " · " + t.Describe : ""), Price = use ? "Use" : "Carried", Enabled = use, Buy = () => Use(t, p) });
                }
            }

            void Use(Tool t, Profile p)
            {
                if (t.Has("heal"))
                {
                    if (G.Health >= G.Needs.MaxHealth) { G.Toast("Already at full health", 1.2f); return; }
                    if (!p.UseTool(t.Id)) return;
                    G.Health = System.Math.Min(G.Needs.MaxHealth, G.Health + t.Level("heal")); G.Toast($"{t.Name}: +{t.Level("heal"):0} health", 1.5f); return;
                }
                if (t.Has("repair"))
                {
                    var me = G.player.transform.position;
                    var car = G.driving != null && G.driving.Car != null ? G.driving.Car : CarController.All.OrderBy(c => (c.transform.position - me).sqrMagnitude).FirstOrDefault(c => (c.transform.position - me).sqrMagnitude < 64);
                    if (car == null) { G.Toast("Stand next to a vehicle", 1.5f); return; }
                    var ch = CarHealth.Of(car); if (ch == null || !p.UseTool(t.Id)) return;
                    ch.State.Health = System.Math.Min(ch.State.MaxHealth, ch.State.Health + t.Level("repair")); ch.State.Wrecked = false;
                    G.Toast($"{car.displayName} repaired", 1.5f); return;
                }
                if (t.Has("light")) { ph.torchOn = !ph.torchOn; StoreScreen.Hide(); return; }
                if (t.Has("call")) { StoreScreen.Hide(); if (Wildlife.Instance != null) Wildlife.Instance.Blow(); }
            }

            void Garage(List<StoreScreen.Row> rows, Profile p)
            {
                foreach (var g in p.GarageList)
                {
                    string cat = g.Text("cat"), type = g.Text("type"); var gg = g;
                    var e = CraftCatalog.Find(type);
                    string name = e != null ? e.Name : type;
                    bool craft = (cat == "boat" || cat == "air") && e != null && Fleet.Instance != null && Fleet.Instance.Ready;
                    rows.Add(new StoreScreen.Row
                    {
                        Name = name, Sub = cat == "boat" ? "boat · delivered to the nearest marina" : cat == "air" ? "aircraft · delivered to the airfield" : "car · in storage (car delivery isn't in this version yet)",
                        Price = craft ? "Deliver" : "—", Enabled = craft,
                        Buy = () => { if (cat == "boat") Fleet.Instance.NearestMarina(G.player.transform.position); Fleet.Instance.Launch(gg); StoreScreen.Hide(); },
                    });
                }
            }

            void Runr(List<StoreScreen.Row> rows, Profile p)
            {
                rows.Add(new StoreScreen.Row
                {
                    Name = "Order food", Sub = $"Po'boy and sweet tea · health {G.Health:0}", Price = $"${PhoneBook.Food:0}", Enabled = p.Money >= PhoneBook.Food,
                    Buy = () => { p.Money -= PhoneBook.Food; ph.Courier("your food", () => { G.Health = System.Math.Min(G.Needs.MaxHealth, G.Health + 50); G.Needs.Feed(45); G.Toast("You eat. +50 health", 2f); }); StoreScreen.Hide(); },
                });
                var last = G.driving != null ? G.driving.Last : null;
                rows.Add(new StoreScreen.Row
                {
                    Name = "Tow my car here", Sub = last != null ? last.displayName : "no car to tow", Price = $"${PhoneBook.Tow:0}", Enabled = last != null && p.Money >= PhoneBook.Tow,
                    Buy = () =>
                    {
                        p.Money -= PhoneBook.Tow; StoreScreen.Hide(); G.Toast("Runr: a tow truck is on the way", 3f);
                        ph.orders.Add(new Order { label = "tow", wait = 25, arrive = () =>
                        {
                            if (last == null) return;
                            var at = ph.Kerb(G.player.transform.position); at.y = Pedestrians.Ground(at + Vector3.up * 50, 100, at.y) + 0.6f;
                            var rb = last.GetComponent<Rigidbody>(); if (rb != null) { rb.linearVelocityCompat(Vector3.zero); rb.angularVelocity = Vector3.zero; }
                            last.transform.SetPositionAndRotation(at, Quaternion.Euler(0, G.player.transform.eulerAngles.y, 0));
                            G.Toast("Your car was dropped off on the road nearby", 3f);
                        } });
                    },
                });
                foreach (var w in Arsenal.All.Where(w => !w.Melee && w.Id != "fists" && !p.OwnedWeapons.Contains(w.Id)).OrderBy(w => w.Price).Take(80))
                {
                    double price = System.Math.Round(w.Price * PhoneBook.GunMarkup) + PhoneBook.GunDelivery; var ww = w;
                    rows.Add(new StoreScreen.Row
                    {
                        Name = "Gun: " + w.Name, Sub = $"{w.Caliber} · delivered with a box of ammunition (prices plus 35% and $150 delivery)", Price = $"${price:N0}", Enabled = p.Money >= price,
                        Buy = () =>
                        {
                            if (p.Money < price) return; p.Money -= price; StoreScreen.Hide();
                            ph.Courier(ww.Name, () => { p.OwnedWeapons.Add(ww.Id); var box = ShopCatalog.BoxFor(ww.Caliber); if (box != null) p.Ammo[ww.Id] = System.Math.Max(p.Ammo.TryGetValue(ww.Id, out var a) ? a : 0, box.Box); Gunplay.Instance?.Refresh(); G.Toast($"Delivered: {ww.Name}", 2.5f); });
                        },
                    });
                }
            }

            public string Note(string tab) => tab switch
            {
                "Inventory" => $"Pelts: {G.Profile.Section("pelts").Values.OfType<double>().Sum():0} · Fish on ice: {G.Profile.Section("fish").Values.OfType<Dictionary<string, object>>().Sum(f => f.Num("n")):0} · Bait: {G.Profile.BaitCount} · Meat: {Hunting.MeatLb(G.Profile):0} lb",
                "Garage" => "Boats go to the nearest marina, aircraft to Redgrass Airfield.",
                "Places" => "Every shop and service in Calvera, nearest first. GPS sets a marker.",
                "Runr" => $"Errands by courier. {(ph.orders.Count > 0 ? $"{ph.orders.Count} on the way." : "Nothing on the way.")}",
                "Cab" => "Calvera Cabs: $4 + $2.60 a mile. Pick a place, then wait where you are.",
                "Bank" => $"On you: ${G.Profile.Money:N0} · In the bank: ${G.Profile.Bank:N0}. " + (ph.AtAtm() ? "At the ATM." : "Deposits and withdrawals at any Gulf Mart. Interest: 0.5% a day."),
                "Stats & save" => $"Played {G.Profile.PlaySeconds / 60:0} min.",
                _ => MoreTabs.FirstOrDefault(t => t.name == tab).note?.Invoke() ?? "",
            };
        }

        /// <summary>Other systems' phone tabs: (name, fill the rows, the note).</summary>
        public static readonly List<(string name, System.Action<List<StoreScreen.Row>, Profile> fill, System.Func<string> note)> MoreTabs = new List<(string, System.Action<List<StoreScreen.Row>, Profile>, System.Func<string>)>();

        void Courier(string label, System.Action arrive)
        {
            float wait = 20 + Random.value * 25;
            orders.Add(new Order { label = label, wait = wait, arrive = arrive });
            game.Toast($"Runr: {label} is on the way (~{Mathf.RoundToInt(wait)} s)", 3f);
        }
    }

    static class RigidbodyCompat
    {
        public static void linearVelocityCompat(this Rigidbody rb, Vector3 v)
        {
#if UNITY_6000_0_OR_NEWER
            rb.linearVelocity = v;
#else
            rb.velocity = v;
#endif
        }
    }
}
