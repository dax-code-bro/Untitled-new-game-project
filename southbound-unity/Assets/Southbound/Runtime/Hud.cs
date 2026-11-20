// The game's HUD in UI Toolkit, built in code (no UXML or USS to keep in step): bottom left a round
// minimap (the baked map of Calvera, Core/MapRaster, turning with the camera and zooming out as you
// drive faster; your arrow, north, police cruisers flashing red and blue, anything else a system adds
// with Hud.Sources) with health and stamina under it; top right the clock, your money (and what just
// changed it), the wanted stars; right the weapon and its ammunition; bottom right the speedometer in a
// car; prompts at the bottom, messages at the top, a crosshair while aiming, BUSTED / WASTED across the
// middle. Hidden in photo mode. Systems keep drawing their own OnGUI text only while there's no HUD.
using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UIElements;

namespace Southbound
{
    public sealed class Hud : MonoBehaviour
    {
        [Tooltip("UI Toolkit panel settings (HudBuilder makes one with the default runtime theme). Made at runtime if empty.")]
        public PanelSettings panel;
        [Tooltip("The baked map of Calvera (HudBuilder: Core/MapRaster), covering mapSize metres centred on the origin.")]
        public Texture2D map;
        public float mapSize = 4096f;
        [Tooltip("Metres across the minimap on foot, and at full speed in a car.")]
        public float minimapNear = 300f, minimapFar = 560f;

        /// <summary>A dot on the minimap.</summary>
        public struct Blip { public Vector3 at; public Color color; public float size; public bool keepOnEdge; }
        /// <summary>Systems that put dots on the minimap (police, missions, shops): called every frame.</summary>
        public static readonly List<Action<List<Blip>>> Sources = new List<Action<List<Blip>>>();
        public static Hud Instance { get; private set; }
        /// <summary>Is the HUD up (so the OnGUI fallbacks stay quiet)?</summary>
        public static bool Showing => Instance != null && Instance.ready;

        const float MapPx = 240;
        static readonly Color Ink = new Color(0.95f, 0.93f, 0.88f), Panel = new Color(0, 0, 0, 0.45f), Money = new Color(0.45f, 0.86f, 0.42f), Bad = new Color(0.93f, 0.3f, 0.25f);

        UIDocument doc;
        bool ready;
        VisualElement root, mapClip, mapImage, arrow, north, blipLayer, healthFill, staminaFill, stars, crosshair, weaponBox, speedBox, bannerBand, fuelFill, engineFill;
        Label clock, money, moneyDelta, weaponName, weaponAmmo, speed, carName, prompt, toast, banner, needs;
        readonly VisualElement[] starIcons = new VisualElement[5];
        readonly List<VisualElement> blipPool = new List<VisualElement>();
        readonly List<Blip> blips = new List<Blip>();
        SouthboundGame game; Driving driving; Gunplay gun; Police police;
        float zoom;
        double lastMoney = double.NaN; float deltaUntil;
        // what's on screen, so text is only rebuilt when it changes
        int shownMinute = -1, shownMoney = int.MinValue, shownClip = -1, shownReserve = -1, shownSpeed = -1;
        string shownWeapon, shownCar, shownPrompt, shownToast, shownBanner, shownNeeds;

        void Awake() => Instance = this;

        void Start()
        {
            game = SouthboundGame.Instance != null ? SouthboundGame.Instance : FindAnyObjectByType<SouthboundGame>();
            driving = game != null && game.driving != null ? game.driving : FindAnyObjectByType<Driving>();
            gun = game != null && game.gunplay != null ? game.gunplay : FindAnyObjectByType<Gunplay>();
            police = FindAnyObjectByType<Police>();
            try { Build(); ready = true; }
            catch (Exception e) { Debug.LogWarning("Southbound: the HUD couldn't start (" + e.Message + "): falling back to the plain on-screen text."); ready = false; }
        }

        void OnDestroy() { if (Instance == this) Instance = null; }

        // ------------------------------------------------------------------ building it
        void Build()
        {
            if (panel == null)
            {
                panel = ScriptableObject.CreateInstance<PanelSettings>();
                panel.scaleMode = PanelScaleMode.ScaleWithScreenSize;
                panel.referenceResolution = new Vector2Int(1920, 1080);
                panel.screenMatchMode = PanelScreenMatchMode.MatchWidthOrHeight;
                panel.match = 0.5f;
            }
            // a UIDocument wants its panel before it wakes: add it to an inactive object, then switch it on
            var host = new GameObject("HUD document");
            host.SetActive(false);
            host.transform.SetParent(transform, false);
            doc = host.AddComponent<UIDocument>();
            doc.panelSettings = panel;
            host.SetActive(true);
            root = doc.rootVisualElement;
            root.pickingMode = PickingMode.Ignore;
            root.style.position = Position.Absolute;
            root.style.left = 0; root.style.top = 0; root.style.right = 0; root.style.bottom = 0;
            if (panel.themeStyleSheet == null)
            {
                // no theme: give the text a font ourselves
#if UNITY_2022_2_OR_NEWER
                var font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
#else
                var font = Resources.GetBuiltinResource<Font>("Arial.ttf");
#endif
                if (font != null) root.style.unityFontDefinition = new StyleFontDefinition(FontDefinition.FromFont(font));
            }

            // ---- bottom left: the minimap, health and stamina
            var left = Box(root, 32, null, null, 32);
            left.style.width = MapPx;
            mapClip = El(left);
            mapClip.style.width = MapPx; mapClip.style.height = MapPx;
            mapClip.style.overflow = Overflow.Hidden;
            Round(mapClip, MapPx / 2);
            mapClip.style.backgroundColor = new Color(0.08f, 0.1f, 0.12f, 0.9f);
            Border(mapClip, 3, new Color(0, 0, 0, 0.6f));
            mapImage = El(mapClip);
            mapImage.style.position = Position.Absolute;
            if (map != null) mapImage.style.backgroundImage = new StyleBackground(map);
            blipLayer = El(mapClip);
            blipLayer.style.position = Position.Absolute; blipLayer.style.left = 0; blipLayer.style.top = 0; blipLayer.style.width = MapPx; blipLayer.style.height = MapPx;
            arrow = El(mapClip);
            arrow.style.position = Position.Absolute;
            arrow.style.width = 22; arrow.style.height = 22; arrow.style.left = MapPx / 2 - 11; arrow.style.top = MapPx / 2 - 11;
            arrow.style.backgroundImage = new StyleBackground(HudArt.Arrow);
            arrow.style.unityBackgroundImageTintColor = Ink;
            north = new Label("N");
            north.pickingMode = PickingMode.Ignore;
            north.style.position = Position.Absolute; north.style.width = 20; north.style.height = 20;
            north.style.fontSize = 14; north.style.color = Ink; north.style.unityFontStyleAndWeight = FontStyle.Bold;
            north.style.unityTextAlign = TextAnchor.MiddleCenter;
            north.style.backgroundColor = new Color(0, 0, 0, 0.6f); Round(north, 10);
            mapClip.Add(north);
            healthFill = Bar(left, new Color(0.36f, 0.8f, 0.34f), 10, 8);
            staminaFill = Bar(left, new Color(0.38f, 0.66f, 0.95f), 5, 4);
            needs = Text(left, 14, Ink);
            needs.style.marginTop = 4;

            // ---- top right: the clock, money, stars; under them the weapon
            var right = Box(root, null, 32, 28, null);
            right.style.alignItems = Align.FlexEnd;
            clock = Text(right, 18, Ink);
            var moneyRow = El(right); moneyRow.style.flexDirection = FlexDirection.Row; moneyRow.style.alignItems = Align.Center;
            moneyDelta = Text(moneyRow, 20, Money); moneyDelta.style.marginRight = 10;
            money = Text(moneyRow, 34, Money);
            money.style.unityFontStyleAndWeight = FontStyle.Bold;
            stars = El(right); stars.style.flexDirection = FlexDirection.Row; stars.style.marginTop = 4;
            for (int i = 0; i < 5; i++)
            {
                var s = El(stars);
                s.style.width = 30; s.style.height = 30; s.style.marginLeft = 3;
                s.style.backgroundImage = new StyleBackground(HudArt.Star);
                starIcons[i] = s;
            }
            weaponBox = El(right);
            weaponBox.style.marginTop = 14; weaponBox.style.alignItems = Align.FlexEnd;
            weaponBox.style.backgroundColor = Panel; Round(weaponBox, 6);
            weaponBox.style.paddingLeft = 12; weaponBox.style.paddingRight = 12; weaponBox.style.paddingTop = 6; weaponBox.style.paddingBottom = 6;
            weaponName = Text(weaponBox, 16, Ink);
            weaponAmmo = Text(weaponBox, 26, Ink);
            weaponAmmo.style.unityFontStyleAndWeight = FontStyle.Bold;

            // ---- bottom right: the speedometer
            speedBox = Box(root, null, 32, null, 32);
            speedBox.style.alignItems = Align.FlexEnd;
            speed = Text(speedBox, 56, Ink);
            speed.style.unityFontStyleAndWeight = FontStyle.Bold;
            carName = Text(speedBox, 16, Ink);
            fuelFill = BarRow(speedBox, "Fuel", new Color(0.91f, 0.69f, 0.29f));
            engineFill = BarRow(speedBox, "Engine", new Color(0.36f, 0.8f, 0.34f));

            // ---- prompts, messages, crosshair, banner
            prompt = Centered(root, 20, 170, true);
            toast = Centered(root, 22, 64, false);
            crosshair = El(root);
            crosshair.style.position = Position.Absolute; crosshair.style.left = Length.Percent(50); crosshair.style.top = Length.Percent(50);
            foreach (var (x, y, w, h) in new[] { (-1f, -12f, 2f, 7f), (-1f, 5f, 2f, 7f), (-12f, -1f, 7f, 2f), (5f, -1f, 7f, 2f), (-1.5f, -1.5f, 3f, 3f) })
            {
                var t = El(crosshair);
                t.style.position = Position.Absolute; t.style.left = x; t.style.top = y; t.style.width = w; t.style.height = h;
                t.style.backgroundColor = new Color(1, 1, 1, 0.9f);
            }
            bannerBand = El(root);
            bannerBand.style.position = Position.Absolute; bannerBand.style.left = 0; bannerBand.style.right = 0;
            bannerBand.style.top = Length.Percent(50); bannerBand.style.height = 150; bannerBand.style.marginTop = -75;
            bannerBand.style.backgroundColor = new Color(0, 0, 0, 0.5f);
            bannerBand.style.justifyContent = Justify.Center;
            banner = Text(bannerBand, 96, Ink);
            banner.style.unityTextAlign = TextAnchor.MiddleCenter;
            banner.style.unityFontStyleAndWeight = FontStyle.Bold;
        }

        static VisualElement El(VisualElement parent)
        {
            var e = new VisualElement { pickingMode = PickingMode.Ignore };
            parent.Add(e);
            return e;
        }

        static VisualElement Box(VisualElement parent, float? left, float? right, float? top, float? bottom)
        {
            var e = El(parent);
            e.style.position = Position.Absolute;
            if (left.HasValue) e.style.left = left.Value;
            if (right.HasValue) e.style.right = right.Value;
            if (top.HasValue) e.style.top = top.Value;
            if (bottom.HasValue) e.style.bottom = bottom.Value;
            return e;
        }

        static Label Text(VisualElement parent, int size, Color color)
        {
            var l = new Label { pickingMode = PickingMode.Ignore };
            l.style.fontSize = size; l.style.color = color;
            l.style.marginLeft = 0; l.style.marginRight = 0; l.style.paddingLeft = 0; l.style.paddingRight = 0;
            parent.Add(l);
            return l;
        }

        static Label Centered(VisualElement parent, int size, float fromEdge, bool bottom)
        {
            var row = El(parent);
            row.style.position = Position.Absolute; row.style.left = 0; row.style.right = 0;
            if (bottom) row.style.bottom = fromEdge; else row.style.top = fromEdge;
            row.style.alignItems = Align.Center;
            var l = Text(row, size, Ink);
            l.style.backgroundColor = Panel; Round(l, 6);
            l.style.paddingLeft = 16; l.style.paddingRight = 16; l.style.paddingTop = 6; l.style.paddingBottom = 6;
            l.style.unityTextAlign = TextAnchor.MiddleCenter;
            return l;
        }

        static VisualElement Bar(VisualElement parent, Color fill, float height, float gap)
        {
            var back = El(parent);
            back.style.height = height; back.style.marginTop = gap;
            back.style.backgroundColor = new Color(0, 0, 0, 0.55f);
            Round(back, height / 2);
            back.style.overflow = Overflow.Hidden;
            var f = El(back);
            f.style.height = Length.Percent(100); f.style.width = Length.Percent(100);
            f.style.backgroundColor = fill;
            return f;
        }

        /// <summary>A small captioned gauge, right-aligned: returns its fill.</summary>
        static VisualElement BarRow(VisualElement parent, string caption, Color fill)
        {
            var row = El(parent);
            row.style.flexDirection = FlexDirection.Row; row.style.alignItems = Align.Center; row.style.marginTop = 5; row.style.width = 230;
            var l = Text(row, 13, Ink); l.text = caption; l.style.width = 58; l.style.unityTextAlign = TextAnchor.MiddleRight; l.style.marginRight = 8;
            var back = El(row);
            back.style.flexGrow = 1; back.style.height = 6;
            back.style.backgroundColor = new Color(0, 0, 0, 0.55f);
            Round(back, 3);
            back.style.overflow = Overflow.Hidden;
            var f = El(back);
            f.style.height = Length.Percent(100); f.style.width = Length.Percent(100);
            f.style.backgroundColor = fill;
            return f;
        }

        static void Round(VisualElement e, float r) { e.style.borderTopLeftRadius = r; e.style.borderTopRightRadius = r; e.style.borderBottomLeftRadius = r; e.style.borderBottomRightRadius = r; }

        static void Border(VisualElement e, float w, Color c)
        {
            e.style.borderTopWidth = w; e.style.borderBottomWidth = w; e.style.borderLeftWidth = w; e.style.borderRightWidth = w;
            e.style.borderTopColor = c; e.style.borderBottomColor = c; e.style.borderLeftColor = c; e.style.borderRightColor = c;
        }

        static void Show(VisualElement e, bool on) { var d = on ? DisplayStyle.Flex : DisplayStyle.None; if (e.style.display != d) e.style.display = d; }

        static void SetText(Label l, ref string shown, string text)
        {
            if (shown == text) return;
            shown = text;
            l.text = text ?? "";
            Show(l, !string.IsNullOrEmpty(text));
        }

        // ------------------------------------------------------------------ every frame
        void LateUpdate()
        {
            if (!ready || root == null) return;
            Show(root, !PhotoMode.Active);
            if (PhotoMode.Active || game == null) return;
            float dt = Time.unscaledDeltaTime;
            var car = driving != null ? driving.Car : null;
            var me = car != null ? car.transform : game.player != null ? game.player.transform : null;

            Minimap(me, car, dt);

            // health and stamina
            float hp = Mathf.Clamp01((float)(game.Health / Math.Max(1, game.Needs.MaxHealth)));
            healthFill.style.width = Length.Percent(hp * 100);
            healthFill.style.backgroundColor = hp < 0.3f ? Bad : new Color(0.36f, 0.8f, 0.34f);
            staminaFill.style.width = Length.Percent(Mathf.Clamp01((float)game.Needs.Stamina) * 100);
            var n = game.Needs;
            string needText = (n.Tired || n.Hungry) ? string.Join("  ·  ", new[] { n.Tired ? n.EnergyWord : null, n.Hungry ? n.FoodWord : null }).Trim(' ', '·') : null;
            SetText(needs, ref shownNeeds, needText);

            // clock and money
            int minute = (int)(game.Profile.Hour * 60);
            if (minute != shownMinute)
            {
                shownMinute = minute;
                clock.text = $"Day {game.Profile.Day}   {minute / 60 % 24:00}:{minute % 60:00}";
            }
            double cash = game.Profile.Money;
            if (!double.IsNaN(lastMoney) && Math.Abs(cash - lastMoney) >= 1)
            {
                double d = cash - lastMoney;
                moneyDelta.text = (d > 0 ? "+$" : "-$") + Math.Abs(d).ToString("N0");
                moneyDelta.style.color = d > 0 ? Money : Bad;
                deltaUntil = Time.unscaledTime + 3f;
            }
            lastMoney = cash;
            Show(moneyDelta, Time.unscaledTime < deltaUntil);
            int dollars = (int)Math.Floor(cash);
            if (dollars != shownMoney) { shownMoney = dollars; money.text = "$" + dollars.ToString("N0"); }

            // wanted stars
            int st = police != null ? police.Stars : 0;
            Show(stars, st > 0);
            if (st > 0)
            {
                bool blink = police.Wanted.Lost && Mathf.Repeat(Time.unscaledTime, 0.8f) < 0.4f;
                for (int i = 0; i < 5; i++)
                    starIcons[i].style.unityBackgroundImageTintColor = i < st ? (blink ? new Color(1, 1, 1, 0.35f) : new Color(1f, 0.93f, 0.75f)) : new Color(0, 0, 0, 0.4f);
            }

            // the weapon
            var w = gun != null && gun.enabled ? gun.Weapon : null;
            Show(weaponBox, w != null && car == null);
            if (w != null)
            {
                string label = w.Name + (gun.Drawn ? "" : " (holstered)");
                if (label != shownWeapon) { shownWeapon = label; weaponName.text = label; }
                int clip = w.Melee ? -2 : gun.Clip, reserve = w.Melee ? -2 : gun.Reserve;
                if (clip != shownClip || reserve != shownReserve || gun.Reloading)
                {
                    shownClip = clip; shownReserve = reserve;
                    weaponAmmo.text = w.Melee ? "" : gun.Reloading ? "reloading" : $"{clip}  |  {reserve}";
                    weaponAmmo.style.color = !w.Melee && clip == 0 ? Bad : Ink;
                }
            }

            // the speedometer
            Show(speedBox, car != null);
            if (car != null)
            {
                int mph = Mathf.RoundToInt(Mathf.Abs(car.SpeedMph));
                if (mph != shownSpeed) { shownSpeed = mph; speed.text = mph + " mph"; }
                string nm = car.displayName + (car.Controls.Nitro ? "   NOS" : "") + (car.Controls.Handbrake ? "   HANDBRAKE" : "");
                if (nm != shownCar) { shownCar = nm; carName.text = nm; }
                // the tank and the engine (CarHealth)
                var ch = car.GetComponent<CarHealth>();
                Show(fuelFill.parent.parent, ch != null); Show(engineFill.parent.parent, ch != null);
                if (ch != null)
                {
                    float fuel = Mathf.Clamp01((float)ch.State.Fuel), eng = Mathf.Clamp01((float)(ch.State.Health / ch.State.MaxHealth));
                    fuelFill.style.width = Length.Percent(fuel * 100);
                    fuelFill.style.backgroundColor = fuel < 0.15f ? Bad : new Color(0.91f, 0.69f, 0.29f);
                    engineFill.style.width = Length.Percent(eng * 100);
                    engineFill.style.backgroundColor = ch.State.OnFire ? new Color(1f, 0.45f, 0.1f) : eng < 0.25f ? Bad : eng < 0.5f ? new Color(0.92f, 0.78f, 0.3f) : new Color(0.36f, 0.8f, 0.34f);
                }
            }

            // prompt (the police's first), message, crosshair, banner
            string p = police != null && police.Prompt != null ? police.Prompt : driving != null ? driving.Prompt : null;
            SetText(prompt, ref shownPrompt, p);
            SetText(toast, ref shownToast, game.ToastText);
            Show(crosshair, gun != null && gun.Aiming && car == null);
            string b = police != null ? police.Banner : null;
            if (b != shownBanner)
            {
                shownBanner = b;
                banner.text = b ?? "";
                banner.style.color = b == "WASTED" ? new Color(0.85f, 0.1f, 0.08f) : Ink;
            }
            Show(bannerBand, b != null);
        }

        void Minimap(Transform me, CarController car, float dt)
        {
            if (me == null) return;
            // zoom out with speed, so there's road ahead to see
            float want = car != null ? Mathf.Lerp(minimapNear, minimapFar, Mathf.Clamp01(Mathf.Abs(car.ForwardSpeed) / 35f)) : minimapNear;
            zoom = zoom <= 0 ? want : Mathf.Lerp(zoom, want, Mathf.Clamp01(dt * 1.5f));
            float scale = MapPx / zoom;   // UI pixels per metre
            var p = me.position;
            float half = mapSize / 2;
            float size = mapSize * scale;
            float px = (p.x + half) * scale, py = (half - p.z) * scale;   // where you are on the map image
            mapImage.style.width = size; mapImage.style.height = size;
            mapImage.style.translate = new StyleTranslate(new Translate(MapPx / 2 - px, MapPx / 2 - py, 0));
            // turn the map with the camera: what's in front of the camera is up
            var cam = Camera.main != null ? Camera.main.transform : me;
            float yaw = cam.eulerAngles.y;
            mapImage.style.transformOrigin = new StyleTransformOrigin(new TransformOrigin(new Length(px, LengthUnit.Pixel), new Length(py, LengthUnit.Pixel), 0));
            mapImage.style.rotate = new StyleRotate(new Rotate(new Angle(-yaw, AngleUnit.Degree)));
            arrow.style.rotate = new StyleRotate(new Rotate(new Angle(me.eulerAngles.y - yaw, AngleUnit.Degree)));
            float r = MapPx / 2 - 12;
            var nPos = ToMap(new Vector3(p.x, 0, p.z + 1e4f), p, yaw, scale, r, true);
            north.style.left = nPos.x - 10; north.style.top = nPos.y - 10;

            // dots: the police, and whatever else systems add
            blips.Clear();
            foreach (var src in Sources) { try { src(blips); } catch (Exception e) { Debug.LogException(e); } }
            int used = 0;
            foreach (var bl in blips)
            {
                var at = ToMap(bl.at, p, yaw, scale, r, bl.keepOnEdge);
                if (float.IsNaN(at.x)) continue;
                if (used == blipPool.Count)
                {
                    var e = El(blipLayer);
                    e.style.position = Position.Absolute;
                    Border(e, 1.5f, new Color(0, 0, 0, 0.7f));
                    blipPool.Add(e);
                }
                var d = blipPool[used++];
                float s = bl.size > 0 ? bl.size : 10;
                d.style.width = s; d.style.height = s; Round(d, s / 2);
                d.style.left = at.x - s / 2; d.style.top = at.y - s / 2;
                d.style.backgroundColor = bl.color;
                Show(d, true);
            }
            for (int i = used; i < blipPool.Count; i++) Show(blipPool[i], false);
        }

        /// <summary>A world point on the minimap (UI pixels inside it); NaN if off the map and not kept on the edge.</summary>
        static Vector2 ToMap(Vector3 world, Vector3 me, float yawDeg, float scale, float radius, bool keepOnEdge)
        {
            float a = yawDeg * Mathf.Deg2Rad;
            var f = new Vector2(Mathf.Sin(a), Mathf.Cos(a)); var right = new Vector2(Mathf.Cos(a), -Mathf.Sin(a));
            var d = new Vector2(world.x - me.x, world.z - me.z);
            var s = new Vector2(Vector2.Dot(d, right), -Vector2.Dot(d, f)) * scale;
            if (s.magnitude > radius)
            {
                if (!keepOnEdge) return new Vector2(float.NaN, float.NaN);
                s = s.normalized * radius;
            }
            return s + new Vector2(MapPx / 2, MapPx / 2);
        }
    }
}
