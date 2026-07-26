// scene3d_list_models — list generated models

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getHistoryList } from "../../db/repositories/scenes.js";
import { logToolCall, logToolResult, logToolError } from "../logger.js";

export function registerListModelsTool(server: McpServer): void {
  server.tool(
    "list_models",
    "List previously generated 3D models for a user.",
    {
      user_id: z.string().optional().describe("User ID to filter by"),
      limit: z.number().optional().describe("Max results (default 20)"),
    },
    async (params) => {
      const t0 = Date.now();
      logToolCall("list_models", params);
      try {
        const userId = params.user_id ?? "default";
        const limit = params.limit ?? 20;
        const items = await getHistoryList(userId, limit);
        const data = {
          success: true,
          items,
          count: items.length,
        };
        logToolResult("list_models", data, Date.now() - t0);
        return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logToolError("list_models", err, Date.now() - t0);
        const data = { success: false, error: msg };
        return {
          content: [{ type: "text" as const, text: JSON.stringify(data) }],
          isError: true,
        };
      }
    },
  );
}
