export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed." });
  }

  // 🔒 HARD GATE
  const accessKey = req.headers["x-premium-key"];
  const VALID_KEY = process.env.PREMIUM_ACCESS_KEY;

  if (!accessKey || accessKey !== VALID_KEY) {
    return res.status(403).json({ error: "Unauthorized." });
  }

  try {
    const { message, mode } = req.body;

    if (!message) {
      return res.status(400).json({ error: "Missing message." });
    }

    const systemPrompt = getTutorInstructions(mode);

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        stream: true,
        input: [
          {
            role: "system",
            content: systemPrompt
          },
          {
            role: "user",
            content: message
          }
        ]
      })
    });

    if (!response.ok || !response.body) {
      const err = await response.text();
      console.error(err);
      return res.status(500).json({ error: "OpenAI error." });
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");

    let fullReply = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split("\n");

      for (const line of lines) {
        if (!line.startsWith("data:")) continue;

        const data = line.replace("data:", "").trim();
        if (data === "[DONE]") continue;

        try {
          const json = JSON.parse(data);

          const delta =
            json.output?.[0]?.content?.[0]?.text ||
            json.delta?.text ||
            "";

          if (delta) {
            fullReply += delta;

            res.write(
              `data: ${JSON.stringify({
                type: "delta",
                text: delta
              })}\n\n`
            );
          }
        } catch (e) {}
      }
    }

    res.write(
      `data: ${JSON.stringify({
        type: "done",
        reply: fullReply.trim()
      })}\n\n`
    );

    res.end();
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Server error." });
  }
}

function getTutorInstructions(mode) {
  const base = `
You are a voice-first English tutor for Italian users.

Keep replies short, natural, and professional.

Rules:
- 1 short sentence, sometimes 2
- no long explanations
- no lists
- no teaching tone
- no fluff
- sound like a real private tutor
- natural spoken English

If the user writes in Italian:
→ convert to natural English

If the user writes incorrect English:
→ correct it and give the best version

Always prioritize the best version of what they want to say.
`;

  const modes = {
    free: "Respond naturally and keep conversation flowing.",
    simulation: "Act inside a realistic work situation.",
    correction: "Correct fast and give best version immediately.",
    lesson: "Guide step-by-step, very simply."
  };

  return `${base}\nMode: ${modes[mode] || modes.free}`;
}
