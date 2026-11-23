// The web game's 245 tools in 8 trades (systems/tools.js), sold at the hardware stores, Bayou Outfitters and the
// marinas' bait & tackle counters. Many do something: rods, bait and lures for fishing, knives, calls, binoculars and
// the ghillie suit for hunting, first aid heals, vests protect, repair kits fix a car, the flashlight lights the night.
// Ids are the web game's (trade_name-slug), so a web save's tools carry over. Owned tools live in Profile.Tools (id ->
// how many); bait is counted on its own (Profile.BaitCount), as in the browser.
using System.Collections.Generic;
using System.Linq;

namespace Southbound.Core
{
    public sealed class Tool
    {
        public string Id, Trade, Name;
        public int Price;
        public readonly Dictionary<string, double> Fx = new Dictionary<string, double>();
        public readonly Dictionary<string, string> Tags = new Dictionary<string, string>();
        public bool Has(string k) => Fx.ContainsKey(k) || Tags.ContainsKey(k);
        /// <summary>The effect's strength (a string effect such as a call counts as 1).</summary>
        public double Level(string k) => Fx.TryGetValue(k, out var v) ? v : Tags.ContainsKey(k) ? 1 : 0;
        public string Describe => string.Join(", ", Fx.Select(kv => kv.Value != 1 ? $"{kv.Key} {kv.Value}" : kv.Key).Concat(Tags.Select(kv => $"{kv.Key}: {kv.Value}")));
    }

    public static class Tools
    {
        public static readonly string[] Trades = { "Fishing", "Hunting", "Mechanic", "Survival", "Construction", "Medical", "Electronics", "Farm" };

        public static readonly List<Tool> All = new List<Tool>
        {
            T("Fishing", "fishing_spinning-rod-basic", "Spinning rod Basic", 60, N("rod",1)),
            T("Fishing", "fishing_spinning-rod-pro", "Spinning rod Pro", 240, N("rod",2)),
            T("Fishing", "fishing_spinning-rod-elite", "Spinning rod Elite", 540, N("rod",3)),
            T("Fishing", "fishing_baitcast-rod-basic", "Baitcast rod Basic", 120, N("rod",4)),
            T("Fishing", "fishing_baitcast-rod-pro", "Baitcast rod Pro", 480, N("rod",5)),
            T("Fishing", "fishing_baitcast-rod-elite", "Baitcast rod Elite", 1080, N("rod",6)),
            T("Fishing", "fishing_fly-rod-basic", "Fly rod Basic", 180, N("rod",7)),
            T("Fishing", "fishing_fly-rod-pro", "Fly rod Pro", 720, N("rod",8)),
            T("Fishing", "fishing_fly-rod-elite", "Fly rod Elite", 1620, N("rod",9)),
            T("Fishing", "fishing_surf-rod-basic", "Surf rod Basic", 240, N("rod",10)),
            T("Fishing", "fishing_surf-rod-pro", "Surf rod Pro", 960, N("rod",11)),
            T("Fishing", "fishing_surf-rod-elite", "Surf rod Elite", 2160, N("rod",12)),
            T("Fishing", "fishing_deep-sea-rod-basic", "Deep-sea rod Basic", 300, N("rod",13)),
            T("Fishing", "fishing_deep-sea-rod-pro", "Deep-sea rod Pro", 1200, N("rod",14)),
            T("Fishing", "fishing_deep-sea-rod-elite", "Deep-sea rod Elite", 2700, N("rod",15)),
            T("Fishing", "fishing_earthworms-24-", "Earthworms (24)", 6, N("bait",24)),
            T("Fishing", "fishing_live-shrimp-12-", "Live shrimp (12)", 14, N("bait",12), N("baitK",1.3)),
            T("Fishing", "fishing_minnows-12-", "Minnows (12)", 12, N("bait",12), N("baitK",1.2)),
            T("Fishing", "fishing_crickets-24-", "Crickets (24)", 8, N("bait",24)),
            T("Fishing", "fishing_cut-mullet-10-", "Cut mullet (10)", 10, N("bait",10), N("baitK",1.4)),
            T("Fishing", "fishing_spinner-lure", "Spinner lure", 9, N("lure",1)),
            T("Fishing", "fishing_crankbait", "Crankbait", 12, N("lure",1)),
            T("Fishing", "fishing_soft-plastic-worm", "Soft plastic worm", 6, N("lure",1)),
            T("Fishing", "fishing_topwater-popper", "Topwater popper", 14, N("lure",1)),
            T("Fishing", "fishing_bucktail-jig", "Bucktail jig", 11, N("lure",1)),
            T("Fishing", "fishing_spoon-lure", "Spoon lure", 8, N("lure",1)),
            T("Fishing", "fishing_fly-assortment", "Fly assortment", 25, N("lure",1)),
            T("Fishing", "fishing_saltwater-jig", "Saltwater jig", 16, N("lure",1)),
            T("Fishing", "fishing_landing-net", "Landing net", 40),
            T("Fishing", "fishing_tackle-box", "Tackle box", 35),
            T("Fishing", "fishing_line-10-lb", "Line 10 lb", 9),
            T("Fishing", "fishing_line-30-lb-braid", "Line 30 lb braid", 22),
            T("Fishing", "fishing_leader-50-lb", "Leader 50 lb", 12),
            T("Fishing", "fishing_fishing-pliers", "Fishing pliers", 18),
            T("Fishing", "fishing_rod-holder", "Rod holder", 25),
            T("Fishing", "fishing_cooler-48-qt", "Cooler 48 qt", 60, N("cooler",1)),
            T("Fishing", "fishing_bait-bucket", "Bait bucket", 15),
            T("Fishing", "fishing_polarized-sunglasses", "Polarized sunglasses", 45),
            T("Fishing", "fishing_fish-scale", "Fish scale", 20),
            T("Fishing", "fishing_fillet-knife", "Fillet knife", 30, N("knife",1)),
            T("Fishing", "fishing_portable-fish-finder", "Portable fish finder", 180, N("finder",1)),
            T("Fishing", "fishing_cast-net", "Cast net", 55, N("bait",30)),
            T("Hunting", "hunting_skinning-knife", "Skinning knife", 40, N("knife",1)),
            T("Hunting", "hunting_skinning-knife-pro", "Skinning knife Pro", 80, N("knife",2)),
            T("Hunting", "hunting_gut-hook-knife", "Gut hook knife", 80, N("knife",3)),
            T("Hunting", "hunting_gut-hook-knife-pro", "Gut hook knife Pro", 160, N("knife",4)),
            T("Hunting", "hunting_bowie-knife", "Bowie knife", 120, N("knife",5)),
            T("Hunting", "hunting_bowie-knife-pro", "Bowie knife Pro", 240, N("knife",6)),
            T("Hunting", "hunting_deer-grunt-call", "Deer grunt call", 25, S("call","deer")),
            T("Hunting", "hunting_turkey-box-call", "Turkey box call", 30, S("call","turkey")),
            T("Hunting", "hunting_duck-call", "Duck call", 22, S("call","duck")),
            T("Hunting", "hunting_predator-call", "Predator call", 45, S("call","coyote")),
            T("Hunting", "hunting_hog-call", "Hog call", 28, S("call","boar")),
            T("Hunting", "hunting_electronic-caller", "Electronic caller", 160, S("call","any")),
            T("Hunting", "hunting_doe-scent", "Doe scent", 12),
            T("Hunting", "hunting_cover-scent", "Cover scent", 10),
            T("Hunting", "hunting_binoculars-8x42", "Binoculars 8x42", 140, N("binos",1)),
            T("Hunting", "hunting_rangefinder", "Rangefinder", 210),
            T("Hunting", "hunting_camo-jacket", "Camo jacket", 90),
            T("Hunting", "hunting_camo-pants", "Camo pants", 70),
            T("Hunting", "hunting_ghillie-suit", "Ghillie suit", 260, N("stealth",1)),
            T("Hunting", "hunting_tree-stand", "Tree stand", 180),
            T("Hunting", "hunting_ground-blind", "Ground blind", 150),
            T("Hunting", "hunting_trail-camera", "Trail camera", 110),
            T("Hunting", "hunting_game-bag", "Game bag", 25, N("pelts",1)),
            T("Hunting", "hunting_field-dressing-kit", "Field dressing kit", 40),
            T("Hunting", "hunting_blood-tracking-light", "Blood tracking light", 60),
            T("Hunting", "hunting_bow-sight", "Bow sight", 75),
            T("Hunting", "hunting_quiver", "Quiver", 35),
            T("Hunting", "hunting_arrows-12-", "Arrows (12)", 48, N("arrows",12)),
            T("Hunting", "hunting_broadheads-6-", "Broadheads (6)", 40),
            T("Hunting", "hunting_decoy-deer", "Decoy deer", 120),
            T("Hunting", "hunting_turkey-decoys", "Turkey decoys", 60),
            T("Hunting", "hunting_gun-cleaning-kit", "Gun cleaning kit", 35, N("clean",1)),
            T("Mechanic", "mechanic_repair-kit", "Repair kit", 120, N("repair",50)),
            T("Mechanic", "mechanic_pro-repair-kit", "Pro repair kit", 300, N("repair",100)),
            T("Mechanic", "mechanic_tire-plug-kit", "Tire plug kit", 25, N("repair",10)),
            T("Mechanic", "mechanic_jumper-cables", "Jumper cables", 30),
            T("Mechanic", "mechanic_floor-jack", "Floor jack", 140),
            T("Mechanic", "mechanic_jack-stands", "Jack stands", 60),
            T("Mechanic", "mechanic_socket-set", "Socket set", 90, S("trade","mech")),
            T("Mechanic", "mechanic_wrench-set", "Wrench set", 70, S("trade","mech")),
            T("Mechanic", "mechanic_torque-wrench", "Torque wrench", 85),
            T("Mechanic", "mechanic_impact-driver", "Impact driver", 160),
            T("Mechanic", "mechanic_air-compressor", "Air compressor", 220),
            T("Mechanic", "mechanic_obd-scanner", "OBD scanner", 95),
            T("Mechanic", "mechanic_creeper", "Creeper", 50),
            T("Mechanic", "mechanic_oil-drain-pan", "Oil drain pan", 20),
            T("Mechanic", "mechanic_funnel-set", "Funnel set", 8),
            T("Mechanic", "mechanic_breaker-bar", "Breaker bar", 40),
            T("Mechanic", "mechanic_screwdriver-set", "Screwdriver set", 30),
            T("Mechanic", "mechanic_pliers-set", "Pliers set", 35),
            T("Mechanic", "mechanic_multimeter", "Multimeter", 45),
            T("Mechanic", "mechanic_battery-charger", "Battery charger", 80),
            T("Mechanic", "mechanic_tow-strap", "Tow strap", 35),
            T("Mechanic", "mechanic_shop-light", "Shop light", 40),
            T("Mechanic", "mechanic_grease-gun", "Grease gun", 30),
            T("Mechanic", "mechanic_brake-bleeder", "Brake bleeder", 35),
            T("Mechanic", "mechanic_timing-light", "Timing light", 60),
            T("Mechanic", "mechanic_engine-hoist", "Engine hoist", 300),
            T("Mechanic", "mechanic_wheel-chocks", "Wheel chocks", 20),
            T("Mechanic", "mechanic_spare-tire", "Spare tire", 110, N("repair",15)),
            T("Mechanic", "mechanic_fuel-can", "Fuel can", 25),
            T("Mechanic", "mechanic_coolant-tester", "Coolant tester", 18),
            T("Mechanic", "mechanic_spark-plug-set", "Spark plug set", 30),
            T("Mechanic", "mechanic_belt-kit", "Belt kit", 55),
            T("Mechanic", "mechanic_body-filler", "Body filler", 25, N("repair",20)),
            T("Mechanic", "mechanic_paint-gun", "Paint gun", 120),
            T("Mechanic", "mechanic_welder", "Welder", 450, S("trade","mech")),
            T("Survival", "survival_flashlight", "Flashlight", 25, N("light",1)),
            T("Survival", "survival_tactical-flashlight", "Tactical flashlight", 70, N("light",2)),
            T("Survival", "survival_headlamp", "Headlamp", 40, N("light",1)),
            T("Survival", "survival_lantern", "Lantern", 35),
            T("Survival", "survival_compass", "Compass", 20),
            T("Survival", "survival_tent", "Tent", 160, N("camp",1)),
            T("Survival", "survival_sleeping-bag", "Sleeping bag", 70),
            T("Survival", "survival_camp-stove", "Camp stove", 60),
            T("Survival", "survival_water-filter", "Water filter", 45),
            T("Survival", "survival_canteen", "Canteen", 15),
            T("Survival", "survival_paracord", "Paracord", 12),
            T("Survival", "survival_fire-starter", "Fire starter", 10),
            T("Survival", "survival_machete", "Machete", 35, N("knife",1)),
            T("Survival", "survival_hatchet", "Hatchet", 40),
            T("Survival", "survival_folding-saw", "Folding saw", 30),
            T("Survival", "survival_multitool", "Multitool", 65),
            T("Survival", "survival_emergency-blanket", "Emergency blanket", 8),
            T("Survival", "survival_signal-mirror", "Signal mirror", 9),
            T("Survival", "survival_whistle", "Whistle", 5),
            T("Survival", "survival_rain-poncho", "Rain poncho", 15),
            T("Survival", "survival_hiking-boots", "Hiking boots", 120),
            T("Survival", "survival_backpack-40l", "Backpack 40L", 90),
            T("Survival", "survival_trekking-poles", "Trekking poles", 60),
            T("Survival", "survival_solar-charger", "Solar charger", 75),
            T("Survival", "survival_bug-spray", "Bug spray", 7),
            T("Survival", "survival_sunscreen", "Sunscreen", 8),
            T("Survival", "survival_snake-bite-kit", "Snake bite kit", 25, N("heal",10)),
            T("Survival", "survival_waterproof-matches", "Waterproof matches", 6),
            T("Survival", "survival_mess-kit", "Mess kit", 22),
            T("Survival", "survival_hammock", "Hammock", 55),
            T("Construction", "construction_claw-hammer", "Claw hammer", 18),
            T("Construction", "construction_sledgehammer", "Sledgehammer", 45),
            T("Construction", "construction_crowbar", "Crowbar", 25),
            T("Construction", "construction_bolt-cutters", "Bolt cutters", 40),
            T("Construction", "construction_hand-saw", "Hand saw", 22),
            T("Construction", "construction_circular-saw", "Circular saw", 130),
            T("Construction", "construction_cordless-drill", "Cordless drill", 120, S("trade","build")),
            T("Construction", "construction_jigsaw", "Jigsaw", 90),
            T("Construction", "construction_angle-grinder", "Angle grinder", 85),
            T("Construction", "construction_tape-measure", "Tape measure", 12),
            T("Construction", "construction_level", "Level", 20),
            T("Construction", "construction_speed-square", "Speed square", 10),
            T("Construction", "construction_chalk-line", "Chalk line", 8),
            T("Construction", "construction_utility-knife", "Utility knife", 9),
            T("Construction", "construction_ladder-8-ft", "Ladder 8 ft", 110),
            T("Construction", "construction_extension-ladder", "Extension ladder", 220),
            T("Construction", "construction_toolbox", "Toolbox", 40),
            T("Construction", "construction_tool-belt", "Tool belt", 30),
            T("Construction", "construction_hard-hat", "Hard hat", 20),
            T("Construction", "construction_safety-glasses", "Safety glasses", 8),
            T("Construction", "construction_work-gloves", "Work gloves", 12),
            T("Construction", "construction_shop-vac", "Shop vac", 95),
            T("Construction", "construction_nail-gun", "Nail gun", 180),
            T("Construction", "construction_stud-finder", "Stud finder", 25),
            T("Construction", "construction_caulk-gun", "Caulk gun", 10),
            T("Construction", "construction_trowel", "Trowel", 12),
            T("Construction", "construction_paint-roller-kit", "Paint roller kit", 20),
            T("Construction", "construction_wheelbarrow", "Wheelbarrow", 85),
            T("Construction", "construction_cement-mixer", "Cement mixer", 380),
            T("Construction", "construction_scaffold", "Scaffold", 420),
            T("Construction", "construction_demolition-charge", "Demolition charge", 650, N("charge",1)),
            T("Construction", "construction_rebar-bender", "Rebar bender", 140),
            T("Construction", "construction_tile-cutter", "Tile cutter", 75),
            T("Construction", "construction_pipe-wrench", "Pipe wrench", 30, S("trade","plumb")),
            T("Construction", "construction_plumbing-snake", "Plumbing snake", 45, S("trade","plumb")),
            T("Construction", "construction_wire-strippers", "Wire strippers", 15, S("trade","elec")),
            T("Medical", "medical_bandages", "Bandages", 15, N("heal",20)),
            T("Medical", "medical_first-aid-kit", "First aid kit", 60, N("heal",50)),
            T("Medical", "medical_trauma-kit", "Trauma kit", 140, N("heal",100)),
            T("Medical", "medical_painkillers", "Painkillers", 10, N("heal",10)),
            T("Medical", "medical_splint", "Splint", 20, N("heal",15)),
            T("Medical", "medical_burn-gel", "Burn gel", 12, N("heal",10)),
            T("Medical", "medical_energy-drink", "Energy drink", 4, N("heal",5)),
            T("Medical", "medical_protein-bar", "Protein bar", 3, N("heal",4)),
            T("Medical", "medical_light-armor-vest", "Light armor vest", 250, N("armor",40)),
            T("Medical", "medical_kevlar-vest", "Kevlar vest", 600, N("armor",80)),
            T("Medical", "medical_heavy-armor", "Heavy armor", 1200, N("armor",100)),
            T("Medical", "medical_tourniquet", "Tourniquet", 25, N("heal",25)),
            T("Medical", "medical_hemostatic-gauze", "Hemostatic gauze", 35, N("heal",30)),
            T("Medical", "medical_epinephrine-pen", "Epinephrine pen", 80, N("heal",40)),
            T("Medical", "medical_stethoscope", "Stethoscope", 60, S("trade","med")),
            T("Medical", "medical_blood-pressure-cuff", "Blood pressure cuff", 45, S("trade","med")),
            T("Medical", "medical_defibrillator", "Defibrillator", 900, S("trade","med")),
            T("Medical", "medical_stretcher", "Stretcher", 250, S("trade","med")),
            T("Medical", "medical_oxygen-kit", "Oxygen kit", 300, S("trade","med")),
            T("Medical", "medical_gloves-100-", "Gloves (100)", 12),
            T("Electronics", "electronics_phone-gulfcell-5", "Phone: Gulfcell 5", 300),
            T("Electronics", "electronics_phone-gulfcell-7-pro", "Phone: Gulfcell 7 Pro", 900, N("phone",2)),
            T("Electronics", "electronics_police-scanner", "Police scanner", 220, N("scanner",1)),
            T("Electronics", "electronics_handheld-gps", "Handheld GPS", 180),
            T("Electronics", "electronics_walkie-talkies", "Walkie-talkies", 70),
            T("Electronics", "electronics_drone", "Drone", 650),
            T("Electronics", "electronics_night-vision-goggles", "Night vision goggles", 1500, N("nvg",1)),
            T("Electronics", "electronics_lockpick-set", "Lockpick set", 90, N("lockpick",1)),
            T("Electronics", "electronics_signal-jammer", "Signal jammer", 800),
            T("Electronics", "electronics_laptop", "Laptop", 1100),
            T("Electronics", "electronics_dash-cam", "Dash cam", 120),
            T("Electronics", "electronics_bluetooth-speaker", "Bluetooth speaker", 60),
            T("Electronics", "electronics_power-bank", "Power bank", 40),
            T("Electronics", "electronics_action-camera", "Action camera", 300),
            T("Electronics", "electronics_metal-detector", "Metal detector", 280, N("detector",1)),
            T("Electronics", "electronics_pro-metal-detector", "Pro metal detector", 900, N("detector",2)),
            T("Electronics", "electronics_cb-radio", "CB radio", 140),
            T("Electronics", "electronics_weather-radio", "Weather radio", 45),
            T("Electronics", "electronics_satellite-messenger", "Satellite messenger", 350),
            T("Electronics", "electronics_thermal-monocular", "Thermal monocular", 1800),
            T("Electronics", "electronics_electric-screwdriver", "Electric screwdriver", 45),
            T("Electronics", "electronics_soldering-iron", "Soldering iron", 35, S("trade","elec")),
            T("Electronics", "electronics_oscilloscope", "Oscilloscope", 600, S("trade","elec")),
            T("Electronics", "electronics_cable-tester", "Cable tester", 40, S("trade","elec")),
            T("Electronics", "electronics_label-maker", "Label maker", 30),
            T("Farm", "farm_shovel", "Shovel", 25),
            T("Farm", "farm_spade", "Spade", 28),
            T("Farm", "farm_rake", "Rake", 18),
            T("Farm", "farm_hoe", "Hoe", 20),
            T("Farm", "farm_pitchfork", "Pitchfork", 30),
            T("Farm", "farm_pruning-shears", "Pruning shears", 22),
            T("Farm", "farm_loppers", "Loppers", 35),
            T("Farm", "farm_hedge-trimmer", "Hedge trimmer", 120, S("trade","yard")),
            T("Farm", "farm_leaf-blower", "Leaf blower", 140, S("trade","yard")),
            T("Farm", "farm_push-mower", "Push mower", 260, S("trade","yard")),
            T("Farm", "farm_riding-mower", "Riding mower", 1900, S("trade","yard")),
            T("Farm", "farm_chainsaw", "Chainsaw", 320, S("trade","yard")),
            T("Farm", "farm_string-trimmer", "String trimmer", 150, S("trade","yard")),
            T("Farm", "farm_garden-hose", "Garden hose", 30),
            T("Farm", "farm_sprinkler", "Sprinkler", 20),
            T("Farm", "farm_seed-spreader", "Seed spreader", 60),
            T("Farm", "farm_post-hole-digger", "Post hole digger", 45),
            T("Farm", "farm_fence-stretcher", "Fence stretcher", 70),
            T("Farm", "farm_hay-hook", "Hay hook", 15),
            T("Farm", "farm_livestock-prod", "Livestock prod", 55),
            T("Farm", "farm_feed-bucket", "Feed bucket", 10),
            T("Farm", "farm_branding-iron", "Branding iron", 80),
            T("Farm", "farm_hoof-pick", "Hoof pick", 6),
            T("Farm", "farm_water-trough", "Water trough", 140),
            T("Farm", "farm_tractor-tool-kit", "Tractor tool kit", 210),
        };

        static readonly Dictionary<string, Tool> byId = All.ToDictionary(t => t.Id);
        public static Tool Get(string id) => id != null && byId.TryGetValue(id, out var t) ? t : null;

        static (string k, double v, string s) N(string k, double v) => (k, v, null);
        static (string k, double v, string s) S(string k, string s) => (k, 0, s);
        static Tool T(string trade, string id, string name, int price, params (string k, double v, string s)[] fx)
        {
            var t = new Tool { Trade = trade, Id = id, Name = name, Price = price };
            foreach (var f in fx) { if (f.s != null) t.Tags[f.k] = f.s; else t.Fx[f.k] = f.v; }
            return t;
        }

        /// <summary>The best of an effect among the tools you own (the web game's tools.best): 0 if none.</summary>
        public static double Best(IDictionary<string, double> owned, string key)
        {
            double b = 0;
            foreach (var kv in owned) if (kv.Value > 0 && byId.TryGetValue(kv.Key, out var t) && t.Has(key)) b = System.Math.Max(b, t.Level(key));
            return b;
        }

        /// <summary>The call you'd blow (hunting): the owned tool's call ("deer", "coyote", "any"...), or null.</summary>
        public static string Call(IDictionary<string, double> owned)
        {
            foreach (var kv in owned) if (kv.Value > 0 && byId.TryGetValue(kv.Key, out var t) && t.Tags.TryGetValue("call", out var c)) return c;
            return null;
        }

        /// <summary>Where they're sold (web layout): the three stores and the trade each opens on.</summary>
        public static (double x, double z, string name, string tab)[] Stores(MissionData L) => new[]
        {
            (L.CityX0 + 5 * L.CityPitch - 30, L.CityZ0 - 26, "Calvera Hardware", "Construction"),
            (L.TownX0 + L.TownPitch * 2 + 10, L.TownZ0 + L.TownNz * L.TownPitch + 18, "Mill Creek Feed & Hardware", "Farm"),
            (L.TownX0 - 26, L.TownZ0 + 2 * L.TownPitch, "Bayou Outfitters (hunting)", "Hunting"),
        };
    }
}
