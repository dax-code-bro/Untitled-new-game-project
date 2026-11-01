# SOUTHBOUND — Roadmap / Master To-Do

Original open-world action game set in **Calvera**, a fictional state on the
southern edge of North America (Gulf Coast). Inspired by the open-world crime
genre, but every name, place, character and story beat is our own.

Status key: `[x]` done · `[~]` started / partial · `[ ]` not started

---

## Phase 1 — Graphics, world, core slice (current)

- [x] Three.js vendored locally (no CDN needed at runtime)
- [x] Start screen: **Phone** vs **PC** selection before loading
- [x] Auto GPU detection (reads GPU name, picks a preset)
- [x] Quality presets: Phone / Low / Medium / High / Ultra
- [x] Dynamic resolution: holds the target FPS (60 phone, 60–120 PC)
- [x] Render resolution up to 4K (3840×2160) on PC
- [x] Settings menu (graphics, controls, audio, content filters) saved locally
- [x] Physical sky + day/night cycle, sun and moon light
- [x] Image-based lighting from the sky (reflections on cars, water)
- [x] Cascaded-style sun shadows that follow the player
- [x] Procedural terrain shader (grass / dirt / rock / sand / snow by slope + height)
- [x] Water shader (Fresnel, animated waves, sun glints, shoreline foam)
- [x] Post-processing: bloom, SMAA, ambient occlusion (Ultra), ACES tone mapping, vignette, color grade
- [x] Instanced forests with wind animation, grass fields (PC)
- [x] Procedural textures (asphalt + lane lines, building facades, lit windows at night)
- [x] Regions: big city, small town, dense forest, open hunting plains, big lake, rivers/creeks, coast
- [x] Road network connecting regions
- [x] On-foot player, third-person camera, keyboard/mouse + touch controls
- [x] Drivable car (arcade physics, terrain following, collisions)
- [x] AI traffic that follows roads and keeps distance
- [x] HUD: minimap, speedometer, clock, region banner, FPS
- [x] Automated playtest: screenshots + video (tools/playtest.js)

## Phase 2 — World depth

- [ ] Expand map to more of the continent's southern side (multiple states/regions)
- [ ] Streaming world chunks (needed before the map gets much bigger)
- [ ] Every building gets an enterable interior (procedural interior generator + hand-made key interiors)
- [ ] Pedestrians with daily routines
- [ ] Traffic lights, lane changes, police response
- [ ] Weather: rain, storms, fog, hurricanes
- [ ] Real asset pass (needs network allow-list: polyhaven.com, ambientcg.com, kenney.nl, quaternius.com, freesound.org)

## Phase 3 — Content catalogs (targets)

| Item | Target | Done |
|---|---|---|
| Assault rifles | 56 | 0 |
| Shotguns | 13 | 0 |
| Rocket launchers | 12 | 0 |
| Bows | 19 | 0 |
| Sniper rifles | 13 | 0 |
| Marksman rifles | 45 | 0 |
| Pistols | 63 | 0 |
| Weapon attachments | 193+ | 0 |
| Land vehicles | 93 | 1 (+traffic variants) |
| Water vehicles | 16 | 0 |
| Air vehicles | 11 | 0 |
| Car upgrades (per car) | 63 | 0 |
| Boat upgrades | 98 | 0 |
| Plane upgrades | 17 | 0 |
| Buyable houses | 198 | 0 |
| Tools | 240 | 0 |
| Jobs | 27 | 0 |
| Story missions | 63 | 0 |

## Phase 4 — Systems

- [ ] Combat: shooting, aiming, cover, damage model
- [ ] Hunting: animals with AI, tracking, skinning, trophies
- [ ] Fishing: casting, fish species by water type, reel mini-game
- [ ] Economy: money, shops, property ownership
- [ ] Jobs system framework (27 jobs)
- [ ] Mission scripting system + story (63 missions, lore bible)
- [ ] Garage / tuning UI
- [ ] Save system

## Phase 5 — Ship

- [ ] Content rating: what's planned (blood/gore, strong language, drugs, tobacco)
      is a **17+ (App Store) / M (ESRB)** game, not "kid friendly". The content
      filters in Settings let players turn gore and language off.
- [ ] Wrap the web build for iOS/Android (Capacitor) and submit to the stores
- [ ] Apple developer account ($99/yr), store listing, privacy policy

---

## Known issues / next fixes

- Frame rates have only been measured in a software renderer (the cloud box has
  no GPU). Real phone and PC frame rates still need testing on actual devices.
- Characters are simple shapes for now (no skinned models).
- Cars can't be damaged yet. Collisions push and slow you down.
- Traffic has no traffic lights, so cars cross intersections without stopping
  for each other.
- Buildings are solid for now. The interior system is Phase 2.

## Session log

- **Session 1:** Phase 1 built. External asset sites are blocked by the cloud
  environment's network policy, so every texture, model and sound is made in code.
