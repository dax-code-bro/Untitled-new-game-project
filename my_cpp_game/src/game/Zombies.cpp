#include "game/Zombies.hpp"
#include "game/Lesc.hpp"
#include "geometry/Shapes.hpp"

#include <glm/gtc/matrix_transform.hpp>

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <cstdlib>

namespace game::play {

namespace {

constexpr float kPi = 3.14159265358979f;
constexpr float kRadius = 0.32f;        // the player's body
constexpr float kHeight = 1.78f;
constexpr float kStepUp = 0.45f;
constexpr float kGravity = -19.6f;      // the web game's
constexpr float kJump = 6.2f;

/* The web game's numbers (site/games/bunker-nine.js, PLAYER and ROUNDS). */
constexpr float kWalk = 4.2f, kSprint = 7.4f, kAdsSpeed = 2.3f;
constexpr float kRegenDelay = 2.0f, kRegenRate = 55.0f;
int   countFor(int r) { return std::min(4 + static_cast<int>(std::ceil(r * 2.6)), 33); }
float hpFor(int r) { return r <= 9 ? 110.0f + (r - 1) * 55.0f : 550.0f * std::pow(1.09f, static_cast<float>(r - 9)); }
float dmgFor(int r) { return std::min(60.0f, 18.0f + (r - 1) * 2.4f); }
int   maxAlive(int r) { return std::min(7 + r, 13); }
float spawnGap(int r) { return std::max(2.6f - r * 0.12f, 0.9f); }
constexpr float kLull = 8.0f;

glm::vec3 vec3(const nlohmann::json& j) { return {j.at(0).get<float>(), j.at(1).get<float>(), j.at(2).get<float>()}; }
float wrapPi(float a) {
    while (a > kPi) a -= 2 * kPi;
    while (a < -kPi) a += 2 * kPi;
    return a;
}

} // namespace

ZombiesGame::ZombiesGame(const Lesc& scene, const KitFile& kit, const rendering::Camera& start, uint32_t seed)
    : m_world(scene), m_kit(kit), m_rng(seed) {
    m_bodies = kit.zombies();
    if (m_bodies.empty()) throw std::runtime_error("zombies: the kit has no zombie rigs");
    const auto& gp = scene.doc.at("gameplay");
    for (const auto& jw : gp.at("windows")) {
        Window w;
        w.id = jw.at("id").get<std::string>();
        w.pad = vec3(jw.at("pad"));
        w.sill = vec3(jw.at("sill"));
        w.inside = vec3(jw.at("inside"));
        w.active = jw.value("active", true);
        // Just outside the sill, on the ground.
        glm::vec2 d(w.sill.x - w.inside.x, w.sill.z - w.inside.z);
        if (glm::length(d) < 1e-3f) d = glm::vec2(w.pad.x - w.sill.x, w.pad.z - w.sill.z);
        d = glm::normalize(d);
        w.outside = {w.sill.x + d.x * 0.9f, 0.0f, w.sill.z + d.y * 0.9f};
        w.outside.y = groundAt({w.outside.x, w.sill.y + 0.2f, w.outside.z}, w.pad.y);
        w.pad.y = groundAt({w.pad.x, w.pad.y + 3.0f, w.pad.z}, w.pad.y);
        w.inside.y = groundAt({w.inside.x, w.inside.y + 1.0f, w.inside.z}, w.inside.y);
        m_windows.push_back(w);
    }
    if (std::none_of(m_windows.begin(), m_windows.end(), [](const Window& w) { return w.active; }))
        for (auto& w : m_windows) w.active = true;

    // Where the player starts: the web game's own opening view.
    const glm::vec3 eyeP = start.position;
    const glm::vec3 d = glm::normalize(start.target - start.position);
    m_spawnYaw = std::atan2(d.x, -d.z);
    m_spawn = {eyeP.x, groundAt(eyeP + glm::vec3(0, 0.2f, 0), eyeP.y - m_eyeH), eyeP.z};

    // The walkable grid, over everything the zombies and the player can reach.
    glm::vec3 lo = m_spawn, hi = m_spawn;
    for (const auto& w : m_windows) {
        for (const glm::vec3& p : {w.pad, w.sill, w.inside, w.outside}) { lo = glm::min(lo, p); hi = glm::max(hi, p); }
    }
    lo -= glm::vec3(10.0f, 3.0f, 10.0f);
    hi += glm::vec3(10.0f, 8.0f, 10.0f);
    lo = glm::max(lo, m_world.boundsMin() - glm::vec3(1.0f));
    hi = glm::min(hi, m_world.boundsMax() + glm::vec3(1.0f));
    m_nav = std::make_unique<NavGrid>(m_world, lo, hi, 0.5f);

    // The guns, in slot order, from whatever the kit recorded.
    for (const char* id : {"m1911", "thompson", "scatter"}) {
        const auto it = kit.weapons().find(id);
        const KitRig* rig = kit.rig(id);
        if (it == kit.weapons().end() || !rig || !rig->clip("idle")) continue;
        Gun g;
        g.def = &it->second;
        g.rig = rig;
        m_guns.push_back(g);
    }
    if (m_guns.empty()) throw std::runtime_error("zombies: the kit has no viewmodels");

    // Effects.
    m_sphere = std::make_unique<rendering::Mesh>(geometry::sphere(0.5, 10, 14));
    m_bloodMat.color = {0.22f, 0.012f, 0.008f};
    m_bloodMat.roughness = 0.25f;
    m_bloodMat.castShadow = false;
    m_dustMat.color = {0.32f, 0.30f, 0.27f};
    m_dustMat.roughness = 1.0f;
    m_dustMat.castShadow = false;
    m_flashMat.color = {1.0f, 0.75f, 0.4f};
    m_flashMat.emissive = {1.0f, 0.62f, 0.25f};
    m_flashMat.emissiveStrength = 9.0f;
    m_flashMat.castShadow = false;
    m_flashMat.receiveShadow = false;
    restart();
}

float ZombiesGame::groundAt(const glm::vec3& p, float fallback) const {
    CollisionWorld::Hit h;
    if (m_world.raycast(p, {0.0f, -1.0f, 0.0f}, 40.0f, h)) return h.point.y;
    return fallback;
}

bool ZombiesGame::canSee(const glm::vec3& a, const glm::vec3& b) const {
    CollisionWorld::Hit h;
    const glm::vec3 d = b - a;
    const float L = glm::length(d);
    return !m_world.raycast(a, d, L - 0.05f, h);
}

glm::vec3 ZombiesGame::eye() const { return m_pos + glm::vec3(0.0f, m_eyeH, 0.0f); }

glm::vec3 ZombiesGame::aimDir() const {
    const float p = m_pitch + m_recoilPitch, y = m_yaw + m_recoilYaw;
    return {std::sin(y) * std::cos(p), std::sin(p), -std::cos(y) * std::cos(p)};
}

void ZombiesGame::restart() {
    m_zombies.clear();
    m_puffs.clear();
    m_pos = m_spawn;
    m_vel = glm::vec3(0.0f);
    m_yaw = m_spawnYaw;
    m_pitch = 0.0f;
    m_health = 100.0f;
    m_deadT = 0.0f;
    m_stats.points = 500;
    m_stats.kills = m_stats.headshots = 0;
    for (auto& g : m_guns) { g.mag = g.def->mag; g.reserve = g.def->reserve; }
    m_slot = 0;
    m_reloadT = -1.0f;
    m_swapT = 0.0f;
    startRound(1);
}

void ZombiesGame::startRound(int n) {
    m_stats.round = n;
    m_toSpawn = countFor(n);
    m_spawnT = 2.5f;
    m_roundBanner = 4.0f;
    m_intermission = 0.0f;
    // A new round tops the reserve up: there is no wall buy or Max Ammo here.
    if (n > 1) for (auto& g : m_guns) g.reserve = std::max(g.reserve, g.def->reserve);
}

void ZombiesGame::spawnZombie() {
    std::vector<int> act;
    for (int i = 0; i < static_cast<int>(m_windows.size()); ++i) if (m_windows[static_cast<size_t>(i)].active) act.push_back(i);
    if (act.empty()) return;
    // The window nearest the player more often than not, so they come at you.
    std::uniform_real_distribution<float> U(0.0f, 1.0f);
    int wi = act[static_cast<size_t>(m_nextWindow++ % static_cast<int>(act.size()))];
    if (U(m_rng) < 0.5f) {
        float bd = 1e30f;
        for (int i : act) {
            const float d = glm::length(m_windows[static_cast<size_t>(i)].inside - m_pos) + U(m_rng) * 6.0f;
            if (d < bd) { bd = d; wi = i; }
        }
    }
    const Window& w = m_windows[static_cast<size_t>(wi)];
    Zombie z;
    z.rig = m_bodies[static_cast<size_t>(m_nextBody++ % static_cast<int>(m_bodies.size()))];
    z.window = wi;
    const float a = U(m_rng) * 2 * kPi, r = U(m_rng) * 2.5f;
    z.pos = w.pad + glm::vec3(std::cos(a) * r, 0.0f, std::sin(a) * r);
    z.pos.y = groundAt(z.pos + glm::vec3(0, 3.0f, 0), w.pad.y);
    z.hp = hpFor(m_stats.round);
    const int R = m_stats.round;
    if (R <= 2) z.speed = 0.9f + U(m_rng) * 0.5f;
    else if (R <= 5) z.speed = U(m_rng) < 0.5f ? 1.2f + U(m_rng) * 0.6f : 2.2f + U(m_rng) * 0.6f;
    else z.speed = U(m_rng) < 0.25f ? 1.6f : 3.0f + U(m_rng) * 1.3f;
    z.runner = z.speed > 2.0f && z.rig->clip("zrun");
    const glm::vec3 to = w.outside - z.pos;
    z.yaw = std::atan2(to.x, to.z);
    z.animT = U(m_rng) * 2.0f;
    z.death = U(m_rng) < 0.5f ? "zdie_back" : "zdie_face";
    m_zombies.push_back(z);
    ++m_stats.spawned;
}

void ZombiesGame::hurtPlayer(float dmg) {
    if (m_health <= 0.0f) return;
    m_health -= dmg;
    m_hurtT = 0.6f;
    m_regenT = kRegenDelay;
    if (m_health <= 0.0f) {
        m_health = 0.0f;
        m_deadT = 0.0f;
        ++m_stats.downs;
    }
}

void ZombiesGame::update(float dt, const Input& in) {
    m_time += dt;
    m_hitMarkT += dt;
    m_flashT += dt;
    for (auto& p : m_popups) p.second += dt;
    m_popups.erase(std::remove_if(m_popups.begin(), m_popups.end(), [](const auto& p) { return p.second > 1.2f; }),
                   m_popups.end());
    if (m_health <= 0.0f) {
        m_deadT += dt;
        if (m_deadT > 6.0f || (m_deadT > 1.5f && in.restartPressed)) restart();
        updateZombies(dt);
        return;
    }
    updatePlayer(dt, in);
    updateWeapon(dt, in);

    // The round.
    m_roundBanner = std::max(0.0f, m_roundBanner - dt);
    int alive = 0;
    for (const auto& z : m_zombies) if (z.state != Zombie::Dying && z.state != Zombie::Gone) ++alive;
    m_stats.alive = alive;
    m_stats.maxAlive = std::max(m_stats.maxAlive, alive);
    if (m_toSpawn > 0) {
        m_spawnT -= dt;
        if (m_spawnT <= 0.0f && alive < maxAlive(m_stats.round)) {
            spawnZombie();
            --m_toSpawn;
            m_spawnT = spawnGap(m_stats.round);
        }
    } else if (alive == 0) {
        m_intermission += dt;
        if (m_intermission > kLull) startRound(m_stats.round + 1);
    }
    // Health comes back once you stop being hit.
    m_regenT -= dt;
    m_hurtT = std::max(0.0f, m_hurtT - dt);
    if (m_regenT <= 0.0f) m_health = std::min(100.0f, m_health + kRegenRate * dt);

    m_flowT -= dt;
    if (m_flowT <= 0.0f) { m_nav->flowTo(m_pos); m_flowT = 0.25f; }
    updateZombies(dt);

    for (auto& p : m_puffs) { p.t += dt; p.vel.y -= 4.0f * dt; p.pos += p.vel * dt; }
    m_puffs.erase(std::remove_if(m_puffs.begin(), m_puffs.end(), [](const Puff& p) { return p.t > p.life; }), m_puffs.end());
    m_stats.health = m_health;
}

void ZombiesGame::updatePlayer(float dt, const Input& in) {
    m_yaw = wrapPi(m_yaw + in.look.x);
    m_pitch = std::clamp(m_pitch + in.look.y, -1.45f, 1.45f);
    m_sway = glm::mix(m_sway, glm::vec2(in.look.x, in.look.y) / std::max(dt, 1e-4f) * 0.004f, std::min(1.0f, dt * 10.0f));

    const glm::vec3 fwd(std::sin(m_yaw), 0.0f, -std::cos(m_yaw)), right(std::cos(m_yaw), 0.0f, std::sin(m_yaw));
    glm::vec2 mv = in.move;
    if (glm::length(mv) > 1.0f) mv = glm::normalize(mv);
    const bool sprinting = in.sprint && mv.y > 0.3f && m_ads < 0.2f && m_reloadT < 0.0f;
    const float speed = sprinting ? kSprint : glm::mix(kWalk, kAdsSpeed, m_ads);
    const glm::vec3 want = (fwd * mv.y + right * mv.x) * speed;
    const float accel = m_grounded ? 14.0f : 3.0f;
    m_vel.x += (want.x - m_vel.x) * std::min(1.0f, accel * dt);
    m_vel.z += (want.z - m_vel.z) * std::min(1.0f, accel * dt);
    if (m_grounded && in.jumpPressed) { m_vel.y = kJump; m_grounded = false; }
    m_vel.y += kGravity * dt;

    // Move in small steps so a fast body never passes through a thin wall.
    const glm::vec3 delta = m_vel * dt;
    const int n = std::max(1, static_cast<int>(std::ceil(glm::length(delta) / 0.08f)));
    const bool wasGrounded = m_grounded;
    for (int s = 0; s < n; ++s) {
        m_pos += delta / static_cast<float>(n);
        // The body is spheres from the knee up; the feet are a ray, so a step is walked up, not into.
        for (float h : {kStepUp + kRadius, (kStepUp + kHeight) * 0.5f, kHeight - kRadius}) {
            glm::vec3 c = m_pos + glm::vec3(0.0f, h, 0.0f);
            glm::vec3 fn;
            if (m_world.resolveSphere(c, kRadius, &fn)) {
                const glm::vec3 push = c - (m_pos + glm::vec3(0.0f, h, 0.0f));
                m_pos += push;
                if (push.y < -1e-4f && m_vel.y > 0.0f) m_vel.y = 0.0f;   // head on a ceiling
            }
        }
    }
    // Ground: the highest of five rays under the feet.
    float best = -1e30f;
    for (const glm::vec2 o : {glm::vec2(0.0f), glm::vec2(0.2f, 0.0f), glm::vec2(-0.2f, 0.0f), glm::vec2(0.0f, 0.2f), glm::vec2(0.0f, -0.2f)}) {
        CollisionWorld::Hit h;
        const glm::vec3 from = m_pos + glm::vec3(o.x, kStepUp + 0.05f, o.y);
        if (m_world.raycast(from, {0.0f, -1.0f, 0.0f}, kStepUp + 0.05f + (wasGrounded ? 0.35f : 0.02f), h) && h.normal.y > 0.65f)
            best = std::max(best, h.point.y);
    }
    if (best > -1e29f && m_vel.y <= 0.5f) {
        if (!wasGrounded && m_vel.y < -6.0f) m_landKick = std::min(1.0f, -m_vel.y / 14.0f);
        m_pos.y = best;
        m_vel.y = 0.0f;
        m_grounded = true;
    } else {
        m_grounded = false;
    }
    if (m_pos.y < m_world.boundsMin().y - 20.0f) { m_pos = m_spawn; m_vel = glm::vec3(0.0f); }

    const float hs = glm::length(glm::vec2(m_vel.x, m_vel.z));
    m_bobAmp = glm::mix(m_bobAmp, m_grounded ? std::min(1.0f, hs / kWalk) : 0.0f, std::min(1.0f, dt * 8.0f));
    m_bob += dt * hs * 1.9f;
    m_landKick = std::max(0.0f, m_landKick - dt * 3.0f);
}

void ZombiesGame::updateWeapon(float dt, const Input& in) {
    Gun& g = m_guns[static_cast<size_t>(m_slot)];
    const WeaponDef& w = *g.def;
    m_cool -= dt;
    m_fireT += dt;
    // ADS.
    const bool wantAds = in.aim && m_swapT <= 0.0f;
    m_ads = std::clamp(m_ads + (wantAds ? 1.0f : -1.0f) * dt / std::max(0.08f, w.adsTime), 0.0f, 1.0f);
    // Recoil recovers; the kick spring settles.
    m_recoilPitch -= m_recoilPitch * std::min(1.0f, w.recover * 0.5f * dt);
    m_recoilYaw -= m_recoilYaw * std::min(1.0f, w.recover * 0.5f * dt);
    m_kickVel += (-m_kick * 260.0f - m_kickVel * 26.0f) * dt;
    m_kick += m_kickVel * dt;

    // Switching: lower the gun (0.25 s), change, raise it (0.25 s).
    int want = -1;
    if (in.weaponSlot >= 0 && in.weaponSlot < static_cast<int>(m_guns.size()) && in.weaponSlot != m_slot) want = in.weaponSlot;
    if (in.weaponCycle != 0 && m_guns.size() > 1)
        want = (m_slot + in.weaponCycle + static_cast<int>(m_guns.size())) % static_cast<int>(m_guns.size());
    if (want >= 0 && m_swapT <= 0.0f) { m_nextSlot = want; m_swapT = 0.5f; m_reloadT = -1.0f; }
    if (m_swapT > 0.0f) {
        const float before = m_swapT;
        m_swapT -= dt;
        if (before > 0.25f && m_swapT <= 0.25f && m_nextSlot >= 0) { m_slot = m_nextSlot; m_nextSlot = -1; m_fireT = 99.0f; }
        if (m_swapT < 0.0f) m_swapT = 0.0f;
        return;
    }

    // Reload: as long as the recorded reload runs, the rounds go in at the end.
    if (m_reloadT >= 0.0f) {
        m_reloadT += dt;
        if (m_reloadT >= m_reloadDur) {
            const int need = w.mag - g.mag, take = std::min(need, g.reserve);
            g.mag += take;
            g.reserve -= take;
            m_reloadT = -1.0f;
        }
        return;
    }
    const bool canReload = g.mag < w.mag && g.reserve > 0;
    if ((in.reloadPressed && canReload) || (g.mag == 0 && canReload && (in.firePressed || in.fire))) {
        const KitClip* rc = g.rig->clip("reload");
        m_reloadDur = rc && rc->duration() > 0.3f ? rc->duration() : w.reload;
        m_reloadT = 0.0f;
        return;
    }
    if (!in.fire) m_triggerUp = true;
    const bool pull = w.automatic ? in.fire : (in.firePressed || (in.fire && m_triggerUp));
    if (pull && m_cool <= 0.0f && g.mag > 0) {
        m_triggerUp = false;
        fire();
        --g.mag;
        m_cool = w.refire;
    }
}

void ZombiesGame::fire() {
    const Gun& g = m_guns[static_cast<size_t>(m_slot)];
    const WeaponDef& w = *g.def;
    std::uniform_real_distribution<float> U(-1.0f, 1.0f);
    const float spreadDeg = w.spread * glm::mix(1.0f, w.adsSpread > 0 ? w.adsSpread : 0.28f, m_ads) +
                            glm::length(glm::vec2(m_vel.x, m_vel.z)) * 0.15f;
    const glm::vec3 o = eye();
    const glm::vec3 f = aimDir();
    const glm::vec3 r = glm::normalize(glm::cross(f, glm::vec3(0, 1, 0)));
    const glm::vec3 u = glm::cross(r, f);
    ++m_stats.shots;
    bool anyHit = false;
    // Damage per zombie this shot, so a shotgun's pellets add up into one kill.
    std::vector<float> dmg(m_zombies.size(), 0.0f);
    std::vector<char> head(m_zombies.size(), 0);
    for (int p = 0; p < std::max(1, w.pellets); ++p) {
        float a = U(m_rng), b = U(m_rng);
        if (a * a + b * b > 1.0f) { a *= 0.7f; b *= 0.7f; }
        const float s = std::tan(glm::radians(spreadDeg));
        const glm::vec3 d = glm::normalize(f + (r * a + u * b) * s);
        CollisionWorld::Hit wh;
        float maxT = 120.0f;
        const bool wall = m_world.raycast(o, d, maxT, wh);
        if (wall) maxT = wh.t;
        // The zombies: a head, a chest and a body of spheres along the root's up axis.
        int hitZ = -1;
        bool hitHead = false;
        float hitT = maxT;
        glm::vec3 hitP(0.0f);
        for (size_t k = 0; k < m_zombies.size(); ++k) {
            const Zombie& z = m_zombies[k];
            if (z.state == Zombie::Dying || z.state == Zombie::Gone || z.state == Zombie::Rising) continue;
            const float H = z.rig->height;
            struct S { float y, r; bool head; };
            const S parts[] = {{H * 0.92f, 0.13f, true}, {H * 0.72f, 0.24f, false}, {H * 0.52f, 0.23f, false},
                               {H * 0.30f, 0.20f, false}, {H * 0.12f, 0.17f, false}};
            for (const S& sp : parts) {
                const glm::vec3 c = z.pos + glm::vec3(0.0f, sp.y, 0.0f);
                const glm::vec3 oc = o - c;
                const float bb = glm::dot(oc, d), cc = glm::dot(oc, oc) - sp.r * sp.r, disc = bb * bb - cc;
                if (disc < 0.0f) continue;
                const float t = -bb - std::sqrt(disc);
                if (t > 0.0f && t < hitT) { hitT = t; hitZ = static_cast<int>(k); hitHead = sp.head; hitP = o + d * t; }
            }
        }
        if (hitZ >= 0) {
            dmg[static_cast<size_t>(hitZ)] += w.damage * (hitHead ? w.headMul : 1.0f);
            if (hitHead) head[static_cast<size_t>(hitZ)] = 1;
            anyHit = true;
            for (int k = 0; k < 4; ++k)
                m_puffs.push_back({hitP, (-d * 0.8f + glm::vec3(U(m_rng), U(m_rng) + 0.6f, U(m_rng))) * 1.4f, 0.0f, 0.45f, 0.035f, true});
        } else if (wall) {
            for (int k = 0; k < 3; ++k)
                m_puffs.push_back({wh.point + wh.normal * 0.02f, (wh.normal + glm::vec3(U(m_rng), U(m_rng), U(m_rng)) * 0.5f) * 1.2f,
                                   0.0f, 0.35f, 0.03f, false});
        }
    }
    for (size_t k = 0; k < m_zombies.size(); ++k) {
        if (dmg[k] <= 0.0f) continue;
        Zombie& z = m_zombies[k];
        z.hp -= dmg[k];
        z.hurtT = 0.15f;
        m_stats.points += 10;
        if (z.hp <= 0.0f) {
            z.state = Zombie::Dying;
            z.stateT = 0.0f;
            z.headDeath = head[k];
            ++m_stats.kills;
            if (head[k]) ++m_stats.headshots;
            const int pts = head[k] ? 100 : 60;
            m_stats.points += pts;
            m_popups.emplace_back("+" + std::to_string(pts + 10), 0.0f);
        } else {
            m_popups.emplace_back("+10", 0.0f);
        }
    }
    if (anyHit) { ++m_stats.hits; m_hitMarkT = 0.0f; }
    // Recoil: the camera climbs, the gun drives back.
    m_recoilPitch += glm::radians(w.recoilUp) * (1.0f - 0.45f * m_ads);
    m_recoilYaw += glm::radians(w.recoilSide) * U(m_rng) * (1.0f - 0.45f * m_ads);
    m_kickVel += 2.4f * w.kick;
    m_fireT = 0.0f;
    m_flashT = 0.0f;
}

void ZombiesGame::updateZombies(float dt) {
    std::uniform_real_distribution<float> U(0.0f, 1.0f);
    const float dmg = dmgFor(m_stats.round);
    for (size_t k = 0; k < m_zombies.size(); ++k) {
        Zombie& z = m_zombies[k];
        z.stateT += dt;
        z.hurtT = std::max(0.0f, z.hurtT - dt);
        z.attackCd -= dt;
        const Window& w = m_windows[static_cast<size_t>(z.window)];
        glm::vec3 goal = z.pos;
        float speed = z.speed;
        bool walking = true;
        switch (z.state) {
            case Zombie::Rising:
                walking = false;
                if (z.stateT > 1.4f) { z.state = Zombie::Approach; z.stateT = 0.0f; }
                break;
            case Zombie::Approach:
                goal = w.outside;
                if (glm::length(glm::vec2(goal.x - z.pos.x, goal.z - z.pos.z)) < 0.35f) { z.state = Zombie::Tear; z.stateT = 0.0f; }
                break;
            case Zombie::Tear: {   // at the barricade: tearing at the boards
                walking = false;
                const glm::vec3 to = w.inside - z.pos;
                z.yaw = std::atan2(to.x, to.z);
                if (z.stateT > 1.6f) { z.state = Zombie::Climb; z.stateT = 0.0f; }
                break;
            }
            case Zombie::Climb: {   // over the sill: up, across, down
                walking = false;
                const float T = 1.3f, t = std::min(1.0f, z.stateT / T);
                const glm::vec3 a = w.outside, b = w.inside;
                z.pos = glm::mix(a, b, t);
                const float sillUp = std::max(0.0f, w.sill.y - 0.9f - std::max(a.y, b.y));
                z.pos.y = glm::mix(a.y, b.y, t) + std::sin(t * kPi) * (sillUp + 0.15f);
                if (t >= 1.0f) { z.state = Zombie::Hunt; z.stateT = 0.0f; ++m_stats.climbed; }
                break;
            }
            case Zombie::Hunt: {
                const float d = glm::length(m_pos - z.pos);
                goal = (d < 3.0f && canSee(z.pos + glm::vec3(0, 1.2f, 0), eye())) ? m_pos : m_nav->steer(z.pos);
                if (d < 1.15f && std::fabs(m_pos.y - z.pos.y) < 1.2f && m_health > 0.0f && z.attackCd <= 0.0f) {
                    z.state = Zombie::Attack;
                    z.stateT = 0.0f;
                    z.struck = false;
                }
                break;
            }
            case Zombie::Attack: {
                walking = false;
                const glm::vec3 to = m_pos - z.pos;
                z.yaw = std::atan2(to.x, to.z);
                const KitClip* c = z.rig->clip("attack");
                const float dur = c ? c->duration() : 0.6f;
                if (!z.struck && z.stateT > dur * 0.5f) {
                    z.struck = true;
                    if (glm::length(to) < 1.45f && std::fabs(to.y) < 1.2f) hurtPlayer(dmg);
                }
                if (z.stateT >= dur) { z.state = Zombie::Hunt; z.stateT = 0.0f; z.attackCd = 0.35f; }
                break;
            }
            case Zombie::Dying:
                walking = false;
                if (z.stateT > 7.0f) z.state = Zombie::Gone;
                break;
            case Zombie::Gone:
                walking = false;
                break;
        }
        if (walking) {
            glm::vec3 to = goal - z.pos;
            to.y = 0.0f;
            const float L = glm::length(to);
            if (L > 1e-3f) {
                const glm::vec3 dir = to / L;
                const float want = std::atan2(dir.x, dir.z);
                z.yaw += wrapPi(want - z.yaw) * std::min(1.0f, dt * 6.0f);
                const glm::vec3 fwd(std::sin(z.yaw), 0.0f, std::cos(z.yaw));
                z.pos += fwd * std::min(L, speed * dt);
            }
            // Keep apart from each other, out of the walls, on the floor.
            for (size_t j = 0; j < m_zombies.size(); ++j) {
                if (j == k) continue;
                const Zombie& o = m_zombies[j];
                if (o.state == Zombie::Dying || o.state == Zombie::Gone || o.state == Zombie::Climb) continue;
                glm::vec3 v = z.pos - o.pos;
                v.y = 0.0f;
                const float dd = glm::length(v);
                if (dd < 0.62f && dd > 1e-4f) z.pos += v / dd * (0.62f - dd) * 0.5f;
            }
            {
                glm::vec3 v = z.pos - m_pos;
                v.y = 0.0f;
                const float dd = glm::length(v);
                if (dd < 0.7f && dd > 1e-4f && m_health > 0.0f) z.pos += v / dd * (0.7f - dd);
            }
            glm::vec3 c = z.pos + glm::vec3(0.0f, 0.95f, 0.0f);
            m_world.resolveSphere(c, 0.26f);
            z.pos.x = c.x;
            z.pos.z = c.z;
            CollisionWorld::Hit h;
            if (m_world.raycast(z.pos + glm::vec3(0.0f, 0.5f, 0.0f), {0.0f, -1.0f, 0.0f}, 1.6f, h)) {
                z.pos.y += (h.point.y - z.pos.y) * std::min(1.0f, dt * 14.0f);
            }
            // The walk is played at the rate the body is actually moving.
            z.animT += dt * (z.runner ? std::max(0.6f, speed / 3.4f) : std::max(0.5f, speed / 1.15f));
        }
    }
    m_zombies.erase(std::remove_if(m_zombies.begin(), m_zombies.end(), [](const Zombie& z) { return z.state == Zombie::Gone; }),
                    m_zombies.end());
}

Input ZombiesGame::autopilot(float dt) {
    Input in;
    if (m_health <= 0.0f) { in.restartPressed = true; return in; }
    m_botScan -= dt;
    if (m_botScan <= 0.0f) {
        m_botScan = 0.2f;
        m_botTarget = -1;
        float bd = 1e30f;
        for (size_t k = 0; k < m_zombies.size(); ++k) {
            const Zombie& z = m_zombies[k];
            if (z.state == Zombie::Dying || z.state == Zombie::Gone || z.state == Zombie::Rising) continue;
            const glm::vec3 c = z.pos + glm::vec3(0.0f, z.rig->height * 0.7f, 0.0f);
            const float d = glm::length(c - eye());
            if (d < bd && d < 45.0f && canSee(eye(), c)) { bd = d; m_botTarget = static_cast<int>(k); }
        }
    }
    const Gun& g = m_guns[static_cast<size_t>(m_slot)];
    if (m_botTarget >= 0 && m_botTarget < static_cast<int>(m_zombies.size())) {
        const Zombie& z = m_zombies[static_cast<size_t>(m_botTarget)];
        const glm::vec3 c = z.pos + glm::vec3(0.0f, z.rig->height * 0.78f, 0.0f);
        const glm::vec3 d = glm::normalize(c - eye());
        const float wantYaw = std::atan2(d.x, -d.z), wantPitch = std::asin(std::clamp(d.y, -1.0f, 1.0f));
        const float ey = wrapPi(wantYaw - (m_yaw + m_recoilYaw)), ep = wantPitch - (m_pitch + m_recoilPitch);
        in.look = {ey * std::min(1.0f, dt * 9.0f), ep * std::min(1.0f, dt * 9.0f)};
        const float dist = glm::length(c - eye());
        in.aim = dist > 6.0f;
        const bool onTarget = std::fabs(ey) < 0.05f && std::fabs(ep) < 0.05f;
        in.fire = onTarget && g.mag > 0;
        in.firePressed = in.fire && m_triggerUp;
        if (dist < 3.0f) in.move.y = -1.0f;   // back off
    } else {
        in.look.x = dt * 0.4f;   // look around
        if (g.mag < g.def->mag) in.reloadPressed = true;
    }
    if (g.mag == 0) in.reloadPressed = true;
    // Use the gun with ammo in it.
    if (g.mag == 0 && g.reserve == 0)
        for (size_t s = 0; s < m_guns.size(); ++s)
            if (m_guns[s].mag + m_guns[s].reserve > 0) { in.weaponSlot = static_cast<int>(s); break; }
    return in;
}

void ZombiesGame::frame(rendering::Camera& cam, std::vector<rendering::DrawItem>& out, std::vector<rendering::PointLight>& lights) {
    const Gun& g = m_guns[static_cast<size_t>(m_slot)];
    // ---- the camera ----
    glm::vec3 e = eye();
    float pitch = m_pitch + m_recoilPitch, yaw = m_yaw + m_recoilYaw;
    if (m_health <= 0.0f) {   // down: the view drops to the floor and tips
        const float t = std::min(1.0f, m_deadT / 1.2f);
        e.y = m_pos.y + glm::mix(m_eyeH, 0.35f, t * t);
        pitch = glm::mix(pitch, 0.25f, t);
    }
    const float bobY = std::sin(m_bob * 2.0f) * 0.022f * m_bobAmp * (1.0f - 0.8f * m_ads);
    const float bobX = std::sin(m_bob) * 0.018f * m_bobAmp * (1.0f - 0.8f * m_ads);
    e.y += bobY * 0.5f - m_landKick * 0.06f;
    const glm::vec3 f(std::sin(yaw) * std::cos(pitch), std::sin(pitch), -std::cos(yaw) * std::cos(pitch));
    cam.position = e;
    cam.target = e + f;
    cam.up = glm::vec3(0.0f, 1.0f, 0.0f);
    const float baseFov = m_kit.fov() > 0.2f ? m_kit.fov() : glm::radians(70.0f);
    cam.fov = baseFov * glm::mix(1.0f, g.def->sightFov, m_ads);
    cam.nearZ = 0.05f;

    /* GAME_ZOMBIE_LINEUP=clip:seconds stands every recorded body in a row in
       front of the start, playing that clip -- a look at the rigs on their own. */
    static const char* lineup = std::getenv("GAME_ZOMBIE_LINEUP");
    if (lineup) {
        char nm[32] = {0};
        float lt = 0.0f;
        std::sscanf(lineup, "%31[^:]:%f", nm, &lt);
        const glm::vec3 fwd(std::sin(m_spawnYaw), 0.0f, -std::cos(m_spawnYaw)), rgt(std::cos(m_spawnYaw), 0.0f, std::sin(m_spawnYaw));
        for (size_t i = 0; i < m_bodies.size(); ++i) {
            glm::vec3 p = m_spawn + fwd * 3.2f + rgt * ((static_cast<float>(i) - (m_bodies.size() - 1) * 0.5f) * 1.1f);
            p.y = groundAt(p + glm::vec3(0, 1.0f, 0), m_spawn.y);
            const float yaw = std::atan2(-fwd.x, -fwd.z);
            const glm::mat4 world = glm::translate(glm::mat4(1.0f), p - glm::vec3(0.0f, m_bodies[i]->floor, 0.0f)) *
                                    glm::rotate(glm::mat4(1.0f), yaw, glm::vec3(0, 1, 0));
            m_bodies[i]->emit(nm, lt, world, out);
        }
    }
    // ---- the zombies ----
    for (const Zombie& z : m_zombies) {
        std::string clip;
        float t = 0.0f;
        glm::vec3 p = z.pos;
        switch (z.state) {
            case Zombie::Rising:
                clip = "walk";
                t = z.animT;
                p.y -= 1.9f * std::pow(1.0f - std::min(1.0f, z.stateT / 1.4f), 1.5f);
                break;
            case Zombie::Tear: clip = "attack"; t = std::fmod(z.stateT, 0.8f); break;
            case Zombie::Climb: clip = z.runner ? "zrun" : "walk"; t = z.stateT; break;
            case Zombie::Attack: clip = "attack"; t = z.stateT; break;
            case Zombie::Dying: clip = z.death; t = z.stateT; p.y -= std::max(0.0f, z.stateT - 5.0f) * 0.4f; break;
            default: clip = z.runner ? "zrun" : "walk"; t = z.animT; break;
        }
        const glm::mat4 world = glm::translate(glm::mat4(1.0f), p - glm::vec3(0.0f, z.rig->floor, 0.0f)) *
                                glm::rotate(glm::mat4(1.0f), z.yaw, glm::vec3(0, 1, 0));
        const glm::vec4 tint = z.hurtT > 0.0f ? glm::vec4(1.6f, 0.8f, 0.8f, 1.0f) : glm::vec4(1.0f);
        z.rig->emit(clip, t, world, out, tint);
    }

    // ---- the viewmodel ----
    if (m_health > 0.0f) {
        const KitRig& rig = *g.rig;
        const KitClip* hip = rig.clip("idle");
        const KitClip* ads = rig.clip("ads") ? rig.clip("ads") : hip;
        const KitClip* A = hip;
        const KitClip* B = ads;
        float t = 0.0f;
        float adsShown = m_ads;
        /* GAME_VIEW_POSE=clip:seconds[:aimed] holds the viewmodel in one recorded pose -- for
           comparing a native frame with the web game's at the same moment. */
        static const char* forced = std::getenv("GAME_VIEW_POSE");
        if (forced) {
            char nm[32] = {0};
            float ft = 0.0f, fa = 0.0f;
            std::sscanf(forced, "%31[^:]:%f:%f", nm, &ft, &fa);
            if (const KitClip* fc = rig.clip(nm)) {
                A = B = fc;
                t = ft;
                if (std::string(nm) == "idle" || std::string(nm) == "fire") { B = rig.clip(std::string(nm) == "idle" ? "ads" : "adsfire"); }
                adsShown = fa;
            }
        } else if (m_reloadT >= 0.0f && rig.clip("reload")) { A = B = rig.clip("reload"); t = m_reloadT; }
        else if (rig.clip("fire") && m_fireT < rig.clip("fire")->duration()) {
            A = rig.clip("fire");
            B = rig.clip("adsfire") ? rig.clip("adsfire") : A;
            t = m_fireT;
        }
        if (!B) B = A;
        std::vector<glm::mat4> ma, mb;
        std::vector<uint8_t> va, vb;
        int fa = 0, fb = 0;
        rig.pose(*A, t, ma, va, fa);
        rig.pose(*B, t, mb, vb, fb);
        const float a = (A == B) ? 0.0f : adsShown * adsShown * (3.0f - 2.0f * adsShown);
        for (size_t i = 0; i < ma.size(); ++i) ma[i] = blendRigid(ma[i], mb[i], a);
        const KitClip& palSrc = a < 0.5f ? *A : *B;
        const std::vector<uint8_t>& vis = a < 0.5f ? va : vb;
        const int frameIx = a < 0.5f ? fa : fb;
        // Procedural motion on top, in camera space: bob, sway, the kick, the swap, the landing.
        const float swap = m_swapT > 0.0f ? (m_swapT > 0.25f ? (0.5f - m_swapT) / 0.25f : m_swapT / 0.25f) : 0.0f;
        const float k = 1.0f - 0.85f * m_ads;
        glm::mat4 proc = glm::translate(glm::mat4(1.0f),
                                        glm::vec3(bobX * k - m_sway.x * 0.03f * k, bobY * k - m_sway.y * 0.02f * k - swap * 0.35f - m_landKick * 0.03f,
                                                  m_kick * 0.02f));
        proc = glm::rotate(proc, -swap * 0.9f + m_kick * 0.05f, glm::vec3(1, 0, 0));
        proc = glm::rotate(proc, m_sway.x * 0.05f * k, glm::vec3(0, 1, 0));
        const glm::mat4 view = glm::lookAt(cam.position, cam.target, cam.up);
        const glm::mat4 camWorld = glm::inverse(view);
        rig.emitPose(palSrc, frameIx, ma, vis, camWorld * proc, out);

        // The muzzle flash: a hot blob and a light, for a frame or two.
        static const bool forceFlash = std::getenv("GAME_FLASH") != nullptr;   // captures: show the flash
        if (m_flashT < 0.05f || forceFlash) {
            // At the gun's own muzzle when the kit says where that is, else the recorded point.
            glm::mat4 muzzleM(1.0f);
            if (rig.hasMuzzleLocal && rig.rootPart >= 0 && rig.rootPart < static_cast<int>(ma.size())) {
                muzzleM = camWorld * proc * ma[static_cast<size_t>(rig.rootPart)];
                muzzleM = glm::translate(muzzleM, rig.muzzleLocal + glm::vec3(0.015f, 0.0f, 0.0f));
            } else {
                glm::vec3 mz = rig.muzzleRest;
                if (!palSrc.muzzle.empty()) mz = palSrc.muzzle[static_cast<size_t>(std::min<int>(frameIx, static_cast<int>(palSrc.muzzle.size()) - 1))];
                muzzleM = glm::translate(camWorld * proc, mz);
            }
            const glm::vec3 wp = glm::vec3(muzzleM[3]);
            // A short hot tongue along the bore and a smaller core: centimetres, not a ball.
            const float k0 = forceFlash ? 1.0f : 1.0f - m_flashT / 0.05f;
            for (int q = 0; q < 2; ++q) {
                rendering::DrawItem it;
                it.mesh = m_sphere.get();
                it.material = &m_flashMat;
                const float len = (q == 0 ? 0.07f : 0.03f) * (0.6f + 0.4f * k0), wid = q == 0 ? 0.018f : 0.028f;
                glm::mat4 m = glm::translate(muzzleM, glm::vec3(len * 0.5f, 0.0f, 0.0f));
                m[0] = glm::normalize(m[0]) * len;
                m[1] = glm::normalize(m[1]) * wid;
                m[2] = glm::normalize(m[2]) * wid;
                it.model = m;
                out.push_back(it);
            }
            lights.push_back({wp, 7.0f, glm::vec3(1.0f, 0.7f, 0.35f), 30.0f});
        }
    }

    // ---- blood and dust ----
    for (const Puff& p : m_puffs) {
        rendering::DrawItem it;
        it.mesh = m_sphere.get();
        it.material = p.blood ? &m_bloodMat : &m_dustMat;
        const float s = p.size * (1.0f - 0.6f * p.t / p.life);
        it.model = glm::scale(glm::translate(glm::mat4(1.0f), p.pos), glm::vec3(s));
        out.push_back(it);
    }
}

void ZombiesGame::hud(Hud& h) const {
    const float W = static_cast<float>(h.width()), H = static_cast<float>(h.height());
    const float u = std::max(1.0f, H / 540.0f);   // one font pixel at 1080p is 2 px
    const glm::vec4 ink(0.93f, 0.86f, 0.72f, 0.95f), dim(0.93f, 0.86f, 0.72f, 0.55f), red(0.75f, 0.06f, 0.04f, 0.95f);
    const Gun& g = m_guns[static_cast<size_t>(m_slot)];
    // Hurt: the edges go red.
    if (m_hurtT > 0.0f || m_health < 40.0f) {
        const float a = std::max(m_hurtT * 0.6f, (40.0f - m_health) / 40.0f * 0.45f);
        const float b = 60.0f * u;
        h.rect(0, 0, W, b, {0.5f, 0.0f, 0.0f, a});
        h.rect(0, H - b, W, b, {0.5f, 0.0f, 0.0f, a});
        h.rect(0, b, b, H - 2 * b, {0.5f, 0.0f, 0.0f, a});
        h.rect(W - b, b, b, H - 2 * b, {0.5f, 0.0f, 0.0f, a});
    }
    if (m_health <= 0.0f) {
        h.rect(0, 0, W, H, {0.0f, 0.0f, 0.0f, std::min(0.7f, m_deadT * 0.4f)});
        h.text("YOU DIED", W * 0.5f, H * 0.40f, 6.0f * u, red, 1);
        h.text("ROUND " + std::to_string(m_stats.round) + "  -  " + std::to_string(m_stats.kills) + " KILLS  -  " +
                   std::to_string(m_stats.points) + " POINTS",
               W * 0.5f, H * 0.40f + 60.0f * u, 2.0f * u, ink, 1);
        if (m_deadT > 1.5f) h.text("PRESS ENTER TO GO AGAIN", W * 0.5f, H * 0.40f + 90.0f * u, 2.0f * u, dim, 1);
        return;
    }
    // Crosshair: four ticks that open with the spread, gone when aimed.
    if (m_ads < 0.5f && m_reloadT < 0.0f) {
        const float gap = (6.0f + g.def->spread * 6.0f + glm::length(glm::vec2(m_vel.x, m_vel.z)) * 1.5f) * u;
        const float len = 7.0f * u, th = 1.5f * u, cx = W * 0.5f, cy = H * 0.5f;
        const glm::vec4 c(1.0f, 1.0f, 1.0f, 0.8f * (1.0f - m_ads * 2.0f));
        h.rect(cx - th * 0.5f, cy - gap - len, th, len, c);
        h.rect(cx - th * 0.5f, cy + gap, th, len, c);
        h.rect(cx - gap - len, cy - th * 0.5f, len, th, c);
        h.rect(cx + gap, cy - th * 0.5f, len, th, c);
    }
    // Hit marker.
    if (m_hitMarkT < 0.15f) {
        const float cx = W * 0.5f, cy = H * 0.5f, s = 5.0f * u;
        const glm::vec4 c(1.0f, 1.0f, 1.0f, 1.0f - m_hitMarkT / 0.15f);
        for (int k = 0; k < 4; ++k) {
            const float dx = (k & 1) ? 1.0f : -1.0f, dy = (k & 2) ? 1.0f : -1.0f;
            for (int j = 0; j < 4; ++j) h.rect(cx + dx * (s + j * u * 1.5f) - u, cy + dy * (s + j * u * 1.5f) - u, 2 * u, 2 * u, c);
        }
    }
    // The round, bottom left, in red like the web game's tally.
    h.text(std::to_string(m_stats.round), 40.0f * u, H - 70.0f * u, 7.0f * u, red, 0);
    if (m_roundBanner > 0.0f) {
        const float a = std::min(1.0f, m_roundBanner);
        h.text("ROUND " + std::to_string(m_stats.round), W * 0.5f, H * 0.28f, 5.0f * u, {0.75f, 0.06f, 0.04f, a}, 1);
    }
    // Points, and what was just earned.
    h.text(std::to_string(m_stats.points), W - 40.0f * u, H * 0.55f, 3.0f * u, ink, 2);
    for (size_t i = 0; i < m_popups.size(); ++i) {
        const float age = m_popups[i].second;
        h.text(m_popups[i].first, W - 40.0f * u, H * 0.55f - (24.0f + age * 40.0f + i * 4.0f) * u, 2.0f * u,
               {1.0f, 0.85f, 0.3f, 1.0f - age / 1.2f}, 2);
    }
    // The gun and its ammunition, bottom right.
    h.text(g.def->name, W - 40.0f * u, H - 96.0f * u, 2.0f * u, dim, 2);
    h.text(std::to_string(g.mag) + " / " + std::to_string(g.reserve), W - 40.0f * u, H - 70.0f * u, 4.0f * u,
           g.mag == 0 ? red : ink, 2);
    if (m_reloadT >= 0.0f) {
        const float t = std::clamp(m_reloadT / m_reloadDur, 0.0f, 1.0f);
        const float bw = 120.0f * u;
        h.rect(W * 0.5f - bw * 0.5f, H * 0.62f, bw, 4.0f * u, {0, 0, 0, 0.5f});
        h.rect(W * 0.5f - bw * 0.5f, H * 0.62f, bw * t, 4.0f * u, ink);
        h.text("RELOADING", W * 0.5f, H * 0.62f + 10.0f * u, 1.5f * u, dim, 1);
    } else if (g.mag == 0 && g.reserve == 0) {
        h.text("NO AMMO", W * 0.5f, H * 0.62f, 2.0f * u, red, 1);
    } else if (g.mag <= std::max(1, g.def->mag / 4)) {
        h.text("RELOAD", W * 0.5f, H * 0.62f, 2.0f * u, ink, 1);
    }
    // The slots.
    for (size_t s = 0; s < m_guns.size(); ++s) {
        const std::string label = std::to_string(s + 1) + " " + m_guns[s].def->name;
        h.text(label, W - 40.0f * u, H - 140.0f * u - (m_guns.size() - 1 - s) * 16.0f * u, 1.5f * u,
               static_cast<int>(s) == m_slot ? ink : dim, 2);
    }
    // Health, a thin bar bottom left.
    const float hw = 160.0f * u;
    h.rect(40.0f * u, H - 24.0f * u, hw, 5.0f * u, {0, 0, 0, 0.45f});
    h.rect(40.0f * u, H - 24.0f * u, hw * m_health / 100.0f, 5.0f * u, m_health < 40.0f ? red : ink);
    if (m_toSpawn == 0 && m_stats.alive == 0 && m_intermission > 0.5f)
        h.text("NEXT ROUND IN " + std::to_string(static_cast<int>(std::ceil(kLull - m_intermission))), W * 0.5f, H * 0.2f,
               2.0f * u, dim, 1);
}

} // namespace game::play
