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
add_library(stb_image INTERFACE)
target_include_directories(stb_image INTERFACE ${stb_SOURCE_DIR})

set(GAME_SOURCES
  src/main.cpp
  src/core/Window.cpp
)

add_executable(my_cpp_game ${GAME_SOURCES})
target_include_directories(my_cpp_game PRIVATE src)
target_link_libraries(my_cpp_game PRIVATE glfw glad_gl_core_46 glm::glm stb_image)

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
