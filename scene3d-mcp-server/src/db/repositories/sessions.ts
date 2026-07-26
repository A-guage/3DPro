// Chat session CRUD — mirrors history_models.py lines 261-377

import { getDb } from "../connection.js";

export interface ChatSession {
  id: number;
  session_id: string;
  user_id: string | null;
  title: string;
  messages_json: string;
  created_at: string;
  updated_at: string;
}

function now(): string {
  return new Date().toISOString();
}

/** Insert or update a chat session (upsert on session_id). */
export async function saveChatSession(
  sessionId: string,
  userId: string | null,
  title: string,
  messages: unknown[],
): Promise<void> {
  const db = await getDb();
  const ts = now();
  const msgJson = JSON.stringify(messages);

  const existing = db.exec(
    "SELECT id FROM scene3d_chat_sessions WHERE session_id = ?",
    [sessionId],
  );

  if (existing.length && existing[0].values.length) {
    db.run(
      `UPDATE scene3d_chat_sessions
       SET title = ?, messages_json = ?, updated_at = ?
       WHERE session_id = ?`,
      [title, msgJson, ts, sessionId],
    );
  } else {
    db.run(
      `INSERT INTO scene3d_chat_sessions
         (session_id, user_id, title, messages_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [sessionId, userId, title, msgJson, ts, ts],
    );
  }
}

/** List sessions for a user, most-recently-updated first. */
export async function getChatSessions(
  userId: string,
  limit = 20,
): Promise<ChatSession[]> {
  const db = await getDb();
  const result = db.exec(
    `SELECT id, session_id, user_id, title, messages_json, created_at, updated_at
     FROM scene3d_chat_sessions
     WHERE user_id = ?
     ORDER BY updated_at DESC
     LIMIT ?`,
    [userId, limit],
  );
  if (!result.length) return [];
  const cols = result[0].columns;
  return result[0].values.map((row) => {
    const obj: Record<string, unknown> = {};
    cols.forEach((c, i) => (obj[c] = row[i]));
    return obj as unknown as ChatSession;
  });
}

/** Get full session detail including associated scenes and objects. */
export async function getSessionDetail(sessionId: string): Promise<{
  session: {
    session_id: string;
    title: string;
    messages: unknown[];
    created_at: string | null;
    updated_at: string | null;
  } | null;
  scenes: Record<string, unknown>[];
  objects: Record<string, unknown>[];
}> {
  const db = await getDb();

  // Session row
  const chatRes = db.exec(
    `SELECT session_id, title, messages_json, created_at, updated_at
     FROM scene3d_chat_sessions WHERE session_id = ?`,
    [sessionId],
  );

  let sessionPayload: {
    session_id: string;
    title: string;
    messages: unknown[];
    created_at: string | null;
    updated_at: string | null;
  } | null = null;

  if (chatRes.length && chatRes[0].values.length) {
    const row = chatRes[0].values[0];
    const cols = chatRes[0].columns;
    const obj: Record<string, unknown> = {};
    cols.forEach((c, i) => (obj[c] = row[i]));
    let messages: unknown[] = [];
    try {
      messages = JSON.parse(obj.messages_json as string) as unknown[];
    } catch {
      messages = [];
    }
    sessionPayload = {
      session_id: obj.session_id as string,
      title: obj.title as string,
      messages,
      created_at: (obj.created_at as string) ?? null,
      updated_at: (obj.updated_at as string) ?? null,
    };
  }

  // Scenes
  const scenesRes = db.exec(
    `SELECT * FROM scene3d_scene_history WHERE session_id = ?`,
    [sessionId],
  );
  const scenes = rowsToObjects(scenesRes);

  // Objects
  const objectsRes = db.exec(
    `SELECT * FROM scene3d_object_records WHERE session_id = ?`,
    [sessionId],
  );
  const objects = rowsToObjects(objectsRes);

  return { session: sessionPayload, scenes, objects };
}

/** Delete a session and its associated scenes & objects. */
export async function deleteChatSession(sessionId: string): Promise<boolean> {
  const db = await getDb();
  const existing = db.exec(
    "SELECT id FROM scene3d_chat_sessions WHERE session_id = ?",
    [sessionId],
  );
  if (!existing.length || !existing[0].values.length) return false;

  db.run("BEGIN TRANSACTION;");
  try {
    db.run("DELETE FROM scene3d_object_records WHERE session_id = ?", [sessionId]);
    db.run("DELETE FROM scene3d_scene_history WHERE session_id = ?", [sessionId]);
    db.run("DELETE FROM scene3d_chat_sessions WHERE session_id = ?", [sessionId]);
    db.run("COMMIT;");
  } catch (e) {
    db.run("ROLLBACK;");
    throw e;
  }
  return true;
}

/** Rename a session. */
export async function renameChatSession(
  sessionId: string,
  newTitle: string,
): Promise<boolean> {
  const db = await getDb();
  const cleaned = newTitle?.trim() || "新对话";
  const existing = db.exec(
    "SELECT id FROM scene3d_chat_sessions WHERE session_id = ?",
    [sessionId],
  );
  if (!existing.length || !existing[0].values.length) return false;

  db.run(
    `UPDATE scene3d_chat_sessions SET title = ?, updated_at = ? WHERE session_id = ?`,
    [cleaned, now(), sessionId],
  );
  return true;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
