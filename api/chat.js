export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ reply: "Metodo non consentito." });
  }

  try {
    const { message, mode } = req.body || {};

    if (!message || !String(message).trim()) {
      return res.status(400).json({ reply: "Messaggio mancante." });
    }

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-5.4",
        input: [
          {
            role: "developer",
            content: getSystemPrompt(mode)
          },
          {
            role: "user",
            content: String(message)
          }
        ]
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("OpenAI error:", data);
      return res.status(500).json({
        reply: "Errore OpenAI."
      });
    }

    const rawReply = extractReply(data);
    const cleanReply = cleanText(rawReply);

    return res.status(200).json({
      reply: cleanReply || "Mi dispiace, non sono riuscito a generare una risposta."
    });
  } catch (error) {
    console.error("Server error:", error);
    return res.status(500).json({
      reply: "Errore server."
    });
  }
}

function extractReply(data) {
  if (data.output_text && String(data.output_text).trim()) {
    return String(data.output_text).trim();
  }

  if (Array.isArray(data.output)) {
    const texts = [];

    for (const item of data.output) {
      if (!Array.isArray(item.content)) continue;

      for (const part of item.content) {
        if (part.type === "output_text" && part.text) {
          texts.push(part.text);
        }
      }
    }

    if (texts.length) {
      return texts.join("\n").trim();
    }
  }

  return "";
}

function cleanText(text) {
  if (!text) return "";

  return String(text)
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^[-•]\s+/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function getSystemPrompt(mode) {
  const baseRules = `
You are a voice-first English tutor for Italian users.
Sound like a real tutor speaking naturally.

Hard rules:
- Keep replies short.
- Default length: 2 to 4 short lines.
- No markdown.
- No bullet points.
- No headings.
- No bold or asterisks.
- No long explanations unless the user asks.
- Speak naturally, like in a live lesson.
- Be warm, calm, and direct.
- Focus on helping the user say things better in English.
- If the user writes a short or weak sentence, improve it.
- Usually give:
  1) a natural reply
  2) one better version the user can say
- Do not give multiple alternatives unless asked.
- Do not ramble.
- Do not sound like ChatGPT.
- Reply in English unless a very short Italian clarification is necessary.
`;

  if (mode === "business") {
    return baseRules + `
Focus on business English:
meetings, emails, presentations, clients, project updates, office communication, polite professional phrasing.

When possible, help the user sound:
- natural
- concise
- professional
`;
  }

  if (mode === "finance") {
    return baseRules + `
Focus on financial English:
budgets, forecasts, margins, reporting, cash flow, audit, finance meetings, professional finance vocabulary.

Keep wording professional but simple.
`;
  }

  if (mode === "legal") {
    return baseRules + `
Focus on legal English:
contracts, clauses, compliance, NDAs, negotiation, legal drafting, formal professional language.

Keep wording clear and controlled.
`;
  }

  return baseRules + `
Focus on everyday English:
daily life, travel, phone calls, polite conversation, normal real-life communication.
`;
}
