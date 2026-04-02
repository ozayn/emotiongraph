import type { User } from "../types";

type Props = { usersReady: boolean; users: User[] };

export default function UsersGate({ usersReady, users }: Props) {
  if (!usersReady) {
    return <p className="muted gate-message">Loading…</p>;
  }
  if (users.length === 0) {
    return <p className="muted gate-message">No users found. Seed the database (Azin &amp; Zahra) and refresh.</p>;
  }
  return <p className="muted gate-message">Loading…</p>;
}
