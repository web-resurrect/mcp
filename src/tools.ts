/**
 * MCP tool definitions and handlers for the Web Resurrect API.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { WebResurrectClient } from "./client.js";

type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: true;
};

/**
 * Wrap a tool handler so thrown errors become structured `isError: true` responses
 * instead of crashing the MCP transport. The optional hint gives Claude a next step
 * to recover from the error.
 */
function withErrors<A>(
  handler: (args: A) => Promise<ToolResult>,
  hint?: string
): (args: A) => Promise<ToolResult> {
  return async (args) => {
    try {
      return await handler(args);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: hint ? `${msg}\n\nHint: ${hint}` : msg,
          },
        ],
      };
    }
  };
}

const json = (value: unknown): ToolResult => ({
  content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
});

export function registerTools(server: McpServer, client: WebResurrectClient): void {
  // ── Credits ──────────────────────────────────────────────────────────

  server.tool(
    "get_credits",
    "Return the current credit balance, account email, and member-since date.",
    {},
    { title: "Get credits", readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    withErrors(async () => {
      const res = await client.getCredits();
      return json(res.data);
    })
  );

  // ── Projects ─────────────────────────────────────────────────────────

  server.tool(
    "create_project",
    "Create a project for an expired domain. Starts an async URL-fetch job from the Wayback Machine and returns a job_id.",
    {
      domain: z.string().describe("Expired domain to analyze (e.g. example.fr)"),
      name: z.string().optional().describe("Project name (defaults to domain)"),
    },
    { title: "Create project", openWorldHint: true },
    withErrors(async ({ domain, name }) => {
      const res = await client.createProject(domain, name);
      return json(res.data);
    })
  );

  server.tool(
    "list_projects",
    "List projects with their page counts and pagination.",
    {
      page: z.number().int().positive().optional().describe("Page number (default 1)"),
      limit: z.number().int().min(1).max(100).optional().describe("Items per page (default 20, max 100)"),
    },
    { title: "List projects", readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    withErrors(async ({ page, limit }) => {
      const res = await client.listProjects(page, limit);
      return json({ data: res.data, pagination: res.pagination });
    })
  );

  server.tool(
    "get_project",
    "Get project details including page-count stats and scrape/rewrite/publish progress.",
    {
      project_id: z.string().uuid().describe("Project UUID"),
    },
    { title: "Get project", readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    withErrors(async ({ project_id }) => {
      const res = await client.getProject(project_id);
      return json(res.data);
    })
  );

  server.tool(
    "delete_project",
    "Delete a project and cascade-delete all its pages. Irreversible.",
    {
      project_id: z.string().uuid().describe("Project UUID"),
    },
    { title: "Delete project", destructiveHint: true, openWorldHint: true },
    withErrors(
      async ({ project_id }) => {
        const res = await client.deleteProject(project_id);
        return json(res);
      },
      "Confirm the project_id with list_projects before retrying."
    )
  );

  // ── Pages ────────────────────────────────────────────────────────────

  server.tool(
    "list_pages",
    "List pages of a project with filters, search, sort, and pagination. Each page carries a `source` field: 'wayback' (scrapeable from the archive) or 'haloscan' (no Wayback snapshot, Wisewand-rewrite only). Does not include the rewritten body — use get_page_content for that.",
    {
      project_id: z.string().uuid().describe("Project UUID"),
      status: z
        .enum(["pending", "scraped", "empty", "failed", "rewritten", "published", "haloscan", "rewritable_wisewand"])
        .optional()
        .describe("Filter by page status. 'empty' = scraped but no content on Wayback. 'failed' = scrape error. 'haloscan' = Haloscan-origin pages with no Wayback snapshot. 'rewritable_wisewand' = every page eligible for Wisewand rewrite (scraped + Haloscan-origin + scrape-failed + empty)."),
      source: z
        .enum(["wayback", "haloscan", "semrush"])
        .optional()
        .describe("Filter by page origin. 'wayback' = discovered via the Wayback Machine CDX API. 'haloscan' = discovered via Haloscan with no Wayback snapshot."),
      has_data: z
        .enum(["haloscan", "majestic", "any"])
        .optional()
        .describe("Keep only pages with SEO data: haloscan (traffic>0 OR keywords), majestic (backlinks>0), any (either)."),
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
        .describe("Exclude legal/info pages (contact, mentions-legales, CGV, CGU, privacy, a-propos, about, sitemap). These are kept in the DB with excluded_from_redirects=true so they remain reachable on the target site."),
    },
    { title: "List pages", readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    withErrors(async ({ project_id, status, source, has_data, search, sort, order, page, limit, exclude_system }) => {
      const res = await client.listPages(project_id, { status, source, has_data, search, sort, order, page, limit, exclude_system });
      return json({ data: res.data, pagination: res.pagination });
    })
  );

  server.tool(
    "get_page",
    "Get full page details: scrape status, rewrite status, SEO data (traffic, keywords, backlinks), WordPress publish status, and featured image URL.",
    {
      page_id: z.string().uuid().describe("Page UUID"),
    },
    { title: "Get page", readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    withErrors(
      async ({ page_id }) => {
        const res = await client.getPage(page_id);
        return json(res.data);
      },
      "Use list_pages to find valid page IDs."
    )
  );

  server.tool(
    "update_page",
    "Update a page's WordPress category, author, or post link. Use to (a) override the auto-assigned category/author or (b) attach a manually-created WordPress post via wordpress_post_id so redirect export can map it. Set any field to null to clear.",
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
        .describe("Manually link this page to an existing WordPress post ID. Sets posted_to_wordpress=true. Null to clear."),
      wordpress_post_url: z
        .string()
        .nullable()
        .optional()
        .describe("WordPress post URL (paired with wordpress_post_id). Null to clear."),
    },
    { title: "Update page", idempotentHint: true, openWorldHint: true },
    withErrors(async ({ page_id, category_id, category_name, author_id, wordpress_post_id, wordpress_post_url }) => {
      const updates: Record<string, unknown> = {};
      if (category_id !== undefined) updates.category_id = category_id;
      if (category_name !== undefined) updates.category_name = category_name;
      if (author_id !== undefined) updates.author_id = author_id;
      if (wordpress_post_id !== undefined) updates.wordpress_post_id = wordpress_post_id;
      if (wordpress_post_url !== undefined) updates.wordpress_post_url = wordpress_post_url;
      const res = await client.updatePage(page_id, updates);
      return json(res.data);
    })
  );

  server.tool(
    "get_page_content",
    "Fetch the rewritten content (title + HTML + meta) for a page. Returns source='wisewand' or 'openai'. Page must be in status='rewritten'.",
    {
      page_id: z.string().uuid().describe("Page UUID (must be rewritten)"),
    },
    { title: "Get page content", readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    withErrors(
      async ({ page_id }) => {
        const res = await client.getPageRewritten(page_id);
        return json(res.data);
      },
      "If the page is not yet rewritten, call rewrite_page or rewrite_bulk first."
    )
  );

  // ── Scraping ─────────────────────────────────────────────────────────

  server.tool(
    "scrape_page",
    "Scrape a single page from the Wayback Machine archive. Costs 1 credit. Async — returns a job_id. Pages with status='haloscan' have no Wayback snapshot and cannot be scraped (use rewrite_page with wisewand=true instead).",
    {
      page_id: z.string().uuid().describe("Page UUID to scrape"),
      content_type: z
        .enum(["article", "product", "productList", "jina"])
        .optional()
        .describe("Content extraction type (default: article)"),
    },
    { title: "Scrape page", openWorldHint: true },
    withErrors(async ({ page_id, content_type }) => {
      const res = await client.scrapePage(page_id, content_type);
      return json(res.data);
    })
  );

  server.tool(
    "scrape_bulk",
    "Scrape multiple pages in one async job. Costs 1 credit per page. Max 100 pages. Returns a job_id. Pass either page_ids directly, or pass project_id to auto-select pending pages (filtered by has_data and excluding system pages by default). Haloscan-origin pages are skipped automatically (no Wayback snapshot).",
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
        .describe("Filter auto-selected pages by SEO data. Requires project_id. haloscan=traffic>0 OR keywords, majestic=backlinks>0, any=either. Pages with zero SEO data will not rank again — filtering avoids wasting credits."),
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
        .describe("Skip legal/info pages (contact, mentions-legales, CGV, privacy, a-propos, ...) when auto-selecting via project_id. Default true."),
    },
    { title: "Scrape pages (bulk)", openWorldHint: true },
    withErrors(async ({ page_ids, project_id, has_data, limit, content_type, exclude_system }) => {
      let ids = page_ids;
      if (!ids) {
        if (!project_id) {
          return {
            isError: true,
            content: [{ type: "text" as const, text: "Provide either page_ids or project_id." }],
          };
        }
        const pages = await client.listPages(project_id, {
          status: "pending",
          has_data,
          limit: limit ?? 50,
          exclude_system: exclude_system !== false,
        });
        ids = (pages.data ?? []).map((p: { id: string }) => p.id);
        if (ids.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: "No matching pending pages found" + (has_data ? ` with ${has_data} data` : "") + ".",
              },
            ],
          };
        }
      }
      const res = await client.scrapeBulk(ids, content_type);
      return json(res.data);
    })
  );

  // ── SEO Enrichment ───────────────────────────────────────────────────

  server.tool(
    "enrich_project",
    "Enrich a project with SEO data from Haloscan (free; traffic + keyword rankings) and/or Majestic (10 credits flat; backlinks). Async — returns a job_id. Sources can be combined to get both datasets in a single job.",
    {
      project_id: z.string().uuid().describe("Project UUID"),
      sources: z
        .array(z.enum(["haloscan", "majestic"]))
        .optional()
        .describe('Data sources. Defaults to ["haloscan"]. ["haloscan","majestic"] gives the full SEO picture (traffic + keywords + backlinks).'),
    },
    { title: "Enrich project (SEO)", openWorldHint: true },
    withErrors(async ({ project_id, sources }) => {
      const res = await client.enrichProject(project_id, sources);
      return json(res.data);
    })
  );

  // ── Rewriting ────────────────────────────────────────────────────────

  server.tool(
    "rewrite_page",
    "Rewrite a single page. Basic mode (default, 1 credit) requires a scraped page. Wisewand mode (wisewand=true, 5 credits or 1 with own key, 2-4 hours) handles scraped pages AND auto-falls-back to synthetic content (slug + ranked keywords) when the page has no scraped content — covers Haloscan-origin and scrape-failed pages. Async — returns a job_id.",
    {
      page_id: z.string().uuid().describe("Page UUID. Must be scraped for basic mode. Wisewand mode also accepts Haloscan-origin pages."),
      wisewand: z.boolean().optional().describe("Use Wisewand for premium SEO-optimized rewrite (5 credits, 1 with own key). Required for Haloscan-origin pages."),
      instructions: z
        .string()
        .optional()
        .describe("Custom rewrite instructions (basic mode only)"),
      subject: z.string().optional().describe("Custom subject / main keyword (Wisewand mode). Overrides AI extraction. For Haloscan-origin pages, skips the AI prep call."),
      article_params: z
        .record(z.string(), z.unknown())
        .optional()
        .describe("Additional Wisewand parameters (type, lang, country, target_keyword, keywords_secondary, additional_information, etc.). For Haloscan pages these fill in after the AI prep."),
      wisewand_api_key: z
        .string()
        .optional()
        .describe("Caller's own Wisewand API key (implies wisewand=true, reduces cost to 1 credit)"),
    },
    { title: "Rewrite page", openWorldHint: true },
    withErrors(async ({ page_id, wisewand, instructions, subject, article_params, wisewand_api_key }) => {
      const useWisewand = wisewand || !!wisewand_api_key;
      if (useWisewand) {
        const res = await client.rewriteWisewand(page_id, subject, article_params, wisewand_api_key);
        return json(res.data);
      }
      const res = await client.rewritePage(page_id, instructions);
      return json(res.data);
    })
  );

  server.tool(
    "rewrite_bulk",
    "Rewrite multiple pages in one async job. Basic mode (1 credit/page) covers SCRAPED pages only. Wisewand mode (wisewand=true, 5 credits/page or 1 with own key, 2-4 hours) covers scraped pages plus Haloscan-origin and scrape-failed/empty pages via synthetic-content fallback (slug + keywords). Max 50 pages per batch. Returns a job_id and a breakdown {wayback_count, haloscan_count, scrape_failed_count}.",
    {
      page_ids: z
        .array(z.string().uuid())
        .min(1)
        .max(50)
        .describe("Array of page UUIDs to rewrite. Basic mode requires scraped pages; Wisewand mode also accepts Haloscan-origin pages."),
      wisewand: z.boolean().optional().describe("Use Wisewand for premium SEO-optimized rewrite (5 credits/page, 1 with own key). Required to include Haloscan-origin pages."),
      wisewand_api_key: z
        .string()
        .optional()
        .describe("Caller's own Wisewand API key (implies wisewand=true, reduces cost to 1 credit/page)"),
      article_params: z
        .record(z.string(), z.unknown())
        .optional()
        .describe("Default Wisewand parameters applied to every page (type, lang, country, etc.). For Haloscan-origin pages, per-page AI prep fills in missing fields."),
    },
    { title: "Rewrite pages (bulk)", openWorldHint: true },
    withErrors(async ({ page_ids, wisewand, wisewand_api_key, article_params }) => {
      const useWisewand = wisewand || !!wisewand_api_key;
      const res = await client.rewriteBulk(
        page_ids,
        useWisewand ? "wisewand" : undefined,
        wisewand_api_key,
        useWisewand ? article_params : undefined,
      );
      return json(res.data);
    })
  );

  // ── Image Generation ─────────────────────────────────────────────────

  server.tool(
    "generate_image",
    "Generate an AI featured image for a page. Costs 1 credit. The page must be rewritten first. Async — returns a job_id.",
    {
      page_id: z.string().uuid().describe("Page UUID (must be rewritten first)"),
    },
    { title: "Generate featured image", openWorldHint: true },
    withErrors(
      async ({ page_id }) => {
        const res = await client.generateImage(page_id);
        return json(res.data);
      },
      "Page must be in status='rewritten' before calling. Run rewrite_page first if needed."
    )
  );

  server.tool(
    "generate_image_bulk",
    "Generate AI featured images for multiple pages in one async job. 1 credit per page. Max 50 pages. Pages must be rewritten. Returns a job_id.",
    {
      page_ids: z
        .array(z.string().uuid())
        .min(1)
        .max(50)
        .describe("Array of page UUIDs (must be rewritten first)"),
    },
    { title: "Generate featured images (bulk)", openWorldHint: true },
    withErrors(async ({ page_ids }) => {
      const res = await client.generateImageBulk(page_ids);
      return json(res.data);
    })
  );

  // ── Categorization ───────────────────────────────────────────────────

  server.tool(
    "categorize_pages",
    "AI-suggest a WordPress category for 1-50 pages based on content. Free. Saves the assigned category on each page. Requires a category-author mapping (wordpress_set_mapping) to exist for the domain.",
    {
      page_ids: z.array(z.string().uuid()).min(1).max(50).describe("Page UUIDs (1 to 50)"),
      wordpress_domain: z.string().describe("WordPress domain (e.g. example.com)"),
    },
    { title: "Categorize pages", openWorldHint: true },
    withErrors(
      async ({ page_ids, wordpress_domain }) => {
        const res = await client.categorizePages(page_ids, wordpress_domain);
        return json(res.data);
      },
      "If categorization fails because no mapping exists, call wordpress_set_mapping first."
    )
  );

  // ── WordPress ────────────────────────────────────────────────────────

  server.tool(
    "wordpress_plugin_check",
    "Check whether the Web Resurrect Connector plugin is installed and active on a WordPress site. Returns categories and authors when connected.",
    {
      domain: z.string().describe("WordPress domain to check (e.g. example.com)"),
    },
    { title: "Check WordPress plugin", readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    withErrors(async ({ domain }) => {
      const res = await client.wordpressPluginCheck(domain);
      return json(res.data);
    })
  );

  server.tool(
    "wordpress_configure",
    "Configure a WordPress connection. Two modes: plugin mode (mode='plugin') uses the Web Resurrect Connector plugin; Basic Auth mode requires username + app_password.",
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
    { title: "Configure WordPress", idempotentHint: true, openWorldHint: true },
    withErrors(async ({ site_url, mode, username, app_password, post_as_draft }) => {
      const res = await client.wordpressConfigure({
        site_url,
        mode,
        username,
        app_password,
        post_as_draft,
      });
      return json(res);
    })
  );

  server.tool(
    "wordpress_validate",
    "Validate an existing WordPress connection: tests the credentials and confirms the site is reachable.",
    {
      domain: z.string().describe("WordPress domain to validate (e.g. example.com)"),
    },
    { title: "Validate WordPress", readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    withErrors(async ({ domain }) => {
      const res = await client.wordpressValidate(domain);
      return json(res);
    })
  );

  server.tool(
    "wordpress_get_mapping",
    "Get the current category-to-author mapping for a WordPress domain. The mapping determines which author is assigned when publishing a page in a given category.",
    {
      domain: z.string().describe("WordPress domain (e.g. example.com)"),
    },
    { title: "Get category-author mapping", readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    withErrors(async ({ domain }) => {
      const res = await client.wordpressGetMapping(domain);
      return json(res.data);
    })
  );

  server.tool(
    "wordpress_set_mapping",
    "Set the category-to-author mapping for a WordPress domain. Replaces any existing mapping. The mapping is consumed by categorize_pages and the publish tools to auto-resolve the author for each post.",
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
        .describe("Default category ID when a page has no category assigned"),
    },
    { title: "Set category-author mapping", idempotentHint: true, openWorldHint: true },
    withErrors(async ({ domain, mappings, default_author_id, default_category_id }) => {
      const res = await client.wordpressSetMapping(domain, mappings, default_author_id, default_category_id);
      return json(res.data);
    })
  );

  server.tool(
    "wordpress_categories",
    "List WordPress categories for a configured domain.",
    {
      domain: z.string().describe("WordPress domain (e.g. example.com)"),
    },
    { title: "List WordPress categories", readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    withErrors(async ({ domain }) => {
      const res = await client.wordpressCategories(domain);
      return json(res.data);
    })
  );

  server.tool(
    "wordpress_authors",
    "List WordPress authors for a configured domain.",
    {
      domain: z.string().describe("WordPress domain (e.g. example.com)"),
    },
    { title: "List WordPress authors", readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    withErrors(async ({ domain }) => {
      const res = await client.wordpressAuthors(domain);
      return json(res.data);
    })
  );

  server.tool(
    "wordpress_publish",
    "Publish a page to WordPress. Async — returns a job_id. Free (no credit cost). In plugin mode the original URL is preserved (no redirect) and the URL mapping is pushed automatically.",
    {
      page_id: z.string().uuid().describe("Page UUID to publish"),
      wordpress_domain: z.string().describe("Target WordPress domain"),
      category_id: z.number().int().optional().describe("WordPress category ID (overrides mapping)"),
      author_id: z.number().int().optional().describe("WordPress author ID (overrides mapping)"),
      post_type: z.enum(["post", "page"]).optional().describe("WordPress post type (default: post)"),
      status: z.enum(["draft", "publish"]).optional().describe("Publish status (default: draft)"),
      use_rewritten_content: z
        .boolean()
        .optional()
        .describe("Use rewritten content if available (default: true)"),
      remove_links: z.boolean().optional().describe("Remove links from content (default: false)"),
    },
    { title: "Publish to WordPress", openWorldHint: true },
    withErrors(async (args) => {
      const res = await client.wordpressPublish(args);
      return json(res.data);
    })
  );

  server.tool(
    "wordpress_publish_bulk",
    "Publish multiple pages to WordPress in one async job. Free. Supports plugin mode and Basic Auth mode. Plugin mode preserves original URLs and pushes URL mappings automatically. Returns a job_id.",
    {
      page_ids: z
        .array(z.string().uuid())
        .min(1)
        .describe("Array of page UUIDs to publish"),
      wordpress_domain: z.string().describe("Target WordPress domain"),
      category_id: z.number().int().optional().describe("WordPress category ID (overrides mapping)"),
      author_id: z.number().int().optional().describe("WordPress author ID (overrides mapping)"),
      post_type: z.enum(["post", "page"]).optional().describe("WordPress post type (default: post)"),
      status: z.enum(["draft", "publish"]).optional().describe("Publish status (default: draft)"),
      use_rewritten_content: z
        .boolean()
        .optional()
        .describe("Use rewritten content if available (default: true)"),
      remove_links: z.boolean().optional().describe("Remove links from content (default: false)"),
    },
    { title: "Publish to WordPress (bulk)", openWorldHint: true },
    withErrors(async (args) => {
      const res = await client.wordpressPublishBulk(args);
      return json(res.data);
    })
  );

  // ── Redirects ──────────────────────────────────────────────────────────

  server.tool(
    "export_redirects",
    "Export URL mappings (old URL → new WordPress URL) for all published pages. Two formats: 'redirection' (John Godley plugin JSON) or 'rankmath' (Rank Math import). In plugin mode this is unnecessary because URL mappings are pushed automatically during publish.",
    {
      project_id: z.string().uuid().describe("Project UUID"),
      format: z
        .enum(["redirection", "rankmath"])
        .optional()
        .describe("Export format: 'redirection' (default) or 'rankmath'."),
    },
    { title: "Export redirects", readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    withErrors(async ({ project_id, format }) => {
      const res = await client.exportRedirects(project_id, format || "redirection");
      const data = res.data as Record<string, unknown>;
      const fmt = format || "redirection";
      const importContent = fmt === "redirection"
        ? JSON.stringify({ redirects: data.redirects, groups: data.groups }, null, 2)
        : JSON.stringify(data.redirects, null, 2);
      const importInstructions = fmt === "redirection"
        ? "WordPress → Redirection plugin → Tools → Import → upload the JSON file"
        : "WordPress → Rank Math → Redirections → Import/Export → Import the JSON file";
      return {
        content: [
          {
            type: "text" as const,
            text:
              `${data.count} redirects generated (${fmt} format). Save this content to a file (e.g. redirects-${fmt}.json):\n\n` +
              importContent +
              `\n\nImport: ${importInstructions}`,
          },
        ],
      };
    })
  );

  server.tool(
    "push_redirects",
    "Push URL redirects to the Web Resurrect Connector plugin. Two modes: (a) without `urls`: replaces ALL existing redirects — published pages serve at their original URLs, non-published ones 301 to homepage (or `redirect_to`); (b) with `urls`: redirects only the specified paths and does NOT replace existing redirects.",
    {
      project_id: z.string().uuid().describe("Project UUID"),
      wordpress_domain: z.string().describe("Target WordPress domain"),
      urls: z
        .array(z.string())
        .optional()
        .describe('Specific URLs or paths to redirect (e.g. ["/old-page.html", "/category/sub/"]). Omit to redirect all non-published project pages.'),
      redirect_to: z
        .string()
        .optional()
        .describe('Custom redirect target URL (default: homepage). Example: "https://example.com/new-landing/"'),
    },
    { title: "Push redirects", destructiveHint: true, openWorldHint: true },
    withErrors(
      async ({ project_id, wordpress_domain, urls, redirect_to }) => {
        const res = await client.pushRedirects(project_id, wordpress_domain, urls, redirect_to);
        return json(res.data);
      },
      "Without `urls`, this replaces every redirect on the site. Pass `urls` to add selectively."
    )
  );

  // ── Jobs ─────────────────────────────────────────────────────────────

  server.tool(
    "get_job",
    "Get the status, progress, result, and credit usage of an async job.",
    {
      job_id: z.string().uuid().describe("Job UUID"),
    },
    { title: "Get job status", readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    withErrors(async ({ job_id }) => {
      const res = await client.getJob(job_id);
      return json(res.data);
    })
  );

  server.tool(
    "list_jobs",
    "List recent jobs with optional status and type filters.",
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
    { title: "List jobs", readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    withErrors(async ({ status, type, page, limit }) => {
      const res = await client.listJobs({ status, type, page, limit });
      return json({ data: res.data, pagination: res.pagination });
    })
  );

  server.tool(
    "cancel_job",
    "Cancel a pending or processing job. Reserved-but-unused credits are refunded.",
    {
      job_id: z.string().uuid().describe("Job UUID to cancel"),
    },
    { title: "Cancel job", destructiveHint: true, openWorldHint: true },
    withErrors(async ({ job_id }) => {
      const res = await client.cancelJob(job_id);
      return json(res);
    })
  );

  server.tool(
    "wait_for_job",
    `Block until an async job reaches a terminal state (completed / failed / cancelled), polling server-side. Useful after any tool that returns a job_id, in lieu of manually looping get_job. If the job is still running after timeout_seconds, returns the current progress with timed_out=true.

Typical durations:
- URL fetching (create_project): 10-60s
- Haloscan/Majestic enrichment: 30-180s
- Scrape single page: 10-30s
- Scrape bulk (50 pages): 2-5 min
- Basic rewrite: 10-30s
- Wisewand rewrite: 2-4 hours (use a long timeout or poll get_job periodically)
- Image generation: 20-60s
- WordPress publish bulk: 1-3 min`,
    {
      job_id: z.string().uuid().describe("Job UUID to wait for"),
      timeout_seconds: z
        .number()
        .int()
        .min(10)
        .max(3600)
        .optional()
        .describe("Max time to wait before returning current progress (default 300 = 5 min, max 3600 = 1 hour)."),
      poll_interval_seconds: z
        .number()
        .int()
        .min(1)
        .max(60)
        .optional()
        .describe("Poll interval (default 5). Larger values reduce API load on long jobs."),
    },
    { title: "Wait for job", readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    withErrors(async ({ job_id, timeout_seconds, poll_interval_seconds }) => {
      const res = await client.waitForJob(job_id, {
        timeoutSeconds: timeout_seconds,
        pollIntervalSeconds: poll_interval_seconds,
      });
      return json(res.data);
    })
  );

  server.tool(
    "get_project_overview",
    "Single-call pipeline status for a project: counts for pending / scraped / scrape_failed / scrape_empty / rewritten / wisewand_pending / wisewand_completed / wisewand_failed / published pages, plus SEO totals (traffic, keywords, backlinks) and scrape/rewrite/publish progress percentages.",
    {
      project_id: z.string().uuid().describe("Project UUID"),
    },
    { title: "Project pipeline overview", readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    withErrors(async ({ project_id }) => {
      const res = await client.getProjectStats(project_id);
      return json(res.data);
    })
  );
}
