# SceneSynth

> 从自然语言到 3D 世界

[![Python](https://img.shields.io/badge/Python-3.12%2B-3776AB?logo=python&logoColor=white)](./deer-flow-main/backend/pyproject.toml)
[![Node.js](https://img.shields.io/badge/Node.js-22%2B-339933?logo=node.js&logoColor=white)](./deer-flow-main/Makefile)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./deer-flow-main/LICENSE)

**SceneSynth** 是一个聚焦 3D 领域的 AI 超级智能体平台。通过自然语言描述，自动生成高质量 3D 模型与场景，覆盖教育、工业、游戏等多个领域。

基于 [DeerFlow 2.0](https://github.com/bytedance/deer-flow) 框架深度定制，集成了多模态大语言模型、3D 生成引擎和实时渲染能力。

---

## 核心能力

| 场景 | 说明 | 工作室 |
|------|------|--------|
| **教育场景** | VR 沉浸式教学，快速构建历史场景、科学实验、虚拟课堂 | `/workspace/education-studio` |
| **工业仿真** | 工厂布局、设备仿真、工艺流程可视化，对接 3D 打印制造 | `/workspace/industrial-studio` |
| **游戏领域** | AI 驱动的游戏关卡、场景资产、角色环境自动生成 | `/workspace/3d-studio` |
| **通用场景** | 展览展示、建筑设计、数字孪生等任意 3D 场景快速搭建 | `/workspace` |

## 技术架构

```
┌─────────────────────────────────────────────────────────┐
│                    浏览器 (Next.js)                       │
│  ┌───────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │  3D 视口   │  │  AI 对话面板  │  │    资产库管理     │  │
│  │ Three.js   │  │  Agent Chat  │  │  Asset Browser   │  │
│  └───────────┘  └──────────────┘  └──────────────────┘  │
└────────────────────────┬────────────────────────────────┘
                         │
┌────────────────────────┴────────────────────────────────┐
│               FastAPI 网关 (:8001)                       │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────┐  │
│  │ Agent    │  │ scene3d  │  │  Memory  │  │ Skills │  │
│  │ Runtime  │  │  Router  │  │  Store   │  │ Loader │  │
│  └──────────┘  └────┬─────┘  └──────────┘  └────────┘  │
└─────────────────────┼───────────────────────────────────┘
                      │
┌─────────────────────┴───────────────────────────────────┐
│          scene3d-mcp-server (:3020)                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────────┐  │
│  │ 场景生成  │  │ 资产管理  │  │ 3D 引擎集成 (UE5)   │  │
│  └──────────┘  └──────────┘  └──────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

## 主要特性

- **自然语言驱动生成** — 用文字描述场景，AI 自动规划物体并生成 3D 模型
- **实时 3D 预览** — 基于 Three.js (React Three Fiber) 的浏览器内实时渲染，支持 FBX / GLTF / GLB 格式
- **三大专业工作室** — 教育场景、工业仿真、游戏开发，各有专属工作流和美术风格指导
- **多引擎对接** — 无缝导出至 Unreal Engine 5、Unity，支持 3D 打印格式 (STL)
- **对话式交互** — 与 AI Agent 自然对话，迭代优化场景，支持场景历史回溯
- **技能扩展体系** — 基于 Skill 机制的可插拔能力，支持自定义 3D 生成工作流

## 快速开始

### 环境要求

- Python 3.12+
- Node.js 22+
- scene3d-mcp-server（3D 生成后端服务）

### 配置

```bash
cd deer-flow-main

# 复制环境变量模板
cp .env.example .env

# 编辑 .env，填入你的 API Key
# DEEPSEEK_API_KEY=your-api-key
```

### 启动

**一键启动（推荐）：**

```bash
# PowerShell
.\scripts\start.ps1

# 或使用 Makefile
make dev
```

**手动启动：**

```bash
# 启动后端
cd backend
pip install -e .
uvicorn app.gateway.app:app --host 0.0.0.0 --port 8001

# 启动前端
cd frontend
pnpm install
pnpm dev
```

访问 http://localhost:3000 进入 SceneSynth。

### 停止

```bash
.\scripts\stop.ps1
```

## 项目结构

```
3DPro/
├── deer-flow-main/           # 主项目代码
│   ├── backend/              # Python 后端 (FastAPI + LangGraph)
│   │   ├── app/gateway/      # API 网关
│   │   │   └── routers/scene3d/  # 3D 场景 API
│   │   └── packages/harness/ # DeerFlow 核心引擎
│   ├── frontend/             # Next.js 前端
│   │   └── src/
│   │       ├── app/workspace/
│   │       │   ├── 3d-studio/        # 游戏场景工坊
│   │       │   ├── education-studio/ # 教育场景工作室
│   │       │   └── industrial-studio/# 工业仿真工作室
│   │       └── components/scene3d/   # 3D 核心组件
│   │           ├── SceneViewer/      # Three.js 渲染器
│   │           ├── ChatPanel/        # AI 对话面板
│   │           ├── ObjectList/       # 模型清单
│   │           └── services/         # API 服务层
│   ├── skills/public/        # AI 技能包
│   │   ├── scene-generation/ # 通用 3D 场景生成
│   │   ├── education-scene/  # 教育场景技能
│   │   └── industrial-scene/ # 工业场景技能
│   ├── config.example.yaml   # 配置模板
│   └── scripts/              # 启停脚本
├── 2026013439-作品报告.pdf    # 项目报告
└── README.md
```

## 3D 场景生成工作流

```
用户输入自然语言描述
        │
        ▼
  AI Agent 理解需求
        │
        ▼
  plan_scene 规划物体列表
  (每个物体含精确尺寸: 宽×高×深 cm)
        │
        ▼
  用户确认 → 调整
        │
        ▼
  generate 逐个生成 3D 模型
        │
        ▼
  status 轮询生成进度
        │
        ▼
  SceneViewer 实时渲染展示
        │
        ▼
  导出 / 导入 UE5 / 3D 打印
```

## 支持的资产类型

| 类型 | 说明 |
|------|------|
| `model_static` | 静态 3D 模型 |
| `model_skeletal` | 骨骼动画模型 |
| `scene` | 完整场景 |
| `texture` | 贴图纹理 |
| `material` | 材质 |
| `hdri` | 环境光照 |
| `animation` | 动画 |
| `vfx` | 视觉特效 |

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端框架 | Next.js, React, TypeScript |
| 3D 渲染 | Three.js, React Three Fiber, @react-three/drei |
| UI 组件 | Shadcn/UI, Tailwind CSS, Lucide Icons |
| 后端框架 | FastAPI, Python |
| AI 引擎 | LangGraph, LangChain |
| LLM | DeepSeek V4 Pro (可配置) |
| 数据库 | SQLite (可切换 PostgreSQL) |
| 3D 引擎集成 | Unreal Engine 5 (插件端口 3030) |

## 许可证

[MIT License](./deer-flow-main/LICENSE)

## 致谢

- [DeerFlow](https://github.com/bytedance/deer-flow) — 字节跳动开源的超级智能体框架
- [LangChain](https://github.com/langchain-ai/langchain) — LLM 交互框架
- [LangGraph](https://github.com/langchain-ai/langgraph) — 多智能体编排
- [Three.js](https://threejs.org/) — Web 3D 渲染引擎
- [Shadcn](https://ui.shadcn.com/) — UI 组件库
