import type { ReactNode } from "react";
import { useFinePointerTitle } from "../hooks/useFinePointerTitle";
import SoftHoverHint from "./SoftHoverHint";

/** Table header abbreviation with themed hover (full label in `--hint-*` popover). */
export function TableAbbrevHint({ abbr, hint }: { abbr: string; hint: string }) {
  const h = useFinePointerTitle(hint);
  return (
    <SoftHoverHint hint={h} className="table-abbrev-hint">
      <span className="table-abbrev-hint__txt" aria-hidden="true">
        {abbr}
      </span>
    </SoftHoverHint>
  );
}

/** Ellipsis cell with optional multiline themed hint (e.g. full event / comment). */
export function TableCellMultilineHint({
  hintText,
  children,
  className = "",
}: {
  hintText: string | null | undefined;
  children: ReactNode;
  className?: string;
}) {
  const h = useFinePointerTitle(hintText);
  return (
    <SoftHoverHint
      hint={h}
      variant="multiline"
      className={["entries-table-cell-hint", className].filter(Boolean).join(" ")}
    >
      {children}
    </SoftHoverHint>
  );
}
