// Townspeople on Calvera's pavements: a pool of the web game's MakeHuman people (retargeted from the same
// animation library John uses) walking the town's sidewalks (Core/Sidewalks) around the player, a few
// stopped in pairs to talk, fewer at night. Walkers too far away are moved to a pavement nearer the
// player, out of sight range. They keep to the ground by a raycast onto whatever's there (pavement slabs,
// kerbs, terrain). They can be shot (a capsule and Health, the wound model's hit zones), they run from
// gunfire or crouch where they are, a car driven into them at speed knocks them down dead, and the dead
// lie where they fell until you're well away. Every death is reported to the law (Police).
using System.Collections.Generic;
using UnityEngine;

namespace Southbound
{
    public sealed class Pedestrians : MonoBehaviour
    {
        [Tooltip("The townspeople models (Art/Models/people/mh_*.glb).")]
        public GameObject[] people;
        [Tooltip("The animation skeleton (Art/Models/anims/ual.glb, imported with Legacy animation).")]
        public GameObject skeleton;
        [Tooltip("How many walk about by day (fewer at night).")]
        public int count = 40;
        public float nearest = 25f, farthest = 110f, recycle = 140f;
        // the pavements, flattened (Unity space): path k runs from pointStart[k] to pointStart[k + 1] - 1
        [HideInInspector] public int[] pointStart;
        [HideInInspector] public float[] points;   // x, z pairs
        [HideInInspector] public float[] pathLength;

        enum Mode { Walk, Talk, Flee, Cower, Dead }
        sealed class Walker { public GameObject go; public Retargeter rt; public Health hp; public int path; public float s, dir, speed; public bool talking; public float y; public Mode mode; public float timer; public Vector3 threat; }
        readonly List<Walker> walkers = new List<Walker>();
        /// <summary>Where the townspeople are this frame (for traffic to stop for them).</summary>
        public static readonly List<Vector3> Positions = new List<Vector3>();
        float[] cum;   // cumulative distance at each point

        void Start()
        {
            if (people == null || people.Length == 0 || skeleton == null || pointStart == null || pointStart.Length < 2) { enabled = false; return; }
            cum = new float[points.Length / 2];
            for (int k = 0; k + 1 < pointStart.Length; k++)
            {
                float acc = 0;
                for (int i = pointStart[k]; i < pointStart[k + 1]; i++)
                {
                    if (i > pointStart[k]) acc += Vector2.Distance(P(i - 1), P(i));
                    cum[i] = acc;
                }
            }
            for (int i = 0; i < count; i++)
            {
                var root = new GameObject("pedestrian");
                root.transform.SetParent(transform, false);
                var model = Instantiate(people[i % people.Length], root.transform);
                var skel = Instantiate(skeleton, root.transform);
                var rt = root.AddComponent<Retargeter>();
                rt.sourceRoot = skel.transform; rt.targetRoot = model.transform;
                // shootable: a body-sized capsule, and the wound model
                var cap = root.AddComponent<CapsuleCollider>();
                cap.center = new Vector3(0, 0.9f, 0); cap.height = 1.8f; cap.radius = 0.28f;
                var hp = root.AddComponent<Health>();
                hp.role = "civilian"; hp.feet = 0; hp.headHeight = 1.55f;
                var w = new Walker { go = root, rt = rt, hp = hp };
                walkers.Add(w);
                Place(w, true);
            }
        }

        void OnEnable() => Gunplay.Fired += OnShot;
        void OnDisable() => Gunplay.Fired -= OnShot;

        /// <summary>A gunshot: everyone in earshot runs from it, or crouches where they are.</summary>
        void OnShot(Vector3 at, bool silenced) => Panic(at, silenced ? 14f : 60f);

        public void Panic(Vector3 at, float radius)
        {
            foreach (var w in walkers)
            {
                if (!w.go.activeSelf || w.mode == Mode.Dead) continue;
                if ((w.go.transform.position - at).sqrMagnitude > radius * radius) continue;
                w.mode = Random.value < 0.25f ? Mode.Cower : Mode.Flee;
                w.timer = Random.Range(9f, 15f);
                w.threat = at;
                w.talking = false;
            }
        }

        Driving driving; bool lookedForDriver;

        Vector2 P(int i) => new Vector2(points[i * 2], points[i * 2 + 1]);
        int Paths => pointStart.Length - 1;

        /// <summary>Somewhere on a pavement between `nearest` and `farthest` from the camera (anywhere in range at the start).</summary>
        void Place(Walker w, bool start)
        {
            var cam = Camera.main != null ? Camera.main.transform.position : transform.position;
            var c2 = new Vector2(cam.x, cam.z);
            for (int attempt = 0; attempt < 60; attempt++)
            {
                int k = Random.Range(0, Paths);
                int a = pointStart[k], b = pointStart[k + 1] - 1;
                if (b <= a) continue;
                int i = Random.Range(a, b + 1);
                float d = Vector2.Distance(P(i), c2);
                if (d > farthest || (!start && d < nearest)) continue;
                w.path = k; w.s = cum[i]; w.dir = Random.value < 0.5f ? 1 : -1;
                w.talking = Random.value < 0.15f;
                w.speed = w.talking ? 0 : Random.Range(1.15f, 1.6f);
                w.mode = w.talking ? Mode.Talk : Mode.Walk; w.timer = 0;
                if (w.hp != null) { w.hp.hp = 100; w.hp.lastPart = null; }
                w.rt?.Revive();
                w.y = float.NaN;
                w.go.SetActive(true);
                Pose(w, 0);
                return;
            }
            w.go.SetActive(false);
        }

        void Update()
        {
            if (cum == null) return;
            var cam = Camera.main != null ? Camera.main.transform.position : transform.position;
            int active = Mathf.RoundToInt(count * (1 - 0.65f * DayNight.Night) * PerformanceTier.Budget.CrowdScale);
            Positions.Clear();
            foreach (var w0 in walkers) if (w0.go.activeSelf && w0.mode != Mode.Dead) Positions.Add(w0.go.transform.position);
            if (!lookedForDriver) { driving = FindAnyObjectByType<Driving>(); lookedForDriver = true; }
            var car = driving != null ? driving.Car : null;
            float dt = Time.deltaTime;
            for (int n = 0; n < walkers.Count; n++)
            {
                var w = walkers[n];
                bool want = n < active;
                if (!want) { if (w.go.activeSelf) w.go.SetActive(false); continue; }
                if (!w.go.activeSelf) { Place(w, false); continue; }
                var p = w.go.transform.position;
                float far2 = (p.x - cam.x) * (p.x - cam.x) + (p.z - cam.z) * (p.z - cam.z);
                if (w.hp != null && w.hp.Dead && w.mode != Mode.Dead) { w.mode = Mode.Dead; w.timer = 45f; }
                if (w.mode == Mode.Dead)
                {
                    // the dead lie where they fell until you're well away (or a while has passed)
                    w.timer -= dt;
                    if (w.timer < 0 && far2 > 60 * 60 || far2 > recycle * recycle) Place(w, false);
                    continue;
                }
                // a car driven into them at speed
                if (car != null && Mathf.Abs(car.ForwardSpeed) > 4f)
                {
                    var local = car.transform.InverseTransformPoint(p + Vector3.up * 0.9f);
                    if (Mathf.Abs(local.x) < car.width / 2 + 0.3f && Mathf.Abs(local.z) < car.length / 2 + 0.3f && local.y > -0.5f && local.y < car.roof + 0.5f)
                    {
                        w.hp.Damage(1000);
                        w.go.transform.position += car.transform.forward * Mathf.Min(6f, Mathf.Abs(car.ForwardSpeed) * 0.3f);
                        continue;
                    }
                }
                float len = pathLength[w.path];
                if (w.mode == Mode.Flee || w.mode == Mode.Cower)
                {
                    w.timer -= dt;
                    if (w.timer <= 0) { w.mode = Mode.Walk; w.speed = Random.Range(1.15f, 1.6f); }
                    else if (w.mode == Mode.Flee)
                    {
                        // run whichever way along the pavement takes them away from it
                        var (ahead, _) = Sample(w.path, w.s + 2f);
                        var (behind, _) = Sample(w.path, w.s - 2f);
                        var t2 = new Vector2(w.threat.x, w.threat.z);
                        w.dir = (ahead - t2).sqrMagnitude >= (behind - t2).sqrMagnitude ? 1 : -1;
                        w.speed = 4.6f;
                    }
                    else w.speed = 0;
                }
                w.s += w.dir * w.speed * dt;
                if (w.s < 0 || w.s > len) { w.dir = -w.dir; w.s = Mathf.Clamp(w.s, 0, len); }   // the end of the pavement: turn round
                Pose(w, dt);
                if (far2 > recycle * recycle) Place(w, false);
            }
        }

        (Vector2 at, Vector2 dir) Sample(int path, float s)
        {
            int a = pointStart[path], b = pointStart[path + 1] - 1;
            s = Mathf.Clamp(s, 0, pathLength[path]);
            int i = a;
            while (i < b - 1 && cum[i + 1] < s) i++;
            var p0 = P(i); var p1 = P(Mathf.Min(b, i + 1));
            float seg = Mathf.Max(1e-4f, cum[Mathf.Min(b, i + 1)] - cum[i]);
            return (Vector2.Lerp(p0, p1, Mathf.Clamp01((s - cum[i]) / seg)), (p1 - p0).normalized);
        }

        /// <summary>The ground under a point: the nearest thing below that isn't a person or a moving car.</summary>
        public static float Ground(Vector3 from, float reach, float fallback)
        {
            float best = float.NaN, bestD = float.MaxValue;
            foreach (var h in Physics.RaycastAll(from, Vector3.down, reach, ~0, QueryTriggerInteraction.Ignore))
            {
                if (h.collider.attachedRigidbody != null || h.collider.GetComponentInParent<Health>() != null) continue;
                if (h.distance < bestD) { bestD = h.distance; best = h.point.y; }
            }
            return float.IsNaN(best) ? fallback : best;
        }

        void Pose(Walker w, float dt)
        {
            var (at, dir) = Sample(w.path, w.s);
            var fwd = dir * w.dir;
            // stand on whatever's under them
            float y = w.y;
            // (from just above their last footing, so an awning, a lamp arm or a car roof overhead isn't taken for the ground)
            float from = float.IsNaN(w.y) ? 400 : w.y + 1.6f, reach = float.IsNaN(w.y) ? 800 : 12;
            y = Ground(new Vector3(at.x, from, at.y), reach, float.IsNaN(w.y) ? 0 : w.y);
            w.y = float.IsNaN(w.y) || dt <= 0 ? y : Mathf.Lerp(w.y, y, Mathf.Clamp01(dt * 10));
            w.go.transform.position = new Vector3(at.x, w.y, at.y);
            bool still = w.mode == Mode.Talk || w.mode == Mode.Cower;
            if (fwd.sqrMagnitude > 1e-6f && !still) w.go.transform.rotation = Quaternion.Slerp(w.go.transform.rotation, Quaternion.LookRotation(new Vector3(fwd.x, 0, fwd.y)), dt <= 0 ? 1 : Mathf.Clamp01(dt * (w.mode == Mode.Flee ? 12 : 6)));
            if (w.rt != null && w.rt.Ready)
                switch (w.mode)
                {
                    case Mode.Talk: w.rt.Loop("Idle_Talking_Loop", 1); break;
                    case Mode.Cower: w.rt.Loop("Crouch_Idle_Loop", 1); break;
                    case Mode.Flee: w.rt.Loop("Sprint_Loop", w.speed / 6f); break;
                    default: w.rt.Loop("Walk_Loop", w.speed / 1.5f); break;
                }
        }
    }
}
