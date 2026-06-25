import { useState } from "react";
import Chat from "./Chat";
import Story from "./Story";
import Creative from "./Creative";
import Studio from "./Studio";
import "../App.css";

type View = "chat" | "story" | "creative" | "studio";

const NAV_ITEMS: { id: View; label: string; icon: string }[] = [
  { id: "chat",     label: "Legend AI",   icon: "♛" },
  { id: "story",    label: "Story",        icon: "📖" },
  { id: "creative", label: "3D & Assets",  icon: "🎨" },
  { id: "studio",   label: "Studio",       icon: "🎬" },
];

export default function MainApp() {
  const [view, setView] = useState<View>("chat");

  return (
    <div className="app">
      {/* ── Sidebar ── */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <span className="logo-crown">♛</span>
          <span className="logo-text">LEGEND</span>
        </div>

        <nav className="sidebar-nav">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              className={`sidebar-btn ${view === item.id ? "active" : ""}`}
              onClick={() => setView(item.id)}
            >
              <span className="sidebar-icon">{item.icon}</span>
              <span className="sidebar-label">{item.label}</span>
            </button>
          ))}

          <div className="sidebar-section-label">Coming Soon</div>
          <button className="sidebar-btn disabled" disabled>
            <span className="sidebar-icon">💀</span>
            <span className="sidebar-label">Dead Zone</span>
          </button>
          <button className="sidebar-btn disabled" disabled>
            <span className="sidebar-icon">🗂️</span>
            <span className="sidebar-label">Files</span>
          </button>
        </nav>

        <div className="sidebar-footer">
          <div className="status">
            <span className="status-dot" />
            <span>Online</span>
          </div>
        </div>
      </aside>

      {/* ── Main Content ── */}
      <main className="main">
        {view === "chat"     && <Chat />}
        {view === "story"    && <Story />}
        {view === "creative" && <Creative />}
        {view === "studio"   && <Studio />}
      </main>
    </div>
  );
}
