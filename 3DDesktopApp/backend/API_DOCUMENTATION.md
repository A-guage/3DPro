# 3DPro 后端服务 API 开发文档

## 基本信息

- **服务地址**: `http://localhost:8000`
- **基础路径**: `/`
- **API Title**: 3D 场景生成器 API
- **默认端口**: 8000

## 环境配置

后端配置文件 `.env` (位于 `backend/` 目录):

```env
# 腾讯混元3D API (必需)
TENCENT_SECRET_ID=your_secret_id
TENCENT_SECRET_KEY=your_secret_key
TENCENT_REGION=ap-guangzhou

# DeepSeek API (必需)
DEEPSEEK_API_KEY=your_deepseek_api_key

# Agent 服务 (可选)
AGENT_SERVICE_URL=http://localhost:3001
AGENT_ENABLED=true

# 后端地址 (用于内部下载)
BACKEND_URL=http://localhost:8000
```

---

## 数据库模型

### 数据库文件
- **位置**: `backend/history.db` (SQLite)
- **连接字符串**: `sqlite:///./history.db`

### 数据表

#### ChatSession (聊天会话表)
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 主键 |
| session_id | TEXT | 会话ID (唯一索引) |
| user_id | TEXT | 用户ID (索引) |
| title | TEXT | 会话标题 |
| messages_json | TEXT | JSON序列化的消息列表 |
| created_at | DATETIME | 创建时间 |
| updated_at | DATETIME | 更新时间 |

#### SceneHistory (场景历史表)
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 主键 |
| scene_id | TEXT | 场景ID (唯一索引) |
| session_id | TEXT | 关联会话ID (索引) |
| user_id | TEXT | 用户ID (索引) |
| description | TEXT | 场景描述 |
| quality | TEXT | 生成质量 (low/medium/high) |
| status | TEXT | 状态 (processing/ready/failed) |
| model_url | TEXT | 模型文件URL (本地缓存后为本地路径) |
| error_message | TEXT | 错误信息 |
| created_at | DATETIME | 创建时间 |
| updated_at | DATETIME | 更新时间 |

#### SceneObjectRecord (场景对象记录表)
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 主键 |
| scene_id | TEXT | 场景ID (索引) |
| session_id | TEXT | 关联会话ID (索引) |
| object_id | TEXT | 对象ID |
| object_name | TEXT | 对象名称 |
| status | TEXT | 状态 (pending/processing/ready/failed) |
| model_url | TEXT | 模型文件URL |
| local_path | TEXT | 本地缓存路径 |
| created_at | DATETIME | 创建时间 |

---

## API 接口详细文档

### 一、场景生成 API

#### 1.1 生成 3D 场景
**接口**: `POST /api/generate-scene`

**描述**: 一键生成完整 3D 场景任务。流程包括使用 DeepSeek 优化中文场景描述、调用腾讯混元生3D极速版创建3D任务。

**请求体**:
```json
{
  "description": "一个现代化的办公室场景，有办公桌、椅子和书架",
  "quality": "medium",
  "user_id": "user123",
  "session_id": "session456"
}
```

| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| description | string | 是 | 场景描述(中文)，最多200个UTF-8字符 |
| quality | string | 否 | 生成质量: low/medium/high，默认 medium |
| user_id | string | 否 | 用户ID，用于关联生成记录 |
| session_id | string | 否 | 关联的会话ID |

**响应**:
```json
{
  "scene_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "status": "processing",
  "estimated_time": 30
}
```

**响应字段**:
| 字段 | 类型 | 说明 |
|------|------|------|
| scene_id | string | 场景ID，用于后续查询状态和下载 |
| status | string | 初始状态，固定为 "processing" |
| estimated_time | int | 预计完成时间(秒) |

---

#### 1.2 查询场景状态
**接口**: `GET /api/status/{scene_id}`

**描述**: 查询场景生成进度和状态

**路径参数**:
| 参数 | 类型 | 说明 |
|------|------|------|
| scene_id | string | 场景ID |

**响应**:
```json
{
  "scene_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "status": "processing",
  "model_url": null,
  "error_message": null,
  "progress": 45,
  "objects": [
    {
      "object_id": "obj_001",
      "status": "ready",
      "model_url": "https://..."
    },
    {
      "object_id": "obj_002",
      "status": "processing",
      "model_url": null
    }
  ],
  "current_object": "obj_002"
}
```

**status 状态值**:
| 值 | 说明 |
|----|------|
| processing | 生成中 |
| ready | 生成完成 |
| failed | 生成失败 |

**object.status 状态值**:
| 值 | 说明 |
|----|------|
| pending | 等待中 |
| processing | 生成中 |
| ready | 已完成 |
| failed | 失败 |

---

#### 1.3 下载场景模型
**接口**: `GET /api/download/{scene_id}`

**描述**: 下载生成好的 3D 模型文件（支持 GLB、FBX、OBJ、STL、USDZ 等格式）

**路径参数**:
| 参数 | 类型 | 说明 |
|------|------|------|
| scene_id | string | 场景ID |

**响应**: 文件流 (Content-Type 根据实际格式返回: model/gltf-binary, model/fbx, model/obj, model/stl 等)

**注意**: 必须先调用 `/api/status/{scene_id}` 确认状态为 "ready" 后才能下载

---

#### 1.4 下载单个对象
**接口**: `GET /api/objects/{scene_id}/{object_id}`

**描述**: 下载场景中的单个 3D 对象模型文件

**路径参数**:
| 参数 | 类型 | 说明 |
|------|------|------|
| scene_id | string | 场景ID |
| object_id | string | 对象ID |

**响应**: 文件流

---

### 二、物品生成 API (单独生成)

#### 2.1 创建物品生成任务
**接口**: `POST /api/generate-object`

**描述**: 创建单个 3D 物品生成任务

**请求体**:
```json
{
  "name": "椅子",
  "description": "一把舒适的办公椅子",
  "session_id": "session456",
  "user_id": "user123"
}
```

| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| name | string | 是 | 物品名称 |
| description | string | 是 | 物品描述(中文) |
| session_id | string | 是 | 关联的会话ID |
| user_id | string | 否 | 用户ID |

**响应**:
```json
{
  "task_id": "job_123456",
  "status": "processing"
}
```

---

#### 2.2 查询物品生成状态
**接口**: `GET /api/object-status/{object_id}`

**描述**: 查询单个物品生成状态

**路径参数**:
| 参数 | 类型 | 说明 |
|------|------|------|
| object_id | string | 对象ID (即 task_id) |

**响应**:
```json
{
  "object_id": "job_123456",
  "status": "ready",
  "model_url": "http://localhost:8000/api/object-file/job_123456"
}
```

---

#### 2.3 下载物品模型文件
**接口**: `GET /api/object-file/{object_id}`

**描述**: 下载单个物品的 3D 模型文件

**路径参数**:
| 参数 | 类型 | 说明 |
|------|------|------|
| object_id | string | 对象ID |

**查询参数**:
| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| download | boolean | false | true=下载附件, false=在线预览 |

**响应**: 文件流

**文件优先级**:
1. 优先使用 `local_path` 本地缓存
2. 其次使用 `storage/object_files/{object_id}.cached` 缓存
3. 最后尝试从 `model_url` 下载

---

### 三、会话管理 API

#### 3.1 保存会话
**接口**: `POST /api/sessions`

**描述**: 保存聊天会话

**请求体**:
```json
{
  "session_id": "sess_abc123",
  "user_id": "user123",
  "title": "办公室场景设计",
  "messages": [
    {"role": "user", "content": "帮我设计一个现代办公室"},
    {"role": "assistant", "content": "好的，我将为您生成..."}
  ]
}
```

| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| session_id | string | 是 | 会话ID |
| user_id | string | 否 | 用户ID |
| title | string | 是 | 会话标题 |
| messages | array | 是 | 消息列表 |

**响应**:
```json
{
  "success": true
}
```

---

#### 3.2 获取会话列表
**接口**: `GET /api/sessions`

**描述**: 获取指定用户的所有会话列表

**查询参数**:
| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| user_id | string | 是 | 用户ID |

**响应**:
```json
[
  {
    "session_id": "sess_abc123",
    "title": "办公室场景设计",
    "created_at": "2024-01-15T10:30:00",
    "updated_at": "2024-01-15T11:00:00"
  }
]
```

---

#### 3.3 获取会话详情
**接口**: `GET /api/sessions/{session_id}`

**描述**: 获取会话详细信息，包括关联的场景和对象

**路径参数**:
| 参数 | 类型 | 说明 |
|------|------|------|
| session_id | string | 会话ID |

**响应**:
```json
{
  "session": {
    "session_id": "sess_abc123",
    "title": "办公室场景设计",
    "user_id": "user123",
    "created_at": "2024-01-15T10:30:00",
    "updated_at": "2024-01-15T11:00:00"
  },
  "scenes": [
    {
      "scene_id": "scene_001",
      "description": "现代化办公室",
      "quality": "medium",
      "status": "ready",
      "model_url": "http://localhost:8000/api/download/scene_001"
    }
  ],
  "objects": [
    {
      "object_id": "obj_001",
      "object_name": "办公桌",
      "status": "ready",
      "model_url": "http://localhost:8000/api/object-file/obj_001"
    }
  ]
}
```

---

#### 3.4 删除会话
**接口**: `DELETE /api/sessions/{session_id}`

**描述**: 删除指定会话

**路径参数**:
| 参数 | 类型 | 说明 |
|------|------|------|
| session_id | string | 会话ID |

**响应**:
```json
{
  "success": true
}
```

---

#### 3.5 重命名会话
**接口**: `PATCH /api/sessions/{session_id}/title`

**描述**: 修改会话标题

**路径参数**:
| 参数 | 类型 | 说明 |
|------|------|------|
| session_id | string | 会话ID |

**请求体**:
```json
{
  "new_title": "新的会话标题"
}
```

**响应**:
```json
{
  "success": true
}
```

---

### 四、历史记录 API

#### 4.1 获取历史列表
**接口**: `GET /api/history`

**描述**: 获取用户的历史场景生成记录

**查询参数**:
| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| user_id | string | 是 | 用户ID |

**响应**:
```json
[
  {
    "scene_id": "scene_001",
    "description": "现代化办公室",
    "quality": "medium",
    "status": "ready",
    "model_url": "http://localhost:8000/api/download/scene_001",
    "error_message": null,
    "created_at": "2024-01-15T10:30:00",
    "updated_at": "2024-01-15T10:35:00"
  }
]
```

---

#### 4.2 获取历史详情
**接口**: `GET /api/history/{scene_id}`

**描述**: 获取指定场景的详细历史信息

**路径参数**:
| 参数 | 类型 | 说明 |
|------|------|------|
| scene_id | string | 场景ID |

**响应**:
```json
{
  "scene": {
    "scene_id": "scene_001",
    "description": "现代化办公室",
    "quality": "medium",
    "status": "ready",
    "model_url": "http://localhost:8000/api/download/scene_001",
    "error_message": null,
    "created_at": "2024-01-15T10:30:00",
    "updated_at": "2024-01-15T10:35:00"
  },
  "objects": [
    {
      "object_id": "obj_001",
      "status": "ready",
      "model_url": "http://localhost:8000/api/object-file/obj_001"
    }
  ]
}
```

---

### 五、模型资产库 API

#### 5.1 查询资产列表
**接口**: `POST /api/asset-library/list`

**描述**: 查询本地模型资产库，列出可用的 3D 模型

**请求体**:
```json
{
  "status": "ready",
  "session_id": "session456",
  "keyword": "椅子",
  "limit": 50
}
```

| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| status | string | 否 | 状态过滤: ready/processing/failed，默认 "ready" |
| session_id | string | 否 | 按会话ID过滤 |
| keyword | string | 否 | 搜索名称关键词 |
| limit | int | 否 | 返回数量限制，默认 50 |

**响应**:
```json
{
  "success": true,
  "total": 2,
  "models": [
    {
      "object_id": "obj_001",
      "object_name": "办公椅子",
      "status": "ready",
      "model_url": "http://localhost:8000/api/object-file/obj_001",
      "created_at": "2024-01-15T10:30:00",
      "session_id": "session456"
    }
  ]
}
```

---

#### 5.2 导入模型到 UE
**接口**: `POST /api/asset-library/import-to-ue`

**描述**: 将本地模型复制到 UE 项目 Content/Imports 目录

**请求体**:
```json
{
  "object_id": "obj_001",
  "model_name": "办公椅子",
  "ue_project_path": "D:/Projects/MyGame/MyGame.uproject"
}
```

| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| object_id | string | 否 | 模型ID (与 model_name 二选一) |
| model_name | string | 否 | 模型名称 (会模糊匹配) |
| ue_project_path | string | 否 | UE 项目 .uproject 路径 |

**响应**:
```json
{
  "success": true,
  "message": "导入完成",
  "object_name": "办公椅子",
  "file_path": "D:/Projects/MyGame/Content/Imports/office_chair_abc123.glb",
  "file_size_kb": 1024.5,
  "ue_project": "D:/Projects/MyGame",
  "import_dir": "D:/Projects/MyGame/Content/Imports",
  "ue_asset_path": "/Game/Imports/office_chair_abc123",
  "auto_imported": true
}
```

---

#### 5.3 从 URL 下载并导入
**接口**: `POST /api/asset-library/download-and-import`

**描述**: 从外部 URL 下载 3D 模型并导入到 UE

**请求体**:
```json
{
  "model_url": "https://example.com/model.glb",
  "model_name": "downloaded_chair",
  "destination_path": "/Game/Imports"
}
```

| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| model_url | string | 是 | 模型文件 URL |
| model_name | string | 是 | 模型名称 (英文，用于 UE 资产路径) |
| destination_path | string | 否 | UE Content 中的目标路径，默认 "/Game/imported" |

**响应**:
```json
{
  "success": true,
  "message": "下载并导入完成",
  "file_path": "D:/Projects/MyGame/Content/Imports/downloaded_chair.glb",
  "file_size_kb": 512.3,
  "asset_name": "downloaded_chair",
  "ue_asset_path": "/Game/Imports/downloaded_chair"
}
```

---

### 六、UE 集成 API

#### 6.1 导入场景到 UE
**接口**: `POST /api/import-to-ue`

**描述**: 将生成的 3D 场景导入到 UE 项目

**请求体**:
```json
{
  "sceneUrl": "http://localhost:8000/api/download/scene_001",
  "sceneId": "scene_001",
  "enginePath": "D:/Projects/MyGame/MyGame.uproject"
}
```

| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| sceneUrl | string | 是 | 场景文件 URL |
| sceneId | string | 是 | 场景 ID |
| enginePath | string | 否 | UE 项目路径 |

**响应**:
```json
{
  "success": true,
  "message": "导入成功",
  "filePath": "D:/Projects/MyGame/Content/Imports/scene_001.glb"
}
```

---

#### 6.2 检查 UE 状态
**接口**: `GET /api/ue-status`

**描述**: 检查 UE 插件和项目状态

**响应**:
```json
{
  "project_found": true,
  "plugin_available": true,
  "message": "UE 环境正常"
}
```

---

#### 6.3 在 UE 中执行 Python
**接口**: `POST /api/ue/execute-python`

**描述**: 通过命令桥接在 UE 中执行 Python 代码

**请求体**:
```json
{
  "code": "import unreal\nprint(unreal.Paths.project_dir())",
  "ue_project_path": "D:/Projects/MyGame/MyGame.uproject",
  "timeout": 300
}
```

| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| code | string | 是 | 要执行的 Python 代码 |
| ue_project_path | string | 否 | UE 项目 .uproject 路径 |
| timeout | int | 否 | 超时时间(秒)，默认 300 |

**响应**:
```json
{
  "success": true,
  "output": "D:/Projects/MyGame/",
  "error": "",
  "execution_time": 2.5
}
```

---

#### 6.4 获取 UE 控制台错误
**接口**: `POST /api/ue/console-errors`

**描述**: 获取 UE 输出日志中的错误和警告

**请求体**:
```json
{
  "log_type": "Error",
  "clear_after_read": true
}
```

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| log_type | string | Error | 日志类型: Error/Warning/All |
| clear_after_read | boolean | true | 是否在读取后清除 |

**响应**:
```json
{
  "success": true,
  "has_errors": false,
  "errors": [],
  "has_warnings": true,
  "warnings": [
    {
      "type": "Warning",
      "message": "某些网格体缺失材质",
      "file": "MeshActor",
      "line": 0
    }
  ],
  "error_count": 0,
  "warning_count": 1,
  "source": "ue_plugin"
}
```

---

#### 6.5 UE 诊断
**接口**: `POST /api/ue/diagnose`

**描述**: 在 UE 中运行环境诊断，返回资产系统和场景状态

**响应**:
```json
{
  "success": true,
  "diagnosis": {
    "project": "D:/Projects/MyGame/",
    "project_name": "MyGame",
    "asset_registry_ready": true,
    "asset_count": 1523,
    "level_name": "Main",
    "actor_count": 45,
    "actors": [
      {"name": "Chair_01", "class": "StaticMeshActor", "location": "X=100 Y=200 Z=50"}
    ],
    "content_dirs": ["/Game/", "/Engine/"],
    "imports_assets": ["/Game/Imports/chair.glb"],
    "imports_count": 1
  }
}
```

---

#### 6.6 检查 UE 桥接状态
**接口**: `GET /api/ue/bridge-status`

**描述**: 检查 UE 命令桥接是否正在运行

**响应**:
```json
{
  "bridge_running": true,
  "message": "UE 命令桥接正常运行"
}
```

---

### 七、聊天代理 API (DeepSeek)

#### 7.1 聊天
**接口**: `POST /api/chat`

**描述**: DeepSeek 聊天代理接口 - 前端无需 API Key

**请求体**:
```json
{
  "messages": [
    {"role": "system", "content": "你是一个专业的3D设计师"},
    {"role": "user", "content": "帮我设计一个客厅"}
  ],
  "model": "deepseek-chat",
  "temperature": 0.7,
  "max_tokens": 4000
}
```

| 参数 | 类型 | 必需 | 默认值 | 说明 |
|------|------|------|--------|------|
| messages | array | 是 | - | 消息列表 |
| model | string | 否 | deepseek-chat | 模型名称 |
| temperature | float | 否 | 0.7 | 温度参数 |
| max_tokens | int | 否 | 4000 | 最大 token 数 |

**响应**:
```json
{
  "content": "好的，我来为您设计一个现代风格的客厅...",
  "reasoning": "我考虑了中国传统元素与现代设计的结合...",
  "success": true,
  "error": null
}
```

---

### 八、Agent 代理 API

> 注意: Agent 服务需单独启动，默认端口 3001

#### 8.1 创建 Agent 会话
**接口**: `POST /api/agent/session`

**描述**: 创建 Agent 会话

**请求体**:
```json
{
  "sessionId": "agent_sess_001",
  "cwd": "D:/Projects/MyGame"
}
```

---

#### 8.2 Agent 聊天 (SSE)
**接口**: `POST /api/agent/chat`

**描述**: 与 Agent 对话，返回 SSE 事件流

**请求体**:
```json
{
  "sessionId": "agent_sess_001",
  "message": "帮我创建一个角色蓝图",
  "cwd": "D:/Projects/MyGame"
}
```

**响应**: SSE 事件流

```
data: {"type": "content", "content": "好的"}

data: {"type": "content", "content": "我正在创建"}

data: {"type": "done"}

```

---

#### 8.3 获取 Agent 工具列表
**接口**: `GET /api/agent/tools`

**描述**: 获取可用工具列表

---

#### 8.4 中断/引导 Agent
**接口**: `POST /api/agent/steer`

**描述**: 软转向，中断当前执行并引导新方向

---

#### 8.5 强制停止 Agent
**接口**: `POST /api/agent/abort`

**描述**: 立即中断 Agent

---

#### 8.6 删除 Agent 会话
**接口**: `DELETE /api/agent/session/{session_id}`

---

#### 8.7 检查 Agent 健康状态
**接口**: `GET /api/agent/health`

---

### 九、引擎脚本生成 API (已弃用)

> ⚠️ **已弃用** - 以下接口不再维护，仅返回硬编码模板，无实际功能

#### 9.1 生成 UE 脚本
**接口**: `POST /api/generate-engine-script`

**描述**: 生成 UE 蓝图/Python 脚本提示

**请求体**:
```json
{
  "sceneDescription": "现代化办公室场景",
  "quality": "medium",
  "scriptType": "scene_controller"
}
```

| 参数 | 类型 | 必需 | 默认值 | 说明 |
|------|------|------|--------|------|
| sceneDescription | string | 否 | - | 场景描述 |
| quality | string | 否 | medium | 质量等级 |
| scriptType | string | 否 | scene_controller | 脚本类型: scene_controller/object_behavior |

**响应**:
```json
{
  "success": true,
  "scriptType": "scene_controller",
  "content": "import unreal\n\ndef setup_scene():\n    ...",
  "fileName": "scene_controller.py"
}
```

---

### 十、系统配置 API

#### 10.1 获取配置信息
**接口**: `GET /api/config`

**描述**: 返回前端配置信息

**响应**:
```json
{
  "deepseekConfigured": true,
  "tencentConfigured": true,
  "agentEnabled": true
}
```

---

### 十一、兼容旧接口

#### 11.1 生成 3D 模型 (旧)
**接口**: `POST /generate-3d`

**描述**: 兼容旧接口，使用腾讯混元生3D极速版

**请求体**:
```json
{
  "text": "一个简单的立方体",
  "result_format": "FBX",
  "enable_pbr": false,
  "enable_geometry": false
}
```

| 参数 | 类型 | 必需 | 默认值 | 说明 |
|------|------|------|--------|------|
| text | string | 是 | - | 3D内容描述(中文) |
| result_format | string | 否 | GLB | 格式: OBJ/GLB/STL/USDZ/FBX/MP4 |
| enable_pbr | boolean | 否 | false | 是否开启PBR材质 |
| enable_geometry | boolean | 否 | false | 是否单几何生成(白模) |

**响应**:
```json
{
  "task_id": "job_123456",
  "status": "processing"
}
```

---

#### 11.2 查询任务状态 (旧)
**接口**: `GET /task-status/{task_id}`

**响应**:
```json
{
  "status": "ready",
  "model_url": "https://..."
}
```

---

## 存储目录结构

```
backend/
├── history.db                 # SQLite 数据库
├── storage/
│   ├── temp/                  # 临时文件
│   ├── object_files/          # 单个对象模型缓存
│   │   └── {object_id}.cached
│   └── scenes/               # 场景模型
│       └── {scene_id}/
│           └── models/
│               └── {object_id}.glb
└── Content/
    └── Imports/               # UE 预置模型
        ├── 小学生椅子.glb
        ├── 小学生课桌.glb
        ├── 欧式古典书桌.glb
        └── 长条书桌.glb
```

---

## 错误码说明

| HTTP 状态码 | 说明 |
|-------------|------|
| 200 | 成功 |
| 400 | 请求参数错误 |
| 404 | 资源不存在 |
| 500 | 服务器内部错误 |
| 502 | 上游服务错误 (如模型URL失效) |
| 503 | Agent 服务不可用 |

---

## 调用示例

### Python 请求示例

```python
import requests

BASE_URL = "http://localhost:8000"

# 1. 创建场景
scene_resp = requests.post(f"{BASE_URL}/api/generate-scene", json={
    "description": "一个现代化的办公室场景",
    "quality": "medium",
    "user_id": "user123"
})
scene_id = scene_resp.json()["scene_id"]

# 2. 轮询状态
import time
while True:
    status_resp = requests.get(f"{BASE_URL}/api/status/{scene_id}")
    status_data = status_resp.json()
    print(f"进度: {status_data['progress']}%")
    if status_data["status"] in ("ready", "failed"):
        break
    time.sleep(3)

# 3. 下载模型
if status_data["status"] == "ready":
    model_resp = requests.get(f"{BASE_URL}/api/download/{scene_id}")
    with open("scene.glb", "wb") as f:
        f.write(model_resp.content)
```

---

## 注意事项

1. **模型 URL 失效问题**: 云端模型 URL 有时效性，系统会自动下载到本地缓存，后续优先使用本地文件
2. **Agent 服务**: 需单独启动 PiAgent 服务 (默认端口 3001)
3. **UE 集成**: 需要 UE 编辑器运行并启动命令桥接
4. **CORS**: 默认允许所有来源访问
