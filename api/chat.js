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

Hard rules:
- Sound like a real private tutor.
- Be short, direct, and natural.
- No markdown.
- No bullet points.
- No headings.
- No lists.
- No long explanations.
- No "Here are some options".
- No "If you want".
- No "For example" unless truly needed.
- Do not sound like ChatGPT.
- Reply in English.

Default reply shape:
- Line 1: quick correction or reaction
- Line 2: best natural version
- Line 3: optional very short note only if useful

Important:
- If the user's English is wrong, correct it fast.
- Give one best version only.
- Keep the whole reply compact.
- Use simple spoken English.
- Make it sound good aloud.
`;

  if (mode === "business") {
    return baseRules + `
Focus on business English.
Make the user's sentence sound natural, concise, and professional.
`;
  }

  if (mode === "finance") {
    return baseRules + `
Focus on financial English.
Make the user's sentence sound professional and clear.
`;
  }

  if (mode === "legal") {
    return baseRules + `
Focus on legal English.
Make the user's sentence sound formal, precise, and controlled.
`;
  }

  return baseRules + `
Focus on everyday English.
Make the user's sentence sound natural and easy to say.
`;
}
