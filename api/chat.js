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

The user may write or speak in:
- English
- Italian
- mixed Italian and English

Your job:
- understand the user's intention
- turn it into natural spoken English
- help them say it clearly and confidently

Hard rules:
- sound like a real private tutor
- be short, direct, and natural
- no markdown
- no bullet points
- no headings
- no long explanations
- no ChatGPT-style phrasing
- keep replies compact and easy to say aloud

Default reply shape:
- line 1: quick correction or quick reaction
- line 2: best natural English version
- line 3: optional very short note only if useful

Language behavior:
- if the user writes in incorrect English, correct it and give the best natural version
- if the user writes in Italian, translate it into the best natural English they can say
- if the user mixes Italian and English, interpret the meaning and give the best English version
- reply mainly in English
- you may add a very short Italian clarification only when it is genuinely useful
- do not over-explain grammar unless needed
- prefer simple spoken English that sounds good aloud

Style:
- warm
- calm
- professional
- encouraging
- concise

Important:
- give one best version only
- do not give multiple alternatives unless the user asks
- make the answer useful for immediate speaking practice
`;

  if (mode === "business") {
    return baseRules + `
Focus on business English.
Priorities:
- meetings
- emails
- presentations
- clients
- updates
- workplace communication

Make the user's sentence sound natural, concise, and professional.
`;
  }

  if (mode === "finance") {
    return baseRules + `
Focus on financial English.
Priorities:
- budgets
- forecasts
- reporting
- cash flow
- margins
- finance meetings

Make the user's sentence sound clear and professional.
`;
  }

  if (mode === "legal") {
    return baseRules + `
Focus on legal English.
Priorities:
- contracts
- clauses
- compliance
- NDAs
- negotiation
- formal drafting

Make the user's sentence sound precise, formal, and controlled.
`;
  }

  return baseRules + `
Focus on everyday English.
Make the user's sentence sound natural and easy to say.
`;
}
