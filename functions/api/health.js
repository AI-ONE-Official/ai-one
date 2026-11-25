
export async function onRequestGet({ env }) {
  try {
    await env.DB.prepare("SELECT 1").first();

    return new Response(
      JSON.stringify({
        success: true,
        message: "AI ONE Backend connected successfully"
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff"
        }
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        message: "Database connection failed"
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff"
        }
      }
    );
  }
}
