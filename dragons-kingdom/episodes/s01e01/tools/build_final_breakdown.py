#!/usr/bin/env python3
"""Rebuild (or, with --check, verify) the whole breakdown of the locked shooting script, in order:

  1. tools/check_final.py                     the script itself must pass (exit 0)
  2. tools/extract_final_dialogue.py           final/dialogue.json, dialogue.md, onscreen-text.json
  3. tools/final_voices.py                     final/voices.json
  4. tools/shotlist/final_build.py             final/shotlist.json, shotlist.md
  5. tools/shotlist/final_render_schedule.py   final/render-schedule.md, render-jobs.json

final/assets-delta.md is written by hand; re-read it when the script or the libraries change.

Usage: python3 tools/build_final_breakdown.py [--check]      (standard library only)
"""
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
STEPS = [
    [os.path.join(HERE, 'check_final.py')],
    [os.path.join(HERE, 'extract_final_dialogue.py')],
    [os.path.join(HERE, 'final_voices.py')],
    [os.path.join(HERE, 'shotlist', 'final_build.py')],
    [os.path.join(HERE, 'shotlist', 'final_render_schedule.py')],
]


def main(argv):
    check = '--check' in argv
    for k, step in enumerate(STEPS):
        args = [sys.executable] + step + (['--check'] if check and k > 0 else [])
        r = subprocess.run(args, capture_output=True, text=True)
        tail = (r.stdout.strip().splitlines() or [''])[-1]
        print('%-34s exit %d  %s' % (os.path.relpath(step[0], HERE), r.returncode, tail[:150]))
        if r.returncode != 0:
            sys.stdout.write(r.stdout[-3000:] + r.stderr[-3000:])
            return 1
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
