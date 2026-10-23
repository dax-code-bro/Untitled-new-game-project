#!/usr/bin/env python3
"""refresh_vo_sources.py - bring the source record of ../vo/takes.json up to date WITHOUT re-rendering, when
the only edits to a source file since the takes were made cannot change any take (notes, status texts).

takes.json records the sha256 of every file the takes were made from (its "sources" block). Editing a note in
voices.json changes that file's sha256, so a provenance check would call every take out of date although no
take would come out differently. This tool proves that, and only then rewrites the record:

  1. For each source whose sha256 differs, it finds the exact version the takes were made from in git history
     (the commit whose file has the recorded sha256). Only voices.json can be refreshed this way: for any other
     source, re-render with make_final_vo.py.
  2. It compares the RENDER DIGEST of the old and the new voices.json: the parts make_final_vo.py and the
     preview's make_vo.py read to make a take - pronunciation, render_defaults, engines, every role's primary
     voice (voice, blend, weights, lang, speed, pitch) and sentence gap, and every special line's type and its
     "x0.95" speed flag. Equal digest = no take can change.
  3. It verifies every take file (vo/*.wav, the placeholders too) against the sha256 in takes.json.
  4. Only then it writes the new sha256 and the digest into "sources", adds a dated "sources_refreshed" entry,
     and changes nothing else in takes.json (byte for byte).

  python3 -I refresh_vo_sources.py            refresh (exit 1 and no change when anything does not hold)
  python3 -I refresh_vo_sources.py --check    report only: exit 1 if the record is out of date

Standard library only (no numpy / Kokoro needed). Run it from anywhere inside the git checkout.
"""
import datetime
import hashlib
import json
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent            # episodes/s01e01/final/tools
FINAL = HERE.parent
TAKES = FINAL / "vo" / "takes.json"
REFRESHABLE = {"voices.json"}


def sha256_bytes(b):
    return hashlib.sha256(b).hexdigest()


def git(*args, cwd=FINAL):
    r = subprocess.run(["git", *args], cwd=cwd, capture_output=True)
    return r.stdout if r.returncode == 0 else None


def repo_root():
    out = git("rev-parse", "--show-toplevel")
    return Path(out.decode().strip()) if out else None


def find_version(rel_path, want_sha):
    """The bytes of rel_path (repo-relative) at the commit whose version has sha256 want_sha, or None."""
    log = git("log", "--format=%H", "--", rel_path, cwd=repo_root())
    for c in (log or b"").decode().split():
        blob = git("show", f"{c}:{rel_path}", cwd=repo_root())
        if blob is not None and sha256_bytes(blob) == want_sha:
            return c, blob
    return None, None


def render_digest(v):
    """sha256 of the parts of voices.json that decide how a take sounds (see the module docstring)."""
    part = {
        "pronunciation": v.get("pronunciation"),
        "render_defaults": v.get("render_defaults"),
        "engines": v.get("engines"),
        "roles": {r: {"primary": x.get("primary"), "sentence_gap_s": x.get("sentence_gap_s")} for r, x in v.get("roles", {}).items()},
        "special_lines": {k: {"type": x.get("type"), "speed_x095": "x0.95" in (x.get("how") or "")}
                          for k, x in v.get("special_lines", {}).items()},
    }
    return sha256_bytes(json.dumps(part, sort_keys=True, ensure_ascii=False).encode()), part


def diff_parts(a, b, path=""):
    if isinstance(a, dict) and isinstance(b, dict):
        out = []
        for k in sorted(set(a) | set(b)):
            out += diff_parts(a.get(k), b.get(k), f"{path}.{k}" if path else k)
        return out
    return [] if a == b else [path]


def main(argv):
    check_only = "--check" in argv
    raw = TAKES.read_text(encoding="utf-8")
    doc = json.loads(raw)
    if json.dumps(doc, indent=1, ensure_ascii=False) + "\n" != raw:
        print("takes.json is not in make_final_vo.py's own layout: refusing to rewrite it (run make_final_vo.py).")
        return 1
    root = repo_root()
    stale = []
    for name, rec in doc["sources"].items():
        p = root / rec["path"] if root else None
        if not p or not p.is_file():
            print(f"{name}: {rec['path']} is missing")
            stale.append((name, None))
            continue
        now = sha256_bytes(p.read_bytes())
        if now != rec["sha256"]:
            stale.append((name, now))
    if not stale:
        print("takes.json sources: all up to date")
        return 0
    for name, now in stale:
        print(f"{name}: recorded {doc['sources'][name]['sha256'][:12]}, now {now[:12] if now else 'missing'}")
    if check_only:
        print("out of date: run refresh_vo_sources.py (if only notes changed) or make_final_vo.py")
        return 1

    problems, notes = [], []
    for name, now in stale:
        rec = doc["sources"][name]
        if name not in REFRESHABLE or not now:
            problems.append(f"{name}: changed - only {', '.join(sorted(REFRESHABLE))} can be refreshed without re-rendering; run make_final_vo.py")
            continue
        commit, old = find_version(rec["path"], rec["sha256"])
        if old is None:
            problems.append(f"{name}: the version the takes were made from ({rec['sha256'][:12]}) is not in git history - cannot prove nothing audible changed")
            continue
        d_old, p_old = render_digest(json.loads(old))
        d_new, p_new = render_digest(json.loads((root / rec["path"]).read_text(encoding="utf-8")))
        if d_old != d_new:
            problems.append(f"{name}: parts that change takes differ from commit {commit[:8]}: {', '.join(diff_parts(p_old, p_new)[:8])} - re-render those lines")
            continue
        notes.append((name, commit, now, d_new))
    # every take file, against takes.json
    files = [(t["id"], t["file"], t["sha256"]) for t in doc["takes"]] + \
            [(t["id"], t["file"], t["sha256"]) for t in doc.get("nonverbal_placeholders", [])]
    missing = [f for _, f, _ in files if not (FINAL / f).is_file()]
    bad = [i for i, f, h in files if (FINAL / f).is_file() and sha256_bytes((FINAL / f).read_bytes()) != h]
    if missing:
        problems.append(f"{len(missing)} take file(s) are not on this computer (e.g. {missing[0]}): run this where the takes are")
    if bad:
        problems.append(f"{len(bad)} take file(s) differ from takes.json (e.g. {bad[0]}): run make_final_vo.py --verify")
    if problems:
        for p in problems:
            print("NOT REFRESHED:", p)
        return 1
    today = datetime.date.today().isoformat()
    log = doc.get("sources_refreshed", [])
    for name, commit, now, digest in notes:
        old_sha = doc["sources"][name]["sha256"]
        doc["sources"][name]["sha256"] = now
        doc["sources"][name]["render_digest"] = digest
        log.append({"date": today, "source": name, "from": old_sha, "to": now, "made_from_commit": commit[:12],
                    "why": f"only parts that do not change a take were edited (render digest equal); all {len(files)} take files "
                           f"verified against their sha256 - by final/tools/refresh_vo_sources.py, no take re-rendered"})
    # keep the key order of make_final_vo.py's record; the log goes right after "sources"
    out = {}
    for k, v in doc.items():
        if k == "sources_refreshed":
            continue
        out[k] = v
        if k == "sources":
            out["sources_refreshed"] = log
    TAKES.write_text(json.dumps(out, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    for name, commit, now, _ in notes:
        print(f"refreshed {name}: {now[:12]} (takes made from commit {commit[:8]}; render digest equal; {len(files)} take files verified)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
