# scene3d-mcp-server

面向 AI Agent 的双协议 3D 场景生成服务器。通过 stdio 提供 **5 个 MCP 工具**（供 Agent 调用），通过 Express 提供 **26 个 HTTP 端点**（供前端调用）。

支持腾讯混元 3D API，可扩展接入 TriPO、Meshy 或自定义后端。

## 快速开始

```bash
# 安装依赖
npm install

# 配置
cp config.example.yaml config.yaml
# 编辑 config.yaml，填入腾讯云凭证

# 编译
npm run build

# 运行（编译后）
npm start

# 或开发模式（自动重载）
npm run dev
```

## 架构

```
AI Agent (DeerFlow)          前端
    │ MCP (stdio)              │ HTTP (:3020)
    ▼                          ▼
┌──────────────────────────────────┐
│       scene3d-mcp-server         │
│  MCP 工具  ◄──► 服务层           │
│  HTTP API  ◄──► Provider 层      │
│              SQLite 数据库       │
└──────────────┬───────────────────┘
               │
    ┌──────────┼──────────┐
    ▼          ▼          ▼
  混元       TriPO      Meshy
  API        API        API
```

一个进程，两个接口：
- **MCP stdio** — Agent 通过 stdin/stdout JSON-RPC 调用工具
- **HTTP API**（端口 3020）— 前端通过 REST 查询，经 Gateway 代理转发

## MCP 工具

| 工具 | 说明 |
|------|------|
| `scene3d_generate` | 提交 3D 生成任务（单物体或场景多物体） |
| `scene3d_status` | 查询生成进度（按 scene_id 或 object_id） |
| `scene3d_list_models` | 列出已生成的模型 |
| `scene3d_manage_asset` | 资产、分类、标签的增删改查 |
| `scene3d_manage_scene_assets` | 在场景中摆放/移除资产（含变换数据） |

### 工具详情

**scene3d_generate**

| 参数 | 必填 | 默认值 | 说明 |
|------|------|--------|------|
| `description` | 是 | — | 3D 模型描述（形状、材质、风格） |
| `quality` | 否 | `medium` | `low` / `medium` / `high` |
| `session_id` | 否 | — | 聊天会话 ID，用于追踪 |
| `objects` | 否 | — | 多物体场景的对象数组 `{label, description}` |

质量等级：

| 质量 | PBR 材质 | 预计耗时 | 适用场景 |
|------|---------|---------|---------|
| `low` | 无 | ~2 分钟 | 快速原型 |
| `medium` | 有 | ~5 分钟 | 平衡模式 |
| `high` | 有 | ~10 分钟 | 生产资产 |

**scene3d_manage_asset** — 支持的操作：

- `create_asset`、`get_asset`、`list_assets`、`update_asset`、`delete_asset`
- `create_category`、`get_categories`、`delete_category`
- `create_tag`、`get_tags`、`delete_tag`

**scene3d_manage_scene_assets** — 支持的操作：

- `add_asset` — 摆放资产（含 position/rotation/scale）
- `list_assets` — 列出场景中的资产
- `remove_asset` — 从场景中移除资产

## HTTP API

所有端点位于 `/api/scene3d/*`，前端通过 Gateway 代理访问。

### 生成

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/scenes` | 生成场景 |
| GET | `/scenes/:sceneId` | 查询/刷新场景状态 |
| POST | `/objects` | 生成单个物体 |
| GET | `/objects/:objectId` | 查询/刷新物体状态 |

### 历史记录与会话

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/history` | 场景历史列表 |
| GET | `/history/:sceneId` | 场景历史详情 |
| GET | `/sessions` | 聊天会话列表 |
| GET | `/sessions/:sessionId` | 会话详情 |
| POST | `/sessions/:sessionId` | 保存/创建会话 |
| DELETE | `/sessions/:sessionId` | 删除会话 |
| PUT | `/sessions/:sessionId/rename` | 重命名会话 |

### 资产

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/assets` | 创建资产 |
| GET | `/assets` | 资产列表（支持 `user_id`、`asset_type`、`keyword` 等筛选） |
| GET | `/assets/:assetId` | 获取资产 |
| PUT | `/assets/:assetId` | 更新资产 |
| DELETE | `/assets/:assetId` | 删除资产 |
| POST | `/assets/:assetId/download` | 下载计数 +1 |

### 分类与标签

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/categories` | 创建分类 |
| GET | `/categories` | 分类列表 |
| PUT | `/categories/:id` | 更新分类 |
| DELETE | `/categories/:id` | 删除分类 |
| POST | `/tags` | 创建标签 |
| GET | `/tags` | 标签列表 |
| DELETE | `/tags/:id` | 删除标签 |

### 场景资产

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/scene-assets` | 向场景添加资产 |
| GET | `/scene-assets/:sceneId` | 场景资产列表 |
| DELETE | `/scene-assets/:sceneId/:assetId` | 从场景移除资产 |

## 配置

`config.yaml` — 以 `$` 开头的值会在运行时从环境变量解析。

```yaml
scene3d:
  provider: hunyuan              # hunyuan | tripo | meshy | local
  storage_dir: ./storage
  database_path: ./drizzle/scene3d.db
  http_port: 3020

providers:
  hunyuan:
    secret_id: $TENCENT_SECRET_ID
    secret_key: $TENCENT_SECRET_KEY
    region: ap-guangzhou
    endpoint: ai3d.tencentcloudapi.com
    version: "2025-05-13"
```

### 环境变量

| 变量 | 说明 |
|------|------|
| `DEERFLOW_SCENE3D_CONFIG` | config.yaml 的绝对路径（当工作目录不是项目目录时必填） |
| `TENCENT_SECRET_ID` | 腾讯云 SecretId |
| `TENCENT_SECRET_KEY` | 腾讯云 SecretKey |

## 接入 DeerFlow

在 `extensions_config.json` 中添加：

```json
{
  "mcpServers": {
    "scene3d": {
      "enabled": true,
      "type": "stdio",
      "command": "node",
      "args": ["<绝对路径>/dist/index.js"],
      "env": {
        "DEERFLOW_SCENE3D_CONFIG": "<绝对路径>/config.yaml"
      }
    }
  }
}
```

Gateway 代理（`backend/app/gateway/routers/scene3d/router.py`）会将 `/api/scene3d/*` 转发到 `http://localhost:3020`。

## 项目结构

```
src/
├── index.ts                 # 入口 — 启动 MCP + HTTP 双接口
├── config.ts                # YAML 配置加载（支持 $ENV_VAR 解析）
├── db/
│   ├── schema.ts            # 8 张 SQLite 表定义
│   ├── connection.ts        # sql.js 连接 + 自动持久化
│   ├── migrate.ts           # 自动建表
│   └── repositories/       # 会话、场景、物体、资产、场景资产 CRUD
├── providers/
│   ├── base.ts              # Base3DProvider 接口定义
│   ├── hunyuan.ts           # 腾讯混元 3D API 集成
│   └── registry.ts          # Provider 工厂
├── mcp/
│   ├── server.ts            # MCP Server + stdio transport
│   └── tools/               # 5 个 MCP 工具定义
├── http/
│   ├── app.ts               # Express 应用
│   └── routes/              # 26 个 REST 端点
├── services/
│   ├── scene-manager.ts     # 场景生成编排
│   ├── object-manager.ts    # 单物体生成生命周期
│   └── file-storage.ts      # 文件下载与存储管理
└── types/
    └── scene.ts             # TypeScript 类型定义
```

## 扩展 Provider

实现 `Base3DProvider` 接口即可接入新的 3D 生成后端：

```typescript
interface Base3DProvider {
  submit(prompt: string, options: GenerationOptions): Promise<JobResult>;
  pollStatus(jobId: string): Promise<StatusResult>;
  download(modelUrl: string, destPath: string): Promise<void>;
}
```

在 `src/providers/registry.ts` 中注册即可。

## 许可证

MIT
