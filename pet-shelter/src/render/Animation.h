// Animation toolkit used by everything that moves: doors, the gate,
// cutscene cameras, traffic, and the character skeleton.
#pragma once
#include "core/Math.h"
#include <string>
#include <utility>
#include <vector>

namespace ps {

enum class Ease { Linear, InOutCubic, OutCubic, InOutSine, OutBack };
float ease(Ease e, float t);

// Animates a scalar toward a target at a fixed rate with easing (doors, gate).
struct Tween {
    float value = 0.0f;      // 0..1 progress
    float target = 0.0f;
    float duration = 1.0f;   // seconds for a full 0->1 move
    Ease curve = Ease::InOutCubic;
    void update(float dt);
    float eased() const { return ease(curve, value); }
    bool moving() const { return value != target; }
};

// Keyframed track with Catmull-Rom interpolation (smooth camera paths).
template <class T>
struct Track {
    std::vector<std::pair<float, T>> keys;   // (time, value), sorted by time
    void add(float t, const T& v) { keys.push_back({t, v}); }
    float duration() const { return keys.empty() ? 0.0f : keys.back().first; }
    T sample(float t) const;
};

vec3 catmullRom(vec3 p0, vec3 p1, vec3 p2, vec3 p3, float t);
float catmullRom(float p0, float p1, float p2, float p3, float t);

// Hierarchical skeleton: joints with local transforms solved to world space.
struct Skeleton {
    struct Joint {
        std::string name;
        int parent = -1;
        vec3 offset;          // bind-pose translation relative to parent
        quat rot;             // animated local rotation
        vec3 scale{1, 1, 1};
    };
    std::vector<Joint> joints;
    std::vector<mat4> world;
    int add(const std::string& name, int parent, vec3 offset);
    int find(const std::string& name) const;
    void resetPose();
    void solve(const mat4& root);
};

template <class T>
T Track<T>::sample(float t) const {
    if (keys.empty()) return T();
    if (t <= keys.front().first) return keys.front().second;
    if (t >= keys.back().first) return keys.back().second;
    size_t i = 0;
    while (i + 1 < keys.size() && keys[i + 1].first < t) ++i;
    const T& p1 = keys[i].second;
    const T& p2 = keys[i + 1].second;
    const T& p0 = i > 0 ? keys[i - 1].second : p1;
    const T& p3 = i + 2 < keys.size() ? keys[i + 2].second : p2;
    float u = (t - keys[i].first) / std::max(1e-5f, keys[i + 1].first - keys[i].first);
    return catmullRom(p0, p1, p2, p3, u);
}

}  // namespace ps
