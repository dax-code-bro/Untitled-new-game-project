// A car's condition, with the web game's numbers (main.js damageVehicle, combat.js, carcombat.js,
// systems/driving.js): health 100; a crash takes (impact - 3) x 2.2 above 4 m/s into the surface, a bullet
// a quarter of the gun's damage (more with armour-piercing or explosive rounds), a blast up to 1.4 x its
// damage; each side (front, rear, left, right) remembers how hard it's been hit (0..1) for the dents. At no
// health from crashing the engine is wrecked; shot or blown up to nothing it catches fire and explodes a
// few seconds later (at once from a blast). Smoke from the bonnet below 40, black below 20. Fuel 0..1 burns
// with time, throttle, speed and nitrous; a full tank costs $62. Also where a door split sits on the body.
using System;

namespace Southbound.Core
{
    public enum CarSide { Front, Rear, Left, Right }

    public sealed class CarDamage
    {
        public double Health = 100, MaxHealth = 100;
        /// <summary>How battered each side is, 0..1 (CarSide order).</summary>
        public readonly double[] Dents = new double[4];
        /// <summary>Glass hits per side (CarSide order); 1 = cracked, 3 = gone.</summary>
        public readonly int[] Glass = new int[4];
        public double Fuel = 1;
        public bool Wrecked, OnFire, Exploded;
        /// <summary>Seconds until a burning car explodes.</summary>
        public double FireLeft;

        public CarDamage(double fuel = 1) { Fuel = fuel; }

        /// <summary>Which side a point is on, in car space (+z forward; x toward the side named).</summary>
        public static CarSide Side(double right, double forward) =>
            Math.Abs(forward) > Math.Abs(right) * 1.2 ? (forward > 0 ? CarSide.Front : CarSide.Rear) : (right > 0 ? CarSide.Right : CarSide.Left);

        /// <summary>Damage from a crash at this speed into the surface (m/s); nothing below 4.</summary>
        public static double CrashDamage(double impact) => impact > 4 ? (impact - 3) * 2.2 : 0;

        /// <summary>The driver's share of a hard crash (web medical.js): above 13 m/s.</summary>
        public static double DriverHurt(double impact) => impact > 13 ? (impact - 13) * 2.5 : 0;

        /// <summary>Knock some health off and dent the side it came from.</summary>
        public void Hit(double amount, CarSide side)
        {
            if (Exploded || amount <= 0) return;
            Health -= amount;
            int k = (int)side;
            Dents[k] = Math.Min(1, Dents[k] + amount / MaxHealth * 2.2);
            if (Health <= 0) Wrecked = true;
        }

        public void Crash(double impact, CarSide side)
        {
            Hit(CrashDamage(impact), side);
            if (impact > 14) Glass[(int)side] = 3;          // a hard hit puts the window on that side in
            else if (impact > 9 && Glass[(int)side] == 0) Glass[(int)side] = 1;
        }

        /// <summary>A bullet into the body (and the window on that side if it was up high). Returns true if that set it on fire.</summary>
        public bool Shot(double weaponDamage, double ammoVehicle, CarSide side, bool window)
        {
            if (Exploded) return false;
            if (window) Glass[(int)side] = Math.Min(3, Glass[(int)side] + 1);
            Hit(weaponDamage * 0.25 * ammoVehicle, side);
            return Health <= 0 && Ignite(false);
        }

        /// <summary>A blast at this distance (radius r, the weapon's damage). Returns true if that set it on fire.</summary>
        public bool Blast(double damage, double distance, double radius, CarSide side)
        {
            if (Exploded || distance >= radius) return false;
            Hit(damage * (1 - distance / radius) * 1.4, side);
            for (int k = 0; k < 4; k++) Glass[k] = Math.Max(Glass[k], distance < radius * 0.5 ? 3 : 1);
            return Health <= 0 && Ignite(true);
        }

        /// <summary>Catch fire: a blast sets it off almost at once, otherwise a few seconds of burning first.</summary>
        public bool Ignite(bool blast, double roll = 0.5)
        {
            if (OnFire || Exploded) return false;
            OnFire = true; Wrecked = true;
            FireLeft = blast ? 0.4 : 3.5 + 2 * roll;
            return true;
        }

        /// <summary>Advance a burning car; true on the step it explodes.</summary>
        public bool Burn(double dt)
        {
            if (!OnFire || Exploded) return false;
            FireLeft -= dt;
            if (FireLeft > 0) return false;
            Exploded = true; Health = -999;
            for (int k = 0; k < 4; k++) { Glass[k] = 3; Dents[k] = Math.Max(Dents[k], 0.6); }
            return true;
        }

        /// <summary>0 none, 1 grey smoke, 2 black smoke, 3 on fire.</summary>
        public int Smoke => OnFire || Exploded ? 3 : Health < 20 ? 2 : Health < 40 ? 1 : 0;

        /// <summary>Does the engine run? (not wrecked, not on fire, fuel in the tank)</summary>
        public bool Runs => !Wrecked && !OnFire && !Exploded && Fuel > 0;

        /// <summary>How much of the engine's pull is left: a badly hurt engine is down on power.</summary>
        public double Power => !Runs ? 0 : Health < 25 ? 0.6 : Health < 50 ? 0.85 : 1;

        /// <summary>Burn fuel (web: driving.js) while the engine runs.</summary>
        public void Drain(double dt, double throttle, double speed, bool nitro)
        {
            if (!Runs) return;
            Fuel = Math.Max(0, Fuel - dt * (0.00012 + Math.Abs(throttle) * 0.0006 + Math.Abs(speed) * 0.000012) * (nitro ? 2.5 : 1));
        }

        /// <summary>What filling the tank costs at the pump.</summary>
        public static int FillCost(double fuel) => Math.Max(2, (int)Math.Round((1 - fuel) * 62));

        /// <summary>A repair kit or a garage: health back, dents and glass with it (a full repair clears them).</summary>
        public void Repair(double amount)
        {
            if (Exploded) return;
            Health = Math.Min(MaxHealth, Health + amount);
            Wrecked = Health <= 0;
            bool full = Health >= MaxHealth;
            for (int k = 0; k < 4; k++)
            {
                Dents[k] = full ? 0 : Math.Max(0, Dents[k] - amount / 100);
                if (full) Glass[k] = 0;
            }
        }
    }

    /// <summary>The front doors cut out of the body mesh so they can swing open (the web game's cabin.js splitDoors).</summary>
    public static class CarDoors
    {
        public sealed class Door
        {
            public string Name;
            /// <summary>Triangles (indices into the body's vertices) per sub-mesh of the body (0 paint, 1 glass).</summary>
            public int[][] Triangles;
            /// <summary>The hinge in Unity car space (x, z) and how far it opens (Unity yaw, degrees).</summary>
            public double HingeX, HingeZ, OpenDegrees;
        }

        /// <summary>
        /// Split the body (Unity car space: x mirrored from the web, driver's side -x) into what stays and the two
        /// front doors with their windows and mirrors. `subMeshes` are the body's triangle lists (paint, then glass).
        /// Null for buses, cab-overs, or a shape with no proper doors. On success `body` is the rest.
        /// </summary>
        public static Door[] Split(CarSpec s, float[] positions, float[] normals, int[][] subMeshes, out int[][] body)
        {
            body = null;
            if (s.Cabover || s.Bus) return null;
            double doorF = s.AxF - s.Rw - 0.14;
            double zRear = s.ZB > -50 ? s.ZB : Math.Max(Math.Max(doorF - 1.15, s.ZC0 + 0.05), s.GlassBack > -50 ? s.GlassBack : -99);
            double mz = s.ZA0 - 0.12;
            var rest = new System.Collections.Generic.List<int>[subMeshes.Length];
            var drv = new System.Collections.Generic.List<int>[subMeshes.Length];
            var pas = new System.Collections.Generic.List<int>[subMeshes.Length];
            int nDrv = 0, nPas = 0;
            for (int m = 0; m < subMeshes.Length; m++)
            {
                rest[m] = new System.Collections.Generic.List<int>(); drv[m] = new System.Collections.Generic.List<int>(); pas[m] = new System.Collections.Generic.List<int>();
                var I = subMeshes[m];
                for (int t = 0; t + 2 < I.Length; t += 3)
                {
                    int a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
                    double x = (positions[a] + positions[b] + positions[c]) / 3, y = (positions[a + 1] + positions[b + 1] + positions[c + 1]) / 3, z = (positions[a + 2] + positions[b + 2] + positions[c + 2]) / 3;
                    double nx = (normals[a] + normals[b] + normals[c]) / 3;
                    double ax = Math.Abs(x);
                    bool door = false;
                    bool mirror = ax > s.Hwc - 0.02 && y > s.Belt - 0.06 && y < s.Belt + 0.16 && Math.Abs(z - mz) < 0.17 && mz < doorF;
                    if (mirror) door = true;
                    else if (z < doorF && z > zRear && y > s.Ride + 0.12 && y < s.Roof - 0.06 && ax > s.Hwc - 0.2)
                    {
                        if (y < s.Belt - 0.06) door = Math.Abs(nx) > 0.35 && ax > s.W / 2 - 0.2;
                        else if (y < s.Belt + 0.04) door = ax > s.Hwc - 0.06;
                        else
                        {
                            double zws = s.ZA0 + (s.ZA1 - s.ZA0) * Math.Min(1, Math.Max(0, (y - s.Belt) / (s.Roof - s.Belt)));
                            door = Math.Abs(nx) > 0.3 && z < zws - 0.1 && (s.ZB < -50 || z > s.ZB + 0.05);
                        }
                    }
                    // the web game's driver's side is +x; in Unity it is -x
                    var dst = !door ? rest[m] : x < 0 ? drv[m] : pas[m];
                    dst.Add(I[t]); dst.Add(I[t + 1]); dst.Add(I[t + 2]);
                    if (door) { if (x < 0) nDrv += 3; else nPas += 3; }
                }
            }
            if (nDrv <= 30 || nPas <= 30) return null;
            body = Array.ConvertAll(rest, l => l.ToArray());
            double hx = s.W / 2 - 0.04, hz = doorF + 0.01;
            return new[]
            {
                new Door { Name = "Door driver", Triangles = Array.ConvertAll(drv, l => l.ToArray()), HingeX = -hx, HingeZ = hz, OpenDegrees = 1.15 * 180 / Math.PI },
                new Door { Name = "Door passenger", Triangles = Array.ConvertAll(pas, l => l.ToArray()), HingeX = hx, HingeZ = hz, OpenDegrees = -1.15 * 180 / Math.PI },
            };
        }
    }
}
