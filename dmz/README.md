# EXFIL: a DMZ-style extraction shooter

EXFIL is a first-person extraction shooter that runs in the browser. It's built from scratch with Three.js and has no build step and no asset files. All geometry and sound are generated in code.

## Run it

ES modules have to be served over HTTP, so opening the file directly won't work. From the repo root:

```bash
cd dmz
python3 -m http.server 8000      # or: npx serve .
```

Then open http://localhost:8000. Click **DEPLOY**, then click the game view to capture the mouse.

`?test` disables pointer lock, which helps when debugging or running automation. During a raid, `window.__raid` exposes the live game state.

## The loop

1. **HQ**: choose a primary and secondary weapon and the one weapon you insure. You can also buy weapons, plates, self-revives and backpack upgrades, and sell the valuables you've extracted.
2. **Deploy**: you spawn on the edge of a 640 m map with 5 points of interest. They're ranked by threat: Dustwater and Hollow Farms are low, Rustworks and Ridgeback Comms are medium, and Fort Kessler, where the boss is, is high.
3. **Contract**: each raid gives you one of two contracts:
   - *Secure Intel*: find the intel case in a marked building and extract with it (+$5,000).
   - *Eliminate HVT*: kill Kazimir Vos and his guards. The bounty is paid on the kill, but it's lost if you die.
4. **Loot**: search crates, duffels, toolboxes, weapon cases, safes and enemy bodies for cash, valuables, weapons, ammo, plates and self-revives. Your backpack has limited slots.
5. **Exfil**: go to one of the 4 green exfil zones and press **E** to call a helicopter. Hold out for 30 s while two waves of reinforcements push you, then stay close to the chopper to board.
6. **Radiation**: after 8 minutes a radiation circle starts closing, and it's fully closed at 19 minutes. Outside it you take damage that ignores armor.
7. **Death**: you lose everything you brought and everything you found. Only your insured weapon comes back.

## Controls

| Key | Action |
| --- | --- |
| WASD / Shift | Move / sprint |
| C (toggle), Ctrl (hold) / Space | Crouch / jump |
| LMB / RMB | Fire / aim down sights |
| R | Reload |
| 1, 2, Q, mouse wheel | Switch weapon |
| F | Apply an armor plate (hold to chain) |
| E | Search, loot, call exfil |
| Tab | Backpack (drop and equip found weapons) |
| M | Tactical map |
| Esc | Pause (sensitivity, volume, abandon the raid) |

## Code map (`src/`)

| File | What it does |
| --- | --- |
| `data.js` | **All tuning lives here**: weapons, items, loot tables, enemy stats, prices, raid timers |
| `world.js` | Seeded map generation (roads, buildings with doors and windows, fort, warehouses, trees). All static boxes are merged into one mesh. Also handles collision (spatial grid), raycasts and the map image |
| `raid.js` | One deployment: spawning, hitscan, loot interaction, contract, exfil and helicopter, radiation, end of raid |
| `player.js` | Movement, look, shooting (spread, recoil, bloom), reload, plates, health regen, being downed |
| `enemy.js` | AI states patrol → alert → combat → search, squad alerts, hearing, door-aware navigation, burst fire |
| `viewmodel.js` | First-person gun with ADS, sway, bob, recoil and reload animations |
| `loot.js` | Rolls loot for containers and bodies |
| `hud.js` | Compass, rotating minimap, tactical map, vitals, hit markers, damage direction, loot and backpack panel |
| `hq.js` | Menu between raids, stash, shop, debrief |
| `save.js` | localStorage progression, loadout removal on deploy, merging raid results, insurance |
| `audio.js` | Procedural WebAudio for gunshots, hit markers, the helicopter and the geiger counter |

## Ideas for next steps

- Real models and animations (glTF), weapon attachments, more weapon types
- Multi-storey buildings with stairs, plus locked rooms that need keys
- Vehicles, more contract types, more bosses, the AI using cover
- Co-op squads (WebRTC or a small WebSocket server)
