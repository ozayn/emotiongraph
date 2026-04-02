import { useCallback, useEffect, useId, useRef, useState } from "react";

type Props = {
  /** Used for `aria-label` on the trigger and `aria-label` on the help region */
  label: string;
  children: React.ReactNode;
  className?: string;
};

/**
 * Compact help: tap/click or Enter/Space toggles; Escape closes.
 * Hover (fine pointer) or keyboard focus on the trigger also reveals the panel.
 */
export default function InlineHelp({ label, children, className = "" }: Props) {
  const panelId = useId();
  const wrapRef = useRef<HTMLSpanElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [hoverOpen, setHoverOpen] = useState(false);
  const [focusInside, setFocusInside] = useState(false);
  const [hoverCapable, setHoverCapable] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(hover: hover) and (pointer: fine)");
    const sync = () => setHoverCapable(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const show = expanded || focusInside || (hoverCapable && hoverOpen);

  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpanded(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded]);

  useEffect(() => {
    if (!expanded) return;
    const onPointer = (e: PointerEvent) => {
      const el = wrapRef.current;
      if (el && !el.contains(e.target as Node)) setExpanded(false);
    };
    document.addEventListener("pointerdown", onPointer, true);
    return () => document.removeEventListener("pointerdown", onPointer, true);
  }, [expanded]);

  const toggle = useCallback(() => setExpanded((v) => !v), []);

  return (
    <span
      ref={wrapRef}
      className={`inline-help ${className}`.trim()}
      onMouseEnter={() => setHoverOpen(true)}
      onMouseLeave={() => setHoverOpen(false)}
      onFocusCapture={() => setFocusInside(true)}
      onBlurCapture={(e) => {
        const next = e.relatedTarget as Node | null;
        if (next && e.currentTarget.contains(next)) return;
        setFocusInside(false);
      }}
    >
      <button
        type="button"
        className="inline-help-trigger"
        aria-expanded={expanded}
        aria-controls={panelId}
        aria-label={`Help: ${label}`}
        onClick={toggle}
      >
        <svg className="inline-help-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          <circle cx="12" cy="12" r="10" />
          <path d="M12 16v-4M12 8h.01" />
        </svg>
      </button>
      <div
        id={panelId}
        role="region"
        className={`inline-help-panel${show ? " inline-help-panel--open" : ""}`}
        aria-label={label}
        aria-hidden={!show}
      >
        <div className="inline-help-panel-inner">{children}</div>
      </div>
    </span>
  );
}
