
export async function isAdminAuthenticated(request, env) {
  try {
    if (!env.SESSION_SECRET) {
      return false;
    }

    const cookie = request.headers.get("Cookie") || "";

    const sessionCookie = cookie
      .split(";")
      .map(item => item.trim())
      .find(item => item.startsWith("ai_one_session="));

    if (!sessionCookie) {
      return false;
    }

    const token = sessionCookie.substring(
      "ai_one_session=".length
    );

    const parts = token.split(".");

    if (parts.length !== 2) {
      return false;
    }

    const [data, signature] = parts;

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

    const normalizedSignature = signature
      .replace(/-/g, "+")
      .replace(/_/g, "/");

    const paddedSignature =
      normalizedSignature +
      "=".repeat((4 - normalizedSignature.length % 4) % 4);

    const signatureBytes = Uint8Array.from(
      atob(paddedSignature),
      char => char.charCodeAt(0)
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

    const normalizedData = data
      .replace(/-/g, "+")
      .replace(/_/g, "/");

    const paddedData =
      normalizedData +
      "=".repeat((4 - normalizedData.length % 4) % 4);

    const payload = JSON.parse(atob(paddedData));

    if (
      payload.role !== "admin" ||
      typeof payload.exp !== "number" ||
      payload.exp <= Math.floor(Date.now() / 1000)
    ) {
      return false;
    }

    return true;

  } catch {
    return false;
  }
}
