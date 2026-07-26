// Scene generation orchestration — port of scene_generator.py SceneTask logic

import { v4 as uuidv4 } from "uuid";
import { getProvider } from "../providers/registry.js";
import type { GenerationOptions } from "../providers/base.js";
import {
  createSceneHistory,
  updateSceneStatus,
} from "../db/repositories/scenes.js";
import {
  replaceSceneObjects,
} from "../db/repositories/objects.js";
import { createAsset } from "../db/repositories/assets.js";
import { ensureSceneDir, detectExt, downloadModel } from "./file-storage.js";
import { debug, warn, log as info } from "../mcp/logger.js";

/* eslint-disable @typescript-eslint/no-explicit-any */

const TAG = "scene-mgr";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SceneObjectTask {
  object_id: string;
  description: string;
  label: string;
  estimated_size: { x: number; y: number; z: number };
  default_position: { x: number; y: number; z: number };
  priority: number;
  job_id: string | null;
  status: string;
  model_url: string | null;
  local_path: string | null;
  file_type: string | null;
}

export interface SceneCompositionObject {
  object_id: string;
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  scale: { x: number; y: number; z: number };
}

export interface SceneTask {
  scene_id: string;
  description: string;
  quality: string;
  format: string;
  status: string;
  estimated_time: number;
  model_url: string | null;
  local_path: string | null;
  objects: SceneObjectTask[];
  composition: SceneCompositionObject[] | null;
  error_message: string | null;
  progress: number;
}

// In-memory task store
const sceneTasks = new Map<string, SceneTask>();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Max concurrent generation jobs (Tencent Hunyuan 3D has a per-account limit)
const MAX_CONCURRENT_JOBS = 3;

function getRunningCount(task: SceneTask): number {
  return task.objects.filter((o) => o.status === "processing").length;
}

function getPendingObjects(task: SceneTask): SceneObjectTask[] {
  return task.objects
    .filter((o) => o.status === "pending" && o.job_id === null)
    .sort((a, b) => a.priority - b.priority);
}

/** Submit as many pending objects as possible up to MAX_CONCURRENT_JOBS. */
async function startPendingJobs(task: SceneTask): Promise<void> {
  const running = getRunningCount(task);
  const slots = MAX_CONCURRENT_JOBS - running;
  if (slots <= 0) return;

  const pending = getPendingObjects(task).slice(0, slots);
  if (pending.length === 0) return;

  const provider = getProvider();
  const enablePbr = (task.quality === "medium" || task.quality === "high") && task.format !== "STL";
  const options: GenerationOptions = {
    result_format: task.format as GenerationOptions["result_format"],
    enable_pbr: enablePbr,
    enable_geometry: false,
  };

  // Submit all in parallel
  const results = await Promise.allSettled(
    pending.map((obj) => provider.submit(obj.description, options)),
  );

  for (let i = 0; i < pending.length; i++) {
    const obj = pending[i]!;
    const result = results[i]!;
    if (result.status === "fulfilled") {
      obj.job_id = result.value.job_id;
      obj.status = "processing";
      info(TAG, `startPendingJobs: ${obj.object_id} submitted job_id=${result.value.job_id}`);
    } else {
      const msg = result.reason?.message ?? "";
      if (msg.includes("RequestLimitExceeded.JobNumExceed")) {
        debug(TAG, `startPendingJobs: ${obj.object_id} rate-limited, keeping pending`);
        obj.job_id = null;
        obj.status = "pending";
      } else {
        warn(TAG, `startPendingJobs: ${obj.object_id} failed: ${msg}`);
        obj.status = "failed";
      }
    }
  }
}

const SUCCESS_STATUSES = new Set(["DONE", "SUCCEED", "SUCCESS", "FINISHED", "COMPLETED"]);
const FAILURE_STATUSES = new Set(["FAILED", "ERROR", "CANCELED", "CANCELLED"]);

async function refreshObjectStatus(sceneId: string, obj: SceneObjectTask): Promise<void> {
  if (!obj.job_id || obj.status === "ready" || obj.status === "failed") return;

  debug(TAG, `refreshObjectStatus: scene=${sceneId} obj=${obj.object_id} job=${obj.job_id}`);
  const provider = getProvider();
  const statusData = await provider.pollStatus(obj.job_id);
  const status = statusData.status.toUpperCase();

  if (statusData.model_url) obj.model_url = statusData.model_url;
  if (statusData.file_type) obj.file_type = statusData.file_type;

  if (SUCCESS_STATUSES.has(status) || (statusData.model_url && !FAILURE_STATUSES.has(status))) {
    obj.status = "ready";
    info(TAG, `refreshObjectStatus: ${obj.object_id} → ready`);
    if (obj.model_url && !obj.local_path) {
      try { await downloadObjectModel(sceneId, obj); } catch (err: any) {
        warn(TAG, `refreshObjectStatus: download failed for ${obj.object_id}: ${err.message}`);
      }
    }
    await syncObjectToAsset(sceneId, obj);
  } else if (FAILURE_STATUSES.has(status)) {
    obj.status = "failed";
    warn(TAG, `refreshObjectStatus: ${obj.object_id} → failed (api_status=${status})`);
  } else {
    debug(TAG, `refreshObjectStatus: ${obj.object_id} still processing (api_status=${status})`);
  }
}

async function downloadObjectModel(sceneId: string, obj: SceneObjectTask): Promise<void> {
  const dir = ensureSceneDir(sceneId);
  const ext = detectExt(obj.model_url ?? "", obj.file_type);
  const localPath = `${dir}/${obj.object_id}.${ext}`;
  debug(TAG, `downloadObjectModel: ${obj.object_id} → ${localPath}`);
  await downloadModel(obj.model_url!, localPath);
  obj.local_path = localPath;
}

async function syncObjectToAsset(sceneId: string, obj: SceneObjectTask): Promise<void> {
  const fileFormat = obj.file_type
    ? obj.file_type.toUpperCase().replace(/^\./, "")
    : obj.local_path
      ? obj.local_path.split(".").pop()?.toUpperCase()
      : null;

  debug(TAG, `syncObjectToAsset: ${obj.object_id} format=${fileFormat}`);
  await createAsset({
    asset_id: obj.object_id,
    name: obj.label || obj.object_id,
    asset_type: "model_static",
    provider: "hunyuan3d",
    description: obj.description,
    file_format: fileFormat,
    file_path: obj.local_path,
    status: obj.status,
  });
}

function ensureComposition(task: SceneTask): void {
  if (task.composition !== null) return;
  task.composition = task.objects.map((obj) => ({
    object_id: obj.object_id,
    position: obj.default_position,
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
  }));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Generate a scene with multiple objects. */
export async function generateScene(opts: {
  description: string;
  quality?: string;
  format?: string;
  user_id?: string | null;
  session_id?: string | null;
  objects?: Array<Record<string, unknown>>;
}): Promise<SceneTask> {
  const quality = ["low", "medium", "high"].includes(opts.quality ?? "") ? opts.quality! : "medium";
  const validFormats = ["FBX", "GLB", "OBJ", "STL", "USDZ"];
  const format = validFormats.includes((opts.format ?? "").toUpperCase()) ? opts.format!.toUpperCase() : "FBX";
  const sceneId = uuidv4();

  info(TAG, `generateScene: scene=${sceneId} quality=${quality} format=${format} objects=${opts.objects?.length ?? 0} desc="${opts.description.slice(0, 60)}..."`);

  const sceneObjects: SceneObjectTask[] = (opts.objects ?? []).map((obj, i) => {
    const index = i + 1;
    const es = (obj.estimated_size as Record<string, number>) ?? {};
    const dp = (obj.default_position as Record<string, number>) ?? {};
    return {
      object_id: (obj.object_id as string) ?? `obj_${String(index).padStart(3, "0")}`,
      description: (obj.description as string) ?? opts.description,
      label: (obj.label as string) ?? "object.generic",
      estimated_size: { x: es.x ?? 1, y: es.y ?? 1, z: es.z ?? 1 },
      default_position: { x: dp.x ?? 0, y: dp.y ?? 0, z: dp.z ?? 0 },
      priority: (obj.priority as number) ?? index,
      job_id: null,
      status: "pending",
      model_url: null,
      local_path: null,
      file_type: null,
    };
  });

  for (const obj of sceneObjects) {
    debug(TAG, `  planned object: ${obj.object_id} label="${obj.label}" priority=${obj.priority}`);
  }

  const task: SceneTask = {
    scene_id: sceneId,
    description: opts.description,
    quality,
    format,
    status: "processing",
    estimated_time: 30,
    model_url: null,
    local_path: null,
    objects: sceneObjects,
    composition: null,
    error_message: null,
    progress: 5,
  };

  sceneTasks.set(sceneId, task);
  await createSceneHistory(sceneId, opts.user_id ?? null, opts.description, quality, opts.session_id ?? null);
  await startPendingJobs(task);
  return task;
}

/** Refresh scene status by polling all objects. */
export async function refreshSceneStatus(sceneId: string): Promise<SceneTask> {
  const task = sceneTasks.get(sceneId);
  if (!task) throw new Error("Scene not found");

  debug(TAG, `refreshSceneStatus: scene=${sceneId} current_status=${task.status}`);

  if (task.status === "ready" || task.status === "failed") {
    await updateSceneStatus(sceneId, {
      status: task.status,
      model_url: task.model_url,
      error_message: task.error_message,
    });
    return task;
  }

  const total = task.objects.length;
  if (total === 0) {
    task.status = "failed";
    task.error_message = "No objects planned for scene";
    task.progress = 0;
    warn(TAG, `refreshSceneStatus: scene=${sceneId} failed — no objects`);
    await updateSceneStatus(sceneId, { status: "failed", error_message: task.error_message });
    return task;
  }

  // Refresh all object statuses in parallel
  await Promise.all(task.objects.map((obj) => refreshObjectStatus(sceneId, obj)));

  // Save refreshed state to DB
  const objectsForHistory = task.objects.map((obj) => ({
    object_id: obj.object_id,
    object_name: obj.label,
    status: obj.status,
    model_url: obj.model_url,
    local_path: obj.local_path,
  }));
  await replaceSceneObjects(sceneId, objectsForHistory);

  // Count states after refresh
  let completed = 0;
  let hasFailed = false;
  let hasStarted = false;
  for (const obj of task.objects) {
    if (obj.status === "ready") completed++;
    if (obj.status === "failed") hasFailed = true;
    if (obj.job_id) hasStarted = true;
  }

  if (hasFailed) {
    task.status = "failed";
    task.error_message = "One or more objects failed to generate";
    task.progress = Math.floor((100 * completed) / total);
    warn(TAG, `refreshSceneStatus: scene=${sceneId} → failed (${completed}/${total} completed)`);
    await updateSceneStatus(sceneId, { status: "failed", error_message: task.error_message });
    return task;
  }

  if (completed < total) {
    // Fill available slots with more pending jobs
    await startPendingJobs(task);
    task.status = "processing";
    const base = hasStarted ? 20 : 0;
    task.progress = Math.min(90, base + Math.floor((60 * completed) / total));
    debug(TAG, `refreshSceneStatus: scene=${sceneId} processing (${completed}/${total} done, progress=${task.progress}%)`);
    await updateSceneStatus(sceneId, { status: "processing" });
    return task;
  }

  // All complete — set scene model_url to the first ready object's URL
  ensureComposition(task);
  const firstReady = task.objects.find((o) => o.status === "ready" && o.model_url);
  task.model_url = firstReady?.model_url ?? null;
  task.local_path = firstReady?.local_path ?? null;
  task.status = "ready";
  task.progress = 100;
  info(TAG, `refreshSceneStatus: scene=${sceneId} → ready (all ${total} objects completed, model_url=${task.model_url})`);
  await updateSceneStatus(sceneId, { status: "ready", model_url: task.model_url });
  return task;
}

/** Get a scene task by ID. */
export function getSceneTask(sceneId: string): SceneTask | null {
  return sceneTasks.get(sceneId) ?? null;
}
