#include "game/People.h"

namespace ps {

namespace {
struct Row {
    const char* name; char g; int age; Role role; float skill, wage;
    float skin; int hair; float hairShade; int facial; float height, weight; int glasses;
    const char* bio; const char* exp; const char* bad;
};

// hairShade: 0 black .. 0.35 brown .. 0.6 auburn/red .. 0.8 blonde .. 1 gray
vec3 hairRGB(float s) {
    if (s < 0.2f) return {0.03f, 0.025f, 0.02f};
    if (s < 0.45f) return {0.18f, 0.11f, 0.06f};
    if (s < 0.65f) return {0.42f, 0.16f, 0.06f};
    if (s < 0.9f) return {0.78f, 0.6f, 0.34f};
    return {0.72f, 0.72f, 0.7f};
}

const Row kRows[] = {
    // ---- Animal caretakers ----
    {"Maria Delgado", 'F', 34, Role::Caretaker, 0.72f, 1.05f, 0.45f, 5, 0.1f, 0, 1.62f, 0.45f, 0,
     "Grew up on a goat farm outside Tucson. Calm with scared dogs and can bottle-feed a kitten one-handed.",
     "6 yrs kennel lead at Pima County Animal Care; 2 yrs dairy farm hand.", ""},
    {"Tyler Brooks", 'M', 22, Role::Caretaker, 0.4f, 0.9f, 0.1f, 2, 0.8f, 0, 1.8f, 0.35f, 0,
     "Community-college student studying animal science. Shows up early, still learning.",
     "1 yr part-time at PetSmart grooming salon.", ""},
    {"Keisha Okafor", 'F', 29, Role::Caretaker, 0.66f, 1.0f, 0.85f, 6, 0.05f, 0, 1.7f, 0.5f, 0,
     "Former vet-school applicant who fell in love with shelter work. Runs a foster network for bottle babies.",
     "4 yrs at Houston SPCA; volunteer with a pit bull rescue.", ""},
    {"Dmitri Ivanov", 'M', 41, Role::Caretaker, 0.6f, 0.95f, 0.08f, 1, 0.3f, 3, 1.86f, 0.6f, 0,
     "Quiet ex-Army cook. Keeps a spotless kennel and has a way with big, pushy dogs.",
     "8 yrs U.S. Army; 3 yrs boarding kennel attendant.", "Written up twice for arguing with a supervisor."},
    {"Hannah Reed", 'F', 19, Role::Caretaker, 0.3f, 0.85f, 0.05f, 4, 0.82f, 0, 1.65f, 0.3f, 0,
     "Just graduated high school; spent every summer volunteering at the county shelter.",
     "3 summers volunteering at the county animal shelter.", ""},
    {"Omar Haddad", 'M', 36, Role::Caretaker, 0.7f, 1.1f, 0.4f, 2, 0.05f, 2, 1.76f, 0.55f, 1,
     "Raised horses in Jordan before moving here. Excellent with large animals and hooves.",
     "5 yrs barn manager at an equestrian center; 2 yrs livestock auction yard.", ""},
    {"Grace Whitaker", 'F', 58, Role::Caretaker, 0.75f, 1.0f, 0.12f, 7, 1.0f, 0, 1.6f, 0.65f, 1,
     "Retired schoolteacher. Patient, organized, and reads to the shy cats.",
     "30 yrs elementary teacher; 5 yrs cat-room volunteer.", ""},
    {"Wyatt Boone", 'M', 27, Role::Caretaker, 0.5f, 0.95f, 0.25f, 0, 0.35f, 1, 1.83f, 0.4f, 0,
     "Rodeo kid who can't sit still. Great in a crisis, bad with paperwork.",
     "2 yrs ranch hand; 1 yr animal control officer (city of Casper, WY).",
     "Fired from animal control for rough handling of a stray dog (disputed)."},
    {"Mei Chen", 'F', 31, Role::Caretaker, 0.62f, 1.0f, 0.2f, 6, 0.05f, 0, 1.58f, 0.35f, 1,
     "Exotic-pet keeper who knows her ball pythons from her corn snakes and handles birds without a glove.",
     "4 yrs reptile & bird keeper at a zoo petting barn.", ""},
    {"Jesse Calloway", 'M', 45, Role::Caretaker, 0.45f, 0.85f, 0.3f, 1, 0.3f, 3, 1.79f, 0.75f, 0,
     "Friendly and hard-working, but has been through a lot. Good with senior dogs.",
     "10 yrs warehouse worker; 2 yrs dog walker.", "DUI conviction (2019). License reinstated 2022."},
    // ---- Veterinarians ----
    {"Dr. Priya Patel", 'F', 38, Role::Veterinarian, 0.9f, 1.15f, 0.55f, 6, 0.05f, 0, 1.63f, 0.4f, 1,
     "Board-certified in shelter medicine. Fast, careful surgeon who teaches as she works.",
     "7 yrs shelter veterinarian at Maricopa County; 3 yrs emergency clinic.", ""},
    {"Dr. Luis Ramos", 'M', 52, Role::Veterinarian, 0.85f, 1.1f, 0.4f, 1, 0.9f, 2, 1.74f, 0.6f, 1,
     "Large-animal and mixed-practice vet. Has delivered calves in blizzards and stitched up hawks.",
     "20 yrs rural mixed practice; 4 yrs state wildlife rehab consultant.", ""},
    {"Dr. Ruth Lindqvist", 'F', 61, Role::Veterinarian, 0.8f, 1.0f, 0.08f, 7, 1.0f, 0, 1.68f, 0.5f, 1,
     "Semi-retired small-animal vet. Unhurried, precise, loved by clients.",
     "32 yrs owner of a small-animal clinic.", ""},
    {"Dr. Marcus Dunn", 'M', 35, Role::Veterinarian, 0.7f, 1.05f, 0.9f, 3, 0.05f, 1, 1.85f, 0.45f, 0,
     "Young vet with exotic-animal training. Ambitious, wants to build a wildlife program.",
     "3 yrs exotic & wildlife practice; residency at a zoo hospital.", ""},
    {"Dr. Nadia Volkova", 'F', 44, Role::Veterinarian, 0.88f, 1.2f, 0.1f, 4, 0.8f, 0, 1.72f, 0.4f, 0,
     "Brilliant surgeon with a sharp tongue. Staff either love her or quit.",
     "12 yrs specialty surgery hospital.", "State board reprimand (2017) for prescribing controlled drugs without full records."},
    // ---- Vet techs ----
    {"Ivy Holloway", 'F', 26, Role::VetTech, 0.65f, 1.0f, 0.15f, 5, 0.6f, 0, 1.66f, 0.4f, 0,
     "Credentialed vet tech who can place an IV in a dehydrated kitten on the first try.",
     "3 yrs 24-hour emergency hospital.", ""},
    {"Carlos Castillo", 'M', 33, Role::VetTech, 0.6f, 0.95f, 0.5f, 3, 0.05f, 1, 1.72f, 0.55f, 0,
     "Anesthesia nerd. Watches the monitors like a hawk.",
     "5 yrs surgical tech at a spay/neuter clinic.", ""},
    {"Aisha Abara", 'F', 24, Role::VetTech, 0.5f, 0.95f, 0.95f, 4, 0.05f, 0, 1.7f, 0.35f, 0,
     "Fresh out of tech school, top of her class in radiology and ultrasound.",
     "Externship at a university teaching hospital.", ""},
    {"Ben Sutter", 'M', 39, Role::VetTech, 0.55f, 0.9f, 0.18f, 1, 0.45f, 2, 1.8f, 0.7f, 0,
     "Solid, steady tech. Coaches his daughter's softball team.",
     "9 yrs general practice tech.", "Let go from a clinic after a missing-ketamine investigation (never charged)."},
    {"Rosa Mbeki", 'F', 47, Role::VetTech, 0.72f, 1.05f, 0.8f, 7, 0.1f, 0, 1.6f, 0.6f, 1,
     "Mother hen of every clinic she's worked in. Great with scared clients.",
     "15 yrs vet tech; 2 yrs practice manager.", ""},
    {"Theo Pryce", 'M', 28, Role::VetTech, 0.45f, 0.9f, 0.3f, 2, 0.6f, 0, 1.77f, 0.35f, 1,
     "Wildlife rehab volunteer who wants to go to vet school.",
     "2 yrs wildlife rehab center; 1 yr kennel tech.", ""},
    {"Lena Hart", 'F', 35, Role::VetTech, 0.58f, 1.0f, 0.1f, 6, 0.6f, 0, 1.64f, 0.45f, 0,
     "Dental and lab specialist. Can read a blood panel faster than most vets.",
     "7 yrs diagnostic lab tech.", "Two no-call/no-shows at her last job during a rough divorce."},
    // ---- Receptionists ----
    {"June Nguyen", 'F', 30, Role::Receptionist, 0.7f, 1.0f, 0.3f, 4, 0.05f, 0, 1.6f, 0.35f, 0,
     "Warm, fast, remembers every client's pet's name.",
     "5 yrs front desk at a busy vet clinic.", ""},
    {"Sam Morgan", 'M', 25, Role::Receptionist, 0.5f, 0.9f, 0.15f, 2, 0.35f, 0, 1.75f, 0.4f, 1,
     "Customer-service pro with a calm phone voice.",
     "3 yrs call center; 1 yr hotel front desk.", ""},
    {"Pearl Vance", 'F', 64, Role::Receptionist, 0.6f, 0.9f, 0.7f, 7, 1.0f, 0, 1.58f, 0.6f, 1,
     "Retired church secretary who keeps immaculate records and doesn't tolerate rudeness.",
     "25 yrs church office manager.", ""},
    {"Eli Castellano", 'M', 21, Role::Receptionist, 0.35f, 0.85f, 0.4f, 3, 0.1f, 0, 1.73f, 0.3f, 0,
     "Social-media whiz; could grow your public image online.",
     "1 yr retail; runs a pet Instagram with 40k followers.", "Posted a client's private information online at a previous job."},
    {"Nia Brooks", 'F', 33, Role::Receptionist, 0.65f, 1.0f, 0.75f, 5, 0.05f, 0, 1.68f, 0.5f, 0,
     "Bilingual (English/Spanish), unflappable with angry customers.",
     "6 yrs dental office front desk.", ""},
    {"Colt Dawson", 'M', 42, Role::Receptionist, 0.4f, 0.85f, 0.2f, 1, 0.3f, 3, 1.82f, 0.65f, 0,
     "Former car salesman. Charming, sometimes too pushy with adopters.",
     "12 yrs car sales.", "Customer complaint history for high-pressure sales tactics."},
    // ---- Janitors ----
    {"Ruth Okonkwo", 'F', 50, Role::Janitor, 0.7f, 1.0f, 0.9f, 7, 0.9f, 0, 1.62f, 0.55f, 0,
     "Hospital-grade cleaner. Parvo doesn't stand a chance.",
     "15 yrs environmental services at a hospital.", ""},
    {"Tomas Reyes", 'M', 37, Role::Janitor, 0.55f, 0.9f, 0.45f, 2, 0.05f, 2, 1.7f, 0.6f, 0,
     "Handy with plumbing and electrical too.",
     "8 yrs building maintenance.", ""},
    {"Dale Pruitt", 'M', 55, Role::Janitor, 0.45f, 0.85f, 0.2f, 0, 1.0f, 3, 1.78f, 0.8f, 0,
     "Quiet, reliable, eats lunch with the barn cats.",
     "20 yrs school custodian.", "Theft charge (1998), dismissed."},
    {"Kayla Simmons", 'F', 23, Role::Janitor, 0.35f, 0.85f, 0.25f, 4, 0.75f, 0, 1.65f, 0.35f, 0,
     "Needs the job, works hard, sometimes late.",
     "1 yr fast food; 6 months motel housekeeping.", "Fired from the motel for lateness."},
    // ---- Security guards ----
    {"Marcus Holt", 'M', 48, Role::SecurityGuard, 0.75f, 1.05f, 0.85f, 1, 0.05f, 1, 1.9f, 0.7f, 0,
     "Retired sheriff's deputy. Knows every back road in the county.",
     "22 yrs county sheriff's office.", ""},
    {"Tanya Greer", 'F', 36, Role::SecurityGuard, 0.6f, 0.95f, 0.3f, 5, 0.1f, 0, 1.73f, 0.5f, 0,
     "Licensed armed guard, calm under pressure.",
     "6 yrs private security for a hospital.", ""},
    {"Ray Kowalski", 'M', 60, Role::SecurityGuard, 0.5f, 0.9f, 0.1f, 1, 1.0f, 2, 1.76f, 0.75f, 1,
     "Night-owl ex-trucker who likes the quiet shifts.",
     "25 yrs long-haul trucking; 3 yrs night watchman.", ""},
    {"Andre Lewis", 'M', 29, Role::SecurityGuard, 0.55f, 0.95f, 0.8f, 3, 0.05f, 0, 1.84f, 0.5f, 0,
     "Former college linebacker, gentle giant with the dogs.",
     "4 yrs event security.", "Bar fight arrest (2016), charges dropped."},
    // ---- Managers ----
    {"Helen Carter", 'F', 46, Role::Manager, 0.85f, 1.15f, 0.2f, 6, 0.4f, 0, 1.66f, 0.45f, 1,
     "Turned around two failing shelters. Tough on budgets, fierce about staff days off.",
     "10 yrs shelter director (two nonprofits).", ""},
    {"Victor Almeida", 'M', 53, Role::Manager, 0.7f, 1.1f, 0.4f, 1, 0.9f, 2, 1.75f, 0.65f, 1,
     "Ex-hotel manager, great at scheduling and keeping people happy.",
     "15 yrs hotel operations.", ""},
    {"Brianna Kelly", 'F', 34, Role::Manager, 0.6f, 1.0f, 0.1f, 4, 0.6f, 0, 1.69f, 0.4f, 0,
     "MBA, big on spreadsheets and grant writing.",
     "5 yrs nonprofit development coordinator.", ""},
    {"Grant Fischer", 'M', 49, Role::Manager, 0.65f, 1.2f, 0.12f, 1, 0.35f, 1, 1.83f, 0.6f, 0,
     "Experienced but abrasive. Gets results, burns people out.",
     "8 yrs retail district manager.", "Named in a hostile-workplace complaint (settled)."},
};
}  // namespace

const std::vector<Person>& peopleRoster() {
    static std::vector<Person> list = [] {
        std::vector<Person> v;
        int id = 1;
        for (const Row& r : kRows) {
            Person p;
            p.id = id++;
            p.name = r.name;
            p.gender = r.g == 'F' ? Gender::Female : Gender::Male;
            p.age = r.age;
            p.role = r.role;
            p.skill = r.skill;
            p.wageAsk = r.wage;
            p.bio = r.bio;
            p.experience = r.exp;
            p.badHistory = r.bad;
            Appearance& a = p.looks;
            a.name = r.name;
            a.gender = p.gender;
            a.applyPreset(p.role == Role::Veterinarian || p.role == Role::VetTech ? 1 : (p.age > 55 ? 3 : 0));
            a.skinTone = r.skin;
            a.hairStyle = r.hair % kHairStyleCount;
            a.hairColor = hairRGB(r.hairShade);
            a.facialHair = p.gender == Gender::Male ? r.facial % kFacialHairCount : 0;
            a.height = r.height;
            a.weight = r.weight;
            a.accessory = r.glasses ? 1 : 0;
            a.eyeColor = (p.id * 7) % kEyeColorCount;
            Rng rng(uint64_t(p.id) * 977u);
            a.jaw = rng.range(0.3f, 0.7f);
            a.faceLength = rng.range(0.3f, 0.7f);
            a.noseSize = rng.range(0.3f, 0.7f);
            v.push_back(p);
        }
        return v;
    }();
    return list;
}

const Person* findPerson(int id) {
    for (const Person& p : peopleRoster()) if (p.id == id) return &p;
    return nullptr;
}

}  // namespace ps
