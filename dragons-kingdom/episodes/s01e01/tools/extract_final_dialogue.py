#!/usr/bin/env python3
"""Extract every spoken line and on-screen card of the locked Episode 1 shooting script.

Source of truth: ../final/screenplay-final.md (read only; check_final.py must pass on it first).

Writes, into ../final/:
  dialogue.json       every SPOKEN line of the shooting text, in order, with its origin
                      (original handoff / proposed addition X# / proposed rating pass R#), the CHANGED
                      block that reworded it, the PENDING note that keeps it as written, timing and
                      subtitle cues
  dialogue.md         the recording script, scene by scene
  onscreen-text.json  title, captions, lettering, credits (the handoff's ten cards plus the ones the
                      additions bring)

It reuses extract_dialogue.py (timing model, subtitle splitter, the hand-checked ANNOTATIONS for the
198 original lines, the on-screen cards of screenplay.md) and check_final.py (the marker parser), so
the three tools always agree. Original lines keep their ids L001..L198. Lines of an addition are
X#-NN (numbered within that addition in proposal order) and lines of a rating-pass block R#-NN, so an
id never changes when Daxtyn cuts something else.

Usage: python3 tools/extract_final_dialogue.py [--check]      (standard library only)
"""
import hashlib
import json
import math
import os
import re
import sys
from collections import OrderedDict

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import check_final as cf        # noqa: E402
import extract_dialogue as ed   # noqa: E402

EP = os.path.normpath(os.path.join(HERE, ".."))
FINAL = cf.FINAL
OUT_DIR = os.path.join(EP, "final")
OUT_DIALOGUE = os.path.join(OUT_DIR, "dialogue.json")
OUT_ONSCREEN = os.path.join(OUT_DIR, "onscreen-text.json")
OUT_MD = os.path.join(OUT_DIR, "dialogue.md")
REL_SOURCE = "episodes/s01e01/final/screenplay-final.md"
REL_SCRIPT = "episodes/s01e01/tools/extract_final_dialogue.py"
EM = "—"
X_SCENE_RE = re.compile(r"^SCENE (X\d+) " + EM + r" (.+)$")

# The proposed alternative wording kept in each PENDING note (shot only if Daxtyn picks it). Each text must
# appear in its PENDING note; the key is the line it would replace.
PENDING_ALTERNATIVES = {
    "Nightwings are faster. More versatile.": "Smaller ones are faster. More versatile.",
    "And Bashions?": "And big ones?",
    "We were off the coast. Flying together. Something came past Leaf. A Slitherwing.":
        "We were off the coast. Flying together. Something came past Leaf. A small dragon. Fast.",
    "I still want a Bashion.": "I still want one like Charcoal.",
}

# What each rating-pass block contains (final/CHANGES.md section 3); lines spoken inside it carry it.
RATING_CONTENT = {
    "R2": ["tobacco", "strong language", "humor"], "R3": ["drug use", "humor"], "R5": ["alcohol"],
    "R6": ["strong language"], "R9": ["dark humor", "alcohol", "tobacco"], "R10": ["dark humor", "alcohol"],
    "R11": ["suggestive"], "R12": ["alcohol"], "R13": ["suggestive", "alcohol", "humor"], "R14": ["strong language"],
}
CHANGE_CONTENT = {"C13": ["strong language"], "C21": ["strong language"], "C35": ["strong language"]}
STRONG_RE = re.compile(r"\b(fuck\w*|shit\w*|bastard\w*|bloody|damned)\b", re.I)

# Hand-written delivery notes for lines whose stage direction does not say enough on its own.
# Every other new line gets the nearest stage direction before it as its context (marked "auto").
NEW_LINE_NOTES = {
    "X1-01": "Breathless at the door; trying not to have run.",
    "X1-02": "Already turning from the window before the knock is finished. Controlled.",
    "X2-01": "Without looking up from the hatchling.",
    "X2-02": "Quiet, private: the one thing she asks of her son.",
    "X2-03": "Easy, a little too quick.",
    "X3-01": "Called from the platform behind Remi; respectful but firm.",
    "X3-05": "A ritual question, not an argument.",
    "X5-01": "Pressing the loose fastening with his thumb; confident.",
    "X5-03": "Old friends; this conversation is years old.",
    "X6-04": "Mock-reasonable; he knows he has already lost the argument.",
    "X6-06": "To Charcoal, resigned, already leaning forward.",
    "X7-01": "Under his breath, working it out.",
    "X12-03": "Kind, procedural.",
    "X12-04": "Through her teeth, before she can lose her nerve.",
    "X13-04": "Barely audible.",
    "X13-05": "Low, almost fierce.",
    "X18-04": "He hears what he is admitting as he says it.",
    "X19-07": "Looking at the jaws that held Leaf's head this morning and later caught the scout.",
    "X19-09": "Looking out at the far sail. Nobody answers it.",
    "R3-04": "Deadpan.",
    "R13-01": "Sung low, for one end of the table; badly and happily.",
    "R13-02": "Flat, appalled, amused.",
}


def load(path):
    with open(path, encoding="utf-8") as f:
        return f.read()


def walk(L, lo, hi, nodes, ctx, out):
    """Append (index, text, ctx) for every shooting-text line in L[lo..hi]: notes and PENDING blocks
    dropped, CHANGED blocks resolved to NOW lines, addition and rating-pass markers dropped."""
    starts = {n["start"]: n for n in nodes}
    i = lo
    while i <= hi:
        if i in starts:
            n = starts[i]
            if n["kind"] in ("note", "pend"):
                pass
            elif n["kind"] == "ch":
                c = dict(ctx, ch=n["id"], was=cf.was_lines(L, n))
                for k in range(n["now"] + 1, n["end"]):
                    out.append((k, L[k], c))
            else:
                walk(L, n["start"] + 1, n["end"] - 1, n["children"], dict(ctx, **{n["kind"]: n["id"]}), out)
            i = n["end"] + 1
            continue
        out.append((i, L[i], ctx))
        i += 1
    return out


def first_sentences(text, n=170):
    text = re.sub(r"^(PICTURE|SOUND|FINAL PICTURE): ", "", text.strip())
    out = ""
    for s in re.split(r"(?<=[.!?])\s+", text):
        if out and len(out) + len(s) > n:
            break
        out = (out + " " + s).strip()
    return out if len(out) <= n + 60 else out[:n].rstrip() + "..."


def build():
    raw = load(FINAL)
    L = raw.split("\n")
    top, nodes, errors = cf.parse(L)
    if errors:
        ed.fail("marker errors in the final script (run check_final.py): %s" % errors[:3])
    seq = walk(L, 0, len(L) - 1, top, {"add": None, "rp": None, "ch": None}, [])
    try:
        s0 = next(k for k, (i, t, c) in enumerate(seq) if t == "SCREENPLAY")
        s1 = next(k for k, (i, t, c) in enumerate(seq) if t == "END OF EPISODE 1.")
    except StopIteration:
        ed.fail("no SCREENPLAY / END OF EPISODE 1. in the final script")
    pend_nodes = [n for n in nodes if n["kind"] == "pend"]
    pend_after = {}   # source index of the quoted line -> (pending id, note text)
    for n in pend_nodes:
        note = next(l for l in L[n["start"] + 1:n["end"]] if l.strip())
        k = n["start"] - 1
        while k >= 0 and (not L[k].strip() or (L[k].startswith('"') and L[k] in cf.PENDING_LINES) or ed.CUE_RE.match(L[k])):
            if L[k] in cf.PENDING_LINES and cf.PENDING_LINES[L[k]] == n["id"]:
                pend_after[k] = (n["id"], note)
            k -= 1

    scene, part_title, last_para = None, None, ""
    scenes, out = [], []
    ann = iter(enumerate(ed.ANNOTATIONS, start=1))
    counters = {}
    k = s0 + 1
    while k < s1:
        i, t, ctx = seq[k]
        m = ed.SCENE_RE.match(t)
        mx = X_SCENE_RE.match(t)
        if m and not ctx["add"]:
            scene = m.group(2) or "PROLOGUE"
            slug = seq[k + 1][1].strip()
            scenes.append(OrderedDict([("id", scene), ("title", m.group(3).strip()), ("slugline", slug), ("source_line", i + 1)]))
            part_title = None
            k += 1
            continue
        if mx and ctx["add"]:
            part_title = "%s: %s" % (mx.group(1), mx.group(2).strip())
            k += 1
            continue
        cm = ed.CUE_RE.match(t)
        if cm:
            j = k + 1
            while j < s1 and not seq[j][1].strip():
                j += 1
            qi, q, qctx = seq[j]
            if not (q.startswith('"') and q.endswith('"') and q.count('"') == 2):
                ed.fail("final line %d: cue not followed by one quoted line" % (i + 1))
            speaker, bracket, text = cm.group(1), cm.group(2), q[1:-1]
            original, br_addr, notes = ed.parse_bracket(bracket)
            unit = ctx["rp"] or ctx["add"]
            if unit is None:
                n_ann, a = next(ann)
                a_scene, a_speaker, a_text, context, addressee, addr_src, cmd_kind = a
                if (a_scene, a_speaker, a_text) != (scene, speaker, text):
                    ed.fail("original line L%03d does not match the annotation table at final line %d: %r vs %r"
                            % (n_ann, qi + 1, (scene, speaker, text), (a_scene, a_speaker, a_text)))
                lid, origin, ctx_src = "L%03d" % n_ann, "original", "hand-checked (extract_dialogue.ANNOTATIONS)"
            else:
                counters[unit] = counters.get(unit, 0) + 1
                lid = "%s-%02d" % (unit, counters[unit])
                origin = "rating_pass" if ctx["rp"] else "addition"
                context = NEW_LINE_NOTES.get(lid) or first_sentences(last_para) or "No stage direction before the line."
                ctx_src = "hand-written" if lid in NEW_LINE_NOTES else "auto: the stage direction just before the line"
                addressee, addr_src, cmd_kind = None, None, None
                low = text.lower().strip(" .!?")
                if text in ed.CANONICAL_COMMANDS or low.capitalize() in ed.CANONICAL_COMMANDS:
                    ed.fail("%s: a canonical command in new text: %r" % (lid, text))
            if br_addr:
                addressee, addr_src = ed.normalise_addressee(br_addr), ed.BR
            interrupted = text.endswith(EM)
            command = None
            if cmd_kind:
                word = re.sub(r"[^A-Za-z ]", "", text).strip()
                if cmd_kind == ed.CAN:
                    command = {"type": ed.CAN, "word": word, "meaning": ed.CANONICAL_COMMANDS[word]}
                else:
                    word = ed.DIRECTIONAL_WORDS.get(word, word)
                    command = {"type": ed.DIR, "word": word, "meaning": "ordinary rider-to-dragon direction, not a canonical command"}
            est, rule = ed.estimate_seconds(speaker, text, notes, interrupted, cmd_kind)
            perf = ", ".join(notes) if notes else None
            delivery = (perf + " " + EM + " " + context) if perf else context
            was = None
            if qctx.get("ch"):
                was_q = [l for l in qctx["was"] if l.startswith('"')]
                was = was_q[0][1:-1] if len(was_q) == 1 else None
            content = list(RATING_CONTENT.get(ctx["rp"], [])) if ctx["rp"] else []
            if qctx.get("ch") in CHANGE_CONTENT:
                content += [c for c in CHANGE_CONTENT[qctx["ch"]] if c not in content]
            if STRONG_RE.search(text) and "strong language" not in content:
                content.append("strong language")
            pend = pend_after.get(qi)
            alt = None
            if pend:
                alt = PENDING_ALTERNATIVES.get(text)
                if not alt or ('"%s"' % alt) not in pend[1]:
                    ed.fail("%s: PENDING alternative not found in its note %s" % (lid, pend[0]))
            elif q in cf.PENDING_LINES:
                ed.fail("%s keeps a species word but has no PENDING note" % lid)
            item = OrderedDict([
                ("id", lid), ("seq", len(out) + 1), ("scene", scene),
                ("part", part_title if ctx["add"] else None),
                ("origin", origin), ("addition", ctx["add"]), ("rating_pass", ctx["rp"]),
                ("changed_by", qctx.get("ch")), ("was_text", was),
                ("pending", pend[0] if pend else None), ("pending_alternative", alt),
                ("speaker", speaker), ("addressee", addressee), ("addressee_source", addr_src if addressee else None),
                ("text", text), ("original", original),
                ("delivery", delivery), ("context_source", ctx_src),
                ("performance_note", perf), ("bracket_raw", bracket),
                ("rating_content", content),
                ("is_command", command is not None), ("command", command),
                ("interrupted", interrupted), ("continues", None),
                ("words", ed.word_count(text)), ("est_seconds", est), ("timing_rule", rule),
                ("subtitle_cues", ed.subtitle_cues(text)),
                ("subtitle_min_seconds", max(ed.SUB_MIN_SECONDS, math.ceil(len(text) / ed.SUB_READING_CPS * 10) / 10)),
                ("beat_after", ed.BEATS_AFTER.get((scene, text)) if origin == "original" else None),
                ("source_line", qi + 1),
            ])
            if text.startswith(EM):
                for cand in reversed(out):
                    if cand["speaker"] == speaker and cand["interrupted"]:
                        item["continues"] = cand["id"]
                        break
            out.append(item)
            k = j + 1
            continue
        if t.startswith('"'):
            ed.fail("final line %d: quoted line without a cue" % (i + 1))
        if t.strip() and not re.match(r"^(NOTE \(not spoken\):|INT\. |EXT\. |SCENE |ON-SCREEN LOCATION:)", t):
            last_para = t
        k += 1
    rest = list(ann)
    if rest:
        ed.fail("%d original lines were not found in the shooting text (first: L%03d)" % (len(rest), rest[0][0]))

    # ---- checks -------------------------------------------------------------------------------------
    originals = [(x["speaker"], x["text"]) for x in out if x["original"]]
    if originals != ed.ORIGINAL_LINES:
        ed.fail("[ORIGINAL] lines differ from the canon list: %r" % originals)
    for x in out:
        for bad in ("[", "]", '"', "ORIGINAL", "PICTURE", "SOUND:", "NOTE"):
            if bad in x["text"]:
                ed.fail("%s text contains %r" % (x["id"], bad))
        if x["origin"] != "original" and x["speaker"] in cf.DRAGON_NAMES:
            ed.fail("%s: a dragon speaks" % x["id"])
    if len({x["id"] for x in out}) != len(out):
        ed.fail("duplicate line ids")
    shoot_quotes = sum(1 for (i, t, c) in seq[s0:s1] if t.startswith('"'))
    if shoot_quotes != len(out):
        ed.fail("quoted lines in the shooting text (%d) != spoken lines (%d)" % (shoot_quotes, len(out)))
    if sorted(x["pending"] for x in out if x["pending"]) != ["P1", "P1", "P2", "P3"]:
        ed.fail("PENDING lines are not the four DRAGONS.md keeps as written")

    # ---- totals -------------------------------------------------------------------------------------
    def tot(xs):
        return OrderedDict([("lines", len(xs)), ("words", sum(x["words"] for x in xs)),
                            ("est_seconds", round(sum(x["est_seconds"] for x in xs), 1))])
    speakers = OrderedDict()
    for x in out:
        speakers.setdefault(x["speaker"], []).append(x)
    by_speaker = OrderedDict((s, dict(tot(xs), origins=sorted({x["origin"] for x in xs}),
                                      scenes=list(dict.fromkeys(x["scene"] for x in xs)))) for s, xs in speakers.items())
    for sc in scenes:
        xs = [x for x in out if x["scene"] == sc["id"]]
        sc.update(tot(xs))
        sc["first_line"] = xs[0]["id"] if xs else None
        sc["last_line"] = xs[-1]["id"] if xs else None
        sc["parts"] = list(dict.fromkeys(x["addition"] or x["rating_pass"] for x in xs if x["addition"] or x["rating_pass"]))
    by_unit = OrderedDict()
    for x in out:
        u = x["rating_pass"] or x["addition"]
        if u:
            by_unit.setdefault(u, []).append(x)
    total = round(sum(x["est_seconds"] for x in out), 1)
    sha = hashlib.sha256(raw.encode("utf-8")).hexdigest()
    dialogue = OrderedDict([
        ("episode", "S01E01"), ("series", "Dragon's Kingdom"),
        ("status", "Planning data extracted from the locked shooting script. No final voices have been recorded and nothing has been rendered. Every line not marked original=true is proposed dialogue; the additions and the rating pass are in the script by default and are not canon until Daxtyn accepts them (SERIES.md section 5)."),
        ("source", REL_SOURCE), ("source_sha256", sha), ("generated_by", REL_SCRIPT),
        ("rules", [
            "Only text following a named speaker or NARRATOR is spoken. NOTE lines, PICTURE/SOUND lines, markers, WAS text and PENDING notes are never spoken or subtitled.",
            "'text' holds only the spoken words of the shooting text (the NOW side of a CHANGED block): no quotes, no bracketed notes, no [ORIGINAL] marker.",
            "original=true marks Daxtyn's four [ORIGINAL] lines: perform and subtitle them byte-exact.",
            "pending=P# marks a proposed line that still names a scrapped species. DRAGONS.md keeps it as written until Daxtyn chooses new wording, so it is recorded as written; pending_alternative is the proposed replacement, recorded only if he picks it.",
            "Dragons have no human dialogue.",
            "An em dash at the end of 'text' means the line is cut off (interrupted=true); a leading em dash means it picks up a cut-off line ('continues').",
            "Subtitles come from the final recorded dialogue; re-run this script if the script changes.",
        ]),
        ("fields", OrderedDict([
            ("id", "L001..L198 = the handoff's lines (same ids as ../dialogue.json); X#-NN = line NN of proposed addition X#; R#-NN = line NN of proposed rating-pass block R#"),
            ("seq", "running order in the episode, 1..N"),
            ("scene", "the handoff scene the line plays in (PROLOGUE, 1A..3D); additions are counted in the scene they sit in"),
            ("part", "the addition's own scene heading, when it has one"),
            ("origin", "original | addition | rating_pass"),
            ("addition / rating_pass", "the block the line is in (a rating-pass block can sit inside an addition)"),
            ("changed_by / was_text", "the CHANGED block that rewords this line and the wording it replaced (kept in screenplay-final.md)"),
            ("pending / pending_alternative", "see rules"),
            ("rating_content", "what the line carries for the mature rating (SERIES.md section 8)"),
            ("delivery", "bracketed performance note (if any) and the context; context_source says whether it was hand-checked or taken automatically from the stage direction before the line"),
            ("est_seconds / timing_rule", "estimated natural speaking time, same model as ../dialogue.json"),
            ("subtitle_cues / subtitle_min_seconds", "same model as ../dialogue.json"),
            ("source_line", "1-based line of the quoted text in final/screenplay-final.md"),
        ])),
        ("timing_model", OrderedDict([
            ("summary", "Same model as ../dialogue.json (extract_dialogue.py): words / 2.6 per s conversational; / 2.1 for narrator and whispered, quiet, low or in-pain lines; +0.25 s (narrator 0.4 s) per internal sentence break; one-word commands 0.6-1.0 s; floor 0.6 s; rounded to 0.1 s."),
            ("sung_lines", "R13-01 is sung low: the speech model gives a floor; the shot list adds the extra sung time as picture time."),
        ])),
        ("totals", OrderedDict([
            ("spoken_lines", len(out)), ("est_spoken_seconds", total), ("est_spoken_minutes", round(total / 60.0, 2)),
            ("by_origin", OrderedDict((o, tot([x for x in out if x["origin"] == o])) for o in ("original", "addition", "rating_pass"))),
            ("original_marker_lines", sum(1 for x in out if x["original"])),
            ("pending_wording_lines", sum(1 for x in out if x["pending"])),
            ("changed_lines", sum(1 for x in out if x["changed_by"])),
            ("command_lines", sum(1 for x in out if x["is_command"])),
            ("canonical_command_lines", sum(1 for x in out if x["command"] and x["command"]["type"] == ed.CAN)),
            ("interrupted_lines", sum(1 for x in out if x["interrupted"])),
            ("strong_language_lines", sum(1 for x in out if "strong language" in x["rating_content"])),
            ("subtitle_cues", sum(len(x["subtitle_cues"]) for x in out)),
            ("speakers", len(by_speaker)),
            ("by_speaker", by_speaker),
            ("by_unit", OrderedDict((u, tot(xs)) for u, xs in by_unit.items())),
        ])),
        ("scenes", scenes),
        ("lines", out),
    ])
    onscreen = build_onscreen(L, seq, s0, s1, sha, out)
    return dialogue, onscreen, build_md(dialogue, onscreen)


def build_onscreen(L, seq, s0, s1, sha, out):
    orig = load(ed.SCREENPLAY).split("\n")
    o_start, o_end, _sc, _sp = ed.parse(orig)
    base = ed.build_onscreen(orig, o_start, o_end, hashlib.sha256(load(ed.SCREENPLAY).encode("utf-8")).hexdigest())
    shoot_idx = [i for (i, t, c) in seq[s0:s1] if not c["add"] and not c["rp"]]
    by_id = {x["id"]: x for x in out}
    cards = []
    for c in base["cards"]:
        c = OrderedDict(c)
        txt = orig[c["source_line"] - 1]
        hits = [i for i in shoot_idx if L[i] == txt] if c["kind"] != "end_titles" else [L.index("END TITLES")]
        if len(hits) != 1:
            ed.fail("on-screen card %s: its screenplay line is not found once outside the additions" % c["id"])
        c["source_line"] = hits[0] + 1
        cards.append(c)

    def line_near(idx, after=True):
        xs = [x for x in out if (x["source_line"] - 1 < idx if after else x["source_line"] - 1 > idx)]
        return (xs[-1]["id"] if after else xs[0]["id"]) if xs else None
    x5 = [i for (i, t, c) in seq[s0:s1] if c["add"] == "X5" and t.startswith("ON-SCREEN LOCATION: ")]
    x4 = [i for (i, t, c) in seq[s0:s1] if c["add"] == "X4" and "her name can be glimpsed on the hull here" in t]
    if len(x5) != 1 or len(x4) != 1:
        ed.fail("cannot find the X4/X5 on-screen text in the final script")
    if L[x5[0]] != "ON-SCREEN LOCATION: CLING " + EM + " SCRAPPER.":
        ed.fail("X5 caption text changed: %r" % L[x5[0]])
    new = [
        ("T11", "location_caption", "CLING " + EM + " SCRAPPER", False, x5[0], "X5", 3.5,
         "Opening of X5, Cling's first appearance, over the nearly empty square in the morning.",
         "The first time Cling is seen (X5). T08 repeats it at 3A, as the screenplay writes it; the X5 note keeps both. If X5 is cut, T08 is the only one."),
        ("T12", "vessel_name", "SANTA MARIA", True, x4[0], "X4", 2.0,
         "X4, lettering on the Santa Maria's hull as Leaf passes her mast; glimpsed, not held, no music sting.",
         "Optional: only if the lettering is legible. The ship's name card in 2C (T07) is optional too; show the name at most once on a card."),
    ]
    for cid, kind, txt, optional, idx, part, hold, placement, note in new:
        cards.append(OrderedDict([
            ("id", cid), ("kind", kind), ("text", txt), ("optional", optional), ("scene", "1C" if part in ("X4", "X5") else None),
            ("part", part), ("after_dialogue_line", line_near(idx, True)), ("before_dialogue_line", line_near(idx, False)),
            ("placement", placement), ("suggested_hold_seconds", hold), ("screenplay_says", L[idx].strip()[:400]),
            ("note", note), ("source_line", idx + 1)]))
    cards.sort(key=lambda c: c["source_line"])
    for c in cards:
        for key in ("after_dialogue_line", "before_dialogue_line", "during_dialogue_line"):
            if c.get(key) and c[key] not in by_id:
                ed.fail("on-screen card %s refers to unknown line %s" % (c["id"], c[key]))
    return OrderedDict([
        ("episode", "S01E01"),
        ("status", "Planning data. Nothing has been designed or rendered yet."),
        ("source", REL_SOURCE), ("source_sha256", sha), ("generated_by", REL_SCRIPT),
        ("about", "Text that appears in the picture itself (title, captions, lettering, credits), separate from dialogue subtitles. T01-T10 are the handoff's cards (same ids as ../onscreen-text.json); T11-T12 come from proposed additions. Cards are listed in running order."),
        ("suggested_hold_seconds_note", "Suggestions for the animatic only; adjust in the edit."),
        ("never_on_screen", ed.NEVER_ON_SCREEN + ["[PROPOSED ...], [CHANGED ...], [PENDING ...] and FINAL SCRIPT NOTE markers, NOTE lines and WAS text"]),
        ("cards", cards),
    ])


def build_md(d, o):
    W = []
    w = W.append
    t = d["totals"]
    w("# Dragon's Kingdom, Season 1 Episode 1: dialogue of the locked shooting script")
    w("")
    w("The recording script for the whole episode: who says what, scene by scene. It is made from `screenplay-final.md` by `tools/extract_final_dialogue.py`, so it always matches the script. **No final voices have been recorded and nothing has been rendered yet.**")
    w("")
    w("## How to read it")
    w("")
    w("- Only the words in the **Line** column are spoken. The **How** column is advice for the performer; never say it out loud.")
    w("- **#** is the line id. `L001`-`L198` are the handoff's lines (the same ids as `../dialogue.json`). `X4-03` is the third line of proposed addition X4; `R3-02` the second line of proposed rating-pass block R3.")
    w("- **ORIGINAL** marks Daxtyn's own four lines. Say them exactly as written.")
    w("- **PENDING** marks a line that still uses a scrapped dragon name. `DRAGONS.md` keeps it as written until Daxtyn chooses new wording, so record it as written; the proposed alternative is shown and is recorded only if he picks it.")
    w("- **CHANGED C#** marks a line reworded in the final script; the old wording is shown in *was*.")
    w("- **ADD** = proposed addition, **RATING** = proposed rating-pass line (with what it carries). None of it is canon until Daxtyn accepts it.")
    w("- A dash at the end of a line (—) means the speaker gets cut off. Dragons never speak.")
    w("- *Sec* is a rough guess at how long the line takes to say. Real recordings will be different.")
    w("")
    w("## Totals")
    w("")
    bo = t["by_origin"]
    w("- Spoken lines: **%d**: %d from the handoff, %d in the proposed additions, %d in the proposed rating pass." % (
        t["spoken_lines"], bo["original"]["lines"], bo["addition"]["lines"], bo["rating_pass"]["lines"]))
    w("- %d ORIGINAL lines, %d PENDING lines, %d CHANGED lines, %d dragon-command lines, %d cut-off lines, %d lines with strong language." % (
        t["original_marker_lines"], t["pending_wording_lines"], t["changed_lines"], t["command_lines"], t["interrupted_lines"], t["strong_language_lines"]))
    w("- Total speaking time: about **%s seconds (%s)**. The rest of the estimated 54-minute episode is picture, action, music and silence (`shotlist.md`)." % (
        ed.fmt_s(t["est_spoken_seconds"]), ed.mmss(t["est_spoken_seconds"])))
    w("")
    w("| Character | Lines | Words | Seconds | In |")
    w("|---|---:|---:|---:|---|")
    for name, s in sorted(t["by_speaker"].items(), key=lambda kv: (-kv[1]["lines"], kv[0])):
        w("| %s | %d | %d | %s | %s |" % (name, s["lines"], s["words"], ed.fmt_s(s["est_seconds"]), ", ".join(s["scenes"])))
    w("")
    w("## On-screen words (not spoken)")
    w("")
    w("These appear in the picture, not in the voice track. Full details are in `onscreen-text.json`.")
    w("")
    for c in o["cards"]:
        txt = c["text"] if c["text"] else "(credits, to be written; real contributors only)"
        w("- %s **%s**%s%s" % (c["id"], txt, " (optional)" if c["optional"] else "", " (in %s)" % c["part"] if c.get("part") else ""))
    w("")
    w("## The script")
    for sc in d["scenes"]:
        w("")
        w("### %s: %s" % ("Prologue" if sc["id"] == "PROLOGUE" else "Scene " + sc["id"], ed.title_case(sc["title"])))
        w("")
        w("*%s* · %d lines · about %s s%s" % (sc["slugline"], sc["lines"], ed.fmt_s(sc["est_seconds"]),
                                             (" · with " + ", ".join(sc["parts"])) if sc["parts"] else ""))
        w("")
        w("| # | Who | Line | How | Sec |")
        w("|---|---|---|---|---:|")
        cur = None
        for x in d["lines"]:
            if x["scene"] != sc["id"]:
                continue
            unit = x["rating_pass"] or x["addition"]
            if unit != cur:
                if unit:
                    label = (x["part"] or x["addition"]) if not x["rating_pass"] else x["rating_pass"] + (" (in %s)" % x["addition"] if x["addition"] else "")
                    w("| | | ***%s*** | %s | |" % (label, "proposed rating pass" if x["rating_pass"] else "proposed addition"))
                cur = unit
            tags = []
            if x["original"]:
                tags.append("**ORIGINAL, say exactly.**")
            if x["pending"]:
                tags.append("**PENDING (%s): record as written.** Proposed alternative, only if Daxtyn picks it: \"%s\"" % (x["pending"], x["pending_alternative"]))
            if x["changed_by"]:
                tags.append("**CHANGED %s** (was: \"%s\")" % (x["changed_by"], x["was_text"]))
            if x["origin"] == "addition" and not x["rating_pass"]:
                tags.append("ADD.")
            if x["origin"] == "rating_pass":
                tags.append("RATING%s." % ((" (" + ", ".join(x["rating_content"]) + ")") if x["rating_content"] else ""))
            elif x["rating_content"]:
                tags.append("(%s)" % ", ".join(x["rating_content"]))
            if x["is_command"]:
                tags.append("**CMD** (%s)." % ("official command" if x["command"]["type"] == ed.CAN else "direction, not an official command"))
            how = []
            if x["performance_note"]:
                how.append("*%s.*" % x["performance_note"].capitalize())
            if x["addressee"] and x["addressee_source"] in (ed.BR, ed.SD) and x["addressee"].lower() not in ("him", "her", "them"):
                who = x["addressee"]
                if who not in ed.NAMED and not re.match(r"^(the|his|her|their|himself|herself) ?", who):
                    who = "the " + who
                how.append("To %s." % who)
            ctx = x["delivery"].split(" " + EM + " ", 1)[1] if x["performance_note"] else x["delivery"]
            how.append(ctx)
            w("| %s | %s | %s | %s | %s |" % (x["id"], x["speaker"], x["text"].replace("|", "\\|"),
                                             " ".join(tags + how).replace("|", "/"), ed.fmt_s(x["est_seconds"])))
            if x["beat_after"]:
                w("| | | *(silence)* | %s | |" % x["beat_after"])
    w("")
    w("---")
    w("")
    w("Generated from `screenplay-final.md` (sha256 `%s`). To rebuild after a script change: `python3 tools/extract_final_dialogue.py` (after `tools/check_final.py` passes)." % d["source_sha256"][:16])
    w("")
    return "\n".join(W)


def main(argv):
    check = "--check" in argv
    dialogue, onscreen, md = build()
    outputs = [(OUT_DIALOGUE, ed.dump_json(dialogue)), (OUT_ONSCREEN, ed.dump_json(onscreen)), (OUT_MD, md)]
    stale = []
    for path, content in outputs:
        if check:
            if not os.path.exists(path) or load(path) != content:
                stale.append(os.path.basename(path))
        else:
            with open(path, "w", encoding="utf-8") as f:
                f.write(content)
    t = dialogue["totals"]
    print("final spoken lines: %d (original %d, addition %d, rating pass %d) | est. spoken seconds: %s | speakers: %d | pending: %d | on-screen cards: %d"
          % (t["spoken_lines"], t["by_origin"]["original"]["lines"], t["by_origin"]["addition"]["lines"],
             t["by_origin"]["rating_pass"]["lines"], t["est_spoken_seconds"], t["speakers"], t["pending_wording_lines"], len(onscreen["cards"])))
    if check:
        if stale:
            print("STALE: " + ", ".join(stale))
            return 1
        print("up to date")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
