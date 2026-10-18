@echo off
rem Double-click: install / repair everything needed to render Dragon's Kingdom on this PC.
rem Safe to run again any time.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup-windows.ps1" %*
echo.
pause
