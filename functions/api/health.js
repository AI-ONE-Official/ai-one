export async function onRequestGet({ env }) {
  try {
    const result = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name"
    ).all();

    return new Response(
      JSON.stringify({
        success: true,
        message: "AI ONE Backend connected successfully",
        tables: result.results.map(row => row.name)
      }),
      {
        headers: { "Content-Type": "application/json" }
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
        headers: { "Content-Type": "application/json" }
      }
    );
  }
}
