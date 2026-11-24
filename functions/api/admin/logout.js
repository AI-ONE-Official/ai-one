
export async function onRequestPost() {
  return new Response(
    JSON.stringify({
      success: true,
      message: "Logged out successfully"
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "Set-Cookie":
          "ai_one_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0"
      }
    }
  );
}
