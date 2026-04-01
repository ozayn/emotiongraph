import TodayPage from "./pages/TodayPage";

export default function App() {
  return (
    <div className="app-shell">
      <header className="app-header">
        <span className="logo">Emotiongraph</span>
      </header>
      <main className="app-main">
        <TodayPage />
      </main>
    </div>
  );
}
