
function decodeBase64Url(value) {
  if (
    typeof value !== "string" ||
    !/^[A-Za-z0-9_-]+$/.test(value)
  ) {
    return null;
  }

  const normalized = value
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  const padded = normalized +
    "=".repeat((4 - normalized.length % 4) % 4);

  try {
    const binary = atob(padded);
    const bytes = Uint8Array.from(
      binary,
      char => char.charCodeAt(0)
    );

    let encoded = "";
    for (const byte of bytes) {
      encoded += String.fromCharCode(byte);
    }

    const canonical = btoa(encoded)
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");

    if (canonical !== value) {
      return null;
    }

    return bytes;
  } catch {
    return null;
  }
}

export async function isAdminAuthenticated(request, env) {
  try {
    if (
      !env ||
      typeof env.SESSION_SECRET !== "string" ||
      env.SESSION_SECRET.length === 0 ||
      !env.DB
    ) {
      return false;
    }

    const cookieHeader = request.headers.get("Cookie");

    if (
      !cookieHeader ||
      cookieHeader.length > 8192
    ) {
      return false;
    }

    const cookies = cookieHeader.split(";")
      .map(item => item.trim())
      .filter(item => item.startsWith("ai_one_session="));

    if (cookies.length !== 1) {
      return false;
    }

    const token = cookies[0].slice(
      "ai_one_session=".length
    );

    if (!token || token.length > 2048) {
      return false;
    }

    const parts = token.split(".");

    if (parts.length !== 2) {
      return false;
    }

    const [data, signature] = parts;

    if (
      !data ||
      data.length > 1024 ||
      !signature ||
      signature.length !== 43
    ) {
      return false;
    }

    const signatureBytes = decodeBase64Url(signature);
    const payloadBytes = decodeBase64Url(data);

    if (
      !signatureBytes ||
      signatureBytes.length !== 32 ||
      !payloadBytes
    ) {
      return false;
    }

    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(env.SESSION_SECRET),
      {
        name: "HMAC",
        hash: "SHA-256"
      },
      false,
      ["verify"]
    );

    const validSignature = await crypto.subtle.verify(
      "HMAC",
      key,
      signatureBytes,
      new TextEncoder().encode(data)
    );

    if (!validSignature) {
      return false;
    }

    const payloadText = new TextDecoder(
      "utf-8",
      { fatal: true }
    ).decode(payloadBytes);

    const payload = JSON.parse(payloadText);

    if (
      !payload ||
      typeof payload !== "object" ||
      Array.isArray(payload) ||
      payload.role !== "admin" ||
      typeof payload.sid !== "string" ||
      !/^[0-9a-f-]{36}$/i.test(payload.sid) ||
      !Number.isSafeInteger(payload.exp) ||
      payload.exp <= Math.floor(Date.now() / 1000)
    ) {
      return false;
    }

    const session = await env.DB.prepare(`
      SELECT session_id
      FROM admin_sessions
      WHERE session_id = ?
        AND expires_at = ?
        AND revoked_at IS NULL
        AND expires_at > ?
      LIMIT 1
    `).bind(
      payload.sid,
      payload.exp,
      Math.floor(Date.now() / 1000)
    ).first();

    if (!session) {
      return false;
    }

    return true;

  } catch {
    return false;
  }
}
