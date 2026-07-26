/**
 * DeepSeek 聊天服务 - 通过后端代理调用
 * 处理与 DeepSeek API 的对话交互，实现三步工作流
 */

import { API_BASE_URL } from './constants';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  timestamp?: number;
}

export interface DeepSeekResponse {
  content: string;
  reasoning?: string;
  step: number;
  stepName: string;
  isComplete: boolean;
  metadata?: {
    style?: string;
    plan?: any[];
    objects?: any[];
    codeRequest?: string;
    detectedObjects?: any[];
  };
}

export interface DeepSeekConfig {
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

/**
 * DeepSeek 聊天服务类 - 通过后端代理
 */
export class DeepSeekChatService {
  private config: Required<DeepSeekConfig>;
  private conversationHistory: ChatMessage[] = [];
  private currentStep = 0;
  private sceneData: {
    userRequest?: string;
    style?: string;
    plan?: any[];
    objects?: any[];
    codeRequest?: string;
  } = {};

  constructor(config: DeepSeekConfig = {}, initialHistory: ChatMessage[] = []) {
    this.config = {
      model: config.model || 'deepseek-chat',
      temperature: config.temperature ?? 0.7,
      maxTokens: config.maxTokens ?? 4000,
    };
    this.conversationHistory = initialHistory;
  }

  /**
   * 获取系统提示词（AI 身份定义）
   */
  private getSystemPrompt(): string {
    const codeRequestMarker = '@@CODE_REQUEST@@';
    const objectListMarker = '@@OBJECT_LIST@@';

    return `默认：你是一个3D生成网页的与用户交流的对话助手，协助用户通过三个步骤完成场景创建和优化。

## 你的身份和职责
- 你是专业的3D场景设计助手，熟练使用DeepSeek的深度思考能力来辅助用户。
- 用户首先提出需求，你的任务是分三步引导并实现。
- 你必须严格遵循三个对话步骤的顺序，不要跳过。

## 核心工作流程（三次对话）

### 第一步：风格询问
- **触发条件**：用户首次提出需求。
- **任务**：先询问用户需要的风格（如：写实、卡通、低多边形、赛博朋克、中式园林等）。
- **要求**：语气亲切，表现出对用户需求的浓厚兴趣。

### 第二步：风格分析与方案设计
- **触发条件**：用户提供了风格偏好。
- **任务**：仔细分析风格，依据该风格人性化地提出你的方案供用户选择。
- **要求**：方案应具有创意，描述场景的氛围感、色彩基调和布局构思。提供至少两个各具特色的方案。

### 第三步：任务拆分与自动化实现
- **触发条件**：用户选择了方案或确认开始。
- **任务分解**：
  1. **生成必要3D物品列表**：
     - **资源节省原则**：为了节省生成资源，某些环境元素（如地形Landscape、水流Fluid、粒子特效Niagara等）应当使用UE自带系统实现，而不必作为3D模型生成。
     - **关键要求**：你必须将"明确需要生成的3D模型清单"以 JSON 格式输出，并用 ${objectListMarker} 包裹。这是前端捕获的关键！
     - 格式示例：
       ${objectListMarker}
       {
         "objects": [
           { "name": "喷泉雕塑", "description": "巴洛克风格的大理石喷泉，带有精致的雕刻", "priority": "high" },
           { "name": "长椅", "description": "复古木质长椅，带有铸铁扶手", "priority": "medium" }
         ]
       }
       ${objectListMarker}
     - 同时，请用自然语言列出将使用UE自带系统实现的元素。
  2. **等待确认**：输出清单后，告知用户："我已准备好物品清单，请确认。物品生成完成后，请回复'已完成'。"
  3. **自动化场景构建（CodeBuddy特殊调用）**：
     - 当用户回复"已完成"时，你需要采用特殊方式使用CodeBuddy编程代码。
     - **特殊方式定义**：在聊天框输出 ${codeRequestMarker} 包裹的 JSON 指令，这些指令会被系统自动截获并发送给 CodeBuddy 执行。
     - **功能涵盖**：自动排列物品位置、创建地形细节、设置流体参数、配置光照和环境等所有优化场景建筑的部分。

## CodeBuddy 特殊指令规范
你输出的指令必须严格遵循以下 JSON 格式并被 ${codeRequestMarker} 包裹：

### 示例 1：场景布局 (AUTO_LAYOUT)
\`\`\`json
${codeRequestMarker}
{
  "action": "AUTO_LAYOUT",
  "task_description": "描述你正在执行的优化任务",
  "engine_systems": ["landscape", "fluid", "lighting"],
  "layout_plan": {
    "center_object": "主要建筑名称",
    "distribution": "布局策略(如: circular, grid, natural)",
    "terrain_config": { "size": [500, 500], "height_multiplier": 2 }
  },
  "objects_to_place": ["object1", "object2"]
}
${codeRequestMarker}
\`\`\`

### 示例 2：编写脚本 (WRITE_SCRIPT)
- **fileName**: 必须包含文件扩展名（如 .py）。
- **code**: 必须是完整的 UE Python Editor Scripting 代码字符串，注意转义换行符。
\`\`\`json
${codeRequestMarker}
{
  "action": "WRITE_SCRIPT",
  "fileName": "RotationController.py",
  "code": "import unreal\\n\\ndef rotate_actor():\\n    editor_lib = unreal.EditorLevelLibrary()\\n    for actor in editor_lib.get_selected_level_actors():\\n        actor.add_actor_world_rotation(unreal.Rotator(0, 1, 0))\\nrotate_actor()"
}
${codeRequestMarker}
\`\`\`

## 语气与表达
- 始终保持专业、细致且富有创造力的语气。
- 在描述方案时，多使用感官动词，让用户感受到场景的生命力。
- 引导用户逐步完成，不要一次性输出过多复杂指令。

现在，请等待用户的需求描述。`;
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
   * 调用后端代理 API
   */
  private async callBackend(messages: ChatMessage[]): Promise<{ content: string; reasoning?: string }> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: messages,
          model: this.config.model,
          temperature: this.config.temperature,
          max_tokens: this.config.maxTokens,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `API error: ${response.status}`);
      }

      const data = await response.json();
      return { 
        content: data.content || '', 
        reasoning: data.reasoning 
      };
    } catch (error) {
      throw new Error(
        `调用后端失败: ${error instanceof Error ? error.message : '未知错误'}`
      );
    }
  }

  /**
   * 发送消息并获取AI回复
   */
  async sendMessage(userMessage: string): Promise<DeepSeekResponse> {
    // 添加用户消息
    this.addMessage({ role: 'user', content: userMessage });
    this.sceneData.userRequest = userMessage;

    // 如果是第一条消息，添加系统提示词
    if (this.conversationHistory.length === 1) {
      this.conversationHistory.unshift({
        role: 'system',
        content: this.getSystemPrompt(),
      });
    }

    // 调用后端代理 API
    const { content, reasoning } = await this.callBackend(this.conversationHistory);

    // 添加AI回复
    this.addMessage({ role: 'assistant', content });

    // 更新当前步骤
    this.currentStep++;

    // 解析回复内容
    const stepInfo = this.determineStep(userMessage, content);
    const metadata = this.extractMetadata(content, stepInfo.step);

    return {
      content,
      reasoning,
      step: stepInfo.step,
      stepName: stepInfo.stepName,
      isComplete: stepInfo.isComplete,
      metadata,
    };
  }

  /**
   * 确定当前对话步骤
   */
  private determineStep(_userMessage: string, aiResponse: string): {
    step: number;
    stepName: string;
    isComplete: boolean;
  } {
    if (aiResponse.includes('@@CODE_REQUEST@@')) {
      return { step: 3, stepName: '自动化构建', isComplete: false };
    }
    if (aiResponse.includes('3D物品列表') || aiResponse.includes('物体清单') || aiResponse.includes('已完成') || aiResponse.includes('@@OBJECT_LIST@@')) {
      return { step: 3, stepName: '任务拆分', isComplete: false };
    }
    if (aiResponse.includes('方案') || aiResponse.includes('建议')) {
      return { step: 2, stepName: '方案设计', isComplete: false };
    }
    return { step: 1, stepName: '风格询问', isComplete: false };
  }

  /**
   * 从AI回复中提取元数据
   */
  private extractMetadata(content: string, _step: number): DeepSeekResponse['metadata'] {
    const metadata: DeepSeekResponse['metadata'] = {};

    // 提取代码请求
    const codeRequestMatch = content.match(/@@CODE_REQUEST@@\s*(\{[\s\S]*?\})\s*@@CODE_REQUEST@@/);
    if (codeRequestMatch) {
      try {
        metadata.codeRequest = codeRequestMatch[1];
      } catch {}
    }

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
        console.error('Failed to parse object list JSON:', e);
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
   * 获取代码请求列表
   */
  getCodeRequests(): string[] {
    const requests: string[] = [];
    const codeRequestRegex = /@@CODE_REQUEST@@\s*(\{[\s\S]*?\})\s*@@CODE_REQUEST@@/g;
    let match;

    for (const message of this.conversationHistory) {
      if (message.role === 'assistant') {
        while ((match = codeRequestRegex.exec(message.content)) !== null) {
          requests.push(match[1]);
        }
      }
    }
    return requests;
  }

  /**
   * 获取当前完整的会话历史
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
   * 生成会话简短标题
   */
  async generateSessionTitle(): Promise<string> {
    const userMessages = this.conversationHistory.filter(m => m.role === 'user');
    if (userMessages.length === 0) return '新对话';

    try {
      const response = await fetch(`${API_BASE_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            { role: 'system', content: '你是一个助手，请根据用户的需求描述，生成一个 5 个字以内的极简标题。只输出标题，不要任何标点。' },
            { role: 'user', content: userMessages[0].content }
          ],
          model: 'deepseek-chat',
          temperature: 0.3,
          max_tokens: 50,
        }),
      });

      if (!response.ok) return userMessages[0].content.slice(0, 10);
      const data = await response.json();
      return data.content?.trim() || userMessages[0].content.slice(0, 10);
    } catch {
      return userMessages[0].content.slice(0, 10);
    }
  }
}

/**
 * 工厂函数 - 不再需要 apiKey
 */
export const createDeepSeekChatService = (config: DeepSeekConfig = {}, initialHistory: ChatMessage[] = []) => {
  return new DeepSeekChatService(config, initialHistory);
};

/**
 * 检查后端是否配置了 DeepSeek
 */
export const checkDeepSeekConfig = async (): Promise<boolean> => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/config`);
    const data = await response.json();
    return data.deepseekConfigured === true;
  } catch {
    return false;
  }
};
