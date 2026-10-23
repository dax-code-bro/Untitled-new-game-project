@echo off
rem Double-click: get the newest scene files (git pull) and continue rendering
rem Dragon's Kingdom Episode 1. Stop any time with Ctrl+C; double-click again to continue.
rem Progress only:  Render-Episode.cmd --status        GPU check:  GPU-Check.cmd
rem The commands are one block in brackets on purpose: cmd.exe reads the whole block before
rem running it, so a "git pull" that updates this very file cannot make cmd run half-lines.
rem The exit code of the PowerShell script is passed on (kept in DK_RC while the window waits for a
rem key), so a script or the Windows test machine can check it: 0 = ok, see pc/RENDER_ON_YOUR_PC.md.
(
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0render-episode.ps1" %*
  call set DK_RC=%%ERRORLEVEL%%
  setlocal EnableDelayedExpansion
  echo.
  pause
  exit /b !DK_RC!
)
