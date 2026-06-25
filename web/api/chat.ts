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
- When you don't know something, say so and figure it out together.
- Push the work forward. Don't stall. Build something real.

You have access to: storytelling, 3D asset creation, code generation, game design, and full creative production.
This is what you were built for. Let's create something legendary.`;

type Message = { role: string; content: string };

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  let body: { message: string; mode?: string; history?: Message[] };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid request" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { message, mode = "conversation", history = [] } = body;
  if (!message?.trim()) {
    return new Response(JSON.stringify({ error: "Message is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const systemPrompt = SYSTEM_PROMPT.replace("{mode}", mode);
  const messages: Message[] = [...history, { role: "user", content: message }];

  // ── Try Atom first ──────────────────────────────────────────────
  const atomKey = process.env.ATOM_API_KEY;
  if (atomKey?.startsWith("sk-atom-")) {
    try {
      const atomBase = process.env.ATOM_BASE_URL ?? "https://oasisos.io/api/v1";
      const upstream = await fetch(`${atomBase}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${atomKey}`,
        },
        body: JSON.stringify({
          model: "atom-32b",
          messages: [{ role: "system", content: systemPrompt }, ...messages],
          stream: true,
          temperature: 0.85,
          max_tokens: 4096,
        }),
      });

      if (upstream.ok) {
        return new Response(upstream.body, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
          },
        });
      }
    } catch {
      // Atom unreachable — fall through to Anthropic
    }
  }

  // ── Anthropic fallback ──────────────────────────────────────────
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (anthropicKey) {
    const anthropicMessages = messages.map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.content,
    }));

    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 4096,
        system: systemPrompt,
        messages: anthropicMessages,
        stream: true,
      }),
    });

    if (!upstream.ok) {
      const err = await upstream.text();
      return new Response(JSON.stringify({ error: `AI error: ${err}` }), {
        status: upstream.status,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Transform Anthropic SSE → OpenAI-compatible SSE
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    (async () => {
      const reader = upstream.body!.getReader();
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
            const data = line.slice(6).trim();
            try {
              const parsed = JSON.parse(data);
              if (
                parsed.type === "content_block_delta" &&
                parsed.delta?.type === "text_delta"
              ) {
                const chunk = JSON.stringify({
                  choices: [{ delta: { content: parsed.delta.text } }],
                });
                await writer.write(encoder.encode(`data: ${chunk}\n\n`));
              } else if (parsed.type === "message_stop") {
                await writer.write(encoder.encode("data: [DONE]\n\n"));
              }
            } catch {
              // skip malformed lines
            }
          }
        }
      } finally {
        await writer.close().catch(() => {});
      }
    })();

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
      },
    });
  }

  // ── No backend configured ───────────────────────────────────────
  return new Response(
    JSON.stringify({
      error:
        "No AI backend configured. Add ATOM_API_KEY or ANTHROPIC_API_KEY to your Vercel environment variables.",
    }),
    { status: 500, headers: { "Content-Type": "application/json" } }
  );
}
