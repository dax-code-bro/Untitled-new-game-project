// Every building can be entered, and 246 of them are for sale (the web game's estate.js and propertyplus.js, rules in
// Core/Estate): walk up to a building's door and press F. Open (yours, a viewing between 9 and 5, a shop or a bar or an
// office in its hours, a home left unlocked): you're inside, in a room built in the building itself (Interior). Locked:
// F knocks (someone may answer, or tell you to go away), G kicks it in (a break-in, and a crime if anyone sees). Inside a
// place for sale: F buys it; inside one of yours: F sleeps the night and saves (it becomes your home), and the wardrobe's
// there. Someone at home when you let yourself in calls the police. Gulf Coast Realty lists everything (GPS to any) and
// sells what you own at today's value; upgrades (an alarm, solar panels, a renovation). Every day: business income, rent
// from homes you don't live in, tax and upkeep, maybe a break-in, the market drifting. You start the game at home.
using System.Collections.Generic;
using System.Linq;
using Southbound.Core;
using UnityEngine;

namespace Southbound
{
    public sealed class Homes : MonoBehaviour
    {
        [Tooltip("Calvera's roads and buildings (a light copy of calvera-world.json, the builder writes it).")]
        public TextAsset world;
        [Tooltip("The building collision boxes, in building order (CalveraBuilder's \"Building colliders\").")]
        public Transform buildingColliders;
        [Tooltip("Furniture models by name (the house interior pack, the Khronos sofas, chairs, fridges...).")]
        public GameObject[] furniture;
        public string[] furnitureNames;

        public static Homes Instance { get; private set; }
        public List<Door> Doors { get; private set; } = new List<Door>();
        public List<Property> Props { get; private set; } = new List<Property>();
        public Property Inside => insideProp;
        public bool IsInside => inside != null;
        public string Prompt { get; private set; }
        /// <summary>What the wardrobe in a home of yours opens (the clothes, when they're in).</summary>
        public static System.Action AtWardrobe;

        SouthboundGame game;
        Dictionary<int, Property> byBuilding = new Dictionary<int, Property>();
        HashSet<int> shopBuildings = new HashSet<int>();
        Interior inside; Door insideDoor; Property insideProp; Collider hidden; float trespassT = -1;
        Door realtor; int lastDay = -1; bool placedHome;
        readonly System.Random rnd = new System.Random();
        System.Func<string> hudPrompt;
        readonly Dictionary<string, Material> surfaces = new Dictionary<string, Material>();

        void Awake() => Instance = this;
        void OnEnable() { Hud.Sources.Add(Blips); Hud.Prompts.Add(hudPrompt = () => Prompt); }
        void OnDisable() { Hud.Sources.Remove(Blips); Hud.Prompts.Remove(hudPrompt); }

        static Vector3 U(double x, double z) => new Vector3(-(float)x, 0, (float)z);

        void Start()
        {
            game = SouthboundGame.Instance;
            CalveraWorld w = null;
            try
            {
                if (world != null) w = CalveraWorld.ParseLite(world.text);
#if UNITY_EDITOR
                else { string dir = CalveraWorld.DefaultFolder(System.IO.Path.GetDirectoryName(Application.dataPath)); if (System.IO.File.Exists(System.IO.Path.Combine(dir, "calvera-world.json"))) w = CalveraWorld.ParseLite(System.IO.File.ReadAllText(System.IO.Path.Combine(dir, "calvera-world.json"))); }
#endif
            }
            catch (System.Exception e) { Debug.LogWarning("Southbound: couldn't read the buildings for property: " + e.Message); }
            var L = Missions.Instance != null ? Missions.Instance.Data : null;
            if (w == null || L == null) { enabled = false; return; }
            Doors = Estate.Doors(w);
            Props = Estate.Properties(Doors, L);
            byBuilding = Props.ToDictionary(p => p.Door.I);
            realtor = Estate.RealtorDoor(Doors, L);
            // the walk-in shops have their own insides (Shops): their buildings' doors are theirs
            if (Shops.Instance != null)
                foreach (var d in Doors)
                    if (Shops.Instance.shops.Any(s => (new Vector2(s.door.x + (float)d.B.X, s.door.z - (float)d.B.Z)).magnitude < Mathf.Max((float)d.B.W, (float)d.B.D) * 0.6f + 4)) shopBuildings.Add(d.I);
            if (buildingColliders == null) { var bc = GameObject.Find("Building colliders"); if (bc != null) buildingColliders = bc.transform; }
            Phone.MoreTabs.Add(("Properties", PhoneTab, () => $"{game.Profile.Properties.Count} of {Props.Count} owned. GPS takes you to one."));
            Phone.MorePlaces.Add(() => Places());
        }

        IEnumerable<(string, string, Vector3)> Places()
        {
            var p = game.Profile;
            foreach (var x in Props.Where(x => Estate.Owned(p, x))) yield return (x.Name, p.Home == x.Id ? "Home" : "Your property", DoorAt(x.Door));
            yield return ("Gulf Coast Realty", "Property", DoorAt(realtor));
        }

        Vector3 DoorAt(Door d) { var v = U(d.X, d.Z); v.y = Pedestrians.Ground(v + Vector3.up * 300, 600, (float)d.B.Y); return v; }

        void Update()
        {
            Prompt = null;
            if (game == null || game.player == null || Props.Count == 0) return;
            var p = game.Profile;
            if (!placedHome) { placedHome = true; WakeAtHome(); }
            // a new day's accounts
            if (lastDay < 0) lastDay = p.Day;
            if (p.Day != lastDay)
            {
                lastDay = p.Day;
                var (texts, news) = Estate.Settle(p, Props, rnd, insideProp);
                foreach (var (from, body) in texts) PhoneBook.Text(p, from, body);
                foreach (var n in news) PhoneBook.News(p, n);
            }
            if (Time.timeScale == 0 || StoreScreen.Showing || !game.player.enabled) return;
            if (inside != null) { Indoors(); return; }
            Outdoors();
        }

        /// <summary>A save with a home: you wake up outside it.</summary>
        void WakeAtHome()
        {
            var p = game.Profile;
            if (p.Home == null || p.Pos != null) return;   // (a save that knows where you were keeps it)
            var h = Props.FirstOrDefault(x => x.Id == p.Home);
            if (h != null) Teleport(DoorAt(h.Door) + new Vector3(-(float)h.Door.Nx, 0, (float)h.Door.Nz) * 1.5f, -new Vector3(-(float)h.Door.Nx, 0, (float)h.Door.Nz));
        }

        // ------------------------------------------------------------------ outside: the doors, the realtor
        void Outdoors()
        {
            var me = game.player.transform.position;
            var ra = DoorAt(realtor) + new Vector3(-(float)realtor.Nx, 0, (float)realtor.Nz) * 2.5f + new Vector3(-2, 0, 0);
            if ((ra - me).sqrMagnitude < 2.2f * 2.2f)
            {
                Prompt = "F  browse Gulf Coast Realty listings";
                if (SbInput.InteractDown) StoreScreen.Show(new Realty(this));
                return;
            }
            Door near = null; float bd = 1.8f * 1.8f;
            foreach (var d in Doors)
            {
                if (shopBuildings.Contains(d.I)) continue;
                var at = U(d.X, d.Z);
                float dd = new Vector2(at.x - me.x, at.z - me.z).sqrMagnitude;
                if (dd < bd && Mathf.Abs(me.y - (float)d.B.Y) < 3f) { bd = dd; near = d; }
            }
            if (near == null) return;
            byBuilding.TryGetValue(near.I, out var prop);
            var p = game.Profile;
            bool owned = prop != null && Estate.Owned(p, prop);
            bool open = Estate.Open(near, p.Hour, owned, prop != null);
            string what = prop != null ? (owned ? prop.Name + (p.Home == prop.Id ? " (home)" : " (yours)") : $"{prop.Name} · for sale ${prop.Price:N0}") : KindName(Estate.Kind(near));
            if (open)
            {
                Prompt = $"F  go in: {what}";
                if (SbInput.InteractDown) Enter(near, prop, false);
                return;
            }
            Prompt = $"Locked: {what} · F knock · G kick it in";
            if (SbInput.InteractDown)
            {
                bool home = Estate.Kind(near) == "home" || Estate.Kind(near) == "apartment";
                string[] go = { "\"Who is it? ...We don't want any. Go away.\"", "\"It's late! Go home!\"", "\"I don't know you. I'm not opening this door.\"" };
                game.Toast(home && Estate.SomeoneHome(near, p.Hour, p.Day) ? go[rnd.Next(go.Length)] : "Nobody answers.", 2.5f);
            }
            else if (SbInput.LetterDown('G'))
            {
                if (Police.Seen(me, 30f)) Police.Crime("breakin");
                game.Toast("The door gives on the third kick.", 2f);
                Enter(near, prop, true);
            }
        }

        static string KindName(string k) => k switch { "home" => "a house", "apartment" => "an apartment", "store" => "a store", "bar" => "a bar", "office" => "an office", _ => "a warehouse" };

        // ------------------------------------------------------------------ in and out
        void Enter(Door d, Property prop, bool broke)
        {
            var floor = U(d.B.X, d.B.Z); floor.y = (float)d.B.Y + 0.02f;
            inside = Interior.Build(d, floor, Furniture, game.Profile.Hour, Surface);
            insideDoor = d; insideProp = prop;
            if (buildingColliders != null && d.I < buildingColliders.childCount) { hidden = buildingColliders.GetChild(d.I).GetComponent<Collider>(); if (hidden != null) hidden.enabled = false; }
            WeatherController.Indoors = true;
            var face = inside.Root.transform.TransformDirection(Vector3.back);
            Teleport(inside.Exit, face);
            var p = game.Profile;
            bool owned = prop != null && Estate.Owned(p, prop);
            string k = inside.Kind;
            bool viewing = prop != null && p.Hour >= 9 && p.Hour < 17;
            trespassT = !owned && !viewing && (k == "home" || k == "apartment") && Estate.SomeoneHome(d, p.Hour, p.Day) ? 4f : broke && !owned ? 6f : -1;
            if (trespassT > 0) game.Toast((k == "home" || k == "apartment") ? "Someone's home! \"Hey! Get out of my house!\"" : "\"We're closed! I'm calling the police!\"", 3f);
            else game.Toast(prop != null ? prop.Name : KindName(k).Substring(KindName(k).IndexOf(' ') + 1), 2f);
        }

        void Leave()
        {
            var d = insideDoor;
            if (inside != null) Destroy(inside.Root);
            inside = null; insideProp = null; insideDoor = null; trespassT = -1;
            if (hidden != null) hidden.enabled = true; hidden = null;
            WeatherController.Indoors = false;
            var n = new Vector3(-(float)d.Nx, 0, (float)d.Nz);
            Teleport(DoorAt(d) + n * 0.8f, n);
        }

        void Indoors()
        {
            var me = game.player.transform.position;
            var p = game.Profile;
            // someone at home (or the shop closed): they call the police if you stay
            if (trespassT > 0 && (trespassT -= Time.deltaTime) <= 0) { Police.Crime("trespass"); game.Toast("They've called the police.", 2f); }
            if ((inside.Exit - me).sqrMagnitude < 1.3f * 1.3f)
            {
                Prompt = "F  go outside";
                if (SbInput.InteractDown) Leave();
                return;
            }
            var prop = insideProp;
            if (prop == null) return;
            bool owned = Estate.Owned(p, prop);
            if ((inside.Bed - me).sqrMagnitude < 2f * 2f)
            {
                if (owned)
                {
                    Prompt = $"F  sleep and save ({prop.Name})";
                    if (SbInput.InteractDown) Sleep(prop);
                }
                else
                {
                    Prompt = $"F  buy {prop.Name} — ${prop.Price:N0}";
                    if (SbInput.InteractDown)
                    {
                        if (!Estate.Buy(p, prop)) { game.Toast($"You need ${prop.Price:N0}", 2f); return; }
                        Hud.Big("PROPERTY PURCHASED", prop.Name, 3f);
                        trespassT = -1;
                        game.Save();
                    }
                }
                return;
            }
            if (owned && (inside.Wardrobe - me).sqrMagnitude < 1.6f * 1.6f && AtWardrobe != null)
            {
                Prompt = "F  change clothes";
                if (SbInput.InteractDown) AtWardrobe();
            }
        }

        void Sleep(Property prop)
        {
            var p = game.Profile;
            p.Home = prop.Id;
            double heal = p.Needs.Sleep(8);
            game.Health = System.Math.Min(p.Needs.MaxHealth, game.Health + heal);
            p.Hour += 8; if (p.Hour >= 24) { p.Hour -= 24; p.Day++; }
            Hud.Big("", $"You slept. {prop.Name} is your home.", 2.5f);
            game.Save();
        }

        void Teleport(Vector3 at, Vector3 face)
        {
            var t = game.player.transform;
            var cc = t.GetComponent<CharacterController>();
            if (cc != null) cc.enabled = false;
            face.y = 0;
            t.SetPositionAndRotation(at + Vector3.up * 0.05f, face.sqrMagnitude > 0.01f ? Quaternion.LookRotation(face) : t.rotation);
            if (cc != null) cc.enabled = true;
        }

        GameObject Furniture(string name)
        {
            if (furniture == null || furnitureNames == null) return null;
            for (int i = 0; i < furnitureNames.Length && i < furniture.Length; i++) if (furnitureNames[i] == name) return furniture[i];
            return null;
        }

        /// <summary>The photo-scanned surfaces the scene's materials already use (by name), for the floors and tiles.</summary>
        Material Surface(string set)
        {
            if (surfaces.TryGetValue(set, out var m)) return m;
            m = null;
            foreach (var r in FindObjectsByType<MeshRenderer>(FindObjectsSortMode.None))
            {
                foreach (var sm in r.sharedMaterials) if (sm != null && sm.name.StartsWith(set)) { m = sm; break; }
                if (m != null) break;
            }
            surfaces[set] = m;
            return m;
        }

        // ------------------------------------------------------------------ the minimap, the phone, the realtor
        void Blips(List<Hud.Blip> into)
        {
            if (Props.Count == 0 || game == null) return;
            foreach (var x in Props) if (Estate.Owned(game.Profile, x)) into.Add(new Hud.Blip { at = U(x.Door.X, x.Door.Z), color = new Color(0.38f, 1f, 0.56f), size = 7, keepOnEdge = game.Profile.Home == x.Id });
            if (realtor != null) into.Add(new Hud.Blip { at = U(realtor.X, realtor.Z), color = new Color(0.62f, 1f, 0.72f), size = 6 });
        }

        void PhoneTab(List<StoreScreen.Row> rows, Profile p)
        {
            foreach (var x in Props.Where(x => Estate.Owned(p, x)))
            {
                var xx = x;
                rows.Add(new StoreScreen.Row { Name = x.Name + (p.Home == x.Id ? " · home" : ""), Sub = $"{x.Type} · {x.Region} · worth ${Estate.Worth(p, x):N0}" + (Estate.RentOf(p, x) > 0 ? $" · rent ${Estate.RentOf(p, x):N0}/day" : ""), Price = "GPS", Buy = () => { Phone.Instance?.SetWaypoint(DoorAt(xx.Door), xx.Name); StoreScreen.Hide(); } });
            }
        }

        sealed class Realty : StoreScreen.IStore
        {
            readonly Homes h;
            public Realty(Homes h) { this.h = h; }
            public string Title => "Gulf Coast Realty";
            public string Keeper => "\"Every listing in the county. Mark one and go see it; you buy inside the building.\"";
            public string[] Tabs => h.Props.Select(x => x.Type).Distinct().Select(t => $"{t}s ({h.Props.Count(x => x.Type == t)})").Concat(new[] { "Owned", "Sell", "Upgrades" }).ToArray();
            public void Fill(string tab, List<StoreScreen.Row> rows, Profile p)
            {
                var game = h.game;
                if (tab == "Sell")
                {
                    foreach (var x in h.Props.Where(x => Estate.Owned(p, x) && p.Home != x.Id))
                    {
                        var xx = x; double m = Estate.Market(p, x.Type);
                        rows.Add(new StoreScreen.Row { Name = x.Name, Sub = $"{x.Type} · {x.Region} · market {(m >= 1 ? "+" : "")}{(m - 1) * 100:0}%", Price = $"Sell · ${Estate.SalePrice(p, x):N0}", Buy = () => { double v = Estate.Sell(p, xx); game.Toast($"Sold {xx.Name} for ${v:N0}", 2.4f); PhoneBook.News(p, $"{xx.Type} on {xx.Name.Split(',')[0]} changes hands."); game.Save(); } });
                    }
                    return;
                }
                if (tab == "Upgrades")
                {
                    foreach (var x in h.Props.Where(x => Estate.Owned(p, x)))
                        foreach (var u in Estate.Upgrades)
                        {
                            var xx = x; var uu = u; bool has = Estate.Ups(p, x).Flag(u.Key); int cost = u.Cost(x);
                            rows.Add(new StoreScreen.Row { Name = $"{x.Name}: {u.Name}", Sub = u.Sub, Price = has ? "Installed" : $"${cost:N0}", Enabled = !has && p.Money >= cost, Buy = () => { if (p.Money < cost) return; p.Money -= cost; Estate.Ups(p, xx)[uu.Key] = true; game.Toast($"{uu.Name} done at {xx.Name}", 2f); game.Save(); } });
                        }
                    return;
                }
                bool mine = tab == "Owned";
                string type = mine ? null : tab.Substring(0, tab.IndexOf('s'));
                foreach (var x in h.Props.Where(x => mine ? Estate.Owned(p, x) : x.Type == type))
                {
                    var xx = x; bool own = Estate.Owned(p, x);
                    string inc = Estate.Income.TryGetValue(x.Type, out var k) ? $" · earns ${x.Price * k:N0}/day" : "";
                    string sub = $"{x.Type} · {x.Region} · {x.Area:0} m²{inc}" + (own ? $" · worth ${Estate.Worth(p, x):N0}" + (Estate.RentOf(p, x) > 0 ? $" · rent ${Estate.RentOf(p, x):N0}/day" : "") : "");
                    rows.Add(new StoreScreen.Row { Name = x.Name, Sub = sub, Price = own ? "GPS" : $"Mark · ${System.Math.Round(x.Price * Estate.Market(p, x.Type)):N0}", Buy = () => { Phone.Instance?.SetWaypoint(h.DoorAt(xx.Door), xx.Name); StoreScreen.Hide(); } });
                }
            }
            public string Note(string tab) => tab == "Sell" ? "Sold at today's market value, less the agent's 6%." : tab == "Upgrades" ? "Improvements for the places you own." : tab == "Owned" ? "Rent comes in daily from places you don't live in; tax and upkeep go out." : $"{h.Props.Count} properties. Businesses pay out every game day. \"Mark\" sets a GPS marker; buy inside the building (viewings 9 to 5).";
        }
    }
}
