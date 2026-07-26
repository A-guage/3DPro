import axios, { AxiosError, AxiosInstance } from 'axios';
import { 
  GenerateSceneRequest, 
  GenerateSceneResponse, 
  SceneStatusResponse,
  ApiError 
} from '@/types';
import { API_BASE_URL, API_ENDPOINTS, POLLING_CONFIG } from './constants';

// 创建axios实例
const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// 请求拦截器
apiClient.interceptors.request.use(
  (config) => {
    console.log(`API Request: ${config.method?.toUpperCase()} ${config.url}`);
    return config;
  },
  (error) => {
    console.error('API Request Error:', error);
    return Promise.reject(error);
  }
);

// 响应拦截器
apiClient.interceptors.response.use(
  (response) => {
    console.log(`API Response: ${response.status} ${response.config.url}`);
    return response;
  },
  (error: AxiosError) => {
    console.error('API Response Error:', error.response?.status, error.message);
    return Promise.reject(error);
  }
);

// API函数
export const api = {
  // 生成场景
  generateScene: async (data: GenerateSceneRequest): Promise<GenerateSceneResponse> => {
    try {
      const response = await apiClient.post<GenerateSceneResponse>(
        API_ENDPOINTS.GENERATE_SCENE,
        data
      );
      return response.data;
    } catch (error) {
      throw handleApiError(error);
    }
  },
  
  // 获取历史记录列表
  getHistoryList: async (userId: string) => {
    try {
      const response = await apiClient.get(API_ENDPOINTS.HISTORY_LIST(userId));
      return response.data;
    } catch (error) {
      throw handleApiError(error);
    }
  },
  
  // 获取单个场景的历史详情
  getHistoryDetail: async (sceneId: string) => {
    try {
      const response = await apiClient.get(API_ENDPOINTS.HISTORY_DETAIL(sceneId));
      return response.data;
    } catch (error) {
      throw handleApiError(error);
    }
  },
  
  // 查询场景状态
  getSceneStatus: async (sceneId: string): Promise<SceneStatusResponse> => {
    try {
      const response = await apiClient.get<SceneStatusResponse>(
        API_ENDPOINTS.SCENE_STATUS(sceneId)
      );
      return response.data;
    } catch (error) {
      throw handleApiError(error);
    }
  },
  
  // 下载GLB文件
  downloadScene: async (sceneId: string): Promise<Blob> => {
    try {
      const response = await apiClient.get<Blob>(
        API_ENDPOINTS.DOWNLOAD_SCENE(sceneId),
        {
          responseType: 'blob',
        }
      );
      return response.data;
    } catch (error) {
      throw handleApiError(error);
    }
  },
  
  // 轮询场景状态
  pollSceneStatus: async (
    sceneId: string,
    onProgress?: (status: SceneStatusResponse) => void
  ): Promise<SceneStatusResponse> => {
    let retries = 0;
    const maxRetries = POLLING_CONFIG.MAX_RETRIES;
    
    return new Promise((resolve, reject) => {
      const poll = async () => {
        try {
          const status = await api.getSceneStatus(sceneId);
          
          // 调用进度回调
          if (onProgress) {
            onProgress(status);
          }
          
          // 检查状态
          if (status.status === 'ready' && status.model_url) {
            resolve(status);
            return;
          }
          
          if (status.status === 'failed') {
            reject(new Error(status.error_message || '场景生成失败'));
            return;
          }
          
          // 继续轮询
          retries++;
          if (retries >= maxRetries) {
            reject(new Error('轮询超时，请稍后重试'));
            return;
          }
          
          setTimeout(poll, POLLING_CONFIG.INTERVAL);
        } catch (error) {
          reject(error);
        }
      };
      
      // 开始第一次轮询
      poll();
    });
  },
};

// 错误处理函数
function handleApiError(error: any): ApiError {
  if (error.isAxiosError) {
    const axiosError = error as AxiosError;
    
    if (!axiosError.response) {
      // 网络错误
      return {
        message: '无法连接到服务器。请确保后端服务（端口 8000）已启动并可访问。',
        code: 'NETWORK_ERROR',
      };
    }
    
    const status = axiosError.response.status;
    const data = axiosError.response.data as any;
    
    switch (status) {
      case 400:
        return {
          message: data?.detail || '请求参数错误',
          code: 'BAD_REQUEST',
          status,
        };
      case 404:
        return {
          message: '请求的资源不存在',
          code: 'NOT_FOUND',
          status,
        };
      case 429:
        return {
          message: '请求过于频繁，请稍后重试',
          code: 'RATE_LIMIT',
          status,
        };
      case 500:
      case 502:
      case 503:
        return {
          message: '服务器错误，请稍后重试',
          code: 'SERVER_ERROR',
          status,
        };
      default:
        return {
          message: data?.detail || '发生未知错误',
          code: 'UNKNOWN_ERROR',
          status,
        };
    }
  }
  
  return {
    message: '发生未知错误',
    code: 'UNKNOWN_ERROR',
  };
}
