// Shared helpers. Every program includes this first.
const float PI     = 3.14159265358979;
const float INV_PI = 0.31830988618379;
float saturate1(float x) { return clamp(x, 0.0, 1.0); }
vec3  saturate3(vec3 x)  { return clamp(x, vec3(0.0), vec3(1.0)); }
