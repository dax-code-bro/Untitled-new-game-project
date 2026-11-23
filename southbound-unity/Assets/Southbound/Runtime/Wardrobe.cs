// Clothes and the barber (the web game's clothing.js, clothes.js, details.js, grooming.js; rules in Core/Clothing and
// Core/OutfitCut). John's one-piece suit is cut into a shirt, a jacket, trousers and bare skin the way the browser's
// shader does it (sleeve length, hem, open fronts, shorts), each in its colour and pattern (stripes, plaid, camo, a
// faded or denim wash, pinstripes, two-tone), his boots recoloured, gloves on his hands, and a hat, glasses or neckwear
// riding his head and neck. The clothing stores sell all 13,500 pieces (pick a colour and pattern, then a style; it goes
// on as you buy it; Saturdays 20% off); the wardrobe in a home of yours changes you into anything you own; the
// barbershops cut, shave, restyle and dye your hair. Hair and stubble grow a day at a time.
using System.Collections.Generic;
using System.Linq;
using Southbound.Core;
using UnityEngine;

namespace Southbound
{
    public sealed class Wardrobe : MonoBehaviour
    {
        public static Wardrobe Instance { get; private set; }
        public string Prompt { get; private set; }
        SouthboundGame game; Outfitter look; System.Func<string> hudPrompt; int lastDay = -1;
        readonly List<(Vector3 at, string name)> barbers = new List<(Vector3, string)>();

        void Awake() { Instance = this; StoreScreen.ClothesFor = s => new ClothesStore(this, s); Homes.AtWardrobe = Open; }
        void OnEnable() { Hud.Prompts.Add(hudPrompt = () => Prompt); Hud.Sources.Add(Blips); }
        void OnDisable() { Hud.Prompts.Remove(hudPrompt); Hud.Sources.Remove(Blips); }

        void Start()
        {
            game = SouthboundGame.Instance;
            if (game != null && game.player != null && game.player.model != null) { look = game.player.model.gameObject.AddComponent<Outfitter>(); Apply(); }
            var L = Missions.Instance != null ? Missions.Instance.Data : null;
            if (L != null) foreach (var (x, z, name) in Clothing.Barbers(L)) barbers.Add((new Vector3(-(float)x, 0, (float)z), name));
        }

        /// <summary>Draw what you're wearing (after buying or changing).</summary>
        public void Apply() { if (look != null && game != null) look.Apply(Clothing.Outfit(game.Profile), game.Profile); }

        /// <summary>The wardrobe (in a home of yours).</summary>
        public void Open() => StoreScreen.Show(new Closet(this));

        void Update()
        {
            Prompt = null;
            if (game == null || game.player == null) return;
            if (lastDay != game.Profile.Day) { lastDay = game.Profile.Day; Clothing.Grow(game.Profile); }
            if (Time.timeScale == 0 || StoreScreen.Showing || !game.player.enabled) return;
            var me = game.player.transform.position;
            foreach (var (at, name) in barbers)
            {
                if (new Vector2(me.x - at.x, me.z - at.z).sqrMagnitude > 2.4f * 2.4f) continue;
                Prompt = $"F  {name} (cut, shave, styles, dye)";
                if (SbInput.InteractDown) StoreScreen.Show(new Barber(this, name));
                return;
            }
        }

        void Blips(List<Hud.Blip> into) { foreach (var (at, _) in barbers) into.Add(new Hud.Blip { at = at, color = new Color(0.85f, 0.25f, 0.25f), size = 5 }); }

        // ------------------------------------------------------------------ the clothing store
        sealed class ClothesStore : StoreScreen.IStore
        {
            readonly Wardrobe w; readonly Shops.Shop shop;
            readonly Dictionary<string, (int pat, int col)> pick = new Dictionary<string, (int, int)>();
            public ClothesStore(Wardrobe w, Shops.Shop s) { this.w = w; shop = s; }
            double K => (shop != null ? shop.priceK : 1) * (Clothing.SaturdaySale(w.game.Profile.Day) ? 0.8 : 1);
            public string Title => shop != null ? shop.name : "Clothing";
            public string Keeper => (shop != null ? $"{shop.keeper} at the counter." : "") + (Clothing.SaturdaySale(w.game.Profile.Day) ? "  Saturday sale: 20% off everything." : "");
            public string[] Tabs => Clothing.Slots.Select(s => s.Label).ToArray();
            public void Fill(string tab, List<StoreScreen.Row> rows, Profile p)
            {
                var s = Clothing.Slots.First(x => x.Label == tab);
                var pal = s.Frames ? Clothing.FrameColors : Clothing.Colors;
                if (!pick.TryGetValue(s.K, out var pc))
                {
                    var on = Clothing.Parse(Clothing.Outfit(p).TryGetValue(s.K, out var k0) ? k0 : null);
                    pc = on != null ? (on.Pat, on.Col) : (0, 0);
                }
                var pp = pc;
                rows.Add(new StoreScreen.Row { Name = $"{(s.Frames ? "Frame" : "Colour")}: {pal[pp.col].name}", Sub = "next ▶", Price = "▶", Buy = () => pick[s.K] = (pp.pat, (pp.col + 1) % pal.Length) });
                rows.Add(new StoreScreen.Row { Name = $"{(s.Frames ? "Frame" : "Colour")}: {pal[pp.col].name}", Sub = "◀ previous", Price = "◀", Buy = () => pick[s.K] = (pp.pat, (pp.col + pal.Length - 1) % pal.Length) });
                rows.Add(new StoreScreen.Row { Name = $"{(s.Frames ? "Lens" : "Pattern")}: {s.Patterns[pp.pat]}", Sub = "next ▶", Price = "▶", Buy = () => pick[s.K] = ((pp.pat + 1) % s.Patterns.Length, pp.col) });
                var outfit = Clothing.Outfit(p);
                if (Clothing.Optional.Contains(s.K) && outfit.TryGetValue(s.K, out var cur) && cur != null)
                    rows.Add(new StoreScreen.Row { Name = "Take it off", Sub = Clothing.Name(cur), Price = "Off", Buy = () => { Clothing.Wear(p, s.K, null); w.Apply(); } });
                foreach (var st in s.Styles)
                {
                    string key = Clothing.Key(s.K, st.Id, pp.pat, pp.col);
                    bool owns = Clothing.Owns(p, key), wearing = outfit.TryGetValue(s.K, out var k2) && k2 == key;
                    int price = Clothing.Price(key, K);
                    rows.Add(new StoreScreen.Row
                    {
                        Name = st.Name, Sub = $"{Clothing.Name(key)} · {st.Desc}", Price = wearing ? "Wearing" : owns ? "Wear" : $"${price:N0}", Enabled = !wearing && (owns || p.Money >= price),
                        Buy = () => { if (Clothing.Buy(p, key, K)) { w.Apply(); w.game.Toast(owns ? $"Wearing the {st.Name.ToLowerInvariant()}" : $"Bought: {Clothing.Name(key)}", 1.8f); } },
                    });
                }
            }
            public string Note(string tab) => $"{Clothing.CatalogSize:N0} pieces in the catalogue · you own {Clothing.Wardrobe(w.game.Profile).Count}. Pick the colour and pattern, then a style: it goes on as you buy it.";
        }

        // ------------------------------------------------------------------ the wardrobe at home
        sealed class Closet : StoreScreen.IStore
        {
            readonly Wardrobe w;
            public Closet(Wardrobe w) { this.w = w; }
            public string Title => "Wardrobe";
            public string Keeper => "Everything you own, on hangers.";
            public string[] Tabs => Clothing.Slots.Select(s => s.Label).ToArray();
            public void Fill(string tab, List<StoreScreen.Row> rows, Profile p)
            {
                var s = Clothing.Slots.First(x => x.Label == tab);
                var outfit = Clothing.Outfit(p);
                outfit.TryGetValue(s.K, out var cur);
                if (Clothing.Optional.Contains(s.K) && cur != null) rows.Add(new StoreScreen.Row { Name = "Take it off", Sub = Clothing.Name(cur), Price = "Off", Buy = () => { Clothing.Wear(p, s.K, null); w.Apply(); } });
                foreach (var key in Clothing.Wardrobe(p).Where(k => k.StartsWith(s.K + ":")))
                {
                    string kk = key;
                    rows.Add(new StoreScreen.Row { Name = Clothing.Name(key), Sub = Clothing.Parse(key).Style.Desc, Price = cur == key ? "Wearing" : "Wear", Enabled = cur != key, Buy = () => { Clothing.Wear(p, s.K, kk); w.Apply(); } });
                }
            }
            public string Note(string tab) => $"You own {Clothing.Wardrobe(w.game.Profile).Count} pieces.";
        }

        // ------------------------------------------------------------------ the barber
        sealed class Barber : StoreScreen.IStore
        {
            readonly Wardrobe w; readonly string name;
            public Barber(Wardrobe w, string name) { this.w = w; this.name = name; }
            public string Title => name;
            public string Keeper { get { var g = Clothing.Groom(w.game.Profile); return g.Num("beard") > 3 || g.Num("hair") > 12 ? "\"Lord, look at you. Sit down.\"" : "\"Just a touch-up?\""; } }
            public string[] Tabs => new[] { "The chair", "Hair", "Beard", "Colour" };
            public void Fill(string tab, List<StoreScreen.Row> rows, Profile p)
            {
                void Paid(int price, string toast, System.Action act) { if (p.Money < price) return; p.Money -= price; act(); p.AddStat("haircuts"); w.Apply(); w.game.Toast(toast, 2f); }
                switch (tab)
                {
                    case "The chair":
                        foreach (var (id, label, price) in Clothing.Cuts)
                        {
                            string i2 = id;
                            rows.Add(new StoreScreen.Row { Name = label, Sub = id == "cut" ? "Short back and sides." : id == "shave" ? "Hot towel and a straight razor." : "A cut and a shave.", Price = $"${price}", Enabled = p.Money >= price, Buy = () => { if (Clothing.Cut(p, i2)) { w.Apply(); w.game.Toast(i2 == "shave" ? "Clean shaven" : i2 == "cut" ? "Fresh cut" : "Looking sharp", 2f); } } });
                        }
                        break;
                    case "Hair":
                        foreach (var (st, label, price) in new[] { ("short", "Scissors: short back and sides", 25), ("buzz", "Clippers: number two all over", 20), ("slicked", "Trim and comb it back with pomade", 30), ("shaved", "Razor: shave the head smooth", 25) })
                        {
                            string s2 = st; bool now = Clothing.StyleOf(p, "hair") == st;
                            rows.Add(new StoreScreen.Row { Name = label, Sub = now ? "your style now" : "", Price = now ? "Now" : $"${price}", Enabled = !now && p.Money >= price, Buy = () => Paid(price, "Looking sharp", () => { Clothing.SetStyle(p, "hair", s2); Clothing.Groom(p)["hair"] = 0.0; }) });
                        }
                        break;
                    case "Beard":
                        foreach (var b in Clothing.Beards)
                        {
                            string b2 = b; bool now = Clothing.StyleOf(p, "beard") == b; int price = b == "clean" ? 15 : 12;
                            rows.Add(new StoreScreen.Row { Name = b == "clean" ? "Clean shaven" : char.ToUpperInvariant(b[0]) + b.Substring(1), Sub = b == "clean" ? "Hot towel shave." : "Trim and shape it.", Price = now ? "Now" : $"${price}", Enabled = !now && p.Money >= price, Buy = () => Paid(price, "Trimmed", () => { Clothing.SetStyle(p, "beard", b2); if (b2 == "clean") Clothing.Groom(p)["beard"] = 0.0; }) });
                        }
                        break;
                    default:
                        foreach (var d in Clothing.Dyes.Keys.Concat(new string[] { null }))
                        {
                            string d2 = d; bool now = Clothing.StyleOf(p, "dye") == d;
                            rows.Add(new StoreScreen.Row { Name = d == null ? "Natural colour" : $"Dye it {d}", Sub = "", Price = now ? "Now" : "$30", Enabled = !now && p.Money >= 30, Buy = () => Paid(30, "New colour", () => Clothing.SetStyle(p, "dye", d2)) });
                        }
                        break;
                }
            }
            public string Note(string tab) { var g = Clothing.Groom(w.game.Profile); return $"Hair {g.Num("hair"):0} days since a cut · beard {g.Num("beard"):0} days."; }
        }
    }

    /// <summary>John's clothes drawn on his model: the suit split by Core/OutfitCut into shirt, jacket, trousers and skin.</summary>
    public sealed class Outfitter : MonoBehaviour
    {
        SkinnedMeshRenderer smr; Mesh original, cut; Material[] originals;
        int iSkin = -1, iSuit = -1, iShoes = -1, iHair = -1, iBrows = -1;
        Transform head, neck; Vector3 eyeLocal, crownLocal, neckLocal, upHead, fwdHead, upNeck, fwdNeck;
        GameObject hat, glasses, neckwear;
        static readonly Dictionary<string, Texture2D> patterns = new Dictionary<string, Texture2D>();

        void Find()
        {
            if (smr != null) return;
            foreach (var r in GetComponentsInChildren<SkinnedMeshRenderer>())
            {
                var mats = r.sharedMaterials;
                for (int i = 0; i < mats.Length; i++) if (mats[i] != null && mats[i].name.StartsWith("suit")) { smr = r; break; }
                if (smr != null) break;
            }
            if (smr == null) return;
            original = smr.sharedMesh; originals = smr.sharedMaterials;
            for (int i = 0; i < originals.Length; i++)
            {
                string n = originals[i] != null ? originals[i].name : "";
                if (n.StartsWith("skin")) iSkin = i; else if (n.StartsWith("suit")) iSuit = i; else if (n.StartsWith("shoes")) iShoes = i; else if (n.StartsWith("hair")) iHair = i; else if (n.StartsWith("eyebrows")) iBrows = i;
            }
            head = smr.bones.FirstOrDefault(b => b != null && b.name == "head"); neck = smr.bones.FirstOrDefault(b => b != null && (b.name == "neck01" || b.name == "neck"));
            Anchors();
        }

        /// <summary>Where the eyes, the crown and the collar are, in the head and neck bones' own space (from the bind pose).</summary>
        void Anchors()
        {
            if (original == null || !original.isReadable) return;
            var v = original.vertices; var bp = original.bindposes; var bones = smr.bones;
            int hi = System.Array.IndexOf(bones, head), ni = System.Array.IndexOf(bones, neck);
            Vector3 Mean(int sub, System.Func<Vector3, bool> keep)
            {
                if (sub < 0) return Vector3.zero;
                var tri = original.GetTriangles(sub); Vector3 s = Vector3.zero; int n = 0;
                foreach (var i in tri) if (keep(v[i])) { s += v[i]; n++; }
                return n > 0 ? s / n : Vector3.zero;
            }
            var b = original.bounds; float H = b.size.y;
            int eyes = System.Array.FindIndex(originals, m => m != null && m.name.StartsWith("eyes"));
            var eye = Mean(eyes, _ => true);
            var crown = new Vector3(b.center.x, b.max.y, b.center.z);
            var collar = Mean(iSuit, q => q.y > b.max.y - H * 0.14f && Mathf.Abs(q.x - b.center.x) < H * 0.08f);
            if (hi >= 0)
            {
                eyeLocal = bp[hi].MultiplyPoint3x4(eye); crownLocal = bp[hi].MultiplyPoint3x4(crown);
                upHead = bp[hi].MultiplyVector(Vector3.up).normalized; fwdHead = bp[hi].MultiplyVector(Vector3.forward).normalized;
            }
            if (ni >= 0) { neckLocal = bp[ni].MultiplyPoint3x4(collar); upNeck = bp[ni].MultiplyVector(Vector3.up).normalized; fwdNeck = bp[ni].MultiplyVector(Vector3.forward).normalized; }
        }

        public void Apply(Dictionary<string, string> outfit, Profile p)
        {
            Find();
            if (smr == null) return;
            Item Get(string slot) => outfit.TryGetValue(slot, out var k) ? Clothing.Parse(k) : null;
            Item top = Get("top"), outer = Get("outer"), bottom = Get("bottom"), shoes = Get("shoes"), hatI = Get("hat"), eye = Get("eye"), neckI = Get("neck"), gloves = Get("gloves");
            string hairStyle = Clothing.StyleOf(p, "hair"), dye = Clothing.StyleOf(p, "dye");
            bool bald = hairStyle == "buzz" || hairStyle == "shaved";
            if (original.isReadable && iSuit >= 0) Cut(top, outer, bottom, gloves, bald);
            else smr.sharedMesh = original;
            // the materials: the cut submeshes after the original ones
            var mats = new List<Material>(originals);
            if (cut != null && smr.sharedMesh == cut)
            {
                mats.Add(Cloth(top)); mats.Add(Cloth(outer)); mats.Add(Cloth(bottom)); mats.Add(originals[iSkin >= 0 ? iSkin : 0]);
                mats.Add(gloves != null ? Cloth(gloves) : originals[iSkin >= 0 ? iSkin : 0]);
                if (iSuit >= 0) mats[iSuit] = Cloth(top);
            }
            else if (iSuit >= 0 && top != null) mats[iSuit] = Cloth(top);
            if (iShoes >= 0 && shoes != null) { var m = new Material(originals[iShoes]); Tint(m, Hex(shoes.Color.hex)); mats[iShoes] = m; }
            if (dye != null && Clothing.Dyes.TryGetValue(dye, out var dh))
            {
                if (iHair >= 0) { var m = new Material(originals[iHair]); Tint(m, Hex(dh)); mats[iHair] = m; }
                if (iBrows >= 0) { var m = new Material(originals[iBrows]); Tint(m, Hex(dh)); mats[iBrows] = m; }
            }
            smr.sharedMaterials = mats.ToArray();
            Accessories(hatI, eye, neckI);
        }

        /// <summary>Split the suit (and the hands) into the outfit's parts: submeshes after the originals: top, outer, bottom, bare skin, hands.</summary>
        void Cut(Item top, Item outer, Item bottom, Item gloves, bool bald)
        {
            if (cut == null) { cut = Instantiate(original); cut.name = original.name + " (outfit)"; }
            var v = original.vertices; var b = original.bounds;
            float H = b.size.y; var c = b.center;
            Vector3 N(Vector3 q) => new Vector3((q.x - c.x) / H * 2, (q.y - b.min.y) / H * 2 - 1, (q.z - c.z) / H * 2);
            int baseCount = original.subMeshCount;
            var parts = new List<int>[5]; for (int i = 0; i < 5; i++) parts[i] = new List<int>();
            var keepSuit = new List<int>(); var keepSkin = new List<int>();
            var suit = original.GetTriangles(iSuit);
            for (int t = 0; t < suit.Length; t += 3)
            {
                var m = N((v[suit[t]] + v[suit[t + 1]] + v[suit[t + 2]]) / 3);
                var cl = OutfitCut.Suit(m.x, m.y, m.z, top?.Style, outer?.Style, bottom?.Style);
                var into = cl == Core.Cloth.Top ? parts[0] : cl == Core.Cloth.Outer ? parts[1] : cl == Core.Cloth.Bottom ? parts[2] : parts[3];
                into.Add(suit[t]); into.Add(suit[t + 1]); into.Add(suit[t + 2]);
            }
            if (iSkin >= 0)
            {
                var skin = original.GetTriangles(iSkin);
                for (int t = 0; t < skin.Length; t += 3)
                {
                    var m = N((v[skin[t]] + v[skin[t + 1]] + v[skin[t + 2]]) / 3);
                    var into = gloves != null && OutfitCut.Hand(m.x, m.y) ? parts[4] : keepSkin;
                    into.Add(skin[t]); into.Add(skin[t + 1]); into.Add(skin[t + 2]);
                }
            }
            cut.subMeshCount = baseCount + 5;
            for (int s = 0; s < baseCount; s++)
            {
                if (s == iSuit) cut.SetTriangles(new int[0], s, false);
                else if (s == iSkin) cut.SetTriangles(keepSkin, s, false);
                else if (s == iHair && bald) cut.SetTriangles(new int[0], s, false);
                else cut.SetTriangles(original.GetTriangles(s), s, false);
            }
            for (int k = 0; k < 5; k++) cut.SetTriangles(parts[k], baseCount + k, false);
            cut.RecalculateBounds();
            smr.sharedMesh = cut;
        }

        static Color Hex(int h) => new Color(((h >> 16) & 255) / 255f, ((h >> 8) & 255) / 255f, (h & 255) / 255f).linear;

        static void Tint(Material m, Color c)
        {
            if (m.HasProperty("baseColorFactor")) m.SetColor("baseColorFactor", c);
            if (m.HasProperty("_BaseColor")) m.SetColor("_BaseColor", c);
            if (m.HasProperty("_Color")) m.SetColor("_Color", c);
        }

        static Material Cloth(Item it)
        {
            if (it == null) return CraftBody.Paint((0.5f, 0.5f, 0.5f, 0.8f, 0f));
            var col = Hex(it.Color.hex);
            var m = CraftBody.Paint((col.r, col.g, col.b, (float)it.Style.Rough, 0f));
            var tex = Pattern(it.Pattern);
            if (tex != null)
            {
                if (m.HasProperty("_BaseColorMap")) { m.SetTexture("_BaseColorMap", tex); m.SetTextureScale("_BaseColorMap", new Vector2(6, 6)); }
                if (m.HasProperty("_MainTex")) { m.SetTexture("_MainTex", tex); m.SetTextureScale("_MainTex", new Vector2(6, 6)); }
            }
            return m;
        }

        /// <summary>A small tiling pattern in greys (the colour tints it): stripes, plaid, camo, a fade, denim, pinstripes, two-tone.</summary>
        static Texture2D Pattern(string name)
        {
            if (name == "Solid" || name == "Plain" || name == null) return null;
            if (patterns.TryGetValue(name, out var t)) return t;
            const int S = 64;
            t = new Texture2D(S, S, TextureFormat.RGBA32, true) { name = "Cloth " + name, wrapMode = TextureWrapMode.Repeat };
            var rnd = new System.Random(name.GetHashCode());
            var blobs = Enumerable.Range(0, 14).Select(_ => (x: rnd.Next(S), y: rnd.Next(S), r: 5 + rnd.Next(9), k: rnd.Next(3))).ToArray();
            var px = new Color[S * S];
            for (int y = 0; y < S; y++)
                for (int x = 0; x < S; x++)
                {
                    float v = 1;
                    switch (name)
                    {
                        case "Striped": v = (y / 6) % 2 == 0 ? 1 : 0.62f; break;
                        case "Pinstripe": v = x % 8 == 0 ? 1.35f : 0.92f; break;
                        case "Plaid": v = ((x / 8) % 2 == 0 ? 0.82f : 1f) * ((y / 8) % 2 == 0 ? 0.82f : 1f) * (x % 16 == 0 || y % 16 == 0 ? 1.3f : 1f); break;
                        case "Two-tone": v = y < S / 2 ? 1 : 0.6f; break;
                        case "Faded": v = 0.82f + 0.18f * (float)rnd.NextDouble(); break;
                        case "Denim wash": v = 0.75f + 0.25f * Mathf.PerlinNoise(x * 0.18f, y * 0.05f) + ((x + y) % 3 == 0 ? 0.06f : 0); break;
                        case "Camo":
                            v = 1;
                            foreach (var bl in blobs) { int dx = Mathf.Min(Mathf.Abs(x - bl.x), S - Mathf.Abs(x - bl.x)), dy = Mathf.Min(Mathf.Abs(y - bl.y), S - Mathf.Abs(y - bl.y)); if (dx * dx + dy * dy < bl.r * bl.r) v = bl.k == 0 ? 0.45f : bl.k == 1 ? 0.7f : 1.25f; }
                            break;
                        case "Patterned": v = ((x + y) / 5) % 2 == 0 ? 1 : 0.7f; break;
                        case "Smoke": case "Amber": case "Mirror": case "Clear": v = 1; break;
                    }
                    px[y * S + x] = new Color(Mathf.Min(1, v), Mathf.Min(1, v), Mathf.Min(1, v), 1);
                }
            t.SetPixels(px); t.Apply(true);
            patterns[name] = t;
            return t;
        }

        // ------------------------------------------------------------------ hats, glasses and neckwear, riding the bones
        void Accessories(Item hatI, Item eyeI, Item neckI)
        {
            if (hat != null) Destroy(hat); if (glasses != null) Destroy(glasses); if (neckwear != null) Destroy(neckwear);
            hat = hatI != null && head != null ? Hat(hatI) : null;
            glasses = eyeI != null && head != null ? Glasses(eyeI) : null;
            neckwear = neckI != null && (neck != null || head != null) ? Neck(neckI) : null;
        }

        static GameObject Part(PrimitiveType t, Transform parent, Vector3 pos, Vector3 scale, Material m, Vector3 euler = default)
        {
            var g = GameObject.CreatePrimitive(t); Destroy(g.GetComponent<Collider>());
            g.transform.SetParent(parent, false); g.transform.localPosition = pos; g.transform.localScale = scale; g.transform.localEulerAngles = euler;
            g.GetComponent<MeshRenderer>().sharedMaterial = m;
            return g;
        }

        GameObject Hat(Item it)
        {
            var root = new GameObject("Hat"); var m = Cloth(it); string id = it.Style.Id;
            float brim = id == "cowboy" ? 0.46f : id == "straw" ? 0.48f : id == "fedora" ? 0.34f : id == "bucket" || id == "boonie" ? 0.32f : 0;
            float crownH = id == "cowboy" || id == "fedora" ? 0.13f : id == "beanie" ? 0.1f : id == "headwrap" ? 0.05f : 0.09f;
            Part(id == "beanie" ? PrimitiveType.Sphere : PrimitiveType.Cylinder, root.transform, new Vector3(0, crownH * 0.5f - 0.03f, 0), new Vector3(0.21f, id == "beanie" ? 0.2f : crownH * 0.5f, 0.23f), m);
            if (brim > 0) Part(PrimitiveType.Cylinder, root.transform, new Vector3(0, -0.035f, 0), new Vector3(brim, 0.006f, brim), m);
            if (id == "cap" || id == "trucker" || id == "flatcap") Part(PrimitiveType.Cylinder, root.transform, new Vector3(0, -0.03f, 0.11f), new Vector3(0.18f, 0.005f, 0.14f), m);
            return root;
        }

        GameObject Glasses(Item it)
        {
            var root = new GameObject("Glasses");
            var frame = CraftBody.Paint((Hex(it.Color.hex).r, Hex(it.Color.hex).g, Hex(it.Color.hex).b, 0.3f, 0.6f));
            string lens = it.Pattern;
            var glass = CraftBody.Paint(lens == "Smoke" ? (0.05f, 0.05f, 0.06f, 0.05f, 0f) : lens == "Amber" ? (0.45f, 0.28f, 0.05f, 0.05f, 0f) : lens == "Mirror" ? (0.6f, 0.62f, 0.66f, 0.02f, 1f) : (0.75f, 0.8f, 0.85f, 0.05f, 0f));
            foreach (var sx in new[] { -0.032f, 0.032f }) Part(PrimitiveType.Sphere, root.transform, new Vector3(sx, 0, 0.012f), new Vector3(0.042f, 0.032f, 0.006f), glass);
            Part(PrimitiveType.Cube, root.transform, new Vector3(0, 0.012f, 0.012f), new Vector3(0.13f, 0.005f, 0.005f), frame);
            foreach (var sx in new[] { -0.066f, 0.066f }) Part(PrimitiveType.Cube, root.transform, new Vector3(sx, 0.01f, -0.04f), new Vector3(0.004f, 0.004f, 0.1f), frame);
            return root;
        }

        GameObject Neck(Item it)
        {
            var root = new GameObject("Neckwear"); var m = Cloth(it); string id = it.Style.Id;
            if (id == "tie") { Part(PrimitiveType.Cube, root.transform, new Vector3(0, -0.2f, 0.11f), new Vector3(0.07f, 0.36f, 0.01f), m); Part(PrimitiveType.Cube, root.transform, new Vector3(0, -0.01f, 0.1f), new Vector3(0.04f, 0.04f, 0.02f), m); }
            else if (id == "bowtie") Part(PrimitiveType.Cube, root.transform, new Vector3(0, -0.02f, 0.1f), new Vector3(0.11f, 0.04f, 0.02f), m);
            else if (id == "bolo") { Part(PrimitiveType.Cylinder, root.transform, new Vector3(0, -0.06f, 0.1f), new Vector3(0.035f, 0.004f, 0.035f), CraftBody.Paint((0.75f, 0.76f, 0.78f, 0.2f, 1f)), new Vector3(90, 0, 0)); Part(PrimitiveType.Cube, root.transform, new Vector3(0, -0.16f, 0.1f), new Vector3(0.006f, 0.2f, 0.006f), m); }
            else Part(PrimitiveType.Cylinder, root.transform, new Vector3(0, -0.01f, 0.01f), new Vector3(id == "scarf" ? 0.17f : 0.15f, id == "scarf" ? 0.05f : 0.035f, id == "scarf" ? 0.17f : 0.15f), m);
            return root;
        }

        void LateUpdate()
        {
            if (head != null)
            {
                var up = head.TransformDirection(upHead); var fwd = head.TransformDirection(fwdHead);
                if (up.sqrMagnitude < 1e-6f || fwd.sqrMagnitude < 1e-6f) { up = Vector3.up; fwd = transform.forward; }
                var rot = Quaternion.LookRotation(fwd, up);
                if (hat != null) hat.transform.SetPositionAndRotation(head.TransformPoint(crownLocal) - up * 0.04f, rot);
                if (glasses != null) glasses.transform.SetPositionAndRotation(head.TransformPoint(eyeLocal) + fwd * 0.02f, rot);
            }
            if (neckwear != null)
            {
                var b = neck != null ? neck : head; var nl = neck != null ? neckLocal : eyeLocal;
                var up = b.TransformDirection(neck != null ? upNeck : upHead); var fwd = b.TransformDirection(neck != null ? fwdNeck : fwdHead);
                if (up.sqrMagnitude < 1e-6f || fwd.sqrMagnitude < 1e-6f) { up = Vector3.up; fwd = transform.forward; }
                neckwear.transform.SetPositionAndRotation(b.TransformPoint(nl), Quaternion.LookRotation(fwd, up));
            }
        }
    }
}
