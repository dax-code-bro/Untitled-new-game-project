#!/usr/bin/env python3
"""Prove that screenplay-extended.md keeps screenplay.md intact, lint the proposed additions,
and estimate the extended episode's runtime and render cost.

Hard checks (exit code 1 if any fails):
  1. Proof that the original survives. Three independent tests:
       a. every line of screenplay.md (blank lines included) appears, word for word and in the
          same order, as a line of screenplay-extended.md (an in-order subsequence match);
       b. deleting every marked block (plus the one blank line each block brought with it)
          gives back screenplay.md byte for byte, so nothing unmarked was added either;
       c. each of the creator's [ORIGINAL] cue + quote pairs is present unchanged.
     It also prints the sha256 of screenplay.md next to the one dialogue.json was built from.
  2. Markers: every "[PROPOSED ADDITION X# — begin]" has its matching "— end]", ids run X1..Xn
     in order, nothing is nested, every addition opens with a "NOTE (not spoken)" line.
     Document notes use "[EXTENDED EDITION NOTE — begin/end]".
  3. Dependencies: every link in DEPENDS is named in the dependent addition's first NOTE and in
     the closing note's "Links between additions" paragraph.
  4. Canon lint on the new text only: Episode 2 names and terms, Water Gliders, "Bastion", Tara,
     Queen Fall in the story text of any addition but X28, new [ORIGINAL] markers, canonical commands spoken in an
     addition, new spoken orders to dragons, Abby mentioning being queen, and regressions of
     earlier review findings. "--review" prints softer things a person should eyeball.
  5. Runtime model (same as shotlist.json / dialogue.json):
       speech  = words / 2.6 (2.1 for whispered/quietly/low/through pain) + 0.25 s per internal
                 sentence break, min 0.6 s; + 0.35 s cue gap per line
       action  = hand-estimated per shot below (ADDITION_SHOTS), same scale as shotlist.json
       expected = speech + action + breath; tight-cut bound = 0.9/0.8/0.5 x; loose-cut = 1.15/1.3/1.5 x
     Original scenes use shotlist.json scene_totals unchanged. The bounds assume every scene is
     cut at its own extreme at once, so they are outer bounds, not likely values.

Usage:  python3 tools/check_extended.py [--markdown] [--review] [--json out.json] [--ext FILE] [--orig FILE]
        (--ext/--orig check other copies, e.g. a deliberately broken one, instead of the episode's files)
Standard library only. Paths are relative to this file (episodes/s01e01/tools/).
"""
import hashlib
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
EP = os.path.normpath(os.path.join(HERE, ".."))
ORIG = os.path.join(EP, "screenplay.md")
EXT = os.path.join(EP, "screenplay-extended.md")
SHOTLIST = os.path.join(EP, "shotlist.json")
DIALOGUE = os.path.join(EP, "dialogue.json")

BEGIN_RE = re.compile(r"^\[PROPOSED ADDITION (X\d+) — begin\]$")
END_RE = re.compile(r"^\[PROPOSED ADDITION (X\d+) — end\]$")
NOTE_BEGIN, NOTE_END = "[EXTENDED EDITION NOTE — begin]", "[EXTENDED EDITION NOTE — end]"
CUE_RE = re.compile(r"^([A-Z][A-Z .'-]*[A-Z])(?: \[([^\]]+)\])?:$")
WORD_RE = re.compile(r"[A-Za-z0-9]+(?:'[A-Za-z]+)*")
SCENE_RE = re.compile(r"^(PROLOGUE|SCENE (\d[A-Z])) — ")

RATE, RATE_SLOW, BREAK_PAUSE, MIN_LINE, CUE_GAP = 2.6, 2.1, 0.25, 0.6, 0.35
SLOW_NOTES = ("whispered", "quietly", "low", "through pain")
CANONICAL_COMMANDS = {"Attack.", "Fire.", "Hold.", "Hold—", "Hold!", "Skit.", "Free fire.", "Attack!", "Fire!", "Skit!"}
# Short orders that, spoken to a dragon and obeyed at once, would read on screen as new commands
# (screenplay 1F: "use Skit for withdrawal rather than inventing a new formal command set").
ORDER_WORDS = {"up", "down", "now", "go", "back", "again", "slowly", "low", "stay", "there", "turn", "climb",
               "dive", "faster", "away", "here", "come", "left", "right", "gently", "on"}
DRAGONS = ("Charcoal", "Leaf", "Starlight", "the hatchling", "the scout")
FPS = 24
# Measured native-4K speeds (README benchmark 0.50 fps; PRODUCTION_PLAN measured 0.37-0.42 fps
# with a background job) and the shot list's unmeasured heavy-set factor. Test-scene speeds:
# realistic sets will be slower, and nobody has measured them yet.
FPS_BEST, FPS_WORST, HEAVY_SET = 0.50, 0.37, 1.19

# Additions that lean on another one: {dependent: [ids it needs]}. For X24/X25 either id will do.
DEPENDS = {"X8": ["X6"], "X13": ["X12"], "X17": ["X12"], "X19": ["X17"], "X22": ["X21"],
           "X24": ["X14", "X20"], "X25": ["X14", "X20"], "X26": ["X21"]}

# Hand-estimated picture time per shot for each addition: (what we see, action_s, breath_s).
# Same scale as shotlist.json: 2-3 s for a reaction, 3-5 s for a readable action beat, 5-8 s
# for a wide establishing or a big movement. Dialogue time is NOT in here; it is computed from
# the words. "key" is a phrase that must appear in that addition (guards against renumbering).
ADDITION_SHOTS = {
    "X1": {"title": "The queen has waited all night", "key": "the bed has not been slept in", "shots": [
        ("Young attendant hurries along a corridor", 4.5, 0), ("Alexandria at the window, dressed; unslept bed; first light", 5, 1),
        ("She turns before the knock is finished", 2, 0), ("'The egg.' / 'I'm coming.'", 0.5, 0),
        ("She walks the corridor quickly", 4, 0), ("At the door she composes herself and goes in", 3, 0.5)]},
    "X2": {"title": "Leaving the chamber; Abby and Leaf", "key": "Keep her where you can see her", "shots": [
        ("Remi last through the door; Alexandria doesn't look up", 3, 0), ("'Remi.' He stops", 1, 0), ("'I always do.'; he goes", 2, 0.5),
        ("Siblings walk fast down a corridor", 4, 0), ("Servants flatten against the wall", 2.5, 0),
        ("Corridor exchange", 1, 0), ("Abby shoves his arm; out into the light", 3, 0),
        ("Leaf starts toward her, then sits upright, quivering; Remi walks on", 5, 0), ("Wing joints, one at a time", 4, 0),
        ("Each foot; the scrape on the pad; his eye", 5, 0), ("'You'll do.'", 0.5, 0), ("Leaf noses the equipment; pushed away, comes back", 3.5, 0),
        ("Forehead to forehead; his breath", 3, 1),
        ("Alexandria beside the nest looks up at the attendant", 3.5, 0), ("'Go and sleep.'", 0.5, 0),
        ("The attendant goes; the young attendant comes in to take the watch", 3.5, 0), ("Alexandria watching it breathe", 3, 1.5)]},
    "X3": {"title": "Mounting Charcoal; the line", "key": "Checked twice", "shots": [
        ("Remi walks to the access rig", 4, 0), ("Charcoal lowers himself and holds still", 4, 0),
        ("Climb: first turn of the stair", 4, 0), ("Landing: view across his body", 3, 0), ("Top: keepers small below", 3, 0),
        ("Leaf past the stakes, neck stretched; keeper sees", 5, 0), ("'The line.' exchange", 0.5, 0),
        ("Abby turns Leaf back; Charcoal ignores him", 4, 0.5), ("Remi pulls each strap", 4, 0),
        ("'Straps?' 'Checked twice.'", 0.5, 0), ("Keeper checks once more anyway", 3, 0), ("Abby adjusts a strap with both hands", 3, 0),
        ("Leaf shifts his weight", 2, 0), ("Palm on Charcoal's neck", 2, 0), ("Charcoal's eye half closes", 2.5, 1),
        ("Stair drawn back on its runners", 5, 0)]},
    "X4": {"title": "Over Verdor", "key": "They wave at Leaf", "shots": [
        ("Harbor opens below (extreme wide)", 7, 0), ("Leaf low along the harbor wall", 4, 0),
        ("Charcoal's shadow reaches the town first", 4, 0), ("Quay Nightwing sitting upright", 4, 0),
        ("Nightwing walks the net line up the slipway", 6, 0), ("Farmer on a terrace", 3, 0),
        ("Shadow over the market; people carry on", 5, 0), ("Leaf calls; the quay Nightwing answers", 3.5, 0),
        ("The Santa Maria at the quay", 5, 0), ("Lookout waves; Abby waves back", 5, 0),
        ("Leaf climbs back to Charcoal's level", 3.5, 0), ("'They wave at you.'; Abby pats Leaf's neck", 2, 0),
        ("Riding school below; Abby laughs", 8, 0), ("The palace on its high ground", 5, 0), ("Alexandria at the chamber's opening; Remi lifts a hand", 4, 0.5),
        ("Remi looks down over the town", 5, 1), ("Abby watches him", 2, 0), ("'Counting roofs' exchange", 0.5, 0),
        ("Remi looks away to the sea", 2.5, 1), ("Along the coast toward the outer rocks", 5, 0)]},
    "X5": {"title": "Cling, before the festival", "key": "It'll hold until tonight", "shots": [
        ("Cart wheel on paving", 3, 0), ("Empty square, fountain and pillar", 5, 0), ("Camera passes steps, arch, gate, alley, music space", 8, 0),
        ("Vendor builds the stall", 6, 0), ("Wedging the rocking leg", 5, 0), ("Corner hangs low", 3, 0),
        ("Ladder catches the corner (1st)", 4.5, 0), ("Vendor reties it", 3.5, 0), ("Early sounds", 4, 0),
        ("Parent wraps the parcel", 5, 0), ("Child reaches; parent moves it out of reach", 3, 0), ("Child to the doorway", 3, 0),
        ("Musician sits on the fountain rim; loose fastening", 5, 0), ("'Until tonight.' exchange", 0.5, 0.5),
        ("Watchman climbs to his post", 5, 0), ("'Anything?' 'Weather.'", 0.5, 0), ("Watchman's view of a quiet sky", 5, 1),
        ("First banner unrolls", 4, 0)]},
    "X6": {"title": "The outer rocks (race)", "key": "First through the gap", "shots": [
        ("Outer rocks (extreme wide)", 6, 0), ("The gap", 3, 0), ("Mist against the seaward side", 3, 0), ("Abby looks at the gap, then Remi", 2, 0),
        ("Challenge exchange", 0.5, 0), ("Leaf drops away", 3, 0), ("Remi leans; Charcoal goes after them", 2, 0),
        ("Leaf low over the water", 4, 0), ("Leaf threads the gap", 4, 0),
        ("Abby laughing", 2, 0), ("Charcoal climbs over the stacks", 5, 0), ("Downwash ring; seabirds lift off", 4, 0),
        ("Spray on the stone; Remi low", 3, 0), ("Charcoal folds and dives down the far side", 4, 0),
        ("Leaf bursts out, lands on a stack top and sits upright", 6, 0), ("Charcoal checks above the stack; his shadow covers it", 4, 0),
        ("'You won.' exchange", 0.5, 0.5), ("Leaf eyes Charcoal without fear", 3, 0), ("They turn back; mist behind", 5, 0),
        ("The island ahead in morning light; nobody speaks", 7, 1)]},
    "X7": {"title": "Pursuit: height for speed", "key": "The height he paid for becomes speed", "shots": [
        ("The scout draws away in a straight line", 4, 0), ("Remi sees it", 1.5, 0), ("Remi sits back; Charcoal climbs", 5, 0),
        ("Remi's view of the chase below", 4, 0), ("The scout turns; Remi leans forward", 2, 0), ("Charcoal dives; the gap closes", 5, 0),
        ("The rider looks back", 2.5, 0)]},
    "X8": {"title": "Pursuit: sun, rocks and mist", "key": "the scout's shadow", "shots": [
        ("Scout climbs into the sun", 3, 0), ("Remi loses it in the glare", 2.5, 0), ("The scout's shadow on the water", 3.5, 0),
        ("Remi leans; Charcoal turns with the shadow", 3, 0), ("Scout runs for the rocks", 3, 0), ("Remi sees the gap", 2.5, 0),
        ("Scout through the gap", 2.5, 0), ("Wide and low around the stacks", 5, 0), ("Water torn; seabirds again", 3, 0),
        ("Scout exits; Charcoal's shadow ahead", 3.5, 0), ("Scout breaks into the mist", 2.5, 0), ("Scout vanishes into the mist", 2.5, 0),
        ("Charcoal follows; white-out", 3, 0), ("Remi can't see", 2.5, 0), ("Muffled beats; the scout's rhythm", 3.5, 1),
        ("Charcoal's head turns", 2.5, 0), ("Remi gives him his head", 1.5, 0), ("Banks into the white", 2.5, 0), ("Both break out by the rocks, closer", 4, 0)]},
    "X9": {"title": "The harbor sees her", "key": "Master! The princess!", "shots": [
        ("Abby's right hand on the strap; Leaf low and careful", 4, 0), ("Her head sinks; she lifts it", 3, 0),
        ("Lookout hears the wrong wingbeats", 3.5, 0),
        ("Master looks up; the quay stops work", 3, 0), ("Master looks to sea, then his crew", 2.5, 0.5),
        ("Leaf low over the roofs; nobody waves", 4, 0)]},
    "X10": {"title": "Remi's approach", "key": "She's standing", "shots": [
        ("Remi alone above the coast", 4, 0), ("His hands shaking", 3, 0), ("He grips harder", 2.5, 0), ("He looks back at the outer rocks", 3, 0.5), ("Quay and deck look up at him", 3.5, 0),
        ("His view: Abby standing", 5, 0), ("He exhales", 1.5, 1), ("Hand on Charcoal's neck; he turns him away", 3, 0), ("Careful wide descent", 4, 0)]},
    "X11": {"title": "You've done enough today", "key": "You've done enough today", "shots": [
        ("Remi steps after the messenger, turns back", 2.5, 0), ("Ship exchange", 0.5, 0), ("He can't tell how she means it", 1.5, 1),
        ("Alexandria looks Remi over", 3, 0), ("'Are you hurt?' exchange", 0.5, 0.5),
        ("She touches his face; he goes back in", 4, 0.5)]},
    "X12": {"title": "The arm is set", "key": "Don't count. Just do it", "shots": [
        ("Healer ready; Alexandria at Abby's right", 4, 0), ("'I'll count to three.' exchange", 0.5, 0), ("Glance and nod", 2, 0),
        ("Abby's face and joined hands; the cry", 3.5, 1), ("Grip goes white", 1.5, 0), ("Remi turns away, turns back", 3.5, 0),
        ("'You didn't count.' exchange", 0.5, 0), ("Almost a laugh; hand on her hair", 2.5, 0.5), ("Healer binds the arm", 2.5, 0),
        ("Young attendant in the doorway", 3, 0), ("Abby turns toward the door", 2, 0.5), ("'Go.' exchange", 1, 0),
        ("Alexandria rises and leaves with the attendant", 3, 0), ("'You're in my light.'; Remi sits", 2, 0)]},
    "X13": {"title": "The queen and the hatchling", "key": "It will have to be", "shots": [
        ("Corridor", 4, 0), ("Hand on stone, one breath", 3.5, 1.5), ("She walks on", 2.5, 0), ("Chamber; hatchling curled", 4, 0),
        ("Close: shallow breathing", 4, 0), ("Bowls barely touched", 2, 0), ("She lowers herself by the nest", 2.5, 0),
        ("Cloth dipped", 3, 0), ("Held near its mouth; she waits", 3, 1.5), ("A drop gathers", 2.5, 0), ("The drop falls", 2, 0),
        ("Pause", 0, 2), ("It licks at the wet", 2.5, 0), ("Again; its head turns toward the cloth", 3, 0),
        ("Feeding in small amounts", 4, 0), ("She looks at the gold body; hold", 2, 1.5), ("It pushes up, folds, slumps back", 3, 0), ("Attendant reaches; the raised hand", 2, 0),
        ("Second try: head up, trembling, three breaths", 4, 1), ("Cloth handed back", 1.5, 0),
        ("At the door she looks back; it breathes", 4.5, 1)]},
    "X14": {"title": "Cling, midday", "key": "Mostly isn't seeing", "shots": [
        ("Broad road; people arriving", 5, 0), ("Cart wedged by the gate", 4.5, 0), ("Guard shoulders the gate", 2.5, 0),
        ("'Worse every time.'", 0.5, 0), ("They heave; children watch the guard", 5, 0), ("Parent and child through the arch", 3.5, 0),
        ("'Now?' 'Now.'", 0.5, 0), ("Child carries the parcel the last stretch", 5, 0.5), ("Square at midday; guards set the king's seat on the steps", 5.5, 0),
        ("Captain checks the square", 4.5, 0), ("He looks up past the banners", 2, 0), ("Banner exchange", 0.5, 0),
        ("Shrug; captain files it away", 3.5, 0), ("Old woman teaches the dance", 4.5, 0),
        ("The child rushes; the old woman steps it through", 5, 0), ("'Together.'; they try again", 3.5, 0),
        ("Musician plays a few bars", 2.5, 0)]},
    "X15": {"title": "The rig comes off", "key": "He always lets me", "shots": [
        ("Saddle lowered on ropes; Charcoal shifts", 5, 0), ("Remi crosses and takes a rope", 4, 0), ("Soot on the front straps", 3, 0.5),
        ("Keepers slow down at his head", 3.5, 0.5), ("Remi washes Charcoal's jaws", 5, 0), ("Water runs darker, then clear", 2.5, 0),
        ("'He let you.'", 0.5, 0), ("Remi with the empty bucket", 2.5, 1), ("Charcoal eats calmly; keepers watch", 4.5, 0.5)]},
    "X16": {"title": "The Santa Maria sails", "key": "Walk them home", "shots": [
        ("Master checks the deck: rope, canvas, the boat", 4, 0), ("'Cast off!'", 0.5, 0),
        ("Lines off the bollards", 3, 0), ("Poles push off", 3.5, 0), ("First sail fills", 3.5, 0),
        ("Past the harbor wall", 4.5, 0), ("Quay watches; Nightwing's head turns", 3.5, 0), ("Instructor watches; claps once", 2.5, 0),
        ("Riders walk their Nightwings home", 4, 0), ("A gull; every head jerks up", 4, 0.5)]},
    "X17": {"title": "Later, with help", "key": "Not instead of you", "shots": [
        ("Leaf by the doorway; long shadows", 4, 0), ("Bucket; Leaf doesn't drink", 3, 0), ("Keeper speaks to Leaf", 0.5, 0),
        ("Inside: Abby on her feet at the doorway", 3, 0), ("Mother and daughter exchange", 1, 1), ("Alexandria looks at the sling", 2, 0),
        ("Leaf rises and sits upright", 3, 0), ("Abby steps out on her mother's arm", 3, 0), ("Raised hand; Leaf stops", 2, 0),
        ("Leaf lowers his head; Alexandria steps back", 5, 0), ("Hand on Leaf's face", 3, 1.5), ("Leaf's eye turns", 1.5, 0),
        ("Leaf presses his head to her hand", 2.5, 0), ("'Thank you.'", 0, 1), ("Leaf blinks", 1.5, 0),
        ("Leaf breathes out against her hand", 3, 1), ("One-handed: near wing joint, near foot", 4, 0),
        ("Leaf lowers himself and turns so she can reach", 4, 0), ("Alexandria's hand on Leaf; she crosses the field", 5, 0)]},
    "X18": {"title": "The queen and the rider", "key": "That is what it means to ride him", "shots": [
        ("Remi by Charcoal's head sees her coming", 3.5, 0), ("Alexandria beside Charcoal's head", 4, 0.5), ("'Did he stop?' exchange", 0.5, 0.5),
        ("She hears what that means", 0, 1), ("Remi looks at the jaw", 1.5, 0), ("He can't finish", 0, 1), ("She lets it stand", 0, 1),
        ("Touch on the arm; she walks back", 3, 0), ("Remi watches her go", 2, 0),
        ("Alexandria stops in the chamber doorway", 2.5, 0), ("The hatchling pushes up toward the cloth", 4, 0),
        ("It stands for three breaths, then sits; drinks", 4, 1), ("She signals 'go on'; watches; leaves", 3.5, 0.5)]},
    "X19": {"title": "The sail", "key": "What did they want?", "shots": [
        ("The launch scar; keepers mending", 5, 0), ("Remi among them; a keeper shows him once", 4.5, 0),
        ("Abby crosses the field", 4, 0), ("'Will it heal straight?'", 0.5, 0), ("Abby reaches the scar", 1.5, 0),
        ("Remi sets the tool down", 2.5, 0), ("Leaf steps between Abby and Charcoal", 4, 0), ("Abby looks at the jaws", 2, 0),
        ("Remi takes a moment", 0, 1), ("Hand on Charcoal's jaw; he breathes out", 4.5, 0),
        ("The sail far off; Abby watches", 4, 1), ("Remi doesn't answer", 0, 1.5), ("Abby leans on Leaf", 2.5, 0),
        ("Remi searches the sky", 5, 1), ("Final wide hold", 5, 1.5)]},
    "X20": {"title": "Festival before the king", "key": "So nobody else has to", "shots": [
        ("Shared table fills", 5, 0), ("Neighbors argue about bread", 3.5, 0), ("Farm family adds a basket", 3, 0), ("Villager reaches for bread; partner moves the basket", 2.5, 0),
        ("Two musicians play; child slips the parent's hand", 4.5, 0), ("Parent catches up", 1.5, 0),
        ("Honey cake offered; parent nods", 4, 0), ("Child at the watchman's post", 3, 0),
        ("Watchman eating, eyes on the sky", 2.5, 0), ("'So nobody else has to.'", 0, 0.5), ("Child looks at the sky; steered back", 4, 0)]},
    "X21": {"title": "The king among his people", "key": "If the king doesn't pay", "shots": [
        ("King comes down off the steps", 3.5, 0), ("He takes bread like anyone else", 3.5, 0), ("Honey cake and a coin", 2.5, 0),
        ("'Not from you.' exchange", 0.5, 0), ("Vendor takes the coin", 2.5, 0), ("King walks the edge, eating", 4.5, 0),
        ("His view of his village", 3.5, 0), ("The gate sticks", 3.5, 0), ("Gate exchange", 0.5, 0), ("Guard goes for tools", 2, 0),
        ("'I said I'd be brief.'", 1, 0)]},
    "X22": {"title": "The old song and the children's dance", "key": "Play the old one", "shots": [
        ("Shared meal; vendor on a crate", 4, 0), ("'Play the old one.'", 0.5, 0), ("Musician plays alone", 6, 0),
        ("Voices join, then most of the table", 8, 0), ("Vendor sings badly", 3, 0), ("King listens", 3, 0),
        ("Watchman hums", 3, 0), ("Guard and villager at the hinge listen", 4, 0), ("Hinge banter", 0.5, 0), ("The gate swings and keeps swinging", 3, 0),
        ("Old woman claps; children run to the fountain", 4, 0),
        ("Children's dance (wide)", 7, 0), ("Our child rushes a step", 3, 0), ("'Together!'; back in step", 3, 0),
        ("Parent claps against the parcel", 2.5, 0), ("King claps; captain nearly smiles", 3, 0), ("Smaller children copy", 2.5, 0),
        ("Final stamp; cheers", 3.5, 0.5), ("Four steps with the king", 5, 0), ("Child runs back; 'Again?'", 2.5, 0),
        ("They head toward the arch", 2, 0)]},
    "X23": {"title": "The watchman understands", "key": "He takes it for cloud", "shots": [
        ("He takes it for cloud; looks down", 3, 0), ("The vendor counting coins", 2, 0), ("The king laughing with the old woman", 2.5, 0),
        ("The child against the parent", 2, 0), ("Looks back up: larger", 2.5, 0.5), ("He stands; the bread drops", 2.5, 0)]},
    "X24": {"title": "The square freezes", "key": "snatches up the two small children", "shots": [
        ("The children's ring breaks; the old woman gathers them", 3, 0), ("Partner snatches up the two small children", 2.5, 0),
        ("Villager by the gate looks for them", 2.5, 0), ("A child on a man's shoulders waves; pulled down", 3, 0),
        ("The child's wonder, then the parent's face", 3, 0.5), ("The square from Starlight's height; a white wing edge", 4, 0)]},
    "X25": {"title": "The family is separated", "key": "the crowd keeps the farm-cart family apart", "shots": [
        ("Partner and children carried toward the arch", 4, 0), ("Villager pushed toward the steps", 3, 0),
        ("They see each other across the fountain; dust closes", 3, 0.5)]},
    "X26": {"title": "Between the passes", "key": "She's coming round! Get under stone!", "shots": [
        ("Watchman tracks the bank; shouts", 3, 0), ("Gate swings freely; people stream through", 3.5, 0),
        ("Captain glances at the king", 1, 0), ("Alley; old woman with children", 4, 0),
        ("The villager runs across the open square; a guard shouts", 3.5, 0), ("Child looks back at the white shape", 2.5, 0),
        ("Watchman drops flat", 2, 0)]},
    "X27": {"title": "Survivors", "key": "Call out if you can hear me", "shots": [
        ("People come out, looking up first", 4, 0), ("Old man over a bench", 2.5, 0), ("Neighbors lift timber", 3, 0),
        ("Old woman holds the children close; 'Stay close.'", 4, 1), ("Guard searches; calls out", 4, 0),
        ("Next doorway; the villager watches him", 5, 0), ("The broken instrument", 4, 1), ("Food beside the parcel", 2.5, 1),
        ("The guard comes back through the arch with the family", 4, 0), ("The villager tries to rise; they reach him", 4, 1),
        ("The guard goes to look for the next person", 2.5, 0)]},
    "X28": {"title": "Orders carried out", "key": "Is she coming back?", "shots": [
        ("Injured carried under the arch", 4, 0), ("Watchman climbs back up", 4, 0), ("The white shape far off; the nod", 6, 1),
        ("Captain returns to the king's side", 2, 0), ("Banner exchange", 0.5, 0.5), ("King lifts a beam", 4, 0), ("King and the vendor on his crate", 5, 1),
        ("King crouches at the shelter", 3.5, 0), ("'I don't know.'", 0, 1), ("Parent nods; king looks up", 3, 0.5),
        ("Queen Fall's hand on Starlight's neck", 3.5, 0.5)]},
}

HARD_FORBIDDEN = [
    (r"Water ?Glider", "Water Gliders are outside this episode"), (r"\bTerrence\b", "Episode 2 (Terrence)"),
    (r"\bReginald\b", "Episode 2 (Reginald)"), (r"\bCannibal", "Episode 2 (Cannibal report)"), (r"\bHydra\b", "Hydra reveal"),
    (r"\bBastion\b", "use BASHION"), (r"\bTara\b", "Tara is not referenced in the additions"),
    (r"\bStroke\b", "Episode 2 (Stroke)"),
    (r"\[ORIGINAL", "no new [ORIGINAL] markers"), (r"\bfleet\b", "no fleets"), (r"\barmy\b|\barmies\b", "no armies"),
    (r"mobiliz", "no war mobilization"),
]
# Queen Fall gets one wordless shot (X28), put to Daxtyn as a decision; nowhere else.
QUEEN_FALL_ALLOWED = {"X28"}
# Regression guards for earlier review findings (each cites the rule it protects).
REGRESSIONS = [
    (r"Nobody flies", "CANON LOCK 16: no island-wide flying ban (mobilization)"),
    (r"What if there are more", "CANON LOCK 16: points at Episode 2's Slitherwing fleet"),
    (r"Not by air|CLING MESSENGER", "original 3D: the message to King Fallen is ordered, not shown leaving"),
    (r"every float|burn dressing|For the rider's burns|Make a bed ready|out of the sea", "CANON LOCK 12: rescue and care belong outside this episode"),
    (r"spring rains|all summer", "no season is established"),
    (r"they're saying|Everyone knows already", "the gold hatchling is not public gossip"),
    (r"last time we see her use that hand", "contradicts X6 (both hands before the pass)"),
    (r"tiny moving figure on the road", "the original final picture is unchanged"),
    (r"Did it eat\?", "keeps 'I still want a Bashion' apart from the hatchling (CANON LOCK 5)"),
]
REVIEW = [(r"\b(attack|fire|hold|skit)\b", "command word in prose/dialogue"), (r"\b(left|right) (arm|hand|shoulder|wing)\b", "side"),
          (r"\bglow", "glow"), (r"\bTail\b", "capital Tail"), (r"\byou asked\b|\byour screenplay\b", "authorship wording")]


def load(path):
    with open(path, encoding="utf-8") as f:
        return f.read()


def parse_blocks(ext_lines):
    """Return (blocks, errors). Each block: dict(kind, id, start, end) with inclusive line indexes."""
    blocks, errors, open_b = [], [], None
    for i, ln in enumerate(ext_lines):
        b, e = BEGIN_RE.match(ln), END_RE.match(ln)
        if ln == NOTE_BEGIN or b:
            if open_b:
                errors.append("line %d: block opened inside block opened at line %d" % (i + 1, open_b["start"] + 1))
            open_b = {"kind": "note" if ln == NOTE_BEGIN else "add", "id": b.group(1) if b else None, "start": i}
        elif ln == NOTE_END or e:
            if not open_b:
                errors.append("line %d: end marker without begin" % (i + 1))
                continue
            kind = "note" if ln == NOTE_END else "add"
            if kind != open_b["kind"] or (e and e.group(1) != open_b["id"]):
                errors.append("line %d: end marker does not match begin at line %d" % (i + 1, open_b["start"] + 1))
            open_b["end"] = i
            blocks.append(open_b)
            open_b = None
        elif ("PROPOSED ADDITION" in ln or "EXTENDED EDITION NOTE" in ln) and ln.startswith("[") and ln.endswith("]"):
            errors.append("line %d: malformed marker %r" % (i + 1, ln))
    if open_b:
        errors.append("block opened at line %d is never closed" % (open_b["start"] + 1))
    ids = [b["id"] for b in blocks if b["kind"] == "add"]
    if ids != ["X%d" % (k + 1) for k in range(len(ids))]:
        errors.append("addition ids are not X1..Xn in order: %s" % ids)
    return blocks, errors


def strip_blocks(ext_lines, blocks):
    drop = set()
    for b in blocks:
        drop.update(range(b["start"], b["end"] + 1))
        if b["start"] > 0 and ext_lines[b["start"] - 1] == "":
            drop.add(b["start"] - 1)          # the blank line the block brought with it
        elif b["end"] + 1 < len(ext_lines) and ext_lines[b["end"] + 1] == "":
            drop.add(b["end"] + 1)            # block at the very top
    return [l for i, l in enumerate(ext_lines) if i not in drop]


def in_order_subsequence(orig_lines, ext_lines):
    """Greedy in-order match of every original line (blank lines included) against the extended
    file's lines. Returns (matched_count, first_missing) where first_missing is None on success."""
    j = 0
    for k, line in enumerate(orig_lines):
        while j < len(ext_lines) and ext_lines[j] != line:
            j += 1
        if j == len(ext_lines):
            return k, (k + 1, line)
        j += 1
    return len(orig_lines), None


def speech_seconds(notes, text):
    words = len(WORD_RE.findall(text))
    slow = any(n.strip().lower() in SLOW_NOTES for n in notes)
    rate = RATE_SLOW if slow else RATE
    breaks = len(re.findall(r"[.?!](?=\s+\S)", text))
    return words, round(max(MIN_LINE, words / rate + BREAK_PAUSE * breaks) + 1e-9, 1)


def half(x):
    return round(x * 2) / 2.0


def mmss(s):
    s = int(round(s))   # Python rounds .5 to even, as shotlist.md does; see the footnote in expansion-proposal.md
    return "%d:%02d" % (s // 60, s % 60)


def secs(s):
    return int(round(s))


def first_note(ext_lines, b):
    for ln in ext_lines[b["start"] + 1:b["end"]]:
        if ln.strip():
            return ln
    return ""


def main(argv):
    orig_path = argv[argv.index("--orig") + 1] if "--orig" in argv else ORIG
    ext_path = argv[argv.index("--ext") + 1] if "--ext" in argv else EXT
    orig, ext = load(orig_path), load(ext_path)
    orig_lines, ext_lines = orig.split("\n"), ext.split("\n")
    blocks, errors = parse_blocks(ext_lines)
    hard = list(errors)

    # ---- 1. proof that the original survives ------------------------------------------------
    matched, missing = in_order_subsequence(orig_lines, ext_lines)
    if missing:
        hard.append("original line %d not found in order in screenplay-extended.md: %r" % missing)
    stripped_lines = strip_blocks(ext_lines, blocks)
    verbatim = "\n".join(stripped_lines) == orig
    if not verbatim:
        for k in range(max(len(orig_lines), len(stripped_lines))):
            a = orig_lines[k] if k < len(orig_lines) else "<EOF>"
            c = stripped_lines[k] if k < len(stripped_lines) else "<EOF>"
            if a != c:
                hard.append("outside the marked blocks the text differs from screenplay.md at original line %d: expected %r, got %r" % (k + 1, a, c))
                break
    marked = [(l, orig_lines[i + 1]) for i, l in enumerate(orig_lines[:-1])
              if CUE_RE.match(l) and "ORIGINAL" in (CUE_RE.match(l).group(2) or "")]
    for cue, quote in marked:
        if not any(stripped_lines[k] == cue and stripped_lines[k + 1] == quote for k in range(len(stripped_lines) - 1)):
            hard.append("[ORIGINAL] line missing or changed: %s %s" % (cue, quote))
    sha = hashlib.sha256(orig.encode("utf-8")).hexdigest()
    try:
        dlg_sha = json.load(open(DIALOGUE, encoding="utf-8")).get("source_sha256")
    except (OSError, ValueError):
        dlg_sha = None
    non_blank = sum(1 for l in orig_lines if l.strip())

    # ---- 2-4. markers, notes, dependencies, canon lint ----------------------------------------
    adds = [b for b in blocks if b["kind"] == "add"]
    add_ids = {b["id"] for b in adds}
    notes = [b for b in blocks if b["kind"] == "note"]
    closing = "\n".join(ext_lines[notes[-1]["start"]:notes[-1]["end"]]) if notes else ""
    links_par = next((p for p in closing.split("\n") if p.startswith("Links between additions")), "")
    for b in adds:
        fn = first_note(ext_lines, b)
        if not fn.startswith("NOTE (not spoken):"):
            hard.append("%s: does not open with a 'NOTE (not spoken):' line" % b["id"])
        for dep in DEPENDS.get(b["id"], []):
            if not re.search(r"\b%s\b" % dep, fn):
                hard.append("%s: its first NOTE does not name %s, which it leans on" % (b["id"], dep))
            if not re.search(r"\b%s\b" % dep, links_par) or not re.search(r"\b%s\b" % b["id"], links_par):
                hard.append("closing note 'Links between additions' does not list %s -> %s" % (b["id"], dep))
    for k in DEPENDS:
        if k not in add_ids:
            hard.append("DEPENDS names %s but the screenplay has no such addition" % k)

    per, review = [], []
    for b in adds:
        body = ext_lines[b["start"] + 1:b["end"]]
        text = "\n".join(body)
        lines, i = [], 0
        while i < len(body):
            m = CUE_RE.match(body[i])
            if m and i + 1 < len(body):
                q = body[i + 1]
                if not (q.startswith('"') and q.endswith('"') and q.count('"') == 2):
                    hard.append("%s: cue %r is not followed by exactly one quoted line" % (b["id"], body[i]))
                else:
                    raw_notes = [p.strip() for p in re.split(r"[;,]", m.group(2) or "") if p.strip()]
                    timing_notes = [p for p in raw_notes if not p.startswith("to ")]
                    said = q[1:-1]
                    w, s = speech_seconds(timing_notes, said)
                    lines.append({"speaker": m.group(1), "text": said, "words": w, "spoken_s": s})
                    if said in CANONICAL_COMMANDS:
                        hard.append("%s: canonical command spoken in an addition: %s" % (b["id"], q))
                    if m.group(1) == "ABBY" and re.search(r"\bqueen\b", q, re.I):
                        hard.append("%s: Abby mentions being queen (succession must stay unanswered)" % b["id"])
                    ws = [x.lower() for x in WORD_RE.findall(said)]
                    to_dragon = any(n.startswith("to ") and any(d.lower() in n.lower() for d in DRAGONS) for n in raw_notes)
                    order_like = ws and ws[0] in ORDER_WORDS and len(ws) <= 4 and not said.endswith("?")
                    to_self = any(n.lower() == "to himself" or n.lower() == "to herself" for n in raw_notes)
                    if order_like and (to_dragon or (m.group(1) == "REMI" and not to_self)):
                        hard.append("%s: short spoken order to a dragon (reads as a new command): %s %s" % (b["id"], body[i], q))
                    elif order_like:
                        review.append("%s [short imperative, check who it is said to] %s %s" % (b["id"], body[i], q))
                i += 2
                continue
            if body[i].startswith('"'):
                hard.append("%s: quoted line without a speaker cue: %r" % (b["id"], body[i]))
            i += 1
        for pat, why in HARD_FORBIDDEN + REGRESSIONS:
            for mm in re.finditer(pat, text):
                hard.append("%s: forbidden %r (%s)" % (b["id"], mm.group(0), why))
        story_text = "\n".join(l for l in body if not l.startswith("NOTE (not spoken):"))
        if b["id"] not in QUEEN_FALL_ALLOWED and re.search(r"\bQueen Fall\b", story_text):
            hard.append("%s: Queen Fall appears in an addition other than %s" % (b["id"], sorted(QUEEN_FALL_ALLOWED)))
        for pat, why in REVIEW:
            for mm in re.finditer(pat, text, re.I):
                s0 = max(0, mm.start() - 40)
                review.append("%s [%s] ...%s..." % (b["id"], why, text[s0:mm.end() + 30].replace("\n", " ")))
        table = ADDITION_SHOTS.get(b["id"])
        if table is None:
            hard.append("%s: no shot estimate in ADDITION_SHOTS" % b["id"])
            continue
        if table["key"] not in text:
            hard.append("%s: key phrase %r not found; ADDITION_SHOTS is out of step with the screenplay" % (b["id"], table["key"]))
        dlg = sum(l["spoken_s"] + CUE_GAP for l in lines)
        act = sum(s[1] for s in table["shots"])
        br = sum(s[2] for s in table["shots"])
        scene = None
        for k in range(b["start"], -1, -1):
            mm = SCENE_RE.match(ext_lines[k])
            if mm and not any(o["start"] <= k <= o["end"] for o in blocks):
                scene = mm.group(2) or "PROLOGUE"
                break
        nxt, k = None, b["end"] + 1
        while k < len(ext_lines):
            inside = next((o for o in blocks if o["start"] <= k <= o["end"]), None)
            if inside:
                k = inside["end"] + 1
                continue
            if ext_lines[k].strip():
                nxt = ext_lines[k]
                break
            k += 1
        where = ("after " if nxt and (SCENE_RE.match(nxt) or nxt.startswith("END OF EPISODE")) else "inside ") + scene
        per.append({"id": b["id"], "title": table["title"], "where": where, "scene": scene, "line": b["start"] + 1,
                    "spoken_lines": len(lines), "words": sum(l["words"] for l in lines), "dialogue_s": round(dlg, 2),
                    "action_s": act, "breath_s": br, "shots": len(table["shots"]),
                    "expected_s": half(dlg + act + br), "low_s": half(0.9 * dlg + 0.8 * act + 0.5 * br),
                    "high_s": half(1.15 * dlg + 1.3 * act + 1.5 * br)})
    for k in ADDITION_SHOTS:
        if k not in add_ids:
            hard.append("ADDITION_SHOTS has %s but the screenplay has no such addition" % k)

    # ---- 5. runtime ----------------------------------------------------------------------------
    st = {s["scene"]: s for s in json.load(open(SHOTLIST, encoding="utf-8"))["scene_totals"]}
    order, by_line = [], {p["line"]: p for p in per}
    for i, ln in enumerate(ext_lines):
        inside = any(o["start"] <= i <= o["end"] for o in blocks)
        mm = SCENE_RE.match(ln)
        if mm and not inside:
            sid = mm.group(2) or "PROLOGUE"
            key = "PROLOGUE+TITLE" if sid == "PROLOGUE" else sid
            s = st[key]
            order.append({"row": key, "kind": "original", "title": s["title"], "low_s": s["low_s"], "expected_s": s["expected_s"], "high_s": s["high_s"]})
        elif ln == "END OF EPISODE 1." and not inside:
            s = st["END"]
            order.append({"row": "END", "kind": "original", "title": s["title"], "low_s": s["low_s"], "expected_s": s["expected_s"], "high_s": s["high_s"]})
        if (i + 1) in by_line:
            p = by_line[i + 1]
            order.append({"row": p["id"], "kind": "addition", "title": p["title"], "where": p["where"],
                          "low_s": p["low_s"], "expected_s": p["expected_s"], "high_s": p["high_s"]})
    t = 0.0
    for r in order:
        r["start_s"] = t
        t += r["expected_s"]
    K = ("low_s", "expected_s", "high_s")
    tot = {k: sum(r[k] for r in order) for k in K}
    tot_add = {k: sum(p[k] for p in per) for k in K}
    tot_orig = {k: sum(r[k] for r in order if r["kind"] == "original") for k in K}
    starts = {r["row"]: r["start_s"] for r in order}
    by_id = {p["id"]: p for p in per}

    def without(ids):
        return {k: tot[k] - sum(by_id[x][k] for x in ids if x in by_id) for k in K}

    subsets = {"without X5 and X14 (no early Cling visits)": without(["X5", "X14"])}
    # Named cut order if the animatic runs past 60:00. Step 1 trims inside additions (each addition
    # keeps its point); later steps drop whole additions that nothing else leans on.
    trims = [("X4", "the riding-school picture and Abby's laugh", 8.0), ("X5", "the camera pass round the square", 8.0),
             ("X15", "the saddle coming down (keep the jaw washing)", 9.0), ("X16", "the gull in the market", 4.5),
             ("X20", "the honey cake for the child", 9.0), ("X22", "the king's four dance steps", 5.0),
             ("X27", "the neighbors and the old man", 5.5), ("X13", "the corridor pause", 6.0)]
    over60, cut_e, cut_h = [], 0.0, 0.0
    t_e = sum(x[2] for x in trims)
    cut_e, cut_h = t_e, t_e * 1.3
    over60.append({"step": "trims inside additions", "detail": "; ".join("%s: %s" % (a, c) for a, c, _ in trims),
                   "expected_after_s": tot["expected_s"] - cut_e, "loose_after_s": tot["high_s"] - cut_h})
    for xid in ("X16", "X15", "X3", "X5", "X4"):
        if xid in by_id:
            cut_e += by_id[xid]["expected_s"]
            cut_h += by_id[xid]["high_s"]
            over60.append({"step": "drop " + xid, "detail": by_id[xid]["title"],
                           "expected_after_s": tot["expected_s"] - cut_e, "loose_after_s": tot["high_s"] - cut_h})
    frames = {k: tot[k] * FPS for k in K}
    render_h = {"best_case_h": frames["expected_s"] / FPS_BEST / 3600,
                "worst_case_h": frames["expected_s"] / FPS_WORST * HEAVY_SET / 3600,
                "loose_cut_worst_h": frames["high_s"] / FPS_WORST * HEAVY_SET / 3600}

    result = {"source_sha256": sha, "dialogue_json_source_sha256": dlg_sha,
              "proof": {"original_lines": len(orig_lines), "original_non_blank_lines": non_blank,
                        "lines_found_in_order": matched, "byte_identical_after_stripping_blocks": verbatim,
                        "original_markers": len(marked)},
              "additions": per, "running_order": order, "totals": tot, "original_totals": tot_orig, "addition_totals": tot_add,
              "addition_dialogue": {"lines": sum(p["spoken_lines"] for p in per), "words": sum(p["words"] for p in per),
                                    "seconds": round(sum(p["dialogue_s"] for p in per), 1)},
              "addition_action_s": sum(p["action_s"] for p in per), "addition_breath_s": sum(p["breath_s"] for p in per),
              "addition_shots": sum(p["shots"] for p in per), "subsets": subsets,
              "over_60_cut_order": over60,
              "frames": frames, "render_hours": render_h, "starts": starts,
              "hard_failures": hard, "review": review}

    print("PROOF  screenplay.md sha256 %s (dialogue.json was built from %s: %s)" % (sha[:16], (dlg_sha or "?")[:16], "same" if sha == dlg_sha else "DIFFERENT"))
    print("PROOF  %d of %d original lines (%d non-blank) found word for word, in order: %s" % (matched, len(orig_lines), non_blank, "yes" if not missing else "NO"))
    print("PROOF  outside the marked blocks the extended file is screenplay.md byte for byte: %s" % ("yes" if verbatim else "NO"))
    print("PROOF  [ORIGINAL] cue+quote pairs: %d, each present unchanged: %s" % (len(marked), not any("[ORIGINAL] line" in h for h in hard)))
    print("additions: %d   document notes: %d   dependency links checked: %d" % (len(adds), len(notes), sum(len(v) for v in DEPENDS.values())))
    print("new dialogue: %(lines)d lines, %(words)d words, %(seconds).1f s incl. cue gaps" % result["addition_dialogue"])
    print("new pictures: %d shots, %.1f s of action, %.1f s of holds" % (result["addition_shots"], result["addition_action_s"], result["addition_breath_s"]))
    print("original : tight %s  expected %s  loose %s" % tuple(mmss(tot_orig[k]) for k in K))
    print("additions: tight %s  expected %s  loose %s" % tuple(mmss(tot_add[k]) for k in K))
    print("EXTENDED : tight %s  expected %s  loose %s   (raw seconds %.1f / %.1f / %.1f)" % (tuple(mmss(tot[k]) for k in K) + tuple(tot[k] for k in K)))
    for name, v in subsets.items():
        print("  %s: tight %s  expected %s  loose %s" % ((name,) + tuple(mmss(v[k]) for k in K)))
    for st_ in over60:
        print("  over 60? %-24s -> expected %s, loose-cut bound %s" % (st_["step"], mmss(st_["expected_after_s"]), mmss(st_["loose_after_s"])))
    print("frames at %d fps: %d expected; native-4K render %.0f-%.0f h (expected cut), up to %.0f h (loose cut)"
          % (FPS, frames["expected_s"], render_h["best_case_h"], render_h["worst_case_h"], render_h["loose_cut_worst_h"]))
    if "--markdown" in argv:
        print("\n| Start | Part | What | Tight cut | Expected | Loose cut |\n|---:|---|---|---:|---:|---:|")
        for r in order:
            label = r["row"] if r["kind"] == "original" else "**%s** (%s)" % (r["row"], r["where"])
            print("| %s | %s | %s | %s | %s | %s |" % (mmss(r["start_s"]), label, r["title"], mmss(r["low_s"]), mmss(r["expected_s"]), mmss(r["high_s"])))
        print("| | **Total** | | **%s** | **%s** | **%s** |" % tuple(mmss(tot[k]) for k in K))
        print("\n| # | Expected | Tight | Loose | Lines | Words | Shots |\n|---|---:|---:|---:|---:|---:|---:|")
        for p in per:
            print("| %s | %s | %s | %s | %d | %d | %d |" % (p["id"], mmss(p["expected_s"]), mmss(p["low_s"]), mmss(p["high_s"]), p["spoken_lines"], p["words"], p["shots"]))
    if review and "--review" in argv:
        print("\nreview (eyeball these):")
        for r in review:
            print("  " + r)
    if hard:
        print("\nHARD FAILURES:")
        for h in hard:
            print("  " + h)
    if "--json" in argv:
        out = argv[argv.index("--json") + 1]
        with open(out, "w", encoding="utf-8") as f:
            json.dump(result, f, indent=1, ensure_ascii=False)
            f.write("\n")
        print("wrote", out)
    return 1 if hard else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
