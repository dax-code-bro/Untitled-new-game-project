// The front doors (cut out of the body by Core/CarDoors when the prefab is built) swing open on their
// hinges: when John gets in or out, and a door on a battered side hangs ajar. While a door is open the
// car keeps its nearest level of detail (the farther ones are still one piece).
using UnityEngine;

namespace Southbound
{
    public sealed class CarDoorSwing : MonoBehaviour
    {
        [Tooltip("Hinge pivots: driver's door, passenger's door.")]
        public Transform[] doors;
        [Tooltip("How far each opens (degrees about the hinge).")]
        public float[] openDegrees;
        public float speed = 2.4f;

        float[] now, ajar, until;
        LODGroup lods; bool forced;

        void Awake()
        {
            int n = doors != null ? doors.Length : 0;
            now = new float[n]; ajar = new float[n]; until = new float[n];
            lods = GetComponent<LODGroup>();
        }

        public bool Has(int i) => doors != null && i >= 0 && i < doors.Length && doors[i] != null;

        /// <summary>Open a door, and close it again after `hold` seconds.</summary>
        public void Open(int i, float hold = 0.8f) { if (Has(i)) until[i] = Time.time + hold; }

        /// <summary>Leave a door hanging open by this fraction (0 shuts it).</summary>
        public void SetAjar(int i, float amount) { if (Has(i)) ajar[i] = Mathf.Clamp01(amount); }

        void Update()
        {
            if (doors == null) return;
            bool open = false;
            for (int i = 0; i < doors.Length; i++)
            {
                if (doors[i] == null) continue;
                float want = Time.time < until[i] ? 1 : ajar[i];
                now[i] = Mathf.MoveTowards(now[i], want, Time.deltaTime * speed);
                float e = now[i] * now[i] * (3 - 2 * now[i]);
                doors[i].localRotation = Quaternion.Euler(0, (openDegrees != null && i < openDegrees.Length ? openDegrees[i] : 0) * e, 0);
                if (now[i] > 0.005f) open = true;
            }
            if (lods != null && open != forced) { forced = open; lods.ForceLOD(open ? 0 : -1); }
        }
    }
}
