// Puts the HUD into the Calvera scene: UI Toolkit panel settings with Unity's default runtime theme (a
// one-line .tss, the same file Unity writes when you make a PanelSettings by hand), the map of Calvera
// baked from the world data (Core/MapRaster, 2048 px for 4 km: 2 m a pixel) and the Hud component.
using System.IO;
using Southbound.Core;
using UnityEditor;
using UnityEngine;
using UnityEngine.UIElements;

namespace Southbound.EditorTools
{
    public static class HudBuilder
    {
        const string Dir = Paths.Root + "/UI";
        const int MapPx = 2048;

        public static void Build(CalveraWorld w)
        {
            Directory.CreateDirectory(Paths.Abs(Dir));
            // the theme: Unity's default runtime look (fonts, label defaults)
            string tss = Dir + "/SouthboundTheme.tss";
            if (!File.Exists(Paths.Abs(tss)))
            {
                File.WriteAllText(Paths.Abs(tss), "@import url(\"unity-theme://default\");\n");
                AssetDatabase.ImportAsset(tss, ImportAssetOptions.ForceUpdate);
            }
            var theme = AssetDatabase.LoadAssetAtPath<ThemeStyleSheet>(tss);
            // panel settings: scaled from a 1920 x 1080 layout, half by width and half by height
            string ps = Dir + "/HudPanel.asset";
            var panel = AssetDatabase.LoadAssetAtPath<PanelSettings>(ps);
            if (panel == null) { panel = ScriptableObject.CreateInstance<PanelSettings>(); AssetDatabase.CreateAsset(panel, ps); }
            panel.themeStyleSheet = theme;
            panel.scaleMode = PanelScaleMode.ScaleWithScreenSize;
            panel.referenceResolution = new Vector2Int(1920, 1080);
            panel.screenMatchMode = PanelScreenMatchMode.MatchWidthOrHeight;
            panel.match = 0.5f;
            EditorUtility.SetDirty(panel);
            // the map
            var rgba = MapRaster.Render(w, MapPx);
            var tex = new Texture2D(MapPx, MapPx, TextureFormat.RGBA32, false);
            tex.LoadRawTextureData(rgba);
            tex.Apply();
            string png = Dir + "/calvera-map.png";
            File.WriteAllBytes(Paths.Abs(png), tex.EncodeToPNG());
            Object.DestroyImmediate(tex);
            AssetDatabase.ImportAsset(png, ImportAssetOptions.ForceUpdate);
            if (AssetImporter.GetAtPath(png) is TextureImporter imp)
            {
                imp.textureType = TextureImporterType.Default;
                imp.sRGBTexture = true; imp.mipmapEnabled = true; imp.wrapMode = TextureWrapMode.Clamp;
                imp.maxTextureSize = MapPx; imp.textureCompression = TextureImporterCompression.CompressedHQ;
                imp.SaveAndReimport();
            }
            AssetDatabase.SaveAssets();
            var go = new GameObject("HUD");
            var hud = go.AddComponent<Hud>();
            hud.panel = panel;
            hud.map = AssetDatabase.LoadAssetAtPath<Texture2D>(png);
            hud.mapSize = (float)w.Size;
            Debug.Log($"Southbound: HUD with a {MapPx} px map of Calvera ({w.Size / MapPx:0.#} m a pixel){(theme == null ? " (no theme: plain font)" : "")}.");
        }
    }
}
