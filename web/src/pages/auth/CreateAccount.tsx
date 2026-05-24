import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import "./auth.css";

const USERNAME_REGEX = /^(?=.*[A-Z]).{16,24}$/;

function generateUsername(): string {
  const adjectives = ["Golden", "Shadow", "Blazing", "Fierce", "Silent", "Rapid", "Mighty", "Stellar"];
  const nouns = ["Crusader", "Warrior", "Legend", "Hunter", "Knight", "Commander", "Champion"];
  const numbers = Math.floor(Math.random() * 9000) + 1000;
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const base = `${adj}${noun}${numbers}`;
  // Ensure it's within 16-24 chars
  return base.slice(0, 24).padEnd(16, "0");
}

export default function CreateAccount() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const usernameValid = USERNAME_REGEX.test(username);
  const usernameLength = username.length;
  const hasCapital = /[A-Z]/.test(username);

  function randomize() {
    setUsername(generateUsername());
    setError("");
  }

  async function handleCreate() {
    setError("");

    if (!email.trim()) return setError("Enter your email address.");
    if (!usernameValid) {
      return setError(
        "Username must be 16–24 characters and include at least one capital letter."
      );
    }

    setLoading(true);

    // Check username availability
    const { data: existing } = await supabase
      .from("profiles")
      .select("username")
      .eq("username", username)
      .single();

    if (existing) {
      setLoading(false);
      return setError("That username is already taken. Choose another or randomize.");
    }

    // Send OTP verification email
    const { error: authError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        data: { username },
        emailRedirectTo: undefined,
      },
    });

    setLoading(false);

    if (authError) {
      // If user already exists, block second account creation
      if (authError.message.includes("already registered")) {
        return setError("An account with this email already exists. Please login instead.");
      }
      return setError(authError.message);
    }

    // Store pending username in session storage for the verify step
    sessionStorage.setItem("pending_email", email);
    sessionStorage.setItem("pending_username", username);
    navigate("/verify");
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-header">
          <div className="auth-logo-small">♛ LEGEND</div>
          <h1 className="auth-title">Create Account</h1>
        </div>

        <div className="auth-form">
          <div className="form-group">
            <label className="form-label">Email</label>
            <input
              className="form-input"
              type="email"
              placeholder="your@gmail.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Username</label>
            <div className="username-row">
              <input
                className={`form-input ${username && !usernameValid ? "input-error" : username && usernameValid ? "input-valid" : ""}`}
                type="text"
                placeholder="GoldenCrusader2025"
                value={username}
                onChange={(e) => { setUsername(e.target.value); setError(""); }}
                maxLength={24}
                autoComplete="off"
              />
              <button className="btn-randomize" onClick={randomize} type="button">
                Randomize
              </button>
            </div>

            <div className="username-rules">
              <span className={usernameLength >= 16 && usernameLength <= 24 ? "rule-pass" : "rule-fail"}>
                {usernameLength >= 16 && usernameLength <= 24 ? "✓" : "✗"} 16–24 characters ({usernameLength})
              </span>
              <span className={hasCapital ? "rule-pass" : "rule-fail"}>
                {hasCapital ? "✓" : "✗"} At least one capital letter
              </span>
            </div>
          </div>

          {error && <div className="auth-error">{error}</div>}

          <button
            className="auth-btn auth-btn-primary"
            onClick={handleCreate}
            disabled={loading}
          >
            {loading ? "Creating account..." : "Create Account"}
          </button>

          <button
            className="auth-btn auth-btn-ghost"
            onClick={() => navigate("/")}
            disabled={loading}
          >
            Back
          </button>
        </div>

        <p className="auth-footer">
          Already have an account?{" "}
          <span className="auth-link" onClick={() => navigate("/login")}>
            Login
          </span>
        </p>
      </div>
    </div>
  );
}
