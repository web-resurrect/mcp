# @web-resurrect/mcp

MCP (Model Context Protocol) server for the [Web Resurrect](https://web-resurrect.com) API. Lets AI assistants like Claude resurrect expired domains: fetch archived URLs, scrape content, rewrite with AI, generate images, and publish to WordPress.

## Quick start

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "web-resurrect": {
      "command": "npx",
      "args": ["-y", "@web-resurrect/mcp"],
      "env": {
        "WEB_RESURRECT_API_KEY": "wr_live_xxx"
      }
    }
  }
}
```

### Claude Code

```bash
claude mcp add web-resurrect -e WEB_RESURRECT_API_KEY=wr_live_xxx -- npx -y @web-resurrect/mcp
```

### Local development

```bash
cd packages/mcp
npm install
npm run build
WEB_RESURRECT_API_KEY=wr_live_xxx node dist/index.js
```

## Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `WEB_RESURRECT_API_KEY` | Yes | — | API key (`wr_live_xxx`). Get one from your [dashboard](https://web-resurrect.com/dashboard). |
| `WEB_RESURRECT_BASE_URL` | No | `https://web-resurrect.com` | API base URL (for self-hosted or staging). |

## Available tools

### Credits
- **get_credits** — Get current credit balance and account info

### Projects
- **create_project** — Create a project for an expired domain (starts URL fetching)
- **list_projects** — List all projects with page counts
- **get_project** — Get project details and stats
- **delete_project** — Delete a project and all its pages

### Pages
- **list_pages** — List pages with status/search filters, sorting, pagination
- **get_page** — Get full page details (scrape, rewrite, SEO, WordPress status)

### Scraping
- **scrape_page** — Scrape a page from the Wayback Machine (1 credit)
- **scrape_bulk** — Scrape multiple pages (1 credit each, max 100)

### SEO Enrichment
- **enrich_project** — Enrich with Haloscan (free) and/or Majestic (10 credits)

### Rewriting
- **rewrite_page** — Rewrite with GPT (1 credit), optional custom instructions
- **rewrite_wisewand** — Rewrite with Wisewand premium (10 credits, takes 2-4h)
- **rewrite_bulk** — Rewrite multiple pages with GPT (1 credit each, max 50)

### Image Generation
- **generate_image** — Generate AI featured image (1 credit)
- **generate_image_bulk** — Generate images for multiple pages (1 credit each, max 50)

### Categorization
- **categorize_page** — AI-suggest a WordPress category for a page (free)

### WordPress
- **wordpress_plugin_check** — Check if WP plugin is installed
- **wordpress_configure** — Configure WordPress credentials (plugin or basic_auth)
- **wordpress_validate** — Validate WordPress connection
- **wordpress_categories** — List WordPress categories
- **wordpress_authors** — List WordPress authors
- **wordpress_publish** — Publish a page to WordPress (free)
- **wordpress_publish_bulk** — Publish multiple pages (free)

### Jobs
- **get_job** — Get job status, progress, and result
- **list_jobs** — List recent jobs with filters
- **cancel_job** — Cancel a pending job

## Typical workflow

1. `create_project` with a domain -> get `job_id`
2. `get_job` to wait for URL fetching to complete
3. `enrich_project` with Haloscan for SEO data
4. `list_pages` sorted by `total_traffic` to find best pages
5. `scrape_bulk` the top pages
6. `rewrite_bulk` the scraped pages
7. `generate_image_bulk` for rewritten pages
8. `wordpress_configure` your WordPress site
9. `wordpress_publish_bulk` to publish everything

## Credit costs

| Action | Cost |
|---|---|
| Create project + URL fetching | Free |
| Haloscan enrichment | Free |
| Majestic enrichment (backlinks) | 10 credits |
| Scrape a page | 1 credit |
| GPT rewrite | 1 credit |
| Wisewand rewrite | 10 credits (1 with your own key) |
| Image generation | 1 credit |
| AI categorization | Free |
| WordPress publish | Free |
