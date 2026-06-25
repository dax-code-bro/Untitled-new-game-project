import { Routes, Route, Navigate } from "react-router-dom";

import Landing from "./pages/auth/Landing";
import CreateAccount from "./pages/auth/CreateAccount";
import Verify from "./pages/auth/Verify";
import Login from "./pages/auth/Login";
import Onboarding from "./pages/auth/Onboarding";
import MainApp from "./pages/MainApp";
import "./App.css";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/create-account" element={<CreateAccount />} />
      <Route path="/verify" element={<Verify />} />
      <Route path="/login" element={<Login />} />
      <Route path="/onboarding" element={<Onboarding />} />
      <Route path="/chat" element={<MainApp />} />
      <Route path="/chat/:chatId" element={<MainApp />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
