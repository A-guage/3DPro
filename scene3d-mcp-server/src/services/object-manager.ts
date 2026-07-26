// Single-object generation lifecycle — port of scene_generator.py ModelTask logic

import { v4 as uuidv4 } from "uuid";
import { statSync } from "node:fs";
import { getProvider } from "../providers/registry.js";
import type { GenerationOptions } from "../providers/base.js";
import {
  createObjectRecord,
  updateObjectStatus,
  getObjectRecord,
} from "../db/repositories/objects.js";
import { createAsset } from "../db/repositories/assets.js";
import { ensureObjectDir, detectExt, downloadModel } from "./file-storage.js";
import { debug, warn, log as info } from "../mcp/logger.js";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Parse dimensions from description text. Matches patterns like: 120×150×120cm, 120x150x120cm, 120*150*120cm */
function parseDimensions(text: string): { w: number; h: number; d: number } | null {
  const match = text.match(/(\d+(?:\.\d+)?)\s*[×x*]\s*(\d+(?:\.\d+)?)\s*[×x*]\s*(\d+(?:\.\d+)?)\s*cm/i);
  if (!match) return null;
  return { w: parseFloat(match[1]), h: parseFloat(match[2]), d: parseFloat(match[3]) };
}

const TAG = "object-mgr";

// In-memory task tracking (mirrors OBJECT_TASKS dict in Python)
const tasks = new Map<string, ModelTask>();

export interface ModelTask {
  object_id: string;
  prompt: string;
  session_id: string | null;
  status: "processing" | "ready" | "failed";
  job_id: string | null;
  model_url: string | null;
  local_path: string | null;
  file_type: string | null;
  error_message: string | null;
}

/** Submit a new single-object generation. Returns the in-memory task. */
export async function generateObject(
  prompt: string,
  sessionId?: string | null,
  format: string = "FBX",
): Promise<ModelTask> {
  const objectId = `obj_${uuidv4().replace(/-/g, "").slice(0, 10)}`;
  const provider = getProvider();

  const validFormats = ["FBX", "GLB", "OBJ", "STL", "USDZ"];
  const resultFormat = validFormats.includes(format.toUpperCase()) ? format.toUpperCase() as GenerationOptions["result_format"] : "FBX";

  const options: GenerationOptions = {
    result_format: resultFormat,
    enable_pbr: resultFormat !== "STL",  // STL 不需要 PBR
    enable_geometry: false,
  };

  debug(TAG, `generateObject: id=${objectId} prompt="${prompt.slice(0, 60)}..." session=${sessionId ?? "none"}`);

  try {
    const { job_id } = await provider.submit(prompt, options);
    const task: ModelTask = {
      object_id: objectId,
      prompt,
      session_id: sessionId ?? null,
      status: "processing",
      job_id,
      model_url: null,
      local_path: null,
      file_type: null,
      error_message: null,
    };
    tasks.set(objectId, task);
    await createObjectRecord(sessionId ?? "", objectId, prompt.slice(0, 50), "processing");
    info(TAG, `generateObject: submitted id=${objectId} job_id=${job_id}`);
    return task;
  } catch (err: any) {
    const task: ModelTask = {
      object_id: objectId,
      prompt,
      session_id: sessionId ?? null,
      status: "failed",
      job_id: null,
      model_url: null,
      local_path: null,
      file_type: null,
      error_message: err.message ?? String(err),
    };
    tasks.set(objectId, task);
    warn(TAG, `generateObject: failed id=${objectId} error=${err.message}`);
    throw err;
  }
}

const SUCCESS_STATUSES = new Set(["DONE", "SUCCEED", "SUCCESS", "FINISHED", "COMPLETED"]);
const FAILURE_STATUSES = new Set(["FAILED", "ERROR", "CANCELED", "CANCELLED"]);

/** Refresh an object task's status from the provider. */
export async function refreshObjectTask(objectId: string): Promise<ModelTask | null> {
  let task = tasks.get(objectId);
  if (!task) {
    debug(TAG, `refreshObjectTask: ${objectId} not in memory, loading from DB`);
    // Try loading from DB
    const dbRecord = await getObjectRecord(objectId);
    if (!dbRecord) {
      debug(TAG, `refreshObjectTask: ${objectId} not found in DB either`);
      return null;
    }
    task = {
      object_id: objectId,
      prompt: (dbRecord.object_name as string) ?? "",
      session_id: (dbRecord.session_id as string) ?? null,
      status: dbRecord.status as ModelTask["status"],
      job_id: null,
      model_url: (dbRecord.model_url as string) ?? null,
      local_path: (dbRecord.local_path as string) ?? null,
      file_type: null,
      error_message: null,
    };
    tasks.set(objectId, task);
  }

  if (!task.job_id || task.status === "ready" || task.status === "failed") {
    debug(TAG, `refreshObjectTask: ${objectId} no polling needed (status=${task.status}, job_id=${task.job_id})`);
    return task;
  }

  debug(TAG, `refreshObjectTask: polling ${objectId} job_id=${task.job_id}`);
  const provider = getProvider();
  const statusData = await provider.pollStatus(task.job_id!);
  const status = statusData.status.toUpperCase();

  if (statusData.model_url) task.model_url = statusData.model_url;
  if (statusData.file_type) task.file_type = statusData.file_type;

  if (SUCCESS_STATUSES.has(status) || (statusData.model_url && !FAILURE_STATUSES.has(status))) {
    task.status = "ready";
    info(TAG, `refreshObjectTask: ${objectId} → ready (model_url=${task.model_url})`);
    // Download model file locally
    if (task.model_url && !task.local_path) {
      try { await ensureLocalModel(task); } catch (err: any) {
        warn(TAG, `refreshObjectTask: download failed for ${objectId}: ${err.message}`);
      }
    }
    await updateObjectStatus(objectId, "ready", task.model_url, task.local_path);
    // Sync to asset library (with local_path now populated)
    await syncToAssetLibrary(task);
  } else if (FAILURE_STATUSES.has(status)) {
    task.status = "failed";
    task.error_message = (statusData.raw as any)?.error_message ?? "Model generation failed";
    warn(TAG, `refreshObjectTask: ${objectId} → failed: ${task.error_message}`);
    await updateObjectStatus(objectId, "failed", task.model_url, task.local_path);
  } else {
    debug(TAG, `refreshObjectTask: ${objectId} still processing (api_status=${status})`);
  }

  return task;
}

/** Get current task (in-memory or from DB). */
export function getTask(objectId: string): ModelTask | null {
  return tasks.get(objectId) ?? null;
}

/** Ensure the model file is downloaded locally. Returns the local path or null. */
export async function ensureLocalModel(task: ModelTask): Promise<string | null> {
  if (task.local_path) return task.local_path;

  if (task.status !== "ready" || !task.model_url) {
    await refreshObjectTask(task.object_id);
    if (task.status !== "ready" || !task.model_url) return null;
  }

  const ext = detectExt(task.model_url, task.file_type);
  const dir = ensureObjectDir(task.object_id);
  const localPath = `${dir}/${task.object_id}.${ext}`;

  debug(TAG, `ensureLocalModel: downloading ${task.object_id} → ${localPath}`);
  await downloadModel(task.model_url, localPath);
  task.local_path = localPath;

  // Get file size and parse dimensions from prompt
  let fileSize: number | null = null;
  try { fileSize = statSync(localPath).size; } catch { /* ignore */ }
  const dims = parseDimensions(task.prompt);

  await updateObjectStatus(task.object_id, task.status, task.model_url, localPath, {
    width_cm: dims?.w ?? null,
    height_cm: dims?.h ?? null,
    depth_cm: dims?.d ?? null,
    file_size_bytes: fileSize,
    format: ext.toUpperCase(),
  });
  info(TAG, `ensureLocalModel: saved ${task.object_id} → ${localPath} (size=${fileSize} dims=${dims ? `${dims.w}×${dims.h}×${dims.d}cm` : "unknown"})`);
  return localPath;
}

async function syncToAssetLibrary(task: ModelTask): Promise<void> {
  const fileFormat = task.file_type
    ? task.file_type.toUpperCase().replace(/^\./, "")
    : task.local_path
      ? task.local_path.split(".").pop()?.toUpperCase()
      : null;

  const dims = parseDimensions(task.prompt);
  let fileSize: number | null = null;
  if (task.local_path) {
    try { fileSize = statSync(task.local_path).size; } catch { /* ignore */ }
  }

  debug(TAG, `syncToAssetLibrary: ${task.object_id} format=${fileFormat}`);
  await createAsset({
    asset_id: task.object_id,
    name: task.prompt.slice(0, 50) || task.object_id,
    asset_type: "model_static",
    provider: "hunyuan3d",
    description: task.prompt,
    file_format: fileFormat,
    file_size_bytes: fileSize,
    file_path: task.local_path,
    prompt: task.prompt,
    status: task.status,
    user_id: task.session_id,
    meta_json: dims ? { width_cm: dims.w, height_cm: dims.h, depth_cm: dims.d } : undefined,
  });
}
