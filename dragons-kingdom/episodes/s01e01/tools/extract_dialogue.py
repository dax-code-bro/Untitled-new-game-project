#!/usr/bin/env python3
"""Extract the spoken dialogue and on-screen text cards of Dragon's Kingdom S01E01.

Source of truth: ../screenplay.md  (this script never edits it)

Writes, next to the screenplay:
  dialogue.json       every SPOKEN line, in order, for voice + subtitles
  onscreen-text.json  title card, location captions and other on-screen text
  dialogue.md         a readable per-scene recording script with line counts

Usage (Python 3 standard library only):
  python3 tools/extract_dialogue.py           # (re)write the three files
  python3 tools/extract_dialogue.py --check   # exit 1 if the files are stale

How it works
  * Only the part between the "SCREENPLAY" heading and "END OF EPISODE 1." is
    parsed, so the quotes in the CANON LOCK / instructions are never mistaken
    for dialogue.
  * A spoken line is a cue line  NAME:  or  NAME [notes]:  followed by one
    quoted line. PICTURE:/SOUND:/TITLE:/ON-SCREEN LOCATION: lines have text
    after the colon, so they are never cues.
  * Bracketed notes are split into: the [ORIGINAL] source marker, an addressee
    ("to Leaf"), and the performance note ("whispered"). None of these are
    spoken or subtitled.
  * ANNOTATIONS below is a hand-checked table (one row per spoken line, in
    order) holding the things a parser cannot read reliably: brief delivery
    context, addressees stated by stage directions, and the command type. The
    script refuses to run if the screenplay and the table ever disagree, so a
    changed screenplay can never silently produce wrong data.
"""

import hashlib
import json
import math
import re
import sys
from collections import OrderedDict
from pathlib import Path

EPISODE_DIR = Path(__file__).resolve().parent.parent
SCREENPLAY = EPISODE_DIR / "screenplay.md"
OUT_DIALOGUE = EPISODE_DIR / "dialogue.json"
OUT_ONSCREEN = EPISODE_DIR / "onscreen-text.json"
OUT_MD = EPISODE_DIR / "dialogue.md"
REL_SOURCE = "episodes/s01e01/screenplay.md"
REL_SCRIPT = "episodes/s01e01/tools/extract_dialogue.py"

# The four [ORIGINAL] lines, byte-exact (CANON LOCK items 5 and 8).
ORIGINAL_LINES = [
    ("ALEXANDRIA", "My pretty little weapon"),
    ("REMI", "You're going to be queen when I'm gone. Least I think that's how that works. You good with that?"),
    ("REMI", "Yeah, you're good."),
    ("ABBY", "Why couldn't I get a Bashion?"),
]

# CANON LOCK item 15.
CANONICAL_COMMANDS = OrderedDict([
    ("Attack", "physical attack (never triggers flame)"),
    ("Fire", "breath weapon"),
    ("Hold", "halt"),
    ("Skit", "retreat"),
    ("Free fire", "emergency release from rider control"),
])

# ---------------------------------------------------------------------------
# Timing model (documented in dialogue.json -> timing_model)
# ---------------------------------------------------------------------------
RATE_CONVERSATIONAL = 2.6   # words per second
RATE_SLOW = 2.1             # narrator, whispered, quietly, low, through pain
SLOW_NOTES = ("whispered", "quietly", "low", "through pain")
PAUSE_PER_BREAK = 0.25      # seconds per sentence break inside a line
PAUSE_PER_BREAK_NARRATOR = 0.4
MIN_LINE_SECONDS = 0.6
CMD_DEFAULT = 0.8           # one-word dragon command, firm/shouted
CMD_QUIET = 1.0             # one-word command said low / with quiet authority
CMD_CUT_OFF = 0.6           # command cut off mid-word ("Hold—")
QUIET_COMMAND_SPEAKERS = ("QUEEN FALL",)  # voice policy: "threat does not require shouting"

# Subtitle layout (documented in dialogue.json -> subtitle_model)
SUB_MAX_ROW = 42
SUB_MAX_ROWS = 2
SUB_READING_CPS = 17.0      # characters/second; a children's-program reading speed
SUB_MIN_SECONDS = 1.0

EM = "—"

# ---------------------------------------------------------------------------
# Hand-checked annotation table. One row per spoken line, screenplay order.
# (scene, speaker, exact text, context, addressee, addressee_source, command)
#   addressee_source: "bracket" | "named in line" | "stage direction" | "context"
#   command: None | "canonical" | "directional"
# A bracketed "to X" overrides the addressee written here.
# ---------------------------------------------------------------------------
SD, NL, CX, BR = "stage direction", "named in line", "context", "bracket"
CAN, DIR = "canonical", "directional"

ANNOTATIONS = [
    # PROLOGUE
    ("PROLOGUE", "NARRATOR", "Until the early twelve hundreds, humanity did not know that dragons existed.",
     "Over the low sea view and the small wooden vessel. Clear, restrained, sparse. No exact discovery year is implied.", None, None, None),
    ("PROLOGUE", "NARRATOR", "The seas had names. The kingdoms had borders. Beyond them lay islands no one had reached, and things no one had thought to fear.",
     "Over the sailor and the shape passing beyond the mist. Unhurried.", None, None, None),
    ("PROLOGUE", "NARRATOR", "Tara. Scrapper. Verdor. The Citadel Sea and the Proxy Sea. Seven kingdoms, and undiscovered islands beyond the familiar shores.",
     "Over dissolving landscapes, where the optional place-name captions appear. Name the places plainly; no map is implied.", None, None, None),
    ("PROLOGUE", "NARRATOR", "By the fourteen hundreds, dragons were part of our lives. So were the people who rode them.",
     "The music has entered. Steady, not triumphant.", None, None, None),
    ("PROLOGUE", "NARRATOR", "This is where our story begins.",
     "Over the dragon's shadow crossing the grass. Last narrator line, just before the title.", None, None, None),
    # 1A
    ("1A", "ATTENDANT", "It started a moment ago.",
     "Quiet report as the queen walks in; the egg is moving.", None, None, None),
    ("1A", "ALEXANDRIA", "Has anyone touched it?",
     "Controlled and economical; her eyes stay on the egg.", None, None, None),
    ("1A", "ATTENDANT", "No, Your Majesty.",
     "Simple and careful.", "Alexandria", NL, None),
    ("1A", "ALEXANDRIA", "Then let it finish.",
     "Calm; she will not hurry the birth.", None, None, None),
    ("1A", "ATTENDANT", "Look at it.",
     "Hushed wonder as the gold hatchling emerges. Careful, not celebrating.", None, None, None),
    ("1A", "ALEXANDRIA", "My pretty little weapon",
     "Spoken only for the hatchling, not the room. Say it exactly, no extra word and no added ending. Hold on her face afterward.",
     "the gold hatchling", SD, None),
    ("1A", "ABBY", "Is it out?",
     "Leaning in at the doorway; eager, breaking the stillness.", None, None, None),
    ("1A", "ALEXANDRIA", "Come slowly.",
     "Quiet instruction to her children; warm but firm.", None, None, None),
    ("1A", "ABBY", "It's gold.",
     "Amazed.", None, None, None),
    ("1A", "REMI", "I can see that.",
     "Dry big-brother reply.", None, None, None),
    ("1A", "ABBY", "I mean all of it.",
     "Correcting him; still amazed.", None, None, None),
    ("1A", "ALEXANDRIA", "Wait. Let it settle.",
     "Gentle stop as Abby almost reaches out.", None, None, None),
    ("1A", "REMI", "How long has it been trying?",
     "A real question, looking at the shell.", None, None, None),
    ("1A", "ATTENDANT", "Long enough. It needs rest now.",
     "Practical; protective of the newborn.", None, None, None),
    ("1A", "ABBY", "There.",
     "Relief as the hatchling's side rises again after a frightening still moment.", None, None, None),
    ("1A", "ALEXANDRIA", "Yes.",
     "Soft; shared relief.", None, None, None),
    ("1A", "REMI", "Does it have a name?",
     "Casual.", None, None, None),
    ("1A", "ALEXANDRIA", "Not yet.",
     "Economical. The hatchling has no name in this episode.", None, None, None),
    ("1A", "ABBY", "Don't let him choose it.",
     "Teasing her brother without taking her eyes off the hatchling.", None, None, None),
    ("1A", "REMI", "I hadn't offered.",
     "Dry, with a sideways look.", None, None, None),
    ("1A", "ALEXANDRIA", "Then you may both leave it in peace.",
     "Warm but final; sending them out.", None, None, None),
    ("1A", "REMI", "We're going flying.",
     "Turning to the door; casual.", None, None, None),
    ("1A", "ALEXANDRIA", "Together?",
     "A mother checking.", None, None, None),
    ("1A", "ABBY", "Yes.",
     "Quick.", None, None, None),
    ("1A", "ALEXANDRIA", "Stay within reach of the island.",
     "Calm instruction.", None, None, None),
    ("1A", "REMI", "We will.",
     "Easy promise on the way out.", None, None, None),
    # 1B
    ("1B", "ABBY", "Leaf. Here.",
     "Calling Leaf back when he turns toward a noise and pulls the riding equipment out of her reach. Familiar, not cross.",
     "Leaf", NL, DIR),
    ("1B", "REMI", "Finished?",
     "From beside Charcoal across the field; mildly impatient.", None, None, None),
    ("1B", "ABBY", "Nearly.",
     "Still fastening.", None, None, None),
    ("1B", "REMI", "That was nearly when I asked before.",
     "Dry sibling teasing.", None, None, None),
    ("1B", "ABBY", "You asked once.",
     "Quick comeback; they do not need to look at each other.", None, None, None),
    ("1B", "GROUND KEEPER", "The field's clear.",
     "Raised voice from well outside Charcoal's launch space; Remi answers with a raised hand.", None, None, None),
    ("1B", "REMI", "Stay clear when he lifts.",
     "Practical reminder before Charcoal launches.", None, None, None),
    ("1B", "ABBY", "I remember.",
     "She knows already.", None, None, None),
    ("1B", "REMI", "Leaf doesn't always remember.",
     "Dry; Leaf is watching Charcoal.", None, None, None),
    ("1B", "ABBY", "We'll go first.",
     "Hand resting on Leaf, directing his attention forward.", None, None, None),
    # 1C
    ("1C", "ABBY", "You could have warned the grass.",
     "To herself, looking back through the dust of Charcoal's takeoff; a close, clear aside: the joke is for Abby and the viewer, so the audience hears it plainly.", None, None, None),
    ("1C", "REMI", "Everything secure?",
     "In flight, only once close enough to be heard over the wind.", None, None, None),
    ("1C", "ABBY", "Yes.",
     "Easy; comfortable in the air.", None, None, None),
    ("1C", "REMI", "All right.",
     "Content. A long stretch of flying with no talking follows.", None, None, None),
    # 1D
    ("1D", "REMI", "You're going to be queen when I'm gone. Least I think that's how that works. You good with that?",
     "Casual, as if continuing a thought he has carried a while. Say it exactly.", None, None, None),
    ("1D", "REMI", "Yeah, you're good.",
     "After a silence that lasts just long enough to be uncomfortable, he answers for her. Say it exactly.", None, None, None),
    ("1D", "ABBY", "Why couldn't I get a Bashion?",
     "Looking across Charcoal's enormous body. Say it exactly.", None, None, None),
    ("1D", "REMI", "You have Leaf.",
     "Plain.", None, None, None),
    ("1D", "ABBY", "I know I have Leaf.",
     "Quick, a little defensive.", None, None, None),
    ("1D", "REMI", "Then don't ask like he isn't right here.",
     "A gentle scold on Leaf's behalf.", None, None, None),
    ("1D", "ABBY", "I didn't mean it like that.",
     "Affectionate apology, touching Leaf; he turns one eye toward her.", None, None, None),
    ("1D", "REMI", "Nightwings are faster. More versatile.",
     "Matter-of-fact.", None, None, None),
    ("1D", "ABBY", "And Bashions?",
     "Curious.", None, None, None),
    ("1D", "REMI", "Better for war.",
     "Plain statement, not a boast. Leave a little quiet after it.", None, None, None),
    ("1D", "ABBY", "I was thinking about being able to move the ground every time I leave.",
     "Lighter; she means Charcoal's ground-shaking takeoff.", None, None, None),
    ("1D", "REMI", "Someone has to mend it afterward.",
     "Dry.", None, None, None),
    ("1D", "ABBY", "Not you.",
     "Teasing jab.", None, None, None),
    ("1D", "REMI", "That's true.",
     "Concedes, dry.", None, None, None),
    ("1D", "ABBY", "Don't start.",
     "Warning Leaf, with a small corrective gesture, as he edges toward Charcoal.", "Leaf", SD, None),
    ("1D", "ABBY", "Leaf.",
     "Sharper warning as Charcoal slowly turns his head.", "Leaf", NL, None),
    ("1D", "REMI", "That's enough.",
     "While Leaf's head is in Charcoal's mouth. Resigned, not panicked. Ordinary speech, not the Hold command.", None, None, None),
    ("1D", "ABBY", "He put his head in his mouth.",
     "Astonished, just after Charcoal lets go.", None, None, None),
    ("1D", "REMI", "I saw.",
     "Dry, resigned.", None, None, None),
    ("1D", "ABBY", "His whole head.",
     "Still astonished.", None, None, None),
    ("1D", "REMI", "Leaf saw too.",
     "Dry joke.", None, None, None),
    ("1D", "ABBY", "You're all right. Leave him alone.",
     "Rubbing Leaf; soothing, then a mild scold.", None, None, None),
    ("1D", "REMI", "Still want one?",
     "Small smile; he means a Bashion.", None, None, None),
    ("1D", "ABBY", "Yes.",
     "Immediate. The last light moment before the attack.", None, None, None),
    # 1E
    ("1E", "REMI", "Abby!",
     "Shouted over the wind right after the scout's pass.", "Abby", NL, None),
    ("1E", "REMI", "Look at me. Abby!",
     "Urgent, clipped with fear; she cannot answer yet.", "Abby", NL, None),
    ("1E", "ABBY", "My arm" + EM,
     "The first words she can form; pain cuts the line off.", None, None, None),
    ("1E", "REMI", "Stay with Leaf. Stay on him.",
     "Clipped, urgent.", None, None, None),
    ("1E", "REMI", "Can he take you in?",
     "Close alongside, checking she is secure before he leaves.", None, None, None),
    ("1E", "ABBY", "Yes.",
     "Narrow voice, but still herself.", None, None, None),
    ("1E", "REMI", "Go straight back. I'll be behind you.",
     "Firm. She throws this promise back at him in 2A.", None, None, None),
    ("1E", "ABBY", "Home. Come on.",
     "Leaning close over Leaf so he can hear; urging him home through the pain.", "Leaf", SD, DIR),
    ("1E", "REMI", "Attack.",
     "His easy expression is gone. Charcoal banks. Attack means a physical attack, not flame.", "Charcoal", SD, CAN),
    # 1F
    ("1F", "REMI", "Again.",
     "After Charcoal's jaws close on empty air; sending him at the scout again. A rider instruction, not a canonical command word.",
     "Charcoal", CX, DIR),
    ("1F", "REMI", "Fire.",
     "The scout rider is exposed to Charcoal's line of fire. Fire means breath weapon; a brief flame only.", "Charcoal", CX, CAN),
    ("1F", "REMI", "Hold" + EM,
     "Begun mid-struggle while he is jolted in the rig; cut off as the scout's LEFT wing tears loose.", "Charcoal", CX, CAN),
    ("1F", "REMI", "Hold!",
     "Charcoal releases at once and stops. Hold means halt.", "Charcoal", CX, CAN),
    ("1F", "REMI", "Back.",
     "Turning Charcoal toward Verdor after fixing where the scout fell. Ordinary directional speech, not a new formal command.",
     "Charcoal", SD, DIR),
    # 2A
    ("2A", "GROUND KEEPER", "Clear the approach!",
     "Shouted as Leaf returns alone and too urgently.", None, None, None),
    ("2A", "GROUND KEEPER", "Your Highness?",
     "Worried, seeing Abby hunched over the saddle.", "Abby", NL, None),
    ("2A", "ABBY", "My arm. Don't pull it.",
     "In pain, but direct.", None, None, None),
    ("2A", "GROUND KEEPER", "We won't. Stay where you are.",
     "Calm, reassuring.", None, None, None),
    ("2A", "ABBY", "I'm here. It's all right.",
     "Reassuring Leaf even though she is the one hurt.", None, None, None),
    ("2A", "GROUND KEEPER", "Will he let us help?",
     "Pausing at Leaf's watchful head.", None, None, None),
    ("2A", "ABBY", "Yes. Just go slowly.",
     "Giving permission; strained.", None, None, None),
    ("2A", "ABBY", "I'm standing.",
     "Her feet touch the ground and her knees soften; a little proud, a little shaky.", None, None, None),
    ("2A", "GROUND KEEPER", "I know. We have you.",
     "Gentle, supporting her.", None, None, None),
    ("2A", "REMI", "Abby.",
     "Hurrying to her after dismounting; relief and worry.", "Abby", NL, None),
    ("2A", "ABBY", "You said you'd be behind me.",
     "Pointed: his promise from the sky.", None, None, None),
    ("2A", "REMI", "I am.",
     "An answer he knows is not good enough.", None, None, None),
    ("2A", "REMI", "Get the healer. Tell my mother.",
     "Clipped, practical.", None, None, None),
    ("2A", "GROUND KEEPER", "They're being sent for.",
     "Already handled; steady.", None, None, None),
    ("2A", "ABBY", "I'll come back.",
     "Looking back at Leaf as she is helped inside, right hand raised.", "Leaf", SD, None),
    # 2B
    ("2B", "HEALER", "Tell me where it hurts most.",
     "Calm, professional.", None, None, None),
    ("2B", "ABBY", "Here. And when I move it.",
     "Pain narrows her voice.", None, None, None),
    ("2B", "HEALER", "Then let us keep it still.",
     "Practical, reassuring.", None, None, None),
    ("2B", "HEALER", "Give her room.",
     "Looking up at Remi, who is standing too close.", "Remi", SD, None),
    ("2B", "ALEXANDRIA", "Abby?",
     "Entering; her first look is at her daughter's face.", "Abby", NL, None),
    ("2B", "ABBY", "I'm all right.",
     "A brave front.", None, None, None),
    ("2B", "ALEXANDRIA", "You don't have to say that.",
     "Gentle; more intimate with her child than with servants.", None, None, None),
    ("2B", "ALEXANDRIA", "What do you know?",
     "Controlled, economical.", None, None, None),
    ("2B", "HEALER", "Her arm is broken. It needs support and rest.",
     "Plain report. No miracle cure.", None, None, None),
    ("2B", "ALEXANDRIA", "Tell me.",
     "Level voice.", None, None, None),
    ("2B", "REMI", "We were off the coast. Flying together. Something came past Leaf. A Slitherwing.",
     "Reporting in short pieces: only what he saw.", None, None, None),
    ("2B", "ALEXANDRIA", "With a rider?",
     "Sharp but level.", None, None, None),
    ("2B", "REMI", "Yes.",
     "Plain.", None, None, None),
    ("2B", "ALEXANDRIA", "Did it strike her?",
     "Level.", None, None, None),
    ("2B", "REMI", "It didn't have to. It passed close enough to throw her sideways. Leaf nearly rolled.",
     "Explaining the force of the pass.", None, None, None),
    ("2B", "ABBY", "I didn't even see it coming.",
     "Quiet, still shaken.", None, None, None),
    ("2B", "ALEXANDRIA", "Did you recognize the rider?",
     "Level, briefly squeezing Abby's hand.", None, None, None),
    ("2B", "REMI", "No.",
     "Honest; he cannot identify them.", None, None, None),
    ("2B", "ALEXANDRIA", "Anything on the saddle? A mark?",
     "Pressing for detail.", None, None, None),
    ("2B", "REMI", "I couldn't make one out.",
     "Admitting the limit of what he saw.", None, None, None),
    ("2B", "ALEXANDRIA", "Where are they now?",
     "Remi does not answer at once; Abby has not heard this part yet.", None, None, None),
    ("2B", "REMI", "In the water. Beyond the outer rocks.",
     "After a pause.", None, None, None),
    ("2B", "ALEXANDRIA", "Alive?",
     "One level word.", None, None, None),
    ("2B", "REMI", "When I left them.",
     "Careful; claims no more than he knows.", None, None, None),
    ("2B", "ALEXANDRIA", "What did Charcoal do?",
     "Level; the room has changed.", None, None, None),
    ("2B", "REMI", "I sent him after them. He burned the rider. Caught the dragon.",
     "Flat report.", None, None, None),
    ("2B", "REMI", "Its left wing came off.",
     "He makes himself finish. The LEFT wing.", None, None, None),
    ("2B", "ABBY", "Leaf didn't do anything to them.",
     "Looking down; confused and hurt.", None, None, None),
    ("2B", "REMI", "I know.",
     "Quiet.", None, None, None),
    ("2B", "ABBY", "We were just flying.",
     "Small. Nobody gives an easy answer.", None, None, None),
    ("2B", "ALEXANDRIA", "Was it one of ours?",
     "Measured.", None, None, None),
    ("2B", "REMI", "I don't know. A scout, perhaps. If they knew who we were" + EM,
     "Thinking aloud; his mother cuts him off.", None, None, None),
    ("2B", "ALEXANDRIA", "That is an if.",
     "Cutting in; keeping suspicion apart from fact.", None, None, None),
    ("2B", "REMI", "They could be a traitor.",
     "A suspicion, not a claim.", None, None, None),
    ("2B", "ALEXANDRIA", "They could be. First we find out who they are.",
     "Controlled; facts first.", None, None, None),
    ("2B", "ALEXANDRIA", "I will be just outside.",
     "Warm, before letting go of Abby's hand.", None, None, None),
    ("2B", "ABBY", "Don't send Leaf away.",
     "Worried, quick.", None, None, None),
    ("2B", "ALEXANDRIA", "No one is sending Leaf away.",
     "Firm reassurance.", None, None, None),
    # 2C
    ("2C", "ALEXANDRIA", "Take word to the Santa Maria. A dragon and rider are down beyond the outer rocks. They are to retrieve both.",
     "At the doorway; clear orders, no debate.", "Royal Messenger", SD, None),
    ("2C", "ROYAL MESSENGER", "Yes, Your Majesty.",
     "Prompt.", "Alexandria", NL, None),
    ("2C", "ALEXANDRIA", "The rider is burned. The dragon has lost its left wing. Tell them to prepare for injured survivors.",
     "Continuing the order. The LEFT wing.", "Royal Messenger", SD, None),
    ("2C", "ALEXANDRIA", "Show him where.",
     "Looking at Remi.", "Remi", SD, None),
    ("2C", "REMI", "Past that point. We turned there. They fell on the seaward side.",
     "Pointing out the coast; practical.", "Royal Messenger", CX, None),
    ("2C", "ROYAL MESSENGER", "I have it.",
     "Then leaves at once.", None, None, None),
    ("2C", "REMI", "I'm sorry.",
     "Later, sitting by Abby, whose arm is now in a sling. No task left to hide inside.", None, None, None),
    ("2C", "ABBY", "You didn't fly past me.",
     "Tired but direct.", None, None, None),
    ("2C", "REMI", "I know.",
     "Quiet.", None, None, None),
    ("2C", "ABBY", "Then what are you sorry for?",
     "A real question.", None, None, None),
    ("2C", "REMI", "I said it would be a short flight.",
     "Looking toward the open door and the sky.", None, None, None),
    ("2C", "ABBY", "It was.",
     "Dry, despite the pain; it nearly gets a laugh from him.", None, None, None),
    ("2C", "REMI", "Leaf brought you back well.",
     "Warm.", None, None, None),
    ("2C", "ABBY", "I know.",
     "Proud of Leaf.", None, None, None),
    ("2C", "REMI", "You should tell him.",
     "Gentle.", None, None, None),
    ("2C", "ABBY", "I will.",
     "Simple promise.", None, None, None),
    ("2C", "ALEXANDRIA", "You are both staying here for now.",
     "Returning; for a moment she sees them as her children, not riders or heirs.", None, None, None),
    ("2C", "ABBY", "Can I see Leaf later?",
     "Hopeful.", None, None, None),
    ("2C", "ALEXANDRIA", "Later. With help.",
     "After a look at the healer; kind but careful.", None, None, None),
    # 3A
    ("3A", "VENDOR", "Mind the corner. That's the third time someone's caught it.",
     "Steadying his stall on uneven stones; a friendly grumble.", None, None, None),
    ("3A", "MUSICIAN", "Move the stall.",
     "Teasing.", None, None, None),
    ("3A", "VENDOR", "Move the festival.",
     "Comeback; the musician smiles and helps straighten the cloth.", None, None, None),
    ("3A", "KING OF CLING", "Have I missed everything?",
     "Arriving with a small escort; approachable and light.", None, None, None),
    ("3A", "VENDOR", "Only the work, Your Majesty.",
     "Friendly jab.", "King of Cling", NL, None),
    ("3A", "KING OF CLING", "Then my timing is excellent.",
     "Playing along; he lets the people laugh.", None, None, None),
    ("3A", "GUARD CAPTAIN", "The steps are ready for you.",
     "Half a step behind the king, scanning the square.", "King of Cling", SD, None),
    ("3A", "KING OF CLING", "They can wait.",
     "Easygoing.", None, None, None),
    ("3A", "CHILD", "Are there going to be dragons?",
     "Excited, trying to see around the adults.", None, None, None),
    ("3A", "PARENT", "Let the king pass.",
     "A polite hush to the child.", "Child", CX, None),
    ("3A", "KING OF CLING", "You can ask.",
     "Kind, to the child.", "Child", CX, None),
    ("3A", "CHILD", "Are there?",
     "Hopeful.", None, None, None),
    ("3A", "KING OF CLING", "I haven't brought one.",
     "Gentle, a little apologetic. It turns painful later; nobody remarks on it.", None, None, None),
    ("3A", "KING OF CLING", "All right. Before someone tells me I am delaying the food" + EM,
     "From the steps to the whole gathering; good-humored. The vendor cuts in.", "the festival crowd", CX, None),
    ("3A", "VENDOR", "You are!",
     "A friendly heckle from the crowd.", "King of Cling", CX, None),
    ("3A", "KING OF CLING", EM + "I will be brief. Thank you for coming. Thank you to everyone who built this, cooked for it, and will still be here putting it back together when the rest of us have gone home.",
     "Picks up where he was cut off; warm thanks.", "the festival crowd", CX, None),
    ("3A", "KING OF CLING", "Enjoy the day. Leave enough for the person behind you. And let the musicians eat before you ask them to play again.",
     "A light finish. The last untroubled moment of the episode.", "the festival crowd", CX, None),
    # 3B
    ("3B", "WATCHMAN", "Dragon.",
     "Said at first at normal volume; swallowed by the music.", None, None, None),
    ("3B", "WATCHMAN", "Dragon approaching!",
     "He raises his voice.", None, None, None),
    ("3B", "GUARD CAPTAIN", "Where?",
     "Turning; sharp.", None, None, None),
    ("3B", "KING OF CLING", "Starlight.",
     "Almost to himself, recognizing her.", None, None, None),
    ("3B", "GUARD CAPTAIN", "Your Majesty?",
     "Unsure.", "King of Cling", NL, None),
    ("3B", "KING OF CLING", "Clear the square.",
     "Practical under pressure; final. The captain does not ask again.", "Guard Captain", SD, None),
    ("3B", "GUARD CAPTAIN", "Through the arch! Keep the center clear! Move now!",
     "Shouted orders to the crowd.", "the festival crowd", CX, None),
    ("3B", "QUEEN FALL", "Attack.",
     "High above, riding Starlight. Low-key authority, no shouting. Attack means the physical dive; no flame.",
     "Starlight", SD, CAN),
    # 3C
    ("3C", "GUARD CAPTAIN", "Off the steps!",
     "Shouted, reaching for the king.", "King of Cling", SD, None),
    ("3C", "KING OF CLING", "Open both sides! Don't let them crowd the arch!",
     "Shouted while pulling toward his people, not toward the private exit.", "the guards", CX, None),
    ("3C", "KING OF CLING", "Down!",
     "Shouted as fragments fly past the stone support.", None, None, None),
    ("3C", "PARENT", "Stay with me. Don't stop.",
     "Urgent, reaching the arch with the child.", "Child", CX, None),
    ("3C", "CHILD", "I can't see.",
     "Frightened, in the dust.", None, None, None),
    ("3C", "PARENT", "Hold my hand.",
     "Steady and protective. Not a dragon command.", "Child", CX, None),
    ("3C", "GUARD", "This way, Your Majesty.",
     "Reaching the king.", "King of Cling", NL, None),
    ("3C", "KING OF CLING", "Take the people through first.",
     "Refusing to go first.", "Guard", CX, None),
    ("3C", "GUARD", "She's turning.",
     "Looking up; the warning is true.", None, None, None),
    ("3C", "VENDOR", "Leave it! Come on!",
     "Crawling clear of the wrecked stall.", "Musician", SD, None),
    ("3C", "ADULT VILLAGER", "My family" + EM,
     "Injured, conscious, frightened; the king cuts in.", None, None, None),
    ("3C", "KING OF CLING", "Tell the guard where they were. He'll look.",
     "Practical; no empty promise that everyone is safe.", "Adult Villager", CX, None),
    ("3C", "GUARD", "I'll look.",
     "The acknowledgement the king waits for.", "King of Cling", SD, None),
    # 3D
    ("3D", "KING OF CLING", "Find the injured. Bring them under stone cover. Keep someone watching the sky.",
     "Dust on his clothes. Quiet working orders, not a speech.", "Guard Captain", SD, None),
    ("3D", "GUARD CAPTAIN", "Yes, Your Majesty.",
     "Subdued.", "King of Cling", NL, None),
    ("3D", "KING OF CLING", "And send word to King Fallen.",
     "King Fallen of Scrapper, a different person from Queen Fall.", "Guard Captain", CX, None),
    ("3D", "GUARD CAPTAIN", "What shall I tell him?",
     "Looking toward the receding white shape.", "King of Cling", CX, None),
    ("3D", "KING OF CLING", "Starlight attacked Cling. Tell him exactly what you saw.",
     "The last spoken line of the episode. Plain and heavy.", "Guard Captain", CX, None),
]

# The directing word inside multi-word directional lines.
DIRECTIONAL_WORDS = {"Leaf Here": "Here", "Home Come on": "Home"}

# Silent beats the recording script must keep (not spoken, not subtitled).
BEATS_AFTER = {
    ("1C", "You could have warned the grass."):
        "Remi cannot hear her at this distance (shown by the distance and his lack of reply, not by hiding the line). No shouted reply.",
    ("1D", "You're going to be queen when I'm gone. Least I think that's how that works. You good with that?"):
        "ABBY SAYS NOTHING. Keep the silence: no answer, no nod, no narration.",
}

# On-screen text cards: (id, kind, text, locator regex, expected_optional, extra fields)
ONSCREEN_SPECS = [
    # Prologue captions in the NARRATOR's order (L003), one per separate landscape (see ONSCREEN_DETAILS).
    ("T01", "location_caption", "TARA", r"show them as simple captions", True),
    ("T02", "location_caption", "SCRAPPER", r"show them as simple captions", True),
    ("T03", "location_caption", "VERDOR", r"show them as simple captions", True),
    ("T04", "location_caption", "CITADEL SEA", r"show them as simple captions", True),
    ("T05", "location_caption", "PROXY SEA", r"show them as simple captions", True),
    ("T06", "title_card", "DRAGON'S KINGDOM", r"^TITLE: ", False),
    ("T07", "vessel_name", "SANTA MARIA", r"Santa Maria's name on a restrained identification card", True),
    ("T08", "location_caption", "CLING " + EM + " SCRAPPER", r"^ON-SCREEN LOCATION: ", False),
    ("T09", "character_name_caption", "QUEEN FALL", r"an on-screen name is optional", True),
    ("T10", "end_titles", None, r"^END TITLES$", False),
]

# The five prologue captions appear DURING the narrator's L003, each synced to the moment its name is
# spoken, each over its own separate landscape shot (shotlist.json P-10..P-14), so no two named places
# or seas ever share one continuous view (CANON LOCK 4). Same convention as shotlist.json.
PROLOGUE_CAPTIONS = [  # (id, spoken words in L003, shot id, landscape)
    ("T01", "Tara", "P-10", "a forest reaching a cliff edge"),
    ("T02", "Scrapper", "P-11", "distant fortified walls"),
    ("T03", "Verdor", "P-12", "a misted island, alone in frame"),
    ("T04", "Citadel Sea", "P-13", "calm open water under a high bright sky, no coastline"),
    ("T05", "Proxy Sea", "P-14", "a different stretch of water (long swell, low cloud), no coastline"),
]

ONSCREEN_DETAILS = {
    "T06": dict(after_line="L005", before_line="L006",
                placement="Against the dark surface of a closed egg. A quiet scratch comes from inside; music gives way to it.",
                suggested_hold_seconds=5.0),
    "T07": dict(after_line="L142", before_line="L143",
                placement="Harbor intercut in Scene 2C: either a restrained identification card or lettering on the ship's hull, only if it can be read clearly.",
                suggested_hold_seconds=3.0),
    "T08": dict(after_line="L155", before_line="L156",
                placement="Opening of Scene 3A, over the festival already in motion at human height.",
                suggested_hold_seconds=3.5),
    "T09": dict(after_line="L179", before_line="L180",
                placement="Scene 3B, on the controlled close shot introducing her face on Starlight. Never label her Alexandria.",
                suggested_hold_seconds=3.0),
    "T10": dict(after_line="L198", before_line=None,
                placement="After the cut to black and the final wingbeat. Restrained main theme.",
                suggested_hold_seconds=None),
}
for _order, (_cid, _words, _shot, _land) in enumerate(PROLOGUE_CAPTIONS, 1):
    ONSCREEN_DETAILS[_cid] = dict(
        after_line="L002", before_line="L004", during_line="L003", synced_words=_words, shot=_shot, display_order=_order,
        placement=("During the narrator's L003, synced to the moment the narrator says \"%s\". Simple caption over its own separate, "
                   "unlocated landscape (%s; shotlist.json %s). One name per landscape: no other named place or sea in the same view. "
                   "No map, no borders, no arrows." % (_words, _land, _shot)),
        suggested_hold_seconds=1.5)

ONSCREEN_NOTES = {
    "T01": "Proposed production choice: the captions follow the narrator's order in L003 (Tara, Scrapper, Verdor, Citadel Sea, Proxy Sea), each appearing as its name is spoken. The screenplay's own caption list is in a different order (TARA; CITADEL SEA; SCRAPPER; PROXY SEA; VERDOR). The captions are optional and can be dropped.",
    "T06": "Written in the screenplay as 'TITLE: DRAGON'S KINGDOM.' The final period is screenplay punctuation, not part of the title. The series name is Dragon's Kingdom.",
    "T07": "The story's own vessel, not a reference to historical Earth figures. It does not need to be shown at all.",
    "T08": "Not marked optional. The final period in the screenplay is punctuation, not part of the caption. Cling is a kingdom within Scrapper.",
    "T09": "The screenplay says a production-note identification is enough and an on-screen name is optional. Exact wording is not fixed; 'QUEEN FALL' is the plainest form.",
    "T10": "Text is not written yet. Credit only real contributors and real assets. Do not invent a cast, a production company or licensed music.",
}
for _cid, *_ in PROLOGUE_CAPTIONS[1:]:
    ONSCREEN_NOTES[_cid] = ONSCREEN_NOTES["T01"]

NEVER_ON_SCREEN = [
    "[ORIGINAL] (a source marker, not an on-screen label)",
    "Bracketed performance notes such as [whispered] or [to Leaf]",
    "PICTURE:, SOUND:, FINAL PICTURE: and other production notes",
    "Scene headings (e.g. 'SCENE 1A — A BIRTH IN VERDOR') and sluglines (INT./EXT.)",
    "'END OF EPISODE 1.'",
    "The instructions, CANON LOCK, PRODUCTION CONTINUITY and checklists",
]


# ---------------------------------------------------------------------------
# Parsing
# ---------------------------------------------------------------------------
CUE_RE = re.compile(r"^([A-Z][A-Z .'-]*[A-Z])(?: \[([^\]]+)\])?:$")
SCENE_RE = re.compile(r"^(PROLOGUE|SCENE (\d[A-Z])) " + EM + r" (.+)$")
WORD_RE = re.compile(r"[A-Za-z0-9]+(?:'[A-Za-z]+)*")


def fail(msg):
    sys.stderr.write("extract_dialogue: ERROR: " + msg + "\n")
    sys.exit(2)


def parse_bracket(raw):
    """Split '[ORIGINAL; whispered]' style notes into parts."""
    original, addressee, notes = False, None, []
    if raw:
        for part in re.split(r"[;,]", raw):
            p = part.strip()
            if not p:
                continue
            if p == "ORIGINAL":
                original = True
            elif p.startswith("to "):
                addressee = p[3:].strip()
            else:
                notes.append(p)
    return original, addressee, notes


def normalise_addressee(name):
    table = {"keeper": "Ground Keeper", "healer": "Healer", "leaf": "Leaf", "charcoal": "Charcoal",
             "remi": "Remi", "abby": "Abby"}
    return table.get(name.lower(), name)


def parse(lines):
    try:
        start = lines.index("SCREENPLAY")
        end = lines.index("END OF EPISODE 1.")
    except ValueError:
        fail("could not find the 'SCREENPLAY' heading or 'END OF EPISODE 1.' marker")
    scenes, spoken = [], []
    scene = None
    i = start + 1
    while i < end:
        ln = lines[i]
        m = SCENE_RE.match(ln)
        if m:
            sid = m.group(2) or "PROLOGUE"
            slug = lines[i + 1].strip()
            scene = {"id": sid, "title": m.group(3).strip(), "slugline": slug, "source_line": i + 1}
            scenes.append(scene)
            i += 1
            continue
        m = CUE_RE.match(ln)
        if m:
            if scene is None:
                fail("speaker cue before first scene at line %d" % (i + 1))
            j = i + 1
            while j < end and lines[j].strip() == "":
                j += 1
            q = lines[j]
            if not (len(q) >= 2 and q.startswith('"') and q.endswith('"') and q.count('"') == 2):
                fail("cue at line %d is not followed by exactly one quoted line: %r" % (i + 1, q))
            spoken.append({
                "scene": scene["id"], "speaker": m.group(1), "bracket_raw": m.group(2),
                "text": q[1:-1], "cue_line": i + 1, "text_line": j + 1,
            })
            i = j + 1
            continue
        if ln.startswith('"'):
            fail("quoted line without a speaker cue at line %d: %r" % (i + 1, ln))
        i += 1
    return start, end, scenes, spoken


# ---------------------------------------------------------------------------
# Timing and subtitles
# ---------------------------------------------------------------------------
def word_count(text):
    return len(WORD_RE.findall(text))


def sentence_breaks(text):
    return len(re.findall(r"[.?!](?=\s+\S)", text))


def estimate_seconds(speaker, text, notes, interrupted, command_kind):
    words = word_count(text)
    quiet = any(n.lower() in SLOW_NOTES for n in notes)
    if command_kind and words == 1:
        if interrupted:
            return CMD_CUT_OFF, "command (cut off)"
        if quiet or speaker in QUIET_COMMAND_SPEAKERS:
            return CMD_QUIET, "command (low/quiet authority)"
        return CMD_DEFAULT, "command"
    if speaker == "NARRATOR":
        rate, pause, rule = RATE_SLOW, PAUSE_PER_BREAK_NARRATOR, "narrator"
    elif quiet:
        rate, pause, rule = RATE_SLOW, PAUSE_PER_BREAK, "slow (" + ", ".join(notes) + ")"
    else:
        rate, pause, rule = RATE_CONVERSATIONAL, PAUSE_PER_BREAK, "conversational"
    secs = words / rate + pause * sentence_breaks(text)
    secs = max(MIN_LINE_SECONDS, secs)
    return round(secs + 1e-9, 1), rule


GLUE_END = {"a", "an", "the", "to", "of", "in", "on", "at", "for", "with", "by", "from", "my", "your", "his",
            "her", "our", "their", "its", "and", "or", "but", "who", "that", "someone"}
OBJECT_START = {"me", "him", "them", "us"}
SUBJECT_START = {"i", "we", "they", "he", "she", "it", "you"}
CLAUSE_START = {"when", "and", "but", "because", "before", "after", "while", "if", "who", "so"}


def _first(word):
    return word.lower().split("'")[0].strip(",.?!" + EM)


def best_rows(s):
    """Best 1- or 2-row layout of s as (rows, broke_at_punctuation), or None if it cannot fit."""
    if len(s) <= SUB_MAX_ROW:
        return [s], True
    best = None
    multi = sentence_breaks(s) > 0
    for k, ch in enumerate(s):
        if ch != " ":
            continue
        a, b = s[:k], s[k + 1:]
        if len(a) > SUB_MAX_ROW or len(b) > SUB_MAX_ROW:
            continue
        score = max(len(a), len(b))
        punct = a[-1] in ".?!" + EM or a[-1] in ",;:"
        if a[-1] in ".?!" + EM:
            score -= 10          # break between sentences
        elif a[-1] in ",;:":
            score -= 5           # break after a clause
        if a.split(" ")[-1].lower() in GLUE_END:
            score += 5           # never end a row on "the", "to", "and"...
        first = _first(b.split(" ")[0])
        if first in OBJECT_START:
            score += 5           # avoid "tells / me"
        elif first in SUBJECT_START:
            score -= 3           # a new clause often starts here
        if multi and not punct:
            score += 100         # several sentences: break on punctuation whenever possible
        if best is None or score < best[0]:
            best = (score, [a, b], punct)
    return (best[1], best[2]) if best else None


def fits(s):
    return best_rows(s) is not None


def good(s):
    """Fits, and any row break inside a multi-sentence cue falls on punctuation."""
    r = best_rows(s)
    return r is not None and (r[1] or sentence_breaks(s) == 0)


def pack(pieces, ok=good):
    """Greedily join pieces (sentences or clauses) into cues."""
    cues, cur = [], ""
    for p in pieces:
        cand = (cur + " " + p).strip() if cur else p
        if ok(cand):
            cur = cand
            continue
        if cur:
            cues.append(cur)
            cur = ""
        if fits(p):
            cur = p
            continue
        clauses = re.split(r"(?<=,)\s+", p)
        sub = pack(clauses, fits) if len(clauses) > 1 else pack_words(p)
        cues.extend(sub[:-1])
        cur = sub[-1]
    if cur:
        cues.append(cur)
    return cues


def pack_words(p):
    """Split one over-long piece in two (or more) at the best word boundary."""
    if fits(p):
        return [p]
    words = p.split(" ")
    best = None
    for k in range(1, len(words)):
        a, b = " ".join(words[:k]), " ".join(words[k:])
        if not fits(a):
            continue
        tail = [b] if fits(b) else None
        if tail is None:
            continue
        score = max(len(a), len(b)) - (10 if _first(words[k]) in CLAUSE_START else 0)
        if best is None or score < best[0]:
            best = (score, [a] + tail)
    if best:
        return best[1]
    half = len(words) // 2  # very long piece: halve and recurse
    return pack_words(" ".join(words[:half])) + pack_words(" ".join(words[half:]))


def subtitle_cues(text):
    if good(text):
        chunks = [text]
    else:
        chunks = pack(re.split(r"(?<=[.?!])\s+", text))
    return ["\n".join(best_rows(c)[0]) for c in chunks]


# ---------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------
def build():
    raw = SCREENPLAY.read_bytes()
    text = raw.decode("utf-8")
    lines = text.split("\n")
    start, end, scenes, spoken = parse(lines)

    if len(spoken) != len(ANNOTATIONS):
        fail("screenplay has %d spoken lines but the annotation table has %d" % (len(spoken), len(ANNOTATIONS)))

    out, by_id = [], {}
    for n, (sp, ann) in enumerate(zip(spoken, ANNOTATIONS), start=1):
        a_scene, a_speaker, a_text, context, addressee, addr_src, cmd_kind = ann
        if (sp["scene"], sp["speaker"], sp["text"]) != (a_scene, a_speaker, a_text):
            fail("line %d mismatch (screenplay line %d):\n  screenplay: %r\n  table:      %r"
                 % (n, sp["text_line"], (sp["scene"], sp["speaker"], sp["text"]), (a_scene, a_speaker, a_text)))
        original, br_addr, notes = parse_bracket(sp["bracket_raw"])
        if br_addr:
            addressee, addr_src = normalise_addressee(br_addr), BR
        interrupted = sp["text"].endswith(EM)
        continues = sp["text"].startswith(EM)
        command = None
        if cmd_kind:
            word = re.sub(r"[^A-Za-z ]", "", sp["text"]).strip()
            if cmd_kind == CAN:
                if word not in CANONICAL_COMMANDS:
                    fail("line %d marked canonical command but %r is not one" % (n, word))
                command = {"type": CAN, "word": word, "meaning": CANONICAL_COMMANDS[word]}
            else:
                word = DIRECTIONAL_WORDS.get(word, word)
                if word in CANONICAL_COMMANDS:
                    fail("line %d marked directional but is canonical %r" % (n, word))
                command = {"type": DIR, "word": word,
                           "meaning": "ordinary rider-to-dragon direction, not a canonical command"}
        est, rule = estimate_seconds(sp["speaker"], sp["text"], notes, interrupted, cmd_kind)
        perf = ", ".join(notes) if notes else None
        delivery = (perf + " — " + context) if perf else context
        lid = "L%03d" % n
        item = OrderedDict([
            ("id", lid),
            ("scene", sp["scene"]),
            ("speaker", sp["speaker"]),
            ("addressee", addressee),
            ("addressee_source", addr_src if addressee else None),
            ("text", sp["text"]),
            ("original", original),
            ("delivery", delivery),
            ("performance_note", perf),
            ("bracket_raw", sp["bracket_raw"]),
            ("is_command", command is not None),
            ("command", command),
            ("interrupted", interrupted),
            ("continues", None),
            ("words", word_count(sp["text"])),
            ("est_seconds", est),
            ("timing_rule", rule),
            ("subtitle_cues", subtitle_cues(sp["text"])),
            ("subtitle_min_seconds", max(SUB_MIN_SECONDS, math.ceil(len(sp["text"]) / SUB_READING_CPS * 10) / 10)),
            ("beat_after", BEATS_AFTER.get((sp["scene"], sp["text"]))),
            ("source_line", sp["text_line"]),
        ])
        if continues:
            prev = out[-1] if out else None
            # the cut-off line by the same speaker that this one picks up
            for cand in reversed(out):
                if cand["speaker"] == sp["speaker"] and cand["interrupted"]:
                    prev = cand
                    break
            item["continues"] = prev["id"] if prev else None
        out.append(item)
        by_id[lid] = item

    # ---- verification -----------------------------------------------------
    originals = [(x["speaker"], x["text"]) for x in out if x["original"]]
    if originals != ORIGINAL_LINES:
        fail("[ORIGINAL] lines differ from the canon list:\n  %r" % originals)
    canon_text = "\n".join(lines[:start])
    for spk, t in ORIGINAL_LINES:
        # cross-check against the CANON LOCK quotation too (outside the parsed region)
        if ('"%s"' % t) not in canon_text:
            fail("original line %r not found verbatim in CANON LOCK" % t)
    for x in out:
        for bad in ("[", "]", '"', "ORIGINAL", "PICTURE", "SOUND:"):
            if bad in x["text"]:
                fail("%s text contains %r" % (x["id"], bad))
    quoted_in_region = sum(1 for ln in lines[start:end] if ln.startswith('"'))
    if quoted_in_region != len(out):
        fail("quoted lines in screenplay (%d) != spoken lines (%d)" % (quoted_in_region, len(out)))
    used = {(s, t) for (s, t) in BEATS_AFTER}
    if not used <= {(x["scene"], x["text"]) for x in out}:
        fail("a BEATS_AFTER key does not match a spoken line")

    # ---- totals -----------------------------------------------------------
    speakers = OrderedDict()
    for x in out:
        s = speakers.setdefault(x["speaker"], {"lines": 0, "words": 0, "est_seconds": 0.0})
        s["lines"] += 1
        s["words"] += x["words"]
        s["est_seconds"] = round(s["est_seconds"] + x["est_seconds"], 1)
    scene_tot = OrderedDict()
    for sc in scenes:
        xs = [x for x in out if x["scene"] == sc["id"]]
        sc["first_line"] = xs[0]["id"] if xs else None
        sc["last_line"] = xs[-1]["id"] if xs else None
        sc["lines"] = len(xs)
        sc["est_seconds"] = round(sum(x["est_seconds"] for x in xs), 1)
        scene_tot[sc["id"]] = sc["est_seconds"]
    total = round(sum(x["est_seconds"] for x in out), 1)

    sha = hashlib.sha256(raw).hexdigest()
    dialogue = OrderedDict([
        ("episode", "S01E01"),
        ("series", "Dragon's Kingdom"),
        ("status", "Planning data extracted from the screenplay. No voices have been recorded and nothing has been rendered."),
        ("source", REL_SOURCE),
        ("source_sha256", sha),
        ("generated_by", REL_SCRIPT),
        ("rules", [
            "Only text following a named speaker or NARRATOR is spoken (screenplay instructions).",
            "'text' holds only the spoken words: no surrounding quotes, no bracketed notes, no [ORIGINAL] marker.",
            "Lines with original=true are the creator's own words and must be performed and subtitled byte-exact.",
            "Bracketed notes and 'delivery' are performance guidance; never speak or subtitle them.",
            "Dragons have no human dialogue; they communicate by posture, breath, growls, calls and eye movement.",
            "An em dash at the end of 'text' means the line is cut off (interrupted=true). A leading em dash means it picks up a cut-off line ('continues' names that line).",
            "Every line other than the four originals is proposed adaptation dialogue, not recovered creator dialogue.",
            "Subtitles come from the final recorded dialogue; re-run this script if the screenplay changes.",
        ]),
        ("fields", OrderedDict([
            ("id", "L001..L198 in screenplay order"),
            ("scene", "PROLOGUE, 1A..1F, 2A..2C, 3A..3D (see scenes[])"),
            ("speaker", "role name exactly as the screenplay cue"),
            ("addressee", "who the line is spoken to, only when the screenplay states or clearly shows it; else null"),
            ("addressee_source", "bracket = '[to X]' note; named in line = vocative/title in the line; stage direction = action text says so; context = the surrounding exchange makes it explicit"),
            ("text", "exact spoken words"),
            ("original", "true for the four [ORIGINAL] lines"),
            ("delivery", "bracketed performance note (if any) followed by brief context from the stage directions"),
            ("performance_note", "the bracketed note alone, minus ORIGINAL and 'to X'"),
            ("bracket_raw", "the bracket exactly as written in the cue"),
            ("is_command", "true for dragon commands (Attack/Fire/Hold/Skit/Free fire) and rider-to-dragon directional speech"),
            ("command", "{type: canonical|directional, word, meaning} or null"),
            ("interrupted", "true when the line ends in an em dash"),
            ("continues", "id of the cut-off line this one resumes, else null"),
            ("words", "word count used for timing"),
            ("est_seconds", "estimated natural speaking duration (see timing_model)"),
            ("timing_rule", "which timing rule produced est_seconds"),
            ("subtitle_cues", "suggested subtitle cues; '\\n' separates the two rows of one cue"),
            ("subtitle_min_seconds", "minimum on-screen time for reading the whole line (see subtitle_model)"),
            ("beat_after", "a silent beat that must follow the line (not spoken, not subtitled), else null"),
            ("source_line", "1-based line number of the quoted text in screenplay.md"),
        ])),
        ("timing_model", OrderedDict([
            ("summary", "Estimates for planning and animatic timing only. Real recordings replace them."),
            ("words", "count of letter/digit tokens; contractions count as one word (\"don't\" = 1)"),
            ("conversational", "seconds = words / %.1f + %.2f x internal sentence breaks" % (RATE_CONVERSATIONAL, PAUSE_PER_BREAK)),
            ("slow", "if performance_note is whispered, quietly, low or through pain: seconds = words / %.1f + %.2f x breaks" % (RATE_SLOW, PAUSE_PER_BREAK)),
            ("narrator", "seconds = words / %.1f + %.2f x breaks (clear, restrained, sparse)" % (RATE_SLOW, PAUSE_PER_BREAK_NARRATOR)),
            ("one_word_commands", "fixed: %.1f s normal/firm/shouted; %.1f s low or quiet authority (Queen Fall); %.1f s cut off mid-word" % (CMD_DEFAULT, CMD_QUIET, CMD_CUT_OFF)),
            ("multi_word_directional", "use the conversational rule (e.g. 'Home. Come on.')"),
            ("internal_sentence_break", "a . ? or ! followed by more words inside the same line"),
            ("floor", "every line is at least %.1f s" % MIN_LINE_SECONDS),
            ("rounding", "to 0.1 s"),
            ("excludes", "pauses between lines, reactions, breaths, silences such as Abby's after L046"),
        ])),
        ("subtitle_model", OrderedDict([
            ("max_chars_per_row", SUB_MAX_ROW),
            ("max_rows_per_cue", SUB_MAX_ROWS),
            ("splitting", "one cue if the line fits in two rows with any row break on punctuation (or the line is a single sentence); otherwise pack whole sentences into cues, then comma clauses, then split at a word boundary, preferring before 'when/and/but/who'. Rows break at the most balanced space, preferring sentence ends, then commas; never after 'the/to/and', never before 'me/him/them/us'."),
            ("reading_speed_cps", SUB_READING_CPS),
            ("subtitle_min_seconds", "max(%.1f, characters / %.0f), rounded up to 0.1 s; show the cue at least this long even if the speech is shorter" % (SUB_MIN_SECONDS, SUB_READING_CPS)),
            ("text_rule", "subtitle text is exactly 'text'; never add [ORIGINAL], bracket notes or speaker names"),
        ])),
        ("totals", OrderedDict([
            ("spoken_lines", len(out)),
            ("est_spoken_seconds", total),
            ("est_spoken_minutes", round(total / 60.0, 2)),
            ("original_lines", sum(1 for x in out if x["original"])),
            ("command_lines", sum(1 for x in out if x["is_command"])),
            ("canonical_command_lines", sum(1 for x in out if x["command"] and x["command"]["type"] == CAN)),
            ("interrupted_lines", sum(1 for x in out if x["interrupted"])),
            ("narrator_lines", sum(1 for x in out if x["speaker"] == "NARRATOR")),
            ("subtitle_cues", sum(len(x["subtitle_cues"]) for x in out)),
            ("by_speaker", speakers),
            ("by_scene_seconds", scene_tot),
        ])),
        ("scenes", scenes),
        ("lines", out),
    ])

    onscreen = build_onscreen(lines, start, end, sha)
    md = build_md(dialogue, onscreen)
    return dialogue, onscreen, md


def paragraph_at(lines, i):
    a = i
    while a > 0 and lines[a - 1].strip():
        a -= 1
    b = i
    while b + 1 < len(lines) and lines[b + 1].strip():
        b += 1
    return " ".join(lines[a:b + 1])


def scene_for_line(lines, start, idx):
    sid = None
    for k in range(start, idx + 1):
        m = SCENE_RE.match(lines[k])
        if m:
            sid = m.group(2) or "PROLOGUE"
    return sid


def build_onscreen(lines, start, end, sha):
    cards = []
    for cid, kind, txt, loc, expect_opt in ONSCREEN_SPECS:
        rx = re.compile(loc)
        hits = [k for k in range(start, len(lines)) if rx.search(lines[k])]
        if len(hits) != 1:
            fail("on-screen card %s locator %r matched %d lines" % (cid, loc, len(hits)))
        k = hits[0]
        para = paragraph_at(lines, k)
        optional = bool(re.search(r"\b(optional|only if|If place names appear)\b", para))
        if optional != expect_opt:
            fail("on-screen card %s: optional=%s from screenplay but expected %s" % (cid, optional, expect_opt))
        if txt and kind == "location_caption" and cid != "T08":
            listed = re.search(r"without implying boundaries: (.+)\.$", lines[k]).group(1).split("; ")
            if txt not in listed:
                fail("caption %s not in screenplay list %r" % (txt, listed))
        if cid == "T08" and lines[k] != "ON-SCREEN LOCATION: " + txt + ".":
            fail("CLING caption text changed: %r" % lines[k])
        if cid == "T06" and lines[k] != "TITLE: " + txt + ".":
            fail("title text changed: %r" % lines[k])
        det = ONSCREEN_DETAILS[cid]
        extra = []
        if det.get("during_line"):
            narr = [l for l in lines[start:end] if l.startswith('"Tara. Scrapper. Verdor.')]
            if len(narr) != 1:
                fail("could not find the narrator's place-name line for caption %s" % cid)
            pos = [narr[0].find(w) for _c, w, _s, _l in PROLOGUE_CAPTIONS]
            if min(pos) < 0 or pos != sorted(pos):
                fail("prologue captions no longer follow the narration order: %r" % pos)
            if det["synced_words"].upper() != txt:
                fail("caption %s text %r does not match its spoken words %r" % (cid, txt, det["synced_words"]))
            extra = [("during_dialogue_line", det["during_line"]), ("synced_to_spoken_words", det["synced_words"]),
                     ("shotlist_shot", det["shot"]), ("display_order", det["display_order"])]
        cards.append(OrderedDict([
            ("id", cid),
            ("kind", kind),
            ("text", txt),
            ("optional", optional),
            ("scene", "END TITLES" if kind == "end_titles" else scene_for_line(lines, start, k)),
            ("after_dialogue_line", det["after_line"]),
            ("before_dialogue_line", det["before_line"]),
        ] + extra + [
            ("placement", det["placement"]),
            ("suggested_hold_seconds", det["suggested_hold_seconds"]),
            ("screenplay_says", lines[k].strip() if len(lines[k]) < 160 else para[:400]),
            ("note", ONSCREEN_NOTES[cid]),
            ("source_line", k + 1),
        ]))
    return OrderedDict([
        ("episode", "S01E01"),
        ("status", "Planning data. Nothing has been designed or rendered yet."),
        ("source", REL_SOURCE),
        ("source_sha256", sha),
        ("generated_by", REL_SCRIPT),
        ("about", "Text that appears in the picture itself (title, captions, lettering, credits). This is separate from dialogue subtitles. 'optional' is true where the screenplay makes the card conditional or optional."),
        ("suggested_hold_seconds_note", "Suggestions for the animatic only; adjust in the edit."),
        ("never_on_screen", NEVER_ON_SCREEN),
        ("cards", cards),
    ])


NAMED = {"Leaf", "Charcoal", "Starlight", "Remi", "Abby", "Alexandria"}
SMALL_WORDS = {"a", "an", "the", "and", "or", "of", "in", "on", "to", "for", "at", "by", "with"}


def title_case(s):
    words = s.lower().split(" ")
    return " ".join(w if (i and w in SMALL_WORDS) else w[:1].upper() + w[1:] for i, w in enumerate(words))


def fmt_s(x):
    return ("%.1f" % x).rstrip("0").rstrip(".") if x != int(x) else "%d" % x


def mmss(sec):
    sec = int(round(sec))
    return "%d:%02d" % (sec // 60, sec % 60)


def build_md(d, o):
    L = []
    add = L.append
    tot = d["totals"]
    add("# Dragon's Kingdom, Season 1 Episode 1: Dialogue")
    add("")
    add("This is the recording script: who says what, scene by scene. It is made from `screenplay.md` by `tools/extract_dialogue.py`, so it always matches the screenplay. **No voices have been recorded and nothing has been rendered yet.**")
    add("")
    add("## How to read it")
    add("")
    add("- Only the words in the **Line** column are spoken. The **How** column is advice for the performer; never say it out loud.")
    add("- **ORIGINAL** marks Daxtyn's own four lines. Say them exactly as written, word for word. (The word \"ORIGINAL\" is never spoken or shown.)")
    add("- A dash at the end of a line (—) means the speaker gets cut off.")
    add("- **CMD** marks a dragon command. Attack = physical attack. Fire = flame. Hold = stop. Skit (retreat) and Free fire are not used in this episode. \"Back\", \"Again\", \"Home. Come on.\" and \"Leaf. Here.\" are ordinary directions to a dragon, not new official commands.")
    add("- Dragons never speak.")
    add("- *Sec* is a rough guess at how long the line takes to say. Real recordings will be different.")
    add("")
    add("## Totals")
    add("")
    add("- Spoken lines: **%d** (%d narrator lines, %d ORIGINAL lines, %d dragon-command lines, %d cut-off lines)"
        % (tot["spoken_lines"], tot["narrator_lines"], tot["original_lines"], tot["command_lines"], tot["interrupted_lines"]))
    add("- Total speaking time: about **%s seconds (%s min:sec)**. Everything else is picture, action, music and silence."
        % (fmt_s(tot["est_spoken_seconds"]), mmss(tot["est_spoken_seconds"])))
    add("- How long is the whole episode? The screenplay's plan says about 50 minutes, but the shot list estimates **about 25 minutes** at a natural pace (see `shotlist.md`). The real length comes from the animatic. Nothing will be stretched to reach 50.")
    add("")
    add("| Character | Lines | Words | About how many seconds |")
    add("|---|---:|---:|---:|")
    rows = sorted(tot["by_speaker"].items(), key=lambda kv: (-kv[1]["lines"], kv[0]))
    for name, s in rows:
        add("| %s | %d | %d | %s |" % (name, s["lines"], s["words"], fmt_s(s["est_seconds"])))
    add("| **All** | **%d** | **%d** | **%s** |" % (tot["spoken_lines"], sum(s["words"] for s in tot["by_speaker"].values()), fmt_s(tot["est_spoken_seconds"])))
    add("")
    add("| Scene | Lines | About how many seconds |")
    add("|---|---:|---:|")
    for sc in d["scenes"]:
        add("| %s %s | %d | %s |" % (sc["id"], title_case(sc["title"]), sc["lines"], fmt_s(sc["est_seconds"])))
    add("")
    add("How the seconds are guessed: count the words, then divide by 2.6 words per second for normal talking, or 2.1 for the narrator and for whispered, quiet, low or in-pain lines. Add a quarter second for each extra sentence inside a line (0.4 for the narrator). One-word dragon commands get a fixed 0.6 to 1.0 seconds. Every line gets at least 0.6 seconds. Pauses between lines are not counted.")
    add("")
    add("## On-screen words (not spoken)")
    add("")
    add("These appear in the picture, not in the voice track. Full details are in `onscreen-text.json`.")
    add("")
    for c in o["cards"]:
        t = c["text"] if c["text"] else "(credits, to be written; real contributors only)"
        add("- %s **%s**%s" % (c["id"], t, " (optional)" if c["optional"] else ""))
    add("")
    add("## The script")
    for sc in d["scenes"]:
        add("")
        add("### %s: %s" % ("Prologue" if sc["id"] == "PROLOGUE" else "Scene " + sc["id"], title_case(sc["title"])))
        add("")
        add("*%s* · %d lines · about %s s" % (sc["slugline"], sc["lines"], fmt_s(sc["est_seconds"])))
        add("")
        add("| # | Who | Line | How | Sec |")
        add("|---|---|---|---|---:|")
        for x in d["lines"]:
            if x["scene"] != sc["id"]:
                continue
            tags = []
            if x["original"]:
                tags.append("**ORIGINAL, say exactly.**")
            if x["is_command"]:
                tags.append("**CMD** (%s)." % ("official command" if x["command"]["type"] == CAN else "direction, not an official command"))
            how = []
            if x["performance_note"]:
                how.append("*%s.*" % x["performance_note"].capitalize())
            if x["addressee"] and x["addressee_source"] in (BR, SD):
                who = x["addressee"]
                if who not in NAMED and not who.startswith("the "):
                    who = "the " + who
                how.append("To %s." % who)
            ctx = x["delivery"]
            if x["performance_note"]:
                ctx = ctx.split(" — ", 1)[1]
            how.append(ctx)
            add("| %s | %s | %s | %s | %s |" % (x["id"], x["speaker"], x["text"].replace("|", "\\|"),
                                               " ".join(tags + how), fmt_s(x["est_seconds"])))
            if x["beat_after"]:
                add("| | | *(silence)* | %s | |" % x["beat_after"])
    add("")
    add("---")
    add("")
    add("Generated from `screenplay.md` (sha256 `%s`). To rebuild after a screenplay change: `python3 tools/extract_dialogue.py`." % d["source_sha256"][:16])
    add("")
    return "\n".join(L)


def dump_json(obj):
    return json.dumps(obj, indent=2, ensure_ascii=False) + "\n"


def main(argv):
    check = "--check" in argv
    dialogue, onscreen, md = build()
    outputs = [(OUT_DIALOGUE, dump_json(dialogue)), (OUT_ONSCREEN, dump_json(onscreen)), (OUT_MD, md)]
    stale = []
    for path, content in outputs:
        if check:
            if not path.exists() or path.read_text(encoding="utf-8") != content:
                stale.append(path.name)
        else:
            path.write_text(content, encoding="utf-8")
    t = dialogue["totals"]
    print("spoken lines: %d | est. spoken seconds: %s | originals verified: %d | commands: %d | on-screen cards: %d"
          % (t["spoken_lines"], t["est_spoken_seconds"], t["original_lines"], t["command_lines"], len(onscreen["cards"])))
    if check:
        if stale:
            print("STALE: " + ", ".join(stale))
            return 1
        print("up to date")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
