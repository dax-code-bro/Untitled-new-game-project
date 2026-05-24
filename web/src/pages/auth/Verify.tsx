import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import "./auth.css";

export default function Verify() {
  const navigate = useNavigate();
  const [code, setCode] = useState(["", "", "", "", ""]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resent, setResent] = useState(false);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  const email = sessionStorage.getItem("pending_email") || "";
  const username = sessionStorage.getItem("pending_username") || "";

  useEffect(() => {
    if (!email) navigate("/create-account");
    inputs.current[0]?.focus();
  }, []);

  function handleDigit(index: number, value: string) {
    if (!/^\d*$/.test(value)) return;
    const next = [...code];
    next[index] = value.slice(-1);
    setCode(next);
    setError("");
    if (value && index < 4) inputs.current[index + 1]?.focus();
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent) {
    if (e.key === "Backspace" && !code[index] && index > 0) {
      inputs.current[index - 1]?.focus();
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 5);
    if (pasted.length === 5) {
      setCode(pasted.split(""));
      inputs.current[4]?.focus();
    }
  }

  async function handleVerify() {
    const fullCode = code.join("");
    if (fullCode.length < 5) return setError("Enter the full 5-digit code.");

    setLoading(true);
    setError("");

    const { data, error: verifyError } = await supabase.auth.verifyOtp({
      email,
      token: fullCode,
      type: "email",
    });

    if (verifyError) {
      setLoading(false);
      return setError("Invalid or expired code. Please try again.");
    }

    // Save username to profiles table
    if (data.user) {
      await supabase.from("profiles").upsert({
        id: data.user.id,
        username,
        email,
        plan: "standard",
        created_at: new Date().toISOString(),
      });
    }

    sessionStorage.removeItem("pending_email");
    sessionStorage.removeItem("pending_username");
    setLoading(false);
    navigate("/onboarding");
  }

  async function resendCode() {
    setResent(false);
    await supabase.auth.signInWithOtp({ email });
    setResent(true);
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-header">
          <div className="auth-logo-small">♛ LEGEND</div>
          <h1 className="auth-title">Check your email</h1>
          <p className="auth-subtitle">
            We sent a 5-digit code to<br />
            <strong>{email}</strong>
          </p>
        </div>

        <div className="code-inputs" onPaste={handlePaste}>
          {code.map((digit, i) => (
            <input
              key={i}
              ref={(el) => (inputs.current[i] = el)}
              className="code-input"
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              onChange={(e) => handleDigit(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
            />
          ))}
        </div>

        {error && <div className="auth-error">{error}</div>}
        {resent && <div className="auth-success">Code resent — check your email.</div>}

        <button
          className="auth-btn auth-btn-primary"
          onClick={handleVerify}
          disabled={loading || code.join("").length < 5}
        >
          {loading ? "Verifying..." : "Verify"}
        </button>

        <p className="auth-footer">
          Didn't get it?{" "}
          <span className="auth-link" onClick={resendCode}>
            Resend code
          </span>
        </p>
      </div>
    </div>
  );
}
