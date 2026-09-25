// ============================================================================
//  MOOR3D — math library
//  Minimal, header-only linear algebra. Column-major matrices, GL convention.
// ============================================================================
#pragma once
#include <cmath>
#include <cstdint>
#include <algorithm>

namespace m {

constexpr float PI  = 3.14159265358979323846f;
constexpr float TAU = 6.28318530717958647692f;
constexpr float DEG = PI / 180.0f;

inline float clampf(float v, float a, float b){ return v < a ? a : (v > b ? b : v); }
inline float lerpf (float a, float b, float t){ return a + (b - a) * t; }
inline float smoothstepf(float t){ return t * t * (3.0f - 2.0f * t); }
inline float fractf(float v){ return v - std::floor(v); }
inline float signf (float v){ return v < 0.0f ? -1.0f : 1.0f; }

// ---------------------------------------------------------------- vec2
struct v2 {
  float x = 0, y = 0;
  v2() = default;
  v2(float X, float Y) : x(X), y(Y) {}
  v2 operator+(const v2& o) const { return {x + o.x, y + o.y}; }
  v2 operator-(const v2& o) const { return {x - o.x, y - o.y}; }
  v2 operator*(float s)     const { return {x * s, y * s}; }
  v2& operator+=(const v2& o){ x += o.x; y += o.y; return *this; }
};
inline float dot(const v2& a, const v2& b){ return a.x * b.x + a.y * b.y; }
inline float len(const v2& a){ return std::sqrt(dot(a, a)); }
inline v2 norm(const v2& a){ float l = len(a); return l > 1e-8f ? a * (1.0f / l) : v2{0, 0}; }

// ---------------------------------------------------------------- vec3
struct v3 {
  float x = 0, y = 0, z = 0;
  v3() = default;
  v3(float X, float Y, float Z) : x(X), y(Y), z(Z) {}
  explicit v3(float s) : x(s), y(s), z(s) {}
  v3 operator+(const v3& o) const { return {x + o.x, y + o.y, z + o.z}; }
  v3 operator-(const v3& o) const { return {x - o.x, y - o.y, z - o.z}; }
  v3 operator-()            const { return {-x, -y, -z}; }
  v3 operator*(float s)     const { return {x * s, y * s, z * s}; }
  v3 operator*(const v3& o) const { return {x * o.x, y * o.y, z * o.z}; }
  v3& operator+=(const v3& o){ x += o.x; y += o.y; z += o.z; return *this; }
  v3& operator-=(const v3& o){ x -= o.x; y -= o.y; z -= o.z; return *this; }
  v3& operator*=(float s)    { x *= s; y *= s; z *= s; return *this; }
};
inline float dot(const v3& a, const v3& b){ return a.x * b.x + a.y * b.y + a.z * b.z; }
inline v3 cross(const v3& a, const v3& b){
  return { a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x };
}
inline float len (const v3& a){ return std::sqrt(dot(a, a)); }
inline float len2(const v3& a){ return dot(a, a); }
inline v3 norm(const v3& a){ float l = len(a); return l > 1e-8f ? a * (1.0f / l) : v3{0, 0, 0}; }
inline v3 lerp(const v3& a, const v3& b, float t){ return a + (b - a) * t; }
inline v3 vmin(const v3& a, const v3& b){ return {std::min(a.x,b.x), std::min(a.y,b.y), std::min(a.z,b.z)}; }
inline v3 vmax(const v3& a, const v3& b){ return {std::max(a.x,b.x), std::max(a.y,b.y), std::max(a.z,b.z)}; }

// ---------------------------------------------------------------- vec4
struct v4 {
  float x = 0, y = 0, z = 0, w = 0;
  v4() = default;
  v4(float X, float Y, float Z, float W) : x(X), y(Y), z(Z), w(W) {}
  v4(const v3& v, float W) : x(v.x), y(v.y), z(v.z), w(W) {}
  v3 xyz() const { return {x, y, z}; }
};

// ---------------------------------------------------------------- quaternion
struct quat {
  float x = 0, y = 0, z = 0, w = 1;
  quat() = default;
  quat(float X, float Y, float Z, float W) : x(X), y(Y), z(Z), w(W) {}

  static quat axisAngle(const v3& axis, float ang){
    v3 a = norm(axis);
    float s = std::sin(ang * 0.5f);
    return { a.x * s, a.y * s, a.z * s, std::cos(ang * 0.5f) };
  }
  static quat euler(float px, float py, float pz){   // pitch(X) yaw(Y) roll(Z)
    return axisAngle({0,1,0}, py) * axisAngle({1,0,0}, px) * axisAngle({0,0,1}, pz);
  }
  quat operator*(const quat& o) const {
    return { w*o.x + x*o.w + y*o.z - z*o.y,
             w*o.y - x*o.z + y*o.w + z*o.x,
             w*o.z + x*o.y - y*o.x + z*o.w,
             w*o.w - x*o.x - y*o.y - z*o.z };
  }
  v3 rotate(const v3& v) const {
    v3 u{x, y, z};
    return u * (2.0f * dot(u, v)) + v * (w * w - dot(u, u)) + cross(u, v) * (2.0f * w);
  }
};
inline quat normq(const quat& q){
  float l = std::sqrt(q.x*q.x + q.y*q.y + q.z*q.z + q.w*q.w);
  if(l < 1e-8f) return {0,0,0,1};
  float i = 1.0f / l;
  return {q.x*i, q.y*i, q.z*i, q.w*i};
}
// shortest-arc interpolation — used by every animation blend
inline quat slerp(quat a, quat b, float t){
  float d = a.x*b.x + a.y*b.y + a.z*b.z + a.w*b.w;
  if(d < 0.0f){ b = {-b.x, -b.y, -b.z, -b.w}; d = -d; }
  if(d > 0.9995f){
    return normq({ lerpf(a.x,b.x,t), lerpf(a.y,b.y,t), lerpf(a.z,b.z,t), lerpf(a.w,b.w,t) });
  }
  float th0 = std::acos(clampf(d, -1.0f, 1.0f));
  float th  = th0 * t;
  float s0  = std::sin(th0);
  float sa  = std::sin(th0 - th) / s0;
  float sb  = std::sin(th)       / s0;
  return { a.x*sa + b.x*sb, a.y*sa + b.y*sb, a.z*sa + b.z*sb, a.w*sa + b.w*sb };
}

// ---------------------------------------------------------------- mat4
// Column-major: e[col*4 + row], matching glUniformMatrix4fv with transpose=GL_FALSE.
struct m4 {
  float e[16] = {1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1};

  static m4 identity(){ return {}; }

  static m4 translate(const v3& t){
    m4 r; r.e[12] = t.x; r.e[13] = t.y; r.e[14] = t.z; return r;
  }
  static m4 scale(const v3& s){
    m4 r; r.e[0] = s.x; r.e[5] = s.y; r.e[10] = s.z; return r;
  }
  static m4 fromQuat(const quat& q){
    float xx=q.x*q.x, yy=q.y*q.y, zz=q.z*q.z;
    float xy=q.x*q.y, xz=q.x*q.z, yz=q.y*q.z;
    float wx=q.w*q.x, wy=q.w*q.y, wz=q.w*q.z;
    m4 r;
    r.e[0]=1-2*(yy+zz); r.e[1]=  2*(xy+wz); r.e[2] =  2*(xz-wy); r.e[3] =0;
    r.e[4]=  2*(xy-wz); r.e[5]=1-2*(xx+zz); r.e[6] =  2*(yz+wx); r.e[7] =0;
    r.e[8]=  2*(xz+wy); r.e[9]=  2*(yz-wx); r.e[10]=1-2*(xx+yy); r.e[11]=0;
    return r;
  }
  static m4 trs(const v3& t, const quat& q, const v3& s){
    m4 r = fromQuat(q);
    r.e[0]*=s.x; r.e[1]*=s.x; r.e[2] *=s.x;
    r.e[4]*=s.y; r.e[5]*=s.y; r.e[6] *=s.y;
    r.e[8]*=s.z; r.e[9]*=s.z; r.e[10]*=s.z;
    r.e[12]=t.x; r.e[13]=t.y; r.e[14]=t.z;
    return r;
  }
  static m4 perspective(float fovY, float aspect, float zn, float zf){
    float f = 1.0f / std::tan(fovY * 0.5f);
    m4 r; for(int i = 0; i < 16; i++) r.e[i] = 0;
    r.e[0]  = f / aspect;
    r.e[5]  = f;
    r.e[10] = (zf + zn) / (zn - zf);
    r.e[11] = -1.0f;
    r.e[14] = (2.0f * zf * zn) / (zn - zf);
    return r;
  }
  static m4 ortho(float l, float r_, float b, float t, float zn, float zf){
    m4 r; for(int i = 0; i < 16; i++) r.e[i] = 0;
    r.e[0]  =  2.0f / (r_ - l);
    r.e[5]  =  2.0f / (t - b);
    r.e[10] = -2.0f / (zf - zn);
    r.e[12] = -(r_ + l) / (r_ - l);
    r.e[13] = -(t + b) / (t - b);
    r.e[14] = -(zf + zn) / (zf - zn);
    r.e[15] =  1.0f;
    return r;
  }
  static m4 lookAt(const v3& eye, const v3& at, const v3& up){
    v3 f = norm(at - eye);
    v3 s = norm(cross(f, up));
    if(len2(s) < 1e-12f) s = norm(cross(f, v3{0, 0, 1}));   // up parallel to fwd
    v3 u = cross(s, f);
    m4 r;
    r.e[0]=s.x; r.e[1]=u.x; r.e[2] =-f.x; r.e[3] =0;
    r.e[4]=s.y; r.e[5]=u.y; r.e[6] =-f.y; r.e[7] =0;
    r.e[8]=s.z; r.e[9]=u.z; r.e[10]=-f.z; r.e[11]=0;
    r.e[12]=-dot(s,eye); r.e[13]=-dot(u,eye); r.e[14]=dot(f,eye); r.e[15]=1;
    return r;
  }

  m4 operator*(const m4& o) const {
    m4 r;
    for(int c = 0; c < 4; c++){
      for(int rw = 0; rw < 4; rw++){
        r.e[c*4+rw] = e[0*4+rw]*o.e[c*4+0] + e[1*4+rw]*o.e[c*4+1]
                    + e[2*4+rw]*o.e[c*4+2] + e[3*4+rw]*o.e[c*4+3];
      }
    }
    return r;
  }
  v4 operator*(const v4& v) const {
    return { e[0]*v.x + e[4]*v.y + e[8] *v.z + e[12]*v.w,
             e[1]*v.x + e[5]*v.y + e[9] *v.z + e[13]*v.w,
             e[2]*v.x + e[6]*v.y + e[10]*v.z + e[14]*v.w,
             e[3]*v.x + e[7]*v.y + e[11]*v.z + e[15]*v.w };
  }
  v3 mulPoint(const v3& p) const {
    return { e[0]*p.x + e[4]*p.y + e[8] *p.z + e[12],
             e[1]*p.x + e[5]*p.y + e[9] *p.z + e[13],
             e[2]*p.x + e[6]*p.y + e[10]*p.z + e[14] };
  }
  v3 mulDir(const v3& d) const {
    return { e[0]*d.x + e[4]*d.y + e[8] *d.z,
             e[1]*d.x + e[5]*d.y + e[9] *d.z,
             e[2]*d.x + e[6]*d.y + e[10]*d.z };
  }
};

// General 4x4 inverse (used for the inverse-bind matrices of every skeleton).
inline m4 inverse(const m4& mm){
  const float* a = mm.e;
  float s0=a[0]*a[5]-a[1]*a[4],  s1=a[0]*a[6]-a[2]*a[4];
  float s2=a[0]*a[7]-a[3]*a[4],  s3=a[1]*a[6]-a[2]*a[5];
  float s4=a[1]*a[7]-a[3]*a[5],  s5=a[2]*a[7]-a[3]*a[6];
  float c5=a[10]*a[15]-a[11]*a[14], c4=a[9]*a[15]-a[11]*a[13];
  float c3=a[9]*a[14]-a[10]*a[13],  c2=a[8]*a[15]-a[11]*a[12];
  float c1=a[8]*a[14]-a[10]*a[12],  c0=a[8]*a[13]-a[9]*a[12];
  float det = s0*c5 - s1*c4 + s2*c3 + s3*c2 - s4*c1 + s5*c0;
  m4 r;
  if(std::fabs(det) < 1e-20f) return r;                     // singular: identity
  float id = 1.0f / det;
  r.e[0]  = ( a[5]*c5 - a[6]*c4 + a[7]*c3) * id;
  r.e[1]  = (-a[1]*c5 + a[2]*c4 - a[3]*c3) * id;
  r.e[2]  = ( a[13]*s5 - a[14]*s4 + a[15]*s3) * id;
  r.e[3]  = (-a[9]*s5 + a[10]*s4 - a[11]*s3) * id;
  r.e[4]  = (-a[4]*c5 + a[6]*c2 - a[7]*c1) * id;
  r.e[5]  = ( a[0]*c5 - a[2]*c2 + a[3]*c1) * id;
  r.e[6]  = (-a[12]*s5 + a[14]*s2 - a[15]*s1) * id;
  r.e[7]  = ( a[8]*s5 - a[10]*s2 + a[11]*s1) * id;
  r.e[8]  = ( a[4]*c4 - a[5]*c2 + a[7]*c0) * id;
  r.e[9]  = (-a[0]*c4 + a[1]*c2 - a[3]*c0) * id;
  r.e[10] = ( a[12]*s4 - a[13]*s2 + a[15]*s0) * id;
  r.e[11] = (-a[8]*s4 + a[9]*s2 - a[11]*s0) * id;
  r.e[12] = (-a[4]*c3 + a[5]*c1 - a[6]*c0) * id;
  r.e[13] = ( a[0]*c3 - a[1]*c1 + a[2]*c0) * id;
  r.e[14] = (-a[12]*s3 + a[13]*s1 - a[14]*s0) * id;
  r.e[15] = ( a[8]*s3 - a[9]*s1 + a[10]*s0) * id;
  return r;
}

// Angle interpolation on the shortest path — steering, headings, turrets.
inline float angLerp(float a, float b, float t){
  float d = std::fmod(b - a, TAU);
  if(d >  PI) d -= TAU;
  if(d < -PI) d += TAU;
  return a + d * t;
}
inline float angDelta(float a, float b){
  float d = std::fmod(b - a, TAU);
  if(d >  PI) d -= TAU;
  if(d < -PI) d += TAU;
  return d;
}

// ---------------------------------------------------------------- noise / rng
struct Rng {
  uint32_t s;
  explicit Rng(uint32_t seed = 1u) : s(seed ? seed : 1u) {}
  uint32_t next(){                                  // xorshift32
    s ^= s << 13; s ^= s >> 17; s ^= s << 5;
    return s;
  }
  float f()                 { return (next() >> 8) * (1.0f / 16777216.0f); }
  float range(float a, float b){ return a + f() * (b - a); }
  int   irange(int a, int b)   { return a + (int)(next() % (uint32_t)(b - a + 1)); }
};

// quick global jitter helper for gameplay code
inline float rr_(float a, float b){
  static Rng g(1234567u);
  return a + g.f() * (b - a);
}

inline float hash2(int x, int y){
  uint32_t h = (uint32_t)(x * 374761393) + (uint32_t)(y * 668265263);
  h = (h ^ (h >> 13)) * 1274126177u;
  return (float)((h ^ (h >> 16)) & 0xFFFFFF) / 16777216.0f;
}
inline float vnoise(float x, float y){
  int xi = (int)std::floor(x), yi = (int)std::floor(y);
  float fx = smoothstepf(x - xi), fy = smoothstepf(y - yi);
  float a = hash2(xi, yi),     b = hash2(xi + 1, yi);
  float c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  float t = a + (b - a) * fx;
  return t + ((c + (d - c) * fx) - t) * fy;
}
inline float fbm(float x, float y, int oct, float gain = 0.5f){
  float sum = 0, amp = 0.5f, freq = 1, tot = 0;
  for(int i = 0; i < oct; i++){
    sum += amp * vnoise(x * freq, y * freq);
    tot += amp; amp *= gain; freq *= 2.0f;
  }
  return tot > 0 ? sum / tot : 0.0f;
}
// ridged noise — mountain ridges read much better than plain fbm
inline float ridged(float x, float y, int oct){
  float sum = 0, amp = 0.5f, freq = 1, tot = 0;
  for(int i = 0; i < oct; i++){
    float n = 1.0f - std::fabs(vnoise(x * freq, y * freq) * 2.0f - 1.0f);
    sum += amp * n * n;
    tot += amp; amp *= 0.5f; freq *= 2.0f;
  }
  return tot > 0 ? sum / tot : 0.0f;
}

} // namespace m
