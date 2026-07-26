// model-library MCP tools — search online 3D model libraries, import models

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { searchModels, getModelDetail, importModel, listImports } from "../../services/model-library.js";
import { logToolCall, logToolResult, logToolError } from "../logger.js";

export function registerModelLibraryTools(server: McpServer): void {

  // ── search_models ──────────────────────────────────────────────────────
  server.tool(
    "search_models",
    "Search online 3D model library (Poly.pizza) for free downloadable models. Returns model list with thumbnails, download URLs, and metadata.",
    {
      keyword: z.string().optional().describe("Search keyword (e.g. 'globe', 'chair', 'tree')"),
      category: z.number().min(0).max(11).optional().describe("Category filter: 0=Food&Drink, 1=Clutter, 2=Weapons, 3=Transport, 4=Furniture&Decor, 5=Objects, 6=Nature, 7=Animals, 8=Buildings, 9=People, 10=Scenes, 11=Other"),
      license: z.enum(["CC0", "CC-BY", "CC-BY-SA", "CC-BY-ND", "CC-BY-NC", "CC-BY-NC-SA", "CC-BY-NC-ND"]).optional().describe("License filter"),
      animated: z.boolean().optional().describe("Filter animated models only"),
      limit: z.number().min(1).max(32).optional().default(10).describe("Max results (1-32)"),
      page: z.number().min(1).optional().default(1).describe("Page number"),
    },
    async (params) => {
      const t0 = Date.now();
      logToolCall("search_models", params);
      try {
        const result = await searchModels({
          keyword: params.keyword,
          category: params.category,
          license: params.license,
          animated: params.animated,
          limit: params.limit,
          page: params.page,
        });
        logToolResult("search_models", { total: result.total, count: result.results.length }, Date.now() - t0);
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        logToolError("search_models", err, Date.now() - t0);
        return { content: [{ type: "text" as const, text: `Error: ${err}` }], isError: true };
      }
    },
  );

  // ── get_model_detail ───────────────────────────────────────────────────
  server.tool(
    "get_model_detail",
    "Get detailed information about a specific 3D model by its Poly.pizza ID",
    {
      id: z.string().describe("Poly.pizza model ID"),
    },
    async (params) => {
      const t0 = Date.now();
      logToolCall("get_model_detail", params);
      try {
        const result = await getModelDetail(params.id);
        logToolResult("get_model_detail", { id: result.id, name: result.name }, Date.now() - t0);
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        logToolError("get_model_detail", err, Date.now() - t0);
        return { content: [{ type: "text" as const, text: `Error: ${err}` }], isError: true };
      }
    },
  );

  // ── import_model ───────────────────────────────────────────────────────
  server.tool(
    "import_model",
    "Download a 3D model from URL and import it into the local asset library. Use after search_models to import a selected model.",
    {
      url: z.string().url().describe("Model file URL to download (from search_models result's download_url)"),
      name: z.string().optional().describe("Custom name for the model"),
      description: z.string().optional().describe("Description of the model"),
      category: z.string().optional().describe("Category label (e.g. 'education', 'furniture')"),
      tags: z.array(z.string()).optional().describe("Tags for the model"),
      source: z.string().optional().describe("Source platform (default: poly_pizza)"),
      source_id: z.string().optional().describe("Model ID on source platform"),
      source_url: z.string().optional().describe("Original page URL on source platform"),
      thumbnail_url: z.string().optional().describe("Thumbnail image URL"),
      author: z.string().optional().describe("Model author/creator name"),
      license: z.string().optional().describe("License (CC0, CC-BY, etc.)"),
      width_cm: z.number().optional().describe("Model width in centimeters"),
      height_cm: z.number().optional().describe("Model height in centimeters"),
      depth_cm: z.number().optional().describe("Model depth in centimeters"),
    },
    async (params) => {
      const t0 = Date.now();
      logToolCall("import_model", { url: params.url, name: params.name });
      try {
        const result = await importModel(params);
        logToolResult("import_model", result, Date.now() - t0);
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        logToolError("import_model", err, Date.now() - t0);
        return { content: [{ type: "text" as const, text: `Error: ${err}` }], isError: true };
      }
    },
  );

  // ── list_imports ───────────────────────────────────────────────────────
  server.tool(
    "list_imports",
    "List previously imported 3D models from online libraries",
    {
      keyword: z.string().optional().describe("Search by name or description"),
      source: z.string().optional().describe("Filter by source (poly_pizza, etc.)"),
      offset: z.number().optional().default(0).describe("Pagination offset"),
      limit: z.number().optional().default(20).describe("Max results"),
    },
    async (params) => {
      const t0 = Date.now();
      logToolCall("list_imports", params);
      try {
        const result = await listImports(params);
        logToolResult("list_imports", { total: result.total }, Date.now() - t0);
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        logToolError("list_imports", err, Date.now() - t0);
        return { content: [{ type: "text" as const, text: `Error: ${err}` }], isError: true };
      }
    },
  );
}
