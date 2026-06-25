import { useState } from "react";
import Chat from "./Chat";
import Story from "./Story";
import Creative from "./Creative";
import Studio from "./Studio";
import "../App.css";

type View = "chat" | "story" | "creative" | "studio";

const NAV_ITEMS: { id: View; label: string; icon: string }[] = [
  { id: "chat",     label: "Legend AI",  icon: "♛" },
  { id: "story",    label: "Story",       icon: "📖" },
  { id: "creative", label: "3D & Assets", icon: "🎨" },
  { id: "studio",   label: "Studio",      icon: "🎬" },
];

export default function MainApp() {
  const [view, setView] = useState<View>("chat");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  function navigate(id: View) {
    setView(id);
    setSidebarOpen(false);
  }

  return (
    <div className="app">
      {/* ── Sidebar ── */}
      <aside className={`sidebar ${sidebarOpen ? "sidebar-open" : ""}`}>
        <div className="sidebar-logo">
          <span className="logo-crown">♛</span>
          <span className="logo-text">LEGEND</span>
        </div>

        <nav className="sidebar-nav">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              className={`sidebar-btn ${view === item.id ? "active" : ""}`}
              onClick={() => navigate(item.id)}
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

      {/* Dim overlay when sidebar is open on mobile */}
      {sidebarOpen && (
        <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />
      )}

      {/* ── Main area ── */}
      <div className="main-wrapper">
        {/* Mobile top bar — hidden on desktop */}
        <div className="mobile-topbar">
          <button className="mobile-menu-btn" onClick={() => setSidebarOpen(!sidebarOpen)}>
            ☰
          </button>
          <div className="sidebar-logo" style={{ border: "none", padding: 0, margin: 0 }}>
            <span className="logo-crown">♛</span>
            <span className="logo-text">LEGEND</span>
          </div>
          <div className="status" style={{ fontSize: 11 }}>
            <span className="status-dot" />
          </div>
        </div>

        <main className="main">
          {view === "chat"     && <Chat />}
          {view === "story"    && <Story />}
          {view === "creative" && <Creative />}
          {view === "studio"   && <Studio />}
        </main>
      </div>
    </div>
  );
}
