// Scene object CRUD — mirrors history_models.py lines 474-544

import type { SqlValue } from "sql.js";
import { getDb } from "../connection.js";

export interface ObjectRecord {
  id: number;
  scene_id: string;
  session_id: string | null;
  object_id: string;
  object_name: string | null;
  status: string;
  model_url: string | null;
  local_path: string | null;
  width_cm: number | null;
  height_cm: number | null;
  depth_cm: number | null;
  file_size_bytes: number | null;
  format: string | null;
  created_at: string;
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

/** Create a new object record (defaults scene_id to 'individual_object'). */
export async function createObjectRecord(
  sessionId: string,
  objectId: string,
  objectName: string,
  status = "processing",
): Promise<void> {
  const db = await getDb();
  db.run(
    `INSERT INTO scene3d_object_records
       (scene_id, session_id, object_id, object_name, status, created_at)
     VALUES ('individual_object', ?, ?, ?, ?, ?)`,
    [sessionId, objectId, objectName, status, new Date().toISOString()],
  );
}

/** Update an object's status, model_url, local_path, dimensions, etc. */
export async function updateObjectStatus(
  objectId: string,
  status: string,
  modelUrl?: string | null,
  localPath?: string | null,
  meta?: {
    width_cm?: number | null;
    height_cm?: number | null;
    depth_cm?: number | null;
    file_size_bytes?: number | null;
    format?: string | null;
  },
): Promise<void> {
  const db = await getDb();
  const existing = db.exec(
    "SELECT id FROM scene3d_object_records WHERE object_id = ?",
    [objectId],
  );
  if (!existing.length || !existing[0].values.length) return;

  const sets: string[] = ["status = ?"];
  const params: SqlValue[] = [status];

  if (modelUrl) {
    sets.push("model_url = ?");
    params.push(modelUrl);
  }
  if (localPath) {
    sets.push("local_path = ?");
    params.push(localPath);
  }
  if (meta) {
    if (meta.width_cm != null) { sets.push("width_cm = ?"); params.push(meta.width_cm); }
    if (meta.height_cm != null) { sets.push("height_cm = ?"); params.push(meta.height_cm); }
    if (meta.depth_cm != null) { sets.push("depth_cm = ?"); params.push(meta.depth_cm); }
    if (meta.file_size_bytes != null) { sets.push("file_size_bytes = ?"); params.push(meta.file_size_bytes); }
    if (meta.format) { sets.push("format = ?"); params.push(meta.format); }
  }
  params.push(objectId);

  db.run(
    `UPDATE scene3d_object_records SET ${sets.join(", ")} WHERE object_id = ?`,
    params,
  );
}

/** Get a single object record by object_id. */
export async function getObjectRecord(
  objectId: string,
): Promise<Record<string, unknown> | null> {
  const db = await getDb();
  const result = db.exec(
    "SELECT * FROM scene3d_object_records WHERE object_id = ?",
    [objectId],
  );
  const arr = rowsToObjects(result);
  return arr[0] ?? null;
}

/** Replace all objects for a scene (delete existing, insert new). */
export async function replaceSceneObjects(
  sceneId: string,
  objects: Array<{
    object_id: string;
    object_name?: string | null;
    status?: string;
    model_url?: string | null;
    local_path?: string | null;
    width_cm?: number | null;
    height_cm?: number | null;
    depth_cm?: number | null;
    file_size_bytes?: number | null;
    format?: string | null;
  }>,
  sessionId?: string | null,
): Promise<void> {
  const db = await getDb();
  const ts = new Date().toISOString();

  db.run("BEGIN TRANSACTION;");
  try {
    db.run("DELETE FROM scene3d_object_records WHERE scene_id = ?", [sceneId]);
    for (const obj of objects) {
      db.run(
        `INSERT INTO scene3d_object_records
           (scene_id, session_id, object_id, object_name, status, model_url, local_path, width_cm, height_cm, depth_cm, file_size_bytes, format, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          sceneId,
          sessionId ?? null,
          obj.object_id,
          obj.object_name ?? null,
          obj.status ?? "pending",
          obj.model_url ?? null,
          obj.local_path ?? null,
          obj.width_cm ?? null,
          obj.height_cm ?? null,
          obj.depth_cm ?? null,
          obj.file_size_bytes ?? null,
          obj.format ?? null,
          ts,
        ],
      );
    }
    db.run("COMMIT;");
  } catch (e) {
    db.run("ROLLBACK;");
    throw e;
  }
}
