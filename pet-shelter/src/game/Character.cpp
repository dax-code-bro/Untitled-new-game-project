#include "game/Character.h"
#include "core/SaveFile.h"

namespace ps {

const char* hairStyleName(int i) {
    static const char* n[] = {"Bald", "Buzz cut", "Short", "Side part", "Long", "Ponytail", "Bun", "Curly"};
    return n[(i >= 0 && i < kHairStyleCount) ? i : 0];
}
const char* facialHairName(int i) {
    static const char* n[] = {"None", "Stubble", "Mustache", "Full beard"};
    return n[(i >= 0 && i < kFacialHairCount) ? i : 0];
}
const char* topStyleName(int i) {
    static const char* n[] = {"T-shirt", "Button-up shirt", "Scrubs", "Hoodie", "Flannel"};
    return n[(i >= 0 && i < kTopStyleCount) ? i : 0];
}
const char* accessoryName(int i) {
    static const char* n[] = {"None", "Glasses", "Cap"};
    return n[(i >= 0 && i < kAccessoryCount) ? i : 0];
}
const char* eyeColorName(int i) {
    static const char* n[] = {"Brown", "Hazel", "Green", "Blue", "Gray", "Amber"};
    return n[(i >= 0 && i < kEyeColorCount) ? i : 0];
}
const char* presetName(Gender g, int i) {
    static const char* m[] = {"Rancher", "Veterinarian", "Young founder", "Retired vet"};
    static const char* f[] = {"Rancher", "Veterinarian", "Young founder", "Retired vet"};
    i = (i >= 0 && i < kPresetCount) ? i : 0;
    return g == Gender::Male ? m[i] : f[i];
}

vec3 Appearance::skinColor() const {
    static const vec3 pal[] = {{0.96f, 0.80f, 0.69f}, {0.90f, 0.70f, 0.56f}, {0.78f, 0.57f, 0.42f},
                               {0.62f, 0.43f, 0.30f}, {0.45f, 0.30f, 0.20f}, {0.30f, 0.19f, 0.13f}};
    float t = saturate(skinTone) * 5.0f;
    int i = std::min(4, int(t));
    return lerp(pal[i], pal[i + 1], t - float(i));
}

vec3 Appearance::eyeRGB() const {
    static const vec3 pal[] = {{0.30f, 0.17f, 0.08f}, {0.42f, 0.33f, 0.16f}, {0.22f, 0.45f, 0.25f},
                               {0.25f, 0.45f, 0.75f}, {0.50f, 0.55f, 0.58f}, {0.65f, 0.45f, 0.12f}};
    return pal[(eyeColor >= 0 && eyeColor < kEyeColorCount) ? eyeColor : 0];
}

void Appearance::randomize(Rng& rng) {
    bool f = gender == Gender::Female;
    height = f ? rng.range(1.55f, 1.80f) : rng.range(1.65f, 1.95f);
    weight = rng.range(0.15f, 0.8f);
    muscle = rng.range(0.1f, 0.85f);
    shoulders = f ? rng.range(0.1f, 0.6f) : rng.range(0.35f, 0.95f);
    hips = f ? rng.range(0.4f, 0.95f) : rng.range(0.1f, 0.6f);
    skinTone = rng.uniform();
    jaw = rng.uniform();
    faceLength = rng.uniform();
    noseSize = rng.uniform();
    eyeColor = rng.irange(0, kEyeColorCount - 1);
    hairStyle = f ? rng.irange(2, kHairStyleCount - 1) : rng.irange(0, 4);
    static const vec3 hair[] = {{0.05f, 0.04f, 0.035f}, {0.20f, 0.13f, 0.08f}, {0.42f, 0.27f, 0.14f},
                                {0.78f, 0.62f, 0.38f}, {0.55f, 0.20f, 0.08f}, {0.72f, 0.72f, 0.70f}};
    hairColor = hair[rng.irange(0, 5)];
    facialHair = f ? 0 : rng.irange(0, kFacialHairCount - 1);
    topStyle = rng.irange(0, kTopStyleCount - 1);
    topColor = {rng.range(0.1f, 0.8f), rng.range(0.1f, 0.8f), rng.range(0.1f, 0.8f)};
    pantsColor = {rng.range(0.08f, 0.35f), rng.range(0.08f, 0.35f), rng.range(0.1f, 0.45f)};
    shoeColor = {rng.range(0.1f, 0.4f), rng.range(0.08f, 0.3f), rng.range(0.05f, 0.2f)};
    accessory = rng.irange(0, kAccessoryCount - 1);
}

void Appearance::applyPreset(int p) {
    bool f = gender == Gender::Female;
    switch (p) {
    case 0:  // Rancher
        height = f ? 1.70f : 1.84f; weight = 0.5f; muscle = 0.7f;
        shoulders = f ? 0.45f : 0.8f; hips = f ? 0.65f : 0.4f;
        skinTone = 0.3f; hairStyle = f ? 5 : 2; hairColor = {0.30f, 0.19f, 0.10f};
        facialHair = f ? 0 : 3; topStyle = 4; topColor = {0.60f, 0.16f, 0.12f};
        pantsColor = {0.16f, 0.22f, 0.36f}; shoeColor = {0.35f, 0.22f, 0.12f}; accessory = 2; eyeColor = 1;
        break;
    case 1:  // Veterinarian
        height = f ? 1.66f : 1.78f; weight = 0.35f; muscle = 0.35f;
        shoulders = f ? 0.35f : 0.55f; hips = f ? 0.6f : 0.35f;
        skinTone = 0.55f; hairStyle = f ? 6 : 3; hairColor = {0.06f, 0.05f, 0.04f};
        facialHair = 0; topStyle = 2; topColor = {0.25f, 0.55f, 0.58f};
        pantsColor = {0.25f, 0.55f, 0.58f}; shoeColor = {0.85f, 0.85f, 0.85f}; accessory = 1; eyeColor = 0;
        break;
    case 2:  // Young founder
        height = f ? 1.64f : 1.76f; weight = 0.3f; muscle = 0.4f;
        shoulders = f ? 0.3f : 0.6f; hips = f ? 0.7f : 0.35f;
        skinTone = 0.15f; hairStyle = f ? 4 : 2; hairColor = {0.75f, 0.58f, 0.34f};
        facialHair = f ? 0 : 1; topStyle = 3; topColor = {0.30f, 0.34f, 0.30f};
        pantsColor = {0.20f, 0.26f, 0.40f}; shoeColor = {0.9f, 0.9f, 0.88f}; accessory = 0; eyeColor = 3;
        break;
    default:  // Retired vet
        height = f ? 1.62f : 1.74f; weight = 0.65f; muscle = 0.25f;
        shoulders = f ? 0.35f : 0.5f; hips = f ? 0.7f : 0.5f;
        skinTone = 0.8f; hairStyle = f ? 7 : 1; hairColor = {0.70f, 0.70f, 0.68f};
        facialHair = f ? 0 : 2; topStyle = 1; topColor = {0.78f, 0.74f, 0.62f};
        pantsColor = {0.32f, 0.28f, 0.22f}; shoeColor = {0.22f, 0.14f, 0.08f}; accessory = 1; eyeColor = 4;
        break;
    }
}

void Appearance::save(KeyValues& kv, const std::string& p) const {
    kv.set(p + "name", name);
    kv.seti(p + "gender", int(gender));
    kv.setf(p + "height", height); kv.setf(p + "weight", weight); kv.setf(p + "muscle", muscle);
    kv.setf(p + "shoulders", shoulders); kv.setf(p + "hips", hips); kv.setf(p + "skinTone", skinTone);
    kv.setf(p + "jaw", jaw); kv.setf(p + "faceLength", faceLength); kv.setf(p + "noseSize", noseSize);
    kv.seti(p + "eyeColor", eyeColor); kv.seti(p + "hairStyle", hairStyle); kv.setv(p + "hairColor", hairColor);
    kv.seti(p + "facialHair", facialHair); kv.seti(p + "topStyle", topStyle); kv.setv(p + "topColor", topColor);
    kv.setv(p + "pantsColor", pantsColor); kv.setv(p + "shoeColor", shoeColor); kv.seti(p + "accessory", accessory);
}

void Appearance::load(const KeyValues& kv, const std::string& p) {
    name = kv.get(p + "name", name);
    gender = Gender(kv.geti(p + "gender", int(gender)));
    height = float(kv.getf(p + "height", height)); weight = float(kv.getf(p + "weight", weight));
    muscle = float(kv.getf(p + "muscle", muscle)); shoulders = float(kv.getf(p + "shoulders", shoulders));
    hips = float(kv.getf(p + "hips", hips)); skinTone = float(kv.getf(p + "skinTone", skinTone));
    jaw = float(kv.getf(p + "jaw", jaw)); faceLength = float(kv.getf(p + "faceLength", faceLength));
    noseSize = float(kv.getf(p + "noseSize", noseSize)); eyeColor = int(kv.geti(p + "eyeColor", eyeColor));
    hairStyle = int(kv.geti(p + "hairStyle", hairStyle)); hairColor = kv.getv(p + "hairColor", hairColor);
    facialHair = int(kv.geti(p + "facialHair", facialHair)); topStyle = int(kv.geti(p + "topStyle", topStyle));
    topColor = kv.getv(p + "topColor", topColor); pantsColor = kv.getv(p + "pantsColor", pantsColor);
    shoeColor = kv.getv(p + "shoeColor", shoeColor); accessory = int(kv.geti(p + "accessory", accessory));
}

}  // namespace ps
