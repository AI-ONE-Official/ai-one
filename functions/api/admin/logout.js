
import { isAdminAuthenticated } from "./_auth.js";

const ALLOWED_ORIGIN = "https://ai-one-a2u.pages.dev";

function jsonResponse(data, status = 200, extraHeaders = {}) {
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

function clearSessionCookie() {
  return {
    "Set-Cookie":
      "ai_one_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0"
  };
}

export async function onRequestPost({ request, env }) {
  const origin = request.headers.get("Origin");

  if (origin !== ALLOWED_ORIGIN) {
    return jsonResponse(
      {
        success: false,
        message: "Forbidden"
      },
      403
    );
  }

  try {
    const authenticated = await isAdminAuthenticated(request, env);

    if (!authenticated) {
      return jsonResponse(
        {
          success: false,
          message: "Unauthorized"
        },
        401,
        clearSessionCookie()
      );
    }

    const cookieHeader = request.headers.get("Cookie") || "";
    const cookie = cookieHeader
      .split(";")
      .map(item => item.trim())
      .find(item => item.startsWith("ai_one_session="));

    if (!cookie) {
      return jsonResponse(
        {
          success: false,
          message: "Unauthorized"
        },
        401,
        clearSessionCookie()
      );
    }

    const token = cookie.slice("ai_one_session=".length);
    const parts = token.split(".");

    if (parts.length !== 2) {
      return jsonResponse(
        {
          success: false,
          message: "Unauthorized"
        },
        401,
        clearSessionCookie()
      );
    }

    const payloadBytes = (() => {
      const value = parts[0];

      if (!/^[A-Za-z0-9_-]+$/.test(value)) {
        return null;
      }

      const normalized = value
        .replace(/-/g, "+")
        .replace(/_/g, "/");

      const padded = normalized +
        "=".repeat((4 - normalized.length % 4) % 4);

      try {
        const binary = atob(padded);
        return Uint8Array.from(
          binary,
          char => char.charCodeAt(0)
        );
      } catch {
        return null;
      }
    })();

    if (!payloadBytes) {
      return jsonResponse(
        {
          success: false,
          message: "Unauthorized"
        },
        401,
        clearSessionCookie()
      );
    }

    const payload = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(payloadBytes)
    );

    if (
      !payload ||
      typeof payload.sid !== "string" ||
      !/^[0-9a-f-]{36}$/i.test(payload.sid)
    ) {
      return jsonResponse(
        {
          success: false,
          message: "Unauthorized"
        },
        401,
        clearSessionCookie()
      );
    }

    const now = Math.floor(Date.now() / 1000);

    const result = await env.DB.prepare(`
      UPDATE admin_sessions
      SET revoked_at = ?
      WHERE session_id = ?
        AND revoked_at IS NULL
        AND expires_at > ?
    `).bind(
      now,
      payload.sid,
      now
    ).run();

    if (!result.success || result.meta.changes !== 1) {
      return jsonResponse(
        {
          success: false,
          message: "Session revocation failed"
        },
        500,
        clearSessionCookie()
      );
    }

    return jsonResponse(
      {
        success: true,
        message: "Logged out successfully"
      },
      200,
      clearSessionCookie()
    );

  } catch {
    return jsonResponse(
      {
        success: false,
        message: "Logout failed"
      },
      500,
      clearSessionCookie()
    );
  }
}
