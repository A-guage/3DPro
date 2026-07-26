# 修改记录

## 2026-05-30: 统一工具返回格式 + 错误兜底

### 背景
各工具返回的数据结构不统一，缺少 `success` 字段，且错误时直接 `throw` 导致 MCP 客户端无法获取结构化错误信息。

### 主要变更

修改了全部 7 个工具文件，统一返回格式：

| 文件 | 修改内容 |
|------|----------|
| `src/mcp/tools/generate.ts` | 添加 `success` 字段，catch 返回 `{ success: false, error }` |
| `src/mcp/tools/status.ts` | 添加 `success` 字段，catch 返回 `{ success: false, error }` |
| `src/mcp/tools/plan-scene.ts` | 添加 `success` 字段 + try/catch 错误兜底 |
| `src/mcp/tools/list-models.ts` | 添加 `success` 字段，catch 返回 `{ success: false, error }` |
| `src/mcp/tools/assets.ts` | 5 个工具全部统一，get_asset 未找到时返回 isError |
| `src/mcp/tools/categories.ts` | 3 个工具全部统一 |
| `src/mcp/tools/tags.ts` | 3 个工具全部统一 |

### 统一返回格式

#### 成功响应
```json
{
  "content": [{ "type": "text", "text": "{\"success\":true,\"scene_id\":\"xxx\",\"status\":\"pending\"}" }]
}
```

#### 错误响应（不再 throw，而是返回 isError）
```json
{
  "content": [{ "type": "text", "text": "{\"success\":false,\"error\":\"Object not found\"}" }],
  "isError": true
}
```

### 关键改进
- **统一 `success` 字段**: 所有响应都包含 `success: true/false`
- **错误兜底**: catch 块不再 `throw`，而是返回 `{ success: false, error: message }` + `isError: true`
- **MCP 客户端友好**: 错误信息通过 JSON 返回，不会中断 MCP 连接

---

## 2026-05-30: 消息返回逻辑改造

### 背景
为了与 Unreal_mcp-dev 保持一致的消息返回格式，对 MCP 工具的响应进行了统一包装。

### 主要变更

#### 1. 新增文件
- **`src/mcp/response-wrapper.ts`**: 响应包装工具模块
  - `buildSummaryText()`: 将结构化数据转换为人类可读的摘要文本
  - `wrapResponse()`: 统一包装 MCP 响应

#### 2. 修改文件
- **`src/mcp/server.ts`**: 添加 `patchToolMethod()` 函数
  - 在服务器创建时拦截所有工具注册
  - 自动为每个工具处理器包装 `wrapResponse()`

### 返回格式变化

#### 修改前
```json
{
  "content": [{ "type": "text", "text": "{\"scene_id\":\"xxx\",\"status\":\"pending\"}" }]
}
```

#### 修改后（与 Unreal_mcp-dev 一致）
```json
{
  "content": [{ "type": "text", "text": "{\"success\":true,\"scene_id\":\"xxx\",\"status\":\"pending\"}" }],
  "structuredContent": { "success": true, "scene_id": "xxx", "status": "pending" },
  "success": true
}
```

### 技术实现

#### 响应包装逻辑
1. **已格式化的 MCP 响应**（包含 `content` 数组）：
   - 保留原有格式
   - 从 JSON 文本中提取结构化数据到 `structuredContent`
   - 根据 `success` 和 `error` 字段自动设置 `isError`

2. **原始结构化数据**：
   - 使用 `buildSummaryText()` 生成可读摘要
   - 包装为标准 MCP 格式
   - 添加 `structuredContent`、`success`、`isError` 字段

### 参考实现
- Unreal_mcp-dev: `src/utils/response-validator.ts`
- Unreal_mcp-dev: `src/server/tool-registry.ts` (第 626-654 行)

---

## 2026-05-30: 项目初始化

### 初始功能
- MCP 服务器框架搭建
- HTTP API 端点实现
- SQLite 数据库集成
- 腾讯混元 3D API 集成
- 5 个核心 MCP 工具：
  - `generate`: 提交 3D 模型生成任务
  - `status`: 查询生成状态
  - `plan_scene`: 规划场景对象
  - `list_models`: 列出已生成模型
  - `assets/categories/tags`: 资产管理
