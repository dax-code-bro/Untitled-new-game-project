
## my_cpp_game — native C++ port (bootstrap only)

`my_cpp_game/` holds a CMake + GLFW + Glad + GLM bootstrap for a proposed
native port. It compiles and links; it has no renderer and nothing is
ported. `my_cpp_game/README.md` has the dependency table, the RAII rules
(no raw new/delete), the port order, and an honest accounting of what the
port costs — chiefly that this game is delivered as a link to a static
page, and a native binary cannot be.
