import { useSession } from "../session/SessionContext";
import type { User } from "../types";

/** Private app: stable ordering for the local profile list. */
const PROFILE_ORDER = ["Azin", "Zahra", "Test"];

function sortForChooser(users: User[], isDemo: boolean): User[] {
  return [...users].sort((a, b) => {
    if (isDemo) {
      return a.name.localeCompare(b.name);
    }
    const ia = PROFILE_ORDER.indexOf(a.name);
    const ib = PROFILE_ORDER.indexOf(b.name);
    if (ia === -1 && ib === -1) return a.name.localeCompare(b.name);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
}

type Props = {
  users: User[];
  /** True when changing profile vs first visit (copy only). */
  switching?: boolean;
  onChoose: (userId: number) => void;
};

export default function ChooseProfilePage({ users, switching = false, onChoose }: Props) {
  const { realm } = useSession();
  const isDemo = realm === "demo";
  const ordered = sortForChooser(users, isDemo);

  const title = (() => {
    if (isDemo) return switching ? "Switch sandbox" : "Sample demo";
    return switching ? "Switch profile" : "Who’s logging today?";
  })();

  const subtitle = (() => {
    if (isDemo) {
      return switching
        ? "Same Test sandbox — sample data only, not your private log."
        : "You’re in the Test sandbox: sample entries for exploring the app, not your private log.";
    }
    return switching
      ? "Choose who is using this device. No password — this only sets local preferences."
      : "Pick your name to open the app. This device will remember until you switch.";
  })();

  return (
    <div className={`choose-profile-page${isDemo ? " choose-profile-page--demo" : ""}`}>
      <div className="choose-profile-ambient" aria-hidden="true" />
      <div className="choose-profile-inner">
        <h1 className="choose-profile-title">{title}</h1>
        <p className="choose-profile-sub muted">{subtitle}</p>
        <ul className="choose-profile-list" role="list">
          {ordered.map((u) => (
            <li key={u.id}>
              <button
                type="button"
                className={`choose-profile-card${isDemo ? " choose-profile-card--demo" : ""}`}
                onClick={() => onChoose(u.id)}
              >
                <span className="choose-profile-name">{u.name}</span>
                {!isDemo && u.email ? <span className="choose-profile-email muted small">{u.email}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
