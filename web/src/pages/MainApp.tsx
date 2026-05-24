import { useState } from "react";
import Chat from "./Chat";
import Story from "./Story";
import Creative from "./Creative";
import Studio from "./Studio";
import { useAuth } from "../context/AuthContext";
import "../App.css";

type Tab = "chat" | "story" | "creative" | "studio";

export default function MainApp() {
  const [tab, setTab] = useState<Tab>("chat");
  const { signOut } = useAuth();

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
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div className="status">
            <span className="status-dot" />
            Online
          </div>
          <button
            className="nav-btn"
            onClick={signOut}
            style={{ fontSize: 12, color: "var(--text-dim)" }}
          >
            Sign out
          </button>
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
