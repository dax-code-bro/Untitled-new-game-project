#!/bin/bash
# Emit every gait and splice it into the two clip files. The keyframe
# tables in the engine are generated; this is what regenerates them.
set -e
cd "$(dirname "$0")/../.."
node engine/tools/gait-emit.js > /tmp/gait-clips.txt
python3 - <<'PY'
import re
new = open('/tmp/gait-clips.txt').read()
blocks = {m.group(1): m.group(0) for m in
          re.finditer(r"  clips\.push\(buildClip\('(\w+)'.*?\n  \}[^\n]*\)\);\n", new, re.S)}
assert len(blocks) == 14, sorted(blocks)
for path in ('engine/src/90-animation.js', 'engine/src/99-zombie-anim.js'):
    src = open(path).read()
    hit = 0
    for name, text in blocks.items():
        key = "clips.push(buildClip('%s'" % name
        if key not in src: continue
        i = src.index(key); i = src.rindex('\n', 0, i) + 1
        j = re.compile(r"\n  \}[^\n]*\)\);\n").search(src, i).end()
        src = src[:i] + text + src[j:]
        hit += 1
    open(path, 'w').write(src)
    print(path, hit, 'clips')
PY
node engine/build.js
