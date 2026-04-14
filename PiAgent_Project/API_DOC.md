# PiAgent_Project 对外接口文档

> 本文档整理了 PiAgent_Project 项目的所有对外接口，供前端开发、后端对接和二次开发使用。

---

## 目录

- [1. 项目架构概览](#1-项目架构概览)
- [2. HTTP API 接口（Agent Service）](#2-http-api-接口agent-service)
- [3. CLI 命令行入口](#3-cli-命令行入口)
- [4. 自定义 3D 工具集](#4-自定义-3d-工具集)
- [5. MCP 扩展模块](#5-mcp-扩展模块)
- [6. 依赖的后端 API](#6-依赖的后端-api)
- [7. SSE 事件流格式](#7-sse-事件流格式)
- [8. 配置说明](#8-配置说明)

---

## 1. 项目架构概览

```
PiAgent_Project/
├── agent_service/          # ★ 核心 HTTP 服务（对外主接口）
│   ├── index.mjs           #   Express 服务，暴露 REST + SSE 接口
│   ├── mcp_client.js       #   MCP 客户端，连接外部 MCP 服务器
│   ├── scene3d_tools.js    #   6 个自定义 3D 场景工具
│   └── systemPrompt.js     #   Agent 系统提示词
├── extensions/
│   └── mcp-extension.js    #   PiAgent CLI 的 MCP 扩展
├── run_agent.js            #   CLI 交互模式入口
├── auto_code.js            #   CLI 自动代码生成入口
├── run_agent_with_mcp.js   #   CLI 带 MCP 支持入口
├── sync_pi_agent.js        #   同步核心包脚本
├── mcp-config.json         #   MCP 服务器配置
└── .env                    #   环境变量（API Key 等）
```

**核心数据流：**
```
前端 → HTTP(SSE) → agent_service/index.mjs → PiAgent SDK → LLM (DeepSeek/OpenAI)
                                              ↓
                                         scene3d_tools.js → 后端 API (:8000)
                                              ↓
                                         mcp_client.js → UnrealMCP (Python 进程)
```

---

## 2. HTTP API 接口（Agent Service）

服务地址：`http://localhost:3001`（默认端口，可通过 `AGENT_PORT` 环境变量修改）

所有请求/响应均为 **JSON** 格式。

### 2.1 健康检查

```
GET /health
```

**响应：**
```json
{
  "status": "ok",
  "sdkLoaded": true,
  "sessions": 3
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| status | string | 服务状态 |
| sdkLoaded | boolean | PiAgent SDK 是否加载成功 |
| sessions | number | 当前活跃会话数 |

---

### 2.2 创建会话

```
POST /api/session
Content-Type: application/json
```

**请求体：**
```json
{
  "sessionId": "web-1700000000000",   // 可选，不传则自动生成 web-{timestamp}
  "cwd": "d:\\3DPro\\PiAgent_Project", // 可选，工作目录，默认项目根目录
  "customTools": []                     // 可选，额外自定义工具
}
```

**响应：**
```json
{ "success": true, "sessionId": "web-1700000000000" }
```

**说明：**
- 会话支持持久化，通过 `.session-map.json` 文件映射 sessionId ↔ PiAgent 会话文件路径
- 重启服务后可恢复已有会话

---

### 2.3 发送消息（SSE 流式）★ 核心接口

```
POST /api/chat
Content-Type: application/json
```

**请求体：**
```json
{
  "sessionId": "web-1700000000000",
  "message": "帮我创建一个教室场景",
  "cwd": "d:\\3DPro\\PiAgent_Project"   // 可选
}
```

**响应：** `text/event-stream`（SSE 事件流）

这是项目的**最核心接口**。前端通过此接口与 Agent 对话，接收实时流式响应。

SSE 事件格式详见 [第 7 节](#7-sse-事件流格式)。

**行为特点：**
- 首次发送消息时，会自动附加系统提示词（来自 [systemPrompt.js](agent_service/systemPrompt.js)）
- 支持 SDK 多种事件格式的兼容处理（OpenAI / Anthropic / PiAgent 原生）
- 如果会话损坏（零事件），会自动销毁并重建重试一次
- 客户端断开连接时，自动 abort Agent 以释放资源

---

### 2.4 转向/中断 Agent

```
POST /api/steer
Content-Type: application/json
```

**请求体：**
```json
{
  "sessionId": "web-1700000000000",
  "message": "请停止当前操作，改做其他事情"
}
```

**响应：**
```json
{ "success": true }
```

**说明：** 软转向——排队消息，等当前工具执行完后跳过剩余工具并处理新消息。

---

### 2.5 强制中止 Agent

```
POST /api/abort
Content-Type: application/json
```

**请求体：**
```json
{ "sessionId": "web-1700000000000" }
```

**响应：**
```json
{ "success": true }
```

**说明：** 立即中断 LLM 调用和工具执行，异步执行不阻塞响应。

---

### 2.6 删除会话

```
DELETE /api/session/:id
```

**响应：**
```json
{ "success": true }
```

---

### 2.7 获取工具列表

```
GET /api/tools
```

**响应：**
```json
{
  "tools": [
    {
      "name": "read",
      "label": "Read File",
      "description": "读取文件内容..."
    },
    {
      "name": "plan_3d_models",
      "label": "规划3D模型",
      "description": "分析用户需求..."
    }
  ]
}
```

**说明：** 返回所有可用工具列表（内置编码工具 + 自定义 3D 工具），供前端展示或调试用。

---

## 3. CLI 命令行入口

### 3.1 交互模式

```bash
node run_agent.js
# 或双击 start_agent.bat
# 或 npm run start
```

启动 PiAgent 终端交互式 TUI 界面，直接与 AI 对话。

**优先加载顺序：**
1. `pi-agent/node_modules/@mariozechner/pi-coding-agent/dist/cli.js`（本地同步包）
2. `node_modules/@mariozechner/pi-coding-agent/dist/cli.js`（全局安装）

---

### 3.2 自动代码生成模式

```bash
node auto_code.js "你的需求"
node auto_code.js -f prompt.txt    # 从文件读取需求
# 或 npm run auto -- "你的需求"
```

非交互模式，传入需求文本后自动执行并输出结果。

**API 导出（供程序化调用）：**
```js
const { createAgentSession, SessionManager, createCodingTools } = await import('@mariozechner/pi-coding-agent');

const { session } = await createAgentSession({
  cwd: process.cwd(),
  tools: createCodingTools(cwd),
  sessionManager: SessionManager.create(cwd),
});

session.subscribe((event) => {
  if (event.type === 'message_update' && event.assistantMessageEvent.type === 'text_delta') {
    process.stdout.write(event.assistantMessageEvent.delta);
  }
});

await session.prompt('你的需求');
```

---

### 3.3 带 MCP 扩展的交互模式

```bash
node run_agent_with_mcp.js "你的需求"
```

自动加载 `extensions/mcp-extension.js` 作为扩展参数 `-e` 启动 PiAgent CLI。

---

### 3.4 同步核心包

```bash
node sync_pi_agent.js
# 或 npm run sync
# 或双击 sync_pi_agent.bat
```

将以下 4 个包从 `node_modules` 复制到 `pi-agent/node_modules/`：
- `pi-coding-agent`
- `pi-agent-core`
- `pi-ai`
- `pi-tui`

---

## 4. 自定义 3D 工具集

位于 [scene3d_tools.js](agent_service/scene3d_tools.js)，共 **6 个工具**，全部通过调用后端 `http://localhost:8000` 的 API 实现。

### 4.1 plan_3d_models — 规划 3D 模型清单

| 属性 | 值 |
|------|-----|
| name | `plan_3d_models` |
| label | 规划3D模型 |

**参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| scene_description | string | ✅ | 用户场景描述 |
| models | array | ✅ | 物体清单，每项含 `name`(中文名) 和 `prompt`(英文提示词) |

**返回示例：**
```json
{
  "content": [{ "type": "text", "text": "3D Model Plan...\nTotal: 5 objects\n..." }],
  "details": {
    "action": "plan_3d",
    "scene_description": "...",
    "models": [{ "name": "桌子", "prompt": "A wooden desk..." }]
  }
}
```

**注意：** 此工具仅作规划展示，不实际调用生成 API。前端需在用户确认后才触发 `generate_3d_model`。

---

### 4.2 generate_3d_model — 生成单个 3D 模型

| 属性 | 值 |
|------|-----|
| name | `generate_3d_model` |
| label | 生成3D模型 |

**参数：**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| name | string | ✅ | - | 物体名称 |
| prompt | string | ✅ | - | 英文提示词 |
| format | string | ❌ | GLB | 输出格式：GLB/OBJ/FBX/STL/USDZ |
| enable_pbr | boolean | ❌ | false | 是否生成 PBR 材质 |

**内部调用：** `POST http://localhost:8000/api/generate-object`

---

### 4.3 check_3d_model_status — 查询生成状态

| 属性 | 值 |
|------|-----|
| name | `check_3d_model_status` |
| label | 查询3D状态 |

**参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| task_id | string | ✅ | 生成任务 ID |

**内部调用：** `GET http://localhost:8000/api/object-status/{task_id}`

---

### 4.4 check_ue_console — 检查 UE 日志错误

| 属性 | 值 |
|------|-----|
| name | `check_ue_console` |
| label | 检查UE控制台 |

**参数：**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| log_type | string | ❌ | Error | Error / Warning / All |

**内部调用：** `POST http://localhost:8000/api/ue/console-errors`

---

### 4.5 browse_model_library — 浏览模型资产库

| 属性 | 值 |
|------|-----|
| name | `browse_model_library` |
| label | 浏览模型资产库 |

**参数：**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| keyword | string | ❌ | - | 搜索关键词（模糊匹配） |
| status | string | ❌ | ready | ready / processing / failed / all |
| limit | number | ❌ | 50 | 返回数量上限 |

**内部调用：** `POST http://localhost:8000/api/asset-library/list`

**返回字段：** object_id, object_name, status, local_path, created_at, model_url

---

### 4.6 import_model_to_ue — 导入模型到 UE

| 属性 | 值 |
|------|-----|
| name | `import_model_to_ue` |
| label | 导入模型到UE |

**参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| model_name | string | 二选一 | 模型名称（自动搜索资产库） |
| object_id | string | 二选一 | 模型 ID |
| ue_project_path | string | ❌ | UE 项目 .uproject 路径 |

**内部调用：** `POST http://localhost:8000/api/asset-library/import-to-ue`（超时 60s）

**限制：** 仅支持 FBX 格式模型导入 UE。

---

## 5. MCP 扩展模块

### 5.1 agent_service/mcp_client.js — HTTP 服务端 MCP 客户端

为 HTTP API 服务提供 MCP 工具能力，启动时自动连接配置的 MCP 服务器。

**导出函数：**

| 函数 | 说明 |
|------|------|
| `getMCPTools()` | 连接所有 MCP 服务器，返回转换后的 PiAgent 工具数组 |
| `getMCPClient()` | 获取 MCP 客户端实例 |
| `shutdownMCP()` | 断开所有 MCP 连接 |

**MCPToolClient 类方法：**

| 方法 | 说明 |
|------|------|
| `loadConfig()` | 加载 mcp-config.json 配置文件 |
| `connectAll()` | 连接所有配置的服务器 |
| `connect(serverName, config)` | 连接指定服务器 |
| `callTool(serverName, toolName, args)` | 调用工具（支持断线重连） |
| `getTools()` | 获取所有已注册的工具列表 |
| `disconnect(serverName)` | 断开指定服务器 |
| `disconnectAll()` | 断开所有服务器 |

**MCP 工具命名规则：** `{serverName}_{toolName}`，例如 `unrealMCP_import_model`

**配置文件搜索顺序：**
1. `{cwd}/mcp-config.json`
2. `{cwd}/.mcp/config.json`
3. `~/.pi/mcp-config.json`
4. `../mcp-config.json`（相对于 agent_service）

---

### 5.2 extensions/mcp-extension.js — PiAgent CLI 扩展

为 PiAgent CLI（交互模式）添加 MCP 支持，可作为 `-e` 参数传入。

**使用方式：**
```bash
pi -e ./extensions/mcp-extension.js "你的需求"
```

**MCPClient 类（TypeScript）：**

| 方法 | 说明 |
|------|------|
| `connect(serverName, config)` | 连接 MCP 服务器 |
| `createToolsForSession()` | 将 MCP 工具转换为 PiAgent 工具格式 |

**Extension 入口函数：**
```typescript
export function activate(context: ExtensionContext): void
```

注册为 PiAgent Extension，自动在激活时连接 MCP 服务器并提供工具。

---

## 6. 依赖的后端 API

Agent Service 通过 `http://localhost:8000` 与后端通信（地址硬编码于 [scene3d_tools.js](agent_service/scene3d_tools.js) 中 `BACKEND_URL` 常量）。

### 6.1 生成 3D 对象

```
POST /api/generate-object
Content-Type: application/json

{
  "name": "桌子",
  "description": "A wooden desk...",
  "result_format": "GLB",
  "enable_pbr": false
}

→ { "task_id": "xxx", "JobId": "xxx" }
```

**超时：** 15 秒

---

### 6.2 查询对象状态

```
GET /api/object-status/{task_id}

→ { "status": "processing" | "ready" | "failed", "model_url": "..." }
```

---

### 6.3 查询 UE 控制台日志

```
POST /api/ue/console-errors
Content-Type: application/json

{ "log_type": "Error" }

→ {
  "success": true,
  "errors": [{ "message": "...", "file": "...", "line": 123 }],
  "warnings": [...]
}
```

---

### 6.4 列出资产库模型

```
POST /api/asset-library/list
Content-Type: application/json

{ "status": "ready", "keyword": "桌子", "limit": 50 }

→ {
  "success": true,
  "total": 10,
  "models": [{
    "object_id": "xxx",
    "object_name": "欧式古典书桌",
    "status": "ready",
    "local_path": "d:/.../desk.fbx",
    "created_at": "2025-01-01T00:00:00"
  }]
}
```

---

### 6.5 导入模型到 UE

```
POST /api/asset-library/import-to-ue
Content-Type: application/json
```

**请求体：**
```json
{
  "model_name": "欧式古典书桌",
  "object_id": "xxx",
  "ue_project_path": "d:/MyProject/MyProject.uproject"
}
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| model_name | string | 二选一 | 模型名称（自动搜索资产库） |
| object_id | string | 二选一 | 模型 ID |
| ue_project_path | string | ❌ | UE 项目 .uproject 文件路径（不填则自动搜索） |

**响应：**
```json
{
  "success": true,
  "message": "导入完成",
  "object_name": "欧式古典书桌",
  "file_path": "D:/MyProject/Content/Imports/european_classic_desk_a1b2c3d4.fbx",
  "file_size_kb": 1024.5,
  "ue_project": "D:/MyProject",
  "import_dir": "D:/MyProject/Content/Imports",
  "ue_asset_path": "/Game/Imports/european_classic_desk_a1b2c3d4",
  "auto_imported": true
}
```

**响应字段说明：**

| 字段 | 类型 | 说明 |
|------|------|------|
| success | boolean | 是否成功 |
| message | string | 结果消息 |
| object_name | string | 原始中文名称 |
| file_path | string | 复制到 UE 项目目录的完整文件路径（文件名 = 英文翻译名 + md5哈希后缀 + 原扩展名） |
| file_size_kb | number | 文件大小（KB） |
| ue_project | string | **UE 项目目录路径**（.uproject 文件所在的父目录，不是 .uproject 文件本身） |
| import_dir | string | 导入目标目录（即 `{ue_project}/Content/Imports`） |
| ue_asset_path | string | UE 资产内部路径（如 `/Game/Imports/xxx`），由 MCP import_model 返回 |
| auto_imported | boolean | 是否通过 MCP 自动导入成功 |

**工作流程：**
1. 从数据库查找模型（按 name 或 id）
2. 确保模型文件在本地（local_path / 缓存 / 下载）
3. 中文名 → 英文翻译（调用 DeepSeek API）
4. 生成安全文件名：`{英文名}_{md5哈希8位}{原扩展名}`
5. 复制到 `{UE项目}/Content/Imports/` 目录
6. 调用 MCP `import_model` 工具导入为 UE 资产

**超时：** 60 秒

---

## 7. SSE 事件流格式

`POST /api/chat` 返回 `text/event-stream` 格式，每条消息以 `data: {...}\n\n` 分隔。

### 7.1 事件类型总览

| event.type | eventType | 说明 | 关键字段 |
|------------|-----------|------|----------|
| `agent_start` | - | Agent 开始处理 | - |
| `message_update` | `text_delta` | 文本增量输出 | `delta` (string) |
| `message_update` | `thinking_delta` | 思考过程增量 | `delta` (string), `isThinking: true` |
| `message_update` | `toolcall_start` | 工具调用开始 | `toolName`, `toolCallId` |
| `message_update` | `toolcall_delta` | 工具参数增量 | `toolCallId`, `delta` |
| `content_block_delta` | `text_delta` | Anthropic 格式文本增量 | `delta`, `_sdkFormat: "anthropic"` |
| `message_delta` | `text` | OpenAI 格式文本 | `delta`, `_sdkFormat: "openai"` |
| `message_delta` | `tool_use` | OpenAI 格式工具调用 | `toolName`, `_sdkFormat: "openai"` |
| `tool_use_start` | `toolcall_start` | Anthropic 工具开始 | `toolName`, `toolCallId` |
| `tool_execution_start` | - | 工具开始执行 | `toolName`, `toolCallId`, `args` |
| `tool_execution_update` | - | 工具执行进度更新 | `toolCallId`, `partialResult` |
| `tool_execution_end` | - | 工具执行完成 | `toolName`, `toolCallId`, `result`, `isError` |
| `agent_end` | - | Agent 处理完成 | `messageCount` |
| `done` | - | 流结束信号 | - |
| `error` | - | 错误 | `error` (string) |

### 7.2 各事件详细结构

#### 文本增量（最常用）
```json
data: {"type":"message_update","eventType":"text_delta","delta":"你好"}
```

#### 思考过程
```json
data: {"type":"message_update","eventType":"thinking_delta","delta":"让我思考...","isThinking":true}
```

#### 工具调用开始
```json
data: {"type":"message_update","eventType":"toolcall_start","toolName":"plan_3d_models","toolCallId":"call_123"}
```

#### 工具执行开始
```json
data: {"type":"tool_execution_start","toolName":"plan_3d_models","toolCallId":"call_123","args":{"scene_description":"...","models":[...]}}
```

#### 工具执行完成
```json
data: {"type":"tool_execution_end","toolName":"plan_3d_models","toolCallId":"call_123","result":"3D Model Plan...","isError":false}
```

**特殊：** `plan_3d_models` 工具还会附带 `resultDetails` 字段（JSON 字符串，包含完整的 models 数组）：
```json
data: {"type":"tool_execution_end","toolName":"plan_3d_models","resultDetails":"{\"action\":\"plan_3d\",\"models\":[...]}"}
```

#### Agent 完成
```json
data: {"type":"agent_end","messageCount":5}
```

#### 流结束
```json
data: {"type":"done"}
```

#### 错误
```json
data: {"type":"error","error":"Agent 无响应，请重试"}
```

### 7.3 前端解析建议

```javascript
const source = new EventSource('/api/chat'); // 实际是 fetch POST + ReadableStream
// 或使用 fetch + POST + reader:

const response = await fetch('/api/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ sessionId, message }),
});

const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  const text = decoder.decode(value);
  // 按 \n\n 分割，提取 data: {...} 行
  for (const line of text.split('\n\n')) {
    if (line.startsWith('data: ')) {
      const event = JSON.parse(line.slice(6));
      handleEvent(event);
    }
  }
}
```

---

## 8. 配置说明

### 8.1 .env（项目根目录）

| 变量名 | 说明 | 示例 |
|--------|------|------|
| `OPENAI_API_KEY` | API 密钥（DeepSeek/OpenAI） | `sk-xxx` |
| `PI_GITHUB_API_BASE` | GitHub API 镜像 | `https://ghproxy.net/https://api.github.com` |
| `PI_GITHUB_DOWNLOAD_BASE` | GitHub 下载镜像 | `https://ghproxy.net/https://github.com` |

### 8.2 agent_service/.env.example

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `AGENT_PORT` | HTTP 服务端口 | `3001` |
| `BACKEND_URL` | 后端 API 地址 | `http://localhost:8000` |
| `LOG_LEVEL` | 日志级别 | `info` |

### 8.3 mcp-config.json

```json
{
  "mcpServers": {
    "unrealMCP": {
      "command": "python",
      "args": ["d:/3DPro/unreal-mcp-main/Python/unreal_mcp_server.py"]
    }
  }
}
```

每个 MCP 服务器配置：

| 字段 | 类型 | 说明 |
|------|------|------|
| command | string | 启动命令（如 python / uv / node） |
| args | string[] | 命令参数数组 |
| env | object | 可选，环境变量 |

### 8.4 运行时文件

| 文件 | 说明 |
|------|------|
| `agent_service/.agent-port` | 服务启动后写入实际端口号 |
| `agent_service/.session-map.json` | sessionId ↔ 会话文件路径映射（自动维护） |
| `agent_service/agent.log` | 运行日志（追加模式） |
| `agent_service/unreal_mcp.log` | MCP 相关日志 |

---

## 附录：完整 API 路由速查表

| Method | Path | 说明 | 认证 |
|--------|------|------|------|
| GET | `/health` | 健康检查 | 无 |
| POST | `/api/session` | 创建/恢复会话 | 无 |
| POST | `/api/chat` | 发送消息（SSE 流） | 无 |
| POST | `/api/steer` | 转向 Agent | 无 |
| POST | `/api/abort` | 强制中止 Agent | 无 |
| DELETE | `/api/session/:id` | 删除会话 | 无 |
| GET | `/api/tools` | 获取工具列表 | 无 |
