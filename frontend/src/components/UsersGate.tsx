import { useSession } from "../session/SessionContext";
import type { User } from "../types";

type Props = { usersReady: boolean; users: User[] };

export default function UsersGate({ usersReady, users }: Props) {
  const { realm } = useSession();

  if (!usersReady) {
    return <p className="muted gate-message">Loading…</p>;
  }
  if (users.length === 0) {
    return (
      <p className="muted gate-message">
        {realm === "demo"
          ? "Demo didn’t load. Refresh or open the full app."
          : "No profiles yet. Check server setup, then refresh."}
      </p>
    );
  }
  return <p className="muted gate-message">Loading…</p>;
}
