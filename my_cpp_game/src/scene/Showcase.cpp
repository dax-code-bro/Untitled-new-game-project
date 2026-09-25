#include "scene/Showcase.hpp"

#include <glm/gtc/constants.hpp>
#include <glm/gtc/matrix_transform.hpp>

#include <cmath>
#include <stdexcept>

namespace game::scene {

using rendering::Camera;
using rendering::DrawItem;
using rendering::Instance;
using rendering::Material;
using rendering::srgb;

namespace {
double smoothstep(double a, double b, double x) {
    const double t = std::min(1.0, std::max(0.0, (x - a) / (b - a)));
    return t * t * (3.0 - 2.0 * t);
}

// A small deterministic generator, so every run places the same blades.
struct Rng {
    uint32_t s;
    explicit Rng(uint32_t seed) : s(seed) {}
    float next() {
        s ^= s << 13; s ^= s >> 17; s ^= s << 5;
        return static_cast<float>(s & 0xffffffu) / 16777216.0f;
    }
    float range(float a, float b) { return a + (b - a) * next(); }
};

glm::mat4 trs(glm::vec3 t, glm::vec3 s = glm::vec3(1.0f), float yaw = 0.0f, float pitch = 0.0f,
              float roll = 0.0f) {
    glm::mat4 m = glm::translate(glm::mat4(1.0f), t);
    m = glm::rotate(m, yaw, glm::vec3(0, 1, 0));
    m = glm::rotate(m, pitch, glm::vec3(1, 0, 0));
    m = glm::rotate(m, roll, glm::vec3(0, 0, 1));
    return glm::scale(m, s);
}

constexpr float kPlaza = 13.0f;   // half-size of the flat stone square
} // namespace

double Showcase::groundHeight(double x, double z) {
    const double r = std::max(std::abs(x), std::abs(z));
    const double t = smoothstep(kPlaza + 0.5, 48.0, r);
    const double n = 1.6 * std::sin(x * 0.11 + 1.3) * std::cos(z * 0.09 - 0.4) +
                     0.7 * std::sin(x * 0.23 + z * 0.19) + 0.35 * std::sin(x * 0.61 - z * 0.47);
    return t * (1.0 + n + t * 5.0) - 0.04;
}

const rendering::Mesh* Showcase::mesh(const geometry::MeshData& d) {
    m_meshes.push_back(std::make_unique<rendering::Mesh>(d));
    return m_meshes.back().get();
}

const Material* Showcase::material(Material m) {
    m_materials.push_back(std::move(m));
    return &m_materials.back();
}

void Showcase::add(const rendering::Mesh* me, const Material* mat, const glm::mat4& model, glm::vec4 params) {
    DrawItem it;
    it.mesh = me;
    it.material = mat;
    it.model = model;
    it.params = params;
    if (me == m_boxMesh) it.bevel = 0.02f;
    m_items.push_back(it);
}

Showcase::Showcase(rendering::MaterialLibrary& lib, rendering::Renderer& r, int grassBlades) {
    namespace G = geometry;

    // ---- light: late afternoon, sun low behind the colonnade ----------
    /* Chosen from a measured sweep of eight variants (sun angle x air
       density x grade): clear air, backlit. Thick haze looking into a low
       sun is physically right and reads as a white frame -- the in-scatter
       swamps the sky -- so the medium is kept thin enough that shafts
       read as shafts and the sky keeps its colour. */
    r.sun.direction = glm::normalize(glm::vec3(0.42f, 0.30f, -0.86f));
    r.sun.color = glm::vec3(1.0f, 0.80f, 0.58f);
    r.sun.intensity = 4.4f;
    r.sky.zenith = glm::vec3(0.08f, 0.20f, 0.50f);
    r.sky.horizon = glm::vec3(0.95f, 0.62f, 0.40f);
    r.sky.ground = glm::vec3(0.24f, 0.21f, 0.18f);
    r.sky.intensity = 0.8f;
    r.sky.clouds = 0.28f;
    /* The physical atmosphere: the zenith/horizon above stay as the
       fallback, but the sky drawn, reflected and used for ambient is the
       scattered one, so moving the sun moves the whole day with it. */
    r.sky.model = 1;
    r.fog.color = glm::vec3(0.92f, 0.66f, 0.46f);
    r.fog.density = 0.0016f;
    r.volumetric.densityScale = 6.0f;
    r.volumetric.intensity = 0.9f;
    r.shadows.distance = 70.0f;
    r.shadows.split = 16.0f;
    r.post.exposure = 1.05f;
    r.post.contrast = 1.10f;
    r.post.saturation = 1.12f;

    // ---- shared meshes -------------------------------------------------
    const auto* box    = mesh(G::box(1, 1, 1));
    m_boxMesh = box;
    const auto* sphere = mesh(G::sphere(0.5, 96, 144));
    const auto* column = mesh(G::cylinder(0.5, 1, 64, true));
    const auto* torus  = mesh(G::torus(0.6, 0.22, 96, 144));
    const auto* capsule = mesh(G::capsule(0.4, 1, 24, 48));
    const auto* plaza  = mesh(G::plane(2 * kPlaza, 2 * kPlaza, 1, 1, 1));
    const auto* ground = mesh(G::terrain(160, 320, [](double x, double z) { return groundHeight(x, z); }, 0.25));
    const auto* cone   = mesh(G::cone(0.5, 1, 48));

    // ---- materials -----------------------------------------------------
    Material setts = lib.textured("setts", glm::vec3(1.0f), 0.85f);
    setts.worldUv = true; setts.uvScale = 0.55f;
    Material grassGround = lib.preset("grass");
    grassGround.worldUv = true; grassGround.uvScale = 0.35f;
    Material brick = lib.preset("brick");
    brick.worldUv = true; brick.uvScale = 0.45f;
    Material marble = lib.preset("marble");
    marble.worldUv = true; marble.uvScale = 0.4f;
    Material plaster = lib.textured("plaster", srgb(0xe8dcc8), 0.9f);
    plaster.worldUv = true; plaster.uvScale = 0.5f;
    Material pool = lib.textured("smooth", srgb(0x0b1a22), 0.035f);
    pool.worldUv = true; pool.detail = 0.0f;
    Material rim = lib.preset("concrete");
    rim.worldUv = true; rim.uvScale = 0.6f;
    Material chrome = lib.preset("metal");
    chrome.color = srgb(0xf4f5f7); chrome.roughness = 0.04f;
    Material gold = lib.preset("gold");
    Material copper = lib.preset("copper");
    Material carpaint = lib.preset("carpaint");
    Material rubber = lib.preset("rubber");
    Material plastic = lib.preset("plastic");
    plastic.color = srgb(0x2f6fd0);
    Material wood = lib.preset("wood");
    Material walnut = lib.textured("walnut", glm::vec3(1.0f), 0.55f);
    Material rust = lib.preset("rust");
    Material rock = lib.preset("rock");
    Material steel = lib.preset("steel");
    steel.color = srgb(0x2a2c30); steel.roughness = 0.5f;
    Material canvas = lib.preset("canvas");
    Material brass = lib.textured("brass", glm::vec3(1.0f), 0.3f, 1.0f);
    Material lantern;
    lantern.color = srgb(0x221a10);
    lantern.emissive = srgb(0xffb45a);
    lantern.emissiveStrength = 6.0f;
    lantern.roughness = 0.3f;
    lantern.castShadow = false;
    Material grass = lib.preset("grass");
    grass.doubleSided = true;
    grass.parallax = 0.0f;

    const auto* mSetts = material(setts);
    const auto* mGround = material(grassGround);
    const auto* mBrick = material(brick);
    const auto* mMarble = material(marble);
    const auto* mPlaster = material(plaster);
    const auto* mPool = material(pool);
    const auto* mRim = material(rim);
    const auto* mChrome = material(chrome);
    const auto* mGold = material(gold);
    const auto* mCopper = material(copper);
    const auto* mCarpaint = material(carpaint);
    const auto* mRubber = material(rubber);
    const auto* mPlastic = material(plastic);
    const auto* mWood = material(wood);
    const auto* mWalnut = material(walnut);
    const auto* mRust = material(rust);
    const auto* mRock = material(rock);
    const auto* mSteel = material(steel);
    const auto* mCanvas = material(canvas);
    const auto* mBrass = material(brass);
    const auto* mLantern = material(lantern);
    const auto* mGrass = material(grass);

    // ---- ground --------------------------------------------------------
    add(ground, mGround, glm::mat4(1.0f));
    add(plaza, mSetts, trs({0, 0.02f, 0}));

    // ---- the colonnade: seven marble columns on a plinth, beam on top ---
    const float colZ = -7.0f;
    add(box, mMarble, trs({1.0f, 0.2f, colZ}, {17.0f, 0.4f, 2.4f}));
    for (int i = 0; i < 7; ++i) {
        const float x = -7.0f + i * 2.6667f;
        add(box, mMarble, trs({x, 0.55f, colZ}, {1.1f, 0.3f, 1.1f}));            // base
        add(column, mMarble, trs({x, 3.2f, colZ}, {0.72f, 5.0f, 0.72f}));        // shaft
        add(box, mMarble, trs({x, 5.85f, colZ}, {1.05f, 0.3f, 1.05f}));          // capital
    }
    add(box, mMarble, trs({1.0f, 6.35f, colZ}, {17.2f, 0.7f, 1.4f}));             // architrave

    // ---- the brick wall on the left, with a plastered doorway ----------
    const float wallX = -10.5f;
    add(box, mBrick, trs({wallX, 2.4f, -6.2f}, {0.6f, 4.8f, 8.4f}));
    add(box, mBrick, trs({wallX, 2.4f, 5.4f}, {0.6f, 4.8f, 10.8f}));
    add(box, mBrick, trs({wallX, 4.05f, -1.0f}, {0.6f, 1.5f, 2.0f}));            // over the door
    add(box, mPlaster, trs({wallX + 0.05f, 3.25f, -1.0f}, {0.72f, 0.14f, 2.3f}));   // lintel
    add(box, mPlaster, trs({wallX + 0.05f, 4.9f, -0.5f}, {0.74f, 0.2f, 22.4f}));    // coping
    add(box, mWalnut, trs({wallX - 0.05f, 1.55f, -0.35f}, {0.08f, 3.1f, 0.9f}, 0.0f, 0.0f, 0.0f)); // door, ajar

    // ---- the reflecting pool: water a hand below a low stone kerb -----
    const glm::vec3 poolC(1.5f, 0.0f, 3.4f);
    add(box, mPool, trs(poolC + glm::vec3(0, 0.07f, 0), {7.0f, 0.02f, 3.4f}));
    m_items.back().water = true;       // still water: waves, glints, reflections
    m_items.back().bevel = 0.0f;
    add(box, mRim, trs(poolC + glm::vec3(0, 0.06f, 1.9f), {7.8f, 0.12f, 0.4f}));
    add(box, mRim, trs(poolC + glm::vec3(0, 0.06f, -1.9f), {7.8f, 0.12f, 0.4f}));
    add(box, mRim, trs(poolC + glm::vec3(3.7f, 0.06f, 0), {0.4f, 0.12f, 3.4f}));
    add(box, mRim, trs(poolC + glm::vec3(-3.7f, 0.06f, 0), {0.4f, 0.12f, 3.4f}));

    // ---- hero pieces ---------------------------------------------------
    add(sphere, mChrome, trs({6.6f, 0.95f, 0.6f}, glm::vec3(1.9f)));
    add(box, mMarble, trs({6.6f, 0.0f, 0.6f}, {1.2f, 0.1f, 1.2f}));
    add(torus, mCopper, trs({-2.4f, 0.95f, 5.6f}, glm::vec3(1.15f), 0.6f, glm::half_pi<float>()));
    add(capsule, mCarpaint, trs({8.3f, 0.45f, 5.2f}, {1.1f, 1.1f, 1.1f}, 0.4f, 0.0f, glm::half_pi<float>()));

    // ---- the swatch row: every preset worth seeing, on plinths ---------
    const Material* swatches[] = {mChrome, mGold, mCopper, mBrass, mCarpaint, mPlastic,
                                  mRubber, mMarble, mWood, mRust, mCanvas, mBrick};
    for (int i = 0; i < 12; ++i) {
        const float x = -6.9f + i * 1.25f;
        const float z = -3.2f;
        add(box, mRim, trs({x, 0.35f, z}, {0.9f, 0.7f, 0.9f}));
        add(sphere, swatches[i], trs({x, 1.12f, z}, glm::vec3(0.8f)));
    }

    // ---- crates, a barrel, a tarp-covered stack by the wall ------------
    add(box, mWood, trs({-8.4f, 0.5f, 3.6f}, glm::vec3(1.0f), 0.2f));
    add(box, mWood, trs({-8.2f, 1.45f, 3.5f}, glm::vec3(0.9f), -0.25f));
    add(box, mWood, trs({-8.6f, 0.4f, 5.0f}, glm::vec3(0.8f), 0.7f));
    add(column, mRust, trs({-7.2f, 0.55f, 6.4f}, {0.62f, 1.1f, 0.62f}));
    add(column, mRust, trs({-6.5f, 0.55f, 6.9f}, {0.62f, 1.1f, 0.62f}, 1.0f));
    add(box, mCanvas, trs({-8.5f, 0.55f, 8.6f}, {1.6f, 1.1f, 1.8f}, 0.1f));

    // ---- lanterns on iron posts ----------------------------------------
    const glm::vec3 lamps[] = {{-7.0f, 0, 10.5f}, {7.0f, 0, 10.5f}, {-9.2f, 0, -3.0f}, {10.5f, 0, -3.5f}};
    for (const auto& l : lamps) {
        add(column, mSteel, trs(l + glm::vec3(0, 1.4f, 0), {0.1f, 2.8f, 0.1f}));
        add(cone, mSteel, trs(l + glm::vec3(0, 3.18f, 0), {0.5f, 0.3f, 0.5f}));
        add(sphere, mLantern, trs(l + glm::vec3(0, 2.9f, 0), glm::vec3(0.34f)));
        rendering::PointLight pl;
        pl.position = l + glm::vec3(0, 2.9f, 0);
        pl.radius = 9.0f;
        pl.color = glm::vec3(1.0f, 0.68f, 0.36f);
        pl.intensity = 3.0f;
        r.lights.push_back(pl);
    }

    // ---- rocks where the stone meets the grass ------------------------
    Rng rng(20260925u);
    for (int i = 0; i < 26; ++i) {
        const auto* rk = mesh(G::rock(0.5, 11u + static_cast<uint32_t>(i) * 7u, 2));
        const float side = rng.next();
        float x, z;
        if (side < 0.5f) { x = rng.range(-kPlaza, kPlaza); z = (rng.next() < 0.5f ? -1.0f : 1.0f) * (kPlaza + rng.range(0.4f, 5.0f)); }
        else             { z = rng.range(-kPlaza, kPlaza); x = (rng.next() < 0.5f ? -1.0f : 1.0f) * (kPlaza + rng.range(0.4f, 5.0f)); }
        const float s = rng.range(0.5f, 2.4f);
        const float y = static_cast<float>(groundHeight(x, z)) + s * 0.18f;
        add(rk, mRock, trs({x, y, z}, {s, s * rng.range(0.55f, 0.9f), s * rng.range(0.8f, 1.2f)},
                           rng.range(0.0f, 6.28f)));
    }

    // ---- grass: instanced, swaying, on the slopes ----------------------
    if (grassBlades > 0) {
        const auto* blade = mesh(G::grassBlade(0.55, 0.06, 4));
        m_instances.emplace_back();
        auto& inst = m_instances.back();
        inst.reserve(static_cast<size_t>(grassBlades));
        while (static_cast<int>(inst.size()) < grassBlades) {
            const float x = rng.range(-60.0f, 60.0f), z = rng.range(-60.0f, 60.0f);
            if (std::max(std::abs(x), std::abs(z)) < kPlaza + 0.3f) continue;
            // Denser near the plaza where the camera is.
            const float d = std::max(std::abs(x), std::abs(z)) - kPlaza;
            if (rng.next() > 1.0f / (1.0f + d * 0.06f)) continue;
            Instance in;
            const float h = rng.range(0.6f, 1.5f);
            in.model = trs({x, static_cast<float>(groundHeight(x, z)), z}, {1.0f, h, 1.0f}, rng.range(0.0f, 6.28f));
            const float g = rng.range(0.75f, 1.1f);
            in.params = glm::vec4(g * rng.range(0.85f, 1.05f), g, g * rng.range(0.7f, 0.95f), rng.next());
            inst.push_back(in);
        }
        DrawItem it;
        it.mesh = blade;
        it.material = mGrass;
        it.instances = &inst;
        it.grass = true;
        m_items.push_back(it);
    }
}

std::vector<std::string> Showcase::shotNames() {
    return {"hero", "swatches", "wall", "pool", "aerial", "columns"};
}

Camera Showcase::shot(const std::string& n) const {
    Camera c;
    c.farZ = 400.0f;
    if (n == "hero")          { c.position = {-3.2f, 1.75f, 13.0f}; c.target = {2.4f, 2.6f, -6.0f}; c.fov = glm::radians(52.0f); }
    else if (n == "swatches") { c.position = {-0.4f, 1.55f, 0.2f};  c.target = {-0.4f, 1.0f, -3.2f}; c.fov = glm::radians(62.0f); }
    else if (n == "wall")     { c.position = {-8.9f, 1.6f, 9.5f};   c.target = {-10.2f, 1.9f, -2.0f}; c.fov = glm::radians(50.0f); }
    else if (n == "pool")     { c.position = {1.3f, 1.25f, 8.4f};   c.target = {1.6f, 1.6f, -7.0f}; c.fov = glm::radians(55.0f); }
    else if (n == "aerial")   { c.position = {18.0f, 14.0f, 20.0f}; c.target = {-1.0f, 0.5f, -1.0f}; c.fov = glm::radians(48.0f); }
    else if (n == "columns")  { c.position = {6.0f, 1.4f, -1.5f};   c.target = {-6.0f, 3.5f, -7.5f}; c.fov = glm::radians(58.0f); }
    else throw std::invalid_argument("unknown shot '" + n + "'");
    return c;
}

} // namespace game::scene
