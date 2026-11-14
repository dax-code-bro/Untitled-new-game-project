// Wear and tear for Calvera's streets and buildings, as HDRP decals: oil drips in the lanes, crack
// networks in the asphalt, skid marks at the junctions, manhole covers, and the grime that creeps up
// the base of every wall (rain splash, dust, mildew in the Gulf damp). The textures are generated
// here (value-noise based, tileable where it matters) and the decals are placed along the world's
// roads and buildings, deterministically, so the editor just turns the list into DecalProjectors.
//
// Coordinates are the web game's world (x, z metres; the editor mirrors x into Unity).
using System;
using System.Collections.Generic;

namespace Southbound.Core
{
    public enum DecalKind { Oil, Cracks, Skid, Manhole, Grime }

    public struct DecalSpot
    {
        public DecalKind Kind;
        /// <summary>Centre (web world x, z); for grime, the middle of the wall's foot.</summary>
        public double X, Z;
        /// <summary>Heading of the decal's length along the ground (radians, web convention: 0 = +z).</summary>
        public double Heading;
        /// <summary>Width across, length along (metres); grime: width = wall length, length = height up the wall.</summary>
        public double Width, Length;
        /// <summary>Grime only: the building's ground height (metres) and the wall's outward normal (x, z).</summary>
        public double Y, Nx, Nz;
    }

    public static class Decals
    {
        // ------------------------------------------------------------------ noise
        static double Hash(int x, int y, int seed)
        {
            unchecked
            {
                uint h = (uint)(x * 374761393 + y * 668265263 + seed * 2147483647);
                h = (h ^ (h >> 13)) * 1274126177u;
                return ((h ^ (h >> 16)) & 0xffffff) / (double)0x1000000;
            }
        }

        /// <summary>Smooth value noise, tileable with period `period` cells.</summary>
        public static double Noise(double x, double y, int seed, int period = 1 << 20)
        {
            int ix = (int)Math.Floor(x), iy = (int)Math.Floor(y);
            double fx = x - ix, fy = y - iy;
            fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
            int x0 = ((ix % period) + period) % period, y0 = ((iy % period) + period) % period;
            int x1 = (x0 + 1) % period, y1 = (y0 + 1) % period;
            double a = Hash(x0, y0, seed), b = Hash(x1, y0, seed), c = Hash(x0, y1, seed), d = Hash(x1, y1, seed);
            return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
        }

        public static double Fbm(double x, double y, int seed, int octaves = 5, int period = 1 << 20)
        {
            double s = 0, amp = 0.5, norm = 0;
            for (int o = 0; o < octaves; o++) { s += amp * Noise(x, y, seed + o * 17, period); norm += amp; x *= 2; y *= 2; period *= 2; amp *= 0.5; }
            return s / norm;
        }

        static double Smooth(double e0, double e1, double v) { double t = Math.Max(0, Math.Min(1, (v - e0) / (e1 - e0))); return t * t * (3 - 2 * t); }

        // ------------------------------------------------------------------ textures (RGBA floats, row 0 = bottom)
        /// <summary>The decal's maps: base colour with alpha (opacity), and smoothness (0..1) per texel.</summary>
        public sealed class DecalImage { public int Size; public float[] Rgba; public float[] Smoothness; }

        public static DecalImage Texture(DecalKind kind, int size, int seed)
        {
            var img = new DecalImage { Size = size, Rgba = new float[size * size * 4], Smoothness = new float[size * size] };
            for (int j = 0; j < size; j++)
                for (int i = 0; i < size; i++)
                {
                    double u = (i + 0.5) / size, v = (j + 0.5) / size;
                    double r = 0, g = 0, b = 0, a = 0, sm = 0.3;
                    switch (kind)
                    {
                        case DecalKind.Oil:
                        {
                            // a drip pool: a dark core, rainbow-free brown-black edges, irregular outline
                            double dx = u - 0.5, dy = v - 0.5, d = Math.Sqrt(dx * dx + dy * dy) * 2;
                            double edge = 0.62 + 0.3 * (Fbm(u * 6, v * 6, seed, 4) - 0.5);
                            double core = 1 - Smooth(edge * 0.35, edge, d);
                            double spots = Smooth(0.55, 0.7, Fbm(u * 18, v * 18, seed + 5, 3)) * (1 - Smooth(edge, edge * 1.25, d));
                            a = Math.Min(1, core * 0.85 + spots * 0.4) * (0.75 + 0.25 * Fbm(u * 30, v * 30, seed + 9, 2));
                            r = 0.018; g = 0.016; b = 0.014; sm = 0.62;
                            break;
                        }
                        case DecalKind.Cracks:
                        {
                            // a branching crack network: thin dark lines where a ridged noise peaks
                            double n1 = Math.Abs(Fbm(u * 5, v * 5, seed, 5) - 0.5) * 2;
                            double n2 = Math.Abs(Fbm(u * 11 + 3.1, v * 11 + 7.3, seed + 3, 4) - 0.5) * 2;
                            double line = 1 - Smooth(0.0, 0.035, n1);
                            double fine = (1 - Smooth(0.0, 0.025, n2)) * 0.6;
                            double fade = 1 - Smooth(0.35, 0.5, Math.Max(Math.Abs(u - 0.5), Math.Abs(v - 0.5)));
                            a = Math.Min(1, line + fine) * fade;
                            r = 0.02; g = 0.02; b = 0.02; sm = 0.2;
                            break;
                        }
                        case DecalKind.Skid:
                        {
                            // two rubber streaks (the tyres) fading along their length
                            double t1 = Math.Abs(u - 0.3), t2 = Math.Abs(u - 0.7);
                            double streak = Math.Max(1 - Smooth(0.03, 0.08, t1), 1 - Smooth(0.03, 0.08, t2));
                            double along = Smooth(0.0, 0.15, v) * (1 - Smooth(0.6, 1.0, v));
                            a = streak * along * (0.55 + 0.45 * Fbm(u * 4, v * 40, seed, 3)) * 0.8;
                            r = 0.012; g = 0.012; b = 0.012; sm = 0.45;
                            break;
                        }
                        case DecalKind.Grime:
                        {
                            // splash and mildew at the foot of a wall: dark at the ground, fading up, streaked
                            double up = v; // 0 at the ground
                            double streaks = Fbm(u * 24, v * 2.5, seed, 4);
                            double fade = 1 - Smooth(0.0, 0.9 * (0.6 + 0.6 * streaks), up);
                            double blotch = 0.6 + 0.4 * Fbm(u * 8, v * 8, seed + 2, 4);
                            a = Math.Min(1, fade * blotch * 0.85);
                            double green = Fbm(u * 3, v * 3, seed + 7, 3); // mildew tint in places
                            r = 0.07; g = 0.07 + 0.02 * green; b = 0.055; sm = 0.15;
                            break;
                        }
                        default: a = 0; break;
                    }
                    int k = (j * size + i) * 4;
                    img.Rgba[k] = (float)r; img.Rgba[k + 1] = (float)g; img.Rgba[k + 2] = (float)b; img.Rgba[k + 3] = (float)Math.Max(0, Math.Min(1, a));
                    img.Smoothness[j * size + i] = (float)sm;
                }
            return img;
        }

        // ------------------------------------------------------------------ placement
        /// <summary>Where the decals go: along every road (oil in the lanes, cracks, manholes), at the
        /// junctions (skids, a manhole), and at the foot of every building wall (grime).</summary>
        public static List<DecalSpot> Place(CalveraWorld w, int seed = 1987)
        {
            var spots = new List<DecalSpot>();
            var rnd = new Mulberry32((uint)seed);
            // junctions: road points that come within 6 m of another road's points
            var junctions = RoadNetwork.Junctions(w);
            foreach (var (jx, jz) in junctions)
            {
                spots.Add(new DecalSpot { Kind = DecalKind.Manhole, X = jx + (rnd.Next() - 0.5) * 3, Z = jz + (rnd.Next() - 0.5) * 3, Heading = rnd.Next() * Math.PI, Width = 1.2, Length = 1.2 });
                if (rnd.Next() < 0.6)
                    spots.Add(new DecalSpot { Kind = DecalKind.Skid, X = jx + (rnd.Next() - 0.5) * 8, Z = jz + (rnd.Next() - 0.5) * 8, Heading = rnd.Next() * Math.PI * 2, Width = 1.8, Length = 6 + rnd.Next() * 8 });
            }
            // along each road: something every ~12 m, more oil in the lanes of town streets
            foreach (var road in w.Roads)
            {
                var pts = road.Points;
                if (pts.Count < 2) continue;
                double carry = 0;
                for (int k = 1; k < pts.Count; k++)
                {
                    double ax = pts[k - 1].x, az = pts[k - 1].z, bx = pts[k].x, bz = pts[k].z;
                    double seg = Math.Sqrt((bx - ax) * (bx - ax) + (bz - az) * (bz - az));
                    if (seg < 1e-6) continue;
                    double hx = (bx - ax) / seg, hz = (bz - az) / seg, heading = Math.Atan2(hx, hz);
                    for (double t = 12 - carry; t < seg; t += 12)
                    {
                        double cx = ax + hx * t, cz = az + hz * t;
                        double roll = rnd.Next();
                        double lane = (rnd.Next() < 0.5 ? -1 : 1) * road.Width * 0.22; // the middle of a lane: where engines drip
                        double sx = -hz, sz = hx; // across the road
                        if (roll < 0.45)
                            spots.Add(new DecalSpot { Kind = DecalKind.Oil, X = cx + sx * lane, Z = cz + sz * lane, Heading = heading, Width = 0.9 + rnd.Next() * 0.9, Length = 1.4 + rnd.Next() * 1.6 });
                        else if (roll < 0.75)
                        {
                            double off = (rnd.Next() - 0.5) * road.Width * 0.6;
                            double size = 3 + rnd.Next() * 3;
                            spots.Add(new DecalSpot { Kind = DecalKind.Cracks, X = cx + sx * off, Z = cz + sz * off, Heading = rnd.Next() * Math.PI * 2, Width = size, Length = size });
                        }
                        else if (roll < 0.8)
                            spots.Add(new DecalSpot { Kind = DecalKind.Manhole, X = cx + sx * lane, Z = cz + sz * lane, Heading = heading, Width = 1.2, Length = 1.2 });
                    }
                    carry = (carry + seg) % 12;
                }
            }
            // grime at the foot of every building wall
            foreach (var b in w.Buildings)
            {
                double hw = b.W / 2, hd = b.D / 2;
                var walls = new (double cx, double cz, double nx, double nz, double len)[]
                {
                    (b.X + hw, b.Z, 1, 0, b.D), (b.X - hw, b.Z, -1, 0, b.D), (b.X, b.Z + hd, 0, 1, b.W), (b.X, b.Z - hd, 0, -1, b.W),
                };
                foreach (var (cx, cz, nx, nz, len) in walls)
                    spots.Add(new DecalSpot { Kind = DecalKind.Grime, X = cx, Z = cz, Nx = nx, Nz = nz, Y = b.Y, Width = len, Length = 0.9 + rnd.Next() * 0.9 });
            }
            return spots;
        }
    }
}
