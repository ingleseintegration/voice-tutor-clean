export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Metodo non consentito." });
  }

  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: "OPENAI_API_KEY mancante su Vercel." });
  }

  try {
    const response = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        session: {
          type: "realtime",
          model: "gpt-realtime-mini",
          output_modalities: ["audio"],
          audio: {
            input: {
              transcription: {
                model: "gpt-4o-mini-transcribe"
              },
              turn_detection: {
                type: "server_vad",
                create_response: true,
                interrupt_response: true
              }
            },
            output: {
              voice: "marin"
            }
          },
          instructions:
            "You are a premium English coach for adult Italian professionals. " +
            "Use clear, simple, natural English. Speak calmly and a little slowly. " +
            "Keep replies short. Often one short sentence is enough. Sometimes a few words are enough. " +
            "Do not always answer with a full sentence. Small useful replies are often better."
        }
      })
    });

    const text = await response.text();

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return res.status(500).json({
        error: "OpenAI non ha restituito JSON valido.",
        raw: text.slice(0, 500)
      });
    }

    if (!response.ok) {
      return res.status(response.status).json({
        error: data.error?.message || "Errore creazione realtime session.",
        details: data
      });
    }

    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({
      error: error.message || "Errore server interno."
    });
  }
}
