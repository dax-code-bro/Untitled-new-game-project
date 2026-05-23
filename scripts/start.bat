@echo off
REM Start Legend AI on Windows

cd /d "%~dp0.."

if not exist .env (
  echo Missing .env — copy .env.example to .env and add your API keys
  pause
  exit /b 1
)

echo Starting Legend API...
start "Legend API" cmd /k "uvicorn api.main:app --host 0.0.0.0 --port 8000 --reload"

echo Starting Legend Web...
cd web
start "Legend Web" cmd /k "npm run dev"
cd ..

echo.
echo Legend is online.
echo   Web:  http://localhost:3000
echo   API:  http://localhost:8000
echo   Docs: http://localhost:8000/docs
echo.
pause
