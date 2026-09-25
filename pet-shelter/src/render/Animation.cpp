#include "render/Animation.h"

namespace ps {

float ease(Ease e, float t) {
    t = saturate(t);
    switch (e) {
    case Ease::Linear: return t;
    case Ease::InOutCubic: return t < 0.5f ? 4 * t * t * t : 1 - std::pow(-2 * t + 2, 3.0f) / 2;
    case Ease::OutCubic: return 1 - std::pow(1 - t, 3.0f);
    case Ease::InOutSine: return -(std::cos(kPi * t) - 1) / 2;
    case Ease::OutBack: { float c1 = 1.70158f, c3 = c1 + 1; return 1 + c3 * std::pow(t - 1, 3.0f) + c1 * std::pow(t - 1, 2.0f); }
    }
    return t;
}

void Tween::update(float dt) {
    float step = dt / std::max(duration, 1e-4f);
    if (value < target) value = std::min(target, value + step);
    else if (value > target) value = std::max(target, value - step);
}

vec3 catmullRom(vec3 p0, vec3 p1, vec3 p2, vec3 p3, float t) {
    float t2 = t * t, t3 = t2 * t;
    return (p1 * 2.0f + (p2 - p0) * t + (p0 * 2.0f - p1 * 5.0f + p2 * 4.0f - p3) * t2 + (p1 * 3.0f - p0 - p2 * 3.0f + p3) * t3) * 0.5f;
}
float catmullRom(float p0, float p1, float p2, float p3, float t) {
    float t2 = t * t, t3 = t2 * t;
    return 0.5f * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (3 * p1 - p0 - 3 * p2 + p3) * t3);
}

int Skeleton::add(const std::string& name, int parent, vec3 offset) {
    Joint j;
    j.name = name;
    j.parent = parent;
    j.offset = offset;
    joints.push_back(j);
    return int(joints.size()) - 1;
}

int Skeleton::find(const std::string& name) const {
    for (size_t i = 0; i < joints.size(); ++i) if (joints[i].name == name) return int(i);
    return -1;
}

void Skeleton::resetPose() {
    for (auto& j : joints) { j.rot = quat(); j.scale = {1, 1, 1}; }
}

void Skeleton::solve(const mat4& root) {
    world.resize(joints.size());
    for (size_t i = 0; i < joints.size(); ++i) {
        const Joint& j = joints[i];
        mat4 local = mat4::translate(j.offset) * mat4::rotate(j.rot) * mat4::scale(j.scale);
        world[i] = (j.parent < 0 ? root : world[size_t(j.parent)]) * local;   // parents come first
    }
}

}  // namespace ps
