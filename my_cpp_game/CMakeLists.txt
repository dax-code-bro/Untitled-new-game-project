# ---------------------------------------------------------------------------
#  my_cpp_game — native C++ / OpenGL 4.6 core
#
#  Dependencies are fetched, not vendored, so a clone needs no submodules.
#  The heavy ones (Assimp, Lua) are OFF by default: Assimp alone is a
#  ten-minute build and nothing in the bootstrap target needs it yet.
#  Turn them on when the code that uses them exists.
#      cmake -B build -DGAME_WITH_ASSIMP=ON -DGAME_WITH_LUA=ON
# ---------------------------------------------------------------------------
cmake_minimum_required(VERSION 3.20)
project(my_cpp_game LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)
if(NOT CMAKE_BUILD_TYPE)
  set(CMAKE_BUILD_TYPE Release CACHE STRING "" FORCE)
endif()

option(GAME_WITH_ASSIMP "Build Assimp model loading"  OFF)
option(GAME_WITH_LUA    "Build Lua/Sol2 hot-reloading" OFF)

include(FetchContent)
set(FETCHCONTENT_QUIET OFF)

# --- GLFW: window, context, input ------------------------------------------
set(GLFW_BUILD_DOCS     OFF CACHE BOOL "" FORCE)
set(GLFW_BUILD_TESTS    OFF CACHE BOOL "" FORCE)
set(GLFW_BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)
FetchContent_Declare(glfw
  GIT_REPOSITORY https://github.com/glfw/glfw.git
  GIT_TAG        3.4
  GIT_SHALLOW    TRUE)

# --- GLM: maths that mirrors GLSL ------------------------------------------
FetchContent_Declare(glm
  GIT_REPOSITORY https://github.com/g-truc/glm.git
  GIT_TAG        1.0.1
  GIT_SHALLOW    TRUE)

# --- Glad 2: the GL 4.6 core loader ----------------------------------------
#  glad2 ships its own CMake helper, so the loader is GENERATED at configure
#  time for exactly the profile asked for. No checked-in generated source to
#  drift from the profile it was generated for.
FetchContent_Declare(glad
  GIT_REPOSITORY https://github.com/Dav1dde/glad.git
  GIT_TAG        v2.0.6
  GIT_SHALLOW    TRUE
  SOURCE_SUBDIR  cmake)

FetchContent_MakeAvailable(glfw glm glad)
glad_add_library(glad_gl_core_46 REPRODUCIBLE API gl:core=4.6)

# --- stb_image: single-header texture loading ------------------------------
FetchContent_Declare(stb
  GIT_REPOSITORY https://github.com/nothings/stb.git
  GIT_TAG        master
  GIT_SHALLOW    TRUE)
FetchContent_MakeAvailable(stb)

# JSON, for the scene files exported from the web game (tools/export_scene.js).
FetchContent_Declare(json
  URL https://github.com/nlohmann/json/releases/download/v3.11.3/json.tar.xz
  URL_HASH SHA256=d6c65aca6b1ed68e7a182f4757257b107ae403032760ed6ef121c9d55e81757d
  DOWNLOAD_EXTRACT_TIMESTAMP TRUE)
FetchContent_MakeAvailable(json)
add_library(stb_image INTERFACE)
target_include_directories(stb_image INTERFACE ${stb_SOURCE_DIR})

# ---------------------------------------------------------------------------
#  ONE LIBRARY PER DIRECTORY, SOURCES GLOBBED, so a module can be written in
#  parallel with the rest without anyone editing this file. Each library
#  owns exactly one directory; nothing reaches across except through its
#  headers. CONFIGURE_DEPENDS re-runs the glob when a file is added.
# ---------------------------------------------------------------------------
function(game_module name dir)
  file(GLOB_RECURSE _src CONFIGURE_DEPENDS ${CMAKE_CURRENT_SOURCE_DIR}/${dir}/*.cpp)
  add_library(${name} STATIC ${_src})
  target_include_directories(${name} PUBLIC ${CMAKE_CURRENT_SOURCE_DIR}/src)
  target_compile_features(${name} PUBLIC cxx_std_20)
endfunction()

# Pure CPU: no GL, no window. Testable headless, buildable anywhere.
game_module(game_assets   src/assets)      # procedural material baker
game_module(game_geometry src/geometry)    # primitives, tangents
target_link_libraries(game_assets   PUBLIC glm::glm)
target_link_libraries(game_geometry PUBLIC glm::glm)
find_package(Threads REQUIRED)
target_link_libraries(game_assets PUBLIC Threads::Threads)

# GL: needs a context.
game_module(game_render src/rendering)
target_link_libraries(game_render PUBLIC glad_gl_core_46 glfw glm::glm stb_image game_assets game_geometry)

game_module(game_core src/core)
target_link_libraries(game_core PUBLIC glfw glad_gl_core_46 glm::glm stb_image)
# Shaders are loaded from the SOURCE tree, not the copy next to the binary:
# that is what makes editing a .glsl file hot-reload the running game.
target_compile_definitions(game_core PUBLIC GAME_SOURCE_DIR="${CMAKE_CURRENT_SOURCE_DIR}")

# Scenes: what gets drawn. Depends on everything below it.
game_module(game_scene src/scene)
target_link_libraries(game_scene PUBLIC game_render game_core nlohmann_json::nlohmann_json)

add_executable(my_cpp_game src/main.cpp)
target_link_libraries(my_cpp_game PRIVATE game_scene game_core game_render)

# Every tests/*.cpp becomes its own executable, linked against everything.
file(GLOB _tests CONFIGURE_DEPENDS ${CMAKE_CURRENT_SOURCE_DIR}/tests/*.cpp)
foreach(_t ${_tests})
  get_filename_component(_n ${_t} NAME_WE)
  add_executable(${_n} ${_t})
  target_link_libraries(${_n} PRIVATE game_scene game_core game_render game_assets game_geometry)
endforeach()

if(GAME_WITH_ASSIMP)
  set(ASSIMP_BUILD_TESTS OFF CACHE BOOL "" FORCE)
  set(ASSIMP_INSTALL      OFF CACHE BOOL "" FORCE)
  FetchContent_Declare(assimp
    GIT_REPOSITORY https://github.com/assimp/assimp.git
    GIT_TAG        v5.4.3
    GIT_SHALLOW    TRUE)
  FetchContent_MakeAvailable(assimp)
  target_link_libraries(my_cpp_game PRIVATE assimp::assimp)
  target_compile_definitions(my_cpp_game PRIVATE GAME_WITH_ASSIMP)
endif()

if(GAME_WITH_LUA)
  FetchContent_Declare(lua
    GIT_REPOSITORY https://github.com/walterschell/Lua.git
    GIT_TAG        v5.4.5
    GIT_SHALLOW    TRUE)
  FetchContent_Declare(sol2
    GIT_REPOSITORY https://github.com/ThePhD/sol2.git
    GIT_TAG        v3.3.0
    GIT_SHALLOW    TRUE)
  FetchContent_MakeAvailable(lua sol2)
  target_link_libraries(my_cpp_game PRIVATE lua_static sol2::sol2)
  target_compile_definitions(my_cpp_game PRIVATE GAME_WITH_LUA)
endif()

# Shaders and scripts are read at run time, so they are copied rather than
# compiled in -- that is the whole point of the hot-reload workflow.
add_custom_command(TARGET my_cpp_game POST_BUILD
  COMMAND ${CMAKE_COMMAND} -E copy_directory
          ${CMAKE_CURRENT_SOURCE_DIR}/shaders $<TARGET_FILE_DIR:my_cpp_game>/shaders
  COMMAND ${CMAKE_COMMAND} -E copy_directory
          ${CMAKE_CURRENT_SOURCE_DIR}/scripts $<TARGET_FILE_DIR:my_cpp_game>/scripts)
