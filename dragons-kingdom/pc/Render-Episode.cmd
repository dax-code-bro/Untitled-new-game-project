@echo off
rem Double-click: get the newest scene files (git pull) and continue rendering
rem Dragon's Kingdom Episode 1. Stop any time with Ctrl+C; double-click again to continue.
rem Progress only:  Render-Episode.cmd --status        GPU check:  GPU-Check.cmd
rem The commands are one block in brackets on purpose: cmd.exe reads the whole block before
rem running it, so a "git pull" that updates this very file cannot make cmd run half-lines.
(
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0render-episode.ps1" %*
  echo.
  pause
  exit /b
)
