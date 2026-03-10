export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ reply: "Metodo non consentito." });
  }

  try {
    const { message, mode, stream } = req.body || {};

    if (!message || !String(message).trim()) {
      return res.status(400).json({ reply: "Messaggio mancante." });
    }

    const requestBody = {
      model: "gpt-5.4",
      reasoning: { effort: "none" },
      text: { verbosity: "low" },
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
    };

    if (stream) {
      return await handleStreamingResponse(res, requestBody);
    }

    return await handleNormalResponse(res, requestBody);
  } catch (error) {
    console.error("Server error:", error);
    return res.status(500).json({
      reply: "Errore server."
    });
  }
}

async function handleNormalResponse(res, requestBody) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
    },
    body: JSON.stringify(requestBody)
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
}

async function handleStreamingResponse(res, requestBody) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      ...requestBody,
      stream: true
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("OpenAI streaming error:", errorText);
    return res.status(500).json({
      reply: "Errore OpenAI."
    });
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive"
  });

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");

  let buffer = "";
  let fullText = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      const parts = buffer.split("\n\n");
      buffer = parts.pop() || "";

      for (const part of parts) {
        const lines = part.split("\n");
        const dataLines = lines
          .filter(line => line.startsWith("data:"))
          .map(line => line.slice(5).trim());

        if (!dataLines.length) continue;

        const dataText = dataLines.join("\n");
        if (dataText === "[DONE]") continue;

        let event;
        try {
          event = JSON.parse(dataText);
        } catch {
          continue;
        }

        if (event.type === "response.output_text.delta" && event.delta) {
          fullText += event.delta;
          res.write(`data: ${JSON.stringify({ type: "delta", text: event.delta })}\n\n`);
        }

        if (event.type === "response.completed") {
          const cleanReply = cleanText(fullText);
          res.write(`data: ${JSON.stringify({ type: "done", reply: cleanReply })}\n\n`);
        }

        if (event.type === "error") {
          res.write(`data: ${JSON.stringify({ type: "error", message: "Errore OpenAI." })}\n\n`);
        }
      }
    }

    if (buffer.trim()) {
      const trailingLines = buffer.split("\n");
      const dataLines = trailingLines
        .filter(line => line.startsWith("data:"))
        .map(line => line.slice(5).trim());

      for (const dataText of dataLines) {
        if (!dataText || dataText === "[DONE]") continue;

        try {
          const event = JSON.parse(dataText);

          if (event.type === "response.output_text.delta" && event.delta) {
            fullText += event.delta;
            res.write(`data: ${JSON.stringify({ type: "delta", text: event.delta })}\n\n`);
          }

          if (event.type === "response.completed") {
            const cleanReply = cleanText(fullText);
            res.write(`data: ${JSON.stringify({ type: "done", reply: cleanReply })}\n\n`);
          }
        } catch {
          // ignore trailing parse errors
        }
      }
    }
  } catch (error) {
    console.error("Streaming proxy error:", error);
    res.write(`data: ${JSON.stringify({ type: "error", message: "Errore server." })}\n\n`);
  } finally {
    res.end();
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
- you may add a very short Italian clarification only when genuinely useful
- do not over-explain grammar unless needed
- prefer simple spoken English that sounds good aloud

Important:
- give one best version only
- do not give multiple alternatives unless the user asks
- make the answer useful for immediate speaking practice
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
Make the user's sentence sound clear and professional.
`;
  }

  if (mode === "legal") {
    return baseRules + `
Focus on legal English.
Make the user's sentence sound precise, formal, and controlled.
`;
  }

  return baseRules + `
Focus on everyday English.
Make the user's sentence sound natural and easy to say.
`;
}
