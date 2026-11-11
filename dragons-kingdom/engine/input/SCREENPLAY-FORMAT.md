# Writing a screenplay for the engine

Put the screenplay in `episodes/<ep>/input/screenplay.fountain`. It is plain text in [Fountain](https://fountain.io) style. The engine reads only the part described here, and it never changes anything in `input/`.

```
Title: Dragon's Kingdom
Episode: S01E02
Rating: mature

EXT. CLING VILLAGE SQUARE — MORNING #2A#

The square the morning after. Smoke still rises from the north roofs.

ABBY
(quietly)
Is anyone left?

VENDOR
Enough.

[[ONSCREEN: CLING — THE MORNING AFTER]]
```

## The rules
1. **Title page:** the first lines are `Key: value` lines, followed by a blank line. `Episode:` names the episode.
2. **Scene heading:** a line starting with `INT.`, `EXT.`, `EST.` or `INT./EXT.` has a blank line above it. It ends with a scene number between `#` signs, such as `#2A#`. Every scene needs a number, and no two scenes can share one. Shots refer to scenes by this number.
3. **Dialogue:** this has three parts.
   - **Cue:** the speaker's name in capitals on its own line, with a blank line above it. `(V.O.)`, `(O.S.)` and `(CONT'D)` after the name are allowed.
   - **Parenthetical (optional):** a note in brackets on the next line, such as `(quietly)`. It becomes the performance note. `(to Remi)` names who the line is spoken to. The words `whispered`, `quietly`, `low` and `through pain` slow the timing estimate.
   - **Line:** the spoken words, on one or more lines, ending at a blank line.
4. **Action:** any other paragraph. The paragraph just before a line becomes that line's context for the actor.
5. **On-screen text:** `[[ONSCREEN: text]]` makes a caption card. Any other `[[note]]` and anything inside `/* ... */` is ignored.
6. **Names:** speakers must be characters the engine knows. These come from `CHARACTERS.md` and the cast in `CHATGPT-SHOTLIST-PROMPT.md`. An unknown speaker is an error.

## Line ids
- **First run:** the engine numbers the spoken lines `L001`, `L002` and so on, and stores them in `final/lines.lock.json`.
- **Edits:** if you add, cut or reorder lines elsewhere, the existing lines keep their ids. The key is scene + speaker + the words, ignoring capitals and punctuation.
- **New lines:** a new line, or a line whose words changed, gets the next unused number. An id is never reused.

## Then
1. Write the shot list (`CHATGPT-SHOTLIST-PROMPT.md` helps).
2. Run `node engine/input/validate.mjs --episode <ep> --write`.
3. Read `final/validation.md`.
