// Anything that can be shot: people, animals, targets. Armour levels are like
// NIJ ratings (3 = stops rifle-class 3 penetration, 3.5 sometimes stops 4);
// the helmet covers the head only.
using Southbound.Core;
using UnityEngine;

namespace Southbound
{
    public sealed class Health : MonoBehaviour
    {
        public float hp = 100;
        [Tooltip("Plate carrier level on the torso (0 = none).")]
        public float armour;
        [Tooltip("Helmet level (0 = none).")]
        public float helmet;
        [Tooltip("Where the feet are, relative to this object's origin (a capsule's origin is its middle: -0.9).")]
        public float feet;
        [Tooltip("Height of the head above the feet, for head hits.")]
        public float headHeight = 1.55f;
        public bool Dead => hp <= 0;
        public string lastPart;

        public void Hit(Ballistics.PersonHit h)
        {
            if (Dead) return;
            hp -= (float)h.Damage;
            lastPart = h.Part + (h.Stopped ? " (stopped by armour)" : "");
            if (hp <= 0) Die();
        }

        public void Damage(float amount)
        {
            if (Dead) return;
            hp -= amount;
            if (hp <= 0) Die();
        }

        void Die()
        {
            hp = 0;
            var r = GetComponentInChildren<Retargeter>();
            if (r != null) { r.Play("Death01"); return; }
            // no animation: fall over
            transform.rotation = Quaternion.AngleAxis(88f, transform.right) * transform.rotation;
            transform.position += Vector3.up * 0.3f;
        }
    }
}
