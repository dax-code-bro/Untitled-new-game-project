<#
.SYNOPSIS
  Dragon's Kingdom - one-command setup for rendering Episode 1 on a Windows 10/11 PC
  with a graphics card. No administrator rights needed.

.DESCRIPTION
  Start it in one of two ways:
    a) Paste this line into PowerShell (Start menu > type "PowerShell" > Enter):
         irm https://raw.githubusercontent.com/dax-code-bro/Untitled-new-game-project/claude/ultimate-ai-legend-KhpoT/dragons-kingdom/pc/setup-windows.ps1 | iex
    b) If the project is already on the PC: double-click  dragons-kingdom\pc\Setup-Windows.cmd

  What it does (safe to run again any time - it skips what is done and continues where it stopped):
    1. Git (the PC's own, else a portable MinGit - pinned version, SHA-256 checked, no
       administrator needed), then the project: git clone, or git pull of the branch
    2. Node.js: the PC's own if it is version 20 or newer, else a private copy of Node.js 22.22.0 LTS in
       pc\tools\node (pinned version, SHA-256 checked)
    3. ffmpeg with libx264: a pinned build (private copy in pc\tools\ffmpeg; SHA-256 checked), so
       every PC encodes with the same ffmpeg
    4. npm ci + Playwright's Chromium
    5. Python 3.11 (the PC's own, else a private one via uv 0.5.11 - pinned, SHA-256 checked) + Blender's
       Python module bpy 4.2 in a private venv
    6. every cache a render needs: node pc\build-caches.mjs (downloads, landscape bakes,
       48 human characters, cloth bakes - the long step: 1-3 hours the first time)
    7. GPU self-test (node render\gpu-check.mjs) and a 1-minute end-to-end render test
    8. a desktop shortcut "Render Dragon's Kingdom" (= pc\Render-Episode.cmd), and Windows' graphics
       setting "High performance" for Node.js and the Chromium it uses (per user, no administrator; on a
       laptop with two graphics chips this makes Chromium use the strong one)
  The PC is kept awake for the whole setup, and clicking inside the window does not pause it.
  Everything the tools print is shown and also written to dragons-kingdom\pc\logs\setup-<date>.log.
  Exit code: 0 ok, 2 setup finished but no usable graphics card, 1 setup stopped.

.PARAMETER Dir
  Where the project is cloned (default: %USERPROFILE%\DragonsKingdom). Ignored when the script
  runs from inside the project.
#>
[CmdletBinding()]
param(
  [string]$Dir = '',
  [string]$Branch = 'claude/ultimate-ai-legend-KhpoT',
  [switch]$NoPull,
  [switch]$SkipCaches,
  [switch]$SkipGpuCheck,
  [switch]$NoShortcut,
  [string]$Python = '',
  [switch]$WithVoice
)

$ErrorActionPreference = 'Continue'      # native tools write to stderr; failures are checked by exit code
$ProgressPreference = 'SilentlyContinue' # Invoke-WebRequest is many times faster without its progress bar
try { [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12 } catch { Write-Verbose $_.Exception.Message }

$RepoUrl = 'https://github.com/dax-code-bro/Untitled-new-game-project.git'
if ($env:DK_REPO_URL) { $RepoUrl = $env:DK_REPO_URL }
$NodeMajor = 20                          # a Node.js already on the PC is used if it is at least this version
#  - Node.js 22 LTS for PCs without one (the version the cloud machine runs the tests with), from nodejs.org/dist
$NodeVersion = '22.22.0'
$NodeZipSha256 = 'c97fa376d2becdc8863fcd3ca2dd9a83a9f3468ee7ccf7a6d076ec66a645c77a'
#  - uv (only if the PC has no Python 3.11): installs a private Python 3.11
$UvVersion = '0.5.11'
$UvZipSha256 = '3e8203e6434b45427f20824419f8d8d53f970a76d94ccdcad07f8498fa01a9d0'
# Pinned downloads (pc/MANIFEST.md): the exact files, with the SHA-256 the setup checks.
#  - MinGit (portable Git, no installer, no administrator): Git for Windows 2.55.0(5), 2026-08-20
$MinGitUrl = 'https://github.com/git-for-windows/git/releases/download/v2.55.0.windows.5/MinGit-2.55.0.5-64-bit.zip'
$MinGitSha256 = '56d7b226b7693196cfc71fef26568f536c4a021ab6c37ff2db4287bed908e96e'
#  - ffmpeg 8.1.3 (release branch), BtbN month-end build of 2026-09-30 (kept for two years by BtbN),
#    GPL (libx264). The same build as setup.sh uses on Linux.
$FfmpegName = 'ffmpeg-n8.1.3-9-g29e619e767-win64-gpl-8.1'
$FfmpegUrl = 'https://github.com/BtbN/FFmpeg-Builds/releases/download/autobuild-2026-09-30-13-08/' + $FfmpegName + '.zip'
$FfmpegSha256 = '7b801cdd3a1a0bb54ae6f572187e68b4ed54f52086cfee133fab2180bfb429fa'
$LocalRoot = Join-Path $env:LOCALAPPDATA 'DragonsKingdom'     # short paths outside the project (portable git, maybe the venv)
$script:StepNo = 0
$script:Log = $null
$script:Code = 1

function Write-Step([string]$Text) { $script:StepNo++; Write-Host ''; Write-Host ("==[ {0} ]== {1}" -f $script:StepNo, $Text) -ForegroundColor Cyan }
function Write-Ok([string]$Text) { Write-Host ('   ok: ' + $Text) -ForegroundColor Green }
function Write-Note([string]$Text) { Write-Host ('   note: ' + $Text) -ForegroundColor Yellow }
function Stop-Setup([string]$Text) { throw [System.Exception]::new($Text) }
function Test-Cmd([string]$Name) { return [bool](Get-Command $Name -ErrorAction SilentlyContinue) }

# Run a program and show everything it prints, on the screen AND in the setup log; returns its exit code.
#   $rc = Invoke-Tool node pc/build-caches.mjs --check
# Why not just "& node ...": inside a function, a program's normal output becomes the function's
# return value (it is neither shown nor logged), and Windows PowerShell 5.1 does not put a program's
# console output into the transcript (the log). Going through Out-Host fixes both. Error output
# (stderr) is shown as plain lines too. A simple function on purpose: every word after the program
# name is passed on unchanged (only a bare "--" would be dropped by PowerShell).
function Invoke-Tool {
  $exe = $args[0]
  $rest = @($args | Select-Object -Skip 1)
  $global:LASTEXITCODE = 0
  try {
    & $exe @rest 2>&1 | ForEach-Object {
      if ($_ -is [System.Management.Automation.ErrorRecord]) { $_.ToString() } else { $_ }
    } | Out-Host
  } catch {
    Write-Host ('   could not run ' + $exe + ': ' + $_.Exception.Message) -ForegroundColor Red
    return 127
  }
  return [int]$LASTEXITCODE
}

function Update-SessionPath([string[]]$Extra = @()) {
  $machine = [Environment]::GetEnvironmentVariable('Path', 'Machine')
  $user = [Environment]::GetEnvironmentVariable('Path', 'User')
  $env:Path = (@($Extra) + @($machine, $user) | Where-Object { $_ }) -join ';'
}

function Save-Download([string]$Url, [string]$Dest, [string]$Sha256 = '') {
  $parent = Split-Path -Parent $Dest
  if (-not (Test-Path $parent)) { New-Item -ItemType Directory -Force -Path $parent | Out-Null }
  for ($i = 1; $i -le 3; $i++) {
    $done = $false
    if (Test-Cmd 'curl.exe') {
      & curl.exe -fL --retry 3 --retry-delay 2 -o $Dest $Url      # (curl's progress meter goes to the screen)
      $done = ($LASTEXITCODE -eq 0 -and (Test-Path $Dest))
    } else {
      try { Invoke-WebRequest -Uri $Url -OutFile $Dest -UseBasicParsing -ErrorAction Stop; $done = $true } catch { Write-Note $_.Exception.Message }
    }
    if ($done) {
      if (-not $Sha256) { return }
      $got = (Get-FileHash -Algorithm SHA256 $Dest).Hash.ToLower()
      if ($got -eq $Sha256.ToLower()) { Write-Host ('   SHA-256 ok: ' + (Split-Path -Leaf $Dest)); return }
      Write-Note ((Split-Path -Leaf $Dest) + ': SHA-256 ' + $got + ' does not match ' + $Sha256 + ' - downloading again')
      Remove-Item -Force $Dest -ErrorAction SilentlyContinue
    }
    Start-Sleep -Seconds 3
  }
  Stop-Setup ('download failed or damaged: ' + $Url + ' (internet connection? try again)')
}

function Expand-Zip([string]$Zip, [string]$Dest) {
  if (Test-Path $Dest) { Remove-Item -Recurse -Force $Dest }
  New-Item -ItemType Directory -Force -Path $Dest | Out-Null
  if (Test-Cmd 'tar.exe') {
    & tar.exe -xf $Zip -C $Dest
    if ($LASTEXITCODE -eq 0) { return }
  }
  Expand-Archive -Path $Zip -DestinationPath $Dest -Force -ErrorAction Stop
}

function Get-NodeMajor {
  if (-not (Test-Cmd 'node')) { return 0 }
  $v = & node -p "process.versions.node.split('.')[0]" 2>$null
  if ($LASTEXITCODE -ne 0) { return 0 }
  return [int]$v
}

function Test-Ffmpeg([string]$Exe) {
  if (-not $Exe) { return $false }
  if (-not (Test-Path $Exe) -and -not (Test-Cmd $Exe)) { return $false }   # not there (yet)
  try { $out = & $Exe -hide_banner -encoders 2>$null } catch { return $false }
  return ($LASTEXITCODE -eq 0) -and ($null -ne ($out | Select-String -SimpleMatch 'libx264'))
}

function Test-Bpy([string]$Py) {
  if (-not $Py -or -not (Test-Path $Py)) { return $false }
  try { & $Py -c 'import bpy, numpy; assert bpy.app.version[:2] == (4, 2)' 2>$null | Out-Null } catch { return $false }
  return $LASTEXITCODE -eq 0
}

function Start-Log([string]$Path, [switch]$Append) {
  try { Stop-Transcript | Out-Null } catch { Write-Verbose $_.Exception.Message }
  try {
    if ($Append) { Start-Transcript -Path $Path -Append | Out-Null } else { Start-Transcript -Path $Path | Out-Null }
  } catch { Write-Verbose $_.Exception.Message }
}

# Keep the PC awake (no sleep) while the long steps run; released at the end.
function Set-KeepAwake([bool]$On) {
  try {
    if (-not ('DK.Power' -as [type])) {
      Add-Type -Namespace DK -Name Power -MemberDefinition '[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint esFlags);' -ErrorAction Stop
    }
    $flags = [uint32]'0x80000000'                      # ES_CONTINUOUS: back to normal
    if ($On) { $flags = [uint32]'0x80000001' }         # ES_CONTINUOUS | ES_SYSTEM_REQUIRED
    return ([DK.Power]::SetThreadExecutionState($flags) -ne 0)
  } catch { return $false }
}

# Windows 10's classic console window has "QuickEdit": one click inside the window starts a text
# selection, and the program in it FREEZES until a key is pressed. Turn that off for this window
# while the setup runs (restored at the end). Returns the old console mode, or $null.
function Disable-QuickEdit {
  try {
    if (-not ('DK.ConsoleMode' -as [type])) {
      Add-Type -Namespace DK -Name ConsoleMode -ErrorAction Stop -MemberDefinition @'
[DllImport("kernel32.dll", SetLastError = true)] public static extern IntPtr GetStdHandle(int nStdHandle);
[DllImport("kernel32.dll", SetLastError = true)] public static extern bool GetConsoleMode(IntPtr hConsoleHandle, out uint lpMode);
[DllImport("kernel32.dll", SetLastError = true)] public static extern bool SetConsoleMode(IntPtr hConsoleHandle, uint dwMode);
'@
    }
    $h = [DK.ConsoleMode]::GetStdHandle(-10)           # STD_INPUT_HANDLE
    $mode = [uint32]0
    if (-not [DK.ConsoleMode]::GetConsoleMode($h, [ref]$mode)) { return $null }
    $new = [uint32](([int64]$mode -bor 0x80) -band (-bnot [int64]0x40))   # + ENABLE_EXTENDED_FLAGS, - ENABLE_QUICK_EDIT_MODE
    if ($new -ne $mode) { [void][DK.ConsoleMode]::SetConsoleMode($h, $new) }
    return $mode
  } catch { return $null }
}
# Windows' own per-program graphics choice (Settings > System > Display > Graphics > "High performance"), stored per
# user in HKCU, so no administrator is needed. On a desktop with one graphics card it changes nothing; on a laptop
# with a weak and a strong graphics chip it makes Node.js and the Chromium it starts use the strong one.
# Returns the programs that have the setting now.
function Set-GpuPreference([string[]]$Exes) {
  $key = 'HKCU:\Software\Microsoft\DirectX\UserGpuPreferences'
  $done = @()
  if ([Environment]::OSVersion.Platform -ne 'Win32NT') { return $done }
  try {
    if (-not (Test-Path $key)) { New-Item -Path $key -Force | Out-Null }
    foreach ($exe in $Exes) {
      if (-not $exe -or -not (Test-Path -LiteralPath $exe)) { continue }
      $full = (Resolve-Path -LiteralPath $exe).Path
      $cur = (Get-ItemProperty -Path $key -Name $full -ErrorAction SilentlyContinue).$full
      if ("$cur" -notmatch 'GpuPreference=2;') {
        $val = ("$cur" -replace 'GpuPreference=\d;', '') + 'GpuPreference=2;'     # keep any other setting Windows stored there
        New-ItemProperty -Path $key -Name $full -Value $val -PropertyType String -Force | Out-Null
      }
      $done += $full
    }
  } catch { Write-Note ('could not set the graphics preference: ' + $_.Exception.Message) }
  return $done
}
# The programs that draw the frames: Node.js and Playwright's Chromium (full browser and headless shell).
function Get-RenderProgram {
  $list = @()
  $n = Get-Command node -ErrorAction SilentlyContinue
  if ($n) { $list += $n.Source }
  $pw = $env:PLAYWRIGHT_BROWSERS_PATH
  if (-not $pw -or $pw -eq '0') { $pw = Join-Path $env:LOCALAPPDATA 'ms-playwright' }
  if (Test-Path $pw) {
    $list += @(Get-ChildItem -Path $pw -Directory -Filter 'chromium-*' -ErrorAction SilentlyContinue | ForEach-Object { Join-Path $_.FullName 'chrome-win\chrome.exe' })
    $list += @(Get-ChildItem -Path $pw -Directory -Filter 'chromium_headless_shell-*' -ErrorAction SilentlyContinue | ForEach-Object { Join-Path $_.FullName 'chrome-win\headless_shell.exe' })
  }
  return @($list | Where-Object { $_ -and (Test-Path -LiteralPath $_) })
}

function Restore-ConsoleMode($Mode) {
  if ($null -eq $Mode) { return }
  try { [void][DK.ConsoleMode]::SetConsoleMode([DK.ConsoleMode]::GetStdHandle(-10), [uint32]$Mode) } catch { Write-Verbose $_.Exception.Message }
}

function Invoke-Setup {
  $stamp = Get-Date -Format 'yyyy-MM-dd-HH-mm-ss'
  $tmpLog = Join-Path $env:TEMP ('dk-setup-' + $stamp + '.log')
  Start-Log $tmpLog
  Write-Host ("Dragon's Kingdom setup - Windows {0} - PowerShell {1} - {2}" -f [Environment]::OSVersion.Version, $PSVersionTable.PSVersion, (Get-Date))
  if (-not [Environment]::Is64BitOperatingSystem) { Stop-Setup 'a 64-bit Windows is needed' }

  # ---- 1. git + project ------------------------------------------------------------------------
  Write-Step 'Git and the project'
  $mingit = Join-Path $LocalRoot 'mingit\cmd'
  if (Test-Path (Join-Path $mingit 'git.exe')) { $env:Path = $mingit + ';' + $env:Path }
  if (-not (Test-Cmd 'git')) {
    # a portable Git: no installer, no administrator password, nothing changes outside this folder
    Write-Host ('   installing a portable Git (MinGit 2.55.0) into ' + (Join-Path $LocalRoot 'mingit'))
    $zip = Join-Path $LocalRoot 'mingit.zip'
    Save-Download $MinGitUrl $zip $MinGitSha256
    Expand-Zip $zip (Join-Path $LocalRoot 'mingit')
    Remove-Item -Force $zip
    $env:Path = $mingit + ';' + $env:Path
  }
  if (-not (Test-Cmd 'git')) { Stop-Setup 'Git is not available - install it from https://git-scm.com and run again' }
  Write-Ok ((& git --version) + ' (' + (Get-Command git).Source + ')')

  $proj = $null
  if (-not $Dir -and $PSScriptRoot -and (Test-Path (Join-Path $PSScriptRoot '..\package.json')) -and (Test-Path (Join-Path $PSScriptRoot '..\render'))) {
    $proj = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
  } else {
    if (-not $Dir) { $Dir = Join-Path $env:USERPROFILE 'DragonsKingdom' }
    if (Test-Path (Join-Path $Dir '.git')) {
      Write-Ok ('the project is already in ' + $Dir)
    } elseif ((Test-Path $Dir) -and (Get-ChildItem -Force $Dir | Select-Object -First 1)) {
      Stop-Setup ($Dir + ' exists and is not the project - run again with -Dir <another folder>')
    } else {
      Write-Host ('   downloading the project into ' + $Dir + ' (branch ' + $Branch + ')')
      $rc = Invoke-Tool git clone -c core.autocrlf=false -c core.longpaths=true --branch $Branch $RepoUrl $Dir
      if ($rc -ne 0) { Stop-Setup 'git clone failed (internet connection?)' }
    }
    $proj = Join-Path $Dir 'dragons-kingdom'
  }
  if (-not (Test-Path (Join-Path $proj 'package.json'))) { Stop-Setup ($proj + ' does not look like the dragons-kingdom folder') }
  $repo = (& git -C $proj rev-parse --show-toplevel).Trim()
  $logDir = Join-Path $proj 'pc\logs'
  New-Item -ItemType Directory -Force -Path $logDir | Out-Null
  $script:Log = Join-Path $logDir ('setup-' + $stamp + '.log')
  try { Stop-Transcript | Out-Null } catch { Write-Verbose $_.Exception.Message }
  if (Test-Path $tmpLog) { Copy-Item -LiteralPath $tmpLog -Destination $script:Log -Force; Remove-Item -Force $tmpLog -ErrorAction SilentlyContinue }   # a byte copy (Set-Content would re-encode)
  Start-Log $script:Log -Append
  Write-Ok ('project: ' + $proj)
  if ($proj -match 'OneDrive') { Write-Note 'the project is inside OneDrive: syncing gigabytes of render files is slow - better use -Dir C:\DragonsKingdom' }

  if (-not $NoPull) {
    $cur = (& git -C $repo rev-parse --abbrev-ref HEAD).Trim()
    if ($cur -ne $Branch) {
      $dirty = & git -C $repo status --porcelain --untracked-files=no
      if (-not $dirty) {
        [void](Invoke-Tool git -C $repo fetch origin $Branch)
        [void](Invoke-Tool git -C $repo checkout $Branch)
      } else { Write-Note ('you are on ' + $cur + ' with local changes - not switching to ' + $Branch) }
    }
    $rc = Invoke-Tool git -C $repo pull --no-rebase --ff-only origin $Branch
    if ($rc -eq 0) { Write-Ok ('up to date with origin/' + $Branch) } else { Write-Note 'git pull did not work (offline, or local changes?) - continuing with what is here' }
  }
  Set-Location $proj
  $tools = Join-Path $proj 'pc\tools'
  New-Item -ItemType Directory -Force -Path $tools | Out-Null

  $drive = (Get-Item $proj).PSDrive
  if ($drive -and $drive.Free) {
    $freeGB = [math]::Round($drive.Free / 1GB)
    Write-Ok ('free disk on ' + $drive.Name + ': ' + $freeGB + ' GB')
    if ($freeGB -lt 100) { Write-Note 'Episode 1 needs about 100 GB while it renders (tools + caches ~6 GB, shots + scene files ~60-90 GB)' }
  }

  # ---- 2. Node.js ----------------------------------------------------------------------------------
  Write-Step 'Node.js'
  $nodeDir = Join-Path $tools 'node'
  if (Test-Path (Join-Path $nodeDir 'node.exe')) { $env:Path = $nodeDir + ';' + $env:Path }
  if ((Get-NodeMajor) -lt $NodeMajor) {
    $file = 'node-v' + $NodeVersion + '-win-x64.zip'
    $zip = Join-Path $tools $file
    Write-Host ('   no Node.js ' + $NodeMajor + ' or newer on this PC: installing Node.js ' + $NodeVersion + ' into pc\tools\node')
    Save-Download ('https://nodejs.org/dist/v' + $NodeVersion + '/' + $file) $zip $NodeZipSha256
    $tmp = Join-Path $tools 'node-unpack'
    Expand-Zip $zip $tmp
    $inner = Get-ChildItem -Directory $tmp | Select-Object -First 1
    if (Test-Path $nodeDir) { Remove-Item -Recurse -Force $nodeDir }
    Move-Item $inner.FullName $nodeDir
    Remove-Item -Recurse -Force $tmp, $zip -ErrorAction SilentlyContinue
    $env:Path = $nodeDir + ';' + $env:Path
  }
  if ((Get-NodeMajor) -lt $NodeMajor) { Stop-Setup ('Node.js ' + $NodeMajor + ' or newer is still not available') }
  Write-Ok ('node ' + (& node --version) + ' (' + (Get-Command node).Source + ')')

  # ---- 3. ffmpeg -------------------------------------------------------------------------------------
  # Always the pinned build in pc\tools\ffmpeg (render\lib\tools.mjs uses it before any other ffmpeg),
  # so every run and every PC encodes with exactly the same ffmpeg and x264.
  Write-Step 'ffmpeg (pinned build with libx264)'
  $ffDir = Join-Path $tools 'ffmpeg'
  $ffLocal = Join-Path $ffDir 'bin\ffmpeg.exe'
  $ffPin = Join-Path $ffDir '.dk-pin'
  $pinned = (Test-Path $ffPin) -and ((Get-Content $ffPin -ErrorAction SilentlyContinue | Select-Object -First 1) -eq $FfmpegName)
  if ($pinned -and (Test-Ffmpeg $ffLocal)) { Write-Ok ('pinned build ' + $FfmpegName + ': ' + $ffLocal) }
  else {
    if (Test-Path $ffLocal) { Write-Note 'pc\tools\ffmpeg is not the pinned build - replacing it' }
    $zip = Join-Path $tools 'ffmpeg.zip'
    Write-Host ('   downloading ' + $FfmpegName + '.zip (about 190 MB)')
    try {
      Save-Download $FfmpegUrl $zip $FfmpegSha256
      $tmp = Join-Path $tools 'ffmpeg-unpack'
      Expand-Zip $zip $tmp
      $inner = Get-ChildItem -Directory $tmp | Select-Object -First 1
      if (Test-Path $ffDir) { Remove-Item -Recurse -Force $ffDir }
      Move-Item $inner.FullName $ffDir
      Remove-Item -Recurse -Force $tmp, $zip -ErrorAction SilentlyContinue
      Remove-Item -Force (Join-Path $ffDir 'bin\ffplay.exe') -ErrorAction SilentlyContinue   # the player is not needed (~170 MB)
      Set-Content -Path $ffPin -Value $FfmpegName -Encoding ASCII
      if (-not (Test-Ffmpeg $ffLocal)) { Stop-Setup 'the downloaded ffmpeg does not work' }
      Write-Ok ('pinned build ' + $FfmpegName + ': ' + $ffLocal)
    } catch {
      if ((Test-Cmd 'ffmpeg') -and (Test-Cmd 'ffprobe') -and (Test-Ffmpeg 'ffmpeg')) {
        Write-Note ('the pinned ffmpeg could not be installed (' + $_.Exception.Message + ')')
        Write-Note ('using the installed one for now: ' + (Get-Command ffmpeg).Source + ' - NOT the pinned build; run the setup again later')
      } else { throw }
    }
  }

  # ---- 4. npm packages + Chromium -------------------------------------------------------------------
  Write-Step 'npm packages and the Chromium browser'
  & node pc/build-caches.mjs --check --only node-modules | Out-Null
  if ($LASTEXITCODE -eq 0) { Write-Ok 'npm packages already installed' }
  else {
    $rc = Invoke-Tool npm.cmd ci --no-audit --no-fund
    if ($rc -ne 0) { Stop-Setup 'npm ci failed (see the messages above)' }
    Write-Ok 'npm ci done'
  }
  & node pc/build-caches.mjs --check --only chromium | Out-Null
  if ($LASTEXITCODE -eq 0) { Write-Ok 'Chromium already installed' }
  else {
    $rc = Invoke-Tool npx.cmd playwright install chromium
    if ($rc -ne 0) { Stop-Setup 'npx playwright install chromium failed (see the messages above)' }
    Write-Ok 'Chromium installed'
  }

  # ---- 5. Python 3.11 + bpy ---------------------------------------------------------------------------
  Write-Step "Python 3.11 + Blender's Python module (bpy 4.2)"
  $venv = Join-Path $proj 'pc\.venv-bpy'
  $longPaths = 0
  try { $longPaths = (Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem' -Name LongPathsEnabled -ErrorAction Stop).LongPathsEnabled } catch { Write-Verbose $_.Exception.Message }
  if ($longPaths -ne 1 -and ($venv.Length + 175) -gt 255) {
    $venv = Join-Path $LocalRoot 'venv-bpy'      # bpy has very deep folders; Windows limits paths to 260 characters
    Write-Note ('long project path: the Python environment goes to ' + $venv)
  }
  $vpy = Join-Path $venv 'Scripts\python.exe'
  $req = Join-Path $proj 'pc\requirements-bpy.txt'
  $bpyPy = $null
  if ($Python -and (Test-Bpy $Python)) { $bpyPy = $Python; Write-Ok ('using ' + $Python) }
  elseif (Test-Bpy $vpy) { $bpyPy = $vpy; Write-Ok ('bpy already installed in ' + $venv) }
  else {
    $usePy = $false
    if (Test-Cmd 'py') {
      $ok = & py -3.11 -c 'import sys, venv, ensurepip; print(sys.maxsize > 2**32)' 2>$null
      if ($LASTEXITCODE -eq 0 -and "$ok".Trim() -eq 'True') { $usePy = $true }
    }
    if ($usePy) {
      Write-Host '   using the installed Python 3.11 (py -3.11)'
      if (-not (Test-Path $vpy)) { [void](Invoke-Tool py -3.11 -m venv $venv) }
      [void](Invoke-Tool $vpy -m pip install --upgrade pip)
      Write-Host '   installing bpy 4.2 (about 400 MB download, 1.5 GB on disk)'
      [void](Invoke-Tool $vpy -m pip install -r $req)
    } else {
      $uv = Join-Path $tools 'uv\uv.exe'
      if (-not (Test-Path $uv)) {
        Write-Host ('   no Python 3.11 found: installing uv ' + $UvVersion + ' (a small, free Python manager) into pc\tools\uv')
        $zip = Join-Path $tools 'uv.zip'
        Save-Download ('https://github.com/astral-sh/uv/releases/download/' + $UvVersion + '/uv-x86_64-pc-windows-msvc.zip') $zip $UvZipSha256
        Expand-Zip $zip (Join-Path $tools 'uv')
        Remove-Item -Force $zip
      }
      $env:UV_PYTHON_INSTALL_DIR = Join-Path $LocalRoot 'python'
      $rc = Invoke-Tool $uv python install 3.11
      if ($rc -ne 0) { Stop-Setup 'uv could not install Python 3.11' }
      if (-not (Test-Path $vpy)) { [void](Invoke-Tool $uv venv --python 3.11 $venv) }
      Write-Host '   installing bpy 4.2 (about 400 MB download, 1.5 GB on disk)'
      [void](Invoke-Tool $uv pip install --python $vpy -r $req)
    }
    if (-not (Test-Bpy $vpy)) { Stop-Setup ('bpy does not work in ' + $vpy + ' (see the messages above; needs ~1.5 GB free disk)') }
    $bpyPy = $vpy
    Write-Ok ('bpy ready: ' + $vpy)
  }
  $marker = Join-Path $proj 'pc\.bpy-python'
  # UTF-8 without a byte-order mark: a user folder with accented letters (C:\Users\Jos\u00e9) must survive (build-caches.mjs reads UTF-8)
  if ($bpyPy -ne (Join-Path $proj 'pc\.venv-bpy\Scripts\python.exe')) { [IO.File]::WriteAllText($marker, $bpyPy, (New-Object System.Text.UTF8Encoding($false))) }
  elseif (Test-Path $marker) { Remove-Item -Force $marker }

  # ---- 6. caches ---------------------------------------------------------------------------------------
  if (-not $SkipCaches) {
    Write-Step 'caches: asset downloads, landscape bakes, human characters, cloth bakes (first time: 1-3 hours)'
    Write-Host '   one line per finished piece; a character can take 5-15 minutes, so a quiet minute is normal'
    $cacheArgs = @('pc/build-caches.mjs', '--python', $bpyPy)
    if ($WithVoice) { $cacheArgs += '--with-voice' }
    $rc = Invoke-Tool node @cacheArgs
    if ($rc -ne 0) { Stop-Setup 'some caches could not be made (see above). Run the setup again - finished parts are kept.' }
  } else {
    Write-Step 'caches skipped (-SkipCaches): run  node pc\build-caches.mjs  later'
  }

  # ---- graphics preference (before the GPU check, so the check sees the setting) --------------------------
  $pref = Set-GpuPreference (Get-RenderProgram)
  if ($pref.Count) { Write-Ok ('Windows graphics setting "High performance" for: ' + (($pref | ForEach-Object { Split-Path -Leaf $_ }) -join ', ')) }

  # ---- 7. GPU self-test + end-to-end test ---------------------------------------------------------------
  $gpuRc = 0
  if (-not $SkipGpuCheck -and -not $SkipCaches) {
    Write-Step 'GPU self-test (one native 4K frame) - may take a few minutes'
    $gpuRc = Invoke-Tool node render/gpu-check.mjs
    Write-Step 'end-to-end test: a tiny made-up episode (render, stop, resume, assemble)'
    $mode = '--cpu'
    if ($gpuRc -eq 0) { $mode = '--gpu' }
    $rc = Invoke-Tool node pc/selftest-episode.mjs $mode
    if ($rc -ne 0) { Write-Note 'the end-to-end test did not pass - send pc\logs to the Claude session' }
  }

  # ---- 8. desktop shortcut --------------------------------------------------------------------------------
  if (-not $NoShortcut) {
    try {
      $desk = [Environment]::GetFolderPath('Desktop')
      $lnk = Join-Path $desk "Render Dragon's Kingdom.lnk"
      $ws = New-Object -ComObject WScript.Shell
      $s = $ws.CreateShortcut($lnk)
      $s.TargetPath = Join-Path $proj 'pc\Render-Episode.cmd'
      $s.WorkingDirectory = $proj
      $s.Description = "Get the newest scenes (git pull) and continue rendering Dragon's Kingdom Episode 1"
      $s.Save()
      Write-Ok ('desktop shortcut: ' + $lnk)
    } catch { Write-Note ('could not make the desktop shortcut: ' + $_.Exception.Message) }
  }

  Write-Host ''
  Write-Host '=================================================================='
  if ($gpuRc -eq 2) { Write-Host ' Setup finished, BUT no usable graphics card was found (see the GPU NOT USED banner above).' -ForegroundColor Yellow }
  elseif ($gpuRc -ne 0) { Write-Host ' Setup finished, but the GPU check failed (see above).' -ForegroundColor Yellow }
  else { Write-Host ' Setup finished.' -ForegroundColor Green }
  Write-Host (' Render:     double-click "Render Dragon''s Kingdom" on the desktop (or pc\Render-Episode.cmd)')
  Write-Host (' GPU check:  double-click pc\GPU-Check.cmd')
  Write-Host (' Status:     pc\Render-Episode.cmd --status')
  Write-Host (' Log:        ' + $script:Log)
  Write-Host '=================================================================='
  $script:Code = $gpuRc
}

# UTF-8 for what the tools print (Node and Python write UTF-8; Windows PowerShell would read it as an
# old code page and garble every non-English letter). Restored at the end.
$oldOutEnc = $null
try { $oldOutEnc = [Console]::OutputEncoding; [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false) } catch { Write-Verbose $_.Exception.Message }
$oldPyUtf8 = $env:PYTHONUTF8
$env:PYTHONUTF8 = '1'
$oldConsoleMode = Disable-QuickEdit
$script:Code = 1
# the PC stays awake (no sleep) from here to the end of the setup: downloads and character builds take hours
if (Set-KeepAwake $true) { Write-Host 'The PC will not go to sleep until the setup is finished (the screen may still turn off).' }
try {
  Invoke-Setup          # (not "$x = Invoke-Setup": that would swallow everything the tools print)
} catch {
  Write-Host ''
  Write-Host ('SETUP STOPPED: ' + $_.Exception.Message) -ForegroundColor Red
  Write-Host 'Fix that, then run the same command again - it continues where it stopped.'
  if ($script:Log) { Write-Host ('log: ' + $script:Log) }
  $script:Code = 1
} finally {
  [void](Set-KeepAwake $false)
  try { Stop-Transcript | Out-Null } catch { Write-Verbose $_.Exception.Message }
  Restore-ConsoleMode $oldConsoleMode
  if ($null -ne $oldOutEnc) { try { [Console]::OutputEncoding = $oldOutEnc } catch { Write-Verbose $_.Exception.Message } }
  $env:PYTHONUTF8 = $oldPyUtf8
}
# only leave the window when this ran as a file (with "irm ... | iex" exit would close PowerShell)
if ($PSCommandPath) { exit ([int]$script:Code) }
