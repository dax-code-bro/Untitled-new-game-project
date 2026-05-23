import { useState } from "react";
import Chat from "./pages/Chat";
import Story from "./pages/Story";
import Creative from "./pages/Creative";
import Studio from "./pages/Studio";
import "./App.css";

type Tab = "chat" | "story" | "creative" | "studio";

export default function App() {
  const [tab, setTab] = useState<Tab>("chat");

  return (
    <div className="app">
      <header className="header">
        <div className="logo">
          <span className="logo-crown">♛</span>
          <span className="logo-text">LEGEND</span>
        </div>
        <nav className="nav">
          {(["chat", "story", "creative", "studio"] as Tab[]).map((t) => (
            <button
              key={t}
              className={`nav-btn ${tab === t ? "active" : ""}`}
              onClick={() => setTab(t)}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </nav>
        <div className="status">
          <span className="status-dot" />
          Online
        </div>
      </header>

      <main className="main">
        {tab === "chat" && <Chat />}
        {tab === "story" && <Story />}
        {tab === "creative" && <Creative />}
        {tab === "studio" && <Studio />}
      </main>
    </div>
  );
}
