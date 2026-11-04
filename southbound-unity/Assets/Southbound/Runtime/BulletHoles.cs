// Bullet holes: entry holes, blown-out exit holes in drywall, splintered wood,
// chipped brick and concrete, bright dents in metal, cracked glass. A pool of
// small quads that recycles the oldest (the web game keeps 220).
using Southbound.Core;
using UnityEngine;

namespace Southbound
{
    public sealed class BulletHoles : MonoBehaviour
    {
        [Tooltip("One material per hole kind, in HoleKind order (drywall, drywall exit, wood, frame, brick, concrete, metal, glass). Made by the Southbound setup menu.")]
        public Material[] materials = new Material[8];
        public Material blood;
        public int capacity = 220;

        Transform[] pool;
        MeshRenderer[] renderers;
        int next;
        static Mesh quad;

        void Awake()
        {
            quad = quad != null ? quad : BuildQuad();
            pool = new Transform[capacity];
            renderers = new MeshRenderer[capacity];
            for (int i = 0; i < capacity; i++)
            {
                var go = new GameObject("hole");
                go.transform.SetParent(transform, false);
                go.AddComponent<MeshFilter>().sharedMesh = quad;
                var r = go.AddComponent<MeshRenderer>();
                r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
                go.SetActive(false);
                pool[i] = go.transform;
                renderers[i] = r;
            }
        }

        static Mesh BuildQuad()
        {
            var m = new Mesh { name = "hole quad" };
            m.vertices = new[] { new Vector3(-0.5f, -0.5f, 0), new Vector3(0.5f, -0.5f, 0), new Vector3(0.5f, 0.5f, 0), new Vector3(-0.5f, 0.5f, 0) };
            m.uv = new[] { new Vector2(0, 0), new Vector2(1, 0), new Vector2(1, 1), new Vector2(0, 1) };
            m.normals = new[] { Vector3.back, Vector3.back, Vector3.back, Vector3.back };
            m.triangles = new[] { 0, 2, 1, 0, 3, 2 };
            m.RecalculateBounds();
            return m;
        }

        /// <summary>radius in metres (a 9 mm entry hole is ~0.012 with its ring of damage).</summary>
        public void Add(Vector3 point, Vector3 normal, HoleKind kind, float radius)
        {
            var mat = materials != null && (int)kind < materials.Length ? materials[(int)kind] : null;
            if (mat == null) return;
            // exit holes and chipped masonry are bigger than the bullet
            float size = radius * (kind == HoleKind.DrywallExit ? 9f : kind == HoleKind.Brick || kind == HoleKind.Concrete ? 6f : kind == HoleKind.Glass ? 10f : 4f);
            Place(point, normal, mat, size);
        }

        public void Blood(Vector3 point, Vector3 normal) { if (blood != null) Place(point, normal, blood, 0.12f); }

        void Place(Vector3 point, Vector3 normal, Material mat, float size)
        {
            var t = pool[next];
            renderers[next].sharedMaterial = mat;
            next = (next + 1) % pool.Length;
            t.gameObject.SetActive(true);
            t.position = point + normal * 0.003f;
            t.rotation = Quaternion.LookRotation(-normal) * Quaternion.Euler(0, 0, Random.Range(0f, 360f));
            t.localScale = Vector3.one * size;
        }
    }
}
