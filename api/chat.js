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
Write like a real tutor, not like ChatGPT.

Rules:
- Keep replies short and natural.
- No markdown.
- No bullet points unless absolutely necessary.
- No bold, asterisks, headings, or numbered lists.
- Sound warm, clear, and professional.
- Prefer 2 to 5 short paragraphs or 3 to 6 short lines.
- If the user writes something very short, gently expand it into better English.
- If useful, give one improved version the user can say.
- Do not over-explain unless asked.
- Reply in English unless a brief Italian clarification is truly helpful.
`;

  if (mode === "business") {
    return baseRules + `
Focus on business English:
meetings, emails, presentations, clients, project updates, office communication, polite professional phrasing.
`;
  }

  if (mode === "finance") {
    return baseRules + `
Focus on financial English:
budgets, forecasts, margins, reporting, cash flow, audit, finance meetings, professional finance vocabulary.
`;
  }

  if (mode === "legal") {
    return baseRules + `
Focus on legal English:
contracts, clauses, compliance, NDAs, negotiation, legal drafting, formal professional language.
`;
  }

  return baseRules + `
Focus on everyday English:
daily life, travel, phone calls, polite conversation, normal real-life communication.
`;
}
