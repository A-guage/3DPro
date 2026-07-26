# Fix: MCP 子进程清理挂住导致工具调用无响应

## 问题描述

Agent 调用 `plan_scene` 等 MCP 工具后，前端一直卡住无响应。

### 现象
- `scene3d.log` 显示工具被成功调用并返回结果
- 后端日志显示 `DanglingToolCallMiddleware` 注入错误消息：`[Tool call was interrupted and did not return a result.]`
- 前端无任何可见响应

## 根本原因

`langchain-mcp-adapters` 每次调用 MCP 工具时，通过 `stdio_client` 创建一个新的 Node.js 子进程。工具执行完毕后，上下文管理器尝试清理子进程：

1. 关闭 stdin
2. 等待子进程退出（2秒超时）
3. 如果超时，强制终止子进程

**问题在于**：`scene3d-mcp-server` 的 `index.ts` 在子进程模式下也启动了 HTTP 服务器（`app.listen(port)`）和 auto-save 定时器（`setInterval`）。这些保持 Node.js 进程活跃，即使 stdin 已关闭，进程也不会退出。这导致 MCP 客户端的清理逻辑挂住。

### 执行流程

```
Agent 调用 plan_scene
  → langchain-mcp-adapters 创建 stdio 子进程
  → 子进程启动 MCP 服务器 + HTTP 服务器 + auto-save 定时器
  → 工具执行成功，返回结果
  → 上下文管理器尝试关闭子进程
  → 关闭 stdin → 等待子进程退出
  → Node.js 因 HTTP 服务器和 setInterval 仍在运行而不退出
  → 清理挂住 → call_tool 函数不返回
  → ToolMessage 不被创建
  → DanglingToolCallMiddleware 注入错误消息
  → 模型看到错误，前端无响应
```

## 修复方案

### 1. 子进程模式跳过 HTTP 服务器

在 `scene3d-mcp-server/src/index.ts` 中，当以子进程模式运行时（`!process.stdin.isTTY`），跳过 HTTP 服务器的启动。

```typescript
if (!isSubprocess) {
  const server = app.listen(port, () => { ... });
  // ... HTTP 服务器配置
} else {
  debug("startup", "Subprocess mode — skipping HTTP server");
}
```

### 2. 添加完整的 shutdown 处理

参考 UE MCP 的实现，添加 `shutdown()` 函数：

- 清除 auto-save 定时器（`clearInterval`）
- 保存数据库（`saveDb`）
- 关闭数据库（`closeDb`）
- 监听 `stdin.end` 事件（MCP 客户端断开时触发）
- 监听 `SIGTERM` / `SIGINT` 信号

```typescript
function shutdown(reason: string) {
  if (autoSaveTimer) { clearInterval(autoSaveTimer); }
  saveDb();
  closeDb();
  process.exit(0);
}

process.stdin.on("end", () => shutdown("stdin closed"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
```

### 3. 导出 closeDb 函数

在 `connection.ts` 中添加 `closeDb()` 函数，关闭 sql.js 数据库实例。

## 修改文件

| 文件 | 修改内容 |
|------|----------|
| `scene3d-mcp-server/src/index.ts` | 跳过子进程 HTTP 服务器 + shutdown 处理 |
| `scene3d-mcp-server/src/db/connection.ts` | 添加 `closeDb()` 函数 |
| `scene3d-mcp-server/src/mcp/tools/plan-scene.ts` | 添加 `agent_message` 字段 |

## 对比 UE MCP

| 特性 | UE MCP | scene3d（修复后） |
|------|--------|-------------------|
| stdio 模式启动 HTTP | ❌ 不启动 | ❌ 不启动 |
| stdin.end 事件处理 | ❌ 无 | ✅ shutdown() |
| SIGTERM/SIGINT 处理 | ✅ handleShutdown() | ✅ shutdown() |
| 清理定时器 | ✅ | ✅ clearInterval |
| 清理数据库 | N/A | ✅ closeDb() |
| 清理服务器 | ✅ close metrics/graphql | N/A（无服务器） |

## 验证步骤

1. 重启所有服务（`start.bat`）
2. 新建对话
3. 输入"帮我生成一个科幻手枪场景"
4. 确认：
   - 后端无 `DanglingToolCallMiddleware` 错误
   - 前端显示场景清单
   - Agent 输出可见文字回复
