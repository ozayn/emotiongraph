import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
};

/**
 * Shared bottom-sheet (narrow) / centered dialog (wide) shell for read-only detail modals.
 */
export default function DetailSheet({ open, onClose, title, children }: Props) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const t = window.requestAnimationFrame(() => closeRef.current?.focus());
    return () => window.cancelAnimationFrame(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="metric-detail-modal-root" role="presentation">
      <button
        type="button"
        className="metric-detail-modal-backdrop"
        aria-label="Close"
        onClick={onClose}
      />
      <div
        className="metric-detail-modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="metric-detail-modal-handle" aria-hidden />
        <div className="metric-detail-modal-head">
          <h2 id={titleId} className="metric-detail-modal-title">
            {title}
          </h2>
          <button
            ref={closeRef}
            type="button"
            className="metric-detail-modal-close"
            aria-label="Close"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <div className="metric-detail-modal-body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
