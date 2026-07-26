// Logger — writes to a log file with level-based filtering

import { appendFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";

const LOG_FILE = process.env.SCENE3D_LOG_FILE ?? "D:\\3DPro\\scene3d-mcp-server\\scene3d.log";
const LOG_LEVEL = (process.env.SCENE3D_LOG_LEVEL ?? "debug").toLowerCase();

// Ensure log directory exists
const logDir = dirname(LOG_FILE);
if (!existsSync(logDir)) mkdirSync(logDir, { recursive: true });

const LEVELS: Record<string, number> = { debug: 0, info: 1, warn: 2, error: 3 };
const currentLevel = LEVELS[LOG_LEVEL] ?? 0;

function timestamp(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 23);
}

function writeLog(line: string): void {
  const plain = line.replace(/\x1b\[[0-9;]*m/g, "");
  try { appendFileSync(LOG_FILE, plain + "\n"); } catch { /* disk full, ignore */ }
}

function shouldLog(level: string): boolean {
  return (LEVELS[level] ?? 0) >= currentLevel;
}

// ── Generic log ──────────────────────────────────────────────────────────────

export function log(component: string, message: string, data?: unknown): void {
  if (!shouldLog("info")) return;
  const prefix = `${timestamp()} [INFO ] [${component}]`;
  const line = data !== undefined
    ? `${prefix} ${message} ${typeof data === "string" ? data : JSON.stringify(data)}`
    : `${prefix} ${message}`;
  writeLog(line);
}

export function debug(component: string, message: string, data?: unknown): void {
  if (!shouldLog("debug")) return;
  const prefix = `${timestamp()} [DEBUG] [${component}]`;
  const line = data !== undefined
    ? `${prefix} ${message} ${typeof data === "string" ? data : JSON.stringify(data)}`
    : `${prefix} ${message}`;
  writeLog(line);
}

export function warn(component: string, message: string, data?: unknown): void {
  if (!shouldLog("warn")) return;
  const prefix = `${timestamp()} [WARN ] [${component}]`;
  const line = data !== undefined
    ? `${prefix} ${message} ${typeof data === "string" ? data : JSON.stringify(data)}`
    : `${prefix} ${message}`;
  writeLog(line);
}

export function error(component: string, message: string, data?: unknown): void {
  if (!shouldLog("error")) return;
  const prefix = `${timestamp()} [ERROR] [${component}]`;
  const line = data !== undefined
    ? `${prefix} ${message} ${typeof data === "string" ? data : JSON.stringify(data)}`
    : `${prefix} ${message}`;
  writeLog(line);
}

// ── Tool call helpers ────────────────────────────────────────────────────────

export function logToolCall(toolName: string, params: unknown): void {
  if (!shouldLog("info")) return;
  const prefix = `${timestamp()} [INFO ] ▸ TOOL ${toolName}`;
  const line = `${prefix} params=${JSON.stringify(params)}`;
  writeLog(line);
}

export function logToolResult(toolName: string, result: unknown, elapsedMs: number): void {
  if (!shouldLog("info")) return;
  const tag = elapsedMs > 5000 ? "SLOW" : elapsedMs > 1000 ? "INFO" : "INFO";
  const prefix = `${timestamp()} [${tag}] ◂ TOOL ${toolName} ${elapsedMs}ms`;
  const resultStr = JSON.stringify(result);
  const truncated = resultStr.length > 2000 ? resultStr.slice(0, 2000) + "...(truncated)" : resultStr;
  const line = `${prefix} result=${truncated}`;
  writeLog(line);
}

export function logToolError(toolName: string, err: unknown, elapsedMs: number): void {
  if (!shouldLog("error")) return;
  const prefix = `${timestamp()} [ERROR] ✗ TOOL ${toolName} ${elapsedMs}ms`;
  const detail = err instanceof Error ? `${err.message}\n${err.stack}` : JSON.stringify(err);
  const line = `${prefix} error=${detail}`;
  writeLog(line);
}

// ── API call helpers ─────────────────────────────────────────────────────────

export function logApiCall(provider: string, action: string, params: unknown): void {
  if (!shouldLog("debug")) return;
  const prefix = `${timestamp()} [DEBUG] ▸ API ${provider}/${action}`;
  const line = `${prefix} params=${JSON.stringify(params)}`;
  writeLog(line);
}

export function logApiResult(provider: string, action: string, result: unknown, elapsedMs: number): void {
  if (!shouldLog("debug")) return;
  const prefix = `${timestamp()} [DEBUG] ◂ API ${provider}/${action} ${elapsedMs}ms`;
  const resultStr = JSON.stringify(result);
  const truncated = resultStr.length > 2000 ? resultStr.slice(0, 2000) + "...(truncated)" : resultStr;
  const line = `${prefix} result=${truncated}`;
  writeLog(line);
}

export function logApiError(provider: string, action: string, err: unknown, elapsedMs: number): void {
  if (!shouldLog("error")) return;
  const prefix = `${timestamp()} [ERROR] ✗ API ${provider}/${action} ${elapsedMs}ms`;
  const detail = err instanceof Error ? `${err.message}\n${err.stack}` : JSON.stringify(err);
  const line = `${prefix} error=${detail}`;
  writeLog(line);
}

// ── Session marker ───────────────────────────────────────────────────────────

export function logSessionStart(): void {
  const line = `\n${"=".repeat(80)}\n${timestamp()} [INFO ] === MCP Server started (pid=${process.pid}) ===\n${"=".repeat(80)}`;
  writeLog(line);
}

export function logSessionEnd(): void {
  const line = `${timestamp()} [INFO ] === MCP Server exiting (pid=${process.pid}) ===\n${"=".repeat(80)}`;
  writeLog(line);
}
