// Calvera's walk-in shops (their buildings come with the street, StreetBuilder): a keeper behind each
// counter while it's open (the web game's people, idling, turning to face you as you come in), "F  talk to
// ..." at the counter, and the store screen (StoreScreen): guns and ammunition at the gun stores, food and
// drink at the Gulf Marts. A Gulf Mart has a fuel pump out front (CarHealth.Pumps). The shops, the police
// station and the hospital are on the minimap. Clothing stores are there to walk into; buying clothes waits
// for the wardrobe (the outfits aren't in the Unity version yet).
using System;
using System.Collections.Generic;
using Southbound.Core;
using UnityEngine;

namespace Southbound
{
    public sealed class Shops : MonoBehaviour
    {
        [Serializable]
        public sealed class Shop
        {
            public string id, kind, name, keeper, blurb, look, hours;
            public float priceK = 1;
            public string[] lines;
            public Vector3 keeperAt, counter, door;
            public float keeperYaw;
            [NonSerialized] public GameObject person;
            [NonSerialized] public Health hp;
        }

        public Shop[] shops = new Shop[0];
        [Tooltip("The townspeople models (people/mh_*.glb) by name, for the keepers, and the animation skeleton.")]
        public GameObject[] people;
        public string[] peopleNames;
        public GameObject skeleton;
        public float serveDistance = 2.3f, showKeepers = 90f;

        public static Shops Instance { get; private set; }
        /// <summary>What to press here (for the HUD), or null.</summary>
        public string Prompt { get; private set; }

        SouthboundGame game; Driving driving;

        void Awake() => Instance = this;
        void OnEnable() => Hud.Sources.Add(Blips);
        void OnDisable() => Hud.Sources.Remove(Blips);

        void Start()
        {
            game = SouthboundGame.Instance != null ? SouthboundGame.Instance : FindAnyObjectByType<SouthboundGame>();
            driving = game != null && game.driving != null ? game.driving : FindAnyObjectByType<Driving>();
            foreach (var s in shops)
                if (s.kind == "mart")
                {
                    // the pump stands out on the forecourt, 11 m in front of the counter
                    var front = s.door - s.keeperAt; front.y = 0;
                    var p = s.counter + front.normalized * 11f;
                    p.y = Pedestrians.Ground(p + Vector3.up * 30f, 60f, s.counter.y);
                    CarHealth.Pumps.Add(p);
                }
        }

        /// <summary>The first building whose id or kind contains this (the police station, the hospital).</summary>
        public Shop Find(string what)
        {
            foreach (var s in shops) if ((s.id ?? "").Contains(what) || (s.kind ?? "").Contains(what)) return s;
            return null;
        }

        void Update()
        {
            Prompt = null;
            if (game == null || game.player == null || StoreScreen.Showing) return;
            var me = game.player.transform.position;
            bool onFoot = driving == null || driving.Car == null;
            double hour = game.Profile.Hour;
            foreach (var s in shops)
            {
                if (!s.Sells()) continue;
                bool open = ShopCatalog.Open(s.id, hour);
                float d = Vector3.Distance(me, s.keeperAt);
                // the keeper: there while it's open and you're near enough to see
                bool show = open && d < showKeepers && (s.hp == null || !s.hp.Dead || d < 30f);
                if (show && s.person == null) s.person = Keeper(s);
                if (s.person != null && s.person.activeSelf != show) s.person.SetActive(show);
                if (s.person != null && show && d < 8f && (s.hp == null || !s.hp.Dead))
                {
                    var t = s.person.transform;
                    var want = me - t.position; want.y = 0;
                    if (want.sqrMagnitude > 0.01f) t.rotation = Quaternion.Slerp(t.rotation, Quaternion.LookRotation(want), Mathf.Clamp01(Time.deltaTime * 3));
                }
                // at the counter
                if (!onFoot || Vector3.Distance(new Vector3(me.x, 0, me.z), new Vector3(s.counter.x, 0, s.counter.z)) > serveDistance || Mathf.Abs(me.y - s.counter.y) > 2f) continue;
                if (s.hp != null && s.hp.Dead) { Prompt = "Nobody's serving."; continue; }
                Prompt = $"F  talk to {s.keeper}";
                if (SbInput.InteractDown)
                {
                    if (!open) game.Toast(ShopCatalog.ClosedText(s.name, s.id), 3f);
                    else StoreScreen.Show(s);
                }
            }
        }

        GameObject Keeper(Shop s)
        {
            GameObject model = null;
            if (people != null)
                for (int i = 0; i < people.Length; i++)
                    if (peopleNames != null && i < peopleNames.Length && peopleNames[i] == s.look) { model = people[i]; break; }
            if (model == null && people != null && people.Length > 0) model = people[Mathf.Abs((s.id ?? "").GetHashCode()) % people.Length];
            if (model == null || skeleton == null) return null;
            var root = new GameObject($"{s.keeper} ({s.name})");
            root.transform.SetParent(transform, false);
            root.transform.SetPositionAndRotation(s.keeperAt, Quaternion.Euler(0, s.keeperYaw, 0));
            var m = Instantiate(model, root.transform);
            var sk = Instantiate(skeleton, root.transform);
            var rt = root.AddComponent<Retargeter>();
            rt.sourceRoot = sk.transform; rt.targetRoot = m.transform; rt.startClip = "Idle_Loop";
            var cap = root.AddComponent<CapsuleCollider>();
            cap.center = new Vector3(0, 0.9f, 0); cap.height = 1.8f; cap.radius = 0.28f;
            s.hp = root.AddComponent<Health>();
            s.hp.role = "civilian"; s.hp.feet = 0; s.hp.headHeight = 1.55f;
            return root;
        }

        void Blips(List<Hud.Blip> into)
        {
            foreach (var s in shops)
            {
                Color c;
                switch (s.kind)
                {
                    case "guns": c = new Color(0.85f, 0.7f, 0.42f); break;
                    case "mart": c = new Color(0.96f, 0.77f, 0.19f); break;
                    case "clothes": c = new Color(0.62f, 0.77f, 0.75f); break;
                    default:
                        if (s.id == "precinct" || s.id == "sheriff") c = new Color(0.3f, 0.5f, 1f);
                        else if (s.id == "hospital" || s.id == "clinic") c = new Color(1f, 0.35f, 0.35f);
                        else c = new Color(0.75f, 0.75f, 0.75f);
                        break;
                }
                into.Add(new Hud.Blip { at = s.door, color = c, size = 8 });
            }
        }
    }

    public static class ShopExtensions
    {
        public static bool Sells(this Shops.Shop s) => s.kind == "guns" || s.kind == "mart" || s.kind == "clothes";
    }
}
