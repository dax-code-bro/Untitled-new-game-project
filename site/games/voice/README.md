# Voices

451 lines, about 17,000 characters of speech. Every one of them can be a
real recording.

## How it works

`lines.csv` and `lines.json` list every spoken line in the game with an
`id`, who says it, and the exact words. Save a recording as `<id>.mp3` in
this folder and the game plays it instead of a synthesised voice.

The id comes from the speaker and the exact text, so it never drifts out of
step with the script — but it also means **changing a line's wording changes
its id**. Re-run `node tools/voice-lines.js` after editing dialogue and
re-record anything that moved.

Nothing has to be finished. A line with no recording falls back to the
device's own voice, and below that to the engine's synthesiser, so a
half-done voice pack is a game with some lines acted and the rest spoken —
never a game with silent characters.

## Doing it

    node tools/voice-lines.js     # list every line (run after editing dialogue)
    # ... record or generate the mp3s into this folder ...
    node tools/voice-have.js      # tell the game which ones exist

`voice-have.js` writes `have.json`, which the game fetches once at boot.
Without it, nothing plays — a missing `have.json` means "no pack".

## Where to get voices

**ElevenLabs** (elevenlabs.io) — the best of them, and its Voice Library has
thousands of character voices to pick from rather than designing one. The
whole game is about 17k characters, so one month of the cheapest paid tier
covers it, or the free tier across two or three months.

**Azure Neural TTS** — very good, a generous free tier, lots of accents.

**OpenAI TTS** — cheap and natural, but around ten voices, so ten characters
would start to overlap.

**Piper** (github.com/rhasspy/piper) — free, open source, runs on your own
machine with no account. Rougher than the paid services and far better than
anything built into a browser.

**People.** Ten characters and 451 lines is an afternoon with friends and a
phone. For an eighty-five-year-old Soviet officer, a nineteen-year-old who
has been hiding in an empty house for two days, and a pilot who has never
flown an aircraft, a real person having a go will beat any of the above.

## The cast

| id | who | lines |
|----|-----|-------|
| `adams` | Cpl. Adams — 85, Soviet officer, never got the order to leave | 38 |
| `carlos` | Kept the generators running at the depot | 38 |
| `sam` | Supply driver. Dry, quick, hard to rattle | 37 |
| `chrissy` | 19. Was hunting with her father until he started acting strange | 38 |
| `rebecca` | 40. Twenty years of them in a ring or a cage | 37 |
| `hank` | Big. Enjoys the work more than he should | 36 |
| `frank` | 80. Stepped through something in 1855 that should not have been open | 38 |
| `chris` | An IQ of 240 and no instinct for when to stop explaining | 38 |
| `remi` | Never lets a bad moment pass without a remark | 38 |
| `rodriguez` | Walks in like the room has been waiting for him | 38 |
| `patch` | Cpl. "Patch" Okafor — in the bunker with you | 27 |
| `radio` | The Nightwatchman — a man on the other end of a set | 28 |
| `stalker` | Close, low, and mostly air | 5 |
| `exit42` | Exit Four Two. He is not a pilot. That is the whole of it | 9 |
| `common` | Anything a character has nothing of their own to say about | 6 |
