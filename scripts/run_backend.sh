#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/backend"

if [ ! -d .venv ]; then
  python3 -m venv .venv
fi

if [ ! -f .venv/.deps-stamp ] || [ requirements.txt -nt .venv/.deps-stamp ]; then
  .venv/bin/pip install -r requirements.txt
  touch .venv/.deps-stamp
fi

exec .venv/bin/uvicorn app.main:app --reload --host 127.0.0.1 --port 8100
