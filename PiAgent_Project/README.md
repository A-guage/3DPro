# Pi Coding Agent 使用说明

本项目包含启动 Pi Coding Agent 的必要配置。

## 快速开始

1.  **配置环境变量**
    复制 `.env.example` 文件并重命名为 `.env`：
    ```bash
    cp .env.example .env
    ```
    或者是直接手动复制修改。

    打开 `.env` 文件并填入你的 API Key：
    ```ini
    OPENAI_API_KEY=sk-你的密钥
    OPENAI_BASE_URL=https://api.deepseek.com
    OPENAI_MODEL=deepseek-chat
    ```

2.  **安装依赖（首次）**
    在项目根目录执行：
    ```bash
    npm install
    ```

3.  **同步核心包到项目内（可选但推荐）**
    这一步会把 PiAgent 核心包复制到项目内的 `pi-agent/`，避免核心代码放在 `node_modules` 里：
    ```bash
    npm run sync
    ```
    或者双击 `sync_pi_agent.bat`。

4.  **启动 Agent**
    双击运行 `start_agent.bat` 脚本，或者在终端中运行：
    ```bash
    .\start_agent.bat
    ```
    这将执行本地入口 `run_agent.js`，优先使用项目内 `pi-agent/` 的核心代码。

5.  **自动写代码模式（命令行）**
    ```bash
    npm run auto -- "你的需求"
    ```
    或者使用文件作为需求输入：
    ```bash
    node auto_code.js -f prompt.txt
    ```

## MCP 扩展支持

PiAgent 支持通过 MCP (Model Context Protocol) 连接外部工具服务，如 Unreal Engine、Unity 等。

### 安装 MCP SDK
```bash
npm install @modelcontextprotocol/sdk
```

### 配置 MCP 服务器
编辑 `mcp-config.json` 文件：
```json
{
  "mcpServers": {
    "unrealMCP": {
      "command": "uv",
      "args": [
        "--directory",
        "d:/3DPro/unreal-mcp-main/Python",
        "run",
        "unreal_mcp_server.py"
      ]
    }
  }
}
```

### 启动带 MCP 支持的 Agent
```bash
node run_agent_with_mcp.js "你的需求"
```

### MCP 相关命令
- `/mcp-list` - 查看已连接的 MCP 服务器和工具列表
- `/mcp-reconnect` - 重新连接所有 MCP 服务器

### 扩展文件位置
- `extensions/mcp-extension.js` - MCP 扩展实现
- `mcp-config.json` - MCP 服务器配置

## 文件说明

-   `start_agent.bat`: Windows 批处理脚本，用于启动代理。
-   `run_agent_with_mcp.js`: 支持 MCP 扩展的启动脚本。
-   `.env.example`: 环境变量配置模板。
-   `README.md`: 本说明文件。
