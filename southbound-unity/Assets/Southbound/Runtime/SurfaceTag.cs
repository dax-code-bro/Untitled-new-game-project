// What a collider is made of, for bullets (Southbound.Core.Ballistics): glass,
// drywall, door, frame (stud wall), metal, stucco, wood, brick, block, or the
// solid ones (masonry, stone, steel, floor, tree). Untagged colliders count as
// masonry, which nothing goes through.
using UnityEngine;

namespace Southbound
{
    public sealed class SurfaceTag : MonoBehaviour
    {
        public string surface = "masonry";
        [Tooltip("Wall thickness in metres along the shot. 0 = work it out from the collider.")]
        public float thickness;
        [Tooltip("A single panel with no back face (a pane, a sheet): use the material's usual thickness.")]
        public bool oneSided;

        public static SurfaceTag Of(Collider c) => c == null ? null : c.GetComponentInParent<SurfaceTag>();
    }
}
