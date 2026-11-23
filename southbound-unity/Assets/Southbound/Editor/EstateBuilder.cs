// Property in the Calvera scene: Homes (every building's door, the 246 properties, the interiors built when you walk
// in) with a light copy of the world (roads and buildings) so a build has it, the building collision boxes (set aside
// while you're inside one), the furniture (the open house interior pack and the Khronos sofas, chairs, fridge, lantern),
// and Gulf Coast Realty's sign. Runs in Build Calvera scene and Add the new features to this scene.
using System.IO;
using System.Linq;
using Southbound.Core;
using UnityEditor;
using UnityEngine;

namespace Southbound.EditorTools
{
    public static class EstateBuilder
    {
        static readonly string[] Pack =
        {
            "Carpet_1", "Carpet_2", "Carpet_Round", "Table_RoundSmall", "Table_RoundSmall2", "Table_RoundLarge", "Drawer_1", "Drawer_2", "Drawer_3", "Light_Floor1", "Light_Floor2", "Light_Stand1", "Bookshelf",
            "Houseplant_1", "Houseplant_3", "Houseplant_5", "Houseplant_7", "Bed_King", "Bed_Single", "NightStand_1", "Light_Desk", "Kitchen_Fridge", "Kitchen_Oven", "Kitchen_Sink", "Kitchen_2Drawers", "Kitchen_3Drawers",
            "Fireplace", "Bathroom_Toilet", "Bathroom_Sink", "Curtains_Double", "Trashcan_Small1", "Trashcan_Large", "Couch_Medium1", "Couch_L", "Shelf_Large", "Stool", "Chair_2", "Chair_3", "Chair_4",
            "Light_Chandelier", "Light_Ceiling1", "Light_Ceiling2", "Light_Ceiling4",
        };
        static readonly string[] Khronos = { "GlamVelvetSofa", "SheenWoodLeatherSofa", "SheenChair", "ChairDamaskPurplegold", "Lantern", "BoomBox", "WaterBottle", "CommercialRefrigerator", "DiffuseTransmissionPlant" };

        public static void Build()
        {
            string dataDir = CalveraWorld.DefaultFolder(Paths.ProjectRoot);
            string file = Path.Combine(dataDir, "calvera-world.json");
            if (!File.Exists(file)) return;
            EditorUtility.DisplayProgressBar("Southbound", "Property: doors, listings, furniture", 0.6f);
            foreach (var old in Object.FindObjectsByType<Homes>(FindObjectsSortMode.None)) Object.DestroyImmediate(old.gameObject);
            var oldSign = GameObject.Find("Gulf Coast Realty sign"); if (oldSign != null) Object.DestroyImmediate(oldSign);
            string dir = Paths.Generated + "/World"; Paths.Ensure(dir);
            File.WriteAllText(Paths.Abs(dir + "/calvera-lite.json"), CalveraWorld.LiteJson(File.ReadAllText(file)));
            AssetDatabase.ImportAsset(dir + "/calvera-lite.json", ImportAssetOptions.ForceUpdate);
            var h = new GameObject("Homes (doors, property, interiors)").AddComponent<Homes>();
            h.world = AssetDatabase.LoadAssetAtPath<TextAsset>(dir + "/calvera-lite.json");
            var bc = GameObject.Find("Building colliders"); if (bc != null) h.buildingColliders = bc.transform;
            var found = Pack.Select(n => (n, g: AssetDatabase.LoadAssetAtPath<GameObject>($"{Paths.Models}/open/quaternius/house_interior_pack/{n}.glb")))
                .Concat(Khronos.Select(n => (n, g: AssetDatabase.LoadAssetAtPath<GameObject>($"{Paths.Models}/open/khronos/{n}.glb")))).Where(x => x.g != null).ToList();
            h.furnitureNames = found.Select(x => x.n).ToArray();
            h.furniture = found.Select(x => x.g).ToArray();
            // the realtor's sign over its door
            var w = CalveraWorld.Load(dataDir);
            var L = MissionData.Load(MissionData.DefaultFile(Paths.ProjectRoot));
            var d = Estate.RealtorDoor(Estate.Doors(w), L);
            var n = new Vector3(-(float)d.Nx, 0, (float)d.Nz);
            var at = new Vector3(-(float)d.X, (float)d.B.Y + 3.4f, (float)d.Z) - n * 0.75f;
            CraftBuilder.Block("Gulf Coast Realty sign", new Vector3(3.4f, 0.8f, 0.1f), CraftBuilder.Paint(new Color(0.12f, 0.45f, 0.25f)), null, at, Quaternion.LookRotation(n), 0);
            Debug.Log($"Southbound: property: {w.Buildings.Count} doors, {Estate.Properties(Estate.Doors(w), L).Count} for sale, {h.furniture.Length} kinds of furniture.");
        }
    }
}
