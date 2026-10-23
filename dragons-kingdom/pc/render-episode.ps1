<#
.SYNOPSIS
  Continue rendering Dragon's Kingdom Episode 1 (what pc\Render-Episode.cmd and the desktop shortcut run).
  1. git pull: the newest scene files from the cloud
  2. node pc\build-caches.mjs: rebuilds a cache only if the pull changed its code (quick otherwise);
     it also fetches the sound once the cloud has published it (pc/MANIFEST.md, "Sound")
  3. node render\episode.mjs: renders what is ready, scene by scene; stops cleanly with Ctrl+C
  The PC is kept awake (no sleep) while this window is open, and a click inside the window does
  not pause the render (QuickEdit is switched off for this window).
  Extra words are passed on, e.g.  Render-Episode.cmd --status   or   --max-hours 8   or   --no-pull
  GPU check instead of rendering (what pc\GPU-Check.cmd runs):  Render-Episode.cmd --gpu-check [gpu-check options]
  Logs for the Claude session (what pc\Send-Logs.cmd runs):     Render-Episode.cmd --send-logs
    (one text file pc\logs\send-to-claude-<date>.txt; its text is also copied, ready to paste with Ctrl+V)
#>
param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Rest = @())
$ErrorActionPreference = 'Continue'
$proj = Split-Path -Parent $PSScriptRoot
$tools = Join-Path $proj 'pc\tools'
$extra = @((Join-Path $tools 'node'), (Join-Path $tools 'ffmpeg\bin'), (Join-Path $env:LOCALAPPDATA 'DragonsKingdom\mingit\cmd')) | Where-Object { Test-Path $_ }
if ($extra) { $env:Path = ($extra -join ';') + ';' + $env:Path }
Set-Location $proj
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Write-Host 'Node.js is missing: run pc\Setup-Windows.cmd first.' -ForegroundColor Red; exit 1 }

# ---- logs for the Claude session: one file, its text copied, its folder opened
if ($Rest -contains '--send-logs') {
  $pathFile = Join-Path ([IO.Path]::GetTempPath()) ('dk-send-logs-' + $PID + '.txt')
  $env:DK_PRINT_PATH_FILE = $pathFile
  & node pc/collect-logs.mjs
  $code = $LASTEXITCODE
  Remove-Item Env:\DK_PRINT_PATH_FILE -ErrorAction SilentlyContinue
  if ($code -eq 0 -and (Test-Path -LiteralPath $pathFile)) {
    $file = ([IO.File]::ReadAllText($pathFile)).Trim()
    Remove-Item -Force -LiteralPath $pathFile -ErrorAction SilentlyContinue
    try {
      Set-Clipboard -Value ([IO.File]::ReadAllText($file)) -ErrorAction Stop
      Write-Host 'The text is copied. Click into the chat with Claude and press Ctrl+V, then Enter.' -ForegroundColor Green
    } catch { Write-Host 'Could not copy the text: open the file, press Ctrl+A and Ctrl+C, and paste it into the chat.' -ForegroundColor Yellow }
    if ([Environment]::OSVersion.Platform -eq 'Win32NT') {
      try { Start-Process -FilePath 'explorer.exe' -ArgumentList ('/select,"' + $file + '"') } catch { Write-Verbose $_.Exception.Message }
    }
  }
  exit $code
}

$gpuCheck = $Rest -contains '--gpu-check'
$args2 = @($Rest | Where-Object { $_ -ne '--no-pull' -and $_ -ne '--gpu-check' })
$statusOnly = (-not $gpuCheck) -and ($args2 -contains '--status')

# Windows 10's classic console: one click inside the window starts a text selection and the render
# FREEZES until a key is pressed ("QuickEdit"). Switch that off for this window; restored at the end.
$oldMode = $null
try {
  if (-not ('DK.ConsoleMode' -as [type])) {
    Add-Type -Namespace DK -Name ConsoleMode -ErrorAction Stop -MemberDefinition @'
[DllImport("kernel32.dll", SetLastError = true)] public static extern IntPtr GetStdHandle(int nStdHandle);
[DllImport("kernel32.dll", SetLastError = true)] public static extern bool GetConsoleMode(IntPtr hConsoleHandle, out uint lpMode);
[DllImport("kernel32.dll", SetLastError = true)] public static extern bool SetConsoleMode(IntPtr hConsoleHandle, uint dwMode);
'@
  }
  $h = [DK.ConsoleMode]::GetStdHandle(-10)             # STD_INPUT_HANDLE
  $mode = [uint32]0
  if ([DK.ConsoleMode]::GetConsoleMode($h, [ref]$mode)) {
    $new = [uint32](([int64]$mode -bor 0x80) -band (-bnot [int64]0x40))   # + ENABLE_EXTENDED_FLAGS, - ENABLE_QUICK_EDIT_MODE
    if ($new -ne $mode -and [DK.ConsoleMode]::SetConsoleMode($h, $new)) { $oldMode = $mode }
  }
} catch { Write-Verbose $_.Exception.Message }

if (-not $gpuCheck -and -not ($Rest -contains '--no-pull') -and -not $statusOnly -and (Get-Command git -ErrorAction SilentlyContinue)) {
  Write-Host '== getting the newest scene files (git pull)' -ForegroundColor Cyan
  $branch = (& git rev-parse --abbrev-ref HEAD).Trim()
  & git pull --no-rebase --ff-only origin $branch
  if ($LASTEXITCODE -ne 0) { Write-Host '   git pull did not work (offline?) - rendering what is here' -ForegroundColor Yellow }
}
if (-not $gpuCheck -and -not $statusOnly) {
  Write-Host '== checking the caches' -ForegroundColor Cyan
  & node pc/build-caches.mjs
  if ($LASTEXITCODE -ne 0) { Write-Host '   some caches are not ready - the episode runner will say what is missing' -ForegroundColor Yellow }
}

# Windows' graphics setting "High performance" for Node.js and Playwright's Chromium (per user, no administrator;
# the same as pc\setup-windows.ps1 does; repeated here because a newer Chromium build lands in a new folder)
if (-not $statusOnly) {
  try {
    $key = 'HKCU:\Software\Microsoft\DirectX\UserGpuPreferences'
    $pw = $env:PLAYWRIGHT_BROWSERS_PATH
    if (-not $pw -or $pw -eq '0') { $pw = Join-Path $env:LOCALAPPDATA 'ms-playwright' }
    $exes = @((Get-Command node -ErrorAction SilentlyContinue).Source)
    if (Test-Path $pw) {
      $exes += @(Get-ChildItem -Path $pw -Directory -Filter 'chromium-*' -ErrorAction SilentlyContinue | ForEach-Object { Join-Path $_.FullName 'chrome-win\chrome.exe' })
      $exes += @(Get-ChildItem -Path $pw -Directory -Filter 'chromium_headless_shell-*' -ErrorAction SilentlyContinue | ForEach-Object { Join-Path $_.FullName 'chrome-win\headless_shell.exe' })
    }
    if ([Environment]::OSVersion.Platform -eq 'Win32NT') {
      if (-not (Test-Path $key)) { New-Item -Path $key -Force | Out-Null }
      foreach ($exe in ($exes | Where-Object { $_ -and (Test-Path -LiteralPath $_) })) {
        $cur = (Get-ItemProperty -Path $key -Name $exe -ErrorAction SilentlyContinue).$exe
        if ("$cur" -notmatch 'GpuPreference=2;') { New-ItemProperty -Path $key -Name $exe -Value (("$cur" -replace 'GpuPreference=\d;', '') + 'GpuPreference=2;') -PropertyType String -Force | Out-Null }
      }
    }
  } catch { Write-Verbose $_.Exception.Message }
}

# keep the PC awake while rendering (released when this window closes)
$awake = $false
if (-not $statusOnly) {
  try {
    if (-not ('DK.Power' -as [type])) {
      Add-Type -Namespace DK -Name Power -MemberDefinition '[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint esFlags);' -ErrorAction Stop
    }
    $awake = ([DK.Power]::SetThreadExecutionState([uint32]'0x80000001') -ne 0)   # ES_CONTINUOUS | ES_SYSTEM_REQUIRED
  } catch { Write-Verbose $_.Exception.Message }
}
if ($awake) { Write-Host '== the PC will not go to sleep while this window is open' -ForegroundColor Cyan }
if (-not $statusOnly) { Write-Host '== if the window ever seems frozen, press Esc (and do not click inside it while it works)' -ForegroundColor Cyan }

if ($gpuCheck) {
  Write-Host '== GPU check: finds the graphics card, renders one 4K test frame, estimates Episode 1' -ForegroundColor Cyan
  & node render/gpu-check.mjs @args2
} else {
  & node render/episode.mjs @args2
}
$code = $LASTEXITCODE
if ($awake) { [void][DK.Power]::SetThreadExecutionState([uint32]'0x80000000') }
if ($null -ne $oldMode) { try { [void][DK.ConsoleMode]::SetConsoleMode([DK.ConsoleMode]::GetStdHandle(-10), [uint32]$oldMode) } catch { Write-Verbose $_.Exception.Message } }
exit $code
