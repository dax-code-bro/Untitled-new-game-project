// Driving a car. The body is a Rigidbody that rides on four raycast springs (one per wheel), so it
// pitches under braking, rolls in corners, settles over kerbs and is pushed about by collisions.
// Speed, steering, grip and drift come from the web game's own driving equations (Core/DriveModel,
// checked step for step against the browser): each physics step reads the body's forward and
// sideways speed, runs the model, and gives the body its new speed and yaw rate. In the air the
// physics alone carries it.
//
// Unity car space: forward +z, up +y, the driver's side -x (the web game's car space with x mirrored).
using System.Collections.Generic;
using Southbound.Core;
using UnityEngine;

namespace Southbound
{
    [RequireComponent(typeof(Rigidbody))]
    [DisallowMultipleComponent]
    public sealed class CarController : MonoBehaviour
    {
        public static readonly List<CarController> All = new List<CarController>();

        [Header("From the catalogue (set by the car factory)")]
        public string carId = "sedan";
        public string displayName = "Sedan";
        [Tooltip("m/s per second of push, top speed (m/s), sideways grip (per second).")]
        public float accel = 9, topSpeed = 50, grip = 7.5f, brakeK = 1;
        [Tooltip("Front and rear axle along the car (m, +z forward).")]
        public float axleFront = 1.4f, axleRear = -1.4f;
        public float wheelRadius = 0.33f, length = 4.8f, width = 1.9f, roof = 1.45f, rideHeight = 0.18f;
        public bool hasSiren, isTaxi;

        [Header("Parts")]
        [Tooltip("Front-left, front-right, rear-left, rear-right wheel pivots (at the axle, rest height).")]
        public Transform[] wheels = new Transform[4];
        public Transform seat, door;

        [Header("Suspension")]
        public float travel = 0.2f;
        [Tooltip("Fraction of critical damping.")]
        public float dampingRatio = 0.38f;

        /// <summary>Whoever is driving (null: parked). Set by Driving.</summary>
        public Driving Driver { get; set; }
        /// <summary>The controls this physics step (the player's, or an AI driver's later).</summary>
        public DriveInput Controls;
        public DriveModel Model { get; } = new DriveModel();
        public DriveTuning Tuning { get; private set; }
        public float SpeedMph => (float)Model.Mph;
        public float ForwardSpeed => (float)Model.Forward;
        public int WheelsOnGround { get; private set; }

        Rigidbody rb;
        CarBody body;
        Vector3[] mounts = new Vector3[4];
        readonly float[] compression = new float[4], lastCompression = new float[4];
        readonly bool[] contact = new bool[4];
        float spin, still;
        readonly RaycastHit[] hits = new RaycastHit[8];
        bool lightsOverride, lightsOn;

        void Awake()
        {
            rb = GetComponent<Rigidbody>();
            body = GetComponent<CarBody>();
            Tuning = new DriveTuning { Accel = accel, Top = topSpeed, Grip = grip, BrakeK = brakeK, Wf = axleFront, Wr = axleRear };
            for (int i = 0; i < 4; i++) mounts[i] = wheels[i] != null ? wheels[i].localPosition : Vector3.zero;
            rb.interpolation = RigidbodyInterpolation.Interpolate;
            rb.collisionDetectionMode = CollisionDetectionMode.ContinuousDynamic;
            rb.centerOfMass = new Vector3(0, rideHeight + 0.22f, (axleFront + axleRear) * 0.5f);
            SetAngularDamping(rb, 1.5f);
        }

        void OnEnable() => All.Add(this);
        void OnDisable() => All.Remove(this);

        /// <summary>The driver's door outside the car, in the world.</summary>
        public Vector3 DoorPoint => door != null ? door.position : transform.TransformPoint(new Vector3(-(width / 2 + 0.55f), 0, 0));

        void FixedUpdate()
        {
            float dt = Time.fixedDeltaTime;
            bool driven = Driver != null;
            if (!driven)
            {
                // parked: brakes on; let the body sleep once it has settled (a bump wakes it)
                Controls = new DriveInput { Handbrake = true };
                if (rb.IsSleeping()) return;
                if (Vel(rb).sqrMagnitude < 0.0025f && rb.angularVelocity.sqrMagnitude < 0.0025f) { if ((still += dt) > 1.5f) { rb.Sleep(); return; } }
                else still = 0;
            }
            else still = 0;

            // springs: a ray down through each wheel from the top of its travel
            Vector3 up = transform.up;
            float k = rb.mass * -Physics.gravity.y / 4 / (travel * 0.5f); // half-compressed at rest: k * travel/2 = m g / 4
            float c = dampingRatio * 2 * Mathf.Sqrt(k * rb.mass / 4);
            int onGround = 0;
            for (int i = 0; i < 4; i++)
            {
                Vector3 origin = transform.TransformPoint(mounts[i] + Vector3.up * (travel * 0.5f));
                float reach = wheelRadius + travel;
                contact[i] = Cast(origin, -up, reach, out var hit);
                lastCompression[i] = compression[i];
                if (!contact[i]) { compression[i] = 0; continue; }
                onGround++;
                compression[i] = Mathf.Clamp(reach - hit.distance, 0, travel);
                float speed = (compression[i] - lastCompression[i]) / dt;
                float f = k * compression[i] + c * speed;
                if (compression[i] >= travel) f += rb.mass * 6f; // bump stop
                if (f > 0) rb.AddForceAtPosition(up * f, origin);
            }
            WheelsOnGround = onGround;

            if (onGround >= 2)
            {
                Vector3 fwd = transform.forward, left = -transform.right;
                Vector3 v = Vel(rb);
                Model.Forward = Vector3.Dot(v, fwd);
                Model.Sideways = Vector3.Dot(v, left);
                double dHeading = Model.Step(Tuning, Controls, dt);
                float vUp = Vector3.Dot(v, up);
                // only part of the grip with two wheels down (on a kerb, a two-wheel moment)
                float g = onGround / 4f;
                Vector3 want = fwd * (float)Model.Forward + left * (float)Model.Sideways + up * vUp;
                SetVel(rb, Vector3.Lerp(v, want, g));
                Vector3 av = rb.angularVelocity;
                float yaw = Vector3.Dot(av, up);
                // web heading turns left for +; Unity's yaw turns right for +
                float wantYaw = -(float)(dHeading / dt);
                rb.angularVelocity = av + up * ((wantYaw - yaw) * g);
            }
            if (body != null) body.Brake = (float)((Model.Braking && driven) || (driven && Controls.Brake > 0 && Model.Forward > 0.5) ? 1 : 0);
        }

        bool Cast(Vector3 origin, Vector3 dir, float reach, out RaycastHit best)
        {
            int n = Physics.RaycastNonAlloc(origin, dir, hits, reach, ~0, QueryTriggerInteraction.Ignore);
            best = default; float bd = float.MaxValue; bool found = false;
            for (int i = 0; i < n; i++)
            {
                if (hits[i].rigidbody == rb || hits[i].collider.transform.IsChildOf(transform)) continue;
                if (Driver != null && hits[i].collider.transform.IsChildOf(Driver.transform)) continue;
                if (hits[i].distance < bd) { bd = hits[i].distance; best = hits[i]; found = true; }
            }
            return found;
        }

        void Update()
        {
            // wheels: suspension travel, rolling, steering
            spin = (spin + (float)Model.Forward / Mathf.Max(0.1f, wheelRadius) * Time.deltaTime * Mathf.Rad2Deg) % 360f;
            float steer = -(float)Model.Steer * Mathf.Rad2Deg;
            for (int i = 0; i < 4; i++)
            {
                var w = wheels[i];
                if (w == null) continue;
                float drop = contact[i] ? (travel * 0.5f - compression[i]) : travel * 0.5f;
                w.localPosition = mounts[i] + Vector3.down * drop;
                bool front = i < 2, right = (i & 1) == 1;
                float yaw = (front ? steer : 0) + (right ? 180 : 0);
                w.localRotation = Quaternion.Euler(0, yaw, 0) * Quaternion.Euler(right ? -spin : spin, 0, 0);
            }
            if (body != null)
            {
                bool night = false;
                var game = SouthboundGame.Instance;
                if (game != null) { double h = game.Profile.Hour; night = h < 6.8 || h > 18.6; }
                if (Driver != null)
                {
                    if (SbInput.LightsDown) { lightsOn = !body.HeadlightsOn; lightsOverride = true; }
                    if (SbInput.SirenDown && hasSiren) body.Siren = !body.Siren;
                    body.HornSound(SbInput.Horn);
                    float rev = Mathf.Clamp01(Mathf.Abs((float)Model.Forward) / Mathf.Max(1, topSpeed)), load = (float)Controls.Throttle;
                    // a few gears: the note climbs, drops at each shift, climbs again
                    float gear = Mathf.Repeat(rev * 4.2f, 1f) * 0.55f + rev * 0.45f;
                    body.EngineSound(true, gear, load);
                }
                else { body.EngineSound(false, 0, 0); body.HornSound(false); }
                body.HeadlightsOn = lightsOverride ? lightsOn : (night && Driver != null) || (night && isTaxi);
            }
        }

        /// <summary>The player's controls into the model's (Driving calls this every frame while seated).</summary>
        public void ReadPlayerInput()
        {
            Controls = new DriveInput
            {
                Throttle = SbInput.Throttle, Brake = SbInput.Brake,
                Steer = -SbInput.Steer, // the model steers left for +
                Handbrake = SbInput.Handbrake, Nitro = SbInput.Nitro,
            };
            if (rb != null && rb.IsSleeping()) rb.WakeUp();
        }

        /// <summary>Back on its wheels (after a roll), facing the way it was.</summary>
        public void Right()
        {
            var e = transform.eulerAngles;
            transform.SetPositionAndRotation(transform.position + Vector3.up * 1.2f, Quaternion.Euler(0, e.y, 0));
            SetVel(rb, Vector3.zero); rb.angularVelocity = Vector3.zero;
            Model.Forward = Model.Sideways = 0;
        }

        public bool Upside => Vector3.Dot(transform.up, Vector3.up) < 0.2f;

        // Rigidbody's names changed in Unity 6 (linearVelocity, angularDamping)
        static Vector3 Vel(Rigidbody b)
        {
#if UNITY_6000_0_OR_NEWER
            return b.linearVelocity;
#else
            return b.velocity;
#endif
        }
        static void SetVel(Rigidbody b, Vector3 v)
        {
#if UNITY_6000_0_OR_NEWER
            b.linearVelocity = v;
#else
            b.velocity = v;
#endif
        }
        static void SetAngularDamping(Rigidbody b, float d)
        {
#if UNITY_6000_0_OR_NEWER
            b.angularDamping = d;
#else
            b.angularDrag = d;
#endif
        }
    }
}
