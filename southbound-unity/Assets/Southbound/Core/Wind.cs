// The wind (the web game's hunting.js wind): a slow drift of direction and strength, blowing towards (X, Z) on the
// web map, stronger in rain and a storm. Aircraft drift with it (aviation.js: half its speed), the windsock shows it,
// and animals smell you downwind of them and barely notice you upwind (K).
using System;

namespace Southbound.Core
{
    public sealed class Wind
    {
        public double A, X = 1, Z, Kmh = 8;
        readonly Random rnd;

        public Wind(int seed = 0) { rnd = seed == 0 ? new Random() : new Random(seed); A = rnd.NextDouble() * 6.28; X = Math.Sin(A); Z = Math.Cos(A); }

        /// <summary>t: seconds of play (the web game's performance.now() / 1000); weather: "storm", "rain"...; rain 0..1.</summary>
        public void Update(double dt, double t, string weather, double rain)
        {
            A += (Math.Sin(t * 1000 * 0.00004) * 0.02 + (rnd.NextDouble() - 0.5) * 0.01) * dt * 10;
            X = Math.Sin(A); Z = Math.Cos(A);
            Kmh = Math.Max(2, Math.Min(40, (weather == "storm" ? 32 : rain > 0.3 ? 18 : 8) + Math.Sin(t * 1000 * 0.0001) * 4));
        }

        /// <summary>How much more (or less) an animal notices you when you're (ux, uz) from it: downwind of you it smells you.</summary>
        public double K(double ux, double uz) { double k = ux * X + uz * Z; return k > 0.45 ? 1.4 + Kmh / 25 : k < -0.3 ? 0.6 : 1; }

        /// <summary>The drift it gives an aircraft (m/s on the web map).</summary>
        public (double x, double z) Drift => (X * Kmh / 3.6 * 0.5, Z * Kmh / 3.6 * 0.5);

        /// <summary>Turbulence for the weather (aviation.js).</summary>
        public static double Turbulence(string weather) => weather == "storm" ? 1 : weather == "rain" ? 0.4 : 0.05;
    }
}
