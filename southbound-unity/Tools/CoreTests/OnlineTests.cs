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

        /// <summary>Every set from a site with a download API (ambientCG, Poly Haven) comes down at 1K.</summary>
        [Test]
        public void EverySetIsReachable()
        {
            using var f = new MaterialFetcher();
            int ok = 0;
            var auto = MaterialLibrary.Sets.Where(x => x.Automatic).ToArray();
            foreach (var set in auto)
            {
                var r = f.FetchAsync(set, "1K", Out("all-" + set.Name)).GetAwaiter().GetResult();
                TestContext.Progress.WriteLine($"{set.Name,-30} {set.Source,-10} {(r.Ok ? "OK " + string.Join(",", r.Files.Keys) : "FAILED " + r.Error + " | " + string.Join(" ", r.Log))}");
                if (r.Ok) ok++;
            }
            Assert.AreEqual(24, auto.Length);
            Assert.AreEqual(auto.Length, ok);
        }
    }
}
