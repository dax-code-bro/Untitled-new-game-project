#!/usr/bin/env python3
"""Prove that final/screenplay-final.md (the locked shooting script) keeps screenplay.md intact and
keeps the 28 additions exactly as proposed, lint the canon and the rating limits, estimate the
runtime, and (with --clean) write the reading copy final/screenplay-final-clean.md.

It extends check_extended.py and reuses its timing model, its per-addition shot estimates and its
canon lists, so both tools always agree. check_extended.py is unchanged and still checks
screenplay-extended.md.

Markers in the final script (see its first FINAL SCRIPT NOTE). Everything marked PROPOSED is a proposal
(SERIES.md section 5): being in the shooting script is not acceptance. When Daxtyn accepts an addition, its
markers are removed and the acceptance is recorded in the episode folder; that also needs this tool's proofs
1b and 2 to treat the accepted text as base text, which is not built yet.
  [PROPOSED ADDITION X# — in the shooting script by default 2026-10-16, not accepted by Daxtyn — begin]
      ... [PROPOSED ADDITION X# — end]
  [PROPOSED RATING PASS R# — begin] ... [PROPOSED RATING PASS R# — end]   (may sit inside an addition;
      ids may carry a letter, R8b, for blocks added between existing ones)
  [CHANGED C# — reason — WAS (kept for the record, not shot):] old lines
  [CHANGED C# — NOW (shoot this):] new lines [CHANGED C# — end]   (may sit inside an addition)
  [PENDING P# — Daxtyn wording — DRAGONS.md L9 — begin] ... [PENDING P# — end]
      (right after dialogue that DRAGONS.md keeps as written until Daxtyn chooses new wording; holds only a
      NOTE with the proposed alternative; never shot; may sit inside an addition)
  [FINAL SCRIPT NOTE — begin] ... [FINAL SCRIPT NOTE — end]  (document notes, top level only)

Hard checks (exit code 1 if any fails):
  1. Proof that the original survives:
       a. every line of screenplay.md (blank lines included) appears word for word and in order as a
          line of the final script (the WAS text of a changed line counts: it is kept verbatim);
       b. dropping every note, addition, rating-pass and PENDING block (with the blank line each brought) and
          turning every top-level CHANGED block back into its WAS text gives screenplay.md byte for
          byte, so nothing unmarked was added or changed;
       c. the four [ORIGINAL] cue + quote pairs are in the shooting text unchanged, no CHANGED block
          touches them, and no new cue is marked [ORIGINAL];
       d. top-level changes sit only inside the story (between "SCREENPLAY" and "END OF EPISODE 1."):
          the front matter, CANON LOCK and closing checks stay word for word.
  2. Proof that the additions are the proposals: inside each addition, dropping its rating-pass and
     PENDING blocks and turning its CHANGED blocks back into WAS text gives the body of the same
     "[PROPOSED ADDITION X#]" in screenplay-extended.md exactly.
  3. Markers: well formed, ids unique and increasing (gaps are allowed: Daxtyn may cut), only
     rating-pass, CHANGED and PENDING blocks nest (inside additions), every rating-pass block opens with
     "NOTE (not spoken): [PROPOSED RATING PASS]", every CHANGED reason names DRAGONS.md or
     [PROPOSED RATING PASS], every PENDING block opens with "NOTE (not spoken): [PENDING Daxtyn wording —
     DRAGONS.md L9]" and follows one of the PENDING_LINES, and every PENDING_LINES line is followed by one.
  4. Dependencies: check_extended.DEPENDS for additions and RATING_DEPENDS below; a kept block whose
     dependency was cut fails, and each link is named in the dependent's first note (or CHANGED
     reason) and in the closing note's "Links between additions" / "Rating-pass links" paragraphs.
  5. Canon lint on all new text (additions, rating-pass blocks, NOW text): check_extended's
     forbidden lists and regression guards; no species word (except the PENDING_LINES); no front legs,
     upright sitting or dog-sit on the haunches (DRAGONS.md low stance); Queen Fall only in X28's wordless
     shot and never speaking; no death or bleeding-out words with the scout or its rider;
     no fire, wounds or blood with Starlight; Abby never mentions being queen; no canonical command
     and no short spoken order to a dragon; only known speakers (dragons never speak). In the whole
     story's shooting text, species words appear only in Abby's [ORIGINAL] line and the PENDING_LINES
     (DRAGONS.md: dialogue naming a species stays as written until Daxtyn chooses new wording).
  6. Rating hard limits (SERIES.md section 8) on all new text: no sentence pairs a drug, tobacco,
     alcohol or suggestive word with Abby, Remi (age not established), a child, the young attendant
     or the young riders; those characters never speak such words; no graphic bone or gore with Abby;
     the story text of the death and gore blocks (DEAD_BLOCKS) never names a child or a small or little
     body: every one of the dead is an adult.
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
RP_BEGIN = re.compile(r"^\[PROPOSED RATING PASS (R\d+[a-z]?) — begin\]$")
RP_END = re.compile(r"^\[PROPOSED RATING PASS (R\d+[a-z]?) — end\]$")
PEND_BEGIN = re.compile(r"^\[PENDING (P\d+) — Daxtyn wording — DRAGONS\.md L9 — begin\]$")
PEND_END = re.compile(r"^\[PENDING (P\d+) — end\]$")
RP_NOTE = "NOTE (not spoken): [PROPOSED RATING PASS]"
RP_REASON = "[PROPOSED RATING PASS]"
PEND_NOTE = "NOTE (not spoken): [PENDING Daxtyn wording — DRAGONS.md L9]"
# DRAGONS.md (Daxtyn's decision file): "the Episode 1 dialogue still names the species ... Daxtyn decides the new
# wording. Until then the lines stay as written." These proposed lines keep their species word while that question
# is open; each must be followed by a PENDING block. Abby's [ORIGINAL] line is allowed separately.
PENDING_LINES = {'"Nightwings are faster. More versatile."': "P1", '"And Bashions?"': "P1",
                 '"We were off the coast. Flying together. Something came past Leaf. A Slitherwing."': "P2",
                 '"I still want a Bashion."': "P3"}
CH_WAS = re.compile(r"^\[CHANGED (C\d+) — (.+) — WAS \(kept for the record, not shot\):\]$")
CH_NOW = re.compile(r"^\[CHANGED (C\d+) — NOW \(shoot this\):\]$")
CH_END = re.compile(r"^\[CHANGED (C\d+) — end\]$")
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
VICE_RE = re.compile(r"\b(ale|wine|cider|beer|mead|brandy|liquor|spirits|flask|jugs?|drunk\w*|tipsy|tobacco|pipes?|snuff|"
                     r"smok\w*|drugs?|poppy|hemp|opium|suggestive|bawdy|innuendo|flirt\w*|lovers?|seduc\w*|kiss\w*|naked|undress\w*)\b", re.I)
PROTECTED_RE = re.compile(r"\b(Abby|Remi|prince|princess|child|children|kids?|boy|girl|young riders?|young attendant)\b", re.I)
PROTECTED_SPEAKERS = {"ABBY", "REMI", "CHILD", "YOUNG ATTENDANT"}
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
        if k in ("add_b", "rp_b", "ch_was", "pend_b", "note_b"):
            kind = {"add_b": "add", "rp_b": "rp", "ch_was": "ch", "pend_b": "pend", "note_b": "note"}[k]
            node = {"kind": kind, "id": m.group(1) if m else None, "start": i, "end": None, "children": [],
                    "parent": stack[-1] if stack else None, "reason": m.group(2) if k == "ch_was" else None,
                    "status": m.group(2) if k == "add_b" else None, "now": None}
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
            if node["kind"] != kind or (m and node["id"] != m.group(1)):
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
    for cue, quote in marked:
        if not any(shoot[k] == cue and shoot[k + 1] == quote for k in range(len(shoot) - 1)):
            hard.append("[ORIGINAL] line missing or changed in the shooting text: %s %s" % (cue, quote))
    n_orig_cues = sum(1 for l in shoot if ce.CUE_RE.match(l) and "ORIGINAL" in (ce.CUE_RE.match(l).group(2) or ""))
    if n_orig_cues != len(marked):
        hard.append("the shooting text has %d cues marked [ORIGINAL]; screenplay.md has %d" % (n_orig_cues, len(marked)))
    try:
        story_lo, story_hi = L.index("SCREENPLAY"), L.index("END OF EPISODE 1.")
    except ValueError:
        story_lo, story_hi = 0, len(L)
        hard.append("cannot find the 'SCREENPLAY' or 'END OF EPISODE 1.' line")
    quotes = {q for _, q in marked} | {c for c, _ in marked}
    for n in nodes:
        if n["kind"] != "ch":
            continue
        w, nw = was_lines(L, n), now_lines(L, n)
        if not w or not nw or w == nw:
            hard.append("%s: WAS and NOW must both be present and differ" % n["id"])
        if any("[ORIGINAL" in l or l in quotes for l in w):
            hard.append("%s: changes an [ORIGINAL] line, which must stay word for word" % n["id"])
        if not ("DRAGONS.md" in n["reason"] or RP_REASON in n["reason"]):
            hard.append("%s: its reason names neither DRAGONS.md nor %s: %r" % (n["id"], RP_REASON, n["reason"]))
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
            if not first.startswith(RP_NOTE):
                hard.append("%s: does not open with %r" % (n["id"], RP_NOTE))
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
        for pat, why in ce.REVIEW:
            for mm in re.finditer(pat, text, re.I):
                s0 = max(0, mm.start() - 40)
                review.append("%s [%s] ...%s..." % (label, why, text[s0:mm.end() + 30].replace("\n", " ")))
    # whole story, shooting text: species words only in Abby's [ORIGINAL] line; no upright stance
    try:
        s_lo, s_hi = shoot.index("SCREENPLAY"), shoot.index("END OF EPISODE 1.")
    except ValueError:
        s_lo, s_hi = 0, 0
    for k in range(s_lo, s_hi):
        l = shoot[k]
        if SPECIES_RE.search(l) and l not in quotes and l not in PENDING_LINES:
            flag("story line still names a species: %r" % l[:120])
        if STANCE_RE.search(l):
            flag("story line contradicts the two-legged low stance: %r" % l[:120])

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
                              "where": scene_of(i), "changes": kids, **vals})
    t = 0.0
    for r in order:
        r["start_s"] = t
        t += r["expected_s"]
    K = ("low_s", "expected_s", "high_s")
    tot = {k: sum(r[k] for r in order) for k in K}
    tot_orig = {k: sum(st[r["row"]][k] for r in order if r["kind"] == "original") for k in K}
    tot_add = {k: sum(units_t[n["id"]][k] for n in adds) for k in K}
    rating_nodes = [n for n in nodes if n["kind"] == "rp" or (n["kind"] == "ch" and RP_REASON in n["reason"])]
    dragon_nodes = [n for n in nodes if n["kind"] == "ch" and RP_REASON not in n["reason"]]
    tot_rating = {k: sum(units_t[n["id"]][k] for n in rating_nodes) for k in K}
    tot_dragon = {k: sum(units_t[n["id"]][k] for n in dragon_nodes) for k in K}
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
    n_pend = sum(1 for n in nodes if n["kind"] == "pend")
    all_new = [d for n in nodes if n["kind"] == "rp" for d in dialogue(L[n["start"] + 1:n["end"]])[0]]
    result = {"source_sha256": sha,
              "proof": {"original_lines": len(orig_lines), "lines_found_in_order": matched,
                        "byte_identical_after_restoring": verbatim, "original_markers": len(marked)},
              "additions_kept": [a["id"] for a in adds], "additions_cut": cut,
              "rating_pass_blocks": n_rp, "changed_blocks": n_ch, "changed_for_rating": n_ch_r, "pending_blocks": n_pend,
              "units": units_t, "running_order": order, "totals": tot, "original_totals": tot_orig,
              "addition_totals": tot_add, "rating_pass_totals": tot_rating, "dragon_change_totals": tot_dragon,
              "over_60_cut_order": over60, "frames": frames, "render_hours": render_h,
              "hard_failures": hard, "review": review}
    print("PROOF  screenplay.md sha256 %s" % sha[:16])
    print("PROOF  %d of %d original lines found word for word, in order: %s" % (matched, len(orig_lines), "yes" if not missing else "NO"))
    print("PROOF  notes/additions/rating-pass blocks dropped and WAS text restored = screenplay.md byte for byte: %s" % ("yes" if verbatim else "NO"))
    print("PROOF  [ORIGINAL] cue+quote pairs: %d, each unchanged in the shooting text: %s" % (len(marked), not any("[ORIGINAL] line" in h for h in hard)))
    print("PROOF  additions identical to their proposals outside marked changes: %d of %d kept%s" % (
        sum(1 for a in adds if not any(h.startswith(a["id"] + ": not the proposal") for h in hard)), len(adds),
        (" (cut: %s)" % ", ".join(cut)) if cut else ""))
    print("blocks: %d additions, %d rating-pass blocks, %d changed lines (%d for the rating pass, %d for DRAGONS.md), "
          "%d PENDING wording notes, %d document notes" % (len(adds), n_rp, n_ch, n_ch_r, n_ch - n_ch_r, n_pend, len(notes)))
    print("rating-pass dialogue: %d new lines, %d words" % (len(all_new), sum(d[3] for d in all_new)))
    print("original  : tight %s  expected %s  loose %s" % tuple(ce.mmss(tot_orig[k]) for k in K))
    print("additions : tight %s  expected %s  loose %s" % tuple(ce.mmss(tot_add[k]) for k in K))
    print("rating    : tight %s  expected %s  loose %s" % tuple(ce.mmss(tot_rating[k]) for k in K))
    print("dragons   : tight %+.1fs  expected %+.1fs  loose %+.1fs" % tuple(tot_dragon[k] for k in K))
    print("FINAL     : tight %s  expected %s  loose %s   (raw seconds %.1f / %.1f / %.1f)  50-60 min: %s"
          % (tuple(ce.mmss(tot[k]) for k in K) + tuple(tot[k] for k in K) + ("yes" if in_range else "NO",)))
    for s_ in over60:
        print("  over 60? %-46s -> expected %s, loose-cut bound %s" % (s_["step"], ce.mmss(s_["expected_after_s"]), ce.mmss(s_["loose_after_s"])))
    print("frames at %d fps: %d expected; native-4K render %.0f-%.0f h (expected cut), up to %.0f h (loose cut)"
          % (ce.FPS, frames["expected_s"], render_h["best_case_h"], render_h["worst_case_h"], render_h["loose_cut_worst_h"]))
    if "--markdown" in argv:
        print("\n| Start | Part | What | Tight cut | Expected | Loose cut |\n|---:|---|---|---:|---:|---:|")
        for r in order:
            extra = (" (with %s)" % ", ".join(r["changes"])) if r["changes"] else ""
            label = r["row"] + extra if r["kind"] == "original" else "**%s** (%s %s)%s" % (
                r["row"], "addition in" if r["kind"] == "addition" else "rating pass in", r["where"], extra)
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


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
