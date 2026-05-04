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

const SERVER_INSTRUCTIONS = `Web Resurrect resurrects expired domains by recovering archived content and republishing it on WordPress. The pipeline is fully async: every mutating call returns a job_id, and wait_for_job blocks until completion.

After any async call (create_project, enrich_project, scrape_*, rewrite_*, generate_image_*, wordpress_publish_*), call wait_for_job with the returned job_id before the next step. Use get_project_overview at decision points to see pipeline state in one call.

WORKFLOW — expired domain → live WordPress site:

0. get_credits — rough cost: scrape = 1/page, basic rewrite = 1/page, Wisewand = 5/page (1 with own key), image = 1/page, Majestic enrichment = 10 total.

1. create_project(domain) → wait_for_job. Auto-fetches archived URLs from the Wayback Machine and discovers Haloscan-origin pages (no Wayback snapshot, Wisewand-only).

2. enrich_project(project_id, sources=["haloscan","majestic"]) → wait_for_job. Haloscan is free (traffic + keywords), Majestic costs 10 credits (backlinks). Both together give the full SEO picture.

3. Pick best pages: get_project_overview(project_id), then list_pages(sort="total_traffic", order="desc", exclude_system=true, has_data="any"). exclude_system drops legal/info pages (contact, mentions-legales, cgv, privacy, a-propos) — kept on the target site but never resurrected.

4. scrape_bulk(project_id=..., has_data="any", limit=50) → wait_for_job (2-5 min for 50 pages). has_data is critical: "any" = traffic OR backlinks, "haloscan" = traffic OR keywords. Scraping pages with zero SEO data is a credit waste. Haloscan-origin pages are skipped automatically (no Wayback snapshot — Wisewand-only path).

4b. Decision point — Haloscan-only pages. Some pages stay in status="haloscan" after scrape_bulk (Haloscan found them but Wayback has no snapshot). They can only be Wisewand-rewritten with synthetic content (slug + keywords). This is a user decision: Wisewand costs 5 credits/page (1 with own key) and takes 2-4 hours. Surface the count + total credit cost to the user before including them. Find them: list_pages(project_id, status="haloscan", has_data="any").

5. WordPress connection sequence:
   a. wordpress_plugin_check(domain) — detects the Web Resurrect plugin.
   b. wordpress_configure(site_url, mode="plugin") or (site_url, username, app_password) for Basic Auth.
   c. wordpress_validate(domain).
   d. wordpress_categories(domain) and wordpress_authors(domain).

6. wordpress_set_mapping(domain, mappings) — done before categorize_pages. Heuristic: single author → map every category to it. Author names matching category names (e.g. "Mode" ↔ "Elise-Mode") → pair them. Otherwise ask the user.

7. categorize_pages(page_ids, wordpress_domain) — AI-suggests a category per page and saves it. Free. Batches of 1-50.

8. rewrite_bulk(page_ids, wisewand=true) → wait_for_job (Wisewand = 2-4 hours; use timeout_seconds=3600 and re-call, or come back later). Wisewand mode auto-falls-back to synthetic content (slug + keywords) when a page has no scraped content — covers Haloscan-only and scrape-failed pages. To queue every eligible page: list_pages(status="rewritable_wisewand", exclude_system=true). For fast cheap rewrites, omit wisewand.

9. generate_image_bulk(page_ids) → wait_for_job (1-3 min for 50). Pages without featured images look incomplete on WordPress.

10. wordpress_publish_bulk(page_ids, wordpress_domain, status="draft") → wait_for_job. Author auto-resolved from the mapping. Plugin mode preserves original URLs. Default to status="draft" for human review.

11. Redirects depend on the WP mode:
    - Plugin mode: push_redirects(project_id, wordpress_domain). Published pages serve at original URLs; unpublished ones 301 to homepage. Before calling: ensure system pages are published or excluded, or they will 301 too.
    - Basic Auth mode: export_redirects(project_id, format="redirection") returns JSON for manual import via WordPress → Redirection plugin.

KEY POINTS:
- has_data filter on scrape_bulk and rewrite_bulk: pages with 0 traffic, 0 keywords, and 0 backlinks will not rank again — skip them.
- Pipeline order per page: scrape (when applicable) → rewrite → image → categorize → publish.
- Basic Auth mode publishes fine but redirects must be imported manually; plugin mode is smoother for end-to-end autonomy.
- Wisewand bulk on 50 pages = 250 credits (50 with own key) and 2-4 hours — confirm with the user first.
- get_project_overview is free; prefer it over multiple list_pages calls.`;

const server = new McpServer(
  {
    name: "web-resurrect",
    version,
    description: "Resurrect expired domains: recover archived content and republish on WordPress.",
  },
  { instructions: SERVER_INSTRUCTIONS }
);

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
