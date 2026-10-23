@echo off
rem Double-click: puts everything the Claude session needs to know about this PC (the graphics card, the
rem newest GPU check, the end of the setup / cache / render logs, the render status) into ONE text file,
rem pc\logs\send-to-claude-DATE.txt, copies its text (paste it into the chat with Ctrl+V) and opens its folder.
rem Your user folder's name is replaced by "~" in it. Nothing is sent anywhere by itself.
(
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0render-episode.ps1" --send-logs
  echo.
  pause
  exit /b
)
