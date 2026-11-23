// Boats and aircraft, on John (the web game's way): walk up to one and press F to go aboard (John is out of sight
// at the helm, the camera follows the craft), F again to step off onto the nearest dry land (a boat) or beside it
// (an aircraft; high up you bail out). The controls:
//   a boat:        W throttle, S brake / astern, A/D steer
//   a plane:       W/S throttle lever, A/D bank and turn, Space nose up, Shift nose down, G gear, J flaps
//   a helicopter:  Space climb, Shift descend, W/S tilt forward/back, A/D turn
// The flight panel and the warnings (STALL, PULL UP, LOW FUEL, ENGINE OUT) are on the HUD (Hud.Craft*).
using Southbound.Core;
using UnityEngine;

namespace Southbound
{
    [RequireComponent(typeof(PlayerController))]
    public sealed class Piloting : MonoBehaviour
    {
        public static Piloting Instance { get; private set; }
        /// <summary>Aboard a boat or an aircraft?</summary>
        public static bool Active => Instance != null && Instance.Craft != null;

        public float reach = 4.2f;
        public ThirdPersonCamera cameraRig;
        public CraftBody Craft { get; private set; }
        public CraftBody Near { get; private set; }
        public string Prompt { get; private set; }

        PlayerController player; CharacterController cc; Gunplay gun; Driving driving;
        Renderer[] modelRenderers;
        float boardedAt;

        void Awake()
        {
            Instance = this;
            player = GetComponent<PlayerController>(); cc = GetComponent<CharacterController>(); gun = GetComponent<Gunplay>(); driving = GetComponent<Driving>();
            if (cameraRig == null && Camera.main != null) cameraRig = Camera.main.GetComponent<ThirdPersonCamera>();
        }

        System.Func<string> hudPrompt;
        void OnEnable() => Hud.Prompts.Add(hudPrompt = () => Prompt);
        void OnDisable() => Hud.Prompts.Remove(hudPrompt);

        void Update()
        {
            Prompt = null;
            if (Time.timeScale == 0 || StoreScreen.Showing) return;
            if (Craft == null)
            {
                Near = null;
                if (!player.enabled || (driving != null && driving.Car != null)) return;
                Near = Nearest(out float d);
                // a car's door nearer than the craft: that's the one F means
                if (Near != null && driving != null && driving.Near != null && (driving.Near.DoorPoint - transform.position).magnitude < d) Near = null;
                if (Near == null) return;
                Prompt = Near.Wrecked ? $"The {Near.DisplayName} is wrecked" : $"F  Board the {Near.DisplayName}";
                if (!Near.Wrecked && SbInput.InteractDown) Board(Near);
                return;
            }
            if (Craft.Wrecked) { GetOff(true); return; }
            Craft.Controls = new CraftInput
            {
                Throttle = SbInput.Throttle, Brake = SbInput.Brake, Steer = -SbInput.Steer,   // + turns left, as the model wants
                Up = SbInput.Handbrake, Down = SbInput.Nitro,
            };
            var air = Craft.Air;
            if (air != null)
            {
                if (SbInput.GearDown && air.ToggleGear()) Toast(air.GearDown ? "Gear down" : "Gear up");
                if (SbInput.FlapsDown && air.ToggleFlaps()) Toast(air.Flaps != 0 ? "Flaps down" : "Flaps up");
            }
            bool slow = Mathf.Abs(Craft.Speed) < 3f || (air != null && !air.Airborne && Mathf.Abs(Craft.Speed) < 6f);
            Prompt = air != null && air.Alt > 3 ? "F  Bail out" : slow ? "F  Get off" : null;
            if (SbInput.InteractDown && Time.time - boardedAt > 0.3f && (slow || (air != null && air.Alt > 3))) GetOff(false);
        }

        void Toast(string s) { var g = SouthboundGame.Instance; if (g != null) g.Toast(s, 1.2f); }

        CraftBody Nearest(out float best)
        {
            CraftBody b = null; best = float.MaxValue;
            foreach (var c in CraftBody.All)
            {
                if (c.Pilot != null) continue;
                float d = Vector3.Distance(c.transform.position, transform.position) - c.Radius * 0.8f;
                if (d < reach && d < best) { best = d; b = c; }
            }
            return b;
        }

        public void Board(CraftBody c)
        {
            if (c == null || Craft != null) return;
            Craft = c; c.Pilot = this; boardedAt = Time.time;
            player.enabled = false; cc.enabled = false;
            if (gun != null) gun.enabled = false;
            if (driving != null) driving.enabled = false;
            modelRenderers = player.model != null ? player.model.GetComponentsInChildren<Renderer>() : new Renderer[0];
            foreach (var r in modelRenderers) r.enabled = false;
            // aboard: John rides along at the helm (so everything that asks where you are finds the craft)
            transform.SetParent(c.transform, false);
            transform.localPosition = new Vector3(0, c.IsBoat ? 0.8f : 1.2f, 0); transform.localRotation = Quaternion.identity;
            if (cameraRig != null) cameraRig.craft = c;
            var g = SouthboundGame.Instance;
            if (g != null) g.Toast(c.DisplayName + (c.IsAir ? (c.Heli ? "  ·  Space climb, Shift descend, W/S tilt, A/D turn" : "  ·  W/S throttle, A/D bank, Space nose up, Shift down, G gear, J flaps") : "  ·  W throttle, S astern, A/D steer"), 4f);
        }

        /// <summary>Where you'd step off: the nearest dry land from a boat, beside an aircraft (on the ground below, bailing out).</summary>
        public static Vector3 OffPoint(CraftBody c, out bool bail)
        {
            var ground = c.Ground;
            double x, z; bail = false;
            if (c.IsBoat)
            {
                var p = c.Boat.ExitPoint(ground);
                if (p is (double px, double pz)) { x = px; z = pz; }
                else { x = c.Boat.X + 2; z = c.Boat.Z; }   // nowhere dry within 80 m: into the water beside her
            }
            else { var e = c.Air.ExitPoint(); x = e.x; z = e.z; bail = e.bail; }
            var at = new Vector3(-(float)x, 0, (float)z);
            at.y = Pedestrians.Ground(at + Vector3.up * 600f, 1200f, (float)ground.Height(x, z)) + 0.1f;
            return at;
        }

        /// <summary>Off the boat or aircraft: onto dry land, beside it, or (high up) bailing out.</summary>
        public void GetOff(bool hard)
        {
            var c = Craft;
            if (c == null) return;
            c.Pilot = null; c.Controls = default;
            Craft = null;
            transform.SetParent(null, true);
            var at = OffPoint(c, out bool bail);
            transform.SetPositionAndRotation(at, Quaternion.Euler(0, c.transform.eulerAngles.y, 0));
            cc.enabled = true; player.enabled = true;
            if (gun != null) gun.enabled = true;
            if (driving != null) driving.enabled = true;
            if (modelRenderers != null) foreach (var r in modelRenderers) if (r != null) r.enabled = true;
            if (cameraRig != null) cameraRig.craft = null;
            var g = SouthboundGame.Instance;
            if (g != null && bail) g.Toast("You bailed out", 2f);
            else if (g != null && hard) g.Toast($"The {c.DisplayName} is wrecked", 2f);
        }
    }
}
