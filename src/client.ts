/**
 * HTTP client wrapper for the Web Resurrect API.
 */

// ── Types ──────────────────────────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
}

export interface PaginatedResponse<T = unknown> {
  success: boolean;
  data: T[];
  pagination: Pagination;
}

export interface CreditsData {
  credits: number;
  email: string;
  member_since: string;
}

export interface ProjectData {
  project_id: string;
  domain: string;
  name: string;
  job_id?: string;
  page_count?: number;
  stats?: Record<string, unknown>;
  created_at?: string;
}

export interface PageData {
  id: string;
  url: string;
  archive_url: string;
  title: string | null;
  source?: string;
  top_keywords?: string | null;
  status: string;
  is_scraped: boolean;
  is_rewritten: boolean;
  posted_to_wordpress: boolean;
  seo: {
    traffic: number | null;
    keywords: number | null;
    backlinks: number | null;
  };
  featured_image_url: string | null;
  created_at: string;
}

export interface JobData {
  id: string;
  type: string;
  status: "pending" | "processing" | "completed" | "failed" | "cancelled";
  progress: {
    total: number;
    processed: number;
    failed: number;
    percentage: number;
  } | null;
  credits: {
    reserved: number;
    used: number;
    refunded: number;
  };
  result: Record<string, unknown> | null;
  error: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface AsyncJobResponse {
  job_id: string;
  status: string;
  page_id?: string;
  credits_used?: number;
}

export interface EnrichResponse {
  job_id: string;
  sources: string[];
  credits_used: number;
}

export interface CategorizeResponse {
  wordpress_domain: string;
  total: number;
  categorized: number;
  suggestions: Array<{
    page_id: string;
    suggested_category: {
      id: number;
      name: string;
      slug: string;
      confidence: number;
    } | null;
    message?: string;
  }>;
}

export interface PluginCheckResponse {
  domain: string;
  plugin_detected: boolean;
  connected: boolean;
  plugin_version: string | null;
  categories: Record<string, unknown>[];
  authors: Record<string, unknown>[];
}

export interface WordPressCategory {
  id: number;
  name: string;
  slug: string;
  count?: number;
}

export interface WordPressAuthor {
  id: number;
  name: string;
  slug: string;
}

// ── Client ─────────────────────────────────────────────────────────────

export class WebResurrectClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(apiKey: string, baseUrl: string = "https://web-resurrect.com") {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  private async request<T>(
    method: string,
    path: string,
    body?: Record<string, unknown>,
    query?: Record<string, string | number | undefined>
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== null) {
          url.searchParams.set(key, String(value));
        }
      }
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
    };

    const res = await fetch(url.toString(), {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    const json = (await res.json()) as T & { error?: { message: string; code: string } };

    if (!res.ok) {
      const errMsg =
        (json as any)?.error?.message ?? `HTTP ${res.status} ${res.statusText}`;
      throw new Error(errMsg);
    }

    return json;
  }

  // ── Credits ──────────────────────────────────────────────────────────

  async getCredits(): Promise<ApiResponse<CreditsData>> {
    return this.request("GET", "/api/v1/credits");
  }

  // ── Projects ─────────────────────────────────────────────────────────

  async createProject(domain: string, name?: string): Promise<ApiResponse<ProjectData>> {
    return this.request("POST", "/api/v1/projects", { domain, ...(name ? { name } : {}) });
  }

  async listProjects(page?: number, limit?: number): Promise<PaginatedResponse<ProjectData>> {
    return this.request("GET", "/api/v1/projects", undefined, { page, limit });
  }

  async getProject(id: string): Promise<ApiResponse<ProjectData>> {
    return this.request("GET", `/api/v1/projects/${id}`);
  }

  async deleteProject(id: string): Promise<ApiResponse> {
    return this.request("DELETE", `/api/v1/projects/${id}`);
  }

  // ── Pages ────────────────────────────────────────────────────────────

  async listPages(
    projectId: string,
    opts?: {
      status?: string;
      source?: string;
      has_data?: string;
      search?: string;
      sort?: string;
      order?: string;
      page?: number;
      limit?: number;
      exclude_system?: boolean;
    }
  ): Promise<PaginatedResponse<PageData>> {
    const query: Record<string, string | number | undefined> = { ...(opts as Record<string, string | number | undefined>) };
    if (opts?.exclude_system) {
      query.exclude_system = "true";
    } else {
      delete query.exclude_system;
    }
    return this.request("GET", `/api/v1/projects/${projectId}/pages`, undefined, query);
  }

  async getPage(id: string): Promise<ApiResponse<PageData>> {
    return this.request("GET", `/api/v1/pages/${id}`);
  }

  async updatePage(
    id: string,
    updates: {
      category_id?: number | null;
      category_name?: string | null;
      author_id?: number | null;
      wordpress_post_id?: number | null;
      wordpress_post_url?: string | null;
    }
  ): Promise<ApiResponse> {
    return this.request("PATCH", `/api/v1/pages/${id}`, updates);
  }

  async getPageContent(id: string): Promise<ApiResponse> {
    return this.request("GET", `/api/v1/pages/${id}/content`);
  }

  async getPageRewritten(id: string): Promise<ApiResponse<{
    id: string;
    page_id: string;
    source: string;
    title: string | null;
    content: string | null;
    meta: { title?: string | null; description?: string | null } | null;
    created_at: string;
  }>> {
    return this.request("GET", `/api/v1/pages/${id}/rewritten`);
  }

  // ── Scraping ─────────────────────────────────────────────────────────

  async scrapePage(pageId: string, contentType?: string): Promise<ApiResponse<AsyncJobResponse>> {
    return this.request("POST", "/api/v1/scrape", {
      page_id: pageId,
      ...(contentType ? { content_type: contentType } : {}),
    });
  }

  async scrapeBulk(pageIds: string[], contentType?: string): Promise<ApiResponse<AsyncJobResponse>> {
    return this.request("POST", "/api/v1/scrape/bulk", {
      page_ids: pageIds,
      ...(contentType ? { content_type: contentType } : {}),
    });
  }

  // ── SEO Enrichment ───────────────────────────────────────────────────

  async enrichProject(
    projectId: string,
    sources?: string[]
  ): Promise<ApiResponse<EnrichResponse>> {
    return this.request("POST", "/api/v1/stats/enrich", {
      project_id: projectId,
      ...(sources ? { sources } : {}),
    });
  }

  // ── Rewriting ────────────────────────────────────────────────────────

  async rewritePage(pageId: string, instructions?: string): Promise<ApiResponse<AsyncJobResponse>> {
    return this.request("POST", "/api/v1/rewrite", {
      page_id: pageId,
      ...(instructions ? { instructions } : {}),
    });
  }

  async rewriteWisewand(
    pageId: string,
    subject?: string,
    articleParams?: Record<string, unknown>,
    wisewandApiKey?: string
  ): Promise<ApiResponse<AsyncJobResponse>> {
    return this.request("POST", "/api/v1/rewrite/wisewand", {
      page_id: pageId,
      ...(subject ? { subject } : {}),
      ...(articleParams ? { article_params: articleParams } : {}),
      ...(wisewandApiKey ? { wisewand_api_key: wisewandApiKey } : {}),
    });
  }

  async rewriteBulk(
    pageIds: string[],
    engine?: string,
    wisewandApiKey?: string,
    articleParams?: Record<string, unknown>
  ): Promise<ApiResponse<AsyncJobResponse>> {
    // Route to the Wisewand bulk endpoint when engine === 'wisewand'; the basic
    // /rewrite/bulk endpoint does not understand the `engine` body param.
    if (engine === 'wisewand') {
      return this.request("POST", "/api/v1/rewrite/wisewand/bulk", {
        page_ids: pageIds,
        ...(wisewandApiKey ? { wisewand_api_key: wisewandApiKey } : {}),
        ...(articleParams ? { article_params: articleParams } : {}),
      });
    }
    return this.request("POST", "/api/v1/rewrite/bulk", {
      page_ids: pageIds,
    });
  }

  // ── Image Generation ─────────────────────────────────────────────────

  async generateImage(pageId: string): Promise<ApiResponse<AsyncJobResponse>> {
    return this.request("POST", "/api/v1/generate-image", { page_id: pageId });
  }

  async generateImageBulk(pageIds: string[]): Promise<ApiResponse<AsyncJobResponse>> {
    return this.request("POST", "/api/v1/generate-image/bulk", { page_ids: pageIds });
  }

  // ── Categorization ───────────────────────────────────────────────────

  async categorizePages(
    pageIds: string[],
    wordpressDomain: string
  ): Promise<ApiResponse<CategorizeResponse>> {
    return this.request("POST", "/api/v1/categorize/bulk", {
      page_ids: pageIds,
      wordpress_domain: wordpressDomain,
    });
  }

  // ── WordPress ────────────────────────────────────────────────────────

  async wordpressPluginCheck(domain: string): Promise<ApiResponse<PluginCheckResponse>> {
    return this.request("POST", "/api/v1/wordpress/plugin/check", { domain });
  }

  async wordpressConfigure(opts: {
    site_url: string;
    mode?: "plugin";
    username?: string;
    app_password?: string;
    post_as_draft?: boolean;
  }): Promise<ApiResponse> {
    return this.request("POST", "/api/v1/wordpress/credentials", opts as Record<string, unknown>);
  }

  async wordpressValidate(domain: string): Promise<ApiResponse> {
    return this.request("POST", "/api/v1/wordpress/credentials/validate", { domain });
  }

  async wordpressGetMapping(domain: string): Promise<ApiResponse> {
    return this.request("GET", `/api/v1/wordpress/mapping/${encodeURIComponent(domain)}`);
  }

  async wordpressSetMapping(domain: string, mappings: Array<{ category_id: number; author_id: number }>, defaultAuthorId?: number, defaultCategoryId?: number): Promise<ApiResponse> {
    return this.request("PUT", `/api/v1/wordpress/mapping/${encodeURIComponent(domain)}`, {
      mappings,
      default_author_id: defaultAuthorId,
      default_category_id: defaultCategoryId,
    });
  }

  async wordpressCategories(domain: string): Promise<ApiResponse<WordPressCategory[]>> {
    // API returns { domain, mode, categories: [...] } — unwrap so callers get a clean array.
    const raw = await this.request<ApiResponse<{ domain: string; mode: string; categories: WordPressCategory[] }>>(
      "GET",
      `/api/v1/wordpress/categories/${encodeURIComponent(domain)}`
    );
    return { ...raw, data: raw.data?.categories ?? [] };
  }

  async wordpressAuthors(domain: string): Promise<ApiResponse<WordPressAuthor[]>> {
    // API returns { domain, mode, authors: [...] } — unwrap.
    const raw = await this.request<ApiResponse<{ domain: string; mode: string; authors: WordPressAuthor[] }>>(
      "GET",
      `/api/v1/wordpress/authors/${encodeURIComponent(domain)}`
    );
    return { ...raw, data: raw.data?.authors ?? [] };
  }

  async wordpressPublish(opts: {
    page_id: string;
    wordpress_domain: string;
    category_id?: number;
    author_id?: number;
    post_type?: string;
    status?: string;
    use_rewritten_content?: boolean;
    remove_links?: boolean;
  }): Promise<ApiResponse<AsyncJobResponse>> {
    return this.request("POST", "/api/v1/wordpress/publish", opts as Record<string, unknown>);
  }

  async wordpressPublishBulk(opts: {
    page_ids: string[];
    wordpress_domain: string;
    category_id?: number;
    author_id?: number;
    post_type?: string;
    status?: string;
    use_rewritten_content?: boolean;
    remove_links?: boolean;
  }): Promise<ApiResponse<AsyncJobResponse>> {
    return this.request("POST", "/api/v1/wordpress/publish/bulk", opts as Record<string, unknown>);
  }

  // ── Jobs ─────────────────────────────────────────────────────────────

  async getJob(id: string): Promise<ApiResponse<JobData>> {
    return this.request("GET", `/api/v1/jobs/${id}`);
  }

  async waitForJob(
    id: string,
    opts?: { timeoutSeconds?: number; pollIntervalSeconds?: number }
  ): Promise<ApiResponse<JobData> & { timed_out?: boolean }> {
    const timeoutMs = (opts?.timeoutSeconds ?? 300) * 1000;
    const pollMs = Math.max(1, opts?.pollIntervalSeconds ?? 5) * 1000;
    const deadline = Date.now() + timeoutMs;

    let last: ApiResponse<JobData> = await this.getJob(id);
    while (true) {
      const status = last.data?.status;
      if (status === "completed" || status === "failed" || status === "cancelled") {
        return last;
      }
      if (Date.now() + pollMs > deadline) {
        return { ...last, timed_out: true };
      }
      await new Promise((resolve) => setTimeout(resolve, pollMs));
      last = await this.getJob(id);
    }
  }

  async getProjectStats(id: string): Promise<ApiResponse<Record<string, unknown>>> {
    return this.request("GET", `/api/v1/projects/${id}/stats`);
  }

  async listJobs(opts?: {
    status?: string;
    type?: string;
    page?: number;
    limit?: number;
  }): Promise<PaginatedResponse<JobData>> {
    return this.request("GET", "/api/v1/jobs", undefined, opts as Record<string, string | number | undefined>);
  }

  async cancelJob(id: string): Promise<ApiResponse> {
    return this.request("POST", `/api/v1/jobs/${id}/cancel`);
  }

  async exportRedirects(projectId: string, format: string): Promise<ApiResponse> {
    return this.request("GET", `/api/v1/projects/${projectId}/redirects`, undefined, { format });
  }

  async pushRedirects(projectId: string, wordpressDomain: string, urls?: string[], redirectTo?: string): Promise<ApiResponse> {
    const body: Record<string, unknown> = { wordpress_domain: wordpressDomain };
    if (urls && urls.length > 0) body.urls = urls;
    if (redirectTo) body.redirect_to = redirectTo;
    return this.request("POST", `/api/v1/projects/${projectId}/redirects/push`, body);
  }

}
