import { useRef, useState } from "react";
import { commitLogsImport, previewLogsImportCsv } from "../api";
import type { LogImportRow, LogsImportPreviewResponse } from "../types";
import InlineHelp from "./InlineHelp";

type Props = {
  userId: number;
  /** Called after a successful import commit */
  onCommitted?: () => void;
};

export default function ProfileCsvImport({ userId, onCommitted }: Props) {
  const [importPreview, setImportPreview] = useState<LogsImportPreviewResponse | null>(null);
  const [importInputKey, setImportInputKey] = useState(0);
  const [importSelectedName, setImportSelectedName] = useState<string | null>(null);
  const [importPickErr, setImportPickErr] = useState<string | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [importCommitErr, setImportCommitErr] = useState<string | null>(null);
  const importFileRef = useRef<File | null>(null);

  const onImportFilePicked = (files: FileList | null) => {
    setImportPreview(null);
    setImportCommitErr(null);
    setImportPickErr(null);
    const f = files?.[0] ?? null;
    importFileRef.current = f;
    setImportSelectedName(f?.name ?? null);
  };

  const runImportPreview = async () => {
    const f = importFileRef.current;
    if (!f) {
      setImportPickErr("Choose a CSV file first.");
      return;
    }
    setImportBusy(true);
    setImportPickErr(null);
    setImportCommitErr(null);
    try {
      const prev = await previewLogsImportCsv(userId, f);
      setImportPreview(prev);
    } catch (e) {
      setImportPickErr(e instanceof Error ? e.message : "Preview failed");
    } finally {
      setImportBusy(false);
    }
  };

  const runImportCommit = async () => {
    if (!importPreview?.rows.length) return;
    setImportCommitErr(null);
    setImportBusy(true);
    try {
      await commitLogsImport(userId, importPreview.rows);
      setImportPreview(null);
      importFileRef.current = null;
      setImportSelectedName(null);
      setImportInputKey((k) => k + 1);
      onCommitted?.();
    } catch (e) {
      setImportCommitErr(e instanceof Error ? e.message : "Import failed");
    } finally {
      setImportBusy(false);
    }
  };

  return (
    <div className="profile-settings-field profile-import-field profile-data-tool">
      <div className="profile-data-kicker-row">
        <h3 className="profile-data-kicker">Import</h3>
        <InlineHelp label="CSV import">
          <p>
            UTF-8 CSV with a <span className="mono">log_date</span> column per row. Preview first, then save. Imported rows are stored with source{" "}
            <span className="mono">import</span>.
          </p>
        </InlineHelp>
      </div>
      <div className="profile-data-tool-body">
        <div className="entries-import-upload">
          <div className="entries-import-dropzone">
            <input
              id="profile-import-csv-input"
              key={importInputKey}
              type="file"
              accept=".csv,text/csv"
              className="entries-import-input-hidden"
              aria-label="Choose CSV file to import"
              onChange={(ev) => onImportFilePicked(ev.target.files)}
            />
            <div className="entries-import-dropzone-inner">
              <label htmlFor="profile-import-csv-input" className="entries-import-choose">
                Choose CSV
              </label>
              <span className="entries-import-filename mono muted small" aria-live="polite">
                {importSelectedName ?? "No file selected"}
              </span>
            </div>
          </div>
          <button type="button" className="btn ghost small entries-import-preview-btn" disabled={importBusy} onClick={() => void runImportPreview()}>
            {importBusy && !importPreview ? "Preview…" : "Preview"}
          </button>
        </div>
        {importPickErr && <p className="error-inline">{importPickErr}</p>}
        {importCommitErr && <p className="error-inline">{importCommitErr}</p>}
        {importPreview && (
          <div className="entries-import-preview">
            <p className="muted small profile-import-preview-meta" aria-live="polite">
              <strong>{importPreview.row_count}</strong> {importPreview.row_count === 1 ? "row" : "rows"}
              {importPreview.parse_errors.length > 0 ? " · some lines skipped" : ""}
            </p>
          {importPreview.parse_errors.length > 0 && (
            <ul className="entries-import-errors muted small">
              {importPreview.parse_errors.slice(0, 8).map((err) => (
                <li key={err}>{err}</li>
              ))}
              {importPreview.parse_errors.length > 8 && <li>…</li>}
            </ul>
          )}
          {importPreview.rows.length > 0 && (
            <div className="entries-import-table-wrap">
              <table className="entries-import-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Start</th>
                    <th>Event</th>
                  </tr>
                </thead>
                <tbody>
                  {importPreview.rows.slice(0, 8).map((r: LogImportRow, i: number) => (
                    <tr key={`${r.log_date}-${i}`}>
                      <td className="mono">{r.log_date}</td>
                      <td className="mono">{r.start_time ?? "—"}</td>
                      <td>{r.event ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <button
            type="button"
            className="btn primary small entries-import-save"
            disabled={importBusy || importPreview.rows.length === 0}
            onClick={() => void runImportCommit()}
          >
            {importBusy ? "Saving…" : `Save ${importPreview.row_count} imported row${importPreview.row_count === 1 ? "" : "s"}`}
          </button>
        </div>
        )}
      </div>
    </div>
  );
}
