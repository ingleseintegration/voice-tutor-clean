import crypto from "crypto";

const COOKIE_NAME = "ii_demo_gate";
const DEFAULT_MAX_AGE = 60 * 60 * 24;
const ALLOWED_NEXT = new Set(["premium.html"]);

function getSecret() {
  return process.env.DEMO_GATE_SIGNING_SECRET || process.env.PREMIUM_GATE_SIGNING_SECRET || "";
}

function base64url(input) {
  return Buffer.from(input).toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function signPayload(payloadString, secret) {
  return crypto.createHmac("sha256", secret).update(payloadString).digest("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function makeToken(payload, secret) {
  const payloadString = JSON.stringify(payload);
  const encodedPayload = base64url(payloadString);
  const signature = signPayload(payloadString, secret);
  return `${encodedPayload}.${signature}`;
}

function serializeCookie(name, value, maxAgeSeconds) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
}

function clearCookie(name) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

export default async function handler(req, res) {
  try {
    if (req.method === "POST") {
      const secret = getSecret();
      if (!secret) {
        return res.status(500).json({ error: "Missing demo signing secret." });
      }

      const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
      const email = String(body.email || "").trim().toLowerCase();
      const next = String(body.next || "premium.html").trim();

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: "Invalid email." });
      }

      if (!ALLOWED_NEXT.has(next)) {
        return res.status(400).json({ error: "Invalid redirect target." });
      }

      const grantedAt = Date.now();
      const payload = {
        type: "demo",
        email,
        next,
        grantedAt
      };

      const token = makeToken(payload, secret);

      res.setHeader("Set-Cookie", serializeCookie(COOKIE_NAME, token, DEFAULT_MAX_AGE));
      return res.status(200).json({
        ok: true,
        browserAccess: {
          granted: true,
          email,
          next,
          grantedAt
        }
      });
    }

    if (req.method === "DELETE") {
      res.setHeader("Set-Cookie", clearCookie(COOKIE_NAME));
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: "Method not allowed." });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Unexpected error." });
  }
}
