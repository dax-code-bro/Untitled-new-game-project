// Real downloads from the three CC0 sites, one set from each. Run on CI (the
// sandbox this project is built in can't reach them) and by hand:
//   dotnet test southbound-unity/Tools/CoreTests --filter Category=Online
using System;
using System.IO;
using System.Linq;
using NUnit.Framework;
using Southbound.Core;

namespace Southbound.Tests
{
    [Category("Online")]
    public class OnlineTests
    {
        static string Out(string name) => Path.Combine(Path.GetTempPath(), "southbound-fetch", name);

        [TestCase("Asphalt012")]
        [TestCase("Rock030")]
        [TestCase("asphalt_02")]
        [TestCase("cliff_side")]
        [TestCase("Cobblestone01")]
        [TestCase("RustyCorrugatedMetalPanel01")]
        public void Downloads2K(string name)
        {
            using var f = new MaterialFetcher();
            var set = MaterialLibrary.Get(name);
            var r = f.FetchAsync(set, "2K", Out(name)).GetAwaiter().GetResult();
            TestContext.Progress.WriteLine($"{name} ({set.Source}): {(r.Ok ? "OK" : "FAILED " + r.Error)}");
            foreach (var l in r.Log) TestContext.Progress.WriteLine("   " + l);
            foreach (var kv in r.Files) TestContext.Progress.WriteLine($"   {kv.Key,-10} {new FileInfo(kv.Value).Length / 1024} KB");
            Assert.IsTrue(r.Ok, r.Error);
            Assert.Greater(new FileInfo(r.Files["Color"]).Length, 200_000, "a 2K colour map is more than 200 KB");
        }

        /// <summary>Prints what cgbookcase's API and download page say about one set (keeps the downloader current).</summary>
        [Test]
        public void CgBookcaseProbe()
        {
            using var http = new System.Net.Http.HttpClient();
            http.DefaultRequestHeaders.UserAgent.ParseAdd("Southbound-Unity/1.0");
            void Show(string url, string around)
            {
                string body;
                try { body = http.GetStringAsync(url).GetAwaiter().GetResult(); }
                catch (Exception e) { TestContext.Progress.WriteLine($"{url}: {e.Message}"); return; }
                TestContext.Progress.WriteLine($"{url}: {body.Length} chars");
                int n = 0;
                foreach (System.Text.RegularExpressions.Match m in System.Text.RegularExpressions.Regex.Matches(body, ".{0,220}" + around + ".{0,220}"))
                    if (n++ < 6) TestContext.Progress.WriteLine("   ...." + m.Value.Replace("\n", " "));
            }
            Show("https://www.cgbookcase.com/api/textures", "Cobblestone01");
            Show("https://www.cgbookcase.com/api/textures/cobblestone-01", "(?i:zip|download|url)");
            Show("https://www.cgbookcase.com/textures/thanks?t=Cobblestone01_MR_2K.zip&r=2&u=Cobblestone01", "(?i:\\.zip|download|b2|backblaze|cdn\\.)");
        }

        /// <summary>Every set in the library resolves (only checks the first request of each).</summary>
        [Test]
        public void EverySetIsReachable()
        {
            using var f = new MaterialFetcher();
            int ok = 0;
            foreach (var set in MaterialLibrary.Sets)
            {
                var r = f.FetchAsync(set, "1K", Out("all-" + set.Name)).GetAwaiter().GetResult();
                TestContext.Progress.WriteLine($"{set.Name,-30} {set.Source,-10} {(r.Ok ? "OK " + string.Join(",", r.Files.Keys) : "FAILED " + r.Error + " | " + string.Join(" ", r.Log))}");
                if (r.Ok) ok++;
            }
            Assert.AreEqual(MaterialLibrary.Sets.Length, ok);
        }
    }
}
