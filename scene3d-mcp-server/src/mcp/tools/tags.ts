// Tag tools — create, list, delete

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createTag, getTags, deleteTag } from "../../db/repositories/assets.js";
import { logToolCall, logToolResult, logToolError } from "../logger.js";

export function registerTagTools(server: McpServer): void {
  server.tool(
    "create_tag",
    "Create a new tag for categorizing assets. Returns existing tag if name already exists.",
    {
      name: z.string().describe("Tag name"),
      color: z.string().optional().describe("Tag color in hex, e.g. #ff5722"),
    },
    async (params) => {
      const t0 = Date.now();
      logToolCall("create_tag", params);
      try {
        const result = await createTag(params.name, params.color ?? null);
        const data = { success: true, ...result };
        logToolResult("create_tag", data, Date.now() - t0);
        return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logToolError("create_tag", err, Date.now() - t0);
        const data = { success: false, error: msg };
        return {
          content: [{ type: "text" as const, text: JSON.stringify(data) }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "get_tags",
    "List all available tags.",
    {},
    async () => {
      const t0 = Date.now();
      logToolCall("get_tags", {});
      try {
        const tags = await getTags();
        const data = { success: true, tags, count: tags.length };
        logToolResult("get_tags", data, Date.now() - t0);
        return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logToolError("get_tags", err, Date.now() - t0);
        const data = { success: false, error: msg };
        return {
          content: [{ type: "text" as const, text: JSON.stringify(data) }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "delete_tag",
    "Delete a tag by ID.",
    {
      tag_id: z.number().describe("Tag ID to delete"),
    },
    async (params) => {
      const t0 = Date.now();
      logToolCall("delete_tag", params);
      try {
        const ok = await deleteTag(params.tag_id);
        const data = { success: ok };
        logToolResult("delete_tag", data, Date.now() - t0);
        return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logToolError("delete_tag", err, Date.now() - t0);
        const data = { success: false, error: msg };
        return {
          content: [{ type: "text" as const, text: JSON.stringify(data) }],
          isError: true,
        };
      }
    },
  );
}
