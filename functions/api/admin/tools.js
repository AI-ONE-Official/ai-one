import { isAdminAuthenticated } from "./_auth.js";

const ALLOWED_ORIGIN = "https://ai-one-a2u.pages.dev";

const ALLOWED_CATEGORIES = new Set([
  "BUSINESS",
  "CODING",
  "EDUCATION",
  "IMAGES",
  "MARKETING",
  "PRODUCTIVITY",
  "RESEARCH",
  "VIDEO & AUDIO",
  "WRITING"
]);

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

function hasAllowedOrigin(request) {
  return request.headers.get("Origin") === ALLOWED_ORIGIN;
}

async function authorize(request, env) {
  return Boolean(
    env.DB &&
    await isAdminAuthenticated(request, env)
  );
}

function makeSlug(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

async function readBody(request, limit = 16384) {
  const contentType = request.headers.get("Content-Type")
    ?.split(";")[0]
    .trim()
    .toLowerCase();

  if (contentType !== "application/json") {
    throw new Error("Invalid content type");
  }

  const length = request.headers.get("Content-Length");

  if (length !== null) {
    if (!/^\d+$/.test(length) || Number(length) > limit) {
      throw new Error("Invalid or oversized body");
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
        throw new Error("Body too large");
      }

      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;

  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  const text = new TextDecoder("utf-8", {
    fatal: true
  }).decode(bytes);

  const data = JSON.parse(text);

  if (
    !data ||
    typeof data !== "object" ||
    Array.isArray(data)
  ) {
    throw new Error("Invalid JSON object");
  }

  return data;
}

function getString(value, maxLength, fallback = "") {
  if (value === undefined || value === null) {
    return fallback;
  }

  if (typeof value !== "string") {
    throw new Error("Invalid text field");
  }

  const result = value.trim();

  if (result.length > maxLength) {
    throw new Error("Text field too long");
  }

  return result;
}

function normalizeCategory(value) {
  const category = getString(value, 80)
    .replace(/\s+/g, " ")
    .toUpperCase();

  if (!ALLOWED_CATEGORIES.has(category)) {
    throw new Error("Invalid category");
  }

  return category;
}

function normalizeFeatures(value) {
  let items = [];

  if (Array.isArray(value)) {
    items = value;
  } else if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);

      if (Array.isArray(parsed)) {
        items = parsed;
      } else {
        items = value.split("\n");
      }
    } catch {
      items = value.split("\n");
    }
  } else if (value !== undefined && value !== null) {
    throw new Error("Invalid features");
  }

  if (items.length > 20) {
    throw new Error("Too many features");
  }

  const features = items.map(item => {
    if (typeof item !== "string") {
      throw new Error("Invalid feature");
    }

    const feature = item.trim();

    if (feature.length > 200) {
      throw new Error("Feature too long");
    }

    return feature;
  }).filter(Boolean);

  return JSON.stringify(features);
}

function normalizeBoolean(value) {
  return value === true ||
    value === 1 ||
    value === "1" ||
    value === "true";
}

function validateUrl(value) {
  const url = getString(value, 2048);

  if (!url) return "";

  let parsed;

  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Invalid website URL");
  }

  if (
    parsed.protocol !== "https:" ||
    !parsed.hostname ||
    parsed.username ||
    parsed.password
  ) {
    throw new Error("Website URL must use HTTPS");
  }

  return parsed.href;
}

function prepareTool(data) {
  const name = getString(data.name, 120);
  const category = normalizeCategory(data.category);

  if (!name) {
    throw new Error("Name and category are required");
  }

  const slug = makeSlug(
    getString(data.slug, 160, "") || name
  );

  if (
    !slug ||
    slug.length > 160 ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)
  ) {
    throw new Error("Invalid slug");
  }

  const url = validateUrl(
    data.url ?? data.website_url ?? ""
  );

  const description = getString(data.description, 1000);
  const letter = getString(
    data.letter,
    10,
    name.charAt(0)
  );
  const about = getString(data.about, 5000);
  const features = normalizeFeatures(data.features);

  const status = data.status === undefined ||
    data.status === "active"
      ? "active"
      : data.status === "inactive"
        ? "inactive"
        : null;

  if (!status) {
    throw new Error("Invalid tool status");
  }

  return {
    name,
    category,
    url,
    description,
    slug,
    letter,
    about,
    features,
    featured: normalizeBoolean(data.featured) ? 1 : 0,
    status
  };
}

async function slugExists(env, slug, excludeId = null) {
  let result;

  if (excludeId) {
    result = await env.DB.prepare(`
      SELECT id FROM tools
      WHERE slug = ? AND id != ?
      LIMIT 1
    `).bind(slug, excludeId).first();
  } else {
    result = await env.DB.prepare(`
      SELECT id FROM tools
      WHERE slug = ?
      LIMIT 1
    `).bind(slug).first();
  }

  return Boolean(result);
}

function parseFeatures(value) {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter(item => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

export async function onRequestGet({ request, env }) {
  if (!(await authorize(request, env))) {
    return json({
      success: false,
      message: "Unauthorized"
    }, 401);
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
      features: parseFeatures(tool.features),
      featured: Boolean(tool.featured)
    }));

    return json({
      success: true,
      count: tools.length,
      tools
    });

  } catch {
    return json({
      success: false,
      message: "Unable to load tools"
    }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  if (!hasAllowedOrigin(request)) {
    return json({
      success: false,
      message: "Forbidden origin"
    }, 403);
  }

  if (!(await authorize(request, env))) {
    return json({
      success: false,
      message: "Unauthorized"
    }, 401);
  }

  try {
    const data = await readBody(request);
    const tool = prepareTool(data);

    if (await slugExists(env, tool.slug)) {
      return json({
        success: false,
        message: "This slug is already in use"
      }, 409);
    }

    const id = crypto.randomUUID();

    await env.DB.prepare(`
      INSERT INTO tools (
        id, name, category, website_url,
        description, slug, letter, about,
        features, featured, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      tool.name,
      tool.category,
      tool.url,
      tool.description,
      tool.slug,
      tool.letter,
      tool.about,
      tool.features,
      tool.featured,
      tool.status
    ).run();

    return json({
      success: true,
      message: "Tool added successfully",
      id
    }, 201);

  } catch (error) {
    if (
      error.message === "Invalid content type" ||
      error.message === "Invalid or oversized body" ||
      error.message === "Body too large" ||
      error.message === "Missing body" ||
      error.message === "Invalid JSON object" ||
      error instanceof SyntaxError
    ) {
      return json({
        success: false,
        message: "Invalid request data"
      }, 400);
    }

    if (
      error.message === "Name and category are required" ||
      error.message === "Invalid category" ||
      error.message === "Invalid slug" ||
      error.message === "Invalid website URL" ||
      error.message === "Website URL must use HTTPS" ||
      error.message === "Invalid tool status" ||
      error.message === "Invalid text field" ||
      error.message === "Text field too long" ||
      error.message === "Invalid features" ||
      error.message === "Too many features" ||
      error.message === "Invalid feature" ||
      error.message === "Feature too long"
    ) {
      return json({
        success: false,
        message: error.message
      }, 400);
    }

    return json({
      success: false,
      message: "Unable to add tool"
    }, 500);
  }
}

export async function onRequestPut({ request, env }) {
  if (!hasAllowedOrigin(request)) {
    return json({
      success: false,
      message: "Forbidden origin"
    }, 403);
  }

  if (!(await authorize(request, env))) {
    return json({
      success: false,
      message: "Unauthorized"
    }, 401);
  }

  try {
    const data = await readBody(request);
    const id = getString(data.id, 100);

    if (!id) {
      return json({
        success: false,
        message: "Tool ID is required"
      }, 400);
    }

    const tool = prepareTool(data);

    if (await slugExists(env, tool.slug, id)) {
      return json({
        success: false,
        message: "This slug is already in use"
      }, 409);
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
      tool.name,
      tool.category,
      tool.url,
      tool.description,
      tool.slug,
      tool.letter,
      tool.about,
      tool.features,
      tool.featured,
      tool.status,
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
    if (
      error instanceof SyntaxError ||
      error.message === "Invalid content type" ||
      error.message === "Invalid or oversized body" ||
      error.message === "Body too large" ||
      error.message === "Missing body" ||
      error.message === "Invalid JSON object"
    ) {
      return json({
        success: false,
        message: "Invalid request data"
      }, 400);
    }

    const validationMessages = [
      "Tool ID is required",
      "Name and category are required",
      "Invalid category",
      "Invalid slug",
      "Invalid website URL",
      "Website URL must use HTTPS",
      "Invalid tool status",
      "Invalid text field",
      "Text field too long",
      "Invalid features",
      "Too many features",
      "Invalid feature",
      "Feature too long"
    ];

    if (validationMessages.includes(error.message)) {
      return json({
        success: false,
        message: error.message
      }, 400);
    }

    return json({
      success: false,
      message: "Unable to update tool"
    }, 500);
  }
}

export async function onRequestDelete({ request, env }) {
  if (!hasAllowedOrigin(request)) {
    return json({
      success: false,
      message: "Forbidden origin"
    }, 403);
  }

  if (!(await authorize(request, env))) {
    return json({
      success: false,
      message: "Unauthorized"
    }, 401);
  }

  try {
    const data = await readBody(request);
    const id = getString(data.id, 100);

    if (!id) {
      return json({
        success: false,
        message: "Tool ID is required"
      }, 400);
    }

    const result = await env.DB.prepare(`
      DELETE FROM tools WHERE id = ?
    `).bind(id).run();

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
    if (
      error instanceof SyntaxError ||
      error.message === "Invalid content type" ||
      error.message === "Invalid or oversized body" ||
      error.message === "Body too large" ||
      error.message === "Missing body" ||
      error.message === "Invalid JSON object"
    ) {
      return json({
        success: false,
        message: "Invalid request data"
      }, 400);
    }

    if (
      error.message === "Tool ID is required" ||
      error.message === "Invalid text field" ||
      error.message === "Text field too long"
    ) {
      return json({
        success: false,
        message: error.message
      }, 400);
    }

    return json({
      success: false,
      message: "Unable to delete tool"
    }, 500);
  }
}
