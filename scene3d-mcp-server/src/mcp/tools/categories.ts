// Category tools — create, list, delete

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createCategory, getCategories, deleteCategory } from "../../db/repositories/assets.js";
import { logToolCall, logToolResult, logToolError } from "../logger.js";

export function registerCategoryTools(server: McpServer): void {
  server.tool(
    "create_category",
    "Create a new asset category, optionally with a parent category.",
    {
      name: z.string().describe("Category name"),
      parent_id: z.number().optional().describe("Parent category ID for nesting"),
      icon: z.string().optional().describe("Icon identifier"),
      sort_order: z.number().optional().describe("Display sort order (default: 0)"),
    },
    async (params) => {
      const t0 = Date.now();
      logToolCall("create_category", params);
      try {
        const result = await createCategory(params.name, params.parent_id ?? null, params.icon ?? null, params.sort_order ?? 0);
        const data = { success: true, ...result };
        logToolResult("create_category", data, Date.now() - t0);
        return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logToolError("create_category", err, Date.now() - t0);
        const data = { success: false, error: msg };
        return {
          content: [{ type: "text" as const, text: JSON.stringify(data) }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "get_categories",
    "List all asset categories as a tree structure.",
    {},
    async () => {
      const t0 = Date.now();
      logToolCall("get_categories", {});
      try {
        const categories = await getCategories();
        const data = { success: true, categories, count: categories.length };
        logToolResult("get_categories", data, Date.now() - t0);
        return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logToolError("get_categories", err, Date.now() - t0);
        const data = { success: false, error: msg };
        return {
          content: [{ type: "text" as const, text: JSON.stringify(data) }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "delete_category",
    "Delete an asset category by ID.",
    {
      category_id: z.number().describe("Category ID to delete"),
    },
    async (params) => {
      const t0 = Date.now();
      logToolCall("delete_category", params);
      try {
        const ok = await deleteCategory(params.category_id);
        const data = { success: ok };
        logToolResult("delete_category", data, Date.now() - t0);
        return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logToolError("delete_category", err, Date.now() - t0);
        const data = { success: false, error: msg };
        return {
          content: [{ type: "text" as const, text: JSON.stringify(data) }],
          isError: true,
        };
      }
    },
  );
}
