// The species catalog: 139 real-world species with measured proportions and
// their real coat colors. Adult male sizes; females scale by femaleScale.
// Colors are linear-space albedo.
#include "game/Species.h"
#include <map>

namespace ps {

const char* className(AnimalClass c) {
    switch (c) {
    case AnimalClass::Small: return "Small";
    case AnimalClass::Medium: return "Medium";
    case AnimalClass::Large: return "Large";
    case AnimalClass::Feral: return "Feral";
    case AnimalClass::Restricted: return "Restricted";
    default: return "?";
    }
}

const char* classRule(AnimalClass c) {
    switch (c) {
    case AnimalClass::Small: return "Kennels, cages or hutches. Any staff can handle them.";
    case AnimalClass::Medium: return "Runs and pens. Any trained staff can handle them.";
    case AnimalClass::Large: return "Paddocks and stalls. Needs large-animal handling.";
    case AnimalClass::Feral: return "Needs the upgraded (bigger) medical room and staff protective gear.";
    case AnimalClass::Restricted: return "Dangerous. Stay calm, keep people back, secure the area and call the police.";
    default: return "";
    }
}

namespace {

// ---- Colors (linear) ----
const vec3 K{0.018f, 0.016f, 0.015f};
const vec3 CHOC{0.085f, 0.038f, 0.02f};
const vec3 LIVER{0.14f, 0.06f, 0.03f};
const vec3 RED{0.42f, 0.14f, 0.045f};
const vec3 DEEPRED{0.26f, 0.07f, 0.03f};
const vec3 ORANGE{0.56f, 0.24f, 0.06f};
const vec3 GOLD{0.6f, 0.36f, 0.11f};
const vec3 YELLOW{0.62f, 0.44f, 0.2f};
const vec3 CREAM{0.72f, 0.58f, 0.4f};
const vec3 FAWN{0.5f, 0.32f, 0.15f};
const vec3 TAN{0.46f, 0.24f, 0.08f};
const vec3 WHITE{0.82f, 0.8f, 0.76f};
const vec3 BLUE{0.15f, 0.16f, 0.18f};
const vec3 LILAC{0.36f, 0.31f, 0.31f};
const vec3 GRAY{0.28f, 0.27f, 0.26f};
const vec3 SILVER{0.56f, 0.56f, 0.56f};
const vec3 ISABELLA{0.45f, 0.36f, 0.28f};
const vec3 BROWN{0.2f, 0.1f, 0.05f};
const vec3 DKBROWN{0.07f, 0.04f, 0.025f};
const vec3 GRIZZLE{0.3f, 0.22f, 0.14f};
const vec3 APRICOT{0.66f, 0.4f, 0.2f};
const vec3 BUFF{0.6f, 0.45f, 0.26f};
const vec3 PINK{0.72f, 0.45f, 0.42f};
const vec3 GREEN{0.1f, 0.3f, 0.05f};
const vec3 OLIVE{0.18f, 0.2f, 0.08f};

CoatVariant cv(const char* n, vec3 a, vec3 b, vec3 c, int pat, float amt = 0.5f, float con = 1.0f, vec4 marks = {0, 0, 0, 0}) {
    CoatVariant v;
    v.name = n; v.a = a; v.b = b; v.c = c; v.pattern = pat; v.amount = amt; v.contrast = con; v.marks = marks;
    return v;
}

using Lib = std::map<std::string, CoatVariant>;
std::vector<CoatVariant> pick(const Lib& lib, std::initializer_list<const char*> names) {
    std::vector<CoatVariant> out;
    for (const char* n : names) {
        auto it = lib.find(n);
        if (it != lib.end()) out.push_back(it->second);
    }
    return out;
}

const vec4 kTux{0.6f, 0.5f, 1.0f, 0.6f};    // typical white markings
const vec4 kChest{0.0f, 0.0f, 0.8f, 0.0f};

const Lib& dogLib() {
    static Lib L = {
        {"Black", cv("Black", K, K, WHITE, SOLID, 0.5f, 1, kChest)},
        {"Chocolate", cv("Chocolate", CHOC, CHOC, WHITE, SOLID, 0.5f, 1, kChest)},
        {"Liver", cv("Liver", LIVER, LIVER, WHITE, SOLID)},
        {"Yellow", cv("Yellow", YELLOW, CREAM, WHITE, SOLID)},
        {"Fox Red", cv("Fox Red", RED * 1.2f, GOLD, WHITE, SOLID)},
        {"Cream", cv("Cream", CREAM, CREAM, WHITE, SOLID)},
        {"Red", cv("Red", RED, DEEPRED, WHITE, SOLID, 0.5f, 1, kChest)},
        {"Fawn", cv("Fawn", FAWN, K, WHITE, SOLID, 0.5f, 1, kChest)},
        {"White", cv("White", WHITE, WHITE, WHITE, SOLID)},
        {"Blue", cv("Blue", BLUE, BLUE, WHITE, SOLID, 0.5f, 1, kChest)},
        {"Gold", cv("Gold", GOLD, CREAM, WHITE, SOLID)},
        {"Light Gold", cv("Light Gold", CREAM * 1.05f, CREAM, WHITE, SOLID)},
        {"Dark Gold", cv("Dark Gold", RED * 1.1f + GOLD * 0.3f, GOLD, WHITE, SOLID)},
        {"Apricot", cv("Apricot", APRICOT, APRICOT, WHITE, SOLID)},
        {"Silver", cv("Silver", SILVER, SILVER, WHITE, SOLID)},
        {"Gray", cv("Gray", GRAY, GRAY, WHITE, SOLID)},
        {"Black & Tan", cv("Black & Tan", K, TAN, WHITE, TAN_POINTS)},
        {"Chocolate & Tan", cv("Chocolate & Tan", CHOC, TAN, WHITE, TAN_POINTS)},
        {"Blue & Tan", cv("Blue & Tan", BLUE, TAN, WHITE, TAN_POINTS)},
        {"Isabella & Tan", cv("Isabella & Tan", ISABELLA, CREAM, WHITE, TAN_POINTS)},
        {"Red & Tan", cv("Red & Tan", DEEPRED, TAN, WHITE, TAN_POINTS)},
        {"Tricolor", cv("Tricolor", K, TAN, WHITE, TAN_POINTS, 0.5f, 1, {0.7f, 0.9f, 1.0f, 0.9f})},
        {"Red Tricolor", cv("Red Tricolor", LIVER, TAN, WHITE, TAN_POINTS, 0.5f, 1, {0.7f, 0.9f, 1.0f, 0.9f})},
        {"Black & White", cv("Black & White", K, K, WHITE, PIEBALD, 0.45f)},
        {"Red & White", cv("Red & White", RED, RED, WHITE, PIEBALD, 0.45f)},
        {"Liver & White", cv("Liver & White", LIVER, LIVER, WHITE, PIEBALD, 0.5f)},
        {"Lemon & White", cv("Lemon & White", CREAM * 0.95f, CREAM, WHITE, PIEBALD, 0.55f)},
        {"Tan & White", cv("Tan & White", TAN, TAN, WHITE, PIEBALD, 0.5f)},
        {"Blue & White", cv("Blue & White", BLUE, BLUE, WHITE, PIEBALD, 0.45f)},
        {"Fawn & White", cv("Fawn & White", FAWN, FAWN, WHITE, PIEBALD, 0.45f)},
        {"Mostly White", cv("Mostly White", K, K, WHITE, PIEBALD, 0.8f)},
        {"Piebald", cv("Piebald", RED, RED, WHITE, PIEBALD, 0.6f)},
        {"Black Tuxedo", cv("Black Tuxedo", K, K, WHITE, SOLID, 0.5f, 1, kTux)},
        {"Blue Merle", cv("Blue Merle", vec3(0.42f, 0.43f, 0.45f), K, WHITE, MERLE, 0.5f, 1, {0.6f, 0.7f, 1.0f, 0.5f})},
        {"Red Merle", cv("Red Merle", vec3(0.6f, 0.4f, 0.3f), LIVER, WHITE, MERLE, 0.5f, 1, {0.6f, 0.7f, 1.0f, 0.5f})},
        {"Dapple", cv("Dapple", DEEPRED, vec3(0.5f, 0.42f, 0.35f), WHITE, MERLE)},
        {"Black Dapple", cv("Black Dapple", K, vec3(0.4f, 0.38f, 0.36f), WHITE, MERLE)},
        {"Harlequin", cv("Harlequin", WHITE, K, WHITE, MERLE)},
        {"Brindle", cv("Brindle", FAWN, K, WHITE, BRINDLE, 0.5f, 1, kChest)},
        {"Red Brindle", cv("Red Brindle", RED, K, WHITE, BRINDLE, 0.5f, 0.8f, kChest)},
        {"Seal Brindle", cv("Seal Brindle", DKBROWN, K, WHITE, BRINDLE, 0.5f, 0.6f, kChest)},
        {"Sable", cv("Sable", GOLD, K, WHITE, AGOUTI)},
        {"Red Sable", cv("Red Sable", RED, DKBROWN, WHITE, AGOUTI)},
        {"Wild Boar", cv("Wild Boar", GRIZZLE, K, TAN, AGOUTI)},
        {"Black & Tan Saddle", cv("Black & Tan Saddle", TAN, K, WHITE, SADDLE, 0.5f)},
        {"Black & Red Saddle", cv("Black & Red Saddle", RED, K, WHITE, SADDLE, 0.5f)},
        {"Tricolor Saddle", cv("Tricolor Saddle", TAN, K, WHITE, SADDLE, 0.5f, 1, {0.8f, 0.9f, 1.0f, 1.0f})},
        {"Wolf Gray", cv("Wolf Gray", GRAY, WHITE, WHITE, COUNTERSHADE, 0.6f)},
        {"Agouti", cv("Agouti", GRIZZLE, WHITE, WHITE, COUNTERSHADE, 0.5f)},
        {"Black & White Husky", cv("Black & White", K, WHITE, WHITE, COUNTERSHADE, 0.8f, 1, {0.9f, 0.8f, 1.0f, 0.3f})},
        {"Gray & White Husky", cv("Gray & White", GRAY, WHITE, WHITE, COUNTERSHADE, 0.8f, 1, {0.9f, 0.8f, 1.0f, 0.3f})},
        {"Red & White Husky", cv("Red & White", RED, WHITE, WHITE, COUNTERSHADE, 0.8f, 1, {0.9f, 0.8f, 1.0f, 0.3f})},
        {"Spotted Black", cv("Black Spotted", WHITE, K, WHITE, SPOTS, 0.3f)},
        {"Spotted Liver", cv("Liver Spotted", WHITE, LIVER, WHITE, SPOTS, 0.3f)},
        {"Spotted Lemon", cv("Lemon Spotted", WHITE, GOLD, WHITE, SPOTS, 0.3f)},
        {"Black Mask Fawn", cv("Fawn (black mask)", FAWN * 1.1f, K, WHITE, MASK_RINGS, 0.3f)},
        {"Salt & Pepper", cv("Salt & Pepper", SILVER * 0.8f, K, WHITE, AGOUTI)},
        {"Black & Silver", cv("Black & Silver", K, SILVER, WHITE, TAN_POINTS)},
        {"Mahogany", cv("Mahogany", DEEPRED, DEEPRED, WHITE, SOLID)},
    };
    return L;
}

const Lib& catLib() {
    static Lib L = {
        {"Black", cv("Black", K, K, WHITE, SOLID)},
        {"White", cv("White", WHITE, WHITE, WHITE, SOLID)},
        {"Blue", cv("Blue", vec3(0.22f, 0.23f, 0.25f), BLUE, WHITE, SOLID)},
        {"Cream", cv("Cream", CREAM, CREAM, WHITE, SOLID)},
        {"Red", cv("Red", ORANGE, ORANGE, WHITE, SOLID)},
        {"Chocolate", cv("Chocolate", CHOC * 1.3f, CHOC, WHITE, SOLID)},
        {"Lilac", cv("Lilac", LILAC, LILAC, WHITE, SOLID)},
        {"Brown Mackerel Tabby", cv("Brown Mackerel Tabby", vec3(0.3f, 0.2f, 0.11f), K, CREAM, TABBY, 0.4f)},
        {"Brown Classic Tabby", cv("Brown Classic Tabby", vec3(0.3f, 0.2f, 0.11f), K, CREAM, TABBY_CLASSIC, 0.4f)},
        {"Silver Tabby", cv("Silver Tabby", SILVER, K, WHITE, TABBY, 0.4f)},
        {"Silver Classic Tabby", cv("Silver Classic Tabby", SILVER, K, WHITE, TABBY_CLASSIC, 0.4f)},
        {"Orange Tabby", cv("Orange Tabby", ORANGE * 1.1f, RED * 0.8f, CREAM, TABBY, 0.5f, 0.8f)},
        {"Orange Classic Tabby", cv("Orange Classic Tabby", ORANGE * 1.1f, RED * 0.8f, CREAM, TABBY_CLASSIC, 0.5f, 0.8f)},
        {"Cream Tabby", cv("Cream Tabby", CREAM, APRICOT, WHITE, TABBY, 0.5f, 0.6f)},
        {"Blue Tabby", cv("Blue Tabby", vec3(0.33f, 0.33f, 0.35f), BLUE, CREAM, TABBY, 0.4f)},
        {"Calico", cv("Calico", K, ORANGE, WHITE, CALICO, 0.45f)},
        {"Dilute Calico", cv("Dilute Calico", vec3(0.25f, 0.26f, 0.28f), CREAM, WHITE, CALICO, 0.45f)},
        {"Tortoiseshell", cv("Tortoiseshell", K, ORANGE * 0.8f, WHITE, CALICO, 0.0f)},
        {"Tuxedo", cv("Tuxedo", K, K, WHITE, PIEBALD, 0.3f, 1, kTux)},
        {"Black & White", cv("Black & White", K, K, WHITE, PIEBALD, 0.55f)},
        {"Orange & White", cv("Orange & White", ORANGE, ORANGE, WHITE, PIEBALD, 0.45f)},
        {"Gray & White", cv("Gray & White", vec3(0.22f, 0.23f, 0.25f), BLUE, WHITE, PIEBALD, 0.45f)},
        {"Tabby & White", cv("Tabby & White", vec3(0.3f, 0.2f, 0.11f), K, WHITE, TABBY, 0.8f, 1, kTux)},
        {"Van", cv("Van", ORANGE, ORANGE, WHITE, PIEBALD, 0.85f)},
        {"Seal Point", cv("Seal Point", vec3(0.72f, 0.64f, 0.52f), DKBROWN, WHITE, COLORPOINT)},
        {"Blue Point", cv("Blue Point", vec3(0.72f, 0.72f, 0.72f), vec3(0.2f, 0.22f, 0.26f), WHITE, COLORPOINT)},
        {"Chocolate Point", cv("Chocolate Point", vec3(0.78f, 0.7f, 0.58f), CHOC * 1.6f, WHITE, COLORPOINT)},
        {"Lilac Point", cv("Lilac Point", vec3(0.8f, 0.77f, 0.74f), LILAC, WHITE, COLORPOINT)},
        {"Flame Point", cv("Flame Point", vec3(0.8f, 0.72f, 0.6f), ORANGE, WHITE, COLORPOINT)},
        {"Lynx Point", cv("Lynx Point", vec3(0.72f, 0.66f, 0.56f), vec3(0.2f, 0.14f, 0.1f), WHITE, COLORPOINT)},
        {"Mitted Seal Point", cv("Mitted Seal Point", vec3(0.72f, 0.64f, 0.52f), DKBROWN, WHITE, COLORPOINT, 0.5f, 1, {0.3f, 0.3f, 1.0f, 0.0f})},
        {"Smoke", cv("Smoke", vec3(0.1f, 0.1f, 0.1f), K, SILVER, COUNTERSHADE, 0.3f)},
        {"Ruddy", cv("Ruddy", vec3(0.4f, 0.2f, 0.08f), K, APRICOT, AGOUTI, 0.6f)},
        {"Sorrel", cv("Sorrel", vec3(0.5f, 0.24f, 0.1f), CHOC * 1.5f, APRICOT, AGOUTI, 0.6f)},
        {"Fawn Ticked", cv("Fawn", vec3(0.62f, 0.48f, 0.36f), vec3(0.4f, 0.3f, 0.25f), CREAM, AGOUTI, 0.6f)},
        {"Brown Spotted", cv("Brown Spotted", vec3(0.55f, 0.32f, 0.1f), K, CREAM, ROSETTES, 0.5f)},
        {"Snow Spotted", cv("Snow Spotted", vec3(0.78f, 0.74f, 0.64f), vec3(0.3f, 0.22f, 0.15f), WHITE, ROSETTES, 0.5f)},
        {"Silver Spotted", cv("Silver Spotted", SILVER, K, WHITE, ROSETTES, 0.5f)},
        {"Brown Marbled", cv("Brown Marbled", vec3(0.55f, 0.32f, 0.1f), K, CREAM, TABBY_CLASSIC, 0.5f)},
        {"Hairless Pink", cv("Pink", vec3(0.72f, 0.5f, 0.45f), vec3(0.72f, 0.5f, 0.45f), WHITE, SOLID)},
        {"Hairless Black", cv("Black skin", vec3(0.25f, 0.2f, 0.2f), vec3(0.25f, 0.2f, 0.2f), PINK, PIEBALD, 0.3f)},
        {"Hairless Calico", cv("Calico skin", vec3(0.3f, 0.25f, 0.24f), vec3(0.6f, 0.4f, 0.3f), PINK, CALICO, 0.4f)},
    };
    return L;
}

const Lib& horseLib() {
    static Lib L = {
        {"Bay", cv("Bay", vec3(0.3f, 0.1f, 0.035f), K, WHITE, TAN_POINTS, 0.5f, 1, {0.4f, 0.6f, 0, 0})},
        {"Dark Bay", cv("Dark Bay", vec3(0.12f, 0.05f, 0.02f), K, WHITE, TAN_POINTS, 0.5f, 1, {0.4f, 0.6f, 0, 0})},
        {"Chestnut", cv("Chestnut", vec3(0.4f, 0.13f, 0.04f), vec3(0.35f, 0.12f, 0.04f), WHITE, SOLID, 0.5f, 1, {0.5f, 0.8f, 0, 0})},
        {"Sorrel", cv("Sorrel", vec3(0.5f, 0.2f, 0.06f), vec3(0.62f, 0.4f, 0.2f), WHITE, SOLID, 0.5f, 1, {0.5f, 0.8f, 0, 0})},
        {"Liver Chestnut", cv("Liver Chestnut", vec3(0.13f, 0.05f, 0.025f), vec3(0.13f, 0.05f, 0.025f), WHITE, SOLID, 0.5f, 1, {0.4f, 0.7f, 0, 0})},
        {"Black", cv("Black", K, K, WHITE, SOLID, 0.5f, 1, {0.3f, 0.5f, 0, 0})},
        {"Gray", cv("Gray", vec3(0.55f, 0.55f, 0.55f), vec3(0.3f, 0.3f, 0.3f), WHITE, MERLE, 0.5f)},
        {"Dapple Gray", cv("Dapple Gray", vec3(0.62f, 0.62f, 0.62f), vec3(0.28f, 0.28f, 0.3f), WHITE, SPOTS, 0.6f)},
        {"Flea-bitten Gray", cv("Flea-bitten Gray", WHITE * 0.95f, vec3(0.3f, 0.15f, 0.08f), WHITE, ROAN, 0.7f)},
        {"Palomino", cv("Palomino", vec3(0.7f, 0.5f, 0.22f), vec3(0.85f, 0.8f, 0.7f), WHITE, SOLID, 0.5f, 1, {0.4f, 0.7f, 0, 0})},
        {"Buckskin", cv("Buckskin", vec3(0.66f, 0.5f, 0.26f), K, WHITE, TAN_POINTS)},
        {"Dun", cv("Dun", vec3(0.5f, 0.38f, 0.22f), DKBROWN, WHITE, TAN_POINTS)},
        {"Grulla", cv("Grulla", vec3(0.3f, 0.28f, 0.25f), K, WHITE, TAN_POINTS)},
        {"Blue Roan", cv("Blue Roan", K, K, WHITE, ROAN, 0.55f)},
        {"Red Roan", cv("Red Roan", vec3(0.3f, 0.1f, 0.04f), K, WHITE, ROAN, 0.5f)},
        {"Strawberry Roan", cv("Strawberry Roan", vec3(0.45f, 0.15f, 0.05f), K, WHITE, ROAN, 0.5f)},
        {"Leopard Appaloosa", cv("Leopard Appaloosa", WHITE, K, WHITE, SPOTS, 0.3f)},
        {"Blanket Appaloosa", cv("Blanket Appaloosa", vec3(0.3f, 0.1f, 0.04f), vec3(0.3f, 0.1f, 0.04f), WHITE, PIEBALD, 0.35f)},
        {"Bay Tobiano", cv("Bay Tobiano", vec3(0.3f, 0.1f, 0.035f), K, WHITE, PIEBALD, 0.5f)},
        {"Black Tobiano", cv("Black Tobiano", K, K, WHITE, HOLSTEIN, 0.5f)},
        {"Sorrel Overo", cv("Sorrel Overo", vec3(0.5f, 0.2f, 0.06f), vec3(0.5f, 0.2f, 0.06f), WHITE, HOLSTEIN, 0.4f)},
        {"Cremello", cv("Cremello", vec3(0.85f, 0.78f, 0.62f), vec3(0.85f, 0.78f, 0.62f), WHITE, SOLID)},
        {"Perlino", cv("Perlino", vec3(0.82f, 0.74f, 0.6f), vec3(0.6f, 0.45f, 0.3f), WHITE, TAN_POINTS)},
        {"Champagne", cv("Champagne", vec3(0.7f, 0.55f, 0.36f), vec3(0.4f, 0.3f, 0.2f), WHITE, TAN_POINTS)},
        {"Silver Dapple", cv("Silver Dapple", vec3(0.2f, 0.15f, 0.12f), vec3(0.7f, 0.68f, 0.64f), WHITE, TAN_POINTS)},
        {"Brown Donkey", cv("Brown", vec3(0.22f, 0.15f, 0.1f), K, WHITE, COUNTERSHADE, 0.7f)},
        {"Gray Dun Donkey", cv("Gray Dun", vec3(0.38f, 0.35f, 0.33f), WHITE, WHITE, COUNTERSHADE, 0.8f)},
        {"Black Donkey", cv("Black", vec3(0.04f, 0.035f, 0.03f), WHITE, WHITE, COUNTERSHADE, 0.6f)},
        {"Spotted Donkey", cv("Spotted", vec3(0.22f, 0.15f, 0.1f), vec3(0.22f, 0.15f, 0.1f), WHITE, PIEBALD, 0.55f)},
        {"Ivory Donkey", cv("Ivory", vec3(0.78f, 0.74f, 0.66f), WHITE, WHITE, SOLID)},
    };
    return L;
}

const Lib& rabbitLib() {
    static Lib L = {
        {"REW", cv("Ruby-eyed White", WHITE, WHITE, WHITE, SOLID)},
        {"Black", cv("Black", K, K, WHITE, SOLID)},
        {"Blue", cv("Blue", vec3(0.2f, 0.21f, 0.24f), BLUE, WHITE, SOLID)},
        {"Chocolate", cv("Chocolate", CHOC * 1.2f, CHOC, WHITE, SOLID)},
        {"Lilac", cv("Lilac", LILAC * 1.2f, LILAC, WHITE, SOLID)},
        {"Chestnut Agouti", cv("Chestnut Agouti", vec3(0.3f, 0.18f, 0.08f), K, CREAM, AGOUTI, 0.8f)},
        {"Chinchilla", cv("Chinchilla", vec3(0.4f, 0.4f, 0.4f), K, WHITE, AGOUTI, 0.8f)},
        {"Opal", cv("Opal", vec3(0.35f, 0.33f, 0.36f), vec3(0.5f, 0.35f, 0.2f), WHITE, AGOUTI, 0.8f)},
        {"Lynx", cv("Lynx", vec3(0.6f, 0.5f, 0.42f), LILAC, WHITE, AGOUTI, 0.8f)},
        {"Orange", cv("Orange", vec3(0.6f, 0.3f, 0.09f), vec3(0.6f, 0.3f, 0.09f), WHITE, SOLID)},
        {"Fawn", cv("Fawn", vec3(0.62f, 0.45f, 0.25f), vec3(0.62f, 0.45f, 0.25f), WHITE, SOLID)},
        {"Tortoise", cv("Tortoise", vec3(0.45f, 0.24f, 0.1f), vec3(0.08f, 0.06f, 0.05f), WHITE, COLORPOINT)},
        {"Sable Point", cv("Sable Point", vec3(0.72f, 0.64f, 0.52f), DKBROWN, WHITE, COLORPOINT)},
        {"Seal", cv("Seal", DKBROWN, K, WHITE, COLORPOINT)},
        {"Himalayan", cv("Himalayan", WHITE, K, WHITE, COLORPOINT)},
        {"Siamese Sable", cv("Siamese Sable", vec3(0.4f, 0.28f, 0.18f), DKBROWN, WHITE, COLORPOINT)},
        {"Broken Black", cv("Broken Black", K, K, WHITE, PIEBALD, 0.6f)},
        {"Broken Orange", cv("Broken Orange", vec3(0.6f, 0.3f, 0.09f), vec3(0.6f, 0.3f, 0.09f), WHITE, PIEBALD, 0.6f)},
        {"Broken Blue", cv("Broken Blue", BLUE, BLUE, WHITE, PIEBALD, 0.6f)},
        {"Broken Tort", cv("Broken Tort", vec3(0.45f, 0.24f, 0.1f), K, WHITE, CALICO, 0.6f)},
        {"Harlequin", cv("Harlequin", vec3(0.6f, 0.3f, 0.09f), K, WHITE, CALICO, 0.0f)},
        {"Otter", cv("Black Otter", K, TAN, WHITE, TAN_POINTS)},
        {"Dutch Black", cv("Dutch Black", K, K, WHITE, BELTED, 0.6f)},
        {"Dutch Blue", cv("Dutch Blue", BLUE, BLUE, WHITE, BELTED, 0.6f)},
        {"Dutch Chocolate", cv("Dutch Chocolate", CHOC, CHOC, WHITE, BELTED, 0.6f)},
        {"Steel", cv("Steel", vec3(0.1f, 0.1f, 0.11f), SILVER, WHITE, AGOUTI, 0.5f)},
    };
    return L;
}

const Lib& rodentLib() {   // guinea pigs, hamsters, rats
    static Lib L = {
        {"Golden", cv("Golden", vec3(0.62f, 0.36f, 0.12f), K, WHITE, AGOUTI, 0.8f)},
        {"Cream", cv("Cream", CREAM, CREAM, WHITE, SOLID)},
        {"White", cv("White", WHITE, WHITE, WHITE, SOLID)},
        {"Black", cv("Black", K, K, WHITE, SOLID)},
        {"Cinnamon", cv("Cinnamon", vec3(0.45f, 0.24f, 0.12f), CHOC, CREAM, AGOUTI, 0.8f)},
        {"Sable", cv("Sable", DKBROWN, K, CREAM, SOLID)},
        {"Banded Golden", cv("Banded Golden", vec3(0.62f, 0.36f, 0.12f), K, WHITE, BELTED, 0.6f)},
        {"Tortoiseshell", cv("Tortoiseshell", RED, K, WHITE, CALICO, 0.0f)},
        {"Tort & White", cv("Tortoiseshell & White", RED, K, WHITE, CALICO, 0.45f)},
        {"Dutch", cv("Dutch", K, K, WHITE, BELTED, 0.6f)},
        {"Red", cv("Red", RED, RED, WHITE, SOLID)},
        {"Himalayan", cv("Himalayan", WHITE, K, WHITE, COLORPOINT)},
        {"Agouti", cv("Agouti", vec3(0.28f, 0.18f, 0.1f), K, CREAM, AGOUTI, 0.8f)},
        {"Roan", cv("Roan", K, K, WHITE, ROAN, 0.6f)},
        {"Dalmatian", cv("Dalmatian", WHITE, K, WHITE, SPOTS, 0.3f)},
        {"Hooded", cv("Hooded", K, K, WHITE, PIEBALD, 0.7f)},
        {"Berkshire", cv("Berkshire", vec3(0.15f, 0.1f, 0.07f), K, WHITE, SOLID, 0.5f, 1, {0.8f, 0, 1.0f, 0.5f})},
        {"Blue", cv("Blue", BLUE * 1.5f, BLUE, WHITE, SOLID)},
        {"Mink", cv("Mink", vec3(0.25f, 0.2f, 0.18f), vec3(0.25f, 0.2f, 0.18f), WHITE, SOLID)},
        {"Siamese", cv("Siamese", vec3(0.7f, 0.62f, 0.5f), DKBROWN, WHITE, COLORPOINT)},
    };
    return L;
}

const Lib& farmLib() {  // cattle, goats, sheep, pigs
    static Lib L = {
        {"Holstein", cv("Holstein", K, K, WHITE, HOLSTEIN, 0.5f)},
        {"Red Holstein", cv("Red & White Holstein", DEEPRED, DEEPRED, WHITE, HOLSTEIN, 0.5f)},
        {"Black Angus", cv("Black Angus", vec3(0.025f, 0.022f, 0.02f), K, WHITE, SOLID)},
        {"Red Angus", cv("Red Angus", DEEPRED, DEEPRED, WHITE, SOLID)},
        {"Hereford", cv("Hereford", DEEPRED, DEEPRED, WHITE, PIEBALD, 0.35f, 1, {0.6f, 1.0f, 1.0f, 1.0f})},
        {"Jersey", cv("Jersey", vec3(0.45f, 0.28f, 0.14f), DKBROWN, CREAM, COUNTERSHADE, 0.3f)},
        {"Brown Swiss", cv("Brown Swiss", vec3(0.3f, 0.25f, 0.2f), vec3(0.4f, 0.35f, 0.3f), WHITE, COUNTERSHADE, 0.3f)},
        {"Charolais", cv("Charolais", vec3(0.8f, 0.76f, 0.66f), vec3(0.8f, 0.76f, 0.66f), WHITE, SOLID)},
        {"Belted Galloway", cv("Belted Galloway", K, K, WHITE, BELTED, 0.8f)},
        {"Longhorn Spotted", cv("Longhorn Spotted", DEEPRED, DEEPRED, WHITE, HOLSTEIN, 0.5f)},
        {"Highland Red", cv("Red", vec3(0.45f, 0.17f, 0.05f), vec3(0.45f, 0.17f, 0.05f), WHITE, SOLID)},
        {"Highland Yellow", cv("Yellow", vec3(0.7f, 0.5f, 0.24f), vec3(0.7f, 0.5f, 0.24f), WHITE, SOLID)},
        {"Highland Black", cv("Black", K, K, WHITE, SOLID)},
        {"Highland Dun", cv("Dun", vec3(0.4f, 0.32f, 0.24f), vec3(0.4f, 0.32f, 0.24f), WHITE, SOLID)},
        {"Highland Brindle", cv("Brindle", vec3(0.4f, 0.2f, 0.08f), K, WHITE, BRINDLE, 0.5f, 0.7f)},
        {"Highland White", cv("White", vec3(0.8f, 0.76f, 0.68f), vec3(0.8f, 0.76f, 0.68f), WHITE, SOLID)},
        // goats
        {"Goat White", cv("White", WHITE, WHITE, WHITE, SOLID)},
        {"Goat Black", cv("Black", K, K, WHITE, SOLID)},
        {"Goat Chamoisee", cv("Chamoisee", vec3(0.4f, 0.2f, 0.07f), K, WHITE, TAN_POINTS)},
        {"Goat Buckskin", cv("Buckskin", vec3(0.5f, 0.35f, 0.18f), K, WHITE, SADDLE, 0.5f)},
        {"Goat Gold", cv("Gold", GOLD, GOLD, WHITE, SOLID)},
        {"Goat Chocolate", cv("Chocolate", CHOC, CHOC, WHITE, SOLID)},
        {"Goat Black & White", cv("Black & White", K, K, WHITE, PIEBALD, 0.5f)},
        {"Goat Brown & White", cv("Brown & White", BROWN, BROWN, WHITE, PIEBALD, 0.5f)},
        {"Goat Gold & White", cv("Gold & White", GOLD, GOLD, WHITE, PIEBALD, 0.5f)},
        {"Goat Caramel", cv("Caramel", vec3(0.55f, 0.35f, 0.15f), DKBROWN, CREAM, COUNTERSHADE, 0.6f)},
        {"Goat Agouti", cv("Agouti", GRIZZLE, K, WHITE, AGOUTI, 0.5f)},
        {"Goat Spotted", cv("Spotted", WHITE, BROWN, WHITE, SPOTS, 0.4f)},
        {"Goat Boer", cv("Traditional Boer", WHITE, WHITE, WHITE, SOLID)},
        {"Goat Red Boer", cv("Red Boer", DEEPRED, DEEPRED, WHITE, SOLID)},
        {"Goat Paint Boer", cv("Paint Boer", DEEPRED, DEEPRED, WHITE, HOLSTEIN, 0.5f)},
        // sheep
        {"Sheep Cream", cv("Cream wool", vec3(0.78f, 0.72f, 0.6f), vec3(0.78f, 0.72f, 0.6f), WHITE, SOLID)},
        {"Sheep White", cv("White wool", vec3(0.84f, 0.82f, 0.76f), vec3(0.84f, 0.82f, 0.76f), WHITE, SOLID)},
        {"Sheep Black", cv("Black wool", vec3(0.05f, 0.04f, 0.035f), vec3(0.05f, 0.04f, 0.035f), WHITE, SOLID)},
        {"Sheep Gray", cv("Gray wool", vec3(0.35f, 0.33f, 0.3f), vec3(0.35f, 0.33f, 0.3f), WHITE, SOLID)},
        {"Sheep Moorit", cv("Moorit (brown) wool", vec3(0.25f, 0.13f, 0.06f), vec3(0.25f, 0.13f, 0.06f), WHITE, SOLID)},
        {"Sheep Spotted", cv("Spotted wool", vec3(0.8f, 0.76f, 0.66f), K, WHITE, MERLE, 0.5f)},
        // pigs
        {"Pig Pink", cv("Pink", vec3(0.75f, 0.52f, 0.46f), vec3(0.75f, 0.52f, 0.46f), WHITE, SOLID)},
        {"Pig Black", cv("Black", vec3(0.04f, 0.035f, 0.035f), K, WHITE, SOLID)},
        {"Pig Hampshire", cv("Hampshire (belted)", vec3(0.04f, 0.035f, 0.035f), K, WHITE, BELTED, 0.9f)},
        {"Pig Berkshire", cv("Berkshire", vec3(0.04f, 0.035f, 0.035f), K, WHITE, SOLID, 0.5f, 1, {0.8f, 0.8f, 0, 1.0f})},
        {"Pig Duroc", cv("Duroc", vec3(0.4f, 0.14f, 0.05f), vec3(0.4f, 0.14f, 0.05f), WHITE, SOLID)},
        {"Pig Spotted", cv("Spotted", vec3(0.75f, 0.55f, 0.48f), K, WHITE, HOLSTEIN, 0.5f)},
        {"Pig Tamworth", cv("Tamworth ginger", vec3(0.55f, 0.24f, 0.08f), vec3(0.55f, 0.24f, 0.08f), WHITE, SOLID)},
        {"Pig Gray", cv("Gray", vec3(0.2f, 0.19f, 0.2f), vec3(0.2f, 0.19f, 0.2f), WHITE, SOLID)},
        {"Pig Black & White", cv("Black & White", vec3(0.04f, 0.035f, 0.035f), K, vec3(0.75f, 0.6f, 0.55f), PIEBALD, 0.5f)},
        {"Pig Ginger Spotted", cv("Ginger Spotted", vec3(0.6f, 0.35f, 0.15f), K, WHITE, SPOTS, 0.4f)},
    };
    return L;
}

// ---- Shape archetypes ----
AnimalShape dog(float h, float len, float kg) {
    AnimalShape s;
    s.height = h; s.length = len; s.weightKg = kg;
    s.legRatio = 0.5f; s.girth = 0.22f; s.chestDepth = 0.5f; s.tuck = 0.35f;
    s.neckLen = 0.36f; s.neckThick = 0.62f; s.neckAngle = 40;
    s.headLen = 0.42f; s.headWidth = 0.55f; s.snoutLen = 0.45f; s.snoutWidth = 0.55f; s.stop = 0.5f; s.headPitch = 12;
    s.ear = Ear::Floppy; s.earSize = 0.4f;
    s.tail = Tail::Normal; s.tailLen = 0.55f; s.tailThick = 0.2f; s.tailCarry = 25;
    s.foot = Foot::Paw; s.nose = Nose::Dog; s.fur = 0.02f; s.eyeSize = 0.13f; s.femaleScale = 0.92f;
    s.extras = X_WHISKERS;
    return s;
}
AnimalShape cat(float h, float len, float kg) {
    AnimalShape s;
    s.height = h; s.length = len; s.weightKg = kg;
    s.legRatio = 0.52f; s.girth = 0.2f; s.tuck = 0.3f; s.rumpRatio = 1.04f;
    s.neckLen = 0.22f; s.neckThick = 0.7f; s.neckAngle = 45;
    s.headLen = 0.48f; s.headWidth = 0.82f; s.snoutLen = 0.26f; s.snoutWidth = 0.52f; s.stop = 0.72f; s.headPitch = 8;
    s.ear = Ear::Erect; s.earSize = 0.34f;
    s.tail = Tail::LongThin; s.tailLen = 0.95f; s.tailThick = 0.2f; s.tailCarry = 5;
    s.foot = Foot::Paw; s.nose = Nose::Cat; s.noseColor = PINK * 0.8f; s.pupil = Pupil::Slit; s.legThick = 0.32f; s.girth = 0.24f;
    s.fur = 0.018f; s.eyeSize = 0.19f; s.eyeColor = {0.45f, 0.5f, 0.08f}; s.femaleScale = 0.88f;
    s.extras = X_WHISKERS; s.gait = Gait::Walk;
    return s;
}
AnimalShape bigcat(float h, float len, float kg) {
    AnimalShape s = cat(h, len, kg);
    s.headLen = 0.4f; s.headWidth = 0.85f; s.snoutLen = 0.36f; s.snoutWidth = 0.62f; s.stop = 0.45f;
    s.ear = Ear::Round; s.earSize = 0.22f; s.pupil = Pupil::Round; s.eyeSize = 0.11f;
    s.eyeColor = {0.5f, 0.35f, 0.08f}; s.noseColor = {0.45f, 0.25f, 0.22f}; s.legThick = 0.34f;
    s.neckThick = 0.8f; s.fur = 0.02f; s.femaleScale = 0.8f; s.tailThick = 0.18f; s.girth = 0.25f; s.legThick = 0.4f;
    return s;
}
AnimalShape rabbit(float h, float len, float kg) {
    AnimalShape s;
    s.height = h; s.length = len; s.weightKg = kg;
    s.legRatio = 0.3f; s.girth = 0.3f; s.tuck = 0.05f; s.rumpRatio = 1.3f; s.chestDepth = 0.6f;
    s.neckLen = 0.12f; s.neckThick = 0.75f; s.neckAngle = 40;
    s.headLen = 0.55f; s.headWidth = 0.72f; s.snoutLen = 0.35f; s.snoutWidth = 0.62f; s.stop = 0.35f; s.headPitch = 15;
    s.ear = Ear::Long; s.earSize = 0.95f;
    s.tail = Tail::Puff; s.tailLen = 0.15f; s.tailThick = 0.4f; s.tailCarry = 40;
    s.foot = Foot::Paw; s.nose = Nose::Rabbit; s.noseColor = PINK * 0.7f;
    s.fur = 0.025f; s.eyeSize = 0.2f; s.eyeColor = {0.08f, 0.05f, 0.03f}; s.gait = Gait::Hop;
    s.femaleScale = 1.03f; s.extras = X_WHISKERS; s.legThick = 0.34f;
    return s;
}
AnimalShape rodent(float h, float len, float kg) {
    AnimalShape s;
    s.height = h; s.length = len; s.weightKg = kg;
    s.legRatio = 0.22f; s.girth = 0.32f; s.tuck = 0.0f; s.rumpRatio = 1.1f; s.chestDepth = 0.7f;
    s.neckLen = 0.1f; s.neckThick = 0.85f; s.neckAngle = 20;
    s.headLen = 0.65f; s.headWidth = 0.7f; s.snoutLen = 0.4f; s.snoutWidth = 0.55f; s.stop = 0.3f; s.headPitch = 12;
    s.ear = Ear::Round; s.earSize = 0.3f;
    s.tail = Tail::Thin; s.tailLen = 0.8f; s.tailThick = 0.12f; s.tailCarry = 0;
    s.foot = Foot::Paw; s.nose = Nose::Rodent; s.noseColor = PINK * 0.8f;
    s.fur = 0.012f; s.eyeSize = 0.18f; s.eyeColor = {0.02f, 0.015f, 0.015f}; s.gait = Gait::Walk; s.gaitSpeed = 1.6f;
    s.femaleScale = 0.95f; s.extras = X_WHISKERS; s.legThick = 0.3f;
    return s;
}
AnimalShape mustelid(float h, float len, float kg) {
    AnimalShape s = rodent(h, len, kg);
    s.legRatio = 0.3f; s.girth = 0.15f; s.tuck = 0.1f; s.rumpRatio = 1.1f; s.chestDepth = 0.55f;
    s.neckLen = 0.5f; s.neckThick = 0.8f; s.neckAngle = 25;
    s.headLen = 0.7f; s.headWidth = 0.65f; s.snoutLen = 0.3f; s.stop = 0.35f;
    s.ear = Ear::Small; s.earSize = 0.22f; s.nose = Nose::Dog; s.noseColor = PINK * 0.6f;
    s.tail = Tail::Bushy; s.tailLen = 0.45f; s.tailThick = 0.35f; s.tailCarry = 0;
    s.foot = Foot::Claw; s.gait = Gait::Bound; s.gaitSpeed = 1.4f; s.femaleScale = 0.75f; s.fur = 0.015f;
    return s;
}
AnimalShape horse(float h, float len, float kg) {
    AnimalShape s;
    s.height = h; s.length = len; s.weightKg = kg;
    s.legRatio = 0.58f; s.girth = 0.19f; s.tuck = 0.15f; s.rumpRatio = 1.0f; s.chestDepth = 0.45f;
    s.neckLen = 0.62f; s.neckThick = 0.62f; s.neckAngle = 50;
    s.headLen = 0.38f; s.headWidth = 0.36f; s.snoutLen = 0.55f; s.snoutWidth = 0.66f; s.stop = 0.1f; s.headPitch = 45;
    s.ear = Ear::Pointed; s.earSize = 0.26f;
    s.tail = Tail::HorseHair; s.tailLen = 0.5f; s.tailThick = 0.28f; s.tailCarry = 15;
    s.foot = Foot::Hoof; s.nose = Nose::Horse; s.legThick = 0.3f; s.fur = 0.008f; s.eyeSize = 0.16f;
    s.pupil = Pupil::Horizontal; s.eyeColor = {0.12f, 0.06f, 0.03f}; s.extras = X_MANE; s.femaleScale = 0.96f;
    return s;
}
AnimalShape bovid(float h, float len, float kg) {   // cattle
    AnimalShape s = horse(h, len, kg);
    s.legRatio = 0.48f; s.girth = 0.25f; s.tuck = 0.0f; s.chestDepth = 0.55f;
    s.neckLen = 0.32f; s.neckThick = 0.8f; s.neckAngle = 18;
    s.headLen = 0.36f; s.headWidth = 0.52f; s.snoutLen = 0.48f; s.snoutWidth = 0.8f; s.stop = 0.1f; s.headPitch = 50;
    s.ear = Ear::Wide; s.earSize = 0.35f; s.tail = Tail::Tufted; s.tailLen = 0.55f; s.tailThick = 0.1f; s.tailCarry = 20;
    s.foot = Foot::Cloven; s.nose = Nose::Cow; s.noseColor = {0.55f, 0.35f, 0.33f};
    s.horns = Horns::Cow; s.hornSize = 0.35f; s.hornsMaleOnly = false; s.extras = X_DEWLAP; s.legThick = 0.26f;
    s.femaleScale = 0.9f;
    return s;
}
AnimalShape caprine(float h, float len, float kg) {   // goats, sheep
    AnimalShape s = bovid(h, len, kg);
    s.legRatio = 0.55f; s.girth = 0.2f; s.tuck = 0.15f; s.chestDepth = 0.5f;
    s.neckLen = 0.45f; s.neckThick = 0.62f; s.neckAngle = 45;
    s.headLen = 0.45f; s.headWidth = 0.44f; s.snoutLen = 0.5f; s.snoutWidth = 0.6f; s.stop = 0.2f; s.headPitch = 40;
    s.ear = Ear::Pointed; s.earSize = 0.4f; s.tail = Tail::Stub; s.tailLen = 0.15f; s.tailThick = 0.25f; s.tailCarry = 60;
    s.nose = Nose::Cow; s.noseColor = {0.2f, 0.15f, 0.14f}; s.horns = Horns::Swept; s.hornSize = 0.45f;
    s.pupil = Pupil::Horizontal; s.eyeColor = {0.45f, 0.35f, 0.1f}; s.extras = X_BEARD; s.fur = 0.02f;
    s.femaleScale = 0.85f;
    return s;
}
AnimalShape pig(float h, float len, float kg) {
    AnimalShape s;
    s.height = h; s.length = len; s.weightKg = kg;
    s.legRatio = 0.3f; s.girth = 0.28f; s.tuck = 0.0f; s.rumpRatio = 1.02f; s.chestDepth = 0.65f;
    s.neckLen = 0.15f; s.neckThick = 1.0f; s.neckAngle = 10;
    s.headLen = 0.6f; s.headWidth = 0.5f; s.snoutLen = 0.55f; s.snoutWidth = 0.55f; s.stop = 0.05f; s.headPitch = 18;
    s.ear = Ear::Erect; s.earSize = 0.35f;
    s.tail = Tail::CurledUp; s.tailLen = 0.2f; s.tailThick = 0.1f; s.tailCarry = 60;
    s.foot = Foot::Cloven; s.nose = Nose::Pig; s.noseColor = {0.7f, 0.42f, 0.4f}; s.legThick = 0.3f;
    s.fur = 0.006f; s.eyeSize = 0.1f; s.eyeColor = {0.12f, 0.07f, 0.03f}; s.femaleScale = 0.92f;
    return s;
}
AnimalShape deer(float h, float len, float kg) {
    AnimalShape s = horse(h, len, kg);
    s.legRatio = 0.6f; s.girth = 0.17f; s.tuck = 0.35f; s.chestDepth = 0.42f;
    s.neckLen = 0.52f; s.neckThick = 0.55f; s.neckAngle = 50;
    s.headLen = 0.36f; s.headWidth = 0.42f; s.snoutLen = 0.52f; s.snoutWidth = 0.55f; s.stop = 0.15f; s.headPitch = 35;
    s.ear = Ear::Wide; s.earSize = 0.5f; s.tail = Tail::Flat; s.tailLen = 0.2f; s.tailThick = 0.3f; s.tailCarry = -10;
    s.foot = Foot::Cloven; s.nose = Nose::Cow; s.noseColor = {0.03f, 0.025f, 0.025f};
    s.horns = Horns::Antlers; s.hornSize = 1.3f; s.hornsMaleOnly = true; s.extras = 0; s.legThick = 0.2f;
    s.eyeSize = 0.17f; s.pupil = Pupil::Horizontal; s.femaleScale = 0.8f; s.fur = 0.01f;
    return s;
}
AnimalShape bear(float h, float len, float kg) {
    AnimalShape s;
    s.height = h; s.length = len; s.weightKg = kg;
    s.legRatio = 0.45f; s.girth = 0.27f; s.tuck = 0.0f; s.rumpRatio = 0.97f; s.chestDepth = 0.55f;
    s.neckLen = 0.28f; s.neckThick = 0.82f; s.neckAngle = 20;
    s.headLen = 0.42f; s.headWidth = 0.72f; s.snoutLen = 0.45f; s.snoutWidth = 0.55f; s.stop = 0.35f; s.headPitch = 18;
    s.ear = Ear::Round; s.earSize = 0.22f; s.tail = Tail::Stub; s.tailLen = 0.08f; s.tailThick = 0.3f; s.tailCarry = -20;
    s.foot = Foot::Claw; s.nose = Nose::Bear; s.legThick = 0.4f; s.fur = 0.06f; s.fluff = 0.4f;
    s.eyeSize = 0.08f; s.eyeColor = {0.1f, 0.05f, 0.02f}; s.femaleScale = 0.72f; s.gait = Gait::Walk; s.gaitSpeed = 0.8f;
    return s;
}
AnimalShape wildCanid(float h, float len, float kg) {
    AnimalShape s = dog(h, len, kg);
    s.ear = Ear::Pointed; s.earSize = 0.45f; s.tail = Tail::Bushy; s.tailLen = 0.6f; s.tailThick = 0.3f; s.tailCarry = -20;
    s.snoutLen = 0.5f; s.snoutWidth = 0.45f; s.stop = 0.3f; s.eyeColor = {0.55f, 0.35f, 0.08f}; s.fur = 0.03f; s.fluff = 0.2f;
    s.tuck = 0.4f; s.legRatio = 0.54f; s.girth = 0.18f;
    return s;
}
AnimalShape bird(float h, float len, float kg) {
    AnimalShape s;
    s.plan = BodyPlan::Bird;
    s.height = h; s.length = len; s.weightKg = kg;
    s.girth = 0.3f; s.neckAngle = 40; s.legRatio = 0.3f; s.neckLen = 0.2f; s.headLen = 0.5f; s.snoutLen = 0.35f;
    s.wingLen = 0.9f; s.tailLen = 0.5f; s.tail = Tail::Fan; s.beak = Beak::Seed; s.noseColor = {0.6f, 0.5f, 0.3f};
    s.fur = 0.0f; s.eyeSize = 0.2f; s.eyeColor = {0.03f, 0.02f, 0.02f}; s.foot = Foot::Claw; s.ear = Ear::None;
    s.femaleScale = 0.95f; s.gait = Gait::Walk; s.gaitSpeed = 1.4f;
    return s;
}
AnimalShape lizard(float legH, float svl, float kg) {
    AnimalShape s;
    s.plan = BodyPlan::Lizard;
    s.height = legH; s.length = svl; s.weightKg = kg;
    s.girth = 0.16f; s.headLen = 0.3f; s.headWidth = 0.65f; s.snoutLen = 0.45f; s.tailLen = 1.3f;
    s.eyeSize = 0.22f; s.eyeColor = {0.5f, 0.3f, 0.05f}; s.foot = Foot::Claw; s.ear = Ear::None; s.tail = Tail::LongThin;
    s.nose = Nose::None; s.fur = 0.0f; s.gait = Gait::Sprawl; s.femaleScale = 0.9f;
    return s;
}
AnimalShape turtle(float legH, float shell, float kg) {
    AnimalShape s;
    s.plan = BodyPlan::Turtle;
    s.height = legH; s.length = shell; s.weightKg = kg;
    s.girth = 0.4f; s.chestDepth = 0.35f; s.headLen = 0.22f; s.eyeColor = {0.3f, 0.2f, 0.05f};
    s.foot = Foot::Claw; s.ear = Ear::None; s.tail = Tail::Stub; s.nose = Nose::None; s.fur = 0.0f; s.gaitSpeed = 0.4f;
    s.femaleScale = 1.05f;
    return s;
}
AnimalShape snake(float diameter, float len, float kg) {
    AnimalShape s;
    s.plan = BodyPlan::Snake;
    s.height = diameter; s.length = len; s.weightKg = kg;
    s.headLen = 0.035f; s.headWidth = 1.1f; s.eyeColor = {0.4f, 0.3f, 0.1f}; s.pupil = Pupil::Round;
    s.foot = Foot::Claw; s.ear = Ear::None; s.tail = Tail::None; s.nose = Nose::None; s.fur = 0.0f;
    s.gait = Gait::Slither; s.femaleScale = 1.1f;
    return s;
}

// ---- Builder ----
struct Cat {
    std::vector<Species> list;
    Species& add(const char* name, const char* sci, AnimalClass cls, const char* category, const AnimalShape& shape,
                 int life, const char* diet, float temper, float fee, float care, const char* fact) {
        Species s;
        s.name = name; s.scientific = sci; s.cls = cls; s.category = category; s.shape = shape;
        s.lifespanYears = life; s.diet = diet; s.temperament = temper; s.adoptionFee = fee; s.careCostPerDay = care; s.fact = fact;
        list.push_back(s);
        return list.back();
    }
};

using AC = AnimalClass;

void smallAnimals(Cat& c) {
    const char* DOG = "Canis lupus familiaris";
    const char* CAT = "Felis catus";
    const char* RAB = "Oryctolagus cuniculus";
    {   // Dachshund: very long back, short legs, long muzzle, big floppy ears
        AnimalShape a = dog(0.23f, 0.46f, 10);
        a.headWidth = 0.5f; a.snoutWidth = 0.55f;
        a.legRatio = 0.26f; a.girth = 0.19f; a.tuck = 0.2f; a.chestDepth = 0.75f;
        a.headLen = 0.95f; a.headWidth = 0.42f; a.snoutLen = 0.52f; a.snoutWidth = 0.45f; a.stop = 0.25f;
        a.neckLen = 0.55f; a.earSize = 0.45f; a.tailLen = 0.5f; a.tailCarry = 10; a.legThick = 0.36f; a.fur = 0.012f;
        auto& s = c.add("Dachshund", DOG, AC::Small, "Dog", a, 14, "Dog food", 0.35f, 350, 3,
                        "Bred in Germany to follow badgers into their burrows - 'Dachs' means badger.");
        s.coats = pick(dogLib(), {"Red", "Cream", "Black & Tan", "Chocolate & Tan", "Blue & Tan", "Isabella & Tan", "Dapple", "Black Dapple",
                                  "Brindle", "Piebald", "Wild Boar", "Red Sable", "Fawn", "Chocolate", "Black"});
    }
    {
        AnimalShape a = dog(0.18f, 0.2f, 2.3f);
        a.headLen = 0.6f; a.headWidth = 0.85f; a.snoutLen = 0.28f; a.stop = 0.95f; a.ear = Ear::Erect; a.earSize = 0.6f;
        a.eyeSize = 0.2f; a.tail = Tail::CurledUp; a.tailCarry = 50; a.tailLen = 0.7f; a.legRatio = 0.55f; a.fur = 0.008f; a.tuck = 0.45f;
        auto& s = c.add("Chihuahua", DOG, AC::Small, "Dog", a, 16, "Dog food", 0.5f, 250, 2,
                        "The smallest dog breed, named after the Mexican state of Chihuahua.");
        s.coats = pick(dogLib(), {"Fawn", "Cream", "Black & Tan", "Chocolate & Tan", "Tricolor", "Blue & Tan", "Black", "White", "Red",
                                  "Blue Merle", "Chocolate", "Fawn & White", "Black & White", "Brindle"});
    }
    {
        AnimalShape a = dog(0.2f, 0.2f, 2.5f);
        a.headLen = 0.5f; a.headWidth = 0.75f; a.snoutLen = 0.3f; a.stop = 0.8f; a.ear = Ear::Small; a.earSize = 0.3f;
        a.tail = Tail::CurledUp; a.tailCarry = 70; a.tailLen = 0.6f; a.tailThick = 0.35f; a.fur = 0.07f; a.fluff = 1.0f; a.extras |= X_RUFF;
        a.legRatio = 0.48f;
        auto& s = c.add("Pomeranian", DOG, AC::Small, "Dog", a, 14, "Dog food", 0.4f, 400, 2,
                        "Descended from large sled dogs; Queen Victoria helped shrink the breed.");
        s.coats = pick(dogLib(), {"Red", "Cream", "Gold", "Black", "White", "Sable", "Black & Tan", "Blue Merle", "Chocolate", "Blue",
                                  "Red Sable", "Black & White", "Apricot"});
    }
    {
        AnimalShape a = dog(0.2f, 0.22f, 3);
        a.headLen = 0.5f; a.headWidth = 0.7f; a.snoutLen = 0.35f; a.stop = 0.7f; a.ear = Ear::Erect; a.earSize = 0.45f;
        a.fur = 0.08f; a.fluff = 0.9f; a.extras |= X_LONG_COAT; a.tailCarry = 45; a.tail = Tail::Normal; a.legRatio = 0.45f;
        auto& s = c.add("Yorkshire Terrier", DOG, AC::Small, "Dog", a, 15, "Dog food", 0.45f, 400, 2,
                        "Bred in 1800s Yorkshire mills to catch rats; its coat is hair, not fur.");
        s.coats = pick(dogLib(), {"Blue & Tan", "Black & Tan", "Black & Silver", "Chocolate & Tan", "Gold", "Blue & White", "Black & White"});
    }
    {
        AnimalShape a = dog(0.25f, 0.3f, 6);
        a.headLen = 0.5f; a.headWidth = 0.85f; a.snoutLen = 0.2f; a.stop = 0.95f; a.earSize = 0.5f; a.fur = 0.1f; a.fluff = 1.0f;
        a.extras |= X_LONG_COAT; a.tail = Tail::CurledUp; a.tailCarry = 60; a.tailThick = 0.35f; a.legRatio = 0.42f; a.eyeSize = 0.18f;
        auto& s = c.add("Shih Tzu", DOG, AC::Small, "Dog", a, 14, "Dog food", 0.2f, 350, 3,
                        "Its name means 'little lion' - bred as a companion for Chinese royalty.");
        s.coats = pick(dogLib(), {"Gold", "Black & White", "Red & White", "Fawn & White", "Black", "Liver & White", "Blue & White", "Brindle",
                                  "Mostly White", "Silver", "Cream"});
    }
    {
        AnimalShape a = dog(0.3f, 0.3f, 8);
        a.headLen = 0.45f; a.headWidth = 1.0f; a.snoutLen = 0.1f; a.snoutWidth = 0.85f; a.stop = 1.0f; a.ear = Ear::Rose; a.earSize = 0.3f;
        a.tail = Tail::CurledUp; a.tailCarry = 80; a.tailLen = 0.35f; a.tailThick = 0.3f; a.girth = 0.28f; a.tuck = 0.1f; a.fur = 0.006f;
        a.extras |= X_WRINKLES | X_JOWLS; a.eyeSize = 0.2f; a.legRatio = 0.45f; a.legThick = 0.34f;
        auto& s = c.add("Pug", DOG, AC::Small, "Dog", a, 13, "Dog food", 0.15f, 450, 3,
                        "A group of pugs is called a 'grumble'. Flat faces make them prone to breathing trouble.");
        s.coats = pick(dogLib(), {"Black Mask Fawn", "Black", "Silver", "Apricot", "Fawn", "Brindle"});
    }
    {
        AnimalShape a = dog(0.33f, 0.33f, 7);
        a.headLen = 0.6f; a.headWidth = 0.5f; a.snoutLen = 0.5f; a.snoutWidth = 0.7f; a.stop = 0.3f; a.ear = Ear::Folded; a.earSize = 0.3f;
        a.tail = Tail::Stub; a.tailLen = 0.18f; a.tailCarry = 70; a.fur = 0.02f; a.extras |= X_BEARD; a.legRatio = 0.52f;
        auto& s = c.add("Miniature Schnauzer", DOG, AC::Small, "Dog", a, 14, "Dog food", 0.35f, 400, 2,
                        "Named for its bearded muzzle - 'Schnauze' is German for snout.");
        s.coats = pick(dogLib(), {"Salt & Pepper", "Black & Silver", "Black", "White", "Liver"});
    }
    {
        AnimalShape a = dog(0.3f, 0.32f, 6.5f);
        a.headLen = 0.55f; a.headWidth = 0.55f; a.snoutLen = 0.45f; a.stop = 0.45f; a.ear = Ear::Folded; a.earSize = 0.3f;
        a.tail = Tail::Stub; a.tailLen = 0.3f; a.tailCarry = 75; a.fur = 0.008f; a.legRatio = 0.52f; a.gaitSpeed = 1.3f;
        auto& s = c.add("Jack Russell Terrier", DOG, AC::Small, "Dog", a, 15, "Dog food", 0.5f, 300, 2,
                        "Bred for fox hunting in the 1800s; can jump five times its own height.");
        s.coats = pick(dogLib(), {"Tan & White", "Tricolor", "Black & White", "Lemon & White", "Mostly White"});
    }
    {
        AnimalShape a = cat(0.25f, 0.36f, 4.5f);
        auto& s = c.add("Domestic Shorthair", CAT, AC::Small, "Cat", a, 15, "Cat food", 0.3f, 100, 1.5f,
                        "Cats spend around 70% of their lives asleep.");
        s.coats = pick(catLib(), {"Black", "White", "Blue", "Red", "Cream", "Brown Mackerel Tabby", "Brown Classic Tabby", "Silver Tabby",
                                  "Orange Tabby", "Orange Classic Tabby", "Cream Tabby", "Blue Tabby", "Calico", "Dilute Calico",
                                  "Tortoiseshell", "Tuxedo", "Black & White", "Orange & White", "Gray & White", "Tabby & White", "Van",
                                  "Smoke", "Silver Classic Tabby"});
    }
    {
        AnimalShape a = cat(0.25f, 0.37f, 4.0f);
        a.headLen = 0.46f; a.headWidth = 0.62f; a.snoutLen = 0.36f; a.stop = 0.15f; a.earSize = 0.48f; a.ear = Ear::Wide;
        a.eyeColor = {0.08f, 0.25f, 0.65f}; a.tuck = 0.45f; a.girth = 0.16f; a.legRatio = 0.56f; a.fur = 0.005f; a.tailLen = 1.05f;
        auto& s = c.add("Siamese", CAT, AC::Small, "Cat", a, 15, "Cat food", 0.35f, 300, 1.5f,
                        "Kittens are born all white; the points darken where the body is cooler.");
        s.coats = pick(catLib(), {"Seal Point", "Blue Point", "Chocolate Point", "Lilac Point", "Flame Point", "Lynx Point"});
    }
    {
        AnimalShape a = cat(0.25f, 0.35f, 5);
        a.headLen = 0.4f; a.headWidth = 1.0f; a.snoutLen = 0.08f; a.stop = 1.0f; a.ear = Ear::Small; a.earSize = 0.22f;
        a.fur = 0.1f; a.fluff = 1.0f; a.extras |= X_RUFF | X_LONG_COAT; a.tail = Tail::Bushy; a.tailLen = 0.7f; a.tailThick = 0.3f;
        a.legRatio = 0.4f; a.girth = 0.25f; a.tuck = 0.05f; a.eyeColor = {0.55f, 0.28f, 0.05f}; a.pupil = Pupil::Slit; a.eyeSize = 0.22f;
        auto& s = c.add("Persian", CAT, AC::Small, "Cat", a, 14, "Cat food", 0.1f, 350, 2.5f,
                        "One of the oldest breeds; its long coat needs brushing every day.");
        s.coats = pick(catLib(), {"White", "Black", "Blue", "Cream", "Red", "Silver Tabby", "Brown Classic Tabby", "Calico", "Tortoiseshell",
                                  "Seal Point", "Blue Point", "Smoke", "Chocolate", "Lilac", "Black & White"});
    }
    {
        AnimalShape a = rabbit(0.2f, 0.26f, 1.8f);
        a.ear = Ear::Lop; a.earSize = 0.85f; a.headLen = 0.6f; a.headWidth = 0.85f; a.snoutLen = 0.25f; a.girth = 0.36f;
        auto& s = c.add("Holland Lop", RAB, AC::Small, "Rabbit", a, 9, "Hay, greens, pellets", 0.1f, 80, 1,
                        "Lop ears come from a gene that stops the ear cartilage from standing up.");
        s.coats = pick(rabbitLib(), {"Chestnut Agouti", "Orange", "Fawn", "Black", "Blue", "Chocolate", "Lilac", "REW", "Tortoise", "Sable Point",
                                     "Seal", "Broken Black", "Broken Orange", "Broken Tort", "Opal", "Chinchilla", "Lynx", "Siamese Sable"});
    }
    {
        AnimalShape a = rabbit(0.15f, 0.2f, 1.0f);
        a.earSize = 0.5f; a.headLen = 0.65f; a.headWidth = 0.9f; a.snoutLen = 0.22f; a.eyeSize = 0.24f; a.girth = 0.36f;
        auto& s = c.add("Netherland Dwarf", RAB, AC::Small, "Rabbit", a, 11, "Hay, greens, pellets", 0.3f, 80, 1,
                        "One of the smallest rabbit breeds - adults weigh about a kilogram.");
        s.coats = pick(rabbitLib(), {"REW", "Black", "Blue", "Chocolate", "Lilac", "Chestnut Agouti", "Chinchilla", "Opal", "Lynx", "Himalayan",
                                     "Otter", "Tortoise", "Sable Point", "Siamese Sable", "Fawn", "Orange", "Steel", "Seal"});
    }
    {
        AnimalShape a = rodent(0.1f, 0.22f, 1.0f);
        a.tail = Tail::None; a.ear = Ear::Rose; a.earSize = 0.3f; a.headLen = 0.9f; a.headWidth = 0.7f; a.snoutLen = 0.3f;
        a.legRatio = 0.2f; a.girth = 0.35f; a.gaitSpeed = 1.3f; a.fur = 0.012f;
        auto& s = c.add("Guinea Pig", "Cavia porcellus", AC::Small, "Rodent", a, 6, "Hay, veg, vitamin C", 0.05f, 40, 1,
                        "Happy guinea pigs 'popcorn' - jumping straight up in the air.");
        s.coats = pick(rodentLib(), {"Golden", "Cream", "White", "Black", "Red", "Tortoiseshell", "Tort & White", "Dutch", "Himalayan",
                                     "Agouti", "Roan", "Dalmatian", "Cinnamon", "Sable", "Blue"});
    }
    {
        AnimalShape a = rodent(0.05f, 0.11f, 0.13f);
        a.tail = Tail::Stub; a.tailLen = 0.1f; a.ear = Ear::Round; a.earSize = 0.4f; a.headLen = 0.85f; a.snoutLen = 0.35f;
        a.girth = 0.4f; a.legRatio = 0.18f; a.fur = 0.008f;
        auto& s = c.add("Syrian Hamster", "Mesocricetus auratus", AC::Small, "Rodent", a, 3, "Seeds, veg, protein", 0.25f, 25, 0.5f,
                        "Cheek pouches stretch back to the shoulders - it carries food home to hoard.");
        s.coats = pick(rodentLib(), {"Golden", "Cream", "Black", "White", "Cinnamon", "Sable", "Banded Golden", "Tortoiseshell", "Dalmatian",
                                     "Roan", "Blue", "Mink"});
    }
    {
        AnimalShape a = mustelid(0.1f, 0.35f, 1.2f);
        a.tail = Tail::Normal; a.tailLen = 0.35f; a.tailThick = 0.22f;
        auto& s = c.add("Ferret", "Mustela furo", AC::Small, "Mustelid", a, 8, "Meat (obligate carnivore)", 0.35f, 150, 1.5f,
                        "An excited ferret does the 'weasel war dance', hopping sideways with an arched back.");
        s.coats = {cv("Sable", vec3(0.5f, 0.4f, 0.28f), DKBROWN, CREAM, MASK_RINGS, 0.5f), cv("Albino", WHITE, WHITE, WHITE, SOLID),
                   cv("Champagne", vec3(0.7f, 0.6f, 0.45f), vec3(0.45f, 0.3f, 0.2f), CREAM, MASK_RINGS),
                   cv("Black Sable", vec3(0.4f, 0.36f, 0.32f), K, WHITE, MASK_RINGS),
                   cv("Cinnamon", vec3(0.55f, 0.38f, 0.22f), vec3(0.35f, 0.18f, 0.08f), CREAM, SOLID),
                   cv("Silver", vec3(0.6f, 0.6f, 0.6f), GRAY, WHITE, SOLID),
                   cv("Panda", WHITE, DKBROWN, WHITE, COLORPOINT),
                   cv("Blaze", vec3(0.5f, 0.4f, 0.28f), DKBROWN, WHITE, MASK_RINGS, 0.5f, 1, {0.8f, 1.0f, 0, 0})};
    }
    {
        AnimalShape a = rodent(0.1f, 0.25f, 0.6f);
        a.ear = Ear::Round; a.earSize = 0.55f; a.tail = Tail::Bushy; a.tailLen = 0.55f; a.tailThick = 0.3f; a.tailCarry = 30;
        a.fur = 0.03f; a.fluff = 0.8f; a.headLen = 0.75f; a.eyeSize = 0.22f;
        auto& s = c.add("Chinchilla", "Chinchilla lanigera", AC::Small, "Rodent", a, 15, "Hay, pellets", 0.15f, 150, 1,
                        "Has the densest fur of any land animal - about 60 hairs grow from each follicle.");
        s.coats = {cv("Standard Gray", vec3(0.45f, 0.45f, 0.46f), vec3(0.2f, 0.2f, 0.2f), WHITE, COUNTERSHADE, 0.8f),
                   cv("Beige", vec3(0.62f, 0.52f, 0.42f), vec3(0.5f, 0.4f, 0.3f), WHITE, COUNTERSHADE, 0.8f),
                   cv("Black Velvet", vec3(0.06f, 0.06f, 0.06f), WHITE, WHITE, COUNTERSHADE, 0.8f),
                   cv("White", WHITE, WHITE, WHITE, SOLID), cv("Ebony", vec3(0.04f, 0.04f, 0.04f), K, WHITE, SOLID),
                   cv("Violet", vec3(0.5f, 0.46f, 0.52f), WHITE, WHITE, COUNTERSHADE, 0.8f),
                   cv("Sapphire", vec3(0.46f, 0.5f, 0.56f), WHITE, WHITE, COUNTERSHADE, 0.8f),
                   cv("Mosaic", WHITE, GRAY, WHITE, MERLE)};
    }
    {
        AnimalShape a = rodent(0.07f, 0.22f, 0.4f);
        a.ear = Ear::Round; a.earSize = 0.35f; a.tail = Tail::Thin; a.tailLen = 0.9f; a.headLen = 0.75f; a.snoutLen = 0.45f;
        a.girth = 0.25f; a.legRatio = 0.25f;
        auto& s = c.add("Fancy Rat", "Rattus norvegicus domestica", AC::Small, "Rodent", a, 3, "Rat blocks, veg", 0.1f, 20, 0.5f,
                        "Rats laugh when tickled - at a pitch too high for humans to hear.");
        s.coats = pick(rodentLib(), {"Hooded", "Berkshire", "Agouti", "Black", "White", "Himalayan", "Siamese", "Blue", "Mink", "Cinnamon",
                                     "Dutch", "Roan", "Cream"});
    }
    {
        AnimalShape a = bird(0.1f, 0.08f, 0.035f);
        a.neckAngle = 60; a.legRatio = 0.18f; a.headLen = 0.75f; a.snoutLen = 0.2f; a.beak = Beak::Hook; a.wingLen = 1.3f; a.tailLen = 1.2f;
        a.tail = Tail::LongThin; a.foot = Foot::Claw; a.noseColor = {0.7f, 0.6f, 0.4f}; a.eyeSize = 0.25f;
        auto& s = c.add("Budgerigar", "Melopsittacus undulatus", AC::Small, "Bird", a, 7, "Seeds, veg", 0.1f, 30, 0.4f,
                        "The cere above the beak shows sex: usually blue in males and brown in females.");
        s.coats = {cv("Green", vec3(0.2f, 0.5f, 0.05f), vec3(0.4f, 0.4f, 0.1f), vec3(0.6f, 0.6f, 0.1f), FEATHERS, 0.2f),
                   cv("Sky Blue", vec3(0.1f, 0.35f, 0.65f), vec3(0.2f, 0.25f, 0.3f), WHITE, FEATHERS, 0.2f),
                   cv("Yellow (Lutino)", vec3(0.8f, 0.7f, 0.1f), vec3(0.8f, 0.72f, 0.2f), WHITE, FEATHERS, 0.2f),
                   cv("White (Albino)", WHITE, WHITE, WHITE, FEATHERS, 0.2f),
                   cv("Violet", vec3(0.3f, 0.2f, 0.6f), vec3(0.2f, 0.2f, 0.3f), WHITE, FEATHERS, 0.2f),
                   cv("Gray", vec3(0.35f, 0.36f, 0.38f), vec3(0.2f, 0.2f, 0.2f), WHITE, FEATHERS, 0.2f),
                   cv("Pied Green", vec3(0.2f, 0.5f, 0.05f), vec3(0.7f, 0.65f, 0.1f), vec3(0.7f, 0.65f, 0.1f), FEATHERS, 0.6f),
                   cv("Cobalt", vec3(0.04f, 0.12f, 0.5f), vec3(0.1f, 0.12f, 0.2f), WHITE, FEATHERS, 0.2f)};
    }
    {
        AnimalShape a = bird(0.18f, 0.12f, 0.09f);
        a.neckAngle = 60; a.legRatio = 0.15f; a.headLen = 0.7f; a.snoutLen = 0.2f; a.beak = Beak::Hook; a.wingLen = 1.3f; a.tailLen = 1.5f;
        a.tail = Tail::LongThin; a.extras = X_CREST; a.noseColor = {0.5f, 0.45f, 0.4f};
        auto& s = c.add("Cockatiel", "Nymphicus hollandicus", AC::Small, "Bird", a, 18, "Seeds, pellets, veg", 0.1f, 120, 0.5f,
                        "Its crest shows its mood: straight up when startled, flat when angry.");
        s.coats = {cv("Normal Gray", vec3(0.3f, 0.3f, 0.3f), vec3(0.25f, 0.25f, 0.25f), WHITE, FEATHERS, 0.1f),
                   cv("Lutino", vec3(0.85f, 0.8f, 0.55f), vec3(0.85f, 0.8f, 0.6f), WHITE, FEATHERS, 0.1f),
                   cv("Pied", vec3(0.3f, 0.3f, 0.3f), vec3(0.8f, 0.75f, 0.5f), vec3(0.8f, 0.75f, 0.5f), FEATHERS, 0.7f),
                   cv("Pearl", vec3(0.4f, 0.36f, 0.3f), vec3(0.6f, 0.55f, 0.35f), WHITE, FEATHERS, 0.2f),
                   cv("Cinnamon", vec3(0.35f, 0.28f, 0.2f), vec3(0.3f, 0.24f, 0.18f), WHITE, FEATHERS, 0.1f),
                   cv("Whiteface", vec3(0.25f, 0.25f, 0.27f), vec3(0.2f, 0.2f, 0.2f), WHITE, FEATHERS, 0.2f),
                   cv("Albino", WHITE, WHITE, WHITE, FEATHERS, 0.1f)};
    }
}

void mediumAnimals(Cat& c) {
    const char* DOG = "Canis lupus familiaris";
    const char* CAT = "Felis catus";
    {
        AnimalShape a = dog(0.57f, 0.6f, 32);
        a.headLen = 0.42f; a.headWidth = 0.6f; a.snoutWidth = 0.65f; a.tail = Tail::Thick; a.tailThick = 0.28f; a.tailCarry = 10;
        a.fur = 0.015f; a.tuck = 0.2f; a.girth = 0.24f;
        auto& s = c.add("Labrador Retriever", DOG, AC::Medium, "Dog", a, 12, "Dog food", 0.15f, 300, 3,
                        "Labs have water-resistant double coats and an 'otter tail' used as a rudder.");
        s.coats = pick(dogLib(), {"Black", "Yellow", "Chocolate", "Fox Red", "Cream", "Silver"});
    }
    {
        AnimalShape a = dog(0.58f, 0.62f, 32);
        a.headLen = 0.42f; a.headWidth = 0.58f; a.fur = 0.05f; a.fluff = 0.5f; a.tail = Tail::Bushy; a.tailCarry = 10; a.extras |= X_LONG_COAT;
        auto& s = c.add("Golden Retriever", DOG, AC::Medium, "Dog", a, 11, "Dog food", 0.1f, 350, 3,
                        "Bred in Scotland to retrieve birds with a 'soft mouth' that doesn't damage them.");
        s.coats = pick(dogLib(), {"Gold", "Light Gold", "Dark Gold", "Cream"});
    }
    {
        AnimalShape a = dog(0.62f, 0.7f, 35);
        a.ear = Ear::Erect; a.earSize = 0.5f; a.snoutLen = 0.5f; a.snoutWidth = 0.5f; a.stop = 0.35f; a.rumpRatio = 0.9f;
        a.tail = Tail::Bushy; a.tailLen = 0.6f; a.tailCarry = -25; a.fur = 0.035f; a.fluff = 0.2f; a.eyeColor = {0.25f, 0.13f, 0.05f};
        auto& s = c.add("German Shepherd", DOG, AC::Medium, "Dog", a, 11, "Dog food", 0.45f, 400, 3.5f,
                        "One of the most common police and service dogs; they can learn a command in five repetitions.");
        s.coats = pick(dogLib(), {"Black & Tan Saddle", "Black & Red Saddle", "Sable", "Black", "White", "Blue", "Liver", "Red Sable"});
    }
    {
        AnimalShape a = dog(0.38f, 0.42f, 10);
        a.earSize = 0.55f; a.snoutWidth = 0.6f; a.tailCarry = 70; a.tail = Tail::Normal; a.fur = 0.01f; a.headLen = 0.46f;
        auto& s = c.add("Beagle", DOG, AC::Medium, "Dog", a, 13, "Dog food", 0.25f, 300, 2.5f,
                        "Has about 220 million scent receptors; the white tail tip helped hunters see it in tall grass.");
        s.coats = pick(dogLib(), {"Tricolor Saddle", "Tricolor", "Lemon & White", "Red & White", "Tan & White", "Chocolate & Tan", "Blue & Tan"});
        for (auto& v : s.coats) v.marks.w = 1.0f;
    }
    {
        AnimalShape a = dog(0.53f, 0.55f, 18);
        a.ear = Ear::Folded; a.earSize = 0.4f; a.fur = 0.04f; a.fluff = 0.45f; a.extras |= X_RUFF; a.tail = Tail::Bushy; a.tailCarry = -15;
        a.snoutWidth = 0.48f; a.gaitSpeed = 1.2f;
        auto& s = c.add("Border Collie", DOG, AC::Medium, "Dog", a, 13, "Dog food", 0.3f, 300, 3,
                        "Widely considered the most intelligent dog breed; herds sheep with an intense 'eye' stare.");
        s.coats = pick(dogLib(), {"Black Tuxedo", "Tricolor", "Red Tricolor", "Blue Merle", "Red Merle", "Blue & White", "Liver & White",
                                  "Lemon & White", "Black & White"});
        for (auto& v : s.coats) v.marks = vec4(0.7f, 0.9f, 1.0f, 0.9f);
    }
    {
        AnimalShape a = dog(0.56f, 0.6f, 24);
        a.ear = Ear::Erect; a.earSize = 0.42f; a.tail = Tail::Bushy; a.tailCarry = 50; a.fur = 0.04f; a.fluff = 0.4f; a.extras |= X_RUFF;
        a.snoutLen = 0.45f; a.stop = 0.35f; a.eyeColor = {0.1f, 0.35f, 0.7f};
        auto& s = c.add("Siberian Husky", DOG, AC::Medium, "Dog", a, 13, "Dog food", 0.35f, 400, 3.5f,
                        "Bred by the Chukchi people to pull light sleds over long distances; many have blue eyes.");
        s.coats = pick(dogLib(), {"Black & White Husky", "Gray & White Husky", "Red & White Husky", "Agouti", "White", "Wolf Gray", "Sable"});
    }
    {
        AnimalShape a = dog(0.6f, 0.6f, 30);
        a.headLen = 0.38f; a.headWidth = 0.7f; a.snoutLen = 0.25f; a.snoutWidth = 0.9f; a.stop = 0.9f; a.ear = Ear::Folded; a.earSize = 0.35f;
        a.tail = Tail::Stub; a.tailCarry = 60; a.tailLen = 0.12f; a.fur = 0.006f; a.extras |= X_JOWLS; a.tuck = 0.45f; a.legThick = 0.32f;
        auto& s = c.add("Boxer", DOG, AC::Medium, "Dog", a, 11, "Dog food", 0.3f, 350, 3,
                        "Named for 'boxing' with its front paws when it plays.");
        s.coats = pick(dogLib(), {"Fawn", "Brindle", "Red Brindle", "Seal Brindle", "White", "Fawn & White"});
        for (auto& v : s.coats) v.marks = vec4(0.5f, 0.6f, 1.0f, 0.0f);
    }
    {
        AnimalShape a = dog(0.36f, 0.45f, 23);
        a.headLen = 0.72f; a.headWidth = 0.9f; a.snoutLen = 0.12f; a.snoutWidth = 1.0f; a.stop = 1.0f; a.ear = Ear::Rose; a.earSize = 0.25f;
        a.tail = Tail::Stub; a.tailLen = 0.1f; a.tailCarry = -10; a.legRatio = 0.4f; a.girth = 0.32f; a.tuck = 0.3f; a.legThick = 0.4f;
        a.rumpRatio = 0.92f; a.fur = 0.005f; a.extras |= X_WRINKLES | X_JOWLS; a.gaitSpeed = 0.8f;
        auto& s = c.add("English Bulldog", DOG, AC::Medium, "Dog", a, 9, "Dog food", 0.2f, 600, 4,
                        "Its pushed-in face makes it overheat easily - keep it cool and calm.");
        s.coats = pick(dogLib(), {"Red & White", "Fawn & White", "Brindle", "Red Brindle", "Fawn", "White", "Red", "Piebald"});
    }
    {
        AnimalShape a = dog(0.58f, 0.55f, 25);
        a.fur = 0.06f; a.fluff = 1.0f; a.ear = Ear::Floppy; a.earSize = 0.5f; a.snoutLen = 0.5f; a.snoutWidth = 0.45f; a.stop = 0.4f;
        a.tail = Tail::Normal; a.tailCarry = 70; a.tailLen = 0.35f; a.legRatio = 0.56f; a.tuck = 0.4f;
        auto& s = c.add("Standard Poodle", DOG, AC::Medium, "Dog", a, 13, "Dog food", 0.2f, 450, 3.5f,
                        "Originally a German water retriever; the fancy clip kept joints warm in cold water.");
        s.coats = pick(dogLib(), {"White", "Black", "Apricot", "Silver", "Chocolate", "Cream", "Red", "Blue", "Gray", "Black & White"});
    }
    {
        AnimalShape a = dog(0.55f, 0.58f, 25);
        a.ear = Ear::Folded; a.earSize = 0.38f; a.fur = 0.04f; a.fluff = 0.45f; a.extras |= X_RUFF; a.tail = Tail::Stub; a.tailLen = 0.12f;
        a.eyeColor = {0.15f, 0.35f, 0.6f};
        auto& s = c.add("Australian Shepherd", DOG, AC::Medium, "Dog", a, 13, "Dog food", 0.3f, 400, 3,
                        "Despite the name, the breed was developed on ranches in the western United States.");
        s.coats = pick(dogLib(), {"Blue Merle", "Red Merle", "Tricolor", "Red Tricolor", "Black Tuxedo", "Liver"});
    }
    {
        AnimalShape a = dog(0.48f, 0.5f, 25);
        a.headLen = 0.5f; a.headWidth = 0.8f; a.snoutLen = 0.38f; a.snoutWidth = 0.8f; a.stop = 0.7f; a.ear = Ear::Rose; a.earSize = 0.3f;
        a.girth = 0.27f; a.legThick = 0.36f; a.fur = 0.005f; a.tail = Tail::Thin; a.tailCarry = 0; a.tailLen = 0.5f;
        auto& s = c.add("American Pit Bull Terrier", DOG, AC::Medium, "Dog", a, 13, "Dog food", 0.3f, 150, 3,
                        "Among the most common dogs in US shelters - and among the most affectionate with people.");
        s.coats = pick(dogLib(), {"Blue", "Red", "Fawn", "Black", "Brindle", "Blue & White", "Fawn & White", "Black & White", "Seal Brindle",
                                  "Liver", "White", "Red Brindle", "Black Tuxedo"});
    }
    {
        AnimalShape a = dog(0.28f, 0.42f, 12);
        a.legRatio = 0.3f; a.ear = Ear::Erect; a.earSize = 0.55f; a.snoutLen = 0.45f; a.stop = 0.35f; a.tail = Tail::Stub; a.tailLen = 0.05f;
        a.fur = 0.03f; a.fluff = 0.35f; a.extras |= X_RUFF; a.chestDepth = 0.72f; a.tuck = 0.15f; a.legThick = 0.36f;
        auto& s = c.add("Pembroke Welsh Corgi", DOG, AC::Medium, "Dog", a, 13, "Dog food", 0.3f, 500, 2.5f,
                        "A cattle herder that nips at heels; Welsh legend says fairies rode them.");
        s.coats = pick(dogLib(), {"Red", "Sable", "Fawn", "Tricolor", "Red Sable"});
        for (auto& v : s.coats) v.marks = vec4(1.0f, 0.8f, 1.0f, 0.0f);
    }
    {
        AnimalShape a = dog(0.38f, 0.4f, 13);
        a.ear = Ear::Floppy; a.earSize = 0.7f; a.fur = 0.05f; a.fluff = 0.5f; a.extras |= X_LONG_COAT; a.headLen = 0.5f; a.stop = 0.75f;
        a.snoutLen = 0.4f; a.snoutWidth = 0.65f; a.tail = Tail::Stub; a.tailLen = 0.2f; a.tailCarry = 20; a.eyeSize = 0.16f;
        auto& s = c.add("Cocker Spaniel", DOG, AC::Medium, "Dog", a, 13, "Dog food", 0.2f, 350, 3,
                        "Named for hunting woodcock; its long ears help sweep scent toward its nose.");
        s.coats = pick(dogLib(), {"Black", "Gold", "Red", "Chocolate", "Black & Tan", "Black & White", "Red & White", "Liver & White",
                                  "Tricolor", "Blue Merle", "Cream"});
    }
    {
        AnimalShape a = dog(0.4f, 0.42f, 10);
        a.ear = Ear::Erect; a.earSize = 0.38f; a.tail = Tail::CurledUp; a.tailCarry = 70; a.tailThick = 0.3f; a.fur = 0.03f; a.fluff = 0.3f;
        a.snoutLen = 0.42f; a.snoutWidth = 0.5f; a.stop = 0.4f; a.eyeSize = 0.1f; a.headWidth = 0.66f;
        auto& s = c.add("Shiba Inu", DOG, AC::Medium, "Dog", a, 14, "Dog food", 0.4f, 800, 2.5f,
                        "An ancient Japanese hunting breed famous for the dramatic 'Shiba scream'.");
        s.coats = {cv("Red Urajiro", RED * 1.15f, RED, WHITE, COUNTERSHADE, 1.0f, 1, {0.4f, 0, 1.0f, 0.4f}),
                   cv("Black & Tan Urajiro", K, TAN, WHITE, TAN_POINTS, 1.0f, 1, {0.3f, 0, 1.0f, 0.3f}),
                   cv("Sesame", RED, K, WHITE, AGOUTI, 1.0f),
                   cv("Cream", CREAM, CREAM, WHITE, SOLID)};
    }
    {
        AnimalShape a = dog(0.58f, 0.6f, 25);
        a.ear = Ear::Floppy; a.earSize = 0.4f; a.tail = Tail::Normal; a.tailCarry = 15; a.fur = 0.005f; a.tuck = 0.45f;
        auto& s = c.add("Dalmatian", DOG, AC::Medium, "Dog", a, 12, "Dog food", 0.35f, 350, 3,
                        "Puppies are born pure white; the spots appear after about two weeks.");
        s.coats = pick(dogLib(), {"Spotted Black", "Spotted Liver", "Spotted Lemon"});
    }
    {
        AnimalShape a = dog(0.72f, 0.72f, 32);
        a.legRatio = 0.6f; a.girth = 0.17f; a.tuck = 0.9f; a.chestDepth = 0.6f; a.rumpRatio = 0.98f; a.neckLen = 0.5f; a.neckAngle = 35;
        a.headLen = 0.36f; a.headWidth = 0.42f; a.snoutLen = 0.52f; a.snoutWidth = 0.42f; a.stop = 0.1f; a.ear = Ear::Rose; a.earSize = 0.25f;
        a.tail = Tail::LongThin; a.tailLen = 0.8f; a.tailThick = 0.14f; a.tailCarry = -30; a.fur = 0.004f; a.gaitSpeed = 1.2f;
        auto& s = c.add("Greyhound", DOG, AC::Medium, "Dog", a, 12, "Dog food", 0.1f, 200, 3,
                        "Can reach 72 km/h, yet retired racers are famously lazy 'couch potatoes'.");
        s.coats = pick(dogLib(), {"Black", "Brindle", "Fawn", "Blue", "Red", "White", "Black & White", "Blue & White", "Red Brindle", "Fawn & White"});
    }
    {
        AnimalShape a = dog(0.35f, 0.65f, 28);
        a.legRatio = 0.25f; a.girth = 0.22f; a.chestDepth = 0.8f; a.tuck = 0.1f; a.headLen = 0.75f; a.headWidth = 0.5f; a.snoutLen = 0.5f;
        a.stop = 0.4f; a.ear = Ear::Floppy; a.earSize = 0.75f; a.extras |= X_JOWLS | X_WRINKLES; a.tail = Tail::Normal; a.tailCarry = 50;
        a.legThick = 0.42f; a.fur = 0.008f; a.gaitSpeed = 0.75f; a.eyeSize = 0.11f;
        auto& s = c.add("Basset Hound", DOG, AC::Medium, "Dog", a, 11, "Dog food", 0.1f, 350, 3,
                        "Its nose is second only to the bloodhound; the long ears sweep scent upward.");
        s.coats = pick(dogLib(), {"Tricolor", "Tricolor Saddle", "Lemon & White", "Red & White", "Tan & White"});
    }
    {
        AnimalShape a = cat(0.3f, 0.46f, 8);
        a.ear = Ear::Tufted; a.earSize = 0.4f; a.extras |= X_EAR_TUFTS | X_RUFF; a.fur = 0.06f; a.fluff = 0.7f; a.tail = Tail::Bushy;
        a.tailLen = 0.9f; a.tailThick = 0.3f; a.snoutLen = 0.32f; a.snoutWidth = 0.6f; a.headWidth = 0.7f; a.headLen = 0.45f;
        auto& s = c.add("Maine Coon", CAT, AC::Medium, "Cat", a, 13, "Cat food", 0.15f, 400, 2,
                        "The 'gentle giant' of cats; tufted paws act like snowshoes.");
        s.coats = pick(catLib(), {"Brown Classic Tabby", "Brown Mackerel Tabby", "Silver Classic Tabby", "Silver Tabby", "Orange Classic Tabby",
                                  "Black", "White", "Blue", "Cream", "Calico", "Tortoiseshell", "Black & White", "Smoke", "Tabby & White",
                                  "Blue Tabby", "Orange & White"});
    }
    {
        AnimalShape a = cat(0.28f, 0.4f, 5.5f);
        a.earSize = 0.3f; a.fur = 0.008f; a.legRatio = 0.55f; a.tuck = 0.35f; a.tailThick = 0.24f; a.snoutLen = 0.32f;
        auto& s = c.add("Bengal", CAT, AC::Medium, "Cat", a, 14, "Cat food", 0.45f, 900, 2,
                        "A hybrid of domestic cats and the wild Asian leopard cat - many love water.");
        s.coats = pick(catLib(), {"Brown Spotted", "Snow Spotted", "Silver Spotted", "Brown Marbled"});
        s.coats.push_back(cv("Charcoal Spotted", vec3(0.2f, 0.18f, 0.17f), K, GRAY, ROSETTES, 0.5f));
        s.coats.push_back(cv("Blue Spotted", vec3(0.42f, 0.4f, 0.42f), BLUE, CREAM, ROSETTES, 0.5f));
    }
    {
        AnimalShape a = cat(0.28f, 0.45f, 7);
        a.fur = 0.055f; a.fluff = 0.6f; a.extras |= X_RUFF; a.tail = Tail::Bushy; a.tailThick = 0.3f; a.eyeColor = {0.08f, 0.25f, 0.65f};
        auto& s = c.add("Ragdoll", CAT, AC::Medium, "Cat", a, 15, "Cat food", 0.05f, 700, 2,
                        "Goes limp like a rag doll when picked up.");
        s.coats = pick(catLib(), {"Seal Point", "Blue Point", "Chocolate Point", "Lilac Point", "Flame Point", "Lynx Point", "Mitted Seal Point"});
        s.coats.push_back(cv("Bicolor Seal", vec3(0.72f, 0.64f, 0.52f), DKBROWN, WHITE, COLORPOINT, 0.5f, 1, {1.0f, 0.8f, 1.0f, 0.0f}));
        s.coats.push_back(cv("Bicolor Blue", vec3(0.72f, 0.72f, 0.72f), vec3(0.2f, 0.22f, 0.26f), WHITE, COLORPOINT, 0.5f, 1, {1.0f, 0.8f, 1.0f, 0.0f}));
    }
    {
        AnimalShape a = cat(0.26f, 0.36f, 4.5f);
        a.fur = 0.0f; a.ear = Ear::Wide; a.earSize = 0.55f; a.extras |= X_WRINKLES; a.eyeSize = 0.22f; a.girth = 0.22f;
        auto& s = c.add("Sphynx", CAT, AC::Medium, "Cat", a, 13, "Cat food", 0.2f, 1200, 2.5f,
                        "Not truly hairless - it has fine peach-fuzz and needs weekly baths.");
        s.coats = pick(catLib(), {"Hairless Pink", "Hairless Black", "Hairless Calico"});
        s.coats.push_back(cv("Blue skin", vec3(0.35f, 0.33f, 0.36f), vec3(0.35f, 0.33f, 0.36f), PINK, SOLID));
        s.coats.push_back(cv("Tabby skin", vec3(0.6f, 0.45f, 0.4f), vec3(0.3f, 0.22f, 0.2f), PINK, TABBY, 0.3f, 0.6f));
    }
    {
        AnimalShape a = cat(0.25f, 0.36f, 5);
        a.ear = Ear::Folded; a.earSize = 0.2f; a.headWidth = 0.95f; a.snoutLen = 0.2f; a.eyeSize = 0.24f; a.eyeColor = {0.55f, 0.35f, 0.05f};
        auto& s = c.add("Scottish Fold", CAT, AC::Medium, "Cat", a, 13, "Cat food", 0.1f, 800, 2,
                        "The folded ears come from a cartilage mutation that can also cause joint pain.");
        s.coats = pick(catLib(), {"Blue", "Silver Tabby", "Brown Classic Tabby", "Cream", "White", "Black", "Calico", "Orange Tabby", "Black & White"});
    }
    {
        AnimalShape a = cat(0.28f, 0.38f, 4.5f);
        a.earSize = 0.45f; a.ear = Ear::Wide; a.tuck = 0.4f; a.legRatio = 0.56f; a.fur = 0.01f; a.eyeColor = {0.5f, 0.45f, 0.08f};
        auto& s = c.add("Abyssinian", CAT, AC::Medium, "Cat", a, 14, "Cat food", 0.35f, 600, 2,
                        "Each hair is banded with 4-6 colors, giving the 'ticked' coat.");
        s.coats = pick(catLib(), {"Ruddy", "Sorrel", "Fawn Ticked", "Blue"});
    }
    {
        AnimalShape a = rabbit(0.32f, 0.55f, 7);
        a.earSize = 0.8f; a.girth = 0.3f;
        auto& s = c.add("Flemish Giant", "Oryctolagus cuniculus", AC::Medium, "Rabbit", a, 8, "Hay, greens, pellets", 0.05f, 100, 2,
                        "The largest rabbit breed - some reach over 10 kg and 1.2 m stretched out.");
        s.coats = pick(rabbitLib(), {"Steel", "Chinchilla", "Black", "Blue", "Fawn", "REW", "Chestnut Agouti", "Opal", "Lilac"});
    }
    {
        AnimalShape a = caprine(0.5f, 0.55f, 34);
        a.ear = Ear::Pointed; a.earSize = 0.4f; a.hornSize = 0.35f;
        auto& s = c.add("Nigerian Dwarf Goat", "Capra hircus", AC::Medium, "Goat", a, 13, "Hay, browse, grain", 0.2f, 250, 3,
                        "A miniature dairy goat whose milk is very high in butterfat.");
        s.coats = pick(farmLib(), {"Goat Black", "Goat Chocolate", "Goat Gold", "Goat Chamoisee", "Goat Buckskin", "Goat Black & White",
                                   "Goat Brown & White", "Goat Gold & White", "Goat White", "Goat Spotted", "Goat Caramel"});
    }
    {
        AnimalShape a = caprine(0.45f, 0.55f, 30);
        a.legRatio = 0.45f; a.girth = 0.26f; a.hornSize = 0.35f; a.ear = Ear::Wide;
        auto& s = c.add("Pygmy Goat", "Capra hircus", AC::Medium, "Goat", a, 12, "Hay, browse, grain", 0.25f, 200, 3,
                        "Originally from West Africa's Cameroon valley; stocky, playful climbers.");
        s.coats = pick(farmLib(), {"Goat Caramel", "Goat Agouti", "Goat Black", "Goat Black & White", "Goat White", "Goat Chocolate"});
    }
    {
        AnimalShape a = caprine(0.55f, 0.65f, 60);
        a.fur = 0.06f; a.fluff = 1.0f; a.legRatio = 0.42f; a.girth = 0.28f; a.headLen = 0.4f; a.snoutLen = 0.38f; a.ear = Ear::Wide;
        a.earSize = 0.35f; a.horns = Horns::None; a.extras = 0; a.tail = Tail::Stub; a.tailCarry = -30; a.noseColor = {0.15f, 0.12f, 0.12f};
        auto& s = c.add("Babydoll Southdown Sheep", "Ovis aries", AC::Medium, "Sheep", a, 13, "Grass, hay", 0.05f, 300, 3,
                        "Their permanent 'smile' made them popular as gentle weeders in vineyards.");
        s.coats = pick(farmLib(), {"Sheep Cream", "Sheep White", "Sheep Black", "Sheep Gray", "Sheep Moorit", "Sheep Spotted"});
    }
    {
        AnimalShape a = pig(0.5f, 0.75f, 70);
        a.headLen = 0.52f; a.snoutLen = 0.42f; a.stop = 0.4f; a.extras = X_WRINKLES; a.chestDepth = 0.85f; a.tail = Tail::Thin; a.tailLen = 0.25f;
        a.tailCarry = -20; a.fur = 0.008f;
        auto& s = c.add("Pot-bellied Pig", "Sus domesticus", AC::Medium, "Pig", a, 16, "Pig pellets, veg", 0.3f, 200, 4,
                        "Pigs are as smart as a three-year-old child and can learn their names.");
        s.coats = pick(farmLib(), {"Pig Black", "Pig Pink", "Pig Black & White", "Pig Spotted", "Pig Gray", "Pig Ginger Spotted"});
    }
    {
        AnimalShape a = bird(0.5f, 0.35f, 4);
        a.neckAngle = 30; a.legRatio = 0.2f; a.neckLen = 0.5f; a.headLen = 0.35f; a.snoutLen = 0.55f; a.beak = Beak::Duck; a.foot = Foot::Webbed;
        a.wingLen = 0.85f; a.tailLen = 0.2f; a.tail = Tail::Stub; a.noseColor = {0.9f, 0.55f, 0.1f}; a.eyeSize = 0.2f; a.gait = Gait::Waddle;
        auto& s = c.add("Pekin Duck", "Anas platyrhynchos domesticus", AC::Medium, "Duck", a, 10, "Duck pellets, greens", 0.1f, 30, 1,
                        "Descended from mallards domesticated in China over 2,000 years ago.");
        s.coats = {cv("White", vec3(0.85f, 0.82f, 0.72f), vec3(0.82f, 0.8f, 0.72f), WHITE, FEATHERS, 0.2f),
                   cv("Cream", vec3(0.82f, 0.74f, 0.55f), vec3(0.8f, 0.72f, 0.55f), WHITE, FEATHERS, 0.2f)};
    }
    {
        AnimalShape a = bird(0.4f, 0.3f, 3.5f);
        a.neckAngle = 30; a.legRatio = 0.4f; a.neckLen = 0.35f; a.headLen = 0.35f; a.snoutLen = 0.3f; a.beak = Beak::Chicken;
        a.extras = X_COMB | X_WATTLE; a.tail = Tail::Fan; a.tailLen = 0.6f; a.wingLen = 0.7f; a.noseColor = {0.7f, 0.55f, 0.25f};
        a.eyeColor = {0.6f, 0.3f, 0.05f}; a.femaleScale = 0.8f;
        auto& s = c.add("Rhode Island Red", "Gallus gallus domesticus", AC::Medium, "Chicken", a, 8, "Layer feed, grains", 0.25f, 20, 0.5f,
                        "A tough dual-purpose breed - hens lay around 250 brown eggs a year.");
        s.coats = {cv("Mahogany", vec3(0.3f, 0.07f, 0.02f), vec3(0.2f, 0.05f, 0.02f), K, FEATHERS, 0.0f),
                   cv("Rust", vec3(0.4f, 0.12f, 0.03f), vec3(0.3f, 0.08f, 0.03f), K, FEATHERS, 0.0f),
                   cv("Light Red", vec3(0.5f, 0.2f, 0.06f), vec3(0.4f, 0.15f, 0.05f), K, FEATHERS, 0.0f)};
    }
    {
        AnimalShape a = bird(0.3f, 0.25f, 1.5f);
        a.neckAngle = 25; a.legRatio = 0.3f; a.neckLen = 0.3f; a.headLen = 0.35f; a.snoutLen = 0.2f; a.beak = Beak::Chicken; a.extras = X_CREST;
        a.fur = 0.03f; a.tail = Tail::Puff; a.tailLen = 0.3f; a.wingLen = 0.6f; a.noseColor = {0.2f, 0.2f, 0.25f}; a.femaleScale = 0.85f;
        auto& s = c.add("Silkie Chicken", "Gallus gallus domesticus", AC::Medium, "Chicken", a, 9, "Layer feed, grains", 0.05f, 30, 0.5f,
                        "Fluffy fur-like feathers, black skin and bones, and five toes instead of four.");
        s.coats = {cv("White", WHITE, WHITE, WHITE, FEATHERS, 0.0f), cv("Black", vec3(0.03f, 0.03f, 0.035f), K, K, FEATHERS, 0.0f),
                   cv("Buff", BUFF, BUFF, BUFF, FEATHERS, 0.0f), cv("Blue", vec3(0.25f, 0.27f, 0.3f), BLUE, BLUE, FEATHERS, 0.0f),
                   cv("Partridge", vec3(0.3f, 0.18f, 0.08f), K, K, FEATHERS, 0.3f), cv("Splash", WHITE, GRAY, WHITE, FEATHERS, 0.3f),
                   cv("Lavender", vec3(0.55f, 0.52f, 0.55f), LILAC, LILAC, FEATHERS, 0.0f)};
    }
    {
        AnimalShape a = lizard(0.04f, 0.22f, 0.5f);
        a.girth = 0.28f; a.headLen = 0.35f; a.headWidth = 0.9f; a.snoutLen = 0.3f; a.tailLen = 1.1f; a.extras = X_FRILL; a.eyeSize = 0.14f;
        auto& s = c.add("Bearded Dragon", "Pogona vitticeps", AC::Medium, "Reptile", a, 12, "Insects, greens", 0.1f, 150, 1,
                        "Waves an arm to show submission and puffs up a spiny black 'beard' when threatened.");
        s.coats = {cv("Sandfire", vec3(0.55f, 0.35f, 0.15f), vec3(0.7f, 0.25f, 0.08f), vec3(0.8f, 0.7f, 0.5f), SCALES, 0.4f),
                   cv("Normal Tan", vec3(0.45f, 0.36f, 0.24f), vec3(0.3f, 0.22f, 0.14f), vec3(0.75f, 0.68f, 0.52f), SCALES, 0.4f),
                   cv("Citrus", vec3(0.7f, 0.55f, 0.15f), vec3(0.6f, 0.35f, 0.1f), vec3(0.85f, 0.8f, 0.5f), SCALES, 0.4f),
                   cv("Red", vec3(0.55f, 0.15f, 0.06f), vec3(0.4f, 0.1f, 0.05f), vec3(0.75f, 0.55f, 0.4f), SCALES, 0.4f),
                   cv("Hypo White", vec3(0.75f, 0.7f, 0.6f), vec3(0.65f, 0.55f, 0.45f), WHITE, SCALES, 0.3f),
                   cv("Zero", vec3(0.55f, 0.55f, 0.52f), vec3(0.5f, 0.5f, 0.48f), WHITE, SCALES, 0.1f)};
    }
    {
        AnimalShape a = lizard(0.06f, 0.4f, 4);
        a.girth = 0.23f; a.headLen = 0.25f; a.headWidth = 0.6f; a.snoutLen = 0.35f; a.tailLen = 2.5f; a.extras = X_DEWLAP | X_CREST;
        a.eyeColor = {0.6f, 0.4f, 0.1f};
        auto& s = c.add("Green Iguana", "Iguana iguana", AC::Medium, "Reptile", a, 15, "Leafy greens (herbivore)", 0.3f, 100, 2,
                        "Has a 'third eye' on top of its head that senses light and shadows from above.");
        s.coats = {cv("Green", vec3(0.2f, 0.4f, 0.08f), vec3(0.08f, 0.15f, 0.04f), vec3(0.4f, 0.5f, 0.2f), SCALES, 0.5f),
                   cv("Blue Axanthic", vec3(0.25f, 0.35f, 0.4f), vec3(0.1f, 0.15f, 0.2f), vec3(0.5f, 0.55f, 0.6f), SCALES, 0.5f),
                   cv("Red", vec3(0.5f, 0.2f, 0.08f), vec3(0.25f, 0.1f, 0.05f), vec3(0.6f, 0.4f, 0.2f), SCALES, 0.5f),
                   cv("Albino", vec3(0.75f, 0.7f, 0.5f), vec3(0.65f, 0.55f, 0.35f), WHITE, SCALES, 0.4f)};
    }
    {
        AnimalShape a = snake(0.05f, 1.2f, 1.5f);
        a.headWidth = 1.2f; a.headLen = 0.045f; a.eyeColor = {0.25f, 0.18f, 0.08f}; a.pupil = Pupil::Slit;
        auto& s = c.add("Ball Python", "Python regius", AC::Medium, "Reptile", a, 30, "Rodents", 0.1f, 100, 0.5f,
                        "Named for curling into a tight ball with its head tucked inside when nervous.");
        s.coats = {cv("Normal", vec3(0.1f, 0.07f, 0.04f), vec3(0.5f, 0.35f, 0.15f), vec3(0.8f, 0.75f, 0.6f), SCALES, 0.7f),
                   cv("Pastel", vec3(0.3f, 0.2f, 0.08f), vec3(0.75f, 0.55f, 0.15f), WHITE, SCALES, 0.7f),
                   cv("Albino", vec3(0.8f, 0.75f, 0.6f), vec3(0.8f, 0.6f, 0.15f), WHITE, SCALES, 0.7f),
                   cv("Piebald", WHITE, vec3(0.5f, 0.35f, 0.15f), WHITE, SCALES, 0.4f),
                   cv("Banana", vec3(0.7f, 0.55f, 0.3f), vec3(0.5f, 0.35f, 0.3f), WHITE, SCALES, 0.6f),
                   cv("Clown", vec3(0.4f, 0.28f, 0.12f), vec3(0.15f, 0.1f, 0.05f), WHITE, SCALES, 0.3f),
                   cv("Axanthic", vec3(0.2f, 0.2f, 0.2f), vec3(0.55f, 0.55f, 0.55f), WHITE, SCALES, 0.7f),
                   cv("Blue-eyed Leucistic", WHITE, WHITE, WHITE, SCALES, 0.0f)};
    }
    {
        AnimalShape a = turtle(0.03f, 0.25f, 1.5f);
        a.girth = 0.38f; a.chestDepth = 0.3f; a.foot = Foot::Webbed;
        auto& s = c.add("Red-eared Slider", "Trachemys scripta elegans", AC::Medium, "Reptile", a, 30, "Pellets, greens, fish", 0.2f, 40, 0.5f,
                        "The red stripe behind each eye gives it the name; it slides off logs into water.");
        s.coats = {cv("Normal", vec3(0.15f, 0.2f, 0.07f), vec3(0.6f, 0.55f, 0.15f), vec3(0.7f, 0.6f, 0.2f), SCALES, 0.6f),
                   cv("Dark Olive", vec3(0.08f, 0.1f, 0.05f), vec3(0.4f, 0.4f, 0.1f), vec3(0.6f, 0.55f, 0.2f), SCALES, 0.6f),
                   cv("Albino", vec3(0.7f, 0.65f, 0.4f), vec3(0.8f, 0.7f, 0.3f), WHITE, SCALES, 0.6f)};
    }
    {
        AnimalShape a = turtle(0.12f, 0.7f, 70);
        a.girth = 0.42f; a.chestDepth = 0.5f; a.foot = Foot::Hoof; a.headLen = 0.15f;
        auto& s = c.add("Sulcata Tortoise", "Centrochelys sulcata", AC::Medium, "Reptile", a, 80, "Grass, hay (herbivore)", 0.1f, 300, 2,
                        "The third-largest tortoise in the world - they can outlive their owners.");
        s.coats = {cv("Sandy", vec3(0.55f, 0.42f, 0.25f), vec3(0.35f, 0.25f, 0.14f), vec3(0.7f, 0.6f, 0.45f), SCALES, 0.5f),
                   cv("Golden", vec3(0.65f, 0.5f, 0.25f), vec3(0.4f, 0.3f, 0.15f), vec3(0.75f, 0.65f, 0.45f), SCALES, 0.5f),
                   cv("Dark", vec3(0.35f, 0.27f, 0.18f), vec3(0.2f, 0.15f, 0.1f), vec3(0.6f, 0.5f, 0.35f), SCALES, 0.5f)};
    }
    {
        AnimalShape a = bird(0.33f, 0.2f, 0.45f);
        a.neckAngle = 60; a.legRatio = 0.12f; a.headLen = 0.6f; a.snoutLen = 0.3f; a.beak = Beak::Hook; a.wingLen = 1.1f; a.tailLen = 0.45f;
        a.tail = Tail::Stub; a.noseColor = {0.04f, 0.04f, 0.04f}; a.eyeColor = {0.75f, 0.72f, 0.6f};
        auto& s = c.add("African Grey Parrot", "Psittacus erithacus", AC::Medium, "Bird", a, 50, "Pellets, fruit, nuts", 0.2f, 1500, 1.5f,
                        "Can learn hundreds of words and use them in context; lives 40-60 years.");
        s.coats = {cv("Congo Grey", vec3(0.32f, 0.33f, 0.34f), vec3(0.22f, 0.22f, 0.24f), vec3(0.5f, 0.5f, 0.5f), FEATHERS, 0.2f),
                   cv("Timneh", vec3(0.24f, 0.24f, 0.25f), vec3(0.16f, 0.16f, 0.17f), vec3(0.4f, 0.4f, 0.4f), FEATHERS, 0.2f)};
    }
    {
        AnimalShape a = bird(0.85f, 0.3f, 1.1f);
        a.neckAngle = 65; a.legRatio = 0.08f; a.headLen = 0.5f; a.snoutLen = 0.45f; a.beak = Beak::Hook; a.wingLen = 1.2f; a.tailLen = 1.7f;
        a.tail = Tail::LongThin; a.noseColor = {0.04f, 0.04f, 0.04f}; a.eyeColor = {0.7f, 0.65f, 0.3f};
        auto& s = c.add("Blue-and-gold Macaw", "Ara ararauna", AC::Medium, "Bird", a, 60, "Nuts, fruit, pellets", 0.35f, 2000, 2,
                        "Its beak can crack a Brazil nut; eats clay to neutralize toxins in wild seeds.");
        s.coats = {cv("Blue & Gold", vec3(0.05f, 0.25f, 0.65f), vec3(0.05f, 0.3f, 0.7f), vec3(0.85f, 0.6f, 0.05f), FEATHERS, 0.9f)};
    }
    {
        AnimalShape a = dog(0.5f, 0.5f, 27);
        a.ear = Ear::Small; a.earSize = 0.25f; a.headWidth = 0.8f; a.snoutLen = 0.33f; a.snoutWidth = 0.75f; a.stop = 0.6f; a.fur = 0.07f;
        a.fluff = 1.0f; a.extras |= X_RUFF; a.tail = Tail::CurledUp; a.tailCarry = 75; a.tailThick = 0.35f; a.legRatio = 0.48f;
        a.eyeSize = 0.09f; a.gaitSpeed = 0.8f;
        auto& s = c.add("Chow Chow", DOG, AC::Medium, "Dog", a, 11, "Dog food", 0.5f, 600, 3,
                        "Has a blue-black tongue and a stiff, stilted walk from its straight hind legs.");
        s.coats = pick(dogLib(), {"Red", "Black", "Blue", "Cream", "Fawn"});
    }
    {
        AnimalShape a = snake(0.035f, 1.3f, 0.8f);
        a.headWidth = 1.0f; a.eyeColor = {0.5f, 0.3f, 0.1f};
        auto& s = c.add("Corn Snake", "Pantherophis guttatus", AC::Medium, "Reptile", a, 20, "Rodents", 0.05f, 80, 0.4f,
                        "Named for belly scales that look like Indian corn - or for living near corn stores.");
        s.coats = {cv("Normal", vec3(0.6f, 0.3f, 0.1f), vec3(0.6f, 0.12f, 0.05f), WHITE, SCALES, 0.8f),
                   cv("Amelanistic", vec3(0.8f, 0.5f, 0.3f), vec3(0.8f, 0.2f, 0.1f), WHITE, SCALES, 0.8f),
                   cv("Anerythristic", vec3(0.45f, 0.45f, 0.45f), vec3(0.1f, 0.1f, 0.1f), WHITE, SCALES, 0.8f),
                   cv("Snow", vec3(0.85f, 0.8f, 0.78f), vec3(0.8f, 0.6f, 0.6f), WHITE, SCALES, 0.8f),
                   cv("Butter", vec3(0.8f, 0.7f, 0.4f), vec3(0.8f, 0.55f, 0.2f), WHITE, SCALES, 0.8f),
                   cv("Lavender", vec3(0.55f, 0.45f, 0.5f), vec3(0.4f, 0.28f, 0.35f), WHITE, SCALES, 0.8f),
                   cv("Bloodred", vec3(0.5f, 0.07f, 0.03f), vec3(0.4f, 0.05f, 0.03f), vec3(0.5f, 0.3f, 0.25f), SCALES, 0.2f),
                   cv("Charcoal", vec3(0.2f, 0.2f, 0.22f), vec3(0.1f, 0.1f, 0.12f), WHITE, SCALES, 0.8f)};
    }
}

void largeAnimals(Cat& c) {
    const char* DOG = "Canis lupus familiaris";
    {
        AnimalShape a = dog(0.8f, 0.8f, 70);
        a.legRatio = 0.58f; a.headLen = 0.4f; a.headWidth = 0.5f; a.snoutLen = 0.5f; a.snoutWidth = 0.7f; a.stop = 0.55f;
        a.ear = Ear::Folded; a.earSize = 0.3f; a.tail = Tail::LongThin; a.tailLen = 0.6f; a.tailCarry = -20; a.fur = 0.005f; a.extras |= X_JOWLS;
        a.tuck = 0.4f; a.neckLen = 0.45f; a.neckAngle = 45; a.gaitSpeed = 0.8f;
        auto& s = c.add("Great Dane", DOG, AC::Large, "Dog", a, 9, "Dog food", 0.15f, 500, 5,
                        "One of the tallest dog breeds - some stand over 2 m on their hind legs.");
        s.coats = pick(dogLib(), {"Fawn", "Brindle", "Blue", "Black", "Harlequin", "Black Tuxedo", "Blue Merle", "Black Mask Fawn"});
    }
    {
        AnimalShape a = dog(0.78f, 0.85f, 90);
        a.headLen = 0.4f; a.headWidth = 0.8f; a.snoutLen = 0.3f; a.snoutWidth = 0.95f; a.stop = 0.85f; a.ear = Ear::Floppy; a.earSize = 0.3f;
        a.girth = 0.28f; a.tuck = 0.2f; a.legThick = 0.4f; a.extras |= X_JOWLS | X_WRINKLES; a.fur = 0.006f; a.tailCarry = -25;
        a.gaitSpeed = 0.7f;
        auto& s = c.add("English Mastiff", DOG, AC::Large, "Dog", a, 9, "Dog food", 0.15f, 700, 6,
                        "One of the heaviest dog breeds; a mastiff named Zorba weighed 155 kg.");
        s.coats = pick(dogLib(), {"Black Mask Fawn", "Apricot", "Brindle", "Fawn"});
    }
    {
        AnimalShape a = dog(0.75f, 0.85f, 80);
        a.headLen = 0.42f; a.headWidth = 0.75f; a.snoutLen = 0.33f; a.snoutWidth = 0.85f; a.stop = 0.8f; a.earSize = 0.35f;
        a.girth = 0.27f; a.tuck = 0.15f; a.legThick = 0.38f; a.fur = 0.05f; a.fluff = 0.5f; a.extras |= X_JOWLS | X_RUFF; a.tail = Tail::Bushy;
        a.tailCarry = -25; a.gaitSpeed = 0.7f;
        auto& s = c.add("Saint Bernard", DOG, AC::Large, "Dog", a, 9, "Dog food", 0.1f, 600, 6,
                        "Bred by monks in the Swiss Alps to find travelers lost in the snow.");
        s.coats = {cv("Red & White", RED, RED, WHITE, PIEBALD, 0.5f, 1, {0.8f, 1.0f, 1.0f, 1.0f}),
                   cv("Brindle & White", FAWN, K, WHITE, BRINDLE, 0.5f, 0.7f, {0.8f, 1.0f, 1.0f, 1.0f}),
                   cv("Mahogany & White", DEEPRED, DEEPRED, WHITE, PIEBALD, 0.45f, 1, {0.8f, 1.0f, 1.0f, 1.0f}),
                   cv("Orange & White", ORANGE * 0.9f, ORANGE, WHITE, PIEBALD, 0.5f, 1, {0.8f, 1.0f, 1.0f, 1.0f})};
    }
    {
        AnimalShape a = dog(0.71f, 0.8f, 68);
        a.headWidth = 0.7f; a.snoutLen = 0.36f; a.snoutWidth = 0.8f; a.stop = 0.6f; a.fur = 0.07f; a.fluff = 0.8f; a.tail = Tail::Bushy;
        a.tailCarry = -25; a.girth = 0.27f; a.legThick = 0.38f; a.earSize = 0.3f; a.gaitSpeed = 0.7f;
        auto& s = c.add("Newfoundland", DOG, AC::Large, "Dog", a, 10, "Dog food", 0.05f, 600, 6,
                        "A born lifeguard: webbed feet, a water-resistant coat and a strong rescue instinct.");
        s.coats = pick(dogLib(), {"Black", "Chocolate", "Gray", "Black & White"});
    }
    {
        AnimalShape a = dog(0.68f, 0.72f, 50);
        a.fur = 0.06f; a.fluff = 0.6f; a.tail = Tail::Bushy; a.tailCarry = -20; a.headWidth = 0.65f; a.snoutLen = 0.4f; a.snoutWidth = 0.65f;
        a.earSize = 0.3f; a.girth = 0.25f; a.legThick = 0.34f;
        auto& s = c.add("Bernese Mountain Dog", DOG, AC::Large, "Dog", a, 8, "Dog food", 0.1f, 700, 5,
                        "A Swiss farm dog that pulled carts of milk and cheese to market.");
        s.coats = {cv("Tricolor", K, RED * 1.1f, WHITE, TAN_POINTS, 0.5f, 1, {0.8f, 1.0f, 1.0f, 1.0f})};
    }
    {
        AnimalShape a = dog(0.64f, 0.7f, 55);
        a.headLen = 0.42f; a.headWidth = 0.72f; a.snoutLen = 0.38f; a.snoutWidth = 0.75f; a.stop = 0.65f; a.ear = Ear::Folded; a.earSize = 0.3f;
        a.girth = 0.27f; a.tuck = 0.2f; a.legThick = 0.38f; a.tail = Tail::Stub; a.tailLen = 0.1f; a.fur = 0.012f;
        auto& s = c.add("Rottweiler", DOG, AC::Large, "Dog", a, 10, "Dog food", 0.5f, 500, 5,
                        "Descended from Roman drover dogs; butchers in Rottweil, Germany used them to guard money.");
        s.coats = pick(dogLib(), {"Black & Tan", "Red & Tan"});
    }
    {
        AnimalShape a = dog(0.7f, 0.68f, 40);
        a.ear = Ear::Erect; a.earSize = 0.5f; a.snoutLen = 0.52f; a.snoutWidth = 0.45f; a.stop = 0.3f; a.tail = Tail::Stub; a.tailLen = 0.08f;
        a.tailCarry = 50; a.tuck = 0.6f; a.legRatio = 0.56f; a.fur = 0.005f; a.neckLen = 0.45f; a.neckAngle = 50;
        auto& s = c.add("Doberman Pinscher", DOG, AC::Large, "Dog", a, 11, "Dog food", 0.45f, 500, 4.5f,
                        "Created by a German tax collector named Louis Dobermann for protection on his rounds.");
        s.coats = pick(dogLib(), {"Black & Tan", "Red & Tan", "Blue & Tan", "Isabella & Tan"});
    }
    {
        AnimalShape a = dog(0.86f, 0.9f, 65);
        a.legRatio = 0.58f; a.girth = 0.19f; a.tuck = 0.6f; a.fur = 0.04f; a.fluff = 0.3f; a.headLen = 0.35f; a.headWidth = 0.45f;
        a.snoutLen = 0.52f; a.snoutWidth = 0.45f; a.stop = 0.15f; a.ear = Ear::Rose; a.earSize = 0.22f; a.tail = Tail::LongThin;
        a.tailLen = 0.7f; a.tailCarry = -30; a.extras |= X_BEARD; a.gaitSpeed = 0.8f;
        auto& s = c.add("Irish Wolfhound", DOG, AC::Large, "Dog", a, 8, "Dog food", 0.1f, 800, 6,
                        "The tallest recognized dog breed, once used to hunt wolves in Ireland.");
        s.coats = pick(dogLib(), {"Gray", "Brindle", "Wolf Gray", "Red", "Black", "Fawn", "White", "Salt & Pepper"});
    }
    {
        AnimalShape a = dog(0.76f, 0.8f, 55);
        a.fur = 0.08f; a.fluff = 0.9f; a.extras |= X_RUFF; a.tail = Tail::Bushy; a.tailCarry = -20; a.headWidth = 0.6f; a.snoutLen = 0.45f;
        a.stop = 0.3f; a.earSize = 0.25f; a.girth = 0.24f;
        auto& s = c.add("Great Pyrenees", DOG, AC::Large, "Dog", a, 11, "Dog food", 0.25f, 400, 5,
                        "A livestock guardian with double dewclaws on its hind legs; guards flocks through the night.");
        s.coats = {cv("White", WHITE, WHITE, WHITE, SOLID), cv("White with Badger", WHITE, vec3(0.5f, 0.45f, 0.38f), WHITE, COLORPOINT, 0.3f),
                   cv("White with Tan", WHITE, vec3(0.6f, 0.45f, 0.28f), WHITE, COLORPOINT, 0.3f),
                   cv("White with Gray", WHITE, GRAY * 1.5f, WHITE, COLORPOINT, 0.3f)};
    }
    {
        AnimalShape a = horse(1.52f, 1.6f, 500);
        a.girth = 0.21f; a.legThick = 0.26f;
        auto& s = c.add("American Quarter Horse", "Equus ferus caballus", AC::Large, "Horse", a, 30, "Hay, grain", 0.25f, 3000, 12,
                        "Named for outrunning other breeds over a quarter mile - clocked at 88 km/h.");
        s.coats = pick(horseLib(), {"Sorrel", "Bay", "Dark Bay", "Chestnut", "Black", "Gray", "Palomino", "Buckskin", "Dun", "Grulla",
                                    "Blue Roan", "Red Roan", "Cremello", "Perlino", "Liver Chestnut", "Bay Tobiano", "Leopard Appaloosa"});
    }
    {
        AnimalShape a = horse(1.63f, 1.65f, 500);
        a.girth = 0.17f; a.tuck = 0.3f; a.legRatio = 0.6f; a.neckLen = 0.68f; a.headWidth = 0.34f; a.legThick = 0.22f;
        auto& s = c.add("Thoroughbred", "Equus ferus caballus", AC::Large, "Horse", a, 28, "Hay, grain", 0.45f, 2500, 12,
                        "Every Thoroughbred descends from just three foundation stallions imported to England.");
        s.coats = pick(horseLib(), {"Bay", "Dark Bay", "Chestnut", "Black", "Gray", "Dapple Gray", "Flea-bitten Gray", "Liver Chestnut", "Red Roan"});
    }
    {
        AnimalShape a = horse(1.8f, 1.9f, 900);
        a.girth = 0.23f; a.legThick = 0.33f; a.neckThick = 0.75f; a.headLen = 0.38f; a.snoutWidth = 0.75f; a.tuck = 0.05f; a.gaitSpeed = 0.75f;
        a.fur = 0.012f;
        auto& s = c.add("Clydesdale", "Equus ferus caballus", AC::Large, "Horse", a, 25, "Hay, grain", 0.1f, 4000, 18,
                        "A Scottish draft horse known for 'feathering' - long silky hair over its hooves.");
        s.coats = pick(horseLib(), {"Bay", "Black", "Chestnut", "Red Roan", "Blue Roan", "Dark Bay"});
        for (auto& v : s.coats) v.marks = vec4(1.0f, 1.0f, 0.0f, 0.0f);
    }
    {
        AnimalShape a = horse(1.0f, 1.05f, 180);
        a.legRatio = 0.5f; a.girth = 0.24f; a.tuck = 0.05f; a.neckLen = 0.5f; a.headLen = 0.42f; a.headWidth = 0.42f; a.fur = 0.03f;
        a.fluff = 0.3f; a.legThick = 0.3f; a.gaitSpeed = 1.3f;
        auto& s = c.add("Shetland Pony", "Equus ferus caballus", AC::Large, "Horse", a, 30, "Hay (prone to overeating)", 0.4f, 1200, 8,
                        "Pound for pound one of the strongest horse breeds - can pull twice its own weight.");
        s.coats = pick(horseLib(), {"Black", "Bay", "Chestnut", "Gray", "Palomino", "Black Tobiano", "Bay Tobiano", "Dun", "Silver Dapple",
                                    "Cremello", "Blue Roan", "Sorrel Overo"});
    }
    {
        AnimalShape a = horse(1.2f, 1.25f, 250);
        a.legRatio = 0.55f; a.girth = 0.2f; a.neckLen = 0.5f; a.neckAngle = 35; a.headLen = 0.45f; a.headWidth = 0.4f; a.ear = Ear::Long;
        a.earSize = 0.6f; a.tail = Tail::Tufted; a.tailThick = 0.12f; a.extras = X_MANE; a.fur = 0.012f; a.gaitSpeed = 0.9f;
        auto& s = c.add("Donkey", "Equus asinus", AC::Large, "Horse", a, 35, "Straw, hay (low sugar)", 0.3f, 600, 5,
                        "Donkeys form lifelong bonds and grieve when a companion dies; their bray carries 3 km.");
        s.coats = pick(horseLib(), {"Gray Dun Donkey", "Brown Donkey", "Black Donkey", "Spotted Donkey", "Ivory Donkey"});
        s.coats.push_back(cv("Rose Gray", vec3(0.45f, 0.35f, 0.3f), WHITE, WHITE, COUNTERSHADE, 0.8f));
    }
    {
        AnimalShape a = caprine(1.15f, 1.2f, 160);
        a.horns = Horns::None; a.extras = 0; a.neckLen = 0.75f; a.neckAngle = 80; a.neckThick = 0.5f; a.headLen = 0.27f; a.headWidth = 0.45f;
        a.snoutLen = 0.45f; a.ear = Ear::Long; a.earSize = 0.55f; a.fur = 0.08f; a.fluff = 0.9f; a.legRatio = 0.6f; a.tail = Tail::Stub;
        a.tailLen = 0.15f; a.tailCarry = 20; a.foot = Foot::Cloven; a.nose = Nose::Cow; a.noseColor = {0.1f, 0.08f, 0.08f};
        auto& s = c.add("Llama", "Lama glama", AC::Large, "Camelid", a, 20, "Grass, hay", 0.35f, 1500, 6,
                        "Llamas spit mostly at each other; guard llamas protect sheep from coyotes.");
        s.coats = {cv("White", WHITE, WHITE, WHITE, SOLID), cv("Brown", BROWN, BROWN, WHITE, SOLID), cv("Black", K, K, WHITE, SOLID),
                   cv("Fawn", FAWN, FAWN, WHITE, SOLID), cv("Brown & White", BROWN, BROWN, WHITE, HOLSTEIN, 0.5f),
                   cv("Black & White", K, K, WHITE, HOLSTEIN, 0.5f), cv("Gray", GRAY, GRAY, WHITE, SOLID),
                   cv("Appaloosa", WHITE, BROWN, WHITE, SPOTS, 0.4f)};
    }
    {
        AnimalShape a = caprine(0.9f, 0.9f, 65);
        a.horns = Horns::None; a.extras = 0; a.neckLen = 0.7f; a.neckAngle = 78; a.neckThick = 0.6f; a.headLen = 0.25f; a.headWidth = 0.55f;
        a.snoutLen = 0.35f; a.ear = Ear::Pointed; a.earSize = 0.35f; a.fur = 0.1f; a.fluff = 1.0f; a.legRatio = 0.52f; a.tail = Tail::Stub;
        a.tailLen = 0.12f; a.tailCarry = 10; a.foot = Foot::Cloven; a.noseColor = {0.1f, 0.08f, 0.08f};
        auto& s = c.add("Alpaca", "Vicugna pacos", AC::Large, "Camelid", a, 20, "Grass, hay", 0.15f, 2000, 5,
                        "Alpaca fleece has no lanolin and comes in 22 natural colors; they hum to communicate.");
        s.coats = {cv("White", WHITE, WHITE, WHITE, SOLID), cv("Beige", CREAM, CREAM, WHITE, SOLID), cv("Light Fawn", BUFF, BUFF, WHITE, SOLID),
                   cv("Medium Fawn", FAWN * 1.1f, FAWN, WHITE, SOLID), cv("Dark Fawn", TAN, TAN, WHITE, SOLID),
                   cv("Light Brown", BROWN * 1.5f, BROWN, WHITE, SOLID), cv("Dark Brown", DKBROWN, DKBROWN, WHITE, SOLID),
                   cv("Bay Black", K, BROWN, WHITE, TAN_POINTS), cv("True Black", K, K, WHITE, SOLID),
                   cv("Silver Gray", SILVER, SILVER, WHITE, SOLID), cv("Rose Gray", vec3(0.45f, 0.35f, 0.32f), vec3(0.45f, 0.35f, 0.32f), WHITE, SOLID),
                   cv("Appaloosa", WHITE, BROWN, WHITE, SPOTS, 0.4f), cv("Pinto", FAWN, FAWN, WHITE, HOLSTEIN, 0.5f)};
    }
    {
        AnimalShape a = bovid(1.45f, 1.7f, 680);
        a.hornSize = 0.2f;
        auto& s = c.add("Dairy Cow", "Bos taurus", AC::Large, "Cattle", a, 20, "Grass, hay, silage", 0.2f, 1500, 10,
                        "Cows have best friends and get stressed when separated from them.");
        s.coats = pick(farmLib(), {"Holstein", "Red Holstein", "Jersey", "Brown Swiss", "Black Angus", "Red Angus", "Hereford", "Charolais",
                                   "Belted Galloway", "Longhorn Spotted"});
    }
    {
        AnimalShape a = bovid(1.1f, 1.5f, 600);
        a.legRatio = 0.42f; a.fur = 0.14f; a.fluff = 1.0f; a.horns = Horns::Swept; a.hornSize = 0.9f; a.extras = X_LONG_COAT;
        auto& s = c.add("Highland Cow", "Bos taurus", AC::Large, "Cattle", a, 22, "Grass, hay", 0.15f, 2500, 8,
                        "A Scottish breed whose long fringe ('dossan') shields its eyes from insects and rain.");
        s.coats = pick(farmLib(), {"Highland Red", "Highland Yellow", "Highland Black", "Highland Dun", "Highland Brindle", "Highland White"});
    }
    {
        AnimalShape a = pig(0.9f, 1.3f, 270);
        a.ear = Ear::Erect; a.earSize = 0.3f; a.legRatio = 0.35f; a.headLen = 0.5f;
        auto& s = c.add("Yorkshire Pig", "Sus domesticus", AC::Large, "Pig", a, 15, "Pig feed", 0.3f, 400, 6,
                        "Pigs can't sweat - they wallow in mud to cool off and protect against sunburn.");
        s.coats = pick(farmLib(), {"Pig Pink", "Pig Hampshire", "Pig Berkshire", "Pig Duroc", "Pig Spotted", "Pig Tamworth", "Pig Black"});
    }
    {
        AnimalShape a = caprine(0.75f, 0.85f, 110);
        a.ear = Ear::Lop; a.earSize = 0.55f; a.horns = Horns::Swept; a.hornSize = 0.5f; a.hornsMaleOnly = false; a.girth = 0.24f; a.stop = 0.05f;
        auto& s = c.add("Boer Goat", "Capra hircus", AC::Large, "Goat", a, 12, "Browse, hay, grain", 0.3f, 400, 4,
                        "Developed by Dutch farmers in South Africa; 'boer' means farmer.");
        s.coats = pick(farmLib(), {"Goat Boer", "Goat Red Boer", "Goat Paint Boer", "Goat Black"});
        s.coats[0].b = DEEPRED; s.coats[0].pattern = COLORPOINT;
    }
}

void feralAnimals(Cat& c) {
    {
        AnimalShape a = deer(1.0f, 1.4f, 90);
        auto& s = c.add("White-tailed Deer", "Odocoileus virginianus", AC::Feral, "Deer", a, 10, "Browse, acorns, grass", 0.3f, 0, 5,
                        "Raises its white tail like a flag to warn others when it flees.");
        s.coats = {cv("Summer Red", vec3(0.4f, 0.17f, 0.06f), WHITE, WHITE, COUNTERSHADE, 1.0f),
                   cv("Winter Gray-brown", vec3(0.22f, 0.17f, 0.12f), WHITE, WHITE, COUNTERSHADE, 1.0f),
                   cv("Piebald", vec3(0.3f, 0.17f, 0.08f), vec3(0.3f, 0.17f, 0.08f), WHITE, PIEBALD, 0.6f),
                   cv("Melanistic", vec3(0.05f, 0.04f, 0.035f), vec3(0.1f, 0.08f, 0.06f), WHITE, COUNTERSHADE, 0.3f),
                   cv("Albino", WHITE, WHITE, WHITE, SOLID)};
    }
    {
        AnimalShape a = pig(0.9f, 1.3f, 110);
        a.legRatio = 0.45f; a.rumpRatio = 0.85f; a.extras = X_TUSKS | X_MANE; a.fur = 0.04f; a.ear = Ear::Erect; a.earSize = 0.25f;
        a.tail = Tail::Tufted; a.tailLen = 0.18f; a.tailCarry = -20; a.headLen = 0.55f; a.girth = 0.22f; a.gaitSpeed = 1.2f;
        auto& s = c.add("Wild Boar", "Sus scrofa", AC::Feral, "Pig", a, 12, "Omnivore - roots, nuts, carrion", 0.75f, 0, 6,
                        "Piglets are born with pale stripes that fade by six months old.");
        s.coats = {cv("Grizzled Brown", vec3(0.12f, 0.08f, 0.05f), K, GRAY, AGOUTI, 0.3f),
                   cv("Black", vec3(0.04f, 0.035f, 0.03f), K, GRAY, AGOUTI, 0.3f),
                   cv("Red-brown", vec3(0.2f, 0.09f, 0.04f), K, GRAY, AGOUTI, 0.3f),
                   cv("Spotted feral", vec3(0.1f, 0.07f, 0.05f), K, vec3(0.6f, 0.45f, 0.4f), PIEBALD, 0.3f)};
    }
    {
        AnimalShape a = mustelid(0.3f, 0.55f, 8);
        a.legRatio = 0.4f; a.girth = 0.22f; a.rumpRatio = 1.2f; a.neckLen = 0.3f; a.headLen = 0.45f; a.headWidth = 0.9f; a.snoutLen = 0.38f;
        a.snoutWidth = 0.4f; a.stop = 0.5f; a.ear = Ear::Round; a.earSize = 0.3f; a.tail = Tail::Bushy; a.tailLen = 0.5f; a.tailThick = 0.35f;
        a.foot = Foot::Hand; a.fur = 0.04f; a.fluff = 0.5f; a.gait = Gait::Walk; a.gaitSpeed = 1.0f; a.noseColor = K;
        auto& s = c.add("Raccoon", "Procyon lotor", AC::Feral, "Raccoon", a, 3, "Omnivore", 0.55f, 0, 2,
                        "Its front paws have about four times more sensory cells than its hind paws.");
        s.coats = {cv("Gray", vec3(0.3f, 0.29f, 0.27f), K, WHITE, MASK_RINGS),
                   cv("Brown", vec3(0.3f, 0.23f, 0.16f), K, WHITE, MASK_RINGS),
                   cv("Blonde", vec3(0.55f, 0.46f, 0.32f), vec3(0.2f, 0.15f, 0.1f), WHITE, MASK_RINGS),
                   cv("Melanistic", vec3(0.08f, 0.07f, 0.07f), K, GRAY, MASK_RINGS),
                   cv("Albino", WHITE, vec3(0.7f, 0.68f, 0.62f), WHITE, MASK_RINGS)};
    }
    {
        AnimalShape a = rodent(0.22f, 0.45f, 3);
        a.legRatio = 0.3f; a.headLen = 0.6f; a.headWidth = 0.55f; a.snoutLen = 0.55f; a.snoutWidth = 0.4f; a.ear = Ear::Round; a.earSize = 0.3f;
        a.tail = Tail::Thin; a.tailLen = 0.8f; a.tailThick = 0.15f; a.foot = Foot::Hand; a.nose = Nose::Dog; a.noseColor = PINK; a.fur = 0.03f;
        auto& s = c.add("Virginia Opossum", "Didelphis virginiana", AC::Feral, "Marsupial", a, 3, "Omnivore - eats thousands of ticks", 0.3f, 0, 2,
                        "North America's only marsupial; 'plays possum' by fainting when terrified.");
        s.coats = {cv("Gray", vec3(0.45f, 0.44f, 0.42f), WHITE, WHITE, COLORPOINT, 0.3f),
                   cv("Dark", vec3(0.15f, 0.14f, 0.13f), WHITE, WHITE, COLORPOINT, 0.3f),
                   cv("Cinnamon", vec3(0.45f, 0.3f, 0.18f), WHITE, WHITE, COLORPOINT, 0.3f)};
        for (auto& v : s.coats) { v.b = WHITE; v.pattern = COUNTERSHADE; }
    }
    {
        AnimalShape a = wildCanid(0.4f, 0.6f, 6);
        a.legRatio = 0.55f; a.snoutWidth = 0.38f; a.headWidth = 0.55f; a.earSize = 0.5f; a.tailLen = 0.7f; a.tailThick = 0.35f; a.pupil = Pupil::Slit;
        auto& s = c.add("Red Fox", "Vulpes vulpes", AC::Feral, "Canid", a, 4, "Rodents, rabbits, fruit", 0.5f, 0, 2,
                        "Uses Earth's magnetic field to aim its high pounce on mice under snow.");
        s.coats = {cv("Red", vec3(0.55f, 0.18f, 0.04f), WHITE, WHITE, COUNTERSHADE, 1.0f, 1, {1, 0, 1, 1}),
                   cv("Cross", vec3(0.4f, 0.14f, 0.04f), vec3(0.05f, 0.04f, 0.03f), WHITE, SADDLE, 0.5f, 1, {0, 0, 0, 1}),
                   cv("Silver", vec3(0.06f, 0.06f, 0.06f), SILVER, WHITE, AGOUTI, 0.5f, 1, {0, 0, 0, 1}),
                   cv("Pale Red", vec3(0.62f, 0.35f, 0.14f), WHITE, WHITE, COUNTERSHADE, 1.0f, 1, {0, 0, 1, 1})};
        for (auto& v : s.coats) if (v.name == "Red" || v.name == "Pale Red") v.marks.x = 0.0f;
    }
    {
        AnimalShape a = wildCanid(0.38f, 0.58f, 5);
        a.foot = Foot::Claw; a.tailLen = 0.65f;
        auto& s = c.add("Gray Fox", "Urocyon cinereoargenteus", AC::Feral, "Canid", a, 6, "Omnivore", 0.45f, 0, 2,
                        "One of the only canids that can climb trees, using hooked claws.");
        s.coats = {cv("Grizzled Gray", vec3(0.35f, 0.34f, 0.33f), vec3(0.45f, 0.22f, 0.08f), WHITE, COUNTERSHADE, 0.8f),
                   cv("Dark Gray", vec3(0.2f, 0.2f, 0.2f), vec3(0.4f, 0.2f, 0.07f), WHITE, COUNTERSHADE, 0.8f)};
    }
    {
        AnimalShape a = wildCanid(0.6f, 0.8f, 14);
        auto& s = c.add("Coyote", "Canis latrans", AC::Feral, "Canid", a, 10, "Omnivore", 0.6f, 0, 3,
                        "Has expanded into nearly every North American city; hunts in pairs.");
        s.coats = {cv("Tawny Gray", vec3(0.35f, 0.26f, 0.17f), vec3(0.65f, 0.55f, 0.42f), WHITE, COUNTERSHADE, 0.6f),
                   cv("Reddish", vec3(0.45f, 0.25f, 0.12f), vec3(0.65f, 0.55f, 0.42f), WHITE, COUNTERSHADE, 0.6f),
                   cv("Dark", vec3(0.15f, 0.12f, 0.1f), vec3(0.45f, 0.4f, 0.35f), WHITE, COUNTERSHADE, 0.6f),
                   cv("Pale Desert", vec3(0.55f, 0.45f, 0.32f), CREAM, WHITE, COUNTERSHADE, 0.6f)};
    }
    {
        AnimalShape a = mustelid(0.2f, 0.4f, 3);
        a.legRatio = 0.3f; a.rumpRatio = 1.4f; a.girth = 0.3f; a.neckLen = 0.25f; a.headLen = 0.5f; a.headWidth = 0.7f; a.snoutLen = 0.4f;
        a.tail = Tail::Bushy; a.tailLen = 0.7f; a.tailThick = 0.5f; a.tailCarry = 60; a.fur = 0.05f; a.fluff = 0.7f; a.gait = Gait::Waddle;
        a.gaitSpeed = 0.8f;
        auto& s = c.add("Striped Skunk", "Mephitis mephitis", AC::Feral, "Skunk", a, 3, "Insects, grubs, small animals", 0.4f, 0, 2,
                        "Stamps its feet and does a handstand as a warning before it sprays.");
        s.coats = {cv("Twin Stripe", WHITE, K, WHITE, SKUNK), cv("Broad Stripe", WHITE, K, WHITE, SKUNK, 0.8f),
                   cv("Brown Phase", vec3(0.8f, 0.75f, 0.65f), vec3(0.12f, 0.07f, 0.04f), WHITE, SKUNK)};
    }
    {
        AnimalShape a = rodent(0.12f, 0.24f, 0.55f);
        a.legRatio = 0.3f; a.rumpRatio = 1.3f; a.tail = Tail::Bushy; a.tailLen = 0.95f; a.tailThick = 0.4f; a.tailCarry = 75; a.ear = Ear::Round;
        a.earSize = 0.35f; a.fur = 0.03f; a.fluff = 0.4f; a.foot = Foot::Hand; a.gait = Gait::Bound; a.gaitSpeed = 1.8f;
        auto& s = c.add("Eastern Gray Squirrel", "Sciurus carolinensis", AC::Feral, "Rodent", a, 6, "Nuts, seeds", 0.3f, 0, 1,
                        "Buries thousands of nuts a year and fakes burying some to fool thieves.");
        s.coats = {cv("Gray", vec3(0.36f, 0.35f, 0.33f), vec3(0.45f, 0.3f, 0.15f), WHITE, COUNTERSHADE, 0.9f),
                   cv("Black", vec3(0.03f, 0.03f, 0.03f), K, K, SOLID),
                   cv("Brown", vec3(0.35f, 0.24f, 0.14f), vec3(0.45f, 0.3f, 0.15f), WHITE, COUNTERSHADE, 0.9f),
                   cv("White", WHITE, WHITE, WHITE, SOLID)};
    }
    {
        AnimalShape a = rodent(0.2f, 0.5f, 5);
        a.legRatio = 0.28f; a.tail = Tail::Bushy; a.tailLen = 0.35f; a.tailThick = 0.3f; a.ear = Ear::Small; a.earSize = 0.2f; a.fur = 0.03f;
        a.foot = Foot::Claw; a.gaitSpeed = 0.9f;
        auto& s = c.add("Groundhog", "Marmota monax", AC::Feral, "Rodent", a, 5, "Grasses, clover, garden plants", 0.35f, 0, 2,
                        "A true hibernator - its heart slows from 80 to about 5 beats a minute.");
        s.coats = {cv("Grizzled Brown", vec3(0.3f, 0.2f, 0.12f), K, BUFF, AGOUTI, 0.5f),
                   cv("Reddish", vec3(0.4f, 0.22f, 0.1f), DKBROWN, BUFF, AGOUTI, 0.5f),
                   cv("Melanistic", vec3(0.04f, 0.035f, 0.03f), K, K, SOLID)};
    }
    {
        AnimalShape a = rodent(0.3f, 0.8f, 20);
        a.legRatio = 0.22f; a.girth = 0.3f; a.tail = Tail::Flat; a.tailLen = 0.4f; a.tailThick = 0.5f; a.tailCarry = -15; a.ear = Ear::Small;
        a.earSize = 0.15f; a.fur = 0.03f; a.foot = Foot::Webbed; a.gaitSpeed = 0.7f; a.headWidth = 0.8f;
        auto& s = c.add("North American Beaver", "Castor canadensis", AC::Feral, "Rodent", a, 12, "Bark, twigs, aquatic plants", 0.4f, 0, 3,
                        "Its orange teeth get their color and strength from iron in the enamel.");
        s.coats = {cv("Brown", vec3(0.2f, 0.11f, 0.05f), vec3(0.12f, 0.07f, 0.04f), vec3(0.3f, 0.2f, 0.12f), SOLID),
                   cv("Dark", vec3(0.08f, 0.05f, 0.03f), K, BROWN, SOLID),
                   cv("Blonde", vec3(0.45f, 0.3f, 0.15f), BROWN, BUFF, SOLID)};
    }
    {
        AnimalShape a = mustelid(0.3f, 0.75f, 10);
        a.tail = Tail::Thick; a.tailLen = 0.55f; a.tailThick = 0.55f; a.foot = Foot::Webbed; a.headWidth = 0.75f; a.fur = 0.012f;
        a.extras = X_WHISKERS;
        auto& s = c.add("North American River Otter", "Lontra canadensis", AC::Feral, "Mustelid", a, 12, "Fish, crayfish", 0.5f, 0, 3,
                        "Can hold its breath for 8 minutes and closes its ears and nostrils underwater.");
        s.coats = {cv("Brown", vec3(0.12f, 0.07f, 0.04f), vec3(0.4f, 0.32f, 0.24f), CREAM, COUNTERSHADE, 0.4f),
                   cv("Dark", vec3(0.05f, 0.035f, 0.025f), vec3(0.3f, 0.24f, 0.18f), CREAM, COUNTERSHADE, 0.4f)};
    }
    {
        AnimalShape a = rodent(0.3f, 0.65f, 9);
        a.legRatio = 0.25f; a.rumpRatio = 1.25f; a.girth = 0.32f; a.extras = X_QUILLS; a.fur = 0.08f; a.fluff = 0.8f; a.tail = Tail::Thick;
        a.tailLen = 0.35f; a.tailThick = 0.5f; a.ear = Ear::Small; a.earSize = 0.12f; a.foot = Foot::Claw; a.gait = Gait::Waddle;
        a.gaitSpeed = 0.6f;
        auto& s = c.add("North American Porcupine", "Erethizon dorsatum", AC::Feral, "Rodent", a, 18, "Bark, leaves, buds", 0.5f, 0, 2,
                        "Carries about 30,000 barbed quills that detach on contact - but it can't shoot them.");
        s.coats = {cv("Black & White Quills", vec3(0.05f, 0.04f, 0.035f), vec3(0.7f, 0.65f, 0.55f), K, AGOUTI, 0.5f),
                   cv("Brown", vec3(0.15f, 0.1f, 0.06f), vec3(0.65f, 0.55f, 0.4f), K, AGOUTI, 0.5f),
                   cv("Yellow-tipped", vec3(0.1f, 0.08f, 0.05f), vec3(0.7f, 0.55f, 0.25f), K, AGOUTI, 0.5f)};
    }
    {
        AnimalShape a = rodent(0.18f, 0.42f, 5);
        a.legRatio = 0.3f; a.girth = 0.3f; a.extras = X_BANDS; a.fur = 0.0f; a.headLen = 0.65f; a.snoutLen = 0.6f; a.snoutWidth = 0.35f;
        a.ear = Ear::Erect; a.earSize = 0.35f; a.tail = Tail::Thin; a.tailLen = 0.8f; a.tailThick = 0.3f; a.foot = Foot::Claw; a.nose = Nose::Pig;
        a.noseColor = {0.5f, 0.35f, 0.3f};
        auto& s = c.add("Nine-banded Armadillo", "Dasypus novemcinctus", AC::Feral, "Armadillo", a, 12, "Insects, grubs", 0.2f, 0, 2,
                        "Always gives birth to four identical quadruplets from a single egg.");
        s.coats = {cv("Armor", vec3(0.45f, 0.38f, 0.32f), vec3(0.3f, 0.25f, 0.22f), vec3(0.6f, 0.5f, 0.45f), SCALES, 0.8f)};
    }
    {
        AnimalShape a = cat(0.5f, 0.75f, 11);
        a.ear = Ear::Tufted; a.earSize = 0.3f; a.extras |= X_EAR_TUFTS | X_RUFF; a.tail = Tail::Stub; a.tailLen = 0.18f; a.tailCarry = 20;
        a.legRatio = 0.55f; a.rumpRatio = 1.08f; a.fur = 0.03f; a.eyeColor = {0.5f, 0.4f, 0.1f}; a.pupil = Pupil::Round; a.eyeSize = 0.15f;
        auto& s = c.add("Bobcat", "Lynx rufus", AC::Feral, "Wild cat", a, 10, "Rabbits, rodents, birds", 0.65f, 0, 3,
                        "Named for its short 'bobbed' tail; about twice the size of a house cat.");
        s.coats = {cv("Spotted Tawny", vec3(0.45f, 0.3f, 0.17f), vec3(0.08f, 0.05f, 0.03f), WHITE, SPOTS, 0.1f),
                   cv("Gray", vec3(0.4f, 0.37f, 0.33f), vec3(0.08f, 0.06f, 0.05f), WHITE, SPOTS, 0.1f),
                   cv("Reddish", vec3(0.5f, 0.28f, 0.12f), vec3(0.1f, 0.05f, 0.03f), WHITE, SPOTS, 0.1f),
                   cv("Melanistic", vec3(0.04f, 0.035f, 0.03f), K, GRAY, SOLID)};
    }
    {
        AnimalShape a = cat(0.25f, 0.36f, 4);
        a.girth = 0.17f; a.tuck = 0.45f; a.eyeColor = {0.5f, 0.45f, 0.1f};
        auto& s = c.add("Feral Cat", "Felis catus", AC::Feral, "Cat", a, 5, "Rodents, birds, scraps", 0.7f, 50, 1.5f,
                        "Unsocialized cats born outdoors; trap-neuter-return programs manage colonies.");
        s.coats = pick(catLib(), {"Black", "Brown Mackerel Tabby", "Orange Tabby", "Tortoiseshell", "Calico", "Tuxedo", "Gray & White",
                                  "Brown Classic Tabby", "Blue", "White", "Tabby & White"});
    }
    {
        AnimalShape a = dog(0.55f, 0.6f, 20);
        a.ear = Ear::Erect; a.earSize = 0.45f; a.tuck = 0.55f; a.girth = 0.18f; a.tailCarry = 20; a.snoutWidth = 0.5f; a.stop = 0.35f;
        auto& s = c.add("Feral Dog", "Canis lupus familiaris", AC::Feral, "Dog", a, 6, "Scavenger - scraps, small animals", 0.7f, 50, 2.5f,
                        "Free-roaming dogs that never lived with people; they form packs and fear humans.");
        s.coats = pick(dogLib(), {"Fawn", "Black", "Brindle", "Red", "Black & Tan", "Tan & White", "Black & White", "Sable", "Cream"});
    }
    {
        AnimalShape a = deer(1.5f, 2.1f, 330);
        a.hornSize = 1.9f; a.extras = X_RUFF | X_MANE; a.tail = Tail::Stub; a.tailLen = 0.08f; a.neckThick = 0.65f; a.fur = 0.02f;
        auto& s = c.add("Elk", "Cervus canadensis", AC::Feral, "Deer", a, 15, "Grass, browse", 0.55f, 0, 12,
                        "Bulls 'bugle' in autumn with a high whistling scream heard for kilometers.");
        s.coats = {cv("Tan & Dark Brown", vec3(0.45f, 0.32f, 0.2f), vec3(0.1f, 0.06f, 0.04f), CREAM, SADDLE, 0.5f),
                   cv("Winter", vec3(0.5f, 0.42f, 0.32f), vec3(0.12f, 0.08f, 0.05f), CREAM, SADDLE, 0.5f)};
        for (auto& v : s.coats) v.pattern = COLORPOINT;   // dark head, neck and legs; pale body
    }
    {
        AnimalShape a = deer(1.9f, 2.5f, 550);
        a.horns = Horns::Palmate; a.hornSize = 1.7f; a.rumpRatio = 0.88f; a.headLen = 0.4f; a.snoutLen = 0.6f; a.snoutWidth = 0.9f; a.nose = Nose::Horse;
        a.extras = X_DEWLAP | X_HUMP; a.tail = Tail::Stub; a.tailLen = 0.05f; a.legRatio = 0.62f; a.fur = 0.03f; a.headPitch = 55;
        auto& s = c.add("Moose", "Alces alces", AC::Feral, "Deer", a, 16, "Willow, aquatic plants", 0.75f, 0, 14,
                        "The largest deer; can dive nearly 6 m deep to eat water plants.");
        s.coats = {cv("Dark Brown", vec3(0.06f, 0.04f, 0.03f), vec3(0.35f, 0.3f, 0.25f), CREAM, TAN_POINTS),
                   cv("Grayish", vec3(0.12f, 0.1f, 0.08f), vec3(0.4f, 0.36f, 0.3f), CREAM, TAN_POINTS),
                   cv("White (rare)", WHITE, WHITE, WHITE, SOLID)};
        // dark body, pale lower legs (tan points)
    }
    {
        AnimalShape a = deer(0.95f, 1.3f, 55);
        a.horns = Horns::Pronghorn; a.hornSize = 0.9f; a.hornsMaleOnly = false; a.tail = Tail::Stub; a.tailLen = 0.08f; a.eyeSize = 0.2f;
        a.gaitSpeed = 1.3f;
        auto& s = c.add("Pronghorn", "Antilocapra americana", AC::Feral, "Antelope", a, 12, "Sagebrush, forbs", 0.35f, 0, 5,
                        "The fastest land animal in the Americas - 88 km/h - evolved to outrun extinct cheetahs.");
        s.coats = {cv("Tan & White", vec3(0.55f, 0.32f, 0.14f), WHITE, WHITE, COUNTERSHADE, 1.0f, 1, {0, 0, 1, 0})};
    }
    {
        AnimalShape a = pig(0.5f, 0.9f, 25);
        a.legRatio = 0.5f; a.fur = 0.04f; a.extras = X_TUSKS | X_MANE; a.ear = Ear::Small; a.earSize = 0.25f; a.tail = Tail::Stub; a.tailLen = 0.05f;
        a.girth = 0.22f; a.rumpRatio = 0.9f;
        auto& s = c.add("Collared Peccary", "Dicotyles tajacu", AC::Feral, "Peccary", a, 15, "Cactus, roots, beans", 0.6f, 0, 3,
                        "Not a true pig; eats prickly pear cactus spines and all. Also called javelina.");
        s.coats = {cv("Grizzled Gray", vec3(0.2f, 0.19f, 0.18f), K, vec3(0.7f, 0.66f, 0.55f), AGOUTI, 0.3f, 1, {0, 0, 0, 0})};
    }
    {
        AnimalShape a = caprine(0.95f, 1.3f, 110);
        a.horns = Horns::Curled; a.hornSize = 1.1f; a.hornsMaleOnly = false; a.extras = 0; a.ear = Ear::Pointed; a.earSize = 0.3f;
        auto& s = c.add("Bighorn Sheep", "Ovis canadensis", AC::Feral, "Sheep", a, 12, "Grass, shrubs", 0.55f, 0, 6,
                        "Rams clash head-on at 32 km/h; a double-layered skull absorbs the impact.");
        s.coats = {cv("Brown with White Rump", vec3(0.35f, 0.25f, 0.16f), WHITE, WHITE, COUNTERSHADE, 1.0f),
                   cv("Gray-brown", vec3(0.3f, 0.26f, 0.22f), WHITE, WHITE, COUNTERSHADE, 1.0f)};
    }
    {
        AnimalShape a = caprine(1.0f, 1.3f, 110);
        a.horns = Horns::Short; a.hornSize = 0.55f; a.hornsMaleOnly = false; a.fur = 0.08f; a.fluff = 0.9f; a.extras = X_BEARD | X_HUMP;
        a.noseColor = K;
        auto& s = c.add("Mountain Goat", "Oreamnos americanus", AC::Feral, "Goat", a, 14, "Grass, lichen, moss", 0.5f, 0, 6,
                        "Rubber-like hoof pads grip sheer cliffs; not a true goat but a goat-antelope.");
        s.coats = {cv("White", WHITE, WHITE, WHITE, SOLID), cv("Cream", vec3(0.8f, 0.76f, 0.64f), WHITE, WHITE, SOLID)};
    }
    {
        AnimalShape a = bird(1.0f, 0.55f, 8);
        a.neckAngle = 25; a.legRatio = 0.42f; a.neckLen = 0.45f; a.headLen = 0.2f; a.snoutLen = 0.35f; a.beak = Beak::Chicken; a.extras = X_WATTLE | X_SNOOD;
        a.tail = Tail::Fan; a.tailLen = 0.7f; a.wingLen = 0.8f; a.noseColor = {0.6f, 0.55f, 0.45f}; a.femaleScale = 0.6f;
        auto& s = c.add("Wild Turkey", "Meleagris gallopavo", AC::Feral, "Bird", a, 4, "Seeds, nuts, insects", 0.5f, 0, 1,
                        "Can fly short bursts at 88 km/h and roosts in trees at night.");
        s.coats = {cv("Bronze", vec3(0.12f, 0.08f, 0.05f), vec3(0.3f, 0.25f, 0.2f), vec3(0.5f, 0.35f, 0.2f), FEATHERS, 0.3f),
                   cv("Dark", vec3(0.05f, 0.04f, 0.03f), vec3(0.25f, 0.22f, 0.2f), vec3(0.35f, 0.25f, 0.15f), FEATHERS, 0.3f),
                   cv("Smoke-gray (rare)", vec3(0.55f, 0.52f, 0.5f), vec3(0.4f, 0.38f, 0.36f), WHITE, FEATHERS, 0.3f)};
    }
    {
        AnimalShape a = bird(0.9f, 0.55f, 4.5f);
        a.neckAngle = 20; a.legRatio = 0.25f; a.neckLen = 0.75f; a.headLen = 0.22f; a.snoutLen = 0.4f; a.beak = Beak::Duck; a.foot = Foot::Webbed;
        a.tail = Tail::Stub; a.tailLen = 0.25f; a.wingLen = 0.9f; a.noseColor = K; a.gait = Gait::Waddle;
        auto& s = c.add("Canada Goose", "Branta canadensis", AC::Feral, "Bird", a, 20, "Grass, grain", 0.6f, 0, 1,
                        "Flies in a V to save energy; very protective of its goslings and will charge people.");
        s.coats = {cv("Standard", vec3(0.3f, 0.25f, 0.2f), vec3(0.22f, 0.18f, 0.14f), vec3(0.75f, 0.72f, 0.66f), FEATHERS, 0.6f)};
    }
    {
        AnimalShape a = bird(0.45f, 0.35f, 1.2f);
        a.neckAngle = 20; a.legRatio = 0.2f; a.neckLen = 0.4f; a.headLen = 0.35f; a.snoutLen = 0.5f; a.beak = Beak::Duck; a.foot = Foot::Webbed;
        a.tail = Tail::Stub; a.tailLen = 0.25f; a.wingLen = 0.85f; a.noseColor = {0.7f, 0.6f, 0.1f}; a.gait = Gait::Waddle;
        auto& s = c.add("Mallard", "Anas platyrhynchos", AC::Feral, "Bird", a, 5, "Seeds, plants, insects", 0.2f, 0, 1,
                        "Only the female quacks; drakes make a soft raspy call.");
        s.coats = {cv("Drake", vec3(0.4f, 0.4f, 0.4f), vec3(0.35f, 0.3f, 0.25f), vec3(0.55f, 0.55f, 0.55f), FEATHERS, 0.3f),
                   cv("Hen", vec3(0.3f, 0.2f, 0.1f), vec3(0.25f, 0.17f, 0.1f), vec3(0.45f, 0.35f, 0.2f), FEATHERS, 0.3f)};
    }
    {
        AnimalShape a = bird(0.55f, 0.35f, 1.1f);
        a.neckAngle = 60; a.legRatio = 0.2f; a.neckLen = 0.2f; a.headLen = 0.4f; a.snoutLen = 0.3f; a.beak = Beak::Raptor; a.foot = Foot::Talon;
        a.tail = Tail::Fan; a.tailLen = 0.6f; a.wingLen = 1.2f; a.noseColor = {0.15f, 0.15f, 0.15f}; a.eyeColor = {0.3f, 0.15f, 0.05f};
        a.femaleScale = 1.25f;
        auto& s = c.add("Red-tailed Hawk", "Buteo jamaicensis", AC::Feral, "Raptor", a, 20, "Rodents, rabbits", 0.65f, 0, 2,
                        "Its raspy scream is the sound Hollywood uses for every eagle.");
        s.coats = {cv("Light Morph", vec3(0.25f, 0.15f, 0.08f), vec3(0.2f, 0.12f, 0.07f), vec3(0.75f, 0.7f, 0.6f), FEATHERS, 0.7f),
                   cv("Dark Morph", vec3(0.08f, 0.05f, 0.03f), vec3(0.06f, 0.04f, 0.03f), vec3(0.2f, 0.12f, 0.08f), FEATHERS, 0.5f)};
    }
    {
        AnimalShape a = bird(0.55f, 0.35f, 1.4f);
        a.neckAngle = 70; a.legRatio = 0.15f; a.neckLen = 0.1f; a.headLen = 0.6f; a.snoutLen = 0.15f; a.beak = Beak::Raptor; a.foot = Foot::Talon;
        a.ear = Ear::Tufted; a.tail = Tail::Stub; a.tailLen = 0.35f; a.wingLen = 1.0f; a.noseColor = {0.1f, 0.1f, 0.1f};
        a.eyeColor = {0.8f, 0.55f, 0.05f}; a.eyeSize = 0.2f; a.femaleScale = 1.15f;
        auto& s = c.add("Great Horned Owl", "Bubo virginianus", AC::Feral, "Raptor", a, 15, "Rodents, rabbits, skunks", 0.6f, 0, 2,
                        "Can turn its head 270 degrees; its grip needs 13 kg of force to open.");
        s.coats = {cv("Brown Barred", vec3(0.3f, 0.2f, 0.12f), vec3(0.22f, 0.15f, 0.09f), vec3(0.6f, 0.5f, 0.35f), FEATHERS, 0.6f),
                   cv("Pale Arctic", vec3(0.6f, 0.55f, 0.48f), vec3(0.45f, 0.4f, 0.35f), WHITE, FEATHERS, 0.6f)};
    }
    {
        AnimalShape a = bird(0.9f, 0.6f, 5);
        a.neckAngle = 60; a.legRatio = 0.18f; a.neckLen = 0.25f; a.headLen = 0.35f; a.snoutLen = 0.45f; a.beak = Beak::Raptor; a.foot = Foot::Talon;
        a.tail = Tail::Fan; a.tailLen = 0.5f; a.wingLen = 1.2f; a.noseColor = {0.9f, 0.7f, 0.1f}; a.eyeColor = {0.85f, 0.8f, 0.4f};
        a.femaleScale = 1.2f;
        auto& s = c.add("Bald Eagle", "Haliaeetus leucocephalus", AC::Feral, "Raptor", a, 25, "Fish, carrion", 0.6f, 0, 3,
                        "Builds the largest nests of any North American bird - one weighed two tonnes.");
        s.coats = {cv("Adult", vec3(0.08f, 0.05f, 0.03f), vec3(0.06f, 0.04f, 0.03f), vec3(0.08f, 0.05f, 0.03f), FEATHERS, 0.0f),
                   cv("Juvenile Mottled", vec3(0.2f, 0.14f, 0.08f), vec3(0.15f, 0.1f, 0.06f), vec3(0.55f, 0.48f, 0.4f), FEATHERS, 0.4f)};
    }
    {
        AnimalShape a = bird(0.7f, 0.5f, 1.8f);
        a.neckAngle = 45; a.legRatio = 0.2f; a.neckLen = 0.25f; a.headLen = 0.25f; a.snoutLen = 0.4f; a.beak = Beak::Hook; a.foot = Foot::Claw;
        a.tail = Tail::Fan; a.tailLen = 0.55f; a.wingLen = 1.3f; a.noseColor = {0.85f, 0.8f, 0.7f};
        auto& s = c.add("Turkey Vulture", "Cathartes aura", AC::Feral, "Raptor", a, 16, "Carrion", 0.3f, 0, 2,
                        "Finds carcasses by smell - rare among birds - and cleans up disease.");
        s.coats = {cv("Black-brown", vec3(0.05f, 0.04f, 0.035f), vec3(0.25f, 0.22f, 0.2f), vec3(0.06f, 0.05f, 0.04f), FEATHERS, 0.0f)};
    }
    {
        AnimalShape a = mustelid(0.23f, 0.6f, 9);
        a.legRatio = 0.25f; a.girth = 0.35f; a.headWidth = 0.9f; a.snoutLen = 0.45f; a.tail = Tail::Stub; a.tailLen = 0.2f; a.tailThick = 0.3f;
        a.fur = 0.05f; a.fluff = 0.5f; a.gait = Gait::Waddle; a.gaitSpeed = 0.9f;
        auto& s = c.add("American Badger", "Taxidea taxus", AC::Feral, "Mustelid", a, 9, "Ground squirrels, gophers", 0.8f, 0, 3,
                        "Digs so fast it can bury itself in seconds; sometimes hunts in teams with coyotes.");
        s.coats = {cv("Grizzled Silver", vec3(0.4f, 0.37f, 0.33f), K, WHITE, SKUNK)};
        s.coats[0].a = WHITE; s.coats[0].b = vec3(0.35f, 0.32f, 0.28f);
    }
    {
        AnimalShape a = mustelid(0.1f, 0.4f, 1.2f);
        a.foot = Foot::Webbed;
        auto& s = c.add("American Mink", "Neogale vison", AC::Feral, "Mustelid", a, 4, "Fish, muskrats, frogs", 0.7f, 0, 1.5f,
                        "A fierce semi-aquatic hunter that can take prey larger than itself.");
        s.coats = {cv("Dark Brown", vec3(0.05f, 0.03f, 0.02f), K, WHITE, SOLID, 0.5f, 1, {0, 0, 0.3f, 0}),
                   cv("Brown", vec3(0.12f, 0.06f, 0.03f), K, WHITE, SOLID, 0.5f, 1, {0, 0, 0.3f, 0})};
    }
    {
        AnimalShape a = rodent(0.12f, 0.3f, 1.2f);
        a.tail = Tail::Flat; a.tailLen = 0.8f; a.tailThick = 0.2f; a.foot = Foot::Webbed; a.earSize = 0.15f; a.fur = 0.02f;
        auto& s = c.add("Muskrat", "Ondatra zibethicus", AC::Feral, "Rodent", a, 3, "Cattails, aquatic plants", 0.35f, 0, 1,
                        "Swims backward as well as forward and can stay under for 17 minutes.");
        s.coats = {cv("Brown", vec3(0.18f, 0.1f, 0.05f), vec3(0.35f, 0.25f, 0.15f), GRAY, COUNTERSHADE, 0.5f),
                   cv("Dark", vec3(0.06f, 0.04f, 0.025f), vec3(0.2f, 0.15f, 0.1f), GRAY, COUNTERSHADE, 0.5f)};
    }
    {
        AnimalShape a = turtle(0.04f, 0.4f, 16);
        a.girth = 0.4f; a.chestDepth = 0.3f; a.headLen = 0.3f; a.foot = Foot::Webbed;
        auto& s = c.add("Common Snapping Turtle", "Chelydra serpentina", AC::Feral, "Reptile", a, 40, "Fish, carrion, plants", 0.85f, 0, 1,
                        "Can't hide fully in its small shell, so it defends itself with a lightning-fast bite.");
        s.coats = {cv("Olive Mud", vec3(0.15f, 0.14f, 0.09f), vec3(0.08f, 0.07f, 0.05f), vec3(0.45f, 0.4f, 0.28f), SCALES, 0.5f),
                   cv("Dark Brown", vec3(0.1f, 0.08f, 0.05f), vec3(0.05f, 0.04f, 0.03f), vec3(0.4f, 0.35f, 0.25f), SCALES, 0.5f)};
    }
    {
        AnimalShape a = rabbit(0.17f, 0.3f, 1.2f);
        a.earSize = 0.8f; a.girth = 0.26f; a.legRatio = 0.34f;
        auto& s = c.add("Eastern Cottontail", "Sylvilagus floridanus", AC::Feral, "Rabbit", a, 2, "Grass, clover, bark", 0.2f, 0, 1,
                        "Runs in a zigzag at up to 29 km/h to escape predators.");
        s.coats = {cv("Agouti Brown", vec3(0.3f, 0.2f, 0.12f), K, WHITE, AGOUTI, 0.8f),
                   cv("Grayish", vec3(0.32f, 0.28f, 0.24f), K, WHITE, AGOUTI, 0.8f)};
    }
    {
        AnimalShape a = rabbit(0.3f, 0.45f, 2.5f);
        a.earSize = 1.4f; a.legRatio = 0.4f; a.girth = 0.22f; a.tuck = 0.2f; a.ear = Ear::Long;
        auto& s = c.add("Black-tailed Jackrabbit", "Lepus californicus", AC::Feral, "Hare", a, 5, "Grass, sagebrush, cactus", 0.25f, 0, 1,
                        "A hare, not a rabbit - its huge ears shed body heat in the desert.");
        s.coats = {cv("Sandy Agouti", vec3(0.45f, 0.35f, 0.22f), K, WHITE, AGOUTI, 0.8f, 1, {0, 0, 0, 0})};
    }
    {
        AnimalShape a = horse(1.42f, 1.5f, 380);
        a.fur = 0.012f; a.girth = 0.19f;
        auto& s = c.add("Mustang", "Equus ferus caballus", AC::Feral, "Horse", a, 25, "Grass", 0.65f, 125, 10,
                        "Descended from Spanish horses; wild herds are led by a lead mare, not the stallion.");
        s.coats = pick(horseLib(), {"Bay", "Chestnut", "Black", "Sorrel", "Dun", "Grulla", "Buckskin", "Palomino", "Blue Roan", "Red Roan",
                                    "Bay Tobiano", "Sorrel Overo", "Gray", "Leopard Appaloosa"});
    }
    {
        AnimalShape a = deer(1.05f, 1.5f, 100);
        a.earSize = 0.75f; a.tail = Tail::Thin; a.tailLen = 0.15f; a.hornSize = 1.3f;
        auto& s = c.add("Mule Deer", "Odocoileus hemionus", AC::Feral, "Deer", a, 10, "Browse, forbs", 0.3f, 0, 5,
                        "Named for its mule-like ears; escapes by 'stotting' - bouncing on all four legs.");
        s.coats = {cv("Gray-brown", vec3(0.3f, 0.26f, 0.2f), WHITE, WHITE, COUNTERSHADE, 1.0f),
                   cv("Summer Reddish", vec3(0.4f, 0.22f, 0.1f), WHITE, WHITE, COUNTERSHADE, 1.0f)};
    }
    {
        AnimalShape a = cat(0.55f, 0.85f, 11);
        a.ear = Ear::Tufted; a.earSize = 0.35f; a.extras |= X_EAR_TUFTS | X_RUFF; a.tail = Tail::Stub; a.tailLen = 0.12f; a.tailCarry = 10;
        a.legRatio = 0.6f; a.rumpRatio = 1.1f; a.fur = 0.05f; a.fluff = 0.5f; a.pupil = Pupil::Round; a.eyeSize = 0.14f;
        a.eyeColor = {0.55f, 0.45f, 0.12f};
        auto& s = c.add("Canada Lynx", "Lynx canadensis", AC::Feral, "Wild cat", a, 14, "Snowshoe hares", 0.6f, 0, 3,
                        "Its huge furry paws work like snowshoes; its numbers rise and fall with snowshoe hares.");
        s.coats = {cv("Silver-gray", vec3(0.45f, 0.42f, 0.38f), vec3(0.2f, 0.17f, 0.14f), WHITE, AGOUTI, 0.5f),
                   cv("Brownish", vec3(0.42f, 0.33f, 0.24f), vec3(0.15f, 0.1f, 0.08f), WHITE, AGOUTI, 0.5f)};
    }
    {
        AnimalShape a = mustelid(0.2f, 0.6f, 4.5f);
        a.tail = Tail::Bushy; a.tailLen = 0.6f; a.fur = 0.04f; a.foot = Foot::Claw;
        auto& s = c.add("Fisher", "Pekania pennanti", AC::Feral, "Mustelid", a, 8, "Porcupines, squirrels, hares", 0.75f, 0, 2,
                        "One of the few predators that successfully hunts porcupines; it rarely eats fish.");
        s.coats = {cv("Dark Brown", vec3(0.06f, 0.04f, 0.03f), vec3(0.3f, 0.25f, 0.2f), K, COUNTERSHADE, 0.0f),
                   cv("Grizzled", vec3(0.12f, 0.08f, 0.05f), vec3(0.4f, 0.35f, 0.3f), K, AGOUTI, 0.0f)};
    }
}

void restrictedAnimals(Cat& c) {
    {
        AnimalShape a = bigcat(0.75f, 1.3f, 65);
        a.tailLen = 0.7f; a.tailThick = 0.2f; a.headLen = 0.3f; a.headWidth = 0.85f; a.snoutLen = 0.32f; a.fur = 0.015f;
        a.eyeColor = {0.55f, 0.45f, 0.15f};
        auto& s = c.add("Cougar (Florida Panther)", "Puma concolor", AC::Restricted, "Big cat", a, 12, "Deer, hogs (carnivore)", 0.85f, 0, 20,
                        "Has more names than any other animal - cougar, puma, panther, mountain lion, catamount.");
        s.coats = {cv("Tawny", vec3(0.5f, 0.33f, 0.18f), vec3(0.08f, 0.06f, 0.05f), WHITE, COUNTERSHADE, 0.8f, 1, {0, 0, 0, 0}),
                   cv("Grayish", vec3(0.42f, 0.36f, 0.3f), vec3(0.08f, 0.06f, 0.05f), WHITE, COUNTERSHADE, 0.8f),
                   cv("Reddish", vec3(0.55f, 0.28f, 0.12f), vec3(0.08f, 0.06f, 0.05f), WHITE, COUNTERSHADE, 0.8f)};
        for (auto& v : s.coats) { v.b = CREAM * 1.1f; v.marks.w = 0.0f; }
    }
    {
        AnimalShape a = bigcat(1.0f, 1.8f, 220);
        a.extras |= X_RUFF; a.headLen = 0.35f; a.fur = 0.02f; a.eyeColor = {0.6f, 0.45f, 0.1f};
        auto& s = c.add("Bengal Tiger", "Panthera tigris tigris", AC::Restricted, "Big cat", a, 15, "Deer, wild boar (carnivore)", 0.95f, 0, 40,
                        "No two tigers have the same stripes - and the stripes are on their skin too.");
        s.coats = {cv("Orange", vec3(0.62f, 0.25f, 0.05f), K, WHITE, STRIPES, 1.0f),
                   cv("Golden", vec3(0.75f, 0.52f, 0.25f), vec3(0.45f, 0.25f, 0.1f), WHITE, STRIPES, 1.0f),
                   cv("White", WHITE, vec3(0.12f, 0.1f, 0.1f), WHITE, STRIPES, 1.0f)};
    }
    {
        AnimalShape a = bear(1.0f, 1.6f, 300);
        a.extras = X_HUMP; a.snoutLen = 0.42f; a.stop = 0.45f;
        auto& s = c.add("Grizzly Bear", "Ursus arctos horribilis", AC::Restricted, "Bear", a, 25, "Omnivore - roots, fish, carrion", 0.9f, 0, 35,
                        "Its shoulder hump is pure digging muscle; it can outrun a horse over short distances.");
        s.coats = {cv("Grizzled Brown", vec3(0.2f, 0.12f, 0.06f), vec3(0.55f, 0.45f, 0.3f), CREAM, AGOUTI, 0.0f),
                   cv("Dark Brown", vec3(0.08f, 0.05f, 0.03f), vec3(0.35f, 0.28f, 0.2f), CREAM, AGOUTI, 0.0f),
                   cv("Blonde", vec3(0.5f, 0.36f, 0.2f), vec3(0.7f, 0.6f, 0.42f), CREAM, AGOUTI, 0.0f)};
    }
    {
        AnimalShape a = bear(0.85f, 1.4f, 150);
        a.snoutLen = 0.5f; a.stop = 0.2f; a.ear = Ear::Round; a.earSize = 0.28f; a.noseColor = vec3(0.3f, 0.22f, 0.15f); a.fur = 0.04f;
        auto& s = c.add("American Black Bear", "Ursus americanus", AC::Restricted, "Bear", a, 20, "Omnivore - berries, nuts, insects", 0.7f, 0, 25,
                        "Despite the name, many are brown, cinnamon or even white (the Kermode 'spirit bear').");
        s.coats = {cv("Black", vec3(0.02f, 0.02f, 0.02f), K, WHITE, SOLID, 0.5f, 1, {0, 0, 0.2f, 0}),
                   cv("Cinnamon", vec3(0.35f, 0.17f, 0.07f), vec3(0.35f, 0.17f, 0.07f), WHITE, SOLID),
                   cv("Brown", vec3(0.15f, 0.08f, 0.04f), vec3(0.15f, 0.08f, 0.04f), WHITE, SOLID),
                   cv("Blonde", vec3(0.55f, 0.4f, 0.22f), vec3(0.55f, 0.4f, 0.22f), WHITE, SOLID),
                   cv("Kermode White", WHITE, WHITE, WHITE, SOLID),
                   cv("Glacier Blue", vec3(0.2f, 0.2f, 0.22f), vec3(0.2f, 0.2f, 0.22f), WHITE, SOLID)};
    }
    {
        AnimalShape a = wildCanid(0.8f, 1.1f, 45);
        a.extras |= X_RUFF; a.earSize = 0.35f; a.snoutWidth = 0.5f; a.headWidth = 0.6f; a.fur = 0.05f; a.fluff = 0.4f; a.legThick = 0.32f;
        auto& s = c.add("Gray Wolf", "Canis lupus", AC::Restricted, "Canid", a, 8, "Elk, deer, moose (carnivore)", 0.85f, 0, 15,
                        "Wolf packs are families; a howl can be heard up to 16 km away.");
        s.coats = {cv("Gray", vec3(0.35f, 0.33f, 0.3f), vec3(0.72f, 0.68f, 0.62f), WHITE, COUNTERSHADE, 0.8f),
                   cv("Black", vec3(0.04f, 0.04f, 0.04f), vec3(0.12f, 0.12f, 0.12f), GRAY, COUNTERSHADE, 0.2f),
                   cv("White (Arctic)", WHITE, WHITE, WHITE, SOLID),
                   cv("Tawny", vec3(0.45f, 0.33f, 0.2f), CREAM, WHITE, COUNTERSHADE, 0.8f)};
    }
    {
        AnimalShape a = bigcat(1.2f, 1.9f, 190);
        a.extras |= X_LION_MANE; a.tail = Tail::Tufted; a.tailLen = 0.5f; a.tailThick = 0.14f; a.headLen = 0.33f; a.snoutLen = 0.4f;
        a.fur = 0.012f; a.femaleScale = 0.78f;
        auto& s = c.add("African Lion", "Panthera leo", AC::Restricted, "Big cat", a, 14, "Zebra, wildebeest (carnivore)", 0.95f, 0, 40,
                        "The only truly social cat; a roar can be heard 8 km away.");
        s.coats = {cv("Tawny", vec3(0.62f, 0.42f, 0.2f), vec3(0.18f, 0.1f, 0.05f), CREAM, SOLID),
                   cv("Pale", vec3(0.72f, 0.58f, 0.38f), vec3(0.35f, 0.22f, 0.12f), CREAM, SOLID),
                   cv("White", vec3(0.82f, 0.76f, 0.64f), vec3(0.72f, 0.64f, 0.52f), WHITE, SOLID)};
    }
    {
        AnimalShape a = bigcat(0.65f, 1.3f, 60);
        a.headLen = 0.35f; a.tailLen = 0.75f;
        auto& s = c.add("Leopard", "Panthera pardus", AC::Restricted, "Big cat", a, 13, "Antelope, monkeys (carnivore)", 0.9f, 0, 25,
                        "Hauls kills heavier than itself up into trees; a black leopard is a 'black panther'.");
        s.coats = {cv("Golden Rosettes", vec3(0.62f, 0.4f, 0.15f), K, WHITE, ROSETTES, 0.5f),
                   cv("Pale Rosettes", vec3(0.7f, 0.55f, 0.32f), K, WHITE, ROSETTES, 0.5f),
                   cv("Black Panther", vec3(0.03f, 0.028f, 0.026f), K, vec3(0.03f, 0.028f, 0.026f), ROSETTES, 0.5f),
                   cv("Strawberry", vec3(0.65f, 0.38f, 0.22f), vec3(0.35f, 0.15f, 0.08f), WHITE, ROSETTES, 0.5f)};
    }
    {
        AnimalShape a = bigcat(0.72f, 1.5f, 95);
        a.headLen = 0.4f; a.headWidth = 0.95f; a.legThick = 0.4f; a.tailLen = 0.5f; a.girth = 0.24f;
        auto& s = c.add("Jaguar", "Panthera onca", AC::Restricted, "Big cat", a, 14, "Caiman, capybara (carnivore)", 0.9f, 0, 30,
                        "Has the strongest bite of any big cat for its size - it bites through turtle shells.");
        s.coats = {cv("Golden Rosettes", vec3(0.6f, 0.36f, 0.12f), K, WHITE, ROSETTES, 0.5f),
                   cv("Black Panther", vec3(0.03f, 0.028f, 0.026f), K, vec3(0.03f, 0.028f, 0.026f), ROSETTES, 0.5f)};
    }
    {
        AnimalShape a = bigcat(0.8f, 1.2f, 55);
        a.legRatio = 0.62f; a.girth = 0.15f; a.tuck = 0.8f; a.headLen = 0.28f; a.headWidth = 0.8f; a.snoutLen = 0.3f; a.tailLen = 0.6f;
        a.legThick = 0.26f; a.fur = 0.01f; a.gaitSpeed = 1.3f;
        auto& s = c.add("Cheetah", "Acinonyx jubatus", AC::Restricted, "Big cat", a, 12, "Gazelle (carnivore)", 0.6f, 0, 25,
                        "The fastest land animal, over 100 km/h; it can't roar, but it purrs and chirps.");
        s.coats = {cv("Spotted", vec3(0.65f, 0.45f, 0.2f), K, WHITE, ROSETTES, 0.95f),
                   cv("King Cheetah", vec3(0.65f, 0.45f, 0.2f), K, WHITE, TABBY_CLASSIC, 0.95f)};
    }
    {
        AnimalShape a = bigcat(0.6f, 1.15f, 50);
        a.fur = 0.06f; a.fluff = 0.7f; a.tail = Tail::Bushy; a.tailLen = 0.9f; a.tailThick = 0.35f; a.legRatio = 0.45f;
        a.eyeColor = {0.4f, 0.45f, 0.4f};
        auto& s = c.add("Snow Leopard", "Panthera uncia", AC::Restricted, "Big cat", a, 16, "Blue sheep, ibex (carnivore)", 0.7f, 0, 30,
                        "Wraps its huge thick tail around its face like a scarf while sleeping.");
        s.coats = {cv("Smoky Gray", vec3(0.62f, 0.6f, 0.55f), vec3(0.1f, 0.1f, 0.1f), WHITE, ROSETTES, 0.5f),
                   cv("Creamy", vec3(0.7f, 0.65f, 0.55f), vec3(0.12f, 0.1f, 0.08f), WHITE, ROSETTES, 0.5f)};
    }
    {
        AnimalShape a = wildCanid(0.8f, 1.2f, 64);
        a.rumpRatio = 0.8f; a.headWidth = 0.75f; a.snoutWidth = 0.6f; a.ear = Ear::Round; a.earSize = 0.3f; a.tail = Tail::Tufted;
        a.tailLen = 0.3f; a.tailThick = 0.2f; a.extras = X_MANE; a.fur = 0.02f; a.legThick = 0.36f; a.neckThick = 0.8f;
        auto& s = c.add("Spotted Hyena", "Crocuta crocuta", AC::Restricted, "Hyena", a, 20, "Hunter and scavenger", 0.9f, 0, 20,
                        "A skilled hunter, not just a scavenger; clans are ruled by females.");
        s.coats = {cv("Spotted Sandy", vec3(0.55f, 0.45f, 0.3f), vec3(0.08f, 0.06f, 0.04f), vec3(0.6f, 0.5f, 0.35f), SPOTS, 0.1f),
                   cv("Spotted Gray", vec3(0.45f, 0.42f, 0.36f), vec3(0.08f, 0.06f, 0.04f), vec3(0.5f, 0.45f, 0.4f), SPOTS, 0.1f)};
    }
    {
        AnimalShape a = lizard(0.15f, 1.7f, 360);
        a.girth = 0.16f; a.headLen = 0.3f; a.headWidth = 0.55f; a.snoutLen = 0.62f; a.tailLen = 1.1f; a.extras = X_SCUTES; a.eyeSize = 0.08f;
        a.pupil = Pupil::Slit; a.eyeColor = {0.4f, 0.35f, 0.1f}; a.femaleScale = 0.7f;
        auto& s = c.add("American Alligator", "Alligator mississippiensis", AC::Restricted, "Crocodilian", a, 50, "Fish, turtles, mammals", 0.9f, 0, 30,
                        "Nest temperature decides the sex of hatchlings; an alligator's snout is U-shaped.");
        s.coats = {cv("Black-green", vec3(0.06f, 0.07f, 0.05f), vec3(0.03f, 0.035f, 0.03f), vec3(0.7f, 0.68f, 0.55f), SCALES, 0.3f),
                   cv("Leucistic", WHITE, WHITE, WHITE, SCALES, 0.0f),
                   cv("Juvenile Banded", vec3(0.05f, 0.05f, 0.04f), vec3(0.5f, 0.45f, 0.15f), vec3(0.7f, 0.68f, 0.55f), SCALES, 0.8f)};
    }
    {
        AnimalShape a = lizard(0.18f, 2.2f, 500);
        a.girth = 0.14f; a.headLen = 0.3f; a.headWidth = 0.42f; a.snoutLen = 0.68f; a.tailLen = 1.1f; a.extras = X_SCUTES; a.eyeSize = 0.08f;
        a.pupil = Pupil::Slit; a.eyeColor = {0.55f, 0.45f, 0.15f}; a.femaleScale = 0.7f;
        auto& s = c.add("Nile Crocodile", "Crocodylus niloticus", AC::Restricted, "Crocodilian", a, 60, "Fish, zebras, anything", 1.0f, 0, 40,
                        "Can go a year between meals; mothers carry hatchlings to water in their jaws.");
        s.coats = {cv("Olive", vec3(0.2f, 0.2f, 0.1f), vec3(0.08f, 0.08f, 0.05f), vec3(0.7f, 0.65f, 0.45f), SCALES, 0.5f),
                   cv("Bronze", vec3(0.25f, 0.2f, 0.1f), vec3(0.1f, 0.08f, 0.05f), vec3(0.7f, 0.65f, 0.45f), SCALES, 0.5f)};
    }
    {
        AnimalShape a = snake(0.06f, 1.4f, 3);
        a.headWidth = 1.5f; a.extras = X_RATTLE; a.pupil = Pupil::Slit; a.eyeColor = {0.55f, 0.45f, 0.2f};
        auto& s = c.add("Western Diamondback Rattlesnake", "Crotalus atrox", AC::Restricted, "Venomous reptile", a, 20, "Rodents", 0.85f, 0, 5,
                        "Heat-sensing pits 'see' warm prey in darkness; a new rattle segment grows with each shed.");
        s.coats = {cv("Diamond Gray-brown", vec3(0.45f, 0.4f, 0.32f), vec3(0.15f, 0.12f, 0.1f), vec3(0.8f, 0.75f, 0.6f), SCALES, 0.9f),
                   cv("Reddish", vec3(0.5f, 0.3f, 0.2f), vec3(0.25f, 0.12f, 0.08f), vec3(0.8f, 0.7f, 0.6f), SCALES, 0.9f)};
    }
    {
        AnimalShape a = snake(0.2f, 4.5f, 70);
        a.headWidth = 1.0f; a.headLen = 0.03f; a.pupil = Pupil::Slit;
        auto& s = c.add("Burmese Python", "Python bivittatus", AC::Restricted, "Constrictor", a, 25, "Mammals, birds", 0.7f, 0, 15,
                        "Invasive in the Florida Everglades; kills by constriction and swallows prey whole.");
        s.coats = {cv("Normal", vec3(0.45f, 0.38f, 0.22f), vec3(0.2f, 0.15f, 0.08f), vec3(0.8f, 0.75f, 0.6f), SCALES, 0.7f),
                   cv("Albino", WHITE, vec3(0.85f, 0.7f, 0.2f), WHITE, SCALES, 0.7f),
                   cv("Green", vec3(0.4f, 0.4f, 0.28f), vec3(0.3f, 0.3f, 0.2f), WHITE, SCALES, 0.2f),
                   cv("Granite", vec3(0.4f, 0.35f, 0.25f), vec3(0.15f, 0.12f, 0.08f), WHITE, SCALES, 0.5f)};
    }
    {
        AnimalShape a = snake(0.08f, 3.5f, 6);
        a.headWidth = 1.2f; a.extras = X_HOOD; a.eyeColor = {0.1f, 0.08f, 0.05f};
        auto& s = c.add("King Cobra", "Ophiophagus hannah", AC::Restricted, "Venomous reptile", a, 20, "Other snakes", 0.9f, 0, 8,
                        "The world's longest venomous snake; it can rear up a third of its body and 'growl'.");
        s.coats = {cv("Olive Banded", vec3(0.25f, 0.24f, 0.12f), vec3(0.6f, 0.55f, 0.3f), vec3(0.75f, 0.7f, 0.45f), SCALES, 0.4f),
                   cv("Black Banded", vec3(0.05f, 0.05f, 0.04f), vec3(0.65f, 0.6f, 0.4f), vec3(0.75f, 0.7f, 0.45f), SCALES, 0.6f),
                   cv("Brown", vec3(0.25f, 0.18f, 0.1f), vec3(0.4f, 0.32f, 0.2f), vec3(0.75f, 0.7f, 0.45f), SCALES, 0.2f)};
    }
    {
        AnimalShape a = dog(0.9f, 0.55f, 55);
        a.plan = BodyPlan::Primate; a.legRatio = 0.5f; a.rumpRatio = 0.72f; a.girth = 0.35f; a.tuck = 0.0f; a.neckLen = 0.12f; a.neckAngle = 60;
        a.headLen = 0.28f; a.headWidth = 0.85f; a.snoutLen = 0.32f; a.snoutWidth = 0.75f; a.stop = 0.7f; a.headPitch = -10;
        a.ear = Ear::Round; a.earSize = 0.3f; a.tail = Tail::None; a.foot = Foot::Hand; a.nose = Nose::Primate; a.noseColor = {0.15f, 0.12f, 0.1f};
        a.legThick = 0.34f; a.fur = 0.03f; a.eyeSize = 0.1f; a.eyeColor = {0.15f, 0.08f, 0.04f}; a.gait = Gait::Knuckle; a.femaleScale = 0.85f;
        a.extras = 0;
        auto& s = c.add("Chimpanzee", "Pan troglodytes", AC::Restricted, "Great ape", a, 40, "Fruit, leaves, insects, meat", 0.85f, 0, 25,
                        "Shares about 98.8% of our DNA and is several times stronger than a human.");
        s.coats = {cv("Black", vec3(0.03f, 0.028f, 0.026f), K, vec3(0.45f, 0.35f, 0.3f), SOLID),
                   cv("Graying Elder", vec3(0.1f, 0.1f, 0.1f), GRAY, vec3(0.45f, 0.35f, 0.3f), ROAN, 0.4f)};
    }
    {
        AnimalShape a = mustelid(0.4f, 0.8f, 16);
        a.legRatio = 0.35f; a.girth = 0.25f; a.rumpRatio = 1.1f; a.headWidth = 0.85f; a.tail = Tail::Bushy; a.tailLen = 0.3f;
        a.fur = 0.06f; a.fluff = 0.6f; a.gait = Gait::Bound; a.legThick = 0.4f;
        auto& s = c.add("Wolverine", "Gulo gulo", AC::Restricted, "Mustelid", a, 11, "Carrion, reindeer, rodents", 1.0f, 0, 10,
                        "Pound for pound one of the fiercest animals alive; will drive bears off a kill.");
        s.coats = {cv("Dark Brown with Blonde Band", vec3(0.06f, 0.04f, 0.03f), vec3(0.5f, 0.38f, 0.22f), K, SADDLE, 0.5f)};
    }
    {
        AnimalShape a = bear(1.4f, 2.2f, 500);
        a.neckLen = 0.45f; a.neckThick = 0.7f; a.headLen = 0.32f; a.headWidth = 0.55f; a.snoutLen = 0.5f; a.stop = 0.1f; a.ear = Ear::Small;
        a.earSize = 0.15f; a.rumpRatio = 1.05f; a.fur = 0.05f;
        auto& s = c.add("Polar Bear", "Ursus maritimus", AC::Restricted, "Bear", a, 25, "Seals (carnivore)", 1.0f, 0, 50,
                        "Its fur is actually translucent and its skin is black, to soak up the sun.");
        s.coats = {cv("Ivory", vec3(0.82f, 0.78f, 0.66f), vec3(0.8f, 0.75f, 0.6f), WHITE, SOLID),
                   cv("Yellowed Summer", vec3(0.78f, 0.7f, 0.5f), vec3(0.7f, 0.62f, 0.45f), WHITE, SOLID),
                   cv("Clean White", WHITE, WHITE, WHITE, SOLID)};
    }
}

std::vector<Species> buildCatalog() {
    Cat c;
    smallAnimals(c);
    mediumAnimals(c);
    largeAnimals(c);
    feralAnimals(c);
    restrictedAnimals(c);
    // Every species gets male and female; make sure there is always at least one coat.
    for (auto& s : c.list)
        if (s.coats.empty()) s.coats.push_back(cv("Default", BROWN, K, WHITE, SOLID));
    return c.list;
}

}  // namespace

const std::vector<Species>& speciesCatalog() {
    static const std::vector<Species> cat = buildCatalog();
    return cat;
}

int speciesCount(AnimalClass c) {
    int n = 0;
    for (const auto& s : speciesCatalog()) n += s.cls == c ? 1 : 0;
    return n;
}

int findSpecies(const std::string& name) {
    const auto& cat = speciesCatalog();
    for (size_t i = 0; i < cat.size(); ++i)
        if (cat[i].name == name) return int(i);
    return -1;
}

}  // namespace ps
