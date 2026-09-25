// Ported from engine/src/50-shaders.js GLSL.envSample (GLSL ES 3.00 -> 4.50 core).
/* Van der Corput radical inverse, bit-reversal form. A Hammersley set
   is the right sequence here because the number of samples is known up
   front and fixed -- it is stratified by construction, so 32 of these
   beat 32 hash samples by a wide margin and cost two dozen integer ops. */
float radicalInverseVdC(uint bits){
  bits = (bits << 16u) | (bits >> 16u);
  bits = ((bits & 0x55555555u) << 1u) | ((bits & 0xAAAAAAAAu) >> 1u);
  bits = ((bits & 0x33333333u) << 2u) | ((bits & 0xCCCCCCCCu) >> 2u);
  bits = ((bits & 0x0F0F0F0Fu) << 4u) | ((bits & 0xF0F0F0F0u) >> 4u);
  bits = ((bits & 0x00FF00FFu) << 8u) | ((bits & 0xFF00FF00u) >> 8u);
  return float(bits) * 2.3283064365386963e-10;
}
vec2 hammersley(int i, int n){
  return vec2(float(i) / float(n), radicalInverseVdC(uint(i)));
}
/* Draw a half-vector from the GGX distribution of visible normals'
   simpler cousin -- the plain NDF importance sample. alpha = rough^2,
   matching distributionGGX in GLSL.pbr so the prefilter and the direct
   specular lobe are the same distribution. */
vec3 importanceGGX(vec2 Xi, float rough, vec3 N){
  float a = rough * rough;
  float phi = 2.0 * PI * Xi.x;
  float cosT = sqrt((1.0 - Xi.y) / (1.0 + (a * a - 1.0) * Xi.y));
  float sinT = sqrt(max(0.0, 1.0 - cosT * cosT));
  vec3 H = vec3(sinT * cos(phi), sinT * sin(phi), cosT);
  vec3 up = abs(N.z) < 0.999 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
  vec3 tx = normalize(cross(up, N));
  vec3 ty = cross(N, tx);
  return normalize(tx * H.x + ty * H.y + N * H.z);
}
/* The face basis comes in as three vectors from the CPU rather than as
   a face index and a switch, because the OpenGL cube-face convention
   (the one where +Y's second axis is +Z and everything else's is -Y) is
   a table, and a table belongs in a table. */
vec3 envFaceDir(vec2 uv, vec3 fx, vec3 fy, vec3 fz){
  return normalize(fz + (uv.x * 2.0 - 1.0) * fx + (uv.y * 2.0 - 1.0) * fy);
}
