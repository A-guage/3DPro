/**
 * Engine (UE) 集成服务
 * 负责与 UE 插件的通信
 */

const ENGINE_PLUGIN_BASE_URL = 'http://localhost:3030';

export interface EngineIntegrationConfig {
  pluginUrl?: string;
  autoImport?: boolean;
  generateScripts?: boolean;
}

export interface ImportSceneRequest {
  fileName: string;
  fileData: string; // Base64
  enginePath?: string;
  autoRefresh?: boolean;
}

export interface ImportSceneResponse {
  success: boolean;
  filePath?: string;
  message?: string;
  error?: string;
}

/**
 * Engine 集成服务类
 */
export class EngineIntegrationService {
  private baseUrl: string;
  private config: Required<EngineIntegrationConfig>;

  constructor(config: EngineIntegrationConfig = {}) {
    this.baseUrl = config.pluginUrl || ENGINE_PLUGIN_BASE_URL;
    this.config = {
      pluginUrl: config.pluginUrl || ENGINE_PLUGIN_BASE_URL,
      autoImport: config.autoImport ?? true,
      generateScripts: config.generateScripts ?? true,
    };
  }

  /**
   * 导入场景到 UE
   */
  async importScene(request: ImportSceneRequest): Promise<ImportSceneResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/api/import-scene`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fileName: request.fileName,
          fileData: request.fileData,
          enginePath: request.enginePath,
          autoRefresh: request.autoRefresh ?? true,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return {
        success: true,
        filePath: data.filePath,
        message: data.message,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * 从 URL 导入场景到 UE
   */
  async importSceneFromUrl(
    sceneUrl: string,
    sceneId: string,
    enginePath?: string
  ): Promise<ImportSceneResponse> {
    try {
      const response = await fetch(sceneUrl);
      if (!response.ok) {
        throw new Error(`Failed to download scene: ${response.statusText}`);
      }

      const blob = await response.blob();
      const arrayBuffer = await blob.arrayBuffer();
      const base64 = btoa(
        String.fromCharCode(...new Uint8Array(arrayBuffer))
      );

      return this.importScene({
        fileName: `scene_${sceneId}.glb`,
        fileData: base64,
        enginePath,
        autoRefresh: true,
      });
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * 检查插件是否可用
   */
  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(1000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<EngineIntegrationConfig>): void {
    this.config = {
      ...this.config,
      ...config,
    };
  }
}

// 创建单例实例
let engineIntegrationInstance: EngineIntegrationService | null = null;

/**
 * 获取 Engine 集成服务单例
 */
export function getEngineIntegration(
  config?: EngineIntegrationConfig
): EngineIntegrationService {
  if (!engineIntegrationInstance || config) {
    engineIntegrationInstance = new EngineIntegrationService(config);
  }
  return engineIntegrationInstance;
}

// === 兼容旧接口 ===
export type UnityIntegrationConfig = EngineIntegrationConfig;
export type UnityImportSceneRequest = ImportSceneRequest;
export type UnityImportSceneResponse = ImportSceneResponse;
export type ConversationMessage = {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: number;
  metadata?: Record<string, any>;
};
export type StartConversationResponse = {
  conversationId: string;
  enginePath?: string;
};
export type ProcessMessageResponse = {
  intent: string;
  confidence: number;
  response: string;
  generatedScripts?: string[];
};

/**
 * @deprecated 使用 getEngineIntegration 替代
 */
export function getUnityIntegration(
  config?: EngineIntegrationConfig
): EngineIntegrationService {
  return getEngineIntegration(config);
}

/**
 * 便捷方法：直接导入场景
 */
export async function importSceneToEngine(
  sceneUrl: string,
  sceneId: string,
  enginePath?: string
): Promise<ImportSceneResponse> {
  const service = getEngineIntegration();
  return service.importSceneFromUrl(sceneUrl, sceneId, enginePath);
}

/**
 * @deprecated 使用 importSceneToEngine 替代
 */
export async function importSceneToUnity(
  sceneUrl: string,
  sceneId: string,
  unityPath?: string
): Promise<ImportSceneResponse> {
  return importSceneToEngine(sceneUrl, sceneId, unityPath);
}
