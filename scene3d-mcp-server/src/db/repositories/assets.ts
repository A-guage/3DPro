// Asset, category & tag CRUD — mirrors history_models.py lines 552-974

import type { SqlValue } from "sql.js";
import { getDb } from "../connection.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function now(): string {
  return new Date().toISOString();
}

function rowsToObjects(
  result: { columns: string[]; values: unknown[][] }[],
): Record<string, unknown>[] {
  if (!result.length) return [];
  const cols = result[0].columns;
  return result[0].values.map((row) => {
    const obj: Record<string, unknown> = {};
    cols.forEach((c, i) => (obj[c] = row[i]));
    return obj;
  });
}

function firstRow(
  result: { columns: string[]; values: unknown[][] }[],
): Record<string, unknown> | null {
  const arr = rowsToObjects(result);
  return arr[0] ?? null;
}

// ---------------------------------------------------------------------------
// Asset Category CRUD
// ---------------------------------------------------------------------------

export interface CategoryNode {
  id: number;
  name: string;
  parent_id: number | null;
  icon: string | null;
  sort_order: number;
  children: CategoryNode[];
}

export async function createCategory(
  name: string,
  parentId?: number | null,
  icon?: string | null,
  sortOrder = 0,
): Promise<{ id: number; name: string; parent_id: number | null; icon: string | null; sort_order: number }> {
  const db = await getDb();
  db.run(
    `INSERT INTO scene3d_asset_categories (name, parent_id, icon, sort_order, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [name, parentId ?? null, icon ?? null, sortOrder, now()],
  );
  const res = db.exec("SELECT last_insert_rowid() as id");
  const id = res[0].values[0][0] as number;
  return { id, name, parent_id: parentId ?? null, icon: icon ?? null, sort_order: sortOrder };
}

export async function getCategories(): Promise<CategoryNode[]> {
  const db = await getDb();
  const result = db.exec(
    `SELECT id, name, parent_id, icon, sort_order
     FROM scene3d_asset_categories
     ORDER BY sort_order, id`,
  );
  const rows = rowsToObjects(result);

  const idToNode = new Map<number, CategoryNode>();
  const roots: CategoryNode[] = [];

  for (const r of rows) {
    const node: CategoryNode = {
      id: r.id as number,
      name: r.name as string,
      parent_id: (r.parent_id as number) ?? null,
      icon: (r.icon as string) ?? null,
      sort_order: (r.sort_order as number) ?? 0,
      children: [],
    };
    idToNode.set(node.id, node);
  }

  for (const r of rows) {
    const id = r.id as number;
    const pid = r.parent_id as number | null;
    const node = idToNode.get(id)!;
    if (pid != null && idToNode.has(pid)) {
      idToNode.get(pid)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

export async function updateCategory(
  categoryId: number,
  opts: {
    name?: string | null;
    parent_id?: number | null | -1; // -1 sentinel = don't update
    icon?: string | null;
    sort_order?: number | null;
  },
): Promise<boolean> {
  const db = await getDb();
  const existing = db.exec(
    "SELECT id FROM scene3d_asset_categories WHERE id = ?",
    [categoryId],
  );
  if (!existing.length || !existing[0].values.length) return false;

  const sets: string[] = [];
  const params: SqlValue[] = [];

  if (opts.name != null) {
    sets.push("name = ?");
    params.push(opts.name);
  }
  if (opts.parent_id !== undefined && opts.parent_id !== -1) {
    sets.push("parent_id = ?");
    params.push(opts.parent_id as SqlValue);
  }
  if (opts.icon != null) {
    sets.push("icon = ?");
    params.push(opts.icon);
  }
  if (opts.sort_order != null) {
    sets.push("sort_order = ?");
    params.push(opts.sort_order);
  }

  if (sets.length === 0) return true;
  params.push(categoryId);
  db.run(
    `UPDATE scene3d_asset_categories SET ${sets.join(", ")} WHERE id = ?`,
    params,
  );
  return true;
}

export async function deleteCategory(categoryId: number): Promise<boolean> {
  const db = await getDb();
  const existing = db.exec(
    "SELECT id FROM scene3d_asset_categories WHERE id = ?",
    [categoryId],
  );
  if (!existing.length || !existing[0].values.length) return false;
  db.run("DELETE FROM scene3d_asset_categories WHERE id = ?", [categoryId]);
  return true;
}

// ---------------------------------------------------------------------------
// Asset Tag CRUD
// ---------------------------------------------------------------------------

export async function createTag(
  name: string,
  color?: string | null,
): Promise<{ id: number; name: string; color: string | null }> {
  const db = await getDb();
  // Return existing if duplicate
  const existing = db.exec(
    "SELECT id, name, color FROM scene3d_asset_tags WHERE name = ?",
    [name],
  );
  if (existing.length && existing[0].values.length) {
    const row = firstRow(existing)!;
    return { id: row.id as number, name: row.name as string, color: (row.color as string) ?? null };
  }

  db.run(
    `INSERT INTO scene3d_asset_tags (name, color, created_at) VALUES (?, ?, ?)`,
    [name, color ?? null, now()],
  );
  const res = db.exec("SELECT last_insert_rowid() as id");
  const id = res[0].values[0][0] as number;
  return { id, name, color: color ?? null };
}

export async function getTags(): Promise<Array<{ id: number; name: string; color: string | null }>> {
  const db = await getDb();
  const result = db.exec("SELECT id, name, color FROM scene3d_asset_tags ORDER BY name");
  return rowsToObjects(result).map((r) => ({
    id: r.id as number,
    name: r.name as string,
    color: (r.color as string) ?? null,
  }));
}

export async function deleteTag(tagId: number): Promise<boolean> {
  const db = await getDb();
  const existing = db.exec("SELECT id FROM scene3d_asset_tags WHERE id = ?", [tagId]);
  if (!existing.length || !existing[0].values.length) return false;
  db.run("DELETE FROM scene3d_asset_tags WHERE id = ?", [tagId]);
  return true;
}

// ---------------------------------------------------------------------------
// Asset CRUD
// ---------------------------------------------------------------------------

export interface CreateAssetInput {
  asset_id: string;
  name: string;
  asset_type: string;
  provider?: string;
  description?: string;
  file_format?: string | null;
  file_size_bytes?: number | null;
  file_path?: string | null;
  thumbnail_url?: string | null;
  category_id?: number | null;
  license?: string | null;
  user_id?: string | null;
  prompt?: string | null;
  meta_json?: Record<string, unknown> | null;
  status?: string;
  version?: string;
  tag_ids?: number[] | null;
  source?: string | null;
  source_id?: string | null;
  source_url?: string | null;
  author?: string | null;
  tags_csv?: string | null;
}

export async function createAsset(input: CreateAssetInput): Promise<{ asset_id: string; status: string }> {
  const db = await getDb();
  const ts = now();

  db.run("BEGIN TRANSACTION;");
  try {
    db.run(
      `INSERT INTO scene3d_assets
         (asset_id, name, description, asset_type, provider, file_format,
          file_size_bytes, file_path, thumbnail_url, category_id, license,
          user_id, downloads_count, prompt, meta_json, status, version,
          source, source_id, source_url, author, tags_csv,
          created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.asset_id,
        input.name,
        input.description ?? "",
        input.asset_type,
        input.provider ?? "user_upload",
        input.file_format ?? null,
        input.file_size_bytes ?? null,
        input.file_path ?? null,
        input.thumbnail_url ?? null,
        input.category_id ?? null,
        input.license ?? null,
        input.user_id ?? null,
        input.prompt ?? null,
        input.meta_json ? JSON.stringify(input.meta_json) : null,
        input.status ?? "ready",
        input.version ?? "1.0",
        input.source ?? null,
        input.source_id ?? null,
        input.source_url ?? null,
        input.author ?? null,
        input.tags_csv ?? null,
        ts,
        ts,
      ],
    );

    if (input.tag_ids?.length) {
      for (const tid of input.tag_ids) {
        db.run(
          "INSERT INTO scene3d_asset_tag_relations (asset_id, tag_id) VALUES (?, ?)",
          [input.asset_id, tid],
        );
      }
    }

    db.run("COMMIT;");
  } catch (e) {
    db.run("ROLLBACK;");
    throw e;
  }

  return { asset_id: input.asset_id, status: input.status ?? "ready" };
}

// Sentinel value for "don't update" (matches Python's -1 sentinel)
const SKIP = Symbol("skip");

export interface UpdateAssetInput {
  name?: string | null;
  description?: string | null;
  asset_type?: string | null;
  provider?: string | null;
  file_format?: string | null;
  file_size_bytes?: number | null | typeof SKIP;
  file_path?: string | null | typeof SKIP;
  thumbnail_url?: string | null | typeof SKIP;
  category_id?: number | null | typeof SKIP;
  license?: string | null | typeof SKIP;
  prompt?: string | null | typeof SKIP;
  meta_json?: Record<string, unknown> | null | typeof SKIP;
  status?: string | null;
  version?: string | null;
  tag_ids?: number[] | null | typeof SKIP;
}

export async function updateAsset(
  assetId: string,
  input: UpdateAssetInput,
): Promise<boolean> {
  const db = await getDb();
  const existing = db.exec("SELECT id FROM scene3d_assets WHERE asset_id = ?", [assetId]);
  if (!existing.length || !existing[0].values.length) return false;

  const sets: string[] = [];
  const params: SqlValue[] = [];

  const field = (col: string, val: SqlValue | typeof SKIP) => {
    if (val === SKIP) return;
    sets.push(`${col} = ?`);
    params.push(val as SqlValue);
  };

  if (input.name !== undefined && input.name !== null) { sets.push("name = ?"); params.push(input.name); }
  if (input.description !== undefined && input.description !== null) { sets.push("description = ?"); params.push(input.description); }
  if (input.asset_type !== undefined && input.asset_type !== null) { sets.push("asset_type = ?"); params.push(input.asset_type); }
  if (input.provider !== undefined && input.provider !== null) { sets.push("provider = ?"); params.push(input.provider); }
  if (input.file_format !== undefined && input.file_format !== null) { sets.push("file_format = ?"); params.push(input.file_format); }
  field("file_size_bytes", input.file_size_bytes as SqlValue | typeof SKIP);
  field("file_path", input.file_path as SqlValue | typeof SKIP);
  field("thumbnail_url", input.thumbnail_url as SqlValue | typeof SKIP);
  field("category_id", input.category_id as SqlValue | typeof SKIP);
  field("license", input.license as SqlValue | typeof SKIP);
  field("prompt", input.prompt as SqlValue | typeof SKIP);
  if (input.meta_json !== SKIP) {
    sets.push("meta_json = ?");
    params.push(input.meta_json ? JSON.stringify(input.meta_json) : null);
  }
  if (input.status !== undefined && input.status !== null) { sets.push("status = ?"); params.push(input.status); }
  if (input.version !== undefined && input.version !== null) { sets.push("version = ?"); params.push(input.version); }

  sets.push("updated_at = ?");
  params.push(now());
  params.push(assetId);

  // Safety: filter out any undefined values that slipped through
  const safeParams = params.filter((v) => v !== undefined) as SqlValue[];

  db.run("BEGIN TRANSACTION;");
  try {
    if (sets.length > 1) {
      db.run(
        `UPDATE scene3d_assets SET ${sets.join(", ")} WHERE asset_id = ?`,
        safeParams,
      );
    }

    // Handle tag_ids replacement
    if (input.tag_ids !== SKIP) {
      db.run("DELETE FROM scene3d_asset_tag_relations WHERE asset_id = ?", [assetId]);
      if (input.tag_ids?.length) {
        for (const tid of input.tag_ids) {
          db.run(
            "INSERT INTO scene3d_asset_tag_relations (asset_id, tag_id) VALUES (?, ?)",
            [assetId, tid],
          );
        }
      }
    }

    db.run("COMMIT;");
  } catch (e) {
    db.run("ROLLBACK;");
    throw e;
  }

  return true;
}

/** Get a single asset with tags and category name. */
export async function getAsset(assetId: string): Promise<Record<string, unknown> | null> {
  const db = await getDb();
  const res = db.exec("SELECT * FROM scene3d_assets WHERE asset_id = ?", [assetId]);
  const asset = firstRow(res);
  if (!asset) return null;

  // Tags
  const tagRes = db.exec(
    `SELECT t.id, t.name, t.color
     FROM scene3d_asset_tags t
     JOIN scene3d_asset_tag_relations r ON t.id = r.tag_id
     WHERE r.asset_id = ?`,
    [assetId],
  );
  const tags = rowsToObjects(tagRes);

  // Category name
  let categoryName: string | null = null;
  if (asset.category_id != null) {
    const catRes = db.exec(
      "SELECT name FROM scene3d_asset_categories WHERE id = ?",
      [asset.category_id as SqlValue],
    );
    if (catRes.length && catRes[0].values.length) {
      categoryName = catRes[0].values[0][0] as string;
    }
  }

  // Parse meta_json
  let meta: Record<string, unknown> | null = null;
  if (asset.meta_json) {
    try { meta = JSON.parse(asset.meta_json as string); } catch { meta = null; }
  }

  return { ...asset, category_name: categoryName, meta, tags };
}

/** List assets with filtering, pagination, and total count. */
export async function listAssets(opts: {
  user_id?: string | null;
  asset_type?: string | null;
  provider?: string | null;
  category_id?: number | null;
  keyword?: string | null;
  tag_id?: number | null;
  status?: string | null;
  offset?: number;
  limit?: number;
} = {}): Promise<{ total: number; items: Record<string, unknown>[]; offset: number; limit: number }> {
  const db = await getDb();
  const { offset = 0, limit = 20 } = opts;

  const where: string[] = [];
  const params: SqlValue[] = [];

  if (opts.user_id) { where.push("a.user_id = ?"); params.push(opts.user_id); }
  if (opts.asset_type) { where.push("a.asset_type = ?"); params.push(opts.asset_type); }
  if (opts.provider) { where.push("a.provider = ?"); params.push(opts.provider); }
  if (opts.category_id != null) { where.push("a.category_id = ?"); params.push(opts.category_id); }
  if (opts.status) { where.push("a.status = ?"); params.push(opts.status); }
  if (opts.keyword) {
    const pat = `%${opts.keyword}%`;
    where.push("(a.name LIKE ? OR a.description LIKE ? OR a.prompt LIKE ?)");
    params.push(pat, pat, pat);
  }

  let tagSubquery = "";
  if (opts.tag_id != null) {
    tagSubquery = ` AND a.asset_id IN (SELECT asset_id FROM scene3d_asset_tag_relations WHERE tag_id = ?)`;
  }

  const whereClause = where.length ? `WHERE ${where.join(" AND ")}${tagSubquery}` : tagSubquery ? `WHERE 1=1${tagSubquery}` : "";

  // Count
  const countParams: SqlValue[] = [...params];
  if (opts.tag_id != null) countParams.push(opts.tag_id);
  const countRes = db.exec(
    `SELECT COUNT(*) FROM scene3d_assets a ${whereClause}`,
    countParams,
  );
  const total = (countRes[0]?.values[0]?.[0] as number) ?? 0;

  // Query
  const queryParams: SqlValue[] = [...params];
  if (opts.tag_id != null) queryParams.push(opts.tag_id);
  queryParams.push(limit, offset);
  const result = db.exec(
    `SELECT a.* FROM scene3d_assets a
     ${whereClause}
     ORDER BY a.updated_at DESC
     LIMIT ? OFFSET ?`,
    queryParams,
  );
  const rows = rowsToObjects(result);

  // Attach tags to each row
  const items: Record<string, unknown>[] = [];
  for (const row of rows) {
    const tagRes = db.exec(
      `SELECT t.id, t.name, t.color
       FROM scene3d_asset_tags t
       JOIN scene3d_asset_tag_relations r ON t.id = r.tag_id
       WHERE r.asset_id = ?`,
      [row.asset_id as SqlValue],
    );
    items.push({ ...row, tags: rowsToObjects(tagRes) });
  }

  return { total, items, offset, limit };
}

export async function deleteAsset(assetId: string): Promise<boolean> {
  const db = await getDb();
  const existing = db.exec("SELECT id FROM scene3d_assets WHERE asset_id = ?", [assetId]);
  if (!existing.length || !existing[0].values.length) return false;
  db.run("DELETE FROM scene3d_assets WHERE asset_id = ?", [assetId]);
  return true;
}

export async function incrementDownload(assetId: string): Promise<void> {
  const db = await getDb();
  db.run(
    `UPDATE scene3d_assets
     SET downloads_count = downloads_count + 1, updated_at = ?
     WHERE asset_id = ?`,
    [now(), assetId],
  );
}
