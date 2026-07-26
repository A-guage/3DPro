/**
 * Agent 服务 - 与 piAgent 集成的聊天服务
 * 通过后端代理调用 Agent API
 */

import { API_BASE_URL } from './constants';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  timestamp?: number;
}

export interface AgentResponse {
  content: string;
  reasoning?: string;
  toolCalls?: any[];
  success: boolean;
  error?: string;
}

export interface AgentConfig {
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface ToolInfo {
  name: string;
  description: string;
  inputSchema: any;
}

/**
 * Agent 聊天服务类 - 通过后端代理调用 piAgent
 */
export class AgentChatService {
  // @ts-ignore - config 保留用于未来扩展
  private config: Required<AgentConfig>;
  private conversationHistory: ChatMessage[] = [];
  private currentStep = 0;
  private sessionId: string | null = null;
  private sceneData: {
    userRequest?: string;
    style?: string;
    plan?: any[];
    objects?: any[];
    codeRequest?: string;
  } = {};

  constructor(config: AgentConfig = {}, initialHistory: ChatMessage[] = []) {
    this.config = {
      model: config.model || 'deepseek-chat',
      temperature: config.temperature ?? 0.7,
      maxTokens: config.maxTokens ?? 4000,
    };
    this.conversationHistory = initialHistory;
  }

  /**
   * 获取当前配置
   */
  getConfig(): Required<AgentConfig> {
    return this.config;
  }

  /**
   * 初始化 Agent 会话
   */
  private async ensureSession(): Promise<string> {
    if (this.sessionId) return this.sessionId;
    
    const systemPrompt = this.getSystemPrompt();
    
    try {
      const response = await fetch(`${API_BASE_URL}/api/agent/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ systemPrompt })
      });
      
      const data = await response.json();
      if (data.success && data.sessionId) {
        this.sessionId = data.sessionId;
        return this.sessionId as string;
      }
      throw new Error('Failed to create agent session');
    } catch (error) {
      console.error('Session creation error:', error);
      throw error;
    }
  }

  /**
   * 获取系统提示词
   */
  private getSystemPrompt(): string {
    return `你是 3D 场景助手，一个专业的 AI 助手，帮助用户通过对话创建 3D 场景。

## 核心能力

你可以使用以下工具来帮助用户：

1. **generate_3d_model** - 生成单个 3D 模型
   - 输入物体名称和描述
   - 返回任务 ID 用于跟踪

2. **check_3d_model_status** - 查询模型生成状态
   - 输入任务 ID
   - 返回状态和下载 URL

3. **generate_3d_scene** - 批量生成完整场景
   - 输入场景描述
   - 自动分解为多个物体并生成

4. **get_scene_status** - 获取场景生成进度
   - 查看整体进度和各物体状态

5. **ue_integration** - 导入到 UE
   - 将生成的模型导入 UE 项目

6. **layout_scene** - 自动布局
   - 按照不同策略排列场景中的物体

## 工作流程

### 第一步：风格询问
当用户首次提出需求时，询问用户想要的风格（写实、卡通、低多边形、赛博朋克、中式园林等）。

### 第二步：方案设计
根据用户选择的风格，提出 1-2 个具体的场景方案供用户选择。

### 第三步：执行生成
用户确认方案后：
1. 使用 generate_3d_scene 或多个 generate_3d_model 创建物体
2. 轮询 check_3d_model_status 查看进度
3. 使用 layout_scene 安排布局
4. 可选使用 ue_integration 导入项目

## 输出格式

当需要输出物体列表时，使用以下格式：

@@OBJECT_LIST@@
{
  "objects": [
    { "name": "物体名称", "description": "详细描述", "priority": "high" }
  ]
}
@@OBJECT_LIST@@

## 注意事项

- 保持专业、友好的语气
- 主动使用工具帮助用户
- 及时反馈生成进度
- 遇到错误时给出清晰的解决建议`;
  }

  /**
   * 发送消息并获取 AI 回复
   */
  async sendMessage(userMessage: string): Promise<AgentResponse> {
    // 添加用户消息到历史
    this.addMessage({ role: 'user', content: userMessage });
    this.sceneData.userRequest = userMessage;

    try {
      const sessionId = await this.ensureSession();
      
      const response = await fetch(`${API_BASE_URL}/api/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          message: userMessage,
          stream: false
        })
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      
      // 添加 AI 回复到历史
      if (data.success) {
        this.addMessage({ role: 'assistant', content: data.content });
        this.currentStep++;
      }

      // 解析回复内容（保留用于未来扩展）
      this.determineStep(userMessage, data.content);
      this.extractMetadata(data.content);

      return {
        content: data.content,
        reasoning: data.reasoning,
        toolCalls: data.toolCalls,
        success: data.success,
        error: data.error
      };
    } catch (error) {
      return {
        content: '',
        success: false,
        error: error instanceof Error ? error.message : '未知错误'
      };
    }
  }

  /**
   * 添加消息到对话历史
   */
  private addMessage(message: Omit<ChatMessage, 'timestamp'>): void {
    this.conversationHistory.push({
      ...message,
      timestamp: Date.now(),
    });
  }

  /**
   * 确定当前对话步骤
   */
  private determineStep(_userMessage: string, aiResponse: string): {
    step: number;
    stepName: string;
  } {
    if (aiResponse.includes('@@CODE_REQUEST@@')) {
      return { step: 3, stepName: '自动化构建' };
    }
    if (aiResponse.includes('@@OBJECT_LIST@@') || aiResponse.includes('物体清单') || aiResponse.includes('已完成')) {
      return { step: 3, stepName: '任务拆分' };
    }
    if (aiResponse.includes('方案') || aiResponse.includes('建议')) {
      return { step: 2, stepName: '方案设计' };
    }
    return { step: 1, stepName: '风格询问' };
  }

  /**
   * 从 AI 回复中提取元数据
   */
  private extractMetadata(content: string): any {
    const metadata: any = {};

    // 提取 3D 物品列表
    const objectListMatch = content.match(/@@OBJECT_LIST@@\s*(\{[\s\S]*?\})\s*@@OBJECT_LIST@@/);
    if (objectListMatch) {
      try {
        const parsed = JSON.parse(objectListMatch[1]);
        if (parsed.objects && Array.isArray(parsed.objects)) {
          metadata.detectedObjects = parsed.objects.map((obj: any, index: number) => ({
            id: `obj-${Date.now()}-${index}`,
            name: obj.name,
            description: obj.description,
            status: 'pending',
            priority: obj.priority === 'high' ? 1 : (obj.priority === 'low' ? 3 : 2),
            category: obj.category || 'prop'
          }));
        }
      } catch (e) {
        console.error('Failed to parse object list:', e);
      }
    }

    return metadata;
  }

  /**
   * 恢复对话历史
   */
  restoreHistory(history: ChatMessage[]): void {
    this.conversationHistory = history;
    this.currentStep = history.filter(m => m.role === 'assistant').length;
  }

  /**
   * 获取对话历史
   */
  getConversationHistory(): ChatMessage[] {
    return [...this.conversationHistory];
  }

  /**
   * 重置对话
   */
  reset(): void {
    this.conversationHistory = [];
    this.currentStep = 0;
    this.sceneData = {};
    this.sessionId = null;
  }

  /**
   * 获取当前步骤
   */
  getCurrentStep(): number {
    return this.currentStep;
  }

  /**
   * 获取场景数据
   */
  getSceneData() {
    return { ...this.sceneData };
  }

  /**
   * 生成会话标题
   */
  async generateSessionTitle(): Promise<string> {
    const userMessages = this.conversationHistory.filter(m => m.role === 'user');
    if (userMessages.length === 0) return '新对话';
    return userMessages[0].content.slice(0, 10);
  }
}

/**
 * 工厂函数 - 创建 Agent 服务实例
 */
export const createAgentChatService = (config: AgentConfig = {}, initialHistory: ChatMessage[] = []) => {
  return new AgentChatService(config, initialHistory);
};

/**
 * 检查 Agent 服务是否可用
 */
export const checkAgentAvailable = async (): Promise<boolean> => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/agent/health`);
    const data = await response.json();
    return data.status === 'ok';
  } catch {
    return false;
  }
};

/**
 * 获取可用工具列表
 */
export const getAvailableTools = async (): Promise<ToolInfo[]> => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/agent/tools`);
    const data = await response.json();
    return data.tools || [];
  } catch {
    return [];
  }
};
