import { useEffect, useRef, useCallback } from 'react';

/**
 * 轮询Hook
 * 功能：
 * 1. 定时执行回调函数
 * 2. 支持条件停止
 * 3. 清理定时器
 * 4. 错误处理
 */
export interface UsePollingOptions {
  interval?: number; // 轮询间隔（毫秒）
  maxRetries?: number; // 最大重试次数
  enabled?: boolean; // 是否启用
  onError?: (error: Error) => void; // 错误回调
}

export const usePolling = (
  callback: () => Promise<boolean>, // 返回true继续轮询，false停止
  options: UsePollingOptions = {}
) => {
  const {
    interval = 5000,
    maxRetries = Infinity,
    enabled = true,
    onError,
  } = options;
  
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const retryCountRef = useRef(0);
  const isPollingRef = useRef(false);
  
  /**
   * 停止轮询
   */
  const stop = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    isPollingRef.current = false;
    retryCountRef.current = 0;
  }, []);
  
  /**
   * 开始轮询
   */
  const start = useCallback(async () => {
    if (!enabled || isPollingRef.current) {
      return;
    }
    
    isPollingRef.current = true;
    retryCountRef.current = 0;
    
    const poll = async () => {
      if (!isPollingRef.current) {
        return;
      }
      
      try {
        const shouldContinue = await callback();
        
        if (!shouldContinue) {
          stop();
          return;
        }
        
        retryCountRef.current++;
        
        // 检查是否达到最大重试次数
        if (retryCountRef.current >= maxRetries) {
          stop();
          if (onError) {
            onError(new Error('达到最大重试次数'));
          }
          return;
        }
        
        // 设置下一次轮询
        if (isPollingRef.current) {
          intervalRef.current = setTimeout(poll, interval);
        }
        
      } catch (error) {
        console.error('Polling error:', error);
        
        retryCountRef.current++;
        
        if (retryCountRef.current >= maxRetries) {
          stop();
          if (onError) {
            onError(error instanceof Error ? error : new Error('轮询错误'));
          }
          return;
        }
        
        // 发生错误后继续轮询
        if (isPollingRef.current) {
          intervalRef.current = setTimeout(poll, interval);
        }
      }
    };
    
    // 立即执行一次
    poll();
    
  }, [callback, interval, maxRetries, enabled, onError, stop]);
  
  /**
   * 重置轮询
   */
  const reset = useCallback(() => {
    stop();
    retryCountRef.current = 0;
  }, [stop]);
  
  // 组件卸载时清理
  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);
  
  // 监听enabled变化
  useEffect(() => {
    if (!enabled) {
      stop();
    } else {
      start();
    }
  }, [enabled, start, stop]);
  
  return {
    start,
    stop,
    reset,
    isPolling: isPollingRef.current,
    retryCount: retryCountRef.current,
  };
};