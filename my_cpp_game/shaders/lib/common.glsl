// Ported from engine/src/50-shaders.js GLSL.common (GLSL ES 3.00 -> 4.50 core).
const float PI = 3.14159265359;
const float INV_PI = 0.31830988618;

float saturate1(float x){ return clamp(x, 0.0, 1.0); }
vec3  saturate3(vec3 x){ return clamp(x, vec3(0.0), vec3(1.0)); }

float hash11(float p){
  p = fract(p * 0.1031);
  p *= p + 33.33;
  return fract(p * (p + p));
}
float hash12(vec2 p){
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec3 hash31(float p){
  vec3 p3 = fract(vec3(p) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yxz + 33.33);
  return fract((p3.xxy + p3.yzz) * p3.zyx);
}
float valueNoise(vec3 p){
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n = i.x + i.y * 157.0 + i.z * 113.0;
  return mix(
    mix(mix(hash11(n), hash11(n + 1.0), f.x),
        mix(hash11(n + 157.0), hash11(n + 158.0), f.x), f.y),
    mix(mix(hash11(n + 113.0), hash11(n + 114.0), f.x),
        mix(hash11(n + 270.0), hash11(n + 271.0), f.x), f.y),
    f.z);
}
float fbm3(vec3 p){
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { s += a * valueNoise(p); p *= 2.02; a *= 0.5; }
  return s;
}
