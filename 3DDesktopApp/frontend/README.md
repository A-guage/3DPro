# 3D场景生成器前端

基于 React + Three.js 的 3D 场景生成器前端应用，与 FastAPI 后端对接，提供「状态驱动的任务控制台」与 3D 场景预览能力。

## ✨ 特性

- 🎨 **AI 驱动的 3D 场景生成** - 描述场景，AI 自动生成 3D 模型
- 🧭 **状态驱动的任务控制台** - 展示多阶段任务状态（规划 → 生成物体 → 合成 → 完成）
- 📊 **阶段进度与任务仪表盘** - 阶段进度条、整体进度百分比、当前阶段标签
- 📜 **事件日志流** - 按时间线记录每一步的系统事件与错误信息
- 🖼️ **实时 3D 预览** - 使用 Three.js 显示 3D 模型，支持交互操作
- 📚 **生成历史与一键恢复** - 左侧「最近生成」列表展示每次生成记录，点击即可恢复当时的场景与物体列表
- 🔁 **进度持久化** - 刷新页面后自动恢复上一次未完成的场景任务
- 💾 **模型下载** - 支持整场景 GLB 下载，后端同时暴露单物体下载接口
- 📱 **响应式设计** - 支持桌面端、平板端和移动端

## 🛠️ 技术栈

- **React 18** - 前端框架
- **TypeScript** - 类型系统
- **Vite** - 构建工具
- **Three.js** - 3D图形库
- **@react-three/fiber** - React的Three.js渲染器
- **@react-three/drei** - Three.js辅助组件
- **Tailwind CSS** - 样式框架
- **Axios** - HTTP客户端

## 📦 安装

```bash
# 克隆项目
git clone <repository-url>

# 进入项目目录
cd 3d-scene-generator-frontend

# 安装依赖
npm install

# 复制环境变量配置
cp .env.example .env
```

## 🚀 开发

```bash
# 启动开发服务器
npm run dev

# 访问应用
# http://localhost:5173
```

## 🔧 配置

编辑 `.env` 文件配置环境变量：

```env
# API基础URL
VITE_API_URL=http://localhost:8000

# 应用名称
VITE_APP_NAME=3D场景生成器
```

## 📁 项目结构

```
src/
├── components/          # React 组件
│   ├── SceneViewer/    # 3D 场景显示组件（整场景 / 单物体预览）
│   ├── ControlPanel/   # 状态驱动任务控制台（输入区、阶段进度条、任务仪表盘、事件日志、物体列表、最近生成）
│   ├── LoadingSpinner/ # 加载动画组件
│   └── ModelPreview/   # 模型预览组件
├── hooks/              # 自定义 Hooks
│   ├── useSceneGenerator.ts  # 场景生成逻辑（多阶段流程、事件日志、历史列表、本地进度恢复）
│   ├── useGLBLoader.ts       # GLB 加载 Hook
│   └── usePolling.ts         # 轮询状态 Hook
├── services/           # API 服务
│   ├── api.ts         # API 调用封装
│   └── constants.ts   # 常量定义
├── types/              # TypeScript 类型定义
│   └── index.ts
├── utils/              # 工具函数
│   ├── threeHelpers.ts # Three.js 工具函数
│   └── format.ts      # 格式化函数
├── App.tsx            # 主应用组件
├── App.css            # 应用样式
├── main.tsx           # 应用入口
└── index.css          # 全局样式
```

## 🎯 使用说明

1. **输入场景描述** - 在控制面板中描述您想要的3D场景
2. **选择生成参数** - 设置生成质量和场景复杂度
3. **生成3D场景** - 点击生成按钮，等待AI生成3D模型
4. **预览和交互** - 在3D预览区域查看整场景，或通过物体列表切换查看单个物体
5. **下载模型** - 点击下载按钮保存当前场景的 GLB 模型文件
6. **查看最近生成** - 在控制面板底部查看「最近生成」列表，最多展示最近几次任务
7. **一键恢复历史场景** - 点击某条历史记录，左侧 3D 场景和物体列表会恢复到当时的状态

## 🔌 API 接口

### 生成场景
```typescript
POST /api/generate-scene
// 请求体（前端会发送，后端主要关心 description、quality 和 user_id）
{
  description: string;
  quality: 'low' | 'medium' | 'high';
  complexity?: 'simple' | 'medium' | 'complex'; // 可选，前端使用
  user_id?: string; // 可选，后端用来把生成记录和账号绑定
}
```

### 查询场景状态
```typescript
GET /api/status/{scene_id}

// 典型响应（与后端 SceneStatusResponse 对齐）
{
  scene_id: string;
  status: 'processing' | 'ready' | 'failed';
  model_url?: string | null;
  progress?: number;
  error_message?: string | null;
  objects?: Array<{
    object_id: string;
    status: 'pending' | 'processing' | 'ready' | 'failed';
    model_url?: string | null;
  }>;
  current_object?: string | null;
}
```

### 下载整场景模型
```typescript
GET /api/download/{scene_id}
// 返回 Content-Type: model/gltf-binary 的 GLB 文件
```

### 下载单个物体模型
```typescript
GET /api/objects/{scene_id}/{object_id}
// 返回指定物体的 GLB 文件，用于单物体调试或预览
```

### 查询生成历史列表
```typescript
GET /api/history?user_id={userId}

// 响应类型（与后端 SceneHistoryItem 对齐）
type SceneHistoryItem = {
  scene_id: string;
  description: string;
  quality: string;
  status: string;
  model_url?: string | null;
  error_message?: string | null;
  created_at: string;
  updated_at: string;
};
```

### 查询单次生成详情
```typescript
GET /api/history/{scene_id}

// 响应类型（与后端 HistoryDetail 对齐）
type HistoryDetail = {
  scene: SceneHistoryItem;
  objects: Array<{
    object_id: string;
    status: string;
    model_url?: string | null;
  }>;
};
```

## 💾 进度与本地缓存

- 前端会在浏览器 localStorage 中保存最近一次场景任务的 sceneId、生成参数偏好和最近的历史列表摘要。
- 打开或刷新页面时，会根据本地保存的 sceneId 调用 `/api/status/{scene_id}` 恢复进度，并同步最新的物体列表与进度条状态。
- 历史列表数据来自后端的 `/api/history` 接口，前端会按当前 userId 查询；在未接入登录系统时，可以使用固定的 guest userId 进行开发调试。

## 📱 响应式设计

- **桌面端 (> 1024px)** - 左右布局，3:2比例
- **平板端 (768px-1024px)** - 上下布局
- **移动端 (< 768px)** - 3D全屏，控制面板可滚动

## 🎨 设计系统

- **主色调** - 深蓝色渐变 (#3a86ff → #8338ec)
- **背景色** - 深色主题 (#0f172a)
- **表面色** - 卡片背景 (#1e293b)
- **文字色** - 高对比度 (#f8fafc)

## 🚀 部署

```bash
# 构建生产版本
npm run build

# 预览构建结果
npm run preview
```

构建后的文件位于 `dist` 目录，可以部署到任何静态文件服务器。

## 🤝 贡献

欢迎提交Issue和Pull Request！

## 📄 许可证

MIT License

## 🙏 致谢

- [Three.js](https://threejs.org/) - 3D图形库
- [React Three Fiber](https://github.com/pmndrs/react-three-fiber) - React的Three.js渲染器
- [Tailwind CSS](https://tailwindcss.com/) - 样式框架
- [DeepSeek](https://deepseek.com/) - AI技术支持
- [腾讯混元3D](https://hunyuan.tencent.com/) - 3D生成技术支持
