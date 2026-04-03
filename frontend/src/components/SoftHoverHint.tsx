import { useId, useState, type ReactNode } from "react";

export type SoftHoverHintVariant = "single" | "multiline";

type Props = {
  /** Shown in a themed popover on hover (and on focus when `showOnFocus` is set). */
  hint?: string;
  children: ReactNode;
  className?: string;
  /** `multiline` wraps long text; `single` stays one line (default). */
  variant?: SoftHoverHintVariant;
  /**
   * When true, the wrapper receives keyboard focus so hints appear on Tab (use sparingly).
   * Prefer leaving false and relying on `aria-label` on a parent control.
   */
  showOnFocus?: boolean;
};

/**
 * App-themed hover hint (native `title` cannot match our design system).
 * Styling uses global `--hint-*` tokens in `styles.css`.
 */
export default function SoftHoverHint({
  hint,
  children,
  className = "",
  variant = "single",
  showOnFocus = false,
}: Props) {
  const tipId = useId();
  const [open, setOpen] = useState(false);

  if (!hint) {
    return <>{children}</>;
  }

  const popClass = [
    "soft-hover-hint__pop",
    variant === "multiline" ? "soft-hover-hint__pop--multiline" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span
      className={["soft-hover-hint", showOnFocus ? "soft-hover-hint--focusable" : "", className]
        .filter(Boolean)
        .join(" ")}
      tabIndex={showOnFocus ? 0 : undefined}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={showOnFocus ? () => setOpen(true) : undefined}
      onBlur={showOnFocus ? () => setOpen(false) : undefined}
    >
      {children}
      {open ? (
        <span id={tipId} role="tooltip" className={popClass}>
          {hint}
        </span>
      ) : null}
    </span>
  );
}
