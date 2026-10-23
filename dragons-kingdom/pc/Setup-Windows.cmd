@echo off
rem Double-click: install / repair everything needed to render Dragon's Kingdom on this PC.
rem Safe to run again any time.
rem The commands are one block in brackets on purpose: cmd.exe reads the whole block before
rem running it, so a "git pull" that updates this very file cannot make cmd run half-lines.
rem The exit code of the PowerShell script is passed on (kept in DK_RC while the window waits for a
rem key), so a script or the Windows test machine can check it: 0 = ok, see pc/RENDER_ON_YOUR_PC.md.
(
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup-windows.ps1" %*
  call set DK_RC=%%ERRORLEVEL%%
  setlocal EnableDelayedExpansion
  echo.
  pause
  exit /b !DK_RC!
)
