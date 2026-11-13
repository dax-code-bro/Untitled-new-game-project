// How a car drives: the web game's driving equations (entities/vehicle.js physics), so a car in
// Unity accelerates, tops out, brakes, steers and drifts exactly as it does in the browser.
//  - throttle: the car's acceleration fading out as it nears its top speed (a little extra off the
//    line); reversing gets a firm push the other way first
//  - brake: 22 m/s² while rolling forward, then reverse up to 9 m/s
//  - rolling resistance and aero drag (eased off while you're on the throttle)
//  - steering: the angle eases toward the stick, and less of it is allowed the faster you go; the
//    car yaws like a bicycle model (speed / wheelbase * tan(steer))
//  - grip: sideways speed bleeds off at the car's grip rate (the handbrake drops it to 1.4: a slide)
//  - nitrous: 1.8x the push and 15% more top speed
// Engine-free and deterministic: the Unity car (CarController) feeds it the body's forward and
// sideways speed every physics step and uses what comes back.
using System;

namespace Southbound.Core
{
    public struct DriveInput
    {
        public double Throttle, Brake, Steer; // 0..1, 0..1, -1..1
        public bool Handbrake, Nitro;
    }

    public sealed class DriveTuning
    {
        public double Accel, Top, Grip, BrakeK = 1;
        /// <summary>Front and rear axle positions along the car (metres, front positive).</summary>
        public double Wf, Wr;
        public double Wheelbase => Math.Max(0.5, Wf - Wr);

        public static DriveTuning For(CarInfo c) => new DriveTuning { Accel = c.Stats.Accel, Top = c.Stats.Top, Grip = c.Stats.Grip, Wf = c.Spec.AxF, Wr = c.Spec.AxR };
    }

    public sealed class DriveModel
    {
        /// <summary>Speed along the car (m/s, forward positive) and across it (m/s).</summary>
        public double Forward, Sideways;
        /// <summary>The front wheels' steering angle (radians).</summary>
        public double Steer;
        /// <summary>The yaw rate the steering asks for this step (radians per second).</summary>
        public double YawRate;
        public bool Braking;

        static double Lerp(double a, double b, double t) => a + (b - a) * t;

        /// <summary>One step on the ground. Returns the heading change for this step (radians).</summary>
        public double Step(DriveTuning t, DriveInput inp, double dt)
        {
            double vF = Forward, vR = Sideways;
            double thr = inp.Throttle, brk = inp.Brake;
            Braking = false;
            if (thr > 0)
            {
                if (vF < -0.5) { vF += 18 * thr * dt; Braking = true; }
                else
                {
                    double boost = inp.Nitro ? 1.8 : 1;
                    vF += t.Accel * boost * thr * Math.Max(0, 1 - vF / (t.Top * (boost > 1 ? 1.15 : 1))) * dt * (vF < 8 ? 1.25 : 1);
                }
            }
            if (brk > 0)
            {
                if (vF > 0.5) { vF -= 22 * t.BrakeK * brk * dt; Braking = true; }
                else vF = Math.Max(vF - 6 * brk * dt, -9);
            }
            if (inp.Handbrake) { vF -= Math.Sign(vF) * 6 * dt; Braking = true; }
            // rolling resistance + aero drag
            vF -= Math.Sign(vF) * Math.Min(Math.Abs(vF), (0.9 + Math.Abs(vF) * Math.Abs(vF) * 0.0012) * dt * (thr > 0 ? 0.3 : 1));
            // steering
            double maxSteer = 0.62 / (1 + Math.Abs(vF) * 0.055);
            Steer = Lerp(Steer, inp.Steer * maxSteer, Math.Min(1, dt * 7));
            YawRate = (vF / (t.Wf - t.Wr)) * Math.Tan(Steer);
            double dHeading = YawRate * dt * (inp.Handbrake ? 1.35 : 1);
            // lateral grip (low grip = drift)
            double grip = inp.Handbrake ? 1.4 : t.Grip;
            vR *= Math.Exp(-grip * dt);
            Forward = vF; Sideways = vR;
            return dHeading;
        }

        /// <summary>Speed in mph (the web game's dials).</summary>
        public double Mph => Math.Abs(Forward) * 2.237;
    }
}
