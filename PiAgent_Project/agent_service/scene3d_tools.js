/**
 * 3D 模型生成工具
 * 用于 pi-coding-agent 的自定义工具
 *
 * 重要：PiAgent SDK 要求 execute() 返回格式为：
 *   { content: [{ type: "text", text: "..." }], details: {} }
 * content 必须是数组，每个元素必须是 { type, text } 对象
 *
 * 工作流程：
 * 1. plan_3d_models - Agent 分析场景，列出需要生成的物体清单和润色后的提示词（不实际调用API）
 * 2. 等待前端用户审批确认
 * 3. generate_3d_model - 逐个生成模型（用户确认后才调用）
 * 4. check_3d_model_status - 查询生成状态
 * 5. Agent 用代码将模型组装成 UE 场景
 */

const BACKEND_URL = 'http://localhost:8000';

// 工具调用超时时间（毫秒）
const TOOL_TIMEOUT = 15000;

// UE Python 执行的超时时间（毫秒，因为代码可能需要较长时间执行）
const UE_EXECUTE_TIMEOUT = 120000;

/**
 * 构造符合 PiAgent SDK 规范的工具返回结果
 * content 必须是 [{ type: "text", text: "..." }] 数组格式
 */
function toolResult(text, details = {}) {
  return {
    content: [{ type: 'text', text }],
    details,
  };
}

async function apiCall(method, path, body) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TOOL_TIMEOUT);
  
  try {
    const res = await fetch(`${BACKEND_URL}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`API error ${res.status}: ${text}`);
    }
    return res.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * 工具1：规划3D模型清单（仅规划，不调用生成API）
 * Agent 用此工具向用户展示要生成的物体列表和润色后的提示词
 */
export const plan3DModelsTool = {
  name: 'plan_3d_models',
  label: '规划3D模型',
  description: `分析用户需求，列出需要生成的 3D 模型清单。

工作流程：
1. 先用此工具列出要生成的物体清单，为每个物体生成润色后的中文提示词
2. 此工具不会调用AI生3D API，仅作规划展示
3. 等待用户确认清单后，再逐个调用 generate_3d_model 生成

重要规则：
- 必须为每个物体写一段高质量的中文提示词（用于文生3D）
- 提示词要包含：物体类型、风格、材质、细节描述
- 将场景拆分为独立的单个物体，不要合并，物体拆分的越细越好，并且能够让你知道怎么把它们放到场景中。反例：“生成一个房子”，你需要拆分成“房子”、“门”、“窗”、“床”、“椅子”等。

参数：
- scene_description: 用户原始场景描述
- models: 物体清单数组，每个包含 name(名称) 和 prompt(润色后的中文提示词)`,
  parameters: {
    type: 'object',
    properties: {
      scene_description: {
        type: 'string',
        description: '用户的场景需求描述',
      },
      models: {
        type: 'array',
        description: '需要生成的物体清单',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: '物体中文名称' },
            prompt: { type: 'string', description: '润色后的中文提示词（用于文生3D API）' },
          },
          required: ['name', 'prompt'],
        },
      },
    },
    required: ['scene_description', 'models'],
  },
  async execute(toolCallId, params, _signal, _onUpdate) {
    const lines = params.models.map((m, i) =>
      `${i + 1}. ${m.name}\n   Prompt: ${m.prompt}`
    );
    const text = `3D Model Plan (waiting for user confirmation)\nScene: ${params.scene_description}\nTotal: ${params.models.length} objects\n\n${lines.join('\n\n')}\n\nWaiting for user confirmation before generating.`;
    return toolResult(text, {
      action: 'plan_3d',
      scene_description: params.scene_description,
      models: params.models.map(m => ({ name: m.name, prompt: m.prompt })),
    });
  },
};

/**
 * 工具2：生成单个3D模型
 */
export const generate3DModelTool = {
  name: 'generate_3d_model',
  label: '生成3D模型',
  description: `生成单个 3D 模型。调用腾讯混元生3D API。

重要规则：
- 必须在 plan_3d_models 被用户确认后才调用此工具
- 使用用户确认后的物体清单，逐个生成
- 生成后用 check_3d_model_status 查询状态
- 所有模型生成完毕后，编写 UE Python 脚本将模型组装成场景

参数：
- name: 物体名称
- prompt: 润色后的中文提示词（来自计划清单）
- format: 输出格式，默认 GLB`,
  parameters: {
    type: 'object',
    properties: {
      name: { type: 'string', description: '3D 物体名称' },
      prompt: { type: 'string', description: '润色后的中文提示词' },
      format: {
        type: 'string',
        enum: ['GLB', 'OBJ', 'FBX', 'STL', 'USDZ'],
        default: 'GLB',
        description: '输出模型格式',
      },
      enable_pbr: { type: 'boolean', default: false, description: '是否生成 PBR 材质' },
    },
    required: ['name', 'prompt'],
  },
  async execute(toolCallId, params, signal, onUpdate) {
    try {
      onUpdate?.({ type: 'tool_execution_update', toolCallId, partialResult: `Generating: ${params.name}...` });
      const data = await apiCall('POST', '/api/generate-object', {
        name: params.name,
        description: params.prompt,
        result_format: params.format || 'GLB',
        enable_pbr: params.enable_pbr || false,
      });
      const taskId = data.task_id || data.JobId;
      return toolResult(
        `3D model "${params.name}" generation task submitted.\nTaskID: ${taskId}\nStatus: processing\nUse check_3d_model_status to check progress.`
      );
    } catch (err) {
      return toolResult(`Generation failed: ${err.message}`);
    }
  },
};

/**
 * 工具3：查询3D模型生成状态
 */
export const check3DModelStatusTool = {
  name: 'check_3d_model_status',
  label: '查询3D状态',
  description: `查询 3D 模型生成任务的状态。
- 返回 processing / ready / failed
- 如果完成，返回模型下载 URL`,
  parameters: {
    type: 'object',
    properties: {
      task_id: { type: 'string', description: '生成任务 ID' },
    },
    required: ['task_id'],
  },
  async execute(toolCallId, params, signal, onUpdate) {
    try {
      onUpdate?.({ type: 'tool_execution_update', toolCallId, partialResult: 'Checking status...' });
      const data = await apiCall('GET', `/api/object-status/${params.task_id}`);
      const status = data.status;
      let msg = `Task ${params.task_id} status: ${status}`;
      if (data.model_url) {
        msg += `\n\nModel generated! Download: ${data.model_url}`;
      } else if (status === 'processing') {
        msg += '\n\nStill processing, check again later.';
      }
      return toolResult(msg);
    } catch (err) {
      return toolResult(`Query failed: ${err.message}`);
    }
  },
};

/**
 * 工具4：检查 UE 输出日志错误
 * 读取 UE Output.log 获取错误和警告日志
 * UE 的优势：即使有编译错误，日志文件仍然可读
 */
export const checkUEConsoleTool = {
  name: 'check_ue_console',
  label: '检查UE控制台',
  description: `检查 UE (Unreal Engine) 输出日志中的错误和警告。

使用场景：
- 生成蓝图/Python 脚本后，调用此工具检查是否有编译错误
- 修改代码后，再次调用此工具验证错误是否已修复
- 循环调用直到无错误为止

UE 的优势：即使有编译错误，日志文件仍然可直接读取。

参数：
- log_type: 日志类型，"Error"(仅错误，默认), "Warning"(仅警告), "All"(全部)`,
  parameters: {
    type: 'object',
    properties: {
      log_type: {
        type: 'string',
        enum: ['Error', 'Warning', 'All'],
        default: 'Error',
        description: '要查询的日志类型',
      },
    },
  },
  async execute(toolCallId, params, signal, onUpdate) {
    try {
      onUpdate?.({ type: 'tool_execution_update', toolCallId, partialResult: 'Checking UE output log...' });
      const data = await apiCall('POST', '/api/ue/console-errors', {
        log_type: params.log_type || 'Error',
      });

      if (!data.success) {
        return toolResult(
          `Cannot get UE log. Reason: ${data.message || 'Unknown error'}.\nPlease confirm UE editor is running or set UE_PROJECT_PATH env.`
        );
      }

      const errors = data.errors || [];
      const warnings = data.warnings || [];

      if (errors.length === 0 && warnings.length === 0) {
        return toolResult('UE output log: No errors, no warnings. Code compiled successfully.');
      }

      let msg = '';
      if (errors.length > 0) {
        msg += `UE found ${errors.length} error(s):\n`;
        errors.forEach((err, i) => {
          let line = `${i + 1}. ${err.message || err}`;
          if (err.file) line += ` (${err.file}${err.line ? ':' + err.line : ''})`;
          msg += line + '\n';
        });
        msg += '\nFix the errors above, then call check_ue_console again to verify.';
      }

      if (warnings.length > 0) {
        msg += `${warnings.length} warning(s):\n`;
        warnings.forEach((w, i) => {
          let line = `${i + 1}. ${w.message || w}`;
          if (w.file) line += ` (${w.file}${w.line ? ':' + w.line : ''})`;
          msg += line + '\n';
        });
      }

      // Truncate to prevent context bloat (max 3000 chars)
      if (msg.length > 3000) {
        msg = msg.substring(0, 2800) + `\n... and ${errors.length + warnings.length - 10} more (truncated)`;
      }

      return toolResult(msg);
    } catch (err) {
      const isTimeout = err.name === 'AbortError';
      if (isTimeout) {
        return toolResult('Check UE log timeout (15s). UE editor may not be running.');
      }
      return toolResult(`Check UE log failed: ${err.message}`);
    }
  },
};

/**
 * 工具5：浏览模型资产库
 * 查询本地数据库中已生成的 3D 模型资产
 */
export const browseModelLibraryTool = {
  name: 'browse_model_library',
  label: '浏览模型资产库',
  description: `浏览本地模型资产库，查看所有已生成的 3D 模型。

使用场景：
- 查看有哪些已生成可用的模型
- 搜索特定名称的模型
- 查看某个会话下生成的模型

返回模型列表包含：object_id, object_name, status, 创建时间

**重要：导入到UE时只支持FBX格式，选择模型时请确保是FBX格式**

参数：
- keyword: 搜索关键词（可选，模糊匹配模型名称）
- status: 过滤状态（可选，"ready"=仅已就绪, "processing"=生成中, "failed"=失败, 不填默认 ready）
- limit: 返回数量上限（可选，默认 50）`,
  parameters: {
    type: 'object',
    properties: {
      keyword: { type: 'string', description: '搜索关键词，模糊匹配模型名称' },
      status: {
        type: 'string',
        enum: ['ready', 'processing', 'failed', 'all'],
        default: 'ready',
        description: '过滤状态，不填默认只显示已就绪的模型',
      },
      limit: { type: 'number', default: 50, description: '返回数量上限' },
    },
  },
  async execute(toolCallId, params, signal, onUpdate) {
    try {
      onUpdate?.({ type: 'tool_execution_update', toolCallId, partialResult: 'Searching model library...' });

      const body = {
        status: params.status === 'all' ? undefined : (params.status || 'ready'),
        keyword: params.keyword || undefined,
        limit: params.limit || 50,
      };

      const data = await apiCall('POST', '/api/asset-library/list', body);

      console.log('[browse_model_library] Backend API response:', JSON.stringify(data).substring(0, 500));

      if (!data.success) {
        return toolResult(`Failed to query model library: ${data.message || 'Unknown error'}`);
      }

      const models = data.models || [];

      if (models.length === 0) {
        const kwMsg = params.keyword ? ` matching "${params.keyword}"` : '';
        return toolResult(`Model library is empty.${kwMsg} No models found with status "${params.status || 'ready'}".`);
      }

      let msg = `Model Library (${data.total} models found)\n${'─'.repeat(50)}\n`;

      models.forEach((m, i) => {
        const filePath = m.local_path || m.file_path || null;
        const fileFormat = filePath ? filePath.split('.').pop()?.toUpperCase() : (m.model_url ? m.model_url.split('.').pop()?.split('?')[0]?.toUpperCase() : 'UNKNOWN');
        msg += `${i + 1}. ${m.object_name} [${m.object_id}]\n`;
        msg += `   Status: ${m.status} | Format: ${fileFormat} | Created: ${m.created_at}\n`;
      });

      msg += `\n${'─'.repeat(50)}\n`;
      msg += `**Important: Only FBX models can be imported to UE. Please select FBX format models.**\n`;
      msg += `To import a model to UE, use import_model_to_ue tool.`;

      if (msg.length > 3000) {
        msg = msg.substring(0, 2800) + `\n... and ${data.total - models.length} more (truncated)`;
      }

      return toolResult(msg, {
        action: 'browse_library',
        total: data.total,
        models: models.map(m => ({
          object_id: m.object_id,
          object_name: m.object_name,
          status: m.status,
          file_path: m.local_path || m.file_path || null,
        })),
      });
    } catch (err) {
      const isTimeout = err.name === 'AbortError';
      if (isTimeout) {
        return toolResult('Query model library timeout (15s). Backend may not be running.');
      }
      return toolResult(`Query model library failed: ${err.message}`);
    }
  },
};

/**
 * 工具6：将模型从资产库导入到 UE
 * 从数据库获取模型文件，通过 UE MCP 插件导入到 Unreal Engine
 */
export const importModelToUETool = {
  name: 'import_model_to_ue',
  label: '导入模型到UE',
  description: `将模型导入到 Unreal Engine，自动完成文件复制 + UE 资产导入。

使用场景：
- 用户要求导入某个模型到 UE
- 可直接传入模型名称（model_name），工具会自动在资产库中搜索
- 也可传入 object_id（从 browse_model_library 获取）

重要限制：
- **只支持FBX格式的模型**，不要导入其他格式（如glTF、OBJ等）
- 此工具通过 MCP 与 UE 通信，需要确保 UE 编辑器已启动并运行 UnrealMCP 插件

工作方式：
1. 从资产库获取模型文件（必须是FBX格式）
2. 复制到 UE 项目的 Content/Imports 目录
3. 使用 unrealMCP_import_model 工具导入到 UE

参数：
- model_name: 模型名称（如 "欧式古典书桌"，工具会自动搜索匹配的FBX模型）
- object_id: 模型 ID（可选，与 model_name 二选一）
- ue_project_path: UE 项目的 .uproject 文件完整路径（可选，不填则自动搜索）`,
  parameters: {
    type: 'object',
    properties: {
      model_name: { type: 'string', description: '模型名称，工具会自动在资产库中搜索匹配的模型' },
      object_id: { type: 'string', description: '模型 ID（可选，与 model_name 二选一）' },
      ue_project_path: {
        type: 'string',
        description: 'UE 项目的 .uproject 文件完整路径（可选，不填则自动搜索）',
      },
    },
  },
  async execute(toolCallId, params, signal, onUpdate) {
    try {
      console.log('[import_model_to_ue] Step 1: Starting import_model_to_ue tool');
      console.log('[import_model_to_ue] Params:', params);
      onUpdate?.({ type: 'tool_execution_update', toolCallId, partialResult: `Copying model file to UE project...` });

      const body = {
        model_name: params.model_name || undefined,
        object_id: params.object_id || undefined,
        ue_project_path: params.ue_project_path || undefined,
      };

      console.log('[import_model_to_ue] Step 2: Calling backend API /api/asset-library/import-to-ue');
      const importController = new AbortController();
      const importTimeoutId = setTimeout(() => importController.abort(), 60000);
      const data = await fetch(`${BACKEND_URL}/api/asset-library/import-to-ue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: importController.signal,
      }).then(r => r.json()).finally(() => clearTimeout(importTimeoutId));
      console.log('[import_model_to_ue] Step 3: Backend API response:', data);

      if (data.success) {
        console.log('[import_model_to_ue] Step 4: Import successful');
        const name = data.object_name || params.model_name || params.object_id;
        const pathMsg = data.file_path ? `\n文件路径: ${data.file_path}` : '';
        const sizeMsg = data.file_size_kb ? `\n文件大小: ${data.file_size_kb} KB` : '';
        const ueMsg = data.ue_project ? `\nUE 项目: ${data.ue_project}` : '';
        const assetMsg = data.ue_asset_path ? `\nUE 资产: ${data.ue_asset_path}` : '';
        return toolResult(`Model imported to UE successfully.${pathMsg}${sizeMsg}${ueMsg}${assetMsg}`, {
          file_path: data.file_path,
          ue_project: data.ue_project,
          ue_asset_path: data.ue_asset_path,
          action: 'import_complete',
        });
      } else {
        console.log('[import_model_to_ue] Step 4 FAILED: Backend returned success=false:', data.message);
        return toolResult(`Copy failed: ${data.message}\n\nTips:\n- Make sure a UE project exists (need a .uproject file)\n- You can provide ue_project_path parameter`);
      }
    } catch (err) {
      console.error('[import_model_to_ue] Step 4 ERROR:', err.message);
      const isTimeout = err.name === 'AbortError';
      if (isTimeout) {
        return toolResult('Copy to UE timeout (60s). Backend may not be running.');
      }
      return toolResult(`Copy failed: ${err.message}`);
    }
  },
};

export const scene3DTools = [
  plan3DModelsTool,
  generate3DModelTool,
  check3DModelStatusTool,
  checkUEConsoleTool,
  browseModelLibraryTool,
  importModelToUETool,
];

export default scene3DTools;
