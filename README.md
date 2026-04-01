# Emotiongraph — local development

## Backend (port **8100**)

From `backend/`:

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp .env.example .env   # add OPENAI_API_KEY
.venv/bin/uvicorn app.main:app --reload --host 127.0.0.1 --port 8100
```

The API listens at `http://127.0.0.1:8100` (not port 5000).

## Frontend

From `frontend/`:

```bash
npm install
npm run dev
```

Vite proxies API routes to `http://127.0.0.1:8100`. For a custom API base, set `VITE_API_BASE` (for example `http://127.0.0.1:8100`).
