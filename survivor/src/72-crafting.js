/* ============================================================
   CRAFTING — from nothing, in the order you can actually do it.

   The island gives you nothing but what is growing on it and what
   is lying in the buildings, and the game had no way to turn the
   first into the second. You needed an axe to fell a tree, planks
   to build, and a hammer to nail them together, and there was no
   recipe for any of the three: the whole survival half of the game
   was behind a door with no handle.

   So: a recipe tree that starts at things you can pick up with
   bare hands and ends at a house.

     bare hands  -> stick, stone, bark, plant fibre, flint
     fibre       -> cordage
     stone+stick -> stone knife -> hand axe -> stone axe
     stone axe   -> logs -> planks
     bark+cordage-> a shelter that will keep you alive tonight

   Every recipe is a real one. A stone axe is a shaped head, a
   split haft and a wrapped lashing, and it takes an hour and a
   half because that is how long it takes. Cordage is twisted plant
   fibre — two-ply, reverse-wrapped — and a metre of it is twenty
   minutes of sitting still. Nothing here is instant, because the
   thing the game is about is that time and warmth and calories are
   the currency, and a recipe that costs nothing costs nothing.
   ============================================================ */

/* What a thing is made of, what you need in your hands to make it,
   how long it takes, and how much of the skill it wants. `station`
   means it cannot be done sitting on the ground.

   `yield` is how many you get. `consumes` is spent whatever happens;
   `needs` is a tool that has to be present and is not used up (though
   it does wear). */
const RECIPES = {
  /* --- cordage and the things that need it --- */
  cordage: {
    id: 'cordage', name: 'cordage', category: 'materials',
    consumes: { plantFibre: 3 }, needs: [], seconds: 1200, yield: 1,
    skill: 'carpentry', difficulty: 0.1,
    note: 'Two-ply reverse-wrapped. Twenty minutes for a metre, and everything else needs it.',
  },
  sinewCord: {
    id: 'sinewCord', name: 'sinew cord', category: 'materials',
    consumes: { sinew: 2 }, needs: [], seconds: 900, yield: 1,
    skill: 'carpentry', difficulty: 0.2,
    note: 'Dried leg sinew, chewed soft and laid up. Stronger than plant fibre and it hates damp.',
  },

  /* --- the first tool, which is the one that unlocks the island --- */
  stoneKnife: {
    id: 'stoneKnife', name: 'stone knife', category: 'tools',
    consumes: { flint: 1, stick: 1, cordage: 1 }, needs: [], seconds: 2700, yield: 1,
    skill: 'carpentry', difficulty: 0.25, durability: 40,
    note: 'A struck flake, hafted and lashed. It is not much, and without it you have nothing.',
  },
  handAxe: {
    id: 'handAxe', name: 'hand axe', category: 'tools',
    consumes: { stone: 2 }, needs: [], seconds: 1800, yield: 1,
    skill: 'carpentry', difficulty: 0.15, durability: 60,
    note: 'A cobble knapped to an edge, held in the fist. Crude, and it will get you bark and kindling.',
  },
  stoneAxe: {
    id: 'stoneAxe', name: 'stone axe', category: 'tools',
    consumes: { stone: 1, stick: 2, cordage: 2 }, needs: ['stoneKnife'], seconds: 5400, yield: 1,
    skill: 'carpentry', difficulty: 0.4, durability: 120, tool: 'axe',
    note: 'A ground head in a split haft, wrapped wet so it tightens as it dries. Ninety minutes, and then you can fell trees.',
  },
  stonePick: {
    id: 'stonePick', name: 'stone pickaxe', category: 'tools',
    consumes: { stone: 2, stick: 2, cordage: 2 }, needs: ['stoneKnife'], seconds: 5400, yield: 1,
    skill: 'carpentry', difficulty: 0.4, durability: 100, tool: 'pick',
    note: 'A pointed head rather than an edge. For rock, ore and frozen ground.',
  },
  spear: {
    id: 'spear', name: 'spear', category: 'tools',
    consumes: { stick: 1, flint: 1, cordage: 1 }, needs: ['stoneKnife'], seconds: 3600, yield: 1,
    skill: 'hunting', difficulty: 0.3, durability: 30, tool: 'spear',
    note: 'A fire-hardened shaft and a bound point. It will kill a pig and it will keep a bear honest.',
  },
  boneNeedle: {
    id: 'boneNeedle', name: 'bone needle', category: 'tools',
    consumes: { bone: 1 }, needs: ['stoneKnife'], seconds: 1800, yield: 1,
    skill: 'carpentry', difficulty: 0.45, durability: 60,
    note: 'Split, ground and drilled. Without one you cannot sew a hide into anything worth wearing.',
  },

  /* --- the bow, which is the difference between eating and not --- */
  bow: {
    id: 'bow', name: 'bow', category: 'tools',
    consumes: { stave: 1, cordage: 3 }, needs: ['stoneKnife'], seconds: 14400, yield: 1,
    skill: 'carpentry', difficulty: 0.6, durability: 200, tool: 'bow',
    note: 'Four hours of tillering, and if you rush it, it breaks on the fifth draw.',
  },
  arrow: {
    id: 'arrow', name: 'arrows', category: 'tools',
    consumes: { stick: 1, flint: 1, feather: 2, cordage: 1 }, needs: ['stoneKnife'],
    seconds: 1800, yield: 4, skill: 'carpentry', difficulty: 0.35,
    note: 'Four at a time: straightened shafts, a knapped point, three feathers split and bound.',
  },

  /* --- worked materials --- */
  plank: {
    id: 'plank', name: 'planks', category: 'materials',
    consumes: { timber: 1 }, needs: ['axe'], seconds: 2400, yield: 3,
    skill: 'carpentry', difficulty: 0.3,
    note: 'Riven, not sawn — split along the grain with wedges, which is faster and stronger.',
  },
  charcoal: {
    id: 'charcoal', name: 'charcoal', category: 'materials',
    consumes: { firewood: 4 }, needs: ['fire'], seconds: 10800, yield: 3,
    skill: 'carpentry', difficulty: 0.4,
    note: 'A covered burn. Three hours, and it is what gets a forge hot enough to matter.',
  },
  nails: {
    id: 'nails', name: 'nails', category: 'materials',
    consumes: { scrapMetal: 1, charcoal: 1 }, needs: ['hammer', 'fire'], seconds: 1800, yield: 8,
    skill: 'carpentry', difficulty: 0.5,
    note: 'Drawn out of scrap over a charcoal fire. Eight at a time if the fire is right.',
  },
  hammer: {
    id: 'hammer', name: 'hammer', category: 'tools',
    consumes: { stone: 1, stick: 1, cordage: 2 }, needs: ['stoneKnife'], seconds: 2700, yield: 1,
    skill: 'carpentry', difficulty: 0.3, durability: 150, tool: 'hammer',
    note: 'A hafted stone head. It drives nails and it does not much care that it is not steel.',
  },
  tannedHide: {
    id: 'tannedHide', name: 'tanned hide', category: 'materials',
    consumes: { hide: 1, brain: 1 }, needs: [], seconds: 28800, yield: 1,
    skill: 'butchering', difficulty: 0.5,
    note: 'Brain-tanned and smoked. Every animal has just enough brain to tan its own hide, which is not a coincidence.',
  },

  /* --- clothing, because the island is cold and you start in what
         you washed up in --- */
  hideBoots: {
    id: 'hideBoots', name: 'hide boots', category: 'clothing',
    consumes: { tannedHide: 1, sinewCord: 2 }, needs: ['boneNeedle'], seconds: 10800, yield: 1,
    skill: 'carpentry', difficulty: 0.5, clo: 0.5, slot: 'feet',
    note: 'Wet feet are how people die of cold in weather that would not otherwise kill them.',
  },
  hideCoat: {
    id: 'hideCoat', name: 'hide coat', category: 'clothing',
    consumes: { tannedHide: 3, sinewCord: 4 }, needs: ['boneNeedle'], seconds: 28800, yield: 1,
    skill: 'carpentry', difficulty: 0.6, clo: 1.6, slot: 'torso',
    note: 'Three hides and a day of sewing. It is the single biggest thing you can do about the cold.',
  },
  hideTrousers: {
    id: 'hideTrousers', name: 'hide trousers', category: 'clothing',
    consumes: { tannedHide: 2, sinewCord: 3 }, needs: ['boneNeedle'], seconds: 21600, yield: 1,
    skill: 'carpentry', difficulty: 0.55, clo: 1.0, slot: 'legs',
    note: '',
  },
  furHat: {
    id: 'furHat', name: 'fur hat', category: 'clothing',
    consumes: { tannedHide: 1, sinewCord: 1 }, needs: ['boneNeedle'], seconds: 7200, yield: 1,
    skill: 'carpentry', difficulty: 0.4, clo: 0.4, slot: 'head',
    note: 'A tenth of your heat goes out of your head, and a hat is cheap.',
  },

  /* --- shelter and fire, which are tonight's problem --- */
  tinderBundle: {
    id: 'tinderBundle', name: 'tinder bundle', category: 'survival',
    consumes: { bark: 2, plantFibre: 2 }, needs: [], seconds: 600, yield: 1,
    skill: 'carpentry', difficulty: 0.1,
    note: 'Shredded inner bark in a nest. Dry tinder is most of what a fire is.',
  },
  bowDrill: {
    id: 'bowDrill', name: 'bow drill', category: 'survival',
    consumes: { stick: 3, cordage: 1 }, needs: [], seconds: 2400, yield: 1,
    skill: 'carpentry', difficulty: 0.35, durability: 25,
    note: 'Hearth, spindle, bearing block and a bow. It makes fire without a lighter, which is what you have.',
  },
  barkShelter: {
    id: 'barkShelter', name: 'bark lean-to', category: 'survival',
    consumes: { bark: 6, stick: 8, cordage: 3 }, needs: [], seconds: 5400, yield: 1,
    skill: 'carpentry', difficulty: 0.2, place: true,
    note: 'Slabs of bark over a ridge pole. Ugly, an hour and a half, and it is the difference tonight.',
  },
  waterskin: {
    id: 'waterskin', name: 'waterskin', category: 'survival',
    consumes: { tannedHide: 1, sinewCord: 1 }, needs: ['boneNeedle'], seconds: 5400, yield: 1,
    skill: 'carpentry', difficulty: 0.4, litres: 2,
    note: 'Two litres. Carrying water is what lets you leave the river.',
  },
};

/* Raw materials, and where they come from. This is the other half of
   the problem the game had: knowing a recipe is no use if there is no
   verb anywhere that produces its inputs. */
/* How much room a thing takes and what it weighs. A pack that fills up
   after forty handfuls of plant fibre is not the problem; a pack that
   fills up and then silently swallows everything you make is. */
const MATERIAL_BULK = {
  plantFibre: { massKg: 0.05, volumeL: 0.12 },
  stick: { massKg: 0.25, volumeL: 0.30 },
  stone: { massKg: 0.9, volumeL: 0.35 },
  flint: { massKg: 0.3, volumeL: 0.12 },
  bark: { massKg: 0.2, volumeL: 0.5 },
  feather: { massKg: 0.005, volumeL: 0.05 },
  stave: { massKg: 1.4, volumeL: 2.0 },
  scrapMetal: { massKg: 1.1, volumeL: 0.4 },
  cordage: { massKg: 0.06, volumeL: 0.1 },
  sinewCord: { massKg: 0.04, volumeL: 0.08 },
  charcoal: { massKg: 0.12, volumeL: 0.3 },
  nails: { massKg: 0.02, volumeL: 0.02 },
  plank: { massKg: 3.2, volumeL: 3.0 },
  tannedHide: { massKg: 2.2, volumeL: 4.0 },
  bone: { massKg: 0.3, volumeL: 0.4 },
  sinew: { massKg: 0.03, volumeL: 0.05 },
  brain: { massKg: 0.4, volumeL: 0.4 },
};

function bulkOf(item) {
  return MATERIAL_BULK[item] || { massKg: 0.6, volumeL: 0.6 };
}

const GATHER = {
  stick: { name: 'stick', from: ['deadfall', 'bush', 'tree'], tool: null, seconds: 40, yield: [1, 3] },
  stone: { name: 'stone', from: ['rock', 'scree', 'shore'], tool: null, seconds: 30, yield: [1, 2] },
  flint: { name: 'flint', from: ['rock', 'scree', 'riverbank'], tool: null, seconds: 90, yield: [1, 1], chance: 0.45 },
  plantFibre: { name: 'plant fibre', from: ['bush', 'meadow', 'reeds'], tool: null, seconds: 60, yield: [2, 5] },
  bark: { name: 'bark', from: ['tree', 'deadfall'], tool: 'cutting', seconds: 120, yield: [2, 4] },
  feather: { name: 'feather', from: ['bird', 'nest', 'shore'], tool: null, seconds: 30, yield: [1, 3] },
  stave: { name: 'bow stave', from: ['tree'], tool: 'axe', seconds: 900, yield: [1, 1] },
  scrapMetal: { name: 'scrap metal', from: ['wreck', 'vehicle', 'building'], tool: null, seconds: 120, yield: [1, 2] },
};

/* Which tools satisfy which requirement. A stone knife cuts; so does a
   steel knife you found in a kitchen drawer, and so, badly, does a hand
   axe. The recipe asks for a capability, not a specific object. */
const TOOL_CLASS = {
  cutting: ['stoneKnife', 'knife', 'handAxe', 'stoneAxe', 'axe', 'hatchet'],
  axe: ['stoneAxe', 'axe', 'hatchet'],
  hammer: ['hammer', 'stoneAxe'],
  pick: ['stonePick', 'pickaxe'],
  boneNeedle: ['boneNeedle', 'needle'],
  stoneKnife: ['stoneKnife', 'knife'],
  bow: ['bow'],
  spear: ['spear'],
  fire: ['fire'],                 // a lit fire nearby, not an item
};

function toolSatisfied(requirement, has) {
  const options = TOOL_CLASS[requirement] || [requirement];
  return options.some((o) => has.indexOf(o) >= 0);
}

/* Can this be made right now? Returns what is missing rather than a
   bare no, because "you need two more cordage" is a goal and "no" is a
   dead end. */
function canCraft(recipeId, inventoryCounts, toolsPresent = []) {
  const r = RECIPES[recipeId];
  if (!r) return { ok: false, reason: 'no such recipe' };
  const missing = [];
  for (const [item, n] of Object.entries(r.consumes)) {
    const have = inventoryCounts[item] || 0;
    if (have < n) missing.push({ item, need: n, have, short: n - have });
  }
  const missingTools = (r.needs || []).filter((t) => !toolSatisfied(t, toolsPresent));
  if (missing.length || missingTools.length) {
    return { ok: false, missing, missingTools, recipe: r };
  }
  return { ok: true, recipe: r };
}

/* How long it actually takes you, as opposed to how long it takes
   someone who knows what they are doing. A beginner takes two and a
   half times as long and is more likely to ruin the materials. */
function craftSeconds(recipeId, skill = 0.1) {
  const r = RECIPES[recipeId];
  if (!r) return 0;
  const s = clamp01(skill);
  return r.seconds * (2.5 - 1.6 * s);
}

/* Did it work? Difficulty against skill. A failure eats the materials,
   which is the only reason to care about the skill at all. */
function craftAttempt(recipeId, skill = 0.1, rng = Math.random) {
  const r = RECIPES[recipeId];
  if (!r) return { ok: false, reason: 'no such recipe' };
  const s = clamp01(skill);
  /* A beginner twisting plant fibre into cordage does not fail two times
     in three — it is fiddly, not hard, and you can see whether it is
     working. What a beginner DOES fail at is a bow: four hours of
     tillering and it breaks on the fifth draw. So the floor is high and
     difficulty is what pulls it down.

       cordage  (0.10) at skill 0.1 -> 71%
       stone axe(0.40) at skill 0.1 -> 44%,  at 0.8 -> 79%
       bow      (0.60) at skill 0.1 -> 26%,  at 0.8 -> 61%  */
  const chance = clamp01(0.75 + s * 0.5 - (r.difficulty || 0) * 0.9);
  const ok = rng() < chance;
  return {
    ok,
    yield: ok ? (r.yield || 1) : 0,
    seconds: craftSeconds(recipeId, s),
    // A botched job usually leaves something you can try again with.
    salvage: ok ? null : (rng() < 0.5 ? 'partial' : 'none'),
    reason: ok ? null : 'it comes apart in your hands',
  };
}

/* What you could make right now, and what you nearly could. This is
   what the crafting screen shows, and showing the near-misses is what
   turns "nothing" into "get two more fibre". */
function craftable(inventoryCounts, toolsPresent = [], skill = 0.1) {
  const out = [];
  for (const id of Object.keys(RECIPES)) {
    const c = canCraft(id, inventoryCounts, toolsPresent);
    out.push({
      id, recipe: RECIPES[id], ok: c.ok,
      missing: c.missing || [], missingTools: c.missingTools || [],
      seconds: craftSeconds(id, skill),
    });
  }
  // Things you can make first, then the closest misses.
  out.sort((a, b) => {
    if (a.ok !== b.ok) return a.ok ? -1 : 1;
    const am = a.missing.length + a.missingTools.length;
    const bm = b.missing.length + b.missingTools.length;
    if (am !== bm) return am - bm;
    return a.seconds - b.seconds;
  });
  return out;
}
