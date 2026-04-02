import {
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

export type CalmSelectOption = { value: string; label: string };

type Variant = "field" | "compact" | "dense";

type Props = {
  value: string;
  onChange: (v: string) => void;
  options: CalmSelectOption[];
  variant?: Variant;
  disabled?: boolean;
  id?: string;
  className?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  /** When value is missing from options */
  placeholder?: string;
  /** Disabled trigger label when there are no options */
  emptyStateLabel?: string;
  /** Native tooltip on the trigger (e.g. email) */
  title?: string;
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
  disabled = false,
  id: idProp,
  className = "",
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  placeholder = "Choose…",
  emptyStateLabel = "—",
  title,
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
    const maxH = Math.min(window.innerHeight * 0.44, 260);
    setPopoverStyle({
      position: "fixed",
      left: rect.left,
      width: Math.max(rect.width, 160),
      top: rect.bottom + gap,
      maxHeight: maxH,
      zIndex: 120,
    });
  }, []);

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
  }, [open, updatePopoverPosition]);

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
    (variant === "field" || variant === "dense") && "calm-select--block",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const triggerLabel = empty ? emptyStateLabel : displayLabel;

  return (
    <div className={rootClass}>
      <button
        type="button"
        id={triggerId}
        ref={triggerRef}
        className="calm-select-trigger"
        disabled={isDisabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        title={title}
        onClick={() => !isDisabled && setOpen((o) => !o)}
        onKeyDown={onTriggerKeyDown}
      >
        <span className="calm-select-value">{triggerLabel}</span>
        <Chevron open={open} />
      </button>

      {open &&
        !empty &&
        createPortal(
          <div
            ref={listRef}
            id={listboxId}
            role="listbox"
            tabIndex={0}
            className="calm-select-listbox"
            style={popoverStyle}
            aria-labelledby={ariaLabelledBy || undefined}
            aria-label={ariaLabelledBy ? undefined : ariaLabel}
            aria-activedescendant={`${listboxId}-opt-${highlightIndex}`}
            onKeyDown={onListKeyDown}
          >
            {options.map((opt, idx) => {
              const isSelected = opt.value === value;
              const isActive = idx === highlightIndex;
              return (
                <div
                  key={opt.value || `__${idx}`}
                  role="option"
                  id={`${listboxId}-opt-${idx}`}
                  aria-selected={isSelected}
                  tabIndex={-1}
                  className={[
                    "calm-select-option",
                    isSelected && "calm-select-option--selected",
                    isActive && "calm-select-option--active",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onMouseEnter={() => setHighlightIndex(idx)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => chooseIndex(idx)}
                >
                  <span className="calm-select-option-label">{opt.label}</span>
                  {isSelected && (
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
              );
            })}
          </div>,
          document.body,
        )}
    </div>
  );
}
