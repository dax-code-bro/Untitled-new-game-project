// The phone's rules (the web game's phone.js and phoneplus.js): texts and the Calvera Courier's news kept in the
// save (the newest 40 of each), the cab's fare ($4 and $2.60 a mile) and how long the ride takes on the clock, the
// bank's daily interest (half a percent), the forecast in words, and Runr's delivery prices.
using System;
using System.Collections.Generic;
using System.Linq;

namespace Southbound.Core
{
    public static class PhoneBook
    {
        public static readonly string[] Filler =
        {
            "Fuel up four cents a gallon across Calvera.", "Mill Creek fish fry this Saturday: all welcome.", "Port Calvera council votes to fix the harbor road (again).",
            "Shrimp season opens early after a mild spring.", "Bayou Verde ferry back in service after repairs.", "Redgrass rodeo draws its biggest crowd in years.",
            "Pinewood Hollow fire watch asks hikers to put campfires all the way out.", "Gulf Mart opens a new store on the coast road.",
            "Heat advisory for the plains this week: drink water.", "Calvera River running high after the rain upstate.",
        };

        /// <summary>A text from someone (web game.text): newest first, unread.</summary>
        public static void Text(Profile p, string from, string body)
        {
            var l = p.List("texts");
            l.Insert(0, new Dictionary<string, object> { ["day"] = (double)p.Day, ["hour"] = p.Hour, ["from"] = from, ["body"] = body, ["unread"] = true });
            while (l.Count > 40) l.RemoveAt(l.Count - 1);
        }

        /// <summary>A story in the paper (web game.news).</summary>
        public static void News(Profile p, string text)
        {
            var l = p.List("news");
            l.Insert(0, new Dictionary<string, object> { ["day"] = (double)p.Day, ["hour"] = p.Hour, ["text"] = text });
            while (l.Count > 40) l.RemoveAt(l.Count - 1);
        }

        public static int Unread(Profile p) => p.List("texts").OfType<Dictionary<string, object>>().Count(t => t.Flag("unread"));
        public static void ReadAll(Profile p) { foreach (var t in p.List("texts").OfType<Dictionary<string, object>>()) t["unread"] = false; }

        /// <summary>The police log makes the paper (phoneplus.js).</summary>
        public static string CrimeStory(string kind, string region) => kind switch
        {
            "robbery" => $"Armed robbery at a store in {region}. Police are looking for the gunman.",
            "copKill" => $"Officer killed in {region}. A manhunt is under way.",
            "kill" => $"A body was found in {region} today. Police ask witnesses to come forward.",
            "carjack" => $"Driver dragged from a car in {region}.",
            "poaching" => $"Game wardens report a poached animal in {region}.",
            "shots" => $"Residents of {region} report gunfire.",
            _ => null,
        };

        /// <summary>A cab ride (metres): the fare and the miles.</summary>
        public static (int fare, double mi) Cab(double metres) { double mi = metres / 1609; return ((int)JsMath.Round(4 + mi * 2.6), mi); }
        /// <summary>How far the clock moves on a ride (hours).</summary>
        public static double CabHours(double mi) => 0.1 + mi * 0.035;

        /// <summary>A day's interest on the balance (rounded; nothing under a dollar).</summary>
        public static double Interest(double bank) => bank > 0 ? Math.Round(bank * 0.005) : 0;

        public static string Clock(double h) { int hh = (int)Math.Floor(h) % 24, mm = (int)Math.Floor((h % 1) * 60); return $"{((hh + 11) % 12) + 1}:{mm:00} {(hh < 12 ? "am" : "pm")}"; }

        public static string WeatherWord(string kind) => kind switch { "clear" => "Clear and sunny", "cloudy" => "Partly cloudy", "overcast" => "Overcast", "rain" => "Rain", "storm" => "Thunderstorms", _ => "Fair" };
        public static string WeatherAdvice(string next) => next == "storm" ? "Lightning likely. Stay off the water." : next == "rain" ? "Roads will be slick." : next == "clear" ? "Clearing up." : "No rain expected.";

        // Runr
        public const double GunMarkup = 1.35, GunDelivery = 150, Food = 30, Tow = 350, BoatTow = 650;
    }
}
