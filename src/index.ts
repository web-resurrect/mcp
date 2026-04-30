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
  description: `Web Resurrect API — resurrect expired domains by recovering their archived content and republishing it on WordPress. Designed for FULLY AUTONOMOUS operation: every async call returns a job_id, and wait_for_job blocks until completion so you never need to poll manually.

GOLDEN RULE: After every async call (create_project, enrich_project, scrape_*, rewrite_*, generate_image_*, wordpress_publish_*), call wait_for_job with the returned job_id BEFORE the next step. Use get_project_overview at decision points to see pipeline state in one call instead of multiple list_pages.

WORKFLOW — from expired domain to live WordPress site:

0. CHECK CREDITS: get_credits. Rough budget: scrape = 1/page, basic rewrite = 1/page, Wisewand = 5/page (1 with own key), image = 1/page, Majestic enrichment = 10 total.

1. CREATE PROJECT: create_project(domain) → job_id. wait_for_job until completed. Auto-fetches archived URLs from the Wayback Machine. Also discovers Haloscan-origin pages (no Wayback snapshot, Wisewand-only).

2. ENRICH SEO DATA: enrich_project(project_id, sources=["haloscan","majestic"]) → job_id. wait_for_job. Haloscan is free (traffic + keywords), Majestic costs 10 credits (backlinks). Use both.

3. PICK BEST PAGES: get_project_overview(project_id) for a quick summary, then list_pages(sort="total_traffic", order="desc", exclude_system=true, has_data="any"). The exclude_system flag drops legal/info pages (contact, mentions-legales, cgv, privacy, a-propos) automatically — they're kept on the target site but never resurrected. Use status="pending" / "haloscan" / "rewritable_wisewand" to narrow further.

4. SCRAPE: scrape_bulk(project_id=..., has_data="any", limit=50) → job_id. wait_for_job (2-5 min for 50 pages). 🔴 ABSOLUTE RULE: has_data IS NOT OPTIONAL — pass "any" (traffic OR backlinks) or "haloscan" (traffic OR keywords only). Scraping pages with zero SEO data is a credit waste — they will never rank in SERP again. Skipped automatically for Haloscan-origin pages (no Wayback snapshot — they go through Wisewand directly).

4b. DECISION POINT — HALOSCAN-ONLY PAGES: After scrape_bulk, some pages may still be in status="haloscan" (no Wayback snapshot — Haloscan found them but the archive doesn't have them). They CANNOT be scraped, only Wisewand-rewritten with synthetic content (slug + keywords as input). This is a USER DECISION — Wisewand costs 5 credits/page (1 with own key) AND takes 2-4 hours. ALWAYS surface this to the user with the count + total credit cost and ask whether to (a) include them via Wisewand, or (b) skip them entirely. Never auto-include Haloscan-only pages in rewrite without explicit confirmation. To find them: list_pages(project_id, status="haloscan", has_data="any").

5. CONNECT WORDPRESS — before touching WP, do this sequence:
   a. wordpress_plugin_check(domain) — detects the Web Resurrect plugin.
   b. wordpress_configure(site_url, mode="plugin") OR wordpress_configure(site_url, username, app_password) for Basic Auth.
   c. wordpress_validate(domain) — confirms connection works.
   d. wordpress_categories(domain) and wordpress_authors(domain).

6. MAP CATEGORIES TO AUTHORS: wordpress_set_mapping(domain, mappings). Heuristic: if there is only one author, map every category to that one author. If authors have names matching category names (e.g. "Mode" ↔ "Elise-Mode"), pair them. Otherwise ask the user. MUST be done BEFORE categorize_pages.

7. CATEGORIZE: categorize_pages(page_ids, wordpress_domain) — AI-suggests a category for each page, saves it on the page. Free. Batch of 1-50 per call. Run on every page you intend to publish.

8. REWRITE: rewrite_bulk(page_ids, wisewand=true) → job_id. wait_for_job (Wisewand = 2-4 HOURS — use timeout_seconds=3600 and re-call, or tell the user to come back later). Wisewand mode AUTO-RECOVERS any page where scrape failed or Wayback returned empty: the backend falls back to synthetic content (slug + ranked keywords) so high-traffic pages are never lost because of a scrape error. To grab every eligible page in one call: list_pages(status="rewritable_wisewand", exclude_system=true). For fast cheap rewrites, omit wisewand.

9. IMAGES: generate_image_bulk(page_ids) → job_id. wait_for_job (1-3 min for 50). Pages without featured images look incomplete on WordPress — always do this.

10. PUBLISH: wordpress_publish_bulk(page_ids, wordpress_domain, status="draft") → job_id. wait_for_job. Author is auto-resolved from the category-author mapping. In plugin mode, original URLs are preserved. Start with status="draft" for safety, then publish after a human review.

11. REDIRECTS — depends on WP mode:
    - Plugin mode: push_redirects(project_id, wordpress_domain). Published pages serve at original URLs, unpublished ones 301 to homepage. WARNING: before calling, make sure system pages (contact, legal...) are published or excluded, or they will 301 too.
    - Basic Auth mode: export_redirects(project_id, format="redirection") returns JSON — give it to the user so they import it in WordPress → Redirection plugin.

IMPORTANT RULES:
- 🔴 NEVER scrape an entire project blindly. After enrich_project, every scrape_bulk and rewrite_bulk MUST pass has_data="any" (traffic OR backlinks) or has_data="haloscan" (traffic OR keywords). Without this filter you scrape thousands of zero-value pages — pages with 0 traffic, 0 keywords, AND 0 backlinks will never rank in SERP again, scraping them is a credit waste.
- Every page should go scrape (when applicable) → rewrite → image → categorize → publish. Skipping steps produces low-quality sites.
- Basic Auth mode works fully for publishing but requires the user to manually import redirects — plugin mode is smoother if autonomy is the goal.
- Confirm with the user before expensive operations (Wisewand bulk on 50 pages = 500 credits).
- Use get_project_overview liberally — it is free and saves multiple list_pages calls.`,
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
