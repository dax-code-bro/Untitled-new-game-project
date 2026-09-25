// Procedural animal models. Every species is generated from its measured
// proportions (Species.h) as one continuous skinned surface: rump -> torso ->
// neck -> skull -> muzzle, with legs, tail, ears, eyes, nose, jaw, tongue,
// claws/hooves, horns/antlers and extras blended on. Individuals vary by
// sex, age (babies have big heads and short snouts), size, weight and coat.
#pragma once
#include "game/Species.h"
#include "render/SkinnedMesh.h"
#include <string>
#include <vector>

namespace ps {

struct AnimalIndividual {
    int species = 0;
    bool male = true;
    float age = 1.0f;          // 0 newborn .. 1 adult
    int coat = 0;              // index into species coats
    uint32_t seed = 1;         // per-individual variation (markings, proportions)
    float weightFactor = 1.0f; // 0.8 thin .. 1.3 heavy
};

struct AnimalRig {
    struct Bone { std::string name; int parent; vec3 bindPos; };
    std::vector<Bone> bones;
    int root = 0, pelvis = -1, spine = -1, chest = -1, neck1 = -1, neck2 = -1, head = -1, jaw = -1, tongue = -1;
    int earL = -1, earR = -1;
    int tail[8] = {-1, -1, -1, -1, -1, -1, -1, -1};
    int tailCount = 0;
    int leg[4][4] = {{-1, -1, -1, -1}, {-1, -1, -1, -1}, {-1, -1, -1, -1}, {-1, -1, -1, -1}};  // FL FR HL HR
    int legCount = 4;
    int wing[2][3] = {{-1, -1, -1}, {-1, -1, -1}};
    int chain[24] = {};        // snake / long-body spine chain
    int chainCount = 0;
    // Measurements used by the animator
    float shoulderH = 0.5f, hipH = 0.5f, bodyLen = 0.6f, legLen = 0.3f, headLen = 0.2f, scale = 1.0f;
    BodyPlan plan = BodyPlan::Quadruped;
    int add(const std::string& name, int parent, vec3 pos);
};

struct AnimalBuild {
    AnimalRig rig;
    SkinBuilder mesh;
    CoatUniforms coat;
    float furLen = 0.0f;       // longest fur (m) - how far fur shells reach
    AABB bounds;
};

AnimalBuild buildAnimal(const Species& sp, const AnimalIndividual& ind);

}  // namespace ps
