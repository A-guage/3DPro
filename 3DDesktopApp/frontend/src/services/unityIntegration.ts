/**
 * @deprecated 此文件已废弃，请使用 engineIntegration.ts
 * 此文件保留仅为向后兼容，所有实现已迁移到 engineIntegration.ts
 */

export {
  EngineIntegrationService as UnityIntegrationService,
  getEngineIntegration as getUnityIntegration,
  importSceneToEngine as importSceneToUnity,
  type EngineIntegrationConfig as UnityIntegrationConfig,
  type ImportSceneRequest,
  type ImportSceneResponse,
} from './engineIntegration';

// 兼容的 ConversationMessage 等类型
export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: number;
  metadata?: Record<string, any>;
}

export interface StartConversationResponse {
  conversationId: string;
  enginePath?: string;
  unityPath?: string; // 兼容旧名称
}

export interface ProcessMessageResponse {
  intent: string;
  confidence: number;
  response: string;
  generatedScripts?: string[];
}

/**
 * 生成场景脚本描述
 */
export function generateScriptPrompt(sceneDescription: string, quality: string): string {
  return `为以下 3D 场景生成 UE 控制脚本：

场景描述：${sceneDescription}
生成质量：${quality}

请生成：
1. 场景控制器脚本 (Python Editor Scripting) - 管理场景中的所有对象
2. 对象行为脚本 - 为主要对象添加交互功能
3. 场景配置文件 - 定义场景的环境和光照设置`;
}
