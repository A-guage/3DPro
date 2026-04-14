# 3DPro 智能3D场景生成系统 - 安装说明

## 一、系统要求

### 软件要求
| 软件 | 版本要求 | 下载地址 |
|------|----------|----------|
| Node.js | ≥18.0.0 | https://nodejs.org/ |
| Python | ≥3.10 | https://www.python.org/ |
| Unreal Engine | 5.1+ | https://www.unrealengine.com/ |
| Git | 最新版 | https://git-scm.com/ |
| npm / yarn | 最新版 | 随 Node.js 附带 |

---

## 二、环境准备

### 2.1 安装 Node.js

1. 访问 https://nodejs.org/ 下载 LTS 版本
2. 运行安装程序，勾选 "Add to PATH"
3. 验证安装：
```bash
node --version
npm --version
```

### 2.2 安装 Python

1. 访问 https://www.python.org/downloads/ 下载 Python 3.10+
2. 运行安装程序，**务必勾选** "Add Python to PATH"
3. 验证安装：
```bash
python --version
pip --version
```

### 2.3 安装 Unreal Engine

1. 下载 Epic Games Launcher：https://www.epicgames.com/download
2. 安装完成后，启动 Launcher，登录账号
3. 进入 "Unreal Engine" 标签，点击 "安装引擎"
4. 选择版本 5.1 或更高，安装目录建议使用默认路径
5. 安装时勾选 "Python Editor Scripting" 和 "Blueprint API"

### 2.4 安装 Git

1. 访问 https://git-scm.com/download/win 下载
2. 运行安装程序，全程默认选项即可
3. 验证安装：
```bash
git --version
```

---

## 三、项目安装

### 3.1 克隆项目
 下载项目压缩包

### 3.2 后端安装

```bash
# 进入后端目录
cd 3DDesktopApp/backend

# 创建虚拟环境（推荐）
python -m venv venv

# 激活虚拟环境
# Windows:
venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate

# 安装依赖
pip install -r requirements.txt
```

### 3.3 前端安装

```bash
# 新开一个终端，进入前端目录
cd 3DDesktopApp/frontend

# 安装依赖
npm install
```

### 3.4 PiAgent 安装

```bash
# 新开一个终端，进入 PiAgent 目录
cd PiAgent_Project

# 安装 Node.js 依赖
npm install
```

### 3.5 UnrealMCP 安装

UnrealMCP 是连接本系统与 Unreal Engine 的桥梁插件。

1. 在压缩包中找到 UnrealMCP 插件文件夹
2. 将插件复制到 UE 项目目录：
3. 启动 UE 编辑器，加载插件

---

## 四、配置说明

### 4.1 后端配置

```bash
# 进入后端目录
cd 3DDesktopApp/backend

# 复制环境变量模板
copy .env.example .env

# 编辑 .env 文件，填入你的 API 密钥
```

**.env 文件配置项：**

```env
# DeepSeek API（用于场景规划和自然语言处理）
# 申请地址：https://platform.deepseek.com/
DEEPSEEK_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxx

# 腾讯云密钥（用于 3D 模型生成）
# 申请地址：https://console.cloud.tencent.com/cam/capi
TENCENT_SECRET_ID=your-tencent-secret-id
TENCENT_SECRET_KEY=your-tencent-secret-key

# 腾讯云区域（默认广州）
TENCENT_REGION=ap-guangzhou

```

### 4.2 PiAgent 配置

```bash
# 进入 PiAgent 目录
cd PiAgent_Project

# 复制环境变量模板
copy .env.example .env

# 编辑 .env 文件
```
---

## 五、运行说明
### 5.1 启动 3DPro 系统
    在3DDesktopApp目录下,点击'start-all.bat'一键启动脚本。

### 5.2 启动 Unreal Engine

1. 打开 Epic Games Launcher
2. 进入 "Unreal Engine" → "库" → "启动" 你的项目
3. 在 UE 编辑器中，确保 UnrealMCP 插件已启用

---

## 六、使用流程

1. **打开前端**：访问 http://localhost:5173或者使用electron打开(一键式启动脚本)
2. **输入场景描述**：例如"生成一个温馨的卧室"
3. **选择风格**：写实/卡通/低多边形等
4. **确认方案**：选择场景布局方案
5. **等待生成**：系统自动生成各个 3D 物体模型
6. **场景组装**：AI Agent 自动将模型导入 UE 并组装
7. **UE 编辑**：在 Unreal Engine 中进一步调整

---

## 七、常见问题

### Q1: 依赖安装失败

**问题**：pip install 报 SSL 错误或超时
**解决**：
```bash
pip install -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple
```

### Q2: UnrealMCP 连接失败

**问题**：提示 "Connection refused"
**解决**：
1. 确认 UE 编辑器已启动且插件已启用
2. 确认 MCP 服务器路径正确
3. 检查防火墙是否阻止了 55557 端口

### Q3: 模型生成失败

**问题**：提示 "API error" 或 "generation failed"
**解决**：
1. 检查腾讯云 API 密钥是否正确配置
2. 检查网络连接是否正常
3. 查看后端日志获取详细错误信息

### Q4: 前端无法连接后端

**问题**：网络请求超时
**解决**：
1. 确认后端服务已启动（uvicorn）
2. 检查端口是否被占用：`netstat -ano | findstr 8000`
3. 检查前端 .env 中的 API 地址是否正确

---

## 八、比赛作品提交说明

提交作品时，需确保：

1. **代码完整**：提交完整源码，包含 README.md
2. **依赖说明**：提供 requirements.txt 和 package.json
3. **配置模板**：提供 .env.example
4. **演示视频**：录制 3-5 分钟操作演示
5. **可执行性**：确保评委能按照文档顺利运行

### 打包建议

```bash
# 导出依赖列表
pip freeze > requirements.txt
npm list --depth=0 > dependencies.txt
```

---

## 九、设计思路

### 9.1 整体架构设计

本系统采用**分层架构**设计，将复杂的 3D 场景生成任务拆分为多个独立模块，通过 API 和消息队列进行通信，实现高内聚、低耦合的系统结构。

```
┌─────────────────────────────────────────────────────────────┐
│                      用户交互层 (React)                       │
│   场景描述输入 → 风格选择 → 方案展示 → 实时预览 → UE 编辑      │
└─────────────────────────────────────────────────────────────┘
                              ↓ HTTP/SSE
┌─────────────────────────────────────────────────────────────┐
│                    AI Agent 层 (PiAgent)                     │
│   自然语言理解 → 任务规划 → 工具编排 → 场景组装 → 错误恢复     │
└─────────────────────────────────────────────────────────────┘
           ↓ 工具调用                    ↓ MCP 协议
┌─────────────────────┐        ┌─────────────────────────────┐
│   3D 生成服务层      │        │     UE 自动化控制层          │
│   (FastAPI + 混元)   │        │   (UnrealMCP + Python)      │
└─────────────────────┘        └─────────────────────────────┘
           ↓                            ↓
┌─────────────────────┐        ┌─────────────────────────────┐
│   模型资产库 (SQLite)│        │   Unreal Engine 5 编辑器    │
└─────────────────────┘        └─────────────────────────────┘
```

### 9.2 AI Agent 集成设计

本系统的核心创新在于将 **AI Agent（PiAgent）** 作为中枢控制器，协调多个子系统完成复杂任务。

**设计要点：**

1. **工具抽象层**
   - 将 3D 生成、模型查询、UE 操作等能力封装为统一工具接口
   - 工具定义遵循 PiAgent SDK 规范：`name`, `description`, `parameters`, `execute`
   - 工具返回值统一格式：`{ content: [{ type: "text", text: "..." }], details: {} }`

2. **多阶段工作流**
   ```
   阶段一：风格选择 ──→ 阶段二：方案确认 ──→ 阶段三：模型生成 ──→ 阶段四：场景组装
   ```
   - 每个阶段 Agent 向用户展示选项而非提问，实现"无问答式"交互
   - 阶段切换由用户确认触发，保证可控性

3. **MCP 协议扩展**
   - 通过 MCP（Model Context Protocol）连接 UnrealMCP 服务器
   - 将 UE 的编辑器操作能力（spawn_actor、set_transform 等）暴露给 Agent
   - 支持断线重连和超时处理

### 9.3 3D 模型生成流程设计

采用**两阶段生成策略**：

**第一阶段：规划阶段**
```
用户输入 "温馨的卧室"
    ↓
DeepSeek API 优化提示词
    ↓
分解为独立物体清单：床、衣柜、书桌、椅子、台灯、地毯、窗帘
    ↓
plan_3d_models 工具展示清单，等待用户确认
```

**第二阶段：生成阶段**
```
用户确认后，系统自动逐个调用混元 3D API
    ↓
每个模型生成后自动查询状态
    ↓
所有模型完成 → 通知 Agent 进入组装阶段
```

### 9.4 模型资产管理设计

建立本地模型资产库，解决重复生成问题：

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  生成请求     │────▶│  资产库查询   │────▶│  命中？       │
└──────────────┘     └──────────────┘     └──────┬───────┘
                                                 │否
                   ┌──────────────┐              ▼
                   │  混元 3D API  │◀──── 生成新模型
                   └──────┬───────┘
                          │
                          ▼
                   ┌──────────────┐
                   │  资产库存储   │
                   └──────────────┘
```

**技术实现：**
- 使用 SQLite 数据库存储元数据（object_id, object_name, status, local_path）
- 模型文件存储在 `backend/storage/object_files/` 目录
- 支持按名称模糊搜索和状态过滤

### 9.5 UE 自动化控制设计

**MCP 直连模式（推荐）：**
```
Agent Service ──TCP:55557──▶ UnrealMCP Server ──▶ UE Python API
```

**核心操作流程：**
1. `download_and_import_model` - 从 URL 下载模型并导入 UE
2. `spawn_actor` - 在场景中创建 Actor
3. `set_actor_transform` - 设置位置、旋转、缩放
4. `create_blueprint` - 创建蓝图（仅当需要逻辑时）

---

## 十、设计重难点

### 10.1 AI Agent 与专业工具的协作

**难点描述：**
AI Agent 本身不具备 3D 生成能力，需要通过工具调用协调多个专业服务。如何设计工具接口使其既符合 Agent 的调用习惯，又完整表达专业能力，是一大挑战。

**解决思路：**
- 抽象出 `plan_3d_models`、`generate_3d_model`、`browse_model_library` 等高层工具
- 工具描述（description）包含详细的使用规则和参数说明
- 设计 `details` 字段传递结构化结果，避免纯文本解析

### 10.2 多系统异步通信与状态同步

**难点描述：**
3D 模型生成是耗时任务（通常 3-10 分钟），涉及前端→Agent→后端→混元API→后端→Agent→前端的长链路。如何可靠地传递状态、错误和完成通知是技术难点。

**解决思路：**
- **SSE（Server-Sent Events）**：Agent 服务通过 SSE 向前端推送事件流
- **事件标准化**：定义统一的事件格式 `message_update`、`tool_execution_start/end`、`agent_end`
- **多格式兼容**：适配 PiAgent SDK 的多种事件格式（Anthropic/OpenAI/原生）

### 10.3 用户交互流程的"无问答式"设计

**难点描述：**
传统 AI 对话需要多轮问答确认，但用户可能不知道如何描述需求。设计一种"展示-选择"而非"提问-回答"的交互模式对 Agent 提示词设计要求很高。

**解决思路：**
- 在系统提示词中强制规定输出格式：`OPTC--OPTIONS--` 选项块
- 阶段一必须展示风格选项列表（固定按钮）
- 阶段二展示方案对比（带详情）
- 任何情况下都不主动提问，只提供选择

### 10.4 UE 跨进程控制的稳定性

**难点描述：**
UE 编辑器运行在独立进程，Agent 通过 Python 脚本或 MCP 与其通信。进程崩溃、连接中断、API 不响应等情况需要妥善处理。

**解决思路：**
- **双模式备份**：同时支持命令桥接（文件轮询）和 MCP（TCP 直连）
- **超时机制**：所有通信设置超时阈值（MCP 60s/120s，命令桥接 300s）
- **断线重连**：MCP 客户端自动检测连接丢失并重连
- **日志持久化**：即使 UE 崩溃，输出日志仍可通过文件系统读取

### 10.5 模型资产的规范管理

**难点描述：**
随着使用次数增加，本地模型资产库会不断膨胀。如何组织文件结构、支持快速检索、避免命名冲突，是资产管理的核心问题。

**解决思路：**
- **SQLite 元数据库**：存储 object_id、object_name、status、created_at、local_path
- **文件命名规范**：中文字段转拼音/英文，禁止特殊字符
- **格式自动检测**：通过文件头部 magic bytes 识别 FBX/GLB/OBJ
- **按需缓存**：模型文件首次请求时下载，之后直接使用本地缓存

---

## 十一、技术创新点

| 序号 | 创新点 | 说明 |
|------|--------|------|
| 1 | **AI Agent 中枢控制** | 首次将 AI Agent 引入 3D 场景生成流程，实现从"工具调用"到"智能编排"的升级 |
| 2 | **无问答式交互** | 通过强制选项展示替代传统问答，大幅降低用户学习成本 |
| 3 | **MCP 协议扩展** | 基于 Model Context Protocol 实现 Agent 与 UE 的双向通信 |
| 4 | **两阶段生成策略** | 规划与执行分离，用户可预览和调整物体清单后再生成 |
| 5 | **本地资产库** | 解决重复生成问题，支持按名称搜索和状态过滤 |
| 6 | **SSE 实时推送** | 通过 Server-Sent Events 实现 Agent 到前端的实时进度反馈 |

---

## 十二、后续优化方向

1. **支持更多 3D 生成引擎**：接入 Shap-E、Tripo3D 等替代方案
2. **场景布局优化**：引入强化学习自动优化物体摆放位置
3. **材质与光照智能**：基于场景风格自动匹配材质球和灯光设置
4. **协作编辑功能**：支持多用户同时编辑同一场景
5. **移动端适配**：开发移动端查看器，支持 AR 预览

---

## 十三、联系方式

如有问题，请联系：
- 邮箱：your.email@example.com
- GitHub Issues：https://github.com/your-repo/3DPro/issues

---

**祝比赛顺利！**
