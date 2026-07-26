#!/usr/bin/env node
// Entry point — starts MCP server in either stdio or HTTP mode

import { migrate } from "./db/migrate.js";
import { startAutoSave, saveDb, closeDb } from "./db/connection.js";
import { startMcpServer } from "./mcp/server.js";
import { loadConfig } from "./config.js";
import app from "./http/app.js";
import { logSessionStart, logSessionEnd, log, debug, warn, error as logError } from "./mcp/logger.js";

let autoSaveTimer: ReturnType<typeof setInterval> | null = null;

function shutdown(reason: string) {
  log("shutdown", `Shutting down: ${reason}`);
  if (autoSaveTimer) {
    clearInterval(autoSaveTimer);
    autoSaveTimer = null;
  }
  try { saveDb(); } catch {}
  try { closeDb(); } catch {}
  logSessionEnd();
  process.exit(0);
}

async function main() {
  logSessionStart();
  log("startup", `pid=${process.pid} node=${process.version} platform=${process.platform}`);
  log("startup", `cwd=${process.cwd()}`);
  log("startup", `env SCENE3D_HTTP_ONLY=${process.env.SCENE3D_HTTP_ONLY ?? "0"}`);
  log("startup", `env SCENE3D_LOG_LEVEL=${process.env.SCENE3D_LOG_LEVEL ?? "debug"}`);

  const isSubprocess = !process.stdin.isTTY;
  debug("startup", `isSubprocess=${isSubprocess} (stdin.isTTY=${process.stdin.isTTY})`);

  // Always run migrations and start auto-save
  log("startup", "Running database migrations...");
  await migrate();
  autoSaveTimer = startAutoSave(30_000);
  debug("startup", "Database migrations done, auto-save started (30s interval)");

  // Load config early for port
  const config = loadConfig();
  const port = config.scene3d.httpPort;

  log("startup", `Config loaded: provider=${config.scene3d.provider}, port=${port}`);
  log("startup", `Storage: ${config.scene3d.storageDir}, DB: ${config.scene3d.databasePath}`);

  const httpOnly = process.env.SCENE3D_HTTP_ONLY === "1";

  if (!httpOnly) {
    // Start MCP server on stdio (for agent tool calls)
    log("startup", "Starting MCP server on stdio...");
    await startMcpServer();
    log("startup", "MCP server ready");
  } else {
    log("startup", "SCENE3D_HTTP_ONLY=1 — skipping stdio MCP server");
  }

  // Start HTTP server for frontend (gateway proxy at /api/scene3d needs it).
  // Skip in subprocess (stdio) mode — the standalone instance handles HTTP.
  // This prevents the Node.js process from staying alive after stdin closes,
  // which would cause the MCP client's cleanup to hang.
  if (!isSubprocess) {
    const server = app.listen(port, () => {
      log("startup", `HTTP server listening on port ${port}`);
    });
    server.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        warn("startup", `HTTP port ${port} already in use — another instance may be running`);
      } else {
        warn("startup", `HTTP server error: ${err.message}`);
      }
    });

    // Log HTTP requests for debugging
    app.use((req, _res, next) => {
      debug("http", `${req.method} ${req.url}`);
      next();
    });
  } else {
    debug("startup", "Subprocess mode — skipping HTTP server (standalone instance handles it)");
  }
}

main().catch((err) => {
  logError("startup", `Fatal error: ${err instanceof Error ? err.message : String(err)}`);
  if (err instanceof Error && err.stack) {
    logError("startup", `Stack: ${err.stack}`);
  }
  logSessionEnd();
  process.exit(1);
});

// Graceful shutdown — clear timers, save DB, then exit
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
process.stdin.on("end", () => shutdown("stdin closed (MCP client disconnected)"));

// Log unhandled errors
process.on("uncaughtException", (err) => {
  logError("process", `Uncaught exception: ${err.message}`);
  if (err.stack) logError("process", `Stack: ${err.stack}`);
});

process.on("unhandledRejection", (reason) => {
  const msg = reason instanceof Error ? reason.message : String(reason);
  logError("process", `Unhandled rejection: ${msg}`);
  if (reason instanceof Error && reason.stack) {
    logError("process", `Stack: ${reason.stack}`);
  }
});
