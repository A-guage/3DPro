// Asset tools — create, get, list, update, delete

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createAsset, getAsset, listAssets, updateAsset, deleteAsset } from "../../db/repositories/assets.js";
import { logToolCall, logToolResult, logToolError } from "../logger.js";

export function registerAssetTools(server: McpServer): void {
  server.tool(
    "create_asset",
    "Create a new 3D asset in the library.",
    {
      asset_id: z.string().describe("Unique asset identifier"),
      name: z.string().describe("Asset display name"),
      asset_type: z.string().describe("Asset type, e.g. model_static, model_animated"),
      provider: z.string().optional().describe("Source provider (default: user_upload)"),
      description: z.string().optional().describe("Asset description"),
      file_format: z.string().optional().describe("File format, e.g. FBX, GLB, OBJ"),
      file_path: z.string().optional().describe("Local file path"),
      category_id: z.number().optional().describe("Category ID to assign"),
      user_id: z.string().optional().describe("Owner user ID"),
    },
    async (params) => {
      const t0 = Date.now();
      logToolCall("create_asset", params);
      try {
        const result = await createAsset({
          asset_id: params.asset_id,
          name: params.name,
          asset_type: params.asset_type,
          provider: params.provider ?? "user_upload",
          description: params.description ?? "",
          file_format: params.file_format ?? null,
          file_path: params.file_path ?? null,
          category_id: params.category_id ?? null,
          user_id: params.user_id ?? null,
        });
        const data = { success: true, ...result };
        logToolResult("create_asset", data, Date.now() - t0);
        return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logToolError("create_asset", err, Date.now() - t0);
        const data = { success: false, error: msg };
        return {
          content: [{ type: "text" as const, text: JSON.stringify(data) }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "get_asset",
    "Get a single 3D asset by ID, including tags and category.",
    {
      asset_id: z.string().describe("Asset identifier"),
    },
    async (params) => {
      const t0 = Date.now();
      logToolCall("get_asset", params);
      try {
        const result = await getAsset(params.asset_id);
        if (!result) {
          const data = { success: false, error: "Asset not found" };
          logToolResult("get_asset", data, Date.now() - t0);
          return {
            content: [{ type: "text" as const, text: JSON.stringify(data) }],
            isError: true,
          };
        }
        const data = { success: true, ...result };
        logToolResult("get_asset", data, Date.now() - t0);
        return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logToolError("get_asset", err, Date.now() - t0);
        const data = { success: false, error: msg };
        return {
          content: [{ type: "text" as const, text: JSON.stringify(data) }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "list_assets",
    "List 3D assets with optional filters and pagination.",
    {
      user_id: z.string().optional().describe("Filter by user ID"),
      asset_type: z.string().optional().describe("Filter by asset type"),
      category_id: z.number().optional().describe("Filter by category ID"),
      keyword: z.string().optional().describe("Search keyword (name, description, prompt)"),
      tag_id: z.number().optional().describe("Filter by tag ID"),
      status: z.string().optional().describe("Filter by status"),
      offset: z.number().optional().describe("Pagination offset (default: 0)"),
      limit: z.number().optional().describe("Max results (default: 20)"),
    },
    async (params) => {
      const t0 = Date.now();
      logToolCall("list_assets", params);
      try {
        const result = await listAssets({
          user_id: params.user_id ?? null,
          asset_type: params.asset_type ?? null,
          category_id: params.category_id ?? null,
          keyword: params.keyword ?? null,
          tag_id: params.tag_id ?? null,
          status: params.status ?? null,
          offset: params.offset ?? 0,
          limit: params.limit ?? 20,
        });
        const data = { success: true, ...result };
        logToolResult("list_assets", data, Date.now() - t0);
        return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logToolError("list_assets", err, Date.now() - t0);
        const data = { success: false, error: msg };
        return {
          content: [{ type: "text" as const, text: JSON.stringify(data) }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "update_asset",
    "Update an existing 3D asset's metadata.",
    {
      asset_id: z.string().describe("Asset identifier to update"),
      name: z.string().optional().describe("New display name"),
      description: z.string().optional().describe("New description"),
      asset_type: z.string().optional().describe("New asset type"),
      provider: z.string().optional().describe("New provider"),
      file_format: z.string().optional().describe("New file format"),
      file_path: z.string().optional().describe("New file path"),
      category_id: z.number().optional().describe("New category ID"),
      status: z.string().optional().describe("New status"),
    },
    async (params) => {
      const t0 = Date.now();
      logToolCall("update_asset", params);
      try {
        const input: Record<string, unknown> = {};
        if (params.name !== undefined) input.name = params.name;
        if (params.description !== undefined) input.description = params.description;
        if (params.asset_type !== undefined) input.asset_type = params.asset_type;
        if (params.provider !== undefined) input.provider = params.provider;
        if (params.file_format !== undefined) input.file_format = params.file_format;
        if (params.file_path !== undefined) input.file_path = params.file_path;
        if (params.category_id !== undefined) input.category_id = params.category_id;
        if (params.status !== undefined) input.status = params.status;
        const ok = await updateAsset(params.asset_id, input);
        const data = { success: ok };
        logToolResult("update_asset", data, Date.now() - t0);
        return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logToolError("update_asset", err, Date.now() - t0);
        const data = { success: false, error: msg };
        return {
          content: [{ type: "text" as const, text: JSON.stringify(data) }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "delete_asset",
    "Delete a 3D asset by ID.",
    {
      asset_id: z.string().describe("Asset identifier to delete"),
    },
    async (params) => {
      const t0 = Date.now();
      logToolCall("delete_asset", params);
      try {
        const ok = await deleteAsset(params.asset_id);
        const data = { success: ok };
        logToolResult("delete_asset", data, Date.now() - t0);
        return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logToolError("delete_asset", err, Date.now() - t0);
        const data = { success: false, error: msg };
        return {
          content: [{ type: "text" as const, text: JSON.stringify(data) }],
          isError: true,
        };
      }
    },
  );
}
