import { useNavigate } from "react-router-dom";
import type { User } from "../types";

type Props = {
  users: User[];
  userId: number;
};

export default function LaunchPage({ users, userId }: Props) {
  const navigate = useNavigate();
  const user = users.find((u) => u.id === userId);
  if (!user) return null;

  return (
    <div className="launch-page">
      <div className="launch-ambient" aria-hidden="true" />
      <div className="launch-inner">
        <p className="launch-greeting launch-rise">Hi, {user.name}</p>
        <p className="launch-tagline muted launch-rise">One calm moment to log how you feel.</p>
        <button type="button" className="btn primary launch-cta launch-rise" onClick={() => navigate("/today")}>
          Start voice log
        </button>
      </div>
    </div>
  );
}
