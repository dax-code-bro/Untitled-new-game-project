#!/usr/bin/env bash
cd "$(dirname "$0")"
echo "Serving demo at http://localhost:8099  (Ctrl-C to stop)"
python3 -m http.server 8099
