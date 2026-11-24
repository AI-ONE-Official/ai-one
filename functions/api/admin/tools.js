
import { isAdminAuthenticated } from "./_auth.js";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

async function authorize(request, env) {
  return await isAdminAuthenticated(request, env);
}

function makeSlug(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function normalizeFeatures(value) {
  if (Array.isArray(value)) {
    return JSON.stringify(
      value.map(item => String(item).trim()).filter(Boolean)
    );
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return JSON.stringify(parsed);
      }
    } catch {}

    return JSON.stringify(
      value.split("\n").map(item => item.trim()).filter(Boolean)
    );
  }

  return JSON.stringify([]);
}

export async function onRequestGet({ request, env }) {
  if (!(await authorize(request, env))) {
    return json({ success: false, message: "Unauthorized" }, 401);
  }

  try {
    const result = await env.DB.prepare(`
      SELECT
        id, name, category, website_url AS url,
        description, slug, letter, about,
        features, featured, status
      FROM tools
      ORDER BY name ASC
    `).all();

    const tools = (result.results || []).map(tool => ({
      ...tool,
      features: tool.features ? JSON.parse(tool.features) : [],
      featured: Boolean(tool.featured)
    }));

    return json({
      success: true,
      count: tools.length,
      tools
    });
  } catch (error) {
    return json({
      success: false,
      message: "Unable to load tools"
    }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  if (!(await authorize(request, env))) {
    return json({ success: false, message: "Unauthorized" }, 401);
  }

  try {
    const data = await request.json();

    const name = String(data.name || "").trim();
    const category = String(data.category || "").trim();

    if (!name || !category) {
      return json({
        success: false,
        message: "Name and category are required"
      }, 400);
    }

    const id = crypto.randomUUID();
    const slug = makeSlug(data.slug || name);

    if (!slug) {
      return json({
        success: false,
        message: "A valid slug is required"
      }, 400);
    }

    await env.DB.prepare(`
      INSERT INTO tools (
        id, name, category, website_url,
        description, slug, letter, about,
        features, featured, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      name,
      category,
      String(data.url || data.website_url || "").trim(),
      String(data.description || "").trim(),
      slug,
      String(data.letter || name.charAt(0)).trim(),
      String(data.about || "").trim(),
      normalizeFeatures(data.features),
      data.featured ? 1 : 0,
      data.status === "inactive" ? "inactive" : "active"
    ).run();

    return json({
      success: true,
      message: "Tool added successfully",
      id
    }, 201);

  } catch (error) {
    return json({
      success: false,
      message: "Unable to add tool"
    }, 500);
  }
}

export async function onRequestPut({ request, env }) {
  if (!(await authorize(request, env))) {
    return json({ success: false, message: "Unauthorized" }, 401);
  }

  try {
    const data = await request.json();
    const id = String(data.id || "").trim();
    const name = String(data.name || "").trim();
    const category = String(data.category || "").trim();

    if (!id || !name || !category) {
      return json({
        success: false,
        message: "ID, name and category are required"
      }, 400);
    }

    const result = await env.DB.prepare(`
      UPDATE tools SET
        name = ?,
        category = ?,
        website_url = ?,
        description = ?,
        slug = ?,
        letter = ?,
        about = ?,
        features = ?,
        featured = ?,
        status = ?
      WHERE id = ?
    `).bind(
      name,
      category,
      String(data.url || data.website_url || "").trim(),
      String(data.description || "").trim(),
      makeSlug(data.slug || name),
      String(data.letter || name.charAt(0)).trim(),
      String(data.about || "").trim(),
      normalizeFeatures(data.features),
      data.featured ? 1 : 0,
      data.status === "inactive" ? "inactive" : "active",
      id
    ).run();

    if (!result.meta || result.meta.changes === 0) {
      return json({
        success: false,
        message: "Tool not found"
      }, 404);
    }

    return json({
      success: true,
      message: "Tool updated successfully"
    });

  } catch (error) {
    return json({
      success: false,
      message: "Unable to update tool"
    }, 500);
  }
}

export async function onRequestDelete({ request, env }) {
  if (!(await authorize(request, env))) {
    return json({ success: false, message: "Unauthorized" }, 401);
  }

  try {
    const data = await request.json();
    const id = String(data.id || "").trim();

    if (!id) {
      return json({
        success: false,
        message: "Tool ID is required"
      }, 400);
    }

    const result = await env.DB.prepare(
      "DELETE FROM tools WHERE id = ?"
    ).bind(id).run();

    if (!result.meta || result.meta.changes === 0) {
      return json({
        success: false,
        message: "Tool not found"
      }, 404);
    }

    return json({
      success: true,
      message: "Tool deleted successfully"
    });

  } catch (error) {
    return json({
      success: false,
      message: "Unable to delete tool"
    }, 500);
  }
}
