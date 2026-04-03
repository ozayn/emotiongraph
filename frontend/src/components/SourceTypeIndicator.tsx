import { normalizeSourceType, type EditDraft } from "../logEditDraft";
import { useFinePointerTitle } from "../hooks/useFinePointerTitle";
import SoftHoverHint from "./SoftHoverHint";

type SourceKey = EditDraft["source_type"];

const ARIA_LABEL: Record<SourceKey, string> = {
  manual: "Manual entry",
  voice: "Voice entry",
  text: "Text entry",
  import: "Imported entry",
};

/** Clipboard / form — manual entry */
function IconSourceManual({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect
        x="5"
        y="3"
        width="14"
        height="18"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M9 8h6M9 12h6M9 16h4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconSourceVoice({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M12 14a3 3 0 0 0 3-3V7a3 3 0 1 0-6 0v4a3 3 0 0 0 3 3Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M19 10v1a7 7 0 0 1-14 0v-1"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path d="M12 19v2M9 22h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/** Typed / free-text — lines in a frame (text / note) */
function IconSourceText({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect
        x="3"
        y="5"
        width="18"
        height="14"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M7 9h10M7 12h10M7 15h7"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Import — arrow into tray */
function IconSourceImport({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M12 4v9"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="m8 10 4 4 4-4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5 20h14a2 2 0 0 0 2-2v-2H3v2a2 2 0 0 0 2 2Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function iconFor(key: SourceKey, className?: string) {
  switch (key) {
    case "manual":
      return <IconSourceManual className={className} />;
    case "voice":
      return <IconSourceVoice className={className} />;
    case "text":
      return <IconSourceText className={className} />;
    case "import":
      return <IconSourceImport className={className} />;
    default:
      return <IconSourceManual className={className} />;
  }
}

type Props = {
  source: string;
  className?: string;
};

/**
 * Icon-only source type (manual, voice, text, import).
 * `aria-label` always describes the source; fine pointers get a themed hover hint (no native `title`).
 */
export default function SourceTypeIndicator({ source, className = "" }: Props) {
  const key = normalizeSourceType(source);
  const label = ARIA_LABEL[key];
  const hoverHint = useFinePointerTitle(label);

  return (
    <SoftHoverHint
      hint={hoverHint}
      className={["source-type-indicator", className].filter(Boolean).join(" ")}
    >
      <span className="source-type-indicator-target" aria-label={label}>
        <span className="source-type-indicator-icon" aria-hidden="true">
          {iconFor(key)}
        </span>
      </span>
    </SoftHoverHint>
  );
}
