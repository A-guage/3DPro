/**
 * PiAgent MCP Extension
 *
 * 为 PiAgent 添加标准 MCP (Model Context Protocol) 支持
 * 通过 MCP 可以连接 Claude Desktop、Cursor 等支持的外部工具服务
 *
 * 使用方式：
 *   1. 配置文件: 在项目根目录创建 mcp-config.json
 *   2. 启动命令: pi -e ./extensions/mcp-extension.js "你的需求"
 *   或者使用默认配置文件 ~/.pi/mcp-config.json
 *
 * 配置文件格式：
 * {
 *   "mcpServers": {
 *     "unrealMCP": {
 *       "command": "uv",
 *       "args": ["--directory", "d:/3DPro/unreal-mcp-main/Python", "run", "unreal_mcp_server.py"]
 *     }
 *   }
 * }
 */

import { spawn } from "child_process";
import { readFileSync, existsSync } from "fs";
import { join, homedir } from "path";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

interface MCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties?: Record<string, any>;
    required?: string[];
  };
}

interface MCPServerConfig {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

interface MCPConfig {
  mcpServers: Record<string, MCPServerConfig>;
}

interface MCPConnection {
  process: ReturnType<typeof spawn>;
  tools: Map<string, MCPTool>;
  requestId: number;
  pendingRequests: Map<number, { resolve: (value: any) => void; reject: (reason: any) => void }>;
}

class MCPClient {
  private connections: Map<string, MCPConnection> = new Map();
  private tools: Map<string, { serverName: string; tool: MCPTool }> = new Map();

  async connect(serverName: string, config: MCPServerConfig): Promise<void> {
    if (this.connections.has(serverName)) {
      console.log(`[MCP] Server "${serverName}" already connected`);
      return;
    }

    console.log(`[MCP] Connecting to server "${serverName}"...`);
    console.log(`[MCP] Command: ${config.command} ${config.args.join(" ")}`);

    return new Promise((resolve, reject) => {
      const child = spawn(config.command, config.args, {
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env, ...config.env },
      });

      const connection: MCPConnection = {
        process: child,
        tools: new Map(),
        requestId: 0,
        pendingRequests: new Map(),
      };

      let stdoutBuffer = "";

      child.stdout?.on("data", (data: Buffer) => {
        stdoutBuffer += data.toString();
        const lines = stdoutBuffer.split("\n");
        stdoutBuffer = lines.pop() || "";

        for (const line of lines) {
          if (line.trim()) {
            try {
              const response = JSON.parse(line);
              this.handleMessage(serverName, response);
            } catch (e) {
              console.warn(`[MCP] Failed to parse response: ${line}`);
            }
          }
        }
      });

      child.stderr?.on("data", (data: Buffer) => {
        console.warn(`[MCP] ${serverName} stderr: ${data.toString().trim()}`);
      });

      child.on("error", (err) => {
        console.error(`[MCP] ${serverName} process error: ${err.message}`);
        this.connections.delete(serverName);
        reject(err);
      });

      child.on("exit", (code) => {
        console.log(`[MCP] ${serverName} exited with code ${code}`);
        this.connections.delete(serverName);
      });

      this.connections.set(serverName, connection);

      this.sendRequest(serverName, "initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "piagent-mcp-extension", version: "1.0.0" },
      })
        .then(() => {
          console.log(`[MCP] ${serverName} initialized successfully`);
          return this.sendNotification(serverName, "notifications/initialized", {});
        })
        .then(() => this.listTools(serverName))
        .then(() => resolve())
        .catch(reject);
    });
  }

  private sendRequest(serverName: string, method: string, params: any): Promise<any> {
    const connection = this.connections.get(serverName);
    if (!connection) {
      return Promise.reject(new Error(`Server "${serverName}" not connected`));
    }

    const id = ++connection.requestId;
    const request = { jsonrpc: "2.0", id, method, params };

    return new Promise((resolve, reject) => {
      connection.pendingRequests.set(id, { resolve, reject });
      connection.process.stdin?.write(JSON.stringify(request) + "\n");

      setTimeout(() => {
        const pending = connection.pendingRequests.get(id);
        if (pending) {
          connection.pendingRequests.delete(id);
          reject(new Error(`Request ${method} timed out`));
        }
      }, 60000);
    });
  }

  private sendNotification(serverName: string, method: string, params: any): Promise<void> {
    const connection = this.connections.get(serverName);
    if (!connection) {
      return Promise.reject(new Error(`Server "${serverName}" not connected`));
    }

    const notification = { jsonrpc: "2.0", method, params };
    connection.process.stdin?.write(JSON.stringify(notification) + "\n");
    return Promise.resolve();
  }

  private handleMessage(serverName: string, message: any): void {
    if (message.id === undefined) {
      if (message.method === "notifications/tool_list_changed") {
        this.listTools(serverName);
      }
      return;
    }

    const connection = this.connections.get(serverName);
    if (!connection) return;

    const pending = connection.pendingRequests.get(message.id);
    if (pending) {
      connection.pendingRequests.delete(message.id);
      if (message.error) {
        pending.reject(new Error(message.error.message || "Unknown error"));
      } else {
        pending.resolve(message.result);
      }
    }
  }

  private async listTools(serverName: string): Promise<void> {
    try {
      const result = await this.sendRequest(serverName, "tools/list", {});
      const connection = this.connections.get(serverName);
      if (!connection) return;

      connection.tools.clear();

      for (const tool of result.tools || []) {
        connection.tools.set(tool.name, tool);
        this.tools.set(`${serverName}:${tool.name}`, { serverName, tool });
      }

      console.log(`[MCP] ${serverName} has ${result.tools?.length || 0} tools`);
    } catch (e) {
      console.error(`[MCP] Failed to list tools from ${serverName}: ${e}`);
    }
  }

  async callTool(serverName: string, toolName: string, args: Record<string, any>): Promise<any> {
    console.log(`[MCP] Calling ${serverName}:${toolName} with args:`, args);

    const result = await this.sendRequest(serverName, "tools/call", {
      name: toolName,
      arguments: args,
    });

    return result;
  }

  getTools(): Array<{ serverName: string; tool: MCPTool }> {
    return Array.from(this.tools.values()).map((v) => ({
      serverName: v.serverName,
      tool: v.tool,
    }));
  }

  disconnect(serverName: string): void {
    const connection = this.connections.get(serverName);
    if (connection) {
      connection.process.kill();
      this.connections.delete(serverName);

      for (const [key, value] of this.tools.entries()) {
        if (value.serverName === serverName) {
          this.tools.delete(key);
        }
      }
    }
  }

  disconnectAll(): void {
    for (const serverName of this.connections.keys()) {
      this.disconnect(serverName);
    }
  }
}

const mcpClient = new MCPClient();

function loadMCPConfig(): MCPConfig | null {
  const possiblePaths = [
    join(process.cwd(), "mcp-config.json"),
    join(process.cwd(), ".mcp", "config.json"),
    join(homedir(), ".pi", "mcp-config.json"),
    join(homedir(), ".config", "claude-desktop", "mcp.json"),
    join(process.env.APPDATA || "", "Claude", "claude_desktop_config.json"),
  ];

  for (const configPath of possiblePaths) {
    try {
      if (existsSync(configPath)) {
        const content = readFileSync(configPath, "utf-8");
        const config = JSON.parse(content);

        if (config.mcpServers) {
          console.log(`[MCP] Loaded config from: ${configPath}`);
          return config as MCPConfig;
        }

        if (config.mcpServers) {
          return config as MCPConfig;
        }
      }
    } catch (e) {
      console.warn(`[MCP] Failed to load config from ${configPath}: ${e}`);
    }
  }

  return null;
}

function createToolSchema(inputSchema: any) {
  if (!inputSchema || inputSchema.type !== "object") {
    return Type.Object({});
  }

  const properties: Record<string, any> = {};
  const required: string[] = inputSchema.required || [];

  for (const [key, value] of Object.entries(inputSchema.properties || {})) {
    let schema: any;

    switch (value.type) {
      case "string":
        schema = Type.String({ description: value.description });
        break;
      case "number":
        schema = Type.Number({ description: value.description });
        break;
      case "integer":
        schema = Type.Integer({ description: value.description });
        break;
      case "boolean":
        schema = Type.Boolean({ description: value.description });
        break;
      case "array":
        schema = Type.Array(Type.Any(), { description: value.description });
        break;
      case "object":
        schema = Type.Any({ description: value.description });
        break;
      default:
        schema = Type.Any({ description: value.description });
    }

    properties[key] = schema;
  }

  return Type.Object(properties, { additionalProperties: true });
}

export default function mcpExtension(pi: ExtensionAPI) {
  let connected = false;
  const registeredTools: string[] = [];

  async function connectToServers() {
    if (connected) return;
    connected = true;

    const config = loadMCPConfig();
    if (!config) {
      console.log("[MCP] No MCP config found, extension not active");
      return;
    }

    for (const [serverName, serverConfig] of Object.entries(config.mcpServers)) {
      try {
        await mcpClient.connect(serverName, serverConfig);
      } catch (e) {
        console.error(`[MCP] Failed to connect to ${serverName}: ${e}`);
      }
    }

    for (const { serverName, tool } of mcpClient.getTools()) {
      const fullName = `${serverName}_${tool.name}`;
      const schema = createToolSchema(tool.inputSchema);

      pi.registerTool({
        name: fullName,
        label: `[MCP] ${tool.name}`,
        description: tool.description || `MCP tool from ${serverName}`,
        parameters: schema,

        async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
          try {
            const result = await mcpClient.callTool(serverName, tool.name, params);

            if (result.content) {
              return {
                content: result.content,
                details: { server: serverName, tool: tool.name },
              };
            }

            return {
              content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
              details: { server: serverName, tool: tool.name },
            };
          } catch (e: any) {
            const errorContext = getMCPErrorContext(tool.name, e.message);
            return {
              content: [{ type: "text" as const, text: errorContext }],
              isError: true,
            };
          }
        },
      });

      registeredTools.push(fullName);
      console.log(`[MCP] Registered tool: ${fullName}`);
    }
  }

  pi.on("session_start", async () => {
    await connectToServers();
  });

  pi.on("session_shutdown", () => {
    mcpClient.disconnectAll();
    connected = false;
    registeredTools.length = 0;
  });

  pi.registerCommand({
    name: "mcp-list",
    description: "List all connected MCP servers and their tools",
    handler: async () => {
      const tools = mcpClient.getTools();
      const servers = new Map<string, number>();

      for (const { serverName } of tools) {
        servers.set(serverName, (servers.get(serverName) || 0) + 1);
      }

      console.log("\n[MCP] Connected servers:");
      for (const [server, count] of servers.entries()) {
        console.log(`  - ${server}: ${count} tools`);
      }
      console.log();
    },
  });

  pi.registerCommand({
    name: "mcp-reconnect",
    description: "Reconnect to all MCP servers",
    handler: async () => {
      mcpClient.disconnectAll();
      connected = false;
      await connectToServers();
      console.log("[MCP] Reconnection complete");
    },
  });
}

function getMCPErrorContext(toolName, errorMessage) {
  const lowerError = errorMessage.toLowerCase();

  if (lowerError.includes('timeout') || lowerError.includes('超时')) {
    return `[MCP Error] 调用 ${toolName} 工具失败：连接超时。请直接告知用户，无法连接到Unreal Engine，请求用户检查Unreal Editor是否已启动并运行UnrealMCP插件。不要尝试通过其他方式完成此操作。`;
  }

  if (lowerError.includes('connectionrefused') || lowerError.includes('连接被拒绝') || lowerError.includes('econnrefused')) {
    return `[MCP Error] 调用 ${toolName} 工具失败：连接被拒绝。请直接告知用户，Unreal Engine MCP服务未运行，请求用户检查Unreal Editor是否已启动并运行UnrealMCP插件。不要尝试通过其他方式完成此操作。`;
  }

  if (lowerError.includes('econnreset') || lowerError.includes('连接重置')) {
    return `[MCP Error] 调用 ${toolName} 工具失败：连接被重置。请直接告知用户，Unreal Engine已断开连接，请求用户检查Unreal Editor状态。不要尝试通过其他方式完成此操作。`;
  }

  if (lowerError.includes('no response') || lowerError.includes('无响应')) {
    return `[MCP Error] 调用 ${toolName} 工具失败：Unreal Engine无响应。请直接告知用户，Unreal Engine可能处于忙碌状态，请求用户检查Editor是否卡住或需要响应。不要尝试通过其他方式完成此操作。`;
  }

  return `[MCP Error] 调用 ${toolName} 工具失败：${errorMessage}。请直接告知用户此错误，不要尝试通过其他方式完成此操作。`;
}