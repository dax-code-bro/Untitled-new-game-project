// Number helpers that behave exactly like the JavaScript ones the web game uses,
// so anything generated from a seed (the weapon catalog, building layouts)
// comes out identical in Unity.
using System;
using System.Numerics;

namespace Southbound.Core
{
    /// <summary>The web game's seeded random generator (mulberry32), bit for bit.</summary>
    public sealed class Mulberry32
    {
        uint s;
        public Mulberry32(uint seed) { s = seed; }

        /// <summary>Next value in [0, 1), identical to the JS generator.</summary>
        public double Next()
        {
            unchecked
            {
                s += 0x6D2B79F5u;
                uint t = (s ^ (s >> 15)) * (1u | s);
                t = (t + ((t ^ (t >> 7)) * (61u | t))) ^ t;
                return (t ^ (t >> 14)) / 4294967296.0;
            }
        }
    }

    public static class JsMath
    {
        /// <summary>Math.round: nearest integer, halves go up (towards +infinity).</summary>
        public static double Round(double x)
        {
            if (double.IsNaN(x) || double.IsInfinity(x)) return x;
            double f = Math.Floor(x);
            return x - f >= 0.5 ? f + 1 : f;
        }

        /// <summary>+x.toFixed(digits): rounds the exact binary value, halves away from zero.</summary>
        public static double ToFixed(double x, int digits)
        {
            if (double.IsNaN(x) || double.IsInfinity(x) || Math.Abs(x) >= 1e21) return x;
            double sign = x < 0 ? -1 : 1;
            long bits = BitConverter.DoubleToInt64Bits(Math.Abs(x));
            int exp = (int)((bits >> 52) & 0x7FF);
            long mant = bits & 0xFFFFFFFFFFFFFL;
            if (exp == 0) exp = 1; else mant |= 1L << 52;
            exp -= 1075; // |x| = mant * 2^exp exactly
            BigInteger num = new BigInteger(mant) * BigInteger.Pow(10, digits);
            BigInteger n;
            if (exp >= 0) n = num << exp;
            else
            {
                BigInteger den = BigInteger.One << -exp;
                n = BigInteger.DivRem(num, den, out BigInteger rem);
                if (rem * 2 >= den) n += 1;
            }
            return sign * ((double)n / Math.Pow(10, digits));
        }

        public static double Clamp(double v, double lo, double hi) => v < lo ? lo : v > hi ? hi : v;
        public static float Clamp01(float v) => v < 0 ? 0 : v > 1 ? 1 : v;
        public static double Smoothstep(double a, double b, double x) { double t = Clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
    }
}
