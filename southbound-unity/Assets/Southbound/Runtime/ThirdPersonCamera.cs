// Third-person camera: orbits behind John, pulls in over the right shoulder
// when aiming, and never goes through walls. In a car it is a chase camera: further back for longer
// cars, swinging round behind the car a moment after you stop moving the mouse, and pulling back
// and widening a little with speed.
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
        [Tooltip("The car being driven (set by Driving); null on foot.")]
        public CarController vehicle;

        float yaw, pitch = 10f, dist, curFov, lastLook;
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
            if (look.sqrMagnitude > 0.01f) lastLook = Time.time;
            if (vehicle != null) { Chase(); return; }
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

        void Chase()
        {
            var car = vehicle.transform;
            float speed = Mathf.Abs(vehicle.ForwardSpeed);
            // swing in behind the car (behind the way it's going when it reverses)
            if (Time.time - lastLook > 1.2f && speed > 2f)
            {
                float carYaw = car.eulerAngles.y + (vehicle.ForwardSpeed < -1 ? 180 : 0);
                float k = 1 - Mathf.Exp(-Mathf.Clamp(speed * 0.12f, 0.8f, 3.5f) * Time.deltaTime);
                yaw = Mathf.LerpAngle(yaw, carYaw, k);
                pitch = Mathf.Lerp(pitch, 9f, k);
            }
            float want = vehicle.length * 0.9f + 2.4f + speed * 0.04f;
            var rot = Quaternion.Euler(pitch, yaw, 0);
            Vector3 pivot = car.position + Vector3.up * (vehicle.roof + 0.45f);
            if (Physics.SphereCast(pivot, 0.25f, rot * Vector3.back, out var hit, want, collideWith, QueryTriggerInteraction.Ignore) && !hit.transform.IsChildOf(car))
                want = Mathf.Max(1f, hit.distance - 0.05f);
            dist = Mathf.Lerp(dist, want, 1 - Mathf.Exp(-(want < dist ? 25f : 4f) * Time.deltaTime));
            transform.SetPositionAndRotation(pivot + rot * Vector3.back * dist, rot);
            if (cam != null)
            {
                curFov = Mathf.Lerp(curFov, fov + Mathf.Clamp(speed - 15f, 0, 30) * 0.25f, 1 - Mathf.Exp(-3f * Time.deltaTime));
                cam.fieldOfView = curFov;
            }
        }
    }
}
