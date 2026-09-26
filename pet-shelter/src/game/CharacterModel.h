// Procedural 3D character built from the creator's Appearance, driven by a
// joint skeleton (idle breathing + walk cycle). Rendered by the same custom
// lit shader as everything else.
#pragma once
#include "game/Character.h"
#include "render/Animation.h"
#include "render/Renderer.h"
#include <vector>

namespace ps {

class CharacterModel {
public:
    void build(const Appearance& a);
    // walkAmount 0 = idle, 1 = full walk. walkPhase advances with distance.
    // hold 0..1 raises both forearms in front of the chest (carrying or examining something)
    void animate(float time, float walkPhase, float walkAmount, float lookYaw = 0.0f, float hold = 0.0f);
    void draw(Renderer& r, const mat4& root) const;
    float eyeHeight() const { return eyeHeight_; }

private:
    struct Part { int joint; Mesh mesh; };
    Skeleton skel_;
    std::vector<Part> parts_;
    float scale_ = 1.0f;
    float eyeHeight_ = 1.65f;
    int jPelvis_ = 0, jSpine_ = 0, jChest_ = 0, jNeck_ = 0, jHead_ = 0;
    int jShoulder_[2] = {}, jElbow_[2] = {}, jWrist_[2] = {}, jHip_[2] = {}, jKnee_[2] = {}, jAnkle_[2] = {};
};

}  // namespace ps
