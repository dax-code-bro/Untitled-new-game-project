// Lights in Calvera's windows keep hours. The window glass's emission is in nits, so by day the
// sun-scale exposure hides it and at night the rooms glow on their own; this only puts out the lights
// in the "evening" windows (and shops that close) late at night and turns them back on at dusk, fading
// over a few game minutes. It works on copies of the two evening materials, so the assets don't change.
using UnityEngine;

namespace Southbound
{
    public sealed class NightWindows : MonoBehaviour
    {
        [Tooltip("Room windows lit only in the evening, and their brightness (nits) when on.")]
        public Material eveningRooms;
        public float roomNits = 30f;
        [Tooltip("Shopfronts that close in the evening, and their brightness (nits) when on.")]
        public Material eveningShops;
        public float shopNits = 70f;
        [Tooltip("Hours (game clock) the evening lights are on: from `on` to `off` (past midnight wraps).")]
        public float on = 17.5f, off = 23.25f;

        Material rooms, shops;
        float level = -1;
        static readonly int IdEmissive = Shader.PropertyToID("_EmissiveColor");

        void Start()
        {
            rooms = eveningRooms != null ? new Material(eveningRooms) : null;
            shops = eveningShops != null ? new Material(eveningShops) : null;
            foreach (var r in GetComponentsInChildren<MeshRenderer>(true))
            {
                var mats = r.sharedMaterials; bool changed = false;
                for (int i = 0; i < mats.Length; i++)
                {
                    if (rooms != null && mats[i] == eveningRooms) { mats[i] = rooms; changed = true; }
                    else if (shops != null && mats[i] == eveningShops) { mats[i] = shops; changed = true; }
                }
                if (changed) r.sharedMaterials = mats;
            }
        }

        void Update()
        {
            float h = (float)DayNight.Hour;
            bool lit = on < off ? h >= on && h < off : h >= on || h < off;
            // fade over ~10 game minutes
            float target = lit ? 1 : 0;
            float k = level < 0 ? target : Mathf.MoveTowards(level, target, Time.deltaTime * 0.5f);
            if (Mathf.Approximately(k, level)) return;
            level = k;
            if (rooms != null) rooms.SetColor(IdEmissive, Color.white * roomNits * k);
            if (shops != null) shops.SetColor(IdEmissive, Color.white * shopNits * k);
        }

        void OnDestroy() { if (rooms != null) Destroy(rooms); if (shops != null) Destroy(shops); }
    }
}
