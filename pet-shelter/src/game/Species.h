// Species catalog: every animal in the game is a real-life species.
// 20 small, 40 medium, 20 large, 40 feral and 19 restricted species.
// Each species carries real-world facts, the body measurements the
// procedural model generator needs, and dozens of coat variations.
#pragma once
#include "core/Math.h"
#include <string>
#include <vector>

namespace ps {

enum class AnimalClass : uint8_t { Small, Medium, Large, Feral, Restricted, Count };
const char* className(AnimalClass c);
const char* classRule(AnimalClass c);   // what the player needs to handle this class

enum class BodyPlan : uint8_t { Quadruped, Bird, Lizard, Turtle, Snake, Primate };
enum class Ear : uint8_t { None, Erect, Pointed, Floppy, Rose, Round, Long, Lop, Tufted, Small, Wide, Folded };
enum class Tail : uint8_t { None, Normal, Thin, Bushy, CurledUp, Stub, Puff, LongThin, Flat, Tufted, HorseHair, Fan, Thick };
enum class Foot : uint8_t { Paw, Hoof, Cloven, Claw, Hand, Talon, Webbed, Flipper };
enum class Nose : uint8_t { Dog, Cat, Pig, Horse, Cow, Rodent, Rabbit, Bear, None, Primate };
enum class Horns : uint8_t { None, Antlers, Palmate, Curled, Swept, Cow, Pronghorn, Short, Spiral };
enum class Pupil : uint8_t { Round, Slit, Horizontal };
enum class Gait : uint8_t { Walk, Hop, Waddle, Slither, Sprawl, Knuckle, Bound };
enum class Beak : uint8_t { None, Seed, Hook, Duck, Chicken, Raptor, Long };

// Coat pattern ids (must match shaders/coat.glsl)
enum CoatPattern : int {
    SOLID = 0, TAN_POINTS = 1, TABBY = 2, TABBY_CLASSIC = 3, SPOTS = 4, MERLE = 5, PIEBALD = 6, CALICO = 7,
    BRINDLE = 8, COLORPOINT = 9, COUNTERSHADE = 10, STRIPES = 11, ROSETTES = 12, SADDLE = 13, MASK_RINGS = 14,
    SKUNK = 15, SCALES = 16, FEATHERS = 17, FAWN = 18, AGOUTI = 19, ROAN = 20, BELTED = 21, HOLSTEIN = 22,
};

// Extra anatomy flags
enum Extra : uint32_t {
    X_MANE = 1u << 0,        // horse-style crest mane
    X_LION_MANE = 1u << 1,   // big mane (males)
    X_TUSKS = 1u << 2,
    X_BEARD = 1u << 3,       // goat beard
    X_QUILLS = 1u << 4,
    X_BANDS = 1u << 5,       // armadillo armor bands
    X_WATTLE = 1u << 6,      // chicken/turkey wattle
    X_COMB = 1u << 7,        // chicken comb
    X_CREST = 1u << 8,       // cockatiel crest
    X_HUMP = 1u << 9,        // shoulder hump (grizzly, bison)
    X_JOWLS = 1u << 10,
    X_RUFF = 1u << 11,       // neck ruff (wolf, husky, lion females no)
    X_DEWLAP = 1u << 12,
    X_FRILL = 1u << 13,      // bearded dragon beard
    X_RATTLE = 1u << 14,
    X_HOOD = 1u << 15,       // cobra hood
    X_SCUTES = 1u << 16,     // crocodilian back armor
    X_WHISKERS = 1u << 17,
    X_SNOOD = 1u << 18,      // turkey snood
    X_EAR_TUFTS = 1u << 19,
    X_WRINKLES = 1u << 20,
    X_LONG_COAT = 1u << 21,  // skirts of long hair (shih tzu, yorkie, persian)
};

struct AnimalShape {
    BodyPlan plan = BodyPlan::Quadruped;
    // Adult male measurements (meters / kg)
    float height = 0.5f;        // shoulder (withers) height; birds: standing height; snakes: body diameter
    float length = 0.6f;        // body length chest-to-rump; snakes: total length
    float weightKg = 20.0f;
    // Body
    float legRatio = 0.5f;      // elbow height / shoulder height
    float girth = 0.18f;        // chest half-width / body length
    float chestDepth = 0.5f;    // chest depth / shoulder height
    float tuck = 0.3f;          // waist tuck-up (0 barrel .. 1 greyhound)
    float rumpRatio = 1.0f;     // rump height / shoulder height
    float neckLen = 0.35f;      // / shoulder height
    float neckThick = 0.6f;     // / chest half-width
    float neckAngle = 35.0f;    // degrees above horizontal
    // Head
    float headLen = 0.4f;       // skull length / shoulder height
    float headWidth = 0.55f;    // / head length
    float snoutLen = 0.45f;     // / head length
    float snoutWidth = 0.5f;    // / head width
    float stop = 0.5f;          // forehead-to-muzzle step (0 flat .. 1 steep)
    float headPitch = 10.0f;    // degrees nose-down
    Ear ear = Ear::Erect;
    float earSize = 0.35f;      // / head length
    Tail tail = Tail::Normal;
    float tailLen = 0.6f;       // / body length
    float tailThick = 0.25f;    // / chest half-width
    float tailCarry = 20.0f;    // degrees above horizontal at the base
    Foot foot = Foot::Paw;
    float legThick = 0.28f;     // upper leg radius / chest half-width
    Nose nose = Nose::Dog;
    vec3 noseColor{0.05f, 0.04f, 0.04f};
    Horns horns = Horns::None;
    float hornSize = 0.0f;      // / head length
    bool hornsMaleOnly = true;
    float fur = 0.012f;         // hair length (m)
    float fluff = 0.0f;         // extra silhouette volume from coat (0..1)
    float eyeSize = 0.12f;      // eye radius / head width
    Pupil pupil = Pupil::Round;
    vec3 eyeColor{0.30f, 0.17f, 0.07f};
    uint32_t extras = 0;
    float femaleScale = 0.92f;  // female size vs male
    Beak beak = Beak::None;     // birds
    float wingLen = 0.0f;       // birds: / body length
    Gait gait = Gait::Walk;
    float gaitSpeed = 1.0f;     // animation tempo multiplier
};

struct CoatVariant {
    std::string name;
    vec3 a, b, c;
    int pattern = SOLID;
    float amount = 0.5f;
    float contrast = 1.0f;
    vec4 marks{0, 0, 0, 0};     // max white socks/blaze/chest/tail-tip (randomized per individual)
};

struct Species {
    std::string name;
    std::string scientific;
    AnimalClass cls = AnimalClass::Medium;
    std::string category;       // "Dog", "Cat", "Rabbit", "Deer", "Big cat"...
    std::string fact;           // one real-world fact shown in the encyclopedia
    int lifespanYears = 12;
    std::string diet;
    float temperament = 0.3f;   // 0 docile .. 1 aggressive
    float adoptionFee = 150.0f;
    float careCostPerDay = 4.0f;
    AnimalShape shape;
    std::vector<CoatVariant> coats;
};

const std::vector<Species>& speciesCatalog();
int speciesCount(AnimalClass c);
int findSpecies(const std::string& name);   // -1 if missing

}  // namespace ps
