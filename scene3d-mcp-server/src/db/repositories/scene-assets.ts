// Scene-asset relation CRUD — mirrors history_models.py lines 981-1071

import type { SqlValue } from "sql.js";
import { getDb } from "../connection.js";

function now(): string {
  return new Date().toISOString();
}

/** Add an asset to a scene (upsert position/rotation/scale). */
export async function addAssetToScene(
  sceneId: string,
  assetId: string,
  position?: { x?: number | null; y?: number | null; z?: number | null } | null,
  rotation?: { x?: number | null; y?: number | null; z?: number | null } | null,
  scale?: { x?: number | null; y?: number | null; z?: number | null } | null,
): Promise<void> {
  const db = await getDb();
  const existing = db.exec(
    "SELECT id FROM scene3d_scene_assets WHERE scene_id = ? AND asset_id = ?",
    [sceneId, assetId],
  );

  if (existing.length && existing[0].values.length) {
    // Update existing
    const sets: string[] = [];
    const params: SqlValue[] = [];
    if (position) {
      sets.push("position_x = ?", "position_y = ?", "position_z = ?");
      params.push(position.x ?? null, position.y ?? null, position.z ?? null);
    }
    if (rotation) {
      sets.push("rotation_x = ?", "rotation_y = ?", "rotation_z = ?");
      params.push(rotation.x ?? null, rotation.y ?? null, rotation.z ?? null);
    }
    if (scale) {
      sets.push("scale_x = ?", "scale_y = ?", "scale_z = ?");
      params.push(scale.x ?? null, scale.y ?? null, scale.z ?? null);
    }
    if (sets.length) {
      params.push(sceneId, assetId);
      db.run(
        `UPDATE scene3d_scene_assets SET ${sets.join(", ")} WHERE scene_id = ? AND asset_id = ?`,
        params,
      );
    }
  } else {
    // Insert new
    db.run(
      `INSERT INTO scene3d_scene_assets
         (scene_id, asset_id, position_x, position_y, position_z,
          rotation_x, rotation_y, rotation_z, scale_x, scale_y, scale_z, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        sceneId, assetId,
        position?.x ?? null, position?.y ?? null, position?.z ?? null,
        rotation?.x ?? null, rotation?.y ?? null, rotation?.z ?? null,
        scale?.x ?? null, scale?.y ?? null, scale?.z ?? null,
        now(),
      ],
    );
  }
}

/** List all assets placed in a scene with their transforms and asset info. */
export async function getSceneAssets(sceneId: string): Promise<
  Array<{
    scene_id: string;
    asset_id: string;
    asset_name: string | null;
    asset_type: string | null;
    position: { x: number | null; y: number | null; z: number | null };
    rotation: { x: number | null; y: number | null; z: number | null };
    scale: { x: number | null; y: number | null; z: number | null };
    created_at: string | null;
  }>
> {
  const db = await getDb();
  const result = db.exec(
    "SELECT * FROM scene3d_scene_assets WHERE scene_id = ?",
    [sceneId],
  );
  if (!result.length) return [];
  const cols = result[0].columns;
  const items = result[0].values.map((row) => {
    const r: Record<string, unknown> = {};
    cols.forEach((c, i) => (r[c] = row[i]));
    return r;
  });

  // Enrich with asset name/type
  return items.map((r) => {
    const assetRes = db.exec(
      "SELECT name, asset_type FROM scene3d_assets WHERE asset_id = ?",
      [r.asset_id as string],
    );
    const assetName = assetRes.length && assetRes[0].values.length
      ? (assetRes[0].values[0][0] as string)
      : null;
    const assetType = assetRes.length && assetRes[0].values.length
      ? (assetRes[0].values[0][1] as string)
      : null;

    return {
      scene_id: r.scene_id as string,
      asset_id: r.asset_id as string,
      asset_name: assetName,
      asset_type: assetType,
      position: { x: r.position_x as number | null, y: r.position_y as number | null, z: r.position_z as number | null },
      rotation: { x: r.rotation_x as number | null, y: r.rotation_y as number | null, z: r.rotation_z as number | null },
      scale: { x: r.scale_x as number | null, y: r.scale_y as number | null, z: r.scale_z as number | null },
      created_at: (r.created_at as string) ?? null,
    };
  });
}

/** Remove an asset from a scene. */
export async function removeAssetFromScene(
  sceneId: string,
  assetId: string,
): Promise<boolean> {
  const db = await getDb();
  const existing = db.exec(
    "SELECT id FROM scene3d_scene_assets WHERE scene_id = ? AND asset_id = ?",
    [sceneId, assetId],
  );
  if (!existing.length || !existing[0].values.length) return false;
  db.run(
    "DELETE FROM scene3d_scene_assets WHERE scene_id = ? AND asset_id = ?",
    [sceneId, assetId],
  );
  return true;
}
