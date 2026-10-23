@echo off
rem Double-click: puts everything the Claude session needs to know about this PC (the graphics card, the
rem newest GPU check, the end of the setup / cache / render logs, the render status) into ONE text file,
rem pc\logs\send-to-claude-DATE.txt, copies its text (paste it into the chat with Ctrl+V) and opens its folder.
rem Your user folder's name is replaced by "~" in it. Nothing is sent anywhere by itself.
rem The exit code of the PowerShell script is passed on (kept in DK_RC while the window waits for a
rem key), so a script or the Windows test machine can check it: 0 = ok, see pc/RENDER_ON_YOUR_PC.md.
(
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0render-episode.ps1" --send-logs
  call set DK_RC=%%ERRORLEVEL%%
  setlocal EnableDelayedExpansion
  echo.
  pause
  exit /b !DK_RC!
)
