import crypto from "crypto";

const COOKIE_NAME = "ii_demo_gate";
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

function getSecret() {
  return process.env.DEMO_GATE_SIGNING_SECRET || process.env.PREMIUM_GATE_SIGNING_SECRET || "";
}

function parseCookies(cookieHeader = "") {
  return cookieHeader.split(";").reduce((acc, part) => {
    const [rawName, ...rest] = part.split("=");
    const name = rawName && rawName.trim();
    if (!name) return acc;
    acc[name] = decodeURIComponent(rest.join("=").trim());
    return acc;
  }, {});
}

function decodeBase64url(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, "base64").toString("utf8");
}

function signPayload(payloadString, secret) {
  return crypto
    .createHmac("sha256", secret)
    .update(payloadString)
    .digest("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function verifyToken(token, secret) {
  const [encodedPayload, signature] = String(token || "").split(".");
  if (!encodedPayload || !signature) return null;

  const payloadString = decodeBase64url(encodedPayload);
  const expected = signPayload(payloadString, secret);

  const valid = crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected)
  );

  if (!valid) return null;

  return JSON.parse(payloadString);
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed." });
    }

    const secret = getSecret();
    if (!secret) {
      return res.status(500).json({ error: "Missing demo signing secret." });
    }

    const cookies = parseCookies(req.headers.cookie || "");
    const token = cookies[COOKIE_NAME];
    if (!token) {
      return res.status(403).json({ error: "Demo access required." });
    }

    const payload = verifyToken(token, secret);
    if (!payload || payload.type !== "demo" || payload.next !== "premium.html") {
      return res.status(403).json({ error: "Invalid demo access." });
    }

    if (typeof payload.grantedAt !== "number" || Date.now() - payload.grantedAt > MAX_AGE_MS) {
      return res.status(403).json({ error: "Demo access expired." });
    }

    const model = process.env.OPENAI_REALTIME_MODEL || "gpt-4o-realtime-preview";
    const voice = process.env.OPENAI_REALTIME_VOICE || "alloy";

    const openaiResponse = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        session: {
          type: "realtime",
          model,
          audio: {
            output: {
              voice
            }
          }
        }
      })
    });

    const data = await openaiResponse.json();

    if (!openaiResponse.ok) {
      return res.status(openaiResponse.status).json({
        error: data.error?.message || "Unable to create demo client secret."
      });
    }

    const value =
      data?.client_secret?.value ||
      data?.clientSecret?.value ||
      data?.value;

    const expiresAt =
      data?.client_secret?.expires_at ||
      data?.clientSecret?.expiresAt ||
      data?.expires_at ||
      data?.expiresAt ||
      null;

    if (!value) {
      return res.status(500).json({
        error: "Missing client secret value in OpenAI response.",
        raw: data
      });
    }

    return res.status(200).json({
      client_secret: {
        value,
        expires_at: expiresAt
      }
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Unexpected error." });
  }
}
