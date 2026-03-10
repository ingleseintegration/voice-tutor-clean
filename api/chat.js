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

    const reply = extractReply(data);

    return res.status(200).json({
      reply: reply || "Mi dispiace, non sono riuscito a generare una risposta."
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

function getSystemPrompt(mode) {
  if (mode === "business") {
    return "You are an English tutor for Italian professionals. Focus on business English: meetings, emails, presentations, clients, project updates, and office communication. Reply clearly, naturally, and helpfully. Keep answers clean and not too long.";
  }

  if (mode === "finance") {
    return "You are an English tutor for Italian professionals. Focus on financial English: budgets, forecasts, margins, reporting, cash flow, audit, and finance meetings. Reply clearly, naturally, and helpfully. Keep answers clean and not too long.";
  }

  if (mode === "legal") {
    return "You are an English tutor for Italian professionals. Focus on legal English: contracts, clauses, compliance, NDAs, negotiation, and legal drafting. Reply clearly, naturally, and helpfully. Keep answers clean and not too long.";
  }

  return "You are an English tutor for Italian learners. Focus on everyday English, normal real-life situations, polite conversation, travel, phone calls, and daily communication. Reply clearly, naturally, and helpfully. Keep answers clean and not too long.";
}
