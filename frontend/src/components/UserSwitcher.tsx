import { useMemo } from "react";
import type { User } from "../types";
import CalmSelect from "./CalmSelect";

type Props = {
  users: User[];
  userId: number | null;
  onSelectUser: (id: number) => void;
};

export default function UserSwitcher({ users, userId, onSelectUser }: Props) {
  const current = users.find((u) => u.id === userId);
  const options = useMemo(() => users.map((u) => ({ value: String(u.id), label: u.name })), [users]);

  return (
    <div className="user-switcher" aria-label="Active user">
      <span className="user-switcher-label muted small">You</span>
      <CalmSelect
        variant="compact"
        value={userId != null ? String(userId) : ""}
        onChange={(v) => onSelectUser(Number.parseInt(v, 10))}
        options={options}
        disabled={users.length === 0}
        aria-label="Switch user"
        placeholder="Select user"
        emptyStateLabel="Loading…"
        title={current?.email}
      />
    </div>
  );
}
