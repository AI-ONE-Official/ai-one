export async function onRequestGet({ env }) {
  try {
    const result = await env.DB.prepare(`
      SELECT
        id,
        name,
        category,
        website_url AS url,
        description,
        slug,
        letter,
        about,
        features,
        featured,
        status
      FROM tools
      WHERE status = 'active'
      ORDER BY name ASC
    `).all();

    const tools = result.results.map((tool) => ({
      ...tool,
      features: tool.features
        ? JSON.parse(tool.features)
        : [],
      featured: Boolean(tool.featured)
    }));

    return new Response(
      JSON.stringify({
        success: true,
        count: tools.length,
        tools
      }),
      {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store"
        }
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        message: "Unable to load tools"
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store"
        }
      }
    );
  }
}
