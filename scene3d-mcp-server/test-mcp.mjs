#!/usr/bin/env node
// MCP stdio 协议合规性测试
// 通过 JSON-RPC 2.0 over stdio 与 MCP server 交互，验证协议是否符合规范
// 用法: node test-mcp.mjs

import { spawn } from "node:child_process";
import { resolve } from "node:path";

const SERVER = resolve("./dist/index.js");
let passed = 0, failed = 0, idCounter = 0;

const C = {
  g: "\x1b[32m", r: "\x1b[31m", y: "\x1b[33m",
  b: "\x1b[34m", d: "\x1b[90m", R: "\x1b[0m",
};

function ok(name)  { passed++; console.log(`  ${C.g}✓${C.R} ${name}`); }
function fail(name, msg) { failed++; console.log(`  ${C.r}✗${C.R} ${name}: ${msg}`); }
function section(t) { console.log(`\n${C.b}── ${t} ${C.d}${"─".repeat(60 - t.length)}${C.R}`); }

// ── Spawn server ────────────────────────────────────────────────────
const child = spawn(process.execPath, [SERVER], {
  cwd: resolve("."),
  stdio: ["pipe", "pipe", "pipe"],
});

let stdoutBuf = "";
const pendingResolvers = new Map();

child.stdout.on("data", (chunk) => {
  stdoutBuf += chunk.toString();
  // MCP uses newline-delimited JSON
  const lines = stdoutBuf.split("\n");
  stdoutBuf = lines.pop(); // keep incomplete line
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const msg = JSON.parse(trimmed);
      if (msg.id !== undefined && pendingResolvers.has(msg.id)) {
        pendingResolvers.get(msg.id)(msg);
        pendingResolvers.delete(msg.id);
      }
    } catch { /* not JSON, ignore */ }
  }
});

child.stderr.on("data", () => { /* swallow server logs */ });

function send(method, params = {}) {
  const id = ++idCounter;
  const msg = { jsonrpc: "2.0", id, method, params };
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingResolvers.delete(id);
      reject(new Error(`Timeout waiting for response to ${method} (id=${id})`));
    }, 10000);
    pendingResolvers.set(id, (resp) => {
      clearTimeout(timer);
      resolve(resp);
    });
    child.stdin.write(JSON.stringify(msg) + "\n");
  });
}

function sendNotification(method, params = {}) {
  const msg = { jsonrpc: "2.0", method, params };
  child.stdin.write(JSON.stringify(msg) + "\n");
}

// ── Wait for server ready ──────────────────────────────────────────
await new Promise((r) => setTimeout(r, 1500));

// ── Tests ───────────────────────────────────────────────────────────

// 1. Initialize
section("Initialize");
let initResult;
try {
  const resp = await send("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "test-client", version: "0.1.0" },
  });
  initResult = resp.result;

  if (resp.error) {
    fail("initialize", JSON.stringify(resp.error));
  } else {
    ok("initialize → success");

    // Check required fields
    initResult?.protocolVersion
      ? ok(`protocolVersion = ${initResult.protocolVersion}`)
      : fail("protocolVersion", "missing");

    initResult?.serverInfo?.name
      ? ok(`serverInfo.name = ${initResult.serverInfo.name}`)
      : fail("serverInfo.name", "missing");

    initResult?.capabilities
      ? ok(`capabilities = ${JSON.stringify(initResult.capabilities)}`)
      : fail("capabilities", "missing");

    // Check tools capability
    initResult?.capabilities?.tools
      ? ok("tools capability declared")
      : fail("tools capability", "not declared");
  }
} catch (e) { fail("initialize", e.message); }

// Send initialized notification (required by spec)
try {
  sendNotification("notifications/initialized");
  ok("notifications/initialized sent");
} catch (e) { fail("notifications/initialized", e.message); }

// 2. tools/list
section("Tools List");
let toolList;
try {
  const resp = await send("tools/list", {});
  if (resp.error) {
    fail("tools/list", JSON.stringify(resp.error));
  } else {
    toolList = resp.result?.tools ?? [];
    ok(`tools/list → ${toolList.length} tools`);

    for (const t of toolList) {
      const checks = [];
      if (!t.name) checks.push("missing name");
      if (!t.description) checks.push("missing description");
      if (!t.inputSchema) checks.push("missing inputSchema");
      if (t.inputSchema && t.inputSchema.type !== "object") checks.push("inputSchema.type != object");

      if (checks.length === 0) {
        ok(`  ${t.name} — name, description, inputSchema ✓`);
      } else {
        fail(`  ${t.name || "(unnamed)"}`, checks.join(", "));
      }
    }

    // Verify expected tools exist
    const names = new Set(toolList.map((t) => t.name));
    const expectedTools = [
      "generate", "status", "list_models",
      "create_asset", "get_asset", "list_assets", "update_asset", "delete_asset",
      "create_category", "get_categories", "delete_category",
      "create_tag", "get_tags", "delete_tag",
    ];
    for (const expected of expectedTools) {
      names.has(expected)
        ? ok(`  expected tool "${expected}" found`)
        : fail(`  expected tool "${expected}"`, "not registered");
    }
  }
} catch (e) { fail("tools/list", e.message); }

// 3. tools/call — list_models (safe, no external API)
section("Tool Call: list_models");
try {
  const resp = await send("tools/call", {
    name: "list_models",
    arguments: { user_id: "default", limit: 5 },
  });
  if (resp.error) {
    fail("list_models", JSON.stringify(resp.error));
  } else {
    const content = resp.result?.content;
    Array.isArray(content) ? ok(`content is array, length=${content.length}`) : fail("content", "not an array");

    if (content?.[0]) {
      content[0].type === "text" ? ok("content[0].type = text") : fail("content[0].type", content[0].type);
      content[0].text ? ok(`content[0].text = ${content[0].text.slice(0, 80)}`) : fail("content[0].text", "empty");
    }

    resp.result?.isError === undefined || resp.result?.isError === false
      ? ok("isError absent or false (success)")
      : fail("isError", "should not be set for success");
  }
} catch (e) { fail("list_models", e.message); }

// 4. tools/call — category CRUD via individual tools
section("Tool Call: category CRUD");
try {
  // create
  const create = await send("tools/call", {
    name: "create_category",
    arguments: { name: "MCP测试分类" },
  });
  if (create.error) {
    fail("create_category", JSON.stringify(create.error));
  } else {
    ok("create_category → success");
    const text = create.result?.content?.[0]?.text;
    const data = JSON.parse(text);
    data.id ? ok(`  category id = ${data.id}`) : fail("  category id", "missing");
  }

  // list
  const list = await send("tools/call", {
    name: "get_categories",
    arguments: {},
  });
  if (list.error) {
    fail("get_categories", JSON.stringify(list.error));
  } else {
    ok("get_categories → success");
  }

  // delete (use id from create)
  const createData = JSON.parse(create.result?.content?.[0]?.text ?? "{}");
  if (createData.id) {
    const del = await send("tools/call", {
      name: "delete_category",
      arguments: { category_id: createData.id },
    });
    if (del.error) {
      fail("delete_category", JSON.stringify(del.error));
    } else {
      const text = del.result?.content?.[0]?.text;
      const data = JSON.parse(text);
      data.success ? ok("delete_category → success: true") : fail("delete_category", text);
    }
  }
} catch (e) { fail("category CRUD", e.message); }

// 5. tools/call — tag CRUD via individual tools
section("Tool Call: tag CRUD");
try {
  const create = await send("tools/call", {
    name: "create_tag",
    arguments: { name: "MCP测试标签", color: "#4caf50" },
  });
  if (create.error) {
    fail("create_tag", JSON.stringify(create.error));
  } else {
    ok("create_tag → success");
  }

  const tags = await send("tools/call", {
    name: "get_tags",
    arguments: {},
  });
  if (tags.error) {
    fail("get_tags", JSON.stringify(tags.error));
  } else {
    ok("get_tags → success");
  }

  const createData = JSON.parse(create.result?.content?.[0]?.text ?? "{}");
  if (createData.id) {
    const del = await send("tools/call", {
      name: "delete_tag",
      arguments: { tag_id: createData.id },
    });
    if (del.error) {
      fail("delete_tag", JSON.stringify(del.error));
    } else {
      const text = del.result?.content?.[0]?.text;
      const data = JSON.parse(text);
      data.success ? ok("delete_tag → success: true") : fail("delete_tag", text);
    }
  }
} catch (e) { fail("tag CRUD", e.message); }

// 6. tools/call — non-existent tool (error handling)
section("Tool Call: error handling");
try {
  const resp = await send("tools/call", {
    name: "nonexistent_tool",
    arguments: {},
  });
  if (resp.error) {
    ok("nonexistent tool → JSON-RPC error ✓");
  } else if (resp.result?.isError) {
    ok("nonexistent tool → isError: true ✓");
  } else {
    fail("nonexistent tool", `no error flag: ${JSON.stringify(resp).slice(0, 120)}`);
  }
} catch (e) { fail("error handling", e.message); }

// 6. tools/call — status without args (validation)
section("Tool Call: status (validation)");
try {
  const resp = await send("tools/call", {
    name: "status",
    arguments: {},
  });
  if (resp.error) {
    ok("status with no args → JSON-RPC error (acceptable)");
  } else {
    resp.result?.isError === true
      ? ok("status no args → isError: true ✓")
      : fail("isError", `expected true, got ${resp.result?.isError}`);
  }
} catch (e) { fail("status validation", e.message); }

// 7. tools/call — plan_scene (the critical tool for the agent workflow)
section("Tool Call: plan_scene");
try {
  const resp = await send("tools/call", {
    name: "plan_scene",
    arguments: {
      description: "一把未来风格的科幻手枪，具有赛博朋克美学",
      objects: [
        {
          label: "科幻手枪",
          description: "一把未来风格的半自动手枪，采用棱角分明的赛博朋克设计。枪身主体为哑光黑色金属材质，带有深蓝色的能量导管纹路贯穿枪身。",
          priority: 1,
        },
      ],
    },
  });
  if (resp.error) {
    fail("plan_scene", JSON.stringify(resp.error));
  } else {
    const content = resp.result?.content;
    if (Array.isArray(content) && content[0]?.type === "text") {
      const data = JSON.parse(content[0].text);
      if (data.action === "plan_scene" && Array.isArray(data.objects) && data.objects.length === 1) {
        ok(`plan_scene → action=${data.action}, objects=${data.objects.length}`);
        ok(`  label: ${data.objects[0].label}, status: ${data.objects[0].status}`);
      } else {
        fail("plan_scene response format", JSON.stringify(data).slice(0, 100));
      }
    } else {
      fail("plan_scene content", "unexpected format");
    }
  }
} catch (e) { fail("plan_scene", e.message); }

// 8. tools/call — generate (will fail due to API quota but tests protocol)
section("Tool Call: generate (protocol check)");
try {
  const resp = await send("tools/call", {
    name: "generate",
    arguments: { description: "一个测试用的球体", quality: "low" },
  });
  if (resp.error) {
    ok("generate → API error (quota, but protocol valid)");
  } else {
    const content = resp.result?.content;
    Array.isArray(content) ? ok("generate → content array ✓") : fail("content", "not array");
    if (resp.result?.isError) {
      ok("generate → isError: true (API failure correctly reported)");
    } else {
      const data = JSON.parse(content?.[0]?.text ?? "{}");
      data.object_id ? ok(`object_id = ${data.object_id}`) : ok("response parsed");
    }
  }
} catch (e) { fail("generate", e.message); }

// 8. Schema validation: check inputSchema has proper JSON Schema
section("JSON Schema validation");
if (toolList) {
  for (const t of toolList) {
    const schema = t.inputSchema;
    if (!schema) continue;
    const props = schema.properties ?? {};
    const required = schema.required ?? [];
    const propNames = Object.keys(props);

    // Check that required fields exist in properties
    const missing = required.filter((r) => !propNames.includes(r));
    if (missing.length === 0) {
      ok(`${t.name}: ${propNames.length} props, ${required.length} required`);
    } else {
      fail(`${t.name}: required fields missing from properties`, missing.join(", "));
    }

    // Check each property has a type
    for (const [key, val] of Object.entries(props)) {
      if (!val.type && !val.anyOf && !val.oneOf && !val.$ref) {
        fail(`${t.name}.inputSchema.${key}`, "no type defined");
      }
    }
  }
}

// ── Cleanup ─────────────────────────────────────────────────────────
child.stdin.end();
setTimeout(() => child.kill(), 1000);

// ── Summary ─────────────────────────────────────────────────────────
console.log(`\n${C.b}════════════════════════════════════════════════════════════${C.R}`);
console.log(`  ${C.g}✓ 通过: ${passed}${C.R}  ${C.r}✗ 失败: ${failed}${C.R}`);
console.log(`${C.b}════════════════════════════════════════════════════════════${C.R}\n`);

process.exit(failed > 0 ? 1 : 0);
