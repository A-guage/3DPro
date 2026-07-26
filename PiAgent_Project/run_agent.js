const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const envPath = path.join(__dirname, ".env");
if (fs.existsSync(envPath)) {
  require("dotenv").config({ path: envPath });
} else {
  console.warn("[WARNING] .env file not found!");
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

const child = spawn(process.execPath, [cliPath], { 
  stdio: "inherit",
  env: { ...process.env }  // 显式传递环境变量（包括 dotenv 加载的）
});

child.on("exit", (code) => process.exit(code ?? 1));
child.on("error", (err) => {
  console.error("[ERROR] Failed to start pi-coding-agent:", err);
  process.exit(1);
});
