# Installable game (PWA) — ready to host

This folder is the finished web app: it is what the "pet-shelter" Vercel project serves.
Refresh it after a web build (bump `PS_BUILD` in `web/index.html` first):

    cmake --build build-web && rm -rf app/PetShelter.* app/icons && cp -r build-web/pwa/. app/
