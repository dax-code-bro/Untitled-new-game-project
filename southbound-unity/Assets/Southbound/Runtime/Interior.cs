// A building's inside (the web game's estate.js buildInterior), built when you walk in, inside the building itself
// (its collision box is set aside while you're in): painted drywall on the walls, wood floors in homes and concrete
// elsewhere, a ceiling, windows bright with daylight (dark at night), the front door, and furniture from the open
// house interior pack placed the browser's way: a home has a living room (sofa on a rug, a TV, a bookshelf, a
// lamp), a walled bedroom, a kitchen and a dining table (a house a fireplace and a tiled bathroom too); an office has
// rows of desks with monitors; a store shelves of stock and fridges; a bar a counter, stools, tables and a chandelier;
// a warehouse racks and stacked crates. Lights on after dark (and always in shops and offices).
using System.Collections.Generic;
using Southbound.Core;
using UnityEngine;

namespace Southbound
{
    public sealed class Interior
    {
        public GameObject Root;
        public float W, D, H;
        public string Kind;
        /// <summary>Points inside, in world space: the way out, where you buy or sleep, the wardrobe.</summary>
        public Vector3 Exit, Bed, Wardrobe;

        static Material wallMat, ceilMat, glassDay, glassNight, darkWood, white;

        /// <summary>Build it in the building's footprint, the front door on the door's wall.</summary>
        public static Interior Build(Door d, Vector3 floorAt, System.Func<string, GameObject> model, double hour, System.Func<string, Material> surface)
        {
            var b = d.B;
            var r = new Mulberry32((uint)(d.I * 31 + 7)); System.Func<double> rnd = r.Next;
            string kind = Estate.Kind(d); rnd(); rnd();   // (the browser's dice, in its order)
            // along the door's normal the room is D deep, across it W wide (fit inside the walls)
            double across = d.Nx != 0 ? b.D : b.W, deep = d.Nx != 0 ? b.W : b.D;
            float W = (float)System.Math.Max(9, System.Math.Min(across - 1, kind == "warehouse" ? 26 : 18)), D = (float)System.Math.Max(8, System.Math.Min(deep - 1, kind == "warehouse" ? 22 : 14));
            W = Mathf.Min(W, (float)across - 0.6f); D = Mathf.Min(D, (float)deep - 0.6f);
            float H = kind == "warehouse" ? 7 : 3.2f;
            var it = new Interior { W = W, D = D, H = H, Kind = kind };
            var root = new GameObject("Interior " + d.I);
            // the room's +z is toward the door (Unity: the web normal with x mirrored)
            var normal = new Vector3(-(float)d.Nx, 0, (float)d.Nz);
            root.transform.SetPositionAndRotation(floorAt, Quaternion.LookRotation(normal));
            it.Root = root;
            Mats(surface);
            var wallC = new[] { new Color(0.93f, 0.92f, 0.9f), new Color(0.84f, 0.86f, 0.88f), new Color(0.9f, 0.89f, 0.85f), new Color(0.78f, 0.82f, 0.77f), new Color(0.86f, 0.84f, 0.82f), new Color(0.96f, 0.95f, 0.94f) }[(int)(rnd() * 6)];
            var walls = new Material(wallMat); walls.SetColor("_BaseColor", wallC); walls.color = wallC;
            bool home = kind == "home" || kind == "apartment";
            var floor = surface(home ? "WoodFloor007" : "Concrete034") ?? darkWood;
            Box(root, W + 0.4f, 0.2f, D + 0.4f, 0, -0.2f, 0, floor, true, home ? "floor" : "masonry");
            Box(root, W + 0.4f, 0.2f, D + 0.4f, 0, H, 0, ceilMat, true, "drywall");
            string outer = home ? "frame" : kind == "warehouse" ? "metal" : "block";
            Box(root, W + 0.4f, H, 0.2f, 0, 0, -D / 2 - 0.1f, walls, true, outer);
            // the front wall with a doorway in its middle
            Box(root, W / 2 - 0.6f, H, 0.2f, -(W / 4 + 0.3f), 0, D / 2 + 0.1f, walls, true, outer);
            Box(root, W / 2 - 0.6f, H, 0.2f, W / 4 + 0.3f, 0, D / 2 + 0.1f, walls, true, outer);
            Box(root, 1.2f, H - 2.3f, 0.2f, 0, 2.3f, D / 2 + 0.1f, walls, true, outer);
            Box(root, 0.2f, H, D, -W / 2 - 0.1f, 0, 0, walls, true, outer);
            Box(root, 0.2f, H, D, W / 2 + 0.1f, 0, 0, walls, true, outer);
            // windows on the back wall: daylight, or black after dark
            bool day = hour > 6.5 && hour < 19.5;
            for (float x = -W / 2 + 2; x < W / 2 - 1.5f; x += 3.2f) Box(root, 1.6f, 1.4f, 0.02f, x, 0.9f, -D / 2 + 0.01f, day ? glassDay : glassNight, false, null);
            Box(root, 1.1f, 2.2f, 0.06f, 0, 0, D / 2 + 0.24f, darkWood, false, null);   // the door, standing open outside
            System.Func<string[], string> pick = a => a[(int)(rnd() * a.Length)];
            // furniture (the web game's put(model, size, x, z, rot, axis, solid, y); x mirrored into Unity)
            void Put(string name, float size, float x, float z, float rot = 0, bool byHeight = false, bool solid = true, float y = 0)
            {
                var prefab = model(name);
                if (prefab == null) return;
                var go = Object.Instantiate(prefab, root.transform);
                foreach (var c in go.GetComponentsInChildren<Collider>()) Object.Destroy(c);
                go.transform.localRotation = Quaternion.Euler(0, -rot * Mathf.Rad2Deg, 0);
                var bounds = Bounds(go);
                float k = (byHeight ? bounds.size.y : Mathf.Max(bounds.size.x, bounds.size.y, bounds.size.z));
                if (k > 0.001f) go.transform.localScale *= size / k;
                // centred where the browser puts it (x mirrored), standing on y
                bounds = Bounds(go);
                var target = root.transform.TransformPoint(new Vector3(-x, y, z));
                go.transform.position += target - new Vector3(bounds.center.x, bounds.min.y, bounds.center.z);
                if (solid)
                {
                    bounds = Bounds(go);
                    var col = new GameObject("furniture").AddComponent<BoxCollider>();
                    col.transform.SetParent(root.transform, false);
                    col.transform.position = bounds.center; col.size = root.transform.InverseTransformVector(bounds.size); col.size = new Vector3(Mathf.Abs(col.size.x), Mathf.Abs(col.size.y), Mathf.Abs(col.size.z));
                    col.gameObject.AddComponent<SurfaceTag>().surface = "wood";
                }
            }
            void F(float w, float h, float dd, float x, float z, Color c, float y = 0, bool solid = true) { var m = new Material(wallMat); m.SetColor("_BaseColor", c); m.color = c; Box(root, w, h, dd, x, y, z, m, solid, "wood"); }
            string Plant() => pick(new[] { "Houseplant_1", "Houseplant_3", "Houseplant_5", "Houseplant_7" });
            if (home)
            {
                Put(pick(new[] { "Carpet_1", "Carpet_2", "Carpet_Round" }), 3.2f, -W / 4, -D / 2 + 2.6f, 0, false, false);
                Put(rnd() < 0.5 ? "GlamVelvetSofa" : "SheenWoodLeatherSofa", 2.3f, -W / 4, -D / 2 + 1.0f);
                Put("Table_RoundSmall", 0.9f, -W / 4, -D / 2 + 2.5f);
                Put("Drawer_1", 1.5f, -W / 4, -D / 2 + 4.3f, Mathf.PI);
                Box(root, 1.3f, 0.75f, 0.06f, -W / 4, 1.0f, -D / 2 + 4.3f, TvMat(), false, null);   // the TV on its stand
                Put(pick(new[] { "Light_Floor1", "Light_Floor2", "Light_Stand1" }), 1.7f, -W / 2 + 0.6f, -D / 2 + 0.6f, 0, true);
                Put("Bookshelf", 2.0f, -W / 2 + 0.35f, 0.5f, Mathf.PI / 2, true);
                Put(Plant(), 1.2f, -W / 2 + 0.6f, D / 2 - 0.8f, 0, true);
                Put(pick(new[] { "Bed_King", "Bed_Single" }), 2.2f, W / 4 + 0.4f, -D / 2 + 1.3f);
                Put("NightStand_1", 0.6f, W / 4 - 0.9f, -D / 2 + 0.45f, 0, true);
                Put("Light_Desk", 0.5f, W / 4 - 0.9f, -D / 2 + 0.45f, 0, true, false, 0.62f);
                Put(pick(new[] { "Drawer_2", "Drawer_3" }), 1.3f, W / 2 - 0.35f, -D / 2 + 2.6f, -Mathf.PI / 2);
                Put("Kitchen_Fridge", 1.9f, W / 2 - 0.45f, D / 2 - 0.7f, -Mathf.PI / 2, true);
                Put("Kitchen_Oven", 0.95f, W / 2 - 0.4f, D / 2 - 1.6f, -Mathf.PI / 2, true);
                Put("Kitchen_Sink", 0.95f, W / 2 - 0.4f, D / 2 - 2.4f, -Mathf.PI / 2, true);
                Put("Kitchen_2Drawers", 0.95f, W / 2 - 0.4f, D / 2 - 3.3f, -Mathf.PI / 2, true);
                Put("Table_RoundLarge", 1.3f, W / 4 - 0.6f, D / 4);
                Put("SheenChair", 0.95f, W / 4 - 0.6f, D / 4 - 1.0f, 0, true);
                Put("SheenChair", 0.95f, W / 4 - 0.6f, D / 4 + 1.0f, Mathf.PI, true);
                Put("ChairDamaskPurplegold", 1.0f, W / 4 - 1.6f, D / 4, Mathf.PI / 2, true);
                Put("Lantern", 0.45f, W / 4 - 0.6f, D / 4, 0, true, false, 0.75f);
                if (b.Style == 4) { Put("Fireplace", 1.6f, -W / 2 + 0.4f, -1.8f, Mathf.PI / 2); Put("Bathroom_Toilet", 0.8f, -W / 2 + 0.5f, D / 2 - 2.0f, Mathf.PI / 2, true); Put("Bathroom_Sink", 0.9f, -W / 2 + 0.4f, D / 2 - 3.0f, Mathf.PI / 2, true); }
                foreach (var cx in new[] { -W / 4, W / 4 }) Put("Curtains_Double", 2.2f, cx, -D / 2 + 0.12f, 0, false, false, 0.4f);
                // the bedroom's walls and doorway; a house's bathroom
                float pw = 0.12f, door = 1.0f;
                Box(root, pw, H, D / 2 - 1.6f, 0.15f, 0, -D / 2 + (D / 2 - 1.6f) / 2, walls, true, "drywall");
                Box(root, pw, H, 0.4f, 0.15f, 0, -0.4f, walls, true, "drywall");
                float bw = W / 2 - 0.15f - 1.4f - door;
                Box(root, bw, H, pw, 0.15f + bw / 2, 0, -0.2f, walls, true, "drywall");
                Box(root, 1.4f, H, pw, W / 2 - 0.7f, 0, -0.2f, walls, true, "drywall");
                if (b.Style == 4)
                {
                    var tiles = surface("BathroomTiles02"); if (tiles != null) Box(root, 2.35f, 0.012f, 3.95f, -W / 2 + 1.2f, 0, D / 2 - 2.0f, tiles, false, null);
                    Box(root, pw, H, 4 - door - 0.3f, -W / 2 + 2.4f, 0, D / 2 - 4 + (4 - door - 0.3f) / 2, walls, true, "drywall");
                    Box(root, 2.4f, H, pw, -W / 2 + 1.2f, 0, D / 2 - 4, walls, true, "drywall");
                }
                Put("Trashcan_Small1", 0.4f, W / 2 - 0.4f, D / 2 - 4.0f, 0, true);
                Put("BoomBox", 0.5f, -W / 4 + 0.7f, -D / 2 + 4.3f, Mathf.PI, false, false, 0.8f);
                it.Bed = root.transform.TransformPoint(new Vector3(-(W / 4 + 0.4f), 0, -D / 2 + 3.2f));
                it.Wardrobe = root.transform.TransformPoint(new Vector3(-(W / 2 - 1.2f), 0, -D / 2 + 2.6f));
            }
            else if (kind == "office")
            {
                for (float x = -W / 2 + 2.2f; x < W / 2 - 1.5f; x += 3.2f)
                    for (float z = -D / 2 + 2.2f; z < D / 2 - 2.5f; z += 2.8f)
                    {
                        Put("Kitchen_2Drawers", 0.78f, x, z, 0, true);
                        Box(root, 0.55f, 0.34f, 0.04f, x, 0.98f, z - 0.1f, TvMat(), false, null);
                        Put("Light_Desk", 0.45f, x + 0.45f, z - 0.1f, 0, true, false, 0.78f);
                        Put(rnd() < 0.5 ? "Chair_3" : "Chair_4", 0.95f, x, z + 0.75f, Mathf.PI, true);
                    }
                Put("Couch_Medium1", 2.0f, -W / 2 + 1.4f, D / 2 - 1.0f, Mathf.PI);
                Put("Shelf_Large", 2.0f, W / 2 - 0.35f, 0, -Mathf.PI / 2, true);
                Put(Plant(), 1.3f, W / 2 - 0.6f, D / 2 - 0.6f, 0, true); Put(Plant(), 1.3f, -W / 2 + 0.6f, -D / 2 + 0.6f, 0, true);
                Put("WaterBottle", 0.3f, -W / 2 + 2.0f, D / 2 - 1.0f, 0, true, false, 0.45f);
            }
            else if (kind == "store")
            {
                var stock = new[] { new Color(0.69f, 0.19f, 0.19f), new Color(0.19f, 0.44f, 0.69f), new Color(0.82f, 0.63f, 0.13f), new Color(0.19f, 0.56f, 0.29f), new Color(0.88f, 0.88f, 0.88f) };
                for (float x = -W / 2 + 2.2f; x < W / 2 - 3; x += 2.6f)
                    foreach (var zc in new[] { -1.6f, 0.8f })
                    {
                        Put("Shelf_Large", 1.9f, x, zc, Mathf.PI / 2, true);
                        for (int lv = 0; lv < 4; lv++) for (int k = 0; k < 6; k++)
                            F(0.16f, 0.24f, 0.2f, x + (k % 2 == 1 ? 0.08f : -0.08f), zc + (k - 2.5f) * 0.3f, stock[(((k + lv + (int)Mathf.Floor(x)) % 5) + 5) % 5], 0.12f + 1.9f * (0.06f + lv * 0.24f), false);
                    }
                for (int k = 0; k < 3; k++) Put("CommercialRefrigerator", 2.0f, -W / 2 + 1.5f + k * 1.3f, -D / 2 + 0.55f, 0, true);
                Put("Kitchen_3Drawers", 2.2f, W / 2 - 2, D / 2 - 2.5f, Mathf.PI);
                Put("Trashcan_Large", 0.9f, W / 2 - 0.6f, D / 2 - 0.6f, 0, true);
            }
            else if (kind == "bar")
            {
                for (int k = 0; k < 3; k++) Put("Kitchen_3Drawers", 2.2f, -2.3f + k * 2.3f, -D / 2 + 2, Mathf.PI);
                F(W - 3, 2.2f, 0.3f, 0, -D / 2 + 0.3f, new Color(0.23f, 0.14f, 0.09f));
                for (float x = -3.5f; x <= 3.5f; x += 1.2f) Put("Stool", 0.75f, x, -D / 2 + 3.0f, 0, true);
                for (float x = -W / 2 + 2; x < W / 2 - 1; x += 3.2f) { Put(pick(new[] { "Table_RoundSmall", "Table_RoundSmall2" }), 1.0f, x, 1.6f); Put("Chair_2", 0.9f, x - 0.8f, 1.6f, Mathf.PI / 2, true); Put("Chair_2", 0.9f, x + 0.8f, 1.6f, -Mathf.PI / 2, true); Put("Lantern", 0.4f, x, 1.6f, 0, true, false, 0.78f); }
                Put("Couch_L", 2.6f, -W / 2 + 1.6f, D / 2 - 1.6f, Mathf.PI);
                Put("Light_Chandelier", 1.0f, 0, 0, 0, true, false, H - 1.05f);
            }
            else
            {
                for (float x = -W / 2 + 2; x < W / 2 - 2; x += 3.4f) Put("Shelf_Large", 2.4f, x, -D / 2 + 1, 0, true);
                for (float x = -W / 2 + 2; x < W / 2 - 2; x += 3.2f) for (float z = -D / 2 + 4; z < D / 2 - 3; z += 4) { int hh = 1 + (int)(rnd() * 3); for (int k = 0; k < hh; k++) F(1.3f, 1.1f, 1.3f, x + (float)(rnd() - 0.5) * 0.3f, z, new Color(0.54f, 0.42f, 0.25f), k * 1.1f, k == 0); }
            }
            foreach (var lx in new[] { -W / 4, W / 4 }) Put(pick(new[] { "Light_Ceiling1", "Light_Ceiling2", "Light_Ceiling4" }), 0.6f, lx, 0, 0, true, false, H - 0.62f);
            // the lights: homes by day are lit by the windows (soft, cooler); after dark, and always in shops and offices, the ceiling lights
            bool dayIn = home && hour > 7.5 && hour < 18.5;
            var lc = dayIn ? new Color(0.93f, 0.95f, 1f) : home ? new Color(1f, 0.93f, 0.87f) : new Color(0.96f, 0.97f, 1f);
            foreach (var lx in new[] { -W / 4, W / 4 })
            {
                var lg = new GameObject("Ceiling light"); lg.transform.SetParent(root.transform, false); lg.transform.localPosition = new Vector3(lx, H - 0.3f, 0);
                var l = lg.AddComponent<Light>(); l.type = LightType.Point; l.color = lc; l.range = Mathf.Max(W, D) * (dayIn ? 1.3f : 1f);
                l.intensity = kind == "warehouse" ? 6f : dayIn ? 1.5f : 3f; l.shadows = LightShadows.Soft;
            }
            it.Exit = root.transform.TransformPoint(new Vector3(0, 0, D / 2 - 1.2f));
            if (it.Bed == default) it.Bed = root.transform.TransformPoint(new Vector3(2, 0, D / 2 - 2));
            if (it.Wardrobe == default) it.Wardrobe = it.Bed;
            return it;
        }

        static Bounds Bounds(GameObject go)
        {
            var rs = go.GetComponentsInChildren<Renderer>();
            if (rs.Length == 0) return new Bounds(go.transform.position, Vector3.zero);
            var b = rs[0].bounds; foreach (var r in rs) b.Encapsulate(r.bounds); return b;
        }

        static void Box(GameObject root, float w, float h, float d, float x, float y, float z, Material m, bool solid, string surf)
        {
            var go = GameObject.CreatePrimitive(PrimitiveType.Cube);
            go.transform.SetParent(root.transform, false);
            // (x mirrored: the browser's room into Unity's)
            go.transform.localPosition = new Vector3(-x, y + h / 2, z); go.transform.localScale = new Vector3(w, h, d);
            go.GetComponent<MeshRenderer>().sharedMaterial = m;
            if (!solid) Object.Destroy(go.GetComponent<Collider>());
            else if (surf != null) go.AddComponent<SurfaceTag>().surface = surf;
        }

        static Material TvMat()
        {
            var m = CraftBody.Paint((0.02f, 0.02f, 0.03f, 0.2f, 0f));
            if (m.HasProperty("_EmissiveColor")) { m.EnableKeyword("_EMISSIVE_COLOR_MAP"); m.SetColor("_EmissiveColor", new Color(0.16f, 0.31f, 0.5f) * 300f); }
            return m;
        }

        static void Mats(System.Func<string, Material> surface)
        {
            if (wallMat != null) return;
            wallMat = CraftBody.Paint((0.93f, 0.92f, 0.9f, 0.9f, 0f));
            ceilMat = CraftBody.Paint((0.95f, 0.94f, 0.92f, 0.9f, 0f));
            darkWood = CraftBody.Paint((0.23f, 0.16f, 0.11f, 0.6f, 0f));
            glassNight = CraftBody.Paint((0.03f, 0.04f, 0.06f, 0.1f, 0f));
            glassDay = CraftBody.Paint((0.75f, 0.84f, 0.93f, 0.1f, 0f));
            if (glassDay.HasProperty("_EmissiveColor")) { glassDay.SetColor("_EmissiveColor", new Color(0.75f, 0.84f, 0.93f) * 4000f); }
            white = CraftBody.Paint((0.95f, 0.95f, 0.95f, 0.5f, 0f));
        }
    }
}
