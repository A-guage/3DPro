// Model library service — search online sources, download and import models into local asset library

import { v4 as uuidv4 } from "uuid";
import { writeFileSync, mkdirSync, statSync } from "node:fs";
import { dirname } from "node:path";
import {
  searchByKeyword,
  searchByFilter,
  getModel,
  CATEGORIES,
  type PolyPizzaModel,
} from "../providers/poly-pizza.js";
import { createAsset, listAssets } from "../db/repositories/assets.js";
import { ensureObjectDir, detectExt } from "./file-storage.js";
import { debug, warn, log as info } from "../mcp/logger.js";

const TAG = "model-library";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ModelSearchResult {
  id: string;
  name: string;
  description: string;
  author: string;
  author_url: string;
  license: string;
  thumbnail_url: string;
  download_url: string;
  format: string;
  tri_count: number;
  category: string;
  category_id: number;
  animated: boolean;
  poly_url: string;
}

export interface ModelSearchResponse {
  source: string;
  total: number;
  results: ModelSearchResult[];
}

export interface ImportOptions {
  url: string;
  name?: string;
  description?: string;
  category?: string;
  tags?: string[];
  source?: string;
  source_id?: string;
  source_url?: string;
  thumbnail_url?: string;
  author?: string;
  license?: string;
  width_cm?: number;
  height_cm?: number;
  depth_cm?: number;
}

export interface ImportResult {
  success: boolean;
  asset_id: string;
  name: string;
  file_path: string;
  file_format: string;
  file_size_bytes: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mapModel(m: PolyPizzaModel): ModelSearchResult {
  return {
    id: m.id,
    name: m.title,
    description: m.description || "",
    author: m.creator?.name || "unknown",
    author_url: m.creator?.url || "",
    license: m.license || "unknown",
    thumbnail_url: m.thumbnail || "",
    download_url: m.download || "",
    format: "glb",
    tri_count: m.triCount || 0,
    category: CATEGORIES[m.category] || "Other",
    category_id: m.category,
    animated: m.animated || false,
    poly_url: `https://poly.pizza/m/${m.id}`,
  };
}

async function downloadFile(url: string, destPath: string): Promise<number> {
  const dir = dirname(destPath);
  mkdirSync(dir, { recursive: true });

  debug(TAG, `Downloading: ${url.slice(0, 100)}... → ${destPath}`);
  const t0 = Date.now();

  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`Download failed: ${resp.status} ${resp.statusText}`);
  }

  const buffer = Buffer.from(await resp.arrayBuffer());
  writeFileSync(destPath, buffer);

  debug(TAG, `Downloaded ${buffer.length} bytes in ${Date.now() - t0}ms`);
  return buffer.length;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Search for models on Poly.pizza */
export async function searchModels(opts: {
  keyword?: string;
  category?: number;
  license?: string;
  animated?: boolean;
  limit?: number;
  page?: number;
}): Promise<ModelSearchResponse> {
  let result;

  if (opts.keyword) {
    debug(TAG, `Searching by keyword: "${opts.keyword}"`);
    result = await searchByKeyword(opts.keyword, {
      category: opts.category,
      license: opts.license,
      animated: opts.animated,
      limit: opts.limit || 10,
      page: opts.page,
    });
  } else {
    debug(TAG, `Searching by filter: category=${opts.category} license=${opts.license}`);
    result = await searchByFilter({
      category: opts.category,
      license: opts.license,
      animated: opts.animated,
      limit: opts.limit || 10,
      page: opts.page,
    });
  }

  return {
    source: "poly_pizza",
    total: result.total || 0,
    results: (result.results || []).map(mapModel),
  };
}

/** Get details for a single model */
export async function getModelDetail(id: string): Promise<ModelSearchResult> {
  const model = await getModel(id);
  return mapModel(model);
}

/** Download and import a model into the local asset library */
export async function importModel(opts: ImportOptions): Promise<ImportResult> {
  const assetId = `imp_${uuidv4().replace(/-/g, "").slice(0, 10)}`;
  const dir = ensureObjectDir(assetId);

  // Detect format from URL
  const ext = detectExt(opts.url);
  const filePath = `${dir}/${assetId}.${ext}`;

  // Download
  const fileSize = await downloadFile(opts.url, filePath);

  // Determine format label
  const formatLabel = ext.toUpperCase();

  // Build metadata
  const meta: Record<string, unknown> = {};
  if (opts.source) meta.source = opts.source;
  if (opts.source_id) meta.source_id = opts.source_id;
  if (opts.source_url) meta.source_url = opts.source_url;
  if (opts.author) meta.author = opts.author;
  if (opts.license) meta.license = opts.license;
  if (opts.tags) meta.tags = opts.tags;
  if (opts.width_cm) meta.width_cm = opts.width_cm;
  if (opts.height_cm) meta.height_cm = opts.height_cm;
  if (opts.depth_cm) meta.depth_cm = opts.depth_cm;

  // Save to asset library
  await createAsset({
    asset_id: assetId,
    name: opts.name || "Imported Model",
    description: opts.description || "",
    asset_type: "model_static",
    provider: (opts.source as any) || "poly_pizza",
    file_format: formatLabel,
    file_size_bytes: fileSize,
    file_path: filePath,
    thumbnail_url: opts.thumbnail_url || null,
    prompt: opts.description || opts.name || "",
    status: "ready",
    meta_json: Object.keys(meta).length > 0 ? meta : undefined,
    source: opts.source || "poly_pizza",
    source_id: opts.source_id || null,
    source_url: opts.source_url || null,
    author: opts.author || null,
    tags_csv: opts.tags?.join(",") || null,
  });

  info(TAG, `Imported model: ${assetId} name="${opts.name}" format=${formatLabel} size=${fileSize} path=${filePath}`);

  return {
    success: true,
    asset_id: assetId,
    name: opts.name || "Imported Model",
    file_path: filePath,
    file_format: formatLabel,
    file_size_bytes: fileSize,
  };
}

/** List imported models from online sources */
export async function listImports(opts?: {
  source?: string;
  keyword?: string;
  offset?: number;
  limit?: number;
}): Promise<{ total: number; items: Record<string, unknown>[] }> {
  return listAssets({
    keyword: opts?.keyword || null,
    offset: opts?.offset || 0,
    limit: opts?.limit || 20,
    asset_type: "model_static",
  });
}
