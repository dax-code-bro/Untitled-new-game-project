#!/usr/bin/env python3
"""Prove that final/screenplay-final.md (the locked shooting script) keeps screenplay.md intact and
keeps the 28 additions exactly as proposed, lint the canon and the rating limits, estimate the
runtime, and (with --clean) write the reading copy final/screenplay-final-clean.md.

It extends check_extended.py and reuses its timing model, its per-addition shot estimates and its
canon lists, so both tools always agree. check_extended.py is unchanged and still checks
screenplay-extended.md.

Markers in the final script (see its first FINAL SCRIPT NOTE). Everything marked PROPOSED is a proposal
(SERIES.md section 5): being in the shooting script is not acceptance. What Daxtyn has decided is marked
creator-approved with the date and recorded in final/CHANGES.md; those blocks keep an approval marker (not a
PROPOSED one) in this production copy so that proofs 1 and 2 can still tell the handoff and the proposals
apart, and the reading copy (--clean) has no markers at all: no block markers, no NOTE lines and no
"[creator-approved wording 2026-10-18]" cue marker (the handoff's own [ORIGINAL] cue marks stay: they are Daxtyn's
text). SERIES.md section 5 describes this. An addition he accepts as a whole would need proofs 1b and 2 to treat its
text as base text, which is not built yet.
  [PROPOSED ADDITION X# — in the shooting script by default 2026-10-16, not accepted by Daxtyn — begin]
      ... [PROPOSED ADDITION X# — end]
  [PROPOSED RATING PASS R# — begin] ... [PROPOSED RATING PASS R# — end]   (may sit inside an addition;
      ids may carry a letter, R8b, for blocks added between existing ones)
  [RATING PASS R# — creator-approved 2026-10-18 — begin] ... [RATING PASS R# — end]   (a rating-pass block
      Daxtyn approved; exactly the ids in APPROVED_RATING; its NOTE opens with RP_NOTE_APPROVED)
  [CHANGED C# — reason — WAS (kept for the record, not shot):] old lines
  [CHANGED C# — NOW (shoot this):] new lines [CHANGED C# — end]   (may sit inside an addition; ids may
      carry a letter too, C8b)
  [PENDING P# — Daxtyn wording — DRAGONS.md L9 — begin] ... [PENDING P# — end]
      (right after dialogue kept as written while Daxtyn decides its wording; holds only a NOTE with the
      proposed alternative; never shot; may sit inside an addition. None is open since 2026-10-18:
      PENDING_LINES is empty, so any PENDING block fails until a new open question is listed there)
  [FINAL SCRIPT NOTE — begin] ... [FINAL SCRIPT NOTE — end]  (document notes, top level only)
  "SPEAKER [creator-approved wording 2026-10-18]:"   (a cue source marker, like [ORIGINAL]: Daxtyn approved this
      exact wording; only in the NOW text of an APPROVED_CHANGES block)

Daxtyn's decisions of 2026-10-18 that this tool enforces (final/CHANGES.md section 9):
  - APPROVED_CHANGES: the five dialogue lines that named a scrapped species, with their old and new text, his
    own [ORIGINAL] line "Why couldn't I get a Bashion?" among them. These and only these may change a spoken
    line of screenplay.md or an [ORIGINAL] line.
  - APPROVED_RATING: the rating-pass blocks with the six unnamed adult deaths in Cling.
  - Remi is an adult: he is no longer in the rating lint's protected list (Abby, the Cling child, the young
    attendant and the young riders still are).

Hard checks (exit code 1 if any fails):
  1. Proof that the original survives:
       a. every line of screenplay.md (blank lines included) appears word for word and in order as a
          line of the final script (the WAS text of a changed line counts: it is kept verbatim);
       b. dropping every note, addition, rating-pass and PENDING block (with the blank line each brought) and
          turning every top-level CHANGED block back into its WAS text gives screenplay.md byte for
          byte, so nothing unmarked was added or changed;
       c. the [ORIGINAL] cue + quote pairs are in the shooting text unchanged, except one that an
          APPROVED_CHANGES entry replaces (then the approved pair is shot and the old one is not); no other
          CHANGED block touches them, and no new cue is marked [ORIGINAL];
       d. top-level changes sit only inside the story (between "SCREENPLAY" and "END OF EPISODE 1."):
          the front matter, CANON LOCK and closing checks stay word for word;
       e. every spoken line of screenplay.md (cue + quote) is spoken word for word, in order, in the shooting
          text outside the additions and rating-pass blocks, and nothing else is spoken there, except the
          APPROVED_CHANGES lines, which are spoken exactly in their approved wording;
       f. every APPROVED_CHANGES block is in the script with exactly its recorded WAS and NOW text, in the
          addition it belongs to; no other CHANGED block claims creator approval, and the cue marker
          "[creator-approved wording 2026-10-18]" appears only in their NOW text;
       g. every approved rating-pass block (APPROVED_RATING) holds exactly the story text Daxtyn approved, word for
          word (APPROVED_RATING_TEXT, itself locked by APPROVED_RATING_SHA256): his approval covers that content,
          not just the block ids.
  2. Proof that the additions are the proposals: inside each addition, dropping its rating-pass and
     PENDING blocks and turning its CHANGED blocks back into WAS text gives the body of the same
     "[PROPOSED ADDITION X#]" in screenplay-extended.md exactly.
  3. Markers: well formed, ids unique and increasing (gaps are allowed: Daxtyn may cut), only
     rating-pass, CHANGED and PENDING blocks nest (inside additions), every proposed rating-pass block opens
     with "NOTE (not spoken): [PROPOSED RATING PASS]" and every approved one with RP_NOTE_APPROVED, the
     approved marker form is used for exactly the APPROVED_RATING ids, every CHANGED reason names DRAGONS.md,
     [PROPOSED RATING PASS] or (APPROVED_CHANGES only) "creator-approved 2026-10-18", every PENDING block
     opens with "NOTE (not spoken): [PENDING Daxtyn wording — DRAGONS.md L9]" and follows one of the
     PENDING_LINES, and every PENDING_LINES line is followed by one.
  4. Dependencies: check_extended.DEPENDS for additions and RATING_DEPENDS below; a kept block whose
     dependency was cut fails, and each link is named in the dependent's first note (or CHANGED
     reason) and in the closing note's "Links between additions" / "Rating-pass links" paragraphs.
  5. Canon lint on all new text (additions, rating-pass blocks, NOW text): check_extended's
     forbidden lists and regression guards; no species word (except the PENDING_LINES); no front legs,
     upright sitting or dog-sit on the haunches (DRAGONS.md low stance); Queen Fall only in X28's wordless
     shot and never speaking; no death or bleeding-out words with the scout or its rider;
     no fire, wounds or blood with Starlight; Abby never mentions being queen; no canonical command
     and no short spoken order to a dragon; only known speakers (dragons never speak). In the whole
     story's shooting text no species word is left (Daxtyn chose the new wording on 2026-10-18; the
     PENDING_LINES exception is empty).
  6. Rating hard limits (SERIES.md section 8) on all new text: no sentence pairs a drug, tobacco, alcohol
     (drinking words included) or suggestive word with Abby, a child, the princess, the young attendant or the young
     riders, or with a title or kinship word that can stand for them ("his sister", "her daughter", "Leaf's rider",
     "the little one", ...) (Remi is an adult, Daxtyn 2026-10-18); those characters never speak such words, their cues
     carry no such direction, and nobody says such a word to them ("[to Abby]"); no graphic bone or gore with Abby;
     the story text of the death and gore blocks (DEAD_BLOCKS) never names a child or a small or little
     body: every one of the dead is an adult.
     b. Context: names are not enough, because a pronoun carries a character into the next sentence. A sentence
        with such a word and a third-person pronoun (she, her, he, his, they, ...) fails when one of those
        characters was named earlier in the same paragraph or in the paragraph before. A person reads each hit in
        context; only an exact sentence listed in REVIEWED_CONTEXT, with the reason, passes (shown by --review;
        rewording the sentence makes it fail again until it is read again).
     d. Deaths: a death word in new story text outside the blocks Daxtyn approved (APPROVED_RATING: the six unnamed
        adult deaths in Cling) fails, because a new death needs his OK; a sentence that is not a death (a direction
        such as "Do not imply death.") is listed in REVIEWED_CONTEXT.
  7. The runtime quoted in the timing FINAL SCRIPT NOTE matches the computed estimate
     (--update-timing rewrites it), and final/screenplay-final-clean.md is up to date (--clean).

Runtime model: check_extended.py's (speech = words / 2.6, or 2.1 for whispered/quiet/low/through
pain, + 0.25 s per internal sentence break, min 0.6 s, + 0.35 s cue gap). Original scenes use
shotlist.json scene_totals; additions use check_extended.ADDITION_SHOTS on the proposal text;
rating-pass blocks use RATING_SHOTS below; CHANGED blocks add CHANGE_SHOTS' picture delta plus the
speech difference between NOW and WAS. Tight-cut bound = 0.9/0.8/0.5 x (speech/action/holds),
loose-cut bound = 1.15/1.3/1.5 x; both are outer bounds, not likely values.

Usage: python3 tools/check_final.py [--markdown] [--review] [--json out.json] [--clean]
                                    [--update-timing] [--final FILE] [--orig FILE] [--ext FILE]
       python3 tools/check_final.py --selftest   (broken copies of the script must fail: rules 1g, 6, 6b, 6d)
Standard library only. Paths are relative to this file (episodes/s01e01/tools/).
"""
import copy
import hashlib
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import check_extended as ce  # noqa: E402  (same folder; unchanged; its main() is not run)

EP = os.path.normpath(os.path.join(HERE, ".."))
ORIG, EXT = ce.ORIG, ce.EXT
FINAL = os.path.join(EP, "final", "screenplay-final.md")
CLEAN = os.path.join(EP, "final", "screenplay-final-clean.md")
SHOTLIST = ce.SHOTLIST

ADD_BEGIN = re.compile(r"^\[PROPOSED ADDITION (X\d+) — (in the shooting script by default 2026-10-16, not accepted by Daxtyn) — begin\]$")
ADD_END = re.compile(r"^\[PROPOSED ADDITION (X\d+) — end\]$")
APPROVED_DATE = "2026-10-18"
RP_BEGIN = re.compile(r"^\[(?P<form>PROPOSED RATING PASS|RATING PASS) (?P<id>R\d+[a-z]?)(?P<appr> — creator-approved 2026-10-18)? — begin\]$")
RP_END = re.compile(r"^\[(?P<form>PROPOSED RATING PASS|RATING PASS) (?P<id>R\d+[a-z]?) — end\]$")
PEND_BEGIN = re.compile(r"^\[PENDING (P\d+) — Daxtyn wording — DRAGONS\.md L9 — begin\]$")
PEND_END = re.compile(r"^\[PENDING (P\d+) — end\]$")
RP_NOTE = "NOTE (not spoken): [PROPOSED RATING PASS]"
RP_NOTE_APPROVED = "NOTE (not spoken): [RATING PASS — creator-approved 2026-10-18]"
RP_REASON = "[PROPOSED RATING PASS]"
PEND_NOTE = "NOTE (not spoken): [PENDING Daxtyn wording — DRAGONS.md L9]"
# Dialogue kept as written while Daxtyn decides its wording: {quoted line: PENDING id}; each must be followed by a
# PENDING block. Empty since 2026-10-18: Daxtyn chose the wording for every line that named a scrapped species
# (APPROVED_CHANGES below), which closed the DRAGONS.md question the old P1-P3 blocks held open.
PENDING_LINES = {}

# Daxtyn's decisions of 2026-10-18 (final/CHANGES.md section 9). The old and new text of every approved change,
# exactly as it must stand in the CHANGED block's WAS and NOW sections. "in": the addition the block sits in
# (None = the handoff's own text).
APPROVED_REASON = "creator-approved " + APPROVED_DATE        # every approved CHANGED reason starts with this
APPROVED_TAG = "creator-approved wording " + APPROVED_DATE   # cue source marker in the NOW text, like [ORIGINAL]
APPROVED_CHANGES = {
    "C8b": {"in": None, "line_ids": ["L048"],
            "decision": "Daxtyn approved changing his own [ORIGINAL] line (decision 1).",
            "was": ['ABBY [ORIGINAL]:', '"Why couldn\'t I get a Bashion?"'],
            "now": ['ABBY [%s]:' % APPROVED_TAG, '"Why couldn\'t I get one like Charcoal?"']},
    "C9": {"in": None, "line_ids": ["L053", "L054"],
           "decision": "Daxtyn chose the suggested wording (decision 1).",
           "was": ['REMI:', '"Nightwings are faster. More versatile."', '', 'ABBY:', '"And Bashions?"'],
           "now": ['REMI [%s]:' % APPROVED_TAG, '"Smaller ones are faster. More versatile."', '',
                   'ABBY [%s]:' % APPROVED_TAG, '"And big ones?"']},
    "C19": {"in": None, "line_ids": ["L109"],
            "decision": "Daxtyn chose the suggested wording (decision 1).",
            "was": ['REMI:', '"We were off the coast. Flying together. Something came past Leaf. A Slitherwing."'],
            "now": ['REMI [%s]:' % APPROVED_TAG,
                    '"We were off the coast. Flying together. Something came past Leaf. A small dragon. Fast."']},
    "C30": {"in": "X17", "line_ids": ["X17-11"],
            "decision": "Daxtyn chose the suggested wording (decision 1); X17 itself is still a proposal.",
            "was": ['ABBY:', '"I still want a Bashion."'],
            "now": ['ABBY [%s]:' % APPROVED_TAG, '"I still want one like Charcoal."']},
}
# Rating-pass blocks Daxtyn approved (decision 2: keep the six unnamed adult deaths in Starlight's attack, with their
# gore). {id: the addition it sits in, or None}. R19 (the parent shields the child) and R16/R17 (the villager's
# injuries) are not deaths and stay proposals.
APPROVED_RATING = {"R15": None, "R16b": None, "R18": None, "R20": "X27", "R21": "X28"}
# What Daxtyn approved is the CONTENT of those blocks, not only their ids. Every story line of each approved block
# (each non-blank line except the production NOTE), exactly as final/CHANGES.md question 4 put it to him: the text of
# screenplay-final.md at commit 89efae0 (2026-10-16). The approval itself (commit 3f43434, 2026-10-18) changed only the
# markers and NOTE lines. Proof 1g fails if a word of this text changes; the sha256 values also catch an edit of this
# table. A change to approved text needs Daxtyn's OK first: record it in final/CHANGES.md, then update both tables.
APPROVED_RATING_TEXT = {
    "R15": [
        "PICTURE: Out of the dust, low to the ground: a man who was standing under the adjoining roofline when it came down is under it now. Only his arm shows beneath the timbers and broken tiles, and it does not move. Blood runs out from under the wreckage and along the joints between the paving stones toward the fountain.",
        "PICTURE: A woman near the steps turns to run, and a flying length of roof timber takes her across the back of the head. She drops face down and stays down. Someone stumbles over her in the dust and keeps going.",
    ],
    "R16b": [
        "PICTURE: As the white body passes over, a guard of the escort who has had no lines, posted alone at the far side of the square, is lifted off his feet by the blast of air and thrown against the stone front of a house. He slides down it, leaves a long dark smear on the stone and does not move again. His spear skids away across the paving.",
    ],
    "R18": [
        "PICTURE: And the people who did not get out of the open. The arm under the roof timbers. The woman by the steps, face down where she fell, the dust on her already darkening. Near the fountain a man sits on the paving with a grown woman across his lap whose head is a ruin of blood, rocking, saying nothing. A banner torn down in the first pass lies over a man-sized shape in the middle of the square, soaked dark through at its center.",
    ],
    "R20": [
        "PICTURE: In the mouth of the alley he lifts a fallen awning and stops, the way a man stops for someone he knows. Under it a man lies dead, his chest crushed in under a fallen beam. The guard looks at him for one breath, lays the awning back over his face, and stands up.",
    ],
    "R21": [
        "PICTURE: Along the wall below the steps, across the square from the arch and out of sight of the shelter beneath it, the dead are laid in a row, every one of them a grown man or woman, covered with whatever festival cloth is left. The banners are not long enough. From under one of them a pair of men's boots shows, a festival ribbon still tied through one lace.",
    ],
}
APPROVED_RATING_SHA256 = {"R15": "cbd2531530b93652ccb5dd8203554333c7048e2e85cb9457e8db7bdf87696653",
                          "R16b": "e24498efe303081303b2c86b8f5d95aab23d4900b542a928b3bba8d2bfddcf9b",
                          "R18": "e9b3254a142142836ee57473e8b7ea28b0a1cc34dcaeb78f16e2fae8f846fbf7",
                          "R20": "8d5cc441fa784500aeabede8f886ffed9042ceb839213d5fa24d4dd5beb165a1",
                          "R21": "dc56e4819b871c5696446f04a6050d1756661bb58f33f1f88785cd76ed249fe1"}
CH_WAS = re.compile(r"^\[CHANGED (C\d+[a-z]?) — (.+) — WAS \(kept for the record, not shot\):\]$")
CH_NOW = re.compile(r"^\[CHANGED (C\d+[a-z]?) — NOW \(shoot this\):\]$")
CH_END = re.compile(r"^\[CHANGED (C\d+[a-z]?) — end\]$")
NOTE_BEGIN, NOTE_END = "[FINAL SCRIPT NOTE — begin]", "[FINAL SCRIPT NOTE — end]"
MARKER_WORDS = ("ADDITION", "RATING PASS", "CHANGED", "PENDING", "FINAL SCRIPT NOTE", "EXTENDED EDITION NOTE")
EXT_BEGIN = re.compile(r"^\[PROPOSED ADDITION (X\d+) — begin\]$")
EXT_END = re.compile(r"^\[PROPOSED ADDITION (X\d+) — end\]$")
TIMING_RE = re.compile(r"expected (\d+:\d\d), tight-cut bound (\d+:\d\d), loose-cut bound (\d+:\d\d)")

# Rating-pass blocks and changes that lean on another one: {dependent: [ids it needs, all of them]}.
# R15 heads the deaths in Cling: R16b, R18, R20 and R21 all lean on it, so cutting R15 ("no deaths") flags every
# other death block (and R19 through R18).
RATING_DEPENDS = {"R5": ["R4"], "R7": ["C15"], "R8": ["C15"], "R8b": ["C15"], "R9b": ["C15"], "C20": ["C15"],
                  "C23": ["C15"], "C24": ["C15"], "C25": ["C15"], "R16b": ["R15"], "R18": ["R15"], "R19": ["R18"],
                  "R20": ["R15"], "R21": ["R15"], "C36": ["R17"]}
# Death and gore blocks: their story text must never name a child or a small/little body (SERIES.md section 8).
DEAD_BLOCKS = {"R15", "R16b", "R17", "R18", "R20", "R21"}
DEAD_CHILD_RE = re.compile(r"\b(child\w*|kids?|small|little|boys?|girls?|bab(y|ies)|infants?|toddlers?)\b", re.I)
ANY_OF = {"X24", "X25"}            # these need at least one of their listed additions (check_extended.DEPENDS)
NEW_ROLES = {"KEEPER", "SAILOR"}   # unnamed speaking roles added by the rating pass
DRAGON_NAMES = {"CHARCOAL", "LEAF", "STARLIGHT", "SCOUT", "HATCHLING", "THE SCOUT", "THE HATCHLING"}

# Picture time for each rating-pass block: (what we see, action_s, breath_s). Same scale as
# shotlist.json and check_extended.ADDITION_SHOTS; dialogue is computed from the words. "key" must
# appear in the block (guards against renumbering).
RATING_SHOTS = {
    "R1": {"title": "X1: the wine on the sill", "key": "a jug of wine, nearly empty", "shots": [
        ("Jug and one cup on the sill, first light", 3.5, 0.5)]},
    "R2": {"title": "X3: the keeper's pipe and the turf", "key": "Every damned morning I lay that turf", "shots": [
        ("Keeper knocks out his pipe and grinds the ember into the turf", 4, 0), ("The other keeper doesn't answer", 1.5, 0)]},
    "R3": {"title": "X5: the musician's pipe", "key": "It's for my nerves", "shots": [
        ("The parent calls the child in; the door shuts", 2.5, 0),
        ("Musician lights the pipe; sweet smoke; the vendor knows", 4.5, 0), ("Pipe exchange", 0.5, 0),
        ("Vendor goes back; musician smokes, eyes closed", 3, 0.5)]},
    "R4": {"title": "X9: the crew at ease", "key": "a cup of dice", "shots": [
        ("Off-watch crew with ale and dice; the master's pipe", 5, 0)]},
    "R5": {"title": "X9: cork the jug", "key": "cork that jug, for pity's sake", "shots": [("The master sees the jug", 1.5, 0), ("Jug corked; dice pocketed", 2.5, 0)]},
    "R6": {"title": "2A: a keeper swears", "key": "Oh, shit.", "shots": [("Keeper's reaction", 0.5, 0)]},
    "R7": {"title": "X10: blood on Remi's hands", "key": "drying dark and tacky in the creases of his knuckles", "shots": [
        ("Blood in his knuckles and on his sleeves; the wipe spreads it", 4, 0.5)]},
    "R8": {"title": "2A: Charcoal's bloody jaw; Remi streaked", "key": "dark and wet with the scout's blood", "shots": [
        ("Charcoal's bloody jaw and throat; the keepers stop", 4, 0),
        ("Remi takes a keeper's cloth and scrubs his face as he crosses", 3.5, 0), ("Abby's eyes on his hands", 2, 0.5)]},
    "R8b": {"title": "2B: Alexandria sees the blood on Remi", "key": "sees that he is standing and steady", "shots": [
        ("Her look finds the blood on Remi, then goes back to Abby", 2.5, 0)]},
    "R9": {"title": "2C: the crew's dark joke", "key": "Keep your fingers where you can count them", "shots": [
        ("Master hears the order, pipe in teeth; pours the ale over the side", 5, 0), ("Crew exchange", 0.5, 0.5)]},
    "R9b": {"title": "2C: Remi's scrubbed hands", "key": "red from scrubbing", "shots": [
        ("Remi's scrubbed hands; pink water in the healer's bowl", 3, 0)]},
    "R10": {"title": "X15: the keepers' flask", "key": "never once eaten you", "shots": [
        ("The ground keeper walks back to another keeper; the flask passes", 4, 0), ("Flask exchange", 0.5, 0), ("He drinks, longer than he meant to", 1.5, 0.5)]},
    "R11": {"title": "X20: the couple's joke", "key": "a man who takes his time", "shots": [
        ("Close on the couple; no child in the shot", 1.5, 0), ("He laughs into his cup", 2, 0)]},
    "R12": {"title": "3A: the king's toast", "key": "To the person behind you", "shots": [
        ("A cup put in the king's hand; he lifts it", 3, 0), ("The square drinks", 2.5, 0)]},
    "R13": {"title": "X22: the miller's-wife verse", "key": "the baker came to stay", "shots": [
        ("Alley end of the table; the children across the square; the musician eating", 3.5, 0),
        ("Sung low, slower than the speech model", 4, 0),
        ("Laughter; the partner hides her face; the musician stares", 3, 0), ("'Not that one.'", 0.5, 0),
        ("The musician goes back to the music space", 2.5, 0)]},
    "R14": {"title": "3C: the captain swears", "key": "for fuck's sake", "shots": [("Guards jolted into action", 1.5, 0)]},
    "R15": {"title": "3C: the first pass kills", "key": "Only his arm shows beneath the timbers", "shots": [
        ("The arm under the timbers; blood along the joints", 5, 0.5), ("A woman struck by a timber; drops; stumbled over", 4, 0)]},
    "R16": {"title": "3C: the second pass hurts the villager", "key": "takes the ADULT VILLAGER's legs out from under him", "shots": [
        ("Most of it finds empty ground; a flying board takes the villager's legs", 4.5, 0)]},
    "R16b": {"title": "3C: a guard of the escort dies", "key": "leaves a long dark smear on the stone", "shots": [
        ("A guard thrown against the house front; the smear", 4, 0)]},
    "R17": {"title": "3C: the villager's injuries", "key": "the bone shows white through the torn trouser", "shots": [
        ("Split scalp; the leg; the king looks at his face", 4.5, 0.5)]},
    "R18": {"title": "3D: the dead in the square", "key": "whose head is a ruin of blood", "shots": [
        ("The arm; the woman face down", 4, 0), ("A man rocking with the dead across his lap", 4, 1),
        ("A banner soaked dark over a shape", 3.5, 1)]},
    "R19": {"title": "3D: the parent shields the child", "key": "keeps the child's face turned the other way", "shots": [
        ("Over the parent's shoulder: the shape; the child's face turned away", 3.5, 0.5)]},
    "R20": {"title": "X27: the guard finds a dead man", "key": "lays the awning back over his face", "shots": [
        ("The guard lifts the awning; a dead man he knows; lays it back", 5, 1)]},
    "R21": {"title": "X28: the covered dead", "key": "a festival ribbon still tied through one lace", "shots": [
        ("The covered dead in a row; boots with a ribbon", 5, 1)]},
}
# Picture-time change for each CHANGED block (s); speech differences are computed from the words.
# "key" must appear in the NOW text.
CHANGE_SHOTS = {
    "C1": ("crouches low, belly near the grass", 0), "C2": ("Leaf crouches low, belly near the grass", 0),
    "C3": ("its ordinary working dragons", 0), "C4": ("crouches low and level beside a fishing crew", 0),
    "C5": ("The quay dragon answers from below", 0), "C6": ("one young dragon lying down flat", 0),
    "C7": ("smaller dragons like Leaf are faster", 0), "C8": ("He settles there low and level", 0),
    "C10": ("The scout, a small dragon, cuts past Leaf", 0),
    "C11": ("Do not imply Charcoal is the faster dragon", 0), "C12": ("does not outfly the scout", 0),
    "C13": ("you little bastard", 0), "C14": ("blistered raw and blackened at the edges", 3.5),
    "C15": ("Blood sprays over Charcoal's black jaw", 1.5), "C16": ("the torn, bleeding shoulder where the wing was", 2.5),
    "C17": ("a red stain in the water around", 1.0), "C18": ("sees the green dragon low over the harbor", 0),
    "C20": ("The water in the bowl turns pink", 5.0),
    "C21": ("You're in my bloody light", 0), "C22": ("what this newborn eats", 0),
    "C23": ("Charcoal himself has no wound", 0), "C24": ("a crust of blood that is not his", 1.0),
    "C25": ("a torn strip of the scout's wing membrane", 4.0), "C26": ("the same quay dragon", 0),
    "C27": ("The working dragon crouched beside its fishing crew", 0), "C28": ("lead their dragons off the field", 0),
    "C29": ("Leaf is up at once, low on his two legs", 0),
    "C31": ("the wrists of its folded wings first", 0), "C32": ("more scouts or at a war", 0),
    "C8b": ("Why couldn't I get one like Charcoal?", 0), "C9": ("Smaller ones are faster. More versatile.", 0),
    "C19": ("A small dragon. Fast.", 0), "C30": ("I still want one like Charcoal.", 0),
    "C34": ("his cup of ale goes over beside the bread, still full", 0.5),
    "C35": ("Get under stone! Fucking move!", 0), "C36": ("his broken leg splinted", 0.5),
    "C37": ("a jug that came through the wreck unbroken", 4.0),
}

SPECIES_RE = re.compile(r"\b(Bashions?|Nightwings?|Slitherwings?|species)\b", re.I)
STANCE_RE = re.compile(r"\b(sits? upright|sitting upright|front legs?|forelegs?|four legs|back legs|hind ?legs|rears? up|rearing|"
                       r"haunch\w*|like a dog|dog-?sit\w*)\b", re.I)
DEATH_RE = re.compile(r"\b(dead|died|dies|killed|kills|corpse|lifeless|limp|pumping|bleeding out|bled out|bleeds? to death|"
                      r"drown\w*)\b", re.I)
SCOUT_RE = re.compile(r"\b(scout|the rider|rider's)\b", re.I)
STARLIGHT_RE = re.compile(r"\b(Starlight|Queen Fall|white body|white shape)\b")
WOUND_RE = re.compile(r"\b(fire|flames?|burn\w*|wound\w*|bleed\w*|blood\w*|injur\w*|scar\w*)\b", re.I)
VICE_RE = re.compile(r"\b(ale|wine|cider|beer|mead|brandy|liquor|spirits|flask|jugs?|drunk\w*|tipsy|drinks?|drank|drinking|swig\w*|"
                     r"intoxicat\w*|hung ?over|hangover|booze\w*|tobacco|pipes?|snuff|"
                     r"smok\w*|drugs?|poppy|hemp|opium|suggestive|bawdy|innuendo|flirt\w*|lovers?|seduc\w*|kiss\w*|naked|undress\w*)\b", re.I)
# Characters the rating limits protect (SERIES.md section 8). Remi left this list on 2026-10-18: Daxtyn decided he
# is an adult ("prince" means Remi, so it left too). "princess" is Abby. Titles and kinship words count too, so a
# sentence cannot slip past by calling Abby "his sister", "the queen's daughter" or "Leaf's rider" instead of her name.
PROTECTED_RE = re.compile(r"\b(Abby|princess|child|children|kids?|boys?|girls?|young riders?|young attendant|daughters?|sisters?|"
                          r"Leaf's rider|little ones?|young ones?|youngsters?|lads?|lass(?:es|ie)?|teen\w*|bab(?:y|ies)|infants?|"
                          r"toddlers?|minors?)\b", re.I)
PROTECTED_SPEAKERS = {"ABBY", "CHILD", "YOUNG ATTENDANT"}
# Rule 6b: a pronoun can carry a protected character into the next sentence ("Abby sits down. She takes the cup."). A
# sentence with a drug/tobacco/alcohol/suggestive word and a third-person pronoun fails when a protected character was
# named earlier in the same paragraph or in the paragraph before, unless the exact sentence is in REVIEWED_CONTEXT.
PRONOUN_RE = re.compile(r"\b(she|her|hers|herself|he|him|his|himself|they|them|their|theirs|themselves)\b", re.I)
# Rule 6d: deaths. Daxtyn approved six unnamed adult deaths, all in APPROVED_RATING. A death word in any other new
# story text fails (a new death needs his OK, SERIES.md section 5), unless the exact sentence is in REVIEWED_CONTEXT.
NEW_DEATH_RE = re.compile(r"\b(dead|deaths?|died|dies|dying|killed|kills?|killing|corpses?|lifeless|slain|murder\w*|"
                          r"bled out|bleeding out|bleeds? to death)\b", re.I)
# Sentences a person read in context and found fine for rules 6b and 6d: {exact sentence: why}. An edit of the sentence
# drops it from this list, so the check fails again until someone reads the new wording. Listed ones show in --review.
REVIEWED_CONTEXT = {
    "PICTURE: The musician takes a small pipe from his coat and lights it.":
        "R3 (6b): 'his' is the musician. The child named in the paragraph before is called indoors and the door shuts "
        "before the pipe comes out (the block's own first picture).",
    "Close on the platform boards: his cup of ale goes over beside the bread, still full.":
        "C34 (6b): 'his' is the watchman (an adult); the child earlier in the paragraph is down in the square, seen "
        "from his post.",
    "Do not imply death.":
        "C14 (6d): a direction NOT to show a death (the scout's rider, CANON LOCK 12).",
}
ABBY_GORE_RE = re.compile(r"\b(bone|gore|graphic|blood\w*)\b", re.I)


def load(path):
    with open(path, encoding="utf-8") as f:
        return f.read()


def kind_of(line):
    for kind, rx in (("add_b", ADD_BEGIN), ("add_e", ADD_END), ("rp_b", RP_BEGIN), ("rp_e", RP_END),
                     ("pend_b", PEND_BEGIN), ("pend_e", PEND_END),
                     ("ch_was", CH_WAS), ("ch_now", CH_NOW), ("ch_e", CH_END)):
        m = rx.match(line)
        if m:
            return kind, m
    if line == NOTE_BEGIN:
        return "note_b", None
    if line == NOTE_END:
        return "note_e", None
    return None, None


def parse(lines):
    """Return (top-level nodes, all nodes, errors). Node: dict(kind add|rp|ch|pend|note, id, start, end,
    children, parent, reason, now (index of the NOW marker), status)."""
    errors, top, allnodes, stack = [], [], [], []
    for i, ln in enumerate(lines):
        k, m = kind_of(ln)
        if k is None:
            if ln.startswith("[") and ln.endswith("]") and any(w in ln for w in MARKER_WORDS):
                errors.append("line %d: malformed marker %r" % (i + 1, ln))
            continue
        ident = (m.group("id") if "id" in m.re.groupindex else m.group(1)) if m else None
        if k in ("add_b", "rp_b", "ch_was", "pend_b", "note_b"):
            kind = {"add_b": "add", "rp_b": "rp", "ch_was": "ch", "pend_b": "pend", "note_b": "note"}[k]
            node = {"kind": kind, "id": ident, "start": i, "end": None, "children": [],
                    "parent": stack[-1] if stack else None, "reason": m.group(2) if k == "ch_was" else None,
                    "status": m.group(2) if k == "add_b" else None, "now": None,
                    "approved": (k == "rp_b" and m.group("form") == "RATING PASS") or
                                (k == "ch_was" and m.group(2).startswith(APPROVED_REASON)),
                    "form": m.group("form") if k == "rp_b" else None}
            if k == "rp_b" and (m.group("form") == "RATING PASS") != bool(m.group("appr")):
                errors.append("line %d: malformed rating-pass marker %r (a PROPOSED block has no approval date; an approved "
                              "one reads '[RATING PASS R# — creator-approved %s — begin]')" % (i + 1, ln, APPROVED_DATE))
            if stack:
                p = stack[-1]
                if p["kind"] != "add" or kind not in ("rp", "ch", "pend"):
                    errors.append("line %d: %s block opened inside %s %s (only rating-pass, CHANGED and PENDING blocks may sit inside an addition)"
                                  % (i + 1, kind, p["kind"], p["id"] or ""))
                p["children"].append(node)
            else:
                top.append(node)
            stack.append(node)
            allnodes.append(node)
        elif k == "ch_now":
            if not stack or stack[-1]["kind"] != "ch" or stack[-1]["id"] != m.group(1) or stack[-1]["now"] is not None:
                errors.append("line %d: NOW marker does not belong to an open CHANGED %s block" % (i + 1, m.group(1)))
            else:
                stack[-1]["now"] = i
        else:
            kind = {"add_e": "add", "rp_e": "rp", "ch_e": "ch", "pend_e": "pend", "note_e": "note"}[k]
            if not stack:
                errors.append("line %d: end marker without begin" % (i + 1))
                continue
            node = stack.pop()
            if node["kind"] != kind or (m and node["id"] != ident) or (k == "rp_e" and m.group("form") != node["form"]):
                errors.append("line %d: end marker does not match the block opened at line %d" % (i + 1, node["start"] + 1))
            if kind == "ch" and node["now"] is None:
                errors.append("line %d: CHANGED %s has no NOW marker" % (i + 1, node["id"]))
            node["end"] = i
    for node in stack:
        errors.append("block opened at line %d is never closed" % (node["start"] + 1))
        node["end"] = len(lines) - 1
    return top, allnodes, errors


def was_lines(lines, ch):
    return lines[ch["start"] + 1:ch["now"]] if ch["now"] is not None else []


def now_lines(lines, ch):
    return lines[ch["now"] + 1:ch["end"]] if ch["now"] is not None else []


def materialize(lines, lo, hi, nodes, drop, ch_side, recurse=False):
    """Lines lo..hi (inclusive) with the given direct child nodes resolved. Kinds in `drop` vanish
    together with the blank line they brought (the one before them; after them at the very top).
    CHANGED blocks become their WAS or NOW lines. With recurse, kept add/rp blocks lose their
    marker lines and their own children are resolved the same way."""
    skip, starts = set(), {n["start"]: n for n in nodes}
    for n in nodes:
        if n["kind"] in drop:
            if n["start"] - 1 >= lo and lines[n["start"] - 1] == "":
                skip.add(n["start"] - 1)
            elif n["end"] + 1 <= hi and lines[n["end"] + 1] == "":
                skip.add(n["end"] + 1)
    out, i = [], lo
    while i <= hi:
        if i in starts:
            n = starts[i]
            if n["kind"] in drop:
                pass
            elif n["kind"] == "ch":
                out += was_lines(lines, n) if ch_side == "was" else now_lines(lines, n)
            elif recurse:
                out += materialize(lines, n["start"] + 1, n["end"] - 1, n["children"], drop, ch_side, True)
            else:
                out += lines[n["start"]:n["end"] + 1]
            i = n["end"] + 1
            continue
        if i not in skip:
            out.append(lines[i])
        i += 1
    return out


def story_lines(body):
    """The story text of a block: every non-blank line except the production NOTE lines."""
    return [l for l in body if l.strip() and not l.startswith("NOTE (not spoken):")]


def paragraphs(lines):
    """Blank-line separated groups of lines (a cue and its quote stay together)."""
    out, cur = [], []
    for l in list(lines) + [""]:
        if l.strip():
            cur.append(l)
        elif cur:
            out.append(cur)
            cur = []
    return out


def squeeze(lines):
    out = []
    for l in lines:
        if l == "" and (not out or out[-1] == ""):
            continue
        out.append(l)
    while out and out[-1] == "":
        out.pop()
    return out


def in_order(orig_lines, lines):
    j = 0
    for k, line in enumerate(orig_lines):
        while j < len(lines) and lines[j] != line:
            j += 1
        if j == len(lines):
            return k, (k + 1, line)
        j += 1
    return len(orig_lines), None


def ext_bodies(ext_lines):
    bodies, cur = {}, None
    for i, l in enumerate(ext_lines):
        b, e = EXT_BEGIN.match(l), EXT_END.match(l)
        if b:
            cur = (b.group(1), i)
        elif e and cur:
            bodies[cur[0]] = ext_lines[cur[1] + 1:i]
            cur = None
    return bodies


def dialogue(body):
    """[(speaker, raw_notes, said, words, seconds)] for every cue + quote pair; plus problems."""
    out, problems, i = [], [], 0
    while i < len(body):
        m = ce.CUE_RE.match(body[i])
        if m and i + 1 < len(body):
            q = body[i + 1]
            if not (q.startswith('"') and q.endswith('"') and q.count('"') == 2):
                problems.append("cue %r is not followed by exactly one quoted line" % body[i])
            else:
                raw = [p.strip() for p in re.split(r"[;,]", m.group(2) or "") if p.strip()]
                timing = [p for p in raw if not p.startswith("to ")]
                w, s = ce.speech_seconds(timing, q[1:-1])
                out.append((m.group(1), raw, q[1:-1], w, s, m.group(2) or ""))
            i += 2
            continue
        if body[i].startswith('"'):
            problems.append("quoted line without a speaker cue: %r" % body[i])
        i += 1
    return out, problems


def dlg_seconds(dl):
    return sum(d[4] + ce.CUE_GAP for d in dl)


def spoken_pairs(lines):
    """[(cue, quoted line)] for every speaker cue followed directly by its quoted line."""
    return [(lines[k], lines[k + 1]) for k in range(len(lines) - 1)
            if ce.CUE_RE.match(lines[k]) and lines[k + 1].startswith('"')]


def approved_pair_map():
    """{old (cue, quote): (new (cue, quote), change id)} from APPROVED_CHANGES."""
    out = {}
    for cid, a in APPROVED_CHANGES.items():
        old, new = spoken_pairs(a["was"]), spoken_pairs(a["now"])
        if len(old) != len(new) or len(old) != len(a["line_ids"]):
            raise SystemExit("APPROVED_CHANGES %s: WAS, NOW and line_ids do not pair up" % cid)
        for o, n in zip(old, new):
            out[o] = (n, cid)
    return out


def sentences(text):
    for line in text.split("\n"):
        for s in re.split(r"(?<=[.!?])\s+", line):
            if s.strip():
                yield s


def bounds(dlg, act, br):
    return {"low_s": ce.half(0.9 * dlg + 0.8 * act + 0.5 * br), "expected_s": ce.half(dlg + act + br),
            "high_s": ce.half(1.15 * dlg + 1.3 * act + 1.5 * br)}


def main(argv):
    def opt(name, default):
        return argv[argv.index(name) + 1] if name in argv else default
    orig_path, ext_path, final_path = opt("--orig", ORIG), opt("--ext", EXT), opt("--final", FINAL)
    orig, ext, fin = load(orig_path), load(ext_path), load(final_path)
    orig_lines, ext_lines, L = orig.split("\n"), ext.split("\n"), fin.split("\n")
    top, nodes, errors = parse(L)
    hard, review = list(errors), []
    by_id = {n["id"]: n for n in nodes if n["id"]}

    # ---- 1. the original survives --------------------------------------------------------------
    matched, missing = in_order(orig_lines, L)
    if missing:
        hard.append("original line %d not found in order in the final script: %r" % missing)
    back = materialize(L, 0, len(L) - 1, top, {"note", "add", "rp", "pend"}, "was")
    verbatim = "\n".join(back) == orig
    if not verbatim:
        for k in range(max(len(orig_lines), len(back))):
            a = orig_lines[k] if k < len(orig_lines) else "<EOF>"
            c = back[k] if k < len(back) else "<EOF>"
            if a != c:
                hard.append("outside the marked blocks (WAS text restored) the final differs from screenplay.md at original line %d: expected %r, got %r" % (k + 1, a, c))
                break
    shoot = squeeze(materialize(L, 0, len(L) - 1, top, {"note", "pend"}, "now", recurse=True))
    marked = [(l, orig_lines[i + 1]) for i, l in enumerate(orig_lines[:-1])
              if ce.CUE_RE.match(l) and "ORIGINAL" in (ce.CUE_RE.match(l).group(2) or "")]
    apairs = approved_pair_map()
    shoot_pairs = set(spoken_pairs(shoot))
    replaced_orig = []
    for cue, quote in marked:
        if (cue, quote) in apairs:          # an [ORIGINAL] line Daxtyn approved new wording for
            (ncue, nquote), cid = apairs[(cue, quote)]
            replaced_orig.append(cid)
            if (ncue, nquote) not in shoot_pairs:
                hard.append("%s: the approved wording of the [ORIGINAL] line is not in the shooting text: %s %s" % (cid, ncue, nquote))
            if (cue, quote) in shoot_pairs:
                hard.append("%s: the old wording of the [ORIGINAL] line is still shot: %s %s" % (cid, cue, quote))
        elif (cue, quote) not in shoot_pairs:
            hard.append("[ORIGINAL] line missing or changed in the shooting text: %s %s" % (cue, quote))
    n_orig_cues = sum(1 for l in shoot if ce.CUE_RE.match(l) and "ORIGINAL" in (ce.CUE_RE.match(l).group(2) or ""))
    if n_orig_cues != len(marked) - len(replaced_orig):
        hard.append("the shooting text has %d cues marked [ORIGINAL]; screenplay.md has %d, %d of them reworded with Daxtyn's approval"
                    % (n_orig_cues, len(marked), len(replaced_orig)))
    try:
        story_lo, story_hi = L.index("SCREENPLAY"), L.index("END OF EPISODE 1.")
    except ValueError:
        story_lo, story_hi = 0, len(L)
        hard.append("cannot find the 'SCREENPLAY' or 'END OF EPISODE 1.' line")
    # 1e. every spoken line of the handoff is spoken word for word outside the additions and rating-pass blocks,
    #     in order, and nothing else is spoken there, except the approved changes in their approved wording
    try:
        o_lo, o_hi = orig_lines.index("SCREENPLAY"), orig_lines.index("END OF EPISODE 1.")
    except ValueError:
        o_lo, o_hi = 0, len(orig_lines)
    orig_spoken = spoken_pairs(orig_lines[o_lo:o_hi])
    expect_spoken = [apairs[p][0] if p in apairs else p for p in orig_spoken]
    handoff_shot = materialize(L, 0, len(L) - 1, top, {"note", "add", "rp", "pend"}, "now")
    try:
        h_lo, h_hi = handoff_shot.index("SCREENPLAY"), handoff_shot.index("END OF EPISODE 1.")
    except ValueError:
        h_lo, h_hi = 0, len(handoff_shot)
    got_spoken = spoken_pairs(handoff_shot[h_lo:h_hi])
    n_approved_spoken = sum(1 for p in orig_spoken if p in apairs)
    spoken_ok = got_spoken == expect_spoken
    if not spoken_ok:
        k = next((k for k in range(max(len(got_spoken), len(expect_spoken)))
                  if k >= len(got_spoken) or k >= len(expect_spoken) or got_spoken[k] != expect_spoken[k]), None)
        hard.append("handoff dialogue: spoken line %s outside the additions differs: expected %r, got %r" % (
            k + 1, expect_spoken[k] if k < len(expect_spoken) else "<none>", got_spoken[k] if k < len(got_spoken) else "<none>"))
    quotes = {q for _, q in marked} | {c for c, _ in marked}
    # 1f. the approved changes are in the script exactly as recorded, and nothing else claims approval
    present_ch = {n["id"]: n for n in nodes if n["kind"] == "ch"}
    present_add = {n["id"] for n in nodes if n["kind"] == "add"}
    for cid, a in APPROVED_CHANGES.items():
        n = present_ch.get(cid)
        if n is None:
            if a["in"] and a["in"] not in present_add:
                review.append("%s (creator-approved wording) went with %s, which was cut" % (cid, a["in"]))
            else:
                hard.append("%s: Daxtyn's approved change (%s) is missing from the script" % (cid, a["decision"]))
            continue
        if not n["approved"]:
            hard.append("%s: its reason must start with %r (Daxtyn's decision): %r" % (cid, APPROVED_REASON, n["reason"]))
        if was_lines(L, n) != a["was"]:
            hard.append("%s: the WAS text is not the recorded old wording %r" % (cid, a["was"]))
        if now_lines(L, n) != a["now"]:
            hard.append("%s: the NOW text is not the approved wording %r" % (cid, a["now"]))
        if (n["parent"]["id"] if n["parent"] else None) != a["in"]:
            hard.append("%s: must sit %s" % (cid, ("inside " + a["in"]) if a["in"] else "in the handoff's own text"))
    approved_now = set()
    for n in nodes:
        if n["kind"] == "ch" and n["id"] in APPROVED_CHANGES and n["now"] is not None:
            approved_now |= set(range(n["now"] + 1, n["end"]))
    for k, l in enumerate(L):
        if APPROVED_TAG in l and ce.CUE_RE.match(l) and k not in approved_now:
            hard.append("line %d: the cue marker [%s] is only for the NOW text of APPROVED_CHANGES: %r" % (k + 1, APPROVED_TAG, l))
    for n in nodes:
        if n["kind"] != "ch":
            continue
        w, nw = was_lines(L, n), now_lines(L, n)
        if not w or not nw or w == nw:
            hard.append("%s: WAS and NOW must both be present and differ" % n["id"])
        if n["id"] not in APPROVED_CHANGES:
            if "creator-approved" in n["reason"]:
                hard.append("%s: claims creator approval but is not in APPROVED_CHANGES (record Daxtyn's decision there first)" % n["id"])
            if any("[ORIGINAL" in l or l in quotes for l in w):
                hard.append("%s: changes an [ORIGINAL] line, which must stay word for word" % n["id"])
            if n["parent"] is None and any(p in orig_spoken for p in spoken_pairs(w)):
                hard.append("%s: changes a spoken line of screenplay.md; only Daxtyn's approved changes may (APPROVED_CHANGES)" % n["id"])
        if not ("DRAGONS.md" in n["reason"] or RP_REASON in n["reason"] or n["reason"].startswith(APPROVED_REASON)):
            hard.append("%s: its reason names neither DRAGONS.md, %s nor %r: %r" % (n["id"], RP_REASON, APPROVED_REASON, n["reason"]))
        if any(l in PENDING_LINES for l in w + nw):
            hard.append("%s: changes a line that DRAGONS.md keeps as written until Daxtyn chooses new wording (use a PENDING block)" % n["id"])
        if n["parent"] is None and not (story_lo < n["start"] < story_hi):
            hard.append("%s: changes front matter or closing checks; those stay word for word (explain in a FINAL SCRIPT NOTE instead)" % n["id"])

    for line, pid in PENDING_LINES.items():
        where = [k for k, l in enumerate(L) if l == line]
        if not where:
            review.append("PENDING line not in the script (cut, or Daxtyn chose new wording?): %s" % line)
        for k in where:
            nxt = next((L[j] for j in range(k + 1, len(L)) if L[j].strip() and not ce.CUE_RE.match(L[j]) and not L[j].startswith('"')), "")
            if not (PEND_BEGIN.match(nxt) and PEND_BEGIN.match(nxt).group(1) == pid):
                hard.append("line %d %s keeps a scrapped dragon name but is not followed by its PENDING %s block" % (k + 1, line, pid))

    # 1g. the approved rating-pass blocks hold exactly the story text Daxtyn approved (their content, not only their ids)
    lock_ok, locked_sha = True, {}
    if set(APPROVED_RATING_TEXT) != set(APPROVED_RATING) or set(APPROVED_RATING_SHA256) != set(APPROVED_RATING):
        hard.append("APPROVED_RATING_TEXT / APPROVED_RATING_SHA256 must list exactly the APPROVED_RATING ids %s" % sorted(APPROVED_RATING))
        lock_ok = False
    for rid, text in sorted(APPROVED_RATING_TEXT.items()):
        locked_sha[rid] = hashlib.sha256("\n".join(text).encode("utf-8")).hexdigest()
        if locked_sha[rid] != APPROVED_RATING_SHA256.get(rid):
            hard.append("%s: the record of the text Daxtyn approved (APPROVED_RATING_TEXT) was edited: it no longer matches its "
                        "sha256 in APPROVED_RATING_SHA256" % rid)
            lock_ok = False
    for n in nodes:
        if n["kind"] != "rp" or n["id"] not in APPROVED_RATING_TEXT:
            continue
        got, want = story_lines(L[n["start"] + 1:n["end"]]), APPROVED_RATING_TEXT[n["id"]]
        if got != want:
            lock_ok = False
            k = next(k for k in range(max(len(got), len(want))) if k >= len(got) or k >= len(want) or got[k] != want[k])
            hard.append("%s: its story text is not the text Daxtyn approved on %s (story line %d: expected %r, got %r). Approved "
                        "content changes only with his OK: record it in final/CHANGES.md, then update APPROVED_RATING_TEXT and "
                        "APPROVED_RATING_SHA256" % (n["id"], APPROVED_DATE, k + 1, (want[k] if k < len(want) else "<none>")[:90],
                                                    (got[k] if k < len(got) else "<none>")[:90]))

    # ---- 2. additions are the proposals -----------------------------------------------------------
    proposals = ext_bodies(ext_lines)
    adds = [n for n in nodes if n["kind"] == "add"]
    for a in adds:
        body = materialize(L, a["start"] + 1, a["end"] - 1, a["children"], {"rp", "pend"}, "was")
        if a["id"] not in proposals:
            hard.append("%s: no such proposed addition in screenplay-extended.md" % a["id"])
        elif body != proposals[a["id"]]:
            diff = next((k for k in range(max(len(body), len(proposals[a["id"]])))
                         if k >= len(body) or k >= len(proposals[a["id"]]) or body[k] != proposals[a["id"]][k]), None)
            hard.append("%s: not the proposal word for word outside its marked changes (first difference at body line %s)" % (a["id"], diff))
    cut = [x for x in proposals if x not in {a["id"] for a in adds}]

    # ---- 3. markers ----------------------------------------------------------------------------
    def id_key(x):
        m = re.match(r"^[A-Z](\d+)([a-z]?)$", x)
        return (int(m.group(1)), m.group(2))
    for kind, prefix in (("add", "X"), ("rp", "R"), ("ch", "C"), ("pend", "P")):
        ids = [id_key(n["id"]) for n in nodes if n["kind"] == kind]
        if ids != sorted(set(ids)):
            hard.append("%s ids are not unique and increasing in file order: %s" % (prefix, [n["id"] for n in nodes if n["kind"] == kind]))
    for n in nodes:
        if n["kind"] == "rp":
            first = next((l for l in L[n["start"] + 1:n["end"]] if l.strip()), "")
            want = RP_NOTE_APPROVED if n["approved"] else RP_NOTE
            if not first.startswith(want):
                hard.append("%s: does not open with %r" % (n["id"], want))
            if n["approved"] and n["id"] not in APPROVED_RATING:
                hard.append("%s: marked creator-approved but Daxtyn has not approved it (APPROVED_RATING)" % n["id"])
            if not n["approved"] and n["id"] in APPROVED_RATING:
                hard.append("%s: Daxtyn approved it on %s; its marker must say so ('[RATING PASS %s — creator-approved %s — begin]')"
                            % (n["id"], APPROVED_DATE, n["id"], APPROVED_DATE))
            if n["approved"] and (n["parent"]["id"] if n["parent"] else None) != APPROVED_RATING.get(n["id"]):
                hard.append("%s: must sit %s" % (n["id"], ("inside " + APPROVED_RATING[n["id"]]) if APPROVED_RATING.get(n["id"]) else "at the top level"))
        if n["kind"] == "pend":
            body = [l for l in L[n["start"] + 1:n["end"]] if l.strip()]
            if len(body) != 1 or not body[0].startswith(PEND_NOTE):
                hard.append("%s: a PENDING block holds exactly one line, starting %r" % (n["id"], PEND_NOTE))
            prev = next((L[k] for k in range(n["start"] - 1, -1, -1) if L[k].strip()), "")
            if PENDING_LINES.get(prev) != n["id"]:
                hard.append("%s: does not follow one of its PENDING_LINES (found %r)" % (n["id"], prev[:80]))
        if n["kind"] == "add":
            first = next((l for l in squeeze(materialize(L, n["start"] + 1, n["end"] - 1, n["children"], set(), "now", True)) if l.strip()), "")
            n["first_note"] = first
            if not first.startswith("NOTE (not spoken):"):
                hard.append("%s: does not open with a 'NOTE (not spoken):' line" % n["id"])
    present_rp = {n["id"] for n in nodes if n["kind"] == "rp"}
    for rid, home in APPROVED_RATING.items():
        if rid not in present_rp:
            if home and home not in {n["id"] for n in nodes if n["kind"] == "add"}:
                review.append("%s (creator-approved) went with %s, which was cut" % (rid, home))
            else:
                hard.append("%s: Daxtyn approved keeping it (the deaths in Cling, %s), but it is not in the script" % (rid, APPROVED_DATE))
    notes = [n for n in top if n["kind"] == "note"]
    note_text = ["\n".join(L[n["start"] + 1:n["end"]]) for n in notes]
    closing = note_text[-1] if note_text else ""
    links_add = next((p for p in closing.split("\n") if p.startswith("Links between additions")), "")
    links_rp = next((p for p in closing.split("\n") if p.startswith("Rating-pass links")), "")

    # ---- 4. dependencies --------------------------------------------------------------------------
    present = set(by_id)
    for dep_map, links, label in ((ce.DEPENDS, links_add, "Links between additions"), (RATING_DEPENDS, links_rp, "Rating-pass links")):
        for k, needs in dep_map.items():
            if k not in present:
                continue
            ok = any(x in present for x in needs) if k in ANY_OF else all(x in present for x in needs)
            if not ok:
                hard.append("%s is kept but leans on %s, which %s cut: cut %s too or rewrite it" % (
                    k, " or ".join(needs) if k in ANY_OF else ", ".join(needs), "was" if len(needs) == 1 else "were", k))
            n = by_id[k]
            where = n.get("first_note") if n["kind"] == "add" else (n["reason"] if n["kind"] == "ch" else
                                                                      next((l for l in L[n["start"] + 1:n["end"]] if l.strip()), ""))
            for x in needs:
                if not re.search(r"\b%s\b" % x, where or ""):
                    hard.append("%s: its first note / reason does not name %s, which it leans on" % (k, x))
                if not re.search(r"\b%s\b" % x, links) or not re.search(r"\b%s\b" % k, links):
                    hard.append("closing note '%s' does not list %s -> %s" % (label, k, x))
    for k in list(RATING_SHOTS) + list(CHANGE_SHOTS):
        if k not in present:
            review.append("%s is in the timing tables but not in the script (cut?)" % k)

    # ---- 5./6. canon and rating lint on new text ---------------------------------------------------
    known = {m.group(1) for l in orig_lines for m in [ce.CUE_RE.match(l)] if m}
    for body in proposals.values():
        known |= {m.group(1) for l in body for m in [ce.CUE_RE.match(l)] if m}
    known |= NEW_ROLES
    units = []   # (label, lines of new text in shooting form)
    for n in nodes:
        if n["kind"] == "add":    # its own text; nested rating-pass blocks and changes are linted on their own
            units.append((n["id"], materialize(L, n["start"] + 1, n["end"] - 1, n["children"], {"rp", "ch", "pend"}, "now"), n["id"]))
        elif n["kind"] in ("rp", "pend"):
            units.append((n["id"], L[n["start"] + 1:n["end"]], n["parent"]["id"] if n["parent"] else n["id"]))
        elif n["kind"] == "ch":
            units.append((n["id"], now_lines(L, n), n["parent"]["id"] if n["parent"] else n["id"]))
    seen = set()
    context_reviewed = []   # (unit, rule, sentence): rule 6b/6d hits that REVIEWED_CONTEXT explains (shown with --review)

    def flag(msg):
        if msg not in seen:
            seen.add(msg)
            hard.append(msg)
    for label, body, home in units:
        text = "\n".join(body)
        story = "\n".join(l for l in body if not l.startswith("NOTE (not spoken):"))
        dl, problems = dialogue(body)
        for p in problems:
            flag("%s: %s" % (label, p))
        for spk, raw, said, _w, _s, rawnote in dl:
            if spk not in known:
                flag("%s: unknown speaker %r (new speaking roles must be unnamed and listed in NEW_ROLES)" % (label, spk))
            if spk in DRAGON_NAMES:
                flag("%s: a dragon speaks (%s)" % (label, spk))
            if spk == "QUEEN FALL":
                flag("%s: Queen Fall speaks; she says only the screenplay's \"Attack.\"" % label)
            if "ORIGINAL" in rawnote:
                flag("%s: new cue marked [ORIGINAL]" % label)
            if said in ce.CANONICAL_COMMANDS:
                flag("%s: canonical command spoken in new text: %s" % (label, said))
            if spk == "ABBY" and re.search(r"\bqueen\b", said, re.I):
                flag("%s: Abby mentions being queen (the succession question stays unanswered)" % label)
            ws = [x.lower() for x in ce.WORD_RE.findall(said)]
            to_dragon = any(p.startswith("to ") and any(d.lower() in p.lower() for d in ce.DRAGONS) for p in raw)
            order_like = ws and ws[0] in ce.ORDER_WORDS and len(ws) <= 4 and not said.endswith("?")
            to_self = any(p.lower() in ("to himself", "to herself") for p in raw)
            if order_like and (to_dragon or (spk == "REMI" and not to_self)):
                flag("%s: short spoken order to a dragon (reads as a new command): %s %r" % (label, spk, said))
            if spk in PROTECTED_SPEAKERS and VICE_RE.search(said):
                flag("%s: %s speaks a drug/tobacco/alcohol/suggestive word: %r (SERIES.md section 8)" % (label, spk, said))
            if spk in PROTECTED_SPEAKERS and VICE_RE.search(rawnote):
                flag("%s: the cue gives %s a drug/tobacco/alcohol/suggestive direction: %r (SERIES.md section 8)" % (label, spk, rawnote))
            if PROTECTED_RE.search(rawnote) and VICE_RE.search(said):
                flag("%s: %s says a drug/tobacco/alcohol/suggestive word to a child or possible minor [%s]: %r (SERIES.md section 8)"
                     % (label, spk, rawnote, said))
        for pat, why in ce.HARD_FORBIDDEN + ce.REGRESSIONS:
            for mm in re.finditer(pat, text):
                flag("%s: forbidden %r (%s)" % (label, mm.group(0), why))
        for mm in SPECIES_RE.finditer("\n".join(l for l in body if l not in PENDING_LINES)):
            flag("%s: species word %r (DRAGONS.md 2026-10-09: no species)" % (label, mm.group(0)))
        if label in DEAD_BLOCKS:
            for mm in DEAD_CHILD_RE.finditer(story):
                flag("%s: %r in a death or gore block: every one of the dead and wounded shown must read as an adult (SERIES.md section 8)" % (label, mm.group(0)))
        for mm in STANCE_RE.finditer(text):
            flag("%s: %r contradicts DRAGONS.md (two legs, wings as forelimbs, low stance)" % (label, mm.group(0)))
        if home != "X28" and re.search(r"\bQueen Fall\b", story):
            flag("%s: Queen Fall appears in new story text outside X28" % label)
        for s in sentences(text):
            if SCOUT_RE.search(s) and DEATH_RE.search(s):
                flag("%s: the scout or its rider next to a death word (CANON LOCK 12): %r" % (label, s[:120]))
            if STARLIGHT_RE.search(s) and WOUND_RE.search(s):
                flag("%s: Starlight/Queen Fall next to fire, wound or blood (CANON LOCK 14/16): %r" % (label, s[:120]))
            if PROTECTED_RE.search(s) and VICE_RE.search(s):
                flag("%s: a drug/tobacco/alcohol/suggestive word in the same sentence as a child or possible minor (SERIES.md section 8): %r" % (label, s[:140]))
            if re.search(r"\bAbby\b", s) and ABBY_GORE_RE.search(s):
                flag("%s: graphic injury wording next to Abby: %r" % (label, s[:120]))
        # 6b. context: a pronoun can stand for a protected character named just before (same or previous paragraph)
        paras = paragraphs(l for l in body if not l.startswith("NOTE (not spoken):"))
        for pi, para in enumerate(paras):
            prot_seen = pi > 0 and bool(PROTECTED_RE.search("\n".join(paras[pi - 1])))
            for s in sentences("\n".join(para)):
                hit = prot_seen and not PROTECTED_RE.search(s) and VICE_RE.search(s) and PRONOUN_RE.search(s)
                if hit and s in REVIEWED_CONTEXT:
                    context_reviewed.append((label, "6b", s))
                elif hit:
                    flag("%s: a drug/tobacco/alcohol/suggestive word with a pronoun right after a child or possible minor is "
                         "named (who is '%s'?): %r. Name the adult, or read it in context and add the exact sentence to "
                         "REVIEWED_CONTEXT with the reason (SERIES.md section 8)" % (label, PRONOUN_RE.search(s).group(0), s[:140]))
                if PROTECTED_RE.search(s):
                    prot_seen = True
        # 6d. deaths: only the blocks Daxtyn approved may hold one
        if label not in APPROVED_RATING:
            for s in sentences(story):
                mm = NEW_DEATH_RE.search(s)
                if mm and s in REVIEWED_CONTEXT:
                    context_reviewed.append((label, "6d", s))
                elif mm:
                    flag("%s: death word %r outside the deaths Daxtyn approved (%s): a new death needs his OK first "
                         "(SERIES.md section 5); if it is not a death, add the exact sentence to REVIEWED_CONTEXT with the reason: %r"
                         % (label, mm.group(0), ", ".join(sorted(APPROVED_RATING)), s[:120]))
        for pat, why in ce.REVIEW:
            for mm in re.finditer(pat, text, re.I):
                s0 = max(0, mm.start() - 40)
                review.append("%s [%s] ...%s..." % (label, why, text[s0:mm.end() + 30].replace("\n", " ")))
    # whole story, shooting text: no species word anywhere (Daxtyn chose the wording on 2026-10-18); no upright stance
    try:
        s_lo, s_hi = shoot.index("SCREENPLAY"), shoot.index("END OF EPISODE 1.")
    except ValueError:
        s_lo, s_hi = 0, 0
    for k in range(s_lo, s_hi):
        l = shoot[k]
        if SPECIES_RE.search(l) and l not in PENDING_LINES:
            flag("story line still names a species: %r" % l[:120])
        if STANCE_RE.search(l):
            flag("story line contradicts the two-legged low stance: %r" % l[:120])

    used = {sent for _, _, sent in context_reviewed}
    for sent in REVIEWED_CONTEXT:
        if sent not in used:
            review.append("REVIEWED_CONTEXT entry no longer needed or no longer in the script (reworded or cut?): %r" % sent[:100])
    review.extend("%s [%s, reviewed: %s] %s" % (lab, rule, REVIEWED_CONTEXT[sent], sent[:100]) for lab, rule, sent in context_reviewed)

    # ---- runtime ------------------------------------------------------------------------------------
    st = {s["scene"]: s for s in json.load(open(SHOTLIST, encoding="utf-8"))["scene_totals"]}
    rows, units_t = [], {}

    def unit_time(n):
        """(dlg, act, br, detail) for one add/rp/ch node, children included."""
        if n["kind"] == "ch":
            key, act = CHANGE_SHOTS.get(n["id"], (None, None))
            nw = "\n".join(now_lines(L, n))
            if key is None:
                hard.append("%s: no entry in CHANGE_SHOTS" % n["id"])
                act = 0
            elif key not in nw:
                hard.append("%s: key phrase %r not in its NOW text; CHANGE_SHOTS is out of step with the script" % (n["id"], key))
            d = dlg_seconds(dialogue(now_lines(L, n))[0]) - dlg_seconds(dialogue(was_lines(L, n))[0])
            return d, act, 0.0
        if n["kind"] == "rp":
            t = RATING_SHOTS.get(n["id"])
            body = L[n["start"] + 1:n["end"]]
            if t is None:
                hard.append("%s: no entry in RATING_SHOTS" % n["id"])
                return dlg_seconds(dialogue(body)[0]), 0.0, 0.0
            if t["key"] not in "\n".join(body):
                hard.append("%s: key phrase %r not found; RATING_SHOTS is out of step with the script" % (n["id"], t["key"]))
            return dlg_seconds(dialogue(body)[0]), sum(s[1] for s in t["shots"]), sum(s[2] for s in t["shots"])
        # addition: the proposal's own estimate, then its nested rating-pass blocks and changes
        prop = materialize(L, n["start"] + 1, n["end"] - 1, n["children"], {"rp", "pend"}, "was")
        t = ce.ADDITION_SHOTS.get(n["id"])
        if t is None:
            hard.append("%s: no shot estimate in check_extended.ADDITION_SHOTS" % n["id"])
            return 0.0, 0.0, 0.0
        if t["key"] not in "\n".join(prop):
            hard.append("%s: key phrase %r not found" % (n["id"], t["key"]))
        d, a, b = dlg_seconds(dialogue(prop)[0]), sum(s[1] for s in t["shots"]), sum(s[2] for s in t["shots"])
        return d, a, b

    for n in nodes:
        if n["kind"] in ("note", "pend") or not n["id"]:
            continue
        d, a, b = unit_time(n)
        units_t[n["id"] or ""] = {"dialogue_s": round(d, 2), "action_s": a, "breath_s": b, **bounds(d, a, b)}

    def scene_of(i):
        for k in range(i, -1, -1):
            mm = ce.SCENE_RE.match(L[k])
            if mm and not any(o["start"] <= k <= o["end"] for o in nodes if o["kind"] in ("add", "rp", "note")):
                return mm.group(2) or "PROLOGUE"
        return "PROLOGUE"

    order, last_orig = [], None
    for i, ln in enumerate(L):
        inside = next((o for o in nodes if o["start"] < i < o["end"] and o["kind"] in ("add", "rp", "note")), None)
        mm = ce.SCENE_RE.match(ln)
        if (mm or ln == "END OF EPISODE 1.") and not inside:
            key = "END" if ln == "END OF EPISODE 1." else ("PROLOGUE+TITLE" if not mm.group(2) else mm.group(2))
            s = st[key]
            last_orig = {"row": key, "kind": "original", "title": s["title"], "changes": [],
                         "low_s": s["low_s"], "expected_s": s["expected_s"], "high_s": s["high_s"]}
            order.append(last_orig)
        for n in top:
            if n["start"] == i and n["kind"] in ("add", "rp", "ch") and n["id"] in units_t:
                u = units_t[n["id"]]
                if n["kind"] == "ch":      # a changed screenplay line: its delta belongs to its scene
                    row = last_orig
                    if row is None:            # before the first scene: already a hard failure above
                        continue
                    row["changes"].append(n["id"])
                    for k in ("low_s", "expected_s", "high_s"):
                        row[k] += u[k]
                    continue
                kids = [c["id"] for c in n["children"] if c["id"] in units_t]
                vals = {k: u[k] + sum(units_t[c][k] for c in kids) for k in ("low_s", "expected_s", "high_s")}
                title = ce.ADDITION_SHOTS[n["id"]]["title"] if n["kind"] == "add" and n["id"] in ce.ADDITION_SHOTS else \
                    RATING_SHOTS.get(n["id"], {}).get("title", "")
                order.append({"row": n["id"], "kind": "addition" if n["kind"] == "add" else "rating", "title": title,
                              "where": scene_of(i), "changes": kids, "creator_approved": bool(n["approved"]),
                              "approved_inside": [c["id"] for c in n["children"] if c["approved"]], **vals})
    t = 0.0
    for r in order:
        r["start_s"] = t
        t += r["expected_s"]
    K = ("low_s", "expected_s", "high_s")
    tot = {k: sum(r[k] for r in order) for k in K}
    tot_orig = {k: sum(st[r["row"]][k] for r in order if r["kind"] == "original") for k in K}
    tot_add = {k: sum(units_t[n["id"]][k] for n in adds) for k in K}
    rating_nodes = [n for n in nodes if n["kind"] == "rp" or (n["kind"] == "ch" and RP_REASON in n["reason"])]
    dragon_nodes = [n for n in nodes if n["kind"] == "ch" and RP_REASON not in n["reason"] and not n["approved"]]
    approved_ch_nodes = [n for n in nodes if n["kind"] == "ch" and n["approved"]]
    tot_rating = {k: sum(units_t[n["id"]][k] for n in rating_nodes) for k in K}
    tot_dragon = {k: sum(units_t[n["id"]][k] for n in dragon_nodes) for k in K}
    tot_approved = {k: sum(units_t[n["id"]][k] for n in approved_ch_nodes) for k in K}
    trims = [("X4", 8.0), ("X5", 8.0), ("X15", 9.0), ("X16", 4.5), ("X20", 9.0), ("X22", 5.0), ("X27", 5.5), ("X13", 6.0)]
    over60, cut_e, cut_h = [], 0.0, 0.0
    t_e = sum(s for x, s in trims if x in present)
    cut_e, cut_h = t_e, t_e * 1.3
    over60.append({"step": "trims inside additions (expansion-proposal.md)", "expected_after_s": tot["expected_s"] - cut_e, "loose_after_s": tot["high_s"] - cut_h})
    for xid in ("X16", "X15", "X3", "X5", "X4"):
        if xid in present:
            n = by_id[xid]
            kids = [c["id"] for c in n["children"] if c["id"] in units_t]
            cut_e += units_t[xid]["expected_s"] + sum(units_t[c]["expected_s"] for c in kids)
            cut_h += units_t[xid]["high_s"] + sum(units_t[c]["high_s"] for c in kids)
            over60.append({"step": "drop " + xid, "expected_after_s": tot["expected_s"] - cut_e, "loose_after_s": tot["high_s"] - cut_h})
    frames = {k: tot[k] * ce.FPS for k in K}
    render_h = {"best_case_h": frames["expected_s"] / ce.FPS_BEST / 3600,
                "worst_case_h": frames["expected_s"] / ce.FPS_WORST * ce.HEAVY_SET / 3600,
                "loose_cut_worst_h": frames["high_s"] / ce.FPS_WORST * ce.HEAVY_SET / 3600}
    in_range = 3000 <= tot["expected_s"] <= 3600
    if not in_range:
        hard.append("expected runtime %s is outside 50:00-60:00 (SERIES.md section 1)" % ce.mmss(tot["expected_s"]))
    want = (ce.mmss(tot["expected_s"]), ce.mmss(tot["low_s"]), ce.mmss(tot["high_s"]))
    timing_idx = next((k for k, l in enumerate(L) if TIMING_RE.search(l) and any(n["start"] < k < n["end"] for n in notes)), None)
    if "--update-timing" in argv and timing_idx is not None:
        L[timing_idx] = TIMING_RE.sub("expected %s, tight-cut bound %s, loose-cut bound %s" % want, L[timing_idx])
        with open(final_path, "w", encoding="utf-8") as f:
            f.write("\n".join(L))
        print("updated the runtime in the timing note to expected %s, tight-cut bound %s, loose-cut bound %s" % want)
    elif timing_idx is None:
        hard.append("no FINAL SCRIPT NOTE quotes 'expected M:SS, tight-cut bound M:SS, loose-cut bound M:SS'")
    else:
        got = TIMING_RE.search(L[timing_idx]).groups()
        if got != want:
            hard.append("the timing note says expected %s / %s / %s but the estimate is %s / %s / %s (run with --update-timing)" % (got + want))

    # ---- clean reading copy -------------------------------------------------------------------------
    def clean_copy():
        keep = {id(n) for n in notes[1:] if not L[n["start"] + 2].startswith("Open question")}
        tops = [dict(n, kind="keptnote") if id(n) in keep else n for n in top]   # kept notes lose only their markers
        out = []
        body = materialize(L, 0, len(L) - 1, tops, {"note", "pend"}, "now", recurse=True)
        body = [l for l in body if not l.startswith("NOTE (not spoken):") and l not in (NOTE_BEGIN, NOTE_END)]
        # the cue source marker of the approved wording is a production marker too: "ABBY [creator-approved wording
        # 2026-10-18]:" reads "ABBY:" here (other cue notes, such as [ORIGINAL] from the handoff itself, stay)
        def unmark(l):
            m = ce.CUE_RE.match(l)
            if not m or not m.group(2) or APPROVED_TAG not in m.group(2):
                return l
            rest = [p.strip() for p in m.group(2).split(";") if p.strip() and p.strip() != APPROVED_TAG]
            return "%s%s:" % (m.group(1), (" [%s]" % "; ".join(rest)) if rest else "")
        body = [unmark(l) for l in body]
        out += ["DRAGON'S KINGDOM — SEASON 1, EPISODE 1 — READING COPY OF THE LOCKED SHOOTING SCRIPT", "",
                "Generated from final/screenplay-final.md by tools/check_final.py --clean. Do not edit this copy: edit "
                "screenplay-final.md and run the tool again. This copy leaves out the markers, the production NOTE lines, "
                "the WAS text of changed lines and the note on how to read the markers. Every change and every open "
                "question is listed in final/CHANGES.md.", "", ""]
        return "\n".join(squeeze(out + body)) + "\n"
    clean = clean_copy()
    if "--clean" in argv:
        with open(CLEAN, "w", encoding="utf-8") as f:
            f.write(clean)
        print("wrote", os.path.relpath(CLEAN, EP))
    elif final_path == FINAL:
        if not os.path.exists(CLEAN) or load(CLEAN) != clean:
            hard.append("final/screenplay-final-clean.md is missing or out of date (run with --clean)")

    # ---- report -------------------------------------------------------------------------------------
    sha = hashlib.sha256(orig.encode("utf-8")).hexdigest()
    n_rp = sum(1 for n in nodes if n["kind"] == "rp")
    n_ch = sum(1 for n in nodes if n["kind"] == "ch")
    n_ch_r = sum(1 for n in nodes if n["kind"] == "ch" and RP_REASON in n["reason"])
    n_ch_a = sum(1 for n in nodes if n["kind"] == "ch" and n["approved"])
    n_rp_a = sum(1 for n in nodes if n["kind"] == "rp" and n["approved"])
    n_pend = sum(1 for n in nodes if n["kind"] == "pend")
    all_new = [d for n in nodes if n["kind"] == "rp" for d in dialogue(L[n["start"] + 1:n["end"]])[0]]
    result = {"source_sha256": sha,
              "proof": {"original_lines": len(orig_lines), "lines_found_in_order": matched,
                        "byte_identical_after_restoring": verbatim, "original_markers": len(marked),
                        "original_markers_reworded_with_approval": replaced_orig,
                        "handoff_spoken_lines": len(orig_spoken), "handoff_spoken_lines_with_approved_wording": n_approved_spoken,
                        "handoff_dialogue_as_expected": spoken_ok},
              "additions_kept": [a["id"] for a in adds], "additions_cut": cut,
              "rating_pass_blocks": n_rp, "changed_blocks": n_ch, "changed_for_rating": n_ch_r,
              "changed_creator_approved": n_ch_a, "rating_pass_creator_approved": n_rp_a, "pending_blocks": n_pend,
              "creator_approved": {"date": APPROVED_DATE, "changes": sorted(APPROVED_CHANGES), "rating_pass": sorted(APPROVED_RATING),
                                   "rating_pass_text_sha256": locked_sha, "rating_pass_text_identical": lock_ok},
              "reviewed_context": [{"unit": lab, "rule": rule, "sentence": sent, "why": REVIEWED_CONTEXT[sent]} for lab, rule, sent in context_reviewed],
              "units": units_t, "running_order": order, "totals": tot, "original_totals": tot_orig,
              "addition_totals": tot_add, "rating_pass_totals": tot_rating, "dragon_change_totals": tot_dragon, "approved_change_totals": tot_approved,
              "over_60_cut_order": over60, "frames": frames, "render_hours": render_h,
              "hard_failures": hard, "review": review}
    print("PROOF  screenplay.md sha256 %s" % sha[:16])
    print("PROOF  %d of %d original lines found word for word, in order: %s" % (matched, len(orig_lines), "yes" if not missing else "NO"))
    print("PROOF  notes/additions/rating-pass blocks dropped and WAS text restored = screenplay.md byte for byte: %s" % ("yes" if verbatim else "NO"))
    print("PROOF  [ORIGINAL] cue+quote pairs: %d; %d unchanged in the shooting text, %d reworded with Daxtyn's approval (%s): %s" % (
        len(marked), len(marked) - len(replaced_orig), len(replaced_orig), ", ".join(replaced_orig) or "none",
        "yes" if not any("[ORIGINAL]" in h or "ORIGINAL line" in h for h in hard) else "NO"))
    print("PROOF  %d spoken lines of screenplay.md, in order outside the additions: %d word for word, %d in the wording Daxtyn approved %s (%s): %s" % (
        len(orig_spoken), len(orig_spoken) - n_approved_spoken, n_approved_spoken, APPROVED_DATE,
        ", ".join(c for c in APPROVED_CHANGES if APPROVED_CHANGES[c]["in"] is None), "yes" if spoken_ok else "NO"))
    print("PROOF  approved rating-pass blocks (%s): story text identical to what Daxtyn approved %s (locked by text and sha256): %s" % (
        ", ".join(sorted(APPROVED_RATING)), APPROVED_DATE, "yes" if lock_ok else "NO"))
    print("PROOF  additions identical to their proposals outside marked changes: %d of %d kept%s" % (
        sum(1 for a in adds if not any(h.startswith(a["id"] + ": not the proposal") for h in hard)), len(adds),
        (" (cut: %s)" % ", ".join(cut)) if cut else ""))
    print("blocks: %d additions, %d rating-pass blocks (%d creator-approved), %d changed lines (%d for the rating pass, %d for DRAGONS.md, "
          "%d creator-approved wording), %d PENDING wording notes, %d document notes" % (
              len(adds), n_rp, n_rp_a, n_ch, n_ch_r, n_ch - n_ch_r - n_ch_a, n_ch_a, n_pend, len(notes)))
    print("rating-pass dialogue: %d new lines, %d words" % (len(all_new), sum(d[3] for d in all_new)))
    print("original  : tight %s  expected %s  loose %s" % tuple(ce.mmss(tot_orig[k]) for k in K))
    print("additions : tight %s  expected %s  loose %s" % tuple(ce.mmss(tot_add[k]) for k in K))
    print("rating    : tight %s  expected %s  loose %s" % tuple(ce.mmss(tot_rating[k]) for k in K))
    print("dragons   : tight %+.1fs  expected %+.1fs  loose %+.1fs" % tuple(tot_dragon[k] for k in K))
    print("approved  : tight %+.1fs  expected %+.1fs  loose %+.1fs   (the creator-approved wording changes)" % tuple(tot_approved[k] for k in K))
    print("FINAL     : tight %s  expected %s  loose %s   (raw seconds %.1f / %.1f / %.1f)  50-60 min: %s"
          % (tuple(ce.mmss(tot[k]) for k in K) + tuple(tot[k] for k in K) + ("yes" if in_range else "NO",)))
    for s_ in over60:
        print("  over 60? %-46s -> expected %s, loose-cut bound %s" % (s_["step"], ce.mmss(s_["expected_after_s"]), ce.mmss(s_["loose_after_s"])))
    print("frames at %d fps: %d expected; at the BENCHMARK scene's speed native 4K would take %.0f-%.0f h (up to %.0f h, loose cut); "
          "the real sets are far heavier: see final/render-schedule.md"
          % (ce.FPS, frames["expected_s"], render_h["best_case_h"], render_h["worst_case_h"], render_h["loose_cut_worst_h"]))
    if "--markdown" in argv:
        print("\n| Start | Part | What | Tight cut | Expected | Loose cut |\n|---:|---|---|---:|---:|---:|")
        for r in order:
            extra = (" (with %s)" % ", ".join(r["changes"])) if r["changes"] else ""
            if r["kind"] == "rating" and r.get("creator_approved"):
                kind_label = "rating pass, approved by Daxtyn, in"
            else:
                kind_label = "addition in" if r["kind"] == "addition" else "rating pass in"
            label = r["row"] + extra if r["kind"] == "original" else "**%s** (%s %s)%s" % (r["row"], kind_label, r["where"], extra)
            print("| %s | %s | %s | %s | %s | %s |" % (ce.mmss(r["start_s"]), label, r["title"], ce.mmss(r["low_s"]), ce.mmss(r["expected_s"]), ce.mmss(r["high_s"])))
        print("| | **Total** | | **%s** | **%s** | **%s** |" % tuple(ce.mmss(tot[k]) for k in K))
    if review and "--review" in argv:
        print("\nreview (eyeball these):")
        for r in review:
            print("  " + r)
    if hard:
        print("\nHARD FAILURES:")
        for h in hard:
            print("  " + h)
    if "--json" in argv:
        with open(opt("--json", None), "w", encoding="utf-8") as f:
            json.dump(result, f, indent=1, ensure_ascii=False)
            f.write("\n")
    return 1 if hard else 0


def selftest():
    """--selftest: broken copies of the final script must fail with the right message (rules 1g, 6, 6b, 6d)."""
    import contextlib
    import io
    import tempfile
    fin = load(FINAL)
    R10_AT = "That keeper takes a flask from inside his coat, drinks and passes it over."
    cases = [
        ("an approved death block reworded (R18)", [("rocking, saying nothing", "swaying, saying nothing")],
         "R18: its story text is not the text Daxtyn approved"),
        ("an approved picture cut from R21", [("\n\nPICTURE: Along the wall below the steps", "\n\nPICTUR: Along the wall below the steps")],
         "R21: its story text is not the text Daxtyn approved"),
        ("a pronoun after Abby in the same paragraph (R10)", [(R10_AT, R10_AT + " Abby watches from the stable door. He holds the flask out to her.")],
         "with a pronoun right after a child or possible minor is named"),
        ("a pronoun after Abby in the paragraph before (R10)", [(R10_AT, R10_AT + "\n\nPICTURE: Abby stands at the stable door.\n\nPICTURE: The keeper holds the flask out to her.")],
         "with a pronoun right after a child or possible minor is named"),
        ("a title instead of her name (R10)", [(R10_AT, R10_AT + " The queen's daughter takes the flask.")],
         "in the same sentence as a child or possible minor"),
        ("an offer of drink in a cue to Abby (R10)", [(R10_AT, R10_AT + "\n\nKEEPER [to Abby]:\n\"Have a drink, then.\"")],
         "to a child or possible minor [to Abby]"),
        ("a new death outside the approved blocks (R10)", [(R10_AT, R10_AT + " A third keeper lies dead behind the feed cart.")],
         "death word 'dead' outside the deaths Daxtyn approved"),
        ("a reviewed sentence reworded (R3)", [("takes a small pipe from his coat and lights it.", "takes a small pipe from his coat and lights it slowly.")],
         "with a pronoun right after a child or possible minor is named"),
    ]
    failures = 0

    def run(argv):
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            rc = main(argv)
        return rc, buf.getvalue()
    rc, out = run([])
    print("selftest  %-58s %s" % ("the real script passes", "ok" if rc == 0 else "FAILED (exit %d)" % rc))
    failures += rc != 0
    with tempfile.TemporaryDirectory() as tmp:
        for name, edits, want in cases:
            text = fin
            for old, new in edits:
                if text.count(old) != 1:
                    raise SystemExit("selftest %r: %r is not in the script exactly once" % (name, old[:60]))
                text = text.replace(old, new)
            path = os.path.join(tmp, "broken.md")
            with open(path, "w", encoding="utf-8") as f:
                f.write(text)
            rc, out = run(["--final", path])
            ok = rc == 1 and want in out
            failures += not ok
            print("selftest  %-58s %s" % (name, "caught" if ok else "NOT CAUGHT (exit %d; expected %r)" % (rc, want)))
    saved = copy.deepcopy(APPROVED_RATING_TEXT)
    try:
        APPROVED_RATING_TEXT["R15"][0] = APPROVED_RATING_TEXT["R15"][0].replace("does not move", "barely moves")
        rc, out = run([])
        ok = rc == 1 and "the record of the text Daxtyn approved (APPROVED_RATING_TEXT) was edited" in out
    finally:
        APPROVED_RATING_TEXT.clear()
        APPROVED_RATING_TEXT.update(saved)
    failures += not ok
    print("selftest  %-58s %s" % ("the locked text edited inside this tool", "caught" if ok else "NOT CAUGHT"))
    print("selftest: %s" % ("all cases behave" if not failures else "%d case(s) wrong" % failures))
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(selftest() if "--selftest" in sys.argv[1:] else main(sys.argv[1:]))
