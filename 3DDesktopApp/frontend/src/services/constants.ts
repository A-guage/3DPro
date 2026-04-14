// API基础配置
// Desktop app: always use localhost:8000
// Web dev: use empty string (relative path via proxy)
const isElectron = typeof window !== 'undefined' && window.location.protocol === 'file:';
export const API_BASE_URL = isElectron ? 'http://localhost:8000' : (import.meta.env.VITE_API_URL || '');
export const APP_NAME = import.meta.env.VITE_APP_NAME || '3D Scene Generator';

// API端点
export const API_ENDPOINTS = {
  GENERATE_SCENE: '/api/generate-scene',
  SCENE_STATUS: (sceneId: string) => `/api/status/${sceneId}`,
  DOWNLOAD_SCENE: (sceneId: string) => `/api/download/${sceneId}`,
  HISTORY_LIST: (userId: string) => `/api/sessions?user_id=${encodeURIComponent(userId)}`,
  HISTORY_DETAIL: (sceneId: string) => `/api/sessions/${sceneId}`,
};

// 轮询配置
export const POLLING_CONFIG = {
  INTERVAL: 5000,
  MAX_RETRIES: 360,
  TIMEOUT: 1800000,
};

// 生成配置
export const GENERATION_CONFIG = {
  DEFAULT_QUALITY: 'medium' as const,
  DEFAULT_COMPLEXITY: 'medium' as const,
  MAX_DESCRIPTION_LENGTH: 500,
  ESTIMATED_TIME: {
    low: 30,
    medium: 60,
    high: 120,
  },
};

// 3D场景配置
export const SCENE_CONFIG = {
  BACKGROUND_COLOR: '#0f172a',
  ENVIRONMENT_PRESET: 'city',
  CAMERA_POSITION: [5, 5, 5] as [number, number, number],
  CAMERA_FOV: 60,
  CAMERA_NEAR: 0.1,
  CAMERA_FAR: 1000,
  LIGHTS: {
    AMBIENT: { intensity: 0.5 },
    DIRECTIONAL: { 
      intensity: 1, 
      position: [10, 10, 5] as [number, number, number],
      castShadow: true,
    },
  },
};

// UI配置
export const UI_CONFIG = {
  BREAKPOINTS: {
    MOBILE: 768,
    TABLET: 1024,
    DESKTOP: 1200,
  },
  ANIMATION_DURATION: 300,
  DEBOUNCE_DELAY: 300,
};

// 示例描述
export const EXAMPLE_DESCRIPTIONS = [
  "一个简约的现代客厅，有灰色沙发、玻璃茶几和木质电视柜",
  "阳光明媚的卧室，有一张双人床、床头柜和窗户",
  "现代化的厨房，有岛台、高脚椅和不锈钢电器",
  "游戏玩家的书房，有电竞椅、多显示器桌子和游戏主机",
  "带露台的花园，有户外家具、植物和小水池",
];

// 错误消息
export const ERROR_MESSAGES = {
  NETWORK_ERROR: '网络连接错误，请检查网络后重试',
  API_ERROR: '服务器错误，请稍后重试',
  GENERATION_FAILED: '场景生成失败，请尝试修改描述后重新生成',
  TIMEOUT_ERROR: '生成超时，请稍后重试',
  INVALID_DESCRIPTION: '请输入有效的场景描述',
  LOAD_FAILED: '3D模型加载失败，请重试',
};

// 本地存储键名
export const STORAGE_KEYS = {
  HISTORY: '3d-generator-history',
  PREFERENCES: '3d-generator-preferences',
  LAST_SCENE_ID: '3d-generator-last-scene-id',
  TUTORIAL_VIEWED: '3d-generator-tutorial-viewed',
};
