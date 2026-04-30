# @web-resurrect/mcp

[![npm version](https://img.shields.io/npm/v/@web-resurrect/mcp.svg)](https://www.npmjs.com/package/@web-resurrect/mcp)
[![AI Skill](https://img.shields.io/badge/AI%20Skill-web--resurrect-blueviolet)](https://github.com/MattiooFR/web-resurrect-skill)

MCP (Model Context Protocol) server for the [Web Resurrect](https://web-resurrect.com) API. Lets AI assistants like Claude resurrect expired domains: fetch archived URLs, scrape content, rewrite with AI, generate images, and publish to WordPress.

## 🤖 AI Agent Skill (pipeline complet)

Le **skill unifié `web-resurrect`** couvre tout le workflow de A à Z (création projet → enrichissement SEO → scraping Wayback → réécriture → catégorisation AI → publication WordPress → redirections), avec toutes les astuces et pièges connus. Il fonctionne aussi bien avec ce MCP server qu'avec la CLI `wr`, et contient une table de correspondance complète entre les deux modes.

Compatible avec **Claude Code, Codex, Cursor, Cline, Copilot, OpenCode, Windsurf** et 40+ autres agents via [`npx skills`](https://github.com/vercel-labs/skills) :

```bash
# Install globalement pour tous tes projets
npx skills add MattiooFR/web-resurrect-skill -g

# Ou uniquement pour le projet courant
npx skills add MattiooFR/web-resurrect-skill
```

Une fois installé, demande simplement à ton agent :

> "Ressuscite le domaine exemple.com"

Et il suivra automatiquement le pipeline complet en utilisant les outils MCP `mcp__web_resurrect__*` de ce serveur.

**Source du skill** : [github.com/MattiooFR/web-resurrect-skill](https://github.com/MattiooFR/web-resurrect-skill)

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
- **list_pages** — List pages with status/source/search filters, sorting, pagination. Each page exposes a `source` field: `wayback` (default, scrapeable from archive) or `haloscan` (discovered via Haloscan, no snapshot — Wisewand-rewrite only).
- **get_page** — Get full page details (scrape, rewrite, SEO, WordPress status)

### Scraping
- **scrape_page** — Scrape a page from the Wayback Machine (1 credit)
- **scrape_bulk** — Scrape multiple pages (1 credit each, max 100)

### SEO Enrichment
- **enrich_project** — Enrich with Haloscan (free) and/or Majestic (10 credits)

### Rewriting
- **rewrite_page** — Rewrite a page (basic default 1 credit, add `wisewand=true` for premium 5 credits / 1 with own key). Wisewand mode also accepts Haloscan-origin pages (no scrape required).
- **rewrite_bulk** — Rewrite multiple pages (same options, max 50). In Wisewand mode, mixes scraped + Haloscan-origin pages; use `list_pages` with `status='rewritable_wisewand'` to fetch everything rewritable in one call, or `status='haloscan'` to target only Haloscan-origin pages.

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
- **wordpress_publish** — Publish a page to WordPress (free, original URLs preserved in plugin mode)
- **wordpress_publish_bulk** — Publish multiple pages (free, supports plugin and Basic Auth modes)
- **export_redirects** — Export URL mappings to file (only needed for Basic Auth mode)

### Jobs
- **get_job** — Get job status, progress, and result
- **wait_for_job** — Block until a job reaches a terminal state (server-side polling). USE THIS AFTER EVERY ASYNC CALL for autonomous pipelines — no more manual polling loops.
- **list_jobs** — List recent jobs with filters
- **cancel_job** — Cancel a pending job

### Overview
- **get_project_overview** — Single-call pipeline status: pending/scraped/rewritten/published counts, Wisewand pipeline state, SEO totals. Replaces several list_pages calls.

## Typical workflow

1. `create_project` with a domain -> get `job_id`
2. `get_job` to wait for URL fetching to complete
3. `enrich_project` with Haloscan for SEO data
4. `list_pages` sorted by `total_traffic` to find best pages
5. `scrape_bulk` the top pages
6. `rewrite_bulk` the scraped pages
7. `generate_image_bulk` for rewritten pages
8. `wordpress_configure` your WordPress site
9. `wordpress_publish_bulk` to publish everything (original URLs preserved in plugin mode, URL mappings pushed automatically)
10. Non-published URLs automatically 301 to homepage (via plugin catch-all)

## Credit costs

| Action | Cost |
|---|---|
| Create project + URL fetching | Free |
| Haloscan enrichment | Free |
| Majestic enrichment (backlinks) | 10 credits |
| Scrape a page | 1 credit |
| Rewrite (basic) | 1 credit |
| Rewrite (Wisewand) | 5 credits (1 with own key) |
| Image generation | 1 credit |
| AI categorization | Free |
| WordPress publish | Free |
