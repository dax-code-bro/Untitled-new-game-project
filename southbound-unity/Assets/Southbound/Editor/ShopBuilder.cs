// Puts the shops into the Calvera scene: the Shops component with every walk-in building the street export
// listed (Data/World/calvera-shops.json; the buildings themselves come with StreetBuilder), the keepers'
// models (the web game's townspeople, by the look each keeper was given) and the animation skeleton.
using System.Linq;
using Southbound.Core;
using UnityEditor;
using UnityEngine;

namespace Southbound.EditorTools
{
    public static class ShopBuilder
    {
        static readonly string[] People = { "mh_m1", "mh_m2", "mh_m3", "mh_m4", "mh_f1", "mh_f2" };

        public static void Build()
        {
            var list = ShopCatalog.Load(ShopCatalog.DefaultFile(Paths.ProjectRoot));
            if (list.Count == 0) { Debug.LogWarning("Southbound: no shops (node tools/southbound/export-unity.mjs street writes Data/World/calvera-shops.json)."); return; }
            var go = new GameObject("Shops");
            var shops = go.AddComponent<Shops>();
            var models = People.Select(n => (n, m: AssetDatabase.LoadAssetAtPath<GameObject>($"{Paths.Models}/people/{n}.glb"))).Where(x => x.m != null).ToArray();
            shops.people = models.Select(x => x.m).ToArray();
            shops.peopleNames = models.Select(x => x.n).ToArray();
            shops.skeleton = AssetDatabase.LoadAssetAtPath<GameObject>($"{Paths.Models}/anims/ual.glb");
            Vector3 U(double x, double y, double z) { var (ux, uz) = CalveraWorld.ToUnity(x, z); return new Vector3((float)ux, (float)y, (float)uz); }
            shops.shops = list.Select(s =>
            {
                var (cx, cz) = s.Counter;
                return new Shops.Shop
                {
                    id = s.Id, kind = s.Kind, name = s.Name, keeper = s.Keeper, blurb = s.Blurb, look = s.Look, hours = s.Hours,
                    priceK = (float)s.PriceK, lines = s.Lines,
                    keeperAt = U(s.KeeperX, s.KeeperY, s.KeeperZ), keeperYaw = (float)CalveraWorld.YawToUnity(s.Face),
                    counter = U(cx, s.KeeperY, cz), door = U(s.DoorX, s.KeeperY, s.DoorZ),
                };
            }).ToArray();
            Debug.Log($"Southbound: {list.Count} walk-in buildings ({list.Count(s => s.Kind == "guns")} gun stores, {list.Count(s => s.Kind == "mart")} Gulf Marts, {list.Count(s => s.Kind == "clothes")} clothing stores, and {string.Join(", ", list.Where(s => !s.Sells).Select(s => s.Name))}).");
        }
    }
}
