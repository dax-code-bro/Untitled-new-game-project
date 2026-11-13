// The running game: John's profile (money, guns, needs) carried over from the
// web save, the clock (1 game hour = 2 real minutes, as in the browser
// version), the sun, and a plain on-screen HUD.
using System.IO;
using Southbound.Core;
using UnityEngine;

namespace Southbound
{
    [DefaultExecutionOrder(-100)]
    public sealed class SouthboundGame : MonoBehaviour
    {
        public static SouthboundGame Instance { get; private set; }

        [Tooltip("Real seconds per game hour (the web game uses 120).")]
        public float secondsPerGameHour = 120f;
        [Tooltip("Sun to turn with the clock (the scene's directional light).")]
        public Light sun;
        public PlayerController player;
        public Gunplay gunplay;
        public Driving driving;

        public Profile Profile { get; private set; }
        public Needs Needs => Profile.Needs;
        public double Health = 100;
        string toast; float toastT;
        bool paused;

        public static string SavePath => Path.Combine(Application.persistentDataPath, "southbound-save.json");

        void Awake()
        {
            Instance = this;
            Profile = LoadProfile();
            Health = Profile.Needs.MaxHealth;
            Cursor.lockState = CursorLockMode.Locked;
            Cursor.visible = false;
        }

        static Profile LoadProfile()
        {
            try
            {
                if (File.Exists(SavePath)) return Profile.FromJson(File.ReadAllText(SavePath));
            }
            catch (System.Exception e) { Debug.LogWarning($"Southbound: couldn't read {SavePath}: {e.Message}. Starting a new profile."); }
            var p = Profile.New();
            // the web game starts you with nothing; here you get the starter 9mm so there is something to test with
            p.OwnedWeapons.Add("fists");
            p.OwnedWeapons.Add("pistol");
            p.Ammo["pistol"] = 68;
            return p;
        }

        public void Save()
        {
            try
            {
                if (player != null) Profile.Pos = WebPos(player.transform.position);
                File.WriteAllText(SavePath, Profile.ToJson());
                Toast("Saved");
            }
            catch (System.Exception e) { Debug.LogError("Southbound: save failed: " + e.Message); }
        }

        /// <summary>Unity position -> web-game map position (x, z).</summary>
        public static double[] WebPos(Vector3 p) => new double[] { System.Math.Round(-p.x, 1), System.Math.Round(p.z, 1) };

        public void Toast(string msg, float seconds = 2f) { toast = msg; toastT = seconds; }

        void Update()
        {
            if (SbInput.PauseDown)
            {
                paused = !paused;
                Cursor.lockState = paused ? CursorLockMode.None : CursorLockMode.Locked;
                Cursor.visible = paused;
                Time.timeScale = paused ? 0 : 1;
            }
            if (paused) return;
            float dt = Time.deltaTime;
            // clock
            double gh = dt / secondsPerGameHour;
            Profile.Hour += gh;
            if (Profile.Hour >= 24) { Profile.Hour -= 24; Profile.Day++; }
            Profile.PlaySeconds += dt;
            bool onFoot = player != null && player.enabled; // (in a car the body is sitting)
            bool running = onFoot && player.Speed > 5;
            Needs.Drain(gh, running, Health <= 0);
            Health -= Needs.Tick(dt, onFoot && player.Sprinting, onFoot ? player.Speed : 0, Health);
            if (!Needs.NoRegen && Health < Needs.MaxHealth) Health = System.Math.Min(Needs.MaxHealth, Health + dt * 1.5);
            if (sun != null)
            {
                // sunrise ~6:00, noon overhead-ish, sunset ~18:00; slight tilt so shadows aren't straight north-south
                float a = (float)((Profile.Hour - 6) / 12.0 * 180.0);
                sun.transform.rotation = Quaternion.Euler(a, -30f, 0);
                sun.enabled = Profile.Hour > 5.5 && Profile.Hour < 18.5;
            }
            if (toastT > 0) toastT -= dt;
        }

        void OnApplicationQuit() => Save();

        void OnGUI()
        {
            var s = new GUIStyle(GUI.skin.label) { fontSize = 15, fontStyle = FontStyle.Bold };
            s.normal.textColor = new Color(0.95f, 0.92f, 0.85f);
            int h = (int)Profile.Hour, m = (int)((Profile.Hour - h) * 60);
            string hud = $"${Profile.Money:N0}    Day {Profile.Day}  {h:00}:{m:00}\n" +
                         $"Health {Health:0}/{Needs.MaxHealth:0}    Energy: {Needs.EnergyWord}    Food: {Needs.FoodWord}    Weight: {Needs.WeightText}";
            if (gunplay != null && gunplay.Weapon != null)
            {
                var w = gunplay.Weapon;
                hud += $"\n{w.Name}  ·  {w.Caliber}" + (w.Melee ? "" : $"  ·  {gunplay.Clip}/{gunplay.Reserve}") + (gunplay.Reloading ? "  (reloading)" : "");
            }
            GUI.Label(new Rect(18, Screen.height - 86, 900, 80), hud, s);
            if (driving != null)
            {
                var car = driving.Car;
                if (car != null)
                {
                    var big = new GUIStyle(s) { fontSize = 30, alignment = TextAnchor.LowerRight };
                    string extra = (car.Controls.Nitro ? "  NOS" : "") + (car.Controls.Handbrake ? "  HANDBRAKE" : "");
                    GUI.Label(new Rect(Screen.width - 420, Screen.height - 96, 400, 40), $"{car.SpeedMph:0} mph", big);
                    GUI.Label(new Rect(Screen.width - 420, Screen.height - 56, 400, 30), car.displayName + extra, new GUIStyle(s) { alignment = TextAnchor.LowerRight });
                }
                if (driving.Prompt != null)
                    GUI.Label(new Rect(Screen.width / 2f - 300, Screen.height - 140, 600, 30), driving.Prompt, new GUIStyle(s) { alignment = TextAnchor.MiddleCenter });
            }
            if (gunplay != null && gunplay.Aiming)
            {
                var c = new Vector2(Screen.width / 2f, Screen.height / 2f);
                GUI.Label(new Rect(c.x - 6, c.y - 12, 20, 24), "+", s);
            }
            if (toastT > 0) GUI.Label(new Rect(Screen.width / 2f - 300, 40, 600, 30), toast, new GUIStyle(s) { alignment = TextAnchor.MiddleCenter });
            if (paused)
            {
                GUI.Box(new Rect(Screen.width / 2f - 160, Screen.height / 2f - 90, 320, 180), "Paused");
                if (GUI.Button(new Rect(Screen.width / 2f - 120, Screen.height / 2f - 50, 240, 34), "Save")) Save();
                if (GUI.Button(new Rect(Screen.width / 2f - 120, Screen.height / 2f - 8, 240, 34), "Resume")) { paused = false; Time.timeScale = 1; Cursor.lockState = CursorLockMode.Locked; Cursor.visible = false; }
                if (GUI.Button(new Rect(Screen.width / 2f - 120, Screen.height / 2f + 34, 240, 34), "Quit")) { Save(); Application.Quit(); }
            }
        }
    }
}
