#!/usr/bin/env bash
# Dragon's Kingdom - one-command setup for rendering on a Mac or a Linux PC.
#
#   bash setup.sh                       (from inside the project: dragons-kingdom/pc/setup.sh)
#   bash setup.sh --dir ~/DragonsKingdom   (anywhere else: clones the project there first)
#
# What it does (safe to run again any time - it skips what is done and continues
# where it stopped):
#   1. git, then the project: clone, or "git pull" of the branch below
#   2. Node.js 20 LTS (a private copy in pc/tools/node if the computer has none >= 20)
#   3. ffmpeg with libx264: on Linux a pinned static build in pc/tools/ffmpeg (SHA-256 checked, the
#      same ffmpeg 8.1.3 as the Windows setup); on a Mac Homebrew's (or evermeet.cx's) - not pinned
#   4. npm ci + Playwright's Chromium
#   5. Python 3.11 + Blender's Python module (bpy 4.2) in pc/.venv-bpy
#   6. every cache a render needs: node pc/build-caches.mjs (asset downloads, landscape
#      bakes, human characters, cloth bakes - the long step, 1-3 hours the first time)
#   7. the GPU self-test: node render/gpu-check.mjs
# The computer is kept awake during steps 6-7 (caffeinate on macOS, systemd-inhibit on Linux).
# Everything is logged to pc/logs/setup-<date>.log.
#
# Options: --dir DIR       where the project lives / is cloned (default: this script's project,
#                          else ~/DragonsKingdom)
#          --branch B      git branch (default claude/ultimate-ai-legend-KhpoT)
#          --no-pull       do not "git pull"
#          --skip-caches   stop before step 6 (and 7)      --skip-gpu-check   skip step 7
#          --python PATH   use this Python 3.11 for the bpy venv (or an existing bpy python)
#          --with-voice    also download the Kokoro voice models (optional)
set -u
set -o pipefail

# (everything runs inside main: with "curl ... | bash" the whole script is read before anything
#  runs, so no command can swallow the rest of it from stdin)
main() {
REPO_URL="${DK_REPO_URL:-https://github.com/dax-code-bro/Untitled-new-game-project.git}"
BRANCH="claude/ultimate-ai-legend-KhpoT"
NODE_MAJOR=20
UV_VERSION="0.5.11"
# pinned ffmpeg for Linux (pc/MANIFEST.md): BtbN month-end build of 2026-09-30, ffmpeg 8.1.3, GPL (libx264)
FF_BASE="https://github.com/BtbN/FFmpeg-Builds/releases/download/autobuild-2026-09-30-13-08"
FF_X64="ffmpeg-n8.1.3-9-g29e619e767-linux64-gpl-8.1";    FF_X64_SHA="97ce978979194b5cf7e06a5e68020dbdaa7a4f3294c5452b6a1bc347100dbb79"
FF_ARM64="ffmpeg-n8.1.3-9-g29e619e767-linuxarm64-gpl-8.1"; FF_ARM64_SHA="10523d1e0be6b3ce62a9708cc50815c4b5eb5f36ae147fbe2afeecda6f2d6845"
DIR=""; PULL=1; CACHES=1; GPUCHECK=1; PYTHON=""; VOICE=""
while [ $# -gt 0 ]; do
  case "$1" in
    --dir) DIR="$2"; shift 2;;
    --branch) BRANCH="$2"; shift 2;;
    --no-pull) PULL=0; shift;;
    --skip-caches) CACHES=0; GPUCHECK=0; shift;;
    --skip-gpu-check) GPUCHECK=0; shift;;
    --python) PYTHON="$2"; shift 2;;
    --with-voice) VOICE="--with-voice"; shift;;
    -h|--help) sed -n '2,30p' "$0" | sed 's/^# \{0,1\}//'; exit 0;;
    *) echo "unknown option: $1 (see --help)"; exit 1;;
  esac
done

OS="$(uname -s)"; ARCH="$(uname -m)"
STAMP="$(date +%Y-%m-%d-%H-%M-%S)"
TMPLOG="$(mktemp -t dk-setup.XXXXXX)"
exec > >(tee -a "$TMPLOG") 2>&1
STEP=0
step() { STEP=$((STEP+1)); echo; echo "==[ $STEP ]== $*"; }
ok()   { echo "   ok: $*"; }
note() { echo "   note: $*"; }
die()  { echo; echo "SETUP STOPPED: $*"; echo "Fix that, then run the same command again - it continues where it stopped."; [ -n "${LOG:-}" ] && echo "log: $LOG"; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }
dl()   { curl -fL --retry 3 --retry-delay 2 -o "$2" "$1"; }
sha256() { (sha256sum "$1" 2>/dev/null || shasum -a 256 "$1") | awk '{print $1}'; }

echo "Dragon's Kingdom setup ($OS $ARCH) - $(date)"

# ---- 1. git + project -------------------------------------------------------------------
step "git and the project"
if ! have git; then
  if [ "$OS" = "Darwin" ]; then die "git is missing: run  xcode-select --install  (or install Homebrew and: brew install git)"; fi
  if have apt-get; then sudo apt-get update && sudo apt-get install -y git curl xz-utils || die "could not install git"
  elif have dnf; then sudo dnf install -y git curl xz || die "could not install git"
  elif have pacman; then sudo pacman -S --noconfirm git curl xz || die "could not install git"
  else die "please install git with your package manager"; fi
fi
ok "$(git --version)"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -z "$DIR" ] && [ -f "$HERE/../package.json" ] && [ -d "$HERE/../render" ]; then
  PROJ="$(cd "$HERE/.." && pwd)"
else
  DIR="${DIR:-$HOME/DragonsKingdom}"
  if [ -d "$DIR/.git" ]; then :;
  elif [ -e "$DIR" ] && [ -n "$(ls -A "$DIR" 2>/dev/null)" ]; then die "$DIR exists and is not a git clone - choose another --dir"
  else
    echo "   cloning $REPO_URL (branch $BRANCH) into $DIR"
    git clone --branch "$BRANCH" "$REPO_URL" "$DIR" || die "git clone failed (internet? if the repository is private, sign in to GitHub when git asks)"
  fi
  PROJ="$DIR/dragons-kingdom"
fi
[ -f "$PROJ/package.json" ] || die "$PROJ does not look like the dragons-kingdom folder"
REPO="$(git -C "$PROJ" rev-parse --show-toplevel)"
mkdir -p "$PROJ/pc/logs"
LOG="$PROJ/pc/logs/setup-$STAMP.log"
cat "$TMPLOG" >> "$LOG"; exec > >(tee -a "$LOG") 2>&1
ok "project: $PROJ"
if [ "$PULL" = 1 ]; then
  CUR="$(git -C "$REPO" rev-parse --abbrev-ref HEAD)"
  if [ "$CUR" != "$BRANCH" ]; then
    if [ -z "$(git -C "$REPO" status --porcelain --untracked-files=no)" ]; then
      git -C "$REPO" fetch origin "$BRANCH" && git -C "$REPO" checkout "$BRANCH" || note "could not switch to $BRANCH (staying on $CUR)"
    else note "you are on $CUR with local changes - not switching to $BRANCH"; fi
  fi
  if git -C "$REPO" pull --no-rebase --ff-only origin "$BRANCH"; then ok "up to date with origin/$BRANCH ($(git -C "$REPO" log -1 --format='%h %s' | cut -c1-70))"
  else note "git pull did not work (offline, or local changes?) - continuing with what is here"; fi
fi
cd "$PROJ" || die "cannot cd to $PROJ"
TOOLS="$PROJ/pc/tools"; mkdir -p "$TOOLS"

# ---- 2. Node.js -----------------------------------------------------------------------------
step "Node.js $NODE_MAJOR LTS"
node_ok() { have node && [ "$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)" -ge "$NODE_MAJOR" ]; }
[ -x "$TOOLS/node/bin/node" ] && export PATH="$TOOLS/node/bin:$PATH"
if ! node_ok; then
  case "$OS-$ARCH" in
    Linux-x86_64) NP=linux-x64;; Linux-aarch64|Linux-arm64) NP=linux-arm64;;
    Darwin-arm64) NP=darwin-arm64;; Darwin-x86_64) NP=darwin-x64;;
    *) die "no Node.js download for $OS $ARCH - install Node.js $NODE_MAJOR from https://nodejs.org";;
  esac
  BASE="https://nodejs.org/dist/latest-v$NODE_MAJOR.x"
  SUMS="$(curl -fsSL "$BASE/SHASUMS256.txt")" || die "cannot reach nodejs.org"
  FILE="$(echo "$SUMS" | awk '{print $2}' | grep -E "^node-v[0-9.]+-$NP\.tar\.xz$" | head -1)"
  [ -n "$FILE" ] || die "no $NP build listed at $BASE"
  echo "   downloading $FILE"
  dl "$BASE/$FILE" "$TOOLS/$FILE" || die "download failed"
  WANT="$(echo "$SUMS" | grep " $FILE\$" | awk '{print $1}')"
  GOT="$( (shasum -a 256 "$TOOLS/$FILE" 2>/dev/null || sha256sum "$TOOLS/$FILE") | awk '{print $1}')"
  [ "$WANT" = "$GOT" ] || die "checksum of $FILE does not match"
  rm -rf "$TOOLS/node" && mkdir -p "$TOOLS/node" && tar -xJf "$TOOLS/$FILE" -C "$TOOLS/node" --strip-components 1 && rm -f "$TOOLS/$FILE"
  export PATH="$TOOLS/node/bin:$PATH"
fi
node_ok || die "Node.js $NODE_MAJOR+ is still not available"
ok "node $(node --version) ($(command -v node))"

# ---- 3. ffmpeg --------------------------------------------------------------------------------
step "ffmpeg (with libx264)"
# (output captured first: with pipefail, "ffmpeg | grep -q" fails when grep stops reading early)
ff_ok() { local f="${1:-ffmpeg}" out; out="$("$f" -hide_banner -encoders 2>/dev/null)" || return 1; case "$out" in *libx264*) return 0;; esac; return 1; }
FF=""
if [ "$OS" = "Linux" ]; then
  # always the pinned build (render/lib/tools.mjs uses pc/tools/ffmpeg before any other), so every
  # run and every computer encodes with the same ffmpeg and x264
  case "$ARCH" in x86_64) FN="$FF_X64"; FSHA="$FF_X64_SHA";; aarch64|arm64) FN="$FF_ARM64"; FSHA="$FF_ARM64_SHA";; *) FN=""; FSHA="";; esac
  if [ -n "$FN" ]; then
    if [ -x "$TOOLS/ffmpeg/bin/ffmpeg" ] && [ "$(head -1 "$TOOLS/ffmpeg/.dk-pin" 2>/dev/null)" = "$FN" ] && ff_ok "$TOOLS/ffmpeg/bin/ffmpeg"; then
      FF="$TOOLS/ffmpeg/bin/ffmpeg"; ok "pinned build $FN"
    else
      [ -d "$TOOLS/ffmpeg" ] && note "pc/tools/ffmpeg is not the pinned build - replacing it"
      echo "   downloading the pinned ffmpeg ($FN.tar.xz, about 150 MB)"
      rm -rf "$TOOLS/ffmpeg.new" "$TOOLS/ffmpeg.tar.xz"
      if dl "$FF_BASE/$FN.tar.xz" "$TOOLS/ffmpeg.tar.xz" && [ "$(sha256 "$TOOLS/ffmpeg.tar.xz")" = "$FSHA" ] \
        && mkdir -p "$TOOLS/ffmpeg.new" && tar -xJf "$TOOLS/ffmpeg.tar.xz" -C "$TOOLS/ffmpeg.new" --strip-components 1 \
        && rm -f "$TOOLS/ffmpeg.new/bin/ffplay" && echo "$FN" > "$TOOLS/ffmpeg.new/.dk-pin" && ff_ok "$TOOLS/ffmpeg.new/bin/ffmpeg"; then
        rm -rf "$TOOLS/ffmpeg" && mv "$TOOLS/ffmpeg.new" "$TOOLS/ffmpeg" && FF="$TOOLS/ffmpeg/bin/ffmpeg"
        ok "pinned build $FN (SHA-256 ok)"
      else
        note "the pinned ffmpeg could not be downloaded or did not match its SHA-256"
        rm -rf "$TOOLS/ffmpeg.new"
        if have ffmpeg && have ffprobe && ff_ok ffmpeg; then
          FF="$(command -v ffmpeg)"; note "using the installed $FF for now - NOT the pinned build; run the setup again later"
        fi
      fi
      rm -f "$TOOLS/ffmpeg.tar.xz"
    fi
  elif have ffmpeg && have ffprobe && ff_ok ffmpeg; then FF="$(command -v ffmpeg)"; note "no pinned ffmpeg for $ARCH: using $FF"
  fi
else
  # macOS: no pinned build (BtbN has none; the Mac hosts could not be fingerprinted from the cloud):
  # Homebrew's, or evermeet.cx's latest release. Its version is printed below and in the GPU check log.
  if [ -x "$TOOLS/ffmpeg/bin/ffmpeg" ] && ff_ok "$TOOLS/ffmpeg/bin/ffmpeg"; then FF="$TOOLS/ffmpeg/bin/ffmpeg"
  elif have ffmpeg && have ffprobe && ff_ok ffmpeg; then FF="$(command -v ffmpeg)"
  else
    if have brew; then brew install ffmpeg && FF="$(command -v ffmpeg)"; fi
    if [ -z "$FF" ]; then
      echo "   no Homebrew: downloading static ffmpeg + ffprobe (evermeet.cx; Intel build, runs on Apple Silicon via Rosetta)"
      mkdir -p "$TOOLS/ffmpeg/bin"
      dl https://evermeet.cx/ffmpeg/getrelease/zip "$TOOLS/ffmpeg.zip" && unzip -o -q "$TOOLS/ffmpeg.zip" -d "$TOOLS/ffmpeg/bin" && rm -f "$TOOLS/ffmpeg.zip"
      dl https://evermeet.cx/ffmpeg/getrelease/ffprobe/zip "$TOOLS/ffprobe.zip" && unzip -o -q "$TOOLS/ffprobe.zip" -d "$TOOLS/ffmpeg/bin" && rm -f "$TOOLS/ffprobe.zip"
      chmod +x "$TOOLS/ffmpeg/bin/"* 2>/dev/null; FF="$TOOLS/ffmpeg/bin/ffmpeg"
    fi
  fi
  note "macOS: this ffmpeg is not a pinned build (the version is in the line below)"
fi
[ -n "$FF" ] && ff_ok "$FF" || die "no ffmpeg with libx264 (Linux: sudo apt-get install ffmpeg; Mac: brew install ffmpeg)"
ok "$("$FF" -hide_banner -version | head -1 | cut -c1-60) ($FF)"

# ---- 4. npm packages + Chromium --------------------------------------------------------------
step "npm packages and the Chromium browser"
if node pc/build-caches.mjs --check --only node-modules >/dev/null 2>&1; then ok "npm packages already installed"
else npm ci --no-audit --no-fund || die "npm ci failed"; ok "npm ci done"; fi
if node pc/build-caches.mjs --check --only chromium >/dev/null 2>&1; then ok "Chromium already installed"
else
  npx playwright install chromium || die "npx playwright install chromium failed"
  if [ "$OS" = "Linux" ] && ! node pc/build-caches.mjs --check --only chromium >/dev/null 2>&1; then
    note "Chromium may need system libraries: sudo npx playwright install-deps chromium"
  fi
  ok "Chromium installed"
fi

# ---- 5. Python 3.11 + bpy ----------------------------------------------------------------------
step "Python 3.11 + Blender's Python module (bpy 4.2) in pc/.venv-bpy"
VENV="$PROJ/pc/.venv-bpy"; VPY="$VENV/bin/python"
is311() { [ -x "$1" ] || have "$1"; "$1" -c 'import sys; raise SystemExit(0 if sys.version_info[:2]==(3,11) and sys.maxsize>2**32 else 1)' 2>/dev/null; }
bpy_ok() { "$1" -c 'import bpy, numpy; assert bpy.app.version[:2]==(4,2)' >/dev/null 2>&1; }
if [ -n "$PYTHON" ] && bpy_ok "$PYTHON"; then
  BPY="$PYTHON"; ok "using the bpy Python given with --python: $BPY"
elif [ -x "$VPY" ] && bpy_ok "$VPY"; then
  BPY="$VPY"; ok "bpy $("$VPY" -c 'import bpy;print(bpy.app.version_string)') already installed"
else
  PY311=""
  for c in "$PYTHON" python3.11 /opt/homebrew/bin/python3.11 /usr/local/bin/python3.11 /usr/bin/python3.11; do
    [ -n "$c" ] && is311 "$c" && { PY311="$c"; break; }
  done
  if [ -n "$PY311" ] && "$PY311" -c 'import venv, ensurepip' >/dev/null 2>&1 && { [ -x "$VPY" ] || "$PY311" -m venv "$VENV"; } && [ -x "$VPY" ]; then
    ok "Python 3.11: $PY311"
    "$VPY" -m pip install --upgrade pip >/dev/null 2>&1
    "$VPY" -m pip install -r pc/requirements-bpy.txt || die "pip install bpy failed (needs ~1.5 GB free disk)"
  else
    # no usable Python 3.11: uv (a small, free Python manager) installs a private one
    UV="$TOOLS/uv/uv"
    if [ ! -x "$UV" ]; then
      case "$OS-$ARCH" in
        Linux-x86_64) UT=x86_64-unknown-linux-gnu;; Linux-aarch64|Linux-arm64) UT=aarch64-unknown-linux-gnu;;
        Darwin-arm64) UT=aarch64-apple-darwin;; Darwin-x86_64) UT=x86_64-apple-darwin;;
        *) die "install Python 3.11 (64-bit) and run again";;
      esac
      echo "   no Python 3.11 found: installing uv $UV_VERSION (Python manager) into pc/tools/uv"
      mkdir -p "$TOOLS/uv" && dl "https://github.com/astral-sh/uv/releases/download/$UV_VERSION/uv-$UT.tar.gz" "$TOOLS/uv.tgz" \
        && tar -xzf "$TOOLS/uv.tgz" -C "$TOOLS/uv" --strip-components 1 && rm -f "$TOOLS/uv.tgz" || die "could not download uv"
    fi
    export UV_PYTHON_INSTALL_DIR="$TOOLS/python"
    "$UV" python install 3.11 || die "uv could not install Python 3.11"
    [ -x "$VPY" ] || "$UV" venv --python 3.11 "$VENV" || die "could not create $VENV"
    "$UV" pip install --python "$VPY" -r pc/requirements-bpy.txt || die "installing bpy failed (needs ~1.5 GB free disk)"
  fi
  bpy_ok "$VPY" || die "bpy does not import in $VPY"
  BPY="$VPY"; ok "bpy $("$VPY" -c 'import bpy;print(bpy.app.version_string)') ready"
fi

# remember a bpy Python outside pc/.venv-bpy for later runs of pc/build-caches.mjs
if [ "$BPY" != "$VPY" ]; then echo "$BPY" > "$PROJ/pc/.bpy-python"; else rm -f "$PROJ/pc/.bpy-python"; fi

# ---- 6. caches -----------------------------------------------------------------------------------
# keep the computer awake during the long steps (only systemd-inhibit if this session may use it)
AWAKE=()
if have caffeinate; then AWAKE=(caffeinate -i)
elif have systemd-inhibit && systemd-inhibit --what=sleep:idle --why="test" true >/dev/null 2>&1; then
  AWAKE=(systemd-inhibit --what=sleep:idle --why="Dragon's Kingdom setup")
fi
if [ "$CACHES" = 1 ]; then
  step "caches: asset downloads, landscape bakes, human characters, cloth bakes (first time: 1-3 hours)"
  [ ${#AWAKE[@]} -gt 0 ] && echo "   the computer will not go to sleep while this runs (${AWAKE[0]})"
  ${AWAKE[@]+"${AWAKE[@]}"} node pc/build-caches.mjs --python "$BPY" $VOICE || die "some caches could not be made (see above; run again to retry - finished parts are kept)"
else
  step "caches skipped (--skip-caches): run  node pc/build-caches.mjs --python \"$BPY\"  later"
fi

# ---- 7. GPU self-test ----------------------------------------------------------------------------
GPU_RC=0
if [ "$GPUCHECK" = 1 ]; then
  step "GPU self-test (one native 4K frame)"
  ${AWAKE[@]+"${AWAKE[@]}"} node render/gpu-check.mjs; GPU_RC=$?
fi

echo
echo "=================================================================="
if [ "$GPU_RC" = 2 ]; then
  echo " Setup finished, BUT the GPU check found no usable graphics card (see the banner above)."
elif [ "$GPU_RC" != 0 ]; then
  echo " Setup finished, but the GPU check failed (see above)."
else
  echo " Setup finished."
fi
echo " Render: bash \"$PROJ/pc/render-episode.sh\"   (git pull + caches + npm run episode; Ctrl+C stops, run again to continue)"
echo " Status: bash \"$PROJ/pc/render-episode.sh\" --status"
echo " GPU check again: bash \"$PROJ/pc/render-episode.sh\" --gpu-check"
echo " Log:    $LOG"
echo "=================================================================="
rm -f "$TMPLOG"
exit "$GPU_RC"
}
main "$@"
