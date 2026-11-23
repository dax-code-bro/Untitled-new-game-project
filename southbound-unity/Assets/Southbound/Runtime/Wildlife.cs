// Calvera's wildlife and hunting (the web game's hunting.js and wilds.js, rules in Core/Hunting): animals come and go
// around you by region and hour (deer and bucks at dawn and dusk, coyotes and foxes at night, mustangs and longhorn
// herds on the plains), now and then a legend in its own country; they graze and wander, hear you (a shot carries,
// walking softly gets you close), smell you downwind, flee, and coyotes and bulls charge. Shoot one (Gunplay hits its
// Health): a wounded animal bleeds, slows and leaves a trail, then lies down. Walk up and press F to skin it with a
// knife (the pelt graded by how clean the kill was, the meat). K blows your call (a hunting call from Bayou Outfitters)
// and something answers. Crows circle a carcass left lying, rafts of ducks paddle on the lakes and burst off at a
// shot. The trading posts buy pelts and meat, cook you a plate, sell the licence; hunting without one, or killing a
// protected animal, is poaching if anyone sees. The wind readout shows near game.
using System.Collections.Generic;
using System.Linq;
using Southbound.Core;
using UnityEngine;

namespace Southbound
{
    public sealed class Wildlife : MonoBehaviour
    {
        [Tooltip("Animal models by the species' model path (khronos/Fox, quaternius/animals_pack/Deer...).")]
        public GameObject[] models;
        public string[] modelIds;
        public int maxAnimals = 12;

        public static Wildlife Instance { get; private set; }
        public string Prompt { get; private set; }
        public string Panel { get; private set; }

        sealed class Beast
        {
            public Animal a; public GameObject go; public Health hp; public Animation anim; public float lastHp; public string playing; public float size;
            public bool crows; public bool skinning;
        }
        readonly List<Beast> beasts = new List<Beast>();
        readonly System.Random rnd = new System.Random();
        SouthboundGame game;
        float spawnT, legendT = 20, noise = 1;
        bool warned;
        System.Func<string> hudPrompt, hudPanel;

        void Awake() { Instance = this; Missions.Extras["hunt"] = () => Fleet.Instance != null && Fleet.Instance.Ready && models != null && models.Length > 0; }
        void OnEnable() { Health.Hurt += OnHurt; Gunplay.Fired += OnShot; Hud.Sources.Add(Blips); Hud.Prompts.Add(hudPrompt = () => Prompt); Hud.Panels.Add(hudPanel = () => Panel); }
        void OnDisable() { Health.Hurt -= OnHurt; Gunplay.Fired -= OnShot; Hud.Sources.Remove(Blips); Hud.Prompts.Remove(hudPrompt); Hud.Panels.Remove(hudPanel); }

        void OnShot(Vector3 at, bool silenced) { if (!silenced) noise = 3; shotT = Time.time; }
        float shotT = -99;

        static Vector3 U(double x, double y, double z) => new Vector3(-(float)x, (float)y, (float)z);
        Vector3 Me => game.player.transform.position;
        (double x, double z) MeWeb => (-Me.x, Me.z);

        void Update()
        {
            Prompt = null; Panel = null;
            if (game == null) game = SouthboundGame.Instance;
            var fleet = Fleet.Instance;
            if (game == null || game.player == null || fleet == null || !fleet.Ready || Time.timeScale == 0 || StoreScreen.Showing) return;
            float dt = Time.deltaTime;
            var L = fleet.Layout; ICraftGround g = Fleet.Ground; var p = game.Profile;
            var (px, pz) = MeWeb;
            bool afoot = game.player.enabled;
            // your noise: a shot carries for a while; walking softly you're half as loud, running you're louder
            noise = Mathf.Max(1, noise - dt * 0.3f);
            float sp = afoot ? game.player.Speed : 10;
            float quiet = afoot && sp < 2.2f ? 0.55f : sp > 5.5f ? 1.35f : 1;
            string region = Regions.At(px, pz, L), phase = Hunting.Phase(p.Hour);
            // come and go around you
            if ((spawnT -= dt) <= 0)
            {
                spawnT = 2;
                if (beasts.Count(b => !b.a.Dead) < maxAnimals)
                {
                    string id = Hunting.Pick(region, phase, rnd);
                    if (id != null)
                    {
                        double ang = rnd.NextDouble() * System.Math.PI * 2, r = 90 + rnd.NextDouble() * 120, x = px + System.Math.Cos(ang) * r, z = pz + System.Math.Sin(ang) * r;
                        if (g.Water(x, z) - g.Height(x, z) < 0.3)
                        {
                            int n = Hunting.All[id].Herd ? 3 + rnd.Next(3) : 1;
                            for (int i = 0; i < n; i++) Spawn(id, x + (rnd.NextDouble() - 0.5) * 14, z + (rnd.NextDouble() - 0.5) * 14);
                        }
                    }
                }
                for (int i = beasts.Count - 1; i >= 0; i--) if ((beasts[i].go.transform.position - Me).sqrMagnitude > 420f * 420f) Remove(beasts[i]);
            }
            // a legend, now and then, in its own country
            if ((legendT -= dt) <= 0)
            {
                legendT = 45;
                foreach (var lid in Hunting.Legends)
                {
                    var Ls = Hunting.All[lid];
                    if (Hunting.Taken(p, lid) || Ls.Region != region || beasts.Any(b => b.a.Id == lid && !b.a.Dead)) continue;
                    if (rnd.NextDouble() > Hunting.LegendChance(Ls, phase)) continue;
                    double ang = rnd.NextDouble() * System.Math.PI * 2, r = 130 + rnd.NextDouble() * 70, x = px + System.Math.Cos(ang) * r, z = pz + System.Math.Sin(ang) * r;
                    if (g.Water(x, z) - g.Height(x, z) > 0.2) continue;
                    if (Spawn(lid, x, z) != null) game.Toast(Ls.Base == "stag" ? "Fresh tracks, bigger than any buck's. Something is out here." : Ls.Base == "coyote" ? "A long howl, close. It doesn't sound like the others." : "A flash of red at the edge of the trees.", 3.2f);
                }
            }
            // the animals
            var wind = fleet.Wind;
            foreach (var b in beasts)
            {
                b.a.Update(dt, px, pz, noise * quiet, wind.K, g, afoot);
                if (b.a.Bit > 0) { game.Health -= b.a.Bit; game.Toast("You were attacked!", 1f); }
                if (b.a.Drip) Drop(b.go.transform.position);
                Pose(b, dt);
            }
            Crows(dt); Ducks(dt);
            // the wind, near game
            bool near = afoot && beasts.Any(b => !b.a.Dead && (b.go.transform.position - Me).sqrMagnitude < 180f * 180f);
            if (near)
            {
                var cam = Camera.main != null ? Camera.main.transform : game.player.transform;
                float blowing = Mathf.Atan2(-(float)wind.X, (float)wind.Z) * Mathf.Rad2Deg;   // the way it blows, in Unity's yaw
                float rel = Mathf.DeltaAngle(cam.eulerAngles.y, blowing);
                string arrow = Mathf.Abs(rel) < 22.5f ? "↑" : Mathf.Abs(rel) > 157.5f ? "↓" : rel > 0 ? (rel < 67.5f ? "↗" : rel < 112.5f ? "→" : "↘") : (rel > -67.5f ? "↖" : rel > -112.5f ? "←" : "↙");
                Panel = $"Wind {arrow} {Mathf.RoundToInt((float)wind.Kmh)} km/h" + (quiet < 1 ? " · moving quietly" : "");
            }
            // your call
            if (afoot && SbInput.LetterDown('K')) Blow();
            Skinning(afoot);
            TradingPosts(afoot);
        }

        // ------------------------------------------------------------------ spawning and showing
        GameObject Model(string path)
        {
            if (models == null || modelIds == null) return null;
            for (int i = 0; i < modelIds.Length && i < models.Length; i++) if (modelIds[i] == path) return models[i];
            return null;
        }

        Beast Spawn(string id, double x, double z)
        {
            var s = Hunting.All[id];
            var prefab = Model(s.Model);
            if (prefab == null) return null;
            var root = new GameObject(s.Name);
            var m = Instantiate(prefab, root.transform);
            foreach (var c in m.GetComponentsInChildren<Collider>()) Destroy(c);
            // to the species' height, standing on its feet
            var bounds = new Bounds(m.transform.position, Vector3.zero); bool any = false;
            foreach (var r in m.GetComponentsInChildren<Renderer>()) { if (!any) { bounds = r.bounds; any = true; } else bounds.Encapsulate(r.bounds); }
            float k = any && bounds.size.y > 0.01f ? (float)s.H / bounds.size.y : 1;
            m.transform.localScale *= k;
            m.transform.localPosition = new Vector3(0, -(bounds.min.y - m.transform.position.y) * k, 0);
            float len = any ? Mathf.Max(bounds.size.x, bounds.size.z) * k : 1;
            if (s.Tint != 0)
            {
                var tint = new Color(((s.Tint >> 16) & 255) / 255f, ((s.Tint >> 8) & 255) / 255f, (s.Tint & 255) / 255f);
                foreach (var r in m.GetComponentsInChildren<Renderer>()) foreach (var mat in r.materials)
                {
                    if (mat.HasProperty("_BaseColor")) mat.SetColor("_BaseColor", Color.Lerp(mat.GetColor("_BaseColor"), tint, 0.75f));
                    if (mat.HasProperty("_Color")) mat.color = Color.Lerp(mat.color, tint, 0.75f);
                }
            }
            var box = root.AddComponent<BoxCollider>();
            box.center = new Vector3(0, (float)s.H * 0.5f, 0); box.size = new Vector3(Mathf.Max(0.3f, len * 0.35f), (float)s.H * 0.9f, Mathf.Max(0.5f, len * 0.9f));
            var hp = root.AddComponent<Health>();
            hp.hp = (float)s.Hp; hp.role = ""; hp.feet = 0; hp.headHeight = (float)s.H * 0.8f; hp.customDeath = true;
            var b = new Beast { a = new Animal(id, x, z, Fleet.Ground, rnd, len), go = root, hp = hp, lastHp = hp.hp, anim = m.GetComponentInChildren<Animation>(), size = len };
            beasts.Add(b);
            Pose(b, 0);
            return b;
        }

        void Remove(Beast b) { if (b.go != null) Destroy(b.go); beasts.Remove(b); }

        void Pose(Beast b, float dt)
        {
            var a = b.a;
            b.go.transform.SetPositionAndRotation(U(a.X, a.Y, a.Z), Quaternion.Euler(0, -(float)(a.Heading * Mathf.Rad2Deg), 0));
            if (b.anim == null) return;
            int slot = a.Anim == "idle" ? 0 : a.Anim == "walk" ? 1 : a.Anim == "run" ? 2 : a.Anim == "eat" ? 3 : a.Anim == "death" ? 4 : 5;
            string want = a.S.Clips[slot] ?? a.S.Clips[0];
            if (want == b.playing) { if (slot == 2) Speed(b, Mathf.Max(0.7f, (float)(a.Speed / a.S.Speed) * 1.2f)); return; }
            var clip = Clip(b.anim, want);
            if (clip == null) { if (slot == 4) b.go.transform.rotation *= Quaternion.Euler(0, 0, 88); b.playing = want; return; }
            if (slot == 4) { b.anim[clip].wrapMode = WrapMode.ClampForever; }
            else b.anim[clip].wrapMode = slot == 5 ? WrapMode.Once : WrapMode.Loop;
            b.anim.CrossFade(clip, slot == 4 || slot == 5 ? 0.1f : 0.25f);
            b.playing = want;
        }

        static void Speed(Beast b, float k) { var c = Clip(b.anim, b.playing); if (c != null) b.anim[c].speed = k; }

        static string Clip(Animation anim, string want)
        {
            if (want == null) return null;
            foreach (AnimationState st in anim)
            {
                string n = st.name;
                if (n == want || n.EndsWith("|" + want) || n.EndsWith("_" + want) || n.EndsWith(want)) return n;
            }
            return null;
        }

        // ------------------------------------------------------------------ shot, killed
        void OnHurt(Health h, bool killed)
        {
            var b = beasts.FirstOrDefault(x => x.hp == h);
            if (b == null) return;
            float d = b.lastHp - h.hp; b.lastHp = h.hp;
            bool melee = Gunplay.Instance != null && Gunplay.Instance.Weapon != null && Gunplay.Instance.Weapon.Melee;
            bool wasDead = b.a.Dead;
            bool died = b.a.Hurt(System.Math.Max(0, d), melee) || (killed && !b.a.Dead);
            if (killed && !b.a.Dead) b.a.Die();
            if (!wasDead && b.a.Dead) Killed(b);
        }

        void Killed(Beast b)
        {
            var s = b.a.S;
            if (s.Legend) game.Toast($"{s.Name} is down.", 2.5f);
            bool poached = s.Protected || !Hunting.Licensed(game.Profile);
            if (!poached) return;
            if (Police.Seen(b.go.transform.position, 45f)) { Police.Crime("poaching"); game.Toast(s.Protected ? $"Killing a {s.Name.ToLowerInvariant()} is a crime, and someone saw it." : "Hunting without a licence, and someone saw it.", 3f); }
            else if (!warned && !s.Protected) { warned = true; game.Toast("No hunting licence (any trading post sells one). Nobody saw that one.", 3.2f); }
        }

        // ------------------------------------------------------------------ skinning
        void Skinning(bool afoot)
        {
            if (!afoot) return;
            var me = Me;
            var c = beasts.FirstOrDefault(b => b.a.Dead && (b.go.transform.position - me).sqrMagnitude < 2.8f * 2.8f);
            if (c == null) return;
            var s = c.a.S;
            if (s.Protected) { Prompt = $"{s.Name} — protected animal, no pelt"; return; }
            if (Tools.Best(game.Profile.Tools, "knife") <= 0) { Prompt = $"{s.Name} — buy a knife to skin it (Bayou Outfitters)"; return; }
            int q = c.a.QualityGrade;
            Prompt = $"F  skin the {s.Name} · pelt {Hunting.Stars(q)}";
            if (!SbInput.InteractDown) return;
            double lb = Hunting.Skin(game.Profile, c.a, rnd);
            if (s.Legend) Hud.Big("LEGENDARY", $"{s.Name} · pelt {Hunting.Stars(q)}", 3f);
            game.Toast($"Skinned: {s.Name} pelt {Hunting.Stars(q)} ({Hunting.Quality[q]})" + (lb > 0 ? $" · {lb:0} lb of meat" : ""), 2.2f);
            Remove(c);
            game.Save();
        }

        /// <summary>Blow the hunting call you carry (K, or the phone's inventory).</summary>
        public void Blow()
        {
            if (game == null || Fleet.Instance == null || !Fleet.Instance.Ready) return;
            string call = Tools.Call(game.Profile.Tools);
            if (call == null) { game.Toast("You need a hunting call (Bayou Outfitters)", 2f); return; }
            var (px, pz) = MeWeb;
            Call(call, Regions.At(px, pz, Fleet.Instance.Layout), Hunting.Phase(game.Profile.Hour));
        }

        void Call(string kind, string region, string phase)
        {
            string sp = kind == "any" || !Hunting.All.ContainsKey(kind) ? (Hunting.Pick(region, phase, rnd) ?? "deer") : kind;
            var (px, pz) = MeWeb; int n = 0;
            for (int i = 0; i < 2 + rnd.NextDouble() * 2; i++)
            {
                double a = rnd.NextDouble() * System.Math.PI * 2, r = 50 + rnd.NextDouble() * 30;
                var b = Spawn(sp, px + System.Math.Cos(a) * r, pz + System.Math.Sin(a) * r);
                if (b != null) { b.a.Heading = System.Math.Atan2(-System.Math.Cos(a), -System.Math.Sin(a)); b.a.Mode = "walk"; b.a.T = 12; n++; }
            }
            game.Toast(n > 0 ? "You hear something answer the call…" : "Nothing answers out here", 2f);
        }

        // ------------------------------------------------------------------ blood trail, crows, ducks
        readonly Queue<GameObject> drops = new Queue<GameObject>();
        Material bloodMat, crowMat, duckMat;
        void Drop(Vector3 at)
        {
            if (bloodMat == null) bloodMat = CraftBody.Paint((0.29f, 0.03f, 0.03f, 0.35f, 0f));
            GameObject d = drops.Count >= 90 ? drops.Dequeue() : GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            if (d.GetComponent<Collider>() != null) Destroy(d.GetComponent<Collider>());
            d.name = "Blood"; d.GetComponent<MeshRenderer>().sharedMaterial = bloodMat;
            float k = 0.12f + Random.value * 0.14f;
            d.transform.position = new Vector3(at.x + Random.Range(-0.25f, 0.25f), Pedestrians.Ground(at + Vector3.up * 2, 6, at.y) + 0.02f, at.z + Random.Range(-0.25f, 0.25f));
            d.transform.localScale = new Vector3(k, 0.004f, k * (0.6f + Random.value * 0.6f));
            drops.Enqueue(d);
        }

        sealed class Flock { public Beast over; public Vector3 at; public float t, lift; public List<(float a, float r, float h, float w, Transform tr)> birds = new List<(float, float, float, float, Transform)>(); }
        readonly List<Flock> flocks = new List<Flock>();
        Transform Bird(float body, float wing, Material m, string name)
        {
            var root = new GameObject(name).transform;
            var b = GameObject.CreatePrimitive(PrimitiveType.Sphere); Destroy(b.GetComponent<Collider>()); b.transform.SetParent(root, false); b.transform.localScale = new Vector3(body * 2, body * 1.6f, body * 3.8f); b.GetComponent<MeshRenderer>().sharedMaterial = m;
            var w = GameObject.CreatePrimitive(PrimitiveType.Cube); Destroy(w.GetComponent<Collider>()); w.transform.SetParent(root, false); w.transform.localScale = new Vector3(wing, 0.015f, body * 1.4f); w.transform.localPosition = new Vector3(0, body * 0.2f, 0); w.GetComponent<MeshRenderer>().sharedMaterial = m; w.name = "Wings";
            return root;
        }

        void Crows(float dt)
        {
            if (crowMat == null) crowMat = CraftBody.Paint((0.08f, 0.09f, 0.1f, 0.55f, 0f));
            foreach (var b in beasts)
            {
                if (!b.a.Dead || b.a.DeadT < 30 || b.crows || flocks.Count >= 3 || (b.go.transform.position - Me).sqrMagnitude > 160f * 160f) continue;
                b.crows = true;
                var f = new Flock { over = b, at = b.go.transform.position, t = Random.value * 10 };
                for (int i = 0; i < 5; i++) f.birds.Add((i * 1.25f, 6 + Random.value * 5, 9 + Random.value * 6, 0.5f + Random.value * 0.3f, Bird(0.08f, 0.62f, crowMat, "Crow")));
                flocks.Add(f);
            }
            for (int i = flocks.Count - 1; i >= 0; i--)
            {
                var f = flocks[i]; f.t += dt;
                float d = Vector2.Distance(new Vector2(f.at.x, f.at.z), new Vector2(Me.x, Me.z));
                if (d < 14 && f.lift == 0) f.lift = 0.01f;
                if (f.lift > 0) f.lift += dt;
                if (f.lift > 8 || !beasts.Contains(f.over) || d > 260) { foreach (var bd in f.birds) Destroy(bd.tr.gameObject); if (f.over != null) f.over.crows = false; flocks.RemoveAt(i); continue; }
                for (int k = 0; k < f.birds.Count; k++)
                {
                    var bd = f.birds[k]; bd.a += dt * bd.w; f.birds[k] = bd;
                    float r = bd.r + f.lift * 7, y = f.at.y + bd.h + f.lift * 5 + Mathf.Sin(f.t * 0.7f + bd.a) * 1.2f;
                    bd.tr.position = new Vector3(f.at.x + Mathf.Cos(bd.a) * r, y, f.at.z + Mathf.Sin(bd.a) * r);
                    bd.tr.rotation = Quaternion.LookRotation(new Vector3(-Mathf.Sin(bd.a), 0, Mathf.Cos(bd.a)));
                    bd.tr.Find("Wings").localScale = new Vector3(0.62f * (1 + Mathf.Sin(f.t * 9 + bd.a * 3) * 0.25f), 0.015f, 0.112f);
                }
            }
        }

        sealed class Raft { public double x, z, h; public float t, ring, fly, away; public List<(float ox, float oz, float ph, Transform tr)> ducks = new List<(float, float, float, Transform)>(); }
        readonly List<Raft> rafts = new List<Raft>();
        float raftT = 3;
        void Ducks(float dt)
        {
            ICraftGround g = Fleet.Ground;
            if (duckMat == null) duckMat = CraftBody.Paint((0.44f, 0.35f, 0.25f, 0.8f, 0f));
            bool Inland(double x, double z) => g.Water(x, z) > 0.5 && g.Water(x, z) - g.Height(x, z) > 0.6;
            var (px, pz) = MeWeb;
            if ((raftT -= dt) <= 0)
            {
                raftT = 6;
                for (int i = rafts.Count - 1; i >= 0; i--) if (Dist(rafts[i].x, rafts[i].z, px, pz) > 220) { foreach (var d in rafts[i].ducks) Destroy(d.tr.gameObject); rafts.RemoveAt(i); }
                if (rafts.Count < 2)
                {
                    double a = rnd.NextDouble() * 6.28, r = 40 + rnd.NextDouble() * 60, x = px + System.Math.Cos(a) * r, z = pz + System.Math.Sin(a) * r;
                    if (Inland(x, z))
                    {
                        var R = new Raft { x = x, z = z, h = rnd.NextDouble() * 6.28, ring = 1 };
                        int n = 5 + rnd.Next(3);
                        for (int i = 0; i < n; i++) R.ducks.Add(((float)(rnd.NextDouble() - 0.5) * 6, (float)(rnd.NextDouble() - 0.5) * 6, (float)rnd.NextDouble() * 6, Bird(0.13f, 0.18f, duckMat, "Duck")));
                        rafts.Add(R);
                    }
                }
            }
            bool shot = Time.time - shotT < 0.6f;
            var craft = Piloting.Instance != null ? Piloting.Instance.Craft : null;
            for (int i = rafts.Count - 1; i >= 0; i--)
            {
                var R = rafts[i]; R.t += dt;
                double d = Dist(R.x, R.z, px, pz);
                bool boat = craft != null && craft.IsBoat && Mathf.Abs(craft.Speed) > 2;
                if (R.fly == 0 && ((shot && d < 140) || (d < 14 && game.player.enabled) || (boat && d < 30))) { R.fly = 0.01f; R.away = (float)System.Math.Atan2(R.x - px, R.z - pz); }
                if (R.fly > 0) { R.fly += dt; if (R.fly > 7) { foreach (var dk in R.ducks) Destroy(dk.tr.gameObject); rafts.RemoveAt(i); continue; } }
                else
                {
                    R.h += Mathf.Sin(R.t * 0.21f) * dt * 0.3f;
                    double nx = R.x + System.Math.Sin(R.h) * 0.35 * dt, nz = R.z + System.Math.Cos(R.h) * 0.35 * dt;
                    if (Inland(nx, nz)) { R.x = nx; R.z = nz; } else R.h += 2;
                }
                double wl = g.Water(R.x, R.z);
                foreach (var k in R.ducks)
                {
                    double x = R.x + k.ox, z = R.z + k.oz, y = wl + 0.04 + Mathf.Sin(R.t * 1.6f + k.ph) * 0.015f, hh = R.h + Mathf.Sin(R.t * 0.5f + k.ph) * 0.6f;
                    if (R.fly > 0)
                    {
                        float f = R.fly;
                        x += System.Math.Sin(R.away) * f * f * 2.2 + k.ox * f * 0.4; z += System.Math.Cos(R.away) * f * f * 2.2 + k.oz * f * 0.4;
                        y += Mathf.Min(f, 0.4f) * 1.5f + Mathf.Max(0, f - 0.4f) * 3.5f; hh = R.away;
                    }
                    k.tr.SetPositionAndRotation(U(x, y, z), Quaternion.Euler(0, -(float)(hh * Mathf.Rad2Deg), 0));
                    k.tr.Find("Wings").localScale = new Vector3(0.18f * (R.fly > 0 ? 2.6f * (1 + Mathf.Sin(R.t * 18 + k.ph) * 0.6f) : 1), 0.015f, 0.18f);
                }
            }
        }

        static double Dist(double ax, double az, double bx, double bz) => System.Math.Sqrt((ax - bx) * (ax - bx) + (az - bz) * (az - bz));

        // ------------------------------------------------------------------ the trading posts
        void TradingPosts(bool afoot)
        {
            if (!afoot || Prompt != null) return;
            foreach (var (x, z, name) in Hunting.Posts(Fleet.Instance.Layout))
            {
                var at = U(x, 0, z);
                if (new Vector2(Me.x - at.x, Me.z - at.z).sqrMagnitude > 3f * 3f) continue;
                Prompt = $"F  trade at {name}";
                if (SbInput.InteractDown) StoreScreen.Show(new Post(this, name));
                return;
            }
        }

        void Blips(List<Hud.Blip> into)
        {
            if (Fleet.Instance == null || !Fleet.Instance.Ready) return;
            foreach (var (x, z, _) in Hunting.Posts(Fleet.Instance.Layout)) into.Add(new Hud.Blip { at = U(x, 0, z), color = new Color(0.75f, 0.5f, 0.25f), size = 7 });
        }

        sealed class Post : StoreScreen.IStore
        {
            readonly Wildlife w; readonly string name;
            public Post(Wildlife w, string name) { this.w = w; this.name = name; }
            public string Title => name;
            public string Keeper => "The trader looks over the hides. \"Clean kills, and we'll talk money.\"";
            public string[] Tabs => new[] { "Sell pelts", "Meat", "Wildlife guide", "Rumours", "Licence" };
            public void Fill(string tab, List<StoreScreen.Row> rows, Profile p)
            {
                var game = w.game;
                switch (tab)
                {
                    case "Sell pelts":
                        foreach (var kv in p.Section("pelts").ToList())
                        {
                            if (!(kv.Value is double n) || n <= 0 || !Hunting.All.ContainsKey(kv.Key)) continue;
                            string id = kv.Key; double v = Hunting.PeltValue(p, id); var s = Hunting.All[id];
                            rows.Add(new StoreScreen.Row { Name = $"{s.Name} pelt × {n:0}", Sub = s.Legend ? "legendary" : "graded by the buyer", Price = $"Sell ${v:N0}", Buy = () => { p.Money += v; p.Section("pelts")[id] = 0.0; p.Section("peltVal")[id] = 0.0; game.Toast($"Pelts sold: +${v:N0}", 1.6f); game.Save(); } });
                        }
                        break;
                    case "Meat":
                        double meat = Hunting.MeatLb(p);
                        rows.Add(new StoreScreen.Row { Name = "Sell the meat", Sub = $"{meat:0} lb at $2.50/lb", Price = meat >= 1 ? $"Sell ${System.Math.Round(meat * 2.5):N0}" : "None", Enabled = meat >= 1, Buy = () => { p.Money += System.Math.Round(meat * 2.5); p.SetNumber("meat", 0); game.Save(); } });
                        rows.Add(new StoreScreen.Row { Name = "Have a plate cooked", Sub = "Venison over the stove (5 lb of your meat) · food +45", Price = meat >= 5 ? "Eat · $4" : "Need 5 lb", Enabled = meat >= 5 && p.Money >= 4, Buy = () => { p.Money -= 4; p.SetNumber("meat", meat - 5); game.Needs.Feed(45); game.Toast("Venison, beans and cornbread. You feel better.", 2.2f); } });
                        break;
                    case "Wildlife guide":
                        foreach (var s in Hunting.All.Values.Where(x => !x.Legend))
                            rows.Add(new StoreScreen.Row { Name = s.Name, Sub = $"{string.Join(", ", s.Regions)} · {(Hunting.Active.TryGetValue(s.Id, out var a) ? (a == "dusk" ? "dawn and dusk" : "at night") : "all day")}" + (s.Aggro > 0 ? " · can charge" : ""), Price = s.Protected ? "Protected" : $"${s.Pelt:N0}", Enabled = false });
                        break;
                    case "Rumours":
                        foreach (var id in Hunting.Legends) { var s = Hunting.All[id]; bool taken = Hunting.Taken(p, id); rows.Add(new StoreScreen.Row { Name = s.Name, Sub = taken ? "Taken" : s.Rumour, Price = taken ? "Taken" : $"${s.Pelt:N0} pelt", Enabled = false }); }
                        break;
                    default:
                        bool lic = Hunting.Licensed(p);
                        rows.Add(new StoreScreen.Row { Name = "Calvera hunting licence", Sub = "One year. Deer, buck, coyote and fox in season.", Price = lic ? "Owned" : "Buy · $40", Enabled = !lic && p.Money >= 40, Buy = () => { p.Money -= 40; Hunting.License(p); game.Toast("Licensed to hunt in Calvera.", 2f); game.Save(); } });
                        break;
                }
            }
            public string Note(string tab) => tab == "Sell pelts" ? "A clean single shot keeps a pelt perfect. Calls draw animals in (K); work downwind of them. Horses and cattle are protected."
                : tab == "Meat" ? $"{Hunting.MeatLb(w.game.Profile):0} lb of game meat in the cooler." : tab == "Rumours" ? "Talk around the stove: animals people swear they've seen."
                : tab == "Licence" ? (Hunting.Licensed(w.game.Profile) ? "You hold a Calvera hunting licence." : "Hunting without a licence is poaching, if anyone sees you.") : "Where each animal lives, when it's about and what it pays.";
        }
    }
}
