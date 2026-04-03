import {
  Fragment,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { useFinePointerTitle } from "../hooks/useFinePointerTitle";
import SoftHoverHint from "./SoftHoverHint";

export type CalmSelectOption = { value: string; label: string; hint?: string };

type Variant = "field" | "compact" | "dense" | "timezone";

type Props = {
  value: string;
  onChange: (v: string) => void;
  options: CalmSelectOption[];
  variant?: Variant;
  /** After these option indices, render a visual separator (keyboard nav skips dividers). */
  dividerAfterIndices?: number[];
  disabled?: boolean;
  id?: string;
  className?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  /** When value is missing from options */
  placeholder?: string;
  /** Disabled trigger label when there are no options */
  emptyStateLabel?: string;
  /** Themed hover hint on the trigger (fine pointer only; e.g. full email when label is truncated) */
  title?: string;
  "aria-busy"?: boolean;
  "aria-describedby"?: string;
};

function Chevron({ open }: { open: boolean }) {
  return (
    <span className="calm-select-chevron" aria-hidden="true">
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M3 4.5L6 7.5L9 4.5"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={open ? "calm-select-chevron-path calm-select-chevron-path--open" : "calm-select-chevron-path"}
        />
      </svg>
    </span>
  );
}

export default function CalmSelect({
  value,
  onChange,
  options,
  variant = "field",
  dividerAfterIndices,
  disabled = false,
  id: idProp,
  className = "",
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  placeholder = "Choose…",
  emptyStateLabel = "—",
  title,
  "aria-busy": ariaBusy,
  "aria-describedby": ariaDescribedBy,
}: Props) {
  const reactId = useId();
  const listboxId = `${reactId}-listbox`;
  const triggerId = idProp ?? `${reactId}-trigger`;

  const [open, setOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const highlightRef = useRef(0);
  const [popoverStyle, setPopoverStyle] = useState<CSSProperties>({});

  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  highlightRef.current = highlightIndex;

  const empty = options.length === 0;
  const isDisabled = disabled || empty;

  const selectedIndex = options.findIndex((o) => o.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined;
  const displayLabel = selected?.label ?? (value ? value : placeholder);

  const syncHighlightToSelection = useCallback(() => {
    const idx = options.findIndex((o) => o.value === value);
    setHighlightIndex(idx >= 0 ? idx : 0);
  }, [options, value]);

  const updatePopoverPosition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const gap = 6;
    const maxH =
      variant === "timezone"
        ? Math.min(window.innerHeight * 0.34, 208)
        : Math.min(window.innerHeight * 0.44, 260);
    setPopoverStyle({
      position: "fixed",
      left: rect.left,
      width: Math.max(rect.width, 160),
      top: rect.bottom + gap,
      maxHeight: maxH,
      zIndex: 120,
    });
  }, [variant]);

  useLayoutEffect(() => {
    if (!open) return;
    updatePopoverPosition();
    const onScrollOrResize = () => updatePopoverPosition();
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [open, updatePopoverPosition, variant]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || listRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useLayoutEffect(() => {
    if (!open || options.length === 0) return;
    syncHighlightToSelection();
    listRef.current?.focus();
    // options.length only — avoid new array identity each render (e.g. users.map)
  }, [open, value, options.length, syncHighlightToSelection]);

  useEffect(() => {
    if (!open) return;
    document.getElementById(`${listboxId}-opt-${highlightIndex}`)?.scrollIntoView({ block: "nearest" });
  }, [highlightIndex, open, listboxId]);

  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  const chooseIndex = useCallback(
    (idx: number) => {
      const opt = options[idx];
      if (!opt) return;
      onChange(opt.value);
      close();
    },
    [options, onChange, close],
  );

  const onTriggerKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (isDisabled) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setOpen(true);
    }
  };

  const onListKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (options.length === 0) return;
    switch (e.key) {
      case "ArrowDown": {
        e.preventDefault();
        setHighlightIndex((i) => Math.min(options.length - 1, i + 1));
        break;
      }
      case "ArrowUp": {
        e.preventDefault();
        setHighlightIndex((i) => Math.max(0, i - 1));
        break;
      }
      case "Home": {
        e.preventDefault();
        setHighlightIndex(0);
        break;
      }
      case "End": {
        e.preventDefault();
        setHighlightIndex(options.length - 1);
        break;
      }
      case "Escape": {
        e.preventDefault();
        close();
        break;
      }
      case "Enter":
      case " ": {
        e.preventDefault();
        chooseIndex(highlightRef.current);
        break;
      }
      case "Tab": {
        setOpen(false);
        break;
      }
      default:
        break;
    }
  };

  const rootClass = [
    "calm-select",
    variant === "compact" && "calm-select--compact",
    variant === "dense" && "calm-select--dense",
    variant === "timezone" && "calm-select--timezone",
    (variant === "field" || variant === "dense" || variant === "timezone") && "calm-select--block",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const triggerLabel = empty ? emptyStateLabel : displayLabel;
  const triggerHint = useFinePointerTitle(title);

  return (
    <div className={rootClass}>
      <button
        type="button"
        id={triggerId}
        ref={triggerRef}
        className="calm-select-trigger"
        disabled={isDisabled}
        aria-busy={ariaBusy === true ? true : undefined}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        aria-describedby={ariaDescribedBy}
        onClick={() => !isDisabled && setOpen((o) => !o)}
        onKeyDown={onTriggerKeyDown}
      >
        <SoftHoverHint hint={triggerHint} className="calm-select-trigger-hint">
          <span className="calm-select-value">{triggerLabel}</span>
          <Chevron open={open} />
        </SoftHoverHint>
      </button>

      {open &&
        !empty &&
        createPortal(
          <div
            ref={listRef}
            id={listboxId}
            role="listbox"
            tabIndex={0}
            className={["calm-select-listbox", variant === "timezone" && "calm-select-listbox--timezone"]
              .filter(Boolean)
              .join(" ")}
            style={popoverStyle}
            aria-labelledby={ariaLabelledBy || undefined}
            aria-label={ariaLabelledBy ? undefined : ariaLabel}
            aria-activedescendant={`${listboxId}-opt-${highlightIndex}`}
            onKeyDown={onListKeyDown}
          >
            {options.map((opt, idx) => {
              const isSelected = opt.value === value;
              const isActive = idx === highlightIndex;
              const showDivider = dividerAfterIndices?.includes(idx) ?? false;
              return (
                <Fragment key={opt.value || `__${idx}`}>
                  <div
                    role="option"
                    id={`${listboxId}-opt-${idx}`}
                    aria-selected={isSelected}
                    tabIndex={-1}
                    className={[
                      "calm-select-option",
                      variant === "timezone" && "calm-select-option--tz",
                      isSelected && "calm-select-option--selected",
                      isActive && "calm-select-option--active",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onMouseEnter={() => setHighlightIndex(idx)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => chooseIndex(idx)}
                  >
                    <span className="calm-select-option-label">
                      {variant === "timezone" && opt.hint ? (
                        <>
                          <span className="calm-select-option-title">{opt.label}</span>
                          <span className="calm-select-option-hint">{opt.hint}</span>
                        </>
                      ) : (
                        opt.label
                      )}
                    </span>
                    {isSelected && variant !== "timezone" && (
                      <span className="calm-select-check" aria-hidden="true">
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path
                            d="M2.5 7L5.5 10L11.5 4"
                            stroke="currentColor"
                            strokeWidth="1.75"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </span>
                    )}
                  </div>
                  {showDivider ? <div className="calm-select-divider" role="separator" aria-hidden="true" /> : null}
                </Fragment>
              );
            })}
          </div>,
          document.body,
        )}
    </div>
  );
}
