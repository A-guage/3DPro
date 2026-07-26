// MCP Server — registers tools for the DeerFlow Agent

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerGenerateTool } from "./tools/generate.js";
import { registerStatusTool } from "./tools/status.js";
import { registerListModelsTool } from "./tools/list-models.js";
import { registerPlanSceneTool } from "./tools/plan-scene.js";
import { registerAssetTools } from "./tools/assets.js";
import { registerCategoryTools } from "./tools/categories.js";
import { registerTagTools } from "./tools/tags.js";
import { registerModelLibraryTools } from "./tools/model-library.js";
import { log, debug, warn } from "./logger.js";

export function createMcpServer(): McpServer {
  debug("mcp", "Creating MCP server, registering tools...");

  const server = new McpServer({
    name: "scene3d-mcp-server",
    version: "0.1.0",
  });

  registerGenerateTool(server);
  registerStatusTool(server);
  registerListModelsTool(server);
  registerPlanSceneTool(server);
  registerAssetTools(server);
  registerCategoryTools(server);
  registerTagTools(server);
  registerModelLibraryTools(server);

  debug("mcp", "All tools registered");
  return server;
}

export async function startMcpServer(): Promise<void> {
  const server = createMcpServer();

  log("mcp", "Creating stdio transport...");
  const transport = new StdioServerTransport();

  log("mcp", "Connecting MCP server to stdio...");
  await server.connect(transport);

  log("mcp", "MCP server connected and ready on stdio");
  warn("mcp", "MCP server started — waiting for tool discovery requests from Agent");
}
