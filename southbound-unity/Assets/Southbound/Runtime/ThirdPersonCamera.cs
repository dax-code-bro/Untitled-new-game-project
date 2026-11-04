// Third-person camera: orbits behind John, pulls in over the right shoulder
// when aiming, and never goes through walls.
using UnityEngine;

namespace Southbound
{
    public sealed class ThirdPersonCamera : MonoBehaviour
    {
        public Transform target;
        public float distance = 3.6f, aimDistance = 1.35f, height = 1.6f, shoulder = 0.45f;
        public float sensitivity = 1f, minPitch = -60f, maxPitch = 75f;
        public float fov = 60f, aimFov = 42f;
        public LayerMask collideWith = ~0;

        float yaw, pitch = 10f, dist, curFov;
        Camera cam;

        void Awake()
        {
            cam = GetComponent<Camera>();
            dist = distance;
            curFov = fov;
            if (target != null) yaw = target.eulerAngles.y;
        }

        /// <summary>Recoil: the muzzle climbs (degrees up) and wanders sideways.</summary>
        public void Kick(float up, float side) { pitch -= up; yaw += side; }

        void LateUpdate()
        {
            if (target == null || Time.timeScale == 0) return;
            var look = SbInput.Look * sensitivity;
            yaw += look.x;
            pitch = Mathf.Clamp(pitch - look.y, minPitch, maxPitch);
            bool aiming = SbInput.Aim;
            float want = aiming ? aimDistance : distance;
            var rot = Quaternion.Euler(pitch, yaw, 0);
            Vector3 pivot = target.position + Vector3.up * height + rot * Vector3.right * (aiming ? shoulder : shoulder * 0.3f);
            // pull in when something is between John and the camera
            if (Physics.SphereCast(pivot, 0.2f, rot * Vector3.back, out var hit, want, collideWith, QueryTriggerInteraction.Ignore) && !hit.transform.IsChildOf(target))
                want = Mathf.Max(0.3f, hit.distance - 0.05f);
            dist = Mathf.Lerp(dist, want, 1 - Mathf.Exp(-(want < dist ? 30f : 8f) * Time.deltaTime));
            transform.SetPositionAndRotation(pivot + rot * Vector3.back * dist, rot);
            if (cam != null)
            {
                curFov = Mathf.Lerp(curFov, aiming ? aimFov : fov, 1 - Mathf.Exp(-10f * Time.deltaTime));
                cam.fieldOfView = curFov;
            }
        }
    }
}
