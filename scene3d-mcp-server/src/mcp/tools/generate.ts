// scene3d_generate — submit a 3D generation job

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { generateObject } from "../../services/object-manager.js";
import { generateScene } from "../../services/scene-manager.js";
import { logToolCall, logToolResult, logToolError } from "../logger.js";

export function registerGenerateTool(server: McpServer): void {
  server.tool(
    "generate",
    "Submit a 3D model generation job. Provide description for a single object, or add objects array for multi-object scene generation.",
    {
      description: z.string().describe("3D model description text"),
      quality: z.enum(["low", "medium", "high"]).optional().default("medium").describe("Generation quality"),
      format: z.enum(["FBX", "GLB", "OBJ", "STL", "USDZ"]).optional().default("FBX").describe("Output file format. STL for 3D printing, FBX/GLB for game engines"),
      session_id: z.string().optional().describe("Chat session ID for tracking"),
      objects: z.array(z.object({
        object_id: z.string().optional(),
        label: z.string().optional(),
        description: z.string().optional(),
        priority: z.number().optional(),
      })).optional().describe("Scene objects (omit for single-object generation)"),
    },
    async (params) => {
      const t0 = Date.now();
      logToolCall("generate", params);
      try {
        if (params.objects && params.objects.length > 0) {
          const task = await generateScene({
            description: params.description,
            quality: params.quality,
            format: params.format,
            session_id: params.session_id,
            objects: params.objects as Array<Record<string, unknown>>,
          });
          const data = {
            success: true,
            mode: "scene",
            scene_id: task.scene_id,
            status: task.status,
            objects: task.objects.map((o) => ({
              object_id: o.object_id,
              label: o.label,
              status: o.status,
              job_id: o.job_id,
            })),
            progress: task.progress,
          };
          logToolResult("generate", data, Date.now() - t0);
          return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
        }

        const task = await generateObject(params.description, params.session_id, params.format);
        const data = {
          success: true,
          mode: "object",
          object_id: task.object_id,
          status: task.status,
          job_id: task.job_id,
        };
        logToolResult("generate", data, Date.now() - t0);
        return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logToolError("generate", err, Date.now() - t0);
        const data = { success: false, error: msg };
        return {
          content: [{ type: "text" as const, text: JSON.stringify(data) }],
          isError: true,
        };
      }
    },
  );
}
