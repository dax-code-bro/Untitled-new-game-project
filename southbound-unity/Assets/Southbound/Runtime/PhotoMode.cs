// Photo mode (F10): the game pauses, the camera still orbits, and HDRP's path tracer takes over the
// picture: light bounces, soft shadows and reflections computed the way offline renders do, refining
// over a few seconds while the camera is still. It needs DirectX 12 and a ray-tracing GPU (RTX); on
// other machines the picture stays the normal one. F10 again to play on.
using UnityEngine;

namespace Southbound
{
    public sealed class PhotoMode : MonoBehaviour
    {
        public static bool Active { get; private set; }
        float before = 1f;

        void Update()
        {
            if (!SbInput.PhotoDown) return;
            Active = !Active;
            if (Active) { before = Time.timeScale; Time.timeScale = 0; }
            else Time.timeScale = before > 0 ? before : 1;
            int n = PathTracing(Active);
            if (Active && n == 0) Debug.Log("Southbound: photo mode without path tracing (no PathTracing override in the scene's Volume: run Southbound > Look > Make it photoreal).");
        }

        void OnDisable() { if (Active) { Active = false; Time.timeScale = 1; PathTracing(false); } }

        /// <summary>Switches the path tracer in every Volume profile that has one; returns how many.</summary>
        public static int PathTracing(bool on)
        {
            int n = 0;
            foreach (var c in Object.FindObjectsByType<Behaviour>(FindObjectsSortMode.None))
            {
                if (c == null || c.GetType().FullName != "UnityEngine.Rendering.Volume") continue;
                var profile = c.GetType().GetProperty("sharedProfile")?.GetValue(c);
                if (!(profile?.GetType().GetField("components")?.GetValue(profile) is System.Collections.IList list)) continue;
                foreach (var comp in list)
                {
                    if (comp == null || comp.GetType().Name != "PathTracing") continue;
                    var p = comp.GetType().GetField("enable")?.GetValue(comp);
                    if (p == null) continue;
                    p.GetType().GetProperty("value")?.SetValue(p, on);
                    p.GetType().GetProperty("overrideState")?.SetValue(p, true);
                    n++;
                }
            }
            return n;
        }

        void OnGUI()
        {
            if (!Active) return;
            var s = new GUIStyle(GUI.skin.label) { fontSize = 14, alignment = TextAnchor.UpperCenter };
            s.normal.textColor = new Color(1, 1, 1, 0.85f);
            GUI.Label(new Rect(Screen.width / 2f - 300, 14, 600, 24), "PHOTO MODE  ·  path traced (RTX)  ·  mouse to orbit, hold still to refine  ·  F10 to play", s);
        }
    }
}
