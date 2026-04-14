/**
 * CodeBuddy 集成服务
 * 处理与 CodeBuddy（编辑器插件）的通信，执行代码生成任务
 */

const CODEBUDDY_BASE_URL = 'http://localhost:3030/api';

export interface CodeRequest {
  action: string;
  task_description: string;
  engine_systems?: string[];
  layout_plan?: {
    center_object?: string;
    distribution?: string;
    terrain_config?: any;
    [key: string]: any;
  };
  objects_to_place?: string[];
  enginePath?: string;
}

export interface CodeRequestResponse {
  success: boolean;
  taskId?: string;
  generatedCode?: string;
  message?: string;
  error?: string;
}

/**
 * CodeBuddy 集成服务类
 */
export class CodeBuddyService {
  private baseUrl: string;

  constructor(baseUrl: string = CODEBUDDY_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  /**
   * 执行代码请求
   */
  async executeCodeRequest(
    request: CodeRequest
  ): Promise<CodeRequestResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/codebuddy/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.error || `HTTP 错误: ${response.status}`
        );
      }

      const data = await response.json();
      return {
        success: true,
        taskId: data.taskId,
        generatedCode: data.code,
        message: data.message,
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error ? error.message : '未知错误',
      };
    }
  }

  /**
   * 批量执行代码请求
   */
  async executeCodeRequests(
    requests: CodeRequest[]
  ): Promise<CodeRequestResponse[]> {
    const results: CodeRequestResponse[] = [];

    for (const request of requests) {
      const result = await this.executeCodeRequest(request);
      results.push(result);

      // 如果某个请求失败，可以选择中断或继续
      // 这里选择继续执行所有请求
    }

    return results;
  }

  /**
   * 解析代码请求字符串
   * 从 DeepSeek 响应中提取 JSON 格式的代码请求
   */
  parseCodeRequests(content: string): CodeRequest[] {
    const requests: CodeRequest[] = [];
    const regex =
      /@@CODE_REQUEST@@\s*(\{[\s\S]*?\})\s*@@CODE_REQUEST@@/g;
    let match;

    while ((match = regex.exec(content)) !== null) {
      try {
        const request = JSON.parse(match[1]);
        if (request.action && request.task_description) {
          requests.push(request);
        }
      } catch (error) {
        console.error('解析代码请求失败:', error);
      }
    }

    return requests;
  }

  /**
   * 检查 CodeBuddy 是否可用
   */
  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(2000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}

/**
 * 创建 CodeBuddy 服务单例
 */
let codeBuddyInstance: CodeBuddyService | null = null;

export function getCodeBuddyService(
  baseUrl?: string
): CodeBuddyService {
  if (!codeBuddyInstance || baseUrl) {
    codeBuddyInstance = new CodeBuddyService(baseUrl);
  }
  return codeBuddyInstance;
}
