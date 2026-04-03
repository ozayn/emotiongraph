import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchOwnerSummary } from "../api";
import type { OwnerSummary } from "../types";
import { useSession } from "../session/SessionContext";

function kv(label: string, value: string) {
  return (
    <div className="owner-tools-kv">
      <dt className="owner-tools-kv-label muted small">{label}</dt>
      <dd className="owner-tools-kv-val">{value}</dd>
    </div>
  );
}

export default function OwnerToolsPage() {
  const { pathFor } = useSession();
  const [data, setData] = useState<OwnerSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void fetchOwnerSummary()
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load summary");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const env = data?.environment;
  const mig = data?.migrations;
  const usage = data?.usage;
  const dbg = data?.debug;

  return (
    <div className="owner-tools-page">
      <nav className="owner-tools-nav">
        <Link className="linkish owner-tools-back" to={pathFor("/profile#workspace")}>
          ← Profile
        </Link>
      </nav>

      <header className="owner-tools-head">
        <h1 className="owner-tools-title">Internal tools</h1>
        <p className="owner-tools-lead muted small">
          Owner-only read-only overview. Separate from <Link to={pathFor("/profile")}>Profile</Link> and{" "}
          <Link to={pathFor("/admin")}>Tracker configuration</Link>.
        </p>
      </header>

      {loading ? <p className="muted owner-tools-status">Loading…</p> : null}
      {error ? (
        <p className="error-inline owner-tools-status" role="alert">
          {error}
        </p>
      ) : null}

      {!loading && !error && data ? (
        <div className="internal-tool-stack owner-tools-stack">
          <section className="internal-tool-card" aria-labelledby="owner-env-heading">
            <h2 id="owner-env-heading" className="internal-tool-card-title">
              Environment
            </h2>
            <p className="internal-tool-card-hint muted small">Non-secret flags only — no database URLs or API keys.</p>
            <dl className="owner-tools-dl">
              {kv("Database profile", env?.database_profile ?? "—")}
              {kv("CORS allowed origins (count)", String(env?.cors_allowed_origin_count ?? "—"))}
              {kv("Unauthenticated GET /users", env?.allow_unauthenticated_full_user_list ? "On" : "Off")}
              {kv("Public demo user list", env?.allow_public_demo_user_list ? "On" : "Off")}
              {kv("X-User-Id for any user", env?.allow_x_user_id_any ? "On" : "Off")}
              {kv("Admin allowlist configured", env?.admin_allowlist_configured ? "Yes" : "No")}
              {kv("Owner allowlist configured", env?.owner_allowlist_configured ? "Yes" : "No")}
            </dl>
          </section>

          <section className="internal-tool-card" aria-labelledby="owner-schema-heading">
            <h2 id="owner-schema-heading" className="internal-tool-card-title">
              Schema &amp; migrations
            </h2>
            <p className="internal-tool-card-hint muted small">Alembic revision in the connected database vs script head.</p>
            <dl className="owner-tools-dl">
              {kv(
                "Current DB revision(s)",
                mig?.current_revisions?.length ? mig.current_revisions.join(", ") : "— (no alembic_version rows)",
              )}
              {kv("Script head revision", mig?.script_head_revision ?? "—")}
              {kv("Multiple heads in scripts", mig?.script_has_multiple_heads ? "Yes" : "No")}
              {kv(
                "Database at head",
                mig?.database_at_head === true ? "Yes" : mig?.database_at_head === false ? "No" : "Unknown",
              )}
            </dl>
          </section>

          <section className="internal-tool-card" aria-labelledby="owner-usage-heading">
            <h2 id="owner-usage-heading" className="internal-tool-card-title">
              Usage (totals)
            </h2>
            <p className="internal-tool-card-hint muted small">Aggregate counts across all users.</p>
            <dl className="owner-tools-dl">
              {kv("Users", String(usage?.user_count ?? "—"))}
              {kv("Log entries", String(usage?.log_entry_count ?? "—"))}
              {kv("Tracker field definitions", String(usage?.tracker_field_definition_count ?? "—"))}
            </dl>
          </section>

          <section className="internal-tool-card" aria-labelledby="owner-debug-heading">
            <h2 id="owner-debug-heading" className="internal-tool-card-title">
              Internal / debug
            </h2>
            <p className="internal-tool-card-hint muted small">Call with an owner session (Bearer); not triggered from this page.</p>
            <p className="owner-tools-debug-path mono small">
              POST {dbg?.log_save_dry_run_post_path ?? "/debug/logs"}
            </p>
            <p className="owner-tools-debug-note muted small">{dbg?.note}</p>
          </section>
        </div>
      ) : null}
    </div>
  );
}
