import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import "./auth.css";

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function handleLogin() {
    if (!email.trim()) return setError("Enter your email address.");
    setLoading(true);
    setError("");

    const { error: authError } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false },
    });

    setLoading(false);

    if (authError) {
      if (authError.message.includes("not found") || authError.message.includes("user")) {
        return setError("No account found with that email. Create one first.");
      }
      return setError(authError.message);
    }

    sessionStorage.setItem("pending_email", email);
    sessionStorage.setItem("login_mode", "true");
    setSent(true);
  }

  async function signInWithGoogle() {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/chat` },
    });
  }

  async function signInWithGithub() {
    await supabase.auth.signInWithOAuth({
      provider: "github",
      options: { redirectTo: `${window.location.origin}/chat` },
    });
  }

  if (sent) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="auth-header">
            <div className="auth-logo-small">♛ LEGEND</div>
            <h1 className="auth-title">Check your email</h1>
            <p className="auth-subtitle">
              We sent a login link to<br />
              <strong>{email}</strong><br />
              Click it to sign in instantly.
            </p>
          </div>
          <button className="auth-btn auth-btn-ghost" onClick={() => { setSent(false); setEmail(""); }}>
            Use a different email
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-header">
          <div className="auth-logo-small">♛ LEGEND</div>
          <h1 className="auth-title">Welcome back</h1>
        </div>

        <div className="auth-form">
          <div className="form-group">
            <label className="form-label">Email</label>
            <input
              className="form-input"
              type="email"
              placeholder="your@gmail.com"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(""); }}
              onKeyDown={(e) => e.key === "Enter" && handleLogin()}
              autoComplete="email"
              autoFocus
            />
          </div>

          {error && <div className="auth-error">{error}</div>}

          <button
            className="auth-btn auth-btn-primary"
            onClick={handleLogin}
            disabled={loading}
          >
            {loading ? "Sending link..." : "Login"}
          </button>

          <div className="auth-divider"><span>or</span></div>

          <button className="auth-btn auth-btn-oauth" onClick={signInWithGoogle}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
              <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
              <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
              <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
            </svg>
            Sign in with Google
          </button>

          <button className="auth-btn auth-btn-oauth" onClick={signInWithGithub}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor">
              <path d="M9 0C4.03 0 0 4.03 0 9c0 3.98 2.58 7.35 6.16 8.54.45.08.61-.19.61-.43v-1.51c-2.5.54-3.03-1.21-3.03-1.21-.41-1.04-1-1.32-1-1.32-.82-.56.06-.55.06-.55.9.06 1.38.93 1.38.93.8 1.37 2.1.97 2.61.74.08-.58.31-.97.57-1.19-1.99-.23-4.08-1-4.08-4.44 0-.98.35-1.78.93-2.41-.09-.23-.4-1.14.09-2.37 0 0 .76-.24 2.49.93A8.67 8.67 0 0 1 9 4.07c.77 0 1.54.1 2.26.3 1.73-1.17 2.49-.93 2.49-.93.49 1.23.18 2.14.09 2.37.58.63.93 1.43.93 2.41 0 3.45-2.1 4.21-4.1 4.43.32.28.61.83.61 1.67v2.47c0 .24.16.52.62.43A9.01 9.01 0 0 0 18 9c0-4.97-4.03-9-9-9z"/>
            </svg>
            Sign in with GitHub
          </button>

          <button className="auth-btn auth-btn-ghost" onClick={() => navigate("/")}>
            Back
          </button>
        </div>

        <p className="auth-footer">
          No account?{" "}
          <span className="auth-link" onClick={() => navigate("/create-account")}>
            Create one
          </span>
        </p>
      </div>
    </div>
  );
}
