/**
 * MCP tool definitions and handlers for the Web Resurrect API.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { WebResurrectClient } from "./client.js";

export function registerTools(server: McpServer, client: WebResurrectClient): void {
  // ── Credits ──────────────────────────────────────────────────────────

  server.tool("get_credits", "Get current credit balance, email, and account info", {}, async () => {
    const res = await client.getCredits();
    return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
  });

  // ── Projects ─────────────────────────────────────────────────────────

  server.tool(
    "create_project",
    "Create a new project for an expired domain. Automatically starts fetching archived URLs from the Wayback Machine. Returns a job_id to track URL fetching progress.",
    {
      domain: z.string().describe("Expired domain to analyze (e.g. example.fr)"),
      name: z.string().optional().describe("Project name (defaults to domain)"),
    },
    async ({ domain, name }) => {
      const res = await client.createProject(domain, name);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(res.data, null, 2) +
              "\n\nURL fetching started. Use get_job with the job_id to track progress." +
              "\n\nNEXT STEP: Once URLs are fetched, enrich the project with enrich_project using sources [\"haloscan\", \"majestic\"] to get traffic and backlink data for all pages. This helps identify the most valuable pages to resurrect.",
          },
        ],
      };
    }
  );

  server.tool(
    "list_projects",
    "List all projects with their page counts",
    {
      page: z.number().int().positive().optional().describe("Page number (default 1)"),
      limit: z.number().int().min(1).max(100).optional().describe("Items per page (default 20, max 100)"),
    },
    async ({ page, limit }) => {
      const res = await client.listProjects(page, limit);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ data: res.data, pagination: res.pagination }, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "get_project",
    "Get project details including stats (page counts, scrape/rewrite/publish progress)",
    {
      project_id: z.string().uuid().describe("Project UUID"),
    },
    async ({ project_id }) => {
      const res = await client.getProject(project_id);
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  server.tool(
    "delete_project",
    "Delete a project and all its pages (cascade). This action is irreversible.",
    {
      project_id: z.string().uuid().describe("Project UUID"),
    },
    async ({ project_id }) => {
      const res = await client.deleteProject(project_id);
      return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
    }
  );

  // ── Pages ────────────────────────────────────────────────────────────

  server.tool(
    "list_pages",
    "List pages of a project with optional filters, search, sorting, and pagination. TIP: After enrichment, sort by total_traffic (desc) or backlinks_count (desc) to identify the most valuable pages to resurrect first. Each page carries a `source` field: 'wayback' (default, scrapeable from the archive) or 'haloscan' (discovered via Haloscan, no Wayback snapshot — Wisewand-rewrite only, cannot be scraped).",
    {
      project_id: z.string().uuid().describe("Project UUID"),
      status: z
        .enum(["pending", "scraped", "empty", "failed", "rewritten", "published", "haloscan", "rewritable_wisewand"])
        .optional()
        .describe("Filter by page status. 'empty' = scraped but no content on Wayback Machine. 'failed' = scrape error. 'haloscan' = Haloscan-origin pages awaiting Wisewand rewrite (no Wayback snapshot). 'rewritable_wisewand' = every page eligible for Wisewand rewrite (scraped + Haloscan-origin + scrape-failed + empty — synthetic fallback)."),
      source: z
        .enum(["wayback", "haloscan", "semrush"])
        .optional()
        .describe("Filter by page origin. 'wayback' = discovered via the Wayback Machine CDX API (default, scrapeable). 'haloscan' = discovered via Haloscan with no Wayback snapshot (Wisewand-rewrite only)."),
      has_data: z
        .enum(["haloscan", "majestic", "any"])
        .optional()
        .describe("Only pages with SEO data: haloscan (traffic>0), majestic (backlinks>0), any (either)"),
      search: z.string().optional().describe("Search by URL or title"),
      sort: z
        .enum(["created_at", "total_traffic", "backlinks_count", "url", "title"])
        .optional()
        .describe("Sort field"),
      order: z.enum(["asc", "desc"]).optional().describe("Sort order (default desc)"),
      page: z.number().int().positive().optional().describe("Page number (default 1)"),
      limit: z.number().int().min(1).max(100).optional().describe("Items per page (default 50, max 100)"),
      exclude_system: z
        .boolean()
        .optional()
        .describe("Exclude legal/info pages — contact, mentions-legales, CGV, CGU, privacy, a-propos, about, sitemap. RECOMMENDED for autonomous flows (scrape/rewrite/publish). These pages are kept in the DB (flag excluded_from_redirects=true) so they stay reachable on the site but shouldn't be resurrected."),
    },
    async ({ project_id, status, source, has_data, search, sort, order, page, limit, exclude_system }) => {
      const res = await client.listPages(project_id, { status, source, has_data, search, sort, order, page, limit, exclude_system });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ data: res.data, pagination: res.pagination }, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "get_page",
    "Get full page details: scrape status, rewrite status, SEO data (traffic, keywords, backlinks), WordPress publish status, and featured image",
    {
      page_id: z.string().uuid().describe("Page UUID"),
    },
    async ({ page_id }) => {
      const res = await client.getPage(page_id);
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  server.tool(
    "update_page",
    "Update a page's WordPress category, author, or post link. Use this to (a) manually set category/author after categorization, (b) attach a manually-created WordPress post back to the page via wordpress_post_id — essential when the publish pipeline was bypassed but redirects export still needs the mapping. Set any field to null to clear.",
    {
      page_id: z.string().uuid().describe("Page UUID"),
      category_id: z
        .number()
        .int()
        .nullable()
        .optional()
        .describe("WordPress category ID to assign (null to clear)"),
      category_name: z
        .string()
        .nullable()
        .optional()
        .describe("WordPress category name (set alongside category_id)"),
      author_id: z
        .number()
        .int()
        .nullable()
        .optional()
        .describe("WordPress author ID to assign (null to clear)"),
      wordpress_post_id: z
        .number()
        .int()
        .nullable()
        .optional()
        .describe("Manually link this WR page to an existing WordPress post ID. Sets posted_to_wordpress=true automatically. Null to clear."),
      wordpress_post_url: z
        .string()
        .nullable()
        .optional()
        .describe("WordPress post URL (goes with wordpress_post_id). Null to clear."),
    },
    async ({ page_id, category_id, category_name, author_id, wordpress_post_id, wordpress_post_url }) => {
      const updates: Record<string, unknown> = {};
      if (category_id !== undefined) updates.category_id = category_id;
      if (category_name !== undefined) updates.category_name = category_name;
      if (author_id !== undefined) updates.author_id = author_id;
      if (wordpress_post_id !== undefined) updates.wordpress_post_id = wordpress_post_id;
      if (wordpress_post_url !== undefined) updates.wordpress_post_url = wordpress_post_url;
      const res = await client.updatePage(page_id, updates);
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  server.tool(
    "get_page_content",
    "Fetch the rewritten content (title + HTML + meta) for a page. Returns source='wisewand' or 'openai'. Use this when you need to inspect or export the rewrite before publishing.",
    {
      page_id: z.string().uuid().describe("Page UUID (must be rewritten)"),
    },
    async ({ page_id }) => {
      const res = await client.getPageRewritten(page_id);
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  // ── Scraping ─────────────────────────────────────────────────────────

  server.tool(
    "scrape_page",
    "Scrape a single page from the Wayback Machine archive. Costs 1 credit. Returns a job_id for async tracking. IMPORTANT: Scraping is the mandatory first step before rewriting or generating images — a page must be scraped before any other processing.",
    {
      page_id: z.string().uuid().describe("Page UUID to scrape"),
      content_type: z
        .enum(["article", "product", "productList", "jina"])
        .optional()
        .describe("Content extraction type (default: article)"),
    },
    async ({ page_id, content_type }) => {
      const res = await client.scrapePage(page_id, content_type);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(res.data, null, 2) +
              "\n\nScraping started. Use get_job with the job_id to check when it completes." +
              "\n\nNEXT STEP: Once scraped, rewrite the page with rewrite_page (add wisewand=true for premium quality). Then generate a featured image with generate_image.",
          },
        ],
      };
    }
  );

  server.tool(
    "scrape_bulk",
    `Scrape multiple pages at once. Costs 1 credit per page. Max 100 pages. Returns a job_id. IMPORTANT: Scraping is the mandatory first step — pages must be scraped before rewriting or generating images. You can either pass page_ids directly, or pass project_id to auto-select pending pages (optionally filtered by has_data).

🔴 ABSOLUTE RULE: NEVER scrape an entire project blindly. AFTER enrich_project completes, ALWAYS pass has_data='any' (traffic OR backlinks, recommended) or has_data='haloscan' (traffic OR keywords only) so you ONLY scrape pages that had real SEO value before the domain expired. A page with 0 traffic, 0 keywords, AND 0 backlinks will never rank again — scraping it is a credit waste.

The right autonomous flow is:
1. enrich_project(project_id, sources=["haloscan","majestic"])
2. wait_for_job
3. scrape_bulk(project_id, has_data='any', limit=100)  ← THE FILTER IS NON-OPTIONAL
4. wait_for_job
5. Repeat scrape_bulk until no more pending pages with SEO data.`,
    {
      page_ids: z
        .array(z.string().uuid())
        .min(1)
        .max(100)
        .describe("Array of page UUIDs to scrape")
        .optional(),
      project_id: z
        .string()
        .uuid()
        .optional()
        .describe("Project UUID — auto-selects pending pages (use instead of page_ids)"),
      has_data: z
        .enum(["haloscan", "majestic", "any"])
        .optional()
        .describe("🔴 ALMOST ALWAYS REQUIRED for autonomous flows. Only scrape pages with SEO data. Requires project_id. haloscan=traffic>0 OR keywords (the user's primary signal), majestic=backlinks>0, any=either. Skipping this filter means scraping pages with 0 SEO value — credit waste."),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe("Max pages to scrape when using project_id (default 50)"),
      content_type: z
        .enum(["article", "product", "productList", "jina"])
        .optional()
        .describe("Content extraction type (default: article)"),
      exclude_system: z
        .boolean()
        .optional()
        .describe("Skip legal/info pages (contact, mentions-legales, CGV, privacy, a-propos, ...) when auto-selecting via project_id. Default true — autonomous flows almost never want to scrape those."),
    },
    async ({ page_ids, project_id, has_data, limit, content_type, exclude_system }) => {
      let ids = page_ids;
      if (!ids) {
        if (!project_id) {
          return { content: [{ type: "text" as const, text: "Error: provide either page_ids or project_id." }] };
        }
        // status="pending" already excludes Haloscan-origin pages (they have no
        // Wayback snapshot and cannot be scraped — only Wisewand-rewritten).
        // exclude_system defaults to true so auto-selection skips legal/info pages.
        const pages = await client.listPages(project_id, {
          status: "pending",
          has_data,
          limit: limit ?? 50,
          exclude_system: exclude_system !== false,
        });
        ids = (pages.data ?? []).map((p: { id: string }) => p.id);
        if (ids.length === 0) {
          return { content: [{ type: "text" as const, text: "No matching pending pages found" + (has_data ? ` with ${has_data} data` : "") + "." }] };
        }
      }
      const res = await client.scrapeBulk(ids, content_type);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(res.data, null, 2) +
              "\n\nBulk scraping started. Use get_job with the job_id to track progress." +
              "\n\nNEXT STEP: Once scraped, rewrite the pages with rewrite_bulk (add wisewand=true for premium quality). Then generate featured images with generate_image_bulk.",
          },
        ],
      };
    }
  );

  // ── SEO Enrichment ───────────────────────────────────────────────────

  server.tool(
    "enrich_project",
    `Enrich a project with SEO data. BEST PRACTICE: ALWAYS use both sources ["haloscan", "majestic"] together to get the full picture — Haloscan provides traffic estimates and keyword rankings (free), Majestic provides backlink profiles (10 credits). Having both datasets is essential to make informed decisions about which pages are worth resurrecting. Without Majestic, you miss backlink data which is critical for SEO value assessment.

🔴 GOLDEN RULE OF AN AUTONOMOUS RESURRECTION: enrich_project is what makes the rest of the pipeline efficient. Right after this completes, EVERY scrape_bulk and rewrite_bulk call must pass has_data='any' (traffic OR backlinks) or has_data='haloscan' (traffic OR keywords only). Without that filter you'll scrape thousands of zero-value pages and waste the user's credits. A page with 0 traffic, 0 keywords, AND 0 backlinks will never rank in SERP again — there is no point resurrecting it.`,
    {
      project_id: z.string().uuid().describe("Project UUID"),
      sources: z
        .array(z.enum(["haloscan", "majestic"]))
        .optional()
        .describe("Data sources — RECOMMENDED: [\"haloscan\", \"majestic\"] for complete SEO data. Haloscan=free (traffic+keywords), Majestic=10 credits (backlinks)"),
    },
    async ({ project_id, sources }) => {
      const res = await client.enrichProject(project_id, sources);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(res.data, null, 2) +
              "\n\nEnrichment started. Use get_job with the job_id to track progress." +
              "\n\nNEXT STEP (mandatory pattern): Once enrichment completes, ALL subsequent scrape_bulk and rewrite_bulk calls MUST pass has_data='any' (traffic OR backlinks, recommended) or has_data='haloscan' (traffic OR keywords only). This is non-optional — pages with no SEO data will never rank again, scraping them wastes credits.\n\nUse list_pages with sort='total_traffic' (desc) + has_data='any' to inspect the highest-value pages first.",
          },
        ],
      };
    }
  );

  // ── Rewriting ────────────────────────────────────────────────────────

  server.tool(
    "rewrite_page",
    "Rewrite a page. By default uses basic rewriting on a scraped page (1 credit). Add wisewand=true for premium SEO-optimized content (5 credits, 1 credit with your own Wisewand API key). WISEWAND MODE AUTO-FALLS-BACK to synthetic content (slug + ranked keywords) when the page has no scraped content — this covers (a) Haloscan-origin pages with no Wayback snapshot AND (b) Wayback pages where scrape FAILED or returned EMPTY. Basic mode still requires a scraped page. Returns a job_id.",
    {
      page_id: z.string().uuid().describe("Page UUID. Must be scraped first for basic mode. For Wisewand mode, Haloscan-origin pages (not scraped) are also accepted."),
      wisewand: z.boolean().optional().describe("Use Wisewand for premium SEO-optimized rewrite (5 credits, 1 with own key). REQUIRED for Haloscan-origin pages."),
      instructions: z
        .string()
        .optional()
        .describe("Custom rewrite instructions (basic mode only)"),
      subject: z.string().optional().describe("Custom subject / main keyword (Wisewand mode). Overrides AI extraction. For Haloscan-origin pages, skips the OpenAI prep call."),
      article_params: z
        .record(z.string(), z.unknown())
        .optional()
        .describe("Additional Wisewand parameters (type, lang, country, target_keyword, keywords_secondary, additional_information, etc.). For Haloscan pages these fill in after the AI prep."),
      wisewand_api_key: z
        .string()
        .optional()
        .describe("Your own Wisewand API key (implies wisewand=true, reduces cost to 1 credit)"),
    },
    async ({ page_id, wisewand, instructions, subject, article_params, wisewand_api_key }) => {
      const useWisewand = wisewand || !!wisewand_api_key;

      if (useWisewand) {
        const res = await client.rewriteWisewand(page_id, subject, article_params, wisewand_api_key);
        const sourceNote = (res.data as { source?: string } | undefined)?.source === 'haloscan'
          ? "\n\nSOURCE: Haloscan-origin page (no Wayback snapshot). Synthetic content was built from slug + ranked keywords before submission."
          : "";
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(res.data, null, 2) +
                sourceNote +
                "\n\nWisewand rewrite started. This takes 2-4 hours. Use get_job with the job_id to track progress." +
                "\n\nNEXT STEP: Once rewritten, generate a featured image with generate_image — pages without images look incomplete on WordPress.",
            },
          ],
        };
      }

      const res = await client.rewritePage(page_id, instructions);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(res.data, null, 2) +
              "\n\nRewrite started. Use get_job with the job_id to check when it completes." +
              "\n\nNEXT STEP: Once rewritten, generate a featured image with generate_image — pages without images look incomplete on WordPress.",
          },
        ],
      };
    }
  );

  server.tool(
    "rewrite_bulk",
    `Rewrite multiple pages in one job. Basic mode (1 credit/page) covers SCRAPED pages only. Wisewand mode (wisewand=true, 5 credits/page or 1 with own key) covers scraped pages + Haloscan-origin + scrape-FAILED/EMPTY pages (automatic synthetic-content fallback from slug + keywords). Max 50 pages per batch. Returns a job_id. Response breakdown: haloscan_count + wayback_count + scrape_failed_count.

🔴 ABSOLUTE RULE: Only rewrite pages that had SEO value before. Always pre-filter with list_pages(has_data='any') (traffic OR backlinks) or has_data='haloscan' (traffic OR keywords) and pass those page_ids here. Rewriting zero-value pages is a credit waste — they will never rank again.

🚨 USER-DECISION RULE for Haloscan-only / scrape-failed / empty pages: these pages cannot be rewritten in basic mode. The ONLY option is Wisewand (5 credits/page shared, 1 with own key, 2-4 HOURS duration). DO NOT auto-include them — surface the count + total credit cost + duration to the user FIRST and ask whether to (a) include them via Wisewand or (b) skip. Find them with list_pages(status='haloscan' OR status='failed' OR status='empty', has_data='any').

TIP: to queue a Wisewand rewrite of every eligible page in a project (after user approval), call list_pages with status='rewritable_wisewand' AND has_data='any' first — that combination keeps the SEO-valuable pages and includes Haloscan-only + scrape-failed ones so no high-traffic page is left behind.`,
    {
      page_ids: z
        .array(z.string().uuid())
        .min(1)
        .max(50)
        .describe("Array of page UUIDs to rewrite. In basic mode, pages must be scraped. In Wisewand mode, scraped AND Haloscan-origin pages are both accepted."),
      wisewand: z.boolean().optional().describe("Use Wisewand for premium SEO-optimized rewrite (5 credits/page, 1 with own key). REQUIRED to include Haloscan-origin pages."),
      wisewand_api_key: z
        .string()
        .optional()
        .describe("Your own Wisewand API key (implies wisewand=true, reduces cost to 1 credit/page)"),
      article_params: z
        .record(z.string(), z.unknown())
        .optional()
        .describe("Default Wisewand parameters applied to every page (type, lang, country, etc.). For Haloscan-origin pages, per-page AI prep fills in missing fields like additional_information/target_keyword."),
    },
    async ({ page_ids, wisewand, wisewand_api_key, article_params }) => {
      const useWisewand = wisewand || !!wisewand_api_key;
      const res = await client.rewriteBulk(
        page_ids,
        useWisewand ? 'wisewand' : undefined,
        wisewand_api_key,
        useWisewand ? article_params : undefined,
      );
      const data = res.data as { haloscan_count?: number; wayback_count?: number } | undefined;
      const breakdown = data && data.haloscan_count != null && data.haloscan_count > 0
        ? `\n\nBreakdown: ${data.wayback_count ?? 0} Wayback + ${data.haloscan_count} Haloscan-origin pages queued.`
        : "";
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(res.data, null, 2) +
              breakdown +
              "\n\nBulk rewrite started. Use get_job with the job_id to track progress." +
              "\n\nNEXT STEP: Once rewritten, generate featured images with generate_image_bulk — pages without images look incomplete on WordPress.",
          },
        ],
      };
    }
  );

  // ── Image Generation ─────────────────────────────────────────────────

  server.tool(
    "generate_image",
    "Generate an AI featured image for a page. Costs 1 credit. The page must be rewritten first. Returns a job_id. IMPORTANT: Always generate a featured image after rewriting — a page without an image looks incomplete and unprofessional when published on WordPress.",
    {
      page_id: z.string().uuid().describe("Page UUID (must be rewritten first)"),
    },
    async ({ page_id }) => {
      const res = await client.generateImage(page_id);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(res.data, null, 2) +
              "\n\nImage generation started. Use get_job with the job_id to check when it completes." +
              "\n\nNEXT STEP: Once the image is generated, the page is ready to publish on WordPress with wordpress_publish.",
          },
        ],
      };
    }
  );

  server.tool(
    "generate_image_bulk",
    "Generate AI featured images for multiple pages. Costs 1 credit per page. Max 50 pages. Returns a job_id. IMPORTANT: Always generate images after rewriting — pages without featured images look incomplete on WordPress.",
    {
      page_ids: z
        .array(z.string().uuid())
        .min(1)
        .max(50)
        .describe("Array of page UUIDs (must be rewritten first)"),
    },
    async ({ page_ids }) => {
      const res = await client.generateImageBulk(page_ids);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(res.data, null, 2) +
              "\n\nBulk image generation started. Use get_job with the job_id to track progress." +
              "\n\nNEXT STEP: Once images are generated, the pages are ready to publish on WordPress with wordpress_publish_bulk.",
          },
        ],
      };
    }
  );

  // ── Categorization ───────────────────────────────────────────────────

  server.tool(
    "categorize_pages",
    "AI-suggest WordPress categories for 1–50 pages based on their content. Free. Saves the assigned category to each page in the database. PREREQUISITE: Configure the category-to-author mapping with wordpress_set_mapping BEFORE categorizing. To categorize a full project: use list_pages with status='scraped' or status='rewritten' to get page IDs, then call this tool in batches of 50.",
    {
      page_ids: z.array(z.string().uuid()).min(1).max(50).describe("Page UUIDs (1 to 50)"),
      wordpress_domain: z.string().describe("WordPress domain (e.g. example.com)"),
    },
    async ({ page_ids, wordpress_domain }) => {
      const res = await client.categorizePages(page_ids, wordpress_domain);
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  // ── WordPress ────────────────────────────────────────────────────────

  server.tool(
    "wordpress_plugin_check",
    "Check if the Web Resurrect Connector plugin is installed on a WordPress site. Also returns categories and authors if connected.",
    {
      domain: z.string().describe("WordPress domain to check (e.g. example.com)"),
    },
    async ({ domain }) => {
      const res = await client.wordpressPluginCheck(domain);
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  server.tool(
    "wordpress_configure",
    "Configure WordPress connection. Two modes: Plugin (recommended, set mode='plugin') or Basic Auth (provide username + app_password).",
    {
      site_url: z.string().describe("WordPress site URL (e.g. https://example.com)"),
      mode: z
        .enum(["plugin"])
        .optional()
        .describe("Set to 'plugin' for plugin mode. Omit for Basic Auth."),
      username: z.string().optional().describe("WordPress username (Basic Auth only)"),
      app_password: z
        .string()
        .optional()
        .describe("WordPress application password (Basic Auth only)"),
      post_as_draft: z
        .boolean()
        .optional()
        .describe("Publish as draft by default (default: true)"),
    },
    async ({ site_url, mode, username, app_password, post_as_draft }) => {
      const res = await client.wordpressConfigure({
        site_url,
        mode,
        username,
        app_password,
        post_as_draft,
      });
      return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
    }
  );

  server.tool(
    "wordpress_validate",
    "Validate an existing WordPress connection. Tests that the credentials work and the site is reachable.",
    {
      domain: z.string().describe("WordPress domain to validate (e.g. example.com)"),
    },
    async ({ domain }) => {
      const res = await client.wordpressValidate(domain);
      return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
    }
  );

  server.tool(
    "wordpress_get_mapping",
    "Get the current category-to-author mapping for a WordPress domain. This mapping determines which author is automatically assigned when publishing a page with a given category.",
    {
      domain: z.string().describe("WordPress domain (e.g. example.com)"),
    },
    async ({ domain }) => {
      const res = await client.wordpressGetMapping(domain);
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  server.tool(
    "wordpress_set_mapping",
    `Configure the category-to-author mapping for a WordPress domain. IMPORTANT: This must be done BEFORE categorizing or publishing pages.

The mapping tells the system which author to assign for each category when publishing. Example: if category "Mode" (ID 5) should be authored by "Élise" (ID 3), set mappings: [{ category_id: 5, author_id: 3 }].

Workflow:
1. wordpress_categories — list available categories
2. wordpress_authors — list available authors
3. wordpress_set_mapping — configure which author writes for which category
4. categorize_pages — AI-categorize pages (saves category to each page)
5. wordpress_publish or wordpress_publish_bulk — author is auto-resolved from mapping`,
    {
      domain: z.string().describe("WordPress domain (e.g. example.com)"),
      mappings: z
        .array(z.object({
          category_id: z.number().int().describe("WordPress category ID"),
          author_id: z.number().int().describe("WordPress author ID"),
        }))
        .describe("Array of category-to-author mappings"),
      default_author_id: z
        .number()
        .int()
        .optional()
        .describe("Default author ID when no mapping matches"),
      default_category_id: z
        .number()
        .int()
        .optional()
        .describe("Default category ID when page has no category assigned"),
    },
    async ({ domain, mappings, default_author_id, default_category_id }) => {
      const res = await client.wordpressSetMapping(domain, mappings, default_author_id, default_category_id);
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  server.tool(
    "wordpress_categories",
    "List WordPress categories for a configured domain",
    {
      domain: z.string().describe("WordPress domain (e.g. example.com)"),
    },
    async ({ domain }) => {
      const res = await client.wordpressCategories(domain);
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  server.tool(
    "wordpress_authors",
    "List WordPress authors for a configured domain",
    {
      domain: z.string().describe("WordPress domain (e.g. example.com)"),
    },
    async ({ domain }) => {
      const res = await client.wordpressAuthors(domain);
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  server.tool(
    "wordpress_publish",
    "Publish a page to WordPress. Async operation, returns a job_id. Free (no credit cost). When using the Web Resurrect plugin, the original URL is preserved (e.g. /chaussures/basket-rouge.html serves the post directly at that URL, no redirect). URL mappings are pushed automatically.",
    {
      page_id: z.string().uuid().describe("Page UUID to publish"),
      wordpress_domain: z.string().describe("Target WordPress domain"),
      category_id: z.number().int().optional().describe("WordPress category ID"),
      author_id: z.number().int().optional().describe("WordPress author ID"),
      post_type: z.enum(["post", "page"]).optional().describe("WordPress post type (default: post)"),
      status: z.enum(["draft", "publish"]).optional().describe("Publish status (default: draft)"),
      use_rewritten_content: z
        .boolean()
        .optional()
        .describe("Use rewritten content if available (default: true)"),
      remove_links: z.boolean().optional().describe("Remove links from content (default: false)"),
    },
    async (args) => {
      const res = await client.wordpressPublish(args);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(res.data, null, 2) +
              "\n\nPublishing started. Use get_job with the job_id to check when it completes.",
          },
        ],
      };
    }
  );

  server.tool(
    "wordpress_publish_bulk",
    "Publish multiple pages to WordPress at once. Returns a job_id. Free. Supports both plugin mode and Basic Auth mode. In plugin mode, original URLs are preserved and URL mappings are pushed automatically.",
    {
      page_ids: z
        .array(z.string().uuid())
        .min(1)
        .describe("Array of page UUIDs to publish"),
      wordpress_domain: z.string().describe("Target WordPress domain"),
      category_id: z.number().int().optional().describe("WordPress category ID"),
      author_id: z.number().int().optional().describe("WordPress author ID"),
      post_type: z.enum(["post", "page"]).optional().describe("WordPress post type (default: post)"),
      status: z.enum(["draft", "publish"]).optional().describe("Publish status (default: draft)"),
      use_rewritten_content: z
        .boolean()
        .optional()
        .describe("Use rewritten content if available (default: true)"),
      remove_links: z.boolean().optional().describe("Remove links from content (default: false)"),
    },
    async (args) => {
      const res = await client.wordpressPublishBulk(args);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(res.data, null, 2) +
              "\n\nBulk publishing started. Use get_job with the job_id to track progress.",
          },
        ],
      };
    }
  );

  // ── Redirects ──────────────────────────────────────────────────────────

  server.tool(
    "export_redirects",
    "Export URL mappings (old URLs → new WordPress URLs) for all published pages. In plugin mode, URL mappings are pushed automatically during publish (posts are served at original URLs). This tool is only needed for Basic Auth mode to generate import files for the Redirection plugin (John Godley) or Rank Math. IMPORTANT: Save the output to a file on the user's computer.",
    {
      project_id: z.string().uuid().describe("Project UUID"),
      format: z
        .enum(["redirection", "rankmath"])
        .optional()
        .describe("Export format: 'redirection' (John Godley plugin JSON, default) or 'rankmath' (Rank Math import format)"),
    },
    async ({ project_id, format }) => {
      const res = await client.exportRedirects(project_id, format || "redirection");
      const data = res.data as Record<string, unknown>;
      const fmt = format || "redirection";

      // For Redirection plugin: return just the importable JSON
      let importContent: string;
      if (fmt === "redirection") {
        importContent = JSON.stringify(
          { redirects: data.redirects, groups: data.groups },
          null,
          2
        );
      } else {
        importContent = JSON.stringify(data.redirects, null, 2);
      }

      return {
        content: [
          {
            type: "text" as const,
            text:
              `${data.count} redirects generated (${fmt} format).\n\n` +
              `SAVE THIS TO A FILE on the user's computer (e.g. redirects-${fmt}.json):\n\n` +
              importContent +
              `\n\nIMPORT INSTRUCTIONS:\n` +
              (fmt === "redirection"
                ? "WordPress → Redirection plugin → Tools → Import → upload the JSON file"
                : "WordPress → Rank Math → Redirections → Import/Export → Import the JSON file"),
          },
        ],
      };
    }
  );

  server.tool(
    "push_redirects",
    `Push URL redirects to the WordPress plugin. Requires the Web Resurrect plugin (not Basic Auth). Two modes:

1. WITHOUT urls parameter: pushes ALL project pages at once. Published pages are served at their original URLs. Non-published pages get a 301 redirect (to homepage by default, or to redirect_to if specified). WARNING: This replaces all existing redirects in the plugin. Make sure pages like /contact, /mentions-legales, /politique-de-confidentialite etc. are excluded from the project or already published before running this, otherwise they will be redirected to the homepage too.

2. WITH urls parameter: only redirects the specified URLs (added individually, does NOT replace existing redirects). Useful to selectively redirect specific old URLs.

Call this after publishing to ensure all old URLs are properly handled.`,
    {
      project_id: z.string().uuid().describe("Project UUID"),
      wordpress_domain: z.string().describe("Target WordPress domain"),
      urls: z
        .array(z.string())
        .optional()
        .describe("Specific URLs or paths to redirect (e.g. [\"/old-page.html\", \"/category/sub/\"]). If omitted, all non-published pages are redirected."),
      redirect_to: z
        .string()
        .optional()
        .describe("Custom redirect target URL (default: homepage). Example: \"https://example.com/new-landing/\""),
    },
    async ({ project_id, wordpress_domain, urls, redirect_to }) => {
      const res = await client.pushRedirects(project_id, wordpress_domain, urls, redirect_to);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(res.data, null, 2),
          },
        ],
      };
    }
  );

  // ── Jobs ─────────────────────────────────────────────────────────────

  server.tool(
    "get_job",
    "Get the status, progress, result, and credit usage of an async job",
    {
      job_id: z.string().uuid().describe("Job UUID"),
    },
    async ({ job_id }) => {
      const res = await client.getJob(job_id);
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  server.tool(
    "list_jobs",
    "List recent jobs with optional status and type filters",
    {
      status: z
        .enum(["pending", "processing", "completed", "failed"])
        .optional()
        .describe("Filter by job status"),
      type: z
        .string()
        .optional()
        .describe("Filter by job type (scrape, rewrite, publish, enrich, etc.)"),
      page: z.number().int().positive().optional().describe("Page number (default 1)"),
      limit: z.number().int().min(1).max(100).optional().describe("Items per page (default 20)"),
    },
    async ({ status, type, page, limit }) => {
      const res = await client.listJobs({ status, type, page, limit });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ data: res.data, pagination: res.pagination }, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "cancel_job",
    "Cancel a pending or processing job. Credits reserved but not yet used will be refunded.",
    {
      job_id: z.string().uuid().describe("Job UUID to cancel"),
    },
    async ({ job_id }) => {
      const res = await client.cancelJob(job_id);
      return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
    }
  );

  server.tool(
    "wait_for_job",
    `Block until an async job reaches a terminal state (completed / failed / cancelled), polling server-side so you do not have to loop get_job yourself. USE THIS AFTER EVERY ASYNC CALL — it is the single most important tool for autonomous operation.

Typical durations:
- URL fetching (create_project): 10-60s
- Haloscan/Majestic enrichment: 30-180s
- Scrape single page: 10-30s
- Scrape bulk (50 pages): 2-5 min
- Basic rewrite: 10-30s
- Wisewand rewrite: 2-4 HOURS (use a long timeout or poll get_job periodically)
- Image generation: 20-60s
- WordPress publish bulk: 1-3 min

If the job is still running when timeout_seconds elapses, the tool returns the current progress with timed_out=true — call wait_for_job again or switch to get_job polling for very long Wisewand jobs.`,
    {
      job_id: z.string().uuid().describe("Job UUID to wait for"),
      timeout_seconds: z
        .number()
        .int()
        .min(10)
        .max(3600)
        .optional()
        .describe("Max time to wait before returning current progress (default 300 = 5 min, max 3600 = 1 hour). For Wisewand bulk rewrites (2-4h), leave at default and re-call until done."),
      poll_interval_seconds: z
        .number()
        .int()
        .min(1)
        .max(60)
        .optional()
        .describe("Poll interval (default 5). Use larger values for long jobs to reduce API load."),
    },
    async ({ job_id, timeout_seconds, poll_interval_seconds }) => {
      const res = await client.waitForJob(job_id, {
        timeoutSeconds: timeout_seconds,
        pollIntervalSeconds: poll_interval_seconds,
      });
      const timedOut = (res as { timed_out?: boolean }).timed_out;
      const note = timedOut
        ? "\n\nTIMED OUT: job still running. Call wait_for_job again or get_job to keep tracking."
        : res.data?.status === "completed"
          ? "\n\nJob completed successfully."
          : res.data?.status === "failed"
            ? "\n\nJob failed — inspect the error field."
            : res.data?.status === "cancelled"
              ? "\n\nJob cancelled."
              : "";
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(res.data, null, 2) + note,
          },
        ],
      };
    }
  );

  server.tool(
    "get_project_overview",
    "Single-call pipeline status for a project: counts for pending / scraped / scrape_failed / scrape_empty / rewritten / wisewand_pending / wisewand_completed / wisewand_failed / published pages, plus SEO totals (traffic, keywords, backlinks) and scrape/rewrite/publish progress percentages. Use this at any decision point to know what stage the project is at without making multiple list_pages calls.",
    {
      project_id: z.string().uuid().describe("Project UUID"),
    },
    async ({ project_id }) => {
      const res = await client.getProjectStats(project_id);
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );
}
