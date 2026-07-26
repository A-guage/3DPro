// plan_scene — plan 3D objects for a scene without generating

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { log, debug, logToolCall, logToolResult, logToolError } from "../logger.js";

export function registerPlanSceneTool(server: McpServer): void {
  debug("tools", "Registering plan_scene tool");

  server.tool(
    "plan_scene",
    "Plan a list of 3D objects for a scene. Returns a structured plan without generating anything. The user should confirm each object before calling generate.",
    {
      description: z.string().describe("Overall scene description"),
      objects: z.array(z.object({
        label: z.string().describe("Object label, e.g. 'chair', 'table'"),
        description: z.string().describe("Detailed description for 3D generation"),
        priority: z.number().optional().describe("Generation order, 1 = highest"),
      })).describe("Planned objects for the scene"),
    },
    async (params) => {
      const t0 = Date.now();
      logToolCall("plan_scene", params);
      try {
        log("plan_scene", `Processing scene plan with ${params.objects.length} objects`, {
          description: params.description.slice(0, 100),
          objectCount: params.objects.length,
          objectLabels: params.objects.map((o: { label: string }) => o.label),
        });

        const plan = params.objects.map((obj, i) => ({
          label: obj.label,
          description: obj.description,
          priority: obj.priority ?? i + 1,
          status: "planned" as const,
        }));

        const agentMessage = `场景清单已生成！共 ${plan.length} 个物体。请在左侧 3D 视口区域查看并确认要生成的物体，然后点击"生成"按钮开始生成。`;

        const data = {
          success: true,
          action: "plan_scene",
          scene_description: params.description,
          objects: plan,
          total: plan.length,
          agent_message: agentMessage,
        };

        const elapsed = Date.now() - t0;
        logToolResult("plan_scene", data, elapsed);
        log("plan_scene", `Scene plan completed in ${elapsed}ms`, { totalObjects: plan.length });

        return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logToolError("plan_scene", err, Date.now() - t0);
        const data = { success: false, error: msg };
        return {
          content: [{ type: "text" as const, text: JSON.stringify(data) }],
          isError: true,
        };
      }
    },
  );

  debug("tools", "plan_scene tool registered successfully");
}
