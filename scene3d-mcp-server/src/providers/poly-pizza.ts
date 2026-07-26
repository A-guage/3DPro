// Poly.pizza API client — wraps the Poly Pizza REST API v1.1
// Reference: https://poly.pizza

import { loadConfig } from "../config.js";
import { debug, warn } from "../mcp/logger.js";

const TAG = "poly-pizza";

export interface PolyPizzaModel {
  id: string;
  title: string;
  description: string;
  attribution: string;
  thumbnail: string;
  download: string;
  triCount: number;
  creator: { name: string; url: string };
  uploadDate: string;
  category: number;
  license: string;
  animated: boolean;
  orbit: { phi: number; theta: number; radius: number };
}

export interface PolyPizzaSearchResult {
  total: number;
  results: PolyPizzaModel[];
}

// Category ID → human-readable label
export const CATEGORIES: Record<number, string> = {
  0: "Food & Drink",
  1: "Clutter",
  2: "Weapons",
  3: "Transport",
  4: "Furniture & Decor",
  5: "Objects",
  6: "Nature",
  7: "Animals",
  8: "Buildings/Architecture",
  9: "People & Characters",
  10: "Scenes & Levels",
  11: "Other",
};

function getApiKey(): string | undefined {
  const config = loadConfig();
  return config.model_libraries?.poly_pizza?.api_key || process.env.POLYPIZZA_AUTH_TOKEN;
}

function getBaseUrl(): string {
  const config = loadConfig();
  return config.model_libraries?.poly_pizza?.base_url || "https://api.poly.pizza/v1.1";
}

async function apiRequest<T>(endpoint: string): Promise<T> {
  const baseUrl = getBaseUrl();
  const apiKey = getApiKey();
  const url = `${baseUrl}${endpoint}`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (apiKey) {
    headers["x-auth-token"] = apiKey;
  }

  debug(TAG, `API request: ${url}`);
  const t0 = Date.now();

  const resp = await fetch(url, { headers });

  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    warn(TAG, `API error: ${resp.status} ${resp.statusText} — ${body.slice(0, 200)}`);
    throw new Error(`Poly.pizza API error: ${resp.status} ${resp.statusText}`);
  }

  const data = await resp.json();
  debug(TAG, `API response: ${resp.status} in ${Date.now() - t0}ms`);
  return data as T;
}

// License string → Poly Pizza API integer
// API: 0 = CC-BY, 1 = CC0
function licenseToApi(license?: string): number | undefined {
  if (!license) return undefined;
  if (license === "CC0") return 1;
  return 0; // CC-BY and variants
}

/** Search models by keyword */
export async function searchByKeyword(
  keyword: string,
  opts?: {
    category?: number;
    license?: string;
    animated?: boolean;
    limit?: number;
    page?: number;
  },
): Promise<PolyPizzaSearchResult> {
  const encoded = encodeURIComponent(keyword);
  const params = new URLSearchParams();
  if (opts?.category != null) params.set("Category", String(opts.category));
  const licenseVal = licenseToApi(opts?.license);
  if (licenseVal != null) params.set("License", String(licenseVal));
  if (opts?.animated != null) params.set("Animated", opts.animated ? "1" : "0");
  if (opts?.limit) params.set("Limit", String(Math.min(opts.limit, 32)));
  if (opts?.page != null && opts.page > 0) params.set("Page", String(opts.page - 1));

  const qs = params.toString();
  return apiRequest<PolyPizzaSearchResult>(`/search/${encoded}${qs ? `?${qs}` : ""}`);
}

/** Search models by filters (no keyword) */
export async function searchByFilter(opts: {
  category?: number;
  license?: string;
  animated?: boolean;
  limit?: number;
  page?: number;
}): Promise<PolyPizzaSearchResult> {
  const params = new URLSearchParams();
  if (opts.category != null) params.set("Category", String(opts.category));
  const licenseVal = licenseToApi(opts.license);
  if (licenseVal != null) params.set("License", String(licenseVal));
  if (opts.animated != null) params.set("Animated", opts.animated ? "1" : "0");
  if (opts.limit) params.set("Limit", String(Math.min(opts.limit, 32)));
  if (opts.page != null && opts.page > 0) params.set("Page", String(opts.page - 1));

  const qs = params.toString();
  return apiRequest<PolyPizzaSearchResult>(`/search${qs ? `?${qs}` : ""}`);
}

/** Get a single model by ID */
export async function getModel(id: string): Promise<PolyPizzaModel> {
  return apiRequest<PolyPizzaModel>(`/model/${id}`);
}
