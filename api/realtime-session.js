import crypto from "crypto";

const ACCESS_COOKIE_NAME = "ii_premium_gate";

function signValue(value, secret) {
  return crypto
    .createHmac("sha256", secret)
    .update(value)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64urlToUtf8(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (normalized.length % 4 || 4)) % 4);
  return Buffer.from(normalized + padding, "base64").toString("utf8");
}

function parseCookies(cookieHeader) {
  const result = {};

  if (!cookieHeader || typeof cookieHeader !== "string") {
    return result;
  }

  cookieHeader.split(";").forEach(part => {
    const index = part.indexOf("=");

    if (index === -1) return;

    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();

    result[key] = value;
  });

  return result;
}

function safeEqual(a, b) {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);

  if (aBuf.length !== bBuf.length) {
    return false;
  }

  return crypto.timingSafeEqual(aBuf, bBuf);
}

function verifyPremiumCookie(rawCookieValue, secret) {
  if (!rawCookieValue || typeof rawCookieValue !== "string") {
    return { ok: false, error: "Cookie premium mancante." };
  }

  let decodedValue = rawCookieValue;

  try {
    decodedValue = decodeURIComponent(rawCookieValue);
  } catch {
    return { ok: false, error: "Cookie premium non valido." };
  }

  const parts = decodedValue.split(".");

  if (parts.length !== 2) {
    return { ok: false, error: "Formato cookie premium non valido." };
  }

  const [encodedPayload, signature] = parts;
  const expectedSignature = signValue(encodedPayload, secret);

  if (!safeEqual(signature, expectedSignature)) {
    return { ok: false, error: "Firma cookie premium non valida." };
  }

  let payload;
  try {
    payload = JSON.parse(base64urlToUtf8(encodedPayload));
  } catch {
    return { ok: false, error: "Payload cookie premium non valido." };
  }

  if (!payload || payload.area !== "premium") {
    return { ok: false, error: "Area premium non valida." };
  }

  if (typeof payload.exp !== "number" || Date.now() > payload.exp) {
    return { ok: false, error: "Accesso premium scaduto." };
  }

  return { ok: true, payload };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Metodo non consentito." });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  const signingSecret = process.env.PREMIUM_GATE_SIGNING_SECRET;

  if (!apiKey) {
    return res.status(500).json({ error: "OPENAI_API_KEY mancante su Vercel." });
  }

  if (!signingSecret) {
    return res.status(500).json({ error: "PREMIUM_GATE_SIGNING_SECRET mancante su Vercel." });
  }

  const cookies = req.cookies || parseCookies(req.headers.cookie || "");
  const rawPremiumCookie = cookies[ACCESS_COOKIE_NAME];
  const premiumCheck = verifyPremiumCookie(rawPremiumCookie, signingSecret);

  if (!premiumCheck.ok) {
    return res.status(403).json({
      error: premiumCheck.error || "Accesso premium non autorizzato."
    });
  }

  try {
    const response = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
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

    if (!data.value) {
      return res.status(500).json({
        error: "Client secret mancante nella risposta OpenAI.",
        details: data
      });
    }

    return res.status(200).json({
      client_secret: {
        value: data.value
      },
      expires_at: data.expires_at,
      session: data.session
    });
  } catch (error) {
    return res.status(500).json({
      error: error.message || "Errore server interno."
    });
  }
}
