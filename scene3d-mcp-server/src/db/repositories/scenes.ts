// Scene history CRUD — mirrors history_models.py lines 385-466

import type { SqlValue } from "sql.js";
import { getDb } from "../connection.js";

export interface SceneHistory {
  id: number;
  scene_id: string;
  session_id: string | null;
  user_id: string | null;
  description: string;
  quality: string;
  status: string;
  model_url: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

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

/** Create a new scene history record (no-op if scene_id already exists). */
export async function createSceneHistory(
  sceneId: string,
  userId: string | null,
  description: string,
  quality: string,
  sessionId?: string | null,
): Promise<void> {
  const db = await getDb();
  const existing = db.exec(
    "SELECT id FROM scene3d_scene_history WHERE scene_id = ?",
    [sceneId],
  );
  if (existing.length && existing[0].values.length) return;

  const ts = now();
  db.run(
    `INSERT INTO scene3d_scene_history
       (scene_id, session_id, user_id, description, quality, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'processing', ?, ?)`,
    [sceneId, sessionId ?? null, userId, description, quality, ts, ts],
  );
}

/** Update status / model_url / error_message for a scene. */
export async function updateSceneStatus(
  sceneId: string,
  opts: {
    status?: string | null;
    model_url?: string | null;
    error_message?: string | null;
  },
): Promise<void> {
  const db = await getDb();
  const existing = db.exec(
    "SELECT id FROM scene3d_scene_history WHERE scene_id = ?",
    [sceneId],
  );
  if (!existing.length || !existing[0].values.length) return;

  const sets: string[] = [];
  const params: SqlValue[] = [];

  if (opts.status != null) {
    sets.push("status = ?");
    params.push(opts.status);
  }
  if (opts.model_url != null) {
    sets.push("model_url = ?");
    params.push(opts.model_url);
  }
  if (opts.error_message != null) {
    sets.push("error_message = ?");
    params.push(opts.error_message);
  }

  if (sets.length === 0) return;

  sets.push("updated_at = ?");
  params.push(now());
  params.push(sceneId);

  db.run(
    `UPDATE scene3d_scene_history SET ${sets.join(", ")} WHERE scene_id = ?`,
    params,
  );
}

/** List scenes for a user, newest first. */
export async function getHistoryList(
  userId: string,
  limit = 20,
): Promise<Record<string, unknown>[]> {
  const db = await getDb();
  const result = db.exec(
    `SELECT * FROM scene3d_scene_history
     WHERE user_id = ?
     ORDER BY created_at DESC
     LIMIT ?`,
    [userId, limit],
  );
  return rowsToObjects(result);
}

/** Get a scene detail with its objects. */
export async function getHistoryDetail(sceneId: string): Promise<{
  history: Record<string, unknown> | null;
  objects: Record<string, unknown>[];
}> {
  const db = await getDb();

  const histRes = db.exec(
    "SELECT * FROM scene3d_scene_history WHERE scene_id = ?",
    [sceneId],
  );
  const historyArr = rowsToObjects(histRes);

  const objRes = db.exec(
    "SELECT * FROM scene3d_object_records WHERE scene_id = ?",
    [sceneId],
  );
  const objects = rowsToObjects(objRes);

  return { history: historyArr[0] ?? null, objects };
}
