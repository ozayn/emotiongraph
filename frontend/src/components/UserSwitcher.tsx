import type { User } from "../types";

type Props = {
  users: User[];
  userId: number | null;
  onSelectUser: (id: number) => void;
};

export default function UserSwitcher({ users, userId, onSelectUser }: Props) {
  const current = users.find((u) => u.id === userId);

  return (
    <div className="user-switcher" aria-label="Active user">
      <span className="user-switcher-label muted small">You</span>
      <select
        className="user-switcher-select"
        value={userId ?? ""}
        title={current?.email}
        onChange={(e) => {
          const v = e.target.value;
          if (v) onSelectUser(Number.parseInt(v, 10));
        }}
        aria-label="Switch user"
      >
        {users.length === 0 && <option value="">Loading…</option>}
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name}
          </option>
        ))}
      </select>
    </div>
  );
}
