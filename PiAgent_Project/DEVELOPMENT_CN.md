# PiAgent 开发文档

> 基于 @mariozechner/pi-coding-agent 的 AI 编程助手完整配置指南

---

## 📋 目录

- [项目概述](#项目概述)
- [快速开始](#快速开始)
- [配置详解](#配置详解)
- [模型配置](#模型配置)
- [工作目录配置](#工作目录配置)
- [常见问题](#常见问题)
- [高级配置](#高级配置)
- [开发指南](#开发指南)

---

## 项目概述

**PiAgent_Project** 是一个基于 `@mariozechner/pi-coding-agent` 的 AI 编程助手封装项目，提供：

- 🤖 **交互式对话模式** - 实时与 AI 编程助手对话
- 🔧 **自动代码生成** - 通过命令行自动生成代码
- 🔄 **本地化核心包** - 便于查看和修改核心代码
- 🌐 **多 API 支持** - OpenAI、DeepSeek、Anthropic 等

### 项目结构

```
PiAgent_Project/
├── .env                      # 环境变量配置（API Key 等）
├── run_agent.js              # 交互模式入口
├── auto_code.js              # 自动代码生成入口
├── sync_pi_agent.js          # 同步核心包脚本
├── start_agent.bat           # Windows 交互模式启动脚本
├── auto_code.bat             # Windows 自动生成启动脚本
└── pi-agent/                 # 本地核心包目录
    └── node_modules/@mariozechner/
        ├── pi-coding-agent/  # 主包（CLI 和编程助手）
        ├── pi-agent-core/    # 核心代理逻辑
        ├── pi-ai/           # AI 模型集成层
        └── pi-tui/          # 终端用户界面
```

---

## 快速开始

### 1. 环境要求

- **Node.js** >= 18.0.0
- **npm** 或 **pnpm**
- **Git**（可选，用于版本控制）
- **fd** 和 **ripgrep**（可选，提升文件搜索性能）

### 2. 安装依赖

```bash
cd d:\3DPro\PiAgent_Project
npm install
```

### 3. 配置 API

创建 `.env` 文件：

```ini
# DeepSeek API 配置（推荐，国内友好）
OPENAI_API_KEY=sk-your-deepseek-api-key

# 或使用 OpenAI 官方
# OPENAI_API_KEY=sk-your-openai-api-key

# GitHub 镜像（可选，解决下载问题）
PI_GITHUB_API_BASE=https://ghproxy.net/https://api.github.com
PI_GITHUB_DOWNLOAD_BASE=https://ghproxy.net/https://github.com
```

### 4. 配置模型

创建 `~/.pi/agent/models.json`（Windows: `C:\Users\<用户名>\.pi\agent\models.json`）：

```json
{
  "providers": {
    "openai": {
      "baseUrl": "https://api.deepseek.com/v1",
      "apiKey": "${OPENAI_API_KEY}",
      "models": [
        {
          "id": "deepseek-chat",
          "name": "DeepSeek Chat",
          "api": "openai-completions",
          "contextWindow": 64000,
          "maxTokens": 4096,
          "input": ["text"],
          "cost": {
            "input": 0.14,
            "output": 0.28,
            "cacheRead": 0,
            "cacheWrite": 0
          }
        }
      ]
    }
  }
}
```

### 5. 启动

```bash
# 交互模式
.\start_agent.bat

# 或直接运行
node run_agent.js
```

---

## 配置详解

### 环境变量（.env）

| 变量名 | 说明 | 示例 |
|--------|------|------|
| `OPENAI_API_KEY` | OpenAI/DeepSeek API 密钥 | `sk-xxxx` |
| `ANTHROPIC_API_KEY` | Anthropic API 密钥 | `sk-ant-xxxx` |
| `GEMINI_API_KEY` | Google Gemini API 密钥 | `xxxx` |
| `PI_GITHUB_API_BASE` | GitHub API 镜像地址 | `https://ghproxy.net/https://api.github.com` |
| `PI_GITHUB_DOWNLOAD_BASE` | GitHub 下载镜像地址 | `https://ghproxy.net/https://github.com` |
| `PI_OFFLINE` | 离线模式 | `1` 或 `true` |
| `PI_SKIP_VERSION_CHECK` | 跳过版本检查 | `1` 或 `true` |

### 全局配置文件

位置：`~/.pi/agent/`

| 文件 | 说明 |
|------|------|
| `settings.json` | 全局设置（Shell、主题等） |
| `models.json` | 自定义模型配置 |
| `auth.json` | OAuth 认证信息 |
| `sessions/` | 会话历史记录 |
| `tools/` | 自定义工具 |
| `themes/` | 自定义主题 |
| `prompts/` | 提示词模板 |

### settings.json 配置

```json
{
  "shellPath": "C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
  "theme": "default",
  "thinkingLevel": "medium",
  "transport": "auto"
}
```

**常用配置项：**

| 配置项 | 说明 | 可选值 |
|--------|------|--------|
| `shellPath` | Shell 路径 | PowerShell、Git Bash、CMD |
| `theme` | 主题名称 | `default`、`dark`、`light` 或自定义 |
| `thinkingLevel` | 思考级别 | `none`、`low`、`medium`、`high` |
| `transport` | API 传输方式 | `auto`、`sse`、`websocket` |
| `steeringMode` | 转向消息模式 | `one-at-a-time`、`all` |
| `followUpMode` | 跟进消息模式 | `one-at-a-time`、`all` |

---

## 模型配置

### DeepSeek 配置（推荐国内用户）

```json
{
  "providers": {
    "openai": {
      "baseUrl": "https://api.deepseek.com/v1",
      "apiKey": "${OPENAI_API_KEY}",
      "models": [
        {
          "id": "deepseek-chat",
          "name": "DeepSeek Chat",
          "api": "openai-completions",
          "contextWindow": 64000,
          "maxTokens": 4096,
          "input": ["text"],
          "cost": {
            "input": 0.14,
            "output": 0.28,
            "cacheRead": 0,
            "cacheWrite": 0
          }
        },
        {
          "id": "deepseek-reasoner",
          "name": "DeepSeek Reasoner (R1)",
          "api": "openai-completions",
          "contextWindow": 64000,
          "maxTokens": 4096,
          "input": ["text"],
          "reasoning": true,
          "cost": {
            "input": 0.55,
            "output": 2.19,
            "cacheRead": 0,
            "cacheWrite": 0
          }
        }
      ]
    }
  }
}
```

### OpenAI 官方配置

```json
{
  "providers": {
    "openai": {
      "baseUrl": "https://api.openai.com/v1",
      "apiKey": "${OPENAI_API_KEY}",
      "models": [
        {
          "id": "gpt-4o",
          "name": "GPT-4o",
          "api": "openai-completions",
          "contextWindow": 128000,
          "maxTokens": 16384,
          "input": ["text", "image"],
          "cost": {
            "input": 2.5,
            "output": 10.0,
            "cacheRead": 1.25,
            "cacheWrite": 2.5
          }
        }
      ]
    }
  }
}
```

### OpenRouter 配置（聚合多模型）

```json
{
  "providers": {
    "openrouter": {
      "baseUrl": "https://openrouter.ai/api/v1",
      "apiKey": "${OPENROUTER_API_KEY}",
      "models": [
        {
          "id": "anthropic/claude-3.5-sonnet",
          "name": "Claude 3.5 Sonnet",
          "api": "openai-completions",
          "contextWindow": 200000,
          "maxTokens": 8192,
          "input": ["text", "image"],
          "cost": {
            "input": 3.0,
            "output": 15.0,
            "cacheRead": 0,
            "cacheWrite": 0
          }
        }
      ]
    }
  }
}
```

### 本地模型配置（Ollama）

```json
{
  "providers": {
    "ollama": {
      "baseUrl": "http://localhost:11434/v1",
      "apiKey": "ollama",
      "models": [
        {
          "id": "llama3.1:70b",
          "name": "Llama 3.1 70B",
          "api": "openai-completions",
          "contextWindow": 128000,
          "maxTokens": 4096,
          "input": ["text"],
          "cost": {
            "input": 0,
            "output": 0,
            "cacheRead": 0,
            "cacheWrite": 0
          }
        }
      ]
    }
  }
}
```

### 模型配置字段说明

| 字段 | 必填 | 说明 |
|------|------|------|
| `id` | ✅ | 模型 ID，API 调用时使用 |
| `name` | ❌ | 显示名称 |
| `api` | ✅ | API 类型：`openai-completions`、`anthropic-messages`、`google-gemini` |
| `contextWindow` | ❌ | 上下文窗口大小，默认 128000 |
| `maxTokens` | ❌ | 最大输出 token，默认 16384 |
| `input` | ❌ | 输入类型：`["text"]` 或 `["text", "image"]` |
| `reasoning` | ❌ | 是否支持思考/推理模式 |
| `cost` | ❌ | 成本配置（美元/百万 token） |

---

## 工作目录配置

### 方法一：在目标目录启动（推荐）

```bash
cd D:\你的项目目录
d:\3DPro\PiAgent_Project\start_agent.bat
```

### 方法二：创建项目启动脚本

创建 `start_project.bat`：

```batch
@echo off
cd /d D:\你的项目目录
d:\3DPro\PiAgent_Project\start_agent.bat
```

### 方法三：修改启动脚本

编辑 `start_agent.bat`：

```batch
@echo off
cd /d D:\你的项目目录   :: 修改这里
cd /d %~dp0
...
```

### 方法四：命令行指定

```bash
node run_agent.js --cwd D:\你的项目目录
```

### 方法五：会话内切换

在 PiAgent 内部使用命令：

```
/cd D:\你的项目目录
```

---

## 常见问题

### 1. 连接错误 (Connection error)

**原因：**
- API Key 无效或过期
- 网络无法访问 API 端点
- 配置文件格式错误

**解决方案：**

```bash
# 测试 API 连接
powershell -Command "Invoke-RestMethod -Uri 'https://api.deepseek.com/v1/models' -Headers @{'Authorization'='Bearer YOUR_API_KEY'}"
```

检查：
1. `.env` 文件中的 API Key 是否正确
2. `models.json` 格式是否正确
3. 网络是否能访问 API 地址

### 2. 请求超时 (Request timed out)

**解决方案：**

在 `.env` 中添加：

```ini
OPENAI_TIMEOUT=120000
```

### 3. GitHub 下载失败 (403 错误)

**解决方案：**

在 `.env` 中配置镜像：

```ini
PI_GITHUB_API_BASE=https://ghproxy.net/https://api.github.com
PI_GITHUB_DOWNLOAD_BASE=https://ghproxy.net/https://github.com
```

或手动安装工具：

```bash
winget install sharkdp.fd
winget install BurntSushi.ripgrep.MSVC
```

### 4. Git Bash 未找到

**解决方案：**

在 `settings.json` 中配置 Shell：

```json
{
  "shellPath": "C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe"
}
```

### 5. 环境变量未生效

**原因：** `run_agent.js` 中 `spawn` 未传递环境变量

**解决方案：** 已修复，确保使用最新版本的 `run_agent.js`

### 6. models.json 格式错误

**正确格式：**

```json
{
  "providers": {
    "provider-name": {
      "baseUrl": "...",
      "apiKey": "...",
      "models": [...]
    }
  }
}
```

注意：必须有 `providers` 顶层字段！

---

## 高级配置

### 项目级配置

在项目根目录创建 `.pi/settings.json`：

```json
{
  "theme": "project-theme",
  "thinkingLevel": "high"
}
```

### AGENTS.md 上下文文件

在项目根目录创建 `AGENTS.md`，为 AI 提供项目上下文：

```markdown
# 项目说明

这是一个 Node.js 项目...

## 技术栈
- Node.js
- TypeScript
- ...

## 编码规范
- 使用 ESLint
- ...
```

### 自定义提示词模板

创建 `~/.pi/agent/prompts/` 目录，添加 `.md` 文件：

```markdown
# review.md
请审查以下代码，关注：
1. 性能问题
2. 安全隐患
3. 代码风格
```

使用：`/review`

### 自定义主题

创建 `~/.pi/agent/themes/my-theme.json`：

```json
{
  "name": "My Theme",
  "colors": {
    "primary": "#00ff00",
    "background": "#1a1a1a"
  }
}
```

---

## 开发指南

### 核心包说明

| 包名 | 说明 | 主要文件 |
|------|------|----------|
| `pi-coding-agent` | 主包，CLI 入口 | `dist/cli.js` |
| `pi-agent-core` | 核心代理逻辑 | Agent、Tool、Event |
| `pi-ai` | AI 模型集成 | Provider、Model、Stream |
| `pi-tui` | 终端 UI | 渲染、组件、主题 |

### 修改核心代码

1. 同步核心包到本地：

```bash
node sync_pi_agent.js
```

2. 修改 `pi-agent/node_modules/@mariozechner/` 下的代码

3. 重新启动测试

### 添加自定义工具

创建 `~/.pi/agent/tools/my-tool.js`：

```javascript
export default {
  name: 'my-tool',
  description: 'My custom tool',
  parameters: {
    type: 'object',
    properties: {
      input: { type: 'string' }
    }
  },
  execute: async (args) => {
    return `Result: ${args.input}`;
  }
};
```

### 调试模式

```bash
# 启用调试日志
set PI_DEBUG=1
node run_agent.js
```

调试日志位置：`~/.pi/agent/pi-debug.log`

---

## 快捷键参考

| 快捷键 | 功能 |
|--------|------|
| `Ctrl+C` | 清空编辑器 |
| `Ctrl+C` 两次 | 退出 |
| `Escape` | 取消/中止 |
| `Ctrl+L` | 打开模型选择器 |
| `Ctrl+P` | 向前切换模型 |
| `Shift+Ctrl+P` | 向后切换模型 |
| `Shift+Tab` | 循环思考级别 |
| `Ctrl+O` | 折叠/展开工具输出 |
| `Ctrl+T` | 折叠/展开思考块 |
| `Alt+Enter` | 排队跟进消息 |
| `Ctrl+V` | 粘贴图片 |
| `@` | 文件引用 |
| `/` | 命令模式 |
| `!` | Bash 命令 |

---

## 命令参考

| 命令 | 说明 |
|------|------|
| `/login` | OAuth 登录 |
| `/logout` | 登出 |
| `/model` | 切换模型 |
| `/settings` | 打开设置 |
| `/new` | 新建会话 |
| `/resume` | 恢复会话 |
| `/tree` | 会话树导航 |
| `/fork` | 分支会话 |
| `/compact` | 压缩上下文 |
| `/copy` | 复制最后回复 |
| `/export` | 导出会话 |
| `/share` | 分享会话 |
| `/reload` | 重载配置 |
| `/quit` | 退出 |

---

## 资源链接

- **pi-coding-agent GitHub**: https://github.com/badlogic/pi-mono
- **DeepSeek 开放平台**: https://platform.deepseek.com/
- **OpenAI Platform**: https://platform.openai.com/
- **OpenRouter**: https://openrouter.ai/

---

## 更新日志

- **2025-03-19**: 创建文档，配置 DeepSeek 支持，修复环境变量传递问题
