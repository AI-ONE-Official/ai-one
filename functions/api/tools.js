function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "Strict-Transport-Security": "max-age=31536000"
    }
  });
}

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

    const tools = result.results.map((tool) => {
      let features = [];

      if (tool.features) {
        try {
          const parsed = JSON.parse(tool.features);

          if (Array.isArray(parsed)) {
            features = parsed;
          }
        } catch {
          features = [];
        }
      }

      return {
        ...tool,
        features,
        featured: Boolean(tool.featured)
      };
    });

    return jsonResponse({
      success: true,
      count: tools.length,
      tools
    });
  } catch {
    return jsonResponse(
      {
        success: false,
        message: "Unable to load tools"
      },
      500
    );
  }
}
