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
