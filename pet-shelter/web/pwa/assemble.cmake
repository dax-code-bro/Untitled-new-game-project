# Assembles the installable web app (PWA) into OUT:
#   cmake -DSRC=<pet-shelter/web> -DBIN=<dir with PetShelter.js/.wasm> -DOUT=<output dir> -P assemble.cmake
# index.html = PWA head (manifest, icons, app meta tags) + the game page from web/index.html.
file(READ "${SRC}/index.html" PAGE)
string(REGEX MATCH "const PS_BUILD = '([^']+)'" _m "${PAGE}")
set(PS_BUILD "${CMAKE_MATCH_1}")
if(NOT PS_BUILD)
  message(FATAL_ERROR "PS_BUILD not found in ${SRC}/index.html")
endif()
file(READ "${SRC}/pwa/head.html" HEAD)
file(MAKE_DIRECTORY "${OUT}/icons")
file(WRITE "${OUT}/index.html" "${HEAD}${PAGE}\n</body>\n</html>\n")
configure_file("${SRC}/pwa/sw.js.in" "${OUT}/sw.js" @ONLY)
file(WRITE "${OUT}/version.json" "{\"build\": \"${PS_BUILD}\"}\n")   # the running app compares itself to this
file(COPY "${SRC}/pwa/manifest.webmanifest" DESTINATION "${OUT}")
file(GLOB ICONS "${SRC}/pwa/icons/*.png")
file(COPY ${ICONS} DESTINATION "${OUT}/icons")
file(COPY "${BIN}/PetShelter.js" "${BIN}/PetShelter.wasm" DESTINATION "${OUT}")
message(STATUS "PWA ${PS_BUILD} assembled in ${OUT}")
