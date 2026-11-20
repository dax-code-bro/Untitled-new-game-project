// The law in Calvera. Core/Wanted holds the rules, the same as the web game's police.js: crimes the town
// sees or hears (shots, people hurt or killed, a gun pointed at an officer, an officer shot) raise your
// wanted level. Cruisers come for you with lights and siren, routed over the lane graph (Core/LaneRoute)
// to where you are, or to where you were last seen once they've lost you. Officers get out and either
// arrest you (low heat, on foot, gun away: stand still and you're Busted) or open fire (a killing, an
// officer shot, or a gun out in front of them). Break their line of sight and the stars cool off one at a
// time. Busted: a fine and you're let go at the spawn. Wasted (health gone, from anything): a hospital
// bill and you wake up at the spawn. The HUD (Runtime/Hud) shows the stars, the prompts, the banner and the
// cruisers on the minimap; without it they're drawn here with OnGUI.
using System.Collections.Generic;
using Southbound.Core;
using UnityEngine;

namespace Southbound
{
    public sealed class Police : MonoBehaviour
    {
        [Tooltip("The police cruiser prefab (Southbound > Cars: police).")]
        public GameObject cruiser;
        [Tooltip("The officer (Art/Models/people/mh_cop.glb) and the animation skeleton (anims/ual.glb).")]
        public GameObject officer, skeleton;
        [Tooltip("Officers' gunshot (optional; the player's shot sound is used if empty).")]
        public AudioClip gunshot;
        public float sightOfficer = 75f, sightCruiser = 90f;

        public static Police Instance { get; private set; }
        public readonly Wanted Wanted = new Wanted();
        public int Stars => Wanted.Stars;

        /// <summary>Report a crime to the law (from anywhere: shops, missions, the car code).</summary>
        public static void Crime(string kind) { if (Instance != null) Instance.Report(kind); }

        enum Mode { Idle, Drive, Stopped, Leave }
        sealed class Cop { public GameObject go; public Retargeter rt; public Health hp; public bool outside; public float y = float.NaN, shotT, stuckT; }
        sealed class Unit
        {
            public GameObject go; public CarController cc; public CarBody body; public CarHealth health; public AudioSource siren;
            public readonly List<int> route = new List<int>(); public int leg; public float s, v, y = float.NaN, rerouteT, wheelAngle, stillT, goalS; public int goalLane;
            public readonly Cop[] cops = new Cop[2]; public Mode mode;
        }
        readonly List<Unit> units = new List<Unit>();

        SouthboundGame game; Traffic traffic; Pedestrians peds; Driving driving; Gunplay gun;
        Vector3 home, lastSeen;
        bool provoked; float spawnT, brandishT, bustT, resistT;
        string banner; float bannerUntil, pendingUntil; System.Action pending;
        string prompt;
        AudioClip sirenClip;
        bool warned;
        Transform range;   // the penetration range by the spawn: shooting there is allowed

        void Awake() => Instance = this;

        void OnEnable() { Health.Hurt += OnHurt; Gunplay.Fired += OnShot; Hud.Sources.Add(Blips); }
        void OnDisable() { Health.Hurt -= OnHurt; Gunplay.Fired -= OnShot; Hud.Sources.Remove(Blips); }

        /// <summary>What an officer near you is saying (null if nothing).</summary>
        public string Prompt => pending == null ? prompt : null;
        /// <summary>BUSTED or WASTED while it's showing, else null.</summary>
        public string Banner => banner != null && Time.unscaledTime < bannerUntil ? banner : null;

        /// <summary>Cruisers on the minimap (flashing red and blue, kept on its edge), officers on foot.</summary>
        void Blips(List<Hud.Blip> into)
        {
            bool red = Mathf.Repeat(Time.time, 0.5f) < 0.25f;
            foreach (var u in units)
            {
                if (u.mode != Mode.Drive && u.mode != Mode.Stopped) continue;
                into.Add(new Hud.Blip { at = u.go.transform.position, color = red ? new Color(0.95f, 0.2f, 0.2f) : new Color(0.25f, 0.45f, 1f), size = 12, keepOnEdge = true });
                foreach (var c in u.cops)
                    if (c != null && c.outside && !c.hp.Dead) into.Add(new Hud.Blip { at = c.go.transform.position, color = new Color(0.9f, 0.3f, 0.3f), size = 7 });
            }
        }

        void Start()
        {
            game = SouthboundGame.Instance != null ? SouthboundGame.Instance : FindAnyObjectByType<SouthboundGame>();
            traffic = FindAnyObjectByType<Traffic>();
            peds = FindAnyObjectByType<Pedestrians>();
            driving = game != null && game.driving != null ? game.driving : FindAnyObjectByType<Driving>();
            gun = game != null && game.gunplay != null ? game.gunplay : FindAnyObjectByType<Gunplay>();
            if (game != null && game.player != null) home = game.player.transform.position;
            if (gunshot == null && gun != null) gunshot = gun.shotClip;
            var r = GameObject.Find("Penetration range");
            if (r != null) range = r.transform;
            sirenClip = MakeSiren();
            Wanted.Escaped += (most, kills) => { if (game != null) game.Toast(most >= 3 ? "You lost the police. Lie low for a while." : "You lost the police."); };
        }

        // ------------------------------------------------------------------ crimes
        Transform Player => game != null && game.player != null ? game.player.transform : null;
        CarController PlayerCar => driving != null ? driving.Car : null;
        Vector3 PlayerPos => PlayerCar != null ? PlayerCar.transform.position : Player != null ? Player.position : transform.position;
        bool OnFoot => PlayerCar == null;
        bool GunOut => OnFoot && gun != null && gun.enabled && gun.Drawn && gun.Weapon != null && !gun.Weapon.Melee;
        float PlayerSpeed => PlayerCar != null ? Mathf.Abs(PlayerCar.ForwardSpeed) : game != null && game.player != null ? game.player.Speed : 0;

        void Report(string kind)
        {
            if (pending != null) return;
            int before = Wanted.Stars;
            Wanted.Crime(kind, PoliceNear(PlayerPos, 60f));
            if (Wanted.Stars > before)
            {
                lastSeen = PlayerPos;
                if (game != null) game.Toast(Wanted.Stars == 1 ? "Wanted by the police" : $"Wanted: {Wanted.Stars} stars");
            }
        }

        void OnHurt(Health h, bool killed)
        {
            if (h == null || pending != null) return;
            if (h.role == "cop") { provoked = true; Report(killed ? "copKill" : "copShot"); }
            else if (h.role == "civilian" && Witnessed(h.transform.position, 45f)) Report(killed ? "kill" : "assault");
        }

        void OnShot(Vector3 at, bool silenced)
        {
            if (range != null && (at - range.position).sqrMagnitude < 45f * 45f) return;
            if (Witnessed(at, silenced ? 8f : 60f)) Report("shots");
        }

        /// <summary>Did anyone see or hear it: a townsperson nearby, or the police?</summary>
        bool Witnessed(Vector3 at, float radius)
        {
            foreach (var p in Pedestrians.Positions) if ((p - at).sqrMagnitude < radius * radius) return true;
            return PoliceNear(at, Mathf.Max(radius, sightOfficer));
        }

        bool PoliceNear(Vector3 at, float r)
        {
            foreach (var u in units)
            {
                if (u.mode == Mode.Idle) continue;
                if ((u.go.transform.position - at).sqrMagnitude < r * r) return true;
                foreach (var c in u.cops) if (c != null && c.outside && !c.hp.Dead && (c.go.transform.position - at).sqrMagnitude < r * r) return true;
            }
            return false;
        }

        // ------------------------------------------------------------------ the frame
        void Update()
        {
            float dt = Time.deltaTime;
            prompt = null;
            if (pending != null)
            {
                if (Time.unscaledTime >= pendingUntil) { var p = pending; pending = null; p(); }
                return;
            }
            if (game == null || Player == null) return;
            if (game.Health <= 0) { Wasted(); return; }
            if (dt <= 0) return;
            var pp = PlayerPos;
            bool seen = Sees(pp);
            if (seen) lastSeen = pp;
            Wanted.Update(dt, seen);
            if (Wanted.Stars == 0) provoked = false;

            // pointing a gun at an officer
            brandishT -= dt;
            if (gun != null && gun.Aiming && brandishT <= 0 && NearestCop(pp, out _) < 20f) { Report("brandish"); brandishT = 5f; }

            // more cruisers as the stars go up (fewer on built-in graphics)
            int want = Wanted.CarsPerStar[Mathf.Clamp(Wanted.Stars, 0, 5)];
            if (PerformanceTier.Budget.Tier == Tier.Integrated) want = Mathf.Min(want, 3);
            int active = 0;
            foreach (var u in units) if ((u.mode == Mode.Drive || u.mode == Mode.Stopped) && (u.health == null || !u.health.State.Wrecked)) active++;
            spawnT -= dt;
            if (active < want && spawnT <= 0) { Spawn(pp); spawnT = 3.5f; }

            foreach (var u in units) Step(u, dt, pp);
            Arrest(dt, pp);
        }

        /// <summary>Do the police have you: an officer or a cruiser with you in sight (or right next to you)?</summary>
        bool Sees(Vector3 pp)
        {
            if (Wanted.Stars == 0) return false;
            var head = pp + Vector3.up * 1.5f;
            var target = PlayerCar != null ? PlayerCar.transform : Player;
            foreach (var u in units)
            {
                if (u.mode != Mode.Drive && u.mode != Mode.Stopped) continue;
                var at = u.go.transform.position + Vector3.up * (u.cc != null ? u.cc.roof + 0.4f : 1.8f);
                float d = Vector3.Distance(at, head);
                if (d < 20f || (d < sightCruiser && Clear(at, head, target))) return true;
                foreach (var c in u.cops)
                {
                    if (c == null || !c.outside || c.hp.Dead) continue;
                    var eye = c.go.transform.position + Vector3.up * 1.6f;
                    float dc = Vector3.Distance(eye, head);
                    if (dc < 12f || (dc < sightOfficer && Clear(eye, head, target))) return true;
                }
            }
            return false;
        }

        static bool Clear(Vector3 from, Vector3 to, Transform target) =>
            !Physics.Linecast(from, to, out var hit, ~0, QueryTriggerInteraction.Ignore) || (target != null && hit.collider.transform.IsChildOf(target));

        float NearestCop(Vector3 pp, out Cop nearest)
        {
            float best = float.MaxValue; nearest = null;
            foreach (var u in units)
                foreach (var c in u.cops)
                {
                    if (c == null || !c.outside || c.hp.Dead) continue;
                    float d = Vector3.Distance(c.go.transform.position, pp);
                    if (d < best) { best = d; nearest = c; }
                }
            return best;
        }

        // ------------------------------------------------------------------ cruisers
        void Spawn(Vector3 pp)
        {
            if (cruiser == null || traffic == null || !traffic.Ready)
            {
                if (!warned) { Debug.LogWarning("Southbound: no police cruiser prefab or no traffic lanes: the police can't come."); warned = true; }
                return;
            }
            if (!traffic.RandomPoint(pp, 120f, 180f, out int lane, out float s) && !traffic.RandomPoint(pp, 60f, 260f, out lane, out s)) return;
            Unit u = null;
            foreach (var o in units) if (o.mode == Mode.Idle) { u = o; break; }
            if (u == null) { u = Create(); if (u == null) return; units.Add(u); }
            u.route.Clear(); u.route.Add(lane); u.leg = 0; u.s = s; u.y = float.NaN; u.rerouteT = 0; u.stillT = 0;
            u.v = traffic.laneSpeed[lane];
            u.mode = Mode.Drive;
            u.go.SetActive(true);
            if (u.health != null) u.health.Restore(1);
            foreach (var c in u.cops) Reset(c);
            Board(u);
            if (u.body != null) u.body.Siren = true;
            if (u.siren != null && !u.siren.isPlaying) u.siren.Play();
            Pose(u, 0);
        }

        Unit Create()
        {
            var go = Instantiate(cruiser, transform);
            go.name = "police cruiser";
            var rb = go.GetComponent<Rigidbody>();
            if (rb != null) { rb.isKinematic = true; rb.interpolation = RigidbodyInterpolation.None; }
            var cc = go.GetComponent<CarController>();
            if (cc != null) cc.enabled = false;
            var u = new Unit { go = go, cc = cc, body = go.GetComponent<CarBody>(), health = cc != null ? CarHealth.Of(cc) : null };
            var src = go.AddComponent<AudioSource>();
            src.clip = sirenClip; src.loop = true; src.spatialBlend = 1; src.minDistance = 10; src.maxDistance = 300; src.volume = 0.55f; src.dopplerLevel = 0.6f;
            u.siren = src;
            for (int i = 0; i < 2; i++) u.cops[i] = MakeCop(go.transform, i);
            return u;
        }

        Cop MakeCop(Transform car, int i)
        {
            if (officer == null || skeleton == null) return null;
            var root = new GameObject(i == 0 ? "officer (driver)" : "officer");
            root.transform.SetParent(transform, false);
            var model = Instantiate(officer, root.transform);
            var skel = Instantiate(skeleton, root.transform);
            var rt = root.AddComponent<Retargeter>();
            rt.sourceRoot = skel.transform; rt.targetRoot = model.transform; rt.startClip = i == 0 ? "Driving_Loop" : "Idle_Loop";
            var cap = root.AddComponent<CapsuleCollider>();
            cap.center = new Vector3(0, 0.9f, 0); cap.height = 1.8f; cap.radius = 0.3f;
            var hp = root.AddComponent<Health>();
            hp.role = "cop"; hp.armour = 2; hp.feet = 0; hp.headHeight = 1.6f;
            return new Cop { go = root, rt = rt, hp = hp };
        }

        static void Reset(Cop c)
        {
            if (c == null) return;
            c.hp.hp = 100; c.hp.lastPart = null; c.outside = false; c.y = float.NaN; c.shotT = Random.Range(0.6f, 1.4f); c.stuckT = 0;
            c.rt.Revive();
        }

        /// <summary>Both officers in the car: the driver at the wheel (seen through the glass), the partner out of sight.</summary>
        void Board(Unit u)
        {
            var driver = u.cops[0];
            if (driver != null && !driver.hp.Dead)
            {
                driver.outside = false;
                driver.go.SetActive(true);
                if (u.cc != null && Seating.HasCabin(u.go.transform)) Seating.Sit(driver.go.transform, u.cc, driver.rt);
                else driver.go.SetActive(false);
            }
            var partner = u.cops[1];
            if (partner != null && !partner.hp.Dead) { partner.outside = false; partner.go.SetActive(false); }
        }

        /// <summary>Out of the car on both sides.</summary>
        void Deploy(Unit u)
        {
            u.mode = Mode.Stopped;
            for (int i = 0; i < 2; i++)
            {
                var c = u.cops[i];
                if (c == null || c.hp.Dead) continue;
                c.go.transform.SetParent(transform, true);
                float side = (i == 0 ? -1 : 1) * ((u.cc != null ? u.cc.width : 1.9f) / 2 + 0.6f);
                var at = u.go.transform.TransformPoint(new Vector3(side, 0, 0.3f));
                at.y = Pedestrians.Ground(at + Vector3.up * 2f, 6f, at.y);
                c.go.transform.SetPositionAndRotation(at, Quaternion.Euler(0, u.go.transform.eulerAngles.y, 0));
                c.go.SetActive(true);
                c.outside = true; c.y = at.y;
                c.rt.Revive();
            }
        }

        void Step(Unit u, float dt, Vector3 pp)
        {
            if (u.mode == Mode.Idle) return;
            var me = u.go.transform.position;
            float far = Vector3.Distance(me, pp);
            bool anyAlive = false;
            foreach (var c in u.cops) if (c != null && !c.hp.Dead) anyAlive = true;

            // the cruiser wrecked or burning: everyone out, and it stays put
            bool dead = u.health != null && u.health.State.Wrecked;
            if (dead && u.mode == Mode.Drive) { Deploy(u); if (u.siren != null) u.siren.Stop(); }
            // the driver shot at the wheel: the partner gets out
            if (u.mode == Mode.Drive && u.cops[0] != null && u.cops[0].hp.Dead && u.cops[1] != null && !u.cops[1].hp.Dead) Deploy(u);
            if (Wanted.Stars == 0 && (u.mode == Mode.Drive || u.mode == Mode.Stopped)) { u.mode = Mode.Leave; if (u.body != null) u.body.Siren = false; if (u.siren != null) u.siren.Stop(); }
            // gone: too far off, or abandoned (both officers down) once you're away from it
            var cam = Camera.main != null ? Camera.main.transform.position : pp;
            float camD = Vector3.Distance(me, cam);
            if ((u.mode == Mode.Leave && camD > 160f) || ((!anyAlive || dead) && camD > 120f) || camD > 400f) { Retire(u); return; }

            if (u.mode == Mode.Stopped)
            {
                if (u.body != null) u.body.Brake = 1;
                bool getaway = !dead && (!OnFoot ? far > 40f && PlayerSpeed > 4f : far > 70f);   // a wrecked cruiser isn't going anywhere
                bool allIn = true;
                foreach (var c in u.cops)
                {
                    if (c == null || c.hp.Dead || !c.outside) continue;
                    if (getaway) { if (!Return(u, c, dt)) allIn = false; }
                    else { Officer(u, c, dt, pp); allIn = false; }
                }
                if (getaway && allIn && anyAlive) { u.mode = Mode.Drive; u.rerouteT = 0; Board(u); }
                return;
            }
            if (u.mode == Mode.Leave && dead)
            {
                foreach (var c in u.cops) if (c != null && c.outside && !c.hp.Dead) c.rt.Loop("Idle_Loop", 1);
                return;
            }
            if (u.mode == Mode.Leave)
            {
                bool allIn = true;
                bool wasOut = false;
                foreach (var c in u.cops) if (c != null && !c.hp.Dead && c.outside) { wasOut = true; if (!Return(u, c, dt)) allIn = false; }
                if (!allIn) return;
                if (wasOut) Board(u);
            }
            if (!anyAlive) return;
            Drive(u, dt, pp, far);
        }

        void Retire(Unit u)
        {
            u.mode = Mode.Idle;
            if (u.siren != null) u.siren.Stop();
            if (u.body != null) u.body.Siren = false;
            foreach (var c in u.cops) if (c != null) { c.go.transform.SetParent(transform, false); c.go.SetActive(false); c.outside = false; }
            u.go.SetActive(false);
        }

        void Drive(Unit u, float dt, Vector3 pp, float far)
        {
            bool chasing = u.mode == Mode.Drive;
            var goal = Wanted.Lost ? lastSeen : pp;
            int lane = u.route[u.leg];
            // a fresh route every couple of seconds (you move): the shortest way over the lanes to you
            u.rerouteT -= dt;
            if (u.rerouteT <= 0)
            {
                u.rerouteT = chasing ? 2.5f : 1e9f;
                if (chasing)
                {
                    int to = traffic.NearestLane(goal, out u.goalS);
                    u.goalLane = to;
                    var r = LaneRoute.Find(traffic.nextStart, traffic.next, traffic.laneLength, lane, to);
                    u.route.Clear();
                    if (r.Count > 0) u.route.AddRange(r); else u.route.Add(lane);
                    u.leg = 0;
                }
            }
            bool lastLeg = u.leg >= u.route.Count - 1;
            float endS = traffic.laneLength[lane];
            if (lastLeg && chasing && lane == u.goalLane && (u.route.Count > 1 || u.goalS > u.s)) endS = u.goalS;
            // speed: fast on the way, easing in to stop near you; behind whatever's in front
            float top = Mathf.Clamp(traffic.laneSpeed[lane] * 1.5f, 13f, 30f);
            if (!chasing) top = traffic.laneSpeed[lane];
            float want = top;
            if (chasing && lastLeg) want = Mathf.Clamp((endS - u.s - 6f) * 1.2f, 0, top);
            var fwd = u.go.transform.forward;
            if (Physics.SphereCast(u.go.transform.position + Vector3.up * 0.8f + fwd * 2.6f, 0.9f, fwd, out var hit, 30f, ~0, QueryTriggerInteraction.Ignore)
                && !hit.collider.transform.IsChildOf(u.go.transform) && hit.normal.y < 0.6f && hit.collider.GetComponentInParent<Health>() == null)
                want = Mathf.Min(want, Mathf.Max(0, (hit.distance - 4f) * 1.5f));
            u.v = want < u.v ? Mathf.MoveTowards(u.v, want, 9f * dt) : Mathf.MoveTowards(u.v, want, 4.5f * dt);
            u.s += u.v * dt;
            if (u.s > traffic.laneLength[lane])
            {
                float over = u.s - traffic.laneLength[lane];
                if (u.leg + 1 < u.route.Count) { u.leg++; u.s = over; }
                else
                {
                    int n0 = traffic.nextStart[lane], n1 = traffic.nextStart[lane + 1];
                    if (n1 > n0) { u.route.Clear(); u.route.Add(traffic.next[Random.Range(n0, n1)]); u.leg = 0; u.s = over; }
                    else u.s = traffic.laneLength[lane];
                }
            }
            Pose(u, dt);
            if (u.body != null) { u.body.Brake = want < u.v - 0.5f ? 1 : 0; u.body.HeadlightsOn = DayNight.Night > 0.35f || chasing; }
            // pull up and get out: close to you and stopped (or you've stopped your car)
            if (chasing)
            {
                u.stillT = u.v < 1f ? u.stillT + dt : 0;
                bool close = far < (OnFoot ? 28f : 18f) && (OnFoot || PlayerSpeed < 3f);
                bool stoppedThere = OnFoot || PlayerSpeed < 3f;
                // or as near as the roads go (you're off in a field or a yard): they get out and come on foot
                if (close && u.v < 2f || stoppedThere && u.stillT > 1.5f && (far < 45f || lastLeg && far < 150f)) Deploy(u);
            }
        }

        void Pose(Unit u, float dt)
        {
            int lane = u.route[u.leg];
            var (at, dir) = traffic.Sample(lane, u.s);
            var (ahead, _) = traffic.Sample(lane, u.s + 3f);
            var look = ahead - at; if (look.sqrMagnitude < 1e-4f) look = dir;
            if (look.sqrMagnitude < 1e-6f) look = Vector2.up;
            float yFront = Ground(at + look.normalized * 1.4f, u.y), yBack = Ground(at - look.normalized * 1.4f, u.y);
            float y = (yFront + yBack) / 2;
            u.y = float.IsNaN(u.y) || dt <= 0 ? y : Mathf.Lerp(u.y, y, Mathf.Clamp01(dt * 12));
            var rot = Quaternion.LookRotation(new Vector3(look.x, (yFront - yBack) / 2.8f * look.magnitude, look.y));
            u.go.transform.SetPositionAndRotation(new Vector3(at.x, u.y + 0.02f, at.y), dt <= 0 ? rot : Quaternion.Slerp(u.go.transform.rotation, rot, Mathf.Clamp01(dt * 8)));
            if (u.cc != null && u.cc.wheels != null)
            {
                u.wheelAngle += u.v * dt / Mathf.Max(0.2f, u.cc.wheelRadius) * Mathf.Rad2Deg;
                foreach (var wh in u.cc.wheels) if (wh != null) wh.localRotation = Quaternion.Euler(u.wheelAngle, 0, 0);
            }
        }

        static float Ground(Vector2 at, float near)
        {
            float from = float.IsNaN(near) ? 400 : near + 3f, reach = float.IsNaN(near) ? 800 : 10;
            return Pedestrians.Ground(new Vector3(at.x, from, at.y), reach, float.IsNaN(near) ? 0 : near);
        }

        // ------------------------------------------------------------------ officers on foot
        void Officer(Unit u, Cop c, float dt, Vector3 pp)
        {
            var t = c.go.transform;
            var me = t.position;
            // a car driven into them
            if (CarHits(me)) { c.hp.Damage(1000); return; }
            var target = PlayerCar != null ? PlayerCar.transform : Player;
            var aimAt = pp + Vector3.up * (PlayerCar != null ? 1.0f : 1.25f);
            float d = Vector3.Distance(new Vector3(me.x, 0, me.z), new Vector3(pp.x, 0, pp.z));
            bool lethal = Wanted.Lethal(GunOut, provoked);
            var eye = me + Vector3.up * 1.55f;
            bool los = d < sightOfficer && Clear(eye, aimAt, target);
            if (lethal)
            {
                // close in to pistol range with a clear shot, then stand and fire
                if (d > 16f || !los) Move(c, pp, 4.4f, dt, "Jog_Fwd_Loop");
                else
                {
                    Face(t, pp, dt);
                    c.rt.Loop(c.rt.Has("Pistol_Aim_Neutral") ? "Pistol_Aim_Neutral" : "Idle_Loop", 1);
                    c.shotT -= dt;
                    if (c.shotT <= 0) { c.shotT = Random.Range(0.75f, 1.5f); Shoot(c, d, eye, aimAt); }
                }
            }
            else
            {
                // come and arrest you: run over, then walk the last few metres
                if (d > 1.7f) Move(c, pp, d > 6f ? 4.2f : 1.4f, dt, d > 6f ? "Jog_Fwd_Loop" : "Walk_Loop");
                else { Face(t, pp, dt); c.rt.Loop("Idle_Loop", 1); }
            }
        }

        /// <summary>Walk or run towards a point over the ground, sidestepping walls.</summary>
        void Move(Cop c, Vector3 to, float speed, float dt, string clip)
        {
            var t = c.go.transform;
            var p = t.position;
            var dir = new Vector3(to.x - p.x, 0, to.z - p.z);
            if (dir.sqrMagnitude < 1e-4f) return;
            dir.Normalize();
            // blocked straight ahead (a wall, a car): try angling off
            var chest = p + Vector3.up * 1.0f;
            if (Physics.SphereCast(chest, 0.25f, dir, out var hit, 1.2f, ~0, QueryTriggerInteraction.Ignore) && !hit.collider.transform.IsChildOf(t) && hit.normal.y < 0.6f
                && hit.collider.GetComponentInParent<Health>() == null && !IsPlayer(hit.collider.transform))
            {
                c.stuckT += dt;
                float side = (Mathf.FloorToInt(c.stuckT / 2f) % 2 == 0) ? 1 : -1;
                foreach (var a in new[] { 45f, 90f, 135f })
                {
                    var alt = Quaternion.Euler(0, a * side, 0) * dir;
                    if (!Physics.SphereCast(chest, 0.25f, alt, out _, 1.2f, ~0, QueryTriggerInteraction.Ignore)) { dir = alt; break; }
                }
            }
            else c.stuckT = 0;
            p += dir * speed * dt;
            float y = Pedestrians.Ground(new Vector3(p.x, (float.IsNaN(c.y) ? p.y : c.y) + 1.6f, p.z), 6f, float.IsNaN(c.y) ? p.y : c.y);
            c.y = float.IsNaN(c.y) ? y : Mathf.Lerp(c.y, y, Mathf.Clamp01(dt * 14));
            t.position = new Vector3(p.x, c.y, p.z);
            t.rotation = Quaternion.Slerp(t.rotation, Quaternion.LookRotation(dir), Mathf.Clamp01(dt * 10));
            c.rt.Loop(clip, speed / (speed > 3 ? 4f : 1.5f));
        }

        bool IsPlayer(Transform x) => (Player != null && x.IsChildOf(Player)) || (PlayerCar != null && x.IsChildOf(PlayerCar.transform));

        static void Face(Transform t, Vector3 at, float dt)
        {
            var d = new Vector3(at.x - t.position.x, 0, at.z - t.position.z);
            if (d.sqrMagnitude > 1e-4f) t.rotation = Quaternion.Slerp(t.rotation, Quaternion.LookRotation(d), Mathf.Clamp01(dt * 10));
        }

        /// <summary>Walk back to the cruiser's door; true once aboard.</summary>
        bool Return(Unit u, Cop c, float dt)
        {
            var door = u.go.transform.position;
            var cam = Camera.main != null ? Camera.main.transform.position : door;
            if (Vector3.Distance(c.go.transform.position, door) < 3f || Vector3.Distance(c.go.transform.position, cam) > 60f) { c.outside = false; c.go.SetActive(false); return true; }
            Move(c, door, 3.6f, dt, "Jog_Fwd_Loop");
            return false;
        }

        void Shoot(Cop c, float d, Vector3 from, Vector3 at)
        {
            c.rt.Play("Pistol_Shoot", 0.05f);
            if (gunshot != null) AudioSource.PlayClipAtPoint(gunshot, from, 1f);
            if (peds != null) peds.Panic(from, 50f);
            // hard to hit at range, on the move, or behind a car door
            float chance = Mathf.Clamp(0.5f - d * 0.012f, 0.12f, 0.5f);
            if (PlayerSpeed > 4f) chance *= 0.6f;
            if (!OnFoot) chance *= 0.7f;
            if (Random.value > chance) return;
            float dmg = OnFoot ? Random.Range(12f, 22f) : Random.Range(7f, 13f);
            game.Health -= dmg;
        }

        bool CarHits(Vector3 p)
        {
            var car = PlayerCar;
            if (car == null || Mathf.Abs(car.ForwardSpeed) < 4f) return false;
            var local = car.transform.InverseTransformPoint(p + Vector3.up * 0.9f);
            return Mathf.Abs(local.x) < car.width / 2 + 0.3f && Mathf.Abs(local.z) < car.length / 2 + 0.3f && local.y > -0.5f && local.y < car.roof + 0.5f;
        }

        // ------------------------------------------------------------------ busted, wasted
        void Arrest(float dt, Vector3 pp)
        {
            float near = NearestCop(pp, out _);
            bool can = Wanted.CanArrest(OnFoot, GunOut, PlayerSpeed, near);
            if (Wanted.Stars > 0 && near < 6f && !Wanted.Lethal(GunOut, provoked))
                prompt = GunOut ? "Police: \"Put the gun away!\"" : can ? "Stand still to give yourself up, or run" : "Police: \"Stop right there!\"";
            // running from an officer at arm's length is resisting
            resistT -= dt;
            if (Wanted.Stars > 0 && near < 4f && PlayerSpeed > 4.5f && OnFoot && resistT <= 0) { Report("resist"); resistT = 8f; }
            bustT = can ? bustT + dt : 0;
            if (bustT > 1.5f) Busted();
        }

        void Busted()
        {
            bustT = 0;
            int fine = 250 * Mathf.Max(1, Wanted.MaxStars);
            Show("BUSTED", 3f, () =>
            {
                double paid = System.Math.Min(game.Profile.Money, fine);
                game.Profile.Money -= paid;
                Release();
                game.Toast($"Released. Fined ${paid:N0}.", 4f);
            });
            if (game.player != null) game.player.enabled = false;
        }

        void Wasted()
        {
            var car = PlayerCar;
            if (car != null) driving.Exit(true);
            if (game.player != null)
            {
                game.player.enabled = false;
                if (game.player.animator != null) game.player.animator.Play("Death01");
            }
            Time.timeScale = 0.35f;
            Show("WASTED", 3.5f, () =>
            {
                if (Time.timeScale > 0.3f && Time.timeScale < 0.4f) Time.timeScale = 1;
                if (game.player != null && game.player.animator != null) game.player.animator.Revive();
                game.Health = game.Needs.MaxHealth;
                double bill = System.Math.Min(game.Profile.Money, 500);
                game.Profile.Money -= bill;
                Release();
                game.Toast($"Hospital bill: ${bill:N0}", 4f);
            });
        }

        void Show(string text, float seconds, System.Action then)
        {
            banner = text; bannerUntil = Time.unscaledTime + seconds; pendingUntil = bannerUntil; pending = then;
        }

        /// <summary>Back on your feet at the spawn, the slate wiped, the police gone home.</summary>
        void Release()
        {
            Wanted.Clear(); provoked = false; bustT = 0;
            foreach (var u in units) if (u.mode != Mode.Idle) Retire(u);
            var p = game.player;
            if (p != null)
            {
                var ch = p.GetComponent<CharacterController>();
                if (ch != null) ch.enabled = false;
                p.transform.position = home;
                if (ch != null) ch.enabled = true;
                p.enabled = true;
            }
        }

        // ------------------------------------------------------------------ the stars (without the HUD)
        void OnGUI()
        {
            if (Hud.Showing) return;
            var star = HudArt.Star;
            if (Wanted.Stars > 0)
            {
                float size = 30, gap = 4, x0 = Screen.width - 18 - 5 * (size + gap);
                bool blink = Wanted.Lost && Mathf.Repeat(Time.unscaledTime, 0.8f) < 0.4f;
                for (int i = 0; i < 5; i++)
                {
                    bool on = i < Wanted.Stars;
                    GUI.color = on ? (blink ? new Color(1, 1, 1, 0.35f) : new Color(1f, 0.93f, 0.75f, 1)) : new Color(0, 0, 0, 0.35f);
                    GUI.DrawTexture(new Rect(x0 + i * (size + gap), 18, size, size), star);
                }
                GUI.color = Color.white;
            }
            var s = new GUIStyle(GUI.skin.label) { fontSize = 16, fontStyle = FontStyle.Bold, alignment = TextAnchor.MiddleCenter };
            s.normal.textColor = new Color(0.95f, 0.92f, 0.85f);
            if (prompt != null && pending == null) GUI.Label(new Rect(Screen.width / 2f - 300, Screen.height - 180, 600, 30), prompt, s);
            if (banner != null && Time.unscaledTime < bannerUntil)
            {
                var b = new GUIStyle(s) { fontSize = 64 };
                b.normal.textColor = banner == "WASTED" ? new Color(0.85f, 0.1f, 0.08f) : new Color(0.95f, 0.9f, 0.8f);
                GUI.color = new Color(0, 0, 0, 0.45f);
                GUI.DrawTexture(new Rect(0, Screen.height / 2f - 60, Screen.width, 120), Texture2D.whiteTexture);
                GUI.color = Color.white;
                GUI.Label(new Rect(0, Screen.height / 2f - 60, Screen.width, 120), banner, b);
            }
        }

        // ------------------------------------------------------------------ made here: the siren
        /// <summary>A wail: up over two seconds and back down, a slightly square tone like a real electronic siren.</summary>
        static AudioClip MakeSiren()
        {
            const int rate = 22050; const float len = 4f;
            int n = (int)(rate * len);
            var data = new float[n];
            double phase = 0;
            for (int i = 0; i < n; i++)
            {
                float t = i / (float)rate;
                float u = t < len / 2 ? t / (len / 2) : (len - t) / (len / 2);
                float f = 640f + 700f * Mathf.SmoothStep(0, 1, u);
                phase += 2 * System.Math.PI * f / rate;
                data[i] = 0.32f * (float)(System.Math.Sin(phase) + 0.28 * System.Math.Sin(3 * phase) + 0.12 * System.Math.Sin(5 * phase));
            }
            var clip = AudioClip.Create("siren", n, 1, rate, false);
            clip.SetData(data, 0);
            return clip;
        }
    }
}
