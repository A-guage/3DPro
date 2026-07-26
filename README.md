# 3DPro - 元境智造——基于大模型协同的元宇宙场景自动化生成系统

> 集成 AI Agent、3D 生成、Unreal Engine 的智能3D场景创作平台

## 📖 项目概述

3DPro 是一个完整的 AI 驱动 3D 场景生成解决方案，包含以下核心组件：

- **3DDesktopApp** - Electron 桌面应用（前端 + 后端 + 3D预览）
- **PiAgent_Project** - AI Agent 服务（智能工具调用）
- **unreal-mcp-main** - Unreal Engine MCP 插件（UE集成）

### 技术栈

| 组件 | 技术栈 |
|------|--------|
| 桌面应用 | Electron + React + TypeScript + Vite |
| 后端服务 | Python + FastAPI + SQLModel + SQLite |
| 3D 预览 | Three.js + React Three Fiber |
| AI Agent | Node.js + MCP (Model Context Protocol) |
| UE 集成 | Unreal Engine 5.5 + C++ Plugin |
| AI 服务 | DeepSeek API + 腾讯混元3D |

---

## 🚀 快速启动

### 一键启动（推荐）

双击运行以下文件即可启动所有服务：

```
d:\3DPro\3DDesktopApp\start-all.bat
```

该脚本会自动启动：
1. **PiAgent Service** - http://localhost:3001
2. **FastAPI Backend** - http://localhost:8000
3. **Frontend (Vite)** - http://localhost:5173
4. **UnrealMCP Server** - MCP bridge to Unreal Engine
5. **Electron Desktop** - 桌面应用窗口

### 环境要求

- **Python 3.8+**
- **Node.js 18+**
- **Windows 10/11**
- **Unreal Engine 5.5**（用于 UE 集成）

### 首次运行配置

1. **配置 API 密钥**
    
   在 `3DDesktopApp/backend/` 目录创建 `.env` 文件：
   ```env
   TENCENT_SECRET_ID=你的腾讯云SecretId
   TENCENT_SECRET_KEY=你的腾讯云SecretKey
   DEEPSEEK_API_KEY=你的DeepSeek API Key
   ```
   在 `PiAgent_Project/` 目录创建 `.env` 文件：
   ```env
   OPENAI_API_KEY=YOUR_DEEPSEEK_API_KEY
   ```
   直接修改.env.example文件,并重命名为.env即可。

2. **安装依赖**（首次运行需要）
   ```bash
   # 后端依赖
   cd 3DDesktopApp/backend
   python -m venv venv
   venv\Scripts\pip install -r requirements.txt
   
   # 前端依赖
   cd ../frontend
   npm install
   
   # Electron 依赖
   cd ..
   npm install
   
   # Agent 依赖
   cd ../../PiAgent_Project
   npm install
   ```

### 访问地址

| 服务 | 地址 | 说明 |
|------|------|------|
| 前端界面 | http://localhost:5173 | Web 界面 |
| 后端 API | http://localhost:8000/docs | FastAPI 文档 |
| Agent 服务 | http://localhost:3001 | AI Agent API |
| Electron | 自动打开 | 桌面应用窗口 |

---

## 📁 项目结构

```
d:\3DPro\
│
├── 3DDesktopApp/                    # 主桌面应用
│   ├── backend/                     # Python FastAPI 后端
│   │   ├── main.py                  # FastAPI 入口
│   │   ├── scene_generator.py       # 场景生成逻辑
│   │   ├── deepseek_client.py       # DeepSeek API 客户端
│   │   ├── hunyuan_client.py        # 腾讯混元3D API 客户端
│   │   ├── ue_integration.py        # Unreal Engine 集成
│   │   ├── unity_integration.py     # Unity 集成
│   │   ├── history_models.py        # 数据库模型
│   │   ├── config.py                # 配置文件
│   │   ├── venv/                    # Python 虚拟环境
│   │   ├── storage/                 # 数据存储
│   │   │   ├── object_files/        # 生成的3D模型文件
│   │   │   └── temp/                # 临时文件
│   │   └── Content/                 # 静态资源
│   │       └── Imports/             # 导入的模型文件
│   │
│   ├── frontend/                    # React 前端
│   │   ├── src/
│   │   │   ├── components/          # UI 组件
│   │   │   │   ├── ChatPanel/       # 聊天面板
│   │   │   │   ├── ObjectList/      # 物体列表
│   │   │   │   ├── SceneViewer/     # 3D 场景预览
│   │   │   │   └── TitleBar/        # 标题栏
│   │   │   ├── hooks/               # 自定义 Hooks
│   │   │   ├── services/            # API 服务
│   │   │   ├── types/               # TypeScript 类型
│   │   │   └── utils/               # 工具函数
│   │   ├── package.json
│   │   └── vite.config.ts
│   │
│   ├── electron/                    # Electron 主进程
│   │   ├── main.js                  # 主进程入口
│   │   └── preload.js               # 预加载脚本
│   │
│   ├── start-all.bat                # 一键启动脚本 ⭐
│   ├── package.json                 # 项目配置
│   └── electron-builder.yml         # 打包配置
│
├── PiAgent_Project/                 # AI Agent 服务
│   ├── agent_service/               # Agent 服务代码
│   │   └── index.mjs                # Agent 入口
│   ├── mcp-config.json              # MCP 服务器配置
│   ├── run_agent_with_mcp.js        # 带 MCP 支持的启动脚本
│   └── README.md
│
└── unreal-mcp-main/                 # Unreal Engine MCP 插件
    ├── Plugins/
    │   └── UnrealMCP/               # UE 插件目录 ⭐
    │       ├── Source/              # C++ 源码
    │       │   └── UnrealMCP/
    │       │       ├── Private/     # 私有实现
    │       │       │   ├── Commands/  # 命令处理器
    │       │       │   ├── MCPServerRunnable.cpp
    │       │       │   ├── UnrealMCPBridge.cpp
    │       │       │   └── UnrealMCPModule.cpp
    │       │       └── Public/      # 公共头文件
    │       ├── Binaries/            # 编译产物
    │       └── UnrealMCP.uplugin    # 插件描述文件
    │
    └── Python/                      # Python MCP 服务器
        ├── unreal_mcp_server.py     # MCP 服务器入口
        ├── tools/                   # 工具模块
        │   ├── blueprint_tools.py   # 蓝图工具
        │   ├── editor_tools.py      # 编辑器工具
        │   ├── node_tools.py        # 节点工具
        │   ├── project_tools.py     # 项目工具
        │   └── umg_tools.py         # UMG 工具
        └── scripts/                 # 测试脚本
```

---

## 🎮 Unreal Engine 插件安装

### 插件位置

UnrealMCP 插件位于：
```
d:\3DPro\unreal-mcp-main\Plugins\UnrealMCP\
```

### 安装步骤

1. **复制插件到 UE 项目**

   将 `UnrealMCP` 文件夹复制到你的 UE 项目的 `Plugins` 目录：
   ```
   你的UE项目/
   └── Plugins/
       └── UnrealMCP/     # 复制到这里
           ├── Source/
           ├── Binaries/
           └── UnrealMCP.uplugin
   ```

2. **启用插件**

   - 打开 UE 编辑器
   - 菜单：Edit → Plugins
   - 搜索 "UnrealMCP"
   - 勾选启用

3. **重启编辑器**

   插件需要重启编辑器才能完全加载

### 依赖插件

UnrealMCP 需要以下插件支持（会自动启用）：
- **EditorScriptingUtilities** - 编辑器脚本工具

### 验证安装

启动 UnrealMCP Server 后，检查日志：
```
unreal_mcp.log
```

如果连接成功，日志会显示与 UE 编辑器的通信信息。

---

## 🔧 各模块详细说明

### 1. 3DDesktopApp - 桌面应用

主应用程序，提供用户界面和核心功能。

**功能特性：**
- AI 场景生成（DeepSeek 规划 + 腾讯混元3D）
- 实时 3D 预览（Three.js）
- 会话管理（置顶、重命名、删除）
- 对话助手（DeepSeek 深度思考）
- 物品单独生成
- 模型下载（GLB 格式）
- 历史记录管理

**启动方式：**
```bash
cd 3DDesktopApp
# 方式1: 一键启动
start-all.bat

# 方式2: 分别启动
# 后端
cd backend && venv\Scripts\activate && uvicorn main:app --reload
# 前端
cd frontend && npm run dev
# Electron
npm run start
```

### 2. PiAgent_Project - AI Agent 服务

智能 AI 助手服务，支持工具调用和 MCP 扩展。

**功能特性：**
- 智能工具调用
- MCP (Model Context Protocol) 支持
- 自动代码生成
- Unreal Engine / Unity 集成

**配置文件：**
- `mcp-config.json` - MCP 服务器配置
- `.env` - API 密钥配置

**启动方式：**
```bash
cd PiAgent_Project
node agent_service/index.mjs
```

### 3. unreal-mcp-main - UE MCP 插件

Unreal Engine 与 AI Agent 的桥接插件。

**功能特性：**
- 通过 MCP 协议控制 UE 编辑器
- 蓝图创建和编辑
- 场景物体操作
- 材质和组件管理
- UMG 界面创建

**Python 服务器：**
```bash
cd unreal-mcp-main/Python
python unreal_mcp_server.py
```

**测试脚本：**
```bash
# 测试创建立方体
python scripts/actors/test_cube.py

# 测试蓝图创建
python scripts/blueprints/test_create_and_spawn_cube_blueprint.py
```

---

## 🔄 服务通信架构

```
┌─────────────────────────────────────────────────────────────┐
│                     Electron Desktop App                     │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              React Frontend (Port 5173)              │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │   │
│  │  │ ChatPanel   │  │ SceneViewer │  │ ObjectList  │  │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│               FastAPI Backend (Port 8000)                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ DeepSeek API │  │ 腾讯混元3D   │  │ SQLite DB    │      │
│  │ (场景规划)   │  │ (模型生成)   │  │ (历史记录)   │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              PiAgent Service (Port 3001)                     │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              MCP (Model Context Protocol)             │  │
│  │  ┌────────────────┐  ┌────────────────┐              │  │
│  │  │ UnrealMCP      │  │ Unity MCP      │  ...         │  │
│  │  │ (UE 集成)      │  │ (Unity 集成)   │              │  │
│  │  └────────────────┘  └────────────────┘              │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Unreal Engine 5.5                         │
│  ┌──────────────────────────────────────────────────────┐  │
│  │                  UnrealMCP Plugin                     │  │
│  │  - 蓝图操作    - 场景管理    - 材质编辑              │  │
│  │  - 组件管理    - UMG 创建    - 项目操作              │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## 🐛 故障排查

### 问题1：端口被占用

**症状：** 启动失败，提示端口已被使用

**解决方案：**
```bash
# 查看端口占用
netstat -ano | findstr :3001
netstat -ano | findstr :8000
netstat -ano | findstr :5173

# 终止进程
taskkill /PID <进程ID> /F
```

或直接运行 `start-all.bat`，它会自动清理旧进程。

### 问题2：Python 依赖缺失

**症状：** 后端启动失败，提示模块未找到

**解决方案：**
```bash
cd 3DDesktopApp/backend
venv\Scripts\pip install -r requirements.txt
```

### 问题3：UE 插件加载失败

**症状：** UE 编辑器提示插件加载错误

**检查项：**
1. UE 版本是否为 5.5
2. 插件是否放置在正确位置
3. 是否启用了 EditorScriptingUtilities 插件
4. 查看日志：`unreal_mcp.log`

### 问题4：UnrealMCP Server 连接失败

**症状：** MCP Server 启动但无法连接 UE

**解决方案：**
1. 确保 UE 编辑器已启动并加载项目
2. 确保 UnrealMCP 插件已启用
3. 检查防火墙设置
4. 查看日志文件

---

## 📝 开发指南

### 添加新的 API 端点

```python
# 3DDesktopApp/backend/main.py
@app.post("/api/new-endpoint")
async def new_endpoint(request: NewRequest):
    # 实现逻辑
    return {"result": "success"}
```

### 添加新的前端组件

```tsx
// 3DDesktopApp/frontend/src/components/NewComponent/NewComponent.tsx
import React from 'react';

export const NewComponent: React.FC = () => {
  return <div>New Component</div>;
};
```

### 添加新的 MCP 工具

```python
# unreal-mcp-main/Python/tools/new_tools.py
def new_tool(param: str) -> dict:
    """新工具描述"""
    # 实现逻辑
    return {"status": "success"}
```

---

## 📚 相关文档

- [3DDesktopApp 详细文档](./3DDesktopApp/README.md)
- [PiAgent 使用说明](./PiAgent_Project/README.md)
- [UnrealMCP 文档](./unreal-mcp-main/Python/README.md)
- [后端 API 文档](./3DDesktopApp/backend/API_DOCUMENTATION.md)

---

## 🙏 致谢

- [Electron](https://www.electronjs.org/)
- [React](https://react.dev/)
- [FastAPI](https://fastapi.tiangolo.com/)
- [Three.js](https://threejs.org/)
- [DeepSeek](https://www.deepseek.com/)
- [腾讯混元3D](https://cloud.tencent.com/product/hunyuan3d)
- [Unreal Engine](https://www.unrealengine.com/)

---

**版本：** 1.0.0  
**更新时间：** 2026-04-13
