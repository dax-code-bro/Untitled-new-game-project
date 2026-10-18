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
    1. Git (winget, or a portable MinGit), then the project: git clone, or git pull of the branch
    2. Node.js 20 LTS (private copy in pc\tools\node if the PC has no Node >= 20)
    3. ffmpeg with libx264 (private copy in pc\tools\ffmpeg)
    4. npm ci + Playwright's Chromium
    5. Python 3.11 + Blender's Python module bpy 4.2 in a private venv
    6. every cache a render needs: node pc\build-caches.mjs (downloads, landscape bakes,
       48 human characters, cloth bakes - the long step: 1-3 hours the first time)
    7. GPU self-test (node render\gpu-check.mjs) and a 1-minute end-to-end render test
    8. a desktop shortcut "Render Dragon's Kingdom" (= pc\Render-Episode.cmd)
  Log: dragons-kingdom\pc\logs\setup-<date>.log

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
$NodeMajor = 20
$UvVersion = '0.5.11'
$FfmpegUrl = 'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip'
$LocalRoot = Join-Path $env:LOCALAPPDATA 'DragonsKingdom'     # short paths outside the project (portable git, maybe the venv)
$script:StepNo = 0
$script:Log = $null

function Write-Step([string]$Text) { $script:StepNo++; Write-Host ''; Write-Host ("==[ {0} ]== {1}" -f $script:StepNo, $Text) -ForegroundColor Cyan }
function Write-Ok([string]$Text) { Write-Host ('   ok: ' + $Text) -ForegroundColor Green }
function Write-Note([string]$Text) { Write-Host ('   note: ' + $Text) -ForegroundColor Yellow }
function Stop-Setup([string]$Text) { throw [System.Exception]::new($Text) }
function Test-Cmd([string]$Name) { return [bool](Get-Command $Name -ErrorAction SilentlyContinue) }

function Update-SessionPath([string[]]$Extra = @()) {
  $machine = [Environment]::GetEnvironmentVariable('Path', 'Machine')
  $user = [Environment]::GetEnvironmentVariable('Path', 'User')
  $env:Path = (@($Extra) + @($machine, $user) | Where-Object { $_ }) -join ';'
}

function Save-Download([string]$Url, [string]$Dest) {
  $parent = Split-Path -Parent $Dest
  if (-not (Test-Path $parent)) { New-Item -ItemType Directory -Force -Path $parent | Out-Null }
  for ($i = 1; $i -le 3; $i++) {
    if (Test-Cmd 'curl.exe') {
      & curl.exe -fL --retry 3 --retry-delay 2 -o $Dest $Url
      if ($LASTEXITCODE -eq 0 -and (Test-Path $Dest)) { return }
    } else {
      try { Invoke-WebRequest -Uri $Url -OutFile $Dest -UseBasicParsing -ErrorAction Stop; return } catch { Write-Note $_.Exception.Message }
    }
    Start-Sleep -Seconds 3
  }
  Stop-Setup ('download failed: ' + $Url + ' (internet connection? try again)')
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
  $out = & $Exe -hide_banner -encoders 2>$null
  return ($LASTEXITCODE -eq 0) -and ($null -ne ($out | Select-String -SimpleMatch 'libx264'))
}

function Test-Bpy([string]$Py) {
  if (-not $Py -or -not (Test-Path $Py)) { return $false }
  & $Py -c 'import bpy, numpy; assert bpy.app.version[:2] == (4, 2)' 2>$null | Out-Null
  return $LASTEXITCODE -eq 0
}

function Start-Log([string]$Path, [switch]$Append) {
  try { Stop-Transcript | Out-Null } catch { Write-Verbose $_.Exception.Message }
  try {
    if ($Append) { Start-Transcript -Path $Path -Append | Out-Null } else { Start-Transcript -Path $Path | Out-Null }
  } catch { Write-Verbose $_.Exception.Message }
}

function Invoke-Setup {
  $stamp = Get-Date -Format 'yyyy-MM-dd-HH-mm-ss'
  $tmpLog = Join-Path $env:TEMP ('dk-setup-' + $stamp + '.log')
  Start-Log $tmpLog
  Write-Host ("Dragon's Kingdom setup - Windows {0} - {1}" -f [Environment]::OSVersion.Version, (Get-Date))
  if (-not [Environment]::Is64BitOperatingSystem) { Stop-Setup 'a 64-bit Windows is needed' }

  # ---- 1. git + project ------------------------------------------------------------------------
  Write-Step 'Git and the project'
  $mingit = Join-Path $LocalRoot 'mingit\cmd'
  if (Test-Path (Join-Path $mingit 'git.exe')) { $env:Path = $mingit + ';' + $env:Path }
  if (-not (Test-Cmd 'git')) {
    if (Test-Cmd 'winget') {
      Write-Host '   installing Git with winget (Windows may ask for permission)'
      & winget install --id Git.Git -e --source winget --accept-package-agreements --accept-source-agreements --silent
      Update-SessionPath @($mingit)
    }
    if (-not (Test-Cmd 'git')) {
      Write-Host '   installing a portable Git (MinGit) into ' $LocalRoot
      $rel = Invoke-RestMethod -Uri 'https://api.github.com/repos/git-for-windows/git/releases/latest' -UseBasicParsing
      $asset = $rel.assets | Where-Object { $_.name -match '^MinGit-[\d.]+-64-bit\.zip$' } | Select-Object -First 1
      if (-not $asset) { Stop-Setup 'could not find MinGit - install Git from https://git-scm.com and run again' }
      $zip = Join-Path $LocalRoot 'mingit.zip'
      Save-Download $asset.browser_download_url $zip
      Expand-Zip $zip (Join-Path $LocalRoot 'mingit')
      Remove-Item -Force $zip
      $env:Path = $mingit + ';' + $env:Path
    }
  }
  if (-not (Test-Cmd 'git')) { Stop-Setup 'Git is not available - install it from https://git-scm.com and run again' }
  Write-Ok (& git --version)

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
      & git clone -c core.autocrlf=false -c core.longpaths=true --branch $Branch $RepoUrl $Dir
      if ($LASTEXITCODE -ne 0) { Stop-Setup 'git clone failed (internet connection?)' }
    }
    $proj = Join-Path $Dir 'dragons-kingdom'
  }
  if (-not (Test-Path (Join-Path $proj 'package.json'))) { Stop-Setup ($proj + ' does not look like the dragons-kingdom folder') }
  $repo = (& git -C $proj rev-parse --show-toplevel).Trim()
  $logDir = Join-Path $proj 'pc\logs'
  New-Item -ItemType Directory -Force -Path $logDir | Out-Null
  $script:Log = Join-Path $logDir ('setup-' + $stamp + '.log')
  try { Stop-Transcript | Out-Null } catch { Write-Verbose $_.Exception.Message }
  if (Test-Path $tmpLog) { Get-Content $tmpLog | Set-Content $script:Log; Remove-Item -Force $tmpLog -ErrorAction SilentlyContinue }
  Start-Log $script:Log -Append
  Write-Ok ('project: ' + $proj)
  if ($proj -match 'OneDrive') { Write-Note 'the project is inside OneDrive: syncing gigabytes of render files is slow - better use -Dir C:\DragonsKingdom' }

  if (-not $NoPull) {
    $cur = (& git -C $repo rev-parse --abbrev-ref HEAD).Trim()
    if ($cur -ne $Branch) {
      $dirty = & git -C $repo status --porcelain --untracked-files=no
      if (-not $dirty) {
        & git -C $repo fetch origin $Branch
        & git -C $repo checkout $Branch
      } else { Write-Note ('you are on ' + $cur + ' with local changes - not switching to ' + $Branch) }
    }
    & git -C $repo pull --no-rebase --ff-only origin $Branch
    if ($LASTEXITCODE -eq 0) { Write-Ok ('up to date with origin/' + $Branch) } else { Write-Note 'git pull did not work (offline, or local changes?) - continuing with what is here' }
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
  Write-Step ('Node.js ' + $NodeMajor + ' LTS')
  $nodeDir = Join-Path $tools 'node'
  if (Test-Path (Join-Path $nodeDir 'node.exe')) { $env:Path = $nodeDir + ';' + $env:Path }
  if ((Get-NodeMajor) -lt $NodeMajor) {
    $base = 'https://nodejs.org/dist/latest-v' + $NodeMajor + '.x'
    $sumsFile = Join-Path $tools 'SHASUMS256.txt'
    Save-Download ($base + '/SHASUMS256.txt') $sumsFile
    $line = Get-Content $sumsFile | Where-Object { $_ -match 'node-v[\d.]+-win-x64\.zip$' } | Select-Object -First 1
    if (-not $line) { Stop-Setup ('no Windows build listed at ' + $base) }
    $parts = $line -split '\s+'
    $want = $parts[0]; $file = $parts[1]
    $zip = Join-Path $tools $file
    Write-Host ('   downloading ' + $file)
    Save-Download ($base + '/' + $file) $zip
    $got = (Get-FileHash -Algorithm SHA256 $zip).Hash.ToLower()
    if ($got -ne $want) { Remove-Item -Force $zip; Stop-Setup ($file + ': checksum does not match - run again') }
    $tmp = Join-Path $tools 'node-unpack'
    Expand-Zip $zip $tmp
    $inner = Get-ChildItem -Directory $tmp | Select-Object -First 1
    if (Test-Path $nodeDir) { Remove-Item -Recurse -Force $nodeDir }
    Move-Item $inner.FullName $nodeDir
    Remove-Item -Recurse -Force $tmp, $zip, $sumsFile -ErrorAction SilentlyContinue
    $env:Path = $nodeDir + ';' + $env:Path
  }
  if ((Get-NodeMajor) -lt $NodeMajor) { Stop-Setup ('Node.js ' + $NodeMajor + ' or newer is still not available') }
  Write-Ok ('node ' + (& node --version) + ' (' + (Get-Command node).Source + ')')

  # ---- 3. ffmpeg -------------------------------------------------------------------------------------
  Write-Step 'ffmpeg (with libx264)'
  $ffLocal = Join-Path $tools 'ffmpeg\bin\ffmpeg.exe'
  if (Test-Ffmpeg $ffLocal) { Write-Ok ('private copy: ' + $ffLocal) }
  elseif ((Test-Cmd 'ffmpeg') -and (Test-Cmd 'ffprobe') -and (Test-Ffmpeg 'ffmpeg')) { Write-Ok ('installed: ' + (Get-Command ffmpeg).Source) }
  else {
    $zip = Join-Path $tools 'ffmpeg.zip'
    Write-Host ('   downloading ffmpeg (' + $FfmpegUrl + ')')
    Save-Download $FfmpegUrl $zip
    $tmp = Join-Path $tools 'ffmpeg-unpack'
    Expand-Zip $zip $tmp
    $inner = Get-ChildItem -Directory $tmp | Select-Object -First 1
    $ffDir = Join-Path $tools 'ffmpeg'
    if (Test-Path $ffDir) { Remove-Item -Recurse -Force $ffDir }
    Move-Item $inner.FullName $ffDir
    Remove-Item -Recurse -Force $tmp, $zip -ErrorAction SilentlyContinue
    if (-not (Test-Ffmpeg $ffLocal)) { Stop-Setup 'the downloaded ffmpeg does not work' }
    Write-Ok ('private copy: ' + $ffLocal)
  }

  # ---- 4. npm packages + Chromium -------------------------------------------------------------------
  Write-Step 'npm packages and the Chromium browser'
  & node pc\build-caches.mjs --check --only node-modules | Out-Null
  if ($LASTEXITCODE -eq 0) { Write-Ok 'npm packages already installed' }
  else {
    & npm.cmd ci --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { Stop-Setup 'npm ci failed (see above)' }
    Write-Ok 'npm ci done'
  }
  & node pc\build-caches.mjs --check --only chromium | Out-Null
  if ($LASTEXITCODE -eq 0) { Write-Ok 'Chromium already installed' }
  else {
    & npx.cmd playwright install chromium
    if ($LASTEXITCODE -ne 0) { Stop-Setup 'npx playwright install chromium failed (see above)' }
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
      if (-not (Test-Path $vpy)) { & py -3.11 -m venv $venv }
      & $vpy -m pip install --upgrade pip
      & $vpy -m pip install -r $req
    } else {
      $uv = Join-Path $tools 'uv\uv.exe'
      if (-not (Test-Path $uv)) {
        Write-Host ('   no Python 3.11 found: installing uv ' + $UvVersion + ' (a small, free Python manager) into pc\tools\uv')
        $zip = Join-Path $tools 'uv.zip'
        Save-Download ('https://github.com/astral-sh/uv/releases/download/' + $UvVersion + '/uv-x86_64-pc-windows-msvc.zip') $zip
        Expand-Zip $zip (Join-Path $tools 'uv')
        Remove-Item -Force $zip
      }
      $env:UV_PYTHON_INSTALL_DIR = Join-Path $LocalRoot 'python'
      & $uv python install 3.11
      if ($LASTEXITCODE -ne 0) { Stop-Setup 'uv could not install Python 3.11' }
      if (-not (Test-Path $vpy)) { & $uv venv --python 3.11 $venv }
      Write-Host '   installing bpy 4.2 (about 400 MB download, 1.5 GB on disk)'
      & $uv pip install --python $vpy -r $req
    }
    if (-not (Test-Bpy $vpy)) { Stop-Setup ('bpy does not work in ' + $vpy + ' (see the messages above; needs ~1.5 GB free disk)') }
    $bpyPy = $vpy
    Write-Ok ('bpy ready: ' + $vpy)
  }
  $marker = Join-Path $proj 'pc\.bpy-python'
  if ($bpyPy -ne (Join-Path $proj 'pc\.venv-bpy\Scripts\python.exe')) { Set-Content -Path $marker -Value $bpyPy -Encoding ASCII }
  elseif (Test-Path $marker) { Remove-Item -Force $marker }

  # ---- 6. caches ---------------------------------------------------------------------------------------
  if (-not $SkipCaches) {
    Write-Step 'caches: asset downloads, landscape bakes, human characters, cloth bakes (first time: 1-3 hours)'
    $cacheArgs = @('pc\build-caches.mjs', '--python', $bpyPy)
    if ($WithVoice) { $cacheArgs += '--with-voice' }
    & node @cacheArgs
    if ($LASTEXITCODE -ne 0) { Stop-Setup 'some caches could not be made (see above). Run the setup again - finished parts are kept.' }
  } else {
    Write-Step 'caches skipped (-SkipCaches): run  node pc\build-caches.mjs  later'
  }

  # ---- 7. GPU self-test + end-to-end test ---------------------------------------------------------------
  $gpuRc = 0
  if (-not $SkipGpuCheck -and -not $SkipCaches) {
    Write-Step 'GPU self-test (one native 4K frame) - may take a few minutes'
    & node render\gpu-check.mjs
    $gpuRc = $LASTEXITCODE
    Write-Step 'end-to-end test: a tiny made-up episode (render, stop, resume, assemble)'
    $mode = '--cpu'
    if ($gpuRc -eq 0) { $mode = '--gpu' }
    & node pc\selftest-episode.mjs $mode
    if ($LASTEXITCODE -ne 0) { Write-Note 'the end-to-end test did not pass - send pc\logs to the Claude session' }
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
  if ($gpuRc -eq 2) { Write-Host ' Setup finished, BUT no usable graphics card was found (see the GPU NOT USED banner).' -ForegroundColor Yellow }
  elseif ($gpuRc -ne 0) { Write-Host ' Setup finished, but the GPU check failed (see above).' -ForegroundColor Yellow }
  else { Write-Host ' Setup finished.' -ForegroundColor Green }
  Write-Host (' Render:  double-click "Render Dragon''s Kingdom" on the desktop (or pc\Render-Episode.cmd)')
  Write-Host (' Status:  pc\Render-Episode.cmd --status')
  Write-Host (' Log:     ' + $script:Log)
  Write-Host '=================================================================='
  return $gpuRc
}

$code = 1
try {
  $code = Invoke-Setup
} catch {
  Write-Host ''
  Write-Host ('SETUP STOPPED: ' + $_.Exception.Message) -ForegroundColor Red
  Write-Host 'Fix that, then run the same command again - it continues where it stopped.'
  if ($script:Log) { Write-Host ('log: ' + $script:Log) }
  $code = 1
} finally {
  try { Stop-Transcript | Out-Null } catch { Write-Verbose $_.Exception.Message }
}
# only leave the window when this ran as a file (with "irm ... | iex" exit would close PowerShell)
if ($PSCommandPath) { exit $code }
