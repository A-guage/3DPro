# scene3d-mcp-server

A dual-protocol 3D scene generation server for AI agents. Provides **5 MCP tools** over stdio (for agent integration) and **26 HTTP endpoints** over Express (for frontend integration).

Supports Tencent Hunyuan 3D API, with pluggable architecture for TriPO, Meshy, or custom backends.

## Quick Start

```bash
# Install
npm install

# Configure
cp config.example.yaml config.yaml
# Edit config.yaml — fill in your Tencent Cloud credentials

# Build
npm run build

# Run (compiled)
npm start

# Or run in dev mode (auto-reload)
npm run dev
```

## Architecture

```
AI Agent (DeerFlow)          Frontend
    │ MCP (stdio)              │ HTTP (:3020)
    ▼                          ▼
┌──────────────────────────────────┐
│       scene3d-mcp-server         │
│  MCP Tools  ◄──► Services        │
│  HTTP API   ◄──► Providers       │
│              SQLite DB           │
└──────────────┬───────────────────┘
               │
    ┌──────────┼──────────┐
    ▼          ▼          ▼
 Hunyuan    TriPO      Meshy
   API       API        API
```

One process, two interfaces:
- **MCP stdio** — agent calls tools via stdin/stdout JSON-RPC
- **HTTP API** (port 3020) — frontend queries via REST, proxied through gateway

## MCP Tools

| Tool | Description |
|------|-------------|
| `scene3d_generate` | Submit a 3D generation job (single object or multi-object scene) |
| `scene3d_status` | Check generation progress by scene_id or object_id |
| `scene3d_list_models` | List previously generated models |
| `scene3d_manage_asset` | CRUD for assets, categories, and tags |
| `scene3d_manage_scene_assets` | Place/remove assets within a scene with transforms |

### Tool Details

**scene3d_generate**

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `description` | yes | — | 3D model description (shape, material, style) |
| `quality` | no | `medium` | `low` / `medium` / `high` |
| `session_id` | no | — | Chat session ID for tracking |
| `objects` | no | — | Array of `{label, description}` for multi-object scenes |

Quality levels:

| Quality | PBR Materials | Est. Time | Use Case |
|---------|--------------|-----------|----------|
| `low` | No | ~2 min | Quick prototype |
| `medium` | Yes | ~5 min | Balanced |
| `high` | Yes | ~10 min | Production asset |

**scene3d_manage_asset** — available actions:

- `create_asset`, `get_asset`, `list_assets`, `update_asset`, `delete_asset`
- `create_category`, `get_categories`, `delete_category`
- `create_tag`, `get_tags`, `delete_tag`

**scene3d_manage_scene_assets** — available actions:

- `add_asset` — place asset with position/rotation/scale
- `list_assets` — list assets in a scene
- `remove_asset` — remove asset from scene

## HTTP API

All endpoints under `/api/scene3d/*`. The frontend accesses these through a gateway proxy.

### Generation

| Method | Path | Description |
|--------|------|-------------|
| POST | `/scenes` | Generate a scene |
| GET | `/scenes/:sceneId` | Get/refresh scene status |
| POST | `/objects` | Generate a single object |
| GET | `/objects/:objectId` | Get/refresh object status |

### History & Sessions

| Method | Path | Description |
|--------|------|-------------|
| GET | `/history` | List scene history |
| GET | `/history/:sceneId` | Get scene detail |
| GET | `/sessions` | List chat sessions |
| GET | `/sessions/:sessionId` | Get session detail |
| POST | `/sessions/:sessionId` | Save/create session |
| DELETE | `/sessions/:sessionId` | Delete session |
| PUT | `/sessions/:sessionId/rename` | Rename session |

### Assets

| Method | Path | Description |
|--------|------|-------------|
| POST | `/assets` | Create asset |
| GET | `/assets` | List assets (filters: `user_id`, `asset_type`, `keyword`, etc.) |
| GET | `/assets/:assetId` | Get asset |
| PUT | `/assets/:assetId` | Update asset |
| DELETE | `/assets/:assetId` | Delete asset |
| POST | `/assets/:assetId/download` | Increment download counter |

### Categories & Tags

| Method | Path | Description |
|--------|------|-------------|
| POST | `/categories` | Create category |
| GET | `/categories` | List categories |
| PUT | `/categories/:id` | Update category |
| DELETE | `/categories/:id` | Delete category |
| POST | `/tags` | Create tag |
| GET | `/tags` | List tags |
| DELETE | `/tags/:id` | Delete tag |

### Scene Assets

| Method | Path | Description |
|--------|------|-------------|
| POST | `/scene-assets` | Add asset to scene |
| GET | `/scene-assets/:sceneId` | List scene assets |
| DELETE | `/scene-assets/:sceneId/:assetId` | Remove asset from scene |

## Configuration

`config.yaml` — values starting with `$` are resolved from environment variables.

```yaml
scene3d:
  provider: hunyuan              # hunyuan | tripo | meshy | local
  storage_dir: ./storage
  database_path: ./drizzle/scene3d.db
  http_port: 3020

providers:
  hunyuan:
    secret_id: $TENCENT_SECRET_ID
    secret_key: $TENCENT_SECRET_KEY
    region: ap-guangzhou
    endpoint: ai3d.tencentcloudapi.com
    version: "2025-05-13"
```

### Environment Variables

| Variable | Description |
|----------|-------------|
| `DEERFLOW_SCENE3D_CONFIG` | Absolute path to `config.yaml` (required when CWD is not the project directory) |
| `TENCENT_SECRET_ID` | Tencent Cloud secret ID |
| `TENCENT_SECRET_KEY` | Tencent Cloud secret key |

## Integration with DeerFlow

Add to `extensions_config.json`:

```json
{
  "mcpServers": {
    "scene3d": {
      "enabled": true,
      "type": "stdio",
      "command": "node",
      "args": ["<absolute-path>/dist/index.js"],
      "env": {
        "DEERFLOW_SCENE3D_CONFIG": "<absolute-path>/config.yaml"
      }
    }
  }
}
```

The gateway proxy (`backend/app/gateway/routers/scene3d/router.py`) forwards `/api/scene3d/*` to `http://localhost:3020`.

## Project Structure

```
src/
├── index.ts                 # Entry point — starts MCP + HTTP
├── config.ts                # YAML config loader with $ENV_VAR resolution
├── db/
│   ├── schema.ts            # 8 SQLite tables
│   ├── connection.ts        # sql.js connection + auto-save
│   ├── migrate.ts           # Auto-migration
│   └── repositories/       # CRUD for sessions, scenes, objects, assets, scene-assets
├── providers/
│   ├── base.ts              # Base3DProvider interface
│   ├── hunyuan.ts           # Tencent Hunyuan 3D API
│   └── registry.ts          # Provider factory
├── mcp/
│   ├── server.ts            # MCP Server + stdio transport
│   └── tools/               # 5 MCP tool definitions
├── http/
│   ├── app.ts               # Express app
│   └── routes/              # 26 REST endpoints
├── services/
│   ├── scene-manager.ts     # Scene generation orchestration
│   ├── object-manager.ts    # Single object lifecycle
│   └── file-storage.ts      # File download/storage
└── types/
    └── scene.ts             # TypeScript interfaces
```

## Extending Providers

Implement the `Base3DProvider` interface to add a new 3D generation backend:

```typescript
interface Base3DProvider {
  submit(prompt: string, options: GenerationOptions): Promise<JobResult>;
  pollStatus(jobId: string): Promise<StatusResult>;
  download(modelUrl: string, destPath: string): Promise<void>;
}
```

Register in `src/providers/registry.ts`.

## License

MIT
