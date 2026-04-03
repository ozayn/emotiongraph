# Git branches and Railway staging (EmotionGraph)

## Branch strategy

| Branch    | Role        | Railway deploy target                          |
| --------- | ----------- | ---------------------------------------------- |
| **`main`**| Production  | Existing production **API** and **web** services (unchanged). |
| **`staging`** | Pre-production QA | Separate staging services (or a Railway **staging** environment) that track **`staging`**. |

Production stays on **`main`**. All risky or in-progress work lands on **`staging`**, is verified on Railway staging, then merges **`staging` → `main`** when ready.

---

## Repo layout (already compatible)

- **Backend:** `backend/railway.toml` — Nixpacks build, uvicorn on `$PORT`. Railway should use service root **`backend/`** (see comments in that file).
- **Frontend:** Vite app under `frontend/`; production builds need **`VITE_API_BASE`** (and auth-related `VITE_*` vars) set at **build time** for the correct API origin.
- **Config:** Runtime settings come from environment variables (see `backend/app/config.py` and `frontend/.env.example`).

No code change is required for branch-based deploys; only Railway **source branch** and **variables** differ per environment.

---

## Git commands (local)

### One-time: create `staging` and publish it

If `staging` does not exist on the remote yet:

```bash
git checkout main
git pull origin main
git checkout -b staging
git push -u origin staging
```

If **`staging` already exists** on GitHub:

```bash
git fetch origin
git checkout staging
git pull origin staging
```

### Day to day: work on staging

```bash
git checkout staging
git pull origin staging
# …commits…
git push origin staging
```

Railway staging services (once pointed at `staging`) deploy from this push.

### Promote tested changes to production

After staging is verified:

```bash
git checkout main
git pull origin main
git merge staging
# resolve conflicts if any, run tests locally if you want
git push origin main
```

Production services that track **`main`** will deploy.

Optional: keep `staging` aligned with `main` after a release:

```bash
git checkout staging
git merge main
git push origin staging
```

---

## Railway: what to change (staging only — do not alter production blindly)

Railway’s UI evolves; the intent is always: **production services keep deploying from `main`**; **staging deploys from `staging`**.

### Recommended pattern: staging environment or duplicate services

1. **Open your EmotionGraph Railway project.**
2. **Production (`main`):** Do **not** change the branch on existing production API/web unless you intend to switch production away from `main`. Leave them on **`main`**.
3. **Staging:** Either:
   - **A)** Create a Railway **Environment** named `staging`, add **API** + **Web** services linked to the **same GitHub repo**, set each service’s **branch** to **`staging`**, root directory **`backend/`** vs **`frontend/`** as today; **or**
   - **B) Duplicate** the production API and web services, rename them (e.g. `api-staging`, `web-staging`), connect the same repo, set **branch** to **`staging`**, and fix root directories and env vars (below).

4. **Postgres:** Attach a **separate** Postgres (or database) for staging. **Never** reuse production `DATABASE_URL` on staging.

5. **Frontend service:** Staging web must be built with **`VITE_API_BASE`** = **public URL of staging API** (trailing slash rules should match how you set production).

6. **Trigger a deploy** on staging services after the first push to `staging`.

### Google OAuth (if you use sign-in)

In **Google Cloud Console → OAuth client → Authorized JavaScript origins**, add the **staging** site origin (e.g. `https://your-staging-web.up.railway.app`). Backend **`GOOGLE_OAUTH_CLIENT_ID`** and frontend **`VITE_GOOGLE_CLIENT_ID`** can match production if it is the same OAuth client.

---

## Environment variables: staging vs production

Set these **per environment** in Railway (do not copy production DB secrets to staging).

### Must differ

| Variable | Notes |
| -------- | ----- |
| **`DATABASE_URL`** | Staging **must** use its **own** database. |
| **`CORS_ORIGINS`** (backend) | Include the **staging frontend origin** exactly (scheme + host, no path). Keep production origins too only if one backend serves both (not recommended); usually **staging API** lists **only** staging UI origins, production API lists production + localhost as needed. |
| **`VITE_API_BASE`** (frontend build) | Staging build → **staging API** public URL. Production build → **production API** URL. |

### Strongly recommended to differ

| Variable | Notes |
| -------- | ----- |
| **`AUTH_JWT_SECRET`** | Use a **different** random secret on staging so JWTs from staging cannot be replayed on production (and vice versa). |

### Often the same (optional to split)

| Variable | Notes |
| -------- | ----- |
| **`GROQ_API_KEY`**, **`ANTHROPIC_API_KEY`** | Same keys are fine; separate keys if you want usage/cost isolation. |
| **`GOOGLE_OAUTH_CLIENT_ID`** / **`VITE_GOOGLE_CLIENT_ID`** | Same client ID if staging origin is added to Google Console. |
| **`ADMIN_EMAIL_ALLOWLIST`** | Often identical; adjust if staging admins differ. |

### Review for parity vs lock-down

Backend flags from `backend/app/config.py` — use **staging** to mirror production policy before merging to `main`:

- **`ALLOW_UNAUTHENTICATED_FULL_USER_LIST`**, **`ALLOW_PUBLIC_DEMO_USER_LIST`**, **`ALLOW_X_USER_ID_ANY`** — align with what you want in production; avoid leaving insecure flags enabled on staging if that staging is internet-exposed.

Frontend: **`VITE_USE_GOOGLE_AUTH`**, **`VITE_ALLOW_LOCAL_PRIVATE_DEV`**, **`VITE_GOOGLE_AUTH_DEV_BYPASS`** — keep **dev bypasses off** on public staging unless you explicitly want that risk.

---

## Recommended workflow (short)

1. **`git checkout staging`** → implement feature or fix → commit → **`git push origin staging`**.
2. Wait for **Railway staging** deploy; run **migrations** against staging DB if schema changed (see `backend/MIGRATIONS.md`).
3. Test on **staging URLs** (auth, CORS, API, DB).
4. **`git checkout main`** → **`git merge staging`** → **`git push origin main`** → production deploys from **`main`**.
5. Optionally **`git checkout staging`** → **`git merge main`** → **`git push`** to refresh `staging`.

---

## Summary

- **`main`** = production; Railway production **API** and **web** stay on **`main`**.
- **`staging`** = integration/QA; Railway staging services use branch **`staging`**, **separate `DATABASE_URL`**, **staging `CORS_ORIGINS`**, and **staging `VITE_API_BASE`**.
- Promote by merging **`staging` → `main`** after staging verification; do not retarget production services away from **`main`** unless you intend to.
