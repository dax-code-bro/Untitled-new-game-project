/* ================================================================
   THE CAMPAIGN'S MISSIONS
   ================================================================
   Everything a mission is, as data. campaign.js (the director) reads
   this and plays it on the multiplayer engine: the same maps, the same
   movement, guns, bots and pathfinding, with a story on top.

   This file is the one to edit to write the campaign. The format is
   documented in full in CAMPAIGN.md next to it; in short:

   A MISSION
     id, title, place      shown on the briefing and the mission list
     map                   'town' | 'helipad' | 'resort' | 'demolition'
     time                  time of day 0..24 (optional)
     player                { operator, loadout } -- loadout as the
                           multiplayer lobby writes it, or null for default
     allies                [{ name, operator, voice }] -- your squad
     enemies               how many hostiles the mission can have alive
                           at once (the pool; 4..11)
     briefing              [line] spoken over the briefing screen
     steps                 [step] played in order (below)
     debrief               [line] after the last step

   A LINE   { who, text, emotion?, wait? }
     who      'you', 'radio', or an ally's name
     emotion  neutral happy relief pain fear anger surprise sad focus
     wait     seconds of silence after it (default 0.35)

   A STEP   { type, objective, ...type fields, say?, checkpoint? }
     reach      at, r            get to a place
     eliminate  spawn            kill every hostile it spawns
     defend     at, r, seconds, waves   hold an area while waves come
     interact   at, prompt, seconds     hold the interact key at a spot
     survive    seconds, waves   stay alive
     talk       lines            a conversation; nothing else happens
     cutscene   shots, lines     the camera takes over (shots below)
     wait       seconds          a pause

     say         lines spoken when the step starts
     done        lines spoken when it is completed
     checkpoint  true: dying after this point restarts HERE

   A PLACE (at)  [x, z], or an anchor string:
     'spawnA:2'  'spawnB:0'  'site:square'  'lane:1'
     with an optional offset:  { at: 'site:square', dx: 4, dz: -2 }

   A SPAWN  { at, count, operator?, skill? (0..3), spread? }
   A WAVE   { delay, spawn: [spawn] }
   A SHOT   { from: [x,y,z] | place, to: [x,y,z] | place, look: place,
              lookTo?: place, seconds, height? }
   ================================================================ */
(function () {
  var W = window;

  var MISSIONS = [
    {
      id: 'first-light',
      title: 'First Light',
      place: 'Town -- the high street, 05:40',
      map: 'town',
      time: 6.2,
      player: { operator: 'delta', loadout: null },
      allies: [
        { name: 'Reyes', operator: 'alpha', voice: { pitch: 104 } },
        { name: 'Okafor', operator: 'charlie', voice: { pitch: 92 } },
      ],
      enemies: 8,
      briefing: [
        { who: 'radio', text: 'Bravo, this is Overlord. The town went quiet at midnight and our forward team has not checked in since.' },
        { who: 'radio', text: 'Push up the high street, clear the market square, and find out what happened to them.' },
        { who: 'Reyes', text: 'Copy that. We move on your word.', emotion: 'focus' },
      ],
      steps: [
        { type: 'cutscene', objective: 'Town',
          shots: [
            { from: { at: 'spawnA:3', dz: -6 }, height: 9, look: 'site:square', seconds: 4.5, to: { at: 'spawnA:3', dz: 4 } },
          ],
          lines: [{ who: 'Okafor', text: 'Not a light on anywhere. I do not like it.', emotion: 'fear' }] },
        { type: 'reach', objective: 'Move up to the end of the high street', at: { at: 'lane:1', dz: -30 }, r: 5,
          say: [{ who: 'Reyes', text: 'Stay tight. Eyes on the windows.', emotion: 'focus' }],
          checkpoint: true },
        { type: 'eliminate', objective: 'Clear the market square',
          spawn: [{ at: 'site:square', count: 3, spread: 6, skill: 1 }, { at: { at: 'site:square', dx: -10, dz: 8 }, count: 2, spread: 3, skill: 1 }],
          say: [{ who: 'Okafor', text: 'Contact! Hostiles in the square!', emotion: 'fear' }],
          done: [{ who: 'Reyes', text: 'Square is clear. Good work.', emotion: 'relief' }],
          checkpoint: true },
        { type: 'interact', objective: 'Search the forward team\'s radio', at: { at: 'site:square', dx: 3, dz: -2 }, prompt: 'Hold F to search the radio', seconds: 3,
          done: [
            { who: 'you', text: 'Their radio is here. Still warm.' },
            { who: 'radio', text: 'Bravo, we are reading movement at the bakery. They are regrouping. Hold the square.' },
          ] },
        { type: 'defend', objective: 'Hold the square', at: 'site:square', r: 12, seconds: 45,
          waves: [
            { delay: 2, spawn: [{ at: 'site:ovens', count: 2, spread: 3, skill: 1 }] },
            { delay: 16, spawn: [{ at: 'site:pit', count: 3, spread: 4, skill: 2 }] },
            { delay: 30, spawn: [{ at: 'spawnB:2', count: 3, spread: 5, skill: 2 }] },
          ],
          say: [{ who: 'Reyes', text: 'Here they come! Find cover!', emotion: 'anger' }],
          done: [{ who: 'Okafor', text: 'That is the last of them.', emotion: 'relief' }],
          checkpoint: true },
        { type: 'reach', objective: 'Get to the extraction point', at: { at: 'spawnB:2', dz: -6 }, r: 5,
          say: [{ who: 'radio', text: 'Bravo, extraction is waiting at the north end of town. Move.' }] },
      ],
      debrief: [
        { who: 'radio', text: 'Good copy, Bravo. Whatever took the forward team is still out there. Get some rest.' },
        { who: 'Reyes', text: 'Rest. Right.', emotion: 'sad' },
      ],
    },
    {
      id: 'lift-off',
      title: 'Lift Off',
      place: 'Helipad -- the fuel farm, 16:10',
      map: 'helipad',
      time: 16.2,
      player: { operator: 'delta', loadout: null },
      allies: [{ name: 'Reyes', operator: 'alpha', voice: { pitch: 104 } }],
      enemies: 7,
      briefing: [
        { who: 'radio', text: 'The helicopter is fuelled and waiting. Hostiles hold the fuel farm between you and the pad.' },
        { who: 'Reyes', text: 'So we go through them. Simple.', emotion: 'focus' },
      ],
      steps: [
        { type: 'reach', objective: 'Get to the fuel farm', at: { at: 'lane:0', dz: -18 }, r: 6, checkpoint: true },
        { type: 'eliminate', objective: 'Take the fuel farm', spawn: [{ at: { at: 'lane:0', dz: 4 }, count: 4, spread: 7, skill: 2 }],
          done: [{ who: 'Reyes', text: 'Farm is ours. Get to the pad!', emotion: 'relief' }], checkpoint: true },
        { type: 'survive', objective: 'Survive until the helicopter lands', seconds: 30,
          waves: [{ delay: 4, spawn: [{ at: 'spawnB:1', count: 3, spread: 5, skill: 2 }] }, { delay: 18, spawn: [{ at: 'spawnB:4', count: 3, spread: 5, skill: 2 }] }],
          say: [{ who: 'radio', text: 'Thirty seconds out. Hold on.' }] },
        { type: 'reach', objective: 'Board the helicopter', at: 'lane:1', r: 6 },
      ],
      debrief: [{ who: 'radio', text: 'Wheels up. Well done, Bravo.' }],
    },
  ];

  W.CAMPAIGN_MISSIONS = MISSIONS;
})();
