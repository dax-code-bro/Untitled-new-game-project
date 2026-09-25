// Ported from engine/src/50-shaders.js GLSL.fog (GLSL ES 3.00 -> 4.50 core).
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform float uFogHeight;
uniform float uFogHeightFalloff;
uniform float uFogSkyBlend;

/* Exponential height fog: dense low down, thinning with altitude, which is
   what sells scale on big outdoor maps.

   AND AT DISTANCE IT BECOMES THE SKY ITSELF.

   This faded everything to uFogColor -- one flat colour for the whole
   frame. But the thing BEHIND a distant building is not one flat
   colour, it is skyRadiance(dir): a gradient from the horizon band up
   to the zenith, with the sun's halo in it. So a far silhouette faded
   to grey in front of a sky that was not grey, and instead of
   dissolving it turned into a flat cutout of itself. You could see
   exactly where the world ended.

   Now the fog colour is carried toward the sky along the direction you
   are looking, and by the fog amount itself -- so near and mid distance
   keep the authored mood colour that every map's palette is tuned to,
   and by the time something is far enough away to be fully fogged it is
   being painted the same value as the sky it is standing in front of.
   At which point the silhouette is genuinely gone rather than merely
   faint.

   THE HEIGHT TERM READS BOTH ENDS OF THE RAY, not just the camera. It
   took cameraPos.y alone, which makes the fog thinner when YOU climb
   and does nothing at all about how low the thing you are looking at
   is -- so the lake and the hillside above it fogged by exactly the
   same amount and the fog never sat on the water. Sampling the midpoint
   of the ray is one extra add and gives the layer a bottom. */
vec3 applyFog(vec3 color, vec3 worldPos, vec3 cameraPos, vec3 viewDir){
  if (uFogDensity <= 0.0) return color;
  float dist = length(worldPos - cameraPos);
  float midY = (cameraPos.y + worldPos.y) * 0.5;
  float heightFactor = exp(-max(0.0, midY - uFogHeight) * uFogHeightFalloff);
  float fogAmount = 1.0 - exp(-dist * uFogDensity * heightFactor);
  fogAmount = saturate1(fogAmount);
  // Fog picks up sun colour when looking toward the sun.
  float sunAmount = pow(saturate1(dot(viewDir, uSunDir)), 8.0);
  vec3 fogCol = mix(uFogColor, uSunColor * 1.1, sunAmount * 0.6);
  fogCol = mix(fogCol, skyRadiance(viewDir), saturate1(uFogSkyBlend * fogAmount));
  return mix(color, fogCol, fogAmount);
}
