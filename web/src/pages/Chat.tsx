import { useState, useRef, useEffect } from "react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const MODES = ["conversation", "story", "game", "creative", "code", "director"] as const;
type Mode = typeof MODES[number];

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: "I'm Legend. What are we building today?" },
  ]);
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<Mode>("conversation");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");

    const userMessage: Message = { role: "user", content: text };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setLoading(true);

    // history = everything except the last user message (which we pass as `message`)
    const history = updatedMessages.slice(0, -1).map((m) => ({
      role: m.role,
      content: m.content,
    }));

    let res: Response;
    try {
      res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, mode, history }),
      });
    } catch {
      setMessages((m) => [
        ...m,
        { role: "assistant", content: "Connection failed. Check your internet and try again." },
      ]);
      setLoading(false);
      return;
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Something went wrong." }));
      setMessages((m) => [
        ...m,
        { role: "assistant", content: `Error: ${err.error ?? "Failed to reach Legend."}` },
      ]);
      setLoading(false);
      return;
    }

    // Add an empty assistant message that we'll fill in as chunks arrive
    setMessages((m) => [...m, { role: "assistant", content: "" }]);

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      // Keep the last (possibly incomplete) line in the buffer
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (data === "[DONE]") break;
        try {
          const parsed = JSON.parse(data);
          const chunk: string = parsed.choices?.[0]?.delta?.content ?? "";
          if (chunk) {
            setMessages((m) => {
              const last = m[m.length - 1];
              return [...m.slice(0, -1), { ...last, content: last.content + chunk }];
            });
          }
        } catch {
          // skip malformed chunks
        }
      }
    }

    setLoading(false);
  }

  return (
    <div className="page">
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span className="page-title">Chat</span>
        <select value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
          {MODES.map((m) => (
            <option key={m} value={m}>
              {m.charAt(0).toUpperCase() + m.slice(1)}
            </option>
          ))}
        </select>
      </div>

      <div className="messages">
        {messages.map((m, i) => (
          <div key={i} className={`message ${m.role}`}>
            <span className="message-label">
              {m.role === "user" ? "You" : "Legend"}
            </span>
            <div className="message-content">{m.content}</div>
          </div>
        ))}
        {loading && (
          <div className="message assistant">
            <span className="message-label">Legend</span>
            <div className="message-content" style={{ opacity: 0.5 }}>thinking...</div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="input-area">
        <textarea
          rows={2}
          placeholder="Talk to Legend..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        <button className="btn btn-gold" onClick={send} disabled={loading || !input.trim()}>
          {loading ? "..." : "Send"}
        </button>
      </div>
    </div>
  );
}
