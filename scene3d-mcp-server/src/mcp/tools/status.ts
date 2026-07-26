// scene3d_status — check generation progress

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { refreshObjectTask } from "../../services/object-manager.js";
import { refreshSceneStatus } from "../../services/scene-manager.js";
import { logToolCall, logToolResult, logToolError } from "../logger.js";

export function registerStatusTool(server: McpServer): void {
  server.tool(
    "status",
    "Check the status of a 3D generation job. Provide either scene_id or object_id.",
    {
      scene_id: z.string().optional().describe("Scene ID to check"),
      object_id: z.string().optional().describe("Object ID to check"),
    },
    async (params) => {
      const t0 = Date.now();
      logToolCall("status", params);
      try {
        if (params.scene_id) {
          const task = await refreshSceneStatus(params.scene_id);
          const data = {
            success: true,
            scene_id: task.scene_id,
            status: task.status,
            progress: task.progress,
            error_message: task.error_message,
            objects: task.objects.map((o) => ({
              object_id: o.object_id,
              label: o.label,
              status: o.status,
              model_url: o.model_url,
            })),
            composition: task.composition,
          };
          logToolResult("status", data, Date.now() - t0);
          return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
        }

        if (params.object_id) {
          const task = await refreshObjectTask(params.object_id);
          if (!task) {
            const data = { success: false, error: "Object not found" };
            logToolResult("status", data, Date.now() - t0);
            return {
              content: [{ type: "text" as const, text: JSON.stringify(data) }],
              isError: true,
            };
          }
          const data = {
            success: true,
            object_id: task.object_id,
            status: task.status,
            job_id: task.job_id,
            model_url: task.model_url,
            file_type: task.file_type,
            local_path: task.local_path,
            error_message: task.error_message,
          };
          logToolResult("status", data, Date.now() - t0);
          return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
        }

        const data = { success: false, error: "Provide scene_id or object_id" };
        logToolResult("status", data, Date.now() - t0);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(data) }],
          isError: true,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logToolError("status", err, Date.now() - t0);
        const data = { success: false, error: msg };
        return {
          content: [{ type: "text" as const, text: JSON.stringify(data) }],
          isError: true,
        };
      }
    },
  );
}
