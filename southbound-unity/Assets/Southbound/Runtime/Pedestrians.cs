// Townspeople on Calvera's pavements: a pool of the web game's MakeHuman people (retargeted from the same
// animation library John uses) walking the town's sidewalks (Core/Sidewalks) around the player, a few
// stopped in pairs to talk, fewer at night. Walkers too far away are moved to a pavement nearer the
// player, out of sight range. They keep to the ground by a raycast onto whatever's there (pavement slabs,
// kerbs, terrain). This is the ambient crowd only: no reactions yet (U2 brings the web game's AI).
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

        sealed class Walker { public GameObject go; public Retargeter rt; public int path; public float s, dir, speed; public bool talking; public float y; }
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
                var w = new Walker { go = root, rt = rt };
                walkers.Add(w);
                Place(w, true);
            }
        }

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
            int active = Mathf.RoundToInt(count * (1 - 0.65f * DayNight.Night));
            Positions.Clear();
            foreach (var w0 in walkers) if (w0.go.activeSelf) Positions.Add(w0.go.transform.position);
            for (int n = 0; n < walkers.Count; n++)
            {
                var w = walkers[n];
                bool want = n < active;
                if (!want) { if (w.go.activeSelf) w.go.SetActive(false); continue; }
                if (!w.go.activeSelf) { Place(w, false); continue; }
                float len = pathLength[w.path];
                w.s += w.dir * w.speed * Time.deltaTime;
                if (w.s < 0 || w.s > len) { w.dir = -w.dir; w.s = Mathf.Clamp(w.s, 0, len); }   // the end of the pavement: turn round
                Pose(w, Time.deltaTime);
                var p = w.go.transform.position;
                if ((p.x - cam.x) * (p.x - cam.x) + (p.z - cam.z) * (p.z - cam.z) > recycle * recycle) Place(w, false);
            }
        }

        void Pose(Walker w, float dt)
        {
            int a = pointStart[w.path], b = pointStart[w.path + 1] - 1;
            int i = a;
            while (i < b - 1 && cum[i + 1] < w.s) i++;
            var p0 = P(i); var p1 = P(Mathf.Min(b, i + 1));
            float seg = Mathf.Max(1e-4f, cum[Mathf.Min(b, i + 1)] - cum[i]);
            var at = Vector2.Lerp(p0, p1, Mathf.Clamp01((w.s - cum[i]) / seg));
            var fwd = (p1 - p0).normalized * w.dir;
            // stand on whatever's under them
            float y = w.y;
            // (from just above their last footing, so an awning, a lamp arm or a car roof overhead isn't taken for the ground)
            float from = float.IsNaN(w.y) ? 400 : w.y + 1.6f, reach = float.IsNaN(w.y) ? 800 : 12;
            if (Physics.Raycast(new Vector3(at.x, from, at.y), Vector3.down, out var hit, reach, ~0, QueryTriggerInteraction.Ignore)) y = hit.point.y;
            if (float.IsNaN(y)) y = 0;
            w.y = float.IsNaN(w.y) || dt <= 0 ? y : Mathf.Lerp(w.y, y, Mathf.Clamp01(dt * 10));
            w.go.transform.position = new Vector3(at.x, w.y, at.y);
            if (fwd.sqrMagnitude > 1e-6f && !w.talking) w.go.transform.rotation = Quaternion.Slerp(w.go.transform.rotation, Quaternion.LookRotation(new Vector3(fwd.x, 0, fwd.y)), dt <= 0 ? 1 : Mathf.Clamp01(dt * 6));
            if (w.rt != null && w.rt.Ready) { if (w.talking) w.rt.Loop("Idle_Talking_Loop", 1); else w.rt.Loop("Walk_Loop", w.speed / 1.5f); }
        }
    }
}
