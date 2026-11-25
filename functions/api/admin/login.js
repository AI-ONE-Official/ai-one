
function constantTimeEqual(a, b) {
  const encoder = new TextEncoder();
  const x = encoder.encode(a);
  const y = encoder.encode(b);

  let diff = x.length ^ y.length;

  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    diff |= (x[i] || 0) ^ (y[i] || 0);
  }

  return diff === 0;
}

async function signToken(payload, secret) {
  const data = btoa(JSON.stringify(payload))
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(data)
  );

  const sig = btoa(
    String.fromCharCode(...new Uint8Array(signature))
  )
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  return `${data}.${sig}`;
}

async function hashIP(ip, secret) {
  const data = new TextEncoder().encode(`${secret}:${ip}`);
  const digest = await crypto.subtle.digest("SHA-256", data);

  return Array.from(new Uint8Array(digest))
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");
}

function jsonResponse(data, status) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store"
    }
  });
}

async function readLimitedBody(request, maxBytes) {
  if (!request.body) {
    throw new Error("Missing request body");
  }

  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      total += value.byteLength;

      if (total > maxBytes) {
        await reader.cancel();
        throw new Error("Request too large");
      }

      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;

  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new TextDecoder().decode(bytes);
}

export async function onRequestPost({ request, env }) {
  try {
    if (!env.ADMIN_PASSWORD || !env.SESSION_SECRET || !env.DB) {
      return jsonResponse(
        { success: false, message: "Server configuration missing" },
        500
      );
    }

    const ip = request.headers.get("CF-Connecting-IP");

    if (!ip) {
      return jsonResponse(
        { success: false, message: "Request could not be verified" },
        400
      );
    }

    const ipHash = await hashIP(ip, env.SESSION_SECRET);
    const now = Math.floor(Date.now() / 1000);

    const existing = await env.DB.prepare(
      "SELECT blocked_until FROM admin_login_attempts WHERE ip_hash = ?"
    ).bind(ipHash).first();

    if (existing && existing.blocked_until > now) {
      return jsonResponse(
        { success: false, message: "Too many attempts. Try again later." },
        429
      );
    }

    const contentLength = request.headers.get("Content-Length");

    if (contentLength !== null) {
      const length = Number(contentLength);

      if (!Number.isSafeInteger(length) || length < 0 || length > 2048) {
        return jsonResponse(
          { success: false, message: "Request too large" },
          413
        );
      }
    }

    const rawBody = await readLimitedBody(request, 2048);

    let body;

    try {
      body = JSON.parse(rawBody);
    } catch {
      return jsonResponse(
        { success: false, message: "Invalid request" },
        400
      );
    }

    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body) ||
      typeof body.password !== "string" ||
      body.password.length > 1024
    ) {
      return jsonResponse(
        { success: false, message: "Invalid credentials" },
        401
      );
    }

    if (!constantTimeEqual(body.password, env.ADMIN_PASSWORD)) {
      const result = await env.DB.prepare(`
        INSERT INTO admin_login_attempts
          (ip_hash, attempts, window_started_at, blocked_until, updated_at)
        VALUES (?, 1, ?, 0, ?)
        ON CONFLICT(ip_hash) DO UPDATE SET
          attempts = CASE
            WHEN excluded.updated_at - window_started_at >= 900
            THEN 1
            ELSE attempts + 1
          END,
          window_started_at = CASE
            WHEN excluded.updated_at - window_started_at >= 900
            THEN excluded.updated_at
            ELSE window_started_at
          END,
          blocked_until = CASE
            WHEN (
              CASE
                WHEN excluded.updated_at - window_started_at >= 900
                THEN 1
                ELSE attempts + 1
              END
            ) >= 5
            THEN excluded.updated_at + 900
            ELSE 0
          END,
          updated_at = excluded.updated_at
        RETURNING attempts, blocked_until
      `).bind(ipHash, now, now).first();

      if (result && result.blocked_until > now) {
        return jsonResponse(
          { success: false, message: "Too many attempts. Try again later." },
          429
        );
      }

      return jsonResponse(
        { success: false, message: "Invalid credentials" },
        401
      );
    }

    await env.DB.prepare(
      "DELETE FROM admin_login_attempts WHERE ip_hash = ?"
    ).bind(ipHash).run();

    const token = await signToken({
      role: "admin",
      exp: now + 3600
    }, env.SESSION_SECRET);

    return new Response(
      JSON.stringify({
        success: true,
        message: "Login successful"
      }),
      {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
          "Set-Cookie":
            `ai_one_session=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=3600`
        }
      }
    );

  } catch (error) {
    if (error.message === "Request too large") {
      return jsonResponse(
        { success: false, message: "Request too large" },
        413
      );
    }

    return jsonResponse(
      { success: false, message: "Login failed" },
      500
    );
  }
}
