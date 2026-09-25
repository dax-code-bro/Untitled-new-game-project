// Animal studio: photographs every species (adult male, adult female, baby)
// from the side and from the front three-quarter so each model can be
// play-tested by eye.  Run: PetShelter --animals DIR [--only NAME|CLASS]
#include "core/Image.h"
#include "game/AnimalModel.h"
#include "game/Game.h"
#include <GLFW/glfw3.h>
#include <cstdio>
#include <filesystem>

namespace ps {

namespace {
struct Posed {
    AnimalBuild build;
    SkinnedMesh mesh;
    mat4 model;
};

std::string fileSafe(const std::string& s) {
    std::string o;
    for (char ch : s) o += (std::isalnum(uint8_t(ch)) ? ch : '_');
    return o;
}
}  // namespace

int Game::runAnimalStudio(const std::string& dir, const std::string& filter) {
    std::error_code ec;
    std::filesystem::create_directories(dir, ec);
    renderer_.setTimeOfDay(10.5f);
    renderer_.lights.clear();
    renderer_.indoorBox = AABB(vec3(1e6f), vec3(1e6f + 1.0f));
    renderer_.fade = 1.0f;
    renderer_.letterbox = 0.0f;

    MeshBuilder gb;
    gb.addBox(AABB(vec3(-60, -0.2f, -60), vec3(60, 0.0f, 60)), Material::make({0.32f, 0.31f, 0.29f}, 0.9f));
    Mesh ground;
    ground.upload(gb);

    std::vector<mat4> identity(kMaxBones);
    const auto& cat = speciesCatalog();
    int shots = 0;
    for (size_t si = 0; si < cat.size(); ++si) {
        const Species& sp = cat[si];
        if (!filter.empty()) {   // comma-separated names (substring) or class names
            bool hit = false;
            size_t st = 0;
            while (st <= filter.size()) {
                size_t e = filter.find(',', st);
                std::string f = filter.substr(st, e == std::string::npos ? std::string::npos : e - st);
                if (!f.empty() && (sp.name.find(f) != std::string::npos || f == className(sp.cls))) hit = true;
                if (e == std::string::npos) break;
                st = e + 1;
            }
            if (!hit) continue;
        }
        // Three individuals: adult male, adult female, baby
        std::vector<Posed> row(3);
        const float ages[3] = {1.0f, 1.0f, 0.15f};
        const bool males[3] = {true, false, true};
        float x = 0.0f, maxH = 0.0f, maxL = 0.0f;
        for (int k = 0; k < 3; ++k) {
            AnimalIndividual ind;
            ind.species = int(si);
            ind.male = males[k];
            ind.age = ages[k];
            ind.coat = k;
            ind.seed = uint32_t(11 + k * 7);
            row[k].build = buildAnimal(sp, ind);
            row[k].mesh.upload(row[k].build.mesh);
            const AABB& b = row[k].build.bounds;
            float len = b.max.z - b.min.z;
            maxH = std::max(maxH, b.max.y);
            maxL = std::max(maxL, len);
            // turn to face +X and line up left to right
            float cx = x - b.min.z;
            row[k].model = mat4::translate({cx, 0, 0}) * mat4::rotateY(kPi * 0.5f);
            x += len + std::max(0.15f * len, 0.05f);
        }
        float total = x;
        auto sceneFn = [&](Renderer& r, Pass p) {
            if (p == Pass::Transparent) return;
            r.draw(ground, mat4::translate({total * 0.5f, 0, 0}));
            for (auto& a : row)
                r.drawSkinned(a.mesh, identity.data(), int(a.build.rig.bones.size()), a.model, a.build.coat, p == Pass::Opaque ? 6 : 0, 1.0f);
        };
        auto shoot = [&](const Camera& cam, const std::string& name) {
            renderer_.resetAdaptation();
            for (int f = 0; f < 3; ++f) {
                glfwPollEvents();
                renderer_.renderFrame(cam, sceneFn, 1.0f / 30.0f, 1.0f);
                if (f == 2) {
                    auto px = renderer_.readPixels();
                    writePNG(dir + "/" + name + ".png", width_, height_, px);
                }
                glfwSwapBuffers(window_);
            }
            ++shots;
        };
        Camera cam;
        cam.aspect = float(width_) / float(height_);
        cam.fovY = radians(30.0f);
        cam.zNear = 0.01f;
        cam.zFar = 500.0f;
        // Side view of the lineup
        float span = std::max(total, maxH * 2.0f);
        float dist = span * 0.5f / std::tan(cam.fovY * 0.5f * cam.aspect) * 1.12f;
        dist = std::max(dist, maxH * 0.5f / std::tan(cam.fovY * 0.5f) * 1.2f);
        vec3 center{total * 0.5f, maxH * 0.5f, 0.0f};
        cam.lookAt(center + vec3(0, dist * 0.08f, dist), center);
        char nm[16];
        std::snprintf(nm, sizeof nm, "%03d_", int(si));
        shoot(cam, std::string(nm) + fileSafe(sp.name) + "_side");
        // Front three-quarter close-up of the male
        const AABB& mb = row[0].build.bounds;
        float ml = mb.max.z - mb.min.z, mh = mb.max.y;
        vec3 mc = row[0].model.transformPoint(vec3(0, mh * 0.55f, (mb.min.z + mb.max.z) * 0.5f));
        float d2 = std::max(ml, mh) * 0.5f / std::tan(cam.fovY * 0.5f) * 0.85f;
        vec3 dir3 = normalize(vec3(0.75f, 0.35f, 0.65f));
        cam.lookAt(mc + dir3 * d2, mc);
        shoot(cam, std::string(nm) + fileSafe(sp.name) + "_front");
        std::fprintf(stderr, "[studio] %s  verts %zu  bones %zu  %.2fm tall\n", sp.name.c_str(), row[0].build.mesh.verts.size(),
                     row[0].build.rig.bones.size(), double(maxH));
    }
    std::fprintf(stderr, "[studio] %d shots\n", shots);
    return 0;
}

}  // namespace ps
