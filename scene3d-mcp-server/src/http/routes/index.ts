// HTTP routes — all /api/scene3d/* endpoints

import { Router, type Request, type Response } from "express";
import { generateObject, refreshObjectTask, getTask, ensureLocalModel } from "../../services/object-manager.js";
import { generateScene, refreshSceneStatus, getSceneTask } from "../../services/scene-manager.js";
import { getHistoryList, getHistoryDetail } from "../../db/repositories/scenes.js";
import { getSessionDetail, getChatSessions, saveChatSession, deleteChatSession, renameChatSession } from "../../db/repositories/sessions.js";
import {
  createAsset, updateAsset, getAsset, listAssets, deleteAsset, incrementDownload,
  createCategory, getCategories, updateCategory, deleteCategory,
  createTag, getTags, deleteTag,
} from "../../db/repositories/assets.js";
import { addAssetToScene, getSceneAssets, removeAssetFromScene } from "../../db/repositories/scene-assets.js";

const router = Router();

// Express 5: req.params values may be string | string[]
function p(req: Request, key: string): string {
  const v = req.params[key];
  return Array.isArray(v) ? v[0] : (v ?? "");
}

// ---------------------------------------------------------------------------
// Scene generation
// ---------------------------------------------------------------------------

router.post("/scenes", async (req: Request, res: Response) => {
  try {
    const task = await generateScene({
      description: req.body.description,
      quality: req.body.quality,
      user_id: req.body.user_id,
      session_id: req.body.session_id,
      objects: req.body.objects,
    });
    res.json(task);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

router.get("/scenes/:sceneId", async (req: Request, res: Response) => {
  try {
    const task = await refreshSceneStatus(p(req, "sceneId"));
    res.json(task);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(404).json({ error: msg });
  }
});

// ---------------------------------------------------------------------------
// Object generation
// ---------------------------------------------------------------------------

router.post("/objects", async (req: Request, res: Response) => {
  try {
    const task = await generateObject(req.body.prompt, req.body.session_id);
    res.json(task);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

router.get("/objects/:objectId", async (req: Request, res: Response) => {
  try {
    const task = await refreshObjectTask(p(req, "objectId"));
    if (!task) { res.status(404).json({ error: "Object not found" }); return; }
    res.json(task);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

router.get("/objects/:objectId/file", async (req: Request, res: Response) => {
  try {
    const task = await refreshObjectTask(p(req, "objectId"));
    if (!task) { res.status(404).json({ error: "Object not found" }); return; }

    // Ensure model is downloaded locally
    const localPath = await ensureLocalModel(task);
    if (!localPath) { res.status(404).json({ error: "Model file not available" }); return; }

    const { createReadStream, existsSync } = await import("node:fs");
    const { extname } = await import("node:path");
    if (!existsSync(localPath)) { res.status(404).json({ error: "File not found on disk" }); return; }

    const ext = extname(localPath).toLowerCase().replace(".", "");
    const { getMediaType } = await import("../../services/file-storage.js");
    res.setHeader("Content-Type", getMediaType(ext));
    res.setHeader("Content-Disposition", `inline; filename="${p(req, "objectId")}.${ext}"`);
    const stream = createReadStream(localPath);
    stream.on("error", (err) => {
      console.error(`[routes] stream error for ${localPath}:`, err.message);
      if (!res.headersSent) {
        res.status(500).json({ error: "Failed to read file" });
      } else {
        res.end();
      }
    });
    stream.pipe(res);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

router.get("/history", async (req: Request, res: Response) => {
  const userId = (req.query.user_id as string) ?? "default";
  const limit = parseInt(req.query.limit as string) || 20;
  const items = await getHistoryList(userId, limit);
  res.json({ items, count: items.length });
});

router.get("/history/:sceneId", async (req: Request, res: Response) => {
  const detail = await getHistoryDetail(p(req, "sceneId"));
  res.json(detail);
});

// ---------------------------------------------------------------------------
// Chat sessions
// ---------------------------------------------------------------------------

router.get("/sessions", async (req: Request, res: Response) => {
  const userId = (req.query.user_id as string) ?? "default";
  const items = await getChatSessions(userId);
  res.json({ sessions: items });
});

router.get("/sessions/:sessionId", async (req: Request, res: Response) => {
  const detail = await getSessionDetail(p(req, "sessionId"));
  res.json(detail);
});

router.post("/sessions/:sessionId", async (req: Request, res: Response) => {
  await saveChatSession(p(req, "sessionId"), req.body.user_id, req.body.title, req.body.messages ?? []);
  res.json({ success: true });
});

router.delete("/sessions/:sessionId", async (req: Request, res: Response) => {
  const ok = await deleteChatSession(p(req, "sessionId"));
  res.json({ success: ok });
});

router.put("/sessions/:sessionId/rename", async (req: Request, res: Response) => {
  const ok = await renameChatSession(p(req, "sessionId"), req.body.title);
  res.json({ success: ok });
});

// ---------------------------------------------------------------------------
// Assets
// ---------------------------------------------------------------------------

router.post("/assets", async (req: Request, res: Response) => {
  const result = await createAsset(req.body);
  res.json(result);
});

router.get("/assets", async (req: Request, res: Response) => {
  const result = await listAssets({
    user_id: (req.query.user_id as string) ?? null,
    asset_type: (req.query.asset_type as string) ?? null,
    category_id: req.query.category_id ? parseInt(req.query.category_id as string) : null,
    keyword: (req.query.keyword as string) ?? null,
    tag_id: req.query.tag_id ? parseInt(req.query.tag_id as string) : null,
    status: (req.query.status as string) ?? null,
    offset: parseInt(req.query.offset as string) || 0,
    limit: parseInt(req.query.limit as string) || 20,
  });
  res.json(result);
});

router.get("/assets/:assetId", async (req: Request, res: Response) => {
  const asset = await getAsset(p(req, "assetId"));
  if (!asset) { res.status(404).json({ error: "Not found" }); return; }
  res.json(asset);
});

router.put("/assets/:assetId", async (req: Request, res: Response) => {
  const allowed = ["name","description","asset_type","provider","file_format","file_path","category_id","status","version"];
  const input: Record<string, unknown> = {};
  for (const k of allowed) {
    if (req.body[k] !== undefined) input[k] = req.body[k];
  }
  const ok = await updateAsset(p(req, "assetId"), input);
  res.json({ success: ok });
});

router.delete("/assets/:assetId", async (req: Request, res: Response) => {
  const ok = await deleteAsset(p(req, "assetId"));
  res.json({ success: ok });
});

router.post("/assets/:assetId/download", async (req: Request, res: Response) => {
  await incrementDownload(p(req, "assetId"));
  res.json({ success: true });
});

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

router.post("/categories", async (req: Request, res: Response) => {
  const result = await createCategory(req.body.name, req.body.parent_id, req.body.icon, req.body.sort_order);
  res.json(result);
});

router.get("/categories", async (_req: Request, res: Response) => {
  const result = await getCategories();
  res.json(result);
});

router.put("/categories/:id", async (req: Request, res: Response) => {
  const ok = await updateCategory(parseInt(p(req, "id")), req.body);
  res.json({ success: ok });
});

router.delete("/categories/:id", async (req: Request, res: Response) => {
  const ok = await deleteCategory(parseInt(p(req, "id")));
  res.json({ success: ok });
});

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------

router.post("/tags", async (req: Request, res: Response) => {
  const result = await createTag(req.body.name, req.body.color);
  res.json(result);
});

router.get("/tags", async (_req: Request, res: Response) => {
  const result = await getTags();
  res.json(result);
});

router.delete("/tags/:id", async (req: Request, res: Response) => {
  const ok = await deleteTag(parseInt(p(req, "id")));
  res.json({ success: ok });
});

// ---------------------------------------------------------------------------
// Scene assets
// ---------------------------------------------------------------------------

router.post("/scene-assets", async (req: Request, res: Response) => {
  await addAssetToScene(req.body.scene_id, req.body.asset_id, req.body.position, req.body.rotation, req.body.scale);
  res.json({ success: true });
});

router.get("/scene-assets/:sceneId", async (req: Request, res: Response) => {
  const items = await getSceneAssets(p(req, "sceneId"));
  res.json({ items });
});

router.delete("/scene-assets/:sceneId/:assetId", async (req: Request, res: Response) => {
  const ok = await removeAssetFromScene(p(req, "sceneId"), p(req, "assetId"));
  res.json({ success: ok });
});

// ---------------------------------------------------------------------------
// Model library (Poly.pizza search & import)
// ---------------------------------------------------------------------------

router.get("/models/search", async (req: Request, res: Response) => {
  try {
    const { searchModels } = await import("../../services/model-library.js");
    const result = await searchModels({
      keyword: (req.query.keyword as string) || undefined,
      category: req.query.category ? parseInt(req.query.category as string) : undefined,
      license: (req.query.license as string) || undefined,
      animated: req.query.animated ? req.query.animated === "true" : undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string) : 10,
      page: req.query.page ? parseInt(req.query.page as string) : 1,
    });
    res.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

router.post("/models/import", async (req: Request, res: Response) => {
  try {
    const { importModel } = await import("../../services/model-library.js");
    const result = await importModel({
      url: req.body.url,
      name: req.body.name,
      description: req.body.description,
      category: req.body.category,
      tags: req.body.tags,
      source: req.body.source,
      source_id: req.body.source_id,
      source_url: req.body.source_url,
      thumbnail_url: req.body.thumbnail_url,
      author: req.body.author,
      license: req.body.license,
      width_cm: req.body.width_cm,
      height_cm: req.body.height_cm,
      depth_cm: req.body.depth_cm,
    });
    res.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

export default router;
