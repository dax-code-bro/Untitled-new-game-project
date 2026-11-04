// What a round does when it meets the world: the same rules as the web game
// (src/entities/combat.js). A round's penetration is the gun's (1-5) plus its
// ammo; each material needs a certain penetration to get through, keeps some of
// the energy on the far side and costs the round some penetration. Walls have
// studs every 16 inches, which are harder. People take damage by where they are
// hit, with armour rated like NIJ levels.
using System;
using System.Collections.Generic;

namespace Southbound.Core
{
    /// <summary>The decal a hit leaves (matches the web game's HOLE ids).</summary>
    public enum HoleKind { Drywall = 0, DrywallExit = 1, Wood = 2, Frame = 3, Brick = 4, Concrete = 5, Metal = 6, Glass = 7 }

    public sealed class Surface
    {
        public string Name;
        /// <summary>Penetration needed to go through at all (99 = never).</summary>
        public double Need;
        /// <summary>Share of the round's energy left on the far side.</summary>
        public double Keep;
        /// <summary>Penetration the round loses doing it.</summary>
        public double Loss;
        /// <summary>Thickest piece (m) it can get through; 0 = solid.</summary>
        public double Max;
        /// <summary>Thickness (m) to assume for one-sided panels.</summary>
        public double Thin;
        public HoleKind Hole;
        public HoleKind? Inner;
        /// <summary>Through a stud instead of the cavity (walls only).</summary>
        public Surface Stud;
        public bool Penetrable => Max > 0;
    }

    public enum BodyPart { Head, Torso, Arm, Leg }

    /// <summary>A round in flight: what it has left after the walls it went through.</summary>
    public sealed class Round
    {
        public double Pen;
        public double Keep = 1;
        public double PenLoss;
        public int Walls;
    }

    public static class Ballistics
    {
        public const double StudSpacing = 0.4064; // 16 inches
        public const double StudWidth = 0.024;    // within this of a stud centre line
        public const int MaxWalls = 3;

        static Surface S(string name, double need, double keep, double loss, double max, double thin, HoleKind hole, Surface stud = null, HoleKind? inner = null) =>
            new Surface { Name = name, Need = need, Keep = keep, Loss = loss, Max = max, Thin = thin, Hole = hole, Stud = stud, Inner = inner };

        public static readonly Dictionary<string, Surface> Surfaces = new Dictionary<string, Surface>
        {
            ["glass"] = S("glass", 0, 0.9, 0, 0.05, 0.01, HoleKind.Glass),
            ["drywall"] = S("drywall", 1, 0.78, 0, 0.26, 0.12, HoleKind.Drywall, S("drywall-stud", 2, 0.55, 1, 0.26, 0.12, HoleKind.Drywall)),
            ["door"] = S("door", 1, 0.8, 0, 0.08, 0.045, HoleKind.Wood),
            ["frame"] = S("frame", 1, 0.55, 1, 0.3, 0.18, HoleKind.Wood, S("frame-stud", 3, 0.35, 2, 0.3, 0.18, HoleKind.Wood), HoleKind.Frame),
            ["metal"] = S("metal", 1, 0.7, 0, 0.06, 0.02, HoleKind.Metal),
            ["stucco"] = S("stucco", 2, 0.45, 1, 0.3, 0.2, HoleKind.Concrete),
            ["wood"] = S("wood", 2, 0.6, 1, 0.14, 0.05, HoleKind.Wood),
            ["brick"] = S("brick", 4, 0.3, 2, 0.3, 0.23, HoleKind.Brick),
            ["block"] = S("block", 4, 0.25, 2, 0.3, 0.2, HoleKind.Concrete),
            ["floor"] = S("floor", 99, 0, 0, 0, 0, HoleKind.Wood),
            ["masonry"] = S("masonry", 99, 0, 0, 0, 0, HoleKind.Concrete),
            ["stone"] = S("stone", 99, 0, 0, 0, 0, HoleKind.Concrete),
            ["tree"] = S("tree", 99, 0, 0, 0, 0, HoleKind.Wood),
            ["steel"] = S("steel", 99, 0, 0, 0, 0, HoleKind.Metal),
        };

        public static Surface Get(string name) => name != null && Surfaces.TryGetValue(name, out var s) ? s : Surfaces["masonry"];

        /// <summary>Penetration a fresh round starts with.</summary>
        public static double StartPen(Weapon w, Ammo am) => Math.Max(0, (w.Pen > 0 ? w.Pen : 1) + am.Pen) + (am.Slug ? 1 : 0);

        public static Round Fire(Weapon w, Ammo am) => new Round { Pen = StartPen(w, am) };

        public static int Pellets(Weapon w, Ammo am) => am.Slug ? 1 : (int)JsMath.Round(w.Pellets * am.Pellets);
        public static double Spread(Weapon w, Ammo am, double mul = 1) => (am.Slug ? w.Spread * 0.3 : w.Spread) * mul;
        public static double Range(Weapon w, Ammo am) => am.Slug ? w.Range * 2 : w.Range;

        /// <summary>Is the point on a wall facing (nx, nz) over a stud? Studs are world-aligned so holes line up.</summary>
        public static bool OverStud(double px, double pz, double nx, double nz)
        {
            double tx = -nz, tz = nx, l = Math.Sqrt(tx * tx + tz * tz);
            if (l * l <= 1e-4) return false;
            tx /= l; tz /= l;
            double along = (px * tx + pz * tz) / StudSpacing;
            return Math.Abs(along - JsMath.Round(along)) * StudSpacing < StudWidth;
        }

        /// <summary>
        /// The round meets a wall of this material and thickness. Returns true if it goes through
        /// (and takes the cost), false if it stops in the wall. remaining = range left after the wall.
        /// </summary>
        public static bool TryPenetrate(Round r, string surf, double thickness, bool stud, double remaining)
        {
            if (r.Walls >= MaxWalls) return false;
            var s = Get(surf);
            var rule = stud && s.Stud != null ? s.Stud : s;
            if (r.Pen < rule.Need || thickness > s.Max) return false;
            if (remaining <= 0.1) return false;
            r.Pen -= rule.Loss;
            r.Keep *= rule.Keep;
            r.PenLoss += rule.Loss;
            r.Walls++;
            return true;
        }

        /// <summary>The decal for the entry side and the far side of a wall the round went through.</summary>
        public static (HoleKind entry, HoleKind exit) ThroughHoles(string surf)
        {
            var s = Get(surf);
            return (surf == "drywall" ? HoleKind.Drywall : s.Hole, surf == "drywall" || surf == "frame" ? HoleKind.DrywallExit : s.Hole);
        }

        /// <summary>The decal where a round stopped in a wall (over a stud in a frame wall it sits in the wood).</summary>
        public static HoleKind StopHole(string surf) => surf == "frame" ? HoleKind.Wood : Get(surf).Hole;

        /// <summary>Bullet hole radius (m) by calibre class.</summary>
        public static double HoleRadius(Weapon w)
        {
            int pen = w.Pen > 0 ? w.Pen : 1;
            return w.Cat == "shotgun" ? 0.006 : pen >= 4 ? 0.011 : pen >= 3 ? 0.009 : 0.012;
        }

        /// <summary>Distance falloff: full damage to 40% of range, half at full range.</summary>
        public static double Falloff(Weapon w, double dist) => 1 - 0.5 * Math.Min(1, Math.Max(0, (dist - w.Range * 0.4) / (w.Range * 0.6)));

        /// <summary>Where a round hit a person: dy = height above their feet, lat = sideways offset.</summary>
        public static BodyPart Part(bool head, double dy, double lat) =>
            head ? BodyPart.Head : dy < 0.85 ? BodyPart.Leg : Math.Abs(lat) > 0.2 && dy > 0.95 && dy < 1.5 ? BodyPart.Arm : BodyPart.Torso;

        /// <summary>Does armour of this level stop this round? Half levels (IIIA = 3.5) stop one more class 60% of the time.</summary>
        public static bool ArmourStops(double level, double pen, Func<double> random)
        {
            if (level <= 0) return false;
            if (pen <= Math.Floor(level)) return true;
            return level % 1 > 0 && pen <= level + 0.5 && random() < 0.6;
        }

        public static double ZoneMultiplier(BodyPart part, bool stopped) => part switch
        {
            BodyPart.Head => stopped ? 0.25 : 3,
            BodyPart.Torso => stopped ? 0.1 : 1,
            BodyPart.Arm => 0.55,
            _ => 0.6,
        };

        public struct PersonHit
        {
            public BodyPart Part;
            public bool Stopped;
            public double Damage;
            public double Pen;
        }

        /// <summary>
        /// Damage to a person: no fixed number. Spread (0.8-1.15), distance falloff, where it hit,
        /// ammo, armour vs what the round has left after walls, and the energy kept through walls.
        /// armour = plate level on the torso, helmet = level on the head.
        /// </summary>
        public static PersonHit HitPerson(Weapon w, Ammo am, Round r, double dist, bool head, double dy, double lat, double armour, double helmet, Func<double> random)
        {
            var part = Part(head, dy, lat);
            double pen = Math.Max(0, (w.Pen > 0 ? w.Pen : 1) + am.Pen - (r?.PenLoss ?? 0));
            double level = part == BodyPart.Torso ? armour : part == BodyPart.Head ? helmet : 0;
            bool stopped = ArmourStops(level, pen, random);
            double slugDmg = am.Slug ? w.Pellets : 1;
            double dmg = w.Damage * slugDmg * am.Dmg * (0.8 + random() * 0.35) * Falloff(w, dist) * ZoneMultiplier(part, stopped) * (r?.Keep ?? 1);
            return new PersonHit { Part = part, Stopped = stopped, Damage = dmg, Pen = pen };
        }

        /// <summary>Damage to a vehicle body (HEAT rounds hit vehicles harder).</summary>
        public static double VehicleDamage(Weapon w, Ammo am, Round r) => w.Damage * 0.25 * am.Vehicle * (r?.Keep ?? 1);
    }
}
