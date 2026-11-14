// Grass for Calvera's terrain in Unity: real 3D tufts (the web game's grasscards.js shape: thin tapered
// strands rooted round a small patch, each leaning and curling its own way) planted as terrain detail
// meshes, and where they grow: on the web game's grass and dry-grass ground (its splat), thinner under the
// forest, never on roads, pavements, building footprints, water or bare rock; a short verge along the roads.
using System;
using System.Collections.Generic;

namespace Southbound.Core
{
    public sealed class TuftMesh
    {
        public readonly List<float> Positions = new List<float>(), Normals = new List<float>(), Uvs = new List<float>();
        public readonly List<int> Indices = new List<int>();
        public int Vertices => Positions.Count / 3;
    }

    public static class GroundCover
    {
        /// <summary>Shades per tuft texture (columns): each blade takes one, so a tuft is several greens or straws.</summary>
        public const int Shades = 8;

        /// <summary>One tuft: `blades` strands within `radius` of the root, up to `height` tall (metres, y up, Unity space:
        /// symmetric, so no mirroring matters). u picks the blade's shade column and runs across it; v runs up it.</summary>
        public static TuftMesh Tuft(int blades, double radius, double height, int seed)
        {
            var m = new TuftMesh();
            var rnd = new Mulberry32((uint)seed);
            double[] rows = { 0, 0.4, 0.75 };
            for (int j = 0; j < blades; j++)
            {
                double a = rnd.Next() * Math.PI * 2, r = Math.Sqrt(rnd.Next()) * radius;
                double bx = Math.Cos(a) * r, bz = Math.Sin(a) * r;
                double face = a + (rnd.Next() - 0.5) * 1.6;                 // most lean away from the middle of the tuft
                double hk = (0.5 + Math.Pow(rnd.Next(), 0.8) * 0.7) * height;
                double w = 0.004 + rnd.Next() * 0.006;                      // 4-10 mm across at the root
                double lean = 0.08 + Math.Pow(rnd.Next(), 1.5) * 0.45;      // how far over the tip goes (share of the height)
                double curl = (rnd.Next() - 0.5) * 0.7;                      // a twist round the stem as it goes up
                int shade = (int)(rnd.Next() * Shades) % Shades;
                double lx = Math.Cos(face), lz = Math.Sin(face);
                int baseV = m.Vertices;
                for (int k = 0; k <= rows.Length; k++)
                {
                    bool tip = k == rows.Length;
                    double t = tip ? 1 : rows[k];
                    // the stem bends over more toward the tip
                    double off = lean * hk * t * t, y = hk * (t - 0.35 * lean * t * t);
                    double cx = bx + lx * off, cz = bz + lz * off;
                    // the blade's flat side: across the lean direction, turning with the curl
                    double ang = face + Math.PI / 2 + curl * t;
                    double sx = Math.Cos(ang), sz = Math.Sin(ang);
                    // the normal: out of the blade's face, tipped well up so both sides light like grass does
                    double fx = Math.Cos(ang - Math.PI / 2), fz = Math.Sin(ang - Math.PI / 2);
                    double nx = fx * 0.45, ny = 0.85, nz = fz * 0.45, nl = Math.Sqrt(nx * nx + ny * ny + nz * nz);
                    double half = w / 2 * (1 - t * 0.85);
                    foreach (int side in tip ? new[] { 0 } : new[] { -1, 1 })
                    {
                        m.Positions.Add((float)(cx + sx * half * side)); m.Positions.Add((float)y); m.Positions.Add((float)(cz + sz * half * side));
                        m.Normals.Add((float)(nx / nl)); m.Normals.Add((float)(ny / nl)); m.Normals.Add((float)(nz / nl));
                        m.Uvs.Add((float)((shade + 0.5 + side * 0.4) / Shades)); m.Uvs.Add((float)t);
                    }
                }
                for (int k = 0; k < rows.Length - 1; k++)
                {
                    int o = baseV + k * 2;
                    m.Indices.AddRange(new[] { o, o + 1, o + 3, o, o + 3, o + 2 });
                }
                int last = baseV + (rows.Length - 1) * 2;
                m.Indices.AddRange(new[] { last, last + 1, last + 2 });
            }
            return m;
        }

        /// <summary>Where grass grows: tufts per detail cell (res x res over the whole map, web space: cell (i, j)
        /// is centred at x = -half + (i + 0.5) * size / res, z likewise) for the green, dry and short-verge layers.</summary>
        public sealed class Plan
        {
            public int Res;
            public double CellSize;
            public byte[] Green, Dry, Verge;
        }

        /// <summary>The ground's make-up at a point: (sand, forest floor, dry grass, paved), 0..1 each (the web game's splat).</summary>
        public delegate (float sand, float forest, float dry, float paved) Splat(double x, double z);

        public static Plan Place(CalveraWorld w, int res, Splat splat, int maxPerCell = 12, int seed = 11)
        {
            double cs = w.Size / res;
            var p = new Plan { Res = res, CellSize = cs, Green = new byte[res * res], Dry = new byte[res * res], Verge = new byte[res * res] };
            // 0 open ground, 1 a verge (short grass only), 2 nothing grows
            var block = new byte[res * res];
            void Mark(double x0, double z0, double x1, double z1, Func<double, double, byte> what)
            {
                int i0 = Math.Max(0, (int)Math.Floor((x0 + w.Half) / cs)), i1 = Math.Min(res - 1, (int)Math.Floor((x1 + w.Half) / cs));
                int j0 = Math.Max(0, (int)Math.Floor((z0 + w.Half) / cs)), j1 = Math.Min(res - 1, (int)Math.Floor((z1 + w.Half) / cs));
                for (int j = j0; j <= j1; j++)
                    for (int i = i0; i <= i1; i++)
                    {
                        double x = -w.Half + (i + 0.5) * cs, z = -w.Half + (j + 0.5) * cs;
                        byte v = what(x, z);
                        if (v > block[j * res + i]) block[j * res + i] = v;
                    }
            }
            foreach (var r in w.Roads)
            {
                double half = r.Width / 2, bare = half + 0.8, verge = half + 3.0;
                for (int k = 1; k < r.Points.Count; k++)
                {
                    var (ax, az) = r.Points[k - 1]; var (bx, bz) = r.Points[k];
                    double vx = bx - ax, vz = bz - az, l2 = vx * vx + vz * vz;
                    Mark(Math.Min(ax, bx) - verge, Math.Min(az, bz) - verge, Math.Max(ax, bx) + verge, Math.Max(az, bz) + verge, (x, z) =>
                    {
                        double t = l2 < 1e-9 ? 0 : Math.Max(0, Math.Min(1, ((x - ax) * vx + (z - az) * vz) / l2));
                        double dx = x - (ax + vx * t), dz = z - (az + vz * t), d = Math.Sqrt(dx * dx + dz * dz);
                        return d < bare ? (byte)2 : d < verge ? (byte)1 : (byte)0;
                    });
                }
            }
            foreach (var b in w.Buildings)
                Mark(b.X - b.W / 2 - 0.6, b.Z - b.D / 2 - 0.6, b.X + b.W / 2 + 0.6, b.Z + b.D / 2 + 0.6, (x, z) => 2);

            var rnd = new Mulberry32((uint)seed);
            for (int j = 0; j < res; j++)
                for (int i = 0; i < res; i++)
                {
                    int c = j * res + i;
                    double x = -w.Half + (i + 0.5) * cs, z = -w.Half + (j + 0.5) * cs;
                    double jitter = rnd.Next();
                    if (block[c] == 2) continue;
                    double h = w.HeightAt(x, z);
                    // water over the ground, and the beach below the tide line
                    int hi = (int)Math.Round((x + w.Half) / w.Cell), hj = (int)Math.Round((z + w.Half) / w.Cell);
                    hi = Math.Max(0, Math.Min(w.N - 1, hi)); hj = Math.Max(0, Math.Min(w.N - 1, hj));
                    float wl = w.Water[hj * w.N + hi];
                    if (!float.IsNaN(wl) && wl > h - 0.15) continue;
                    if (h < w.SeaLevel + 0.4) continue;
                    // steep ground is bare rock
                    double sx = w.HeightAt(x + 1, z) - w.HeightAt(x - 1, z), sz = w.HeightAt(x, z + 1) - w.HeightAt(x, z - 1);
                    double slope = Math.Sqrt(sx * sx + sz * sz) / 2;
                    if (slope > 0.85) continue;
                    var (sand, forest, dry, paved) = splat(x, z);
                    double rest = 1 - paved;
                    double wSand = sand * rest; rest -= wSand;
                    double wForest = forest * rest; rest -= wForest;
                    double wDry = dry * rest; rest -= wDry;
                    double wGrass = rest;
                    // patchy: clumps and thin spots, never a carpet laid out in a grid
                    double patch = 0.55 + 0.7 * Decals.Fbm(x / 9, z / 9, seed, 3);
                    double steep = 1 - Math.Max(0, (slope - 0.5) / 0.35);
                    double green = (wGrass + wForest * 0.2) * patch * steep, dryAmt = (wDry + wSand * 0.08) * patch * steep;
                    int n(double amt) => (int)Math.Min(maxPerCell, Math.Floor(amt * maxPerCell + jitter));
                    if (block[c] == 1)
                    {   // the verge: short, mown-looking grass where the ground would grow some
                        p.Verge[c] = (byte)n((green + dryAmt * 0.5) * 0.8);
                        continue;
                    }
                    p.Green[c] = (byte)n(green);
                    p.Dry[c] = (byte)n(dryAmt);
                }
            return p;
        }
    }
}
