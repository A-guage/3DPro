# 3D场景生成器 - 桌面版

> AI驱动的3D场景生成与预览桌面应用

## 📖 简介

这是一个基于 Electron + React + FastAPI 的桌面应用，集成了：
- **pi-coding-agent**：智能 AI 助手，支持工具调用
- **DeepSeek AI**：场景规划与对话助手
- **腾讯混元3D**：GLB模型生成
- **Three.js**：实时3D预览
- **SQLite**：本地数据存储

> 🤖 **Agent 模式**：已集成 pi-coding-agent，支持智能工具调用，可自动执行 3D 生成、场景布局、Unity 集成等操作。
> 详见 [Agent 集成指南](./AGENT_INTEGRATION.md) | [快速启动](./AGENT_QUICK_START.md)

## 🚀 快速开始

### 环境要求

- **Python 3.8+**
- **Node.js 18+**
- **Windows 10/11**（其他平台待测试）

### 安装步骤

#### 🌟 方法一：一键设置（推荐）

双击运行 `quick-start.bat`，自动完成所有初始化。

### 🤖 方法一-B：Agent 模式（智能工具调用）

双击运行 `start-with-agent.bat`，启动带 Agent 支持的完整服务。

- Agent 服务：http://localhost:3001
- 后端 API：http://localhost:8000
- 前端界面：http://localhost:5173

> 详见 [Agent 快速启动指南](./AGENT_QUICK_START.md)

#### 方法二：分步操作

**第1步：复制文件**

双击 `copy-files.bat` 或执行：
```powershell
powershell -ExecutionPolicy Bypass -File copy-files.ps1
```

**第2步：初始化环境**

双击 `setup.bat` 或执行：
```bash
npm install
cd frontend && npm install && cd ..
cd backend
python -m venv venv
venv\Scripts\pip install -r requirements.txt
```

**第3步：配置API密钥**

**方式一：环境变量（推荐）**

```powershell
# Windows PowerShell
$env:TENCENT_SECRET_ID = "你的腾讯云SecretId"
$env:TENCENT_SECRET_KEY = "你的腾讯云SecretKey"
$env:DEEPSEEK_API_KEY = "你的DeepSeek API Key"
```

**方式二：配置文件**

在 `backend` 目录创建以下文件：

- `deepseek_key`：写入DeepSeek API Key（格式：`sk-xxx`）

#### 3. 启动应用

双击运行 `start.bat` 或执行：

```bash
npm start
```

## 🛠️ 开发模式

### 启动开发环境

```bash
# 同时启动前端、后端、Electron
npm run dev
```

### 单独启动各服务

```bash
# 后端（端口 8000）
npm run dev-backend

# 前端（端口 5173）
npm run dev-frontend

# Electron（等待前端就绪后启动）
npm run dev-electron
```

### 访问地址

- **前端**：http://localhost:5173
- **后端API**：http://localhost:8000/docs
- **Electron**：自动打开应用窗口

## 📦 打包发布

### 构建生产版本

```bash
# 打包为Windows安装程序
npm run dist

# 或仅打包（不生成安装程序）
npm run pack
```

打包完成后，在 `dist` 目录可以找到：
- 安装程序（`.exe`）
- 可执行文件（`.exe`）

### 打包配置

编辑 `electron-builder.yml` 自定义：
- 应用名称和版本
- 安装目录
- 图标
- 打包格式

## 🏗️ 项目结构

```
3DDesktopApp/
├── electron/              # Electron主进程
│   ├── main.js           # 主进程入口
│   └── preload.js        # 预加载脚本
│
├── backend/              # Python后端
│   ├── main.py           # FastAPI入口
│   ├── scene_generator.py
│   ├── deepseek_client.py
│   ├── hunyuan_client.py
│   ├── history_models.py
│   ├── venv/             # Python虚拟环境
│   └── storage/          # 数据存储
│
├── frontend/             # React前端
│   ├── src/
│   │   ├── components/   # UI组件
│   │   ├── hooks/        # 自定义Hooks
│   │   ├── services/     # API服务
│   │   └── types/        # TypeScript类型
│   └── dist/             # 构建输出
│
├── build/                # 打包资源
│   ├── icon.ico         # Windows图标
│   └── icon.icns        # macOS图标
│
├── package.json          # 项目配置
├── electron-builder.yml  # 打包配置
├── setup.bat            # 环境初始化脚本
└── start.bat            # 启动脚本
```

## 🎯 功能特性

### ✅ 核心功能

- [x] AI场景生成（DeepSeek规划 + 腾讯混元3D）
- [x] 实时3D预览（Three.js）
- [x] 会话管理（置顶、重命名、删除）
- [x] 对话助手（DeepSeek深度思考）
- [x] 物品单独生成
- [x] 模型下载（GLB格式）
- [x] 历史记录管理

### ⏳ 待开发

- [ ] Unity插件集成（可选）
- [ ] 云端同步
- [ ] 多语言支持
- [ ] 深色/浅色主题切换

## 🔧 配置说明

### 后端配置

编辑 `backend/config.py`：

```python
TENCENT_REGION = "ap-guangzhou"
HUNYUAN_ENDPOINT = "ai3d.tencentcloudapi.com"
HUNYUAN_SERVICE = "ai3d"
HUNYUAN_VERSION = "2025-05-13"
```

### 前端配置

编辑 `frontend/.env`：

```env
VITE_API_BASE_URL=http://127.0.0.1:8000
VITE_APP_NAME=3D场景生成器
```

### Electron配置

编辑 `electron/main.js`：

```javascript
// 窗口大小
width: 1600,
height: 900,
minWidth: 1200,
minHeight: 700
```

## 🐛 故障排查

### 问题1：Python环境未找到

**解决方案**：

```bash
# 检查Python是否安装
python --version

# 手动创建虚拟环境
cd backend
python -m venv venv
```

### 问题2：后端启动失败

**检查项**：

1. API密钥是否配置
2. 端口8000是否被占用
3. 查看后端日志

```bash
# 查看端口占用
netstat -ano | findstr :8000

# 手动启动后端测试
cd backend
venv\Scripts\activate
python -m uvicorn main:app --reload
```

### 问题3：前端加载失败

**解决方案**：

```bash
# 重新安装前端依赖
cd frontend
npm install

# 清除缓存
npm run clean
```

### 问题4：打包失败

**常见原因**：

1. 未安装打包工具：`npm install electron-builder --save-dev`
2. 图标文件缺失：在 `build/` 目录添加 `icon.ico`
3. 权限不足：以管理员身份运行

## 📝 开发指南

### 修改前端代码

```bash
cd frontend/src
# 修改组件...
npm run dev
```

### 修改后端代码

```bash
cd backend
# 修改API...
# FastAPI会自动重载
```

### 修改Electron代码

```bash
cd electron
# 修改主进程...
# 需要重启应用才能看到效果
```

### 添加新功能

1. **前端**：在 `frontend/src/components/` 添加组件
2. **后端**：在 `backend/main.py` 添加API端点
3. **通信**：在 `electron/preload.js` 添加IPC接口

## 📚 技术栈

### 前端
- React 18
- TypeScript
- Vite
- Three.js
- Tailwind CSS

### 后端
- Python 3.8+
- FastAPI
- SQLModel
- SQLite

### 桌面应用
- Electron 28
- electron-builder

### AI服务
- DeepSeek API
- 腾讯混元3D

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

MIT License

## 🙏 致谢

- [Electron](https://www.electronjs.org/)
- [React](https://react.dev/)
- [FastAPI](https://fastapi.tiangolo.com/)
- [Three.js](https://threejs.org/)
- [DeepSeek](https://www.deepseek.com/)
- [腾讯混元3D](https://cloud.tencent.com/product/hunyuan3d)

---

**版本**：1.0.0  
**更新时间**：2026-03-21
