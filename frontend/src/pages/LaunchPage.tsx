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
      <div className="launch-backdrop" aria-hidden="true">
        <div className="launch-ambient" />
        <div className="launch-field" />
      </div>
      <div className="launch-inner">
        <div className="launch-signal-wrap launch-rise launch-rise--a">
          <svg className="launch-signal-svg" viewBox="0 0 320 96" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
            <g className="launch-signal-lines">
              <path
                className="launch-signal-path launch-signal-path--a"
                d="M0 48c42-18 78 22 118 8s86-28 126-6 56 34 76 14"
              />
              <path
                className="launch-signal-path launch-signal-path--b"
                d="M0 62c48 14 92-22 140-8s72 26 108 4 52-20 72-8"
              />
              <path
                className="launch-signal-path launch-signal-path--c"
                d="M0 34c56 10 88 28 132 12s68-36 108-18 52 24 80 8"
              />
              <path
                className="launch-signal-path launch-signal-path--d"
                d="M0 76c38-8 62 12 102 4s78-24 118-12 60 20 100 4"
              />
            </g>
          </svg>
        </div>
        <p className="launch-greeting launch-rise launch-rise--b">
          Hi, {user.name}
        </p>
        <p className="launch-tagline muted launch-rise launch-rise--c">One calm moment to log how you feel.</p>
        <button type="button" className="btn primary launch-cta launch-rise launch-rise--d" onClick={() => navigate("/today")}>
          Start voice log
        </button>
      </div>
    </div>
  );
}
