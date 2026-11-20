// Cars driving Calvera's roads (Core/Lanes: right-hand lanes linked through the junctions): a pool of the
// catalogue's cars driven along their lanes round the player, at the road's speed, keeping their distance
// from the car ahead, braking for whatever stands in front of them (you, a parked car, a pedestrian), wheels
// turning, brake lights when they slow, headlights after dark. They're kinematic (moved, not simulated), so
// your car still bumps off them. Far-off cars are moved to a lane nearer you, out of sight range.
using System.Collections.Generic;
using UnityEngine;

namespace Southbound
{
    public sealed class Traffic : MonoBehaviour
    {
        [Tooltip("Car prefabs (Southbound > Cars) to fill the roads with.")]
        public GameObject[] cars;
        [Tooltip("Townspeople to drive them (Art/Models/people/mh_*.glb) and the animation skeleton.")]
        public GameObject[] drivers;
        public GameObject skeleton;
        public int count = 26;
        public float nearest = 60f, farthest = 220f, recycle = 260f;
        [HideInInspector] public int[] pointStart;
        [HideInInspector] public float[] points;      // x, z pairs (Unity space)
        [HideInInspector] public float[] laneLength, laneSpeed;
        [HideInInspector] public int[] nextStart, next; // lane k carries on into next[nextStart[k] .. nextStart[k + 1] - 1]

        sealed class Car { public GameObject go; public CarController cc; public CarBody body; public CarHealth health; public int lane; public float s, v, target, wheelAngle, y; }
        readonly List<Car> pool = new List<Car>();
        float[] cum;

        void Start()
        {
            if (cars == null || cars.Length == 0 || pointStart == null || pointStart.Length < 2) { enabled = false; return; }
            cum = new float[points.Length / 2];
            for (int k = 0; k + 1 < pointStart.Length; k++)
            {
                float acc = 0;
                for (int i = pointStart[k]; i < pointStart[k + 1]; i++) { if (i > pointStart[k]) acc += Vector2.Distance(P(i - 1), P(i)); cum[i] = acc; }
            }
            for (int i = 0; i < count; i++)
            {
                var prefab = cars[Random.Range(0, cars.Length)];
                if (prefab == null) continue;
                var go = Instantiate(prefab, transform);
                go.name = "traffic " + prefab.name;
                var rb = go.GetComponent<Rigidbody>();
                if (rb != null) { rb.isKinematic = true; rb.interpolation = RigidbodyInterpolation.None; }
                var cc = go.GetComponent<CarController>();
                if (cc != null) cc.enabled = false;
                var c = new Car { go = go, cc = cc, body = go.GetComponent<CarBody>(), health = CarHealth.Of(cc) };
                // someone at the wheel, behind the see-through glass
                if (cc != null && drivers != null && drivers.Length > 0 && skeleton != null && Seating.HasCabin(go.transform))
                {
                    var who = new GameObject("driver").transform;
                    var model = Instantiate(drivers[Random.Range(0, drivers.Length)], who);
                    var skel = Instantiate(skeleton, who);
                    var rt = who.gameObject.AddComponent<Retargeter>();
                    rt.sourceRoot = skel.transform; rt.targetRoot = model.transform; rt.startClip = "Driving_Loop";
                    Seating.Sit(who, cc, null);
                }
                pool.Add(c);
                Place(c, true);
            }
        }

        Vector2 P(int i) => new Vector2(points[i * 2], points[i * 2 + 1]);
        int Lanes => pointStart.Length - 1;

        // ------------------------------------------------------------------ the lane graph, for the police
        public bool Ready => cum != null;
        public int LaneCount => Lanes;

        /// <summary>The lane point nearest to p: which lane, and how far along it.</summary>
        public int NearestLane(Vector3 p, out float s)
        {
            var c = new Vector2(p.x, p.z);
            int best = 0; float bestD = float.MaxValue; s = 0;
            for (int k = 0; k < Lanes; k++)
                for (int i = pointStart[k]; i < pointStart[k + 1]; i++)
                {
                    float d = (P(i) - c).sqrMagnitude;
                    if (d < bestD) { bestD = d; best = k; s = cum[i]; }
                }
            return best;
        }

        /// <summary>A random place on a lane between min and max metres from p.</summary>
        public bool RandomPoint(Vector3 p, float min, float max, out int lane, out float s)
        {
            var c = new Vector2(p.x, p.z);
            for (int attempt = 0; attempt < 200; attempt++)
            {
                int k = Random.Range(0, Lanes);
                int a = pointStart[k], b = pointStart[k + 1] - 1;
                if (b <= a) continue;
                int i = Random.Range(a, b);
                float d = Vector2.Distance(P(i), c);
                if (d < min || d > max) continue;
                lane = k; s = cum[i];
                return true;
            }
            lane = 0; s = 0;
            return false;
        }

        void Place(Car c, bool start)
        {
            var cam = Camera.main != null ? Camera.main.transform.position : transform.position;
            var c2 = new Vector2(cam.x, cam.z);
            for (int attempt = 0; attempt < 80; attempt++)
            {
                int k = Random.Range(0, Lanes);
                int a = pointStart[k], b = pointStart[k + 1] - 1;
                if (b <= a) continue;
                int i = Random.Range(a, b);
                float d = Vector2.Distance(P(i), c2);
                if (d > farthest || (!start && d < nearest) || (start && d < 25)) continue;
                // not on top of another car
                bool clash = false;
                foreach (var o in pool) if (o != c && o.go.activeSelf && o.lane == k && Mathf.Abs(o.s - cum[i]) < 15) { clash = true; break; }
                if (clash) continue;
                c.lane = k; c.s = cum[i]; c.target = laneSpeed[k] * Random.Range(0.8f, 1.08f); c.v = c.target; c.y = float.NaN;
                if (c.health != null) c.health.Restore(Random.Range(0.35f, 0.95f));
                if (c.body != null && c.body.look != null) { var col = Random.ColorHSV(0, 1, 0, 0.6f, 0.08f, 0.85f); c.body.Paint(col, Random.value); }
                c.go.SetActive(true);
                Pose(c, 0);
                return;
            }
            c.go.SetActive(false);
        }

        void Update()
        {
            if (cum == null) return;
            float dt = Time.deltaTime;
            var cam = Camera.main != null ? Camera.main.transform.position : transform.position;
            bool night = DayNight.Night > 0.35f;
            int active = Mathf.RoundToInt(pool.Count * PerformanceTier.Budget.TrafficScale);
            for (int n = 0; n < pool.Count; n++)
            {
                var c = pool[n];
                // a lighter graphics tier drives fewer of the pool
                if (n >= active) { if (c.go.activeSelf) c.go.SetActive(false); continue; }
                if (!c.go.activeSelf) { Place(c, false); continue; }
                // wrecked, burning or burnt out: it stays where it stopped until you're well away
                if (c.health != null && c.health.State.Wrecked)
                {
                    c.v = 0;
                    if (c.body != null) { c.body.Brake = 0; c.body.HeadlightsOn = false; }
                    var wp = c.go.transform.position;
                    if ((wp.x - cam.x) * (wp.x - cam.x) + (wp.z - cam.z) * (wp.z - cam.z) > recycle * recycle) Place(c, false);
                    continue;
                }
                // the gap to whatever's ahead: the next car in this lane, or anything solid in front
                float gap = float.MaxValue;
                foreach (var o in pool) if (o != c && o.go.activeSelf && o.lane == c.lane && o.s > c.s) gap = Mathf.Min(gap, o.s - c.s);
                var fwd = c.go.transform.forward;
                if (Physics.SphereCast(c.go.transform.position + Vector3.up * 0.8f + fwd * 2.6f, 0.9f, fwd, out var hit, 25f, ~0, QueryTriggerInteraction.Ignore)
                    && !hit.collider.transform.IsChildOf(c.go.transform) && hit.normal.y < 0.6f)
                    gap = Mathf.Min(gap, hit.distance + 5f);
                // anyone crossing in front
                var me = c.go.transform.position;
                foreach (var q in Pedestrians.Positions)
                {
                    var d = q - me; float ahead = Vector3.Dot(d, fwd), side = Mathf.Abs(Vector3.Dot(d, c.go.transform.right));
                    if (ahead > 0 && ahead < 22 && side < 1.8f) gap = Mathf.Min(gap, ahead + 3f);
                }
                float safe = 9f + c.v * 1.4f;
                float want = gap < safe ? Mathf.Max(0, c.target * (gap - 7f) / Mathf.Max(1f, safe - 7f)) : c.target;
                float before = c.v;
                c.v = want < c.v ? Mathf.MoveTowards(c.v, want, 7f * dt) : Mathf.MoveTowards(c.v, want, 2.2f * dt);
                c.s += c.v * dt;
                float len = laneLength[c.lane];
                if (c.s > len)
                {
                    int n0 = nextStart[c.lane], n1 = nextStart[c.lane + 1];
                    if (n1 > n0) { float over = c.s - len; c.lane = next[Random.Range(n0, n1)]; c.s = over; c.target = laneSpeed[c.lane] * Random.Range(0.8f, 1.08f); }
                    else { Place(c, false); continue; }
                }
                Pose(c, dt);
                if (c.body != null) { c.body.Brake = c.v < before - 0.5f * dt || c.v < 0.3f ? 1 : 0; c.body.HeadlightsOn = night; }
                var p = c.go.transform.position;
                if ((p.x - cam.x) * (p.x - cam.x) + (p.z - cam.z) * (p.z - cam.z) > recycle * recycle) Place(c, false);
            }
        }

        public (Vector2 at, Vector2 dir) Sample(int lane, float s)
        {
            int a = pointStart[lane], b = pointStart[lane + 1] - 1;
            s = Mathf.Clamp(s, 0, laneLength[lane]);
            int i = a;
            while (i < b - 1 && cum[i + 1] < s) i++;
            var p0 = P(i); var p1 = P(Mathf.Min(b, i + 1));
            float seg = Mathf.Max(1e-4f, cum[Mathf.Min(b, i + 1)] - cum[i]);
            return (Vector2.Lerp(p0, p1, Mathf.Clamp01((s - cum[i]) / seg)), (p1 - p0).normalized);
        }

        float Ground(Vector2 at, float near)
        {
            float from = float.IsNaN(near) ? 400 : near + 3f, reach = float.IsNaN(near) ? 800 : 10;
            // the road (and anything else solid), not the car itself
            var hits = Physics.RaycastAll(new Vector3(at.x, from, at.y), Vector3.down, reach, ~0, QueryTriggerInteraction.Ignore);
            float best = float.NaN, bestD = float.MaxValue;
            foreach (var h in hits)
            {
                if (h.collider.attachedRigidbody != null || h.collider.GetComponentInParent<Health>() != null) continue;   // not cars, not people
                if (h.distance < bestD) { bestD = h.distance; best = h.point.y; }
            }
            return float.IsNaN(best) ? (float.IsNaN(near) ? 0 : near) : best;
        }

        void Pose(Car c, float dt)
        {
            var (at, dir) = Sample(c.lane, c.s);
            // look a little ahead along the lane so the car turns through the bends rather than snapping
            var (ahead, _) = Sample(c.lane, c.s + 3f);
            var look = ahead - at; if (look.sqrMagnitude < 1e-4f) look = dir;
            float yFront = Ground(at + look.normalized * 1.4f, c.y), yBack = Ground(at - look.normalized * 1.4f, c.y);
            float y = (yFront + yBack) / 2;
            c.y = float.IsNaN(c.y) || dt <= 0 ? y : Mathf.Lerp(c.y, y, Mathf.Clamp01(dt * 12));
            var rot = Quaternion.LookRotation(new Vector3(look.x, (yFront - yBack) / 2.8f * look.magnitude, look.y));
            c.go.transform.SetPositionAndRotation(new Vector3(at.x, c.y + 0.02f, at.y), dt <= 0 ? rot : Quaternion.Slerp(c.go.transform.rotation, rot, Mathf.Clamp01(dt * 8)));
            if (c.cc != null && c.cc.wheels != null)
            {
                c.wheelAngle += c.v * dt / Mathf.Max(0.2f, c.cc.wheelRadius) * Mathf.Rad2Deg;
                foreach (var wh in c.cc.wheels) if (wh != null) wh.localRotation = Quaternion.Euler(c.wheelAngle, 0, 0);
            }
        }
    }
}
