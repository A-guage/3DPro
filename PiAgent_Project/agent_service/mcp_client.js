/**
 * MCP 客户端模块
 *
 * 为 PiAgent Agent Service 提供 MCP 工具支持
 * 连接 MCP 服务器并将其工具转换为 PiAgent 自定义工具格式
 */

import { spawn } from "child_process";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = join(__filename, "..");

const BACKEND_URL = "http://localhost:8000";

export class MCPToolClient {
  constructor() {
    this.connections = new Map();
    this.tools = new Map();
  }

  loadConfig() {
    const possiblePaths = [
      join(process.cwd(), "mcp-config.json"),
      join(process.cwd(), ".mcp", "config.json"),
      join(homedir(), ".pi", "mcp-config.json"),
      join(__dirname, "..", "mcp-config.json"),
    ];

    console.log(`[MCP] Searching for config in ${possiblePaths.length} locations...`);
    for (const configPath of possiblePaths) {
      console.log(`[MCP]   Checking: ${configPath} (exists: ${existsSync(configPath)})`);
      try {
        if (existsSync(configPath)) {
          const content = readFileSync(configPath, "utf-8");
          const config = JSON.parse(content);
          if (config.mcpServers) {
            console.log(`[MCP] Loaded config from: ${configPath}`);
            return config;
          }
        }
      } catch (e) {
        console.warn(`[MCP] Failed to load config from ${configPath}: ${e}`);
      }
    }
    return null;
  }

  async connectAll() {
    console.log('[MCP] connectAll: Starting...');
    const config = this.loadConfig();

    console.log('[MCP] connectAll: Config result:', config ? 'found' : 'null');

    if (!config) {
      console.log("[MCP] No MCP config found - MCP will not be available");
      return;
    }

    console.log(`[MCP] Config found: ${Object.keys(config.mcpServers).join(", ")}`);

    for (const [serverName, serverConfig] of Object.entries(config.mcpServers)) {
      console.log(`[MCP] Attempting to connect to "${serverName}"...`);
      try {
        await this.connect(serverName, serverConfig);
        console.log(`[MCP] Successfully connected to "${serverName}"`);
      } catch (e) {
        console.error(`[MCP] Failed to connect to ${serverName}: ${e.message}`);
      }
    }
  }

  async connect(serverName, config) {
    if (this.connections.has(serverName)) {
      console.log(`[MCP] Server "${serverName}" already connected`);
      return;
    }

    console.log(`[MCP] Connecting to "${serverName}"...`);
    console.log(`[MCP] Command: ${config.command} ${config.args.join(" ")}`);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        console.error(`[MCP] ${serverName} connection timed out after 600s`);
        child.kill();
        reject(new Error(`Connection timeout for ${serverName}`));
      }, 600000);

      const child = spawn(config.command, config.args, {
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env, ...config.env },
        shell: true,
      });

      const connection = {
        process: child,
        tools: new Map(),
        requestId: 0,
        pendingRequests: new Map(),
      };

      let stdoutBuffer = "";

      child.stdout?.on("data", (data) => {
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

      child.stderr?.on("data", (data) => {
        console.warn(`[MCP] ${serverName} stderr: ${data.toString().trim()}`);
      });

      child.on("error", (err) => {
        clearTimeout(timeout);
        console.error(`[MCP] ${serverName} process error: ${err.message}`);
        console.error(`[MCP] Command not found: ${config.command}. Please ensure 'python' is installed and in PATH.`);
        this.connections.delete(serverName);
        reject(err);
      });

      child.on("exit", (code) => {
        clearTimeout(timeout);
        console.log(`[MCP] ${serverName} exited with code ${code}`);
        this.connections.delete(serverName);
      });

      this.connections.set(serverName, connection);

      this.sendRequest(serverName, "initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "piagent-agent-service", version: "1.0.0" },
      })
        .then(() => {
          console.log(`[MCP] ${serverName} initialized`);
          return this.sendNotification(serverName, "notifications/initialized", {});
        })
        .then(() => this.listTools(serverName))
        .then(() => resolve())
        .catch(reject);
    });
  }

  sendRequest(serverName, method, params) {
    const connection = this.connections.get(serverName);
    if (!connection) {
      console.log(`[MCP] sendRequest failed: Server "${serverName}" not in connections`);
      return Promise.reject(new Error(`Server "${serverName}" not connected`));
    }

    const id = ++connection.requestId;
    const request = { jsonrpc: "2.0", id, method, params };
    const requestStr = JSON.stringify(request) + "\n";
    console.log(`[MCP] sendRequest ${method} (id=${id}): ${requestStr.trim().substring(0, 100)}`);

    return new Promise((resolve, reject) => {
      connection.pendingRequests.set(id, { resolve, reject });

      const canWrite = connection.process.stdin?.write(requestStr);
      if (!canWrite) {
        console.log(`[MCP] Warning: stdin buffer full for ${method}`);
      } else {
        console.log(`[MCP] Request written to stdin for ${method} (id=${id})`);
      }

      setTimeout(() => {
        const pending = connection.pendingRequests.get(id);
        if (pending) {
          connection.pendingRequests.delete(id);
          console.log(`[MCP] Request ${method} (id=${id}) timed out after 600s`);
          reject(new Error(`Request ${method} timed out`));
        }
      }, 600000);
    });
  }

  sendNotification(serverName, method, params) {
    const connection = this.connections.get(serverName);
    if (!connection) {
      return Promise.reject(new Error(`Server "${serverName}" not connected`));
    }

    const notification = { jsonrpc: "2.0", method, params };
    connection.process.stdin?.write(JSON.stringify(notification) + "\n");
    return Promise.resolve();
  }

  handleMessage(serverName, message) {
    console.log(`[MCP] handleMessage from ${serverName}: ${JSON.stringify(message).substring(0, 100)}`);

    if (message.id === undefined) {
      if (message.method === "notifications/tool_list_changed") {
        this.listTools(serverName);
      }
      return;
    }

    const connection = this.connections.get(serverName);
    if (!connection) {
      console.log(`[MCP] handleMessage: no connection for ${serverName}`);
      return;
    }

    const pending = connection.pendingRequests.get(message.id);
    if (pending) {
      connection.pendingRequests.delete(message.id);
      if (message.error) {
        console.log(`[MCP] handleMessage: error for id ${message.id}: ${message.error.message}`);
        pending.reject(new Error(message.error.message || "Unknown error"));
      } else {
        console.log(`[MCP] handleMessage: resolved id ${message.id}`);
        pending.resolve(message.result);
      }
    } else {
      console.log(`[MCP] handleMessage: no pending request for id ${message.id}`);
    }
  }

  async listTools(serverName) {
    try {
      const result = await this.sendRequest(serverName, "tools/list", {});
      const connection = this.connections.get(serverName);
      if (!connection) return;

      for (const tool of result.tools || []) {
        connection.tools.set(tool.name, tool);
        const fullName = `${serverName}_${tool.name}`;
        this.tools.set(fullName, { serverName, tool });
      }

      console.log(`[MCP] ${serverName} has ${result.tools?.length || 0} tools`);
    } catch (e) {
      console.error(`[MCP] Failed to list tools from ${serverName}: ${e}`);
    }
  }

  async callTool(serverName, toolName, args) {
    console.log(`[MCP] Calling ${serverName}:${toolName} with args ${JSON.stringify(args)}`);

    try {
      const result = await this.sendRequest(serverName, "tools/call", {
        name: toolName,
        arguments: args,
      });
      console.log(`[MCP] ${serverName}:${toolName} returned result`);
      return result;
    } catch (e) {
      const isConnectionLost = e.message.includes("not connected") || e.message.includes("timed out");
      if (isConnectionLost) {
        console.log(`[MCP] Connection lost, attempting to reconnect...`);
        const config = this.loadConfig();
        if (config && config.mcpServers && config.mcpServers[serverName]) {
          this.connections.delete(serverName);
          try {
            await this.connect(serverName, config.mcpServers[serverName]);
            console.log(`[MCP] Reconnected, retrying ${toolName}...`);
            const result = await this.sendRequest(serverName, "tools/call", {
              name: toolName,
              arguments: args,
            });
            console.log(`[MCP] ${serverName}:${toolName} returned result after reconnect`);
            return result;
          } catch (reconnectErr) {
            console.log(`[MCP] Reconnect failed: ${reconnectErr.message}`);
            throw reconnectErr;
          }
        }
      }
      console.log(`[MCP] ${serverName}:${toolName} failed: ${e.message}`);
      throw e;
    }
  }

  getTools() {
    return Array.from(this.tools.entries()).map(([fullName, { serverName, tool }]) => ({
      fullName,
      serverName,
      tool,
    }));
  }

  disconnect(serverName) {
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

  disconnectAll() {
    for (const serverName of this.connections.keys()) {
      this.disconnect(serverName);
    }
  }

  createToolsForSession() {
    const mcpTools = [];

    for (const { fullName, serverName, tool } of this.getTools()) {
      const inputSchema = tool.inputSchema || { type: "object", properties: {} };
      const properties = {};
      const required = inputSchema.required || [];

      if (inputSchema.properties) {
        for (const [key, value] of Object.entries(inputSchema.properties)) {
          let schema;
          switch (value.type) {
            case "string":
              schema = { type: "string", description: value.description || "" };
              break;
            case "number":
              schema = { type: "number", description: value.description || "" };
              break;
            case "integer":
              schema = { type: "integer", description: value.description || "" };
              break;
            case "boolean":
              schema = { type: "boolean", description: value.description || "" };
              break;
            default:
              schema = { type: "string", description: value.description || "" };
          }
          properties[key] = schema;
        }
      }

      mcpTools.push({
        name: fullName,
        label: `[MCP] ${tool.name}`,
        description: tool.description || `MCP tool from ${serverName}`,
        parameters: {
          type: "object",
          properties,
          required,
        },
        execute: async (params, ...args) => {
          try {
            const actualParams = typeof params === 'string' ? (args[0] || {}) : params;
            const result = await this.callTool(serverName, tool.name, actualParams);
            if (result.content) {
              return {
                content: result.content,
                details: { server: serverName, tool: tool.name },
              };
            }
            return {
              content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
              details: { server: serverName, tool: tool.name },
            };
          } catch (e) {
            return {
              content: [{ type: "text", text: `[MCP Error] ${e.message}` }],
              isError: true,
            };
          }
        },
      });
    }

    return mcpTools;
  }
}

let mcpClient = null;

export async function getMCPTools() {
  if (!mcpClient) {
    console.log('[MCP] Initializing MCP client...');
    mcpClient = new MCPToolClient();
    console.log('[MCP] Connecting to all servers...');
    try {
      await Promise.race([
        mcpClient.connectAll(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('connectAll timeout')), 10000))
      ]);
      console.log('[MCP] Connection complete.');
    } catch (e) {
      console.error('[MCP] Connection error:', e.message);
    }
  }
  const tools = mcpClient.createToolsForSession();
  console.log(`[MCP] Total MCP tools available: ${tools.length}`);
  return tools;
}

export function getMCPClient() {
  return mcpClient;
}

export async function shutdownMCP() {
  if (mcpClient) {
    mcpClient.disconnectAll();
    mcpClient = null;
  }
}