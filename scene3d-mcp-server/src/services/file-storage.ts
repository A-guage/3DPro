// File storage — download models, manage storage directories

import { existsSync, mkdirSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, extname, dirname } from "node:path";
import { loadConfig } from "../config.js";
import { getProvider } from "../providers/registry.js";

function storageRoot(): string {
  return loadConfig().scene3d.storageDir;
}

/** Ensure a scene's model directory exists and return its path. */
export function ensureSceneDir(sceneId: string): string {
  const dir = join(storageRoot(), "scenes", sceneId, "models");
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Ensure an object's directory exists and return its path. */
export function ensureObjectDir(objectId: string): string {
  const dir = join(storageRoot(), "objects", objectId);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Detect file extension from URL or file_type. */
export function detectExt(url: string, fileType?: string | null): string {
  if (fileType) {
    const candidate = fileType.toLowerCase().replace(/^\./, "");
    if (["glb", "gltf", "fbx", "obj", "stl", "usdz"].includes(candidate)) return candidate;
  }
  if (url) {
    const clean = url.toLowerCase().split("?")[0];
    for (const ext of ["fbx", "glb", "gltf", "obj", "stl", "usdz"]) {
      if (clean.endsWith("." + ext)) return ext;
    }
  }
  return "fbx";
}

/** Download a model from URL to a local path. */
export async function downloadModel(modelUrl: string, destPath: string): Promise<void> {
  const provider = getProvider();
  await provider.download(modelUrl, destPath);
}

/** Find a 3D model file in a directory. */
export function findModelInDir(dir: string): string | null {
  if (!existsSync(dir)) return null;
  const exts = [".glb", ".fbx", ".obj", ".stl", ".usdz"];
  for (const name of readdirSync(dir)) {
    const fullPath = join(dir, name);
    if (exts.some((e) => name.toLowerCase().endsWith(e)) && statSync(fullPath).isFile()) {
      return fullPath;
    }
  }
  return null;
}

/** Media type for model file extensions. */
export function getMediaType(ext: string): string {
  const map: Record<string, string> = {
    glb: "model/gltf-binary",
    fbx: "model/fbx",
    obj: "model/obj",
    stl: "model/stl",
    usdz: "model/vnd.usdz+zip",
  };
  return map[ext.toLowerCase().replace(/^\./, "")] ?? "application/octet-stream";
}
