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
    "List pages of a project with optional filters, search, sorting, and pagination. TIP: After enrichment, sort by total_traffic (desc) or backlinks_count (desc) to identify the most valuable pages to resurrect first.",
    {
      project_id: z.string().uuid().describe("Project UUID"),
      status: z
        .enum(["pending", "scraped", "rewritten", "published"])
        .optional()
        .describe("Filter by page status"),
      search: z.string().optional().describe("Search by URL or title"),
      sort: z
        .enum(["created_at", "total_traffic", "backlinks_count", "url", "title"])
        .optional()
        .describe("Sort field"),
      order: z.enum(["asc", "desc"]).optional().describe("Sort order (default desc)"),
      page: z.number().int().positive().optional().describe("Page number (default 1)"),
      limit: z.number().int().min(1).max(100).optional().describe("Items per page (default 50, max 100)"),
    },
    async ({ project_id, status, search, sort, order, page, limit }) => {
      const res = await client.listPages(project_id, { status, search, sort, order, page, limit });
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
              "\n\nNEXT STEP: Once scraped, rewrite the page with rewrite_wisewand (recommended) or rewrite_page (basic). Then generate a featured image with generate_image.",
          },
        ],
      };
    }
  );

  server.tool(
    "scrape_bulk",
    "Scrape multiple pages at once. Costs 1 credit per page. Max 100 pages. Returns a job_id. IMPORTANT: Scraping is the mandatory first step — pages must be scraped before rewriting or generating images.",
    {
      page_ids: z
        .array(z.string().uuid())
        .min(1)
        .max(100)
        .describe("Array of page UUIDs to scrape"),
      content_type: z
        .enum(["article", "product", "productList", "jina"])
        .optional()
        .describe("Content extraction type (default: article)"),
    },
    async ({ page_ids, content_type }) => {
      const res = await client.scrapeBulk(page_ids, content_type);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(res.data, null, 2) +
              "\n\nBulk scraping started. Use get_job with the job_id to track progress." +
              "\n\nNEXT STEP: Once scraped, rewrite the pages with rewrite_wisewand (recommended) or rewrite_bulk (basic). Then generate featured images with generate_image_bulk.",
          },
        ],
      };
    }
  );

  // ── SEO Enrichment ───────────────────────────────────────────────────

  server.tool(
    "enrich_project",
    "Enrich a project with SEO data. BEST PRACTICE: ALWAYS use both sources [\"haloscan\", \"majestic\"] together to get the full picture — Haloscan provides traffic estimates and keyword rankings (free), Majestic provides backlink profiles (10 credits). Having both datasets is essential to make informed decisions about which pages are worth resurrecting. Without Majestic, you miss backlink data which is critical for SEO value assessment.",
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
              "\n\nNEXT STEP: Once enrichment completes, use list_pages with sort='total_traffic' (desc) to identify the most valuable pages, then scrape them.",
          },
        ],
      };
    }
  );

  // ── Rewriting ────────────────────────────────────────────────────────

  server.tool(
    "rewrite_page",
    "Rewrite a scraped page with GPT (basic quality). Costs 1 credit. The page must be scraped first. Returns a job_id. NOTE: For higher quality, SEO-optimized content, prefer rewrite_wisewand instead — Wisewand produces significantly better results with proper structure, meta tags, and unique content. Use this basic GPT rewrite only as a budget fallback.",
    {
      page_id: z.string().uuid().describe("Page UUID (must be scraped first)"),
      instructions: z
        .string()
        .optional()
        .describe("Custom rewrite instructions (e.g. \"Rewrite in casual French for an educational blog\")"),
    },
    async ({ page_id, instructions }) => {
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
    "rewrite_wisewand",
    "RECOMMENDED: Rewrite a page with Wisewand (premium quality). Produces SEO-optimized, well-structured, unique content with proper headings, meta title, and meta description. Far superior to basic GPT rewrite. Costs 10 credits (only 1 credit with your own Wisewand API key — pass it via wisewand_api_key or save it in account settings). Takes 2-4 hours. Returns a job_id. ALWAYS prefer this over rewrite_page for best results.",
    {
      page_id: z.string().uuid().describe("Page UUID (must be scraped first)"),
      subject: z.string().optional().describe("Custom subject (defaults to page title)"),
      article_params: z
        .record(z.string(), z.unknown())
        .optional()
        .describe("Additional Wisewand parameters (type, lang, country, etc.)"),
      wisewand_api_key: z
        .string()
        .optional()
        .describe("Your own Wisewand API key (reduces cost to 1 credit). If not provided, uses key saved in account or shared key (10 credits)."),
    },
    async ({ page_id, subject, article_params, wisewand_api_key }) => {
      const res = await client.rewriteWisewand(page_id, subject, article_params, wisewand_api_key);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(res.data, null, 2) +
              "\n\nWisewand rewrite started. This takes 2-4 hours. Use get_job with the job_id to track progress." +
              "\n\nNEXT STEP: Once rewritten, generate a featured image with generate_image — pages without images look incomplete on WordPress.",
          },
        ],
      };
    }
  );

  server.tool(
    "rewrite_bulk",
    "Rewrite multiple scraped pages with GPT (basic quality). Costs 1 credit per page. Max 50 pages. Returns a job_id. NOTE: For higher quality results, prefer using rewrite_wisewand on each page individually — Wisewand produces significantly better SEO-optimized content.",
    {
      page_ids: z
        .array(z.string().uuid())
        .min(1)
        .max(50)
        .describe("Array of page UUIDs to rewrite (must be scraped first)"),
    },
    async ({ page_ids }) => {
      const res = await client.rewriteBulk(page_ids);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(res.data, null, 2) +
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
    "categorize_page",
    "AI-suggest a WordPress category for a page based on its content. Free. Requires a configured WordPress domain.",
    {
      page_id: z.string().uuid().describe("Page UUID"),
      wordpress_domain: z.string().describe("WordPress domain (e.g. example.com)"),
    },
    async ({ page_id, wordpress_domain }) => {
      const res = await client.categorizePage(page_id, wordpress_domain);
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
    "Publish a page to WordPress. Async operation, returns a job_id. Free (no credit cost).",
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
    "Publish multiple pages to WordPress at once. Returns a job_id. Free.",
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
}
