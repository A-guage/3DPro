/**
 * PiAgent 启动脚本 - 支持 MCP 扩展
 *
 * 使用方式：
 *   node run_agent_with_mcp.js "你的需求"
 *
 * MCP 配置：
 *   编辑 mcp-config.json 文件添加 MCP 服务器配置
 */

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const envPath = path.join(__dirname, ".env");
if (fs.existsSync(envPath)) {
  require("dotenv").config({ path: envPath });
} else {
  console.warn("[WARNING] .env file not found!");
}

const mcpExtensionPath = path.join(__dirname, "extensions", "mcp-extension.js");

if (!fs.existsSync(mcpExtensionPath)) {
  console.error("[ERROR] MCP extension not found:", mcpExtensionPath);
  console.error("Please ensure extensions/mcp-extension.js exists");
  process.exit(1);
}

const localCliPath = path.join(
  __dirname,
  "pi-agent",
  "node_modules",
  "@mariozechner",
  "pi-coding-agent",
  "dist",
  "cli.js"
);
const fallbackCliPath = path.join(
  __dirname,
  "node_modules",
  "@mariozechner",
  "pi-coding-agent",
  "dist",
  "cli.js"
);

let cliPath = localCliPath;
if (!fs.existsSync(cliPath)) {
  cliPath = fallbackCliPath;
  if (fs.existsSync(cliPath)) {
    console.warn("[WARNING] Local core package not found. Run: node sync_pi_agent.js");
  }
}

if (!fs.existsSync(cliPath)) {
  console.error("[ERROR] pi-coding-agent not installed. Please run: npm install");
  process.exit(1);
}

const args = process.argv.slice(2);

const mcpArgIndex = args.findIndex((arg) => arg === "-e" || arg === "--extension" || arg === "--ext");
if (mcpArgIndex === -1) {
  args.push("-e");
  args.push(mcpExtensionPath);
} else {
  args.splice(mcpArgIndex + 1, 0, mcpExtensionPath);
}

console.log("[INFO] Starting PiAgent with MCP extension support");
console.log("[INFO] MCP config:", path.join(__dirname, "mcp-config.json"));

const child = spawn(process.execPath, [cliPath, ...args], {
  stdio: "inherit",
  env: { ...process.env },
});

child.on("exit", (code) => process.exit(code ?? 1));
child.on("error", (err) => {
  console.error("[ERROR] Failed to start pi-coding-agent:", err);
  process.exit(1);
});