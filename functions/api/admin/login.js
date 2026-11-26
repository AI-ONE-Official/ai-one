
function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...extraHeaders
    }
  });
}

function base64UrlEncode(bytes) {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function constantTimeEqual(a, b) {
  const encoder = new TextEncoder();
  const x = encoder.encode(a);
  const y = encoder.encode(b);

  let diff = x.length ^ y.length;
  const length = Math.max(x.length, y.length);

  for (let i = 0; i < length; i++) {
    diff |= (x[i] || 0) ^ (y[i] || 0);
  }

  return diff === 0;
}

async function signToken(payload, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    {
      name: "HMAC",
      hash: "SHA-256"
    },
    false,
    ["sign"]
  );

  const data = base64UrlEncode(
    new TextEncoder().encode(JSON.stringify(payload))
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(data)
  );

  return data + "." +
    base64UrlEncode(new Uint8Array(signature));
}

async function hashIP(ip, secret) {
  const input = new TextEncoder().encode(
    ip + ":" + secret
  );

  const digest = await crypto.subtle.digest(
    "SHA-256",
    input
  );

  return Array.from(new Uint8Array(digest))
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function readLimitedBody(request, limit = 2048) {
  const contentLength = request.headers.get("Content-Length");

  if (contentLength !== null) {
    if (!/^\d+$/.test(contentLength)) {
      throw new Error("Invalid content length");
    }

    if (Number(contentLength) > limit) {
      throw new Error("Request too large");
    }
  }

  if (!request.body) {
    throw new Error("Missing body");
  }

  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      total += value.byteLength;

      if (total > limit) {
        await reader.cancel();
        throw new Error("Request too large");
      }

      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const result = new Uint8Array(total);
  let offset = 0;

  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new TextDecoder("utf-8", {
    fatal: true
  }).decode(result);
}

export async function onRequestPost({ request, env }) {
  try {
    if (
      !env ||
      typeof env.ADMIN_PASSWORD !== "string" ||
      !env.ADMIN_PASSWORD ||
      typeof env.SESSION_SECRET !== "string" ||
      !env.SESSION_SECRET ||
      !env.DB
    ) {
      return json({
        success: false,
        message: "Authentication service unavailable"
      }, 500);
    }

    if (
      request.headers.get("Content-Type")
        ?.split(";")[0]
        .trim()
        .toLowerCase() !== "application/json"
    ) {
      return json({
        success: false,
        message: "JSON content type required"
      }, 415);
    }

    const ip = request.headers.get("CF-Connecting-IP");

    if (!ip || ip.length > 100) {
      return json({
        success: false,
        message: "Unable to process request"
      }, 400);
    }

    const now = Math.floor(Date.now() / 1000);
    const ipHash = await hashIP(
      ip,
      env.SESSION_SECRET
    );

    const existing = await env.DB.prepare(`
      SELECT attempts, window_started_at, blocked_until
      FROM admin_login_attempts
      WHERE ip_hash = ?
    `).bind(ipHash).first();

    if (existing && existing.blocked_until > now) {
      return json({
        success: false,
        message: "Too many attempts. Try again later."
      }, 429, {
        "Retry-After": String(existing.blocked_until - now)
      });
    }

    let body;

    try {
      body = await readLimitedBody(request);
    } catch {
      return json({
        success: false,
        message: "Invalid or oversized request"
      }, 400);
    }

    let data;

    try {
      data = JSON.parse(body);
    } catch {
      return json({
        success: false,
        message: "Invalid JSON"
      }, 400);
    }

    if (
      !data ||
      typeof data !== "object" ||
      Array.isArray(data) ||
      typeof data.password !== "string" ||
      data.password.length === 0 ||
      data.password.length > 1024
    ) {
      return json({
        success: false,
        message: "Invalid password input"
      }, 400);
    }

    if (!constantTimeEqual(
      data.password,
      env.ADMIN_PASSWORD
    )) {
      const result = await env.DB.prepare(`
        INSERT INTO admin_login_attempts (
          ip_hash,
          attempts,
          window_started_at,
          blocked_until,
          updated_at
        )
        VALUES (?, 1, ?, 0, ?)

        ON CONFLICT(ip_hash) DO UPDATE SET
          attempts = CASE
            WHEN admin_login_attempts.window_started_at <= ? - 900
            THEN 1
            ELSE admin_login_attempts.attempts + 1
          END,

          window_started_at = CASE
            WHEN admin_login_attempts.window_started_at <= ? - 900
            THEN ?
            ELSE admin_login_attempts.window_started_at
          END,

          blocked_until = CASE
            WHEN admin_login_attempts.window_started_at <= ? - 900
            THEN 0
            WHEN admin_login_attempts.attempts + 1 >= 5
            THEN ? + 900
            ELSE admin_login_attempts.blocked_until
          END,

          updated_at = ?

        RETURNING attempts, blocked_until
      `).bind(
        ipHash,
        now,
        now,
        now,
        now,
        now,
        now,
        now
      ).first();

      if (result && result.blocked_until > now) {
        return json({
          success: false,
          message: "Too many attempts. Try again later."
        }, 429, {
          "Retry-After": String(result.blocked_until - now)
        });
      }

      return json({
        success: false,
        message: "Invalid administrator password"
      }, 401);
    }

    await env.DB.prepare(`
      DELETE FROM admin_login_attempts
      WHERE ip_hash = ?
    `).bind(ipHash).run();

    const sessionId = crypto.randomUUID();
    const expiresAt = now + 3600;

    const token = await signToken({
      role: "admin",
      sid: sessionId,
      exp: expiresAt
    }, env.SESSION_SECRET);

    await env.DB.prepare(`
      INSERT INTO admin_sessions (
        session_id,
        expires_at,
        revoked_at,
        created_at
      )
      VALUES (?, ?, NULL, ?)
    `).bind(
      sessionId,
      expiresAt,
      now
    ).run();

    // Clean up revoked and expired sessions.
    await env.DB.prepare(`
      DELETE FROM admin_sessions
      WHERE revoked_at IS NOT NULL
         OR expires_at <= ?
    `).bind(now).run();

    return json({
      success: true,
      message: "Login successful"
    }, 200, {
      "Set-Cookie":
        "ai_one_session=" + token +
        "; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=3600"
    });

  } catch {
    return json({
      success: false,
      message: "Unable to process login"
    }, 500);
  }
}
