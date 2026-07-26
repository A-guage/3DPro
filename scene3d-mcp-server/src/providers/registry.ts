// Provider registry — factory that returns the configured provider backend

import { loadConfig } from "../config.js";
import type { Base3DProvider } from "./base.js";
import { HunyuanProvider } from "./hunyuan.js";

// Cache the instantiated provider
let cachedProvider: Base3DProvider | null = null;

/**
 * Get the 3D generation provider configured in config.yaml.
 * Caches the instance; call `resetProvider()` if config changes at runtime.
 */
export function getProvider(): Base3DProvider {
  if (cachedProvider) return cachedProvider;

  const config = loadConfig();
  switch (config.scene3d.provider) {
    case "hunyuan":
      cachedProvider = new HunyuanProvider();
      break;
    // case "tripo":
    //   cachedProvider = new TripoProvider();
    //   break;
    // case "meshy":
    //   cachedProvider = new MeshyProvider();
    //   break;
    default:
      throw new Error(
        `Unknown 3D provider: "${config.scene3d.provider}". ` +
        `Supported: hunyuan, tripo, meshy`,
      );
  }

  return cachedProvider;
}

/** Force re-creation of the provider instance (e.g. after config reload). */
export function resetProvider(): void {
  cachedProvider = null;
}
