// The law, as the web game runs it (entities/police.js): crimes raise the wanted level (stars) and the
// heat (how serious it got; at heat 3 and up officers shoot); the stars only start to cool once the police
// have lost sight of you and searched where you were last seen, one star every 8 + 4 x stars seconds; the
// number of cruisers in pursuit follows the stars; an arrest happens when an officer stands next to you
// while you're on foot, slow and not holding a gun, and the heat is still low.
// And the routes the cruisers take: the shortest way over the lane graph (Core/Lanes) to where you are.
using System;
using System.Collections.Generic;

namespace Southbound.Core
{
    public sealed class Wanted
    {
        public static readonly int[] CarsPerStar = { 0, 1, 2, 3, 4, 6 };
        static readonly Dictionary<string, int> Heat = new Dictionary<string, int>
        {
            ["poaching"] = 1, ["speeding"] = 1, ["disturbance"] = 1, ["assault"] = 1, ["resist"] = 1, ["carjack"] = 2, ["shots"] = 2,
            ["brandish"] = 2, ["robbery"] = 2, ["kill"] = 3, ["copShot"] = 3, ["copKill"] = 4, ["rampage"] = 5,
        };

        public int Stars, HeatLevel, Kills, MaxStars, CopKills;
        /// <summary>Seconds since the police last had you (in sight, or searching where they last saw you).</summary>
        public double Cool;
        public bool Lost => Stars > 0 && Cool > 4;
        /// <summary>Raised when the last star goes: (most stars it reached, people killed).</summary>
        public event Action<int, int> Escaped;

        public void Crime(string kind, bool nearPolice = false)
        {
            int before = Stars;
            HeatLevel = Math.Max(HeatLevel, Heat.TryGetValue(kind, out var h) ? h : 1);
            switch (kind)
            {
                case "disturbance": case "resist": case "brandish": case "shots": case "weapon":
                case "theft": case "breakin": case "trespass": case "assault": case "speeding": case "poaching":
                    Stars = Math.Max(Stars, 1); break;
                case "robbery": case "copShot": Stars = Math.Max(Stars, 2); break;
                case "kill": Kills++; Stars = Math.Max(Stars, 1 + Kills / 3); break;
                case "copKill": if (++CopKills >= 3) HeatLevel = 5; Stars = Math.Min(5, Math.Max(Stars + 1, 3)); break;
                case "carjack": Stars = Math.Max(Stars, nearPolice ? 1 : 0); break;
            }
            if (Kills >= 8) HeatLevel = 5;
            if (HeatLevel >= 4) Stars = Math.Max(Stars, HeatLevel);
            Stars = Math.Min(5, Stars);
            MaxStars = Math.Max(MaxStars, Stars);
            if (Stars > before) Cool = 0;
        }

        /// <summary>Officers open fire: serious crime, or you have a gun out in front of them (or they were shot at).</summary>
        public bool Lethal(bool gunDrawn, bool provoked = false) => HeatLevel >= 3 || gunDrawn || provoked;

        /// <summary>Advance: `seen` is whether the police have you (in sight, or still on their way to where you were last seen).</summary>
        public void Update(double dt, bool seen)
        {
            if (Stars <= 0) return;
            Cool = seen ? 0 : Cool + dt;
            if (Cool > 8 + Stars * 4)
            {
                Stars--; Cool = 4.5;
                if (Stars == 0) { Escaped?.Invoke(MaxStars, Kills); Clear(); }
            }
        }

        public bool CanArrest(bool onFoot, bool gunDrawn, double speed, double nearestOfficer) => Stars > 0 && HeatLevel <= 2 && onFoot && !gunDrawn && speed < 1.2 && nearestOfficer < 2.4;

        /// <summary>At least this many stars, now (a mission's "lose the police"): heat to match, the search fresh.</summary>
        public void Force(int stars)
        {
            Stars = Math.Min(5, Math.Max(Stars, stars));
            HeatLevel = Math.Max(HeatLevel, Math.Min(2, stars));
            MaxStars = Math.Max(MaxStars, Stars);
            Cool = 0;
        }

        public void Clear() { Stars = 0; HeatLevel = 0; Kills = 0; MaxStars = 0; CopKills = 0; Cool = 0; }
    }

    public static class LaneRoute
    {
        /// <summary>The lanes to drive from lane `from` to lane `to` (both included), shortest by length; empty if there's no way.
        /// The graph: lane k carries on into next[nextStart[k] .. nextStart[k + 1] - 1].</summary>
        public static List<int> Find(int[] nextStart, int[] next, float[] length, int from, int to)
        {
            int n = length.Length;
            var dist = new double[n]; var prev = new int[n];
            for (int i = 0; i < n; i++) { dist[i] = double.MaxValue; prev[i] = -1; }
            var open = new SortedSet<(double d, int lane)>();
            dist[from] = 0; open.Add((0, from));
            while (open.Count > 0)
            {
                var (d, a) = open.Min; open.Remove(open.Min);
                if (a == to) break;
                if (d > dist[a]) continue;
                for (int e = nextStart[a]; e < nextStart[a + 1]; e++)
                {
                    int b = next[e]; double nd = d + length[a];
                    if (nd < dist[b]) { if (dist[b] < double.MaxValue) open.Remove((dist[b], b)); dist[b] = nd; prev[b] = a; open.Add((nd, b)); }
                }
            }
            var route = new List<int>();
            if (from != to && prev[to] < 0) return route;
            for (int at = to; at >= 0; at = at == from ? -1 : prev[at]) route.Add(at);
            route.Reverse();
            return route;
        }
    }
}
