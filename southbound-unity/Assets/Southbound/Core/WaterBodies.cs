// Calvera's inland water split the way HDRP's water system wants it: a water surface built on a custom
// mesh is always level, so each flat body (Lake Arden at 45 m, the pond at ~22 m) becomes its own
// lake, and the cells of the rivers running downhill to the coast stay a sloped mesh. Cells are the
// world grid's (4 m), wet where all four corners carry a water level above the sea.
using System;
using System.Collections.Generic;
using System.Linq;

namespace Southbound.Core
{
    public sealed class WaterBody
    {
        public bool Lake;
        /// <summary>The lake's surface height (the median of its cells); rivers keep each corner's own level.</summary>
        public float Level;
        public readonly List<(int i, int j)> Cells = new List<(int, int)>();
    }

    public static class WaterBodies
    {
        public static bool Wet(CalveraWorld w, int i, int j, out float level)
        {
            int n = w.N; level = 0;
            float a = w.Water[j * n + i], b = w.Water[j * n + i + 1], c = w.Water[(j + 1) * n + i + 1], d = w.Water[(j + 1) * n + i];
            if (float.IsNaN(a) || float.IsNaN(b) || float.IsNaN(c) || float.IsNaN(d)) return false;
            if (Math.Max(Math.Max(a, b), Math.Max(c, d)) < w.SeaLevel + 0.3) return false; // that's the sea
            level = (a + b + c + d) / 4;
            return true;
        }

        /// <summary>Flat bodies of at least minLakeCells cells within `step` metres of one level become lakes; the rest is river.</summary>
        public static List<WaterBody> Split(CalveraWorld w, int minLakeCells = 150, double step = 0.5)
        {
            int n = w.N, m = n - 1;
            var level = new float[m * m];
            var key = new int[m * m];
            for (int j = 0; j < m; j++)
                for (int i = 0; i < m; i++)
                {
                    int k = j * m + i;
                    if (Wet(w, i, j, out float lv)) { level[k] = lv; key[k] = (int)Math.Round(lv / step); }
                    else key[k] = int.MinValue;
                }
            var seen = new bool[m * m];
            var bodies = new List<WaterBody>();
            var river = new WaterBody { Lake = false };
            var q = new Queue<int>();
            for (int s = 0; s < m * m; s++)
            {
                if (seen[s] || key[s] == int.MinValue) continue;
                // the connected cells at this rounded level
                var comp = new List<int>();
                seen[s] = true; q.Enqueue(s);
                while (q.Count > 0)
                {
                    int k = q.Dequeue(); comp.Add(k);
                    int i = k % m, j = k / m;
                    void Try(int x, int y)
                    {
                        if (x < 0 || y < 0 || x >= m || y >= m) return;
                        int kk = y * m + x;
                        if (seen[kk] || key[kk] != key[s]) return;
                        seen[kk] = true; q.Enqueue(kk);
                    }
                    Try(i + 1, j); Try(i - 1, j); Try(i, j + 1); Try(i, j - 1);
                }
                if (comp.Count >= minLakeCells)
                {
                    var lake = new WaterBody { Lake = true };
                    var levels = comp.Select(k => level[k]).OrderBy(v => v).ToList();
                    lake.Level = levels[levels.Count / 2];
                    foreach (var k in comp) lake.Cells.Add((k % m, k / m));
                    bodies.Add(lake);
                }
                else foreach (var k in comp) river.Cells.Add((k % m, k / m));
            }
            bodies.Sort((a, b) => b.Cells.Count.CompareTo(a.Cells.Count));
            if (river.Cells.Count > 0) bodies.Add(river);
            return bodies;
        }
    }
}
