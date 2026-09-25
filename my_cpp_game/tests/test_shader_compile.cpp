// Compiles and links every shader program the renderer uses, in every
// #define combination it uses, on whatever driver is present. Under Xvfb this
// is Mesa llvmpipe (GL 4.5 core), which is strict: anything that passes
// here passes on the NVIDIA/AMD/Intel desktop drivers too.
//
//   ./build/test_shader_compile            exit 0 = all programs link
#include "core/Window.hpp"
#include "rendering/ShaderLibrary.hpp"

#include <cstdio>
#include <string>
#include <vector>

using game::rendering::ShaderLibrary;

namespace {
struct Case { std::string vert, frag; std::vector<std::string> defines; };
}

int main() {
    game::core::Window window(64, 64, "shader-compile", /*visible=*/false);
    std::printf("GL %d.%d  %s\n", window.glMajor(), window.glMinor(),
                reinterpret_cast<const char*>(glGetString(GL_RENDERER)));

    ShaderLibrary lib(GAME_SOURCE_DIR "/shaders");

    std::vector<Case> cases;
    const std::vector<std::vector<std::string>> meshVariants = {
        {}, {"INSTANCED"}, {"SKINNED"}, {"INSTANCED", "GRASS"},
        {"ALPHA_CLIP"}, {"INSTANCED", "ALPHA_CLIP"}, {"SKINNED", "ALPHA_CLIP"},
    };
    for (const auto& d : meshVariants) cases.push_back({"pbr.vert", "pbr.frag", d});
    for (const auto& d : meshVariants) cases.push_back({"shadow.vert", "shadow.frag", d});
    cases.push_back({"sky.vert", "sky.frag", {}});
    cases.push_back({"particle.vert", "particle.frag", {}});
    cases.push_back({"fluidDepth.vert", "fluidDepth.frag", {}});
    cases.push_back({"fluidThick.vert", "fluidThick.frag", {}});
    for (const char* f : {"fluidBlur", "fluidShade", "bright", "blur", "composite", "ssao",
                          "ssaoBlur", "fxaa", "volumetric", "volBlur", "copy", "contact",
                          "envBake", "envPrefilter", "envBrdf", "ssr", "ssrBlur",
                          "screenSpace", "tonemap"})
        cases.push_back({"fullscreen.vert", std::string(f) + ".frag", {}});

    int failed = 0;
    for (const auto& c : cases) {
        std::string label = c.vert + " + " + c.frag;
        for (const auto& d : c.defines) label += " " + d;
        try {
            auto p = lib.get(c.vert, c.frag, c.defines);
            GLint uniforms = 0;
            glGetProgramiv(p->id(), GL_ACTIVE_UNIFORMS, &uniforms);
            std::printf("  ok    %-58s %3d uniforms\n", label.c_str(), uniforms);
        } catch (const std::exception& e) {
            ++failed;
            std::printf("  FAIL  %s\n%s\n", label.c_str(), e.what());
        }
    }
    std::printf("%zu programs, %d failed\n", cases.size(), failed);
    return failed ? 1 : 0;
}
