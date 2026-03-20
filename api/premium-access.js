import crypto from "crypto";

const ACCESS_COOKIE_NAME = "ii_premium_gate";
const COOKIE_TTL_SECONDS = 10 * 60;
const ALLOWED_NEXT = new Set(["full-access.html", "sessions.html"]);

function base64urlEncode(value) {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function signValue(value, secret) {
  return crypto
    .createHmac("sha256", secret)
    .update(value)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function createSignedToken(payload, secret) {
  const encodedPayload = base64urlEncode(JSON.stringify(payload));
  const signature = signValue(encodedPayload, secret);
  return `${encodedPayload}.${signature}`;
}

function parseJsonBody(req) {
  if (req.body && typeof req.body === "object") {
    return req.body;
  }

  if (typeof req.body === "string" && req.body.trim()) {
    try {
      return JSON.parse(req.body);
    } catch {
      return null;
    }
  }

  return null;
}

function serializeCookie(name, value, maxAgeSeconds) {
  return [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`
  ].join("; ");
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Metodo non consentito." });
  }

  const emailEntryToken = process.env.PREMIUM_EMAIL_ENTRY_TOKEN;
  const signingSecret = process.env.PREMIUM_GATE_SIGNING_SECRET;

  if (!emailEntryToken) {
    return res.status(500).json({
      error: "PREMIUM_EMAIL_ENTRY_TOKEN mancante su Vercel."
    });
  }

  if (!signingSecret) {
    return res.status(500).json({
      error: "PREMIUM_GATE_SIGNING_SECRET mancante su Vercel."
    });
  }

  const body = parseJsonBody(req);

  if (!body) {
    return res.status(400).json({
      error: "Body JSON non valido."
    });
  }

  const entry = typeof body.entry === "string" ? body.entry.trim() : "";
  const next = typeof body.next === "string" ? body.next.trim() : "full-access.html";

  if (!ALLOWED_NEXT.has(next)) {
    return res.status(400).json({
      error: "Destinazione premium non valida."
    });
  }

  if (entry !== emailEntryToken) {
    return res.status(403).json({
      error: "Token email premium non valido."
    });
  }

  const now = Date.now();

  const token = createSignedToken(
    {
      area: "premium",
      grantedAt: now,
      exp: now + COOKIE_TTL_SECONDS * 1000
    },
    signingSecret
  );

  res.setHeader(
    "Set-Cookie",
    serializeCookie(ACCESS_COOKIE_NAME, token, COOKIE_TTL_SECONDS)
  );

  return res.status(200).json({
    ok: true,
    next,
    access_cookie: {
      name: ACCESS_COOKIE_NAME,
      value: token,
      max_age_seconds: COOKIE_TTL_SECONDS
    }
  });
}
