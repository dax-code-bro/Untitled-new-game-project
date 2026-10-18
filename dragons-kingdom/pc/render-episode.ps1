<#
.SYNOPSIS
  Continue rendering Dragon's Kingdom Episode 1 (what pc\Render-Episode.cmd and the desktop shortcut run).
  1. git pull: the newest scene files from the cloud
  2. node pc\build-caches.mjs: rebuilds a cache only if the pull changed its code (quick otherwise)
  3. node render\episode.mjs: renders what is ready, scene by scene; stops cleanly with Ctrl+C
  The PC is kept awake (no sleep) while this window is open.
  Extra words are passed on, e.g.  Render-Episode.cmd --status   or   --max-hours 8   or   --no-pull
#>
param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Rest = @())
$ErrorActionPreference = 'Continue'
$proj = Split-Path -Parent $PSScriptRoot
$tools = Join-Path $proj 'pc\tools'
$extra = @((Join-Path $tools 'node'), (Join-Path $tools 'ffmpeg\bin'), (Join-Path $env:LOCALAPPDATA 'DragonsKingdom\mingit\cmd')) | Where-Object { Test-Path $_ }
if ($extra) { $env:Path = ($extra -join ';') + ';' + $env:Path }
Set-Location $proj
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Write-Host 'Node.js is missing: run pc\Setup-Windows.cmd first.' -ForegroundColor Red; exit 1 }

$args2 = @($Rest | Where-Object { $_ -ne '--no-pull' })
$statusOnly = $args2 -contains '--status'
if (-not ($Rest -contains '--no-pull') -and -not $statusOnly -and (Get-Command git -ErrorAction SilentlyContinue)) {
  Write-Host '== getting the newest scene files (git pull)' -ForegroundColor Cyan
  $branch = (& git rev-parse --abbrev-ref HEAD).Trim()
  & git pull --no-rebase --ff-only origin $branch
  if ($LASTEXITCODE -ne 0) { Write-Host '   git pull did not work (offline?) - rendering what is here' -ForegroundColor Yellow }
}
if (-not $statusOnly) {
  Write-Host '== checking the caches' -ForegroundColor Cyan
  & node pc/build-caches.mjs
  if ($LASTEXITCODE -ne 0) { Write-Host '   some caches are not ready - the episode runner will say what is missing' -ForegroundColor Yellow }
}

# keep the PC awake while rendering (released when this window closes)
$awake = $false
try {
  Add-Type -Namespace DK -Name Power -MemberDefinition '[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint esFlags);' -ErrorAction Stop
  [void][DK.Power]::SetThreadExecutionState([uint32]'0x80000001')   # ES_CONTINUOUS | ES_SYSTEM_REQUIRED
  $awake = $true
} catch { Write-Verbose $_.Exception.Message }
if ($awake -and -not $statusOnly) { Write-Host '== the PC will not go to sleep while this window is open' -ForegroundColor Cyan }

& node render/episode.mjs @args2
$code = $LASTEXITCODE
if ($awake) { [void][DK.Power]::SetThreadExecutionState([uint32]'0x80000000') }
exit $code
