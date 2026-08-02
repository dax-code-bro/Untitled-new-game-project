/*
 * THE BIRCH — the campaign.
 *
 * The facility is a sandbox; this file is the thread through it. It holds
 * the day/night clock, the ordered list of beats the player works through,
 * and every line of dialogue, so the story can be edited without touching
 * the engine.
 *
 *   window.STORY.BEATS     — ordered steps, each with an objective line
 *   window.STORY.LINES     — scripted dialogue, keyed by beat
 *   window.STORY.DAY_LEN   — seconds of daylight
 *   window.STORY.NIGHT_LEN — seconds of dark
 */
(function () {
  'use strict';

  var DAY_LEN = 25 * 60;      // 25 minutes to prepare
  var NIGHT_LEN = 10 * 60;    // 10 minutes with it awake

  // Each beat: an id, the objective the HUD shows, and where it happens.
  // `done` is evaluated against the game's story flags every tick.
  //
  // `skip` is what Brian says if the step was already done by the time the
  // story got to it — the facility is a sandbox, so a player can find the
  // Glock or drink the water long before they are told to, and the objective
  // then jumps past it rather than asking for something already in hand.
  // `enter` is a cinematic that plays when the beat becomes the live one.
  var BEATS = [
    { id: 'wifi', obj: 'Get the reception terminal online',
      hint: 'There is a password somewhere behind that desk.',
      done: function (f) { return f.wifiConnected; } },

    { id: 'cameras', obj: 'Plant all five security cameras',
      hint: 'The crate in the corner of the waiting room.',
      skip: 'Cameras are already up.',
      done: function (f) { return f.camsPlanted >= 5; } },

    { id: 'findHim', obj: 'Check the feeds — find what is in here with you',
      hint: 'One camera was already here. It still works.',
      skip: 'I have already seen it.',
      done: function (f) { return f.sawBirch; } },

    { id: 'shock', obj: 'CAM 0 has a taser. Use it',
      hint: 'Your cameras are older stock. That one is not.',
      skip: 'Already put the current through it.',
      done: function (f) { return f.shockedInCage; } },

    { id: 'sealEast', obj: 'SEAL THE EAST DOOR', timer: 30,
      hint: 'Hard Seal, on the terminal. Now.',
      fail: 'caught',
      skip: 'East door is already down.',
      done: function (f) { return f.sealedEast; } },

    { id: 'gun', obj: 'Daylight. Unlock the storage unit and take the Glock',
      hint: 'The key was on the reception desk.',
      skip: 'Glock is already on my hip.',
      done: function (f) { return f.hasGlock; } },

    { id: 'food', obj: 'Take water and beans from the warehouse',
      hint: 'The shelf on the west wall.',
      skip: 'Already ate. Already drank.',
      done: function (f) { return f.ate && f.drank; } },

    { id: 'power', obj: 'Restore the facility power',
      hint: 'A panel in the storage unit. The wires are crossed.',
      enter: 'realise',
      skip: 'Power is already up.',
      done: function (f) { return f.powerOn; } },

    { id: 'sealWest', obj: 'THE ALARM TOLD IT WHERE YOU ARE — SEAL THE WEST DOOR', timer: 25,
      hint: 'Get to the desk.',
      fail: 'caught',
      skip: 'West door is already down.',
      done: function (f) { return f.sealedWest; } },

    { id: 'survive', obj: 'Survive the night',
      hint: 'Sleep when you are fed, watered, rested — and it is not at the door.',
      skip: 'I already slept.',
      done: function (f) { return f.slept; } },

    { id: 'phone', obj: "Take the lead scientist's phone",
      hint: 'Extermination chamber. He is the one in the containment uniform.',
      skip: 'His phone is already in my pocket.',
      done: function (f) { return f.hasPhone; } },

    { id: 'charge', obj: 'Charge the phone at the terminal',
      hint: 'The USB lead runs into the reception computer.',
      skip: 'It has charge already.',
      done: function (f) { return f.phoneCharged; } },

    { id: 'email', obj: 'Open his email and accept the code',
      hint: 'One percent is enough.',
      skip: 'I already have the code.',
      done: function (f) { return f.emailOpen; } },

    { id: 'map', obj: 'Pull the facility layout',
      hint: 'The terminal has a fourth app now.',
      skip: 'I have seen the layout.',
      done: function (f) { return f.sawMap; } },

    { id: 'sledge', obj: 'Get the sledgehammer from the storage unit',
      hint: 'Against the racking.',
      skip: 'Sledgehammer is already in hand.',
      done: function (f) { return f.hasSledge; } },

    { id: 'breakWall', obj: 'Break open the sealed elevator shaft',
      hint: 'The corner of the storage unit reads hollow.',
      skip: 'The shaft is already open.',
      done: function (f) { return f.shaftOpen; } },

    { id: 'descend', obj: 'Climb down',
      hint: 'Tape the torch to your shoulder.',
      skip: 'I am already down here.',
      done: function (f) { return f.underground; } },

    { id: 'cells', obj: 'Find out what they were doing down here',
      hint: 'The keycard is on the desk in the middle of the floor.',
      skip: 'I have already been in that cell.',
      done: function (f) { return f.openedCell; } },

    { id: 'radio', obj: 'That radio is receiving something',
      hint: 'Turn it on.',
      skip: 'I already heard him.',
      done: function (f) { return f.heardRadio; } },

    { id: 'barracks', obj: 'North section — find the Camper Barracks',
      hint: 'Someone down here is still alive.',
      skip: 'I have already found him.',
      done: function (f) { return f.metJames; } }
  ];

  // Scripted dialogue. Each entry is a list of [delayMs, speaker, text].
  // speaker '' is Brian's own head; 'RADIO' and 'JAMES' are voices.
  var LINES = {
    intro: [
      [0, '', 'Brian Truffle. Intake, day one. Nobody said anything about a night shift.'],
      [4200, '', 'That desk had a terminal. Start there.']
    ],
    sawBirch: [
      [0, '', 'That is the cage from Assembly. The one that was torn open from the inside.'],
      [4600, '', 'And it climbed back in. Like it is charging.'],
      [9200, '', 'CAM 0 was already here when I got here. Older, uglier — and it has a taser in it.']
    ],
    shocked: [
      [0, '', 'It takes the current.'],
      [1500, '', 'It is looking at the lens.'],
      [3600, '', 'It is looking at ME through the lens—']
    ],
    camDead: [
      [0, '', 'CONNECTION LOST. It came out of that cage like the bars were paper.'],
      [3800, '', 'East corridor. It is coming through the east door. SEAL IT.']
    ],
    sealedEast: [
      [0, '', 'Tungsten. Earthquake-rated. It is hitting it anyway.'],
      [4500, '', 'Hold. Just hold.'],
      [9000, '', 'It stopped. It got light out. It stopped when it got light out.']
    ],
    dawn: [
      [0, '', 'Daylight through the front glass. Twenty-five minutes of it, if the clock on the wall is honest.'],
      [5000, '', 'It hides in the day. So I move in the day.']
    ],
    gotGun: [
      [0, '', "Nick's Glock. Thirty-four rounds and a note asking me to call his parents."],
      [5200, '', 'I will. If I ever get to a phone that works.']
    ],
    ateBeans: [
      [0, '', 'Chef Rat Beans. Whoever signed off on that name knew.'],
      [4000, '', 'I am renaming these.']
    ],
    realise: [
      [0, '', 'Nothing in this building opens that front door. Not the gun. I tried the gun.'],
      [5400, '', 'The only way to call for help is to BE somewhere I can call for help.'],
      [10200, '', 'And nothing electrical works. Start with that.']
    ],
    powerOn: [
      [0, '', 'Lights.'],
      [1400, '', 'And an alarm across the whole floor, telling it exactly which room I am standing in.'],
      [5000, '', 'Desk. West door. GO—']
    ],
    sealedWest: [
      [0, '', 'Sealed. Sealed. It is on the other side of that.'],
      [5000, '', 'I am going to sit down for a second. Just a second.']
    ],
    slept: [
      [0, '', 'I slept. I actually slept, with that thing walking around out there.'],
      [4800, '', 'The terminal has a map app. It wants the owner\'s email code.'],
      [9600, '', 'The owner is in the extermination chamber with his staff. He is not going to mind.']
    ],
    gotPhone: [
      [0, '', 'Dead. Of course it is dead.'],
      [3200, '', 'There is a USB lead running into the reception computer. Small mercies.']
    ],
    photos: [
      [0, '', 'Wrong app. That is his photos.'],
      [3400, '', 'A girl on his shoulders at some fair. A woman laughing at whoever is holding the camera.'],
      [8400, '', 'He built the thing that is hunting me, and he had a family, and both of those are true.'],
      [13600, '', 'Email. Get the code. Do not look at that again.']
    ],
    sawMap: [
      [0, '', 'Waiting. Corridors. Warehouse. Assembly. Extermination. All of it where it should be.'],
      [5600, '', 'And a second floorplan underneath the first one, greyed out, stamped CLASSIFIED.'],
      [11000, '', 'There is a whole facility under my feet.'],
      [15200, '', 'Storage had a service elevator. They bricked the shaft.']
    ],
    shaftOpen: [
      [0, '', 'The wall goes through on the third swing.'],
      [3000, '', 'No car. No cable. Just a hole that keeps going down past where the torch reaches.'],
      [8000, '', 'Tape the torch to my shoulder. Use the guide rails. Do not look down at nothing.']
    ],
    landed: [
      [0, '', 'Bottom.'],
      [2200, '', 'No lights down here at all. There is something lit at the far end.']
    ],
    cellsSeen: [
      [0, '', 'Containment cells. Dozens of them.'],
      [3600, '', 'Every door has the same stencil. FAILED PROJECT. FAILED PROJECT. FAILED PROJECT.'],
      [9000, '', 'There is a keycard on the desk in the middle of the floor.']
    ],
    openedCell: [
      [0, '', 'A man. Taped to the chair by the wrists.'],
      [3600, '', 'They took things out of him. And they were putting other things in.'],
      [8200, '', 'Not prosthetics. Animal. That is animal.'],
      [13000, '', 'Every scientist down here is gone. Not dead. Gone.']
    ],
    radioOn: [
      [0, '', 'A radio. Please be music. Please just be music.'],
      [4000, 'RADIO', '—this is trial number seven. My name is James Inc.'],
      [8200, 'RADIO', 'My entire squad is dead. Ten of our coworkers went out there and never came back.'],
      [14000, 'RADIO', 'If anyone reaches this radio — we are in the north section. The Camper Barracks.'],
      [20000, 'RADIO', 'Please come here. Anyone. Please.'],
      [25000, '', 'North section. North section, north section—']
    ],
    knock: [
      [0, '', 'Hello? HELLO? My name is Brian Truffle, I work upstairs, I am not one of them—'],
      [6000, 'JAMES', 'On your knees. Hands where I can see them.'],
      [9600, 'JAMES', '...you are a person. You are an actual person.'],
      [13400, 'JAMES', 'James. James Inc. I was a scientist here. I was about to quit anyway.']
    ],
    jamesTalk: [
      [0, 'JAMES', 'You want to know what this place was. Fine.'],
      [3800, 'JAMES', 'They were taking people apart and putting animals back into them. For fun. That is not a figure of speech.'],
      [10400, 'JAMES', 'If the subject failed, they shot it. If the subject worked, they shot it too. That is the whole protocol.'],
      [17600, 'JAMES', 'I have seen a man walk out of that theatre with a crocodile\'s jaw and I have seen what they did to him for it.'],
      [24800, '', 'There is something upstairs. Eleven feet, made out of wood. It has been hunting me for two days.'],
      [30400, 'JAMES', 'The mannequin. You have seen the mannequin.'],
      [34000, 'JAMES', 'Have you found out a way to stop it?'],
      [38200, '', 'No.'],
      [40400, 'JAMES', '...'],
      [43000, 'JAMES', 'Then you need to sit down. Because there is more.']
    ]
  };

  window.STORY = {
    DAY_LEN: DAY_LEN,
    NIGHT_LEN: NIGHT_LEN,
    BEATS: BEATS,
    LINES: LINES,
    beatIndex: function (id) {
      for (var i = 0; i < BEATS.length; i++) if (BEATS[i].id === id) return i;
      return -1;
    }
  };
})();
