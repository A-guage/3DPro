#!/usr/bin/env node
// scene3d-mcp-server 功能测试脚本
// 测试 HTTP API 全部 26 个端点 + health 检查
// 用法: node test-api.mjs [base_url]
// 默认: http://localhost:3020

const BASE = (process.argv[2] || "http://localhost:3020").replace(/\/+$/, "");
const API = `${BASE}/api/scene3d`;

// ── helpers ──────────────────────────────────────────────────────────
let passed = 0, failed = 0, skipped = 0;

const C = {
  g: "\x1b[32m", r: "\x1b[31m", y: "\x1b[33m",
  b: "\x1b[34m", d: "\x1b[90m", R: "\x1b[0m",
};

function ok(name)  { passed++; console.log(`  ${C.g}✓${C.R} ${name}`); }
function fail(name, e) { failed++; console.log(`  ${C.r}✗${C.R} ${name}: ${e}`); }
function skip(name, reason) { skipped++; console.log(`  ${C.y}⊘${C.R} ${name} — ${reason}`); }
function section(t) { console.log(`\n${C.b}── ${t} ${C.d}${"─".repeat(60 - t.length)}${C.R}`); }

async function req(method, path, body, expect) {
  expect ??= 200;
  const url = path.startsWith("http") ? path : `${API}${path}`;
  const opts = { method, headers: {} };
  if (body) { opts.headers["Content-Type"] = "application/json"; opts.body = JSON.stringify(body); }
  const res = await fetch(url, opts);
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json, ok: res.status === expect };
}

// ── 0. Health ────────────────────────────────────────────────────────
section("Health Check");
try {
  const r = await req("GET", `${BASE}/health`);
  r.ok ? ok("/health → 200") : fail("/health", `status=${r.status}`);
} catch (e) { fail("/health", e.message); }

// ── 1. Tags ──────────────────────────────────────────────────────────
section("Tags CRUD");
let tagId;
try {
  // create
  const c = await req("POST", "/tags", { name: "测试标签", color: "#ff5722" });
  tagId = c.json.id ?? c.json.tag_id ?? c.json[0]?.id;
  tagId ? ok(`create_tag id=${tagId}`) : fail("create_tag", JSON.stringify(c.json));

  // list
  const l = await req("GET", "/tags");
  l.ok && Array.isArray(l.json) ? ok(`get_tags count=${l.json.length}`) : fail("get_tags", JSON.stringify(l.json));

  // delete
  if (tagId) {
    const d = await req("DELETE", `/tags/${tagId}`);
    d.json.success ? ok("delete_tag") : fail("delete_tag", JSON.stringify(d.json));
  }
} catch (e) { fail("tags", e.message); }

// ── 2. Categories ───────────────────────────────────────────────────
section("Categories CRUD");
let catId;
try {
  const c = await req("POST", "/categories", { name: "测试分类", icon: "box", sort_order: 0 });
  catId = c.json.id ?? c.json.category_id ?? c.json[0]?.id;
  catId ? ok(`create_category id=${catId}`) : fail("create_category", JSON.stringify(c.json));

  // list
  const l = await req("GET", "/categories");
  l.ok && Array.isArray(l.json) ? ok(`get_categories count=${l.json.length}`) : fail("get_categories", JSON.stringify(l.json));

  // update
  if (catId) {
    const u = await req("PUT", `/categories/${catId}`, { name: "更新后的分类" });
    u.json.success ? ok("update_category") : fail("update_category", JSON.stringify(u.json));
  }

  // delete
  if (catId) {
    const d = await req("DELETE", `/categories/${catId}`);
    d.json.success ? ok("delete_category") : fail("delete_category", JSON.stringify(d.json));
  }
} catch (e) { fail("categories", e.message); }

// ── 3. Assets ───────────────────────────────────────────────────────
section("Assets CRUD");
let assetId = `test_asset_${Date.now()}`;
try {
  // create
  const c = await req("POST", "/assets", {
    asset_id: assetId, name: "测试资产", asset_type: "model_static",
    provider: "user_upload", description: "自动测试创建",
  });
  c.ok ? ok(`create_asset ${assetId}`) : fail("create_asset", `status=${c.status} ${JSON.stringify(c.json)}`);

  // get
  const g = await req("GET", `/assets/${assetId}`);
  g.ok ? ok(`get_asset name=${g.json?.name}`) : fail("get_asset", `status=${g.status}`);

  // list
  const l = await req("GET", "/assets");
  l.ok ? ok(`list_assets count=${l.json?.count ?? l.json?.items?.length ?? "?"}`) : fail("list_assets", `status=${l.status}`);

  // update
  const u = await req("PUT", `/assets/${assetId}`, { name: "更新后的资产" });
  u.json.success ? ok("update_asset") : fail("update_asset", JSON.stringify(u.json));

  // download count
  const dl = await req("POST", `/assets/${assetId}/download`);
  dl.json.success ? ok("increment_download") : fail("increment_download", JSON.stringify(dl.json));

  // delete
  const d = await req("DELETE", `/assets/${assetId}`);
  d.json.success ? ok("delete_asset") : fail("delete_asset", JSON.stringify(d.json));
} catch (e) { fail("assets", e.message); }

// ── 4. Chat Sessions ───────────────────────────────────────────────
section("Chat Sessions CRUD");
const sessionId = `test_session_${Date.now()}`;
try {
  // create / save
  const s = await req("POST", `/sessions/${sessionId}`, {
    user_id: "test_user", title: "测试会话", messages: [
      { role: "user", content: "生成一个杯子" },
    ],
  });
  s.json.success ? ok("save_session") : fail("save_session", JSON.stringify(s.json));

  // get detail
  const g = await req("GET", `/sessions/${sessionId}`);
  g.json ? ok("get_session_detail") : fail("get_session_detail", JSON.stringify(g.json));

  // list
  const l = await req("GET", "/sessions?user_id=test_user");
  l.json?.sessions ? ok(`list_sessions count=${l.json.sessions.length}`) : fail("list_sessions", JSON.stringify(l.json));

  // rename
  const r = await req("PUT", `/sessions/${sessionId}/rename`, { title: "重命名后的会话" });
  r.json.success ? ok("rename_session") : fail("rename_session", JSON.stringify(r.json));

  // delete
  const d = await req("DELETE", `/sessions/${sessionId}`);
  d.json.success ? ok("delete_session") : fail("delete_session", JSON.stringify(d.json));
} catch (e) { fail("sessions", e.message); }

// ── 5. History ──────────────────────────────────────────────────────
section("History");
try {
  const h = await req("GET", "/history?limit=5");
  h.ok ? ok(`history count=${h.json?.count ?? 0}`) : fail("history", `status=${h.status}`);
} catch (e) { fail("history", e.message); }

// ── 6. Object Generation (may fail without real API key) ────────────
section("Object Generation");
let objectId;
try {
  const r = await req("POST", "/objects", { prompt: "一个红色的苹果", session_id: "test" });
  if (r.ok && r.json?.object_id) {
    objectId = r.json.object_id;
    ok(`generate_object id=${objectId} status=${r.json.status}`);

    // poll status
    const s = await req("GET", `/objects/${objectId}`);
    s.ok ? ok(`get_object status=${s.json?.status}`) : fail("get_object", `status=${s.status}`);
  } else {
    skip("generate_object", `API 返回 ${r.status}: ${JSON.stringify(r.json).slice(0, 120)}`);
  }
} catch (e) { skip("generate_object", e.message); }

// ── 7. Scene Generation (may fail without real API key) ─────────────
section("Scene Generation");
try {
  const r = await req("POST", "/scenes", {
    description: "一个桌子上的杯子和盘子",
    quality: "medium",
    objects: [
      { label: "桌子", description: "木质圆桌", priority: 1 },
      { label: "杯子", description: "白色陶瓷杯", priority: 2 },
    ],
  });
  if (r.ok && r.json?.scene_id) {
    ok(`generate_scene id=${r.json.scene_id} status=${r.json.status}`);

    // poll scene
    const s = await req("GET", `/scenes/${r.json.scene_id}`);
    s.ok ? ok(`get_scene status=${s.json?.status}`) : fail("get_scene", `status=${s.status}`);
  } else {
    skip("generate_scene", `API 返回 ${r.status}: ${JSON.stringify(r.json).slice(0, 120)}`);
  }
} catch (e) { skip("generate_scene", e.message); }

// ── 8. Scene Assets ─────────────────────────────────────────────────
section("Scene Assets (join table)");
const testSceneId = `test_scene_${Date.now()}`;
const testAssetId = `test_sa_${Date.now()}`;
try {
  // 先创建一个资产用于关联
  await req("POST", "/assets", {
    asset_id: testAssetId, name: "场景测试资产", asset_type: "model_static",
  });

  // add asset to scene
  const a = await req("POST", "/scene-assets", {
    scene_id: testSceneId, asset_id: testAssetId,
    position: { x: 1, y: 0, z: 2 },
    rotation: { x: 0, y: 45, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
  });
  a.json.success ? ok("add_asset_to_scene") : fail("add_asset_to_scene", JSON.stringify(a.json));

  // list scene assets
  const l = await req("GET", `/scene-assets/${testSceneId}`);
  l.ok ? ok(`list_scene_assets count=${l.json?.items?.length ?? 0}`) : fail("list_scene_assets", `status=${l.status}`);

  // remove
  const d = await req("DELETE", `/scene-assets/${testSceneId}/${testAssetId}`);
  d.json.success ? ok("remove_asset_from_scene") : fail("remove_asset_from_scene", JSON.stringify(d.json));

  // cleanup
  await req("DELETE", `/assets/${testAssetId}`);
} catch (e) { fail("scene-assets", e.message); }

// ── 9. MCP stdio 协议检测 ──────────────────────────────────────────
section("MCP stdio (连接检测)");
skip("MCP stdio", "需要通过 stdin/stdout JSON-RPC 测试，可通过 mcp-client 连接后验证");
console.log(`${C.d}  提示: 用 npx @modelcontextprotocol/inspector 连接 dist/index.js 可交互测试 MCP 工具${C.R}`);

// ── Summary ─────────────────────────────────────────────────────────
console.log(`\n${C.b}════════════════════════════════════════════════════════════${C.R}`);
console.log(`  ${C.g}✓ 通过: ${passed}${C.R}  ${C.r}✗ 失败: ${failed}${C.R}  ${C.y}⊘ 跳过: ${skipped}${C.R}`);
console.log(`${C.b}════════════════════════════════════════════════════════════${C.R}\n`);

process.exit(failed > 0 ? 1 : 0);
