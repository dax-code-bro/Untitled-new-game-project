// Small self-contained math library (vectors, matrices, quaternions).
// Column-major matrices, right-handed, matching OpenGL/GLSL conventions.
#pragma once
#include <cmath>
#include <algorithm>
#include <cstdint>

namespace ps {

constexpr float kPi = 3.14159265358979323846f;
inline float radians(float d) { return d * kPi / 180.0f; }
inline float degrees(float r) { return r * 180.0f / kPi; }
inline float clampf(float v, float lo, float hi) { return v < lo ? lo : (v > hi ? hi : v); }
inline float saturate(float v) { return clampf(v, 0.0f, 1.0f); }
inline float lerpf(float a, float b, float t) { return a + (b - a) * t; }
inline float smoothstepf(float e0, float e1, float x) {
    float t = saturate((x - e0) / (e1 - e0));
    return t * t * (3.0f - 2.0f * t);
}

struct vec2 {
    float x = 0, y = 0;
    vec2() = default;
    constexpr vec2(float a, float b) : x(a), y(b) {}
    vec2 operator+(vec2 o) const { return {x + o.x, y + o.y}; }
    vec2 operator-(vec2 o) const { return {x - o.x, y - o.y}; }
    vec2 operator*(float s) const { return {x * s, y * s}; }
};
inline float length(vec2 v) { return std::sqrt(v.x * v.x + v.y * v.y); }

struct vec3 {
    float x = 0, y = 0, z = 0;
    vec3() = default;
    constexpr vec3(float a, float b, float c) : x(a), y(b), z(c) {}
    explicit constexpr vec3(float s) : x(s), y(s), z(s) {}
    vec3 operator+(vec3 o) const { return {x + o.x, y + o.y, z + o.z}; }
    vec3 operator-(vec3 o) const { return {x - o.x, y - o.y, z - o.z}; }
    vec3 operator*(vec3 o) const { return {x * o.x, y * o.y, z * o.z}; }
    vec3 operator*(float s) const { return {x * s, y * s, z * s}; }
    vec3 operator/(float s) const { return {x / s, y / s, z / s}; }
    vec3 operator-() const { return {-x, -y, -z}; }
    vec3& operator+=(vec3 o) { x += o.x; y += o.y; z += o.z; return *this; }
    vec3& operator-=(vec3 o) { x -= o.x; y -= o.y; z -= o.z; return *this; }
    vec3& operator*=(float s) { x *= s; y *= s; z *= s; return *this; }
    float& operator[](int i) { return (&x)[i]; }
    float operator[](int i) const { return (&x)[i]; }
};
inline vec3 operator*(float s, vec3 v) { return v * s; }
inline float dot(vec3 a, vec3 b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
inline vec3 cross(vec3 a, vec3 b) { return {a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x}; }
inline float length(vec3 v) { return std::sqrt(dot(v, v)); }
inline vec3 normalize(vec3 v) { float l = length(v); return l > 1e-8f ? v / l : vec3(0, 1, 0); }
inline vec3 lerp(vec3 a, vec3 b, float t) { return a + (b - a) * t; }
inline vec3 vmin(vec3 a, vec3 b) { return {std::min(a.x, b.x), std::min(a.y, b.y), std::min(a.z, b.z)}; }
inline vec3 vmax(vec3 a, vec3 b) { return {std::max(a.x, b.x), std::max(a.y, b.y), std::max(a.z, b.z)}; }

struct vec4 {
    float x = 0, y = 0, z = 0, w = 0;
    vec4() = default;
    constexpr vec4(float a, float b, float c, float d) : x(a), y(b), z(c), w(d) {}
    constexpr vec4(vec3 v, float d) : x(v.x), y(v.y), z(v.z), w(d) {}
    vec3 xyz() const { return {x, y, z}; }
    float& operator[](int i) { return (&x)[i]; }
    float operator[](int i) const { return (&x)[i]; }
};

struct quat {
    float x = 0, y = 0, z = 0, w = 1;
    static quat axisAngle(vec3 axis, float angle) {
        axis = normalize(axis);
        float s = std::sin(angle * 0.5f);
        return {axis.x * s, axis.y * s, axis.z * s, std::cos(angle * 0.5f)};
    }
    static quat euler(float pitch, float yaw, float roll) {  // applied yaw * pitch * roll
        return axisAngle({0, 1, 0}, yaw) * axisAngle({1, 0, 0}, pitch) * axisAngle({0, 0, 1}, roll);
    }
    quat operator*(const quat& q) const {
        return {w * q.x + x * q.w + y * q.z - z * q.y,
                w * q.y - x * q.z + y * q.w + z * q.x,
                w * q.z + x * q.y - y * q.x + z * q.w,
                w * q.w - x * q.x - y * q.y - z * q.z};
    }
    vec3 rotate(vec3 v) const {
        vec3 u{x, y, z};
        return u * (2.0f * dot(u, v)) + v * (w * w - dot(u, u)) + cross(u, v) * (2.0f * w);
    }
};

// Column-major 4x4 matrix: m[col][row]
struct mat4 {
    float m[4][4] = {{1, 0, 0, 0}, {0, 1, 0, 0}, {0, 0, 1, 0}, {0, 0, 0, 1}};
    const float* data() const { return &m[0][0]; }
    static mat4 identity() { return mat4(); }
    mat4 operator*(const mat4& b) const {
        mat4 r;
        for (int c = 0; c < 4; ++c)
            for (int rr = 0; rr < 4; ++rr) {
                float s = 0;
                for (int k = 0; k < 4; ++k) s += m[k][rr] * b.m[c][k];
                r.m[c][rr] = s;
            }
        return r;
    }
    vec4 operator*(const vec4& v) const {
        vec4 r;
        for (int rr = 0; rr < 4; ++rr) r[rr] = m[0][rr] * v.x + m[1][rr] * v.y + m[2][rr] * v.z + m[3][rr] * v.w;
        return r;
    }
    vec3 transformPoint(vec3 p) const { vec4 r = (*this) * vec4(p, 1.0f); return r.xyz(); }
    vec3 transformDir(vec3 d) const { vec4 r = (*this) * vec4(d, 0.0f); return r.xyz(); }
    static mat4 translate(vec3 t) { mat4 r; r.m[3][0] = t.x; r.m[3][1] = t.y; r.m[3][2] = t.z; return r; }
    static mat4 scale(vec3 s) { mat4 r; r.m[0][0] = s.x; r.m[1][1] = s.y; r.m[2][2] = s.z; return r; }
    static mat4 rotate(const quat& q) {
        mat4 r;
        float xx = q.x * q.x, yy = q.y * q.y, zz = q.z * q.z;
        float xy = q.x * q.y, xz = q.x * q.z, yz = q.y * q.z;
        float wx = q.w * q.x, wy = q.w * q.y, wz = q.w * q.z;
        r.m[0][0] = 1 - 2 * (yy + zz); r.m[0][1] = 2 * (xy + wz);     r.m[0][2] = 2 * (xz - wy);
        r.m[1][0] = 2 * (xy - wz);     r.m[1][1] = 1 - 2 * (xx + zz); r.m[1][2] = 2 * (yz + wx);
        r.m[2][0] = 2 * (xz + wy);     r.m[2][1] = 2 * (yz - wx);     r.m[2][2] = 1 - 2 * (xx + yy);
        return r;
    }
    static mat4 rotateY(float a) { return rotate(quat::axisAngle({0, 1, 0}, a)); }
    static mat4 trs(vec3 t, const quat& q, vec3 s) { return translate(t) * rotate(q) * scale(s); }
    static mat4 perspective(float fovy, float aspect, float zn, float zf) {
        mat4 r;
        float f = 1.0f / std::tan(fovy * 0.5f);
        r.m[0][0] = f / aspect; r.m[1][1] = f;
        r.m[2][2] = (zf + zn) / (zn - zf); r.m[2][3] = -1;
        r.m[3][2] = 2 * zf * zn / (zn - zf); r.m[3][3] = 0;
        return r;
    }
    static mat4 ortho(float l, float rt, float b, float t, float zn, float zf) {
        mat4 r;
        r.m[0][0] = 2 / (rt - l); r.m[1][1] = 2 / (t - b); r.m[2][2] = -2 / (zf - zn);
        r.m[3][0] = -(rt + l) / (rt - l); r.m[3][1] = -(t + b) / (t - b); r.m[3][2] = -(zf + zn) / (zf - zn);
        return r;
    }
    static mat4 lookAt(vec3 eye, vec3 target, vec3 up) {
        vec3 f = normalize(target - eye);
        vec3 s = normalize(cross(f, up));
        vec3 u = cross(s, f);
        mat4 r;
        r.m[0][0] = s.x; r.m[1][0] = s.y; r.m[2][0] = s.z;
        r.m[0][1] = u.x; r.m[1][1] = u.y; r.m[2][1] = u.z;
        r.m[0][2] = -f.x; r.m[1][2] = -f.y; r.m[2][2] = -f.z;
        r.m[3][0] = -dot(s, eye); r.m[3][1] = -dot(u, eye); r.m[3][2] = dot(f, eye);
        return r;
    }
    mat4 inverse() const;
};

inline mat4 mat4::inverse() const {
    const float* a = &m[0][0];
    float inv[16];
    inv[0] = a[5] * a[10] * a[15] - a[5] * a[11] * a[14] - a[9] * a[6] * a[15] + a[9] * a[7] * a[14] + a[13] * a[6] * a[11] - a[13] * a[7] * a[10];
    inv[4] = -a[4] * a[10] * a[15] + a[4] * a[11] * a[14] + a[8] * a[6] * a[15] - a[8] * a[7] * a[14] - a[12] * a[6] * a[11] + a[12] * a[7] * a[10];
    inv[8] = a[4] * a[9] * a[15] - a[4] * a[11] * a[13] - a[8] * a[5] * a[15] + a[8] * a[7] * a[13] + a[12] * a[5] * a[11] - a[12] * a[7] * a[9];
    inv[12] = -a[4] * a[9] * a[14] + a[4] * a[10] * a[13] + a[8] * a[5] * a[14] - a[8] * a[6] * a[13] - a[12] * a[5] * a[10] + a[12] * a[6] * a[9];
    inv[1] = -a[1] * a[10] * a[15] + a[1] * a[11] * a[14] + a[9] * a[2] * a[15] - a[9] * a[3] * a[14] - a[13] * a[2] * a[11] + a[13] * a[3] * a[10];
    inv[5] = a[0] * a[10] * a[15] - a[0] * a[11] * a[14] - a[8] * a[2] * a[15] + a[8] * a[3] * a[14] + a[12] * a[2] * a[11] - a[12] * a[3] * a[10];
    inv[9] = -a[0] * a[9] * a[15] + a[0] * a[11] * a[13] + a[8] * a[1] * a[15] - a[8] * a[3] * a[13] - a[12] * a[1] * a[11] + a[12] * a[3] * a[9];
    inv[13] = a[0] * a[9] * a[14] - a[0] * a[10] * a[13] - a[8] * a[1] * a[14] + a[8] * a[2] * a[13] + a[12] * a[1] * a[10] - a[12] * a[2] * a[9];
    inv[2] = a[1] * a[6] * a[15] - a[1] * a[7] * a[14] - a[5] * a[2] * a[15] + a[5] * a[3] * a[14] + a[13] * a[2] * a[7] - a[13] * a[3] * a[6];
    inv[6] = -a[0] * a[6] * a[15] + a[0] * a[7] * a[14] + a[4] * a[2] * a[15] - a[4] * a[3] * a[14] - a[12] * a[2] * a[7] + a[12] * a[3] * a[6];
    inv[10] = a[0] * a[5] * a[15] - a[0] * a[7] * a[13] - a[4] * a[1] * a[15] + a[4] * a[3] * a[13] + a[12] * a[1] * a[7] - a[12] * a[3] * a[5];
    inv[14] = -a[0] * a[5] * a[14] + a[0] * a[6] * a[13] + a[4] * a[1] * a[14] - a[4] * a[2] * a[13] - a[12] * a[1] * a[6] + a[12] * a[2] * a[5];
    inv[3] = -a[1] * a[6] * a[11] + a[1] * a[7] * a[10] + a[5] * a[2] * a[11] - a[5] * a[3] * a[10] - a[9] * a[2] * a[7] + a[9] * a[3] * a[6];
    inv[7] = a[0] * a[6] * a[11] - a[0] * a[7] * a[10] - a[4] * a[2] * a[11] + a[4] * a[3] * a[10] + a[8] * a[2] * a[7] - a[8] * a[3] * a[6];
    inv[11] = -a[0] * a[5] * a[11] + a[0] * a[7] * a[9] + a[4] * a[1] * a[11] - a[4] * a[3] * a[9] - a[8] * a[1] * a[7] + a[8] * a[3] * a[5];
    inv[15] = a[0] * a[5] * a[10] - a[0] * a[6] * a[9] - a[4] * a[1] * a[10] + a[4] * a[2] * a[9] + a[8] * a[1] * a[6] - a[8] * a[2] * a[5];
    float det = a[0] * inv[0] + a[1] * inv[4] + a[2] * inv[8] + a[3] * inv[12];
    mat4 r;
    if (std::fabs(det) < 1e-20f) return r;
    det = 1.0f / det;
    float* o = &r.m[0][0];
    for (int i = 0; i < 16; ++i) o[i] = inv[i] * det;
    return r;
}

struct AABB {
    vec3 min{0, 0, 0}, max{0, 0, 0};
    AABB() = default;
    AABB(vec3 a, vec3 b) : min(vmin(a, b)), max(vmax(a, b)) {}
    vec3 center() const { return (min + max) * 0.5f; }
    vec3 size() const { return max - min; }
    bool contains(vec3 p) const {
        return p.x >= min.x && p.x <= max.x && p.y >= min.y && p.y <= max.y && p.z >= min.z && p.z <= max.z;
    }
    bool overlaps(const AABB& o) const {
        return min.x < o.max.x && max.x > o.min.x && min.y < o.max.y && max.y > o.min.y && min.z < o.max.z && max.z > o.min.z;
    }
    void expand(const AABB& o) { min = vmin(min, o.min); max = vmax(max, o.max); }
};

// Ray vs AABB (slab test). Returns distance or -1.
inline float rayAABB(vec3 ro, vec3 rd, const AABB& b) {
    float tmin = 0.0f, tmax = 1e30f;
    for (int i = 0; i < 3; ++i) {
        if (std::fabs(rd[i]) < 1e-9f) {
            if (ro[i] < b.min[i] || ro[i] > b.max[i]) return -1.0f;
        } else {
            float inv = 1.0f / rd[i];
            float t1 = (b.min[i] - ro[i]) * inv, t2 = (b.max[i] - ro[i]) * inv;
            if (t1 > t2) std::swap(t1, t2);
            tmin = std::max(tmin, t1);
            tmax = std::min(tmax, t2);
            if (tmin > tmax) return -1.0f;
        }
    }
    return tmin;
}

}  // namespace ps
