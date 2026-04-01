#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "Local development"
echo "  Backend API:  http://127.0.0.1:8100"
echo "  Frontend UI:  http://127.0.0.1:5173  (Vite; proxies API to 8100)"
echo ""

BACK_PID=""
FRONT_PID=""

cleanup() {
  local s=$?
  echo ""
  echo "Stopping backend and frontend…"
  if [ -n "${BACK_PID}" ]; then
    kill "${BACK_PID}" 2>/dev/null || true
  fi
  if [ -n "${FRONT_PID}" ]; then
    kill "${FRONT_PID}" 2>/dev/null || true
  fi
  wait "${BACK_PID}" 2>/dev/null || true
  wait "${FRONT_PID}" 2>/dev/null || true
  exit "${s}"
}

trap cleanup INT TERM

"${ROOT}/scripts/run_backend.sh" &
BACK_PID=$!

"${ROOT}/scripts/run_frontend.sh" &
FRONT_PID=$!

wait
