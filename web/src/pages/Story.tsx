import { useState } from "react";

const GENRES = ["general", "fantasy", "sci-fi", "horror", "adventure", "mystery", "romance"];
const FORMATS = ["prose", "comic", "screenplay", "youtube"];

export default function Story() {
  const [premise, setPremise] = useState("");
  const [genre, setGenre] = useState("general");
  const [format, setFormat] = useState("prose");
  const [output, setOutput] = useState("");
  const [loading, setLoading] = useState(false);

  async function write() {
    if (!premise.trim() || loading) return;
    setOutput("");
    setLoading(true);

    const targetMap: Record<string, string> = {
      prose: "story",
      comic: "comic",
      screenplay: "screenplay",
      youtube: "youtube_series",
    };

    const res = await fetch("http://localhost:8000/story/write", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ premise, genre, format, target: targetMap[format] }),
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
          setOutput((o) => o + data);
        }
      }
    }
    setLoading(false);
  }

  async function adapt(target: string) {
    if (!output.trim() || loading) return;
    setLoading(true);

    const res = await fetch("http://localhost:8000/story/adapt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ story: output, target }),
    });

    setOutput("");
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
          setOutput((o) => o + data);
        }
      }
    }
    setLoading(false);
  }

  return (
    <div className="page">
      <span className="page-title">Story</span>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <select value={genre} onChange={(e) => setGenre(e.target.value)}>
          {GENRES.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
        <select value={format} onChange={(e) => setFormat(e.target.value)}>
          {FORMATS.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
      </div>

      <div className="input-area">
        <textarea
          rows={3}
          placeholder="Describe your story premise..."
          value={premise}
          onChange={(e) => setPremise(e.target.value)}
        />
        <button className="btn btn-gold" onClick={write} disabled={loading || !premise.trim()}>
          {loading ? "Writing..." : "Write"}
        </button>
      </div>

      <div className="output">{output || "Your story will appear here..."}</div>

      {output && !loading && (
        <div style={{ display: "flex", gap: 8 }}>
          <span style={{ fontSize: 12, color: "var(--text-dim)", alignSelf: "center" }}>
            Adapt to:
          </span>
          <button className="btn btn-ghost" onClick={() => adapt("comic")}>Comic</button>
          <button className="btn btn-ghost" onClick={() => adapt("show")}>Show</button>
          <button className="btn btn-ghost" onClick={() => adapt("youtube")}>YouTube</button>
        </div>
      )}
    </div>
  );
}
