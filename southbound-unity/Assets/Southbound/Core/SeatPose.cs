// Sitting someone in a car seat, as the web game does (vehicle.js seat()): the person's hips go on the
// cushion's hip point and they lean back with the seat, which puts their root (feet) at the hip point minus
// the seated pose's pelvis offset (measured from the Driving_Loop clip: pelvis 0.60 m up and 0.29 m back of
// the root, cabin.js POSE), turned by the recline. Car space, Unity's axes (x mirrored from the web game's).
using System;

namespace Southbound.Core
{
    public static class SeatPose
    {
        public const double PelvisUp = 0.60, PelvisBack = -0.29;

        /// <summary>Where the person's root goes (car space) and the recline (radians about x, Unity sign) for a seat's hip point.</summary>
        public static (double x, double y, double z, double reclineRad) Root(double hipX, double hipY, double hipZ, double th, double size = 1)
        {
            double a = -th;   // the web leans the person back by -th about x; the x mirror leaves rotations about x as they are
            // -pelvis, turned by the recline (R_x(a): y' = y cos a - z sin a, z' = y sin a + z cos a)
            double py = -PelvisUp * size, pz = -PelvisBack * size;
            double ry = py * Math.Cos(a) - pz * Math.Sin(a), rz = py * Math.Sin(a) + pz * Math.Cos(a);
            return (hipX, hipY + ry, hipZ + rz, a);
        }
    }
}
