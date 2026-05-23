import { useState } from "react";

export default function Studio() {
  const [title, setTitle] = useState("");
  const [story, setStory] = useState("");
  const [target, setTarget] = useState("comic");
  const [log, setLog] = useState<string[]>([]);
  const [progress, setProgress] = useState(0);
  const [running, setRunning] = useState(false);

  async function produce() {
    if (!title.trim() || !story.trim() || running) return;
    setLog([]);
    setProgress(0);
    setRunning(true);

    const params = new URLSearchParams({ title, story, target });
    const res = await fetch(`http://localhost:8000/creative/produce?${params}`, {
      method: "POST",
    });

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const lines = decoder.decode(value).split("\n");
      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6);
          if (data === "[DONE]") break;
          try {
            const parsed = JSON.parse(data);
            setProgress(parsed.progress);
            setLog((l) => [...l, `[${parsed.stage.toUpperCase()}] ${parsed.message}`]);
          } catch {}
        }
      }
    }
    setRunning(false);
  }

  return (
    <div className="page">
      <span className="page-title">Production Studio</span>
      <p style={{ fontSize: 13, color: "var(--text-dim)" }}>
        Turn a story into a full comic, animated show, or YouTube series.
      </p>

      <div style={{ display: "flex", gap: 8 }}>
        <input
          type="text"
          placeholder="Production title..."
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          style={{ maxWidth: 300 }}
        />
        <select value={target} onChange={(e) => setTarget(e.target.value)}>
          <option value="comic">Comic</option>
          <option value="show">Animated Show</option>
          <option value="youtube">YouTube Series</option>
        </select>
      </div>

      <textarea
        rows={6}
        placeholder="Paste your story here, or write the premise and let Legend write it first in the Story tab..."
        value={story}
        onChange={(e) => setStory(e.target.value)}
      />

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button
          className="btn btn-gold"
          onClick={produce}
          disabled={running || !title.trim() || !story.trim()}
        >
          {running ? "Producing..." : "Start Production"}
        </button>
        {running && (
          <div style={{ flex: 1 }}>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${progress * 100}%` }} />
            </div>
          </div>
        )}
      </div>

      {log.length > 0 && (
        <div className="output" style={{ fontFamily: "monospace", fontSize: 12 }}>
          {log.map((l, i) => (
            <div key={i} style={{ color: l.includes("complete") ? "var(--gold)" : "var(--text)" }}>
              {l}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
