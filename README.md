# EmotionGraph — local development

## Quick start

From the repository root:

1. Copy `backend/.env.example` to `backend/.env` and set:
   - **`GROQ_API_KEY`** — required for **`POST /transcribe`** (Whisper-class STT).
   - **`ANTHROPIC_API_KEY`** — primary for **`POST /extract-logs`** (Claude turns the transcript into structured JSON).
   - **`GROQ_API_KEY`** (again, same key is fine) — fallback for **`POST /extract-logs`** if Claude fails, times out, or returns output that does not validate; Groq is not used for extraction when Claude succeeds.
2. Start everything (backend + frontend) in one terminal:

   ```bash
   chmod +x scripts/run_backend.sh scripts/run_frontend.sh scripts/run_local.sh   # first time only
   ./scripts/run_local.sh
   ```

   Press **Ctrl+C** to stop both processes.

Or run **backend** and **frontend** in separate terminals:

```bash
./scripts/run_backend.sh
```

```bash
./scripts/run_frontend.sh
```

The Vite dev server proxies API routes to **`http://127.0.0.1:8100`**. For a custom API base, set `VITE_API_BASE` (for example `http://127.0.0.1:8100`).

### Production frontend (CORS)

The deployed UI at **`https://emotiongraph.ozayn.com`** is included in the backend’s default **`CORS_ORIGINS`**. Override with env if you need a different list (comma-separated). The previous Railway frontend hostname remains in the default list for older deploys.

### Outbound proxy (backend scaffold)

Optional env vars for a future single-URL outbound proxy (not used by outbound calls yet):

- `USE_OUTBOUND_PROXY=false`
- `OUTBOUND_PROXY_URL=http://username:password@ip:port`

## Scripts

- **`scripts/run_backend.sh`** — `cd`s into `backend/`, creates `.venv` if missing, installs Python dependencies when `requirements.txt` is new or changed, runs FastAPI with **uvicorn** on **127.0.0.1:8100**.
- **`scripts/run_frontend.sh`** — `cd`s into `frontend/`, runs **`npm install`** if `node_modules` is missing, then **`npm run dev`** (default **5173**).
- **`scripts/run_local.sh`** — Starts backend and frontend together on macOS; **Ctrl+C** stops both; prints which ports are in use (**8100** and **5173**).
