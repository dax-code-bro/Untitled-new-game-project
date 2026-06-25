export const config = { runtime: "edge" };

const SYSTEM_PROMPT = `You are Legend — the ultimate AI.

You are not a generic assistant. You are a creative force, a thinking partner, and a builder.

Your character:
- Confident but never arrogant. You speak plainly, directly, and with purpose.
- Endlessly creative. You see stories, worlds, and possibilities everywhere.
- A true collaborator. You listen deeply, remember everything, and build on what the user says.
- You can do anything the user needs: talk, write stories, generate code, design games, create worlds.

Your current mode: {mode}

Modes and how you behave in each:
- conversation: Natural, warm dialogue. Ask good questions. Be present.
- story: You are a master storyteller. Vivid imagery, strong characters, real stakes.
- game: You think like a game designer — mechanics, balance, player experience, fun.
- creative: Open-ended creative collaboration. No limits. Explore everything.
- code: Precise, clean, and practical. Write code that actually works.
- director: You are producing a show, comic, or video. Think in scenes, shots, and sequences.

Always:
- Stay in character as Legend.
- Give full, detailed, thoughtful responses. Never cut yourself short.
- Be genuinely helpful, not performatively helpful.
- Push the work forward. Build something real.

This is what you were built for. Let's create something legendary.`;

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

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") return jsonError("Method not allowed", 405);

  let body: { message: string; mode?: string; history?: Message[] };
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid request body", 400);
  }

  const { message, mode = "conversation", history = [] } = body;
  if (!message?.trim()) return jsonError("Message is required", 400);

  const systemPrompt = SYSTEM_PROMPT.replace("{mode}", mode);
  const messages: Message[] = [...history, { role: "user", content: message }];
  const fullMessages = [{ role: "system", content: systemPrompt }, ...messages];

  // ── Atom (dad's OasisOS) ────────────────────────────────────────
  const atomKey = process.env.ATOM_API_KEY;
  if (atomKey) {
    try {
      const base = process.env.ATOM_BASE_URL ?? "https://oasisos.io/api/v1";
      const res = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${atomKey}` },
        body: JSON.stringify({ model: "atom-32b", messages: fullMessages, stream: true, temperature: 0.85, max_tokens: 4096 }),
      });
      if (res.ok) return new Response(res.body, { headers: SSE_HEADERS });
    } catch { /* fall through */ }
  }

  // ── Anthropic ───────────────────────────────────────────────────
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (anthropicKey) {
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": anthropicKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 4096, system: systemPrompt, messages, stream: true }),
      });
      if (res.ok) {
        const { readable, writable } = new TransformStream();
        const writer = writable.getWriter();
        const encoder = new TextEncoder();
        const decoder = new TextDecoder();
        (async () => {
          const reader = res.body!.getReader();
          let buffer = "";
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split("\n");
              buffer = lines.pop() ?? "";
              for (const line of lines) {
                if (!line.startsWith("data: ")) continue;
                try {
                  const parsed = JSON.parse(line.slice(6).trim());
                  if (parsed.type === "content_block_delta" && parsed.delta?.type === "text_delta") {
                    await writer.write(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: parsed.delta.text } }] })}\n\n`));
                  } else if (parsed.type === "message_stop") {
                    await writer.write(encoder.encode("data: [DONE]\n\n"));
                  }
                } catch { /* skip bad lines */ }
              }
            }
          } finally { await writer.close().catch(() => {}); }
        })();
        return new Response(readable, { headers: SSE_HEADERS });
      }
    } catch { /* fall through */ }
  }

  // ── Groq ────────────────────────────────────────────────────────
  const groqKey = process.env.GROQ_API_KEY;
  if (groqKey) {
    try {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${groqKey}` },
        body: JSON.stringify({ model: "llama-3.3-70b-versatile", messages: fullMessages, stream: true, temperature: 0.85, max_tokens: 4096 }),
      });
      if (res.ok) return new Response(res.body, { headers: SSE_HEADERS });
    } catch { /* fall through */ }
  }

  // ── Pollinations (free, no key) ─────────────────────────────────
  try {
    const res = await fetch("https://text.pollinations.ai/openai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "openai", messages: fullMessages, stream: false, temperature: 0.85, max_tokens: 4096 }),
    });
    if (res.ok) {
      const data = await res.json();
      const text: string = data.choices?.[0]?.message?.content ?? "";
      if (text) return textToSSE(text);
    }
  } catch { /* fall through */ }

  // ── Last resort: Pollinations simple GET ────────────────────────
  try {
    const prompt = `${systemPrompt}\n\nUser: ${message}\nLegend:`;
    const res = await fetch(`https://text.pollinations.ai/${encodeURIComponent(prompt)}`);
    if (res.ok) {
      const text = await res.text();
      if (text?.trim()) return textToSSE(text.trim());
    }
  } catch { /* fall through */ }

  return jsonError("Legend is temporarily offline. Try again in a moment.");
}
