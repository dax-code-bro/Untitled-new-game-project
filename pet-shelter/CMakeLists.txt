cmake_minimum_required(VERSION 3.16)
project(PetShelter LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
if(NOT CMAKE_BUILD_TYPE AND NOT CMAKE_CONFIGURATION_TYPES)
  set(CMAKE_BUILD_TYPE Release)
endif()

option(PS_BUILD_GAME  "Build the game executable (needs GLFW/OpenGL)" ON)
option(PS_BUILD_TESTS "Build headless simulation tests" ON)

# ---------------------------------------------------------------------------
# Simulation core: no graphics dependencies, shared by the game and the tests.
# ---------------------------------------------------------------------------
add_library(ps_sim STATIC
  src/core/Noise.cpp
  src/core/SaveFile.cpp
  src/world/Terrain.cpp
  src/world/Collision.cpp
  src/world/Layout.cpp
  src/game/Economy.cpp
  src/game/Ratings.cpp
  src/game/Staff.cpp
  src/game/Security.cpp
  src/game/Character.cpp
  src/game/Buildables.cpp
  src/game/Sim.cpp
  src/game/Land.cpp
  src/game/SimAnimals.cpp
  src/game/SimPeople.cpp
  src/game/SimClinic.cpp
  src/game/Species.cpp
)
target_include_directories(ps_sim PUBLIC src)

if(PS_BUILD_TESTS)
  enable_testing()
  add_executable(ps_tests tests/sim_tests.cpp)
  target_link_libraries(ps_tests PRIVATE ps_sim)
  add_test(NAME sim_tests COMMAND ps_tests)
endif()

if(PS_BUILD_GAME)
  include(FetchContent)
  if(NOT EMSCRIPTEN)
  set(GLFW_BUILD_DOCS OFF CACHE BOOL "" FORCE)
  set(GLFW_BUILD_TESTS OFF CACHE BOOL "" FORCE)
  set(GLFW_BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)
  set(GLFW_BUILD_WAYLAND OFF CACHE BOOL "" FORCE)
  FetchContent_Declare(glfw
    GIT_REPOSITORY https://github.com/glfw/glfw.git
    GIT_TAG 3.4
    GIT_SHALLOW TRUE)
  endif()
  FetchContent_Declare(imgui
    GIT_REPOSITORY https://github.com/ocornut/imgui.git
    GIT_TAG v1.91.9b
    GIT_SHALLOW TRUE)
  if(EMSCRIPTEN)
    FetchContent_MakeAvailable(imgui)
    add_library(glfw INTERFACE)   # Emscripten ships its own GLFW
    target_link_options(glfw INTERFACE -sUSE_GLFW=3)
  else()
    FetchContent_MakeAvailable(glfw imgui)
  endif()

  add_library(imgui STATIC
    ${imgui_SOURCE_DIR}/imgui.cpp
    ${imgui_SOURCE_DIR}/imgui_draw.cpp
    ${imgui_SOURCE_DIR}/imgui_tables.cpp
    ${imgui_SOURCE_DIR}/imgui_widgets.cpp
    ${imgui_SOURCE_DIR}/backends/imgui_impl_glfw.cpp
    ${imgui_SOURCE_DIR}/backends/imgui_impl_opengl3.cpp)
  target_include_directories(imgui PUBLIC ${imgui_SOURCE_DIR} ${imgui_SOURCE_DIR}/backends)
  target_link_libraries(imgui PUBLIC glfw)

  add_executable(PetShelter
    src/main.cpp
    src/core/GL.cpp
    src/core/Input.cpp
    src/core/Image.cpp
    src/render/Shader.cpp
    src/render/Mesh.cpp
    src/render/Renderer.cpp
    src/render/Animation.cpp
    src/render/SkinnedMesh.cpp
    src/game/AnimalModel.cpp
    src/game/AnimalAnimator.cpp
    src/game/AnimalActors.cpp
    src/game/ClinicViews.cpp
    src/world/World.cpp
    src/world/Facility.cpp
    src/world/Scenery.cpp
    src/game/CharacterModel.cpp
    src/game/Cutscene.cpp
    src/game/PlayerController.cpp
    src/game/CreativeMode.cpp
    src/game/ComputerUI.cpp
    src/game/CharacterCreatorUI.cpp
    src/game/Game.cpp
    src/game/AnimalStudio.cpp
  )
  target_link_libraries(PetShelter PRIVATE ps_sim imgui glfw)
  target_compile_definitions(PetShelter PRIVATE GLFW_INCLUDE_NONE PS_SHADER_DIR="${CMAKE_CURRENT_SOURCE_DIR}/shaders")
  if(MSVC)
    target_compile_options(PetShelter PRIVATE /W3)
  else()
    target_compile_options(PetShelter PRIVATE -Wall -Wno-unused-parameter)
  endif()
  if(EMSCRIPTEN)
    # Browser build: WebGL2, shaders embedded in the .wasm, no threads.
    set_target_properties(PetShelter PROPERTIES SUFFIX ".js")
    target_link_options(PetShelter PRIVATE
      -sMIN_WEBGL_VERSION=2 -sMAX_WEBGL_VERSION=2 -sGL_ENABLE_GET_PROC_ADDRESS=1
      -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=134217728 -sSTACK_SIZE=4194304
      -sENVIRONMENT=web -sEXPORTED_RUNTIME_METHODS=ccall,UTF8ToString
      "--embed-file=${CMAKE_CURRENT_SOURCE_DIR}/shaders@/shaders")
    # Relink when any shader changes (they're baked into the .wasm)
    file(GLOB PS_SHADER_FILES CONFIGURE_DEPENDS ${CMAKE_CURRENT_SOURCE_DIR}/shaders/*)
    set_property(TARGET PetShelter APPEND PROPERTY LINK_DEPENDS ${PS_SHADER_FILES})
  endif()
  # Copy shaders next to the executable so a packaged build runs anywhere.
  add_custom_command(TARGET PetShelter POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E copy_directory
            ${CMAKE_CURRENT_SOURCE_DIR}/shaders $<TARGET_FILE_DIR:PetShelter>/shaders)
endif()
