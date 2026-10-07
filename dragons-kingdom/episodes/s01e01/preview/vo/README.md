# Preview voice takes (S01E01, PROLOGUE through 1E)

These are temporary computer-voice takes for the work-in-progress preview video. They cover every
spoken line from L001 to L078: the narrator's prologue through Remi's "Attack." in 1E. They are **not
approved**. Any line can be replaced by a real recording, and that is recommended for Abby, Remi,
Alexandria and the narrator.

- `L001.wav` … `L078.wav`: one dry take per line.
  - Format: 48 kHz, mono, 24-bit.
  - Level: speech at −20 dBFS RMS, peaks ≤ −3 dBFS.
  - The WAVs are not in git. Rebuild them with `../tools/make_vo.py`, which gives byte-identical
    files on every run.
- `takes.json`: one record per line. It holds the role, the voice and its settings, the exact text
  from `dialogue.json`, the performance treatment and why, mix hints, duration, sentence timings,
  level and sha256. The `checks` section holds the verification results.
- `words.json`: word start/end times inside each file, from forced alignment. Use them for subtitle
  timing and mouth shapes.

## Performance treatments

- **Whisper:** Alexandria's [ORIGINAL] "My pretty little weapon". The voicing is removed, not just
  turned down.
- **Quiet:**
  - L020 "There."
  - L062 "That's enough."
- **Shout:**
  - L070 "Abby!"
  - L071 "Look at me. Abby!"
- **Raised voice:** L037, called across the field.
- **Pain:** Abby from 1E's "My arm—" onward (L072, L075, L077).
  - Breath before the line, breathy and shaky, slightly higher pitch, narrower tone.
  - L072 is cut off before the end of "arm".
- **Firm command:** L078 "Attack." (a physical attack, no flame).

Every take has the same level. How loud each one should sound (whisper −11 dB, quiet −5.5 dB,
shout +3.5 dB, …) is in `takes.json` → `mix.gain_db`. Reverb and the wind bed for flying lines are
added in the mix, never baked into the takes.

## Replacing a line with a real recording

Record the line; `../../audio-plan.md`, "How to record voices at home", explains how. A human take
follows the path in `audio-plan.md` section 4:

1. It goes to `audio/vo/human/<role>/<line_id>_take<N>.wav`.
2. It is converted to this same format and level.
3. It takes this file's place on the timeline.

Do not overwrite the files here. Their sha256 values in `takes.json` would no longer match, and the
check would fail.

Keep one voice per role: if a person records a role, they should record all of that role's lines.

Licenses for every voice and tool: `../LICENSES.md`.
