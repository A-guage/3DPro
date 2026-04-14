import { useState, useCallback, useEffect } from 'react';
import { 
  AppState, 
  UseSceneGeneratorReturn,
  GenerateSceneRequest,
  GenerateSceneResponse,
  SceneStatusResponse,
  ScenePhase,
  SceneEvent,
  SceneObjectInfo,
} from '@/types';
import { api } from '@/services/api';
import { 
  GENERATION_CONFIG, 
  ERROR_MESSAGES,
  STORAGE_KEYS,
  POLLING_CONFIG 
} from '@/services/constants';

// 本地存储工具函数
const loadFromStorage = <T,>(key: string, defaultValue: T): T => {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : defaultValue;
  } catch {
    return defaultValue;
  }
};

const saveToStorage = <T,>(key: string, value: T): void => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn('Failed to save to localStorage:', error);
  }
};

/**
 * 场景生成逻辑Hook
 * 功能：
 * 1. 封装场景生成逻辑
 * 2. 处理轮询状态查询
 * 3. 管理生成状态
 * 4. 错误处理
 * 5. 进度更新
 */
const createEvent = (message: string, type: SceneEvent['type'] = 'info'): SceneEvent => {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    type,
    message,
    timestamp: new Date().toISOString(),
  };
};

const deriveScenePhase = (apiStatus: SceneStatusResponse['status'], progress: number): ScenePhase => {
  if (apiStatus === 'failed') {
    return 'failed';
  }
  if (apiStatus === 'ready') {
    return 'ready';
  }
  if (progress < 20) {
    return 'planning';
  }
  if (progress < 90) {
    return 'generating_objects';
  }
  return 'composing';
};

const getPhaseLabel = (phase: ScenePhase): string => {
  if (phase === 'planning') return '规划场景';
  if (phase === 'generating_objects') return '生成物体';
  if (phase === 'composing') return '合成场景';
  if (phase === 'ready') return '生成完成';
  if (phase === 'failed') return '生成失败';
  return '';
};

export const useSceneGenerator = (): UseSceneGeneratorReturn => {
  // 从本地存储加载初始状态
  const preferences = loadFromStorage(STORAGE_KEYS.PREFERENCES, {
    quality: GENERATION_CONFIG.DEFAULT_QUALITY,
    complexity: GENERATION_CONFIG.DEFAULT_COMPLEXITY,
  });
  
  const history = loadFromStorage(STORAGE_KEYS.HISTORY, []);
  const lastSceneId = loadFromStorage(STORAGE_KEYS.LAST_SCENE_ID, null);
  const userId = loadFromStorage<string | null>(STORAGE_KEYS.LAST_SCENE_ID + '-user', 'guest');
  
  const [state, setState] = useState<AppState>({
    description: '',
    quality: preferences.quality,
    complexity: preferences.complexity,
    status: 'idle',
    sceneId: lastSceneId,
    sceneUrl: null,
    progress: 0,
    error: null,
    history,
    sceneStatus: 'planning',
    currentStageLabel: '',
    objects: [],
    events: [],
  });
  
  // 刷新后尝试恢复上一次场景进度
  useEffect(() => {
    if (!lastSceneId) {
      return;
    }
    let cancelled = false;
    const restore = async () => {
      try {
        const status = await api.getSceneStatus(lastSceneId);
        if (cancelled) {
          return;
        }
        setState(prev => {
          const apiProgress = typeof status.progress === 'number' ? status.progress : prev.progress;
          const phase = deriveScenePhase(status.status, apiProgress);
          const label = getPhaseLabel(phase);
          const objects = (status.objects || []).map(obj => ({
            objectId: obj.object_id,
            status: obj.status,
            modelUrl: obj.model_url ?? null,
          }));
          return {
            ...prev,
            sceneId: lastSceneId,
            status: status.status === 'failed' ? 'error' : status.status === 'ready' ? 'ready' : 'polling',
            progress: apiProgress,
            sceneUrl: status.model_url || null,
            sceneStatus: phase,
            currentStageLabel: label,
            error: status.status === 'failed' ? (status.error_message || ERROR_MESSAGES.GENERATION_FAILED) : null,
            objects,
            events: prev.events.length
              ? prev.events
              : [...prev.events, createEvent('已从上次的场景任务恢复进度')],
          };
        });
      } catch (error: any) {
        console.error('Failed to restore scene status:', error);
        try {
          if (error && typeof error === 'object' && 'code' in error && (error as any).code === 'NOT_FOUND') {
            saveToStorage(STORAGE_KEYS.LAST_SCENE_ID, null);
            setState(prev => ({
              ...prev,
              sceneId: null,
              sceneUrl: null,
              status: 'idle',
            }));
          }
        } catch {
          // ignore
        }
      }
    };
    restore();
    return () => {
      cancelled = true;
    };
  }, []);
  
  // 保存状态到本地存储
  useEffect(() => {
    saveToStorage(STORAGE_KEYS.PREFERENCES, {
      quality: state.quality,
      complexity: state.complexity,
    });
  }, [state.quality, state.complexity]);
  
  useEffect(() => {
    saveToStorage(STORAGE_KEYS.HISTORY, state.history);
  }, [state.history]);
  
  useEffect(() => {
    if (state.sceneId) {
      saveToStorage(STORAGE_KEYS.LAST_SCENE_ID, state.sceneId);
    }
  }, [state.sceneId]);

  const restoreFromHistory = useCallback(async (sceneId: string) => {
    try {
      const detail = await api.getHistoryDetail(sceneId);
      const scene = (detail as any).scene;
      const objectsFromHistory = ((detail as any).objects || []).map((obj: any) => ({
        objectId: obj.object_id,
        status: obj.status as SceneObjectInfo['status'],
        modelUrl: null,
      }));
      setState(prev => ({
        ...prev,
        sceneId: scene.scene_id,
        description: scene.description,
        quality: (scene.quality as 'low' | 'medium' | 'high') || prev.quality,
        status: 'ready',
        progress: 100,
        sceneUrl: scene.model_url || null,
        sceneStatus: 'ready',
        currentStageLabel: getPhaseLabel('ready'),
        error: null,
        objects: objectsFromHistory,
        events: [
          ...prev.events,
          createEvent(`已从历史记录恢复场景：${scene.description}`),
        ],
      }));
      saveToStorage(STORAGE_KEYS.LAST_SCENE_ID, sceneId);
    } catch (error) {
      console.error('Failed to restore scene from history:', error);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const fetchHistory = async () => {
      try {
        const uid = userId || 'default_user';
        const list = await api.getHistoryList(uid);
        if (cancelled) {
          return;
        }
        const mapped = (list || []).map((item: any) => ({
          id: item.session_id,
          description: item.title,
          timestamp: new Date(item.created_at),
          sceneUrl: undefined,
        }));
        setState(prev => ({
          ...prev,
          history: mapped,
        }));
      } catch (error) {
        console.error('Failed to load history from server:', error);
      }
    };
    fetchHistory();
    return () => {
      cancelled = true;
    };
  }, [userId]);
  
  /**
   * 更新场景描述
   */
  const updateDescription = useCallback((description: string) => {
    setState(prev => ({ ...prev, description: description.slice(0, GENERATION_CONFIG.MAX_DESCRIPTION_LENGTH) }));
  }, []);
  
  /**
   * 更新生成质量
   */
  const updateQuality = useCallback((quality: 'low' | 'medium' | 'high') => {
    setState(prev => ({ ...prev, quality }));
  }, []);
  
  /**
   * 更新场景复杂度
   */
  const updateComplexity = useCallback((complexity: 'simple' | 'medium' | 'complex') => {
    setState(prev => ({ ...prev, complexity }));
  }, []);
  
  /**
   * 生成场景
   */
  const generateScene = useCallback(async (
    description: string,
    quality: string,
    complexity: string
  ) => {
    // 验证输入
    if (!description.trim()) {
      setState(prev => ({ 
        ...prev, 
        error: ERROR_MESSAGES.INVALID_DESCRIPTION,
        status: 'error'
      }));
      return;
    }
    
    // 更新状态
    setState(prev => {
      const nextEvents = [...prev.events, createEvent('开始生成场景任务')];
      return {
        ...prev,
        description,
        quality: quality as 'low' | 'medium' | 'high',
        complexity: complexity as 'simple' | 'medium' | 'complex',
        status: 'generating',
        progress: 10,
        error: null,
        sceneStatus: 'planning',
        currentStageLabel: getPhaseLabel('planning'),
        events: nextEvents,
        objects: [],
      };
    });
    
    try {
      // 准备请求数据
        const requestData: GenerateSceneRequest = {
        description: description.trim(),
        quality: quality as 'low' | 'medium' | 'high',
        complexity: complexity as 'simple' | 'medium' | 'complex',
          user_id: userId || 'guest',
      };
      
      console.log('Generating scene with data:', requestData);
      
      const response: GenerateSceneResponse = await api.generateScene(requestData);
      
      console.log('Scene generation started:', response);
      
      setState(prev => {
        const nextEvents = [...prev.events, createEvent('场景任务已创建，开始查询生成进度')];
        return {
          ...prev,
          sceneId: response.scene_id,
          status: 'polling',
          progress: 20,
          sceneStatus: 'planning',
          currentStageLabel: getPhaseLabel('planning'),
          events: nextEvents,
        };
      });
      
      const maxPollingTime = POLLING_CONFIG.TIMEOUT;
      const startTime = Date.now();
      
      let status: SceneStatusResponse;
      while (true) {
        // 检查超时
        if (Date.now() - startTime > maxPollingTime) {
          throw new Error(ERROR_MESSAGES.TIMEOUT_ERROR);
        }
        
        status = await api.getSceneStatus(response.scene_id);
        if (status.status === 'processing') {
          setState(prev => {
            const apiProgress = typeof status.progress === 'number' ? status.progress : prev.progress;
            const phase = deriveScenePhase(status.status, apiProgress);
            const label = getPhaseLabel(phase);
            let events = prev.events;
            if (phase !== prev.sceneStatus) {
              events = [...events, createEvent(`进入阶段：${label}`)];
            }
            const objects = (status.objects || []).map(obj => ({
              objectId: obj.object_id,
              status: obj.status,
              modelUrl: obj.model_url ?? null,
            }));
            return {
              ...prev,
              progress: apiProgress,
              sceneStatus: phase,
              currentStageLabel: label,
              objects,
              events,
            };
          });
          await new Promise(resolve => setTimeout(resolve, 5000));
        } else {
          break;
        }
      }
      
      console.log('Scene generation completed:', status);
      
      setState(prev => {
        const objects = (status.objects || []).map(obj => ({
          objectId: obj.object_id,
          status: obj.status,
          modelUrl: obj.model_url ?? null,
        }));
        return {
          ...prev,
          status: status.status === 'failed' ? 'error' : 'loading',
          progress: status.status === 'failed' ? prev.progress : 95,
          sceneUrl: status.model_url || null,
          sceneStatus: deriveScenePhase(status.status, status.progress ?? prev.progress),
          currentStageLabel: getPhaseLabel(deriveScenePhase(status.status, status.progress ?? prev.progress)),
          error: status.status === 'failed' ? (status.error_message || ERROR_MESSAGES.GENERATION_FAILED) : null,
          objects,
          events: status.status === 'failed'
            ? [...prev.events, createEvent(status.error_message || ERROR_MESSAGES.GENERATION_FAILED, 'error')]
            : [...prev.events, createEvent('生成完成，开始加载3D模型')],
        };
      });
      
      setState(prev => {
        const newHistoryItem = {
          id: response.scene_id,
          description: description.trim(),
          timestamp: new Date(),
          sceneUrl: status.model_url,
        };
        
        const updatedHistory = [newHistoryItem, ...prev.history]
          .slice(0, 5); // 只保留最近5个
        
        const baseState = {
          ...prev,
          history: updatedHistory,
        };
        if (prev.status === 'error') {
          return baseState;
        }
        const phase = 'ready' as ScenePhase;
        const label = getPhaseLabel(phase);
        const events = [...baseState.events, createEvent('3D模型加载完成')];
        return {
          ...baseState,
          status: 'ready',
          progress: 100,
          sceneStatus: phase,
          currentStageLabel: label,
          events,
        };
      });
      
    } catch (error) {
      console.error('Scene generation failed:', error);
      
      const errorMessage = error instanceof Error 
        ? error.message 
        : ERROR_MESSAGES.GENERATION_FAILED;
      
      setState(prev => ({
        ...prev,
        error: errorMessage,
        status: 'error',
        progress: 0,
      }));
    }
  }, []);
  
  /**
   * 下载场景
   */
  const downloadScene = useCallback(async () => {
    if (!state.sceneId) {
      console.error('No scene ID available for download');
      return;
    }
    
    try {
      const blob = await api.downloadScene(state.sceneId);
      
      // 创建下载链接
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = `scene-${state.sceneId}.glb`;
      
      document.body.appendChild(a);
      a.click();
      
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      console.log('Scene downloaded successfully:', state.sceneId);
    } catch (error) {
      console.error('Failed to download scene:', error);
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : '下载失败',
      }));
    }
  }, [state.sceneId]);
  
  /**
   * 重置状态
   */
  const reset = useCallback(() => {
    setState({
      description: '',
      quality: preferences.quality,
      complexity: preferences.complexity,
      status: 'idle',
      sceneId: null,
      sceneUrl: null,
      progress: 0,
      error: null,
      history: state.history,
      sceneStatus: 'planning',
      currentStageLabel: '',
      objects: [],
      events: [],
    });
  }, [preferences.quality, preferences.complexity, state.history]);
  
  return {
    state,
    generateScene,
    downloadScene,
    reset,
    updateDescription,
    updateQuality,
    updateComplexity,
    restoreFromHistory,
  };
};
