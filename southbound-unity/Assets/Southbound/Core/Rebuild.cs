// A burnt house goes back up the way houses do (src/systems/demolition.js):
// debris cleared, slab poured, studs and plates stood up, trusses set, OSB
// sheathing hung, roofing laid from the eaves, siding run from the bottom up.
// Thirty game hours of work; builders work days.
using System;

namespace Southbound.Core
{
    public static class Rebuild
    {
        public static readonly (string name, double hours)[] Stages =
        {
            ("clear", 3), ("slab", 4), ("frame", 8), ("sheath", 4), ("roof", 4), ("siding", 7),
        };

        public static double TotalHours { get { double t = 0; foreach (var s in Stages) t += s.hours; return t; } }

        public struct Progress
        {
            public int Stage;
            public string Name;
            /// <summary>0..1 through the current stage.</summary>
            public double F;
            public bool Past(string stage) => Index(stage) < Stage;
            public bool At(string stage) => Name == stage;
        }

        public static int Index(string name) { for (int i = 0; i < Stages.Length; i++) if (Stages[i].name == name) return i; return -1; }

        /// <summary>Where the job is at k (0..1 over the whole job).</summary>
        public static Progress At(double k)
        {
            double t = k * TotalHours;
            int stage = 0;
            while (stage < Stages.Length - 1 && t > Stages[stage].hours) { t -= Stages[stage].hours; stage++; }
            return new Progress { Stage = stage, Name = Stages[stage].name, F = Math.Min(1, t / Stages[stage].hours) };
        }

        /// <summary>Share of each layer that is built (instanced pieces shown), as the web game reveals them.</summary>
        public static double Layer(Progress p, string layer)
        {
            double c(double v) => Math.Max(0, Math.Min(1, v));
            switch (layer)
            {
                case "studs": return p.At("frame") ? c(p.F / 0.6) : p.Past("frame") ? 1 : 0;
                case "headers": return p.At("frame") ? c((p.F - 0.1) / 0.5) : p.Past("frame") ? 1 : 0;
                case "plates": return p.At("frame") ? c((p.F - 0.05) / 0.55) : p.Past("frame") ? 1 : 0;
                case "trusses": return p.At("frame") ? c((p.F - 0.62) / 0.38) : p.Past("frame") ? 1 : 0;
                case "sheets": return p.At("sheath") ? c(p.F) : p.Past("sheath") ? 1 : 0;
                case "decking": return p.At("roof") ? c(p.F * 5) : p.Past("roof") ? 1 : 0;
                case "shingles": return p.At("roof") ? c((p.F - 0.15) / 0.85) : p.Past("roof") ? 1 : 0;
                case "siding": return p.At("siding") ? c(p.F / 0.9) : 0;
                case "slab": return p.Past("clear") ? (p.At("slab") ? Math.Max(0.05, p.F) : 1) : 0;
                case "shell": return p.At("clear") ? (p.F < 0.92 ? Math.Max(0.05, 1 - p.F) : 0) : p.Past("clear") ? 0 : 1;
                default: throw new ArgumentException($"unknown layer {layer}");
            }
        }
    }
}
