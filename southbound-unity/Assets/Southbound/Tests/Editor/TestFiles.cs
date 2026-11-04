using System;
using System.IO;

namespace Southbound.Tests
{
    /// <summary>Finds the Unity project root from wherever the tests run (Unity editor or dotnet test).</summary>
    static class TestFiles
    {
        public static string ProjectRoot
        {
            get
            {
                foreach (var start in new[] { Directory.GetCurrentDirectory(), AppContext.BaseDirectory })
                {
                    var d = new DirectoryInfo(start);
                    while (d != null)
                    {
                        if (File.Exists(Path.Combine(d.FullName, "Tools", "CoreTests", "fixtures", "catalog.json"))) return d.FullName;
                        d = d.Parent;
                    }
                }
                throw new DirectoryNotFoundException("southbound-unity project root not found");
            }
        }
        public static string Fixture(string name) => Path.Combine(ProjectRoot, "Tools", "CoreTests", "fixtures", name);
    }
}
