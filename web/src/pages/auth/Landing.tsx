import { useNavigate } from "react-router-dom";
import "./auth.css";

export default function Landing() {
  const navigate = useNavigate();

  return (
    <div className="auth-page">
      <div className="auth-card landing-card">
        <div className="legend-logo">
          <div className="logo-icon">♛</div>
          <div className="logo-wordmark">LEGEND</div>
          <div className="logo-tagline">The ultimate AI</div>
        </div>

        <div className="auth-actions">
          <button
            className="auth-btn auth-btn-primary"
            onClick={() => navigate("/chat")}
          >
            Enter Legend
          </button>

          <button
            className="auth-btn auth-btn-secondary"
            onClick={() => navigate("/create-account")}
          >
            Create Account
          </button>

          <button
            className="auth-btn auth-btn-ghost"
            onClick={() => navigate("/login")}
          >
            Login
          </button>
        </div>
      </div>
    </div>
  );
}
