import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./context/AuthContext";

import Landing from "./pages/auth/Landing";
import CreateAccount from "./pages/auth/CreateAccount";
import Verify from "./pages/auth/Verify";
import Login from "./pages/auth/Login";
import Onboarding from "./pages/auth/Onboarding";
import MainApp from "./pages/MainApp";
import "./App.css";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="auth-page"><div style={{ color: "var(--gold)" }}>♛</div></div>;
  if (!user) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/create-account" element={<CreateAccount />} />
      <Route path="/verify" element={<Verify />} />
      <Route path="/login" element={<Login />} />
      <Route path="/onboarding" element={<ProtectedRoute><Onboarding /></ProtectedRoute>} />
      <Route path="/chat" element={<ProtectedRoute><MainApp /></ProtectedRoute>} />
      <Route path="/chat/:chatId" element={<ProtectedRoute><MainApp /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
