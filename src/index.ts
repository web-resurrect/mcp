#!/usr/bin/env node

/**
 * Web Resurrect MCP Server
 *
 * Exposes the Web Resurrect API as MCP tools for AI assistants.
 * Uses stdio transport for Claude Desktop integration.
 */

import { createRequire } from "node:module";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { WebResurrectClient } from "./client.js";
import { registerTools } from "./tools.js";

const require = createRequire(import.meta.url);
const { version } = require("../package.json");

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
  version,
  description: `Web Resurrect API — resurrect expired domains by recovering their archived content and republishing it on WordPress.

WORKFLOW — from expired domain to live WordPress site:

1. CREATE PROJECT: create_project with the expired domain. This auto-fetches all archived URLs from the Wayback Machine. Then list_pages to review the retrieved URLs.

2. ENRICH WITH SEO DATA: enrich_project with BOTH sources ["haloscan", "majestic"].
   - Haloscan provides traffic estimates and keyword data (free).
   - Majestic provides backlink data (10 credits).
   Always use both for the best page prioritization.

3. PICK THE BEST PAGES: list_pages sorted by total_traffic or backlinks_count. Prioritize pages that have Haloscan and/or Majestic data — pages with no SEO data are low-priority and should be skipped or done last.

4. SCRAPE ARCHIVED CONTENT: scrape_page or scrape_bulk to extract original content from the Wayback Machine (1 credit/page). Only scrape the prioritized pages first.

5. REWRITE CONTENT: rewrite_page with wisewand=true for premium SEO-optimized rewrites (recommended, costs credits — always confirm with user before bulk operations as this can consume many credits). Use basic rewrite (wisewand=false) for 1 credit. Pass wisewand_api_key to reduce Wisewand cost to 1 credit. CLI users can pass -y/--yes to skip confirmation prompts.

6. GENERATE FEATURED IMAGES: generate_image for each rewritten page (1 credit/page). ALWAYS generate images — pages without a featured image look incomplete on WordPress.

7. CONNECT WORDPRESS: Before publishing, verify the WordPress connection with wordpress_check. The site needs either the Resurect plugin (X-Resurect-Key auth) or an application password configured. This connection is required to fetch categories and authors.

8. CATEGORIZE ARTICLES: categorize_page to suggest a WordPress category based on page content (free). Use wordpress_categories to list available categories.

9. PUBLISH TO WORDPRESS: wordpress_publish with the page_id, domain, and author_id. Use wordpress_authors to list available authors.

IMPORTANT: Every page should go through the full pipeline: scrape → rewrite → image → categorize → publish. Skipping steps produces lower quality results.`,
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
