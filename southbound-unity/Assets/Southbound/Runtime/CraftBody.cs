// A boat or an aircraft in the world: the web game's physics (Core/Craft: BoatModel, AirModel) moving this
// object, the shape built from the browser's parts (one material per colour), the props and rotors spinning,
// the sailboat's sails, nav lights and a strobe on aircraft, and the engine note made in code. Bullets wear it
// down (Gunplay), crashes hurt it (and you), and at nothing left it burns out and blows up (CarHealth.Explosion).
// Unpiloted craft keep bobbing on the water or sit where they were left. Piloting (on John) drives it.
using System.Collections.Generic;
using Southbound.Core;
using UnityEngine;

namespace Southbound
{
    [DisallowMultipleComponent]
    public sealed class CraftBody : MonoBehaviour
    {
        public static readonly List<CraftBody> All = new List<CraftBody>();

        public string entryId;
        [Tooltip("The fleet entry this is (garage uid), or empty for one that isn't yours.")]
        public string uid;
        public CraftEntry Entry { get; private set; }
        public BoatModel Boat { get; private set; }
        public AirModel Air { get; private set; }
        public bool IsBoat => Boat != null;
        public bool IsAir => Air != null;
        public bool Heli => Air != null && Air.Heli;
        public string DisplayName => Entry != null ? Entry.Name : name;
        public Piloting Pilot { get; set; }
        public CraftInput Controls;
        /// <summary>Forward speed, m/s.</summary>
        public float Speed => (float)(Boat != null ? Boat.Speed : Air != null ? Air.Speed : 0);
        public float Length => Entry == null ? 6 : (float)(Boat != null ? Boat.S.L : Air.S.L);
        public float Radius => (float)(Boat != null ? Boat.Radius : Air != null ? Air.Radius : 3);
        public float Top => Mesh != null ? (float)Mesh.Height : 3;
        public double Health { get => Boat != null ? Boat.Health : Air != null ? Air.Health : 0; set { if (Boat != null) Boat.Health = value; else if (Air != null) Air.Health = value; } }
        public double MaxHealth => Boat != null ? Boat.MaxHealth : Air != null ? Air.MaxHealth : 100;
        public bool Wrecked { get; private set; }
        public CraftMesh Mesh { get; private set; }

        Transform model; readonly List<Transform> props = new List<Transform>(); Transform rotor, tail;
        Light navL, navR, strobe;
        AudioSource engine; float engineT;
        ICraftGround ground;
        float lastImpact;
        static readonly Dictionary<string, (Mesh mesh, Material[] mats, CraftMesh data)> built = new Dictionary<string, (Mesh, Material[], CraftMesh)>();

        void OnEnable() => All.Add(this);
        void OnDisable() => All.Remove(this);

        /// <summary>Make this object that craft (shape, physics), standing at a web-map spot.</summary>
        public void Init(CraftEntry e, ICraftGround g, double x, double z, double heading, IDictionary<string, int> upgrades = null, Mesh baked = null)
        {
            Entry = e; entryId = e.Id; ground = g;
            if (e.Boat) { Boat = new BoatModel(e); Boat.Upgrade(upgrades); Boat.Place(x, z, heading, g); }
            else { Air = new AirModel(e); Air.Upgrade(upgrades); Air.Place(x, z, heading, g); }
            BuildLook(baked);
            Pose(0);
            // something to hit: a box round the hull (bullets, John's feet, the camera)
            var box = gameObject.AddComponent<BoxCollider>();
            var b = model.GetComponent<MeshFilter>().sharedMesh.bounds;
            box.center = b.center; box.size = Vector3.Scale(b.size, new Vector3(e.Boat ? 0.9f : 0.5f, 0.8f, 0.9f));
            var rb = gameObject.AddComponent<Rigidbody>(); rb.isKinematic = true; rb.interpolation = RigidbodyInterpolation.Interpolate;
            var tag = gameObject.AddComponent<SurfaceTag>(); tag.surface = "metal";
        }

        public void Upgrade(IDictionary<string, int> up) { if (Boat != null) Boat.Upgrade(up); else Air?.Upgrade(up); }

        // ------------------------------------------------------------------ the look
        void BuildLook(Mesh baked)
        {
            if (!built.TryGetValue(Entry.Id, out var b))
            {
                var data = CraftShape.Build(Entry);
                var mesh = baked != null ? baked : ToUnity(data, Entry.Id);
                var mats = new Material[data.Looks.Count];
                for (int i = 0; i < mats.Length; i++) mats[i] = Paint(data.Looks[i]);
                b = (mesh, mats, data);
                built[Entry.Id] = b;
            }
            Mesh = b.data;
            var go = new GameObject("Model");
            go.transform.SetParent(transform, false);
            go.AddComponent<MeshFilter>().sharedMesh = b.mesh;
            var r = go.AddComponent<MeshRenderer>();
            r.sharedMaterials = b.mats;
            model = go.transform;
            var dark = Paint((0.1f, 0.08f, 0.07f, 0.6f, 0.4f));
            foreach (var (x, y, z) in b.data.Props)
            {
                var pivot = new GameObject("Prop").transform; pivot.SetParent(model, false); pivot.localPosition = U(x, y, z);
                for (int i = 0; i < 2; i++) Blade(pivot, new Vector3(0.12f, (float)b.data.PropLength, 0.04f), Quaternion.Euler(0, 0, i * 90), Vector3.zero, dark);
                props.Add(pivot);
            }
            if (b.data.Rotor is (double rx, double ry, double rz))
            {
                rotor = new GameObject("Rotor").transform; rotor.SetParent(model, false); rotor.localPosition = U(rx, ry, rz);
                for (int i = 0; i < 4; i++) Blade(rotor, new Vector3(0.28f, 0.04f, (float)b.data.RotorLength), Quaternion.Euler(0, i * 90, 0), new Vector3(0, 0, (float)b.data.RotorLength / 2), dark);
                var (tx, ty, tz) = b.data.TailRotor.Value;
                tail = new GameObject("Tail rotor").transform; tail.SetParent(model, false); tail.localPosition = U(tx, ty, tz);
                for (int i = 0; i < 2; i++) Blade(tail, new Vector3(0.03f, 1.1f, 0.12f), Quaternion.Euler(i * 90, 0, 0), Vector3.zero, dark);
            }
            if (b.data.Sails.Count > 0)
            {
                var cloth = Paint((0.95f, 0.94f, 0.9f, 0.8f, 0f)); cloth.SetFloat("_DoubleSidedEnable", 1); cloth.SetFloat("_CullMode", 0);
                foreach (var t in b.data.Sails)
                {
                    var m = new Mesh { name = "Sail" };
                    m.vertices = new[] { U(t[0], t[1], t[2]), U(t[3], t[4], t[5]), U(t[6], t[7], t[8]) };
                    m.triangles = new[] { 0, 2, 1, 0, 1, 2 };
                    m.RecalculateNormals(); m.RecalculateBounds();
                    var s = new GameObject("Sail"); s.transform.SetParent(model, false);
                    s.AddComponent<MeshFilter>().sharedMesh = m; s.AddComponent<MeshRenderer>().sharedMaterial = cloth;
                }
            }
            if (Air != null)
            {
                float half = (float)(Air.Heli ? Air.S.R * 1.2 : Air.S.Span / 2), y = (float)(Air.Heli ? 1.2 : Air.S.WingY);
                navL = Lamp("Nav light (port)", new Vector3(-half, y, 0), new Color(1f, 0.12f, 0.12f));   // red on the left wing
                navR = Lamp("Nav light (starboard)", new Vector3(half, y, 0), new Color(0.12f, 1f, 0.25f));
                strobe = Lamp("Strobe", new Vector3(0, y + 0.6f, -(float)Air.S.L / 2), Color.white);
            }
        }

        static Vector3 U(double x, double y, double z) => new Vector3(-(float)x, (float)y, (float)z);

        void Blade(Transform parent, Vector3 size, Quaternion rot, Vector3 offset, Material m)
        {
            var arm = new GameObject("Blade").transform; arm.SetParent(parent, false); arm.localRotation = rot;
            var bl = GameObject.CreatePrimitive(PrimitiveType.Cube);
            Destroy(bl.GetComponent<Collider>());
            bl.transform.SetParent(arm, false); bl.transform.localPosition = offset; bl.transform.localScale = size;
            bl.GetComponent<MeshRenderer>().sharedMaterial = m;
        }

        Light Lamp(string n, Vector3 at, Color c)
        {
            var go = new GameObject(n); go.transform.SetParent(model, false); go.transform.localPosition = at;
            var l = go.AddComponent<Light>(); l.type = LightType.Point; l.color = c; l.range = 6; l.intensity = 2; l.shadows = LightShadows.None;
            return l;
        }

        /// <summary>The browser's mesh in Unity space (x mirrored, triangles re-wound), one submesh per colour.</summary>
        public static Mesh ToUnity(CraftMesh d, string name)
        {
            var g = d.Mesh;
            int n = g.VertexCount;
            var v = new Vector3[n]; var nr = new Vector3[n];
            for (int i = 0; i < n; i++)
            {
                v[i] = new Vector3(-g.Positions[i * 3], g.Positions[i * 3 + 1], g.Positions[i * 3 + 2]);
                nr[i] = new Vector3(-g.Normals[i * 3], g.Normals[i * 3 + 1], g.Normals[i * 3 + 2]);
            }
            var m = new Mesh { name = name, indexFormat = n > 65000 ? UnityEngine.Rendering.IndexFormat.UInt32 : UnityEngine.Rendering.IndexFormat.UInt16 };
            m.vertices = v; m.normals = nr;
            var subs = new List<int>[d.Looks.Count];
            for (int k = 0; k < subs.Length; k++) subs[k] = new List<int>();
            for (int t = 0; t < g.TriangleCount; t++) { var s = subs[d.TriLook[t]]; s.Add(g.Indices[t * 3]); s.Add(g.Indices[t * 3 + 2]); s.Add(g.Indices[t * 3 + 1]); }
            m.subMeshCount = subs.Length;
            for (int k = 0; k < subs.Length; k++) m.SetTriangles(subs[k], k);
            m.RecalculateBounds();
            return m;
        }

        /// <summary>A plain lit material for one of the craft's colours (base colour, smoothness, metal).</summary>
        public static Material Paint((float r, float g, float b, float rough, float metal) look)
        {
            var sh = Shader.Find("HDRP/Lit") ?? Shader.Find("Universal Render Pipeline/Lit") ?? Shader.Find("Standard");
            var m = new Material(sh) { name = "Craft paint" };
            var c = new Color(look.r, look.g, look.b);
            m.SetColor("_BaseColor", c); m.color = c;
            m.SetFloat("_Metallic", look.metal);
            m.SetFloat("_Smoothness", 1 - look.rough); m.SetFloat("_Glossiness", 1 - look.rough);
            return m;
        }

        // ------------------------------------------------------------------ every frame
        void Update()
        {
            if (Entry == null || ground == null || Time.timeScale == 0) return;
            float dt = Mathf.Min(Time.deltaTime, 0.05f);
            var me = SouthboundGame.Instance != null && SouthboundGame.Instance.player != null ? SouthboundGame.Instance.player.transform.position : transform.position;
            bool near = Pilot != null || (transform.position - me).sqrMagnitude < 700f * 700f;
            if (!near) return;
            var input = Pilot != null && !Wrecked ? Controls : new CraftInput { Brake = Air != null && !Air.Heli ? 1 : 0 };
            if (Boat != null) Boat.Step(dt, input, ground);
            // an aircraft left on the ground stays put (one abandoned in the air comes down)
            else if (Pilot != null || Air.Airborne || Air.Alt > 0.5 || System.Math.Abs(Air.Speed) > 0.5) Air.Step(dt, input, ground);
            Pose(dt);
            Hurt();
            Sound(dt);
        }

        void Pose(float dt)
        {
            if (Boat != null)
            {
                transform.SetPositionAndRotation(new Vector3(-(float)Boat.X, (float)Boat.Y, (float)Boat.Z), Quaternion.Euler(-(float)(Boat.Pitch * Mathf.Rad2Deg), -(float)(Boat.Heading * Mathf.Rad2Deg), -(float)(Boat.Roll * Mathf.Rad2Deg)));
                foreach (var p in props) p.Rotate(0, 0, dt * (8 + Mathf.Abs((float)Boat.Speed) * 3) * Mathf.Rad2Deg, Space.Self);
            }
            else if (Air != null)
            {
                transform.SetPositionAndRotation(new Vector3(-(float)Air.X, (float)Air.Y, (float)Air.Z), Quaternion.Euler(-(float)(Air.Pitch * Mathf.Rad2Deg), -(float)(Air.Heading * Mathf.Rad2Deg), -(float)(Air.Roll * Mathf.Rad2Deg)));
                float spin = (float)Air.RotorSpin * Mathf.Rad2Deg;
                if (rotor != null) rotor.localRotation = Quaternion.Euler(0, -spin, 0);
                if (tail != null) tail.localRotation = Quaternion.Euler(spin * 1.6f, 0, 0);
                foreach (var p in props) p.localRotation = Quaternion.Euler(0, 0, -spin);
                bool night = DayNightNight();
                bool on = night || Pilot != null;
                if (navL != null) { navL.enabled = on; navR.enabled = on; strobe.enabled = on && Mathf.FloorToInt(Time.time / 0.12f) % 12 == 0; }
            }
        }

        static bool DayNightNight() { var g = SouthboundGame.Instance; if (g == null) return false; double h = g.Profile.Hour; return h < 6.3 || h > 19.2; }

        /// <summary>Crashes: a hard knock hurts whoever's aboard; at nothing left it burns out and blows up.</summary>
        void Hurt()
        {
            double impact = Boat != null ? Boat.Impact : Air.Impact;
            if (Boat != null && impact > lastImpact + 2) Boat.Health -= (impact - lastImpact) * 4;   // running aground at speed
            if (impact > lastImpact + 5 && Pilot != null && SouthboundGame.Instance != null)
            {
                SouthboundGame.Instance.Health -= (impact - lastImpact - 5) * 6;
                SouthboundGame.Instance.Toast(Boat != null ? "You ran aground" : "A hard landing!", 1.5f);
            }
            lastImpact = (float)impact;
            if (!Wrecked && Health <= 0 && (Boat != null || !Air.Airborne))
            {
                Wrecked = true;
                CarHealth.Explosion(transform.position + Vector3.up, 140f, 9f);
                foreach (var r in model.GetComponentsInChildren<Renderer>()) foreach (var m in r.materials) { m.SetColor("_BaseColor", m.GetColor("_BaseColor") * 0.15f); m.color *= 0.15f; }
                if (Pilot != null) { var p = Pilot; p.GetOff(true); if (SouthboundGame.Instance != null) SouthboundGame.Instance.Health -= 80; }
            }
        }

        /// <summary>A gunshot: wear it down (the web game's car rule, a tenth of the round's damage).</summary>
        public void Shot(double damage)
        {
            Health -= damage * 0.1;
            if (Air != null && Health < 25 && !Air.EngineOut && Random.value < 0.1f) Air.EngineOut = true;
        }

        // ------------------------------------------------------------------ the engine note, made in code
        void Sound(float dt)
        {
            if (Pilot == null) { if (engine != null && engine.isPlaying) engine.Stop(); return; }
            if (engine == null)
            {
                engine = gameObject.AddComponent<AudioSource>();
                engine.clip = Hum(Air != null && Air.Heli ? 22f : Air != null ? 48f : 38f);
                engine.loop = true; engine.spatialBlend = 0.7f; engine.volume = 0.35f;
            }
            if (!engine.isPlaying) engine.Play();
            float power = Air != null ? (float)Air.Power : Mathf.Clamp01(Mathf.Abs(Speed) / (float)Boat.Top + (float)Controls.Throttle * 0.4f);
            engineT = Mathf.Lerp(engineT, power, dt * 2);
            engine.pitch = 0.7f + engineT * (Air != null && Air.Heli ? 0.5f : 1.1f);
            engine.volume = Air != null && Air.Dead ? 0.05f : 0.25f + engineT * 0.3f;
        }

        static readonly Dictionary<float, AudioClip> hums = new Dictionary<float, AudioClip>();
        static AudioClip Hum(float baseHz)
        {
            if (hums.TryGetValue(baseHz, out var c)) return c;
            int rate = 22050, n = rate;   // one second, looped
            var data = new float[n];
            var rnd = new System.Random(7);
            float lp = 0;
            for (int i = 0; i < n; i++)
            {
                float t = i / (float)rate;
                // a firing note and its harmonics, chopped by the cylinders (or the blades), and some rumble
                float s = Mathf.Sin(2 * Mathf.PI * baseHz * t) * 0.5f + Mathf.Sin(2 * Mathf.PI * baseHz * 2 * t) * 0.25f + Mathf.Sin(2 * Mathf.PI * baseHz * 3 * t) * 0.12f;
                s *= 0.6f + 0.4f * Mathf.Abs(Mathf.Sin(Mathf.PI * baseHz * 0.5f * t));
                lp += ((float)rnd.NextDouble() * 2 - 1 - lp) * 0.08f;
                data[i] = (s * 0.7f + lp * 0.5f) * 0.6f;
            }
            c = AudioClip.Create("Craft engine " + baseHz, n, 1, rate, false);
            c.SetData(data, 0);
            hums[baseHz] = c;
            return c;
        }

        /// <summary>The craft's position on the web map.</summary>
        public (double x, double z) WebPos => Boat != null ? (Boat.X, Boat.Z) : (Air.X, Air.Z);

        /// <summary>Move it (a launch from storage, a teleport): web map position and heading.</summary>
        public void PlaceAt(double x, double z, double heading)
        {
            if (Boat != null) Boat.Place(x, z, heading, ground); else Air.Place(x, z, heading, ground);
            Pose(0);
        }

        public ICraftGround Ground => ground;
    }
}
