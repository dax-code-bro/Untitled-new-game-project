// The store screen (UI Toolkit, built in code): the shop's name, who's serving and what they say, your money,
// tabs, and a list to buy from. Gun stores: every gun at the shop's prices (city dearer, the bayou cheaper)
// and ammunition by the box for the guns you own, up to what the law lets you carry. Gulf Marts: the menu,
// eaten at the counter (health back, hunger fed). Time stops while it's open. Arrows or W/S to choose, Enter
// or Space to buy, Tab or A/D for the tabs, Esc to leave; the mouse works too.
using System.Collections.Generic;
using System.Linq;
using Southbound.Core;
using UnityEngine;
using UnityEngine.UIElements;

namespace Southbound
{
    public sealed class StoreScreen : MonoBehaviour
    {
        static StoreScreen instance;
        /// <summary>Is a store screen up (or did one close this very frame, so its Esc doesn't also pause)?</summary>
        public static bool Showing => instance != null && (instance.open || instance.closedFrame == Time.frameCount);

        sealed class Row { public string Name, Sub, Price; public bool Enabled; public System.Action Buy; }

        UIDocument doc; VisualElement root, list, tabsRow;
        Label title, keeper, money, note;
        readonly List<Row> rows = new List<Row>();
        readonly List<VisualElement> rowEls = new List<VisualElement>();
        Shops.Shop shop; string[] tabs = new string[0]; int tab, sel;
        bool open; int openedFrame, closedFrame = -1; float timeBefore = 1;
        SouthboundGame game;

        public static void Show(Shops.Shop s)
        {
            if (instance == null)
            {
                var go = new GameObject("Store screen");
                instance = go.AddComponent<StoreScreen>();
                instance.Build();
            }
            instance.Open(s);
        }

        void Build()
        {
            var panel = Hud.Instance != null && Hud.Instance.panel != null ? Hud.Instance.panel : ScriptableObject.CreateInstance<PanelSettings>();
            var host = new GameObject("Store document");
            host.SetActive(false);
            host.transform.SetParent(transform, false);
            doc = host.AddComponent<UIDocument>();
            doc.panelSettings = panel;
            doc.sortingOrder = 10;
            host.SetActive(true);
            root = doc.rootVisualElement;
            root.style.position = Position.Absolute; root.style.left = 0; root.style.right = 0; root.style.top = 0; root.style.bottom = 0;
            root.style.backgroundColor = new Color(0, 0, 0, 0.55f);
            root.style.alignItems = Align.Center; root.style.justifyContent = Justify.Center;
            if (panel.themeStyleSheet == null)
            {
#if UNITY_2022_2_OR_NEWER
                var font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
#else
                var font = Resources.GetBuiltinResource<Font>("Arial.ttf");
#endif
                if (font != null) root.style.unityFontDefinition = new StyleFontDefinition(FontDefinition.FromFont(font));
            }
            var card = new VisualElement();
            card.style.width = 760; card.style.maxHeight = Length.Percent(86);
            card.style.backgroundColor = new Color(0.09f, 0.085f, 0.08f, 0.96f);
            Round(card, 10);
            card.style.paddingLeft = 26; card.style.paddingRight = 26; card.style.paddingTop = 20; card.style.paddingBottom = 18;
            root.Add(card);
            var head = new VisualElement { style = { flexDirection = FlexDirection.Row, justifyContent = Justify.SpaceBetween, alignItems = Align.FlexStart } };
            card.Add(head);
            var left = new VisualElement();
            head.Add(left);
            title = Text(left, 30, new Color(0.96f, 0.92f, 0.84f)); title.style.unityFontStyleAndWeight = FontStyle.Bold;
            keeper = Text(left, 15, new Color(0.8f, 0.76f, 0.68f)); keeper.style.whiteSpace = WhiteSpace.Normal; keeper.style.maxWidth = 520;
            money = Text(head, 26, new Color(0.45f, 0.86f, 0.42f)); money.style.unityFontStyleAndWeight = FontStyle.Bold;
            tabsRow = new VisualElement { style = { flexDirection = FlexDirection.Row, marginTop = 14, marginBottom = 8 } };
            card.Add(tabsRow);
            var scroll = new ScrollView(ScrollViewMode.Vertical);
            scroll.style.flexGrow = 1; scroll.style.maxHeight = 560;
            card.Add(scroll);
            list = scroll.contentContainer;
            note = Text(card, 13, new Color(0.7f, 0.68f, 0.62f)); note.style.marginTop = 10; note.style.whiteSpace = WhiteSpace.Normal;
            root.style.display = DisplayStyle.None;
        }

        static Label Text(VisualElement parent, int size, Color c)
        {
            var l = new Label(); l.style.fontSize = size; l.style.color = c; l.style.marginLeft = 0; l.style.paddingLeft = 0;
            parent.Add(l); return l;
        }

        static void Round(VisualElement e, float r) { e.style.borderTopLeftRadius = r; e.style.borderTopRightRadius = r; e.style.borderBottomLeftRadius = r; e.style.borderBottomRightRadius = r; }

        void Open(Shops.Shop s)
        {
            game = SouthboundGame.Instance;
            shop = s;
            tabs = s.kind == "guns" ? new[] { "Guns", "Ammunition" } : s.kind == "mart" ? new[] { "Eat here" } : new[] { "Clothes" };   // clothes: browsing only for now
            tab = 0; sel = 0;
            open = true; openedFrame = Time.frameCount;
            timeBefore = Time.timeScale > 0 ? Time.timeScale : 1;
            Time.timeScale = 0;
            UnityEngine.Cursor.lockState = CursorLockMode.None; UnityEngine.Cursor.visible = true;
            root.style.display = DisplayStyle.Flex;
            title.text = s.name;
            string line = s.lines != null && s.lines.Length > 0 ? $"  \"{s.lines[Random.Range(0, s.lines.Length)]}\"" : "";
            keeper.text = $"{s.keeper} at the counter.{line}" + (string.IsNullOrEmpty(s.blurb) ? "" : $"\n{s.blurb}");
            Refresh();
        }

        void Close()
        {
            open = false; closedFrame = Time.frameCount;
            root.style.display = DisplayStyle.None;
            Time.timeScale = timeBefore;
            UnityEngine.Cursor.lockState = CursorLockMode.Locked; UnityEngine.Cursor.visible = false;
        }

        void Update()
        {
            if (!open || Time.frameCount == openedFrame) return;
            if (SbInput.MenuBack) { Close(); return; }
            if (SbInput.MenuNext && tabs.Length > 1) { tab = (tab + 1) % tabs.Length; sel = 0; Refresh(); }
            if (SbInput.MenuPrev && tabs.Length > 1) { tab = (tab + tabs.Length - 1) % tabs.Length; sel = 0; Refresh(); }
            if (rows.Count == 0) return;
            if (SbInput.MenuDown) { sel = (sel + 1) % rows.Count; Highlight(); }
            if (SbInput.MenuUp) { sel = (sel + rows.Count - 1) % rows.Count; Highlight(); }
            if (SbInput.MenuConfirm) Buy(sel);
        }

        void Buy(int i)
        {
            if (i < 0 || i >= rows.Count || !rows[i].Enabled) return;
            rows[i].Buy?.Invoke();
            Refresh();
        }

        // ------------------------------------------------------------------ what's for sale
        void Refresh()
        {
            rows.Clear();
            var p = game != null ? game.Profile : null;
            if (p == null) return;
            money.text = "$" + System.Math.Floor(p.Money).ToString("N0");
            string t = tabs.Length > 0 ? tabs[tab] : "";
            if (t == "Guns") Guns(p);
            else if (t == "Ammunition") Ammunition(p);
            else if (t == "Eat here") Menu(p);
            else note.text = "Clothes come with the wardrobe, which isn't in the Unity version yet. You can look around.";
            if (t != "Clothes") note.text = t == "Eat here" ? $"Health {game.Health:0} / {game.Needs.MaxHealth:0} · Food: {game.Needs.FoodWord}" : t == "Ammunition" ? "Boxes only. The law says no more than 500 rounds of a caliber, 50 rockets or grenades, 20 arrows." : "Prices at this shop. New guns come with a box of their ammunition.";
            tabsRow.Clear();
            for (int k = 0; k < tabs.Length; k++)
            {
                int kk = k;
                var b = new Button(() => { tab = kk; sel = 0; Refresh(); }) { text = tabs[k] };
                b.style.fontSize = 16; b.style.marginRight = 8;
                b.style.backgroundColor = k == tab ? new Color(0.85f, 0.7f, 0.42f) : new Color(0.25f, 0.23f, 0.21f);
                b.style.color = k == tab ? new Color(0.1f, 0.08f, 0.06f) : new Color(0.9f, 0.86f, 0.78f);
                tabsRow.Add(b);
            }
            list.Clear(); rowEls.Clear();
            for (int i = 0; i < rows.Count; i++)
            {
                var r = rows[i]; int ii = i;
                var el = new VisualElement { style = { flexDirection = FlexDirection.Row, alignItems = Align.Center, paddingTop = 6, paddingBottom = 6, paddingLeft = 8, paddingRight = 8, marginBottom = 2 } };
                Round(el, 5);
                var txt = new VisualElement { style = { flexGrow = 1, flexShrink = 1 } };
                var n = Text(txt, 17, r.Enabled ? new Color(0.95f, 0.92f, 0.86f) : new Color(0.55f, 0.53f, 0.5f));
                n.text = r.Name;
                var sub = Text(txt, 12, new Color(0.65f, 0.62f, 0.58f)); sub.text = r.Sub; sub.style.whiteSpace = WhiteSpace.Normal;
                el.Add(txt);
                var btn = new Button(() => { sel = ii; Buy(ii); }) { text = r.Price };
                btn.style.minWidth = 110; btn.style.fontSize = 15;
                btn.SetEnabled(r.Enabled);
                el.Add(btn);
                el.RegisterCallback<MouseEnterEvent>(_ => { sel = ii; Highlight(); });
                list.Add(el); rowEls.Add(el);
            }
            if (sel >= rows.Count) sel = rows.Count - 1;
            Highlight();
        }

        void Highlight()
        {
            for (int i = 0; i < rowEls.Count; i++) rowEls[i].style.backgroundColor = i == sel ? new Color(1f, 1f, 1f, 0.08f) : new Color(0, 0, 0, 0);
            if (sel >= 0 && sel < rowEls.Count) rowEls[sel].parent?.parent?.Q<ScrollView>()?.ScrollTo(rowEls[sel]);
        }

        void Guns(Profile p)
        {
            foreach (var w in Arsenal.All.Where(w => !w.Melee && w.Id != "fists").OrderBy(w => w.Price))
            {
                bool owned = p.OwnedWeapons.Contains(w.Id);
                int cost = ShopCatalog.Price(w.Price, shop.priceK);
                rows.Add(new Row
                {
                    Name = w.Name, Sub = $"{w.Caliber} · {w.FireMode} · damage {w.Damage} · {w.Clip} rounds" + (string.IsNullOrEmpty(w.Desc) ? "" : $" · {w.Desc}"),
                    Price = owned ? "Owned" : $"${cost:N0}", Enabled = !owned && p.Money >= cost,
                    Buy = () =>
                    {
                        if (p.Money < cost) return;
                        p.Money -= cost;
                        p.OwnedWeapons.Add(w.Id);
                        var box = ShopCatalog.BoxFor(w.Caliber);
                        if (box != null) p.Ammo[w.Id] = System.Math.Max(p.Ammo.TryGetValue(w.Id, out var a) ? a : 0, box.Box);
                        if (Gunplay.Instance != null) Gunplay.Instance.Refresh();
                        game.Toast($"Bought the {w.Name}", 2f);
                    },
                });
            }
        }

        void Ammunition(Profile p)
        {
            foreach (var id in p.OwnedWeapons.Distinct())
            {
                var w = Arsenal.Get(id);
                if (w == null || w.Melee) continue;
                var box = ShopCatalog.BoxFor(w.Caliber);
                if (box == null) continue;
                int have = p.Ammo.TryGetValue(id, out var a) ? (int)a : 0, cap = ShopCatalog.Cap(w.Caliber);
                bool full = have >= cap;
                string unit = box.Unit != null ? box.Unit + "s" : "rounds";
                rows.Add(new Row
                {
                    Name = $"{w.Caliber} for the {w.Name}", Sub = $"Box of {box.Box} · you have {have} / {cap} {unit}",
                    Price = full ? "Full" : $"${box.Price:N0}", Enabled = !full && p.Money >= box.Price,
                    Buy = () =>
                    {
                        if (p.Money < box.Price) return;
                        p.Money -= box.Price;
                        p.Ammo[id] = System.Math.Min(cap, have + box.Box);
                        game.Toast($"{w.Caliber}: {p.Ammo[id]:0} / {cap}", 1.8f);
                    },
                });
            }
            if (rows.Count == 0) note.text = "You don't own a gun that takes ammunition.";
        }

        void Menu(Profile p)
        {
            foreach (var f in ShopCatalog.Menu)
            {
                int cost = ShopCatalog.Price(f.Price, shop.priceK);
                rows.Add(new Row
                {
                    Name = f.Name, Sub = $"{f.Desc} · +{f.Heal} health",
                    Price = $"${cost:N0}", Enabled = p.Money >= cost,
                    Buy = () =>
                    {
                        if (p.Money < cost) return;
                        p.Money -= cost;
                        game.Health = System.Math.Min(game.Needs.MaxHealth, game.Health + f.Heal);
                        game.Needs.Feed(f.Feeds);
                        game.Toast($"{f.Name}: +{f.Heal} health", 2.2f);
                    },
                });
            }
        }
    }
}
