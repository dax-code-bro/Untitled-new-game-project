// Getting in and out of cars, on John. Walk up to a car's driver's door and press F (Enter, or Y on a
// pad), as in the web game: John takes the seat, the camera becomes the chase camera and the
// controls drive. F again gets out on the driver's side once the car is nearly stopped (or bails
// out at speed, the hard way). A car left on its roof: F beside it pushes it back on its wheels.
using UnityEngine;

namespace Southbound
{
    [RequireComponent(typeof(PlayerController))]
    public sealed class Driving : MonoBehaviour
    {
        [Tooltip("How close to the driver's door (m) John must be to get in.")]
        public float reach = 2.6f;
        public ThirdPersonCamera cameraRig;

        public CarController Car { get; private set; }
        public CarController Near { get; private set; }
        /// <summary>The key hint to show (null: none).</summary>
        public string Prompt { get; private set; }

        PlayerController player;
        CharacterController cc;
        Gunplay gun;
        Renderer[] modelRenderers;

        void Awake()
        {
            player = GetComponent<PlayerController>();
            cc = GetComponent<CharacterController>();
            gun = GetComponent<Gunplay>();
            if (cameraRig == null && Camera.main != null) cameraRig = Camera.main.GetComponent<ThirdPersonCamera>();
        }

        void Update()
        {
            if (Time.timeScale == 0) return;
            if (Car == null)
            {
                Near = Nearest();
                Prompt = Near == null ? null : Near.Upside ? $"F  Push the {Near.displayName} back on its wheels" : $"F  Get in the {Near.displayName}";
                if (Near != null && SbInput.InteractDown) { if (Near.Upside) Near.Right(); else Enter(Near); }
                return;
            }
            Car.ReadPlayerInput();
            float speed = Mathf.Abs(Car.ForwardSpeed);
            Prompt = speed < 4 ? "F  Get out" : null;
            if (SbInput.InteractDown) Exit(speed >= 4);
        }

        CarController Nearest()
        {
            CarController best = null; float bd = reach * reach;
            foreach (var c in CarController.All)
            {
                if (c.Driver != null) continue;
                // (an overturned car's door is up in the air: go by the car itself)
                float d = ((c.Upside ? c.transform.position : c.DoorPoint) - transform.position).sqrMagnitude * (c.Upside ? 0.4f : 1f);
                if (d < bd) { bd = d; best = c; }
            }
            return best;
        }

        public void Enter(CarController car)
        {
            Car = car;
            car.Driver = this;
            player.enabled = false;
            cc.enabled = false;
            if (gun != null) gun.enabled = false;
            modelRenderers = player.model != null ? player.model.GetComponentsInChildren<Renderer>() : new Renderer[0];
            // (the glass is the tinted shell for now: John is hidden in the seat until the car interiors come over)
            foreach (var r in modelRenderers) r.enabled = false;
            transform.SetParent(car.seat != null ? car.seat : car.transform, false);
            transform.localPosition = Vector3.zero; transform.localRotation = Quaternion.identity;
            if (cameraRig != null) cameraRig.vehicle = car;
            var game = SouthboundGame.Instance;
            if (game != null) game.Toast(car.displayName);
        }

        public void Exit(bool bail = false)
        {
            var car = Car;
            if (car == null) return;
            car.Driver = null;
            car.Controls = new Core.DriveInput { Handbrake = !bail };
            Car = null;
            transform.SetParent(null, true);
            // out on the driver's side, on whatever is under the door (or on top of the car if the door is blocked)
            Vector3 at = car.DoorPoint + Vector3.up * 1.5f;
            if (Physics.Raycast(at, Vector3.down, out var hit, 6f, ~0, QueryTriggerInteraction.Ignore) && !hit.collider.transform.IsChildOf(car.transform)) at = hit.point + Vector3.up * 0.05f;
            else at = car.transform.position + Vector3.up * (car.roof + 0.3f);
            transform.SetPositionAndRotation(at, Quaternion.Euler(0, car.transform.eulerAngles.y, 0));
            cc.enabled = true;
            player.enabled = true;
            if (gun != null) gun.enabled = true;
            if (modelRenderers != null) foreach (var r in modelRenderers) if (r != null) r.enabled = true;
            if (cameraRig != null) cameraRig.vehicle = null;
            if (bail)
            {
                var game = SouthboundGame.Instance;
                if (game != null) { game.Health -= Mathf.Clamp(Mathf.Abs(car.ForwardSpeed) * 1.5f, 5, 60); game.Toast("You bailed out"); }
            }
        }
    }
}
