// 场景生成请求类型
export interface GenerateSceneRequest {
  description: string;
  quality: 'low' | 'medium' | 'high';
  complexity?: 'simple' | 'medium' | 'complex';
  user_id?: string | null;
}

// 场景生成响应类型
export interface GenerateSceneResponse {
  scene_id: string;
  status: string;
  estimated_time: number;
}

// 场景状态响应类型
export interface SceneStatusResponse {
  scene_id: string;
  status: 'processing' | 'ready' | 'failed';
  model_url?: string;
  error_message?: string;
  progress?: number;
  objects?: Array<{
    object_id: string;
    status: 'pending' | 'processing' | 'ready' | 'failed';
    model_url?: string | null;
  }>;
  current_object?: string | null;
}

export type ScenePhase = 'planning' | 'generating_objects' | 'composing' | 'ready' | 'failed';

export interface SceneObjectInfo {
  objectId: string;
  status: 'pending' | 'processing' | 'ready' | 'failed';
  modelUrl?: string | null;
}

// AI 推荐的物品类型
export interface RecommendedObject {
  id: string;
  name: string;
  description: string;
  estimatedSize?: {
    x: number;
    y: number;
    z: number;
  };
  priority: number;
  status: 'pending' | 'generating' | 'ready' | 'failed';
  modelUrl?: string | null;
  category?: 'furniture' | 'building' | 'nature' | 'prop' | 'character';
  tags?: string[];
}

export interface SceneEvent {
  id: string;
  type: 'info' | 'error';
  message: string;
  timestamp: string;
}

export type AppState = {
  // 用户输入
  description: string;
  quality: 'low' | 'medium' | 'high';
  complexity: 'simple' | 'medium' | 'complex';
  
  // 生成状态
  status: 'idle' | 'generating' | 'polling' | 'loading' | 'ready' | 'error';
  sceneId: string | null;
  sceneUrl: string | null;
  progress: number; // 0-100
  
  // 错误信息
  error: string | null;
  sceneStatus: ScenePhase;
  currentStageLabel: string;
  objects: SceneObjectInfo[];
  events: SceneEvent[];
  
  // 历史记录
  history: Array<{
    id: string;
    description: string;
    timestamp: Date;
    sceneUrl?: string;
  }>;
};

// 场景查看器属性
export interface SceneViewerProps {
  sceneUrl?: string | null;
  isLoading?: boolean;
  error?: string | null;
  onLoad?: () => void;
  onError?: (error: string) => void;
}

// 控制面板属性
export interface ControlPanelProps {
  description: string;
  quality: 'low' | 'medium' | 'high';
  complexity: 'simple' | 'medium' | 'complex';
  isGenerating: boolean;
  status: AppState['status'];
  progress: number;
  sceneId: string | null;
  sceneUrl: string | null;
  error: string | null;
  sceneStatus: ScenePhase;
  currentStageLabel: string;
  objects: SceneObjectInfo[];
  events: SceneEvent[];
  history: AppState['history'];
  onDescriptionChange: (description: string) => void;
  onQualityChange: (quality: 'low' | 'medium' | 'high') => void;
  onComplexityChange: (complexity: 'simple' | 'medium' | 'complex') => void;
  onSelectObject: (object: SceneObjectInfo) => void;
  onViewScene: () => void;
  onSelectHistory: (sceneId: string) => void;
  onGenerate: () => void;
  onDownload: () => void;
  onReset: () => void;
  onRetry: () => void;
  onImportToEngine?: () => void;
  onImportToUnity?: () => void; // 兼容旧名称
}

// 加载动画组件属性
export interface LoadingSpinnerProps {
  size?: 'small' | 'medium' | 'large';
  type?: 'spinner' | 'progress' | 'pulse' | 'dots';
  color?: string;
  text?: string;
  progress?: number;
}

// 3D模型加载Hook返回类型
export interface UseGLBLoaderReturn {
  model: any;
  loading: boolean;
  error: string | null;
  progress: number;
  loadModel: (url: string) => Promise<void>;
  clearModel: () => void;
}

// 场景生成Hook返回类型
export interface UseSceneGeneratorReturn {
  state: AppState;
  generateScene: (description: string, quality: string, complexity: string) => Promise<void>;
  downloadScene: () => Promise<void>;
  reset: () => void;
  updateDescription: (description: string) => void;
  updateQuality: (quality: 'low' | 'medium' | 'high') => void;
  updateComplexity: (complexity: 'simple' | 'medium' | 'complex') => void;
  restoreFromHistory: (sceneId: string) => Promise<void>;
}

// API错误类型
export interface ApiError {
  message: string;
  code?: string;
  status?: number;
}

// 本地存储数据类型
export interface LocalStorageData {
  history: AppState['history'];
  preferences: {
    quality: 'low' | 'medium' | 'high';
    complexity: 'simple' | 'medium' | 'complex';
  };
  lastSceneId?: string;
  tutorialViewed: boolean;
}
