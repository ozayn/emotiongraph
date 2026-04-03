import { Link, useSearchParams } from "react-router-dom";
import DayLogPanel from "../components/DayLogPanel";
import { useSession } from "../session/SessionContext";

type Props = { userId: number; timeZone: string };

function parseDayQueryParam(raw: string | null): string | undefined {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return undefined;
  return raw;
}

export default function AddEntryPage({ userId, timeZone }: Props) {
  const { pathFor } = useSession();
  const [searchParams] = useSearchParams();
  const focusLogDate = parseDayQueryParam(searchParams.get("day"));

  return (
    <div className="entries-page add-entry-page">
      <nav className="entries-nav entries-nav--split">
        <Link className="linkish entries-back" to={pathFor("/")}>
          ← Home
        </Link>
        <Link className="linkish entries-nav-secondary" to={pathFor("/today")}>
          Today
        </Link>
      </nav>
      <header className="entries-header">
        <h1 className="entries-title">Add entry</h1>
        <p className="muted small entries-lead">Voice, text, manual row, or day context — all scoped to the date you pick.</p>
      </header>

      <DayLogPanel userId={userId} timeZone={timeZone} focusLogDate={focusLogDate} />
    </div>
  );
}
