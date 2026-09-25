#pragma once
#include <glm/glm.hpp>
#include <vector>

namespace game::rendering {

/* A physically based sky: single scattering through an Earth atmosphere
 * (Rayleigh + Mie + ozone absorption, exponential density profiles), ray
 * marched on the CPU into a latitude/longitude table the shaders sample.
 *
 * Why the CPU: the table is 256x128 and changes only when the sun moves,
 * and computing it here means the diffuse spherical harmonics, which the
 * renderer projects on the CPU, integrate EXACTLY the sky the shaders
 * draw -- the same guarantee the web engine kept by hand with a line-for-
 * line JavaScript copy of its gradient sky.
 *
 * Output is radiance per unit of sun illuminance; the renderer multiplies
 * in the sun's colour and intensity. */
struct AtmosphereParams {
    float planetRadius = 6360e3f;          // m
    float atmosphereRadius = 6460e3f;      // m
    float cameraAltitude = 200.0f;         // m
    glm::vec3 rayleighScattering{5.802e-6f, 13.558e-6f, 33.1e-6f};  // 1/m at sea level
    float rayleighScaleHeight = 8000.0f;
    float mieScattering = 3.996e-6f;       // scaled by turbidity
    float mieExtinction = 4.440e-6f;
    float mieScaleHeight = 1200.0f;
    float mieG = 0.80f;
    glm::vec3 ozoneAbsorption{0.650e-6f, 1.881e-6f, 0.085e-6f};
    float turbidity = 1.0f;                // Mie multiplier: 1 clear, 3 hazy
};

class Atmosphere {
public:
    static constexpr int kWidth = 256, kHeight = 128;

    /* Rebuilds the table for a sun direction (toward the sun). */
    void compute(const AtmosphereParams& p, const glm::vec3& sunDir);

    /* How much of the sun's light survives the air between it and the eye,
       per channel -- 1 overhead is ~0.9, at the horizon it is red and dim. */
    static glm::vec3 sunTransmittance(const AtmosphereParams& p, const glm::vec3& sunDir);

    /* Bilinear lookup, the same mapping the shader uses. */
    [[nodiscard]] glm::vec3 sample(const glm::vec3& dir) const;
    [[nodiscard]] const std::vector<glm::vec4>& texels() const { return m_texels; }   // RGBA, row 0 = v 0

    /* The table's mapping: u = azimuth, v = 0.5 + 0.5 sign(el) sqrt(|el|/(pi/2)),
       which spends most rows near the horizon where the sky changes fastest. */
    static glm::vec2 dirToUv(const glm::vec3& dir);
    static glm::vec3 uvToDir(const glm::vec2& uv);

private:
    std::vector<glm::vec4> m_texels;
};

} // namespace game::rendering
