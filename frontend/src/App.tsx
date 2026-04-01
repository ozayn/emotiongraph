import TodayPage from "./pages/TodayPage";

export default function App() {
  return (
    <div className="app-shell">
      <header className="app-header">
        <a className="brand" href="/" aria-label="EmotionGraph home">
          <img className="brand-mark" src="/logo-mark.svg" alt="" width="28" height="28" />
          <span className="logo">EmotionGraph</span>
        </a>
      </header>
      <main className="app-main">
        <TodayPage />
      </main>
    </div>
  );
}
