// Little pictures the HUD draws, made in code so there's nothing to import: the wanted star and the
// player's arrow on the minimap. Anti-aliased by supersampling, white on clear (tinted where drawn).
using UnityEngine;

namespace Southbound
{
    public static class HudArt
    {
        static Texture2D star, arrow;

        public static Texture2D Star => star != null ? star : star = Polygon(64, StarPoints(), "wanted star");
        public static Texture2D Arrow => arrow != null ? arrow : arrow = Polygon(64, new[] { new Vector2(0.5f, 0.95f), new Vector2(0.86f, 0.08f), new Vector2(0.5f, 0.28f), new Vector2(0.14f, 0.08f) }, "map arrow");

        static Vector2[] StarPoints()
        {
            var poly = new Vector2[10];
            for (int k = 0; k < 10; k++)
            {
                float r = k % 2 == 0 ? 0.48f : 0.2f, a = Mathf.PI / 2 + k * Mathf.PI / 5;
                poly[k] = new Vector2(0.5f + r * Mathf.Cos(a), 0.47f + r * Mathf.Sin(a));
            }
            return poly;
        }

        /// <summary>A filled polygon (points in 0..1, y up) on a clear square.</summary>
        public static Texture2D Polygon(int size, Vector2[] poly, string name)
        {
            var tex = new Texture2D(size, size, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp, name = name };
            var px = new Color32[size * size];
            for (int y = 0; y < size; y++)
                for (int x = 0; x < size; x++)
                {
                    int inside = 0;
                    for (int sy = 0; sy < 4; sy++)
                        for (int sx = 0; sx < 4; sx++)
                            if (Inside(poly, new Vector2((x + (sx + 0.5f) / 4) / size, (y + (sy + 0.5f) / 4) / size))) inside++;
                    px[y * size + x] = new Color32(255, 255, 255, (byte)(inside * 255 / 16));
                }
            tex.SetPixels32(px);
            tex.Apply(false, true);
            return tex;
        }

        static bool Inside(Vector2[] poly, Vector2 p)
        {
            bool c = false;
            for (int i = 0, j = poly.Length - 1; i < poly.Length; j = i++)
                if ((poly[i].y > p.y) != (poly[j].y > p.y) && p.x < (poly[j].x - poly[i].x) * (p.y - poly[i].y) / (poly[j].y - poly[i].y) + poly[i].x) c = !c;
            return c;
        }
    }
}
