#!/bin/bash
# Start Legend AI — API + Web

set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if [ ! -f "$ROOT/.env" ]; then
  echo "Missing .env — copy .env.example to .env and add your API keys"
  exit 1
fi

source "$ROOT/.env"

echo "Starting Legend API..."
cd "$ROOT"
uvicorn api.main:app --host 0.0.0.0 --port 8000 --reload &
API_PID=$!

echo "Starting Legend Web..."
cd "$ROOT/web"
npm run dev &
WEB_PID=$!

echo ""
echo "Legend is online."
echo "  Web:  http://localhost:3000"
echo "  API:  http://localhost:8000"
echo "  Docs: http://localhost:8000/docs"
echo ""
echo "Press Ctrl+C to stop."

trap "kill $API_PID $WEB_PID 2>/dev/null; exit" INT TERM
wait
