// A car taking damage (Core/CarDamage holds the web game's numbers): crashes dent the body where it hit
// (the mesh is pushed in around the contact, deeper the harder the hit, with its shading bent to match),
// crack or knock out the window on that side and hurt the driver in a bad one; bullets chip at its health
// and the glass they hit; at no health from crashing the engine dies, shot or blasted to nothing it burns
// for a few seconds and explodes (a fireball, a flash, the blast hurting people and cars nearby, the
// wreck thrown and charred, burning for half a minute). Smoke from the bonnet as it gets worse. The tank
// drains while you drive; stop by a fuel pump (Pumps) and it fills, if you can pay. A battered side can
// leave its door hanging open. Added by CarFactory to new prefabs, and to older ones on first use (Of).
using System;
using System.Collections.Generic;
using Southbound.Core;
using UnityEngine;

namespace Southbound
{
    public sealed class CarHealth : MonoBehaviour
    {
        [Tooltip("Particle materials for engine smoke and flames (CarFactory makes them).")]
        public Material smokeMaterial, fireMaterial;
        [Tooltip("Cracked safety glass (CarFactory makes it).")]
        public Material crackedGlass;
        [Tooltip("The orange light of the fire and the explosion's flash (CarFactory adds it, switched off).")]
        public Light fireLight;

        public CarDamage State { get; private set; } = new CarDamage();
        /// <summary>Where fuel pumps stand (the filling stations add theirs).</summary>
        public static readonly List<Vector3> Pumps = new List<Vector3>();
        /// <summary>A car went up (for the police, missions, the HUD).</summary>
        public static event Action<CarHealth> Exploded;

        CarController cc; CarBody body; Rigidbody rb; CarDoorSwing doors;
        sealed class Part { public MeshFilter mf; public MeshRenderer mr; public Mesh mesh; public Vector3[] v0, n0, v, n; public int[] glass; public Material[] mats0; }
        List<Part> parts;
        readonly int[] glassShown = new int[4];
        ParticleSystem smoke, fire;
        float hitCooldown, fillT, flashT = -1, fireBase, burnAfter;
        bool lowWarned, outWarned, fireWarned;
        float[] paint0, paint20; float metal0; bool charred;
        static AudioClip crashClip, boomClip;

        /// <summary>The CarHealth of whatever car this belongs to (added if the prefab predates it).</summary>
        public static CarHealth Of(Component c)
        {
            if (c == null) return null;
            var car = c.GetComponentInParent<CarController>();
            if (car == null) return null;
            var h = car.GetComponent<CarHealth>();
            return h != null ? h : car.gameObject.AddComponent<CarHealth>();
        }

        void Awake()
        {
            cc = GetComponent<CarController>(); body = GetComponent<CarBody>(); rb = GetComponent<Rigidbody>(); doors = GetComponent<CarDoorSwing>();
            State = new CarDamage(UnityEngine.Random.Range(0.35f, 0.95f));
            if (fireLight != null) fireBase = fireLight.intensity;
            // bullets go through car bodies as sheet metal, not as the masonry an untagged collider counts as
            var colRoot = transform.Find("Collision");
            if (colRoot != null)
                foreach (var col in colRoot.GetComponentsInChildren<Collider>(true))
                    if (SurfaceTag.Of(col) == null) { var t = col.gameObject.AddComponent<SurfaceTag>(); t.surface = "metal"; t.oneSided = true; }
        }

        /// <summary>Good as new (a traffic car reused somewhere else).</summary>
        public void Restore(double fuel)
        {
            State = new CarDamage(fuel);
            if (parts != null)
                foreach (var p in parts)
                {
                    p.v = (Vector3[])p.v0.Clone(); p.n = (Vector3[])p.n0.Clone();
                    p.mesh.vertices = p.v; p.mesh.normals = p.n; p.mesh.RecalculateBounds();
                    if (p.glass != null) { p.mesh.subMeshCount = 2; p.mesh.SetTriangles(p.glass, 1, false); p.mr.sharedMaterials = p.mats0; }
                }
            for (int k = 0; k < 4; k++) glassShown[k] = 0;
            if (smoke != null) smoke.Stop(true, ParticleSystemStopBehavior.StopEmittingAndClear);
            if (fire != null) fire.Stop(true, ParticleSystemStopBehavior.StopEmittingAndClear);
            if (fireLight != null) fireLight.enabled = false;
            flashT = -1; burnAfter = 0; fireWarned = false;
            if (charred && body != null && body.look != null)
            {
                charred = false;
                body.look.Paint = paint0; body.look.Paint2 = paint20; body.look.Metal = metal0;
                body.ApplyLook();
            }
            doors?.SetAjar(0, 0); doors?.SetAjar(1, 0);
        }

        Vector3 Centre => transform.TransformPoint(new Vector3(0, (cc != null ? cc.roof : 1.4f) * 0.45f, 0));
        CarSide SideOf(Vector3 world) { var l = transform.InverseTransformPoint(world); return CarDamage.Side(l.x, l.z); }
        bool PlayerInside => cc != null && cc.Driver != null;
        static SouthboundGame Game => SouthboundGame.Instance;

        // ------------------------------------------------------------------ what hurts it
        void OnCollisionEnter(Collision c)
        {
            if (State.Exploded || hitCooldown > 0 || c.contactCount == 0) return;
            if (c.collider.GetComponentInParent<Health>() != null) return;   // people: running them over is handled where they walk
            var cp = c.GetContact(0);
            float impact = Mathf.Abs(Vector3.Dot(c.relativeVelocity, cp.normal));
            if (Mathf.Abs(cp.normal.y) > 0.7f) impact *= 0.5f;   // landing on the ground: half the drop speed counts
            if (impact < 4) return;
            hitCooldown = 0.3f;
            Crash(cp.point, impact);
        }

        /// <summary>A crash at this point and closing speed (m/s).</summary>
        public void Crash(Vector3 point, float impact)
        {
            var side = SideOf(point);
            bool was = State.Wrecked;
            State.Crash(impact, side);
            Dent(point, Centre - point, Mathf.Clamp((impact - 4) * 0.012f, 0.01f, 0.2f), 0.45f + impact * 0.02f);
            AfterDamage();
            Play(crashClip ??= Noise("crash", 0.5f, 7f, 0.25f), point, Mathf.Clamp01(impact / 20f));
            if (PlayerInside && Game != null)
            {
                Game.Health -= CarDamage.DriverHurt(impact);
                if (!was && State.Wrecked) Game.Toast("The engine is wrecked. Get out (F)", 4f);
            }
        }

        /// <summary>A bullet into the car at this point (from Gunplay).</summary>
        public void Shot(Vector3 point, double weaponDamage, double ammoVehicle)
        {
            if (State.Exploded) return;
            var l = transform.InverseTransformPoint(point);
            bool window = cc != null && l.y / Mathf.Max(0.5f, cc.roof) > 0.56f;
            bool lit = State.Shot(weaponDamage, ammoVehicle, CarDamage.Side(l.x, l.z), window);
            AfterDamage();
            if (lit) Ignited();
        }

        /// <summary>Caught in a blast.</summary>
        public void Blasted(Vector3 at, float damage, float radius)
        {
            if (State.Exploded) return;
            float d = Vector3.Distance(Centre, at);
            bool lit = State.Blast(damage, d, radius, SideOf(at));
            if (d < radius) Dent(at, Centre - at, 0.15f * (1 - d / radius), 1.2f);
            if (rb != null && !rb.isKinematic) rb.AddExplosionForce(rb.mass * 8f, at, radius, 0.6f, ForceMode.Impulse);
            AfterDamage();
            if (lit) Ignited();
        }

        void AfterDamage()
        {
            ApplyGlass();
            // a side battered in springs its door
            if (doors != null) { doors.SetAjar(0, State.Dents[(int)CarSide.Left] > 0.85 ? 0.2f : 0); doors.SetAjar(1, State.Dents[(int)CarSide.Right] > 0.85 ? 0.2f : 0); }
        }

        void Ignited()
        {
            if (PlayerInside && !fireWarned && Game != null) { fireWarned = true; Game.Toast("Your car is on fire. Get out!", 3f); }
        }

        // ------------------------------------------------------------------ every frame
        void Update()
        {
            float dt = Time.deltaTime;
            if (dt <= 0) return;
            hitCooldown -= dt;
            if (State.Burn(dt)) Explode();
            Effects(dt);
            if (PlayerInside) Driven(dt);
        }

        void Driven(float dt)
        {
            var game = Game;
            State.Drain(dt, cc.Controls.Throttle, cc.ForwardSpeed, cc.Controls.Nitro);
            if (game == null) return;
            if (State.Fuel < 0.12 && State.Fuel > 0 && !lowWarned) { lowWarned = true; game.Toast("Fuel low: fill up at a filling station", 2.6f); }
            if (State.Fuel > 0.2) lowWarned = false;
            if (State.Fuel <= 0 && !outWarned) { outWarned = true; game.Toast("Out of fuel", 3f); }
            if (State.Fuel > 0) outWarned = false;
            if (State.OnFire) Ignited();
            // at the pump: stop, and it fills (if you can pay)
            bool atPump = false;
            if (Mathf.Abs(cc.ForwardSpeed) < 1.2f && State.Fuel < 0.97)
                foreach (var p in Pumps) if ((p - transform.position).sqrMagnitude < 81) { atPump = true; break; }
            fillT = atPump ? fillT + dt : 0;
            if (fillT > 1.1f)
            {
                fillT = -999;   // once per stop
                int cost = CarDamage.FillCost(State.Fuel);
                if (game.Profile.Money >= cost) { game.Profile.Money -= cost; State.Fuel = 1; game.Toast($"Filled up · ${cost}", 1.8f); }
                else game.Toast($"Not enough cash for gas (${cost})", 1.8f);
            }
        }

        void Effects(float dt)
        {
            int level = State.Smoke;
            if (level > 0 && smoke == null && smokeMaterial != null) smoke = MakeSmoke();
            if (smoke != null)
            {
                var em = smoke.emission; em.rateOverTime = level == 0 ? 0 : level == 1 ? 5 : 14;
                var main = smoke.main; main.startColor = level >= 2 ? new Color(0.08f, 0.08f, 0.08f, 0.85f) : new Color(0.55f, 0.55f, 0.55f, 0.5f);
                if (level > 0 && !smoke.isPlaying) smoke.Play();
            }
            bool burning = State.OnFire && (!State.Exploded || burnAfter > 0);
            if (State.Exploded && burnAfter > 0) burnAfter -= dt;
            if (burning && fire == null && fireMaterial != null) fire = MakeFire();
            if (fire != null)
            {
                var em = fire.emission; em.rateOverTime = burning ? 45 : 0;
                if (burning && !fire.isPlaying) fire.Play();
            }
            if (fireLight != null)
            {
                float k = 0;
                if (flashT >= 0) { flashT += dt; k = Mathf.Max(0, 1 - flashT / 0.7f); if (flashT > 0.7f) flashT = -1; }
                if (burning) k = Mathf.Max(k, 0.06f + 0.03f * Mathf.PerlinNoise(Time.time * 9f, 0.3f));
                fireLight.enabled = k > 0.001f;
                if (fireLight.enabled) fireLight.intensity = fireBase * k;
            }
        }

        void Explode()
        {
            var at = Centre;
            burnAfter = 28f;
            if (body != null && body.look != null && !charred)
            {
                // charred (the paint is kept to put back if the car is reused)
                charred = true;
                paint0 = body.look.Paint; paint20 = body.look.Paint2; metal0 = body.look.Metal;
                body.look.Paint2 = new[] { 0.03f, 0.028f, 0.026f };
                body.Paint(new Color(0.035f, 0.03f, 0.028f), 0);
            }
            foreach (var dir in new[] { Vector3.forward, Vector3.back, Vector3.left, Vector3.right })
            {
                var p = transform.TransformPoint(Vector3.Scale(dir, new Vector3((cc != null ? cc.width : 1.9f) / 2, 0, (cc != null ? cc.length : 4.6f) / 2)) + Vector3.up * 0.8f);
                Dent(p, at - p, UnityEngine.Random.Range(0.06f, 0.14f), 0.9f);
            }
            ApplyGlass();
            if (fire == null && fireMaterial != null) fire = MakeFire();
            if (fire != null) fire.Emit(70);
            flashT = 0;
            Play(boomClip ??= Noise("explosion", 2.2f, 1.6f, 0.9f), at, 1f);
            if (PlayerInside)
            {
                var d = cc.Driver;
                d.Exit(true);
                if (Game != null) Game.Health -= 60;
            }
            if (rb != null && !rb.isKinematic)
            {
                rb.AddForce(Vector3.up * UnityEngine.Random.Range(6f, 9f), ForceMode.VelocityChange);
                rb.AddTorque(UnityEngine.Random.insideUnitSphere * 2f, ForceMode.VelocityChange);
            }
            Explosion(at, 160f, 8f, this);
            Exploded?.Invoke(this);
        }

        /// <summary>A blast: people and cars in the radius are hurt by distance, loose things thrown, the town panics.</summary>
        public static void Explosion(Vector3 at, float damage, float radius, CarHealth source = null)
        {
            var people = new HashSet<Health>(); var cars = new HashSet<CarHealth>();
            foreach (var col in Physics.OverlapSphere(at, radius, ~0, QueryTriggerInteraction.Ignore))
            {
                var h = col.GetComponentInParent<Health>();
                if (h != null)
                {
                    if (people.Add(h)) { float d = Vector3.Distance(h.transform.position + Vector3.up * 0.9f, at); if (d < radius) h.Damage(damage * (1 - d / radius)); }
                    continue;
                }
                var car = col.GetComponentInParent<CarController>();
                if (car != null)
                {
                    var ch = Of(car);
                    if (ch != source && cars.Add(ch)) ch.Blasted(at, damage, radius);
                    continue;
                }
                var body = col.attachedRigidbody;
                if (body != null && !body.isKinematic) body.AddExplosionForce(damage * 3f, at, radius, 0.5f, ForceMode.Impulse);
            }
            var game = Game;
            if (game != null && game.player != null && game.player.enabled)
            {
                float d = Vector3.Distance(game.player.transform.position + Vector3.up * 0.9f, at);
                if (d < radius) game.Health -= damage * (1 - d / radius) * 0.5f;
            }
            var peds = FindAnyObjectByType<Pedestrians>();
            if (peds != null) peds.Panic(at, 70f);
        }

        // ------------------------------------------------------------------ dents and glass in the mesh
        List<Part> Parts()
        {
            if (parts != null) return parts;
            parts = new List<Part>();
            var bodyRoot = transform.Find("Body");
            if (bodyRoot == null) return parts;
            foreach (var mf in bodyRoot.GetComponentsInChildren<MeshFilter>(true))
            {
                string n = mf.gameObject.name;
                if (!n.StartsWith("Body LOD") && !n.EndsWith(" skin")) continue;   // the shell and the doors, not the cabin
                var mesh = mf.mesh;   // this car's own copy
                var p = new Part { mf = mf, mr = mf.GetComponent<MeshRenderer>(), mesh = mesh, v0 = mesh.vertices, n0 = mesh.normals };
                p.v = (Vector3[])p.v0.Clone(); p.n = (Vector3[])p.n0.Clone();
                if (mesh.subMeshCount > 1) p.glass = mesh.GetTriangles(1);
                p.mats0 = p.mr != null ? p.mr.sharedMaterials : null;
                parts.Add(p);
            }
            return parts;
        }

        /// <summary>Push the body in around a point: depth metres at the middle, nothing at `radius`.</summary>
        void Dent(Vector3 worldPoint, Vector3 worldInward, float depth, float radius)
        {
            if (depth <= 0 || worldInward.sqrMagnitude < 1e-6f) return;
            foreach (var p in Parts())
            {
                var t = p.mf.transform;
                Vector3 c = t.InverseTransformPoint(worldPoint), d = t.InverseTransformDirection(worldInward).normalized;
                float[] w = null;
                for (int i = 0; i < p.v.Length; i++)
                {
                    float dist = (p.v[i] - c).magnitude;
                    if (dist >= radius) continue;
                    float k = 1 - dist / radius; k *= k;
                    // crumpled, not a smooth bowl: the same jitter for vertices that share a place, so no cracks
                    float jitter = 0.7f + 0.6f * Hash(p.v0[i]);
                    p.v[i] += d * depth * k * jitter;
                    (w ??= new float[p.v.Length])[i] = k;
                }
                if (w == null) continue;
                // bend the shading to the new shape around the dent
                var acc = new Vector3[p.v.Length];
                var tris = p.mesh.triangles;
                for (int i = 0; i + 2 < tris.Length; i += 3)
                {
                    int a = tris[i], b = tris[i + 1], e = tris[i + 2];
                    if (w[a] == 0 && w[b] == 0 && w[e] == 0) continue;
                    var fn = Vector3.Cross(p.v[b] - p.v[a], p.v[e] - p.v[a]);
                    acc[a] += fn; acc[b] += fn; acc[e] += fn;
                }
                for (int i = 0; i < w.Length; i++)
                    if (w[i] > 0 && acc[i].sqrMagnitude > 1e-12f) p.n[i] = Vector3.Lerp(p.n[i], acc[i].normalized, Mathf.Min(1, w[i] * 1.5f)).normalized;
                p.mesh.vertices = p.v; p.mesh.normals = p.n;
                p.mesh.RecalculateBounds();
            }
        }

        static float Hash(Vector3 v) { float h = Mathf.Sin(v.x * 127.1f + v.y * 311.7f + v.z * 74.7f) * 43758.5453f; return h - Mathf.Floor(h); }

        /// <summary>Each side's windows as the state says: clear, cracked (frosted, whiter) or gone.</summary>
        void ApplyGlass()
        {
            bool changed = false;
            for (int k = 0; k < 4; k++) { int s = Mathf.Min(State.Glass[k], 3) == 0 ? 0 : State.Glass[k] >= 3 ? 2 : 1; if (s != glassShown[k]) { glassShown[k] = s; changed = true; } }
            if (!changed) return;
            foreach (var p in Parts())
            {
                if (p.glass == null || p.mr == null) continue;
                var clear = new List<int>(); var cracked = new List<int>();
                var t = p.mf.transform;
                for (int i = 0; i + 2 < p.glass.Length; i += 3)
                {
                    var c = (p.v0[p.glass[i]] + p.v0[p.glass[i + 1]] + p.v0[p.glass[i + 2]]) / 3;
                    int s = glassShown[(int)SideOf(t.TransformPoint(c))];
                    if (s == 2) continue;   // knocked out
                    var dst = s == 1 && crackedGlass != null ? cracked : clear;
                    dst.Add(p.glass[i]); dst.Add(p.glass[i + 1]); dst.Add(p.glass[i + 2]);
                }
                p.mesh.subMeshCount = cracked.Count > 0 ? 3 : 2;
                p.mesh.SetTriangles(clear, 1, false);
                if (cracked.Count > 0) p.mesh.SetTriangles(cracked, 2, false);
                if (p.mats0 != null && p.mats0.Length >= 2)
                    p.mr.sharedMaterials = cracked.Count > 0 ? new[] { p.mats0[0], p.mats0[1], crackedGlass } : p.mats0;
            }
        }

        // ------------------------------------------------------------------ smoke, fire, sound
        ParticleSystem MakeSmoke()
        {
            float len = cc != null ? cc.length : 4.6f, roof = cc != null ? cc.roof : 1.4f;
            var ps = Particles("Engine smoke", smokeMaterial, new Vector3(0, roof * 0.62f, len * 0.33f), 260);
            var main = ps.main;
            main.startLifetime = new ParticleSystem.MinMaxCurve(2.2f, 3.4f); main.startSpeed = new ParticleSystem.MinMaxCurve(0.8f, 1.6f);
            main.startSize = new ParticleSystem.MinMaxCurve(0.5f, 1.1f); main.gravityModifier = -0.06f;
            var sol = ps.sizeOverLifetime; sol.enabled = true; sol.size = new ParticleSystem.MinMaxCurve(1f, AnimationCurve.Linear(0, 0.6f, 1, 2.6f));
            Fade(ps, 0.7f);
            return ps;
        }

        ParticleSystem MakeFire()
        {
            float len = cc != null ? cc.length : 4.6f, roof = cc != null ? cc.roof : 1.4f;
            var ps = Particles("Fire", fireMaterial, new Vector3(0, roof * 0.5f, len * 0.25f), 400);
            var main = ps.main;
            main.startLifetime = new ParticleSystem.MinMaxCurve(0.45f, 0.9f); main.startSpeed = new ParticleSystem.MinMaxCurve(1.2f, 2.6f);
            main.startSize = new ParticleSystem.MinMaxCurve(0.5f, 1.3f); main.gravityModifier = -0.25f;
            main.startColor = new ParticleSystem.MinMaxGradient(new Color(1f, 0.55f, 0.15f), new Color(1f, 0.8f, 0.35f));
            var shape = ps.shape; shape.radius = 0.6f;
            var sol = ps.sizeOverLifetime; sol.enabled = true; sol.size = new ParticleSystem.MinMaxCurve(1f, AnimationCurve.Linear(0, 1f, 1, 0.3f));
            Fade(ps, 1f);
            return ps;
        }

        ParticleSystem Particles(string name, Material m, Vector3 local, int max)
        {
            var go = new GameObject(name);
            go.transform.SetParent(transform, false);
            go.transform.localPosition = local;
            var ps = go.AddComponent<ParticleSystem>();
            ps.Stop(true, ParticleSystemStopBehavior.StopEmittingAndClear);
            var main = ps.main; main.loop = true; main.simulationSpace = ParticleSystemSimulationSpace.World; main.maxParticles = max;
            var em = ps.emission; em.rateOverTime = 0;
            var shape = ps.shape; shape.shapeType = ParticleSystemShapeType.Sphere; shape.radius = 0.3f;
            var r = go.GetComponent<ParticleSystemRenderer>();
            r.sharedMaterial = m; r.renderMode = ParticleSystemRenderMode.Billboard;
            r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            return ps;
        }

        static void Fade(ParticleSystem ps, float peak)
        {
            var col = ps.colorOverLifetime; col.enabled = true;
            var g = new Gradient();
            g.SetKeys(new[] { new GradientColorKey(Color.white, 0), new GradientColorKey(Color.white, 1) },
                      new[] { new GradientAlphaKey(0, 0), new GradientAlphaKey(peak, 0.15f), new GradientAlphaKey(0, 1) });
            col.color = g;
        }

        static void Play(AudioClip clip, Vector3 at, float volume) { if (clip != null && volume > 0.02f) AudioSource.PlayClipAtPoint(clip, at, volume); }

        /// <summary>A burst of low noise: `decay` per second, `tone` how much of it is a low rumble.</summary>
        static AudioClip Noise(string name, float seconds, float decay, float tone)
        {
            const int rate = 22050;
            int n = (int)(rate * seconds);
            var data = new float[n];
            var rnd = new System.Random(7);
            float low = 0;
            for (int i = 0; i < n; i++)
            {
                float t = i / (float)rate;
                float white = (float)(rnd.NextDouble() * 2 - 1);
                low += (white - low) * 0.06f;   // a rumble under the crack
                data[i] = Mathf.Exp(-t * decay) * ((1 - tone) * white * 0.6f + tone * low * 3.5f);
            }
            var clip = AudioClip.Create(name, n, 1, rate, false);
            clip.SetData(data, 0);
            return clip;
        }
    }
}
