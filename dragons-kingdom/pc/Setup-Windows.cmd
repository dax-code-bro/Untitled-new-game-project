@echo off
rem Double-click: install / repair everything needed to render Dragon's Kingdom on this PC.
rem Safe to run again any time.
rem The commands are one block in brackets on purpose: cmd.exe reads the whole block before
rem running it, so a "git pull" that updates this very file cannot make cmd run half-lines.
(
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup-windows.ps1" %*
  echo.
  pause
  exit /b
)
