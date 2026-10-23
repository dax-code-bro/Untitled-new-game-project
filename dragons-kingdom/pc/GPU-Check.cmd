@echo off
rem Double-click (or type  pc\GPU-Check.cmd  in PowerShell or cmd): finds the graphics card,
rem renders one native 4K test frame and estimates how long Episode 1 takes on this PC.
rem Works in a new window: it finds the Node.js, ffmpeg and Git that the setup put in pc\tools,
rem and needs no change to the PowerShell script policy. Options are passed on, for example
rem   GPU-Check.cmd --all-profiles      (list every way Chromium can reach the graphics card)
rem The result goes to pc\logs\gpu-check-DATE.txt (send that file back).
rem The exit code of the PowerShell script is passed on (kept in DK_RC while the window waits for a
rem key), so a script or the Windows test machine can check it: 0 = ok, see pc/RENDER_ON_YOUR_PC.md.
(
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0render-episode.ps1" --gpu-check %*
  call set DK_RC=%%ERRORLEVEL%%
  setlocal EnableDelayedExpansion
  echo.
  pause
  exit /b !DK_RC!
)
