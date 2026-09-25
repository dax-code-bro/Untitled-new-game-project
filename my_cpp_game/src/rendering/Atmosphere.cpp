#include "rendering/Atmosphere.hpp"

#include <glm/gtc/constants.hpp>

#include <algorithm>
#include <cmath>
#include <thread>

namespace game::rendering {

namespace {
constexpr float kPi = glm::pi<float>();

// Distance along a ray (origin o, unit dir d) to a sphere of radius r at the
// origin; -1 when missed. Returns the far root when o is inside.
float raySphere(const glm::vec3& o, const glm::vec3& d, float r, bool nearest = false) {
    const float b = glm::dot(o, d);
    const float c = glm::dot(o, o) - r * r;
    const float disc = b * b - c;
    if (disc < 0.0f) return -1.0f;
    const float s = std::sqrt(disc);
    const float t0 = -b - s, t1 = -b + s;
    if (nearest) return t0 > 0.0f ? t0 : (t1 > 0.0f ? t1 : -1.0f);
    return t1 > 0.0f ? t1 : -1.0f;
}

struct Medium { glm::vec3 rayleigh; float mie; glm::vec3 extinction; };

Medium mediumAt(const AtmosphereParams& p, float h) {
    const float rd = std::exp(-h / p.rayleighScaleHeight);
    const float md = std::exp(-h / p.mieScaleHeight);
    // Ozone: a tent centred at 25 km, 30 km wide (Hillaire 2020).
    const float od = std::max(0.0f, 1.0f - std::abs(h - 25000.0f) / 15000.0f);
    Medium m;
    m.rayleigh = p.rayleighScattering * rd;
    m.mie = p.mieScattering * p.turbidity * md;
    m.extinction = m.rayleigh + glm::vec3(p.mieExtinction * p.turbidity * md) + p.ozoneAbsorption * od;
    return m;
}

glm::vec3 transmittanceToSun(const AtmosphereParams& p, const glm::vec3& pos, const glm::vec3& sun) {
    if (raySphere(pos, sun, p.planetRadius, true) > 0.0f) return glm::vec3(0.0f);   // behind the planet
    const float len = raySphere(pos, sun, p.atmosphereRadius);
    if (len <= 0.0f) return glm::vec3(1.0f);
    constexpr int N = 12;
    glm::vec3 depth(0.0f);
    const float ds = len / N;
    for (int i = 0; i < N; ++i) {
        const glm::vec3 q = pos + sun * ((i + 0.5f) * ds);
        depth += mediumAt(p, glm::length(q) - p.planetRadius).extinction * ds;
    }
    return glm::exp(-depth);
}
} // namespace

glm::vec3 Atmosphere::sunTransmittance(const AtmosphereParams& p, const glm::vec3& sunDir) {
    const glm::vec3 origin(0.0f, p.planetRadius + p.cameraAltitude, 0.0f);
    glm::vec3 d = glm::normalize(sunDir);
    // Below the horizon the planet blocks it; hold a sliver above so a sun
    // exactly on the horizon still reads as a deep red one.
    if (d.y < 0.01f) d = glm::normalize(glm::vec3(d.x, 0.01f, d.z));
    return transmittanceToSun(p, origin, d);
}

glm::vec2 Atmosphere::dirToUv(const glm::vec3& d) {
    const float az = std::atan2(d.z, d.x);
    const float el = std::asin(std::clamp(d.y, -1.0f, 1.0f));
    const float v = 0.5f + 0.5f * (el < 0.0f ? -1.0f : 1.0f) * std::sqrt(std::abs(el) / (0.5f * kPi));
    return {az / (2.0f * kPi) + 0.5f, v};
}

glm::vec3 Atmosphere::uvToDir(const glm::vec2& uv) {
    const float az = (uv.x - 0.5f) * 2.0f * kPi;
    const float s = uv.y * 2.0f - 1.0f;
    const float el = (s < 0.0f ? -1.0f : 1.0f) * s * s * 0.5f * kPi;
    return {std::cos(el) * std::cos(az), std::sin(el), std::cos(el) * std::sin(az)};
}

void Atmosphere::compute(const AtmosphereParams& p, const glm::vec3& sunIn) {
    const glm::vec3 sun = glm::normalize(sunIn);
    m_texels.assign(static_cast<size_t>(kWidth) * kHeight, glm::vec4(0.0f));
    const glm::vec3 origin(0.0f, p.planetRadius + p.cameraAltitude, 0.0f);
    const float g = p.mieG, g2 = g * g;

    auto row = [&](int y) {
        for (int x = 0; x < kWidth; ++x) {
            glm::vec3 dir = uvToDir({(x + 0.5f) / kWidth, (y + 0.5f) / kHeight});
            /* Below the horizon the shader blends to the lit ground; the
               table only has to be continuous there, so the ray is held
               just above the horizon rather than marched into the planet. */
            if (dir.y < 0.0f) dir = glm::normalize(glm::vec3(dir.x, 0.0f, dir.z) + glm::vec3(0.0f, 1e-3f, 0.0f));
            const float len = raySphere(origin, dir, p.atmosphereRadius);
            const float groundHit = raySphere(origin, dir, p.planetRadius, true);
            const float end = groundHit > 0.0f ? std::min(groundHit, len) : len;
            constexpr int N = 40;
            const float mu = glm::dot(dir, sun);
            const float phaseR = 3.0f / (16.0f * kPi) * (1.0f + mu * mu);
            const float phaseM = 3.0f / (8.0f * kPi) * ((1.0f - g2) * (1.0f + mu * mu)) /
                                 ((2.0f + g2) * std::pow(1.0f + g2 - 2.0f * g * mu, 1.5f));
            glm::vec3 L(0.0f), T(1.0f);
            // Quadratic step distribution: dense near the eye, where the
            // lower, denser air is for every ray that leaves at the horizon.
            float prev = 0.0f;
            for (int i = 1; i <= N; ++i) {
                const float f = static_cast<float>(i) / N;
                const float t = end * f * f;
                const float ds = t - prev;
                const glm::vec3 pos = origin + dir * (prev + 0.5f * ds);
                prev = t;
                const Medium m = mediumAt(p, glm::length(pos) - p.planetRadius);
                const glm::vec3 sunT = transmittanceToSun(p, pos, sun);
                const glm::vec3 scatter = (m.rayleigh * phaseR + glm::vec3(m.mie * phaseM)) * sunT;
                /* The cheapest honest multiple scattering: an isotropic
                   second bounce proportional to the single-scattered light
                   of the whole column. Without it a low sun's horizon goes
                   too dark and too saturated, the classic single-scatter
                   look. */
                const glm::vec3 ms = (m.rayleigh + glm::vec3(m.mie)) * sunT * (0.12f / (4.0f * kPi));
                const glm::vec3 stepT = glm::exp(-m.extinction * ds);
                // Energy-conserving integration of the segment.
                const glm::vec3 ext = glm::max(m.extinction, glm::vec3(1e-12f));
                L += T * (scatter + ms) * (glm::vec3(1.0f) - stepT) / ext;
                T *= stepT;
            }
            m_texels[static_cast<size_t>(y) * kWidth + x] = glm::vec4(L, 1.0f);
        }
    };
    const unsigned threads = std::max(1u, std::min(8u, std::thread::hardware_concurrency()));
    std::vector<std::thread> pool;
    for (unsigned t = 0; t < threads; ++t)
        pool.emplace_back([&, t] { for (int y = static_cast<int>(t); y < kHeight; y += static_cast<int>(threads)) row(y); });
    for (auto& th : pool) th.join();
}

glm::vec3 Atmosphere::sample(const glm::vec3& dir) const {
    if (m_texels.empty()) return glm::vec3(0.0f);
    const glm::vec2 uv = dirToUv(dir);
    const float fx = uv.x * kWidth - 0.5f, fy = std::clamp(uv.y * kHeight - 0.5f, 0.0f, kHeight - 1.0f);
    const int x0 = static_cast<int>(std::floor(fx)), y0 = static_cast<int>(std::floor(fy));
    const float tx = fx - x0, ty = fy - y0;
    auto at = [&](int x, int y) {
        x = ((x % kWidth) + kWidth) % kWidth;          // azimuth wraps
        y = std::clamp(y, 0, kHeight - 1);
        return glm::vec3(m_texels[static_cast<size_t>(y) * kWidth + x]);
    };
    return glm::mix(glm::mix(at(x0, y0), at(x0 + 1, y0), tx), glm::mix(at(x0, y0 + 1), at(x0 + 1, y0 + 1), tx), ty);
}

} // namespace game::rendering
