// Where the tools are sold and the catch is bought (the web game's tools.js and fishing.js counters): Calvera Hardware,
// Mill Creek Feed & Hardware and Bayou Outfitters (all 245 tools in 8 trades, each opening on its own), a bait & tackle
// counter and a fish market at every marina (sell what's on ice, by the pound, half price once it's two days old; the
// fishing log with your records and the legends still out there). Each is a booth with a sign (CraftBuilder) and a dot
// on the minimap.
using System.Collections.Generic;
using System.Linq;
using Southbound.Core;
using UnityEngine;

namespace Southbound
{
    public sealed class Outfitters : MonoBehaviour
    {
        public static Outfitters Instance { get; private set; }
        public string Prompt { get; private set; }

        SouthboundGame game;
        readonly List<(Vector3 at, string name, string tab, string kind)> counters = new List<(Vector3, string, string, string)>();
        System.Func<string> hudPrompt;

        void Awake() => Instance = this;
        void OnEnable() { Hud.Sources.Add(Blips); Hud.Prompts.Add(hudPrompt = () => Prompt); }
        void OnDisable() { Hud.Sources.Remove(Blips); Hud.Prompts.Remove(hudPrompt); }

        static Vector3 U(double x, double z) => new Vector3(-(float)x, 0, (float)z);

        /// <summary>Where the counters stand (web x, z): the three stores, and beside each marina's booth the tackle and the market.</summary>
        public static List<(double x, double z, string name, string tab, string kind)> Places(MissionData L, List<Harbours.Marina> marinas)
        {
            var o = Tools.Stores(L).Select(s => (s.x, s.z, s.name, s.tab, "tools")).ToList();
            foreach (var m in marinas)
            {
                o.Add((m.LandX + 6, m.LandZ + 4, "Bait & Tackle", "Fishing", "tools"));
                o.Add((m.LandX - 6, m.LandZ + 4, "Fish Market", "Sell catch", "market"));
            }
            return o;
        }

        void Update()
        {
            Prompt = null;
            if (game == null) game = SouthboundGame.Instance;
            var fleet = Fleet.Instance;
            if (game == null || fleet == null || !fleet.Ready || Time.timeScale == 0 || StoreScreen.Showing) return;
            if (counters.Count == 0) foreach (var p in Places(fleet.Layout, fleet.Marinas)) counters.Add((U(p.x, p.z), p.name, p.tab, p.kind));
            if (game.player == null || !game.player.enabled) return;
            var me = game.player.transform.position;
            foreach (var c in counters)
            {
                if (new Vector2(me.x - c.at.x, me.z - c.at.z).sqrMagnitude > 2.6f * 2.6f) continue;
                Prompt = c.kind == "market" ? "F  sell your catch (fish market)" : c.name == "Bait & Tackle" ? "F  shop for bait & tackle" : $"F  shop at {c.name}";
                if (SbInput.InteractDown)
                {
                    if (c.kind == "market") StoreScreen.Show(new Market(this));
                    else StoreScreen.Show(new Store(this, c.name), System.Array.IndexOf(Tools.Trades, c.tab));
                }
                return;
            }
        }

        void Blips(List<Hud.Blip> into)
        {
            foreach (var c in counters)
                into.Add(new Hud.Blip { at = c.at, color = c.kind == "market" ? new Color(0.38f, 0.75f, 1f) : new Color(1f, 0.63f, 0.25f), size = c.name == "Bait & Tackle" || c.kind == "market" ? 4 : 6 });
        }

        sealed class Store : StoreScreen.IStore
        {
            readonly Outfitters o; readonly string name;
            public Store(Outfitters o, string name) { this.o = o; this.name = name; }
            public string Title => name;
            public string Keeper => name == "Bait & Tackle" ? "\"They're biting at first light. You'll want bait, or a lure that lasts.\"" : name.StartsWith("Bayou") ? "\"Work downwind of 'em, and a clean shot keeps the pelt perfect.\"" : "\"Whatever the job is, we've got the tool for it.\"";
            public string[] Tabs => Tools.Trades.Select(t => $"{t} ({Tools.All.Count(x => x.Trade == t)})").ToArray();
            public void Fill(string tab, List<StoreScreen.Row> rows, Profile p)
            {
                string trade = tab.Split(' ')[0];
                foreach (var t in Tools.All.Where(x => x.Trade == trade))
                {
                    int n = p.Tools.TryGetValue(t.Id, out var have) ? (int)have : 0;
                    string fx = t.Describe;
                    rows.Add(new StoreScreen.Row
                    {
                        Name = t.Name, Sub = $"{t.Trade}{(fx.Length > 0 ? " · " + fx : "")}{(n > 0 ? $" · you have {n}" : "")}", Price = $"${t.Price:N0}", Enabled = p.Money >= t.Price,
                        Buy = () => { if (p.Money < t.Price) return; p.Money -= t.Price; p.AddTool(t); o.game.Toast($"Bought {t.Name}", 1.2f); },
                    });
                }
            }
            public string Note(string tab) => tab.StartsWith("Fishing") ? $"A rod, then bait (you have {o.game.Profile.BaitCount}) or a lure. Face the water and press F to cast; on a stopped boat, H." : tab.StartsWith("Hunting") ? "A knife to skin what you take; calls draw animals in; binoculars and a ghillie suit help." : $"{Tools.All.Count} tools. Consumables stack.";
        }

        sealed class Market : StoreScreen.IStore
        {
            readonly Outfitters o;
            public Market(Outfitters o) { this.o = o; }
            public string Title => "Fish Market";
            public string Keeper => "The buyer weighs it on the scale. \"Fresh fetches full price.\"";
            public string[] Tabs => new[] { "Sell catch", "Fishing log" };
            public void Fill(string tab, List<StoreScreen.Row> rows, Profile p)
            {
                int today = p.Day;
                if (tab == "Sell catch")
                {
                    var ice = p.Section("fish");
                    foreach (var kv in ice.ToList())
                    {
                        if (!(kv.Value is Dictionary<string, object> lot) || lot.Num("lb") <= 0) continue;
                        double worth = FishStore.Worth(lot, today); string k = kv.Key;
                        rows.Add(new StoreScreen.Row
                        {
                            Name = $"{k} × {lot.Num("n"):0}", Sub = $"{lot.Num("lb"):0.0} lb total" + (FishStore.Stale(lot, today) ? " · not fresh (half price)" : ""), Price = $"Sell ${worth:N0}",
                            Buy = () => { p.Money += System.Math.Round(worth); ice[k] = null; o.game.Toast($"Sold the {k.ToLowerInvariant()}: +${System.Math.Round(worth):N0}", 1.6f); o.game.Save(); },
                        });
                    }
                }
                else
                {
                    var log = p.Section("fishLog");
                    foreach (var kv in log) if (kv.Value is Dictionary<string, object> e) rows.Add(new StoreScreen.Row { Name = kv.Key, Sub = $"caught {e.Num("n"):0} · record {e.Num("best"):0.0} lb", Price = "Logged", Enabled = false });
                    foreach (var L in Fishing.Legends.Values) if (!log.ContainsKey(L.Name)) rows.Add(new StoreScreen.Row { Name = L.Name, Sub = "Not yet caught. Talk at the docks says first or last light, and a serious rod.", Price = "?", Enabled = false });
                }
            }
            public string Note(string tab) => tab == "Sell catch" ? "Prices are per pound." : $"Species caught: {o.game.Profile.Section("fishLog").Count(kv => !kv.Key.Contains("("))} / {Fishing.SpeciesCount}";
        }
    }
}
