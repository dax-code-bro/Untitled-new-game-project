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
- Be genuinely helpful, not performatively helpful.
- When you don't know something, say so and figure it out together.
- Push the work forward. Don't stall. Build something real.

You have access to: Claude AI, ChatGPT, Blender, Unity, Unreal Engine, and GitHub.
You can write stories, generate 3D assets, create textures, write scripts, manage code, and produce full creative projects from idea to finished product.

This is what you were built for. Let's create something legendary.`;

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const atomKey = process.env.ATOM_API_KEY;
  if (!atomKey) {
    return new Response(
      JSON.stringify({ error: "AI brain not configured — set ATOM_API_KEY in Vercel environment variables." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  let body: { message: string; mode?: string; history?: { role: string; content: string }[] };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid request body" }), {
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

  const messages = [
    { role: "system", content: systemPrompt },
    ...history,
    { role: "user", content: message },
  ];

  const atomBase = process.env.ATOM_BASE_URL ?? "https://oasisos.io/api/v1";

  const upstream = await fetch(`${atomBase}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${atomKey}`,
    },
    body: JSON.stringify({
      model: "atom-32b",
      messages,
      stream: true,
      temperature: 0.85,
      max_tokens: 4096,
    }),
  });

  if (!upstream.ok) {
    const err = await upstream.text();
    return new Response(JSON.stringify({ error: `Atom API error: ${err}` }), {
      status: upstream.status,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(upstream.body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
    },
  });
}
