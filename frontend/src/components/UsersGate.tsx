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
          ? "Profiles didn’t load. Refresh and try again."
          : "No profiles yet. Finish setup on the server, then refresh."}
      </p>
    );
  }
  return <p className="muted gate-message">Loading…</p>;
}
