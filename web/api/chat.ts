export const config = { runtime: "edge" };

const SYSTEM_PROMPT = `You are Legend — the ultimate AI.

You are not a generic assistant. You are a creative force, a thinking partner, and a builder.

Your character:
- Confident but never arrogant. You speak plainly, directly, and with purpose.
- Endlessly creative. You see stories, worlds, and possibilities everywhere.
- A true collaborator. You listen deeply, remember everything, and build on what the user says.
- You can do anything: talk, write stories, generate code, design games, create worlds.

Current mode: {mode}

Always give full, detailed, thoughtful responses. Stay in character as Legend. Never cut yourself short.`;

type Message = { role: string; content: string };

const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  "X-Accel-Buffering": "no",
};

function jsonError(msg: string, status = 500): Response {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function textToSSE(text: string): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const chunk = JSON.stringify({ choices: [{ delta: { content: text } }] });
      controller.enqueue(encoder.encode(`data: ${chunk}\n\ndata: [DONE]\n\n`));
      controller.close();
    },
  });
  return new Response(stream, { headers: SSE_HEADERS });
}

function withTimeout(ms: number): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") return jsonError("Method not allowed", 405);

  let body: { message: string; mode?: string; history?: Message[] };
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid request", 400);
  }

  const { message, mode = "conversation", history = [] } = body;
  if (!message?.trim()) return jsonError("Message required", 400);

  const systemPrompt = SYSTEM_PROMPT.replace("{mode}", mode);
  const messages: Message[] = [...history, { role: "user", content: message }];
  const fullMessages = [{ role: "system", content: systemPrompt }, ...messages];

  // ── Atom ────────────────────────────────────────────────────────
  const atomKey = process.env.ATOM_API_KEY;
  if (atomKey) {
    try {
      const base = process.env.ATOM_BASE_URL ?? "https://oasisos.io/api/v1";
      const res = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${atomKey}` },
        body: JSON.stringify({ model: "atom-32b", messages: fullMessages, stream: true, temperature: 0.85, max_tokens: 4096 }),
        signal: withTimeout(8000),
      });
      if (res.ok) return new Response(res.body, { headers: SSE_HEADERS });
    } catch { /* next */ }
  }

  // ── Anthropic ───────────────────────────────────────────────────
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (anthropicKey) {
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": anthropicKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 4096, system: systemPrompt, messages, stream: true }),
        signal: withTimeout(8000),
      });
      if (res.ok) {
        const { readable, writable } = new TransformStream();
        const writer = writable.getWriter();
        const enc = new TextEncoder();
        const dec = new TextDecoder();
        (async () => {
          const reader = res.body!.getReader();
          let buf = "";
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              buf += dec.decode(value, { stream: true });
              const lines = buf.split("\n");
              buf = lines.pop() ?? "";
              for (const line of lines) {
                if (!line.startsWith("data: ")) continue;
                try {
                  const p = JSON.parse(line.slice(6).trim());
                  if (p.type === "content_block_delta" && p.delta?.type === "text_delta") {
                    await writer.write(enc.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: p.delta.text } }] })}\n\n`));
                  } else if (p.type === "message_stop") {
                    await writer.write(enc.encode("data: [DONE]\n\n"));
                  }
                } catch { /* skip */ }
              }
            }
          } finally { await writer.close().catch(() => {}); }
        })();
        return new Response(readable, { headers: SSE_HEADERS });
      }
    } catch { /* next */ }
  }

  // ── Groq ────────────────────────────────────────────────────────
  const groqKey = process.env.GROQ_API_KEY;
  if (groqKey) {
    try {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${groqKey}` },
        body: JSON.stringify({ model: "llama-3.3-70b-versatile", messages: fullMessages, stream: true, temperature: 0.85, max_tokens: 4096 }),
        signal: withTimeout(8000),
      });
      if (res.ok) return new Response(res.body, { headers: SSE_HEADERS });
    } catch { /* next */ }
  }

  // ── Pollinations POST ───────────────────────────────────────────
  try {
    const res = await fetch("https://text.pollinations.ai/openai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "openai", messages: fullMessages, stream: false, temperature: 0.85, max_tokens: 2048 }),
      signal: withTimeout(15000),
    });
    if (res.ok) {
      const data = await res.json();
      const text: string = data.choices?.[0]?.message?.content ?? "";
      if (text) return textToSSE(text);
    }
  } catch { /* next */ }

  // ── Pollinations GET ────────────────────────────────────────────
  try {
    const prompt = messages.map(m => `${m.role === "user" ? "User" : "Legend"}: ${m.content}`).join("\n") + "\nLegend:";
    const res = await fetch(`https://text.pollinations.ai/${encodeURIComponent(prompt)}`, {
      signal: withTimeout(15000),
    });
    if (res.ok) {
      const text = await res.text();
      if (text?.trim()) return textToSSE(text.trim());
    }
  } catch { /* next */ }

  return jsonError("Legend is temporarily offline. Try again in a moment.");
}
