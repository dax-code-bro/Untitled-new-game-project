// Puts a person in a car's driver seat (Core/SeatPose: hips on the cushion, leaning back with the seat) and
// starts them on the seated driving clip. Works for John and for the traffic's drivers.
using Southbound.Core;
using UnityEngine;

namespace Southbound
{
    public static class Seating
    {
        /// <summary>Does this car have a cabin behind see-through glass (prefabs built since the cabins came over)?</summary>
        public static bool HasCabin(Transform car) => car != null && car.Find("Body/Cabin") != null;

        public static void Sit(Transform person, CarController car, Retargeter anim)
        {
            var seat = car.seat != null ? car.seat : car.transform;
            person.SetParent(car.transform, false);
            float th = -seat.localEulerAngles.x * Mathf.Deg2Rad;
            if (th < -Mathf.PI) th += 2 * Mathf.PI;
            var (x, y, z, a) = SeatPose.Root(seat.localPosition.x, seat.localPosition.y, seat.localPosition.z, th);
            person.localPosition = new Vector3((float)x, (float)y, (float)z);
            person.localRotation = Quaternion.Euler((float)(a * Mathf.Rad2Deg), 0, 0);
            if (anim != null && anim.Ready) anim.Loop("Driving_Loop", 1);
        }
    }
}
