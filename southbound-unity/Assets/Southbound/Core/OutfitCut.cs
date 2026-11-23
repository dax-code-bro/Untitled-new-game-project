// What part of John's one-piece suit each bit of cloth becomes (the web game's outfit shader, done on the mesh): the
// sleeves to their length (a tee's short ones, a work shirt to the elbow, a tank top's bare shoulders), the shirt down
// to its hem (tucked in at the belt, or hanging over it), a jacket over it (sleeveless for a vest, open down the front,
// a long coat to mid-thigh), the trousers or shorts to their length, bib overalls up the chest, bare skin where nothing
// covers it, and the hands for gloves. Positions are normalised to the body in its rest pose: y -1 at the soles to 1 at
// the top of the head, x and z in the same units, +z the front.
using System;

namespace Southbound.Core
{
    public enum Cloth { Skin = 0, Top = 1, Outer = 2, Bottom = 3 }

    public static class OutfitCut
    {
        public const double Belt = 0.08, Ankle = -0.908, Shoulder = 0.27, Wrist = 0.63;

        public static bool IsArm(double x, double y) => Math.Abs(x) > Shoulder && y > -0.12;

        /// <summary>How far down the arm (0 at the shoulder, 1 at the wrist).</summary>
        public static double AlongArm(double x) => Math.Max(0, Math.Min(1, (Math.Abs(x) - Shoulder) / (Wrist - Shoulder)));

        /// <summary>Where a top or jacket's hem falls (a tucked shirt at the belt; untucked lower; a long coat lower still).</summary>
        public static double HemY(Style s) => Belt - (0.16 - (double.IsNaN(s.Hem) ? 0.06 : s.Hem)) * 0.9;

        /// <summary>How much of the leg the trousers cover (1 full length; shorts above the knee).</summary>
        public static double LegCover(Style s) => double.IsNaN(s.Leg) || s.Leg <= -1 ? 1 : Math.Abs(s.Leg) * 1.2;

        static bool Sleeve(Style s, double t) => s != null && !double.IsNaN(s.Sleeve) && s.Sleeve > 0 && t <= Math.Min(1, s.Sleeve);

        public static Cloth Suit(double x, double y, double z, Style top, Style outer, Style bottom)
        {
            double ax = Math.Abs(x);
            if (IsArm(x, y))
            {
                double t = AlongArm(x);
                if (Sleeve(outer, t)) return Cloth.Outer;
                if (Sleeve(top, t)) return Cloth.Top;
                return Cloth.Skin;
            }
            if (outer != null && y >= HemY(outer) && !(outer.Open > 0 && ax < 0.055 && z > 0)) return Cloth.Outer;
            if (bottom != null && bottom.Id == "overalls" && z > 0 && ax < 0.16 && y < 0.45 && y >= Belt) return Cloth.Bottom;   // the bib
            if (top != null && y >= HemY(top)) return Cloth.Top;
            if (y >= Belt) return top != null ? Cloth.Top : Cloth.Skin;
            double tLeg = (Belt - y) / (Belt - Ankle);
            return bottom != null && tLeg <= LegCover(bottom) ? Cloth.Bottom : Cloth.Skin;
        }

        /// <summary>A hand (skin past the wrist): where gloves go.</summary>
        public static bool Hand(double x, double y) => Math.Abs(x) > 0.585 && y > -0.12;
    }
}
