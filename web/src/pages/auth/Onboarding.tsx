import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../context/AuthContext";
import "./auth.css";

type AgeGroup = "18+" | "17-";

const ACCESSIBILITY_MODES = [
  { id: "dyslexia", label: "Dyslexia Mode", desc: "OpenDyslexic font, read aloud, increased spacing" },
  { id: "adhd", label: "ADHD Mode", desc: "Shorter responses, focus timer, less clutter" },
  { id: "ocd", label: "OCD Mode", desc: "Clear structured responses, no ambiguity" },
  { id: "anxiety", label: "Anxiety Mode", desc: "Calmer tone, no overwhelming info dumps" },
  { id: "colorblind", label: "Color Blind Mode", desc: "Adjusted colors throughout" },
  { id: "lowvision", label: "Low Vision Mode", desc: "Larger text, high contrast" },
  { id: "autism", label: "Autism Friendly", desc: "Literal language, no sarcasm, predictable structure" },
  { id: "esl", label: "ESL Mode", desc: "Simpler vocabulary, slower read aloud" },
  { id: "voice", label: "Voice Control", desc: "Hands-free, speak your prompts" },
  { id: "senior", label: "Senior Mode", desc: "Larger text, slower responses, simpler navigation" },
];

export default function Onboarding() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [step, setStep] = useState<"age" | "accessibility" | "done">("age");
  const [age, setAge] = useState<AgeGroup | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  function toggleMode(id: string) {
    setSelected((s) =>
      s.includes(id) ? s.filter((x) => x !== id) : [...s, id]
    );
  }

  async function finish() {
    setLoading(true);
    const modes: Record<string, boolean> = {};
    ACCESSIBILITY_MODES.forEach((m) => {
      modes[m.id] = selected.includes(m.id);
    });

    if (user) {
      await supabase.from("profiles").update({
        age_group: age,
        kids_mode: age === "17-",
        accessibility: modes,
        onboarded: true,
      }).eq("id", user.id);
    }

    setLoading(false);
    navigate("/chat");
  }

  if (step === "age") {
    return (
      <div className="auth-page">
        <div className="auth-card onboarding-card">
          <div className="auth-header">
            <div className="auth-logo-small">♛ LEGEND</div>
            <h1 className="auth-title">How old are you?</h1>
            <p className="auth-subtitle">This sets up your Legend experience.</p>
          </div>

          <div className="age-options">
            <button
              className={`age-btn ${age === "18+" ? "age-btn-active" : ""}`}
              onClick={() => setAge("18+")}
            >
              <span className="age-number">18+</span>
              <span className="age-desc">Full Legend — everything unlocked</span>
            </button>

            <button
              className={`age-btn ${age === "17-" ? "age-btn-active" : ""}`}
              onClick={() => setAge("17-")}
            >
              <span className="age-number">17 or younger</span>
              <span className="age-desc">Safe content, Kids Mode applied</span>
            </button>
          </div>

          <button
            className="auth-btn auth-btn-primary"
            onClick={() => setStep("accessibility")}
            disabled={!age}
          >
            Continue
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-card onboarding-card">
        <div className="auth-header">
          <div className="auth-logo-small">♛ LEGEND</div>
          <h1 className="auth-title">Accessibility</h1>
          <p className="auth-subtitle">
            Turn on anything that helps. You can change these anytime in settings.
          </p>
        </div>

        <div className="accessibility-grid">
          {ACCESSIBILITY_MODES.map((mode) => (
            <button
              key={mode.id}
              className={`access-btn ${selected.includes(mode.id) ? "access-btn-active" : ""}`}
              onClick={() => toggleMode(mode.id)}
            >
              <span className="access-check">{selected.includes(mode.id) ? "✓" : ""}</span>
              <div>
                <div className="access-label">{mode.label}</div>
                <div className="access-desc">{mode.desc}</div>
              </div>
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button
            className="auth-btn auth-btn-ghost"
            onClick={() => setStep("age")}
            disabled={loading}
            style={{ flex: 1 }}
          >
            Back
          </button>
          <button
            className="auth-btn auth-btn-primary"
            onClick={finish}
            disabled={loading}
            style={{ flex: 2 }}
          >
            {loading ? "Setting up..." : selected.length > 0 ? "Let's go" : "Skip for now"}
          </button>
        </div>
      </div>
    </div>
  );
}
