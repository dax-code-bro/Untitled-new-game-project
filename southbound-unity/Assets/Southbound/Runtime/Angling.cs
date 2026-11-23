// Fishing (the web game's fishing.js): with a rod and bait or a lure, face the water at the edge (2 to 12 m out, deep
// enough) and press F to cast, or press H on a boat that's stopped. The bobber sits on the water until a bite (it
// dips): strike (F, H or hold Shift) inside the moment, then hold F (H on a boat, or Shift) to reel and let go when the
// tension gets too high, or the line snaps. Walk off and the line's reeled in. What bites depends on the water (Core/
// Fishing): the catch is weighed, logged, kept on ice for the fish market (or released under the size limit), held up
// for a moment, and counted for the "catch fish" mission steps and the Commercial Fisherman's shifts.
using System.Collections.Generic;
using Southbound.Core;
using UnityEngine;

namespace Southbound
{
    public sealed class Angling : MonoBehaviour
    {
        [Tooltip("Fish models to hold up (big first), and the shark.")]
        public GameObject[] fishModels;
        public GameObject sharkModel;

        public static Angling Instance { get; private set; }
        public string Prompt { get; private set; }
        public string Panel { get; private set; }

        SouthboundGame game;
        FishingLine line;
        (double x, double z, float y) spot; bool fromBoat;
        Transform rod; LineRenderer cord; Transform bobber; float castT;
        GameObject trophy; float trophyT;
        readonly System.Random rnd = new System.Random();
        System.Func<string> hudPrompt, hudPanel;

        void Awake() { Instance = this; Missions.Extras["fish"] = () => Fleet.Instance != null && Fleet.Instance.Ready; }
        void OnEnable() { Hud.Prompts.Add(hudPrompt = () => Prompt); Hud.Panels.Add(hudPanel = () => Panel); }
        void OnDisable() { Hud.Prompts.Remove(hudPrompt); Hud.Panels.Remove(hudPanel); }

        void Start()
        {
            game = SouthboundGame.Instance;
            // the rod, the line and the bobber
            var r = GameObject.CreatePrimitive(PrimitiveType.Cylinder); r.name = "Fishing rod"; Destroy(r.GetComponent<Collider>());
            r.transform.localScale = new Vector3(0.025f, 1.1f, 0.025f);
            var pivot = new GameObject("Rod pivot").transform; r.transform.SetParent(pivot, false); r.transform.localPosition = new Vector3(0, 1.1f, 0);
            r.GetComponent<MeshRenderer>().sharedMaterial = CraftBody.Paint((0.08f, 0.08f, 0.08f, 0.4f, 0.4f));
            rod = pivot;
            var b = GameObject.CreatePrimitive(PrimitiveType.Sphere); b.name = "Bobber"; Destroy(b.GetComponent<Collider>());
            b.transform.localScale = Vector3.one * 0.12f; b.GetComponent<MeshRenderer>().sharedMaterial = CraftBody.Paint((1f, 0.19f, 0.13f, 0.4f, 0f));
            bobber = b.transform;
            cord = new GameObject("Fishing line").AddComponent<LineRenderer>();
            cord.positionCount = 11; cord.widthMultiplier = 0.006f; cord.useWorldSpace = true;
            var sh = Shader.Find("HDRP/Unlit") ?? Shader.Find("Unlit/Color") ?? Shader.Find("Sprites/Default");
            cord.sharedMaterial = new Material(sh) { color = new Color(0.93f, 0.93f, 0.93f) };
            if (cord.sharedMaterial.HasProperty("_UnlitColor")) cord.sharedMaterial.SetColor("_UnlitColor", new Color(0.93f, 0.93f, 0.93f));
            Show(false);
        }

        void Show(bool on) { if (rod != null) rod.gameObject.SetActive(on); if (bobber != null) bobber.gameObject.SetActive(on); if (cord != null) cord.enabled = on; }

        void Stop(string msg) { line = null; Show(false); if (msg != null && game != null) game.Toast(msg, 1.8f); }

        void Update()
        {
            Prompt = null; Panel = null;
            if (game == null) game = SouthboundGame.Instance;
            var fleet = Fleet.Instance;
            if (game == null || game.player == null || fleet == null || !fleet.Ready || Time.timeScale == 0 || StoreScreen.Showing) return;
            float dt = Time.deltaTime;
            Trophy(dt);
            var p = game.Profile;
            var craft = Piloting.Instance != null ? Piloting.Instance.Craft : null;
            bool onBoat = craft != null && craft.IsBoat && Mathf.Abs(craft.Speed) < 0.6f;
            bool onFoot = game.player.enabled;
            if (line == null && !onFoot && !onBoat) return;
            double rodTier = Tools.Best(p.Tools, "rod");
            var g = Fleet.Ground; var L = fleet.Layout;
            if (line == null)
            {
                if (!WaterSpot(onBoat ? craft : null, out spot)) return;
                fromBoat = onBoat;
                string kind = Fishing.WaterKind(spot.x, spot.z, L, g);
                if (rodTier <= 0) { if (!onBoat) Prompt = "Buy a fishing rod at a bait & tackle counter (the marinas) to fish here"; return; }
                bool lure = Tools.Best(p.Tools, "lure") > 0;
                if (p.BaitCount <= 0 && !lure) { Prompt = "You need bait or a lure (bait & tackle at the marinas)"; return; }
                bool press = onBoat ? SbInput.LetterDown('H') : SbInput.InteractDown;
                if (press)
                {
                    if (!lure) p.BaitCount--;
                    var wc = FindAnyObjectByType<WeatherController>();
                    string wx = wc != null ? wc.Model.Name : "cloudy"; double rain = wc != null ? wc.Model.Rain : 0;
                    line = new FishingLine(kind, rodTier, Tools.Best(p.Tools, "finder") > 0, Fishing.BiteMul(p.Hour, rain, wx, kind, p.Stat("fishCaught")), p.Hour, FishStore.LegendsCaught(p), rnd);
                    castT = onBoat ? 0 : 0.85f;
                    Show(true);
                    return;
                }
                Prompt = onBoat ? $"H  cast a line ({kind})" : $"F  cast a line ({kind} fishing)";
                return;
            }
            // walked off, or the boat moved: reel in
            if ((onFoot && game.player.Speed > 1f) || (fromBoat && !onBoat)) { Stop("Line reeled in"); return; }
            bool strike = fromBoat ? SbInput.LetterDown('H') : SbInput.InteractDown;
            bool held = SbInput.Sprint || SbInput.Nitro || (fromBoat ? SbInput.Horn : SbInput.InteractHeld);
            var before = line.State;
            line.Update(dt, strike, held);
            Pose(dt);
            switch (line.State)
            {
                case FishingLine.Phase.Wait: Panel = "Waiting for a bite…"; break;
                case FishingLine.Phase.Bite: Panel = "FISH ON! Strike now: " + (fromBoat ? "H" : "F"); break;
                case FishingLine.Phase.Reel:
                    if (before == FishingLine.Phase.Bite && line.Fish.Legend != null) game.Toast("Something enormous has the bait…", 2.4f);
                    Panel = line.Gauges; break;
                case FishingLine.Phase.GotAway: Stop("It got away"); break;
                case FishingLine.Phase.Snapped: Stop("The line snapped!"); break;
                case FishingLine.Phase.Caught:
                    {
                        var f = line.Fish;
                        string how = FishStore.Land(p, f, p.Day);
                        if (how == "released") Hud.Big("RELEASED", $"{f.Name} · {f.Lb:0.0} lb is under the size limit", 2.2f);
                        else { Hud.Big(how == "legend" ? "LEGENDARY CATCH" : how == "record" ? "NEW RECORD!" : "CAUGHT!", $"{f.Name} · {f.Lb:0.0} lb", how == "legend" ? 4f : 2.5f); HoldUp(f); }
                        Stop(null);
                        game.Save();
                        break;
                    }
            }
        }

        /// <summary>Fishable water: on foot, 2..12 m ahead and deep enough; from a boat, off the side.</summary>
        bool WaterSpot(CraftBody boat, out (double x, double z, float y) at)
        {
            var g = Fleet.Ground; at = default;
            if (boat != null)
            {
                var (bx, bz) = boat.WebPos; double h = boat.Boat.Heading + 1.4;
                at = (bx + System.Math.Sin(h) * 6, bz + System.Math.Cos(h) * 6, (float)g.WaterLevel(bx, bz));
                return true;
            }
            var t = game.player.transform;
            double px = -t.position.x, pz = t.position.z, fx = -t.forward.x, fz = t.forward.z;
            double len = System.Math.Sqrt(fx * fx + fz * fz); if (len < 1e-4) return false; fx /= len; fz /= len;
            for (int d = 2; d <= 12; d++)
            {
                double x = px + fx * d, z = pz + fz * d;
                if (g.WaterLevel(x, z) - g.HeightAt(x, z) > 0.8) { at = (x, z, (float)g.WaterLevel(x, z)); return true; }
            }
            return false;
        }

        /// <summary>The rod in front of you (bowing as the line comes tight), the bobber on the water, the line sagging between.</summary>
        void Pose(float dt)
        {
            var t = fromBoat && Piloting.Instance.Craft != null ? Piloting.Instance.Craft.transform : game.player.transform;
            var fwd = t.forward; fwd.y = 0; fwd.Normalize();
            float bend = line.State == FishingLine.Phase.Reel ? Mathf.Min(1, (float)line.Tension) * 0.55f : line.State == FishingLine.Phase.Bite ? 0.25f : 0;
            float castA = 0;
            if (castT > 0)
            {
                float k = 1 - castT / 0.85f; castA = k < 0.4f ? 1.7f * (k / 0.4f) : 1.7f * (1 - (k - 0.4f) / 0.6f);
                castT -= dt;
            }
            rod.position = t.position + fwd * 0.4f + Vector3.up * 1.0f;
            // up and out over the water, lower as it bows to the fish; the cast swings it back over the shoulder first
            rod.rotation = Quaternion.LookRotation(fwd) * Quaternion.Euler(50f + bend * 35f - castA * 55f, 0, 0);
            var tip = rod.position + rod.up * 2.2f * (1 - bend * 0.12f);
            var home = new Vector3(-(float)spot.x, spot.y, (float)spot.z);
            Vector3 bob = home;
            if (line.State == FishingLine.Phase.Reel)
            {
                // a hooked fish runs left and right and comes in as you reel
                float T = Time.time, run = Mathf.Sin(T * 0.9f * (1 + (float)line.Fish.Fight * 0.2f)) * Mathf.Min(2.2f, 0.6f + (float)line.Fish.Fight * 0.5f) * (1 - (float)line.Progress);
                var d = home - tip; d.y = 0; var side = new Vector3(-d.z, 0, d.x).normalized;
                bob = tip + d * (1 - (float)line.Progress * 0.75f) + side * run; bob.y = spot.y;
            }
            float dip = line.State == FishingLine.Phase.Bite ? Mathf.Sin(Time.time * 30) * 0.06f - 0.05f : line.State == FishingLine.Phase.Reel ? Mathf.Sin(Time.time * 20) * 0.04f - 0.04f : Mathf.Sin(Time.time * 3) * 0.015f;
            bob.y = spot.y + 0.03f + dip;
            bobber.position = bob;
            bobber.gameObject.SetActive(castT <= 0.12f);
            float sag = line.State == FishingLine.Phase.Reel ? 0.25f * (1 - Mathf.Min(1, (float)line.Tension)) : 0.6f;
            float dist = Vector3.Distance(tip, bob);
            for (int i = 0; i <= 10; i++) { float k = i / 10f; var q = Vector3.Lerp(tip, bob, k); q.y -= Mathf.Sin(k * Mathf.PI) * sag * dist * 0.12f; cord.SetPosition(i, q); }
        }

        void HoldUp(Fishing.Hooked f)
        {
            if (trophy != null) Destroy(trophy);
            GameObject model = f.Name.Contains("shark") && sharkModel != null ? sharkModel : fishModels != null && fishModels.Length > 0 ? fishModels[f.Lb > 8 ? 0 : 1 + rnd.Next(System.Math.Max(1, fishModels.Length - 1)) % fishModels.Length] : null;
            if (model == null) return;
            trophy = Instantiate(model);
            foreach (var c in trophy.GetComponentsInChildren<Collider>()) Destroy(c);
            var b = new Bounds(trophy.transform.position, Vector3.zero);
            foreach (var r in trophy.GetComponentsInChildren<Renderer>()) b.Encapsulate(r.bounds);
            float want = Mathf.Min(1.6f, 0.25f + Mathf.Pow((float)f.Lb, 1f / 3f) * 0.22f), have = Mathf.Max(0.01f, Mathf.Max(b.size.x, b.size.y, b.size.z));
            trophy.transform.localScale *= want / have;
            trophyT = 3;
        }

        void Trophy(float dt)
        {
            if (trophy == null) return;
            trophyT -= dt;
            var t = game.player.transform;
            trophy.transform.position = t.position + t.forward * 0.6f + Vector3.up * 1.25f;
            trophy.transform.rotation = Quaternion.LookRotation(t.right) * Quaternion.Euler(0, 0, 90);
            if (trophyT <= 0) { Destroy(trophy); trophy = null; }
        }
    }
}
