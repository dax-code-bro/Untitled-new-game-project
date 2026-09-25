// Player character appearance: everything the character creator edits.
#pragma once
#include "core/Math.h"
#include "core/Noise.h"
#include <string>

namespace ps {

class KeyValues;

enum class Gender { Male = 0, Female = 1 };

struct Appearance {
    std::string name = "Alex Rivers";
    Gender gender = Gender::Male;
    // Body
    float height = 1.78f;      // meters (1.50 .. 2.05)
    float weight = 0.45f;      // 0 slim .. 1 heavy
    float muscle = 0.45f;      // 0 .. 1
    float shoulders = 0.5f;    // 0 narrow .. 1 broad
    float hips = 0.5f;         // 0 narrow .. 1 wide
    float skinTone = 0.35f;    // 0 very light .. 1 very dark (palette)
    // Face
    float jaw = 0.5f;          // width
    float faceLength = 0.5f;
    float noseSize = 0.5f;
    int eyeColor = 0;          // index into palette
    // Hair
    int hairStyle = 2;
    vec3 hairColor{0.20f, 0.13f, 0.08f};
    int facialHair = 0;
    // Clothing
    int topStyle = 0;
    vec3 topColor{0.25f, 0.38f, 0.55f};
    vec3 pantsColor{0.18f, 0.20f, 0.26f};
    vec3 shoeColor{0.30f, 0.20f, 0.12f};
    int accessory = 0;

    vec3 skinColor() const;
    vec3 eyeRGB() const;
    void randomize(Rng& rng);
    void applyPreset(int preset);   // presets depend on gender
    void save(KeyValues& kv, const std::string& prefix) const;
    void load(const KeyValues& kv, const std::string& prefix);
};

// Option lists (for the UI)
constexpr int kHairStyleCount = 8;
const char* hairStyleName(int i);
constexpr int kFacialHairCount = 4;
const char* facialHairName(int i);
constexpr int kTopStyleCount = 5;
const char* topStyleName(int i);
constexpr int kAccessoryCount = 3;
const char* accessoryName(int i);
constexpr int kEyeColorCount = 6;
const char* eyeColorName(int i);
constexpr int kPresetCount = 4;
const char* presetName(Gender g, int i);

}  // namespace ps
