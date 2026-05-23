import { useState } from "react";

export default function Creative() {
  const [modelPrompt, setModelPrompt] = useState("");
  const [texturePrompt, setTexturePrompt] = useState("");
  const [modelResult, setModelResult] = useState("");
  const [textureResult, setTextureResult] = useState("");
  const [loading, setLoading] = useState<string | null>(null);

  async function generateModel() {
    if (!modelPrompt.trim()) return;
    setLoading("model");
    const res = await fetch("http://localhost:8000/creative/model", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: modelPrompt }),
    });
    const data = await res.json();
    setModelResult(data.path);
    setLoading(null);
  }

  async function generateTexture() {
    if (!texturePrompt.trim()) return;
    setLoading("texture");
    const res = await fetch("http://localhost:8000/creative/texture", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: texturePrompt }),
    });
    const data = await res.json();
    setTextureResult(data.path);
    setLoading(null);
  }

  return (
    <div className="page">
      <span className="page-title">Creative Assets</span>

      <div className="grid-2">
        <div className="card">
          <div className="card-title">3D Model</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <textarea
              rows={3}
              placeholder="Describe the 3D model (e.g. 'a medieval castle on a cliff')..."
              value={modelPrompt}
              onChange={(e) => setModelPrompt(e.target.value)}
            />
            <button
              className="btn btn-gold"
              onClick={generateModel}
              disabled={loading === "model" || !modelPrompt.trim()}
            >
              {loading === "model" ? "Generating..." : "Generate Model"}
            </button>
            {modelResult && (
              <div style={{ fontSize: 12, color: "var(--gold)", wordBreak: "break-all" }}>
                Output: {modelResult}
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-title">Texture</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <textarea
              rows={3}
              placeholder="Describe the texture (e.g. 'cracked stone wall, mossy, dark')..."
              value={texturePrompt}
              onChange={(e) => setTexturePrompt(e.target.value)}
            />
            <button
              className="btn btn-gold"
              onClick={generateTexture}
              disabled={loading === "texture" || !texturePrompt.trim()}
            >
              {loading === "texture" ? "Generating..." : "Generate Texture"}
            </button>
            {textureResult && (
              <div style={{ fontSize: 12, color: "var(--gold)", wordBreak: "break-all" }}>
                Output: {textureResult}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-title">Integrations</div>
        <div className="grid-3">
          {[
            { name: "Blender", desc: "Install the Legend addon from integrations/blender/legend_addon.py", port: 8765 },
            { name: "Unity", desc: "Add LegendAI.cs to your Unity project Assets folder", port: 8766 },
            { name: "Unreal", desc: "Add the LegendSubsystem plugin to your Unreal project", port: 8767 },
          ].map((i) => (
            <div key={i.name} style={{ padding: 12, background: "var(--surface-3)", borderRadius: 6 }}>
              <div style={{ fontWeight: 600, color: "var(--gold)", marginBottom: 6 }}>{i.name}</div>
              <div style={{ fontSize: 12, color: "var(--text-dim)", lineHeight: 1.5 }}>{i.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
