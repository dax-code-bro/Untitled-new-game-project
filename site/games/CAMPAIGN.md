# Writing the campaign

The campaign plays story missions on the multiplayer engine: the same four
maps (Town, Helipad, Resort, Demolition), the same movement, guns, bots and
pathfinding, with a director on top that decides who is in play, what the
bots are trying to do, what is said, where the camera goes in a cutscene,
and what counts as done.

| File | What it is |
| --- | --- |
| `campaign.html` | The mission list and the page a mission plays in |
| `campaign-missions.js` | **The missions. This is the file you edit.** |
| `campaign.js` | The director that plays them |
| `engine/test/campaign.test.js` | Plays a mission through every kind of step |

Open `site/games/campaign.html` to play. `?mission=<id>` jumps straight
into one; `?all=1` unlocks every mission; `&fresh=1` ignores a saved
checkpoint.

## A mission

```js
{
  id: 'first-light',              // unique, used for saves and ?mission=
  title: 'First Light',
  place: 'Town -- the high street, 05:40',
  map: 'town',                    // town | helipad | resort | demolition
  player: { operator: 'delta', loadout: null },   // null: your multiplayer loadout
  allies: [                       // your squad, in order
    { name: 'Reyes', operator: 'alpha', voice: { pitch: 104 } },
  ],
  enemies: 8,                     // most hostiles alive at once (4..11)
  briefing: [ /* lines */ ],      // spoken over the briefing card
  steps: [ /* steps */ ],         // played in order
  debrief: [ /* lines */ ],       // after the last step
}
```

Missions unlock in order: finishing one unlocks the next on that machine.

## Lines

```js
{ who: 'Reyes', text: 'Stay tight. Eyes on the windows.', emotion: 'focus' }
```

- `who`: `'you'`, `'radio'`, or an ally's `name`.
- `emotion` (optional): `neutral happy relief pain fear anger surprise sad focus`.
- `wait` (optional): seconds of silence after the line (default 0.35).

Every line is spoken in the speaker's own voice (the ally's `voice.pitch`)
and subtitled. When the speaker is an ally you can see, their face says it:
the mouth makes the shapes of the words, the face takes the emotion, and
the rest of the squad looks at whoever is talking.

## Steps

Every step can also have:

- `objective`: the text shown top-left (and on the briefing card).
- `say`: lines spoken when the step starts.
- `done`: lines spoken when it is completed.
- `checkpoint: true`: dying after this point restarts at this step, from
  where you were standing when it began. Quitting and coming back does too.

| type | fields | done when |
| --- | --- | --- |
| `reach` | `at`, `r` (metres) | you are within `r` of `at`. A marker shows the place and the distance. |
| `eliminate` | `spawn: [spawn]` | every hostile it spawned is dead |
| `defend` | `at`, `r`, `seconds`, `waves: [wave]` | you have spent `seconds` inside the area and the last wave is dead |
| `interact` | `at`, `prompt`, `seconds` | you hold **F** at `at` for `seconds` |
| `survive` | `seconds`, `waves` | you are alive after `seconds` |
| `talk` | `lines` | the lines have been said |
| `cutscene` | `shots`, `lines` | the camera path and the lines are finished (**Space** skips) |
| `wait` | `seconds` | the time has passed |

## Places

`at` (and `from`, `to`, `look` in shots) can be:

- `[x, z]`: world metres.
- An anchor on the map: `'spawnA:0'` to `'spawnA:5'` (your side's spawns),
  `'spawnB:0'` to `'spawnB:5'` (the far side's), `'site:<id>'` (the bomb
  sites: Town has `ovens`, `pit`, `square`), `'lane:0'` to `'lane:2'`.
- An anchor with an offset: `{ at: 'site:square', dx: 4, dz: -2 }`.

## Spawns and waves

```js
{ at: 'site:square', count: 3, spread: 6, skill: 1, hold: 'site:square' }
```

- `count` hostiles appear around `at`, within `spread` metres.
- `skill` is 0 (recruit) to 3 (veteran).
- `hold` (optional): they guard that place instead of coming for you.

A wave is `{ delay: 16, spawn: [ /* spawns */ ] }`: `delay` is seconds
after the step began.

## Cutscene shots

```js
{ from: { at: 'spawnA:3', dz: -6 }, to: { at: 'spawnA:3', dz: 4 },
  height: 9, look: 'site:square', lookTo: 'site:pit', seconds: 4.5, fov: 50 }
```

The camera glides from `from` to `to` at `height` metres above the ground,
looking at `look` (and turning to `lookTo`, if given), over `seconds`.
Shots play one after another; the cutscene holds on the last frame until its
lines are finished. The HUD is hidden and the controls are held during it.

## Your squad

Allies follow you, fight what they see, and look at whoever is talking. A
squadmate who goes down is back on their feet beside you a few seconds
later. Hostiles never come back by themselves: only a step brings them in.

## For a programmer

The director talks to the match through hooks it keeps for this:

- `M.director.goalFor(p)` says where each bot is heading.
- `M.director.noRespawn(p)` and `M.director.spawnFor(p)` control respawning.
- `M.spawnAt(p, [x, z], yaw)`, `M.park(p)`, `M.groundAt(x, z)` and
  `M.finish(winner)` are available on the match.

It talks to the game through the api that `MP_GAME.start` returns:

- `api.cinematic`: a function returning `{ eye, at, fov }` each frame.
- `api.lockControls(on)`, `api.interactHeld()` and `api.skipHeld()`.

A new step type is a `case` in `tickStep` in `campaign.js`.

## Missions with a cast: scene and play steps

Burning Sky (`missions/m1-burning-sky.js`) is written differently from the
data missions above: as a screenplay. Its people are the story's cast
(`campaign-cast.js`), its map is `campaign-maps.js`, and two step types run
a script on the stage (`campaign-stage.js`):

- `scene`: a cutscene. The camera, the bars and the controls belong to the
  script. Holding Skip calls the step's `skip(S)` (put the world where the
  scene would have left it) and counts against completion.
- `play`: gameplay with a script running alongside it (waves, snipers,
  floors, the mortar). The player plays; the script watches and reacts.

Both are generator functions handed the stage `S`. Each `yield` waits for
what it is given, and everything else carries on in the background:

```js
{ id: 'rooftop', type: 'scene', run: function* (S) {
    S.shot({ eye: [1.2, 15.2, -45.9], at: [-1.6, 15.0, -45.9], fov: 34 });
    S.cast.lincoln.play('handshake');
    S.line('lincoln', 'Sharp. Took your sweet time.');
    yield S.quiet();                       // until the line is said
    S.boom([2.6, 1.6, -18], 2.2);          // a mortar on the tank
    yield S.wait(0.4);
  } }
```

The stage gives a script:

- People: `S.extra(id, castKey)` builds a cast member once (in
  `mission.setup`); `S.cast[id]` then `.at(p, yaw, clip)`, `.walkTo(p)`,
  `.play(clip)`, `.turnTo(yaw)`, `.arm(on)`, `.rideOn(vehicle, local)`,
  `.feel(emotion)`, `.look(other)`, `.hide()`. Story clips: sit, sitTable,
  handshake, point, duck, cheer, binoculars, gesture, mortarLoad.
- The squad (the match's allies): `S.squad('away' | 'fight' | 'trail' |
  'hold')`, and `S.squadFromExtras(ids, mode)` to swap cutscene copies for
  the real thing where they stand.
- Camera: `S.shot({ eye, at, fov, to: { eye, at, fov }, secs })`, where eye
  and at may be functions so the camera can follow something moving;
  `S.camRig(fn)`; `S.shake(k)`.
- Vehicles: `S.vehicle('helicopter' | 'tank' | 'mortar')`, moved by setting
  `x y z yaw pitch roll` (and `rotor spin`, `turret gun`), or by `update`.
- Effects: `S.boom(at, scale)`, `S.burn(at, size)`, `S.whistle(secs)`,
  `S.rotorSound()`, `S.tracer(a, b)`.
- Screen: `S.line(who, text, opts)`, `S.title(lines)`, `S.toast(text)`,
  `S.hud(html)`, `S.binoculars(on)`, `S.fade(to, secs)`.
- Time: `S.wait(secs)`, `S.quiet()`, `S.arrive(...people)`, `S.until(fn)`,
  `S.after(secs, fn)`, `S.every(fn)`. All game time, never setTimeout.

`friendlyFire: true` on a mission makes shooting any teammate (a squadmate
or any extra) cut to black with FRIENDLY FIRE WILL NOT BE TOLERATED and
restart the last checkpoint. `mission.passed(stats, S)` returns the stars,
completion and rows for the Mission Passed screen (restart, next mission,
main menu, and its own music). `stats` holds deaths, friendly fire,
cutscenes skipped, intel found, and hostiles spawned and killed.
