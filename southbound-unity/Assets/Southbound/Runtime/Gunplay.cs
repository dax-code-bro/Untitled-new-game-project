// Shooting, the web game's way: every gun from the catalog with its real
// stats, ammo from the save, spread (worse when tired), recoil, reloads, and
// rounds that go through drywall, doors, studs and thin metal depending on the
// gun and ammo, leaving entry and exit holes and hitting softer on the far side.
using System.Collections.Generic;
using System.Linq;
using Southbound.Core;
using UnityEngine;

namespace Southbound
{
    public sealed class Gunplay : MonoBehaviour
    {
        public Camera cam;
        public ThirdPersonCamera cameraRig;
        public PlayerController player;
        public BulletHoles holes;
        [Tooltip("Ammo type for guns (FMJ, Hollow point, Armor piercing, Subsonic, Buckshot, Slug...)")]
        public string ammo = "FMJ";
        public LayerMask shootable = ~0;
        public AudioSource audioSource;
        public AudioClip shotClip;

        readonly List<string> owned = new List<string>();
        readonly Dictionary<string, int> clips = new Dictionary<string, int>();
        int index;
        float cooldown, reloadT;
        Light flash;
        float flashT;
        readonly System.Random rng = new System.Random();

        public Weapon Weapon { get; private set; }
        public bool Drawn { get; private set; } = true;
        public bool Aiming => Drawn && SbInput.Aim;
        public bool Reloading => reloadT > 0;
        public int Clip => Weapon != null && clips.TryGetValue(Weapon.Id, out var c) ? c : 0;
        public int Reserve => Weapon != null && SouthboundGame.Instance != null && SouthboundGame.Instance.Profile.Ammo.TryGetValue(Weapon.Id, out var a) ? (int)a : 0;

        void Start()
        {
            if (cam == null) cam = Camera.main;
            var p = SouthboundGame.Instance != null ? SouthboundGame.Instance.Profile : Profile.New();
            owned.AddRange(p.OwnedWeapons.Where(id => Arsenal.Get(id) != null).Distinct());
            if (!owned.Contains("fists")) owned.Insert(0, "fists");
            index = Mathf.Max(0, owned.FindIndex(id => id != "fists"));
            Equip(index);
            var go = new GameObject("Muzzle flash");
            go.transform.SetParent(transform, false);
            flash = go.AddComponent<Light>();
            flash.type = LightType.Point;
            flash.range = 6;
            flash.color = new Color(1f, 0.78f, 0.45f);
            flash.enabled = false;
            if (shotClip == null) shotClip = SynthShot();
        }

        /// <summary>A gunshot made from noise (crack + body + tail) until real recordings are added.</summary>
        static AudioClip SynthShot()
        {
            const int rate = 44100;
            int n = (int)(rate * 0.6f);
            var d = new float[n];
            var r = new System.Random(7);
            float lp = 0, lp2 = 0;
            for (int i = 0; i < n; i++)
            {
                float t = i / (float)rate;
                float white = (float)(r.NextDouble() * 2 - 1);
                lp += (white - lp) * 0.25f;   // body
                lp2 += (lp - lp2) * 0.05f;    // low boom
                float crack = white * Mathf.Exp(-t * 180f);
                float body = lp * Mathf.Exp(-t * 18f);
                float boom = lp2 * 6f * Mathf.Exp(-t * 7f);
                d[i] = Mathf.Clamp((crack * 0.9f + body * 0.8f + boom) * 0.8f, -1f, 1f);
            }
            var clip = AudioClip.Create("gunshot", n, 1, rate, false);
            clip.SetData(d, 0);
            return clip;
        }

        void Equip(int i)
        {
            if (owned.Count == 0) return;
            index = (i % owned.Count + owned.Count) % owned.Count;
            var p = SouthboundGame.Instance != null ? SouthboundGame.Instance.Profile : null;
            Weapon = p != null ? p.Loadout(owned[index]) : Arsenal.Get(owned[index]).Clone();
            if (!clips.ContainsKey(Weapon.Id)) clips[Weapon.Id] = Weapon.Melee ? 0 : Mathf.Min(Weapon.Clip, Reserve);
            reloadT = 0;
        }

        void Update()
        {
            if (Time.timeScale == 0 || Weapon == null) return;
            float dt = Time.deltaTime;
            cooldown -= dt;
            if (flashT > 0 && (flashT -= dt) <= 0) flash.enabled = false;
            int n = SbInput.NumberDown;
            if (n > 0 && n <= owned.Count) Equip(n - 1);
            float sc = SbInput.Scroll;
            if (sc > 0.5f) Equip(index + 1); else if (sc < -0.5f) Equip(index - 1);
            if (SbInput.HolsterDown) Drawn = !Drawn;
            if (reloadT > 0)
            {
                if ((reloadT -= dt) <= 0) FinishReload();
                return;
            }
            if (!Weapon.Melee && SbInput.ReloadDown && Clip < Weapon.Clip && Reserve > Clip) StartReload();
            if (Drawn && SbInput.Fire && cooldown <= 0)
            {
                if (Weapon.Melee) Swing();
                else if (Clip > 0) Shoot();
                else if (Reserve > 0) StartReload();
            }
        }

        void StartReload()
        {
            reloadT = Weapon.Cat == "shotgun" ? 2.4f : Weapon.Cat == "sniper" ? 2.6f : Weapon.Cat == "pistol" ? 1.3f : Weapon.Cat == "bow" ? 0.9f : 2f;
            player?.animator?.Play("Pistol_Reload");
        }

        void FinishReload()
        {
            // the reserve in the save counts every round you own, loaded or not
            clips[Weapon.Id] = Mathf.Min(Weapon.Clip, Reserve);
        }

        double Rand() => rng.NextDouble();

        void Shoot()
        {
            var game = SouthboundGame.Instance;
            var am = Arsenal.AmmoTypes.TryGetValue(ammo, out var a) ? a : Arsenal.AmmoTypes["FMJ"];
            if (Weapon.Cat == "shotgun" && !am.Slug && am.Name != "Birdshot" && am.Name != "Flechette") am = Arsenal.AmmoTypes["Buckshot"];
            clips[Weapon.Id] = Clip - 1;
            if (game != null) game.Profile.Ammo[Weapon.Id] = System.Math.Max(0, Reserve - 1);
            cooldown = (float)Weapon.Rate;
            float tired = game != null ? (float)game.Needs.SpreadMultiplier : 1f;
            float aimMul = Aiming ? 0.6f : 1.4f;
            double spread = Ballistics.Spread(Weapon, am, tired * aimMul);
            double range = Ballistics.Range(Weapon, am);
            int pellets = Ballistics.Pellets(Weapon, am);
            Vector3 origin = cam.transform.position;
            for (int k = 0; k < pellets; k++)
            {
                Vector3 d = cam.transform.forward;
                d += new Vector3((float)((Rand() - 0.5) * spread), (float)((Rand() - 0.5) * spread), (float)((Rand() - 0.5) * spread));
                Trace(origin, d.normalized, range, Ballistics.Fire(Weapon, am), am);
            }
            if (cameraRig != null) cameraRig.Kick((float)Weapon.Recoil * 40f, (float)((Rand() - 0.5) * Weapon.Recoil * 20));
            if (!Weapon.Silent)
            {
                flash.transform.position = player != null ? player.transform.position + player.transform.forward * 0.7f + Vector3.up * 1.4f : origin;
                flash.intensity = 40000f; flash.enabled = true; flashT = 0.05f;
            }
            if (audioSource != null && shotClip != null) audioSource.PlayOneShot(shotClip, Weapon.Silent ? 0.25f : 1f);
            player?.animator?.Play("Pistol_Shoot", 0.05f);
        }

        void Trace(Vector3 origin, Vector3 dir, double range, Round round, Ammo am)
        {
            double travelled = 0;
            var me = player != null ? player.transform : transform;
            for (int wall = 0; wall <= Ballistics.MaxWalls; wall++)
            {
                var hits = Physics.RaycastAll(origin, dir, (float)(range - travelled), shootable, QueryTriggerInteraction.Ignore);
                System.Array.Sort(hits, (x, y) => x.distance.CompareTo(y.distance));
                RaycastHit? first = null;
                foreach (var h in hits) if (!h.collider.transform.IsChildOf(me)) { first = h; break; }
                if (first == null) return;
                var hit = first.Value;
                travelled += hit.distance;
                var hp = hit.collider.GetComponentInParent<Health>();
                if (hp != null)
                {
                    var t = hp.transform;
                    float dy = hit.point.y - (t.position.y + hp.feet);
                    float lat = Vector3.Dot(hit.point - t.position, t.right);
                    bool head = dy > hp.headHeight;
                    hp.Hit(Ballistics.HitPerson(Weapon, am, round, travelled, head, dy, lat, hp.armour, hp.helmet, Rand));
                    holes?.Blood(hit.point, hit.normal);
                    return;
                }
                var tag = SurfaceTag.Of(hit.collider);
                string surf = tag != null ? tag.surface : "masonry";
                var s = Ballistics.Get(surf);
                double thick = Thickness(hit, dir, tag, s);
                bool stud = (surf == "drywall" || surf == "frame") && Ballistics.OverStud(hit.point.x, hit.point.z, hit.normal.x, hit.normal.z);
                double left = range - travelled - thick;
                if (!Ballistics.TryPenetrate(round, surf, thick, stud, left))
                {
                    holes?.Add(hit.point, hit.normal, Ballistics.StopHole(surf), (float)Ballistics.HoleRadius(Weapon) * (s.Hole == HoleKind.Concrete || s.Hole == HoleKind.Brick ? 1.2f : 1f));
                    var rb = hit.rigidbody;
                    if (rb != null) rb.AddForceAtPosition(dir * (float)(Weapon.Damage * 0.05), hit.point, ForceMode.Impulse);
                    return;
                }
                var (entry, exitKind) = Ballistics.ThroughHoles(surf);
                Vector3 exit = hit.point + dir * (float)(thick + 0.012);
                float cal = (float)Ballistics.HoleRadius(Weapon);
                holes?.Add(hit.point, hit.normal, entry, cal);
                holes?.Add(exit - dir * 0.016f, -hit.normal, exitKind, cal * 1.3f);
                travelled += thick + 0.012;
                origin = exit;
            }
        }

        /// <summary>How much wall the round has to get through along this line.</summary>
        static double Thickness(RaycastHit hit, Vector3 dir, SurfaceTag tag, Surface s)
        {
            if (tag != null && tag.thickness > 0) return tag.thickness;
            if (!s.Penetrable) return 99;
            if (tag != null && tag.oneSided) return s.Thin;
            if (hit.collider is BoxCollider box)
            {
                // exact exit through the box (local space slab test)
                var t = box.transform;
                Vector3 o = t.InverseTransformPoint(hit.point) - box.center, d = t.InverseTransformDirection(dir);
                Vector3 h = box.size * 0.5f;
                float tExit = float.MaxValue;
                for (int i = 0; i < 3; i++)
                {
                    if (Mathf.Abs(d[i]) < 1e-6f) continue;
                    float te = ((d[i] > 0 ? h[i] : -h[i]) - o[i]) / d[i];
                    if (te > 0) tExit = Mathf.Min(tExit, te);
                }
                if (tExit == float.MaxValue) return 99;
                return t.TransformVector(d * tExit).magnitude;
            }
            // cast back from beyond the wall to find its far face
            float max = (float)s.Max;
            if (hit.collider.Raycast(new Ray(hit.point + dir * max, -dir), out var back, max)) return System.Math.Max(0.005, max - back.distance);
            return s.Thin;
        }

        void Swing()
        {
            cooldown = (float)Weapon.Rate;
            player?.animator?.Play(rng.Next(2) == 0 ? "Punch_Jab" : "Punch_Cross", 0.05f);
            var me = player != null ? player.transform : transform;
            Vector3 c = me.position + Vector3.up * 1.2f + me.forward * (float)(Weapon.Range * 0.6);
            foreach (var col in Physics.OverlapSphere(c, (float)Weapon.Range * 0.5f, shootable, QueryTriggerInteraction.Ignore))
            {
                if (col.transform.IsChildOf(me)) continue;
                var hp = col.GetComponentInParent<Health>();
                if (hp == null) continue;
                hp.Damage((float)(Weapon.Damage * (0.85 + Rand() * 0.3)));
                break;
            }
        }
    }
}
