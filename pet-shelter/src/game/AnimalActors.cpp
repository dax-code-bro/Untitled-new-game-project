#include "game/AnimalActors.h"
#include "world/Layout.h"
#include "world/Terrain.h"
#include <cmath>

namespace ps {

namespace {
// Wander area (local to the building, +Z = its front) for each housing type
AABB localArea(BuildKind k) {
    const BuildInfo& bi = buildInfo(k);
    float hw = bi.width * 0.5f, hd = bi.depth * 0.5f;
    switch (k) {
    case BuildKind::KennelBlock: return AABB({-hw + 0.8f, 0.3f, hd + 0.5f}, {hw - 0.8f, 0.3f, hd + 2.1f});      // outdoor runs
    case BuildKind::CatHouse:
    case BuildKind::SmallAnimalHouse: return AABB({-hw + 0.8f, 0.0f, hd + 0.4f}, {hw - 0.8f, 0.0f, hd + 1.8f}); // front porch / catio
    case BuildKind::Barn: return AABB({-hw + 1.2f, 0.06f, -hd * 0.25f + 1.5f}, {hw - 1.2f, 0.06f, hd - 1.2f});   // paddock
    case BuildKind::FeralEnclosure: return AABB({-hw + 0.8f, 0.05f, -hd + 0.8f}, {hw - 0.8f, 0.05f, hd - 0.8f});
    case BuildKind::SecureEnclosure: return AABB({-hw + 1.0f, 0.3f, -hd + 2.6f}, {hw - 1.0f, 0.3f, hd - 1.0f});
    case BuildKind::DogRun: return AABB({-hw + 1.0f, 0.06f, -hd + 1.0f}, {hw - 1.0f, 0.06f, hd - 1.0f});
    case BuildKind::ContainerShelter: return AABB({-hw + 0.9f, 0.0f, -hd + 3.0f}, {hw - 0.9f, 0.0f, hd - 0.7f});
    default: return AABB({-1, 0, -1}, {1, 0, 1});
    }
}
vec3 randomIn(const AABB& a, Rng& r) {
    return {r.range(a.min.x, a.max.x), a.min.y, r.range(a.min.z, a.max.z)};
}
}  // namespace

int AnimalActors::pick(vec3 ro, vec3 rd, float maxDist, float* dist) const {
    int best = -1;
    float bestT = maxDist;
    for (const auto& [id, a] : actors_) {
        if (a->onTable) continue;
        const AABB& b = a->build.bounds;
        float r = std::max({b.max.x - b.min.x, b.max.z - b.min.z}) * 0.5f;
        vec3 c = a->pos + vec3(0, (b.max.y) * 0.5f, 0);
        AABB wb(c - vec3(r, b.max.y * 0.5f, r), c + vec3(r, b.max.y * 0.5f, r));
        float t = rayAABB(ro, rd, wb);
        if (t >= 0.0f && t < bestT) { bestT = t; best = id; }
    }
    if (dist) *dist = bestT;
    return best;
}

const AnimalActor* AnimalActors::find(int id) const {
    auto it = actors_.find(id);
    return it == actors_.end() ? nullptr : it->second.get();
}

AnimalActor* AnimalActors::spawn(const Sim& sim, const Animal& a) {
    const Species& sp = speciesCatalog()[size_t(a.species)];
    auto act = std::make_unique<AnimalActor>();
    act->animalId = a.id;
    act->species = a.species;
    AnimalIndividual ind;
    ind.species = a.species;
    ind.male = a.male;
    ind.age = a.ageFraction(sp);
    ind.coat = a.coat;
    ind.seed = a.seed;
    ind.weightFactor = a.weightFactor;
    act->build = buildAnimal(sp, ind);
    act->mesh.upload(act->build.mesh);
    act->anim.init(act->build.rig, sp, a.seed);
    act->think = rng_.range(0.0f, 2.0f);
    (void)sim;
    AnimalActor* raw = act.get();
    actors_[a.id] = std::move(act);
    return raw;
}

void AnimalActors::place(const Sim& sim, const Animal& a, AnimalActor& act) {
    act.housing = a.housing;
    const Placed* p = a.housing >= 0 ? sim.findPlaced(a.housing) : nullptr;
    if (p) {
        AABB la = localArea(p->kind);
        float gy = terrain::height(p->x, p->z);
        mat4 m = mat4::translate({p->x, gy, p->z}) * mat4::rotateY(radians(90.0f * float(p->rot)));
        vec3 c0 = m.transformPoint(la.min), c1 = m.transformPoint(la.max);
        act.area = AABB(vmin(c0, c1), vmax(c0, c1));
        act.area.min.y = act.area.max.y = gy + la.min.y;
    } else {
        // Crates and exam area in the medical room
        float F = layout::kFloorY;
        act.area = a.owned ? AABB({7.4f, F, -1.6f}, {8.6f, F, -0.6f}) : AABB({7.3f, F, -3.8f}, {8.8f, F, -2.6f});
    }
    act.pos = randomIn(act.area, rng_);
    act.target = act.pos;
    act.yaw = rng_.range(0.0f, 2.0f * kPi);
}

void AnimalActors::think(const Sim& sim, const Animal& a, AnimalActor& act, float hour) {
    const Species& sp = speciesCatalog()[size_t(a.species)];
    using A = AnimAction;
    auto can = [&](A x) { return actionAvailable(sp, x); };
    auto pick = [&](std::initializer_list<A> opts) {
        std::vector<A> ok;
        for (A x : opts) if (can(x)) ok.push_back(x);
        return ok.empty() ? A::Idle : ok[size_t(rng_.next() % ok.size())];
    };
    act.walking = false;
    A next = A::Idle;
    bool small = act.area.max.x - act.area.min.x < 2.0f;
    if (!a.alive()) next = A::Dead;
    else if (a.status == AnimalStatus::Critical) next = pick({A::LieDown, A::Tremble});
    else if (a.status == AnimalStatus::Injured) next = pick({A::Limp, A::LieDown, A::Cower, A::Groom});
    else if (a.status == AnimalStatus::Sick || a.status == AnimalStatus::Recovering) next = pick({A::LieDown, A::Sleep, A::Idle});
    else if (hour < 6.0f || hour > 21.5f) next = pick({A::Sleep, A::Sleep, A::LieDown});
    else if ((hour >= 8.0f && hour < 8.6f) || (hour >= 17.0f && hour < 17.6f)) next = pick({A::Eat, A::Drink});
    else if (a.stress > 0.7f && sp.temperament > 0.5f) next = pick({A::Growl, A::Hiss, A::Cower, A::Walk, A::HoodUp, A::Tremble});
    else if (a.stress > 0.7f) next = pick({A::Cower, A::Tremble, A::Idle});
    else {
        float r = rng_.uniform();
        if (r < 0.35f && !small) next = A::Walk;
        else if (r < 0.45f && a.happiness > 0.6f && !small) next = pick({A::Run, A::Binky, A::WagHappy, A::PlayBow, A::FlapWings});
        else next = pick({A::Idle, A::Idle, A::Sniff, A::LookAround, A::Sit, A::LieDown, A::Groom, A::Scratch, A::Shake, A::Yawn,
                          A::Stretch, A::WagHappy, A::Pant, A::Vocalize, A::Dig, A::Peck, A::Preen, A::Knead, A::Thump, A::Coil,
                          A::Eat, A::RollOver, A::StandUp, A::Beg});
    }
    if (next == A::Walk || next == A::Run || next == A::Limp) {
        act.target = randomIn(act.area, rng_);
        act.walking = true;
    }
    act.anim.play(next, 0.4f);
    act.think = actionLoops(next) ? rng_.range(3.0f, 9.0f) : actionDuration(next);
    (void)sim;
}

void AnimalActors::update(const Sim& sim, float dt, vec3 camPos) {
    builtThisFrame_ = 0;
    float hour = sim.clock.hour();
    // Remove actors for animals that left
    for (auto it = actors_.begin(); it != actors_.end();) {
        const Animal* a = sim.findAnimal(it->first);
        if (!a || !a->inCare()) it = actors_.erase(it);
        else ++it;
    }
    for (const Animal& a : sim.animalList) {
        if (!a.inCare()) continue;
        AnimalActor* act = nullptr;
        auto it = actors_.find(a.id);
        if (it != actors_.end()) act = it->second.get();
        else {
            if (builtThisFrame_ >= 2) continue;   // spread mesh generation over frames
            ++builtThisFrame_;
            act = spawn(sim, a);
            place(sim, a, *act);
        }
        if (act->housing != a.housing) place(sim, a, *act);
        bool onTable = sim.surgery.active && sim.surgery.animal == a.id;
        if (onTable != act->onTable) {
            act->onTable = onTable;
            if (onTable) { act->anim.play(AnimAction::Sedated, 0.8f); act->walking = false; }
            else { place(sim, a, *act); act->think = 0.0f; }
        }
        // Blood: fresh wounds on injured animals, the incision on the operating table.
        // Wounds sit on the skin of whichever flank is facing up.
        {
            const AnimalRig& rig = act->build.rig;
            float flank = act->build.bounds.max.x * 0.92f;
            float up = rig.spine >= 0 ? act->anim.boneWorld(rig.spine).transformDir({1, 0, 0}).y : 0.0f;
            float side = up >= -0.05f ? 1.0f : -1.0f;
            if (onTable && sim.surgery.step >= 3) {
                act->wound = vec4(side * flank, rig.shoulderH * 0.62f, rig.bodyLen * 0.02f, rig.bodyLen * (0.26f + 0.12f * sim.surgery.progress));
                act->wet = std::min(1.0f, 0.7f + sim.surgery.bloodLoss);
            } else if (a.bleeding > 0.02f) {
                act->wound = vec4(side * flank, rig.shoulderH * 0.72f, rig.bodyLen * 0.22f, rig.bodyLen * (0.16f + 0.2f * a.bleeding));
                act->wet = a.bleeding;
            } else {
                act->wound = vec4(0, 0, 0, 0);
                act->wet = 0.0f;
            }
        }
        // Skip simulating far-away animals every frame (they catch up when you get close)
        float d2 = length(act->pos - camPos);
        if (d2 > 90.0f && rng_.uniform() < 0.8f) continue;
        if (!act->onTable) {
            act->think -= dt;
            if (act->think <= 0.0f) think(sim, a, *act, hour);
            if (act->walking) {
                vec3 to = act->target - act->pos;
                to.y = 0.0f;
                float dist = length(to);
                float speed = act->anim.action() == AnimAction::Run ? std::max(act->build.rig.legLen * 5.0f, 1.2f)
                              : std::max(act->build.rig.legLen * 1.4f, 0.25f) * speciesCatalog()[size_t(a.species)].shape.gaitSpeed;
                if (act->anim.action() == AnimAction::Limp) speed *= 0.5f;
                if (dist < 0.1f) { act->walking = false; act->anim.play(AnimAction::Idle, 0.4f); act->think = rng_.range(1.0f, 4.0f); }
                else {
                    float want = std::atan2(to.x, to.z);
                    float dy = std::remainder(want - act->yaw, 2.0f * kPi);
                    act->yaw += clampf(dy, -dt * 3.0f, dt * 3.0f);
                    act->pos += vec3(std::sin(act->yaw), 0, std::cos(act->yaw)) * (speed * dt * (std::fabs(dy) < 1.0f ? 1.0f : 0.3f));
                    act->anim.setSpeed(speed);
                }
            } else {
                act->anim.setSpeed(0.0f);
            }
        }
        act->anim.update(dt);
    }
    // Dangerous animal loose on the property
    if (sim.incident.active) {
        if (!loose_ || looseSpecies_ != sim.incident.species) {
            const Species& sp = speciesCatalog()[size_t(sim.incident.species)];
            loose_ = std::make_unique<AnimalActor>();
            AnimalIndividual ind;
            ind.species = sim.incident.species;
            ind.seed = 99;
            loose_->build = buildAnimal(sp, ind);
            loose_->mesh.upload(loose_->build.mesh);
            loose_->anim.init(loose_->build.rig, sp, 99);
            vec3 c = sim.incident.pos;
            c.y = terrain::height(c.x, c.z);
            loose_->area = AABB(c - vec3(9, 0, 9), c + vec3(9, 0, 9));
            loose_->pos = c;
            loose_->target = c;
            looseSpecies_ = sim.incident.species;
        }
        AnimalActor& L = *loose_;
        L.think -= dt;
        if (L.think <= 0.0f) {
            const Species& sp = speciesCatalog()[size_t(looseSpecies_)];
            float r = rng_.uniform();
            AnimAction next = r < 0.55f ? AnimAction::Walk : (r < 0.7f ? AnimAction::LookAround : (r < 0.85f ? AnimAction::Sniff : AnimAction::Vocalize));
            if (!sim.incident.playerCalm && r > 0.8f) next = actionAvailable(sp, AnimAction::Growl) ? AnimAction::Growl : AnimAction::Hiss;
            L.anim.play(next, 0.4f);
            L.walking = next == AnimAction::Walk;
            L.target = randomIn(L.area, rng_);
            L.think = rng_.range(2.0f, 6.0f);
        }
        if (L.walking) {
            vec3 to = L.target - L.pos;
            to.y = 0;
            if (length(to) > 0.2f) {
                float want = std::atan2(to.x, to.z);
                L.yaw += clampf(std::remainder(want - L.yaw, 2.0f * kPi), -dt * 2.0f, dt * 2.0f);
                float sp = std::max(L.build.rig.legLen * 1.3f, 0.5f);
                L.pos += vec3(std::sin(L.yaw), 0, std::cos(L.yaw)) * sp * dt;
                L.pos.y = terrain::height(L.pos.x, L.pos.z);
                L.anim.setSpeed(sp);
            }
        } else L.anim.setSpeed(0.0f);
        L.anim.update(dt);
    } else {
        loose_.reset();
        looseSpecies_ = -1;
    }
}

void AnimalActors::draw(Renderer& r, Pass p, vec3 camPos) const {
    if (p == Pass::Transparent) return;
    auto drawOne = [&](const AnimalActor& a, const mat4& model) {
        AABB wb(model.transformPoint(a.build.bounds.min), model.transformPoint(a.build.bounds.max));
        wb = AABB(vmin(wb.min, wb.max) - vec3(0.5f), vmax(wb.min, wb.max) + vec3(0.5f));
        if (!r.visible(wb)) return;
        float d = length(a.pos - camPos);
        if (d > 160.0f) return;
        int shells = p == Pass::Opaque ? (d < 8.0f ? r.furShells : (d < 20.0f ? r.furShells / 2 : 0)) : 0;
        const auto& sk = a.anim.skin();
        CoatUniforms coat = a.build.coat;
        coat.wound = a.wound;
        coat.wet = a.wet;
        r.drawSkinned(a.mesh, sk.data(), int(sk.size()), model, coat, shells, 1.0f);
    };
    for (const auto& [id, a] : actors_) {
        mat4 model;
        if (a->onTable) {
            // Lying on its side along the operating table, belly toward the surgeon
            vec3 t = operatingTableTop();
            float lift = a->build.rig.shoulderH * 0.12f;
            model = mat4::translate(t + vec3(0, lift, 0)) * mat4::rotateY(kPi * 0.5f) * mat4::translate({0, -a->build.rig.hipH * 0.45f, 0});
        } else {
            model = mat4::translate(a->pos) * mat4::rotateY(a->yaw);
        }
        drawOne(*a, model);
    }
    if (loose_) drawOne(*loose_, mat4::translate(loose_->pos) * mat4::rotateY(loose_->yaw));
}

}  // namespace ps
