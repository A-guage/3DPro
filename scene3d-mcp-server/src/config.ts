import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import YAML from "yaml";
import { debug } from "./mcp/logger.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// --- Interfaces ---

export interface HunyuanConfig {
  secretId: string;
  secretKey: string;
  region: string;
  endpoint: string;
  version: string;
  createAction: string;
  statusAction: string;
}

export interface ProviderConfig {
  hunyuan?: HunyuanConfig;
  tripo?: { apiKey: string; baseUrl: string };
  meshy?: { apiKey: string; baseUrl: string };
}

export interface Scene3DConfig {
  provider: string;
  storageDir: string;
  databasePath: string;
  httpPort: number;
}

export interface PolyPizzaLibConfig {
  enabled: boolean;
  base_url: string;
  api_key?: string;
}

export interface ModelLibrariesConfig {
  poly_pizza?: PolyPizzaLibConfig;
}

export interface Config {
  scene3d: Scene3DConfig;
  providers: ProviderConfig;
  model_libraries?: ModelLibrariesConfig;
}

// --- Helpers ---

function resolveEnvVar(value: string): string {
  if (typeof value === "string" && value.startsWith("$")) {
    const envKey = value.slice(1);
    return process.env[envKey] ?? "";
  }
  return value;
}

function resolveEnvVars(obj: unknown): unknown {
  if (typeof obj === "string") return resolveEnvVar(obj);
  if (Array.isArray(obj)) return obj.map(resolveEnvVars);
  if (obj && typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      result[k] = resolveEnvVars(v);
    }
    return result;
  }
  return obj;
}

function findConfigPath(): string {
  // 1. Explicit env var
  const envPath = process.env.DEERFLOW_SCENE3D_CONFIG;
  if (envPath && existsSync(envPath)) return resolve(envPath);

  // 2. config.yaml in CWD
  const cwdPath = resolve(process.cwd(), "config.yaml");
  if (existsSync(cwdPath)) return cwdPath;

  // 3. config.yaml next to this file (project root)
  const projectPath = resolve(__dirname, "..", "config.yaml");
  if (existsSync(projectPath)) return resolve(projectPath);

  throw new Error(
    "config.yaml not found. Copy config.example.yaml to config.yaml and fill in your values."
  );
}

// --- Loader ---

let cachedConfig: Config | null = null;

export function loadConfig(): Config {
  if (cachedConfig) return cachedConfig;

  // Load .env file from project root
  const projectRoot = resolve(__dirname, "..");
  const envPath = resolve(projectRoot, ".env");
  if (existsSync(envPath)) {
    dotenv.config({ path: envPath });
    debug("config", `Loaded .env from: ${envPath}`);
  }

  const configPath = findConfigPath();
  debug("config", `Loading config from: ${configPath}`);

  const raw = readFileSync(configPath, "utf-8");
  const parsed = YAML.parse(raw);
  const resolved = resolveEnvVars(parsed) as Record<string, unknown>;

  const scene3d = (resolved.scene3d ?? {}) as Record<string, unknown>;
  const providers = (resolved.providers ?? {}) as Record<string, unknown>;

  // Map hunyuan YAML keys (snake_case) → HunyuanConfig (camelCase)
  const hunyuanRaw = (providers.hunyuan ?? {}) as Record<string, unknown>;
  const hunyuan: HunyuanConfig | undefined = hunyuanRaw.secret_id
    ? {
        secretId: hunyuanRaw.secret_id as string,
        secretKey: hunyuanRaw.secret_key as string,
        region: (hunyuanRaw.region as string) ?? "ap-guangzhou",
        endpoint: (hunyuanRaw.endpoint as string) ?? "ai3d.tencentcloudapi.com",
        version: (hunyuanRaw.version as string) ?? "2025-05-13",
        createAction: (hunyuanRaw.create_action as string) ?? "SubmitHunyuanTo3DRapidJob",
        statusAction: (hunyuanRaw.status_action as string) ?? "QueryHunyuanTo3DRapidJob",
      }
    : undefined;

  if (hunyuan) {
    debug("config", `Hunyuan provider: endpoint=${hunyuan.endpoint} region=${hunyuan.region} version=${hunyuan.version}`);
    debug("config", `Hunyuan actions: create=${hunyuan.createAction} status=${hunyuan.statusAction}`);
    debug("config", `Hunyuan credentials: secretId=${hunyuan.secretId.slice(0, 6)}... secretKey=${hunyuan.secretKey.slice(0, 4)}...`);
  } else {
    debug("config", "No hunyuan provider configured");
  }

  // Parse model_libraries config
  const mlRaw = (resolved.model_libraries ?? {}) as Record<string, unknown>;
  const polyPizzaRaw = (mlRaw.poly_pizza ?? {}) as Record<string, unknown>;
  const polyPizza: PolyPizzaLibConfig | undefined = polyPizzaRaw.enabled
    ? {
        enabled: polyPizzaRaw.enabled as boolean,
        base_url: (polyPizzaRaw.base_url as string) ?? "https://api.poly.pizza/v1.1",
        api_key: resolveEnvVar((polyPizzaRaw.api_key as string) ?? "") || undefined,
      }
    : undefined;

  cachedConfig = {
    scene3d: {
      provider: (scene3d.provider as string) ?? "hunyuan",
      storageDir: resolve(
        dirname(configPath),
        (scene3d.storage_dir as string) ?? "./storage"
      ),
      databasePath: resolve(
        dirname(configPath),
        (scene3d.database_path as string) ?? "./drizzle/scene3d.db"
      ),
      httpPort: (scene3d.http_port as number) ?? 3020,
    },
    providers: { hunyuan },
    model_libraries: polyPizza ? { poly_pizza: polyPizza } : undefined,
  };

  debug("config", `Storage: ${cachedConfig.scene3d.storageDir}`);
  debug("config", `Database: ${cachedConfig.scene3d.databasePath}`);
  debug("config", `Provider: ${cachedConfig.scene3d.provider}`);

  return cachedConfig;
}
