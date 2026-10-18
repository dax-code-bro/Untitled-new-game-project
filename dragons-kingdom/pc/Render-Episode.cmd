@echo off
rem Double-click: get the newest scene files (git pull) and continue rendering
rem Dragon's Kingdom Episode 1. Stop any time with Ctrl+C; double-click again to continue.
rem Progress only:  Render-Episode.cmd --status
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0render-episode.ps1" %*
echo.
pause
