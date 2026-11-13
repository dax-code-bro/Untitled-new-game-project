// Surface nets: turns a distance field into a closed triangle mesh (one vertex per grid cell the
// surface passes through, at the average of the edge crossings; one quad per crossed grid edge).
// The web game's carbuilder.js surfaceNets, line for line: the field is sampled coarsely (every 3rd
// point) and only refined near the surface, values are stored as float32 like the browser's
// Float32Array, and the triangles are wound to face along the field's gradient. Same grid, same
// field: the same mesh, vertex for vertex.
using System;
using System.Collections.Generic;

namespace Southbound.Core
{
    public sealed class SurfaceMesh
    {
        /// <summary>Vertex positions (float32, as a three.js position attribute), x y z per vertex.</summary>
        public float[] Positions;
        /// <summary>Unit normals from the field's gradient, x y z per vertex.</summary>
        public float[] Normals;
        public int[] Indices;
        public int VertexCount => Positions.Length / 3;
        public int TriangleCount => Indices.Length / 3;
    }

    public static class SurfaceNets
    {
        static readonly int[,] Co = { { 0, 0, 0 }, { 1, 0, 0 }, { 0, 1, 0 }, { 1, 1, 0 }, { 0, 0, 1 }, { 1, 0, 1 }, { 0, 1, 1 }, { 1, 1, 1 } };
        static readonly int[,] Ed = { { 0, 1 }, { 2, 3 }, { 4, 5 }, { 6, 7 }, { 0, 2 }, { 1, 3 }, { 4, 6 }, { 5, 7 }, { 0, 4 }, { 1, 5 }, { 2, 6 }, { 3, 7 } };

        public static SurfaceMesh Build(Sdf sdf, double[] min, double[] max, double h)
        {
            int nx = (int)Math.Ceiling((max[0] - min[0]) / h) + 2, ny = (int)Math.Ceiling((max[1] - min[1]) / h) + 2, nz = (int)Math.Ceiling((max[2] - min[2]) / h) + 2;
            var F = new float[nx * ny * nz];
            int Id(int i, int j, int k) => i + nx * (j + ny * k);
            // coarse pass (every 3rd point); fine points are only evaluated near the surface
            const int C = 3;
            int cx = (int)Math.Ceiling(nx / (double)C) + 1, cy = (int)Math.Ceiling(ny / (double)C) + 1, cz = (int)Math.Ceiling(nz / (double)C) + 1;
            var G = new float[cx * cy * cz];
            for (int k = 0; k < cz; k++) for (int j = 0; j < cy; j++) for (int i = 0; i < cx; i++)
                G[i + cx * (j + cy * k)] = (float)sdf(min[0] + i * C * h, min[1] + j * C * h, min[2] + k * C * h);
            double band = C * h * 1.9;
            for (int k = 0; k < nz; k++)
                for (int j = 0; j < ny; j++)
                    for (int i = 0; i < nx; i++)
                    {
                        if (i == 0 || j == 0 || k == 0 || i == nx - 1 || j == ny - 1 || k == nz - 1) { F[Id(i, j, k)] = 1; continue; }
                        int gi = (int)JsMath.Round(i / (double)C), gj = (int)JsMath.Round(j / (double)C), gk = (int)JsMath.Round(k / (double)C);
                        float g = G[gi + cx * (gj + cy * gk)];
                        F[Id(i, j, k)] = Math.Abs(g) > band ? g : (float)sdf(min[0] + i * h, min[1] + j * h, min[2] + k * h);
                    }
            var V = new int[nx * ny * nz];
            for (int q = 0; q < V.Length; q++) V[q] = -1;
            var pos = new List<double>();
            var c = new float[8];
            for (int k = 0; k < nz - 1; k++) for (int j = 0; j < ny - 1; j++) for (int i = 0; i < nx - 1; i++)
            {
                int mask = 0;
                for (int q = 0; q < 8; q++) { c[q] = F[Id(i + Co[q, 0], j + Co[q, 1], k + Co[q, 2])]; if (c[q] < 0) mask |= 1 << q; }
                if (mask == 0 || mask == 255) continue;
                double sx = 0, sy = 0, sz = 0; int n = 0;
                for (int e = 0; e < 12; e++)
                {
                    int a = Ed[e, 0], b = Ed[e, 1];
                    if ((c[a] < 0) == (c[b] < 0)) continue;
                    double t = c[a] / ((double)c[a] - c[b]);
                    sx += Co[a, 0] + (Co[b, 0] - Co[a, 0]) * t; sy += Co[a, 1] + (Co[b, 1] - Co[a, 1]) * t; sz += Co[a, 2] + (Co[b, 2] - Co[a, 2]) * t; n++;
                }
                V[Id(i, j, k)] = pos.Count / 3;
                pos.Add(min[0] + (i + sx / n) * h); pos.Add(min[1] + (j + sy / n) * h); pos.Add(min[2] + (k + sz / n) * h);
            }
            var nrm = new float[pos.Count];
            double eps = h * 0.5;
            for (int v = 0; v < pos.Count; v += 3)
            {
                double x = pos[v], y = pos[v + 1], z = pos[v + 2];
                double gx = sdf(x + eps, y, z) - sdf(x - eps, y, z), gy = sdf(x, y + eps, z) - sdf(x, y - eps, z), gz = sdf(x, y, z + eps) - sdf(x, y, z - eps);
                double l = Math.Sqrt(gx * gx + gy * gy + gz * gz); if (l == 0) l = 1;
                nrm[v] = (float)(gx / l); nrm[v + 1] = (float)(gy / l); nrm[v + 2] = (float)(gz / l);
            }
            var idx = new List<int>();
            void Tri(int a, int b, int cc)
            {
                // orient each triangle with the field gradient
                double ax = pos[b * 3] - pos[a * 3], ay = pos[b * 3 + 1] - pos[a * 3 + 1], az = pos[b * 3 + 2] - pos[a * 3 + 2];
                double bx = pos[cc * 3] - pos[a * 3], by = pos[cc * 3 + 1] - pos[a * 3 + 1], bz = pos[cc * 3 + 2] - pos[a * 3 + 2];
                double fx = ay * bz - az * by, fy = az * bx - ax * bz, fz = ax * by - ay * bx;
                double g = fx * ((double)nrm[a * 3] + nrm[b * 3] + nrm[cc * 3]) + fy * ((double)nrm[a * 3 + 1] + nrm[b * 3 + 1] + nrm[cc * 3 + 1]) + fz * ((double)nrm[a * 3 + 2] + nrm[b * 3 + 2] + nrm[cc * 3 + 2]);
                if (g >= 0) { idx.Add(a); idx.Add(b); idx.Add(cc); } else { idx.Add(a); idx.Add(cc); idx.Add(b); }
            }
            void Quad(int a, int b, int cc, int d) { if (a < 0 || b < 0 || cc < 0 || d < 0) return; Tri(a, b, cc); Tri(a, cc, d); }
            for (int k = 1; k < nz - 1; k++) for (int j = 1; j < ny - 1; j++) for (int i = 1; i < nx - 1; i++)
            {
                bool s0 = F[Id(i, j, k)] < 0;
                if (s0 != (F[Id(i + 1, j, k)] < 0)) Quad(V[Id(i, j - 1, k - 1)], V[Id(i, j, k - 1)], V[Id(i, j, k)], V[Id(i, j - 1, k)]);
                if (s0 != (F[Id(i, j + 1, k)] < 0)) Quad(V[Id(i - 1, j, k - 1)], V[Id(i, j, k - 1)], V[Id(i, j, k)], V[Id(i - 1, j, k)]);
                if (s0 != (F[Id(i, j, k + 1)] < 0)) Quad(V[Id(i - 1, j - 1, k)], V[Id(i, j - 1, k)], V[Id(i, j, k)], V[Id(i - 1, j, k)]);
            }
            var outPos = new float[pos.Count];
            for (int q = 0; q < pos.Count; q++) outPos[q] = (float)pos[q];
            return new SurfaceMesh { Positions = outPos, Normals = nrm, Indices = idx.ToArray() };
        }
    }
}
