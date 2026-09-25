# Installable game (PWA) — the home-screen link

Play / install: https://raw.githack.com/dax-code-bro/Untitled-new-game-project/claude/pet-shelter-base-ygolsg/pet-shelter/app/index.html

This folder is the finished web app, served straight from GitHub by raw.githack.com. Every push to
`claude/pet-shelter-base-ygolsg` updates the same link (githack's cache refreshes within a few minutes).
The web build refreshes this folder automatically (`cmake --build build-web`); bump `PS_BUILD` in
`web/index.html` for each release so installed copies pick up the new version.
