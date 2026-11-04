// Looking after John: sleep, food and body weight (src/systems/needs.js).
//  - Energy drains over the day. Tired: sprint runs out sooner, shakier aim.
//    Exhausted: your eyes droop.
//  - Food drains too. Hungry: no healing. Starving: you lose health.
//  - Eat more than you burn and you put on weight; skip meals and you lose it.
//    Underweight: less health. Overweight: you tire faster when you run.
using System;

namespace Southbound.Core
{
    [Serializable]
    public sealed class Needs
    {
        public double Energy = 90, Food = 70, Weight = 78;
        public double Stamina = 1;

        public bool Tired => Energy < 25;
        public bool Exhausted => Energy < 8;
        public bool Hungry => Food < 25;
        public bool Starving => Food < 8;
        public bool Heavy => Weight > 92;
        public bool Underweight => Weight < 68;
        public double MaxHealth => Underweight ? 85 : 100;
        /// <summary>Aim spread multiplier when tired.</summary>
        public double SpreadMultiplier => Tired ? 1.35 : 1;
        /// <summary>Health regen is off while hungry.</summary>
        public bool NoRegen => Hungry;

        /// <summary>Body shape: width and depth scale on the character (height stays).</summary>
        public (double x, double y, double z) BodyScale { get { double k = (Weight - 78) / 78; return (1 + k * 0.55, 1, 1 + k * 0.7); } }

        static string Word(double v, string[] a) => v > 60 ? a[0] : v > 25 ? a[1] : v > 8 ? a[2] : a[3];
        public string EnergyWord => Word(Energy, new[] { "Rested", "OK", "Tired", "Exhausted" });
        public string FoodWord => Word(Food, new[] { "Fed", "Peckish", "Hungry", "Starving" });
        public string WeightText => $"{Weight:0.0} kg{(Underweight ? " (under)" : Heavy ? " (over)" : "")}";

        /// <summary>Game clock moved on by gameHours (works through sleeping, jail, time skips). busy = running.</summary>
        public void Drain(double gameHours, bool running, bool dead = false)
        {
            if (gameHours <= 0 || gameHours > 48 || dead) return;
            double busy = running ? 1.6 : 1;
            Energy = Math.Max(0, Energy - gameHours * 4.2 * busy);
            Food = Math.Max(0, Food - gameHours * 5.5 * busy);
            if (Food < 20) Weight = Math.Max(52, Weight - gameHours * 0.04);
            if (Food > 90) Weight = Math.Min(130, Weight + gameHours * 0.012);
        }

        /// <summary>Real-time effects each frame. Returns health lost to starving this frame.</summary>
        public double Tick(double dt, bool sprinting, double speed, double health)
        {
            if (sprinting && speed > 5) Stamina = Math.Max(0, Stamina - dt * (0.12 + (Tired ? 0.25 : 0) + (Heavy ? 0.12 : 0)));
            else Stamina = Math.Min(1, Stamina + dt * (Tired ? 0.06 : 0.15));
            return Starving && health > 5 ? dt * 0.25 : 0;
        }

        /// <summary>Out of breath: sprinting is cut off.</summary>
        public bool CanSprint => Stamina > 0.02;

        public void Feed(double amount)
        {
            double before = Food;
            Food = Math.Min(110, Food + amount);
            if (before + amount > 100) Weight += (before + amount - 100) * 0.012; // eating past full
        }

        /// <summary>Sleep: returns health gained (the caller also moves the clock on).</summary>
        public double Sleep(double hours)
        {
            Energy = Math.Min(100, Energy + hours * 13);
            Food = Math.Max(0, Food - hours * 2.5);
            return 40;
        }
    }
}
