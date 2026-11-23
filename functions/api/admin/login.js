
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

  const sig = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  return `${data}.${sig}`;
}

export async function onRequestPost({ request, env }) {
  try {
    if (!env.ADMIN_PASSWORD || !env.SESSION_SECRET) {
      return Response.json(
        { success: false, message: "Server configuration missing" },
        { status: 500 }
      );
    }

    const body = await request.json();

    if (
      typeof body.password !== "string" ||
      !constantTimeEqual(body.password, env.ADMIN_PASSWORD)
    ) {
      return Response.json(
        { success: false, message: "Invalid credentials" },
        { status: 401 }
      );
    }

    const token = await signToken({
      role: "admin",
      exp: Math.floor(Date.now() / 1000) + 3600
    }, env.SESSION_SECRET);

    return new Response(
      JSON.stringify({ success: true, message: "Login successful" }),
      {
        headers: {
          "Content-Type": "application/json",
          "Set-Cookie": `ai_one_session=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=3600`
        }
      }
    );
  } catch {
    return Response.json(
      { success: false, message: "Login failed" },
      { status: 400 }
    );
  }
}
