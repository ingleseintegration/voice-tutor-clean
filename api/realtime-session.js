export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed." });
  }

  try {
    const response = await fetch("https://api.openai.com/v1/realtime/sessions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-realtime-mini",
        voice: "alloy",
        modalities: ["audio", "text"],
        instructions: getRealtimeInstructions(),
        audio: {
          input: {
            turn_detection: {
              type: "server_vad"
            }
          }
        }
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Realtime session error:", data);
      return res.status(500).json({
        error: "Failed to create realtime session."
      });
    }

    return res.status(200).json(data);
  } catch (error) {
    console.error("Server error:", error);
    return res.status(500).json({
      error: "Server error."
    });
  }
}

function getRealtimeInstructions() {
  return `
You are a voice-first English tutor for Italian users.

The user may speak or write in:
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
- keep answers conversational
- do not monologue
- let the user interrupt naturally

Language behavior:
- if the user speaks incorrect English, correct it and give the best natural version
- if the user speaks in Italian, translate it into the best natural English they can say
- if the user mixes Italian and English, interpret the meaning and give the best English version
- reply mainly in English
- add very short Italian clarification only when truly useful
- prefer spoken English that sounds good aloud

Important:
- give one best version only
- do not give multiple alternatives unless asked
- make the answer useful for immediate speaking practice
`.trim();
}
