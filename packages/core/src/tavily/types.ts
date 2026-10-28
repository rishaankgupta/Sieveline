/**
 * Request/response types for the Tavily API, from the API reference read on 2026-10-28.
 * Only fields Sieveline uses are typed strictly; unknown extra fields are tolerated.
 */
export type SearchDepth = "ultra-fast" | "fast" | "basic" | "advanced";
export type ExtractDepth = "basic" | "advanced";

export interface Usage {
  credits?: number;
}

export interface SearchRequest {
  query: string;
  search_depth?: SearchDepth;
  chunks_per_source?: number;
  max_results?: number;
  topic?: "general" | "news" | "finance";
  time_range?: "day" | "week" | "month" | "year";
  start_date?: string;
  end_date?: string;
  include_published_date?: boolean;
  include_domains?: string[];
  include_domains_mode?: "restrict" | "prefer";
  exclude_domains?: string[];
  country?: string;
  exact_match?: boolean;
  include_raw_content?: boolean | "markdown" | "text";
}

export interface SearchResult {
  url: string;
  title?: string;
  content?: string;
  score?: number;
  published_date?: string | null;
  raw_content?: string | null;
}

export interface SearchResponse {
  query: string;
  results: SearchResult[];
  usage?: Usage;
  request_id?: string;
}

export interface ExtractRequest {
  urls: string[];
  query?: string;
  chunks_per_source?: number;
  extract_depth?: ExtractDepth;
  format?: "markdown" | "text";
  timeout?: number;
}

export interface ExtractResponse {
  /** raw_content can be null on real responses (seen 2026-10-28), not only empty. */
  results: { url: string; raw_content: string | null }[];
  failed_results?: { url: string; error?: string }[];
  usage?: Usage;
  request_id?: string;
}

export interface MapRequest {
  url: string;
  instructions?: string;
  max_depth?: number;
  max_breadth?: number;
  limit?: number;
  select_paths?: string[];
  exclude_paths?: string[];
  allow_external?: boolean;
  timeout?: number;
}

export interface MapResponse {
  base_url: string;
  results: string[];
  usage?: Usage;
  request_id?: string;
}

export interface CrawlRequest extends MapRequest {
  chunks_per_source?: number;
  extract_depth?: ExtractDepth;
  format?: "markdown" | "text";
}

export interface CrawlResponse {
  base_url: string;
  results: { url: string; raw_content: string | null }[];
  usage?: Usage;
  request_id?: string;
}

export interface ResearchFile {
  filename: string;
  /** base64-encoded contents (.txt, .md, .json) */
  content: string;
}

export interface ResearchRequest {
  input: string;
  model?: "mini" | "pro" | "auto";
  output_schema?: Record<string, unknown> & { properties: Record<string, unknown> };
  citation_format?: "numbered" | "mla" | "apa" | "chicago";
  include_domains?: string[];
  exclude_domains?: string[];
  output_length?: "short" | "standard" | "long";
  files?: ResearchFile[];
}

export interface ResearchCreated {
  request_id: string;
  created_at: string;
  status: string;
}

export type ResearchStatus =
  | { request_id: string; status: "pending" | "in_progress" }
  | {
      request_id: string;
      status: "completed";
      content: string | Record<string, unknown>;
      sources?: { url: string; title?: string }[];
      usage?: Usage;
    }
  | { request_id: string; status: "failed"; error?: string };

export type UsageResponse = Record<string, unknown>;
