// Windows: the panes land exactly on the web game's window grid (where its exported sills are), inside
// their walls, without overlapping; shopfronts only on the ground floor of shop blocks, facing a street;
// the rooms behind them are dark by day and lit at night only where somebody is home.
using System;
using System.Collections.Generic;
using System.Linq;
using NUnit.Framework;
using Southbound.Core;

namespace Southbound.Tests
{
    public class BuildingWindowTests
    {
        [Test]
        public void Panes_sit_on_the_web_games_window_grid()
        {
            string folder = CalveraWorld.DefaultFolder(TestFiles.ProjectRoot);
            var w = CalveraWorld.Load(folder);
            var panes = BuildingWindows.Place(w);
            int rooms = panes.Count(p => p.Kind == PaneKind.Room), shops = panes.Count(p => p.Kind == PaneKind.Shop);
            TestContext.WriteLine($"{panes.Count} panes: {rooms} windows, {shops} shopfront bays; lit all night {panes.Count(p => p.Lit == 2)}, evenings {panes.Count(p => p.Lit == 1)}");
            Assert.That(rooms, Is.GreaterThan(5000));
            Assert.That(shops, Is.GreaterThan(200));

            // every pane is inside its wall and below the roof line, and none overlap on a wall
            foreach (var g in panes.GroupBy(p => (p.Building, p.Wall)))
            {
                var b = w.Buildings[g.Key.Building];
                var W = BuildingWindows.Walls(b)[g.Key.Wall];
                var list = g.ToList();
                foreach (var p in list)
                {
                    Assert.That(p.U - p.Width / 2, Is.GreaterThanOrEqualTo(W.u0 + 0.19));
                    Assert.That(p.U + p.Width / 2, Is.LessThanOrEqualTo(W.u1 - 0.19));
                    Assert.That(p.Y1, Is.LessThanOrEqualTo(b.Y + b.H - (p.Kind == PaneKind.Shop ? 0 : 0.79)));
                    Assert.That(p.Y0, Is.GreaterThanOrEqualTo(b.Y));
                    if (p.Kind == PaneKind.Shop)
                    {
                        Assert.That(((b.Street >> p.Wall) & 1), Is.EqualTo(1), "shopfronts face a street");
                        Assert.That(b.Style <= 2 || b.Style == 5, "only on shop blocks");
                    }
                    else if (b.Style <= 1) Assert.Fail("no windows painted over the towers' photographed faces");
                }
                for (int i = 0; i < list.Count; i++)
                    for (int j = i + 1; j < list.Count; j++)
                    {
                        var a = list[i]; var c = list[j];
                        bool apart = Math.Abs(a.U - c.U) >= (a.Width + c.Width) / 2 - 1e-6 || a.Y1 <= c.Y0 + 1e-6 || c.Y1 <= a.Y0 + 1e-6;
                        Assert.That(apart, "panes overlap");
                    }
            }

            // parity: under each house window is the web game's painted sill, under each brick-block window its stone sill
            var kinds = FacadeData.Load(folder).ToDictionary(k => k.Name);
            var sills = new HashSet<(long, long, long)>();
            (long, long, long) Key(double x, double y, double z) => ((long)Math.Round(x * 50), (long)Math.Round(y * 50), (long)Math.Round(z * 50));
            foreach (var name in new[] { "near-paint", "near-stone" })
                if (kinds.TryGetValue(name, out var k))
                    for (int i = 0; i < k.Count; i++) sills.Add(Key(k.F[i * k.Stride], k.F[i * k.Stride + 1], k.F[i * k.Stride + 2]));
            int checkedN = 0, found = 0;
            foreach (var p in panes.Where(p => p.Kind == PaneKind.Room && (p.Style == 2 || p.Style == 4)))
            {
                var (x, y, z) = p.Style == 4 ? p.At(0, p.Y0 - 0.04, 0.045) : p.At(0, p.Y0 - 0.05, 0.06);
                checkedN++;
                var (kx, ky, kz) = Key(x, y, z);
                bool hit = false;
                for (int dx = -1; dx <= 1 && !hit; dx++) for (int dy = -1; dy <= 1 && !hit; dy++) for (int dz = -1; dz <= 1 && !hit; dz++)
                    hit = sills.Contains((kx + dx, ky + dy, kz + dz));
                if (hit) found++;
                else if (checkedN - found <= 5) TestContext.WriteLine($"  no sill under building {p.Building} (style {p.Style}) wall {p.Wall} at {x:F2},{y:F2},{z:F2}");
            }
            TestContext.WriteLine($"sill parity: {found} of {checkedN} house and brick windows have the web game's sill under them");
            Assert.That(checkedN, Is.GreaterThan(1000));
            Assert.That(found, Is.GreaterThan(checkedN * 0.97), "panes are where the web game's windows are");
        }

        static double Mean(float[] a) { double s = 0; foreach (var v in a) s += v; return s / a.Length; }

        [Test]
        public void Rooms_are_dark_by_day_and_lit_only_where_somebody_is_home()
        {
            int litN = 0, darkN = 0;
            for (int cell = 0; cell < BuildingWindows.RoomCols * BuildingWindows.RoomRows; cell++)
            {
                var img = BuildingWindows.Room(cell, 48, 48, false);
                Assert.That(img.Day.All(v => v >= 0 && v <= 1) && img.Night.All(v => v >= 0 && v <= 1));
                Assert.That(Mean(img.Day), Is.LessThan(cell % 4 == 0 && cell % 8 != 7 ? 0.1 : 0.4), "a room behind glass is dark by day (blinds and curtains at the glass catch the daylight)");
                double night = Mean(img.Night);
                if (BuildingWindows.RoomLit(cell) > 0) { Assert.That(night, Is.GreaterThan(0.03), $"room {cell} has its light on"); litN++; }
                else { Assert.That(night, Is.EqualTo(0), $"room {cell} is dark"); darkN++; }
            }
            Assert.That(litN, Is.EqualTo(24)); Assert.That(darkN, Is.EqualTo(40));
            for (int cell = 0; cell < BuildingWindows.ShopCols * BuildingWindows.ShopRows; cell++)
            {
                var img = BuildingWindows.Room(cell, 64, 32, true);
                if (BuildingWindows.ShopLit(cell) > 0) Assert.That(Mean(img.Night), Is.GreaterThan(0.05), "a lit shop is lit right through");
            }
            // rooms differ from each other
            var a = BuildingWindows.Room(3, 32, 32, false); var b = BuildingWindows.Room(4, 32, 32, false);
            Assert.That(a.Day.Zip(b.Day, (p, q) => Math.Abs(p - q)).Sum(), Is.GreaterThan(1.0));
            Assert.That(BuildingWindows.Room(3, 32, 32, false).Day.SequenceEqual(a.Day), "deterministic");
        }
    }
}
