
import { isAdminAuthenticated } from "./admin/_auth.js";

const ALLOWED_ORIGIN = "https://ai-one-a2u.pages.dev";

function hasAllowedOrigin(request) {
  return request.headers.get("Origin") === ALLOWED_ORIGIN;
}

const tools = [
  {
    slug: "chatgpt",
    name: "ChatGPT",
    category: "WRITING",
    letter: "C",
    url: "https://chatgpt.com/",
    description: "An AI assistant designed for writing, learning, brainstorming, problem-solving and everyday tasks.",
    about: "Discover what ChatGPT offers and explore how it can support your creative, professional or learning activities.",
    features: ["Generate and improve written content", "Explore ideas and explanations", "Assist with learning and problem-solving"],
    featured: 1
  },
  {
    slug: "midjourney",
    name: "Midjourney",
    category: "IMAGES",
    letter: "M",
    url: "https://www.midjourney.com/",
    description: "An AI image generation platform that transforms text prompts and creative ideas into visual artwork.",
    about: "Explore creative image generation and discover new ways to turn ideas into visual concepts.",
    features: ["Generate images from text prompts", "Explore different artistic styles", "Develop creative visual concepts"],
    featured: 0
  },
  {
    slug: "notion-ai",
    name: "Notion AI",
    category: "PRODUCTIVITY",
    letter: "N",
    url: "https://www.notion.com/product/ai",
    description: "AI features integrated into Notion to help organize information, write content and manage work.",
    about: "Discover AI-powered tools designed to support organization, writing and everyday productivity.",
    features: ["Summarize and organize information", "Improve writing and documentation", "Support productivity workflows"],
    featured: 0
  },
  {
    slug: "github-copilot",
    name: "GitHub Copilot",
    category: "CODING",
    letter: "G",
    url: "https://github.com/features/copilot",
    description: "An AI coding assistant that helps developers write, understand and improve software code.",
    about: "Explore AI assistance for software development, coding workflows and understanding code.",
    features: ["Suggest code while you work", "Explain and understand code", "Support software development tasks"],
    featured: 0
  },
  {
    slug: "grammarly",
    name: "Grammarly",
    category: "WRITING",
    letter: "G",
    url: "https://www.grammarly.com/",
    description: "A writing assistant that helps improve clarity, correctness and communication.",
    about: "Discover tools that help make written communication clearer and more effective.",
    features: ["Check grammar and spelling", "Improve clarity and tone", "Support effective communication"],
    featured: 0
  },
  {
    slug: "leonardo-ai",
    name: "Leonardo AI",
    category: "IMAGES",
    letter: "L",
    url: "https://leonardo.ai/",
    description: "A creative AI platform for generating images and developing visual concepts.",
    about: "Explore creative tools for visual generation, design exploration and artistic ideas.",
    features: ["Generate creative images", "Explore visual styles", "Develop visual concepts"],
    featured: 0
  },
  {
    slug: "claude",
    name: "Claude",
    category: "WRITING",
    letter: "C",
    url: "https://claude.ai/",
    description: "An AI assistant for writing, analysis, reasoning, learning and working with information.",
    about: "Discover an AI assistant that can help explore ideas, understand information and work through tasks.",
    features: ["Assist with writing and analysis", "Explain complex information", "Support reasoning and learning"],
    featured: 1
  },
  {
    slug: "gemini",
    name: "Google Gemini",
    category: "WRITING",
    letter: "G",
    url: "https://gemini.google.com/",
    description: "Google's AI assistant for exploring ideas, understanding information and supporting creative tasks.",
    about: "Explore Google's AI assistant and its capabilities for learning, creativity and everyday tasks.",
    features: ["Explore ideas and information", "Support creative tasks", "Assist with learning and productivity"],
    featured: 1
  },
  {
    slug: "perplexity",
    name: "Perplexity",
    category: "RESEARCH",
    letter: "P",
    url: "https://www.perplexity.ai/",
    description: "An AI-powered answer and search platform for exploring questions and discovering information.",
    about: "Discover an AI-powered research and answer experience for exploring topics and finding information.",
    features: ["Explore questions and topics", "Discover relevant information", "Support research and learning"],
    featured: 0
  },
  {
    slug: "runway",
    name: "Runway",
    category: "VIDEO & AUDIO",
    letter: "R",
    url: "https://runwayml.com/",
    description: "A creative platform offering AI-powered tools for video generation and visual production.",
    about: "Explore AI-powered creative tools for video and visual storytelling.",
    features: ["Explore AI video tools", "Develop visual content", "Support creative production"],
    featured: 0
  },
  {
    slug: "elevenlabs",
    name: "ElevenLabs",
    category: "VIDEO & AUDIO",
    letter: "E",
    url: "https://elevenlabs.io/",
    description: "An AI audio platform focused on voice generation and audio experiences.",
    about: "Discover AI audio tools and explore voice technology for creative projects.",
    features: ["Explore AI voice generation", "Create audio experiences", "Support audio projects"],
    featured: 0
  },
  {
    slug: "gamma",
    name: "Gamma",
    category: "PRODUCTIVITY",
    letter: "G",
    url: "https://gamma.app/",
    description: "A platform that helps create presentations, documents and visual content with AI.",
    about: "Explore ways to create and communicate ideas through AI-assisted presentations and documents.",
    features: ["Create presentations", "Develop documents", "Organize visual content"],
    featured: 0
  },
  {
    slug: "canva",
    name: "Canva",
    category: "IMAGES",
    letter: "C",
    url: "https://www.canva.com/",
    description: "A visual design platform with tools for creating graphics, presentations and digital content.",
    about: "Discover creative design tools for visual communication and digital projects.",
    features: ["Create graphics and designs", "Build presentations", "Develop digital content"],
    featured: 0
  },
  {
    slug: "zapier-ai",
    name: "Zapier AI",
    category: "BUSINESS",
    letter: "Z",
    url: "https://zapier.com/ai",
    description: "AI and automation features that help connect apps and organize workflows.",
    about: "Explore automation tools designed to connect applications and simplify repetitive workflows.",
    features: ["Connect different applications", "Automate workflows", "Organize everyday tasks"],
    featured: 0
  },
  {
    slug: "hubspot-ai",
    name: "HubSpot AI",
    category: "MARKETING",
    letter: "H",
    url: "https://www.hubspot.com/products/artificial-intelligence",
    description: "AI features across HubSpot products for marketing, sales and customer support workflows.",
    about: "Discover AI-powered features designed to support marketing, sales and customer relationships.",
    features: ["Support marketing workflows", "Assist sales activities", "Improve customer support processes"],
    featured: 0
  },
  {
    slug: "khanmigo",
    name: "Khanmigo",
    category: "EDUCATION",
    letter: "K",
    url: "https://www.khanmigo.ai/",
    description: "An AI-powered learning assistant from Khan Academy designed to support learning and teaching.",
    about: "Explore an AI learning assistant designed to support students and educators.",
    features: ["Support learning activities", "Explore educational topics", "Assist teaching and learning"],
    featured: 0
  },
  {
    slug: "elicit",
    name: "Elicit",
    category: "RESEARCH",
    letter: "E",
    url: "https://elicit.com/",
    description: "An AI research assistant that helps explore academic literature and research information.",
    about: "Discover tools designed to support literature exploration and research workflows.",
    features: ["Explore academic literature", "Organize research information", "Support evidence discovery"],
    featured: 0
  }
];

export async function onRequestPost({ request, env }) {
  if (!hasAllowedOrigin(request)) {
    return new Response(
      JSON.stringify({ success: false, message: "Forbidden origin" }),
      {
        status: 403,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store"
        }
      }
    );
  }

  const authenticated = await isAdminAuthenticated(request, env);

  if (!authenticated) {
    return new Response(
      JSON.stringify({ success: false, message: "Unauthorized" }),
      {
        status: 401,
        headers: { "Content-Type": "application/json" }
      }
    );
  }

  try {
    const statements = tools.map((tool) =>
      env.DB.prepare(`
        INSERT OR IGNORE INTO tools (
          id, name, category, website_url, description,
          status, slug, letter, about, features, featured
        )
        VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?)
      `).bind(
        tool.slug,
        tool.name,
        tool.category,
        tool.url,
        tool.description,
        tool.slug,
        tool.letter,
        tool.about,
        JSON.stringify(tool.features),
        tool.featured
      )
    );

    const results = await env.DB.batch(statements);
    const inserted = results.reduce(
      (total, result) => total + (result.meta?.changes || 0),
      0
    );

    return new Response(
      JSON.stringify({
        success: true,
        total: tools.length,
        inserted,
        message: "Tool import completed"
      }),
      {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store"
        }
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        message: "Tool import failed"
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" }
      }
    );
  }
}
