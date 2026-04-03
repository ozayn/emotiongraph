# Database migrations (Alembic)

EmotionGraph uses [Alembic](https://alembic.sqlalchemy.org/) with the same `DATABASE_URL` as the FastAPI app (`backend/.env` or environment variables; see `app.config`).

## Concepts

- **Revision scripts** live in `alembic/versions/`.
- The **current schema** is defined by SQLAlchemy models under `app.models` and `app.tracker_config_models`.
- **`alembic_version`** stores which revision the database is on. New columns and tables are added by **new** revisions, not by `create_all`.

## Gotchas

### PostgreSQL boolean columns

**Do not** use integer `1` / `0` in Alembic migrations or raw SQL (`INSERT`, `UPDATE`, `VALUES`, defaults) for `BOOLEAN` columns — PostgreSQL will reject the type mismatch.

Use real booleans instead:

- SQL literals: `TRUE` / `FALSE`
- Or bound parameters with Python `True` / `False` (e.g. `conn.execute(sa.text("INSERT INTO t (b) VALUES (:flag)"), {"flag": True})`)

SQLite in tests often tolerates `0`/`1`; production Postgres will not — write migrations for Postgres correctness first.

## Create a migration

From the **`backend/`** directory (same cwd as `./scripts/run_backend.sh`):

```bash
# After changing models, autogenerate a revision (review the file before committing!)
.venv/bin/alembic revision --autogenerate -m "describe your change"

# Or write an empty migration and edit SQL by hand
.venv/bin/alembic revision -m "describe your change"
```

Always open the generated file under `alembic/versions/`, verify `upgrade()` / `downgrade()`, and adjust names or ordering if autogenerate missed something.

## Run migrations locally

```bash
cd backend
.venv/bin/pip install -r requirements.txt   # includes alembic
.venv/bin/alembic upgrade head
```

On **`./scripts/run_backend.sh`**, the app also runs migrations at import time (`ensure_schema_via_alembic()` in `app.db`), so a normal dev start applies pending upgrades automatically.

For a **database that already had the full schema from older `create_all` usage** but no `alembic_version` table, the first startup **stamps** the current head once (no DDL) so existing rows stay intact; afterwards only real revisions run.

## Run migrations in production

Run **`alembic upgrade head`** against production `DATABASE_URL` **before** or **as part of** the deploy, e.g.:

```bash
cd backend
export DATABASE_URL="postgresql+psycopg://..."
pip install -r requirements.txt
alembic upgrade head
```

(Use the same URL normalization the app uses: `postgres://` is fine; the app upgrades it to `postgresql+psycopg://`.)

Railway, Render, Fly, etc.: add a **release command** or one-off job that runs `alembic upgrade head` with `DATABASE_URL` set. The running web process still calls `ensure_schema_via_alembic()` on boot as a safety net, but explicit upgrade in the pipeline is clearer and fails the deploy if a migration breaks.

## SQLite batch mode

`alembic/env.py` enables **`render_as_batch`** for SQLite so future revisions can use `op.add_column` / `op.alter_column` in a way SQLite supports.

## Why this avoids “missing column” errors

Previously, SQLAlchemy’s `create_all()` **creates missing tables but does not add columns** to existing tables. After a model change (e.g. `users.timezone`), old SQLite/Postgres files kept the old layout while the ORM expected new columns → **`OperationalError` / query failures**.

With Alembic, schema changes are **versioned**: each change is a revision that runs `ALTER TABLE` / `CREATE TABLE` as needed, and `alembic_version` records what ran. Deploys and local upgrades apply the same steps, so the database and models stay aligned.
