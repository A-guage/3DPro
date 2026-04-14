# 开发文档

## 项目概述

本项目是一个基于React + Three.js的3D场景生成器前端应用，与FastAPI后端对接，实现AI驱动的3D场景生成功能。

## 核心功能

1. **场景描述输入** - 用户输入自然语言描述
2. **参数选择** - 选择生成质量和复杂度
3. **3D模型预览** - 实时显示生成的3D场景
4. **模型下载** - 支持GLB格式下载
5. **响应式设计** - 适配多种设备

## 技术架构

### 前端技术栈

- **React 18** - 组件化UI框架
- **TypeScript** - 类型安全
- **Vite** - 快速构建工具
- **Three.js** - 3D图形渲染
- **@react-three/fiber** - React的Three.js渲染器
- **@react-three/drei** - Three.js辅助组件
- **Tailwind CSS** - 现代化样式框架
- **Axios** - HTTP客户端

### 项目结构

```
src/
├── components/          # React组件
│   ├── SceneViewer/    # 3D场景显示组件
│   ├── ControlPanel/   # 控制面板组件
│   ├── LoadingSpinner/ # 加载动画组件
│   └── ModelPreview/   # 模型预览组件
├── hooks/              # 自定义Hooks
│   ├── useSceneGenerator.ts  # 场景生成逻辑
│   ├── useGLBLoader.ts       # GLB加载Hook
│   └── usePolling.ts         # 轮询状态Hook
├── services/           # API服务
│   ├── api.ts         # API调用封装
│   └── constants.ts   # 常量定义
├── types/              # TypeScript类型定义
│   └── index.ts
├── utils/              # 工具函数
│   ├── threeHelpers.ts # Three.js工具函数
│   └── format.ts      # 格式化函数
├── App.tsx            # 主应用组件
├── App.css            # 应用样式
├── main.tsx           # 应用入口
└── index.css          # 全局样式
```

## 核心组件说明

### 1. SceneViewer组件

**功能**: 3D场景显示和交互

**特性**:
- 使用Three.js渲染3D模型
- 支持鼠标拖拽旋转、滚轮缩放
- 显示加载状态和错误信息
- 自动居中和缩放模型
- 环境光照和阴影效果

**状态管理**:
- 空状态：显示占位提示
- 加载中：显示进度条
- 加载完成：正常显示3D模型
- 加载失败：显示错误信息

### 2. ControlPanel组件

**功能**: 用户交互控制面板

**子组件**:
- **SceneInput**: 场景描述输入
- **GenerationParams**: 生成参数选择
- **ActionButtons**: 生成控制按钮
- **StatusDisplay**: 生成状态显示
- **HistoryPanel**: 历史记录

**交互功能**:
- 场景描述输入（支持示例快速填充）
- 生成质量选择（低/中/高）
- 场景复杂度选择（简单/中等/复杂）
- 生成/下载/重置按钮
- 实时状态显示

### 3. 自定义Hooks

#### useSceneGenerator

**功能**: 封装场景生成完整逻辑

**核心方法**:
- `generateScene()`: 开始生成场景
- `downloadScene()`: 下载生成的模型
- `reset()`: 重置应用状态
- 状态更新方法

**状态管理**:
- 用户输入状态
- 生成进度状态
- 错误处理
- 本地存储

#### useGLBLoader

**功能**: 3D模型加载管理

**特性**:
- 模型缓存
- 加载进度跟踪
- 错误处理
- 资源清理

#### usePolling

**功能**: 轮询状态查询

**特性**:
- 定时执行回调
- 条件停止
- 自动清理
- 错误处理

## API集成

### 服务端接口

1. **生成场景**
   ```typescript
   POST /api/generate-scene
   {
     description: string;
     quality: 'low' | 'medium' | 'high';
     complexity?: 'simple' | 'medium' | 'complex';
   }
   ```

2. **查询状态**
   ```typescript
   GET /api/status/{scene_id}
   ```

3. **下载模型**
   ```typescript
   GET /api/download/{scene_id}
   ```

### 错误处理

- 网络错误重试
- API错误提示
- 超时处理
- 状态回滚

## 状态管理

### 应用状态结构

```typescript
type AppState = {
  // 用户输入
  description: string;
  quality: 'low' | 'medium' | 'high';
  complexity: 'simple' | 'medium' | 'complex';
  
  // 生成状态
  status: 'idle' | 'generating' | 'polling' | 'loading' | 'ready' | 'error';
  sceneId: string | null;
  sceneUrl: string | null;
  progress: number;
  
  // 错误信息
  error: string | null;
  
  // 历史记录
  history: Array<SceneHistoryItem>;
};
```

### 状态持久化

- 用户偏好设置（质量、复杂度）
- 生成历史记录
- 最后生成的场景ID

## 响应式设计

### 断点设置

- **桌面端**: > 1024px
- **平板端**: 768px - 1024px
- **移动端**: < 768px

### 布局适配

1. **桌面端**: 左右布局，3:2比例
2. **平板端**: 上下布局
3. **移动端**: 3D全屏，控制面板可滚动

## 性能优化

### 3D渲染优化

- 模型自动缩放和居中
- 材质和纹理优化
- 光照和阴影控制
- 相机视角优化

### 资源管理

- 模型缓存机制
- 资源自动清理
- 图片懒加载
- API请求防抖

## 开发指南

### 环境搭建

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建生产版本
npm run build

# 预览构建结果
npm run preview
```

### 配置说明

编辑 `.env` 文件：

```env
VITE_API_URL=http://localhost:8000
VITE_APP_NAME=3D场景生成器
```

### 代码规范

- 使用TypeScript进行类型检查
- 遵循React Hooks最佳实践
- 组件模块化设计
- 统一的错误处理

## 部署指南

### 构建配置

Vite配置已优化：
- 代码分割
- 资源压缩
- 缓存策略

### 静态部署

构建后的文件位于 `dist` 目录，可部署到：
- Nginx
- Apache
- CDN
- 静态托管服务

### 生产优化

- 启用Gzip压缩
- 配置缓存策略
- 设置404重定向
- 启用HTTPS

## 测试建议

### 功能测试

1. **场景生成流程**
   - 输入描述文本
   - 选择参数
   - 点击生成
   - 查看进度
   - 预览3D模型
   - 下载模型

2. **错误处理**
   - 网络断开
   - API错误
   - 模型加载失败
   - 超时处理

3. **边界测试**
   - 空输入
   - 超长文本
   - 特殊字符
   - 并发请求

### 兼容性测试

- 不同浏览器
- 不同设备尺寸
- 不同网络环境
- WebGL支持检测

## 故障排除

### 常见问题

1. **3D模型不显示**
   - 检查WebGL支持
   - 验证模型URL
   - 查看控制台错误

2. **生成失败**
   - 检查网络连接
   - 验证API端点
   - 查看错误信息

3. **性能问题**
   - 检查模型复杂度
   - 优化光照设置
   - 降低渲染质量

## 扩展建议

### 功能扩展

1. **模型编辑** - 支持拖拽调整物体位置
2. **材质编辑** - 实时修改材质属性
3. **场景分享** - 生成分享链接
4. **历史管理** - 完整的场景历史记录

### 技术优化

1. **PWA支持** - 离线使用
2. **Web Workers** - 后台处理
3. **WebRTC** - 实时协作
4. **IndexedDB** - 本地存储优化

## 相关资源

- [React文档](https://react.dev/)
- [Three.js文档](https://threejs.org/docs/)
- [React Three Fiber文档](https://docs.pmnd.rs/react-three-fiber/)
- [Tailwind CSS文档](https://tailwindcss.com/docs)
- [Vite文档](https://vitejs.dev/)

## 贡献指南

1. 遵循TypeScript最佳实践
2. 保持组件模块化
3. 编写清晰的注释
4. 添加必要的测试
5. 更新相关文档

## 许可证

MIT License