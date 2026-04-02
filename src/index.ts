#!/usr/bin/env node

/**
 * Web Resurrect MCP Server
 *
 * Exposes the Web Resurrect API as MCP tools for AI assistants.
 * Uses stdio transport for Claude Desktop integration.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { WebResurrectClient } from "./client.js";
import { registerTools } from "./tools.js";

const API_KEY = process.env.WEB_RESURRECT_API_KEY;
const BASE_URL = process.env.WEB_RESURRECT_BASE_URL ?? "https://web-resurrect.com";

if (!API_KEY) {
  console.error(
    "Error: WEB_RESURRECT_API_KEY environment variable is required.\n" +
      "Get your API key from https://web-resurrect.com/dashboard"
  );
  process.exit(1);
}

const server = new McpServer({
  name: "web-resurrect",
  version: "1.0.0",
  description: `Web Resurrect API — resurrect expired domains by recovering their archived content and republishing it on WordPress.

RECOMMENDED WORKFLOW:
1. Create a project for the expired domain (create_project) — this auto-fetches archived URLs from the Wayback Machine.
2. Enrich the project with SEO data (enrich_project) — ALWAYS use BOTH sources ["haloscan", "majestic"] to get traffic, keywords, AND backlinks data. This is critical to identify the most valuable pages to resurrect.
3. List pages sorted by traffic or backlinks (list_pages with sort="total_traffic" or sort="backlinks_count") to prioritize the best pages.
4. Scrape the selected pages (scrape_page or scrape_bulk) — extracts the original content from the Wayback Machine archive.
5. Rewrite the scraped content — STRONGLY PREFER rewrite_wisewand over rewrite_page. Wisewand produces much higher quality, SEO-optimized, unique content. Basic GPT rewrite is a fallback only. If the user has a Wisewand API key, pass it via wisewand_api_key to reduce cost to 1 credit.
6. Generate a featured image (generate_image) — ALWAYS generate an image after rewriting. A page without a featured image looks incomplete and unprofessional on WordPress.
7. Publish to WordPress (wordpress_publish) — the final step.

IMPORTANT: Every page should go through the full pipeline: scrape → rewrite (Wisewand preferred) → generate image → publish. Skipping steps produces lower quality results.`,
});

const client = new WebResurrectClient(API_KEY, BASE_URL);

registerTools(server, client);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
