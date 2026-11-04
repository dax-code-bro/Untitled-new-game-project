// Southbound's surface library: 29 photo-scanned CC0 PBR sets from ambientCG,
// Poly Haven and cgbookcase. The project ships 512 px copies (what the web game
// streams); on a desktop the editor downloads the originals at 2K, 4K or 8K
// straight from the three sites, which is where the detail comes from.
// This file has no Unity dependency so the downloader is tested on CI.
using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Net.Http;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;

namespace Southbound.Core
{
    public enum TextureSource { AmbientCG, PolyHaven, CgBookcase }

    public sealed class MaterialSet
    {
        public string Name;
        public TextureSource Source;
        /// <summary>Real-world size of one tile of the texture, metres.</summary>
        public double TileMeters;
        /// <summary>What the game uses it for (the web game's SURF key).</summary>
        public string Use;
        public string SourceId => Source == TextureSource.CgBookcase ? CgSlug(Name) : Name;
        public string License => "CC0 1.0";
        public string Credit => Source switch
        {
            TextureSource.AmbientCG => $"{Name} by ambientCG (ambientcg.com), CC0",
            TextureSource.PolyHaven => $"{Name} by Poly Haven (polyhaven.com), CC0",
            _ => $"{Name} by cgbookcase (cgbookcase.com), CC0",
        };

        /// <summary>"RustyCorrugatedMetalPanel01" -> "rusty-corrugated-metal-panel-01"</summary>
        public static string CgSlug(string name) => Regex.Replace(Regex.Replace(name, "(?<=[a-z])(?=[A-Z])|(?<=[A-Za-z])(?=[0-9])", "-"), "[A-Z]", m => m.Value.ToLowerInvariant());
    }

    public static class MaterialLibrary
    {
        static MaterialSet A(string n, double m, string use) => new MaterialSet { Name = n, Source = TextureSource.AmbientCG, TileMeters = m, Use = use };
        static MaterialSet H(string n, double m, string use) => new MaterialSet { Name = n, Source = TextureSource.PolyHaven, TileMeters = m, Use = use };
        static MaterialSet C(string n, double m, string use) => new MaterialSet { Name = n, Source = TextureSource.CgBookcase, TileMeters = m, Use = use };

        public static readonly MaterialSet[] Sets =
        {
            A("Grass004", 2.4, "grass"), A("Ground037", 3.0, "dry"), H("forest_ground_04", 3.0, "forest"), H("coast_sand_01", 3.0, "sand"),
            A("Rock030", 6.0, "rock"), H("asphalt_02", 4.0, "asphalt"), A("Concrete034", 2.5, "concrete"), H("brick_wall_10", 2.5, "bricks"),
            H("plastered_wall_03", 3.0, "plaster"), A("Facade002", 15.0, "glass"), A("Facade014", 80.0, "office"), A("Facade012", 30.0, "facade"),
            A("Asphalt012", 3.2, "road"), H("square_concrete_pavers", 2.4, "pavers"), C("Cobblestone01", 1.6, "cobble"), H("red_brick", 2.2, "redbrick"),
            C("StuccoWall01", 2.6, "stucco"), H("weathered_plank_siding", 2.4, "siding"), A("RoofingTiles013A", 2.6, "shingles"),
            A("CorrugatedSteel005", 2.2, "steel"), C("RustyCorrugatedMetalPanel01", 2.2, "rusty"), H("brown_mud", 3.0, "mud"),
            H("forest_leaves_02", 2.6, "leaves"), C("Dirt01", 2.2, "dirt"), A("Gravel004", 1.6, "gravel"), H("cliff_side", 7.0, "cliff"),
            A("WoodFloor007", 2.0, "woodfloor"), C("BathroomTiles02", 1.5, "tiles"), A("Ground068", 3.0, "ground"),
        };

        public static MaterialSet Get(string nameOrUse) => Sets.FirstOrDefault(s => s.Name == nameOrUse || s.Use == nameOrUse);

        /// <summary>The maps we keep, and the words each site uses for them in file names.</summary>
        public static readonly (string map, string[] words)[] Maps =
        {
            ("Color", new[] { "Color", "BaseColor", "diff", "Diffuse", "albedo" }),
            ("Normal", new[] { "NormalGL", "norgl", "Normal" }),
            ("Roughness", new[] { "Roughness", "rough", "Rough" }),
            ("AO", new[] { "AmbientOcclusion", "AO", "ao" }),
            ("Height", new[] { "Displacement", "disp", "Height", "height" }),
            ("Metal", new[] { "Metalness", "Metallic", "metal", "Metal" }),
            ("Emission", new[] { "Emission", "emit" }),
        };

        /// <summary>Which of our maps a downloaded file is ("Rock030_4K-JPG_NormalGL.jpg" -> Normal). Null if unwanted.</summary>
        public static string ClassifyFile(string fileName)
        {
            string n = Path.GetFileNameWithoutExtension(fileName);
            if (Regex.IsMatch(n, "NormalDX|nor_dx|_DX$", RegexOptions.IgnoreCase)) return null; // DirectX normals: we use OpenGL (+Y) like Unity
            if (Regex.IsMatch(n, "preview|thumb|sphere|_arm_|Opacity", RegexOptions.IgnoreCase)) return null;
            n = Regex.Replace(n, "nor_gl", "norgl", RegexOptions.IgnoreCase);
            var tokens = Regex.Split(n, "[_\\-. ]+");
            for (int t = tokens.Length - 1; t >= 0; t--)
                foreach (var (map, words) in Maps)
                    if (words.Any(w => string.Equals(w, tokens[t], StringComparison.OrdinalIgnoreCase))) return map;
            return null;
        }
    }

    public sealed class FetchResult
    {
        public MaterialSet Set;
        public string Resolution;
        public Dictionary<string, string> Files = new Dictionary<string, string>();
        public List<string> Log = new List<string>();
        public bool Ok => Files.ContainsKey("Color") && Files.ContainsKey("Normal");
        public string Error;
    }

    /// <summary>Downloads original-resolution maps for a set from its CC0 source site.</summary>
    public sealed class MaterialFetcher : IDisposable
    {
        readonly HttpClient http;
        public MaterialFetcher(HttpClient client = null)
        {
            http = client ?? new HttpClient { Timeout = TimeSpan.FromMinutes(10) };
            if (!http.DefaultRequestHeaders.UserAgent.Any()) http.DefaultRequestHeaders.UserAgent.ParseAdd("Southbound-Unity/1.0 (+https://github.com/dax-code-bro/Untitled-new-game-project)");
        }
        public void Dispose() => http.Dispose();

        /// <summary>res: "1K", "2K", "4K" or "8K".</summary>
        public async Task<FetchResult> FetchAsync(MaterialSet set, string res, string outDir, CancellationToken ct = default)
        {
            var r = new FetchResult { Set = set, Resolution = res };
            Directory.CreateDirectory(outDir);
            try
            {
                switch (set.Source)
                {
                    case TextureSource.AmbientCG: await AmbientCG(set, res, outDir, r, ct); break;
                    case TextureSource.PolyHaven: await PolyHaven(set, res, outDir, r, ct); break;
                    case TextureSource.CgBookcase: await CgBookcase(set, res, outDir, r, ct); break;
                }
                if (!r.Ok && r.Error == null) r.Error = $"missing maps (got {string.Join(", ", r.Files.Keys)})";
            }
            catch (Exception e) { r.Error = e.GetType().Name + ": " + e.Message; }
            return r;
        }

        async Task<byte[]> Get(string url, FetchResult r, CancellationToken ct)
        {
            r.Log.Add("GET " + url);
            using (var resp = await http.GetAsync(url, ct).ConfigureAwait(false))
            {
                resp.EnsureSuccessStatusCode();
                return await resp.Content.ReadAsByteArrayAsync().ConfigureAwait(false);
            }
        }

        void Unzip(byte[] zip, string outDir, FetchResult r)
        {
            using (var z = new ZipArchive(new MemoryStream(zip), ZipArchiveMode.Read))
                foreach (var e in z.Entries)
                {
                    string map = MaterialLibrary.ClassifyFile(e.Name);
                    string ext = Path.GetExtension(e.Name).ToLowerInvariant();
                    if (map == null || (ext != ".jpg" && ext != ".jpeg" && ext != ".png")) continue;
                    if (r.Files.ContainsKey(map)) continue;
                    string dst = Path.Combine(outDir, map + ext);
                    using (var s = e.Open()) using (var f = File.Create(dst)) s.CopyTo(f);
                    r.Files[map] = dst;
                }
        }

        // ambientCG: one zip per resolution, e.g. https://ambientcg.com/get?file=Rock030_4K-JPG.zip
        async Task AmbientCG(MaterialSet set, string res, string outDir, FetchResult r, CancellationToken ct)
        {
            string url = $"https://ambientcg.com/get?file={set.SourceId}_{res.ToUpperInvariant()}-JPG.zip";
            byte[] zip;
            try { zip = await Get(url, r, ct); }
            catch (HttpRequestException)
            {
                // fall back to the API, which lists the real download links
                string api = $"https://ambientcg.com/api/v2/full_json?id={set.SourceId}&include=downloadData";
                var j = MiniJson.Parse(System.Text.Encoding.UTF8.GetString(await Get(api, r, ct)));
                string link = FindStrings(j).FirstOrDefault(s => s.Contains($"_{res.ToUpperInvariant()}-JPG") && s.EndsWith(".zip", StringComparison.OrdinalIgnoreCase) && s.StartsWith("http"));
                if (link == null) throw new Exception($"ambientCG has no {res}-JPG download for {set.SourceId}");
                zip = await Get(link, r, ct);
            }
            Unzip(zip, outDir, r);
        }

        // Poly Haven: the API lists every map at every resolution, e.g. https://api.polyhaven.com/files/asphalt_02
        async Task PolyHaven(MaterialSet set, string res, string outDir, FetchResult r, CancellationToken ct)
        {
            var j = MiniJson.Parse(System.Text.Encoding.UTF8.GetString(await Get($"https://api.polyhaven.com/files/{set.SourceId}", r, ct))) as Dictionary<string, object>;
            if (j == null) throw new Exception("Poly Haven: bad response");
            var want = new (string map, string[] keys)[]
            {
                ("Color", new[] { "Diffuse", "diff" }), ("Normal", new[] { "nor_gl" }), ("Roughness", new[] { "Rough", "rough" }),
                ("AO", new[] { "AO", "ao" }), ("Height", new[] { "Displacement", "disp" }), ("Metal", new[] { "Metal", "metal" }),
            };
            string rk = res.ToLowerInvariant();
            foreach (var (map, keys) in want)
            {
                var entry = keys.Select(k => j.Obj(k)).FirstOrDefault(e => e != null);
                if (entry == null) continue;
                var byRes = entry.Obj(rk) ?? entry.Obj("2k") ?? entry.Obj("1k");
                if (byRes == null) continue;
                var file = byRes.Obj("jpg") ?? byRes.Obj("png");
                string url = file?.Text("url");
                if (url == null) continue;
                string dst = Path.Combine(outDir, map + Path.GetExtension(new Uri(url).AbsolutePath).ToLowerInvariant());
                File.WriteAllBytes(dst, await Get(url, r, ct));
                r.Files[map] = dst;
            }
        }

        // cgbookcase: the texture page's Download button goes to a "thanks" page
        // (/textures/thanks?t=Cobblestone01_MR_2K.zip&r=2&u=Cobblestone01) that hands out the zip.
        // Their sets top out at 2K.
        async Task CgBookcase(MaterialSet set, string res, string outDir, FetchResult r, CancellationToken ct)
        {
            var root = new Uri("https://www.cgbookcase.com/");
            string page = System.Text.Encoding.UTF8.GetString(await Get(new Uri(root, $"textures/{set.SourceId}").ToString(), r, ct));
            var links = Links(page, root);
            string want = res.ToUpperInvariant() == "1K" ? "1K" : "2K";
            string thanks = links.FirstOrDefault(u => u.Contains($"_{want}.zip")) ?? links.FirstOrDefault(u => u.Contains(".zip"));
            if (thanks == null) throw new Exception($"cgbookcase: no download button on the page ({links.Count} links)");
            if (!thanks.Contains($"_{want}.zip"))
                thanks = Regex.Replace(Regex.Replace(thanks, @"_\dK\.zip", $"_{want}.zip"), @"([?&]r=)\d", "${1}" + want.Substring(0, 1));
            string file = Regex.Match(thanks, @"[?&]t=([^&]+\.zip)").Groups[1].Value;
            if (file.Length == 0) file = Path.GetFileName(new Uri(thanks).AbsolutePath);
            byte[] zip = null;
            if (new Uri(thanks).AbsolutePath.EndsWith(".zip", StringComparison.OrdinalIgnoreCase)) zip = await Get(thanks, r, ct);
            else
            {
                byte[] body = await Get(thanks, r, ct);
                if (IsZip(body)) zip = body; // the thanks URL served the file itself
                else
                {
                    string html = System.Text.Encoding.UTF8.GetString(body);
                    var direct = Links(html, new Uri(thanks)).Concat(Regex.Matches(html, @"https?://[^\s""'<>()]+").Cast<Match>().Select(m => m.Value.Replace("&amp;", "&")))
                        .FirstOrDefault(u => u.Contains(file) && !u.Contains("/textures/thanks"));
                    var candidates = new List<string>();
                    if (direct != null) candidates.Add(direct);
                    string name = set.Name;
                    candidates.Add($"https://cdn.cgbookcase.cloud/file/cgbookcase/textures/downloads/{name}/{file}");
                    candidates.Add($"https://cdn.cgbookcase.cloud/file/cgbookcase/textures/downloads/{file}");
                    candidates.Add($"https://cgbookcase.b-cdn.net/textures/downloads/{name}/{file}");
                    foreach (var c in candidates)
                    {
                        try { var b = await Get(c, r, ct); if (IsZip(b)) { zip = b; break; } }
                        catch (HttpRequestException e) { r.Log.Add("  " + e.Message); }
                    }
                    if (zip == null)
                    {
                        int at = html.IndexOf(".zip", StringComparison.OrdinalIgnoreCase);
                        r.Log.Add("thanks page: " + (at >= 0 ? html.Substring(Math.Max(0, at - 300), Math.Min(600, html.Length - Math.Max(0, at - 300))) : html.Substring(0, Math.Min(600, html.Length))).Replace('\n', ' '));
                        throw new Exception($"cgbookcase: couldn't find the file behind {thanks}");
                    }
                }
            }
            Unzip(zip, outDir, r);
        }

        static bool IsZip(byte[] b) => b != null && b.Length > 4 && b[0] == 'P' && b[1] == 'K';

        static List<string> Links(string html, Uri baseUri) =>
            Regex.Matches(html, "(?:href|src)=\"([^\"]+)\"").Cast<Match>()
                .Select(m => m.Groups[1].Value.Replace("&amp;", "&"))
                .Select(u => Uri.TryCreate(baseUri, u, out var abs) ? abs.ToString() : u)
                .Distinct().ToList();

        static IEnumerable<string> FindStrings(object o)
        {
            switch (o)
            {
                case string s: yield return s; break;
                case Dictionary<string, object> d: foreach (var v in d.Values) foreach (var s in FindStrings(v)) yield return s; break;
                case List<object> a: foreach (var v in a) foreach (var s in FindStrings(v)) yield return s; break;
            }
        }
    }
}
