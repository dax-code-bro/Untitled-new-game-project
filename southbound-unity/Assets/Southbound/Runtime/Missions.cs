// The story, side jobs and work shifts in Calvera (Core/Missions has the rules and the data from the web game).
// The next story mission's contact waits near where it starts (a person you walk up to: "F  start ..."), open
// side jobs and the job boards are on the minimap; the mission's marker is a glowing column (and a dot kept
// on the minimap's rim), cars to take are parked at the kerb, targets come at you and shoot, "lose the police"
// raises your stars. Shifts spawn the work vehicle by the board, draw their stops the web game's way (snapped
// to the roads here), pay per stop and a bonus for time left, and level you up every three shifts.
using System.Collections.Generic;
using System.Linq;
using Southbound.Core;
using UnityEngine;

namespace Southbound
{
    public sealed class Missions : MonoBehaviour, IMissionWorld
    {
        [Tooltip("Data/World/calvera-missions.json, copied into the project (MissionBuilder).")]
        public TextAsset data;
        [Tooltip("Car prefabs for the cars missions and jobs use, by catalogue id.")]
        public GameObject[] carPrefabs;
        public string[] carIds;
        [Tooltip("People for contacts and targets, and the animation skeleton.")]
        public GameObject[] people;
        public GameObject skeleton;
        [Tooltip("The marker column (a glowing, see-through material).")]
        public Material markerMaterial;

        public static Missions Instance { get; private set; }
        public MissionData Data { get; private set; } = new MissionData();
        /// <summary>The objective line for the HUD, or null.</summary>
        public string Objective { get; private set; }
        public string Prompt { get; private set; }
        public bool Busy => runner.Active != null || shift != null;

        readonly MissionRunner runner = new MissionRunner();
        JobShift shift; CarController jobCar; Vector3 jobBoard; GameObject bounty; Health bountyHp;
        SouthboundGame game; Driving driving; Traffic traffic;
        GameObject marker, giver; Retargeter giverRt; Mission giverFor; Vector3 giverAt; bool giverPlaced;
        CarController missionCar;
        sealed class Foe { public GameObject go; public Retargeter rt; public Health hp; public float y = float.NaN, gunT = 1; }
        readonly List<Foe> foes = new List<Foe>();
        readonly Dictionary<string, Vector3> sideAt = new Dictionary<string, Vector3>();

        void Awake()
        {
            Instance = this;
            if (data != null) Data = MissionData.Parse(data.text);
            runner.Completed += (m, reward) =>
            {
                var p = game.Profile;
                if (m.Side) { if (!p.SideDone.Contains(m.Id)) p.SideDone.Add(m.Id); }
                else if (!p.MissionsDone.Contains(m.Id)) p.MissionsDone.Add(m.Id);
                CleanUp(); giverPlaced = false; game.Save();
            };
            runner.Failed += (m, why) => { CleanUp(); giverPlaced = false; };
        }

        void OnEnable() => Hud.Sources.Add(Blips);
        void OnDisable() => Hud.Sources.Remove(Blips);

        void Start()
        {
            game = SouthboundGame.Instance != null ? SouthboundGame.Instance : FindAnyObjectByType<SouthboundGame>();
            driving = game != null && game.driving != null ? game.driving : FindAnyObjectByType<Driving>();
            traffic = FindAnyObjectByType<Traffic>();
        }

        static Vector3 U(double x, double z) { var (ux, uz) = CalveraWorld.ToUnity(x, z); return new Vector3((float)ux, 0, (float)uz); }
        static Vector3 OnGround(Vector3 p) { p.y = Pedestrians.Ground(new Vector3(p.x, 400, p.z), 800, 0); return p; }
        Vector3 PlayerPos => driving != null && driving.Car != null ? driving.Car.transform.position : game.player != null ? game.player.transform.position : Vector3.zero;

        void Update()
        {
            Objective = null; Prompt = null;
            if (game == null || game.player == null || StoreScreen.Showing) return;
            float dt = Time.deltaTime;
            if (runner.Active != null) { Objective = runner.Update(dt, this); Think(dt); MarkerFollow(); return; }
            if (shift != null) { Shift(dt); Think(dt); return; }
            Contacts(dt);
            Boards();
        }

        // ------------------------------------------------------------------ contacts
        void Contacts(float dt)
        {
            var next = Data.NextStory(game.Profile.MissionsDone);
            var me = game.player.transform.position;
            bool onFoot = driving == null || driving.Car == null;
            if (next != null)
            {
                if (!giverPlaced || giverFor != next) { giverAt = Kerbside(U(Data.Place(next.StartPlace).x, Data.Place(next.StartPlace).z), 30f, 120f); giverFor = next; giverPlaced = true; }
                float d = Vector3.Distance(me, giverAt);
                if (d < 110f && giver == null) { giver = Person(giverAt, Quaternion.identity, next.Who, out giverRt, out _); }
                if (giver != null && d > 130f) { Destroy(giver); giver = null; }
                if (giver != null)
                {
                    var t = giver.transform; var to = me - t.position; to.y = 0;
                    if (d < 9f && to.sqrMagnitude > 0.01f) t.rotation = Quaternion.Slerp(t.rotation, Quaternion.LookRotation(to), Mathf.Clamp01(dt * 3));
                    if (giverRt != null) giverRt.Loop(d < 4f ? "Idle_Talking_Loop" : "Idle_Loop", 1);
                }
                if (onFoot && d < 3f)
                {
                    Prompt = $"F  start \"{next.Title}\" — {next.Who} ({Data.Story.IndexOf(next) + 1}/{Data.Story.Count})";
                    if (SbInput.InteractDown) { runner.Begin(next, this); return; }
                }
            }
            // side jobs: open ones wait near where they start
            foreach (var m in Data.OpenSide(game.Profile.MissionsDone, game.Profile.SideDone))
            {
                if (!sideAt.TryGetValue(m.Id, out var at)) sideAt[m.Id] = at = Kerbside(U(Data.Place(m.StartPlace).x, Data.Place(m.StartPlace).z), 40f, 140f);
                if (!onFoot || Vector3.Distance(me, at) > 3f) continue;
                Prompt = $"F  side job: \"{m.Title}\" — {m.Who} (${m.Reward:N0})";
                if (SbInput.InteractDown) { runner.Begin(m, this); return; }
            }
        }

        /// <summary>A spot on the pavement near a place: a lane point r0..r1 away, stepped off to the side of the road.</summary>
        Vector3 Kerbside(Vector3 near, float r0, float r1)
        {
            if (traffic == null || !traffic.Ready) return OnGround(near);
            if (!traffic.RandomPoint(near, r0, r1, out int lane, out float s)) lane = traffic.NearestLane(near, out s);
            var (at, dir) = traffic.Sample(lane, s);
            var side = new Vector2(dir.y, -dir.x);   // the right of the lane, toward the kerb
            return OnGround(new Vector3(at.x + side.x * 6f, 0, at.y + side.y * 6f));
        }

        // ------------------------------------------------------------------ IMissionWorld
        public (double x, double z) Place(string name) { var p = Data.Place(name); var u = U(p.x, p.z); return (u.x, u.z); }
        public (double x, double z) Me { get { var p = PlayerPos; return (p.x, p.z); } }
        public bool OnFoot => driving == null || driving.Car == null;
        public bool InMissionVehicle => missionCar != null && driving != null && driving.Car == missionCar;
        public bool MissionVehicleWrecked { get { if (missionCar == null) return false; var h = missionCar.GetComponent<CarHealth>(); return h != null && h.State.Health < 0; } }
        public (double x, double z)? MissionVehiclePos => missionCar != null ? ((double)missionCar.transform.position.x, (double)missionCar.transform.position.z) : ((double, double)?)null;
        public double VehicleSpeed => driving != null && driving.Car != null ? driving.Car.ForwardSpeed : 0;
        public int Wanted => Police.Instance != null ? Police.Instance.Stars : 0;
        public int FoesLeft => foes.Count(f => f.hp != null && !f.hp.Dead);
        public bool PlayerDead => game.Health <= 0;

        public void Mark(double x, double z, double r)
        {
            if (marker == null)
            {
                marker = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
                marker.name = "Mission marker";
                Destroy(marker.GetComponent<Collider>());
                var mr = marker.GetComponent<MeshRenderer>();
                if (markerMaterial != null) mr.sharedMaterial = markerMaterial;
                mr.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            }
            var p = OnGround(new Vector3((float)x, 0, (float)z));
            marker.transform.position = p + Vector3.up * 3f;
            marker.transform.localScale = new Vector3((float)r * 2, 3f, (float)r * 2);
            marker.SetActive(true);
        }

        public void Unmark() { if (marker != null) marker.SetActive(false); }

        void MarkerFollow()
        {
            if (runner.Marker is (double x, double z, double r) && marker != null && marker.activeSelf && Mathf.Abs(marker.transform.position.x - (float)x) + Mathf.Abs(marker.transform.position.z - (float)z) > 0.5f) Mark(x, z, r);
        }

        public void SpawnVehicle(string carId, double x, double z)
        {
            var prefab = CarPrefab(carId) ?? CarPrefab("sedan") ?? (carPrefabs != null && carPrefabs.Length > 0 ? carPrefabs[0] : null);
            if (prefab == null) return;
            var at = new Vector3((float)x, 0, (float)z); var rot = Quaternion.identity;
            if (traffic != null && traffic.Ready)
            {
                int lane = traffic.NearestLane(at + new Vector3(-20, 0, 10), out float s);
                var (p, dir) = traffic.Sample(lane, s);
                var side = new Vector2(dir.y, -dir.x);
                at = new Vector3(p.x + side.x * 3f, 0, p.y + side.y * 3f);
                rot = Quaternion.LookRotation(new Vector3(dir.x, 0, dir.y));
            }
            at = OnGround(at) + Vector3.up * 0.4f;
            var go = Instantiate(prefab, at, rot);
            go.name = "mission " + prefab.name;
            missionCar = go.GetComponent<CarController>();
            CarHealth.Of(missionCar);
        }

        GameObject CarPrefab(string id)
        {
            if (id == null || carIds == null) return null;
            for (int i = 0; i < carIds.Length && i < carPrefabs.Length; i++) if (carIds[i] == id) return carPrefabs[i];
            return null;
        }

        public void SpawnFoes(int n, double x, double z)
        {
            for (int i = 0; i < n; i++)
            {
                var at = OnGround(new Vector3((float)x + Random.Range(-10f, 10f), 0, (float)z + Random.Range(-10f, 10f)));
                var go = Person(at, Quaternion.Euler(0, Random.Range(0, 360f), 0), "target", out var rt, out var hp);
                if (go == null) continue;
                hp.role = "foe"; hp.hp = 120;
                foes.Add(new Foe { go = go, rt = rt, hp = hp, gunT = Random.Range(0.8f, 1.7f) });
            }
        }

        public void RaiseWanted(int stars) { if (Police.Instance != null) Police.Instance.Force(stars); }
        public bool Spend(double amount) { if (game.Profile.Money < amount) return false; game.Profile.Money -= amount; return true; }
        public void Earn(double amount) => game.Profile.Money += amount;
        public void Say(string who, string line) => game.Toast($"{who}: {line}", 6f);
        public void Big(string title, string sub) => Hud.Big(title, sub, 3.5f);

        GameObject Person(Vector3 at, Quaternion rot, string name, out Retargeter rt, out Health hp)
        {
            rt = null; hp = null;
            if (people == null || people.Length == 0 || skeleton == null) return null;
            var root = new GameObject(name);
            root.transform.SetParent(transform, false);
            root.transform.SetPositionAndRotation(at, rot);
            var m = Instantiate(people[Mathf.Abs(name.GetHashCode()) % people.Length], root.transform);
            var sk = Instantiate(skeleton, root.transform);
            rt = root.AddComponent<Retargeter>();
            rt.sourceRoot = sk.transform; rt.targetRoot = m.transform; rt.startClip = "Idle_Loop";
            var cap = root.AddComponent<CapsuleCollider>();
            cap.center = new Vector3(0, 0.9f, 0); cap.height = 1.8f; cap.radius = 0.28f;
            hp = root.AddComponent<Health>();
            hp.role = "civilian"; hp.feet = 0; hp.headHeight = 1.55f;
            return root;
        }

        void CleanUp()
        {
            Unmark();
            // the bodies stay a while; the targets still standing walk off (are removed once you're away)
            foreach (var f in foes) if (f.go != null) Destroy(f.go, f.hp != null && f.hp.Dead ? 60f : 0.1f);
            foes.Clear();
            missionCar = null;
        }

        // ------------------------------------------------------------------ targets: close in and shoot (web missions.js foeThink)
        void Think(float dt)
        {
            var target = PlayerPos;
            bool inCar = !OnFoot;
            foreach (var f in foes)
            {
                if (f.go == null || f.hp == null || f.hp.Dead) continue;
                var t = f.go.transform;
                var to = target - t.position; to.y = 0;
                float d = to.magnitude;
                if (to.sqrMagnitude > 0.01f) t.rotation = Quaternion.Slerp(t.rotation, Quaternion.LookRotation(to), Mathf.Clamp01(dt * 6));
                if (d > 60f) { f.rt?.Loop("Idle_Loop", 1); continue; }
                if (d > 12f)
                {
                    var p = t.position + to.normalized * 4.5f * dt;
                    float y = Pedestrians.Ground(new Vector3(p.x, (float.IsNaN(f.y) ? p.y : f.y) + 1.6f, p.z), 6f, float.IsNaN(f.y) ? p.y : f.y);
                    f.y = float.IsNaN(f.y) ? y : Mathf.Lerp(f.y, y, Mathf.Clamp01(dt * 14));
                    t.position = new Vector3(p.x, f.y, p.z);
                    f.rt?.Loop("Jog_Fwd_Loop", 1.1f);
                    continue;
                }
                f.rt?.Loop(f.rt.Has("Pistol_Aim_Neutral") ? "Pistol_Aim_Neutral" : "Idle_Loop", 1);
                f.gunT -= dt;
                if (f.gunT > 0) continue;
                f.gunT = Random.Range(0.8f, 1.7f);
                f.rt?.Play("Pistol_Shoot", 0.05f);
                var gun = Gunplay.Instance;
                if (gun != null && gun.shotClip != null) AudioSource.PlayClipAtPoint(gun.shotClip, t.position + Vector3.up * 1.4f, 0.8f);
                if (Random.value < Mathf.Max(0.12f, 0.55f - d / 40f) * (inCar ? 0.6f : 1f)) game.Health -= Random.Range(5f, 12f);
            }
        }

        // ------------------------------------------------------------------ jobs
        void Boards()
        {
            var me = game.player.transform.position;
            if (!OnFoot) return;
            foreach (var j in Data.Jobs)
            {
                if (!j.Supported) continue;
                var at = U(j.X, j.Z);
                if ((new Vector2(me.x - at.x, me.z - at.z)).sqrMagnitude > 2.5f * 2.5f) continue;
                int level = Level(j.Id);
                Prompt = $"F  work as {j.Name} (level {level} · about ${JobShift.PayBase(j, level) * System.Math.Max(1, j.Stops):N0})";
                if (SbInput.InteractDown) StartShift(j, at);
                return;
            }
        }

        int Level(string id) => game.Profile.Jobs.TryGetValue(id, out var j) ? (int)j[0] : 1;

        void StartShift(JobDef def, Vector3 board)
        {
            var rnd = new System.Random();
            var stops = new List<(double x, double z)>();
            foreach (var (x, z, r0, r1, road) in JobShift.StopDraws(def, Data, rnd))
            {
                var c = U(x, z);
                Vector3 p;
                if (road && traffic != null && traffic.Ready && traffic.RandomPoint(c, (float)r0, (float)System.Math.Max(r1, r0 + 5), out int lane, out float s)) { var (q, _) = traffic.Sample(lane, s); p = new Vector3(q.x, 0, q.y); }
                else { float a = Random.Range(0, Mathf.PI * 2), r = Random.Range((float)r0, (float)r1); p = c + new Vector3(Mathf.Cos(a) * r, 0, Mathf.Sin(a) * r); }
                stops.Add((p.x, p.z));
            }
            shift = new JobShift(def, Level(def.Id), stops);
            jobBoard = board;
            jobCar = null;
            if (def.Kind == "bounty")
            {
                // the fugitive: somewhere in town, armed
                var at = Kerbside(board, 200f, 600f);
                bounty = Person(at, Quaternion.identity, "fugitive", out var rt, out bountyHp);
                if (bounty != null) { bountyHp.role = "foe"; bountyHp.hp = 120; foes.Add(new Foe { go = bounty, rt = rt, hp = bountyHp }); }
            }
            else if (def.Veh != null)
            {
                SpawnVehicle(def.Veh, board.x, board.z);
                jobCar = missionCar; missionCar = null;
                if (jobCar != null) { var h = CarHealth.Of(jobCar); if (h != null) h.State.Fuel = 1; if (def.Siren && jobCar.GetComponent<CarBody>() is CarBody b) b.Siren = true; }
            }
            if (shift.Stops.Count > 0) { var (sx, sz) = shift.Stops[0]; Mark(sx, sz, shift.Reach); }
            Hud.Big(def.Name.ToUpperInvariant(), def.Text, 3f);
        }

        void Shift(float dt)
        {
            var d = shift.Def;
            var me = game.player.transform.position;
            // quit at the board
            if (OnFoot && (new Vector2(me.x - jobBoard.x, me.z - jobBoard.z)).sqrMagnitude < 2.5f * 2.5f)
            {
                Prompt = $"F  quit the {d.Name} shift";
                if (SbInput.InteractDown) { shift.Quit(); EndShift("You quit the shift"); return; }
            }
            string clock = $"{(int)(shift.T / 60)}:{(int)(shift.T % 60):00}";
            if (d.Kind == "bounty")
            {
                if (bountyHp == null) { EndShift("The trail went cold"); return; }
                if (bountyHp.Dead) { Earn(System.Math.Round(shift.Base)); shift.Quit(); Done(true, System.Math.Round(shift.Base)); return; }
                shift.Update(dt, double.MaxValue, false);
                if (shift.Over) { EndShift("Out of time"); return; }
                Mark(bounty.transform.position.x, bounty.transform.position.z, 3);
                Objective = $"BOUNTY · fugitive on the map · {clock}";
                return;
            }
            // the work vehicle: wreck it and you're sent home
            if (jobCar != null)
            {
                var h = jobCar.GetComponent<CarHealth>();
                if (h != null && h.State.Health < h.State.MaxHealth * 0.3) { shift.Quit(); EndShift($"You wrecked the {d.Name.ToLowerInvariant()}'s vehicle. Sent home for today."); return; }
                if (driving == null || driving.Car != jobCar) { Objective = $"{d.Name.ToUpperInvariant()} · get back in the vehicle · {clock}"; shift.Update(dt, double.MaxValue, false); if (shift.Over) EndShift("Out of time"); return; }
            }
            var (x, z) = shift.Stops[shift.Stop];
            var pos = jobCar != null ? jobCar.transform.position : me;
            double dist = Vector2.Distance(new Vector2(pos.x, pos.z), new Vector2((float)x, (float)z));
            bool still = jobCar == null || Mathf.Abs(jobCar.ForwardSpeed) < 1.5f;
            int before = shift.Stop;
            double paid = shift.Update(dt, dist, still);
            if (paid > 0) { Earn(paid); game.Toast($"+${paid:N0}", 1.5f); }
            if (shift.Over) { if (shift.Ok) Done(true, shift.Earned); else EndShift("Out of time"); return; }
            if (shift.Stop != before) { var (nx, nz) = shift.Stops[shift.Stop]; Mark(nx, nz, shift.Reach); }
            Objective = dist < shift.Reach && shift.Waiting > 0 && still
                ? $"{d.Name.ToUpperInvariant()} · working… {Mathf.CeilToInt((float)shift.Waiting)}s"
                : $"{d.Name.ToUpperInvariant()} · stop {shift.Stop + 1}/{shift.Stops.Count} · {Mathf.RoundToInt((float)dist)} m · {clock}";
        }

        void Done(bool ok, double earned)
        {
            var d = shift.Def;
            var p = game.Profile;
            var j = p.Jobs.TryGetValue(d.Id, out var have) ? have : new double[] { 1, 0, 0 };
            var (level, xp) = JobShift.Progress((int)j[0], (int)j[1]);
            if (level > j[0]) game.Toast($"{d.Name} level {level}!", 2.5f);
            p.Jobs[d.Id] = new double[] { level, xp, j[2] + 1 };
            Hud.Big("SHIFT COMPLETE", $"{d.Name} · earned ${earned:N0}", 3f);
            Finish();
            game.Save();
        }

        void EndShift(string why) { Hud.Big("SHIFT OVER", why, 2.5f); Finish(); }

        void Finish()
        {
            if (jobCar != null && jobCar.GetComponent<CarBody>() is CarBody b) b.Siren = false;
            jobCar = null; shift = null; bounty = null; bountyHp = null;
            CleanUp();
        }

        // ------------------------------------------------------------------ the minimap
        void Blips(List<Hud.Blip> into)
        {
            if (runner.Marker is (double x, double z, double _) || (shift != null && marker != null && marker.activeSelf))
            {
                var at = runner.Marker is (double mx, double mz, double __) ? new Vector3((float)mx, 0, (float)mz) : marker.transform.position;
                into.Add(new Hud.Blip { at = at, color = new Color(1f, 0.19f, 0.25f), size = 12, keepOnEdge = true });
            }
            foreach (var f in foes) if (f.go != null && f.hp != null && !f.hp.Dead) into.Add(new Hud.Blip { at = f.go.transform.position, color = new Color(0.9f, 0.15f, 0.15f), size = 7 });
            if (missionCar != null && !InMissionVehicle) into.Add(new Hud.Blip { at = missionCar.transform.position, color = new Color(0.3f, 0.6f, 1f), size = 9, keepOnEdge = true });
            if (Busy || game == null) return;
            if (giverPlaced) into.Add(new Hud.Blip { at = giverAt, color = new Color(1f, 0.85f, 0.3f), size = 11, keepOnEdge = true });
            foreach (var kv in sideAt) into.Add(new Hud.Blip { at = kv.Value, color = new Color(1f, 0.6f, 0.2f), size = 8 });
            foreach (var j in Data.Jobs) if (j.Supported) into.Add(new Hud.Blip { at = U(j.X, j.Z), color = new Color(1f, 0.88f, 0.25f), size = 6 });
        }
    }
}
