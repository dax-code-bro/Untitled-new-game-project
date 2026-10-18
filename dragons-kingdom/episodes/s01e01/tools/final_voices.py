#!/usr/bin/env python3
"""Write final/voices.json: one consistent free voice per speaking role of the locked shooting script.

Inputs: ../voices.json (the provisional casting of the handoff's 18 roles, with measured auditions),
        ../final/dialogue.json (from extract_final_dialogue.py), ../preview/vo/takes.json (the voices and
        settings already used for the preview takes, which must not change).
Output: ../final/voices.json

Rules kept from ../voices.json: Kokoro-82M v1.0 (Apache-2.0) voices only; one voice per role for the whole
episode; no two roles share a voice; the voices that ../voices.json avoids because they are named after a
commercial product's voice (af_alloy, af_nova, am_echo, am_onyx, bm_fable) or am_santa stay unused. All nine
allowed male voices are already taken, so the new male roles use BLENDS of two allowed voices (Kokoro
voice style arrays are averaged; ../voices.json engines.kokoro.controls) plus a pitch shift, chosen so
neither parent voice speaks in the same scenes. Every blend is untested: audition it against every role
it shares a scene with before use.

Daxtyn's decisions of 2026-10-18: the five lines that named a scrapped dragon species use the wording he approved
(final/dialogue.json creator_approved), so no species word is spoken and the species pronunciations are not needed;
the creature entries describe each dragon's own design instead of a species (DRAGONS.md, no species).

Usage: python3 tools/final_voices.py [--check]
"""
import json
import os
import sys
from collections import OrderedDict

HERE = os.path.dirname(os.path.abspath(__file__))
EP = os.path.normpath(os.path.join(HERE, ".."))
SRC_VOICES = os.path.join(EP, "voices.json")
DIALOGUE = os.path.join(EP, "final", "dialogue.json")
TAKES = os.path.join(EP, "preview", "vo", "takes.json")
OUT = os.path.join(EP, "final", "voices.json")

KOKORO_EN = ["af_alloy", "af_aoede", "af_bella", "af_heart", "af_jessica", "af_kore", "af_nicole", "af_nova", "af_river",
             "af_sarah", "af_sky", "am_adam", "am_echo", "am_eric", "am_fenrir", "am_liam", "am_michael", "am_onyx",
             "am_puck", "am_santa", "bf_alice", "bf_emma", "bf_isabella", "bf_lily", "bm_daniel", "bm_fable",
             "bm_george", "bm_lewis"]
AVOID = {"af_alloy", "af_nova", "am_echo", "am_onyx", "bm_fable", "am_santa"}
LICENSE = "Apache-2.0 (Kokoro-82M v1.0 voice pack, hexgrad; ONNX export by thewh1teagle/kokoro-onnx)"

# Roles new in the final script (additions and rating pass), and the one recast.
NEW_ROLES = OrderedDict([
    ("YOUNG ATTENDANT", dict(
        voice="af_sky", speed=1.05, lang="en-us", pitch=0.0, gender_basis="The script calls her 'her' (X12: 'Alexandria reads her face'). Young; no age is set.",
        direction="Quick and careful; a junior servant who has run and is trying not to show it (X1), and who brings bad news to a room she should not interrupt (X12). Quiet with the hatchling (X13).",
        why="af_sky is the lightest unused allowed female voice; it sits apart from the ATTENDANT (af_river), who shares 1A with her.", priority=4)),
    ("LOOKOUT", dict(
        voice="af_jessica", speed=1.05, lang="en-us", pitch=0.0, gender_basis="Not specified (no pronoun). Cast female, provisional.",
        direction="Shouted down from the masthead: 'Master! The princess!' Alarm, not panic.",
        why="af_jessica is free because the final script makes the ADULT VILLAGER a man (recast below); it has only one line and shares no scene with the PARTNER.", priority=5)),
    ("SHIP'S MASTER", dict(
        blend=[("am_fenrir", 0.55), ("bm_george", 0.45)], speed=0.92, lang="en-gb", pitch=-2.5,
        gender_basis="The script says 'his crew'. A man; no age set.",
        direction="A weathered working master: orders without speeches (X9, X16), dry dark humor with his crew (R9), a pipe in his teeth.",
        why="Blend of two allowed male voices whose roles never share his scenes (GROUND KEEPER is on the riding grounds, KING OF CLING in Cling), shifted 2.5 semitones down so it sits below both.", priority=4)),
    ("SAILOR", dict(
        voice="bf_alice", speed=1.0, lang="en-gb", pitch=0.0, gender_basis="Not specified (no pronoun). Cast female, provisional.",
        direction="One dark joke, said low on deck so the master hears it: 'One wing gone. It'll be in a mood.'",
        why="bf_alice is an unused allowed voice; the master is a lowered male blend, so the exchange in R9 has two clearly different voices.", priority=5)),
    ("KEEPER", dict(
        blend=[("am_liam", 0.5), ("bm_lewis", 0.5)], speed=1.0, lang="en-us", pitch=1.0,
        gender_basis="The script says 'his coat' (R10). A man; no age set.",
        direction="A second ground keeper: 'Oh, shit.' under his breath (R6); dry and low with the flask (R10).",
        why="Blend of two allowed male voices whose roles are in Cling (GUARD, MUSICIAN); he speaks only on the riding grounds, next to the GROUND KEEPER (am_fenrir), whom it must not resemble. Pitched up a semitone.", priority=5)),
    ("INSTRUCTOR", dict(
        blend=[("am_adam", 0.5), ("bm_daniel", 0.5)], speed=0.95, lang="en-gb", pitch=-1.0,
        gender_basis="The script says 'claps his hands' (X16). A man; no age set.",
        direction="A riding instructor ending a lesson as a personal caution, not an order to the island: 'That's enough for today. Walk them home.'",
        why="Blend of two allowed male voices used only in Cling (WATCHMAN, GUARD CAPTAIN); he speaks once, at the Verdor harbor.", priority=5)),
    ("OLD WOMAN", dict(
        voice="bf_isabella", speed=0.88, lang="en-gb", pitch=-1.5, gender_basis="The script: an old woman.",
        direction="Teaches the children's dance with patient authority ('Not faster. Together.'); calls 'Together!' over the music; whispers 'Stay close.' after the attack.",
        why="bf_isabella is an unused allowed voice; slowed and lowered for age.", priority=4)),
    ("PARTNER", dict(
        voice="af_sarah", speed=1.0, lang="en-us", pitch=0.0, gender_basis="The script says 'her' (X22, R13).",
        direction="Warm, teasing, comfortable with her husband: 'Leave some for the king.' and, low, for him only, 'Some of us like a man who takes his time.'",
        why="af_sarah is an unused allowed voice and differs from the PARENT (af_aoede), the other mother in the square.", priority=4)),
])
RECAST = {
    "ADULT VILLAGER": dict(
        blend=[("am_eric", 0.6), ("am_fenrir", 0.4)], speed=1.0, lang="en-us", pitch=-1.0,
        gender_basis="The final script makes the villager a man ('his family', 'him', 'He laughs into his cup'; X14, X20, R11, X25, X26, R16). ../voices.json cast the handoff's single line female because the handoff gave no pronoun; that casting had no recorded take.",
        direction="A farmer with a cart and a family: grumbling at the gate (X14), teasing at the table (X20), then injured, conscious and frightened ('My family—', 3C).",
        why="Blend of two allowed male voices whose roles speak only in Verdor (ROYAL MESSENGER, GROUND KEEPER), a semitone down.", priority=4),
}
# Performance presets for the new lines, from their bracket notes and text (../voices.json special_lines style).
PRESETS = [("whispered", "whisper"), ("singing", "sung"), ("through pain", "pain"), ("under his breath", "quiet"),
           ("quietly", "quiet"), ("low", "quiet"), ("to himself", "quiet"), ("to herself", "quiet"),
           ("calling", "raised_voice"), ("louder", "raised_voice")]
SHOUTED = {"X9-02", "X16-01", "X26-01", "R14-01", "X22-07"}
PRESET_HOW = {
    "whisper": "As L011 in ../voices.json: the role's voice at speed 0.8, then the whisper DSP (noise shaped by the smoothed spectral envelope, ~10% voiced, high-pass 250 Hz); mix 10-12 dB under dialogue. A real whisper recorded by a person is better.",
    "quiet": "Speed x0.95, -4 to -6 dB in the mix, close and dry. Kokoro has no 'quiet' control; the level and closeness carry it.",
    "raised_voice": "As L070 in ../voices.json: speed x1.08, +3 dB presence at 2-4 kHz, gentle saturation, +3 to +4 dB in the mix; let the wind, the crowd or the music partly cover it.",
    "pain": "As L072 in ../voices.json: a breath before the line, breathy and shaky, slightly higher pitch, narrower tone.",
    "sung": "Kokoro cannot sing. Record this line with a person (recommended), or use a spoken-rhythm TTS take labelled TEMP in the animatic. The tune is newly written for the series; no existing song may be used.",
}
# DRAGONS.md: no species, every dragon is its own design. Replaces ../voices.json creature_vocals[*].species.
DESIGN = {
    "CHARCOAL": "Charcoal's own design (no species, DRAGONS.md): completely black, blue eyes, immense (about 36 m long)",
    "LEAF": "Leaf's own design (no species, DRAGONS.md): dark green, not fully grown, about a quarter of Charcoal's size",
    "STARLIGHT": "Starlight's own design (no species): albino, reflective white scales ('Queen of Dragons'), about twice Charcoal's size",
    "SCOUT": "The scout's own design (no species): small, extremely fast",
    "HATCHLING": "The gold hatchling's own design (no species): 24-karat gold, newborn",
}
SPECIES_WORDS = ("Bashion", "Bashions", "Nightwings", "Slitherwing")
APPROVED_HOW = ("Speak byte-exact: Daxtyn approved this wording on %s (CHANGED %s). The old wording \"%s\"%s is not recorded. "
                "The subtitle text never changes.")

NON_VERBAL = OrderedDict([
    ("rider_scream_1F", "C14: the burned scout rider screams, a raw, wordless sound loud enough to carry over the wind. Keep the voice unidentifiable (no gender or age cue that could point at an identity; CANON LOCK 11): a processed human scream layered with wind, not a TTS line."),
    ("scout_cry_1F", "C15/C16: the scout dragon's scream as the wing tears (creature_vocals.SCOUT)."),
    ("abby_cry_X12", "X12: Abby's short, sharp cry as the arm is set, cut off by her own breath. Human recording strongly recommended; TTS cannot do it."),
    ("crowd_3C", "3C/X25/X26: crowd screams and calls, built from many short human takes (a volunteer group recording, or CC0 crowd libraries recorded in the manifest), never one looped scream."),
    ("breaths", "Breaths and efforts (the climb in X3, the gate in X14, the beam in X28) are recorded or taken from CC0 libraries, not synthesized."),
])


def load(p):
    with open(p, encoding="utf-8") as f:
        return json.load(f)


def voice_label(spec):
    if "blend" in spec:
        return "+".join("%s:%.2f" % (v, w) for v, w in spec["blend"])
    return spec["voice"]


def creature_vocals(cv):
    out = OrderedDict()
    for k, v in cv.items():
        if isinstance(v, dict) and "species" in v:
            v = OrderedDict((("design", DESIGN[k]) if kk == "species" else (kk, vv)) for kk, vv in v.items())
        out[k] = v
    return out


def build():
    src, dl, takes = load(SRC_VOICES), load(DIALOGUE), load(TAKES)
    lines = dl["lines"]
    by_role = OrderedDict()
    for x in lines:
        by_role.setdefault(x["speaker"], []).append(x)
    roles = OrderedDict()
    used = {}
    for name, xs in by_role.items():
        stats = OrderedDict([("lines", len(xs)), ("words", sum(x["words"] for x in xs)),
                             ("est_seconds", round(sum(x["est_seconds"] for x in xs), 1)),
                             ("scenes", list(dict.fromkeys(x["scene"] for x in xs))),
                             ("parts", sorted({x["rating_pass"] or x["addition"] for x in xs if x["addition"] or x["rating_pass"]},
                                              key=lambda u: (u[0], int(''.join(c for c in u[1:] if c.isdigit())))))])
        if name in src["roles"] and name not in RECAST:
            r = OrderedDict(src["roles"][name])
            r.update(stats)
            r["casting_source"] = "kept from ../voices.json (unchanged, so the preview takes stay valid)"
            if name in takes["roles"]:
                t = takes["roles"][name]
                if (t["voice"], t["role_speed"]) != (r["primary"]["voice"], r["primary"]["speed"]):
                    raise SystemExit("%s: ../voices.json and preview takes.json disagree" % name)
                r["preview_takes"] = "%d preview take(s) already use this voice (preview/vo/takes.json)" % t["lines"]
            aud = next((x for x in xs if x["id"] == r.get("audition_line")), None)
            if aud and aud["creator_approved"]:
                r["audition_note"] = ("The audition of %s was measured with its old wording (\"%s\"); the final script uses the wording "
                                      "Daxtyn approved on %s. The voice choice stands." % (aud["id"], aud["was_text"], aud["creator_approved"]))
        else:
            spec = NEW_ROLES.get(name) or RECAST.get(name)
            if spec is None:
                raise SystemExit("no casting for new role %s" % name)
            primary = OrderedDict([("engine", "kokoro")])
            if "blend" in spec:
                primary["voice"] = voice_label(spec)
                primary["blend"] = [OrderedDict([("voice", v), ("weight", w)]) for v, w in spec["blend"]]
                primary["blend_how"] = "style = sum(weight x voices-v1.0.bin[voice]) (each a 510x256 array); pass the array as the voice to kokoro-onnx create()."
            else:
                primary["voice"] = spec["voice"]
            primary.update([("speed", spec["speed"]), ("lang", spec["lang"]), ("pitch_semitones", spec["pitch"])])
            r = OrderedDict([("display_name", name.title().replace("'S", "'s")), ("provisional", True)])
            r.update(stats)
            r.update([("gender_basis", spec["gender_basis"]), ("direction", spec["direction"]), ("primary", primary),
                      ("license", LICENSE), ("audition_line", max(xs, key=lambda x: x["words"])["id"]),
                      ("human_recording_priority", spec["priority"]), ("why", spec["why"]),
                      ("audition_status", "NOT AUDITIONED. Generate the audition line and compare it with every role it shares a scene with before any take is approved."),
                      ("casting_source", "recast for the final script (was af_jessica in ../voices.json)" if name in RECAST else "new role in the final script")])
        key = (r["primary"]["voice"], r["primary"].get("pitch_semitones", 0.0))
        if key in used:
            raise SystemExit("%s and %s share a voice %r" % (name, used[key], key))
        used[key] = name
        parts = [b["voice"] for b in r["primary"].get("blend", [])] or [r["primary"]["voice"]]
        for v in parts:
            if v not in KOKORO_EN or v in AVOID:
                raise SystemExit("%s uses %s, which is not an allowed Kokoro English voice" % (name, v))
        roles[name] = r
    # plain voices must be unique across roles too (a blend may reuse a parent at a different weight)
    plain = [r["primary"]["voice"] for r in roles.values() if "blend" not in r["primary"]]
    if len(plain) != len(set(plain)):
        raise SystemExit("two roles share a plain voice: %r" % plain)

    by_id = {x["id"]: x for x in lines}
    special = OrderedDict()
    for k, v in src["special_lines"].items():
        v = OrderedDict(v)
        if "how" in v:
            v["how"] = v["how"].replace("respelling of 'Bashion' is allowed", "respelling is allowed")
        x = by_id.get(k)
        if x and x["text"] != v["text"]:
            if not x["creator_approved"]:
                raise SystemExit("%s: ../voices.json special_lines text differs from the final script, and the final wording is not creator-approved" % k)
            v.update([("text", x["text"]), ("original", False), ("type", "approved_exact"),
                      ("how", APPROVED_HOW % (x["creator_approved"], x["changed_by"], x["was_text"],
                                              " (his [ORIGINAL] line)" if x["was_original"] else ""))])
        special[k] = v
    for x in lines:
        if x["origin"] == "original":
            continue
        note = (x["performance_note"] or "").lower()
        preset = next((p for key, p in PRESETS if key in note), None)
        if x["id"] in SHOUTED:
            preset = "raised_voice"
        if preset:
            special[x["id"]] = OrderedDict([("speaker", x["speaker"]), ("text", x["text"]), ("original", False),
                                            ("type", preset), ("how", PRESET_HOW[preset])])
    old_takes = {t["id"]: t for t in takes["takes"]}
    for x in lines:
        if x["creator_approved"] and x["id"] not in special:
            special[x["id"]] = OrderedDict([("speaker", x["speaker"]), ("text", x["text"]), ("original", False), ("type", "approved_exact"),
                                           ("how", APPROVED_HOW % (x["creator_approved"], x["changed_by"], x["was_text"], ""))])
        if x["creator_approved"] and x["id"] in old_takes and old_takes[x["id"]]["text"] != x["text"]:
            special[x["id"]]["preview_take"] = ("OUT OF DATE: preview/vo/takes.json has a take of the old wording. Make a new take of "
                                                "this wording before the line is used in the final animatic.")
    for x in lines:
        if x["pending"]:
            special.setdefault(x["id"], OrderedDict([("speaker", x["speaker"]), ("text", x["text"]), ("original", x["original"])]))
            special[x["id"]]["pending"] = ("DRAGONS.md keeps this line as written until Daxtyn chooses new wording: record it as written. "
                                           "If he picks the proposed alternative, record that too: \"%s\"." % x["pending_alternative"])

    pron = []
    words = {w: [] for w in SPECIES_WORDS}
    for x in lines:
        for wd in words:
            if any(t.strip(".,?!") == wd for t in x["text"].split()):
                words[wd].append(x["id"])
    if any(words.values()):
        raise SystemExit("a final line still speaks a scrapped species word: %r" % {w: v for w, v in words.items() if v})
    for p in src["pronunciation"]:
        p = OrderedDict(p)
        if p["word"] in words:
            continue        # no longer spoken (see the note below)
        names = [w.strip() for w in p["word"].split(",")]
        if len(names) > 1 and any(w in words for w in names):
            p["word"] = ", ".join(w for w in names if w not in words)
        pron.append(p)
    pron.insert(0, OrderedDict([("word", ", ".join(SPECIES_WORDS)), ("in_lines", []),
                                ("status", "Not spoken in the final script: Daxtyn approved new wording for every line that used these "
                                           "scrapped species names (2026-10-18; final/CHANGES.md section 9). ../voices.json still lists them for the handoff.")]))

    allowed_unused = [v for v in KOKORO_EN if v not in AVOID and v not in plain and not any(
        v == b["voice"] for r in roles.values() for b in r["primary"].get("blend", []))]
    out = OrderedDict([
        ("schema", "dragons-kingdom/voices v0.2 (final script)"),
        ("episode", "S01E01"), ("series", "Dragon's Kingdom"),
        ("status", "PROVISIONAL casting for the locked shooting script. Nothing here is approved by Daxtyn. No final dialogue has been recorded. The 18 handoff roles keep their ../voices.json voices, except the ADULT VILLAGER (recast, see his entry); the 8 new roles are cast here and have not been auditioned."),
        ("generated_by", "episodes/s01e01/tools/final_voices.py"),
        ("source", OrderedDict([("dialogue", "episodes/s01e01/final/dialogue.json"), ("dialogue_source_sha256", dl["source_sha256"]),
                                ("casting_base", "episodes/s01e01/voices.json"), ("preview_takes", "episodes/s01e01/preview/vo/takes.json")])),
        ("rules", src["rules"][:2] + [
            "The text sent to TTS is final/dialogue.json 'text' with the 'pronunciation' respellings applied (and a leading or trailing em dash removed). Subtitles always use the unmodified 'text'.",
            "[ORIGINAL] lines %s are spoken word for word." % ", ".join(x["id"] for x in lines if x["original"]),
            "Lines in the wording Daxtyn approved on 2026-10-18 (%s) are spoken word for word in that wording; the old wording is never recorded (see special_lines). L048 replaces his [ORIGINAL] line." % ", ".join(x["id"] for x in lines if x["creator_approved"]),
        ] + src["rules"][4:] + [
            "Blended voices (primary.blend) are new: audition each against every role in its scenes before approving a take.",
            "Only Kokoro English voices with Apache-2.0 weights are used, and not the ones ../voices.json avoids (named after a commercial product's voice, or am_santa).",
        ]),
        ("engines", src["engines"]),
        ("render_defaults", src["render_defaults"]),
        ("pronunciation", pron),
        ("roles", roles),
        ("special_lines", special),
        ("non_verbal_human", NON_VERBAL),
        ("creature_vocals", creature_vocals(src["creature_vocals"])),
        ("human_recordings", src["human_recordings"]),
        ("voice_pool", OrderedDict([
            ("kokoro_english_voices", len(KOKORO_EN)), ("avoided", sorted(AVOID)),
            ("plain_voices_used", len(plain)), ("blends", sum(1 for r in roles.values() if "blend" in r["primary"])),
            ("allowed_and_still_unused", allowed_unused),
            ("note", "All nine allowed male voices were already cast; any further male role needs another blend or a human recording."),
        ])),
        ("totals", OrderedDict([("roles", len(roles)), ("lines", len(lines)),
                                ("est_seconds", round(sum(x["est_seconds"] for x in lines), 1))])),
    ])
    return json.dumps(out, indent=2, ensure_ascii=False) + "\n"


def main(argv):
    content = build()
    if "--check" in argv:
        ok = os.path.exists(OUT) and open(OUT, encoding="utf-8").read() == content
        print("up to date" if ok else "STALE: final/voices.json")
        return 0 if ok else 1
    with open(OUT, "w", encoding="utf-8") as f:
        f.write(content)
    d = json.loads(content)
    print("roles: %d (blends %d), lines %d; unused allowed voices: %s" % (
        d["totals"]["roles"], d["voice_pool"]["blends"], d["totals"]["lines"], ", ".join(d["voice_pool"]["allowed_and_still_unused"]) or "none"))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
